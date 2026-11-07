# P6 交接紀錄（分享預覽 Open Graph）

## 做了什麼
- 挑選項目：P5 建議的「Open Graph 預覽圖」中，不需 David 決定的部分。
  - `Base.astro` 新增 `og:type/locale/site_name/title/description`、`twitter:card`，以及選填的 `image` 屬性（轉成絕對網址的 `og:image`）。
  - 單件作品頁：**只有已公開、且有圖片**的作品才輸出 `og:image`（用 `/media/images/…`）；草稿與影片無圖者不輸出，避免草稿檔案網址外洩。
  - e2e：公開作品頁含正確的 `og:image`；YouTube 作品（無圖）有 `og:title` 但無 `og:image`。
- 驗證：`npm run build`、`npm test`（46）、`npm run test:e2e`（23）本機通過；CI 見 PR。

## 需要 David 決定（未做）
- 首頁／全站預設分享圖（需要選圖）。
- 改密碼網頁介面、Cloudflare Access、branch protection、是否關閉 noindex（同 P5）。

## 注意
- `og:image` 的網域取自請求的 Host／X-Forwarded-*；經 nginx／Tunnel 正常時會是正式網址。
- 網站內容無真實姓名、學校或個資；測試資料皆為假值。
