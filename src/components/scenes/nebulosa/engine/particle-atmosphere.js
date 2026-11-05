import { sampleImpact, cloudMappingGLSL } from './particle-dynamics.js';

// Irregular cosmic dust banks, filaments and embedded light. Actual particles,
// preserving the existing interaction and formation envelope; no image layer.
const vertex = `
attribute vec4 aMatter;
attribute vec3 aTint;
uniform vec2 uAxis,uHalfView,uPointer;
uniform float uTime,uBirth,uForm,uOutflow,uScale,uDpr,uReduced,uDensity,uPointerStrength;
varying vec3 vColor;
varying float vEnergy;
${cloudMappingGLSL}
void main(){
 float seed=aMatter.x;
 float clock=uTime*(1.0-uReduced);
 float turn=clock*.07,c=cos(turn),s=sin(turn);
 vec3 original=vec3(position.x*c+position.z*s,position.y,-position.x*s+position.z*c);
 float spin=clock*.012;
 original.xy=mat2(cos(spin),sin(spin),-sin(spin),cos(spin))*original.xy;
 vec3 p=nebulaCloud(original,uAxis);
 p=nebulaBirthSpiral(p,uBirth,seed,uReduced);
 float breath=sin(clock*.65+seed*6.2831853)*.004*(1.0-uReduced);
 p+=original*breath;
 p.xy*=uScale*mix(.28,1.0,uBirth);
 p.x+=uOutflow*5.2;
 // Optional host pointer, in bottom-left normalized screen space.
 vec2 delta=p.xy-(uPointer*2.0-1.0)*uHalfView;
 float distanceToPointer=length(delta);
 float influence=(1.0-smoothstep(0.0,.66*uScale,distanceToPointer))*uPointerStrength*(1.0-uReduced);
 p.xy+=delta/max(distanceToPointer,.0001)*influence*.26*uScale;
 p.z+=influence*.10*uScale;
 gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);
 float depth=clamp(1.0+original.z*.22,.72,1.3);
 gl_PointSize=aMatter.y*uDpr*depth;
 float rim=pow(1.0-abs(original.z)/max(length(original),.0001),1.4);
 float shell=1.0-step(.5,aMatter.w);
 vColor=aTint*aMatter.z*mix(1.0,.35+rim*1.25,shell);
 vColor*=nebulaBirthGlow(uBirth,uReduced);
 float twinkle=1.0-.12*(.5+.5*sin(clock*(1.0+seed)+seed*30.0))*(1.0-uReduced);
 vEnergy=uBirth*(1.0-uOutflow)*pow(1.0-uForm,1.8)*twinkle;
 vEnergy*=step(seed,uDensity)*smoothstep(seed*.35,seed*.35+.65,uBirth);
}`;
const fragment = `
varying vec3 vColor;varying float vEnergy;
void main(){
 float r=length((gl_PointCoord-.5)*2.0);if(r>1.0)discard;
 float f=1.0-r,halo=.48*pow(f,1.8),core=pow(f,6.8);
 gl_FragColor=vec4(vColor*(halo+core*1.85),(halo+core)*vEnergy);
}`;

const clamp = value => Math.max(0,Math.min(1,Number.isFinite(value)?value:0));
export function createParticleAtmosphere({THREE,scene,camera,renderer}) {
 const count=82000,positions=new Float32Array(count*3),matter=new Float32Array(count*4),tints=new Float32Array(count*3);
 // Sampled Carina/Webb copper dust, illuminated gold and deep/bright sky blue.
 const roles=[0,0,0,0],tint=new THREE.Color(),copper=new THREE.Color('#814335'),gold=new THREE.Color('#bd8f6b'),sky=new THREE.Color('#204285'),azure=new THREE.Color('#3c68a3'),light=new THREE.Color('#d7b16a');
 for(let i=0;i<count;i++){
  const sample=sampleImpact(i,0x41544d4f),{seed,role,ridge}=sample;
  positions.set(sample.position,i*3);roles[role]++;
  let size,energy;
  if(role===0){size=2.1+seed*1.55;energy=.48+ridge*1.25;tint.copy(copper).lerp(gold,.4+ridge*.6).lerp(azure,clamp((sample.position[0]*1.35+sample.position[2]*.42-.20)/.75)*.85).multiplyScalar(1.4);}
  else if(role===1){size=1.15+seed*.95;energy=.36+.26*(1-Math.min(1,Math.hypot(...sample.position)));tint.copy(gold).lerp(sky,clamp((sample.position[0]+.15)*.85)).lerp(azure,seed*.3).multiplyScalar(1.4);}
  else if(role===3){size=1.5+seed*1.2;energy=.55+seed*.65;tint.copy(gold).lerp(light,seed).multiplyScalar(1.4);}
  else{size=2.0+Math.pow(seed,3)*4.8;energy=.6+Math.pow(seed,3)*2.4;tint.setRGB(.64,.82,1.0);if(seed>.62)tint.setRGB(.96,.94,.68);}
  matter.set([seed,size,energy,role],i*4);tint.toArray(tints,i*3);
 }
 const geometry=new THREE.BufferGeometry();
 geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
 geometry.setAttribute('aMatter',new THREE.BufferAttribute(matter,4));
 geometry.setAttribute('aTint',new THREE.BufferAttribute(tints,3));
 const uniforms={uAxis:{value:new THREE.Vector2(1,0)},uHalfView:{value:new THREE.Vector2(1,1)},uPointer:{value:new THREE.Vector2(2,2)},uPointerStrength:{value:0},uTime:{value:0},uBirth:{value:0},uForm:{value:0},uOutflow:{value:0},uScale:{value:1},uDpr:{value:1},uReduced:{value:0},uDensity:{value:1}};
 const material=new THREE.ShaderMaterial({uniforms,vertexShader:vertex,fragmentShader:fragment,transparent:true,blending:THREE.AdditiveBlending,depthTest:false,depthWrite:false});
 const dust=new THREE.Points(geometry,material);dust.name='cosmic-dust-banks-filaments';dust.frustumCulled=false;dust.renderOrder=-8;scene.add(dust);
 return {
  resize(width,height){
   uniforms.uScale.value=camera.top/1.08;uniforms.uHalfView.value.set(camera.right,camera.top);
   uniforms.uDpr.value=renderer.getPixelRatio();
   uniforms.uDensity.value=Math.min(1,Math.max(.35,width*height/1296000));
  },
  update({phase,time,mode,reduced,pointer,pointerStrength=0,paused=false}){
   if(!paused)uniforms.uTime.value=reduced?0:Math.max(0,Number.isFinite(time)?time:0);
   uniforms.uBirth.value=clamp(phase.birth);uniforms.uForm.value=clamp(phase.amyForm);uniforms.uOutflow.value=clamp(phase.outflow);uniforms.uReduced.value=reduced?1:0;
   const validPointer=pointer&&Number.isFinite(pointer.x)&&Number.isFinite(pointer.y);
   uniforms.uPointerStrength.value=validPointer&&!reduced&&!paused?clamp(pointerStrength):0;
   if(validPointer)uniforms.uPointer.value.set(pointer.x,pointer.y);
   dust.visible=phase.active&&mode==='portrait'&&phase.birth>0&&phase.outflow<1&&phase.amyForm<1;
  },
  stats(){return {profile:'live-astera-05-impact',dustCount:count,roles:{shell:roles[0],rays:roles[1],accents:roles[2],core:roles[3]},lines:0,steps:0,lineVertices:0,dustVisible:dust.visible,currentsVisible:false,extraDrawCalls:Number(dust.visible),bufferVersions:[geometry.attributes.position.version],geometryBytes:positions.byteLength+matter.byteLength+tints.byteLength,pointerStrength:uniforms.uPointerStrength.value};},
  dispose(){scene.remove(dust);geometry.dispose();material.dispose();}
 };
}
