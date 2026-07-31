// Sidebar-accessible focus timer (free countdown or Pomodoro work/break cycles).
// State lives in memory only (resets on reload) and the floating widget is mounted
// on <body> directly so it survives route changes while a session is running.
const Timer = {
  state: { mode: 'free', phase: 'work', remaining: 0, total: 0, running: false, workMin: 25, breakMin: 5 },
  intervalId: null,
  widgetEl: null,

  bindSidebarButton() {
    const btn = document.getElementById('timerBtn');
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      Timer.openPopover(btn);
    });
  },

  openPopover(anchor) {
    document.querySelectorAll('.timer-popover').forEach((el) => el.remove());
    const pop = document.createElement('div');
    pop.className = 'timer-popover';
    pop.innerHTML = `
      <div class="timer-popover__tabs">
        <button class="chip chip--active" data-mode="free">자유 설정</button>
        <button class="chip" data-mode="pomodoro">뽀모도로</button>
      </div>
      <div class="timer-popover__body" id="timerPopoverBody"></div>
    `;
    document.body.appendChild(pop);
    const rect = anchor.getBoundingClientRect();
    pop.style.bottom = `${window.innerHeight - rect.top + 8}px`;
    pop.style.left = `${Math.min(rect.left, window.innerWidth - 260)}px`;

    let activeMode = 'free';
    function renderBody() {
      const bodyEl = pop.querySelector('#timerPopoverBody');
      if (activeMode === 'free') {
        bodyEl.innerHTML = `
          <div class="form-field">
            <label>시간 (분)</label>
            <input type="number" class="input" id="timerMinutesInput" min="1" max="180" value="25">
          </div>
          <button class="btn btn--primary btn--block" id="timerStartBtn">시작</button>
        `;
        bodyEl.querySelector('#timerStartBtn').addEventListener('click', () => {
          const min = Math.max(1, Number(bodyEl.querySelector('#timerMinutesInput').value) || 25);
          Timer.start({ mode: 'free', workMin: min });
          pop.remove();
        });
      } else {
        bodyEl.innerHTML = `
          <div class="timer-preset-list">
            <button class="chip timer-preset" data-work="25" data-break="5">집중 25분 · 휴식 5분</button>
            <button class="chip timer-preset" data-work="50" data-break="10">집중 50분 · 휴식 10분</button>
            <button class="chip timer-preset" data-work="15" data-break="3">집중 15분 · 휴식 3분</button>
          </div>
        `;
        bodyEl.querySelectorAll('.timer-preset').forEach((chip) => {
          chip.addEventListener('click', () => {
            Timer.start({ mode: 'pomodoro', workMin: Number(chip.dataset.work), breakMin: Number(chip.dataset.break) });
            pop.remove();
          });
        });
      }
    }
    pop.querySelectorAll('.timer-popover__tabs .chip').forEach((tab) => {
      tab.addEventListener('click', () => {
        activeMode = tab.dataset.mode;
        pop.querySelectorAll('.timer-popover__tabs .chip').forEach((c) => c.classList.remove('chip--active'));
        tab.classList.add('chip--active');
        renderBody();
      });
    });
    renderBody();

    setTimeout(() => {
      const closeHandler = (e) => {
        if (!pop.contains(e.target) && e.target !== anchor) {
          pop.remove();
          document.removeEventListener('mousedown', closeHandler);
        }
      };
      document.addEventListener('mousedown', closeHandler);
    }, 0);
  },

  start({ mode, workMin, breakMin = 5 }) {
    Timer.stop();
    Timer.state = { mode, phase: 'work', remaining: workMin * 60, total: workMin * 60, running: true, workMin, breakMin };
    Timer.mountWidget();
    Timer.intervalId = setInterval(Timer.tick, 1000);
  },

  tick() {
    if (!Timer.state.running) return;
    Timer.state.remaining--;
    if (Timer.state.remaining <= 0) {
      Utils.beep();
      if (Timer.state.mode === 'pomodoro') {
        const nextPhase = Timer.state.phase === 'work' ? 'break' : 'work';
        const nextMin = nextPhase === 'work' ? Timer.state.workMin : Timer.state.breakMin;
        UI.toast(nextPhase === 'break' ? '🍵 휴식 시간입니다' : '✍️ 다시 집중할 시간입니다');
        Timer.state.phase = nextPhase;
        Timer.state.remaining = nextMin * 60;
        Timer.state.total = nextMin * 60;
      } else {
        UI.toast('⏱ 타이머가 종료되었습니다');
        Timer.state.running = false;
        clearInterval(Timer.intervalId);
        Timer.intervalId = null;
      }
    }
    Timer.renderWidget();
  },

  stop() {
    if (Timer.intervalId) clearInterval(Timer.intervalId);
    Timer.intervalId = null;
    Timer.state.running = false;
    if (Timer.widgetEl) { Timer.widgetEl.remove(); Timer.widgetEl = null; }
  },

  togglePause() {
    Timer.state.running = !Timer.state.running;
    Timer.renderWidget();
  },

  mountWidget() {
    if (Timer.widgetEl) Timer.widgetEl.remove();
    Timer.widgetEl = document.createElement('div');
    Timer.widgetEl.className = 'timer-widget';
    document.body.appendChild(Timer.widgetEl);
    Timer.renderWidget();
  },

  renderWidget() {
    if (!Timer.widgetEl) return;
    const { remaining, total, running, mode, phase } = Timer.state;
    const mm = String(Math.floor(Math.max(0, remaining) / 60)).padStart(2, '0');
    const ss = String(Math.max(0, remaining) % 60).padStart(2, '0');
    const pct = total ? Math.max(0, Math.min(1, 1 - remaining / total)) : 0;
    const deg = Math.round(pct * 360);
    const phaseLabel = mode === 'pomodoro' ? (phase === 'work' ? '🎯 집중 중' : '🍵 휴식 중') : '🎯 집중 타이머';
    Timer.widgetEl.innerHTML = `
      <div class="timer-widget__ring" style="background: conic-gradient(var(--accent) ${deg}deg, var(--bg-elevated-2) 0deg)">
        <div class="timer-widget__ring-inner">${mm}:${ss}</div>
      </div>
      <div class="timer-widget__info">
        <div class="timer-widget__phase">${phaseLabel}</div>
        <div class="timer-widget__controls">
          <button class="icon-btn" id="timerPauseBtn" title="${running ? '일시정지' : '재개'}">${running ? '⏸' : '▶'}</button>
          <button class="icon-btn" id="timerStopBtn" title="정지">■</button>
        </div>
      </div>
    `;
    Timer.widgetEl.querySelector('#timerPauseBtn').addEventListener('click', () => Timer.togglePause());
    Timer.widgetEl.querySelector('#timerStopBtn').addEventListener('click', () => Timer.stop());
  },
};
