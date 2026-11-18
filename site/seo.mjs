// The metadata every route of the site carries, generated from one page object and one declared
// base URL (package.json `homepage`), and the gate that refuses a route without it, with an
// absolute link to the site's own origin where a relative one works, a share picture that is not
// 1200x630, or a sitemap and llms.txt that leave it out (project.reel-site-is-derived); and, for
// every language the site has (i18n.mjs languages()), a page whose <html lang>, og:locale or
// JSON-LD inLanguage is not its own, or that is not linked to and from its counterpart in every
// language (hreflang, x-default) (project.reel-bilingual).
//
//   node site/seo.mjs _site                 -> checks every built page (exit 1 on a finding)
//   node site/seo.mjs --live <url>          -> fetches the live site's pages from its sitemap
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { languages } from '../i18n.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
// the one place the site's address is declared; everything absolute is derived from it
export const BASE = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).homepage;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
// cs-CZ -> cs_CZ, the form Open Graph takes
const ogLocale = (l) => l.replace('-', '_');

// page: { path, title, description, images: [{ path, width, height, alt }], video?, type, lang,
// locale, home, alternates } (the first image is the 1200x630 share picture, the next the native
// frame); video: { path, width, height, duration, released }; home: the language's root ('' or
// 'cs/'); alternates: [{ lang, locale, path }] this route in every language, the default first
// root: the relative way back to the site's root from the page ('' or '../')
export function metaTags(page, root) {
  const url = BASE + page.path;
  const [image] = page.images;
  const tags = [
    `<title>${esc(page.title)}</title>`,
    `<meta name="description" content="${esc(page.description)}">`,
    `<link rel="canonical" href="${esc(url)}">`,
    '<meta name="robots" content="index, follow, max-image-preview:large, max-video-preview:-1">',
    '<meta name="theme-color" content="#030712">',
    '<meta name="color-scheme" content="dark">',
    `<link rel="icon" href="${root}icon.svg" type="image/svg+xml">`,
    `<link rel="icon" href="${root}favicon-32.png" sizes="32x32" type="image/png">`,
    `<link rel="apple-touch-icon" href="${root}apple-touch-icon.png">`,
    `<link rel="manifest" href="${root}site.webmanifest">`,
    `<link rel="alternate" type="application/json" href="${root}${page.home}data/reel.json" title="The reel as data">`,
    `<link rel="alternate" type="text/plain" href="${root}${page.home}llms.txt" title="The reel for language models">`,
    // this route in every language (search engines; site/lang.js reads data-route), the default
    // language for everyone else
    ...page.alternates.map((a) => `<link rel="alternate" hreflang="${esc(a.lang)}" href="${esc(BASE + a.path)}" `
      + `data-route="${esc(root + a.path || './')}">`),
    `<link rel="alternate" hreflang="x-default" href="${esc(BASE + page.alternates[0].path)}">`,
    `<link rel="preload" as="image" href="${root}${esc(page.images[1]?.path || image.path)}">`,
    `<meta property="og:site_name" content="Majordomus reel">`,
    `<meta property="og:type" content="${esc(page.type || 'website')}">`,
    `<meta property="og:locale" content="${ogLocale(page.locale)}">`,
    ...page.alternates.filter((a) => a.lang !== page.lang)
      .map((a) => `<meta property="og:locale:alternate" content="${ogLocale(a.locale)}">`),
    `<meta property="og:url" content="${esc(url)}">`,
    `<meta property="og:title" content="${esc(page.title)}">`,
    `<meta property="og:description" content="${esc(page.description)}">`,
    ...page.images.flatMap((im) => [
      `<meta property="og:image" content="${esc(BASE + im.path)}">`,
      `<meta property="og:image:secure_url" content="${esc(BASE + im.path)}">`,
      `<meta property="og:image:type" content="image/jpeg">`,
      `<meta property="og:image:width" content="${im.width}">`,
      `<meta property="og:image:height" content="${im.height}">`,
      `<meta property="og:image:alt" content="${esc(im.alt)}">`,
    ]),
    ...(page.video ? [
      `<meta property="og:video" content="${esc(BASE + page.video.path)}">`,
      `<meta property="og:video:secure_url" content="${esc(BASE + page.video.path)}">`,
      `<meta property="og:video:type" content="video/mp4">`,
      `<meta property="og:video:width" content="${page.video.width}">`,
      `<meta property="og:video:height" content="${page.video.height}">`,
      `<meta property="video:duration" content="${page.video.duration}">`,
      `<meta property="video:release_date" content="${esc(page.video.released)}">`,
    ] : []),
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="twitter:title" content="${esc(page.title)}">`,
    `<meta name="twitter:description" content="${esc(page.description)}">`,
    `<meta name="twitter:image" content="${esc(BASE + image.path)}">`,
    `<meta name="twitter:image:alt" content="${esc(image.alt)}">`,
  ];
  return tags.join('\n');
}

// The gate. A finding is a missing tag, a tag that says nothing, or an absolute link to the site
// itself outside the places a spec requires one (canonical, og:*, twitter:*, JSON-LD, sitemap).
const REQUIRED = [
  [/<html[^>]*\blang="[a-z-]+"/i, 'html lang'],
  [/<meta name="viewport" content="[^"]+"/, 'viewport'],
  [/<title>[^<]{10,70}<\/title>/, 'a title of 10 to 70 characters'],
  [/<meta name="description" content="[^"]{50,200}"/, 'a description of 50 to 200 characters'],
  [/<link rel="canonical" href="https:\/\/[^"]+"/, 'canonical'],
  [/<link rel="icon" href="[^"]+"/, 'favicon'],
  [/<link rel="apple-touch-icon" href="[^"]+"/, 'apple-touch-icon'],
  [/<link rel="manifest" href="[^"]+"/, 'web manifest'],
  [/<meta name="theme-color" content="[^"]+"/, 'theme-color'],
  ...['og:site_name', 'og:type', 'og:url', 'og:title', 'og:description', 'og:image', 'og:image:width',
    'og:image:height', 'og:image:alt'].map((p) => [new RegExp(`<meta property="${p}" content="[^"]+"`), p]),
  ...['twitter:card', 'twitter:title', 'twitter:description', 'twitter:image', 'twitter:image:alt']
    .map((p) => [new RegExp(`<meta name="${p}" content="[^"]+"`), p]),
  [/<script type="application\/ld\+json">\s*\{/, 'JSON-LD'],
  [/<h1\b/, 'one h1'],
  // every route is a cut's: a video page with its own share picture first, at 1200x630
  [/<meta property="og:type" content="video\.other"/, 'og:type video.other'],
  [/<meta property="og:image" content="[^"]+">\s*<meta property="og:image:secure_url" content="[^"]+">\s*<meta property="og:image:type" content="image\/jpeg">\s*<meta property="og:image:width" content="1200">\s*<meta property="og:image:height" content="630">/,
    'a first og:image of 1200x630'],
  [/<meta property="og:video" content="https:[^"]+\.mp4"/, 'og:video'],
  [/<meta property="og:video:type" content="video\/mp4"/, 'og:video:type'],
  [/<meta property="video:duration" content="\d+"/, 'video:duration'],
  [/<meta name="twitter:card" content="summary_large_image"/, 'twitter:card summary_large_image'],
];
// the JSON-LD VideoObject of the route: every field a search engine shows a video by
const VIDEO_FIELDS = ['name', 'description', 'thumbnailUrl', 'uploadDate', 'duration', 'contentUrl',
  'embedUrl', 'hasPart'];
function checkVideoObject(html, where) {
  const m = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html);
  if (!m) return [];
  let ld;
  try { ld = JSON.parse(m[1]); } catch (e) { return [`${where}: JSON-LD does not parse: ${e.message}`]; }
  const canonical = (/<link rel="canonical" href="([^"]+)"/.exec(html) || [])[1];
  const video = (ld['@graph'] || [ld]).find((n) => n['@type'] === 'VideoObject' && n.embedUrl === canonical);
  if (!video) return [`${where}: no JSON-LD VideoObject whose embedUrl is the page (${canonical})`];
  const out = VIDEO_FIELDS.filter((k) => !video[k] || (Array.isArray(video[k]) && !video[k].length))
    .map((k) => `${where}: the VideoObject has no ${k}`);
  if (video.duration && !/^PT\d+M\d+S$/.test(video.duration)) out.push(`${where}: duration ${video.duration} is not ISO-8601`);
  if (video.uploadDate && Number.isNaN(Date.parse(video.uploadDate))) out.push(`${where}: uploadDate ${video.uploadDate} is not a date`);
  if (Array.isArray(video.hasPart) && video.hasPart.some((p) => p['@type'] !== 'Clip' || !p.name
    || !Number.isFinite(p.startOffset) || !p.url)) out.push(`${where}: a hasPart is not a whole Clip`);
  return out;
}

// the pixel size of a JPEG, from its frame header
export function jpegSize(buf) {
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const marker = buf[i + 1];
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
}
export function checkPage(html, where) {
  const findings = REQUIRED.filter(([re]) => !re.test(html)).map(([, what]) => `${where}: no ${what}`);
  if ((html.match(/<h1\b/g) || []).length > 1) findings.push(`${where}: more than one h1`);
  // absolute links to ourselves where a relative one works
  const own = BASE.replace(/\/$/, '');
  const body = html.replace(/<script type="application\/(?:ld\+)?json"[\s\S]*?<\/script>/g, '')
    .replace(/<(?:link rel="canonical"|link rel="alternate" hreflang="[^"]+"|meta property="og:[^"]+"|meta name="twitter:[^"]+")[^>]*>/g, '');
  for (const m of body.matchAll(/\b(?:href|src|poster|content)="([^"]+)"/g)) {
    if (m[1].startsWith(own)) findings.push(`${where}: absolute link to the site itself: ${m[1]}`);
  }
  for (const m of html.matchAll(/<img\b(?![^>]*\balt=)[^>]*>/g)) findings.push(`${where}: img without alt: ${m[0].slice(0, 80)}`);
  findings.push(...checkVideoObject(html, where));
  findings.push(...checkLanguage(html, where).findings);
  return findings;
}

// ---- languages: every page is its own language and names its counterpart in every other -------
const LANGS = languages();
const DEFAULT = LANGS[0];
// a route's language is the first segment of its path ('cs/story-x/'), the default's has none
const homeOf = (lang) => (lang === DEFAULT ? '' : `${lang}/`);
const langOfPath = (path) => {
  const first = path.split('/')[0];
  return first !== DEFAULT && LANGS.includes(first) ? first : DEFAULT;
};
const ldOf = (html) => {
  try {
    const ld = JSON.parse((/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html) || [])[1]);
    return ld['@graph'] || [ld];
  } catch { return []; }
};
export function checkLanguage(html, where) {
  const findings = [];
  const canonical = (/<link rel="canonical" href="([^"]+)"/.exec(html) || [])[1] || '';
  const lang = langOfPath(canonical.slice(BASE.length));
  const htmlLang = (/<html[^>]*\blang="([^"]+)"/.exec(html) || [])[1];
  if (htmlLang !== lang) findings.push(`${where}: <html lang="${htmlLang}">, the route is ${lang}`);
  const locale = (/<meta property="og:locale" content="([^"]+)"/.exec(html) || [])[1] || '';
  if (locale.split('_')[0].toLowerCase() !== lang) findings.push(`${where}: og:locale ${locale || 'missing'}, the route is ${lang}`);
  const others = [...html.matchAll(/<meta property="og:locale:alternate" content="([^"]+)"/g)].map((m) => m[1]);
  const otherLangs = new Set(others.map((l) => l.split('_')[0].toLowerCase()));
  if (others.length !== LANGS.length - 1 || otherLangs.has(lang) || LANGS.some((l) => l !== lang && !otherLangs.has(l))) {
    findings.push(`${where}: og:locale:alternate ${others.join(', ') || 'none'}; the site's other languages are `
      + `${LANGS.filter((l) => l !== lang).join(', ')}`);
  }
  const alternates = Object.fromEntries([...html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)"/g)]
    .map((m) => [m[1], m[2]]));
  for (const l of LANGS) if (!alternates[l]) findings.push(`${where}: no hreflang alternate for ${l}`);
  if (alternates[lang] && alternates[lang] !== canonical) findings.push(`${where}: its hreflang ${lang} is ${alternates[lang]}, not itself`);
  if (!alternates['x-default']) findings.push(`${where}: no hreflang x-default`);
  else if (alternates['x-default'] !== alternates[DEFAULT]) findings.push(`${where}: x-default is not its ${DEFAULT} route`);
  const graph = ldOf(html);
  const site = graph.find((n) => n['@type'] === 'WebSite');
  if (!site || site.inLanguage !== lang) findings.push(`${where}: the JSON-LD WebSite is in ${site?.inLanguage}, the route is ${lang}`);
  const video = graph.find((n) => n['@type'] === 'VideoObject' && n.embedUrl === canonical);
  if (video && !LANGS.includes(video.inLanguage)) findings.push(`${where}: the VideoObject's inLanguage ${video.inLanguage} is not a language of the site`);
  return { findings, canonical, lang, alternates, video };
}

export function checkSite(dir) {
  const findings = [];
  const pages = [];
  const walk = (d) => readdirSync(d).forEach((f) => {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (f.endsWith('.html')) pages.push(p);
  });
  walk(dir);
  const local = (url) => join(dir, url.slice(BASE.length));
  const canonicals = [];
  const routes = new Map();
  const dataOf = new Map();
  const reel = (lang) => {
    if (!dataOf.has(lang)) {
      const f = join(dir, homeOf(lang), 'data', 'reel.json');
      dataOf.set(lang, existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null);
    }
    return dataOf.get(lang);
  };
  for (const p of pages) {
    const html = readFileSync(p, 'utf8');
    const where = relative(dir, p);
    findings.push(...checkPage(html, where));
    canonicals.push((/<link rel="canonical" href="([^"]+)"/.exec(html) || [])[1]);
    const route = { where, ...checkLanguage(html, where) };
    routes.set(route.canonical, route);
    // the video is in the language its cut is rendered in (data/reel.json of the route's language)
    const cut = reel(route.lang)?.cuts.find((c) => BASE + c.page === route.canonical);
    if (!cut) findings.push(`${where}: ${homeOf(route.lang)}data/reel.json has no cut whose page is this route`);
    else if (route.video && route.video.inLanguage !== cut.lang) {
      findings.push(`${where}: the VideoObject says inLanguage ${route.video.inLanguage}; the cut plays ${cut.lang}`);
    }
    // what the route's preview names is in the site: each og:image at its stated size, the video
    const images = [...html.matchAll(/<meta property="og:image" content="([^"]+)">[\s\S]*?<meta property="og:image:width" content="(\d+)">\s*<meta property="og:image:height" content="(\d+)">/g)];
    for (const [, url, w, h] of images) {
      if (!url.startsWith(BASE) || !existsSync(local(url))) { findings.push(`${where}: og:image ${url} is not in the site`); continue; }
      const size = jpegSize(readFileSync(local(url)));
      if (!size || size.width !== Number(w) || size.height !== Number(h)) {
        findings.push(`${where}: og:image ${url} is ${size ? `${size.width}x${size.height}` : 'not a JPEG'}, the page says ${w}x${h}`);
      }
    }
    const video = (/<meta property="og:video" content="([^"]+)"/.exec(html) || [])[1];
    if (video && (!video.startsWith(BASE) || !existsSync(local(video)))) findings.push(`${where}: og:video ${video} is not in the site`);
  }
  // hreflang is reciprocal: each counterpart a route names is a page that names it back
  for (const r of routes.values()) {
    for (const [l, href] of Object.entries(r.alternates)) {
      if (l === 'x-default' || href === r.canonical) continue;
      const other = routes.get(href);
      if (!other) findings.push(`${r.where}: hreflang ${l} names ${href}, which is not a page of the site`);
      else if (other.alternates[r.lang] !== r.canonical) {
        findings.push(`${r.where}: hreflang ${l} names ${href}, whose hreflang ${r.lang} is ${other.alternates[r.lang] || 'missing'}, not this route`);
      }
    }
  }
  for (const f of ['robots.txt', 'sitemap.xml', 'site.webmanifest', 'icon.svg', 'favicon-32.png',
    'apple-touch-icon.png', ...LANGS.flatMap((l) => [`${homeOf(l)}llms.txt`, `${homeOf(l)}data/reel.json`])]) {
    if (!existsSync(join(dir, f))) findings.push(`site: no ${f}`);
  }
  // the sitemap lists every route with its video; llms.txt names every route
  if (existsSync(join(dir, 'sitemap.xml'))) {
    const sitemap = readFileSync(join(dir, 'sitemap.xml'), 'utf8');
    const urls = [...sitemap.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => m[1]);
    if (urls.length !== pages.length) findings.push(`sitemap.xml lists ${urls.length} pages; the site has ${pages.length}`);
    for (const c of canonicals) {
      const entry = urls.find((u) => u.includes(`<loc>${c}</loc>`));
      if (!entry) { findings.push(`sitemap.xml does not list ${c}`); continue; }
      for (const tag of ['thumbnail_loc', 'title', 'description', 'content_loc', 'duration', 'publication_date']) {
        if (!new RegExp(`<video:${tag}>[^<]+</video:${tag}>`).test(entry)) findings.push(`sitemap.xml: ${c} has no video:${tag}`);
      }
      const alt = Object.fromEntries([...entry.matchAll(/<xhtml:link rel="alternate" hreflang="([^"]+)" href="([^"]+)"/g)]
        .map((m) => [m[1], m[2]]));
      const page = routes.get(c);
      for (const l of [...LANGS, 'x-default']) {
        if (!alt[l]) findings.push(`sitemap.xml: ${c} has no xhtml:link for ${l}`);
        else if (page && page.alternates[l] !== alt[l]) findings.push(`sitemap.xml: ${c} names ${alt[l]} for ${l}, the page ${page.alternates[l]}`);
      }
    }
  }
  // each language's llms.txt names every route of that language; the root one every language's entry
  for (const l of LANGS) {
    const f = join(dir, homeOf(l), 'llms.txt');
    if (!existsSync(f)) continue;
    const llms = readFileSync(f, 'utf8');
    [...routes.values()].filter((r) => r.lang === l && !llms.includes(`(${r.canonical})`))
      .forEach((r) => findings.push(`${homeOf(l)}llms.txt does not name ${r.canonical}`));
    if (l === DEFAULT) {
      LANGS.filter((x) => !llms.includes(`${BASE}${homeOf(x)}llms.txt`))
        .forEach((x) => findings.push(`llms.txt does not name the ${x} entry point (${BASE}${homeOf(x)}llms.txt)`));
    }
  }
  return { pages: pages.length, findings };
}

async function live(url) {
  const findings = [];
  const get = async (u) => {
    const r = await fetch(u);
    if (!r.ok) throw new Error(`${u}: ${r.status}`);
    return r;
  };
  const sitemap = await (await get(new URL('sitemap.xml', url))).text();
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  for (const loc of locs) {
    const html = await (await get(loc)).text();
    findings.push(...checkPage(html, loc));
    const img = (html.match(/<meta property="og:image" content="([^"]+)"/) || [])[1];
    if (img) {
      const r = await fetch(img, { method: 'HEAD' });
      if (!r.ok || !/^image\//.test(r.headers.get('content-type') || '')) {
        findings.push(`${loc}: og:image ${img} is not served as an image (${r.status})`);
      }
    }
  }
  return { pages: locs.length, findings };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const i = process.argv.indexOf('--live');
  const { pages, findings } = i > 0 ? await live(process.argv[i + 1]) : checkSite(process.argv[2] || join(ROOT, '_site'));
  findings.forEach((f) => console.log(`FAIL ${f}`));
  console.log(findings.length ? `seo: ${findings.length} finding(s) in ${pages} page(s)` : `seo: ok, ${pages} page(s)`);
  process.exit(findings.length ? 1 : 0);
}
