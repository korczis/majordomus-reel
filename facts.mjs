// Derives every Majordomus fact the reel states from the newest Majordomus release, so no
// number or version in the film is typed by hand: the release tag, the standard rules it ships
// (all, with a validator, blocking), and the architecture decisions it records.
//
//   node facts.mjs            -> prints the facts as JSON
//   node facts.mjs --check    -> exit 1 when a source types a fact or names one that is unknown
//
// MAJORDOMUS_REPO is a clone of korczis/prismatic-majordomus (default ../prismatic-majordomus);
// MAJORDOMUS_TAG pins the release (default: the newest stable v* tag the clone holds).
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DIR = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(process.env.MAJORDOMUS_REPO || join(DIR, '..', 'prismatic-majordomus'));

const git = (...args) => {
  const r = spawnSync('git', ['-C', REPO, ...args], { encoding: 'utf8', maxBuffer: 1 << 26 });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} in ${REPO}: ${r.stderr.trim()}`);
  return r.stdout;
};

const semver = (tag) => tag.replace(/^v/, '').split(/[.-]/)
  .map((p) => (/^\d+$/.test(p) ? Number(p) : p));
const newer = (a, b) => {
  const [x, y] = [semver(a), semver(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
};

export function releaseTag() {
  if (process.env.MAJORDOMUS_TAG) return process.env.MAJORDOMUS_TAG;
  const stable = git('tag', '--list', 'v[0-9]*').split('\n')
    .filter((t) => /^v\d+\.\d+\.\d+$/.test(t));
  if (!stable.length) throw new Error(`no stable v* tag in ${REPO}; fetch its tags`);
  return stable.reduce((a, b) => (newer(b, a) ? b : a));
}

// The front matter of a rule file, read only as far as the reel needs: status, class and
// whether x-majordomus names any test (inline list or block list).
function ruleFacts(text) {
  const fm = text.split(/^---$/m)[1] || '';
  const field = (k) => (fm.match(new RegExp(`^${k}:\\s*(\\S+)`, 'm')) || [])[1];
  const inline = fm.match(/^\s+tests:\s*\[(.*)\]/m);
  const block = fm.match(/^\s+tests:\s*\n((?:\s+-\s+.+\n?)+)/m);
  const validated = Boolean((inline && inline[1].trim()) || block);
  return { status: field('status'), cls: field('class'), validated };
}

// MAJORDOMUS_REV pre-renders from a commit before it is tagged: the version is the one its crate
// manifest declares, and the tag is the one that version will carry. A cut made this way is
// published only once `node facts.mjs --same <facts.json>` finds the tag derives the same facts.
function preview(rev) {
  const manifest = git('show', `${rev}:apps/majordomus-cli/Cargo.toml`);
  const version = (manifest.match(/^version\s*=\s*"([^"]+)"/m) || [])[1];
  if (!version) throw new Error(`${rev} declares no crate version`);
  return { tag: `v${version}`, ref: git('rev-parse', rev).trim() };
}

export function derive() {
  const pre = process.env.MAJORDOMUS_REV ? preview(process.env.MAJORDOMUS_REV) : null;
  const tag = pre ? pre.ref : releaseTag();
  const files = (path) => git('ls-tree', '-r', '--name-only', tag, path)
    .split('\n').filter(Boolean);
  const rules = files('.ai/repo/rules/vendor/majordomus')
    .filter((f) => /\.v\d+\.md$/.test(f))
    .map((f) => ruleFacts(git('show', `${tag}:${f}`)))
    .filter((r) => r.status === 'active');
  if (!rules.length) {
    throw new Error(`${tag} ships no standard rules under .ai/repo/rules/vendor/majordomus`);
  }
  const blocking = rules.filter((r) => r.cls === 'blocking');
  const adrs = files('.ai/repo/adrs').filter((f) => /\/\d{4}-[^/]+\.md$/.test(f));
  return {
    tag: pre ? pre.tag : tag,
    version: (pre ? pre.tag : tag).replace(/^v/, ''),
    commit: git('rev-list', '-n', '1', tag).trim(),
    ...(pre ? { preview: true } : {}),
    rules: rules.length,
    rules_validated: rules.filter((r) => r.validated).length,
    blocking: blocking.length,
    blocking_validated: blocking.filter((r) => r.validated).length,
    adrs: adrs.length,
  };
}

// The use cases the release ships (.ai/repo/use-cases/<id>.md) and the categories they are
// filed under (taxonomy.yaml), read from the same commit as the facts. A scene names the use
// cases it shows (`use_cases` in scenes.json); the stories, the page's links and the site's
// use-case index are derived from that one declaration.
const scalar = (fm, k) => {
  const m = fm.match(new RegExp(`^${k}:\\s*(.+)$`, 'm'));
  if (!m) return undefined;
  const v = m[1].trim();
  return /^(['"]).*\1$/.test(v) ? v.slice(1, -1).replace(/''/g, "'") : v;
};
export function catalogue(facts = derive()) {
  const ref = facts.commit;
  const dir = '.ai/repo/use-cases';
  const files = git('ls-tree', '-r', '--name-only', ref, dir).split('\n')
    .filter((f) => /\/[a-z0-9-]+\.md$/.test(f) && !f.endsWith('/README.md'));
  const useCases = files.map((f) => {
    const fm = git('show', `${ref}:${f}`).split(/^---$/m)[1] || '';
    return { id: scalar(fm, 'id'), title: scalar(fm, 'title'), summary: scalar(fm, 'summary'),
      category: scalar(fm, 'category'), status: scalar(fm, 'status') || 'active' };
  }).filter((u) => u.id && u.status !== 'deprecated');
  const tax = git('show', `${ref}:${dir}/taxonomy.yaml`);
  const categories = tax.split(/^\s+- id:\s*/m).slice(1).map((block) => {
    const fm = `id: ${block}`.replace(/^\s+/gm, '');
    return { id: scalar(fm, 'id'), title: scalar(fm, 'title'), summary: scalar(fm, 'summary'),
      order: Number(scalar(fm, 'order') || 0) };
  }).sort((a, b) => a.order - b.order);
  if (!useCases.length || !categories.length) {
    throw new Error(`${facts.tag} ships no use cases or no taxonomy under ${dir}`);
  }
  return { site: 'https://majordomus.dev', useCases, categories };
}

// The facts a cut states: the placeholders of its narration and of the scenes it shows. A cut
// stays current while these equal the release's, whatever else the release changed.
export function uses(scenes, html) {
  const names = new Set();
  const take = (text) => { for (const m of text.matchAll(PLACEHOLDER)) names.add(m[1]); };
  scenes.forEach((s) => {
    take(s.vo);
    const sec = html.match(new RegExp(`<section[^>]*id="${s.id}"[\\s\\S]*?</section>`));
    if (sec) take(sec[0]);
  });
  return [...names].sort();
}

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen',
  'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

// English words for the narration, as a narrator says them: "a hundred and sixty-nine".
export function words(n) {
  if (!Number.isInteger(n) || n < 0 || n > 9999) throw new Error(`no words for ${n}`);
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : '');
  if (n < 1000) {
    const h = Math.floor(n / 100);
    const head = h === 1 ? 'a hundred' : `${ONES[h]} hundred`;
    return head + (n % 100 ? ` and ${words(n % 100)}` : '');
  }
  const k = Math.floor(n / 1000);
  const head = k === 1 ? 'a thousand' : `${ONES[k]} thousand`;
  const rest = n % 1000;
  return rest ? `${head} ${rest < 100 ? 'and ' : ''}${words(rest)}` : head;
}

// {{name}} is the fact as digits, {{name:words}} as narrated words, {{name:Words}} capitalised.
export const PLACEHOLDER = /\{\{([a-z_]+)(?::(words|Words))?\}\}/g;
export function fill(text, facts) {
  return text.replace(PLACEHOLDER, (_, name, form) => {
    if (!(name in facts)) throw new Error(`unknown fact {{${name}}} in "${text.slice(0, 60)}..."`);
    const v = facts[name];
    if (!form) return String(v);
    const w = words(v);
    return form === 'Words' ? w[0].toUpperCase() + w.slice(1) : w;
  });
}

// The gate: a source names only facts that exist, and types none of them. A typed fact is a
// version string, or a count of rules or decisions written next to the noun it counts.
export function check(facts) {
  const findings = [];
  const sources = ['reel.html', 'viz.js', 'gen.js', 'scenes.json', 'scenes-short.json',
    'site/index.html', 'README.md'];
  const typed = [
    [/(?<![@\w.])\d+\.\d+\.\d+(?:-[a-z]+\.\d+)?\b/g, 'a version string'],
    [new RegExp('\\b(?:\\d+|[a-z]+-[a-z]+|a hundred[a-z -]*)\\s+(?:blocking\\s+)?'
      + '(?:rules?|decisions|architecture decisions)\\b', 'gi'),
      'a count of rules or decisions'],
    [/\[['"](?:RULES|WITH A VALIDATOR|BLOCKING[^'"]*)['"],\s*\d+/g,
      'a chart row with a typed count'],
    [/\b(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+) (?:acts|scenes|chapters)\b/gi,
      'a typed count of acts, scenes or chapters'],
    [/\ball \d+ carry\b|\brules\s+\d+,/g, 'a doctor line with a typed count'],
  ];
  // the page and the README state no length of a cut: site/build.mjs measures it from the render
  // (the film itself shows clock times in its terminals, which are not lengths)
  const lengths = /(?<![\w.:-])\d{1,2}:\d\d(?![\w:])|\b\d+ s\b/g;
  for (const file of sources) {
    const text = readFileSync(join(DIR, file), 'utf8');
    const pageOrReadme = file === 'site/index.html' || file === 'README.md';
    text.split('\n').forEach((line, i) => {
      const rules = pageOrReadme ? [...typed, [lengths, 'a typed length of a cut']] : typed;
      for (const [re, what] of rules) {
        for (const m of line.matchAll(re)) findings.push(`${file}:${i + 1}: ${what}: "${m[0]}"`);
      }
      for (const m of line.matchAll(PLACEHOLDER)) {
        if (!(m[1] in facts)) findings.push(`${file}:${i + 1}: unknown fact {{${m[1]}}}`);
      }
      for (const m of line.matchAll(/data-fact="([^"]+)"/g)) {
        const name = m[1].split(':')[0];
        if (!(name in facts)) findings.push(`${file}:${i + 1}: unknown data-fact "${m[1]}"`);
      }
    });
  }
  // every use case a scene names exists in the release, and every category it implies has a title
  try {
    const { useCases } = catalogue(facts);
    const known = new Set(useCases.map((u) => u.id));
    for (const file of ['scenes.json', 'scenes-short.json']) {
      JSON.parse(readFileSync(join(DIR, file), 'utf8')).forEach((s) => (s.use_cases || [])
        .filter((id) => !known.has(id))
        .forEach((id) => findings.push(`${file}: scene ${s.id} names use case "${id}", `
          + `which ${facts.tag} does not ship`)));
    }
  } catch (e) {
    findings.push(`use cases: ${e.message}`);
  }
  if (facts.blocking_validated !== facts.blocking) {
    findings.push(`the narration says every blocking rule has a validator; ${facts.tag} has `
      + `${facts.blocking_validated} of ${facts.blocking}`);
  }
  return findings;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const facts = derive();
  const same = process.argv.indexOf('--same');
  if (same > 0) {
    // the counts and the version a pre-rendered cut was made with, against the release now
    const cut = JSON.parse(readFileSync(process.argv[same + 1], 'utf8'));
    // a cut that records the facts it states (`uses`) is compared on those alone
    const keys = cut.uses
      || ['version', 'rules', 'rules_validated', 'blocking', 'blocking_validated', 'adrs'];
    const differ = keys.filter((k) => cut[k] !== facts[k]);
    differ.forEach((k) => console.log(`DIFF ${k}: cut ${cut[k]}, ${facts.tag} ${facts[k]}`));
    console.log(differ.length ? `facts: the cut is not ${facts.tag}'s; re-render`
      : `facts: the cut states exactly ${facts.tag}'s facts`);
    process.exit(differ.length ? 1 : 0);
  }
  if (process.argv.includes('--check')) {
    const findings = check(facts);
    findings.forEach((f) => console.log(`FAIL ${f}`));
    console.log(findings.length
      ? `facts: refused, ${findings.length} typed or unknown fact(s); derive them (${facts.tag})`
      : `facts: ok, every fact derived from ${facts.tag} (${facts.commit.slice(0, 12)})`);
    process.exit(findings.length ? 1 : 0);
  }
  console.log(JSON.stringify(facts, null, 2));
}
