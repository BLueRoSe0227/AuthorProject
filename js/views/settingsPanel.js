// Unified settings modal: theme, font/display, data management, and (per-work)
// relationship hashtags. Reuses Theme.renderPicker() and App.renderDataPanel().
Views.openSettings = async function (workId) {
  const wrap = document.createElement('div');
  wrap.className = 'settings-modal';
  wrap.innerHTML = `
    <div class="settings-modal__tabs" id="settingsTabs"></div>
    <div class="settings-modal__panel" id="settingsPanelBody"></div>
  `;

  const tabs = [
    { key: 'theme', label: '🎨 테마' },
    { key: 'font', label: '🔤 폰트 · 화면' },
    { key: 'shortcuts', label: '⌨ 단축키' },
    { key: 'data', label: '🗂 데이터 관리' },
  ];
  if (workId) tabs.push({ key: 'tags', label: '🏷 관계 해시태그' });

  // .modal has a fixed width:460px in CSS that the `width` option can only shrink
  // (it's applied as max-width); set width inline here to actually widen it.
  const { modal } = UI.openModal({ title: '⚙ 설정', bodyEl: wrap });
  modal.style.width = '640px';

  const tabsEl = wrap.querySelector('#settingsTabs');
  const panelEl = wrap.querySelector('#settingsPanelBody');

  async function renderTab(key) {
    tabsEl.querySelectorAll('.settings-tab-btn').forEach((b) => b.classList.toggle('settings-tab-btn--active', b.dataset.key === key));
    panelEl.innerHTML = '';
    if (key === 'theme') Theme.renderPicker(panelEl);
    else if (key === 'font') renderFontTab(panelEl);
    else if (key === 'shortcuts') renderShortcutsTab(panelEl);
    else if (key === 'data') App.renderDataPanel(panelEl);
    else if (key === 'tags') await renderTagsTab(panelEl, workId);
  }

  tabs.forEach((t, i) => {
    const btn = document.createElement('button');
    btn.className = 'settings-tab-btn' + (i === 0 ? ' settings-tab-btn--active' : '');
    btn.dataset.key = t.key;
    btn.textContent = t.label;
    btn.addEventListener('click', () => renderTab(t.key));
    tabsEl.appendChild(btn);
  });

  await renderTab(tabs[0].key);
};

function renderFontTab(container) {
  const prefs = Prefs.get();
  container.innerHTML = `
    <div class="settings-section">
      <h4>글꼴</h4>
      <div class="chip-row" id="fontRow"></div>
    </div>
    <div class="settings-section">
      <h4>전체 화면 배율 <span class="muted">(버튼·카드 등 화면 전체가 함께 커져요)</span></h4>
      <div class="chip-row" id="scaleRow"></div>
    </div>
    <div class="settings-section">
      <h4>본문 글자 크기 <span class="muted">(원고 에디터의 글자만 커져요)</span></h4>
      <div class="chip-row" id="textSizeRow"></div>
    </div>
    <div class="settings-section">
      <h4>원고 자동저장 간격</h4>
      <select class="input" id="autosaveSelect"></select>
    </div>
    <div class="settings-section">
      <h4>시간 표시 방식</h4>
      <div class="chip-row" id="reltimeRow"></div>
    </div>
  `;

  const fontRow = container.querySelector('#fontRow');
  Object.keys(PREF_FONT_LABELS).forEach((key) => {
    const btn = document.createElement('button');
    btn.className = 'chip' + (prefs.font === key ? ' chip--active' : '');
    btn.textContent = PREF_FONT_LABELS[key];
    btn.style.fontFamily = PREF_FONT_STACKS[key];
    btn.addEventListener('click', () => {
      Prefs.setFont(key);
      fontRow.querySelectorAll('.chip').forEach((b) => b.classList.remove('chip--active'));
      btn.classList.add('chip--active');
    });
    fontRow.appendChild(btn);
  });

  const scaleRow = container.querySelector('#scaleRow');
  Object.keys(PREF_SCALE_LABELS).forEach((key) => {
    const btn = document.createElement('button');
    btn.className = 'chip' + (prefs.scale === key ? ' chip--active' : '');
    btn.textContent = PREF_SCALE_LABELS[key];
    btn.addEventListener('click', () => {
      Prefs.setScale(key);
      scaleRow.querySelectorAll('.chip').forEach((b) => b.classList.remove('chip--active'));
      btn.classList.add('chip--active');
    });
    scaleRow.appendChild(btn);
  });

  const textSizeRow = container.querySelector('#textSizeRow');
  Object.keys(PREF_TEXT_SIZE_LABELS).forEach((key) => {
    const btn = document.createElement('button');
    btn.className = 'chip' + (prefs.textSize === key ? ' chip--active' : '');
    btn.textContent = PREF_TEXT_SIZE_LABELS[key];
    btn.style.fontSize = key === 'small' ? '11px' : key === 'large' ? '14px' : key === 'xlarge' ? '15px' : '12px';
    btn.addEventListener('click', () => {
      Prefs.setTextSize(key);
      textSizeRow.querySelectorAll('.chip').forEach((b) => b.classList.remove('chip--active'));
      btn.classList.add('chip--active');
    });
    textSizeRow.appendChild(btn);
  });

  const autosaveSelect = container.querySelector('#autosaveSelect');
  Object.keys(PREF_AUTOSAVE_LABELS).forEach((key) => {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = `${PREF_AUTOSAVE_LABELS[key]} (${PREF_AUTOSAVE[key]}ms)`;
    if (prefs.autosave === key) opt.selected = true;
    autosaveSelect.appendChild(opt);
  });
  autosaveSelect.addEventListener('change', () => Prefs.setAutosave(autosaveSelect.value));

  const reltimeRow = container.querySelector('#reltimeRow');
  [
    { value: true, label: '상대 시간 (3분 전)' },
    { value: false, label: '절대 날짜' },
  ].forEach((opt) => {
    const btn = document.createElement('button');
    btn.className = 'chip' + (prefs.relativeTime === opt.value ? ' chip--active' : '');
    btn.textContent = opt.label;
    btn.addEventListener('click', () => {
      Prefs.setRelativeTime(opt.value);
      reltimeRow.querySelectorAll('.chip').forEach((b) => b.classList.remove('chip--active'));
      btn.classList.add('chip--active');
    });
    reltimeRow.appendChild(btn);
  });
}

const SHORTCUT_GROUPS = [
  {
    title: '전역',
    items: [
      { keys: 'Ctrl / ⌘ + K', desc: '통합 검색 열기' },
      { keys: 'Esc', desc: '모달 닫기 · 집중모드 종료 · 메모보드 연결 취소 · 에디터 팝업 닫기' },
    ],
  },
  {
    title: '원고 에디터',
    items: [
      { keys: 'Ctrl / ⌘ + B', desc: '굵게 (브라우저 기본 제공 — contenteditable 표준 동작)' },
      { keys: 'Ctrl / ⌘ + I', desc: '기울임 (브라우저 기본 제공)' },
      { keys: 'Ctrl / ⌘ + U', desc: '밑줄 (브라우저 기본 제공)' },
    ],
  },
  {
    title: '메모 인박스',
    items: [{ keys: 'Ctrl / ⌘ + Enter', desc: '작성 중인 메모 추가' }],
  },
];

function renderShortcutsTab(container) {
  container.innerHTML = '';
  SHORTCUT_GROUPS.forEach((group) => {
    const section = document.createElement('div');
    section.className = 'settings-section';
    section.innerHTML = `
      <h4>${group.title}</h4>
      <div class="shortcut-list">
        ${group.items.map((it) => `
          <div class="shortcut-row">
            <span class="shortcut-keys">${Utils.escapeHtml(it.keys)}</span>
            <span class="muted">${Utils.escapeHtml(it.desc)}</span>
          </div>
        `).join('')}
      </div>
    `;
    container.appendChild(section);
  });
}

async function renderTagsTab(container, workId) {
  container.innerHTML = `
    <div class="settings-section">
      <h4>관계 해시태그 <span class="muted">(캐릭터 관계에서 선택할 태그를 관리합니다)</span></h4>
      <div id="tagList" class="tag-manage-list"></div>
      <button class="btn btn--ghost btn--sm btn--block" id="addTagBtn" style="margin-top:8px;">+ 해시태그 추가</button>
    </div>
  `;

  async function refresh() {
    const tags = await Models.getRelationshipTags(workId);
    const listEl = container.querySelector('#tagList');
    listEl.innerHTML = '';
    if (!tags.length) {
      listEl.innerHTML = `<p class="muted">아직 해시태그가 없습니다.</p>`;
      return;
    }
    tags.forEach((t) => {
      const row = document.createElement('div');
      row.className = 'tag-manage-row';
      row.innerHTML = `
        <input type="color" class="tag-color-input" value="${t.color}">
        <input type="text" class="input tag-label-input" value="${Utils.escapeHtml(t.label)}">
        <button class="icon-btn btn--danger-text" title="삭제" aria-label="${Utils.escapeHtml(t.label)} 태그 삭제">✕</button>
      `;
      row.querySelector('.tag-color-input').addEventListener('change', async (e) => {
        await Models.updateRelationshipTag(t.id, { color: e.target.value });
      });
      row.querySelector('.tag-label-input').addEventListener('change', async (e) => {
        await Models.updateRelationshipTag(t.id, { label: e.target.value.trim() || t.label });
      });
      row.querySelector('button').addEventListener('click', async () => {
        const ok = await UI.confirm(`"${t.label}" 해시태그를 삭제할까요? 사용 중인 관계에서도 함께 제거됩니다.`, {
          title: '해시태그 삭제',
          confirmLabel: '삭제',
          danger: true,
        });
        if (!ok) return;
        await Models.deleteRelationshipTag(t.id);
        await refresh();
      });
      listEl.appendChild(row);
    });
  }

  container.querySelector('#addTagBtn').addEventListener('click', async () => {
    const color = GROUP_COLORS[Math.floor(Math.random() * GROUP_COLORS.length)];
    await Models.createRelationshipTag(workId, { label: '새 태그', color });
    await refresh();
  });

  await refresh();
}
