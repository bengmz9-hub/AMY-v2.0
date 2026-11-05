// Selected C field: the approved seeded three-bank dust distribution, behind AMY.
const random=seed=>()=>{seed|=0;seed=seed+0x6d2b79f5|0;let n=seed;n=Math.imul(n^n>>>15,n|1);n^=n+Math.imul(n^n>>>7,n|61);return((n^n>>>14)>>>0)/4294967296;};
const palette=['a180c0','649ca9','be9677','a2b9d7'].map(hex=>[0,2,4].map(i=>parseInt(hex.slice(i,i+2),16)/255));
const vertexShader=`
attribute vec4 aDust;
attribute vec3 aTint;
attribute float aBright;
uniform float uTime,uDpr,uMobile,uOpacity;
uniform vec2 uView,uParallax;
uniform vec4 uProtected[6];
varying vec3 vTint;
varying float vAlpha,vBright;
float ease(float x){x=clamp(x,0.,1.);return x*x*(3.-2.*x);}
void main(){
 float depth=aDust.x,phase=aDust.y;
 vec2 xy=position.xy+vec2(sin(uTime*.045+phase),cos(uTime*.035+phase))*.008*(1.-depth);
 xy+=uParallax*vec2(.013,.009)*(1.-depth);
 vec2 face=(xy-vec2(.5,.5))/vec2(.23,.40);
 float light=.07+.93*ease((dot(face,face)-.40)/1.1);
 for(int i=0;i<6;i++){
  vec2 delta=(xy-uProtected[i].xy)/uProtected[i].zw;
  if(abs(delta.x)<1.8&&abs(delta.y)<1.8)light*=.15+.85*ease((dot(delta,delta)-.40)/1.3);
 }
 vAlpha=aDust.z*light*(1.+sin(uTime*(.24+depth*.23)+phase)*.14)*uOpacity;
 vTint=aTint;vBright=aBright;
 float size=aDust.w*mix(1.,.85,uMobile);
 gl_Position=vec4((xy+vec2(size*.5)/uView)*vec2(2.,-2.)+vec2(-1.,1.),0.,1.);
 gl_PointSize=size*mix(1.,8.,aBright)*uDpr;
}`;
const fragmentShader=`
varying vec3 vTint;
varying float vAlpha,vBright;
// The source renderer applies acesFilm(x*.96*.7) then linearToSRGB.
// Undo that transfer for this background's approved sRGB particle contribution.
vec3 sceneRadiance(vec3 color){
 color=clamp(color,0.,.95);
 vec3 m=mix(color/12.92,pow((color+.055)/1.055,vec3(2.4)),step(vec3(.04045),color));
 vec3 a=2.51-2.43*m,b=.03-.59*m;
 return(-b+sqrt(b*b+4.*a*m*.14))/(2.*a*.672);
}
void main(){
 float energy=1.;
 if(vBright>.5){
  vec2 q=(gl_PointCoord-.5)*2.;float r=length(q);
  float glow=r<.15?mix(.733333,.4,r/.15):r<.45?mix(.4,.094118,(r-.15)/.30):mix(.094118,0.,clamp((r-.45)/.55,0.,1.));
  float core=1.-step(.125,max(abs(q.x),abs(q.y)));
  float cross=(1.-step(.038,abs(q.x)))*(1.-step(.375,abs(q.y)))+(1.-step(.038,abs(q.y)))*(1.-step(.375,abs(q.x)));
  energy=core+.7*glow+.22*cross;
 }
 if(vAlpha*energy<.003)discard;
 gl_FragColor=vec4(sceneRadiance(vTint*vAlpha*energy),1.);
}`;

function makeGeometry(THREE,count){
 const r=random(155921),gaussian=()=>Math.sqrt(-2*Math.log(Math.max(1e-8,r())))*Math.cos(6.283185*r());
 const positions=new Float32Array(count*3),data=new Float32Array(count*4),colors=new Float32Array(count*3),bright=new Float32Array(count);
 for(let i=0;i<count;i++){
  let x=r(),y=r(),alpha=.12+r()*.48,size=.55+r()*1.25;
  const depth=(i%3)/3+r()*.12,phase=r()*6.283185,color=Math.floor(r()*4);
  if(i>count*.08){const bank=i%3,center=[[.20,.27],[.77,.59],[.34,.84]][bank],along=gaussian()*.24,cross=gaussian()*.085;x=center[0]+along;y=center[1]+along*.65+cross+Math.sin(x*10+bank)*.045;alpha=.10+r()*.46;size=.55+r()*1.15;}
  if(i<Math.floor(count*.006)){bright[i]=1;size=1.7+r()*1.8;alpha=.50+r()*.38;}
  positions.set([x,y,0],i*3);data.set([depth,phase,alpha,size],i*4);colors.set(palette[color],i*3);
 }
 const geometry=new THREE.BufferGeometry();
 geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setAttribute('aDust',new THREE.BufferAttribute(data,4));geometry.setAttribute('aTint',new THREE.BufferAttribute(colors,3));geometry.setAttribute('aBright',new THREE.BufferAttribute(bright,1));
 return geometry;
}

export function createCosmicDust({THREE,scene,renderer}){
 const uniforms={uTime:{value:0},uDpr:{value:1},uMobile:{value:0},uOpacity:{value:0},uView:{value:new THREE.Vector2(1,1)},uParallax:{value:new THREE.Vector2()},uProtected:{value:Array.from({length:6},()=>new THREE.Vector4(-10,-10,.01,.01))}};
 const material=new THREE.ShaderMaterial({uniforms,vertexShader,fragmentShader,transparent:true,premultipliedAlpha:true,blending:THREE.AdditiveBlending,depthTest:false,depthWrite:false,toneMapped:false});
 const empty=new THREE.BufferGeometry(),points=new THREE.Points(empty,material),cache=new Map();points.name='amy-cosmic-dust-C';points.frustumCulled=false;points.renderOrder=-11;points.visible=false;scene.add(points);
 let width=1,height=1,opacity=0;
 return {points,
  resize(w,h){width=w;height=h;const count=w<=700?5200:14500;if(!cache.has(count))cache.set(count,makeGeometry(THREE,count));points.geometry=cache.get(count);uniforms.uView.value.set(w,h);uniforms.uMobile.value=w<=700?1:0;uniforms.uDpr.value=renderer.getPixelRatio();},
  update({phase,time,mode,reduced,pointer,pointerStrength=0,paused=false}){
   opacity=phase.active&&mode==='portrait'?phase.birth*phase.logoGather*(1-phase.outflow):0;uniforms.uOpacity.value=opacity;points.visible=opacity>0;
   uniforms.uTime.value=reduced?0:time;
   if(reduced||paused||pointerStrength<=0)uniforms.uParallax.value.set(0,0);
   else{uniforms.uParallax.value.x+=((pointer.x*2-1)*pointerStrength-uniforms.uParallax.value.x)*.06;uniforms.uParallax.value.y+=((1-pointer.y*2)*pointerStrength-uniforms.uParallax.value.y)*.06;}
   const anchors=Object.values(phase.anchors||{});
   for(let i=0;i<6;i++){const a=anchors[i];if(a)uniforms.uProtected.value[i].set(a.x/width,a.y/height,(a.width/2+24)/width,(a.height/2+28)/height);else uniforms.uProtected.value[i].set(-10,-10,.01,.01);}
  },
  stats(){return{profile:'C-cosmic-dust',count:points.geometry.attributes.position?.count||0,visible:points.visible,opacity,width,height,geometryBytes:[...cache.values()].reduce((sum,g)=>sum+Object.values(g.attributes).reduce((n,a)=>n+a.array.byteLength,0),0)};},
  dispose(){scene.remove(points);for(const geometry of cache.values())geometry.dispose();cache.clear();empty.dispose();material.dispose();}
 };
}
