import * as THREE from 'three';
import { SeededNoise, type TerrainSample } from './noise';
import { QUALITY_SPECS, type MountainConfig } from './types';

export interface TerrainSampler {
  sample: (x: number, z: number) => TerrainSample;
}

/**
 * Generates an indexed BufferGeometry for the primary island mountain massif.
 * Computes smooth normals, world-aligned UVs, and geological crevice AO in vertex colors.
 */
export function createMountainTerrainGeometry(
  config: MountainConfig,
  sampler: TerrainSampler,
  segmentsOverride?: number,
): THREE.BufferGeometry {
  const segments = segmentsOverride ?? QUALITY_SPECS[config.quality].segments;
  // Active island massif + shallow lagoon extends well within 1380m (outer 1380..1600m is -14.5m deep ocean floor)
  const size = Math.min(config.size, 1380);
  const half = size * 0.5;
  const step = size / segments;
  const vertsPerRow = segments + 1;
  const vertexCount = vertsPerRow * vertsPerRow;

  const positions = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const colors = new Float32Array(vertexCount * 3);
  const heights = new Float32Array(vertexCount);
  const ridgeFactors = new Float32Array(vertexCount);

  for (let iz = 0; iz <= segments; iz++) {
    const z = -half + iz * step;
    for (let ix = 0; ix <= segments; ix++) {
      const x = -half + ix * step;
      const idx = iz * vertsPerRow + ix;
      const s = sampler.sample(x, z);

      heights[idx] = s.height;
      ridgeFactors[idx] = s.ridgeFactor;

      const p3 = idx * 3;
      positions[p3] = x;
      positions[p3 + 1] = s.height;
      positions[p3 + 2] = z;

      const p2 = idx * 2;
      uvs[p2] = (x + half) * 0.025;
      uvs[p2 + 1] = (z + half) * 0.025;
    }
  }

  for (let iz = 0; iz <= segments; iz++) {
    const izPrev = Math.max(0, iz - 1);
    const izNext = Math.min(segments, iz + 1);
    for (let ix = 0; ix <= segments; ix++) {
      const ixPrev = Math.max(0, ix - 1);
      const ixNext = Math.min(segments, ix + 1);

      const idx = iz * vertsPerRow + ix;
      const hCenter = heights[idx];
      const hAvg =
        (heights[izPrev * vertsPerRow + ix] +
          heights[izNext * vertsPerRow + ix] +
          heights[iz * vertsPerRow + ixPrev] +
          heights[iz * vertsPerRow + ixNext]) *
        0.25;

      const concavity = THREE.MathUtils.clamp((hCenter - hAvg) / (step * 0.45), -1, 1);
      const ao = THREE.MathUtils.clamp(0.76 + concavity * 0.22 + ridgeFactors[idx] * 0.08, 0.56, 1.04);

      const c3 = idx * 3;
      colors[c3] = ao;
      colors[c3 + 1] = ao;
      colors[c3 + 2] = ao * 1.01;
    }
  }

  // Skip triangles completely submerged below -3.2m (opaque ocean sits at y=0, max trough ~ -0.86m)
  const submergedCutoff = -3.2;
  const maxIndices = segments * segments * 6;
  const rawIndices = new Uint32Array(maxIndices);

  let ptr = 0;
  for (let iz = 0; iz < segments; iz++) {
    for (let ix = 0; ix < segments; ix++) {
      const a = iz * vertsPerRow + ix;
      const b = a + 1;
      const c = (iz + 1) * vertsPerRow + ix;
      const d = c + 1;

      if (
        heights[a] > submergedCutoff ||
        heights[b] > submergedCutoff ||
        heights[c] > submergedCutoff
      ) {
        rawIndices[ptr++] = a;
        rawIndices[ptr++] = c;
        rawIndices[ptr++] = b;
      }

      if (
        heights[b] > submergedCutoff ||
        heights[c] > submergedCutoff ||
        heights[d] > submergedCutoff
      ) {
        rawIndices[ptr++] = b;
        rawIndices[ptr++] = c;
        rawIndices[ptr++] = d;
      }
    }
  }

  // Compact vertex buffers so ~42% unused deep-seabed vertices are not uploaded to GPU
  const remap = new Int32Array(vertexCount);
  remap.fill(-1);
  let compactedCount = 0;
  for (let i = 0; i < ptr; i++) {
    const oldIdx = rawIndices[i];
    if (remap[oldIdx] === -1) {
      remap[oldIdx] = compactedCount++;
    }
  }

  const compactPos = new Float32Array(compactedCount * 3);
  const compactUv = new Float32Array(compactedCount * 2);
  const compactCol = new Float32Array(compactedCount * 3);

  for (let oldIdx = 0; oldIdx < vertexCount; oldIdx++) {
    const newIdx = remap[oldIdx];
    if (newIdx === -1) continue;
    const o3 = oldIdx * 3;
    const n3 = newIdx * 3;
    compactPos[n3] = positions[o3];
    compactPos[n3 + 1] = positions[o3 + 1];
    compactPos[n3 + 2] = positions[o3 + 2];

    compactCol[n3] = colors[o3];
    compactCol[n3 + 1] = colors[o3 + 1];
    compactCol[n3 + 2] = colors[o3 + 2];

    const o2 = oldIdx * 2;
    const n2 = newIdx * 2;
    compactUv[n2] = uvs[o2];
    compactUv[n2 + 1] = uvs[o2 + 1];
  }

  const indices =
    compactedCount > 65535 ? new Uint32Array(ptr) : new Uint16Array(ptr);
  for (let i = 0; i < ptr; i++) {
    indices[i] = remap[rawIndices[i]];
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(compactPos, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(compactUv, 2));
  geometry.setAttribute('color', new THREE.BufferAttribute(compactCol, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));

  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  return geometry;
}

/**
 * Generates an angular, ultra-lightweight fractured 3D rock geometry (20 triangles)
 * for sparse coastal headland outcrops.
 */
export function createBoulderGeometry(seed: number): THREE.BufferGeometry {
  const noise = new SeededNoise(seed + 911);
  const geo = new THREE.IcosahedronGeometry(1, 0);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n1 = noise.simplex3D(v.x * 1.35 + 2.1, v.y * 1.35 - 1.4, v.z * 1.35 + 0.8);
    const disp = 0.80 + n1 * 0.24;
    v.multiplyScalar(disp);

    if (v.y < -0.35) {
      v.y = -0.35 + (v.y + 0.35) * 0.35;
    }
    pos.setXYZ(i, v.x, v.y, v.z);
  }

  pos.needsUpdate = true;
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

/**
 * Places a sparse, lightweight set of instanced coastal rocks along rocky headlands,
 * keeping mountain slopes and green foothills clean.
 */
export function createBoulderInstances(
  config: MountainConfig,
  sampler: TerrainSampler,
  boulderGeo: THREE.BufferGeometry,
  material: THREE.Material,
  isSoftwareGl: boolean,
): THREE.InstancedMesh {
  const { boulderCount, castPropShadows } = QUALITY_SPECS[config.quality];
  const instanced = new THREE.InstancedMesh(boulderGeo, material, boulderCount);
  instanced.name = 'MountainRockOutcrops';
  instanced.castShadow = !isSoftwareGl && castPropShadows;
  instanced.receiveShadow = true;
  instanced.frustumCulled = true;

  let rng = (config.seed ^ 0x5f3759df) >>> 0;
  const rand = () => {
    rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0;
    return rng / 4294967296;
  };

  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();
  const radiusLimit = config.size * 0.38;

  let placed = 0;
  let attempts = 0;
  while (placed < boulderCount && attempts < boulderCount * 40) {
    attempts++;
    const angle = rand() * Math.PI * 2;
    const dist = (0.28 + rand() * 0.72) * radiusLimit;
    const x = Math.cos(angle) * dist;
    const z = Math.sin(angle) * dist;

    const center = sampler.sample(x, z);
    // Only place sparse rocks along rocky shoreline headlands (not scattered up mountain slopes)
    if (center.height < 0.2 || center.height > 4.6) continue;

    const eps = 3.5;
    const hL = sampler.sample(x - eps, z).height;
    const hR = sampler.sample(x + eps, z).height;
    const hD = sampler.sample(x, z - eps).height;
    const hU = sampler.sample(x, z + eps).height;
    const dx = (hR - hL) / (2 * eps);
    const dz = (hU - hD) / (2 * eps);
    const slope = Math.sqrt(dx * dx + dz * dz);

    if (slope < 0.19 || slope > 0.95) continue;

    const baseScale = 2.4 + rand() * 4.4;
    const sx = baseScale * (0.85 + rand() * 0.45);
    const sy = baseScale * (0.50 + rand() * 0.38);
    const sz = baseScale * (0.85 + rand() * 0.45);

    dummy.position.set(x, center.height - sy * 0.38, z);
    dummy.rotation.set(
      (rand() - 0.5) * 0.4 + dz * 0.2,
      rand() * Math.PI * 2,
      (rand() - 0.5) * 0.4 - dx * 0.2,
    );
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();
    instanced.setMatrixAt(placed, dummy.matrix);

    const shade = 0.85 + rand() * 0.2;
    tint.setRGB(shade, shade * (0.98 + rand() * 0.03), shade * (0.96 + rand() * 0.04));
    instanced.setColorAt(placed, tint);
    placed++;
  }

  instanced.count = placed;
  instanced.instanceMatrix.needsUpdate = true;
  if (instanced.instanceColor) {
    instanced.instanceColor.needsUpdate = true;
  }
  instanced.computeBoundingSphere();

  return instanced;
}
