import { getDb } from './db.ts';
import { AuthError, getSiteOwnerId } from './auth.ts';

export const ABOUT_MAX = 5000;

export function getAbout(userId: number): string {
  const r: any = getDb().prepare('SELECT about FROM profiles WHERE user_id = ?').get(userId);
  return r?.about ?? '';
}

/** 儲存「關於我」（純文字，顯示時會跳脫，不接受 HTML）。空字串＝改回預設介紹。 */
export function setAbout(userId: number, about: string) {
  const text = about.replace(/\r\n?/g, '\n').trim();
  if (text.length > ABOUT_MAX) throw new AuthError(`「關於我」不可超過 ${ABOUT_MAX} 字`);
  getDb()
    .prepare(
      `INSERT INTO profiles (user_id, about, updated_at) VALUES (?,?,?)
       ON CONFLICT(user_id) DO UPDATE SET about = excluded.about, updated_at = excluded.updated_at`,
    )
    .run(userId, text, Date.now());
}

/** 前台 /about/ 顯示的內容：網站主人的「關於我」；沒填時回傳空字串（頁面改用預設的 about.md）。 */
export function getSiteAbout(): string {
  const id = getSiteOwnerId();
  return id === null ? '' : getAbout(id);
}

/** 把純文字切成段落（空行分段），段內換行保留。 */
export const toParagraphs = (text: string) =>
  text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean).map((p) => p.split('\n'));
