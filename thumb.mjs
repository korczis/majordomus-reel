// Renders thumb.html to a 1080x1920 JPEG for the YouTube Short's custom thumbnail.
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';

const DIR = dirname(fileURLToPath(import.meta.url));
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--hide-scrollbars', '--force-color-profile=srgb'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(join(DIR, process.env.THUMB || 'thumb.html')).href, { waitUntil: 'load' });
await page.screenshot({ path: join(DIR, process.env.OUT || 'thumbnail.jpg'), type: 'jpeg', quality: 92 });
await browser.close();
console.log(join(DIR, process.env.OUT || 'thumbnail.jpg'));
