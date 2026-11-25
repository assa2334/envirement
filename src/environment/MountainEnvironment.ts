import * as THREE from 'three';
import { createAtmosphereRig, type AtmosphereController } from './atmosphere';
import { createCloudSystem, type CloudSystemController } from './clouds';
import { createDistantIslands, type DistantIslandRig } from './distantIslands';
import {
  createBoulderGeometry,
  createBoulderInstances,
  createMountainTerrainGeometry,
  type TerrainSampler,
} from './mountainGeometry';
import {
  createMountainMaterials,
  type MountainMaterialHandles,
} from './mountainMaterial';
import { createMountainSampler } from './noise';
import { createTropicalOcean, type TropicalOceanController } from './ocean';
import { loadMountainTextures, type MountainTextures } from './textures';
import {
  QUALITY_SPECS,
  type LightingPresetId,
  type MountainConfig,
  type QualityPreset,
} from './types';

export interface MountainEnvironmentOptions {
  size?: number;
  maxHeight?: number;
  seed?: number;
  quality?: QualityPreset;
  lightingPreset?: LightingPresetId;
  isSoftwareGl?: boolean;
}

/**
 * Standalone, framework-agnostic Three.js Tropical Mountain Island Environment.
 * Includes LOD island terrain, lush green foothills & rocky cliffs, realistic beaches,
 * distant satellite islands, animated tropical ocean, and moving 3D clouds.
 */
export class MountainEnvironment {
  public readonly group: THREE.Group;
  public readonly config: MountainConfig;
  public readonly atmosphere: AtmosphereController;

  private readonly renderer: THREE.WebGLRenderer;
  private readonly sampler: TerrainSampler;
  private readonly textures: MountainTextures;
  private readonly materials: MountainMaterialHandles;
  private readonly boulderGeo: THREE.BufferGeometry;
  private readonly isSoftwareGl: boolean;

  private terrainLod: THREE.LOD;
  private terrainMeshHigh: THREE.Mesh;
  private terrainMeshLow: THREE.Mesh;
  private bouldersMesh: THREE.InstancedMesh;
  private distantIslands: DistantIslandRig;
  private ocean: TropicalOceanController;
  private clouds: CloudSystemController;

  private constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    config: MountainConfig,
    sampler: TerrainSampler,
    textures: MountainTextures,
    materials: MountainMaterialHandles,
    atmosphere: AtmosphereController,
    initialLighting: LightingPresetId,
    isSoftwareGl: boolean,
  ) {
    this.renderer = renderer;
    this.config = config;
    this.sampler = sampler;
    this.textures = textures;
    this.materials = materials;
    this.atmosphere = atmosphere;
    this.isSoftwareGl = isSoftwareGl;

    this.group = new THREE.Group();
    this.group.name = 'TropicalMountainIslandEnvironment';

    const spec = QUALITY_SPECS[config.quality];
    const terrainGeoHigh = createMountainTerrainGeometry(config, sampler, spec.segments);
    const terrainGeoLow = createMountainTerrainGeometry(config, sampler, spec.lodSegments);

    this.terrainMeshHigh = new THREE.Mesh(terrainGeoHigh, materials.terrainMaterial);
    this.terrainMeshHigh.name = 'IslandMountainTerrainLOD0';
    this.terrainMeshHigh.castShadow = !isSoftwareGl;
    this.terrainMeshHigh.receiveShadow = true;
    this.terrainMeshHigh.frustumCulled = true;

    this.terrainMeshLow = new THREE.Mesh(terrainGeoLow, materials.terrainMaterial);
    this.terrainMeshLow.name = 'IslandMountainTerrainLOD1';
    this.terrainMeshLow.castShadow = false;
    this.terrainMeshLow.receiveShadow = true;
    this.terrainMeshLow.frustumCulled = true;

    this.terrainLod = new THREE.LOD();
    this.terrainLod.name = 'IslandMountainTerrainLOD';
    this.terrainLod.addLevel(this.terrainMeshHigh, 0);
    this.terrainLod.addLevel(this.terrainMeshLow, spec.lodDistance);

    this.boulderGeo = createBoulderGeometry(config.seed);
    this.bouldersMesh = createBoulderInstances(
      config,
      sampler,
      this.boulderGeo,
      materials.boulderMaterial,
      isSoftwareGl,
    );

    this.distantIslands = createDistantIslands(config.seed, materials.terrainMaterial);
    this.ocean = createTropicalOcean(sampler, config.size, config.quality, initialLighting);
    this.ocean.setSunAngles(atmosphere.sunDirection);
    this.clouds = createCloudSystem(config.seed, config.quality, initialLighting);
    this.clouds.setSunAngles(atmosphere.sunDirection);

    this.group.add(this.terrainLod);
    this.group.add(this.bouldersMesh);
    this.group.add(this.distantIslands.group);
    this.group.add(this.ocean.mesh);
    this.group.add(this.clouds.group);

    scene.add(this.group);
  }

  static async create(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    options: MountainEnvironmentOptions = {},
  ): Promise<MountainEnvironment> {
    const config: MountainConfig = {
      size: options.size ?? 1600,
      maxHeight: options.maxHeight ?? 235,
      seed: options.seed ?? 4217,
      quality: options.quality ?? 'balanced',
    };
    const isSoftwareGl = options.isSoftwareGl ?? false;
    const lightingPreset = options.lightingPreset ?? 'morning';

    const sampler = createMountainSampler(config);
    const textures = await loadMountainTextures(
      renderer,
      QUALITY_SPECS[config.quality].maxAnisotropy,
    );
    const materials = createMountainMaterials(textures, config);
    const atmosphere = createAtmosphereRig(
      renderer,
      scene,
      lightingPreset,
      config.quality,
      isSoftwareGl,
    );

    return new MountainEnvironment(
      renderer,
      scene,
      config,
      sampler,
      textures,
      materials,
      atmosphere,
      lightingPreset,
      isSoftwareGl,
    );
  }

  /**
   * Advances animated ocean waves and moving 3D sky clouds.
   */
  public update(_dt: number, elapsedSeconds: number): void {
    this.ocean.update(elapsedSeconds);
    this.clouds.update(elapsedSeconds);
  }

  public getHeightAt(x: number, z: number): number {
    return this.sampler.sample(x, z).height;
  }

  public setLightingPreset(id: LightingPresetId): void {
    this.atmosphere.applyPreset(id);
    this.ocean.setLighting(id);
    this.ocean.setSunAngles(this.atmosphere.sunDirection);
    this.clouds.setLighting(id);
    this.clouds.setSunAngles(this.atmosphere.sunDirection);
  }

  public setSunAngles(elevationDeg: number, azimuthDeg: number): void {
    this.atmosphere.setSunAngles(elevationDeg, azimuthDeg);
    this.ocean.setSunAngles(this.atmosphere.sunDirection);
    this.clouds.setSunAngles(this.atmosphere.sunDirection);
  }

  public setFogDensity(density: number): void {
    this.atmosphere.setFogDensity(density);
  }

  public setWireframe(enabled: boolean): void {
    this.materials.setWireframe(enabled);
    this.ocean.setWireframe(enabled);
  }

  public setSlopeInspect(enabled: boolean): void {
    this.materials.setSlopeInspect(enabled);
  }

  public setQuality(quality: QualityPreset): void {
    if (this.config.quality === quality) return;
    this.config.quality = quality;

    const spec = QUALITY_SPECS[quality];
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, spec.maxPixelRatio),
    );
    const maxAniso = Math.min(
      spec.maxAnisotropy,
      Math.max(1, this.renderer.capabilities.getMaxAnisotropy()),
    );
    for (const tex of [
      this.textures.cliff.diffuse,
      this.textures.cliff.normal,
      this.textures.cliff.roughness,
      this.textures.base.diffuse,
      this.textures.base.normal,
      this.textures.base.roughness,
    ]) {
      tex.anisotropy = maxAniso;
      tex.needsUpdate = true;
    }

    const oldHigh = this.terrainMeshHigh.geometry;
    const oldLow = this.terrainMeshLow.geometry;
    this.terrainMeshHigh.geometry = createMountainTerrainGeometry(this.config, this.sampler, spec.segments);
    this.terrainMeshLow.geometry = createMountainTerrainGeometry(this.config, this.sampler, spec.lodSegments);
    if (this.terrainLod.levels[1]) {
      this.terrainLod.levels[1].distance = spec.lodDistance;
    }
    oldHigh.dispose();
    oldLow.dispose();

    this.group.remove(this.bouldersMesh);
    this.bouldersMesh.dispose();
    this.bouldersMesh = createBoulderInstances(
      this.config,
      this.sampler,
      this.boulderGeo,
      this.materials.boulderMaterial,
      this.isSoftwareGl,
    );
    this.group.add(this.bouldersMesh);

    this.ocean.setQuality(quality);
    this.clouds.setQuality(quality);
    this.atmosphere.updateShadowQuality(quality, this.isSoftwareGl);
  }

  /**
   * Exports terrain, rocks, and distant islands as a binary .glb asset.
   */
  public async exportGLB(): Promise<Blob> {
    const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
    return new Promise((resolve, reject) => {
      const exportGroup = new THREE.Group();
      exportGroup.name = this.group.name;
      exportGroup.add(this.terrainMeshHigh.clone());
      exportGroup.add(this.bouldersMesh);
      exportGroup.add(this.distantIslands.group);

      const restoreParents = () => {
        this.group.add(this.bouldersMesh);
        this.group.add(this.distantIslands.group);
      };

      const exporter = new GLTFExporter();
      exporter.parse(
        exportGroup,
        (result) => {
          restoreParents();
          if (result instanceof ArrayBuffer) {
            resolve(new Blob([result], { type: 'model/gltf-binary' }));
          } else {
            const json = JSON.stringify(result);
            resolve(new Blob([json], { type: 'model/gltf+json' }));
          }
        },
        (error) => {
          restoreParents();
          reject(error);
        },
        { binary: true },
      );
    });
  }

  public dispose(): void {
    this.terrainMeshHigh.geometry.dispose();
    this.terrainMeshLow.geometry.dispose();
    this.boulderGeo.dispose();
    this.bouldersMesh.dispose();
    this.distantIslands.dispose();
    this.ocean.dispose();
    this.clouds.dispose();
    this.materials.dispose();
    this.textures.dispose();
    this.atmosphere.dispose();
    this.group.clear();
  }
}
