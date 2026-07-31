const UI = {
  toast(message, type = 'info', duration = 2600) {
    const root = document.getElementById('toastRoot');
    const el = document.createElement('div');
    el.className = `toast toast--${type}`;
    el.textContent = message;
    root.appendChild(el);
    requestAnimationFrame(() => el.classList.add('toast--show'));
    setTimeout(() => {
      el.classList.remove('toast--show');
      setTimeout(() => el.remove(), 250);
    }, duration);
  },

  openModal({ title, bodyHtml = '', bodyEl = null, actions = [], onClose, width }) {
    const root = document.getElementById('modalRoot');
    root.innerHTML = '';
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    const modal = document.createElement('div');
    modal.className = 'modal';
    if (width) modal.style.maxWidth = width;

    const header = document.createElement('div');
    header.className = 'modal__header';
    header.innerHTML = `<h3>${Utils.escapeHtml(title || '')}</h3>`;
    const closeBtn = document.createElement('button');
    closeBtn.className = 'modal__close';
    closeBtn.innerHTML = '✕';
    closeBtn.onclick = () => UI.closeModal(onClose);
    header.appendChild(closeBtn);

    const body = document.createElement('div');
    body.className = 'modal__body';
    if (bodyEl) body.appendChild(bodyEl);
    else body.innerHTML = bodyHtml;

    const footer = document.createElement('div');
    footer.className = 'modal__footer';
    actions.forEach((a) => {
      const btn = document.createElement('button');
      btn.className = `btn ${a.primary ? 'btn--primary' : a.danger ? 'btn--danger' : 'btn--ghost'}`;
      btn.textContent = a.label;
      btn.onclick = () => a.onClick(body);
      footer.appendChild(btn);
    });

    modal.appendChild(header);
    modal.appendChild(body);
    if (actions.length) modal.appendChild(footer);
    overlay.appendChild(modal);
    overlay.addEventListener('mousedown', (e) => {
      if (e.target === overlay) UI.closeModal(onClose);
    });
    root.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('modal-overlay--show'));

    const escHandler = (e) => {
      if (e.key === 'Escape') {
        UI.closeModal(onClose);
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);

    return { modal, body, close: () => UI.closeModal(onClose) };
  },

  closeModal(onClose) {
    const root = document.getElementById('modalRoot');
    root.innerHTML = '';
    if (onClose) onClose();
  },

  confirm(message, { title = '확인', confirmLabel = '확인', danger = false } = {}) {
    return new Promise((resolve) => {
      UI.openModal({
        title,
        bodyHtml: `<p>${Utils.escapeHtml(message)}</p>`,
        actions: [
          { label: '취소', onClick: () => { UI.closeModal(); resolve(false); } },
          { label: confirmLabel, primary: !danger, danger, onClick: () => { UI.closeModal(); resolve(true); } },
        ],
        onClose: () => resolve(false),
      });
    });
  },

  prompt(message, defaultValue = '', { title = '입력', confirmLabel = '확인' } = {}) {
    return new Promise((resolve) => {
      const wrap = document.createElement('div');
      wrap.innerHTML = `<p>${Utils.escapeHtml(message)}</p><input type="text" class="input" id="uiPromptInput" value="${Utils.escapeHtml(
        defaultValue
      )}">`;
      let resolved = false;
      const { close } = UI.openModal({
        title,
        bodyEl: wrap,
        actions: [
          { label: '취소', onClick: () => { resolved = true; close(); resolve(null); } },
          {
            label: confirmLabel,
            primary: true,
            onClick: () => {
              const val = wrap.querySelector('#uiPromptInput').value;
              resolved = true;
              close();
              resolve(val);
            },
          },
        ],
        onClose: () => { if (!resolved) resolve(null); },
      });
      const input = wrap.querySelector('#uiPromptInput');
      input.focus();
      input.select();
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          resolved = true;
          close();
          resolve(input.value);
        }
      });
    });
  },

  // Attaches [[wiki-link]] autocomplete to a textarea. getCandidatesFn must return a Promise<string[]> of titles.
  attachWikiAutocomplete(textarea, getCandidatesFn) {
    const box = document.createElement('div');
    box.className = 'wiki-autocomplete';
    box.hidden = true;
    const parent = textarea.parentElement;
    if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';
    parent.appendChild(box);

    function getTriggerInfo() {
      const val = textarea.value;
      const pos = textarea.selectionStart;
      const uptoCursor = val.slice(0, pos);
      const lastOpen = uptoCursor.lastIndexOf('[[');
      if (lastOpen === -1) return null;
      const between = uptoCursor.slice(lastOpen + 2);
      if (between.includes(']]') || between.includes('\n')) return null;
      return { start: lastOpen, query: between };
    }

    async function update() {
      const info = getTriggerInfo();
      if (!info) {
        box.hidden = true;
        return;
      }
      const candidates = await getCandidatesFn();
      const q = info.query.toLowerCase();
      const filtered = candidates.filter((c) => c.toLowerCase().includes(q)).slice(0, 8);
      if (!filtered.length) {
        box.hidden = true;
        return;
      }
      box.innerHTML = '';
      filtered.forEach((title) => {
        const item = document.createElement('div');
        item.className = 'wiki-autocomplete__item';
        item.textContent = title;
        item.addEventListener('mousedown', (e) => {
          e.preventDefault();
          const val = textarea.value;
          const pos = textarea.selectionStart;
          const before = val.slice(0, info.start);
          const after = val.slice(pos);
          const closeAlready = after.startsWith(']]');
          const insertion = `[[${title}]]`;
          const newVal = before + insertion + (closeAlready ? after.slice(2) : after);
          textarea.value = newVal;
          const newPos = before.length + insertion.length;
          textarea.focus();
          textarea.setSelectionRange(newPos, newPos);
          box.hidden = true;
          textarea.dispatchEvent(new Event('input'));
        });
        box.appendChild(item);
      });
      box.hidden = false;
    }

    textarea.addEventListener('input', update);
    textarea.addEventListener('click', update);
    textarea.addEventListener('keydown', (e) => {
      if (!box.hidden && e.key === 'Escape') box.hidden = true;
    });
    textarea.addEventListener('blur', () => setTimeout(() => (box.hidden = true), 150));
  },

  icon(type) {
    const icons = {
      work: '📚',
      chapter: '📂',
      scene: '📝',
      character: '🧑',
      setting: '🗺️',
      memo: '📌',
    };
    return icons[type] || '•';
  },
};
