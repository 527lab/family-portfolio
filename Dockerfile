# ---- 建置階段：產生靜態網站 ----
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# NOINDEX=true（預設）→ 搜尋引擎不收錄；正式公開時以 --build-arg NOINDEX=false 建置
ARG NOINDEX=true
ARG SITE_URL=http://localhost:8080
ENV NOINDEX=$NOINDEX SITE_URL=$SITE_URL
RUN npm run build

# ---- 執行階段：nginx 提供靜態檔 ----
FROM nginx:1.27-alpine
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
# 自架影片以 volume 掛到 /usr/share/nginx/html/videos
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
