// The generative layer, drawn by p5.js: flow fields, concurrent rivers, the prism that splits
// light, the particles that travel the graphs viz.js draws with Cytoscape and ECharts. p5 runs in
// instance mode with noLoop(): every frame is one redraw() at a given time, so any frame renders
// alone and identically. Painters draw through p5's drawingContext and use p5's noise().
(() => {
  const W = 1080;
  const H = 1920;
  const DT = 1 / 30;
  const TAU = Math.PI * 2;
  const inks = [];
  window.genInk = () => inks;
  let ctx = null;
  let frame = null;
  const P = new p5((p) => {
    p.setup = () => {
      p.pixelDensity(1);
      p.createCanvas(W, H);
      p.noLoop();
      p.noiseSeed(1337);
      p.noiseDetail(4, 0.5);
      ctx = p.drawingContext;
      // boxes and nodes are ink too: a layout check sees a graph that leaves its frame
      const fillRect = ctx.fillRect.bind(ctx);
      ctx.fillRect = (x, y, w, h) => {
        if (ctx.globalAlpha > 0.5 && w * h < (W * H) / 4) {
          const m = ctx.getTransform();
          const pts = [[x, y], [x + w, y + h]].map(([px, py]) => [m.a * px + m.c * py + m.e, m.b * px + m.d * py + m.f]);
          inks.push({ shape: true, text: 'box', x0: Math.min(pts[0][0], pts[1][0]), y0: Math.min(pts[0][1], pts[1][1]),
            x1: Math.max(pts[0][0], pts[1][0]), y1: Math.max(pts[0][1], pts[1][1]) });
        }
        fillRect(x, y, w, h);
      };
    };
    p.draw = () => { if (frame) frame(); };
  }, document.getElementById('gen-host'));

  const mulberry = (seed) => () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let r = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const easeOut = (x) => 1 - Math.pow(1 - x, 3);
  const backOut = (x) => 1 + 2.4 * Math.pow(x - 1, 3) + 1.4 * Math.pow(x - 1, 2);
  const lerp = (a, b, u) => a + (b - a) * u;

  // Ken Perlin's improved noise, 3D.
  const perm = new Uint8Array(512);
  {
    const r = mulberry(1337);
    const p = [...Array(256).keys()];
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }
    for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  }
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const grad = (h, x, y, z) => {
    h &= 15;
    const u = h < 8 ? x : y;
    const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
    return ((h & 1) ? -u : u) + ((h & 2) ? -v : v);
  };
  const noise3 = (x, y, z) => (P.noise(x + 4096, y + 4096, z + 4096) - 0.5) * 2.4;

  const C = {
    // the site's dark roles: fg white, muted gray-400, accent blue-400, ok emerald-400,
    // bad rose-400, warn orange-400 (share/design/tokens.yaml)
    violet: '255,255,255', sky: '153,161,175', green: '0,212,146', red: '255,99,126',
    white: '255,255,255', amber: '255,137,4', gray: '153,161,175', brand: '81,162,255',
    s1: '81,162,255', s2: '255,137,4', s3: '0,212,146', s4: '166,132,255', s5: '0,211,242',
    prismV: '167,139,250', prismS: '56,189,248', prismE: '52,211,153',
  };

  // v5.1's light: a soft halo around a bright core, drawn additively. Moving things glow; the
  // graphs, boxes and type stay flat.
  function glowDot(x, y, r, color, alpha, c = ctx) {
    if (!(alpha > 0.004) || !Number.isFinite(x + y + r)) return;
    if (alpha > 0.5 && r >= 6) inks.push({ shape: true, text: 'node', x0: x - r, y0: y - r, x1: x + r, y1: y + r });
    const g = c.createRadialGradient(x, y, 0, x, y, r * 4);
    g.addColorStop(0, `rgba(${color}, ${alpha})`);
    g.addColorStop(0.25, `rgba(${color}, ${alpha * 0.35})`);
    g.addColorStop(1, `rgba(${color}, 0)`);
    c.fillStyle = g;
    c.beginPath();
    c.arc(x, y, r * 4, 0, TAU);
    c.fill();
    c.fillStyle = `rgba(255,255,255, ${alpha})`;
    c.beginPath();
    c.arc(x, y, r * 0.55, 0, TAU);
    c.fill();
  }

  // The motion layer above the scenes: graphs and charts mask the background, so what moves
  // along them is drawn here, over them, and cleared every frame.
  const fxCanvas = document.getElementById('fx');
  const fx = fxCanvas.getContext('2d');
  fx.globalCompositeOperation = 'lighter';
  const fxDot = (x, y, r, color, alpha) => glowDot(x, y, r, color, alpha, fx);


  const ink = (text, x, y, size, align) => {
    const w = ctx.measureText(text).width;
    const x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    const mid = ctx.textBaseline === 'middle';
    inks.push({ text, x0, x1: x0 + w, y0: mid ? y - size * 0.55 : y - size * 0.8, y1: mid ? y + size * 0.45 : y + size * 0.22 });
  };
  const label = (text, x, y, color, alpha, size = 30, weight = 700, align = 'center') => {
    ctx.font = `${weight} ${size}px -apple-system, 'SF Pro Display', sans-serif`;
    ctx.textAlign = align;
    if (alpha > 0.5) ink(text, x, y, size, align);
    ctx.fillStyle = `rgba(${color}, ${alpha})`;
    ctx.fillText(text, x, y);
  };
  const mono = (text, x, y, color, alpha, size = 26, align = 'left') => {
    ctx.font = `600 ${size}px ui-monospace, 'SF Mono', Menlo, monospace`;
    ctx.textAlign = align;
    if (alpha > 0.5) ink(text, x, y, size, align);
    ctx.fillStyle = `rgba(${color}, ${alpha})`;
    ctx.fillText(text, x, y);
  };
  const solid = (fn) => {
    ctx.globalCompositeOperation = 'source-over';
    fn();
    ctx.globalCompositeOperation = 'lighter';
  };



  // A handover flies from tonight's laptop to whichever agent picks it up tomorrow.
  function handoff(env) {
    const box = env.rect('.handoff-space');
    const tClose = env.cue('close');
    const tPicks = env.cue('picks');
    const A = [box.left + box.width * 0.18, box.top + box.height * 0.66];
    const B = [box.left + box.width * 0.82, box.top + box.height * 0.66];
    const peak = box.top + box.height * 0.06;
    const arc = (u) => [lerp(A[0], B[0], u), (1 - u) * (1 - u) * A[1] + 2 * (1 - u) * u * peak + u * u * B[1]];
    const t0 = tClose + 0.5;
    const t1 = Math.max(t0 + 1.2, tPicks);
    return (lt, a, t) => {
      if (a <= 0.01) return;
      const appear = easeOut(clamp((lt - 0.2) / 0.5));
      const lid = easeOut(clamp((lt - tClose) / 0.5));
      // laptop
      solid(() => {
        ctx.save();
        ctx.translate(A[0], A[1]);
        ctx.globalAlpha = a * appear;
        ctx.strokeStyle = `rgba(${C.violet}, 1)`;
        ctx.lineWidth = 5;
        ctx.fillStyle = 'rgba(10,16,32,.95)';
        const h = 110 * (1 - lid) + 8;
        ctx.beginPath(); ctx.roundRect(-90, -h, 180, h, 10); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.roundRect(-115, 0, 230, 14, 6); ctx.fill(); ctx.stroke();
        if (lid < 1) {
          ctx.fillStyle = `rgba(${C.sky}, ${0.35 * (1 - lid)})`;
          ctx.fillRect(-78, -h + 12, 156, Math.max(0, h - 24));
        }
        ctx.restore();
      });
      label('TONIGHT', A[0], A[1] + 70, C.white, 0.7 * a * appear, 22);
      // the agent who takes it
      const got = clamp((lt - t1) / 0.6);
      for (let k = 0; k < 3; k++) {
        const ang = t * 1.4 + (k * TAU) / 3;
        glowDot(B[0] + Math.cos(ang) * 58, B[1] - 50 + Math.sin(ang) * 58, 7, [C.violet, C.sky, C.green][k], a * appear);
      }
      glowDot(B[0], B[1] - 50, 18 + 8 * got, C.white, (0.5 + 0.5 * got) * a * appear);
      label('TOMORROW', B[0], B[1] + 70, C.white, 0.6 * a * appear, 22);
      if (got > 0 && got < 1) {
        ctx.lineWidth = 4;
        ctx.strokeStyle = `rgba(${C.green}, ${(1 - got) * a})`;
        ctx.beginPath(); ctx.arc(B[0], B[1] - 50, 30 + got * 140, 0, TAU); ctx.stroke();
      }
      // the arc and the document
      ctx.setLineDash([4, 14]);
      ctx.lineWidth = 3;
      ctx.strokeStyle = `rgba(${C.white}, ${0.25 * a * appear})`;
      ctx.beginPath();
      for (let u = 0; u <= 1.001; u += 0.02) {
        const [x, y] = arc(u);
        if (u === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      const u = easeOut(clamp((lt - t0) / (t1 - t0)));
      if (lt > t0) {
        for (let k = 0; k < 40; k++) {
          const v = u - k * 0.008;
          if (v < 0) break;
          const [x, y] = arc(v);
          const j = noise3(k * 0.4, t * 2, 3) * 14;
          glowDot(x + j, y + j, 3.5 * (1 - k / 40), [C.violet, C.sky, C.green][k % 3], a * (1 - k / 40));
        }
        const [x, y] = arc(u);
        const lift = u < 1 ? Math.sin(u * Math.PI) * 0.2 : 0;
        solid(() => {
          ctx.save();
          ctx.translate(x, y - 50 * (u >= 1 ? 1 : 0.4));
          ctx.rotate(lift);
          ctx.globalAlpha = a;
          ctx.fillStyle = 'rgba(17,26,46,.96)';
          ctx.strokeStyle = 'rgba(226,232,240,.9)';
          ctx.lineWidth = 3;
          ctx.beginPath(); ctx.roundRect(-38, -48, 76, 96, 10); ctx.fill(); ctx.stroke();
          ctx.fillStyle = 'rgba(255,255,255,.85)';
          [-26, -8, 10, 28].forEach((ly, i) => ctx.fillRect(-24, ly, i % 2 ? 34 : 48, 6));
          ctx.restore();
        });
      }
    };
  }




  // Trust: three listed peers link; a stranger is refused; what arrives is data, never code.
  function trust(env) {
    const box = env.rect('.trust-space');
    const tSigned = env.cue('signed');
    const tTrusted = env.cue('trusted');
    const tNothing = env.cue('nothing');
    const me = [box.left + box.width * 0.42, box.top + box.height * 0.5];
    const R = Math.min(box.width, box.height) * 0.42;
    const peers = [-2.4, -0.9, 2.3].map((ang) => [me[0] + Math.cos(ang) * R * 1.15, me[1] + Math.sin(ang) * R]);
    const names = ['laptop', 'studio', 'dc-01'];
    const strangerHome = [box.left + box.width * 1.05, box.top + box.height * 0.82];
    const strangerStop = [box.left + box.width * 0.86, box.top + box.height * 0.74];
    // networks are dots of light, as in every other mesh scene
    const node = (p, r, color, alpha) => {
      if (alpha <= 0.01) return;
      glowDot(p[0], p[1], r * 0.9, color, 0.45 * alpha);
      ctx.fillStyle = `rgba(${color}, ${alpha})`;
      ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, TAU); ctx.fill();
      if (alpha > 0.5) inks.push({ shape: true, text: 'node', x0: p[0] - r, y0: p[1] - r, x1: p[0] + r, y1: p[1] + r });
    };
    return (lt, a, t) => {
      if (a <= 0.01) return;
      const q = easeOut(clamp((lt - 0.3) / 0.6));
      peers.forEach((p, k) => {
        const f = easeOut(clamp((lt - 0.4 - k * 0.15) / 0.5));
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = `rgba(0,212,146, ${0.6 * a * f})`;
        ctx.beginPath(); ctx.moveTo(...me); ctx.lineTo(lerp(me[0], p[0], f), lerp(me[1], p[1], f)); ctx.stroke();
        node(p, 11, C.white, a * f);
        // a name sits on the far side of its peer, away from the path its signatures travel
        mono(names[k], p[0], p[1] < me[1] ? p[1] - 30 : p[1] + 44, C.gray, 0.9 * a * f, 22, 'center');
        if (lt > tSigned) {
          const u = ((lt - tSigned) * 0.6 + k / 3) % 1;
          const x = lerp(p[0], me[0], u);
          const y = lerp(p[1], me[1], u);
          glowDot(x, y, 4, C.green, a);
          // the label rides mid-way, clear of the peer's name and of this machine
          if (u > 0.2 && u < 0.68) mono('sig', x + 14, y - 14, C.green, 0.9 * a * Math.sin(Math.PI * (u - 0.2) / 0.48), 22);
        }
      });
      node(me, 16, C.brand, a * q);
      ctx.lineWidth = 2;
      ctx.strokeStyle = `rgba(${C.brand}, ${a * q})`;
      ctx.beginPath(); ctx.arc(me[0], me[1], 26, 0, TAU); ctx.stroke();
      label('THIS MACHINE', me[0] + 44, me[1] + 8, C.white, 0.9 * a * q, 22, 700, 'left');
      // the stranger
      const s0 = clamp((lt - tTrusted + 0.8) / 1.0);
      if (s0 > 0) {
        const p = [lerp(strangerHome[0], strangerStop[0], easeOut(s0)), lerp(strangerHome[1], strangerStop[1], easeOut(s0))];
        node(p, 11, C.red, a);
        const k = lt - tTrusted;
        if (k > 0) {
          ctx.lineWidth = 2;
          ctx.strokeStyle = `rgba(255,99,126, ${a})`;
          ctx.beginPath(); ctx.moveTo(p[0] - 9, p[1] - 9); ctx.lineTo(p[0] + 9, p[1] + 9);
          ctx.moveTo(p[0] + 9, p[1] - 9); ctx.lineTo(p[0] - 9, p[1] + 9); ctx.stroke();
          const ring = clamp(k / 0.9);
          if (ring < 1) {
            ctx.strokeStyle = `rgba(255,99,126, ${(1 - ring) * a})`;
            ctx.beginPath(); ctx.arc(p[0], p[1], 20 + ring * 70, 0, TAU); ctx.stroke();
          }
          label('UNTRUSTED', p[0], p[1] + 52, C.red, a * clamp(k / 0.3), 22, 700);
        }
      }
      // a shield: what arrives is checked and stored, never run
      if (lt > tNothing) {
        const k = lt - tNothing;
        const ring = (k % 1.4) / 1.4;
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = `rgba(255,255,255, ${(1 - ring) * 0.8 * a})`;
        ctx.beginPath(); ctx.arc(me[0], me[1], 26 + ring * 60, 0, TAU); ctx.stroke();
      }
    };
  }



  // Personal mode: the team's repository untouched above, your clone with the layer beside it.
  function personalLayers(env) {
    const box = env.rect('.layers-space');
    const tClone = env.cue('clone');
    const tByte = env.cue('byte');
    const w = box.width;
    const rowH = 110;
    const team = [box.left, box.top + 20];
    const mine = [box.left, box.top + 20 + rowH + 40];
    return (lt, a, t) => {
      if (a <= 0.01) return;
      const q1 = easeOut(clamp((lt - 0.4) / 0.6));
      const q2 = easeOut(clamp((lt - tClone) / 0.6));
      const box1 = (pos, stroke, alpha) => solid(() => {
        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#101828';
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 1;
        ctx.fillRect(pos[0], pos[1], w, rowH);
        ctx.strokeRect(pos[0] + 0.5, pos[1] + 0.5, w - 1, rowH - 1);
        ctx.globalAlpha = 1;
      });
      box1(team, 'rgba(30,41,57,1)', a * q1);
      label('TEAM REPOSITORY', team[0] + 26, team[1] + 44, C.gray, a * q1, 18, 700, 'left');
      mono('src/  test/  README.md  .gitignore', team[0] + 26, team[1] + 84, C.white, a * q1, 24);
      const diff = clamp((lt - tByte) / 0.5);
      if (diff > 0) {
        mono('diff: 0 bytes', team[0] + w - 26, team[1] + 44, C.green, a * diff, 22, 'right');
      }
      if (q2 > 0) {
        box1(mine, 'rgba(81,162,255,.9)', a * q2);
        label('YOUR CLONE', mine[0] + 26, mine[1] + 44, C.brand, a * q2, 18, 700, 'left');
        mono('src/  test/  README.md  .ai/  CLAUDE.local.md', mine[0] + 26, mine[1] + 84, C.white, a * q2, 24);
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 6]);
        ctx.strokeStyle = `rgba(81,162,255, ${0.6 * a * q2})`;
        ctx.beginPath(); ctx.moveTo(team[0] + 60, team[1] + rowH); ctx.lineTo(mine[0] + 60, mine[1]); ctx.stroke();
        ctx.setLineDash([]);
      }
    };
  }


  // Discovery: beacons ripple out of each runtime; a rendezvous hub answers from further away.
  function radar(env) {
    const box = env.rect('.radar-space');
    const tBeacon = env.cue('beacon');
    const tRv = env.cue('rendezvous');
    const W1 = box.width;
    const H1 = box.height;
    const lan = [[0.2, 0.32, C.s2], [0.42, 0.62, C.s1], [0.3, 0.86, C.s3], [0.58, 0.3, C.s4]]
      .map(([x, y, col], i) => ({ p: [box.left + x * W1, box.top + y * H1], col, t: 0.3 + i * 0.25 }));
    const hub = [box.left + 0.86 * W1, box.top + 0.5 * H1];
    return (lt, a, t) => {
      if (a <= 0.01) return;
      // the local network
      ctx.lineWidth = 1;
      ctx.strokeStyle = `rgba(255,255,255, ${0.14 * a})`;
      ctx.strokeRect(box.left + 0.5, box.top + 0.5, W1 * 0.7, H1 - 1);
      label('LOCAL NETWORK · MULTICAST', box.left + 20, box.top + 40, C.gray, a, 24, 700, 'left');
      lan.forEach((n, i) => {
        const q = clamp((lt - n.t) / 0.4);
        if (q <= 0) return;
        if (lt > tBeacon) {
          for (let k = 0; k < 3; k++) {
            const u = ((lt - tBeacon) * 0.5 + k / 3 + i * 0.17) % 1;
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = `rgba(${n.col}, ${(1 - u) * 0.6 * a})`;
            ctx.beginPath(); ctx.arc(n.p[0], n.p[1], 16 + u * 170, 0, TAU); ctx.stroke();
          }
        }
        glowDot(n.p[0], n.p[1], 9 * backOut(q), n.col, a);
        // heard: a thin link once the beacons have crossed
        lan.forEach((m, j) => {
          if (j <= i || lt < tBeacon + 0.8) return;
          const f = easeOut(clamp((lt - tBeacon - 0.8 - (i + j) * 0.1) / 0.5));
          ctx.lineWidth = 1;
          ctx.strokeStyle = `rgba(255,255,255, ${0.3 * a * f})`;
          ctx.beginPath(); ctx.moveTo(...n.p); ctx.lineTo(lerp(n.p[0], m.p[0], f), lerp(n.p[1], m.p[1], f)); ctx.stroke();
        });
      });
      // further out: the rendezvous hub, over TLS
      const h = easeOut(clamp((lt - tRv) / 0.6));
      if (h > 0) {
        solid(() => {
          ctx.globalAlpha = a * h;
          ctx.fillStyle = '#101828';
          ctx.strokeStyle = 'rgba(81,162,255,1)';
          ctx.lineWidth = 2;
          ctx.fillRect(hub[0] - 20, hub[1] - 20, 40, 40);
          ctx.strokeRect(hub[0] - 20, hub[1] - 20, 40, 40);
          ctx.globalAlpha = 1;
        });
        label('RENDEZVOUS', hub[0] - 20, hub[1] + 58, C.brand, a * h, 22, 700);
        label('HTTPS', hub[0] - 20, hub[1] + 86, C.gray, a * h, 20, 600);
        lan.forEach((n, i) => {
          const f = easeOut(clamp((lt - tRv - 0.3 - i * 0.12) / 0.5));
          ctx.setLineDash([5, 7]);
          ctx.lineWidth = 1.2;
          ctx.strokeStyle = `rgba(81,162,255, ${0.5 * a * f})`;
          ctx.beginPath(); ctx.moveTo(...hub); ctx.lineTo(lerp(hub[0], n.p[0], f), lerp(hub[1], n.p[1], f)); ctx.stroke();
          ctx.setLineDash([]);
        });
      }
    };
  }

  // Knowledge: ledger lines become candidates at the session's end; a person promotes one.
  function kbFlow(env) {
    const box = env.rect('.kb-space');
    const tD = env.cue('decisions');
    const tK = env.cue('knowledge');
    const tModel = env.cue('model');
    const tPerson = env.cue('person');
    const W1 = box.width;
    const rows = [
      ['SESSION LEDGER', 'decision', tD, C.gray, 'rgba(54,65,83,1)'],
      ['CANDIDATE', 'derived at the session end', tK, C.gray, 'rgba(54,65,83,1)'],
      ['CURATED', '.ai/repo/knowledge/curated/', tPerson, C.brand, 'rgba(81,162,255,1)'],
    ];
    const text = 'Normalise the callback URI before comparing state';
    const h = (box.height - 40) / 3;
    return (lt, a) => {
      if (a <= 0.01) return;
      rows.forEach(([cap, sub, at, col, stroke], i) => {
        const q = easeOut(clamp((lt - at + 0.2) / 0.6));
        if (q <= 0) return;
        const y = box.top + i * h + 10;
        solid(() => {
          ctx.globalAlpha = a * q;
          ctx.fillStyle = '#101828';
          ctx.strokeStyle = stroke;
          ctx.lineWidth = 1.5;
          ctx.fillRect(box.left, y, W1, h - 34);
          ctx.strokeRect(box.left + 0.5, y + 0.5, W1 - 1, h - 35);
          ctx.globalAlpha = 1;
        });
        label(cap, box.left + 26, y + 40, col, a * q, 20, 700, 'left');
        mono(sub, box.left + W1 - 26, y + 40, C.gray, a * q, 20, 'right');
        ctx.font = "600 32px -apple-system, 'SF Pro Text', sans-serif";
        ctx.textAlign = 'left';
        ctx.fillStyle = `rgba(255,255,255, ${a * q})`;
        const tw = ctx.measureText(text).width;
        const sc = Math.min(1, (W1 - 52) / tw);
        ctx.save();
        ctx.translate(box.left + 26, y + 92);
        ctx.scale(sc, sc);
        ctx.fillText(text, 0, 0);
        ctx.restore();
        inks.push({ text, x0: box.left + 26, x1: box.left + 26 + tw * sc, y0: y + 66, y1: y + 100 });
        if (i) {
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = `rgba(255,255,255, ${0.5 * a * q})`;
          ctx.beginPath(); ctx.moveTo(box.left + 60, y - 34); ctx.lineTo(box.left + 60, y); ctx.stroke();
        }
      });
      if (lt > tModel) {
        label('NO MODEL · FROM THE LEDGER AND GIT', box.left + 90, box.top + h - 4, C.gray, a * clamp((lt - tModel) / 0.4), 18, 700, 'left');
      }
    };
  }




  // Two machines; a review and a handover cross between them.
  function talk(env) {
    const box = env.rect('.talk-space');
    const L = [box.left + box.width * 0.2, box.top + box.height * 0.5];
    const R = [box.left + box.width * 0.8, box.top + box.height * 0.5];
    const ev = [
      { t: env.cue('review'), from: L, to: R, col: C.s1, up: true },
      { t: env.cue('answers'), from: R, to: L, col: C.s2, up: false },
      { t: env.cue('handover'), from: L, to: R, col: C.s4, up: true },
    ];
    const tCons = env.cue('consumed');
    const machine = (p, name, alpha) => {
      solid(() => {
        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#101828';
        ctx.strokeStyle = 'rgba(255,255,255,.7)';
        ctx.lineWidth = 1.5;
        ctx.fillRect(p[0] - 90, p[1] - 60, 180, 120);
        ctx.strokeRect(p[0] - 90, p[1] - 60, 180, 120);
        ctx.globalAlpha = 1;
      });
      label(name, p[0], p[1] + 96, C.gray, alpha, 20, 700);
    };
    return (lt, a, t) => {
      if (a <= 0.01) return;
      const q = easeOut(clamp((lt - 0.3) / 0.6));
      machine(L, 'LAPTOP', a * q);
      machine(R, 'WORKSTATION', a * q);
      ev.forEach((e) => {
        const k = lt - e.t;
        if (k < 0) return;
        const u = easeOut(clamp(k / 1.1));
        const lift = e.up ? -1 : 1;
        const peak = [(e.from[0] + e.to[0]) / 2, e.from[1] + lift * 170];
        const pt = (v) => [
          (1 - v) * (1 - v) * e.from[0] + 2 * (1 - v) * v * peak[0] + v * v * e.to[0],
          (1 - v) * (1 - v) * e.from[1] + 2 * (1 - v) * v * peak[1] + v * v * e.to[1],
        ];
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = `rgba(${e.col}, ${0.45 * a})`;
        ctx.beginPath();
        for (let v = 0; v <= u + 1e-6; v += 0.02) {
          const [x, y] = pt(v);
          if (v === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
        const [x, y] = pt(u);
        glowDot(x, y, 9, e.col, a);
      });
      if (lt > tCons) {
        const r = clamp((lt - tCons) / 0.9);
        ctx.lineWidth = 2;
        ctx.strokeStyle = `rgba(0,212,146, ${(1 - r) * a})`;
        ctx.strokeRect(R[0] - 90 - r * 30, R[1] - 60 - r * 30, 180 + r * 60, 120 + r * 60);
      }
    };
  }




  // A git graph: the trunk, three branches in their own worktrees, merging back.
  function branches(env) {
    const box = env.rect('.branch-space');
    const y0 = box.top + 40;
    const lanes = [[C.s2, 0.18], [C.s1, 0.38], [C.s3, 0.58]];
    return (lt, a, t) => {
      if (a <= 0.01) return;
      const q = easeOut(clamp((lt - 0.4) / 1.2));
      ctx.lineWidth = 3;
      ctx.strokeStyle = `rgba(255,255,255, ${0.7 * a})`;
      ctx.beginPath(); ctx.moveTo(box.left, y0); ctx.lineTo(box.left + box.width * q, y0); ctx.stroke();
      for (let k = 0; k < 7; k++) {
        const x = box.left + (k / 6) * box.width;
        if (x <= box.left + box.width * q) glowDot(x, y0, 5, C.white, a);
      }
      lanes.forEach(([col, x0], i) => {
        const f = easeOut(clamp((lt - 1.2 - i * 0.4) / 0.9));
        if (f <= 0) return;
        const xs = box.left + x0 * box.width;
        const xe = xs + box.width * 0.36;
        const yl = y0 + 60 + i * 50;
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = `rgba(${col}, ${0.85 * a})`;
        ctx.beginPath();
        ctx.moveTo(xs, y0);
        ctx.quadraticCurveTo(xs, yl, xs + 40, yl);
        ctx.lineTo(lerp(xs + 40, xe - 40, f), yl);
        if (f >= 1) ctx.quadraticCurveTo(xe, yl, xe, y0);
        ctx.stroke();
        for (let k = 1; k <= 3; k++) {
          const x = xs + 40 + (k / 4) * (xe - xs - 80);
          if (x <= lerp(xs + 40, xe - 40, f)) glowDot(x, yl, 4.5, col, a);
        }
      });
    };
  }








  // A flow field: particles born at seeded places, carried by Perlin noise, drawn as trails.
  function flow(o) {
    const cfg = {
      count: 600, scale: 0.0015, zs: 0.07, turn: 2, speed: 3, life: 4, trail: 20, width: 1.6,
      alpha: 0.45, colors: [C.violet], field: null, seed: 1, ...o,
    };
    return (lt, a, t) => {
      if (a <= 0.01) return;
      ctx.lineWidth = cfg.width;
      ctx.lineCap = 'round';
      for (let k = 0; k < cfg.count; k++) {
        const hk = mulberry(k * 31 + cfg.seed * 1000);
        const L = cfg.life * (0.6 + 0.8 * hk());
        const ph = hk() * L;
        const age = (t + ph) % L;
        const r = mulberry(k * 7919 + Math.floor((t + ph) / L) * 104729 + cfg.seed);
        let [x, y] = cfg.spawn ? cfg.spawn(r) : [r() * (W + 240) - 120, r() * (H + 240) - 120];
        const steps = Math.floor(age / DT);
        const t0 = t - age;
        const from = Math.max(0, steps - cfg.trail);
        ctx.beginPath();
        for (let s = 0; s <= steps; s++) {
          if (s === from) ctx.moveTo(x, y);
          else if (s > from) ctx.lineTo(x, y);
          const tt = t0 + s * DT;
          const ang = cfg.field
            ? cfg.field(x, y, tt)
            : noise3(x * cfg.scale, y * cfg.scale, tt * cfg.zs) * TAU * cfg.turn;
          x += Math.cos(ang) * cfg.speed;
          y += Math.sin(ang) * cfg.speed;
        }
        const life = Math.min(1, age / 0.7, (L - age) / 0.7);
        ctx.strokeStyle = `rgba(${cfg.colors[k % cfg.colors.length]}, ${cfg.alpha * a * life})`;
        ctx.stroke();
      }
    };
  }

  // The brand mark is a prism: white light enters, three colours leave.
  function prism(env, selector, o) {
    const cfg = { count: 340, start: 0.4, period: 1.9, ...o };
    const box = env.rect(selector);
    const P = (x, y) => [box.left + (x / 64) * box.width, box.top + (y / 64) * box.height];
    const A = [-60, P(0, 32)[1]];
    const B = P(20, 32);
    const rays = [
      { from: P(44, 24), dir: [16, -8], color: C.prismV },
      { from: P(46, 32), dir: [14, 0], color: C.prismS },
      { from: P(44, 40), dir: [16, 8], color: C.prismE },
    ].map((r) => {
      const len = Math.hypot(...r.dir);
      const d = [r.dir[0] / len, r.dir[1] / len];
      const reach = (W + 120 - r.from[0]) / Math.max(0.2, d[0]);
      return { ...r, d, to: [r.from[0] + d[0] * reach, r.from[1] + d[1] * reach] };
    });
    const centre = P(32, 34);
    const pos = (u, ray, k) => {
      let x; let y; let spread;
      if (u < 0.42) {
        const q = u / 0.42;
        x = lerp(A[0], B[0], q); y = lerp(A[1], B[1], q); spread = 5;
      } else if (u < 0.52) {
        const q = (u - 0.42) / 0.1;
        x = lerp(B[0], ray.from[0], q); y = lerp(B[1], ray.from[1], q); spread = 3;
      } else {
        const q = (u - 0.52) / 0.48;
        x = lerp(ray.from[0], ray.to[0], q); y = lerp(ray.from[1], ray.to[1], q); spread = 6 + q * 70;
      }
      const n = noise3(k * 0.37, u * 3, 0.5) * spread * 2;
      return [x - ray.d[1] * n * (u > 0.52 ? 1 : 0), y + n];
    };
    return (lt, a, t) => {
      const on = a * easeOut(clamp((lt - cfg.start) / 0.8));
      if (on <= 0.01) return;
      ctx.lineCap = 'round';
      // the light itself
      ctx.lineWidth = 26;
      ctx.strokeStyle = `rgba(${C.white}, ${0.07 * on})`;
      ctx.beginPath(); ctx.moveTo(...A); ctx.lineTo(...B); ctx.stroke();
      rays.forEach((r, i) => {
        const shimmer = 0.75 + 0.25 * Math.sin(t * 3 + i * 2);
        [60, 28, 8].forEach((wd, j) => {
          ctx.lineWidth = wd;
          ctx.strokeStyle = `rgba(${r.color}, ${[0.05, 0.08, 0.22][j] * on * shimmer})`;
          ctx.beginPath(); ctx.moveTo(...r.from); ctx.lineTo(...r.to); ctx.stroke();
        });
      });
      glowDot(centre[0], centre[1], 34, C.white, 0.18 * on * (0.8 + 0.2 * Math.sin(t * 4)));
      // photons
      ctx.lineWidth = 3;
      for (let k = 0; k < cfg.count; k++) {
        const h = mulberry(k * 97 + 5);
        const T = cfg.period * (0.75 + 0.5 * h());
        const u = ((t + h() * T) % T) / T;
        const ray = rays[k % 3];
        const head = pos(u, ray, k);
        const tail = pos(Math.max(0, u - 0.035), ray, k);
        const color = u < 0.5 ? C.white : ray.color;
        ctx.strokeStyle = `rgba(${color}, ${0.8 * on * Math.min(1, (1 - u) * 6)})`;
        ctx.beginPath(); ctx.moveTo(...tail); ctx.lineTo(...head); ctx.stroke();
      }
    };
  }

  // A shockwave and a burst of sparks where the stamp lands.
  function shock(env, selector, cue) {
    const box = env.rect(selector);
    const cx = box.left + box.width / 2;
    const cy = box.top + box.height / 2;
    const at = env.cue(cue) + 0.28;
    return (lt, a) => {
      const k = lt - at;
      if (k < 0 || k > 2) return;
      [0, 0.12, 0.26].forEach((d) => {
        const q = (k - d) / 1.5;
        if (q <= 0 || q >= 1) return;
        ctx.lineWidth = 10 * (1 - q) + 1;
        ctx.strokeStyle = `rgba(${C.red}, ${0.6 * (1 - q) * a})`;
        ctx.beginPath(); ctx.arc(cx, cy, 80 + 1300 * easeOut(q), 0, TAU); ctx.stroke();
      });
      ctx.lineWidth = 3;
      for (let i = 0; i < 180; i++) {
        const h = mulberry(i * 13 + 3);
        const ang = h() * TAU;
        const v = 500 + 1100 * h();
        const dist = (v * (1 - Math.exp(-k * 3))) / 3;
        const fadeOut = 1 - clamp(k / (0.9 + h()));
        if (fadeOut <= 0) continue;
        const r0 = 60 + dist * 0.82;
        const r1 = 60 + dist;
        ctx.strokeStyle = `rgba(${i % 4 ? C.red : C.amber}, ${fadeOut * a})`;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0);
        ctx.lineTo(cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1);
        ctx.stroke();
      }
    };
  }


  // Particles streaming from the policy into every file it writes.
  function streams(env) {
    const src = env.rect('.src');
    const outs = env.rects('.file');
    const start = env.cue('writes');
    const colors = [C.s2, C.s1, C.s3];
    const p0 = [src.left + src.width / 2, src.bottom];
    const bez = (p1, p2, p3, u) => {
      const v = 1 - u;
      const a0 = p0;
      const b1 = [p0[0], p0[1] + 80];
      return [0, 1].map((d) => v * v * v * a0[d] + 3 * v * v * u * b1[d] + 3 * v * u * u * p2[d] + u * u * u * p3[d]);
    };
    return (lt, a) => {
      const run = lt - start;
      if (run < 0 || a <= 0.01) return;
      outs.forEach((o, j) => {
        const p3 = [o.left + o.width / 2, o.top];
        const p2 = [p3[0], p3[1] - 80];
        for (let k = 0; k < 60; k++) {
          const born = k / 60 / 0.7;
          if (run < born) continue;
          const u = (run * 0.7 - k / 60 + 10) % 1;
          const [x, y] = bez(null, p2, p3, u);
          const wob = noise3(k * 0.5, j, run * 0.8) * 10;
          glowDot(x + wob, y, 3.2, colors[j], 0.85 * a * Math.sin(Math.PI * u));
        }
      });
    };
  }


  // Concurrent rivers: bands of particles crossing the frame side by side, one series colour
  // each, like parallel sessions working at once.
  function rivers(seed, colors, o = {}) {
    const bands = o.bands || [[0.18, -0.08], [0.5, 0.06], [0.82, -0.04]];
    return bands.map(([yc, tilt], i) => flow({
      colors: [colors[i % colors.length]], count: o.count || 150, speed: o.speed || 3.2, life: o.life || 6,
      trail: 26, width: 1.8, alpha: o.alpha || 0.2, seed: seed * 10 + i,
      spawn: (r) => [r() * W * 0.5 - 260, H * yc + (r() - 0.5) * H * (o.spread || 0.12)],
      field: (x, y, t) => tilt + noise3(x * 0.0022, y * 0.0022 + i * 7, t * 0.08) * 0.9,
    }));
  }

  const vortex = (cx, cy) => (x, y, t) => Math.atan2(y - cy, x - cx) + Math.PI / 2 + 0.22
    + noise3(x * 0.002, y * 0.002, t * 0.1) * 1.2;

  let painters = [];
  window.GEN = { glowDot, fxDot, fx, label, mono, solid, noise3, rivers, flow, C, inks, get ctx() { return ctx; } };
  window.genSetup = ({ scenes }) => {
    const V = window.VIZ;
    painters = scenes.map((s) => {
      const env = {
        el: s.el,
        rect: (sel) => s.el.querySelector(sel).getBoundingClientRect(),
        rects: (sel) => [...s.el.querySelectorAll(sel)].map((e) => e.getBoundingClientRect()),
        cue: s.cue,
      };
      const layers = {
        hook: () => [flow({ colors: [C.white], count: 260, speed: 1.1, alpha: 0.12, seed: 2, zs: 0.04 })],
        loop: () => [flow({ colors: [C.white], count: 260, speed: 1.1, alpha: 0.12, seed: 2, zs: 0.04 })],
        stats: () => [flow({ colors: [C.red, C.white], count: 640, scale: 0.003, turn: 3, speed: 4.2,
          alpha: 0.3, life: 3, seed: 3 })],
        reveal: () => [...rivers(21, [C.white, C.sky], { alpha: 0.12, count: 110 }), flow({ colors: [C.white], count: 200, speed: 1.4, alpha: 0.1, seed: 4 }),
          prism(env, '.mark-big', { start: 0.9 })],
        setup: () => [...rivers(22, [C.white, C.sky]), flow({ colors: [C.white], count: 260, speed: 1.6, alpha: 0.12, seed: 10 })],
        context: () => [...rivers(23, [C.white, C.sky], { alpha: 0.14 }), flow({ colors: [C.white], count: 160, speed: 1.3, alpha: 0.1, seed: 11 }), V.tree(env)],
        terminal: () => [...rivers(24, [C.white, C.sky], { alpha: 0.12, count: 120 }), flow({ colors: [C.white], count: 220, speed: 1.6, alpha: 0.1, seed: 5 }),
          shock(env, '.stamp', 'refuses')],
        provenance: () => [...rivers(25, [C.white, C.sky], { alpha: 0.14 }), flow({ colors: [C.white], count: 180, speed: 1.2, alpha: 0.1, seed: 15 }), V.chain(env)],
        mesh: () => [...rivers(26, [C.s2, C.s1, C.s3], { alpha: 0.16 }), flow({ colors: [C.white], count: 140, speed: 1.3, alpha: 0.08, seed: 6 }), V.mesh(env)],
        machines: () => [...rivers(27, [C.s1, C.s2, C.s3, C.s4, C.s5], { bands: [[0.12, 0.02], [0.32, -0.05], [0.52, 0.04], [0.72, -0.03], [0.92, 0.05]], count: 110, alpha: 0.16 }), flow({ colors: [C.white], count: 160, speed: 1.3, alpha: 0.08, seed: 16 }), V.zones(env)],
        security: () => [...rivers(28, [C.white, C.sky], { alpha: 0.12, count: 120 }), flow({ colors: [C.white], count: 140, speed: 1.2, alpha: 0.08, seed: 17 }), trust(env)],
        monitor: () => [...rivers(29, [C.white, C.sky], { bands: [[0.2, 0], [0.4, 0], [0.6, 0], [0.8, 0]], count: 130, alpha: 0.18 }), flow({ colors: [C.white], count: 160, speed: 1.4, alpha: 0.08, seed: 12 }), V.lanes(env)],
        providers: () => [...rivers(34, [C.s2, C.s1, C.s3], { alpha: 0.12, count: 110 }), V.clients(env)],
        models: () => [...rivers(35, [C.white, C.sky], { bands: [[0.2, 0.02], [0.45, -0.03], [0.7, 0.03], [0.9, -0.02]], alpha: 0.1, count: 100 }), V.models(env)],
        personal: () => [...rivers(36, [C.white, C.sky], { bands: [[0.25, 0.03], [0.75, -0.03]], alpha: 0.12 }), personalLayers(env)],
        discovery: () => [...rivers(37, [C.s2, C.s1, C.s3], { alpha: 0.1, count: 100 }), radar(env)],
        knowledge: () => [...rivers(38, [C.white, C.sky], { bands: [[0.3, 0.03], [0.7, -0.03]], alpha: 0.12 }), kbFlow(env)],
        session: () => [...rivers(39, [C.white, C.sky], { bands: [[0.3, 0.02], [0.75, -0.02]], alpha: 0.12 })],
        generate: () => [...rivers(40, [C.white, C.sky], { alpha: 0.1, count: 100 }), V.fan(env)],
        mcp: () => [...rivers(41, [C.s2, C.s1, C.s3], { alpha: 0.1, count: 100 }), V.server(env)],
        blackboard: () => [...rivers(42, [C.s2, C.s1, C.s3], { alpha: 0.12 })],
        crosstalk: () => [...rivers(43, [C.s1, C.s2, C.s4], { alpha: 0.12 }), talk(env)],
        intent: () => [...rivers(44, [C.white, C.sky], { alpha: 0.1, count: 100 }), V.ladder(env)],
        reasoning: () => [...rivers(45, [C.white, C.sky], { bands: [[0.3, 0.02], [0.8, -0.02]], alpha: 0.1 }), V.reasoning(env)],
        worktrees: () => [...rivers(46, [C.s2, C.s1, C.s3], { alpha: 0.12 }), branches(env)],
        cockpit: () => [...rivers(47, [C.white, C.sky], { alpha: 0.08, count: 90 })],
        doctrine: () => [...rivers(48, [C.white, C.sky], { bands: [[0.35, 0.02], [0.8, -0.02]], alpha: 0.08 }), V.doctrine(env)],
        hooks: () => [...rivers(52, [C.white, C.sky], { alpha: 0.06, count: 90 }), V.hooks(env)],
        plan: () => [...rivers(54, [C.white, C.sky], { alpha: 0.08, count: 90 }), V.states(env)],
        collision: () => [...rivers(55, [C.white, C.sky], { bands: [[0.3, 0.02], [0.75, -0.02]], alpha: 0.08 }), V.scan(env)],
        claims: () => [...rivers(56, [C.s2, C.s1], { alpha: 0.12, count: 100 }), V.claim(env)],
        seats: () => [...rivers(57, [C.s2, C.s1, C.s3, C.s4], { alpha: 0.12, count: 110 }), V.seats(env)],
        trains: () => [...rivers(58, [C.s3, C.s1, C.s2], { alpha: 0.12, count: 110 }), V.trains(env)],
        builds: () => [...rivers(60, [C.s2, C.s1, C.s3], { alpha: 0.1, count: 100 }), V.builds(env)],
        deploy: () => [...rivers(61, [C.s2, C.s1, C.s3, C.s4], { alpha: 0.1, count: 100 }), flow({ colors: [C.white], count: 140, speed: 1.3, alpha: 0.08, seed: 19 }), V.deploy(env)],
        cache: () => [...rivers(59, [C.s2, C.s1, C.s3], { alpha: 0.12, count: 100 }), flow({ colors: [C.white], count: 140, speed: 1.3, alpha: 0.08, seed: 18 }), V.cache(env)],
        privacy: () => [...rivers(53, [C.white, C.sky], { alpha: 0.06, count: 90 })],
        economics: () => [...rivers(51, [C.white, C.sky], { bands: [[0.3, 0.02], [0.75, -0.02]], alpha: 0.08 })],
        doctor: () => [...rivers(49, [C.white, C.sky], { bands: [[0.3, 0.02], [0.75, -0.02]], alpha: 0.1 }), V.doctor(env)],
        release: () => [...rivers(50, [C.white, C.sky], { alpha: 0.06, count: 90 })],
        policy: () => [...rivers(30, [C.white, C.sky], { alpha: 0.16 }), flow({ colors: [C.white], count: 200, speed: 1.6, alpha: 0.1, seed: 7 }), streams(env)],
        continuity: () => [...rivers(31, [C.white, C.sky], { alpha: 0.14 }), flow({ colors: [C.white], count: 200, speed: 1.4, alpha: 0.1, seed: 13 }), handoff(env)],
        local: () => [...rivers(32, [C.white, C.sky], { alpha: 0.14 }), flow({ colors: [C.white, C.sky], count: 560, speed: 3, alpha: 0.26, seed: 8, life: 5,
          field: vortex(500, 860) })],
        beliefs: () => [flow({ colors: [C.white], count: 240, speed: 1, alpha: 0.1, seed: 14, zs: 0.04 })],
        cta: () => [...rivers(33, [C.white, C.sky], { alpha: 0.14, count: 130 }), flow({ colors: [C.white], count: 300, speed: 1.8, alpha: 0.14, seed: 9 }),
          prism(env, '.mark-cta', { start: 0.75, count: 260 })],
      }[s.id];
      return layers ? layers() : [];
    });
  };

  window.genRender = (t, states) => {
    frame = () => {
      inks.length = 0;
      ctx.clearRect(0, 0, W, H);
      fx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';
      states.forEach((st, i) => {
        if (st.opacity <= 0.005) return;
        try {
          painters[i].forEach((paint) => paint(st.lt, st.opacity, t));
        } catch (e) {
          throw new Error(`painter of scene ${i} at lt ${st.lt.toFixed(2)}: ${e.stack}`);
        }
      });
      ctx.globalCompositeOperation = 'source-over';
    };
    P.redraw();
  };
})();
