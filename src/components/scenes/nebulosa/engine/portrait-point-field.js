// Same direct world-XY field as particle-atmosphere.js. Keep the photo's group
// scale out of these units: apply this AFTER modelMatrix, to the visible point.
export const portraitPointFieldGLSL = `
uniform vec2 uPointPointer, uPointHalfView;
uniform float uPointFieldScale, uPointPointerStrength;
vec3 applyPortraitPointBase(vec3 p) {
  vec2 delta = p.xy - (uPointPointer * 2.0 - 1.0) * uPointHalfView;
  float distanceToPointer = length(delta);
  float influence = (1.0 - smoothstep(0.0, .66 * uPointFieldScale, distanceToPointer))
    * uPointPointerStrength;
  p.xy += delta / max(distanceToPointer, .0001) * influence * .26 * uPointFieldScale;
  p.z += influence * .10 * uPointFieldScale;
  return p;
}
vec3 applyPortraitPointField(vec3 p, float seed) {
  vec3 displaced = applyPortraitPointBase(p);
  vec2 delta = p.xy - (uPointPointer * 2.0 - 1.0) * uPointHalfView;
  float distanceToPointer = length(delta);
  float influence = (1.0 - smoothstep(0.0, .66 * uPointFieldScale, distanceToPointer))
    * uPointPointerStrength;
  vec2 direction = delta / max(distanceToPointer, .0001);
  vec2 tangent = vec2(-direction.y, direction.x);
  // The original uniform seed is evenly spread across the photo samples.
  // Mean radial gain stays 1; individual grains span .4..1.6 rather than
  // piling the shallow photograph into the same circular rim.
  float radialVariation = (seed * 2.0 - 1.0) * .60;
  float tangentVariation = fract(seed * 23.0 + .37) * 2.0 - 1.0;
  float depthVariation = fract(seed * 37.0 + .71) * 2.0 - 1.0;
  vec3 scatter = vec3(direction * .26 * radialVariation + tangent * .12 * tangentVariation,
    .14 * depthVariation) * influence * uPointFieldScale;
  return displaced + scatter;
}`;

export function createPortraitPointField(THREE) {
  const uniforms = {
    uPointPointer: {value: new THREE.Vector2(.5, .5)},
    uPointHalfView: {value: new THREE.Vector2(1, 1)},
    uPointFieldScale: {value: 1},
    uPointPointerStrength: {value: 0}
  };
  let inputStrength = 0, enabledNow = false, pixelsPerWorld = 1;
  function resize(camera, height) {
    uniforms.uPointHalfView.value.set(camera.right, camera.top);
    uniforms.uPointFieldScale.value = camera.top / 1.08;
    pixelsPerWorld = height / (camera.top - camera.bottom);
  }
  function update({pointer, strength = 0, enabled = false, reduced = false, paused = false}) {
    const valid = pointer && Number.isFinite(pointer.x) && Number.isFinite(pointer.y);
    inputStrength = Number.isFinite(strength) ? Math.max(0, Math.min(1, strength)) : 0;
    enabledNow = Boolean(valid && enabled && !reduced && !paused);
    // Copy the DOM UV without a raycast, lerp, face gate or secondary envelope.
    if (valid) uniforms.uPointPointer.value.copy(pointer);
    uniforms.uPointPointerStrength.value = enabledNow ? inputStrength : 0;
  }
  return {uniforms, resize, update,
    clear() {inputStrength = 0; uniforms.uPointPointerStrength.value = 0;},
    stats() {
      const scale = uniforms.uPointFieldScale.value;
      return {enabled: enabledNow, inputStrength, strength: uniforms.uPointPointerStrength.value,
        displacementStrength: uniforms.uPointPointerStrength.value,
        pointerUV: uniforms.uPointPointer.value.toArray(),
        pointerWorld: uniforms.uPointPointer.value.clone().multiplyScalar(2).subScalar(1)
          .multiply(uniforms.uPointHalfView.value).toArray(),
        radiusWorld: .66 * scale, maxXYWorld: .26 * scale, maxZWorld: .10 * scale,
        radiusPixels: .66 * scale * pixelsPerWorld, maxXYPixels: .26 * scale * pixelsPerWorld,
        space: 'current morphed world position, direct bottom-left DOM UV',
        coordinateSmoothing: false, faceHairCaps: false,
        scatter: {radialGain: [.4, 1.6], tangentWorld: .12 * scale, depthWorld: .14 * scale,
          maxTotalXYWorld: Math.hypot(.26 * 1.6, .12) * scale,
          maxTotalXYPixels: Math.hypot(.26 * 1.6, .12) * scale * pixelsPerWorld,
          maxTotalZWorld: .24 * scale, seedSource: 'original aMotion.z; no new PRNG',
          mean: 'base field; zero-mean signed seed scatter', support: 'same base influence, zero at strength0/outside radius'},
        mechanism: 'exact particle-atmosphere BASE field plus deterministic grain scatter; shared main envelope'};
    }
  };
}
