const Router = {
  routes: [
    { pattern: /^#\/$/, handler: () => Views.home() },
    { pattern: /^#\/work\/([^\/\?]+)\/dashboard/, handler: (m) => Views.dashboard(m[1]) },
    { pattern: /^#\/work\/([^\/\?]+)\/manuscript\/([^\/\?]+)/, handler: (m) => Views.manuscript(m[1], m[2]) },
    { pattern: /^#\/work\/([^\/\?]+)\/manuscript/, handler: (m) => Views.manuscript(m[1], null) },
    { pattern: /^#\/work\/([^\/\?]+)\/characters/, handler: (m) => Views.characters(m[1]) },
    { pattern: /^#\/work\/([^\/\?]+)\/settings/, handler: (m) => Views.settingNotes(m[1]) },
    { pattern: /^#\/work\/([^\/\?]+)\/inbox/, handler: (m) => Views.inbox(m[1]) },
    { pattern: /^#\/work\/([^\/\?]+)\/research/, handler: (m) => Views.research(m[1]) },
    { pattern: /^#\/work\/([^\/\?]+)\/goals/, handler: (m) => Views.goals(m[1]) },
    { pattern: /^#\/search/, handler: () => Views.searchView() },
  ],

  query() {
    const hash = location.hash;
    const qIdx = hash.indexOf('?');
    return new URLSearchParams(qIdx >= 0 ? hash.slice(qIdx + 1) : '');
  },

  currentWorkId() {
    const m = location.hash.match(/^#\/work\/([^\/\?]+)/);
    return m ? m[1] : null;
  },

  async resolve() {
    const hash = location.hash || '#/';
    // Focus mode is a transient per-visit UI state (see manuscript.js); never let it
    // survive a navigation away from the manuscript view (e.g. via the Ctrl+K search
    // shortcut, which stays active even while the sidebar is hidden in focus mode).
    if (!/^#\/work\/[^\/?]+\/manuscript/.test(hash)) document.body.classList.remove('focus-mode');
    for (const route of this.routes) {
      const m = hash.match(route.pattern);
      if (m) {
        await App.onNavigate(this.currentWorkId());
        route.handler(m);
        return;
      }
    }
    location.hash = '#/';
  },

  go(path) {
    location.hash = path;
  },
};

window.addEventListener('hashchange', () => Router.resolve());
