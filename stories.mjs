// The stories: one short film per use-case category the reel can show, derived and never typed.
// A scene names the use cases it shows (`use_cases` in scenes.json); the release files each use
// case under a category (taxonomy.yaml). A story is the category's title card, every scene that
// shows one of its use cases in the film's order, then how to install it and the call to act:
// one dimension, ending at the install line. A category no scene shows has no story.
//
//   node stories.mjs            -> prints the stories as JSON
//   node stories.mjs --ids      -> prints one story id per line (for a render loop)
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { derive, catalogue } from './facts.mjs';

const DIR = dirname(fileURLToPath(import.meta.url));
// the frame of every story: its card first, then the scenes, then the way in
export const OPEN = 'story';
export const CLOSE = ['setup', 'cta'];

// The moments a cut is best shown by, best first: the end of the reveal (the film, the short),
// else of a story's title card (its name and every use case it shows, on screen at once), then
// three quarters into every scene. render.mjs writes the first as `poster` in timeline.json;
// site/build.mjs takes the first that has ink (a frame with no bright pixel is refused).
export function posterMoments(timeline) {
  const named = ['reveal', OPEN].map((id) => timeline.scenes.find((s) => s.id === id)).filter(Boolean)
    .map((s) => s.start + s.duration - 0.6);
  const rest = timeline.scenes.map((s) => s.start + s.duration * 0.75);
  const own = Number.isFinite(timeline.poster) ? [timeline.poster] : [];
  return [...new Set([...own, ...named, ...rest].map((t) => +t.toFixed(2)))]
    .filter((t) => t > 0 && t < timeline.total);
}

export function stories(facts = derive(), cat = catalogue(facts)) {
  const film = JSON.parse(readFileSync(join(DIR, 'scenes.json'), 'utf8'));
  const byId = Object.fromEntries(cat.useCases.map((u) => [u.id, u]));
  const frame = new Set([OPEN, ...CLOSE, 'hook', 'loop']);
  return cat.categories.map((c) => {
    const scenes = film.filter((s) => !frame.has(s.id)
      && (s.use_cases || []).some((id) => byId[id]?.category === c.id));
    const shown = [...new Set(scenes.flatMap((s) => s.use_cases || []))]
      .filter((id) => byId[id]?.category === c.id).map((id) => byId[id]);
    return {
      id: c.id,
      title: c.title,
      summary: c.summary,
      url: `${cat.site}/use-cases/${c.id}/`,
      use_cases: shown.map((u) => ({ id: u.id, title: u.title, summary: u.summary,
        url: `${cat.site}/use-cases/${u.id}/` })),
      scenes: [OPEN, ...scenes.map((s) => s.id), ...CLOSE],
    };
  }).filter((s) => s.scenes.length > 1 + CLOSE.length);
}

// The scene list render.mjs voices and shows for a story: the film's own entries, with the
// title card's narration made from the category itself.
export function storyScenes(story) {
  const film = JSON.parse(readFileSync(join(DIR, 'scenes.json'), 'utf8'));
  const byId = Object.fromEntries(film.map((s) => [s.id, s]));
  return story.scenes.map((id) => (id === OPEN
    ? { id: OPEN, title: story.title, act: 'STORY', min: 6,
      vo: `${story.title}. ${story.summary}` }
    // the way in closes every story under its own act, wherever the film files the scene
    : CLOSE.includes(id) ? { ...byId[id], act: 'START' } : byId[id]));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const all = stories();
  if (process.argv.includes('--ids')) console.log(all.map((s) => s.id).join('\n'));
  else console.log(JSON.stringify(all, null, 2));
}
