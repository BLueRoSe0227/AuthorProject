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
  `;
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
          await Models.updateWork(work.id, { title, description });
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
  const stats = await Models.getWorkStats(workId);

  content.innerHTML = `
    <div class="view view--dashboard">
      <header class="view__header">
        <div>
          <h1>${Utils.escapeHtml(bundle.work.title)}<span class="length-badge">${bundle.work.length === 'short' ? '단편' : '장편'}</span></h1>
          <p class="muted">${Utils.escapeHtml(bundle.work.description || '소개가 없습니다')}</p>
        </div>
        <button class="btn btn--ghost" id="editWorkBtn">✎ 편집</button>
      </header>

      <div class="stat-row">
        <div class="stat-tile"><span class="stat-tile__num text-pal-2">${stats.chapterCount}</span><span class="stat-tile__label">챕터</span></div>
        <div class="stat-tile"><span class="stat-tile__num text-pal-3">${stats.sceneCount}</span><span class="stat-tile__label">장면</span></div>
        <div class="stat-tile"><span class="stat-tile__num text-pal-1">${stats.wordCount.toLocaleString()}</span><span class="stat-tile__label">글자수</span></div>
        <div class="stat-tile"><span class="stat-tile__num text-pal-4">${stats.characterCount}</span><span class="stat-tile__label">캐릭터</span></div>
        <div class="stat-tile"><span class="stat-tile__num text-pal-5">${stats.settingCount}</span><span class="stat-tile__label">설정</span></div>
        <div class="stat-tile"><span class="stat-tile__num text-accent">${stats.memoCount}</span><span class="stat-tile__label">메모</span></div>
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
            <canvas id="graphCanvas"></canvas>
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
      </div>
    </div>
  `;

  document.getElementById('editWorkBtn').addEventListener('click', () => Views.editWorkFlow(bundle.work));
  document.getElementById('goToGoalsBtn').addEventListener('click', () => Router.go(`#/work/${workId}/goals`));

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
