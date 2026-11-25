export type QualityPreset = 'low' | 'balanced' | 'high';

export type LightingPresetId = 'morning' | 'midday' | 'golden' | 'overcast';

export interface MountainConfig {
  /** Total square world extent of the primary island terrain mesh */
  size: number;
  /** Peak elevation scale above sea level (y = 0) */
  maxHeight: number;
  /** Deterministic seed for mountain ridges, beaches, and rock placement */
  seed: number;
  /** Quality preset balancing mesh density, clouds, ocean segments, and shadows */
  quality: QualityPreset;
}

export interface QualitySpec {
  label: string;
  segments: number;
  lodSegments: number;
  lodDistance: number;
  boulderCount: number;
  cloudCount: number;
  oceanRadialSegs: number;
  oceanRings: number;
  shadowMapSize: number;
  maxAnisotropy: number;
  maxPixelRatio: number;
  castPropShadows: boolean;
}

export const QUALITY_SPECS: Record<QualityPreset, QualitySpec> = {
  low: {
    label: 'Low (Low-End GPU)',
    segments: 72,
    lodSegments: 36,
    lodDistance: 360,
    boulderCount: 10,
    cloudCount: 10,
    oceanRadialSegs: 40,
    oceanRings: 16,
    shadowMapSize: 512,
    maxAnisotropy: 1,
    maxPixelRatio: 1,
    castPropShadows: false,
  },
  balanced: {
    label: 'Balanced',
    segments: 108,
    lodSegments: 52,
    lodDistance: 440,
    boulderCount: 18,
    cloudCount: 16,
    oceanRadialSegs: 56,
    oceanRings: 24,
    shadowMapSize: 1024,
    maxAnisotropy: 4,
    maxPixelRatio: 1.2,
    castPropShadows: false,
  },
  high: {
    label: 'High Detail',
    segments: 148,
    lodSegments: 72,
    lodDistance: 520,
    boulderCount: 28,
    cloudCount: 24,
    oceanRadialSegs: 76,
    oceanRings: 32,
    shadowMapSize: 1024,
    maxAnisotropy: 6,
    maxPixelRatio: 1.5,
    castPropShadows: false,
  },
};

export interface LightingPreset {
  id: LightingPresetId;
  label: string;
  sunElevation: number;
  sunAzimuth: number;
  sunColor: number;
  sunIntensity: number;
  hemiSkyColor: number;
  hemiGroundColor: number;
  hemiIntensity: number;
  fillColor: number;
  fillIntensity: number;
  skyZenith: number;
  skyHorizon: number;
  fogColor: number;
  fogDensity: number;
  exposure: number;
  cloudTint: number;
}

export const LIGHTING_PRESETS: Record<LightingPresetId, LightingPreset> = {
  morning: {
    id: 'morning',
    label: 'Tropical Morning',
    sunElevation: 31,
    sunAzimuth: 58,
    sunColor: 0xfff2d6,
    sunIntensity: 3.05,
    hemiSkyColor: 0x8ac8f5,
    hemiGroundColor: 0x2f4528,
    hemiIntensity: 0.68,
    fillColor: 0x76b5e8,
    fillIntensity: 0.34,
    skyZenith: 0x1b6bc2,
    skyHorizon: 0xb7dcf2,
    fogColor: 0xb7dcf2,
    fogDensity: 0.00017,
    exposure: 1.02,
    cloudTint: 0xffffff,
  },
  midday: {
    id: 'midday',
    label: 'High Noon',
    sunElevation: 56,
    sunAzimuth: 132,
    sunColor: 0xfffaf2,
    sunIntensity: 3.05,
    hemiSkyColor: 0x99d4ff,
    hemiGroundColor: 0x3b5234,
    hemiIntensity: 0.76,
    fillColor: 0x82c2ed,
    fillIntensity: 0.34,
    skyZenith: 0x1664bf,
    skyHorizon: 0xbee3f7,
    fogColor: 0xbee3f7,
    fogDensity: 0.00015,
    exposure: 0.98,
    cloudTint: 0xffffff,
  },
  golden: {
    id: 'golden',
    label: 'Golden Hour',
    sunElevation: 13,
    sunAzimuth: 235,
    sunColor: 0xffb36b,
    sunIntensity: 3.15,
    hemiSkyColor: 0x8da7d4,
    hemiGroundColor: 0x3e3226,
    hemiIntensity: 0.62,
    fillColor: 0x6f92bf,
    fillIntensity: 0.42,
    skyZenith: 0x26487a,
    skyHorizon: 0xe3ac82,
    fogColor: 0xe3ac82,
    fogDensity: 0.00022,
    exposure: 1.05,
    cloudTint: 0xffe4c7,
  },
  overcast: {
    id: 'overcast',
    label: 'Trade Winds',
    sunElevation: 38,
    sunAzimuth: 105,
    sunColor: 0xdce6ee,
    sunIntensity: 1.85,
    hemiSkyColor: 0x9cb4c7,
    hemiGroundColor: 0x323f34,
    hemiIntensity: 0.9,
    fillColor: 0x8ca5b8,
    fillIntensity: 0.4,
    skyZenith: 0x4d6b85,
    skyHorizon: 0xa9bac7,
    fogColor: 0xa9bac7,
    fogDensity: 0.00029,
    exposure: 0.98,
    cloudTint: 0xd9e1e8,
  },
};

export interface CameraPreset {
  id: string;
  label: string;
  position: [number, number, number];
  target: [number, number, number];
}

export const CAMERA_PRESETS: CameraPreset[] = [
  {
    id: 'overview',
    label: 'Island Overview',
    position: [450, 260, 490],
    target: [0, 52, 0],
  },
  {
    id: 'coastal',
    label: 'Sea-Level Coast',
    position: [610, 20, 395],
    target: [-20, 62, -10],
  },
  {
    id: 'aerial',
    label: 'Aircraft Flyover',
    position: [720, 330, 720],
    target: [0, 58, 0],
  },
  {
    id: 'ridge',
    label: 'North Ridge',
    position: [-235, 215, -285],
    target: [15, 102, 10],
  },
  {
    id: 'canyon',
    label: 'Canyon Pass',
    position: [215, 118, -145],
    target: [-35, 68, 45],
  },
  {
    id: 'cliffs',
    label: 'Cliff Face',
    position: [-295, 112, 225],
    target: [-55, 86, 25],
  },
  {
    id: 'base',
    label: 'Beach & Foothills',
    position: [410, 58, 250],
    target: [55, 42, 15],
  },
];
