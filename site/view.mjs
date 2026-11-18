// The views of the reel's data, written once: site/build.mjs renders the pages with them, and the
// page's script (app.js) renders the same chapters, chips and notes in the browser when the cut
// changes. Every class list is Flowbite Pro's (project.ui-uses-flowbite-pro), named once in `ui`;
// every path is relative to the site's root (`R`: '' on the root page, '../' one level down:
// project.reel-site-is-derived). Nothing here types a title, a length, a count or a word of copy:
// each comes from the cut object (data/reel.json) it is handed, and every word from the page
// language's messages (`t`: site/messages.json, lang/<id>.json `site`; project.reel-bilingual).

export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');
export const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
export const length = (s) => (s >= 90 ? `${Math.round(s / 60)} min` : `${Math.round(s)} s`);
// the format a cut is best shown by where nothing else decides: the widest it has
export const best = (c) => c.formats.desktop || c.formats.tablet || Object.values(c.formats)[0];
// the words a viewer can find a story by: its title, its why, its category and its use cases
export const searchText = (c, useCases) => [c.title, c.summary, c.category,
  ...(c.use_cases || []).map((id) => useCases[id]?.title || '')].join(' ').toLowerCase();

// ---- messages: ICU-like, one catalogue per language ---------------------------------------------
// A message is text with `{name}` arguments and `{n, plural, one {# story} few {...} other {...}}`
// (the categories of Intl.PluralRules for the page's locale, `=0` for an exact count, `#` the
// count); `<em>...</em>` is the one markup a message may carry (the accent of a heading).
export function parseMessage(src) {
  let i = 0;
  const fail = (why) => { throw new Error(`message "${src}": ${why} at ${i}`); };
  const nodes = (inPlural) => {
    const out = [];
    let text = '';
    const flush = () => { if (text) out.push(text); text = ''; };
    while (i < src.length) {
      const c = src[i];
      if (c === '}') { if (inPlural) break; fail('an unbalanced }'); }
      if (c === '{') { flush(); i++; out.push(arg()); continue; }
      if (c === '#' && inPlural) { flush(); out.push({ hash: true }); i++; continue; }
      text += c;
      i++;
    }
    flush();
    return out;
  };
  const arg = () => {
    const m = /^\s*([a-zA-Z_]\w*)\s*(?:,\s*(plural)\s*,)?\s*/.exec(src.slice(i));
    if (!m) fail('an argument without a name');
    i += m[0].length;
    if (!m[2]) {
      if (src[i] !== '}') fail(`{${m[1]}} is not closed`);
      i++;
      return { arg: m[1] };
    }
    const branches = {};
    for (;;) {
      const k = /^\s*(?:(=\d+|zero|one|two|few|many|other)\s*\{|\})/.exec(src.slice(i));
      if (!k) fail(`a plural branch of {${m[1]}} that is not one of =n, zero, one, two, few, many, other`);
      i += k[0].length;
      if (!k[1]) break;
      branches[k[1]] = nodes(true);
      if (src[i] !== '}') fail(`the ${k[1]} branch of {${m[1]}} is not closed`);
      i++;
    }
    if (!branches.other) fail(`the plural {${m[1]}} has no other branch`);
    return { arg: m[1], plural: branches };
  };
  return nodes(false);
}

// what a message takes: its argument names and, per plural argument, the categories it writes
export function messageShape(src) {
  const args = new Set();
  const plurals = {};
  const walk = (ns) => ns.forEach((n) => {
    if (typeof n === 'string' || n.hash) return;
    args.add(n.arg);
    if (n.plural) {
      plurals[n.arg] = [...new Set([...(plurals[n.arg] || []), ...Object.keys(n.plural)])].sort();
      Object.values(n.plural).forEach(walk);
    }
  });
  walk(parseMessage(src));
  return { args: [...args].sort(), plurals };
}

// the literal words of a message, without its arguments and markup (what a page in another
// language must not show)
export function messageWords(src) {
  const out = [];
  const walk = (ns) => ns.forEach((n) => {
    if (typeof n === 'string') out.push(...n.replace(/<\/?em>/g, '\n').split('\n'));
    else if (n.plural) Object.values(n.plural).forEach(walk);
  });
  walk(parseMessage(src));
  return out.map((s) => s.trim()).filter(Boolean);
}

// raw HTML handed to a message as an argument (a link, a kbd), inserted unescaped by t.html
export const raw = (html) => ({ html });

// The messages of one language: t(key, args) is plain text (for attributes, titles, the
// address), t.html(key, args) is escaped HTML with the message's <em> kept; t.list joins
// a list the language's way ("a, b and c", "a, b a c"). An unknown key throws: the build
// refuses a page that names a message the catalogue lacks. `fallback` (a PARTIAL preview only)
// answers a key the language lacks with the English message.
export function messenger(messages, locale, fallback = null) {
  const parsed = new Map();
  const rules = new Intl.PluralRules(locale);
  const lists = new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' });
  const source = (key) => {
    if (key in messages) return messages[key];
    if (fallback && key in fallback) return fallback[key];
    throw new Error(`no message "${key}" for ${locale} (site/messages.json, lang/<id>.json site)`);
  };
  const nodesOf = (key) => {
    if (!parsed.has(key)) parsed.set(key, parseMessage(source(key)));
    return parsed.get(key);
  };
  const render = (key, args, html) => {
    const value = (name) => {
      if (!(name in args)) throw new Error(`message "${key}" needs {${name}}`);
      return args[name];
    };
    const text = (s) => (html ? esc(s).replace(/&lt;em&gt;/g, '<em class="text-primary-400">')
      .replace(/&lt;\/em&gt;/g, '</em>') : s.replace(/<\/?em>/g, ''));
    const walk = (ns, n) => ns.map((x) => {
      if (typeof x === 'string') return text(x);
      if (x.hash) return String(n);
      const v = value(x.arg);
      if (x.plural) {
        const count = Number(v);
        return walk(x.plural[`=${count}`] || x.plural[rules.select(count)] || x.plural.other, count);
      }
      if (v && typeof v === 'object' && 'html' in v) return html ? v.html : v.html.replace(/<[^>]*>/g, '');
      return html ? esc(v) : String(v);
    }).join('');
    return walk(nodesOf(key), null);
  };
  const t = (key, args = {}) => render(key, args, false);
  t.html = (key, args = {}) => render(key, args, true);
  t.list = (xs) => lists.format(xs.map(String));
  t.has = (key) => key in messages;
  t.locale = locale;
  t.lang = locale.split('-')[0].toLowerCase();
  return t;
}

// The format and language a viewer gets: the format asked for, else the nearest one the cut has
// (by aspect; build.mjs records it per cut as `fallback`), with the honest note to show; a cut not
// rendered in the page's language plays the one it has (`language_fallback`) and says so too.
export function pickFormat(cut, wanted, formats, t) {
  const label = (x) => (formats.find((f) => f.id === x)?.label || x).toLocaleLowerCase(t.locale);
  const language = cut.language_fallback ? t('note.language', { title: cut.title }) : '';
  if (cut.formats[wanted]) return { id: wanted, note: language };
  const id = cut.fallback?.[wanted] || Object.keys(cut.formats)[0];
  return { id, note: [language, t('note.format', { title: cut.title, wanted: label(wanted),
    played: label(id), rendered: t.list(Object.keys(cut.formats).map(label)) })].filter(Boolean)
    .join(' ') };
}

// the Pro surfaces, named once
export const ui = {
  card: 'bg-white border border-gray-200 rounded-lg dark:bg-gray-900 dark:border-gray-800',
  eyebrow: 'text-xs font-medium tracking-widest uppercase',
  link: 'text-gray-700 hover:text-primary-400 dark:text-gray-300 dark:hover:text-primary-300',
  primary: 'inline-flex items-center justify-center gap-1.5 font-medium text-white rounded-lg '
    + 'bg-primary-700 hover:bg-primary-800 focus:ring-4 focus:outline-none focus:ring-primary-800',
  secondary: 'inline-flex items-center justify-center gap-1.5 font-medium text-gray-900 bg-white border '
    + 'border-gray-300 rounded-lg hover:bg-gray-100 focus:ring-4 focus:outline-none focus:ring-gray-200 '
    + 'dark:bg-gray-900 dark:text-gray-300 dark:border-gray-700 dark:hover:bg-gray-800 '
    + 'dark:hover:text-white dark:focus:ring-gray-800',
  toggle: 'px-3 py-1.5 text-xs font-medium text-gray-300 bg-gray-900 border border-gray-700 '
    + 'hover:bg-gray-800 hover:text-white aria-pressed:bg-gray-700 aria-pressed:text-white '
    + 'disabled:opacity-40 disabled:pointer-events-none',
  chip: 'inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-primary-300 bg-gray-800 '
    + 'border border-gray-700 rounded-lg hover:bg-gray-700 hover:text-white',
  // a filter pill: Pro's toggle chips, the pressed state from aria-pressed
  filter: 'inline-flex shrink-0 items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-300 '
    + 'bg-gray-900 border border-gray-700 rounded-full hover:bg-gray-800 hover:text-white '
    + 'focus:outline-none focus:ring-4 focus:ring-gray-800 aria-pressed:bg-primary-700 '
    + 'aria-pressed:border-primary-700 aria-pressed:text-white',
  count: 'inline-flex items-center justify-center min-w-5 h-5 px-1.5 text-xs font-medium rounded-full '
    + 'bg-gray-800 text-gray-300',
  input: 'block w-full p-2.5 ps-10 text-sm text-gray-900 bg-gray-50 border border-gray-300 rounded-lg '
    + 'focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-900 dark:border-gray-700 '
    + 'dark:placeholder-gray-500 dark:text-white dark:focus:ring-primary-500 dark:focus:border-primary-500',
  badge: 'inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-medium rounded-md bg-gray-100 '
    + 'text-gray-800 dark:bg-gray-800 dark:text-gray-300',
  // a badge over a picture
  overlay: 'inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-white bg-gray-950/85 '
    + 'border border-gray-700 rounded-lg',
  // the carousel's round controls and dots (Flowbite carousel)
  control: 'inline-flex items-center justify-center w-10 h-10 text-gray-300 bg-gray-900 border '
    + 'border-gray-700 rounded-full hover:bg-gray-800 hover:text-white focus:outline-none focus:ring-4 '
    + 'focus:ring-gray-800',
  dot: 'h-2.5 w-2.5 rounded-full bg-gray-700 hover:bg-gray-500 aria-[current=true]:w-6 '
    + 'aria-[current=true]:bg-primary-400 transition-all',
  // the honest note: a Pro alert in the warning pair
  note: 'flex items-start gap-2 p-3 text-sm text-yellow-800 border border-yellow-300 rounded-lg '
    + 'bg-yellow-50 dark:bg-gray-900 dark:text-yellow-300 dark:border-yellow-800',
  // the language switcher: Pro's button group of links, the page's own language from aria-current
  language: 'px-2.5 py-1.5 text-xs font-medium uppercase text-gray-300 bg-gray-900 border border-gray-700 '
    + 'hover:bg-gray-800 hover:text-white focus:z-10 focus:ring-2 focus:ring-gray-700 '
    + 'aria-[current=true]:bg-gray-700 aria-[current=true]:text-white',
  iconButton: 'inline-flex items-center justify-center p-2 text-gray-400 rounded-lg hover:bg-gray-800 '
    + 'hover:text-white focus:outline-none focus:ring-2 focus:ring-gray-700 aria-pressed:text-white '
    + 'aria-pressed:bg-gray-800',
};
const svg = (d, cls = 'w-4 h-4') => `<svg class="${cls}" aria-hidden="true" viewBox="0 0 24 24" `
  + `fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
export const icon = {
  play: '<svg class="w-4 h-4" aria-hidden="true" viewBox="0 0 24 24" fill="currentColor"><path d="M8 '
    + '5.14v13.72a1 1 0 0 0 1.52.85l10.6-6.86a1 1 0 0 0 0-1.7L9.52 4.29A1 1 0 0 0 8 5.14Z"/></svg>',
  prev: svg('<path d="m15 18-6-6 6-6"/>', 'w-5 h-5'),
  next: svg('<path d="m9 18 6-6-6-6"/>', 'w-5 h-5'),
  search: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>', 'w-4 h-4 text-gray-500'),
  close: svg('<path d="M18 6 6 18M6 6l12 12"/>', 'w-5 h-5'),
  expand: svg('<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>', 'w-5 h-5'),
  link: svg('<path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1 1"/><path d="M14 11a5 5 0 0 '
    + '0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1-1"/>', 'w-5 h-5'),
  page: svg('<path d="M14 3h7v7"/><path d="M10 14 21 3"/><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 '
    + '1-2-2V5a2 2 0 0 1 2-2h5"/>', 'w-5 h-5'),
  info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v4h1"/>', 'w-4 h-4 mt-0.5 shrink-0'),
};

// a cut's chapters, grouped by act, each a link to its moment on the cut's own page
export function chapterList(cut, R) {
  const acts = [];
  cut.chapters.forEach((ch, i) => {
    if (!acts.length || acts[acts.length - 1].act !== ch.act) acts.push({ act: ch.act, items: [] });
    acts[acts.length - 1].items.push({ ...ch, i });
  });
  return acts.map((a) => `<li class="pt-3 first:pt-0"><p class="px-2 pb-1 ${ui.eyebrow} text-gray-500">`
    + `${esc(a.act)}</p><ol>${a.items.map((ch) => `<li><a href="${R}${cut.page}?t=${ch.t}#watch" `
    + `data-t="${ch.t}" data-i="${ch.i}" class="grid grid-cols-[3.25rem_1fr] gap-1 px-2 py-1.5 rounded-lg `
    + 'text-sm text-gray-300 hover:bg-gray-800 hover:text-white aria-[current=true]:bg-gray-800 '
    + 'aria-[current=true]:text-white"><span class="font-mono text-gray-500">'
    + `${clock(ch.t)}</span><span>${esc(ch.title)}</span></a></li>`).join('')}</ol></li>`).join('');
}

// the use cases a chapter shows, each a chip to its page on majordomus.dev
export function useCaseChips(ids, useCases) {
  return ids.filter((id) => useCases[id]).map((id) => `<a href="${esc(useCases[id].url)}" `
    + `class="${ui.chip}" title="${esc(useCases[id].summary)}">${esc(useCases[id].title)}</a>`).join('');
}

// the formats a cut really has, as badges (a missing one is not drawn: the note says so)
export function formatBadges(c, formats) {
  return formats.filter((f) => c.formats[f.id])
    .map((f) => `<span class="${ui.overlay}">${esc(f.label)}</span>`).join('');
}

// the language a cut's own words are in, when it is not the page's (a cut not rendered in the
// page's language yet): its chapters, narration and captions say so to a reader and a voice
export const langAttr = (c, t) => (c.lang && c.lang !== t.lang ? ` lang="${esc(c.lang)}"` : '');

// one slide of the stories carousel (a Flowbite carousel item): the story's share picture, which
// becomes its muted preview when the viewer allows motion, its title, why, length and play
export function storySlide(c, R, i, n, useCases, t) {
  const shown = (c.use_cases || []).filter((id) => useCases[id]);
  return `<article data-carousel-item class="hidden duration-700 ease-in-out motion-reduce:duration-0" id="slide-${esc(c.id)}" `
    + `aria-roledescription="slide" aria-label="${esc(t('slide.label', { i: i + 1, n, title: c.title }))}" data-cut="${esc(c.id)}">
          <div class="grid h-full overflow-hidden grid-rows-[auto_minmax(0,1fr)] md:grid-rows-1 md:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] ${ui.card}">
            <a draggable="false" href="${R}${esc(c.page)}" data-open="${esc(c.id)}" class="relative block overflow-hidden bg-gray-950 aspect-[40/21] md:aspect-auto md:h-full" aria-label="${esc(t('slide.play', { title: c.title }))}">
              <img draggable="false" class="absolute inset-0 object-cover w-full h-full" src="${R}${esc(c.og)}" alt="${esc(t('slide.alt', { title: c.title }))}" width="1200" height="630"${i ? ' loading="lazy"' : ''}>
              <video class="absolute inset-0 hidden object-contain w-full h-full bg-gray-950" data-preview muted playsinline loop preload="none" aria-hidden="true" tabindex="-1"></video>
              <span class="absolute bottom-3 left-3 ${ui.overlay}" data-length>${icon.play} ${esc(length(c.duration))}</span>
            </a>
            <div class="flex flex-col min-w-0 min-h-0 p-5 md:p-8">
              <a draggable="false" href="${esc(c.category_url)}" class="mb-2 ${ui.eyebrow} text-primary-400 hover:underline truncate" title="${esc(t('slide.category_title'))}">${t.html('slide.eyebrow', { i: i + 1, n, uses: shown.length })}</a>
              <h3 class="mb-2 font-serif text-2xl leading-tight md:text-3xl text-gray-900 dark:text-white"><a draggable="false" href="${R}${esc(c.page)}" class="hover:text-primary-300">${esc(c.title)}</a></h3>
              <p class="mb-4 text-sm text-gray-500 md:text-base dark:text-gray-400 line-clamp-2 md:line-clamp-3">${esc(c.summary)}</p>
              <p class="hidden mb-5 text-sm text-gray-500 lg:block">${t.html('slide.meta', { length: length(c.duration), chapters: c.chapters.length })}</p>
              <div class="flex flex-wrap gap-2 mt-auto">
                <a draggable="false" href="${R}${esc(c.page)}" data-open="${esc(c.id)}" class="px-4 py-2 text-sm ${ui.primary}">${icon.play} ${t.html('slide.play_story')}</a>
                <a draggable="false" href="${R}${esc(c.page)}" class="px-4 py-2 text-sm ${ui.secondary}">${t.html('slide.page')}</a>
              </div>
            </div>
          </div>
        </article>`;
}

// the carousel's dots: one per slide, Flowbite's data-carousel-slide-to
export function slideDots(cuts, t) {
  return cuts.map((c, i) => `<button type="button" class="${ui.dot}" data-carousel-slide-to="${i}" `
    + `aria-current="${i === 0}" aria-label="${esc(t('dot.label', { i: i + 1, title: c.title }))}"></button>`).join('');
}

// the browser's filter chips: All, then each category that has a story, with its count
export function filterChips(categories, stories, t) {
  const n = (id) => stories.filter((s) => !id || s.category === id).length;
  return [{ id: '', title: t('browser.all') }, ...categories.filter((c) => n(c.id))].map((c) => `<button `
    + `type="button" class="${ui.filter}" data-category="${esc(c.id)}" aria-pressed="${!c.id}">`
    + `${esc(c.title)}<span class="${ui.count}">${n(c.id)}</span></button>`).join('');
}

// the use cases a tile lists before it links to the rest on majordomus.dev
export const TILE_USE_CASES = 3;

// a gallery tile: the story's share picture, its muted preview on hover, the formats it really
// has, its length, title, why and use cases; the link is its own route
export function galleryTile(c, R, useCases, formats, t) {
  const shown = (c.use_cases || []).filter((id) => useCases[id]);
  return `<li data-tile="${esc(c.id)}" data-category="${esc(c.category)}" data-search="${esc(searchText(c, useCases))}">
          <article class="flex flex-col h-full overflow-hidden group ${ui.card} hover:border-gray-600 transition-colors">
            <a href="${R}${esc(c.page)}" data-open="${esc(c.id)}" class="relative block overflow-hidden bg-gray-950 aspect-[40/21]" aria-label="${esc(t('slide.play', { title: c.title }))}">
              <img class="absolute inset-0 object-cover w-full h-full transition-transform duration-500 group-hover:scale-[1.03]" src="${R}${esc(c.og)}" alt="${esc(t('slide.alt', { title: c.title }))}" width="1200" height="630" loading="lazy">
              <video class="absolute inset-0 hidden object-contain w-full h-full bg-gray-950" data-preview muted playsinline loop preload="none" aria-hidden="true" tabindex="-1"></video>
              <span class="absolute flex gap-1 top-3 right-3">${formatBadges(c, formats)}</span>
              <span class="absolute bottom-3 left-3 ${ui.overlay}" data-length>${icon.play} ${esc(length(c.duration))}</span>
            </a>
            <div class="flex flex-col flex-1 p-5">
              <a href="${esc(c.category_url)}" class="mb-2 ${ui.eyebrow} text-primary-400 hover:underline" title="${esc(t('slide.category_title'))}">${t.html('tile.eyebrow', { uses: shown.length })}</a>
              <h3 class="mb-2 text-lg font-semibold tracking-tight text-gray-900 dark:text-white"><a href="${R}${esc(c.page)}" data-open="${esc(c.id)}" class="hover:text-primary-300">${esc(c.title)}</a></h3>
              <p class="mb-4 text-sm text-gray-500 dark:text-gray-400 line-clamp-2">${esc(c.summary)}</p>
              <ul class="flex flex-wrap gap-1.5 mt-auto" aria-label="${esc(t('tile.use_cases'))}">
                ${shown.slice(0, TILE_USE_CASES).map((id) => `<li><a class="${ui.chip}" href="${esc(useCases[id].url)}" title="${esc(useCases[id].summary)}">${esc(useCases[id].title)}</a></li>`).join('')}${shown.length > TILE_USE_CASES ? `<li><a class="${ui.chip}" href="${esc(c.category_url)}">${t.html('tile.more', { n: shown.length - TILE_USE_CASES })}</a></li>` : ''}
              </ul>
            </div>
          </article>
        </li>`;
}

// one category of use cases: its story, and for each use case the moment the film shows it
export function categoryCard(c, R, film, t) {
  return `<div class="p-5 ${ui.card}">
          <div class="flex items-start justify-between gap-3 mb-1">
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white"><a class="hover:text-primary-300" href="${esc(c.url)}">${esc(c.title)}</a></h3>
            ${c.story ? `<a href="${R}${esc(c.story_page)}" data-open="${esc(c.story)}" class="shrink-0 px-3 py-1.5 text-xs ${ui.primary}">${icon.play} ${t.html('category.story')}</a>` : ''}
          </div>
          <p class="mb-3 text-sm text-gray-500 dark:text-gray-400">${esc(c.summary)}</p>
          <ul class="space-y-2 text-sm">
            ${c.use_cases.map((u) => `<li class="flex items-baseline justify-between gap-3"><a class="${ui.link}" href="${esc(u.url)}">${esc(u.title)}</a>${u.seen[0] ? `<a class="shrink-0 font-mono text-xs text-primary-400 hover:underline" href="${R}${film.page}?t=${u.seen[0].t}#watch" data-seek="film" data-t="${u.seen[0].t}" title="${esc(t('category.seen', { title: u.seen[0].title }))}">${clock(u.seen[0].t)}</a>` : ''}</li>`).join('\n            ')}
          </ul>
        </div>`;
}

export function statCard(value, label, href) {
  return `<div class="p-5 ${ui.card}">
          <dt class="mb-1 text-sm text-gray-500 dark:text-gray-400">${esc(label)}</dt>
          <dd class="text-2xl font-semibold tracking-tight text-gray-900 sm:text-3xl dark:text-white">${href ? `<a class="hover:text-primary-300" href="${esc(href)}">${esc(value)}</a>` : esc(value)}</dd>
        </div>`;
}

export function formatButtons(formats, t) {
  return [{ id: 'auto', label: t('format.auto') }, ...formats].map((f, i, all) => `<button type="button" `
    + `data-format="${f.id}" class="${ui.toggle} ${i === 0 ? 'rounded-s-lg' : 'border-s-0'}`
    + `${i === all.length - 1 ? ' rounded-e-lg' : ''}" aria-pressed="${f.id === 'auto'}">${esc(f.label)}</button>`)
    .join('');
}

// the cuts the main player switches between: the film and the short (the stories have the gallery)
export function cutButtons(cuts, current, t) {
  return cuts.map((c, i, all) => `<button type="button" data-play="${esc(c.id)}" class="${ui.toggle} `
    + `${i === 0 ? 'rounded-s-lg' : 'border-s-0'}${i === all.length - 1 ? ' rounded-e-lg' : ''}" `
    + `aria-pressed="${c.id === current}">${t.html('player.cut_button', { title: c.title, length: length(c.duration) })}</button>`).join('');
}

// The language switcher (a Pro button group of links): every language the site has, each link the
// counterpart of this route in that language, labelled by its code and named in its own words;
// site/lang.js carries the address (?t=, ?play=, ?category=, ?q=, #) across and remembers the choice.
// langs: [{ id, href, name, read }] (href relative to the page)
export function languageSwitch(langs, current, t) {
  return `<div class="inline-flex rounded-lg shrink-0" role="group" aria-label="${esc(t('lang.switch'))}">${langs.map((l, i, all) => `<a `
    + `href="${esc(l.href)}" hreflang="${esc(l.id)}" lang="${esc(l.id)}" data-lang="${esc(l.id)}" `
    + `class="${ui.language} ${i === 0 ? 'rounded-s-lg' : 'border-s-0'}${i === all.length - 1 ? ' rounded-e-lg' : ''}" `
    + `title="${esc(l.read)}" aria-current="${l.id === current}"><span class="sr-only">${esc(l.name)}</span>`
    + `<span aria-hidden="true">${esc(l.id)}</span></a>`).join('')}</div>`;
}
