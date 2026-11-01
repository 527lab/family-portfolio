import { defineConfig } from 'astro/config';
import node from '@astrojs/node';

// SITE_URL：正式網址（例如 https://portfolio.example.com），建置時以環境變數帶入。
// 它同時用來告訴 Astro 信任哪個對外網域（Cloudflare Tunnel 轉送的 X-Forwarded-*），
// 否則 HTTPS 下的表單 POST 會因 Origin 檢查失敗而被擋。
const siteUrl = new URL(process.env.SITE_URL || 'http://localhost:4321');

export default defineConfig({
  site: siteUrl.origin,
  output: 'server', // 全部頁面在伺服器端依資料庫即時產生
  adapter: node({ mode: 'standalone' }),
  trailingSlash: 'ignore',
  security: {
    checkOrigin: true, // 擋跨站表單 POST（CSRF）
    // 只有明確設定 SITE_URL 時才限定網域（本機開發與測試不設，任何 host 都可）
    allowedDomains: process.env.SITE_URL
      ? [
          {
            hostname: siteUrl.hostname,
            protocol: siteUrl.protocol.replace(':', ''),
            ...(siteUrl.port ? { port: siteUrl.port } : {}),
          },
        ]
      : [],
  },
});
