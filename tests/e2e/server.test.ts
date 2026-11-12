// 端對端測試：啟動真正 build 出來的伺服器（dist/server/entry.mjs），用 HTTP 驗證登入與權限。
// 先執行 `npm run build:fast`，再 `npm run test:e2e`。
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeDataDir, mp4Bytes, PASSWORD, pngFile } from '../helpers';

const tmp = makeDataDir();
process.env.DATA_DIR = tmp.dir;
process.env.REGISTRATION = 'invite';
let server: ChildProcess;
let base = '';

async function freePort() {
  return new Promise<number>((resolve) => {
    const s = createServer().listen(0, '127.0.0.1', () => {
      const p = (s.address() as any).port;
      s.close(() => resolve(p));
    });
  });
}

// 簡單的 cookie 罐：一個「瀏覽器」
class Client {
  cookie = '';
  async req(path: string, init: RequestInit & { origin?: string | null } = {}) {
    const headers = new Headers(init.headers);
    if (this.cookie) headers.set('cookie', this.cookie);
    if (init.origin !== null && init.method && init.method !== 'GET') headers.set('origin', init.origin ?? base);
    const res = await fetch(base + path, { ...init, headers, redirect: 'manual' });
    const set = res.headers.getSetCookie().find((c) => c.startsWith('sid='));
    if (set) this.cookie = set.startsWith('sid=;') || /expires=Thu, 01 Jan 1970/i.test(set) ? '' : set.split(';')[0];
    return res;
  }
  post(path: string, body: Record<string, string | File>, opts: { origin?: string | null } = {}) {
    const f = new FormData();
    for (const [k, v] of Object.entries(body)) f.set(k, v);
    return this.req(path, { method: 'POST', body: f, ...opts });
  }
  async login(username: string, password = PASSWORD) {
    return this.post('/login/', { username, password });
  }
}

let auth: typeof import('../../src/server/auth.ts');
let works: typeof import('../../src/server/works.ts');
let dbm: typeof import('../../src/server/db.ts');

beforeAll(async () => {
  if (!existsSync('dist/server/entry.mjs')) throw new Error('請先執行 npm run build:fast');
  auth = await import('../../src/server/auth.ts');
  works = await import('../../src/server/works.ts');
  dbm = await import('../../src/server/db.ts');
  const admin = await auth.createUser({ username: 'boss', displayName: '管理員', password: PASSWORD, role: 'admin', status: 'active' });
  const mk = (username: string) => auth.createUser({ username, displayName: username, password: PASSWORD, role: 'creator', status: 'active' });
  await mk('alice');
  await mk('bobby');
  void admin;
  const port = await freePort();
  base = `http://localhost:${port}`; // 用 localhost：以 127.0.0.1 連線時 Astro 算出的網址來源是 localhost，Origin 檢查會不符
  server = spawn(process.execPath, ['dist/server/entry.mjs'], {
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), DATA_DIR: tmp.dir, REGISTRATION: 'invite' },
    stdio: 'pipe',
  });
  let log = '';
  server.stderr?.on('data', (d) => (log += d));
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base + '/robots.txt')).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('伺服器沒有啟動：' + log);
}, 30_000);

afterAll(() => {
  server?.kill();
  dbm?.closeDb();
  setTimeout(() => tmp.cleanup(), 300);
});

const workBody = async (over: Record<string, string | File> = {}) => ({
  category: 'painting', title: '日落', date: '2025-05-01', alt: '日落的畫', status: 'published', image: await pngFile(), ...over,
});

describe('未登入', () => {
  it('不能進後台：被導向登入頁', async () => {
    const c = new Client();
    for (const p of ['/studio/', '/studio/new/', '/studio/works/1/', '/studio/admin/']) {
      const res = await c.req(p);
      expect(res.status, p).toBe(303);
      expect(res.headers.get('location')).toMatch(/^\/login\//);
    }
  });

  it('不能上傳：POST 被導向登入頁，沒有建立作品也沒有寫入檔案', async () => {
    const c = new Client();
    const res = await c.post('/studio/new/', await workBody());
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toMatch(/^\/login\//);
    expect(works.listForStudio({ id: 0, role: 'admin' } as any)).toHaveLength(0);
    expect(existsSync(tmp.dir + '/uploads')).toBe(false);
  });

  it('不能改別人的作品或移動排序（POST /studio/）', async () => {
    const res = await new Client().post('/studio/', { id: '1', dir: 'up' });
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toMatch(/^\/login\//);
  });

  it('訪客可以瀏覽公開頁面與 robots.txt', async () => {
    const c = new Client();
    for (const p of ['/', '/about/', '/painting/', '/photography/', '/piano/', '/login/', '/register/']) {
      expect((await c.req(p)).status, p).toBe(200);
    }
    expect(await (await c.req('/robots.txt')).text()).toContain('Disallow: /');
  });

  it('無障礙：每頁有「跳到主要內容」連結與對應的 main#main，且 html 有 lang', async () => {
    const c = new Client();
    for (const p of ['/', '/painting/', '/login/']) {
      const html = await (await c.req(p)).text();
      expect(html, p).toContain('href="#main"');
      expect(html, p).toMatch(/<main[^>]*id="main"/);
      expect(html, p).toContain('lang="zh-Hant"');
    }
  });

  it('無障礙：分類頁的作品卡標題接在 h1 之下（h2），不跳級', async () => {
    const c = new Client();
    for (const p of ['/painting/', '/photography/']) {
      const html = await (await c.req(p)).text();
      expect(html, p).not.toContain('<h3');
    }
  });
});

describe('未登入（補充）', () => {
  it('後台所有寫入端點（含編輯、刪除、帳號管理）都要登入', async () => {
    const c = new Client();
    for (const p of ['/studio/works/1/', '/studio/admin/', '/studio/settings/']) {
      const res = await c.post(p, { action: 'delete', confirm: 'yes' });
      expect(res.status, p).toBe(303);
      expect(res.headers.get('location'), p).toMatch(/^\/login\//);
    }
    // 沒有斜線與大小寫變化也不能繞過
    for (const p of ['/studio', '/studio/admin', '/studio/new']) {
      const res = await c.req(p);
      expect(res.status, p).toBe(303);
    }
  });

  it('後台與登入頁不被快取', async () => {
    const res = await new Client().req('/login/');
    expect(res.headers.get('cache-control')).toContain('no-store');
  });
});

describe('noindex', () => {
  it('預設所有頁面都帶 X-Robots-Tag 與 robots meta，robots.txt 禁止收錄', async () => {
    for (const p of ['/', '/about/', '/painting/', '/login/', '/robots.txt']) {
      const res = await fetch(base + p);
      expect(res.headers.get('x-robots-tag'), p).toBe('noindex, nofollow, noarchive');
    }
    expect(await (await fetch(base + '/')).text()).toMatch(/<meta name="robots" content="noindex/);
    expect(await (await fetch(base + '/robots.txt')).text()).toContain('Disallow: /');
  });

  it('導向與 404 回應也帶 X-Robots-Tag', async () => {
    expect((await fetch(base + '/studio/', { redirect: 'manual' })).headers.get('x-robots-tag')).toContain('noindex');
    expect((await fetch(base + '/no-such-page/')).headers.get('x-robots-tag')).toContain('noindex');
  });
});

describe('登入', () => {
  it('密碼錯誤：401，且不發 session cookie', async () => {
    const c = new Client();
    const res = await c.login('alice', 'wrong-password-123');
    expect(res.status).toBe(401);
    expect(res.headers.getSetCookie().some((x) => x.startsWith('sid='))).toBe(false);
  });

  it('密碼正確：session cookie 為 HttpOnly、SameSite=Lax，之後可進後台', async () => {
    auth.resetRateLimit();
    const c = new Client();
    const res = await c.login('alice');
    expect(res.status).toBe(303);
    const cookie = res.headers.getSetCookie().find((x) => x.startsWith('sid='))!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Path=\//i);
    expect((await c.req('/studio/')).status).toBe(200);
  });

  it('登出後 session 失效', async () => {
    const c = new Client();
    await c.login('alice');
    const old = c.cookie;
    expect((await c.post('/logout', {})).status).toBe(303);
    const replay = await fetch(base + '/studio/', { headers: { cookie: old }, redirect: 'manual' });
    expect(replay.status).toBe(303);
  });

  it('跨站來源的 POST 被擋（CSRF）', async () => {
    const c = new Client();
    await c.login('alice');
    const res = await c.post('/studio/new/', await workBody(), { origin: 'https://evil.example' });
    expect(res.status).toBe(403);
  });
});

describe('創作者上傳與權限', () => {
  let alice: Client, bobby: Client, boss: Client;
  let draftId = 0;
  beforeAll(async () => {
    auth.resetRateLimit();
    alice = new Client();
    bobby = new Client();
    boss = new Client();
    await alice.login('alice');
    await bobby.login('bobby');
    await boss.login('boss');
  });

  it('上傳圖片並公開：出現在公開頁，縮圖與大圖可讀', async () => {
    const res = await alice.post('/studio/new/', await workBody({ title: '公開的畫' }));
    expect(res.status).toBe(303);
    const [w] = works.listPublic();
    expect(w.title).toBe('公開的畫');
    expect(await (await fetch(base + '/painting/')).text()).toContain('公開的畫');
    const thumb = await fetch(`${base}/media/thumbs/${w.thumbFile}`);
    expect(thumb.status).toBe(200);
    expect(thumb.headers.get('content-type')).toBe('image/webp');
    expect((await fetch(`${base}/media/images/${w.imageFile}`)).status).toBe(200);
    // Open Graph：公開作品頁帶有絕對網址的預覽圖
    const html = await (await fetch(`${base}/works/${w.id}/`)).text();
    expect(html).toContain(`property="og:image" content="${base}/media/images/${w.imageFile}"`);
  });

  it('無障礙：有作品時，分類頁作品卡標題是 h2（不跳級），首頁精選維持 h3', async () => {
    const cat = await (await fetch(base + '/painting/')).text();
    expect(cat).toMatch(/<h2[^>]*>[\s\S]*?公開的畫/);
    expect(cat).not.toContain('<h3');
    const home = await (await fetch(base + '/')).text();
    if (home.includes('公開的畫')) expect(home).toMatch(/<h3[^>]*>[\s\S]*?公開的畫/);
  });

  it('草稿：訪客與其他創作者看不到頁面和檔案，作者與管理員可以', async () => {
    const res = await alice.post('/studio/new/', await workBody({ title: '私密草稿', status: 'draft' }));
    expect(res.status).toBe(303);
    const draft = works.listForStudio({ id: 0, role: 'admin' } as any).find((w) => w.title === '私密草稿')!;
    draftId = draft.id;
    expect(await (await fetch(base + '/painting/')).text()).not.toContain('私密草稿');
    expect((await fetch(`${base}/works/${draft.id}/`)).status).toBe(404);
    expect((await fetch(`${base}/media/images/${draft.imageFile}`)).status).toBe(404);
    expect((await bobby.req(`/media/images/${draft.imageFile}`)).status).toBe(404);
    expect((await alice.req(`/media/images/${draft.imageFile}`)).status).toBe(200);
    expect((await alice.req(`/works/${draft.id}/`)).status).toBe(200);
    expect((await boss.req(`/works/${draft.id}/`)).status).toBe(200);
  });

  it('其他創作者不能開啟、修改、刪除、移動別人的作品', async () => {
    expect((await bobby.req(`/studio/works/${draftId}/`)).status).toBe(404);
    expect((await bobby.post(`/studio/works/${draftId}/`, { title: '被竄改', category: 'painting', date: '2025-01-01' })).status).toBe(404);
    expect((await bobby.post(`/studio/works/${draftId}/`, { action: 'delete', confirm: 'yes' })).status).toBe(404);
    expect((await bobby.post('/studio/', { id: String(draftId), dir: 'up' })).status).toBe(403);
    expect(works.getWork(draftId)?.title).toBe('私密草稿');
  });

  it('作者能編輯，管理員也能刪除', async () => {
    const edit = await alice.post(`/studio/works/${draftId}/`, { title: '改好了', category: 'painting', date: '2025-05-01', alt: '畫', status: 'draft', video_mode: 'keep' });
    expect(edit.status).toBe(303);
    expect(works.getWork(draftId)?.title).toBe('改好了');
    const del = await boss.post(`/studio/works/${draftId}/`, { action: 'delete', confirm: 'yes' });
    expect(del.status).toBe(303);
    expect(works.getWork(draftId)).toBeNull();
  });

  it('偽裝成圖片的檔案被拒絕（400），不建立作品', async () => {
    const before = works.listForStudio({ id: 0, role: 'admin' } as any).length;
    const evil = new File(['<?php system($_GET["c"]); ?>'], 'shell.png', { type: 'image/png' });
    const res = await alice.post('/studio/new/', await workBody({ image: evil, title: '惡意' }));
    expect(res.status).toBe(400);
    expect(works.listForStudio({ id: 0, role: 'admin' } as any)).toHaveLength(before);
  });

  it('偽裝成影片的檔案被拒絕，不建立作品；檔案不會被存下', async () => {
    const before = works.listForStudio({ id: 0, role: 'admin' } as any).length;
    const res = await alice.post('/studio/new/', {
      category: 'piano', title: '假影片', date: '2025-06-03', status: 'published', video_mode: 'file',
      video: new File(['MZ  not a video'], 'v.mp4', { type: 'video/mp4' }),
    });
    expect(res.status).toBe(400);
    expect(works.listForStudio({ id: 0, role: 'admin' } as any)).toHaveLength(before);
  });

  it('媒體路徑穿越與不存在的檔案回 404', async () => {
    for (const p of ['/media/images/..%2F..%2Fdata.db', '/media/images/%2e%2e/x.webp', '/media/images/x.webp', '/media/other/' + 'a'.repeat(32) + '.webp']) {
      expect((await fetch(base + p)).status, p).toBe(404);
    }
  });

  it('鋼琴影片：可上傳 MP4，支援 Range；也可貼 YouTube 連結', async () => {
    const res = await alice.post('/studio/new/', {
      category: 'piano', title: '發表會', date: '2025-06-01', status: 'published', video_mode: 'file',
      video: new File([mp4Bytes()], 'v.mp4', { type: 'video/mp4' }),
    });
    expect(res.status).toBe(303);
    const w = works.listPublic({ categories: ['piano'] })[0];
    const part = await fetch(`${base}/media/videos/${w.videoFile}`, { headers: { range: 'bytes=0-3' } });
    expect(part.status).toBe(206);
    expect(part.headers.get('content-range')).toMatch(/^bytes 0-3\/20$/);

    const yt = await alice.post('/studio/new/', {
      category: 'piano', title: 'YouTube 版', date: '2025-06-02', status: 'published', video_mode: 'youtube', youtube: 'https://youtu.be/abcdEFGhijk',
    });
    expect(yt.status).toBe(303);
    const page = await (await fetch(`${base}/works/${works.listPublic({ categories: ['piano'] })[0].id}/`)).text();
    expect(page).toContain('youtube-nocookie.com/embed/abcdEFGhijk');
    expect(page).toContain('property="og:title"');
    expect(page).not.toContain('og:image');
  });

  it('上傳照片預覽放大：編輯頁顯示大預覽並可點看大圖；選檔預覽腳本可載入且符合 CSP', async () => {
    const w = works.listForStudio(auth.getUserByName('alice')!).find((x) => x.imageFile)!;
    const html = await (await alice.req(`/studio/works/${w.id}/`)).text();
    expect(html).toContain('class="upload-preview"');
    expect(html).toContain(`href="/media/images/${w.imageFile}"`);
    expect(html).toMatch(/<figure class="upload-preview" id="image-preview" hidden/);
    expect(html).toContain('data-preview="image-preview"');
    expect(html).toContain('<script src="/upload-preview.js" defer></script>');
    const js = await alice.req('/upload-preview.js');
    expect(js.status).toBe(200);
    expect(js.headers.get('content-type')).toMatch(/javascript/);
    // 新增頁也有選檔預覽
    expect(await (await alice.req('/studio/new/')).text()).toContain('id="image-preview"');
  });

  it('上傳圖片欄位：accept="image/*" 且不加 capture（手機可從相簿或相機選取）', async () => {
    const html = await (await alice.req('/studio/new/')).text();
    const input = html.match(/<input[^>]*name="image"[^>]*>/)?.[0] ?? '';
    expect(input).toContain('type="file"');
    expect(input).toContain('accept="image/*"');
    expect(input).not.toContain('capture');
  });

  it('精選置頂：後台一鍵設為精選後，公開頁與後台立即排在最上面；別人不能切換', async () => {
    await alice.post('/studio/new/', await workBody({ title: '舊作品X' }));
    await alice.post('/studio/new/', await workBody({ title: '新作品Y' }));
    const x = works.listPublic().find((w) => w.title === '舊作品X')!;
    const order = (html: string) => html.indexOf('舊作品X') < html.indexOf('新作品Y');
    expect(order(await (await fetch(base + '/painting/')).text())).toBe(false);
    expect((await bobby.post('/studio/', { id: String(x.id), feature: '1' })).status).toBe(403);
    const res = await alice.post('/studio/', { id: String(x.id), feature: '1' });
    expect(res.status).toBe(303);
    expect(order(await (await fetch(base + '/painting/')).text())).toBe(true);
    const studio = await (await alice.req('/studio/')).text();
    expect(order(studio)).toBe(true);
    expect(studio).toContain('取消精選 舊作品X');
    expect((await alice.post('/studio/', { id: String(x.id), feature: '0' })).status).toBe(303);
    expect(order(await (await fetch(base + '/painting/')).text())).toBe(false);
  });

  it('影片預設「不放影片」：新作品頁預設選取，不選影片可直接儲存', async () => {
    const html = await (await alice.req('/studio/new/')).text();
    expect(html).toMatch(/<input[^>]*value="none"[^>]*checked/);
    expect(html).not.toMatch(/<input[^>]*value="file"[^>]*checked/);
    const res = await alice.post('/studio/new/', await workBody({ title: '沒有影片的演奏草稿', category: 'piano', status: 'draft', video_mode: 'none' }));
    expect(res.status).toBe(303);
    const w = works.listForStudio(auth.getUserByName('alice')!).find((x) => x.title === '沒有影片的演奏草稿')!;
    expect(w.videoFile).toBeNull();
    // 已有影片的作品編輯時預設保留原設定（不會被改成不放影片）
    const yt = works.listForStudio(auth.getUserByName('alice')!).find((x) => x.youtubeId)!;
    const edit = await (await alice.req(`/studio/works/${yt.id}/`)).text();
    expect(edit).toMatch(/<input[^>]*value="youtube"[^>]*checked/);
    expect(edit).not.toMatch(/<input[^>]*value="none"[^>]*checked/);
  });

  it('鋼琴演奏不放影片也能公開，公開頁看得到', async () => {
    const res = await alice.post('/studio/new/', {
      category: 'piano', title: '沒有影片的公開演奏', date: '2025-06-04', status: 'published', video_mode: 'none',
    });
    expect(res.status).toBe(303);
    const w = works.listPublic({ categories: ['piano'] }).find((x) => x.title === '沒有影片的公開演奏')!;
    expect(w.status).toBe('published');
    expect(w.videoFile).toBeNull();
    expect(w.youtubeId).toBeNull();
    expect(await (await fetch(`${base}/piano/`)).text()).toContain('沒有影片的公開演奏');
    const page = await fetch(`${base}/works/${w.id}/`);
    expect(page.status).toBe(200);
    expect(await page.text()).not.toContain('<video');
  });

  it('關於我：創作者在個人設定填寫儲存後，前台 /about/ 顯示（HTML 會被跳脫）', async () => {
    const before = await (await fetch(base + '/about/')).text();
    expect(before).toContain('示範的假資料'); // 還沒填時顯示預設範例
    const page = await (await alice.req('/studio/settings/')).text();
    expect(page).toContain('name="about"');
    expect(page).not.toMatch(/<textarea[^>]*(disabled|readonly)/);
    const res = await alice.post('/studio/settings/', { action: 'about', about: '我喜歡畫畫。\r\n也喜歡彈琴。\r\n\r\n<b>第二段</b>' });
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toContain('ok=about');
    const html = await (await fetch(base + '/about/')).text();
    expect(html).toContain('<p>我喜歡畫畫。<br>也喜歡彈琴。</p>');
    expect(html).toContain('&lt;b&gt;第二段&lt;/b&gt;');
    expect(html).not.toContain('示範的假資料');
    // 再次開啟設定頁會帶出已儲存的內容
    expect(await (await alice.req('/studio/settings/')).text()).toContain('也喜歡彈琴。');
    // 過長被拒絕，前台內容不變
    const long = await alice.post('/studio/settings/', { action: 'about', about: 'x'.repeat(5001) });
    expect(long.status).toBe(400);
    expect(await (await fetch(base + '/about/')).text()).toContain('也喜歡彈琴。');
    // 改暱稱不會動到關於我
    expect((await alice.post('/studio/settings/', { display_name: 'alice' })).status).toBe(303);
    expect(await (await fetch(base + '/about/')).text()).toContain('也喜歡彈琴。');
  });

  it('創作者不能進帳號管理頁，管理員可以', async () => {
    expect((await alice.req('/studio/admin/')).status).toBe(403);
    expect((await boss.req('/studio/admin/')).status).toBe(200);
  });
});

describe('註冊限制', () => {
  it('沒有邀請碼不能註冊；有邀請碼可註冊一次，且不能自己變成管理員', async () => {
    const c = new Client();
    const body = (invite: string) => ({ invite, username: 'newkid', display_name: '新朋友', password: PASSWORD, password2: PASSWORD, role: 'admin' });
    expect((await c.post('/register/', body('nope'))).status).toBe(400);
    const boss = auth.getUserByName('boss')!;
    const code = auth.createInvite(boss);
    expect((await c.post('/register/', body(code))).status).toBe(200);
    expect(auth.getUserByName('newkid')?.role).toBe('creator');
    expect((await c.post('/register/', { ...body(code), username: 'another' })).status).toBe(400);
  });
});

describe('開放收錄（NOINDEX=false）時私人頁面仍不收錄', () => {
  let s2: ChildProcess;
  let b2 = '';
  const tmp2 = makeDataDir();
  beforeAll(async () => {
    const port = await freePort();
    b2 = `http://localhost:${port}`;
    s2 = spawn(process.execPath, ['dist/server/entry.mjs'], {
      env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), DATA_DIR: tmp2.dir, NOINDEX: 'false' },
      stdio: 'pipe',
    });
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch(b2 + '/robots.txt')).ok) return;
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error('第二個伺服器沒有啟動');
  }, 30_000);
  afterAll(() => {
    s2?.kill();
    setTimeout(() => tmp2.cleanup(), 300);
  });

  it('公開頁面可收錄，登入／註冊頁帶 noindex，robots.txt 排除私人路徑', async () => {
    const home = await fetch(b2 + '/');
    expect(home.headers.get('x-robots-tag')).toBeNull();
    expect(await home.text()).not.toMatch(/name="robots"/);
    for (const p of ['/login/', '/register/']) {
      const res = await fetch(b2 + p);
      expect(res.headers.get('x-robots-tag'), p).toContain('noindex');
      expect(await res.text(), p).toMatch(/<meta name="robots" content="noindex/);
    }
    expect((await fetch(b2 + '/studio/', { redirect: 'manual' })).headers.get('x-robots-tag')).toContain('noindex');
    expect((await fetch(b2 + '/logout/', { redirect: 'manual' })).headers.get('x-robots-tag')).toContain('noindex');
    expect((await fetch(b2 + '/studio/admin/', { redirect: 'manual' })).headers.get('x-robots-tag')).toContain('noindex');
    const robots = await (await fetch(b2 + '/robots.txt')).text();
    expect(robots).toContain('Allow: /');
    for (const p of ['/studio/', '/login/', '/register/']) expect(robots).toContain('Disallow: ' + p);
  });
});
