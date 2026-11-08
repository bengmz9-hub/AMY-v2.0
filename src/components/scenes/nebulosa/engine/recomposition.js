import * as THREE from './vendor/build/three.module.js';
import desktop from './assets/recomposition-desktop.json';
import mobile from './assets/recomposition-mobile.json';
import { waitForGpu } from './wait-for-gpu.js';

const rand=index=>{const x=Math.sin(index*12.9898+78.233)*43758.5453;return x-Math.floor(x);};
const vertexShader=`
attribute vec2 aTarget;
attribute vec3 aColor;
attribute float aSeed;
uniform float uProgress,uMobile,uDpr;
varying vec3 vColor;
varying float vAlpha;
void main(){
 float p=uProgress,seed=aSeed;
 float dissolve=smoothstep(0.0,.17,p),q=smoothstep(.05,.94,p),curve=sin(q*3.141592653589793);
 float x=mix(position.x,aTarget.x,q)+curve*(aTarget.x<.5?-.10:.10)+sin(seed*6.28+q*6.28)*curve*.025;
 float y=mix(position.y,aTarget.y,q)+curve*(seed-.5)*.25;
 vAlpha=dissolve*(1.0-smoothstep(.80,1.0,p))*(.65+seed*.35);
 vColor=aColor;
 gl_Position=vec4(x*2.0-1.0,1.0-y*2.0,0.0,1.0);
 gl_PointSize=(.7+seed*.7)*mix(1.0,.9,uMobile)*uDpr;
}`;
const fragmentShader=`
varying vec3 vColor;
varying float vAlpha;
void main(){gl_FragColor=vec4(vColor*vAlpha,vAlpha);}
`;

function createGeometry(data){
  const count=data.particles.length*6,positions=new Float32Array(count*3);
  const colors=new Float32Array(count*3),seeds=new Float32Array(count);
  for(let i=0;i<data.particles.length;i++){
    const sample=data.particles[i];
    for(let j=0;j<6;j++){
      const index=i*6+j,angle=rand(index+31000)*Math.PI*2;
      const radius=j?Math.sqrt(rand(index+62000))*2.2:0;
      positions[index*3]=sample[0]+Math.cos(angle)*radius/data.width;
      positions[index*3+1]=sample[1]+Math.sin(angle)*radius/data.height;
      colors[index*3]=sample[2]/255;colors[index*3+1]=sample[3]/255;colors[index*3+2]=sample[4]/255;
      seeds[index]=rand(index);
    }
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
  geometry.setAttribute('aColor',new THREE.BufferAttribute(colors,3));
  geometry.setAttribute('aSeed',new THREE.BufferAttribute(seeds,1));
  geometry.setAttribute('aTarget',new THREE.BufferAttribute(new Float32Array(count*2),2).setUsage(THREE.DynamicDrawUsage));
  return geometry;
}

export function createRecomposition({canvas}){
  if(!canvas||typeof canvas.getContext!=='function')throw new TypeError('Recomposition requires a canvas.');
  const renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:false,premultipliedAlpha:true});
  renderer.setClearColor(0x000000,0);
  renderer.debug.onShaderError=(gl,program)=>{throw new Error('Recomposition shader failed: '+gl.getProgramInfoLog(program));};
  const uniforms={uProgress:{value:0},uMobile:{value:0},uDpr:{value:1}};
  const material=new THREE.ShaderMaterial({uniforms,vertexShader,fragmentShader,transparent:true,
    blending:THREE.AdditiveBlending,premultipliedAlpha:true,depthTest:false,depthWrite:false,toneMapped:false});
  const scene=new THREE.Scene(),camera=new THREE.Camera(),cache=new Map();
  const emptyGeometry=new THREE.BufferGeometry(),points=new THREE.Points(emptyGeometry,material);
  points.frustumCulled=false;points.visible=false;scene.add(points);
  let width=0,height=0,progress=0,reduced=false,disposed=false,dirty=true,dpr=1;
  let preparation=null,prepared=false,warmupDraws=0;
  function assertActive(){if(disposed)throw new Error('Recomposition has been disposed.');}
  function draw(){
    points.visible=width>0&&height>0&&progress>0&&progress<1&&!reduced;
    if(points.visible)renderer.render(scene,camera);
    else{renderer.info.reset();renderer.clear();}
    dirty=false;
  }
  const api={
    prepareStartup(){
      assertActive();
      if(prepared)return Promise.resolve(api.stats());
      if(!preparation)preparation=(async()=>{
        if(!width||!height||!points.geometry.attributes.position)throw new Error('Recomposition has not been measured.');
        renderer.compile(scene,camera);
        const priorVisible=points.visible,priorProgress=uniforms.uProgress.value;
        try{
          points.visible=true;uniforms.uProgress.value=.5;
          renderer.render(scene,camera);warmupDraws++;
        }finally{
          points.visible=priorVisible;uniforms.uProgress.value=priorProgress;
          if(priorVisible)renderer.render(scene,camera);else{renderer.info.reset();renderer.clear();}
        }
        await waitForGpu(renderer);assertActive();prepared=true;return api.stats();
      })().catch(error=>{preparation=null;throw error;});
      return preparation;
    },
    resize(nextWidth,nextHeight,targets){
      assertActive();
      if(!Number.isFinite(nextWidth)||!Number.isFinite(nextHeight)||nextWidth<=0||nextHeight<=0)throw new RangeError('Recomposition dimensions must be positive finite numbers.');
      if(!Array.isArray(targets)||!targets.length||targets.some(t=>!Array.isArray(t)||!Number.isFinite(t[0])||!Number.isFinite(t[1])))throw new TypeError('Recomposition requires nonempty finite XY targets.');
      const isMobile=nextWidth<=700,key=isMobile?'mobile':'desktop',nextDpr=Math.min(globalThis.devicePixelRatio||1,2);
      if(!cache.has(key))cache.set(key,createGeometry(isMobile?mobile:desktop));
      const geometry=cache.get(key),target=geometry.attributes.aTarget;
      let changed=false;
      for(let i=0;i<target.count;i++){
        const xy=targets[i%targets.length],x=Math.fround(xy[0]),y=Math.fround(xy[1]);
        if(target.array[i*2]!==x||target.array[i*2+1]!==y){target.array[i*2]=x;target.array[i*2+1]=y;changed=true;}
      }
      if(changed)target.needsUpdate=true;
      dirty=dirty||changed||points.geometry!==geometry||width!==nextWidth||height!==nextHeight||dpr!==nextDpr;
      if(width!==nextWidth||height!==nextHeight||dpr!==nextDpr){
        width=nextWidth;height=nextHeight;dpr=nextDpr;renderer.setPixelRatio(dpr);renderer.setSize(width,height,false);
      }
      points.geometry=geometry;uniforms.uMobile.value=isMobile?1:0;uniforms.uDpr.value=dpr;
      if(dirty)draw();
    },
    update(nextProgress,nextReduced=false){
      assertActive();
      if(!Number.isFinite(nextProgress))throw new TypeError('Recomposition progress must be finite.');
      const next=Math.max(0,Math.min(1,nextProgress)),reduce=Boolean(nextReduced);
      if(!dirty&&next===progress&&reduce===reduced)return;
      progress=next;reduced=reduce;uniforms.uProgress.value=progress;draw();
    },
    stats(){return{progress,pointCount:points.geometry.attributes.position?.count||0,visible:points.visible,width,height,prepared,warmupDraws,render:{calls:renderer.info.render.calls}};},
    dispose(){
      if(disposed)return;
      disposed=true;points.visible=false;renderer.clear();
      for(const geometry of cache.values())geometry.dispose();cache.clear();
      emptyGeometry.dispose();material.dispose();renderer.dispose();if(!canvas.isConnected)renderer.forceContextLoss();
    }
  };
  return api;
}
