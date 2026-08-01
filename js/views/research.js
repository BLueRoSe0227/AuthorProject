// 자료 수집: 취재 자료·참고 링크·이미지 등을 리치텍스트 게시글(+첨부파일)로 정리.
// Mirrors js/views/inbox.js's list/board dual view, but the board here is a small,
// self-contained drag implementation rather than reusing MemoCanvas — MemoCanvas is
// tightly coupled to the memos/memoGroups stores, and generalizing it would risk
// regressing the memo board for a feature that only needs simple free positioning.
Views.research = async function (workId) {
  const content = document.getElementById('content');
  const qId = Router.query().get('id');
  const view = Router.query().get('view') || 'list';

  content.innerHTML = `
    <div class="view view--research">
      <header class="view__header">
        <div>
          <h1>📎 자료 수집</h1>
          <p class="muted">취재 자료, 참고 링크, 이미지 등을 정리해두세요.</p>
        </div>
        <div class="char-view-tabs">
          <button class="chip ${view === 'list' ? 'chip--active' : ''}" id="tabList">📋 목록</button>
          <button class="chip ${view === 'board' ? 'chip--active' : ''}" id="tabBoard">🗺️ 보드</button>
        </div>
      </header>
      <div id="researchBody"></div>
    </div>
  `;

  document.getElementById('tabList').addEventListener('click', () => Router.go(`#/work/${workId}/research?view=list`));
  document.getElementById('tabBoard').addEventListener('click', () => Router.go(`#/work/${workId}/research?view=board`));

  if (view === 'board') {
    await renderResearchBoard(workId);
  } else {
    await renderResearchListView(workId, qId);
  }
};

const RESEARCH_MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

// Named uniquely, not just renderListView/renderBoard — see the identical comment
// in js/views/characters.js for why (classic <script> files share one global
// scope, so a same-named function in another view file would silently win).
async function renderResearchListView(workId, qId) {
  const body = document.getElementById('researchBody');
  body.innerHTML = `
    <div class="view--split view--split-inner">
      <div class="side-list" id="researchList">
        <div class="side-list__header">
          <h2>📎 자료</h2>
          <button class="btn btn--ghost btn--sm" id="addPostBtn">+ 추가</button>
        </div>
        <div class="side-list__items" id="researchItems"></div>
      </div>
      <div class="detail-pane" id="researchDetail"></div>
    </div>
  `;

  async function refresh(selectId) {
    const posts = await Models.getResearchPostsForWork(workId);
    const itemsEl = document.getElementById('researchItems');
    itemsEl.innerHTML = '';
    if (!posts.length) {
      itemsEl.innerHTML = `<p class="muted side-list__empty">아직 자료가 없습니다.</p>`;
    }
    posts.forEach((p) => {
      const el = document.createElement('div');
      el.className = 'side-list__item' + (p.id === selectId ? ' side-list__item--active' : '');
      el.innerHTML = `<span class="side-list__item-main"><strong>${Utils.escapeHtml(p.title)}</strong><span class="muted">${Utils.formatDate(p.updatedAt)}</span></span>`;
      el.addEventListener('click', () => Router.go(`#/work/${workId}/research?id=${p.id}`));
      itemsEl.appendChild(el);
    });
    return posts;
  }

  document.getElementById('addPostBtn').addEventListener('click', async () => {
    const p = await Models.createResearchPost(workId);
    await refresh(p.id);
    renderDetail(p);
  });

  function renderEmpty() {
    document.getElementById('researchDetail').innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">📎</div>
        <h3>자료를 선택하거나 추가해보세요</h3>
      </div>`;
  }

  async function renderDetail(p) {
    const detail = document.getElementById('researchDetail');
    detail.innerHTML = `
      <div class="detail-form">
        <div class="detail-form__header">
          <input type="text" class="title-input" id="rTitle" value="${Utils.escapeHtml(p.title)}" placeholder="제목">
          <button class="btn btn--ghost btn--sm btn--danger-text" id="deletePostBtn">삭제</button>
        </div>
        <div class="rich-editor-mount" id="rEditorMount"></div>
        <div class="research-attachments">
          <div class="research-attachments__header">
            <span class="muted">첨부파일</span>
            <label class="btn btn--ghost btn--sm" for="attachInput">+ 파일 첨부</label>
            <input type="file" id="attachInput" hidden multiple>
          </div>
          <div class="research-attachments__list" id="attachList"></div>
        </div>
        <span class="save-indicator" id="rSaveIndicator" aria-live="polite">저장됨</span>
      </div>
    `;

    const titleInput = detail.querySelector('#rTitle');
    const indicator = detail.querySelector('#rSaveIndicator');

    RichEditor.mount(detail.querySelector('#rEditorMount'), {
      content: p.content,
      placeholder: '취재 내용, 참고 링크, 메모를 자유롭게 적어보세요...',
      onChange: Utils.debounce(async (html) => {
        indicator.textContent = '저장 중...';
        await Models.updateResearchPost(p.id, { content: html });
        indicator.textContent = '저장됨 · 방금';
      }, 600),
    });

    titleInput.addEventListener('input', Utils.debounce(async () => {
      const t = titleInput.value.trim() || '제목 없는 자료';
      await Models.updateResearchPost(p.id, { title: t });
      await refresh(p.id);
    }, 600));

    function renderAttachments() {
      const listEl = detail.querySelector('#attachList');
      listEl.innerHTML = '';
      if (!p.attachments.length) {
        listEl.innerHTML = `<p class="muted">첨부된 파일이 없습니다.</p>`;
        return;
      }
      p.attachments.forEach((a, idx) => {
        const item = document.createElement('div');
        item.className = 'research-attachment';
        item.innerHTML = `
          <a href="${a.dataUrl}" download="${Utils.escapeHtml(a.name)}">${Utils.escapeHtml(a.name)}</a>
          <span class="muted">${Math.max(1, Math.round(a.size / 1024))}KB</span>
          <button class="icon-btn remove-attach-btn" title="삭제">✕</button>
        `;
        item.querySelector('.remove-attach-btn').addEventListener('click', async () => {
          p.attachments.splice(idx, 1);
          await Models.updateResearchPost(p.id, { attachments: p.attachments });
          renderAttachments();
        });
        listEl.appendChild(item);
      });
    }
    renderAttachments();

    detail.querySelector('#attachInput').addEventListener('change', async (e) => {
      const files = [...e.target.files];
      for (const file of files) {
        if (file.size > RESEARCH_MAX_ATTACHMENT_BYTES) {
          UI.toast(`"${file.name}"은 5MB를 초과해 첨부할 수 없습니다`, 'error');
          continue;
        }
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(file);
        });
        p.attachments.push({ name: file.name, type: file.type, dataUrl, size: file.size });
      }
      await Models.updateResearchPost(p.id, { attachments: p.attachments });
      renderAttachments();
      e.target.value = '';
    });

    detail.querySelector('#deletePostBtn').addEventListener('click', async () => {
      const ok = await UI.confirm(`"${p.title}" 자료를 삭제할까요?`, { title: '자료 삭제', confirmLabel: '삭제', danger: true });
      if (!ok) return;
      await Models.deleteResearchPost(p.id);
      UI.toast('삭제되었습니다');
      await refresh(null);
      Router.go(`#/work/${workId}/research`);
    });
  }

  const posts = await refresh(qId);
  if (qId) {
    const p = posts.find((x) => x.id === qId) || (await DB.get('researchPosts', qId));
    if (p) renderDetail(p);
    else renderEmpty();
  } else {
    renderEmpty();
  }
}

async function renderResearchBoard(workId) {
  const body = document.getElementById('researchBody');
  body.innerHTML = `<div class="research-board" id="researchBoard"></div>`;
  const boardEl = document.getElementById('researchBoard');
  const posts = await Models.getResearchPostsForWork(workId);

  if (!posts.length) {
    boardEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">📎</div>
        <h3>자료를 먼저 추가해보세요</h3>
        <p class="muted">목록 탭에서 자료를 추가하면 여기서 자유롭게 배치할 수 있어요.</p>
      </div>`;
    return;
  }

  posts.forEach((p, i) => {
    const hasSavedPos = typeof p.boardX === 'number' && typeof p.boardY === 'number';
    const x = hasSavedPos ? p.boardX : 20 + (i % 4) * 240;
    const y = hasSavedPos ? p.boardY : 20 + Math.floor(i / 4) * 160;

    const excerpt = Utils.truncate(Utils.stripHtml(p.content), 80);
    const card = document.createElement('div');
    card.className = 'research-board-card';
    card.style.left = `${x}px`;
    card.style.top = `${y}px`;
    card.innerHTML = `
      <div class="research-board-card__title">${Utils.escapeHtml(p.title)}</div>
      <div class="research-board-card__excerpt">${excerpt ? Utils.escapeHtml(excerpt) : '<span class="muted">내용 없음</span>'}</div>
      ${p.attachments.length ? `<div class="research-board-card__attach muted">📎 ${p.attachments.length}개</div>` : ''}
    `;

    let dragMoved = false;
    card.addEventListener('mousedown', (e) => {
      e.preventDefault();
      dragMoved = false;
      const startX = e.clientX;
      const startY = e.clientY;
      const origLeft = card.offsetLeft;
      const origTop = card.offsetTop;
      function onMove(ev) {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragMoved = true;
        card.style.left = `${origLeft + dx}px`;
        card.style.top = `${origTop + dy}px`;
      }
      function onUp() {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        if (dragMoved) Models.updateResearchPost(p.id, { boardX: card.offsetLeft, boardY: card.offsetTop });
      }
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    });
    card.addEventListener('click', () => {
      if (dragMoved) return;
      Router.go(`#/work/${workId}/research?view=list&id=${p.id}`);
    });

    boardEl.appendChild(card);
  });
}
