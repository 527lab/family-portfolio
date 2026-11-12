import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeDataDir, PASSWORD } from '../helpers';
import { createUser, type User } from '../../src/server/auth.ts';
import { closeDb } from '../../src/server/db.ts';
import {
  canManage, createWork, deleteWork, ForbiddenError, getWork, listForStudio, listPublic, moveWork,
  parseWorkForm, updateWork, ValidationError, type WorkInput,
} from '../../src/server/works.ts';
import { submitWork } from '../../src/server/workForm.ts';
import { mp4Bytes, pngFile } from '../helpers';

let tmp: ReturnType<typeof makeDataDir>;
let admin: User, alice: User, bob: User;
beforeEach(async () => {
  tmp = makeDataDir();
  process.env.DATA_DIR = tmp.dir;
  const mk = (username: string, role: 'admin' | 'creator') =>
    createUser({ username, displayName: username, password: PASSWORD, role, status: 'active' });
  admin = await mk('boss', 'admin');
  alice = await mk('alice', 'creator');
  bob = await mk('bobby', 'creator');
});
afterEach(() => {
  closeDb();
  tmp.cleanup();
});

const input = (over: Partial<WorkInput> = {}): WorkInput => ({
  category: 'painting', title: '作品', summary: '', description: '', date: '2025-01-01', status: 'draft', featured: false,
  alt: '說明', medium: '', size: '', location: '', camera: '', composer: '', event: '', result: '',
  videoMode: 'keep', youtubeId: null, ...over,
});
const img = { image: 'a'.repeat(32) + '.webp', thumb: 'a'.repeat(32) + '.webp' };

describe('權限', () => {
  it('未登入（null）不能管理任何作品', () => {
    const w = createWork(alice, input(), img);
    expect(canManage(null, w)).toBe(false);
    expect(() => updateWork(null as any, w.id, input(), {})).toThrow(ForbiddenError);
    expect(() => deleteWork(null as any, w.id)).toThrow(ForbiddenError);
  });

  it('創作者不能改、刪、移動別人的作品', () => {
    const w = createWork(alice, input(), img);
    expect(() => updateWork(bob, w.id, input({ title: '被改' }), {})).toThrow(ForbiddenError);
    expect(() => deleteWork(bob, w.id)).toThrow(ForbiddenError);
    expect(() => moveWork(bob, w.id, 'up')).toThrow(ForbiddenError);
    expect(getWork(w.id)?.title).toBe('作品');
  });

  it('作者與管理員可以管理', () => {
    const w = createWork(alice, input(), img);
    expect(updateWork(alice, w.id, input({ title: '改了' }), {}).work.title).toBe('改了');
    expect(updateWork(admin, w.id, input({ title: '管理員改' }), {}).work.title).toBe('管理員改');
    deleteWork(admin, w.id);
    expect(getWork(w.id)).toBeNull();
  });

  it('後台列表：創作者只看到自己的，管理員看到全部', () => {
    createWork(alice, input({ title: 'A' }), img);
    createWork(bob, input({ title: 'B' }), img);
    expect(listForStudio(alice).map((w) => w.title)).toEqual(['A']);
    expect(listForStudio(admin)).toHaveLength(2);
  });

  it('停用的帳號不能新增作品', () => {
    expect(() => createWork({ ...alice, status: 'disabled' }, input(), img)).toThrow(ForbiddenError);
  });
});

describe('公開／草稿', () => {
  it('公開列表只含已公開作品', () => {
    createWork(alice, input({ title: '草稿' }), img);
    createWork(alice, input({ title: '公開', status: 'published' }), img);
    expect(listPublic().map((w) => w.title)).toEqual(['公開']);
  });

  it('沒有圖片不能公開；鋼琴要有影片或 YouTube 才能公開', () => {
    expect(() => createWork(alice, input({ status: 'published' }), {})).toThrow(ValidationError);
    expect(() => createWork(alice, input({ category: 'piano', status: 'published' }), img)).toThrow(ValidationError);
    const w = createWork(alice, input({ category: 'piano', status: 'published', videoMode: 'youtube', youtubeId: 'abcdEFGhijk' }), {});
    expect(w.youtubeId).toBe('abcdEFGhijk');
  });

  it('公開時必須有圖片文字說明', () => {
    expect(() => createWork(alice, input({ status: 'published', alt: '' }), img)).toThrow(ValidationError);
  });

  it('可篩選分類與精選', () => {
    createWork(alice, input({ title: '畫', status: 'published', featured: true }), img);
    createWork(alice, input({ title: '拍', category: 'photography', status: 'published' }), img);
    expect(listPublic({ categories: ['photography'] }).map((w) => w.title)).toEqual(['拍']);
    expect(listPublic({ featured: true }).map((w) => w.title)).toEqual(['畫']);
  });
});

describe('排序', () => {
  it('新作品預設排在最前面；可上移下移', () => {
    const a = createWork(alice, input({ title: '一', status: 'published' }), img);
    const b = createWork(alice, input({ title: '二', status: 'published' }), img);
    const c = createWork(alice, input({ title: '三', status: 'published' }), img);
    const titles = () => listPublic().map((w) => w.title);
    expect(titles()).toEqual(['三', '二', '一']);
    moveWork(alice, a.id, 'up');
    expect(titles()).toEqual(['三', '一', '二']);
    moveWork(alice, c.id, 'down');
    expect(titles()).toEqual(['一', '三', '二']);
    moveWork(alice, a.id, 'up'); // 已在最前面，不變
    expect(titles()).toEqual(['一', '三', '二']);
    void b;
  });
});

describe('表單驗證', () => {
  const form = (o: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries({ category: 'painting', title: 't', date: '2025-02-03', ...o })) f.set(k, v);
    return f;
  };
  it('接受 YouTube 網址並取出 ID', () => {
    const { input: i, errors } = parseWorkForm(form({ video_mode: 'youtube', youtube: 'https://youtu.be/abcdEFGhijk?si=x' }));
    expect(errors).toEqual([]);
    expect(i.youtubeId).toBe('abcdEFGhijk');
  });
  it('拒絕不是 YouTube 的連結、錯誤日期、過長標題、未知分類', () => {
    expect(parseWorkForm(form({ video_mode: 'youtube', youtube: 'https://evil.example/watch?v=abcdEFGhijk' })).errors).not.toEqual([]);
    expect(parseWorkForm(form({ date: '2025-13-99' })).errors).not.toEqual([]);
    expect(parseWorkForm(form({ title: 'x'.repeat(61) })).errors).not.toEqual([]);
    expect(parseWorkForm(form({ category: 'hack' })).errors).not.toEqual([]);
  });
});

describe('submitWork（表單＋檔案整合）', () => {
  it('上傳圖片後建立作品，並產生縮圖', async () => {
    const f = new FormData();
    Object.entries({ category: 'painting', title: '日落', date: '2025-05-01', alt: '日落的畫', status: 'published' }).forEach(([k, v]) => f.set(k, v));
    f.set('image', await pngFile());
    const r = await submitWork(alice, f);
    expect(r.errors).toEqual([]);
    expect(r.work?.thumbFile).toMatch(/^[a-f0-9]{32}\.webp$/);
  });

  it('上傳了壞檔案時整筆失敗，不建立作品', async () => {
    const f = new FormData();
    Object.entries({ category: 'painting', title: '壞', date: '2025-05-01', alt: 'x', status: 'published' }).forEach(([k, v]) => f.set(k, v));
    f.set('image', new File(['<?php echo 1;'], 'evil.png', { type: 'image/png' }));
    const r = await submitWork(alice, f);
    expect(r.work).toBeUndefined();
    expect(r.errors.length).toBeGreaterThan(0);
    expect(listForStudio(admin)).toHaveLength(0);
  });
});

describe('影片預設「不放影片」', () => {
  const piano = (o: Record<string, string | File> = {}) => {
    const f = new FormData();
    Object.entries({ category: 'piano', title: '練習曲', date: '2025-05-01', status: 'draft', video_mode: 'none', ...o }).forEach(([k, v]) => f.set(k, v));
    return f;
  };
  const mp4 = () => new File([mp4Bytes()], 'a.mp4', { type: 'video/mp4' });

  it('新作品不選影片可直接儲存，不會被要求填影片', async () => {
    const r = await submitWork(alice, piano());
    expect(r.errors).toEqual([]);
    expect(r.work?.videoFile).toBeNull();
    expect(r.work?.youtubeId).toBeNull();
  });

  it('沒切換選項但選了影片檔或貼了連結：照實際填的上傳／使用', async () => {
    const a = await submitWork(alice, piano({ video: mp4() }));
    expect(a.work?.videoFile).toMatch(/\.mp4$/);
    const b = await submitWork(alice, piano({ youtube: 'https://youtu.be/abcdEFGhijk' }));
    expect(b.work?.youtubeId).toBe('abcdEFGhijk');
  });

  it('已有影片的作品：保留原設定；明確選「不放影片」才移除', async () => {
    const w = (await submitWork(alice, piano({ video_mode: 'youtube', youtube: 'https://youtu.be/abcdEFGhijk' }))).work!;
    const kept = await submitWork(alice, piano({ video_mode: 'keep', title: '改名' }), w);
    expect(kept.work?.youtubeId).toBe('abcdEFGhijk');
    const removed = await submitWork(alice, piano({ youtube: 'https://youtu.be/abcdEFGhijk' }), kept.work!);
    expect(removed.work?.youtubeId).toBeNull();
  });
});
