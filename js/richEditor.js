// A small contenteditable-based rich text editor (bold/italic/lists/headings/
// alignment/links/images/tables) built without any external library, since this
// project has no bundler. Multiple independent instances can be mounted at once
// (needed for the manuscript split view).
const RichEditor = {
  mount(container, { content = '', onChange, getWikiCandidates, placeholder = '이 장면의 이야기를 적어보세요...' } = {}) {
    const wrap = document.createElement('div');
    wrap.className = 'rich-editor';
    wrap.innerHTML = `
      <div class="rich-toolbar">
        <select class="rich-toolbar__select" data-cmd="formatBlock" title="문단 스타일">
          <option value="p">본문</option>
          <option value="h1">제목 1</option>
          <option value="h2">제목 2</option>
          <option value="h3">제목 3</option>
          <option value="blockquote">인용구</option>
        </select>
        <select class="rich-toolbar__select rich-toolbar__select--font" id="richFontSelect" title="선택한 글자의 글꼴">
          <option value="">글꼴</option>
          ${Object.keys(PREF_FONT_STACKS).map((key) => `<option value="${PREF_FONT_STACKS[key]}" style="font-family:${PREF_FONT_STACKS[key]}">${PREF_FONT_LABELS[key]}</option>`).join('')}
        </select>
        <select class="rich-toolbar__select" id="richSizeSelect" title="선택한 글자의 크기">
          <option value="">크기</option>
          ${[12, 14, 16, 18, 20, 24, 28].map((px) => `<option value="${px}px">${px}px</option>`).join('')}
        </select>
        <span class="rich-toolbar__sep"></span>
        <button type="button" class="rich-btn" data-cmd="bold" title="굵게 (Ctrl+B)"><b>B</b></button>
        <button type="button" class="rich-btn" data-cmd="italic" title="기울임 (Ctrl+I)"><i>I</i></button>
        <button type="button" class="rich-btn" data-cmd="underline" title="밑줄 (Ctrl+U)"><u>U</u></button>
        <button type="button" class="rich-btn" data-cmd="strikeThrough" title="취소선"><s>S</s></button>
        <span class="rich-toolbar__sep"></span>
        <button type="button" class="rich-btn" data-cmd="insertUnorderedList" title="글머리 기호 목록">•≡</button>
        <button type="button" class="rich-btn" data-cmd="insertOrderedList" title="번호 목록">1≡</button>
        <span class="rich-toolbar__sep"></span>
        <button type="button" class="rich-btn" data-cmd="justifyLeft" title="왼쪽 정렬">◀≡</button>
        <button type="button" class="rich-btn" data-cmd="justifyCenter" title="가운데 정렬">≡</button>
        <button type="button" class="rich-btn" data-cmd="justifyRight" title="오른쪽 정렬">▶≡</button>
        <span class="rich-toolbar__sep"></span>
        <button type="button" class="rich-btn" data-action="link" title="링크 삽입">🔗</button>
        <button type="button" class="rich-btn" data-cmd="insertHorizontalRule" title="구분선">―</button>
        <button type="button" class="rich-btn" data-action="image" title="이미지 삽입">🖼</button>
        <button type="button" class="rich-btn" data-action="table" title="표 삽입">▦</button>
        <span class="rich-toolbar__sep"></span>
        <button type="button" class="rich-btn" data-action="dict" title="선택한 단어를 표준국어대사전에서 찾기">🔎</button>
        <span class="rich-toolbar__sep rich-toolbar__sep--table-only"></span>
        <button type="button" class="rich-btn rich-btn--sm" data-action="addRow" title="행 추가">+행</button>
        <button type="button" class="rich-btn rich-btn--sm" data-action="addCol" title="열 추가">+열</button>
        <button type="button" class="rich-btn rich-btn--sm" data-action="removeRow" title="행 삭제">-행</button>
        <button type="button" class="rich-btn rich-btn--sm" data-action="removeCol" title="열 삭제">-열</button>
        <span class="rich-toolbar__sep"></span>
        <button type="button" class="rich-btn" data-cmd="undo" title="실행 취소">↶</button>
        <button type="button" class="rich-btn" data-cmd="redo" title="다시 실행">↷</button>
        <input type="file" class="rich-image-input" accept="image/*" hidden>
      </div>
      <div class="rich-content" contenteditable="true" data-placeholder="${Utils.escapeHtml(placeholder)}"></div>
    `;
    container.innerHTML = '';
    container.appendChild(wrap);

    const contentEl = wrap.querySelector('.rich-content');
    const imageInput = wrap.querySelector('.rich-image-input');
    contentEl.innerHTML = content || '';

    function updateEmptyState() {
      contentEl.classList.toggle('rich-content--empty', !contentEl.textContent.trim() && !contentEl.querySelector('img,table'));
    }
    updateEmptyState();

    function notifyChange() {
      updateEmptyState();
      if (onChange) onChange(contentEl.innerHTML);
    }

    function saveSelection() {
      const sel = window.getSelection();
      if (!sel.rangeCount || !contentEl.contains(sel.anchorNode)) return null;
      return sel.getRangeAt(0).cloneRange();
    }
    function restoreSelection(range) {
      if (!range) return;
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }

    function exec(cmd, value = null) {
      contentEl.focus();
      document.execCommand(cmd, false, value);
      notifyChange();
    }

    // execCommand('fontName'/'fontSize') only accepts legacy values (fontSize is
    // limited to the numbers 1-7, not real px), so selection-scoped font changes are
    // applied by hand: wrap the selected range in a styled span.
    function applyInlineStyle(styleProp, value) {
      const sel = window.getSelection();
      if (!sel.rangeCount || sel.isCollapsed) {
        UI.toast('먼저 텍스트를 선택해주세요');
        return;
      }
      const range = sel.getRangeAt(0);
      if (!contentEl.contains(range.commonAncestorContainer)) return;
      contentEl.focus();
      const span = document.createElement('span');
      span.style[styleProp] = value;
      try {
        range.surroundContents(span);
      } catch (e) {
        // Selection crosses a partial element boundary (surroundContents can't
        // handle that) — fall back to extract + wrap + reinsert.
        const frag = range.extractContents();
        span.appendChild(frag);
        range.insertNode(span);
      }
      const newRange = document.createRange();
      newRange.selectNodeContents(span);
      sel.removeAllRanges();
      sel.addRange(newRange);
      notifyChange();
    }

    // ---- Table helpers ----
    function getCellContext() {
      const sel = window.getSelection();
      if (!sel.rangeCount) return null;
      let node = sel.getRangeAt(0).startContainer;
      if (node.nodeType === 3) node = node.parentElement;
      if (!node || !node.closest) return null;
      const cell = node.closest('td,th');
      const table = node.closest('table.rich-table');
      if (!cell || !table || !contentEl.contains(table)) return null;
      return { cell, table, row: cell.parentElement };
    }

    function insertTable() {
      contentEl.focus();
      const rows = Array.from({ length: 3 }, () => `<tr>${Array.from({ length: 3 }, () => '<td><br></td>').join('')}</tr>`).join('');
      document.execCommand('insertHTML', false, `<table class="rich-table"><tbody>${rows}</tbody></table><p><br></p>`);
      notifyChange();
    }

    function addRow() {
      const ctx = getCellContext();
      if (!ctx) { UI.toast('표 안에 커서를 두세요'); return; }
      const newRow = document.createElement('tr');
      for (let i = 0; i < ctx.row.children.length; i++) {
        const td = document.createElement('td');
        td.innerHTML = '<br>';
        newRow.appendChild(td);
      }
      ctx.row.after(newRow);
      notifyChange();
    }
    function addCol() {
      const ctx = getCellContext();
      if (!ctx) { UI.toast('표 안에 커서를 두세요'); return; }
      const idx = [...ctx.row.children].indexOf(ctx.cell);
      ctx.table.querySelectorAll('tr').forEach((tr) => {
        const td = document.createElement('td');
        td.innerHTML = '<br>';
        const ref = tr.children[idx];
        if (ref) ref.after(td); else tr.appendChild(td);
      });
      notifyChange();
    }
    function removeRow() {
      const ctx = getCellContext();
      if (!ctx) { UI.toast('표 안에 커서를 두세요'); return; }
      const tbody = ctx.row.parentElement;
      if (tbody.children.length <= 1) ctx.table.remove();
      else ctx.row.remove();
      notifyChange();
    }
    function removeCol() {
      const ctx = getCellContext();
      if (!ctx) { UI.toast('표 안에 커서를 두세요'); return; }
      const idx = [...ctx.row.children].indexOf(ctx.cell);
      if (ctx.row.children.length <= 1) ctx.table.remove();
      else ctx.table.querySelectorAll('tr').forEach((tr) => { if (tr.children[idx]) tr.children[idx].remove(); });
      notifyChange();
    }

    async function insertLink() {
      const range = saveSelection();
      const url = await UI.prompt('링크 URL을 입력하세요', 'https://', { title: '링크 삽입' });
      if (!url || !url.trim()) return;
      restoreSelection(range);
      exec('createLink', url.trim());
    }

    function insertImage() {
      imageInput.value = '';
      imageInput.click();
    }
    imageInput.addEventListener('change', () => {
      const file = imageInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => exec('insertImage', reader.result);
      reader.readAsDataURL(file);
    });

    async function lookupSelectionInDictionary() {
      const sel = window.getSelection();
      const text = sel && !sel.isCollapsed && contentEl.contains(sel.anchorNode) ? sel.toString().trim() : '';
      if (!text) { UI.toast('사전에서 찾아볼 단어를 먼저 선택해주세요'); return; }

      const wrap = document.createElement('div');
      wrap.className = 'dict-lookup';
      wrap.innerHTML = `<p class="muted">"${Utils.escapeHtml(text)}" 검색 중...</p>`;
      UI.openModal({ title: '표준국어대사전', bodyEl: wrap, width: '420px' });

      try {
        let results = await Proofreader.lookupWord(text, 'exact');
        if (!results.length) results = await Proofreader.lookupWord(text, 'include');
        if (!results.length) {
          wrap.innerHTML = `<p class="muted">"${Utils.escapeHtml(text)}"에 대한 검색 결과가 없습니다.</p>`;
          return;
        }
        wrap.innerHTML = '';
        results.slice(0, 8).forEach((r) => {
          const item = document.createElement('div');
          item.className = 'dict-lookup__item';
          item.innerHTML = `<strong>${Utils.escapeHtml(r.word)}</strong> <span class="muted">${Utils.escapeHtml(r.pos)}</span><p>${Utils.escapeHtml(r.definition)}</p>`;
          wrap.appendChild(item);
        });
      } catch (err) {
        wrap.innerHTML = `<p class="muted">사전 조회에 실패했습니다: ${Utils.escapeHtml(err.message)}</p>`;
      }
    }

    const actionHandlers = { link: insertLink, image: insertImage, table: insertTable, addRow, addCol, removeRow, removeCol, dict: lookupSelectionInDictionary };

    wrap.querySelectorAll('[data-cmd]').forEach((btn) => {
      if (btn.tagName === 'SELECT') {
        btn.addEventListener('change', () => exec(btn.dataset.cmd, btn.value));
        return;
      }
      btn.addEventListener('mousedown', (e) => e.preventDefault()); // keep selection alive
      btn.addEventListener('click', () => exec(btn.dataset.cmd));
    });
    wrap.querySelectorAll('[data-action]').forEach((btn) => {
      btn.addEventListener('mousedown', (e) => e.preventDefault());
      btn.addEventListener('click', () => actionHandlers[btn.dataset.action]());
    });

    // Selects must NOT get the buttons' mousedown-preventDefault treatment (that
    // would stop the native dropdown from opening at all — see the `data-cmd`
    // wiring below, which already special-cases SELECT for the same reason).
    // Opening the dropdown still shifts focus away from contentEl though, so the
    // in-progress text selection is saved on mousedown and restored before acting.
    const fontSelect = wrap.querySelector('#richFontSelect');
    const sizeSelect = wrap.querySelector('#richSizeSelect');
    let savedFontRange = null;
    fontSelect.addEventListener('mousedown', () => { savedFontRange = saveSelection(); });
    fontSelect.addEventListener('change', () => {
      if (fontSelect.value) {
        restoreSelection(savedFontRange);
        applyInlineStyle('fontFamily', fontSelect.value);
      }
      fontSelect.value = '';
    });
    let savedSizeRange = null;
    sizeSelect.addEventListener('mousedown', () => { savedSizeRange = saveSelection(); });
    sizeSelect.addEventListener('change', () => {
      if (sizeSelect.value) {
        restoreSelection(savedSizeRange);
        applyInlineStyle('fontSize', sizeSelect.value);
      }
      sizeSelect.value = '';
    });

    contentEl.addEventListener('input', notifyChange);

    contentEl.addEventListener('paste', (e) => {
      e.preventDefault();
      const html = e.clipboardData.getData('text/html');
      if (html) {
        document.execCommand('insertHTML', false, Utils.sanitizeHtml(html));
      } else {
        document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
      }
      notifyChange();
    });

    function refreshToolbarState() {
      if (document.activeElement !== contentEl) return;
      wrap.querySelectorAll('.rich-btn[data-cmd]').forEach((btn) => {
        let active = false;
        try { active = document.queryCommandState(btn.dataset.cmd); } catch (e) {}
        btn.classList.toggle('rich-btn--active', active);
      });
    }
    const selectionHandler = () => refreshToolbarState();
    document.addEventListener('selectionchange', selectionHandler);

    if (getWikiCandidates) attachWikiAutocompleteRich(contentEl, getWikiCandidates, notifyChange);

    return {
      getHTML: () => contentEl.innerHTML,
      setHTML: (html) => { contentEl.innerHTML = html || ''; updateEmptyState(); },
      focus: () => contentEl.focus(),
      el: contentEl,
      destroy: () => document.removeEventListener('selectionchange', selectionHandler),
    };
  },
};

// contenteditable analog of UI.attachWikiAutocomplete (which only works with
// textarea/input's .value + selectionStart). Anchored to the bottom of the
// editor like the textarea version, rather than tracking caret position.
function attachWikiAutocompleteRich(el, getCandidatesFn, onInsert) {
  const box = document.createElement('div');
  box.className = 'wiki-autocomplete';
  box.hidden = true;
  const parent = el.closest('.rich-editor');
  if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';
  parent.appendChild(box);

  function getTriggerInfo() {
    const sel = window.getSelection();
    if (!sel.rangeCount) return null;
    const range = sel.getRangeAt(0);
    if (!el.contains(range.startContainer) || range.startContainer.nodeType !== 3) return null;
    const text = range.startContainer.textContent.slice(0, range.startOffset);
    const lastOpen = text.lastIndexOf('[[');
    if (lastOpen === -1) return null;
    const between = text.slice(lastOpen + 2);
    if (between.includes(']]')) return null;
    return { node: range.startContainer, caretOffset: range.startOffset, start: lastOpen, query: between };
  }

  async function update() {
    const info = getTriggerInfo();
    if (!info) { box.hidden = true; return; }
    const candidates = await getCandidatesFn();
    const q = info.query.toLowerCase();
    const filtered = candidates.filter((c) => c.toLowerCase().includes(q)).slice(0, 8);
    if (!filtered.length) { box.hidden = true; return; }
    box.innerHTML = '';
    filtered.forEach((title) => {
      const item = document.createElement('div');
      item.className = 'wiki-autocomplete__item';
      item.textContent = title;
      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const { node, caretOffset, start } = info;
        const fullText = node.textContent;
        const before = fullText.slice(0, start);
        const after = fullText.slice(caretOffset);
        const alreadyClosed = after.startsWith(']]');
        const insertion = `[[${title}]]`;
        node.textContent = before + insertion + (alreadyClosed ? after.slice(2) : after);
        const newRange = document.createRange();
        newRange.setStart(node, before.length + insertion.length);
        newRange.collapse(true);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(newRange);
        box.hidden = true;
        el.focus();
        if (onInsert) onInsert();
      });
      box.appendChild(item);
    });
    box.hidden = false;
  }

  el.addEventListener('input', update);
  el.addEventListener('click', update);
  el.addEventListener('keydown', (e) => {
    if (!box.hidden && e.key === 'Escape') box.hidden = true;
  });
  el.addEventListener('blur', () => setTimeout(() => (box.hidden = true), 150));
}
