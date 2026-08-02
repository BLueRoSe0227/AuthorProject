const GROUP_COLORS = ['#8b7bff', '#5aa9ff', '#4fd1c5', '#ff9a62', '#f2c94c', '#ff6b9a', '#6bcf7f'];

Views.characters = async function (workId) {
  const content = document.getElementById('content');
  const qId = Router.query().get('id');
  const groupParam = Router.query().get('group') || null;

  // List and relationship map used to be separate tabs; now they're a single
  // 3-column split view (list | detail | map) rendered together by
  // renderCharacterSplitView below, so selecting/editing/dragging a character in
  // either place stays visible everywhere at once without a tab switch.
  content.innerHTML = `
    <div class="view view--characters">
      <div class="char-split">
        <div class="side-list" id="charList">
          <div class="side-list__header">
            <h2>🧑‍🤝‍🧑 캐릭터</h2>
            <button class="btn btn--ghost btn--pal-character btn--sm" id="addCharBtn">+ 추가</button>
          </div>
          <div class="group-chip-row" id="groupChipRow"></div>
          <div class="side-list__items" id="charItems"></div>
        </div>
        <div class="detail-pane" id="charDetail"></div>
        <div class="rel-map-wrap" id="relMapWrap">
          <canvas id="relMapCanvas" role="img" aria-label="캐릭터 간 관계도. 드래그·마우스 전용입니다. 더블클릭하면 왼쪽 목록에서 해당 캐릭터가 선택됩니다."></canvas>
          <div class="rel-legend" id="relLegend"></div>
          <p class="rel-hint">드래그로 인물 위치 이동 · 더블클릭으로 캐릭터 선택</p>
        </div>
      </div>
    </div>
  `;

  await renderCharacterSplitView(workId, qId, groupParam);
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
      <div class="color-swatches" id="gColorSwatches">${Views.renderColorSwatches(GROUP_COLORS, (group && group.color) || GROUP_COLORS[0])}</div>
    </div>
    <div class="form-field">
      <label>구성원</label>
      <div class="group-member-list" id="gMembers"></div>
    </div>
  `;
  let selectedColor = (group && group.color) || GROUP_COLORS[0];
  Views.bindColorSwatches(wrap.querySelector('#gColorSwatches'), (c) => { selectedColor = c; });

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
//
// List and relationship map used to be separate tabs, each fully re-rendering
// #charBody; now they're permanently side by side (see Views.characters' markup),
// so this single function owns both instead of two independent ones. Character
// selection deliberately does NOT go through Router.go here (unlike most other
// list views in this app) — a full route re-run would remount the map too,
// resetting its pan/zoom on every single character click, which felt broken once
// the map became permanently visible instead of a separate tab. selectCharacter()
// below updates the list highlight + detail pane in place and only syncs the URL
// via history.replaceState (no hashchange, no remount).
async function renderCharacterSplitView(workId, qId, initialGroupFilter) {
  let groupFilter = initialGroupFilter || null;
  let currentSelectId = qId;

  function syncUrl() {
    const q = new URLSearchParams();
    if (currentSelectId) q.set('id', currentSelectId);
    if (groupFilter) q.set('group', groupFilter);
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
        syncUrl();
        await renderGroupBar();
        await refresh(currentSelectId);
      });
      chip.querySelector('.group-chip__edit').addEventListener('click', (e) => {
        e.stopPropagation();
        openGroupModal(workId, g, allChars, async () => {
          await renderGroupBar();
          await refresh(currentSelectId);
          await refreshMap(); // group color/membership changes affect node tint on the map
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
        await refreshMap();
      });
    });
    row.appendChild(addChip);
    return groups;
  }

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
      el.addEventListener('click', () => selectCharacter(c.id));
      itemsEl.appendChild(el);
    });
    return chars;
  }

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
          <label>인물관계 <span class="muted">(오른쪽 인물관계도에서 그룹 색 등 시각적으로도 확인할 수 있어요)</span></label>
          <div id="relSummary" class="rel-summary"></div>
          <button class="btn btn--ghost btn--sm" id="addRelBtn" style="margin-top:8px;">+ 관계 추가</button>
        </div>
        <span class="save-indicator" id="saveIndicator" aria-live="polite">저장됨</span>
      </div>
    `;

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
            await refreshMap(); // an edge disappeared
          });
          relSummary.appendChild(row);
        });
      }
      document.getElementById('addRelBtn').onclick = async () => {
        openAddRelationshipModal(workId, c, allChars, tags, async () => {
          await renderRelSummary();
          await refreshMap(); // a new edge appeared
        });
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
        await refreshMap(); // node label changed
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
      await selectCharacter(null);
      await refreshMap();
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

  async function selectCharacter(id) {
    const chars = await refresh(id); // sets currentSelectId, which syncUrl() below reads
    syncUrl();
    if (!id) { renderEmpty(); return; }
    const c = chars.find((x) => x.id === id) || (await DB.get('characters', id));
    if (c) await renderDetail(c);
    else renderEmpty();
  }

  document.getElementById('addCharBtn').addEventListener('click', async () => {
    const c = await Models.createCharacter(workId);
    currentSelectId = c.id;
    syncUrl();
    await refresh(c.id);
    await renderDetail(c);
    await refreshMap();
  });

  // ---- Relationship map (right pane) ----
  const relMapWrap = document.getElementById('relMapWrap');
  const tags = await Models.getRelationshipTags(workId);
  const legend = document.getElementById('relLegend');
  tags.forEach((t) => {
    const span = document.createElement('span');
    span.innerHTML = `<i style="background:${t.color}"></i>${Utils.escapeHtml(t.label)}`;
    legend.appendChild(span);
  });

  let mapHandle = null;
  // Covers navigating away from 캐릭터 entirely — refreshMap() below already
  // destroys the previous handle before every in-view remount.
  Router.onCleanup(() => { if (mapHandle) mapHandle.destroy(); });

  async function refreshMap() {
    const { characters, edges, groupColorByChar } = await Models.getRelationshipGraphData(workId);
    if (mapHandle) { mapHandle.destroy(); mapHandle = null; }
    if (!characters.length) {
      relMapWrap.innerHTML = `<div class="empty-state"><div class="empty-state__icon">🧑‍🤝‍🧑</div><h3>캐릭터를 먼저 추가해보세요</h3><p class="muted">왼쪽에서 캐릭터를 추가하면 여기서 관계도를 그릴 수 있어요.</p></div>`;
      return;
    }
    if (!relMapWrap.querySelector('#relMapCanvas')) {
      // Rebuild the canvas+legend+hint markup if the empty-state replaced it earlier.
      relMapWrap.innerHTML = `
        <canvas id="relMapCanvas" role="img" aria-label="캐릭터 간 관계도. 드래그·마우스 전용입니다. 더블클릭하면 왼쪽 목록에서 해당 캐릭터가 선택됩니다."></canvas>
        <div class="rel-legend" id="relLegend"></div>
        <p class="rel-hint">드래그로 인물 위치 이동 · 더블클릭으로 캐릭터 선택</p>
      `;
      const legendEl = relMapWrap.querySelector('#relLegend');
      tags.forEach((t) => {
        const span = document.createElement('span');
        span.innerHTML = `<i style="background:${t.color}"></i>${Utils.escapeHtml(t.label)}`;
        legendEl.appendChild(span);
      });
    }
    const canvas = relMapWrap.querySelector('#relMapCanvas');
    mapHandle = Graph.mountRelationshipMap(canvas, characters, edges, {
      onNodeClick: (charId) => selectCharacter(charId),
      onPositionChange: async (charId, x, y) => {
        await Models.updateCharacter(charId, { relX: x, relY: y });
      },
      groupColorFor: (charId) => groupColorByChar[charId] || null,
    });
  }

  await renderGroupBar();
  await refreshMap();
  await selectCharacter(qId || null);
}
