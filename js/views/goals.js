Views.goals = async function (workId) {
  const content = document.getElementById('content');
  const bundle = await Models.getWorkBundle(workId);
  if (!bundle.work) { Router.go('#/'); return; }

  content.innerHTML = `
    <div class="view view--goals">
      <header class="view__header">
        <div>
          <h1>🎯 목표 &amp; 일정</h1>
          <p class="muted">집필 습관과 마감을 한눈에 관리하세요.</p>
        </div>
      </header>

      <div class="goals-grid" id="goalsGrid"></div>

      <div class="goals-section-title">
        <span>📂 챕터별 목표</span>
      </div>
      <div class="chapter-goal-list" id="chapterGoalList"></div>

      <div class="schedule-toolbar">
        <div class="goals-section-title" style="margin:0;">📅 일정</div>
        <div style="display:flex; gap:8px; align-items:center;">
          <div class="schedule-view-tabs">
            <button class="chip chip--active" id="viewCalendarBtn">달력형</button>
            <button class="chip" id="viewCardBtn">카드형</button>
          </div>
          <button class="btn btn--primary btn--sm" id="addScheduleBtn">+ 일정 추가</button>
        </div>
      </div>
      <div id="scheduleArea"></div>
    </div>
  `;

  await renderGoalsGrid();
  await renderChapterGoals();

  let scheduleMode = 'calendar';
  let calendarCursor = new Date();

  document.getElementById('viewCalendarBtn').addEventListener('click', () => {
    scheduleMode = 'calendar';
    document.getElementById('viewCalendarBtn').classList.add('chip--active');
    document.getElementById('viewCardBtn').classList.remove('chip--active');
    renderSchedule();
  });
  document.getElementById('viewCardBtn').addEventListener('click', () => {
    scheduleMode = 'card';
    document.getElementById('viewCardBtn').classList.add('chip--active');
    document.getElementById('viewCalendarBtn').classList.remove('chip--active');
    renderSchedule();
  });
  document.getElementById('addScheduleBtn').addEventListener('click', () => openScheduleModal());

  async function renderGoalsGrid() {
    const summary = await Models.getGoalSummary(workId);
    const grid = document.getElementById('goalsGrid');
    grid.innerHTML = '';

    grid.appendChild(goalCard({
      title: '오늘의 목표',
      value: summary.todayChars,
      target: summary.work.dailyGoalChars,
      progress: summary.todayProgress,
      palClass: 'text-accent',
      fillClass: '',
      extra: summary.work.dailyGoalChars ? `<div class="goal-card__streak">🔥 ${summary.streak}일 연속 달성</div>` : '',
      onEdit: () => openGoalEditModal('daily', summary.work),
    }));

    grid.appendChild(goalCard({
      title: '이번 주 목표',
      value: summary.weekChars,
      target: summary.work.weeklyGoalChars,
      progress: summary.weekProgress,
      palClass: 'text-pal-2',
      fillClass: 'progress-bar__fill--pal-2',
      onEdit: () => openGoalEditModal('weekly', summary.work),
    }));

    grid.appendChild(goalCard({
      title: '작품 전체 목표',
      value: summary.totalChars,
      target: summary.work.targetTotalChars,
      progress: summary.totalProgress,
      palClass: 'text-pal-1',
      fillClass: 'progress-bar__fill--pal-1',
      extra: summary.work.targetDate ? `<div class="goal-card__streak">📌 완결 목표일 ${summary.work.targetDate} (${Utils.formatDday(summary.work.targetDate)})</div>` : '',
      onEdit: () => openGoalEditModal('total', summary.work),
    }));
  }

  function goalCard({ title, value, target, progress, extra = '', palClass = 'text-accent', fillClass = '', onEdit }) {
    const card = document.createElement('div');
    card.className = 'goal-card';
    const pct = progress === null ? 0 : Math.round(progress * 100);
    card.innerHTML = `
      <div class="goal-card__head">
        <h3>${title}</h3>
        <button class="goal-card__edit">✎ 설정</button>
      </div>
      <div class="goal-card__numbers">
        <strong class="${palClass}">${value.toLocaleString()}</strong>
        <span>/ ${target ? target.toLocaleString() + '자' : '목표 미설정'}</span>
      </div>
      <div class="progress-bar"><div class="progress-bar__fill${pct >= 100 ? ' progress-bar__fill--done' : ' ' + fillClass}" style="width:${Math.min(100, pct)}%"></div></div>
      ${extra}
    `;
    card.querySelector('.goal-card__edit').addEventListener('click', onEdit);
    return card;
  }

  function openGoalEditModal(kind, work) {
    const fieldMap = {
      daily: { label: '일일 목표 글자수', key: 'dailyGoalChars', withDate: false },
      weekly: { label: '주간 목표 글자수', key: 'weeklyGoalChars', withDate: false },
      total: { label: '작품 전체 목표 글자수', key: 'targetTotalChars', withDate: true },
    };
    const cfg = fieldMap[kind];
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="form-field">
        <label>${cfg.label}</label>
        <input type="number" min="0" class="input" id="goalValue" value="${work[cfg.key] || ''}" placeholder="0 = 사용 안 함">
      </div>
      ${cfg.withDate ? `
      <div class="form-field">
        <label>완결 목표일 (선택)</label>
        <input type="date" class="input" id="goalDate" value="${work.targetDate || ''}">
      </div>` : ''}
    `;
    const { close } = UI.openModal({
      title: '목표 설정',
      bodyEl: wrap,
      actions: [
        { label: '취소', onClick: () => close() },
        {
          label: '저장', primary: true,
          onClick: async () => {
            const patch = { [cfg.key]: parseInt(wrap.querySelector('#goalValue').value, 10) || 0 };
            if (cfg.withDate) patch.targetDate = wrap.querySelector('#goalDate').value || null;
            await Models.updateWork(workId, patch);
            close();
            await renderGoalsGrid();
          },
        },
      ],
    });
  }

  async function renderChapterGoals() {
    const fresh = await Models.getGoalSummary(workId);
    const list = document.getElementById('chapterGoalList');
    list.innerHTML = '';
    if (!fresh.chapterInfo.length) {
      list.innerHTML = `<p class="muted">아직 챕터가 없습니다.</p>`;
      return;
    }
    fresh.chapterInfo.forEach((ch) => {
      const row = document.createElement('div');
      row.className = 'chapter-goal-row';
      const pct = ch.progress === null ? 0 : Math.round(ch.progress * 100);
      row.innerHTML = `
        <div class="chapter-goal-row__title text-pal-2">${Utils.escapeHtml(ch.title)}</div>
        <div class="progress-bar"><div class="progress-bar__fill${pct >= 100 ? ' progress-bar__fill--done' : ' progress-bar__fill--pal-2'}" style="width:${Math.min(100, pct)}%"></div></div>
        <div class="chapter-goal-row__meta">${ch.chars.toLocaleString()}${ch.targetChars ? ' / ' + ch.targetChars.toLocaleString() : ''}자${ch.dueDate ? ' · ' + Utils.formatDday(ch.dueDate) : ''}</div>
        <button class="icon-btn edit-chapter-goal">✎</button>
      `;
      row.querySelector('.edit-chapter-goal').addEventListener('click', () => openChapterGoalModal(ch));
      list.appendChild(row);
    });
  }

  function openChapterGoalModal(ch) {
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="form-field">
        <label>목표 글자수</label>
        <input type="number" min="0" class="input" id="chTarget" value="${ch.targetChars || ''}" placeholder="0 = 사용 안 함">
      </div>
      <div class="form-field">
        <label>마감일 (선택)</label>
        <input type="date" class="input" id="chDue" value="${ch.dueDate || ''}">
      </div>
    `;
    const { close } = UI.openModal({
      title: `"${ch.title}" 목표 설정`,
      bodyEl: wrap,
      actions: [
        { label: '취소', onClick: () => close() },
        {
          label: '저장', primary: true,
          onClick: async () => {
            await Models.updateChapter(ch.id, {
              targetChars: parseInt(wrap.querySelector('#chTarget').value, 10) || 0,
              dueDate: wrap.querySelector('#chDue').value || null,
            });
            close();
            await renderChapterGoals();
            await renderSchedule();
          },
        },
      ],
    });
  }

  function openScheduleModal(existing) {
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="form-field">
        <label>제목</label>
        <input type="text" class="input" id="schTitle" value="${Utils.escapeHtml(existing?.title || '')}" placeholder="예: 3화 초고 마감">
      </div>
      <div class="form-field">
        <label>날짜</label>
        <input type="date" class="input" id="schDate" value="${existing?.date || Utils.todayStr()}">
      </div>
      <div class="form-field">
        <label>목표 글자수 (선택)</label>
        <input type="number" min="0" class="input" id="schChars" value="${existing?.targetChars || ''}">
      </div>
    `;
    const actions = [
      { label: '취소', onClick: () => close() },
      {
        label: existing ? '저장' : '추가', primary: true,
        onClick: async () => {
          const data = {
            title: wrap.querySelector('#schTitle').value.trim() || '새 일정',
            date: wrap.querySelector('#schDate').value || Utils.todayStr(),
            targetChars: parseInt(wrap.querySelector('#schChars').value, 10) || 0,
          };
          if (existing) await Models.updateSchedule(existing.id, data);
          else await Models.createSchedule(workId, data);
          close();
          await renderSchedule();
        },
      },
    ];
    if (existing) {
      actions.splice(1, 0, {
        label: '삭제', danger: true,
        onClick: async () => {
          await Models.deleteSchedule(existing.id);
          close();
          await renderSchedule();
        },
      });
    }
    const { close } = UI.openModal({ title: existing ? '일정 수정' : '일정 추가', bodyEl: wrap, actions });
  }

  async function renderSchedule() {
    const area = document.getElementById('scheduleArea');
    const summary = await Models.getGoalSummary(workId);
    if (scheduleMode === 'card') {
      area.innerHTML = `<div class="schedule-cards" id="scheduleCards"></div>`;
      const cardsEl = document.getElementById('scheduleCards');
      if (!summary.upcoming.length) {
        cardsEl.innerHTML = `<p class="muted">등록된 일정이 없습니다.</p>`;
        return;
      }
      const kindPalClass = { schedule: 'text-accent', chapter: 'text-pal-2', work: 'text-pal-1' };
      summary.upcoming.forEach((item) => {
        const card = document.createElement('div');
        card.className = 'schedule-card' + (item.completed ? ' schedule-card--done' : '');
        card.innerHTML = `
          <span class="schedule-card__dday ${kindPalClass[item.kind] || 'text-accent'}">${Utils.formatDday(item.date)}</span>
          <div class="schedule-card__body">
            <div class="schedule-card__title">${Utils.escapeHtml(item.title)}</div>
            <div class="schedule-card__meta">${item.date}${item.targetChars ? ' · 목표 ' + item.targetChars.toLocaleString() + '자' : ''}</div>
          </div>
          <div class="schedule-card__actions">
            ${item.kind === 'schedule' ? `<button class="icon-btn toggle-btn" title="완료 표시">${item.completed ? '↩' : '✓'}</button>` : ''}
          </div>
        `;
        if (item.kind === 'schedule') {
          const raw = summary.schedules.find((s) => s.id === item.id);
          card.addEventListener('click', (e) => {
            if (e.target.closest('.toggle-btn')) return;
            openScheduleModal(raw);
          });
          card.querySelector('.toggle-btn').addEventListener('click', async () => {
            await Models.updateSchedule(item.id, { completed: !item.completed });
            await renderSchedule();
          });
        } else if (item.kind === 'chapter') {
          card.addEventListener('click', () => Router.go(`#/work/${workId}/manuscript?chapter=${item.id}`));
        }
        cardsEl.appendChild(card);
      });
    } else {
      renderCalendar(area, summary);
    }
  }

  function renderCalendar(area, summary) {
    area.innerHTML = `
      <div class="calendar">
        <div class="calendar__head">
          <button class="btn btn--ghost btn--sm" id="prevMonth">◀</button>
          <h3 id="calMonthLabel"></h3>
          <button class="btn btn--ghost btn--sm" id="nextMonth">▶</button>
        </div>
        <div class="calendar__grid" id="calGrid"></div>
      </div>
    `;
    document.getElementById('prevMonth').addEventListener('click', () => {
      calendarCursor.setMonth(calendarCursor.getMonth() - 1);
      renderCalendar(area, summary);
    });
    document.getElementById('nextMonth').addEventListener('click', () => {
      calendarCursor.setMonth(calendarCursor.getMonth() + 1);
      renderCalendar(area, summary);
    });

    const year = calendarCursor.getFullYear();
    const month = calendarCursor.getMonth();
    document.getElementById('calMonthLabel').textContent = `${year}년 ${month + 1}월`;

    const grid = document.getElementById('calGrid');
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
    summary.upcoming.forEach((item) => {
      eventsByDate[item.date] = eventsByDate[item.date] || [];
      eventsByDate[item.date].push(item);
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
      const eventKindClass = { work: 'calendar__event--pal-1', chapter: 'calendar__event--pal-2' };
      (eventsByDate[key] || []).forEach((item) => {
        const ev = document.createElement('div');
        ev.className = 'calendar__event' + (eventKindClass[item.kind] ? ' ' + eventKindClass[item.kind] : '') + (item.completed ? ' calendar__event--done' : '');
        ev.textContent = item.title;
        ev.addEventListener('click', () => {
          if (item.kind === 'schedule') {
            const raw = summary.schedules.find((s) => s.id === item.id);
            openScheduleModal(raw);
          } else if (item.kind === 'chapter') {
            Router.go(`#/work/${workId}/manuscript?chapter=${item.id}`);
          }
        });
        cell.appendChild(ev);
      });
      grid.appendChild(cell);
    }
  }

  await renderSchedule();
};
