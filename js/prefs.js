// App-wide display/behavior preferences (font, scale, autosave delay, time format).
// Mirrors the theme.js pattern: localStorage-backed, apply() pushes CSS vars/attrs.
const PREF_FONT_STACKS = {
  gothic: "'Pretendard', -apple-system, BlinkMacSystemFont, 'Malgun Gothic', sans-serif",
  serif: "'Nanum Myeongjo', 'Batang', serif",
  system: "system-ui, -apple-system, 'Segoe UI', 'Malgun Gothic', sans-serif",
};
const PREF_FONT_LABELS = { gothic: '고딕 (기본)', serif: '명조', system: '시스템 기본' };
const PREF_SCALES = { small: 0.92, normal: 1, large: 1.1 };
const PREF_SCALE_LABELS = { small: '작게', normal: '보통', large: '크게' };
const PREF_AUTOSAVE = { fast: 400, normal: 700, slow: 1500 };
const PREF_AUTOSAVE_LABELS = { fast: '빠름', normal: '보통', slow: '느림' };
const PREF_KEYS = {
  font: 'sw-pref-font',
  scale: 'sw-pref-scale',
  autosave: 'sw-pref-autosave',
  reltime: 'sw-pref-reltime',
};

const Prefs = {
  get() {
    const font = localStorage.getItem(PREF_KEYS.font) || 'gothic';
    const scale = localStorage.getItem(PREF_KEYS.scale) || 'normal';
    const autosave = localStorage.getItem(PREF_KEYS.autosave) || 'normal';
    const reltimeRaw = localStorage.getItem(PREF_KEYS.reltime);
    return {
      font,
      scale,
      autosave,
      autosaveDelay: PREF_AUTOSAVE[autosave] || PREF_AUTOSAVE.normal,
      relativeTime: reltimeRaw === null ? true : reltimeRaw === 'true',
    };
  },

  apply() {
    const { font, scale } = Prefs.get();
    const root = document.documentElement;
    root.style.setProperty('--app-font-family', PREF_FONT_STACKS[font] || PREF_FONT_STACKS.gothic);
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

  setAutosave(autosave) {
    localStorage.setItem(PREF_KEYS.autosave, autosave);
  },

  setRelativeTime(enabled) {
    localStorage.setItem(PREF_KEYS.reltime, String(!!enabled));
  },
};

Prefs.apply();
