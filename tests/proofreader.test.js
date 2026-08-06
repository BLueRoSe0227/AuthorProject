// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from 'vitest';
import { loadDomScripts } from './helpers/loadDomApp.js';

beforeAll(() => {
  loadDomScripts(['js/utils.js', 'js/proofreaderRules.js', 'js/proofreader.js']);
});

describe('Proofreader.check', () => {
  it('flags a known misspelling with the correct offset and suggestion', () => {
    const text = '그렇게 됬다고 말했다.';
    const issues = Proofreader.check(text);
    const hit = issues.find((i) => i.ruleId === 'doeot');
    expect(hit).toBeTruthy();
    expect(text.slice(hit.index, hit.index + hit.length)).toBe('됬');
    expect(hit.suggestion).toBe('됐');
  });

  it('flags spacing errors around dependent nouns without a dictionary word', () => {
    const issues = Proofreader.check('나는 할수있다고 믿었다.');
    const hit = issues.find((i) => i.ruleId === 'halsu-it');
    expect(hit).toBeTruthy();
    expect(hit.suggestion).toBe('할 수 있');
    expect(hit.dictWord).toBeNull();
  });

  it('surfaces context-dependent rules without an auto-fix suggestion', () => {
    const issues = Proofreader.check('이건 안되는 일이야.');
    const hit = issues.find((i) => i.ruleId === 'an-doe');
    expect(hit).toBeTruthy();
    expect(hit.suggestion).toBeNull();
  });

  it('returns no issues for clean text', () => {
    expect(Proofreader.check('오늘은 날씨가 맑았다.')).toEqual([]);
  });

  it('returns issues sorted by index regardless of rule order', () => {
    // "몇일"(myeochil rule, listed later in ProofreaderRules) sits earlier in the
    // string than "됬"(doeot rule, listed first) — exercises the final sort step.
    const issues = Proofreader.check('몇일이 지나고 됬다.');
    const indices = issues.map((i) => i.index);
    expect(indices).toEqual([...indices].sort((a, b) => a - b));
    expect(issues.map((i) => i.ruleId)).toEqual(['myeochil', 'doeot']);
  });
});

describe('Proofreader.mergeIssues', () => {
  it('drops later issues whose range overlaps an already-kept one', () => {
    const a = [{ index: 0, length: 3 }, { index: 10, length: 2 }];
    const b = [{ index: 1, length: 2 }, { index: 20, length: 1 }]; // overlaps a[0]
    const merged = Proofreader.mergeIssues(a, b);
    expect(merged.map((i) => i.index)).toEqual([0, 10, 20]);
  });

  it('keeps adjacent (non-overlapping, touching) issues', () => {
    const merged = Proofreader.mergeIssues([{ index: 0, length: 3 }], [{ index: 3, length: 2 }]);
    expect(merged.length).toBe(2);
  });
});

describe('Proofreader.markIssues / unwrapMark / applyMark', () => {
  it('wraps each issue range in a categorized span without altering the text', () => {
    document.body.innerHTML = '<div id="editor" contenteditable="true">그렇게 됬다고 말했다.</div>';
    const el = document.getElementById('editor');
    const originalText = el.textContent;
    const issues = Proofreader.check(originalText);
    Proofreader.markIssues(el, issues);
    expect(el.textContent).toBe(originalText);
    const mark = el.querySelector('.proofread-mark');
    expect(mark).toBeTruthy();
    expect(mark.className).toContain('proofread-mark--spelling');
    expect(mark.dataset.issueId).toBe(issues[0].id);
  });

  it('wraps a range that sits inside existing formatting without disturbing it', () => {
    document.body.innerHTML = '<div id="editor" contenteditable="true">그날 정말 안 <b>됬다</b>.</div>';
    const el = document.getElementById('editor');
    const issues = Proofreader.check(el.textContent);
    expect(() => Proofreader.markIssues(el, issues)).not.toThrow();
    expect(el.textContent).toBe('그날 정말 안 됬다.');
    expect(el.querySelector('.proofread-mark')).toBeTruthy();
    // The <b> formatting must survive somewhere around the mark — nesting order
    // (mark inside <b>, or <b> inside mark) isn't the contract, just that neither
    // element nor the bold styling got lost or duplicated.
    expect(el.querySelectorAll('b').length).toBe(1);
    expect(el.querySelector('b').textContent).toBe('됬다');
  });

  it('wraps an issue that starts a new paragraph without corrupting the paragraph boundary', () => {
    // Regression test: contentEl.textContent has no separator at paragraph <div>
    // boundaries, so an issue whose match starts exactly at the first character of
    // the second paragraph produces a charOffset that's ambiguous between "end of
    // paragraph 1's text node" and "start of paragraph 2's text node". Resolving
    // that the wrong way made the range start in paragraph 1 and end in paragraph
    // 2, which surroundContents/extractContents couldn't wrap without corrupting
    // the DOM — splitting/duplicating the paragraph <div>s and visually knocking
    // the matched word onto its own line (the reported bug).
    document.body.innerHTML = '<div id="editor" contenteditable="true">첫 문단 끝.<div>몇일동안 그랬다.</div></div>';
    const el = document.getElementById('editor');
    const issues = Proofreader.check(el.textContent);
    expect(issues.length).toBeGreaterThan(0); // sanity: "몇일" should be flagged
    expect(() => Proofreader.markIssues(el, issues)).not.toThrow();
    expect(el.textContent).toBe('첫 문단 끝.몇일동안 그랬다.');
    // Still exactly two top-level paragraph pieces — the leading bare text node
    // and the one <div> — not split into extra empty/duplicate divs.
    const topLevelDivs = [...el.children].filter((c) => c.tagName === 'DIV');
    expect(topLevelDivs.length).toBe(1);
    expect(topLevelDivs[0].textContent).toBe('몇일동안 그랬다.');
    // And the mark must land inside that second paragraph, not straddling both.
    const mark = el.querySelector('.proofread-mark');
    expect(mark).toBeTruthy();
    expect(topLevelDivs[0].contains(mark)).toBe(true);
  });

  it('skips (does not mark) an issue whose match genuinely straddles two paragraphs', () => {
    // Distinct from the "starts a new paragraph" regression above: here the match
    // isn't ambiguous at a single boundary offset — it's a real 4-char match ("몇일
    // 후") whose first char sits in paragraph 1 and the rest sit in paragraph 2,
    // only possible because contentEl.textContent joins paragraph <div>s with no
    // separator. Wrapping this would force extractContents to restructure the
    // paragraph divs (same corruption class as the other regression), so it must
    // be silently skipped rather than marked.
    document.body.innerHTML = '<div id="editor" contenteditable="true">이건 몇<div>일 후의 일이다.</div></div>';
    const el = document.getElementById('editor');
    const issues = Proofreader.check(el.textContent);
    const hit = issues.find((i) => i.ruleId === 'myeochil');
    expect(hit).toBeTruthy(); // sanity: check() still flags it (it operates on flat text)
    expect(() => Proofreader.markIssues(el, issues)).not.toThrow();
    expect(el.textContent).toBe('이건 몇일 후의 일이다.');
    // No paragraph got split/merged, and the straddling issue was never wrapped.
    const topLevelDivs = [...el.children].filter((c) => c.tagName === 'DIV');
    expect(topLevelDivs.length).toBe(1);
    expect(topLevelDivs[0].textContent).toBe('일 후의 일이다.');
    expect(el.querySelector('.proofread-mark')).toBeNull();
  });

  it('skips (does not mark) an issue whose match straddles two list items', () => {
    // Same class of bug as the paragraph-straddling case above, but for <li>:
    // textContent has no separator between list items either, so "몇" ending one
    // <li> and "일" starting the next can flag "몇일" as if it were contiguous.
    document.body.innerHTML = '<ul id="editor" contenteditable="true"><li>이건 몇</li><li>일 후의 일이다.</li></ul>';
    const el = document.getElementById('editor');
    const issues = Proofreader.check(el.textContent);
    const hit = issues.find((i) => i.ruleId === 'myeochil');
    expect(hit).toBeTruthy();
    expect(() => Proofreader.markIssues(el, issues)).not.toThrow();
    expect(el.textContent).toBe('이건 몇일 후의 일이다.');
    const items = [...el.querySelectorAll('li')];
    expect(items.length).toBe(2);
    expect(items[1].textContent).toBe('일 후의 일이다.');
    expect(el.querySelector('.proofread-mark')).toBeNull();
  });

  it('unwrapMark removes the wrapper but keeps the original text and bold formatting', () => {
    document.body.innerHTML = '<div id="editor" contenteditable="true">그날 <b>됬다</b>.</div>';
    const el = document.getElementById('editor');
    const issues = Proofreader.check(el.textContent);
    Proofreader.markIssues(el, issues);
    const mark = el.querySelector('.proofread-mark');
    Proofreader.unwrapMark(mark);
    expect(el.querySelector('.proofread-mark')).toBeNull();
    expect(el.textContent).toBe('그날 됬다.');
    // The matched range ("됬") only partially overlapped the original <b>, so the
    // extract+wrap fallback split it into two adjacent <b> elements rather than one
    // — same as a browser's native behavior for a partial-selection wrap, and
    // visually identical (no rendering gap between adjacent bold tags). What
    // matters is that every character is still bold, not that it's a single node.
    const boldText = [...el.querySelectorAll('b')].map((b) => b.textContent).join('');
    expect(boldText).toBe('됬다');
  });

  it('applyMark replaces the marked text with the suggestion and unwraps', () => {
    document.body.innerHTML = '<div id="editor" contenteditable="true">그렇게 됬다.</div>';
    const el = document.getElementById('editor');
    const issues = Proofreader.check(el.textContent);
    Proofreader.markIssues(el, issues);
    const mark = el.querySelector('.proofread-mark');
    Proofreader.applyMark(mark, '됐');
    expect(el.querySelector('.proofread-mark')).toBeNull();
    expect(el.textContent).toBe('그렇게 됐다.');
  });

  it('unmarkAll strips every remaining mark back to plain text, leaving content unchanged', () => {
    document.body.innerHTML = '<div id="editor" contenteditable="true">몇일이 지나고 됬다.</div>';
    const el = document.getElementById('editor');
    const originalText = el.textContent;
    const issues = Proofreader.check(originalText);
    Proofreader.markIssues(el, issues);
    expect(el.querySelectorAll('.proofread-mark').length).toBeGreaterThan(0);
    Proofreader.unmarkAll(el);
    expect(el.querySelectorAll('.proofread-mark').length).toBe(0);
    expect(el.textContent).toBe(originalText);
  });
});
