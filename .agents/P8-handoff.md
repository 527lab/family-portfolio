# P8 交接紀錄（標題層級與狀態訊息無障礙）

## 做了什麼
- 分類頁（畫作、攝影）：作品卡標題原本是 h3，接在 h1 之後跳級；`WorkCard`／`Gallery` 新增 `level` 屬性，分類頁傳 2（首頁精選仍為 h2 底下的 h3）。
- 註冊完成／申請送出（`register.astro`）與新邀請碼（`studio/admin.astro`）的成功訊息加 `role="status"`，讓螢幕閱讀器會唸出。
- e2e 新增 1 項：分類頁不輸出 `<h3`。（若測試當下分類無作品，此測試只驗證空狀態，真正的卡片標題由程式邏輯保證。）
- 驗證：`npm run build`、`npm test`（46）、`npm run test:e2e`（25）本機通過；CI 見 PR。

## 需要 David 決定（未做）
- 同前：改密碼介面、Cloudflare Access、branch protection、何時關 noindex、全站預設分享圖。
