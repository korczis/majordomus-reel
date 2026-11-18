---
id: project.reel-facts-are-derived
version: 1
kind: rule
title: Every Majordomus fact in the film is derived from the newest release
description: The film states a version, counts of rules and a count of decisions. Typed by hand they go stale the day Majordomus releases again — v5.7 still said 1.0.0-alpha.8 and 166 decisions three releases later. facts.mjs derives them from the newest release tag of a Majordomus clone, render.mjs refuses a source that types one, and site/verify.sh refuses a published film whose facts are not the latest release's.
statement: State a Majordomus fact in the film only through facts.mjs — a double-braced name in reel.html or the narration, window.FACTS in viz.js — and publish a cut only while its facts are the latest release's.
status: active
class: blocking
depends_on: []
tags: [provenance, facts, release]
---

# Rationale

A film is published once and watched for months. Every number it says about Majordomus is a
claim about a moving project, and a claim typed into a scene is true only on the day it was
typed. The reel's own subject is that a claim needs its proof; a film that says a stale
version contradicts itself.

# Required behaviour

- The version, the standard rules' counts (all, with a validator, blocking, blocking with a
  validator) and the count of architecture decisions come from `facts.mjs`, which reads them
  from the newest stable `v*` tag of `MAJORDOMUS_REPO` (default `../prismatic-majordomus`).
- Markup and narration name a fact as a double-braced name (`version`, `adrs`, and `:words` or
  `:Words` for narration); `viz.js` reads `window.FACTS`. A new fact is added to `derive()`
  first.
- The narration may say that every blocking rule has a validator only while the release makes
  that true; `facts.mjs --check` refuses it otherwise.
- A deployed site names the release its cut was rendered with; a newer release makes the
  published film stale until it is re-rendered and deployed.

# Enforcement

No validator of the Majordomus executable decides this, so the rule carries no
`x-majordomus` block. It is enforced by this repository's own commands, each refusing:

- `node facts.mjs --check` (exit 1): a typed version or count, or an unknown fact, in the film's
  sources, the page and the README; on the page and in the README also a typed length of a cut or
  count of acts, scenes or chapters (`site/build.mjs` measures lengths from the renders
  `site/published.json` names, and reads what a render needs from `make-reel.sh`);
- `node render.mjs`: runs the same check before the voice-over and renders nothing on a
  finding; the page itself throws on a fact it was not handed;
- `site/verify.sh` (exit 1): the published page names no release, or one older than the latest
  GitHub release of korczis/prismatic-majordomus.

A task's `--verify-command` runs `node facts.mjs --check` and `site/verify.sh`.
