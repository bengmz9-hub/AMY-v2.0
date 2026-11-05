const COUNT = 384, DURATION = .86;

const vertexShader = `
attribute float aSeed;
uniform vec3 uTarget;
uniform float uSize,uTilt,uPulseScale,uProgress,uPixelsPerWorld,uPixelRatio;
varying float vSeed,vFade;
void main(){
 float p=clamp(uProgress,0.0,1.0),seed=aSeed;
 mat2 tilt=mat2(cos(uTilt),sin(uTilt),-sin(uTilt),cos(uTilt));
 vec2 origin=tilt*(position.xy*uSize);
 vec2 direction=normalize(origin+vec2(cos(seed*6.2831853),sin(seed*6.2831853))*.00001);
 float travel=(1.0-pow(1.0-p,2.0))*.31*uPulseScale*(.72+.28*seed);
 vec2 drift=vec2(-direction.y,direction.x)*sin(p*3.14159265)*.035*uPulseScale*(fract(seed*17.13)-.5);
 vec3 center=uTarget+vec3(origin+direction*travel+drift,0.0);
 gl_Position=projectionMatrix*modelViewMatrix*vec4(center,1.0);
 float sizeScale=clamp(uPulseScale*uPixelsPerWorld/100.0,.65,1.2);
 gl_PointSize=max(1.0,(1.8+fract(seed*13.7)*1.3)*sizeScale*mix(1.0,.75,p))*uPixelRatio;
 vSeed=seed;vFade=smoothstep(0.0,.06,p)*(1.0-smoothstep(.12,1.0,p));
}`;
const fragmentShader = `
uniform vec3 uBrand;
varying float vSeed,vFade;
void main(){
 float radius=dot(gl_PointCoord*2.0-1.0,gl_PointCoord*2.0-1.0);
 if(radius>=1.0||vFade<=0.0)discard;
 float alpha=pow(1.0-radius,1.6)*vFade*(.50+.40*vSeed);
 gl_FragColor=vec4(mix(uBrand,vec3(1.0),.20),alpha);
}`;

export function createSocialHoverPulse({THREE,scene,group}) {
  const source=group.mesh.geometry.attributes.aMotion,sourceCount=source.count/4;
  const positions=new Float32Array(COUNT*3),seeds=new Float32Array(COUNT);
  for(let i=0;i<COUNT;i++){
    const v=Math.floor(i*sourceCount/COUNT)*4;
    positions.set([source.getX(v),source.getY(v),0],i*3);seeds[i]=source.getZ(v);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
  geometry.setAttribute('aSeed',new THREE.BufferAttribute(seeds,1));
  const uniforms={uTarget:group.uniforms.uTarget,uSize:group.uniforms.uSize,uTilt:group.uniforms.uTilt,
    uBrand:group.uniforms.uBrand,uPulseScale:group.uniforms.uPointFieldScale,
    uProgress:{value:1},uPixelsPerWorld:{value:1},uPixelRatio:{value:1}};
  const material=new THREE.ShaderMaterial({uniforms,vertexShader,fragmentShader,transparent:true,
    blending:THREE.AdditiveBlending,depthTest:false,depthWrite:false});
  const points=new THREE.Points(geometry,material);points.name='social-hover-pulse-'+group.id;
  points.frustumCulled=false;points.visible=false;points.renderOrder=2;scene.add(points);
  let left=0,right=0,top=0,bottom=0,width=1,height=1;
  let hovered=false,emissions=0,startedAt=-Infinity,progress=1,lastTime=-Infinity;
  function clear(){hovered=false;startedAt=-Infinity;progress=1;uniforms.uProgress.value=1;points.visible=false;}
  return {points,
    layout(anchor,viewWidth,viewHeight,worldPerPixel){
      left=anchor.x-anchor.width*.5-18;right=anchor.x+anchor.width*.5+18;
      top=anchor.y-anchor.height*.5-18;bottom=anchor.y+anchor.height*.5+36;
      width=viewWidth;height=viewHeight;uniforms.uPixelsPerWorld.value=1/worldPerPixel;
    },
    update(time,permitted,hoverActive,pointer,pixelRatio){
      uniforms.uPixelRatio.value=Number.isFinite(pixelRatio)&&pixelRatio>0?pixelRatio:1;
      if(!permitted||!Number.isFinite(time)||time<lastTime){clear();lastTime=Number.isFinite(time)?time:-Infinity;return;}
      lastTime=time;
      const valid=pointer&&Number.isFinite(pointer.x)&&Number.isFinite(pointer.y);
      const x=valid?pointer.x*width:-Infinity,y=valid?(1-pointer.y)*height:-Infinity;
      const inside=Boolean(hoverActive&&valid&&x>=left&&x<=right&&y>=top&&y<=bottom);
      if(inside&&!hovered){startedAt=time;emissions++;}
      hovered=inside;progress=Math.max(0,Math.min(1,(time-startedAt)/DURATION));
      uniforms.uProgress.value=progress;points.visible=progress<1;
    },
    stats(){return {count:COUNT,hovered,emissions,progress,visible:points.visible};}
  };
}
