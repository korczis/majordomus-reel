// The reel's page, driven by its own data (#reel-data, the object data/reel.json holds). Four
// parts share one address, so every state is a link that a reload restores:
//
//   the player   the route's cut in the format the screen calls for (formats.json media queries),
//                the nearest rendered one when that format is not rendered yet, with a note
//                saying so; ?cut= ?format= ?t=
//   the carousel the stories (Flowbite carousel): arrows, dots, swipe and keys; it advances and
//                plays muted previews only when the viewer allows motion
//   the browser  filter chips per use-case category and a search; ?category= ?q=
//   the viewer   a story opened over the page (Flowbite modal): Escape closes it, F or the button
//                fills the viewport; ?play= ?vt= ?full=1
//
// Every word it writes is the page language's message (#reel-messages: site/messages.json or
// lang/<id>.json `site`), and a cut not rendered in that language marks its chapters, narration
// and captions with the language they are in (project.reel-bilingual); site/lang.js chooses the
// language before the page draws.
import { chapterList, useCaseChips, clock, pickFormat, messenger } from './view.mjs';

const data = JSON.parse(document.getElementById('reel-data').textContent);
const M = JSON.parse(document.getElementById('reel-messages').textContent);
const t = messenger(M.messages, M.locale);
const $ = (id) => document.getElementById(id);
const nameOf = (id) => data.languages.find((l) => l.id === id)?.name || id;
// the words of a cut that are in its own language (its render's), marked when that is not the page's
const speak = (el, cut) => {
  if (cut.lang && cut.lang !== data.lang) el.lang = cut.lang; else el.removeAttribute('lang');
};
const track = (el, cut) => {
  el.src = at(cut.captions);
  el.srclang = cut.lang;
  el.label = nameOf(cut.lang);
};
const cuts = Object.fromEntries(data.cuts.map((c) => [c.id, c]));
// every path in the data is relative to the site's root; a cut's own page sits one level down,
// resolved once against the page's own address so that replaceState never moves the base
const ROOT = new URL(document.body.dataset.root || './', location.href);
const at = (path) => new URL(path, ROOT).href;
const PAGE_CUT = cuts[document.body.dataset.cut] ? document.body.dataset.cut : 'film';
const useCases = Object.fromEntries(data.categories.flatMap((c) => c.use_cases.map((u) => [u.id, u])));
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const motion = () => !reduced.matches;
// the format this screen calls for: the first whose media query matches
const wanted = () => (data.formats.find((f) => matchMedia(f.media).matches)
  || data.formats[data.formats.length - 1]).id;

// ---- the address: one writer for every part ---------------------------------------------------
const params = new URLSearchParams(location.search);
const commit = (updates) => {
  const p = new URLSearchParams(location.search);
  for (const [k, v] of Object.entries(updates)) {
    if (v == null || v === '' || v === false) p.delete(k); else p.set(k, String(v));
  }
  const q = p.toString();
  history.replaceState(null, '', `${location.pathname}${q ? `?${q}` : ''}${location.hash}`);
};
const note = (el, text) => {
  el.textContent = text;
  el.classList.toggle('hidden', !text);
};

// ---- the player -------------------------------------------------------------------------------
const video = $('player');
const stage = $('stage');
const chaptersEl = $('chapters');
const state = {
  cut: cuts[params.get('cut')] ? params.get('cut') : PAGE_CUT,
  choice: data.formats.some((f) => f.id === params.get('format')) ? params.get('format') : 'auto',
  format: null,
  chapter: -1,
};
const writeUrl = (time) => commit({ cut: state.cut !== PAGE_CUT ? state.cut : null,
  format: state.choice !== 'auto' ? state.choice : null, t: time > 1 ? Math.floor(time) : null });
const renderChapters = (cut) => {
  chaptersEl.innerHTML = chapterList(cut, ROOT.href);
  speak(chaptersEl, cut);
  $('chapters-title').textContent = cut.kind === 'film' ? t('player.chapters') : t('player.chapters_of', { title: cut.title });
  $('chapters-count').textContent = t('player.chapters_count', { n: cut.chapters.length, clock: clock(cut.duration) });
};
const showChapter = (i) => {
  const cut = cuts[state.cut];
  if (i === state.chapter || !cut.chapters[i]) return;
  state.chapter = i;
  const ch = cut.chapters[i];
  chaptersEl.querySelectorAll('a[data-i]').forEach((a) => {
    const on = Number(a.dataset.i) === i;
    a.setAttribute('aria-current', String(on));
    // keep the current chapter in view inside the list, without moving the page
    if (on && !document.body.classList.contains('theater')) {
      const box = chaptersEl.getBoundingClientRect();
      const r = a.getBoundingClientRect();
      if (r.top < box.top || r.bottom > box.bottom) chaptersEl.scrollTop += r.top - box.top - box.height / 3;
    }
  });
  ['now-act', 'now-title', 'now-narration'].forEach((id) => speak($(id), cut));
  $('now-act').textContent = `${cut.title} · ${ch.act}`;
  $('now-title').textContent = ch.title;
  $('now-narration').textContent = ch.narration;
  $('now-use-cases').innerHTML = useCaseChips(ch.use_cases, useCases);
};
const load = (cutId, { t: time = null, play = false } = {}) => {
  const cut = cuts[cutId];
  const pick = pickFormat(cut, state.choice === 'auto' ? wanted() : state.choice, data.formats, t);
  const f = data.formats.find((x) => x.id === pick.id);
  const same = state.cut === cutId && state.format === pick.id && video.currentSrc;
  state.cut = cutId;
  state.format = pick.id;
  stage.dataset.format = pick.id;
  stage.style.setProperty('--ar', `${f.width} / ${f.height}`);
  note($('stage-note'), pick.note);
  document.querySelectorAll('[data-format]').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.format === state.choice));
    b.disabled = b.dataset.format !== 'auto' && !cut.formats[b.dataset.format];
    b.title = b.disabled ? t('player.no_format', { title: cut.title,
      format: b.textContent.toLocaleLowerCase(t.locale) }) : '';
  });
  document.querySelectorAll('#watch [data-play]').forEach((b) => b.setAttribute('aria-pressed',
    String(b.dataset.play === cutId)));
  if (!same) {
    const wasPlaying = play || !video.paused;
    video.querySelectorAll('source').forEach((s) => s.remove());
    video.poster = at(cut.formats[pick.id].poster);
    video.src = at(cut.formats[pick.id].video);
    track(video.querySelector('track'), cut);
    video.addEventListener('loadedmetadata', () => {
      if (time) video.currentTime = time;
      if (wasPlaying) video.play().catch(() => {});
    }, { once: true });
    video.load();
    renderChapters(cut);
    state.chapter = -1;
  } else if (time != null) {
    video.currentTime = time;
  }
  showChapter(Math.max(0, cut.chapters.findLastIndex((c) => c.t <= (time || 0))));
  writeUrl(time || 0);
};
// the screen changed shape (a phone turned, a window resized): the format follows, the moment stays
data.formats.forEach((f) => matchMedia(f.media).addEventListener('change', () => {
  if (state.choice !== 'auto') return;
  const next = pickFormat(cuts[state.cut], wanted(), data.formats, t).id;
  if (next !== state.format) load(state.cut, { t: video.currentTime });
}));
video.addEventListener('timeupdate', () => {
  const i = cuts[state.cut].chapters.findLastIndex((c) => video.currentTime >= c.t);
  if (i !== state.chapter) {
    showChapter(i);
    writeUrl(video.currentTime);
  }
});
video.addEventListener('pause', () => writeUrl(video.currentTime));
const theater = (on) => {
  document.body.classList.toggle('theater', on);
  $('theater').setAttribute('aria-pressed', String(on));
};
$('theater').addEventListener('click', () => theater(!document.body.classList.contains('theater')));
$('theater-close').addEventListener('click', () => theater(false));
const flash = (el, text) => {
  const was = el.dataset.label || el.textContent;
  el.dataset.label = was;
  el.textContent = text;
  setTimeout(() => { el.textContent = was; }, 1500);
};
$('share').addEventListener('click', () => {
  writeUrl(video.currentTime);
  const p = new URLSearchParams();
  if (state.choice !== 'auto') p.set('format', state.choice);
  if (video.currentTime > 1) p.set('t', String(Math.floor(video.currentTime)));
  navigator.clipboard?.writeText(`${at(cuts[state.cut].page)}${p.toString() ? `?${p}` : ''}`);
  flash($('share'), t('player.copied'));
});

// ---- previews: a muted loop of a cut in a tile or a slide, only where motion is allowed --------
// a preview plays the cut's format nearest to the box's shape, and only a landscape one: a portrait
// cut in a landscape box would be a sliver, so its share picture stays (three of its frames)
const aspectOf = (id) => { const f = data.formats.find((x) => x.id === id); return f.width / f.height; };
const previewFormat = (cut, box) => Object.keys(cut.formats)
  .sort((a, b) => Math.abs(Math.log(aspectOf(a) / box)) - Math.abs(Math.log(aspectOf(b) / box)))[0];
const previewOn = (holder, id) => {
  const v = holder.querySelector('video[data-preview]');
  if (!v || !motion() || navigator.connection?.saveData) return;
  const cut = cuts[id];
  const box = holder.querySelector('[data-open]') || holder;
  const r = box.getBoundingClientRect();
  const fid = previewFormat(cut, r.width / Math.max(1, r.height));
  if (aspectOf(fid) < 1 && r.width > r.height) return;
  const fmt = cut.formats[fid];
  if (!v.src) {
    v.src = at(fmt.video);
    v.addEventListener('loadedmetadata', () => { v.currentTime = fmt.poster_t || 0; }, { once: true });
  }
  v.classList.remove('hidden');
  v.play().catch(() => {});
};
const previewOff = (holder) => {
  const v = holder.querySelector('video[data-preview]');
  if (!v) return;
  v.pause();
  v.classList.add('hidden');
};

// ---- the carousel (Flowbite carousel) ---------------------------------------------------------
const carEl = $('carousel');
const slides = [...carEl.querySelectorAll('[data-carousel-item]')];
let carousel = null;
let carouselSeen = false;
const position = () => carousel?.getActiveItem().position ?? 0;
// a move by hand gives the new slide its full time before the carousel moves on
let restartAutoplay = () => {};
const onSlide = () => {
  restartAutoplay();
  const i = position();
  $('carousel-pos').textContent = `${i + 1} / ${slides.length}`;
  slides.forEach((s, k) => {
    s.setAttribute('aria-hidden', String(k !== i));
    s.inert = k !== i;
    if (k === i && carouselSeen) previewOn(s, s.dataset.cut); else previewOff(s);
  });
};
if (slides.length && window.Carousel) {
  carousel = new window.Carousel(carEl, slides.map((el, i) => ({ position: i, el })), {
    defaultPosition: Math.min(slides.length - 1, Number(carEl.dataset.start || 0)),
    indicators: {
      items: [...document.querySelectorAll('#carousel-dots [data-carousel-slide-to]')]
        .map((el, i) => ({ position: i, el })),
      activeClasses: 'is-active', inactiveClasses: 'is-idle',
    },
    onChange: onSlide,
  }, { id: 'stories-carousel', override: true });
  onSlide();
  // it advances by itself only for a viewer who allows motion, and stops while one reads it
  // (its own timer: Flowbite's cycle() restarts itself on every slideTo, even while paused)
  let held = false;
  let timer = null;
  const autoplay = () => {
    clearInterval(timer);
    timer = motion() && carouselSeen && !held && !document.hidden
      ? setInterval(() => carousel.next(), 9000) : null;
  };
  restartAutoplay = autoplay;
  const hold = (on) => { held = on; autoplay(); };
  carEl.addEventListener('pointerenter', () => hold(true));
  carEl.addEventListener('pointerleave', () => hold(false));
  carEl.addEventListener('focusin', () => hold(true));
  carEl.addEventListener('focusout', () => hold(false));
  document.addEventListener('visibilitychange', autoplay);
  reduced.addEventListener('change', () => { autoplay(); onSlide(); });
  new IntersectionObserver(([e]) => {
    carouselSeen = e.isIntersecting;
    autoplay();
    onSlide();
  }, { threshold: 0.4 }).observe(carEl);
  document.querySelectorAll('[data-carousel-prev]').forEach((b) => b.addEventListener('click', () => carousel.prev()));
  document.querySelectorAll('[data-carousel-next]').forEach((b) => b.addEventListener('click', () => carousel.next()));
  carEl.addEventListener('keydown', (e) => {
    const go = { ArrowLeft: () => carousel.prev(), ArrowRight: () => carousel.next(),
      Home: () => carousel.slideTo(0), End: () => carousel.slideTo(slides.length - 1) }[e.key];
    if (!go) return;
    e.preventDefault();
    go();
  });
  // a horizontal swipe moves it; a vertical one scrolls the page (touch-action: pan-y)
  let down = null;
  carEl.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
  carEl.addEventListener('pointerup', (e) => {
    if (!down) return;
    const dx = e.clientX - down.x;
    const dy = e.clientY - down.y;
    down = null;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      carEl.dataset.swiped = '1';
      if (dx < 0) carousel.next(); else carousel.prev();
      setTimeout(() => { delete carEl.dataset.swiped; }, 400);
    }
  });
  // a swipe that ends on a link is not a click on it
  carEl.addEventListener('click', (e) => {
    if (carEl.dataset.swiped) {
      delete carEl.dataset.swiped;
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  }, true);
}

// ---- the browser: categories and a search, kept in the address --------------------------------
const tiles = [...document.querySelectorAll('#gallery [data-tile]')];
const search = $('q');
const filter = {
  category: [...document.querySelectorAll('#filters [data-category]')].some((b) => b.dataset.category
    && b.dataset.category === params.get('category')) ? params.get('category') : '',
  q: (params.get('q') || '').trim(),
};
const applyFilter = () => {
  const terms = filter.q.toLowerCase().split(/\s+/).filter(Boolean);
  let shown = 0;
  tiles.forEach((li) => {
    const on = (!filter.category || li.dataset.category === filter.category)
      && terms.every((term) => li.dataset.search.includes(term));
    li.hidden = !on;
    if (on) shown++;
  });
  document.querySelectorAll('#filters [data-category]').forEach((b) => b.setAttribute('aria-pressed',
    String(b.dataset.category === filter.category)));
  // on a narrow screen the chips scroll in their row: keep the pressed one in sight
  const row = $('filters');
  const on = row.querySelector('[aria-pressed="true"]');
  if (on && row.scrollWidth > row.clientWidth) {
    const left = on.offsetLeft - row.offsetLeft;
    if (left < row.scrollLeft || left + on.offsetWidth > row.scrollLeft + row.clientWidth) row.scrollLeft = Math.max(0, left - 16);
  }
  $('shown-count').textContent = String(shown);
  $('gallery-empty').classList.toggle('hidden', shown > 0);
  $('filters-reset').classList.toggle('hidden', !filter.category && !filter.q);
  if (search.value !== filter.q && document.activeElement !== search) search.value = filter.q;
  commit({ category: filter.category, q: filter.q });
};
let typing = null;
search.addEventListener('input', () => {
  clearTimeout(typing);
  typing = setTimeout(() => { filter.q = search.value.trim(); applyFilter(); }, 120);
});
const reset = () => { filter.category = ''; filter.q = ''; search.value = ''; applyFilter(); };
$('filters-reset').addEventListener('click', reset);
document.querySelectorAll('[data-reset]').forEach((b) => b.addEventListener('click', reset));
document.querySelectorAll('#filters [data-category]').forEach((b) => b.addEventListener('click', () => {
  filter.category = b.dataset.category === filter.category ? '' : b.dataset.category;
  applyFilter();
}));
search.value = filter.q;
applyFilter();
// a tile previews its cut while a pointer rests on it
tiles.forEach((li) => {
  const media = li.querySelector('[data-open]');
  media.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') previewOn(media, li.dataset.tile); });
  media.addEventListener('pointerleave', () => previewOff(media));
});

// ---- the viewer: a story over the page (Flowbite modal) ---------------------------------------
const viewerEl = $('viewer');
const vplayer = $('viewer-player');
const full = (on) => {
  viewerEl.toggleAttribute('data-full', on);
  $('viewer-full').setAttribute('aria-pressed', String(on));
  if (viewerEl.dataset.cut) commit({ full: on ? 1 : null });
};
const viewer = window.Modal ? new window.Modal(viewerEl, {
  placement: 'center', backdrop: 'dynamic', closable: true,
  backdropClasses: 'bg-gray-950/80 fixed inset-0 z-40',
  onHide: () => {
    vplayer.pause();
    full(false);
    delete viewerEl.dataset.cut;
    commit({ play: null, vt: null, full: null });
  },
}, { id: 'viewer', override: true }) : null;
const openStory = (id, { t: time = 0, play = true } = {}) => {
  const cut = cuts[id];
  if (!cut || !viewer) return false;
  const pick = pickFormat(cut, wanted(), data.formats, t);
  const fmt = cut.formats[pick.id];
  viewerEl.dataset.cut = id;
  viewerEl.dataset.format = pick.id;
  $('viewer-title').textContent = cut.title;
  const catLink = $('viewer-category');
  catLink.textContent = cut.category ? `majordomus.dev/use-cases/${cut.category}` : t('viewer.cut', { title: cut.title });
  catLink.href = cut.category_url || 'https://majordomus.dev/use-cases/';
  $('viewer-summary').textContent = t('viewer.summary', { summary: cut.summary,
    chapters: cut.chapters.length, clock: clock(cut.duration) });
  $('viewer-use-cases').innerHTML = useCaseChips(cut.use_cases || [], useCases);
  $('viewer-page').href = at(cut.page);
  note($('viewer-note'), pick.note);
  vplayer.poster = at(fmt.poster);
  vplayer.src = at(fmt.video);
  track(vplayer.querySelector('track'), cut);
  vplayer.addEventListener('loadedmetadata', () => {
    if (time) vplayer.currentTime = time;
    if (play) vplayer.play().catch(() => {});
  }, { once: true });
  vplayer.load();
  video.pause();
  viewer.show();
  $('viewer-close').focus({ preventScroll: true });
  commit({ play: id, vt: time > 1 ? Math.floor(time) : null });
  return true;
};
vplayer.addEventListener('pause', () => {
  if (viewerEl.dataset.cut) commit({ vt: vplayer.currentTime > 1 ? Math.floor(vplayer.currentTime) : null });
});
$('viewer-close').addEventListener('click', () => viewer?.hide());
$('viewer-full').addEventListener('click', () => full(!viewerEl.hasAttribute('data-full')));
$('viewer-copy').addEventListener('click', () => {
  const moment = vplayer.currentTime > 1 ? `?t=${Math.floor(vplayer.currentTime)}` : '';
  navigator.clipboard?.writeText(`${at(cuts[viewerEl.dataset.cut].page)}${moment}`);
  flash($('viewer-copy').querySelector('.sr-only'), t('player.copied'));
});

// ---- clicks and keys --------------------------------------------------------------------------
document.addEventListener('click', (e) => {
  // a modified click opens the link (the cut's own route) the way the viewer asked
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const chapter = e.target.closest('#chapters a[data-t]');
  const open = e.target.closest('[data-open]');
  const play = e.target.closest('[data-play]');
  const seek = e.target.closest('[data-seek]');
  const format = e.target.closest('[data-format]');
  const copy = e.target.closest('[data-copy]');
  if (chapter) {
    e.preventDefault();
    video.currentTime = Number(chapter.dataset.t);
    video.play().catch(() => {});
  } else if (open) {
    if (openStory(open.dataset.open)) e.preventDefault();
  } else if (play || seek) {
    e.preventDefault();
    const el = play || seek;
    load(el.dataset.play || el.dataset.seek, { t: Number(el.dataset.t || 0), play: true });
    $('watch').scrollIntoView({ behavior: motion() ? 'smooth' : 'auto' });
  } else if (format) {
    state.choice = format.dataset.format;
    load(state.cut, { t: video.currentTime });
  } else if (copy) {
    navigator.clipboard?.writeText($(copy.dataset.copy).textContent.trim());
    flash(copy, t('install.copied'));
  }
});
document.addEventListener('keydown', (e) => {
  if (e.target.closest('input, textarea, select') || e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (viewerEl.dataset.cut) {
    // the viewer is open: Escape is the modal's own; F fills the viewport
    if (k !== 'f') return;
    full(!viewerEl.hasAttribute('data-full'));
    e.preventDefault();
    return;
  }
  const cut = cuts[state.cut];
  if (k === 'escape' && document.body.classList.contains('theater')) theater(false);
  else if (k === 't') theater(!document.body.classList.contains('theater'));
  else if (k === 'f') (document.fullscreenElement ? document.exitFullscreen() : stage.requestFullscreen?.());
  else if (k === 'c') {
    const tr = video.textTracks[0];
    if (tr) tr.mode = tr.mode === 'showing' ? 'hidden' : 'showing';
  } else if (k === 'j' || k === 'k') {
    // from the chapter under the playhead, not the last one shown (a seek may still be settling)
    const here = Math.max(0, cut.chapters.findLastIndex((c) => video.currentTime + 0.5 >= c.t));
    const i = Math.max(0, Math.min(cut.chapters.length - 1, here + (k === 'k' ? 1 : -1)));
    video.currentTime = cut.chapters[i].t;
  } else return;
  e.preventDefault();
});

// ---- start: the route's cut, then whatever the address asks for --------------------------------
load(state.cut, { t: params.has('t') ? Number(params.get('t')) : null });
if (cuts[params.get('play')]) {
  openStory(params.get('play'), { t: Number(params.get('vt') || 0), play: false });
  if (params.get('full') === '1') full(true);
}
document.documentElement.dataset.ready = '1';
