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

  // WCAG 2.x relative luminance / contrast ratio (see https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio).
  // Used to flag palettes whose accent color would be hard to read against the page background.
  relativeLuminance(hex) {
    const h = hex.trim().replace('#', '');
    const channels = [0, 2, 4]
      .map((i) => parseInt(h.substring(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  },

  contrastRatio(hex1, hex2) {
    const L1 = Theme.relativeLuminance(hex1);
    const L2 = Theme.relativeLuminance(hex2);
    const [lighter, darker] = L1 > L2 ? [L1, L2] : [L2, L1];
    return (lighter + 0.05) / (darker + 0.05);
  },

  hexToHsl(hex) {
    const h = hex.trim().replace('#', '');
    const r = parseInt(h.substring(0, 2), 16) / 255;
    const g = parseInt(h.substring(2, 4), 16) / 255;
    const b = parseInt(h.substring(4, 6), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let hh = 0, s = 0;
    const l = (max + min) / 2;
    const d = max - min;
    if (d !== 0) {
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: hh = ((g - b) / d + (g < b ? 6 : 0)); break;
        case g: hh = (b - r) / d + 2; break;
        case b: hh = (r - g) / d + 4; break;
      }
      hh /= 6;
    }
    return { h: hh, s, l };
  },

  hslToHex(h, s, l) {
    let r, g, b;
    if (s === 0) {
      r = g = b = l;
    } else {
      const hue2rgb = (p, q, t) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
      };
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1 / 3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1 / 3);
    }
    const toHex = (c) => Math.round(Math.min(1, Math.max(0, c)) * 255).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  },

  // Derives a text-safe variant of `hex` for use against `bgHex`, nudging HSL
  // lightness away from the background's own lightness (preserving hue/saturation,
  // so it still reads as "that palette color") until it clears minRatio, or gives
  // up after a bounded number of steps and falls back to pure black/white. Exists
  // because pastel palettes (see THEME_PALETTES.pastel) are chosen for swatches/
  // accents, not body text — several are near-white and unreadable as-is on a
  // light card background.
  adjustForContrast(hex, bgHex, minRatio = 4.5) {
    if (Theme.contrastRatio(hex, bgHex) >= minRatio) return hex;
    const bgIsLight = Theme.relativeLuminance(bgHex) > 0.5;
    const hsl = Theme.hexToHsl(hex);
    let l = hsl.l;
    for (let i = 0; i < 24; i++) {
      l += bgIsLight ? -0.04 : 0.04;
      if (l < 0.03 || l > 0.97) break;
      const candidate = Theme.hslToHex(hsl.h, hsl.s, l);
      if (Theme.contrastRatio(candidate, bgHex) >= minRatio) return candidate;
    }
    return bgIsLight ? '#1a1a1a' : '#fafafa';
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

    // data-theme is already set above (synchronously reflected before this next
    // getComputedStyle call), so --bg-elevated below resolves to the CSS for the
    // mode we just switched to, not the previous one.
    const bg = getComputedStyle(root).getPropertyValue('--bg-elevated').trim()
      || (Theme.resolvedMode(mode) === 'light' ? '#ffffff' : '#161922');
    palette.colors.forEach((c, i) => {
      root.style.setProperty(`--palette-${i + 1}`, c);
      root.style.setProperty(`--palette-${i + 1}-text`, Theme.adjustForContrast(c, bg));
    });
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

    // Color settings are scattered across several screens (작품 카드, 캐릭터 그룹,
    // 관계 해시태그, 메모, 타이머 등 각자 만들 때 지정) — this picker only controls
    // the shared theme (배경·강조색), so a short pointer here avoids "이 색은 다른
    // 색상들과 무슨 관계지?" confusion (DES-09).
    const guide = document.createElement('p');
    guide.className = 'muted theme-picker__guide';
    guide.textContent = '여기서 고르는 팔레트는 앱 전체의 배경·강조색을 바꿔요. 작품 카드, 캐릭터 그룹, 메모, 타이머 등 개별 항목 색상은 각 항목을 만들거나 편집할 때 따로 정해요.';
    wrap.appendChild(guide);

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
        renderList(); // low-contrast warnings depend on the resolved background, which just changed
      });
      modeRow.appendChild(btn);
    });

    const tabRow = document.createElement('div');
    tabRow.className = 'theme-picker__tabs';
    const listEl = document.createElement('div');
    listEl.className = 'palette-list';

    function renderList() {
      listEl.innerHTML = '';
      const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()
        || (Theme.resolvedMode(Theme.get().mode) === 'light' ? '#f7f7fb' : '#0f1117');
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

        const ratio = Theme.contrastRatio(palette.colors[palette.accentIndex], bg);
        const lowContrast = ratio < 4.5;

        const label = document.createElement('div');
        label.className = 'palette-row__label';
        label.innerHTML = `
          <span>${palette.name}</span>
          <span class="palette-row__right">
            ${lowContrast ? `<span class="palette-row__warn" title="강조색과 배경의 대비가 WCAG AA 기준(4.5:1) 미달이에요 (${ratio.toFixed(1)}:1). 텍스트에는 저대비로 보일 수 있어요.">⚠️ 대비 낮음</span>` : ''}
            ${selected ? '<span class="palette-row__check">✓ 적용됨</span>' : ''}
          </span>`;

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
