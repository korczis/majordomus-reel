#!/usr/bin/env bash
# Checks the published site against its own data (project.reel-site-is-derived,
# project.reel-tailored-per-device, project.reel-facts-are-derived): every cut's route answers with
# its own canonical, every format it offers is served as video/mp4 with byte ranges (so chapters
# can seek), every poster and share picture is a JPEG, every route's metadata passes the same gate
# as the build (site/seo.mjs --live), and the release the page names is the latest Majordomus
# release, not a pending one. A format a cut still lacks is listed on every run. Every language's
# routes are checked the same way, from its own <id>/data/reel.json (project.reel-bilingual).
set -euo pipefail
URL="${URL:-https://korczis.github.io/majordomus-reel/}"
cd "$(dirname "$0")/.."

URL="$URL" node --input-type=module <<'JS'
const base = process.env.URL;
const fail = [];
const get = async (u, init) => { const r = await fetch(u, init); return r; };
const root = await (await get(new URL('data/reel.json', base))).json();
const sites = [root];
for (const l of (root.languages || []).filter((x) => x.id !== root.lang)) {
  const r = await get(new URL(l.data, base));
  if (!r.ok) { fail.push(`${l.data}: ${r.status} (the ${l.id} site is not deployed)`); continue; }
  sites.push(await r.json());
}
let served = 0;
let routes = 0;
const seen = new Set();
for (const data of sites) for (const c of data.cuts) {
  routes++;
  const route = new URL(c.page, base).href;
  const r = await get(route);
  const html = r.ok ? await r.text() : '';
  if (!r.ok) fail.push(`${route}: ${r.status}`);
  else if (!html.includes(`<link rel="canonical" href="${route}">`)) fail.push(`${route}: not its own canonical`);
  for (const [id, f] of Object.entries(c.formats)) {
    // a language that plays another's cut shares its media: check each file once
    if (seen.has(f.video)) continue;
    seen.add(f.video);
    const v = new URL(f.video, base).href;
    const head = await get(v, { method: 'HEAD' });
    if (!/^video\/mp4/.test(head.headers.get('content-type') || '')) fail.push(`${v}: not video/mp4 (${head.status})`);
    const range = await get(v, { headers: { Range: 'bytes=0-1023' } });
    await range.body?.cancel();
    if (range.status !== 206) fail.push(`${v}: ignores byte ranges (${range.status})`);
    for (const img of [f.poster, c.og]) {
      const i = await get(new URL(img, base).href, { method: 'HEAD' });
      if (!/^image\/jpeg/.test(i.headers.get('content-type') || '')) fail.push(`${img}: not a JPEG (${i.status})`);
    }
    served++;
  }
}
const gaps = [...new Set(sites.flatMap((d) => d.gaps || []))];
gaps.forEach((g) => console.log(`gap  ${g}`));
fail.forEach((f) => console.error(`FAIL ${f}`));
console.log(`media: ${routes} routes in ${sites.length} language(s), ${served} cut formats served seekable`
  + `${gaps.length ? `, ${gaps.length} formats or languages not rendered yet (played by their nearest)` : ''}`);
process.exit(fail.length ? 1 : 0);
JS

node site/seo.mjs --live "$URL"

# the reel states the newest release's facts: the version the page names is the latest release,
# and a pre-rendered cut is not published while its release is pending
page=$(curl -fsSL "$URL")
shown=$(printf '%s' "$page" | sed -n 's/.*data-majordomus-version="\([^"]*\)".*/\1/p' | head -1)
pending=$(printf '%s' "$page" | sed -n 's/.*data-majordomus-pending="\([^"]*\)".*/\1/p' | head -1)
[ -n "$shown" ] || { echo "the page names no Majordomus release its facts come from" >&2; exit 1; }
[ "$pending" != true ] || { echo "the page states Majordomus $shown, release pending: tag it, rebuild, deploy" >&2; exit 1; }
latest=$(curl -fsSL https://api.github.com/repos/korczis/prismatic-majordomus/releases/latest \
  | sed -n 's/^  "tag_name": "v\{0,1\}\([^"]*\)".*/\1/p')
[ -n "$latest" ] || { echo "cannot read the latest Majordomus release" >&2; exit 1; }
[ "$shown" = "$latest" ] || {
  echo "the reel states Majordomus $shown; the latest release is $latest: re-render and deploy" >&2
  exit 1
}
echo "ok: $URL, facts of $shown (latest)"
