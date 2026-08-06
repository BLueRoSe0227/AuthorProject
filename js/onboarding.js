// First-run "둘러보기" walkthrough. A single self-contained modal (not a live
// spotlight tour) since the features it introduces span several different routes
// (dashboard/manuscript/characters/inbox) that can't be sequenced through easily.
const Onboarding = {
  STORAGE_KEY: 'sw-onboarded',
  // Local-only usage funnel — no external analytics service, just two counters
  // kept in localStorage: how many times each step was actually reached, and how
  // each run ended (completed/skipped/closed early). Comparing stepsReached[0..3]
  // shows where people stop going further; see getFunnelStats().
  FUNNEL_KEY: 'sw-onboarding-funnel',

  _readFunnel() {
    try {
      const data = JSON.parse(localStorage.getItem(Onboarding.FUNNEL_KEY));
      return data && typeof data === 'object' ? data : { stepsReached: {}, endReasons: {} };
    } catch (e) {
      return { stepsReached: {}, endReasons: {} };
    }
  },
  _recordStep(step) {
    const data = Onboarding._readFunnel();
    data.stepsReached[step] = (data.stepsReached[step] || 0) + 1;
    localStorage.setItem(Onboarding.FUNNEL_KEY, JSON.stringify(data));
  },
  _recordEnd(reason) {
    const data = Onboarding._readFunnel();
    data.endReasons[reason] = (data.endReasons[reason] || 0) + 1;
    localStorage.setItem(Onboarding.FUNNEL_KEY, JSON.stringify(data));
  },
  // { stepsReached: { '0': n, '1': n, ... }, endReasons: { completed: n, skipped: n, closed: n } }
  // — inspect via console: Onboarding.getFunnelStats()
  getFunnelStats() {
    return Onboarding._readFunnel();
  },

  STEPS: [
    {
      icon: '🕸️',
      title: '대시보드에서 작품을 한눈에',
      desc: '작품 카드에서 진행률, 챕터·장면·캐릭터 수, 남은 할 일, 최근 작업까지 한 번에 확인할 수 있어요.',
    },
    {
      icon: '📖',
      title: '원고는 자유롭게, 몰입해서',
      desc: '이미지·표까지 되는 에디터, 여러 장면을 동시에 보는 스플릿뷰, 방해 없이 쓰는 집중모드를 제공해요. [[캐릭터명]]처럼 쓰면 자동으로 연결돼요.',
    },
    {
      icon: '🧑‍🤝‍🧑',
      title: '관계는 해시태그로, 인물은 그룹으로',
      desc: '캐릭터 관계에 해시태그를 여러 개 붙이고, 여러 인물을 색깔 그룹으로 묶어서 관리할 수 있어요.',
    },
    {
      icon: '🗺️',
      title: '메모는 보드에, 집중은 타이머로',
      desc: '메모 인박스의 "보드" 탭에서 아이디어를 자유롭게 배치·연결해보세요. 사이드바의 타이머로 뽀모도로 집중 세션도 시작할 수 있어요.',
    },
  ],

  maybeShow() {
    if (localStorage.getItem(Onboarding.STORAGE_KEY) === 'true') return;
    Onboarding.show();
  },

  show() {
    let step = 0;

    // reason is 'completed' | 'skipped' | undefined (defaults to 'closed' — the
    // X button/backdrop-click path calls this via onClose below with no argument).
    function finish(reason = 'closed') {
      Onboarding._recordEnd(reason);
      localStorage.setItem(Onboarding.STORAGE_KEY, 'true');
      UI.closeModal();
    }

    function renderStep() {
      Onboarding._recordStep(step);
      const s = Onboarding.STEPS[step];
      const wrap = document.createElement('div');
      wrap.className = 'onboarding';
      wrap.innerHTML = `
        <div class="onboarding__icon">${s.icon}</div>
        <h3>${Utils.escapeHtml(s.title)}</h3>
        <p class="muted">${Utils.escapeHtml(s.desc)}</p>
        <div class="onboarding__dots">
          ${Onboarding.STEPS.map((_, i) => `<span class="onboarding__dot${i === step ? ' onboarding__dot--active' : ''}"></span>`).join('')}
        </div>
      `;

      const actions = [];
      if (step > 0) actions.push({ label: '이전', onClick: () => { step--; renderStep(); } });
      if (step < Onboarding.STEPS.length - 1) {
        actions.push({ label: '건너뛰기', onClick: () => finish('skipped') });
        actions.push({ label: '다음', primary: true, onClick: () => { step++; renderStep(); } });
      } else {
        actions.push({ label: '시작하기', primary: true, onClick: () => finish('completed') });
      }

      UI.openModal({
        title: `Storyweaver 둘러보기 (${step + 1}/${Onboarding.STEPS.length})`,
        bodyEl: wrap,
        actions,
        onClose: finish,
        width: '420px',
      });
    }

    renderStep();
  },
};
