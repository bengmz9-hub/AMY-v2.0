import { useEffect, useRef } from 'react';
import { ROLE_SYMBOLS } from './role-symbols.js';
import './role-icon.css';

const DURATION = 900;
const MOTION = {
  Centinela: { turn: .85, flow: .75, idle: .28 },
  Iniciador: { turn: 1.2, flow: 1.1, idle: .42 },
  Controlador: { turn: 1.5, flow: .95, idle: .34 },
  Duelista: { turn: -1.25, flow: 1.2, idle: .46 },
};
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
// Stable grain identities, independent of agent order and symbol path count.
const seed = (index, salt) => {
  let value = Math.imul(index + 1, 1597334677) ^ Math.imul(salt + 1, 3812015801);
  value = Math.imul(value ^ (value >>> 16), 2246822507);
  return ((value ^ (value >>> 13)) >>> 0) / 4294967296;
};

function roleSymbol(role) {
  const symbol = ROLE_SYMBOLS[role];
  if (!symbol || !Array.isArray(symbol.paths) || !symbol.paths.length || !symbol.paths.every(path => typeof path === 'string' && path.trim())) return null;
  const box = String(symbol.viewBox).trim().split(/[\s,]+/).map(Number);
  return box.length === 4 && box.every(Number.isFinite) && box[2] > 0 && box[3] > 0 ? symbol : null;
}

export default function ParticleRoleIcon({ role, agentId, variant = 'a', enabled = true, prepareStartup = false, onPrepared }) {
  const symbol = roleSymbol(role);
  const hostRef = useRef(null);
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const enabledRef = useRef(enabled);
  const latest = useRef({ role, variant });
  const preparation = useRef({ requested: prepareStartup, callback: onPrepared });
  preparation.current = { requested: prepareStartup, callback: onPrepared };

  useEffect(() => {
    latest.current = { role, variant };
    engineRef.current?.update(role, variant);
  }, [role, variant]);

  useEffect(() => {
    enabledRef.current = enabled;
    engineRef.current?.setEnabled(enabled);
  }, [enabled]);
  useEffect(() => { if (prepareStartup) engineRef.current?.prepare(); }, [prepareStartup]);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    host.dataset.iconReady = 'false';
    let context;
    try { context = canvas.getContext('2d', { alpha: true }); } catch { preparation.current.callback?.('fallback'); return undefined; }
    if (!context) { preparation.current.callback?.('fallback'); return undefined; }

    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    let reduced = media.matches;
    let disposed = false;
    let failed = false;
    let ready = false;
    let inView = false;
    let frame = 0;
    let previousTime = 0;
    let time = 0;
    let started = -DURATION;
    let width = 0;
    let height = 0;
    let dpr = 1;
    let currentRole = '';
    let pool = [];
    let sprite;
    let glowCanvas;
    let glowContext;
    let edgeMask;
    const samples = new Map();
    let glowFilter = 'blur(5px)';
    const pointer = { x: 0, y: 0, active: false, strength: 0 };

    function stop() {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      previousTime = 0;
    }

    function fail() {
      failed = true;
      stop();
      host.dataset.iconReady = 'false';
      canvas.style.visibility = 'hidden';
      preparation.current.callback?.('fallback');
    }

    function makeSprite() {
      sprite = document.createElement('canvas');
      sprite.width = sprite.height = 64;
      const brush = sprite.getContext('2d');
      if (!brush) throw new Error('Particle sprite context unavailable');
      const light = brush.createRadialGradient(32, 32, 0, 32, 32, 32);
      light.addColorStop(0, '#ffffff');
      light.addColorStop(.14, '#f6fdff');
      light.addColorStop(.28, '#b9f4ffef');
      light.addColorStop(.5, '#40b8ff88');
      light.addColorStop(.78, '#2476e535');
      light.addColorStop(1, '#1150c000');
      brush.fillStyle = light;
      brush.fillRect(0, 0, 64, 64);
    }

    function resizeLightBuffers() {
      glowCanvas ||= document.createElement('canvas');
      glowCanvas.width = Math.ceil(width);
      glowCanvas.height = Math.ceil(height);
      glowContext = glowCanvas.getContext('2d', { alpha: true });
      edgeMask ||= document.createElement('canvas');
      edgeMask.width = canvas.width;
      edgeMask.height = canvas.height;
      const edge = edgeMask.getContext('2d');
      if (!glowContext || !edge) throw new Error('Particle light buffer unavailable');
      edge.setTransform(dpr, 0, 0, dpr, 0, 0);
      edge.fillStyle = '#fff';
      edge.fillRect(0, 0, width, height);
      edge.globalCompositeOperation = 'destination-in';
      const fade = Math.min(width, height) * .065;
      for (const ends of [[0, 0, fade, 0], [width, 0, width - fade, 0], [0, 0, 0, fade], [0, height, 0, height - fade]]) {
        const gradient = edge.createLinearGradient(...ends);
        gradient.addColorStop(0, '#fff0');
        gradient.addColorStop(Math.min(.5, 2 / fade), '#fff0');
        gradient.addColorStop(1, '#fff');
        edge.fillStyle = gradient;
        edge.fillRect(0, 0, width, height);
      }
      glowFilter = width < 280 ? 'blur(3px)' : 'blur(5px)';
    }

    function sampleRole(name) {
      if (samples.has(name)) return samples.get(name);
      const shape = roleSymbol(name);
      if (!shape) return null;
      const mask = document.createElement('canvas');
      mask.width = Math.ceil(width);
      mask.height = Math.ceil(height);
      const ink = mask.getContext('2d', { willReadFrequently: true });
      if (!ink) throw new Error('Particle icon context unavailable');
      const [left, top, boxWidth, boxHeight] = shape.viewBox.trim().split(/[\s,]+/).map(Number);
      const scale = Math.min(width * .95 / boxWidth, height * .95 / boxHeight);
      ink.setTransform(scale, 0, 0, scale, (width - boxWidth * scale) / 2 - left * scale, (height - boxHeight * scale) / 2 - top * scale);
      ink.fillStyle = '#fff';
      for (const path of shape.paths) ink.fill(new Path2D(path), shape.fillRule === 'evenodd' ? 'evenodd' : 'nonzero');
      const pixels = ink.getImageData(0, 0, mask.width, mask.height).data;
      const points = [];
      // Uniform alpha sampling preserves the actual supplied silhouette and voids.
      for (let x = 6; x < mask.width - 6; x += 1) {
        for (let y = 6; y < mask.height - 6; y += 1) {
          if (pixels[(y * mask.width + x) * 4 + 3] > 170) points.push([x, y]);
        }
      }
      if (!points.length) throw new Error('No pixels in the supplied role symbol');
      const result = { points, pixels, mask: { width: mask.width } };
      samples.set(name, result);
      host.dataset.roleCacheSize = String(samples.size);
      return result;
    }

    function targets() {
      const sampled = sampleRole(currentRole);
      if (!sampled) return false;
      const { points, pixels, mask } = sampled;
      for (let index = 0; index < pool.length; index += 1) {
        const grain = pool[index];
        const sample = Math.min(points.length - 1, Math.floor((index + seed(index, 4)) * points.length / pool.length));
        grain.tx = points[sample][0] + (seed(index, 5) - .5) * .65;
        grain.ty = points[sample][1] + (seed(index, 6) - .5) * .65;
        const px = points[sample][0], py = points[sample][1];
        grain.freedom = pixels[((py - 2) * mask.width + px) * 4 + 3] > 170
          && pixels[((py + 2) * mask.width + px) * 4 + 3] > 170
          && pixels[(py * mask.width + px - 2) * 4 + 3] > 170
          && pixels[(py * mask.width + px + 2) * 4 + 3] > 170 ? 1 : .2;
        const radius = Math.hypot(grain.tx - width / 2, grain.ty - height / 2) / Math.min(width, height);
        const rim = clamp((radius - .1) / .34, 0, 1);
        // Keep the centre subdued; emission grows smoothly towards the outside.
        grain.light = .62 + .38 * rim * rim * (3 - 2 * rim);
        grain.sx = grain.x;
        grain.sy = grain.y;
        grain.svx = clamp(grain.vx, -.2, .2);
        grain.svy = clamp(grain.vy, -.2, .2);
        grain.sAlpha = grain.alpha;
        grain.sSize = grain.drawSize;
      }
      return true;
    }

    function settle() {
      started = time - DURATION;
      for (const grain of pool) {
        grain.x = grain.sx = grain.tx;
        grain.y = grain.sy = grain.ty;
        grain.vx = grain.vy = grain.svx = grain.svy = 0;
      }
    }

    function draw(step = 0) {
      context.globalCompositeOperation = 'source-over';
      context.clearRect(0, 0, width, height);
      const elapsed = Math.max(0, time - started);
      const motion = MOTION[currentRole] || MOTION.Centinela;
      const extent = Math.min(width, height);
      const clock = reduced ? 0 : time * .001;
      if (step > 0) pointer.strength += ((pointer.active ? 1 : 0) - pointer.strength) * (1 - Math.exp(-step / 75));
      for (const grain of pool) {
        const delay = DURATION * (.028 + grain.delay * .2);
        const progress = reduced ? 1 : clamp((elapsed - delay) / (DURATION - delay), 0, 1);
        const eased = progress * progress * progress * (10 + progress * (-15 + 6 * progress));
        const envelope = Math.sin(progress * Math.PI) ** 2;
        const lag = Math.min(elapsed, delay);
        // Incoming visible velocity decays through each grain's waiting interval.
        // Its first updated position is exactly the previous painted position.
        const carry = reduced ? 0 : lag * (1 - lag / (2 * delay));
        const fromX = grain.sx + grain.svx * carry;
        const fromY = grain.sy + grain.svy * carry;
        const targetX = grain.tx, targetY = grain.ty;
        let x = fromX + (targetX - fromX) * eased;
        let y = fromY + (targetY - fromY) * eased;
        if (envelope > .00001) {
          const dx = x - width / 2, dy = y - height / 2;
          const turn = envelope * motion.turn * (.65 + grain.depth * .85);
          const cosine = Math.cos(turn), sine = Math.sin(turn);
          const qx = dx / extent, qy = dy / extent;
          const waveX = qx * 7 + grain.phase * 4 - clock * .9;
          const waveY = qy * 6 + grain.phase * 3 + clock * .7;
          const field = extent * .065 * envelope * motion.flow;
          // Independent analytic rotational field: tangent shear plus a stream
          // function's perpendicular gradient, strongest only during transit.
          x = width / 2 + dx * cosine - dy * sine + Math.cos(waveY) * Math.cos(waveX) * field;
          y = height / 2 + dx * sine + dy * cosine + Math.sin(waveY) * Math.sin(waveX) * field;
          const radius = Math.hypot(x - width / 2, y - height / 2);
          const safe = extent * .4;
          if (radius > safe) {
            const compressed = safe + extent * .055 * Math.tanh((radius - safe) / (extent * .055));
            const factor = (radius + (compressed - radius) * envelope) / radius;
            x = width / 2 + (x - width / 2) * factor;
            y = height / 2 + (y - height / 2) * factor;
          }
        }
        if (!reduced) {
          const pulse = clock * .7 + grain.phase * Math.PI * 2;
          const idle = motion.idle * grain.freedom * eased;
          x += Math.sin(pulse + grain.ty * .025) * idle;
          y += Math.cos(pulse * .8 + grain.tx * .022) * idle;
          if (pointer.strength > .001) {
            const dx = x - pointer.x, dy = y - pointer.y;
            const distance = Math.hypot(dx, dy);
            if (distance > .01 && distance < 64) {
              const force = (1 - distance / 64) ** 2 * 3.2 * pointer.strength * eased * (.4 + grain.freedom * .6);
              x += dx / distance * force;
              y += dy / distance * force;
            }
          }
        }
        const wave = reduced ? 1 : .86 + .14 * Math.sin(clock * .9 - Math.hypot(grain.tx - width / 2, grain.ty - height / 2) * .035 + grain.phase);
        const brightness = (.9 + grain.depth * .1) * grain.light * wave;
        grain.alpha = grain.sAlpha + (brightness - grain.sAlpha) * eased + envelope * .18 * grain.light;
        grain.drawSize = grain.sSize + (grain.size - grain.sSize) * eased + envelope * 1.3;
        if (step > 0) {
          const damping = 1 - Math.exp(-step / 35);
          grain.vx += ((x - grain.x) / step - grain.vx) * damping;
          grain.vy += ((y - grain.y) / step - grain.vy) * damping;
        }
        grain.x = x;
        grain.y = y;
      }
      context.globalCompositeOperation = 'lighter';
      if (!reduced) {
        context.beginPath();
        for (const grain of pool) {
          if (!grain.trail) continue;
          const speed = Math.hypot(grain.vx, grain.vy);
          if (speed < .006) continue;
          const length = Math.min(14, speed * 26);
          context.moveTo(grain.x, grain.y);
          context.lineTo(grain.x - grain.vx / speed * length, grain.y - grain.vy / speed * length);
        }
        context.strokeStyle = '#69bdff';
        context.lineWidth = .65;
        context.globalAlpha = .24;
        context.stroke();
      }
      for (const grain of pool) {
        context.globalAlpha = clamp(grain.alpha, 0, 1);
        context.drawImage(sprite, grain.x - grain.drawSize / 2, grain.y - grain.drawSize / 2, grain.drawSize, grain.drawSize);
      }
      // A cached light buffer blooms actual moving grains, never a solid SVG.
      glowContext.clearRect(0, 0, glowCanvas.width, glowCanvas.height);
      glowContext.drawImage(canvas, 0, 0, glowCanvas.width, glowCanvas.height);
      context.globalAlpha = .25;
      context.filter = glowFilter;
      context.drawImage(glowCanvas, 0, 0, width, height);
      context.filter = 'none';
      context.globalAlpha = 1;
      context.globalCompositeOperation = 'destination-in';
      context.drawImage(edgeMask, 0, 0, width, height);
      context.globalCompositeOperation = 'source-over';
    }

    function tick(timestamp) {
      frame = 0;
      if (disposed || failed || reduced || !enabledRef.current || !inView || document.hidden || !roleSymbol(currentRole)) return;
      const step = previousTime ? Math.min(timestamp - previousTime, 40) : 0;
      time += step;
      previousTime = timestamp;
      try { draw(step); } catch { fail(); return; }
      frame = requestAnimationFrame(tick);
    }

    function paint(preparing = false) {
      if (!ready || disposed || failed || (!inView && !preparing) || document.hidden || !roleSymbol(currentRole)) return;
      try { draw(); } catch { fail(); return; }
      host.dataset.iconReady = 'true';
      if (!preparing && !reduced && enabledRef.current && !frame) frame = requestAnimationFrame(tick);
    }

    function prepare() {
      if (!ready || disposed || failed || document.hidden || !width || !height) return;
      try {
        for (const name of Object.keys(ROLE_SYMBOLS)) sampleRole(name);
        paint(true);
        if (!failed) preparation.current.callback?.('ready');
      } catch { fail(); }
    }

    function update(nextRole) {
      if (!ready || failed || disposed) return;
      try {
        const nextRoleName = String(nextRole ?? '');
        if (nextRoleName !== currentRole) {
          const hadSymbol = Boolean(roleSymbol(currentRole));
          currentRole = nextRoleName;
          if (!targets()) {
            stop();
            context.clearRect(0, 0, width, height);
            host.dataset.iconReady = 'false';
            return;
          }
          started = time;
          if (reduced || !hadSymbol) settle();
        }
        paint();
      } catch { fail(); }
    }

    function resize() {
      if (!ready || disposed || failed) return;
      const bounds = host.getBoundingClientRect();
      if (bounds.width < 1 || bounds.height < 1) { inView = false; stop(); return; }
      const ratio = Math.min(window.devicePixelRatio || 1, 2, 4096 / bounds.width);
      if (width === bounds.width && height === bounds.height && ratio === dpr) return;
      width = bounds.width;
      height = bounds.height;
      samples.clear();
      dpr = ratio;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = width < 280 ? 2400 : 5400;
      if (pool.length !== count) {
        pool = Array.from({ length: count }, (_, index) => ({
          x: width / 2, y: height / 2, tx: 0, ty: 0, sx: 0, sy: 0,
          vx: 0, vy: 0, svx: 0, svy: 0, freedom: 1,
          phase: seed(index, 0), delay: seed(index, 1),
          depth: seed(index, 2), trail: index % 9 === 0,
          size: (3.5 + seed(index, 8) * 2.6) * (seed(index, 9) > .95 ? 1.4 : 1),
          drawSize: 4, sSize: 4, alpha: .9, sAlpha: .9,
        }));
      }
      try { resizeLightBuffers(); if (targets()) { settle(); paint(); } if (preparation.current.requested) prepare(); } catch { fail(); }
    }

    function pointerMove(event) {
      if (reduced || !inView || document.hidden || event.pointerType === 'touch') return;
      const bounds = canvas.getBoundingClientRect();
      pointer.x = event.clientX - bounds.left;
      pointer.y = event.clientY - bounds.top;
      pointer.active = pointer.x >= 0 && pointer.x <= width && pointer.y >= 0 && pointer.y <= height;
    }
    function pointerLeave() { pointer.active = false; }
    function visibility() { pointerLeave(); if (document.hidden) stop(); else { paint(); if (preparation.current.requested) prepare(); } }
    function preference() {
      reduced = media.matches;
      pointerLeave();
      pointer.strength = 0;
      stop();
      if (ready) { settle(); paint(); }
    }

    const resizeObserver = new ResizeObserver(resize);
    const intersectionObserver = new IntersectionObserver(entries => {
      inView = entries[0]?.isIntersecting ?? false;
      if (inView) paint(); else { pointerLeave(); stop(); }
    });
    resizeObserver.observe(host);
    intersectionObserver.observe(host);
    canvas.addEventListener('pointermove', pointerMove, { passive: true });
    canvas.addEventListener('pointerleave', pointerLeave, { passive: true });
    canvas.addEventListener('contextlost', fail);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('resize', resize, { passive: true });
    media.addEventListener('change', preference);
    engineRef.current = { update, prepare, setEnabled(value) {
      enabledRef.current = value;
      stop();
      if (value) paint(); else pointerLeave();
    } };

    function initialize() {
      if (disposed || failed) return;
      currentRole = String(latest.current.role ?? '');
      const bounds = host.getBoundingClientRect();
      inView = bounds.bottom > 0 && bounds.top < window.innerHeight && bounds.right > 0 && bounds.left < window.innerWidth;
      try { makeSprite(); ready = true; resize(); } catch { fail(); }
    }
    initialize();

    return () => {
      disposed = true;
      stop();
      engineRef.current = null;
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      canvas.removeEventListener('pointermove', pointerMove);
      canvas.removeEventListener('pointerleave', pointerLeave);
      canvas.removeEventListener('contextlost', fail);
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('resize', resize);
      media.removeEventListener('change', preference);
      for (const buffer of [sprite, glowCanvas, edgeMask]) {
        if (buffer) { buffer.width = 0; buffer.height = 0; }
      }
    };
  }, []);

  return (
    <div className="role-particle-icon" ref={hostRef} data-role-icon={role} data-role-agent={agentId} data-role-variant={variant}
      role="img" aria-label={`Rol: ${role || 'no disponible'}`}>
      {symbol ? <svg className="role-particle-icon__fallback" viewBox={symbol.viewBox} preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">
        {symbol.paths.map((path, index) => <path key={index} d={path} fillRule={symbol.fillRule || 'nonzero'} />)}
      </svg> : <span className="role-particle-icon__unknown" aria-hidden="true">{role || 'Rol no disponible'}</span>}
      <canvas className="role-particle-icon__canvas" ref={canvasRef} data-role-icon-canvas aria-hidden="true" />
    </div>
  );
}
