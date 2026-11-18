// The page's language (project.reel-bilingual), decided before the page draws: a classic script in
// the head, so a viewer sent to another language never sees this one first. It reads nothing but
// the page itself: <html lang> is the page's language, and each <link rel="alternate" hreflang>
// (with data-route, its address relative to this page) is this route in another language, the
// same list search engines read.
//
//   ?lang=<id>          the address asks: that language, remembered from then on
//   a stored choice     an explicit click on the switcher (a[data-lang]), respected from then on:
//                       a route in another language is replaced by its counterpart in this one
//   neither             the first of navigator.languages the site has (cs-CZ -> cs), but only on
//                       the x-default entry (the route whose canonical is its hreflang x-default:
//                       the English routes). An explicit language route (/cs/, /cs/<cut>/) is
//                       what its link promised and is never moved by the browser's language, so a
//                       Czech link shared to an English-speaking browser stays Czech.
//
// When the choice is not this page's language, location.replace moves to the counterpart (no
// history entry); no match stays put. It never loops: the choice depends only on the address,
// the stored choice and the browser, never on the page it lands on, so the page it sends a viewer
// to chooses itself; a click on the switcher stores before it moves. A crawler stays on the route it
// asked for, so every language's routes are indexed as themselves. The address (?t=, ?play=,
// ?category=, ?q=, #) goes along. Every storage access is guarded: a private window or blocked
// storage only loses the memory, never the page.
(() => {
  const KEY = 'majordomus-reel.lang';
  const here = document.documentElement.lang;
  const routes = {};
  document.querySelectorAll('link[rel="alternate"][hreflang][data-route]').forEach((l) => {
    if (l.hreflang !== 'x-default') routes[l.hreflang] = l.dataset.route;
  });
  const stored = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
  const remember = (id) => { try { localStorage.setItem(KEY, id); } catch { /* not kept */ } };
  // this route in a language, with the address the viewer has now (without ?lang=)
  const target = (id) => {
    const p = new URLSearchParams(location.search);
    p.delete('lang');
    const q = p.toString();
    return `${new URL(routes[id], location.href).pathname}${q ? `?${q}` : ''}${location.hash}`;
  };
  const best = () => {
    for (const pref of navigator.languages || [navigator.language]) {
      const tag = String(pref || '').toLowerCase();
      if (routes[tag]) return tag;
      if (routes[tag.split('-')[0]]) return tag.split('-')[0];
    }
    return null;
  };
  // this page is the x-default entry: its canonical address is the one hreflang x-default names
  const xDefault = document.querySelector('link[rel="alternate"][hreflang="x-default"]')?.href;
  const canonical = document.querySelector('link[rel="canonical"]')?.href;
  const isDefault = Boolean(xDefault && canonical && xDefault === canonical);
  const crawler = /bot|crawl|spider|slurp|facebookexternalhit|embedly|preview|lighthouse/i
    .test(navigator.userAgent || '');
  const asked = new URLSearchParams(location.search).get('lang');
  if (asked && routes[asked]) {
    remember(asked);
    if (asked !== here) location.replace(target(asked));
    else history.replaceState(history.state, '', target(here));
  } else if (!crawler) {
    const want = routes[stored()] ? stored() : isDefault ? best() : null;
    if (want && want !== here) location.replace(target(want));
  }
  // the switcher: a click remembers the choice and carries the address to the counterpart
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[data-lang]');
    if (!a || !routes[a.dataset.lang]) return;
    remember(a.dataset.lang);
    if (a.dataset.lang === here && !e.metaKey && !e.ctrlKey && !e.shiftKey) e.preventDefault();
    else a.href = target(a.dataset.lang);
  });
})();
