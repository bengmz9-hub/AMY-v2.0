/** @license
 * ABYSSAL live fall -> protected photo bridge; local adaptation, 2026-11-05.
 * Kernel source: https://abyssal-xi-inky.vercel.app/_next/static/chunks/248.426ef229881fb1b6.js
 * Source SHA256: f8f2ddd3e07ea9ab88fb32da11dbcd8707f6dae72236d4e150727de32aa586fe
 * Observed source notice preserved: © 2026 ABYSSAL — CC BY-SA 4.0.
 * https://creativecommons.org/licenses/by-sa/4.0/
 * Authorship and legal coverage are source declarations, not authenticated here.
 * Adaptations: prefixed symbols; mapped attributes/alpha multiplicity; exact clip
 * unprojection into the host camera; borrowed live uniform aliases and lifecycle.
 */

export const abyssalPhotoBridgeGLSL = `
// Original ABYSSAL cloud kernel; symbols prefixed for the photo material.
// Source alpha excludes the outgoing draw envelope and includes only inverse
// multiplicity. The fragment material must use the original halo/core at source.

  uniform float uAbTime;
  uniform float uAbSize;
  uniform float uAbPixelRatio;
  uniform float uAbIntro;
  uniform float uAbVelocity;

  uniform vec3  uAbMouse;
  uniform float uAbMouseForce;

  /* The section, as forces. Every one of these is a live blend of two
     neighbouring presets — none is ever a preset's own value except
     exactly at the top of a section. */
  uniform float uAbSpread;
  uniform float uAbFreq;
  uniform float uAbAmp;
  uniform float uAbDrift;
  uniform float uAbFall;
  uniform float uAbPull;
  uniform float uAbCluster;
  uniform float uAbCell;
  uniform float uAbSwirl;
  uniform float uAbShear;
  uniform float uAbGrain;
  uniform float uAbGain;

  uniform vec3 uAbDeep;
  uniform vec3 uAbMid;
  uniform vec3 uAbHot;

  attribute vec3  aAbSeed;
  attribute vec3  aAbRand;
  attribute float aAbTone;
  attribute float aAbScale;


  vec3 abBridgeMod289(vec3 x){ return x - floor(x * (1.0/289.0)) * 289.0; }
  vec4 abBridgeMod289(vec4 x){ return x - floor(x * (1.0/289.0)) * 289.0; }
  vec4 abBridgePermute(vec4 x){ return abBridgeMod289(((x*34.0)+1.0)*x); }
  vec4 abBridgeTaylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }

  float abBridgeNoise(vec3 v){
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
    i = abBridgeMod289(i);
    vec4 p = abBridgePermute(abBridgePermute(abBridgePermute(
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
    vec4 norm = abBridgeTaylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 mm = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    mm = mm * mm;
    return 42.0 * dot(mm*mm, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
  }


  vec3 abBridgeRamp(vec3 deep, vec3 mid, vec3 hot, float t) {
    float k = clamp(t, 0.0, 1.0);
    return k < 0.5
      ? mix(deep, mid, k * 2.0)
      : mix(mid, hot, (k - 0.5) * 2.0);
  }


  vec3 abBridgeHash3(vec3 c) {
    vec3 p = vec3(
      dot(c, vec3(127.1, 311.7,  74.7)),
      dot(c, vec3(269.5, 183.3, 246.1)),
      dot(c, vec3(113.5, 271.9, 124.6))
    );
    return fract(sin(p) * 43758.5453123);
  }

  vec2 abBridgeRot(vec2 p, float a) {
    float c = cos(a), s = sin(a);
    return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
  }

  /** The band particles recycle through when uAbFall is non-zero. */
  const float AB_BRIDGE_BAND = 8.0;


attribute float aAbWeight;
uniform mat4 uAbReferenceView,uAbReferenceProjection,uAbHostProjectionInverse,uAbHostWorld;
uniform float uAbHandoff,uAbPostMix;
struct AbyssalBridgeSample {vec3 world;vec3 color;float alpha;float pointSize;};
AbyssalBridgeSample sampleAbyssalBridge() {

    vec3 p = aAbSeed;

    /* --- 1. Fall, with wraparound ---------------------------------- *
       mod() over the band is an identity when uAbFall is zero, so this
       costs nothing in the sections that do not use it and needs no
       branch. */
    p.y = mod(p.y - uAbTime * uAbFall + AB_BRIDGE_BAND, AB_BRIDGE_BAND * 2.0) - AB_BRIDGE_BAND;

    p *= uAbSpread;

    /* --- 2. Colonies ----------------------------------------------- *
       Contract each lattice cell's contents toward a jittered centre.
       This is what turns one continuous cloud into a scatter of
       discrete bodies without needing a second set of buffers. */
    if (uAbCluster > 0.001) {
      vec3 cellIdx = floor(p / uAbCell);
      vec3 centre = (cellIdx + 0.5) * uAbCell + (abBridgeHash3(cellIdx) - 0.5) * uAbCell * 0.62;
      p = mix(p, centre + (p - centre) * 0.26, uAbCluster);
    }

    /* --- 3. Collapse toward a filled sphere ------------------------ *
       Radius from a squared random so the body is dense in the middle
       and thins at the surface, rather than being a hollow shell. */
    if (uAbPull > 0.001) {
      vec3 dir = normalize(p + vec3(0.0001));
      float r = 0.45 + pow(aAbRand.x, 1.9) * 3.05;
      p = mix(p, dir * r, uAbPull);
    }

    /* --- 4. Curl warp ---------------------------------------------- *
       Two octaves of direct simplex displacement, not true curl noise.
       Curl needs six noise triplets per vertex; at this particle count
       that is the whole frame budget, and for a cloud this diffuse the
       divergence-free property is not visible. The streamline layer,
       built once on the CPU, does use real curl — that is where it
       actually reads. */
    vec3 q = p * uAbFreq + vec3(0.0, 0.0, uAbTime * uAbDrift);
    vec3 warp = vec3(abBridgeNoise(q), abBridgeNoise(q + 19.7), abBridgeNoise(q + 43.3));
    vec3 q2 = q * 2.35 + 7.3;
    warp += vec3(abBridgeNoise(q2), abBridgeNoise(q2 + 19.7), abBridgeNoise(q2 + 43.3)) * 0.42;
    p += warp * uAbAmp;

    /* --- 5. Differential swirl ------------------------------------- *
       Divided by radius, so the middle turns faster than the rim. A
       rigid rotation reads as a turntable. */
    if (abs(uAbSwirl) > 0.001) {
      float rr = length(p.xy);
      p.xy = abBridgeRot(p.xy, uAbSwirl * uAbTime / (0.55 + rr * 0.4));
    }

    /* --- 6. Travelling shear --------------------------------------- */
    if (abs(uAbShear) > 0.001) {
      p.x += sin(p.y * 0.52 + uAbTime * 0.34) * uAbShear * 1.7;
      p.z += cos(p.y * 0.41 - uAbTime * 0.22) * uAbShear * 0.6;
    }

    /* --- 7. Cursor -------------------------------------------------- */
    vec2 toMouse = p.xy - uAbMouse.xy;
    float md = length(toMouse);
    float influence = smoothstep(3.0, 0.0, md);
    p.xy += normalize(toMouse + vec2(0.0001)) * influence * uAbMouseForce * 1.3;

    /* --- 8. Intro --------------------------------------------------- */
    p *= 1.0 + (1.0 - uAbIntro) * 1.8;

    vec4 mv = uAbReferenceView * vec4(p, 1.0);
    vec4 abReferenceClip = uAbReferenceProjection * mv;

    /* Warp magnitude pushes a particle up its own abBridgeRamp, so the parts of
       the field that are moving hardest are also the brightest. That
       coupling is what makes the colour read as *caused by* the motion
       rather than painted on top of it. */
    float energy = clamp(length(warp) * 0.42, 0.0, 1.0);
    float tone = clamp(aAbTone * 0.72 + energy * 0.5, 0.0, 1.0);
    vec3 abSampleColor = abBridgeRamp(uAbDeep, uAbMid, uAbHot, tone) * uAbGain;

    float sizePx = uAbSize * uAbGrain * aAbScale * uAbPixelRatio * (44.0 / max(0.001, -mv.z));
    float abSamplePointSize = max(sizePx, uAbPixelRatio * 0.9);
    // Anything inflated to reach the floor gives the difference back in
    // alpha, or the far field flattens into a uniform sheet.
    float shrink = clamp(sizePx / (uAbPixelRatio * 0.9), 0.35, 1.0);

    float flicker = 0.68 + 0.32 * sin(uAbTime * (0.9 + aAbRand.y * 2.2) + aAbRand.z * 12.566);
    float depthFade = smoothstep(-30.0, -2.0, mv.z);

    float abSampleAlpha = flicker * depthFade * shrink * uAbIntro * (1.0 + uAbVelocity * 0.35);

  vec4 abHostView=uAbHostProjectionInverse*vec4(abReferenceClip.xyz/abReferenceClip.w,1.0);
  AbyssalBridgeSample result;
  result.world=(uAbHostWorld*(abHostView/abHostView.w)).xyz;
  result.color=abSampleColor;
  result.alpha=abSampleAlpha*aAbWeight;
  result.pointSize=abSamplePointSize;
  return result;
}
`;

const bridgeCache=new WeakMap();
const bridgeAttributes=Object.freeze({aAbSeed:3,aAbRand:3,aAbTone:1,aAbScale:1,aAbWeight:1});
const sourceUniformNames=Object.freeze(['uTime','uSize','uPixelRatio','uIntro','uVelocity','uMouse','uMouseForce',
  'uSpread','uFreq','uAmp','uDrift','uFall','uPull','uCluster','uCell','uSwirl','uShear','uGrain','uGain',
  'uDeep','uMid','uHot','uReferenceView','uReferenceProjection','uHandoff','uPostMix']);
function gcd(a,b){while(b){const next=a%b;a=b;b=next;}return a;}

export function createAbyssalPhotoBridge({THREE,geometry,source,camera,renderer}) {
  const count=geometry?.getAttribute('position')?.count;
  if(!geometry?.isBufferGeometry||!Number.isSafeInteger(count)||count<1)
    throw new RangeError('Abyssal bridge requires a nonempty point BufferGeometry');
  if(!source||source.disposed||!Number.isSafeInteger(source.count)||source.count<1)
    throw new RangeError('Abyssal bridge requires a live original morph source');
  if(!camera?.isOrthographicCamera||!camera.projectionMatrixInverse||!camera.matrixWorld)
    throw new TypeError('Abyssal bridge requires the host orthographic camera');
  if(!renderer)throw new TypeError('Abyssal bridge requires the host renderer');
  const cached=bridgeCache.get(geometry);
  if(cached&&cached.source===source&&cached.camera===camera&&cached.renderer===renderer&&cached.count===count&&!cached.api.stats().disposed)
    return cached.api;
  const originalNames=Object.keys(geometry.attributes).filter(name=>!cached||!Object.hasOwn(bridgeAttributes,name));
  if(originalNames.length+Object.keys(bridgeAttributes).length>Math.min(16,renderer.capabilities?.maxAttributes??16))
    throw new RangeError('Abyssal bridge exceeds the minimum WebGL attribute budget');
  if(!cached&&Object.keys(bridgeAttributes).some(name=>geometry.hasAttribute(name)))
    throw new Error('Abyssal bridge attribute names are already owned');
  const names={aAbSeed:'aSeed',aAbRand:'aRand',aAbTone:'aTone',aAbScale:'aScale'};
  for(const [name,original] of Object.entries(names)) {
    const attribute=source.attributes?.[original];
    if(!attribute?.isBufferAttribute||attribute.itemSize!==bridgeAttributes[name]||attribute.count!==source.count
      ||!attribute.array.every(Number.isFinite))throw new RangeError('Invalid Abyssal source attribute '+original);
  }
  for(const name of sourceUniformNames)if(!source.uniforms?.[name]||!Object.hasOwn(source.uniforms[name],'value'))
    throw new TypeError('Missing live Abyssal source uniform '+name);

  // A fixed coprime permutation keeps correspondence deterministic and evenly
  // visits the entire source before reusing it. No source random is reseeded.
  const sourceCount=source.count,offset=0;
  let stride=Math.max(1,Math.floor(sourceCount*.6180339887498949));
  while(gcd(stride,sourceCount)!==1)stride++;
  const multiplicity=new Uint32Array(sourceCount);
  for(let i=0;i<count;i++)multiplicity[(i*stride+offset)%sourceCount]++;
  const arrays=Object.fromEntries(Object.entries(bridgeAttributes).map(([name,size])=>[name,new Float32Array(count*size)]));
  for(let i=0;i<count;i++) {
    const index=(i*stride+offset)%sourceCount;
    for(const [name,original] of Object.entries(names)) {
      const size=bridgeAttributes[name],input=source.attributes[original].array;
      for(let channel=0;channel<size;channel++)arrays[name][i*size+channel]=input[index*size+channel];
    }
    // Multiplicity normalization belongs to source alpha only. Root interpolates
    // toward the original photo alpha at the protected destination endpoint.
    arrays.aAbWeight[i]=1/multiplicity[index];
  }
  if(cached)cached.api.dispose();
  const attached={};
  for(const [name,size] of Object.entries(bridgeAttributes)) {
    const attribute=new THREE.BufferAttribute(arrays[name],size);
    attached[name]=attribute;geometry.setAttribute(name,attribute);
  }
  camera.updateMatrixWorld();
  const uniforms=Object.fromEntries(sourceUniformNames.map(name=>['uAb'+name.slice(1),source.uniforms[name]]));
  // These matrices are existing live objects, updated by the host on resize.
  // No camera/renderer state is changed by the bridge or on every frame.
  uniforms.uAbHostProjectionInverse={value:camera.projectionMatrixInverse};
  uniforms.uAbHostWorld={value:camera.matrixWorld};
  let minMultiplicity=Infinity,maxMultiplicity=0,covered=0,weightSum=0;
  for(const value of multiplicity)if(value){covered++;minMultiplicity=Math.min(minMultiplicity,value);maxMultiplicity=Math.max(maxMultiplicity,value);}
  for(const value of arrays.aAbWeight)weightSum+=value;
  let disposed=false;
  const api={uniforms,
    stats(){return {profile:'abyssal-source-photo-bridge',count,sourceCount,coveredSources:covered,
      uncoveredSources:sourceCount-covered,fullSourceCoverage:covered===sourceCount,
      mapping:{kind:'balanced-coprime',stride,offset,minMultiplicity,maxMultiplicity},
      normalization:'inverse source multiplicity in source alpha only',weightSum,
      addedAttributes:Object.keys(attached),attributeCount:Object.keys(geometry.attributes).length,
      geometryBytes:Object.values(arrays).reduce((sum,array)=>sum+array.byteLength,0),
      staticBuffers:true,liveUniformAliases:true,disposed};},
    dispose(){
      if(disposed)return;
      for(const [name,attribute] of Object.entries(attached))if(geometry.getAttribute(name)===attribute)geometry.deleteAttribute(name);
      if(bridgeCache.get(geometry)?.api===api)bridgeCache.delete(geometry);
      disposed=true;
    }
  };
  bridgeCache.set(geometry,{source,camera,renderer,count,api});
  return api;
}

const overflowCache=new WeakMap();
const photoAttributeNames=Object.freeze(['position','color','uv','aMotion','aCloud','aPhotoChroma','aDiameter','aHairDust']);

export function createAbyssalOverflowBridge({THREE,geometry,source,camera,renderer}) {
  const primary=bridgeCache.get(geometry),count=geometry?.getAttribute('position')?.count;
  if(!primary||primary.source!==source||primary.camera!==camera||primary.renderer!==renderer
    ||primary.count!==count||source.disposed)
    throw new Error('Attach a live primary Abyssal photo bridge before its overflow carrier');
  const cached=overflowCache.get(geometry);
  // The usual desktop/mobile tiers allocate no carrier buffers, geometry or
  // uniforms and require no additional draw. This also retires an old carrier
  // if an explicit primary rebuild now covers the complete source.
  if(count>=source.count){cached?.api.dispose();return null;}
  if(cached?.primary===primary.api)return cached.api;
  for(const name of photoAttributeNames) {
    const attribute=geometry.getAttribute(name);
    if(!attribute?.isBufferAttribute||attribute.count!==count)
      throw new RangeError('Overflow destinations must retain the eight primary photo attributes: '+name);
  }
  const mapping=primary.api.stats().mapping,covered=new Uint8Array(source.count);
  for(let i=0;i<count;i++)covered[(i*mapping.stride+mapping.offset)%source.count]=1;
  const overflowCount=source.count-count,destinationIndices=new Uint32Array(overflowCount);
  const carrier=new THREE.BufferGeometry();
  for(const name of photoAttributeNames) {
    const input=geometry.getAttribute(name),array=new input.array.constructor(overflowCount*input.itemSize);
    carrier.setAttribute(name,new THREE.BufferAttribute(array,input.itemSize,input.normalized));
  }
  for(const [name,size] of Object.entries(bridgeAttributes))
    carrier.setAttribute(name,new THREE.BufferAttribute(new Float32Array(overflowCount*size),size));
  const names={aAbSeed:'aSeed',aAbRand:'aRand',aAbTone:'aTone',aAbScale:'aScale'};
  let output=0;
  for(let sourceIndex=0;sourceIndex<source.count;sourceIndex++) {
    if(covered[sourceIndex])continue;
    // Midpoints of equal destination intervals distribute carriers over the
    // whole protected portrait rather than placing all of them in a prefix.
    const destination=Math.floor((output+.5)*count/overflowCount);
    destinationIndices[output]=destination;
    for(const name of photoAttributeNames) {
      const input=geometry.getAttribute(name),array=carrier.getAttribute(name).array;
      for(let channel=0;channel<input.itemSize;channel++)
        array[output*input.itemSize+channel]=input.array[destination*input.itemSize+channel];
    }
    for(const [name,original] of Object.entries(names)) {
      const input=source.attributes[original],array=carrier.getAttribute(name).array;
      for(let channel=0;channel<input.itemSize;channel++)
        array[output*input.itemSize+channel]=input.array[sourceIndex*input.itemSize+channel];
    }
    carrier.getAttribute('aAbWeight').array[output]=1;
    output++;
  }
  if(output!==overflowCount){carrier.dispose();throw new Error('Primary source correspondence is not a complete coprime subset');}
  if(cached)cached.api.dispose();
  let disposed=false,depthSyncCalls=0,depthUploads=0;
  const uniforms={...primary.api.uniforms,uAbCarrierOnly:{value:1}};
  const api={geometry:carrier,uniforms,
    stats(){return {profile:'abyssal-overflow-source-carrier',count:overflowCount,sourceCount:source.count,
      primaryCount:count,coveredSources:overflowCount,combinedCoveredSources:count+overflowCount,
      combinedFullSourceCoverage:count+overflowCount===source.count,sourceWeight:1,carrierOnly:true,
      mapping:{primaryStride:mapping.stride,primaryOffset:mapping.offset,sourceOrder:'ascending exact complement',
        destinationRule:'floor((carrierIndex+.5)*primaryCount/carrierCount)'},
      attributeCount:Object.keys(carrier.attributes).length,
      geometryBytes:Object.values(carrier.attributes).reduce((sum,a)=>sum+a.array.byteLength,0),
      destinationIndexBytes:destinationIndices.byteLength,staticBuffers:true,depthSyncCalls,depthUploads,disposed};},
    syncDepth(){
      if(disposed)return false;
      if(bridgeCache.get(geometry)?.api!==primary.api||geometry.getAttribute('position').count!==count)
        throw new Error('Rebuild overflow carrier after rebuilding its primary photo bridge');
      depthSyncCalls++;let anyChanged=false;
      for(const name of ['position','aCloud']) {
        const input=geometry.getAttribute(name),attribute=carrier.getAttribute(name);let changed=false;
        for(let i=0;i<overflowCount;i++)for(let channel=0;channel<input.itemSize;channel++) {
          const offset=i*input.itemSize+channel,value=input.array[destinationIndices[i]*input.itemSize+channel];
          if(attribute.array[offset]!==value){attribute.array[offset]=value;changed=true;}
        }
        if(changed){attribute.needsUpdate=true;depthUploads++;anyChanged=true;}
      }
      return anyChanged;
    },
    dispose(){
      if(disposed)return;
      carrier.dispose();disposed=true;
      if(overflowCache.get(geometry)?.api===api)overflowCache.delete(geometry);
    }
  };
  overflowCache.set(geometry,{primary:primary.api,api});
  return api;
}
