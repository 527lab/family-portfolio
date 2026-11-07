# P4 交接紀錄（CI）

## 做了什麼
- `.github/workflows/ci.yml`（`actions/checkout@v7`、`actions/setup-node@v7`，查 GitHub releases 的最新版）：
  - `test` job：Node 讀 `.nvmrc`（24，符合 spec §2）、`npm ci`、`npm run build`（含 astro check）、`npm test`、`npm run test:e2e`。
  - `docker` job：`docker compose config`、`docker build`、`docker compose up --wait`，再跑 `scripts/ci-smoke.sh`（curl 驗證 X-Robots-Tag、Range 206、MAX_VIDEO_MB=1 時 2 MB 上傳回 413）。全用假帳密，無真實 token。
- **偏離任務卡**：沒有安裝 Playwright。`test:e2e` 是 vitest 啟動真實伺服器，沒有用到瀏覽器，裝了只是浪費時間。若日後加瀏覽器測試再補 `npx playwright install --with-deps`。
- 文件：README 新增「CI」小節，docs/deploy.md 新增「驗證部署（自動化）」。

## CI 抓到的真實問題（已修）
1. **X-Robots-Tag 重複**：網站與 nginx 都送，回應出現兩次。nginx 兩個 location 加 `proxy_hide_header X-Robots-Tag`，以 nginx 為準。
2. **本機 compose 登入／上傳表單被 403**（"Cross-site POST"）：nginx 用 `$host`（不含 port），網站的 Origin 檢查比對不上 `localhost:8080`；改用 `$http_host`。另外 `X-Forwarded-Proto` 在沒有上游時原本是空字串，改成用 map 補 `$scheme`。經 Cloudflare Tunnel 的行為不變（沿用它傳來的值）。

## 驗證
- `gh pr checks 4`：兩個 job 皆通過（PR #4，base `p3-deploy`）。這也補上了 P3 未能實測的 Docker／nginx／Range／413。
- 本機沒有重跑（沒啟動 Docker）；修改的 nginx 樣板只在 CI 上實跑過。

## 注意事項
- 煙霧測試的 BASE 必須是 `http://localhost:8080`（與 `SITE_URL` 同），否則表單 POST 會 403。
- 腳本建立 `ciadmin` 帳號，只能在拋棄式 volume 上跑。
- 網站內容沒有任何真實姓名、學校或個資；測試資料皆為假值。

## 下一步
- 可在 repo 設定把 `test`、`docker` 設為必要檢查（branch protection）。
