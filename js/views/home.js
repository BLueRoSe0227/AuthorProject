const Views = {};

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
      <label>작품 유형</label>
      <div class="radio-group" id="lengthGroup">
        <label class="radio-chip radio-chip--selected" data-value="long">
          <input type="radio" name="length" value="long" checked>
          <strong>장편</strong>
          <span>여러 챕터로 이어지는 연재형 작품</span>
        </label>
        <label class="radio-chip" data-value="short">
          <input type="radio" name="length" value="short">
          <strong>단편</strong>
          <span>한두 챕터로 완결되는 짧은 작품</span>
        </label>
      </div>
    </div>
    <div class="form-field">
      <label>색상</label>
      <div class="color-swatches" id="colorSwatches"></div>
    </div>
  `;
  const colors = ['#8b7bff', '#5aa9ff', '#4fd1c5', '#ff9a62', '#f2c94c', '#ff6b9a', '#6bcf7f'];
  let selectedColor = colors[0];
  const swatchWrap = wrap.querySelector('#colorSwatches');
  colors.forEach((c) => {
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

  wrap.querySelectorAll('.radio-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      wrap.querySelectorAll('.radio-chip').forEach((c) => c.classList.remove('radio-chip--selected'));
      chip.classList.add('radio-chip--selected');
      chip.querySelector('input').checked = true;
    });
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
          const work = await Models.createWork({ title, description, color: selectedColor, length });
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
        <button class="btn btn--pal-work" id="newWorkBtn">+ 새 작품</button>
      </header>

      ${
        works.length
          ? `<div class="work-grid" id="workGrid"></div>`
          : `<div class="empty-state">
              <div class="empty-state__icon">📚</div>
              <h3>아직 작품이 없어요</h3>
              <p class="muted">첫 작품을 만들고 챕터와 장면을 구성해보세요.</p>
              <button class="btn btn--pal-work" id="newWorkBtnEmpty">+ 새 작품 만들기</button>
            </div>`
      }

      <section class="home-inbox">
        <h2>📥 전체 메모</h2>
        <div id="homeMemoList" class="memo-list"></div>
      </section>
    </div>
  `;

  document.getElementById('newWorkBtn').addEventListener('click', Views.createWorkFlow);
  const emptyBtn = document.getElementById('newWorkBtnEmpty');
  if (emptyBtn) emptyBtn.addEventListener('click', Views.createWorkFlow);

  if (works.length) {
    const grid = document.getElementById('workGrid');
    for (const w of works) {
      const [stats, goal, recent] = await Promise.all([
        Models.getWorkStats(w.id),
        Models.getGoalSummary(w.id),
        Models.getRecentActivity(w.id, 1),
      ]);
      const todoCount = goal.upcoming.filter((i) => !i.completed).length;
      const connectionCount = stats.characterCount + stats.settingCount + stats.memoCount;
      const progressPct = goal.totalProgress !== null ? Math.round(goal.totalProgress * 100) : null;
      const recentItem = recent[0];
      const recentPalClass = recentItem ? `text-pal-${Graph.ENTITY_PAL[recentItem.type]}`.replace('text-pal-accent', 'text-accent') : '';

      const card = document.createElement('div');
      card.className = 'work-card work-card--rich';
      card.style.setProperty('--work-color', w.color);
      card.innerHTML = `
        <div class="work-card__color" style="background:${w.color}"></div>
        <div class="work-card__body">
          <h3>${Utils.escapeHtml(w.title)}<span class="length-badge">${w.length === 'short' ? '단편' : '장편'}</span></h3>
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
            recentItem
              ? `<div class="work-card__recent"><span class="${recentPalClass}">${UI.icon(recentItem.type)}</span><span class="work-card__recent-title">${Utils.escapeHtml(recentItem.title)}</span><span class="muted">${Utils.formatDate(recentItem.updatedAt)}</span></div>`
              : ''
          }
        </div>
      `;
      card.addEventListener('click', () => Router.go(`#/work/${w.id}/dashboard`));
      grid.appendChild(card);
    }
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
