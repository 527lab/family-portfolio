# P9 交接紀錄（nginx 讓私人頁面永遠 noindex）

## 做了什麼
- 補上 P7 交接提到的缺口：`NOINDEX=false` 開放收錄時，nginx 原本會對所有路徑拿掉 `X-Robots-Tag`。
  現在 `deploy/nginx/default.conf.template` 以 `$uri` 判斷 `/studio`、`/login`、`/register`、`/logout`，這些路徑不論 `NOINDEX` 都帶 `X-Robots-Tag: noindex, nofollow, noarchive`；公開頁面在 `false` 時仍放行。
- CI `docker` job 新增一步：以 `NOINDEX=false` 重啟，驗證首頁沒有 X-Robots-Tag、私人路徑有。
- `docs/deploy.md` 的 `NOINDEX` 說明補一句。
- 驗證：`npm run build`、`npm test`（46）、`npm run test:e2e`（25）本機通過。nginx 樣板與新 CI 步驟本機沒跑（沒有 nginx、Docker 未啟動），以 CI 結果為準，見 PR。

## 需要 David 決定（未做）
- 改密碼網頁介面、Cloudflare Access、branch protection、何時關閉 noindex、全站預設分享圖。
