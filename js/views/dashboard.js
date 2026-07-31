Views.editWorkFlow = async function (work) {
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div class="form-field">
      <label>작품 제목</label>
      <input type="text" class="input" id="editWorkTitle" value="${Utils.escapeHtml(work.title)}">
    </div>
    <div class="form-field">
      <label>한 줄 소개</label>
      <textarea class="textarea" id="editWorkDesc" rows="3">${Utils.escapeHtml(work.description || '')}</textarea>
    </div>
    <div class="form-field">
      <label>작품 형식</label>
      <div class="radio-group" id="editFormatGroup">${Views.renderFormatRadioGroup(work.format || 'book')}</div>
    </div>
    <div class="form-field" id="editLengthField" ${work.format === 'webnovel' ? 'hidden' : ''}>
      <label>작품 유형 <span class="muted">(단행본 분량 기준)</span></label>
      <div class="radio-group" id="editLengthGroup">${Views.renderLengthRadioGroup(work.length)}</div>
    </div>
    <div class="form-field">
      <label>장르 (선택)</label>
      ${Views.renderGenreSelect(work.genre)}
    </div>
  `;
  Views.bindLengthRadioGroup(wrap);
  Views.bindFormatRadioGroup(wrap, (format) => {
    wrap.querySelector('#editLengthField').hidden = format === 'webnovel';
  });
  const { close } = UI.openModal({
    title: '작품 정보 수정',
    bodyEl: wrap,
    actions: [
      { label: '취소', onClick: () => close() },
      {
        label: '삭제', danger: true,
        onClick: async () => {
          close();
          const ok = await UI.confirm(`"${work.title}"의 모든 챕터, 장면, 캐릭터, 설정, 메모가 삭제됩니다. 계속할까요?`, {
            title: '작품 삭제', confirmLabel: '삭제', danger: true,
          });
          if (!ok) return;
          await Models.deleteWork(work.id);
          UI.toast('작품이 삭제되었습니다');
          await App.refreshWorkSwitcher();
          Router.go('#/');
        },
      },
      {
        label: '저장', primary: true,
        onClick: async () => {
          const title = wrap.querySelector('#editWorkTitle').value.trim();
          const description = wrap.querySelector('#editWorkDesc').value.trim();
          const length = wrap.querySelector('input[name="length"]:checked').value;
          const format = wrap.querySelector('input[name="format"]:checked').value;
          const genre = wrap.querySelector('#workGenreSelect').value || null;
          await Models.updateWork(work.id, { title, description, length, format, genre });
          close();
          await App.refreshWorkSwitcher();
          Views.dashboard(work.id);
        },
      },
    ],
  });
};

Views.dashboard = async function (workId) {
  const content = document.getElementById('content');
  const bundle = await Models.getWorkBundle(workId);
  if (!bundle.work) { Router.go('#/'); return; }
  const [stats, goalSummary, submissions] = await Promise.all([
    Models.getWorkStats(workId),
    Models.getGoalSummary(workId),
    Models.getSubmissions(workId),
  ]);
  const work = bundle.work;
  const isWebnovel = work.format === 'webnovel';
  const todayPct = goalSummary.todayProgress !== null ? Math.round(goalSummary.todayProgress * 100) : null;

  content.innerHTML = `
    <div class="view view--dashboard">
      <header class="view__header">
        <div>
          <h1>${Utils.escapeHtml(work.title)}<span class="length-badge">${isWebnovel ? '📡 웹소설' : Models.LENGTH_LABELS[work.length] || '장편'}</span>${work.genre && Models.GENRE_TEMPLATES[work.genre] ? `<span class="length-badge length-badge--genre">${Models.GENRE_TEMPLATES[work.genre].label}</span>` : ''}</h1>
          <p class="muted">${Utils.escapeHtml(work.description || '소개가 없습니다')}</p>
        </div>
        <div class="home-header-actions">
          <button class="btn btn--ghost" id="exportWorkBtn">📤 내보내기</button>
          <button class="btn btn--ghost" id="editWorkBtn">✎ 편집</button>
        </div>
      </header>

      <div class="stat-row">
        <div class="stat-tile"><span class="stat-tile__num text-pal-2">${stats.chapterCount}</span><span class="stat-tile__label">챕터</span></div>
        <div class="stat-tile"><span class="stat-tile__num text-pal-3">${stats.sceneCount}</span><span class="stat-tile__label">장면</span></div>
        <div class="stat-tile"><span class="stat-tile__num text-pal-1">${stats.wordCount.toLocaleString()}</span><span class="stat-tile__label">글자수</span></div>
        <div class="stat-tile"><span class="stat-tile__num text-pal-4">${stats.characterCount}</span><span class="stat-tile__label">캐릭터</span></div>
        <div class="stat-tile"><span class="stat-tile__num text-pal-5">${stats.settingCount}</span><span class="stat-tile__label">설정</span></div>
        <div class="stat-tile"><span class="stat-tile__num text-accent">${stats.memoCount}</span><span class="stat-tile__label">메모</span></div>
        <div class="stat-tile"><span class="stat-tile__num text-pal-2">🔥${goalSummary.streak}</span><span class="stat-tile__label">연속 집필일</span></div>
        <div class="stat-tile"><span class="stat-tile__num text-accent">${todayPct === null ? '–' : todayPct + '%'}</span><span class="stat-tile__label">오늘 목표</span></div>
      </div>

      <div class="dashboard-grid">
        <div class="graph-panel">
          <div class="graph-panel__header">
            <h2>🕸️ 연결망</h2>
            <div class="graph-legend">
              <span><i class="dot-pal-1"></i>작품</span>
              <span><i class="dot-pal-2"></i>챕터</span>
              <span><i class="dot-pal-3"></i>장면</span>
              <span><i class="dot-pal-4"></i>캐릭터</span>
              <span><i class="dot-pal-5"></i>설정</span>
              <span><i class="dot-accent"></i>메모</span>
            </div>
          </div>
          <div class="graph-canvas-wrap">
            <canvas id="graphCanvas" role="img" aria-label="작품, 챕터, 장면, 캐릭터, 설정, 메모 간의 연결망 그래프. 드래그·마우스 전용이며, 각 항목 목록은 왼쪽 사이드바의 원고/캐릭터/설정 노트/메모 인박스 화면에서도 확인할 수 있습니다."></canvas>
            <p class="graph-hint">드래그로 노드 이동 · 휠로 확대/축소 · 클릭으로 이동. 본문에 <code>[[이름]]</code>을 쓰면 캐릭터·설정·장면과 자동으로 연결됩니다.</p>
          </div>
        </div>

        <div class="recent-panel">
          <h2>최근 작업</h2>
          <div id="recentList" class="recent-list"></div>
        </div>
      </div>

      <div class="widgets-row">
        <div class="widget-card">
          <h3>📌 빠른 메모</h3>
          <div class="widget-card__quick">
            <textarea class="textarea" id="widgetMemoInput" rows="2" placeholder="떠오른 생각을 바로 적어보세요..."></textarea>
            <button class="btn btn--primary btn--sm" id="widgetMemoAddBtn">추가</button>
          </div>
          <div id="widgetMemoList"></div>
        </div>
        <div class="widget-card">
          <h3>📅 다가오는 일정 <button class="btn btn--ghost btn--sm" id="goToGoalsBtn">전체 보기</button></h3>
          <div id="widgetScheduleList"></div>
        </div>
        ${isWebnovel ? renderSerialWidgetHtml(bundle.chapters, workId) : ''}
        ${submissions.length ? renderSubmissionWidgetHtml(submissions, workId) : ''}
      </div>
    </div>
  `;

  document.getElementById('editWorkBtn').addEventListener('click', () => Views.editWorkFlow(bundle.work));
  document.getElementById('goToGoalsBtn').addEventListener('click', () => Router.go(`#/work/${workId}/goals`));
  document.getElementById('exportWorkBtn').addEventListener('click', () => Views.exportManuscriptFlow(workId));
  const goToSerialBtn = document.getElementById('goToSerialBtn');
  if (goToSerialBtn) goToSerialBtn.addEventListener('click', () => Router.go(`#/work/${workId}/manuscript`));
  const goToSubmissionBtn = document.getElementById('goToSubmissionBtn');
  if (goToSubmissionBtn) goToSubmissionBtn.addEventListener('click', () => Router.go(`#/work/${workId}/goals`));

  async function renderMemoWidget() {
    const memos = (await DB.getAllByIndex('memos', 'workId', workId)).filter((m) => !m.archived);
    memos.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    const listEl = document.getElementById('widgetMemoList');
    listEl.innerHTML = '';
    memos.slice(0, 4).forEach((m) => {
      const item = document.createElement('div');
      item.className = 'widget-schedule-item';
      item.innerHTML = `<span>${Utils.escapeHtml(Utils.truncate(m.content, 40))}</span><span class="muted">${Utils.formatDate(m.updatedAt)}</span>`;
      item.addEventListener('click', () => Router.go(`#/work/${workId}/inbox?id=${m.id}`));
      listEl.appendChild(item);
    });
    if (!memos.length) listEl.innerHTML = `<p class="muted">아직 메모가 없습니다.</p>`;
  }

  document.getElementById('widgetMemoAddBtn').addEventListener('click', async () => {
    const input = document.getElementById('widgetMemoInput');
    const val = input.value.trim();
    if (!val) return;
    await Models.createMemo(workId, { content: val });
    input.value = '';
    await renderMemoWidget();
  });

  async function renderScheduleWidget() {
    const summary = await Models.getGoalSummary(workId);
    const upcoming = summary.upcoming.filter((i) => !i.completed && Utils.daysUntil(i.date) >= -1);
    const listEl = document.getElementById('widgetScheduleList');
    listEl.innerHTML = '';
    const kindClass = { schedule: 'text-accent', chapter: 'text-pal-2', work: 'text-pal-1' };
    upcoming.slice(0, 5).forEach((item) => {
      const el = document.createElement('div');
      el.className = 'widget-schedule-item';
      el.innerHTML = `<span>${Utils.escapeHtml(item.title)}</span><span class="${kindClass[item.kind] || 'muted'}">${Utils.formatDday(item.date)}</span>`;
      el.style.cursor = 'pointer';
      el.addEventListener('click', () => Router.go(`#/work/${workId}/goals`));
      listEl.appendChild(el);
    });
    if (!upcoming.length) listEl.innerHTML = `<p class="muted">다가오는 일정이 없습니다.</p>`;
  }

  await renderMemoWidget();
  await renderScheduleWidget();

  // recent scenes/memos by updatedAt
  const recentItems = await Models.getRecentActivity(workId, 12);

  const recentList = document.getElementById('recentList');
  if (!recentItems.length) {
    recentList.innerHTML = `<p class="muted">아직 활동이 없습니다.</p>`;
  } else {
    recentItems.slice(0, 12).forEach((item) => {
      const routes = {
        scene: `#/work/${workId}/manuscript/${item.id}`,
        character: `#/work/${workId}/characters?id=${item.id}`,
        setting: `#/work/${workId}/settings?id=${item.id}`,
        memo: `#/work/${workId}/inbox?id=${item.id}`,
      };
      const el = document.createElement('div');
      el.className = 'recent-item';
      const palClass = `text-pal-${Graph.ENTITY_PAL[item.type]}`.replace('text-pal-accent', 'text-accent');
      el.innerHTML = `<span class="recent-item__icon ${palClass}">${UI.icon(item.type)}</span><span class="recent-item__title">${Utils.escapeHtml(item.title)}</span><span class="recent-item__time muted">${Utils.formatDate(item.updatedAt)}</span>`;
      el.addEventListener('click', () => Router.go(routes[item.type]));
      recentList.appendChild(el);
    });
  }

  const graphData = Graph.buildData(bundle);
  const canvas = document.getElementById('graphCanvas');
  if (graphData.nodes.length) {
    Graph.mount(canvas, graphData, {
      onNodeClick: (n) => {
        const routes = {
          work: `#/work/${workId}/dashboard`,
          chapter: `#/work/${workId}/manuscript?chapter=${n.id}`,
          scene: `#/work/${workId}/manuscript/${n.id}`,
          character: `#/work/${workId}/characters?id=${n.id}`,
          setting: `#/work/${workId}/settings?id=${n.id}`,
          memo: `#/work/${workId}/inbox?id=${n.id}`,
        };
        if (routes[n.type]) Router.go(routes[n.type]);
      },
    });
  }
};

function renderSerialWidgetHtml(chapters, workId) {
  const sorted = [...chapters].sort((a, b) => a.order - b.order);
  const serialized = sorted.filter((c) => c.serializedAt);
  const nextUp = sorted.find((c) => !c.serializedAt);
  const lastDate = serialized.length ? serialized.map((c) => c.serializedAt).sort().slice(-1)[0] : null;
  return `
    <div class="widget-card">
      <h3>📡 연재 현황 <button class="btn btn--ghost btn--sm" id="goToSerialBtn">원고로</button></h3>
      <div class="widget-schedule-item"><span>연재된 회차</span><span class="text-pal-2">${serialized.length} / ${sorted.length}</span></div>
      ${lastDate ? `<div class="widget-schedule-item"><span>최근 연재일</span><span class="muted">${lastDate}</span></div>` : ''}
      ${nextUp ? `<div class="widget-schedule-item"><span>다음 예정</span><span class="text-accent">${Utils.escapeHtml(nextUp.title)}</span></div>` : `<p class="muted">모든 챕터가 연재되었습니다.</p>`}
    </div>`;
}

function renderSubmissionWidgetHtml(submissions, workId) {
  const counts = {};
  Models.SUBMISSION_STATUSES.forEach((s) => (counts[s] = 0));
  submissions.forEach((s) => (counts[s.status] = (counts[s.status] || 0) + 1));
  const recent = submissions[0];
  return `
    <div class="widget-card">
      <h3>📮 투고 현황 <button class="btn btn--ghost btn--sm" id="goToSubmissionBtn">전체 보기</button></h3>
      <div class="widget-schedule-item"><span>총 투고</span><span class="text-pal-4">${submissions.length}건</span></div>
      <div class="widget-schedule-item"><span>검토중 / 합격 / 불합격</span><span class="muted">${counts['검토중']} / ${counts['합격']} / ${counts['불합격']}</span></div>
      ${recent ? `<div class="widget-schedule-item"><span>최근 투고</span><span class="text-accent">${Utils.escapeHtml(recent.publisher)}</span></div>` : ''}
    </div>`;
}
