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

      <div class="goals-section-title">
        <span>🏆 미션</span>
        <button class="btn btn--ghost btn--sm" id="addMissionBtn">+ 미션 추가</button>
      </div>
      <div class="mission-list" id="missionList"></div>

      <div class="goals-section-title">
        <span>📮 투고 내역</span>
        <button class="btn btn--ghost btn--sm" id="addSubmissionBtn">+ 투고 추가</button>
      </div>
      <div class="submission-list" id="submissionList"></div>

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
  await renderMissions();
  await renderSubmissions();
  document.getElementById('addSubmissionBtn').addEventListener('click', () => openSubmissionModal());
  document.getElementById('addMissionBtn').addEventListener('click', () => openMissionModal());

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

  const MISSION_KIND_OPTIONS = [
    { value: 'streak', desc: '예: 5일 연속 500자 이상 쓰기 — 목표치를 채운 날이 연속되는지 자동으로 추적' },
    { value: 'total', desc: '예: 이번 주 안에 10,000자 쓰기 — 기간 내 누적 집필량을 자동으로 추적' },
    { value: 'custom', desc: '예: 이번 챕터 완결하기 — 자동 추적 없이 직접 완료 체크' },
  ];

  async function renderMissions() {
    const missions = await Models.getMissionsForWork(workId);
    const list = document.getElementById('missionList');
    list.innerHTML = '';
    if (!missions.length) {
      list.innerHTML = `<p class="muted">아직 미션이 없습니다. 스트릭이나 기간 목표 같은 도전과제를 추가해보세요.</p>`;
      return;
    }
    for (const m of missions) {
      const { progress, current, target, done } = await Models.getMissionProgress(m);
      const pct = progress === null ? null : Math.round(progress * 100);
      const row = document.createElement('div');
      row.className = 'mission-card' + (done ? ' mission-card--done' : '');
      row.innerHTML = `
        <div class="mission-card__head">
          <span class="mission-card__kind text-accent">${Models.MISSION_KIND_LABELS[m.kind]}</span>
          <strong>${Utils.escapeHtml(m.title)}</strong>
          ${done ? '<span class="mission-card__done-badge">✅</span>' : ''}
        </div>
        ${
          pct !== null
            ? `<div class="progress-bar"><div class="progress-bar__fill${pct >= 100 ? ' progress-bar__fill--done' : ''}" style="width:${Math.min(100, pct)}%"></div></div><div class="mission-card__meta muted">${(current || 0).toLocaleString()} / ${target.toLocaleString()}${m.kind === 'streak' ? '일' : '자'}</div>`
            : m.kind === 'streak' && current
              ? `<div class="mission-card__meta muted">🔥 ${current}일 연속 (목표 일수 미설정)</div>`
              : `<div class="mission-card__meta muted">${m.startDate}${m.endDate ? ' ~ ' + m.endDate : ''}</div>`
        }
        <div class="mission-card__actions">
          ${m.kind === 'custom' ? `<button class="btn btn--ghost btn--sm toggle-mission-btn">${done ? '완료 취소' : '완료로 표시'}</button>` : ''}
          <button class="btn btn--ghost btn--sm edit-mission-btn">✎ 편집</button>
        </div>
      `;
      if (m.kind === 'custom') {
        row.querySelector('.toggle-mission-btn').addEventListener('click', async () => {
          await Models.updateMission(m.id, { completed: !m.completed });
          await renderMissions();
        });
      }
      row.querySelector('.edit-mission-btn').addEventListener('click', () => openMissionModal(m));
      list.appendChild(row);
    }
  }

  function openMissionModal(existing) {
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="form-field">
        <label>미션 이름</label>
        <input type="text" class="input" id="mTitle" value="${Utils.escapeHtml(existing?.title || '')}" placeholder="예: 3일 연속 500자">
      </div>
      <div class="form-field">
        <label>종류</label>
        <div class="radio-group" id="mKindGroup">${MISSION_KIND_OPTIONS.map((o) => `
          <label class="radio-chip${o.value === (existing?.kind || 'streak') ? ' radio-chip--selected' : ''}" data-value="${o.value}">
            <input type="radio" name="mKind" value="${o.value}" ${o.value === (existing?.kind || 'streak') ? 'checked' : ''}>
            <strong>${Models.MISSION_KIND_LABELS[o.value]}</strong>
            <span>${o.desc}</span>
          </label>`).join('')}</div>
      </div>
      <div class="form-field" id="mTargetField">
        <label id="mTargetLabel">목표</label>
        <input type="number" min="0" class="input" id="mTarget" value="${existing?.targetValue || ''}">
      </div>
      <div class="form-field" id="mTargetDaysField">
        <label>목표 일수 (연속으로 며칠 채우면 완료로 볼지 — 비우면 목표 없이 기록만)</label>
        <input type="number" min="0" class="input" id="mTargetDays" value="${existing?.targetDays || ''}">
      </div>
      <div class="form-field">
        <label>시작일</label>
        <input type="date" class="input" id="mStart" value="${existing?.startDate || Utils.todayStr()}">
      </div>
      <div class="form-field">
        <label>종료일 (선택 — 비우면 계속 진행)</label>
        <input type="date" class="input" id="mEnd" value="${existing?.endDate || ''}">
      </div>
    `;
    wrap.querySelectorAll('#mKindGroup .radio-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        wrap.querySelectorAll('#mKindGroup .radio-chip').forEach((c) => c.classList.remove('radio-chip--selected'));
        chip.classList.add('radio-chip--selected');
        chip.querySelector('input').checked = true;
        updateTargetLabel(chip.dataset.value);
      });
    });
    function updateTargetLabel(kind) {
      const field = wrap.querySelector('#mTargetField');
      const label = wrap.querySelector('#mTargetLabel');
      const daysField = wrap.querySelector('#mTargetDaysField');
      daysField.hidden = kind !== 'streak';
      if (kind === 'custom') { field.hidden = true; return; }
      field.hidden = false;
      label.textContent = kind === 'streak' ? '하루 목표 글자수' : '기간 내 목표 글자수';
    }
    updateTargetLabel(existing?.kind || 'streak');

    const actions = [
      { label: '취소', onClick: () => close() },
      {
        label: existing ? '저장' : '추가', primary: true,
        onClick: async () => {
          const kind = wrap.querySelector('input[name="mKind"]:checked').value;
          const data = {
            title: wrap.querySelector('#mTitle').value.trim() || '새 미션',
            kind,
            targetValue: kind === 'custom' ? 0 : parseInt(wrap.querySelector('#mTarget').value, 10) || 0,
            targetDays: kind === 'streak' ? parseInt(wrap.querySelector('#mTargetDays').value, 10) || 0 : 0,
            startDate: wrap.querySelector('#mStart').value || Utils.todayStr(),
            endDate: wrap.querySelector('#mEnd').value || null,
          };
          if (existing) await Models.updateMission(existing.id, data);
          else await Models.createMission(workId, data);
          close();
          await renderMissions();
        },
      },
    ];
    if (existing) {
      actions.splice(1, 0, {
        label: '삭제', danger: true,
        onClick: async () => {
          await Models.deleteMission(existing.id);
          close();
          await renderMissions();
        },
      });
    }
    const { close } = UI.openModal({ title: existing ? '미션 편집' : '미션 추가', bodyEl: wrap, actions });
  }

  const SUBMISSION_STATUS_CLASS = { 검토중: 'text-pal-2', 합격: 'text-pal-3', 불합격: 'text-danger', 보류: 'muted' };

  async function renderSubmissions() {
    const subs = await Models.getSubmissions(workId);
    const list = document.getElementById('submissionList');
    list.innerHTML = '';
    if (!subs.length) {
      list.innerHTML = `<p class="muted">아직 투고 기록이 없습니다.</p>`;
      return;
    }
    subs.forEach((s) => {
      const row = document.createElement('div');
      row.className = 'submission-row';
      row.innerHTML = `
        <span class="submission-row__publisher">${Utils.escapeHtml(s.publisher)}</span>
        <span class="muted">${s.date}</span>
        <span class="submission-row__status ${SUBMISSION_STATUS_CLASS[s.status] || 'muted'}">${Utils.escapeHtml(s.status)}</span>
        <span class="muted submission-row__note">${Utils.escapeHtml(Utils.truncate(s.note, 40))}</span>
      `;
      row.addEventListener('click', () => openSubmissionModal(s));
      list.appendChild(row);
    });
  }

  function openSubmissionModal(existing) {
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="form-field">
        <label>투고처</label>
        <input type="text" class="input" id="subPublisher" value="${Utils.escapeHtml(existing?.publisher || '')}" placeholder="예: OO 출판사, 문피아">
      </div>
      <div class="form-field">
        <label>투고일</label>
        <input type="date" class="input" id="subDate" value="${existing?.date || Utils.todayStr()}">
      </div>
      <div class="form-field">
        <label>진행 상태</label>
        <select class="input" id="subStatus">${Models.SUBMISSION_STATUSES.map((s) => `<option value="${s}" ${existing?.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
      </div>
      <div class="form-field">
        <label>메모 (선택)</label>
        <textarea class="textarea" id="subNote" rows="3">${Utils.escapeHtml(existing?.note || '')}</textarea>
      </div>
    `;
    const actions = [
      { label: '취소', onClick: () => close() },
      {
        label: existing ? '저장' : '추가', primary: true,
        onClick: async () => {
          const data = {
            publisher: wrap.querySelector('#subPublisher').value.trim() || '이름 없는 투고처',
            date: wrap.querySelector('#subDate').value || Utils.todayStr(),
            status: wrap.querySelector('#subStatus').value,
            note: wrap.querySelector('#subNote').value.trim(),
          };
          if (existing) await Models.updateSubmission(existing.id, data);
          else await Models.createSubmission(workId, data);
          close();
          await renderSubmissions();
        },
      },
    ];
    if (existing) {
      actions.splice(1, 0, {
        label: '삭제', danger: true,
        onClick: async () => {
          await Models.deleteSubmission(existing.id);
          close();
          await renderSubmissions();
        },
      });
    }
    const { close } = UI.openModal({ title: existing ? '투고 정보 수정' : '투고 추가', bodyEl: wrap, actions });
  }

  function openScheduleModal(existing) {
    const allDay = existing ? existing.allDay !== false : true;
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
        <label>종료일 (선택, 여러 날에 걸친 일정일 때)</label>
        <input type="date" class="input" id="schEndDate" value="${existing?.endDate || ''}">
      </div>
      <div class="form-field">
        <label class="checkbox-field"><input type="checkbox" id="schAllDay" ${allDay ? 'checked' : ''}> 종일</label>
      </div>
      <div class="form-field" id="schTimeField" ${allDay ? 'hidden' : ''}>
        <label>시간</label>
        <div style="display:flex; gap:8px; align-items:center;">
          <input type="time" class="input" id="schStartTime" value="${existing?.startTime || ''}">
          <span class="muted">~</span>
          <input type="time" class="input" id="schEndTime" value="${existing?.endTime || ''}">
        </div>
      </div>
      <div class="form-field">
        <label>메모 (선택)</label>
        <textarea class="textarea" id="schNote" rows="3" placeholder="이 일정에 대해 기억해둘 내용을 적어보세요">${Utils.escapeHtml(existing?.note || '')}</textarea>
      </div>
    `;
    wrap.querySelector('#schAllDay').addEventListener('change', (e) => {
      wrap.querySelector('#schTimeField').hidden = e.target.checked;
    });
    const actions = [
      { label: '취소', onClick: () => close() },
      {
        label: existing ? '저장' : '추가', primary: true,
        onClick: async () => {
          const isAllDay = wrap.querySelector('#schAllDay').checked;
          const data = {
            title: wrap.querySelector('#schTitle').value.trim() || '새 일정',
            date: wrap.querySelector('#schDate').value || Utils.todayStr(),
            endDate: wrap.querySelector('#schEndDate').value || null,
            allDay: isAllDay,
            startTime: isAllDay ? null : wrap.querySelector('#schStartTime').value || null,
            endTime: isAllDay ? null : wrap.querySelector('#schEndTime').value || null,
            note: wrap.querySelector('#schNote').value.trim(),
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
            <div class="schedule-card__meta">${item.date}${item.endDate ? ' ~ ' + item.endDate : ''}${item.allDay === false && item.startTime ? ' · ' + item.startTime + (item.endTime ? '~' + item.endTime : '') : ''}</div>
            ${item.note ? `<div class="schedule-card__note muted">${Utils.escapeHtml(Utils.truncate(item.note, 60))}</div>` : ''}
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
      // Multi-day schedules (item.endDate set) show on every day in the range, not
      // just the start date — capped at 31 iterations so a bad/huge endDate can't
      // spin the calendar render into fanning out thousands of entries.
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
      const eventKindClass = { work: 'calendar__event--pal-1', chapter: 'calendar__event--pal-2' };
      (eventsByDate[key] || []).forEach((item) => {
        const ev = document.createElement('div');
        ev.className = 'calendar__event' + (eventKindClass[item.kind] ? ' ' + eventKindClass[item.kind] : '') + (item.completed ? ' calendar__event--done' : '');
        ev.textContent = item.title;
        ev.title = item.note ? `${item.title}\n${item.note}` : item.title;
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
