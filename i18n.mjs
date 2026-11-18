// The reel's languages. English is the original (scenes.json, reel.html, the painters); every other
// language is one file, lang/<id>.json, that translates it: per scene the narration, the chapter
// title, the act and the word each cue becomes, plus every on-screen text (project.reel-bilingual).
// This module fills a translation's facts in its own language and decides whether a translation is
// complete and current; render.mjs (REEL_LANG=<id>) and quality.mjs read it.
//
//   node i18n.mjs --check          exit 1 on any finding, in every language
//   node i18n.mjs --check --lang cs
//   node i18n.mjs --json           the coverage of every language, for quality.mjs
//
// A finding is a scene the language does not translate, a cue its narration never says, an
// on-screen text left in English, a translation of a text that no longer exists (stale), or a
// fact typed into the translation instead of derived.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { fill as fillEnglish, derive, catalogue } from './facts.mjs';
import { stories } from './stories.mjs';

const DIR = dirname(fileURLToPath(import.meta.url));
const LANG_DIR = join(DIR, 'lang');

// the cut's languages: English, then every lang/<id>.json
export const languages = () => ['en', ...(existsSync(LANG_DIR) ? readdirSync(LANG_DIR)
  .filter((f) => /^[a-z]{2}(-[A-Z]{2})?\.json$/.test(f)).map((f) => f.replace(/\.json$/, '')).sort() : [])];
export const load = (id) => JSON.parse(readFileSync(join(LANG_DIR, `${id}.json`), 'utf8'));

// the same folding reel.html uses to match a cue to a spoken word
export const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]/g, '');

// ---- numbers as a Czech narrator says them ---------------------------------------------------
const CS_ONES = ['nula', 'jedna', 'dva', 'tři', 'čtyři', 'pět', 'šest', 'sedm', 'osm', 'devět', 'deset',
  'jedenáct', 'dvanáct', 'třináct', 'čtrnáct', 'patnáct', 'šestnáct', 'sedmnáct', 'osmnáct',
  'devatenáct'];
const CS_TENS = ['', '', 'dvacet', 'třicet', 'čtyřicet', 'padesát', 'šedesát', 'sedmdesát', 'osmdesát',
  'devadesát'];
const CS_HUNDREDS = ['', 'sto', 'dvě stě', 'tři sta', 'čtyři sta', 'pět set', 'šest set', 'sedm set',
  'osm set', 'devět set'];
// the last component decides the gender of one and two: jeden/jedna/jedno, dva/dvě
const CS_GENDER = { m: ['jeden', 'dva'], f: ['jedna', 'dvě'], n: ['jedno', 'dvě'] };
export const CS_NUMBER_WORDS = [...CS_ONES, ...CS_TENS.filter(Boolean),
  ...CS_HUNDREDS.flatMap((h) => h.split(' ')).filter(Boolean), 'jeden', 'jedno', 'dvě', 'tisíc',
  'tisíce'];

// "sto šedesát devět"; gender m, f or n applies to a final one or two
export function czechWords(n, gender = 'f') {
  if (!Number.isInteger(n) || n < 0 || n > 9999) throw new Error(`no Czech words for ${n}`);
  const g = CS_GENDER[gender];
  if (!g) throw new Error(`Czech gender is m, f or n, not "${gender}"`);
  const small = (x) => (x === 1 ? g[0] : x === 2 ? g[1] : CS_ONES[x]);
  // in a compound number a final one is spoken "jedna" in every gender: "dvacet jedna pravidel"
  const unit = (x) => (x === 1 ? 'jedna' : small(x));
  const below100 = (x) => (x < 20 ? small(x) : CS_TENS[Math.floor(x / 10)] + (x % 10 ? ` ${unit(x % 10)}` : ''));
  if (n < 100) return below100(n);
  const parts = [];
  const k = Math.floor(n / 1000);
  if (k) parts.push(k === 1 ? 'tisíc' : `${k === 2 ? 'dva' : CS_ONES[k]} ${k < 5 ? 'tisíce' : 'tisíc'}`);
  const h = Math.floor((n % 1000) / 100);
  if (h) parts.push(CS_HUNDREDS[h]);
  if (n % 100) parts.push(below100(n % 100));
  return parts.join(' ');
}

// the noun's form after a number: one, few (2-4, by the last component spoken) or many
export function czechPlural(n, [one, few, many]) {
  if (n === 1) return one;
  const r = n % 100;
  const last = r < 20 ? r : r % 10;
  return last >= 2 && last <= 4 ? few : many;
}

// {{name}} digits, {{name:words}} / {{name:Words}} spoken (Czech takes :m, :f or :n for gender,
// e.g. {{blocking:Words:n}}), {{name:plural:one|few|many}} the noun's form for that count
const PLACE = /\{\{([a-z_]+)(?::(words|Words|plural)(?::([^}]+))?)?\}\}/g;
export function fillIn(text, facts, lang = 'en') {
  if (lang === 'en') return fillEnglish(text, facts);
  if (lang !== 'cs') throw new Error(`no number words for language ${lang}; add them to i18n.mjs`);
  return text.replace(PLACE, (_, name, form, arg) => {
    if (!(name in facts)) throw new Error(`unknown fact {{${name}}} in "${text.slice(0, 60)}..."`);
    const v = facts[name];
    if (!form) return String(v);
    if (form === 'plural') {
      const forms = (arg || '').split('|');
      if (forms.length !== 3) throw new Error(`{{${name}:plural:one|few|many}} needs three forms: "${arg}"`);
      return czechPlural(v, forms);
    }
    const w = czechWords(v, arg || 'f');
    return form === 'Words' ? w[0].toUpperCase() + w.slice(1) : w;
  });
}

// A language's cues for the page: each English cue word of a scene becomes the word its own voice
// says; a value with a fact in it ("{{adrs:Words}}") is the first word of that fact as spoken.
export function pageCues(t, facts) {
  return Object.fromEntries(Object.entries(t.scenes).map(([id, s]) => [id,
    Object.fromEntries(Object.entries(s.cues || {}).map(([en, cs]) =>
      [en, norm(fillIn(cs, facts, t.lang).split(/\s+/)[0])]))]));
}

// ---- the release's catalogue in a language ---------------------------------------------------
// A category or use case is translated with the fingerprint of the English it was translated
// from (`source`), so a release that rewords one makes its translation stale, not silently wrong.
export const fingerprint = (entry) => createHash('sha1')
  .update(`${entry.title}\n${entry.summary || ''}`).digest('hex').slice(0, 10);
const entryIn = (t, kind, e) => {
  const tr = ((t.catalogue || {})[kind] || {})[e.id];
  if (!tr) throw new Error(`lang/${t.lang}.json does not translate ${kind} ${e.id}; node i18n.mjs --check`);
  return { ...e, title: tr.title, summary: tr.summary || e.summary };
};
export const actIn = (t, act) => {
  if (!act) return act;
  const a = (t.acts || {})[act];
  if (!a) throw new Error(`lang/${t.lang}.json does not translate the act ${act}`);
  return a;
};
// a story (stories.mjs) in a language: its category's title and summary, its use cases' titles
export function localiseStory(story, t) {
  const c = entryIn(t, 'categories', story);
  return { ...story, title: c.title, summary: c.summary,
    use_cases: story.use_cases.map((u) => entryIn(t, 'use_cases', u)) };
}
// every use case by id in a language (the desktop composition names the ones a scene shows)
export const localiseUseCases = (titles, t) => Object.fromEntries(Object.entries(titles)
  .map(([id, u]) => [id, { ...u, title: entryIn(t, 'use_cases', { id, ...u }).title }]));

// ---- the gate -------------------------------------------------------------------------------
const read = (f) => readFileSync(join(DIR, f), 'utf8');
const sceneIds = () => {
  const ids = [];
  for (const f of ['scenes.json', 'scenes-short.json']) {
    JSON.parse(read(f)).forEach((s) => { if (!ids.includes(s.id)) ids.push(s.id); });
  }
  return ids;
};
const sectionOf = (html, id) => (html.match(new RegExp(`<section[^>]*\\bid="${id}"[\\s\\S]*?</section>`)) || [''])[0];
// the body of a function that opens at `at`, by its braces
const body = (src, at) => {
  const open = src.indexOf('{', at);
  if (open < 0) return '';
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(open, i + 1);
  }
  return src.slice(open);
};
// the cue words a scene's painters read: gen.js maps a scene to its painters; each painter's body
// (VIZ.<name> in viz.js, a function in gen.js) names its cues with cue('word')
function painters(id, gen, viz) {
  const line = (gen.match(new RegExp(`^\\s+${id}: \\(\\) => \\[(.*)$`, 'm')) || [])[1] || '';
  return [...line.matchAll(/\b(?:V\.)?([A-Za-z]+)\(env/g)].map((m) => {
    const v = viz.indexOf(`VIZ.${m[1]} = `);
    const g = gen.search(new RegExp(`function ${m[1]}\\(`));
    return v >= 0 ? body(viz, v) : g >= 0 ? body(gen, g) : '';
  }).join('\n');
}
// the cues a painter names literally; one that reads them from its data (env.cue(r[2])) names
// them only as strings, which the render's own CHECK catches when the voice never says them
const painterCues = (src) => [...new Set([...src.matchAll(/\bcue\('([a-z0-9#]+)'\)/g)].map((c) => c[1]))];
const domCues = (section) => [...section.matchAll(/data-(?:class-)?cue="([^"]+)"/g)].map((m) => m[1]);
// does the narration say this cue (a prefix of a spoken word, the nth time)?
const said = (vo, cue) => {
  const [name, nth] = cue.split('#');
  const words = vo.split(/\s+/).map(norm).filter(Boolean);
  return words.filter((w) => w.startsWith(name)).length >= Number(nth || 1);
};

// A typed fact in a translation: a version, or a count of rules or decisions in digits or words.
const typedIn = (text) => {
  const found = [];
  const numberWord = `(?:\\d+|${CS_NUMBER_WORDS.join('|')})`;
  const re = [
    /(?<![@\w.])\d+\.\d+\.\d+(?:-[a-z]+\.\d+)?\b/g,
    new RegExp(`(?<![\\p{L}])${numberWord}(?:\\s+${numberWord})*\\s+(?:blokujících\\s+|blokující\\s+|standardních\\s+)?`
      + '(?:pravid\\p{L}*|rozhodnutí)', 'giu'),
  ];
  for (const r of re) for (const m of text.matchAll(r)) found.push(m[0]);
  return found;
};

// the English texts the page shows, and the ones a language leaves untranslated: the page itself,
// localised in headless Chrome, so the DOM decides (entities, nesting, whitespace)
async function pageTexts(t, ids) {
  const { default: puppeteer } = await import('puppeteer-core');
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME
    || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const page = await browser.newPage();
    await page.evaluateOnNewDocument((lang) => { window.LANG = lang; }, {
      lang: t.lang, locale: t.locale, text: t.text, keep: t.keep, cues: {} });
    // the libraries the page loads are not needed to read its text
    await page.setRequestInterception(true);
    page.on('request', (r) => (r.url().startsWith('file:') ? r.continue() : r.abort()));
    await page.goto(pathToFileURL(join(DIR, 'reel.html')).href, { waitUntil: 'domcontentloaded' });
    return await page.evaluate((only) => {
      const english = [];
      const skip = '.term, code, [data-type], .mark-big, .mark-cta';
      document.querySelectorAll('.scene').forEach((sc) => {
        if (!only.includes(sc.id)) return;
        const walk = document.createTreeWalker(sc, NodeFilter.SHOW_TEXT);
        for (let n = walk.nextNode(); n; n = walk.nextNode()) {
          if (!n.parentElement.closest(skip) && n.nodeValue.trim()) english.push(n.nodeValue.trim());
        }
      });
      window.localise(only);
      return { english, misses: window.langMisses() };
    }, ids);
  } finally {
    await browser.close();
  }
}

export async function audit(id) {
  const t = load(id);
  const html = read('reel.html');
  const gen = read('gen.js');
  const viz = read('viz.js');
  const ids = sceneIds();
  const findings = [];
  const add = (kind, text) => findings.push({ kind, text });
  const translated = ids.filter((s) => t.scenes[s]);
  ids.filter((s) => !t.scenes[s]).forEach((s) => add('scene', `${id}: scene ${s} is not translated`));
  Object.keys(t.scenes).filter((s) => !ids.includes(s))
    .forEach((s) => add('stale', `${id}: scene ${s} no longer exists`));
  for (const s of translated) {
    const tr = t.scenes[s];
    for (const k of ['vo', 'title', 'act']) if (!tr[k]) add('scene', `${id}: scene ${s} has no ${k}`);
    if (!tr.vo) continue;
    // the facts the narration says, as the voice will say them (any value: the words are checked)
    const probe = new Proxy({}, { has: () => true, get: () => 7 });
    let vo;
    try {
      vo = fillIn(tr.vo, probe, id);
    } catch (e) {
      add('scene', `${id}: scene ${s}: ${e.message}`);
      continue;
    }
    const painted = painters(s, gen, viz);
    const cues = [...new Set([...domCues(sectionOf(html, s)).map((c) => c.split('#')[0]),
      ...painterCues(painted).map((c) => c.split('#')[0])])];
    for (const en of cues) {
      const mapped = (tr.cues || {})[en];
      const want = mapped === undefined ? en : norm(fillIn(mapped, probe, id).split(/\s+/)[0]);
      if (!said(vo, want)) {
        add('cue', `${id}: scene ${s}: cue "${en}"${mapped === undefined ? ' has no mapping and'
          : ` -> "${want}"`} is never said in the narration`);
      }
    }
    Object.keys(tr.cues || {}).filter((en) => !cues.includes(en) && !painted.includes(`'${en}'`))
      .forEach((en) => add('stale', `${id}: scene ${s}: cue "${en}" is not read by the scene`));
    for (const x of typedIn(`${tr.vo} ${tr.title}`)) add('typed', `${id}: scene ${s}: typed fact "${x}"`);
  }
  // a story's title card is shown by every story, once the language can tell them
  const { english, misses } = await pageTexts(t, t.catalogue ? [...translated, 'story'] : translated);
  misses.forEach((m) => add('text', `${id}: on-screen text left in English: ${JSON.stringify(m)}`));
  const seen = new Set(english);
  // a canvas or graph label is in a painter's source, perhaps cased there (`n.toUpperCase()`)
  // (a label may be composed: `${pr}\nlink ${3 - i}`; then every word of each line is there)
  const code = `${gen}\n${viz}`.replace(/\\'/g, "'").toLowerCase();
  const inCode = (k) => code.includes(k.replace(/\n/g, '\\n').toLowerCase())
    || k.toLowerCase().split('\n').every((line) => code.includes(line)
      || (line.match(/\p{L}{3,}/gu) || []).every((w) => code.includes(w)));
  // `scene/text` is a text translated in that scene only
  const base = (k) => (ids.includes(k.split('/')[0]) && k.indexOf('/') > 0 ? k.slice(k.indexOf('/') + 1) : k);
  Object.keys(t.text).filter((k) => !seen.has(base(k)) && !inCode(base(k)))
    .forEach((k) => add('stale', `${id}: "${k}" is translated but no longer shown`));
  for (const [k, v] of Object.entries(t.text)) {
    for (const x of typedIn(v)) add('typed', `${id}: text "${k}": typed fact "${x}"`);
  }
  // the release's catalogue: every category and use case the site lists, current with the release
  const cat = catalogue(derive());
  for (const [kind, list] of [['categories', cat.categories], ['use_cases', cat.useCases]]) {
    const have = (t.catalogue || {})[kind] || {};
    for (const e of list) {
      const tr = have[e.id];
      if (!tr || !tr.title) add('catalogue', `${id}: ${kind} ${e.id} is not translated ("${e.title}")`);
      else if (tr.source !== fingerprint(e)) {
        add('stale', `${id}: ${kind} ${e.id} changed in the release since it was translated `
          + `(source ${tr.source || 'none'}, now ${fingerprint(e)}): "${e.title}"`);
      }
      if (tr) for (const x of typedIn(`${tr.title} ${tr.summary || ''}`)) add('typed', `${id}: ${kind} ${e.id}: typed fact "${x}"`);
    }
    Object.keys(have).filter((k) => !list.some((e) => e.id === k))
      .forEach((k) => add('stale', `${id}: ${kind} ${k} is no longer in the release`));
  }
  // the acts every cut shows on its rail, the stories' own included
  const acts = new Set(['STORY', 'START']);
  for (const f of ['scenes.json', 'scenes-short.json']) JSON.parse(read(f)).forEach((x) => x.act && acts.add(x.act));
  [...acts].filter((a) => !(t.acts || {})[a]).forEach((a) => add('catalogue', `${id}: act ${a} is not translated`));
  if (stories().length && !t.catalogue) add('catalogue', `${id}: no catalogue, so no story can be rendered`);
  const count = (kind) => findings.filter((f) => f.kind === kind).length;
  return {
    lang: id, findings,
    coverage: { scenes: translated.length, scenes_total: ids.length, scenes_missing: count('scene'),
      cues_unsaid: count('cue'), text_untranslated: count('text'), stale: count('stale'),
      typed: count('typed'), texts: Object.keys(t.text).length, catalogue_missing: count('catalogue'),
      catalogue: Object.keys((t.catalogue || {}).use_cases || {}).length
        + Object.keys((t.catalogue || {}).categories || {}).length },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const at = process.argv.indexOf('--lang');
  const ids = at > 0 ? [process.argv[at + 1]] : languages().filter((l) => l !== 'en');
  const results = [];
  for (const id of ids) results.push(await audit(id));
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(results.map(({ lang, coverage }) => ({ lang, ...coverage })), null, 2));
    process.exit(0);
  }
  let total = 0;
  for (const r of results) {
    r.findings.forEach((f) => console.log(`FAIL [${f.kind}] ${f.text}`));
    total += r.findings.length;
    const c = r.coverage;
    console.log(`${r.lang}: ${c.scenes}/${c.scenes_total} scenes, ${c.texts} texts; ${r.findings.length} finding(s)`);
  }
  console.log(total ? `i18n: refused, ${total} finding(s) (project.reel-bilingual)`
    : `i18n: ok, ${results.map((r) => r.lang).join(', ')} complete and current`);
  process.exit(total ? 1 : 0);
}
