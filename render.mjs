// Voices every scene with the free Edge neural TTS (word timings drive captions and cues),
// renders reel.html frame by frame through the local Chrome, synthesises music and effects,
// and mixes it all into a 9:16 MP4 with the music ducked under the voice.
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { cpus } from 'node:os';
import puppeteer from 'puppeteer-core';
import { synthesize, writeWav } from './synth.mjs';
import { derive, check, fill, uses, catalogue } from './facts.mjs';
import { stories, storyScenes, posterMoments } from './stories.mjs';

const DIR = dirname(fileURLToPath(import.meta.url));
const FPS = Number(process.env.FPS || 30);
const VOICE = process.env.VOICE || 'en-US-AndrewMultilingualNeural';
const RATE = process.env.RATE || '-4%';
const MUSIC = process.env.MUSIC !== '0';
const OUT = process.env.OUT || join(DIR, 'majordomus-reel.mp4');
const CHROME = process.env.CHROME
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const WORKERS = Number(process.env.WORKERS || Math.min(6, Math.max(2, cpus().length / 2)));
const BUILD = process.env.BUILD || join(DIR, 'build');
const VO_LEAD = 0.25; // keep in step with reel.html
// the frame: one of formats.json (project.reel-tailored-per-device); phone is the original cut
const FORMATS = JSON.parse(readFileSync(join(DIR, 'formats.json'), 'utf8')).formats;
const FORMAT = FORMATS.find((f) => f.id === (process.env.FORMAT || 'phone'));
if (!FORMAT) throw new Error(`FORMAT=${process.env.FORMAT}: formats.json declares `
  + `${FORMATS.map((f) => f.id).join(', ')}`);
const TAIL = 0.85;

mkdirSync(BUILD, { recursive: true });
// Every Majordomus fact the film states comes from the newest release (facts.mjs); a source that
// types one, or names one that does not exist, refuses the render.
const facts = derive();
const findings = check(facts);
if (findings.length) {
  findings.forEach((f) => console.error(`FAIL ${f}`));
  console.error(`facts: refused, ${findings.length} typed or unknown fact(s); see facts.mjs`);
  process.exit(1);
}
// the release's use cases by id: the desktop composition names the ones a scene shows
const useCaseTitles = Object.fromEntries(catalogue(facts).useCases
  .map((u) => [u.id, { title: u.title, category: u.category }]));
// STORY=<category> renders one story (stories.mjs) instead of a scene file
const story = process.env.STORY ? stories(facts).find((s) => s.id === process.env.STORY) : null;
if (process.env.STORY && !story) {
  throw new Error(`STORY=${process.env.STORY}: the stories are ${stories(facts).map((s) => s.id).join(', ')}`);
}
const authored = story ? storyScenes(story)
  : JSON.parse(readFileSync(join(DIR, process.env.SCENES || 'scenes.json'), 'utf8'));
const scenes = authored.map((s) => ({ ...s, vo: fill(s.vo, facts) }));
// the cut records the facts it states, its format and its story: `facts.mjs --same` compares
// only those facts, and site/build.mjs reads the rest
const stated = uses(authored, readFileSync(join(DIR, 'reel.html'), 'utf8'));
writeFileSync(join(BUILD, 'facts.json'), JSON.stringify({ ...facts, uses: stated,
  format: FORMAT.id, captions: Boolean(process.env.CAPTIONS), ...(story ? { story: story.id } : {}) },
null, 2) + '\n');
console.log(`0/5 facts from ${facts.tag} (${facts.commit.slice(0, 12)}), ${FORMAT.id} `
  + `${FORMAT.width}x${FORMAT.height}${story ? `, story ${story.id}` : ''}`);

const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 1 << 26 });
  if (r.status !== 0) throw new Error(`${cmd} failed: ${r.stderr || r.error}`);
  return r.stdout;
};
const duration = (file) => parseFloat(run('ffprobe', [
  '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file,
]));

function voice(scene, i) {
  const mp3 = join(BUILD, `vo-${i}.mp3`);
  const json = join(BUILD, `vo-${i}.json`);
  // a clip is reused only for the same words in the same voice at the same rate
  const key = join(BUILD, `vo-${i}.key`);
  const want = `${VOICE}|${RATE}|${scene.vo}`;
  if (existsSync(mp3) && existsSync(json) && existsSync(key) && readFileSync(key, 'utf8') === want) {
    return { file: mp3, words: JSON.parse(readFileSync(json, 'utf8')) };
  }
  let r;
  for (let attempt = 0; attempt < 4; attempt++) {
    r = spawnSync('uvx', [
      '--quiet', '--with', 'edge-tts', 'python', join(DIR, 'tts.py'), scene.vo, VOICE, RATE, mp3, json,
    ], { encoding: 'utf8' });
    if (r.status === 0 && existsSync(mp3)) {
      writeFileSync(key, want);
      return { file: mp3, words: JSON.parse(readFileSync(json, 'utf8')) };
    }
    spawnSync('sleep', [String(1 + attempt * 2)]);
  }
  console.warn(`   edge-tts unavailable (${(r.stderr || '').trim().split('\n').pop()}); using say`);
  const aiff = join(BUILD, `vo-${i}.aiff`);
  run('say', ['-v', process.env.SAY_VOICE || 'Daniel', '-o', aiff, scene.vo]);
  const d = duration(aiff);
  const tokens = scene.vo.replace(/\.\.\./g, '').split(/\s+/).filter(Boolean);
  const words = tokens.map((text, k) => ({
    text: text.replace(/[.,!?]+$/, ''),
    start: (k / tokens.length) * d,
    end: ((k + 1) / tokens.length) * d,
  }));
  return { file: aiff, words };
}

function captionChunks(starts) {
  const chunks = [];
  scenes.forEach((scene, i) => {
    if (scene.nocaption) return;
    let cur = null;
    clips[i].words.forEach((w) => {
      const word = { text: w.text, start: starts[i] + VO_LEAD + w.start, end: starts[i] + VO_LEAD + w.end };
      const chars = cur ? cur.words.reduce((a, x) => a + x.text.length + 1, 0) : 0;
      const gap = cur ? word.start - cur.words[cur.words.length - 1].end : 0;
      if (!cur || cur.words.length >= 8 || chars + word.text.length > 40 || gap > 0.35) {
        cur = { words: [], scene: i };
        chunks.push(cur);
      }
      cur.words.push(word);
    });
  });
  chunks.forEach((c, k) => {
    c.start = c.words[0].start;
    const sceneEnd = starts[c.scene] + durations[c.scene] - 0.2;
    const next = chunks[k + 1]?.start ?? Infinity;
    c.end = Math.min(next, c.words[c.words.length - 1].end + 0.4, sceneEnd);
  });
  return chunks;
}

console.log('1/5 voice-over');
const clips = scenes.map((s, i) => voice(s, i));
const voDur = clips.map((c) => duration(c.file));
const durations = scenes.map((s, i) => Math.max(s.min, VO_LEAD + voDur[i] + TAIL));
const starts = durations.reduce((acc, d, i) => [...acc, acc[i] + d], [0]).slice(0, -1);
const total = durations.reduce((a, b) => a + b, 0);
console.log(`   ${durations.map((d) => d.toFixed(1)).join(' + ')} = ${total.toFixed(1)} s`);
// burned-in subtitles are off unless CAPTIONS=1: YouTube generates captions, the frame keeps its room
const phrases = captionChunks(starts);
const chunks = process.env.CAPTIONS ? phrases : [];
// the page's subtitles (WebVTT) and the timeline the site and the stills read, for every cut
const vttTime = (s) => new Date(Math.max(0, s) * 1000).toISOString().slice(11, 23);
writeFileSync(join(BUILD, 'captions.vtt'), `WEBVTT\n\n${phrases.map((c, k) => `${k + 1}\n`
  + `${vttTime(c.start)} --> ${vttTime(c.end)}\n${c.words.map((w) => w.text).join(' ')}\n`).join('\n')}`);
const timed = { format: FORMAT.id, ...(story ? { story: story.id } : {}), total,
  scenes: scenes.map((s, i) => ({ id: s.id, title: s.title || s.id, act: s.act || '',
    start: +starts[i].toFixed(3), duration: +durations[i].toFixed(3), use_cases: s.use_cases || [],
    vo: s.vo })) };
// the frame the cut's poster shows (stories.mjs posterMoments): the site's poster and preview
writeFileSync(join(BUILD, 'timeline.json'), JSON.stringify({ ...timed,
  poster: posterMoments(timed)[0] }, null, 2) + '\n');
const words = clips.map((c) => c.words);

console.log(`2/5 frames (${WORKERS} workers)`);
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--hide-scrollbars', '--force-color-profile=srgb', '--font-render-hinting=none'],
});
const pages = [];
let timeline;
for (let w = 0; w < WORKERS; w++) {
  const page = await browser.newPage();
  await page.setViewport({ width: FORMAT.width, height: FORMAT.height, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument((f, frame, st, uc) => {
    window.FACTS = f; window.FRAME = frame; window.STORY = st; window.USE_CASES = uc;
  }, facts, FORMAT, story, useCaseTitles);
  await page.goto(pathToFileURL(join(DIR, 'reel.html')).href, { waitUntil: 'load' });
  timeline = await page.evaluate((d) => window.setup(d), {
    durations, words, chunks, ids: scenes.map((sc) => sc.id), titles: scenes.map((sc) => sc.title || sc.id),
    acts: scenes.map((sc) => sc.act || ''), useCases: scenes.map((sc) => sc.use_cases || []),
    vos: scenes.map((sc) => sc.vo),
  });
  pages.push(page);
}
timeline.warnings.forEach((w) => console.warn(`   warning: ${w}`));

// YouTube chapters, from the timeline itself
const stamp = (t) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
writeFileSync(join(BUILD, 'chapters.txt'),
  scenes.filter((sc) => sc.id !== 'loop').map((sc, i) => `${stamp(starts[i])} ${sc.title || sc.id}`).join('\n') + '\n');

// TIMELINE=1 stops here: the voice (cached), the timeline, the captions and the chapters of a cut,
// for a render made before render.mjs wrote them
if (process.env.TIMELINE) {
  await browser.close();
  console.log(`timeline: ${join(BUILD, 'timeline.json')} (${total.toFixed(1)} s)`);
  process.exit(0);
}

// CHECK=1 renders every scene's first frames (a painter that throws fails the gate) and walks it
// at the middle and the end of its time, reporting any text that overlaps another or leaves the
// safe frame, with a still of each frame that fails.
if (process.env.CHECK) {
  let failures = 0;
  for (let i = 0; i < scenes.length; i++) {
    // a scene's first frames, across the cut, must render at all (layout is judged later in it)
    for (const t of [Math.max(0, starts[i] - 0.3), starts[i] + 0.05]) {
      await pages[0].evaluate((x) => window.renderAt(x), t);
    }
    for (const t of [starts[i] + durations[i] * 0.55, starts[i] + durations[i] - 0.45]) {
      await pages[0].evaluate((x) => window.renderAt(x), t);
      const issues = await pages[0].evaluate(() => window.layoutCheck());
      if (!issues.length) continue;
      failures += issues.length;
      await pages[0].screenshot({ path: join(BUILD, `check-${scenes[i].id}-${t.toFixed(1)}.png`) });
      console.log(`FAIL ${scenes[i].id} @ ${t.toFixed(1)}s`);
      issues.forEach((x) => console.log(`     ${x}`));
    }
  }
  console.log(failures ? `layout: ${failures} finding(s)` : 'layout: clean');
  await browser.close();
  process.exit(failures ? 1 : 0);
}

// PREVIEW=3.2,12,20 writes stills at those seconds and stops; quick for layout work.
if (process.env.PREVIEW) {
  const times = process.env.PREVIEW === 'ends'
    ? starts.map((st, i) => +(st + durations[i] - 0.45).toFixed(2))
    : process.env.PREVIEW.split(',').map(Number);
  for (const t of times) {
    await pages[0].evaluate((x) => window.renderAt(x), t);
    await pages[0].screenshot({ path: join(BUILD, `preview-${t}.png`) });
  }
  console.log(`   starts: ${starts.map((s) => s.toFixed(2)).join(' ')}`);
  await browser.close();
  process.exit(0);
}

const videoOnly = join(BUILD, 'video.mp4');
const enc = spawn('ffmpeg', [
  '-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-r', String(FPS), videoOnly,
], { stdio: ['pipe', 'inherit', 'inherit'] });
const encDone = new Promise((res, rej) => enc.on('close', (c) => (c === 0 ? res() : rej(c))));

const frames = Math.ceil(total * FPS);
const shoot = async (page, f) => {
  await page.evaluate((t) => window.renderAt(t), f / FPS);
  return page.screenshot({ type: 'png', optimizeForSpeed: true });
};
const began = Date.now();
for (let f = 0; f < frames; f += WORKERS) {
  const batch = await Promise.all(pages.map((p, k) => (f + k < frames ? shoot(p, f + k) : null)));
  for (const png of batch) {
    if (png && !enc.stdin.write(png)) await new Promise((r) => enc.stdin.once('drain', r));
  }
  if (f % (FPS * 2) < WORKERS) {
    const rate = (f + WORKERS) / ((Date.now() - began) / 1000);
    process.stdout.write(`\r   ${Math.min(f + WORKERS, frames)}/${frames}  ${rate.toFixed(1)} fps`);
  }
}
enc.stdin.end();
await encDone;
await browser.close();
console.log(`\r   ${frames}/${frames} in ${((Date.now() - began) / 1000).toFixed(0)} s`);

console.log('3/5 music and effects');
const sections = Object.fromEntries(scenes.map((s, i) => [s.id, starts[i]]));
const { music, sfx } = synthesize({ total, sections, events: timeline.events });
const musicWav = join(BUILD, 'music.wav');
const sfxWav = join(BUILD, 'sfx.wav');
writeWav(musicWav, music);
writeWav(sfxWav, sfx);

console.log('4/5 mix');
const audio = join(BUILD, 'audio.m4a');
const n = clips.length;
const inputs = [...clips.flatMap((c) => ['-i', c.file]), '-i', musicWav, '-i', sfxWav];
const delayed = clips.map((_, i) => {
  const ms = Math.round((starts[i] + VO_LEAD) * 1000);
  return `[${i}:a]aresample=48000,adelay=${ms}:all=1[v${i}]`;
});
const graph = [
  ...delayed,
  `${clips.map((_, i) => `[v${i}]`).join('')}amix=inputs=${n}:normalize=0:duration=longest,`
    + 'pan=stereo|c0=c0|c1=c0,highpass=f=80,acompressor=threshold=0.1:ratio=3:attack=5:release=120,'
    + 'volume=1.6,asplit=2[vo][key]',
  `[${n}:a]volume=${MUSIC ? 1 : 0}[bed]`,
  '[bed][key]sidechaincompress=threshold=0.02:ratio=8:attack=12:release=420[duck]',
  `[vo][duck][${n + 1}:a]amix=inputs=3:normalize=0:duration=longest,`
    + 'loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[out]',
].join(';');
run('ffmpeg', [
  '-y', '-loglevel', 'error', ...inputs, '-filter_complex', graph, '-map', '[out]',
  '-t', total.toFixed(3), '-c:a', 'aac', '-b:a', '256k', audio,
]);

console.log('5/5 mux');
run('ffmpeg', [
  '-y', '-loglevel', 'error', '-i', videoOnly, '-i', audio, '-c:v', 'copy', '-c:a', 'copy',
  '-shortest', '-movflags', '+faststart', OUT,
]);
console.log(`done: ${OUT}  (${total.toFixed(1)} s, ${frames} frames)`);
