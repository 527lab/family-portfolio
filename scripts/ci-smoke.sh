#!/usr/bin/env bash
# CI 煙霧測試：compose 已啟動（nginx 在 127.0.0.1:8080）後，用 curl 驗證 P3 的三件事：
#   1. X-Robots-Tag  2. 影片 Range 回 206  3. 超過 MAX_VIDEO_MB 回 413
# 全部使用假帳密與假資料，不需任何真實 token。
set -euo pipefail

BASE=${BASE:-http://127.0.0.1:8080}
PASS='ci-fake-password-123'
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

# 假 MP4：合法的 ftyp 檔頭 + 填充（通過網站的檔頭檢查）
make_mp4() { # <位元組數> <檔名>
  printf '\x00\x00\x00\x10ftypisom\x00\x00\x00\x00' > "$2"
  head -c "$(($1 - 16))" /dev/zero >> "$2"
}

echo "== 建立假管理員 =="
docker compose exec -T web node --input-type=module -e "
import { createUser } from './src/server/auth.ts';
await createUser({ username: 'ciadmin', displayName: 'CI 管理員', password: '$PASS', role: 'admin', status: 'active' });
"

echo "== 1. X-Robots-Tag =="
hdr=$(curl -sSI "$BASE/")
echo "$hdr"
echo "$hdr" | grep -i '^x-robots-tag: noindex' >/dev/null

echo "== 登入並上傳 300 KB 假影片（MAX_VIDEO_MB=1 之內）=="
code=$(curl -sS -o "$WORK/login.html" -w '%{http_code}' -c "$WORK/jar" -H "Origin: $BASE" \
  -F username=ciadmin -F "password=$PASS" "$BASE/login/")
echo "登入回應：$code"
if ! grep -q sid "$WORK/jar"; then cat "$WORK/login.html"; docker compose logs --no-color web | tail -20; exit 1; fi
make_mp4 307200 "$WORK/small.mp4"
code=$(curl -sS -o /dev/null -w '%{http_code}' -b "$WORK/jar" -H "Origin: $BASE" \
  -F category=piano -F title=ci-test -F date=2026-01-01 -F status=published \
  -F video_mode=file -F "video=@$WORK/small.mp4;type=video/mp4" "$BASE/studio/new/")
echo "上傳回應：$code"
[ "$code" = 303 ]

echo "== 2. Range 回 206 =="
vid=$(curl -sS "$BASE/piano/" | grep -oE '/media/videos/[a-f0-9]{32}\.mp4' | head -1 || true)
if [ -z "$vid" ]; then
  # 備援：卡片不一定直接列出影片網址，改從作品頁找
  wid=$(curl -sS "$BASE/piano/" | grep -oE '/works/[0-9]+/' | head -1)
  vid=$(curl -sS "$BASE$wid" | grep -oE '/media/videos/[a-f0-9]{32}\.mp4' | head -1)
fi
echo "影片：$vid"
curl -sS -D "$WORK/range.h" -o "$WORK/range.bin" -H 'Range: bytes=0-1' "$BASE$vid"
cat "$WORK/range.h"
head -1 "$WORK/range.h" | grep -q ' 206'
grep -qi '^content-range: bytes 0-1/307200' "$WORK/range.h"
[ "$(wc -c < "$WORK/range.bin")" -eq 2 ]
grep -i '^x-robots-tag: noindex' "$WORK/range.h" >/dev/null

echo "== 3. 超過 MAX_VIDEO_MB 回 413 =="
make_mp4 2097152 "$WORK/big.mp4"
code=$(curl -sS -o /dev/null -w '%{http_code}' -b "$WORK/jar" -H "Origin: $BASE" \
  -F category=piano -F title=too-big -F date=2026-01-01 -F status=published \
  -F video_mode=file -F "video=@$WORK/big.mp4;type=video/mp4" "$BASE/studio/new/")
echo "回應：$code"
[ "$code" = 413 ]

echo "全部通過"
