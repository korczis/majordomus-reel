// The site's stylesheet and script: Tailwind (with the Flowbite plugin) compiles site/site.css
// into <out>/site.css, and Flowbite's JavaScript, which drives the navbar's collapse toggle, is
// copied beside it as <out>/flowbite.min.js. site/build.mjs calls this after it has cleared
// _site/; `yarn build:assets` runs it alone (into SITE_OUT or _site/) to preview the page.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SITE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(SITE);

export function buildAssets(out) {
  const cli = join(ROOT, 'node_modules', '.bin', 'tailwindcss');
  const flowbite = join(ROOT, 'node_modules', 'flowbite', 'dist', 'flowbite.min.js');
  if (!existsSync(cli) || !existsSync(flowbite)) {
    throw new Error('missing node_modules: run `yarn install` in the repository root first');
  }
  mkdirSync(out, { recursive: true });
  const r = spawnSync(cli, ['-i', join(SITE, 'site.css'), '-o', join(out, 'site.css'), '--minify'],
    { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'ignore', 'pipe'] });
  if (r.status !== 0) throw new Error(`tailwindcss failed: ${r.stderr || r.error}`);
  copyFileSync(flowbite, join(out, 'flowbite.min.js'));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const out = process.env.SITE_OUT || join(ROOT, '_site');
  buildAssets(out);
  console.log(`assets  ${out} (site.css, flowbite.min.js)`);
}
