---
id: project.ui-uses-flowbite-pro
version: 1
kind: rule
title: Every user interface is built on Flowbite Pro
description: Every UI this repository builds or generates uses the owner's licensed Flowbite Pro shell, blocks and components on Tailwind.
statement: Build every user interface in this repository on the owner's licensed Flowbite Pro, starting from the matching Pro template or block, and review every UI change for Pro fidelity; no other UI kit and no ad-hoc component styling.
status: active
class: blocking
depends_on: []
tags: [ui, flowbite, design-system]
---

# Rationale

The owner holds a Flowbite Pro licence and requires it in every project (decision of 2026-10-28):
one design system across products, and no reinventing components the licence already pays for.

# Required behaviour

- Sources: `~/dev/poppyhead/assets/vendor/flowbite/` (admin shell, Pro dashboards, application and
  publisher blocks) and the owner's adaptation in
  `~/dev/poppyhead/lib/poppyhead_web/components/layouts/flowbite.html.heex`; the Claude Code skill
  `flowbite-pro` condenses them and carries a worked example.
- New or changed UI starts from the matching Pro template or block (shell, page header, cards,
  tables, tabs, drawers, empty states, forms, auth) and adapts its markup and class lists, on
  Tailwind with Flowbite JS (or the framework binding the Pro template uses).
- Native mobile UI follows the same visual language where the platform allows.
- Pro source files are never published verbatim.

# In this repository

- The user interface is the published site: the templates `site/index.html` and
  `site/player.html`, the views of `site/view.mjs` and the page scripts `site/app.js` and
  `site/lang.js`, built by `site/build.mjs` into every route of every language and pushed to
  GitHub Pages. It is the surface this rule governs. It is built on Tailwind 4 with the
  open-source Flowbite package (`site/app.css`, `flowbite.min.js` from npm), on the Pro navbar,
  carousel, card, filter, modal, alert and button-group patterns; every class list is named once
  in `ui` in `site/view.mjs`, and a template names one as `{{ui_<name>}}`, never an ad-hoc style.
- This repository and its Pages site are public. Pro markup is adapted, never copied: no file
  from the licensed sources, no Pro bundle and no Pro block as shipped is committed or published.
  Only the open-source Flowbite package may be loaded.
- Exempt, because they are render canvases for video frames and thumbnails rather than an
  interface anyone uses: `reel.html`, `gen.js`, `viz.js` and the `thumb*.html` pages. Their look
  is the film's, and changing it means a new render.

# Failure behaviour

A UI change that does not follow Flowbite Pro is a review finding and is reworked before it lands.

# Verification

`node ~/.claude/skills/flowbite-pro/verify.mjs <repository>` checks for Flowbite, Tailwind, other
UI kits and this rule; a reviewer compares each UI change with the Pro template it starts from.
`node site/test.mjs` proves the interface behaves (every route, width and language); Pro
fidelity of a change is checked by review against the template it starts from.
