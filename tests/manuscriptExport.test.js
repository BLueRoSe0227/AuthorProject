// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from 'vitest';
import { loadDomScripts } from './helpers/loadDomApp.js';

beforeAll(() => {
  loadDomScripts(['js/utils.js', 'js/zipWriter.js', 'js/docxWriter.js']);
  // manuscriptExport.js also defines Views.exportManuscriptFlow, which we don't
  // exercise here — stub the global it attaches to so the file loads standalone.
  globalThis.Views = {};
  loadDomScripts(['js/manuscriptExport.js']);
});

describe('ManuscriptExport.parseRichHtml', () => {
  it('parses headings, bold/italic runs, and plain paragraphs', () => {
    const blocks = ManuscriptExport.parseRichHtml('<h1>제목</h1><p>평범한 글 <b>굵게</b>와 <i>기울임</i>.</p>');
    expect(blocks[0]).toEqual({ type: 'heading', level: 1, runs: [{ text: '제목' }] });
    expect(blocks[1].type).toBe('paragraph');
    expect(blocks[1].runs).toEqual([
      { text: '평범한 글 ' },
      { text: '굵게', bold: true },
      { text: '와 ' },
      { text: '기울임', italic: true },
      { text: '.' },
    ]);
  });

  it('parses unordered and ordered lists with 1-based indices', () => {
    const blocks = ManuscriptExport.parseRichHtml('<ul><li>하나</li><li>둘</li></ul><ol><li>가</li><li>나</li></ol>');
    expect(blocks).toEqual([
      { type: 'listItem', ordered: false, index: 1, runs: [{ text: '하나' }] },
      { type: 'listItem', ordered: false, index: 2, runs: [{ text: '둘' }] },
      { type: 'listItem', ordered: true, index: 1, runs: [{ text: '가' }] },
      { type: 'listItem', ordered: true, index: 2, runs: [{ text: '나' }] },
    ]);
  });

  it('parses blockquote and hr', () => {
    const blocks = ManuscriptExport.parseRichHtml('<blockquote>인용</blockquote><hr>');
    expect(blocks[0]).toEqual({ type: 'blockquote', runs: [{ text: '인용' }] });
    expect(blocks[1]).toEqual({ type: 'hr' });
  });

  it('flattens tables to pipe-separated paragraph rows', () => {
    const blocks = ManuscriptExport.parseRichHtml('<table><tr><td>A</td><td>B</td></tr><tr><td>C</td><td>D</td></tr></table>');
    expect(blocks).toEqual([
      { type: 'paragraph', runs: [{ text: 'A | B' }] },
      { type: 'paragraph', runs: [{ text: 'C | D' }] },
    ]);
  });

  it('converts <br> inside a paragraph into a newline run', () => {
    const blocks = ManuscriptExport.parseRichHtml('<p>첫 줄<br>둘째 줄</p>');
    expect(blocks[0].runs).toEqual([{ text: '첫 줄' }, { text: '\n' }, { text: '둘째 줄' }]);
  });

  it('strips script tags via the shared sanitizer instead of including them', () => {
    const blocks = ManuscriptExport.parseRichHtml('<p>안전</p><script>alert(1)</script>');
    expect(blocks).toEqual([{ type: 'paragraph', runs: [{ text: '안전' }] }]);
  });

  it('treats a chromium contenteditable-style bare div as a paragraph', () => {
    const blocks = ManuscriptExport.parseRichHtml('<div>줄 하나</div><div>줄 둘</div>');
    expect(blocks).toEqual([
      { type: 'paragraph', runs: [{ text: '줄 하나' }] },
      { type: 'paragraph', runs: [{ text: '줄 둘' }] },
    ]);
  });

  it('falls back to a single paragraph for unwrapped top-level text', () => {
    const blocks = ManuscriptExport.parseRichHtml('그냥 텍스트만 있음');
    expect(blocks).toEqual([{ type: 'paragraph', runs: [{ text: '그냥 텍스트만 있음' }] }]);
  });
});

describe('ManuscriptExport.blocksToMarkdown', () => {
  it('renders headings, bold/italic, quotes, lists, and hr with markdown syntax', () => {
    const md = ManuscriptExport.blocksToMarkdown([
      { type: 'heading', level: 2, runs: [{ text: '소제목' }] },
      { type: 'paragraph', runs: [{ text: '평문 ' }, { text: '굵게', bold: true }] },
      { type: 'blockquote', runs: [{ text: '인용' }] },
      { type: 'listItem', ordered: false, index: 1, runs: [{ text: '항목' }] },
      { type: 'listItem', ordered: true, index: 1, runs: [{ text: '번호 항목' }] },
      { type: 'hr' },
    ]);
    expect(md).toContain('## 소제목');
    expect(md).toContain('평문 **굵게**');
    expect(md).toContain('> 인용');
    expect(md).toContain('- 항목');
    expect(md).toContain('1. 번호 항목');
    expect(md).toContain('---');
  });
});

describe('ManuscriptExport.sanitizeFilename', () => {
  it('replaces filesystem-unsafe characters', () => {
    expect(ManuscriptExport.sanitizeFilename('제목: "특별한" <작품>/무협?')).not.toMatch(/[\\/:*?"<>|]/);
  });

  it('falls back to a placeholder for an empty title', () => {
    expect(ManuscriptExport.sanitizeFilename('')).toBe('제목없음');
  });
});

describe('DocxWriter.build', () => {
  it('produces a non-empty zip blob for a simple block list', async () => {
    const blob = DocxWriter.build('테스트', [
      { type: 'heading', level: 1, runs: [{ text: '제목' }] },
      { type: 'paragraph', runs: [{ text: '본문', bold: true }] },
    ]);
    expect(blob.size).toBeGreaterThan(0);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    // ZIP local file header signature (PK\x03\x04)
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
  });
});
