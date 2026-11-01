# 家人作品集網站

升學面試用的作品集（畫作、攝影、鋼琴、自我介紹）。Astro 靜態網站，用 Docker + nginx 部署，經 Cloudflare Tunnel 對外。
規格與新增作品流程見 [docs/spec.md](docs/spec.md)。

> 範例內容與圖片皆為假資料。網站只使用暱稱，請勿放入真名或其他個資。

## 本機預覽

需求：Node.js **22.23.4 以上**（Astro 7 的要求）。

```bash
npm install
npm run dev        # http://localhost:4321 ，改檔案會即時更新
npm run build      # 型別檢查 + 產生 dist/
npm run preview    # 預覽 build 結果
```

新增作品範本：`npm run new -- painting "作品標題"`（類別：painting / photography / piano / certificate）。

## 目錄

```
src/content/works/<類別>/*.md   作品（每件一個檔）
src/assets/works/               作品圖片（建置時自動縮圖）
src/data/site.ts                暱稱、標題、導覽
src/data/about.md               關於我
public/videos/                  自架影片（本機預覽用，不進 git）
nginx/default.conf              nginx 設定
Dockerfile / docker-compose.yml 部署
```

## 部署（David 的家用伺服器）

### 1. 建立 Cloudflare Tunnel
1. Cloudflare Zero Trust → Networks → Tunnels → Create a tunnel（Cloudflared）。
2. 複製 token。
3. Public Hostname：填網域（如 `portfolio.example.com`），Service 選 `HTTP`，URL 填 `web:80`。

### 2. 設定與啟動
```bash
git clone <repo> && cd family-portfolio
cp .env.example .env      # 填入 TUNNEL_TOKEN、SITE_URL；.env 不要提交
mkdir -p media/videos     # 自架影片放這裡（可略）
docker compose --profile tunnel up -d --build
```
- 只想在本機測試（不接 Tunnel）：`docker compose up -d --build`，開 http://localhost:8080
- 更新內容：`git pull && docker compose --profile tunnel up -d --build`
- 查看狀態：`docker compose ps`、`docker compose logs -f`

### 3. 公開／不公開
預設 `NOINDEX=true`（不被搜尋引擎收錄）。要允許收錄：`.env` 改 `NOINDEX=false` 後重新建置。

### 4. 影片
- 自架：檔案放 `media/videos/xxx.mp4`，作品檔寫 `video: {type: file, src: xxx.mp4}`。
- YouTube：上傳設為「不公開」，作品檔寫 `video: {type: youtube, id: 11碼ID}`。
- 比較請見 [spec §4](docs/spec.md)。

## 安全備忘
- `.env`、Tunnel token、影片檔、個資照片都不進版控。
- 證書照片上傳前先遮蔽姓名、證號、學校等資訊。
