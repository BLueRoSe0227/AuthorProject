// Sidebar-accessible focus timer (free countdown or Pomodoro work/break cycles).
// State lives in memory only (resets on reload) and the floating widget is mounted
// on <body> directly so it survives route changes while a session is running.
const TIMER_COLORS = Utils.PALETTE_COLORS;
const TIMER_SCALE_MIN = 0.8;
const TIMER_SCALE_MAX = 1.6;

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
      <div class="timer-popover__colors" id="timerColorRow"></div>
    `;
    document.body.appendChild(pop);
    const rect = anchor.getBoundingClientRect();
    pop.style.bottom = `${window.innerHeight - rect.top + 8}px`;
    pop.style.left = `${Math.min(rect.left, window.innerWidth - 260)}px`;

    const colorRow = pop.querySelector('#timerColorRow');
    const currentColor = Timer.getColor();
    TIMER_COLORS.forEach((c) => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'timer-color-dot' + (c === currentColor ? ' timer-color-dot--selected' : '');
      dot.style.background = c;
      dot.title = '위젯 색상';
      dot.addEventListener('click', () => {
        Timer.setColor(c);
        colorRow.querySelectorAll('.timer-color-dot').forEach((d) => d.classList.remove('timer-color-dot--selected'));
        dot.classList.add('timer-color-dot--selected');
      });
      colorRow.appendChild(dot);
    });

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

  // ---- Position / size / color (persisted so they survive reloads and re-mounts) ----
  getColor() {
    return localStorage.getItem('sw-timer-color') || TIMER_COLORS[0];
  },
  setColor(color) {
    localStorage.setItem('sw-timer-color', color);
    if (Timer.widgetEl) Timer.widgetEl.style.setProperty('--timer-color', color);
  },
  getScale() {
    const saved = parseFloat(localStorage.getItem('sw-timer-scale'));
    return saved && saved >= TIMER_SCALE_MIN && saved <= TIMER_SCALE_MAX ? saved : 1;
  },
  setScale(scale) {
    const clamped = Math.min(TIMER_SCALE_MAX, Math.max(TIMER_SCALE_MIN, scale));
    localStorage.setItem('sw-timer-scale', String(clamped));
    if (Timer.widgetEl) Timer.widgetEl.style.transform = `scale(${clamped})`;
    return clamped;
  },
  getPos() {
    try {
      const saved = JSON.parse(localStorage.getItem('sw-timer-pos'));
      if (saved && typeof saved.left === 'number' && typeof saved.top === 'number') return saved;
    } catch (e) {}
    return null;
  },
  setPos(left, top) {
    // Keep the widget fully on-screen even if the viewport shrank since it was last positioned.
    const clampedLeft = Math.min(Math.max(0, left), window.innerWidth - 60);
    const clampedTop = Math.min(Math.max(0, top), window.innerHeight - 40);
    localStorage.setItem('sw-timer-pos', JSON.stringify({ left: clampedLeft, top: clampedTop }));
    if (Timer.widgetEl) {
      Timer.widgetEl.style.left = `${clampedLeft}px`;
      Timer.widgetEl.style.top = `${clampedTop}px`;
      Timer.widgetEl.style.right = 'auto';
      Timer.widgetEl.style.bottom = 'auto';
    }
  },

  // Drag is bound once per mount to the stable outer widgetEl — renderWidget() below
  // replaces widgetEl's *children* every tick, but never widgetEl itself, so this
  // listener isn't lost between ticks the way per-child listeners would be.
  bindDrag() {
    Timer.widgetEl.addEventListener('mousedown', (e) => {
      if (e.target.closest('button') || e.target.closest('.timer-widget__resize-handle')) return;
      e.preventDefault();
      const startX = e.clientX;
      const startY = e.clientY;
      const rect = Timer.widgetEl.getBoundingClientRect();
      function onMove(ev) {
        Timer.setPos(rect.left + (ev.clientX - startX), rect.top + (ev.clientY - startY));
      }
      function onUp() {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      }
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    });
  },

  mountWidget() {
    if (Timer.widgetEl) Timer.widgetEl.remove();
    Timer.widgetEl = document.createElement('div');
    Timer.widgetEl.className = 'timer-widget';
    Timer.widgetEl.style.setProperty('--timer-color', Timer.getColor());
    Timer.widgetEl.style.transform = `scale(${Timer.getScale()})`;
    const pos = Timer.getPos();
    if (pos) {
      Timer.widgetEl.style.left = `${pos.left}px`;
      Timer.widgetEl.style.top = `${pos.top}px`;
      Timer.widgetEl.style.right = 'auto';
      Timer.widgetEl.style.bottom = 'auto';
    }
    document.body.appendChild(Timer.widgetEl);
    Timer.bindDrag();
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
      <div class="timer-widget__ring" style="background: conic-gradient(var(--timer-color) ${deg}deg, var(--bg-elevated-2) 0deg)">
        <div class="timer-widget__ring-inner">${mm}:${ss}</div>
      </div>
      <div class="timer-widget__info">
        <div class="timer-widget__phase">${phaseLabel}</div>
        <div class="timer-widget__controls">
          <button class="icon-btn" id="timerPauseBtn" title="${running ? '일시정지' : '재개'}">${running ? '⏸' : '▶'}</button>
          <button class="icon-btn" id="timerStopBtn" title="정지">■</button>
        </div>
      </div>
      <div class="timer-widget__resize-handle" title="드래그해서 크기 조절"></div>
    `;
    Timer.widgetEl.querySelector('#timerPauseBtn').addEventListener('click', () => Timer.togglePause());
    Timer.widgetEl.querySelector('#timerStopBtn').addEventListener('click', () => Timer.stop());

    // Also re-bound every tick, same reasoning as the pause/stop buttons above —
    // renderWidget() just replaced this handle's DOM node.
    Timer.widgetEl.querySelector('.timer-widget__resize-handle').addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation(); // don't also trigger the drag-to-move handler on widgetEl
      const startX = e.clientX;
      const startScale = Timer.getScale();
      function onMove(ev) {
        Timer.setScale(startScale + (ev.clientX - startX) / 100);
      }
      function onUp() {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      }
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    });
  },
};
