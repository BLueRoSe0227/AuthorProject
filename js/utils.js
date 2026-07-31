const Utils = {
  countWords(text) {
    if (!text) return 0;
    const plain = Utils.stripHtml(text);
    return plain.replace(/\s/g, '').length;
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

  // Renders plain text content (from textarea) as HTML paragraphs with [[links]] resolved
  renderContentHtml(text, resolveLink) {
    const escaped = Utils.escapeHtml(text || '');
    const linked = escaped.replace(/\[\[([^\[\]]+)\]\]/g, (whole, title) => {
      const target = resolveLink ? resolveLink(title.trim()) : null;
      if (target) {
        return `<a href="#" class="wiki-link" data-type="${target.type}" data-id="${target.id}">${Utils.escapeHtml(
          title
        )}</a>`;
      }
      return `<span class="wiki-link wiki-link--missing">${Utils.escapeHtml(title)}</span>`;
    });
    return linked.split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
  },

  uid(prefix = 'id') {
    return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
  },

  truncate(str, len) {
    if (!str) return '';
    return str.length > len ? str.slice(0, len) + '…' : str;
  },
};
