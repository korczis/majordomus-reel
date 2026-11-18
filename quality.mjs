// The quality ratchet (project.every-iteration-better): every iteration of the reel is measured,
// none may make a measured thing worse, and none is recorded unless it makes something better.
// The measures are derived from the repository and its renders, never typed; quality.json keeps
// the history, newest last, so the trend is a fact anyone can read back.
//
//   node quality.mjs                  the measures now, against the last recorded iteration
//   node quality.mjs --check          exit 1 if any measure is worse than the last iteration
//   node quality.mjs --record "<what improved>"
//                                     --check, then refuse unless at least one measure is
//                                     better; append the iteration to quality.json
//
// A measure that existed and is gone is a regression too: a measure is retired only by a
// recorded decision, in quality.json's `retired`, never by deleting the code that takes it. The
// one exception is a measure taken from a build (`site.<lang>.routes`, from SITE_OUT's
// sitemap.xml): without a build to read it is not taken, which is not a regression.
//
//   SITE_OUT=<dir> node quality.mjs --check   also measures that build's routes per language
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { derive, check } from './facts.mjs';
import { languages, audit } from './i18n.mjs';

const DIR = dirname(fileURLToPath(import.meta.url));
const LEDGER = join(DIR, 'quality.json');
// the renders are shared artefacts, ignored by git, kept in the primary checkout: a linked worktree
// (majordomus worktree) measures the same ones
const COMMON = spawnSync('git', ['-C', DIR, 'rev-parse', '--path-format=absolute', '--git-common-dir'],
  { encoding: 'utf8' }).stdout.trim();
const PRIMARY = COMMON ? dirname(COMMON) : DIR;
const CUTS = process.env.CUTS || join(PRIMARY, 'cuts', 'v6');
const FORMATS = JSON.parse(readFileSync(join(DIR, 'formats.json'), 'utf8')).formats;

// up: more is better; down: less is better
const MEASURES = {
  'facts.findings': ['down', 'typed or unknown Majordomus facts (facts.mjs --check)'],
  'i18n.languages': ['up', 'languages the reel is rendered in, English included'],
  'renders.formats': ['up', 'formats every cut is composed for (formats.json)'],
};
const measureLang = (l) => ({
  [`i18n.${l}.scenes`]: ['up', `scenes ${l} translates`],
  [`i18n.${l}.scenes_missing`]: ['down', `scenes ${l} lacks, or translates without a title, act or narration`],
  [`i18n.${l}.cues_unsaid`]: ['down', `cues the ${l} narration never says`],
  [`i18n.${l}.text_untranslated`]: ['down', `on-screen texts left in English in ${l}`],
  [`i18n.${l}.stale`]: ['down', `${l} translations of what no longer exists`],
  [`i18n.${l}.typed`]: ['down', `facts typed into the ${l} translation`],
  [`i18n.${l}.catalogue_missing`]: ['down', `release categories and use cases ${l} lacks`],
});
const measureRenders = (l) => ({ [`renders.${l}`]: ['up', `cut formats rendered in ${l} (${CUTS.replace(`${DIR}/`, '')})`] });
// the site in a language: the interface messages it lacks or keeps after English dropped them,
// and the routes a build gives it (taken only from a build: optional)
const measureSite = (l) => ({
  ...(l === 'en' ? {} : {
    [`site.${l}.messages_missing`]: ['down', `site messages ${l} lacks (site/messages.json, lang/${l}.json site)`],
    [`site.${l}.messages_stale`]: ['down', `${l} site messages no longer in site/messages.json`],
  }),
  [`site.${l}.routes`]: ['up', `routes of the ${l} site in the build's sitemap.xml (SITE_OUT)`, 'optional'],
});
const SITE_OUT = process.env.SITE_OUT;
// the routes of each language in a build: a sitemap <loc> under the language's home ('cs/')
const routesIn = (l, langs) => {
  const sitemap = join(SITE_OUT, 'sitemap.xml');
  if (!existsSync(sitemap)) throw new Error(`SITE_OUT=${SITE_OUT} has no sitemap.xml; build the site first`);
  const base = JSON.parse(readFileSync(join(DIR, 'package.json'), 'utf8')).homepage;
  const locs = [...readFileSync(sitemap, 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].slice(base.length));
  const of = (path) => langs.find((x) => x !== 'en' && path.startsWith(`${x}/`)) || 'en';
  return locs.filter((p) => of(p) === l).length;
};

// <cut>-<format>.mp4 is English; <cut>-<format>.<lang>.mp4 is that language
const rendered = (l) => (existsSync(CUTS) ? readdirSync(CUTS).filter((f) => {
  const m = f.match(/^(.+)-([a-z]+)(?:\.([a-z]{2}))?\.mp4$/);
  return m && FORMATS.some((x) => x.id === m[2]) && (m[3] || 'en') === l;
}).length : 0);

export async function measure() {
  const langs = languages();
  const values = {};
  const about = { ...MEASURES };
  values['facts.findings'] = check(derive()).length;
  values['i18n.languages'] = langs.length;
  values['renders.formats'] = FORMATS.length;
  for (const l of langs) {
    Object.assign(about, measureRenders(l), measureSite(l));
    values[`renders.${l}`] = rendered(l);
    if (SITE_OUT) values[`site.${l}.routes`] = routesIn(l, langs);
    if (l === 'en') continue;
    Object.assign(about, measureLang(l));
    const { coverage: c } = await audit(l);
    Object.assign(values, {
      [`i18n.${l}.scenes`]: c.scenes, [`i18n.${l}.scenes_missing`]: c.scenes_missing,
      [`i18n.${l}.cues_unsaid`]: c.cues_unsaid, [`i18n.${l}.text_untranslated`]: c.text_untranslated,
      [`i18n.${l}.stale`]: c.stale, [`i18n.${l}.typed`]: c.typed,
      [`i18n.${l}.catalogue_missing`]: c.catalogue_missing,
      [`site.${l}.messages_missing`]: c.site_messages_missing,
      [`site.${l}.messages_stale`]: c.site_messages_stale,
    });
  }
  return { values, about };
}

const ledger = () => (existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, 'utf8'))
  : { about: '', retired: {}, history: [] });

// each measure against the last iteration: better, same, worse, new, or gone
export function compare(values, about, last, retired = {}) {
  const rows = [];
  const before = last ? last.values : {};
  for (const [k, v] of Object.entries(values)) {
    const dir = about[k][0];
    const was = before[k];
    const verdict = was === undefined ? 'new' : v === was ? 'same'
      : (dir === 'up' ? v > was : v < was) ? 'better' : 'worse';
    rows.push({ k, v, was, dir, verdict });
  }
  for (const k of Object.keys(before)) {
    if (k in values || k in retired) continue;
    // a measure taken only from a build is not taken without one: skipped, not gone
    if (about[k]?.[2] === 'optional') rows.push({ k, v: undefined, was: before[k], dir: about[k][0], verdict: 'skipped' });
    else rows.push({ k, v: undefined, was: before[k], verdict: 'gone' });
  }
  return rows;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const book = ledger();
  const last = book.history[book.history.length - 1];
  const { values, about } = await measure();
  const rows = compare(values, about, last, book.retired);
  const pad = Math.max(...rows.map((r) => r.k.length));
  for (const r of rows) {
    const arrow = r.dir === 'up' ? '↑' : r.dir === 'down' ? '↓' : ' ';
    console.log(`${r.k.padEnd(pad)} ${arrow} ${String(r.v ?? '-').padStart(5)}  `
      + `${r.was === undefined ? '' : `was ${r.was}  `}${r.verdict}`);
  }
  const worse = rows.filter((r) => r.verdict === 'worse' || r.verdict === 'gone');
  const better = rows.filter((r) => r.verdict === 'better' || (r.verdict === 'new' && last));
  console.log(last ? `against iteration ${book.history.length} (${last.at}, ${last.head.slice(0, 12)}): `
    + `${better.length} better, ${worse.length} worse` : 'no iteration recorded yet');
  if (worse.length) {
    console.error(`quality: refused, ${worse.length} measure(s) worse than the last iteration `
      + '(project.every-iteration-better): fix them; a measure is retired only by a recorded decision');
    process.exit(1);
  }
  const at = process.argv.indexOf('--record');
  if (at > 0) {
    const note = process.argv[at + 1];
    if (!note || note.startsWith('--')) {
      console.error('quality: --record needs "<what improved>"');
      process.exit(2);
    }
    if (last && !better.length) {
      console.error('quality: refused, nothing is better than the last iteration; an iteration must '
        + 'improve at least one measure (project.every-iteration-better)');
      process.exit(1);
    }
    const head = spawnSync('git', ['-C', DIR, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
    book.about = 'The quality ratchet of the reel (quality.mjs, project.every-iteration-better): each '
      + 'iteration\'s measures, newest last. No iteration may make a measure worse, and one is recorded '
      + 'only when it makes at least one better. Written by `node quality.mjs --record`, never by hand.';
    book.measures = Object.fromEntries(Object.entries(about).map(([k, [dir, text]]) => [k, { better: dir, about: text }]));
    book.retired = book.retired || {};
    book.history.push({ at: new Date().toISOString(), head, note, values,
      improved: better.map((r) => r.k) });
    writeFileSync(LEDGER, JSON.stringify(book, null, 2) + '\n');
    console.log(`quality: iteration ${book.history.length} recorded: ${note}`);
  } else if (process.argv.includes('--check')) {
    console.log('quality: ok, nothing worse than the last iteration');
  }
}
