#!/usr/bin/env bash
# One command: ./make-reel.sh  ->  majordomus-reel.mp4 (1080x1920, 30 fps, voice-over + pad)
# Overrides: VOICE=en-GB-RyanNeural  MUSIC=0  FPS=60  OUT=/path/out.mp4  SCENES=scenes.json
set -euo pipefail
cd "$(dirname "$0")"

for tool in node ffmpeg ffprobe uvx; do
  command -v "$tool" >/dev/null || { echo "missing: $tool" >&2; exit 1; }
done
[ -d node_modules/puppeteer-core ] || npm install --silent --no-audit --no-fund puppeteer-core@23.11.1

node render.mjs
[ "${OPEN:-1}" = 1 ] && open "${OUT:-majordomus-reel.mp4}" || true
