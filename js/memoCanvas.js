// Freeform memo board: drag-placed, resizable, colorable memo cards, grouped by
// draggable color frames, optionally linked with connector lines — a lightweight
// mind-map surface for loose ideas. Implemented with absolutely-positioned DOM
// nodes (not <canvas>) since cards need real text editing, which canvas can't do.
const MEMO_COLORS = Utils.PALETTE_COLORS;

const SVG_NS = 'http://www.w3.org/2000/svg';
// Re-inserted at the top of the SVG on every redraw (redrawConnections rebuilds the
// whole SVG each time via innerHTML), so both markers are always available for
// `marker-start`/`marker-end` regardless of which connections currently use them.
const MEMO_ARROW_DEFS_HTML = `
  <defs>
    <marker id="memoArrowEnd" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0,0 L10,5 L0,10 z" class="memo-canvas-arrow"></path>
    </marker>
    <marker id="memoArrowStart" viewBox="0 0 10 10" refX="2" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M10,0 L0,5 L10,10 z" class="memo-canvas-arrow"></path>
    </marker>
  </defs>
`;

// A zigzag path (alternating quadratic-bezier control points either side of the
// straight line) between two points — used for the '구불구불한' connection style.
function buildWavyPath(x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const ux = dx / len, uy = dy / len;
  const nx = -uy, ny = ux; // unit normal
  const wavelength = 22;
  const amp = 6;
  const steps = Math.max(2, Math.round(len / wavelength));
  let d = `M ${x1} ${y1}`;
  for (let i = 1; i <= steps; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const midT = (i - 0.5) / steps;
    const cx = x1 + ux * len * midT + nx * amp * side;
    const cy = y1 + uy * len * midT + ny * amp * side;
    const ex = x1 + ux * len * (i / steps);
    const ey = y1 + uy * len * (i / steps);
    d += ` Q ${cx} ${cy} ${ex} ${ey}`;
  }
  return d;
}

const MemoCanvas = {
  async mount(container, workId) {
    container.innerHTML = `
      <div class="memo-canvas-wrap">
        <div class="memo-canvas-toolbar">
          <button class="btn btn--ghost btn--sm" id="addMemoCardBtn">+ 메모</button>
          <button class="btn btn--ghost btn--sm" id="addMemoGroupBtn">+ 그룹</button>
          <span class="muted">드래그로 이동 · 휠로 확대/축소 · 🔗로 카드 연결 (마우스 전용 — 메모 내용만 다루려면 '📋 목록' 탭을 이용해주세요)</span>
        </div>
        <div class="memo-canvas-viewport" id="memoCanvasViewport" role="group" aria-label="자유 배치 메모 보드">
          <div class="memo-canvas-world" id="memoCanvasWorld">
            <svg class="memo-canvas-lines" id="memoCanvasLines"></svg>
          </div>
        </div>
      </div>
    `;

    const viewport = container.querySelector('#memoCanvasViewport');
    const world = container.querySelector('#memoCanvasWorld');
    const svg = container.querySelector('#memoCanvasLines');

    let panX = 40, panY = 40, zoom = 1;
    let linkingFromId = null;
    const cardEls = {};
    const groupEls = {};

    function applyTransform() {
      world.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
    }
    applyTransform();

    let panning = false, panStart = null;
    viewport.addEventListener('mousedown', (e) => {
      if (e.target !== viewport && e.target !== world && e.target !== svg) return;
      panning = true;
      panStart = { x: e.clientX, y: e.clientY, panX, panY };
      cancelLinking();
    });
    window.addEventListener('mousemove', (e) => {
      if (!panning) return;
      panX = panStart.panX + (e.clientX - panStart.x);
      panY = panStart.panY + (e.clientY - panStart.y);
      applyTransform();
    });
    window.addEventListener('mouseup', () => { panning = false; });
    viewport.addEventListener('wheel', (e) => {
      e.preventDefault();
      zoom = Math.min(2.5, Math.max(0.3, zoom - e.deltaY * 0.001));
      applyTransform();
    }, { passive: false });

    function cancelLinking() {
      if (!linkingFromId) return;
      const prev = cardEls[linkingFromId];
      if (prev) prev.classList.remove('memo-canvas-card--linking');
      linkingFromId = null;
    }
    document.addEventListener('keydown', escLinkHandler);
    function escLinkHandler(e) { if (e.key === 'Escape') cancelLinking(); }

    async function loadAll() {
      const [memos, groups, connections] = await Promise.all([
        DB.getAllByIndex('memos', 'workId', workId),
        Models.getMemoGroups(workId),
        Models.getMemoConnections(workId),
      ]);
      return { memos: memos.filter((m) => !m.archived), groups, connections };
    }

    async function placeUnpositioned(memos) {
      const unplaced = memos.filter((m) => m.x == null);
      for (let i = 0; i < unplaced.length; i++) {
        const m = unplaced[i];
        m.x = 40 + (i % 4) * 260;
        m.y = 40 + Math.floor(i / 4) * 180;
        await Models.updateMemo(m.id, { x: m.x, y: m.y });
      }
    }

    function groupBounds(g) { return { left: g.x, top: g.y, right: g.x + g.w, bottom: g.y + g.h }; }

    async function assignGroupForMemo(memo, groups) {
      const cx = memo.x + memo.w / 2, cy = memo.y + memo.h / 2;
      const hit = groups.find((g) => {
        const b = groupBounds(g);
        return cx >= b.left && cx <= b.right && cy >= b.top && cy <= b.bottom;
      });
      const newGroupId = hit ? hit.id : null;
      if (newGroupId !== memo.groupId) {
        memo.groupId = newGroupId;
        await Models.updateMemo(memo.id, { groupId: newGroupId });
      }
    }

    function redrawConnections(connections, memos) {
      const memoById = Object.fromEntries(memos.map((m) => [m.id, m]));
      svg.innerHTML = MEMO_ARROW_DEFS_HTML;
      connections.forEach((c) => {
        const a = memoById[c.fromMemoId], b = memoById[c.toMemoId];
        if (!a || !b) return;
        const x1 = a.x + a.w / 2, y1 = a.y + a.h / 2, x2 = b.x + b.w / 2, y2 = b.y + b.h / 2;

        let el;
        if (c.style === 'wavy') {
          el = document.createElementNS(SVG_NS, 'path');
          el.setAttribute('d', buildWavyPath(x1, y1, x2, y2));
        } else {
          el = document.createElementNS(SVG_NS, 'line');
          el.setAttribute('x1', x1);
          el.setAttribute('y1', y1);
          el.setAttribute('x2', x2);
          el.setAttribute('y2', y2);
        }
        el.setAttribute('class', 'memo-canvas-line' + (c.style === 'dashed' ? ' memo-canvas-line--dashed' : ''));
        if (c.arrowStart) el.setAttribute('marker-start', 'url(#memoArrowStart)');
        if (c.arrowEnd) el.setAttribute('marker-end', 'url(#memoArrowEnd)');
        el.style.pointerEvents = 'stroke';
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          openConnectionMenu(e, c);
        });
        svg.appendChild(el);
      });
    }

    // Small popup (style/arrows/delete) anchored at the click point — replaces the
    // old "click a line to instantly delete it" behavior now that lines carry more
    // editable state than just existing.
    function openConnectionMenu(e, conn) {
      document.querySelectorAll('.memo-conn-menu').forEach((el) => el.remove());
      const menu = document.createElement('div');
      menu.className = 'memo-conn-menu';
      menu.innerHTML = `
        <div class="memo-conn-menu__row">
          <button class="chip${conn.style === 'solid' || !conn.style ? ' chip--active' : ''}" data-style="solid">실선</button>
          <button class="chip${conn.style === 'dashed' ? ' chip--active' : ''}" data-style="dashed">점선</button>
          <button class="chip${conn.style === 'wavy' ? ' chip--active' : ''}" data-style="wavy">물결</button>
        </div>
        <div class="memo-conn-menu__row">
          <button class="chip${conn.arrowStart ? ' chip--active' : ''}" data-arrow="arrowStart">◀ 시작 화살표</button>
          <button class="chip${conn.arrowEnd ? ' chip--active' : ''}" data-arrow="arrowEnd">끝 화살표 ▶</button>
        </div>
        <button class="btn btn--ghost btn--sm btn--danger-text btn--block" id="memoConnDeleteBtn">삭제</button>
      `;
      document.body.appendChild(menu);
      menu.style.left = `${Math.min(e.clientX, window.innerWidth - 200)}px`;
      menu.style.top = `${Math.min(e.clientY, window.innerHeight - 120)}px`;

      menu.querySelectorAll('[data-style]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          await Models.updateMemoConnection(conn.id, { style: btn.dataset.style });
          menu.remove();
          await refresh();
        });
      });
      menu.querySelectorAll('[data-arrow]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const key = btn.dataset.arrow;
          await Models.updateMemoConnection(conn.id, { [key]: !conn[key] });
          menu.remove();
          await refresh();
        });
      });
      menu.querySelector('#memoConnDeleteBtn').addEventListener('click', async () => {
        menu.remove();
        const ok = await UI.confirm('이 연결선을 삭제할까요?', { title: '연결선 삭제', confirmLabel: '삭제', danger: true });
        if (!ok) return;
        await Models.deleteMemoConnection(conn.id);
        await refresh();
      });

      setTimeout(() => {
        const closeHandler = (ev) => {
          if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener('mousedown', closeHandler); }
        };
        document.addEventListener('mousedown', closeHandler);
      }, 0);
    }

    let state = null;

    async function refresh() {
      const data = await loadAll();
      await placeUnpositioned(data.memos);
      state = data;
      renderAll();
    }

    function renderAll() {
      world.querySelectorAll('.memo-group-frame, .memo-canvas-card').forEach((el) => el.remove());
      Object.keys(groupEls).forEach((k) => delete groupEls[k]);
      Object.keys(cardEls).forEach((k) => delete cardEls[k]);
      state.groups.forEach((g) => world.appendChild(renderGroupFrame(g)));
      state.memos.forEach((m) => world.appendChild(renderCard(m)));
      redrawConnections(state.connections, state.memos);
    }

    function renderGroupFrame(group) {
      const el = document.createElement('div');
      el.className = 'memo-group-frame';
      el.style.left = `${group.x}px`;
      el.style.top = `${group.y}px`;
      el.style.width = `${group.w}px`;
      el.style.height = `${group.h}px`;
      el.style.setProperty('--group-color', group.color);
      if (group.fillColor) el.style.setProperty('--group-fill-color', group.fillColor);
      el.innerHTML = `
        <div class="memo-group-frame__header">
          <input type="text" class="memo-group-frame__name" value="${Utils.escapeHtml(group.name)}">
          <button class="icon-btn memo-group-frame__delete" title="그룹 삭제" aria-label="그룹 삭제">✕</button>
        </div>
        <div class="memo-group-frame__colors">
          <span class="memo-group-frame__colors-label">테두리</span>
          ${MEMO_COLORS.map((c) => `<button class="memo-color-dot" data-role="border" data-color="${c}" style="background:${c}" title="테두리 색"></button>`).join('')}
          <span class="memo-group-frame__colors-label">채우기</span>
          ${MEMO_COLORS.map((c) => `<button class="memo-color-dot" data-role="fill" data-color="${c}" style="background:${c}" title="채우기 색"></button>`).join('')}
          <button type="button" class="memo-group-frame__colors-clear" data-role="fill-clear">자동</button>
        </div>
        <div class="memo-group-frame__resize"></div>
      `;
      groupEls[group.id] = el;

      const header = el.querySelector('.memo-group-frame__header');
      const nameInput = el.querySelector('.memo-group-frame__name');

      el.querySelectorAll('.memo-color-dot[data-role="border"]').forEach((dot) => {
        dot.addEventListener('mousedown', (e) => e.stopPropagation());
        dot.addEventListener('click', async () => {
          group.color = dot.dataset.color;
          el.style.setProperty('--group-color', group.color);
          await Models.updateMemoGroup(group.id, { color: group.color });
        });
      });
      el.querySelectorAll('.memo-color-dot[data-role="fill"]').forEach((dot) => {
        dot.addEventListener('mousedown', (e) => e.stopPropagation());
        dot.addEventListener('click', async () => {
          group.fillColor = dot.dataset.color;
          el.style.setProperty('--group-fill-color', group.fillColor);
          await Models.updateMemoGroup(group.id, { fillColor: group.fillColor });
        });
      });
      const fillClearBtn = el.querySelector('[data-role="fill-clear"]');
      fillClearBtn.addEventListener('mousedown', (e) => e.stopPropagation());
      fillClearBtn.addEventListener('click', async () => {
        group.fillColor = null;
        el.style.removeProperty('--group-fill-color');
        await Models.updateMemoGroup(group.id, { fillColor: null });
      });
      nameInput.addEventListener('mousedown', (e) => e.stopPropagation());
      nameInput.addEventListener('change', async () => {
        group.name = nameInput.value.trim() || group.name;
        await Models.updateMemoGroup(group.id, { name: group.name });
      });
      el.querySelector('.memo-group-frame__delete').addEventListener('mousedown', (e) => e.stopPropagation());
      el.querySelector('.memo-group-frame__delete').addEventListener('click', async () => {
        const ok = await UI.confirm(`"${group.name}" 그룹을 삭제할까요? (메모는 삭제되지 않습니다)`, { title: '그룹 삭제', confirmLabel: '삭제', danger: true });
        if (!ok) return;
        await Models.deleteMemoGroup(group.id);
        await refresh();
      });

      header.addEventListener('mousedown', (e) => {
        if (e.target.closest('button') || e.target === nameInput) return;
        e.stopPropagation();
        const startX = e.clientX, startY = e.clientY;
        const startLeft = group.x, startTop = group.y;
        const members = state.memos.filter((m) => m.groupId === group.id);
        const memberStarts = members.map((m) => ({ m, x: m.x, y: m.y }));
        function onMove(e2) {
          const dx = (e2.clientX - startX) / zoom, dy = (e2.clientY - startY) / zoom;
          group.x = startLeft + dx; group.y = startTop + dy;
          el.style.left = `${group.x}px`; el.style.top = `${group.y}px`;
          memberStarts.forEach(({ m, x, y }) => {
            m.x = x + dx; m.y = y + dy;
            const cardEl = cardEls[m.id];
            if (cardEl) { cardEl.style.left = `${m.x}px`; cardEl.style.top = `${m.y}px`; }
          });
          redrawConnections(state.connections, state.memos);
        }
        async function onUp() {
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onUp);
          await Models.updateMemoGroup(group.id, { x: group.x, y: group.y });
          for (const { m } of memberStarts) await Models.updateMemo(m.id, { x: m.x, y: m.y });
        }
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
      });

      const resizeHandle = el.querySelector('.memo-group-frame__resize');
      resizeHandle.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        const startX = e.clientX, startY = e.clientY;
        const startW = group.w, startH = group.h;
        function onMove(e2) {
          group.w = Math.max(200, startW + (e2.clientX - startX) / zoom);
          group.h = Math.max(140, startH + (e2.clientY - startY) / zoom);
          el.style.width = `${group.w}px`; el.style.height = `${group.h}px`;
        }
        async function onUp() {
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onUp);
          await Models.updateMemoGroup(group.id, { w: group.w, h: group.h });
        }
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
      });

      return el;
    }

    function renderCard(memo) {
      const el = document.createElement('div');
      el.className = 'memo-canvas-card' + (memo.id === linkingFromId ? ' memo-canvas-card--linking' : '');
      el.style.left = `${memo.x}px`;
      el.style.top = `${memo.y}px`;
      el.style.width = `${memo.w}px`;
      el.style.height = `${memo.h}px`;
      if (memo.color) el.style.setProperty('--memo-color', memo.color);
      el.style.setProperty('--memo-opacity', memo.opacity || 0);
      el.innerHTML = `
        <div class="memo-canvas-card__header">
          <div class="memo-canvas-card__colors">
            ${MEMO_COLORS.map((c) => `<button class="memo-color-dot" data-color="${c}" style="background:${c}" title="색상 ${c}" aria-label="색상 ${c}"></button>`).join('')}
          </div>
          <input type="range" class="memo-canvas-card__opacity" min="0" max="100" value="${Math.round((memo.opacity || 0) * 100)}" title="채우기 정도" aria-label="채우기 정도">
          <button class="icon-btn memo-canvas-card__link" title="다른 카드와 연결" aria-label="다른 카드와 연결">🔗</button>
          <button class="icon-btn memo-canvas-card__delete" title="삭제" aria-label="삭제">✕</button>
        </div>
        <textarea class="memo-canvas-card__text" placeholder="아이디어를 적어보세요...">${Utils.escapeHtml(memo.content)}</textarea>
        <div class="memo-canvas-card__resize"></div>
      `;
      cardEls[memo.id] = el;

      el.querySelectorAll('.memo-color-dot').forEach((dot) => {
        dot.addEventListener('mousedown', (e) => e.stopPropagation());
        dot.addEventListener('click', async () => {
          memo.color = dot.dataset.color;
          el.style.setProperty('--memo-color', memo.color);
          await Models.updateMemo(memo.id, { color: memo.color });
        });
      });

      const opacitySlider = el.querySelector('.memo-canvas-card__opacity');
      opacitySlider.addEventListener('mousedown', (e) => e.stopPropagation());
      opacitySlider.addEventListener('input', Utils.debounce(async () => {
        memo.opacity = Number(opacitySlider.value) / 100;
        el.style.setProperty('--memo-opacity', memo.opacity);
        await Models.updateMemo(memo.id, { opacity: memo.opacity });
      }, 300));

      const linkBtn = el.querySelector('.memo-canvas-card__link');
      linkBtn.addEventListener('mousedown', (e) => e.stopPropagation());
      linkBtn.addEventListener('click', async () => {
        if (linkingFromId && linkingFromId !== memo.id) {
          await Models.createMemoConnection(workId, { fromMemoId: linkingFromId, toMemoId: memo.id });
          cancelLinking();
          await refresh();
        } else if (linkingFromId === memo.id) {
          cancelLinking();
        } else {
          cancelLinking();
          linkingFromId = memo.id;
          el.classList.add('memo-canvas-card--linking');
          UI.toast('연결할 다른 카드의 🔗 버튼을 클릭하세요 (Esc로 취소)');
        }
      });

      const deleteBtn = el.querySelector('.memo-canvas-card__delete');
      deleteBtn.addEventListener('mousedown', (e) => e.stopPropagation());
      deleteBtn.addEventListener('click', async () => {
        const ok = await UI.confirm('이 메모를 삭제할까요?', { title: '메모 삭제', confirmLabel: '삭제', danger: true });
        if (!ok) return;
        await Models.deleteMemo(memo.id);
        await refresh();
      });

      const textarea = el.querySelector('.memo-canvas-card__text');
      textarea.addEventListener('mousedown', (e) => e.stopPropagation());
      textarea.addEventListener('input', Utils.debounce(async () => {
        memo.content = textarea.value;
        await Models.updateMemo(memo.id, { content: memo.content });
      }, Prefs.get().autosaveDelay));

      const header = el.querySelector('.memo-canvas-card__header');
      header.addEventListener('mousedown', (e) => {
        if (e.target.closest('button')) return;
        e.stopPropagation();
        const startX = e.clientX, startY = e.clientY;
        const startLeft = memo.x, startTop = memo.y;
        function onMove(e2) {
          const dx = (e2.clientX - startX) / zoom, dy = (e2.clientY - startY) / zoom;
          memo.x = startLeft + dx; memo.y = startTop + dy;
          el.style.left = `${memo.x}px`; el.style.top = `${memo.y}px`;
          redrawConnections(state.connections, state.memos);
        }
        async function onUp() {
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onUp);
          await Models.updateMemo(memo.id, { x: memo.x, y: memo.y });
          await assignGroupForMemo(memo, state.groups);
        }
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
      });

      const resizeHandle = el.querySelector('.memo-canvas-card__resize');
      resizeHandle.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        const startX = e.clientX, startY = e.clientY;
        const startW = memo.w, startH = memo.h;
        function onMove(e2) {
          memo.w = Math.max(160, startW + (e2.clientX - startX) / zoom);
          memo.h = Math.max(100, startH + (e2.clientY - startY) / zoom);
          el.style.width = `${memo.w}px`; el.style.height = `${memo.h}px`;
          redrawConnections(state.connections, state.memos);
        }
        async function onUp() {
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onUp);
          await Models.updateMemo(memo.id, { w: memo.w, h: memo.h });
        }
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
      });

      return el;
    }

    container.querySelector('#addMemoCardBtn').addEventListener('click', async () => {
      const viewportRect = viewport.getBoundingClientRect();
      const worldX = (viewportRect.width / 2 - panX) / zoom - 110;
      const worldY = (viewportRect.height / 2 - panY) / zoom - 70;
      await Models.createMemo(workId, { x: worldX, y: worldY });
      await refresh();
    });
    container.querySelector('#addMemoGroupBtn').addEventListener('click', async () => {
      const viewportRect = viewport.getBoundingClientRect();
      const worldX = (viewportRect.width / 2 - panX) / zoom - 210;
      const worldY = (viewportRect.height / 2 - panY) / zoom - 150;
      await Models.createMemoGroup(workId, { x: worldX, y: worldY });
      await refresh();
    });

    await refresh();

    return {
      destroy() { document.removeEventListener('keydown', escLinkHandler); },
    };
  },
};
