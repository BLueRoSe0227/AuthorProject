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
