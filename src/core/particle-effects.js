const PARTICLE_LIMIT = 30;
const PARTICLE_STYLE = Object.freeze({
  sparkle: Object.freeze({ count: 7, color: 'accent', spread: 42, gravity: 20 }),
  heart: Object.freeze({ count: 5, color: 'accent', spread: 30, gravity: 8 }),
  dust: Object.freeze({ count: 8, color: 'muted', spread: 36, gravity: 38 }),
});

export function createParticlePool({ canvas, motion, getColor, random = Math.random }) {
  if (!canvas || !motion || typeof getColor !== 'function' || typeof random !== 'function') {
    throw new TypeError('Particle pool requires a canvas, motion engine, color provider, and random source.');
  }
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not create the particle canvas context.');
  const particles = [];
  let cancel = null;
  let disposed = false;

  function clearCanvas() {
    context.clearRect(0, 0, canvas.width, canvas.height);
  }

  function stopIfIdle() {
    if (particles.length !== 0 || !cancel) return;
    const stop = cancel;
    cancel = null;
    stop();
    clearCanvas();
  }

  function draw() {
    const bounds = canvas.getBoundingClientRect();
    const ratio = globalThis.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(bounds.width * ratio));
    const height = Math.max(1, Math.round(bounds.height * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    clearCanvas();
    for (const particle of particles) {
      const opacity = Math.max(0, 1 - particle.age / particle.life);
      context.globalAlpha = opacity;
      context.fillStyle = getColor(particle.color);
      context.save();
      context.translate(particle.x, particle.y);
      context.rotate(particle.rotation);
      if (particle.shape === 'heart') {
        const size = particle.size;
        context.beginPath();
        context.moveTo(0, size * 0.35);
        context.bezierCurveTo(-size, -size * 0.2, -size * 0.8, -size, 0, -size * 0.48);
        context.bezierCurveTo(size * 0.8, -size, size, -size * 0.2, 0, size * 0.35);
        context.fill();
      } else if (particle.shape === 'sparkle') {
        context.fillRect(-particle.size / 2, -particle.size / 2, particle.size, particle.size);
      } else {
        context.beginPath();
        context.arc(0, 0, particle.size / 2, 0, Math.PI * 2);
        context.fill();
      }
      context.restore();
    }
    context.globalAlpha = 1;
  }

  function update({ deltaSeconds }) {
    for (let index = particles.length - 1; index >= 0; index -= 1) {
      const particle = particles[index];
      particle.age += deltaSeconds;
      particle.velocityY += particle.gravity * deltaSeconds;
      particle.x += particle.velocityX * deltaSeconds;
      particle.y += particle.velocityY * deltaSeconds;
      particle.rotation += particle.rotationSpeed * deltaSeconds;
      if (particle.age >= particle.life) particles.splice(index, 1);
    }
    draw();
    if (particles.length > 0) return true;
    cancel = null;
    clearCanvas();
    return false;
  }

  function emit(kind, x, y) {
    if (disposed) throw new Error('Cannot emit particles after the pool is disposed.');
    const style = PARTICLE_STYLE[kind];
    if (!style) throw new TypeError(`Unknown particle effect: ${kind}`);
    if (![x, y].every(Number.isFinite)) throw new TypeError('Particle coordinates must be finite.');
    const available = Math.min(style.count, PARTICLE_LIMIT - particles.length);
    for (let index = 0; index < available; index += 1) {
      const angle = random() * Math.PI * 2;
      const speed = 16 + random() * style.spread;
      particles.push({
        x,
        y,
        velocityX: Math.cos(angle) * speed,
        velocityY: Math.sin(angle) * speed - style.spread * 0.2,
        gravity: style.gravity,
        age: 0,
        life: 0.35 + random() * 0.35,
        size: 2 + random() * 3,
        rotation: random() * Math.PI * 2,
        rotationSpeed: (random() - 0.5) * 8,
        color: style.color,
        shape: kind === 'heart' ? 'heart' : kind === 'sparkle' ? 'sparkle' : 'dust',
      });
    }
    if (particles.length > 0 && !cancel) {
      cancel = motion.register({
        id: 'desk-particles',
        kind: 'ui',
        fps: 30,
        element: canvas,
        update,
        onStop() {
          cancel = null;
          particles.length = 0;
          clearCanvas();
        },
      });
    }
    return particles.length;
  }

  function clear() {
    particles.length = 0;
    stopIfIdle();
    if (!cancel) clearCanvas();
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    clear();
  }

  return Object.freeze({
    emit,
    clear,
    dispose,
    getActiveCount: () => particles.length,
  });
}

export const PARTICLE_LIMITS = Object.freeze({ count: PARTICLE_LIMIT });
