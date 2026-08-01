// Tracks the currently-registered focus-mode Esc handler across view re-entries,
// since Views.manuscript re-runs on every navigation but document-level listeners
// aren't cleaned up automatically the way element-scoped ones are.
let manuscriptEscHandler = null;

// Display-only char count respecting the 공백 포함/제외 preference — never used for
// the persisted scene.wordCount (see Utils.countChars for why).
function formatCharCount(html) {
  const includeSpaces = Prefs.get().charCountMode === 'include';
  return `${Utils.countChars(html, includeSpaces).toLocaleString()}자`;
}

// Which chapters the user has explicitly collapsed — chapter ids are UUIDs (unique
// across works), so one flat set works fine without per-work namespacing. Default
// (nothing in the set) means every chapter starts expanded.
const COLLAPSED_CHAPTERS_KEY = 'sw-collapsed-chapters';
function getCollapsedChapterIds() {
  try {
    const saved = JSON.parse(localStorage.getItem(COLLAPSED_CHAPTERS_KEY));
    return new Set(Array.isArray(saved) ? saved : []);
  } catch (e) {
    return new Set();
  }
}
function setChapterCollapsed(chapterId, collapsed) {
  const set = getCollapsedChapterIds();
  if (collapsed) set.add(chapterId);
  else set.delete(chapterId);
  localStorage.setItem(COLLAPSED_CHAPTERS_KEY, JSON.stringify([...set]));
}

Views.manuscript = async function (workId, sceneId) {
  const content = document.getElementById('content');
  const bundle = await Models.getWorkBundle(workId);
  if (!bundle.work) { Router.go('#/'); return; }

  content.innerHTML = `
    <div class="view view--manuscript">
      <div class="manuscript-tree" id="manuscriptTree">
        <div class="manuscript-tree__header">
          <h2>원고 구조</h2>
          <button class="btn btn--ghost btn--pal-chapter btn--sm" id="addChapterBtn">+ 챕터</button>
        </div>
        <div class="chapter-list" id="chapterList"></div>
      </div>
      <div class="manuscript-main">
        <div class="manuscript-toolbar">
          <div class="pane-count-group">
            <button class="pane-count-btn" data-n="1">1단</button>
            <button class="pane-count-btn" data-n="2">2단</button>
            <button class="pane-count-btn" data-n="3">3단</button>
            <button class="pane-count-btn" data-n="4">4단</button>
          </div>
          <button class="btn btn--ghost btn--sm" id="focusModeBtn">🖥 집중모드</button>
          <button class="btn btn--ghost btn--sm" id="printModeBtn">🖨 인쇄 모드</button>
          <button class="btn btn--ghost btn--sm" id="exportBtn">📤 내보내기</button>
        </div>
        <div class="manuscript-panes" id="manuscriptPanes"></div>
      </div>
    </div>
    <button class="focus-exit-btn" id="focusExitBtn" hidden>✕ 나가기 <span class="kbd">Esc</span></button>
  `;

  document.getElementById('addChapterBtn').addEventListener('click', async () => {
    const chapter = await Models.createChapter(workId);
    await refreshTree(chapter.id);
  });

  // ---- Split-view / focus-mode state ----
  let paneCount = 1;
  let paneSceneIds = [sceneId || null];
  let activePaneIndex = 0;
  // Tracks panes the user explicitly chose to open anyway despite the same scene
  // already being live in another pane (see mountPane's conflict guard below).
  let paneOverrides = [false];

  function setPaneCount(n) {
    paneCount = n;
    const newIds = [];
    const newOverrides = [];
    for (let i = 0; i < n; i++) {
      newIds.push(paneSceneIds[i] || null);
      newOverrides.push(paneOverrides[i] || false);
    }
    paneSceneIds = newIds;
    paneOverrides = newOverrides;
    if (activePaneIndex >= n) activePaneIndex = 0;
    document.querySelectorAll('.pane-count-btn').forEach((b) => b.classList.toggle('pane-count-btn--active', Number(b.dataset.n) === n));
    renderPanesLayout();
  }

  document.querySelectorAll('.pane-count-btn').forEach((btn) => {
    btn.addEventListener('click', () => setPaneCount(Number(btn.dataset.n)));
  });

  function enterFocusMode() {
    document.body.classList.add('focus-mode');
    document.getElementById('focusExitBtn').hidden = false;
  }
  function exitFocusMode() {
    document.body.classList.remove('focus-mode');
    document.getElementById('focusExitBtn').hidden = true;
  }
  document.getElementById('focusModeBtn').addEventListener('click', enterFocusMode);
  document.getElementById('focusExitBtn').addEventListener('click', exitFocusMode);

  // Re-fetch rather than reuse the `bundle` captured at view entry — chapters/scenes
  // may have been added, renamed, or reordered since, and a stale export would
  // silently miss those changes.
  document.getElementById('printModeBtn').addEventListener('click', async () => {
    const fresh = await Models.getWorkBundle(workId);
    if (!fresh.chapters.length) { UI.toast('인쇄할 챕터가 없습니다'); return; }
    ManuscriptExport.openPrintView(fresh.work, fresh.chapters, fresh.scenesByChapter);
  });
  document.getElementById('exportBtn').addEventListener('click', () => Views.exportManuscriptFlow(workId));

  if (manuscriptEscHandler) document.removeEventListener('keydown', manuscriptEscHandler);
  manuscriptEscHandler = (e) => {
    if (e.key === 'Escape' && document.body.classList.contains('focus-mode')) exitFocusMode();
  };
  document.addEventListener('keydown', manuscriptEscHandler);

  async function refreshTree(openChapterId) {
    const fresh = await Models.getWorkBundle(workId);
    renderTree(fresh, openChapterId);
  }

  function renderTree(bundle, forceOpenChapterId) {
    const listEl = document.getElementById('chapterList');
    listEl.innerHTML = '';
    let draggedChapterId = null;
    let draggedScene = null;
    const collapsedChapterIds = getCollapsedChapterIds();

    bundle.chapters.forEach((ch) => {
      const scenes = bundle.scenesByChapter[ch.id] || [];
      const chapterEl = document.createElement('div');
      chapterEl.className = 'chapter-block';
      chapterEl.draggable = true;
      chapterEl.dataset.chapterId = ch.id;

      const isOpen = forceOpenChapterId === ch.id || scenes.some((s) => s.id === sceneId) || !collapsedChapterIds.has(ch.id);
      if (isOpen && collapsedChapterIds.has(ch.id)) setChapterCollapsed(ch.id, false); // forced open (new scene, selection) — keep the stored state honest

      const isWebnovel = bundle.work.format === 'webnovel';
      chapterEl.innerHTML = `
        <div class="chapter-block__header">
          <span class="drag-handle">⠿</span>
          <span class="chapter-toggle">${isOpen ? '▾' : '▸'}</span>
          <span class="chapter-title" contenteditable="false">${Utils.escapeHtml(ch.title)}</span>
          <span class="muted chapter-count">${scenes.length}</span>
          ${isWebnovel ? `<button class="chapter-serial-btn${ch.serializedAt ? ' chapter-serial-btn--live' : ''}" title="클릭해서 연재 여부 전환">${ch.serializedAt ? `📡 ${ch.serializedAt}` : '미연재'}</button>` : ''}
          <button class="icon-btn add-scene-btn" title="장면 추가">+</button>
          <button class="icon-btn more-btn" title="더보기">⋯</button>
        </div>
        <div class="scene-list" style="display:${isOpen ? 'block' : 'none'}"></div>
      `;

      const header = chapterEl.querySelector('.chapter-block__header');
      const toggle = chapterEl.querySelector('.chapter-toggle');
      const sceneListEl = chapterEl.querySelector('.scene-list');
      const titleEl = chapterEl.querySelector('.chapter-title');
      const serialBtn = chapterEl.querySelector('.chapter-serial-btn');
      if (serialBtn) {
        serialBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const next = ch.serializedAt ? null : Utils.todayStr();
          await Models.updateChapter(ch.id, { serializedAt: next });
          await refreshTree();
        });
      }

      header.addEventListener('click', (e) => {
        if (e.target === titleEl || e.target.closest('button')) return;
        const nowOpen = sceneListEl.style.display !== 'none';
        sceneListEl.style.display = nowOpen ? 'none' : 'block';
        toggle.textContent = nowOpen ? '▸' : '▾';
        setChapterCollapsed(ch.id, nowOpen);
      });

      titleEl.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        titleEl.contentEditable = 'true';
        titleEl.focus();
        document.execCommand('selectAll', false, null);
      });
      titleEl.addEventListener('blur', async () => {
        titleEl.contentEditable = 'false';
        const newTitle = titleEl.textContent.trim() || ch.title;
        if (newTitle !== ch.title) await Models.updateChapter(ch.id, { title: newTitle });
      });
      titleEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); titleEl.blur(); }
      });

      chapterEl.querySelector('.add-scene-btn').addEventListener('click', async (e) => {
        e.stopPropagation();
        const scene = await Models.createScene(ch.id, workId);
        sceneListEl.style.display = 'block';
        toggle.textContent = '▾';
        setChapterCollapsed(ch.id, false);
        await refreshTree();
        loadSceneIntoActivePane(scene.id);
      });

      chapterEl.querySelector('.more-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        showChapterMenu(e.currentTarget, ch);
      });

      scenes.forEach((sc) => {
        const sceneEl = document.createElement('div');
        sceneEl.className = 'scene-row' + (sc.id === sceneId ? ' scene-row--active' : '');
        sceneEl.draggable = true;
        sceneEl.dataset.sceneId = sc.id;
        sceneEl.dataset.chapterId = ch.id;
        sceneEl.innerHTML = `
          <span class="drag-handle">⠿</span>
          <span class="status-dot status-dot--${sc.status}"></span>
          <span class="scene-title">${Utils.escapeHtml(sc.title)}</span>
          <span class="muted scene-words">${formatCharCount(sc.content)}</span>
          <button class="icon-btn more-btn" title="더보기">⋯</button>
        `;
        sceneEl.addEventListener('click', (e) => {
          if (e.target.closest('button')) return;
          loadSceneIntoActivePane(sc.id);
        });
        sceneEl.querySelector('.more-btn').addEventListener('click', (e) => {
          e.stopPropagation();
          showSceneMenu(e.currentTarget, sc, bundle.chapters);
        });

        sceneEl.addEventListener('dragstart', (e) => {
          draggedScene = sc;
          e.stopPropagation();
          e.dataTransfer.effectAllowed = 'move';
        });
        sceneEl.addEventListener('dragover', (e) => {
          e.preventDefault();
          e.stopPropagation();
          sceneEl.classList.add('drag-over');
        });
        sceneEl.addEventListener('dragleave', () => sceneEl.classList.remove('drag-over'));
        sceneEl.addEventListener('drop', async (e) => {
          e.preventDefault();
          e.stopPropagation();
          sceneEl.classList.remove('drag-over');
          if (!draggedScene || draggedScene.id === sc.id) return;
          await handleSceneDrop(draggedScene, ch.id, sc.id);
        });

        sceneListEl.appendChild(sceneEl);
      });

      sceneListEl.addEventListener('dragover', (e) => e.preventDefault());
      sceneListEl.addEventListener('drop', async (e) => {
        e.preventDefault();
        if (!draggedScene) return;
        if (e.target === sceneListEl) await handleSceneDrop(draggedScene, ch.id, null);
      });

      chapterEl.addEventListener('dragstart', (e) => {
        if (e.target !== chapterEl && e.target.closest('.scene-row')) return;
        draggedChapterId = ch.id;
        e.dataTransfer.effectAllowed = 'move';
      });
      chapterEl.addEventListener('dragover', (e) => {
        e.preventDefault();
      });
      chapterEl.addEventListener('drop', async (e) => {
        e.preventDefault();
        if (!draggedChapterId || draggedChapterId === ch.id) return;
        const ids = bundle.chapters.map((c) => c.id);
        const from = ids.indexOf(draggedChapterId);
        const to = ids.indexOf(ch.id);
        ids.splice(to, 0, ids.splice(from, 1)[0]);
        await Models.reorderChapters(workId, ids);
        draggedChapterId = null;
        await refreshTree();
      });

      listEl.appendChild(chapterEl);
    });

    async function handleSceneDrop(dragged, targetChapterId, beforeSceneId) {
      let scenesInTarget = (await DB.getAllByIndex('scenes', 'chapterId', targetChapterId)).sort((a, b) => a.order - b.order);
      scenesInTarget = scenesInTarget.filter((s) => s.id !== dragged.id);
      let insertIdx = scenesInTarget.length;
      if (beforeSceneId) {
        insertIdx = scenesInTarget.findIndex((s) => s.id === beforeSceneId);
        if (insertIdx === -1) insertIdx = scenesInTarget.length;
      }
      scenesInTarget.splice(insertIdx, 0, dragged);
      if (dragged.chapterId !== targetChapterId) {
        await Models.moveScene(dragged.id, targetChapterId);
      }
      await Models.reorderScenes(targetChapterId, scenesInTarget.map((s) => s.id));
      draggedScene = null;
      await refreshTree();
    }

    if (!bundle.chapters.length) {
      listEl.innerHTML = `<div class="empty-state empty-state--small">
        <p class="muted">아직 챕터가 없습니다. "+ 챕터"로 시작해보세요.</p>
      </div>`;
    }
  }

  function showChapterMenu(anchor, chapter) {
    const items = [
      { label: '이름 바꾸기', action: async () => {
        const name = await UI.prompt('새 챕터 이름', chapter.title, { title: '챕터 이름 바꾸기' });
        if (name && name.trim()) { await Models.updateChapter(chapter.id, { title: name.trim() }); await refreshTree(); }
      }},
      { label: '삭제', danger: true, action: async () => {
        const ok = await UI.confirm(`"${chapter.title}"과 그 안의 모든 장면이 삭제됩니다.`, { title: '챕터 삭제', confirmLabel: '삭제', danger: true });
        if (!ok) return;
        await Models.deleteChapter(chapter.id);
        await refreshTree();
        await pruneDeadPanes();
        if (sceneId && (await DB.get('scenes', sceneId)) === undefined && paneCount === 1) Router.go(`#/work/${workId}/manuscript`);
      }},
    ];
    openContextMenu(anchor, items);
  }

  function showSceneMenu(anchor, scene, chapters) {
    const items = [
      { label: '이름 바꾸기', action: async () => {
        const name = await UI.prompt('새 장면 이름', scene.title, { title: '장면 이름 바꾸기' });
        if (name && name.trim()) {
          await Models.updateScene(scene.id, { title: name.trim() });
          await refreshTree();
          const idx = paneSceneIds.indexOf(scene.id);
          if (idx !== -1) mountPane(idx, scene.id);
        }
      }},
      { label: '다른 챕터로 이동', action: async () => {
        const others = chapters.filter((c) => c.id !== scene.chapterId);
        if (!others.length) { UI.toast('이동할 다른 챕터가 없습니다'); return; }
        showChapterPicker(anchor, others, async (targetId) => {
          await Models.moveScene(scene.id, targetId);
          await refreshTree();
        });
      }},
      { label: '삭제', danger: true, action: async () => {
        const ok = await UI.confirm(`"${scene.title}" 장면과 버전 기록이 모두 삭제됩니다.`, { title: '장면 삭제', confirmLabel: '삭제', danger: true });
        if (!ok) return;
        await Models.deleteScene(scene.id);
        await refreshTree();
        paneSceneIds = paneSceneIds.map((id) => (id === scene.id ? null : id));
        renderPanesLayout();
        if (scene.id === sceneId && paneCount === 1) Router.go(`#/work/${workId}/manuscript`);
      }},
    ];
    openContextMenu(anchor, items);
  }

  function showChapterPicker(anchor, chapters, onPick) {
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    chapters.forEach((c) => {
      const item = document.createElement('div');
      item.className = 'context-menu__item';
      item.textContent = c.title;
      item.addEventListener('click', () => { menu.remove(); onPick(c.id); });
      menu.appendChild(item);
    });
    positionMenu(menu, anchor);
  }

  function openContextMenu(anchor, items) {
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    items.forEach((it) => {
      const item = document.createElement('div');
      item.className = 'context-menu__item' + (it.danger ? ' context-menu__item--danger' : '');
      item.textContent = it.label;
      item.addEventListener('click', () => { menu.remove(); it.action(); });
      menu.appendChild(item);
    });
    positionMenu(menu, anchor);
  }

  function positionMenu(menu, anchor) {
    document.body.appendChild(menu);
    const rect = anchor.getBoundingClientRect();
    menu.style.top = `${rect.bottom + 4}px`;
    menu.style.left = `${Math.min(rect.left, window.innerWidth - menu.offsetWidth - 12)}px`;
    setTimeout(() => {
      const closeHandler = (e) => {
        if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('mousedown', closeHandler); }
      };
      document.addEventListener('mousedown', closeHandler);
    }, 0);
  }

  // ---- Editor panes ----
  function loadSceneIntoActivePane(id) {
    if (paneCount === 1) {
      // Single-pane mode keeps the original URL-addressable behavior.
      if (location.hash !== `#/work/${workId}/manuscript/${id}`) {
        history.replaceState(null, '', `#/work/${workId}/manuscript/${id}`);
      }
      sceneId = id;
      paneSceneIds[0] = id;
      paneOverrides[0] = false;
      mountPane(0, id);
      document.querySelectorAll('.scene-row').forEach((el) => el.classList.toggle('scene-row--active', el.dataset.sceneId === id));
    } else {
      paneSceneIds[activePaneIndex] = id;
      paneOverrides[activePaneIndex] = false;
      mountPane(activePaneIndex, id);
    }
  }

  async function pruneDeadPanes() {
    for (let i = 0; i < paneSceneIds.length; i++) {
      const id = paneSceneIds[i];
      if (id && (await DB.get('scenes', id)) === undefined) {
        paneSceneIds[i] = null;
        mountPane(i, null);
      }
    }
  }

  function renderPanesLayout() {
    const panesEl = document.getElementById('manuscriptPanes');
    panesEl.innerHTML = '';
    panesEl.className = `manuscript-panes manuscript-panes--${paneCount}`;
    for (let i = 0; i < paneCount; i++) {
      const paneEl = document.createElement('div');
      paneEl.className = 'manuscript-pane';
      paneEl.addEventListener('mousedown', () => { activePaneIndex = i; });
      panesEl.appendChild(paneEl);
      mountPane(i, paneSceneIds[i]);
    }
  }

  async function mountPane(index, paneSceneId) {
    const panesEl = document.getElementById('manuscriptPanes');
    const paneEl = panesEl.children[index];
    if (!paneEl) return;
    paneEl.innerHTML = '';

    if (paneCount > 1) {
      const fresh = await Models.getWorkBundle(workId);
      const picker = document.createElement('select');
      picker.className = 'input pane-scene-select';
      let options = `<option value="">장면 선택...</option>`;
      fresh.chapters.forEach((ch) => {
        const scenes = fresh.scenesByChapter[ch.id] || [];
        if (!scenes.length) return;
        options += `<optgroup label="${Utils.escapeHtml(ch.title)}">${scenes
          .map((s) => `<option value="${s.id}" ${s.id === paneSceneId ? 'selected' : ''}>${Utils.escapeHtml(s.title)}</option>`)
          .join('')}</optgroup>`;
      });
      picker.innerHTML = options;
      picker.addEventListener('mousedown', () => { activePaneIndex = index; });
      picker.addEventListener('change', () => {
        paneSceneIds[index] = picker.value || null;
        paneOverrides[index] = false;
        mountPane(index, paneSceneIds[index]);
      });
      paneEl.appendChild(picker);
    }

    const body = document.createElement('div');
    body.className = 'manuscript-pane__body';
    paneEl.appendChild(body);

    if (!paneSceneId) {
      body.innerHTML = `<div class="empty-state empty-state--small"><div class="empty-state__icon">📝</div><p class="muted">${paneCount > 1 ? '위에서 장면을 선택해보세요.' : '왼쪽 트리에서 챕터를 열고 장면을 추가할 수 있습니다.'}</p></div>`;
      return;
    }

    // Two live RichEditor instances autosaving the same scene would silently overwrite
    // each other (last write wins) — block that by default and require an explicit
    // opt-in instead of quietly corrupting whichever pane saves last.
    const conflictIndex = paneSceneIds.findIndex((id, i) => id === paneSceneId && i !== index);
    if (conflictIndex !== -1 && !paneOverrides[index]) {
      body.innerHTML = `
        <div class="empty-state empty-state--small pane-conflict">
          <div class="empty-state__icon">⚠️</div>
          <p class="muted">이 장면은 ${conflictIndex + 1}단에서 이미 편집 중이에요.<br>동시에 열면 저장 내용이 서로 덮어써질 수 있어요.</p>
          <button class="btn btn--ghost btn--sm" id="paneOverrideBtn">그래도 열기</button>
        </div>`;
      body.querySelector('#paneOverrideBtn').addEventListener('click', () => {
        paneOverrides[index] = true;
        mountPane(index, paneSceneId);
      });
      return;
    }

    const scene = await DB.get('scenes', paneSceneId);
    if (!scene) {
      body.innerHTML = `<div class="empty-state empty-state--small"><p class="muted">삭제되었거나 존재하지 않는 장면입니다.</p></div>`;
      return;
    }

    body.innerHTML = `
      <div class="scene-editor">
        <div class="scene-editor__header">
          <input type="text" class="scene-title-input" value="${Utils.escapeHtml(scene.title)}">
          <select class="status-select">
            <option value="draft" ${scene.status === 'draft' ? 'selected' : ''}>초안</option>
            <option value="revising" ${scene.status === 'revising' ? 'selected' : ''}>퇴고중</option>
            <option value="done" ${scene.status === 'done' ? 'selected' : ''}>완료</option>
          </select>
          <span class="save-indicator" aria-live="polite">저장됨</span>
          <button class="btn btn--ghost btn--sm proofread-btn">✓ 맞춤법 검사</button>
          <button class="btn btn--ghost btn--sm history-btn">🕐 버전 기록</button>
        </div>
        <div class="rich-editor-mount"></div>
        <div class="scene-editor__footer">
          <span class="muted word-count-label">${formatCharCount(scene.content)}</span>
          <button class="btn btn--ghost btn--sm char-count-toggle" title="공백 포함/제외 전환">${Prefs.get().charCountMode === 'include' ? '공백 포함' : '공백 제외'}</button>
          <details class="scene-summary-toggle">
            <summary>요약 메모 (선택)</summary>
            <textarea class="textarea summary-input" rows="3" placeholder="이 장면의 요약이나 다음에 쓸 내용 메모">${Utils.escapeHtml(scene.summary || '')}</textarea>
          </details>
        </div>
      </div>
    `;

    const titleInput = body.querySelector('.scene-title-input');
    const statusSelect = body.querySelector('.status-select');
    const summary = body.querySelector('.summary-input');
    const indicator = body.querySelector('.save-indicator');
    const wordLabel = body.querySelector('.word-count-label');
    const charCountToggle = body.querySelector('.char-count-toggle');

    let versionTimer = null;

    const debouncedSave = Utils.debounce(async (html) => {
      indicator.textContent = '저장 중...';
      // Proofread review marks (see openProofreadReview) are transient UI state —
      // strip them from what gets persisted regardless of what triggered this save,
      // rather than relying on the review flow to always clean up first.
      const cleanHtml = Proofreader.stripMarksFromHtml(html);
      await Models.updateScene(scene.id, { content: cleanHtml });
      wordLabel.textContent = formatCharCount(cleanHtml);
      indicator.textContent = '저장됨 · 방금';
      const treeTitleEl = document.querySelector(`.scene-row[data-scene-id="${scene.id}"] .scene-words`);
      if (treeTitleEl) treeTitleEl.textContent = formatCharCount(cleanHtml);
    }, Prefs.get().autosaveDelay);

    charCountToggle.addEventListener('click', () => {
      const mode = Prefs.toggleCharCountMode();
      charCountToggle.textContent = mode === 'include' ? '공백 포함' : '공백 제외';
      wordLabel.textContent = formatCharCount(richHandle.getHTML());
      // Other panes/tree rows show a scene's count independently of this one — a
      // preference change should be reflected everywhere at once, not just here.
      document.querySelectorAll('.scene-row .scene-words').forEach((el) => {
        const row = el.closest('.scene-row');
        if (row) DB.get('scenes', row.dataset.sceneId).then((s) => { if (s) el.textContent = formatCharCount(s.content); });
      });
      document.querySelectorAll('.manuscript-pane .word-count-label').forEach((el) => {
        if (el !== wordLabel) el.textContent = formatCharCount(el.closest('.scene-editor').querySelector('.rich-content')?.innerHTML || '');
      });
    });

    const richHandle = RichEditor.mount(body.querySelector('.rich-editor-mount'), {
      content: scene.content,
      placeholder: '이 장면의 이야기를 적어보세요... [[캐릭터명]]처럼 쓰면 대시보드에서 자동으로 연결됩니다.',
      onChange: (html) => {
        indicator.textContent = '입력 중...';
        debouncedSave(html);
        clearTimeout(versionTimer);
        versionTimer = setTimeout(async () => {
          await Models.saveSceneVersion(scene.id, Proofreader.stripMarksFromHtml(html), '자동 저장');
          await Models.pruneOldAutoVersions(scene.id);
        }, 45000);
      },
      getWikiCandidates: async () => {
        const b = await Models.getWorkBundle(workId);
        const titles = [];
        b.characters.forEach((c) => titles.push(c.name));
        b.settingNotes.forEach((n) => titles.push(n.title));
        b.chapters.forEach((c) => (b.scenesByChapter[c.id] || []).forEach((s) => titles.push(s.title)));
        return titles;
      },
    });

    titleInput.addEventListener('change', async () => {
      const t = titleInput.value.trim() || scene.title;
      await Models.updateScene(scene.id, { title: t });
      await refreshTree();
    });

    statusSelect.addEventListener('change', async () => {
      await Models.updateScene(scene.id, { status: statusSelect.value });
      const dot = document.querySelector(`.scene-row[data-scene-id="${scene.id}"] .status-dot`);
      if (dot) dot.className = `status-dot status-dot--${statusSelect.value}`;
    });

    summary.addEventListener('input', Utils.debounce(async () => {
      await Models.updateScene(scene.id, { summary: summary.value });
    }, Prefs.get().autosaveDelay));

    body.querySelector('.history-btn').addEventListener('click', () => openVersionHistory(scene.id, () => mountPane(index, paneSceneId)));
    body.querySelector('.proofread-btn').addEventListener('click', () => openProofreadReview(richHandle.el));

    body.addEventListener('mousedown', () => { activePaneIndex = index; });
    richHandle.focus();
  }

  async function openVersionHistory(sceneId, onRestored) {
    const versions = await Models.getSceneVersions(sceneId);
    const wrap = document.createElement('div');
    wrap.className = 'version-history';
    if (!versions.length) {
      wrap.innerHTML = `<p class="muted">아직 저장된 버전이 없습니다. 편집을 계속하면 자동으로 기록됩니다.</p>`;
    } else {
      versions.forEach((v) => {
        const row = document.createElement('div');
        row.className = 'version-row';
        row.innerHTML = `
          <div class="version-row__meta">
            <strong>${Utils.escapeHtml(v.label)}</strong>
            <span class="muted">${Utils.formatDateTime(v.createdAt)} · ${v.wordCount.toLocaleString()}자</span>
          </div>
          <div class="version-row__actions">
            <button class="btn btn--ghost btn--sm preview-btn">미리보기</button>
            <button class="btn btn--ghost btn--sm restore-btn">복원</button>
          </div>
          <div class="version-preview" hidden></div>
        `;
        row.querySelector('.preview-btn').addEventListener('click', () => {
          const pv = row.querySelector('.version-preview');
          pv.hidden = !pv.hidden;
          if (!pv.hidden) pv.innerHTML = Utils.sanitizeHtml(v.content);
        });
        row.querySelector('.restore-btn').addEventListener('click', async () => {
          const ok = await UI.confirm('현재 내용은 백업된 뒤 이 버전으로 복원됩니다. 계속할까요?', { title: '버전 복원', confirmLabel: '복원' });
          if (!ok) return;
          await Models.restoreSceneVersion(sceneId, v.id);
          UI.closeModal();
          UI.toast('버전이 복원되었습니다');
          onRestored();
        });
        wrap.appendChild(row);
      });
    }
    UI.openModal({ title: '버전 기록', bodyEl: wrap, width: '560px' });
  }

  const PROOFREAD_CATEGORY_LABELS = { spelling: '맞춤법', spacing: '띄어쓰기', expression: '표현' };
  const PROOFREAD_FILTERS = [
    { key: 'all', label: '전체' },
    { key: 'spelling', label: '맞춤법' },
    { key: 'spacing', label: '띄어쓰기' },
    { key: 'expression', label: '표현' },
  ];

  // Hover/click popover for one .proofread-mark span — shown via event delegation
  // on contentEl (attachProofreadPopover, below) rather than per-span listeners, so
  // it keeps working after markIssues() adds/removes spans during a review session.
  function buildProofreadPopover(contentEl, span, issue, onResolved) {
    const pop = document.createElement('div');
    pop.className = 'proofread-popover';
    pop.innerHTML = `
      <span class="proofread-popover__badge proofread-issue__badge--${issue.category}">${PROOFREAD_CATEGORY_LABELS[issue.category] || '기타'}</span>
      <p class="proofread-popover__msg">${Utils.escapeHtml(issue.message)}</p>
      <div class="proofread-popover__dict" hidden></div>
      <div class="proofread-popover__actions">
        ${issue.suggestion ? `<button class="btn btn--ghost btn--sm proofread-popover__apply">"${Utils.escapeHtml(issue.suggestion)}"로 수정</button>` : ''}
        <button class="btn btn--ghost btn--sm proofread-popover__keep">원문 유지</button>
      </div>
    `;
    if (issue.dictWord) {
      const dictEl = pop.querySelector('.proofread-popover__dict');
      Proofreader.lookupWord(issue.dictWord).then((results) => {
        if (!results.length || !pop.isConnected) return;
        dictEl.hidden = false;
        dictEl.innerHTML = `<span class="muted">표준국어대사전: <strong>${Utils.escapeHtml(results[0].word)}</strong> — ${Utils.escapeHtml(Utils.truncate(results[0].definition, 60))}</span>`;
      }).catch(() => {}); // dictionary proxy unavailable — rule explanation above still stands on its own
    }
    const applyBtn = pop.querySelector('.proofread-popover__apply');
    if (applyBtn) {
      applyBtn.addEventListener('click', () => {
        Proofreader.applyMark(span, issue.suggestion);
        // Triggers RichEditor's own input->autosave pipeline; debouncedSave strips
        // any still-remaining marks before persisting (see js/proofreader.js
        // stripMarksFromHtml), so this is safe to fire even mid-review.
        contentEl.dispatchEvent(new Event('input', { bubbles: true }));
        onResolved();
      });
    }
    pop.querySelector('.proofread-popover__keep').addEventListener('click', () => {
      Proofreader.unwrapMark(span);
      contentEl.dispatchEvent(new Event('input', { bubbles: true }));
      onResolved();
    });
    return pop;
  }

  // Wires hover(+click)-to-open popovers for every current/future .proofread-mark
  // span inside contentEl, via one pair of delegated listeners rather than binding
  // per-span (spans get added/removed throughout a review session by markIssues/
  // applyMark/unwrapMark, so per-span listeners would need constant re-attaching).
  function attachProofreadPopover(contentEl, issuesById, onResolved) {
    let popEl = null;
    let hideTimer = null;
    let openIssueId = null;

    function hide() {
      if (popEl) { popEl.remove(); popEl = null; }
      openIssueId = null;
    }
    function scheduleHide() {
      clearTimeout(hideTimer);
      hideTimer = setTimeout(hide, 200);
    }
    function show(span) {
      const issueId = span.dataset.issueId;
      const issue = issuesById.get(issueId);
      if (!issue) return;
      clearTimeout(hideTimer);
      if (openIssueId === issueId) return;
      hide();
      openIssueId = issueId;
      popEl = buildProofreadPopover(contentEl, span, issue, () => {
        issuesById.delete(issueId);
        hide();
        onResolved();
      });
      document.body.appendChild(popEl);
      const rect = span.getBoundingClientRect();
      popEl.style.left = `${Math.min(rect.left, window.innerWidth - popEl.offsetWidth - 12)}px`;
      popEl.style.top = `${rect.bottom + 6}px`;
      popEl.addEventListener('mouseenter', () => clearTimeout(hideTimer));
      popEl.addEventListener('mouseleave', scheduleHide);
    }

    contentEl.addEventListener('mouseover', (e) => {
      const span = e.target.closest('.proofread-mark');
      if (span) show(span);
    });
    contentEl.addEventListener('mouseout', (e) => {
      if (e.target.closest('.proofread-mark')) scheduleHide();
    });
    contentEl.addEventListener('click', (e) => {
      const span = e.target.closest('.proofread-mark');
      if (span) show(span);
    });
  }

  // contentEl is the live RichEditor DOM node (richHandle.el). Marks issues directly
  // in the manuscript text (hover/click a highlighted span for a fix-it popover)
  // instead of listing them in a separate modal. Two sources feed the same review
  // session: the always-available offline rule engine (Proofreader.check) and an
  // AI-based sentence checker (Proofreader.checkOnline, proxied to Naver's
  // unofficial spell-checker — see netlify/functions/spellcheck.js) that catches
  // context-dependent errors no fixed rule can, at the cost of needing network
  // access and being able to fail or change shape without notice — local rules
  // still mark immediately so the user isn't blocked on it.
  function openProofreadReview(contentEl) {
    const sceneEditor = contentEl.closest('.scene-editor');
    if (sceneEditor.querySelector('.proofread-bar')) { UI.toast('이미 검토 중입니다'); return; }

    const bar = document.createElement('div');
    bar.className = 'proofread-bar';
    bar.innerHTML = `
      <span class="proofread-bar__status muted">검사 중...</span>
      <div class="proofread-bar__filters" hidden>
        ${PROOFREAD_FILTERS.map((f) => `<button class="chip${f.key === 'all' ? ' chip--active' : ''}" data-filter="${f.key}">${f.label}</button>`).join('')}
      </div>
      <button class="btn btn--ghost btn--sm proofread-bar__done">검토 종료</button>
    `;
    sceneEditor.querySelector('.scene-editor__header').after(bar);

    const statusEl = bar.querySelector('.proofread-bar__status');
    const filtersEl = bar.querySelector('.proofread-bar__filters');

    const issuesById = new Map();
    function updateStatus(extra = '') {
      filtersEl.hidden = issuesById.size === 0;
      statusEl.textContent = issuesById.size ? `${issuesById.size}건 남음${extra}` : `발견된 문제가 없습니다${extra}`;
    }

    attachProofreadPopover(contentEl, issuesById, updateStatus);

    bar.querySelector('.proofread-bar__done').addEventListener('click', () => {
      Proofreader.unmarkAll(contentEl);
      contentEl.dispatchEvent(new Event('input', { bubbles: true }));
      bar.remove();
    });
    filtersEl.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      filtersEl.querySelectorAll('.chip').forEach((c) => c.classList.remove('chip--active'));
      chip.classList.add('chip--active');
      const filter = chip.dataset.filter;
      contentEl.querySelectorAll('.proofread-mark').forEach((span) => {
        span.classList.toggle('proofread-mark--hidden', filter !== 'all' && !span.classList.contains(`proofread-mark--${filter}`));
      });
    });

    const localIssues = Proofreader.check(contentEl.textContent);
    Proofreader.markIssues(contentEl, localIssues);
    localIssues.forEach((it) => issuesById.set(it.id, it));
    updateStatus();

    Proofreader.checkOnline(contentEl.textContent).then(({ issues: aiIssuesRaw, truncated }) => {
      if (!bar.isConnected) return; // review ended before this resolved
      const merged = Proofreader.mergeIssues(localIssues, aiIssuesRaw);
      const newOnes = merged.filter((it) => !issuesById.has(it.id));
      Proofreader.markIssues(contentEl, newOnes);
      newOnes.forEach((it) => issuesById.set(it.id, it));
      updateStatus(truncated ? ` (앞 ${Proofreader.ONLINE_CHECK_LIMIT.toLocaleString()}자만 AI 검사됨)` : '');
    }).catch(() => {
      if (bar.isConnected) updateStatus(' (AI 검사 실패 — 규칙 검사 결과만 표시)');
    });
  }

  if (!sceneId) {
    const qChapter = Router.query().get('chapter');
    if (!qChapter) {
      const firstChapter = bundle.chapters[0];
      const firstScene = firstChapter ? (bundle.scenesByChapter[firstChapter.id] || [])[0] : null;
      if (firstScene) {
        sceneId = firstScene.id;
        paneSceneIds = [firstScene.id];
      }
    }
  }
  renderTree(bundle);
  setPaneCount(1);
};
