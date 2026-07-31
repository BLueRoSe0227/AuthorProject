// Captured as early as possible (module load time, before DOMContentLoaded) so the
// prompt is available the moment the user clicks the in-app install button.
let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
});
window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  UI.toast('앱이 설치되었습니다');
});

const App = {
  state: {
    currentWorkId: null,
    lastWorkId: null,
  },

  async init() {
    this.bindSidebar();
    this.bindSidebarCollapse();
    this.bindGlobalSearch();
    this.bindSettings();
    Timer.bindSidebarButton();
    this.registerServiceWorker();
    await Models.migrateLegacyData();
    await this.refreshWorkSwitcher();
    await Router.resolve();
    Onboarding.maybeShow();
    App.maybeRemindBackup();
  },

  // Called whenever the user exports data in any form (full JSON backup or a
  // manuscript export) — see IMPROVEMENTS.md MD-02: with no server, real cloud
  // sync isn't possible here, so this just tracks recency for the reminder below.
  recordExport() {
    localStorage.setItem('sw-last-export-at', String(Date.now()));
  },

  maybeRemindBackup() {
    const shownOn = localStorage.getItem('sw-backup-reminder-shown-on');
    if (shownOn === Utils.todayStr()) return;
    const lastExportAt = Number(localStorage.getItem('sw-last-export-at') || 0);
    const daysSince = lastExportAt ? Math.floor((Date.now() - lastExportAt) / 86400000) : Infinity;
    if (daysSince < 7) return;
    localStorage.setItem('sw-backup-reminder-shown-on', Utils.todayStr());
    const msg = lastExportAt
      ? `마지막 백업이 ${daysSince}일 지났어요 · 설정 > 데이터 관리에서 내보내기 해보세요`
      : '아직 데이터를 내보낸 적이 없어요 · 설정 > 데이터 관리에서 백업해두세요';
    UI.toast(`💾 ${msg}`, 'info', 6000);
  },

  async promptInstall() {
    if (!deferredInstallPrompt) {
      UI.toast('이 브라우저에서는 자동 설치를 지원하지 않아요. 주소창의 설치 아이콘이나 브라우저 메뉴의 "앱 설치"를 이용해주세요.');
      return;
    }
    deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    if (choice.outcome === 'accepted') UI.toast('설치를 시작합니다');
  },

  bindSidebarCollapse() {
    const btn = document.getElementById('sidebarCollapseBtn');
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const collapsed = document.documentElement.toggleAttribute('data-sidebar-collapsed');
      localStorage.setItem('sw-sidebar-collapsed', String(collapsed));
    });
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
    // The landing page shows only the work-picker dashboard, full-screen; the sidebar
    // (with the work switcher and nav) only reappears once a work is open.
    document.body.classList.toggle('home-route', location.hash === '' || location.hash === '#/');
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
      <div class="settings-section">
        <h4>📲 앱으로 설치</h4>
        <p class="muted">브라우저 탭 대신 독립된 창으로 실행하고, 오프라인에서도 열 수 있어요.</p>
        <button class="btn btn--ghost btn--block" id="installAppBtn">📲 앱 설치</button>
      </div>
      <div class="data-menu">
        <button class="btn btn--block" id="exportBtn">📤 전체 데이터 내보내기 (JSON)</button>
        <label class="btn btn--block" for="importInput">📥 데이터 가져오기 (JSON)</label>
        <input type="file" id="importInput" accept="application/json" hidden>
        <button class="btn btn--block btn--danger" id="clearBtn">🗑 전체 데이터 삭제</button>
      </div>`;

    body.querySelector('#installAppBtn').addEventListener('click', () => App.promptInstall());

    body.querySelector('#exportBtn').addEventListener('click', async () => {
      const payload = await DB.exportAll();
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `storyweaver-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      App.recordExport();
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
