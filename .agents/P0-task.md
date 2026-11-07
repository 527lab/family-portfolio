# P0：作品集網站規格與骨架
對象：David 的家人，升學面試用作品集（目標科系含中山大學劇場藝術管理學系、靜宜大學台灣文學系、亞洲大學某系）。網站只用暱稱，不放真名或其他個資。內容：畫作、攝影作品、鋼琴（比賽演奏影片、檢定證書）、自我介紹。繁體中文。
技術：Astro 最新版靜態輸出（輕量，必要時才加互動元件）。部署：David 家用伺服器上 Docker + nginx，經 Cloudflare Tunnel 接到他在 Cloudflare 的網域；影片比較「自架檔案」與「YouTube 不公開連結」。
任務：1) docs/spec.md（頁面結構、作品資料格式、讓非工程師家人能自己新增作品的流程、可設 noindex）；2) 可 build 的 Astro 骨架與假資料範例；3) Dockerfile、nginx 設定、docker-compose（含 cloudflared 範例，token 用環境變數）；4) README 中文含本機預覽與部署步驟。
規則：不放金鑰、不放真實個資；分支 p0，commit、push、gh pr create 到 main，PR 內文中文。
