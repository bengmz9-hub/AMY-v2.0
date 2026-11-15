import {seededRandom, glowSprite} from '../shared.js';

export const LOOP_SECONDS = 16;

const SCENE_SEED = 0x434e4542; // 'CNEB'
const DESKTOP_MAX = 1400;
const MOBILE_MAX = 450;
const TWO_PI = Math.PI * 2;
const PHASE_QUANT = 1048576; // 2^20 sub-cycle precision (~15us) for exact float periodicity

// Palette: restrained Hielo ice-blue family with deep cryo-azure, indigo shadow folds, and subtle rose ionization grains
const PALETTE_RGB = [
  [190, 234, 255], // 0: crisp pale ice-blue condensed grain core
  [117, 195, 255], // 1: signature Hielo ice-cyan nebula dust
  [70, 142, 236],  // 2: deep cryo-azure volumetric cloud dust
  [104, 112, 232], // 3: restrained deep indigo fold accent
  [232, 138, 186], // 4: restrained rose-ion micro-grain accent on void rims
];

// Volumetric 2D/3D cloud mass banks (billowing cellular lobes, biased toward open right and peripheral space)
const NEBULA_BANKS = [
  {
    // Bank 0: Great Upper-Right Cryo-Nebula Mass
    weight: 0.28,
    cx: 0.74,
    cy: 0.27,
    rx: 0.22,
    ry: 0.185,
    angle: -0.22,
    breathFreq: 0.22,
    bankPhase: 0.35,
    zMin: 0.30,
    zMax: 1.0,
    pocketCount: 8,
  },
  {
    // Bank 1: Lower-Right Deep Indigo & Ice Cloud Mass
    weight: 0.26,
    cx: 0.74,
    cy: 0.71,
    rx: 0.23,
    ry: 0.19,
    angle: 0.26,
    breathFreq: 0.19,
    bankPhase: 2.1,
    zMin: 0.26,
    zMax: 0.96,
    pocketCount: 8,
  },
  {
    // Bank 2: Center-Right Billowing Pillar & Bridge Bank
    weight: 0.19,
    cx: 0.54,
    cy: 0.36,
    rx: 0.195,
    ry: 0.195,
    angle: 0.42,
    breathFreq: 0.24,
    bankPhase: 3.6,
    zMin: 0.22,
    zMax: 0.88,
    pocketCount: 6,
  },
  {
    // Bank 3: Lower-Center & Peripheral Horizon Dust Bank
    weight: 0.15,
    cx: 0.45,
    cy: 0.77,
    rx: 0.225,
    ry: 0.145,
    angle: -0.17,
    breathFreq: 0.17,
    bankPhase: 4.85,
    zMin: 0.18,
    zMax: 0.78,
    pocketCount: 6,
  },
  {
    // Bank 4: Upper-Left to Upper-Mid Peripheral Framing Cloud Bank
    weight: 0.12,
    cx: 0.26,
    cy: 0.21,
    rx: 0.215,
    ry: 0.15,
    angle: -0.18,
    breathFreq: 0.16,
    bankPhase: 1.25,
    zMin: 0.15,
    zMax: 0.72,
    pocketCount: 5,
  },
];

// Organic dark voids (Bok globules, dust rifts & negative-space cavities) carved through the nebula banks
const DARK_VOIDS = [
  // Void 0: Primary diagonal dark dust rift separating upper-right and lower-right cloud masses
  { cx: 0.72, cy: 0.48, rx: 0.132, ry: 0.064, angle: -0.30, phase: 0.75, rimBoost: 1.36 },
  // Void 1: Sculpted dark Bok cavity inside the upper-right nebula bank
  { cx: 0.81, cy: 0.24, rx: 0.064, ry: 0.050, angle: 0.46, phase: 2.15, rimBoost: 1.40 },
  // Void 2: Deep abyssal dark pocket inside the lower-right nebula bank
  { cx: 0.76, cy: 0.73, rx: 0.070, ry: 0.052, angle: 0.24, phase: 4.05, rimBoost: 1.34 },
  // Void 3: Mid-center dark dust lane between pillar bank and lower horizon bank
  { cx: 0.51, cy: 0.58, rx: 0.086, ry: 0.060, angle: 0.35, phase: 5.2, rimBoost: 1.26 },
  // Void 4: Left-center quiet negative-space cavity protecting hero reading zone
  { cx: 0.26, cy: 0.52, rx: 0.165, ry: 0.155, angle: -0.12, phase: 1.4, rimBoost: 1.20 },
];

function carveOrganicVoids(u, v, rand) {
  let rimFactor = 1.0;
  for (let i = 0; i < DARK_VOIDS.length; i++) {
    const vd = DARK_VOIDS[i];
    const dx = u - vd.cx;
    const dy = v - vd.cy;
    const cosA = Math.cos(vd.angle);
    const sinA = Math.sin(vd.angle);
    const lx = (dx * cosA + dy * sinA) / vd.rx;
    const ly = (-dx * sinA + dy * cosA) / vd.ry;
    const dist = Math.hypot(lx, ly);
    const theta = Math.atan2(ly, lx);
    // Multi-harmonic boundary warp so every dark void has an organic, irregular nebula silhouette
    const warp =
      1.0 +
      0.19 * Math.sin(theta * 3 + vd.phase) +
      0.12 * Math.cos(theta * 5 - vd.phase * 0.7) +
      0.07 * Math.sin(theta * 7 + vd.phase * 1.3);
    const normDist = dist / warp;

    if (normDist < 1.0) {
      // Allow a few ultra-faint deep dust grains near the outer margin so void edges feather naturally
      if (normDist > 0.58 && rand() < 0.11) {
        rimFactor = Math.min(rimFactor, 0.42 + 0.38 * normDist);
        continue;
      }
      // Condense displaced grains with a feathered radial profile along the irregular rim of the dark void
      const targetNorm = (0.93 + 0.46 * Math.pow(rand(), 1.35)) * warp;
      const safeAngle = dist > 1e-4 ? theta + (rand() - 0.5) * 0.26 : rand() * TWO_PI;
      const nlx = Math.cos(safeAngle) * targetNorm * vd.rx;
      const nly = Math.sin(safeAngle) * targetNorm * vd.ry;
      u = vd.cx + (nlx * cosA - nly * sinA);
      v = vd.cy + (nlx * sinA + nly * cosA);
      rimFactor = Math.max(rimFactor, vd.rimBoost * (0.88 + 0.24 * rand()));
    } else if (normDist < 1.30) {
      rimFactor = Math.max(rimFactor, 1.0 + (1.30 - normDist) * 1.1);
    }
  }
  return {
    u: Math.max(0.02, Math.min(0.98, u)),
    v: Math.max(0.03, Math.min(0.97, v)),
    rimFactor,
  };
}

export default function createScene() {
  let particles = [];
  let sprites = null;
  let disposed = false;

  function ensureSprites() {
    if (sprites) return sprites;
    if (typeof document === 'undefined') return null;
    sprites = PALETTE_RGB.map((rgb) => glowSprite(rgb));
    return sprites;
  }

  function resize({ width, height, mobile } = {}) {
    disposed = false;
    const w = Math.max(1, Number(width) || 1280);
    const h = Math.max(1, Number(height) || 720);
    const isMobile = typeof mobile === 'boolean' ? mobile : w < 768;
    const totalCount = isMobile ? MOBILE_MAX : DESKTOP_MAX;
    const minDim = Math.min(w, h);
    const scaleFactor = Math.max(0.76, Math.min(1.32, minDim / 840));

    ensureSprites();
    const rand = seededRandom(SCENE_SEED);
    const nextParticles = new Array(totalCount);

    // Precompute volumetric cloud pockets within each nebula bank
    const bankPockets = NEBULA_BANKS.map((bank) => {
      const pockets = [];
      const cosA = Math.cos(bank.angle);
      const sinA = Math.sin(bank.angle);
      for (let k = 0; k < bank.pocketCount; k++) {
        const frac = (k + 0.5) / bank.pocketCount;
        const theta = frac * TWO_PI + (rand() - 0.5) * 0.82;
        const radial = 0.18 + 0.66 * Math.sqrt(rand());
        const lx = Math.cos(theta) * radial * bank.rx * 0.80;
        const ly = Math.sin(theta) * radial * bank.ry * 0.80;
        const px = bank.cx + (lx * cosA - ly * sinA);
        const py = bank.cy + (lx * sinA + ly * cosA);
        const pocketAngle = bank.angle + (rand() - 0.5) * 0.95;
        pockets.push({
          x: px,
          y: py,
          cosP: Math.cos(pocketAngle),
          sinP: Math.sin(pocketAngle),
          spreadX: bank.rx * (0.38 + 0.38 * rand()),
          spreadY: bank.ry * (0.36 + 0.38 * rand()),
          turbulencePhase: rand() * TWO_PI,
        });
      }
      return pockets;
    });

    for (let i = 0; i < totalCount; i++) {
      // Select nebula bank by weight
      const rBank = rand();
      let bankIndex = 0;
      let acc = 0;
      for (let b = 0; b < NEBULA_BANKS.length; b++) {
        acc += NEBULA_BANKS[b].weight;
        if (rBank <= acc || b === NEBULA_BANKS.length - 1) {
          bankIndex = b;
          break;
        }
      }
      const bank = NEBULA_BANKS[bankIndex];
      const pockets = bankPockets[bankIndex];
      const pocket = pockets[Math.floor(rand() * pockets.length)];

      // 3-sample centered distribution for soft volumetric cloud density falloff
      const gX = (rand() + rand() + rand() - 1.5) * 0.96;
      const gY = (rand() + rand() + rand() - 1.5) * 0.96;

      // 2D curl-like harmonic domain warp so cloud banks have billowing nebula edges
      const warpPhase = gX * 2.7 + gY * 2.3 + pocket.turbulencePhase;
      const localX = (gX + 0.24 * Math.sin(warpPhase)) * pocket.spreadX;
      const localY = (gY + 0.24 * Math.cos(warpPhase * 1.15)) * pocket.spreadY;

      const rawU = pocket.x + (localX * pocket.cosP - localY * pocket.sinP);
      const rawV = pocket.y + (localX * pocket.sinP + localY * pocket.cosP);

      // Carve organic dark voids and condense rims
      const sculpted = carveOrganicVoids(rawU, rawV, rand);
      const u = sculpted.u;
      const v = sculpted.v;
      const rimFactor = sculpted.rimFactor;

      // Multi-plane depth within the bank [0.15, 1.0]
      const depth = bank.zMin + (bank.zMax - bank.zMin) * Math.pow(rand(), 0.82);

      // Granular hierarchy:
      // Tier 0 (55%): crisp visible fine dust grains (bright granular cores with soft halos)
      // Tier 1 (31%): medium granular cloud knots (builds filamentary granular texture)
      // Tier 2 (14%): soft volumetric condensation mist (strictly inside cloud banks, low alpha)
      const rTier = rand();
      let tier = 0;
      if (rTier > 0.86) {
        tier = 2;
      } else if (rTier > 0.55) {
        tier = 1;
      }

      // Color selection: ice-blue family with restrained indigo folds and tiny rose ionization accents
      const rColor = rand();
      let colorIndex = 1; // Hielo ice-cyan
      if (tier === 0 && rimFactor > 1.05 && rColor < 0.12) {
        colorIndex = 4; // Tiny rose ionization grain on active void rims (~5%)
      } else if (tier === 0 && rColor < 0.55) {
        colorIndex = 0; // Crisp pale ice-blue condensed grain
      } else if (rColor > 0.80) {
        colorIndex = 3; // Restrained deep indigo fold accent
      } else if (rColor > 0.56 || tier === 2) {
        colorIndex = 2; // Deep cryo-azure nebula mist
      }

      // Calibrate sprite draw radius & alpha (glowSprite core is ~0.22*r)
      let baseRadius;
      let baseAlpha;
      if (tier === 0) {
        // Fine visible particles: r in [2.5, 6.0] -> bright core diameter ~1.1px to 2.6px
        const rFine = rand();
        baseRadius = (2.5 + 3.5 * Math.pow(rFine, 1.32)) * (0.78 + 0.30 * depth) * scaleFactor;
        if (colorIndex === 4) {
          baseRadius = Math.min(baseRadius, 4.6 * scaleFactor); // Keep rose grains delicate
        }
        baseAlpha = Math.min(0.88, (0.40 + 0.44 * rand()) * (0.72 + 0.28 * depth) * Math.min(1.26, rimFactor));
      } else if (tier === 1) {
        // Medium granular cloud knots: r in [7.0, 15.8] -> granular cluster body
        baseRadius = (7.0 + 8.8 * rand()) * (0.80 + 0.26 * depth) * scaleFactor;
        baseAlpha = Math.min(0.34, (0.125 + 0.155 * rand()) * (0.68 + 0.32 * depth) * Math.min(1.22, rimFactor));
      } else {
        // Soft volumetric sub-veil: r in [16.0, 28.5] -> gentle atmospheric cohesion inside banks
        baseRadius = (16.0 + 12.5 * rand()) * (0.82 + 0.24 * depth) * scaleFactor;
        baseAlpha = (0.050 + 0.064 * rand()) * (0.65 + 0.35 * depth) * Math.min(1.12, rimFactor);
      }

      // Radial vector from local pocket/bank center for slow volumetric breathing
      const bdx = u - (pocket.x * 0.65 + bank.cx * 0.35);
      const bdy = v - (pocket.y * 0.65 + bank.cy * 0.35);
      const bDist = Math.hypot(bdx, bdy) || 1;
      const radialDirX = bdx / bDist;
      const radialDirY = bdy / bDist;

      // Slow internal breathing and curl turbulence parameters (time in SECONDS)
      const breathAmp = (3.6 + 8.4 * depth) * scaleFactor * (0.65 + 0.6 * rand());
      const driftAmpX = (3.0 + 7.2 * depth) * scaleFactor * (0.6 + 0.7 * rand());
      const driftAmpY = (2.6 + 6.4 * depth) * scaleFactor * (0.6 + 0.7 * rand());
      const curlAmp = (2.5 + 5.8 * depth) * scaleFactor;

      // Preserve exact seeded RNG call order while mapping frequencies to integer harmonics of LOOP_SECONDS
      const breathHarmonic = rand() < 0.76 ? 1 : 2;
      const bankPhase = bank.bankPhase + bDist * 4.5 + rand() * 0.9;
      const driftHarmonicX = rand() < 0.72 ? 1 : 2;
      const driftHarmonicY = rand() < 0.74 ? 1 : 2;
      const phaseX = rand() * TWO_PI;
      const phaseY = rand() * TWO_PI;
      const spatialPhase = (u * 5.2 + v * 4.6) + rand() * 1.2;
      const lumHarmonic = rand() < 0.68 ? 1 : 2;
      const lumPhase = (u * 3.8 - v * 3.1) + rand() * TWO_PI;

      nextParticles[i] = {
        x: u * w,
        y: v * h,
        depth,
        tier,
        colorIndex,
        baseRadius,
        baseAlpha,
        radialDirX,
        radialDirY,
        tangentX: -radialDirY,
        tangentY: radialDirX,
        breathHarmonic,
        bankPhase,
        breathAmp,
        driftHarmonicX,
        driftHarmonicY,
        curlHarmonic: 1,
        phaseX,
        phaseY,
        spatialPhase,
        driftAmpX,
        driftAmpY,
        curlAmp,
        lumHarmonic,
        lumPhase,
        sizeBreathAmp: tier === 0 ? 0.09 : 0.13,
      };
    }

    // Sort back-to-front once in resize: Tier 2 soft veils -> Tier 1 granular knots -> Tier 0 crisp fine grains
    nextParticles.sort((a, b) => {
      if (b.tier !== a.tier) return b.tier - a.tier;
      return a.depth - b.depth;
    });

    particles = nextParticles;
  }

  function draw(context, frame = {}) {
    if (!context || disposed) return;
    const width = Number(frame.width) || 0;
    const height = Number(frame.height) || 0;
    if (particles.length === 0 && width > 0 && height > 0) {
      resize({ width, height, mobile: width < 768 });
    }
    const activeSprites = ensureSprites();
    if (!activeSprites || particles.length === 0) return;

    const isReduced = Boolean(frame.reduced);
    const rawTime = isReduced ? 0 : (Number.isFinite(frame.time) ? frame.time : 0);
    const rawCycle = (((rawTime % LOOP_SECONDS) + LOOP_SECONDS) % LOOP_SECONDS) / LOOP_SECONDS;
    const cyclePhase = (Math.round(rawCycle * PHASE_QUANT) & (PHASE_QUANT - 1)) / PHASE_QUANT;
    const omega = cyclePhase * TWO_PI;

    const prevAlpha = context.globalAlpha;
    const prevComp = context.globalCompositeOperation;
    let currentComp = prevComp;

    const len = particles.length;
    for (let i = 0; i < len; i++) {
      const p = particles[i];
      const sprite = activeSprites[p.colorIndex] || activeSprites[1];
      if (!sprite) continue;

      const desiredComp = p.tier === 0 ? 'lighter' : 'source-over';
      if (desiredComp !== currentComp) {
        context.globalCompositeOperation = desiredComp;
        currentComp = desiredComp;
      }

      // Autonomous seamless loop via integer harmonics of wrapped cycle phase (pointer ignored)
      const breath = Math.sin(omega * p.breathHarmonic + p.bankPhase);
      const waveX = Math.sin(omega * p.driftHarmonicX + p.phaseX);
      const waveY = Math.cos(omega * p.driftHarmonicY + p.phaseY);
      const curlWave = Math.sin(omega * p.curlHarmonic + p.spatialPhase);

      const x =
        p.x +
        p.radialDirX * breath * p.breathAmp +
        waveX * p.driftAmpX +
        p.tangentX * curlWave * p.curlAmp;

      const y =
        p.y +
        p.radialDirY * breath * p.breathAmp +
        waveY * p.driftAmpY +
        p.tangentY * curlWave * p.curlAmp;

      const lumMod = 0.82 + 0.18 * Math.sin(omega * p.lumHarmonic + p.lumPhase);
      const sizeMod = 1.0 + p.sizeBreathAmp * Math.cos(omega * p.breathHarmonic + p.lumPhase);
      const r = p.baseRadius * sizeMod;
      const alpha = p.baseAlpha * lumMod;

      if (alpha <= 0.002 || r <= 0.2) continue;

      context.globalAlpha = alpha;
      context.drawImage(sprite, x - r, y - r, r * 2, r * 2);
    }

    context.globalAlpha = prevAlpha;
    context.globalCompositeOperation = prevComp;
  }

  function dispose() {
    disposed = true;
    particles = [];
    if (sprites) {
      for (let i = 0; i < sprites.length; i++) {
        if (sprites[i]) {
          sprites[i].width = 0;
          sprites[i].height = 0;
        }
      }
      sprites = null;
    }
  }

  return {
    resize,
    draw,
    dispose,
    get particleCount() {
      return particles.length;
    },
  };
}
