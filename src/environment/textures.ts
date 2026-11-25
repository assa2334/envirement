import * as THREE from 'three';

export interface PbrTextureSet {
  diffuse: THREE.Texture;
  normal: THREE.Texture;
  roughness: THREE.Texture;
}

export interface MountainTextures {
  cliff: PbrTextureSet;
  base: PbrTextureSet;
  dispose: () => void;
}

function configureTexture(
  texture: THREE.Texture,
  isColor: boolean,
  anisotropy: number,
  repeat = 1,
): THREE.Texture {
  texture.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = anisotropy;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

function createProceduralFallbackSet(anisotropy: number, baseTint: [number, number, number]): PbrTextureSet {
  const size = 256;

  const diffCanvas = document.createElement('canvas');
  diffCanvas.width = size;
  diffCanvas.height = size;
  const dCtx = diffCanvas.getContext('2d')!;
  const dImg = dCtx.createImageData(size, size);

  const normCanvas = document.createElement('canvas');
  normCanvas.width = size;
  normCanvas.height = size;
  const nCtx = normCanvas.getContext('2d')!;
  const nImg = nCtx.createImageData(size, size);

  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = size;
  roughCanvas.height = size;
  const rCtx = roughCanvas.getContext('2d')!;
  const rImg = rCtx.createImageData(size, size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const grain = Math.sin(x * 0.19 + Math.cos(y * 0.13) * 2.2) * 0.5 + 0.5;
      const micro = ((x * 73856093) ^ (y * 19349663)) & 31;
      const v = 0.78 + grain * 0.2 + (micro / 31) * 0.12;

      dImg.data[idx] = Math.min(255, Math.round(baseTint[0] * v));
      dImg.data[idx + 1] = Math.min(255, Math.round(baseTint[1] * v));
      dImg.data[idx + 2] = Math.min(255, Math.round(baseTint[2] * v));
      dImg.data[idx + 3] = 255;

      nImg.data[idx] = 128 + Math.round((grain - 0.5) * 26);
      nImg.data[idx + 1] = 128 + Math.round(((micro / 31) - 0.5) * 22);
      nImg.data[idx + 2] = 246;
      nImg.data[idx + 3] = 255;

      const rVal = Math.round(200 + (1 - grain) * 45);
      rImg.data[idx] = rVal;
      rImg.data[idx + 1] = rVal;
      rImg.data[idx + 2] = rVal;
      rImg.data[idx + 3] = 255;
    }
  }

  dCtx.putImageData(dImg, 0, 0);
  nCtx.putImageData(nImg, 0, 0);
  rCtx.putImageData(rImg, 0, 0);

  return {
    diffuse: configureTexture(new THREE.CanvasTexture(diffCanvas), true, anisotropy),
    normal: configureTexture(new THREE.CanvasTexture(normCanvas), false, anisotropy),
    roughness: configureTexture(new THREE.CanvasTexture(roughCanvas), false, anisotropy),
  };
}

function loadSingleTexture(
  loader: THREE.TextureLoader,
  url: string,
  isColor: boolean,
  anisotropy: number,
): Promise<THREE.Texture> {
  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (tex) => resolve(configureTexture(tex, isColor, anisotropy)),
      undefined,
      (err) => reject(err),
    );
  });
}

async function loadTextureSet(
  loader: THREE.TextureLoader,
  folder: string,
  anisotropy: number,
  fallbackTint: [number, number, number],
): Promise<PbrTextureSet> {
  try {
    const [diffuse, normal, roughness] = await Promise.all([
      loadSingleTexture(loader, `${folder}/diff_1k.jpg`, true, anisotropy),
      loadSingleTexture(loader, `${folder}/nor_gl_1k.jpg`, false, anisotropy),
      loadSingleTexture(loader, `${folder}/rough_1k.jpg`, false, anisotropy),
    ]);
    return { diffuse, normal, roughness };
  } catch {
    return createProceduralFallbackSet(anisotropy, fallbackTint);
  }
}

/**
 * Loads the verified CC0 1K PBR rock (Poly Haven aerial_rocks_02) and grass
 * (ambientCG Grass004) texture sets stored locally under /textures/.
 */
export async function loadMountainTextures(
  renderer: THREE.WebGLRenderer,
  maxAnisotropyCap = 8,
): Promise<MountainTextures> {
  const anisotropy = Math.min(
    maxAnisotropyCap,
    Math.max(1, renderer.capabilities.getMaxAnisotropy()),
  );
  const loader = new THREE.TextureLoader();

  const [cliff, base] = await Promise.all([
    loadTextureSet(loader, '/textures/aerial_rocks_02', anisotropy, [118, 114, 108]),
    loadTextureSet(loader, '/textures/grass', anisotropy, [86, 116, 48]),
  ]);

  return {
    cliff,
    base,
    dispose: () => {
      cliff.diffuse.dispose();
      cliff.normal.dispose();
      cliff.roughness.dispose();
      base.diffuse.dispose();
      base.normal.dispose();
      base.roughness.dispose();
    },
  };
}
