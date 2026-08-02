const Views = {};

const WORK_COLORS = ['#8b7bff', '#5aa9ff', '#4fd1c5', '#ff9a62', '#f2c94c', '#ff6b9a', '#6bcf7f'];
const LENGTH_OPTIONS = [
  { value: 'long', desc: '여러 챕터로 이어지는 연재형 작품' },
  { value: 'medium', desc: '몇 개 챕터로 완결되는 중간 길이 작품' },
  { value: 'short', desc: '한두 챕터로 완결되는 짧은 작품' },
];

// Shared by the "새 작품 만들기" and "작품 정보 수정" modals.
Views.renderLengthRadioGroup = function (selectedValue) {
  return LENGTH_OPTIONS.map(
    (o) => `
      <label class="radio-chip${o.value === selectedValue ? ' radio-chip--selected' : ''}" data-value="${o.value}">
        <input type="radio" name="length" value="${o.value}" ${o.value === selectedValue ? 'checked' : ''}>
        <strong>${Models.LENGTH_LABELS[o.value]}</strong>
        <span>${o.desc}</span>
      </label>
    `
  ).join('');
};

Views.bindLengthRadioGroup = function (wrap) {
  wrap.querySelectorAll('.radio-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      wrap.querySelectorAll('.radio-chip').forEach((c) => c.classList.remove('radio-chip--selected'));
      chip.classList.add('radio-chip--selected');
      chip.querySelector('input').checked = true;
    });
  });
};

const FORMAT_OPTIONS = [
  { value: 'book', desc: '장편/중편/단편 분량 구분을 쓰는 완결형 원고' },
  { value: 'webnovel', desc: '챕터마다 연재 여부·연재일을 기록하는 연재형 작품' },
];

// Shared "작품 형식" (단행본/웹소설) chip group — mirrors renderLengthRadioGroup.
Views.renderFormatRadioGroup = function (selectedValue) {
  return FORMAT_OPTIONS.map(
    (o) => `
      <label class="radio-chip${o.value === selectedValue ? ' radio-chip--selected' : ''}" data-value="${o.value}">
        <input type="radio" name="format" value="${o.value}" ${o.value === selectedValue ? 'checked' : ''}>
        <strong>${Models.FORMAT_LABELS[o.value]}</strong>
        <span>${o.desc}</span>
      </label>
    `
  ).join('');
};

Views.bindFormatRadioGroup = function (wrap, onChange) {
  wrap.querySelectorAll('.radio-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      wrap.querySelectorAll('.radio-chip').forEach((c) => c.classList.remove('radio-chip--selected'));
      chip.classList.add('radio-chip--selected');
      chip.querySelector('input').checked = true;
      if (onChange) onChange(chip.dataset.value);
    });
  });
};

Views.renderGenreSelect = function (selectedValue) {
  const options = [`<option value=""${selectedValue ? '' : ' selected'}>장르 없음</option>`]
    .concat(Object.entries(Models.GENRE_TEMPLATES).map(([key, g]) => `<option value="${key}" ${key === selectedValue ? 'selected' : ''}>${g.label}</option>`));
  return `<select class="input" id="workGenreSelect">${options.join('')}</select>`;
};

Views.createWorkFlow = async function () {
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div class="form-field">
      <label>작품 제목</label>
      <input type="text" class="input" id="newWorkTitle" placeholder="예: 붉은 달의 기사">
    </div>
    <div class="form-field">
      <label>한 줄 소개 (선택)</label>
      <textarea class="textarea" id="newWorkDesc" rows="3" placeholder="이 작품을 한두 문장으로 설명해보세요"></textarea>
    </div>
    <div class="form-field">
      <label>작품 형식</label>
      <div class="radio-group" id="formatGroup">${Views.renderFormatRadioGroup('book')}</div>
    </div>
    <div class="form-field" id="lengthField">
      <label>작품 유형 <span class="muted">(단행본 분량 기준)</span></label>
      <div class="radio-group" id="lengthGroup">${Views.renderLengthRadioGroup('long')}</div>
    </div>
    <div class="form-field">
      <label>장르 (선택)</label>
      ${Views.renderGenreSelect(null)}
    </div>
    <div class="form-field" id="genreTemplateField" hidden>
      <label class="checkbox-field"><input type="checkbox" id="genreTemplateCheck" checked> 장르에 맞는 시작용 설정 노트 만들기</label>
    </div>
    <div class="form-field">
      <label>색상</label>
      <div class="color-swatches" id="colorSwatches"></div>
    </div>
  `;
  let selectedColor = WORK_COLORS[0];
  const swatchWrap = wrap.querySelector('#colorSwatches');
  WORK_COLORS.forEach((c) => {
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

  Views.bindLengthRadioGroup(wrap);
  Views.bindFormatRadioGroup(wrap, (format) => {
    wrap.querySelector('#lengthField').hidden = format === 'webnovel';
  });
  wrap.querySelector('#workGenreSelect').addEventListener('change', (e) => {
    wrap.querySelector('#genreTemplateField').hidden = !e.target.value;
  });

  const { close } = UI.openModal({
    title: '새 작품 만들기',
    bodyEl: wrap,
    actions: [
      { label: '취소', onClick: () => close() },
      {
        label: '만들기',
        primary: true,
        onClick: async () => {
          const title = wrap.querySelector('#newWorkTitle').value.trim();
          const description = wrap.querySelector('#newWorkDesc').value.trim();
          const length = wrap.querySelector('input[name="length"]:checked').value;
          const format = wrap.querySelector('input[name="format"]:checked').value;
          const genre = wrap.querySelector('#workGenreSelect').value || null;
          const applyTemplate = wrap.querySelector('#genreTemplateCheck').checked;
          const work = await Models.createWork({ title, description, color: selectedColor, length, format, genre });
          if (genre && applyTemplate) await Models.applyGenreTemplate(work.id, genre);
          close();
          await App.refreshWorkSwitcher();
          Router.go(`#/work/${work.id}/dashboard`);
        },
      },
    ],
  });
  wrap.querySelector('#newWorkTitle').focus();
};

Views.home = async function () {
  const content = document.getElementById('content');
  const works = await DB.getAll('works');
  works.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

  content.innerHTML = `
    <div class="view view--home">
      <header class="view__header">
        <div>
          <h1>내 작품들</h1>
          <p class="muted">원고, 캐릭터, 설정, 메모를 한 곳에서 관리하세요.</p>
        </div>
        <div class="home-header-actions">
          <button class="btn btn--ghost btn--sm" id="homeHelpBtn" title="둘러보기 다시 보기">❓</button>
          <button class="btn btn--ghost btn--sm" id="homeSearchBtn" title="통합 검색">🔍</button>
          <button class="btn btn--ghost btn--sm" id="homeTimerBtn" title="타이머">⏱</button>
          <button class="btn btn--ghost btn--sm" id="homeSettingsBtn" title="설정">⚙</button>
          <button class="btn btn--pal-work" id="newWorkBtn">+ 새 작품</button>
        </div>
      </header>

      ${
        works.length
          ? `<div class="home-sort-chips" id="homeSortChips">
              <button class="chip" data-sort="created">추가순</button>
              <button class="chip" data-sort="updated">업데이트순</button>
              <button class="chip" data-sort="alpha">가나다순</button>
            </div>
            <div class="work-grid" id="workGrid"></div>`
          : `<div class="empty-state">
              <div class="empty-state__icon">📚</div>
              <h3>아직 작품이 없어요</h3>
              <p class="muted">첫 작품을 만들고 챕터와 장면을 구성해보세요.</p>
              <button class="btn btn--pal-work" id="newWorkBtnEmpty">+ 새 작품 만들기</button>
            </div>`
      }

      ${
        works.length
          ? `<section class="home-calendar">
              <div class="home-section-head">
                <div>
                  <h2>📅 전체 일정</h2>
                  <p class="muted">모든 작품의 일정·챕터 마감·완결 목표를 한 달력에서 확인하세요.</p>
                </div>
                <button class="btn btn--primary btn--sm" id="homeAddScheduleBtn">+ 일정 추가</button>
              </div>
              <div class="home-calendar__legend" id="homeCalendarLegend"></div>
              <div id="homeCalendarArea"></div>
            </section>`
          : ''
      }

      <section class="home-research">
        <div class="home-section-head">
          <div>
            <h2>📎 통합 자료 수집</h2>
            <p class="muted">특정 작품에 속하지 않는 공용 취재 자료·참고 링크를 모아두세요.</p>
          </div>
          <button class="btn btn--ghost btn--sm" id="homeAddResearchBtn">+ 자료 추가</button>
        </div>
        <div id="homeResearchList" class="memo-list"></div>
      </section>

      <section class="home-inbox">
        <h2>📥 전체 메모</h2>
        <div id="homeMemoList" class="memo-list"></div>
      </section>
    </div>
  `;

  document.getElementById('newWorkBtn').addEventListener('click', Views.createWorkFlow);
  const emptyBtn = document.getElementById('newWorkBtnEmpty');
  if (emptyBtn) emptyBtn.addEventListener('click', Views.createWorkFlow);

  // The sidebar is hidden on this landing page (see App.onNavigate), so offer the
  // same search/timer/settings entry points inline here instead.
  document.getElementById('homeHelpBtn').addEventListener('click', () => Onboarding.show());
  document.getElementById('homeSearchBtn').addEventListener('click', () => Router.go('#/search'));
  document.getElementById('homeTimerBtn').addEventListener('click', (e) => Timer.openPopover(e.currentTarget));
  document.getElementById('homeSettingsBtn').addEventListener('click', () => Views.openSettings(null));

  // 통합 자료 수집 — research posts not tied to any single work (Models.SHARED_RESEARCH_ID),
  // shown regardless of whether any work exists yet, mirroring the 전체 메모 section below.
  async function renderHomeResearch() {
    const listEl = document.getElementById('homeResearchList');
    const posts = await Models.getResearchPostsForWork(Models.SHARED_RESEARCH_ID);
    listEl.innerHTML = '';
    if (!posts.length) {
      listEl.innerHTML = `<p class="muted">아직 등록된 공용 자료가 없습니다. 특정 작품에 속하지 않는 자료를 여기에 모아보세요.</p>`;
      return;
    }
    posts.forEach((p) => {
      const item = document.createElement('div');
      item.className = 'memo-card';
      item.innerHTML = `
        <p><strong>${Utils.escapeHtml(p.title)}</strong></p>
        <p>${Utils.escapeHtml(Utils.truncate(Utils.stripHtml(p.content), 100)) || '<span class="muted">(내용 없음)</span>'}</p>
        <div class="memo-card__meta">
          <span>공용 자료</span>
          <span>${Utils.formatDate(p.updatedAt)}</span>
        </div>
      `;
      item.addEventListener('click', () => openHomeResearchModal(p));
      listEl.appendChild(item);
    });
  }

  function openHomeResearchModal(existing) {
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="form-field">
        <label>제목</label>
        <input type="text" class="input" id="hResTitle" value="${Utils.escapeHtml(existing?.title || '')}" placeholder="예: OO 시대 배경 자료">
      </div>
      <div class="form-field">
        <label>내용</label>
        <textarea class="textarea" id="hResContent" rows="6" placeholder="취재 내용, 참고 링크, 메모를 자유롭게 적어보세요...">${Utils.escapeHtml(existing?.content || '')}</textarea>
      </div>
    `;
    const actions = [
      { label: '취소', onClick: () => close() },
      {
        label: existing ? '저장' : '추가', primary: true,
        onClick: async () => {
          const data = {
            title: wrap.querySelector('#hResTitle').value.trim() || '제목 없는 자료',
            content: wrap.querySelector('#hResContent').value,
          };
          if (existing) await Models.updateResearchPost(existing.id, data);
          else await Models.createResearchPost(Models.SHARED_RESEARCH_ID, data);
          close();
          await renderHomeResearch();
        },
      },
    ];
    if (existing) {
      actions.splice(1, 0, {
        label: '삭제', danger: true,
        onClick: async () => {
          const ok = await UI.confirm(`"${existing.title}" 자료를 삭제할까요?`, { title: '자료 삭제', confirmLabel: '삭제', danger: true });
          if (!ok) return;
          await Models.deleteResearchPost(existing.id);
          close();
          await renderHomeResearch();
        },
      });
    }
    const { close } = UI.openModal({ title: existing ? '자료 수정' : '자료 추가', bodyEl: wrap, actions });
  }

  document.getElementById('homeAddResearchBtn').addEventListener('click', () => openHomeResearchModal(null));
  await renderHomeResearch();

  if (works.length) {
    const grid = document.getElementById('workGrid');

    // Fetched once up front (not per sort-change) so switching the sort chip is an
    // instant client-side re-render instead of re-querying IndexedDB for every card.
    const cardDataByWork = {};
    await Promise.all(works.map(async (w) => {
      const [stats, goal, recent, relData, memos, research] = await Promise.all([
        Models.getWorkStats(w.id),
        Models.getGoalSummary(w.id),
        Models.getRecentActivity(w.id, 6), // over-fetched, then split into 최근 작업 vs 메모 blocks below
        Models.getRelationshipGraphData(w.id),
        DB.getAllByIndex('memos', 'workId', w.id),
        Models.getResearchPostsForWork(w.id),
      ]);
      const activeMemos = memos.filter((m) => !m.archived).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
      cardDataByWork[w.id] = { stats, goal, recent: recent.filter((r) => r.type !== 'memo'), memos: activeMemos, relData, research };
    }));

    const SORT_KEY = 'sw-home-sort';
    function getSortMode() {
      const saved = localStorage.getItem(SORT_KEY);
      return ['created', 'updated', 'alpha'].includes(saved) ? saved : 'updated';
    }
    function sortedWorks() {
      const mode = getSortMode();
      const list = [...works];
      if (mode === 'created') list.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      else if (mode === 'alpha') list.sort((a, b) => a.title.localeCompare(b.title, 'ko'));
      else list.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
      return list;
    }

    function renderGrid() {
      grid.innerHTML = '';
      sortedWorks().forEach((w) => {
        const { stats, goal, recent, memos, relData, research } = cardDataByWork[w.id];
        const todoCount = goal.upcoming.filter((i) => !i.completed).length;
        const connectionCount = stats.characterCount + stats.settingCount + stats.memoCount;
        const progressPct = goal.totalProgress !== null ? Math.round(goal.totalProgress * 100) : null;
        const nextUpcoming = goal.upcoming.find((i) => !i.completed && i.date >= Utils.todayStr());
        const showMiniGraph = relData.characters.length >= 2 && relData.edges.length >= 1;

        // 🕸️ 연결망 / 📌 메모 / 📝 최근 작업 — three always-present blocks (each with its
        // own empty state) rather than the single-line "show if present" rows this
        // card used to have, so every card reads as a consistent mini-dashboard.
        const graphBlockHtml = showMiniGraph
          ? `<div class="work-card__mini-graph"><canvas></canvas></div>`
          : `<p class="muted work-card__block-empty">${relData.characters.length < 2 ? '캐릭터가 아직 부족해요' : '등록된 관계가 없어요'}</p>`;

        const memoBlockHtml = memos.length
          ? memos.slice(0, 2).map((m) => `<div class="work-card__memo-item">${Utils.escapeHtml(Utils.truncate(m.content, 50)) || '<span class="muted">(빈 메모)</span>'}</div>`).join('')
          : `<p class="muted work-card__block-empty">메모가 없어요</p>`;

        const recentBlockHtml = recent.length
          ? recent.slice(0, 2).map((r) => {
              const palClass = `text-pal-${Graph.ENTITY_PAL[r.type]}`.replace('text-pal-accent', 'text-accent');
              return `<div class="work-card__recent"><span class="${palClass}">${UI.icon(r.type)}</span><span class="work-card__recent-title">${Utils.escapeHtml(r.title)}</span><span class="muted">${Utils.formatDate(r.updatedAt)}</span></div>`;
            }).join('')
          : `<p class="muted work-card__block-empty">활동이 없어요</p>`;

        const researchBlockHtml = research.length
          ? research.slice(0, 2).map((p) => `<div class="work-card__memo-item">${Utils.escapeHtml(p.title)}</div>`).join('')
          : `<p class="muted work-card__block-empty">자료가 없어요</p>`;

        const card = document.createElement('div');
        card.className = 'work-card work-card--rich';
        card.style.setProperty('--work-color', w.color);
        card.innerHTML = `
          <div class="work-card__color" style="background:${w.color}"></div>
          <div class="work-card__body">
            <div class="work-card__info">
              <h3>${w.avatarDataUrl ? `<img class="work-card__avatar" src="${w.avatarDataUrl}" alt="">` : ''}${Utils.escapeHtml(w.title)}<span class="length-badge">${w.format === 'webnovel' ? '📡 웹소설' : Models.LENGTH_LABELS[w.length] || '장편'}</span>${w.genre && Models.GENRE_TEMPLATES[w.genre] ? `<span class="length-badge length-badge--genre">${Models.GENRE_TEMPLATES[w.genre].label}</span>` : ''}</h3>
              ${w.penName ? `<p class="muted work-card__pen-name">✒️ ${Utils.escapeHtml(w.penName)}</p>` : ''}
              <p class="muted">${Utils.escapeHtml(Utils.truncate(w.description, 70) || '소개가 없습니다')}</p>
              <div class="work-card__progress">
                ${
                  progressPct !== null
                    ? `<div class="progress-bar"><div class="progress-bar__fill" style="width:${progressPct}%;background:${w.color}"></div></div><span class="work-card__progress-num">${progressPct}%</span>`
                    : `<span class="muted work-card__no-goal">목표 미설정</span>`
                }
              </div>
              <div class="work-card__chips">
                <span class="work-card__chip text-pal-2">📂 ${stats.chapterCount}</span>
                <span class="work-card__chip text-pal-3">📝 ${stats.sceneCount}</span>
                <span class="work-card__chip text-pal-4">🧑 ${stats.characterCount}</span>
                <span class="work-card__chip text-pal-5">🗺️ ${stats.settingCount}</span>
                <span class="work-card__chip text-accent">📌 ${stats.memoCount}</span>
                <span class="work-card__chip text-pal-1">✅ ${todoCount}</span>
                <span class="work-card__chip muted">🕸️ ${connectionCount}개 연결</span>
              </div>
              ${
                nextUpcoming
                  ? `<div class="work-card__upcoming">📅 <span class="work-card__upcoming-title">${Utils.escapeHtml(nextUpcoming.title)}</span><span class="muted">${Utils.formatDday(nextUpcoming.date)}</span></div>`
                  : ''
              }
            </div>
            <div class="work-card__blocks">
              <div class="work-card__block">
                <div class="work-card__block-label">🕸️ 연결망</div>
                ${graphBlockHtml}
              </div>
              <div class="work-card__block">
                <div class="work-card__block-label">📌 메모</div>
                ${memoBlockHtml}
              </div>
              <div class="work-card__block">
                <div class="work-card__block-label">📝 최근 작업</div>
                ${recentBlockHtml}
              </div>
              <div class="work-card__block">
                <div class="work-card__block-label">📎 자료 수집</div>
                ${researchBlockHtml}
              </div>
            </div>
          </div>
        `;
        card.addEventListener('click', () => Router.go(`#/work/${w.id}/dashboard`));
        grid.appendChild(card);
        if (showMiniGraph) {
          Graph.drawStaticRelationshipPreview(card.querySelector('.work-card__mini-graph canvas'), relData.characters, relData.edges);
        }
      });
    }

    const sortChipsEl = document.getElementById('homeSortChips');
    sortChipsEl.querySelectorAll('.chip').forEach((chip) => {
      chip.classList.toggle('chip--active', chip.dataset.sort === getSortMode());
      chip.addEventListener('click', () => {
        localStorage.setItem(SORT_KEY, chip.dataset.sort);
        sortChipsEl.querySelectorAll('.chip').forEach((c) => c.classList.toggle('chip--active', c === chip));
        renderGrid();
      });
    });

    renderGrid();

    // Legend: one dot per work so the (work-colored) event chips in the calendar
    // below are identifiable without opening each one.
    const legendEl = document.getElementById('homeCalendarLegend');
    works.forEach((w) => {
      const dot = document.createElement('span');
      dot.className = 'home-calendar__legend-item';
      dot.innerHTML = `<i style="background:${w.color}"></i>${Utils.escapeHtml(w.title)}`;
      legendEl.appendChild(dot);
    });

    // Every schedule/chapter-deadline/work-target-date across every work, each
    // tagged with its own work's id/title/color — goal.upcoming was already fetched
    // per work above (cardDataByWork), so this is just a flatten, no extra queries.
    // Rebuilt (not just computed once) so adding a schedule from the home calendar's
    // own "+ 일정 추가" button can refresh it without a full page reload.
    function buildAggregateEvents() {
      return works.flatMap((w) =>
        cardDataByWork[w.id].goal.upcoming.map((item) => ({ ...item, workId: w.id, workTitle: w.title, workColor: w.color }))
      );
    }
    let aggregateEvents = buildAggregateEvents();
    const calendarArea = document.getElementById('homeCalendarArea');
    let calendarCursor = new Date();

    function openHomeScheduleModal(onSaved) {
      const wrap = document.createElement('div');
      wrap.innerHTML = `
        <div class="form-field">
          <label>작품</label>
          <select class="input" id="hSchWork">${works.map((w) => `<option value="${w.id}">${Utils.escapeHtml(w.title)}</option>`).join('')}</select>
        </div>
        <div class="form-field">
          <label>제목</label>
          <input type="text" class="input" id="hSchTitle" placeholder="예: 3화 초고 마감">
        </div>
        <div class="form-field">
          <label>날짜</label>
          <input type="date" class="input" id="hSchDate" value="${Utils.todayStr()}">
        </div>
        <div class="form-field">
          <label>종료일 (선택, 여러 날에 걸친 일정일 때)</label>
          <input type="date" class="input" id="hSchEndDate">
        </div>
        <div class="form-field">
          <label class="checkbox-field"><input type="checkbox" id="hSchAllDay" checked> 종일</label>
        </div>
        <div class="form-field" id="hSchTimeField" hidden>
          <label>시간</label>
          <div style="display:flex; gap:8px; align-items:center;">
            <input type="time" class="input" id="hSchStartTime">
            <span class="muted">~</span>
            <input type="time" class="input" id="hSchEndTime">
          </div>
        </div>
      `;
      wrap.querySelector('#hSchAllDay').addEventListener('change', (e) => {
        wrap.querySelector('#hSchTimeField').hidden = e.target.checked;
      });
      const { close } = UI.openModal({
        title: '일정 추가',
        bodyEl: wrap,
        actions: [
          { label: '취소', onClick: () => close() },
          {
            label: '추가', primary: true,
            onClick: async () => {
              const workId = wrap.querySelector('#hSchWork').value;
              const isAllDay = wrap.querySelector('#hSchAllDay').checked;
              await Models.createSchedule(workId, {
                title: wrap.querySelector('#hSchTitle').value.trim() || '새 일정',
                date: wrap.querySelector('#hSchDate').value || Utils.todayStr(),
                endDate: wrap.querySelector('#hSchEndDate').value || null,
                allDay: isAllDay,
                startTime: isAllDay ? null : wrap.querySelector('#hSchStartTime').value || null,
                endTime: isAllDay ? null : wrap.querySelector('#hSchEndTime').value || null,
              });
              close();
              await onSaved(workId);
            },
          },
        ],
      });
    }

    document.getElementById('homeAddScheduleBtn').addEventListener('click', () => {
      openHomeScheduleModal(async (workId) => {
        cardDataByWork[workId].goal = await Models.getGoalSummary(workId);
        aggregateEvents = buildAggregateEvents();
        renderGrid();
        renderHomeCalendar();
      });
    });

    function renderHomeCalendar() {
      calendarArea.innerHTML = `
        <div class="calendar">
          <div class="calendar__head">
            <button class="btn btn--ghost btn--sm" id="homeCalPrev">◀</button>
            <h3 id="homeCalMonthLabel"></h3>
            <button class="btn btn--ghost btn--sm" id="homeCalNext">▶</button>
          </div>
          <div class="calendar__grid" id="homeCalGrid"></div>
        </div>
      `;
      document.getElementById('homeCalPrev').addEventListener('click', () => {
        calendarCursor.setMonth(calendarCursor.getMonth() - 1);
        renderHomeCalendar();
      });
      document.getElementById('homeCalNext').addEventListener('click', () => {
        calendarCursor.setMonth(calendarCursor.getMonth() + 1);
        renderHomeCalendar();
      });

      const year = calendarCursor.getFullYear();
      const month = calendarCursor.getMonth();
      document.getElementById('homeCalMonthLabel').textContent = `${year}년 ${month + 1}월`;

      const grid = document.getElementById('homeCalGrid');
      grid.innerHTML = '';
      ['월', '화', '수', '목', '금', '토', '일'].forEach((d) => {
        const el = document.createElement('div');
        el.className = 'calendar__dow';
        el.textContent = d;
        grid.appendChild(el);
      });

      const firstDay = new Date(year, month, 1);
      const startOffset = (firstDay.getDay() + 6) % 7; // Monday = 0
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const todayKey = Utils.todayStr();

      const eventsByDate = {};
      aggregateEvents.forEach((item) => {
        // Multi-day schedules (item.endDate set) show on every day in the range —
        // capped at 31 iterations so a bad/huge endDate can't fan out indefinitely.
        const start = new Date(item.date);
        const end = item.endDate ? new Date(item.endDate) : start;
        for (let d = new Date(start), i = 0; d <= end && i < 31; d.setDate(d.getDate() + 1), i++) {
          const key = Utils.dateStr(d);
          eventsByDate[key] = eventsByDate[key] || [];
          eventsByDate[key].push(item);
        }
      });

      for (let i = 0; i < startOffset; i++) {
        const cell = document.createElement('div');
        cell.className = 'calendar__cell calendar__cell--muted';
        grid.appendChild(cell);
      }
      for (let d = 1; d <= daysInMonth; d++) {
        const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const cell = document.createElement('div');
        cell.className = 'calendar__cell' + (key === todayKey ? ' calendar__cell--today' : '');
        cell.innerHTML = `<div class="calendar__cell-date">${d}</div>`;
        (eventsByDate[key] || []).forEach((item) => {
          const ev = document.createElement('div');
          ev.className = 'calendar__event' + (item.completed ? ' calendar__event--done' : '');
          ev.style.background = `color-mix(in srgb, ${item.workColor} 18%, transparent)`;
          ev.style.color = item.workColor;
          ev.title = `${item.workTitle} · ${item.title}`;
          ev.textContent = item.title;
          ev.addEventListener('click', () => Router.go(`#/work/${item.workId}/goals`));
          cell.appendChild(ev);
        });
        grid.appendChild(cell);
      }
    }
    renderHomeCalendar();
  }

  const allMemos = await DB.getAll('memos');
  allMemos.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  const memoList = document.getElementById('homeMemoList');
  if (!allMemos.length) {
    memoList.innerHTML = `<p class="muted">아직 메모가 없습니다. 작품 안 메모 인박스에서 아이디어를 빠르게 기록해보세요.</p>`;
  } else {
    const workTitleCache = {};
    for (const m of allMemos.slice(0, 8)) {
      if (m.workId && !workTitleCache[m.workId]) {
        const w = await DB.get('works', m.workId);
        workTitleCache[m.workId] = w ? w.title : '';
      }
      const item = document.createElement('div');
      item.className = 'memo-card';
      item.innerHTML = `
        <p>${Utils.escapeHtml(Utils.truncate(m.content, 100)) || '<span class="muted">(빈 메모)</span>'}</p>
        <div class="memo-card__meta">
          <span>${m.workId ? Utils.escapeHtml(workTitleCache[m.workId]) : '미분류'}</span>
          <span>${Utils.formatDate(m.updatedAt)}</span>
        </div>
      `;
      if (m.workId) {
        item.addEventListener('click', () => Router.go(`#/work/${m.workId}/inbox?id=${m.id}`));
      }
      memoList.appendChild(item);
    }
  }
};
