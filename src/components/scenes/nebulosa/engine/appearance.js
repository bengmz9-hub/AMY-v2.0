// Photo chroma only. The original tone, sampling and geometric PRNG stay in main.js.
const Y = [0.2126, 0.7152, 0.0722];
const linearByte = Float32Array.from({length:256}, (_, byte) => {
  const c = byte / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
});
const smooth = (a,b,x) => {const t=Math.min(1,Math.max(0,(x-a)/(b-a)));return t*t*(3-2*t);};

export const photoAppearanceUniforms = {uPhotoChroma:{value:0.36}};

export function writePhotoChroma(rgba, pixel, output, offset) {
  const p = pixel * 4;
  const r=linearByte[rgba[p]], g=linearByte[rgba[p+1]], b=linearByte[rgba[p+2]];
  const luminance=r*Y[0]+g*Y[1]+b*Y[2];
  const confidence=smooth(0.004,0.035,luminance)*smooth(0.02,0.20,rgba[p+3]/254);
  let cr=1, cg=1, cb=1;
  if (luminance > 1e-6) {
    cr=1+(Math.min(2.5,Math.max(0.15,r/luminance))-1)*confidence;
    cg=1+(Math.min(2.5,Math.max(0.15,g/luminance))-1)*confidence;
    cb=1+(Math.min(2.5,Math.max(0.15,b/luminance))-1)*confidence;
    const normalizedY=cr*Y[0]+cg*Y[1]+cb*Y[2];
    cr/=normalizedY;cg/=normalizedY;cb/=normalizedY;
  }
  for(let k=0;k<4;k++){output[offset+k*3]=cr;output[offset+k*3+1]=cg;output[offset+k*3+2]=cb;}
}

export function attachPhotoAppearance(shader) {
  // Call once from the existing single onBeforeCompile, after the motion fragment hook.
  if(!shader.vertexShader.includes('#include <color_vertex>') ||
     !shader.fragmentShader.includes('outgoingLight *= vMotionLight;')) {
    throw new Error('Photo appearance integration markers missing');
  }
  Object.assign(shader.uniforms,photoAppearanceUniforms);
  shader.vertexShader=shader.vertexShader.replace('#include <common>', `
    #include <common>
    // BEGIN AMY_PHOTO_CHROMA_DECLARATION
    attribute vec3 aPhotoChroma;
    varying vec3 vPhotoChroma;
    // END AMY_PHOTO_CHROMA_DECLARATION
  `).replace('#include <color_vertex>', `
    #include <color_vertex>
    vPhotoChroma = aPhotoChroma;
  `);
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>', `
    #include <common>
    varying vec3 vPhotoChroma;
    uniform float uPhotoChroma;
  `).replace('outgoingLight *= vMotionLight;', `
    // BEGIN AMY_PHOTO_CHROMA_RECOMPOSITION
    float photoLitY = dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722));
    float photoHighlightColor = 1.0 - 0.65 * smoothstep(0.5, 1.8, photoLitY);
    outgoingLight = vec3(photoLitY) * mix(vec3(1.0), vPhotoChroma,
      uPhotoChroma * photoHighlightColor);
    // END AMY_PHOTO_CHROMA_RECOMPOSITION
    outgoingLight *= vMotionLight;
  `);
}
