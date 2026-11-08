import * as THREE from './vendor/build/three.module.js';
import {writePhotoChroma, attachPhotoAppearance, photoAppearanceUniforms} from './appearance.js';
import { evaluateNebulosa } from '../phases.js';
import { sampleCloud } from './particle-dynamics.js';
import { createPlatformMeshes } from './platform-particles.js';
import { createDeepSpace, cloudMappingGLSL } from './deep-space.js';
import { createPortraitRepulsion } from './portrait-repulsion.js';
import { addPortraitGrainUV, attachPortraitSoftness } from './portrait-softness.js';
import { portraitScaleForWidth } from './social-layout.js';
import { createPortraitPoints } from './portrait-points.js';
import { waitForGpu } from './wait-for-gpu.js';

const ASSETS = {
  metaUrl: new URL('./assets/depth.json?no-inline', import.meta.url).href,
  depthUrl: new URL('./assets/depth.f32', import.meta.url).href,
  rgbaUrl: new URL('./assets/amy-rgba.png', import.meta.url).href,
  hairUrl: new URL('./assets/hair-weight.f32', import.meta.url).href
};

const DEFAULTS = {
  mode: 'portrait',
  depthScale: 0.12,
  targetQuads: 100000,
  splitPercent: 50,
  fragmentScale: 3,
  exposure: 0.7,
  desaturation: 0,
  photoChroma: 0.36,
  seed: 0x414d5931
};

// PRNG determinista (Mulberry32)
function createPRNG(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function mix(a, b, t) {
  return a + (b - a) * t;
}

// Soporta correctamente intervalos ascendentes (edge0 < edge1) y descendentes (edge0 > edge1)
function smoothstep(edge0, edge1, x) {
  if (edge0 === edge1) return x < edge0 ? 0 : 1;
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

// Filtro separable rápido ponderado por máscara alfa
function blurFieldAlphaWeighted(src, weightMask, width, height, radius) {
  const n = width * height;
  const tmpVal = new Float32Array(n);
  const tmpW = new Float32Array(n);
  const dst = new Float32Array(n);

  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      let sumV = 0;
      let sumW = 0;
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(width - 1, x + radius);
      for (let xx = x0; xx <= x1; xx++) {
        const idx = row + xx;
        const w = weightMask[idx];
        if (w > 0) {
          sumV += src[idx] * w;
          sumW += w;
        }
      }
      const outIdx = row + x;
      tmpVal[outIdx] = sumV;
      tmpW[outIdx] = sumW;
    }
  }

  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(height - 1, y + radius);
    for (let x = 0; x < width; x++) {
      let sumV = 0;
      let sumW = 0;
      for (let yy = y0; yy <= y1; yy++) {
        const idx = yy * width + x;
        sumV += tmpVal[idx];
        sumW += tmpW[idx];
      }
      const outIdx = y * width + x;
      dst[outIdx] = sumW > 1e-5 ? sumV / sumW : src[outIdx];
    }
  }

  return dst;
}

function computePercentile(values, q) {
  if (!values.length) return 0;
  const sorted = Float32Array.from(values).sort();
  const pos = clamp(Math.floor((sorted.length - 1) * q), 0, sorted.length - 1);
  return sorted[pos];
}

// Postprocesado calibrado al umbral alto de Lucy (threshold ~0.88, sin halo violeta sobre el borde del pelo)
class PortraitPostProcessor {
  constructor(renderer, width, height) {
    this.renderer = renderer;
    this.width = width;
    this.height = height;

    const rtParams = {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: true
    };
    this.sceneRT = new THREE.WebGLRenderTarget(width, height, rtParams);

    const bloomParams = {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false
    };
    const bw = Math.max(2, Math.round(width / 2));
    const bh = Math.max(2, Math.round(height / 2));
    const bw2 = Math.max(2, Math.round(width / 4));
    const bh2 = Math.max(2, Math.round(height / 4));

    this.brightRT = new THREE.WebGLRenderTarget(bw, bh, bloomParams);
    this.blurH1 = new THREE.WebGLRenderTarget(bw, bh, bloomParams);
    this.blurV1 = new THREE.WebGLRenderTarget(bw, bh, bloomParams);
    this.blurH2 = new THREE.WebGLRenderTarget(bw2, bh2, bloomParams);
    this.blurV2 = new THREE.WebGLRenderTarget(bw2, bh2, bloomParams);

    this.quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quadGeo = new THREE.PlaneGeometry(2, 2);

    this.highPassMat = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        uThreshold: { value: 0.86 },
        uSmooth: { value: 0.06 }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        uniform sampler2D tDiffuse;
        uniform float uThreshold;
        uniform float uSmooth;
        void main() {
          vec3 col = texture2D(tDiffuse, vUv).rgb;
          float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
          float knee = smoothstep(uThreshold - uSmooth, uThreshold + uSmooth, lum);
          gl_FragColor = vec4(col * knee, 1.0);
        }
      `,
      depthTest: false,
      depthWrite: false
    });

    this.blurMat = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        uDirection: { value: new THREE.Vector2(1, 0) },
        uTexelSize: { value: new THREE.Vector2(1 / bw, 1 / bh) }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        uniform sampler2D tDiffuse;
        uniform vec2 uDirection;
        uniform vec2 uTexelSize;
        void main() {
          vec2 stepUV = uDirection * uTexelSize;
          vec3 sum = texture2D(tDiffuse, vUv).rgb * 0.227027;
          sum += texture2D(tDiffuse, vUv + stepUV * 1.384615).rgb * 0.316216;
          sum += texture2D(tDiffuse, vUv - stepUV * 1.384615).rgb * 0.316216;
          sum += texture2D(tDiffuse, vUv + stepUV * 3.230769).rgb * 0.070270;
          sum += texture2D(tDiffuse, vUv - stepUV * 3.230769).rgb * 0.070270;
          gl_FragColor = vec4(sum, 1.0);
        }
      `,
      depthTest: false,
      depthWrite: false
    });

    this.compositeMat = new THREE.ShaderMaterial({
      uniforms: {
        tScene: { value: null },
        tBloom1: { value: null },
        tBloom2: { value: null },
        uBloomStrength: { value: 0.34 },
        uDesaturate: { value: DEFAULTS.desaturation },
        uExposure: { value: DEFAULTS.exposure },
        uYellowMix: { value: 0 },
        uMouse: { value: new THREE.Vector2(0.5, 0.5) },
        uTime: { value: 0.0 },
        uReliefMode: { value: 0.0 }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        uniform sampler2D tScene;
        uniform sampler2D tBloom1;
        uniform sampler2D tBloom2;
        uniform float uBloomStrength;
        uniform float uDesaturate;
        uniform float uExposure;
        uniform float uYellowMix;
        uniform vec2 uMouse;
        uniform float uTime;
        uniform float uReliefMode;

        vec3 acesFilm(vec3 x) {
          float a = 2.51;
          float b = 0.03;
          float c = 2.43;
          float d = 0.59;
          float e = 0.14;
          return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
        }

        vec3 linearToSRGB(vec3 color) {
          return mix(1.055 * pow(color, vec3(1.0 / 2.4)) - 0.055,
            color * 12.92, lessThanEqual(color, vec3(0.0031308)));
        }

        // ACES filmic matrix/fit from the local MIT Three.js tone-mapping chunk.
        // The Abyssal field uses this path; the protected portrait keeps acesFilm.
        vec3 yellowACES(vec3 color) {
          const mat3 inputMat = mat3(.59719,.07600,.02840,
            .35458,.90834,.13383,.04823,.01566,.83777);
          const mat3 outputMat = mat3(1.60475,-.10208,-.00327,
            -.53108,1.10813,-.07276,-.07367,-.00605,1.07602);
          color = inputMat * (color / .6);
          vec3 a = color * (color + .0245786) - .000090537;
          vec3 b = color * (.983729 * color + .4329510) + .238081;
          return clamp(outputMat * (a / b), 0.0, 1.0);
        }

        void main() {
          vec2 uv = vUv;
          // Sample the scene once, without a screen-space lens or RGB channel offsets.
          vec3 base = texture2D(tScene, uv).rgb;

          if (uReliefMode > 0.5) {
            vec3 mapped = pow(clamp(base, 0.0, 1.0), vec3(1.0 / 2.2));
            gl_FragColor = vec4(mapped, 1.0);
            return;
          }

          vec3 b1 = texture2D(tBloom1, uv).rgb;
          vec3 b2 = texture2D(tBloom2, uv).rgb;
          vec3 bloom = (b1 * 0.36 + b2 * 0.41) * uBloomStrength;

          vec3 hdr = base + bloom;
          vec3 mapped = acesFilm(hdr * 0.96 * uExposure);
          if (uYellowMix > 0.0) mapped = mix(mapped, yellowACES(hdr), uYellowMix);

          float luma = dot(mapped, vec3(0.2126, 0.7152, 0.0722));
          // Neutral shared output: AMY/photo and logo chroma are controlled per material.
          vec3 finalCol = mix(mapped, vec3(luma), uDesaturate);
          finalCol = linearToSRGB(clamp(finalCol, 0.0, 1.0));

          gl_FragColor = vec4(finalCol, 1.0);
        }
      `,
      depthTest: false,
      depthWrite: false
    });

    this.quadMesh = new THREE.Mesh(this.quadGeo, this.highPassMat);
    this.quadScene = new THREE.Scene();
    this.quadScene.add(this.quadMesh);
  }

  setSize(width, height) {
    this.width = Math.max(2, width);
    this.height = Math.max(2, height);
    const bw = Math.max(2, Math.round(this.width / 2));
    const bh = Math.max(2, Math.round(this.height / 2));
    const bw2 = Math.max(2, Math.round(this.width / 4));
    const bh2 = Math.max(2, Math.round(this.height / 4));

    this.sceneRT.setSize(this.width, this.height);
    this.brightRT.setSize(bw, bh);
    this.blurH1.setSize(bw, bh);
    this.blurV1.setSize(bw, bh);
    this.blurH2.setSize(bw2, bh2);
    this.blurV2.setSize(bw2, bh2);
  }

  render(scene, camera, opts) {
    const r = this.renderer;
    const spread = Number.isFinite(opts.bloomSpread) ? clamp(opts.bloomSpread, 1, 4) : 1;
    r.setRenderTarget(this.sceneRT);
    r.clear();
    r.render(scene, camera);

    const bw = this.brightRT.width;
    const bh = this.brightRT.height;
    const bw2 = this.blurH2.width;
    const bh2 = this.blurH2.height;

    this.quadMesh.material = this.highPassMat;
    this.highPassMat.uniforms.tDiffuse.value = this.sceneRT.texture;
    r.setRenderTarget(this.brightRT);
    r.clear();
    r.render(this.quadScene, this.quadCamera);

    this.quadMesh.material = this.blurMat;
    this.blurMat.uniforms.uTexelSize.value.set(spread / bw, spread / bh);
    this.blurMat.uniforms.tDiffuse.value = this.brightRT.texture;
    this.blurMat.uniforms.uDirection.value.set(1, 0);
    r.setRenderTarget(this.blurH1);
    r.clear();
    r.render(this.quadScene, this.quadCamera);

    this.blurMat.uniforms.tDiffuse.value = this.blurH1.texture;
    this.blurMat.uniforms.uDirection.value.set(0, 1);
    r.setRenderTarget(this.blurV1);
    r.clear();
    r.render(this.quadScene, this.quadCamera);

    this.blurMat.uniforms.uTexelSize.value.set(spread / bw2, spread / bh2);
    this.blurMat.uniforms.tDiffuse.value = this.blurV1.texture;
    this.blurMat.uniforms.uDirection.value.set(1, 0);
    r.setRenderTarget(this.blurH2);
    r.clear();
    r.render(this.quadScene, this.quadCamera);

    this.blurMat.uniforms.tDiffuse.value = this.blurH2.texture;
    this.blurMat.uniforms.uDirection.value.set(0, 1);
    r.setRenderTarget(this.blurV2);
    r.clear();
    r.render(this.quadScene, this.quadCamera);

    this.quadMesh.material = this.compositeMat;
    this.compositeMat.uniforms.tScene.value = this.sceneRT.texture;
    this.compositeMat.uniforms.tBloom1.value = this.blurV1.texture;
    this.compositeMat.uniforms.tBloom2.value = this.blurV2.texture;
    this.compositeMat.uniforms.uMouse.value.copy(opts.mouseUV);
    this.compositeMat.uniforms.uTime.value = opts.time;
    this.compositeMat.uniforms.uReliefMode.value = opts.mode === 'relief' ? 1.0 : 0.0;

    r.setRenderTarget(null);
    r.clear();
    r.render(this.quadScene, this.quadCamera);
  }
}

const state = {
  status: 'loading',
  error: null,
  mode: DEFAULTS.mode,
  frozen: false,
  reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  yawDeg: 0,
  pitchDeg: 0,
  targetYawDeg: 0,
  targetPitchDeg: 0,
  depthScale: DEFAULTS.depthScale,
  targetQuads: DEFAULTS.targetQuads,
  fragmentScale: DEFAULTS.fragmentScale,
  splitPercent: DEFAULTS.splitPercent,
  quadCount: 0,
  vertexCount: 0,
  triangleCount: 0,
  faceQuadCount: 0,
  hairQuadCount: 0,
  hairMaskSource: 'none',
  assetDimensions: null,
  depthRange: null,
  luminanceStats: null,
  renderCalls: 0,
  fps: 0,
  time: 0,
  assembly: 0,
  motionPaused: false,
  presentationVisible: true,
  motionReview: false,
  motionIntensity: 1,
  storyProgress: null,
  pointerStrength: 0,
  pointerLocal: new THREE.Vector2(0, 0),
  pointerActive: false,
  pointerType: 'mouse',
  mouseUV: new THREE.Vector2(0.5, 0.5),
  rippleStrength: 0
};

const dom = {
  stage: document.getElementById('stage'),
  canvas: document.getElementById('webgl-canvas'),
  comparisonLayer: document.getElementById('comparison-layer'),
  comparisonClip: document.getElementById('comparison-clip'),
  comparisonDivider: document.getElementById('comparison-divider'),
  photoCanvas: document.getElementById('photo-canvas'),
  photoMiniCanvas: document.getElementById('photo-mini-canvas'),
  statusOverlay: document.getElementById('status-overlay'),
  statusSpinner: document.getElementById('status-spinner'),
  statusTitle: document.getElementById('status-title'),
  statusMessage: document.getElementById('status-message'),
  retryBtn: document.getElementById('retry-btn'),
  modeBtns: [...document.querySelectorAll('.mode-btn')],
  splitControlRow: document.getElementById('split-control-row'),
  splitSlider: document.getElementById('split-slider'),
  splitOutput: document.getElementById('split-output'),
  depthSlider: document.getElementById('depth-slider'),
  depthOutput: document.getElementById('depth-output'),
  particlesSlider: document.getElementById('particles-slider'),
  particlesOutput: document.getElementById('particles-output'),
  resetBtn: document.getElementById('reset-btn'),
  motionBtn: document.getElementById('motion-btn')
};

function setStatusUI(status, title, message, showRetry = false) {
  state.status = status;
  if (status === 'ready') {
    dom.statusOverlay.classList.add('hidden');
    return;
  }
  dom.statusOverlay.classList.remove('hidden');
  dom.statusTitle.textContent = title;
  dom.statusMessage.textContent = message;
  dom.statusSpinner.classList.toggle('hidden', status !== 'loading');
  dom.retryBtn.classList.toggle('hidden', !showRetry);
}

let loadedAssets = null;
let initialAssetsPromise = null, startupPreparation = null;
let startupPrepared = false, startupWarmObjects = 0;
let renderer = null;
let postProcessor = null;
let scene = null;
let camera = null;
let portraitGroup = null;
let portraitMesh = null;
let portraitPoints = null;
let platforms = null;
let deepSpace = null;
let portraitBaseX = 0, portraitBaseY = 0;
let portraitMat = null;
const portraitRepulsion = createPortraitRepulsion(THREE);
let reliefMat = null;
let portraitLightsGroup = null;
let reliefLightsGroup = null;

let shardBaseDepth = null;
let vertexBaseZOffset = null;

// Stable per-quad GPU motion. No vertex buffers are rewritten by the animation loop.
const motionUniforms = {
  uMotionTime: { value: 0 },
  uMotionAmount: { value: 0 },
  uMotionAssembly: { value: 1 },
  uMotionPointer: { value: state.pointerLocal },
  uMotionStrength: { value: 0 },
  uHoverGain: { value: 2.6 },
  uStoryActive: { value: 0 },
  uStoryBirth: { value: 1 },
  uStoryGather: { value: 1 },
  uStoryRelease: { value: 0 },
  uStoryOutflow: { value: 0 },
  uStoryReduced: { value: 0 },
  uNebulaAxis: { value: new THREE.Vector2(.86,-.51) },
  uPortraitScale: { value: 1 },
  uCloudScale: { value: 1 },
  uCloudOffset: { value: 0 }
};
const postFrameOptions = {
  mouseUV: state.mouseUV,
  rippleStrength: 0,
  time: 0,
  mode: state.mode
};

function getStoryStats() {
  const phase = state.storyProgress === null
    ? { ...evaluateNebulosa(0.6), progress: null, phase: 'free' }
    : evaluateNebulosa(state.storyProgress);
  return { ...phase, active: state.storyProgress !== null, ready: state.status === 'ready',
    anchors: platforms?.anchors() ?? { kick: null, twitch: null } };
}

function updateMotionButton() {
  dom.motionBtn.disabled = state.reducedMotion || state.mode !== 'portrait';
  dom.motionBtn.textContent = state.motionPaused ? 'Animar' : 'Pausar';
  dom.motionBtn.setAttribute('aria-pressed', String(state.motionPaused));
  dom.motionBtn.setAttribute('aria-label', state.motionPaused ? 'Reanudar animación' : 'Pausar animación');
}

function initThree() {
  try {
    renderer = new THREE.WebGLRenderer({
      canvas: dom.canvas,
      antialias: true,
      powerPreference: 'high-performance',
      alpha: false,
      preserveDrawingBuffer: true
    });
  } catch (err) {
    state.error = `WebGL no disponible: ${err.message || err}`;
    setStatusUI('error', 'WebGL no disponible', state.error, false);
    return false;
  }

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(dpr);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x000000, 1);
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);

  camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 20);
  camera.position.set(0, 0, 5.0);
  camera.lookAt(0, 0, 0);
  deepSpace = createDeepSpace({ THREE, scene, camera, renderer });

  portraitGroup = new THREE.Group();
  scene.add(portraitGroup);

  // Iluminación contenida para evitar sobreexposición y potenciar la respuesta direccional de las facetas
  portraitLightsGroup = new THREE.Group();
  const ambientPortrait = new THREE.AmbientLight(0x8e72d6, 0.18);
  portraitLightsGroup.add(ambientPortrait);

  const pointConfigs = [
    // Acento violeta/lila lateral derecho (mejilla derecha y mechón adyacente, como en Lucy)
    { color: 0x9b5cff, intensity: 3.4, distance: 3.2, decay: 2.2, pos: [0.38, -0.06, 0.58] },
    { color: 0xe2c4ff, intensity: 2.1, distance: 2.4, decay: 2.3, pos: [0.28, -0.02, 0.52] },
    // Luz frontal suave para destellos especulares en puente/punta nasal, pómulos y labios
    { color: 0x6218ff, intensity: 2.6, distance: 4.2, decay: 2.2, pos: [-0.04, 0.14, 0.85] },
    // Luces rasantes violetas #520bff para volumen escultórico de los mechones de pelo
    { color: 0x520bff, intensity: 3.2, distance: 4.5, decay: 2.3, pos: [-0.62, 0.24, 0.55] },
    { color: 0x520bff, intensity: 2.8, distance: 4.5, decay: 2.3, pos: [0.06, 0.88, 0.52] },
    { color: 0x520bff, intensity: 2.4, distance: 4.2, decay: 2.4, pos: [0.66, -0.56, 0.48] }
  ];
  for (const cfg of pointConfigs) {
    const pl = new THREE.PointLight(cfg.color, cfg.intensity, cfg.distance, cfg.decay);
    pl.position.set(cfg.pos[0], cfg.pos[1], cfg.pos[2]);
    portraitLightsGroup.add(pl);
  }
  scene.add(portraitLightsGroup);

  reliefLightsGroup = new THREE.Group();
  reliefLightsGroup.visible = false;
  const reliefAmb = new THREE.AmbientLight(0x8890a4, 0.42);
  const reliefKey = new THREE.DirectionalLight(0xf6f2ec, 1.55);
  reliefKey.position.set(-1.2, 1.3, 1.6);
  const reliefFill = new THREE.DirectionalLight(0x7c96c8, 0.65);
  reliefFill.position.set(1.4, -0.6, 1.1);
  const reliefRim = new THREE.DirectionalLight(0xd8c8ff, 0.55);
  reliefRim.position.set(0.0, 1.5, -1.0);
  reliefLightsGroup.add(reliefAmb, reliefKey, reliefFill, reliefRim);
  scene.add(reliefLightsGroup);

  postProcessor = new PortraitPostProcessor(
    renderer,
    Math.round(window.innerWidth * dpr),
    Math.round(window.innerHeight * dpr)
  );

  updateCameraFrustum();
  return true;
}

function updateCameraFrustum() {
  if (!camera) return;
  const w = window.innerWidth;
  const h = Math.max(1, window.innerHeight);
  const aspect = w / h;
  const viewHalfH = 1.08;
  let halfH = viewHalfH;
  let halfW = viewHalfH * aspect;
  if (halfW < 1.08) {
    halfW = 1.08;
    halfH = halfW / aspect;
  }
  portraitBaseY = 0;
  let cloudOriginY = 0;
  const belowPortrait = state.mode === 'portrait' && w < 900 && h >= w * 0.9;
  if (belowPortrait) {
    const portraitPixels = Math.min(w * 0.90, h * 0.58);
    halfH = h / portraitPixels;
    halfW = halfH * aspect;
    const top = Math.max(82, Math.min(110, h * 0.12));
    cloudOriginY = (h * 0.5 - top - portraitPixels * 0.5) * 2 * halfH / h;
  }
  const portraitScale = portraitScaleForWidth(w);
  // Center this photograph's visible light mass, keeping its sampled geometry intact.
  portraitBaseX = state.mode === 'portrait' ? -.18 * portraitScale : 0;
  portraitBaseY = state.mode === 'portrait' ? .067 * portraitScale : 0;
  portraitGroup.scale.setScalar(portraitScale);
  motionUniforms.uPortraitScale.value = portraitScale;
  camera.left = -halfW;
  camera.right = halfW;
  camera.top = halfH;
  camera.bottom = -halfH;
  camera.updateProjectionMatrix();
  const nebulaBlend = clamp((aspect - 0.5) / 0.7, 0, 1);
  motionUniforms.uNebulaAxis.value.set(0.48 + 0.38 * nebulaBlend, -0.88 + 0.37 * nebulaBlend).normalize();
  motionUniforms.uCloudScale.value = halfH / 1.08;
  motionUniforms.uCloudOffset.value = -cloudOriginY;
  platforms?.layout({ width: w, height: h, camera, belowPortrait, portraitBaseY });
  deepSpace?.resize(w, h);
  portraitPoints?.resize(w, h);

  if (loadedAssets) {
    renderComparisonCanvas();
  }
}

// Intenta cargar el activo semántico de peso capilar preparado por Astra si está disponible en ./assets/
async function tryLoadSemanticHairAsset(_meta, width, height) {
  const source = ASSETS.hairUrl;
  const response = await fetch(source);
  if (!response.ok) throw new Error('No se pudo cargar la máscara del cabello');
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength !== width * height * 4) throw new Error('La máscara del cabello no coincide con la fotografía');
  const weights = new Float32Array(buffer);
  for (const value of weights) {
    if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error('La máscara del cabello contiene valores inválidos');
  }
  return {weights, source};
}
function analyzePortraitFields(rgbaData, depthArray, externalHairWeights, width, height) {
  const n = width * height;
  const normAlpha = new Float32Array(n);
  const rawLum = new Float32Array(n);
  const yellowChroma = new Float32Array(n);
  const redGreenDiff = new Float32Array(n);
  const satField = new Float32Array(n);

  // Nota: los píxeles sólidos en amy-rgba.png tienen alpha=254; normalizamos sobre 254.0 sin exigir ===255
  for (let i = 0; i < n; i++) {
    const aRaw = rgbaData[i * 4 + 3];
    const a = clamp(aRaw / 254.0, 0, 1);
    normAlpha[i] = a;
    if (a <= 0.005) continue;

    const r = rgbaData[i * 4 + 0] / 255.0;
    const g = rgbaData[i * 4 + 1] / 255.0;
    const b = rgbaData[i * 4 + 2] / 255.0;

    rawLum[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b;

    const maxC = Math.max(r, g, b);
    const minC = Math.min(r, g, b);
    satField[i] = maxC > 1e-4 ? (maxC - minC) / maxC : 0;

    yellowChroma[i] = Math.max(0, g - b);
    redGreenDiff[i] = Math.max(0, r - g);
  }

  // Soporte de borde para limpiar el halo grisáceo exterior sin perder hebras
  const alphaSolid = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    alphaSolid[i] = normAlpha[i] > 0.35 ? 1.0 : 0.0;
  }
  const edgeSupport = blurFieldAlphaWeighted(alphaSolid, new Float32Array(n).fill(1), width, height, 4);

  const cleanAlpha = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let a = normAlpha[i];
    if (a <= 0.02) {
      cleanAlpha[i] = 0;
      continue;
    }
    const nearOuterEdge = 1.0 - edgeSupport[i];
    if (nearOuterEdge > 0.15 && satField[i] < 0.20 && rawLum[i] > 0.52) {
      const lowSatFactor = 1.0 - smoothstep(0.08, 0.20, satField[i]);
      const highLumFactor = smoothstep(0.48, 0.72, rawLum[i]);
      a *= Math.max(0, 1.0 - lowSatFactor * highLumFactor * 0.92);
    }
    cleanAlpha[i] = a;
  }

  // Profundidad suavizada ponderada por alfa
  const foregroundWeight = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    foregroundWeight[i] = cleanAlpha[i] > 0.45 ? cleanAlpha[i] : cleanAlpha[i] * 0.08;
  }
  const depthSmoothFine = blurFieldAlphaWeighted(depthArray, foregroundWeight, width, height, 3);
  const depthSmoothMid = blurFieldAlphaWeighted(depthSmoothFine, foregroundWeight, width, height, 8);

  const cleanDepth = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if (cleanAlpha[i] <= 0.01) {
      cleanDepth[i] = 0;
    } else if (cleanAlpha[i] < 0.65) {
      cleanDepth[i] = Math.max(depthSmoothFine[i], depthSmoothMid[i]);
    } else {
      cleanDepth[i] = 0.65 * depthSmoothFine[i] + 0.35 * depthSmoothMid[i];
    }
  }

  // Descomposición multiescala de luminancia
  const lumFine = blurFieldAlphaWeighted(rawLum, cleanAlpha, width, height, 2);
  const lumMid = blurFieldAlphaWeighted(rawLum, cleanAlpha, width, height, 8);
  const lumBroad = blurFieldAlphaWeighted(rawLum, cleanAlpha, width, height, 22);

  // Peso de cabello: usa el activo semántico de Astra si está presente; si aún no está en disco,
  // usa un clasificador cromático/direccional corregido como respaldo provisional.
  let hairWeight;
  if (externalHairWeights) {
    hairWeight = blurFieldAlphaWeighted(externalHairWeights, cleanAlpha, width, height, 3);
  } else {
    const rawHairScore = new Float32Array(n);
    for (let y = 0; y < height; y++) {
      const vNorm = y / height;
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        if (cleanAlpha[i] <= 0.02) continue;
        const gb = yellowChroma[i];
        const rg = redGreenDiff[i];
        // En el pelo rubio de AMY, (G-B) supera claramente a (R-G); en piel y labios, (R-G) es proporcionalmente mayor
        const yellowDominance = gb / (gb + rg + 0.012);
        const strandEnergy = Math.abs(rawLum[i] - lumFine[i]) + Math.abs(lumFine[i] - lumMid[i]) * 0.7;

        let hScore = smoothstep(0.47, 0.62, yellowDominance) * smoothstep(0.06, 0.16, gb);
        if (strandEnergy > 0.022 && yellowDominance > 0.43) {
          hScore = Math.max(hScore, smoothstep(0.41, 0.56, yellowDominance) * 0.9);
        }
        // Excluir labios (fuerte exceso rojo R-G frente a G-B)
        if (rg > gb * 0.92 && rg > 0.14) {
          hScore = 0.0;
        }
        // Excluir camiseta oscura inferior izquierda
        if (vNorm > 0.78 && rawLum[i] < 0.18 && satField[i] < 0.25) {
          hScore = 0.0;
        }
        rawHairScore[i] = clamp(hScore, 0, 1);
      }
    }
    hairWeight = blurFieldAlphaWeighted(rawHairScore, cleanAlpha, width, height, 8);
  }

  // Gradientes espaciales para orientación 3D de facetas
  const gradDepthX = new Float32Array(n);
  const gradDepthY = new Float32Array(n);
  const gradLumX = new Float32Array(n);
  const gradLumY = new Float32Array(n);

  for (let y = 1; y < height - 1; y++) {
    const row = y * width;
    for (let x = 1; x < width - 1; x++) {
      const i = row + x;
      if (cleanAlpha[i] <= 0.02) continue;
      gradDepthX[i] = (cleanDepth[i + 1] - cleanDepth[i - 1]) * 0.5;
      gradDepthY[i] = (cleanDepth[i - width] - cleanDepth[i + width]) * 0.5;
      gradLumX[i] = (lumFine[i + 1] - lumFine[i - 1]) * 0.5;
      gradLumY[i] = (lumFine[i - width] - lumFine[i + width]) * 0.5;
    }
  }

  // Calibración tonal contenida (base lavanda oscura + picos blancos dispersos como Lucy, sin sobreexposición)
  const targetLum = new Float32Array(n);
  const samplingLum = new Float32Array(n);
  const glintBoost = new Float32Array(n);
  const lowerFadeField = new Float32Array(n);

  const faceSamples = [];
  const hairSamples = [];

  for (let y = 0; y < height; y++) {
    const vNorm = y / height;
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const a = cleanAlpha[i];
      if (a <= 0.02) continue;

      const L = rawLum[i];
      const dFine = L - lumFine[i];
      const dMid = lumFine[i] - lumMid[i];
      const dBroad = lumMid[i] - lumBroad[i];

      // 1. Curva facial continua: las sombras locales no deben borrar piel alrededor de los rasgos.
      // El límite suave conserva el contraste fino y los negros que ya existen en la fotografía.
      const localContrast = dFine * 1.5 + dMid * 2.3 + dBroad * 1.65;
      // Mantener la distribución original de centros al corregir sólo el tono visible.
      let samplingFaceL = clamp(L * 0.76 + localContrast - 0.04, 0.0, 1.0);
      if (localContrast < -0.012 || L < 0.30) {
        samplingFaceL = Math.pow(clamp(samplingFaceL * 0.72, 0, 1), 2.05) * 0.75;
      } else {
        samplingFaceL = Math.pow(clamp(samplingFaceL, 0, 1), 1.28) * 0.78;
      }
      const boundedContrast = localContrast < 0
        ? localContrast / (1.0 - localContrast / 0.06)
        : localContrast;
      let faceL = clamp(L * 0.76 + boundedContrast - 0.04, 0.0, 1.0);
      faceL = Math.pow(faceL, 1.28) * 0.78;

      // 2. Tono capilar oscuro lavanda (medido en Lucy: pelo p95 = 54/255 ≈ 0.212)
      const strandWave = dBroad * 1.45 + dMid * 2.1 + dFine * 1.6;
      let hairL = 0.038 + 0.082 * smoothstep(0.30, 0.88, L) + strandWave * 0.88;
      if (strandWave < -0.008) {
        hairL *= 0.20 + 0.80 * smoothstep(-0.10, -0.008, strandWave);
      }
      hairL = clamp(hairL, 0.008, 0.26);

      const hw = hairWeight[i];
      let combinedL = faceL * (1.0 - hw) + hairL * hw;
      let samplingCombinedL = samplingFaceL * (1.0 - hw) + hairL * hw;

      // Atenuación suave en la camiseta negra inferior izquierda y en el borde inferior (sin corte abrupto)
      const bottomEdgeSoft = 1.0 - smoothstep(0.955, 0.998, vNorm);
      let garmentFactor = 1.0;
      if (vNorm > 0.78) {
        const darkPixel = 1.0 - smoothstep(0.08, 0.22, L);
        const lowSat = 1.0 - smoothstep(0.06, 0.22, satField[i]);
        const isDarkShirt = darkPixel * lowSat * smoothstep(0.78, 0.88, vNorm);
        garmentFactor = mix(1.0, 0.28, isDarkShirt);
      }
      const fade = bottomEdgeSoft * garmentFactor;
      lowerFadeField[i] = fade;

      combinedL *= fade * smoothstep(0.02, 0.30, a);
      targetLum[i] = clamp(combinedL, 0, 1);
      samplingCombinedL *= fade * smoothstep(0.02, 0.30, a);
      samplingLum[i] = clamp(samplingCombinedL, 0, 1);

      // Mapa de probabilidad para motas blancas brillantes dispersas (puente/punta de nariz, pómulos, frente, labio, ojos y hebras clave)
      const facePeak = (1.0 - hw) * smoothstep(0.32, 0.66, faceL) * smoothstep(-0.004, 0.038, dMid + dFine);
      const hairPeak = hw * smoothstep(0.016, 0.065, strandWave) * smoothstep(0.55, 0.86, L);
      glintBoost[i] = clamp(facePeak + hairPeak * 0.45, 0, 1);

      if (a > 0.5 && vNorm < 0.88) {
        if (hw < 0.3) faceSamples.push(targetLum[i] * 255);
        if (hw > 0.6) hairSamples.push(targetLum[i] * 255);
      }
    }
  }

  state.luminanceStats = {
    faceP50: Math.round(computePercentile(faceSamples, 0.5) * 10) / 10,
    faceP95: Math.round(computePercentile(faceSamples, 0.95) * 10) / 10,
    hairP50: Math.round(computePercentile(hairSamples, 0.5) * 10) / 10,
    hairP95: Math.round(computePercentile(hairSamples, 0.95) * 10) / 10
  };

  return {
    cleanAlpha,
    cleanDepth,
    rawLum,
    targetLum,
    samplingLum,
    hairWeight,
    glintBoost,
    lowerFadeField,
    gradDepthX,
    gradDepthY,
    gradLumX,
    gradLumY
  };
}

function buildParticleGeometry(fields, width, height, targetQuads, rgbaData) {
  const rand = createPRNG(DEFAULTS.seed);
  const nPixels = width * height;
  const {
    cleanAlpha,
    cleanDepth,
    targetLum,
    samplingLum,
    hairWeight,
    glintBoost,
    lowerFadeField,
    gradDepthX,
    gradDepthY,
    gradLumX,
    gradLumY
  } = fields;

  const weights = new Float32Array(nPixels);
  let totalWeight = 0;
  for (let i = 0; i < nPixels; i++) {
    const a = cleanAlpha[i];
    if (a < 0.05) continue;
    const lum = samplingLum[i];
    const hw = hairWeight[i];
    const fade = lowerFadeField[i];
    if (fade < 0.02) continue;

    // Mayor contraste de huecos negros en sombras faciales y valles de pelo
    const lumWeight = 0.22 + 0.78 * smoothstep(0.012, 0.20, lum);
    const regionWeight = mix(1.08, 0.94, hw);
    const w = a * fade * lumWeight * regionWeight;
    if (w > 0.008) {
      weights[i] = w;
      totalWeight += w;
    }
  }

  const chosenPixels = new Int32Array(targetQuads);
  const step = totalWeight / targetQuads;
  let cursor = rand() * step;
  let acc = 0;
  let pIdx = 0;

  for (let q = 0; q < targetQuads; q++) {
    const target = cursor + q * step;
    while (pIdx < nPixels - 1 && acc + weights[pIdx] < target) {
      acc += weights[pIdx];
      pIdx++;
    }
    chosenPixels[q] = pIdx;
  }

  const numVertices = targetQuads * 4;
  const numIndices = targetQuads * 6;
  const positions = new Float32Array(numVertices * 3);
  const colors = new Float32Array(numVertices * 3);
  const photoChromas = new Float32Array(numVertices * 3);
  const uvs = new Float32Array(numVertices * 2);
  const motionData = new Float32Array(numVertices * 4);
  const cloudData = new Float32Array(numVertices * 4);
  // Independent random stream: never alters the photograph's target sampling or colors.
  const cloudRand = createPRNG(DEFAULTS.seed ^ 0x4e454255);
  const indices = new Uint32Array(numIndices);

  shardBaseDepth = new Float32Array(targetQuads);
  vertexBaseZOffset = new Float32Array(numVertices);

  const invHalfH = 2.0 / height;
  const portraitWidth = 2.0 * (width / height);
  const zAmplitude = state.depthScale * portraitWidth;
  const depthCenter = 0.56;

  // Calibración medida de Lucy (checks/amy-root/lucy-facet-size.json):
  // mediana de arista = 0.00244148 en cabeza (~1.0px) y 0.003296 en cabello (~1.3px)
  const baseFaceEdge = 0.00235;
  const baseHairEdge = 0.00315;

  let faceCount = 0;
  let hairCount = 0;

  for (let q = 0; q < targetQuads; q++) {
    const pix = chosenPixels[q];
    writePhotoChroma(rgbaData, pix, photoChromas, q * 12);
    const py = Math.floor(pix / width);
    const px = pix - py * width;

    const hw = hairWeight[pix];
    if (hw >= 0.5) hairCount++;
    else faceCount++;

    const lum = targetLum[pix];
    const glint = glintBoost[pix];
    const dVal = cleanDepth[pix];

    const jx = (rand() - 0.5) * 1.55;
    const jy = (rand() - 0.5) * 1.55;
    const fx = clamp(px + jx, 0, width - 1);
    const fy = clamp(py + jy, 0, height - 1);

    const cx = (fx - width * 0.5) * invHalfH;
    const cy = (height * 0.5 - fy) * invHalfH;
    const u = fx / width;
    const v = 1.0 - fy / height;

    // Distribución bimodal estilo Lucy: base lavanda oscura granular + motas blancas brillantes dispersas (glints)
    const rRoll = rand();
    const glintProb = mix(0.025 + glint * 0.16, 0.008 + glint * 0.07, hw);
    const isBrightGlint = rRoll < glintProb;
    const isMidGrain = !isBrightGlint && rRoll < (glintProb + mix(0.24, 0.18, hw));

    let edgeSize = mix(baseFaceEdge, baseHairEdge, hw) * (0.62 + rand() * 0.62);
    edgeSize *= 0.65 + 0.45 * smoothstep(0.02, 0.40, lum);
    if (isBrightGlint) {
      edgeSize *= mix(1.32, 1.15, hw);
    }

    // Radio contenido para dejar espacio negro #000000 visible entre fragmentos individuales
    const halfSize = edgeSize * 0.40 * (state.fragmentScale || 1);
    const aspect = 0.58 + rand() * 0.85;
    const angle = rand() * Math.PI * 2;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);

    const gdx = gradDepthX[pix] * 48.0 + gradLumX[pix] * hw * 22.0;
    const gdy = gradDepthY[pix] * 48.0 + gradLumY[pix] * hw * 22.0;
    const tiltSpread = mix(0.46, 0.68, hw);
    const nxRaw = -gdx + (rand() - 0.5) * tiltSpread;
    const nyRaw = -gdy + (rand() - 0.5) * tiltSpread;
    const nzRaw = 1.0;
    const invN = 1.0 / Math.hypot(nxRaw, nyRaw, nzRaw);
    const nx = nxRaw * invN;
    const ny = nyRaw * invN;

    const relDepth = (dVal - depthCenter) + (rand() - 0.5) * 0.008;
    shardBaseDepth[q] = relDepth;
    const cz = relDepth * zAmplitude;

    const c0 = halfSize * (0.72 + rand() * 0.48);
    const c1 = halfSize * aspect * (0.72 + rand() * 0.48);
    const c2 = halfSize * (0.72 + rand() * 0.48);
    const c3 = halfSize * aspect * (0.72 + rand() * 0.48);
    const foldZ = (rand() - 0.5) * halfSize * 0.52;

    const localCorners = [
      [-c0 * cosA, -c0 * sinA, foldZ],
      [c1 * sinA, -c1 * cosA, -foldZ],
      [c2 * cosA, c2 * sinA, foldZ],
      [-c3 * sinA, c3 * cosA, -foldZ]
    ];

    // Luminancia del fragmento: la mayoría se mantiene en lavanda media/oscura; solo los glints brillan en blanco-lila
    let shardLum;
    if (isBrightGlint) {
      shardLum = clamp(lum * mix(1.85, 1.55, hw) + mix(0.34, 0.18, hw), 0, 1.0);
    } else if (isMidGrain) {
      shardLum = clamp(lum * 1.12 + 0.02, 0, 0.68);
    } else {
      shardLum = clamp(lum * (0.45 + rand() * 0.48), 0, 0.48);
    }

    const whiteness = isBrightGlint
      ? smoothstep(0.38, 0.85, shardLum) * mix(0.95, 0.72, hw)
      : smoothstep(0.42, 0.75, shardLum) * 0.35;

    // Tinte base lavanda-violeta (#5d4b8a) que vira a blanco-lila (#f6eeff) únicamente en las motas brillantes
    const tintR = mix(0.46, 0.98, whiteness);
    const tintG = mix(0.36, 0.95, whiteness);
    const tintB = mix(0.76, 1.00, whiteness);

    const energy = Math.pow(clamp(shardLum, 0, 1), 1.12) * (isBrightGlint ? 1.55 : 0.88);
    const cr = tintR * energy;
    const cg = tintG * energy;
    const cb = tintB * energy;

    const vBase = q * 4;
    const arm = (cloudRand() - 0.5) * Math.PI * 3.4;
    const branch = cloudRand() < 0.62 ? 0 : 1;
    const radius = 0.15 + cloudRand() * 0.7;
    const gx = cloudRand() + cloudRand() + cloudRand() + cloudRand() - 2;
    const gy = cloudRand() + cloudRand() + cloudRand() + cloudRand() - 2;
    const gz = cloudRand() + cloudRand() + cloudRand() + cloudRand() - 2;
    const cloudX = Math.sin(arm) * (0.65 + radius * 0.45) + gx * 0.32 + (branch ? 0.35 : -0.2);
    const cloudY = Math.cos(arm * 0.73) * 0.42 + gy * 0.30 + (branch ? 0.2 : -0.12);
    const cloudZ = Math.sin(arm * 0.83 + branch * 1.7) * 0.75 + gz * 0.38;
    const structuredCloud = sampleCloud(q);
    for (let k = 0; k < 4; k++) {
      const lx = localCorners[k][0];
      const ly = localCorners[k][1];
      const lz = localCorners[k][2] - (lx * nx + ly * ny);

      const vIdx = vBase + k;
      positions[vIdx * 3 + 0] = cx + lx;
      positions[vIdx * 3 + 1] = cy + ly;
      positions[vIdx * 3 + 2] = cz + lz;
      vertexBaseZOffset[vIdx] = lz;

      const cornerShade = k === 1 ? 1.07 : k === 3 ? 0.93 : 1.0;
      colors[vIdx * 3 + 0] = cr * cornerShade;
      colors[vIdx * 3 + 1] = cg * cornerShade;
      colors[vIdx * 3 + 2] = cb * cornerShade;

      uvs[vIdx * 2 + 0] = u;
      uvs[vIdx * 2 + 1] = v;
      motionData[vIdx * 4 + 0] = cx;
      motionData[vIdx * 4 + 1] = cy;
      motionData[vIdx * 4 + 2] = (Math.imul(q + 1, 2654435761) >>> 0) / 4294967296;
      motionData[vIdx * 4 + 3] = hw;
      cloudData[vIdx * 4 + 0] = structuredCloud[0];
      cloudData[vIdx * 4 + 1] = structuredCloud[1];
      cloudData[vIdx * 4 + 2] = structuredCloud[2];
      cloudData[vIdx * 4 + 3] = cz;
    }

    const iBase = q * 6;
    indices[iBase + 0] = vBase + 0;
    indices[iBase + 1] = vBase + 1;
    indices[iBase + 2] = vBase + 2;
    indices[iBase + 3] = vBase + 0;
    indices[iBase + 4] = vBase + 2;
    indices[iBase + 5] = vBase + 3;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('aPhotoChroma', new THREE.BufferAttribute(photoChromas, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setAttribute('aMotion', new THREE.BufferAttribute(motionData, 4));
  geometry.setAttribute('aCloud', new THREE.BufferAttribute(cloudData, 4));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));

  state.quadCount = targetQuads;
  state.vertexCount = numVertices;
  state.triangleCount = targetQuads * 2;
  state.faceQuadCount = faceCount;
  state.hairQuadCount = hairCount;

  return geometry;
}

function createMaterials() {
  portraitMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xe6c8ff,
    emissiveIntensity: 0.42,
    roughness: 0.38,
    metalness: 0.04,
    flatShading: true,
    vertexColors: true,
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
    forceSinglePass: true
  });

  portraitMat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, motionUniforms);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `
      #include <common>
      attribute vec4 aMotion;
      attribute vec4 aCloud;
      uniform float uMotionTime;
      uniform float uMotionAmount;
      uniform float uMotionAssembly;
      uniform vec2 uMotionPointer;
      uniform float uMotionStrength;
      uniform float uHoverGain;
      uniform float uStoryActive;
      uniform float uStoryBirth;
      uniform float uStoryGather;
      uniform float uStoryRelease;
      uniform float uStoryOutflow;
      uniform float uStoryReduced;
      uniform vec2 uNebulaAxis;
      uniform float uCloudScale,uCloudOffset,uPortraitScale;
      varying float vMotionLight;
      varying float vParticleVisibility;
      varying float vParticleSeed;
      varying float vNebulaForm;
      varying vec3 vNebulaDust;
      ${cloudMappingGLSL}
    `).replace('#include <begin_vertex>', `
      #include <begin_vertex>
      vec2 center = aMotion.xy;
      float seed = aMotion.z;
      vParticleSeed = seed;
      vParticleVisibility = 1.0;
      vNebulaForm = 1.0;
      vNebulaDust = nebulaDustColor(seed, aCloud.x * 1.35 + aCloud.z * 0.42);
      float hair = aMotion.w;
      float phase = seed * 6.2831853;
      // Cursor displacement is a separate bounded radial field, applied after story motion.
      vec3 drift = vec3(0.0);
      float breath = sin(uMotionTime * 0.85 + center.y * 2.5 + center.x * 1.7);
      drift.xy += vec2(sin(uMotionTime * 0.68 + center.y * 3.0), breath)
        * mix(0.0007, 0.0025, hair);
      drift.z += breath * mix(0.0015, 0.004, hair);
      float assembling = pow(1.0 - uMotionAssembly, 2.0);
      drift.xy += vec2(sin(phase * 3.1), cos(phase * 2.7))
        * (0.035 + 0.025 * hair) * assembling;
      drift.z += (0.10 + seed * 0.08) * assembling;
      transformed += drift * uMotionAmount;
      float sparkle = pow(max(0.0, sin(uMotionTime * 1.8 + phase + center.y * 3.0)), 24.0);
      float sweep = pow(0.5 + 0.5 * sin(center.y * 4.2 + center.x * 2.0 - uMotionTime * 0.65), 16.0);
      vMotionLight = 1.0 + uMotionAmount * (sparkle * mix(0.04, 0.12, hair)
        + sweep * 0.08);
      vMotionLight *= mix(1.0, mix(0.45, 1.0, uMotionAssembly), uMotionAmount);
      if (uStoryActive > 0.5) {
        float visibility = uStoryBirth * (1.0 - uStoryOutflow);
        if (uStoryReduced > 0.5) {
          transformed = position;
          vMotionLight = 1.0;
          vParticleVisibility = visibility * uStoryGather * (1.0 - uStoryRelease);
        } else {
          float entryStagger = seed * 0.22;
          float exitStagger = fract(seed * 7.13 + 0.17) * 0.18;
          float gather = smoothstep(entryStagger, 0.78 + entryStagger, uStoryGather);
          float disperse = smoothstep(exitStagger, 0.82 + exitStagger, uStoryRelease);
          float localFormed = gather * (1.0 - disperse);
          vNebulaForm = localFormed;
          vec3 target = vec3(aMotion.xy, aCloud.w);
          vec3 cloud = nebulaCloud(aCloud.xyz, uNebulaAxis) * mix(0.28, 1.0, uStoryBirth);
          cloud.xy *= uCloudScale;
          cloud.y += uCloudOffset;
          // Broad, depth-varying lobes are independent of the photograph's silhouette.
          cloud += vec3(sin(uMotionTime * 0.31 + cloud.z * 2.1) * 0.055,
            cos(uMotionTime * 0.27 + cloud.x * 2.4) * 0.045,
            sin(uMotionTime * 0.23 + cloud.y * 2.3) * 0.070);
          // Preserve the original world cloud while the photo group is smaller/centered.
          cloud.y -= uCloudOffset;
          cloud /= uPortraitScale;
          vec3 entryPath = nebulaTransit(cloud, target, gather, seed, 1.0);
          vec3 exitCloud = cloud;
          vec3 storyCenter = nebulaTransit(entryPath, exitCloud, disperse, seed, -0.75);
          float sweepRight = uStoryOutflow;
          storyCenter.x += sweepRight * 5.2 / uPortraitScale;
          storyCenter.y += sin(sweepRight * 3.14159265) * 0.14 / uPortraitScale;
          transformed = storyCenter + (position - target) * mix(0.34 / uPortraitScale, 1.0, localFormed)
            + drift * uMotionAmount * localFormed;
          if (gather >= 1.0 && disperse <= 0.0) transformed = position + drift * uMotionAmount;
          vMotionLight = (1.0 + (vMotionLight - 1.0) * localFormed)
            * mix(1.10, 1.0, localFormed);
          vParticleVisibility = visibility * mix(0.24, 1.0, localFormed);
        }
      }
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `
      #include <common>
      varying float vMotionLight;
      varying float vParticleVisibility;
      varying float vParticleSeed;
      varying float vNebulaForm;
      varying vec3 vNebulaDust;
    `).replace('#include <opaque_fragment>', `
      if (vParticleVisibility <= 0.0 || vParticleSeed >= vParticleVisibility) discard;
      outgoingLight *= vMotionLight;
      #include <opaque_fragment>
    `);
    shader.fragmentShader = shader.fragmentShader.replace(
      'vec3 totalEmissiveRadiance = emissive;',
      'vec3 totalEmissiveRadiance = emissive * vColor.rgb;'
    );
    attachPhotoAppearance(shader);
    shader.fragmentShader = shader.fragmentShader.replace('outgoingLight *= vMotionLight;', `
      outgoingLight = mix(vNebulaDust * (0.25 + vParticleSeed * 1.9), outgoingLight, vNebulaForm);
      outgoingLight *= vMotionLight;
    `);
    attachPortraitSoftness(shader);
    portraitRepulsion.attach(shader);
  };
  portraitMat.customProgramCacheKey = () => 'amy-photo-soft-grain-broad-repulsion-v2';

  reliefMat = new THREE.MeshStandardMaterial({
    color: 0xc4cad8,
    emissive: 0x0b0e17,
    emissiveIntensity: 0.25,
    roughness: 0.42,
    metalness: 0.08,
    flatShading: true,
    vertexColors: false,
    side: THREE.DoubleSide
  });
}

function rebuildMesh(targetQuads) {
  if (!loadedAssets) return;
  portraitPoints?.dispose();
  if (portraitMesh) {
    portraitGroup.remove(portraitMesh);
    portraitMesh.geometry.dispose();
    portraitMesh = null;
  }
  // Reuse warm A's exact tonal sampling, then render independent GPU points.
  loadedAssets.fields ||= analyzePortraitFields(loadedAssets.rgbaData,
    loadedAssets.depthArray, loadedAssets.semanticHairWeights,
    loadedAssets.width, loadedAssets.height);
  const geo = buildParticleGeometry(loadedAssets.fields, loadedAssets.width,
    loadedAssets.height, targetQuads, loadedAssets.rgbaData);
  if (state.mode !== 'portrait') {
    if (!portraitMat) createMaterials();
    addPortraitGrainUV(THREE, geo);
    portraitMesh = new THREE.Mesh(geo, state.mode === 'relief' ? reliefMat : portraitMat);
    portraitGroup.add(portraitMesh);
  }
  try {
    portraitPoints = createPortraitPoints({THREE, sourceGeometry: geo,
      baseDepth: shardBaseDepth, portraitWidth: 2 * loadedAssets.width / loadedAssets.height,
      group: portraitGroup, motionUniforms,
      photoUniforms: photoAppearanceUniforms, camera, renderer,
      yellowSource: deepSpace.getYellowMorphSource()});
  } finally {
    // Point attributes own their buffers; no facet mesh is retained in portrait mode.
    if (state.mode === 'portrait') geo.dispose();
  }
  portraitPoints.resize(window.innerWidth, Math.max(1, window.innerHeight));
  const motion = portraitPoints.points.geometry.getAttribute('aMotion');
  let hair = 0;
  for (let i = 0; i < motion.count; i++) if (motion.array[i * 4 + 3] >= .5) hair++;
  state.photoPointCounts = {face: motion.count - hair, hair};
}

function updateDepthPositions(newDepthScale) {
  state.depthScale = clamp(Number(newDepthScale) || 0, 0, 0.30);
  dom.depthSlider.value = String(state.depthScale);
  dom.depthOutput.textContent = state.depthScale.toFixed(2);

  portraitPoints?.syncDepth(null, state.depthScale);
  if (!portraitMesh || !loadedAssets || !shardBaseDepth) return;
  const posAttr = portraitMesh.geometry.getAttribute('position');
  const cloudAttr = portraitMesh.geometry.getAttribute('aCloud');
  const posArr = posAttr.array;
  const portraitWidth = 2.0 * (loadedAssets.width / loadedAssets.height);
  const zAmplitude = state.depthScale * portraitWidth;
  const nQuads = state.quadCount;

  for (let q = 0; q < nQuads; q++) {
    const cz = shardBaseDepth[q] * zAmplitude;
    const vBase = q * 4;
    posArr[(vBase + 0) * 3 + 2] = cz + vertexBaseZOffset[vBase + 0];
    posArr[(vBase + 1) * 3 + 2] = cz + vertexBaseZOffset[vBase + 1];
    posArr[(vBase + 2) * 3 + 2] = cz + vertexBaseZOffset[vBase + 2];
    posArr[(vBase + 3) * 3 + 2] = cz + vertexBaseZOffset[vBase + 3];
    for (let k = 0; k < 4; k++) cloudAttr.array[(vBase + k) * 4 + 3] = cz;
  }
  posAttr.needsUpdate = true;
  cloudAttr.needsUpdate = true;
}

function renderComparisonCanvas() {
  if (!loadedAssets || !camera) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = window.innerWidth;
  const h = window.innerHeight;
  dom.photoCanvas.width = Math.round(w * dpr);
  dom.photoCanvas.height = Math.round(h * dpr);

  const ctx = dom.photoCanvas.getContext('2d');
  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, w, h);

  const portraitWidthWorld = 2.0 * (loadedAssets.width / loadedAssets.height);
  const portraitHeightWorld = 2.0;
  const frustumW = camera.right - camera.left;
  const frustumH = camera.top - camera.bottom;

  const drawW = (portraitWidthWorld / frustumW) * w * portraitGroup.scale.x;
  const drawH = (portraitHeightWorld / frustumH) * h * portraitGroup.scale.y;
  const drawX = (w - drawW) * 0.5;
  const drawY = (h - drawH) * 0.5;

  ctx.drawImage(loadedAssets.imageElement, drawX, drawY, drawW, drawH);
  ctx.restore();
}

function renderMiniComparisonCard() {
  if (!loadedAssets) return;
  const miniW = 240;
  const miniH = Math.round(miniW * (loadedAssets.height / loadedAssets.width));
  dom.photoMiniCanvas.width = miniW;
  dom.photoMiniCanvas.height = miniH;
  const ctx = dom.photoMiniCanvas.getContext('2d');
  ctx.fillStyle = '#050409';
  ctx.fillRect(0, 0, miniW, miniH);
  ctx.drawImage(loadedAssets.imageElement, 0, 0, miniW, miniH);
}

function updateSplitUI(percent) {
  const numericPercent = Number(percent);
  state.splitPercent = Number.isFinite(numericPercent) ? clamp(numericPercent, 0, 100) : 50;
  dom.splitSlider.value = String(Math.round(state.splitPercent));
  dom.splitOutput.textContent = `${Math.round(state.splitPercent)}%`;
  const rightInset = 100 - state.splitPercent;
  dom.comparisonClip.style.clipPath = `inset(0 ${rightInset}% 0 0)`;
  dom.comparisonDivider.style.left = `${state.splitPercent}%`;
}

function applyMode(mode) {
  const validModes = ['portrait', 'comparison', 'relief'];
  state.mode = validModes.includes(mode) ? mode : 'portrait';

  for (const btn of dom.modeBtns) {
    btn.classList.toggle('active', btn.dataset.mode === state.mode);
    btn.setAttribute('aria-pressed', String(btn.dataset.mode === state.mode));
  }

  const isComparison = state.mode === 'comparison';
  const isRelief = state.mode === 'relief';
  if (state.mode !== 'portrait' && loadedAssets && !portraitMesh) rebuildMesh(state.targetQuads);

  dom.comparisonLayer.classList.toggle('hidden', !isComparison);
  dom.comparisonLayer.setAttribute('aria-hidden', String(!isComparison));
  dom.splitControlRow.hidden = !isComparison;
  updateMotionButton();
  updateCameraFrustum();

  if (portraitLightsGroup && reliefLightsGroup) {
    portraitLightsGroup.visible = !isRelief;
    reliefLightsGroup.visible = isRelief;
  }
  if (portraitMesh && portraitMat && reliefMat) {
    portraitMesh.material = isRelief ? reliefMat : portraitMat;
    if (state.mode === 'portrait') portraitGroup.remove(portraitMesh);
    else portraitGroup.add(portraitMesh);
  }
  if (isComparison) {
    applyPoseImmediate(0, 0);
    state.targetYawDeg = 0;
    state.targetPitchDeg = 0;
    state.rippleStrength = 0;
    state.pointerStrength = 0;
    state.motionReview = false;
    renderComparisonCanvas();
  }
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`No se pudo cargar la imagen ${url}`));
    img.src = url;
  });
}

async function loadAndBuildAssets() {
  setStatusUI('loading', 'Cargando retrato…', 'Verificando fotografía y mapa de profundidad local.');
  state.error = null;

  try {
    const [metaRes, depthRes] = await Promise.all([
      fetch(ASSETS.metaUrl),
      fetch(ASSETS.depthUrl)
    ]);

    if (!metaRes.ok || !depthRes.ok) {
      const missing = [];
      if (!metaRes.ok) missing.push(`depth.json (${metaRes.status})`);
      if (!depthRes.ok) missing.push(`depth.f32 (${depthRes.status})`);
      state.error = `Activos de profundidad pendientes: ${missing.join(', ')}`;
      setStatusUI(
        'error',
        'No se pudo cargar el retrato',
        'No se han podido descargar los recursos. Comprueba tu conexión y vuelve a intentarlo.',
        true
      );
      return false;
    }

    const meta = await metaRes.json();
    const width = Number(meta.width);
    const height = Number(meta.height);
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
      throw new Error('Dimensiones inválidas en depth.json');
    }

    const [depthBuf, img, semanticHair] = await Promise.all([
      depthRes.arrayBuffer(),
      loadImage(ASSETS.rgbaUrl),
      tryLoadSemanticHairAsset(meta, width, height)
    ]);

    const expectedBytes = width * height * 4;
    if (depthBuf.byteLength !== expectedBytes) {
      throw new Error(`Tamaño de depth.f32 (${depthBuf.byteLength} B) no coincide con ${width}x${height} Float32 (${expectedBytes} B)`);
    }
    if (img.naturalWidth !== width || img.naturalHeight !== height) {
      throw new Error(`Dimensiones de amy-rgba.png (${img.naturalWidth}x${img.naturalHeight}) no coinciden con depth.json (${width}x${height})`);
    }

    const depthArray = new Float32Array(depthBuf);
    let dMin = Infinity;
    let dMax = -Infinity;
    for (let i = 0; i < depthArray.length; i++) {
      const v = depthArray[i];
      if (!Number.isFinite(v)) {
        throw new Error(`Valor no finito en depth.f32 en el índice ${i}`);
      }
      if (v < dMin) dMin = v;
      if (v > dMax) dMax = v;
    }

    const offCanvas = document.createElement('canvas');
    offCanvas.width = width;
    offCanvas.height = height;
    const offCtx = offCanvas.getContext('2d', { willReadFrequently: true });
    offCtx.drawImage(img, 0, 0, width, height);
    const rgbaData = offCtx.getImageData(0, 0, width, height).data;

    state.hairMaskSource = semanticHair ? semanticHair.source : 'chroma_fallback';
    // Warm tonal fields are derived once by rebuildMesh and reused for resampling.
    const fields = null;

    loadedAssets = {
      meta,
      width,
      height,
      depthArray,
      rgbaData,
      semanticHairWeights: semanticHair ? semanticHair.weights : null,
      imageElement: img,
      fields
    };

    state.assetDimensions = { width, height };
    state.depthRange = { min: dMin, max: dMax };

    if (typeof meta?.renderer_guidance?.initial_depth_over_portrait_width === 'number') {
      state.depthScale = clamp(meta.renderer_guidance.initial_depth_over_portrait_width, 0, 0.26);
      dom.depthSlider.value = String(state.depthScale);
      dom.depthOutput.textContent = state.depthScale.toFixed(2);
    }

    rebuildMesh(state.targetQuads);
    if (!platforms) platforms = await createPlatformMeshes({ THREE, scene, camera });
    updateCameraFrustum();
    state.time = 0;
    state.assembly = state.reducedMotion ? 1 : 0;
    renderComparisonCanvas();
    renderMiniComparisonCard();
    updateSplitUI(state.splitPercent);
    applyMode(state.mode);

    setStatusUI('ready', '', '');
    renderFrameSync(0);
    return true;
  } catch (err) {
    state.error = String(err.message || err);
    setStatusUI(
      'error',
      'No se pudo cargar el retrato',
      'Comprueba tu conexión y vuelve a intentarlo.',
      true
    );
    return false;
  }
}

function applyPoseImmediate(yawDeg, pitchDeg) {
  state.yawDeg = clamp(Number(yawDeg) || 0, -24, 24);
  state.pitchDeg = clamp(Number(pitchDeg) || 0, -18, 18);
  state.targetYawDeg = state.yawDeg;
  state.targetPitchDeg = state.pitchDeg;
  if (portraitGroup) {
    portraitGroup.rotation.y = THREE.MathUtils.degToRad(state.yawDeg);
    portraitGroup.rotation.x = THREE.MathUtils.degToRad(state.pitchDeg);
  }
}

let lastFrameTime = performance.now();
let fpsAccum = 0;
let fpsFrames = 0;
let rafId = 0;

function shouldAnimate() {
  return state.status === 'ready' && !state.frozen && !state.reducedMotion
    && !state.motionPaused && state.mode === 'portrait'
    && !document.hidden && Boolean(dom.canvas?.isConnected);
}

function syncAnimationLoop() {
  if (!shouldAnimate()) {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    return;
  }
  if (!rafId) {
    lastFrameTime = performance.now();
    rafId = requestAnimationFrame(animationLoop);
  }
}

function renderFrameSync(dt = 0.016) {
  if (!renderer || !scene || !camera || !postProcessor) return;

  const phase = getStoryStats();
  const storyInteraction = state.storyProgress === null || state.mode !== 'portrait' ? 1 : phase.interaction;
  const fieldInteraction = state.storyProgress === null ? 1 : phase.birth * (1 - phase.outflow);
  const automaticMotion = !state.frozen && state.mode === 'portrait'
    && !state.reducedMotion && !state.motionPaused;
  if (automaticMotion) {
    state.time += dt;
    state.assembly = state.storyProgress === null ? smoothstep(0, 1.6, state.time) : 1;
    if (storyInteraction <= 0) {
      state.targetYawDeg = 0;
      state.targetPitchDeg = 0;
    } else if (!state.pointerActive) {
      state.targetYawDeg = Math.sin(state.time * 0.45) * 2.1 + Math.sin(state.time * 0.83) * 0.45;
      state.targetPitchDeg = Math.sin(state.time * 0.38) * 1.0;
    }
    const lerpFactor = 1 - Math.exp(-dt * 5.5);
    state.yawDeg += (state.targetYawDeg - state.yawDeg) * lerpFactor;
    state.pitchDeg += (state.targetPitchDeg - state.pitchDeg) * lerpFactor;
    const targetStrength = state.pointerActive ? Math.max(storyInteraction, fieldInteraction) : 0;
    const responseRate = state.pointerActive ? 9 : 2.8;
    state.pointerStrength += (targetStrength - state.pointerStrength) * (1 - Math.exp(-dt * responseRate));
    if (!state.pointerActive && state.pointerStrength < 0.0001) state.pointerStrength = 0;
    state.rippleStrength = 0;
  } else if (!state.motionPaused || state.reducedMotion || state.mode !== 'portrait') {
    state.rippleStrength = 0;
  }

  const gpuMotion = !state.reducedMotion && state.mode === 'portrait' && storyInteraction > 0
    && (!state.motionPaused || state.motionReview)
    && (!state.frozen || state.motionReview);
  if (portraitGroup) {
    if (state.mode === 'comparison') applyPoseImmediate(0, 0);
    portraitGroup.rotation.y = THREE.MathUtils.degToRad(state.yawDeg) * storyInteraction;
    portraitGroup.rotation.x = THREE.MathUtils.degToRad(state.pitchDeg) * storyInteraction;
    portraitGroup.rotation.z = gpuMotion ? Math.sin(state.time * 0.62) * 0.0031 * storyInteraction : 0;
    portraitGroup.position.x = portraitBaseX + (gpuMotion ? Math.sin(state.time * 0.43) * 0.004 * storyInteraction : 0);
    portraitGroup.position.y = portraitBaseY + (gpuMotion ? (Math.sin(state.time * 0.8) * 0.008 + Math.sin(state.time * 1.31) * 0.003) * storyInteraction : 0);
    portraitGroup.updateMatrixWorld(true);
  }
  // Portrait Points use the current DOM UV directly in world space. The legacy
  // local raycast is not on this input path and cannot add coordinate lag.
  motionUniforms.uMotionTime.value = state.time;
  motionUniforms.uMotionAmount.value = gpuMotion ? state.motionIntensity * storyInteraction : 0;
  motionUniforms.uMotionAssembly.value = gpuMotion && state.storyProgress === null ? state.assembly : 1;
  motionUniforms.uMotionStrength.value = gpuMotion ? state.pointerStrength : 0;
  motionUniforms.uStoryActive.value = state.storyProgress !== null && state.mode === 'portrait' ? 1 : 0;
  motionUniforms.uStoryBirth.value = phase.birth;
  motionUniforms.uStoryGather.value = phase.amyGather;
  motionUniforms.uStoryRelease.value = phase.amyRelease;
  motionUniforms.uStoryOutflow.value = phase.outflow;
  motionUniforms.uStoryReduced.value = state.reducedMotion ? 1 : 0;
  portraitRepulsion.update({pointerLocal: state.pointerLocal, dt,
    pointerActive: state.pointerActive || state.motionReview,
    strength: state.pointerStrength, enabled: gpuMotion,
    reduced: state.reducedMotion, paused: state.motionPaused});
  if (portraitMesh) portraitMesh.visible = state.mode !== 'portrait';
  const particlePointerStrength = state.pointerStrength * .35;
  portraitPoints?.update({phase, mode: state.mode, pointer: state.mouseUV,
    strength: particlePointerStrength,
    enabled: state.mode === 'portrait' && (!state.frozen || state.motionReview),
    reduced: state.reducedMotion, paused: state.motionPaused});
  platforms?.update({ phase, time: state.time, mode: state.mode, reduced: state.reducedMotion,
    pointer: state.mouseUV, pointerStrength: particlePointerStrength * storyInteraction,
    hoverActive: state.pointerActive && state.pointerType === 'mouse',
    paused: state.motionPaused, pixelRatio: renderer.getPixelRatio() });
  deepSpace?.update({ phase, time: state.time, mode: state.mode, reduced: state.reducedMotion,
    pointer: state.mouseUV, pointerStrength: state.pointerStrength, paused: state.motionPaused });
  if (!state.presentationVisible) {
    state.renderCalls = 0;
    syncAnimationLoop();
    return;
  }
  deepSpace?.render();

  postFrameOptions.rippleStrength = 0;
  postFrameOptions.time = state.time;
  postFrameOptions.mode = state.mode;
  const yellowMix = deepSpace?.stats().yellow?.postMix || 0;
  postFrameOptions.yellowMix = yellowMix;
  postFrameOptions.bloomSpread = 1 + 3 * yellowMix;
  if (yellowMix > 0) {
    const high = postProcessor.highPassMat.uniforms, composite = postProcessor.compositeMat.uniforms;
    const saved = [high.uThreshold.value, high.uSmooth.value, composite.uBloomStrength.value];
    high.uThreshold.value = mix(saved[0], .06, yellowMix);
    high.uSmooth.value = mix(saved[1], .45, yellowMix);
    composite.uBloomStrength.value = mix(saved[2], 1.5, yellowMix);
    composite.uYellowMix.value = yellowMix;
    try { postProcessor.render(scene, camera, postFrameOptions); }
    finally {
      [high.uThreshold.value, high.uSmooth.value, composite.uBloomStrength.value] = saved;
      composite.uYellowMix.value = 0;
    }
  } else postProcessor.render(scene, camera, postFrameOptions);

  state.renderCalls = renderer.info.render.calls;
  syncAnimationLoop();
}

function animationLoop(now) {
  if (!shouldAnimate()) {
    rafId = 0;
    return;
  }
  const dt = clamp((now - lastFrameTime) / 1000, 0.001, 0.1);
  lastFrameTime = now;

  fpsAccum += dt;
  fpsFrames++;
  if (fpsAccum >= 0.5) {
    state.fps = Math.round(fpsFrames / fpsAccum);
    fpsAccum = 0;
    fpsFrames = 0;
  }

  renderFrameSync(dt);
  if (!shouldAnimate()) {
    rafId = 0;
    return;
  }
  rafId = requestAnimationFrame(animationLoop);
}

function bindInteraction() {
  const clearPointerInput = () => {
    state.pointerActive = false;
    state.pointerStrength = 0;
    state.targetYawDeg = 0;
    state.targetPitchDeg = 0;
    portraitRepulsion.clear();
    portraitPoints?.field.clear();
    if (state.status === 'ready') renderFrameSync(0);
  };
  window.addEventListener('blur', clearPointerInput);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearPointerInput();
    syncAnimationLoop();
  });
  window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', e => {
    state.reducedMotion = e.matches;
    state.targetYawDeg = 0;
    state.targetPitchDeg = 0;
    state.pointerActive = false;
    state.pointerStrength = 0;
    state.motionReview = false;
    applyPoseImmediate(0, 0);
    updateMotionButton();
    renderFrameSync(0);
  });
  window.addEventListener('resize', () => {
    if (!renderer || !postProcessor) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(window.innerWidth, window.innerHeight);
    postProcessor.setSize(
      Math.round(window.innerWidth * dpr),
      Math.round(window.innerHeight * dpr)
    );
    updateCameraFrustum();
    if (state.status === 'ready') renderFrameSync(0);
  });

  let draggingDivider = false;

  dom.comparisonDivider.addEventListener('pointerdown', (e) => {
    draggingDivider = true;
    dom.comparisonDivider.setPointerCapture(e.pointerId);
    e.stopPropagation();
  });

  window.addEventListener('pointerup', () => {
    draggingDivider = false;
  });

  dom.stage.addEventListener('pointermove', (e) => {
    const rect = dom.stage.getBoundingClientRect();
    const nx = clamp((e.clientX - rect.left) / Math.max(1, rect.width), 0, 1);
    const ny = clamp((e.clientY - rect.top) / Math.max(1, rect.height), 0, 1);

    if (draggingDivider && state.mode === 'comparison') {
      updateSplitUI(nx * 100);
      return;
    }

    if (e.target.closest('#review-panel')) {
      state.pointerActive = false;
      return;
    }
    if (state.reducedMotion || state.motionPaused || state.mode !== 'portrait' || state.frozen) return;

    state.pointerActive = true;
    state.pointerType = e.pointerType;
    state.mouseUV.set(nx, 1.0 - ny);

    // Pointer input repels particles; it does not tilt or magnify the photograph.
    state.targetYawDeg = 0;
    state.targetPitchDeg = 0;
  });

  dom.stage.addEventListener('pointerleave', () => {
    state.pointerActive = false;
    state.targetYawDeg = 0;
    state.targetPitchDeg = 0;
  });
  // A touch drag has no hover state after release; let its local wake settle naturally.
  dom.stage.addEventListener('pointerup', e => {
    if (e.pointerType !== 'mouse') state.pointerActive = false;
  });
  dom.stage.addEventListener('pointercancel', clearPointerInput);

  for (const btn of dom.modeBtns) {
    btn.addEventListener('click', () => {
      window.amyReview.setMode(btn.dataset.mode);
    });
  }

  dom.splitSlider.addEventListener('input', (e) => {
    updateSplitUI(e.target.value);
  });

  dom.depthSlider.addEventListener('input', (e) => {
    window.amyReview.setDepth(parseFloat(e.target.value));
  });

  dom.particlesSlider.addEventListener('change', (e) => {
    window.amyReview.setParticleCount(parseInt(e.target.value, 10));
  });

  dom.particlesSlider.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    dom.particlesOutput.textContent = `${Math.round(val / 1000)}k`;
  });

  dom.resetBtn.addEventListener('click', () => {
    window.amyReview.reset();
  });
  dom.motionBtn.addEventListener('click', () => {
    window.amyReview.setMotionPaused(!state.motionPaused);
  });

  dom.retryBtn.addEventListener('click', () => {
    loadAndBuildAssets();
  });
}

window.amyReview = {
  prepareStartup() {
    if (startupPrepared) return Promise.resolve(this.getStats());
    if (!startupPreparation) startupPreparation = (async () => {
      if (!await initialAssetsPromise || state.status !== 'ready') throw new Error('Particle assets unavailable.');
      renderer.compile(scene, camera);
      // Compile also visits invisible objects. A real draw is still required to
      // upload their buffers. Do not advance any simulation or narrative phase.
      const saved = new Map();
      scene.traverse(object => {
        if (!object.isPoints && !object.isLine && !object.name.startsWith('platform-')) return;
        startupWarmObjects++;
        for (let node = object; node && node !== scene; node = node.parent) {
          if (!saved.has(node)) saved.set(node, [node.visible, node.frustumCulled]);
          node.visible = true;
          node.frustumCulled = false;
        }
      });
      try {
        postProcessor.render(scene, camera, { ...postFrameOptions, time: state.time, mode: state.mode });
      } finally {
        for (const [object, values] of saved) [object.visible, object.frustumCulled] = values;
        if (state.presentationVisible) postProcessor.render(scene, camera, postFrameOptions);
        else { renderer.setRenderTarget(null); renderer.clear(); state.renderCalls = 0; }
      }
      await waitForGpu(renderer);
      startupPrepared = true;
      return this.getStats();
    })().catch(error => {
      startupPreparation = null;
      state.error = String(error.message || error);
      setStatusUI('error', 'No se pudo preparar la escena', 'Puedes continuar y reintentar la carga.', true);
      throw error;
    });
    return startupPreparation;
  },
  getStats() {
    return {
      status: state.status,
      startup: { prepared: startupPrepared, warmedObjects: startupWarmObjects },
      error: state.error,
      mode: state.mode,
      frozen: state.frozen,
      presentationVisible: state.presentationVisible,
      yawDeg: Math.round(state.yawDeg * 1000) / 1000,
      pitchDeg: Math.round(state.pitchDeg * 1000) / 1000,
      depthScale: state.depthScale,
      representation: state.mode === 'portrait' ? 'THREE.Points' : 'legacy diagnostic Mesh',
      pointCount: state.mode === 'portrait' ? portraitPoints?.stats().pointCount ?? 0 : 0,
      quadCount: state.mode === 'portrait' ? 0 : state.quadCount,
      vertexCount: state.mode === 'portrait' ? portraitPoints?.stats().pointCount ?? 0 : state.vertexCount,
      triangleCount: state.mode === 'portrait' ? 0 : state.triangleCount,
      facePointCount: state.mode === 'portrait' ? state.photoPointCounts?.face ?? 0 : 0,
      hairPointCount: state.mode === 'portrait' ? state.photoPointCounts?.hair ?? 0 : 0,
      faceQuadCount: state.mode === 'portrait' ? 0 : state.faceQuadCount,
      hairQuadCount: state.mode === 'portrait' ? 0 : state.hairQuadCount,
      hairMaskSource: state.hairMaskSource,
      splitPercent: state.splitPercent,
      assetDimensions: state.assetDimensions,
      depthRange: state.depthRange,
      luminanceStats: state.luminanceStats,
      exposure: postProcessor?.compositeMat.uniforms.uExposure.value,
      desaturation: postProcessor?.compositeMat.uniforms.uDesaturate.value,
      photoChroma: photoAppearanceUniforms.uPhotoChroma.value,
      fragmentScale: state.fragmentScale || 1,
      renderCalls: state.renderCalls,
      fps: state.fps,
      story: getStoryStats(),
      nebula: deepSpace?.stats(),
      yellowPost: { mix: postFrameOptions.yellowMix || 0, bloomSpread: postFrameOptions.bloomSpread || 1,
        fieldThreshold: .06, fieldSmoothing: .45, fieldBloom: 1.5, toneMapping: 'phase-gated ACES filmic' },
      repulsion: state.mode === 'portrait' ? portraitPoints?.field.stats() : portraitRepulsion.stats(),
      points: portraitPoints?.stats(),
      geometry: state.mode === 'portrait' ? portraitPoints?.stats().geometry : portraitMesh ? Object.fromEntries(['position','color','uv','aMotion','aCloud','aPhotoChroma'].map(name => {
        const attribute = portraitMesh.geometry.getAttribute(name);
        return [name, {count:attribute.count, version:attribute.version}];
      })) : null,
      motion: {
        time: state.time,
        assembly: state.assembly,
        strength: state.pointerStrength,
        localX: state.mode === 'portrait' ? null : state.pointerLocal.x,
        localY: state.mode === 'portrait' ? null : state.pointerLocal.y,
        pointerUV: state.mouseUV.toArray(),
        paused: state.motionPaused,
        intensity: state.motionIntensity,
        reducedMotion: state.reducedMotion,
        gpuEnabled: motionUniforms.uMotionAmount.value > 0
      }
    };
  },
  getState() {
    return this.getStats();
  },
  setFrozen(frozen = true) {
    state.frozen = Boolean(frozen);
    state.motionReview = false;
    renderFrameSync(0);
    return this.getStats();
  },
  setLook({exposure, desaturation, bloom, photoChroma} = {}) {
    const uniforms = postProcessor.compositeMat.uniforms;
    if (Number.isFinite(exposure)) uniforms.uExposure.value = clamp(exposure, 0.1, 30);
    if (Number.isFinite(desaturation)) uniforms.uDesaturate.value = clamp(desaturation, 0, 1);
    if (Number.isFinite(photoChroma)) photoAppearanceUniforms.uPhotoChroma.value = clamp(photoChroma, 0, 1);
    if (Number.isFinite(bloom)) uniforms.uBloomStrength.value = clamp(bloom, 0, 1);
    renderFrameSync(0);
    return this.getStats();
  },
  setFragmentScale(scale = 1) {
    state.fragmentScale = clamp(Number(scale) || 1, 0.4, 3);
    rebuildMesh(state.targetQuads);
    renderFrameSync(0);
    return this.getStats();
  },
  freeze() {
    return this.setFrozen(true);
  },
  unfreeze() {
    return this.setFrozen(false);
  },
  setPose(yawDeg = 0, pitchDeg = 0) {
    state.frozen = true;
    state.motionReview = false;
    applyPoseImmediate(yawDeg, pitchDeg);
    renderFrameSync(0);
    return this.getStats();
  },
  setYawPitch(yawDeg = 0, pitchDeg = 0) {
    return this.setPose(yawDeg, pitchDeg);
  },
  setMode(mode = 'portrait') {
    applyMode(mode);
    renderFrameSync(0);
    return this.getStats();
  },
  setDepth(depthScale = DEFAULTS.depthScale) {
    updateDepthPositions(depthScale);
    renderFrameSync(0);
    return this.getStats();
  },
  setParticleCount(count = DEFAULTS.targetQuads) {
    const clamped = clamp(Math.round(Number(count) || DEFAULTS.targetQuads), 80000, 350000);
    state.targetQuads = clamped;
    dom.particlesSlider.value = String(clamped);
    dom.particlesOutput.textContent = `${Math.round(clamped / 1000)}k`;
    rebuildMesh(clamped);
    renderFrameSync(0);
    return this.getStats();
  },
  setSplit(percent = 50) {
    updateSplitUI(percent);
    renderFrameSync(0);
    return this.getStats();
  },
  setMotionPaused(paused = true) {
    state.motionPaused = Boolean(paused);
    if (state.motionPaused) {state.pointerStrength = 0;portraitRepulsion.clear();portraitPoints?.field.clear();}
    state.motionReview = false;
    state.pointerActive = false;
    updateMotionButton();
    renderFrameSync(0);
    return this.getStats();
  },
  setPresentationVisible(visible = true) {
    const next = Boolean(visible);
    if (state.presentationVisible === next) return this.getStats();
    state.presentationVisible = next;
    if (next) renderFrameSync(0);
    else state.renderCalls = 0;
    return this.getStats();
  },
  setMotionIntensity(amount = 1) {
    state.motionIntensity = clamp(Number(amount) || 0, 0, 1.25);
    renderFrameSync(0);
    return this.getStats();
  },
  setStoryProgress(progress = 0.5) {
    const numericProgress = Number(progress);
    state.storyProgress = Number.isFinite(numericProgress) ? clamp(numericProgress, 0, 1) : 0.5;
    state.assembly = 1;
    renderFrameSync(0);
    return this.getStats();
  },
  clearStoryProgress() {
    state.storyProgress = null;
    state.assembly = 1;
    renderFrameSync(0);
    return this.getStats();
  },
  // Deterministic GPU frame: cursor uses normalized canvas coordinates, bottom-left origin.
  setMotionFrame({ time = 2, cursorX = 0.5, cursorY = 0.5, strength = 0,
    assembly = 1, yaw = 0, pitch = 0 } = {}) {
    state.frozen = true;
    state.motionReview = true;
    state.motionPaused = false;
    state.time = Math.max(0, Number(time) || 0);
    state.assembly = clamp(Number(assembly) || 0, 0, 1);
    state.pointerStrength = clamp(Number(strength) || 0, 0, 1);
    state.mouseUV.set(clamp(Number(cursorX) || 0, 0, 1), clamp(Number(cursorY) || 0, 0, 1));
    applyPoseImmediate(yaw, pitch);
    updateMotionButton();
    renderFrameSync(0);
    return this.getStats();
  },
  reset() {
    state.frozen = false;
    state.motionPaused = false;
    state.presentationVisible = true;
    state.motionReview = false;
    state.pointerActive = false;
    state.pointerStrength = 0;
    state.storyProgress = null;
    state.time = 0;
    state.assembly = state.reducedMotion ? 1 : 0;
    state.fragmentScale = DEFAULTS.fragmentScale;
    postProcessor.compositeMat.uniforms.uExposure.value = DEFAULTS.exposure;
    postProcessor.compositeMat.uniforms.uDesaturate.value = DEFAULTS.desaturation;
    photoAppearanceUniforms.uPhotoChroma.value = DEFAULTS.photoChroma;
    postProcessor.compositeMat.uniforms.uBloomStrength.value = 0.34;
    state.targetQuads = DEFAULTS.targetQuads;
    dom.particlesSlider.value = String(DEFAULTS.targetQuads);
    dom.particlesOutput.textContent = `${Math.round(DEFAULTS.targetQuads / 1000)}k`;
    rebuildMesh(DEFAULTS.targetQuads);
    updateDepthPositions(DEFAULTS.depthScale);
    updateSplitUI(DEFAULTS.splitPercent);
    applyMode(DEFAULTS.mode);
    applyPoseImmediate(0, 0);
    renderFrameSync(0);
    return this.getStats();
  },
  async reloadAssets() {
    await loadAndBuildAssets();
    return this.getStats();
  },
  renderFrame() {
    renderFrameSync(0);
    return this.getStats();
  }
};

if (initThree()) {
  bindInteraction();
  initialAssetsPromise = loadAndBuildAssets().then(result => {
    syncAnimationLoop();
    return result;
  });
}
