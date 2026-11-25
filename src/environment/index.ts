export { MountainEnvironment, type MountainEnvironmentOptions } from './MountainEnvironment';
export { createMountainSampler, SeededNoise, type TerrainSample } from './noise';
export {
  createMountainTerrainGeometry,
  createBoulderGeometry,
  createBoulderInstances,
} from './mountainGeometry';
export { createMountainMaterials } from './mountainMaterial';
export { createAtmosphereRig } from './atmosphere';
export { createTropicalOcean } from './ocean';
export { createCloudSystem } from './clouds';
export { createDistantIslands, DISTANT_ISLAND_SPECS } from './distantIslands';
export { loadMountainTextures, type MountainTextures, type PbrTextureSet } from './textures';
export {
  CAMERA_PRESETS,
  LIGHTING_PRESETS,
  QUALITY_SPECS,
  type CameraPreset,
  type LightingPreset,
  type LightingPresetId,
  type MountainConfig,
  type QualityPreset,
} from './types';
