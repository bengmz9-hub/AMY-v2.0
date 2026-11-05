/** @license
 * Local adaptation of the actual shipped ABYSSAL fall/yellow scene.
 * Source: https://abyssal-xi-inky.vercel.app/
 * Shader/generators: /_next/static/chunks/248.426ef229881fb1b6.js
 * SHA256: f8f2ddd3e07ea9ab88fb32da11dbcd8707f6dae72236d4e150727de32aa586fe
 * Preset: /_next/static/chunks/app/page-f5f455b8c7daf0da.js
 * SHA256: a579617149545cf420393268767a05a9562ce70369f9373edaa7bc346fc71e6c
 * Captured 2026-11-04, live responses independently matched 2026-11-05.
 * Observed source footer notice, preserved: © 2026 ABYSSAL — CC BY-SA 4.0.
 * https://creativecommons.org/licenses/by-sa/4.0/
 * That notice is a source declaration; authorship/coverage are not authenticated.
 * Source shader comments are retained. Adaptations: shared-scene local perspective,
 * reversible story opacity, supplied clock with pause/reduced gating, lifecycle/stats.
 * The cloud is the shipped cuboid -> filled-sphere -> two-octave simplex ->
 * differential swirl kernel. No ring/torus seed construction or photo geometry.
 */

function p(e) { let n = e >>> 0; return function () { n |= 0; let e = Math.imul((n = n + 0x6d2b79f5 | 0) ^ n >>> 15, 1 | n); return (((e = e + Math.imul(e ^ e >>> 7, 61 | e) ^ e) ^ e >>> 14) >>> 0) / 0x100000000; }; }
const v=1/3,d=1/6,f=new Float32Array([1,1,0,-1,1,0,1,-1,0,-1,-1,0,1,0,1,-1,0,1,1,0,-1,-1,0,-1,0,1,1,0,-1,1,0,1,-1,0,-1,-1]);
function sourceStreamlines(e, n) { var t, a, o, l; let r = arguments.length > 2 && void 0 !== arguments[2] ? arguments[2] : {}, i = null != (t = r.freq) ? t : .115, u = null != (a = r.step) ? a : .115, s = null != (o = r.box) ? o : [15, 6.5, 2.2], c = null != (l = r.zScale) ? l : .16, h = p(0x243f6a88), m = function () { let e = arguments.length > 0 && void 0 !== arguments[0] ? arguments[0] : Math.random, n = new Uint8Array(256); for (let e = 0; e < 256; e++)
    n[e] = e; for (let t = 255; t > 0; t--) {
    let a = Math.floor((t + 1) * e()), o = n[t];
    n[t] = n[a], n[a] = o;
} let t = new Uint8Array(512), a = new Uint8Array(512); for (let e = 0; e < 512; e++)
    t[e] = n[255 & e], a[e] = t[e] % 12; return function (e, n, o) { let l, r, i, u, s, c, p = (e + n + o) * v, h = Math.floor(e + p), m = Math.floor(n + p), x = Math.floor(o + p), y = (h + m + x) * d, w = e - (h - y), g = n - (m - y), b = o - (x - y); w >= g ? g >= b ? (l = 1, r = 0, i = 0, u = 1, s = 1, c = 0) : (w >= b ? (l = 1, r = 0, i = 0) : (l = 0, r = 0, i = 1), u = 1, s = 0, c = 1) : g < b ? (l = 0, r = 0, i = 1, u = 0, s = 1, c = 1) : w < b ? (l = 0, r = 1, i = 0, u = 0, s = 1, c = 1) : (l = 0, r = 1, i = 0, u = 1, s = 1, c = 0); let S = w - l + d, A = g - r + d, M = b - i + d, z = w - u + 2 * d, T = g - s + 2 * d, C = b - c + 2 * d, F = w - 1 + 3 * d, P = g - 1 + 3 * d, U = b - 1 + 3 * d, D = 255 & h, k = 255 & m, q = 255 & x, j = 0, I = 0, R = 0, H = 0, _ = .6 - w * w - g * g - b * b; if (_ > 0) {
    let e = 3 * a[D + t[k + t[q]]];
    _ *= _, j = _ * _ * (f[e] * w + f[e + 1] * g + f[e + 2] * b);
} let G = .6 - S * S - A * A - M * M; if (G > 0) {
    let e = 3 * a[D + l + t[k + r + t[q + i]]];
    G *= G, I = G * G * (f[e] * S + f[e + 1] * A + f[e + 2] * M);
} let B = .6 - z * z - T * T - C * C; if (B > 0) {
    let e = 3 * a[D + u + t[k + s + t[q + c]]];
    B *= B, R = B * B * (f[e] * z + f[e + 1] * T + f[e + 2] * C);
} let L = .6 - F * F - P * P - U * U; if (L > 0) {
    let e = 3 * a[D + 1 + t[k + 1 + t[q + 1]]];
    L *= L, H = L * L * (f[e] * F + f[e + 1] * P + f[e + 2] * U);
} return 32 * (j + I + R + H); }; }(p(0xb7e15162)), x = (e, n, t, a) => { let o = m(e, n + .09, t), l = m(e, n - .09, t), r = m(e, n, t + .09), i = m(e, n, t - .09), u = m(e + .09 + 41.7, n + 41.7, t + 41.7), s = m(e - .09 + 41.7, n + 41.7, t + 41.7), c = m(e + 41.7, n + 41.7, t + .09 + 41.7), p = m(e + 41.7, n + 41.7, t - .09 + 41.7), v = m(e + .09 + 93.1, n + 93.1, t + 93.1), d = m(e - .09 + 93.1, n + 93.1, t + 93.1), f = m(e + 93.1, n + .09 + 93.1, t + 93.1), h = 1 / .18 * (f - m(e + 93.1, n - .09 + 93.1, t + 93.1)) - 1 / .18 * (c - p), x = 1 / .18 * (r - i) - 1 / .18 * (v - d), y = 1 / .18 * (u - s) - 1 / .18 * (o - l), w = Math.hypot(h, x, y) || 1; h /= w, x /= w, y /= w, a[0] = h, a[1] = x, a[2] = y; }, y = n - 1, w = e * y * 2, g = new Float32Array(3 * w), b = new Float32Array(w), S = new Float32Array(w), A = new Float32Array(w), M = [0, 0, 0], z = new Float32Array(3 * n), T = 0; for (let t = 0; t < e; t++) {
    let e = (h() - .5) * s[0], t = (h() - .5) * s[1], a = (h() - .5) * s[2];
    for (let o = 0; o < n; o++) {
        z[3 * o] = e, z[3 * o + 1] = t, z[3 * o + 2] = a, x(e * i, t * i, a * i, M);
        let n = e + M[0] * u * .5;
        x(n * i, (t + M[1] * u * .5) * i, (a + M[2] * u * .5 * c) * i, M), e += M[0] * u, t += M[1] * u, a += M[2] * u * c;
    }
    let o = h(), l = h();
    for (let e = 0; e < y; e++) {
        let n = 3 * e, t = (e + 1) * 3, a = e / y, r = (e + 1) / y;
        g[3 * T] = z[n], g[3 * T + 1] = z[n + 1], g[3 * T + 2] = z[n + 2], b[T] = a, S[T] = o, A[T] = l, g[3 * ++T] = z[t], g[3 * T + 1] = z[t + 1], g[3 * T + 2] = z[t + 2], b[T] = r, S[T] = o, A[T] = l, T++;
    }
} return { positions: g, along: b, seed: S, tone: A, vertexCount: w }; }

const CLOUD_VERTEX = `uniform mat4 uReferenceView;
uniform mat4 uReferenceProjection;
uniform float uEnvelope;

  uniform float uTime;
  uniform float uSize;
  uniform float uPixelRatio;
  uniform float uIntro;
  uniform float uVelocity;

  uniform vec3  uMouse;
  uniform float uMouseForce;

  /* The section, as forces. Every one of these is a live blend of two
     neighbouring presets — none is ever a preset's own value except
     exactly at the top of a section. */
  uniform float uSpread;
  uniform float uFreq;
  uniform float uAmp;
  uniform float uDrift;
  uniform float uFall;
  uniform float uPull;
  uniform float uCluster;
  uniform float uCell;
  uniform float uSwirl;
  uniform float uShear;
  uniform float uGrain;
  uniform float uGain;

  uniform vec3 uDeep;
  uniform vec3 uMid;
  uniform vec3 uHot;

  attribute vec3  aSeed;
  attribute vec3  aRand;
  attribute float aTone;
  attribute float aScale;

  varying vec3  vColor;
  varying float vAlpha;


  vec3 mod289(vec3 x){ return x - floor(x * (1.0/289.0)) * 289.0; }
  vec4 mod289(vec4 x){ return x - floor(x * (1.0/289.0)) * 289.0; }
  vec4 permute(vec4 x){ return mod289(((x*34.0)+1.0)*x); }
  vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v){
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i  = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(
              i.z + vec4(0.0, i1.z, i2.z, 1.0))
            + i.y + vec4(0.0, i1.y, i2.y, 1.0))
            + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 mm = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    mm = mm * mm;
    return 42.0 * dot(mm*mm, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
  }


  vec3 ramp(vec3 deep, vec3 mid, vec3 hot, float t) {
    float k = clamp(t, 0.0, 1.0);
    return k < 0.5
      ? mix(deep, mid, k * 2.0)
      : mix(mid, hot, (k - 0.5) * 2.0);
  }


  vec3 hash3(vec3 c) {
    vec3 p = vec3(
      dot(c, vec3(127.1, 311.7,  74.7)),
      dot(c, vec3(269.5, 183.3, 246.1)),
      dot(c, vec3(113.5, 271.9, 124.6))
    );
    return fract(sin(p) * 43758.5453123);
  }

  vec2 rot(vec2 p, float a) {
    float c = cos(a), s = sin(a);
    return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
  }

  /** The band particles recycle through when uFall is non-zero. */
  const float BAND = 8.0;

  void main() {
    vec3 p = aSeed;

    /* --- 1. Fall, with wraparound ---------------------------------- *
       mod() over the band is an identity when uFall is zero, so this
       costs nothing in the sections that do not use it and needs no
       branch. */
    p.y = mod(p.y - uTime * uFall + BAND, BAND * 2.0) - BAND;

    p *= uSpread;

    /* --- 2. Colonies ----------------------------------------------- *
       Contract each lattice cell's contents toward a jittered centre.
       This is what turns one continuous cloud into a scatter of
       discrete bodies without needing a second set of buffers. */
    if (uCluster > 0.001) {
      vec3 cellIdx = floor(p / uCell);
      vec3 centre = (cellIdx + 0.5) * uCell + (hash3(cellIdx) - 0.5) * uCell * 0.62;
      p = mix(p, centre + (p - centre) * 0.26, uCluster);
    }

    /* --- 3. Collapse toward a filled sphere ------------------------ *
       Radius from a squared random so the body is dense in the middle
       and thins at the surface, rather than being a hollow shell. */
    if (uPull > 0.001) {
      vec3 dir = normalize(p + vec3(0.0001));
      float r = 0.45 + pow(aRand.x, 1.9) * 3.05;
      p = mix(p, dir * r, uPull);
    }

    /* --- 4. Curl warp ---------------------------------------------- *
       Two octaves of direct simplex displacement, not true curl noise.
       Curl needs six noise triplets per vertex; at this particle count
       that is the whole frame budget, and for a cloud this diffuse the
       divergence-free property is not visible. The streamline layer,
       built once on the CPU, does use real curl — that is where it
       actually reads. */
    vec3 q = p * uFreq + vec3(0.0, 0.0, uTime * uDrift);
    vec3 warp = vec3(snoise(q), snoise(q + 19.7), snoise(q + 43.3));
    vec3 q2 = q * 2.35 + 7.3;
    warp += vec3(snoise(q2), snoise(q2 + 19.7), snoise(q2 + 43.3)) * 0.42;
    p += warp * uAmp;

    /* --- 5. Differential swirl ------------------------------------- *
       Divided by radius, so the middle turns faster than the rim. A
       rigid rotation reads as a turntable. */
    if (abs(uSwirl) > 0.001) {
      float rr = length(p.xy);
      p.xy = rot(p.xy, uSwirl * uTime / (0.55 + rr * 0.4));
    }

    /* --- 6. Travelling shear --------------------------------------- */
    if (abs(uShear) > 0.001) {
      p.x += sin(p.y * 0.52 + uTime * 0.34) * uShear * 1.7;
      p.z += cos(p.y * 0.41 - uTime * 0.22) * uShear * 0.6;
    }

    /* --- 7. Cursor -------------------------------------------------- */
    vec2 toMouse = p.xy - uMouse.xy;
    float md = length(toMouse);
    float influence = smoothstep(3.0, 0.0, md);
    p.xy += normalize(toMouse + vec2(0.0001)) * influence * uMouseForce * 1.3;

    /* --- 8. Intro --------------------------------------------------- */
    p *= 1.0 + (1.0 - uIntro) * 1.8;

    vec4 mv = uReferenceView * vec4(p, 1.0);
    gl_Position = uReferenceProjection * mv;

    /* Warp magnitude pushes a particle up its own ramp, so the parts of
       the field that are moving hardest are also the brightest. That
       coupling is what makes the colour read as *caused by* the motion
       rather than painted on top of it. */
    float energy = clamp(length(warp) * 0.42, 0.0, 1.0);
    float tone = clamp(aTone * 0.72 + energy * 0.5, 0.0, 1.0);
    vColor = ramp(uDeep, uMid, uHot, tone) * uGain;

    float sizePx = uSize * uGrain * aScale * uPixelRatio * (44.0 / max(0.001, -mv.z));
    gl_PointSize = max(sizePx, uPixelRatio * 0.9);
    // Anything inflated to reach the floor gives the difference back in
    // alpha, or the far field flattens into a uniform sheet.
    float shrink = clamp(sizePx / (uPixelRatio * 0.9), 0.35, 1.0);

    float flicker = 0.68 + 0.32 * sin(uTime * (0.9 + aRand.y * 2.2) + aRand.z * 12.566);
    float depthFade = smoothstep(-30.0, -2.0, mv.z);

    vAlpha = flicker * depthFade * shrink * uIntro * (1.0 + uVelocity * 0.35) * uEnvelope;
  }
`;

const CLOUD_FRAGMENT = `
  varying vec3  vColor;
  varying float vAlpha;

  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    if (d > 0.5) discard;

    float f = 1.0 - d * 2.0;
    // Wide halo plus a tight core. One term alone gives either a blurry
    // smudge or a hard pixel; the pair reads as a glowing grain.
    float halo = pow(f, 1.8) * 0.45;
    float core = pow(f, 6.5);

    gl_FragColor = vec4(vColor * (halo + core * 1.85), (halo + core) * vAlpha);
  }
`;

const STREAM_VERTEX = `uniform mat4 uReferenceView;
uniform mat4 uReferenceProjection;
uniform float uEnvelope;

  uniform float uTime;
  uniform float uOpacity;
  uniform float uIntro;
  uniform vec3  uDeep;
  uniform vec3  uMid;
  uniform vec3  uHot;
  uniform vec2  uParallax;

  attribute float aAlong;
  attribute float aSeed;
  attribute float aTone;

  varying vec3  vColor;
  varying float vAlpha;


  vec3 ramp(vec3 deep, vec3 mid, vec3 hot, float t) {
    float k = clamp(t, 0.0, 1.0);
    return k < 0.5
      ? mix(deep, mid, k * 2.0)
      : mix(mid, hot, (k - 0.5) * 2.0);
  }


  void main() {
    vec3 p = position;
    p.xy += uParallax * (0.4 + aSeed * 0.6);

    vec4 mv = uReferenceView * vec4(p, 1.0);
    gl_Position = uReferenceProjection * mv;

    /* A gaussian crest travelling the line. Each line runs at its own
       rate and phase, so the crests never form a marching band. */
    float speed = 0.055 + aSeed * 0.05;
    float head = fract(uTime * speed + aSeed);
    float d = abs(aAlong - head);
    d = min(d, 1.0 - d);                     // wrap at the ends
    float crest = exp(-pow(d * 11.0, 2.0));

    // Fade both ends so lines terminate in the dark rather than being
    // cut off, which is what would give the field a visible boundary.
    float ends = smoothstep(0.0, 0.12, aAlong) * smoothstep(1.0, 0.88, aAlong);

    float tone = clamp(aTone * 0.4 + crest * 0.85, 0.0, 1.0);
    vColor = ramp(uDeep, uMid, uHot, tone);

    float depthFade = smoothstep(-26.0, -2.0, mv.z);
    vAlpha = (0.05 + crest * 0.95) * ends * depthFade * uOpacity * uIntro * uEnvelope;
  }
`;

const STREAM_FRAGMENT = `
  varying vec3  vColor;
  varying float vAlpha;

  void main() {
    gl_FragColor = vec4(vColor * (0.35 + vAlpha * 1.5), vAlpha);
  }
`;

const FALL = Object.freeze({spread:1,freq:.34,amp:.66,drift:.1,fall:.05,pull:.92,
  cluster:0,cell:3.2,swirl:.34,shear:0,grain:1,gain:1.2,stream:.14,camZ:9.4,mouseForce:.5});
const clamp = (n, fallback = 0) => Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : fallback;
function smoothRange(start,end,value) {const t=clamp((value-start)/(end-start));return t*t*(3-2*t);}
function cloudBuffers(count) {
  const rand=p(0x428a2f98), seed=new Float32Array(count*3), random=new Float32Array(count*3);
  const tone=new Float32Array(count), scale=new Float32Array(count);
  for(let i=0;i<count;i++) {
    const j=i*3;
    seed[j]=(rand()-.5)*22;seed[j+1]=(rand()-.5)*16;seed[j+2]=(rand()-.5)*10;
    random[j]=rand();random[j+1]=rand();random[j+2]=rand();tone[i]=rand();
    const sizeRand=rand();
    let a=0,b=0;while(a===0)a=rand();while(b===0)b=rand();
    const gaussian=Math.max(-3,Math.min(3,Math.sqrt(-2*Math.log(a))*Math.cos(2*Math.PI*b)));
    scale[i]=.42+2.2*Math.pow(sizeRand,3.1)+.1*Math.abs(gaussian);
  }
  return {position:new Float32Array(count*3),aSeed:seed,aRand:random,aTone:tone,aScale:scale};
}

export function createAbyssalYellow({THREE,scene,camera,renderer}) {
  // A private projection keeps the original FOV/depth inside the host's
  // orthographic scene. It never changes the host camera or renderer settings.
  const size=renderer.getSize(new THREE.Vector2());
  let width=Math.max(1,size.x),height=Math.max(1,size.y),disposed=false;
  const count=width<700?34000:width<1100?66000:width<1700?112000:138000;
  const lineCount=width<700?380:width<1100?620:width<1700?900:1150;
  const steps=width<700?64:width<1100?72:width<1700?80:88;
  const referenceCamera=new THREE.PerspectiveCamera(45,width/height,.1,200);
  referenceCamera.position.set(0,0,FALL.camZ);referenceCamera.lookAt(0,0,0);
  referenceCamera.updateMatrixWorld();
  const common=()=>({uTime:{value:0},uIntro:{value:0},uEnvelope:{value:0},
    uReferenceView:{value:referenceCamera.matrixWorldInverse},uReferenceProjection:{value:referenceCamera.projectionMatrix},
    // The shipped page normalizes hex channels directly before setRGB. Using
    // THREE.Color(hex) here would additionally decode sRGB and darken the scene.
    uDeep:{value:new THREE.Color().setRGB(13/255,9/255,4/255)},
    uMid:{value:new THREE.Color().setRGB(154/255,98/255,32/255)},
    uHot:{value:new THREE.Color().setRGB(1,220/255,168/255)}});
  const uniforms={...common(),uSize:{value:1},uPixelRatio:{value:1},uVelocity:{value:0},
    uMouse:{value:new THREE.Vector3(0,0,0)},uMouseForce:{value:0}};
  for(const [key,value] of Object.entries(FALL)) {
    if(['camZ','stream','mouseForce'].includes(key))continue;
    uniforms['u'+key[0].toUpperCase()+key.slice(1)]={value};
  }
  const geometry=new THREE.BufferGeometry(),buffers=cloudBuffers(count);
  for(const [name,array] of Object.entries(buffers)) geometry.setAttribute(name,new THREE.BufferAttribute(array,['aTone','aScale'].includes(name)?1:3));
  const material=new THREE.ShaderMaterial({uniforms,vertexShader:CLOUD_VERTEX,fragmentShader:CLOUD_FRAGMENT,
    transparent:true,depthWrite:false,depthTest:false,blending:THREE.AdditiveBlending});
  const points=new THREE.Points(geometry,material);
  points.name='abyssal-yellow-cloud';points.frustumCulled=false;points.renderOrder=-8;points.visible=false;

  // The source has a faint independent RK2 streamline layer, not geometric
  // circle outlines. It uses the same static paths, seed and moving crest.
  const paths=sourceStreamlines(lineCount,steps),streamGeometry=new THREE.BufferGeometry();
  streamGeometry.setAttribute('position',new THREE.BufferAttribute(paths.positions,3));
  streamGeometry.setAttribute('aAlong',new THREE.BufferAttribute(paths.along,1));
  streamGeometry.setAttribute('aSeed',new THREE.BufferAttribute(paths.seed,1));
  streamGeometry.setAttribute('aTone',new THREE.BufferAttribute(paths.tone,1));
  const streamUniforms={...common(),uOpacity:{value:FALL.stream},uParallax:{value:new THREE.Vector2()}};
  const streamMaterial=new THREE.ShaderMaterial({uniforms:streamUniforms,vertexShader:STREAM_VERTEX,fragmentShader:STREAM_FRAGMENT,
    transparent:true,depthWrite:false,depthTest:false,blending:THREE.AdditiveBlending});
  const streams=new THREE.LineSegments(streamGeometry,streamMaterial);
  streams.name='abyssal-yellow-streams';streams.frustumCulled=false;streams.renderOrder=-9;streams.visible=false;
  scene.add(streams,points);
  const geometryBytes=Object.values(buffers).reduce((n,a)=>n+a.byteLength,0)+
    paths.positions.byteLength+paths.along.byteLength+paths.seed.byteLength+paths.tone.byteLength;
  let initialized=false,clock=0,opacity=0,streamOpacity=0,birth=0,gather=0,reducedState=false,pausedState=false;
  const handoffUniform={value:0},postMixUniform={value:0};
  // Borrowed references are read-only by contract. Freezing these maps protects
  // their bindings; typed arrays and live .value objects remain renderer-owned.
  // Crucially, no outgoing uEnvelope is exposed as source material alpha.
  const morphSource=Object.freeze({version:'abyssal-fall-morph-v1',count,
    attributes:Object.freeze(Object.fromEntries(['aSeed','aRand','aTone','aScale'].map(name=>[name,geometry.getAttribute(name)]))),
    uniforms:Object.freeze({...Object.fromEntries(Object.entries(uniforms).filter(([name])=>name!=='uEnvelope')),
      uHandoff:handoffUniform,uPostMix:postMixUniform}),
    get disposed(){return disposed;}});
  const errors=[];
  function resize(w,h) {
    if(disposed)return;
    width=Math.max(1,Number.isFinite(w)?w:1);height=Math.max(1,Number.isFinite(h)?h:1);
    referenceCamera.aspect=width/height;referenceCamera.updateProjectionMatrix();
    uniforms.uSize.value=Math.max(.66,Math.min(1.5,height/900));
    uniforms.uPixelRatio.value=Math.min(renderer.getPixelRatio(),2);
  }
  resize(width,height);
  return {
    getMorphSource() {
      if(disposed)throw new Error('Cannot borrow a disposed Abyssal morph source');
      return morphSource;
    },
    update({phase={},time=0,mode='portrait',reduced=false,pointer,pointerStrength=0,paused=false}={}) {
      if(disposed)return;
      birth=clamp(phase.birth);gather=Math.max(clamp(phase.amyGather),clamp(phase.amyForm));
      // Root keeps the existing static photo dissolve under reduced motion.
      // With no spatial bridge draw, retain the source across the whole gather.
      const handoff=reduced?gather:smoothRange(0,.18,gather),outflow=1-clamp(phase.outflow);
      const fade=(1-handoff)*outflow;
      const streamFade=(1-smoothRange(.18,.75,gather))*outflow;
      const active=Boolean(phase.active)&&mode==='portrait';
      opacity=active?birth*fade:0;
      streamOpacity=active?birth*streamFade:0;
      points.visible=opacity>0;streams.visible=streamOpacity>0;
      handoffUniform.value=active?handoff:0;
      postMixUniform.value=active?birth*(1-smoothRange(.35,1,gather))*outflow:0;
      reducedState=Boolean(reduced);pausedState=Boolean(paused);
      // Only the caller's existing clock drives this layer. Pausing freezes
      // both field and pointer even if the caller keeps sending new values.
      if(!initialized||(!paused&&!reduced))clock=Number.isFinite(time)?Math.max(0,time):clock;
      if(reduced)clock=0;
      if(reduced||!paused||!initialized) {
        const strength=reduced?0:clamp(pointerStrength);
        const px=(clamp(pointer?.x,.5)-.5)*2;
        const py=(clamp(pointer?.y,.5)-.5)*2;
        const nx=px*strength,ny=py*strength;
        const halfH=Math.tan(Math.PI/8)*FALL.camZ;
        // Fade force at the last real position; never pull its wake to the centre.
        uniforms.uMouse.value.set(px*halfH*width/height,py*halfH,0);
        uniforms.uMouseForce.value=FALL.mouseForce*strength;
        referenceCamera.position.set(nx*.5,ny*.34,FALL.camZ);referenceCamera.lookAt(0,0,0);referenceCamera.updateMatrixWorld();
        streamUniforms.uParallax.value.set(nx*.55,ny*.35);
      }
      initialized=true;
      for(const u of [uniforms,streamUniforms]) {
        u.uTime.value=clock;u.uIntro.value=birth;
      }
      uniforms.uEnvelope.value=active?fade:0;
      streamUniforms.uEnvelope.value=active?streamFade:0;
    },
    resize,
    stats() {
      return {profile:'abyssal-shipped-fall-yellow',sourceState:'fall',count,visible:points.visible||streams.visible,opacity,
        cloudVisible:points.visible,cloudOpacity:opacity,streamOpacity,handoff:handoffUniform.value,postMix:postMixUniform.value,
        streamCount:lineCount,streamSteps:steps,streamVertices:paths.vertexCount,streamsVisible:streams.visible,
        extraDrawCalls:(points.visible?1:0)+(streams.visible?1:0),geometryBytes,staticBuffers:true,disposed,errors:[...errors],
        projection:{kind:'local-perspective',fov:45,near:.1,far:200,camZ:FALL.camZ,aspect:width/height,hostOrthographic:Boolean(camera?.isOrthographicCamera)},
        parameters:{...FALL,deep:'#0d0904',mid:'#9a6220',hot:'#ffdca8'},
        uniforms:{time:clock,intro:birth,gather,envelope:uniforms.uEnvelope.value,size:uniforms.uSize.value,
          pixelRatio:uniforms.uPixelRatio.value,mouse:uniforms.uMouse.value.toArray(),mouseForce:uniforms.uMouseForce.value,
          paused:pausedState,reduced:reducedState},
        postprocessing:'host-owned; source uses Bloom 1.5/.06/.45/.82 + ACES + vignette + noise'};
    },
    dispose() {
      if(disposed)return;
      scene.remove(points,streams);geometry.dispose();material.dispose();streamGeometry.dispose();streamMaterial.dispose();
      points.visible=streams.visible=false;opacity=streamOpacity=0;handoffUniform.value=postMixUniform.value=0;disposed=true;
    }
  };
}
