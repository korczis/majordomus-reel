// Generative layer in the spirit of p5.js: flow fields, a prism that splits light, a living mesh
// graph. Every particle is a pure function of time, so any frame renders alone and identically.
(() => {
  const W = 1080;
  const H = 1920;
  const DT = 1 / 30;
  const TAU = Math.PI * 2;
  const canvas = document.getElementById('gen');
  const inks = [];
  window.genInk = () => inks;
  const ctx = canvas.getContext('2d');
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
  function noise3(x, y, z) {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const Z = Math.floor(z) & 255;
    x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
    const u = fade(x); const v = fade(y); const w = fade(z);
    const A = perm[X] + Y; const AA = perm[A] + Z; const AB = perm[A + 1] + Z;
    const B = perm[X + 1] + Y; const BA = perm[B] + Z; const BB = perm[B + 1] + Z;
    return lerp(
      lerp(lerp(grad(perm[AA], x, y, z), grad(perm[BA], x - 1, y, z), u),
        lerp(grad(perm[AB], x, y - 1, z), grad(perm[BB], x - 1, y - 1, z), u), v),
      lerp(lerp(grad(perm[AA + 1], x, y, z - 1), grad(perm[BA + 1], x - 1, y, z - 1), u),
        lerp(grad(perm[AB + 1], x, y - 1, z - 1), grad(perm[BB + 1], x - 1, y - 1, z - 1), u), v),
      w);
  }

  const C = {
    // the site's dark roles: fg white, muted gray-400, accent blue-400, ok emerald-400,
    // bad rose-400, warn orange-400 (share/design/tokens.yaml)
    violet: '255,255,255', sky: '153,161,175', green: '0,212,146', red: '255,99,126',
    white: '255,255,255', amber: '255,137,4', gray: '153,161,175', brand: '81,162,255',
    s1: '81,162,255', s2: '255,137,4', s3: '0,212,146', s4: '166,132,255', s5: '0,211,242',
    prismV: '167,139,250', prismS: '56,189,248', prismE: '52,211,153',
  };

  function glowDot(x, y, r, color, alpha) {
    if (alpha > 0.5 && r >= 6) inks.push({ shape: true, text: 'node', x0: x - r, y0: y - r, x1: x + r, y1: y + r });
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 4);
    g.addColorStop(0, `rgba(${color}, ${alpha})`);
    g.addColorStop(0.25, `rgba(${color}, ${alpha * 0.35})`);
    g.addColorStop(1, `rgba(${color}, 0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r * 4, 0, TAU);
    ctx.fill();
    ctx.fillStyle = `rgba(255,255,255, ${alpha})`;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.55, 0, TAU);
    ctx.fill();
  }


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

  // The repository as a tree; the rules an agent reads light up along one path.
  function tree(env) {
    const box = env.rect('.tree-space');
    const tPath = env.cue('path');
    const tNothing = env.cue('nothing');
    const sx = box.width / 920;
    const ys = [70, 270, 480, 680].map((y) => box.top + (y * box.height) / 760);
    const nodes = [{ x: box.left + box.width / 2, y: ys[0], lvl: 0, name: 'repo/', parent: -1, path: true }];
    const top = ['docs/', 'src/', 'test/', 'site/', '.ai/'];
    top.forEach((name, i) => {
      nodes.push({ x: box.left + (70 + i * 195) * sx, y: ys[1], lvl: 1, name, parent: 0, path: name === 'src/' });
    });
    const second = { 'src/': ['cli/', 'parser/', 'mesh/'] };
    for (let i = 1; i <= 5; i++) {
      const parent = nodes[i];
      const names = second[parent.name] || ['', '', ''];
      names.forEach((name, k) => {
        nodes.push({ x: parent.x + (k - 1) * 58 * sx, y: ys[2] + (k === 1 ? 0 : 30), lvl: 2, name, parent: i,
          path: name === 'parser/' });
      });
    }
    nodes.slice(6).forEach((parent, j) => {
      const idx = 6 + j;
      const leaves = parent.name === 'parser/' ? ['lexer.rs', 'ast.rs', 'mod.rs'] : ['', ''];
      leaves.forEach((name, k) => {
        const spread = leaves.length === 3 ? 70 : 22;
        nodes.push({ x: parent.x + (k - (leaves.length - 1) / 2) * spread, y: ys[3] + (k % 2) * 34, lvl: 3,
          name, parent: idx, path: name === 'lexer.rs' });
      });
    });
    const pathNodes = nodes.filter((n) => n.path);
    return (lt, a, t) => {
      if (a <= 0.01) return;
      const dimmed = 1 - 0.7 * easeOut(clamp((lt - tPath) / 0.8));
      nodes.forEach((n, i) => {
        if (n.parent < 0) return;
        const p = nodes[n.parent];
        const f = easeOut(clamp((lt - 0.3 - n.lvl * 0.35 - (i % 5) * 0.03) / 0.5));
        if (f <= 0) return;
        ctx.lineWidth = 2;
        ctx.strokeStyle = `rgba(${C.white}, ${0.22 * a * (n.path ? 1 : dimmed)})`;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.bezierCurveTo(p.x, (p.y + n.y) / 2, n.x, (p.y + n.y) / 2, lerp(p.x, n.x, f), lerp(p.y, n.y, f));
        ctx.stroke();
        // idle data trickling down every branch
        const u = (t * 0.5 + i * 0.137) % 1;
        if (f >= 1 && !n.path) {
          const bx = lerp(lerp(p.x, p.x, u), lerp(n.x, n.x, u), u);
          const by = lerp(p.y, n.y, u);
          glowDot(bx, by, 2.4, C.sky, 0.5 * a * dimmed);
        }
      });
      nodes.forEach((n) => {
        const q = clamp((lt - 0.3 - n.lvl * 0.35) / 0.4);
        if (q <= 0) return;
        const r = [16, 11, 8, 6][n.lvl] * backOut(q);
        glowDot(n.x, n.y, r, n.path ? C.violet : C.sky, (n.path ? 0.9 : 0.6 * dimmed) * a);
        if (n.name && (n.lvl === 1 || n.path)) {
          mono(n.name, n.x + 18, n.y - 16, C.white, (n.path ? 0.95 : 0.45 * dimmed) * a * q, n.path ? 28 : 22);
        }
      });
      // the resolved chain lights up, segment by segment
      for (let k = 1; k < pathNodes.length; k++) {
        const p = pathNodes[k - 1];
        const n = pathNodes[k];
        const f = easeOut(clamp((lt - tPath - (k - 1) * 0.3) / 0.35));
        if (f <= 0) continue;
        [14, 6].forEach((wd, j) => {
          ctx.lineWidth = wd;
          ctx.strokeStyle = `rgba(${[C.violet, C.white][j]}, ${[0.35, 0.9][j] * a})`;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.bezierCurveTo(p.x, (p.y + n.y) / 2, n.x, (p.y + n.y) / 2, lerp(p.x, n.x, f), lerp(p.y, n.y, f));
          ctx.stroke();
        });
        if (f >= 1) {
          const ring = clamp((lt - tPath - (k - 1) * 0.3 - 0.35) / 0.8);
          if (ring < 1) {
            ctx.lineWidth = 3;
            ctx.strokeStyle = `rgba(${C.violet}, ${(1 - ring) * a})`;
            ctx.beginPath(); ctx.arc(n.x, n.y, 14 + ring * 60, 0, TAU); ctx.stroke();
          }
        }
      }
      // an orb carries the context down the chain, again and again
      if (lt > tNothing) {
        const u = ((lt - tNothing) % 1.4) / 1.4;
        const seg = Math.min(pathNodes.length - 2, Math.floor(u * (pathNodes.length - 1)));
        const v = u * (pathNodes.length - 1) - seg;
        const p = pathNodes[seg];
        const n = pathNodes[seg + 1];
        glowDot(lerp(p.x, n.x, v), lerp(p.y, n.y, v), 12, C.white, a);
      }
    };
  }

  // Swimlanes: events arrive on the right, drift left, and link lanes when one causes another.
  function lanes(env) {
    const box = env.rect('.lane-space');
    const names = ['sessions', 'claims', 'reviews', 'merges'];
    const cues = ['session', 'claim', 'review', 'machine'].map((c) => env.cue(c));
    const colors = [C.s1, C.s2, C.s3, C.s4];
    const speed = 230;
    const right = box.right - 30;
    const left = box.left + 10;
    const laneY = (i) => box.top + 60 + (i * (box.height - 130)) / 3;
    const events = (i, lt) => {
      const out = [];
      const slot = 0.32;
      const last = Math.floor(lt / slot);
      for (let k = Math.max(0, last - 14); k <= last; k++) {
        const h = mulberry(i * 1000 + k * 7 + 1);
        if (h() > 0.45) continue;
        const te = k * slot + h() * slot;
        if (te > lt) continue;
        out.push({ te, big: false, k });
      }
      if (lt > cues[i]) out.push({ te: cues[i], big: true, k: -1 });
      return out;
    };
    return (lt, a, t) => {
      if (a <= 0.01) return;
      names.forEach((name, i) => {
        const q = easeOut(clamp((lt - 0.2 - i * 0.15) / 0.5));
        if (q <= 0) return;
        const y = laneY(i);
        ctx.lineWidth = 2;
        ctx.strokeStyle = `rgba(${colors[i]}, ${0.25 * a * q})`;
        ctx.beginPath(); ctx.moveTo(right, y); ctx.lineTo(lerp(right, left, q), y); ctx.stroke();
        label(name.toUpperCase(), left, y - 26, C.white, 0.55 * a * q, 20, 700, 'left');
        events(i, lt).forEach((ev) => {
          const x = right - (lt - ev.te) * speed;
          if (x < left) return;
          const fadeIn = clamp((lt - ev.te) / 0.15);
          const edgeFade = clamp((x - left) / 120);
          ctx.lineWidth = ev.big ? 5 : 3;
          ctx.strokeStyle = `rgba(${colors[i]}, ${0.5 * a * edgeFade})`;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(Math.min(right, x + (ev.big ? 120 : 50)), y); ctx.stroke();
          glowDot(x, y, ev.big ? 14 : 6, colors[i], a * fadeIn * edgeFade);
          if (ev.big) {
            const ring = clamp((lt - ev.te) / 0.9);
            if (ring < 1) {
              ctx.lineWidth = 3;
              ctx.strokeStyle = `rgba(${colors[i]}, ${(1 - ring) * a})`;
              ctx.beginPath(); ctx.arc(x, y, 16 + ring * 70, 0, TAU); ctx.stroke();
            }
          }
          // a cause and its effect, one lane down
          if (i < 3 && ev.k >= 0 && ev.k % 3 === 0) {
            const ny = laneY(i + 1);
            const nx = x - 80;
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = `rgba(${C.white}, ${0.18 * a * edgeFade})`;
            ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x - 10, (y + ny) / 2, nx, ny); ctx.stroke();
          }
        });
      });
      // the present
      ctx.lineWidth = 2;
      ctx.strokeStyle = `rgba(${C.white}, ${0.35 * a})`;
      ctx.beginPath(); ctx.moveTo(right, laneY(0) - 50); ctx.lineTo(right, laneY(3) + 30); ctx.stroke();
      mono('now', right, laneY(3) + 66, C.white, 0.5 * a, 20, 'center');
    };
  }

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
      label('TONIGHT', A[0], A[1] + 70, C.white, 0.6 * a * appear, 22);
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


  // Provenance: claim, test, commit, release, each a block linked to the next by its hash.
  function chain(env) {
    const box = env.rect('.chain-space');
    const blocks = [
      { label: 'CLAIM', value: 'finish refuses', cue: env.cue('record') },
      { label: 'TEST', value: 'suite:parse', cue: env.cue('test') },
      { label: 'COMMIT', value: '2034d4a', cue: env.cue('commit') },
      { label: 'RELEASE', value: '1.0.0-alpha.6', cue: env.cue('provenance') },
    ];
    const w = (box.width - 3 * 30) / 4;
    const y = box.top + 90;
    return (lt, a) => {
      if (a <= 0.01) return;
      blocks.forEach((b, i) => {
        const q = easeOut(clamp((lt - b.cue) / 0.5));
        if (q <= 0) return;
        const x = box.left + i * (w + 30);
        solid(() => {
          ctx.globalAlpha = a * q;
          ctx.fillStyle = '#101828';
          ctx.strokeStyle = i === 3 ? 'rgba(0,212,146,.9)' : 'rgba(255,255,255,.3)';
          ctx.lineWidth = 1;
          ctx.fillRect(x, y, w, 120);
          ctx.strokeRect(x + 0.5, y + 0.5, w - 1, 119);
          ctx.globalAlpha = 1;
        });
        label(b.label, x + 18, y + 38, C.gray, a * q, 17, 700, 'left');
        mono(b.value, x + 18, y + 84, C.white, a * q, 22);
        if (i > 0) {
          const f = easeOut(clamp((lt - b.cue + 0.2) / 0.4));
          const x0 = x - 30;
          ctx.lineWidth = 2;
          ctx.strokeStyle = `rgba(255,255,255, ${0.6 * a})`;
          ctx.beginPath(); ctx.moveTo(x0, y + 60); ctx.lineTo(x0 + 30 * f, y + 60); ctx.stroke();
        }
      });
      // a pulse runs the length of the chain once it is whole
      const done = blocks[3].cue + 0.6;
      if (lt > done) {
        const u = ((lt - done) % 1.6) / 1.6;
        glowDot(box.left + u * box.width, y + 60, 6, C.green, a * Math.sin(Math.PI * u));
      }
    };
  }

  // Machines in three places, linked: a LAN at home, a TLS hub in the datacenter, a tailnet at work.
  function zones(env) {
    const box = env.rect('.zone-space');
    const W0 = box.width;
    const H0 = box.height;
    const zs = [
      { name: 'HOME', via: 'LAN', x: 0, y: 0.03, w: 0.46, h: 0.42, n: 2, cue: env.cue('home') },
      { name: 'DATACENTER', via: 'HTTPS HUB', x: 0.54, y: 0.03, w: 0.46, h: 0.42, n: 4, cue: env.cue('datacenter') },
      { name: 'COMPANY', via: 'TAILNET', x: 0, y: 0.55, w: 1, h: 0.42, n: 7, cue: env.cue('company') },
    ].map((z) => ({ ...z, X: box.left + z.x * W0, Y: box.top + z.y * H0, Wd: z.w * W0, Hd: z.h * H0 }));
    zs.forEach((z) => {
      z.nodes = Array.from({ length: z.n }, (_, k) => [
        z.X + z.Wd * ((k + 1) / (z.n + 1)),
        z.Y + z.Hd * (0.62 + (k % 2 ? 0.12 : -0.08)),
      ]);
      z.hub = z.nodes[Math.floor(z.n / 2)];
    });
    const links = [[0, 1], [1, 2], [0, 2]];
    return (lt, a, t) => {
      if (a <= 0.01) return;
      zs.forEach((z) => {
        const q = easeOut(clamp((lt - z.cue + 0.3) / 0.6));
        if (q <= 0) return;
        ctx.lineWidth = 1;
        ctx.strokeStyle = `rgba(255,255,255, ${0.28 * a * q})`;
        ctx.strokeRect(z.X + 0.5, z.Y + 0.5, z.Wd - 1, z.Hd - 1);
        label(z.name, z.X + 20, z.Y + 36, C.white, a * q, 19, 700, 'left');
        label(z.via, z.X + z.Wd - 20, z.Y + 36, C.gray, a * q, 17, 600, 'right');
        z.nodes.forEach((p, k) => {
          const r = clamp((lt - z.cue - k * 0.08) / 0.3);
          if (r <= 0) return;
          solid(() => {
            ctx.globalAlpha = a * r;
            ctx.fillStyle = '#101828';
            ctx.strokeStyle = 'rgba(255,255,255,.8)';
            ctx.lineWidth = 1.5;
            ctx.fillRect(p[0] - 14, p[1] - 14, 28, 28);
            ctx.strokeRect(p[0] - 14, p[1] - 14, 28, 28);
            ctx.globalAlpha = 1;
          });
          glowDot(p[0], p[1], 3, C.white, a * r * (0.6 + 0.4 * Math.sin(t * 3 + k)));
          if (k > 0) {
            ctx.lineWidth = 1;
            ctx.strokeStyle = `rgba(255,255,255, ${0.25 * a * r})`;
            ctx.beginPath(); ctx.moveTo(z.nodes[k - 1][0] + 14, z.nodes[k - 1][1]); ctx.lineTo(p[0] - 14, p[1]); ctx.stroke();
          }
        });
      });
      links.forEach(([i, j], e) => {
        const ready = Math.max(zs[i].cue, zs[j].cue) + 0.4;
        const f = easeOut(clamp((lt - ready) / 0.6));
        if (f <= 0) return;
        const p = zs[i].hub;
        const q = zs[j].hub;
        ctx.setLineDash(e === 2 ? [6, 8] : []);
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = `rgba(255,255,255, ${0.45 * a})`;
        ctx.beginPath(); ctx.moveTo(...p); ctx.lineTo(lerp(p[0], q[0], f), lerp(p[1], q[1], f)); ctx.stroke();
        ctx.setLineDash([]);
        if (f >= 1) {
          for (let k = 0; k < 3; k++) {
            const u = (lt * 0.45 + k / 3 + e * 0.21) % 1;
            const [from, to] = k % 2 ? [q, p] : [p, q];
            glowDot(lerp(from[0], to[0], u), lerp(from[1], to[1], u), 4, k === 0 ? C.green : C.white, a);
          }
        }
      });
    };
  }

  // Trust: three listed peers link; a stranger is refused; what arrives is data, never code.
  function trust(env) {
    const box = env.rect('.trust-space');
    const tSigned = env.cue('signed');
    const tTrusted = env.cue('trusted');
    const tNothing = env.cue('nothing');
    const me = [box.left + box.width * 0.42, box.top + box.height * 0.5];
    const R = Math.min(box.width, box.height) * 0.36;
    const peers = [-2.4, -0.9, 2.3].map((ang) => [me[0] + Math.cos(ang) * R * 1.15, me[1] + Math.sin(ang) * R]);
    const strangerHome = [box.left + box.width * 1.05, box.top + box.height * 0.82];
    const strangerStop = [box.left + box.width * 0.86, box.top + box.height * 0.74];
    const node = (p, r, stroke, alpha) => solid(() => {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#101828';
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1.5;
      ctx.fillRect(p[0] - r, p[1] - r, 2 * r, 2 * r);
      ctx.strokeRect(p[0] - r, p[1] - r, 2 * r, 2 * r);
      ctx.globalAlpha = 1;
    });
    return (lt, a, t) => {
      if (a <= 0.01) return;
      const q = easeOut(clamp((lt - 0.3) / 0.6));
      peers.forEach((p, k) => {
        const f = easeOut(clamp((lt - 0.4 - k * 0.15) / 0.5));
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = `rgba(0,212,146, ${0.6 * a * f})`;
        ctx.beginPath(); ctx.moveTo(...me); ctx.lineTo(lerp(me[0], p[0], f), lerp(me[1], p[1], f)); ctx.stroke();
        node(p, 16, 'rgba(255,255,255,.8)', a * f);
        if (lt > tSigned) {
          const u = ((lt - tSigned) * 0.6 + k / 3) % 1;
          const x = lerp(p[0], me[0], u);
          const y = lerp(p[1], me[1], u);
          glowDot(x, y, 4, C.green, a);
          mono('sig', x + 10, y - 10, C.green, 0.8 * a * Math.sin(Math.PI * u), 16);
        }
      });
      node(me, 26, 'rgba(255,255,255,1)', a * q);
      label('THIS MACHINE', me[0], me[1] + 62, C.white, 0.8 * a * q, 17, 700);
      // the stranger
      const s0 = clamp((lt - tTrusted + 0.8) / 1.0);
      if (s0 > 0) {
        const p = [lerp(strangerHome[0], strangerStop[0], easeOut(s0)), lerp(strangerHome[1], strangerStop[1], easeOut(s0))];
        node(p, 16, 'rgba(255,99,126,.9)', a);
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
          label('UNTRUSTED', p[0], p[1] + 48, C.red, a * clamp(k / 0.3), 17, 700);
        }
      }
      // a shield: what arrives is checked and stored, never run
      if (lt > tNothing) {
        const k = lt - tNothing;
        const ring = (k % 1.4) / 1.4;
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = `rgba(255,255,255, ${(1 - ring) * 0.8 * a})`;
        ctx.strokeRect(me[0] - 26 - ring * 40, me[1] - 26 - ring * 40, 52 + ring * 80, 52 + ring * 80);
      }
    };
  }


  // One policy at the centre; every client around it receives its own projection.
  function orbit(env) {
    const box = env.rect('.orbit-space');
    const c = [box.left + box.width / 2, box.top + box.height / 2];
    const R = Math.min(box.width, box.height) * 0.4;
    const clients = [
      ['Claude Code', 'claude', C.s2], ['Codex', 'codex', C.s1], ['Gemini', 'gemini', C.s3],
      ['Zed', 'zed', C.s4], ['Antigravity', 'antigravity', C.s5], ['bb', 'bb', C.white],
      ['any MCP client', 'mcp', C.gray],
    ].map(([name, cue, color], i, all) => {
      const ang = -Math.PI / 2 + (i * TAU) / all.length;
      return { name, color, t: env.cue(cue), p: [c[0] + Math.cos(ang) * R * 1.12, c[1] + Math.sin(ang) * R] };
    });
    const tProj = env.cue('projection');
    return (lt, a, t) => {
      if (a <= 0.01) return;
      const q = easeOut(clamp((lt - 0.2) / 0.6));
      clients.forEach((cl, i) => {
        const f = easeOut(clamp((lt - cl.t) / 0.5));
        if (f <= 0) return;
        ctx.setLineDash(cl.name === 'any MCP client' ? [6, 8] : []);
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = `rgba(${cl.color}, ${0.5 * a * f})`;
        ctx.beginPath(); ctx.moveTo(...c); ctx.lineTo(lerp(c[0], cl.p[0], f), lerp(c[1], cl.p[1], f)); ctx.stroke();
        ctx.setLineDash([]);
        // the projection travels outwards, file by file
        const rate = lt > tProj ? 0.9 : 0.45;
        for (let k = 0; k < 4; k++) {
          const u = ((lt - cl.t) * rate + k / 4) % 1;
          if (lt - cl.t < 0.4) break;
          glowDot(lerp(c[0], cl.p[0], u), lerp(c[1], cl.p[1], u), 3.5, cl.color, a * Math.sin(Math.PI * u));
        }
        solid(() => {
          ctx.globalAlpha = a * f;
          ctx.fillStyle = '#101828';
          ctx.strokeStyle = `rgba(${cl.color}, .9)`;
          ctx.lineWidth = 1.5;
          ctx.fillRect(cl.p[0] - 13, cl.p[1] - 13, 26, 26);
          ctx.strokeRect(cl.p[0] - 13, cl.p[1] - 13, 26, 26);
          ctx.globalAlpha = 1;
        });
        const below = cl.p[1] > c[1] + 10;
        label(cl.name, cl.p[0], cl.p[1] + (below ? 46 : -26), C.white, a * f, 26, 600);
      });
      solid(() => {
        ctx.globalAlpha = a * q;
        ctx.fillStyle = '#101828';
        ctx.strokeStyle = 'rgba(81,162,255,1)';
        ctx.lineWidth = 2;
        ctx.fillRect(c[0] - 120, c[1] - 34, 240, 68);
        ctx.strokeRect(c[0] - 120, c[1] - 34, 240, 68);
        ctx.globalAlpha = 1;
      });
      ctx.textBaseline = 'middle';
      mono('policy.yaml', c[0], c[1] + 2, C.white, a * q, 26, 'center');
      ctx.textBaseline = 'alphabetic';
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
      label('LOCAL NETWORK · MULTICAST', box.left + 20, box.top + 34, C.gray, a, 17, 700, 'left');
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
        label('RENDEZVOUS', hub[0], hub[1] + 52, C.brand, a * h, 16, 700);
        label('HTTPS', hub[0], hub[1] + 74, C.gray, a * h, 15, 600);
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
    const tK = env.cue('knowledge');
    const tModel = env.cue('model');
    const tPerson = env.cue('person');
    const cols = [0.02, 0.36, 0.7].map((x) => box.left + x * box.width);
    const colW = box.width * 0.28;
    const heads = ['SESSION LEDGER', 'CANDIDATES', 'CURATED'];
    const lines = ['decision', 'resolved', 'finished', 'decision', 'blocked', 'resolved'];
    return (lt, a, t) => {
      if (a <= 0.01) return;
      const q = easeOut(clamp((lt - 0.3) / 0.6));
      heads.forEach((h, i) => {
        label(h, cols[i], box.top + 30, i === 2 ? C.brand : C.gray, a * q, 17, 700, 'left');
        ctx.lineWidth = 1;
        ctx.strokeStyle = `rgba(30,41,57, ${a * q})`;
        ctx.beginPath(); ctx.moveTo(cols[i], box.top + 46); ctx.lineTo(cols[i] + colW, box.top + 46); ctx.stroke();
      });
      lines.forEach((ln, k) => {
        const y = box.top + 90 + k * 62;
        const show = clamp((lt - 0.5 - k * 0.15) / 0.3);
        mono(`· ${ln}`, cols[0], y, C.white, 0.75 * a * show, 22);
        // derived at the boundary, deterministically, no model
        const d = easeOut(clamp((lt - tK - k * 0.12) / 0.6));
        if (d > 0 && k % 2 === 0) {
          const x = lerp(cols[0] + colW * 0.6, cols[1], d);
          const yy = lerp(y, box.top + 90 + (k / 2) * 80, d);
          solid(() => {
            ctx.globalAlpha = a * d;
            ctx.fillStyle = '#101828';
            ctx.strokeStyle = 'rgba(153,161,175,.6)';
            ctx.lineWidth = 1;
            ctx.fillRect(x, yy - 30, colW, 50);
            ctx.strokeRect(x + 0.5, yy - 29.5, colW - 1, 49);
            ctx.globalAlpha = 1;
          });
          mono(`candidate ${k / 2 + 1}`, x + 14, yy + 2, C.white, a * d, 20);
        }
      });
      if (lt > tModel) {
        label('NO MODEL · FROM LEDGER AND GIT', cols[1], box.top + 360, C.gray, a * clamp((lt - tModel) / 0.4), 15, 700, 'left');
      }
      // a person promotes one
      const p = easeOut(clamp((lt - tPerson) / 0.7));
      if (p > 0) {
        const x = lerp(cols[1], cols[2], p);
        const y = box.top + 90;
        solid(() => {
          ctx.globalAlpha = a;
          ctx.fillStyle = '#101828';
          ctx.strokeStyle = 'rgba(81,162,255,1)';
          ctx.lineWidth = 1.5;
          ctx.fillRect(x, y - 30, colW, 50);
          ctx.strokeRect(x + 0.5, y - 29.5, colW - 1, 49);
          ctx.globalAlpha = 1;
        });
        mono('promoted', x + 14, y + 2, C.brand, a, 20);
      }
    };
  }


  // One declaration fans out into every projection; a drifted one is caught.
  function fan(env) {
    const box = env.rect('.fan-space');
    const src = [box.left + box.width / 2, box.top + 70];
    const outs = [
      ['CLI', 'command', C.s1], ['HTTP', 'http', C.s2], ['MCP', 'mcp', C.s3],
      ['OpenAPI', 'openapi', C.s4], ['Docs', 'docs', C.s5], ['Skills', 'skills', C.white],
    ].map(([name, cue, col], i, all) => {
      const col2 = i % 3;
      const row = Math.floor(i / 3);
      return { name, col, t: env.cue(cue),
        p: [box.left + box.width * (0.17 + col2 * 0.33), box.top + box.height * (0.56 + row * 0.3)] };
    });
    const tDecl = env.cue('declared');
    const tDrift = env.cue('drifts');
    const node = (p, w, h, stroke, alpha) => solid(() => {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#101828';
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1.5;
      ctx.fillRect(p[0] - w / 2, p[1] - h / 2, w, h);
      ctx.strokeRect(p[0] - w / 2, p[1] - h / 2, w, h);
      ctx.globalAlpha = 1;
    });
    return (lt, a) => {
      if (a <= 0.01) return;
      const q = easeOut(clamp((lt - tDecl + 0.3) / 0.6));
      outs.forEach((o, i) => {
        const f = easeOut(clamp((lt - o.t) / 0.5));
        if (f <= 0) return;
        const mid = [(src[0] + o.p[0]) / 2, src[1] + 120];
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = `rgba(${o.col}, ${0.5 * a * f})`;
        ctx.beginPath(); ctx.moveTo(src[0], src[1] + 40);
        ctx.quadraticCurveTo(mid[0], mid[1], lerp(src[0], o.p[0], f), lerp(src[1] + 40, o.p[1] - 40, f)); ctx.stroke();
        for (let k = 0; k < 3; k++) {
          const u = ((lt - o.t) * 0.7 + k / 3) % 1;
          const x = (1 - u) * (1 - u) * src[0] + 2 * (1 - u) * u * mid[0] + u * u * o.p[0];
          const y = (1 - u) * (1 - u) * (src[1] + 40) + 2 * (1 - u) * u * mid[1] + u * u * (o.p[1] - 40);
          if (f >= 1) glowDot(x, y, 3.5, o.col, a * Math.sin(Math.PI * u));
        }
        const drift = i === 4 && lt > tDrift && lt < tDrift + 1.6;
        node(o.p, 200, 80, drift ? 'rgba(255,99,126,1)' : `rgba(${o.col}, .9)`, a * f);
        ctx.textBaseline = 'middle';
        mono(o.name, o.p[0], o.p[1] + 2, drift ? C.red : C.white, a * f, 26, 'center');
        ctx.textBaseline = 'alphabetic';
        if (drift) label('STALE · CHECK FAILS', o.p[0], o.p[1] + 66, C.red, a, 15, 700);
      });
      node(src, 340, 80, 'rgba(81,162,255,1)', a * q);
      ctx.textBaseline = 'middle';
      mono('capability!( … )', src[0], src[1] + 2, C.white, a * q, 26, 'center');
      ctx.textBaseline = 'alphabetic';
    };
  }

  // One shared server: the first client starts it, the rest attach and see each other.
  function server(env) {
    const box = env.rect('.server-space');
    const c = [box.left + box.width / 2, box.top + box.height * 0.48];
    const tFirst = env.cue('first');
    const tAttach = env.cue('attaches');
    const tSees = env.cue('sees');
    const clients = [['Claude Code', C.s2], ['Codex', C.s1], ['Gemini', C.s3], ['Zed', C.s4]].map(([n, col], i) => {
      const ang = -Math.PI * 0.85 + i * (Math.PI * 0.57);
      const R = Math.min(box.width, box.height) * 0.42;
      return { n, col, t: i === 0 ? tFirst : tAttach + (i - 1) * 0.35,
        p: [c[0] + Math.cos(ang) * R * 1.1, c[1] + Math.sin(ang) * R * 0.9 + (i % 2 ? 60 : 0)] };
    });
    return (lt, a, t) => {
      if (a <= 0.01) return;
      const on = easeOut(clamp((lt - tFirst - 0.2) / 0.6));
      clients.forEach((cl, i) => {
        const f = easeOut(clamp((lt - cl.t) / 0.5));
        if (f <= 0) return;
        ctx.lineWidth = 2;
        ctx.strokeStyle = `rgba(${cl.col}, ${0.6 * a * f})`;
        ctx.beginPath(); ctx.moveTo(...cl.p); ctx.lineTo(lerp(cl.p[0], c[0], f), lerp(cl.p[1], c[1], f)); ctx.stroke();
        glowDot(cl.p[0], cl.p[1], 10 * backOut(f), cl.col, a);
        label(cl.n, cl.p[0], cl.p[1] - 26, C.white, a * f, 26, 600);
        if (f >= 1) {
          const u = ((lt - cl.t) * 0.8) % 1;
          glowDot(lerp(cl.p[0], c[0], u), lerp(cl.p[1], c[1], u), 3.5, cl.col, a * Math.sin(Math.PI * u));
        }
      });
      // every client sees the others: the board lights between them
      if (lt > tSees) {
        const f = easeOut(clamp((lt - tSees) / 0.6));
        for (let i = 0; i < clients.length; i++) {
          for (let j = i + 1; j < clients.length; j++) {
            ctx.setLineDash([4, 8]);
            ctx.lineWidth = 1;
            ctx.strokeStyle = `rgba(255,255,255, ${0.25 * a * f})`;
            ctx.beginPath(); ctx.moveTo(...clients[i].p); ctx.lineTo(...clients[j].p); ctx.stroke();
            ctx.setLineDash([]);
          }
        }
      }
      solid(() => {
        ctx.globalAlpha = a * on;
        ctx.fillStyle = '#101828';
        ctx.strokeStyle = 'rgba(81,162,255,1)';
        ctx.lineWidth = 2;
        ctx.fillRect(c[0] - 150, c[1] - 46, 300, 92);
        ctx.strokeRect(c[0] - 150, c[1] - 46, 300, 92);
        ctx.globalAlpha = 1;
      });
      mono('majordomus serve', c[0], c[1] - 4, C.white, a * on, 26, 'center');
      mono(':8741 · loopback', c[0], c[1] + 28, C.gray, a * on, 19, 'center');
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
      label(name, p[0], p[1] + 92, C.gray, alpha, 17, 700);
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


  // Intent down to commit: each rung derived from the one above.
  function ladder(env) {
    const box = env.rect('.ladder-space');
    const rungs = [
      ['INTENT', 'what must become true', env.cue('intent'), C.brand],
      ['CRITERIA', 'the evidence that settles it', env.cue('criteria'), C.s4],
      ['MILESTONE', 'what realises it', env.cue('milestones'), C.s1],
      ['ISSUE', 'one piece of work', env.cue('issues'), C.s2],
      ['TASK · COMMIT', 'scoped, finished, traced back', env.cue('plan'), C.s3],
    ];
    const h = (box.height - 20) / rungs.length;
    return (lt, a, t) => {
      if (a <= 0.01) return;
      rungs.forEach(([name, what, at, col], i) => {
        const q = easeOut(clamp((lt - at + 0.2) / 0.5));
        if (q <= 0) return;
        const x = box.left + i * 46;
        const y = box.top + i * h;
        solid(() => {
          ctx.globalAlpha = a * q;
          ctx.fillStyle = '#101828';
          ctx.strokeStyle = `rgba(${col}, .9)`;
          ctx.lineWidth = 1.5;
          ctx.fillRect(x, y, box.width - i * 46, h - 18);
          ctx.strokeRect(x + 0.5, y + 0.5, box.width - i * 46 - 1, h - 19);
          ctx.globalAlpha = 1;
        });
        label(name, x + 22, y + 36, col, a * q, 18, 700, 'left');
        ctx.font = "italic 400 30px ui-serif, Georgia, serif";
        ctx.textAlign = 'left';
        ctx.fillStyle = `rgba(255,255,255, ${a * q})`;
        ctx.fillText(what, x + 22, y + 74);
        if (i > 0) {
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = `rgba(255,255,255, ${0.35 * a * q})`;
          ctx.beginPath(); ctx.moveTo(x - 24, y - 18); ctx.lineTo(x - 24, y + 30); ctx.lineTo(x, y + 30); ctx.stroke();
          const u = ((lt - at) * 0.8) % 1;
          if (lt > at + 0.5) glowDot(x - 24, lerp(y - 18, y + 30, u), 3.5, col, a);
        }
      });
    };
  }

  // Reasoning: evidence, an assessment, a plan that branches, one conclusion on the record.
  function decide(env) {
    const box = env.rect('.flow-space');
    const tEv = env.cue('evidence');
    const tAdv = env.cue('advisors');
    const tVer = env.cue('verdicts');
    const tCon = env.cue('conclusion');
    const W2 = box.width;
    const node = (x, y, w, text, stroke, alpha, sub) => {
      solid(() => {
        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#101828';
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 1.5;
        ctx.fillRect(x - w / 2, y - 34, w, 68);
        ctx.strokeRect(x - w / 2, y - 34, w, 68);
        ctx.globalAlpha = 1;
      });
      ctx.textBaseline = 'middle';
      mono(text, x, y + (sub ? -9 : 1), C.white, alpha, 22, 'center');
      if (sub) mono(sub, x, y + 16, C.gray, alpha, 15, 'center');
      ctx.textBaseline = 'alphabetic';
    };
    const link = (p, q, f, col, alpha, dash) => {
      if (f <= 0) return;
      ctx.setLineDash(dash ? [5, 7] : []);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = `rgba(${col}, ${alpha})`;
      ctx.beginPath(); ctx.moveTo(...p); ctx.lineTo(lerp(p[0], q[0], f), lerp(p[1], q[1], f)); ctx.stroke();
      ctx.setLineDash([]);
    };
    const cx = box.left + W2 / 2;
    const yE = box.top + 50;
    const yA = box.top + 170;
    const yP = box.top + 290;
    const yB = box.top + 470;
    const yC = box.top + 680;
    const branches = [['decide', 'locally', 0.13], ['review', 'structured', 0.38], ['reuse', 'a conclusion', 0.63],
      ['consult', 'advisors', 0.88]].map(([n, sub, x]) => ({ n, sub, x: box.left + x * W2 }));
    return (lt, a, t) => {
      if (a <= 0.01) return;
      const e = easeOut(clamp((lt - tEv + 0.3) / 0.5));
      node(cx, yE, 360, 'local evidence', 'rgba(153,161,175,.8)', a * e);
      const as = easeOut(clamp((lt - tEv - 0.4) / 0.5));
      link([cx, yE + 34], [cx, yA - 34], as, C.white, 0.5 * a, false);
      node(cx, yA, 460, 'assessment', 'rgba(255,255,255,.8)', a * as, 'subject · materiality · hypothesis');
      const pl = easeOut(clamp((lt - tEv - 0.9) / 0.5));
      link([cx, yA + 34], [cx, yP - 34], pl, C.white, 0.5 * a, false);
      node(cx, yP, 300, 'policy plan', 'rgba(81,162,255,1)', a * pl);
      branches.forEach((b, i) => {
        const f = easeOut(clamp((lt - tEv - 1.3 - i * 0.12) / 0.5));
        const adv = i === 3;
        const col = adv ? C.s4 : C.white;
        link([cx, yP + 34], [b.x, yB - 34], f, col, (adv && lt < tAdv ? 0.25 : 0.5) * a, adv);
        node(b.x, yB, W2 * 0.23, b.n, adv ? 'rgba(166,132,255,.9)' : 'rgba(255,255,255,.5)', a * f, b.sub);
        const c = easeOut(clamp((lt - tCon - i * 0.08) / 0.5));
        link([b.x, yB + 34], [cx, yC - 34], c, C.brand, 0.5 * a, false);
      });
      if (lt > tVer) {
        const v = clamp((lt - tVer) / 0.4);
        label('EVIDENCE, NOT A VERDICT', branches[3].x, yB + 66, C.s4, a * v, 14, 700);
      }
      const con = easeOut(clamp((lt - tCon - 0.4) / 0.5));
      node(cx, yC, 520, 'conclusion, recorded', 'rgba(0,212,146,1)', a * con, 'evidence · rejected · risks · validation');
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

  // The Cockpit's activity: three series, live.
  function spark(env) {
    const box = env.rect('.ui-spark-space');
    const series = [[C.s1, 3], [C.s2, 7], [C.s3, 11]];
    return (lt, a, t) => {
      if (a <= 0.01) return;
      const q = easeOut(clamp((lt - 1.2) / 0.8));
      label('ACTIVITY · LAST HOUR', box.left, box.top + 26, C.gray, a * q, 14, 700, 'left');
      ctx.lineWidth = 1;
      ctx.strokeStyle = `rgba(30,41,57, ${a})`;
      for (let k = 0; k <= 3; k++) {
        const y = box.top + 50 + (k * (box.height - 60)) / 3;
        ctx.beginPath(); ctx.moveTo(box.left, y); ctx.lineTo(box.right, y); ctx.stroke();
      }
      series.forEach(([col, seed]) => {
        ctx.lineWidth = 2;
        ctx.strokeStyle = `rgba(${col}, ${0.9 * a * q})`;
        ctx.beginPath();
        const n = 60;
        for (let k = 0; k <= n; k++) {
          const u = k / n;
          const x = box.left + u * box.width * q;
          const v = 0.5 + 0.38 * noise3(u * 3 + t * 0.25, seed, 0.3);
          const y = box.top + 50 + (1 - v) * (box.height - 60);
          if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      });
    };
  }


  // The catalogue as a matrix: every declared model against every capability word.
  function matrix(env) {
    const box = env.rect('.matrix-space');
    const caps = ['text', 'vision', 'tools', 'structured', 'streaming', 'reasoning'];
    const rows = ['claude-opus-5', 'claude-fable-5', 'claude-sonnet-5', 'claude-opus-4-8', 'claude-opus-4-7',
      'claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5', 'gpt-4o'];
    const has = (r, c) => (r === 'gpt-4o' ? c === 0 : true);
    const t0 = env.cue('declared');
    const tTools = env.cue('need');
    const labelW = 250;
    const cw = (box.width - labelW) / caps.length;
    const rh = (box.height - 34) / rows.length;
    return (lt, a) => {
      if (a <= 0.01) return;
      const q = easeOut(clamp((lt - t0) / 0.6));
      caps.forEach((c, j) => {
        const x = box.left + labelW + j * cw + cw / 2;
        mono(c.toUpperCase().slice(0, 6), x, box.top + 16, j === 2 && lt > tTools ? C.brand : C.gray, a * q, 14, 'center');
      });
      rows.forEach((r, i) => {
        const y = box.top + 34 + i * rh;
        const rq = easeOut(clamp((lt - t0 - i * 0.07) / 0.4));
        if (rq <= 0) return;
        mono(r, box.left, y + rh * 0.66, r === 'gpt-4o' && lt > tTools ? C.red : C.white, a * rq, 17);
        caps.forEach((c, j) => {
          const s = Math.min(14, rh - 8);
          const x = box.left + labelW + j * cw + cw / 2 - s / 2;
          const on = has(r, j);
          const col = r === 'gpt-4o' ? C.s1 : C.s2;
          solid(() => {
            ctx.globalAlpha = a * rq * (on ? 1 : 0.4);
            ctx.fillStyle = on ? `rgb(${col})` : '#101828';
            ctx.strokeStyle = on ? `rgb(${col})` : '#1e2939';
            ctx.lineWidth = 1;
            ctx.fillRect(x, y + (rh - s) / 2, s, s);
            ctx.strokeRect(x + 0.5, y + (rh - s) / 2 + 0.5, s - 1, s - 1);
            ctx.globalAlpha = 1;
          });
        });
      });
      // the requirement column the route asked for
      if (lt > tTools) {
        const f = easeOut(clamp((lt - tTools) / 0.4));
        const x = box.left + labelW + 2 * cw + 4;
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = `rgba(81,162,255, ${a * f})`;
        ctx.strokeRect(x, box.top + 24, cw - 8, box.height - 24);
      }
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

  // The mesh: three machines, their sessions in orbit, packets on the links, a plexus behind.
  function meshGraph(env) {
    const box = env.rect('.mesh-space');
    const at = (x, y) => [box.left + (x * box.width) / 920, box.top + (y * box.height) / 760];
    const cue = {
      claude: env.cue('claude'), codex: env.cue('codex'), gemini: env.cue('gemini'),
      same: env.cue('same'), hear: env.cue('hear'),
    };
    const hubs = [
      { p: at(170, 190), label: 'laptop', color: C.violet, t: 0.2, dir: 1 },
      { p: at(750, 190), label: 'workstation', color: C.sky, t: 0.4, dir: -1 },
      { p: at(460, 650), label: 'build host', color: C.green, t: 0.6, dir: 1 },
    ];
    const agents = [
      { hub: 0, name: 'Claude', color: C.s2, t: cue.claude },
      { hub: 1, name: 'Codex', color: C.s1, t: cue.codex },
      { hub: 2, name: 'Gemini', color: C.s3, t: cue.gemini },
    ];
    const file = at(460, 400);
    const r = mulberry(99);
    const plexus = Array.from({ length: 52 }, () => ({
      x: r() * (box.width + 160) - 80, y: r() * (box.height + 160) - 80, s: r() * 100,
    }));

    const sat = (h, i, lt) => {
      const hub = hubs[h];
      // Each agent sits on the outer side of its machine, so labels never meet.
      const ang = (i / 5) * TAU + [-2.3, -0.84, 0.25][h] + lt * 0.05 * hub.dir;
      const rad = i === 0 ? 118 : 92 + (i % 2) * 30;
      return [hub.p[0] + Math.cos(ang) * rad, hub.p[1] + Math.sin(ang) * rad];
    };
    const edge = (p, q, frac, color, alpha, width) => {
      if (frac <= 0) return;
      ctx.lineWidth = width;
      ctx.strokeStyle = `rgba(${color}, ${alpha})`;
      ctx.beginPath(); ctx.moveTo(...p); ctx.lineTo(lerp(p[0], q[0], frac), lerp(p[1], q[1], frac));
      ctx.stroke();
    };

    return (lt, a, t) => {
      if (a <= 0.01) return;
      // plexus
      const pts = plexus.map((q) => [
        box.left + q.x + noise3(q.s, t * 0.15, 1) * 90,
        box.top + q.y + noise3(q.s, t * 0.15, 7) * 90,
      ]);
      const grow = easeOut(clamp(lt / 1.2));
      ctx.lineWidth = 1.2;
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const d = Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]);
          if (d < 170) {
            ctx.strokeStyle = `rgba(${C.sky}, ${(1 - d / 170) * 0.28 * a * grow})`;
            ctx.beginPath(); ctx.moveTo(...pts[i]); ctx.lineTo(...pts[j]); ctx.stroke();
          }
        }
        glowDot(pts[i][0], pts[i][1], 2.5, C.sky, 0.5 * a * grow);
      }
      // links between machines, with packets
      [[0, 1], [1, 2], [2, 0]].forEach(([i, j], e) => {
        const f = easeOut(clamp((lt - 0.6 - e * 0.15) / 0.7));
        edge(hubs[i].p, hubs[j].p, f, C.white, 0.22 * a, 3);
        if (f < 1) return;
        for (let k = 0; k < 4; k++) {
          const u = (lt * 0.32 + k / 4 + e * 0.13) % 1;
          const [p, q] = k % 2 ? [hubs[j].p, hubs[i].p] : [hubs[i].p, hubs[j].p];
          glowDot(lerp(p[0], q[0], u), lerp(p[1], q[1], u), 4, hubs[k % 2 ? j : i].color, 0.9 * a);
        }
      });
      // sessions in orbit
      hubs.forEach((hub, h) => {
        for (let i = 0; i < 5; i++) {
          const ag = i === 0 ? agents[h] : null;
          const ta = ag ? ag.t : hub.t + 0.5 + i * 0.12;
          const q = clamp((lt - ta) / 0.5);
          if (q <= 0) continue;
          const p = sat(h, i, lt);
          edge(hub.p, p, easeOut(q), ag ? ag.color : hub.color, (ag ? 0.6 : 0.3) * a, ag ? 3 : 2);
          const size = (ag ? 13 : 7) * backOut(q);
          glowDot(p[0], p[1], size, ag ? ag.color : hub.color, (ag ? 1 : 0.7) * a);
          if (ag) {
            const pulse = clamp(1 - (lt - ta) / 0.9);
            if (pulse > 0) {
              ctx.lineWidth = 3;
              ctx.strokeStyle = `rgba(${ag.color}, ${pulse * a})`;
              ctx.beginPath(); ctx.arc(p[0], p[1], 20 + (1 - pulse) * 60, 0, TAU); ctx.stroke();
            }
            label(ag.name, p[0], p[1] - 34, C.white, a * easeOut(q), 32, 800);
          }
        }
        // the machine
        const q = clamp((lt - hub.t) / 0.5);
        if (q > 0) {
          const s = backOut(q);
          ctx.globalCompositeOperation = 'source-over';
          ctx.fillStyle = `rgba(10,16,32, ${0.95 * a})`;
          ctx.beginPath(); ctx.arc(hub.p[0], hub.p[1], 34 * s, 0, TAU); ctx.fill();
          ctx.globalCompositeOperation = 'lighter';
          ctx.lineWidth = 4;
          ctx.strokeStyle = `rgba(${hub.color}, ${a})`;
          ctx.stroke();
          glowDot(hub.p[0], hub.p[1], 14 * s, hub.color, 0.9 * a);
          const ring = ((lt - hub.t) % 1.8) / 1.8;
          ctx.lineWidth = 2;
          ctx.strokeStyle = `rgba(${hub.color}, ${(1 - ring) * 0.6 * a})`;
          ctx.beginPath(); ctx.arc(hub.p[0], hub.p[1], 34 + ring * 70, 0, TAU); ctx.stroke();
          label(hub.label.toUpperCase(), hub.p[0], hub.p[1] + 74, C.white, 0.55 * a * q, 20, 700);
        }
      });
      // the collision
      const k = lt - cue.same;
      if (k > -0.3) {
        const q = clamp((k + 0.3) / 0.5);
        [0, 1].forEach((h) => edge(sat(h, 0, lt), file, easeOut(clamp((k + 0.2) / 0.5)), C.red, 0.9 * a, 5));
        const s = backOut(q);
        ctx.save();
        ctx.translate(...file);
        ctx.scale(s, s);
        ctx.fillStyle = `rgba(20,10,16, ${0.92 * a})`;
        ctx.strokeStyle = `rgba(${C.red}, ${a})`;
        ctx.lineWidth = 4;
        ctx.globalCompositeOperation = 'source-over';
        ctx.beginPath(); ctx.roundRect(-150, -40, 300, 80, 20); ctx.fill(); ctx.stroke();
        ctx.font = "600 30px ui-monospace, 'SF Mono', Menlo, monospace";
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = `rgba(${C.red}, ${a})`;
        ctx.fillText('src/parser.rs', 0, 2);
        ctx.textBaseline = 'alphabetic';
        ctx.restore();
        ctx.globalCompositeOperation = 'lighter';
        if (k > 0) {
          const ring = (k % 0.9) / 0.9;
          ctx.lineWidth = 4;
          ctx.strokeStyle = `rgba(${C.red}, ${(1 - ring) * 0.7 * a})`;
          ctx.beginPath(); ctx.roundRect(file[0] - 150 - ring * 60, file[1] - 40 - ring * 40,
            300 + ring * 120, 80 + ring * 80, 20 + ring * 30); ctx.stroke();
        }
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
  window.genSetup = ({ scenes }) => {
    painters = scenes.map((s) => {
      const env = {
        rect: (sel) => s.el.querySelector(sel).getBoundingClientRect(),
        rects: (sel) => [...s.el.querySelectorAll(sel)].map((e) => e.getBoundingClientRect()),
        cue: s.cue,
      };
      const layers = {
        hook: () => [flow({ colors: [C.white], count: 260, speed: 1.1, alpha: 0.12, seed: 2, zs: 0.04 })],
        loop: () => [flow({ colors: [C.white], count: 260, speed: 1.1, alpha: 0.12, seed: 2, zs: 0.04 })],
        stats: () => [flow({ colors: [C.red, C.white], count: 640, scale: 0.003, turn: 3, speed: 4.2,
          alpha: 0.3, life: 3, seed: 3 })],
        reveal: () => [...rivers(21, [C.s4, C.s1, C.s3], { alpha: 0.12, count: 110 }), flow({ colors: [C.white], count: 200, speed: 1.4, alpha: 0.1, seed: 4 }),
          prism(env, '.mark-big', { start: 0.9 })],
        setup: () => [...rivers(22, [C.s1, C.s2, C.s3]), flow({ colors: [C.white], count: 260, speed: 1.6, alpha: 0.12, seed: 10 })],
        context: () => [...rivers(23, [C.s4, C.s1, C.s5], { alpha: 0.14 }), flow({ colors: [C.white], count: 160, speed: 1.3, alpha: 0.1, seed: 11 }), tree(env)],
        terminal: () => [...rivers(24, [C.s1, C.s2, C.s3], { alpha: 0.12, count: 120 }), flow({ colors: [C.white], count: 220, speed: 1.6, alpha: 0.1, seed: 5 }),
          shock(env, '.stamp', 'refuses')],
        provenance: () => [...rivers(25, [C.s3, C.s1, C.s4], { alpha: 0.14 }), flow({ colors: [C.white], count: 180, speed: 1.2, alpha: 0.1, seed: 15 }), chain(env)],
        mesh: () => [...rivers(26, [C.s2, C.s1, C.s3], { alpha: 0.16 }), flow({ colors: [C.white], count: 140, speed: 1.3, alpha: 0.08, seed: 6 }), meshGraph(env)],
        machines: () => [...rivers(27, [C.s1, C.s2, C.s3, C.s4, C.s5], { bands: [[0.12, 0.02], [0.32, -0.05], [0.52, 0.04], [0.72, -0.03], [0.92, 0.05]], count: 110, alpha: 0.16 }), flow({ colors: [C.white], count: 160, speed: 1.3, alpha: 0.08, seed: 16 }), zones(env)],
        security: () => [...rivers(28, [C.s3, C.s1, C.s4], { alpha: 0.12, count: 120 }), flow({ colors: [C.white], count: 140, speed: 1.2, alpha: 0.08, seed: 17 }), trust(env)],
        monitor: () => [...rivers(29, [C.s1, C.s2, C.s3, C.s4], { bands: [[0.2, 0], [0.4, 0], [0.6, 0], [0.8, 0]], count: 130, alpha: 0.18 }), flow({ colors: [C.white], count: 160, speed: 1.4, alpha: 0.08, seed: 12 }), lanes(env)],
        providers: () => [...rivers(34, [C.s2, C.s1, C.s3], { alpha: 0.12, count: 110 }), orbit(env)],
        models: () => [...rivers(35, [C.s2, C.s1, C.s3, C.s4], { bands: [[0.2, 0.02], [0.45, -0.03], [0.7, 0.03], [0.9, -0.02]], alpha: 0.1, count: 100 }), matrix(env)],
        personal: () => [...rivers(36, [C.s1, C.s4], { bands: [[0.25, 0.03], [0.75, -0.03]], alpha: 0.12 }), personalLayers(env)],
        discovery: () => [...rivers(37, [C.s2, C.s1, C.s3], { alpha: 0.1, count: 100 }), radar(env)],
        knowledge: () => [...rivers(38, [C.s4, C.s1], { bands: [[0.3, 0.03], [0.7, -0.03]], alpha: 0.12 }), kbFlow(env)],
        session: () => [...rivers(39, [C.s1, C.s4], { bands: [[0.3, 0.02], [0.75, -0.02]], alpha: 0.12 })],
        generate: () => [...rivers(40, [C.s1, C.s2, C.s3], { alpha: 0.1, count: 100 }), fan(env)],
        mcp: () => [...rivers(41, [C.s2, C.s1, C.s3], { alpha: 0.1, count: 100 }), server(env)],
        blackboard: () => [...rivers(42, [C.s2, C.s1, C.s3], { alpha: 0.12 })],
        crosstalk: () => [...rivers(43, [C.s1, C.s2, C.s4], { alpha: 0.12 }), talk(env)],
        intent: () => [...rivers(44, [C.s4, C.s1, C.s2], { alpha: 0.1, count: 100 }), ladder(env)],
        reasoning: () => [...rivers(45, [C.s4, C.s1], { bands: [[0.3, 0.02], [0.8, -0.02]], alpha: 0.1 }), decide(env)],
        worktrees: () => [...rivers(46, [C.s2, C.s1, C.s3], { alpha: 0.12 }), branches(env)],
        cockpit: () => [...rivers(47, [C.s1, C.s2, C.s3], { alpha: 0.08, count: 90 }), spark(env)],
        policy: () => [...rivers(30, [C.s2, C.s1, C.s3], { alpha: 0.16 }), flow({ colors: [C.white], count: 200, speed: 1.6, alpha: 0.1, seed: 7 }), streams(env)],
        continuity: () => [...rivers(31, [C.s1, C.s4, C.s3], { alpha: 0.14 }), flow({ colors: [C.white], count: 200, speed: 1.4, alpha: 0.1, seed: 13 }), handoff(env)],
        local: () => [...rivers(32, [C.s3, C.s5, C.s1], { alpha: 0.14 }), flow({ colors: [C.white, C.sky], count: 560, speed: 3, alpha: 0.26, seed: 8, life: 5,
          field: vortex(500, 860) })],
        beliefs: () => [flow({ colors: [C.white], count: 240, speed: 1, alpha: 0.1, seed: 14, zs: 0.04 })],
        cta: () => [...rivers(33, [C.s4, C.s1, C.s3], { alpha: 0.14, count: 130 }), flow({ colors: [C.white], count: 300, speed: 1.8, alpha: 0.14, seed: 9 }),
          prism(env, '.mark-cta', { start: 0.75, count: 260 })],
      }[s.id];
      return layers ? layers() : [];
    });
  };

  window.genRender = (t, states) => {
    inks.length = 0;
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    states.forEach((st, i) => {
      if (st.opacity <= 0.005) return;
      painters[i].forEach((paint) => paint(st.lt, st.opacity, t));
    });
    ctx.globalCompositeOperation = 'source-over';
  };
})();
