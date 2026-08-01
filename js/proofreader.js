// Rule-based 어문규범 proofreading engine + 표준국어대사전 lookup client.
// The rule set (ProofreaderRules, js/proofreaderRules.js) never touches the network —
// only Proofreader.lookupWord does, via the Netlify Functions proxy at /api/dict
// (see netlify/functions/dictionary.js), so the "맞춤법 검사" flow keeps working even
// when the dictionary API/proxy is unavailable.
const Proofreader = {
  check(text) {
    if (!text) return [];
    const issues = [];
    ProofreaderRules.forEach((rule) => {
      const flags = rule.pattern.flags.includes('g') ? rule.pattern.flags : `${rule.pattern.flags}g`;
      const re = new RegExp(rule.pattern.source, flags);
      let m;
      while ((m = re.exec(text))) {
        issues.push({
          id: `${rule.id}-${m.index}`,
          ruleId: rule.id,
          index: m.index,
          length: m[0].length,
          original: m[0],
          suggestion: rule.fix ? rule.fix(m) : null,
          message: rule.message,
          category: rule.category,
          dictWord: rule.dictWord || null,
        });
        if (m[0].length === 0) re.lastIndex += 1; // guard against zero-length matches looping forever
      }
    });
    issues.sort((a, b) => a.index - b.index);
    return issues;
  },

  // Replaces exactly the [issue.index, issue.index + issue.length) slice of
  // contentEl's text with issue.suggestion, walking text nodes directly so any
  // surrounding formatting (bold/italic spans etc.) is left untouched. Relies on
  // contentEl.textContent being the same string check() scanned — it's always
  // the concatenation of these same text nodes in document order.
  applyFix(contentEl, issue) {
    if (!issue || !issue.suggestion) return false;
    const walker = document.createTreeWalker(contentEl, NodeFilter.SHOW_TEXT);
    const nodes = [];
    let pos = 0;
    let node;
    while ((node = walker.nextNode())) {
      const len = node.textContent.length;
      nodes.push({ node, start: pos, end: pos + len });
      pos += len;
    }

    const targetStart = issue.index;
    const targetEnd = issue.index + issue.length;
    const overlapping = nodes.filter((n) => n.end > targetStart && n.start < targetEnd);
    if (!overlapping.length) return false;

    overlapping.forEach((entry, i) => {
      const full = entry.node.textContent;
      const localStart = Math.max(0, targetStart - entry.start);
      const localEnd = Math.min(full.length, targetEnd - entry.start);
      const prefix = full.slice(0, localStart);
      const suffix = full.slice(localEnd);
      entry.node.textContent = i === 0 ? prefix + issue.suggestion + suffix : prefix + suffix;
    });

    contentEl.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  },

  // method: 'exact' | 'include' | 'start' (표준국어대사전 검색 방식)
  async lookupWord(word, method = 'exact') {
    const q = (word || '').trim();
    if (!q) throw new Error('검색어가 비어 있습니다.');
    const res = await fetch(`/api/dict?q=${encodeURIComponent(q)}&method=${method}`);
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error((data && data.error) || `사전 조회 실패 (${res.status})`);
    return Proofreader._normalize(data);
  },

  // stdict's JSON is XML-derived: a field is an object when there's exactly one
  // result and an array when there's more than one, so both shapes must be handled.
  _normalize(data) {
    const channel = data && data.channel;
    if (!channel || !channel.item) return [];
    const items = Array.isArray(channel.item) ? channel.item : [channel.item];
    return items.map((item) => {
      const senseRaw = item.sense;
      const sense = Array.isArray(senseRaw) ? senseRaw[0] : senseRaw;
      return {
        word: item.word,
        pos: (sense && sense.pos) || item.pos || '',
        definition: (sense && sense.definition) || '',
        link: (sense && sense.link) || item.link || '',
      };
    });
  },
};
