import * as THREE from 'three';
import { DISTANT_ISLAND_SPECS } from './distantIslands';
import type { TerrainSampler } from './mountainGeometry';
import { LIGHTING_PRESETS, QUALITY_SPECS, type LightingPresetId, type QualityPreset } from './types';

export interface TropicalOceanController {
  mesh: THREE.Mesh;
  update: (elapsedSeconds: number) => void;
  setQuality: (quality: QualityPreset) => void;
  setLighting: (presetId: LightingPresetId) => void;
  setSunAngles: (sunDir: THREE.Vector3) => void;
  setWireframe: (enabled: boolean) => void;
  dispose: () => void;
}

/**
 * Generates a radial adaptive circular ocean disc (no square edges!) with high vertex
 * concentration around the island coves and sparse rings extending out to 4200m horizon fog.
 */
function createRadialOceanGeometry(radialSegments: number, ringCount: number): THREE.BufferGeometry {
  const outerRadius = 4200;
  const innerRadius = 90;
  const vertsPerRing = radialSegments + 1;
  const totalRings = ringCount + 1;
  const vertexCount = vertsPerRing * totalRings;

  const positions = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);

  for (let rIdx = 0; rIdx <= ringCount; rIdx++) {
    const t = rIdx / ringCount;
    // Non-linear distribution puts fine wave mesh around 120..1000m coastlines
    const radius = rIdx === 0 ? 0 : innerRadius + Math.pow(t, 1.72) * (outerRadius - innerRadius);

    for (let sIdx = 0; sIdx <= radialSegments; sIdx++) {
      const u = sIdx / radialSegments;
      const theta = u * Math.PI * 2;
      const x = Math.cos(theta) * radius;
      const z = Math.sin(theta) * radius;

      const idx = rIdx * vertsPerRing + sIdx;
      positions[idx * 3] = x;
      positions[idx * 3 + 1] = 0;
      positions[idx * 3 + 2] = z;

      uvs[idx * 2] = u;
      uvs[idx * 2 + 1] = t;
    }
  }

  const indexCount = ringCount * radialSegments * 6;
  const indices =
    vertexCount > 65535 ? new Uint32Array(indexCount) : new Uint16Array(indexCount);
  let ptr = 0;
  for (let rIdx = 0; rIdx < ringCount; rIdx++) {
    for (let sIdx = 0; sIdx < radialSegments; sIdx++) {
      const a = rIdx * vertsPerRing + sIdx;
      const b = a + 1;
      const c = (rIdx + 1) * vertsPerRing + sIdx;
      const d = c + 1;

      indices[ptr++] = a;
      indices[ptr++] = b;
      indices[ptr++] = c;

      indices[ptr++] = b;
      indices[ptr++] = d;
      indices[ptr++] = c;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Pre-bakes a lightweight 256x256 bathymetry lookup texture (64 KB) from the terrain sampler
 * so the ocean shader knows exact water depth along every sandy cove and rocky headland.
 */
function createShoreBathymetryTexture(sampler: TerrainSampler, islandSize: number): THREE.DataTexture {
  const res = 256;
  const data = new Uint8Array(res * res * 4);
  const half = islandSize * 0.5;

  for (let iy = 0; iy < res; iy++) {
    const z = -half + (iy / (res - 1)) * islandSize;
    for (let ix = 0; ix < res; ix++) {
      const x = -half + (ix / (res - 1)) * islandSize;
      const h = sampler.sample(x, z).height;
      // Depth > 0 means underwater; encode [-15m .. +15m] into [0 .. 255]
      const depth = -h;
      const encodedDepth = THREE.MathUtils.clamp((depth + 6.0) / 22.0, 0, 1);
      const byte = Math.round(encodedDepth * 255);
      const idx = (iy * res + ix) * 4;
      data[idx] = byte;
      data[idx + 1] = byte;
      data[idx + 2] = byte;
      data[idx + 3] = 255;
    }
  }

  const tex = new THREE.DataTexture(data, res, res, THREE.RGBAFormat);
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

export function createTropicalOcean(
  sampler: TerrainSampler,
  islandSize: number,
  initialQuality: QualityPreset,
  initialLighting: LightingPresetId,
): TropicalOceanController {
  const spec = QUALITY_SPECS[initialQuality];
  const shoreMap = createShoreBathymetryTexture(sampler, islandSize);
  const initialPreset = LIGHTING_PRESETS[initialLighting];

  const distantIslandUniforms = DISTANT_ISLAND_SPECS.map(
    (d) => new THREE.Vector4(d.x, d.z, d.radius, 1.0),
  );

  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      uTime: { value: 0 },
      uShoreMap: { value: shoreMap },
      uIslandSize: { value: islandSize },
      uDistantIslands: { value: distantIslandUniforms },
      uSunDirection: { value: new THREE.Vector3(0.5, 0.55, 0.65).normalize() },
      uSunColor: { value: new THREE.Color(initialPreset.sunColor) },
      uSkyZenith: { value: new THREE.Color(initialPreset.skyZenith) },
      uSkyHorizon: { value: new THREE.Color(initialPreset.skyHorizon) },
      uShallowColor: { value: new THREE.Color(0x1db8b5) },
      uMidSeaColor: { value: new THREE.Color(0x0a6d9c) },
      uDeepSeaColor: { value: new THREE.Color(0x063566) },
    },
  ]);

  const material = new THREE.ShaderMaterial({
    name: 'TropicalOceanSurfaceShader',
    fog: true,
    transparent: false,
    depthWrite: true,
    uniforms,
    vertexShader: `
      #include <common>
      #include <fog_pars_vertex>

      uniform float uTime;
      uniform sampler2D uShoreMap;
      uniform float uIslandSize;

      varying vec3 vWorldPos;
      varying float vWaveCrest;

      float sampleIslandDepthRaw(vec2 xz) {
        vec2 uv = xz / uIslandSize + 0.5;
        vec2 clamped = clamp(uv, 0.002, 0.998);
        float texVal = texture2D(uShoreMap, clamped).r;
        float outside = step(abs(xz.x), uIslandSize * 0.5) * step(abs(xz.y), uIslandSize * 0.5);
        return mix(14.5, texVal * 22.0 - 6.0, outside);
      }

      void main() {
        vec3 pos = position;
        vec4 worldBase = modelMatrix * vec4(pos, 1.0);
        float depth = sampleIslandDepthRaw(worldBase.xz);
        float shoreAtten = smoothstep(-0.3, 4.2, depth);
        float distFade = 1.0 - smoothstep(1400.0, 3800.0, length(worldBase.xz));

        // Layered tropical ocean swells
        float w1 = sin(worldBase.x * 0.032 + worldBase.z * 0.021 + uTime * 1.18) * 0.42;
        float w2 = sin(worldBase.x * -0.024 + worldBase.z * 0.041 + uTime * 0.94) * 0.30;
        float w3 = cos(worldBase.x * 0.068 - worldBase.z * 0.052 + uTime * 1.62) * 0.14;
        float waveHeight = (w1 + w2 + w3) * (0.28 + 0.72 * shoreAtten) * distFade;

        pos.y += waveHeight;
        vWaveCrest = clamp(waveHeight * 0.65 + 0.5, 0.0, 1.0);

        vec4 worldPos4 = modelMatrix * vec4(pos, 1.0);
        vWorldPos = worldPos4.xyz;
        vec4 mvPosition = viewMatrix * worldPos4;
        gl_Position = projectionMatrix * mvPosition;

        #include <fog_vertex>
      }
    `,
    fragmentShader: `
      #include <common>
      #include <fog_pars_fragment>

      uniform float uTime;
      uniform sampler2D uShoreMap;
      uniform float uIslandSize;
      uniform vec4 uDistantIslands[8];
      uniform vec3 uSunDirection;
      uniform vec3 uSunColor;
      uniform vec3 uSkyZenith;
      uniform vec3 uSkyHorizon;
      uniform vec3 uShallowColor;
      uniform vec3 uMidSeaColor;
      uniform vec3 uDeepSeaColor;

      varying vec3 vWorldPos;
      varying float vWaveCrest;

      float waveField(vec2 p, float t) {
        float h = 0.0;
        h += sin(p.x * 0.14 + p.y * 0.09 + t * 1.45) * 0.34;
        h += sin(p.x * -0.11 + p.y * 0.19 + t * 1.15) * 0.28;
        h += sin(p.x * 0.33 - p.y * 0.27 + t * 2.05) * 0.16;
        h += cos(p.x * 0.62 + p.y * 0.48 - t * 2.55) * 0.09;
        return h;
      }

      vec3 computeWaterNormal(vec2 p, float t, float camDist) {
        float a1 = p.x * 0.14 + p.y * 0.09 + t * 1.45;
        float a2 = p.x * -0.11 + p.y * 0.19 + t * 1.15;
        float a3 = p.x * 0.33 - p.y * 0.27 + t * 2.05;
        float a4 = p.x * 0.62 + p.y * 0.48 - t * 2.55;

        float c1 = cos(a1) * 0.34;
        float c2 = cos(a2) * 0.28;
        float c3 = cos(a3) * 0.16;
        float s4 = -sin(a4) * 0.09;

        float dhdx = c1 * 0.14 + c2 * -0.11 + c3 * 0.33 + s4 * 0.62;
        float dhdz = c1 * 0.09 + c2 * 0.19 + c3 * -0.27 + s4 * 0.48;

        // Dampen high-frequency ripple aliasing smoothly with camera distance
        float detailScale = mix(0.28, 0.06, smoothstep(250.0, 2200.0, camDist));
        return normalize(vec3(-dhdx * detailScale, 1.0, -dhdz * detailScale));
      }

      float sampleEffectiveDepth(vec2 xz) {
        vec2 uv = xz / uIslandSize + 0.5;
        float inside = step(0.002, uv.x) * step(uv.x, 0.998) * step(0.002, uv.y) * step(uv.y, 0.998);
        float mainDepth = 15.0;
        if (inside > 0.5) {
          mainDepth = texture2D(uShoreMap, clamp(uv, 0.002, 0.998)).r * 22.0 - 6.0;
        }

        // Blend shallow lagoon shelves around distant islands
        float satDepth = 15.0;
        for (int i = 0; i < 8; i++) {
          float dist = length(xz - uDistantIslands[i].xy) / uDistantIslands[i].z;
          float d = mix(-1.2, 15.0, smoothstep(0.68, 1.25, dist));
          satDepth = min(satDepth, d);
        }

        return min(mainDepth, satDepth);
      }

      void main() {
        vec3 toCam = cameraPosition - vWorldPos;
        float camDist = length(toCam);
        vec3 viewDir = toCam / max(camDist, 0.0001);

        vec3 N = computeWaterNormal(vWorldPos.xz, uTime, camDist);
        float depth = sampleEffectiveDepth(vWorldPos.xz);

        // Tropical water color absorption: coral turquoise -> vibrant lagoon blue -> deep sapphire
        float shallowMix = smoothstep(0.2, 5.2, depth);
        float deepMix = smoothstep(4.5, 13.5, depth);
        vec3 waterBase = mix(uShallowColor, uMidSeaColor, shallowMix);
        waterBase = mix(waterBase, uDeepSeaColor, deepMix);

        // Subtle sunlit subsurface scatter glow on translucent wave crests in shallow/mid water
        vec3 sunDir = normalize(uSunDirection);
        float sss = pow(max(dot(viewDir, -sunDir + N * 0.55), 0.0), 3.0) * (1.0 - deepMix * 0.65);
        waterBase += vec3(0.04, 0.24, 0.25) * sss * (0.45 + vWaveCrest * 0.55);

        // Schlick Fresnel sky dome reflection
        float ndotv = clamp(dot(N, viewDir), 0.0, 1.0);
        float fresnel = 0.025 + 0.975 * pow(1.0 - ndotv, 4.4);
        vec3 reflDir = reflect(-viewDir, N);
        float skyGrad = clamp(reflDir.y, 0.0, 1.0);
        vec3 skyRefl = mix(uSkyHorizon, uSkyZenith, pow(skyGrad, 0.58));

        vec3 col = mix(waterBase, skyRefl, clamp(fresnel * 0.88, 0.0, 0.92));

        // Dual-lobe solar specular reflection path across waves
        vec3 halfVec = normalize(sunDir + viewDir);
        float ndoth = max(dot(N, halfVec), 0.0);
        float specTight = pow(ndoth, 240.0) * 2.2;
        float specBroad = pow(ndoth, 34.0) * 0.24;
        float horizonSunDamp = smoothstep(0.02, 0.22, sunDir.y);
        col += uSunColor * (specTight + specBroad) * horizonSunDamp;

        // Animated shoreline surf & lacy white sea foam along coves and headlands
        float foamNoise = waveField(vWorldPos.xz * 0.42, uTime * 0.72) * 0.5 + 0.5;
        float surfPulse = sin(uTime * 1.45 - depth * 3.1 + foamNoise * 2.4) * 0.5 + 0.5;
        float shoreLineMask = (1.0 - smoothstep(0.0, 1.65, abs(depth - 0.35))) * smoothstep(-0.35, 0.15, depth);
        float foamBreakup = smoothstep(0.32, 0.78, surfPulse * 0.65 + foamNoise * 0.45);
        float foamMask = clamp(shoreLineMask * (0.42 + 0.58 * foamBreakup), 0.0, 0.9);
        vec3 foamColor = mix(vec3(0.84, 0.93, 0.96), uSunColor * 0.95 + vec3(0.1), 0.35);
        col = mix(col, foamColor, foamMask);

        gl_FragColor = vec4(col, 1.0);

        #include <fog_fragment>
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });

  const mesh = new THREE.Mesh(
    createRadialOceanGeometry(spec.oceanRadialSegs, spec.oceanRings),
    material,
  );
  mesh.name = 'TropicalOceanSurface';
  mesh.position.y = 0;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;

  const setLighting = (presetId: LightingPresetId) => {
    const p = LIGHTING_PRESETS[presetId];
    uniforms.uSunColor.value.setHex(p.sunColor);
    uniforms.uSkyZenith.value.setHex(p.skyZenith);
    uniforms.uSkyHorizon.value.setHex(p.skyHorizon);

    if (presetId === 'golden') {
      uniforms.uShallowColor.value.setHex(0x1f9e9e);
      uniforms.uMidSeaColor.value.setHex(0x125a82);
      uniforms.uDeepSeaColor.value.setHex(0x0b2d52);
    } else if (presetId === 'overcast') {
      uniforms.uShallowColor.value.setHex(0x2a8f92);
      uniforms.uMidSeaColor.value.setHex(0x1b5c78);
      uniforms.uDeepSeaColor.value.setHex(0x10364d);
    } else {
      uniforms.uShallowColor.value.setHex(0x1db8b5);
      uniforms.uMidSeaColor.value.setHex(0x0a6d9c);
      uniforms.uDeepSeaColor.value.setHex(0x063566);
    }
  };

  setLighting(initialLighting);

  return {
    mesh,
    update: (elapsedSeconds: number) => {
      uniforms.uTime.value = elapsedSeconds;
    },
    setQuality: (nextQuality: QualityPreset) => {
      const nextSpec = QUALITY_SPECS[nextQuality];
      const oldGeo = mesh.geometry;
      mesh.geometry = createRadialOceanGeometry(nextSpec.oceanRadialSegs, nextSpec.oceanRings);
      oldGeo.dispose();
    },
    setLighting,
    setSunAngles: (sunDir: THREE.Vector3) => {
      uniforms.uSunDirection.value.copy(sunDir).normalize();
    },
    setWireframe: (enabled: boolean) => {
      material.wireframe = enabled;
    },
    dispose: () => {
      mesh.geometry.dispose();
      material.dispose();
      shoreMap.dispose();
    },
  };
}
