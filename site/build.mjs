// Builds the GitHub Pages site into _site/: index.html with the reel's chapters, the video
// re-encoded for the web (720x1280, faststart) and the poster. The render itself stays out of
// git; point VIDEO, CHAPTERS and POSTER at the cut being published, and SHORT with
// SHORT_POSTER at the Shorts cut to show it under the full one.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(SITE);
const VIDEO = process.env.VIDEO || join(ROOT, 'majordomus-reel-v5.mp4');
const CHAPTERS = process.env.CHAPTERS || join(ROOT, 'build-v5', 'chapters.txt');
const POSTER = process.env.POSTER || join(ROOT, 'thumbnail-v5.jpg');
const SHORT = process.env.SHORT || '';
const SHORT_POSTER = process.env.SHORT_POSTER || POSTER;
const OUT = process.env.SITE_OUT || join(ROOT, '_site');
// the facts the cut was rendered with (render.mjs writes them beside the chapters); the page
// names their release so site/verify.sh can refuse a film that lags the newest one
const FACTS = process.env.FACTS || join(dirname(CHAPTERS), 'facts.json');
const CRF = process.env.CRF || '27';

for (const file of [VIDEO, POSTER, FACTS, ...(SHORT ? [SHORT, SHORT_POSTER] : [])]) {
  if (!existsSync(file)) throw new Error(`missing: ${file}`);
}
const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'ignore', 'pipe'] });
  if (r.status !== 0) throw new Error(`${cmd} failed: ${r.stderr || r.error}`);
};
const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const seconds = (file) => Math.round(Number(spawnSync('ffprobe', ['-v', 'error',
  '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' }).stdout));
const minutes = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const encode = (src, dst) => run('ffmpeg', ['-y', '-v', 'error', '-i', src,
  '-vf', 'scale=720:1280:flags=lanczos', '-c:v', 'libx264', '-preset', 'slow', '-crf', CRF,
  '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', dst]);
const poster = (src, dst) => run('ffmpeg', ['-y', '-v', 'error', '-i', src,
  '-vf', 'scale=720:1280', '-q:v', '4', dst]);

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

// "mm:ss Title" lines, as render.mjs writes them for the YouTube description.
const chapters = existsSync(CHAPTERS)
  ? readFileSync(CHAPTERS, 'utf8').split('\n').map((line) => line.match(/^(\d+):(\d\d) (.+)$/))
    .filter(Boolean)
    .map(([, m, s, title]) => ({ label: `${m}:${s}`, t: Number(m) * 60 + Number(s), title }))
  : [];
if (!chapters.length) console.warn(`   no chapters in ${CHAPTERS}; the list stays empty`);
// the YouTube cards: site/published.json names each upload and its render; the length shown is
// that render's, measured here, so no duration is typed on the page
const lengthOf = (s) => (s >= 180 ? minutes(s) : `${s} s`);
const published = JSON.parse(readFileSync(join(SITE, 'published.json'), 'utf8')).videos.map((v) => {
  const render = join(ROOT, v.render);
  if (!existsSync(render)) {
    throw new Error(`published.json names a render that is not here: ${render}`);
  }
  return `      <a class="card" href="${escape(v.url)}"><b>${escape(v.title)}</b>\n`
    + `        <p>${escape(v.cut)}, ${lengthOf(seconds(render))}</p></a>`;
});
// what a render needs, as make-reel.sh checks it, plus the browser render.mjs drives
const makeReel = readFileSync(join(ROOT, 'make-reel.sh'), 'utf8');
const tools = (makeReel.match(/^for tool in ([^;]+);/m) || [])[1];
if (!tools) throw new Error('make-reel.sh no longer names its tools in a `for tool in` line');
const needs = [...tools.trim().split(/\s+/).filter((t) => t !== 'ffprobe'), 'Google Chrome'];
const requirements = `${needs.slice(0, -1).join(', ')} and ${needs[needs.length - 1]}`;
// the release the film's facts come from, read by site/verify.sh
const factsLine = ({ version, tag, commit }) => '<br>Every Majordomus fact in the film is derived '
  + `from <a href="https://github.com/korczis/prismatic-majordomus/releases/tag/${tag}" `
  + `data-majordomus-version="${version}" data-majordomus-commit="${commit}">`
  + `Majordomus ${version}</a>.`;
const items = chapters.map((c) =>
  `<li><button data-t="${c.t}"><span>${c.label}</span><span>${escape(c.title)}</span></button></li>`);
const short = SHORT ? `  <section class="short">
    <h2>The <em>short</em> cut</h2>
    <p class="lede">The same film in ${minutes(seconds(SHORT))}, for a phone held upright.</p>
    <video controls playsinline preload="metadata" poster="short-poster.jpg" src="short.mp4"></video>
  </section>` : '';
const html = readFileSync(join(SITE, 'index.html'), 'utf8')
  .replace('<!-- chapters -->', `\n      ${items.join('\n      ')}\n    `)
  .replace('<!-- short -->', short)
  .replace('<!-- published -->', `\n${published.join('\n')}\n    `)
  .replace('<!-- requirements -->', escape(requirements))
  .replace('<!-- facts -->', factsLine(JSON.parse(readFileSync(FACTS, 'utf8'))));
writeFileSync(join(OUT, 'index.html'), html);
writeFileSync(join(OUT, '.nojekyll'), '');

console.log(`video   ${VIDEO}`);
encode(VIDEO, join(OUT, 'reel.mp4'));
poster(POSTER, join(OUT, 'poster.jpg'));
if (SHORT) {
  console.log(`short   ${SHORT}`);
  encode(SHORT, join(OUT, 'short.mp4'));
  poster(SHORT_POSTER, join(OUT, 'short-poster.jpg'));
}
console.log(`site    ${OUT} (${chapters.length} chapters${SHORT ? ', short cut' : ''})`);
