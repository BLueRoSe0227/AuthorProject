const Graph = {
  // Maps entity type -> palette slot suffix, shared by any view that wants to color
  // something (button, badge, dot, progress bar) consistently with the graph/legend.
  ENTITY_PAL: { work: '1', chapter: '2', scene: '3', character: '4', setting: '5', memo: 'accent' },

  // Resolve a [[title]] reference to an entity within a work bundle
  resolveLink(bundle, rawTitle) {
    const title = rawTitle.trim().toLowerCase();
    for (const c of bundle.characters) {
      if (c.name.trim().toLowerCase() === title) return { type: 'character', id: c.id, label: c.name };
    }
    for (const n of bundle.settingNotes) {
      if (n.title.trim().toLowerCase() === title) return { type: 'setting', id: n.id, label: n.title };
    }
    for (const ch of bundle.chapters) {
      if (ch.title.trim().toLowerCase() === title) return { type: 'chapter', id: ch.id, label: ch.title };
      const scenes = bundle.scenesByChapter[ch.id] || [];
      for (const sc of scenes) {
        if (sc.title.trim().toLowerCase() === title) return { type: 'scene', id: sc.id, label: sc.title };
      }
    }
    return null;
  },

  buildData(bundle) {
    const nodes = [];
    const edges = [];
    const nodeKey = (type, id) => `${type}:${id}`;
    const seen = new Set();

    const addNode = (type, id, label, meta = {}) => {
      const key = nodeKey(type, id);
      if (seen.has(key)) return key;
      seen.add(key);
      nodes.push({ key, type, id, label, ...meta });
      return key;
    };

    const workKey = addNode('work', bundle.work.id, bundle.work.title, { size: 22 });

    bundle.chapters.forEach((ch) => {
      const chKey = addNode('chapter', ch.id, ch.title, { size: 14 });
      edges.push({ source: workKey, target: chKey, kind: 'structure' });
      const scenes = bundle.scenesByChapter[ch.id] || [];
      scenes.forEach((sc) => {
        const scKey = addNode('scene', sc.id, sc.title, { size: 9 });
        edges.push({ source: chKey, target: scKey, kind: 'structure' });
      });
    });

    bundle.characters.forEach((c) => {
      addNode('character', c.id, c.name, { size: 12 });
    });
    bundle.settingNotes.forEach((n) => {
      addNode('setting', n.id, n.title, { size: 11 });
    });
    bundle.memos.forEach((m) => {
      addNode('memo', m.id, Utils.truncate(m.content, 16) || '메모', { size: 7 });
    });

    // wiki-link edges from any text field
    const linkSources = [];
    bundle.characters.forEach((c) =>
      linkSources.push({ type: 'character', id: c.id, text: [c.appearance, c.personality, c.background, c.notes].join(' ') })
    );
    bundle.settingNotes.forEach((n) => linkSources.push({ type: 'setting', id: n.id, text: n.content }));
    bundle.memos.forEach((m) => linkSources.push({ type: 'memo', id: m.id, text: m.content }));
    bundle.chapters.forEach((ch) => {
      (bundle.scenesByChapter[ch.id] || []).forEach((sc) =>
        linkSources.push({ type: 'scene', id: sc.id, text: [sc.content, sc.summary].join(' ') })
      );
    });

    linkSources.forEach((src) => {
      const links = Utils.extractWikiLinks(src.text);
      const srcKey = nodeKey(src.type, src.id);
      links.forEach((title) => {
        const target = Graph.resolveLink(bundle, title);
        if (target) {
          const tgtKey = nodeKey(target.type, target.id);
          if (srcKey !== tgtKey) edges.push({ source: srcKey, target: tgtKey, kind: 'link' });
        }
      });
    });

    return { nodes, edges };
  },

  colorFor(type) {
    const fallback = {
      work: '#8b7bff',
      chapter: '#5aa9ff',
      scene: '#4fd1c5',
      character: '#ff9a62',
      setting: '#f2c94c',
      memo: '#ff6b9a',
    };
    const varMap = {
      work: '--palette-1',
      chapter: '--palette-2',
      scene: '--palette-3',
      character: '--palette-4',
      setting: '--palette-5',
      memo: '--accent',
    };
    const varName = varMap[type];
    if (varName) {
      const val = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
      if (val) return val;
    }
    return fallback[type] || '#999';
  },

  // Renders a force-directed graph into a canvas element.
  mount(canvas, data, { onNodeClick } = {}) {
    const ctx = canvas.getContext('2d');
    let width, height;
    const nodes = data.nodes.map((n, i) => ({
      ...n,
      x: Math.random() * 400 - 200,
      y: Math.random() * 400 - 200,
      vx: 0,
      vy: 0,
    }));
    const nodeIndex = Object.fromEntries(nodes.map((n, i) => [n.key, i]));
    const edges = data.edges
      .map((e) => ({ ...e, s: nodeIndex[e.source], t: nodeIndex[e.target] }))
      .filter((e) => e.s !== undefined && e.t !== undefined);

    let dragging = null;
    let panX = 0, panY = 0, zoom = 1;
    let panning = false, panStart = null;
    let raf = null;
    let hovered = null;

    function resize() {
      const rect = canvas.parentElement.getBoundingClientRect();
      width = canvas.width = rect.width * devicePixelRatio;
      height = canvas.height = rect.height * devicePixelRatio;
      canvas.style.width = rect.width + 'px';
      canvas.style.height = rect.height + 'px';
    }
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas.parentElement);

    function toScreen(x, y) {
      return {
        x: width / 2 + (x + panX) * zoom,
        y: height / 2 + (y + panY) * zoom,
      };
    }
    function toWorld(sx, sy) {
      return {
        x: (sx - width / 2) / zoom - panX,
        y: (sy - height / 2) / zoom - panY,
      };
    }

    function tick() {
      const repulsion = 2600;
      const springLen = 90;
      const springK = 0.02;
      const center = 0.002;

      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          let dx = a.x - b.x, dy = a.y - b.y;
          let distSq = dx * dx + dy * dy + 0.01;
          const dist = Math.sqrt(distSq);
          const force = repulsion / distSq;
          const fx = (dx / dist) * force, fy = (dy / dist) * force;
          a.vx += fx; a.vy += fy;
          b.vx -= fx; b.vy -= fy;
        }
      }
      edges.forEach((e) => {
        const a = nodes[e.s], b = nodes[e.t];
        const dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const diff = dist - springLen;
        const force = springK * diff;
        const fx = (dx / dist) * force, fy = (dy / dist) * force;
        a.vx += fx; a.vy += fy;
        b.vx -= fx; b.vy -= fy;
      });
      nodes.forEach((n) => {
        n.vx -= n.x * center;
        n.vy -= n.y * center;
        n.vx *= 0.85;
        n.vy *= 0.85;
        if (n !== dragging) {
          n.x += n.vx;
          n.y += n.vy;
        }
      });
    }

    function draw() {
      ctx.clearRect(0, 0, width, height);
      ctx.save();

      edges.forEach((e) => {
        const a = nodes[e.s], b = nodes[e.t];
        const pa = toScreen(a.x, a.y), pb = toScreen(b.x, b.y);
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
        ctx.strokeStyle = e.kind === 'link' ? 'rgba(255,154,98,0.35)' : 'rgba(140,140,170,0.25)';
        ctx.lineWidth = (e.kind === 'link' ? 1.4 : 1) * zoom;
        ctx.stroke();
      });

      nodes.forEach((n) => {
        const p = toScreen(n.x, n.y);
        const r = (n.size || 10) * zoom * 0.6;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fillStyle = Graph.colorFor(n.type);
        ctx.globalAlpha = hovered && hovered !== n ? 0.45 : 1;
        ctx.fill();
        if (n === hovered) {
          ctx.lineWidth = 2;
          ctx.strokeStyle = '#fff';
          ctx.stroke();
        }
        ctx.globalAlpha = 1;

        if (zoom > 0.5) {
          ctx.font = `${11 * Math.min(zoom, 1.3)}px 'Pretendard', sans-serif`;
          ctx.fillStyle = 'var(--text-secondary)';
          ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--text-secondary') || '#aaa';
          ctx.textAlign = 'center';
          ctx.fillText(Utils.truncate(n.label, 14), p.x, p.y + r + 13);
        }
      });
      ctx.restore();
    }

    function loop() {
      tick();
      draw();
      raf = requestAnimationFrame(loop);
    }
    loop();

    function findNodeAt(sx, sy) {
      for (let i = nodes.length - 1; i >= 0; i--) {
        const n = nodes[i];
        const p = toScreen(n.x, n.y);
        const r = (n.size || 10) * zoom * 0.6 + 4;
        const dx = sx - p.x, dy = sy - p.y;
        if (dx * dx + dy * dy <= r * r) return n;
      }
      return null;
    }

    function getPos(e) {
      const rect = canvas.getBoundingClientRect();
      return {
        x: (e.clientX - rect.left) * devicePixelRatio,
        y: (e.clientY - rect.top) * devicePixelRatio,
      };
    }

    canvas.addEventListener('mousedown', (e) => {
      const pos = getPos(e);
      const n = findNodeAt(pos.x, pos.y);
      if (n) {
        dragging = n;
      } else {
        panning = true;
        panStart = { x: pos.x, y: pos.y, panX, panY };
      }
    });
    window.addEventListener('mousemove', (e) => {
      const pos = getPos(e);
      if (dragging) {
        const w = toWorld(pos.x, pos.y);
        dragging.x = w.x;
        dragging.y = w.y;
        dragging.vx = 0;
        dragging.vy = 0;
      } else if (panning) {
        panX = panStart.panX + (pos.x - panStart.x) / zoom;
        panY = panStart.panY + (pos.y - panStart.y) / zoom;
      } else {
        hovered = findNodeAt(pos.x, pos.y);
        canvas.style.cursor = hovered ? 'pointer' : 'grab';
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (dragging && onNodeClick) {
        const pos = getPos(e);
        const moved = Math.abs((dragging._downX || pos.x) - pos.x) > 3;
      }
      dragging = null;
      panning = false;
    });
    canvas.addEventListener('click', (e) => {
      const pos = getPos(e);
      const n = findNodeAt(pos.x, pos.y);
      if (n && onNodeClick) onNodeClick(n);
    });
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = -e.deltaY * 0.001;
      zoom = Math.min(2.5, Math.max(0.3, zoom + delta));
    }, { passive: false });

    return {
      destroy() {
        cancelAnimationFrame(raf);
        resizeObserver.disconnect();
      },
    };
  },

  // Dedicated force layout for the character-only relationship map.
  mountRelationshipMap(canvas, characters, edges, { onNodeClick, onPositionChange, groupColorFor } = {}) {
    const ctx = canvas.getContext('2d');
    let width, height;
    const nodes = characters.map((c) => ({
      key: c.id,
      label: c.name,
      x: typeof c.relX === 'number' ? c.relX : Math.random() * 300 - 150,
      y: typeof c.relY === 'number' ? c.relY : Math.random() * 300 - 150,
      vx: 0,
      vy: 0,
      pinned: typeof c.relX === 'number',
    }));
    const nodeIndex = Object.fromEntries(nodes.map((n, i) => [n.key, i]));
    const edgeList = edges.map((e) => ({ ...e, s: nodeIndex[e.source], t: nodeIndex[e.target] })).filter((e) => e.s !== undefined && e.t !== undefined);

    let dragging = null;
    let dragMoved = false;
    let panX = 0, panY = 0, zoom = 1;
    let panning = false, panStart = null;
    let raf = null;
    let hovered = null;

    function resize() {
      const rect = canvas.parentElement.getBoundingClientRect();
      width = canvas.width = rect.width * devicePixelRatio;
      height = canvas.height = rect.height * devicePixelRatio;
      canvas.style.width = rect.width + 'px';
      canvas.style.height = rect.height + 'px';
    }
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas.parentElement);

    function toScreen(x, y) {
      return { x: width / 2 + (x + panX) * zoom, y: height / 2 + (y + panY) * zoom };
    }
    function toWorld(sx, sy) {
      return { x: (sx - width / 2) / zoom - panX, y: (sy - height / 2) / zoom - panY };
    }

    function tick() {
      const repulsion = 4200;
      const springLen = 130;
      const springK = 0.03;
      const center = 0.002;
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          const distSq = dx * dx + dy * dy + 0.01;
          const dist = Math.sqrt(distSq);
          const force = repulsion / distSq;
          const fx = (dx / dist) * force, fy = (dy / dist) * force;
          a.vx += fx; a.vy += fy;
          b.vx -= fx; b.vy -= fy;
        }
      }
      edgeList.forEach((e) => {
        const a = nodes[e.s], b = nodes[e.t];
        const dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const diff = dist - springLen;
        const force = springK * diff;
        const fx = (dx / dist) * force, fy = (dy / dist) * force;
        a.vx += fx; a.vy += fy;
        b.vx -= fx; b.vy -= fy;
      });
      nodes.forEach((n) => {
        n.vx -= n.x * center;
        n.vy -= n.y * center;
        n.vx *= 0.85;
        n.vy *= 0.85;
        if (n !== dragging) {
          n.x += n.vx;
          n.y += n.vy;
        }
      });
    }

    function draw() {
      ctx.clearRect(0, 0, width, height);
      edgeList.forEach((e) => {
        const a = nodes[e.s], b = nodes[e.t];
        const pa = toScreen(a.x, a.y), pb = toScreen(b.x, b.y);
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
        ctx.strokeStyle = e.color || 'rgba(150,150,170,0.4)';
        ctx.lineWidth = 1.6 * zoom;
        ctx.stroke();
        if (zoom > 0.5) {
          const mx = (pa.x + pb.x) / 2, my = (pa.y + pb.y) / 2;
          ctx.font = `${10.5 * Math.min(zoom, 1.3)}px 'Pretendard', sans-serif`;
          ctx.fillStyle = e.color || '#999';
          ctx.textAlign = 'center';
          ctx.fillText(Utils.truncate(e.label || '', 10), mx, my - 4);
        }
      });

      nodes.forEach((n) => {
        const p = toScreen(n.x, n.y);
        const r = 16 * zoom * 0.6;
        const groupColor = groupColorFor ? groupColorFor(n.key) : null;
        if (groupColor) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, r + 3, 0, Math.PI * 2);
          ctx.strokeStyle = groupColor;
          ctx.lineWidth = 2.5 * zoom;
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fillStyle = Graph.colorFor('character');
        ctx.globalAlpha = hovered && hovered !== n ? 0.5 : 1;
        ctx.fill();
        if (n === hovered) {
          ctx.lineWidth = 2;
          ctx.strokeStyle = '#fff';
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        ctx.font = `${12 * Math.min(zoom, 1.3)}px 'Pretendard', sans-serif`;
        ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--text') || '#eee';
        ctx.textAlign = 'center';
        ctx.fillText(Utils.truncate(n.label, 12), p.x, p.y + r + 14);
      });
    }

    function loop() {
      tick();
      draw();
      raf = requestAnimationFrame(loop);
    }
    loop();

    function findNodeAt(sx, sy) {
      for (let i = nodes.length - 1; i >= 0; i--) {
        const n = nodes[i];
        const p = toScreen(n.x, n.y);
        const r = 16 * zoom * 0.6 + 6;
        const dx = sx - p.x, dy = sy - p.y;
        if (dx * dx + dy * dy <= r * r) return n;
      }
      return null;
    }
    function getPos(e) {
      const rect = canvas.getBoundingClientRect();
      return { x: (e.clientX - rect.left) * devicePixelRatio, y: (e.clientY - rect.top) * devicePixelRatio };
    }

    canvas.addEventListener('mousedown', (e) => {
      const pos = getPos(e);
      const n = findNodeAt(pos.x, pos.y);
      dragMoved = false;
      if (n) dragging = n;
      else { panning = true; panStart = { x: pos.x, y: pos.y, panX, panY }; }
    });
    window.addEventListener('mousemove', (e) => {
      const pos = getPos(e);
      if (dragging) {
        dragMoved = true;
        const w = toWorld(pos.x, pos.y);
        dragging.x = w.x;
        dragging.y = w.y;
        dragging.vx = 0;
        dragging.vy = 0;
        dragging.pinned = true;
      } else if (panning) {
        panX = panStart.panX + (pos.x - panStart.x) / zoom;
        panY = panStart.panY + (pos.y - panStart.y) / zoom;
      } else {
        hovered = findNodeAt(pos.x, pos.y);
        canvas.style.cursor = hovered ? 'pointer' : 'grab';
      }
    });
    window.addEventListener('mouseup', () => {
      if (dragging && dragMoved && onPositionChange) {
        onPositionChange(dragging.key, dragging.x, dragging.y);
      }
      dragging = null;
      panning = false;
    });
    canvas.addEventListener('click', (e) => {
      if (dragMoved) return;
      const pos = getPos(e);
      const n = findNodeAt(pos.x, pos.y);
      if (n && onNodeClick) onNodeClick(n.key);
    });
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = -e.deltaY * 0.001;
      zoom = Math.min(2.5, Math.max(0.3, zoom + delta));
    }, { passive: false });

    return {
      destroy() {
        cancelAnimationFrame(raf);
        resizeObserver.disconnect();
      },
    };
  },

  // A one-shot, non-interactive relationship preview for small spaces (home screen
  // work cards). Deliberately NOT built on mountRelationshipMap: that function runs
  // a continuous requestAnimationFrame physics loop plus window-level mouse
  // listeners with no cleanup call anywhere in the app today — mounting several of
  // those at once per card would compound that into a real perf/memory problem.
  // This instead lays nodes out on a static circle and draws exactly once.
  drawStaticRelationshipPreview(canvas, characters, edges) {
    const ctx = canvas.getContext('2d');
    const rect = canvas.parentElement.getBoundingClientRect();
    const width = (canvas.width = Math.max(1, Math.round(rect.width * devicePixelRatio)));
    const height = (canvas.height = Math.max(1, Math.round(rect.height * devicePixelRatio)));
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    const n = characters.length;
    if (!n) return;
    const cx = width / 2;
    const cy = height / 2;
    const r = Math.min(width, height) * 0.32;
    const positions = {};
    characters.forEach((c, i) => {
      const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
      positions[c.id] = { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r };
    });

    ctx.clearRect(0, 0, width, height);
    edges.forEach((e) => {
      const a = positions[e.source];
      const b = positions[e.target];
      if (!a || !b) return;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = e.color || 'rgba(150,150,170,0.4)';
      ctx.lineWidth = 1.3 * devicePixelRatio;
      ctx.stroke();
    });
    characters.forEach((c) => {
      const p = positions[c.id];
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5 * devicePixelRatio, 0, Math.PI * 2);
      ctx.fillStyle = Graph.colorFor('character');
      ctx.fill();
    });
  },
};
