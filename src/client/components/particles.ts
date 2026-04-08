interface Particle {
  x: number;
  y: number;
  size: number;
  speedX: number;
  speedY: number;
  color: string;
  alpha: number;
}

const COLORS = ['#e94560', '#533483', '#0f3460', '#0ff', '#f0f', '#0f0'];
const COUNT = 40;

export function initParticles(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d')!;
  const dpr = window.devicePixelRatio || 1;
  let particles: Particle[] = [];

  function resize(): void {
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    ctx.scale(dpr, dpr);
  }

  function spawn(): void {
    particles = [];
    for (let i = 0; i < COUNT; i++) {
      particles.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        size: Math.floor(Math.random() * 4 + 2),
        speedX: (Math.random() - 0.5) * 0.5,
        speedY: -Math.random() * 0.4 - 0.1,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        alpha: Math.random() * 0.5 + 0.2,
      });
    }
  }

  function draw(): void {
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    for (const p of particles) {
      p.x += p.speedX;
      p.y += p.speedY;
      if (p.y < -10) { p.y = window.innerHeight + 10; p.x = Math.random() * window.innerWidth; }
      if (p.x < -10) p.x = window.innerWidth + 10;
      if (p.x > window.innerWidth + 10) p.x = -10;

      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.floor(p.x), Math.floor(p.y), p.size, p.size);
    }
    ctx.globalAlpha = 1;
    requestAnimationFrame(draw);
  }

  resize();
  spawn();
  draw();
  window.addEventListener('resize', () => { resize(); spawn(); });
}
