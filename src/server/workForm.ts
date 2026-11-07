import type { User } from './auth.ts';
import { config } from './config.ts';
import { removeFiles, saveImage, saveVideo, UploadError } from './media.ts';
import { createWork, parseWorkForm, updateWork, ValidationError, type Work, type WorkFiles } from './works.ts';

const isFile = (v: FormDataEntryValue | null): v is File => v instanceof File && v.size > 0;

/** 先看 Content-Length，過大直接拒絕，不把整個請求讀進記憶體。 */
export function bodyTooLarge(request: Request) {
  const len = Number(request.headers.get('content-length') ?? 0);
  const c = config();
  return len > Math.max(c.maxVideoBytes, c.maxImageBytes) + 2 * 1024 * 1024;
}

/**
 * 處理「新增／編輯作品」表單：驗證 → 儲存檔案 → 寫資料庫。
 * 失敗時會把這次剛存的檔案清掉，不留孤兒檔。
 */
export async function submitWork(actor: User, form: FormData, existing?: Work): Promise<{ work?: Work; errors: string[] }> {
  const { input, errors } = parseWorkForm(form);
  const saved: WorkFiles = {};
  const cleanup = () => removeFiles(saved).catch(() => {});
  try {
    const img = form.get('image');
    if (isFile(img)) {
      const r = await saveImage(img);
      saved.image = r.image;
      saved.thumb = r.thumb;
    }
    const vid = form.get('video');
    if (input.videoMode === 'file') {
      if (isFile(vid)) saved.video = await saveVideo(vid);
      else if (!existing?.videoFile) errors.push('請選擇要上傳的影片檔');
    }
  } catch (e) {
    await cleanup();
    if (e instanceof UploadError) return { errors: [...errors, e.message] };
    throw e;
  }
  if (errors.length) {
    await cleanup();
    return { errors };
  }
  try {
    if (existing) {
      const { work, obsolete } = updateWork(actor, existing.id, input, saved);
      await removeFiles(obsolete).catch(() => {});
      return { work, errors: [] };
    }
    return { work: createWork(actor, input, saved), errors: [] };
  } catch (e) {
    await cleanup();
    if (e instanceof ValidationError) return { errors: e.errors };
    throw e;
  }
}
