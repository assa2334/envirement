import { useRef, useState } from 'react';
import { ControlDock } from './components/ControlDock';
import {
  MountainViewport,
  type MountainViewportHandle,
} from './components/MountainViewport';
import {
  LIGHTING_PRESETS,
  type LightingPresetId,
  type QualityPreset,
} from './environment';

export default function App() {
  const viewportRef = useRef<MountainViewportHandle | null>(null);

  const [cameraPresetId, setCameraPresetId] = useState('overview');
  const [cameraTrigger, setCameraTrigger] = useState(0);
  const [autoOrbit, setAutoOrbit] = useState(false);

  const [lightingPreset, setLightingPreset] = useState<LightingPresetId>('morning');
  const [sunElevation, setSunElevation] = useState(LIGHTING_PRESETS.morning.sunElevation);
  const [sunAzimuth, setSunAzimuth] = useState(LIGHTING_PRESETS.morning.sunAzimuth);
  const [fogDensity, setFogDensity] = useState(LIGHTING_PRESETS.morning.fogDensity);

  const [quality, setQuality] = useState<QualityPreset>('balanced');
  const [wireframe, setWireframe] = useState(false);
  const [slopeInspect, setSlopeInspect] = useState(false);

  const handleSelectCamera = (id: string) => {
    setCameraPresetId(id);
    setCameraTrigger((n) => n + 1);
  };

  const handleSelectLighting = (id: LightingPresetId) => {
    const preset = LIGHTING_PRESETS[id];
    setLightingPreset(id);
    setSunElevation(preset.sunElevation);
    setSunAzimuth(preset.sunAzimuth);
    setFogDensity(preset.fogDensity);
  };

  const handleExportGLB = async () => {
    await viewportRef.current?.exportGLB();
  };

  const handleZoomIn = () => {
    viewportRef.current?.zoomIn();
  };

  const handleZoomOut = () => {
    viewportRef.current?.zoomOut();
  };

  const handleResetCamera = () => {
    setAutoOrbit(false);
    setCameraPresetId('overview');
    viewportRef.current?.resetCamera();
  };

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-slate-950">
      <MountainViewport
        ref={viewportRef}
        cameraPresetId={cameraPresetId}
        cameraTrigger={cameraTrigger}
        lightingPreset={lightingPreset}
        sunElevation={sunElevation}
        sunAzimuth={sunAzimuth}
        fogDensity={fogDensity}
        quality={quality}
        wireframe={wireframe}
        slopeInspect={slopeInspect}
        autoOrbit={autoOrbit}
        onUserOrbitStart={() => {
          if (autoOrbit) setAutoOrbit(false);
        }}
      />

      {/* Minimal Top-Left Title & Navigation Hint */}
      <header className="fixed top-4 left-5 z-10 pointer-events-none">
        <div className="bg-slate-950/75 border border-white/10 rounded-lg px-3.5 py-2.5">
          <h1 className="text-sm font-semibold text-white tracking-tight">
            Tropical Mountain Island
          </h1>
          <p className="text-xs text-slate-300 mt-0.5 flex flex-wrap items-center gap-1.5">
            <span>1K CC0 PBR Archipelago</span>
            <span aria-hidden="true">·</span>
            <span>Drag to Orbit</span>
            <span aria-hidden="true">·</span>
            <span>+/- Buttons to Zoom</span>
            <span aria-hidden="true">·</span>
            <span>Right-Drag to Pan</span>
          </p>
        </div>
      </header>

      <ControlDock
        activeCameraId={cameraPresetId}
        onSelectCamera={handleSelectCamera}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onResetCamera={handleResetCamera}
        autoOrbit={autoOrbit}
        onToggleAutoOrbit={() => setAutoOrbit((prev) => !prev)}
        lightingPreset={lightingPreset}
        onSelectLighting={handleSelectLighting}
        sunElevation={sunElevation}
        onChangeSunElevation={setSunElevation}
        sunAzimuth={sunAzimuth}
        onChangeSunAzimuth={setSunAzimuth}
        fogDensity={fogDensity}
        onChangeFogDensity={setFogDensity}
        quality={quality}
        onChangeQuality={setQuality}
        wireframe={wireframe}
        onToggleWireframe={() => setWireframe((prev) => !prev)}
        slopeInspect={slopeInspect}
        onToggleSlopeInspect={() => setSlopeInspect((prev) => !prev)}
        onExportGLB={handleExportGLB}
      />
    </main>
  );
}
