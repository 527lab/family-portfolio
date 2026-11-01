import { defineMiddleware } from 'astro:middleware';
import { getSessionUser } from './server/auth.ts';
import { site } from './data/site';
import { SESSION_COOKIE } from './server/http.ts';

const CSP = [
  "default-src 'self'",
  "img-src 'self' data:",
  "media-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self'",
  'frame-src https://www.youtube-nocookie.com',
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

function secure(res: Response, noStore: boolean, noindex = site.noindex) {
  const h = res.headers;
  h.set('X-Content-Type-Options', 'nosniff');
  h.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  h.set('X-Frame-Options', 'DENY');
  if (noindex) h.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  if (import.meta.env.PROD) h.set('Content-Security-Policy', CSP);
  if (noStore) h.set('Cache-Control', 'private, no-store');
  return res;
}

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;
  const user = getSessionUser(context.cookies.get(SESSION_COOKIE)?.value);
  context.locals.user = user;

  // /studio 底下一律要登入（含 POST）；/studio/admin 還要是管理員
  const isStudio = pathname === '/studio' || pathname.startsWith('/studio/');
  if (isStudio && !user) {
    const to = encodeURIComponent(context.request.method === 'GET' ? pathname + context.url.search : '/studio/');
    return secure(context.redirect(`/login/?next=${to}`, 303), true, true);
  }
  if ((pathname === '/studio/admin' || pathname.startsWith('/studio/admin/')) && user?.role !== 'admin') {
    return secure(new Response('沒有權限', { status: 403, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }), true, true);
  }

  const noStore = isStudio || pathname === '/login' || pathname === '/login/' || pathname.startsWith('/register');
  const isPrivate = noStore || pathname === '/logout';
  return secure(await next(), noStore, site.noindex || isPrivate);
});
