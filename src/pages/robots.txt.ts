import { site } from '../data/site';

// 即使開放收錄（NOINDEX=false），登入、註冊與後台頁面也不該出現在搜尋結果
const open = ['User-agent: *', 'Allow: /', 'Disallow: /studio/', 'Disallow: /login/', 'Disallow: /register/', ''].join('\n');
const closed = ['User-agent: *', 'Disallow: /', ''].join('\n');

export const GET = () =>
  new Response(site.noindex ? closed : open, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
