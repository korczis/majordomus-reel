# Translating the reel

The reel is bilingual (`project.reel-bilingual`): English is the source, every other language
is one file, `lang/<id>.json`, checked against that source on every run. Every iteration is
measured and may not make anything worse (`project.every-iteration-better`).

## When you change an English scene or on-screen text

The translation is stale from that moment, and the gates say where:

1. `node i18n.mjs --check`: lists every scene, cue and text a language now lacks or no
   longer needs. A new scene needs `vo`, `title`, `act` and `cues`; a new string needs a
   `text` entry (or `keep`, if it is the same in both languages).
2. Translate in the file only. The English source stays English; never branch the markup on
   the language.
3. `REEL_LANG=<id> BUILD=$PWD/build-<id>-<cut> CHECK=1 node render.mjs` (add
   `SCENES=scenes-short.json` for the short): voices the changed scenes (cached per scene by
   its words, voice and rate), then fails on layout, on a cue the voice never says and on any
   text, DOM or canvas, left in English. Read the `check-*.png` stills it writes.
4. `PREVIEW=ends` with the same variables, and read the stills: the gate proves geometry and
   coverage, the eye judges meaning, diacritics and line breaks.
5. `node quality.mjs --check`, then finish the task with `node quality.mjs --record "<what
   improved>"` in its verify command.

## Writing a translation

- `cues` maps each English cue word of the scene (its `data-cue`/`data-class-cue`, and every
  `env.cue('…')` its painter reads: gen.js maps a scene to its painters) to the word its own
  voice says at that moment, without diacritics, as a prefix (`"initiali": "inicializujte"`,
  `"word#2"` for the second time). Pick a word that is not said earlier in the scene, or the
  element appears too soon.
- Facts are placeholders, never digits or words: `{{blocking:Words:n}}` (Czech words, gender
  m/f/n), `{{blocking:plural:blokující pravidlo|blokující pravidla|blokujících pravidel}}`,
  `{{adrs}}` on screen. A cue on a spoken number names the fact: `"hundred": "{{adrs:Words}}"`.
- Czech: formal address (vykání), short lines (Czech runs longer than English, and the layout
  gate refuses overflow), established developer terms kept (commit, repozitář, větev), product
  names unchanged. Terminals, code and commands stay as the tool prints them.

## Adding a language

1. Copy `lang/cs.json` to `lang/<id>.json`; set `lang`, `locale`, `voice` (an Edge neural
   voice: `uvx --with edge-tts edge-tts --list-voices`), `rate`, `say` (the macOS fallback
   voice) and translate every entry.
2. Number words: `i18n.mjs` speaks facts only in the languages it has words for, and refuses
   the rest by name; add the language's words and plural rule there first.
3. The steps above, for the film, the short and every story, in every format.
4. `node quality.mjs`: the new language adds its own measures. Record the iteration.

## Translating the site

The site's words are messages: `site/messages.json` is English, `lang/<id>.json` `site` the same
keys in the language. A message takes `{name}` arguments and
`{n, plural, one {# příběh} few {# příběhy} many {# příběhu} other {# příběhů}}` counts (`#` is
the count; write every category `Intl.PluralRules` has for the language, Czech one, few, many,
other) and may mark its accent as `<em>...</em>`. Never type a number, a length or a fact into
one: they are arguments.

1. A new or changed English word: edit `site/messages.json` (a template names it as
   `{{m:<key>}}`, a view or `app.js` as `t('<key>')`); `node site/build.mjs` refuses a key named
   but missing and a key nothing names.
2. `node i18n.mjs --check`: lists every site message a language lacks, keeps after English
   dropped it, writes with other arguments or plurals, or types a fact into. Translate in
   `lang/<id>.json` `site` only.
3. Category, use-case and act titles come from `catalogue` and `acts`, the cut's chapters and
   narration from its render: never from `site`.

## Rendering for the site

A language's cut is `cuts/v6/<cut>-<format>.<id>.mp4` with its render data in
`build-v6/<cut>-<format>.<id>/`, next to the English `cuts/v6/<cut>-<format>.mp4`:

```sh
REEL_LANG=cs SCENES=scenes-short.json FORMAT=phone BUILD=$PWD/build-v6/short-phone.cs \
  OUT=$PWD/cuts/v6/short-phone.cs.mp4 OPEN=0 ./make-reel.sh
```

The build serves it on `/<id>/<cut>/` (the film on `/<id>/`) with its own chapters, captions,
posters and share picture. Until a cut is rendered in the language, that language's page plays
the English cut, says so in a note and marks its chapters and captions `lang="en"`; the build
refuses that unless `FALLBACK=1` (deploy) or `PARTIAL=1` (preview), and `<id>/data/reel.json`
records it (`language_fallback`, `gaps`). Then check the site in the language:

```sh
FALLBACK=1 SITE_OUT=/tmp/reel-site node site/build.mjs   # runs the seo gate: hreflang, og:locale, inLanguage
node site/test.mjs /tmp/reel-site                        # every language's routes, words, switcher, choice
SITE_OUT=/tmp/reel-site node quality.mjs --check         # adds site.<id>.routes from that build
```
