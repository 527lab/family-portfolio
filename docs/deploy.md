# 部署手冊（給不熟 Docker 的人）

這份文件教你把網站放在家裡的伺服器上，再透過 Cloudflare Tunnel 讓外面的人用網址看到。全程**不用在路由器開 port、不用固定 IP**。

## 先了解架構（一分鐘）

```
瀏覽器 → Cloudflare（網域、HTTPS）→ Tunnel → cloudflared 容器 → nginx 容器 → web 容器（網站本體）
                                                                              └─ volume「portfolio-data」（資料庫＋上傳的圖片影片）
```

- **容器**可以想成「一個裝好所有東西的小盒子」。三個盒子：`web`（網站）、`nginx`（門口警衛：限制上傳大小、處理影片串流、告訴搜尋引擎不要收錄）、`cloudflared`（連到 Cloudflare 的專線）。
- **volume** 是 Docker 幫你保管的資料夾。網站的資料庫和所有上傳檔都在裡面，**重建或更新容器都不會消失**。備份就是備份它。
- 設定都寫在 `.env`（密碼、網址等，**不會**上傳到 GitHub）。

## 需要準備

1. 一台一直開機的電腦／伺服器，已安裝 **Docker** 與 **Docker Compose**（Windows／Mac 裝 Docker Desktop；Linux 裝 docker engine + compose plugin）。確認：
   ```bash
   docker --version
   docker compose version
   ```
2. 一個放在 Cloudflare 的網域，以及 Cloudflare 帳號（免費方案即可）。
3. `git`。

## 一、從零部署

### 1. 取得程式
```bash
git clone https://github.com/527lab/family-portfolio.git
cd family-portfolio
```

### 2. 建立 Cloudflare Tunnel（只做一次）
1. 登入 Cloudflare → **Zero Trust** → **Networks** → **Tunnels** → **Create a tunnel** → 選 **Cloudflared**。
2. 取名（例如 `family-portfolio`），畫面會顯示一段安裝指令，**只需要複製其中 `--token` 後面那一長串**（或 "Docker" 分頁裡的 token）。這就是 `TUNNEL_TOKEN`，等於密碼，不要貼到聊天室或 GitHub。
3. 到 **Public Hostname** 新增：
   - Subdomain / Domain：例如 `portfolio.example.com`
   - Service：Type 選 **HTTP**，URL 填 **`nginx:8080`**
4. 儲存。（想用本機設定檔而不是 token 的進階做法，見 `deploy/cloudflared/config.example.yml`。）

### 3. 填 `.env`
```bash
cp .env.example .env
```
用文字編輯器打開 `.env`，至少改這幾項：

| 變數 | 填什麼 |
|---|---|
| `TUNNEL_TOKEN` | 上一步複製的 token |
| `SITE_URL` | 對外網址，例如 `https://portfolio.example.com`（要 `https://`、結尾不要斜線） |
| `TRUST_PROXY` | `true`（走 Tunnel 時） |
| `MAX_VIDEO_MB` | 上傳大小上限，預設 200。nginx 和網站都會照這個值限制 |
| `NOINDEX` | 先維持 `true`（不讓 Google 收錄）。準備好公開後改 `false` 再重啟（後台、登入、註冊頁仍一律 noindex）|
| `REGISTRATION` | 先維持 `invite`（要邀請碼才能註冊） |

> `SITE_URL` 會寫進建置結果，**改了之後要加 `--build` 重新建置**（見更新章節）。其他變數改了只要重啟。

### 4. 啟動
```bash
docker compose --profile tunnel up -d --build
```
第一次要下載與建置，約幾分鐘。完成後檢查：
```bash
docker compose ps         # 三個服務都應是 running／healthy
docker compose logs -f    # 看紀錄，按 Ctrl+C 離開（不會停止服務）
```
- 在伺服器本機開 <http://localhost:8080> 就能看到網站。
- 用 `https://你的網域` 能打開代表 Tunnel 也通了。
- **只想在本機試試、不接 Tunnel**：`.env` 把 `SITE_URL` 設 `http://localhost:8080`，指令改成 `docker compose up -d --build`（不加 `--profile tunnel`）。

### 5. 建立第一個管理員
密碼會互動輸入，不會留在指令歷史：
```bash
docker compose exec web node scripts/user.ts create-admin <帳號> <暱稱>
```
然後到網站 `/login/` 登入，進「帳號管理」產生邀請碼給家人註冊。

> 網站只使用暱稱，請勿放入真名或其他個資。

### 常用管理指令
```bash
docker compose exec web node scripts/user.ts list                    # 列出帳號
docker compose exec web node scripts/user.ts reset-password <帳號>   # 忘記密碼（會登出該帳號所有裝置）
docker compose stop        # 暫停全部（資料保留）
docker compose start       # 再啟動
docker compose down        # 移除容器（資料仍在 volume；千萬不要加 -v，那會刪掉資料）
```

## 二、更新版本

```bash
cd family-portfolio
# 更新前先備份（見下一章）
git pull
docker compose --profile tunnel up -d --build
docker compose ps
```
- 資料在 volume，更新不會動到。
- 更新後出問題：`git log --oneline` 找到上一個版本，`git checkout <編號>` 後再執行同一行 `up -d --build`；必要時用備份還原。
- 清理舊映像檔（可選）：`docker image prune`

## 三、備份與還原

要備份的是 volume `portfolio-data`（資料庫＋所有上傳檔）。`.env` 也請另外安全保存（不要放 GitHub）。

先查 volume 的實際名稱（通常是「資料夾名稱_portfolio-data」）：
```bash
docker volume ls | grep portfolio-data
```
以下以 `family-portfolio_portfolio-data` 為例，請換成你看到的名稱。

### 備份
先停下網站，確保資料庫檔案完整，再打包成一個 `.tgz` 檔放在目前資料夾：
```bash
docker compose stop web
docker run --rm -v family-portfolio_portfolio-data:/data -v "$PWD":/backup alpine \
  tar czf /backup/portfolio-$(date +%F).tgz -C /data .
docker compose start web
```
把 `portfolio-日期.tgz` 複製到另一顆硬碟或雲端。建議每週一次，更新前也備份一次。

### 還原
> 還原會**覆蓋**目前的資料，請先確認檔案正確。
```bash
docker compose stop web
docker run --rm -v family-portfolio_portfolio-data:/data -v "$PWD":/backup alpine \
  sh -c "rm -rf /data/* /data/.[!.]* 2>/dev/null; tar xzf /backup/portfolio-2026-01-01.tgz -C /data && chown -R 1000:1000 /data"
docker compose start web
```
（`1000` 是容器內執行網站的 `node` 使用者。把檔名換成你要還原的備份。）還原到新機器時，先照「從零部署」做到第 4 步，再執行上面的還原。

### 確認備份可用（建議做一次）
```bash
tar tzf portfolio-日期.tgz | head     # 應該看得到資料庫檔與 uploads/ 資料夾
```

## 四、故障排除

| 狀況 | 試試 |
|---|---|
| 網域打不開（Cloudflare 1033 / 502） | `docker compose ps` 看 `cloudflared`、`nginx` 是否在跑；`docker compose logs cloudflared` 看 token 是否正確；Public Hostname 的 URL 是否為 `nginx:8080` |
| 登入後表單送出被擋（403） | `SITE_URL` 與實際網址不一致；修正 `.env` 後 `up -d --build` |
| 上傳影片出現 413 | 檔案超過 `MAX_VIDEO_MB`；調高後 `docker compose up -d`（重啟即可）。Cloudflare 免費方案單次請求上限約 100 MB，大影片請改貼 YouTube 不公開連結 |
| 影片不能拖曳進度條 | 檢查是否有其他代理擋掉 `Range`；可用 `curl -I -H "Range: bytes=0-1" http://localhost:8080/media/videos/<檔名>` 應回 `206` |
| 想確認沒被搜尋引擎收錄 | `curl -I http://localhost:8080/` 應看到 `X-Robots-Tag: noindex, nofollow, noarchive` |
| 磁碟空間不足 | `docker system df`；上傳檔在 volume 內，需要時再擴充磁碟 |

## 驗證部署（自動化）

CI 的 `docker` job 會自動驗證映像能建置、compose 能啟動，並檢查 X-Robots-Tag、Range 206、413；細節見 README 的「CI」。自己的機器上要複查，可執行 `bash scripts/ci-smoke.sh`（僅限拋棄式環境，會建立測試帳號）。

## 五、安全提醒

- `.env`、Tunnel token、備份檔**絕對不要**提交到 git（已在 `.gitignore`）。token 外洩時，到 Cloudflare Tunnel 頁面 **Refresh token** 即可作廢舊的。
- 網站與 nginx 只綁 `127.0.0.1`，對外只經由 Tunnel。
- 長期不需要新帳號時把 `REGISTRATION` 設成 `closed`。
