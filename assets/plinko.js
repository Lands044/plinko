/*
 * Plinko — game + render + boot.
 * Config-driven: everything tunable comes from config.json (see
 * assets/plinko.config.js for the shape and defaults). A config change (config
 * panel edit, or config.json edit with dev.watch on) re-mounts the game in
 * place — no reload, no build step.
 *
 * Requires (in order): assets/config.js, assets/plinko.config.js.
 */
(function () {
  'use strict';

  var LC = window.LandingConfig;
  var PC = window.PlinkoConfig;

  // ── MULTIPLIER DATA (hardcoded, not in config) ───────────────
  // Per pin count: 3 rows of (pins + 1) multipliers. The ball pays by row 1,
  // "Max win" shows the max of row 3.
  var ROWS = {
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

  var DEFAULT_PINS      = 14;
  var CTA_ON_MULTIPLIER = 10;   // popup right away on a drop >= this
  var CTA_DELAY         = 400;
  var MS_PER_SEG        = (1000 / 60) * 11;  // ball speed: ms per pin row
  var WIN_FLASH_TIME    = 1200;
  var HISTORY_LENGTH    = 12;

  // ── COLORS ───────────────────────────────────────────────────
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

  var $ = function (id) { return document.getElementById(id); };

  // ── RENDER: config → static DOM (idempotent) ─────────────────
  function setText(selector, value) {
    var el = document.querySelector(selector);
    if (el && typeof value === 'string') el.textContent = value;
  }

  function render(config) {
    var t = config.texts;
    var g = config.game;

    document.title = t.logo || document.title;
    setText('.hdr-logo', t.logo);
    setText('.hdr-balance-cur', g.currency);
    setText('.pins-lbl', t.pinsLabel);
    setText('.max-win-lbl', t.maxWinLabel);
    setText('.bet-pill-lbl', (t.betLabel + ' ' + g.currency).trim());
    setText('.popup__title', t.popupTitle);
    setText('.popup__text', t.popupText);
    setText('.cta-button', t.ctaButton);

    var cta = document.querySelector('.cta-button');
    if (cta) {
      cta.href = config.cta.url;
      cta.target = config.cta.target;
      if (config.cta.target === '_blank') cta.rel = 'noopener';
      else cta.removeAttribute('rel');
    }
  }

  // ── GAME ─────────────────────────────────────────────────────
  function Game(config) {
    this.config = config;
    this.g = config.game;

    this.balance   = this.g.balance;
    this.bet       = this.g.bet.min;
    this.numPins   = DEFAULT_PINS;
    this.playCount = 0;
    this.hist      = [];
    this.ctaShown  = false;

    this.canvas = $('plinkoCanvas');
    this.ctx    = this.canvas.getContext('2d');
    this.el = {
      balance:  $('balanceDisplay'),
      bet:      $('betDisplay'),
      winFlash: $('winFlash'),
      hist:     $('histItems'),
      maxWin:   $('maxWinVal'),
      rows:     [$('row0'), $('row1'), $('row2')],
      play:     $('btnAuto'),
      minus:    $('btnMinus'),
      plus:     $('btnPlus'),
      pinsBtn:  $('pinsBtn'),
      pinsLbl:  $('pinsBtnLbl'),
      pinsMenu: $('pinsMenu'),
      cta:      $('ctaOverlay')
    };

    this.W = 0; this.H = 0; this.PR = 1;
    this.pinR = 0; this.ballR = 0; this.layout = null;
    this.activeBalls = [];
    this.hitSlotIdx  = -1;
    this.loopRunning = false;
    this.destroyed   = false;

    // Tracked so a config re-mount can cancel queued work and detach handlers.
    this.timers    = new Set();
    this.listeners = [];
  }

  Game.prototype.rows = function () {
    return ROWS[this.numPins];
  };

  Game.prototype.delay = function (fn, ms) {
    var self = this;
    var id = setTimeout(function () { self.timers.delete(id); if (!self.destroyed) fn(); }, ms);
    this.timers.add(id);
    return id;
  };

  Game.prototype.on = function (target, event, handler) {
    target.addEventListener(event, handler);
    this.listeners.push([target, event, handler]);
  };

  Game.prototype.destroy = function () {
    this.destroyed = true;
    this.timers.forEach(function (id) { clearTimeout(id); });
    this.timers.clear();
    this.listeners.forEach(function (l) { l[0].removeEventListener(l[1], l[2]); });
    this.listeners = [];
    this.activeBalls.forEach(function (b) { b.active = false; });
    this.activeBalls = [];
  };

  // ── RESIZE / LAYOUT ──────────────────────────────────────────
  Game.prototype.resize = function () {
    var wrap = this.canvas.parentElement;
    this.W = wrap.clientWidth;
    this.H = wrap.clientHeight;
    this.PR = Math.min(window.devicePixelRatio || 1, 2);

    this.canvas.width  = this.W * this.PR;
    this.canvas.height = this.H * this.PR;
    this.canvas.style.width  = this.W + 'px';
    this.canvas.style.height = this.H + 'px';
    this.ctx.setTransform(this.PR, 0, 0, this.PR, 0, 0);

    this.buildLayout();
    this.redraw();
  };

  Game.prototype.buildLayout = function () {
    var W = this.W, H = this.H;
    var rows = this.numPins;
    var layout = { rows: [] };
    var padX = W * 0.10;
    var padT = H * 0.05;
    var padB = H * 0.08;
    var useW = W - padX * 2;
    var useH = H - padT - padB;

    this.pinR  = Math.max(4, Math.min(W / 90, 6.5));
    this.ballR = this.pinR * 1.65;

    for (var r = 0; r < rows; r++) {
      var cols   = r + 2;
      var rowY   = padT + (useH / (rows - 1)) * r;
      var rowW   = useW * (cols - 1) / rows;
      var rowX   = W / 2 - rowW / 2;
      var step   = cols > 1 ? rowW / (cols - 1) : 0;
      var row    = [];
      for (var c = 0; c < cols; c++) row.push({ x: rowX + c * step, y: rowY });
      layout.rows.push(row);
    }

    var n      = rows + 1;
    var mults  = this.rows()[0];
    var totW   = useW * (rows + 1) / rows;
    var startX = W / 2 - totW / 2;
    var slotW  = totW / n;
    layout.slotW      = slotW;
    layout.slotStartX = startX;
    layout.slots      = mults.map(function (m, i) {
      return { x: startX + i * slotW + slotW / 2, w: slotW, m: m };
    });
    layout.padB = padB;
    this.layout = layout;
  };

  // ── DRAW ─────────────────────────────────────────────────────
  Game.prototype.rr = function (x, y, w, h, r) {
    var ctx = this.ctx;
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
  };

  Game.prototype.redraw = function () {
    var ctx = this.ctx, layout = this.layout, W = this.W, H = this.H;
    var pinR = this.pinR, ballR = this.ballR;
    if (!layout || !W || !H) return;
    ctx.clearRect(0, 0, W, H);

    // slot hit glow
    if (this.hitSlotIdx >= 0 && layout.slots) {
      var sx = layout.slotStartX + this.hitSlotIdx * layout.slotW;
      var sy = H - layout.padB * 0.65;
      var sh = layout.padB * 0.5;
      ctx.save();
      ctx.shadowColor = '#fff';
      ctx.shadowBlur  = 20;
      ctx.fillStyle   = 'rgba(255,255,255,.3)';
      this.rr(sx + 1, sy, layout.slotW - 2, sh, 3);
      ctx.fill();
      ctx.restore();
    }

    // pins
    layout.rows.forEach(function (row) {
      row.forEach(function (p) {
        ctx.beginPath();
        ctx.arc(p.x + 1, p.y + 1, pinR, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,.2)';
        ctx.fill();

        ctx.beginPath();
        ctx.arc(p.x, p.y, pinR, 0, Math.PI * 2);
        var g = ctx.createRadialGradient(p.x - pinR * .3, p.y - pinR * .3, .5, p.x, p.y, pinR);
        g.addColorStop(0,   '#ffffff');
        g.addColorStop(0.6, '#d8f4f8');
        g.addColorStop(1,   '#a0dce4');
        ctx.fillStyle = g;
        ctx.fill();
      });
    });

    // balls
    this.activeBalls.forEach(function (ball) {
      ctx.beginPath();
      ctx.arc(ball.x + 1.5, ball.y + 2, ballR, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,.3)';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ballR, 0, Math.PI * 2);
      var bg = ctx.createRadialGradient(
        ball.x - ballR * .3, ball.y - ballR * .3, ballR * .05,
        ball.x, ball.y, ballR
      );
      bg.addColorStop(0,   '#ffffff');
      bg.addColorStop(0.3, '#ffe066');
      bg.addColorStop(0.7, '#ff9500');
      bg.addColorStop(1,   '#c05000');
      ctx.fillStyle   = bg;
      ctx.shadowColor = 'rgba(255,160,0,.65)';
      ctx.shadowBlur  = 14;
      ctx.fill();
      ctx.shadowBlur  = 0;
    });
  };

  // ── SLOT ROWS ────────────────────────────────────────────────
  Game.prototype.buildSlotRows = function () {
    var rows = this.rows();
    this.el.rows.forEach(function (rowEl, r) {
      rowEl.innerHTML = '';
      rows[r].forEach(function (m) {
        var d = document.createElement('div');
        d.className   = sv(m);
        d.textContent = m + 'x';
        rowEl.appendChild(d);
      });
    });
    this.el.maxWin.textContent = Math.max.apply(null, rows[2]) + 'x';
    this.el.pinsLbl.textContent = this.numPins;
  };

  Game.prototype.hitSlot = function (idx) {
    var rows = this.el.rows;
    rows.forEach(function (rowEl) {
      Array.prototype.forEach.call(rowEl.children, function (el, i) {
        el.classList.toggle('hit', i === idx);
      });
    });
    this.delay(function () {
      rows.forEach(function (rowEl) {
        Array.prototype.forEach.call(rowEl.children, function (el) { el.classList.remove('hit'); });
      });
    }, 900);
  };

  // ── HISTORY ──────────────────────────────────────────────────
  Game.prototype.renderHist = function () {
    var histEl = this.el.hist;
    histEl.innerHTML = '';
    this.hist.forEach(function (v) {
      var d = document.createElement('div');
      d.className        = 'hist-dot';
      d.style.background = histColor(v);
      d.textContent      = v >= 10 ? Math.round(v) + 'x' : v + 'x';
      histEl.appendChild(d);
    });
  };

  Game.prototype.addHist = function (m) {
    this.hist.unshift(m);
    this.hist.length = Math.min(this.hist.length, HISTORY_LENGTH);
    this.renderHist();
  };

  // ── SIMULATE PATH ────────────────────────────────────────────
  Game.prototype.simPath = function () {
    var rows = this.numPins, layout = this.layout, pinR = this.pinR;
    var col = 0;
    var dec = [];
    for (var r = 0; r < rows; r++) {
      var go = Math.random() < .5 ? 0 : 1;
      dec.push(go);
      col += go;
    }

    var kf = [{ x: this.W / 2, y: layout.rows[0][0].y - this.H * .06 }];
    var cur = 0;
    for (r = 0; r < rows; r++) {
      var pin  = layout.rows[r][cur];
      var side = dec[r] === 1 ? 1 : -1;
      kf.push({ x: pin.x + side * pinR * 1.9, y: pin.y + pinR * .4 });
      cur += dec[r];
    }

    var s = layout.slots[col];
    kf.push({ x: s.x, y: this.H - layout.padB * .3 });
    return { kf: kf, slotIdx: col };
  };

  // ── RENDER LOOP — one shared rAF for all balls ───────────────
  Game.prototype.startRenderLoop = function () {
    if (this.loopRunning) return;
    this.loopRunning = true;
    var self = this;
    function loop() {
      if (self.destroyed) { self.loopRunning = false; return; }
      self.redraw();
      if (self.activeBalls.length > 0) requestAnimationFrame(loop);
      else self.loopRunning = false;
    }
    requestAnimationFrame(loop);
  };

  // ── ANIMATE (time-based — speed independent of monitor Hz) ───
  Game.prototype.animate = function (kf, slotIdx, done) {
    var self = this;
    var ease = function (t) { return t < .5 ? 2 * t * t : -1 + (4 - 2 * t) * t; };
    var ball = { x: kf[0].x, y: kf[0].y, active: true };
    this.activeBalls.push(ball);
    this.startRenderLoop();

    var seg = 0;
    var segStart = null;

    function tick(ts) {
      if (!ball.active || self.destroyed) return;
      if (segStart === null) segStart = ts;

      var t = Math.min((ts - segStart) / MS_PER_SEG, 1);

      if (seg >= kf.length - 1) {
        ball.x = kf[kf.length - 1].x;
        ball.y = kf[kf.length - 1].y;
        self.hitSlotIdx = slotIdx;
        ball.active = false;
        self.activeBalls = self.activeBalls.filter(function (b) { return b !== ball; });
        self.delay(function () { self.hitSlotIdx = -1; self.redraw(); }, 400);
        done();
        return;
      }

      var et  = ease(t);
      var a   = kf[seg], b = kf[seg + 1];
      var arc = -Math.sin(Math.PI * t) * 4;
      ball.x = a.x + (b.x - a.x) * et;
      ball.y = a.y + (b.y - a.y) * et + arc;

      if (t >= 1) { seg++; segStart = ts; }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  };

  // ── PLAY ─────────────────────────────────────────────────────
  Game.prototype.play = function () {
    var self = this;
    if (!this.layout) return;
    var g = this.g;
    var curBet = this.bet;
    this.balance = Math.max(0, +(this.balance - curBet).toFixed(2));
    this.updateUI();

    var path = this.simPath();
    var slotIdx = path.slotIdx;
    var mult = this.layout.slots[slotIdx].m;
    var win  = +(curBet * mult).toFixed(2);

    this.animate(path.kf, slotIdx, function () {
      self.balance = +(self.balance + win).toFixed(2);
      self.updateUI();
      self.hitSlot(slotIdx);
      self.addHist(mult);

      var flash = self.el.winFlash;
      flash.textContent = '+' + win.toFixed(2) + ' ' + g.currency;
      flash.classList.add('show');
      self.delay(function () { flash.classList.remove('show'); }, WIN_FLASH_TIME);

      self.playCount++;
      var bigWin = mult >= CTA_ON_MULTIPLIER;
      if (self.playCount >= g.ctaAfterDrops || bigWin) {
        self.delay(function () { self.showCTA(); }, CTA_DELAY);
      }
    });
  };

  Game.prototype.showCTA = function () {
    var overlay = this.el.cta;
    if (this.ctaShown) return;
    this.ctaShown = true;
    overlay.classList.add('show');
    if (typeof confetti !== 'function') return;
    // Prevent multiple confetti instances from spawning simultaneously
    if (overlay.querySelector('canvas')) return;

    var confettiCanvas = document.createElement('canvas');
    confettiCanvas.className = 'popup__confetti';
    confettiCanvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:1000;';
    overlay.insertBefore(confettiCanvas, overlay.querySelector('.popup__content'));

    var myConfetti = confetti.create(confettiCanvas, { resize: true });
    var duration = 4000;
    var fadeOut  = 1500;
    var count    = 3;
    var isMobile = window.innerWidth <= 767;
    var end = Date.now() + duration;

    (function frame() {
      if (!confettiCanvas.isConnected) return;
      myConfetti({ particleCount: count, angle: 60,  spread: 55, origin: { x: 0, y: 0.6 } });
      if (!isMobile) myConfetti({ particleCount: count, angle: 120, spread: 55, origin: { x: 1, y: 0.6 } });
      if (Date.now() < end) {
        requestAnimationFrame(frame);
      } else {
        // Плавне зникання canvas
        confettiCanvas.style.transition = 'opacity ' + fadeOut + 'ms ease';
        confettiCanvas.style.opacity = '0';
        setTimeout(function () { confettiCanvas.remove(); }, fadeOut);
      }
    })();
  };

  Game.prototype.updateUI = function () {
    this.el.balance.textContent = this.balance.toLocaleString('en-US',
      { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    this.el.bet.textContent = this.bet.toFixed(2);
  };

  // ── EVENTS / INIT ────────────────────────────────────────────
  Game.prototype.init = function () {
    var self = this;
    var bet = this.g.bet;
    var el = this.el;

    this.on(el.play, 'click', function () { self.play(); });

    this.on(el.minus, 'click', function () {
      if (self.bet > bet.min) { self.bet = Math.max(bet.min, +(self.bet - bet.step).toFixed(2)); self.updateUI(); }
    });
    this.on(el.plus, 'click', function () {
      if (self.bet < bet.max) { self.bet = Math.min(bet.max, +(self.bet + bet.step).toFixed(2)); self.updateUI(); }
    });

    this.on(el.pinsBtn, 'click', function (e) {
      e.stopPropagation();
      el.pinsMenu.classList.toggle('open');
    });
    this.on(document, 'click', function () { el.pinsMenu.classList.remove('open'); });
    this.on(el.pinsMenu, 'click', function (e) {
      var item = e.target.closest('.pins-item');
      if (!item) return;
      self.numPins = +item.dataset.val;
      el.pinsMenu.classList.remove('open');
      self.buildSlotRows();
      self.buildLayout();
      self.redraw();
    });

    this.on(window, 'resize', function () { self.resize(); self.buildSlotRows(); });

    this.renderHist();
    // Build synchronously so a click right after a re-mount always has a layout.
    this.resize();
    this.buildSlotRows();
    this.updateUI();
  };

  // ── MOUNT ────────────────────────────────────────────────────
  var game = null;

  function mount(config) {
    if (game) game.destroy();

    var overlay = $('ctaOverlay');
    overlay.classList.remove('show');
    var oldConfetti = overlay.querySelector('.popup__confetti');
    if (oldConfetti) oldConfetti.remove();
    $('winFlash').classList.remove('show');
    $('pinsMenu').classList.remove('open');

    render(config);
    game = new Game(config);
    game.init();
    return game;
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = function () { reject(new Error('failed to load ' + src)); };
      document.head.appendChild(s);
    });
  }

  function boot() {
    var devMenu = null;

    LC.loadConfig().then(function (config) {
      mount(config);

      // Optional: picks up config.json edits on the host without a reload.
      LC.watchConfig(config, function (next) {
        mount(next);
        if (devMenu) devMenu.sync(next);
      });

      // Config panel (top right). Ships in production; hide with "dev.menu": false.
      if (config.dev.menu) {
        var src = new URL('assets/devmenu.js', document.baseURI).href;
        loadScript(src).then(function () {
          return window.LandingDevMenu.initDevMenu(config, mount, {
            fields: PC.gameFields(),
            title: 'PLINKO — НАЛАШТУВАННЯ'
          });
        }).then(function (menu) { devMenu = menu; })
          .catch(function (err) { console.warn('[devmenu]', err.message); });
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
