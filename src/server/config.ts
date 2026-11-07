import { resolve } from 'node:path';

export type RegistrationMode = 'closed' | 'invite' | 'approval';

// 每次呼叫都重讀環境變數（測試與執行期都方便調整）。
export function config() {
  const env = process.env;
  const mode = (env.REGISTRATION ?? 'invite') as RegistrationMode;
  const num = (v: string | undefined, d: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : d;
  };
  return {
    dataDir: resolve(env.DATA_DIR ?? './data'),
    // closed：關閉註冊；invite：需邀請碼（預設）；approval：任何人可申請，管理員核准後才能登入
    registration: (['closed', 'invite', 'approval'].includes(mode) ? mode : 'closed') as RegistrationMode,
    cookieSecure: env.COOKIE_SECURE ? env.COOKIE_SECURE === 'true' : (env.SITE_URL ?? '').startsWith('https://'),
    maxImageBytes: num(env.MAX_IMAGE_MB, 15) * 1024 * 1024,
    maxVideoBytes: num(env.MAX_VIDEO_MB, 200) * 1024 * 1024,
    sessionDays: num(env.SESSION_DAYS, 30),
    // 只有在 Cloudflare Tunnel 後面才信任 CF-Connecting-IP
    trustProxy: env.TRUST_PROXY === 'true',
  };
}
