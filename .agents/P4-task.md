# P4 加上 CI

目前 repo 沒有任何 GitHub Actions 檢查。

- 先 `git checkout p3-deploy && git pull`，開新分支 `p4-ci`，PR 的 base 設為 `p3-deploy`。
- 新增 `.github/workflows/ci.yml`：Node 版本符合 spec §2，執行 `npm ci`、`npm run build`（含 astro check）、`npm test`、`npm run test:e2e`（Playwright 官方建議的 CI 安裝方式）；另加一個 job 用 `docker compose config` 與 `docker build` 驗證映像能建置，並在 CI 裡把 compose 跑起來，用 curl 驗證 P3-handoff 列的三件事（X-Robots-Tag、Range 206、超過 MAX_VIDEO_MB 回 413）。測試用假值，不要任何真實 token。
- 用最新官方版的 actions（先查官方文件）。push 後用 `gh pr checks` 確認全部綠燈，失敗就修到通過。
- 網站只用暱稱，不能出現任何真實姓名、學校或個資。
- 開 PR，結束時寫 `.agents/P4-handoff.md`，並更新 docs/deploy.md 或 README 的測試說明。