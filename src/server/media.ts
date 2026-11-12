import { randomBytes } from 'node:crypto';
import { createWriteStream, createReadStream } from 'node:fs';
import { mkdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import sharp from 'sharp';
import { config } from './config.ts';

export class UploadError extends Error {}

export type MediaKind = 'images' | 'thumbs' | 'videos';
// 檔名一律是伺服器產生的 32 位十六進位隨機字串，所以可用此規則擋掉路徑穿越
export const FILE_RE = /^[a-f0-9]{32}\.(webp|mp4|webm)$/;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const VIDEO_TYPES = new Set(['video/mp4', 'video/webm']);

export const mediaDir = (kind: MediaKind) => join(config().dataDir, 'uploads', kind);
export function mediaPath(kind: MediaKind, file: string) {
  if (!FILE_RE.test(file)) throw new UploadError('檔名不合法');
  return join(mediaDir(kind), file);
}
const newId = () => randomBytes(16).toString('hex');

/**
 * 處理圖片：檢查類型與大小 → 用 sharp 解碼（真的是圖片才會成功）→
 * 依 EXIF 轉正後重新編碼成 WebP（同時移除 EXIF/GPS 等中繼資料）→ 產生縮圖。
 */
export async function saveImage(file: File): Promise<{ image: string; thumb: string }> {
  const max = config().maxImageBytes;
  // iPhone／部分 Android 相簿的 HEIC 照片（有些瀏覽器不給類型，只能看副檔名）
  const untyped = !file.type || file.type === 'application/octet-stream';
  if (/^image\/hei[cf]/.test(file.type) || (untyped && /\.hei[cf]$/i.test(file.name))) {
    throw new UploadError('不支援 HEIC 格式：請把手機相機格式改成「最相容」（JPG），或先轉成 JPG 再上傳');
  }
  if (!IMAGE_TYPES.has(file.type)) throw new UploadError('圖片只接受 JPG、PNG、WebP');
  if (file.size === 0) throw new UploadError('圖片檔案是空的');
  if (file.size > max) throw new UploadError(`圖片不可超過 ${Math.round(max / 1048576)} MB`);
  const input = Buffer.from(await file.arrayBuffer());
  let meta;
  try {
    meta = await sharp(input, { limitInputPixels: 100_000_000 }).metadata();
  } catch {
    throw new UploadError('無法讀取這個圖片，請確認檔案沒有損壞');
  }
  if (!meta.format || !['jpeg', 'png', 'webp'].includes(meta.format)) throw new UploadError('圖片只接受 JPG、PNG、WebP');
  const id = newId();
  const name = `${id}.webp`;
  await mkdir(mediaDir('images'), { recursive: true });
  await mkdir(mediaDir('thumbs'), { recursive: true });
  const base = () => sharp(input, { limitInputPixels: 100_000_000 }).rotate(); // 不呼叫 withMetadata → 不保留 EXIF
  await base().resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toFile(mediaPath('images', name));
  await base().resize({ width: 640, height: 640, fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toFile(mediaPath('thumbs', name));
  return { image: name, thumb: name };
}

/** 影片：檢查大小、宣告類型與檔頭（mp4 的 ftyp / webm 的 EBML），以串流寫入磁碟。 */
export async function saveVideo(file: File): Promise<string> {
  const max = config().maxVideoBytes;
  if (!VIDEO_TYPES.has(file.type)) throw new UploadError('影片只接受 MP4 或 WebM');
  if (file.size === 0) throw new UploadError('影片檔案是空的');
  if (file.size > max) throw new UploadError(`影片不可超過 ${Math.round(max / 1048576)} MB，較大的影片請改用 YouTube 不公開連結`);
  const head = Buffer.from(await file.slice(0, 12).arrayBuffer());
  const isMp4 = head.subarray(4, 8).toString('latin1') === 'ftyp';
  const isWebm = head.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  if (!(isMp4 && file.type === 'video/mp4') && !(isWebm && file.type === 'video/webm')) {
    throw new UploadError('影片內容與副檔名／類型不符，只接受真正的 MP4 或 WebM');
  }
  const name = `${newId()}.${isMp4 ? 'mp4' : 'webm'}`;
  await mkdir(mediaDir('videos'), { recursive: true });
  const dest = mediaPath('videos', name);
  try {
    await pipeline(Readable.fromWeb(file.stream() as any), createWriteStream(dest));
  } catch (e) {
    await rm(dest, { force: true });
    throw e;
  }
  return name;
}

export async function removeFiles(files: { image?: string | null; thumb?: string | null; video?: string | null }) {
  const jobs: Promise<void>[] = [];
  if (files.image) jobs.push(rm(mediaPath('images', files.image), { force: true }));
  if (files.thumb) jobs.push(rm(mediaPath('thumbs', files.thumb), { force: true }));
  if (files.video) jobs.push(rm(mediaPath('videos', files.video), { force: true }));
  await Promise.all(jobs);
}

/** 從 YouTube 網址或 11 碼 ID 取出影片 ID；格式不對回傳 null。 */
export function parseYouTubeId(input: string): string | null {
  const s = input.trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  try {
    const u = new URL(s);
    const host = u.hostname.replace(/^www\.|^m\./, '');
    let id: string | null = null;
    if (host === 'youtu.be') id = u.pathname.split('/')[1] ?? null;
    else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      id = u.searchParams.get('v') ?? u.pathname.match(/^\/(?:embed|shorts|live)\/([\w-]+)/)?.[1] ?? null;
    }
    return id && /^[\w-]{11}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

/** 支援 Range 的檔案回應（影片拖曳進度條需要）。 */
export async function serveFile(request: Request, path: string, contentType: string, cacheControl: string): Promise<Response> {
  let size: number;
  try {
    size = (await stat(path)).size;
  } catch {
    return new Response('Not found', { status: 404 });
  }
  const headers: Record<string, string> = {
    'Content-Type': contentType,
    'Cache-Control': cacheControl,
    'Accept-Ranges': 'bytes',
    'X-Content-Type-Options': 'nosniff',
  };
  const range = request.headers.get('range')?.match(/^bytes=(\d*)-(\d*)$/);
  if (range && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : size - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : size - 1;
    start = Math.max(0, start);
    end = Math.min(end, size - 1);
    if (start > end || start >= size) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
    return new Response(Readable.toWeb(createReadStream(path, { start, end })) as any, {
      status: 206,
      headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1) },
    });
  }
  return new Response(Readable.toWeb(createReadStream(path)) as any, { headers: { ...headers, 'Content-Length': String(size) } });
}
