# P11 交接紀錄（小範圍品質補強·續）

## 做了什麼
- 分支 `p11-next` 從 `p10-next` 開出，PR base 為 `p10-next`。
- 測試缺口：`src/server/http.ts` 的 `safeNext`（登入後導回，防 open redirect）與 `clientIp`（限流來源 IP，TRUST_PROXY 才信任 CF-Connecting-IP）原本沒有單元測試，新增 `tests/unit/http.test.ts`（5 項）。
- 測試過程沒有發現程式錯誤，所以沒有改動正式程式碼。
- 驗證：`npm run build`（astro check 通過）、`npm test`（51）、`npm run test:e2e`（26）本機通過。專案沒有獨立 lint 指令，以 astro check 為準。CI 結果見 PR。

## 沒做
- 沒有碰改密碼介面、Cloudflare Access、branch protection、noindex 預設、分享圖設定。

## 需要 David 決定
- 同前：改密碼網頁介面、Cloudflare Access、branch protection、何時關閉 noindex、全站預設分享圖。
- p9-next／p10-next／p11-next 何時併入 main（目前是串接的 PR）。
