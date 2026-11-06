// Native physical scroll schedule. One H is the measured viewport height.
// Nebulosa keeps the formed portrait and socials visible for twice Hero's dwell.
export const HERO_DWELL_FALLBACK = .65;
export function createNebulosaLayout(dwell = HERO_DWELL_FALLBACK) {
  const hold = Number.isFinite(Number(dwell)) && Number(dwell) > 0 ? Number(dwell) : HERO_DWELL_FALLBACK;
  const lengths = { flowHold: hold, flow: 1.15, black: .18, birth: .90, field: .55,
    amy: 1.15, logos: .90, labelsIn: .32, hold: hold * 2, labelsOut: .28, logosOut: .70, amyOut: .80, outflow: .70 };
  let cursor = 0;
  const distances = Object.fromEntries(Object.entries(lengths).map(([key, length]) => {
    const range = [cursor, cursor + length]; cursor += length; return [key, Object.freeze(range)];
  }));
  const ranges = Object.fromEntries(Object.entries(distances).map(([key, range]) => [key, Object.freeze(range.map(value => value / cursor))]));
  return Object.freeze({ dwell: hold, totalH: cursor, distances: Object.freeze(distances), ranges: Object.freeze(ranges) });
}
export const NEBULOSA_LAYOUT = createNebulosaLayout();
export const NEBULOSA_TIMING = NEBULOSA_LAYOUT.ranges;
const clamp = x => Math.max(0, Math.min(1, x));
function ramp([a, b], p) { const t = clamp((p - a) / (b - a)); return t * t * (3 - 2 * t); }
export function evaluateNebulosa(progress = 0, layout = NEBULOSA_LAYOUT) {
  const p = clamp(Number.isFinite(Number(progress)) ? Number(progress) : 0), t = layout.ranges;
  const phase = Object.keys(t).find(key => p < t[key][1]) || 'outflow';
  const amyRelease = ramp(t.amyOut, p), logoRelease = ramp(t.logosOut, p);
  const logoForm = ramp(t.logos, p) * (1 - logoRelease);
  return { progress: p, phase, flowExit: ramp(t.flow, p), birth: ramp(t.birth, p),
    amyGather: ramp(t.amy, p), amyRelease, amyForm: ramp(t.amy, p) * (1 - amyRelease),
    logoGather: ramp(t.logos, p), logoRelease, logoForm, kickForm: logoForm, twitchForm: logoForm,
    labelsOpacity: ramp(t.labelsIn, p) * (1 - ramp(t.labelsOut, p)), outflow: ramp(t.outflow, p),
    interaction: ramp(t.labelsIn, p) * (1 - ramp(t.labelsOut, p)) };
}
