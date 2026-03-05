(() => {
  'use strict';

  // ── MULTIPLIER DATA ──────────────────────────────────────────
  const ROWS = {
    12: [
      [5.6, 2.1, 1.3, 0.7, 0.4, 0.3, 0.4, 0.7, 1.3, 2.1, 5.6],
      [3, 1.4, 0.9, 0.6, 0.4, 0.3, 0.4, 0.6, 0.9, 1.4, 3],
      [13, 5.6, 2.1, 1.3, 0.5, 0.2, 0.5, 1.3, 2.1, 5.6, 13]
    ],
    14: [
      [18, 3.2, 1.6, 1.3, 1.2, 1.1, 1, 0.5, 1, 1.1, 1.2, 1.3, 1.6, 3.2, 18],
      [55, 12, 5.6, 3.2, 1.6, 1, 0.7, 0.2, 0.7, 1, 1.6, 3.2, 5.6, 12, 55],
      [353, 49, 14, 5.3, 2.1, 0.5, 0.2, 0, 0.2, 0.5, 2.1, 5.3, 14, 49, 353]
    ],
    16: [
      [110, 41, 10, 5, 3, 1.5, 1, 0.5, 0.3, 0.5, 1, 1.5, 3, 5, 10, 41, 110],
      [900, 130, 26, 9, 4, 2, 0.7, 0.3, 0.2, 0.3, 0.7, 2, 4, 9, 26, 130, 900],
      [1000, 500, 100, 22, 8, 2, 0.5, 0.2, 0, 0.2, 0.5, 2, 8, 22, 100, 500, 1000]
    ]
  };

  function sv(m) {
    if (m <= 0)  return 'sv r0';
    if (m < 0.5) return 'sv r0';
    if (m < 1)   return 'sv r1';
    if (m < 1.1) return 'sv g6';
    if (m < 1.5) return 'sv g5';
    if (m < 3)   return 'sv g4';
    if (m < 5)   return 'sv g3';
    if (m < 10)  return 'sv g2';
    if (m < 18)  return 'sv g1';
    return 'sv g0';
  }

  function histColor(m) {
    if (m >= 10)  return '#e67700';
    if (m >= 3)   return '#4caf2a';
    if (m >= 1)   return '#5bba40';
    if (m >= 0.5) return '#c0392b';
    return '#8b0000';
  }

  const BET_MIN  = 10;
  const BET_MAX  = 100;
  const BET_STEP = 10;

  // ── STATE ────────────────────────────────────────────────────
  let balance  = 3000;
  let bet      = BET_MIN;
  let numPins  = 14;
  let playCount = 0;
  const hist   = [];

  // ── DOM ──────────────────────────────────────────────────────
  const canvas     = document.getElementById('plinkoCanvas');
  const ctx        = canvas.getContext('2d');
  const balanceEl  = document.getElementById('balanceDisplay');
  const betEl      = document.getElementById('betDisplay');
  const winFlash   = document.getElementById('winFlash');
  const histEl     = document.getElementById('histItems');
  const maxWinEl   = document.getElementById('maxWinVal');
  const row0El     = document.getElementById('row0');
  const row1El     = document.getElementById('row1');
  const row2El     = document.getElementById('row2');
  const btnPlay    = document.getElementById('btnAuto');
  const btnMinus   = document.getElementById('btnMinus');
  const btnPlus    = document.getElementById('btnPlus');
  const pinsBtn    = document.getElementById('pinsBtn');
  const pinsBtnLbl = document.getElementById('pinsBtnLbl');
  const pinsMenu   = document.getElementById('pinsMenu');
  const ctaOverlay = document.getElementById('ctaOverlay');

  // ── CANVAS STATE ─────────────────────────────────────────────
  let W, H, PR, pinR, ballR, layout;
  let activeBalls = [];
  let hitSlotIdx  = -1;

  // ── RESIZE / LAYOUT ──────────────────────────────────────────
  function resize() {
    const wrap = canvas.parentElement;
    W = wrap.clientWidth;
    H = wrap.clientHeight;
    PR = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width  = W * PR;
    canvas.height = H * PR;
    canvas.style.width  = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(PR, 0, 0, PR, 0, 0);

    buildLayout();
    redraw();
  }

  function buildLayout() {
    layout = { rows: [] };
    const rows = numPins;
    const padX = W * 0.10;
    const padT = H * 0.05;
    const padB = H * 0.08;
    const useW = W - padX * 2;
    const useH = H - padT - padB;

    pinR  = Math.max(4, Math.min(W / 90, 6.5));
    ballR = pinR * 1.65;

    for (let r = 0; r < rows; r++) {
      const cols   = r + 2;
      const rowY   = padT + (useH / (rows - 1)) * r;
      const rowW   = useW * (cols - 1) / rows;
      const startX = W / 2 - rowW / 2;
      const step   = cols > 1 ? rowW / (cols - 1) : 0;
      const row    = [];
      for (let c = 0; c < cols; c++) {
        row.push({ x: startX + c * step, y: rowY });
      }
      layout.rows.push(row);
    }

    const mults  = ROWS[numPins][0];
    const n      = mults.length;
    const totW   = useW * (rows + 1) / rows;
    const startX = W / 2 - totW / 2;
    const slotW  = totW / n;
    layout.slotW      = slotW;
    layout.slotStartX = startX;
    layout.slots      = mults.map((m, i) => ({
      x: startX + i * slotW + slotW / 2,
      w: slotW, m
    }));
    layout.padB = padB;
  }

  // ── DRAW ─────────────────────────────────────────────────────
  function redraw() {
    if (!layout || !W || !H) return;
    ctx.clearRect(0, 0, W, H);

    // slot hit glow
    if (hitSlotIdx >= 0 && layout.slots) {
      const sx = layout.slotStartX + hitSlotIdx * layout.slotW;
      const sy = H - layout.padB * 0.65;
      const sh = layout.padB * 0.5;
      ctx.save();
      ctx.shadowColor = '#fff';
      ctx.shadowBlur  = 20;
      ctx.fillStyle   = 'rgba(255,255,255,.3)';
      rr(sx + 1, sy, layout.slotW - 2, sh, 3);
      ctx.fill();
      ctx.restore();
    }

    // pins
    layout.rows.forEach(row => {
      row.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x + 1, p.y + 1, pinR, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,.2)';
        ctx.fill();

        ctx.beginPath();
        ctx.arc(p.x, p.y, pinR, 0, Math.PI * 2);
        const g = ctx.createRadialGradient(
          p.x - pinR * .3, p.y - pinR * .3, .5,
          p.x, p.y, pinR
        );
        g.addColorStop(0,   '#ffffff');
        g.addColorStop(0.6, '#d8f4f8');
        g.addColorStop(1,   '#a0dce4');
        ctx.fillStyle = g;
        ctx.fill();
      });
    });

    // balls
    activeBalls.forEach(ball => {
      ctx.beginPath();
      ctx.arc(ball.x + 1.5, ball.y + 2, ballR, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,.3)';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ballR, 0, Math.PI * 2);
      const bg = ctx.createRadialGradient(
        ball.x - ballR * .3, ball.y - ballR * .3, ballR * .05,
        ball.x, ball.y, ballR
      );
      bg.addColorStop(0,   '#ffffff');
      bg.addColorStop(0.3, '#ffe066');
      bg.addColorStop(0.7, '#ff9500');
      bg.addColorStop(1,   '#c05000');
      ctx.fillStyle       = bg;
      ctx.shadowColor     = 'rgba(255,160,0,.65)';
      ctx.shadowBlur      = 14;
      ctx.fill();
      ctx.shadowBlur      = 0;
    });
  }

  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  // ── SLOT ROWS ────────────────────────────────────────────────
  function buildSlotRows() {
    const [r0, r1, r2] = ROWS[numPins];
    function fill(el, mults) {
      el.innerHTML = '';
      mults.forEach(m => {
        const d = document.createElement('div');
        d.className   = sv(m);
        d.textContent = m + 'x';
        el.appendChild(d);
      });
    }
    fill(row0El, r0);
    fill(row1El, r1);
    fill(row2El, r2);
    maxWinEl.textContent = Math.max(...r2) + 'x';
  }

  function hitSlot(idx) {
    [row0El, row1El, row2El].forEach(rowEl => {
      Array.from(rowEl.children).forEach((el, i) => {
        el.classList.toggle('hit', i === idx);
      });
    });
    setTimeout(() => {
      [row0El, row1El, row2El].forEach(rowEl => {
        Array.from(rowEl.children).forEach(el => el.classList.remove('hit'));
      });
    }, 900);
  }

  // ── HISTORY ──────────────────────────────────────────────────
  function addHist(m) {
    hist.unshift(m);
    if (hist.length > 12) hist.pop();
    histEl.innerHTML = '';
    hist.forEach(v => {
      const d = document.createElement('div');
      d.className        = 'hist-dot';
      d.style.background = histColor(v);
      d.textContent      = v >= 10 ? Math.round(v) + 'x' : v + 'x';
      histEl.appendChild(d);
    });
  }

  // ── SIMULATE PATH ────────────────────────────────────────────
  function simPath() {
    const rows = numPins;
    let col    = 0;
    const dec  = [];
    for (let r = 0; r < rows; r++) {
      const go = Math.random() < .5 ? 0 : 1;
      dec.push(go);
      col += go;
    }

    const kf = [];
    kf.push({ x: W / 2, y: layout.rows[0][0].y - H * .06 });

    let cur = 0;
    for (let r = 0; r < rows; r++) {
      const pin  = layout.rows[r][cur];
      const side = dec[r] === 1 ? 1 : -1;
      kf.push({ x: pin.x + side * pinR * 1.9, y: pin.y + pinR * .4 });
      cur += dec[r];
    }

    const s = layout.slots[col];
    kf.push({ x: s.x, y: H - layout.padB * .3 });

    return { kf, slotIdx: col };
  }

  // ── RENDER LOOP — one shared rAF for all balls ───────────────
  let renderLoopRunning = false;
  function startRenderLoop() {
    if (renderLoopRunning) return;
    renderLoopRunning = true;
    function loop() {
      redraw();
      if (activeBalls.length > 0) {
        requestAnimationFrame(loop);
      } else {
        renderLoopRunning = false;
      }
    }
    requestAnimationFrame(loop);
  }

  // ── ANIMATE (time-based — speed independent of monitor Hz) ───
  function animate(kf, slotIdx, done) {
    // 6 steps per segment at 60fps = 100ms per segment
    const MS_PER_SEG = (1000 / 60) * 11;
    const ease = t => t < .5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    const ballObj = { x: kf[0].x, y: kf[0].y, active: true };
    activeBalls.push(ballObj);
    startRenderLoop();

    let seg = 0;
    let segStart = null;

    function tick(ts) {
      if (!ballObj.active) return;
      if (segStart === null) segStart = ts;

      const elapsed = ts - segStart;
      const t = Math.min(elapsed / MS_PER_SEG, 1);

      if (seg >= kf.length - 1) {
        ballObj.x = kf[kf.length - 1].x;
        ballObj.y = kf[kf.length - 1].y;
        hitSlotIdx = slotIdx;
        ballObj.active = false;
        activeBalls = activeBalls.filter(b => b !== ballObj);
        setTimeout(() => { hitSlotIdx = -1; }, 400);
        done();
        return;
      }

      const et  = ease(t);
      const a   = kf[seg], b = kf[seg + 1];
      const arc = -Math.sin(Math.PI * t) * 4;
      ballObj.x = a.x + (b.x - a.x) * et;
      ballObj.y = a.y + (b.y - a.y) * et + arc;

      if (t >= 1) {
        seg++;
        segStart = ts;
      }

      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  // ── PLAY ─────────────────────────────────────────────────────
  function play() {
    const curBet = bet;
    balance = Math.max(0, +(balance - curBet).toFixed(2));
    updateUI();

    const { kf, slotIdx } = simPath();
    const mult = ROWS[numPins][0][slotIdx];
    const win  = +(curBet * mult).toFixed(2);

    animate(kf, slotIdx, () => {
      balance = +(balance + win).toFixed(2);
      updateUI();
      hitSlot(slotIdx);
      addHist(mult);

      winFlash.textContent = '+' + win.toFixed(2) + ' USD';
      winFlash.classList.add('show');
      setTimeout(() => winFlash.classList.remove('show'), 1200);

      playCount++;
      if (playCount >= 3 || mult >= 10) {
        setTimeout(() => showCTA(), 400);
      }
    });
  }

  function showCTA() {
    ctaOverlay.classList.add('show');
    if (typeof confetti !== 'function') return;

    // Create a canvas positioned between popup overlay and popup content
    const confettiCanvas = document.createElement('canvas');
    confettiCanvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:1000;';
    ctaOverlay.insertBefore(confettiCanvas, ctaOverlay.querySelector('.popup__content'));

    const myConfetti = confetti.create(confettiCanvas, { resize: true });
    const duration = 4000;
    const fadeOut  = 1500;
    const count    = 4;
    const end = Date.now() + duration;

    (function frame() {
      myConfetti({ particleCount: count, angle: 60,  spread: 55, origin: { x: 0, y: 0.6 } });
      myConfetti({ particleCount: count, angle: 120, spread: 55, origin: { x: 1, y: 0.6 } });
      if (Date.now() < end) {
        requestAnimationFrame(frame);
      } else {
        // Плавне зникання canvas
        confettiCanvas.style.transition = `opacity ${fadeOut}ms ease`;
        confettiCanvas.style.opacity = '0';
        setTimeout(() => confettiCanvas.remove(), fadeOut);
      }
    })();
  }

  function updateUI() {
    balanceEl.textContent = balance.toLocaleString('en-US',
      { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    betEl.textContent = bet.toFixed(2);
  }

  // ── EVENTS ───────────────────────────────────────────────────
  btnPlay.addEventListener('click', () => play());

  btnMinus.addEventListener('click', () => {
    if (bet > BET_MIN) { bet = Math.max(BET_MIN, bet - BET_STEP); updateUI(); }
  });
  btnPlus.addEventListener('click', () => {
    if (bet < BET_MAX) { bet = Math.min(BET_MAX, bet + BET_STEP); updateUI(); }
  });

  pinsBtn.addEventListener('click', e => {
    e.stopPropagation();
    pinsMenu.classList.toggle('open');
  });
  document.addEventListener('click', () => pinsMenu.classList.remove('open'));
  pinsMenu.addEventListener('click', e => {
    const item = e.target.closest('.pins-item');
    if (!item) return;
    numPins = +item.dataset.val;
    pinsBtnLbl.textContent = numPins;
    pinsMenu.classList.remove('open');
    buildSlotRows();
    buildLayout();
    redraw();
  });

  window.addEventListener('resize', () => { resize(); buildSlotRows(); });

  // ── INIT ─────────────────────────────────────────────────────
  requestAnimationFrame(() => {
    resize();
    buildSlotRows();
    updateUI();
  });

})();
