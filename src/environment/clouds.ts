import * as THREE from 'three';
import { LIGHTING_PRESETS, QUALITY_SPECS, type LightingPresetId, type QualityPreset } from './types';

interface CloudCluster {
  x: number;
  y: number;
  z: number;
  speed: number;
  puffs: Array<{
    ox: number;
    oy: number;
    oz: number;
    sx: number;
    sy: number;
    seed: number;
    opacity: number;
  }>;
}

export interface CloudSystemController {
  group: THREE.Group;
  update: (elapsedSeconds: number) => void;
  setQuality: (quality: QualityPreset) => void;
  setLighting: (presetId: LightingPresetId) => void;
  setSunAngles: (sunDir: THREE.Vector3) => void;
  dispose: () => void;
}

const CLOUD_DOMAIN_HALF = 2500;

/**
 * Lightweight soft-edged atmospheric cumulus cloud system:
 * Single InstancedMesh of camera-facing procedural FBM puff quads animated
 * entirely on the GPU via uTime (zero per-frame CPU matrix math or buffer uploads).
 */
export function createCloudSystem(
  seed: number,
  initialQuality: QualityPreset,
  initialLighting: LightingPresetId,
): CloudSystemController {
  const group = new THREE.Group();
  group.name = 'TropicalSkyClouds';

  const quadGeo = new THREE.PlaneGeometry(1, 1);

  const initialPreset = LIGHTING_PRESETS[initialLighting];
  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      uTime: { value: 0 },
      uSunDirection: { value: new THREE.Vector3(0.45, 0.55, 0.7).normalize() },
      uLitColor: { value: new THREE.Color(initialPreset.cloudTint) },
      uShadowColor: { value: new THREE.Color(0x88a4c2) },
    },
  ]);

  const material = new THREE.ShaderMaterial({
    name: 'SoftAtmosphericCloudMat',
    uniforms,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    fog: true,
    vertexShader: `
      #include <common>
      #include <fog_pars_vertex>

      uniform float uTime;

      attribute vec4 aCloudMeta;   // x: seed, y: opacity, z: puffHeightOffset, w: unused
      attribute vec2 aCloudMotion; // x: speedX, y: speedZ

      varying vec2 vUv;
      varying vec4 vMeta;
      varying vec3 vWorldPos;
      varying vec3 vCamRight;
      varying vec3 vCamUp;
      varying vec3 vCamFwd;

      void main() {
        vUv = uv;
        vMeta = aCloudMeta;

        vec3 instCenter = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        float sx = length((modelMatrix * instanceMatrix)[0].xyz);
        float sy = length((modelMatrix * instanceMatrix)[1].xyz);

        // GPU-driven periodic drift wrapping smoothly over [-2500, 2500]
        instCenter.x = mod(instCenter.x + aCloudMotion.x * uTime + 2500.0, 5000.0) - 2500.0;
        instCenter.z = mod(instCenter.z + aCloudMotion.y * uTime + 2500.0, 5000.0) - 2500.0;

        vec3 camRight = normalize(vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]));
        vec3 camUpView = normalize(vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]));
        vec3 camUp = normalize(mix(vec3(0.0, 1.0, 0.0), camUpView, 0.58));
        vec3 camFwd = normalize(-vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]));

        vCamRight = camRight;
        vCamUp = camUp;
        vCamFwd = camFwd;

        vec3 worldPos = instCenter + camRight * (position.x * sx) + camUp * (position.y * sy);
        vWorldPos = worldPos;

        vec4 mvPosition = viewMatrix * vec4(worldPos, 1.0);
        gl_Position = projectionMatrix * mvPosition;

        #include <fog_vertex>
      }
    `,
    fragmentShader: `
      #include <common>
      #include <fog_pars_fragment>

      uniform vec3 uSunDirection;
      uniform vec3 uLitColor;
      uniform vec3 uShadowColor;

      varying vec2 vUv;
      varying vec4 vMeta;
      varying vec3 vWorldPos;
      varying vec3 vCamRight;
      varying vec3 vCamUp;
      varying vec3 vCamFwd;

      float cloudHash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }

      float cloudNoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(cloudHash(i + vec2(0.0, 0.0)), cloudHash(i + vec2(1.0, 0.0)), u.x),
          mix(cloudHash(i + vec2(0.0, 1.0)), cloudHash(i + vec2(1.0, 1.0)), u.x),
          u.y
        );
      }

      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        vec2 pShape = vec2(p.x * 0.92, p.y < 0.0 ? p.y * 1.38 : p.y * 1.02);
        float r = length(pShape);
        if (r > 1.05) discard;

        float s = vMeta.x;
        float n = cloudNoise(p * 2.3 + vec2(s, s * 1.7)) * 0.65
                + cloudNoise(p * 4.9 - vec2(s * 0.8, s * 1.3)) * 0.35;

        float bottomFlat = smoothstep(-0.78, -0.18, p.y + (n - 0.5) * 0.16);
        float density = smoothstep(0.96, 0.24, r + (n - 0.5) * 0.44) * bottomFlat;

        float camDist = length(cameraPosition - vWorldPos);
        float nearFade = smoothstep(85.0, 220.0, camDist);
        float horizonFade = 1.0 - smoothstep(2100.0, 4000.0, camDist);
        float alpha = density * vMeta.y * nearFade * horizonFade;

        if (alpha < 0.015) discard;

        vec3 localN = normalize(vec3(p.x * 0.65, p.y * 0.78 + 0.28, 0.72));
        vec3 worldN = normalize(vCamRight * localN.x + vCamUp * localN.y - vCamFwd * localN.z);
        float sunDot = dot(worldN, normalize(uSunDirection)) * 0.5 + 0.5;
        float heightShade = smoothstep(-0.55, 0.62, p.y + vMeta.z * 0.35 + (n - 0.5) * 0.25);
        float litMix = clamp(heightShade * 0.68 + sunDot * 0.42, 0.0, 1.0);

        vec3 col = mix(uShadowColor, uLitColor, litMix);
        float forwardScatter = pow(max(dot(normalize(vWorldPos - cameraPosition), normalize(uSunDirection)), 0.0), 4.0);
        col += uLitColor * (forwardScatter * (1.0 - density * 0.65) * 0.24);

        gl_FragColor = vec4(col, alpha);

        #include <fog_fragment>
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });

  let puffMesh: THREE.InstancedMesh | null = null;
  const dummy = new THREE.Object3D();

  const buildClouds = (quality: QualityPreset) => {
    if (puffMesh) {
      group.remove(puffMesh);
      puffMesh.dispose();
      puffMesh = null;
    }

    const spec = QUALITY_SPECS[quality];
    const clusterCount = spec.cloudCount;
    const puffsPerCloud = quality === 'high' ? 5 : 4;
    const totalPuffs = clusterCount * puffsPerCloud;

    let rng = (seed ^ 0x7a2b3c4d) >>> 0;
    const rand = () => {
      rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0;
      return rng / 4294967296;
    };

    const metaArray = new Float32Array(totalPuffs * 4);
    const motionArray = new Float32Array(totalPuffs * 2);
    const mesh = new THREE.InstancedMesh(quadGeo, material, totalPuffs);
    mesh.name = 'SoftAtmosphericCloudsInstanced';
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;

    let ptr = 0;
    for (let c = 0; c < clusterCount; c++) {
      const angle = (c / clusterCount) * Math.PI * 2 + (rand() - 0.5) * 0.5;
      const radialDist = 520 + Math.pow(rand(), 0.72) * (CLOUD_DOMAIN_HALF - 550);
      const cx = Math.cos(angle) * radialDist;
      const cz = Math.sin(angle) * radialDist;
      const cy = 415 + rand() * 210;
      const baseW = 190 + rand() * 165;
      const baseH = 92 + rand() * 68;
      const speed = 6.0 + rand() * 7.5;

      for (let p = 0; p < puffsPerCloud; p++) {
        const isMain = p === 0;
        const spreadT = p / Math.max(1, puffsPerCloud - 1) - 0.5;
        const ox = isMain ? 0 : spreadT * baseW * 0.72 + (rand() - 0.5) * baseW * 0.18;
        const oz = isMain ? 0 : (rand() - 0.5) * baseW * 0.34;
        const oy = isMain ? baseH * 0.12 : (rand() - 0.35) * baseH * 0.28;
        const sx = baseW * (isMain ? 0.92 : 0.56 + rand() * 0.32);
        const sy = baseH * (isMain ? 0.95 : 0.62 + rand() * 0.32);
        const puffSeed = rand() * 100.0;
        const opacity = isMain ? 0.76 : 0.56 + rand() * 0.20;

        dummy.position.set(cx + ox, cy + oy, cz + oz);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(sx, sy, 1);
        dummy.updateMatrix();
        mesh.setMatrixAt(ptr, dummy.matrix);

        const m4 = ptr * 4;
        metaArray[m4] = puffSeed;
        metaArray[m4 + 1] = opacity;
        metaArray[m4 + 2] = isMain ? 0.35 : (oy / baseH) * 0.8;
        metaArray[m4 + 3] = 0;

        const m2 = ptr * 2;
        motionArray[m2] = speed;
        motionArray[m2 + 1] = speed * 0.24;
        ptr++;
      }
    }

    quadGeo.setAttribute('aCloudMeta', new THREE.InstancedBufferAttribute(metaArray, 4));
    quadGeo.setAttribute('aCloudMotion', new THREE.InstancedBufferAttribute(motionArray, 2));
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
    puffMesh = mesh;
  };

  const setLighting = (presetId: LightingPresetId) => {
    const preset = LIGHTING_PRESETS[presetId];
    uniforms.uLitColor.value.setHex(preset.cloudTint);
    if (presetId === 'golden') {
      uniforms.uShadowColor.value.setHex(0x8e7278);
    } else if (presetId === 'overcast') {
      uniforms.uShadowColor.value.setHex(0x7c8a96);
    } else if (presetId === 'midday') {
      uniforms.uShadowColor.value.setHex(0x8ea9c7);
    } else {
      uniforms.uShadowColor.value.setHex(0x88a4c2);
    }
  };

  buildClouds(initialQuality);
  setLighting(initialLighting);

  return {
    group,
    update: (elapsedSeconds: number) => {
      uniforms.uTime.value = elapsedSeconds;
    },
    setQuality: buildClouds,
    setLighting,
    setSunAngles: (sunDir: THREE.Vector3) => {
      uniforms.uSunDirection.value.copy(sunDir).normalize();
    },
    dispose: () => {
      if (puffMesh) {
        group.remove(puffMesh);
        puffMesh.dispose();
        puffMesh = null;
      }
      quadGeo.dispose();
      material.dispose();
      group.clear();
    },
  };
}
