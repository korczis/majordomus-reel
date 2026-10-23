#!/usr/bin/env bash
# Builds _site/ and publishes it as the gh-pages branch: one orphan commit per deploy, so a
# re-encoded video never accumulates in history. Overrides as for site/build.mjs.
set -euo pipefail
cd "$(dirname "$0")/.."

node site/build.mjs
src=$(git rev-parse --short HEAD)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

cp -R _site/. "$tmp/"
git -C "$tmp" init -q -b gh-pages
git -C "$tmp" add -A
git -C "$tmp" commit -q -m "deploy: site from $src"
git -C "$tmp" push -q --force "$(git remote get-url origin)" gh-pages
echo "deployed $src to gh-pages"
