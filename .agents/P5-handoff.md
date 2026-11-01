# P5 交接紀錄（無障礙）

## 做了什麼
- 挑選項目：spec 要求非工程師與一般訪客可用，但全站缺鍵盤無障礙基礎。新增：
  - 「跳到主要內容」連結（`Base.astro`）＋ `<main id="main" tabindex="-1">`。
  - 全站 `:focus-visible` 外框、`prefers-reduced-motion` 尊重（`global.css`）。
  - e2e 測試：首頁／分類頁／登入頁皆有 skip link、main#main、`lang="zh-Hant"`。
- 驗證：`npm run build`、`npm test`（46）、`npm run test:e2e`（23）本機通過。

## 需要 David 決定（未做）
- 改密碼的網頁介面（spec §12 列為範圍外，目前靠管理員指令）。
- Cloudflare Access 限制存取、是否把 `test`／`docker` 設為必要檢查（branch protection）。
- 是否關閉 noindex（上線給委員後可考慮）。

## 下一步建議
- 色彩對比（`--muted:#666` 在米色底約 5.5:1，OK；其他可用瀏覽器工具再查）、Open Graph 預覽圖（需決定圖片）。
