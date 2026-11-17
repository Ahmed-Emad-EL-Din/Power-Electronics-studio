import React, { useEffect, useRef, useState } from 'react';
import {
  DcDcDesignState,
  DCDC_PRESETS,
  CORE_DATABASE,
  MATERIAL_DATABASE,
  SEMICONDUCTOR_DATABASE,
  DcDcTopologyFamily,
  TransformerSecondaryType,
  RectifierDeviceType,
  ClampVariantType,
  DcDcControlType,
} from '../data/databases';
import { DcDcResults } from '../engine/dcdcEngine';
import { DcDcSchematicView } from './CircuitSchematics';
import { InteractiveChart } from './InteractiveChart';
import { BodeStabilityGraph } from './BodeStabilityGraph';
import { BhLoopVisualizer } from './BhLoopVisualizer';
import { MagneticSaturationPanel } from './MagneticSaturationPanel';
import { SemiconductorThermalDeratingPanel } from './SemiconductorThermalDeratingPanel';
import { EmiFilterDesignAssistant } from './EmiFilterDesignAssistant';
import { EfficiencyLoadPowerChart } from './EfficiencyLoadPowerChart';
import { GateDriveAnalysisPanel } from './GateDriveAnalysisPanel';
import { WindingWindowVisualizer } from './WindingWindowVisualizer';
import { ProtectionCurrentSensePanel } from './ProtectionCurrentSensePanel';
import { CapacitorBankAnalyzer } from './CapacitorBankAnalyzer';
import { AllInductorsDesigner } from './AllInductorsDesigner';
import { AllCapacitorsDesigner } from './AllCapacitorsDesigner';
import { MathFormula } from './MathFormula';
import { ResizableSidebarWindow } from './ResizableSidebarWindow';
import { SaturationCheckAlert } from './SaturationCheckAlert';
import { AutoSolverBanner, LockToggleButton } from './AutoSolverControls';
import { useDesignSolver } from './DesignSolverContext';
import { DcDcLockableKey } from '../engine/autoOptimizer';
import { synthesizeDcdcCoreThermalFixes } from '../engine/designFixSynthesizer';
import { Copy, Check, CheckCircle2, Zap, Activity, Cpu, Layers, Flame, ShieldCheck, AlertTriangle, Search, SlidersHorizontal, Radio, ShieldAlert, BatteryCharging, Magnet } from 'lucide-react';

export type DcDcSubTab =
  | 'schematic'
  | 'graphs'
  | 'thermal'
  | 'control'
  | 'all-inductors'
  | 'magnetics'
  | 'saturation'
  | 'emi'
  | 'gatedrive'
  | 'winding'
  | 'protection'
  | 'capacitors';

interface DcDcWorkbenchProps {
  state: DcDcDesignState;
  onChange: (next: DcDcDesignState) => void;
  res: DcDcResults;
  pinnedRes: DcDcResults | null;
  onOpenPartDrawer?: () => void;
  onOpenSmallSignalLab?: () => void;
  activeSubTab?: DcDcSubTab;
  onChangeSubTab?: (tab: DcDcSubTab) => void;
  jumpTargetId?: string | null;
  jumpNonce?: number;
}

export const DcDcWorkbench: React.FC<DcDcWorkbenchProps> = ({
  state,
  onChange,
  res,
  pinnedRes,
  onOpenPartDrawer,
  onOpenSmallSignalLab,
  activeSubTab,
  onChangeSubTab,
  jumpTargetId,
  jumpNonce,
}) => {
  const [localSubTab, setLocalSubTab] = useState<DcDcSubTab>('schematic');
  const subTab = activeSubTab ?? localSubTab;
  const setSubTab = (tab: DcDcSubTab) => {
    setLocalSubTab(tab);
    onChangeSubTab?.(tab);
  };
  const [capViewMode, setCapViewMode] = useState<'all-caps' | 'stress-lab'>('all-caps');
  const [copied, setCopied] = useState(false);
  const subTabNavRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!jumpNonce) return;
    if (subTab === 'capacitors') {
      setCapViewMode('all-caps');
    }
    subTabNavRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [jumpNonce, subTab]);

  const {
    dcdcAutoOpt: autoOptimize,
    setDcdcAutoOpt: setAutoOptimize,
    dcdcLocked: lockedParams,
    toggleDcdcLock: toggleLock,
    setAllDcdcLocks: setAllLocks,
    resetDcdcLocksSpecsOnly,
    dcdcChanges: lastAutoChanges,
    clearDcdcChanges,
    setDcdcField: setField,
    applyDcdcPatch,
    optimizeDcdcNow: optimizeNow,
  } = useDesignSolver();

  const isAutoUpdated = (key: DcDcLockableKey) => lastAutoChanges.some((c) => c.key === key);

  const lockKeys = Object.keys(lockedParams) as DcDcLockableKey[];
  const lockedCount = lockKeys.filter((k) => lockedParams[k]).length;

  const copyCode = () => {
    navigator.clipboard.writeText(res.dspCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="flex flex-col lg:flex-row items-start gap-4 relative">
      {/* LEFT SIDEBAR: TOPOLOGY, RECTIFIER, TRANSFORMER, TANK & CONTROL INPUTS */}
      <ResizableSidebarWindow
        title="DC-DC Stage Parameters"
        subtitle="Scrollable • Drag Right Border"
        defaultWidth={360}
      >
        {/* Preset Selector */}
        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
            Reference Design Preset
          </label>
          <select
            value={DCDC_PRESETS.find((p) => p.state.presetName === state.presetName)?.id || ''}
            onChange={(e) => {
              const found = DCDC_PRESETS.find((p) => p.id === e.target.value);
              if (found) {
                clearDcdcChanges();
                onChange({ ...found.state });
              }
            }}
            className="w-full h-8 px-2.5 text-xs bg-slate-50 dark:bg-[#090C12] border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100"
          >
            {DCDC_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </div>

        <AutoSolverBanner
          autoOptimize={autoOptimize}
          onToggleAutoOptimize={() => setAutoOptimize((v) => !v)}
          onOptimizeNow={optimizeNow}
          onLockSpecsOnly={resetDcdcLocksSpecsOnly}
          onLockAll={() => setAllLocks(true)}
          onUnlockAll={() => setAllLocks(false)}
          lockedCount={lockedCount}
          totalCount={lockKeys.length}
          recentChanges={lastAutoChanges}
          onClearChanges={clearDcdcChanges}
        />

        {/* 1. Primary Topology Selector */}
        <div className="border-t border-slate-200 dark:border-slate-800 pt-3">
          <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-2">
            Converter Topology
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            {(
              [
                { id: 'psfb-1ph', label: 'PSFB 1-Phase' },
                { id: 'psfb-2ph', label: 'PSFB 2-Ph Interl.' },
                { id: 'llc-fb', label: 'LLC Full-Bridge' },
                { id: 'llc-hb', label: 'LLC Half-Bridge' },
              ] as { id: DcDcTopologyFamily; label: string }[]
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setField('topology', t.id)}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors cursor-pointer truncate ${
                  state.topology === t.id
                    ? 'bg-cyan-600/10 border-cyan-600/60 text-cyan-700 dark:text-cyan-300 font-semibold'
                    : 'bg-slate-50 dark:bg-[#090C12] border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* 2. Transformer Secondary & Rectifier Hardware Variants */}
        <div className="space-y-2.5 border-t border-slate-200 dark:border-slate-800 pt-3">
          <div>
            <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
              Transformer Secondary Winding
            </label>
            <div className="grid grid-cols-3 gap-1">
              {(
                [
                  { id: 'center-tapped', label: 'Center-Tap' },
                  { id: 'full-bridge', label: 'Full-Bridge' },
                  { id: 'current-doubler', label: 'Curr-Doubler' },
                ] as { id: TransformerSecondaryType; label: string }[]
              ).map((tx) => (
                <button
                  key={tx.id}
                  type="button"
                  onClick={() => setField('txType', tx.id)}
                  className={`px-1.5 py-1.5 text-[11px] font-medium rounded-md border transition-colors cursor-pointer truncate ${
                    state.txType === tx.id
                      ? 'bg-cyan-600/10 border-cyan-600/60 text-cyan-700 dark:text-cyan-300 font-semibold'
                      : 'bg-slate-50 dark:bg-[#090C12] border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  {tx.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
              Secondary Rectifier Devices
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              {(
                [
                  { id: 'sync-fet', label: 'Sync MOSFET (SR)' },
                  { id: 'schottky-diode', label: 'Schottky Diode' },
                ] as { id: RectifierDeviceType; label: string }[]
              ).map((rm) => (
                <button
                  key={rm.id}
                  type="button"
                  onClick={() => setField('rectMode', rm.id)}
                  className={`px-2 py-1.5 text-xs font-medium rounded-md border transition-colors cursor-pointer truncate ${
                    state.rectMode === rm.id
                      ? 'bg-cyan-600/10 border-cyan-600/60 text-cyan-700 dark:text-cyan-300 font-semibold'
                      : 'bg-slate-50 dark:bg-[#090C12] border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  {rm.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
              Clamping / Snubber Network
            </label>
            <div className="grid grid-cols-3 gap-1">
              {(
                [
                  { id: 'pri-diode-clamp', label: 'Pri Dc1/Dc2' },
                  { id: 'active-clamp', label: 'Active Clamp' },
                  { id: 'rc-snubber', label: 'RC Snubber' },
                ] as { id: ClampVariantType; label: string }[]
              ).map((cl) => (
                <button
                  key={cl.id}
                  type="button"
                  onClick={() => setField('clampVariant', cl.id)}
                  className={`px-1.5 py-1.5 text-[11px] font-medium rounded-md border transition-colors cursor-pointer truncate ${
                    state.clampVariant === cl.id
                      ? 'bg-cyan-600/10 border-cyan-600/60 text-cyan-700 dark:text-cyan-300 font-semibold'
                      : 'bg-slate-50 dark:bg-[#090C12] border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  {cl.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 3. Control Architecture Selector */}
        <div className="border-t border-slate-200 dark:border-slate-800 pt-3">
          <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
            Control Loop Architecture
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            {(
              [
                { id: '2p2z', label: '2P2Z (Type-II)' },
                { id: 'type-iii', label: 'Type-III (3P3Z)' },
                { id: 'pcmc', label: 'PCMC + Slope Se' },
                { id: 'acmc', label: 'ACMC' },
                { id: 'cascaded-pi', label: 'Cascaded PI' },
                { id: 'charge-control', label: 'Charge Control' },
                { id: 'mpc', label: 'Trajectory MPC' },
              ] as { id: DcDcControlType; label: string }[]
            ).map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setField('controlType', c.id)}
                className={`px-2 py-1.5 text-xs font-medium rounded-md border transition-colors cursor-pointer truncate ${
                  state.controlType === c.id
                    ? 'bg-cyan-600/10 border-cyan-600/60 text-cyan-700 dark:text-cyan-300 font-semibold'
                    : 'bg-slate-50 dark:bg-[#090C12] border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* 4. Electrical Specs & Tank Parameters */}
        <div className="border-t border-slate-200 dark:border-slate-800 pt-3 space-y-2.5">
          <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
            Power Stage &amp; Tank Parameters
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <div className="flex items-center justify-between gap-1">
                <span className="text-[11px] font-mono text-slate-500 truncate">Vin,nom (V)</span>
                <LockToggleButton
                  locked={lockedParams.Vin_nom_V}
                  recentlyAutoUpdated={isAutoUpdated('Vin_nom_V')}
                  onToggle={() => toggleLock('Vin_nom_V')}
                  label="Vin,nom"
                />
              </div>
              <input
                type="number"
                value={state.Vin_nom_V}
                onChange={(e) => setField('Vin_nom_V', Number(e.target.value))}
                className={`w-full mt-0.5 px-2 py-1 text-xs font-mono bg-slate-50 dark:bg-slate-900 border rounded ${
                  lockedParams.Vin_nom_V
                    ? 'border-amber-500/50'
                    : isAutoUpdated('Vin_nom_V')
                    ? 'border-emerald-500/70'
                    : 'border-slate-300 dark:border-slate-700'
                }`}
              />
              <input
                type="range"
                min={48}
                max={1000}
                step={5}
                value={state.Vin_nom_V}
                onChange={(e) => setField('Vin_nom_V', Number(e.target.value))}
                className="w-full mt-1 h-1.5 accent-cyan-500 cursor-pointer"
              />
            </div>
            <div>
              <div className="flex items-center justify-between gap-1">
                <span className="text-[11px] font-mono text-slate-500 truncate">Vout (V)</span>
                <LockToggleButton
                  locked={lockedParams.Vout_V}
                  recentlyAutoUpdated={isAutoUpdated('Vout_V')}
                  onToggle={() => toggleLock('Vout_V')}
                  label="Vout"
                />
              </div>
              <input
                type="number"
                value={state.Vout_V}
                onChange={(e) => setField('Vout_V', Number(e.target.value))}
                className={`w-full mt-0.5 px-2 py-1 text-xs font-mono bg-slate-50 dark:bg-slate-900 border rounded ${
                  lockedParams.Vout_V
                    ? 'border-amber-500/50'
                    : isAutoUpdated('Vout_V')
                    ? 'border-emerald-500/70'
                    : 'border-slate-300 dark:border-slate-700'
                }`}
              />
              <input
                type="range"
                min={12}
                max={800}
                step={1}
                value={state.Vout_V}
                onChange={(e) => setField('Vout_V', Number(e.target.value))}
                className="w-full mt-1 h-1.5 accent-cyan-500 cursor-pointer"
              />
            </div>
            <div>
              <div className="flex items-center justify-between gap-1">
                <span className="text-[11px] font-mono text-slate-500 truncate">Pout (W)</span>
                <LockToggleButton
                  locked={lockedParams.Pout_W}
                  recentlyAutoUpdated={isAutoUpdated('Pout_W')}
                  onToggle={() => toggleLock('Pout_W')}
                  label="Pout"
                />
              </div>
              <input
                type="number"
                step={100}
                value={state.Pout_W}
                onChange={(e) => setField('Pout_W', Number(e.target.value))}
                className={`w-full mt-0.5 px-2 py-1 text-xs font-mono bg-slate-50 dark:bg-slate-900 border rounded ${
                  lockedParams.Pout_W
                    ? 'border-amber-500/50'
                    : isAutoUpdated('Pout_W')
                    ? 'border-emerald-500/70'
                    : 'border-slate-300 dark:border-slate-700'
                }`}
              />
              <input
                type="range"
                min={100}
                max={25000}
                step={50}
                value={state.Pout_W}
                onChange={(e) => setField('Pout_W', Number(e.target.value))}
                className="w-full mt-1 h-1.5 accent-cyan-500 cursor-pointer"
              />
            </div>
            <div>
              <div className="flex items-center justify-between gap-1">
                <span className="text-[11px] font-mono text-slate-500 truncate">fsw (kHz)</span>
                <LockToggleButton
                  locked={lockedParams.fsw_kHz}
                  recentlyAutoUpdated={isAutoUpdated('fsw_kHz')}
                  onToggle={() => toggleLock('fsw_kHz')}
                  label="fsw"
                />
              </div>
              <input
                type="number"
                value={state.fsw_kHz}
                onChange={(e) => setField('fsw_kHz', Number(e.target.value))}
                className={`w-full mt-0.5 px-2 py-1 text-xs font-mono bg-slate-50 dark:bg-slate-900 border rounded ${
                  lockedParams.fsw_kHz
                    ? 'border-amber-500/50'
                    : isAutoUpdated('fsw_kHz')
                    ? 'border-emerald-500/70'
                    : 'border-slate-300 dark:border-slate-700'
                }`}
              />
              <input
                type="range"
                min={20}
                max={500}
                step={1}
                value={state.fsw_kHz}
                onChange={(e) => setField('fsw_kHz', Number(e.target.value))}
                className="w-full mt-1 h-1.5 accent-cyan-500 cursor-pointer"
              />
            </div>
            <div>
              <div className="flex items-center justify-between gap-1">
                <span className="text-[11px] font-mono text-slate-500 truncate">Turns Ratio n</span>
                <LockToggleButton
                  locked={lockedParams.turnsRatio_n}
                  recentlyAutoUpdated={isAutoUpdated('turnsRatio_n')}
                  onToggle={() => toggleLock('turnsRatio_n')}
                  label="Turns Ratio n"
                />
              </div>
              <input
                type="number"
                step={0.25}
                value={state.turnsRatio_n}
                onChange={(e) => setField('turnsRatio_n', Number(e.target.value))}
                className={`w-full mt-0.5 px-2 py-1 text-xs font-mono bg-slate-50 dark:bg-slate-900 border rounded ${
                  lockedParams.turnsRatio_n
                    ? 'border-amber-500/50'
                    : isAutoUpdated('turnsRatio_n')
                    ? 'border-emerald-500/70'
                    : 'border-slate-300 dark:border-slate-700'
                }`}
              />
              <input
                type="range"
                min={0.25}
                max={20}
                step={0.05}
                value={state.turnsRatio_n}
                onChange={(e) => setField('turnsRatio_n', Number(e.target.value))}
                className="w-full mt-1 h-1.5 accent-cyan-500 cursor-pointer"
              />
            </div>
            <div>
              <div className="flex items-center justify-between gap-1">
                <span className="text-[11px] font-mono text-slate-500 truncate">
                  {res.isLLC ? 'Lr (µH)' : 'L_lk (µH)'}
                </span>
                <LockToggleButton
                  locked={lockedParams.Llk_uH}
                  recentlyAutoUpdated={isAutoUpdated('Llk_uH')}
                  onToggle={() => toggleLock('Llk_uH')}
                  label={res.isLLC ? 'Lr' : 'L_lk'}
                />
              </div>
              <input
                type="number"
                step={0.5}
                value={state.Llk_uH}
                onChange={(e) => setField('Llk_uH', Number(e.target.value))}
                className={`w-full mt-0.5 px-2 py-1 text-xs font-mono bg-slate-50 dark:bg-slate-900 border rounded ${
                  lockedParams.Llk_uH
                    ? 'border-amber-500/50'
                    : isAutoUpdated('Llk_uH')
                    ? 'border-emerald-500/70'
                    : 'border-slate-300 dark:border-slate-700'
                }`}
              />
              <input
                type="range"
                min={0.5}
                max={150}
                step={0.5}
                value={state.Llk_uH}
                onChange={(e) => setField('Llk_uH', Number(e.target.value))}
                className="w-full mt-1 h-1.5 accent-cyan-500 cursor-pointer"
              />
            </div>
            <div>
              <div className="flex items-center justify-between gap-1">
                <span className="text-[11px] font-mono text-slate-500 truncate">Lm (µH)</span>
                <LockToggleButton
                  locked={lockedParams.Lm_uH}
                  recentlyAutoUpdated={isAutoUpdated('Lm_uH')}
                  onToggle={() => toggleLock('Lm_uH')}
                  label="Lm"
                />
              </div>
              <input
                type="number"
                step={10}
                value={state.Lm_uH}
                onChange={(e) => setField('Lm_uH', Number(e.target.value))}
                className={`w-full mt-0.5 px-2 py-1 text-xs font-mono bg-slate-50 dark:bg-slate-900 border rounded ${
                  lockedParams.Lm_uH
                    ? 'border-amber-500/50'
                    : isAutoUpdated('Lm_uH')
                    ? 'border-emerald-500/70'
                    : 'border-slate-300 dark:border-slate-700'
                }`}
              />
              <input
                type="range"
                min={10}
                max={2500}
                step={5}
                value={state.Lm_uH}
                onChange={(e) => setField('Lm_uH', Number(e.target.value))}
                className="w-full mt-1 h-1.5 accent-cyan-500 cursor-pointer"
              />
            </div>
            {res.isLLC ? (
              <div>
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[11px] font-mono text-slate-500 truncate">Cr (nF)</span>
                  <LockToggleButton
                    locked={lockedParams.Cr_nF}
                    recentlyAutoUpdated={isAutoUpdated('Cr_nF')}
                    onToggle={() => toggleLock('Cr_nF')}
                    label="Cr"
                  />
                </div>
                <input
                  type="number"
                  value={state.Cr_nF}
                  onChange={(e) => setField('Cr_nF', Number(e.target.value))}
                  className={`w-full mt-0.5 px-2 py-1 text-xs font-mono bg-slate-50 dark:bg-slate-900 border rounded ${
                    lockedParams.Cr_nF
                      ? 'border-amber-500/50'
                      : isAutoUpdated('Cr_nF')
                      ? 'border-emerald-500/70'
                      : 'border-slate-300 dark:border-slate-700'
                  }`}
                />
                <input
                  type="range"
                  min={5}
                  max={500}
                  step={1}
                  value={state.Cr_nF}
                  onChange={(e) => setField('Cr_nF', Number(e.target.value))}
                  className="w-full mt-1 h-1.5 accent-cyan-500 cursor-pointer"
                />
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[11px] font-mono text-slate-500 truncate">Lo (µH)</span>
                  <LockToggleButton
                    locked={lockedParams.Lo_uH}
                    recentlyAutoUpdated={isAutoUpdated('Lo_uH')}
                    onToggle={() => toggleLock('Lo_uH')}
                    label="Lo"
                  />
                </div>
                <input
                  type="number"
                  value={state.Lo_uH}
                  onChange={(e) => setField('Lo_uH', Number(e.target.value))}
                  className={`w-full mt-0.5 px-2 py-1 text-xs font-mono bg-slate-50 dark:bg-slate-900 border rounded ${
                    lockedParams.Lo_uH
                      ? 'border-amber-500/50'
                      : isAutoUpdated('Lo_uH')
                      ? 'border-emerald-500/70'
                      : 'border-slate-300 dark:border-slate-700'
                  }`}
                />
                <input
                  type="range"
                  min={1}
                  max={500}
                  step={1}
                  value={state.Lo_uH}
                  onChange={(e) => setField('Lo_uH', Number(e.target.value))}
                  className="w-full mt-1 h-1.5 accent-cyan-500 cursor-pointer"
                />
              </div>
            )}
            <div className="col-span-2">
              <div className="flex items-center justify-between gap-1">
                <span className="text-[11px] font-mono text-slate-500">
                  Primary Turns Np (Ns={res.Ns_actual}T)
                </span>
                <LockToggleButton
                  locked={lockedParams.Np_turns}
                  recentlyAutoUpdated={isAutoUpdated('Np_turns')}
                  onToggle={() => toggleLock('Np_turns')}
                  label="Np Turns"
                />
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <input
                  type="number"
                  min={1}
                  max={200}
                  value={state.Np_turns}
                  onChange={(e) => setField('Np_turns', Number(e.target.value))}
                  className={`w-20 px-2 py-1 text-xs font-mono bg-slate-50 dark:bg-slate-900 border rounded ${
                    lockedParams.Np_turns
                      ? 'border-amber-500/50'
                      : isAutoUpdated('Np_turns')
                      ? 'border-emerald-500/70'
                      : 'border-slate-300 dark:border-slate-700'
                  }`}
                />
                <input
                  type="range"
                  min={2}
                  max={80}
                  step={1}
                  value={state.Np_turns}
                  onChange={(e) => setField('Np_turns', Number(e.target.value))}
                  className="flex-1 h-1.5 accent-cyan-500 cursor-pointer"
                />
              </div>
            </div>
          </div>
        </div>

        {/* 5. Control & Electro-Thermal Quick Parameters */}
        <div className="border-t border-slate-200 dark:border-slate-800 pt-3 space-y-2.5">
          <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
            Control, Gate Drive &amp; Thermal
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <div className="flex items-center justify-between gap-1">
                <span className="text-[10px] font-mono text-slate-500">fc (kHz)</span>
                <LockToggleButton
                  locked={lockedParams.fc_target_kHz}
                  recentlyAutoUpdated={isAutoUpdated('fc_target_kHz')}
                  onToggle={() => toggleLock('fc_target_kHz')}
                  label="fc"
                />
              </div>
              <input
                type="number"
                step={0.5}
                value={state.fc_target_kHz}
                onChange={(e) => setField('fc_target_kHz', Number(e.target.value))}
                className={`w-full mt-0.5 px-1.5 py-1 text-xs font-mono bg-slate-50 dark:bg-slate-900 border rounded ${
                  lockedParams.fc_target_kHz
                    ? 'border-amber-500/50'
                    : isAutoUpdated('fc_target_kHz')
                    ? 'border-emerald-500/70'
                    : 'border-slate-300 dark:border-slate-700'
                }`}
              />
            </div>
            <div>
              <div className="flex items-center justify-between gap-1">
                <span className="text-[10px] font-mono text-slate-500">PM (deg)</span>
                <LockToggleButton
                  locked={lockedParams.pm_target_deg}
                  recentlyAutoUpdated={isAutoUpdated('pm_target_deg')}
                  onToggle={() => toggleLock('pm_target_deg')}
                  label="PM"
                />
              </div>
              <input
                type="number"
                value={state.pm_target_deg}
                onChange={(e) => setField('pm_target_deg', Number(e.target.value))}
                className={`w-full mt-0.5 px-1.5 py-1 text-xs font-mono bg-slate-50 dark:bg-slate-900 border rounded ${
                  lockedParams.pm_target_deg
                    ? 'border-amber-500/50'
                    : isAutoUpdated('pm_target_deg')
                    ? 'border-emerald-500/70'
                    : 'border-slate-300 dark:border-slate-700'
                }`}
              />
            </div>
            <div>
              <div className="flex items-center justify-between gap-1">
                <span className="text-[10px] font-mono text-slate-500">Slope mc</span>
                <LockToggleButton
                  locked={lockedParams.slopeFactor_mc}
                  recentlyAutoUpdated={isAutoUpdated('slopeFactor_mc')}
                  onToggle={() => toggleLock('slopeFactor_mc')}
                  label="Slope mc"
                />
              </div>
              <input
                type="number"
                step={0.1}
                value={state.slopeFactor_mc}
                onChange={(e) => setField('slopeFactor_mc', Number(e.target.value))}
                className={`w-full mt-0.5 px-1.5 py-1 text-xs font-mono bg-slate-50 dark:bg-slate-900 border rounded ${
                  lockedParams.slopeFactor_mc
                    ? 'border-amber-500/50'
                    : isAutoUpdated('slopeFactor_mc')
                    ? 'border-emerald-500/70'
                    : 'border-slate-300 dark:border-slate-700'
                }`}
              />
            </div>
            <div>
              <div className="flex items-center justify-between gap-1">
                <span className="text-[10px] font-mono text-slate-500">Rg,ext (Ω)</span>
                <LockToggleButton
                  locked={lockedParams.Rg_ext_Ohm}
                  recentlyAutoUpdated={isAutoUpdated('Rg_ext_Ohm')}
                  onToggle={() => toggleLock('Rg_ext_Ohm')}
                  label="Rg,ext"
                />
              </div>
              <input
                type="number"
                step={0.5}
                value={res.Rg_ext_Ohm}
                onChange={(e) => setField('Rg_ext_Ohm', Number(e.target.value))}
                className={`w-full mt-0.5 px-1.5 py-1 text-xs font-mono bg-slate-50 dark:bg-slate-900 border rounded ${
                  lockedParams.Rg_ext_Ohm
                    ? 'border-amber-500/50'
                    : isAutoUpdated('Rg_ext_Ohm')
                    ? 'border-emerald-500/70'
                    : 'border-slate-300 dark:border-slate-700'
                }`}
              />
            </div>
            <div>
              <div className="flex items-center justify-between gap-1">
                <span className="text-[10px] font-mono text-slate-500">t_dead (ns)</span>
                <LockToggleButton
                  locked={lockedParams.deadTime_ns}
                  recentlyAutoUpdated={isAutoUpdated('deadTime_ns')}
                  onToggle={() => toggleLock('deadTime_ns')}
                  label="t_dead"
                />
              </div>
              <input
                type="number"
                step={10}
                value={state.deadTime_ns}
                onChange={(e) => setField('deadTime_ns', Number(e.target.value))}
                className={`w-full mt-0.5 px-1.5 py-1 text-xs font-mono bg-slate-50 dark:bg-slate-900 border rounded ${
                  lockedParams.deadTime_ns
                    ? 'border-amber-500/50'
                    : isAutoUpdated('deadTime_ns')
                    ? 'border-emerald-500/70'
                    : 'border-slate-300 dark:border-slate-700'
                }`}
              />
            </div>
            <div>
              <div className="flex items-center justify-between gap-1">
                <span className="text-[10px] font-mono text-slate-500">Tamb (°C)</span>
                <LockToggleButton
                  locked={lockedParams.Tamb_C}
                  recentlyAutoUpdated={isAutoUpdated('Tamb_C')}
                  onToggle={() => toggleLock('Tamb_C')}
                  label="Tamb"
                />
              </div>
              <input
                type="number"
                step={5}
                value={state.Tamb_C}
                onChange={(e) => setField('Tamb_C', Number(e.target.value))}
                className={`w-full mt-0.5 px-1.5 py-1 text-xs font-mono bg-slate-50 dark:bg-slate-900 border rounded ${
                  lockedParams.Tamb_C
                    ? 'border-amber-500/50'
                    : isAutoUpdated('Tamb_C')
                    ? 'border-emerald-500/70'
                    : 'border-slate-300 dark:border-slate-700'
                }`}
              />
            </div>

            <div>
              <div className="flex items-center justify-between gap-1">
                <span className="text-[10px] font-mono text-slate-500">Vin,min (V)</span>
                <LockToggleButton
                  compact
                  locked={lockedParams.Vin_min_V}
                  recentlyAutoUpdated={isAutoUpdated('Vin_min_V')}
                  onToggle={() => toggleLock('Vin_min_V')}
                  label="Vin,min"
                />
              </div>
              <input
                type="number"
                step={5}
                value={state.Vin_min_V}
                onChange={(e) => setField('Vin_min_V', Number(e.target.value))}
                className={`w-full mt-0.5 px-1.5 py-1 text-xs font-mono bg-slate-50 dark:bg-slate-900 border rounded ${
                  lockedParams.Vin_min_V
                    ? 'border-amber-500/50'
                    : isAutoUpdated('Vin_min_V')
                    ? 'border-emerald-500/70'
                    : 'border-slate-300 dark:border-slate-700'
                }`}
              />
            </div>
            <div>
              <div className="flex items-center justify-between gap-1">
                <span className="text-[10px] font-mono text-slate-500">Vin,max (V)</span>
                <LockToggleButton
                  compact
                  locked={lockedParams.Vin_max_V}
                  recentlyAutoUpdated={isAutoUpdated('Vin_max_V')}
                  onToggle={() => toggleLock('Vin_max_V')}
                  label="Vin,max"
                />
              </div>
              <input
                type="number"
                step={5}
                value={state.Vin_max_V}
                onChange={(e) => setField('Vin_max_V', Number(e.target.value))}
                className={`w-full mt-0.5 px-1.5 py-1 text-xs font-mono bg-slate-50 dark:bg-slate-900 border rounded ${
                  lockedParams.Vin_max_V
                    ? 'border-amber-500/50'
                    : isAutoUpdated('Vin_max_V')
                    ? 'border-emerald-500/70'
                    : 'border-slate-300 dark:border-slate-700'
                }`}
              />
            </div>
            <div>
              <div className="flex items-center justify-between gap-1">
                <span className="text-[10px] font-mono text-slate-500">Cout (µF)</span>
                <LockToggleButton
                  compact
                  locked={lockedParams.Co_uF}
                  recentlyAutoUpdated={isAutoUpdated('Co_uF')}
                  onToggle={() => toggleLock('Co_uF')}
                  label="Cout"
                />
              </div>
              <input
                type="number"
                step={10}
                value={state.Co_uF}
                onChange={(e) => setField('Co_uF', Number(e.target.value))}
                className={`w-full mt-0.5 px-1.5 py-1 text-xs font-mono bg-slate-50 dark:bg-slate-900 border rounded ${
                  lockedParams.Co_uF
                    ? 'border-amber-500/50'
                    : isAutoUpdated('Co_uF')
                    ? 'border-emerald-500/70'
                    : 'border-slate-300 dark:border-slate-700'
                }`}
              />
            </div>
            <div>
              <div className="flex items-center justify-between gap-1">
                <span className="text-[10px] font-mono text-slate-500">ESR Co (mΩ)</span>
                <LockToggleButton
                  compact
                  locked={lockedParams.ESR_Co_mOhm}
                  recentlyAutoUpdated={isAutoUpdated('ESR_Co_mOhm')}
                  onToggle={() => toggleLock('ESR_Co_mOhm')}
                  label="ESR Co"
                />
              </div>
              <input
                type="number"
                step={0.5}
                value={state.ESR_Co_mOhm}
                onChange={(e) => setField('ESR_Co_mOhm', Number(e.target.value))}
                className={`w-full mt-0.5 px-1.5 py-1 text-xs font-mono bg-slate-50 dark:bg-slate-900 border rounded ${
                  lockedParams.ESR_Co_mOhm
                    ? 'border-amber-500/50'
                    : isAutoUpdated('ESR_Co_mOhm')
                    ? 'border-emerald-500/70'
                    : 'border-slate-300 dark:border-slate-700'
                }`}
              />
            </div>
            <div>
              <div className="flex items-center justify-between gap-1">
                <span className="text-[10px] font-mono text-slate-500">Vgs (V)</span>
                <LockToggleButton
                  compact
                  locked={lockedParams.Vgs_drive_V}
                  recentlyAutoUpdated={isAutoUpdated('Vgs_drive_V')}
                  onToggle={() => toggleLock('Vgs_drive_V')}
                  label="Vgs drive"
                />
              </div>
              <input
                type="number"
                step={1}
                value={state.Vgs_drive_V}
                onChange={(e) => setField('Vgs_drive_V', Number(e.target.value))}
                className={`w-full mt-0.5 px-1.5 py-1 text-xs font-mono bg-slate-50 dark:bg-slate-900 border rounded ${
                  lockedParams.Vgs_drive_V
                    ? 'border-amber-500/50'
                    : isAutoUpdated('Vgs_drive_V')
                    ? 'border-emerald-500/70'
                    : 'border-slate-300 dark:border-slate-700'
                }`}
              />
            </div>
            <div>
              <div className="flex items-center justify-between gap-1">
                <span className="text-[10px] font-mono text-slate-500">Rθ,sa (°C/W)</span>
                <LockToggleButton
                  compact
                  locked={lockedParams.Rth_heatsink_CW}
                  recentlyAutoUpdated={isAutoUpdated('Rth_heatsink_CW')}
                  onToggle={() => toggleLock('Rth_heatsink_CW')}
                  label="Heatsink Rth"
                />
              </div>
              <input
                type="number"
                step={0.05}
                value={state.Rth_heatsink_CW}
                onChange={(e) => setField('Rth_heatsink_CW', Math.max(0.05, Number(e.target.value)))}
                className={`w-full mt-0.5 px-1.5 py-1 text-xs font-mono bg-slate-50 dark:bg-slate-900 border rounded ${
                  lockedParams.Rth_heatsink_CW
                    ? 'border-amber-500/50'
                    : isAutoUpdated('Rth_heatsink_CW')
                    ? 'border-emerald-500/70'
                    : 'border-slate-300 dark:border-slate-700'
                }`}
              />
            </div>
            <div>
              <div className="flex items-center justify-between gap-1">
                <span className="text-[10px] font-mono text-slate-500">Rθ,TIM</span>
                <LockToggleButton
                  compact
                  locked={lockedParams.Rth_TIM_CW}
                  recentlyAutoUpdated={isAutoUpdated('Rth_TIM_CW')}
                  onToggle={() => toggleLock('Rth_TIM_CW')}
                  label="TIM Rth"
                />
              </div>
              <input
                type="number"
                step={0.05}
                value={state.Rth_TIM_CW ?? 0.15}
                onChange={(e) => setField('Rth_TIM_CW', Math.max(0.02, Number(e.target.value)))}
                className={`w-full mt-0.5 px-1.5 py-1 text-xs font-mono bg-slate-50 dark:bg-slate-900 border rounded ${
                  lockedParams.Rth_TIM_CW
                    ? 'border-amber-500/50'
                    : isAutoUpdated('Rth_TIM_CW')
                    ? 'border-emerald-500/70'
                    : 'border-slate-300 dark:border-slate-700'
                }`}
              />
            </div>
            <div>
              <div className="flex items-center justify-between gap-1">
                <span className="text-[10px] font-mono text-slate-500">Tj,max (°C)</span>
                <LockToggleButton
                  compact
                  locked={lockedParams.Tj_max_limit_C}
                  recentlyAutoUpdated={isAutoUpdated('Tj_max_limit_C')}
                  onToggle={() => toggleLock('Tj_max_limit_C')}
                  label="Tj limit"
                />
              </div>
              <input
                type="number"
                step={5}
                value={state.Tj_max_limit_C ?? 150}
                onChange={(e) => setField('Tj_max_limit_C', Number(e.target.value))}
                className={`w-full mt-0.5 px-1.5 py-1 text-xs font-mono bg-slate-50 dark:bg-slate-900 border rounded ${
                  lockedParams.Tj_max_limit_C
                    ? 'border-amber-500/50'
                    : isAutoUpdated('Tj_max_limit_C')
                    ? 'border-emerald-500/70'
                    : 'border-slate-300 dark:border-slate-700'
                }`}
              />
            </div>
            <div>
              <div className="flex items-center justify-between gap-1">
                <span className="text-[10px] font-mono text-slate-500">Rsense (mΩ)</span>
                <LockToggleButton
                  compact
                  locked={lockedParams.Rsense_mOhm}
                  recentlyAutoUpdated={isAutoUpdated('Rsense_mOhm')}
                  onToggle={() => toggleLock('Rsense_mOhm')}
                  label="Rsense"
                />
              </div>
              <input
                type="number"
                step={1}
                value={state.Rsense_mOhm}
                onChange={(e) => setField('Rsense_mOhm', Number(e.target.value))}
                className={`w-full mt-0.5 px-1.5 py-1 text-xs font-mono bg-slate-50 dark:bg-slate-900 border rounded ${
                  lockedParams.Rsense_mOhm
                    ? 'border-amber-500/50'
                    : isAutoUpdated('Rsense_mOhm')
                    ? 'border-emerald-500/70'
                    : 'border-slate-300 dark:border-slate-700'
                }`}
              />
            </div>
            <div>
              <div className="flex items-center justify-between gap-1">
                <span className="text-[10px] font-mono text-slate-500">DSP fs (kHz)</span>
                <LockToggleButton
                  compact
                  locked={lockedParams.fs_digital_kHz}
                  recentlyAutoUpdated={isAutoUpdated('fs_digital_kHz')}
                  onToggle={() => toggleLock('fs_digital_kHz')}
                  label="DSP fs"
                />
              </div>
              <input
                type="number"
                step={5}
                value={state.fs_digital_kHz}
                onChange={(e) => setField('fs_digital_kHz', Number(e.target.value))}
                className={`w-full mt-0.5 px-1.5 py-1 text-xs font-mono bg-slate-50 dark:bg-slate-900 border rounded ${
                  lockedParams.fs_digital_kHz
                    ? 'border-amber-500/50'
                    : isAutoUpdated('fs_digital_kHz')
                    ? 'border-emerald-500/70'
                    : 'border-slate-300 dark:border-slate-700'
                }`}
              />
            </div>
          </div>
        </div>

        {/* 6. Devices, Core, Turns & Litz Winding */}
        <div className="border-t border-slate-200 dark:border-slate-800 pt-3 space-y-2.5">
          <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
            Devices, Magnetics &amp; Litz Winding
          </div>
          <div className="space-y-2">
            <div>
              <div className="flex items-center justify-between gap-1">
                <span className="text-[10px] font-mono text-slate-500">Primary Switch</span>
                <LockToggleButton
                  compact
                  locked={lockedParams.priDeviceId}
                  recentlyAutoUpdated={isAutoUpdated('priDeviceId')}
                  onToggle={() => toggleLock('priDeviceId')}
                  label="Pri Device"
                />
              </div>
              <select
                value={state.priDeviceId}
                onChange={(e) => setField('priDeviceId', e.target.value)}
                className={`w-full mt-0.5 px-2 py-1 text-xs font-mono bg-slate-50 dark:bg-slate-900 border rounded ${
                  lockedParams.priDeviceId
                    ? 'border-amber-500/50'
                    : isAutoUpdated('priDeviceId')
                    ? 'border-emerald-500/70'
                    : 'border-slate-300 dark:border-slate-700'
                }`}
              >
                {SEMICONDUCTOR_DATABASE.filter((d) => d.role !== 'secondary').map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className="flex items-center justify-between gap-1">
                <span className="text-[10px] font-mono text-slate-500">Secondary Rectifier</span>
                <LockToggleButton
                  compact
                  locked={lockedParams.secDeviceId}
                  recentlyAutoUpdated={isAutoUpdated('secDeviceId')}
                  onToggle={() => toggleLock('secDeviceId')}
                  label="Sec Device"
                />
              </div>
              <select
                value={state.secDeviceId}
                onChange={(e) => setField('secDeviceId', e.target.value)}
                className={`w-full mt-0.5 px-2 py-1 text-xs font-mono bg-slate-50 dark:bg-slate-900 border rounded ${
                  lockedParams.secDeviceId
                    ? 'border-amber-500/50'
                    : isAutoUpdated('secDeviceId')
                    ? 'border-emerald-500/70'
                    : 'border-slate-300 dark:border-slate-700'
                }`}
              >
                {SEMICONDUCTOR_DATABASE.filter((d) => d.role !== 'primary').map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[10px] font-mono text-slate-500">Core</span>
                  <LockToggleButton
                    compact
                    locked={lockedParams.coreId}
                    recentlyAutoUpdated={isAutoUpdated('coreId')}
                    onToggle={() => toggleLock('coreId')}
                    label="Core"
                  />
                </div>
                <select
                  value={state.coreId}
                  onChange={(e) => setField('coreId', e.target.value)}
                  className={`w-full mt-0.5 px-1.5 py-1 text-[11px] font-mono bg-slate-50 dark:bg-slate-900 border rounded ${
                    lockedParams.coreId
                      ? 'border-amber-500/50'
                      : isAutoUpdated('coreId')
                      ? 'border-emerald-500/70'
                      : 'border-slate-300 dark:border-slate-700'
                  }`}
                >
                  {CORE_DATABASE.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[10px] font-mono text-slate-500">Material</span>
                  <LockToggleButton
                    compact
                    locked={lockedParams.materialId}
                    recentlyAutoUpdated={isAutoUpdated('materialId')}
                    onToggle={() => toggleLock('materialId')}
                    label="Material"
                  />
                </div>
                <select
                  value={state.materialId}
                  onChange={(e) => setField('materialId', e.target.value)}
                  className={`w-full mt-0.5 px-1.5 py-1 text-[11px] font-mono bg-slate-50 dark:bg-slate-900 border rounded ${
                    lockedParams.materialId
                      ? 'border-amber-500/50'
                      : isAutoUpdated('materialId')
                      ? 'border-emerald-500/70'
                      : 'border-slate-300 dark:border-slate-700'
                  }`}
                >
                  {MATERIAL_DATABASE.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[10px] font-mono text-slate-500">Ns (T)</span>
                  <LockToggleButton
                    compact
                    locked={lockedParams.Ns_turns}
                    recentlyAutoUpdated={isAutoUpdated('Ns_turns')}
                    onToggle={() => toggleLock('Ns_turns')}
                    label="Ns Turns"
                  />
                </div>
                <input
                  type="number"
                  min={1}
                  value={state.Ns_turns}
                  onChange={(e) => setField('Ns_turns', Math.max(1, Number(e.target.value)))}
                  className={`w-full mt-0.5 px-1.5 py-1 text-xs font-mono bg-slate-50 dark:bg-slate-900 border rounded ${
                    lockedParams.Ns_turns
                      ? 'border-amber-500/50'
                      : isAutoUpdated('Ns_turns')
                      ? 'border-emerald-500/70'
                      : 'border-slate-300 dark:border-slate-700'
                  }`}
                />
              </div>
              <div>
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[10px] font-mono text-slate-500">Npar Pri</span>
                  <LockToggleButton
                    compact
                    locked={lockedParams.nParallelPri}
                    recentlyAutoUpdated={isAutoUpdated('nParallelPri')}
                    onToggle={() => toggleLock('nParallelPri')}
                    label="Npar Pri"
                  />
                </div>
                <input
                  type="number"
                  min={1}
                  max={8}
                  value={state.nParallelPri}
                  onChange={(e) => setField('nParallelPri', Math.max(1, Number(e.target.value)))}
                  className={`w-full mt-0.5 px-1.5 py-1 text-xs font-mono bg-slate-50 dark:bg-slate-900 border rounded ${
                    lockedParams.nParallelPri
                      ? 'border-amber-500/50'
                      : isAutoUpdated('nParallelPri')
                      ? 'border-emerald-500/70'
                      : 'border-slate-300 dark:border-slate-700'
                  }`}
                />
              </div>
              <div>
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[10px] font-mono text-slate-500">Npar Sec</span>
                  <LockToggleButton
                    compact
                    locked={lockedParams.nParallelSec}
                    recentlyAutoUpdated={isAutoUpdated('nParallelSec')}
                    onToggle={() => toggleLock('nParallelSec')}
                    label="Npar Sec"
                  />
                </div>
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={state.nParallelSec}
                  onChange={(e) => setField('nParallelSec', Math.max(1, Number(e.target.value)))}
                  className={`w-full mt-0.5 px-1.5 py-1 text-xs font-mono bg-slate-50 dark:bg-slate-900 border rounded ${
                    lockedParams.nParallelSec
                      ? 'border-amber-500/50'
                      : isAutoUpdated('nParallelSec')
                      ? 'border-emerald-500/70'
                      : 'border-slate-300 dark:border-slate-700'
                  }`}
                />
              </div>
              <div>
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[10px] font-mono text-slate-500">Litz AWG</span>
                  <LockToggleButton
                    compact
                    locked={lockedParams.litzStrandAWG}
                    recentlyAutoUpdated={isAutoUpdated('litzStrandAWG')}
                    onToggle={() => toggleLock('litzStrandAWG')}
                    label="Litz AWG"
                  />
                </div>
                <input
                  type="number"
                  min={28}
                  max={46}
                  step={2}
                  value={state.litzStrandAWG}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    const awg: 38 | 40 | 42 = v <= 38 ? 38 : v <= 40 ? 40 : 42;
                    setField('litzStrandAWG', awg);
                  }}
                  className={`w-full mt-0.5 px-1.5 py-1 text-xs font-mono bg-slate-50 dark:bg-slate-900 border rounded ${
                    lockedParams.litzStrandAWG
                      ? 'border-amber-500/50'
                      : isAutoUpdated('litzStrandAWG')
                      ? 'border-emerald-500/70'
                      : 'border-slate-300 dark:border-slate-700'
                  }`}
                />
              </div>
              <div>
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[10px] font-mono text-slate-500">Pri Str</span>
                  <LockToggleButton
                    compact
                    locked={lockedParams.priStrands}
                    recentlyAutoUpdated={isAutoUpdated('priStrands')}
                    onToggle={() => toggleLock('priStrands')}
                    label="Pri Strands"
                  />
                </div>
                <input
                  type="number"
                  min={1}
                  value={state.priStrands}
                  onChange={(e) => setField('priStrands', Math.max(1, Number(e.target.value)))}
                  className={`w-full mt-0.5 px-1.5 py-1 text-xs font-mono bg-slate-50 dark:bg-slate-900 border rounded ${
                    lockedParams.priStrands
                      ? 'border-amber-500/50'
                      : isAutoUpdated('priStrands')
                      ? 'border-emerald-500/70'
                      : 'border-slate-300 dark:border-slate-700'
                  }`}
                />
              </div>
              <div>
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[10px] font-mono text-slate-500">Sec Str</span>
                  <LockToggleButton
                    compact
                    locked={lockedParams.secStrands}
                    recentlyAutoUpdated={isAutoUpdated('secStrands')}
                    onToggle={() => toggleLock('secStrands')}
                    label="Sec Strands"
                  />
                </div>
                <input
                  type="number"
                  min={1}
                  value={state.secStrands}
                  onChange={(e) => setField('secStrands', Math.max(1, Number(e.target.value)))}
                  className={`w-full mt-0.5 px-1.5 py-1 text-xs font-mono bg-slate-50 dark:bg-slate-900 border rounded ${
                    lockedParams.secStrands
                      ? 'border-amber-500/50'
                      : isAutoUpdated('secStrands')
                      ? 'border-emerald-500/70'
                      : 'border-slate-300 dark:border-slate-700'
                  }`}
                />
              </div>
            </div>
          </div>
        </div>
      </ResizableSidebarWindow>

      {/* RIGHT WORKSPACE: KPI STRIP, SUB-TABS, LIVE SCHEMATIC, GRAPHS, ELECTRO-THERMAL & MAGNETICS */}
      <div className="flex-1 min-w-0 w-full space-y-4">
        {/* Compact 6-Card KPI Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2.5">
          <div className="bg-white dark:bg-[#0E131D] border border-slate-200 dark:border-slate-800 rounded-lg p-3">
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Efficiency η</div>
            <div className="text-xl font-mono font-semibold tabular-nums text-emerald-600 dark:text-emerald-400 mt-0.5">
              {res.efficiency_pct.toFixed(2)}%
            </div>
            <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 mt-0.5">
              P_loss = {res.Ptotal_loss_W.toFixed(1)} W
            </div>
          </div>

          <div className="bg-white dark:bg-[#0E131D] border border-slate-200 dark:border-slate-800 rounded-lg p-3">
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              {res.isLLC ? 'Voltage Gain M(fn)' : 'Effective Duty Deff'}
            </div>
            <div className="text-xl font-mono font-semibold tabular-nums text-cyan-600 dark:text-cyan-400 mt-0.5">
              {res.isLLC
                ? `${res.M_gain_nom.toFixed(2)}×`
                : `${(res.Deff_nom * 100).toFixed(1)}%`}
            </div>
            <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 mt-0.5">
              {res.isLLC
                ? `fn=${res.fn_nom.toFixed(2)} · fr=${res.fr_kHz.toFixed(0)} kHz`
                : `ΔD=${(res.Dloss_nom * 100).toFixed(1)}% · φ=${res.phaseShift_deg.toFixed(0)}°`}
            </div>
          </div>

          <div className="bg-white dark:bg-[#0E131D] border border-slate-200 dark:border-slate-800 rounded-lg p-3">
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Lag / Lead ZVS</div>
            <div
              className={`text-xl font-mono font-semibold tabular-nums mt-0.5 ${
                res.zvsAchieved ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
              }`}
            >
              {res.zvsEnergyRatio_pct.toFixed(0)}% · {res.zvsLeadAchieved ? 'OK' : 'Low'}
            </div>
            <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 mt-0.5">
              Vres={res.Vds_res_lag_V.toFixed(0)} V · Izvs≥{res.I_zvs_min_A.toFixed(1)} A
            </div>
          </div>

          <button
            type="button"
            onClick={() => setSubTab('thermal')}
            title="Open Semiconductor Thermal Derating & Heatsink Calculator"
            className="text-left bg-white dark:bg-[#0E131D] border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 rounded-lg p-3 cursor-pointer transition-colors"
          >
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 flex items-center justify-between gap-1">
              <span>MOSFET Tj (Pri / Sec)</span>
              <span className="font-mono tabular-nums text-[10px] text-slate-400">
                Rθ={state.Rth_heatsink_CW}
              </span>
            </div>
            <div
              className={`text-xl font-mono font-semibold tabular-nums mt-0.5 ${
                res.thermalStable ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400'
              }`}
            >
              {res.Tj_pri_C.toFixed(1)}° / {res.Tj_sec_C.toFixed(1)}°C
            </div>
            <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 mt-0.5">
              Ppri={(res.Pcond_pri_W + res.Psw_pri_W).toFixed(1)} W · Max {(res.Pout_derated_max_W / 1000).toFixed(1)} kW
            </div>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('saturation')}
            title="Open Core Saturation Headroom & B(t) vs BH Panel"
            className={`text-left rounded-lg p-3 cursor-pointer transition-colors border ${
              res.saturationCheck.status === 'critical'
                ? 'bg-rose-50 dark:bg-rose-950/30 border-rose-500/70'
                : res.saturationCheck.status === 'warning'
                ? 'bg-amber-50 dark:bg-amber-950/25 border-amber-500/60'
                : 'bg-white dark:bg-[#0E131D] border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
            }`}
          >
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 flex items-center justify-between gap-1">
              <span>Core Flux B_pk</span>
              <span
                className={`font-mono tabular-nums text-[10px] font-semibold ${
                  res.saturationCheck.status === 'critical'
                    ? 'text-rose-600 dark:text-rose-400'
                    : res.saturationCheck.status === 'warning'
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                {res.saturationCheck.exceedsDatasheetLimit
                  ? `+${res.saturationCheck.excess_100C_mT.toFixed(0)} mT over`
                  : `+${res.bhLoopAnalysis.fluxHeadroom_100C_mT.toFixed(0)} mT`}
              </span>
            </div>
            <div
              className={`text-xl font-mono font-semibold tabular-nums mt-0.5 ${
                res.saturationCheck.status === 'critical'
                  ? 'text-rose-600 dark:text-rose-400'
                  : res.saturationCheck.status === 'warning'
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-slate-900 dark:text-slate-100'
              }`}
            >
              {res.Bpk_mT.toFixed(0)} / {res.bhLoopAnalysis.Bsat_100C_mT.toFixed(0)} mT
            </div>
            <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 mt-0.5">
              {res.saturationCheck.status === 'critical' ? (
                <span className="text-rose-600 dark:text-rose-400 font-semibold">
                  Saturated ({res.saturationCheck.utilization_100C_pct.toFixed(0)}%)
                </span>
              ) : (
                <>Margin {res.fluxMargin_pct.toFixed(0)}% · FR={res.Fr_dowell_pri.toFixed(2)}×</>
              )}
            </div>
          </button>

          <div className="bg-white dark:bg-[#0E131D] border border-slate-200 dark:border-slate-800 rounded-lg p-3">
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Control ({state.controlType.toUpperCase()})
            </div>
            <div className="text-xl font-mono font-semibold tabular-nums text-cyan-600 dark:text-cyan-400 mt-0.5">
              {res.fc_actual_kHz.toFixed(1)} kHz
            </div>
            <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 mt-0.5">
              PM={res.pm_actual_deg.toFixed(0)}° · Qp={res.Qp_subharmonic.toFixed(2)}
            </div>
          </div>
        </div>

        {/* Sub-Navigation Bar */}
        <div
          ref={subTabNavRef}
          className="scroll-mt-20 flex flex-wrap items-center gap-1.5 border-b border-slate-200 dark:border-slate-800 pb-2.5"
        >
          {(
            [
              { id: 'schematic', label: 'Schematic & Equations', icon: <Zap className="w-3.5 h-3.5" /> },
              { id: 'graphs', label: 'ZVS & Tank Graphs', icon: <Activity className="w-3.5 h-3.5" /> },
              { id: 'thermal', label: 'Electro-Thermal', icon: <Flame className="w-3.5 h-3.5" /> },
              { id: 'control', label: 'Control & DSP', icon: <Cpu className="w-3.5 h-3.5" /> },
              { id: 'all-inductors', label: 'All Inductors', icon: <Magnet className="w-3.5 h-3.5" /> },
              { id: 'capacitors', label: 'All Capacitors', icon: <BatteryCharging className="w-3.5 h-3.5" /> },
              { id: 'magnetics', label: 'Tx Magnetics (iGSE)', icon: <Layers className="w-3.5 h-3.5" />, alert: res.saturationCheck.status === 'critical' },
              { id: 'saturation', label: 'Core Saturation & BH', icon: <ShieldCheck className="w-3.5 h-3.5" />, alert: res.saturationCheck.status === 'critical' },
              { id: 'emi', label: 'EMI Filter', icon: <Radio className="w-3.5 h-3.5" /> },
              { id: 'gatedrive', label: 'Gate Drive', icon: <Zap className="w-3.5 h-3.5" /> },
              { id: 'winding', label: 'Winding Window', icon: <Layers className="w-3.5 h-3.5" /> },
              { id: 'protection', label: 'OCP & Desat', icon: <ShieldAlert className="w-3.5 h-3.5" /> },
            ] as { id: typeof subTab; label: string; icon: React.ReactNode; alert?: boolean }[]
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSubTab(tab.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md border inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                subTab === tab.id
                  ? 'bg-cyan-600 border-cyan-600 text-white font-semibold'
                  : tab.alert
                  ? 'bg-rose-500/10 border-rose-500/50 text-rose-600 dark:text-rose-400 font-semibold'
                  : 'bg-white dark:bg-[#0E131D] border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-700 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
              {tab.alert && <AlertTriangle className="w-3.5 h-3.5 shrink-0" />}
            </button>
          ))}
        </div>

        {/* SUB-TAB 1: LIVE CAD SCHEMATIC & KaTeX GOVERNING EQUATIONS */}
        {subTab === 'schematic' && (
          <div className="space-y-4">
            <DcDcSchematicView res={res} />

            {/* Governing Equations Table with KaTeX Mathematical Typesetting */}
            <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg p-4">
              <div className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-600 dark:text-cyan-400 mb-2.5">
                Exact Governing Equations (KaTeX) &amp; Calculated Design Numbers
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs font-mono">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                      <th className="py-2 pr-3">Design Metric</th>
                      <th className="py-2 pr-3">Governing Equation (KaTeX)</th>
                      <th className="py-2 pr-3">Calculated Operating Point</th>
                      <th className="py-2">Worst-Case / Engineering Boundary</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800/70">
                    <tr>
                      <td className="py-2.5 pr-3 font-semibold">Effective Duty &amp; Loss</td>
                      <td className="py-2.5 pr-3 text-slate-800 dark:text-slate-200">
                        <MathFormula tex="D_{\text{eff}} = \frac{n V_{\text{out}}}{V_{\text{in}}}, \quad \Delta D = \frac{4 f_{\text{sw}} L_{lk} I_{\text{pri}}}{V_{\text{in}}}" />
                      </td>
                      <td className="py-2.5 pr-3 text-cyan-400">
                        Deff={(res.Deff_nom * 100).toFixed(1)}%, ΔD={(res.Dloss_nom * 100).toFixed(1)}%
                      </td>
                      <td className="py-2.5 text-slate-400">Llk,max(duty) = {res.Llk_max_duty_uH.toFixed(1)} µH</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 pr-3 font-semibold">Lag-Leg vs Lead-Leg ZVS</td>
                      <td className="py-2.5 pr-3 text-slate-800 dark:text-slate-200">
                        <MathFormula tex="E_{\text{lag}} = \frac{1}{2} L_{lk} I_{\text{lag}}^2 \ge E_{\text{oss}}, \quad E_{\text{lead}} = \frac{1}{2}\left(L_{lk} + n^2 L_o\right) I_{\text{lead}}^2" />
                      </td>
                      <td className="py-2.5 pr-3 text-emerald-400">
                        Lag: {res.E_lk_avail_uJ.toFixed(1)}µJ ({res.zvsEnergyRatio_pct.toFixed(0)}%, Vres={res.Vds_res_lag_V.toFixed(0)}V) | Lead: {(res.E_lead_avail_uJ / 1e3).toFixed(1)}mJ
                      </td>
                      <td className="py-2.5 text-slate-400">
                        Llk,crit(100%) = {res.Llk_crit_fullLoad_uH.toFixed(1)} µH | t_dead ≥ {res.t_dead_min_ns.toFixed(0)} ns
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2.5 pr-3 font-semibold">Electro-Thermal MOSFET &amp; Qrr</td>
                      <td className="py-2.5 pr-3 text-slate-800 dark:text-slate-200">
                        <MathFormula tex="P_{\text{MOS}}(T_j) = I_{\text{rms}}^2 R_{\text{ds}}(T_j) + P_{\text{sw}}(R_g) + P_{\text{dt,body}} + f_{\text{sw}} Q_{\text{rr}}(T_j) V_{\text{ds}} + Q_g V_{\text{gs}} f_{\text{sw}}" />
                      </td>
                      <td className="py-2.5 pr-3 text-amber-400">
                        Tj,pri={res.Tj_pri_C.toFixed(1)}°C (Rds={res.Rds_pri_actual_mOhm.toFixed(1)}mΩ) | Pgate={res.Pgate_pri_W.toFixed(2)}W
                      </td>
                      <td className="py-2.5 text-slate-400">
                        Prr,pri={res.Prr_pri_W.toFixed(2)}W, Pdt={res.Pdt_body_pri_W.toFixed(2)}W | dP/dTj·Rθ = {res.thermalLoopGain.toFixed(3)}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2.5 pr-3 font-semibold">Secondary Ringing &amp; Snubber</td>
                      <td className="py-2.5 pr-3 text-slate-800 dark:text-slate-200">
                        <MathFormula tex="f_{\text{ring}} = \frac{1}{2\pi\sqrt{(L_{lk}/n^2)C_{\text{oss,sec}}}}, \quad R_{\text{snub}} = \sqrt{\frac{L_{lk}/n^2}{C_{\text{oss,sec}}}}" />
                      </td>
                      <td className="py-2.5 pr-3 text-amber-400">
                        fring={res.f_ring_MHz.toFixed(2)}MHz | Vpk={res.Vsec_overshoot_V.toFixed(1)}V (Unclamped {res.Vsec_unclamped_pk_V.toFixed(0)}V)
                      </td>
                      <td className="py-2.5 text-slate-400">
                        Rsnub={res.Rsnub_Ohm.toFixed(1)}Ω, Csnub={res.Csnub_pF.toFixed(0)}pF, Psnub={res.Psnub_W.toFixed(1)}W
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2.5 pr-3 font-semibold">Non-Sinusoidal iGSE Core Loss</td>
                      <td className="py-2.5 pr-3 text-slate-800 dark:text-slate-200">
                        <MathFormula tex="P_{v,\text{iGSE}} = \frac{1}{T_{\text{sw}}}\int_0^{T_{\text{sw}}} k_i \left|\frac{dB}{dt}\right|^\alpha (\Delta B)^{\beta-\alpha}\,dt" />
                      </td>
                      <td className="py-2.5 pr-3 text-purple-400">
                        Pcore(iGSE) = {res.Pcore_igse_W.toFixed(2)} W vs Steinmetz = {res.Pcore_se_W.toFixed(2)} W
                      </td>
                      <td
                        className={`py-2.5 ${
                          res.saturationCheck.status === 'critical'
                            ? 'text-rose-500 font-bold'
                            : res.saturationCheck.status === 'warning'
                            ? 'text-amber-500 font-semibold'
                            : 'text-slate-400'
                        }`}
                      >
                        Bpk = {res.Bpk_mT.toFixed(1)} mT (Margin {res.fluxMargin_pct.toFixed(1)}% to Bsat={res.saturationCheck.Bsat_100C_mT.toFixed(0)} mT)
                        {res.saturationCheck.status === 'critical' && ' — SATURATION ALERT!'}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2.5 pr-3 font-semibold">1D Dowell Proximity Factor</td>
                      <td className="py-2.5 pr-3 text-slate-800 dark:text-slate-200">
                        <MathFormula tex="F_R(\Delta, m) = \Delta\left[\frac{\sinh 2\Delta+\sin 2\Delta}{\cosh 2\Delta-\cos 2\Delta} + \frac{2(m^2-1)}{3}\frac{\sinh\Delta-\sin\Delta}{\cosh\Delta+\cos\Delta}\right]" />
                      </td>
                      <td className="py-2.5 pr-3 text-cyan-400">
                        FR,pri = {res.Fr_dowell_pri.toFixed(2)}×, FR,sec = {res.Fr_dowell_sec.toFixed(2)}×
                      </td>
                      <td className="py-2.5 text-slate-400">
                        δ = {res.skinDepth_mm.toFixed(2)} mm | Cww = {res.Cww_pF.toFixed(0)} pF ({state.interleaving})
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2.5 pr-3 font-semibold">Middlebrook EMI &amp; Slope Qp</td>
                      <td className="py-2.5 pr-3 text-slate-800 dark:text-slate-200">
                        <MathFormula tex="\|Z_{\text{out,EMI}}(j\omega)\| \ll \left|-\frac{V_{\text{in}}^2}{P_{\text{in}}}\right|, \quad Q_p = \frac{1}{\pi(m_c D' - 0.5)}" />
                      </td>
                      <td className="py-2.5 pr-3 text-emerald-400">
                        ΔZ_MB = {res.middlebrookMargin_dB.toFixed(1)} dB | Qp = {res.Qp_subharmonic.toFixed(2)}
                      </td>
                      <td className="py-2.5 text-slate-400">
                        WC PM ∈ [{res.pm_wc_min_deg.toFixed(1)}°, {res.pm_wc_max_deg.toFixed(1)}°] | Σa_k = {(res.a1 + res.a2 + res.a3).toFixed(4)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Recharts Efficiency & Decomposed Loss vs Load Power Curve Section */}
            <EfficiencyLoadPowerChart
              state={state}
              res={res}
              pinnedRes={pinnedRes}
              onChange={onChange}
            />
          </div>
        )}

        {/* SUB-TAB 2: INTERACTIVE DESIGN GRAPHS WITH DYNAMIC ZOOM-OUT EVALUATORS & ZVS TRICKS */}
        {subTab === 'graphs' && (
          <div className="space-y-4">
            {/* Recharts Efficiency & Decomposed Loss vs Load Power Curve Section */}
            <EfficiencyLoadPowerChart
              state={state}
              res={res}
              pinnedRes={pinnedRes}
              onChange={onChange}
            />

            {/* ZVS & Commutation Optimization Bar */}
            <div className="bg-white dark:bg-[#0E131D] border border-slate-200 dark:border-slate-800 rounded-lg p-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs">
                <SlidersHorizontal className="w-4 h-4 text-cyan-600 dark:text-cyan-400 shrink-0" />
                <span className="font-semibold text-slate-900 dark:text-slate-100">
                  ZVS &amp; Commutation Sizing:
                </span>
                <span className="text-slate-600 dark:text-slate-400">
                  Min Load for 100% ZVS = <strong className="font-mono tabular-nums text-emerald-600 dark:text-emerald-400">{res.P_min_zvs_pct.toFixed(0)}%</strong> · Optimal Dead-Time = <strong className="font-mono tabular-nums text-cyan-600 dark:text-cyan-400">{res.t_dead_opt_ns} ns</strong>
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {!res.isLLC && (
                  <button
                    type="button"
                    onClick={() => setField('Llk_uH', res.Llk_opt_35pct_uH)}
                    className="px-2.5 py-1 text-[11px] font-mono bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-400 rounded font-semibold cursor-pointer"
                  >
                    Auto-Size L_lk for Light-Load ZVS ({res.Llk_opt_35pct_uH} µH)
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setField('deadTime_ns', res.t_dead_opt_ns)}
                  className="px-2.5 py-1 text-[11px] font-mono bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/40 text-cyan-400 rounded font-semibold cursor-pointer"
                >
                  Set Optimal LC Valley Dead-Time ({res.t_dead_opt_ns} ns)
                </button>
                {onOpenPartDrawer && (
                  <button
                    type="button"
                    onClick={onOpenPartDrawer}
                    className="px-2.5 py-1 text-[11px] font-mono bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/40 text-purple-300 rounded inline-flex items-center gap-1 font-semibold cursor-pointer"
                  >
                    <Search className="w-3 h-3" /> Pull Real DigiKey/Mouser MOSFET
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <InteractiveChart
                title={
                  res.isLLC
                    ? '1. LLC Resonant Voltage Gain M(fn, Q) vs Normalized Frequency fn'
                    : '1. Series Inductance L_lk Design Window (ZVS Energy % vs Duty Loss ΔD %)'
                }
                subtitle={
                  res.isLLC
                    ? `fr = ${res.fr_kHz.toFixed(1)} kHz | fm = ${res.fm_kHz.toFixed(1)} kHz | Ln = ${res.Ln_ratio.toFixed(1)}`
                    : `Shaded Green Window = [Llk,crit(100%) = ${res.Llk_crit_fullLoad_uH.toFixed(1)}µH .. Llk,max = ${res.Llk_max_duty_uH.toFixed(1)}µH]`
                }
                xLabel={res.isLLC ? 'Normalized Frequency fn = fsw / fr' : 'Series Inductance L_lk'}
                xUnit={res.isLLC ? '×fr' : 'µH'}
                currentX={res.isLLC ? res.fn_nom : state.Llk_uH}
                currentXLabel={res.isLLC ? `fn=${res.fn_nom.toFixed(2)}` : `Llk=${state.Llk_uH}µH`}
                minPhysX={res.isLLC ? 0.15 : 0.1}
                maxPhysX={res.isLLC ? 8.0 : 250}
                domainEvaluator={res.evaluators.evalPrimarySweep}
                refEvaluator={pinnedRes?.evaluators.evalPrimarySweep}
                horizontalMarkers={
                  !res.isLLC
                    ? [{ value: 100, label: '100% ZVS Threshold', color: '#10b981', axis: 'left' }]
                    : [{ value: res.M_gain_nom, label: `Target M=${res.M_gain_nom.toFixed(2)}`, color: '#22d3ee', axis: 'left' }]
                }
                validRange={
                  !res.isLLC
                    ? {
                        min: res.Llk_crit_fullLoad_uH,
                        max: res.Llk_max_duty_uH,
                        label: 'Valid ZVS & Duty Window',
                      }
                    : undefined
                }
                data={res.primarySweep.map((p, idx) => ({
                  x: p.x,
                  y1: p.y1,
                  y2: p.y2,
                  refY1: pinnedRes?.primarySweep[idx]?.y1,
                  refY2: pinnedRes?.primarySweep[idx]?.y2,
                }))}
                series1={{
                  label: res.isLLC ? 'Full-Load Gain M(fn)' : 'ZVS Energy Ratio',
                  unit: res.isLLC ? 'V/V' : '%',
                  color: '#10b981',
                }}
                series2={{
                  label: res.isLLC ? 'Light-Load Gain (25%)' : 'Duty Loss ΔD_loss',
                  unit: res.isLLC ? 'V/V' : '%',
                  color: '#f59e0b',
                }}
                onPointClick={
                  !res.isLLC
                    ? (xVal) => setField('Llk_uH', Number(xVal.toFixed(1)))
                    : (fnVal) => setField('fsw_kHz', Math.round(fnVal * res.fr_kHz))
                }
                clickActionHint={
                  !res.isLLC
                    ? 'Click curve to set L_lk (µH) · Use Zoom Out to compute curve up to 250 µH'
                    : 'Click curve to set f_sw (kHz) · Use Zoom Out to compute M(fn) across 0.15..8×fr'
                }
              />

              <InteractiveChart
                title="2. Lagging-Leg ZVS Boundary Across Load % (ZVS Energy % vs Residual Vds,res)"
                subtitle={`Full ZVS achieved above ${res.P_min_zvs_pct.toFixed(0)}% Load · Below ${res.P_min_zvs_pct.toFixed(0)}%, incomplete ZVS leaves Vds,res turn-on voltage`}
                xLabel="Output Load"
                xUnit="%"
                currentX={100}
                currentXLabel={`Min ZVS=${res.P_min_zvs_pct.toFixed(0)}%`}
                minPhysX={2}
                maxPhysX={250}
                domainEvaluator={res.evaluators.evalZvsLoad}
                refEvaluator={pinnedRes?.evaluators.evalZvsLoad}
                horizontalMarkers={[
                  { value: 100, label: '100% Full ZVS Energy', color: '#10b981', axis: 'left' },
                ]}
                validRange={{
                  min: res.P_min_zvs_pct,
                  max: 120,
                  label: `Full ZVS Zone (>${res.P_min_zvs_pct.toFixed(0)}% Load)`,
                }}
                data={res.zvsLoadSweep.map((p, idx) => ({
                  x: p.x,
                  y1: p.y1,
                  y2: p.y2,
                  refY1: pinnedRes?.zvsLoadSweep[idx]?.y1,
                  refY2: pinnedRes?.zvsLoadSweep[idx]?.y2,
                }))}
                series1={{ label: 'Lagging-Leg ZVS Energy Margin', unit: '%', color: '#10b981' }}
                series2={{ label: 'Residual Turn-On Vds,res', unit: 'V', color: '#f43f5e' }}
              />

              <InteractiveChart
                title="3. Efficiency vs Load % — Sync MOSFET SR vs Schottky Diode Rectifier"
                subtitle="Zoom Out to inspect overload efficiency up to 300% rated power"
                xLabel="Output Load"
                xUnit="%"
                currentX={100}
                currentXLabel="100% Rated Load"
                minPhysX={2}
                maxPhysX={300}
                domainEvaluator={res.evaluators.evalEfficiency}
                refEvaluator={pinnedRes?.evaluators.evalEfficiency}
                data={res.efficiencySweep.map((p, idx) => ({
                  x: p.x,
                  y1: p.y1,
                  y2: p.y2,
                  refY1: pinnedRes?.efficiencySweep[idx]?.y1,
                  refY2: pinnedRes?.efficiencySweep[idx]?.y2,
                }))}
                series1={{
                  label: state.rectMode === 'sync-fet' ? 'Selected: Sync MOSFET SR' : 'Selected: Schottky Diode',
                  unit: '%',
                  color: '#06b6d4',
                }}
                series2={{
                  label: state.rectMode === 'sync-fet' ? 'Alt: Schottky Diode' : 'Alt: Sync MOSFET SR',
                  unit: '%',
                  color: '#a855f7',
                }}
              />

              <InteractiveChart
                title="4. Steady-State Switching Cycle Waveforms (Primary Tank Current i_pri & Inductor Current i_Lo)"
                subtitle="Zoom Out to view multiple consecutive switching periods T_sw = 1/f_sw · Use M1..M2 to integrate charge ∫i·dt"
                xLabel="Time t"
                xUnit="µs"
                minPhysX={0}
                maxPhysX={(1000 / state.fsw_kHz) * 6}
                domainEvaluator={res.evaluators.evalWaveforms}
                refEvaluator={pinnedRes?.evaluators.evalWaveforms}
                verticalMarkers={[
                  {
                    value: 1000 / state.fsw_kHz,
                    label: `T_sw = ${(1000 / state.fsw_kHz).toFixed(2)} µs`,
                    color: '#a855f7',
                  },
                ]}
                data={res.waveforms.map((w, idx) => ({
                  x: w.t_us,
                  y1: w.i_pri_A,
                  y2: w.i_lo_A,
                  refY1: pinnedRes?.waveforms[idx]?.i_pri_A,
                  refY2: pinnedRes?.waveforms[idx]?.i_lo_A,
                }))}
                series1={{ label: 'Primary Current i_pri(t)', unit: 'A', color: '#38bdf8' }}
                series2={{ label: 'Output Inductor i_Lo(t)', unit: 'A', color: '#10b981' }}
              />
            </div>

            {/* Capacitor Stress Analysis: Input & Output RMS Ripple Current Rating & L10 Life-Expectancy */}
            <CapacitorBankAnalyzer
              state={state}
              res={res}
              onChange={onChange}
              onOpenPartDrawer={onOpenPartDrawer}
            />
          </div>
        )}

        {/* SUB-TAB 3: ELECTRO-THERMAL MOSFET SWITCHING, CONDUCTION, GATE DRIVE & BODY-DIODE Qrr CALCULATOR */}
        {subTab === 'thermal' && (
          <div className="space-y-4">
            {/* Top Parameter & Status Card */}
            <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-2.5">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold font-mono text-slate-900 dark:text-slate-100">
                      Electro-Thermal MOSFET / SiC / GaN Loss &amp; Body-Diode Reverse-Recovery Calculator
                    </h3>
                    <span
                      className={`px-2 py-0.5 text-[11px] font-mono font-semibold rounded inline-flex items-center gap-1 ${
                        res.thermalStable
                          ? 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/30'
                          : 'bg-rose-500/15 text-rose-500 border border-rose-500/30'
                      }`}
                    >
                      {res.thermalStable ? (
                        <>
                          <ShieldCheck className="w-3.5 h-3.5" /> THERMally CONVERGED (dP/dTj·Rθ = {res.thermalLoopGain.toFixed(3)} &lt; 1)
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="w-3.5 h-3.5" /> THERMAL RUNAWAY / OVER-TEMP RISK (Tj={res.Tj_pri_C.toFixed(1)}°C)
                        </>
                      )}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Self-consistent iterative solver coupling <strong className="text-amber-400">Rds,on(Tj)</strong>,{' '}
                    <strong className="text-cyan-400">Turn-On/Off Gate-Charge Overlap</strong>,{' '}
                    <strong className="text-purple-400">Dead-Time Body-Diode Conduction</strong>, and{' '}
                    <strong className="text-rose-400">Temperature-Scaled Reverse-Recovery Qrr(Tj)</strong>.
                  </p>
                </div>

                {/* DigiKey / Mouser Grounding & Kelvin Package Trick Buttons */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setField('kelvinSourcePri', !res.kelvinSourceActive)}
                    className={`px-2.5 py-1 text-[11px] font-mono rounded border transition-colors cursor-pointer ${
                      res.kelvinSourceActive
                        ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400 font-semibold'
                        : 'bg-amber-500/15 border-amber-500/40 text-amber-400 font-semibold'
                    }`}
                  >
                    {res.kelvinSourceActive
                      ? `4-Pin Kelvin Source (Ls=${res.Ls_common_nH}nH · Saves ${res.Psw_kelvin_saved_W.toFixed(1)}W)`
                      : `3-Pin Common Source (Ls=${res.Ls_common_nH}nH · +${res.Psw_kelvin_saved_W.toFixed(1)}W Loss)`}
                  </button>
                  {onOpenPartDrawer && (
                    <button
                      type="button"
                      onClick={onOpenPartDrawer}
                      className="px-2.5 py-1 text-[11px] font-mono bg-cyan-600 hover:bg-cyan-500 text-white rounded inline-flex items-center gap-1 font-semibold cursor-pointer"
                    >
                      <Search className="w-3 h-3" /> LCSC / DigiKey Component DB ({SEMICONDUCTOR_DATABASE.length})
                    </button>
                  )}
                </div>
              </div>

              {/* Interactive Semiconductor, Gate Drive & Thermal Inputs */}
              <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-2.5">
                <div className="col-span-2">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[11px] font-mono text-slate-500">Primary Bridge Switch</span>
                    <LockToggleButton
                      compact
                      locked={lockedParams.priDeviceId}
                      recentlyAutoUpdated={isAutoUpdated('priDeviceId')}
                      onToggle={() => toggleLock('priDeviceId')}
                      label="Pri Device"
                    />
                  </div>
                  <select
                    value={state.priDeviceId}
                    onChange={(e) => setField('priDeviceId', e.target.value)}
                    className={`w-full mt-0.5 px-2 py-1 text-xs font-mono bg-slate-50 dark:bg-slate-900 border rounded ${
                      lockedParams.priDeviceId
                        ? 'border-amber-500/50'
                        : isAutoUpdated('priDeviceId')
                        ? 'border-emerald-500/70'
                        : 'border-slate-300 dark:border-slate-700'
                    }`}
                  >
                    {SEMICONDUCTOR_DATABASE.filter((d) => d.role !== 'secondary').map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="col-span-2">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[11px] font-mono text-slate-500">Secondary Rectifier / SR Device</span>
                    <LockToggleButton
                      compact
                      locked={lockedParams.secDeviceId}
                      recentlyAutoUpdated={isAutoUpdated('secDeviceId')}
                      onToggle={() => toggleLock('secDeviceId')}
                      label="Sec Device"
                    />
                  </div>
                  <select
                    value={state.secDeviceId}
                    onChange={(e) => setField('secDeviceId', e.target.value)}
                    className={`w-full mt-0.5 px-2 py-1 text-xs font-mono bg-slate-50 dark:bg-slate-900 border rounded ${
                      lockedParams.secDeviceId
                        ? 'border-amber-500/50'
                        : isAutoUpdated('secDeviceId')
                        ? 'border-emerald-500/70'
                        : 'border-slate-300 dark:border-slate-700'
                    }`}
                  >
                    {SEMICONDUCTOR_DATABASE.filter((d) => d.role !== 'primary').map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[11px] font-mono text-slate-500">Rg,ext (Ω)</span>
                    <LockToggleButton
                      compact
                      locked={lockedParams.Rg_ext_Ohm}
                      recentlyAutoUpdated={isAutoUpdated('Rg_ext_Ohm')}
                      onToggle={() => toggleLock('Rg_ext_Ohm')}
                      label="Rg,ext"
                    />
                  </div>
                  <input
                    type="number"
                    step={0.5}
                    min={0}
                    value={res.Rg_ext_Ohm}
                    onChange={(e) => setField('Rg_ext_Ohm', Number(e.target.value))}
                    className={`w-full mt-0.5 px-2 py-1 text-xs font-mono bg-slate-50 dark:bg-slate-900 border rounded ${
                      lockedParams.Rg_ext_Ohm
                        ? 'border-amber-500/50'
                        : isAutoUpdated('Rg_ext_Ohm')
                        ? 'border-emerald-500/70'
                        : 'border-slate-300 dark:border-slate-700'
                    }`}
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[11px] font-mono text-slate-500">Vgs,drive (V)</span>
                    <LockToggleButton
                      compact
                      locked={lockedParams.Vgs_drive_V}
                      recentlyAutoUpdated={isAutoUpdated('Vgs_drive_V')}
                      onToggle={() => toggleLock('Vgs_drive_V')}
                      label="Vgs"
                    />
                  </div>
                  <input
                    type="number"
                    step={1}
                    value={state.Vgs_drive_V}
                    onChange={(e) => setField('Vgs_drive_V', Number(e.target.value))}
                    className={`w-full mt-0.5 px-2 py-1 text-xs font-mono bg-slate-50 dark:bg-slate-900 border rounded ${
                      lockedParams.Vgs_drive_V
                        ? 'border-amber-500/50'
                        : isAutoUpdated('Vgs_drive_V')
                        ? 'border-emerald-500/70'
                        : 'border-slate-300 dark:border-slate-700'
                    }`}
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[11px] font-mono text-slate-500">t_dead (ns)</span>
                    <LockToggleButton
                      compact
                      locked={lockedParams.deadTime_ns}
                      recentlyAutoUpdated={isAutoUpdated('deadTime_ns')}
                      onToggle={() => toggleLock('deadTime_ns')}
                      label="t_dead"
                    />
                  </div>
                  <input
                    type="number"
                    step={10}
                    value={state.deadTime_ns}
                    onChange={(e) => setField('deadTime_ns', Number(e.target.value))}
                    className={`w-full mt-0.5 px-2 py-1 text-xs font-mono bg-slate-50 dark:bg-slate-900 border rounded ${
                      lockedParams.deadTime_ns
                        ? 'border-amber-500/50'
                        : isAutoUpdated('deadTime_ns')
                        ? 'border-emerald-500/70'
                        : 'border-slate-300 dark:border-slate-700'
                    }`}
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[11px] font-mono text-slate-500">N_par (P/S)</span>
                    <div className="flex items-center gap-0.5">
                      <LockToggleButton
                        compact
                        locked={lockedParams.nParallelPri}
                        recentlyAutoUpdated={isAutoUpdated('nParallelPri')}
                        onToggle={() => toggleLock('nParallelPri')}
                        label="Npar Pri"
                      />
                      <LockToggleButton
                        compact
                        locked={lockedParams.nParallelSec}
                        recentlyAutoUpdated={isAutoUpdated('nParallelSec')}
                        onToggle={() => toggleLock('nParallelSec')}
                        label="Npar Sec"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-1 mt-0.5">
                    <input
                      type="number"
                      min={1}
                      max={8}
                      value={state.nParallelPri}
                      onChange={(e) => setField('nParallelPri', Math.max(1, Number(e.target.value)))}
                      className={`w-full px-1.5 py-1 text-xs font-mono bg-slate-50 dark:bg-slate-900 border rounded ${
                        lockedParams.nParallelPri
                          ? 'border-amber-500/50'
                          : isAutoUpdated('nParallelPri')
                          ? 'border-emerald-500/70'
                          : 'border-slate-300 dark:border-slate-700'
                      }`}
                    />
                    <input
                      type="number"
                      min={1}
                      max={12}
                      value={state.nParallelSec}
                      onChange={(e) => setField('nParallelSec', Math.max(1, Number(e.target.value)))}
                      className={`w-full px-1.5 py-1 text-xs font-mono bg-slate-50 dark:bg-slate-900 border rounded ${
                        lockedParams.nParallelSec
                          ? 'border-amber-500/50'
                          : isAutoUpdated('nParallelSec')
                          ? 'border-emerald-500/70'
                          : 'border-slate-300 dark:border-slate-700'
                      }`}
                    />
                  </div>
                </div>
              </div>

              {/* Ambient & Heatsink Row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1 border-t border-slate-200/60 dark:border-slate-800/70">
                <div>
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[11px] font-mono text-slate-500">Ambient Temp Tamb (°C)</span>
                    <LockToggleButton
                      compact
                      locked={lockedParams.Tamb_C}
                      recentlyAutoUpdated={isAutoUpdated('Tamb_C')}
                      onToggle={() => toggleLock('Tamb_C')}
                      label="Tamb"
                    />
                  </div>
                  <input
                    type="number"
                    step={5}
                    value={state.Tamb_C}
                    onChange={(e) => setField('Tamb_C', Number(e.target.value))}
                    className={`w-full mt-0.5 px-2 py-1 text-xs font-mono bg-slate-50 dark:bg-slate-900 border rounded ${
                      lockedParams.Tamb_C
                        ? 'border-amber-500/50'
                        : isAutoUpdated('Tamb_C')
                        ? 'border-emerald-500/70'
                        : 'border-slate-300 dark:border-slate-700'
                    }`}
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[11px] font-mono text-slate-500">Heatsink Rθ,sa (°C/W)</span>
                    <LockToggleButton
                      compact
                      locked={lockedParams.Rth_heatsink_CW}
                      recentlyAutoUpdated={isAutoUpdated('Rth_heatsink_CW')}
                      onToggle={() => toggleLock('Rth_heatsink_CW')}
                      label="Heatsink Rth"
                    />
                  </div>
                  <input
                    type="number"
                    step={0.1}
                    min={0.05}
                    value={state.Rth_heatsink_CW}
                    onChange={(e) => setField('Rth_heatsink_CW', Number(e.target.value))}
                    className={`w-full mt-0.5 px-2 py-1 text-xs font-mono bg-slate-50 dark:bg-slate-900 border rounded ${
                      lockedParams.Rth_heatsink_CW
                        ? 'border-amber-500/50'
                        : isAutoUpdated('Rth_heatsink_CW')
                        ? 'border-emerald-500/70'
                        : 'border-slate-300 dark:border-slate-700'
                    }`}
                  />
                </div>
                <div className="p-2 rounded bg-slate-50 dark:bg-[#0B0E17] border border-slate-200 dark:border-slate-800 font-mono text-xs">
                  <div className="text-[10px] text-slate-400 uppercase">Primary Equilibrium Tj,pri</div>
                  <div className="text-sm font-bold text-amber-400">
                    {res.Tj_pri_C.toFixed(1)} °C{' '}
                    <span className="text-[11px] font-normal text-slate-400">
                      (Rds={res.Rds_pri_actual_mOhm.toFixed(1)}mΩ, Qrr={res.Qrr_pri_hot_nC.toFixed(0)}nC)
                    </span>
                  </div>
                </div>
                <div className="p-2 rounded bg-slate-50 dark:bg-[#0B0E17] border border-slate-200 dark:border-slate-800 font-mono text-xs">
                  <div className="text-[10px] text-slate-400 uppercase">Secondary Equilibrium Tj,sec</div>
                  <div className="text-sm font-bold text-cyan-400">
                    {res.Tj_sec_C.toFixed(1)} °C{' '}
                    <span className="text-[11px] font-normal text-slate-400">
                      (Rds={res.Rds_sec_actual_mOhm.toFixed(2)}mΩ, Qrr={res.Qrr_sec_hot_nC.toFixed(0)}nC)
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Real-Time Semiconductor Thermal Derating & Heatsink Impedance Calculator */}
            <SemiconductorThermalDeratingPanel state={state} res={res} onChange={onChange} />

            {/* 2 Interactive Electro-Thermal & Gate-Drive Charts (with Dynamic Zoom-Out) */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <InteractiveChart
                title="1. Electro-Thermal Equilibrium Curve — MOSFET Heat Generated P_gen(Tj) vs Heatsink Removal P_sink(Tj)"
                subtitle={`Intersection = Equilibrium Tj,pri = ${res.Tj_pri_C.toFixed(1)}°C · Zoom Out to inspect high-temp thermal runaway slope`}
                xLabel="Junction Temperature Tj"
                xUnit="°C"
                currentX={res.Tj_pri_C}
                currentXLabel={`Tj,eq=${res.Tj_pri_C.toFixed(1)}°C`}
                minPhysX={-40}
                maxPhysX={350}
                domainEvaluator={res.evaluators.evalElectroThermal}
                refEvaluator={pinnedRes?.evaluators.evalElectroThermal}
                verticalMarkers={[
                  { value: 150, label: 'Max Safe Tj (150°C)', color: '#f43f5e' },
                  { value: 175, label: 'SiC/Si Abs Max (175°C)', color: '#ef4444' },
                ]}
                validRange={{
                  min: state.Tamb_C,
                  max: 150,
                  label: 'Safe Operating Tj (<150°C)',
                }}
                data={res.electroThermalCurve.map((p, idx) => ({
                  x: p.x,
                  y1: p.y1,
                  y2: p.y2,
                  refY1: pinnedRes?.electroThermalCurve[idx]?.y1,
                  refY2: pinnedRes?.electroThermalCurve[idx]?.y2,
                }))}
                series1={{ label: 'Primary Heat Generated P_gen(Tj)', unit: 'W', color: '#f43f5e' }}
                series2={{ label: 'Heatsink Dissipation P_sink(Tj)', unit: 'W', color: '#10b981' }}
              />

              <InteractiveChart
                title="2. External Gate Resistor Rg,ext Sweep — Switching + Qrr Loss vs Peak Gate Current Ig,pk"
                subtitle={`Click curve to set Rg,ext (${res.Rg_ext_Ohm} Ω) · Ig,pk = ${res.Ig_pk_pri_A.toFixed(2)} A · P_gate,tot = ${(res.Pgate_pri_W + res.Pgate_sec_W).toFixed(2)} W`}
                xLabel="External Gate Resistance Rg,ext"
                xUnit="Ω"
                currentX={res.Rg_ext_Ohm}
                currentXLabel={`Rg,ext=${res.Rg_ext_Ohm}Ω`}
                minPhysX={0}
                maxPhysX={60}
                domainEvaluator={res.evaluators.evalGateLoss}
                refEvaluator={pinnedRes?.evaluators.evalGateLoss}
                onPointClick={(rgVal) => setField('Rg_ext_Ohm', Number(Math.max(0, rgVal).toFixed(1)))}
                clickActionHint="Click curve to set Rg,ext (Ω) · Use Zoom Out to evaluate up to 60 Ω"
                data={res.gateLossSweep.map((p, idx) => ({
                  x: p.x,
                  y1: p.y1,
                  y2: p.y2,
                  refY1: pinnedRes?.gateLossSweep[idx]?.y1,
                  refY2: pinnedRes?.gateLossSweep[idx]?.y2,
                }))}
                series1={{ label: 'Primary Switching + Qrr Loss', unit: 'W', color: '#f59e0b' }}
                series2={{ label: 'Peak Gate Source/Sink Current Ig,pk', unit: 'A', color: '#06b6d4' }}
              />
            </div>

            {/* Gate Drive Current (Ig) & Power (Pg) Analysis Module */}
            <GateDriveAnalysisPanel
              state={state}
              res={res}
              onChange={onChange}
              onOpenPartDrawer={onOpenPartDrawer}
            />

            {/* Detailed Loss Breakdown & Governing KaTeX Equations */}
            <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg p-4">
              <div className="text-xs font-mono font-bold uppercase tracking-wider text-amber-500 mb-2.5">
                Complete Semiconductor Electro-Thermal Loss Breakdown &amp; KaTeX Physics Equations
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs font-mono">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                      <th className="py-2 pr-3">Loss Mechanism</th>
                      <th className="py-2 pr-3">Governing Electro-Thermal Equation (KaTeX)</th>
                      <th className="py-2 pr-3">Primary Bridge ({res.priDevice.tech})</th>
                      <th className="py-2">Secondary Rectifier ({state.rectMode === 'sync-fet' ? 'Sync SR' : 'Schottky'})</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800/70">
                    <tr>
                      <td className="py-2.5 pr-3 font-semibold">1. Channel Conduction Loss</td>
                      <td className="py-2.5 pr-3">
                        <MathFormula tex="P_{\text{cond}}(T_j) = N_{\text{sw}} \left(\frac{I_{\text{rms,sw}}}{N_{\text{par}}}\right)^2 R_{\text{ds,on}}(T_j)" />
                      </td>
                      <td className="py-2.5 pr-3 text-amber-400">
                        {res.Pcond_pri_W.toFixed(2)} W (Rds={res.Rds_pri_actual_mOhm.toFixed(1)}mΩ @ {res.Tj_pri_C.toFixed(0)}°C)
                      </td>
                      <td className="py-2.5 text-cyan-400">
                        {res.Pcond_sec_ch_W.toFixed(2)} W (Rds={res.Rds_sec_actual_mOhm.toFixed(2)}mΩ @ {res.Tj_sec_C.toFixed(0)}°C)
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2.5 pr-3 font-semibold">2. Turn-On Overlap (Partial ZVS)</td>
                      <td className="py-2.5 pr-3">
                        <MathFormula tex="P_{\text{sw,on}} = \frac{1}{2} V_{\text{ds,res}} I_{\text{on}} t_{\text{on}}(R_{g,\text{tot}}) f_{\text{sw}}" />
                      </td>
                      <td className="py-2.5 pr-3 text-amber-400">
                        {res.Psw_on_pri_W.toFixed(2)} W (Vres,lag = {res.Vds_res_lag_V.toFixed(1)} V)
                      </td>
                      <td className="py-2.5 text-slate-400">Zero-Voltage Commutated (SR)</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 pr-3 font-semibold">3. Turn-Off Gate-Plateau Overlap</td>
                      <td className="py-2.5 pr-3">
                        <MathFormula tex="P_{\text{sw,off}} = \frac{1}{2} V_{\text{in}} I_{\text{off}} t_{\text{off}}(R_{g,\text{tot}}, Q_g) f_{\text{sw}}" />
                      </td>
                      <td className="py-2.5 pr-3 text-amber-400">
                        {res.Psw_off_pri_W.toFixed(2)} W (Rg,ext = {res.Rg_ext_Ohm.toFixed(1)} Ω)
                      </td>
                      <td className="py-2.5 text-slate-400">Quasi-Zero Current Turn-Off</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 pr-3 font-semibold">4. Coss Capacitive Hysteresis</td>
                      <td className="py-2.5 pr-3">
                        <MathFormula tex="P_{\text{oss,hyst}} = N_{\text{sw}} k_{\text{hyst}} \left(\frac{1}{2} C_{\text{oss,er}} V_{\text{ds}}^2\right) f_{\text{sw}}" />
                      </td>
                      <td className="py-2.5 pr-3 text-purple-400">
                        {res.Poss_hyst_pri_W.toFixed(2)} W (Coss,er = {res.priDevice.Coss_er_pF} pF)
                      </td>
                      <td className="py-2.5 text-slate-400">Included in Snubber/Clamp</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 pr-3 font-semibold">5. Dead-Time Body-Diode Conduction</td>
                      <td className="py-2.5 pr-3">
                        <MathFormula tex="P_{\text{dt,body}} = 2 V_{\text{sd,body}} I_{\text{comm}} t_{\text{dead,body}} f_{\text{sw}}" />
                      </td>
                      <td className="py-2.5 pr-3 text-emerald-400">
                        {res.Pdt_body_pri_W.toFixed(2)} W (Vsd = {res.priDevice.Vsd_V.toFixed(1)} V, td = {state.deadTime_ns} ns)
                      </td>
                      <td className="py-2.5 text-emerald-400">
                        {res.Pdt_body_sec_W.toFixed(2)} W (Vsd = {res.secDevice.Vsd_V.toFixed(2)} V)
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2.5 pr-3 font-semibold">6. Body-Diode Reverse Recovery Qrr(Tj)</td>
                      <td className="py-2.5 pr-3">
                        <MathFormula tex="P_{\text{rr}}(T_j) = N_{\text{sw}} f_{\text{sw}} Q_{\text{rr,25C}}\left[1 + \kappa_{rr}(T_j - 25)\right] V_{\text{rev}}" />
                      </td>
                      <td className="py-2.5 pr-3 text-rose-400">
                        {res.Prr_pri_W.toFixed(2)} W (Qrr,hot = {res.Qrr_pri_hot_nC.toFixed(1)} nC)
                      </td>
                      <td className="py-2.5 text-rose-400">
                        {res.Prr_sec_W.toFixed(2)} W (Qrr,hot = {res.Qrr_sec_hot_nC.toFixed(1)} nC)
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2.5 pr-3 font-semibold">7. Gate Drive Loss (Internal + External)</td>
                      <td className="py-2.5 pr-3">
                        <MathFormula tex="P_{\text{gate}} = N_{\text{sw}} Q_g V_{\text{gs}} f_{\text{sw}}, \quad P_{\text{gate,ext}} = P_{\text{gate}}\frac{R_{g,\text{ext}}}{R_{g,\text{int}} + R_{g,\text{ext}}}" />
                      </td>
                      <td className="py-2.5 pr-3 text-cyan-400">
                        {res.Pgate_pri_W.toFixed(2)} W (Int: {res.Pgate_int_pri_W.toFixed(2)}W, Ext: {res.Pgate_ext_pri_W.toFixed(2)}W, Ig,pk={res.Ig_pk_pri_A.toFixed(2)}A)
                      </td>
                      <td className="py-2.5 text-cyan-400">
                        {res.Pgate_sec_W.toFixed(2)} W (Total Gate = {(res.Pgate_pri_W + res.Pgate_sec_W).toFixed(2)} W)
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Multi-Device Figure-of-Merit (FOM) & Converter Operating Point Benchmark Table */}
            <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
                <div>
                  <div className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-400">
                    LCSC / OEM Multi-Device Figure-of-Merit (FOM) &amp; Active Operating-Point Benchmark ({state.Vin_nom_V}V, {state.Pout_W}W, {state.fsw_kHz}kHz)
                  </div>
                  <div className="text-[11px] font-mono text-slate-400">
                    Compares all compatible LCSC &amp; custom grounded primary switches — click any row to equip
                  </div>
                </div>
                {onOpenPartDrawer && (
                  <button
                    type="button"
                    onClick={onOpenPartDrawer}
                    className="px-2.5 py-1 text-[11px] font-mono bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/40 text-cyan-300 rounded inline-flex items-center gap-1 font-semibold cursor-pointer"
                  >
                    <Search className="w-3 h-3" /> Browse LCSC Catalog &amp; Export JLCPCB BOM
                  </button>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs font-mono">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                      <th className="py-2 pr-3">Device / MPN</th>
                      <th className="py-2 pr-3">LCSC Part #</th>
                      <th className="py-2 pr-3">Technology</th>
                      <th className="py-2 pr-3">Hard-Sw FOM (Rds×Qg)</th>
                      <th className="py-2 pr-3">ZVS FOM (Rds×Coss)</th>
                      <th className="py-2 pr-3">Qrr FOM (Rds×Qrr)</th>
                      <th className="py-2 pr-3">Est. Bridge Loss P_pri</th>
                      <th className="py-2 pr-3">Est. Tj</th>
                      <th className="py-2">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800/70">
                    {res.deviceBenchmarks.map((b) => {
                      const isEquipped = b.id === state.priDeviceId;
                      return (
                        <tr
                          key={b.id}
                          className={isEquipped ? 'bg-cyan-500/10' : 'hover:bg-slate-50 dark:hover:bg-slate-900/50'}
                        >
                          <td className="py-2 pr-3 font-semibold text-slate-900 dark:text-slate-100">
                            {b.id}{' '}
                            {b.isGroundedCustom && (
                              <span className="ml-1 px-1.5 py-0.2 text-[10px] rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                                Grounded
                              </span>
                            )}
                          </td>
                          <td className="py-2 pr-3">
                            {b.lcscPartNumber ? (
                              <a
                                href={`https://www.lcsc.com/search?q=${encodeURIComponent(b.lcscPartNumber)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-1.5 py-0.5 text-[10px] rounded bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/25"
                              >
                                {b.lcscPartNumber}
                              </a>
                            ) : (
                              <span className="text-slate-500">—</span>
                            )}
                          </td>
                          <td className="py-2 pr-3 text-slate-400">{b.tech}</td>
                          <td className="py-2 pr-3 text-cyan-400">{b.fom_hard_mOhm_nC} mΩ·nC</td>
                          <td className="py-2 pr-3 text-emerald-400">{b.fom_zvs_mOhm_nF} mΩ·nF</td>
                          <td className="py-2 pr-3 text-purple-400">{b.fom_qrr_mOhm_nC} mΩ·nC</td>
                          <td className="py-2 pr-3 font-bold text-amber-400">{b.Ppri_total_W.toFixed(1)} W</td>
                          <td className="py-2 pr-3 text-slate-300">{b.Tj_est_C.toFixed(1)} °C</td>
                          <td className="py-2">
                            {isEquipped ? (
                              <span className="px-2 py-0.5 text-[10px] rounded bg-cyan-600 text-white font-semibold">
                                Equipped
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setField('priDeviceId', b.id)}
                                className="px-2 py-0.5 text-[10px] rounded bg-slate-200 dark:bg-slate-800 hover:bg-cyan-600 hover:text-white text-slate-700 dark:text-slate-300 cursor-pointer"
                              >
                                Equip
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* SUB-TAB 4: CONTROL LOOP BODE, MIDDLEBROOK EMI STABILITY, SLOPE & DSP SYNTHESIS */}
        {subTab === 'control' && (
          <div className="space-y-4">
            {onOpenSmallSignalLab && (
              <div className="bg-emerald-950/30 border border-emerald-500/40 rounded-lg p-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-mono font-bold text-emerald-300">
                    Interactive Small-Signal Stability &amp; Manual Pole/Zero Sandbox Available
                  </div>
                  <div className="text-[11px] font-mono text-slate-400">
                    Inspect Closed-Loop Sensitivity |S(jω)|, Closed-Loop Impedance |Z_out,cl(jω)|, Nyquist Polar Locus, s-Plane Pole/Zero Map, and Step-Load Transients
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onOpenSmallSignalLab}
                  className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-mono font-semibold shadow-sm cursor-pointer shrink-0"
                >
                  Open Full Small-Signal Stability Lab →
                </button>
              </div>
            )}

            <BodeStabilityGraph
              res={res}
              pinnedRes={pinnedRes}
              onSelectControlType={(ctrl) => setField('controlType', ctrl)}
            />

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <InteractiveChart
                title="Middlebrook Input EMI Filter Impedance Stability Criterion"
                subtitle={`|Zin,closed-loop(jω)| vs |Zout,EMI(jω)| · Margin ΔZ_MB = ${res.middlebrookMargin_dB.toFixed(1)} dB (${res.middlebrookStable ? 'STABLE >6dB' : 'INTERACTION RISK'})`}
                xLabel="Frequency"
                xUnit="Hz"
                logX={true}
                currentX={res.fc_actual_kHz * 1e3}
                currentXLabel={`fc=${res.fc_actual_kHz.toFixed(1)}kHz`}
                minPhysX={5}
                maxPhysX={2e6}
                domainEvaluator={res.evaluators.evalMiddlebrook}
                refEvaluator={pinnedRes?.evaluators.evalMiddlebrook}
                horizontalMarkers={[
                  {
                    value: res.Zin_neg_dBOhm,
                    label: `|-Vin²/Pin| = ${res.Zin_neg_dBOhm.toFixed(1)} dBΩ`,
                    color: '#38bdf8',
                    axis: 'left',
                  },
                ]}
                data={res.middlebrookSweep.map((m, idx) => ({
                  x: m.x,
                  y1: m.y1,
                  y2: m.y2,
                  refY1: pinnedRes?.middlebrookSweep[idx]?.y1,
                  refY2: pinnedRes?.middlebrookSweep[idx]?.y2,
                }))}
                series1={{ label: 'Converter Input |Zin,cl(jω)|', unit: 'dBΩ', color: '#10b981' }}
                series2={{ label: 'Damped EMI Filter |Zout,EMI(jω)|', unit: 'dBΩ', color: '#f43f5e' }}
              />

              <InteractiveChart
                title="PCMC Subharmonic Peaking Factor Qp vs Duty Cycle D"
                subtitle={`Compensated mc = ${res.mc_slope.toFixed(2)} (Se = ${res.Se_ramp_V_us.toFixed(2)} V/µs) vs Uncompensated mc = 1.0`}
                xLabel="Effective Duty Cycle D"
                xUnit=""
                currentX={res.Deff_nom}
                currentXLabel={`D=${res.Deff_nom.toFixed(2)}`}
                minPhysX={0.02}
                maxPhysX={0.98}
                domainEvaluator={res.evaluators.evalSlope}
                refEvaluator={pinnedRes?.evaluators.evalSlope}
                horizontalMarkers={[
                  { value: 2.0, label: 'Max Damped Peaking Qp = 2.0', color: '#f59e0b', axis: 'left' },
                ]}
                verticalMarkers={[
                  { value: 0.5, label: 'D = 0.50 Boundary', color: '#a855f7' },
                ]}
                data={res.slopeSweep.map((s, idx) => ({
                  x: s.x,
                  y1: s.y1,
                  y2: s.y2,
                  refY1: pinnedRes?.slopeSweep[idx]?.y1,
                  refY2: pinnedRes?.slopeSweep[idx]?.y2,
                }))}
                series1={{ label: `With Ramp (mc=${res.mc_slope.toFixed(1)})`, unit: 'Qp', color: '#10b981' }}
                series2={{ label: 'No Ramp (mc=1.0 Unstable >0.5)', unit: 'Qp', color: '#f43f5e' }}
              />
            </div>

            {/* EMI / EMC Conducted Filter Design & Attenuation Synthesis Assistant */}
            <EmiFilterDesignAssistant
              state={state}
              res={res}
              onChange={onChange}
              onOpenPartDrawer={onOpenPartDrawer}
            />

            {/* Hardware Protection, Current-Sense & Desaturation Synthesizer */}
            <ProtectionCurrentSensePanel
              state={state}
              res={res}
              onChange={onChange}
              onOpenPartDrawer={onOpenPartDrawer}
            />

            <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg p-3.5">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-mono font-bold uppercase tracking-wider text-emerald-500">
                  Synthesized {state.controlType.toUpperCase()} Pre-Warped Tustin Coefficients &amp; C ISR Implementation
                </div>
                <button
                  type="button"
                  onClick={copyCode}
                  className="px-2.5 py-1 text-xs font-mono bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded inline-flex items-center gap-1"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Copied' : 'Copy C Code'}
                </button>
              </div>
              <pre className="p-3 rounded bg-slate-950 text-emerald-300 text-xs font-mono overflow-x-auto leading-relaxed">
                {res.dspCode}
              </pre>
            </div>
          </div>
        )}

        {/* SUB-TAB 7: DEDICATED EMI/EMC FILTER DESIGN ASSISTANT */}
        {subTab === 'emi' && (
          <div className="space-y-4">
            <EmiFilterDesignAssistant
              state={state}
              res={res}
              onChange={onChange}
              onOpenPartDrawer={onOpenPartDrawer}
            />
          </div>
        )}

        {/* SUB-TAB 8: DEDICATED GATE DRIVE CURRENT (Ig) & POWER (Pg) ANALYSIS MODULE */}
        {subTab === 'gatedrive' && (
          <div className="space-y-4">
            <GateDriveAnalysisPanel
              state={state}
              res={res}
              onChange={onChange}
              onOpenPartDrawer={onOpenPartDrawer}
            />
          </div>
        )}

        {/* SUB-TAB 9: DEDICATED 2D TRANSFORMER WINDING WINDOW & FRINGING FLUX VISUALIZER */}
        {subTab === 'winding' && (
          <div className="space-y-4">
            <WindingWindowVisualizer state={state} res={res} onChange={onChange} />
          </div>
        )}

        {/* SUB-TAB 10: DEDICATED HARDWARE PROTECTION, CURRENT-SENSE & DESATURATION SYNTHESIZER */}
        {subTab === 'protection' && (
          <div className="space-y-4">
            <ProtectionCurrentSensePanel
              state={state}
              res={res}
              onChange={onChange}
              onOpenPartDrawer={onOpenPartDrawer}
            />
          </div>
        )}

        {/* SUB-TAB: ALL CIRCUIT INDUCTORS DESIGN STUDIO */}
        {subTab === 'all-inductors' && (
          <div className="space-y-4">
            <AllInductorsDesigner
              mode="dcdc"
              dcdcState={state}
              dcdcRes={res}
              requestedItemId={jumpTargetId}
              jumpNonce={jumpNonce}
            />
          </div>
        )}

        {/* SUB-TAB 11: ALL CIRCUIT CAPACITORS + BANK RIPPLE, ESR & L10 LIFETIME ANALYZER */}
        {subTab === 'capacitors' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 bg-white dark:bg-[#0E131D] border border-slate-200 dark:border-slate-800 rounded-lg px-4 py-2.5">
              <div className="text-xs font-mono font-semibold text-slate-700 dark:text-slate-200">
                Capacitor Engineering Suite — Switch between All Circuit Capacitor Banks and Deep Ripple/Arrhenius Stress Lab
              </div>
              <div className="inline-flex rounded border border-slate-200 dark:border-slate-700 overflow-hidden text-xs font-medium">
                <button
                  type="button"
                  onClick={() => setCapViewMode('all-caps')}
                  className={`px-3 py-1 cursor-pointer ${
                    capViewMode === 'all-caps'
                      ? 'bg-cyan-600 text-white'
                      : 'bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  All Circuit Capacitors (Matrix &amp; COTS)
                </button>
                <button
                  type="button"
                  onClick={() => setCapViewMode('stress-lab')}
                  className={`px-3 py-1 cursor-pointer ${
                    capViewMode === 'stress-lab'
                      ? 'bg-cyan-600 text-white'
                      : 'bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  Output &amp; Bus Ripple Stress Lab
                </button>
              </div>
            </div>

            {capViewMode === 'all-caps' ? (
              <AllCapacitorsDesigner
                mode="dcdc"
                dcdcState={state}
                dcdcRes={res}
                requestedItemId={jumpTargetId}
                jumpNonce={jumpNonce}
              />
            ) : (
              <CapacitorBankAnalyzer
                state={state}
                res={res}
                onChange={onChange}
                onOpenPartDrawer={onOpenPartDrawer}
              />
            )}
          </div>
        )}

        {/* SUB-TAB 6: DEDICATED REAL-TIME MAGNETIC CORE SATURATION HEADROOM PANEL */}
        {subTab === 'saturation' && (
          <div className="space-y-4">
            <MagneticSaturationPanel state={state} res={res} onChange={onChange} />
          </div>
        )}

        {/* SUB-TAB 5: MAGNETICS (B-H HYSTERESIS LOOP + STEINMETZ CORE HEATING + iGSE + 1D DOWELL + SATURATION B-Im) */}
        {subTab === 'magnetics' && (
          <div className="space-y-4">
            {/* Core Saturation Check Alert Banner (triggers when B_pk exceeds material datasheet limits) */}
            <SaturationCheckAlert
              check={res.saturationCheck}
              coreName={res.core.name}
              materialName={res.material.name}
              currentNp={res.Np_actual}
              onApplyTurns={(np) => setField('Np_turns', np)}
              onApplyCore={(coreId) => setField('coreId', coreId)}
              onApplyMaterial={(materialId) => setField('materialId', materialId)}
            />

            {/* Guided Transformer Core Over-Temperature & Loss Fix Assistant */}
            {(res.coreThermalAnalysis.Tcore_hotspot_C > 108 || !res.coreThermalAnalysis.coreThermalStable) && (() => {
              const thermalFixes = synthesizeDcdcCoreThermalFixes(state, res);
              const isDanger = res.coreThermalAnalysis.Tcore_hotspot_C > 125 || !res.coreThermalAnalysis.coreThermalStable;
              return (
                <div
                  role="alert"
                  className={`rounded-md border p-4 space-y-3 ${
                    isDanger
                      ? 'border-rose-500/70 bg-rose-50 dark:bg-rose-950/25'
                      : 'border-amber-500/70 bg-amber-50 dark:bg-amber-950/25'
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5">
                      <Flame className={`w-4 h-4 shrink-0 mt-0.5 ${isDanger ? 'text-rose-600 dark:text-rose-400' : 'text-amber-600 dark:text-amber-400'}`} />
                      <div>
                        <div className={`text-xs font-semibold ${isDanger ? 'text-rose-800 dark:text-rose-200' : 'text-amber-800 dark:text-amber-200'}`}>
                          {isDanger ? 'Transformer Core Over-Temperature / Runaway Risk' : 'Elevated Transformer Core Hotspot'} — Guided Fix Assistant
                        </div>
                        <p className="text-xs text-slate-700 dark:text-slate-300 mt-0.5">
                          Core thermal balance reached{' '}
                          <span className="font-mono font-semibold tabular-nums">
                            {res.coreThermalAnalysis.Tcore_hotspot_C.toFixed(1)}°C
                          </span>{' '}
                          (P_core = {res.Pcore_W.toFixed(1)} W + P_cu = {res.Pcu_W.toFixed(1)} W on {res.core.name} with R_th = {res.core.Rth_core_CW} °C/W). Pick any verified 1-click fix below:
                        </p>
                      </div>
                    </div>
                    <div className="text-[11px] font-mono tabular-nums text-slate-600 dark:text-slate-300">
                      Loop Gain {res.coreThermalAnalysis.coreThermalLoopGain.toFixed(2)} · Np={res.Np_actual}T · {res.material.name}
                    </div>
                  </div>

                  {thermalFixes.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200/80 dark:border-slate-800">
                      {thermalFixes.map((fix, idx) => (
                        <button
                          key={fix.id}
                          type="button"
                          onClick={() => {
                            if (fix.dcdcPatch) {
                              applyDcdcPatch(fix.dcdcPatch, null, { bypassAutoOpt: true });
                            }
                          }}
                          className={`px-3 py-1.5 rounded text-xs font-medium inline-flex flex-col items-start text-left cursor-pointer transition-colors ${
                            idx === 0
                              ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                              : 'bg-white dark:bg-[#131A26] border border-slate-300 dark:border-slate-700 hover:border-cyan-500 text-slate-800 dark:text-slate-200'
                          }`}
                        >
                          <span className="font-semibold inline-flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                            {fix.label}
                          </span>
                          <span className={`text-[10px] font-mono tabular-nums ${idx === 0 ? 'text-emerald-100' : 'text-slate-500 dark:text-slate-400'}`}>
                            {fix.impact}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* 2D Transformer Winding Window Cross-Section, Spatial MMF F(x) & Air-Gap Fringing Visualizer */}
            <WindingWindowVisualizer state={state} res={res} onChange={onChange} />

            {/* Real-Time Magnetic Core Saturation Headroom & Instantaneous B-Field vs Material B-H Panel */}
            <MagneticSaturationPanel state={state} res={res} onChange={onChange} />

            {/* Specialized 4-Quadrant B-H Hysteresis Loop & Steinmetz Core Heating Workstation */}
            <BhLoopVisualizer
              res={res}
              pinnedRes={pinnedRes}
              onUpdateField={(f, v) => setField(f as keyof DcDcDesignState, v as never)}
            />

            {/* Row 0: Steinmetz Core Loss & Core Heating vs Frequency, Flux Density Swing & Parabolic Temperature Equilibrium */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
              <InteractiveChart
                title="1. Steinmetz Core Loss & Core Heating vs Switching Frequency f_sw"
                subtitle={`Pv ∝ f_sw^α (α=${res.coreThermalAnalysis.alpha_eff}) at ΔB=${res.bhLoopAnalysis.deltaB_mT.toFixed(0)}mT · Click curve to set f_sw`}
                xLabel="Switching Frequency f_sw"
                xUnit="kHz"
                currentX={state.fsw_kHz}
                currentXLabel={`fsw=${state.fsw_kHz}kHz`}
                minPhysX={10}
                maxPhysX={1500}
                domainEvaluator={res.evaluators.evalCoreLossFreq}
                refEvaluator={pinnedRes?.evaluators.evalCoreLossFreq}
                onPointClick={(fVal) => setField('fsw_kHz', Math.round(fVal))}
                clickActionHint="Click curve to set f_sw (kHz) · Zoom Out to evaluate up to 1.5 MHz"
                horizontalMarkers={[
                  { value: 115, label: 'Max Safe Core Temp (115°C)', color: '#f43f5e', axis: 'right' },
                ]}
                data={res.coreThermalAnalysis.freqSweep.map((p, idx) => ({
                  x: p.x,
                  y1: p.y1,
                  y2: p.y2,
                  refY1: pinnedRes?.coreThermalAnalysis.freqSweep[idx]?.y1,
                  refY2: pinnedRes?.coreThermalAnalysis.freqSweep[idx]?.y2,
                }))}
                series1={{ label: 'Core Power Loss P_core(f)', unit: 'W', color: '#f59e0b' }}
                series2={{ label: 'Core Surface Temp T_core(f)', unit: '°C', color: '#f43f5e' }}
              />

              <InteractiveChart
                title="2. Steinmetz Power-Law Core Loss & Heating vs Flux Swing B_pk"
                subtitle={`Pv ∝ B_pk^β (β=${res.coreThermalAnalysis.beta_eff}) at fsw=${state.fsw_kHz}kHz · Min-Loss B_opt=${res.coreThermalAnalysis.Bpk_opt_loss_mT}mT`}
                xLabel="Peak Flux Density Swing B_pk"
                xUnit="mT"
                currentX={res.Bpk_mT}
                currentXLabel={`Bpk=${res.Bpk_mT.toFixed(0)}mT`}
                minPhysX={5}
                maxPhysX={600}
                domainEvaluator={res.evaluators.evalCoreLossFlux}
                refEvaluator={pinnedRes?.evaluators.evalCoreLossFlux}
                onPointClick={(bVal) => {
                  const targetNp = Math.max(
                    1,
                    Math.round((res.Bpk_mT / Math.max(10, bVal)) * res.Np_actual)
                  );
                  setField('Np_turns', targetNp);
                }}
                clickActionHint="Click curve to size primary turns Np for target B_pk (mT)"
                verticalMarkers={[
                  {
                    value: res.coreThermalAnalysis.Bpk_opt_loss_mT,
                    label: `Min-Loss Bopt (${res.coreThermalAnalysis.Bpk_opt_loss_mT}mT)`,
                    color: '#10b981',
                  },
                  {
                    value: res.bhLoopAnalysis.Bsat_100C_mT,
                    label: `Bsat (${res.bhLoopAnalysis.Bsat_100C_mT}mT)`,
                    color: '#f43f5e',
                  },
                ]}
                validRange={{
                  min: 20,
                  max: res.bhLoopAnalysis.Bsat_100C_mT * 0.75,
                  label: 'Safe Thermal & Flux Zone',
                }}
                data={res.coreThermalAnalysis.fluxSweep.map((p, idx) => ({
                  x: p.x,
                  y1: p.y1,
                  y2: p.y2,
                  refY1: pinnedRes?.coreThermalAnalysis.fluxSweep[idx]?.y1,
                  refY2: pinnedRes?.coreThermalAnalysis.fluxSweep[idx]?.y2,
                }))}
                series1={{ label: 'iGSE Core Loss P_core(Bpk)', unit: 'W', color: '#a855f7' }}
                series2={{ label: 'Core Equilibrium Temp T_core', unit: '°C', color: '#10b981' }}
              />

              <InteractiveChart
                title="3. Ferrite Parabolic Thermal Equilibrium P_mag(T_core) vs P_diss(T_core)"
                subtitle={`Loss Trough T_opt = ${res.coreThermalAnalysis.T_opt_eff_C}°C · Equilibrium T_core = ${res.coreThermalAnalysis.Tcore_surface_C}°C`}
                xLabel="Core Temperature T_core"
                xUnit="°C"
                currentX={res.coreThermalAnalysis.Tcore_surface_C}
                currentXLabel={`Teq=${res.coreThermalAnalysis.Tcore_surface_C}°C`}
                minPhysX={-20}
                maxPhysX={240}
                domainEvaluator={res.evaluators.evalCoreTempEquilibrium}
                refEvaluator={pinnedRes?.evaluators.evalCoreTempEquilibrium}
                verticalMarkers={[
                  {
                    value: res.coreThermalAnalysis.T_opt_eff_C,
                    label: `T_opt (${res.coreThermalAnalysis.T_opt_eff_C}°C)`,
                    color: '#10b981',
                  },
                ]}
                validRange={{
                  min: state.Tamb_C,
                  max: 115,
                  label: 'Safe Ferrite Temp (<115°C)',
                }}
                data={res.coreThermalAnalysis.tempEquilibriumSweep.map((p, idx) => ({
                  x: p.x,
                  y1: p.y1,
                  y2: p.y2,
                  refY1: pinnedRes?.coreThermalAnalysis.tempEquilibriumSweep[idx]?.y1,
                  refY2: pinnedRes?.coreThermalAnalysis.tempEquilibriumSweep[idx]?.y2,
                }))}
                series1={{ label: 'Total Mag Heat P_core(T)+P_cu', unit: 'W', color: '#f43f5e' }}
                series2={{ label: 'Core Convection Removal P_sink(T)', unit: 'W', color: '#06b6d4' }}
              />
            </div>

            {/* Multi-Material Steinmetz Coefficients & Core Heating Benchmark Table */}
            <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
                <div>
                  <div className="text-xs font-mono font-bold uppercase tracking-wider text-amber-400">
                    Multi-Material Steinmetz Coefficients (k, α, β, k_i) &amp; Core Heating Benchmark ({state.fsw_kHz} kHz, B_pk = {res.Bpk_mT.toFixed(1)} mT, {res.core.name})
                  </div>
                  <div className="text-[11px] font-mono text-slate-400">
                    Compares volumetric core loss density Pv, iGSE vs SE power loss, and equilibrium core heating across power ferrite grades
                  </div>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs font-mono">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                      <th className="py-2 pr-3">Ferrite Material</th>
                      <th className="py-2 pr-3">Steinmetz (k, α, β)</th>
                      <th className="py-2 pr-3">iGSE k_i</th>
                      <th className="py-2 pr-3">B_sat (100°C)</th>
                      <th className="py-2 pr-3">T_opt Trough</th>
                      <th className="py-2 pr-3">Specific Loss P_v</th>
                      <th className="py-2 pr-3">P_core (iGSE / SE)</th>
                      <th className="py-2 pr-3">Core Rise ΔT_fe</th>
                      <th className="py-2 pr-3">Equilibrium T_core</th>
                      <th className="py-2">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800/70">
                    {res.coreThermalAnalysis.materialBenchmarks.map((m) => {
                      const isEquipped = m.id === state.materialId && !res.coreThermalAnalysis.customSteinmetzEnabled;
                      return (
                        <tr
                          key={m.id}
                          className={isEquipped ? 'bg-purple-500/10' : 'hover:bg-slate-50 dark:hover:bg-slate-900/50'}
                        >
                          <td className="py-2 pr-3 font-semibold text-slate-900 dark:text-slate-100">
                            {m.name}
                          </td>
                          <td className="py-2 pr-3 text-slate-400">
                            k={m.k_si}, α={m.alpha}, β={m.beta}
                          </td>
                          <td className="py-2 pr-3 text-cyan-400">{m.ki_igse}</td>
                          <td className="py-2 pr-3 text-purple-400">
                            {m.Bsat_100C_mT} mT ({m.fluxMargin_pct.toFixed(0)}% margin)
                          </td>
                          <td className="py-2 pr-3 text-slate-400">{m.T_opt_C} °C</td>
                          <td className="py-2 pr-3 text-amber-400 font-semibold">
                            {m.Pv_igse_kW_m3} kW/m³
                          </td>
                          <td className="py-2 pr-3 font-bold text-amber-300">
                            {m.Pcore_igse_W.toFixed(2)} W <span className="text-slate-500 font-normal">/ {m.Pcore_se_W.toFixed(2)} W</span>
                          </td>
                          <td className="py-2 pr-3 text-cyan-400">+{m.deltaT_fe_C.toFixed(1)} °C</td>
                          <td className="py-2 pr-3">
                            <span className={m.Tcore_eq_C > 115 ? 'text-rose-400 font-bold' : 'text-emerald-400 font-bold'}>
                              {m.Tcore_eq_C.toFixed(1)} °C
                            </span>
                          </td>
                          <td className="py-2">
                            {isEquipped ? (
                              <span className="px-2 py-0.5 text-[10px] rounded bg-purple-600 text-white font-semibold">
                                Equipped
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setField('materialId', m.id)}
                                className="px-2 py-0.5 text-[10px] rounded bg-slate-200 dark:bg-slate-800 hover:bg-purple-600 hover:text-white text-slate-700 dark:text-slate-300 cursor-pointer"
                              >
                                Equip {m.id}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Row 1: Core Saturation B(Im) & Incremental Inductance Lm,inc(Im) */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <InteractiveChart
                title={`1. Core Saturation B(Im) Curve — ${res.core.name} (${res.material.name})`}
                subtitle={`B(Im) = Bsat·tanh(Lm·Im / (Np·Ae·Bsat)) + µ0·H | Operating Im,pk = ${res.Im_pk_A.toFixed(2)}A (${res.Bpk_mT.toFixed(0)} mT)`}
                xLabel="Magnetizing Current Im"
                xUnit="A"
                currentX={res.Im_pk_A}
                currentXLabel={`Im,pk=${res.Im_pk_A.toFixed(2)}A`}
                minPhysX={0}
                maxPhysX={res.Isat_90pct_A * 8}
                domainEvaluator={res.evaluators.evalSaturationB}
                refEvaluator={pinnedRes?.evaluators.evalSaturationB}
                horizontalMarkers={[
                  {
                    value: res.material.Bsat_100C_T * 1e3,
                    label: `Bsat(100°C) = ${(res.material.Bsat_100C_T * 1e3).toFixed(0)} mT`,
                    color: '#f43f5e',
                    axis: 'left',
                  },
                ]}
                validRange={{
                  min: 0,
                  max: res.Isat_80pct_A,
                  label: `Safe Linear Zone (<${res.Isat_80pct_A.toFixed(2)}A)`,
                }}
                data={res.saturationCurve.map((p, idx) => ({
                  x: p.Im_A,
                  y1: p.B_100C_mT,
                  y2: p.B_25C_mT,
                  refY1: pinnedRes?.saturationCurve[idx]?.B_100C_mT,
                  refY2: pinnedRes?.saturationCurve[idx]?.B_25C_mT,
                }))}
                series1={{
                  label: `B(Im) @ 100°C (Bsat=${(res.material.Bsat_100C_T * 1e3).toFixed(0)}mT)`,
                  unit: 'mT',
                  color: '#a855f7',
                }}
                series2={{
                  label: `B(Im) @ 25°C (Bsat=${(res.material.Bsat_100C_T * 1.24 * 1e3).toFixed(0)}mT)`,
                  unit: 'mT',
                  color: '#38bdf8',
                }}
              />

              <InteractiveChart
                title="2. Incremental Magnetizing Inductance Roll-Off Lm,inc(Im) vs Current"
                subtitle={`Lm,inc(Im) = Lm0·sech²(Lm0·Im / (Np·Ae·Bsat)) | Knee Isat(80%) = ${res.Isat_80pct_A.toFixed(2)}A, Isat(90%) = ${res.Isat_90pct_A.toFixed(2)}A`}
                xLabel="Magnetizing Current Im"
                xUnit="A"
                currentX={res.Im_pk_A}
                currentXLabel={`Lm(${res.Im_pk_A.toFixed(1)}A)=${res.Lm_at_Im_pk_uH.toFixed(0)}µH`}
                minPhysX={0}
                maxPhysX={res.Isat_90pct_A * 8}
                domainEvaluator={res.evaluators.evalSaturationLm}
                refEvaluator={pinnedRes?.evaluators.evalSaturationLm}
                validRange={{
                  min: 0,
                  max: res.Isat_80pct_A,
                  label: 'High-Permeability Zone',
                }}
                data={res.saturationCurve.map((p, idx) => ({
                  x: p.Im_A,
                  y1: p.Lm_inc_uH,
                  y2: p.H_Am,
                  refY1: pinnedRes?.saturationCurve[idx]?.Lm_inc_uH,
                  refY2: pinnedRes?.saturationCurve[idx]?.H_Am,
                }))}
                series1={{ label: 'Incremental Inductance Lm,inc', unit: 'µH', color: '#10b981' }}
                series2={{ label: 'Magnetic Field Intensity H', unit: 'A/m', color: '#f59e0b' }}
              />
            </div>

            {/* Row 2: iGSE Non-Sinusoidal Core Loss vs Duty & 1D Hyperbolic Dowell AC Factor + Secondary Ringing */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
              <InteractiveChart
                title="3. iGSE Non-Sinusoidal vs Steinmetz Core Loss"
                subtitle={`At Deff=${res.Deff_nom.toFixed(2)}: iGSE=${res.Pcore_igse_W.toFixed(2)}W vs SE=${res.Pcore_se_W.toFixed(2)}W`}
                xLabel="Effective Duty Cycle D"
                xUnit=""
                currentX={res.Deff_nom}
                currentXLabel={`D=${res.Deff_nom.toFixed(2)}`}
                minPhysX={0.05}
                maxPhysX={0.95}
                domainEvaluator={res.evaluators.evalIgse}
                refEvaluator={pinnedRes?.evaluators.evalIgse}
                data={res.igseSweep.map((p, idx) => ({
                  x: p.x,
                  y1: p.y1,
                  y2: p.y2,
                  refY1: pinnedRes?.igseSweep[idx]?.y1,
                  refY2: pinnedRes?.igseSweep[idx]?.y2,
                }))}
                series1={{ label: 'iGSE Non-Sinusoidal P_core', unit: 'W', color: '#a855f7' }}
                series2={{ label: 'Standard Sinusoidal SE P_core', unit: 'W', color: '#38bdf8' }}
              />

              <InteractiveChart
                title="4. 1D Dowell Proximity Factor F_R(f) vs Frequency"
                subtitle={`Stackup: ${state.interleaving} (FR=${res.Fr_dowell_pri.toFixed(2)}×, Cww=${res.Cww_pF.toFixed(0)}pF)`}
                xLabel="Frequency f"
                xUnit="kHz"
                currentX={state.fsw_kHz}
                currentXLabel={`fsw=${state.fsw_kHz}kHz`}
                minPhysX={5}
                maxPhysX={2000}
                domainEvaluator={res.evaluators.evalDowell}
                refEvaluator={pinnedRes?.evaluators.evalDowell}
                onPointClick={(fVal) => setField('fsw_kHz', Math.round(fVal))}
                clickActionHint="Click curve to set f_sw (kHz)"
                data={res.dowellSweep.map((p, idx) => ({
                  x: p.x,
                  y1: p.y1,
                  y2: p.y2,
                  refY1: pinnedRes?.dowellSweep[idx]?.y1,
                  refY2: pinnedRes?.dowellSweep[idx]?.y2,
                }))}
                series1={{ label: `Selected (${state.interleaving})`, unit: '×Rdc', color: '#10b981' }}
                series2={{ label: 'Non-Interleaved (P-P-S-S)', unit: '×Rdc', color: '#f43f5e' }}
              />

              <InteractiveChart
                title="5. Secondary Parasitic Ringing Waveform"
                subtitle={`fring=${res.f_ring_MHz.toFixed(2)}MHz · Z0=${res.Z0_ring_Ohm.toFixed(1)}Ω · Rsnub=${res.Rsnub_Ohm.toFixed(1)}Ω`}
                xLabel="Commutation Time t"
                xUnit="ns"
                minPhysX={0}
                maxPhysX={2000}
                domainEvaluator={res.evaluators.evalRinging}
                refEvaluator={pinnedRes?.evaluators.evalRinging}
                horizontalMarkers={[
                  {
                    value: res.secDevice.Vds_max_V,
                    label: `${res.secDevice.id} BVdss (${res.secDevice.Vds_max_V}V)`,
                    color: '#f43f5e',
                    axis: 'left',
                  },
                ]}
                data={res.ringingSweep.map((p, idx) => ({
                  x: p.x,
                  y1: p.y1,
                  y2: p.y2,
                  refY1: pinnedRes?.ringingSweep[idx]?.y1,
                  refY2: pinnedRes?.ringingSweep[idx]?.y2,
                }))}
                series1={{ label: `Clamped/Snubbed (${state.clampVariant})`, unit: 'V', color: '#06b6d4' }}
                series2={{ label: 'Unclamped Ringing (Llk + Coss,sec)', unit: 'V', color: '#f59e0b' }}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg p-3.5 space-y-3">
                <div className="text-xs font-mono font-bold uppercase tracking-wider text-purple-400">
                  Transformer Core, Winding Stackup &amp; iGSE / Dowell Parameters
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[11px] font-mono text-slate-500">Ferrite Core Geometry</span>
                      <LockToggleButton
                        compact
                        locked={lockedParams.coreId}
                        recentlyAutoUpdated={isAutoUpdated('coreId')}
                        onToggle={() => toggleLock('coreId')}
                        label="Core"
                      />
                    </div>
                    <select
                      value={state.coreId}
                      onChange={(e) => setField('coreId', e.target.value)}
                      className={`w-full mt-0.5 px-2 py-1 text-xs font-mono bg-slate-50 dark:bg-slate-900 border rounded ${
                        lockedParams.coreId
                          ? 'border-amber-500/50'
                          : isAutoUpdated('coreId')
                          ? 'border-emerald-500/70'
                          : 'border-slate-300 dark:border-slate-700'
                      }`}
                    >
                      {CORE_DATABASE.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} (Ae={c.Ae_mm2}mm², le={c.le_mm}mm)
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[11px] font-mono text-slate-500">Ferrite Material</span>
                      <LockToggleButton
                        compact
                        locked={lockedParams.materialId}
                        recentlyAutoUpdated={isAutoUpdated('materialId')}
                        onToggle={() => toggleLock('materialId')}
                        label="Material"
                      />
                    </div>
                    <select
                      value={state.materialId}
                      onChange={(e) => setField('materialId', e.target.value)}
                      className={`w-full mt-0.5 px-2 py-1 text-xs font-mono bg-slate-50 dark:bg-slate-900 border rounded ${
                        lockedParams.materialId
                          ? 'border-amber-500/50'
                          : isAutoUpdated('materialId')
                          ? 'border-emerald-500/70'
                          : 'border-slate-300 dark:border-slate-700'
                      }`}
                    >
                      {MATERIAL_DATABASE.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} (Bsat={m.Bsat_100C_T}T @100°C)
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[11px] font-mono text-slate-500">Turns (Np : Ns)</span>
                      <div className="flex items-center gap-0.5">
                        <LockToggleButton
                          compact
                          locked={lockedParams.Np_turns}
                          recentlyAutoUpdated={isAutoUpdated('Np_turns')}
                          onToggle={() => toggleLock('Np_turns')}
                          label="Np Turns"
                        />
                        <LockToggleButton
                          compact
                          locked={lockedParams.Ns_turns}
                          recentlyAutoUpdated={isAutoUpdated('Ns_turns')}
                          onToggle={() => toggleLock('Ns_turns')}
                          label="Ns Turns"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 mt-0.5">
                      <input
                        type="number"
                        min={1}
                        value={state.Np_turns}
                        onChange={(e) => setField('Np_turns', Number(e.target.value))}
                        className={`w-full px-2 py-1 text-xs font-mono bg-slate-50 dark:bg-slate-900 border rounded ${
                          lockedParams.Np_turns
                            ? 'border-amber-500/50'
                            : isAutoUpdated('Np_turns')
                            ? 'border-emerald-500/70'
                            : 'border-slate-300 dark:border-slate-700'
                        }`}
                      />
                      <input
                        type="number"
                        min={1}
                        value={state.Ns_turns}
                        onChange={(e) => setField('Ns_turns', Number(e.target.value))}
                        className={`w-full px-2 py-1 text-xs font-mono bg-slate-50 dark:bg-slate-900 border rounded ${
                          lockedParams.Ns_turns
                            ? 'border-amber-500/50'
                            : isAutoUpdated('Ns_turns')
                            ? 'border-emerald-500/70'
                            : 'border-slate-300 dark:border-slate-700'
                        }`}
                      />
                    </div>
                  </div>
                  <div>
                    <span className="text-[11px] font-mono text-slate-500">Winding Layer Interleaving</span>
                    <select
                      value={state.interleaving}
                      onChange={(e) =>
                        setField(
                          'interleaving',
                          e.target.value as 'none' | 'split-pri' | 'full-interleaved'
                        )
                      }
                      className="w-full mt-0.5 px-2 py-1 text-xs font-mono bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded"
                    >
                      <option value="none">Non-Interleaved (P-P-S-S, M=1)</option>
                      <option value="split-pri">Split-Primary Sandwich (P/2-S-P/2, M=2)</option>
                      <option value="full-interleaved">Full Interleaved (P-S-P-S, M=4)</option>
                    </select>
                  </div>
                </div>

                <div className="border-t border-slate-200 dark:border-slate-800 pt-2.5 text-xs font-mono space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-400">iGSE Non-Sinusoidal vs Sinusoidal SE Loss:</span>
                    <span className="font-bold text-purple-400">
                      {res.Pcore_igse_W.toFixed(2)} W (iGSE) vs {res.Pcore_se_W.toFixed(2)} W (SE)
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Operating B_pk &amp; Saturation Margin:</span>
                    <span
                      className={
                        res.saturationCheck.status === 'critical'
                          ? 'text-rose-500 font-bold'
                          : res.saturationCheck.status === 'warning'
                          ? 'text-amber-500 font-semibold'
                          : 'text-cyan-400'
                      }
                    >
                      {res.Bpk_mT.toFixed(1)} mT / {res.saturationCheck.Bsat_100C_mT.toFixed(0)} mT (Margin {res.fluxMargin_pct.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="pt-1.5">
                    <SaturationCheckAlert
                      compact
                      check={res.saturationCheck}
                      coreName={res.core.name}
                      materialName={res.material.name}
                      currentNp={res.Np_actual}
                      onApplyTurns={(np) => setField('Np_turns', np)}
                      onApplyCore={(coreId) => setField('coreId', coreId)}
                      onApplyMaterial={(materialId) => setField('materialId', materialId)}
                    />
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Saturation Knee Isat(80%) / Isat(90%):</span>
                    <span className="text-emerald-400">
                      {res.Isat_80pct_A.toFixed(2)} A / {res.Isat_90pct_A.toFixed(2)} A
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Effective µ_e &amp; Equivalent Air-Gap l_g:</span>
                    <span>
                      µ_e = {res.mu_e_actual.toFixed(0)} | l_g = {res.airGap_mm.toFixed(3)} mm
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">1D Dowell F_R (δ={res.skinDepth_mm.toFixed(2)}mm) &amp; C_ww:</span>
                    <span>
                      Pri {res.Fr_dowell_pri.toFixed(2)}× | Sec {res.Fr_dowell_sec.toFixed(2)}× | C_ww ={' '}
                      {res.Cww_pF.toFixed(0)} pF
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg p-3.5 space-y-3">
                <div className="text-xs font-mono font-bold uppercase tracking-wider text-amber-400">
                  Semiconductor Selection &amp; Secondary Parasitic Ringing / Snubber
                </div>
                <div className="space-y-2">
                  <div>
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[11px] font-mono text-slate-500">Primary Bridge Switch</span>
                      <LockToggleButton
                        compact
                        locked={lockedParams.priDeviceId}
                        recentlyAutoUpdated={isAutoUpdated('priDeviceId')}
                        onToggle={() => toggleLock('priDeviceId')}
                        label="Primary Switch"
                      />
                    </div>
                    <select
                      value={state.priDeviceId}
                      onChange={(e) => setField('priDeviceId', e.target.value)}
                      className="w-full mt-0.5 px-2 py-1 text-xs font-mono bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded"
                    >
                      {SEMICONDUCTOR_DATABASE.filter((d) => d.role !== 'secondary').map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[11px] font-mono text-slate-500">Secondary Rectifier Device</span>
                      <LockToggleButton
                        compact
                        locked={lockedParams.secDeviceId}
                        recentlyAutoUpdated={isAutoUpdated('secDeviceId')}
                        onToggle={() => toggleLock('secDeviceId')}
                        label="Secondary Rectifier"
                      />
                    </div>
                    <select
                      value={state.secDeviceId}
                      onChange={(e) => setField('secDeviceId', e.target.value)}
                      className="w-full mt-0.5 px-2 py-1 text-xs font-mono bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded"
                    >
                      {SEMICONDUCTOR_DATABASE.filter((d) => d.role !== 'primary').map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="border-t border-slate-200 dark:border-slate-800 pt-2.5 text-xs font-mono space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Parasitic Tank f_ring &amp; Characteristic Z_0:</span>
                    <span className="text-cyan-400">
                      f_ring = {res.f_ring_MHz.toFixed(2)} MHz | Z_0 = {res.Z0_ring_Ohm.toFixed(1)} Ω
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Ringing Peak V_sec,pk (Clamped vs Unclamped):</span>
                    <span className="font-bold text-amber-400">
                      {res.Vsec_overshoot_V.toFixed(1)} V vs {res.Vsec_unclamped_pk_V.toFixed(0)} V
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Synthesized Critical RC Snubber:</span>
                    <span>
                      R_snub = {res.Rsnub_Ohm.toFixed(1)} Ω, C_snub = {res.Csnub_pF.toFixed(0)} pF (P ={' '}
                      {res.Psnub_W.toFixed(1)} W)
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Active Clamp Capacitor C_clamp:</span>
                    <span>{res.Cclamp_nF.toFixed(0)} nF</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Geometric Leakage L_lk,geom:</span>
                    <span className="text-emerald-400">
                      {res.Llk_geom_uH.toFixed(2)} µH (Ext Shim ={' '}
                      {Math.max(0, state.Llk_uH - res.Llk_geom_uH).toFixed(2)} µH)
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Iterative Equilibrium Temps (Tj,pri / Tj,sec):</span>
                    <span className="text-amber-400 font-semibold">
                      {res.Tj_pri_C.toFixed(1)} °C / {res.Tj_sec_C.toFixed(1)} °C
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
