import { useEffect, useImperativeHandle, useRef, useState, forwardRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  CAMERA_PRESETS,
  LIGHTING_PRESETS,
  MountainEnvironment,
  QUALITY_SPECS,
  type LightingPresetId,
  type QualityPreset,
} from '../environment';

export interface MountainViewportHandle {
  exportGLB: () => Promise<void>;
  zoomIn: () => void;
  zoomOut: () => void;
  resetCamera: () => void;
}

interface MountainViewportProps {
  cameraPresetId: string;
  cameraTrigger: number;
  lightingPreset: LightingPresetId;
  sunElevation: number;
  sunAzimuth: number;
  fogDensity: number;
  quality: QualityPreset;
  wireframe: boolean;
  slopeInspect: boolean;
  autoOrbit: boolean;
  onUserOrbitStart?: () => void;
}

const _targetPos = new THREE.Vector3();
const _targetLook = new THREE.Vector3();
const _zoomOffset = new THREE.Vector3();

function detectSoftwareWebGL(): boolean {
  const probeCanvas = document.createElement('canvas');
  const gl = probeCanvas.getContext('webgl2') || probeCanvas.getContext('webgl');
  if (!gl) return true;
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
  const gpu = String(gl.getParameter(param) ?? '');
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
}

export const MountainViewport = forwardRef<MountainViewportHandle, MountainViewportProps>(
  function MountainViewport(
    {
      cameraPresetId,
      cameraTrigger,
      lightingPreset,
      sunElevation,
      sunAzimuth,
      fogDensity,
      quality,
      wireframe,
      slopeInspect,
      autoOrbit,
      onUserOrbitStart,
    },
    ref,
  ) {
    const mountRef = useRef<HTMLDivElement | null>(null);
    const envRef = useRef<MountainEnvironment | null>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const controlsRef = useRef<OrbitControls | null>(null);
    const isSoftwareGlRef = useRef(false);
    const cameraAnimRef = useRef<{
      active: boolean;
      pos: THREE.Vector3;
      target: THREE.Vector3;
    }>({
      active: false,
      pos: new THREE.Vector3(...CAMERA_PRESETS[0].position),
      target: new THREE.Vector3(...CAMERA_PRESETS[0].target),
    });
    const autoOrbitRef = useRef(autoOrbit);
    autoOrbitRef.current = autoOrbit;

    const onUserOrbitStartRef = useRef(onUserOrbitStart);
    onUserOrbitStartRef.current = onUserOrbitStart;

    const [ready, setReady] = useState(false);
    const [contextLost, setContextLost] = useState(false);

    const applyControlsZoom = (scaleFactor: number) => {
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      if (!camera || !controls) return;

      const baseTarget = cameraAnimRef.current.active
        ? cameraAnimRef.current.target
        : controls.target;
      const basePos = cameraAnimRef.current.active
        ? cameraAnimRef.current.pos
        : camera.position;

      _zoomOffset.copy(basePos).sub(baseTarget);
      const currentDist = _zoomOffset.length();
      const clampedDist = THREE.MathUtils.clamp(
        currentDist * scaleFactor,
        controls.minDistance,
        controls.maxDistance,
      );

      if (currentDist > 1e-4) {
        _zoomOffset.multiplyScalar(clampedDist / currentDist);
      } else {
        _zoomOffset.set(0, clampedDist * 0.45, clampedDist);
      }

      if (isSoftwareGlRef.current) {
        cameraAnimRef.current.active = false;
        camera.position.copy(controls.target).add(_zoomOffset);
        controls.update();
      } else {
        cameraAnimRef.current.target.copy(baseTarget);
        cameraAnimRef.current.pos.copy(baseTarget).add(_zoomOffset);
        cameraAnimRef.current.active = true;
      }
    };

    useImperativeHandle(ref, () => ({
      exportGLB: async () => {
        const env = envRef.current;
        if (!env) return;
        const blob = await env.exportGLB();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `tropical-mountain-island-${env.config.quality}.glb`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
      },
      zoomIn: () => {
        applyControlsZoom(0.76);
      },
      zoomOut: () => {
        applyControlsZoom(1.3);
      },
      resetCamera: () => {
        const camera = cameraRef.current;
        const controls = controlsRef.current;
        if (!camera || !controls) return;
        const overview = CAMERA_PRESETS[0];
        if (isSoftwareGlRef.current) {
          cameraAnimRef.current.active = false;
          camera.position.set(...overview.position);
          controls.target.set(...overview.target);
          controls.update();
        } else {
          cameraAnimRef.current.pos.set(...overview.position);
          cameraAnimRef.current.target.set(...overview.target);
          cameraAnimRef.current.active = true;
        }
      },
    }));

    // Initialize Three.js WebGL scene once
    useEffect(() => {
      const container = mountRef.current;
      if (!container) return;

      let disposed = false;
      let frameId = 0;
      let timerId = 0;
      let lastTime = performance.now();
      let elapsedSeconds = 0;

      const isSoftwareGl = detectSoftwareWebGL();

      let renderer: THREE.WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({
          antialias: !isSoftwareGl,
          powerPreference: 'high-performance',
        });
      } catch {
        setContextLost(true);
        return;
      }

      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = LIGHTING_PRESETS[lightingPreset].exposure;
      renderer.setPixelRatio(
        isSoftwareGl
          ? 1
          : Math.min(window.devicePixelRatio || 1, QUALITY_SPECS[quality].maxPixelRatio),
      );
      renderer.setSize(
        container.clientWidth || window.innerWidth,
        container.clientHeight || window.innerHeight,
      );
      renderer.shadowMap.enabled = !isSoftwareGl;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;

      const canvas = renderer.domElement;
      canvas.style.display = 'block';
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      container.appendChild(canvas);

      const handleContextLost = (e: Event) => {
        e.preventDefault();
        setContextLost(true);
      };
      const handleContextRestored = () => {
        setContextLost(false);
      };
      canvas.addEventListener('webglcontextlost', handleContextLost);
      canvas.addEventListener('webglcontextrestored', handleContextRestored);

      const scene = new THREE.Scene();
      const aspect =
        (container.clientWidth || window.innerWidth) /
        Math.max(1, container.clientHeight || window.innerHeight);
      const camera = new THREE.PerspectiveCamera(46, aspect, 1.5, 8000);
      const initialPreset = CAMERA_PRESETS[0];
      camera.position.set(...initialPreset.position);

      const controls = new OrbitControls(camera, canvas);
      controls.target.set(...initialPreset.target);
      controls.enableDamping = !isSoftwareGl;
      controls.dampingFactor = 0.065;
      controls.rotateSpeed = 0.72;
      controls.zoomSpeed = 0.9;
      controls.panSpeed = 0.85;
      controls.screenSpacePanning = false;
      controls.minDistance = 65;
      controls.maxDistance = 1650;
      controls.maxPolarAngle = Math.PI * 0.492;
      controls.minPolarAngle = 0.08;
      controls.autoRotate = !isSoftwareGl && autoOrbitRef.current;
      controls.autoRotateSpeed = 0.45;
      controls.update();

      cameraRef.current = camera;
      controlsRef.current = controls;
      isSoftwareGlRef.current = isSoftwareGl;

      const afterDraw = (cb: () => void) => {
        const gl = renderer.getContext() as WebGL2RenderingContext;
        if (typeof gl.fenceSync === 'function') {
          const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
          gl.flush();
          const poll = () => {
            if (disposed) return;
            const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
            if (state === gl.UNSIGNALED) {
              timerId = window.setTimeout(poll, 5);
            } else {
              if (sync) gl.deleteSync(sync);
              timerId = window.setTimeout(cb, 80);
            }
          };
          timerId = window.setTimeout(poll, 5);
        } else {
          timerId = window.setTimeout(cb, 80);
        }
      };

      const tick = () => {
        if (disposed) return;
        const now = performance.now();
        const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
        lastTime = now;
        elapsedSeconds += dt;

        // Smooth damped camera preset / zoom transitions
        if (cameraAnimRef.current.active) {
          _targetPos.copy(cameraAnimRef.current.pos);
          _targetLook.copy(cameraAnimRef.current.target);

          const lambda = 5.5;
          camera.position.x = THREE.MathUtils.damp(camera.position.x, _targetPos.x, lambda, dt);
          camera.position.y = THREE.MathUtils.damp(camera.position.y, _targetPos.y, lambda, dt);
          camera.position.z = THREE.MathUtils.damp(camera.position.z, _targetPos.z, lambda, dt);

          controls.target.x = THREE.MathUtils.damp(controls.target.x, _targetLook.x, lambda, dt);
          controls.target.y = THREE.MathUtils.damp(controls.target.y, _targetLook.y, lambda, dt);
          controls.target.z = THREE.MathUtils.damp(controls.target.z, _targetLook.z, lambda, dt);

          const posDone = camera.position.distanceToSquared(_targetPos) < 0.35;
          const targetDone = controls.target.distanceToSquared(_targetLook) < 0.25;
          if (posDone && targetDone) {
            camera.position.copy(_targetPos);
            controls.target.copy(_targetLook);
            cameraAnimRef.current.active = false;
          }
        }

        controls.autoRotate = !isSoftwareGl && autoOrbitRef.current && !cameraAnimRef.current.active;
        controls.update();

        envRef.current?.update(dt, elapsedSeconds);
        renderer.render(scene, camera);

        if (isSoftwareGl) {
          afterDraw(tick);
        } else {
          frameId = requestAnimationFrame(tick);
        }
      };

      const handleControlsStart = () => {
        cameraAnimRef.current.active = false;
        onUserOrbitStartRef.current?.();
      };
      controls.addEventListener('start', handleControlsStart);

      const handleResize = () => {
        if (!container || disposed) return;
        const w = container.clientWidth || window.innerWidth;
        const h = Math.max(1, container.clientHeight || window.innerHeight);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      };
      window.addEventListener('resize', handleResize);

      MountainEnvironment.create(renderer, scene, {
        quality,
        lightingPreset,
        isSoftwareGl,
      }).then((env) => {
        if (disposed) {
          env.dispose();
          return;
        }
        envRef.current = env;
        if (!isSoftwareGl) {
          renderer.compile(scene, camera);
        }
        setReady(true);
        lastTime = performance.now();
        frameId = requestAnimationFrame(tick);
      });

      return () => {
        disposed = true;
        cancelAnimationFrame(frameId);
        clearTimeout(timerId);
        window.removeEventListener('resize', handleResize);
        controls.removeEventListener('start', handleControlsStart);
        controls.dispose();
        cameraRef.current = null;
        controlsRef.current = null;
        canvas.removeEventListener('webglcontextlost', handleContextLost);
        canvas.removeEventListener('webglcontextrestored', handleContextRestored);

        if (envRef.current) {
          scene.remove(envRef.current.group);
          envRef.current.dispose();
          envRef.current = null;
        }
        renderer.dispose();
        if (canvas.parentNode === container) {
          container.removeChild(canvas);
        }
      };
    }, []);

    useEffect(() => {
      if (!ready) return;
      const preset = CAMERA_PRESETS.find((p) => p.id === cameraPresetId);
      if (!preset) return;
      cameraAnimRef.current.pos.set(...preset.position);
      cameraAnimRef.current.target.set(...preset.target);
      cameraAnimRef.current.active = true;
    }, [cameraPresetId, cameraTrigger, ready]);

    useEffect(() => {
      envRef.current?.setLightingPreset(lightingPreset);
    }, [lightingPreset]);

    useEffect(() => {
      envRef.current?.setSunAngles(sunElevation, sunAzimuth);
    }, [sunElevation, sunAzimuth]);

    useEffect(() => {
      envRef.current?.setFogDensity(fogDensity);
    }, [fogDensity]);

    useEffect(() => {
      envRef.current?.setQuality(quality);
    }, [quality]);

    useEffect(() => {
      envRef.current?.setWireframe(wireframe);
    }, [wireframe]);

    useEffect(() => {
      envRef.current?.setSlopeInspect(slopeInspect);
    }, [slopeInspect]);

    return (
      <div className="relative w-full h-full bg-slate-950">
        <div ref={mountRef} className="w-full h-full" />

        {!ready && !contextLost && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950/90 pointer-events-none">
            <div className="text-center space-y-1.5">
              <p className="text-sm font-medium text-slate-200 tracking-wide">
                Generating Tropical Island Archipelago
              </p>
              <p className="text-xs text-slate-400">
                Loading 1K CC0 PBR textures, ocean shaders, 3D clouds, and island terrain
              </p>
            </div>
          </div>
        )}

        {contextLost && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950 text-slate-200 p-6">
            <div className="max-w-md text-center space-y-2 border border-white/10 rounded-xl bg-slate-900 p-6">
              <h2 className="text-base font-semibold">WebGL Viewport Unavailable</h2>
              <p className="text-sm text-slate-400">
                Graphics context could not be initialized or was suspended. Reload the page to restore the 3D island environment.
              </p>
            </div>
          </div>
        )}
      </div>
    );
  },
);
