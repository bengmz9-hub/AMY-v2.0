// Dust has its own stateless channels; warm-photo samples and their PRNG stay intact.
function dustRandom(index, channel) {
  let n = Math.imul(index + 1, 0x9e3779b1) ^ Math.imul(channel + 1, 0x85ebca6b) ^ 0x48414952;
  n = Math.imul(n ^ n >>> 16, 0x7feb352d);
  n = Math.imul(n ^ n >>> 15, 0x846ca68b);
  return ((n ^ n >>> 16) >>> 0) / 4294967296;
}

export function appendHairDust({THREE, geometry, baseDepth, portraitWidth, extraCount = 14000}) {
  const sizes = {position: 3, color: 3, uv: 2, aMotion: 4, aCloud: 4, aPhotoChroma: 3, aDiameter: 1};
  const source = geometry.attributes, baseCount = source.position?.count;
  if (!Number.isSafeInteger(baseCount) || baseCount < 0 || baseDepth?.length !== baseCount
    || !Number.isSafeInteger(extraCount) || extraCount < 0
    || !Number.isFinite(portraitWidth) || portraitWidth <= 0)
    throw new RangeError('Hair dust needs matching point/depth buffers, width and nonnegative count');
  for (const [name, size] of Object.entries(sizes)) {
    const attr = source[name];
    if (attr?.count !== baseCount || attr.itemSize !== size || !(attr.array instanceof Float32Array))
      throw new RangeError('Warm point attribute mismatch: ' + name);
  }
  if (source.aHairDust) throw new RangeError('Hair dust is appended once per fresh geometry');
  const c = .9063, s = .4226, rotationNorm = c * c + s * s;
  const pool = [];
  for (let i = 0; i < baseCount; i++) {
    if (source.aMotion.array[i * 4 + 3] <= .65) continue;
    const du = source.uv.array[i * 2] - .55, dv = source.uv.array[i * 2 + 1] - .46;
    const qx = (c * du - s * dv) / .25, qy = (s * du + c * dv) / .34;
    if (Math.hypot(qx, qy) >= 1.25) pool.push(i);
  }
  const dustCount = pool.length ? extraCount : 0, count = baseCount + dustCount;
  const arrays = {};
  for (const [name, size] of Object.entries(sizes)) {
    arrays[name] = new Float32Array(count * size);
    arrays[name].set(source[name].array);
  }
  const depths = new Float32Array(count), hairDust = new Float32Array(count);
  depths.set(baseDepth);
  for (let j = 0; j < dustCount; j++) {
    const from = pool[Math.floor(dustRandom(j, 0) * pool.length)], i = baseCount + j;
    const du = source.uv.array[from * 2] - .55, dv = source.uv.array[from * 2 + 1] - .46;
    const qx = (c * du - s * dv) / .25, qy = (s * du + c * dv) / .34;
    const radius = Math.hypot(qx, qy), nx = qx / radius, ny = qy / radius;
    // Exponential outward travel plus independent tangential spread. No ring,
    // shared destination radius or photograph-boundary clamp is introduced.
    const travel = .015 - Math.log(1 - dustRandom(j, 1)) * (.18 + .50 * dustRandom(j, 2));
    const gaussian = Math.sqrt(-2 * Math.log(1 - dustRandom(j, 3)))
      * Math.cos(dustRandom(j, 4) * Math.PI * 2);
    const tangent = gaussian * travel * .55;
    const tx = qx + nx * travel - ny * tangent, ty = qy + ny * travel + nx * tangent;
    const u = .55 + (c * tx * .25 + s * ty * .34) / rotationNorm;
    const v = .46 + (-s * tx * .25 + c * ty * .34) / rotationNorm;
    const z = source.position.array[from * 3 + 2];
    arrays.position.set([(u - .5) * portraitWidth, (v - .5) * 2, z], i * 3);
    const x = arrays.position[i * 3], y = arrays.position[i * 3 + 1];
    arrays.uv.set([x / portraitWidth + .5, y / 2 + .5], i * 2);
    arrays.aMotion.set([x, y, dustRandom(j, 5), 1], i * 4);
    arrays.aCloud.set(source.aCloud.array.subarray(from * 4, from * 4 + 4), i * 4);
    arrays.aCloud[i * 4 + 3] = z;
    arrays.aPhotoChroma.set(source.aPhotoChroma.array.subarray(from * 3, from * 3 + 3), i * 3);
    arrays.aDiameter[i] = source.aDiameter.array[from] * (1.5 + 1.5 * dustRandom(j, 6));
    const k = from * 3, targetY = .06 + .07 * dustRandom(j, 7);
    let r = source.color.array[k], g = source.color.array[k + 1], b = source.color.array[k + 2];
    let luminance = r * .2126 + g * .7152 + b * .0722;
    if (luminance <= 1e-8) {
      r = .46; g = .36; b = .76;
      luminance = r * .2126 + g * .7152 + b * .0722;
    }
    arrays.color.set([r * targetY / luminance, g * targetY / luminance, b * targetY / luminance], i * 3);
    depths[i] = baseDepth[from]; hairDust[i] = 1;
  }
  for (const [name, size] of Object.entries(sizes)) {
    const attr = new THREE.BufferAttribute(arrays[name], size, source[name].normalized);
    attr.setUsage(source[name].usage);
    geometry.setAttribute(name, attr);
  }
  geometry.setAttribute('aHairDust', new THREE.BufferAttribute(hairDust, 1));
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return {baseDepth: depths, baseCount, dustCount};
}
