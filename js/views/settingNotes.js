const SETTING_CATEGORIES = ['세계관', '지역', '조직/세력', '사물/아이템', '역사/사건', '규칙/마법체계', '일반'];

Views.settingNotes = async function (workId) {
  const content = document.getElementById('content');
  const qId = Router.query().get('id');

  content.innerHTML = `
    <div class="view view--split">
      <div class="side-list" id="noteList">
        <div class="side-list__header">
          <h2>🗺️ 설정 노트</h2>
          <button class="btn btn--ghost btn--pal-setting btn--sm" id="addNoteBtn">+ 추가</button>
        </div>
        <div class="side-list__items" id="noteItems"></div>
      </div>
      <div class="detail-pane" id="noteDetail"></div>
    </div>
  `;

  async function refresh(selectId) {
    const notes = await DB.getAllByIndex('settingNotes', 'workId', workId);
    const byCategory = {};
    notes.forEach((n) => {
      byCategory[n.category] = byCategory[n.category] || [];
      byCategory[n.category].push(n);
    });
    const itemsEl = document.getElementById('noteItems');
    itemsEl.innerHTML = '';
    if (!notes.length) {
      itemsEl.innerHTML = `<p class="muted side-list__empty">아직 설정 노트가 없습니다.</p>`;
    }
    Object.keys(byCategory).sort().forEach((cat) => {
      const group = document.createElement('div');
      group.className = 'side-list__group';
      group.innerHTML = `<div class="side-list__group-title">${Utils.escapeHtml(cat)}</div>`;
      byCategory[cat].sort((a, b) => a.title.localeCompare(b.title, 'ko')).forEach((n) => {
        const el = document.createElement('div');
        el.className = 'side-list__item' + (n.id === selectId ? ' side-list__item--active' : '');
        el.innerHTML = `<strong>${Utils.escapeHtml(n.title)}</strong>`;
        el.addEventListener('click', () => Router.go(`#/work/${workId}/settings?id=${n.id}`));
        group.appendChild(el);
      });
      itemsEl.appendChild(group);
    });
    return notes;
  }

  document.getElementById('addNoteBtn').addEventListener('click', async () => {
    const n = await Models.createSettingNote(workId);
    await refresh(n.id);
    renderDetail(n);
  });

  function renderEmpty() {
    document.getElementById('noteDetail').innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">🗺️</div>
        <h3>설정 노트를 선택하거나 추가해보세요</h3>
      </div>`;
  }

  async function renderDetail(n) {
    const detail = document.getElementById('noteDetail');
    detail.innerHTML = `
      <div class="detail-form">
        <div class="detail-form__header">
          <input type="text" class="title-input" id="fTitle" value="${Utils.escapeHtml(n.title)}" placeholder="설정 이름">
          <button class="btn btn--ghost btn--sm btn--danger-text" id="deleteBtn">삭제</button>
        </div>
        <div class="form-field">
          <label>분류</label>
          <select class="input" id="fCategory">
            ${SETTING_CATEGORIES.map((c) => `<option value="${c}" ${c === n.category ? 'selected' : ''}>${c}</option>`).join('')}
          </select>
        </div>
        <div class="form-field">
          <label>내용 <span class="muted">([[이름]]으로 캐릭터·장면과 연결)</span></label>
          <textarea class="textarea" id="fContent" rows="14">${Utils.escapeHtml(n.content || '')}</textarea>
        </div>
        <span class="save-indicator" id="saveIndicator">저장됨</span>
      </div>
    `;

    const indicator = document.getElementById('saveIndicator');
    const save = Utils.debounce(async () => {
      indicator.textContent = '저장 중...';
      await Models.updateSettingNote(n.id, {
        title: document.getElementById('fTitle').value,
        category: document.getElementById('fCategory').value,
        content: document.getElementById('fContent').value,
      });
      indicator.textContent = '저장됨 · 방금';
    }, 600);

    document.getElementById('fTitle').addEventListener('input', () => { indicator.textContent = '입력 중...'; save(); });
    document.getElementById('fContent').addEventListener('input', () => { indicator.textContent = '입력 중...'; save(); });
    document.getElementById('fCategory').addEventListener('change', async () => {
      await refresh(n.id);
      save();
    });

    document.getElementById('deleteBtn').addEventListener('click', async () => {
      const ok = await UI.confirm(`"${n.title}" 설정 노트를 삭제할까요?`, { title: '설정 노트 삭제', confirmLabel: '삭제', danger: true });
      if (!ok) return;
      await Models.deleteSettingNote(n.id);
      UI.toast('삭제되었습니다');
      await refresh(null);
      Router.go(`#/work/${workId}/settings`);
    });

    UI.attachWikiAutocomplete(document.getElementById('fContent'), async () => {
      const b = await Models.getWorkBundle(workId);
      const titles = [];
      b.characters.forEach((c) => titles.push(c.name));
      b.settingNotes.forEach((x) => x.id !== n.id && titles.push(x.title));
      b.chapters.forEach((ch) => (b.scenesByChapter[ch.id] || []).forEach((s) => titles.push(s.title)));
      return titles;
    });
  }

  const notes = await refresh(qId);
  if (qId) {
    const n = notes.find((x) => x.id === qId) || (await DB.get('settingNotes', qId));
    if (n) renderDetail(n);
    else renderEmpty();
  } else {
    renderEmpty();
  }
};
