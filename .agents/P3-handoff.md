# P3 交接紀錄（部署與測試補強）

## 做了什麼
- **架構改為 cloudflared → nginx(8080) → web(4321)**。`docker-compose.yml`：web 只 `expose`，nginx（`nginxinc/nginx-unprivileged`）綁 `127.0.0.1:8080`，web 有 healthcheck、nginx 等它健康才啟動。
- `deploy/nginx/default.conf.template`：`client_max_body_size ${MAX_VIDEO_MB}m`、`/media/` 不緩衝且轉送 Range／If-Range、`X-Robots-Tag`（隨 `NOINDEX`）。變數由官方映像的 envsubst 代入（`NGINX_ENVSUBST_FILTER` 限定，避免動到 nginx 自己的 `$變數`）。
- `deploy/cloudflared/config.example.yml`：僅範本，token 一律走 `.env` 的 `TUNNEL_TOKEN`。
- 修正既有問題：compose 的 `TUNNEL_TOKEN` 用 `:?` 會讓「不接 Tunnel 的本機 `docker compose up`」也失敗，改成 `:-`。
- Dockerfile 原本已是多階段＋`USER node`，未更動。
- `docs/deploy.md`：從零部署、更新、備份還原、故障排除。README／spec §10 同步更新。
- **程式修正**：`src/middleware.ts` 加 `X-Robots-Tag`（noindex 時），並讓登入導向／403 這類提前回應也帶安全標頭（原本漏掉）。
- 測試新增：e2e（後台寫入端點未登入、無斜線路徑、noindex 標頭與 meta、導向／404 帶標頭、假影片被拒、路徑穿越 404）、unit（截斷／錯位檔頭、PNG 後接惡意內容、空影片）。

## 驗證
- `npm run build`（astro check 0 errors）、`npm test` 46 通過、`npm run test:e2e` 22 通過。
- `docker compose config` 通過。
- **未能實測**：本機 Docker Desktop 沒啟動，`docker build`、nginx 樣板代入、Range 經 nginx 轉送都沒實際跑過。合併前請在有 Docker 的機器上做 `docker compose up -d --build` 並用 `curl -I`（X-Robots-Tag）、`curl -H "Range: bytes=0-1"`（206）、上傳 > MAX_VIDEO_MB 檔案（413）驗證。

## 注意事項
- nginx 上限等於 `MAX_VIDEO_MB`，未加 multipart 額外開銷；剛好卡邊界的檔案會被 nginx 以 413 擋下而非網站的友善訊息。
- Cloudflare 免費方案單次請求約 100 MB 上限，deploy.md 已提示大影片改 YouTube。
- `NOINDEX` 在 nginx 與網站都是執行期讀取，改後重啟即可。
