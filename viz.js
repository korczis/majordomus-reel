// The reel's graphs and charts, drawn by the owner's stack: Cytoscape for every graph, Apache
// ECharts for every chart, Flowbite component recipes in the site's tokens for the rest. One theme,
// declared here once, so every graph and every chart reads as part of majordomus.dev.
//
// Each builder mounts its library into the scene's *-space element, so a library can never draw
// outside the area the layout gave it, and returns a painter (lt, a, t) that the p5 layer calls
// every frame. Libraries are driven, never animated: animation is off and every frame sets the
// state that time t implies, so any frame renders alone and identically.
(() => {
  const SANS = "-apple-system, 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif";
  const MONO = "ui-monospace, 'SF Mono', Menlo, monospace";
  const SERIF = 'ui-serif, Georgia, Cambria, serif';
  // tokens.yaml, dark roles and the categorical series
  const T = {
    bg: '#030712', raised: '#101828', line: '#1e2939', line2: '#364153', ink: '#ffffff', muted: '#99a1af',
    faint: '#4a5565', brand: '#51a2ff', ok: '#00d492', okFg: '#5ee9b5', bad: '#ff637e', badFg: '#ffa1ad',
    warn: '#ff8904', s1: '#51a2ff', s2: '#ff8904', s3: '#00d492', s4: '#a684ff', s5: '#00d3f2',
  };
  const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(',');
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const easeOut = (x) => 1 - Math.pow(1 - x, 3);
  const lerp = (a, b, u) => a + (b - a) * u;
  const G = () => window.GEN;
  const fade = (lt, at, d = 0.45) => easeOut(clamp((lt - at) / d));

  function mount(env, sel) {
    const space = env.el.querySelector(sel);
    space.style.position = 'relative';
    const el = document.createElement('div');
    Object.assign(el.style, { position: 'absolute', inset: '0' });
    space.appendChild(el);
    const r = el.getBoundingClientRect();
    return { el, r };
  }

  // ---- Cytoscape: one stylesheet for every graph in the film ----
  const CY_STYLE = [
    { selector: 'node', style: {
      shape: 'round-rectangle', 'corner-radius': 4, 'background-color': T.raised, 'border-width': 1.5,
      'border-color': T.line2, label: 'data(label)', color: T.ink, 'font-family': MONO, 'font-size': 26,
      'text-valign': 'center', 'text-halign': 'center', 'text-wrap': 'wrap', 'text-max-width': 320,
      width: 'label', height: 'label', padding: '20px', 'line-height': 1.35, 'min-zoomed-font-size': 0 } },
    { selector: 'node.dot', style: { shape: 'ellipse', width: 14, height: 14, padding: 0, 'border-width': 0,
      'background-color': T.ink } },
    { selector: 'node.hub', style: { shape: 'ellipse', width: 58, height: 58, padding: 0, 'border-width': 3,
      'border-color': T.ink, 'background-color': T.raised, 'text-valign': 'bottom', 'text-margin-y': 14,
      'font-size': 19, color: T.muted, 'font-family': MONO } },
    { selector: 'node.side', style: { 'text-halign': 'right', 'text-valign': 'center', 'text-margin-x': 22 } },
    { selector: 'node.serif', style: { 'font-family': SANS, 'font-weight': 600, 'font-size': 34, color: T.ink } },
    { selector: 'node.caps', style: { 'font-family': MONO, 'font-weight': 500, 'font-size': 18, color: T.muted } },
    { selector: 'node.ghost', style: { 'background-opacity': 0, 'border-width': 0, padding: 0 } },
    { selector: 'node.brand', style: { 'border-color': T.brand } },
    { selector: 'node.ok', style: { 'border-color': T.ok, color: T.okFg } },
    { selector: 'node.bad', style: { 'border-color': T.bad, color: T.badFg } },
    { selector: 'node.s1', style: { 'border-color': T.s1 } },
    { selector: 'node.s2', style: { 'border-color': T.s2 } },
    { selector: 'node.s3', style: { 'border-color': T.s3 } },
    { selector: 'node.s4', style: { 'border-color': T.s4 } },
    { selector: 'node.s5', style: { 'border-color': T.s5 } },
    { selector: 'node.dot.s1', style: { 'background-color': T.s1 } },
    { selector: 'node.dot.s2', style: { 'background-color': T.s2 } },
    { selector: 'node.dot.s3', style: { 'background-color': T.s3 } },
    { selector: 'node.dot.brand', style: { 'background-color': T.brand } },
    { selector: 'node.dot.faint', style: { 'background-color': T.faint } },
    { selector: 'node.dot.bad', style: { 'background-color': T.bad } },
    { selector: ':parent', style: { shape: 'round-rectangle', 'corner-radius': 4, 'background-opacity': 0,
      'border-width': 1, 'border-color': T.line2, padding: '34px', 'text-valign': 'top', 'text-halign': 'center',
      'text-margin-y': -12, 'font-family': MONO, 'font-weight': 500, 'font-size': 24, color: T.muted } },
    { selector: 'edge', style: { width: 1.5, 'line-color': T.line2, 'curve-style': 'bezier',
      'target-arrow-shape': 'none', 'source-endpoint': 'outside-to-node', 'target-endpoint': 'outside-to-node' } },
    { selector: 'edge.arrow', style: { 'target-arrow-shape': 'triangle', 'target-arrow-color': T.line2, 'arrow-scale': 0.9 } },
    { selector: 'edge.taxi', style: { 'curve-style': 'taxi', 'taxi-direction': 'downward', 'taxi-turn': '50%' } },
    { selector: 'edge.taxi-h', style: { 'curve-style': 'taxi', 'taxi-direction': 'rightward', 'taxi-turn': '50%' } },
    { selector: 'edge.dashed', style: { 'line-style': 'dashed', 'line-dash-pattern': [6, 8] } },
    { selector: 'edge.strong', style: { width: 3 } },
    { selector: 'edge.brand', style: { 'line-color': T.brand, 'target-arrow-color': T.brand } },
    { selector: 'edge.ok', style: { 'line-color': T.ok, 'target-arrow-color': T.ok } },
    { selector: 'edge.bad', style: { 'line-color': T.bad, 'target-arrow-color': T.bad, width: 3 } },
    { selector: 'edge.s1', style: { 'line-color': T.s1 } },
    { selector: 'edge.s2', style: { 'line-color': T.s2 } },
    { selector: 'edge.s3', style: { 'line-color': T.s3 } },
    { selector: 'edge.s4', style: { 'line-color': T.s4 } },
    { selector: 'edge.s5', style: { 'line-color': T.s5 } },
    { selector: 'edge.ink', style: { 'line-color': T.ink } },
  ];

  function graph(env, sel, elements, style = []) {
    const { el, r } = mount(env, sel);
    const cy = cytoscape({
      container: el, elements, style: CY_STYLE.concat(style), layout: { name: 'preset', fit: false },
      zoom: 1, pan: { x: 0, y: 0 }, userZoomingEnabled: false, userPanningEnabled: false, boxSelectionEnabled: false,
      autoungrabify: true, autounselectify: true, motionBlur: false, textureOnViewport: false, pixelRatio: 1,
    });
    const show = (lt) => {
      cy.batch(() => {
        cy.elements().forEach((e) => {
          const at = e.data('t');
          const until = e.data('until');
          let q = at === undefined ? 1 : fade(lt, at);
          if (until !== undefined) q *= 1 - fade(lt, until, 0.4);
          if (e.data('dim') !== undefined && lt > e.data('dim')) q *= 1 - 0.55 * fade(lt, e.data('dim'), 0.8);
          e.style('opacity', q);
        });
      });
      if (cy.forceRender) cy.forceRender();
    };
    // particles along an edge, in page coordinates, drawn by the p5 layer
    const travel = (edge, u) => {
      const s = edge.sourceEndpoint();
      const d = edge.targetEndpoint();
      return [r.left + lerp(s.x, d.x, u), r.top + lerp(s.y, d.y, u)];
    };
    return { cy, el, r, W: r.width, H: r.height, show, travel };
  }

  // ---- ECharts: one theme for every chart ----
  function chart(env, sel, option) {
    const { el, r } = mount(env, sel);
    const ch = echarts.init(el, null, { renderer: 'canvas', width: r.width, height: r.height, devicePixelRatio: 1 });
    ch.setOption({ animation: false, backgroundColor: 'transparent', textStyle: { fontFamily: MONO, color: T.muted }, ...option });
    const paint = (opt) => {
      ch.setOption(opt, { lazyUpdate: false, silent: true });
      ch.getZr().flush();
    };
    return { ch, el, r, W: r.width, H: r.height, paint };
  }
  const axisQuiet = { axisLine: { show: false }, axisTick: { show: false }, splitLine: { show: false } };

  const VIZ = {};

  // Hierarchical context: the repository as a tree; one path lights up.
  VIZ.tree = (env) => {
    const tPath = env.cue('path');
    const tNothing = env.cue('nothing');
    const host = env.el.querySelector('.tree-space').getBoundingClientRect();
    const W = host.width;
    const H = host.height;
    const ys = [0.07, 0.34, 0.62, 0.9].map((f) => f * H);
    const els = [];
    const add = (id, x, y, lvl, label, path, parent) => {
      els.push({ data: { id, label: label || '', t: 0.3 + lvl * 0.35, dim: path ? undefined : tPath },
        position: { x, y }, classes: `dot side ${path ? 'brand' : lvl === 0 ? '' : 'faint'}` });
      if (parent) {
        els.push({ data: { id: `${parent}-${id}`, source: parent, target: id, t: 0.3 + lvl * 0.35,
          dim: path ? undefined : tPath }, classes: 'taxi' });
      }
    };
    add('repo', W * 0.5, ys[0], 0, 'repo/', true);
    const top = ['docs/', 'src/', '.ai/', 'test/', 'site/'];
    top.forEach((n, i) => add(`l1-${i}`, W * (0.06 + i * 0.205), ys[1], 1, n, n === 'src/', 'repo'));
    top.forEach((n, i) => {
      const kids = n === 'src/' ? ['cli/', 'parser/', 'mesh/'] : ['', ''];
      kids.forEach((k, j) => {
        const id = `l2-${i}-${j}`;
        const x = W * (0.06 + i * 0.205) + (j - (kids.length - 1) / 2) * W * 0.055;
        add(id, x, ys[2], 2, n === 'src/' ? k : '', k === 'parser/', `l1-${i}`);
        if (k === 'parser/') {
          ['lexer.rs', 'ast.rs'].forEach((leaf, m) => add(`l3-${m}`, x + (m - 0.5) * W * 0.12, ys[3], 3,
            leaf, leaf === 'lexer.rs', id));
        }
      });
    });
    const g = graph(env, '.tree-space', els, [
      { selector: 'node.dot', style: { 'font-size': 22, color: T.ink } },
      { selector: 'node.dot.brand', style: { width: 20, height: 20, 'font-size': 26 } },
      { selector: 'node.dot.faint', style: { color: T.muted, 'font-size': 18 } },
    ]);
    const path = ['repo', 'l1-1', 'l2-1-1', 'l3-0'];
    return (lt, a) => {
      g.show(lt);
      g.cy.batch(() => {
        for (let k = 1; k < path.length; k++) {
          const e = g.cy.getElementById(`${path[k - 1]}-${path[k]}`);
          const on = lt > tPath + (k - 1) * 0.3;
          e.style({ 'line-color': on ? T.brand : T.line2, width: on ? 4 : 1.5 });
        }
      });
      if (g.cy.forceRender) g.cy.forceRender();
      if (lt > tNothing) {
        const u = ((lt - tNothing) % 1.6) / 1.6;
        const seg = Math.min(path.length - 2, Math.floor(u * (path.length - 1)));
        const v = u * (path.length - 1) - seg;
        const e = g.cy.getElementById(`${path[seg]}-${path[seg + 1]}`);
        G().glowDot(...g.travel(e, v), 10, G().C.white, a);
      }
    };
  };

  // Provenance: claim, test, commit, release, linked; a pulse runs the chain once it is whole.
  VIZ.chain = (env) => {
    const host = env.el.querySelector('.chain-space').getBoundingClientRect();
    const W = host.width;
    const steps = [['CLAIM\nfinish refuses', 'record', ''], ['TEST\nsuite:parse', 'test', ''],
      ['COMMIT\n2034d4a', 'commit', ''], ['RELEASE\n1.0.0-alpha.6', 'provenance', 'ok']];
    const els = [];
    steps.forEach(([label, cue, cls], i) => {
      els.push({ data: { id: `c${i}`, label, t: env.cue(cue) }, position: { x: W * (0.125 + i * 0.25), y: host.height * 0.45 }, classes: cls });
      if (i) els.push({ data: { id: `e${i}`, source: `c${i - 1}`, target: `c${i}`, t: env.cue(cue) }, classes: 'arrow ink' });
    });
    const g = graph(env, '.chain-space', els, [{ selector: 'node', style: { 'font-size': 21, 'text-max-width': 180, width: 168 } }]);
    const done = env.cue('provenance') + 0.6;
    return (lt, a) => {
      g.show(lt);
      if (lt > done) {
        const u = ((lt - done) % 1.8) / 1.8;
        const k = Math.min(2, Math.floor(u * 3));
        G().glowDot(...g.travel(g.cy.getElementById(`e${k + 1}`), u * 3 - k), 6, G().C.green, a);
      }
    };
  };

  // Doctrine: eight gates a rule passes to be enforced; a rule stopped early is documentation.
  VIZ.doctrine = (env) => {
    const host = env.el.querySelector('.gates-space').getBoundingClientRect();
    const H = host.height;
    const names = [['principle', null], ['doctrine', 'declared'], ['validator', 'validated'], ['enforcement point', 'wired'],
      ['propagation', 'fails'], ['test', 'tested'], ['CI', 'blocks'], ['claim', 'claim']];
    const step = (H - 60) / 7;
    const els = [];
    names.forEach(([n, cue], i) => {
      const t = cue ? env.cue(cue) : 0.3;
      els.push({ data: { id: `g${i}`, label: n, t }, position: { x: 30, y: 30 + i * step },
        classes: `dot side serif ${i === 7 ? 'ok' : 'brand'}` });
      els.push({ data: { id: `n${i}`, label: String(i + 1).padStart(2, '0'), t }, position: { x: host.width - 30, y: 30 + i * step },
        classes: 'ghost caps' });
      if (i) els.push({ data: { id: `ge${i}`, source: `g${i - 1}`, target: `g${i}`, t }, classes: 'brand strong' });
    });
    const tDoc = env.cue('documentation');
    els.push({ data: { id: 'doc', label: 'DOCUMENTATION, NOT A RULE', t: tDoc }, position: { x: host.width * 0.62, y: 30 + 1.5 * step },
      classes: 'bad caps' });
    els.push({ data: { id: 'docE', source: 'g1', target: 'doc', t: tDoc }, classes: 'bad dashed' });
    const g = graph(env, '.gates-space', els, [
      { selector: 'node.dot', style: { width: 18, height: 18, 'background-color': T.brand } },
      { selector: 'node.dot.ok', style: { 'background-color': T.ok } },
      { selector: 'node.serif', style: { 'font-size': 36, 'text-max-width': 600 } },
      { selector: 'node.caps.bad', style: { color: T.badFg, 'font-family': MONO, padding: '12px' } },
    ]);
    return (lt, a) => {
      g.show(lt);
      const lit = names.filter(([, cue]) => !cue || lt >= env.cue(cue)).length;
      for (let k = 0; k < 5; k++) {
        const u = ((lt * 0.2 + k / 5) % 1);
        const seg = Math.min(lit - 2, Math.floor(u * (lit - 1)));
        if (seg < 0) break;
        G().glowDot(...g.travel(g.cy.getElementById(`ge${seg + 1}`), u * (lit - 1) - seg), 5, G().C.white, a);
      }
    };
  };

  // Reasoning: evidence, assessment, the plan's four branches, one recorded conclusion.
  VIZ.reasoning = (env) => {
    const host = env.el.querySelector('.flow-space').getBoundingClientRect();
    const W = host.width;
    const H = host.height;
    const tEv = env.cue('evidence');
    const tAdv = env.cue('advisors');
    const tCon = env.cue('conclusion');
    const y = (f) => f * H;
    const els = [
      { data: { id: 'ev', label: 'local evidence', t: tEv - 0.3 }, position: { x: W / 2, y: y(0.07) } },
      { data: { id: 'as', label: 'assessment\nsubject · materiality · hypothesis', t: tEv + 0.3 }, position: { x: W / 2, y: y(0.25) } },
      { data: { id: 'pl', label: 'policy plan', t: tEv + 0.8 }, position: { x: W / 2, y: y(0.43) }, classes: 'brand' },
      { data: { id: 'co', label: 'conclusion, recorded\nevidence · rejected · risks · validation', t: tCon + 0.3 },
        position: { x: W / 2, y: y(0.92) }, classes: 'ok' },
      { data: { id: 'e1', source: 'ev', target: 'as', t: tEv + 0.3 }, classes: 'arrow' },
      { data: { id: 'e2', source: 'as', target: 'pl', t: tEv + 0.8 }, classes: 'arrow' },
    ];
    [['decide\nlocally', ''], ['review\nstructured', ''], ['reuse\na conclusion', ''], ['consult\nadvisors', 's4']].forEach(([n, cls], i) => {
      const t = cls ? tAdv : tEv + 1.2 + i * 0.15;
      els.push({ data: { id: `b${i}`, label: n, t }, position: { x: W * (0.125 + i * 0.25), y: y(0.66) }, classes: cls });
      els.push({ data: { id: `pb${i}`, source: 'pl', target: `b${i}`, t }, classes: `taxi arrow ${cls ? 's4 dashed' : ''}` });
      els.push({ data: { id: `bc${i}`, source: `b${i}`, target: 'co', t: tCon }, classes: 'taxi brand' });
    });
    const g = graph(env, '.flow-space', els, [{ selector: 'node', style: { 'font-size': 22, 'text-max-width': 190 } },
      { selector: '#as, #co', style: { 'text-max-width': 520 } }]);
    return (lt) => g.show(lt);
  };

  // Generation: one declaration fans out into every projection; a drifted one is caught.
  VIZ.fan = (env) => {
    const host = env.el.querySelector('.fan-space').getBoundingClientRect();
    const W = host.width;
    const H = host.height;
    const tDrift = env.cue('drifts');
    const els = [{ data: { id: 'src', label: 'capability models.route', t: env.cue('declared') - 0.5 }, position: { x: W / 2, y: H * 0.07 }, classes: 'brand' }];
    [['CLI', 'majordomus models route', 'command'], ['HTTP', 'GET /api/v1/models/route', 'http'], ['MCP', 'majordomus_models_route', 'mcp'],
      ['OpenAPI', 'operation models.route', 'openapi'], ['Docs', 'docs/generated/cli.md', 'docs'], ['Skill', '/mj-models', 'skills']].forEach(([n, what, cue], i) => {
      const t = env.cue(cue);
      els.push({ data: { id: n, label: `${n.toUpperCase()}\n${what}`, t }, position: { x: W * 0.36, y: H * (0.25 + i * 0.145) } });
      els.push({ data: { id: `f-${n}`, source: 'src', target: n, t }, classes: 'taxi-h arrow' });
    });
    const g = graph(env, '.fan-space', els, [{ selector: 'node', style: { 'font-size': 23, 'text-halign': 'center', width: 520, 'text-max-width': 520 } },
      { selector: '#src', style: { width: 'label' } }]);
    return (lt, a) => {
      g.show(lt);
      const drift = lt > tDrift && lt < tDrift + 1.8;
      g.cy.getElementById('Docs').style({ 'border-color': drift ? T.bad : T.line2, color: drift ? T.badFg : T.ink });
      g.cy.getElementById('Docs').data('label', drift ? 'DOCS · STALE\ngenerate --check fails' : 'DOCS\ndocs/generated/cli.md');
      if (g.cy.forceRender) g.cy.forceRender();
    };
  };

  // One shared server; the first client starts it, the rest attach and see each other.
  VIZ.server = (env) => {
    const host = env.el.querySelector('.server-space').getBoundingClientRect();
    const W = host.width;
    const H = host.height;
    const tFirst = env.cue('first');
    const tAttach = env.cue('attaches');
    const tSees = env.cue('sees');
    const cl = [['Claude Code', 's2', 0.16, 0.16], ['Codex', 's1', 0.84, 0.16], ['Gemini', 's3', 0.84, 0.86], ['Zed', 's4', 0.16, 0.86]];
    const els = [{ data: { id: 'srv', label: 'majordomus serve\n:8741 · loopback', t: tFirst + 0.2 }, position: { x: W / 2, y: H / 2 }, classes: 'brand' }];
    cl.forEach(([n, s, fx, fy], i) => {
      const t = i === 0 ? tFirst : tAttach + (i - 1) * 0.35;
      els.push({ data: { id: `c${i}`, label: n, t }, position: { x: W * fx, y: H * fy }, classes: s });
      els.push({ data: { id: `k${i}`, source: `c${i}`, target: 'srv', t }, classes: `${s} strong` });
    });
    [[0, 1], [1, 2], [2, 3], [3, 0]].forEach(([i, j]) => els.push({ data: { id: `m${i}${j}`, source: `c${i}`, target: `c${j}`, t: tSees }, classes: 'dashed' }));
    const g = graph(env, '.server-space', els, [{ selector: '#srv', style: { 'font-size': 22 } }]);
    return (lt, a) => {
      g.show(lt);
      cl.forEach(([, s], i) => {
        const e = g.cy.getElementById(`k${i}`);
        const t0 = e.data('t');
        if (lt < t0 + 0.4) return;
        G().glowDot(...g.travel(e, ((lt - t0) * 0.8) % 1), 4, G().C[s], a);
      });
    };
  };

  // Every client around one policy: each receives its own projection.
  VIZ.clients = (env) => {
    const host = env.el.querySelector('.orbit-space').getBoundingClientRect();
    const W = host.width;
    const H = host.height;
    const list = [['Claude Code', 'claude', 's2'], ['Codex', 'codex', 's1'], ['Gemini', 'gemini', 's3'], ['Zed', 'zed', 's4'],
      ['Antigravity', 'antigravity', 's5'], ['bb', 'bb', ''], ['any MCP client', 'mcp', '']];
    const els = [{ data: { id: 'pol', label: 'policy.yaml', t: 0.2 }, position: { x: W / 2, y: H / 2 }, classes: 'brand' }];
    list.forEach(([n, cue, s], i) => {
      const ang = -Math.PI / 2 + (i * Math.PI * 2) / list.length;
      const t = env.cue(cue);
      els.push({ data: { id: `p${i}`, label: n, t }, position: { x: W / 2 + Math.cos(ang) * W * 0.36, y: H / 2 + Math.sin(ang) * H * 0.4 }, classes: s });
      els.push({ data: { id: `q${i}`, source: 'pol', target: `p${i}`, t }, classes: `${s} ${n === 'any MCP client' ? 'dashed' : ''}` });
    });
    const g = graph(env, '.orbit-space', els, [{ selector: 'node', style: { 'font-size': 24 } }]);
    const tProj = env.cue('projection');
    return (lt, a) => {
      g.show(lt);
      list.forEach(([, , s], i) => {
        const e = g.cy.getElementById(`q${i}`);
        const t0 = e.data('t');
        if (lt < t0 + 0.4) return;
        for (let k = 0; k < 3; k++) {
          const u = ((lt - t0) * (lt > tProj ? 0.9 : 0.45) + k / 3) % 1;
          G().glowDot(...g.travel(e, u), 3.5, s ? G().C[s] : G().C.white, a * Math.sin(Math.PI * u));
        }
      });
    };
  };

  // The board: three machines, the agents on them, the file two of them reach for.
  VIZ.mesh = (env) => {
    const host = env.el.querySelector('.mesh-space').getBoundingClientRect();
    const W = host.width;
    const H = host.height;
    const c = { claude: env.cue('claude'), codex: env.cue('codex'), gemini: env.cue('gemini'), same: env.cue('same') };
    const hubs = [['laptop', 0.2, 0.32, 0.2], ['workstation', 0.8, 0.32, 0.4], ['build host', 0.5, 0.84, 0.6]];
    const agents = [['Claude', 's2', 0, 0.2, 0.06, c.claude], ['Codex', 's1', 1, 0.8, 0.06, c.codex], ['Gemini', 's3', 2, 0.85, 0.84, c.gemini]];
    const els = [];
    hubs.forEach(([n, fx, fy, t], i) => {
      els.push({ data: { id: `h${i}`, label: n.toUpperCase(), t }, position: { x: W * fx, y: H * fy }, classes: 'hub' });
    });
    [[0, 1], [1, 2], [2, 0]].forEach(([i, j], e) => els.push({ data: { id: `hh${e}`, source: `h${i}`, target: `h${j}`, t: 0.7 + e * 0.15 }, classes: 'ink' }));
    agents.forEach(([n, s, hub, fx, fy, t]) => {
      els.push({ data: { id: n, label: n, t }, position: { x: W * fx, y: H * fy }, classes: s });
      els.push({ data: { id: `a-${n}`, source: n, target: `h${hub}`, t }, classes: `${s} strong` });
    });
    els.push({ data: { id: 'file', label: 'src/parser.rs', t: c.same - 0.2 }, position: { x: W * 0.5, y: H * 0.42 }, classes: 'bad' });
    els.push({ data: { id: 'x1', source: 'Claude', target: 'file', t: c.same }, classes: 'bad arrow' });
    els.push({ data: { id: 'x2', source: 'Codex', target: 'file', t: c.same + 0.1 }, classes: 'bad arrow' });
    const g = graph(env, '.mesh-space', els, [{ selector: 'node', style: { 'font-size': 30, padding: '22px' } },
      { selector: '#file', style: { 'font-size': 30, padding: '24px' } }, { selector: 'node.hub', style: { 'border-color': T.line2, width: 46, height: 46 } }]);
    return (lt, a) => {
      g.show(lt);
      for (let e = 0; e < 3; e++) {
        const edge = g.cy.getElementById(`hh${e}`);
        if (lt < 1.4 + e * 0.15) continue;
        for (let k = 0; k < 3; k++) G().glowDot(...g.travel(edge, (lt * 0.3 + k / 3 + e * 0.13) % 1), 4, G().C.white, a);
      }
    };
  };

  // Machines in three places: compound zones, linked by the transport each place uses.
  VIZ.zones = (env) => {
    const host = env.el.querySelector('.zone-space').getBoundingClientRect();
    const W = host.width;
    const H = host.height;
    const z = [['home', 'HOME · LAN', env.cue('home'), 2, 0.05, 0.42, 0.24],
      ['dc', 'DATACENTER · HTTPS HUB', env.cue('datacenter'), 4, 0.55, 0.95, 0.24],
      ['co', 'COMPANY · TAILNET', env.cue('company'), 6, 0.05, 0.95, 0.76]];
    const els = [];
    const hubs = {};
    z.forEach(([id, label, t, n, x0, x1, fy]) => {
      els.push({ data: { id, label, t } });
      for (let k = 0; k < n; k++) {
        const nid = `${id}${k}`;
        els.push({ data: { id: nid, parent: id, label: '', t: t + 0.1 * k }, position: { x: W * lerp(x0 + 0.04, x1 - 0.04, n === 1 ? 0.5 : k / (n - 1)), y: H * fy + (k % 2 ? 28 : -28) },
          classes: 'machine' });
        if (k) els.push({ data: { id: `${nid}l`, source: `${id}${k - 1}`, target: nid, t: t + 0.1 * k } });
      }
      hubs[id] = `${id}${Math.floor(n / 2)}`;
    });
    const link = (a, b, cls, t) => els.push({ data: { id: `${a}-${b}`, source: hubs[a], target: hubs[b], t }, classes: cls });
    link('home', 'dc', 'brand strong', z[1][2] + 0.4);
    link('dc', 'co', 'brand strong', z[2][2] + 0.4);
    link('home', 'co', 'ink dashed', z[2][2] + 0.6);
    const g = graph(env, '.zone-space', els, [{ selector: 'node.machine', style: { width: 34, height: 34, padding: 0, label: '', 'border-color': T.ink } }]);
    return (lt, a) => {
      g.show(lt);
      [['home-dc', 0], ['dc-co', 1], ['home-co', 2]].forEach(([id, e]) => {
        const edge = g.cy.getElementById(id);
        if (lt < edge.data('t') + 0.5) return;
        for (let k = 0; k < 3; k++) G().glowDot(...g.travel(edge, (lt * 0.45 + k / 3 + e * 0.21) % 1), 4, k ? G().C.white : G().C.brand, a);
      });
    };
  };

  // Intent, as Flowbite's vertical timeline: each rung derived from the one above.
  VIZ.ladder = (env) => {
    const space = env.el.querySelector('.ladder-space');
    const rungs = [['Intent', 'what must become true', 'intent', T.brand], ['Criteria', 'the evidence that settles it', 'criteria', T.s4],
      ['Milestone', 'what realises it', 'milestones', T.s1], ['Issue', 'one piece of work', 'issues', T.s2],
      ['Task · commit', 'scoped, finished, traced back', 'plan', T.s3]];
    const ol = document.createElement('ol');
    ol.className = 'fb-timeline';
    rungs.forEach(([name, what, cue, col]) => {
      const li = document.createElement('li');
      li.dataset.t = env.cue(cue);
      li.innerHTML = `<span class="mk" style="background:${col}"></span>`
        + `<h3 class="tl-name">${name}</h3><p class="tl-what">${what}</p>`;
      ol.appendChild(li);
    });
    space.appendChild(ol);
    const items = [...ol.children];
    return (lt) => {
      items.forEach((li) => {
        const q = fade(lt, Number(li.dataset.t) - 0.2);
        li.style.opacity = q;
        li.style.transform = `translateY(${(1 - q) * 16}px)`;
      });
    };
  };


  // The two hooks: every commit passes doctor, every push the finish contract; an unmet one stops it.
  VIZ.hooks = (env) => {
    const host = env.el.querySelector('.hooks-space').getBoundingClientRect();
    const W = host.width;
    const H = host.height;
    const tc = env.cue('commit');
    const tp = env.cue('push');
    const ts = env.cue('stops');
    const els = [
      { data: { id: 'edit', label: 'edit', t: tc - 0.4 }, position: { x: W * 0.12, y: H * 0.16 } },
      { data: { id: 'commit', label: 'git commit', t: tc }, position: { x: W * 0.45, y: H * 0.16 } },
      { data: { id: 'doctor', label: 'pre-commit\ndoctor', t: tc + 0.4 }, position: { x: W * 0.82, y: H * 0.16 }, classes: 'brand' },
      { data: { id: 'push', label: 'git push', t: tp }, position: { x: W * 0.12, y: H * 0.56 } },
      { data: { id: 'finish', label: 'pre-push\nfinish --check', t: tp + 0.3 }, position: { x: W * 0.47, y: H * 0.56 }, classes: 'brand' },
      { data: { id: 'origin', label: 'origin', t: tp + 0.7 }, position: { x: W * 0.85, y: H * 0.56 }, classes: 'ok' },
      { data: { id: 'refused', label: 'refused\ncontract unmet', t: ts }, position: { x: W * 0.47, y: H * 0.9 }, classes: 'bad' },
      { data: { id: 'e1', source: 'edit', target: 'commit', t: tc }, classes: 'arrow' },
      { data: { id: 'e2', source: 'commit', target: 'doctor', t: tc + 0.4 }, classes: 'arrow brand' },
      { data: { id: 'e3', source: 'doctor', target: 'push', t: tp }, classes: 'arrow taxi' },
      { data: { id: 'e4', source: 'push', target: 'finish', t: tp + 0.3 }, classes: 'arrow brand' },
      { data: { id: 'e5', source: 'finish', target: 'origin', t: tp + 0.7 }, classes: 'arrow ok' },
      { data: { id: 'e6', source: 'finish', target: 'refused', t: ts }, classes: 'arrow bad' },
    ];
    const g = graph(env, '.hooks-space', els, [{ selector: 'node', style: { 'font-size': 30, 'text-max-width': 300 } }]);
    const path = ['e1', 'e2', 'e3', 'e4', 'e5'];
    return (lt, a) => {
      g.show(lt);
      if (lt < tp + 1) return;
      const u = ((lt - tp - 1) % 2.5) / 2.5;
      const seg = Math.min(path.length - 1, Math.floor(u * path.length));
      G().glowDot(...g.travel(g.cy.getElementById(path[seg]), u * path.length - seg), 6, G().C.white, a);
    };
  };

  // ---- charts ----

  // The model catalogue as a heatmap: every declared model against every capability word.
  VIZ.models = (env) => {
    const caps = ['TXT', 'VIS', 'TOOLS', 'JSON', 'STRM', 'RSN'];
    const models = ['claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5', '+ 5 more Claude', 'gpt-4o'];
    const value = (m, c) => (m === 'gpt-4o' ? (c === 0 ? 2 : 0) : 1);
    const t0 = env.cue('declared');
    const tTools = env.cue('need');
    const c = chart(env, '.matrix-space', {
      grid: { left: 270, right: 8, top: 40, bottom: 4 },
      xAxis: { type: 'category', data: caps, position: 'top', ...axisQuiet,
        axisLabel: { fontFamily: MONO, fontSize: 22, color: T.muted, interval: 0 } },
      yAxis: { type: 'category', data: models, inverse: true, ...axisQuiet,
        axisLabel: { fontFamily: MONO, fontSize: 24, color: T.ink } },
      visualMap: { show: false, type: 'piecewise', dimension: 2,
        pieces: [{ value: 0, color: T.raised }, { value: 1, color: T.s2 }, { value: 2, color: T.s1 }] },
      series: [{ type: 'heatmap', data: [], itemStyle: { borderColor: T.bg, borderWidth: 12 } }],
    });
    return (lt) => {
      const rows = Math.floor(clamp((lt - t0) / 1.2) * models.length + 0.0001);
      const data = [];
      models.forEach((m, i) => caps.forEach((cap, j) => { if (i < rows) data.push([j, i, value(m, j)]); }));
      const hot = lt > tTools;
      c.paint({
        series: [{ data }],
        xAxis: { axisLabel: { color: (v) => (hot && v === 'TOOLS' ? T.brand : T.muted) } },
        yAxis: { axisLabel: { color: (v) => (hot && v === 'gpt-4o' ? T.bad : T.ink) } },
        graphic: hot ? [{ type: 'rect', shape: { x: 270 + 2 * ((c.W - 278) / 6), y: 28, width: (c.W - 278) / 6, height: c.H - 30 },
          style: { fill: 'none', stroke: T.brand, lineWidth: 2 } }] : [],
      });
    };
  };

  // Doctor's rules: every rule, those with a validator, the blocking ones (all validated).
  VIZ.doctor = (env) => {
    const t0 = env.cue('rule');
    const rows = [['RULES', 61, T.ink], ['WITH A VALIDATOR', 51, T.brand], ['BLOCKING, ALL VALIDATED', 44, T.ok]];
    const c = chart(env, '.bars-space', {
      grid: { left: 260, right: 60, top: 6, bottom: 6 },
      xAxis: { type: 'value', max: 61, show: false },
      yAxis: { type: 'category', data: rows.map((r) => r[0]), inverse: true, ...axisQuiet,
        axisLabel: { fontFamily: SANS, fontWeight: 700, fontSize: 15, color: T.muted } },
      series: [{ type: 'bar', barWidth: 26, data: [], label: { show: true, position: 'right', fontFamily: MONO, fontSize: 20, color: T.ink } }],
    });
    return (lt) => {
      c.paint({ series: [{ data: rows.map(([, v, col], i) => {
        const q = fade(lt, t0 + i * 0.2, 0.8);
        return { value: Math.round(v * q), itemStyle: { color: col } };
      }) }] });
    };
  };


  // The monitor's stream as a timeline: four lanes of events arriving now and drifting back.
  VIZ.lanes = (env) => {
    const lanes = ['sessions', 'claims', 'reviews', 'merges'];
    const cues = ['session', 'claim', 'review', 'machine'].map((x) => env.cue(x));
    const cols = [T.ink, T.ink, T.ink, T.ink];
    const span = 8;
    const c = chart(env, '.lane-space', {
      grid: { left: 130, right: 30, top: 10, bottom: 34 },
      xAxis: { type: 'value', ...axisQuiet, axisLabel: { show: false } },
      yAxis: { type: 'category', data: lanes.map((l) => l.toUpperCase()), inverse: true, ...axisQuiet,
        axisLabel: { fontFamily: MONO, fontSize: 18, color: T.muted },
        splitLine: { show: true, lineStyle: { color: T.line } } },
      series: lanes.map((l, i) => ({ type: 'scatter', data: [], itemStyle: { color: cols[i] } })),
    });
    const rand = (s) => { let x = Math.sin(s * 127.1) * 43758.5453; return x - Math.floor(x); };
    return (lt) => {
      const series = lanes.map((l, i) => {
        const data = [];
        for (let k = Math.max(0, Math.floor((lt - span) / 0.3)); k <= Math.floor(lt / 0.3); k++) {
          if (rand(i * 1000 + k) > 0.45) continue;
          const te = k * 0.3 + rand(k + i) * 0.3;
          if (te <= lt) data.push({ value: [te, i], symbolSize: 11 });
        }
        if (lt > cues[i]) data.push({ value: [cues[i], i], symbolSize: 26, itemStyle: { borderColor: T.bg, borderWidth: 3, color: T.brand } });
        return { data, markLine: i ? undefined : { silent: true, symbol: 'none', label: { formatter: 'now', color: T.muted, fontFamily: MONO },
          lineStyle: { color: T.ink, type: 'solid', width: 1.5 }, data: [{ xAxis: lt }] } };
      });
      c.paint({ xAxis: { min: lt - span, max: lt + 0.2 }, series });
    };
  };


  window.VIZ = VIZ;
})();
