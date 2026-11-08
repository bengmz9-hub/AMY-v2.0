import {appendHairDust} from './portrait-hair-dust.js';
import {cloudMappingGLSL} from './particle-dynamics.js';
import {createPortraitPointField, portraitPointFieldGLSL} from './portrait-point-field.js';
import {createAbyssalPhotoBridge, createAbyssalOverflowBridge, abyssalPhotoBridgeGLSL} from './abyssal-photo-bridge.js';

const vertex = `
attribute vec4 aMotion, aCloud;
attribute vec3 aPhotoChroma;
attribute float aDiameter, aHairDust;
uniform float uMotionTime, uMotionAmount, uMotionAssembly;
uniform float uStoryActive, uStoryBirth, uStoryGather, uStoryRelease, uStoryOutflow, uStoryReduced;
uniform vec2 uNebulaAxis;
uniform float uPortraitAspect;
uniform float uCloudScale, uCloudOffset, uPortraitScale, uPointPixels, uPointDpr, uPhotoChroma;
varying vec3 vPointColor;
varying float vPointEnergy, vHairDust;
varying vec3 vBridgeColor;
varying float vBridgeAlpha, vBridgeMix, vBridgeHandoff;
${cloudMappingGLSL}
${portraitPointFieldGLSL}
${abyssalPhotoBridgeGLSL}
float contourHash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float contourNoise(vec2 p) {
  vec2 cell = floor(p), f = fract(p);
  vec2 b = f * f * (3.0 - 2.0 * f);
  return mix(mix(contourHash(cell), contourHash(cell + vec2(1.0, 0.0)), b.x),
    mix(contourHash(cell + vec2(0.0, 1.0)), contourHash(cell + 1.0), b.x), b.y);
}
void main() {
  float seed = aMotion.z, hair = aMotion.w, phase = seed * 6.2831853;
  // Source-locked protection follows this photograph's tilted face.
  vec2 faceAxes = mat2(.9063, .4226, -.4226, .9063) * (uv - vec2(.55, .46));
  float faceRadius = length(faceAxes / vec2(.25, .34));
  float protectedFace = 1.0 - smoothstep(1.0, 1.18, faceRadius);
  float hairPeriphery = hair * (1.0 - protectedFace) * (1.0 - aHairDust);
  float grain = fract(seed * 17.13 + .61);
  vec3 target = position;
  vBridgeColor = vec3(0.0); vBridgeAlpha = 0.0; vBridgeMix = 0.0; vBridgeHandoff = 1.0;
  float introFormed = 1.0;
  float formed = 1.0, visibility = 1.0;
  vec3 p = target;
  // Independent seed motion, no rigid facets or normal-dependent lighting.
  vec3 drift = vec3(sin(uMotionTime * .68 + target.y * 3.0),
    sin(uMotionTime * .85 + target.y * 2.5 + target.x * 1.7),
    sin(uMotionTime * .62 + phase));
  drift *= mix(.0025, .0055, hair) * uMotionAmount;
  drift += vec3(sin(phase * 3.1), cos(phase * 2.7), 2.0)
    * .035 * pow(1.0 - uMotionAssembly, 2.0) * uMotionAmount;
  if (uStoryActive > .5) {
    visibility = uStoryBirth * (1.0 - uStoryOutflow);
    if (uStoryReduced > .5) {
      visibility *= uStoryGather * (1.0 - uStoryRelease);
    } else {
      float entryStagger = seed * .22;
      float exitStagger = fract(seed * 7.13 + .17) * .18;
      float gather = smoothstep(entryStagger, .78 + entryStagger, uStoryGather);
      introFormed = gather;
      float disperse = smoothstep(exitStagger, .82 + exitStagger, uStoryRelease);
      formed = gather * (1.0 - disperse);
      vec3 cloud = nebulaBirthSpiral(nebulaCloud(aCloud.xyz, uNebulaAxis), uStoryBirth, seed, uStoryReduced)
        * mix(.28, 1.0, uStoryBirth);
      cloud.xy *= uCloudScale;
      cloud.y += uCloudOffset;
      cloud += vec3(sin(uMotionTime * .31 + cloud.z * 2.1) * .055,
        cos(uMotionTime * .27 + cloud.x * 2.4) * .045,
        sin(uMotionTime * .23 + cloud.y * 2.3) * .070);
      cloud.y -= uCloudOffset;
      cloud /= uPortraitScale;
      vec3 entryPath = nebulaTransit(cloud, target, gather, seed, 1.0);
      p = nebulaTransit(entryPath, cloud, disperse, seed, -.75);
      p.x += uStoryOutflow * 5.2 / uPortraitScale;
      p.y += sin(uStoryOutflow * 3.14159265) * .14 / uPortraitScale;
      if (gather >= 1.0 && disperse <= 0.0) p = target;
      visibility *= mix(.24, 1.0, formed);
      // The yellow source field hands its light to the existing photo morph.
      // No second copper/blue cloud is drawn over the initial Abyssal scene.
      visibility *= smoothstep(0.0, .35, uStoryGather);
    }
  }
  p += drift * formed;
  vec2 hairJitter = vec2(fract(seed * 83.17 + .31), fract(seed * 107.11 + .73)) - .5;
  p.xy += hairJitter * 0.065 * hairPeriphery * formed;
  vec3 world = (modelMatrix * vec4(p, 1.0)).xyz;
  bool bridgeActive = uStoryActive > .5 && uStoryReduced < .5
    && uStoryGather < 1.0 && uStoryRelease <= 0.0 && introFormed < 1.0;
  float bridgeSize = 0.0;
  if (bridgeActive) {
    AbyssalBridgeSample source = sampleAbyssalBridge();
    vec3 endpoint = target + drift;
    endpoint.xy += hairJitter * .065 * hairPeriphery;
    vec3 destination = (modelMatrix * vec4(endpoint, 1.0)).xyz;
    world = nebulaTransit(source.world, destination, introFormed, seed, 1.0);
    // Solar orbit: retain each grain's correspondence and both exact endpoints.
    // Differential rotation and depth peak only while the portrait is forming.
    if (introFormed > 0.0 && introFormed < 1.0) {
      float crest = sin(introFormed * 3.14159265);
      float angle = crest * 2.35 * (.35 + seed * .65);
      world.xy = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * world.xy;
      world.xy *= 1.0 - crest * .16;
      world.z += sin(seed * 6.2831853 + introFormed * 4.0) * crest * .80;
    }
    vBridgeColor = source.color;
    vBridgeAlpha = source.alpha;
    vBridgeMix = 1.0 - introFormed;
    vBridgeHandoff = uAbHandoff;
    bridgeSize = source.pointSize;
  }
  // Apply the exact nebula force to current rendered positions AFTER photo scale.
  if (bridgeActive) world = mix(world, applyPortraitPointField(world, seed), introFormed);
  else world = applyPortraitPointField(world, seed);
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  float hairSize = mix(1.0, mix(.65, 1.55, grain), hairPeriphery * formed);
  gl_PointSize = max(.8, aDiameter * uPointPixels * mix(.34, uPortraitScale, formed) * hairSize) * uPointDpr;
  if (bridgeActive) {
    float endpointHairSize = mix(1.0, mix(.65, 1.55, grain), hairPeriphery);
    float endpointSize = max(.8, aDiameter * uPointPixels * uPortraitScale * endpointHairSize) * uPointDpr;
    gl_PointSize = mix(bridgeSize, endpointSize, introFormed);
  }
  float photoY = dot(color, vec3(.2126, .7152, .0722));
  photoY += min(photoY, .14) * hairPeriphery * (1.0 + .75 * grain);
  // Keep the warm photograph's body intact; soften only its brightest grains.
  float photoPeak = max(photoY - .25, 0.0);
  photoY = min(photoY, .25) + photoPeak / (1.0 + 1.5 * photoPeak);
  vec3 photo = photoY * 1.65 * mix(vec3(1.0), aPhotoChroma, uPhotoChroma);
  vec3 cloudTint = nebulaDustColor(seed, aCloud.x * 1.35 + aCloud.z * .42);
  vPointColor = mix(cloudTint * (.25 + seed * 1.9), photo, formed);
  vPointColor *= mix(nebulaBirthGlow(uStoryBirth, uStoryReduced), 1.0, formed);
  if (bridgeActive) vPointColor = photo;

  float noise = .65 * contourNoise(uv * vec2(8.0, 10.0) + vec2(1.7, 8.2))
    + .35 * contourNoise(uv * vec2(19.0, 23.0) + vec2(13.4, 2.8));
  vec2 sourceEdge = min(uv, 1.0 - uv) * vec2(uPortraitAspect, 1.0);
  float edgeWidth = mix(.18 + .06 * noise, .11, protectedFace);
  float boundary = smoothstep(0.0, edgeWidth, min(sourceEdge.x, sourceEdge.y));
  float outer = (1.0 - smoothstep(1.10, 2.25, faceRadius + .18 * (noise - .5)))
    * mix(.60, 1.0, noise);
  float contourCoverage = boundary * mix(outer, 1.0, protectedFace);
  float twinkle = 1.0 + .045 * sin(uMotionTime * .83 + phase) * uMotionAmount;
  // Fade alpha only, and leave the unformed nebula unchanged.
  float dustCoverage = (1.0 - protectedFace) * exp(-1.20 * max(faceRadius - 1.25, 0.0))
    * mix(.20, 1.0, smoothstep(.25, .75, noise));
  float coverage = mix(contourCoverage, dustCoverage, aHairDust);
  float dustBirth = mix(1.0, smoothstep(.15, .75, formed), aHairDust);
  vPointEnergy = step(seed, visibility) * twinkle * mix(1.0, coverage, formed) * dustBirth;
  if (bridgeActive) vPointEnergy = twinkle * coverage;
  vHairDust = aHairDust;
}`;

const fragment = `
uniform float uAbCarrierOnly;
varying vec3 vPointColor;
varying float vPointEnergy, vHairDust;
varying vec3 vBridgeColor;
varying float vBridgeAlpha, vBridgeMix, vBridgeHandoff;
void main() {
  if (uAbCarrierOnly > .5 && vBridgeMix <= 0.0) discard;
  float r = length((gl_PointCoord - .5) * 2.0);
  if (r > 1.0 || (vPointEnergy <= 0.0 && vBridgeMix <= 0.0)) discard;
  float f = 1.0 - r, halo = .48 * pow(f, 1.8), core = pow(f, 6.8);
  float dustHalo = exp(-3.3 * r * r) * (1.0 - smoothstep(.72, 1.0, r));
  vec3 radiance = vPointColor * mix(halo + core * 1.85, dustHalo * 1.20, vHairDust);
  float alpha = mix(halo + core, dustHalo * 0.18, vHairDust) * vPointEnergy;
  // Overflow grains borrow a destination only for travel. They never add
  // another copy of that destination to the protected photo.
  if (uAbCarrierOnly > .5) { radiance = vec3(0.0); alpha = 0.0; }
  if (vBridgeMix > 0.0) {
    float sourceHalo = .45 * pow(f, 1.8), sourceCore = pow(f, 6.5);
    vec3 sourceRadiance = vBridgeColor * (sourceHalo + sourceCore * 1.85);
    float sourceAlpha = (sourceHalo + sourceCore) * vBridgeAlpha;
    // Interpolate additive light, then recover straight-alpha RGB. Mixing RGB
    // and alpha independently would introduce a dim valley between materials.
    vec3 light = mix(radiance * alpha, sourceRadiance * sourceAlpha, vBridgeMix);
    alpha = mix(alpha, sourceAlpha, vBridgeMix) * vBridgeHandoff;
    radiance = light * vBridgeHandoff / max(alpha, .000001);
  }
  gl_FragColor = vec4(radiance, alpha);
}`;

export function createPortraitPoints({THREE, sourceGeometry, baseDepth, portraitWidth, group, motionUniforms, photoUniforms, camera, renderer, yellowSource}) {
  const source = sourceGeometry.attributes;
  let count = source.position.count / 4;
  if (!Number.isSafeInteger(count) || count < 1 || baseDepth?.length !== count
    || !Number.isFinite(portraitWidth) || portraitWidth <= 0)
    throw new RangeError('Warm portrait geometry, base depth and width must agree');
  let sourceDepth = Float32Array.from(baseDepth);
  if (sourceDepth.some(value => !Number.isFinite(value)))
    throw new RangeError('Warm portrait base depth must be finite');
  const geometry = new THREE.BufferGeometry();
  let positions = new Float32Array(count * 3);
  const diameter = new Float32Array(count);
  for (const name of ['color', 'uv', 'aMotion', 'aCloud', 'aPhotoChroma']) {
    const attr = source[name], array = new Float32Array(count * attr.itemSize);
    for (let i = 0; i < count; i++) array.set(attr.array.subarray(i * 4 * attr.itemSize, (i * 4 + 1) * attr.itemSize), i * attr.itemSize);
    geometry.setAttribute(name, new THREE.BufferAttribute(array, attr.itemSize));
  }
  for (let i = 0; i < count; i++) {
    positions.set([source.aMotion.array[i * 16], source.aMotion.array[i * 16 + 1], source.aCloud.array[i * 16 + 3]], i * 3);
    const p = source.position.array, k = i * 12;
    const diagonal = Math.max(Math.hypot(p[k] - p[k + 6], p[k + 1] - p[k + 7]),
      Math.hypot(p[k + 3] - p[k + 9], p[k + 4] - p[k + 10]));
    diameter[i] = diagonal * 1.9;
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aDiameter', new THREE.BufferAttribute(diameter, 1));
  const dust = appendHairDust({THREE, geometry, baseDepth: sourceDepth, portraitWidth, extraCount: 14000});
  sourceDepth = dust.baseDepth;
  positions = geometry.attributes.position.array;
  count = positions.length / 3;
  const bridge = createAbyssalPhotoBridge({THREE, geometry, source: yellowSource, camera, renderer});
  const overflow = createAbyssalOverflowBridge({THREE, geometry, source: yellowSource, camera, renderer});
  let currentDepthScale;
  const field = createPortraitPointField(THREE);
  const uniforms = {...motionUniforms, ...photoUniforms, ...field.uniforms, ...bridge.uniforms,
    uAbCarrierOnly: {value: 0}, uPortraitAspect: {value: portraitWidth * .5},
    uPointPixels: {value: 1}, uPointDpr: {value: 1}};
  const material = new THREE.ShaderMaterial({uniforms, vertexShader: vertex, fragmentShader: fragment,
    vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false});
  const points = new THREE.Points(geometry, material);
  points.name = 'amy-photo-points'; points.frustumCulled = false; group.add(points);
  const overflowMaterial = overflow ? new THREE.ShaderMaterial({
    uniforms: {...uniforms, ...overflow.uniforms, uAbCarrierOnly: {value: 1}},
    vertexShader: vertex, fragmentShader: fragment, vertexColors: true,
    transparent: true, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false
  }) : null;
  const overflowPoints = overflow ? new THREE.Points(overflow.geometry, overflowMaterial) : null;
  if (overflowPoints) {
    overflowPoints.name = 'amy-nebula-overflow'; overflowPoints.frustumCulled = false;
    overflowPoints.visible = false; group.add(overflowPoints);
  }
  function resize(width, height) {
    field.resize(camera, height);
    uniforms.uPointPixels.value = height / (camera.top - camera.bottom);
    uniforms.uPointDpr.value = renderer.getPixelRatio();
  }
  return {points, field, resize,
    update({phase, mode, pointer, strength, enabled, reduced, paused}) {
      field.update({pointer, strength, enabled, reduced, paused});
      points.visible = mode === 'portrait' && phase.birth * (1 - phase.outflow) > 0 && phase.amyGather > 0;
      if (overflowPoints) overflowPoints.visible = points.visible && !reduced
        && phase.amyGather < 1 && phase.amyRelease <= 0;
    },
    // Initial XYZ is copied exactly from warm A. Only explicit depth controls
    // reconstruct Z, independently of the temporary source geometry's lifetime.
    syncDepth(_legacyGeometry, nextDepthScale) {
      if (!Number.isFinite(nextDepthScale) || nextDepthScale < 0)
        throw new RangeError('depthScale must be finite and nonnegative');
      if (nextDepthScale === currentDepthScale) return;
      const cloud = geometry.attributes.aCloud.array;
      const zAmplitude = nextDepthScale * portraitWidth;
      for (let i = 0; i < count; i++) {
        const z = sourceDepth[i] * zAmplitude;
        positions[i * 3 + 2] = z; cloud[i * 4 + 3] = z;
      }
      currentDepthScale = nextDepthScale;
      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.aCloud.needsUpdate = true;
      geometry.computeBoundingBox(); geometry.computeBoundingSphere();
      overflow?.syncDepth();
    },
    stats() {return {representation: 'THREE.Points', material: 'ShaderMaterial', primitive: 'POINTS',
      pointCount: count, basePointCount: dust.baseCount, hairDustCount: dust.dustCount, visible: points.visible, field: field.stats(),
      appearance: 'warm source-field photograph, original chroma and grains, softened upper peaks',
      bridge: bridge.stats(),
      overflow: overflow ? {...overflow.stats(), visible: overflowPoints.visible} : null,
      geometryBytes: Object.values(geometry.attributes).reduce((sum, a) => sum + a.array.byteLength, 0),
      geometry: Object.fromEntries(Object.entries(geometry.attributes).map(([name, a]) => [name, {count: a.count, version: a.version}]))};},
    dispose() {
      bridge.dispose?.(); overflow?.dispose(); field.clear(); group.remove(points);
      if (overflowPoints) group.remove(overflowPoints);
      overflowMaterial?.dispose(); geometry.dispose(); material.dispose();
    }
  };
}
