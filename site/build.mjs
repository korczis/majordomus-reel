// Builds the GitHub Pages site into _site/: index.html with the reel's chapters, the video
// re-encoded for the web (720x1280, faststart) and the poster. The render itself stays out of
// git; point VIDEO, CHAPTERS and POSTER at the cut being published.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(SITE);
const VIDEO = process.env.VIDEO || join(ROOT, 'majordomus-reel-v5.mp4');
const CHAPTERS = process.env.CHAPTERS || join(ROOT, 'build-v5', 'chapters.txt');
const POSTER = process.env.POSTER || join(ROOT, 'thumbnail-v5.jpg');
const OUT = process.env.SITE_OUT || join(ROOT, '_site');
const CRF = process.env.CRF || '27';

for (const file of [VIDEO, POSTER]) {
  if (!existsSync(file)) throw new Error(`missing: ${file}`);
}
const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'ignore', 'pipe'] });
  if (r.status !== 0) throw new Error(`${cmd} failed: ${r.stderr || r.error}`);
};
const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

// "mm:ss Title" lines, as render.mjs writes them for the YouTube description.
const chapters = existsSync(CHAPTERS)
  ? readFileSync(CHAPTERS, 'utf8').split('\n').map((line) => line.match(/^(\d+):(\d\d) (.+)$/))
    .filter(Boolean)
    .map(([, m, s, title]) => ({ label: `${m}:${s}`, t: Number(m) * 60 + Number(s), title }))
  : [];
if (!chapters.length) console.warn(`   no chapters in ${CHAPTERS}; the list stays empty`);
const items = chapters.map((c) =>
  `<li><button data-t="${c.t}"><span>${c.label}</span><span>${escape(c.title)}</span></button></li>`);
const html = readFileSync(join(SITE, 'index.html'), 'utf8')
  .replace('<!-- chapters -->', `\n      ${items.join('\n      ')}\n    `);
writeFileSync(join(OUT, 'index.html'), html);
writeFileSync(join(OUT, '.nojekyll'), '');

console.log(`video   ${VIDEO}`);
run('ffmpeg', ['-y', '-v', 'error', '-i', VIDEO, '-vf', 'scale=720:1280:flags=lanczos',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', CRF, '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', join(OUT, 'reel.mp4')]);
run('ffmpeg', ['-y', '-v', 'error', '-i', POSTER, '-vf', 'scale=720:1280', '-q:v', '4',
  join(OUT, 'poster.jpg')]);
console.log(`site    ${OUT} (${chapters.length} chapters)`);
