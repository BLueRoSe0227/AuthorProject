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
      <div class="manuscript-editor" id="manuscriptEditor"></div>
    </div>
  `;

  document.getElementById('addChapterBtn').addEventListener('click', async () => {
    const chapter = await Models.createChapter(workId);
    await refreshTree(chapter.id);
  });

  async function refreshTree(openChapterId) {
    const fresh = await Models.getWorkBundle(workId);
    renderTree(fresh, openChapterId);
  }

  function renderTree(bundle, forceOpenChapterId) {
    const listEl = document.getElementById('chapterList');
    listEl.innerHTML = '';
    let draggedChapterId = null;
    let draggedScene = null;

    bundle.chapters.forEach((ch) => {
      const scenes = bundle.scenesByChapter[ch.id] || [];
      const chapterEl = document.createElement('div');
      chapterEl.className = 'chapter-block';
      chapterEl.draggable = true;
      chapterEl.dataset.chapterId = ch.id;

      const isOpen = forceOpenChapterId === ch.id || scenes.some((s) => s.id === sceneId) || (!forceOpenChapterId && !sceneId && bundle.chapters[0].id === ch.id);

      chapterEl.innerHTML = `
        <div class="chapter-block__header">
          <span class="drag-handle">⠿</span>
          <span class="chapter-toggle">${isOpen ? '▾' : '▸'}</span>
          <span class="chapter-title" contenteditable="false">${Utils.escapeHtml(ch.title)}</span>
          <span class="muted chapter-count">${scenes.length}</span>
          <button class="icon-btn add-scene-btn" title="장면 추가">+</button>
          <button class="icon-btn more-btn" title="더보기">⋯</button>
        </div>
        <div class="scene-list" style="display:${isOpen ? 'block' : 'none'}"></div>
      `;

      const header = chapterEl.querySelector('.chapter-block__header');
      const toggle = chapterEl.querySelector('.chapter-toggle');
      const sceneListEl = chapterEl.querySelector('.scene-list');
      const titleEl = chapterEl.querySelector('.chapter-title');

      header.addEventListener('click', (e) => {
        if (e.target === titleEl || e.target.closest('button')) return;
        const nowOpen = sceneListEl.style.display !== 'none';
        sceneListEl.style.display = nowOpen ? 'none' : 'block';
        toggle.textContent = nowOpen ? '▸' : '▾';
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
        await refreshTree();
        openScene(scene.id);
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
          <span class="muted scene-words">${(sc.wordCount || 0).toLocaleString()}자</span>
          <button class="icon-btn more-btn" title="더보기">⋯</button>
        `;
        sceneEl.addEventListener('click', (e) => {
          if (e.target.closest('button')) return;
          Router.go(`#/work/${workId}/manuscript/${sc.id}`);
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
        if (sceneId && (await DB.get('scenes', sceneId)) === undefined) Router.go(`#/work/${workId}/manuscript`);
        await refreshTree();
      }},
    ];
    openContextMenu(anchor, items);
  }

  function showSceneMenu(anchor, scene, chapters) {
    const items = [
      { label: '이름 바꾸기', action: async () => {
        const name = await UI.prompt('새 장면 이름', scene.title, { title: '장면 이름 바꾸기' });
        if (name && name.trim()) { await Models.updateScene(scene.id, { title: name.trim() }); await refreshTree(); if (scene.id === sceneId) openScene(scene.id); }
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
        if (scene.id === sceneId) Router.go(`#/work/${workId}/manuscript`);
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

  // ---- Editor pane ----
  let autosaveTimer = null;
  let versionTimer = null;

  async function openScene(id) {
    if (location.hash !== `#/work/${workId}/manuscript/${id}`) {
      history.replaceState(null, '', `#/work/${workId}/manuscript/${id}`);
    }
    sceneId = id;
    const scene = await DB.get('scenes', id);
    const editorEl = document.getElementById('manuscriptEditor');
    if (!scene) {
      renderEmptyEditor();
      return;
    }

    editorEl.innerHTML = `
      <div class="scene-editor">
        <div class="scene-editor__header">
          <input type="text" class="scene-title-input" id="sceneTitleInput" value="${Utils.escapeHtml(scene.title)}">
          <select class="status-select" id="sceneStatusSelect">
            <option value="draft" ${scene.status === 'draft' ? 'selected' : ''}>초안</option>
            <option value="revising" ${scene.status === 'revising' ? 'selected' : ''}>퇴고중</option>
            <option value="done" ${scene.status === 'done' ? 'selected' : ''}>완료</option>
          </select>
          <span class="save-indicator" id="saveIndicator">저장됨</span>
          <button class="btn btn--ghost btn--sm" id="versionHistoryBtn">🕐 버전 기록</button>
        </div>
        <textarea class="scene-content" id="sceneContent" placeholder="이 장면의 이야기를 적어보세요... [[캐릭터명]]처럼 쓰면 대시보드에서 자동으로 연결됩니다.">${Utils.escapeHtml(scene.content)}</textarea>
        <div class="scene-editor__footer">
          <span class="muted" id="wordCountLabel">${(scene.wordCount || 0).toLocaleString()}자</span>
          <details class="scene-summary-toggle">
            <summary>요약 메모 (선택)</summary>
            <textarea class="textarea" id="sceneSummary" rows="3" placeholder="이 장면의 요약이나 다음에 쓸 내용 메모">${Utils.escapeHtml(scene.summary || '')}</textarea>
          </details>
        </div>
      </div>
    `;

    renderTree(await Models.getWorkBundle(workId));

    const titleInput = document.getElementById('sceneTitleInput');
    const statusSelect = document.getElementById('sceneStatusSelect');
    const textarea = document.getElementById('sceneContent');
    const summary = document.getElementById('sceneSummary');
    const indicator = document.getElementById('saveIndicator');
    const wordLabel = document.getElementById('wordCountLabel');

    const debouncedSave = Utils.debounce(async () => {
      indicator.textContent = '저장 중...';
      await Models.updateScene(scene.id, { content: textarea.value });
      wordLabel.textContent = `${Utils.countWords(textarea.value).toLocaleString()}자`;
      indicator.textContent = '저장됨 · 방금';
      const treeTitleEl = document.querySelector(`.scene-row[data-scene-id="${scene.id}"] .scene-words`);
      if (treeTitleEl) treeTitleEl.textContent = `${Utils.countWords(textarea.value).toLocaleString()}자`;
    }, Prefs.get().autosaveDelay);

    textarea.addEventListener('input', () => {
      indicator.textContent = '입력 중...';
      debouncedSave();
      clearTimeout(versionTimer);
      versionTimer = setTimeout(async () => {
        await Models.saveSceneVersion(scene.id, textarea.value, '자동 저장');
        await Models.pruneOldAutoVersions(scene.id);
      }, 45000);
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

    document.getElementById('versionHistoryBtn').addEventListener('click', () => openVersionHistory(scene.id, textarea));

    UI.attachWikiAutocomplete(textarea, async () => {
      const b = await Models.getWorkBundle(workId);
      const titles = [];
      b.characters.forEach((c) => titles.push(c.name));
      b.settingNotes.forEach((n) => titles.push(n.title));
      b.chapters.forEach((c) => (b.scenesByChapter[c.id] || []).forEach((s) => titles.push(s.title)));
      return titles;
    });
  }

  function renderEmptyEditor() {
    document.getElementById('manuscriptEditor').innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">📝</div>
        <h3>장면을 선택하거나 새로 만들어보세요</h3>
        <p class="muted">왼쪽 트리에서 챕터를 열고 장면을 추가할 수 있습니다.</p>
      </div>
    `;
  }

  async function openVersionHistory(sceneId, textarea) {
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
          if (!pv.hidden) pv.innerHTML = `<p>${Utils.escapeHtml(Utils.truncate(v.content, 600)).replace(/\n/g, '<br>')}</p>`;
        });
        row.querySelector('.restore-btn').addEventListener('click', async () => {
          const ok = await UI.confirm('현재 내용은 백업된 뒤 이 버전으로 복원됩니다. 계속할까요?', { title: '버전 복원', confirmLabel: '복원' });
          if (!ok) return;
          await Models.restoreSceneVersion(sceneId, v.id);
          UI.closeModal();
          UI.toast('버전이 복원되었습니다');
          openScene(sceneId);
        });
        wrap.appendChild(row);
      });
    }
    UI.openModal({ title: '버전 기록', bodyEl: wrap, width: '560px' });
  }

  renderTree(bundle);
  const qChapter = Router.query().get('chapter');
  if (sceneId) {
    openScene(sceneId);
  } else if (qChapter) {
    renderEmptyEditor();
  } else {
    const firstChapter = bundle.chapters[0];
    const firstScene = firstChapter ? (bundle.scenesByChapter[firstChapter.id] || [])[0] : null;
    if (firstScene) openScene(firstScene.id);
    else renderEmptyEditor();
  }
};
