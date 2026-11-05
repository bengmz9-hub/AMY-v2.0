// A local grain finish over the existing photo shards. No sampling or PRNG calls.
export function addPortraitGrainUV(THREE, geometry) {
  const count = geometry.getAttribute('position').count;
  if (count % 4) throw new Error('Portrait softness requires four vertices per shard');
  const uv = new Float32Array(count * 2);
  for (let i = 0; i < count; i += 4) uv.set([0, 0, 1, 0, 1, 1, 0, 1], i * 2);
  geometry.setAttribute('aGrainUV', new THREE.BufferAttribute(uv, 2));
}

export function attachPortraitSoftness(shader) {
  if (!shader.vertexShader.includes('#include <project_vertex>') ||
      !shader.fragmentShader.includes('#include <opaque_fragment>') ||
      !shader.fragmentShader.includes('vPhotoChroma')) {
    throw new Error('Portrait softness requires the photo/motion shader');
  }
  shader.vertexShader = shader.vertexShader.replace('#include <common>', `
    #include <common>
    attribute vec2 aGrainUV;
    varying vec2 vGrainUV;
  `).replace('#include <project_vertex>', `
    vGrainUV = aGrainUV;
    // Expand only the footprint, never the photo destination or cloud endpoint.
    // Wider faint edges replace opaque corners without a screen blur pass.
    float grainForm = smoothstep(0.0, 1.0, vNebulaForm);
    transformed += (position - vec3(aMotion.xy, aCloud.w)) * .55 * grainForm;
    vec3 grainFlex = vec3(sin(uMotionTime * .91 + aMotion.z * 6.2831853),
      cos(uMotionTime * .73 + aMotion.z * 9.71),
      sin(uMotionTime * .62 + aMotion.z * 8.13));
    transformed += grainFlex * mix(.0018, .0045, aMotion.w) * uMotionAmount * grainForm;
    #include <project_vertex>
  `);
  shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `
    #include <common>
    varying vec2 vGrainUV;
  `).replace('#include <opaque_fragment>', `
    float grainForm = smoothstep(0.0, 1.0, vNebulaForm);
    float grainRadius = length(vGrainUV * 2.0 - 1.0);
    float grainCore = exp(-3.0 * grainRadius * grainRadius);
    float grainHalo = exp(-1.3 * grainRadius * grainRadius);
    float grainAlpha = (.68 * grainCore + .32 * grainHalo)
      * (1.0 - smoothstep(.72, 1.0, grainRadius));
    diffuseColor.a *= mix(1.0, grainAlpha, grainForm);
    if (diffuseColor.a < .002) discard;
    // Keep sampled RGB/chroma. Reduce directional flat-facet highlights locally.
    float grainPhotoY = dot(vColor.rgb, vec3(.2126, .7152, .0722));
    vec3 grainPhoto = grainPhotoY * 1.65 * mix(vec3(1.0), vPhotoChroma, uPhotoChroma);
    outgoingLight = mix(outgoingLight, grainPhoto * vMotionLight, .70 * grainForm);
    #include <opaque_fragment>
  `);
}
