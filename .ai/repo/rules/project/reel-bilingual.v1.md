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
- `node i18n.mjs --check` (exit 1), for the site: an interface message of `site/messages.json` a
  language's `site` lacks; one it keeps that English no longer has (stale); one whose arguments
  or plurals are not the English one's, or whose plural misses a category the language's
  `Intl.PluralRules` has (Czech: one, few, many, other); and a fact or number typed into one;
- `node site/build.mjs` (exit 1): a message a template, a view or the page's script names that
  `site/messages.json` lacks, and one there that nothing names; a number typed into an English
  message; a page whose language lacks a message (`PARTIAL=1` previews it in English); a
  language's render of the wrong language; and a cut not rendered in a language, unless
  `FALLBACK=1`, which plays the English cut on that language's page, says so in a note, marks
  its chapters and captions with their language and records it (`language_fallback`, `gaps` in
  that language's `data/reel.json`);
- `node site/seo.mjs <dir>` (`checkSite`, run by the build; exit 1): a page whose `<html lang>`,
  `og:locale` or JSON-LD `inLanguage` is not its route's language (the `VideoObject`'s is the
  language its cut plays), whose `og:locale:alternate` is not every other language, that lacks a
  `hreflang` alternate for a language or `x-default`, or names a counterpart that does not name
  it back; a sitemap entry without its `xhtml:link` alternates; a language without its own
  `llms.txt` and `data/reel.json`, a route its `llms.txt` omits, and a root `llms.txt` that does
  not name every language's entry point;
- `node site/test.mjs <dir>` (exit 1), in every language but English: its root and a story route
  at 320, 390, 768, 1024 and 1440 pixels overflow sideways or log a console error; an English
  message's words visible on its pages outside what is marked as another language; a route whose
  `<html lang>`, switcher or `h1` is not its language's, or that does not play its own cut in
  the language it has, marked and noted when that is English; the switcher not moving
  `/story-x/?t=12` to `/<id>/story-x/?t=12` and back; a first visit from a browser preferring the
  language not landing on its root (without a history entry); a stored English choice not
  keeping that browser on English; `?lang=` not winning, stored and dropped from the address;
  and a count, a length or a number typed into any language's messages;
- `node quality.mjs --check` (exit 1): also `site.<id>.messages_missing` and
  `site.<id>.messages_stale` worse than the last iteration, and, with `SITE_OUT=<build>`,
  `site.<id>.routes` fewer.
