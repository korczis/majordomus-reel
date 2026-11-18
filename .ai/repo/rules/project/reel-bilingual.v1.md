---
id: project.reel-bilingual
version: 1
kind: rule
title: The reel and its site are bilingual, English and Czech, in words, voice and interface, and the viewer's language is chosen for them
description: The owner asked on 2026-11-18 for a Czech variant of the video, "jak text, tak slovo/zvuk", then for it "top notch / best quality - all dynamic, derived, infered, documented, enforced, always up to date, ai / llm documented/friendly", with "prepinace lokalizace do ui, automaticka volba, vse musi byt bilingual, integerated, derived, infered, dynamic, generic", enforced and documented through .ai and Majordomus from now on. Every language is one translation file over the one English source, gated for completeness and currency, and the page picks the viewer's language and lets them switch.
statement: Render every cut in every language lang/ declares, with its own narration, voice, chapters and on-screen text, from one English source and one translation file per language; refuse a translation that is incomplete, stale or types a fact; and serve the site in every language with a switcher, the viewer's language chosen automatically, and each language's routes linked to each other.
status: active
class: blocking
depends_on: [project.reel-facts-are-derived@1, project.reel-tailored-per-device@1, project.reel-site-is-derived@1]
tags: [i18n, presentation, render, site, derived]
---

# Rationale

A Czech viewer of an English promo gets the product second-hand; a Czech promo with English left
on screen, a voice out of step with the picture, or a count typed in Czech that the next release
falsifies is worse than none. A translation goes stale the day an English scene changes, so it is
kept as data over the English source and checked against it on every run, rather than written
once as a second film.

# Required behaviour

- **One source, one file per language.** English is the original: `scenes.json`,
  `scenes-short.json`, `reel.html` and the painters of `gen.js` and `viz.js`. A language is
  `lang/<id>.json` and nothing else: per scene its narration (`vo`), chapter `title`, `act` and
  `cues` (the word its own voice says for each English cue word), the `voice`, `rate` and
  `locale`, and `text`, every on-screen English string with its translation (`keep` lists those
  that are the same). Terminals, code, commands and tool output stay as the tool prints them.
- **Facts in the language's own words.** A translation types no fact: it names them as
  placeholders, and `i18n.mjs` speaks them in the language (Czech number words with gender,
  `{{name:Words:n}}`; the noun's form for the count, `{{name:plural:one|few|many}}`).
- **Timing from the language's own voice.** Elements appear on the word the translated voice
  says (`cues`, matched without diacritics); a cue may name a fact (`"{{adrs:Words}}"`).
- **Every language, every cut, every format.** A cut published in one language is rendered in
  every language (`REEL_LANG=<id>`), in every format (`project.reel-tailored-per-device`):
  `cuts/v6/<cut>-<format>.mp4` is English, `cuts/v6/<cut>-<format>.<id>.mp4` the language.
- **The site is bilingual.** Every interface string exists in every language; the page offers
  a language switcher, chooses the viewer's language from the browser on the first visit and
  remembers their choice, keeps it in the address, and links every route to its counterpart in
  each language (`hreflang`, `og:locale` and `og:locale:alternate`, `inLanguage`, captions with
  `srclang`). A cut not yet rendered in the viewer's language plays the language it has and the
  page says so, as the format fallback does (`project.reel-site-is-derived`).

# Enforcement

No validator of the Majordomus executable decides this, so the rule carries no
`x-majordomus` block. This repository's own commands refuse:

- `node i18n.mjs --check` (exit 1): a scene of `scenes.json` or `scenes-short.json` a language
  does not translate (or translates without a narration, title or act); a cue, in the scene's
  markup or read by its painter, that the translated narration never says; on-screen text the
  page leaves in English (the page itself, localised in headless Chrome); a translation of a
  scene, cue or text that no longer exists; and a fact typed into a translation;
- `node render.mjs` with `REEL_LANG=<id>`: refuses a scene the file does not translate; with
  `CHECK=1` (exit 1) it also fails on a cue the voice never says and on any text, DOM or canvas,
  left in English;
- `node quality.mjs --check` (exit 1): any language's coverage worse than the last recorded
  iteration (`project.every-iteration-better`).

The site's half (switcher, automatic choice, per-language routes and metadata) is required now
and lands with the bilingual site; until `site/build.mjs` and `site/test.mjs` refuse a missing
interface string, a route without its language alternates and a switcher that does not switch,
a reviewer enforces it.
