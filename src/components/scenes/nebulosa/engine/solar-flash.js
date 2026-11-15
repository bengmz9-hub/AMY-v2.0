// Fusion: the source grains converge in staggered arcs while a compact soft
// kiss lights the fusion nexus. The original solar field and completed portrait
// remain exact endpoints.
const START = .28, PEAK = .40, END = .53;
function smooth(a, b, value) {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
export function solarFlashAmount(gather = 0) {
  if (!Number.isFinite(gather) || gather <= START || gather >= END) return 0;
  return smooth(START, PEAK, gather) * (1 - smooth(PEAK, END, gather));
}
export function solarCollapseAmount(gather = 0) {
  return Number.isFinite(gather) ? smooth(.02, .34, gather) * .42 : 0;
}
// Fusion has no charged core or shock ring; both envelopes stay at rest.
export function solarChargeAmount() { return 0; }
export function solarBurstAmount() { return 0; }
// The yellow source field hands its light to the converging grains.
export function solarYellowRetention(gather = 0) {
  return Number.isFinite(gather) ? 1 - smooth(.10, .40, gather) : 1;
}
// Mean grain of the staggered GPU morph (order key .5).
export function solarPortraitGather(gather = 0) {
  if (!Number.isFinite(gather)) return 0;
  const morph = Math.max(0, Math.min(1, (gather - .06) / .54));
  const t = Math.max(0, Math.min(1, (morph - .19) / .62));
  return t * t * (3 - 2 * t);
}
export const solarFlashGLSL = `
float solarFlashAmount(float gather) {
  return smoothstep(${START}, ${PEAK}, gather) * (1.0 - smoothstep(${PEAK}, ${END}, gather));
}
float solarPortraitGather(float gather, float orderKey) {
  float morph = clamp((gather - .06) / .54, 0.0, 1.0);
  float delay = clamp(orderKey, 0.0, 1.0) * .38;
  float m = clamp((morph - delay) / .62, 0.0, 1.0);
  return m * m * (3.0 - 2.0 * m);
}
`;
