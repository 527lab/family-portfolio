import { createHash, randomBytes } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';
import { config } from './config.ts';
import { getDb, transaction } from './db.ts';

export type Role = 'admin' | 'creator';
export type Status = 'active' | 'pending' | 'disabled';
export interface User {
  id: number;
  username: string;
  displayName: string;
  role: Role;
  status: Status;
  createdAt: number;
}

const now = () => Date.now();
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export class AuthError extends Error {}

// ---------- 驗證輸入 ----------
export function validateUsername(u: string): string | null {
  return /^[A-Za-z0-9_]{3,20}$/.test(u) ? null : '帳號需為 3–20 個英文字母、數字或底線';
}
export function validatePassword(p: string): string | null {
  if (p.length < 10) return '密碼至少 10 個字元';
  if (p.length > 128) return '密碼最長 128 個字元';
  return null;
}
export function validateDisplayName(n: string): string | null {
  return n.trim().length >= 1 && n.length <= 20 ? null : '顯示名稱（暱稱）需為 1–20 個字，請勿使用真名';
}

// ---------- 密碼雜湊（argon2id，套件預設參數）----------
export const hashPassword = (pw: string) => hash(pw);
// 帳號不存在時也做一次驗證，避免用回應時間猜帳號
let dummyHash: Promise<string> | undefined;

const toUser = (r: any): User => ({
  id: r.id,
  username: r.username,
  displayName: r.display_name,
  role: r.role,
  status: r.status,
  createdAt: r.created_at,
});

const INSERT_USER =
  'INSERT INTO users (username, display_name, password_hash, role, status, created_at) VALUES (?,?,?,?,?,?)';

// ---------- 使用者 ----------
export async function createUser(input: {
  username: string;
  displayName: string;
  password: string;
  role: Role;
  status: Status;
}): Promise<User> {
  const err = validateUsername(input.username) ?? validateDisplayName(input.displayName) ?? validatePassword(input.password);
  if (err) throw new AuthError(err);
  const ph = await hashPassword(input.password);
  try {
    const r = getDb().prepare(INSERT_USER).run(input.username, input.displayName, ph, input.role, input.status, now());
    return getUserById(Number(r.lastInsertRowid))!;
  } catch (e: any) {
    if (String(e?.message).includes('UNIQUE')) throw new AuthError('這個帳號已被使用');
    throw e;
  }
}

export function getUserById(id: number): User | null {
  const r = getDb().prepare('SELECT * FROM users WHERE id = ?').get(id);
  return r ? toUser(r) : null;
}
export function getUserByName(username: string): User | null {
  const r = getDb().prepare('SELECT * FROM users WHERE username = ?').get(username);
  return r ? toUser(r) : null;
}
export function listUsers(): User[] {
  return getDb().prepare('SELECT * FROM users ORDER BY id').all().map(toUser);
}

// 網站公開顯示的暱稱＝最早建立且啟用中的創作者帳號；尚無帳號時用中性文字
export const NEUTRAL_NAME = '創作者';
export function getSiteOwnerName(): string {
  const r: any = getDb()
    .prepare("SELECT display_name FROM users WHERE role = 'creator' AND status = 'active' ORDER BY id LIMIT 1")
    .get();
  return r?.display_name ?? NEUTRAL_NAME;
}

export function setDisplayName(userId: number, displayName: string) {
  const err = validateDisplayName(displayName);
  if (err) throw new AuthError(err);
  getDb().prepare('UPDATE users SET display_name = ? WHERE id = ?').run(displayName, userId);
}

export async function setPassword(userId: number, password: string) {
  const err = validatePassword(password);
  if (err) throw new AuthError(err);
  getDb().prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await hashPassword(password), userId);
  destroyUserSessions(userId);
}

export function setUserStatus(actor: User, userId: number, status: Status) {
  if (actor.role !== 'admin') throw new AuthError('只有管理員可以這樣做');
  if (actor.id === userId) throw new AuthError('不能變更自己的狀態');
  getDb().prepare('UPDATE users SET status = ? WHERE id = ?').run(status, userId);
  if (status !== 'active') destroyUserSessions(userId);
}

// ---------- 登入失敗限流（記憶體；重啟即清空）----------
const attempts = new Map<string, { count: number; first: number }>();
const WINDOW = 15 * 60_000;
const LIMITS = { user: 5, ip: 20 };

export function resetRateLimit() {
  attempts.clear();
}
function limited(key: string, max: number) {
  const a = attempts.get(key);
  if (!a) return false;
  if (now() - a.first > WINDOW) {
    attempts.delete(key);
    return false;
  }
  return a.count >= max;
}
function fail(key: string) {
  const a = attempts.get(key);
  if (!a || now() - a.first > WINDOW) attempts.set(key, { count: 1, first: now() });
  else a.count++;
}

export type LoginResult =
  | { ok: true; user: User }
  | { ok: false; reason: 'invalid' | 'locked' | 'pending' | 'disabled' };

export async function authenticate(username: string, password: string, ip = 'unknown'): Promise<LoginResult> {
  const uk = `u:${username.toLowerCase()}`;
  const ik = `ip:${ip}`;
  if (limited(uk, LIMITS.user) || limited(ik, LIMITS.ip)) return { ok: false, reason: 'locked' };
  const row: any = getDb().prepare('SELECT * FROM users WHERE username = ?').get(username);
  dummyHash ??= hashPassword('dummy-password-for-timing');
  const good = await verify(row?.password_hash ?? (await dummyHash), password).catch(() => false);
  if (!row || !good) {
    fail(uk);
    fail(ik);
    return { ok: false, reason: 'invalid' };
  }
  attempts.delete(uk);
  if (row.status === 'pending') return { ok: false, reason: 'pending' };
  if (row.status === 'disabled') return { ok: false, reason: 'disabled' };
  return { ok: true, user: toUser(row) };
}

// ---------- Session（資料庫只存雜湊，cookie 存隨機 token）----------
export function createSession(userId: number): { token: string; expires: Date } {
  const token = randomBytes(32).toString('base64url');
  const expires = new Date(now() + config().sessionDays * 86_400_000);
  const d = getDb();
  d.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now());
  d.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?,?,?)').run(sha256(token), userId, expires.getTime());
  return { token, expires };
}
export function getSessionUser(token: string | undefined): User | null {
  if (!token) return null;
  const r: any = getDb()
    .prepare(
      `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ? AND u.status = 'active'`,
    )
    .get(sha256(token), now());
  return r ? toUser(r) : null;
}
export function destroySession(token: string | undefined) {
  if (token) getDb().prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
}
export function destroyUserSessions(userId: number) {
  getDb().prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

// ---------- 邀請碼（只存雜湊，產生時顯示一次）----------
export function createInvite(actor: User, days = 7): string {
  if (actor.role !== 'admin') throw new AuthError('只有管理員可以產生邀請碼');
  const code = randomBytes(9).toString('base64url'); // 12 字元
  getDb()
    .prepare('INSERT INTO invites (code_hash, created_by, expires_at, created_at) VALUES (?,?,?,?)')
    .run(sha256(code), actor.id, now() + days * 86_400_000, now());
  return code;
}
export function listInvites() {
  return getDb()
    .prepare(
      `SELECT i.created_at, i.expires_at, i.used_by, u.username AS used_by_name
       FROM invites i LEFT JOIN users u ON u.id = i.used_by ORDER BY i.created_at DESC LIMIT 30`,
    )
    .all() as { created_at: number; expires_at: number; used_by: number | null; used_by_name: string | null }[];
}

// ---------- 註冊（依 REGISTRATION 模式）----------
export async function register(input: {
  username: string;
  displayName: string;
  password: string;
  inviteCode?: string;
}): Promise<User> {
  const mode = config().registration;
  if (mode === 'closed') throw new AuthError('目前不開放註冊');
  const err = validateUsername(input.username) ?? validateDisplayName(input.displayName) ?? validatePassword(input.password);
  if (err) throw new AuthError(err);
  const ph = await hashPassword(input.password);
  return transaction(() => {
    const d = getDb();
    let inviteHash: string | undefined;
    if (mode === 'invite') {
      inviteHash = sha256((input.inviteCode ?? '').trim());
      const inv = d
        .prepare('SELECT 1 FROM invites WHERE code_hash = ? AND used_by IS NULL AND expires_at > ?')
        .get(inviteHash, now());
      if (!inv) throw new AuthError('邀請碼無效或已過期');
    }
    let id: number;
    try {
      const status = mode === 'approval' ? 'pending' : 'active';
      id = Number(d.prepare(INSERT_USER).run(input.username, input.displayName, ph, 'creator', status, now()).lastInsertRowid);
    } catch (e: any) {
      if (String(e?.message).includes('UNIQUE')) throw new AuthError('這個帳號已被使用');
      throw e;
    }
    if (inviteHash) d.prepare('UPDATE invites SET used_by = ? WHERE code_hash = ?').run(id, inviteHash);
    return getUserById(id)!;
  });
}
