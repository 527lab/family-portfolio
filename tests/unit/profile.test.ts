import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeDataDir, PASSWORD } from '../helpers';
import { AuthError, createUser, setUserStatus } from '../../src/server/auth.ts';
import { closeDb } from '../../src/server/db.ts';
import { getAbout, getSiteAbout, setAbout, toParagraphs } from '../../src/server/profile.ts';

let tmp: ReturnType<typeof makeDataDir>;
beforeEach(() => {
  tmp = makeDataDir();
  process.env.DATA_DIR = tmp.dir;
});
afterEach(() => {
  closeDb();
  tmp.cleanup();
});

const mk = (username: string, role: 'admin' | 'creator' = 'creator') =>
  createUser({ username, displayName: username, password: PASSWORD, role, status: 'active' });

describe('關於我', () => {
  it('還沒填時是空字串；儲存後可讀回（換行正規化、去頭尾空白），可再更新', async () => {
    const a = await mk('alice');
    expect(getAbout(a.id)).toBe('');
    setAbout(a.id, '  第一行\r\n第二行  ');
    expect(getAbout(a.id)).toBe('第一行\n第二行');
    setAbout(a.id, '改過了');
    expect(getAbout(a.id)).toBe('改過了');
  });

  it('超過 5000 字被拒絕', async () => {
    const a = await mk('alice');
    expect(() => setAbout(a.id, 'x'.repeat(5001))).toThrow(AuthError);
    expect(getAbout(a.id)).toBe('');
  });

  it('前台顯示網站主人（最早啟用的創作者）的關於我，不含管理員', async () => {
    const boss = await mk('boss', 'admin');
    const a = await mk('alice');
    const b = await mk('bobby');
    setAbout(boss.id, '管理員');
    setAbout(b.id, 'bobby 的介紹');
    expect(getSiteAbout()).toBe(''); // alice 還沒填
    setAbout(a.id, 'alice 的介紹');
    expect(getSiteAbout()).toBe('alice 的介紹');
    setUserStatus(boss, a.id, 'disabled');
    expect(getSiteAbout()).toBe('bobby 的介紹');
  });

  it('段落切分：空行分段、段內換行保留', () => {
    expect(toParagraphs('a\nb\n\n\nc\n')).toEqual([['a', 'b'], ['c']]);
    expect(toParagraphs('   ')).toEqual([]);
  });
});
