// Converts the rich-editor HTML stored per scene into a shared block format, then
// serializes that into Markdown or a .docx (via DocxWriter). PDF export skips the
// block format entirely and reuses the original HTML directly (higher fidelity —
// keeps images/tables) inside a print-styled document via window.print().
const ManuscriptExport = {
  // ---- HTML -> block format ----
  parseRichHtml(html) {
    const container = document.createElement('div');
    container.innerHTML = Utils.sanitizeHtml(html || '');
    const blocks = [];

    function extractRuns(node) {
      const runs = [];
      function walk(n, style) {
        if (n.nodeType === 3) {
          if (n.textContent) runs.push({ text: n.textContent, ...style });
          return;
        }
        if (n.nodeType !== 1) return;
        const tag = n.tagName.toLowerCase();
        if (tag === 'br') { runs.push({ text: '\n' }); return; }
        const next = { ...style };
        if (tag === 'b' || tag === 'strong') next.bold = true;
        if (tag === 'i' || tag === 'em') next.italic = true;
        if (tag === 'u') next.underline = true;
        if (tag === 's' || tag === 'strike' || tag === 'del') next.strike = true;
        n.childNodes.forEach((c) => walk(c, next));
      }
      node.childNodes.forEach((c) => walk(c, {}));
      return runs;
    }

    function processList(listEl, ordered) {
      let i = 1;
      Array.from(listEl.children).forEach((li) => {
        if (li.tagName.toLowerCase() !== 'li') return;
        const runs = extractRuns(li);
        if (runs.length) blocks.push({ type: 'listItem', ordered, index: i, runs });
        i++;
      });
    }

    function processBlockEl(el) {
      const tag = el.tagName.toLowerCase();
      if (tag === 'h1' || tag === 'h2' || tag === 'h3') {
        blocks.push({ type: 'heading', level: Number(tag[1]), runs: extractRuns(el) });
      } else if (tag === 'blockquote') {
        blocks.push({ type: 'blockquote', runs: extractRuns(el) });
      } else if (tag === 'ul') {
        processList(el, false);
      } else if (tag === 'ol') {
        processList(el, true);
      } else if (tag === 'hr') {
        blocks.push({ type: 'hr' });
      } else if (tag === 'table') {
        el.querySelectorAll('tr').forEach((tr) => {
          const cells = Array.from(tr.querySelectorAll('td,th')).map((td) => td.textContent.trim());
          if (cells.some((c) => c)) blocks.push({ type: 'paragraph', runs: [{ text: cells.join(' | ') }] });
        });
      } else if (tag === 'p' || tag === 'div') {
        const runs = extractRuns(el);
        if (runs.some((r) => r.text.trim())) blocks.push({ type: 'paragraph', runs });
      } else {
        Array.from(el.children).forEach(processBlockEl);
      }
    }

    if (!container.children.length && container.textContent.trim()) {
      blocks.push({ type: 'paragraph', runs: extractRuns(container) });
    } else {
      Array.from(container.children).forEach(processBlockEl);
    }
    return blocks;
  },

  // ---- block format -> Markdown ----
  _runsToMarkdown(runs) {
    return (runs || [])
      .map((r) => {
        let t = r.text.replace(/\n/g, '  \n');
        if (r.bold) t = `**${t}**`;
        if (r.italic) t = `*${t}*`;
        if (r.strike) t = `~~${t}~~`;
        return t;
      })
      .join('');
  },

  blocksToMarkdown(blocks) {
    const lines = [];
    blocks.forEach((b) => {
      if (b.type === 'heading') lines.push(`${'#'.repeat(Math.min(6, b.level))} ${ManuscriptExport._runsToMarkdown(b.runs)}`);
      else if (b.type === 'blockquote') lines.push(`> ${ManuscriptExport._runsToMarkdown(b.runs)}`);
      else if (b.type === 'listItem') lines.push(`${b.ordered ? `${b.index}.` : '-'} ${ManuscriptExport._runsToMarkdown(b.runs)}`);
      else if (b.type === 'hr') lines.push('---');
      else lines.push(ManuscriptExport._runsToMarkdown(b.runs));
      lines.push('');
    });
    return lines.join('\n');
  },

  sanitizeFilename(name) {
    return (name || '제목없음').replace(/[\\/:*?"<>|]/g, '_').trim().slice(0, 80) || '제목없음';
  },

  downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  },

  openPrintView(work, chapters, scenesByChapter) {
    const parts = [`<h1 class="export-title">${Utils.escapeHtml(work.title)}</h1>`];
    [...chapters].sort((a, b) => a.order - b.order).forEach((ch) => {
      parts.push(`<h1>${Utils.escapeHtml(ch.title)}</h1>`);
      [...(scenesByChapter[ch.id] || [])].sort((a, b) => a.order - b.order).forEach((sc) => {
        parts.push(`<h2>${Utils.escapeHtml(sc.title)}</h2>`);
        parts.push(`<div class="scene">${Utils.sanitizeHtml(sc.content || '')}</div>`);
      });
    });
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${Utils.escapeHtml(work.title)}</title>
<style>
  body { font-family: 'Malgun Gothic', 'Pretendard', sans-serif; line-height: 1.8; max-width: 720px; margin: 40px auto; color: #111; padding: 0 20px; }
  h1 { page-break-before: always; margin-top: 0; }
  h1.export-title { page-break-before: avoid; text-align: center; font-size: 1.8em; margin-bottom: 2em; }
  h2 { margin-top: 2em; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
  img { max-width: 100%; }
  table.rich-table { border-collapse: collapse; }
  table.rich-table td { border: 1px solid #999; padding: 4px 8px; }
  blockquote { border-left: 3px solid #999; margin: 1em 0; padding: 2px 16px; color: #555; }
  @media print { h1, h2 { page-break-after: avoid; } }
</style></head><body>${parts.join('')}</body></html>`;
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank');
    if (!win) {
      UI.toast('팝업이 차단되었어요. 브라우저에서 팝업을 허용한 뒤 다시 시도해주세요', 'error');
      return;
    }
    win.addEventListener('load', () => win.print());
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  },

  async run(work, chapters, scenesByChapter, format) {
    const sortedChapters = [...chapters].sort((a, b) => a.order - b.order);
    const filenameBase = ManuscriptExport.sanitizeFilename(work.title);

    if (format === 'pdf') {
      ManuscriptExport.openPrintView(work, sortedChapters, scenesByChapter);
      App.recordExport();
      return;
    }

    const blocks = [];
    sortedChapters.forEach((ch) => {
      blocks.push({ type: 'heading', level: 1, runs: [{ text: ch.title }] });
      [...(scenesByChapter[ch.id] || [])].sort((a, b) => a.order - b.order).forEach((sc) => {
        blocks.push({ type: 'heading', level: 2, runs: [{ text: sc.title }] });
        blocks.push(...ManuscriptExport.parseRichHtml(sc.content));
      });
    });

    if (format === 'md') {
      const md = `# ${work.title}\n\n${ManuscriptExport.blocksToMarkdown(blocks)}`;
      ManuscriptExport.downloadBlob(new Blob([md], { type: 'text/markdown;charset=utf-8' }), `${filenameBase}.md`);
    } else if (format === 'docx') {
      const blob = DocxWriter.build(work.title, [
        { type: 'heading', level: 1, runs: [{ text: work.title }] },
        { type: 'hr' },
        ...blocks,
      ]);
      ManuscriptExport.downloadBlob(blob, `${filenameBase}.docx`);
    }
    App.recordExport();
  },
};

Views.exportManuscriptFlow = async function (workId) {
  const bundle = await Models.getWorkBundle(workId);
  if (!bundle.chapters.length) {
    UI.toast('내보낼 챕터가 없습니다');
    return;
  }
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div class="form-field">
      <label>범위</label>
      <select class="input" id="exportScope">
        <option value="all">전체 작품 (모든 챕터)</option>
        ${bundle.chapters.map((ch) => `<option value="${ch.id}">${Utils.escapeHtml(ch.title)}만</option>`).join('')}
      </select>
    </div>
    <div class="form-field">
      <label>형식</label>
      <div class="radio-group" id="exportFormatGroup">
        <label class="radio-chip radio-chip--selected" data-value="md">
          <input type="radio" name="exportFormat" value="md" checked>
          <strong>Markdown</strong>
          <span>.md 텍스트 파일, 플랫폼 업로드용 원문에 적합</span>
        </label>
        <label class="radio-chip" data-value="pdf">
          <input type="radio" name="exportFormat" value="pdf">
          <strong>PDF</strong>
          <span>인쇄 대화상자에서 "PDF로 저장" 선택 (이미지·표 포함)</span>
        </label>
        <label class="radio-chip" data-value="docx">
          <input type="radio" name="exportFormat" value="docx">
          <strong>Word (.docx)</strong>
          <span>투고용 원고 파일, 이미지·표는 제외됩니다</span>
        </label>
      </div>
    </div>
  `;
  Views.bindLengthRadioGroup(wrap); // generic radio-chip toggle, name-agnostic

  const { close } = UI.openModal({
    title: '📤 원고 내보내기',
    bodyEl: wrap,
    actions: [
      { label: '취소', onClick: () => close() },
      {
        label: '내보내기',
        primary: true,
        onClick: async () => {
          const scope = wrap.querySelector('#exportScope').value;
          const format = wrap.querySelector('input[name="exportFormat"]:checked').value;
          const chapters = scope === 'all' ? bundle.chapters : bundle.chapters.filter((c) => c.id === scope);
          close();
          await ManuscriptExport.run(bundle.work, chapters, bundle.scenesByChapter, format);
          if (format !== 'pdf') UI.toast('내보내기 완료');
        },
      },
    ],
  });
};
