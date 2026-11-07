import type { APIRoute } from 'astro';
import { destroySession } from '../server/auth';
import { clearSessionCookie, SESSION_COOKIE } from '../server/http';

// 只接受 POST（避免被第三方網頁用圖片或連結強制登出）
export const POST: APIRoute = ({ cookies, redirect }) => {
  destroySession(cookies.get(SESSION_COOKIE)?.value);
  clearSessionCookie(cookies);
  return redirect('/', 303);
};
