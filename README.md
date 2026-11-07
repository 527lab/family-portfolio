# 家人作品集網站

個人作品集（畫作、攝影、鋼琴演奏影片、檢定證書、自我介紹）。Astro（SSR）+ SQLite，創作者註冊登入後自己上傳與管理作品，訪客只能瀏覽公開作品。用 Docker 部署，經 Cloudflare Tunnel 對外。
規格、權限與安全設計見 [docs/spec.md](docs/spec.md)。

> 網站只使用暱稱，請勿放入真名或其他個資。

## Node 版本需求

**Node.js 22.23.4 以上**（Astro 7 的要求，版本不足時 `astro` 指令會直接拒絕執行）。建議用 Node 24（`.nvmrc`）。Dockerfile 使用 `node:24-alpine`。

```bash
node -v    # 需 >= v22.23.4
```

## 本機開發

```bash
npm install
npm run dev          # http://localhost:4321
```

第一次使用先建立管理員（互動輸入密碼，資料存在 `./data/`，已被 git 排除）：

```bash
npm run user -- create-admin admin 管理員
```

接著用該帳號登入 `/login/`，到「帳號管理」產生邀請碼給家人註冊。

| 指令 | 用途 |
|---|---|
| `npm run build` | 型別檢查 + 建置到 `dist/` |
| `npm start` | 執行建置結果（`node dist/server/entry.mjs`） |
| `npm test` | 單元測試 |
| `npm run build:fast && npm run test:e2e` | 端對端測試（啟動真實伺服器） |
| `npm run user -- <指令>` | `create-admin <帳號> [暱稱]`、`reset-password <帳號>`、`list` |

### CI（GitHub Actions）

`.github/workflows/ci.yml` 在每個 PR 與 push 到 main 時執行：
- `test`：`npm ci`、`npm run build`（含 astro check）、`npm test`、`npm run test:e2e`（Node 版本讀 `.nvmrc`）。e2e 用 vitest 啟動真實伺服器、不需瀏覽器，所以不裝 Playwright。
- `docker`：`docker compose config`、`docker build`，再把 compose（web + nginx）跑起來，用 `scripts/ci-smoke.sh` 驗證 X-Robots-Tag、影片 Range 回 206、超過 `MAX_VIDEO_MB` 回 413。CI 全用假帳密與假值，不使用任何真實 token。
- 在有 Docker 的機器上也能手動跑：`MAX_VIDEO_MB=1 docker compose up -d --build --wait && bash scripts/ci-smoke.sh`（會建立 `ciadmin` 測試帳號，請用拋棄式的 volume，跑完 `docker compose down -v`）。

## 家人怎麼用

1. 向 David 拿邀請碼，開 `/register/` 註冊（帳號、暱稱、密碼至少 10 字元）。暱稱會顯示在網站上，之後可到 `/studio/settings/` 修改。
2. 登入後進「創作者後台」→「新增作品」：選分類、填名稱與說明、選圖片（手機原圖即可，會自動縮圖）；鋼琴演奏可上傳影片或貼 YouTube 不公開連結。
3. 狀態先選「草稿」確認沒問題，再改「公開」。後台可用 ↑↓ 調整順序。
4. 證書請先遮蔽姓名、證號、校名等資訊再上傳。

## 設定（環境變數，見 `.env.example`）

| 變數 | 預設 | 說明 |
|---|---|---|
| `REGISTRATION` | `invite` | `closed` 關閉註冊／`invite` 需邀請碼／`approval` 需管理員核准 |
| `NOINDEX` | `true` | 不讓搜尋引擎收錄；改 `false` 並重啟才允許 |
| `SITE_URL` | `http://localhost:8080` | 對外網址；**建置時**帶入，改了要重新 build |
| `MAX_IMAGE_MB` / `MAX_VIDEO_MB` | `15` / `200` | 上傳大小上限 |
| `TRUST_PROXY` | `false` | 經 Cloudflare Tunnel 時設 `true`，登入限流才抓得到真實 IP |
| `DATA_DIR` | `./data`（容器內 `/data`） | SQLite 與上傳檔位置 |
| `TUNNEL_TOKEN` | — | Cloudflare Tunnel token，只放 `.env` |

## 目錄

```
src/pages/            公開頁、登入／註冊、studio/（後台）、media/（檔案服務）
src/server/           資料庫、帳號與 session、作品、上傳處理（可獨立測試）
src/middleware.ts     登入檢查與安全標頭
src/data/             標語、導覽、關於我（站上暱稱取自創作者帳號）
scripts/user.ts       伺服器上的帳號管理指令
tests/                unit（單元）、e2e（端對端）
Dockerfile / docker-compose.yml
deploy/               nginx 設定樣板、Cloudflare Tunnel 設定範本
```

## 部署（David 的家用伺服器）

> 給不熟 Docker 的完整步驟（部署、更新、備份還原、故障排除）見 **[docs/deploy.md](docs/deploy.md)**。以下為摘要。架構：cloudflared → nginx（`deploy/nginx/`，上傳上限、影片 Range、noindex 標頭）→ web。

### 1. 建立 Cloudflare Tunnel
1. Cloudflare Zero Trust → Networks → Tunnels → Create a tunnel（Cloudflared）。
2. 複製 token。
3. Public Hostname：填網域（如 `portfolio.example.com`），Service 選 `HTTP`，URL 填 `nginx:8080`。

### 2. 設定與啟動
```bash
git clone <repo> && cd family-portfolio
cp .env.example .env      # 填入 TUNNEL_TOKEN、SITE_URL；.env 不要提交
docker compose --profile tunnel up -d --build
docker compose exec web node scripts/user.ts create-admin <帳號> <暱稱>   # 第一次：建立管理員
```
- 只想在本機測試（不接 Tunnel）：`docker compose up -d --build`，開 http://localhost:8080（`.env` 的 `SITE_URL` 要是 `http://localhost:8080`）。
- 更新程式：`git pull && docker compose --profile tunnel up -d --build`（volume 內的資料不受影響）。
- 查看狀態：`docker compose ps`、`docker compose logs -f`。
- 忘記密碼：`docker compose exec web node scripts/user.ts reset-password <帳號>`。

### 3. 備份與還原
資料（資料庫 + 上傳檔）都在 volume `portfolio-data`，請定期備份：
```bash
# 備份（先停服務可確保資料庫一致）
docker compose stop web
docker run --rm -v family-portfolio_portfolio-data:/data -v "$PWD":/backup alpine tar czf /backup/portfolio-$(date +%F).tgz -C /data .
docker compose start web
# 還原
docker run --rm -v family-portfolio_portfolio-data:/data -v "$PWD":/backup alpine sh -c "cd /data && tar xzf /backup/<檔名>.tgz"
```
（volume 實際名稱以 `docker volume ls` 為準，通常是「資料夾名_portfolio-data」。）

### 4. 影片
- 上傳檔：後台直接選 MP4／WebM（預設 200 MB 內）。伺服器上傳時會暫用記憶體，大影片建議先壓成 H.264 1080p。
- YouTube：上傳設為「不公開」，後台貼網址即可，網站以 `youtube-nocookie.com` 內嵌。
- 比較請見 [spec §8](docs/spec.md)。

## 安全備忘
- `.env`、Tunnel token、`data/`、備份檔都不進版控。
- 預設只有持邀請碼的人能註冊；長期不需要新帳號時可設 `REGISTRATION=closed`。
- 密碼以 argon2id 雜湊；session 為 HttpOnly cookie；上傳的圖片會移除 EXIF（含 GPS）。
- 從 P0 升級：先前放在 `src/content/works/` 的假資料範例與 `npm run new` 已移除，作品改由網頁上傳。
