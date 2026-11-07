# P1：創作者登入與上傳介面（規格＋實作）
David 決定：要有註冊/登入與上傳介面，讓創作者（他的家人）自己註冊創作者帳號、上傳與管理作品（畫作、攝影照片、鋼琴影片、證書圖片），不必把檔案交給 David 手動上傳。訪客只能瀏覽公開作品。
要求：
- 維持 Astro（最新版），改為 hybrid/SSR，使用 @astrojs/node adapter，部署在家用伺服器 Docker + Cloudflare Tunnel。
- 帳號：密碼要用安全雜湊（argon2 或 bcrypt），session 用 httpOnly cookie；註冊要能關閉或限制（例如邀請碼或管理員核准），避免陌生人註冊。
- 資料：SQLite（掛載 volume）＋檔案存在 volume；上傳要限制檔案類型與大小、處理圖片縮圖；影片支援上傳檔案或貼 YouTube 不公開連結。
- 作品可設公開/草稿、排序、分類、說明文字。
- 寫測試（登入、上傳權限、未登入不能上傳）。更新 docs/spec.md、README、docker-compose。
- 先把 Node 版本需求寫清楚（Astro 需要 Node 22.23.4 以上），Dockerfile 用符合的版本。
規則：不放金鑰與真實個資（暱稱由創作者自訂）；在 p0 分支繼續，commit、push，更新 PR #1 說明（中文）。


## 交接紀錄（Claude，2026-11-01）
做了什麼：
- Astro 7 改 SSR（@astrojs/node standalone）；SQLite 用內建 `node:sqlite`；密碼 argon2id；session 為 HttpOnly cookie（DB 只存雜湊）。
- 註冊模式 `REGISTRATION=closed|invite|approval`（預設 invite）；管理員只能用 `scripts/user.ts` 建立。
- 後台 `/studio/`：新增／編輯／刪除／草稿公開／排序／分類；圖片轉 WebP＋縮圖＋移除 EXIF；影片檔或 YouTube。
- 測試：`npm test`（42 項單元）、`npm run build:fast && npm run test:e2e`（16 項，啟動真實伺服器）。皆通過。
- 更新 docs/spec.md、README、Dockerfile（node:24-alpine）、docker-compose（volume `portfolio-data`）、.env.example。
- 移除 P0 的 Markdown 作品、假資料圖片、nginx、`npm run new`（作品改由網頁上傳）。
卡在哪／未驗證：
- 本機 Docker daemon 未啟動，**Dockerfile 尚未實際建置**；`docker compose config` 通過。
- 本機 Node 是 22.17.1（低於需求），測試與建置是用 `npx node@24` 跑的。
- 未實測 Cloudflare Tunnel 後的 HTTPS 表單 POST（`SITE_URL`→`allowedDomains` 的設定需在實機確認）。
下一步：在有 Docker 的機器跑 `docker compose up -d --build` 並建立管理員；P2（通用化、暱稱自訂）另開 p2-generic 分支。