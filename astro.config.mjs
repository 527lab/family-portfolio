import { defineConfig } from 'astro/config';

// SITE_URL：正式網址（例如 https://portfolio.example.com），建置時以環境變數帶入
export default defineConfig({
  site: process.env.SITE_URL || 'http://localhost:4321',
  output: 'static',
  trailingSlash: 'always',
});
