import type { MountainConfig } from './types';

// Fast, deterministic 2D & 3D gradient noise with zero runtime heap allocations
const GRAD2 = [
  [1, 1], [-1, 1], [1, -1], [-1, -1],
  [1, 0], [-1, 0], [0, 1], [0, -1],
];

const GRAD3 = [
  [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
  [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
  [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1],
];

function createPermutation(seed: number): Uint8Array {
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;

  let s = seed >>> 0;
  for (let i = 255; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = s % (i + 1);
    const tmp = p[i];
    p[i] = p[j];
    p[j] = tmp;
  }

  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  return perm;
}

const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;

const F3 = 1 / 3;
const G3 = 1 / 6;

export class SeededNoise {
  private readonly perm: Uint8Array;

  constructor(seed: number) {
    this.perm = createPermutation(seed);
  }

  simplex2D(xin: number, yin: number): number {
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const X0 = i - t;
    const Y0 = j - t;
    const x0 = xin - X0;
    const y0 = yin - Y0;

    const i1 = x0 > y0 ? 1 : 0;
    const j1 = x0 > y0 ? 0 : 1;

    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2;
    const y2 = y0 - 1 + 2 * G2;

    const ii = i & 255;
    const jj = j & 255;
    const gi0 = this.perm[ii + this.perm[jj]] & 7;
    const gi1 = this.perm[ii + i1 + this.perm[jj + j1]] & 7;
    const gi2 = this.perm[ii + 1 + this.perm[jj + 1]] & 7;

    let n0 = 0;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 > 0) {
      t0 *= t0;
      const g = GRAD2[gi0];
      n0 = t0 * t0 * (g[0] * x0 + g[1] * y0);
    }

    let n1 = 0;
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 > 0) {
      t1 *= t1;
      const g = GRAD2[gi1];
      n1 = t1 * t1 * (g[0] * x1 + g[1] * y1);
    }

    let n2 = 0;
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 > 0) {
      t2 *= t2;
      const g = GRAD2[gi2];
      n2 = t2 * t2 * (g[0] * x2 + g[1] * y2);
    }

    return 70 * (n0 + n1 + n2);
  }

  simplex3D(xin: number, yin: number, zin: number): number {
    const s = (xin + yin + zin) * F3;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const k = Math.floor(zin + s);
    const t = (i + j + k) * G3;
    const x0 = xin - (i - t);
    const y0 = yin - (j - t);
    const z0 = zin - (k - t);

    let i1: number, j1: number, k1: number;
    let i2: number, j2: number, k2: number;

    if (x0 >= y0) {
      if (y0 >= z0) {
        i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0;
      } else if (x0 >= z0) {
        i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1;
      } else {
        i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1;
      }
    } else {
      if (y0 < z0) {
        i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1;
      } else if (x0 < z0) {
        i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1;
      } else {
        i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0;
      }
    }

    const x1 = x0 - i1 + G3;
    const y1 = y0 - j1 + G3;
    const z1 = z0 - k1 + G3;
    const x2 = x0 - i2 + 2 * G3;
    const y2 = y0 - j2 + 2 * G3;
    const z2 = z0 - k2 + 2 * G3;
    const x3 = x0 - 1 + 3 * G3;
    const y3 = y0 - 1 + 3 * G3;
    const z3 = z0 - 1 + 3 * G3;

    const ii = i & 255;
    const jj = j & 255;
    const kk = k & 255;

    const gi0 = this.perm[ii + this.perm[jj + this.perm[kk]]] % 12;
    const gi1 = this.perm[ii + i1 + this.perm[jj + j1 + this.perm[kk + k1]]] % 12;
    const gi2 = this.perm[ii + i2 + this.perm[jj + j2 + this.perm[kk + k2]]] % 12;
    const gi3 = this.perm[ii + 1 + this.perm[jj + 1 + this.perm[kk + 1]]] % 12;

    let n0 = 0;
    let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
    if (t0 > 0) {
      t0 *= t0;
      const g = GRAD3[gi0];
      n0 = t0 * t0 * (g[0] * x0 + g[1] * y0 + g[2] * z0);
    }

    let n1 = 0;
    let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
    if (t1 > 0) {
      t1 *= t1;
      const g = GRAD3[gi1];
      n1 = t1 * t1 * (g[0] * x1 + g[1] * y1 + g[2] * z1);
    }

    let n2 = 0;
    let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
    if (t2 > 0) {
      t2 *= t2;
      const g = GRAD3[gi2];
      n2 = t2 * t2 * (g[0] * x2 + g[1] * y2 + g[2] * z2);
    }

    let n3 = 0;
    let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
    if (t3 > 0) {
      t3 *= t3;
      const g = GRAD3[gi3];
      n3 = t3 * t3 * (g[0] * x3 + g[1] * y3 + g[2] * z3);
    }

    return 32 * (n0 + n1 + n2 + n3);
  }

  fbm2D(x: number, y: number, octaves = 5, lacunarity = 2.03, gain = 0.5): number {
    let sum = 0;
    let amp = 0.5;
    let px = x;
    let py = y;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += amp * this.simplex2D(px, py);
      norm += amp;
      // Rotate 36.87 deg (0.8, 0.6) per octave to break up axial ridge repetition
      const rx = (px * 0.8 - py * 0.6) * lacunarity;
      const ry = (px * 0.6 + py * 0.8) * lacunarity;
      px = rx;
      py = ry;
      amp *= gain;
    }
    return sum / norm;
  }

  /**
   * Soft-crested hybrid ridged multifractal with per-octave domain rotation:
   * Produces natural volcanic/tropical mountain spines without needle spikes or grid patterns.
   */
  ridgedMultifractal2D(
    x: number,
    y: number,
    octaves = 5,
    lacunarity = 2.08,
    gain = 0.5,
  ): number {
    let sum = 0;
    let amp = 0.5;
    let weight = 1;
    let maxPossible = 0;
    let px = x;
    let py = y;

    for (let i = 0; i < octaves; i++) {
      const raw = this.simplex2D(px, py);
      const softAbs = Math.sqrt(raw * raw + 0.036) - Math.sqrt(0.036);
      let signal = Math.max(0, 1 - softAbs * 1.06);
      signal = Math.pow(signal, 1.42);
      signal *= weight;
      weight = Math.max(0.16, Math.min(1, signal * 1.42));
      sum += signal * amp;
      maxPossible += amp;

      const rx = (px * 0.8 - py * 0.6) * lacunarity;
      const ry = (px * 0.6 + py * 0.8) * lacunarity;
      px = rx;
      py = ry;
      amp *= gain;
    }

    return sum / maxPossible;
  }
}

export interface TerrainSample {
  height: number;
  ridgeFactor: number;
  foothillFactor: number;
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Creates a deterministic, zero-dependency terrain height & geological sampler
 * representing a volcanic-alpine mountain island with eroded ridges, radial gullies,
 * cliff buttresses, green alluvial foothills, sandy coves, and a submerged lagoon shelf.
 */
export function createMountainSampler(config: Pick<MountainConfig, 'size' | 'maxHeight' | 'seed'>) {
  const noise = new SeededNoise(config.seed);
  const massifRadius = 590;
  const invRadius = 1 / massifRadius;

  function sample(x: number, z: number): TerrainSample {
    const nx = x * invRadius;
    const nz = z * invRadius;
    const baseRadial = Math.sqrt(nx * nx + nz * nz);
    const angle = Math.atan2(nz, nx);

    // Multi-frequency coastline warp: broad peninsulas/bays + angular rocky headland notches
    const coastBroad = noise.fbm2D(x * 0.0021 + 5.1, z * 0.0021 - 9.4, 3) * 0.175;
    const coastCove =
      Math.sin(angle * 3.0 + 0.85) * 0.055 +
      Math.cos(angle * 5.0 - 1.4) * 0.032;
    const coastDetail = noise.fbm2D(x * 0.0064 - 3.2, z * 0.0064 + 7.7, 3) * 0.058;
    const radialDist = baseRadial + coastBroad + coastCove + coastDetail;

    // Smooth island perimeter falloff + submerged lagoon shelf down to -14.5m below sea level (y = 0)
    const perimeterMask = 1 - smoothstep(0.41, 1.03, radialDist);
    const shelfDepth = -14.5 * smoothstep(0.83, 1.24, radialDist);
    if (perimeterMask <= 0.0001) {
      return { height: shelfDepth, ridgeFactor: 0, foothillFactor: 1 };
    }

    // Tectonic domain warp for winding ridge spines and non-repeating geological folds
    const warpScale = 0.0020;
    const warpLargeX = noise.fbm2D(x * warpScale + 11.3, z * warpScale - 4.7, 3) * 165;
    const warpLargeZ = noise.fbm2D(x * warpScale - 7.9, z * warpScale + 19.2, 3) * 165;
    const warpFineX = noise.fbm2D(x * 0.0052 + 2.4, z * 0.0052 - 6.1, 2) * 34;
    const warpFineZ = noise.fbm2D(x * 0.0052 - 5.3, z * 0.0052 + 8.8, 2) * 34;
    const wx = x + warpLargeX + warpFineX;
    const wz = z + warpLargeZ + warpFineZ;

    // Asymmetric ridge-aligned mountain lobes (main summit spine, east horn, north spur, west scarp)
    const u1 = wx * 0.86 - wz * 0.51;
    const v1 = wx * 0.51 + wz * 0.86;
    const peak1Dist = Math.hypot((u1 + 85) / 295, (v1 + 55) / 185);

    const u2 = wx * 0.72 + wz * 0.69;
    const v2 = -wx * 0.69 + wz * 0.72;
    const peak2Dist = Math.hypot((u2 - 145) / 255, (v2 + 15) / 170);

    const northSpurDist = Math.hypot((wx + 20) / 180, (wz + 225) / 165);
    const westCliffDist = Math.hypot((wx + 220) / 175, (wz - 115) / 195);
    const southHeadlandDist = Math.hypot((wx - 65) / 175, (wz - 260) / 150);
    const neHornDist = Math.hypot((wx - 210) / 155, (wz + 190) / 150);
    const swPeakDist = Math.hypot((wx + 235) / 160, (wz - 215) / 145);
    const seRidgeDist = Math.hypot((wx - 240) / 165, (wz - 185) / 145);

    const lobe1 = Math.exp(-peak1Dist * peak1Dist * 1.42) * 1.04;
    const lobe2 = Math.exp(-peak2Dist * peak2Dist * 1.50) * 0.91;
    const lobe3 = Math.exp(-northSpurDist * northSpurDist * 1.56) * 0.76;
    const lobe4 = Math.exp(-westCliffDist * westCliffDist * 1.60) * 0.70;
    const lobe5 = Math.exp(-southHeadlandDist * southHeadlandDist * 1.68) * 0.56;
    const lobe6 = Math.exp(-neHornDist * neHornDist * 1.65) * 0.78;
    const lobe7 = Math.exp(-swPeakDist * swPeakDist * 1.68) * 0.74;
    const lobe8 = Math.exp(-seRidgeDist * seRidgeDist * 1.72) * 0.68;

    // Winding central canyon pass carved between primary summits
    const canyonAxis = wx * 0.60 - wz * 0.80 + noise.fbm2D(wx * 0.003, wz * 0.003, 2) * 65;
    const passDist = Math.abs(canyonAxis / 128);
    const passLength = Math.hypot(wx / 360, wz / 360);
    const canyonCarve =
      (1 - smoothstep(0.0, 0.92, passDist)) * (1 - smoothstep(0.38, 1.02, passLength)) * 0.34;

    const macroEnvelope = Math.max(
      0.06,
      Math.min(
        1.20,
        Math.max(lobe1, lobe2, lobe3, lobe4, lobe5, lobe6, lobe7, lobe8) +
          (lobe1 + lobe2) * 0.12 -
          canyonCarve,
      ),
    );

    // Sharp mountain arêtes, broad rocky shoulders & radial erosion gullies/ribs
    const broadMass = noise.fbm2D(wx * 0.0024 - 4.1, wz * 0.0024 + 6.3, 4) * 0.5 + 0.5;
    const ridgePrimary = noise.ridgedMultifractal2D(wx * 0.0030 + 3.4, wz * 0.0030 - 2.1, 5, 2.09, 0.52);
    const ridgeFine = noise.ridgedMultifractal2D(wx * 0.0084 - 8.2, wz * 0.0084 + 5.6, 3, 2.06, 0.46);

    // Radial erosion channels radiating down mountain flanks (carves valleys & convex rock ribs)
    const dirAngle = Math.atan2(wz + 18, wx + 28);
    const radialRibNoise = noise.ridgedMultifractal2D(
      Math.cos(dirAngle) * 2.6 + baseRadial * 1.35,
      Math.sin(dirAngle) * 2.6 + baseRadial * 1.35,
      3,
      2.05,
      0.5,
    );
    const gullyMask = smoothstep(0.18, 0.62, macroEnvelope) * (1 - smoothstep(0.75, 1.05, macroEnvelope) * 0.35);
    const erosionRibs = (radialRibNoise - 0.42) * 0.17 * gullyMask;

    const baseUndulation = noise.fbm2D(x * 0.0040, z * 0.0040, 4) * 0.5 + 0.5;

    let elevationNorm =
      macroEnvelope * (0.28 + broadMass * 0.31 + ridgePrimary * 0.49) +
      macroEnvelope * ridgeFine * 0.095 +
      erosionRibs +
      baseUndulation * 0.062;

    // Geological strata benches & cliff escarpments on mid-to-upper rock slopes
    const strataBlend = smoothstep(0.26, 0.78, elevationNorm);
    const strataFreq = 9.0;
    const strataPhase = elevationNorm * strataFreq;
    const terraced =
      (Math.floor(strataPhase) + smoothstep(0.18, 0.86, strataPhase - Math.floor(strataPhase))) / strataFreq;
    elevationNorm = elevationNorm * (1 - strataBlend * 0.17) + terraced * (strataBlend * 0.17);

    // Smooth coastal alluvial apron & rolling foothills near sea level
    const apronCurve = Math.pow(Math.max(0, elevationNorm), 1.22);
    const foothillBase = smoothstep(0.0, 0.58, perimeterMask) * 0.075 * baseUndulation;

    const mountainHeight = (apronCurve * perimeterMask + foothillBase * perimeterMask) * config.maxHeight;
    const finalHeight = mountainHeight + shelfDepth;

    return {
      height: finalHeight,
      ridgeFactor: Math.min(1, (ridgePrimary * 0.68 + ridgeFine * 0.22 + broadMass * 0.2) * macroEnvelope * 1.15),
      foothillFactor: 1 - smoothstep(6, config.maxHeight * 0.4, Math.max(0, finalHeight)),
    };
  }

  return { sample };
}
