import * as THREE from 'three';
import {
  LIGHTING_PRESETS,
  QUALITY_SPECS,
  type LightingPreset,
  type LightingPresetId,
  type QualityPreset,
} from './types';

export interface AtmosphereController {
  sunLight: THREE.DirectionalLight;
  hemiLight: THREE.HemisphereLight;
  fillLight: THREE.DirectionalLight;
  skyDome: THREE.Mesh;
  sunDirection: THREE.Vector3;
  applyPreset: (id: LightingPresetId) => void;
  setSunAngles: (elevationDeg: number, azimuthDeg: number) => void;
  setFogDensity: (density: number) => void;
  updateShadowQuality: (quality: QualityPreset, isSoftwareGl: boolean) => void;
  dispose: () => void;
}

const _sunDir = new THREE.Vector3();

function computeSunDirection(elevationDeg: number, azimuthDeg: number, out: THREE.Vector3): THREE.Vector3 {
  const phi = THREE.MathUtils.degToRad(90 - elevationDeg);
  const theta = THREE.MathUtils.degToRad(azimuthDeg);
  out.setFromSphericalCoords(1, phi, theta).normalize();
  return out;
}

/**
 * Generates a lightweight outdoor Sky-Ocean gradient scene for PMREM IBL
 * so rocky cliffs and wet coastal rocks reflect natural sky and ocean bounce.
 */
function createOutdoorSkyEnvironment(renderer: THREE.WebGLRenderer, preset: LightingPreset): THREE.WebGLRenderTarget {
  const envScene = new THREE.Scene();
  const envGeo = new THREE.SphereGeometry(20, 16, 10);
  const envMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uZenith: { value: new THREE.Color(preset.skyZenith) },
      uHorizon: { value: new THREE.Color(preset.skyHorizon) },
      uOceanBounce: { value: new THREE.Color(0x0c4a6e) },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uZenith;
      uniform vec3 uHorizon;
      uniform vec3 uOceanBounce;
      varying vec3 vDir;
      void main() {
        float y = vDir.y;
        vec3 upCol = mix(uHorizon, uZenith, pow(clamp(y, 0.0, 1.0), 0.58));
        vec3 downCol = mix(uHorizon * 0.72, uOceanBounce, smoothstep(0.0, -0.55, y));
        vec3 col = y >= 0.0 ? upCol : downCol;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const dome = new THREE.Mesh(envGeo, envMat);
  envScene.add(dome);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const target = pmrem.fromScene(envScene, 0.035);
  envGeo.dispose();
  envMat.dispose();
  pmrem.dispose();
  return target;
}

/**
 * Sets up physically balanced tropical outdoor lighting: warm sun with static shadow map,
 * cool ocean-sky hemisphere fill, opposite scatter fill, outdoor sky-ocean IBL,
 * horizon-matched distance fog, and a procedural sky dome with Rayleigh/Mie glow.
 */
export function createAtmosphereRig(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  initialPresetId: LightingPresetId,
  quality: QualityPreset,
  isSoftwareGl: boolean,
): AtmosphereController {
  const initialPreset = LIGHTING_PRESETS[initialPresetId];

  const envTarget = createOutdoorSkyEnvironment(renderer, initialPreset);
  scene.environment = envTarget.texture;
  scene.environmentIntensity = 0.55;

  const fog = new THREE.FogExp2(initialPreset.fogColor, initialPreset.fogDensity);
  scene.fog = fog;
  scene.background = new THREE.Color(initialPreset.skyHorizon);

  const sunLight = new THREE.DirectionalLight(initialPreset.sunColor, initialPreset.sunIntensity);
  sunLight.name = 'SunDirectionalLight';
  sunLight.castShadow = !isSoftwareGl;

  const shadowSize = QUALITY_SPECS[quality].shadowMapSize;
  sunLight.shadow.mapSize.set(shadowSize, shadowSize);
  // Cover entire 1.2km island massif & headlands cleanly without clipped shadow edges
  const frustum = 560;
  sunLight.shadow.camera.left = -frustum;
  sunLight.shadow.camera.right = frustum;
  sunLight.shadow.camera.top = frustum;
  sunLight.shadow.camera.bottom = -frustum;
  sunLight.shadow.camera.near = 180;
  sunLight.shadow.camera.far = 1750;
  sunLight.shadow.bias = -0.00045;
  sunLight.shadow.normalBias = 0.14;
  sunLight.shadow.radius = 2.0;

  sunLight.target.position.set(0, 40, 0);
  scene.add(sunLight);
  scene.add(sunLight.target);

  const hemiLight = new THREE.HemisphereLight(
    initialPreset.hemiSkyColor,
    initialPreset.hemiGroundColor,
    initialPreset.hemiIntensity,
  );
  hemiLight.name = 'SkyHemisphereLight';
  hemiLight.position.set(0, 400, 0);
  scene.add(hemiLight);

  const fillLight = new THREE.DirectionalLight(initialPreset.fillColor, initialPreset.fillIntensity);
  fillLight.name = 'SkyScatterFillLight';
  fillLight.castShadow = false;
  scene.add(fillLight);

  const skyUniforms = {
    uZenithColor: { value: new THREE.Color(initialPreset.skyZenith) },
    uHorizonColor: { value: new THREE.Color(initialPreset.skyHorizon) },
    uSunColor: { value: new THREE.Color(initialPreset.sunColor) },
    uSunDirection: { value: new THREE.Vector3(0.4, 0.5, 0.7).normalize() },
  };

  const skyGeo = new THREE.SphereGeometry(4600, 24, 12);
  const skyMat = new THREE.ShaderMaterial({
    name: 'ProceduralSkyDome',
    uniforms: skyUniforms,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: `
      varying vec3 vWorldDir;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldDir = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform vec3 uZenithColor;
      uniform vec3 uHorizonColor;
      uniform vec3 uSunColor;
      uniform vec3 uSunDirection;
      varying vec3 vWorldDir;
      void main() {
        vec3 dir = normalize(vWorldDir);
        float h = clamp(dir.y, 0.0, 1.0);
        vec3 sky = mix(uHorizonColor, uZenithColor, pow(h, 0.50));

        vec3 sunDir = normalize(uSunDirection);
        float sunDot = max(dot(dir, sunDir), 0.0);
        float horizonMie = (1.0 - smoothstep(0.0, 0.28, h)) * pow(sunDot, 2.5) * 0.22;
        float softHalo = pow(sunDot, 7.0) * 0.20 + pow(sunDot, 84.0) * 0.44;
        float solarDisc = smoothstep(0.9991, 0.99975, sunDot) * 2.5;
        sky += uSunColor * (horizonMie + softHalo + solarDisc);

        gl_FragColor = vec4(sky, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });

  const skyDome = new THREE.Mesh(skyGeo, skyMat);
  skyDome.name = 'AtmosphericSkyDome';
  scene.add(skyDome);

  // Static terrain & outcrops: only update shadow map when sun or quality changes
  renderer.shadowMap.autoUpdate = false;

  const sunDirection = new THREE.Vector3();

  const setSunAngles = (elevationDeg: number, azimuthDeg: number) => {
    computeSunDirection(elevationDeg, azimuthDeg, _sunDir);
    sunDirection.copy(_sunDir);
    sunLight.position.copy(_sunDir).multiplyScalar(880);
    sunLight.position.y = Math.max(sunLight.position.y, 85);
    fillLight.position.set(-_sunDir.x * 600, 260, -_sunDir.z * 600);
    skyUniforms.uSunDirection.value.copy(_sunDir);
    renderer.shadowMap.needsUpdate = true;
  };

  const applyPreset = (id: LightingPresetId) => {
    const p: LightingPreset = LIGHTING_PRESETS[id];
    sunLight.color.setHex(p.sunColor);
    sunLight.intensity = p.sunIntensity;
    hemiLight.color.setHex(p.hemiSkyColor);
    hemiLight.groundColor.setHex(p.hemiGroundColor);
    hemiLight.intensity = p.hemiIntensity;
    fillLight.color.setHex(p.fillColor);
    fillLight.intensity = p.fillIntensity;

    skyUniforms.uZenithColor.value.setHex(p.skyZenith);
    skyUniforms.uHorizonColor.value.setHex(p.skyHorizon);
    skyUniforms.uSunColor.value.setHex(p.sunColor);

    fog.color.setHex(p.fogColor);
    fog.density = p.fogDensity;
    if (scene.background instanceof THREE.Color) {
      scene.background.setHex(p.skyHorizon);
    }
    renderer.toneMappingExposure = p.exposure;
    setSunAngles(p.sunElevation, p.sunAzimuth);
  };

  applyPreset(initialPresetId);

  return {
    sunLight,
    hemiLight,
    fillLight,
    skyDome,
    sunDirection,
    applyPreset,
    setSunAngles,
    setFogDensity: (density: number) => {
      fog.density = density;
    },
    updateShadowQuality: (nextQuality: QualityPreset, softwareGl: boolean) => {
      sunLight.castShadow = !softwareGl;
      const size = QUALITY_SPECS[nextQuality].shadowMapSize;
      if (sunLight.shadow.mapSize.width !== size) {
        sunLight.shadow.mapSize.set(size, size);
        sunLight.shadow.map?.dispose();
        sunLight.shadow.map = null;
      }
      renderer.shadowMap.needsUpdate = true;
    },
    dispose: () => {
      skyGeo.dispose();
      skyMat.dispose();
      envTarget.dispose();
      sunLight.shadow.map?.dispose();
      scene.remove(sunLight, sunLight.target, hemiLight, fillLight, skyDome);
    },
  };
}
