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

// Cloud sync (see App.cloudSave/cloudLoad) gzips the export before sending —
// Netlify Functions reject request/response bodies above ~6MB at the platform
// level (a hard limit, not something retrying or a bigger client-side check can
// work around), and a full data export easily exceeds that once a few base64
// images are in the mix. Wire format is plain base64 text wrapped in JSON
// ({"data":"..."}) rather than a true binary body, so there's no ambiguity
// around Netlify's binary-body detection — see sync.js.
async function gzipToBase64(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
  const compressed = new Uint8Array(await new Response(stream).arrayBuffer());
  return bytesToBase64(compressed);
}

async function base64ToGunzipJson(b64) {
  const bytes = base64ToBytes(b64);
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  const text = await new Response(stream).text();
  return JSON.parse(text);
}

// btoa/atob need a plain string of char codes; spreading a large typed array
// directly into String.fromCharCode can blow the call stack, so this chunks it.
function bytesToBase64(bytes) {
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}
function base64ToBytes(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// Retries only on network-level failures (fetch throwing — offline, DNS, timeout),
// never on HTTP error responses: a 4xx/5xx is the server's real answer, and
// cloudLoad's full-dataset replace shouldn't be retried against a server that's
// actively rejecting it (DEV-25).
async function fetchWithRetry(url, options, retries = 2) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetch(url, options);
    } catch (err) {
      if (attempt >= retries) throw err;
      await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
    }
  }
}

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
  // manuscript export) — tracks recency for maybeRemindBackup below. Separate
  // from cloud sync (App.cloudSave/cloudLoad below), which has its own
  // last-synced timestamp since the two are independent habits.
  recordExport() {
    localStorage.setItem('sw-last-export-at', String(Date.now()));
  },

  // ---- Cloud sync (manual, 6-digit PIN, see netlify/functions/sync.js) ----
  // Deliberately whole-dataset overwrite in both directions, not a merge — see
  // sync.js's header comment for why an automatic merge across two independently
  // -edited devices would be unsafe.
  async cloudSave(pin) {
    const payload = await DB.exportAll();
    const compressed = await gzipToBase64(payload);
    const res = await fetchWithRetry(`/api/sync?pin=${encodeURIComponent(pin)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: compressed }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error((data && data.error) || `저장 실패 (${res.status})`);
    localStorage.setItem('sw-cloud-pin', pin);
    localStorage.setItem('sw-cloud-last-sync-at', String(Date.now()));
  },

  async cloudLoad(pin) {
    const res = await fetchWithRetry(`/api/sync?pin=${encodeURIComponent(pin)}`);
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error((data && data.error) || `불러오기 실패 (${res.status})`);
    const payload = await base64ToGunzipJson(data.data);
    await DB.importAll(payload, 'replace');
    localStorage.setItem('sw-cloud-pin', pin);
    localStorage.setItem('sw-cloud-last-sync-at', String(Date.now()));
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
        document.getElementById('currentWorkTitle').textContent = work.penName ? `${work.title} · ${work.penName}` : work.title;
        const colorEl = document.getElementById('currentWorkColor');
        if (work.avatarDataUrl) {
          colorEl.style.background = 'transparent';
          colorEl.innerHTML = `<img class="nav-avatar" src="${work.avatarDataUrl}" alt="">`;
        } else {
          colorEl.innerHTML = '';
          colorEl.style.background = work.color;
        }
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
    const savedPin = localStorage.getItem('sw-cloud-pin') || '';
    const lastSyncAt = Number(localStorage.getItem('sw-cloud-last-sync-at') || 0);
    body.innerHTML = `
      <div class="settings-section">
        <h4>📲 앱으로 설치</h4>
        <p class="muted">브라우저 탭 대신 독립된 창으로 실행하고, 오프라인에서도 열 수 있어요.</p>
        <button class="btn btn--ghost btn--block" id="installAppBtn">📲 앱 설치</button>
      </div>
      <div class="settings-section">
        <h4>☁ 클라우드 동기화 (기기 간 백업)</h4>
        <p class="muted">6자리 비밀번호를 정하고, 다른 기기에서 같은 번호로 불러오면 같은 데이터를 볼 수 있어요. 실시간 동기화가 아니라 수동 저장/불러오기이며, 불러오기는 이 기기의 데이터를 완전히 교체합니다.<br><strong>주의:</strong> 계정 없이 6자리 숫자만으로 구분하는 방식이라 강력한 보안은 아니에요 — 민감한 내용 보호용으로는 쓰지 마세요. PIN을 잊으면 클라우드에 저장한 데이터를 다시 불러올 방법이 없으니 꼭 기억하거나 따로 메모해두세요.</p>
        <div class="cloud-pin-field">
          <span class="cloud-pin-field__icon" aria-hidden="true">🔒</span>
          <input type="text" class="input" id="cloudPinInput" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" placeholder="6자리 숫자 (예: 482913)" value="${Utils.escapeHtml(savedPin)}">
        </div>
        <div class="data-menu" style="margin-top:8px;">
          <button class="btn btn--block" id="cloudSaveBtn">☁️ 클라우드에 저장</button>
          <button class="btn btn--block btn--ghost btn--danger-text" id="cloudLoadBtn">⬇️ 클라우드에서 불러오기</button>
        </div>
        <p class="muted" id="cloudSyncStatus" style="margin-top:6px;">${lastSyncAt ? `마지막 동기화: ${Utils.formatDate(new Date(lastSyncAt).toISOString())}` : '아직 동기화한 적이 없습니다'}</p>
      </div>
      <div class="data-menu">
        <button class="btn btn--block" id="exportBtn">📤 전체 데이터 내보내기 (JSON)</button>
        <label class="btn btn--block" for="importInput">📥 데이터 가져오기 (JSON)</label>
        <input type="file" id="importInput" accept="application/json" hidden>
        <button class="btn btn--block btn--danger" id="clearBtn">🗑 전체 데이터 삭제</button>
      </div>`;

    body.querySelector('#installAppBtn').addEventListener('click', () => App.promptInstall());

    const pinInput = body.querySelector('#cloudPinInput');
    const statusEl = body.querySelector('#cloudSyncStatus');
    pinInput.addEventListener('input', () => {
      pinInput.value = pinInput.value.replace(/\D/g, '').slice(0, 6);
    });
    function validPin() {
      const pin = pinInput.value.trim();
      if (!/^\d{6}$/.test(pin)) {
        UI.toast('6자리 숫자를 입력해주세요', 'error');
        return null;
      }
      return pin;
    }

    body.querySelector('#cloudSaveBtn').addEventListener('click', async (e) => {
      const pin = validPin();
      if (!pin) return;
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.textContent = '저장 중...';
      try {
        await App.cloudSave(pin);
        statusEl.textContent = `마지막 동기화: ${Utils.formatDate(new Date().toISOString())}`;
        UI.toast('클라우드에 저장했습니다');
      } catch (err) {
        UI.toast(err.message, 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = '☁️ 클라우드에 저장';
      }
    });

    body.querySelector('#cloudLoadBtn').addEventListener('click', async (e) => {
      const pin = validPin();
      if (!pin) return;
      const ok = await UI.confirm('이 기기의 모든 데이터를 클라우드에 저장된 내용으로 완전히 교체합니다. 지금 이 기기에만 있는 데이터는 사라져요. 계속할까요?', {
        title: '클라우드에서 불러오기',
        confirmLabel: '교체하고 불러오기',
        danger: true,
      });
      if (!ok) return;
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.textContent = '불러오는 중...';
      try {
        await App.cloudLoad(pin);
        statusEl.textContent = `마지막 동기화: ${Utils.formatDate(new Date().toISOString())}`;
        UI.toast('클라우드에서 불러왔습니다');
        UI.closeModal();
        await App.refreshWorkSwitcher();
        Router.go('#/');
      } catch (err) {
        UI.toast(err.message, 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = '⬇️ 클라우드에서 불러오기';
      }
    });

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
