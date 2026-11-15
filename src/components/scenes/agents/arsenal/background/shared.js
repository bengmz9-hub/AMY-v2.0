export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function glowSprite(rgb = [117, 195, 255]) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 48;
  const context = canvas.getContext('2d');
  if (!context) return null;
  const gradient = context.createRadialGradient(24, 24, 0, 24, 24, 24);
  gradient.addColorStop(0, `rgba(${rgb.join(',')},1)`);
  gradient.addColorStop(.22, `rgba(${rgb.join(',')},.65)`);
  gradient.addColorStop(.58, `rgba(${rgb.join(',')},.12)`);
  gradient.addColorStop(1, `rgba(${rgb.join(',')},0)`);
  context.fillStyle = gradient;
  context.fillRect(0, 0, 48, 48);
  return canvas;
}
