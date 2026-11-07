# P7 交接紀錄（私人頁面永不收錄）

## 做了什麼
- 問題：`NOINDEX=false` 開放收錄後，登入、註冊、後台頁面也會變成可被收錄。
- 修正：
  - `robots.txt` 在開放模式下仍 `Disallow: /studio/ /login/ /register/`。
  - `Base.astro`：`/studio`、`/login`、`/register`、`/logout` 一律輸出 robots noindex meta。
  - `middleware.ts`：這些路徑（含未登入導向、403）一律帶 `X-Robots-Tag`。
  - e2e 新增：以 `NOINDEX=false` 另起伺服器，驗證首頁可收錄、私人頁面 noindex、robots.txt 內容。
- 驗證：`npm run build`、`npm test`（46）、`npm run test:e2e`（24）本機通過；CI 見 PR。

## 需要 David 決定（未做）
- 同 P5／P6：改密碼網頁介面、Cloudflare Access、branch protection、何時關閉 noindex、全站預設分享圖。

## 注意
- nginx 設定（`deploy/nginx`）會隱藏應用程式的 `X-Robots-Tag` 並自行輸出；開放收錄時，私人頁面靠 HTML meta 與 robots.txt 保護，header 層面 nginx 不會替它們加 noindex（若要補，需改 nginx 設定）。
