// Builds the GitHub Pages site into _site/ from data, never from typed copy: every cut (the film,
// the short, one story per use-case category: stories.mjs) in every format formats.json declares
// (project.reel-tailored-per-device), each cut's chapters, narration and captions from its render
// (timeline.json, captions.vtt), its posters and share pictures from its own frames, the Majordomus
// facts and use cases from the release the film was rendered with (facts.mjs), the YouTube uploads
// (site/published.json) and what a render needs (make-reel.sh). The pages, data/reel.json,
// sitemap.xml and llms.txt are projections of one object (project.reel-site-is-derived).
//
//   node site/build.mjs              -> _site/ (refuses a missing format and any other finding)
//   FALLBACK=1 node site/build.mjs   -> deployable with missing formats: each falls back to the
//                                       nearest one the cut has, the page says so, reel.json
//                                       records it; every other finding still refuses
//   PARTIAL=1 node site/build.mjs    -> a local preview with whatever exists; never deployed
//
// CUTS (default $ROOT/cuts/v6) holds <cut>-<format>.mp4; RENDERS (default $ROOT/build-v6) holds
// <cut>-<format>/ with the render's timeline.json, captions.vtt and facts.json.
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
  esc, clock, length, best, plural, list, chapterList, storySlide, slideDots, filterChips, galleryTile,
  categoryCard, statCard, formatButtons, cutButtons, ui, icon,
} from './view.mjs';
import { derive, catalogue, released } from '../facts.mjs';
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

// ---- the cuts: what must exist, and what does -------------------------------------------------
const storyList = deriveStories(release);
const wanted = [
  { id: 'film', kind: 'film', title: 'The film', summary: 'Every chapter of Majordomus, end to end.' },
  { id: 'short', kind: 'short', title: 'The short', summary: 'The whole argument, for a feed.' },
  ...storyList.map((s) => ({ id: `story-${s.id}`, kind: 'story', title: s.title, summary: s.summary,
    story: s })),
];
// a finding is `missing` (a format not rendered yet: FALLBACK=1 deploys around it) or a `defect`
const findings = [];
const finding = (kind, text) => findings.push({ kind, text });
const cuts = [];
for (const cut of wanted) {
  const formats = {};
  for (const f of FORMATS) {
    const video = join(CUTS, `${cut.id}-${f.id}.mp4`);
    const dir = join(RENDERS, `${cut.id}-${f.id}`);
    const need = [video, join(dir, 'timeline.json'), join(dir, 'captions.vtt'), join(dir, 'facts.json')];
    const missing = need.filter((p) => !existsSync(p));
    if (missing.length) {
      finding('missing', `${cut.id} has no ${f.id} cut (${missing.map((m) => m.replace(`${ROOT}/`, '')).join(', ')})`);
      continue;
    }
    const facts = readJson(join(dir, 'facts.json'));
    const size = probe(video);
    if (size.width !== f.width || size.height !== f.height) {
      finding('defect', `${cut.id}-${f.id}: rendered ${size.width}x${size.height}, formats.json says `
        + `${f.width}x${f.height}`);
      continue;
    }
    if (facts.format && facts.format !== f.id) finding('defect', `${cut.id}-${f.id}: rendered as ${facts.format}`);
    // a cut is current while the facts it states are its release's (facts.mjs --same)
    const target = releaseOf(facts);
    if (target.pending) {
      finding('defect', `${cut.id}-${f.id}: pre-rendered from ${facts.commit.slice(0, 12)} for `
        + `${facts.tag}, which is not released yet (release pending)`);
    } else if (target.unfetched) {
      finding('defect', `${cut.id}-${f.id}: ${facts.tag} is released but not in the clone; fetch its tags`);
    } else {
      const keys = facts.uses || ['version', 'rules', 'rules_validated', 'blocking', 'blocking_validated', 'adrs'];
      const stale = keys.filter((k) => facts[k] !== target.facts[k]);
      if (stale.length) {
        finding('defect', `${cut.id}-${f.id}: states ${stale.map((k) => `${k} ${facts[k]}`).join(', ')}; `
          + `${target.facts.tag} says ${stale.map((k) => target.facts[k]).join(', ')}`);
      }
    }
    if (facts.captions) finding('defect', `${cut.id}-${f.id}: captions are burned in; the page serves them as a track`);
    const duration = probe(video).duration;
    formats[f.id] = { video, dir, facts, size, duration, timeline: readJson(join(dir, 'timeline.json')) };
  }
  if (Object.keys(formats).length) cuts.push({ ...cut, formats });
  else finding('defect', `${cut.id} has no cut in any format`);
}
const refused = findings.filter((f) => !PARTIAL && (f.kind === 'defect' || !FALLBACK));
findings.forEach((f) => console.warn(`   ${refused.includes(f) ? 'FAIL' : f.kind === 'missing' && FALLBACK
  ? 'fallback' : 'partial'}: ${f.text}`));
if (refused.length) {
  console.error(`site: refused, ${refused.length} finding(s) (project.reel-tailored-per-device, `
    + 'project.reel-facts-are-derived); render the missing cuts, FALLBACK=1 to deploy around a '
    + 'missing format, or PARTIAL=1 for a local preview');
  process.exit(1);
}
if (!cuts.some((c) => c.id === 'film')) throw new Error('no film cut in any format');

// the release the film states is the one the page names
const filmAny = Object.values(cuts.find((c) => c.id === 'film').formats)[0];
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

// ---- the data: one object, every projection --------------------------------------------------
const chaptersOf = (tl) => tl.scenes.filter((s) => s.id !== 'loop').map((s) => ({
  id: s.id, t: Math.floor(s.start), title: s.title, act: s.act, use_cases: s.use_cases || [],
  narration: s.vo.replace(/\.?\s*\.\.\.\s*/g, '… ').trim(),
}));
// the day a cut was published, from git: the newest commit of what makes it
const COMMON = ['reel.html', 'render.mjs', 'gen.js', 'viz.js', 'synth.mjs', 'formats.json'];
const SOURCES = { film: ['scenes.json'], short: ['scenes-short.json'], story: ['scenes.json', 'stories.mjs'] };
const gitDate = (kind) => run('git', ['-C', ROOT, 'log', '-1', '--format=%cI', '--',
  ...SOURCES[kind], ...COMMON]).trim();
const releaseUrl = pending ? `${MAJORDOMUS_REPO}/commit/${stated.commit}`
  : `${MAJORDOMUS_REPO}/releases/tag/${stated.tag}`;
const releaseLabel = pending ? `${stated.version}, release pending` : stated.version;
const data = {
  about: 'The Majordomus reel: every cut in the formats it is rendered in, its chapters and the '
    + 'Majordomus use cases each chapter shows, derived from the renders and the release. The pages, '
    + 'sitemap.xml and llms.txt are projections of this object.',
  site: BASE,
  source: REPO,
  release: {
    version: stated.version, tag: stated.tag, commit: stated.commit, url: releaseUrl, label: releaseLabel,
    pending, rules: stated.rules, rules_validated: stated.rules_validated, blocking: stated.blocking,
    blocking_validated: stated.blocking_validated, decisions: stated.adrs,
  },
  formats: FORMATS.map(({ id, label, width, height, media, detail }) => ({ id, label, width, height,
    media, detail })),
  cuts: [],
  categories: [],
  youtube: [],
  gaps: findings.filter((f) => f.kind === 'missing').map((f) => f.text.replace(/ \(.*$/, '')),
};
let bytes = 0;
for (const cut of cuts) {
  const any = best(cut);
  const tl = any.timeline;
  const out = {
    id: cut.id, kind: cut.kind, title: cut.title, summary: cut.summary, duration: +any.duration.toFixed(1),
    page: cut.id === 'film' ? '' : `${cut.id}/`, published: gitDate(cut.kind),
    chapters: chaptersOf(tl), captions: `v/${cut.id}.vtt`, og: `og/${cut.id}.jpg`, formats: {},
    // every declared format the cut lacks, and the one the page plays instead
    fallback: Object.fromEntries(FORMATS.filter((f) => !cut.formats[f.id])
      .map((f) => [f.id, nearest(f.id, Object.keys(cut.formats))])),
    ...(cut.story ? { category: cut.story.id, category_url: cut.story.url,
      use_cases: cut.story.use_cases.map((u) => u.id) } : {}),
  };
  copyFileSync(join(any.dir, 'captions.vtt'), join(OUT, out.captions));
  for (const f of FORMATS) {
    const r = cut.formats[f.id];
    if (!r) continue;
    const video = `v/${cut.id}-${f.id}.mp4`;
    const still = `v/${cut.id}-${f.id}.jpg`;
    console.log(`   ${cut.id} ${f.id}`);
    const size = encode(r.video, f, join(OUT, video));
    const moments = goodMoments(r.video, r.timeline);
    if (!moments.length) throw new Error(`${cut.id}-${f.id}: no frame of the cut shows anything`);
    frame(r.video, moments[0], `scale=${f.web[0]}:${f.web[1]}:flags=lanczos`, join(OUT, still));
    bytes += size + statSync(join(OUT, still)).size;
    out.formats[f.id] = { video, poster: still, poster_t: moments[0], width: f.web[0], height: f.web[1],
      bytes: size };
    r.moments = moments;
  }
  // the share picture from the format that fills it best: the widest the cut has
  const wide = FORMATS.filter((f) => cut.formats[f.id]).pop();
  sharePicture(cut.formats[wide.id], wide, cut.formats[wide.id].moments, join(OUT, out.og));
  out.og_from = wide.id;
  data.cuts.push(out);
}
// where each use case is seen: the film's chapters and the stories that carry it
const film = data.cuts.find((c) => c.id === 'film');
data.categories = cat.categories.map((c) => ({
  id: c.id, title: c.title, summary: c.summary, url: `${MAJORDOMUS}/use-cases/${c.id}/`,
  story: data.cuts.find((x) => x.category === c.id)?.id || null,
  use_cases: cat.useCases.filter((u) => u.category === c.id).map((u) => ({
    id: u.id, title: u.title, summary: u.summary, url: `${MAJORDOMUS}/use-cases/${u.id}/`,
    seen: film.chapters.filter((ch) => ch.use_cases.includes(u.id)).map((ch) => ({ cut: 'film',
      chapter: ch.id, title: ch.title, t: ch.t })),
  })),
})).filter((c) => c.use_cases.length);
const useCases = Object.fromEntries(data.categories.flatMap((c) => c.use_cases.map((u) => [u.id, u])));
data.youtube = readJson(join(SITE, 'published.json')).videos.map((v) => {
  const render = join(ROOT, v.render);
  if (!existsSync(render)) throw new Error(`published.json names a render that is not here: ${render}`);
  return { url: v.url, title: v.title, cut: v.cut, duration: Math.round(probe(render).duration) };
});
const makeReel = readFileSync(join(ROOT, 'make-reel.sh'), 'utf8');
const tools = (makeReel.match(/^for tool in ([^;]+);/m) || [])[1];
if (!tools) throw new Error('make-reel.sh no longer names its tools in a `for tool in` line');
const needs = [...tools.trim().split(/\s+/).filter((t) => t !== 'ffprobe'), 'Google Chrome'];
data.requirements = list(needs);
const shown = new Set(film.chapters.flatMap((c) => c.use_cases));
const storyCuts = data.cuts.filter((c) => c.kind === 'story');
data.counts = {
  chapters: film.chapters.length, stories: storyCuts.length,
  use_cases: cat.useCases.length, use_cases_shown: [...shown].filter((id) => useCaseById[id]).length,
  formats: FORMATS.length, acts: new Set(film.chapters.map((c) => c.act)).size,
  renders: data.cuts.reduce((a, c) => a + Object.keys(c.formats).length, 0),
  renders_declared: data.cuts.length * FORMATS.length,
};

// ---- the pages: the site's root (the film's route) and one route per cut ----------------------
const iso = (s) => { const n = Math.round(s); return `PT${Math.floor(n / 60)}M${n % 60}S`; };
const pathOf = (c) => c.page;
const titleOf = (c) => (c.id === 'film' ? 'Majordomus reel: make your AI agent prove it'
  : c.kind === 'story' ? `${c.title}: a Majordomus story` : `${c.title}: Majordomus in ${length(c.duration)}`);
const descriptionOf = (c) => (c.id === 'film'
  ? `Majordomus, the supervisory layer for AI coding agents: ${plural(storyCuts.length, 'short story', 'short stories')}, `
    + `one per kind of work, and the whole film in ${length(c.duration)}, rendered from code.`
  : `${c.summary} ${length(c.duration)}, from the problem to the install line.`).slice(0, 200);
const ldVideo = (c) => {
  const v = best(c);
  return {
    '@type': 'VideoObject', '@id': `${BASE}${pathOf(c)}#video`, name: `Majordomus: ${c.title}`,
    description: c.summary, thumbnailUrl: [BASE + c.og, BASE + v.poster], uploadDate: c.published,
    duration: iso(c.duration), contentUrl: BASE + v.video, embedUrl: BASE + pathOf(c), inLanguage: 'en',
    width: v.width, height: v.height, isFamilyFriendly: true,
    publisher: { '@type': 'Person', name: 'Tomas Korcak', url: 'https://github.com/korczis' },
    transcript: c.chapters.map((ch) => ch.narration).join(' '),
    hasPart: c.chapters.map((ch, i) => ({ '@type': 'Clip', name: ch.title, startOffset: ch.t,
      endOffset: c.chapters[i + 1]?.t ?? Math.floor(c.duration), url: `${BASE}${pathOf(c)}?t=${ch.t}` })),
  };
};
const templates = { index: readFileSync(join(SITE, 'index.html'), 'utf8'),
  player: readFileSync(join(SITE, 'player.html'), 'utf8') };
const fillIn = (text, fill, name) => text.replace(/\{\{([a-zA-Z_]+)\}\}/g, (m, k) => {
  if (!(k in fill)) throw new Error(`site/${name}.html names {{${k}}}, which the build does not derive`);
  return fill[k];
});
// the Pro class lists and icons, by name: the templates write {{ui_card}}, {{icon_prev}}
const named = Object.fromEntries([...Object.entries(ui).map(([k, v]) => [`ui_${k}`, v]),
  ...Object.entries(icon).map(([k, v]) => [`icon_${k}`, v])]);
const formatsSaid = list(FORMATS.map((f) => f.label.toLowerCase()));
const page = (R, current) => {
  const isFilm = current.id === 'film';
  const home = R || '';
  const sources = (c) => FORMATS.filter((f) => c.formats[f.id]).map((f) =>
    `<source src="${R}${esc(c.formats[f.id].video)}" type="video/mp4" media="${esc(f.media)}">`).join('');
  const v = best(current);
  const meta = metaTags({
    path: pathOf(current), title: titleOf(current), description: descriptionOf(current),
    images: [
      { path: current.og, width: OG.width, height: OG.height,
        alt: `${current.title}: frames of the ${current.kind === 'story' ? 'story' : current.kind}` },
      { path: v.poster, width: v.width, height: v.height, alt: `${current.title}: its poster frame` },
    ],
    video: { path: v.video, width: v.width, height: v.height, duration: Math.round(current.duration),
      released: current.published },
    type: 'video.other',
  }, R);
  const watch = fillIn(templates.player, {
    ...named,
    watch_heading: isFilm ? `<div class="max-w-3xl mb-6">
      <p class="mb-1 ${ui.eyebrow} text-primary-400">The whole picture</p>
      <h2 class="mb-3 font-serif text-3xl font-normal tracking-tight md:text-4xl">The film, <em class="text-primary-400">end to end.</em></h2>
      <p class="text-gray-500 dark:text-gray-400 text-pretty">${esc(plural(film.chapters.length, 'chapter'))} in ${esc(plural(data.counts.acts, 'act'))}, ${esc(length(film.duration))}. Short of time: the short says the whole argument in ${esc(length(data.cuts.find((c) => c.id === 'short')?.duration || 0))}.</p>
    </div>` : '',
    film_sources: sources(current),
    film_poster: R + esc(v.poster),
    film_captions: R + esc(current.captions),
    film_chapters: chapterList(current, R),
    now_act: esc(`${current.title} · ${current.chapters[0].act}`),
    now_title: esc(current.chapters[0].title),
    cut_buttons: cutButtons([...(isFilm ? [] : current.kind === 'story' ? [current] : []),
      ...data.cuts.filter((c) => c.kind !== 'story')], current.id),
    format_buttons: formatButtons(FORMATS),
  }, 'player');
  const n = storyCuts.length;
  const start = Math.max(0, storyCuts.findIndex((c) => c.id === current.id));
  const hero = isFilm ? `<h1 class="max-w-4xl mb-4 font-serif text-4xl font-normal leading-tight tracking-tight md:text-5xl xl:text-6xl text-balance">Your AI agent says the work is done. <em class="text-primary-400">Make it prove it.</em></h1>
    <p class="max-w-3xl mb-8 text-lg text-gray-500 lg:text-xl dark:text-gray-400 text-pretty"><a class="text-primary-400 hover:underline" href="https://majordomus.dev">Majordomus</a> is the supervisory layer for AI coding agents. Start with the story that is yours: ${esc(plural(n, 'short film'))}, one per kind of work, each at most ${esc(length(Math.max(...storyCuts.map((s) => s.duration))))} and ending at the install line. Or watch the whole film, ${esc(plural(film.chapters.length, 'chapter'))} in ${esc(length(film.duration))}. Every cut is rendered from code and composed for ${esc(formatsSaid)}; this page plays the one your screen deserves, and says so when a format is still to come.</p>`
    : `<p class="mb-2 ${ui.eyebrow} text-primary-400">${current.kind === 'story' ? `A Majordomus story &middot; <a class="hover:underline" href="${esc(current.category_url)}">majordomus.dev/use-cases/${esc(current.category)}</a>` : 'Majordomus in short'}</p>
    <h1 class="max-w-4xl mb-4 font-serif text-4xl font-normal leading-tight tracking-tight md:text-5xl text-balance">${esc(current.title)}</h1>
    <p class="max-w-3xl mb-8 text-lg text-gray-500 lg:text-xl dark:text-gray-400 text-pretty">${esc(current.summary)} ${esc(length(current.duration))}, ${esc(plural(current.chapters.length, 'chapter'))}, from the problem to the install line.</p>`;
  const heroActions = isFilm
    ? `<a href="#start" class="px-5 py-3 text-base ${ui.primary}">Find your story</a>
      <a href="#watch" data-play="film" class="px-5 py-3 text-base ${ui.secondary}">${icon.play} Watch the film, ${esc(length(film.duration))}</a>`
    : `<a href="#watch" data-play="${esc(current.id)}" class="px-5 py-3 text-base ${ui.primary}">${icon.play} Play it, ${esc(length(current.duration))}</a>
      <a href="${home}#stories" class="px-5 py-3 text-base ${ui.secondary}">Every story</a>`;
  const fill = {
    ...named,
    meta,
    root: R,
    home: home || './',
    cut: current.id,
    film_href: `${home}#watch`,
    film_title: esc(film.title),
    version: esc(stated.version),
    release_label: esc(releaseLabel),
    release_pending: String(pending),
    release_note: esc(pending ? `Every fact comes from the commit that declares ${stated.tag}; the tag is not out yet`
      : 'Every fact in the reel comes from this release'),
    release_link: esc(pending ? `${stated.tag} (pending)` : `Release ${stated.tag}`),
    release_url: esc(releaseUrl),
    release_commit: esc(stated.commit),
    hero,
    hero_actions: heroActions,
    watch_top: isFilm ? '' : watch,
    watch_bottom: isFilm ? watch : '',
    slides: storyCuts.map((c, i) => storySlide(c, R, i, n, useCases)).join('\n        '),
    dots: slideDots(storyCuts),
    carousel_start: String(start),
    filter_chips: filterChips(data.categories, storyCuts),
    tiles: storyCuts.map((c) => galleryTile(c, R, useCases, FORMATS)).join('\n      '),
    story_count: String(n),
    story_length: esc(length(Math.max(...storyCuts.map((s) => s.duration)))),
    use_case_index: data.categories.map((c) => categoryCard(c, R, film)).join('\n        '),
    use_cases_total: String(data.counts.use_cases),
    use_cases_shown: String(data.counts.use_cases_shown),
    example_story: esc(storyCuts[0]?.category || ''),
    stats: [
      statCard(releaseLabel, pending ? 'Majordomus in the reel, release pending' : 'Majordomus release in the reel', releaseUrl),
      statCard(String(stated.rules), 'Standard rules it ships'),
      statCard(`${stated.blocking_validated}/${stated.blocking}`, 'Blocking rules with a validator'),
      statCard(String(stated.adrs), 'Architecture decisions recorded'),
    ].join('\n        '),
    youtube: data.youtube.map((y) => `<a class="block p-5 ${ui.card} hover:bg-gray-100 dark:hover:bg-gray-800" href="${esc(y.url)}"><h4 class="mb-1 font-semibold text-gray-900 dark:text-white">${esc(y.title)}</h4><p class="text-sm text-gray-500 dark:text-gray-400">${esc(y.cut)}, ${esc(length(y.duration))}</p></a>`).join('\n        '),
    requirements: esc(data.requirements),
    data_json: JSON.stringify(data).replace(/</g, '\\u003c'),
    ld_json: JSON.stringify({ '@context': 'https://schema.org', '@graph': [
      { '@type': 'WebSite', '@id': `${BASE}#site`, url: BASE, name: 'Majordomus reel', inLanguage: 'en' },
      ldVideo(current),
      ...(isFilm ? data.cuts.filter((c) => c.id !== 'film').map(ldVideo) : [{ '@type': 'BreadcrumbList',
        itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Majordomus reel', item: BASE },
          { '@type': 'ListItem', position: 2, name: current.title, item: BASE + pathOf(current) }] }]),
    ] }).replace(/</g, '\\u003c'),
    year: BUILT.slice(0, 4),
  };
  return fillIn(templates.index, fill, 'index');
};
for (const c of data.cuts) {
  mkdirSync(join(OUT, c.page), { recursive: true });
  writeFileSync(join(OUT, c.page, 'index.html'), page(c.page ? '../' : '', c));
}
const xml = (s) => esc(s).replace(/'/g, '&apos;');
writeFileSync(join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">
${data.cuts.map((c) => `  <url>
    <loc>${BASE}${c.page}</loc>
    <lastmod>${BUILT}</lastmod>
    <video:video>
      <video:thumbnail_loc>${BASE}${c.og}</video:thumbnail_loc>
      <video:title>${xml(titleOf(c))}</video:title>
      <video:description>${xml(descriptionOf(c))}</video:description>
      <video:content_loc>${BASE}${best(c).video}</video:content_loc>
      <video:duration>${Math.round(c.duration)}</video:duration>
      <video:publication_date>${c.published}</video:publication_date>
      <video:family_friendly>yes</video:family_friendly>
    </video:video>
  </url>`).join('\n')}
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
writeFileSync(join(OUT, 'data', 'reel.json'), JSON.stringify(data, null, 2) + '\n');
writeFileSync(join(OUT, '.nojekyll'), '');
// llms.txt: the same object for an agent that reads text
writeFileSync(join(OUT, 'llms.txt'), [
  '# Majordomus reel', '',
  `> ${data.about}`, '',
  `Majordomus ${releaseLabel} (${releaseUrl}): ${stated.rules} standard rules, `
    + `${stated.blocking_validated} of ${stated.blocking} blocking rules with a validator, ${stated.adrs} decisions.`, '',
  `Machine-readable: ${BASE}data/reel.json`, '',
  '## Cuts', '',
  ...data.cuts.map((c) => `- [${c.title}](${BASE}${c.page}): ${c.summary} ${length(c.duration)}; `
    + `rendered for ${list(Object.keys(c.formats))}`
    + `${Object.keys(c.fallback).length ? `; ${list(Object.entries(c.fallback).map(([w, h]) => `${w} plays ${h}`))}` : ''}`),
  '',
  '## Use cases, by category', '',
  ...data.categories.flatMap((c) => [`### ${c.title}`, '', ...(c.story ? [`Story: ${BASE}${c.story}/`, ''] : []),
    ...c.use_cases.map((u) => `- [${u.title}](${u.url})`
    + (u.seen[0] ? `, seen at ${clock(u.seen[0].t)}: ${BASE}?t=${u.seen[0].t}` : '')), '']),
].join('\n'));

// the styles: Tailwind 4 with the Flowbite plugin, over the templates and the script
run(join(ROOT, 'node_modules', '.bin', 'tailwindcss'), ['--input', join(SITE, 'app.css'), '--output',
  join(OUT, 'app.css'), '--minify']);
for (const f of ['app.js', 'view.mjs']) copyFileSync(join(SITE, f), join(OUT, f));
copyFileSync(join(ROOT, 'node_modules', 'flowbite', 'dist', 'flowbite.min.js'), join(OUT, 'flowbite.min.js'));

// budgets: no file over GitHub's cap, the site under the Pages cap
const total = readdirSync(join(OUT, 'v')).reduce((a, f) => {
  const s = statSync(join(OUT, 'v', f)).size;
  if (s > FILE_CAP) throw new Error(`v/${f} is ${(s / 1e6).toFixed(0)} MB; GitHub refuses files over 100 MB`);
  return a + s;
}, 0);
if (total > SITE_CAP) throw new Error(`the site is ${(total / 1e6).toFixed(0)} MB; Pages caps a site at 1 GB`);
console.log(`site    ${OUT}: ${data.cuts.length} cuts, ${data.counts.renders} of `
  + `${data.counts.renders_declared} cut formats rendered, ${(total / 1e6).toFixed(0)} MB, Majordomus `
  + `${releaseLabel}${PARTIAL ? ' (PARTIAL: not deployable)' : FALLBACK && data.gaps.length
    ? ` (FALLBACK: ${data.gaps.length} missing formats play their nearest)` : ''}`);
// the metadata gate (project.reel-site-is-derived)
const seo = checkSite(OUT);
seo.findings.forEach((f) => console.error(`FAIL ${f}`));
if (seo.findings.length) {
  console.error(`site: refused, ${seo.findings.length} metadata finding(s)`);
  process.exit(1);
}
console.log(`seo     ok, ${seo.pages} page(s), every route with its own preview, video and clips`);
if (PARTIAL) writeFileSync(join(OUT, '.partial'), `${findings.map((f) => f.text).join('\n')}\n`);
