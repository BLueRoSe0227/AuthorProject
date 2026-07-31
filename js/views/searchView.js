const SEARCH_TYPE_LABELS = {
  work: '작품', chapter: '챕터', scene: '장면', character: '캐릭터', setting: '설정', memo: '메모',
};

function palVarFor(type) {
  const slot = Graph.ENTITY_PAL[type];
  return slot === 'accent' ? 'var(--accent)' : `var(--palette-${slot})`;
}

Views.searchView = async function () {
  const content = document.getElementById('content');
  content.innerHTML = `
    <div class="view view--search">
      <header class="view__header">
        <h1>🔍 통합 검색</h1>
      </header>
      <input type="text" id="searchInput" class="input input--lg" placeholder="작품, 챕터, 장면, 캐릭터, 설정, 메모를 검색하세요...">
      <div class="search-filters" id="searchFilters">
        ${Object.entries(SEARCH_TYPE_LABELS).map(([k, v]) => `<button class="chip chip--active" data-type="${k}" style="--chip-c:${palVarFor(k)}">${v}</button>`).join('')}
      </div>
      <div class="search-results" id="searchResults">
        <p class="muted">검색어를 입력해보세요.</p>
      </div>
    </div>
  `;

  const input = document.getElementById('searchInput');
  const resultsEl = document.getElementById('searchResults');
  const activeTypes = new Set(Object.keys(SEARCH_TYPE_LABELS));

  document.querySelectorAll('.chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const t = chip.dataset.type;
      if (activeTypes.has(t)) { activeTypes.delete(t); chip.classList.remove('chip--active'); }
      else { activeTypes.add(t); chip.classList.add('chip--active'); }
      runSearch();
    });
  });

  async function runSearch() {
    const q = input.value.trim();
    if (!q) {
      resultsEl.innerHTML = `<p class="muted">검색어를 입력해보세요.</p>`;
      return;
    }
    const results = (await Search.searchAll(q)).filter((r) => activeTypes.has(r.type));
    if (!results.length) {
      resultsEl.innerHTML = `<p class="muted">"${Utils.escapeHtml(q)}"에 대한 결과가 없습니다.</p>`;
      return;
    }
    resultsEl.innerHTML = '';
    results.forEach((r) => {
      const el = document.createElement('div');
      el.className = 'search-result';
      const slot = Graph.ENTITY_PAL[r.type];
      const palClass = slot === 'accent' ? 'accent' : `pal-${slot}`;
      el.innerHTML = `
        <span class="search-result__icon text-${palClass}">${UI.icon(r.type)}</span>
        <div class="search-result__body">
          <div class="search-result__title">${Utils.escapeHtml(r.title)} <span class="search-result__type badge-${palClass}">${SEARCH_TYPE_LABELS[r.type]}</span></div>
          <div class="search-result__snippet muted">${Utils.escapeHtml(r.snippet)}</div>
        </div>
      `;
      el.addEventListener('click', () => Router.go(r.route));
      resultsEl.appendChild(el);
    });
  }

  input.addEventListener('input', Utils.debounce(runSearch, 250));
  input.focus();
};
