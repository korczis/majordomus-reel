#!/usr/bin/env bash
# Checks the published site: the page carries its chapters, and the video and poster are
# served the way a <video> element needs them (200, the right type, byte ranges).
set -euo pipefail
URL="${URL:-https://korczis.github.io/majordomus-reel/}"

page=$(curl -fsSL "$URL")
chapters=$(printf '%s' "$page" | grep -c '<button data-t=' || true)
[ "$chapters" -gt 0 ] || { echo "no chapters on $URL" >&2; exit 1; }
printf '%s' "$page" | grep -q 'src="reel.mp4"' || { echo "no video on $URL" >&2; exit 1; }

head=$(curl -fsSI "${URL}reel.mp4")
printf '%s' "$head" | grep -qi '^content-type: video/mp4' || { echo "reel.mp4 is not video/mp4" >&2; exit 1; }
range=$(curl -fsS -o /dev/null -w '%{http_code}' -r 0-1023 "${URL}reel.mp4")
[ "$range" = 206 ] || { echo "reel.mp4 ignores byte ranges ($range)" >&2; exit 1; }
curl -fsSI "${URL}poster.jpg" | grep -qi '^content-type: image/jpeg' || { echo "no poster" >&2; exit 1; }

echo "ok: $URL, $chapters chapters, reel.mp4 seekable, poster served"
