import { sampleCloud } from './particle-dynamics.js';
import { cloudMappingGLSL } from './deep-space.js';
import { SOCIALS, portraitScaleForWidth } from './social-layout.js';
import { createPortraitPointField, portraitPointFieldGLSL } from './portrait-point-field.js';
import { createSocialHoverPulse } from './social-hover-pulse.js';

const GLYPHS = {
  kick: {url: new URL('./assets/kick-mark.svg', import.meta.url).href, color: 0x53fc18, seed: 0x4b49434b, count: 8000},
  twitch: {url: new URL('./assets/twitch-glitch-mask.svg', import.meta.url).href, color: 0x9146ff, seed: 0x54574954, count: 9200},
  youtube: {url: new URL('./assets/youtube-social.svg', import.meta.url).href, color: 0xff435a, seed: 0x59545542, count: 8800},
  starvios: {url: new URL('./assets/starvios-social.svg', import.meta.url).href, color: 0xff53a2, seed: 0x53544152, count: 6400},
  instagram: {url: new URL('./assets/instagram-social.svg', import.meta.url).href, color: 0xe66aaf, seed: 0x494e5354, count: 9200},
  tiktok: {url: new URL('./assets/tiktok-social.svg', import.meta.url).href, color: 0x80deda, seed: 0x544b544b, count: 9200}
};
// The host owns labels/real links and ordering; this module only draws their glyphs.
const DEFINITIONS = SOCIALS.map(({id}) => {
  if (!GLYPHS[id]) throw new Error('Social particle glyph missing: ' + id);
  return {id, ...GLYPHS[id]};
});
function random(seed) { let n = seed >>> 0; return () => { n ^= n << 13; n ^= n >>> 17; n ^= n << 5; return (n >>> 0) / 4294967296; }; }

const vertexShader = `
attribute vec4 aMotion;
attribute vec3 aCloud;
attribute float aEnergy;
uniform vec3 uTarget;
uniform float uSize,uTime,uGather,uRelease,uBirth,uOutflow,uReduced,uInteraction;
uniform float uGrainScale,uTilt;
uniform vec2 uNebulaAxis;
uniform float uCloudScale;
varying float vSeed,vVisibility,vFormation,vEnergy;
varying vec3 vDust;
${cloudMappingGLSL}
${portraitPointFieldGLSL}
void main(){
 float seed=aMotion.z, phase=seed*6.2831853;
 float gather=smoothstep(seed*.22,.78+seed*.22,uGather);
 float release=smoothstep(fract(seed*7.13+.17)*.18,.82+fract(seed*7.13+.17)*.18,uRelease);
 float formed=gather*(1.0-release);
 mat2 tilt=mat2(cos(uTilt),sin(uTilt),-sin(uTilt),cos(uTilt));
 vec3 target=uTarget+vec3(tilt*(aMotion.xy*uSize),0.0);
 vec3 corner=vec3(tilt*((position.xy-aMotion.xy)*uSize*uGrainScale),position.z*uSize);
 vec3 cloud=nebulaCloud(aCloud,uNebulaAxis)*mix(.28,1.0,uBirth);
 cloud.xy*=uCloudScale;
 cloud+=vec3(sin(uTime*.31+aCloud.z*2.1)*.055,cos(uTime*.27+aCloud.x*2.4)*.045,sin(uTime*.23+aCloud.y*2.3)*.070);
 vec3 entry=nebulaTransit(cloud,target,gather,seed,1.0);
 vec3 exitCloud=cloud;
 vec3 center=nebulaTransit(entry,exitCloud,release,seed,-.75);
 center.x+=uOutflow*5.2;
 center.y+=sin(uOutflow*3.14159265)*.14;
 if(gather>=1.0&&release<=0.0)center=target;
 vVisibility=uBirth*(1.0-uOutflow);
 if(uReduced>.5){center=target;vVisibility*=uGather*(1.0-uRelease);}
 else center=mix(center,applyPortraitPointField(center,seed),uInteraction*formed);
 vSeed=seed;vFormation=formed;vEnergy=aEnergy;
 vDust=nebulaDustColor(seed,aCloud.x*1.35+aCloud.z*.42);
 if(uReduced<.5)vVisibility*=mix(.24,1.0,formed);
 gl_Position=projectionMatrix*modelViewMatrix*vec4(center+corner*(uReduced>.5?1.0:mix(.28,1.0,formed)),1.0);
}`;
const fragmentShader = `
uniform vec3 uBrand;
varying float vSeed,vVisibility,vFormation,vEnergy;
varying vec3 vDust;
void main(){
 if(vVisibility<=0.0||vSeed>=vVisibility)discard;
 vec3 neutral=vec3(.76,.79,.85);
 vec3 tint=mix(neutral,uBrand,pow(vFormation,1.5)*.72);
 tint=mix(vDust,tint,vFormation);
 gl_FragColor=vec4(tint*vEnergy,1.0);
}`;

async function rasterize(url) {
  const image = new Image(); image.src = url; await image.decode();
  const canvas = document.createElement('canvas');
  const aspect = image.naturalHeight / image.naturalWidth;
  canvas.width = 512; canvas.height = Math.round(512 * aspect);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
  let left = canvas.width, top = canvas.height, right = 0, bottom = 0;
  for (let y=0;y<canvas.height;y++) for(let x=0;x<canvas.width;x++) if(data[(y*canvas.width+x)*4+3]>190){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}
  const width=right-left+1,height=bottom-top+1,guard=Math.max(2,Math.ceil(width*.007)),pixels=[];
  for(let y=top+guard;y<=bottom-guard;y++)for(let x=left+guard;x<=right-guard;x++){
    let solid=true;for(const dx of [-guard,0,guard])for(const dy of [-guard,0,guard])if(data[((y+dy)*canvas.width+x+dx)*4+3]<225)solid=false;
    if(solid)pixels.push(y*canvas.width+x);
  }
  if(!pixels.length)throw new Error('Máscara de plataforma vacía: '+url);
  return { pixels, sourceWidth:canvas.width, left,top,width,height };
}

function buildGeometry(THREE, mask, seed, count) {
  const rand=random(seed),positions=new Float32Array(count*12),motion=new Float32Array(count*16),cloud=new Float32Array(count*12),energy=new Float32Array(count*4),indices=new Uint32Array(count*6);
  for(let q=0;q<count;q++){
    const pixel=mask.pixels[Math.floor(rand()*mask.pixels.length)],py=Math.floor(pixel/mask.sourceWidth),px=pixel-py*mask.sourceWidth;
    const x=(px-mask.left+.5)/mask.width-.5,y=(mask.height*.5-(py-mask.top+.5))/mask.width;
    const radius=.0035+rand()*.0025,angle=rand()*Math.PI*2,cs=Math.cos(angle),sn=Math.sin(angle),phase=rand();
    const arm=(rand()-.5)*Math.PI*3.4,branch=rand()<.62?0:1,r=.15+rand()*.7;
    const gx=rand()+rand()+rand()+rand()-2,gy=rand()+rand()+rand()+rand()-2,gz=rand()+rand()+rand()+rand()-2;
    const c=[Math.sin(arm)*(.65+r*.45)+gx*.32+(branch?.35:-.2),Math.cos(arm*.73)*.42+gy*.30+(branch?.2:-.12),Math.sin(arm*.83+branch*1.7)*.75+gz*.38];
    const sourceCloud=sampleCloud(q,seed);
    const e=.19+rand()*.62;
    for(let k=0;k<4;k++){
      const v=q*4+k,lx=(k===0||k===3?-radius:radius),ly=k<2?-radius:radius;
      positions.set([x+lx*cs-ly*sn,y+lx*sn+ly*cs,0],v*3);motion.set([x,y,phase,0],v*4);cloud.set(sourceCloud,v*3);energy[v]=e;
    }
    indices.set([q*4,q*4+1,q*4+2,q*4,q*4+2,q*4+3],q*6);
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setAttribute('aMotion',new THREE.BufferAttribute(motion,4));geometry.setAttribute('aCloud',new THREE.BufferAttribute(cloud,3));geometry.setAttribute('aEnergy',new THREE.BufferAttribute(energy,1));geometry.setIndex(new THREE.BufferAttribute(indices,1));
  return geometry;
}

export async function createPlatformMeshes({ THREE, scene, camera }) {
  const groups=[];
  // Resolve every mask first; a failed image can retry without duplicate scene meshes.
  const masks=await Promise.all(DEFINITIONS.map(definition=>rasterize(definition.url)));
  for(const [index,definition]of DEFINITIONS.entries()){
    const mask=masks[index],field=createPortraitPointField(THREE);
    const uniforms={...field.uniforms,uTarget:{value:new THREE.Vector3()},uSize:{value:1},uTime:{value:0},uGather:{value:1},uRelease:{value:0},uBirth:{value:1},uOutflow:{value:0},uReduced:{value:0},uInteraction:{value:1},uPointerStrength:field.uniforms.uPointPointerStrength,uBrand:{value:new THREE.Color(definition.color)},uNebulaAxis:{value:new THREE.Vector2(.86,-.51)},uCloudScale:{value:1}};
    uniforms.uGrainScale={value:1.32};uniforms.uTilt={value:[-.18,.18,-.13,.13,.16,-.16][index]};
    const material=new THREE.ShaderMaterial({uniforms,vertexShader,fragmentShader,side:THREE.DoubleSide,depthWrite:true,depthTest:true});
    const mesh=new THREE.Mesh(buildGeometry(THREE,mask,definition.seed,definition.count),material);mesh.name='platform-'+definition.id;mesh.frustumCulled=false;scene.add(mesh);
    // Match the shader's tilted, enlarged corners without changing source arrays.
    const p=mesh.geometry.attributes.position.array,m=mesh.geometry.attributes.aMotion.array;
    const cs=Math.cos(uniforms.uTilt.value),sn=Math.sin(uniforms.uTilt.value),bounds={left:Infinity,right:-Infinity,bottom:Infinity,top:-Infinity};
    for(let v=0;v<p.length/3;v++){
      const x=m[v*4]+(p[v*3]-m[v*4])*uniforms.uGrainScale.value,y=m[v*4+1]+(p[v*3+1]-m[v*4+1])*uniforms.uGrainScale.value;
      const rx=x*cs-y*sn,ry=x*sn+y*cs;
      bounds.left=Math.min(bounds.left,rx);bounds.right=Math.max(bounds.right,rx);bounds.bottom=Math.min(bounds.bottom,ry);bounds.top=Math.max(bounds.top,ry);
    }
    const group={id:definition.id,mesh,uniforms,field,aspect:mask.height/mask.width,bounds};
    group.pulse=createSocialHoverPulse({THREE,scene,group});groups.push(group);
  }
  const projected=new THREE.Vector3();
  let viewportWidth=innerWidth,viewportHeight=innerHeight;
  const api={
    groups,
    layout({width,height,camera:nextCamera}){
      camera=nextCamera;viewportWidth=width;viewportHeight=height;
      const worldPerPixel=(camera.right-camera.left)/width;
      const glyphPixels=Math.min(122,Math.max(51,51+(width-320)*.23),height*.14);
      const photoHalf=portraitScaleForWidth(width)*width/(camera.right-camera.left);
      const radiusX=photoHalf+glyphPixels*.65+Math.min(100,Math.max(52,width*.065))+75;
      const orbit=[[-.78,-.58],[.96,-.72],[-1.08,-.05],[1.06,.08],[-.98,.62],[.88,.76]];
      const narrow=width<700&&height>width;
      const stagger=Math.max(.3,Math.min(1,(height-500)/344));
      const upper=Math.max(124,height*.5-photoHalf-glyphPixels*.5-65);
      const lower=Math.min(height-140,height*.5+photoHalf+glyphPixels*.5+45);
      const mobileX=[.20,.54,.83,.16,.49,.81],mobileY=[-38,-75,-22,38,72,18];
      for(const [index,group]of groups.entries()){
        const size=glyphPixels/Math.max(1,group.aspect)*worldPerPixel;
        const bounds=group.bounds,halfWidth=(bounds.right-bounds.left)*size/worldPerPixel*.5,halfHeight=(bounds.top-bounds.bottom)*size/worldPerPixel*.5;
        const safeX=Math.max(58,halfWidth+12);
        const px=Math.max(safeX,Math.min(width-safeX,narrow?width*mobileX[index]:width*.5+orbit[index][0]*radiusX));
        const py=Math.max(82+halfHeight,Math.min(height-64-30-halfHeight,narrow?(index<3?upper:lower)+mobileY[index]*stagger:height*.5-15+orbit[index][1]*height*.40));
        // Place the actual rotated bounds center; horizontal labels follow it.
        const x=camera.left+px/width*(camera.right-camera.left)-(bounds.left+bounds.right)*size*.5;
        const y=camera.top-py/height*(camera.top-camera.bottom)-(bounds.bottom+bounds.top)*size*.5;
        group.uniforms.uSize.value=size;group.uniforms.uTarget.value.set(x,y,.12);
        group.field.resize(camera,height);
        // AMY's exact field, in the glyph's spatial units: same force/seed response.
        group.uniforms.uPointFieldScale.value=glyphPixels*worldPerPixel;
        const blend=Math.max(0,Math.min(1,(width/height-.5)/.7));
        group.uniforms.uNebulaAxis.value.set(.48+.38*blend,-.88+.37*blend).normalize();
        group.uniforms.uCloudScale.value=camera.top/1.08;
      }
      // Reflect the final right-hand centers, including their viewport clamps.
      // Narrow screens retain the upper/lower arcs rather than overlapping pairs.
      if(!narrow){
        const reference=api.anchors();
        for(const [left,right]of [[0,1],[2,3],[4,5]]){
          const group=groups[left],anchor=reference[groups[right].id];
          const b=group.bounds,size=group.uniforms.uSize.value;
          group.uniforms.uTarget.value.set(
            camera.left+(width-anchor.x)/width*(camera.right-camera.left)-(b.left+b.right)*size*.5,
            camera.top-anchor.y/height*(camera.top-camera.bottom)-(b.bottom+b.top)*size*.5,.12);
        }
      }
      const anchors=api.anchors();
      for(const group of groups)group.pulse.layout(anchors[group.id],width,height,worldPerPixel);
    },
    anchors(){const anchors={};for(const group of groups){const b=group.bounds,size=group.uniforms.uSize.value;projected.copy(group.uniforms.uTarget.value);projected.x+=(b.left+b.right)*size*.5;projected.y+=(b.bottom+b.top)*size*.5;projected.project(camera);const pixels=size/(camera.right-camera.left)*viewportWidth;anchors[group.id]={x:(projected.x+1)*viewportWidth*.5,y:(1-projected.y)*viewportHeight*.5,width:(b.right-b.left)*pixels,height:(b.top-b.bottom)*pixels};}return anchors;},
    update({phase,time,mode,reduced,pointer,pointerStrength,hoverActive=false,paused=false,pixelRatio=1}){
      for(const group of groups){const u=group.uniforms;u.uTime.value=time;u.uGather.value=phase.logoGather;u.uRelease.value=phase.logoRelease;u.uBirth.value=phase.birth;u.uOutflow.value=phase.outflow;u.uReduced.value=reduced?1:0;u.uInteraction.value=phase.interaction;group.field.update({pointer,strength:pointerStrength,enabled:mode==='portrait'&&phase.interaction>0,reduced});group.mesh.visible=mode==='portrait'&&phase.birth*(1-phase.outflow)>0;}
      const pulsePermitted=mode==='portrait'&&!reduced&&!paused&&phase.birth>=1&&phase.logoGather>=1&&phase.logoRelease<=0&&phase.outflow<=0&&phase.interaction>=.99;
      for(const group of groups)group.pulse.update(time,pulsePermitted,hoverActive,pointer,pixelRatio);
    }
  };
  return api;
}
