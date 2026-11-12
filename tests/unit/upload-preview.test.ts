// public/upload-preview.js 是瀏覽器腳本：用 node:vm 在假的 DOM 裡執行它，測「選檔後要不要顯示預覽」。
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const SCRIPT = readFileSync(new URL('../../public/upload-preview.js', import.meta.url), 'utf8');

type Listener = () => void;
function makeTarget() {
  const listeners: Record<string, Listener[]> = {};
  return {
    listeners,
    addEventListener(name: string, fn: Listener) {
      (listeners[name] ??= []).push(fn);
    },
    fire(name: string) {
      for (const fn of listeners[name] ?? []) fn();
    },
  };
}

/** 執行腳本，選一個檔案，回傳預覽有沒有顯示、有沒有讀檔。 */
function pick(file: { name: string; type: string } | null) {
  const img = {
    ...makeTarget(),
    src: '',
    removeAttribute(attr: string) {
      if (attr === 'src') this.src = '';
    },
  };
  const box = { hidden: true, querySelector: () => img };
  const input = { ...makeTarget(), dataset: { preview: 'image-preview' }, files: file ? [file] : [] };
  const reads: unknown[] = [];
  class FakeFileReader {
    result: string | null = null;
    onload: (() => void) | null = null;
    readAsDataURL(f: unknown) {
      reads.push(f);
      this.result = 'data:image/png;base64,AAAA';
      this.onload?.();
    }
  }
  const document = {
    querySelectorAll: () => [input],
    getElementById: (id: string) => (id === 'image-preview' ? box : null),
  };
  runInNewContext(SCRIPT, { document, FileReader: FakeFileReader, String });
  input.fire('change');
  if (img.src) img.fire('load'); // 瀏覽器載入 data: 網址成功
  return { shown: !box.hidden, read: reads.length === 1, src: img.src };
}

describe('upload-preview.js', () => {
  it('有 image/* 類型就顯示預覽', () => {
    expect(pick({ name: 'a.jpg', type: 'image/jpeg' })).toMatchObject({ shown: true, read: true });
    expect(pick({ name: 'noext', type: 'image/png' })).toMatchObject({ shown: true, read: true });
  });

  it('類型是空字串時改看副檔名（jpg/jpeg/png/gif/webp/heic/heif，不分大小寫）', () => {
    for (const name of ['a.jpg', 'b.JPEG', 'c.png', 'd.gif', 'e.webp', 'IMG_0001.HEIC', 'f.heif']) {
      expect(pick({ name, type: '' }), name).toMatchObject({ shown: true, read: true });
    }
  });

  it('application/octet-stream 也視同沒有類型，看副檔名', () => {
    expect(pick({ name: 'IMG_0002.jpg', type: 'application/octet-stream' })).toMatchObject({ shown: true });
    expect(pick({ name: 'notes.txt', type: 'application/octet-stream' })).toMatchObject({ shown: false, read: false });
  });

  it('類型空白且副檔名不是圖片，不讀檔也不顯示', () => {
    for (const name of ['clip.mov', 'notes.txt', 'jpg', 'a.jpg.exe', 'noext']) {
      expect(pick({ name, type: '' }), name).toMatchObject({ shown: false, read: false });
    }
  });

  it('有明確的非圖片類型時不看副檔名', () => {
    expect(pick({ name: 'fake.jpg', type: 'video/mp4' })).toMatchObject({ shown: false, read: false });
  });

  it('沒選檔案時不顯示', () => {
    expect(pick(null)).toMatchObject({ shown: false, read: false });
  });
});
