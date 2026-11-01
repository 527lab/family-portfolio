import { existsSync, readdirSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { makeDataDir, mp4Bytes, pngFile } from '../helpers';
import { closeDb } from '../../src/server/db.ts';
import { mediaPath, parseYouTubeId, saveImage, saveVideo, UploadError } from '../../src/server/media.ts';

let tmp: ReturnType<typeof makeDataDir>;
beforeEach(() => {
  tmp = makeDataDir();
  process.env.DATA_DIR = tmp.dir;
  delete process.env.MAX_IMAGE_MB;
  delete process.env.MAX_VIDEO_MB;
});
afterEach(() => {
  closeDb();
  tmp.cleanup();
});

describe('圖片上傳', () => {
  it('接受 PNG：存成 WebP，產生不超過 640px 的縮圖，大圖縮到 2400px 內', async () => {
    const { image, thumb } = await saveImage(await pngFile('big.png', 3000, 2000));
    const big = await sharp(mediaPath('images', image)).metadata();
    const small = await sharp(mediaPath('thumbs', thumb)).metadata();
    expect(big.format).toBe('webp');
    expect(big.width).toBe(2400);
    expect(small.width).toBe(640);
  });

  it('移除 EXIF（含 GPS 等個資），並依 EXIF 方向轉正', async () => {
    const jpg = await sharp({ create: { width: 400, height: 200, channels: 3, background: '#fff' } })
      .jpeg()
      .withExif({ IFD0: { Copyright: '不該留下的資訊' } })
      .toBuffer();
    expect((await sharp(jpg).metadata()).exif).toBeDefined();
    const { image } = await saveImage(new File([new Uint8Array(jpg)], 'p.jpg', { type: 'image/jpeg' }));
    expect((await sharp(mediaPath('images', image)).metadata()).exif).toBeUndefined();
  });

  it('拒絕 SVG、GIF、PDF、非圖片類型', async () => {
    for (const [name, type] of [['a.svg', 'image/svg+xml'], ['a.gif', 'image/gif'], ['a.pdf', 'application/pdf'], ['a.html', 'text/html']]) {
      await expect(saveImage(new File(['<svg/>'], name, { type }))).rejects.toThrow(UploadError);
    }
  });

  it('拒絕「宣稱是 PNG 但內容不是圖片」的檔案，且不留下檔案', async () => {
    await expect(saveImage(new File(['<?php system($_GET[1]); ?>'], 'shell.png', { type: 'image/png' }))).rejects.toThrow(UploadError);
    expect(existsSync(tmp.dir + '/uploads/images') ? readdirSync(tmp.dir + '/uploads/images') : []).toEqual([]);
  });

  it('拒絕宣稱 PNG 但實際是 SVG 的檔案', async () => {
    await expect(saveImage(new File(['<svg xmlns="http://www.w3.org/2000/svg"/>'], 'x.png', { type: 'image/png' }))).rejects.toThrow(UploadError);
  });

  it('超過大小限制被拒絕', async () => {
    process.env.MAX_IMAGE_MB = '0.01';
    await expect(saveImage(await pngFile('big.png', 1500, 1500))).rejects.toThrow('不可超過');
  });

  it('空檔案被拒絕', async () => {
    await expect(saveImage(new File([], 'e.png', { type: 'image/png' }))).rejects.toThrow(UploadError);
  });
});

describe('影片上傳', () => {
  it('接受 MP4 檔頭並用隨機檔名存檔', async () => {
    const name = await saveVideo(new File([mp4Bytes()], 'My Video.mp4', { type: 'video/mp4' }));
    expect(name).toMatch(/^[a-f0-9]{32}\.mp4$/);
    expect(existsSync(mediaPath('videos', name))).toBe(true);
  });

  it('接受 WebM 檔頭', async () => {
    const webm = Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(await saveVideo(new File([webm], 'v.webm', { type: 'video/webm' }))).toMatch(/\.webm$/);
  });

  it('拒絕類型與內容不符：exe 改名成 mp4、webm 內容標成 mp4', async () => {
    await expect(saveVideo(new File(['MZ\x90\x00 not a video at all'], 'v.mp4', { type: 'video/mp4' }))).rejects.toThrow(UploadError);
    const webm = Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0, 0, 0, 0, 0]);
    await expect(saveVideo(new File([webm], 'v.mp4', { type: 'video/mp4' }))).rejects.toThrow(UploadError);
  });

  it('拒絕其他影片格式與超過大小限制', async () => {
    await expect(saveVideo(new File([mp4Bytes()], 'v.avi', { type: 'video/x-msvideo' }))).rejects.toThrow(UploadError);
    process.env.MAX_VIDEO_MB = '0.00001';
    await expect(saveVideo(new File([mp4Bytes()], 'v.mp4', { type: 'video/mp4' }))).rejects.toThrow('YouTube');
  });
});

describe('檔名與連結', () => {
  it('mediaPath 拒絕路徑穿越與非隨機檔名', () => {
    for (const bad of ['../app.db', '..%2Fapp.db', 'a.webp', `${'a'.repeat(32)}.exe`, `${'a'.repeat(32)}.webp/../x`]) {
      expect(() => mediaPath('images', bad)).toThrow(UploadError);
    }
  });

  it('parseYouTubeId 支援常見網址並拒絕其他網站', () => {
    const id = 'abcdEFGhijk';
    expect(parseYouTubeId(id)).toBe(id);
    expect(parseYouTubeId(`https://www.youtube.com/watch?v=${id}&t=3`)).toBe(id);
    expect(parseYouTubeId(`https://youtu.be/${id}`)).toBe(id);
    expect(parseYouTubeId(`https://www.youtube.com/embed/${id}`)).toBe(id);
    expect(parseYouTubeId(`https://evil.example/watch?v=${id}`)).toBeNull();
    expect(parseYouTubeId('javascript:alert(1)')).toBeNull();
    expect(parseYouTubeId('')).toBeNull();
  });
});
