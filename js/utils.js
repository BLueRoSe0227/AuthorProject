const Utils = {
  // Shared 7-color palette used for work cards, character groups, memo cards, and
  // the timer widget — single source instead of four near-identical arrays (DEV-07).
  PALETTE_COLORS: ['#8b7bff', '#5aa9ff', '#4fd1c5', '#ff9a62', '#f2c94c', '#ff6b9a', '#6bcf7f'],

  countWords(text) {
    if (!text) return 0;
    const plain = Utils.stripHtml(text);
    return plain.replace(/\s/g, '').length;
  },

  // Display-only alternative to countWords — countWords' result is persisted as
  // scene.wordCount and feeds goal/streak math elsewhere (Models.getGoalSummary
  // etc.), so that meaning (space-excluded) can't change; this is purely for the
  // "공백 포함/제외" toggle in the editor UI.
  countChars(text, includeSpaces) {
    if (!text) return 0;
    const plain = Utils.stripHtml(text);
    return includeSpaces ? plain.length : plain.replace(/\s/g, '').length;
  },

  stripHtml(html) {
    if (!html) return '';
    return String(html).replace(/<[^>]*>/g, '');
  },

  escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },

  debounce(fn, delay) {
    let t = null;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), delay);
    };
  },

  formatDate(iso) {
    if (!iso) return '';
    if (typeof Prefs !== 'undefined' && !Prefs.get().relativeTime) return Utils.formatDateTime(iso);
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now - d;
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return '방금 전';
    if (diffMin < 60) return `${diffMin}분 전`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour}시간 전`;
    const diffDay = Math.floor(diffHour / 24);
    if (diffDay < 7) return `${diffDay}일 전`;
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  },

  dateStr(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  },

  todayStr() {
    return Utils.dateStr(new Date());
  },

  // Shared month-grid calendar renderer — used by both a single work's 목표 & 일정
  // calendar (js/views/goals.js) and the home dashboard's cross-work aggregate
  // calendar (js/views/home.js), which differ only in how a single event chip
  // should look/behave (color source, click target), not in the grid/date math
  // itself. `container`'s innerHTML is fully replaced; `cursor` (a Date) is
  // mutated in place via setMonth on ◀/▶ so the caller's own reference stays the
  // source of truth for "which month" across re-renders triggered by data
  // changes elsewhere (e.g. a schedule being added). `events` items need at least
  // `date` (and optionally `endDate` for a multi-day range); `renderEvent(item)`
  // must return the HTMLElement for one event chip — full control over its
  // class/style/tooltip/click handler is the caller's, since that's exactly where
  // the two use sites differ. Returns the internal render function so callers can
  // force a re-render (e.g. after `events` itself changed) without touching month
  // navigation state.
  // onDateClick(dateStr) (optional) fires when a day cell itself is clicked (not
  // one of its event chips, which keep their own click behavior) so callers can
  // offer "click a date to add a schedule there".
  renderMonthCalendar(container, cursor, events, { renderEvent, onDateClick }) {
    function render() {
      container.innerHTML = `
        <div class="calendar">
          <div class="calendar__head">
            <button class="btn btn--ghost btn--sm" data-cal-prev>◀</button>
            <h3 data-cal-month-label></h3>
            <button class="btn btn--ghost btn--sm" data-cal-next>▶</button>
          </div>
          <div class="calendar__grid" data-cal-grid></div>
        </div>
      `;
      container.querySelector('[data-cal-prev]').addEventListener('click', () => {
        cursor.setMonth(cursor.getMonth() - 1);
        render();
      });
      container.querySelector('[data-cal-next]').addEventListener('click', () => {
        cursor.setMonth(cursor.getMonth() + 1);
        render();
      });

      const year = cursor.getFullYear();
      const month = cursor.getMonth();
      container.querySelector('[data-cal-month-label]').textContent = `${year}년 ${month + 1}월`;

      const grid = container.querySelector('[data-cal-grid]');
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
      events.forEach((item) => {
        // Multi-day events (item.endDate set) show on every day in the range —
        // capped at 31 iterations so a bad/huge endDate can't fan out indefinitely.
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
        cell.className = 'calendar__cell' + (key === todayKey ? ' calendar__cell--today' : '') + (onDateClick ? ' calendar__cell--clickable' : '');
        cell.innerHTML = `<div class="calendar__cell-date">${d}</div>`;
        (eventsByDate[key] || []).forEach((item) => cell.appendChild(renderEvent(item)));
        if (onDateClick) {
          cell.addEventListener('click', (e) => {
            if (e.target.closest('.calendar__event')) return; // let the chip's own click handler run instead
            onDateClick(key);
          });
        }
        grid.appendChild(cell);
      }
    }
    render();
    return render;
  },

  daysUntil(dateStr) {
    if (!dateStr) return null;
    const today = new Date(Utils.todayStr());
    const target = new Date(dateStr);
    return Math.round((target - today) / 86400000);
  },

  formatDday(dateStr) {
    const d = Utils.daysUntil(dateStr);
    if (d === null) return '';
    if (d === 0) return 'D-day';
    if (d > 0) return `D-${d}`;
    return `D+${-d}`;
  },

  formatDateTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(
      d.getHours()
    ).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  },

  extractWikiLinks(text) {
    if (!text) return [];
    const plain = Utils.stripHtml(text);
    const matches = plain.matchAll(/\[\[([^\[\]]+)\]\]/g);
    return [...matches].map((m) => m[1].trim());
  },

  truncate(str, len) {
    if (!str) return '';
    return str.length > len ? str.slice(0, len) + '…' : str;
  },

  // Strips script/style/embed-like tags, event handler attributes, and javascript: URLs
  // from pasted or externally-sourced HTML before it's inserted into a contenteditable.
  sanitizeHtml(html) {
    if (!html) return '';
    const doc = new DOMParser().parseFromString(html, 'text/html');
    ['script', 'style', 'iframe', 'object', 'embed', 'link', 'meta', 'form', 'input', 'button'].forEach((tag) => {
      doc.querySelectorAll(tag).forEach((el) => el.remove());
    });
    doc.querySelectorAll('*').forEach((el) => {
      [...el.attributes].forEach((attr) => {
        const name = attr.name.toLowerCase();
        const value = attr.value.trim().toLowerCase();
        if (name.startsWith('on') || ((name === 'href' || name === 'src') && value.startsWith('javascript:'))) {
          el.removeAttribute(attr.name);
        }
      });
    });
    return doc.body.innerHTML;
  },

  // Short two-tone "done" chime for the timer, synthesized so no audio asset is needed.
  beep() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      [0, 0.18].forEach((delay) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = 880;
        const t0 = ctx.currentTime + delay;
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t0);
        osc.stop(t0 + 0.18);
      });
      setTimeout(() => ctx.close(), 500);
    } catch (e) {}
  },
};
