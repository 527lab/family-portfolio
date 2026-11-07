import { defineMiddleware } from 'astro:middleware';
import { getSessionUser } from './server/auth.ts';
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

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;
  const user = getSessionUser(context.cookies.get(SESSION_COOKIE)?.value);
  context.locals.user = user;

  // /studio 底下一律要登入（含 POST）；/studio/admin 還要是管理員
  const isStudio = pathname === '/studio' || pathname.startsWith('/studio/');
  if (isStudio && !user) {
    const to = encodeURIComponent(context.request.method === 'GET' ? pathname + context.url.search : '/studio/');
    return context.redirect(`/login/?next=${to}`, 303);
  }
  if ((pathname === '/studio/admin' || pathname.startsWith('/studio/admin/')) && user?.role !== 'admin') {
    return new Response('沒有權限', { status: 403, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }

  const res = await next();
  const h = res.headers;
  h.set('X-Content-Type-Options', 'nosniff');
  h.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  h.set('X-Frame-Options', 'DENY');
  if (import.meta.env.PROD) h.set('Content-Security-Policy', CSP);
  if (isStudio || pathname === '/login' || pathname === '/login/' || pathname.startsWith('/register')) {
    h.set('Cache-Control', 'private, no-store');
  }
  return res;
});
