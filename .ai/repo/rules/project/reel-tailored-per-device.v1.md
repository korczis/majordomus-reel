---
id: project.reel-tailored-per-device
version: 1
kind: rule
title: Every cut is composed natively for phone, tablet and desktop, and the page picks the one that fits
description: One portrait film letterboxed on a desktop wastes two thirds of the screen and reads as a phone video on a monitor. The owner asked on 2026-11-17 for a tailored presentation on every device, with no simplification - "na desktopu dava smysl mit detailnejsi video, preci jen je vic prostoru" - so every cut is rendered from the same scenes in each format declared in formats.json, each laid out for its own frame and showing as much detail as its frame holds, and the site serves the one that fits the viewer.
statement: Render every published cut (film, short, every story) in every format formats.json declares, each composed natively for its frame (never a portrait render scaled or framed into another), pass the layout gate in each, and publish a cut only with all its formats; the page chooses the format and resolution from the viewer's device.
status: active
class: blocking
depends_on: [project.reel-facts-are-derived@1]
tags: [presentation, devices, render, site]
---

# Rationale

The reel is the promo. A viewer on a monitor, a tablet and a phone gets one chance each, and
a frame composed for another device is visibly second-rate: a portrait film pillarboxed on
a 16:9 screen, captions sized for a phone on a television, a landscape film shrunk onto a
phone. Composition is part of the content, so it is declared, derived and checked like the
facts the film states.

# Required behaviour

- `formats.json` is the one declaration of the formats: id, frame size, the media query the
  page serves it to, the web encode size and the detail tier. Nothing else names a frame size.
- `render.mjs` renders any cut in any format (`FORMAT=<id>`). `reel.html` lays every scene out
  for the frame it is handed (`window.FRAME`): portrait stacks, landscape sets the text and the
  visual side by side; the painters of `gen.js` and `viz.js` draw into their container's box,
  never into fixed coordinates.
- Detail follows space: an element marked `data-detail="<n>"` appears only in formats whose
  tier is at least n. The desktop tier adds what the larger frame can carry, derived from data
  (the use cases a scene shows, the chapter list of the act), never text typed for one format.
- The stories, the film and the short are the same scenes (`scenes.json`, `scenes-short.json`,
  `stories.mjs`); a format changes the composition, not the script.
- `CHECK=1` passes in every format, and the `PREVIEW=ends` stills of every format are read
  before a render is published.
- The site serves the format whose media query matches the viewer, and the resolution its
  screen needs; it never shows a portrait cut on a landscape screen when a landscape one exists.

# Enforcement

No validator of the Majordomus executable decides this, so the rule carries no
`x-majordomus` block. This repository's own commands refuse:

- `node site/build.mjs` (exit 1): a published cut (film, short or story) misses a format
  `formats.json` declares, or a format's render has the wrong frame size;
- `node render.mjs` with `CHECK=1` (exit 1): text overlapping text, or ink outside the safe frame
  of the format being rendered;
- `site/verify.sh` (exit 1): the live page does not offer every format of every cut, or a
  format's video is not served seekable.

A task's `--verify-command` runs `node facts.mjs --check` and `site/verify.sh`.
