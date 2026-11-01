import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeDataDir, PASSWORD } from '../helpers';
import {
  authenticate, AuthError, createInvite, createSession, createUser, destroySession, getSessionUser,
  register, resetRateLimit, setUserStatus, getSiteOwnerName, setDisplayName,
} from '../../src/server/auth.ts';
import { closeDb, getDb } from '../../src/server/db.ts';

let tmp: ReturnType<typeof makeDataDir>;
beforeEach(() => {
  tmp = makeDataDir();
  process.env.DATA_DIR = tmp.dir;
  process.env.REGISTRATION = 'invite';
  resetRateLimit();
});
afterEach(() => {
  closeDb();
  tmp.cleanup();
});

const admin = () => createUser({ username: 'boss', displayName: '管理員', password: PASSWORD, role: 'admin', status: 'active' });

describe('密碼與登入', () => {
  it('密碼以 argon2id 雜湊儲存，不存明文', async () => {
    await admin();
    const row = getDb().prepare('SELECT password_hash FROM users').get() as { password_hash: string };
    expect(row.password_hash).toMatch(/^\$argon2id\$/);
    expect(row.password_hash).not.toContain(PASSWORD);
  });

  it('正確密碼可登入，帳號大小寫不敏感', async () => {
    await admin();
    const r = await authenticate('BOSS', PASSWORD);
    expect(r.ok).toBe(true);
  });

  it('錯誤密碼與不存在的帳號回傳相同的 invalid', async () => {
    await admin();
    expect(await authenticate('boss', 'wrong-password-123')).toEqual({ ok: false, reason: 'invalid' });
    expect(await authenticate('nobody', 'wrong-password-123')).toEqual({ ok: false, reason: 'invalid' });
  });

  it('連續失敗 5 次後鎖定，即使密碼正確也要等', async () => {
    await admin();
    for (let i = 0; i < 5; i++) await authenticate('boss', 'wrong-password-123');
    expect(await authenticate('boss', PASSWORD)).toEqual({ ok: false, reason: 'locked' });
  });

  it('密碼太短或帳號格式錯誤會被拒絕', async () => {
    await expect(createUser({ username: 'ab', displayName: 'x', password: PASSWORD, role: 'creator', status: 'active' })).rejects.toThrow(AuthError);
    await expect(createUser({ username: 'okname', displayName: 'x', password: 'short', role: 'creator', status: 'active' })).rejects.toThrow(AuthError);
  });
});

describe('Session', () => {
  it('token 對得到使用者；登出後失效；資料庫只存雜湊', async () => {
    const u = await admin();
    const { token } = createSession(u.id);
    expect(getSessionUser(token)?.id).toBe(u.id);
    const stored = getDb().prepare('SELECT token_hash FROM sessions').get() as { token_hash: string };
    expect(stored.token_hash).not.toBe(token);
    destroySession(token);
    expect(getSessionUser(token)).toBeNull();
  });

  it('沒有 token、亂填 token、過期 token 都回傳 null', async () => {
    const u = await admin();
    expect(getSessionUser(undefined)).toBeNull();
    expect(getSessionUser('garbage')).toBeNull();
    const { token } = createSession(u.id);
    getDb().prepare('UPDATE sessions SET expires_at = 1').run();
    expect(getSessionUser(token)).toBeNull();
  });

  it('帳號被停用後，既有 session 立刻失效', async () => {
    const a = await admin();
    const c = await createUser({ username: 'kid', displayName: '小朋友', password: PASSWORD, role: 'creator', status: 'active' });
    const { token } = createSession(c.id);
    setUserStatus(a, c.id, 'disabled');
    expect(getSessionUser(token)).toBeNull();
  });

  it('創作者不能停用別人', async () => {
    const a = await admin();
    const c = await createUser({ username: 'kid', displayName: '小朋友', password: PASSWORD, role: 'creator', status: 'active' });
    expect(() => setUserStatus(c, a.id, 'disabled')).toThrow(AuthError);
  });
});

describe('註冊限制', () => {
  const reg = (inviteCode?: string, username = 'newbie') =>
    register({ username, displayName: '新朋友', password: PASSWORD, inviteCode });

  it('closed：一律拒絕', async () => {
    process.env.REGISTRATION = 'closed';
    await expect(reg('whatever')).rejects.toThrow('不開放註冊');
  });

  it('invite：沒有或錯誤邀請碼被拒絕；正確邀請碼只能用一次', async () => {
    const a = await admin();
    await expect(reg()).rejects.toThrow('邀請碼');
    await expect(reg('wrong')).rejects.toThrow('邀請碼');
    const code = createInvite(a);
    const u = await reg(code);
    expect(u.role).toBe('creator');
    expect(u.status).toBe('active');
    await expect(reg(code, 'second')).rejects.toThrow('邀請碼');
  });

  it('invite：過期邀請碼無效；帳號重複時邀請碼不會被消耗', async () => {
    const a = await admin();
    const old = createInvite(a);
    getDb().prepare('UPDATE invites SET expires_at = 1').run();
    await expect(reg(old)).rejects.toThrow('邀請碼');
    const code = createInvite(a);
    await expect(reg(code, 'boss')).rejects.toThrow('已被使用');
    expect((await reg(code)).username).toBe('newbie');
  });

  it('只有管理員能產生邀請碼', async () => {
    const c = await createUser({ username: 'kid', displayName: '小朋友', password: PASSWORD, role: 'creator', status: 'active' });
    expect(() => createInvite(c)).toThrow(AuthError);
  });

  it('approval：註冊後是待核准，核准前不能登入', async () => {
    process.env.REGISTRATION = 'approval';
    const a = await admin();
    const u = await reg();
    expect(u.status).toBe('pending');
    expect(await authenticate('newbie', PASSWORD)).toEqual({ ok: false, reason: 'pending' });
    setUserStatus(a, u.id, 'active');
    expect((await authenticate('newbie', PASSWORD)).ok).toBe(true);
  });

  it('註冊的帳號永遠是 creator，不會是 admin', async () => {
    process.env.REGISTRATION = 'approval';
    expect((await reg()).role).toBe('creator');
  });
});

describe('網站暱稱', () => {
  it('尚無創作者時顯示中性文字', async () => {
    await createUser({ username: 'boss', displayName: '管理員', password: PASSWORD, role: 'admin', status: 'active' });
    expect(getSiteOwnerName()).toBe('創作者');
  });
  it('使用創作者暱稱，可修改，空白與過長會被拒絕', async () => {
    const c = await createUser({ username: 'kid', displayName: '甲', password: PASSWORD, role: 'creator', status: 'active' });
    expect(getSiteOwnerName()).toBe('甲');
    setDisplayName(c.id, '乙');
    expect(getSiteOwnerName()).toBe('乙');
    expect(() => setDisplayName(c.id, '  ')).toThrow(AuthError);
    expect(() => setDisplayName(c.id, 'x'.repeat(21))).toThrow(AuthError);
  });
});
