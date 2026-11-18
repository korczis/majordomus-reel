// The site's gate (project.reel-site-is-derived). First the templates: a title, a length or a
// count typed into them fails. Then the built or the live site in the local Chrome, as a phone, a
// tablet and a desktop (one device per format in formats.json) and at every width the layout must
// hold (320, 390, 768, 1024, 1440): no horizontal overflow, no console error, no failed request
// (an aborted video range request is how a browser stops buffering, not a failure); the format
// each screen gets, or the nearest with its note; chapters, J/K and the full viewport; the
// carousel by key, arrow, dot and swipe; the browser's filter and search and their deep link; the
// gallery's viewer, Escape and full viewport; every route's own video and share picture; and
// every link the page carries.
//
//   node site/test.mjs                    -> serves _site/ (with byte ranges) and tests it
//   node site/test.mjs <dir>              -> serves that build
//   node site/test.mjs https://...        -> tests the live site
//   LINKS=0 node site/test.mjs            -> skips the outbound link check
//   ONLY=phone node site/test.mjs         -> one format's device, no width sweep (a quick rerun)
import { createServer } from 'node:http';
import { createReadStream, statSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { length, plural } from './view.mjs';
import { jpegSize } from './seo.mjs';

const SITE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(SITE);
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const FORMATS = JSON.parse(readFileSync(join(ROOT, 'formats.json'), 'utf8')).formats;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.mp4': 'video/mp4', '.jpg': 'image/jpeg', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.vtt': 'text/vtt', '.txt': 'text/plain', '.xml': 'application/xml',
  '.webmanifest': 'application/manifest+json' };
// the widths the layout must hold without scrolling sideways
const WIDTHS = [320, 390, 768, 1024, 1440];

const failures = [];
const passes = [];
const check = (ok, what) => (ok ? passes : failures).push(what);

// ---- the templates type nothing the data gives -------------------------------------------------
// a cut's, a category's or a use case's title, a length, or a count of what the data counts
const typedIn = (data) => {
  const titles = [...data.cuts.map((c) => c.title), ...data.categories.map((c) => c.title),
    ...data.categories.flatMap((c) => c.use_cases.map((u) => u.title))].filter((t) => t.length >= 6);
  const patterns = [
    [/\b\d+(?:\.\d+)?\s?(?:min|minutes?|s|sec|seconds?)(?![\w-])/g, 'a typed length'],
    [/(?<![\w.:-])\d{1,2}:\d\d(?![\w:])/g, 'a typed clock time'],
    [/\b(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(?:stories|story|short films?|cuts?|chapters?|scenes?|acts?|use cases?|formats?|categories|decisions|rules)\b/gi,
      'a typed count'],
  ];
  const found = [];
  for (const file of ['index.html', 'player.html', 'app.js', 'view.mjs']) {
    const text = readFileSync(join(SITE, file), 'utf8');
    text.split('\n').forEach((raw, i) => {
      // code and placeholders are not copy: a template's {{name}}, a script's ${expr}
      const line = raw.replace(/\{\{[a-zA-Z_]+\}\}/g, '').replace(/\$\{[^}]*\}/g, '');
      if (/^\s*(?:\/\/|\*)/.test(line)) return;
      for (const [re, what] of patterns) {
        for (const m of line.matchAll(re)) found.push(`site/${file}:${i + 1}: ${what}: "${m[0]}"`);
      }
      for (const t of titles) if (line.includes(`>${t}<`) || line.includes(`'${t}'`)) found.push(`site/${file}:${i + 1}: a typed title: "${t}"`);
    });
  }
  return found;
};

// a static server that answers byte ranges, as GitHub Pages does, so seeking works locally
function serve(dir) {
  return new Promise((res) => {
    const server = createServer((req, rsp) => {
      let p = join(dir, decodeURIComponent(new URL(req.url, 'http://x').pathname));
      if (existsSync(p) && statSync(p).isDirectory()) p = join(p, 'index.html');
      if (!existsSync(p)) { rsp.writeHead(404); rsp.end(); return; }
      const size = statSync(p).size;
      const type = TYPES[extname(p)] || 'application/octet-stream';
      const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
      if (m) {
        const start = m[1] ? Number(m[1]) : size - Number(m[2]);
        const end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
        rsp.writeHead(206, { 'content-type': type, 'accept-ranges': 'bytes',
          'content-range': `bytes ${start}-${end}/${size}`, 'content-length': end - start + 1 });
        if (req.method === 'HEAD') rsp.end(); else createReadStream(p, { start, end }).pipe(rsp);
      } else {
        rsp.writeHead(200, { 'content-type': type, 'accept-ranges': 'bytes', 'content-length': size });
        if (req.method === 'HEAD') rsp.end(); else createReadStream(p).pipe(rsp);
      }
    });
    server.listen(0, '127.0.0.1', () => res({ server, url: `http://127.0.0.1:${server.address().port}/` }));
  });
}

// a viewport for each format: a common device whose shape the format's media query takes
const DEVICES = {
  phone: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  tablet: { width: 1024, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: true },
  desktop: { width: 1440, height: 900, deviceScaleFactor: 1 },
};
const viewportOf = (w) => (w <= 430 ? { width: w, height: w < 360 ? 640 : 844, deviceScaleFactor: 2,
  isMobile: true, hasTouch: true } : { width: w, height: w < 900 ? 1024 : 900, deviceScaleFactor: 1 });

const target = process.argv[2];
const live = target && /^https?:/.test(target);
const { server, url: BASE } = live ? { url: target } : await serve(target || join(ROOT, '_site'));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true,
  args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
const data = await (await fetch(new URL('data/reel.json', BASE))).json();
const stories = data.cuts.filter((c) => c.kind === 'story');
const film = data.cuts.find((c) => c.id === 'film');
const settle = (page, fn, arg, timeout = 15000) => page.waitForFunction(fn, { timeout }, arg).then(() => true,
  () => false);
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

const typed = typedIn(data);
check(typed.length === 0, `the templates type no title, length or count${typed.length ? `: ${typed.slice(0, 6).join('; ')}` : ''}`);

// a page that records what goes wrong on it
const open = async (viewport, path = '', { reduce = false } = {}) => {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${m.text()} ${m.location()?.url || ''}`); });
  page.on('response', (r) => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
  page.on('requestfailed', (r) => {
    const aborted = r.failure()?.errorText === 'net::ERR_ABORTED';
    if (!(aborted && (r.resourceType() === 'media' || /\.mp4$/.test(r.url())))) {
      errors.push(`failed ${r.url()} ${r.failure()?.errorText}`);
    }
  });
  await page.setViewport(viewport);
  if (reduce) await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.goto(new URL(path, BASE).href, { waitUntil: 'networkidle2', timeout: 60000 });
  await settle(page, () => document.documentElement.dataset.ready === '1');
  return { page, errors };
};
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - innerWidth);

// ---- every width: the layout holds, on the root and on a story's route ------------------------
for (const w of process.env.ONLY ? [] : WIDTHS) {
  for (const path of ['', stories[0]?.page].filter((p) => p !== undefined)) {
    const { page, errors } = await open(viewportOf(w), path);
    const over = await overflow(page);
    check(over <= 0, `${w}px /${path}: no horizontal overflow (${over}px over)`);
    // the viewer open must hold too
    await page.evaluate(() => document.querySelector('#gallery [data-open]').click());
    await settle(page, () => !document.getElementById('viewer').classList.contains('hidden'));
    const overOpen = await overflow(page);
    check(overOpen <= 0, `${w}px /${path}: no horizontal overflow with the viewer open (${overOpen}px over)`);
    check(errors.length === 0, `${w}px /${path}: no console error or failed request${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);
    await page.close();
  }
}

// ---- every format's device: the player, the carousel, the browser and the viewer --------------
for (const f of FORMATS.filter((x) => !process.env.ONLY || x.id === process.env.ONLY)) {
  const device = DEVICES[f.id];
  if (!device) { failures.push(`${f.id}: no test device declared for this format`); continue; }
  const { page, errors } = await open(device);
  const tag = `${f.id} ${device.width}x${device.height}`;

  // the page states what the data says
  const counts = await page.evaluate(() => ({
    total: document.getElementById('total-count').textContent,
    slides: document.querySelectorAll('#carousel [data-carousel-item]').length,
    tiles: [...document.querySelectorAll('#gallery [data-tile]')].map((li) => ({ id: li.dataset.tile,
      length: li.querySelector('[data-length]').textContent.trim(),
      title: li.querySelector('h3').textContent.trim() })),
  }));
  check(counts.total === String(stories.length) && counts.slides === stories.length
    && counts.tiles.length === stories.length, `${tag}: ${plural(stories.length, 'story', 'stories')} in the count, the carousel and the gallery`);
  const wrong = counts.tiles.filter((t) => {
    const c = stories.find((s) => s.id === t.id);
    return !c || t.title !== c.title || t.length !== length(c.duration);
  });
  check(wrong.length === 0, `${tag}: every tile's title and length are its cut's${wrong.length ? ` (not: ${wrong.map((t) => t.id).join(', ')})` : ''}`);

  // the format the page chose is the one formats.json declares for this shape, or its nearest
  const expect = film.formats[f.id] ? f.id : film.fallback[f.id];
  const chosen = await page.$eval('#stage', (s) => s.dataset.format);
  check(chosen === expect, `${tag}: auto plays the film's ${expect} cut${expect !== f.id ? ` (no ${f.id} cut yet)` : ''} (got ${chosen})`);
  const noteShown = await page.$eval('#stage-note', (n) => !n.classList.contains('hidden') && n.textContent.length > 20);
  check(noteShown === (expect !== f.id), `${tag}: the fallback note is ${expect !== f.id ? 'shown' : 'hidden'}`);
  check(await settle(page, () => document.getElementById('player').readyState >= 1), `${tag}: the film's video loads`);

  // every chapter link seeks, and the chapter it lands on is marked current
  let seeks = 0;
  for (const ch of film.chapters) {
    await page.evaluate((t) => document.querySelector(`#chapters a[data-t="${t}"]`).click(), ch.t);
    if (await settle(page, (t) => Math.abs(document.getElementById('player').currentTime - t) < 1.5
      && document.querySelector(`#chapters a[data-t="${t}"]`).getAttribute('aria-current') === 'true', ch.t, 8000)) seeks++;
  }
  check(seeks === film.chapters.length, `${tag}: ${seeks}/${film.chapters.length} chapter links seek and mark`);
  await page.evaluate(() => document.getElementById('player').pause());
  // J and K step through the chapters
  await page.evaluate((t) => { document.getElementById('player').currentTime = t; }, film.chapters[3].t + 1);
  await settle(page, (t) => document.getElementById('player').currentTime >= t, film.chapters[3].t);
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press('k');
  check(await settle(page, (t) => Math.abs(document.getElementById('player').currentTime - t) < 1.5,
    film.chapters[4].t), `${tag}: K moves to the next chapter`);
  await page.keyboard.press('j');
  check(await settle(page, (t) => Math.abs(document.getElementById('player').currentTime - t) < 1.5,
    film.chapters[3].t), `${tag}: J moves to the previous chapter`);
  // each format the film has plays that format; one it lacks is disabled
  for (const g of FORMATS) {
    const disabled = await page.$eval(`#watch [data-format="${g.id}"]`, (b) => b.disabled);
    if (!film.formats[g.id]) { check(disabled, `${tag}: the ${g.id} button is disabled (no ${g.id} cut)`); continue; }
    await page.click(`#watch [data-format="${g.id}"]`);
    check(await settle(page, (id) => document.getElementById('player').currentSrc.includes(`-${id}.mp4`), g.id),
      `${tag}: the ${g.id} button plays the ${g.id} cut`);
  }
  await page.click('#watch [data-format="auto"]');
  check(await settle(page, (id) => document.getElementById('player').currentSrc.includes(`-${id}.mp4`), expect),
    `${tag}: Auto returns to ${expect}`);
  // the full viewport fills it, Escape leaves it
  await page.click('#theater');
  const filled = await page.$eval('#stage', (s) => { const r = s.getBoundingClientRect(); return r.width >= innerWidth - 1 && r.height >= innerHeight - 1; });
  check(filled, `${tag}: the full viewport fills the viewport`);
  await page.keyboard.press('Escape');
  check(!(await page.evaluate(() => document.body.classList.contains('theater'))), `${tag}: Escape leaves the full viewport`);

  // the carousel: keys, arrows, dots and a swipe move it
  const active = () => page.evaluate(() => [...document.querySelectorAll('#carousel [data-carousel-item]')]
    .findIndex((s) => s.getAttribute('aria-hidden') === 'false'));
  await page.evaluate(() => document.getElementById('carousel').scrollIntoView({ block: 'center', behavior: 'instant' }));
  await page.focus('#carousel');
  const a0 = await active();
  await page.keyboard.press('ArrowRight');
  const a1 = await active();
  await page.keyboard.press('ArrowLeft');
  const a2 = await active();
  check(a1 === (a0 + 1) % stories.length && a2 === a0, `${tag}: the arrow keys move the carousel (${a0}->${a1}->${a2})`);
  // the controls sit above the carousel: bring them out from under the sticky header first
  await page.$eval('[data-carousel-next]', (b) => b.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await page.click('[data-carousel-next]');
  const a3 = await active();
  await page.click('[data-carousel-prev]');
  const a4 = await active();
  check(a3 === (a0 + 1) % stories.length && a4 === a0, `${tag}: the arrow buttons move the carousel (${a0}->${a3}->${a4})`);
  await page.click(`#carousel-dots [data-carousel-slide-to="${stories.length - 1}"]`);
  check((await active()) === stories.length - 1, `${tag}: a dot moves the carousel to its story`);
  const box = await page.$eval('#carousel', (el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  const before = await active();
  await page.mouse.move(box.x + box.w * 0.8, box.y + box.h * 0.85);
  await page.mouse.down();
  await page.mouse.move(box.x + box.w * 0.2, box.y + box.h * 0.85, { steps: 6 });
  await page.mouse.up();
  const after = await active();
  check(after === (before + 1) % stories.length && !(await page.evaluate(() => document.getElementById('viewer')
    .classList.contains('flex'))), `${tag}: a swipe moves the carousel and opens nothing (${before}->${after})`);
  check(await page.evaluate(() => document.querySelector('#carousel [aria-hidden="false"] a[data-open]').getAttribute('href')
    .endsWith('/')), `${tag}: the active slide links to its story's own route`);

  // the browser: a category and a search narrow the gallery, and the address keeps them
  const cat = stories[stories.length - 1].category;
  await page.click(`#filters [data-category="${cat}"]`);
  const one = await page.evaluate(() => ({ shown: document.getElementById('shown-count').textContent,
    visible: [...document.querySelectorAll('#gallery [data-tile]')].filter((li) => !li.hidden).map((li) => li.dataset.category),
    url: location.search }));
  check(one.visible.every((c) => c === cat) && one.shown === String(one.visible.length) && one.url.includes(`category=${cat}`),
    `${tag}: the ${cat} chip shows its ${plural(one.visible.length, 'story', 'stories')} and writes ?category=`);
  await page.click(`#filters [data-category=""]`);
  // a search word taken from a use case one story shows
  const useCase = data.categories.find((c) => c.id === stories[0].category).use_cases[0];
  const word = useCase.title.split(/\s+/).sort((a, b) => b.length - a.length)[0].toLowerCase();
  await page.type('#q', word);
  const searched = await settle(page, (q) => new URLSearchParams(location.search).get('q') === q, word, 4000);
  const hits = await page.evaluate(() => [...document.querySelectorAll('#gallery [data-tile]')].filter((li) => !li.hidden).map((li) => li.dataset.tile));
  check(searched && hits.includes(stories[0].id) && hits.length >= 1,
    `${tag}: searching "${word}" finds ${stories[0].id} and writes ?q= (${hits.length} shown)`);
  // the deep link is restored on reload
  const deep = `?category=${cat}&q=${encodeURIComponent(word)}`;
  await page.goto(new URL(deep, BASE).href, { waitUntil: 'networkidle2' });
  await settle(page, () => document.documentElement.dataset.ready === '1');
  const restored = await page.evaluate(() => ({ q: document.getElementById('q').value,
    pressed: document.querySelector('#filters [aria-pressed="true"]')?.dataset.category,
    count: document.getElementById('shown-count').textContent,
    visible: [...document.querySelectorAll('#gallery [data-tile]')].filter((li) => !li.hidden).length }));
  check(restored.q === word && restored.pressed === cat && restored.count === String(restored.visible),
    `${tag}: ${deep} is restored on load (${restored.count} of ${stories.length})`);
  await page.goto(BASE, { waitUntil: 'networkidle2' });
  await settle(page, () => document.documentElement.dataset.ready === '1');

  // the gallery: a tile opens its story in the viewer; Escape closes it; it fills the viewport
  for (const s of stories) {
    await page.evaluate((id) => document.querySelector(`#gallery [data-tile="${id}"] [data-open]`).click(), s.id);
    const opened = await settle(page, (id) => !document.getElementById('viewer').classList.contains('hidden')
      && document.getElementById('viewer-player').currentSrc.includes(`/${id}-`)
      && new URLSearchParams(location.search).get('play') === id, s.id);
    const want = s.formats[f.id] ? f.id : s.fallback[f.id];
    const noted = await page.$eval('#viewer-note', (n) => !n.classList.contains('hidden'));
    check(opened && (await page.$eval('#viewer', (v) => v.dataset.format)) === want && noted === (want !== f.id),
      `${tag}: the ${s.id} tile opens it in the viewer as ${want}${want !== f.id ? ', with the note' : ''}`);
    await page.keyboard.press('Escape');
    check(await settle(page, () => document.getElementById('viewer').classList.contains('hidden')
      && !new URLSearchParams(location.search).has('play'), null, 4000), `${tag}: Escape closes the ${s.id} viewer`);
  }
  await page.goto(new URL(`?play=${stories[0].id}&full=1`, BASE).href, { waitUntil: 'networkidle2' });
  const deepViewer = await settle(page, (id) => !document.getElementById('viewer').classList.contains('hidden')
    && document.getElementById('viewer').hasAttribute('data-full')
    && document.getElementById('viewer-player').currentSrc.includes(`/${id}-`), stories[0].id);
  const fills = await page.$eval('#viewer-box', (b) => b.getBoundingClientRect().height >= innerHeight - 1);
  check(deepViewer && fills, `${tag}: ?play=${stories[0].id}&full=1 opens it filling the viewport`);
  await page.click('#viewer-full');
  check(!(await page.evaluate(() => document.getElementById('viewer').hasAttribute('data-full'))), `${tag}: the button leaves the full viewport`);
  await page.click('#viewer-close');
  await settle(page, () => document.getElementById('viewer').classList.contains('hidden'));

  // every use-case moment opens the film there
  const seekLinks = await page.$$eval('#use-cases [data-seek]', (as) => as.map((a) => Number(a.dataset.t)));
  let moments = 0;
  for (const t of seekLinks) {
    await page.evaluate((x) => document.querySelector(`#use-cases [data-seek][data-t="${x}"]`).click(), t);
    if (await settle(page, (x) => Math.abs(document.getElementById('player').currentTime - x) < 1.5
      && document.getElementById('player').currentSrc.includes('/film-'), t)) moments++;
  }
  check(moments === seekLinks.length, `${tag}: ${moments}/${seekLinks.length} use-case moments open the film there`);
  check(errors.length === 0, `${tag}: no console error or failed request${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);
  await page.close();
}

// ---- motion: previews and autoplay only for a viewer who allows them --------------------------
for (const reduce of [false, true]) {
  const { page } = await open(DEVICES.desktop, '', { reduce });
  await page.evaluate(() => document.getElementById('carousel').scrollIntoView({ block: 'center', behavior: 'instant' }));
  await page.mouse.move(2, 2);
  await pause(1200);
  const moving = await page.evaluate(() => {
    const v = document.querySelector('#carousel [aria-hidden="false"] video[data-preview]');
    return Boolean(v && v.src && !v.classList.contains('hidden'));
  });
  const landscape = stories.some((s) => Object.keys(s.formats).some((id) => id !== 'phone'));
  check(reduce ? !moving : (moving || !landscape), `prefers-reduced-motion ${reduce ? 'reduce' : 'no-preference'}: `
    + `the active slide's preview ${reduce ? 'stays a still' : 'plays muted'}`);
  await page.close();
}

// ---- every route: its own video, at its moment, and its share picture -------------------------
{
  const page = await browser.newPage();
  await page.setViewport(DEVICES.desktop);
  for (const c of data.cuts) {
    const t = c.chapters[Math.min(2, c.chapters.length - 1)].t;
    await page.goto(new URL(`${c.page}?t=${t}`, BASE).href, { waitUntil: 'networkidle2' });
    const ok = await settle(page, (x) => document.getElementById('player').currentSrc.includes(`/${x.id}-`)
      && Math.abs(document.getElementById('player').currentTime - x.t) < 1.5, { id: c.id, t });
    check(ok, `/${c.page}?t=${t}: opens ${c.id} at ${t}s`);
    const images = await page.$$eval('meta[property="og:image"]', (ms) => ms.map((m) => m.content));
    const local = images.map((u) => new URL(u.slice(data.site.length), BASE).href);
    const sizes = await Promise.all(local.map(async (u) => {
      const r = await fetch(u);
      return r.ok && /^image\/jpeg/.test(r.headers.get('content-type') || '') ? jpegSize(Buffer.from(await r.arrayBuffer())) : null;
    }));
    check(sizes[0]?.width === 1200 && sizes[0]?.height === 630 && sizes.slice(1).every(Boolean),
      `/${c.page}: its og:image is served, ${sizes.map((s) => (s ? `${s.width}x${s.height}` : 'missing')).join(' + ')}`);
    const h1 = await page.$eval('h1', (h) => h.textContent.trim());
    check(c.id === 'film' || h1 === c.title, `/${c.page}: its h1 is its title`);
  }
  // every link on the root page answers (the site's own and majordomus.dev's use-case pages)
  if (process.env.LINKS !== '0') {
    await page.goto(BASE, { waitUntil: 'networkidle2' });
    const links = [...new Set(await page.$$eval('a[href], link[href], img[src], source[src], track[src]',
      (els) => els.map((e) => e.href || e.src).filter((h) => /^https?:/.test(h))))];
    const bad = [];
    // a few at a time, and a link that fails to connect is asked once more with a GET after a
    // pause: a host that throttles a burst of HEADs (YouTube does) is not a broken link
    const ask = async (u) => {
      let r = await fetch(u, { method: 'HEAD', redirect: 'follow' });
      if (r.status === 405 || r.status === 403) r = await fetch(u, { redirect: 'follow' });
      return r;
    };
    const queue = [...links];
    await Promise.all(Array.from({ length: 8 }, async () => {
      for (let l = queue.shift(); l; l = queue.shift()) {
        const u = l.replace(/#.*$/, '');
        let r = await ask(u).catch(() => null);
        if (!r) r = await pause(1500).then(() => fetch(u, { redirect: 'follow' })).catch((e) => ({ ok: false, status: e.message }));
        if (!r.ok) bad.push(`${r.status} ${u}`);
      }
    }));
    check(bad.length === 0, `${links.length} links answer${bad.length ? `; broken: ${bad.join(', ')}` : ''}`);
  }
  await page.close();
}
await browser.close();
server?.close();
passes.forEach((p) => console.log(`ok   ${p}`));
failures.forEach((f) => console.log(`FAIL ${f}`));
console.log(failures.length ? `test: ${failures.length} failure(s), ${passes.length} passed`
  : `test: all ${passes.length} checks passed`);
process.exit(failures.length ? 1 : 0);
