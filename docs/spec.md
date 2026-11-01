# 作品集網站規格（P0）

## 1. 目標與原則

- 用途：升學面試的線上作品集（畫作、攝影、鋼琴演奏影片與檢定證書、自我介紹），繁體中文。
- **隱私**：全站只用暱稱；不放真名、學校、電話、住址、生日、證書上的個資。證書照片上傳前須遮蔽姓名等資訊。
- **預設不被搜尋引擎收錄**（見 §6），只把網址給面試委員。
- 輕量：Astro 靜態輸出，預設零 JavaScript；有需要時再加互動元件。
- 非工程師家人能自己新增作品（見 §5）。

## 2. 頁面結構

| 路徑 | 內容 |
|---|---|
| `/` | 首頁：標題、一句話介紹、精選作品（`featured: true`） |
| `/about/` | 關於我：自我介紹、學習歷程、未來方向（內容在 `src/data/about.md`） |
| `/painting/` | 畫作列表（新到舊） |
| `/photography/` | 攝影列表 |
| `/piano/` | 鋼琴：上半「演奏影片」、下半「檢定證書」 |
| `/works/<類別>/<檔名>/` | 單件作品頁：影片或大圖、基本資料、創作說明 |
| `/404.html` | 找不到頁面 |
| `/robots.txt` | 依 `NOINDEX` 產生 |

導覽列：關於我、畫作、攝影、鋼琴。各校科系的面試重點不同，列表頁之後可加「依科系推薦」的精選頁（P0 不做）。

## 3. 作品資料格式

每件作品是一個 Markdown 檔，放在 `src/content/works/<類別>/` 下，檔名即網址（英文、數字、`-`）。上方 `---` 之間是欄位，下方是自由書寫的說明（創作理念、過程、心得）。欄位由 `src/content.config.ts` 驗證，填錯時建置會報出哪個檔案哪個欄位有問題。

### 共通欄位

| 欄位 | 必填 | 說明 |
|---|---|---|
| `title` | ✔ | 作品名稱 |
| `category` | ✔ | `painting` 畫作／`photography` 攝影／`piano` 演奏／`certificate` 證書 |
| `date` | ✔ | 完成或演出日期，`2025-09-12` |
| `cover` | ✔ | 封面圖，放在 `src/assets/works/`，路徑寫 `../../../assets/works/檔名.jpg` |
| `coverAlt` | ✔ | 圖片文字說明（無障礙，必填） |
| `summary` |  | 一句話介紹，120 字內，顯示在卡片上 |
| `featured` |  | `true` 會出現在首頁，預設 `false` |
| `draft` |  | `true` 不公開（草稿），預設 `false` |

### 依類別的選填欄位

- 畫作：`medium`（媒材）、`size`（尺寸）
- 攝影：`location`、`camera`
- 演奏：`composer`、`event`、`result`、`video`
- 證書：`event`（單位與級別）、`result`

### `video` 欄位（演奏）

```yaml
video:            # 自架檔案
  type: file
  src: recital.mp4      # 檔案放 public/videos（部署時為 media/videos）
```
```yaml
video:            # YouTube 不公開連結
  type: youtube
  id: abcdEFGhijk       # 網址 watch?v= 後面的 11 碼
```

### 範例

```markdown
---
title: 窗邊的黃昏
category: painting
date: 2025-09-12
cover: ../../../assets/works/sunset.jpg
coverAlt: 暖橘色天空與教室窗框的水彩畫
featured: true
medium: 水彩
size: A3
---
這張畫的靈感、技法、遇到的困難……
```

`src/content/works/` 內有每種類別的假資料可直接複製修改。

## 4. 影片：自架檔案 vs YouTube 不公開

| | 自架檔案（nginx） | YouTube 不公開連結 |
|---|---|---|
| 隱私 | 資料在自家伺服器；網址可被轉傳，但搜尋不到 | 「不公開」＝知道連結的人都能看，也可能被轉傳；非真正私密 |
| 流量與頻寬 | 吃家用上傳頻寬，且經 Tunnel；多人同時看可能卡頓 | 由 YouTube 負擔，穩定、自動調整畫質 |
| 播放體驗 | 單一檔案；需自行壓成 H.264 mp4（1080p、約 5–8 Mbps） | 自動轉檔、字幕、手機相容性最佳 |
| 維護 | 影片不進 git，需另外備份、掛 volume | 免維護，但依賴外部服務與其政策 |
| 外部追蹤 | 無（使用 nocookie 嵌入亦可降低） | 嵌入會載入 Google 資源 |

**建議**：預設用 YouTube 不公開（穩定、省頻寬），網站以 `youtube-nocookie.com` 嵌入；若家人在意影片不要放第三方，或影片短、觀看人數少，再用自架。兩種可混用，每支影片各自設定。若自架，Cloudflare 免費方案對影片大流量有使用條款限制，影片請維持適中大小並少量使用。

## 5. 非工程師新增作品流程

作法 A（推薦，不用安裝任何東西，在 GitHub 網頁操作）
1. 進入 repo → `src/assets/works/` → **Add file → Upload files**，上傳照片（手機原圖即可，網站建置時會自動縮圖）。
2. 進入 `src/content/works/<類別>/`，點任一現有作品 → 複製內容 → 回上一層 **Add file → Create new file**，檔名如 `2025-12-city-night.md`，貼上並修改欄位與說明。
3. 先把 `draft: true`，儲存到新分支並開 Pull Request，讓 David 預覽；確認後改成 `draft: false` 合併。
4. David 在伺服器執行 `git pull && docker compose up -d --build` 後上線。

作法 B（在自己電腦）：安裝 Node 後執行 `npm run new -- painting "作品標題"`，會自動建立填好欄位的範本，編輯後 `npm run dev` 預覽。

影片：自架影片請交給 David 放入伺服器的 `media/videos/`；YouTube 則只需貼 11 碼 ID。

檢查清單：封面圖有放對資料夾、`coverAlt` 有填、證書已遮蔽個資、`draft` 狀態正確。

## 6. noindex（不被搜尋引擎收錄）

建置時由環境變數 `NOINDEX` 控制（預設 `true`）：
- 每頁加上 `<meta name="robots" content="noindex, nofollow, noarchive">`
- `/robots.txt` 輸出 `Disallow: /`

要公開時：`NOINDEX=false` 並重新建置（`docker compose` 讀取 `.env`）。注意 robots.txt 與 noindex 只是「請搜尋引擎不要收錄」，不是存取控制；需要真正限制時，可在 Cloudflare Zero Trust 對該網域加 Access 規則（Email 一次性密碼），此為後續選項。

## 7. 部署架構

```
瀏覽器 → Cloudflare（網域、HTTPS）→ Cloudflare Tunnel → cloudflared 容器 → web 容器（nginx，靜態檔）
```
- 家中不需開 port 或固定 IP；`web` 只綁 `127.0.0.1:8080` 供本機測試。
- Tunnel token 放 `.env`，不進版控。
- 自架影片以唯讀 volume 掛載，不進映像也不進 git。
- nginx：gzip、`/_astro/` 長快取、基本安全標頭、自訂 404。

## 8. 不在 P0 範圍

CMS 後台、留言、搜尋、多語系、自動部署（CI/CD）、Cloudflare Access 驗證。
