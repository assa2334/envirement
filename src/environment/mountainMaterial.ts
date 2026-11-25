import * as THREE from 'three';
import type { MountainTextures } from './textures';
import type { MountainConfig } from './types';

export interface MountainMaterialHandles {
  terrainMaterial: THREE.MeshStandardMaterial;
  boulderMaterial: THREE.MeshStandardMaterial;
  setSlopeInspect: (enabled: boolean) => void;
  setWireframe: (enabled: boolean) => void;
  dispose: () => void;
}

/**
 * Creates a PBR MeshStandardMaterial extended via onBeforeCompile to support:
 * 1. World-space triplanar projection on steep cliffs & rock faces (zero UV stretch).
 * 2. Lush, rich green foothills, valleys, and green vegetation patches across suitable mountain slopes.
 * 3. Natural organic soil/scree transition into textured rocky peaks and sandy/basalt coastlines.
 */
export function createMountainMaterials(
  textures: MountainTextures,
  config: Pick<MountainConfig, 'maxHeight'>,
): MountainMaterialHandles {
  const uniforms = {
    uBaseDiffuse: { value: textures.base.diffuse },
    uBaseNormal: { value: textures.base.normal },
    uBaseRoughness: { value: textures.base.roughness },
    uCliffDiffuse: { value: textures.cliff.diffuse },
    uCliffNormal: { value: textures.cliff.normal },
    uCliffRoughness: { value: textures.cliff.roughness },
    uCliffScale: { value: 0.025 },
    uBaseScale: { value: 0.082 },
    uMaxHeight: { value: config.maxHeight },
    uSlopeInspect: { value: 0 },
  };

  const terrainMaterial = new THREE.MeshStandardMaterial({
    name: 'TropicalIslandTerrainPBR',
    color: 0xffffff,
    map: textures.cliff.diffuse,
    normalMap: textures.cliff.normal,
    normalScale: new THREE.Vector2(1.3, 1.3),
    roughnessMap: textures.cliff.roughness,
    roughness: 0.94,
    metalness: 0.02,
    vertexColors: true,
    envMapIntensity: 0.34,
  });

  terrainMaterial.customProgramCacheKey = () => 'mountain-triplanar-real-grass-pbr-v9';

  terrainMaterial.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vTerrainWorldPos;
varying vec3 vTerrainWorldNormal;`,
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
vec4 terrainWorldPos4 = modelMatrix * vec4( transformed, 1.0 );
vTerrainWorldPos = terrainWorldPos4.xyz;
vTerrainWorldNormal = normalize( mat3( modelMatrix ) * objectNormal );`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform sampler2D uBaseDiffuse;
uniform sampler2D uBaseNormal;
uniform sampler2D uBaseRoughness;
uniform sampler2D uCliffDiffuse;
uniform sampler2D uCliffNormal;
uniform sampler2D uCliffRoughness;
uniform float uCliffScale;
uniform float uBaseScale;
uniform float uMaxHeight;
uniform float uSlopeInspect;
varying vec3 vTerrainWorldPos;
varying vec3 vTerrainWorldNormal;

float terrainHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float terrainValueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(terrainHash(i + vec2(0.0, 0.0)), terrainHash(i + vec2(1.0, 0.0)), u.x),
    mix(terrainHash(i + vec2(0.0, 1.0)), terrainHash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

vec3 sampleTriplanarColor(sampler2D tex, vec3 wp, vec3 w, float scale) {
  vec3 cx = texture2D(tex, wp.zy * scale).rgb;
  vec3 cy = texture2D(tex, wp.xz * scale).rgb;
  vec3 cz = texture2D(tex, wp.xy * scale).rgb;
  return cx * w.x + cy * w.y + cz * w.z;
}

vec3 sampleTriplanarWorldNormal(sampler2D tex, vec3 wp, vec3 wn, vec3 w, float scale, float strength) {
  vec3 tnX = texture2D(tex, wp.zy * scale).xyz * 2.0 - 1.0;
  vec3 tnY = texture2D(tex, wp.xz * scale).xyz * 2.0 - 1.0;
  vec3 tnZ = texture2D(tex, wp.xy * scale).xyz * 2.0 - 1.0;
  tnX.xy *= strength;
  tnY.xy *= strength;
  tnZ.xy *= strength;

  vec3 nX = vec3(wn.x, wn.y + tnX.y, wn.z - tnX.x * sign(wn.x));
  vec3 nY = vec3(wn.x + tnY.x, wn.y, wn.z - tnY.y * sign(wn.y));
  vec3 nZ = vec3(wn.x + tnZ.x * sign(wn.z), wn.y + tnZ.y, wn.z);
  return normalize(nX * w.x + nY * w.y + nZ * w.z);
}

float computeCliffWeight(vec3 wp, vec3 wn, float maxH, out float outGrassPatch, out float outMacro, out float outPatchNoise) {
  outMacro = terrainValueNoise(wp.xz * 0.0085) * 0.65
           + terrainValueNoise(wp.xz * 0.022 + 7.4) * 0.35;
  outPatchNoise = terrainValueNoise(wp.xz * 0.015 - 3.2) * 0.58
                + terrainValueNoise(wp.xz * 0.041 + 12.1) * 0.42;

  float slope = 1.0 - clamp(wn.y, 0.0, 1.0);
  float altNorm = clamp(max(wp.y, 0.0) / max(maxH, 1.0), 0.0, 1.0);

  // Foothills, valleys, and moderate mountain slopes stay richly grassed; steep cliffs stay rocky
  float steepCliff = smoothstep(0.27, 0.53, slope + (outMacro - 0.5) * 0.14);

  // Lush grass climbs up saddles & mid-upper mountain slopes; summit crags remain rocky
  float treeline = smoothstep(0.45, 0.84, altNorm + (outPatchNoise - 0.5) * 0.24);
  float upperVegPatches = (1.0 - smoothstep(0.20, 0.42, slope))
                        * (1.0 - smoothstep(0.66, 0.90, altNorm))
                        * smoothstep(0.30, 0.64, outPatchNoise);

  float vegCoverage = (1.0 - treeline) * (1.0 - steepCliff);
  vegCoverage = max(vegCoverage, upperVegPatches * 0.95);

  // Transition into grass just behind coastal beaches & rocky shoreline (y >= 1.5m)
  float aboveCoast = smoothstep(1.3, 3.8, wp.y);
  vegCoverage *= aboveCoast;

  outGrassPatch = clamp(vegCoverage, 0.0, 1.0);
  return clamp(1.0 - outGrassPatch, 0.0, 1.0);
}`,
      )
      .replace(
        '#include <map_fragment>',
        `vec3 tWorldN = normalize(vTerrainWorldNormal);
vec3 tTriW = pow(abs(tWorldN), vec3(4.0));
tTriW /= max(dot(tTriW, vec3(1.0)), 0.0001);

float camDist = length(cameraPosition - vTerrainWorldPos);

float tMacroNoise = 0.0;
float tPatchNoise = 0.0;
float tGrassWeight = 0.0;
float tBaseCliffWeight = computeCliffWeight(vTerrainWorldPos, tWorldN, uMaxHeight, tGrassWeight, tMacroNoise, tPatchNoise);

float tSlope = 1.0 - clamp(tWorldN.y, 0.0, 1.0);
float tAltNorm = clamp(max(vTerrainWorldPos.y, 0.0) / max(uMaxHeight, 1.0), 0.0, 1.0);

float tTurfClump = terrainValueNoise(vTerrainWorldPos.xz * 0.078) * 0.65
                 + terrainValueNoise(vTerrainWorldPos.xz * 0.22 + 4.3) * 0.35;

float shoreBand = 1.0 - smoothstep(-1.0, 3.4, vTerrainWorldPos.y + (tMacroNoise - 0.5) * 1.15);

float rockPoke = (tTurfClump - 0.5) * 0.32 + (tPatchNoise - 0.5) * 0.16;
float tCliffWeight = clamp(smoothstep(0.14, 0.86, tBaseCliffWeight + rockPoke * 0.32), 0.0, 1.0);

float cliffLuma = 0.22;
vec3 cliffCol = vec3(0.24, 0.23, 0.21);
if (tCliffWeight > 0.015 || shoreBand > 0.015) {
  vec3 cliffFar = texture2D(uCliffDiffuse, (vTerrainWorldPos.xz + vec2(19.3, -11.7)) * (uCliffScale * 0.26)).rgb;
  if (camDist < 760.0) {
    vec3 cliffNear = sampleTriplanarColor(uCliffDiffuse, vTerrainWorldPos, tTriW, uCliffScale);
    cliffCol = mix(cliffNear, cliffFar, 0.36);
  } else {
    cliffCol = cliffFar;
  }

  cliffLuma = dot(cliffCol, vec3(0.299, 0.587, 0.114));
  cliffCol = mix(cliffCol, vec3(cliffLuma) * vec3(0.84, 0.82, 0.78), 0.38);

  vec3 strataTint = mix(vec3(0.75, 0.71, 0.65), vec3(0.97, 0.95, 0.92), tMacroNoise);
  float highRidge = smoothstep(0.62, 0.95, tAltNorm) * smoothstep(0.28, 0.0, tSlope);
  cliffCol *= strataTint * 0.88;
  cliffCol = mix(cliffCol, cliffCol * 1.16 + vec3(0.03, 0.03, 0.035), highRidge * 0.38);
}

float fineLum = 0.145;
vec3 grassCol = vec3(0.16, 0.28, 0.08);
if (tCliffWeight < 0.985 && shoreBand < 0.985) {
  vec2 grassUvMed = vec2(
    vTerrainWorldPos.x * 0.8 - vTerrainWorldPos.z * 0.6,
    vTerrainWorldPos.x * 0.6 + vTerrainWorldPos.z * 0.8
  ) * (uBaseScale * 0.18) + vec2(0.37, 0.71);
  vec3 grassMed = texture2D(uBaseDiffuse, grassUvMed).rgb;
  float medLum = dot(grassMed, vec3(0.299, 0.587, 0.114));

  vec3 grassTex = grassMed;
  float fineContrast = 0.0;
  if (camDist < 900.0) {
    vec3 grassFine = texture2D(uBaseDiffuse, vTerrainWorldPos.xz * uBaseScale).rgb;
    fineLum = dot(grassFine, vec3(0.299, 0.587, 0.114));
    fineContrast = clamp((fineLum - 0.145) * 3.8, -0.35, 0.40);
    grassTex = mix(grassFine, grassMed, 0.36);
  }
  float medContrast = clamp((medLum - 0.145) * 4.2, -0.34, 0.40);
  grassTex *= (1.0 + fineContrast * 0.48 + medContrast * 0.58);

  vec3 deepEmeraldTint = vec3(0.76, 1.06, 0.62);
  vec3 vibrantGreenTint = vec3(1.06, 1.24, 0.78);
  vec3 sunlitMeadowTint = vec3(1.26, 1.22, 0.68);

  vec3 grassShadeTint = mix(deepEmeraldTint, vibrantGreenTint, smoothstep(0.18, 0.76, tMacroNoise));
  grassShadeTint = mix(grassShadeTint, sunlitMeadowTint, smoothstep(0.42, 0.86, tPatchNoise) * (1.0 - tSlope * 0.95));
  grassShadeTint *= mix(0.78, 1.22, tTurfClump);

  grassCol = grassTex * grassShadeTint;

  float turfMottle = smoothstep(0.18, 0.64, tTurfClump);
  grassCol = mix(grassCol * vec3(0.74, 0.78, 0.58), grassCol, 0.42 + turfMottle * 0.58);
}

float transitionBand = smoothstep(0.28, 0.48, tCliffWeight) * (1.0 - smoothstep(0.56, 0.78, tCliffWeight));
vec3 earthScree = mix(grassCol * vec3(0.84, 0.78, 0.58), cliffCol * vec3(0.92, 0.84, 0.70), 0.54);

vec3 terrainAlbedo = mix(grassCol, cliffCol, tCliffWeight);
terrainAlbedo = mix(terrainAlbedo, earthScree, transitionBand * 0.34);

if (shoreBand > 0.015) {
  float sandyBeachSlope = 1.0 - smoothstep(0.08, 0.24, tSlope);
  float sandGrain = 0.90 + tTurfClump * 0.12 + (cliffLuma - 0.2) * 0.22;
  vec3 drySand = vec3(0.73, 0.65, 0.48) * sandGrain;
  vec3 wetSand = vec3(0.44, 0.38, 0.29) * (0.94 + (cliffLuma - 0.2) * 0.16);
  float wetness = 1.0 - smoothstep(-0.6, 1.15, vTerrainWorldPos.y);
  vec3 beachSand = mix(drySand, wetSand, wetness);
  vec3 wetCoastRock = cliffCol * mix(1.0, 0.52, wetness);

  vec3 coastAlbedo = mix(wetCoastRock, beachSand, sandyBeachSlope);
  terrainAlbedo = mix(terrainAlbedo, coastAlbedo, shoreBand);
}

if (uSlopeInspect > 0.5) {
  vec3 slopeHeat = mix(vec3(0.14, 0.52, 0.22), vec3(0.78, 0.38, 0.16), tCliffWeight);
  terrainAlbedo = mix(terrainAlbedo, slopeHeat, 0.62);
}

diffuseColor.rgb *= terrainAlbedo;`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `float roughnessFactor = roughness;
float grassRough = 0.90;
if (camDist < 680.0 && tCliffWeight < 0.985 && shoreBand < 0.985) {
  float baseRough = texture2D(uBaseRoughness, vTerrainWorldPos.xz * uBaseScale).g;
  grassRough = clamp(baseRough * 1.04 + 0.08, 0.78, 0.98);
}
float cliffRough = clamp(0.80 + (1.0 - cliffLuma) * 0.18, 0.74, 0.98);
float wetSmooth = (1.0 - smoothstep(-0.5, 1.25, vTerrainWorldPos.y)) * 0.35;
roughnessFactor *= clamp(mix(grassRough, cliffRough, tCliffWeight) - wetSmooth, 0.40, 0.98);`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `vec3 baseWorldN = tWorldN;
if (camDist < 520.0 && tCliffWeight < 0.985 && shoreBand < 0.95) {
  vec2 grassNormUvFine = vTerrainWorldPos.xz * uBaseScale;
  vec3 baseTn = texture2D(uBaseNormal, grassNormUvFine).xyz * 2.0 - 1.0;
  baseTn.xy *= normalScale.x * (1.12 * (1.0 - shoreBand * 0.75));
  baseWorldN = normalize(vec3(tWorldN.x + baseTn.x, tWorldN.y, tWorldN.z - baseTn.y * sign(tWorldN.y)));
}
vec3 cliffWorldN = tWorldN;
if (camDist < 760.0 && (tCliffWeight > 0.015 || shoreBand > 0.015)) {
  cliffWorldN = sampleTriplanarWorldNormal(uCliffNormal, vTerrainWorldPos, tWorldN, tTriW, uCliffScale, normalScale.x);
}
vec3 finalWorldN = normalize(mix(baseWorldN, cliffWorldN, max(tCliffWeight, shoreBand * 0.4)));
normal = normalize((viewMatrix * vec4(finalWorldN, 0.0)).xyz);`,
      );
  };

  const boulderMaterial = new THREE.MeshStandardMaterial({
    name: 'MountainOutcropRockPBR',
    color: 0xb5b0a6,
    map: textures.cliff.diffuse,
    normalMap: textures.cliff.normal,
    normalScale: new THREE.Vector2(1.05, 1.05),
    roughnessMap: textures.cliff.roughness,
    roughness: 0.92,
    metalness: 0.03,
    envMapIntensity: 0.35,
  });

  return {
    terrainMaterial,
    boulderMaterial,
    setSlopeInspect: (enabled: boolean) => {
      uniforms.uSlopeInspect.value = enabled ? 1 : 0;
    },
    setWireframe: (enabled: boolean) => {
      terrainMaterial.wireframe = enabled;
      boulderMaterial.wireframe = enabled;
    },
    dispose: () => {
      terrainMaterial.dispose();
      boulderMaterial.dispose();
    },
  };
}
