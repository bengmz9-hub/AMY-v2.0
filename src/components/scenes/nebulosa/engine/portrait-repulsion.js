// Local adaptation of the live Astera radial cursor field; no screen-space warp.
export function createPortraitRepulsion(THREE) {
  const uniforms = {
    uPortraitRepelPointer: {value: new THREE.Vector2()},
    uPortraitRepelStrength: {value: 0},
    uPortraitRepelRadius: {value: 0.78}
  };
  const faceCap = 0.145, hairCap = 0.160;
  let inputStrength = 0, releaseAge = 0, releaseStrength = 0, enabledNow = false;
  function attach(shader) {
    if (!shader?.uniforms || !shader.vertexShader?.includes('attribute vec4 aMotion;') ||
        shader.vertexShader.split('#include <common>').length !== 2 ||
        shader.vertexShader.split('#include <project_vertex>').length !== 2 ||
        shader.vertexShader.includes('OSCAR30_RADIAL_REPULSION')) {
      throw new Error('Portrait repulsion requires the unpatched portrait motion shader');
    }
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `
      #include <common>
      // OSCAR30_RADIAL_REPULSION
      uniform vec2 uPortraitRepelPointer;
      uniform float uPortraitRepelStrength, uPortraitRepelRadius;
    `).replace('#include <project_vertex>', `
      // The shard moves as one rigid grain; original positions/UV/color stay fixed.
      vec2 repelDelta = aMotion.xy - uPortraitRepelPointer;
      float repelDistance = length(repelDelta);
      float repelFalloff = 1.0 - smoothstep(0.0, uPortraitRepelRadius, repelDistance);
      float repelForm = smoothstep(0.70, 1.0, vNebulaForm);
      // Zero force at the center avoids the previous finite-radius punched hole.
      // A broad shoulder carries nearby features together instead of erasing them.
      float repelInner = smoothstep(0.0, 0.18, repelDistance);
      float repelForce = uPortraitRepelStrength * repelFalloff * repelInner * repelForm;
      vec2 repelDirection = repelDelta / max(repelDistance, 0.0001);
      vec3 repelOffset = vec3(repelDirection, 0.16)
        * repelForce * mix(0.18, 0.20, clamp(aMotion.w, 0.0, 1.0));
      float repelCap = mix(${faceCap}, ${hairCap}, clamp(aMotion.w, 0.0, 1.0));
      repelOffset *= min(1.0, repelCap / max(length(repelOffset), 0.000001));
      transformed += repelOffset;
      #include <project_vertex>
    `);
  }
  function clear() {
    inputStrength = releaseStrength = releaseAge = 0;
    uniforms.uPortraitRepelStrength.value = 0;
  }
  function update({pointerLocal, strength = 0, pointerActive = true, dt = 1 / 60,
    enabled = false, reduced = false, paused = false} = {}) {
    const active = enabled && !reduced && !paused && pointerLocal &&
      Number.isFinite(pointerLocal.x) && Number.isFinite(pointerLocal.y);
    enabledNow = Boolean(active);
    if (!active) { clear(); return; }
    inputStrength = pointerActive && Number.isFinite(strength) ? Math.min(1, Math.max(0, strength)) : 0;
    if (pointerActive) {
      uniforms.uPortraitRepelPointer.value.copy(pointerLocal);
      releaseAge = 0;
      releaseStrength = inputStrength;
    } else {
      releaseAge += Number.isFinite(dt) ? Math.max(0, dt) : 0;
    }
    // Analytic critically damped release: stable with dt, no Euler accumulation.
    const age = releaseAge * 9;
    uniforms.uPortraitRepelStrength.value = pointerActive ? inputStrength
      : releaseAge >= 1.2 ? 0 : releaseStrength * (1 + age) * Math.exp(-age);
  }
  return {uniforms, attach, update,
    clear,
    stats: () => ({enabled: enabledNow, strength: inputStrength,
      displacementStrength: uniforms.uPortraitRepelStrength.value, releaseAge,
      pointer: uniforms.uPortraitRepelPointer.value.toArray(), radius: uniforms.uPortraitRepelRadius.value,
      faceCap, hairCap, space: 'portrait model-local; original targets fixed',
      mechanism: 'broad center-continuous radial XY field, small Z; damped return <=1.2s; no lens or RGB split'})};
}
