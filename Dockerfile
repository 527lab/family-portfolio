# Node 需求：Astro 7 要求 Node >= 22.23.4，這裡用 Node 24（LTS）。
# 此外 scripts/user.ts 直接以 Node 執行 TypeScript（免編譯），也需要 22.23.4 以上。

# ---- 建置階段 ----
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# SITE_URL 會寫進建置結果，用來信任 Cloudflare Tunnel 轉送的對外網域（HTTPS 表單 POST 需要）
ARG SITE_URL=http://localhost:8080
ENV SITE_URL=$SITE_URL
RUN npm run build

# ---- 執行階段 ----
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4321 DATA_DIR=/data
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
# 管理指令（建立管理員、重設密碼）需要的原始碼
COPY src/server ./src/server
COPY scripts ./scripts
# /data：SQLite 資料庫與上傳檔，掛 volume 才不會在重建容器時消失
RUN mkdir -p /data && chown -R node:node /data
VOLUME /data
USER node
EXPOSE 4321
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s CMD wget -qO- http://127.0.0.1:4321/robots.txt >/dev/null || exit 1
CMD ["node", "dist/server/entry.mjs"]
