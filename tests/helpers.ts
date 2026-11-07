import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';

/** 每個測試用獨立的暫存資料夾（資料庫與上傳檔都在裡面）。 */
export function makeDataDir() {
  const dir = mkdtempSync(join(tmpdir(), 'portfolio-test-'));
  return {
    dir,
    cleanup: () => {
      try {
        rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      } catch {
        // Windows 上 sharp 可能暫時還握著檔案；暫存資料夾留給系統清理，不讓測試因此失敗
      }
    },
  };
}

export const PASSWORD = 'correct-horse-battery';

export async function pngBuffer(width = 800, height = 600) {
  return sharp({ create: { width, height, channels: 3, background: '#c4533b' } }).png().toBuffer();
}

export const pngFile = async (name = 'a.png', w = 800, h = 600) => new File([new Uint8Array(await pngBuffer(w, h))], name, { type: 'image/png' });

/** 最小的合法 MP4 檔頭（只有 ftyp box），足以通過檔頭檢查。 */
export const mp4Bytes = () => Uint8Array.from([0, 0, 0, 16, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 0, 0, 1, 2, 3, 4]);
