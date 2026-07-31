// Freeform memo board: drag-placed, resizable, colorable memo cards, grouped by
// draggable color frames, optionally linked with connector lines — a lightweight
// mind-map surface for loose ideas. Implemented with absolutely-positioned DOM
// nodes (not <canvas>) since cards need real text editing, which canvas can't do.
const MEMO_COLORS = ['#8b7bff', '#5aa9ff', '#4fd1c5', '#ff9a62', '#f2c94c', '#ff6b9a', '#6bcf7f'];

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
      svg.innerHTML = '';
      connections.forEach((c) => {
        const a = memoById[c.fromMemoId], b = memoById[c.toMemoId];
        if (!a || !b) return;
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', a.x + a.w / 2);
        line.setAttribute('y1', a.y + a.h / 2);
        line.setAttribute('x2', b.x + b.w / 2);
        line.setAttribute('y2', b.y + b.h / 2);
        line.setAttribute('class', 'memo-canvas-line');
        line.style.pointerEvents = 'stroke';
        line.addEventListener('mousedown', async (e) => {
          e.stopPropagation();
          const ok = await UI.confirm('이 연결선을 삭제할까요?', { title: '연결선 삭제', confirmLabel: '삭제', danger: true });
          if (!ok) return;
          await Models.deleteMemoConnection(c.id);
          await refresh();
        });
        svg.appendChild(line);
      });
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
      el.innerHTML = `
        <div class="memo-group-frame__header">
          <input type="text" class="memo-group-frame__name" value="${Utils.escapeHtml(group.name)}">
          <button class="icon-btn memo-group-frame__delete" title="그룹 삭제">✕</button>
        </div>
        <div class="memo-group-frame__resize"></div>
      `;
      groupEls[group.id] = el;

      const header = el.querySelector('.memo-group-frame__header');
      const nameInput = el.querySelector('.memo-group-frame__name');
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
      el.innerHTML = `
        <div class="memo-canvas-card__header">
          <div class="memo-canvas-card__colors">
            ${MEMO_COLORS.map((c) => `<button class="memo-color-dot" data-color="${c}" style="background:${c}" title="색상"></button>`).join('')}
          </div>
          <button class="icon-btn memo-canvas-card__link" title="다른 카드와 연결">🔗</button>
          <button class="icon-btn memo-canvas-card__delete" title="삭제">✕</button>
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
