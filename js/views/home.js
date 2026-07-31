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

  // The sidebar is hidden on this landing page (see App.onNavigate), so offer the
  // same search/timer/settings entry points inline here instead.
  document.getElementById('homeHelpBtn').addEventListener('click', () => Onboarding.show());
  document.getElementById('homeSearchBtn').addEventListener('click', () => Router.go('#/search'));
  document.getElementById('homeTimerBtn').addEventListener('click', (e) => Timer.openPopover(e.currentTarget));
  document.getElementById('homeSettingsBtn').addEventListener('click', () => Views.openSettings(null));

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
          <h3>${Utils.escapeHtml(w.title)}<span class="length-badge">${w.format === 'webnovel' ? '📡 웹소설' : Models.LENGTH_LABELS[w.length] || '장편'}</span>${w.genre && Models.GENRE_TEMPLATES[w.genre] ? `<span class="length-badge length-badge--genre">${Models.GENRE_TEMPLATES[w.genre].label}</span>` : ''}</h3>
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
