// Builds the GitHub Pages site into _site/: index.html with the reel's chapters, its Tailwind
// stylesheet and Flowbite script (site/assets.mjs; `yarn install` first), the video re-encoded
// for the web (720x1280, faststart) and the poster. The render itself stays out of
// git; point VIDEO, CHAPTERS and POSTER at the cut being published, and SHORT with
// SHORT_POSTER at the Shorts cut to show it under the full one.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAssets } from './assets.mjs';

const SITE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(SITE);
const VIDEO = process.env.VIDEO || join(ROOT, 'majordomus-reel-v5.mp4');
const CHAPTERS = process.env.CHAPTERS || join(ROOT, 'build-v5', 'chapters.txt');
const POSTER = process.env.POSTER || join(ROOT, 'thumbnail-v5.jpg');
const SHORT = process.env.SHORT || '';
const SHORT_POSTER = process.env.SHORT_POSTER || POSTER;
const OUT = process.env.SITE_OUT || join(ROOT, '_site');
const CRF = process.env.CRF || '27';

for (const file of [VIDEO, POSTER, ...(SHORT ? [SHORT, SHORT_POSTER] : [])]) {
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
// The chapter rows keep `<button data-t=` first: site/verify.sh counts them by that prefix.
const items = chapters.map((c) => `<li><button data-t="${c.t}" type="button" class="group grid `
  + 'w-full grid-cols-[56px_1fr] px-4 py-2.5 text-left hover:bg-gray-100 focus:outline-none '
  + 'focus-visible:ring-2 focus-visible:ring-primary-500 dark:hover:bg-gray-700">'
  + `<span class="font-mono text-sm leading-6 text-gray-500 dark:text-gray-400">${c.label}</span>`
  + '<span class="text-gray-900 group-hover:text-primary-600 group-[.now]:text-primary-600 '
  + 'dark:text-white dark:group-hover:text-primary-500 dark:group-[.now]:text-primary-500">'
  + `${escape(c.title)}</span></button></li>`);
const short = SHORT ? `  <section id="short"
    class="scroll-mt-16 border-t border-gray-200 dark:border-gray-700">
    <div class="mx-auto max-w-screen-xl px-4 py-8 lg:px-6 lg:py-16">
      <h2 class="mb-4 text-3xl font-extrabold tracking-tight text-gray-900 dark:text-white">
        The <em class="text-primary-600 dark:text-primary-500">short</em> cut</h2>
      <p class="mb-8 max-w-screen-md text-lg text-gray-500 dark:text-gray-400">
        The same film in ${minutes(seconds(SHORT))}, for a phone held upright.</p>
      <video class="block aspect-[9/16] w-full max-w-[405px] rounded-lg border border-gray-200
        bg-white dark:border-gray-700 dark:bg-gray-800" controls playsinline preload="metadata"
        poster="short-poster.jpg" src="short.mp4"></video>
    </div>
  </section>` : '';
const html = readFileSync(join(SITE, 'index.html'), 'utf8')
  .replace('<!-- chapters -->', `\n      ${items.join('\n      ')}\n    `)
  .replace('<!-- short -->', short);
writeFileSync(join(OUT, 'index.html'), html);
writeFileSync(join(OUT, '.nojekyll'), '');
buildAssets(OUT);

console.log(`video   ${VIDEO}`);
encode(VIDEO, join(OUT, 'reel.mp4'));
poster(POSTER, join(OUT, 'poster.jpg'));
if (SHORT) {
  console.log(`short   ${SHORT}`);
  encode(SHORT, join(OUT, 'short.mp4'));
  poster(SHORT_POSTER, join(OUT, 'short-poster.jpg'));
}
console.log(`site    ${OUT} (${chapters.length} chapters${SHORT ? ', short cut' : ''})`);
