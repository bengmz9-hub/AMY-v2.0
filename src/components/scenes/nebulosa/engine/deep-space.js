// Original procedural field. No photograph, downloaded texture or simulation state.
// Gas is bounded-resolution; all stars and portrait dust retain static GPU buffers.
import { createParticleAtmosphere } from './particle-atmosphere.js';
import { createAbyssalYellow } from './abyssal-yellow.js';
import { createCosmicDust } from './cosmic-dust.js';
export { cloudMappingGLSL } from './particle-dynamics.js';

const quadVertex = `varying vec2 vUv;
void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}`;

const gasFragment = `
varying vec2 vUv;
uniform float uTime,uAspect,uBirth,uGather,uRelease,uOutflow,uReduced;
uniform vec2 uAxis;
// A restrained procedural halo beneath real particles; no raster nebula layer.
float impactHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float impactNoise(vec2 p){
 vec2 cell=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
 return mix(mix(impactHash(cell),impactHash(cell+vec2(1,0)),f.x),
   mix(impactHash(cell+vec2(0,1)),impactHash(cell+vec2(1)),f.x),f.y);
}
void main(){
 vec2 p=(vUv-.5)*vec2(uAspect,1.0)*2.0;
 float t=uTime*.015*(1.0-uReduced);
 p.x-=uOutflow*4.5*(1.0-uReduced);
 float size=mix(.28,1.0,uBirth)*(1.0-.20*uGather*(1.0-uRelease));
 p/=max(size,.05);
 // Soft gas follows the same folded banks, with an open dark rift.
 float spine=.18*sin(p.x*3.6+.4)+.11*sin(p.x*7.4-.6);
 float n=impactNoise(p*3.2+vec2(t,7.0));
 float fine=impactNoise(p*8.1+vec2(-t,t));
 float cross=p.y-spine;
 float banks=exp(-pow((abs(cross)-.20-.11*n)/(.12+.11*fine),2.0));
 float envelope=exp(-pow(p.x/1.20,4.0));
 float grain=impactNoise(p*34.0+vec2(t,-t))*.7+impactNoise(p*81.0)*.3;
 vec3 tint=mix(vec3(.075,.035,.14),vec3(.04,.14,.115),n);
 vec3 col=tint*banks*envelope*(.4+.6*grain)*.56;
 gl_FragColor=vec4(col,1.0);
}`;
function random(seed) { let a=seed>>>0; return () => { a+=0x6d2b79f5; let t=a; t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296; }; }

const starVertex = `
attribute vec4 aStar;
uniform float uTime,uBirth,uForm,uOutflow,uReduced,uDpr,uDensity;
uniform vec2 uHalfView;
varying vec3 vTint;
varying float vEnergy,vHalo,vVisibility;
void main(){
  float depth=aStar.x,seed=aStar.y;
  vec3 p=position;
  float moving=1.0-uReduced;
  float expansion=mix(mix(.64,1.0,uBirth),1.0,uReduced);
  p.xy*=uHalfView*1.34*expansion;
  p.xy+=vec2(sin(uTime*.022+depth*4.0),cos(uTime*.017+depth*3.0))*.024*(1.0-depth)*moving;
  p.xy*=1.0-.045*uForm*(1.0-depth)*moving;
  p.x+=uOutflow*(3.0+2.0*(1.0-depth))*moving;
  gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);
  gl_PointSize=aStar.z*uDpr;
  vHalo=step(.994,seed);
  vEnergy=aStar.w*(1.0+.10*sin(uTime*(.3+seed*.3)+seed*70.0)*moving);
  float warm=step(.91,fract(seed*91.7));
  vTint=mix(vec3(.57,.69,1.0),vec3(1.0,.76,.48),warm);
  vVisibility=smoothstep(seed*.64,seed*.64+.36,uBirth)*(1.0-uOutflow);
  vVisibility*=step(fract(sin(seed*173.71)*43758.5453),uDensity);
}`;
const starFragment = `
uniform float uOpacity;
varying vec3 vTint;
varying float vEnergy,vHalo,vVisibility;
void main(){
 vec2 p=(gl_PointCoord-.5)*2.0;float r=length(p);
 float core=exp(-r*r*mix(4.2,85.0,vHalo));
 float halo=exp(-r*r*7.0)*vHalo*.065;
 float cross=(exp(-abs(p.x)*85.0)*exp(-abs(p.y)*7.0)+exp(-abs(p.y)*85.0)*exp(-abs(p.x)*7.0))*vHalo*.075;
 float a=(core+halo+cross)*(1.0-smoothstep(.75,1.0,r))*vVisibility*uOpacity;
 if(a<.001)discard;
 gl_FragColor=vec4(vTint*vEnergy,a);
}`;

export function createDeepSpace({THREE,scene,camera,renderer}) {
  const atmosphere=createParticleAtmosphere({THREE,scene,camera,renderer});
  const yellow=createAbyssalYellow({THREE,scene,camera,renderer});
  const cosmic=createCosmicDust({THREE,scene,renderer});
  const gasUniforms={uTime:{value:0},uAspect:{value:1},uBirth:{value:0},uGather:{value:0},uRelease:{value:0},uOutflow:{value:0},uReduced:{value:0},uAxis:{value:new THREE.Vector2(.86,-.51)}};
  const target=new THREE.WebGLRenderTarget(2,2,{type:THREE.HalfFloatType,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,depthBuffer:false,stencilBuffer:false});
  const quad=new THREE.PlaneGeometry(2,2),gasMaterial=new THREE.ShaderMaterial({uniforms:gasUniforms,vertexShader:quadVertex,fragmentShader:gasFragment,depthTest:false,depthWrite:false});
  const gasScene=new THREE.Scene(),gasCamera=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
  gasScene.add(new THREE.Mesh(quad,gasMaterial));
  const displayUniforms={tGas:{value:target.texture},uOpacity:{value:0},uForm:{value:0},uAspect:{value:1}};
  const displayMaterial=new THREE.ShaderMaterial({uniforms:displayUniforms,vertexShader:quadVertex,
    fragmentShader:`varying vec2 vUv;uniform sampler2D tGas;uniform float uOpacity,uForm,uAspect;
    void main(){vec2 p=(vUv-.5)*vec2(uAspect,1.0);float sanctuary=1.0-uForm*exp(-dot(p,p)/.16)*.99;
    gl_FragColor=vec4(texture2D(tGas,vUv).rgb,uOpacity*sanctuary);}`,
    transparent:true,blending:THREE.AdditiveBlending,depthTest:false,depthWrite:false});
  const gasMesh=new THREE.Mesh(quad,displayMaterial);gasMesh.name='deep-space-gas';gasMesh.frustumCulled=false;gasMesh.renderOrder=-20;scene.add(gasMesh);

  const count=18500,rand=random(0x4e454231),positions=new Float32Array(count*3),data=new Float32Array(count*4);
  for(let i=0;i<count;i++){
    const seed=rand(),depth=i<15500?.65+rand()*.35:i<18390?.25+rand()*.4:rand()*.25;
    const bright=i>=18390;
    positions.set([(rand()-.5)*2,(rand()-.5)*2,-1.5-depth*5.5],i*3);
    data.set([depth,bright?.994+rand()*.006:seed*.993,
      bright?9+rand()*12:i<15500?.65+rand()*.65:1.1+rand()*1.35,
      bright?1.1+rand()*1.6:i<15500?.08+rand()*.27:.25+rand()*.65],i*4);
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setAttribute('aStar',new THREE.BufferAttribute(data,4));
  const starUniforms={uTime:{value:0},uBirth:{value:0},uForm:{value:0},uOutflow:{value:0},uReduced:{value:0},uDpr:{value:1},uDensity:{value:1},uHalfView:{value:new THREE.Vector2()},uOpacity:{value:0}};
  const material=new THREE.ShaderMaterial({uniforms:starUniforms,vertexShader:starVertex,fragmentShader:starFragment,transparent:true,blending:THREE.AdditiveBlending,depthTest:false,depthWrite:false});
  const stars=new THREE.Points(geometry,material);stars.name='deep-space-stars';stars.frustumCulled=false;stars.renderOrder=-10;scene.add(stars);
  let cacheKey='',gasPasses=0,opacity=0,active=false;
  function resize(width,height){
    atmosphere.resize(width,height);
    yellow.resize(width,height);
    cosmic.resize(width,height);
    const scale=Math.min(.62,900/width,640/height),w=Math.max(2,Math.round(width*scale)),h=Math.max(2,Math.round(height*scale));
    if(target.width!==w||target.height!==h){target.setSize(w,h);cacheKey='';}
    gasUniforms.uAspect.value=width/height;displayUniforms.uAspect.value=width/height;
    const blend=Math.max(0,Math.min(1,(width/height-.5)/.7));
    gasUniforms.uAxis.value.set(.48+.38*blend,-.88+.37*blend).normalize();
    starUniforms.uDensity.value=Math.min(1,Math.max(.28,width*height/1296000));
    starUniforms.uDpr.value=renderer.getPixelRatio();starUniforms.uHalfView.value.set(camera.right,camera.top);
  }
  return {
    gasMesh,stars,cosmic,resize,
    getYellowMorphSource(){return yellow.getMorphSource();},
    update({phase,time,mode,reduced,pointer,pointerStrength=0,paused=false}){
      // The original Abyssal field owns the intro. The previous background is
      // retained for the established portrait release/outflow, after amyGather=1.
      atmosphere.update({phase:{...phase,active:phase.active&&phase.amyGather>=1},time,mode,reduced,pointer,pointerStrength,paused});
      yellow.update({phase,time,mode,reduced,pointer,pointerStrength,paused});
      cosmic.update({phase,time,mode,reduced,pointer,pointerStrength,paused});
      active=phase.active&&mode==='portrait'&&phase.birth>0&&phase.outflow<1;
      const formed=phase.amyForm;
      // The galaxy surrenders its light to the photograph. Stars survive only at 2%.
      opacity=phase.birth*(1-phase.outflow)*Math.pow(1-formed,2.1);
      // The visible nebula is exclusively free point sprites, with no gas plane.
      gasMesh.visible=false;stars.visible=active&&phase.amyGather>=1;
      displayUniforms.uOpacity.value=opacity*.32;displayUniforms.uForm.value=formed;
      const u=gasUniforms;u.uTime.value=reduced?0:time;u.uBirth.value=phase.birth;u.uGather.value=phase.amyGather;u.uRelease.value=phase.amyRelease;u.uOutflow.value=phase.outflow;u.uReduced.value=reduced?1:0;
      const s=starUniforms;s.uTime.value=reduced?0:time;s.uBirth.value=phase.birth;s.uForm.value=formed;s.uOutflow.value=phase.outflow;s.uReduced.value=reduced?1:0;s.uOpacity.value=1-formed*.98;
    },
    render(){
      if(!gasMesh.visible)return;
      const key=Object.values(gasUniforms).map(u=>u.value?.isVector2?u.value.toArray():u.value).join('/');
      if(key===cacheKey)return;
      const prior=renderer.getRenderTarget();renderer.setRenderTarget(target);renderer.clear();renderer.render(gasScene,gasCamera);renderer.setRenderTarget(prior);cacheKey=key;gasPasses++;
    },
    stats(){return {active,profile:'abyssal-yellow-intro',gasVisible:gasMesh.visible,starsVisible:stars.visible,opacity,starCount:count,gasSize:[target.width,target.height],gasPasses,extraDrawCalls:(gasMesh.visible?3:stars.visible?1:0)+atmosphere.stats().extraDrawCalls+yellow.stats().extraDrawCalls+(cosmic.stats().visible?1:0),atmosphere:atmosphere.stats(),yellow:yellow.stats(),cosmic:cosmic.stats(),geometryBytes:positions.byteLength+data.byteLength+atmosphere.stats().geometryBytes+yellow.stats().geometryBytes+cosmic.stats().geometryBytes};},
    dispose(){cosmic.dispose();yellow.dispose();atmosphere.dispose();scene.remove(gasMesh,stars);target.dispose();quad.dispose();gasMaterial.dispose();displayMaterial.dispose();geometry.dispose();material.dispose();}
  };
}
