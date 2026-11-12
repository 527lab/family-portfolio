import { getDb } from './db.ts';
import type { User } from './auth.ts';
import { parseYouTubeId } from './media.ts';

export const categories = ['painting', 'photography', 'piano', 'certificate'] as const;
export type Category = (typeof categories)[number];
export const categoryLabels: Record<Category, string> = {
  painting: '畫作',
  photography: '攝影',
  piano: '鋼琴演奏',
  certificate: '檢定證書',
};

export interface Work {
  id: number;
  ownerId: number;
  ownerName: string;
  category: Category;
  title: string;
  summary: string;
  description: string;
  date: string;
  status: 'draft' | 'published';
  featured: boolean;
  sortOrder: number;
  alt: string;
  medium: string;
  size: string;
  location: string;
  camera: string;
  composer: string;
  event: string;
  result: string;
  imageFile: string | null;
  thumbFile: string | null;
  videoFile: string | null;
  youtubeId: string | null;
}

export class ForbiddenError extends Error {}
export class ValidationError extends Error {
  errors: string[];
  constructor(errors: string[]) {
    super(errors.join('；'));
    this.errors = errors;
  }
}

const SELECT = `SELECT w.*, u.display_name AS owner_name FROM works w JOIN users u ON u.id = w.owner_id`;
// 精選作品固定在最上面；精選之間、一般作品之間各自依後台 ↑↓ 的排序
const ORDER = `ORDER BY w.featured DESC, w.sort_order ASC, w.date DESC, w.id DESC`;

const toWork = (r: any): Work => ({
  id: r.id, ownerId: r.owner_id, ownerName: r.owner_name, category: r.category, title: r.title,
  summary: r.summary, description: r.description, date: r.date, status: r.status, featured: !!r.featured,
  sortOrder: r.sort_order, alt: r.alt, medium: r.medium, size: r.size, location: r.location, camera: r.camera,
  composer: r.composer, event: r.event, result: r.result, imageFile: r.image_file, thumbFile: r.thumb_file,
  videoFile: r.video_file, youtubeId: r.youtube_id,
});

// ---------- 權限：創作者只能動自己的作品；管理員可動全部 ----------
export const canManage = (user: User | null | undefined, work: Work) =>
  !!user && user.status === 'active' && (user.role === 'admin' || user.id === work.ownerId);

export function assertCanManage(user: User | null | undefined, work: Work | null): asserts work is Work {
  if (!work || !canManage(user, work)) throw new ForbiddenError('沒有權限');
}

// ---------- 查詢 ----------
export function getWork(id: number): Work | null {
  const r = getDb().prepare(`${SELECT} WHERE w.id = ?`).get(id);
  return r ? toWork(r) : null;
}
export function getPublicWork(id: number): Work | null {
  const r = getDb().prepare(`${SELECT} WHERE w.id = ? AND w.status = 'published'`).get(id);
  return r ? toWork(r) : null;
}
export function listPublic(opts: { categories?: Category[]; featured?: boolean } = {}): Work[] {
  const where = [`w.status = 'published'`];
  const args: (string | number)[] = [];
  if (opts.categories?.length) {
    where.push(`w.category IN (${opts.categories.map(() => '?').join(',')})`);
    args.push(...opts.categories);
  }
  if (opts.featured) where.push('w.featured = 1');
  return getDb().prepare(`${SELECT} WHERE ${where.join(' AND ')} ${ORDER}`).all(...args).map(toWork);
}
export function listForStudio(user: User): Work[] {
  const q = user.role === 'admin' ? `${SELECT} ${ORDER}` : `${SELECT} WHERE w.owner_id = ? ${ORDER}`;
  const rows = user.role === 'admin' ? getDb().prepare(q).all() : getDb().prepare(q).all(user.id);
  return rows.map(toWork);
}
/** 媒體檔對應的作品（用來判斷檔案能不能公開提供）。 */
export function findWorkByFile(kind: 'images' | 'thumbs' | 'videos', file: string): Work | null {
  const col = { images: 'image_file', thumbs: 'thumb_file', videos: 'video_file' }[kind];
  const r = getDb().prepare(`${SELECT} WHERE w.${col} = ?`).get(file);
  return r ? toWork(r) : null;
}

// ---------- 表單驗證 ----------
export interface WorkInput {
  category: Category;
  title: string;
  summary: string;
  description: string;
  date: string;
  status: 'draft' | 'published';
  featured: boolean;
  alt: string;
  medium: string;
  size: string;
  location: string;
  camera: string;
  composer: string;
  event: string;
  result: string;
  /** 'keep' 保留現有；'file' 上傳檔；'youtube' 貼連結；'none' 無影片 */
  videoMode: 'keep' | 'file' | 'youtube' | 'none';
  youtubeId: string | null;
}

export function parseWorkForm(form: FormData): { input: WorkInput; errors: string[] } {
  const errors: string[] = [];
  const s = (k: string, max: number, label: string, required = false) => {
    const v = String(form.get(k) ?? '').trim();
    if (required && !v) errors.push(`請填寫${label}`);
    if (v.length > max) errors.push(`${label}不可超過 ${max} 字`);
    return v;
  };
  const category = String(form.get('category') ?? '') as Category;
  if (!categories.includes(category)) errors.push('請選擇分類');
  const date = String(form.get('date') ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) errors.push('日期格式需為 YYYY-MM-DD');
  const status = form.get('status') === 'published' ? 'published' : 'draft';
  const input: WorkInput = {
    category,
    title: s('title', 60, '作品名稱', true),
    summary: s('summary', 120, '一句話介紹'),
    description: s('description', 5000, '創作說明'),
    date,
    status,
    featured: form.get('featured') === 'on',
    alt: s('alt', 120, '圖片文字說明'),
    medium: s('medium', 60, '媒材'),
    size: s('size', 60, '尺寸'),
    location: s('location', 60, '地點'),
    camera: s('camera', 60, '器材'),
    composer: s('composer', 60, '作曲家'),
    event: s('event', 60, '場合／單位'),
    result: s('result', 60, '成績'),
    videoMode: (['keep', 'file', 'youtube', 'none'].includes(String(form.get('video_mode'))) ? form.get('video_mode') : 'keep') as WorkInput['videoMode'],
    youtubeId: null,
  };
  if (input.videoMode === 'youtube') {
    input.youtubeId = parseYouTubeId(String(form.get('youtube') ?? ''));
    if (!input.youtubeId) errors.push('請貼上有效的 YouTube 連結（或 11 碼影片 ID）');
  }
  return { input, errors };
}

export interface WorkFiles {
  image?: string | null;
  thumb?: string | null;
  video?: string | null;
}

/** 影片一次只能有一種來源；回傳 DB 要寫入的 video_file / youtube_id。 */
function resolveVideo(input: WorkInput, files: WorkFiles, current?: Work) {
  switch (input.videoMode) {
    case 'file': return { video_file: files.video ?? current?.videoFile ?? null, youtube_id: null };
    case 'youtube': return { video_file: null, youtube_id: input.youtubeId };
    case 'none': return { video_file: null, youtube_id: null };
    default: return { video_file: current?.videoFile ?? null, youtube_id: current?.youtubeId ?? null };
  }
}

export function createWork(actor: User, input: WorkInput, files: WorkFiles): Work {
  if (actor.status !== 'active') throw new ForbiddenError('沒有權限');
  checkMedia(input, { image: files.image ?? null, video: resolveVideo(input, files).video_file, youtube: resolveVideo(input, files).youtube_id });
  const d = getDb();
  const v = resolveVideo(input, files);
  const t = Date.now();
  // 新作品排在最前面：sort_order 取目前最小值再減 1（保證不重複）
  const min = (d.prepare('SELECT COALESCE(MIN(sort_order), 0) AS m FROM works').get() as any).m as number;
  const r = d
    .prepare(
      `INSERT INTO works (owner_id, category, title, summary, description, date, status, featured, sort_order, alt,
         medium, size, location, camera, composer, event, result, image_file, thumb_file, video_file, youtube_id, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      actor.id, input.category, input.title, input.summary, input.description, input.date, input.status, input.featured ? 1 : 0,
      min - 1, input.alt, input.medium, input.size, input.location, input.camera, input.composer, input.event, input.result,
      files.image ?? null, files.thumb ?? null, v.video_file, v.youtube_id, t, t,
    );
  return getWork(Number(r.lastInsertRowid))!;
}

/** 更新作品；回傳被取代、需要從磁碟刪除的舊檔案。 */
export function updateWork(actor: User, id: number, input: WorkInput, files: WorkFiles): { work: Work; obsolete: WorkFiles } {
  const current = getWork(id);
  assertCanManage(actor, current);
  const image = files.image ?? current.imageFile;
  const thumb = files.thumb ?? current.thumbFile;
  const v = resolveVideo(input, files, current);
  checkMedia(input, { image, video: v.video_file, youtube: v.youtube_id });
  getDb()
    .prepare(
      `UPDATE works SET category=?, title=?, summary=?, description=?, date=?, status=?, featured=?, alt=?, medium=?, size=?,
         location=?, camera=?, composer=?, event=?, result=?, image_file=?, thumb_file=?, video_file=?, youtube_id=?, updated_at=? WHERE id=?`,
    )
    .run(
      input.category, input.title, input.summary, input.description, input.date, input.status, input.featured ? 1 : 0, input.alt,
      input.medium, input.size, input.location, input.camera, input.composer, input.event, input.result, image, thumb,
      v.video_file, v.youtube_id, Date.now(), id,
    );
  const obsolete: WorkFiles = {};
  if (files.image && current.imageFile && files.image !== current.imageFile) {
    obsolete.image = current.imageFile;
    obsolete.thumb = current.thumbFile;
  }
  if (current.videoFile && current.videoFile !== v.video_file) obsolete.video = current.videoFile;
  return { work: getWork(id)!, obsolete };
}

export function deleteWork(actor: User, id: number): WorkFiles {
  const w = getWork(id);
  assertCanManage(actor, w);
  getDb().prepare('DELETE FROM works WHERE id = ?').run(id);
  return { image: w.imageFile, thumb: w.thumbFile, video: w.videoFile };
}

/** 在「同擁有者、同分類、同為精選／非精選」的列表中上移／下移一格（與鄰居交換排序值）。 */
export function moveWork(actor: User, id: number, dir: 'up' | 'down') {
  const w = getWork(id);
  assertCanManage(actor, w);
  const d = getDb();
  const sibs = d
    .prepare(`SELECT id, sort_order FROM works WHERE owner_id = ? AND category = ? AND featured = ? ORDER BY sort_order ASC, date DESC, id DESC`)
    .all(w.ownerId, w.category, w.featured ? 1 : 0) as { id: number; sort_order: number }[];
  const i = sibs.findIndex((x) => x.id === id);
  const j = dir === 'up' ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= sibs.length) return;
  const upd = d.prepare('UPDATE works SET sort_order = ? WHERE id = ?');
  upd.run(sibs[j].sort_order, sibs[i].id);
  upd.run(sibs[i].sort_order, sibs[j].id);
}

/** 切換精選（後台列表一鍵置頂／取消）。 */
export function setFeatured(actor: User, id: number, featured: boolean) {
  const w = getWork(id);
  assertCanManage(actor, w);
  getDb().prepare('UPDATE works SET featured = ?, updated_at = ? WHERE id = ?').run(featured ? 1 : 0, Date.now(), id);
}

/** 公開作品必須有媒體：影像類要有圖片；鋼琴演奏要有影片。草稿不檢查。 */
function checkMedia(input: WorkInput, m: { image: string | null; video: string | null; youtube: string | null }) {
  if (input.status !== 'published') return;
  const errors: string[] = [];
  if (input.category === 'piano') {
    if (!m.video && !m.youtube) errors.push('鋼琴演奏要先上傳影片或貼 YouTube 連結才能公開（可先存成草稿）');
  } else if (!m.image) {
    errors.push('要先上傳圖片才能公開（可先存成草稿）');
  }
  if (m.image && !input.alt) errors.push('請填寫圖片文字說明（給視障者與圖片載入失敗時使用）');
  if (errors.length) throw new ValidationError(errors);
}
