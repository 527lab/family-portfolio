# P3：部署設定與測試補強（實作，sonnet）

先讀 docs/spec.md 第 10、11 節和 .agents 裡的 P2 交接內容。

## 需求
1. 依 spec 第 10 節做家裡伺服器部署：Dockerfile（多階段建置、非 root 執行）、compose.yml（網站 + nginx，上傳檔案與資料庫用 volume 保存）、nginx 設定（反向代理、上傳大小上限對應 MAX_VIDEO_MB、影片 Range 支援、noindex 標頭）、Cloudflare Tunnel 設定範本（cloudflared 只放範例，token 用環境變數，不寫進 repo）。
2. 寫 docs/deploy.md：從零部署、更新版本、備份與還原上傳檔案和資料庫的步驟，寫給不熟 Docker 的人看。
3. 依 spec 第 11 節補測試缺口，特別是上傳檔頭驗證、權限（未登入不能進 studio）、noindex。
4. npm run build 和所有測試必須通過；能在本機跑 docker build 就實測一次，不能就在 PR 說明。

## 共通限制
- 在目前分支基礎上已開好新分支，完成後 push 並開 PR（base 設為上一個任務的分支），PR 寫明做了什麼、怎麼測，不要自行合併。
- 不放任何金鑰、密碼或真實個資；不刪與需求無關的檔案；不碰任何正式環境。
- 完成後在 .agents 寫一份 <任務名>-handoff.md 交接紀錄。