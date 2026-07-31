const THEME_PALETTES = {
  vivid: [
    { name: '미드나잇 판타지', colors: ['#4c3fd7', '#2f6fed', '#16b8a6', '#f2994a', '#ee5f95'], accentIndex: 0 },
    { name: '느와르 스릴러', colors: ['#263238', '#37474f', '#8b1e2f', '#c62828', '#eceff1'], accentIndex: 3 },
    { name: '로맨스 선셋', colors: ['#7b2ff7', '#c86dd7', '#ff5e7e', '#ff9a62', '#ffd166'], accentIndex: 2 },
    { name: 'SF 사이버펑크', colors: ['#2962ff', '#7c4dff', '#ff2d95', '#00e5ff', '#00ff9c'], accentIndex: 1 },
    { name: '선셋 액션', colors: ['#264653', '#2a9d8f', '#e9c46a', '#f4a261', '#e63946'], accentIndex: 4 },
  ],
  pastel: [
    { name: '봄날의 로맨스', colors: ['#fff2cc', '#ffe0b3', '#ffc4d6', '#d9c4f2', '#c7ecd4'], accentIndex: 2 },
    { name: '코지 판타지', colors: ['#a0c4ff', '#c8b6ff', '#ffd6a5', '#ffb4a2', '#b8e0d2'], accentIndex: 1 },
    { name: '감성 에세이', colors: ['#f2e9dc', '#e8d9c5', '#d9a8a0', '#b8c9d9', '#a8c9b8'], accentIndex: 2 },
    { name: '몽환 동화', colors: ['#fff3b0', '#ffc9de', '#d0bdf4', '#a5d8dd', '#b8e0d4'], accentIndex: 2 },
    { name: '빈티지 로맨스', colors: ['#e8ddd2', '#d4b896', '#c9a0a5', '#b08a8f', '#9fb8a8'], accentIndex: 2 },
  ],
  mono: [
    { name: '느와르 잉크', colors: ['#e8e9ee', '#a8adb8', '#6b7280', '#3a3d45', '#1a1a1e'], accentIndex: 2 },
    { name: '차분한 서재', colors: ['#f0e9de', '#d4c9ba', '#a89a8a', '#7a6d5f', '#4a4038'], accentIndex: 2 },
    { name: '겨울 서정', colors: ['#e8ecf0', '#b8c2cf', '#8290a3', '#4d5b6e', '#2b3240'], accentIndex: 2 },
    { name: '클래식 잉크', colors: ['#dde1e7', '#9aa3b0', '#6c7686', '#2e3440', '#14171f'], accentIndex: 2 },
    { name: '미니멀 그레이', colors: ['#d6d6d6', '#a8a8a8', '#7a7a7a', '#4f4f4f', '#2b2b2b'], accentIndex: 2 },
  ],
};
const THEME_STYLE_LABELS = { vivid: '비비드', pastel: '파스텔', mono: '모노' };
const THEME_KEYS = { mode: 'sw-theme-mode', style: 'sw-theme-style', palette: 'sw-theme-palette' };

const Theme = {
  hexToRgba(hex, alpha) {
    const h = hex.replace('#', '');
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  },

  get() {
    return {
      mode: localStorage.getItem(THEME_KEYS.mode) || 'system',
      style: localStorage.getItem(THEME_KEYS.style) || 'vivid',
      paletteIdx: parseInt(localStorage.getItem(THEME_KEYS.palette) || '0', 10),
    };
  },

  currentPalette() {
    const { style, paletteIdx } = Theme.get();
    const list = THEME_PALETTES[style] || THEME_PALETTES.vivid;
    return list[paletteIdx] || list[0];
  },

  resolvedMode(mode) {
    if (mode === 'system') {
      return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }
    return mode;
  },

  apply() {
    const { mode } = Theme.get();
    const root = document.documentElement;
    root.setAttribute('data-theme', Theme.resolvedMode(mode));
    root.setAttribute('data-theme-style', Theme.get().style);
    const palette = Theme.currentPalette();
    const accent = palette.colors[palette.accentIndex];
    root.style.setProperty('--accent', accent);
    root.style.setProperty('--accent-soft', Theme.hexToRgba(accent, 0.16));
    palette.colors.forEach((c, i) => root.style.setProperty(`--palette-${i + 1}`, c));
  },

  setMode(mode) {
    localStorage.setItem(THEME_KEYS.mode, mode);
    Theme.apply();
  },

  setPalette(style, paletteIdx) {
    localStorage.setItem(THEME_KEYS.style, style);
    localStorage.setItem(THEME_KEYS.palette, String(paletteIdx));
    Theme.apply();
  },

  cycleMode() {
    const { mode } = Theme.get();
    const resolved = Theme.resolvedMode(mode);
    Theme.setMode(resolved === 'light' ? 'dark' : 'light');
  },

  // Renders the mode + palette picker UI into the given container. Reused by both
  // the standalone theme modal and the "테마" tab inside the unified settings modal.
  renderPicker(wrap) {
    let activeStyle = Theme.get().style;
    wrap.className = 'theme-picker';

    const modeRow = document.createElement('div');
    modeRow.className = 'theme-picker__modes';
    ['light', 'dark', 'system'].forEach((m) => {
      const btn = document.createElement('button');
      btn.className = 'btn btn--ghost btn--sm' + (Theme.get().mode === m ? ' btn--active' : '');
      btn.textContent = m === 'light' ? '☀️ 라이트' : m === 'dark' ? '🌙 다크' : '💻 시스템';
      btn.addEventListener('click', () => {
        Theme.setMode(m);
        modeRow.querySelectorAll('button').forEach((b) => b.classList.remove('btn--active'));
        btn.classList.add('btn--active');
      });
      modeRow.appendChild(btn);
    });

    const tabRow = document.createElement('div');
    tabRow.className = 'theme-picker__tabs';
    const listEl = document.createElement('div');
    listEl.className = 'palette-list';

    function renderList() {
      listEl.innerHTML = '';
      THEME_PALETTES[activeStyle].forEach((palette, idx) => {
        const current = Theme.get();
        const selected = current.style === activeStyle && current.paletteIdx === idx;

        const row = document.createElement('div');
        row.className = 'palette-row' + (selected ? ' palette-row--selected' : '');

        const strip = document.createElement('div');
        strip.className = 'palette-row__strip';
        palette.colors.forEach((c) => {
          const block = document.createElement('div');
          block.className = 'palette-row__block';
          block.style.background = c;
          strip.appendChild(block);
        });

        const label = document.createElement('div');
        label.className = 'palette-row__label';
        label.innerHTML = `<span>${palette.name}</span>${selected ? '<span class="palette-row__check">✓ 적용됨</span>' : ''}`;

        row.appendChild(strip);
        row.appendChild(label);
        row.addEventListener('click', () => {
          Theme.setPalette(activeStyle, idx);
          renderList();
        });
        listEl.appendChild(row);
      });
    }

    Object.entries(THEME_STYLE_LABELS).forEach(([key, label]) => {
      const tab = document.createElement('button');
      tab.className = 'chip' + (activeStyle === key ? ' chip--active' : '');
      tab.textContent = label;
      tab.addEventListener('click', () => {
        activeStyle = key;
        tabRow.querySelectorAll('.chip').forEach((c) => c.classList.remove('chip--active'));
        tab.classList.add('chip--active');
        renderList();
      });
      tabRow.appendChild(tab);
    });

    renderList();

    wrap.appendChild(modeRow);
    wrap.appendChild(document.createElement('hr'));
    wrap.appendChild(tabRow);
    wrap.appendChild(listEl);
  },
};

Theme.apply();
if (window.matchMedia) {
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
    if (Theme.get().mode === 'system') Theme.apply();
  });
}
