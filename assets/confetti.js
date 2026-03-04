(() => {
  'use strict';

  const COLORS = [
    '#f44336','#e91e63','#9c27b0','#673ab7','#3f51b5',
    '#2196f3','#03a9f4','#00bcd4','#009688','#4CAF50',
    '#8BC34A','#CDDC39','#FFEB3B','#FFC107','#FF9800','#FF5722'
  ];

  const PARTICLE_COUNT = 500;
  let canvas, ctx, particles, animId, running = false;

  function rnd(a, b) { return a + Math.random() * (b - a); }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  class Particle {
    constructor() { this.reset(); }

    reset() {
      this.x     = rnd(0, canvas.width);
      this.y     = rnd(-100, -20);
      this.vx    = rnd(-6, 6);
      this.vy    = rnd(-10, 2);
      this.fri   = rnd(0.98, 0.995);
      this.size  = rnd(5, 15);
      this.color = pick(COLORS);
      this.shape = Math.random() < 0.5 ? 'rect' : 'ellipse';
    }

    update() {
      this.vy += 0.1;           // gravity
      this.vx *= this.fri;
      this.vy *= this.fri;
      this.x  += this.vx;
      this.y  += this.vy;

      if (this.y > canvas.height || this.x < 0 || this.x > canvas.width + 10) {
        this.reset();
      }
    }

    draw() {
      const step = 0.5 + Math.sin(this.vy * 20) * 0.5;
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.vx * 2);
      ctx.scale(1, step);
      ctx.fillStyle = this.color;
      ctx.beginPath();
      if (this.shape === 'rect') {
        ctx.rect(-this.size / 2, -this.size / 2, this.size, this.size);
      } else {
        ctx.ellipse(0, 0, this.size / 2, this.size / 2, 0, 0, Math.PI * 2);
      }
      ctx.fill();
      ctx.restore();
    }
  }

  function loop() {
    if (!running) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => { p.update(); p.draw(); });
    animId = requestAnimationFrame(loop);
  }

  function onResize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  window.ConfettiStart = function () {
    canvas = document.getElementById('confettiCanvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;

    particles = Array.from({ length: PARTICLE_COUNT }, () => new Particle());
    running   = true;
    window.addEventListener('resize', onResize);
    loop();
  };

  window.ConfettiStop = function () {
    running = false;
    if (animId) cancelAnimationFrame(animId);
    window.removeEventListener('resize', onResize);
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  };
})();
