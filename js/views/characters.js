const GROUP_COLORS = ['#8b7bff', '#5aa9ff', '#4fd1c5', '#ff9a62', '#f2c94c', '#ff6b9a', '#6bcf7f'];

Views.characters = async function (workId) {
  const content = document.getElementById('content');
  const qId = Router.query().get('id');
  const tab = Router.query().get('tab') || 'list';
  const groupParam = Router.query().get('group') || null;

  content.innerHTML = `
    <div class="view view--characters">
      <div class="char-view-tabs">
        <button class="chip ${tab === 'list' ? 'chip--active' : ''}" id="tabList">📋 목록</button>
        <button class="chip ${tab === 'map' ? 'chip--active' : ''}" id="tabMap">🕸️ 인물관계도</button>
      </div>
      <div id="charBody"></div>
    </div>
  `;

  document.getElementById('tabList').addEventListener('click', () => Router.go(`#/work/${workId}/characters?tab=list`));
  document.getElementById('tabMap').addEventListener('click', () => Router.go(`#/work/${workId}/characters?tab=map`));

  if (tab === 'map') {
    await renderRelationshipMap(workId);
  } else {
    await renderCharacterListView(workId, qId, groupParam);
  }
};

// Opens a create/edit modal for a character group (name, color, member checkboxes).
function openGroupModal(workId, group, allChars, onDone) {
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div class="form-field">
      <label>그룹 이름</label>
      <input type="text" class="input" id="gName" value="${Utils.escapeHtml(group ? group.name : '')}" placeholder="예: 왕실 기사단">
    </div>
    <div class="form-field">
      <label>색상</label>
      <div class="color-swatches" id="gColorSwatches"></div>
    </div>
    <div class="form-field">
      <label>구성원</label>
      <div class="group-member-list" id="gMembers"></div>
    </div>
  `;
  let selectedColor = (group && group.color) || GROUP_COLORS[0];
  const swatchWrap = wrap.querySelector('#gColorSwatches');
  GROUP_COLORS.forEach((c) => {
    const sw = document.createElement('div');
    sw.className = 'color-swatch' + (c === selectedColor ? ' color-swatch--selected' : '');
    sw.style.background = c;
    sw.addEventListener('click', () => {
      selectedColor = c;
      swatchWrap.querySelectorAll('.color-swatch').forEach((s) => s.classList.remove('color-swatch--selected'));
      sw.classList.add('color-swatch--selected');
    });
    swatchWrap.appendChild(sw);
  });

  const memberIds = new Set(group ? group.memberIds : []);
  const membersWrap = wrap.querySelector('#gMembers');
  if (!allChars.length) {
    membersWrap.innerHTML = `<p class="muted">캐릭터를 먼저 추가해보세요.</p>`;
  }
  allChars.forEach((c) => {
    const row = document.createElement('label');
    row.className = 'group-member-row';
    row.innerHTML = `<input type="checkbox" ${memberIds.has(c.id) ? 'checked' : ''}> <span>${Utils.escapeHtml(c.name)}</span>`;
    row.querySelector('input').addEventListener('change', (e) => {
      if (e.target.checked) memberIds.add(c.id);
      else memberIds.delete(c.id);
    });
    membersWrap.appendChild(row);
  });

  const actions = [
    { label: '취소', onClick: () => close() },
    {
      label: '저장',
      primary: true,
      onClick: async () => {
        const name = wrap.querySelector('#gName').value.trim() || '새 그룹';
        const payload = { name, color: selectedColor, memberIds: [...memberIds] };
        if (group) await Models.updateCharacterGroup(group.id, payload);
        else await Models.createCharacterGroup(workId, payload);
        close();
        onDone();
      },
    },
  ];
  if (group) {
    actions.unshift({
      label: '삭제',
      danger: true,
      onClick: async () => {
        const ok = await UI.confirm(`"${group.name}" 그룹을 삭제할까요? (구성원 캐릭터는 삭제되지 않습니다)`, { title: '그룹 삭제', confirmLabel: '삭제', danger: true });
        if (!ok) return;
        await Models.deleteCharacterGroup(group.id);
        close();
        onDone();
      },
    });
  }

  const { close } = UI.openModal({ title: group ? '그룹 편집' : '새 그룹 만들기', bodyEl: wrap, actions });
}

// Shared by the list-view detail pane and the relationship map's node panel, so
// relationships can be added from either place (the map is mouse/drag-only, so the
// list view is the keyboard-reachable path).
function openAddRelationshipModal(workId, fromChar, characters, tags, onDone) {
  const others = characters.filter((x) => x.id !== fromChar.id);
  if (!others.length) { UI.toast('다른 캐릭터가 먼저 필요합니다'); return; }
  if (!tags.length) { UI.toast('설정에서 관계 해시태그를 먼저 추가해주세요'); return; }
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div class="form-field">
      <label>대상 캐릭터</label>
      <select class="input" id="relTarget">${others.map((o) => `<option value="${o.id}">${Utils.escapeHtml(o.name)}</option>`).join('')}</select>
    </div>
    <div class="form-field">
      <label>관계 유형 <span class="muted">(해시태그를 여러 개 선택할 수 있어요)</span></label>
      <div class="hashtag-chip-row" id="relTagRow"></div>
    </div>
    <div class="form-field">
      <label>표시할 라벨 (선택)</label>
      <input type="text" class="input" id="relLabel" placeholder="예: 이복동생, 첫사랑">
    </div>
    <div class="form-field">
      <label>메모 (선택)</label>
      <textarea class="textarea" id="relNote" rows="3"></textarea>
    </div>
  `;
  const selectedTagIds = new Set();
  const tagRow = wrap.querySelector('#relTagRow');
  tags.forEach((t) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'hashtag-chip';
    chip.style.setProperty('--tag-color', t.color);
    chip.textContent = `#${t.label}`;
    chip.addEventListener('click', () => {
      if (selectedTagIds.has(t.id)) {
        selectedTagIds.delete(t.id);
        chip.classList.remove('hashtag-chip--selected');
      } else {
        selectedTagIds.add(t.id);
        chip.classList.add('hashtag-chip--selected');
      }
    });
    tagRow.appendChild(chip);
  });

  const { close } = UI.openModal({
    title: `${fromChar.name}의 관계 추가`,
    bodyEl: wrap,
    actions: [
      { label: '취소', onClick: () => close() },
      {
        label: '추가', primary: true,
        onClick: async () => {
          if (!selectedTagIds.size) { UI.toast('관계 해시태그를 하나 이상 선택해주세요', 'error'); return; }
          const targetId = wrap.querySelector('#relTarget').value;
          const label = wrap.querySelector('#relLabel').value.trim();
          const note = wrap.querySelector('#relNote').value.trim();
          await Models.addRelationship(fromChar.id, { targetId, tagIds: [...selectedTagIds], label, note });
          close();
          onDone();
        },
      },
    ],
  });
}

// Named uniquely (not just renderListView) because this project loads every view
// file as a classic <script> sharing one global scope — a same-named top-level
// function in another file (e.g. inbox.js, research.js) would silently overwrite
// this one, and whichever loaded last would win for every caller (see IMPROVEMENTS.md
// DEV-03; this is exactly the bug that broke the character list screen).
async function renderCharacterListView(workId, qId, initialGroupFilter) {
  const body = document.getElementById('charBody');
  body.innerHTML = `
    <div class="view--split view--split-inner">
      <div class="side-list" id="charList">
        <div class="side-list__header">
          <h2>🧑‍🤝‍🧑 캐릭터</h2>
          <button class="btn btn--ghost btn--pal-character btn--sm" id="addCharBtn">+ 추가</button>
        </div>
        <div class="group-chip-row" id="groupChipRow"></div>
        <div class="side-list__items" id="charItems"></div>
      </div>
      <div class="detail-pane" id="charDetail"></div>
    </div>
  `;

  // Kept in the URL (not just this closure) so it survives the full Views.characters
  // re-run that Router.go triggers on every character click (see the item click
  // handler in refresh() below) — otherwise the filter silently reset on every click.
  let groupFilter = initialGroupFilter || null;

  function syncGroupFilterUrl() {
    const q = new URLSearchParams(location.hash.split('?')[1] || '');
    if (groupFilter) q.set('group', groupFilter); else q.delete('group');
    history.replaceState(null, '', `#/work/${workId}/characters${q.toString() ? '?' + q.toString() : ''}`);
  }

  async function renderGroupBar() {
    const [groups, allChars] = await Promise.all([
      Models.getCharacterGroups(workId),
      DB.getAllByIndex('characters', 'workId', workId),
    ]);
    const row = document.getElementById('groupChipRow');
    row.innerHTML = '';
    groups.forEach((g) => {
      const chip = document.createElement('div');
      chip.className = 'group-chip' + (groupFilter === g.id ? ' group-chip--active' : '');
      chip.style.setProperty('--group-color', g.color);
      chip.innerHTML = `<i></i><span>${Utils.escapeHtml(g.name)}</span><button class="group-chip__edit" title="편집">✎</button>`;
      chip.querySelector('span').addEventListener('click', async () => {
        groupFilter = groupFilter === g.id ? null : g.id;
        syncGroupFilterUrl();
        await renderGroupBar();
        await refresh(currentSelectId);
      });
      chip.querySelector('.group-chip__edit').addEventListener('click', (e) => {
        e.stopPropagation();
        openGroupModal(workId, g, allChars, async () => {
          await renderGroupBar();
          await refresh(currentSelectId);
        });
      });
      row.appendChild(chip);
    });
    const addChip = document.createElement('div');
    addChip.className = 'group-chip group-chip--add';
    addChip.innerHTML = `<span>+ 그룹</span>`;
    addChip.addEventListener('click', () => {
      openGroupModal(workId, null, allChars, async () => {
        await renderGroupBar();
        await refresh(currentSelectId);
      });
    });
    row.appendChild(addChip);
    return groups;
  }

  let currentSelectId = qId;

  async function refresh(selectId) {
    currentSelectId = selectId;
    const groups = await Models.getCharacterGroups(workId);
    let chars = await DB.getAllByIndex('characters', 'workId', workId);
    chars.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    const groupsByChar = {};
    groups.forEach((g) => (g.memberIds || []).forEach((cid) => {
      groupsByChar[cid] = groupsByChar[cid] || [];
      groupsByChar[cid].push(g);
    }));
    const visibleChars = groupFilter ? chars.filter((c) => (groupsByChar[c.id] || []).some((g) => g.id === groupFilter)) : chars;
    const itemsEl = document.getElementById('charItems');
    itemsEl.innerHTML = '';
    if (!visibleChars.length) {
      itemsEl.innerHTML = `<p class="muted side-list__empty">${groupFilter ? '이 그룹에 캐릭터가 없습니다.' : '아직 캐릭터가 없습니다.'}</p>`;
    }
    visibleChars.forEach((c) => {
      const el = document.createElement('div');
      el.className = 'side-list__item' + (c.id === selectId ? ' side-list__item--active' : '');
      const dots = (groupsByChar[c.id] || []).map((g) => `<i class="group-mini-dot" style="background:${g.color}" title="${Utils.escapeHtml(g.name)}"></i>`).join('');
      el.innerHTML = `<span class="side-list__item-main"><strong>${Utils.escapeHtml(c.name)}</strong><span class="muted">${Utils.escapeHtml(c.role || '')}</span></span><span class="group-mini-dots">${dots}</span>`;
      el.addEventListener('click', () => {
        const q = new URLSearchParams({ id: c.id });
        if (groupFilter) q.set('group', groupFilter);
        Router.go(`#/work/${workId}/characters?${q.toString()}`);
      });
      itemsEl.appendChild(el);
    });
    return chars;
  }

  document.getElementById('addCharBtn').addEventListener('click', async () => {
    const c = await Models.createCharacter(workId);
    await refresh(c.id);
    renderDetail(c);
  });

  function renderEmpty() {
    document.getElementById('charDetail').innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">🧑</div>
        <h3>캐릭터를 선택하거나 추가해보세요</h3>
      </div>`;
  }

  async function renderDetail(c) {
    const detail = document.getElementById('charDetail');
    detail.innerHTML = `
      <div class="detail-form">
        <div class="detail-form__header">
          <input type="text" class="title-input" id="fName" value="${Utils.escapeHtml(c.name)}" placeholder="이름">
          <button class="btn btn--ghost btn--sm btn--danger-text" id="deleteBtn">삭제</button>
        </div>
        <div class="form-field">
          <label>역할 / 한줄소개</label>
          <input type="text" class="input" id="fRole" value="${Utils.escapeHtml(c.role || '')}" placeholder="예: 주인공, 라이벌, 조력자">
        </div>
        <div class="form-field">
          <label>외모</label>
          <textarea class="textarea" id="fAppearance" rows="3">${Utils.escapeHtml(c.appearance || '')}</textarea>
        </div>
        <div class="form-field">
          <label>성격</label>
          <textarea class="textarea" id="fPersonality" rows="3">${Utils.escapeHtml(c.personality || '')}</textarea>
        </div>
        <div class="form-field">
          <label>배경 이야기</label>
          <textarea class="textarea" id="fBackground" rows="4">${Utils.escapeHtml(c.background || '')}</textarea>
        </div>
        <div class="form-field">
          <label>메모 <span class="muted">([[이름]]으로 다른 캐릭터·설정·장면과 연결)</span></label>
          <textarea class="textarea" id="fNotes" rows="4">${Utils.escapeHtml(c.notes || '')}</textarea>
        </div>
        <div class="form-field">
          <label>인물관계 <span class="muted">(인물관계도 화면에서 그룹 색 등 시각적으로도 확인할 수 있어요)</span></label>
          <div id="relSummary" class="rel-summary"></div>
          <button class="btn btn--ghost btn--sm" id="addRelBtn" style="margin-top:8px;">+ 관계 추가</button>
        </div>
        <span class="save-indicator" id="saveIndicator" aria-live="polite">저장됨</span>
      </div>
    `;

    // A keyboard-reachable path to add/remove relationships that doesn't require the
    // mouse-only relationship map — the map remains available for visual browsing.
    async function renderRelSummary() {
      const relSummary = document.getElementById('relSummary');
      const fresh = await DB.get('characters', c.id);
      c.relationships = fresh ? fresh.relationships || [] : [];
      const [allChars, tags] = await Promise.all([
        DB.getAllByIndex('characters', 'workId', workId),
        Models.getRelationshipTags(workId),
      ]);
      const charById = Object.fromEntries(allChars.map((x) => [x.id, x]));
      const tagById = Object.fromEntries(tags.map((t) => [t.id, t]));
      relSummary.innerHTML = '';
      if (!c.relationships.length) {
        relSummary.innerHTML = `<p class="muted">아직 등록된 관계가 없습니다.</p>`;
      } else {
        c.relationships.forEach((r, idx) => {
          const relTags = Models.relationshipTagIds(r).map((id) => tagById[id]).filter(Boolean);
          const dotColor = relTags[0] ? relTags[0].color : '#9297a8';
          const tagLabel = relTags.map((t) => t.label).join(' · ');
          const row = document.createElement('div');
          row.className = 'rel-list-item';
          const targetName = charById[r.targetId] ? charById[r.targetId].name : '?';
          row.innerHTML = `
            <span class="rel-list-item__dot" style="background:${dotColor}"></span>
            <span class="rel-list-item__label">${Utils.escapeHtml(targetName)} · ${Utils.escapeHtml(r.label || tagLabel || '관계')}</span>
            <button class="icon-btn" aria-label="${Utils.escapeHtml(targetName)}와의 관계 삭제" title="삭제">✕</button>
          `;
          row.querySelector('button').addEventListener('click', async () => {
            await Models.removeRelationship(c.id, idx);
            await renderRelSummary();
          });
          relSummary.appendChild(row);
        });
      }
      document.getElementById('addRelBtn').onclick = async () => {
        openAddRelationshipModal(workId, c, allChars, tags, renderRelSummary);
      };
    }
    await renderRelSummary();

    const indicator = document.getElementById('saveIndicator');
    const fields = ['fName', 'fRole', 'fAppearance', 'fPersonality', 'fBackground', 'fNotes'];
    const keyMap = { fName: 'name', fRole: 'role', fAppearance: 'appearance', fPersonality: 'personality', fBackground: 'background', fNotes: 'notes' };

    const save = Utils.debounce(async () => {
      indicator.textContent = '저장 중...';
      const patch = {};
      fields.forEach((f) => (patch[keyMap[f]] = document.getElementById(f).value));
      await Models.updateCharacter(c.id, patch);
      indicator.textContent = '저장됨 · 방금';
      if (patch.name !== c.name) {
        c.name = patch.name;
        await refresh(c.id);
      }
    }, 600);

    fields.forEach((f) => {
      document.getElementById(f).addEventListener('input', () => { indicator.textContent = '입력 중...'; save(); });
    });

    document.getElementById('deleteBtn').addEventListener('click', async () => {
      const ok = await UI.confirm(`"${c.name}" 캐릭터를 삭제할까요?`, { title: '캐릭터 삭제', confirmLabel: '삭제', danger: true });
      if (!ok) return;
      await Models.deleteCharacter(c.id);
      UI.toast('삭제되었습니다');
      await refresh(null);
      Router.go(`#/work/${workId}/characters`);
    });

    ['fAppearance', 'fPersonality', 'fBackground', 'fNotes'].forEach((f) => {
      UI.attachWikiAutocomplete(document.getElementById(f), async () => {
        const b = await Models.getWorkBundle(workId);
        const titles = [];
        b.characters.forEach((x) => x.id !== c.id && titles.push(x.name));
        b.settingNotes.forEach((n) => titles.push(n.title));
        b.chapters.forEach((ch) => (b.scenesByChapter[ch.id] || []).forEach((s) => titles.push(s.title)));
        return titles;
      });
    });
  }

  await renderGroupBar();
  const chars = await refresh(qId);
  if (qId) {
    const c = chars.find((x) => x.id === qId) || (await DB.get('characters', qId));
    if (c) renderDetail(c);
    else renderEmpty();
  } else {
    renderEmpty();
  }
}

async function renderRelationshipMap(workId) {
  const body = document.getElementById('charBody');
  body.innerHTML = `
    <div class="rel-map-wrap">
      <canvas id="relMapCanvas" role="img" aria-label="캐릭터 간 관계도. 드래그·마우스 전용입니다. 관계를 추가·삭제하려면 '📋 목록' 탭에서 캐릭터를 선택한 뒤 '인물관계' 항목을 이용해주세요."></canvas>
      <div class="rel-legend" id="relLegend"></div>
      <p class="rel-hint">드래그로 인물 위치 이동 · 클릭으로 관계 관리</p>
    </div>
  `;

  const tags = await Models.getRelationshipTags(workId);
  const tagById = Object.fromEntries(tags.map((t) => [t.id, t]));
  const legend = document.getElementById('relLegend');
  tags.forEach((t) => {
    const span = document.createElement('span');
    span.innerHTML = `<i style="background:${t.color}"></i>${Utils.escapeHtml(t.label)}`;
    legend.appendChild(span);
  });

  async function load() {
    const { characters, edges, groupColorByChar } = await Models.getRelationshipGraphData(workId);
    return { characters, edges, groupColorByChar };
  }

  let mapHandle = null;

  async function refreshMap() {
    const { characters, edges, groupColorByChar } = await load();
    if (mapHandle) mapHandle.destroy();
    if (!characters.length) {
      body.querySelector('.rel-map-wrap').innerHTML = `<div class="empty-state"><div class="empty-state__icon">🧑‍🤝‍🧑</div><h3>캐릭터를 먼저 추가해보세요</h3><p class="muted">캐릭터 목록 탭에서 인물을 추가하면 여기서 관계도를 그릴 수 있어요.</p></div>`;
      return;
    }
    const canvas = document.getElementById('relMapCanvas');
    mapHandle = Graph.mountRelationshipMap(canvas, characters, edges, {
      onNodeClick: (charId) => openCharacterPanel(charId, characters),
      onPositionChange: async (charId, x, y) => {
        await Models.updateCharacter(charId, { relX: x, relY: y });
      },
      groupColorFor: (charId) => groupColorByChar[charId] || null,
    });
  }

  function openCharacterPanel(charId, characters) {
    document.querySelectorAll('.rel-edit-panel').forEach((el) => el.remove());
    const c = characters.find((x) => x.id === charId);
    if (!c) return;
    const panel = document.createElement('div');
    panel.className = 'rel-edit-panel';
    panel.innerHTML = `
      <h4>${Utils.escapeHtml(c.name)}</h4>
      <div id="relPanelList"></div>
      <button class="btn btn--ghost btn--sm btn--block" id="addRelBtn" style="margin-top:8px;">+ 관계 추가</button>
      <button class="btn btn--ghost btn--sm btn--block" id="closePanelBtn">닫기</button>
    `;
    document.querySelector('.rel-map-wrap').appendChild(panel);

    const listEl = panel.querySelector('#relPanelList');
    const charById = Object.fromEntries(characters.map((x) => [x.id, x]));
    if (!c.relationships || !c.relationships.length) {
      listEl.innerHTML = `<p class="muted" style="font-size:12px;">아직 관계가 없습니다.</p>`;
    } else {
      c.relationships.forEach((r, idx) => {
        const relTags = Models.relationshipTagIds(r).map((id) => tagById[id]).filter(Boolean);
        const dotColor = relTags[0] ? relTags[0].color : '#9297a8';
        const tagLabel = relTags.map((t) => t.label).join(' · ');
        const row = document.createElement('div');
        row.className = 'rel-list-item';
        row.innerHTML = `
          <span class="rel-list-item__dot" style="background:${dotColor}"></span>
          <span class="rel-list-item__label">${Utils.escapeHtml(charById[r.targetId] ? charById[r.targetId].name : '?')} · ${Utils.escapeHtml(r.label || tagLabel || '관계')}</span>
          <button class="icon-btn" data-idx="${idx}">✕</button>
        `;
        row.querySelector('button').addEventListener('click', async () => {
          await Models.removeRelationship(c.id, idx);
          panel.remove();
          await refreshMap();
        });
        listEl.appendChild(row);
      });
    }

    panel.querySelector('#closePanelBtn').addEventListener('click', () => panel.remove());
    panel.querySelector('#addRelBtn').addEventListener('click', () => openAddRelationshipModal(workId, c, characters, tags, async () => {
      panel.remove();
      await refreshMap();
    }));
  }

  await refreshMap();
}
