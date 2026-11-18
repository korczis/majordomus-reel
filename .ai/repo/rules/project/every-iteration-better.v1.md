---
id: project.every-iteration-better
version: 1
kind: rule
title: Every iteration is measured, none makes a measure worse, and one is recorded only when it makes something better
description: The owner ordered on 2026-11-18, "kazda iterace mus byt lepsi a leps, to musi byt enforced, to musi byt happening, documented, enforced". Better is made a fact instead of a claim - a set of measures derived from the repository and its renders, a ledger of iterations in quality.json, a gate that refuses any regression and a record that refuses an iteration that improved nothing.
statement: Measure every iteration with quality.mjs, never let a measure get worse than the last recorded iteration, record an iteration in quality.json only when at least one measure is better, retire a measure only by a recorded decision, and close every task that changes the reel with the iteration recorded.
status: active
class: blocking
depends_on: [project.reel-bilingual@1]
tags: [quality, ratchet, process]
---

# Rationale

"Better every time" is unenforceable as a sentiment and trivially gamed as a claim. As a ratchet
over derived measures it is neither: what is measured cannot silently get worse, the history of
every iteration is in git for anyone (or any agent) to read, and an iteration that changes
nothing measurable has to say so instead of calling itself an improvement.

# Required behaviour

- `quality.mjs` derives every measure from the repository and its renders (Majordomus facts
  findings, the languages, the formats, the cuts rendered per language, and per language the
  scenes translated, the scenes missing, the cues unsaid, the texts untranslated, the stale and
  the typed translations). A measure has a direction (`up` or `down`); none is typed.
- `quality.json` is the ledger: each iteration's measures, its commit, its time, what it
  improved and a note; written only by `node quality.mjs --record "<what improved>"`.
- No iteration makes a measure worse than the last recorded one. A measure that disappears is
  worse; a measure is retired only by a recorded decision (`majordomus decision add`), listed in
  `quality.json` under `retired` with the decision's title.
- A task that changes the reel, its translations or its site closes with its iteration recorded:
  its `--verify-command` runs `node quality.mjs --record "<what improved>"` (with the task's other
  checks), so `majordomus finish --outcome completed` is refused when nothing improved. Work
  that improves nothing measurable finishes as `partial` and says why, and the measure it should
  have moved is added to `quality.mjs` before it is called done.
- When a new kind of quality matters (a check, a format, a site test), it becomes a measure in
  `quality.mjs` in the same change, so the ratchet covers it from then on.

# Enforcement

No validator of the Majordomus executable decides this, so the rule carries no
`x-majordomus` block. This repository's own commands refuse:

- `node quality.mjs --check` (exit 1): a measure worse than the last iteration, or gone;
- `node quality.mjs --record "<note>"` (exit 1): the same, or no measure better than the last
  iteration; it is the task's verify command, so `majordomus finish --outcome completed`
  refuses with it.

Choosing the verify command is the worker's; a reviewer checks that a finished task's verify
command recorded its iteration (the ledger's `head` and `note`).
