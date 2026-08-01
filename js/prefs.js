// App-wide display/behavior preferences (font, scale, autosave delay, time format).
// Mirrors the theme.js pattern: localStorage-backed, apply() pushes CSS vars/attrs.
const PREF_FONT_STACKS = {
  gothic: "'Pretendard', -apple-system, BlinkMacSystemFont, 'Malgun Gothic', sans-serif",
  serif: "'Nanum Myeongjo', 'Batang', serif",
  system: "system-ui, -apple-system, 'Segoe UI', 'Malgun Gothic', sans-serif",
  handwriting: "'Nanum Pen Script', cursive",
  cute: "'Gaegu', cursive",
  round: "'Dongle', sans-serif",
  brush: "'Nanum Brush Script', cursive",
};
const PREF_FONT_LABELS = {
  gothic: '고딕 (기본)',
  serif: '명조',
  system: '시스템 기본',
  handwriting: '필기체',
  cute: '귀여운체',
  round: '동글동글체',
  brush: '붓글씨체',
};
// "화면 배율"(scale) zooms the whole UI proportionally via CSS zoom — buttons, cards,
// everything. "본문 글자 크기"(textSize) is separate and only resizes the manuscript
// editor's prose, for people who just want bigger text to read/write, not a bigger UI.
const PREF_SCALES = { small: 0.92, normal: 1, large: 1.1 };
const PREF_SCALE_LABELS = { small: '작게', normal: '보통', large: '크게' };
const PREF_TEXT_SIZES = { small: '14px', normal: '15.5px', large: '18px', xlarge: '21px' };
const PREF_TEXT_SIZE_LABELS = { small: '작게', normal: '보통', large: '크게', xlarge: '아주 크게' };
const PREF_AUTOSAVE = { fast: 400, normal: 700, slow: 1500 };
const PREF_AUTOSAVE_LABELS = { fast: '빠름', normal: '보통', slow: '느림' };
const PREF_KEYS = {
  font: 'sw-pref-font',
  scale: 'sw-pref-scale',
  textSize: 'sw-pref-textsize',
  autosave: 'sw-pref-autosave',
  reltime: 'sw-pref-reltime',
  charCountMode: 'sw-pref-charcountmode', // 'exclude' | 'include' — display only, see Utils.countChars
};

const Prefs = {
  get() {
    const font = localStorage.getItem(PREF_KEYS.font) || 'gothic';
    const scale = localStorage.getItem(PREF_KEYS.scale) || 'normal';
    const textSize = localStorage.getItem(PREF_KEYS.textSize) || 'normal';
    const autosave = localStorage.getItem(PREF_KEYS.autosave) || 'normal';
    const reltimeRaw = localStorage.getItem(PREF_KEYS.reltime);
    const charCountMode = localStorage.getItem(PREF_KEYS.charCountMode) === 'include' ? 'include' : 'exclude';
    return {
      font,
      scale,
      textSize,
      autosave,
      autosaveDelay: PREF_AUTOSAVE[autosave] || PREF_AUTOSAVE.normal,
      relativeTime: reltimeRaw === null ? true : reltimeRaw === 'true',
      charCountMode,
    };
  },

  apply() {
    const { font, scale, textSize } = Prefs.get();
    const root = document.documentElement;
    root.style.setProperty('--app-font-family', PREF_FONT_STACKS[font] || PREF_FONT_STACKS.gothic);
    root.style.setProperty('--rich-content-font-size', PREF_TEXT_SIZES[textSize] || PREF_TEXT_SIZES.normal);
    const appEl = document.getElementById('app');
    if (appEl) appEl.style.zoom = String(PREF_SCALES[scale] || 1);
  },

  setFont(font) {
    localStorage.setItem(PREF_KEYS.font, font);
    Prefs.apply();
  },

  setScale(scale) {
    localStorage.setItem(PREF_KEYS.scale, scale);
    Prefs.apply();
  },

  setTextSize(textSize) {
    localStorage.setItem(PREF_KEYS.textSize, textSize);
    Prefs.apply();
  },

  setAutosave(autosave) {
    localStorage.setItem(PREF_KEYS.autosave, autosave);
  },

  setRelativeTime(enabled) {
    localStorage.setItem(PREF_KEYS.reltime, String(!!enabled));
  },

  toggleCharCountMode() {
    const next = Prefs.get().charCountMode === 'include' ? 'exclude' : 'include';
    localStorage.setItem(PREF_KEYS.charCountMode, next);
    return next;
  },
};

Prefs.apply();
