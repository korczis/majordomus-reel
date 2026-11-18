// Builds the GitHub Pages site into _site/ from data, never from typed copy: every cut (the film,
// the short, one story per use-case category: stories.mjs) in every format formats.json declares
// (project.reel-tailored-per-device), each cut's chapters, narration and captions from its render
// (timeline.json, captions.vtt), its posters and share pictures from its own frames, the Majordomus
// facts and use cases from the release the film was rendered with (facts.mjs), the YouTube uploads
// (site/published.json) and what a render needs (make-reel.sh). The pages, data/reel.json,
// sitemap.xml and llms.txt are projections of one object (project.reel-site-is-derived), one per
// language (i18n.mjs languages(): English at the root, every other at /<id>/), every word from
// that language's messages and catalogue and every cut's chapters and captions from its render in
// that language, or the source language's with a note where it is not rendered yet
// (project.reel-bilingual).
//
//   node site/build.mjs              -> _site/ (refuses a missing format and any other finding)
//   FALLBACK=1 node site/build.mjs   -> deployable with missing formats and languages: each falls
//                                       back to the nearest format the cut has, or to its source
//                                       language, the page says so, reel.json records it
//                                       (`fallback`, `language_fallback`, `gaps`); every other
//                                       finding still refuses
//   PARTIAL=1 node site/build.mjs    -> a local preview with whatever exists; never deployed
//
// CUTS (default $ROOT/cuts/v6) holds <cut>-<format>.mp4 (English) and <cut>-<format>.<id>.mp4 (a
// language); RENDERS (default $ROOT/build-v6) holds <cut>-<format>/ and <cut>-<format>.<id>/ with
// the render's timeline.json, captions.vtt and facts.json.
import { spawnSync } from 'node:child_process';
import {
  readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, statSync, copyFileSync, readdirSync,
  renameSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { metaTags, checkSite, BASE } from './seo.mjs';
import {
  esc, clock, length, best, chapterList, storySlide, slideDots, filterChips, galleryTile,
  categoryCard, statCard, formatButtons, cutButtons, ui, icon, messenger, messageWords, raw, langAttr,
  languageSwitch,
} from './view.mjs';
import { derive, catalogue, released } from '../facts.mjs';
import { languages, load as loadLang, localiseStory, siteMessages } from '../i18n.mjs';
import { stories as deriveStories, posterMoments } from '../stories.mjs';

const SITE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(SITE);
const OUT = process.env.SITE_OUT || join(ROOT, '_site');
const CUTS = process.env.CUTS || join(ROOT, 'cuts', 'v6');
const RENDERS = process.env.RENDERS || join(ROOT, 'build-v6');
const CACHE = process.env.WEB_CACHE || join(RENDERS, 'web');
const PARTIAL = process.env.PARTIAL === '1';
const FALLBACK = process.env.FALLBACK === '1';
const REPO = 'https://github.com/korczis/majordomus-reel';
const MAJORDOMUS_REPO = 'https://github.com/korczis/prismatic-majordomus';
const MAJORDOMUS = 'https://majordomus.dev';
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
// the day of the build: the sitemap's lastmod
const BUILT = new Date().toISOString().slice(0, 10);
// GitHub refuses a file over 100 MB, and a Pages site over 1 GB
const FILE_CAP = 95e6;
const SITE_CAP = 950e6;
// the share picture every network shows: 1.91:1
const OG = { width: 1200, height: 630 };
const PAGE_BG = '0x030712'; // gray-950, the page and the film's own background
// a frame whose mean brightness is within this of its background level shows nothing
const INK = 1;

const FORMATS = JSON.parse(readFileSync(join(ROOT, 'formats.json'), 'utf8')).formats;
const formatOf = Object.fromEntries(FORMATS.map((f) => [f.id, f]));
const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 1 << 26 });
  if (r.status !== 0) throw new Error(`${cmd} ${args.slice(0, 4).join(' ')}: ${r.stderr || r.error}`);
  return r.stdout;
};
const probe = (file) => {
  const [w, h, d] = run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries',
    'stream=width,height:format=duration', '-of', 'csv=p=0:s=,', file]).trim().split(/[,\n]/);
  return { width: Number(w), height: Number(h), duration: Number(d) };
};
const readJson = (f) => JSON.parse(readFileSync(f, 'utf8'));
const hash = (s) => createHash('sha1').update(s).digest('hex').slice(0, 16);
// the nearest format a cut has to the one wanted: the closest aspect ratio
const aspect = (id) => formatOf[id].width / formatOf[id].height;
const nearest = (want, have) => [...have].sort((a, b) => Math.abs(Math.log(aspect(a) / aspect(want)))
  - Math.abs(Math.log(aspect(b) / aspect(want))))[0];

// ---- the release the cuts state ---------------------------------------------------------------
const release = derive();
// the facts a cut must equal: its own release's, or, for a cut pre-rendered from a commit
// (MAJORDOMUS_REV), the tag's once it exists; until then the release is pending
const statusOf = new Map();
const releaseOf = (facts) => {
  if (!facts.preview) return { facts: release, pending: false };
  if (!statusOf.has(facts.tag)) {
    const r = released(facts.tag);
    statusOf.set(facts.tag, { ...r, facts: r.released && r.local ? derive({ tag: facts.tag }) : null });
  }
  const s = statusOf.get(facts.tag);
  return { facts: s.facts, pending: !s.released, unfetched: s.released && !s.local };
};

// ---- the languages: English is the source, every lang/<id>.json a translation -----------------
// Each language's pages are rendered from its own messages (site/messages.json for English,
// lang/<id>.json `site` for the rest): the English routes at the root, every other language's
// under /<id>/, the same cut ids in each (project.reel-bilingual).
const EN = siteMessages();
const LANGS = languages().map((id) => {
  const tr = id === 'en' ? null : loadLang(id);
  return { id, tr, locale: tr ? tr.locale : EN.locale, messages: tr ? tr.site || {} : EN.messages,
    home: id === 'en' ? '' : `${id}/`, suffix: id === 'en' ? '' : `.${id}` };
});
const SOURCE = LANGS[0];
// a finding is `missing` (a format or a language not rendered yet: FALLBACK=1 deploys around it)
// or a `defect`
const findings = [];
const finding = (kind, text, lang = SOURCE.id) => findings.push({ kind, text, lang });

// Every message a template, a view or the script names is in the English catalogue, and every
// message there is named by one: a literal key (`{{m:<key>}}`, t('<key>'), t.html('<key>')) or a key
// built from data under a named prefix (t(`format.${id}`)).
const NAMES = /\{\{m:([a-z0-9_.]+)\}\}|\bt(?:\.html)?\('([a-z0-9_.]+)'|\bt(?:\.html)?\(`([a-z0-9_.]+)\$\{/g;
{
  const named = new Set();
  const prefixes = new Set();
  for (const f of ['index.html', 'player.html', 'view.mjs', 'app.js', 'build.mjs']) {
    const text = readFileSync(join(SITE, f), 'utf8');
    for (const m of text.matchAll(NAMES)) {
      if (m[3]) prefixes.add(m[3]);
      else {
        const key = m[1] || m[2];
        named.add(key);
        if (!(key in EN.messages)) throw new Error(`site/${f} names the message ${key}, which site/messages.json lacks`);
      }
    }
  }
  const unused = Object.keys(EN.messages).filter((k) => !named.has(k)
    && ![...prefixes].some((p) => k.startsWith(p)));
  if (unused.length) throw new Error(`site/messages.json has messages nothing names: ${unused.join(', ')}`);
  // a number in a message is typed copy: counts and lengths are arguments
  for (const [k, src] of Object.entries(EN.messages)) {
    if (messageWords(src).some((w) => /\d/.test(w))) throw new Error(`site/messages.json ${k} types a number: "${src}"`);
  }
}
// a page whose language lacks a message is refused (node i18n.mjs --check names each); a PARTIAL
// preview shows the English one instead
for (const L of LANGS.slice(1)) {
  const lacking = Object.keys(EN.messages).filter((k) => typeof L.messages[k] !== 'string');
  if (lacking.length) {
    finding('defect', `lang/${L.id}.json lacks ${lacking.length} site message(s): ${lacking.slice(0, 5).join(', ')}`
      + `${lacking.length > 5 ? ', ...' : ''} (node i18n.mjs --check)`, L.id);
  }
}
for (const L of LANGS) {
  L.t = messenger(L.messages, L.locale, PARTIAL ? EN.messages : null);
  L.formats = FORMATS.map((f) => ({ ...f, label: L.t(`format.${f.id}`) }));
}

// ---- the cuts: what must exist, in every language, and what does -------------------------------
const storyList = deriveStories(release);
const wanted = [
  { id: 'film', kind: 'film' },
  { id: 'short', kind: 'short' },
  ...storyList.map((s) => ({ id: `story-${s.id}`, kind: 'story', story: s })),
];
// a cut's title and why in a language: a story's are its category's (lang/<id>.json catalogue),
// the film's and the short's are messages
const wordsOf = (cut, L) => {
  if (cut.story) return L.tr ? localiseStory(cut.story, L.tr) : cut.story;
  return { title: L.t(`cut.${cut.kind}.title`), summary: L.t(`cut.${cut.kind}.summary`) };
};
const rel = (p) => p.replace(`${ROOT}/`, '');
const cuts = [];
for (const cut of wanted) {
  const renders = {};
  for (const L of LANGS) {
    const formats = {};
    const lacking = [];
    for (const f of FORMATS) {
      const name = `${cut.id}-${f.id}${L.suffix}`;
      const video = join(CUTS, `${name}.mp4`);
      const dir = join(RENDERS, name);
      const need = [video, join(dir, 'timeline.json'), join(dir, 'captions.vtt'), join(dir, 'facts.json')];
      const missing = need.filter((p) => !existsSync(p));
      if (missing.length) {
        lacking.push({ f, missing });
        continue;
      }
      const facts = readJson(join(dir, 'facts.json'));
      const size = probe(video);
      if (size.width !== f.width || size.height !== f.height) {
        finding('defect', `${name}: rendered ${size.width}x${size.height}, formats.json says `
          + `${f.width}x${f.height}`, L.id);
        continue;
      }
      if (facts.format && facts.format !== f.id) finding('defect', `${name}: rendered as ${facts.format}`, L.id);
      if ((facts.lang || SOURCE.id) !== L.id) finding('defect', `${name}: rendered in ${facts.lang || SOURCE.id}, not ${L.id}`, L.id);
      // a cut is current while the facts it states are its release's (facts.mjs --same)
      const target = releaseOf(facts);
      if (target.pending) {
        finding('defect', `${name}: pre-rendered from ${facts.commit.slice(0, 12)} for `
          + `${facts.tag}, which is not released yet (release pending)`, L.id);
      } else if (target.unfetched) {
        finding('defect', `${name}: ${facts.tag} is released but not in the clone; fetch its tags`, L.id);
      } else {
        const keys = facts.uses || ['version', 'rules', 'rules_validated', 'blocking', 'blocking_validated', 'adrs'];
        const stale = keys.filter((k) => facts[k] !== target.facts[k]);
        if (stale.length) {
          finding('defect', `${name}: states ${stale.map((k) => `${k} ${facts[k]}`).join(', ')}; `
            + `${target.facts.tag} says ${stale.map((k) => target.facts[k]).join(', ')}`, L.id);
        }
      }
      if (facts.captions) finding('defect', `${name}: captions are burned in; the page serves them as a track`, L.id);
      formats[f.id] = { video, dir, facts, size, duration: size.duration, timeline: readJson(join(dir, 'timeline.json')) };
    }
    if (L === SOURCE) {
      lacking.forEach(({ f, missing }) => finding('missing', `${cut.id} has no ${f.id} cut (${missing.map(rel).join(', ')})`));
    } else if (!Object.keys(formats).length) {
      // not rendered in this language at all: its pages play the source language's cut
      finding('missing', `${cut.id} has no ${L.id} cut in any format; its ${L.id} page plays ${SOURCE.id}`, L.id);
    } else {
      lacking.forEach(({ f, missing }) => finding('missing', `${cut.id} has no ${L.id} ${f.id} cut (${missing.map(rel).join(', ')})`, L.id));
    }
    if (Object.keys(formats).length) renders[L.id] = formats;
  }
  if (renders[SOURCE.id]) cuts.push({ ...cut, renders });
  else finding('defect', `${cut.id} has no cut in any format`);
}
const refused = findings.filter((f) => !PARTIAL && (f.kind === 'defect' || !FALLBACK));
findings.forEach((f) => console.warn(`   ${refused.includes(f) ? 'FAIL' : f.kind === 'missing' && FALLBACK
  ? 'fallback' : 'partial'}: ${f.text}`));
if (refused.length) {
  console.error(`site: refused, ${refused.length} finding(s) (project.reel-tailored-per-device, `
    + 'project.reel-facts-are-derived, project.reel-bilingual); render the missing cuts, FALLBACK=1 to '
    + 'deploy around a missing format or language, or PARTIAL=1 for a local preview');
  process.exit(1);
}
if (!cuts.some((c) => c.id === 'film')) throw new Error('no film cut in any format');

// the release the film states is the one the page names
const filmAny = Object.values(cuts.find((c) => c.id === 'film').renders[SOURCE.id])[0];
const stated = filmAny.facts;
const pending = releaseOf(stated).pending;
const cat = catalogue(stated);
const useCaseById = Object.fromEntries(cat.useCases.map((u) => [u.id, u]));

// ---- encodes, posters and share pictures: one per cut and format, cached by what made them ----
rmSync(OUT, { recursive: true, force: true });
for (const d of ['v', 'og', 'data']) mkdirSync(join(OUT, d), { recursive: true });
mkdirSync(CACHE, { recursive: true });
const CRF = { phone: 27, tablet: 28, desktop: 28 };
const cached = (key, make) => {
  const file = join(CACHE, key);
  if (!existsSync(file)) {
    const part = join(CACHE, `part-${key}`);
    make(part);
    renameSync(part, file);
  }
  return file;
};
const stamp = (src) => { const st = statSync(src); return `${src}|${st.size}|${st.mtimeMs}`; };
const encode = (src, f, dst) => {
  const [w, h] = f.web;
  const id = hash(`${stamp(src)}|${w}x${h}|${CRF[f.id]}|v2`);
  const args = (crf, rate, out) => ['-y', '-v', 'error', '-i', src, '-vf', `scale=${w}:${h}:flags=lanczos`,
    '-c:v', 'libx264', '-preset', 'slow', ...(rate ? ['-b:v', rate, '-maxrate', rate, '-bufsize', rate]
      : ['-crf', String(crf)]), '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k',
    '-movflags', '+faststart', out];
  const file = cached(`${id}.mp4`, (part) => {
    run('ffmpeg', args(CRF[f.id], null, part));
    // over GitHub's per-file cap: the bitrate that fits, measured from the length
    if (statSync(part).size > FILE_CAP) {
      const kbps = Math.floor((FILE_CAP * 0.92 * 8) / probe(src).duration / 1000) - 128;
      run('ffmpeg', args(0, `${kbps}k`, part));
    }
  });
  copyFileSync(file, dst);
  return statSync(dst).size;
};
// how much a frame shows: its mean brightness above its background (the 90th percentile)
const inkAt = (src, t) => {
  const key = hash(`${stamp(src)}|${t}|ink1`);
  const file = join(CACHE, `${key}.ink`);
  if (existsSync(file)) return Number(readFileSync(file, 'utf8'));
  const r = spawnSync('ffmpeg', ['-v', 'info', '-ss', t.toFixed(2), '-i', src, '-frames:v', '1', '-vf',
    'signalstats,metadata=print', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 1 << 26 });
  const avg = Number((/YAVG=([\d.]+)/.exec(r.stderr) || [])[1]);
  const high = Number((/YHIGH=([\d.]+)/.exec(r.stderr) || [])[1]);
  const ink = Number.isFinite(avg) && Number.isFinite(high) ? +(avg - high).toFixed(2) : 0;
  writeFileSync(file, String(ink));
  return ink;
};
// the first `n` moments of a cut that show something, best first (stories.mjs posterMoments)
const inked = (src, ts, n) => {
  const out = [];
  for (const t of ts) {
    if (out.length >= n) break;
    if (inkAt(src, t) >= INK) out.push(t);
  }
  return out;
};
const goodMoments = (src, tl) => inked(src, posterMoments(tl), 3);
const frame = (src, t, vf, dst) => copyFileSync(cached(`${hash(`${stamp(src)}|${t}|${vf}|p2`)}.jpg`,
  (part) => run('ffmpeg', ['-y', '-v', 'error', '-ss', t.toFixed(2), '-i', src, '-frames:v', '1', '-vf', vf,
    '-q:v', '3', '-f', 'image2', part])), dst);
// The share picture, 1200x630, from the cut's own frames: a landscape frame fills it; a portrait
// one is three of its moments side by side (the poster, the scene that shows the most use cases,
// the install line), so a feed shows the story rather than a sliver of one frame.
const sharePicture = (r, f, moments, dst) => {
  const ar = f.width / f.height;
  if (ar >= OG.width / OG.height - 0.3) {
    return frame(r.video, moments[0], `scale=${OG.width}:${OG.height}:force_original_aspect_ratio=increase:`
      + `flags=lanczos,crop=${OG.width}:${OG.height}`, dst);
  }
  if (ar >= 1) {
    return frame(r.video, moments[0], `scale=-2:${OG.height}:flags=lanczos,pad=${OG.width}:${OG.height}:`
      + `(ow-iw)/2:0:color=${PAGE_BG}`, dst);
  }
  const tl = r.timeline;
  const at = (s) => +(s.start + s.duration * 0.75).toFixed(2);
  const content = tl.scenes.filter((s) => !['story', 'hook', 'loop', 'cta'].includes(s.id));
  const richest = [...content].sort((a, b) => (b.use_cases || []).length - (a.use_cases || []).length)[0];
  const install = tl.scenes.find((s) => s.id === 'setup');
  const picks = inked(r.video, [moments[0], richest && at(richest), install && at(install), ...moments]
    .filter((t, i, all) => Number.isFinite(t) && all.indexOf(t) === i), 3);
  const w = Math.round((OG.height * f.width) / f.height / 2) * 2;
  const gap = Math.floor((OG.width - picks.length * w) / (picks.length + 1));
  const key = hash(`${stamp(r.video)}|${picks.join(',')}|${OG.width}x${OG.height}|tri3`);
  copyFileSync(cached(`${key}.jpg`, (part) => run('ffmpeg', ['-y', '-v', 'error',
    ...picks.flatMap((t) => ['-ss', t.toFixed(2), '-i', r.video]),
    '-filter_complex', `${picks.map((_, i) => `[${i}:v]scale=${w}:${OG.height}:flags=lanczos,trim=end_frame=1,setpts=PTS-STARTPTS[p${i}]`).join(';')};`
      + `color=c=${PAGE_BG}:s=${OG.width}x${OG.height}:d=1[bg];`
      + picks.reduce((acc, _, i) => `${acc}${i ? `[o${i - 1}]` : '[bg]'}[p${i}]overlay=${gap + i * (w + gap)}:0`
        + `${i === picks.length - 1 ? '' : `[o${i}];`}`, ''),
    '-frames:v', '1', '-q:v', '3', '-f', 'image2', part])), dst);
  return picks;
};


// ---- the media: every cut in every language it is rendered in, in every format it has --------
// <cut>-<format>.mp4 and og/<cut>.jpg are the source language's; <cut>-<format>.<id>.mp4 and
// og/<cut>.<id>.jpg another's. A language a cut is not rendered in shares the source's media.
const chaptersOf = (tl) => tl.scenes.filter((s) => s.id !== 'loop').map((s) => ({
  id: s.id, t: Math.floor(s.start), title: s.title, act: s.act, use_cases: s.use_cases || [],
  narration: s.vo.replace(/\.?\s*\.\.\.\s*/g, '… ').trim(),
}));
let bytes = 0;
for (const cut of cuts) {
  cut.media = {};
  for (const L of LANGS) {
    const have = cut.renders[L.id];
    if (!have) continue;
    const any = best({ formats: have });
    const m = { lang: L.id, duration: +any.duration.toFixed(1), chapters: chaptersOf(any.timeline),
      captions: `v/${cut.id}${L.suffix}.vtt`, og: `og/${cut.id}${L.suffix}.jpg`, formats: {},
      // every declared format the cut lacks in this language, and the one the page plays instead
      fallback: Object.fromEntries(FORMATS.filter((f) => !have[f.id])
        .map((f) => [f.id, nearest(f.id, Object.keys(have))])) };
    copyFileSync(join(any.dir, 'captions.vtt'), join(OUT, m.captions));
    for (const f of FORMATS) {
      const r = have[f.id];
      if (!r) continue;
      const video = `v/${cut.id}-${f.id}${L.suffix}.mp4`;
      const still = `v/${cut.id}-${f.id}${L.suffix}.jpg`;
      console.log(`   ${cut.id} ${f.id} ${L.id}`);
      const size = encode(r.video, f, join(OUT, video));
      const moments = goodMoments(r.video, r.timeline);
      if (!moments.length) throw new Error(`${cut.id}-${f.id}${L.suffix}: no frame of the cut shows anything`);
      frame(r.video, moments[0], `scale=${f.web[0]}:${f.web[1]}:flags=lanczos`, join(OUT, still));
      bytes += size + statSync(join(OUT, still)).size;
      m.formats[f.id] = { video, poster: still, poster_t: moments[0], width: f.web[0], height: f.web[1],
        bytes: size };
      r.moments = moments;
    }
    // the share picture from the format that fills it best: the widest the cut has
    const wide = FORMATS.filter((f) => have[f.id]).pop();
    sharePicture(have[wide.id], wide, have[wide.id].moments, join(OUT, m.og));
    m.og_from = wide.id;
    cut.media[L.id] = m;
  }
}

// ---- the data: one object per language, every projection of it -------------------------------
// the day a cut was published, from git: the newest commit of what makes it (and of its language)
const COMMON = ['reel.html', 'render.mjs', 'gen.js', 'viz.js', 'synth.mjs', 'formats.json'];
const SOURCES = { film: ['scenes.json'], short: ['scenes-short.json'], story: ['scenes.json', 'stories.mjs'] };
const dates = new Map();
const gitDate = (kind, L) => {
  const paths = [...SOURCES[kind], ...COMMON, ...(L.tr ? [`lang/${L.id}.json`] : [])];
  if (!dates.has(paths.join())) dates.set(paths.join(), run('git', ['-C', ROOT, 'log', '-1', '--format=%cI', '--', ...paths]).trim());
  return dates.get(paths.join());
};
const releaseUrl = pending ? `${MAJORDOMUS_REPO}/commit/${stated.commit}`
  : `${MAJORDOMUS_REPO}/releases/tag/${stated.tag}`;
const releaseLabelIn = (t) => (pending ? t('release.label_pending', { version: stated.version }) : stated.version);
const makeReel = readFileSync(join(ROOT, 'make-reel.sh'), 'utf8');
const tools = (makeReel.match(/^for tool in ([^;]+);/m) || [])[1];
if (!tools) throw new Error('make-reel.sh no longer names its tools in a `for tool in` line');
const needs = [...tools.trim().split(/\s+/).filter((t) => t !== 'ffprobe'), 'Google Chrome'];
// the renders are shared artefacts, ignored by git, kept in the primary checkout: a linked worktree
// (majordomus worktree) reads the same ones
const PRIMARY = dirname(run('git', ['-C', ROOT, 'rev-parse', '--path-format=absolute', '--git-common-dir']).trim());
const youtube = readJson(join(SITE, 'published.json')).videos.map((v) => {
  const render = [join(ROOT, v.render), join(PRIMARY, v.render)].find((f) => existsSync(f)) || join(ROOT, v.render);
  if (!existsSync(render)) throw new Error(`published.json names a render that is not here: ${render}`);
  return { url: v.url, title: v.title, cut: v.cut, duration: Math.round(probe(render).duration), lang: SOURCE.id };
});
const gapsOf = (L) => findings.filter((f) => f.kind === 'missing' && (f.lang === SOURCE.id || f.lang === L.id))
  .map((f) => f.text.replace(/ \(.*$/, ''));
const dataFor = (L) => {
  const t = L.t;
  const data = {
    about: t('data.about'),
    site: BASE,
    source: REPO,
    lang: L.id,
    locale: L.locale,
    languages: LANGS.map((x) => ({ id: x.id, locale: x.locale, name: x.t('lang.name'), home: x.home,
      data: `${x.home}data/reel.json`, llms: `${x.home}llms.txt` })),
    release: {
      version: stated.version, tag: stated.tag, commit: stated.commit, url: releaseUrl, label: releaseLabelIn(t),
      pending, rules: stated.rules, rules_validated: stated.rules_validated, blocking: stated.blocking,
      blocking_validated: stated.blocking_validated, decisions: stated.adrs,
    },
    formats: L.formats.map(({ id, label, width, height, media, detail }) => ({ id, label, width, height,
      media, detail })),
    cuts: [],
    categories: [],
    youtube,
    gaps: gapsOf(L),
  };
  for (const cut of cuts) {
    // the cut in this language, else in the source language: the page says so (language_fallback)
    const m = cut.media[L.id] || cut.media[SOURCE.id];
    const words = wordsOf(cut, L);
    const path = cut.id === 'film' ? '' : `${cut.id}/`;
    data.cuts.push({
      id: cut.id, kind: cut.kind, title: words.title, summary: words.summary, duration: m.duration,
      path, page: L.home + path, published: gitDate(cut.kind, L), lang: m.lang,
      ...(m.lang !== L.id ? { language_fallback: m.lang } : {}),
      chapters: m.chapters, captions: m.captions, og: m.og, og_from: m.og_from, formats: m.formats,
      fallback: m.fallback,
      ...(cut.story ? { category: cut.story.id, category_url: cut.story.url,
        use_cases: cut.story.use_cases.map((u) => u.id) } : {}),
    });
  }
  // where each use case is seen: the film's chapters and the stories that carry it, in the
  // language's words (lang/<id>.json catalogue)
  const film = data.cuts.find((c) => c.id === 'film');
  const local = (c, ucs) => (L.tr ? localiseStory({ ...c, use_cases: ucs }, L.tr) : { ...c, use_cases: ucs });
  data.categories = cat.categories.map((c) => {
    const l = local(c, cat.useCases.filter((u) => u.category === c.id));
    const story = data.cuts.find((x) => x.category === c.id);
    return {
      id: c.id, title: l.title, summary: l.summary, url: `${MAJORDOMUS}/use-cases/${c.id}/`,
      story: story?.id || null, story_page: story?.page || null,
      use_cases: l.use_cases.map((u) => ({
        id: u.id, title: u.title, summary: u.summary, url: `${MAJORDOMUS}/use-cases/${u.id}/`,
        seen: film.chapters.filter((ch) => ch.use_cases.includes(u.id)).map((ch) => ({ cut: 'film',
          chapter: ch.id, title: ch.title, t: ch.t })),
      })),
    };
  }).filter((c) => c.use_cases.length);
  data.requirements = t.list(needs);
  const shown = new Set(film.chapters.flatMap((c) => c.use_cases));
  data.counts = {
    chapters: film.chapters.length, stories: data.cuts.filter((c) => c.kind === 'story').length,
    use_cases: cat.useCases.length, use_cases_shown: [...shown].filter((id) => useCaseById[id]).length,
    formats: FORMATS.length, acts: new Set(film.chapters.map((c) => c.act)).size,
    renders: data.cuts.reduce((a, c) => a + (c.lang === L.id ? Object.keys(c.formats).length : 0), 0),
    renders_declared: data.cuts.length * FORMATS.length,
  };
  return data;
};

// ---- the pages: every language's root (the film's route) and one route per cut ---------------
const iso = (s) => { const n = Math.round(s); return `PT${Math.floor(n / 60)}M${n % 60}S`; };
const titleOf = (c, t) => (c.id === 'film' ? t('seo.film_title')
  : c.kind === 'story' ? t('seo.story_title', { title: c.title })
    : t('seo.short_title', { title: c.title, length: length(c.duration) }));
const descriptionOf = (c, data, t) => (c.id === 'film'
  ? t('seo.film_description', { n: data.counts.stories, length: length(c.duration) })
  : t('seo.cut_description', { summary: c.summary, length: length(c.duration) })).slice(0, 200);
const ldVideo = (c) => {
  const v = best(c);
  return {
    '@type': 'VideoObject', '@id': `${BASE}${c.page}#video`, name: `Majordomus: ${c.title}`,
    description: c.summary, thumbnailUrl: [BASE + c.og, BASE + v.poster], uploadDate: c.published,
    duration: iso(c.duration), contentUrl: BASE + v.video, embedUrl: BASE + c.page, inLanguage: c.lang,
    width: v.width, height: v.height, isFamilyFriendly: true,
    publisher: { '@type': 'Person', name: 'Tomas Korcak', url: 'https://github.com/korczis' },
    transcript: c.chapters.map((ch) => ch.narration).join(' '),
    hasPart: c.chapters.map((ch, i) => ({ '@type': 'Clip', name: ch.title, startOffset: ch.t,
      endOffset: c.chapters[i + 1]?.t ?? Math.floor(c.duration), url: `${BASE}${c.page}?t=${ch.t}` })),
  };
};
const templates = { index: readFileSync(join(SITE, 'index.html'), 'utf8'),
  player: readFileSync(join(SITE, 'player.html'), 'utf8') };
// {{name}} is what the build derives; {{m:<key>}} the page language's message (site/messages.json)
const fillIn = (text, fill, name, t) => text.replace(/\{\{m:([a-z0-9_.]+)\}\}/g, (m, k) => t.html(k))
  .replace(/\{\{([a-zA-Z_]+)\}\}/g, (m, k) => {
    if (!(k in fill)) throw new Error(`site/${name}.html names {{${k}}}, which the build does not derive`);
    return fill[k];
  });
// the Pro class lists and icons, by name: the templates write {{ui_card}}, {{icon_prev}}
const named = Object.fromEntries([...Object.entries(ui).map(([k, v]) => [`ui_${k}`, v]),
  ...Object.entries(icon).map(([k, v]) => [`icon_${k}`, v])]);
const link = (href, text) => raw(`<a class="text-primary-400 hover:underline" href="${esc(href)}">${esc(text)}</a>`);
const kbd = (k) => raw(`<kbd class="px-1.5 py-0.5 border border-gray-700 rounded">${k}</kbd>`);
const nameOf = (id) => LANGS.find((x) => x.id === id).t('lang.name');
const page = (L, data, R, current) => {
  const t = L.t;
  const isFilm = current.id === 'film';
  const home = R + L.home || './';
  const film = data.cuts.find((c) => c.id === 'film');
  const storyCuts = data.cuts.filter((c) => c.kind === 'story');
  const useCases = Object.fromEntries(data.categories.flatMap((c) => c.use_cases.map((u) => [u.id, u])));
  const releaseLabel = data.release.label;
  const sources = (c) => FORMATS.filter((f) => c.formats[f.id]).map((f) =>
    `<source src="${R}${esc(c.formats[f.id].video)}" type="video/mp4" media="${esc(f.media)}">`).join('');
  const v = best(current);
  const meta = metaTags({
    path: current.page, title: titleOf(current, t), description: descriptionOf(current, data, t),
    images: [
      { path: current.og, width: OG.width, height: OG.height, alt: t('seo.og_alt', { title: current.title }) },
      { path: v.poster, width: v.width, height: v.height, alt: t('seo.poster_alt', { title: current.title }) },
    ],
    video: { path: v.video, width: v.width, height: v.height, duration: Math.round(current.duration),
      released: current.published },
    type: 'video.other', lang: L.id, locale: L.locale, home: L.home,
    alternates: LANGS.map((x) => ({ lang: x.id, locale: x.locale, path: x.home + current.path })),
  }, R);
  const watch = fillIn(templates.player, {
    ...named,
    watch_heading: isFilm ? `<div class="max-w-3xl mb-6">
      <p class="mb-1 ${ui.eyebrow} text-primary-400">${t.html('watch.eyebrow')}</p>
      <h2 class="mb-3 font-serif text-3xl font-normal tracking-tight md:text-4xl">${t.html('watch.title')}</h2>
      <p class="text-gray-500 dark:text-gray-400 text-pretty">${t.html('watch.intro', { chapters: film.chapters.length,
    acts: data.counts.acts, length: length(film.duration),
    short: length(data.cuts.find((c) => c.id === 'short')?.duration || 0) })}</p>
    </div>` : '',
    film_sources: sources(current),
    film_poster: R + esc(v.poster),
    film_captions: R + esc(current.captions),
    film_chapters: chapterList(current, R),
    media_lang: esc(current.lang),
    media_lang_name: esc(nameOf(current.lang)),
    media_lang_attr: langAttr(current, t),
    now_act: esc(`${current.title} · ${current.chapters[0].act}`),
    now_title: esc(current.chapters[0].title),
    cut_buttons: cutButtons([...(isFilm ? [] : current.kind === 'story' ? [current] : []),
      ...data.cuts.filter((c) => c.kind !== 'story')], current.id, t),
    format_buttons: formatButtons(L.formats, t),
    player_keys: t.html('player.keys', { j: kbd('J'), k: kbd('K'), t: kbd('T'), f: kbd('F'), c: kbd('C') }),
  }, 'player', t);
  const n = storyCuts.length;
  const start = Math.max(0, storyCuts.findIndex((c) => c.id === current.id));
  const longest = length(Math.max(...storyCuts.map((s) => s.duration)));
  const hero = isFilm ? `<h1 class="max-w-4xl mb-4 font-serif text-4xl font-normal leading-tight tracking-tight md:text-5xl xl:text-6xl text-balance">${t.html('hero.film_title')}</h1>
    <p class="max-w-3xl mb-8 text-lg text-gray-500 lg:text-xl dark:text-gray-400 text-pretty">${t.html('hero.film_intro', {
    majordomus: link(MAJORDOMUS, 'Majordomus'), n, longest, chapters: film.chapters.length,
    length: length(film.duration), formats: t.list(L.formats.map((f) => f.label.toLocaleLowerCase(L.locale))) })}</p>`
    : `<p class="mb-2 ${ui.eyebrow} text-primary-400">${current.kind === 'story' ? t.html('hero.story_eyebrow', {
      link: raw(`<a class="hover:underline" href="${esc(current.category_url)}">majordomus.dev/use-cases/${esc(current.category)}</a>`) })
      : t.html('hero.short_eyebrow')}</p>
    <h1 class="max-w-4xl mb-4 font-serif text-4xl font-normal leading-tight tracking-tight md:text-5xl text-balance">${esc(current.title)}</h1>
    <p class="max-w-3xl mb-8 text-lg text-gray-500 lg:text-xl dark:text-gray-400 text-pretty">${t.html('hero.cut_intro', {
      summary: current.summary, length: length(current.duration), chapters: current.chapters.length })}</p>`;
  const heroActions = isFilm
    ? `<a href="#start" class="px-5 py-3 text-base ${ui.primary}">${t.html('hero.find')}</a>
      <a href="#watch" data-play="film" class="px-5 py-3 text-base ${ui.secondary}">${icon.play} ${t.html('hero.watch_film', { length: length(film.duration) })}</a>`
    : `<a href="#watch" data-play="${esc(current.id)}" class="px-5 py-3 text-base ${ui.primary}">${icon.play} ${t.html('hero.play', { length: length(current.duration) })}</a>
      <a href="${home}#stories" class="px-5 py-3 text-base ${ui.secondary}">${t.html('hero.every_story')}</a>`;
  const releaseLink = raw(`<a class="text-primary-400 hover:underline" href="${esc(releaseUrl)}" `
    + `data-majordomus-version="${esc(stated.version)}" data-majordomus-pending="${pending}" `
    + `data-majordomus-commit="${esc(stated.commit)}">Majordomus ${esc(releaseLabel)}</a>`);
  const fill = {
    ...named,
    meta,
    lang: L.id,
    root: R,
    lang_root: R + L.home,
    home,
    cut: current.id,
    language_switch: languageSwitch(LANGS.map((x) => ({ id: x.id, href: R + x.home + current.path || './',
      name: x.t('lang.name'), read: x.t('lang.read') })), L.id, t),
    film_href: `${home}#watch`,
    film_title: esc(film.title),
    version: esc(stated.version),
    release_label: esc(releaseLabel),
    release_pending: String(pending),
    release_note: esc(pending ? t('release.note_pending', { tag: stated.tag }) : t('release.note')),
    release_link: esc(pending ? t('release.link_pending', { tag: stated.tag }) : t('release.link', { tag: stated.tag })),
    release_url: esc(releaseUrl),
    release_commit: esc(stated.commit),
    hero,
    hero_actions: heroActions,
    watch_top: isFilm ? '' : watch,
    watch_bottom: isFilm ? watch : '',
    slides: storyCuts.map((c, i) => storySlide(c, R, i, n, useCases, t)).join('\n        '),
    dots: slideDots(storyCuts, t),
    carousel_start: String(start),
    filter_chips: filterChips(data.categories, storyCuts, t),
    tiles: storyCuts.map((c) => galleryTile(c, R, useCases, L.formats, t)).join('\n      '),
    browser_count: t.html('browser.count', { n,
      shown: raw(`<span id="shown-count" class="font-semibold text-gray-900 dark:text-white">${n}</span>`),
      total: raw(`<span id="total-count">${n}</span>`) }),
    stories_intro: t.html('stories.intro', { length: longest }),
    use_case_index: data.categories.map((c) => categoryCard(c, R, film, t)).join('\n        '),
    use_cases_intro: t.html('use_cases.intro', { release: releaseLabel, total: data.counts.use_cases,
      shown: data.counts.use_cases_shown, link: link(`${MAJORDOMUS}/use-cases/`, 'majordomus.dev/use-cases') }),
    example_story: esc(storyCuts[0]?.category || ''),
    example_env: L === SOURCE ? '' : `REEL_LANG=${esc(L.id)} `,
    stats: [
      statCard(releaseLabel, pending ? t('stats.release_pending') : t('stats.release'), releaseUrl),
      statCard(String(stated.rules), t('stats.rules')),
      statCard(`${stated.blocking_validated}/${stated.blocking}`, t('stats.blocking')),
      statCard(String(stated.adrs), t('stats.decisions')),
    ].join('\n        '),
    youtube: data.youtube.map((y) => `<a class="block p-5 ${ui.card} hover:bg-gray-100 dark:hover:bg-gray-800" href="${esc(y.url)}"${y.lang !== L.id ? ` lang="${esc(y.lang)}"` : ''}><h4 class="mb-1 font-semibold text-gray-900 dark:text-white">${esc(y.title)}</h4><p class="text-sm text-gray-500 dark:text-gray-400">${t.html('made.youtube_card', { cut: y.cut, length: length(y.duration) })}</p></a>`).join('\n        '),
    requirements: t.html('made.needs', { tools: data.requirements }),
    footer_facts: t.html('footer.facts', { release: releaseLink }),
    data_json: JSON.stringify(data).replace(/</g, '\\u003c'),
    messages_json: JSON.stringify({ lang: L.id, locale: L.locale,
      messages: PARTIAL ? { ...EN.messages, ...L.messages } : L.messages }).replace(/</g, '\\u003c'),
    ld_json: JSON.stringify({ '@context': 'https://schema.org', '@graph': [
      { '@type': 'WebSite', '@id': `${BASE}${L.home}#site`, url: BASE + L.home, name: 'Majordomus reel', inLanguage: L.id },
      ldVideo(current),
      ...(isFilm ? data.cuts.filter((c) => c.id !== 'film').map(ldVideo) : [{ '@type': 'BreadcrumbList',
        itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Majordomus reel', item: BASE + L.home },
          { '@type': 'ListItem', position: 2, name: current.title, item: BASE + current.page }] }]),
    ] }).replace(/</g, '\\u003c'),
    year: BUILT.slice(0, 4),
  };
  return fillIn(templates.index, fill, 'index', t);
};
const sites = LANGS.map((L) => ({ L, data: dataFor(L) }));
for (const { L, data } of sites) {
  for (const c of data.cuts) {
    mkdirSync(join(OUT, c.page), { recursive: true });
    writeFileSync(join(OUT, c.page, 'index.html'), page(L, data, '../'.repeat(c.page.split('/').filter(Boolean).length), c));
  }
}
const xml = (s) => esc(s).replace(/'/g, '&apos;');
writeFileSync(join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:video="http://www.google.com/schemas/sitemap-video/1.1" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${sites.flatMap(({ L, data }) => data.cuts.map((c) => `  <url>
    <loc>${BASE}${c.page}</loc>
    <lastmod>${BUILT}</lastmod>
${[...LANGS.map((x) => [x.id, x.home]), ['x-default', SOURCE.home]].map(([id, h]) => `    <xhtml:link rel="alternate" hreflang="${id}" href="${BASE}${h}${c.path}"/>`).join('\n')}
    <video:video>
      <video:thumbnail_loc>${BASE}${c.og}</video:thumbnail_loc>
      <video:title>${xml(titleOf(c, L.t))}</video:title>
      <video:description>${xml(descriptionOf(c, data, L.t))}</video:description>
      <video:content_loc>${BASE}${best(c).video}</video:content_loc>
      <video:duration>${Math.round(c.duration)}</video:duration>
      <video:publication_date>${c.published}</video:publication_date>
      <video:family_friendly>yes</video:family_friendly>
    </video:video>
  </url>`)).join('\n')}
</urlset>
`);
writeFileSync(join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${BASE}sitemap.xml\n`);
writeFileSync(join(OUT, 'site.webmanifest'), JSON.stringify({ name: 'Majordomus reel', short_name: 'Reel',
  start_url: './', scope: './', display: 'standalone', background_color: '#030712', theme_color: '#030712',
  icons: [{ src: 'icon.svg', type: 'image/svg+xml', sizes: 'any' },
    { src: 'apple-touch-icon.png', type: 'image/png', sizes: '180x180' },
    { src: 'icon-512.png', type: 'image/png', sizes: '512x512' }] }, null, 2) + '\n');
// the icons: the brand mark, drawn once in site/icon.svg, rasterised by the local Chrome
copyFileSync(join(SITE, 'icon.svg'), join(OUT, 'icon.svg'));
for (const [name, px] of [['favicon-32.png', 32], ['apple-touch-icon.png', 180], ['icon-512.png', 512]]) {
  copyFileSync(cached(`${hash(readFileSync(join(SITE, 'icon.svg'))).slice(0, 12)}-${px}.png`,
    (part) => run(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--window-size=${px},${px}`,
      '--default-background-color=00000000', `--screenshot=${part}`,
      pathToFileURL(join(SITE, 'icon.svg')).href])), join(OUT, name));
}
writeFileSync(join(OUT, '.nojekyll'), '');
for (const { L, data } of sites) {
  const t = L.t;
  mkdirSync(join(OUT, L.home, 'data'), { recursive: true });
  writeFileSync(join(OUT, L.home, 'data', 'reel.json'), JSON.stringify(data, null, 2) + '\n');
  // llms.txt: the same object for an agent that reads text, one per language; the root's names
  // every language's entry point
  const label = (id) => L.formats.find((f) => f.id === id).label.toLocaleLowerCase(L.locale);
  writeFileSync(join(OUT, L.home, 'llms.txt'), [
    '# Majordomus reel', '',
    `> ${data.about}`, '',
    t('llms.release', { release: data.release.label, url: releaseUrl, rules: stated.rules,
      validated: stated.blocking_validated, blocking: stated.blocking, decisions: stated.adrs }), '',
    t('llms.machine', { url: `${BASE}${L.home}data/reel.json` }), '',
    ...(L === SOURCE ? [`## ${t('llms.languages')}`, '', ...data.languages.map((x) => `- ${t('llms.language', {
      name: x.name, url: `${BASE}${x.home}`, llms: `${BASE}${x.llms}`, data: `${BASE}${x.data}` })}`), ''] : []),
    `## ${t('llms.cuts')}`, '',
    ...data.cuts.map((c) => `- [${c.title}](${BASE}${c.page}): ${t('llms.cut', { summary: c.summary,
      length: length(c.duration), formats: t.list(Object.keys(c.formats).map(label)) })}`
      + `${c.language_fallback ? `; ${t('llms.language_fallback')}` : ''}`
      + `${Object.keys(c.fallback).length ? `; ${t.list(Object.entries(c.fallback).map(([w, h]) => t('llms.fallback', { wanted: label(w), played: label(h) })))}` : ''}`),
    '',
    `## ${t('llms.use_cases')}`, '',
    ...data.categories.flatMap((c) => [`### ${c.title}`, '', ...(c.story ? [t('llms.story', { url: `${BASE}${c.story_page}` }), ''] : []),
      ...c.use_cases.map((u) => `- [${u.title}](${u.url})`
      + (u.seen[0] ? `, ${t('llms.seen', { clock: clock(u.seen[0].t), url: `${BASE}${L.home}?t=${u.seen[0].t}` })}` : '')), '']),
  ].join('\n'));
}

// the styles: Tailwind 4 with the Flowbite plugin, over the templates and the script
run(join(ROOT, 'node_modules', '.bin', 'tailwindcss'), ['--input', join(SITE, 'app.css'), '--output',
  join(OUT, 'app.css'), '--minify']);
for (const f of ['app.js', 'view.mjs', 'lang.js']) copyFileSync(join(SITE, f), join(OUT, f));
copyFileSync(join(ROOT, 'node_modules', 'flowbite', 'dist', 'flowbite.min.js'), join(OUT, 'flowbite.min.js'));

// budgets: no file over GitHub's cap, the site under the Pages cap
const total = readdirSync(join(OUT, 'v')).reduce((a, f) => {
  const s = statSync(join(OUT, 'v', f)).size;
  if (s > FILE_CAP) throw new Error(`v/${f} is ${(s / 1e6).toFixed(0)} MB; GitHub refuses files over 100 MB`);
  return a + s;
}, 0);
if (total > SITE_CAP) throw new Error(`the site is ${(total / 1e6).toFixed(0)} MB; Pages caps a site at 1 GB`);
const gaps = findings.filter((f) => f.kind === 'missing').length;
console.log(`site    ${OUT}: ${sites.map(({ L, data }) => `${L.id} ${data.cuts.length} routes, `
  + `${data.counts.renders} of ${data.counts.renders_declared} cut formats rendered`).join('; ')}, `
  + `${(total / 1e6).toFixed(0)} MB, Majordomus ${sites[0].data.release.label}`
  + `${PARTIAL ? ' (PARTIAL: not deployable)' : FALLBACK && gaps
    ? ` (FALLBACK: ${gaps} missing formats or languages play their nearest)` : ''}`);
// the metadata gate (project.reel-site-is-derived, project.reel-bilingual)
const seo = checkSite(OUT);
seo.findings.forEach((f) => console.error(`FAIL ${f}`));
if (seo.findings.length) {
  console.error(`site: refused, ${seo.findings.length} metadata finding(s)`);
  process.exit(1);
}
console.log(`seo     ok, ${seo.pages} page(s) in ${LANGS.length} languages, every route with its own `
  + 'preview, video, clips and its counterpart in every language');
if (PARTIAL) writeFileSync(join(OUT, '.partial'), `${findings.map((f) => f.text).join('\n')}\n`);
