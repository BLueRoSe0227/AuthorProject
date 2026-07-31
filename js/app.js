const App = {
  state: {
    currentWorkId: null,
    lastWorkId: null,
  },

  async init() {
    this.bindSidebar();
    this.bindGlobalSearch();
    this.bindSettings();
    this.registerServiceWorker();
    await this.refreshWorkSwitcher();
    await Router.resolve();
  },

  bindSettings() {
    document.getElementById('settingsBtn').addEventListener('click', () => {
      Views.openSettings(this.state.currentWorkId || this.state.lastWorkId);
    });
  },

  registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  },

  async onNavigate(workId) {
    this.state.currentWorkId = workId;
    const nav = document.getElementById('workNav');
    const contextWorkId = workId || this.state.lastWorkId;
    if (contextWorkId) {
      const work = await DB.get('works', contextWorkId);
      if (work) {
        this.state.lastWorkId = contextWorkId;
        document.getElementById('currentWorkTitle').textContent = work.title;
        document.getElementById('currentWorkColor').style.background = work.color;
        nav.hidden = false;
      } else {
        this.state.lastWorkId = null;
        nav.hidden = true;
      }
    } else {
      document.getElementById('currentWorkTitle').textContent = '작품을 선택하세요';
      document.getElementById('currentWorkColor').style.background = 'transparent';
      nav.hidden = true;
    }
    const segMatch = location.hash.match(/^#\/work\/[^\/?]+\/([a-z]+)/);
    const seg = segMatch ? segMatch[1] : null;
    document.querySelectorAll('.nav__item').forEach((el) => {
      el.classList.toggle('nav__item--active', !!seg && el.dataset.nav === seg);
    });
  },

  bindSidebar() {
    document.querySelector('.brand').addEventListener('click', () => Router.go('#/'));

    document.querySelectorAll('.nav__item').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        const workId = this.state.currentWorkId || this.state.lastWorkId;
        if (!workId) return;
        Router.go(`#/work/${workId}/${el.dataset.nav}`);
      });
    });

    const btn = document.getElementById('workSwitcherBtn');
    const menu = document.getElementById('workSwitcherMenu');
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      menu.hidden = !menu.hidden;
    });
    document.addEventListener('click', () => (menu.hidden = true));
  },

  async refreshWorkSwitcher() {
    const menu = document.getElementById('workSwitcherMenu');
    const works = await DB.getAll('works');
    works.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    menu.innerHTML = '';
    works.forEach((w) => {
      const item = document.createElement('div');
      item.className = 'work-switcher__item';
      item.innerHTML = `<span class="work-dot" style="background:${w.color}"></span><span>${Utils.escapeHtml(w.title)}</span>`;
      item.addEventListener('click', () => {
        menu.hidden = true;
        Router.go(`#/work/${w.id}/dashboard`);
      });
      menu.appendChild(item);
    });
    const newItem = document.createElement('div');
    newItem.className = 'work-switcher__item work-switcher__item--new';
    newItem.innerHTML = `<span>+</span><span>새 작품 만들기</span>`;
    newItem.addEventListener('click', async () => {
      menu.hidden = true;
      await Views.createWorkFlow();
    });
    menu.appendChild(newItem);
  },

  bindGlobalSearch() {
    document.getElementById('globalSearchBtn').addEventListener('click', () => Router.go('#/search'));
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        Router.go('#/search');
      }
    });
  },

  // Renders the export/import/clear controls into a container. Used inside the
  // "데이터 관리" tab of the unified settings modal.
  renderDataPanel(body) {
    body.innerHTML = `
      <div class="data-menu">
        <button class="btn btn--block" id="exportBtn">📤 전체 데이터 내보내기 (JSON)</button>
        <label class="btn btn--block" for="importInput">📥 데이터 가져오기 (JSON)</label>
        <input type="file" id="importInput" accept="application/json" hidden>
        <button class="btn btn--block btn--danger" id="clearBtn">🗑 전체 데이터 삭제</button>
      </div>`;

    body.querySelector('#exportBtn').addEventListener('click', async () => {
      const payload = await DB.exportAll();
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `storyweaver-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      UI.toast('내보내기 완료');
    });

    body.querySelector('#importInput').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const text = await file.text();
      try {
        const payload = JSON.parse(text);
        const ok = await UI.confirm('기존 데이터에 병합합니다. 같은 ID의 항목은 덮어씁니다. 계속할까요?', {
          title: '데이터 가져오기',
        });
        if (!ok) return;
        await DB.importAll(payload, 'merge');
        UI.closeModal();
        UI.toast('가져오기 완료');
        await App.refreshWorkSwitcher();
        Router.resolve();
      } catch (err) {
        UI.toast('올바른 JSON 파일이 아닙니다', 'error');
      }
    });

    body.querySelector('#clearBtn').addEventListener('click', async () => {
      const ok = await UI.confirm('모든 작품과 데이터가 영구적으로 삭제됩니다. 정말 삭제할까요?', {
        title: '전체 데이터 삭제',
        confirmLabel: '삭제',
        danger: true,
      });
      if (!ok) return;
      await DB.clearAll();
      UI.closeModal();
      UI.toast('모든 데이터가 삭제되었습니다');
      await App.refreshWorkSwitcher();
      Router.go('#/');
    });
  },
};

document.addEventListener('DOMContentLoaded', () => App.init());
