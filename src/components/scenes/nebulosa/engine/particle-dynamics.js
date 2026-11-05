// Original implementation informed by the documented Astera/Abyssal studies and
// Genjutsu's seeded flow-field approach. No source from those projects is copied.
const TAU = Math.PI * 2;
export function seededRandom(seed) {
  let n = seed >>> 0;
  return () => { n += 0x6d2b79f5; let t = n; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function hash(index, seed, channel) {
  let n = (Math.imul(index + 1, 0x9e3779b1) ^ seed ^ Math.imul(channel + 1, 0x85ebca6b)) >>> 0;
  n = Math.imul(n ^ n >>> 16, 0x7feb352d); n = Math.imul(n ^ n >>> 15, 0x846ca68b);
  return ((n ^ n >>> 16) >>> 0) / 4294967296;
}
// Independent value noise for irregular dust banks; no borrowed image or shader.
function noise3(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const smooth = t => t * t * (3 - 2 * t);
  const sx = smooth(x - ix), sy = smooth(y - iy), sz = smooth(z - iz);
  let value = 0;
  for (let dz = 0; dz < 2; dz++) for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
    const cell = Math.imul(ix + dx, 73856093) ^ Math.imul(iy + dy, 19349663) ^ Math.imul(iz + dz, 83492791);
    value += hash(cell, 0x494d5041, 9) * (dx ? sx : 1 - sx) * (dy ? sy : 1 - sy) * (dz ? sz : 1 - sz);
  }
  return value;
}
// Preserve the sampling API/seed correspondence; replace the old radial shell
// with folded dust banks and embedded filaments inspired by Carina's cavities.
export function sampleImpact(index, seed = 0x4e454255) {
  const a = hash(index, seed, 0), b = hash(index, seed, 1), c = hash(index, seed, 2);
  const population = hash(index, seed, 3);
  let role = population < .61 ? 0 : population < .86 ? 1 : 2;
  // Logistic tails taper density naturally; no straight rectangular cutoffs.
  const t = Math.log((a + .0002) / (1.0002 - a)) * .42;
  const ridge = .66 * noise3(t * 3.1 + 8, b * 3.1, c * 2.3)
    + .34 * noise3(t * 7.3, b * 6.1 + 13, c * 4.7);
  const spine = .18 * Math.sin(t * 3.6 + .4) + .11 * Math.sin(t * 7.4 - .6);
  const taper = Math.sqrt(Math.max(0, 1 - t * t));
  const thickness = (.23 + .57 * ridge) * (.35 + .65 * taper);
  let position;
  if (role === 0) {
    const across = Math.log((b + .0005) / (1.0005 - b)) * .38;
    // The dark rift divides uneven banks rather than leaving a circular rim.
    const rift = .095 * Math.exp(-Math.pow((t + .08) / .70, 2));
    const y = spine + across * thickness + Math.sign(across) * rift;
    position = [t * 1.29 + Math.sin(y * 6.0 + c * 4.0) * .10,
      y + Math.sin(t * 12.0 + c * 5.0) * .035,
      (c - .5) * .66 + Math.sin(t * 4.1) * .13];
  } else if (role === 1) {
    const strand = Math.floor(hash(index, seed, 4) * 7);
    const lane = (strand - 3) * .105;
    position = [t * 1.39, spine + lane * (.6 + .4 * taper)
      + Math.sin(t * (5.0 + strand * .37) + strand) * .065 + (b - .5) * .022,
      Math.sin(t * 3.1 + strand * .8) * .20 + (c - .5) * .07];
  } else if (hash(index, seed, 6) < .24) {
    role = 3;
    const knot = Math.floor(hash(index, seed, 4) * 3);
    const x = [-.72, .18, .83][knot], y = [.11, -.18, .24][knot];
    const angle = b * TAU, radius = .015 + .105 * Math.sqrt(c);
    position = [x + Math.cos(angle) * radius, y + Math.sin(angle) * radius * .65,
      (a - .5) * .18];
  } else {
    // Elliptical Gaussian dust: sparse escaped grains rather than a box.
    const radius = Math.sqrt(-2 * Math.log(Math.max(a, .000001)));
    position = [Math.cos(b * TAU) * radius * .88,
      Math.sin(b * TAU) * radius * .62, (c - .5) * .95];
  }
  return { position, role, ridge, seed: hash(index, seed, 11) };
}
export function sampleCloud(index, seed = 0x4e454255) {
  return sampleImpact(index, seed).position;
}

// Smooth artistic stream field, not a physical fluid simulation or curl noise.
function direction(x, y, z, frequency) {
  const a = Math.sin(x * frequency * 2.7 + Math.sin(y * 1.9)) * .65;
  const b = Math.cos(y * frequency * 3.1 + z * 1.7) * .38;
  const dx = .62 + Math.cos(a + b) * .60, dy = Math.sin(a - b) * .68 - x * .10;
  const dz = Math.sin(x * 1.2 + y * 2.4) * .16, n = Math.hypot(dx, dy, dz);
  return [dx / n, dy / n, dz / n];
}
export function buildCurrents({ lines = 144, steps = 64, seed = 0x43555252, frequency = .85 } = {}) {
  const rand = seededRandom(seed), vertices = lines * (steps - 1) * 2;
  const position = new Float32Array(vertices * 3), data = new Float32Array(vertices * 3);
  let offset = 0;
  for (let line = 0; line < lines; line++) {
    let p = [-1.8 + rand() * 1.1, (rand() - .5) * 1.35, (rand() - .5) * .65];
    const phase = rand(), tone = rand();
    for (let step = 0; step < steps - 1; step++) {
      const d = direction(...p, frequency), half = p.map((v, k) => v + d[k] * .027);
      const mid = direction(...half, frequency), next = p.map((v, k) => v + mid[k] * .054);
      for (const [point, along] of [[p, step / (steps - 1)], [next, (step + 1) / (steps - 1)]]) {
        position.set(point, offset * 3); data.set([along, phase, tone], offset * 3); offset++;
      }
      p = next;
    }
  }
  return { position, data, lines, steps, vertices };
}

export const cloudMappingGLSL = `
vec3 nebulaCloud(vec3 cloud, vec2 axis) {
  // Impact is radial, not the previous diagonal galaxy. Keep axis in the API.
  return vec3(cloud.xy, cloud.z * .86 - .20);
}
// Scroll-driven differential vortex during birth only. No accumulated state:
// reversing the scroll retraces the arms; the settled cloud stays exact.
vec3 nebulaBirthSpiral(vec3 cloud, float birth, float seed, float reduced) {
  if (birth >= 1.0 || reduced > .5) return cloud;
  float remaining = 1.0 - smoothstep(0.0, 1.0, birth);
  cloud.y *= mix(1.0, .48, remaining);
  float radius = length(cloud.xy);
  float angle = remaining * (18.0 / (.42 + radius * 1.15) + (seed - .5) * .24);
  float c = cos(angle), s = sin(angle);
  cloud.xy = vec2(c * cloud.x - s * cloud.y, s * cloud.x + c * cloud.y);
  cloud.z += sin(radius * 4.8 + seed * 6.2831853) * .12 * remaining;
  return cloud;
}
float nebulaBirthGlow(float birth, float reduced) {
  if (birth >= 1.0 || reduced > .5) return 1.0;
  float pulse = sin(birth * 3.14159265);
  return 1.0 + 2.2 * pulse * pulse;
}
vec3 nebulaDustColor(float seed, float along) {
  // Carina/Webb reference palette, sampled in sRGB then converted to linear.
  vec3 copper = vec3(.219526,.056128,.035601);
  vec3 gold = vec3(.508881,.274677,.147027);
  vec3 azure = vec3(.045186,.138432,.366253);
  vec3 dust = mix(copper, gold, smoothstep(.08,.85,seed));
  vec3 cool = mix(dust, azure, smoothstep(.20,.95,along)*.85)*1.4;
  float pearl = pow(seed,18.0) * exp(-along*along*4.0);
  return mix(cool,vec3(.95,.90,.78),pearl);
}
// Astera's endpoint-safe arc/scatter principle. All transit terms vanish at 0/1.
vec3 nebulaTransit(vec3 from, vec3 to, float m, float seed, float handedness) {
  // Exact guards avoid sin(pi)'s float residue at the protected destinations.
  if (m <= 0.0) return from;
  if (m >= 1.0) return to;
  float transit = sin(m * 3.14159265);
  vec3 p = mix(from, to, m);
  vec3 pivot = mix(from, to, .5);
  float angle = handedness * .68 * transit * (.55 + seed * .45);
  vec2 offset = p.xy - pivot.xy;
  p.xy = pivot.xy + mat2(cos(angle),-sin(angle),sin(angle),cos(angle)) * offset;
  float phase = seed * 6.2831853;
  vec3 scatter = vec3(sin(phase * 2.3), cos(phase * 1.7), sin(phase * 3.1));
  p += scatter * vec3(.12,.10,.28) * transit * transit;
  return p;
}
`;
