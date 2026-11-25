import { useState } from 'react';
import {
  Camera,
  ChevronDown,
  ChevronUp,
  Download,
  Layers,
  RotateCcw,
  RotateCw,
  Sun,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  CAMERA_PRESETS,
  LIGHTING_PRESETS,
  type LightingPresetId,
  type QualityPreset,
} from '../environment';

type DockTab = 'camera' | 'atmosphere' | 'inspect';

interface ControlDockProps {
  activeCameraId: string;
  onSelectCamera: (id: string) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetCamera: () => void;
  autoOrbit: boolean;
  onToggleAutoOrbit: () => void;
  lightingPreset: LightingPresetId;
  onSelectLighting: (id: LightingPresetId) => void;
  sunElevation: number;
  onChangeSunElevation: (deg: number) => void;
  sunAzimuth: number;
  onChangeSunAzimuth: (deg: number) => void;
  fogDensity: number;
  onChangeFogDensity: (density: number) => void;
  quality: QualityPreset;
  onChangeQuality: (quality: QualityPreset) => void;
  wireframe: boolean;
  onToggleWireframe: () => void;
  slopeInspect: boolean;
  onToggleSlopeInspect: () => void;
  onExportGLB: () => Promise<void>;
}

export function ControlDock({
  activeCameraId,
  onSelectCamera,
  onZoomIn,
  onZoomOut,
  onResetCamera,
  autoOrbit,
  onToggleAutoOrbit,
  lightingPreset,
  onSelectLighting,
  sunElevation,
  onChangeSunElevation,
  sunAzimuth,
  onChangeSunAzimuth,
  fogDensity,
  onChangeFogDensity,
  quality,
  onChangeQuality,
  wireframe,
  onToggleWireframe,
  slopeInspect,
  onToggleSlopeInspect,
  onExportGLB,
}: ControlDockProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<DockTab>('camera');
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      await onExportGLB();
    } finally {
      setExporting(false);
    }
  };

  return (
    <div
      className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-20 w-[min(900px,95vw)] transition-transform duration-200 ease-out ${
        collapsed ? 'translate-y-[calc(100%-40px)]' : 'translate-y-0'
      }`}
    >
      {/* Always-Visible Camera Zoom + Reset + Collapse Handle */}
      <div className="flex flex-wrap items-center justify-center gap-1.5 mb-1.5">
        <div
          role="group"
          aria-label="Camera Zoom and Reset Controls"
          className="inline-flex items-center gap-1 p-0.5 rounded-lg bg-slate-950/90 border border-white/15"
        >
          <button
            type="button"
            onClick={onZoomIn}
            title="Zoom In (+)"
            aria-label="Zoom In"
            className="inline-flex items-center justify-center gap-1 min-h-[34px] min-w-[44px] px-2.5 py-1 rounded-md bg-slate-900 hover:bg-slate-800 active:bg-slate-700 text-xs font-semibold text-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer touch-manipulation select-none focus-visible:outline-2 focus-visible:outline-sky-400"
          >
            <ZoomIn className="w-3.5 h-3.5" />
            <span>+</span>
          </button>
          <button
            type="button"
            onClick={onZoomOut}
            title="Zoom Out (-)"
            aria-label="Zoom Out"
            className="inline-flex items-center justify-center gap-1 min-h-[34px] min-w-[44px] px-2.5 py-1 rounded-md bg-slate-900 hover:bg-slate-800 active:bg-slate-700 text-xs font-semibold text-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer touch-manipulation select-none focus-visible:outline-2 focus-visible:outline-sky-400"
          >
            <ZoomOut className="w-3.5 h-3.5" />
            <span>-</span>
          </button>
          <button
            type="button"
            onClick={onResetCamera}
            title="Reset Camera"
            aria-label="Reset Camera"
            className="inline-flex items-center justify-center gap-1.5 min-h-[34px] px-2.5 py-1 rounded-md bg-slate-900 hover:bg-slate-800 active:bg-slate-700 text-xs font-medium text-slate-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer touch-manipulation select-none focus-visible:outline-2 focus-visible:outline-sky-400"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Camera</span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => setCollapsed((prev) => !prev)}
          className="inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1 rounded-lg bg-slate-950/90 border border-white/15 text-xs font-medium text-slate-200 hover:text-white hover:border-white/25 transition-colors whitespace-nowrap shrink-0 cursor-pointer touch-manipulation select-none focus-visible:outline-2 focus-visible:outline-sky-400"
        >
          {collapsed ? (
            <>
              <ChevronUp className="w-3.5 h-3.5" />
              <span>Show Controls</span>
            </>
          ) : (
            <>
              <ChevronDown className="w-3.5 h-3.5" />
              <span>Hide Controls</span>
            </>
          )}
        </button>
      </div>

      {/* Main Unified Control Dock (No backdrop-blur over WebGL) */}
      <div className="rounded-xl bg-slate-950/90 border border-white/15 shadow-2xl p-3 text-slate-100">
        {/* Top Tab Switcher + Export */}
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 mb-2.5 border-b border-white/10">
          <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg">
            <button
              type="button"
              onClick={() => setActiveTab('camera')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'camera'
                  ? 'bg-sky-500/20 text-sky-200 border border-sky-400/30'
                  : 'text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              <Camera className="w-3.5 h-3.5" />
              <span>Camera Angles</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('atmosphere')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'atmosphere'
                  ? 'bg-sky-500/20 text-sky-200 border border-sky-400/30'
                  : 'text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              <Sun className="w-3.5 h-3.5" />
              <span>Sky, Sun &amp; Fog</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('inspect')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'inspect'
                  ? 'bg-sky-500/20 text-sky-200 border border-sky-400/30'
                  : 'text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Mesh &amp; Quality</span>
            </button>
          </div>

          <button
            type="button"
            onClick={handleExport}
            disabled={exporting}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-white/15 text-xs font-medium text-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{exporting ? 'Exporting...' : 'Export GLB'}</span>
          </button>
        </div>

        {/* Camera Presets Tab */}
        {activeTab === 'camera' && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {CAMERA_PRESETS.map((preset) => {
                const isActive = activeCameraId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => onSelectCamera(preset.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      isActive
                        ? 'bg-slate-100 text-slate-950'
                        : 'bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white border border-white/10'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={onToggleAutoOrbit}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer border ${
                autoOrbit
                  ? 'bg-sky-500/20 text-sky-200 border-sky-400/40'
                  : 'bg-slate-900 text-slate-300 border-white/10 hover:bg-slate-800'
              }`}
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span>{autoOrbit ? 'Auto-Orbit On' : 'Auto-Orbit Off'}</span>
            </button>
          </div>
        )}

        {/* Lighting, Sky & Fog Tab */}
        {activeTab === 'atmosphere' && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {(Object.keys(LIGHTING_PRESETS) as LightingPresetId[]).map((id) => {
                const preset = LIGHTING_PRESETS[id];
                const isActive = lightingPreset === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => onSelectLighting(id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      isActive
                        ? 'bg-slate-100 text-slate-950'
                        : 'bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white border border-white/10'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              <label className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-xs text-slate-300">
                  <span>Sun Elevation</span>
                  <span className="font-mono-tabular text-slate-400">{sunElevation}°</span>
                </div>
                <input
                  type="range"
                  min={6}
                  max={78}
                  step={1}
                  value={sunElevation}
                  onChange={(e) => onChangeSunElevation(Number(e.target.value))}
                  className="w-full accent-sky-400 cursor-pointer"
                />
              </label>

              <label className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-xs text-slate-300">
                  <span>Sun Azimuth</span>
                  <span className="font-mono-tabular text-slate-400">{sunAzimuth}°</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={360}
                  step={1}
                  value={sunAzimuth}
                  onChange={(e) => onChangeSunAzimuth(Number(e.target.value))}
                  className="w-full accent-sky-400 cursor-pointer"
                />
              </label>

              <label className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-xs text-slate-300">
                  <span>Distance Fog</span>
                  <span className="font-mono-tabular text-slate-400">
                    {(fogDensity * 1000).toFixed(2)}
                  </span>
                </div>
                <input
                  type="range"
                  min={0.00004}
                  max={0.00065}
                  step={0.00002}
                  value={fogDensity}
                  onChange={(e) => onChangeFogDensity(Number(e.target.value))}
                  className="w-full accent-sky-400 cursor-pointer"
                />
              </label>
            </div>
          </div>
        )}

        {/* Graphics Quality & Mesh Inspection Tab */}
        {activeTab === 'inspect' && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-400 mr-0.5">Graphics</span>
              {(['low', 'balanced', 'high'] as QualityPreset[]).map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => onChangeQuality(q)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    quality === q
                      ? 'bg-slate-100 text-slate-950'
                      : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-white/10'
                  }`}
                >
                  {q}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onToggleSlopeInspect}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer border ${
                  slopeInspect
                    ? 'bg-amber-500/20 text-amber-200 border-amber-400/40'
                    : 'bg-slate-900 text-slate-300 border-white/10 hover:bg-slate-800'
                }`}
              >
                Slope Blend View
              </button>

              <button
                type="button"
                onClick={onToggleWireframe}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer border ${
                  wireframe
                    ? 'bg-sky-500/20 text-sky-200 border-sky-400/40'
                    : 'bg-slate-900 text-slate-300 border-white/10 hover:bg-slate-800'
                }`}
              >
                Wireframe
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
