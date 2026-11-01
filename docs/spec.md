# 作品集網站規格（P0 → P1）

> P1 的變更：網站從「靜態網站 + Markdown 作品檔」改為 **Astro SSR + SQLite + 創作者登入與上傳介面**。
> 家人自己註冊創作者帳號，在網頁上傳與管理作品；訪客只能瀏覽已公開的作品。

## 1. 目標與原則

- 用途：升學面試的線上作品集（畫作、攝影、鋼琴演奏影片與檢定證書、自我介紹），繁體中文。
- **隱私**：全站只用暱稱（由創作者註冊時自訂，之後可在個人設定修改；尚無帳號時顯示「創作者」）；不放真名、學校、電話、住址、生日、證書上的個資。證書照片上傳前須遮蔽姓名等資訊。上傳的圖片會重新編碼並**移除 EXIF（含 GPS 位置）**。
- **預設不被搜尋引擎收錄**（見 §9），只把網址給面試委員。
- 輕量：公開頁面零 JavaScript；後台也只用原生表單，不需前端框架。
- 非工程師家人自己註冊、上傳、改、刪，不必把檔案交給 David。

## 2. Node 版本需求

- **Node.js ≥ 22.23.4**（Astro 7 的硬性要求；低於此版本 `astro` 指令會直接拒絕執行）。
- `package.json` 的 `engines` 已寫明；`.nvmrc` 為 `24`；Dockerfile 使用 `node:24-alpine`（建置與執行都是）。
- 內建的 `node:sqlite` 負責資料庫（不需編譯原生資料庫套件）；`scripts/user.ts` 靠 Node 直接執行 TypeScript，也需要這個版本。
- 原生套件：`@node-rs/argon2`（密碼雜湊）與 `sharp`（圖片處理），皆有預先編譯的 Linux（含 Alpine/musl）與 Windows 版本。

## 3. 頁面結構

### 公開（訪客）

| 路徑 | 內容 |
|---|---|
| `/` | 首頁：標題、一句話介紹、精選作品 |
| `/about/` | 關於我（內容在 `src/data/about.md`） |
| `/painting/` `/photography/` | 該分類已公開作品，依排序 |
| `/piano/` | 上半「演奏影片」、下半「檢定證書」 |
| `/works/<編號>/` | 單件作品頁：影片或大圖、基本資料、創作說明、作者暱稱 |
| `/media/<images｜thumbs｜videos>/<檔名>` | 圖片／影片檔（見 §7 存取規則） |
| `/robots.txt` `/404` | 依 `NOINDEX` 產生；找不到頁面 |

### 創作者（需登入）

| 路徑 | 內容 |
|---|---|
| `/login/` `/register/` `/logout`(POST) | 登入、註冊、登出 |
| `/studio/` | 我的作品（依分類），公開／草稿標籤，↑↓ 調整排序 |
| `/studio/new/` | 新增作品 |
| `/studio/works/<編號>/` | 編輯、更換圖片／影片、刪除（需勾選確認） |
| `/studio/admin/` | **僅管理員**：產生邀請碼、核准／停用帳號 |

## 4. 角色與權限

| 動作 | 訪客 | 創作者 | 管理員 |
|---|---|---|---|
| 看公開作品 | ✔ | ✔ | ✔ |
| 看草稿與草稿的檔案 | ✘ | 僅自己的 | 全部 |
| 新增作品 | ✘ | ✔ | ✔ |
| 改／刪／排序作品 | ✘ | 僅自己的 | 全部 |
| 邀請碼、核准、停用帳號 | ✘ | ✘ | ✔ |

- `/studio/*` 由 middleware 統一把關：未登入一律 303 導向 `/login/`（包含 POST，所以未登入無法上傳，也不會有任何副作用）；`/studio/admin/*` 非管理員回 403。
- 別人的作品編輯頁回 **404**（不透露是否存在）；排序動作對別人的作品回 403。權限判斷集中在 `canManage()`（`src/server/works.ts`），資料層函式也會再檢查，不只靠頁面。
- 停用帳號會立即讓其所有 session 失效。
- 註冊永遠只能得到「創作者」角色。管理員只能用伺服器指令建立（見 §10）。

## 5. 帳號、註冊與 session

- **密碼**：argon2id（`@node-rs/argon2` 預設參數），長度 10–128；資料庫只存雜湊。登入時帳號不存在也會做一次雜湊驗證，降低以回應時間猜帳號的風險；錯誤訊息一律是「帳號或密碼不正確」。
- **暴力破解防護**：同一帳號 15 分鐘內失敗 5 次、同一 IP 失敗 20 次即鎖定（記憶體計數，重啟清空）。經 Cloudflare Tunnel 時設 `TRUST_PROXY=true`，才改用 `CF-Connecting-IP`。
- **Session**：登入後產生 32 位元組隨機 token，放在 cookie `sid`：`HttpOnly`、`SameSite=Lax`、`Path=/`、HTTPS 時加 `Secure`（`SITE_URL` 為 https 時自動）、預設 30 天。資料庫只存 token 的 SHA-256，所以資料庫外洩也無法直接冒用。
- **CSRF**：Astro 內建 `checkOrigin`（跨站表單 POST 回 403）+ `SameSite=Lax`；登出只接受 POST。
- **安全標頭**：`X-Content-Type-Options`、`X-Frame-Options: DENY`、`Referrer-Policy`，正式環境另加 CSP（只允許自己的資源與 `youtube-nocookie.com` 內嵌）。
- **註冊模式**（環境變數 `REGISTRATION`）：

| 值 | 行為 |
|---|---|
| `closed` | 關閉註冊，`/register/` 只顯示說明 |
| `invite`（預設） | 需管理員在 `/studio/admin/` 產生的邀請碼：7 天有效、限用一次；資料庫只存雜湊，產生時顯示一次 |
| `approval` | 任何人可申請，狀態為「待核准」，管理員核准後才能登入 |

建議長期維持 `invite` 或 `closed`；`approval` 對陌生人開放申請，只適合短期使用。

## 6. 作品資料

存在 SQLite（`works` 表）。欄位：

| 欄位 | 說明 |
|---|---|
| 分類 | `painting` 畫作／`photography` 攝影／`piano` 鋼琴演奏／`certificate` 檢定證書 |
| 作品名稱（必填，60 字內）、日期（必填） | |
| 一句話介紹（120 字內）、創作說明（5000 字內，純文字，保留換行） | 以純文字顯示，不解析 HTML，避免 XSS |
| 狀態 | `draft` 草稿（只有作者與管理員看得到）／`published` 公開 |
| 精選 | 勾選後出現在首頁 |
| 排序 | 數字越小越前面；新作品自動排最前面；後台用 ↑↓ 在「自己的、同分類」內調整 |
| 圖片＋圖片文字說明 | 公開時文字說明必填（無障礙） |
| 影片 | 上傳檔，或 YouTube 連結（二選一）|
| 選填 | 媒材、尺寸（畫作）；地點、器材（攝影）；作曲家、場合、成績（演奏、證書） |

公開條件：畫作、攝影、證書需有圖片；鋼琴演奏需有影片或 YouTube 連結。不符時只能存成草稿。

## 7. 上傳規則與檔案儲存

- **圖片**：只接受 JPG／PNG／WebP（拒絕 SVG、GIF、PDF 等），預設 ≤ 15 MB（`MAX_IMAGE_MB`）。檢查宣告的類型，並用 sharp 實際解碼（偽裝成圖片的檔案會解碼失敗被拒）；依 EXIF 方向轉正後存成 WebP（長邊 ≤ 2400px），另產生 ≤ 640px 縮圖供列表使用。**EXIF 一律丟棄**。
- **影片**：只接受 MP4／WebM，預設 ≤ 200 MB（`MAX_VIDEO_MB`）。檢查宣告類型與檔頭（MP4 的 `ftyp`、WebM 的 EBML），內容與類型不符即拒絕；以串流寫入磁碟。伺服器支援 HTTP Range，拖曳進度條可用。
- **YouTube**：貼完整網址（`youtu.be/…`、`watch?v=…`、`embed/…`、`shorts/…`）或 11 碼 ID，只保存驗證過的 ID，用 `youtube-nocookie.com` 內嵌。其他網站的連結一律拒絕。
- 請求的 `Content-Length` 超過上限會在讀取內容前直接回 413。
- **檔名**：伺服器產生的 32 位十六進位隨機字串，**完全不使用使用者提供的檔名**；存取時以嚴格規則比對，杜絕路徑穿越。
- **位置**（volume `/data`）：`app.db`（SQLite，WAL 模式）、`uploads/images|thumbs|videos/`。
- **存取**：`/media/*` 查資料庫判斷——已公開作品的檔案任何人可讀（`Cache-Control: public, max-age=3600`）；草稿的檔案只有作者與管理員可讀（其他人 404、`no-store`）。刪除作品或更換檔案時，舊檔會一併從磁碟刪除；表單驗證失敗時，這次剛存的檔案也會清掉。

## 8. 影片：上傳檔案 vs YouTube 不公開

| | 上傳到自家伺服器 | YouTube 不公開連結 |
|---|---|---|
| 隱私 | 資料在自家伺服器；草稿時只有作者能看；公開後知道網址的人都能看 | 「不公開」＝知道連結的人都能看，也可能被轉傳；非真正私密 |
| 流量與頻寬 | 吃家用上傳頻寬，且經 Tunnel；多人同時看可能卡頓 | 由 YouTube 負擔，穩定、自動調整畫質 |
| 播放體驗 | 單一檔案；建議先壓成 H.264 mp4（1080p、約 5–8 Mbps） | 自動轉檔、字幕、手機相容性最佳 |
| 容量 | 受 `MAX_VIDEO_MB` 與磁碟限制；上傳時伺服器會暫用記憶體 | 無限制 |
| 外部追蹤 | 無 | 嵌入會載入 Google 資源（nocookie 可降低） |

**建議**：預設用 YouTube 不公開（穩定、省頻寬）；影片短、觀看人少、或家人不想放第三方時再上傳檔案。兩種可混用，每支影片各自設定。Cloudflare 免費方案對大流量影片有使用條款限制，影片請維持適中大小並少量使用。

## 9. noindex（不被搜尋引擎收錄）

由環境變數 `NOINDEX` 控制（預設 `true`），**執行期讀取**，改 `.env` 後 `docker compose up -d` 重啟即可，不必重建：
- 每頁加上 `<meta name="robots" content="noindex, nofollow, noarchive">`
- `/robots.txt` 輸出 `Disallow: /`

robots.txt 與 noindex 只是「請搜尋引擎不要收錄」，不是存取控制。公開作品網址知道就能看；若需限制，可在 Cloudflare Zero Trust 對網域加 Access 規則（Email 一次性密碼），此為後續選項。

## 10. 部署與維運

```
瀏覽器 → Cloudflare（網域、HTTPS）→ Cloudflare Tunnel → cloudflared 容器 → nginx 容器（8080）→ web 容器（Node，4321）
                                                                                              └─ volume /data（SQLite + 上傳檔）
```
- 家中不需開 port 或固定 IP；`nginx` 只綁 `127.0.0.1:8080` 供本機測試，`web` 不對外開 port；nginx 負責上傳大小上限（`MAX_VIDEO_MB`）、影片 Range 轉發與 `X-Robots-Tag`（`NOINDEX`）。部署細節見 `docs/deploy.md`。
- Tunnel token 放 `.env`，不進版控。容器以非 root（`node`）執行。
- **建立第一個管理員**（不經網頁，密碼互動輸入、不進 shell 歷史）：
  `docker compose exec web node scripts/user.ts create-admin <帳號> [暱稱]`
- 忘記密碼：`docker compose exec web node scripts/user.ts reset-password <帳號>`（會登出該帳號所有裝置）；列出帳號：`... list`。
- **備份**：整個 volume（資料庫＋上傳檔）。做法見 README。

## 11. 測試

- `npm test`：單元測試（vitest）——密碼雜湊、登入與限流、session、註冊三種模式與邀請碼、作品權限與公開條件、排序、圖片／影片驗證（偽裝檔案、EXIF、大小、路徑穿越）、YouTube 解析。
- `npm run test:e2e`：啟動 build 好的真實伺服器做 HTTP 測試（需先 `npm run build:fast`）——**未登入不能進後台也不能上傳**、登入成功／失敗與 cookie 屬性、登出後 session 失效、跨站 POST 被擋、他人不能改刪排序別人的作品、草稿檔案不外洩、偽裝圖片被拒、影片 Range、邀請碼限制、非管理員不能進帳號管理。

## 12. 不在範圍

改密碼的網頁介面（目前靠管理員指令；暱稱已可在 `/studio/settings/` 修改）、留言、搜尋、多語系、自動部署（CI/CD）、Cloudflare Access 驗證、影片轉檔、瀏覽器端大檔分段上傳。
