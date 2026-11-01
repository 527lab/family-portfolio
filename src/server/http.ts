import type { AstroCookies } from 'astro';
import { config } from './config.ts';

export const SESSION_COOKIE = 'sid';

export function setSessionCookie(cookies: AstroCookies, token: string, expires: Date) {
  cookies.set(SESSION_COOKIE, token, {
    httpOnly: true, // JavaScript 讀不到，降低 XSS 偷 session 的風險
    sameSite: 'lax',
    secure: config().cookieSecure,
    path: '/',
    expires,
  });
}
export function clearSessionCookie(cookies: AstroCookies) {
  cookies.delete(SESSION_COOKIE, { path: '/' });
}

/** 登入限流用的來源 IP；只有 TRUST_PROXY=true（Cloudflare Tunnel 後）才信任 CF-Connecting-IP。 */
export function clientIp(request: Request, clientAddress?: string) {
  if (config().trustProxy) return request.headers.get('cf-connecting-ip') ?? clientAddress ?? 'unknown';
  return clientAddress ?? 'unknown';
}

/** 登入後導回的位置，只允許站內 /studio 底下，避免 open redirect。 */
export function safeNext(next: string | null | undefined) {
  return next && /^\/studio(\/|$)/.test(next) && !next.startsWith('//') ? next : '/studio/';
}
