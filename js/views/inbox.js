Views.inbox = async function (workId) {
  const content = document.getElementById('content');
  const qId = Router.query().get('id');

  content.innerHTML = `
    <div class="view view--inbox">
      <header class="view__header">
        <div>
          <h1>📥 메모 인박스</h1>
          <p class="muted">떠오른 아이디어를 빠르게 적어두세요. 나중에 통합 검색으로 다시 찾을 수 있어요.</p>
        </div>
        <div class="inbox-tabs">
          <button class="tab-btn tab-btn--active" data-tab="active">활성</button>
          <button class="tab-btn" data-tab="archived">보관됨</button>
        </div>
      </header>
      <div class="memo-composer">
        <textarea id="memoInput" class="textarea" rows="3" placeholder="빠르게 메모하기... (Ctrl+Enter로 저장, [[이름]]으로 연결)"></textarea>
        <button class="btn btn--primary" id="memoAddBtn">추가</button>
      </div>
      <div class="memo-grid" id="memoGrid"></div>
    </div>
  `;

  const textarea = document.getElementById('memoInput');
  UI.attachWikiAutocomplete(textarea, async () => {
    const b = await Models.getWorkBundle(workId);
    const titles = [];
    b.characters.forEach((c) => titles.push(c.name));
    b.settingNotes.forEach((n) => titles.push(n.title));
    b.chapters.forEach((ch) => (b.scenesByChapter[ch.id] || []).forEach((s) => titles.push(s.title)));
    return titles;
  });

  let currentTab = 'active';

  async function addMemo() {
    const val = textarea.value.trim();
    if (!val) return;
    await Models.createMemo(workId, { content: val });
    textarea.value = '';
    await refresh();
  }

  document.getElementById('memoAddBtn').addEventListener('click', addMemo);
  textarea.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'Enter') addMemo();
  });

  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      currentTab = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('tab-btn--active', b === btn));
      refresh();
    });
  });

  async function refresh() {
    const memos = await DB.getAllByIndex('memos', 'workId', workId);
    const filtered = memos.filter((m) => (currentTab === 'archived' ? m.archived : !m.archived));
    filtered.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    const grid = document.getElementById('memoGrid');
    grid.innerHTML = '';
    if (!filtered.length) {
      grid.innerHTML = `<p class="muted">${currentTab === 'archived' ? '보관된 메모가 없습니다.' : '메모가 없습니다. 위에서 빠르게 추가해보세요.'}</p>`;
      return;
    }
    filtered.forEach((m) => {
      const card = document.createElement('div');
      card.className = 'memo-editable-card' + (m.id === qId ? ' memo-editable-card--highlight' : '');
      card.innerHTML = `
        <textarea class="memo-editable-card__text" rows="4">${Utils.escapeHtml(m.content)}</textarea>
        <div class="memo-editable-card__footer">
          <span class="muted">${Utils.formatDate(m.updatedAt)}</span>
          <div class="memo-editable-card__actions">
            <button class="icon-btn archive-btn" title="${m.archived ? '보관 해제' : '보관'}">${m.archived ? '↩' : '🗄'}</button>
            <button class="icon-btn delete-btn" title="삭제">🗑</button>
          </div>
        </div>
      `;
      const ta = card.querySelector('textarea');
      ta.addEventListener('input', Utils.debounce(async () => {
        await Models.updateMemo(m.id, { content: ta.value });
      }, 600));
      card.querySelector('.archive-btn').addEventListener('click', async () => {
        await Models.updateMemo(m.id, { archived: !m.archived });
        refresh();
      });
      card.querySelector('.delete-btn').addEventListener('click', async () => {
        const ok = await UI.confirm('이 메모를 삭제할까요?', { title: '메모 삭제', confirmLabel: '삭제', danger: true });
        if (!ok) return;
        await Models.deleteMemo(m.id);
        refresh();
      });
      grid.appendChild(card);
    });
  }

  await refresh();
};
