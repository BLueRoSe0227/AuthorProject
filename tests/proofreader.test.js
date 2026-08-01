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

describe('Proofreader.applyFix', () => {
  it('replaces the matched slice in place, preserving surrounding formatting', () => {
    document.body.innerHTML = '<div id="editor" contenteditable="true">그날 <b>정말</b> 안 됬다.</div>';
    const el = document.getElementById('editor');
    const hit = Proofreader.check(el.textContent).find((i) => i.ruleId === 'doeot');
    const applied = Proofreader.applyFix(el, hit);
    expect(applied).toBe(true);
    expect(el.textContent).toBe('그날 정말 안 됐다.');
    expect(el.querySelector('b').textContent).toBe('정말');
  });

  it('dispatches an input event so the editor autosave pipeline fires', () => {
    document.body.innerHTML = '<div id="editor" contenteditable="true">됬다</div>';
    const el = document.getElementById('editor');
    let fired = false;
    el.addEventListener('input', () => { fired = true; });
    const [hit] = Proofreader.check(el.textContent);
    Proofreader.applyFix(el, hit);
    expect(fired).toBe(true);
  });

  it('is a no-op for issues without a suggestion', () => {
    document.body.innerHTML = '<div id="editor" contenteditable="true">안되는 일</div>';
    const el = document.getElementById('editor');
    const hit = Proofreader.check(el.textContent).find((i) => i.ruleId === 'an-doe');
    const applied = Proofreader.applyFix(el, hit);
    expect(applied).toBe(false);
    expect(el.textContent).toBe('안되는 일');
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

  it('wraps a range that partially overlaps existing formatting via the extract+wrap fallback', () => {
    document.body.innerHTML = '<div id="editor" contenteditable="true">그날 정말 안 <b>됬다</b>.</div>';
    const el = document.getElementById('editor');
    const issues = Proofreader.check(el.textContent);
    expect(() => Proofreader.markIssues(el, issues)).not.toThrow();
    expect(el.textContent).toBe('그날 정말 안 됬다.');
    expect(el.querySelector('.proofread-mark')).toBeTruthy();
    expect(el.querySelector('.proofread-mark b')).toBeTruthy(); // inner <b> formatting preserved
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
