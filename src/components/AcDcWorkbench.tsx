import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ACDC_PRESETS,
  AcDcControlType,
  AcDcDesignState,
  AcDcTopologyType,
  SEMICONDUCTOR_DATABASE,
} from '../data/databases';
import { AcDcResults } from '../engine/acdcEngine';
import { AcDcSchematicView } from './CircuitSchematics';
import { InteractiveChart } from './InteractiveChart';
import { MathFormula } from './MathFormula';
import { ResizableSidebarWindow } from './ResizableSidebarWindow';
import { AutoSolverBanner, LockToggleButton } from './AutoSolverControls';
import { useDesignSolver } from './DesignSolverContext';
import { AcDcLockableKey } from '../engine/autoOptimizer';
import { AllInductorsDesigner } from './AllInductorsDesigner';
import { AllCapacitorsDesigner } from './AllCapacitorsDesigner';
import {
  Activity,
  Cpu,
  Zap,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Check,
  Search,
  ShieldAlert,
  Magnet,
  BatteryCharging,
  Radio,
  Flame,
  BarChart3,
  Compass,
} from 'lucide-react';

interface AcDcWorkbenchProps {
  state: AcDcDesignState;
  onChange: (next: AcDcDesignState) => void;
  res: AcDcResults;
  pinnedRes: AcDcResults | null;
  onOpenPartDrawer?: () => void;
  onOpenSmallSignalLab?: () => void;
  requestedSubTab?: AcDcSubTab;
  onChangeSubTab?: (tab: AcDcSubTab) => void;
  jumpTargetId?: string | null;
  jumpNonce?: number;
}

export type AcDcSubTab =
  | 'schematic'
  | 'graphs'
  | 'control'
  | 'harmonics'
  | 'all-inductors'
  | 'magnetics'
  | 'inrush'
  | 'dc-link'
  | 'emi'
  | 'efficiency';

export const AcDcWorkbench: React.FC<AcDcWorkbenchProps> = ({
  state,
  onChange,
  res,
  pinnedRes,
  onOpenPartDrawer,
  onOpenSmallSignalLab,
  requestedSubTab,
  onChangeSubTab,
  jumpTargetId,
  jumpNonce,
}) => {
  const [localSubTab, setLocalSubTab] = useState<AcDcSubTab>('schematic');
  const activeSubTab = requestedSubTab ?? localSubTab;
  const setActiveSubTab = (tab: AcDcSubTab) => {
    setLocalSubTab(tab);
    onChangeSubTab?.(tab);
  };
  const [copiedCode, setCopiedCode] = useState(false);
  const subTabNavRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!jumpNonce) return;
    subTabNavRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [jumpNonce, activeSubTab]);

  const {
    acdcAutoOpt: autoOptimize,
    setAcdcAutoOpt: setAutoOptimize,
    acdcLocked: lockedParams,
    toggleAcdcLock: toggleLock,
    setAllAcdcLocks: setAllLocks,
    resetAcdcLocksSpecsOnly,
    acdcChanges: lastAutoChanges,
    clearAcdcChanges,
    setAcdcField: update,
    optimizeAcdcNow: optimizeNow,
  } = useDesignSolver();

  const customDeadTime_ns = state.deadTime_zcd_ns ?? 180;
  const customPrechargeR_Ohm = state.prechargeR_Ohm ?? res.R_precharge_Ohm;
  const customCy_nF = state.Cy_nF ?? res.Cy_each_nF;
  const capAmbient_C = state.capAmbient_C ?? 45;

  const isAutoUpdated = (key: AcDcLockableKey) => lastAutoChanges.some((c) => c.key === key);

  const lockKeys = Object.keys(lockedParams) as AcDcLockableKey[];
  const lockedCount = lockKeys.filter((k) => lockedParams[k]).length;

  const handlePresetChange = (presetId: string) => {
    const found = ACDC_PRESETS.find((p) => p.id === presetId);
    if (found) {
      clearAcdcChanges();
      onChange(found.state);
    }
  };

  const copyDspCode = () => {
    navigator.clipboard.writeText(res.dspCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 1800);
  };

  const primarySwitches = useMemo(
    () => SEMICONDUCTOR_DATABASE.filter((s) => s.role === 'primary' || s.role === 'both'),
    []
  );

  // Custom interactive calculations for sub-tabs
  const customZcdSpike_A = (state.Vdc_bus_V * (customDeadTime_ns * 1e-9)) / (state.Lpfc_uH * 1e-6);
  const customVpk_max_V = state.Vac_max_V * Math.sqrt(2);
  const customIinrush_pk_A = customVpk_max_V / (customPrechargeR_Ohm + 0.15 + state.ESR_Cdc_mOhm * 1e-3);
  const customTau_s = customPrechargeR_Ohm * (state.Cdc_uF * 1e-6);
  const customRelayTime_ms = 4.2 * customTau_s * 1e3;
  const customI2t_A2s = 0.5 * customIinrush_pk_A * customIinrush_pk_A * customTau_s;

  const customEarthLeakage_mA =
    2 * Math.PI * state.f_line_Hz * state.Vac_max_V * (customCy_nF * 1e-9) * 1e3;

  const customCapHotspot_C = capAmbient_C + res.capTempRise_C;
  const customCapLife_hrs = Math.min(250000, 8000 * Math.pow(2, (105 - customCapHotspot_C) / 10));

  return (
    <div className="flex flex-col lg:flex-row items-start gap-4 relative">
      {/* ===================================================================== */}
      {/* LEFT SIDEBAR: PARAMETER CONTROLS WITH LIVE SLIDERS                    */}
      {/* ===================================================================== */}
      <ResizableSidebarWindow
        title="AC-DC PFC Parameters"
        subtitle="Scrollable • Drag Right Border"
        defaultWidth={360}
      >
        {/* Preset Selector */}
        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
            Reference Design Preset
          </label>
          <select
            aria-label="Reference Design Presets"
            onChange={(e) => handlePresetChange(e.target.value)}
            defaultValue={ACDC_PRESETS[0].id}
            className="w-full h-8 bg-slate-50 dark:bg-[#090C12] border border-slate-200 dark:border-slate-700 rounded-md px-2.5 text-xs text-slate-900 dark:text-slate-100"
          >
            {ACDC_PRESETS.map((p) => (
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
          onLockSpecsOnly={resetAcdcLocksSpecsOnly}
          onLockAll={() => setAllLocks(true)}
          onUnlockAll={() => setAllLocks(false)}
          lockedCount={lockedCount}
          totalCount={lockKeys.length}
          recentChanges={lastAutoChanges}
          onClearChanges={clearAcdcChanges}
        />

        {/* Topology & Control Architecture */}
        <div className="border-t border-slate-200 dark:border-slate-800 pt-3 space-y-2.5">
          <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
            PFC Topology &amp; Control
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
              Power Stage Topology Variant
            </label>
            <select
              aria-label="Power Stage Topology"
              value={state.topology}
              onChange={(e) => update('topology', e.target.value as AcDcTopologyType)}
              className="w-full h-8 bg-slate-50 dark:bg-[#090C12] border border-slate-200 dark:border-slate-700 rounded-md px-2.5 text-xs text-slate-900 dark:text-slate-100"
            >
              <option value="2ph-interleaved-totem">
                2-Ph Interleaved Bridgeless Totem-Pole (0°/180°)
              </option>
              <option value="1ph-totem-pfc">
                1-Phase Bridgeless Totem-Pole PFC (CCM/TCM)
              </option>
              <option value="2ph-interleaved-boost">
                2-Ph Interleaved Diode-Bridge Boost PFC
              </option>
              <option value="dual-boost-bridgeless">
                Dual-Boost Semi-Bridgeless PFC (with DR1, DR2)
              </option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
              Current / Voltage Control Law
            </label>
            <select
              aria-label="Current / Voltage Control Law"
              value={state.controlType}
              onChange={(e) => update('controlType', e.target.value as AcDcControlType)}
              className="w-full h-8 bg-slate-50 dark:bg-[#090C12] border border-slate-200 dark:border-slate-700 rounded-md px-2.5 text-xs text-slate-900 dark:text-slate-100"
            >
              <option value="acmc">Average Current Mode Control (ACMC + Feedforward)</option>
              <option value="2p2z">Digital 2P2Z (Pre-Warped Tustin Bilinear)</option>
              <option value="cascaded-pi">Cascaded Dual-PI + SOGI-PLL</option>
              <option value="mpc">FCS-MPC / Deadbeat Predictive Current Control</option>
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between gap-1 mb-1">
              <div className="flex items-center gap-1.5">
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400">
                  Fast Switching Leg Device
                </label>
                <LockToggleButton
                  compact
                  locked={lockedParams.fastSwitchId}
                  recentlyAutoUpdated={isAutoUpdated('fastSwitchId')}
                  onToggle={() => toggleLock('fastSwitchId')}
                  label="Fast Switch"
                />
              </div>
              {onOpenPartDrawer && (
                <button
                  type="button"
                  onClick={onOpenPartDrawer}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-cyan-600 dark:text-cyan-400 hover:underline cursor-pointer"
                >
                  <Search className="w-3 h-3" /> Catalog
                </button>
              )}
            </div>
            <select
              aria-label="Fast Switching Leg Device"
              value={state.fastSwitchId}
              onChange={(e) => update('fastSwitchId', e.target.value)}
              className={`w-full h-8 bg-slate-50 dark:bg-[#090C12] border rounded-md px-2.5 text-xs text-slate-900 dark:text-slate-100 ${
                lockedParams.fastSwitchId
                  ? 'border-amber-500/50'
                  : isAutoUpdated('fastSwitchId')
                  ? 'border-emerald-500/70'
                  : 'border-slate-200 dark:border-slate-700'
              }`}
            >
              {primarySwitches.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            {res.sw.lcscPartNumber && (
              <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                <span>
                  LCSC: <strong className="font-mono text-emerald-600 dark:text-emerald-400">{res.sw.lcscPartNumber}</strong> · {res.sw.packageType}
                </span>
                <span className="font-mono">{res.sw.jlcpcbClass}</span>
              </div>
            )}
          </div>
        </div>

        {/* AC Grid & DC Bus Specs */}
        <div className="border-t border-slate-200 dark:border-slate-800 pt-3 space-y-2.5">
          <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
            AC Grid &amp; DC Bus Specs
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <div className="flex justify-between items-center gap-1 text-[10px] text-slate-500 mb-0.5">
                <span className="truncate">Vac,nom (Vrms)</span>
                <LockToggleButton
                  locked={lockedParams.Vac_rms_V}
                  recentlyAutoUpdated={isAutoUpdated('Vac_rms_V')}
                  onToggle={() => toggleLock('Vac_rms_V')}
                  label="Vac,nom"
                />
              </div>
              <input
                type="number"
                value={state.Vac_rms_V}
                onChange={(e) => update('Vac_rms_V', Number(e.target.value))}
                className={`w-full bg-slate-50 dark:bg-slate-900 border rounded px-2 py-1 text-xs font-mono mb-1 ${
                  lockedParams.Vac_rms_V
                    ? 'border-amber-500/50'
                    : isAutoUpdated('Vac_rms_V')
                    ? 'border-emerald-500/70'
                    : 'border-slate-300 dark:border-slate-700'
                }`}
              />
              <input
                type="range"
                min={90}
                max={480}
                step={5}
                value={state.Vac_rms_V}
                onChange={(e) => update('Vac_rms_V', Number(e.target.value))}
                className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
              />
            </div>
            <div>
              <div className="flex justify-between items-center gap-1 text-[10px] text-slate-500 mb-0.5">
                <span className="truncate">Vdc Bus (V)</span>
                <LockToggleButton
                  locked={lockedParams.Vdc_bus_V}
                  recentlyAutoUpdated={isAutoUpdated('Vdc_bus_V')}
                  onToggle={() => toggleLock('Vdc_bus_V')}
                  label="Vdc Bus"
                />
              </div>
              <input
                type="number"
                value={state.Vdc_bus_V}
                onChange={(e) => update('Vdc_bus_V', Number(e.target.value))}
                className={`w-full bg-slate-50 dark:bg-slate-900 border rounded px-2 py-1 text-xs font-mono mb-1 ${
                  lockedParams.Vdc_bus_V
                    ? 'border-amber-500/50'
                    : isAutoUpdated('Vdc_bus_V')
                    ? 'border-emerald-500/70'
                    : 'border-slate-300 dark:border-slate-700'
                }`}
              />
              <input
                type="range"
                min={350}
                max={900}
                step={10}
                value={state.Vdc_bus_V}
                onChange={(e) => update('Vdc_bus_V', Number(e.target.value))}
                className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
              />
            </div>
            <div>
              <div className="flex justify-between items-center gap-1 text-[10px] text-slate-500 mb-0.5">
                <span className="truncate">Pout (W)</span>
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
                onChange={(e) => update('Pout_W', Number(e.target.value))}
                className={`w-full bg-slate-50 dark:bg-slate-900 border rounded px-2 py-1 text-xs font-mono mb-1 ${
                  lockedParams.Pout_W
                    ? 'border-amber-500/50'
                    : isAutoUpdated('Pout_W')
                    ? 'border-emerald-500/70'
                    : 'border-slate-300 dark:border-slate-700'
                }`}
              />
              <input
                type="range"
                min={500}
                max={15000}
                step={100}
                value={state.Pout_W}
                onChange={(e) => update('Pout_W', Number(e.target.value))}
                className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
              />
            </div>
            <div>
              <div className="flex justify-between items-center gap-1 text-[10px] text-slate-500 mb-0.5">
                <span className="truncate">fsw / Ph (kHz)</span>
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
                onChange={(e) => update('fsw_kHz', Number(e.target.value))}
                className={`w-full bg-slate-50 dark:bg-slate-900 border rounded px-2 py-1 text-xs font-mono mb-1 ${
                  lockedParams.fsw_kHz
                    ? 'border-amber-500/50'
                    : isAutoUpdated('fsw_kHz')
                    ? 'border-emerald-500/70'
                    : 'border-slate-300 dark:border-slate-700'
                }`}
              />
              <input
                type="range"
                min={25}
                max={250}
                step={5}
                value={state.fsw_kHz}
                onChange={(e) => update('fsw_kHz', Number(e.target.value))}
                className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
              />
            </div>
            <div>
              <div className="flex justify-between items-center gap-1 text-[10px] text-slate-500 mb-0.5">
                <span className="truncate">Vac,min (Vrms)</span>
                <LockToggleButton
                  compact
                  locked={lockedParams.Vac_min_V}
                  recentlyAutoUpdated={isAutoUpdated('Vac_min_V')}
                  onToggle={() => toggleLock('Vac_min_V')}
                  label="Vac,min"
                />
              </div>
              <input
                type="number"
                step={5}
                value={state.Vac_min_V}
                onChange={(e) => update('Vac_min_V', Number(e.target.value))}
                className={`w-full bg-slate-50 dark:bg-slate-900 border rounded px-2 py-1 text-xs font-mono ${
                  lockedParams.Vac_min_V
                    ? 'border-amber-500/50'
                    : isAutoUpdated('Vac_min_V')
                    ? 'border-emerald-500/70'
                    : 'border-slate-300 dark:border-slate-700'
                }`}
              />
            </div>
            <div>
              <div className="flex justify-between items-center gap-1 text-[10px] text-slate-500 mb-0.5">
                <span className="truncate">Vac,max (Vrms)</span>
                <LockToggleButton
                  compact
                  locked={lockedParams.Vac_max_V}
                  recentlyAutoUpdated={isAutoUpdated('Vac_max_V')}
                  onToggle={() => toggleLock('Vac_max_V')}
                  label="Vac,max"
                />
              </div>
              <input
                type="number"
                step={5}
                value={state.Vac_max_V}
                onChange={(e) => update('Vac_max_V', Number(e.target.value))}
                className={`w-full bg-slate-50 dark:bg-slate-900 border rounded px-2 py-1 text-xs font-mono ${
                  lockedParams.Vac_max_V
                    ? 'border-amber-500/50'
                    : isAutoUpdated('Vac_max_V')
                    ? 'border-emerald-500/70'
                    : 'border-slate-300 dark:border-slate-700'
                }`}
              />
            </div>
          </div>
        </div>

        {/* Magnetics & Hold-Up Capacitor */}
        <div className="border-t border-slate-200 dark:border-slate-800 pt-3 space-y-2.5">
          <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
            Boost Inductors &amp; DC-Link Cap
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <div className="flex justify-between items-center gap-1 text-[10px] text-slate-500 mb-0.5">
                <span className="truncate">Lpfc / Ph (µH)</span>
                <LockToggleButton
                  locked={lockedParams.Lpfc_uH}
                  recentlyAutoUpdated={isAutoUpdated('Lpfc_uH')}
                  onToggle={() => toggleLock('Lpfc_uH')}
                  label="Lpfc"
                />
              </div>
              <input
                type="number"
                value={state.Lpfc_uH}
                onChange={(e) => update('Lpfc_uH', Number(e.target.value))}
                className={`w-full bg-slate-50 dark:bg-slate-900 border rounded px-2 py-1 text-xs font-mono mb-1 ${
                  lockedParams.Lpfc_uH
                    ? 'border-amber-500/50'
                    : isAutoUpdated('Lpfc_uH')
                    ? 'border-emerald-500/70'
                    : 'border-slate-300 dark:border-slate-700'
                }`}
              />
              <input
                type="range"
                min={40}
                max={600}
                step={5}
                value={state.Lpfc_uH}
                onChange={(e) => update('Lpfc_uH', Number(e.target.value))}
                className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
              />
            </div>
            <div>
              <div className="flex justify-between items-center gap-1 text-[10px] text-slate-500 mb-0.5">
                <span className="truncate">RL (mΩ)</span>
                <LockToggleButton
                  locked={lockedParams.RL_mOhm}
                  recentlyAutoUpdated={isAutoUpdated('RL_mOhm')}
                  onToggle={() => toggleLock('RL_mOhm')}
                  label="Inductor RL"
                />
              </div>
              <input
                type="number"
                value={state.RL_mOhm}
                onChange={(e) => update('RL_mOhm', Number(e.target.value))}
                className={`w-full bg-slate-50 dark:bg-slate-900 border rounded px-2 py-1 text-xs font-mono mb-1 ${
                  lockedParams.RL_mOhm
                    ? 'border-amber-500/50'
                    : isAutoUpdated('RL_mOhm')
                    ? 'border-emerald-500/70'
                    : 'border-slate-300 dark:border-slate-700'
                }`}
              />
              <input
                type="range"
                min={5}
                max={120}
                step={1}
                value={state.RL_mOhm}
                onChange={(e) => update('RL_mOhm', Number(e.target.value))}
                className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
              />
            </div>
            <div>
              <div className="flex justify-between items-center gap-1 text-[10px] text-slate-500 mb-0.5">
                <span className="truncate">Cdc (µF)</span>
                <LockToggleButton
                  locked={lockedParams.Cdc_uF}
                  recentlyAutoUpdated={isAutoUpdated('Cdc_uF')}
                  onToggle={() => toggleLock('Cdc_uF')}
                  label="Cdc Bank"
                />
              </div>
              <input
                type="number"
                step={50}
                value={state.Cdc_uF}
                onChange={(e) => update('Cdc_uF', Number(e.target.value))}
                className={`w-full bg-slate-50 dark:bg-slate-900 border rounded px-2 py-1 text-xs font-mono mb-1 ${
                  lockedParams.Cdc_uF
                    ? 'border-amber-500/50'
                    : isAutoUpdated('Cdc_uF')
                    ? 'border-emerald-500/70'
                    : 'border-slate-300 dark:border-slate-700'
                }`}
              />
              <input
                type="range"
                min={300}
                max={4500}
                step={50}
                value={state.Cdc_uF}
                onChange={(e) => update('Cdc_uF', Number(e.target.value))}
                className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
              />
            </div>
            <div>
              <div className="flex justify-between items-center gap-1 text-[10px] text-slate-500 mb-0.5">
                <span className="truncate">ESR Cdc (mΩ)</span>
                <LockToggleButton
                  locked={lockedParams.ESR_Cdc_mOhm}
                  recentlyAutoUpdated={isAutoUpdated('ESR_Cdc_mOhm')}
                  onToggle={() => toggleLock('ESR_Cdc_mOhm')}
                  label="ESR Cdc"
                />
              </div>
              <input
                type="number"
                value={state.ESR_Cdc_mOhm}
                onChange={(e) => update('ESR_Cdc_mOhm', Number(e.target.value))}
                className={`w-full bg-slate-50 dark:bg-slate-900 border rounded px-2 py-1 text-xs font-mono mb-1 ${
                  lockedParams.ESR_Cdc_mOhm
                    ? 'border-amber-500/50'
                    : isAutoUpdated('ESR_Cdc_mOhm')
                    ? 'border-emerald-500/70'
                    : 'border-slate-300 dark:border-slate-700'
                }`}
              />
              <input
                type="range"
                min={5}
                max={80}
                step={1}
                value={state.ESR_Cdc_mOhm}
                onChange={(e) => update('ESR_Cdc_mOhm', Number(e.target.value))}
                className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
              />
            </div>
            <div>
              <div className="flex justify-between items-center gap-1 text-[10px] text-slate-500 mb-0.5">
                <span className="truncate">tHold (ms)</span>
                <LockToggleButton
                  locked={lockedParams.tHold_ms}
                  recentlyAutoUpdated={isAutoUpdated('tHold_ms')}
                  onToggle={() => toggleLock('tHold_ms')}
                  label="Target tHold"
                />
              </div>
              <input
                type="number"
                value={state.tHold_ms}
                onChange={(e) => update('tHold_ms', Number(e.target.value))}
                className={`w-full bg-slate-50 dark:bg-slate-900 border rounded px-2 py-1 text-xs font-mono mb-1 ${
                  lockedParams.tHold_ms
                    ? 'border-amber-500/50'
                    : isAutoUpdated('tHold_ms')
                    ? 'border-emerald-500/70'
                    : 'border-slate-300 dark:border-slate-700'
                }`}
              />
              <input
                type="range"
                min={8}
                max={40}
                step={1}
                value={state.tHold_ms}
                onChange={(e) => update('tHold_ms', Number(e.target.value))}
                className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
              />
            </div>
            <div>
              <div className="flex justify-between items-center gap-1 text-[10px] text-slate-500 mb-0.5">
                <span className="truncate">Vdc,min Hold</span>
                <LockToggleButton
                  locked={lockedParams.Vdc_min_hold_V}
                  recentlyAutoUpdated={isAutoUpdated('Vdc_min_hold_V')}
                  onToggle={() => toggleLock('Vdc_min_hold_V')}
                  label="Vdc,min Hold"
                />
              </div>
              <input
                type="number"
                value={state.Vdc_min_hold_V}
                onChange={(e) => update('Vdc_min_hold_V', Number(e.target.value))}
                className={`w-full bg-slate-50 dark:bg-slate-900 border rounded px-2 py-1 text-xs font-mono mb-1 ${
                  lockedParams.Vdc_min_hold_V
                    ? 'border-amber-500/50'
                    : isAutoUpdated('Vdc_min_hold_V')
                    ? 'border-emerald-500/70'
                    : 'border-slate-300 dark:border-slate-700'
                }`}
              />
              <input
                type="range"
                min={250}
                max={750}
                step={10}
                value={state.Vdc_min_hold_V}
                onChange={(e) => update('Vdc_min_hold_V', Number(e.target.value))}
                className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
              />
            </div>
          </div>
        </div>

        {/* Control Loop Tuning */}
        <div className="border-t border-slate-200 dark:border-slate-800 pt-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
              Loop Bandwidth &amp; Phase Margin
            </div>
            {onOpenSmallSignalLab && (
              <button
                type="button"
                onClick={onOpenSmallSignalLab}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-cyan-600 dark:text-cyan-400 hover:underline cursor-pointer"
              >
                <Compass className="w-3 h-3" /> Small-Signal Lab
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <div className="flex justify-between items-center gap-1 text-[10px] text-slate-500 mb-0.5">
                <span className="truncate">fc,i (kHz)</span>
                <LockToggleButton
                  locked={lockedParams.fc_i_kHz}
                  recentlyAutoUpdated={isAutoUpdated('fc_i_kHz')}
                  onToggle={() => toggleLock('fc_i_kHz')}
                  label="fc,i"
                />
              </div>
              <input
                type="number"
                step={0.5}
                value={state.fc_i_kHz}
                onChange={(e) => update('fc_i_kHz', Number(e.target.value))}
                className={`w-full bg-slate-50 dark:bg-slate-900 border rounded px-2 py-1 text-xs font-mono mb-1 ${
                  lockedParams.fc_i_kHz
                    ? 'border-amber-500/50'
                    : isAutoUpdated('fc_i_kHz')
                    ? 'border-emerald-500/70'
                    : 'border-slate-300 dark:border-slate-700'
                }`}
              />
              <input
                type="range"
                min={2.0}
                max={20.0}
                step={0.5}
                value={state.fc_i_kHz}
                onChange={(e) => update('fc_i_kHz', Number(e.target.value))}
                className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
              />
            </div>
            <div>
              <div className="flex justify-between items-center gap-1 text-[10px] text-slate-500 mb-0.5">
                <span className="truncate">PM_i (deg)</span>
                <LockToggleButton
                  locked={lockedParams.pm_i_deg}
                  recentlyAutoUpdated={isAutoUpdated('pm_i_deg')}
                  onToggle={() => toggleLock('pm_i_deg')}
                  label="PM_i"
                />
              </div>
              <input
                type="number"
                value={state.pm_i_deg}
                onChange={(e) => update('pm_i_deg', Number(e.target.value))}
                className={`w-full bg-slate-50 dark:bg-slate-900 border rounded px-2 py-1 text-xs font-mono mb-1 ${
                  lockedParams.pm_i_deg
                    ? 'border-amber-500/50'
                    : isAutoUpdated('pm_i_deg')
                    ? 'border-emerald-500/70'
                    : 'border-slate-300 dark:border-slate-700'
                }`}
              />
              <input
                type="range"
                min={35}
                max={75}
                step={1}
                value={state.pm_i_deg}
                onChange={(e) => update('pm_i_deg', Number(e.target.value))}
                className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
              />
            </div>
            <div>
              <div className="flex justify-between items-center gap-1 text-[10px] text-slate-500 mb-0.5">
                <span className="truncate">fc,v (Hz)</span>
                <LockToggleButton
                  locked={lockedParams.fc_v_Hz}
                  recentlyAutoUpdated={isAutoUpdated('fc_v_Hz')}
                  onToggle={() => toggleLock('fc_v_Hz')}
                  label="fc,v"
                />
              </div>
              <input
                type="number"
                value={state.fc_v_Hz}
                onChange={(e) => update('fc_v_Hz', Number(e.target.value))}
                className={`w-full bg-slate-50 dark:bg-slate-900 border rounded px-2 py-1 text-xs font-mono mb-1 ${
                  lockedParams.fc_v_Hz
                    ? 'border-amber-500/50'
                    : isAutoUpdated('fc_v_Hz')
                    ? 'border-emerald-500/70'
                    : 'border-slate-300 dark:border-slate-700'
                }`}
              />
              <input
                type="range"
                min={5}
                max={40}
                step={1}
                value={state.fc_v_Hz}
                onChange={(e) => update('fc_v_Hz', Number(e.target.value))}
                className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
              />
            </div>
            <div>
              <div className="flex justify-between items-center gap-1 text-[10px] text-slate-500 mb-0.5">
                <span className="truncate">fs_ctrl (kHz)</span>
                <LockToggleButton
                  locked={lockedParams.fs_ctrl_kHz}
                  recentlyAutoUpdated={isAutoUpdated('fs_ctrl_kHz')}
                  onToggle={() => toggleLock('fs_ctrl_kHz')}
                  label="ADC fs_ctrl"
                />
              </div>
              <input
                type="number"
                value={state.fs_ctrl_kHz}
                onChange={(e) => update('fs_ctrl_kHz', Number(e.target.value))}
                className={`w-full bg-slate-50 dark:bg-slate-900 border rounded px-2 py-1 text-xs font-mono mb-1 ${
                  lockedParams.fs_ctrl_kHz
                    ? 'border-amber-500/50'
                    : isAutoUpdated('fs_ctrl_kHz')
                    ? 'border-emerald-500/70'
                    : 'border-slate-300 dark:border-slate-700'
                }`}
              />
              <input
                type="range"
                min={25}
                max={200}
                step={5}
                value={state.fs_ctrl_kHz}
                onChange={(e) => update('fs_ctrl_kHz', Number(e.target.value))}
                className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
              />
            </div>
            <div className="col-span-2">
              <div className="flex justify-between items-center gap-1 text-[10px] text-slate-500 mb-0.5">
                <span className="truncate">Outer Voltage PM_v (°): {state.pm_v_deg}°</span>
                <LockToggleButton
                  compact
                  locked={lockedParams.pm_v_deg}
                  recentlyAutoUpdated={isAutoUpdated('pm_v_deg')}
                  onToggle={() => toggleLock('pm_v_deg')}
                  label="PM_v"
                />
              </div>
              <input
                type="range"
                min={35}
                max={80}
                step={1}
                value={state.pm_v_deg}
                onChange={(e) => update('pm_v_deg', Number(e.target.value))}
                className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
              />
            </div>
          </div>

          {state.controlType === 'mpc' && (
            <div>
              <label className="block text-[10px] text-amber-500 mb-0.5">
                MPC Inductance Mismatch ΔL/L (%): {state.mpcL_mismatch_pct}%
              </label>
              <input
                type="range"
                min={-30}
                max={30}
                step={5}
                value={state.mpcL_mismatch_pct}
                onChange={(e) => update('mpcL_mismatch_pct', Number(e.target.value))}
                className="w-full accent-cyan-500"
              />
            </div>
          )}
        </div>
      </ResizableSidebarWindow>

      {/* ===================================================================== */}
      {/* MAIN CONTENT AREA: KPI STRIP + 9 SUB-TABS                              */}
      {/* ===================================================================== */}
      <div className="flex-1 min-w-0 w-full space-y-4">
        {/* Top KPI Telemetry Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
          <div className="bg-white dark:bg-[#0E131D] border border-slate-200 dark:border-slate-800 rounded-lg p-3">
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Iin,rms / Phase</div>
            <div className="text-xl font-mono font-semibold text-slate-900 dark:text-slate-100 mt-0.5 tabular-nums">
              {res.Iin_rms_A.toFixed(1)} / {res.Iph_rms_A.toFixed(1)} A
            </div>
            <div className="text-[11px] font-mono tabular-nums text-cyan-600 dark:text-cyan-400 mt-0.5">
              {res.nPhases}-Ph ({res.nPhases === 2 ? '180° Shift' : 'Single'})
            </div>
          </div>

          <div className="bg-white dark:bg-[#0E131D] border border-slate-200 dark:border-slate-800 rounded-lg p-3">
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Net Input Ripple</div>
            <div className="text-xl font-mono font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5 tabular-nums">
              {res.deltaIin_net_max_A.toFixed(2)} App
            </div>
            <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 mt-0.5">
              1-Ph: {res.deltaIL_ph_max_A.toFixed(2)} A (-{res.rippleCancelMax_pct.toFixed(0)}%)
            </div>
          </div>

          <div className="bg-white dark:bg-[#0E131D] border border-slate-200 dark:border-slate-800 rounded-lg p-3">
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Hold-Up / ΔV_2f</div>
            <div className="text-xl font-mono font-semibold text-slate-900 dark:text-slate-100 mt-0.5 tabular-nums">
              {res.tHold_actual_ms.toFixed(1)} ms
            </div>
            <div className="text-[11px] font-mono tabular-nums text-amber-600 dark:text-amber-400 mt-0.5">
              ΔV2f = {res.Vdc_ripple_pp_V.toFixed(1)} Vpp
            </div>
          </div>

          <div className="bg-white dark:bg-[#0E131D] border border-slate-200 dark:border-slate-800 rounded-lg p-3">
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Power Factor / THDi</div>
            <div className="text-xl font-mono font-semibold text-cyan-600 dark:text-cyan-400 mt-0.5 tabular-nums">
              {res.powerFactor_true.toFixed(4)}
            </div>
            <div className="text-[11px] font-mono tabular-nums text-emerald-600 dark:text-emerald-400 mt-0.5">
              THDi = {res.THD_est_pct.toFixed(2)}% (Pass)
            </div>
          </div>

          <button
            type="button"
            onClick={() => setActiveSubTab('magnetics')}
            title="Inspect Boost Inductor Magnetics & Saturation Check"
            className={`text-left rounded-lg p-3 border cursor-pointer transition-colors ${
              res.saturationCheck.status === 'critical'
                ? 'bg-rose-50 dark:bg-rose-950/30 border-rose-500/70'
                : res.saturationCheck.status === 'warning'
                ? 'bg-amber-50 dark:bg-amber-950/25 border-amber-500/60'
                : 'bg-white dark:bg-[#0E131D] border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
            }`}
          >
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 flex items-center justify-between gap-1">
              <span>Inductor Roll-Off</span>
              {res.saturationCheck.status !== 'ok' && (
                <span
                  className={`text-[10px] font-semibold ${
                    res.saturationCheck.status === 'critical' ? 'text-rose-600 dark:text-rose-400' : 'text-amber-600 dark:text-amber-400'
                  }`}
                >
                  {res.saturationCheck.status === 'critical' ? 'Saturated' : 'High Bpk'}
                </span>
              )}
            </div>
            <div
              className={`text-xl font-mono font-semibold mt-0.5 tabular-nums ${
                res.saturationCheck.status === 'critical'
                  ? 'text-rose-600 dark:text-rose-400'
                  : 'text-amber-600 dark:text-amber-400'
              }`}
            >
              {res.L_at_peak_koolMu_uH.toFixed(0)} µH @ Ipk
            </div>
            <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 mt-0.5">
              Bpk = {res.Bpk_total_T.toFixed(2)} T ({res.N_pfc_turns}T · Lim {res.saturationCheck.Bsat_koolMu_T.toFixed(2)}T)
            </div>
          </button>

          <div className="bg-white dark:bg-[#0E131D] border border-slate-200 dark:border-slate-800 rounded-lg p-3">
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Efficiency / Losses</div>
            <div className="text-xl font-mono font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5 tabular-nums">
              {res.efficiency_pct.toFixed(2)}%
            </div>
            <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 mt-0.5">
              P_loss = {res.Ptotal_loss_W.toFixed(1)} W · Tj={res.Tj_fast_C.toFixed(0)}°C
            </div>
          </div>
        </div>

        {/* Sub-Tab Navigation */}
        <div
          ref={subTabNavRef}
          className="scroll-mt-20 flex flex-wrap items-center gap-1.5 border-b border-slate-200 dark:border-slate-800 pb-2.5"
        >
          {(
            [
              { id: 'schematic', label: 'Schematic & Variants', icon: <Zap className="w-3.5 h-3.5" /> },
              { id: 'graphs', label: 'Ripple, Hold-Up & Bode', icon: <Activity className="w-3.5 h-3.5" /> },
              { id: 'control', label: 'Control & DSP', icon: <Cpu className="w-3.5 h-3.5" /> },
              { id: 'harmonics', label: 'Harmonics & ZCD', icon: <BarChart3 className="w-3.5 h-3.5" /> },
              { id: 'all-inductors', label: 'All Inductors', icon: <Magnet className="w-3.5 h-3.5" /> },
              { id: 'dc-link', label: 'All Capacitors & Life', icon: <BatteryCharging className="w-3.5 h-3.5" /> },
              { id: 'magnetics', label: 'PFC DC-Bias Curves', icon: <Magnet className="w-3.5 h-3.5" />, alert: res.saturationCheck.status === 'critical' },
              { id: 'inrush', label: 'Inrush & Pre-Charge', icon: <ShieldAlert className="w-3.5 h-3.5" /> },
              { id: 'emi', label: 'EMI & Earth Leakage', icon: <Radio className="w-3.5 h-3.5" /> },
              { id: 'efficiency', label: 'Efficiency & Thermal', icon: <Flame className="w-3.5 h-3.5" /> },
            ] as { id: AcDcSubTab; label: string; icon: React.ReactNode; alert?: boolean }[]
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveSubTab(tab.id)}
              className={`px-3 py-1.5 rounded-md border text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                activeSubTab === tab.id
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

        {/* =================================================================== */}
        {/* SUB-TAB 1: DYNAMIC SCHEMATIC, VARIANT MATRIX & EQUATIONS            */}
        {/* =================================================================== */}
        {activeSubTab === 'schematic' && (
          <div className="space-y-4">
            <AcDcSchematicView res={res} onTopologyChange={(topo) => update('topology', topo)} />

            {/* Topological Variant Comparison Matrix */}
            <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
              <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 flex items-center justify-between">
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-600 dark:text-cyan-400">
                  AC-DC PFC TOPOLOGY ARCHITECTURE COMPARISON (CLICK ANY ROW TO SWITCH SCHEMATIC)
                </span>
                <span className="text-[11px] font-mono text-slate-500">
                  Active: {state.topology}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs font-mono">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 bg-slate-50/40 dark:bg-slate-900/30">
                      <th className="py-2 px-3">Topology Variant</th>
                      <th className="py-2 px-3">Input Rectification</th>
                      <th className="py-2 px-3">HF Switching Cells</th>
                      <th className="py-2 px-3">Conduction Path Drops</th>
                      <th className="py-2 px-3">Peak Efficiency</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800/70">
                    {(
                      [
                        {
                          id: '2ph-interleaved-totem',
                          name: '2-Ph Interleaved Totem-Pole',
                          rect: 'Bridgeless Sync Leg (S1, S2 @ 50/60Hz)',
                          cells: '2x SiC/GaN Half-Bridges (Q1–Q4, 0°/180°)',
                          drop: '0.5× Rds(on,fast) + 1× Rds(on,sync) (Zero Diode Drop)',
                          eff: '98.8% – 99.2%',
                        },
                        {
                          id: '1ph-totem-pfc',
                          name: '1-Phase Bridgeless Totem-Pole',
                          rect: 'Bridgeless Sync Leg (S1, S2 @ 50/60Hz)',
                          cells: '1x SiC/GaN Half-Bridge (Q1, Q2)',
                          drop: '1× Rds(on,fast) + 1× Rds(on,sync) (Zero Diode Drop)',
                          eff: '98.5% – 99.0%',
                        },
                        {
                          id: '2ph-interleaved-boost',
                          name: '2-Ph Interleaved Diode-Bridge Boost',
                          rect: 'Full-Wave Diode Bridge (DB1–DB4)',
                          cells: '2x Boost FETs (Q1, Q2) + 2x SiC Diodes (D1, D2)',
                          drop: '2× Vf(bridge) + 1× Rds(on)/Vf(SiC) (Higher Low-Line Loss)',
                          eff: '97.4% – 98.1%',
                        },
                        {
                          id: 'dual-boost-bridgeless',
                          name: 'Dual-Boost Semi-Bridgeless PFC',
                          rect: '2x Slow Return Diodes (DR1, DR2 to GND)',
                          cells: 'Pos Cell (L1/Q1/D1) + Neg Cell (L2/Q2/D2)',
                          drop: '1× Vf(return) + 1× Rds(on)/Vf(SiC) (Low CM Noise)',
                          eff: '98.0% – 98.5%',
                        },
                      ] as const
                    ).map((row) => {
                      const active = state.topology === row.id;
                      return (
                        <tr
                          key={row.id}
                          onClick={() => update('topology', row.id)}
                          className={`cursor-pointer transition-colors ${
                            active
                              ? 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-300 font-semibold'
                              : 'hover:bg-slate-50 dark:hover:bg-slate-900/40'
                          }`}
                        >
                          <td className="py-2.5 px-3">{row.name}</td>
                          <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">{row.rect}</td>
                          <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">{row.cells}</td>
                          <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">{row.drop}</td>
                          <td className="py-2.5 px-3 text-emerald-600 dark:text-emerald-400 font-bold">
                            {row.eff}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Governing Design Equations */}
            <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
              <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 flex items-center justify-between">
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-600 dark:text-cyan-400">
                  GOVERNING AC-DC PFC DESIGN EQUATIONS (KaTeX) &amp; VERIFICATION
                </span>
                <span className="text-[11px] font-mono text-slate-500">
                  Exact Analytical Typesetting
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs font-mono">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 bg-slate-50/40 dark:bg-slate-900/30">
                      <th className="py-2.5 px-3">Parameter &amp; Symbol</th>
                      <th className="py-2.5 px-3">Analytical Formula (KaTeX)</th>
                      <th className="py-2.5 px-3">Computed Operating Point</th>
                      <th className="py-2.5 px-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800/70">
                    {res.equations.map((eq, i) => (
                      <tr key={i} className="hover:bg-slate-50/60 dark:hover:bg-slate-900/30">
                        <td className="py-3 px-3 align-middle">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-cyan-600 dark:text-cyan-400 font-semibold text-sm">
                              <MathFormula tex={eq.symbolTex || eq.symbol} />
                            </span>
                            <span className="text-[11px] text-slate-600 dark:text-slate-400 font-sans font-medium">
                              {eq.name}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-3 text-slate-900 dark:text-slate-100 text-sm align-middle">
                          <div className="py-1 px-2.5 rounded bg-slate-50/80 dark:bg-slate-900/70 border border-slate-200/70 dark:border-slate-800/80 inline-block">
                            <MathFormula tex={eq.formulaTex || eq.formula} />
                          </div>
                        </td>
                        <td className="py-3 px-3 text-emerald-600 dark:text-emerald-400 font-semibold align-middle">
                          {eq.value}
                        </td>
                        <td className="py-3 px-3 align-middle">
                          {eq.status === 'ok' ? (
                            <span className="inline-flex items-center gap-1 text-emerald-500">
                              <CheckCircle2 className="w-3.5 h-3.5" /> PASS
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-amber-500">
                              <AlertTriangle className="w-3.5 h-3.5" /> CHECK
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* SUB-TAB 2: RIPPLE CANCELLATION, HOLD-UP & BODE PLOTS                */}
        {/* =================================================================== */}
        {activeSubTab === 'graphs' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <InteractiveChart
              title="1. Line-Angle Inductor vs. Net Input Ripple Cancellation"
              subtitle={`Zero-ripple cancellation at D=0.5 (θ = ${res.theta_zeroRipple1_deg.toFixed(1)}° & ${(
                180 - res.theta_zeroRipple1_deg
              ).toFixed(1)}°)`}
              data={res.rippleCurve}
              refData={pinnedRes?.rippleCurve ?? null}
              xKey="theta_deg"
              xLabel="θ"
              xUnit="°"
              domainEvaluator={res.evaluators.evalRipple}
              currentX={Math.round(res.theta_zeroRipple1_deg)}
              currentXLabel="D=0.5 Null"
              series={[
                {
                  key: 'deltaIL_ph_A',
                  name: 'Single-Phase ΔIL1',
                  unit: 'App',
                  color: '#38bdf8',
                },
                {
                  key: 'deltaIin_net_A',
                  name: 'Net Interleaved ΔIin',
                  unit: 'App',
                  color: '#10b981',
                },
              ]}
            />

            <InteractiveChart
              title="2. DC-Link Hold-Up Time & 2·f_line Voltage Ripple vs. Cdc"
              subtitle={`Selected Cdc = ${state.Cdc_uF} µF → t_hold = ${res.tHold_actual_ms.toFixed(
                1
              )} ms, ΔV_2f = ${res.Vdc_ripple_pp_V.toFixed(1)} Vpp`}
              data={res.holdUpCurve}
              refData={pinnedRes?.holdUpCurve ?? null}
              xKey="Cdc_uF"
              xLabel="Cdc"
              xUnit="µF"
              domainEvaluator={res.evaluators.evalHoldUp}
              currentX={state.Cdc_uF}
              currentXLabel="Selected Cdc"
              series={[
                {
                  key: 'tHold_ms',
                  name: 'Hold-Up Time',
                  unit: 'ms',
                  color: '#10b981',
                  axis: 'left',
                },
                {
                  key: 'Vripple_pp_V',
                  name: '100/120Hz Bus Ripple',
                  unit: 'Vpp',
                  color: '#f59e0b',
                  axis: 'right',
                },
              ]}
            />

            <InteractiveChart
              title={`3. Inner Current Loop Bode Plot (${state.controlType.toUpperCase()})`}
              subtitle={`Crossover fc,i = ${res.fc_i_actual_kHz.toFixed(2)} kHz · Phase Margin PM = ${res.pm_i_actual_deg.toFixed(
                1
              )}°`}
              data={res.bodeInner}
              refData={pinnedRes?.bodeInner ?? null}
              xKey="freq_Hz"
              xLabel="f"
              xUnit="Hz"
              logX
              domainEvaluator={res.evaluators.evalBodeInner}
              horizontalMarkers={[{ value: 0, label: '0 dB', color: '#64748b', axis: 'left', dashed: true }]}
              series={[
                {
                  key: 'mag_dB',
                  name: '|Ti(jω)| Gain',
                  unit: 'dB',
                  color: '#06b6d4',
                  axis: 'left',
                },
                {
                  key: 'phase_deg',
                  name: '∠Ti(jω) Phase',
                  unit: '°',
                  color: '#a855f7',
                  axis: 'right',
                },
              ]}
            />

            <InteractiveChart
              title="4. Outer DC-Bus Voltage Loop Bode Plot (Low-THD 2f Attenuation)"
              subtitle={`Crossover fc,v = ${res.fc_v_actual_Hz.toFixed(1)} Hz · Phase Margin PM = ${res.pm_v_actual_deg.toFixed(
                1
              )}°`}
              data={res.bodeOuter}
              refData={pinnedRes?.bodeOuter ?? null}
              xKey="freq_Hz"
              xLabel="f"
              xUnit="Hz"
              logX
              domainEvaluator={res.evaluators.evalBodeOuter}
              horizontalMarkers={[{ value: 0, label: '0 dB', color: '#64748b', axis: 'left', dashed: true }]}
              series={[
                {
                  key: 'mag_dB',
                  name: '|Tv(jω)| Gain',
                  unit: 'dB',
                  color: '#10b981',
                  axis: 'left',
                },
                {
                  key: 'phase_deg',
                  name: '∠Tv(jω) Phase',
                  unit: '°',
                  color: '#f59e0b',
                  axis: 'right',
                },
              ]}
            />
          </div>
        )}

        {/* =================================================================== */}
        {/* SUB-TAB 3: CONTROL SYNTHESIS & DSP C-CODE                           */}
        {/* =================================================================== */}
        {activeSubTab === 'control' && (
          <div className="space-y-4">
            <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-3">
              <div className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-600 dark:text-cyan-400">
                EXACT MATHEMATICAL DERIVATION: CASCADED INNER CURRENT & OUTER VOLTAGE LOOP
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <div className="p-3 rounded bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800">
                  <div className="text-[11px] font-mono font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    1. Boost PFC Small-Signal Inductor Current Plant & Type-II Compensator
                  </div>
                  <MathFormula
                    displayMode
                    tex={String.raw`G_{id}(s) = \frac{\hat{i}_L(s)}{\hat{d}(s)} = \frac{V_{dc}}{s \cdot L_{pfc} + R_L}, \qquad C_i(s) = \frac{K_{i,i}}{s} \cdot \frac{1 + s/\omega_{z,i}}{1 + s/\omega_{p,i}}`}
                  />
                </div>
                <div className="p-3 rounded bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800">
                  <div className="text-[11px] font-mono font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    2. Pre-Warped Bilinear (Tustin) 2P2Z Discretization at ω_c,i
                  </div>
                  <MathFormula
                    displayMode
                    tex={String.raw`H_i(z) = \frac{U(z)}{E(z)} = \frac{b_0 + b_1 z^{-1} + b_2 z^{-2}}{1 - a_1 z^{-1} - a_2 z^{-2}}, \qquad a_1 + a_2 = 1.00000`}
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Synthesized Compensator Coefficients */}
              <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-3">
                <div className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-600 dark:text-cyan-400">
                  SYNTHESIZED COMPENSATOR GAINS ({state.controlType.toUpperCase()})
                </div>
                <div className="grid grid-cols-2 gap-2.5 text-xs font-mono">
                  <div className="p-2.5 bg-slate-50 dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-800">
                    <div className="text-slate-500 text-[10px]">Inner Proportional Kp,i</div>
                    <div className="text-sm font-bold text-cyan-600 dark:text-cyan-400 mt-0.5 tabular-nums">
                      {res.Kp_i.toFixed(5)} V/A
                    </div>
                  </div>
                  <div className="p-2.5 bg-slate-50 dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-800">
                    <div className="text-slate-500 text-[10px]">Inner Integral Ki,i</div>
                    <div className="text-sm font-bold text-cyan-600 dark:text-cyan-400 mt-0.5 tabular-nums">
                      {res.Ki_i.toFixed(1)} rad/s
                    </div>
                  </div>
                  <div className="p-2.5 bg-slate-50 dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-800">
                    <div className="text-slate-500 text-[10px]">Compensator Zero / Pole</div>
                    <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400 mt-0.5 tabular-nums">
                      fz={res.fz_i_kHz.toFixed(2)}kHz / fp={res.fp_i_kHz.toFixed(1)}kHz
                    </div>
                  </div>
                  <div className="p-2.5 bg-slate-50 dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-800">
                    <div className="text-slate-500 text-[10px]">Outer Voltage Loop Kp,v / Ki,v</div>
                    <div className="text-sm font-bold text-amber-600 dark:text-amber-400 mt-0.5 tabular-nums">
                      {res.Kp_v.toFixed(4)} / {res.Ki_v.toFixed(2)}
                    </div>
                  </div>
                </div>

                <div className="p-3 bg-slate-900 text-slate-200 rounded font-mono text-xs space-y-1">
                  <div className="text-cyan-400 font-bold text-[11px]">
                    Pre-Warped Tustin 2P2Z Coefficients (fs = {state.fs_ctrl_kHz} kHz):
                  </div>
                  <div>
                    b0 = {res.b0_i.toFixed(6)} | b1 = {res.b1_i.toFixed(6)} | b2 = {res.b2_i.toFixed(6)}
                  </div>
                  <div>
                    a1 = {res.a1_i.toFixed(6)} | a2 = {res.a2_i.toFixed(6)} | Sum(a1+a2) ={' '}
                    {(res.a1_i + res.a2_i).toFixed(5)}
                  </div>
                </div>
              </div>

              {/* Embedded C2000 / STM32G4 Interrupt Code */}
              <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg p-4 flex flex-col justify-between">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-600 dark:text-cyan-400">
                    AUTO-GENERATED C2000 / STM32G4 ISR CODE
                  </span>
                  <button
                    type="button"
                    onClick={copyDspCode}
                    className="px-2.5 py-1 text-xs font-mono bg-cyan-600 text-white rounded hover:bg-cyan-500 inline-flex items-center gap-1 cursor-pointer"
                  >
                    {copiedCode ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedCode ? 'Copied' : 'Copy C Code'}
                  </button>
                </div>
                <pre className="p-3 bg-slate-950 text-emerald-400 rounded text-[11px] font-mono overflow-x-auto leading-relaxed">
                  {res.dspCode}
                </pre>
              </div>
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* SUB-TAB 4: GRID HARMONICS (IEC 61000-3-2) & ZERO-CROSSING (ZCD)     */}
        {/* =================================================================== */}
        {activeSubTab === 'harmonics' && (
          <div className="space-y-4">
            {/* Top Summary Banner */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg p-3.5">
                <div className="text-[10px] font-mono uppercase text-slate-500">True Power Factor (PF)</div>
                <div className="text-lg font-mono font-bold text-cyan-600 dark:text-cyan-400 mt-1 tabular-nums">
                  {res.powerFactor_true.toFixed(4)}
                </div>
                <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                  DPF = {res.displacementPF.toFixed(4)} · K_THD = {res.distortionPF.toFixed(4)}
                </div>
              </div>
              <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg p-3.5">
                <div className="text-[10px] font-mono uppercase text-slate-500">Total Harmonic Distortion</div>
                <div className="text-lg font-mono font-bold text-emerald-600 dark:text-emerald-400 mt-1 tabular-nums">
                  {res.THD_est_pct.toFixed(2)}%
                </div>
                <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                  IEEE 519 / IEC Limit &lt; 5.0%
                </div>
              </div>
              <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg p-3.5">
                <div className="text-[10px] font-mono uppercase text-slate-500">Dominant 3rd Harmonic (I3)</div>
                <div className="text-lg font-mono font-bold text-amber-600 dark:text-amber-400 mt-1 tabular-nums">
                  {res.harmonicSpectrum[0].In_rms_A.toFixed(2)} A ({res.harmonicSpectrum[0].In_pct.toFixed(2)}%)
                </div>
                <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                  Limit: {res.harmonicSpectrum[0].iecLimit_A.toFixed(2)} A (fc,v = {state.fc_v_Hz} Hz)
                </div>
              </div>
              <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg p-3.5">
                <div className="text-[10px] font-mono uppercase text-slate-500">Zero-Crossing Dead-Time Spike</div>
                <div className="text-lg font-mono font-bold text-rose-500 mt-1 tabular-nums">
                  ±{customZcdSpike_A.toFixed(2)} A
                </div>
                <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                  t_dead = {customDeadTime_ns} ns → Mitigated by Soft-PWM
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Odd Harmonics Spectrum vs IEC 61000-3-2 / 3-12 */}
              <InteractiveChart
                title="1. Odd Harmonic Spectrum (I3 – I39) vs. IEC 61000-3-2 / 3-12 Limits"
                subtitle={`Lowering outer voltage loop fc,v (${state.fc_v_Hz} Hz) directly reduces 3rd harmonic injection`}
                data={res.harmonicSpectrum}
                xKey="order"
                xLabel="Harmonic Order n"
                xUnit=""
                currentX={3}
                currentXLabel={`I3=${res.harmonicSpectrum[0].In_rms_A.toFixed(2)}A`}
                series={[
                  {
                    key: 'In_rms_A',
                    name: 'Harmonic Current In',
                    unit: 'Arms',
                    color: '#06b6d4',
                    axis: 'left',
                  },
                  {
                    key: 'iecLimit_A',
                    name: 'IEC 61000-3-2/12 Limit',
                    unit: 'Arms',
                    color: '#f59e0b',
                    axis: 'left',
                    dashed: true,
                  },
                  {
                    key: 'In_pct',
                    name: 'Harmonic Distortion (% I1)',
                    unit: '%',
                    color: '#a855f7',
                    axis: 'right',
                    dashed: true,
                  },
                ]}
              />

              {/* Zero-Crossing Distortion & Soft-Start Blanking Waveform */}
              <div className="space-y-2">
                <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg px-3.5 py-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-mono text-slate-500">
                      Polarity-Swap Dead-Time t_dead:
                    </span>
                    <LockToggleButton
                      compact
                      locked={lockedParams.deadTime_zcd_ns}
                      recentlyAutoUpdated={isAutoUpdated('deadTime_zcd_ns')}
                      onToggle={() => toggleLock('deadTime_zcd_ns')}
                      label="ZCD Dead-Time"
                    />
                  </div>
                  <div className="flex items-center gap-2 w-48">
                    <input
                      type="range"
                      min={50}
                      max={400}
                      step={10}
                      value={customDeadTime_ns}
                      onChange={(e) => update('deadTime_zcd_ns', Number(e.target.value))}
                      className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                    />
                    <span className="text-xs font-mono text-cyan-500 font-bold w-14 text-right tabular-nums">
                      {customDeadTime_ns} ns
                    </span>
                  </div>
                </div>
                <InteractiveChart
                  title="2. Totem-Pole Zero-Crossing Distortion & Soft-Start Mitigation"
                  subtitle={`Current cusp & polarity-reversal spike (±${customZcdSpike_A.toFixed(2)} A) around θ = 0°`}
                  data={res.zeroCrossingCurve}
                  xKey="theta_deg"
                  xLabel="θ"
                  xUnit="°"
                  currentX={0}
                  currentXLabel="Zero Crossing (0°)"
                  series={[
                    {
                      key: 'i_softStart_A',
                      name: 'With SOGI-PLL + Soft Duty Ramp',
                      unit: 'A',
                      color: '#10b981',
                      axis: 'left',
                    },
                    {
                      key: 'i_unmitigated_A',
                      name: 'Unmitigated Hard Polarity Swap',
                      unit: 'A',
                      color: '#f43f5e',
                      axis: 'left',
                    },
                    {
                      key: 'i_ideal_A',
                      name: 'Ideal Reference I_ref',
                      unit: 'A',
                      color: '#94a3b8',
                      axis: 'left',
                      dashed: true,
                    },
                  ]}
                />
              </div>
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* SUB-TAB 5: BOOST INDUCTOR MAGNETICS & POWDER/FERRITE DC-BIAS        */}
        {/* =================================================================== */}
        {activeSubTab === 'magnetics' && (
          <div className="space-y-4">
            {/* Boost Inductor Saturation Check Alert */}
            <div
              role={res.saturationCheck.status === 'ok' ? 'status' : 'alert'}
              className={`rounded-lg px-4 py-3 border flex flex-wrap items-center justify-between gap-3 text-xs font-mono ${
                res.saturationCheck.status === 'critical'
                  ? 'border-2 border-rose-500 bg-rose-50 dark:bg-rose-950/35 text-rose-700 dark:text-rose-200'
                  : res.saturationCheck.status === 'warning'
                  ? 'border-2 border-amber-500 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-200'
                  : 'border border-emerald-500/30 bg-emerald-500/5 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-300'
              }`}
            >
              <div className="flex items-start gap-2.5">
                {res.saturationCheck.status === 'ok' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle
                    className={`w-4 h-4 shrink-0 mt-0.5 ${
                      res.saturationCheck.status === 'critical' ? 'text-rose-500' : 'text-amber-500'
                    }`}
                  />
                )}
                <div>
                  <div className="font-bold uppercase tracking-wide">
                    {res.saturationCheck.headline}
                  </div>
                  <div className="text-[11px] text-slate-700 dark:text-slate-300 mt-0.5">
                    {res.saturationCheck.detail}
                  </div>
                </div>
              </div>
              <div className="text-[11px] font-bold shrink-0 px-2.5 py-1 rounded bg-white/80 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-700">
                {res.saturationCheck.utilization_koolMu_pct.toFixed(1)}% of Kool Mµ 1.05T
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg p-3.5">
                <div className="text-[10px] font-mono uppercase text-slate-500">Turns / Magnetizing Force</div>
                <div className="text-lg font-mono font-bold text-cyan-600 dark:text-cyan-400 mt-1 tabular-nums">
                  N = {res.N_pfc_turns} Turns
                </div>
                <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                  H_pk = {res.Hdc_pk_Oe.toFixed(1)} Oe @ Low-Line Peak
                </div>
              </div>
              <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg p-3.5">
                <div className="text-[10px] font-mono uppercase text-slate-500">Kool Mµ / Sendust L @ Ipk</div>
                <div className="text-lg font-mono font-bold text-amber-600 dark:text-amber-400 mt-1 tabular-nums">
                  {res.L_at_peak_koolMu_uH.toFixed(1)} µH (-{res.inductanceRollOff_pct.toFixed(1)}%)
                </div>
                <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                  High-Flux 60µ: {res.L_at_peak_highFlux_uH.toFixed(1)} µH
                </div>
              </div>
              <div
                className={`rounded-lg p-3.5 border ${
                  res.saturationCheck.status === 'critical'
                    ? 'bg-rose-50 dark:bg-rose-950/35 border-rose-500'
                    : res.saturationCheck.status === 'warning'
                    ? 'bg-amber-50 dark:bg-amber-950/25 border-amber-500/70'
                    : 'bg-white dark:bg-[#111827] border-slate-200 dark:border-slate-800'
                }`}
              >
                <div className="text-[10px] font-mono uppercase text-slate-500">Peak Flux Density B_pk</div>
                <div
                  className={`text-lg font-mono font-bold mt-1 tabular-nums ${
                    res.saturationCheck.status === 'critical'
                      ? 'text-rose-500'
                      : res.saturationCheck.status === 'warning'
                      ? 'text-amber-500'
                      : 'text-emerald-600 dark:text-emerald-400'
                  }`}
                >
                  {res.Bpk_total_T.toFixed(2)} T
                </div>
                <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                  Bdc={res.Bdc_pk_T.toFixed(2)}T + ΔB/2={(res.deltaB_max_T / 2).toFixed(2)}T (Bsat=1.05T)
                </div>
              </div>
              <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg p-3.5">
                <div className="text-[10px] font-mono uppercase text-slate-500">Inductor Loss & Temp</div>
                <div className="text-lg font-mono font-bold text-slate-900 dark:text-white mt-1 tabular-nums">
                  {res.Pind_total_W.toFixed(1)} W ({res.Tcore_pfc_C.toFixed(0)}°C)
                </div>
                <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                  Pcu = {res.Pind_cu_W.toFixed(1)}W · Pfe = {res.Pind_core_W.toFixed(1)}W
                </div>
              </div>
            </div>

            <InteractiveChart
              title="Boost Inductor DC-Bias Permeability Roll-Off: Kool Mµ (Sendust) vs. High-Flux vs. Gapped Ferrite"
              subtitle={`Powder cores exhibit soft inductance roll-off at peak AC line current (I_ph,pk = ${res.Iph_pk_A.toFixed(1)} A), whereas gapped ferrite saturates abruptly above 0.35 T`}
              data={res.dcBiasCurve}
              xKey="Idc_A"
              xLabel="I_dc"
              xUnit="A"
              currentX={Number(res.Iph_pk_A.toFixed(1))}
              currentXLabel={`Iph,pk (${res.Iph_pk_A.toFixed(1)}A)`}
              series={[
                {
                  key: 'L_highFlux_uH',
                  name: 'High-Flux 60µ Ni-Fe (Bsat=1.5T)',
                  unit: 'µH',
                  color: '#10b981',
                  axis: 'left',
                },
                {
                  key: 'L_koolMu_uH',
                  name: 'Kool Mµ / Sendust 60µ (Bsat=1.05T)',
                  unit: 'µH',
                  color: '#06b6d4',
                  axis: 'left',
                },
                {
                  key: 'L_ferrite_uH',
                  name: 'Gapped Ferrite N87/N97 (Hard Cliff >0.35T)',
                  unit: 'µH',
                  color: '#f43f5e',
                  axis: 'left',
                  dashed: true,
                },
                {
                  key: 'mu_koolMu_pct',
                  name: 'Kool Mµ Initial µ Retention',
                  unit: '%',
                  color: '#f59e0b',
                  axis: 'right',
                  dashed: true,
                },
              ]}
            />
          </div>
        )}

        {/* =================================================================== */}
        {/* SUB-TAB 6: INRUSH CURRENT, NTC/PTC PRE-CHARGE & RELAY BYPASS        */}
        {/* =================================================================== */}
        {activeSubTab === 'inrush' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg p-3.5">
                <div className="text-[10px] font-mono uppercase text-slate-500">Unmitigated Peak Inrush</div>
                <div className="text-lg font-mono font-bold text-rose-500 mt-1 tabular-nums">
                  {res.Iinrush_unmitigated_pk_A.toFixed(0)} Apk
                </div>
                <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                  At 90° Line Peak ({customVpk_max_V.toFixed(0)} Vpk)
                </div>
              </div>
              <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg p-3.5">
                <div className="text-[10px] font-mono uppercase text-slate-500">Pre-Charged Peak Current</div>
                <div className="text-lg font-mono font-bold text-emerald-600 dark:text-emerald-400 mt-1 tabular-nums">
                  {customIinrush_pk_A.toFixed(1)} Apk
                </div>
                <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                  With R_pre = {customPrechargeR_Ohm} Ω NTC/Wirewound
                </div>
              </div>
              <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg p-3.5">
                <div className="text-[10px] font-mono uppercase text-slate-500">Pre-Charge Pulse Energy & I²t</div>
                <div className="text-lg font-mono font-bold text-amber-600 dark:text-amber-400 mt-1 tabular-nums">
                  {res.inrushEnergy_J.toFixed(1)} J / {customI2t_A2s.toFixed(1)} A²s
                </div>
                <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                  E = ½·Cdc·Vpk² ({state.Cdc_uF} µF)
                </div>
              </div>
              <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg p-3.5">
                <div className="text-[10px] font-mono uppercase text-slate-500">Relay K_BYPASS Pull-In Time</div>
                <div className="text-lg font-mono font-bold text-cyan-600 dark:text-cyan-400 mt-1 tabular-nums">
                  {customRelayTime_ms.toFixed(1)} ms
                </div>
                <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                  4.2·τ (98.5% Vpk Charged before PWM start)
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
                <div className="text-[11px] font-mono text-slate-500">
                  Pre-Charge Resistance R_NTC: Peak Surge {customIinrush_pk_A.toFixed(1)} A · Relay Pull-In {customRelayTime_ms.toFixed(1)} ms
                </div>
                <div className="flex items-center gap-2 w-60">
                  <LockToggleButton
                    compact
                    locked={lockedParams.prechargeR_Ohm}
                    recentlyAutoUpdated={isAutoUpdated('prechargeR_Ohm')}
                    onToggle={() => toggleLock('prechargeR_Ohm')}
                    label="Pre-charge R"
                  />
                  <span className="text-[10px] font-mono text-slate-500">R_NTC:</span>
                  <input
                    type="range"
                    min={5}
                    max={47}
                    step={1}
                    value={customPrechargeR_Ohm}
                    onChange={(e) => update('prechargeR_Ohm', Number(e.target.value))}
                    className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                  />
                  <span className="text-xs font-mono text-cyan-500 font-bold w-12 text-right tabular-nums">
                    {customPrechargeR_Ohm} Ω
                  </span>
                </div>
              </div>

              <InteractiveChart
                title="DC-Link Pre-Charge Transient Waveform & Relay Bypass Timing"
                subtitle={`R_pre = ${customPrechargeR_Ohm} Ω · Peak Surge = ${customIinrush_pk_A.toFixed(1)} Apk · Relay K_BYPASS Pull-In = ${customRelayTime_ms.toFixed(1)} ms`}
                data={res.inrushCurve}
                xKey="time_ms"
                xLabel="t"
                xUnit="ms"
                currentX={Number(customRelayTime_ms.toFixed(1))}
                currentXLabel={`Relay Pull-In (${customRelayTime_ms.toFixed(1)}ms)`}
                series={[
                  {
                    key: 'Vdc_precharge_V',
                    name: 'DC Bus Pre-Charge Voltage Vdc(t)',
                    unit: 'V',
                    color: '#10b981',
                    axis: 'left',
                  },
                  {
                    key: 'I_precharge_A',
                    name: 'Mitigated Pre-Charge Current I_inrush(t)',
                    unit: 'A',
                    color: '#f59e0b',
                    axis: 'right',
                  },
                ]}
              />
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* SUB-TAB 7: DC-LINK CAPACITOR DUAL-FREQUENCY STRESS & LIFETIME       */}
        {/* =================================================================== */}
        {activeSubTab === 'dc-link' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg p-3.5">
                <div className="text-[10px] font-mono uppercase text-slate-500">100/120Hz 2f_line Ripple</div>
                <div className="text-lg font-mono font-bold text-cyan-600 dark:text-cyan-400 mt-1 tabular-nums">
                  {res.ICdc_lf_rms_A.toFixed(2)} Arms
                </div>
                <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                  I_LF = I_dc / √2 (Single-Phase Pulsating Power)
                </div>
              </div>
              <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg p-3.5">
                <div className="text-[10px] font-mono uppercase text-slate-500">HF Switching Ripple</div>
                <div className="text-lg font-mono font-bold text-emerald-600 dark:text-emerald-400 mt-1 tabular-nums">
                  {res.ICdc_hf_rms_A.toFixed(2)} Arms
                </div>
                <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                  At {res.f_emi_fundamental_kHz} kHz ({res.nPhases}-Ph Cancellation)
                </div>
              </div>
              <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg p-3.5">
                <div className="text-[10px] font-mono uppercase text-slate-500">100Hz-Equivalent Stress</div>
                <div className="text-lg font-mono font-bold text-amber-600 dark:text-amber-400 mt-1 tabular-nums">
                  {res.ICdc_freq_weighted_100Hz_A.toFixed(2)} Arms
                </div>
                <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                  Total Unweighted: {res.ICdc_total_rms_A.toFixed(2)} Arms
                </div>
              </div>
              <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg p-3.5">
                <div className="text-[10px] font-mono uppercase text-slate-500">Arrhenius Expected Life</div>
                <div className="text-lg font-mono font-bold text-emerald-500 mt-1 tabular-nums">
                  {(customCapLife_hrs / 1000).toFixed(1)}k hrs ({(customCapLife_hrs / 8760).toFixed(1)} yrs)
                </div>
                <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                  Hotspot Th = {customCapHotspot_C.toFixed(1)}°C ({res.capBankParallelCount}x Parallel Caps)
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-mono font-bold uppercase text-cyan-600 dark:text-cyan-400">
                    DUAL-FREQUENCY CAPACITOR ELECTRO-THERMAL &amp; ARRHENIUS LIFETIME SYNTHESIS
                  </div>
                  <div className="text-[11px] font-mono text-slate-500">
                    In single-phase AC-DC PFC, bulk capacitors must simultaneously absorb 100/120 Hz double-line-frequency power pulsation and HF switching ripple
                  </div>
                </div>
                <div className="w-56">
                  <div className="flex justify-between items-center gap-1 text-[10px] font-mono text-slate-500 mb-0.5">
                    <span>Ambient Temp Ta:</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-cyan-500 font-bold tabular-nums">{capAmbient_C}°C</span>
                      <LockToggleButton
                        compact
                        locked={lockedParams.capAmbient_C}
                        recentlyAutoUpdated={isAutoUpdated('capAmbient_C')}
                        onToggle={() => toggleLock('capAmbient_C')}
                        label="Cap Ambient Ta"
                      />
                    </div>
                  </div>
                  <input
                    type="range"
                    min={25}
                    max={85}
                    step={5}
                    value={capAmbient_C}
                    onChange={(e) => update('capAmbient_C', Number(e.target.value))}
                    className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                  />
                </div>
              </div>
              <MathFormula
                displayMode
                tex={String.raw`I_{C,\text{eq}(100\text{Hz})} = \sqrt{I_{C,2f_{\text{line}}}^2 + \left(\frac{I_{C,\text{HF}}}{K_f(f_{\text{sw}})}\right)^2}, \qquad L_{\text{life}} = L_{0(105^\circ\text{C})} \cdot 2^{\frac{105^\circ\text{C} - (T_a + \Delta T_{\text{ESR}})}{10^\circ\text{C}}}`}
              />
            </div>

            <AllCapacitorsDesigner
              mode="acdc"
              acdcState={state}
              acdcRes={res}
              requestedItemId={jumpTargetId}
              jumpNonce={jumpNonce}
            />
          </div>
        )}

        {/* =================================================================== */}
        {/* SUB-TAB: ALL CIRCUIT INDUCTORS DESIGN STUDIO                        */}
        {/* =================================================================== */}
        {activeSubTab === 'all-inductors' && (
          <div className="space-y-4">
            <AllInductorsDesigner
              mode="acdc"
              acdcState={state}
              acdcRes={res}
              requestedItemId={jumpTargetId}
              jumpNonce={jumpNonce}
            />
          </div>
        )}

        {/* =================================================================== */}
        {/* SUB-TAB 8: AC-SIDE EMI FILTER, CISPR 32 & SAFETY EARTH LEAKAGE      */}
        {/* =================================================================== */}
        {activeSubTab === 'emi' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg p-3.5">
                <div className="text-[10px] font-mono uppercase text-slate-500">DM Filter (Cx / Ldm)</div>
                <div className="text-lg font-mono font-bold text-cyan-600 dark:text-cyan-400 mt-1 tabular-nums">
                  2× {res.Cx_each_uF}µF + {res.Ldm_uH.toFixed(0)}µH
                </div>
                <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                  fc,DM = {res.fc_dm_kHz.toFixed(1)} kHz (Att = {res.RequiredAtt_dB.toFixed(0)} dB)
                </div>
              </div>
              <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg p-3.5">
                <div className="text-[10px] font-mono uppercase text-slate-500">CM Choke & Y2 Caps</div>
                <div className="text-lg font-mono font-bold text-emerald-600 dark:text-emerald-400 mt-1 tabular-nums">
                  Lcm = {res.Lcm_mH.toFixed(1)} mH + 2× {customCy_nF}nF
                </div>
                <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                  Nanocrystalline / High-µ MnZn Toroid
                </div>
              </div>
              <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg p-3.5">
                <div className="text-[10px] font-mono uppercase text-slate-500">PE Earth Leakage Current</div>
                <div
                  className={`text-lg font-mono font-bold mt-1 tabular-nums ${
                    customEarthLeakage_mA <= 0.75
                      ? 'text-emerald-500'
                      : customEarthLeakage_mA <= 3.5
                      ? 'text-amber-500'
                      : 'text-rose-500'
                  }`}
                >
                  {customEarthLeakage_mA.toFixed(2)} mA
                </div>
                <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                  IEC 62368-1 Limit: &lt;0.75mA (Handheld) / &lt;3.5mA (Ind.)
                </div>
              </div>
              <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg p-3.5">
                <div className="text-[10px] font-mono uppercase text-slate-500">Safety X-Cap Bleeder</div>
                <div className="text-lg font-mono font-bold text-amber-600 dark:text-amber-400 mt-1 tabular-nums">
                  R_bleed = {res.R_bleed_kOhm} kΩ
                </div>
                <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                  τ_disch = {(res.R_bleed_kOhm * 1e3 * 2 * res.Cx_each_uF * 1e-6).toFixed(2)} s (&lt; 2.0 s IEC Pass)
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
                <div className="text-[11px] font-mono text-slate-500">
                  Safety Y-Capacitor Cy (L/N to PE) — Earth Leakage = {customEarthLeakage_mA.toFixed(2)} mA
                </div>
                <div className="flex items-center gap-2 w-60">
                  <LockToggleButton
                    compact
                    locked={lockedParams.Cy_nF}
                    recentlyAutoUpdated={isAutoUpdated('Cy_nF')}
                    onToggle={() => toggleLock('Cy_nF')}
                    label="Safety Cap Cy"
                  />
                  <span className="text-[10px] font-mono text-slate-500">Cy:</span>
                  <input
                    type="range"
                    min={1.0}
                    max={22.0}
                    step={0.5}
                    value={customCy_nF}
                    onChange={(e) => update('Cy_nF', Number(e.target.value))}
                    className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                  />
                  <span className="text-xs font-mono text-cyan-500 font-bold w-14 text-right tabular-nums">
                    {customCy_nF} nF
                  </span>
                </div>
              </div>

              <InteractiveChart
                title="Conducted EMI Spectrum (150 kHz – 30 MHz) vs. CISPR 32 / EN 55032 Class B Limits"
                subtitle={`Effective ripple fundamental at ${res.f_emi_fundamental_kHz} kHz (${res.nPhases}-Ph × ${state.fsw_kHz} kHz) · DM Corner fc = ${res.fc_dm_kHz.toFixed(1)} kHz`}
                data={res.emiSpectrumCurve}
                xKey="freq_MHz"
                xLabel="f"
                xUnit="MHz"
                logX
                currentX={Number((res.f_emi_fundamental_kHz / 1000).toFixed(3))}
                currentXLabel={`f_rip (${res.f_emi_fundamental_kHz}kHz)`}
                series={[
                  {
                    key: 'filtered_dBuV',
                    name: 'Filtered Conducted Emission',
                    unit: 'dBµV',
                    color: '#10b981',
                    axis: 'left',
                  },
                  {
                    key: 'unfiltered_dBuV',
                    name: 'Unfiltered Raw LISN Noise',
                    unit: 'dBµV',
                    color: '#f43f5e',
                    axis: 'left',
                    dashed: true,
                  },
                  {
                    key: 'cisprQP_dBuV',
                    name: 'CISPR 32 Class B Quasi-Peak Limit',
                    unit: 'dBµV',
                    color: '#f59e0b',
                    axis: 'left',
                  },
                  {
                    key: 'cisprAvg_dBuV',
                    name: 'CISPR 32 Class B Average Limit',
                    unit: 'dBµV',
                    color: '#eab308',
                    axis: 'left',
                    dashed: true,
                  },
                ]}
              />
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* SUB-TAB 9: LOW-LINE VS HIGH-LINE EFFICIENCY & THERMAL BREAKDOWN     */}
        {/* =================================================================== */}
        {activeSubTab === 'efficiency' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg p-3">
                <div className="text-[10px] font-mono uppercase text-slate-500">Fast Leg Cond.</div>
                <div className="text-base font-mono font-bold text-cyan-600 dark:text-cyan-400 mt-0.5 tabular-nums">
                  {res.Pcond_fast_W.toFixed(1)} W
                </div>
                <div className="text-[10px] font-mono text-slate-500">Tj = {res.Tj_fast_C.toFixed(0)}°C</div>
              </div>
              <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg p-3">
                <div className="text-[10px] font-mono uppercase text-slate-500">Fast Leg Sw + Qrr</div>
                <div className="text-base font-mono font-bold text-amber-600 dark:text-amber-400 mt-0.5 tabular-nums">
                  {res.Psw_total_W.toFixed(1)} W
                </div>
                <div className="text-[10px] font-mono text-slate-500">Prr = {res.Prr_W.toFixed(1)} W</div>
              </div>
              <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg p-3">
                <div className="text-[10px] font-mono uppercase text-slate-500">Slow Leg / Bridge</div>
                <div className="text-base font-mono font-bold text-purple-400 mt-0.5 tabular-nums">
                  {res.Pcond_slow_W.toFixed(1)} W
                </div>
                <div className="text-[10px] font-mono text-slate-500">{state.f_line_Hz}Hz Unfolding</div>
              </div>
              <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg p-3">
                <div className="text-[10px] font-mono uppercase text-slate-500">Boost Inductors</div>
                <div className="text-base font-mono font-bold text-emerald-500 mt-0.5 tabular-nums">
                  {res.Pind_total_W.toFixed(1)} W
                </div>
                <div className="text-[10px] font-mono text-slate-500">Cu + Core Loss</div>
              </div>
              <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg p-3">
                <div className="text-[10px] font-mono uppercase text-slate-500">High vs Low Line η</div>
                <div className="text-base font-mono font-bold text-emerald-400 mt-0.5 tabular-nums">
                  {res.efficiency_pct.toFixed(2)}% / {res.efficiency_lowLine_pct.toFixed(2)}%
                </div>
                <div className="text-[10px] font-mono text-slate-500">
                  {state.Vac_rms_V}V vs {state.Vac_min_V}V
                </div>
              </div>
            </div>

            <InteractiveChart
              title={`Efficiency Curve Across Load (10% – 100%): High-Line (${state.Vac_rms_V}Vac) vs. Low-Line (${state.Vac_min_V}Vac) & Phase Shedding`}
              subtitle="In 2-Phase Interleaved PFC, shedding Phase 2 below 40% load eliminates half of the switching, Coss, and gate-drive losses"
              data={res.efficiencyLoadCurve}
              xKey="load_pct"
              xLabel="Load"
              xUnit="%"
              currentX={100}
              currentXLabel="100% Load"
              verticalMarkers={
                state.phaseShedding
                  ? [
                      {
                        x: 40,
                        label: 'Phase-2 Shedding Threshold (40%)',
                        color: '#10b981',
                        dashed: true,
                      },
                    ]
                  : []
              }
              series={[
                {
                  key: 'eff_phaseShed_pct',
                  name: `High-Line (${state.Vac_rms_V}Vac) + Phase Shedding`,
                  unit: '%',
                  color: '#10b981',
                  axis: 'left',
                },
                {
                  key: 'eff_highLine_pct',
                  name: `High-Line (${state.Vac_rms_V}Vac) Both Phases Active`,
                  unit: '%',
                  color: '#06b6d4',
                  axis: 'left',
                  dashed: true,
                },
                {
                  key: 'eff_lowLine_pct',
                  name: `Low-Line (${state.Vac_min_V}Vac) Full-Power`,
                  unit: '%',
                  color: '#f59e0b',
                  axis: 'left',
                },
                {
                  key: 'Ploss_highLine_W',
                  name: `High-Line Total Loss`,
                  unit: 'W',
                  color: '#a855f7',
                  axis: 'right',
                  dashed: true,
                },
              ]}
            />
          </div>
        )}
      </div>
    </div>
  );
};
