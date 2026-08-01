// Rule-based 어문규범 proofreading engine + 표준국어대사전 lookup client.
// The rule set (ProofreaderRules, js/proofreaderRules.js) never touches the network —
// only Proofreader.lookupWord does, via the Netlify Functions proxy at /api/dict
// (see netlify/functions/dictionary.js), so the "맞춤법 검사" flow keeps working even
// when the dictionary API/proxy is unavailable.
const Proofreader = {
  // Kept in sync with MAX_INPUT_LENGTH in netlify/functions/spellcheck.js (that
  // function truncates too, but checking here lets the UI show a warning instead
  // of silently scanning less text than the user expects).
  ONLINE_CHECK_LIMIT: 2000,

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

  // Combines already-sorted issue lists (e.g. from check() and checkOnline()) into
  // one, greedily dropping later entries whose range overlaps an already-kept one.
  // Needed because local rules and the AI checker can flag the same/overlapping
  // text, and markIssues() can't safely wrap a range that partially overlaps an
  // existing wrapper span.
  mergeIssues(...lists) {
    const all = [].concat(...lists).sort((a, b) => a.index - b.index);
    const kept = [];
    let lastEnd = -1;
    all.forEach((issue) => {
      if (issue.index >= lastEnd) {
        kept.push(issue);
        lastEnd = issue.index + issue.length;
      }
    });
    return kept;
  },

  // Wraps each issue's [index, index+length) range in <span class="proofread-mark
  // proofread-mark--{category}" data-issue-id> for the inline review UI (see
  // js/views/manuscript.js). Unlike applyFix this never changes the text (pure
  // wrapping), so issues can be marked in any order without invalidating each
  // other's offsets — the caller just needs to have resolved overlaps first (see
  // mergeIssues), since a range that only partially overlaps an existing wrapper
  // span can't be wrapped safely.
  markIssues(contentEl, issues) {
    issues.forEach((issue) => {
      const start = offsetToNodeOffset(contentEl, issue.index);
      const end = offsetToNodeOffset(contentEl, issue.index + issue.length);
      if (!start || !end) return;
      const range = document.createRange();
      range.setStart(start.node, start.offset);
      range.setEnd(end.node, end.offset);
      const span = document.createElement('span');
      span.className = `proofread-mark proofread-mark--${issue.category}`;
      span.dataset.issueId = issue.id;
      try {
        range.surroundContents(span);
      } catch (e) {
        // Range crosses a partial element boundary (e.g. half-bold text) — same
        // extract+wrap+reinsert fallback richEditor.js's applyInlineStyle uses for
        // this exact situation.
        const frag = range.extractContents();
        span.appendChild(frag);
        range.insertNode(span);
      }
    });
  },

  // "원문 유지" — removes the wrapper but keeps its contents (and their formatting)
  // exactly as they were, unlike applyMark which discards them.
  unwrapMark(span) {
    const parent = span.parentNode;
    if (!parent) return;
    while (span.firstChild) parent.insertBefore(span.firstChild, span);
    parent.removeChild(span);
    parent.normalize();
  },

  // "수정안 반영" — replaces the marked span's content with the suggestion, then
  // unwraps it back into plain surrounding text.
  applyMark(span, suggestion) {
    span.textContent = suggestion;
    Proofreader.unwrapMark(span);
  },

  // Called when review ends — strips every remaining mark back to plain text
  // (content unchanged) so nothing review-only ever reaches scene.content on save.
  unmarkAll(contentEl) {
    contentEl.querySelectorAll('.proofread-mark').forEach((span) => Proofreader.unwrapMark(span));
  },

  // Belt-and-suspenders guard for the save path (see js/views/manuscript.js's
  // debouncedSave): review marks are meant to be purely transient UI state, never
  // persisted, but a save can be triggered mid-review by things unrelated to the
  // review flow itself (the user typing elsewhere in the scene while marks are
  // still showing). Rather than trying to guarantee marks are always gone from the
  // live DOM by the time any such save fires, every save instead persists a
  // stripped COPY — marks keep showing in the live editor for continued review.
  stripMarksFromHtml(html) {
    if (!html || !html.includes('proofread-mark')) return html; // fast path
    const div = document.createElement('div');
    div.innerHTML = html;
    Proofreader.unmarkAll(div);
    return div.innerHTML;
  },

  // Sentence-level check via Naver's (unofficial) spell-checker, proxied through
  // netlify/functions/spellcheck.js. Complements check() — it catches context-
  // dependent errors no fixed rule can (e.g. "저녁밥을 멀다", a real word used in
  // the wrong place) — but it's a third-party service that can fail or change
  // shape without notice, so callers must handle rejection independently of the
  // always-available local check().
  async checkOnline(text) {
    const truncated = (text || '').length > Proofreader.ONLINE_CHECK_LIMIT;
    const body = (text || '').slice(0, Proofreader.ONLINE_CHECK_LIMIT);
    const res = await fetch('/api/spellcheck', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: body }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error((data && data.error) || `맞춤법 검사 실패 (${res.status})`);
    const issues = (data.issues || []).map((issue) => ({
      ...issue,
      id: `naver-${issue.index}-${issue.original}`,
      ruleId: 'naver',
      dictWord: issue.category === 'spelling' && issue.suggestion && !issue.suggestion.includes(' ') ? issue.suggestion : null,
    }));
    issues.sort((a, b) => a.index - b.index);
    return { issues, truncated };
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

// Converts a flat character offset (relative to contentEl.textContent — the same
// coordinate space check()/checkOnline() results use) into a {node, offset} pair
// usable with Range.setStart/setEnd.
function offsetToNodeOffset(contentEl, charOffset) {
  const walker = document.createTreeWalker(contentEl, NodeFilter.SHOW_TEXT);
  let pos = 0;
  let node;
  let last = null;
  while ((node = walker.nextNode())) {
    const len = node.textContent.length;
    if (charOffset <= pos + len) return { node, offset: charOffset - pos };
    pos += len;
    last = node;
  }
  return last ? { node: last, offset: last.textContent.length } : null;
}
