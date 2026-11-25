import * as THREE from 'three';
import { SeededNoise, smoothstep } from './noise';

export interface DistantIslandSpec {
  id: string;
  x: number;
  z: number;
  radius: number;
  maxHeight: number;
  seedOffset: number;
  segments: number;
  angle: number;
  stretch: number;
  ridgeStyle: 'caldera' | 'knife' | 'twin' | 'spire' | 'massif' | 'chain';
}

export const DISTANT_ISLAND_SPECS: DistantIslandSpec[] = [
  {
    id: 'east-volcanic-isle',
    x: 1080,
    z: -420,
    radius: 300,
    maxHeight: 146,
    seedOffset: 101,
    segments: 30,
    angle: 0.48,
    stretch: 1.24,
    ridgeStyle: 'caldera',
  },
  {
    id: 'south-atoll-ridge',
    x: -740,
    z: 1060,
    radius: 270,
    maxHeight: 108,
    seedOffset: 207,
    segments: 26,
    angle: -0.72,
    stretch: 1.48,
    ridgeStyle: 'knife',
  },
  {
    id: 'northwest-twin-peaks',
    x: -1190,
    z: -860,
    radius: 350,
    maxHeight: 162,
    seedOffset: 313,
    segments: 28,
    angle: 1.12,
    stretch: 1.32,
    ridgeStyle: 'twin',
  },
  {
    id: 'northeast-spire',
    x: 920,
    z: 1180,
    radius: 225,
    maxHeight: 96,
    seedOffset: 419,
    segments: 24,
    angle: 2.15,
    stretch: 1.18,
    ridgeStyle: 'spire',
  },
  {
    id: 'far-west-silhouette',
    x: -1820,
    z: 240,
    radius: 410,
    maxHeight: 178,
    seedOffset: 523,
    segments: 26,
    angle: -0.25,
    stretch: 1.38,
    ridgeStyle: 'massif',
  },
  {
    id: 'southeast-mountain-chain',
    x: 1520,
    z: 490,
    radius: 360,
    maxHeight: 165,
    seedOffset: 631,
    segments: 26,
    angle: 1.42,
    stretch: 1.56,
    ridgeStyle: 'chain',
  },
  {
    id: 'north-crag-island',
    x: -240,
    z: -1460,
    radius: 325,
    maxHeight: 154,
    seedOffset: 743,
    segments: 26,
    angle: -0.35,
    stretch: 1.34,
    ridgeStyle: 'twin',
  },
  {
    id: 'southwest-caldera-ridge',
    x: -1380,
    z: 1420,
    radius: 340,
    maxHeight: 148,
    seedOffset: 857,
    segments: 24,
    angle: 0.85,
    stretch: 1.28,
    ridgeStyle: 'chain',
  },
];

function createSingleIslandGeometry(spec: DistantIslandSpec, baseSeed: number): THREE.BufferGeometry {
  const noise = new SeededNoise(baseSeed + spec.seedOffset);
  const segs = spec.segments;
  const extent = spec.radius * 2.45;
  const half = extent * 0.5;
  const step = extent / segs;
  const vertsPerRow = segs + 1;
  const vertexCount = vertsPerRow * vertsPerRow;

  const positions = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const colors = new Float32Array(vertexCount * 3);
  const heights = new Float32Array(vertexCount);

  const cosA = Math.cos(spec.angle);
  const sinA = Math.sin(spec.angle);

  for (let iz = 0; iz <= segs; iz++) {
    const lz = -half + iz * step;
    for (let ix = 0; ix <= segs; ix++) {
      const lx = -half + ix * step;
      const idx = iz * vertsPerRow + ix;

      const wx = lx + spec.x;
      const wz = lz + spec.z;

      const rx = (lx * cosA - lz * sinA) / spec.stretch;
      const rz = (lx * sinA + lz * cosA) * Math.sqrt(spec.stretch);
      const baseR = Math.hypot(rx, rz) / spec.radius;
      const az = Math.atan2(rz, rx);
      const coastWarp =
        noise.fbm2D(lx * 0.0044 + 3.1, lz * 0.0044 - 2.4, 3) * 0.24 +
        Math.sin(az * 3.0 + spec.seedOffset) * 0.075 +
        Math.cos(az * 5.0 - spec.seedOffset * 0.5) * 0.035;
      const r = baseR + coastWarp;

      const mask = 1 - smoothstep(0.30, 1.01, r);
      const shelf = -12.0 * smoothstep(0.84, 1.24, r);

      const ridge = noise.ridgedMultifractal2D(lx * 0.0056 + 1.7, lz * 0.0056 - 4.1, 4, 2.08, 0.52);
      const mass = noise.fbm2D(lx * 0.0048 - 2.2, lz * 0.0048 + 6.4, 3) * 0.5 + 0.5;

      let envelope = 0;
      if (spec.ridgeStyle === 'caldera') {
        const ringDist = Math.abs(baseR - 0.24) / 0.28;
        envelope = Math.exp(-baseR * baseR * 2.1) * 0.72 + Math.exp(-ringDist * ringDist * 1.9) * 0.38;
      } else if (spec.ridgeStyle === 'knife') {
        envelope = Math.exp(-((rx / (spec.radius * 0.52)) ** 2 + (rz / (spec.radius * 0.24)) ** 2) * 1.45);
      } else if (spec.ridgeStyle === 'spire') {
        envelope = Math.exp(-baseR * baseR * 3.4) * 1.05;
      } else if (spec.ridgeStyle === 'chain') {
        const p1 = Math.exp(-((rx - spec.radius * 0.32) ** 2 + (rz + spec.radius * 0.05) ** 2) / (spec.radius * spec.radius * 0.14)) * 0.96;
        const p2 = Math.exp(-(rx ** 2 + (rz - spec.radius * 0.08) ** 2) / (spec.radius * spec.radius * 0.16)) * 1.04;
        const p3 = Math.exp(-((rx + spec.radius * 0.34) ** 2 + (rz + spec.radius * 0.06) ** 2) / (spec.radius * spec.radius * 0.13)) * 0.84;
        envelope = Math.min(1.12, Math.max(p1, p2, p3) + (p1 + p2 + p3) * 0.1);
      } else {
        const p1 = Math.exp(-((rx - spec.radius * 0.22) ** 2 + (rz + spec.radius * 0.08) ** 2) / (spec.radius * spec.radius * 0.22)) * 0.98;
        const p2 = Math.exp(-((rx + spec.radius * 0.26) ** 2 + (rz - spec.radius * 0.14) ** 2) / (spec.radius * spec.radius * 0.19)) * 0.78;
        envelope = Math.min(1.08, Math.max(p1, p2) + (p1 + p2) * 0.14);
      }

      const h = mask * envelope * (0.28 + mass * 0.34 + ridge * 0.48) * spec.maxHeight + shelf;
      heights[idx] = h;

      const p3 = idx * 3;
      positions[p3] = wx;
      positions[p3 + 1] = h;
      positions[p3 + 2] = wz;

      const p2 = idx * 2;
      uvs[p2] = (wx + 800) * 0.025;
      uvs[p2 + 1] = (wz + 800) * 0.025;

      const ao = 0.78 + Math.min(0.24, Math.max(-0.18, h * 0.0022));
      colors[p3] = ao;
      colors[p3 + 1] = ao;
      colors[p3 + 2] = ao * 1.01;
    }
  }

  const submergedCutoff = -2.8;
  const rawIndices = new Uint32Array(segs * segs * 6);
  let ptr = 0;
  for (let iz = 0; iz < segs; iz++) {
    for (let ix = 0; ix < segs; ix++) {
      const a = iz * vertsPerRow + ix;
      const b = a + 1;
      const c = (iz + 1) * vertsPerRow + ix;
      const d = c + 1;

      if (heights[a] > submergedCutoff || heights[b] > submergedCutoff || heights[c] > submergedCutoff) {
        rawIndices[ptr++] = a;
        rawIndices[ptr++] = c;
        rawIndices[ptr++] = b;
      }
      if (heights[b] > submergedCutoff || heights[c] > submergedCutoff || heights[d] > submergedCutoff) {
        rawIndices[ptr++] = b;
        rawIndices[ptr++] = c;
        rawIndices[ptr++] = d;
      }
    }
  }

  const remap = new Int32Array(vertexCount);
  remap.fill(-1);
  let compactedCount = 0;
  for (let i = 0; i < ptr; i++) {
    const oldIdx = rawIndices[i];
    if (remap[oldIdx] === -1) remap[oldIdx] = compactedCount++;
  }

  const cPos = new Float32Array(compactedCount * 3);
  const cUv = new Float32Array(compactedCount * 2);
  const cCol = new Float32Array(compactedCount * 3);
  for (let oldIdx = 0; oldIdx < vertexCount; oldIdx++) {
    const newIdx = remap[oldIdx];
    if (newIdx === -1) continue;
    const o3 = oldIdx * 3;
    const n3 = newIdx * 3;
    cPos[n3] = positions[o3];
    cPos[n3 + 1] = positions[o3 + 1];
    cPos[n3 + 2] = positions[o3 + 2];
    cCol[n3] = colors[o3];
    cCol[n3 + 1] = colors[o3 + 1];
    cCol[n3 + 2] = colors[o3 + 2];
    const o2 = oldIdx * 2;
    const n2 = newIdx * 2;
    cUv[n2] = uvs[o2];
    cUv[n2 + 1] = uvs[o2 + 1];
  }

  const indices = new Uint16Array(ptr);
  for (let i = 0; i < ptr; i++) indices[i] = remap[rawIndices[i]];

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(cPos, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(cUv, 2));
  geometry.setAttribute('color', new THREE.BufferAttribute(cCol, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  return geometry;
}

export interface DistantIslandRig {
  group: THREE.Group;
  dispose: () => void;
}

/**
 * Builds distant satellite islands and mountain silhouettes around the main island,
 * merged into a single BufferGeometry (1 draw call) sharing the primary terrain PBR shader.
 */
export function createDistantIslands(
  seed: number,
  sharedTerrainMaterial: THREE.Material,
): DistantIslandRig {
  const group = new THREE.Group();
  group.name = 'DistantArchipelagoIslands';

  const parts = DISTANT_ISLAND_SPECS.map((spec) => createSingleIslandGeometry(spec, seed));

  let totalVerts = 0;
  let totalIndices = 0;
  for (const part of parts) {
    totalVerts += part.attributes.position.count;
    totalIndices += part.index ? part.index.count : 0;
  }

  const mergedPos = new Float32Array(totalVerts * 3);
  const mergedNorm = new Float32Array(totalVerts * 3);
  const mergedUv = new Float32Array(totalVerts * 2);
  const mergedColor = new Float32Array(totalVerts * 3);
  const mergedIndex =
    totalVerts > 65535 ? new Uint32Array(totalIndices) : new Uint16Array(totalIndices);

  let vOffset = 0;
  let iOffset = 0;
  for (const part of parts) {
    const p = part.attributes.position.array as Float32Array;
    const n = part.attributes.normal.array as Float32Array;
    const u = part.attributes.uv.array as Float32Array;
    const c = part.attributes.color.array as Float32Array;

    mergedPos.set(p, vOffset * 3);
    mergedNorm.set(n, vOffset * 3);
    mergedUv.set(u, vOffset * 2);
    mergedColor.set(c, vOffset * 3);

    if (part.index) {
      const idxArr = part.index.array;
      for (let k = 0; k < idxArr.length; k++) {
        mergedIndex[iOffset + k] = idxArr[k] + vOffset;
      }
      iOffset += idxArr.length;
    }
    vOffset += part.attributes.position.count;
    part.dispose();
  }

  const mergedGeo = new THREE.BufferGeometry();
  mergedGeo.setAttribute('position', new THREE.BufferAttribute(mergedPos, 3));
  mergedGeo.setAttribute('normal', new THREE.BufferAttribute(mergedNorm, 3));
  mergedGeo.setAttribute('uv', new THREE.BufferAttribute(mergedUv, 2));
  mergedGeo.setAttribute('color', new THREE.BufferAttribute(mergedColor, 3));
  mergedGeo.setIndex(new THREE.BufferAttribute(mergedIndex, 1));
  mergedGeo.computeBoundingBox();
  mergedGeo.computeBoundingSphere();

  const mesh = new THREE.Mesh(mergedGeo, sharedTerrainMaterial);
  mesh.name = 'DistantArchipelagoMergedMesh';
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  group.add(mesh);

  return {
    group,
    dispose: () => {
      mergedGeo.dispose();
      group.clear();
    },
  };
}
