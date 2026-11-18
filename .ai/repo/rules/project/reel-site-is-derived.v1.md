---
id: project.reel-site-is-derived
version: 1
kind: rule
title: The reel's site is derived, every cut has its own route, and the page is a browsable, honest index
description: The owner asked on 2026-11-18 for every short reel on GitHub Pages at once, with a carousel, a browser and a gallery, an SEO-optimised route per video "with all seo, social, og tags, previews, for max reach", everything derived, dynamic and interactive, verified in a browser and enforced for the future. A colleague's feedback (Rados, 2026-11-17) sets the order - several short one-dimensional stories leading to the install line beat one long film, and majordomus.dev/use-cases is where every AI user should find themselves - so the stories come first and the film second.
statement: Build the reel's site only from data (stories.mjs, the renders' timeline.json and facts.json, formats.json, published.json), give every cut its own route with complete search and share metadata and a poster and share picture taken from its own frames, keep the stories first in a carousel, a filterable browser and a gallery whose state lives in the address, never overflow sideways, and say honestly what is not rendered or released yet.
status: active
class: blocking
depends_on: [project.reel-facts-are-derived@1, project.reel-tailored-per-device@1]
tags: [site, seo, presentation, derived]
---

# Rationale

The site is the reel's front door. A title, a length or a count typed into it is stale the day
a cut is re-rendered; a route without its own preview is invisible when it is shared; a share
picture cropped from the empty middle of a portrait frame is a black rectangle in every feed
(six of nine story cards were exactly that on 2026-11-18). A page that plays a portrait cut on a
monitor without saying why, or names a release that does not exist yet, tells the viewer
something false. Each of these is decided by data the build already has, so each is derived and
checked rather than reviewed.

# Required behaviour

- **Derived.** Every title, length, count and list on a page, in `data/reel.json`, `sitemap.xml`
  and `llms.txt` comes from the data; the templates (`site/index.html`, `site/player.html`) name
  it as a `{{placeholder}}` and `site/build.mjs` refuses one it does not derive. Class lists come
  from `ui` in `site/view.mjs` (Flowbite Pro), never ad-hoc styles.
- **A route per cut.** The film is the root; every other cut (the short, every story) is
  `/<cut>/`. Each route carries its title, description, canonical, `og:type video.other`, a first
  `og:image` of 1200x630 (its share picture) and a second of its native poster frame, `og:video`,
  `video:duration`, `twitter:card summary_large_image`, and a JSON-LD `VideoObject` with name,
  description, thumbnailUrl, uploadDate (the newest commit of what makes the cut), duration
  (ISO-8601, measured from the render), contentUrl, embedUrl and one `Clip` per chapter in
  `hasPart`. `sitemap.xml` lists every route with a `video:video` entry and `llms.txt` names it.
- **Posters from the cut's own frames.** A poster is taken for every format a cut has, at the
  first moment of `posterMoments` (`stories.mjs`: the timeline's `poster`, else the end of the
  reveal or of the story's title card, then each scene) whose frame shows something (mean
  brightness at least one level above its background). The share picture is 1200x630: a
  landscape frame fills it; a portrait frame is shown as three of its moments side by side.
- **Stories first.** Under the hero, a Flowbite carousel of the stories: poster, title, length,
  the one-line why and play, with arrows, dots, swipe and the arrow keys; it advances and plays
  muted previews only when the viewer has not asked for reduced motion. Then the browser: a chip
  per use-case category and a search over titles, whys and use cases, with the state in the
  address (`?category=`, `?q=`) restored on load and an "n of N stories" count. Then the gallery
  of poster tiles with a preview on hover; a tile opens the story over the page (Escape closes
  it, a button or F fills the viewport, `?play=` links to it) or, with a modifier, on its route.
  The film comes after the stories; every story ends at the install line and every use case
  links to its page on majordomus.dev/use-cases.
- **No horizontal overflow** at 320, 390, 768, 1024 and 1440 pixels wide.
- **Honest gaps.** A format a cut lacks plays the nearest one it has (by aspect), the page says
  so in a note, and `data/reel.json` records the cut's `formats`, its `fallback` and the site's
  `gaps`. A cut pre-rendered for a release that is not tagged yet is labelled "<version>, release
  pending" and links to the commit, never to a release page that does not exist.

A deploy with a missing format is allowed only through `FALLBACK=1` (owner's order of
2026-11-18, "chci je videt asap", while the machine could not render the desktop and tablet
cuts): it is the only finding `FALLBACK=1` lets through, the gap is shown on the page and
recorded in `data/reel.json`, and `site/verify.sh` reports it on every run until the cut is
rendered and deployed (`project.reel-tailored-per-device` still requires every format).

# Enforcement

No validator of the Majordomus executable decides this, so the rule carries no
`x-majordomus` block. This repository's own commands refuse:

- `node site/build.mjs` (exit 1): a placeholder it does not derive; a cut with no frame that
  shows anything; a pre-rendered cut whose release is not tagged; a missing format without
  `FALLBACK=1`; and every finding of `checkSite`;
- `node site/seo.mjs <dir>` (`checkSite`, run by the build; exit 1): a route missing any tag or
  JSON-LD field above, a share picture that is not 1200x630, an `og:image` or `og:video` not in
  the site, a route the sitemap lists without its `video:video` fields, or one `llms.txt` omits;
- `node site/test.mjs` (exit 1): horizontal overflow at any of the five widths, a console error
  or a failed request, a carousel that does not move by key, arrow, dot or swipe, a filter deep
  link that is not restored, a viewer that does not open or that Escape does not close, a route
  that does not load its own video, a fallback with no note, and a template that types a title,
  a length or a count;
- `node facts.mjs --check` (exit 1): a typed fact, length or count of acts, scenes or chapters in
  the templates or the README;
- `site/verify.sh` (exit 1): the live site misses a route, a video that seeks, a poster or a
  share picture, or names a release that is not the latest.

A task's `--verify-command` runs `node facts.mjs --check`, `node site/test.mjs` and
`site/verify.sh`.
