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

short=""
if printf '%s' "$page" | grep -q 'src="short.mp4"'; then
  curl -fsSI "${URL}short.mp4" | grep -qi '^content-type: video/mp4' || { echo "short.mp4 missing" >&2; exit 1; }
  curl -fsSI "${URL}short-poster.jpg" | grep -qi '^content-type: image/jpeg' || { echo "no short poster" >&2; exit 1; }
  short=", short cut served"
fi

# the film states the newest release's facts: the version the page names is the latest release
shown=$(printf '%s' "$page" | sed -n 's/.*data-majordomus-version="\([^"]*\)".*/\1/p' | head -1)
[ -n "$shown" ] || { echo "the page names no Majordomus release its facts come from" >&2; exit 1; }
latest=$(curl -fsSL https://api.github.com/repos/korczis/prismatic-majordomus/releases/latest \
  | sed -n 's/^  "tag_name": "v\{0,1\}\([^"]*\)".*/\1/p')
[ -n "$latest" ] || { echo "cannot read the latest Majordomus release" >&2; exit 1; }
[ "$shown" = "$latest" ] || {
  echo "the film states Majordomus $shown; the latest release is $latest: re-render and deploy" >&2
  exit 1
}

echo "ok: $URL, $chapters chapters, reel.mp4 seekable, poster served$short, facts of $shown (latest)"
