import React, { useEffect, useMemo, useState } from 'react';
import { AcDcDesignState, DcDcDesignState } from '../data/databases';
import { AcDcResults } from '../engine/acdcEngine';
import { DcDcResults } from '../engine/dcdcEngine';
import { READY_COTS_CAPACITORS } from '../data/passiveDatabase';
import {
  CapacitorBankFixOption,
  CapacitorBankSolution,
  CustomCapBankLocks,
  CustomCapBankOverrides,
  PerCapConfig,
  extractCircuitCapacitors,
  generateCapacitorFixOptions,
  rankReadyCotsCapacitors,
  solveCapacitorBank,
} from '../engine/passiveDesignEngine';
import { InteractiveChart } from './InteractiveChart';
import { LockToggleButton } from './AutoSolverControls';
import { useDesignSolver } from './DesignSolverContext';
import {
  BatteryCharging,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  Sliders,
  Package,
  ArrowRightLeft,
  Check,
  Search,
  Wrench,
} from 'lucide-react';

interface AllCapacitorsDesignerProps {
  mode: 'dcdc' | 'acdc';
  dcdcState?: DcDcDesignState;
  dcdcRes?: DcDcResults;
  acdcState?: AcDcDesignState;
  acdcRes?: AcDcResults;
  requestedItemId?: string | null;
  jumpNonce?: number;
}

const DEFAULT_CAP_LOCKS: CustomCapBankLocks = {
  targetC_uF: false,
  partId: false,
  seriesCount: false,
  parallelCount: false,
};

function formatCapValue(c_uF: number): string {
  if (c_uF < 0.05) return `${(c_uF * 1000).toFixed(1)} nF`;
  if (c_uF < 1.0) return `${(c_uF * 1000).toFixed(0)} nF`;
  return `${c_uF >= 100 ? c_uF.toFixed(0) : c_uF.toFixed(1)} µF`;
}

export const AllCapacitorsDesigner: React.FC<AllCapacitorsDesignerProps> = ({
  mode,
  dcdcState,
  dcdcRes,
  acdcState,
  acdcRes,
  requestedItemId,
  jumpNonce,
}) => {
  const {
    applyDcdcPatch,
    applyAcdcPatch,
    capacitorConfigs: configs,
    updateCapacitorConfig,
  } = useDesignSolver();

  const requirements = useMemo(
    () =>
      extractCircuitCapacitors(
        mode,
        dcdcState!,
        dcdcRes!,
        acdcState!,
        acdcRes!
      ),
    [mode, dcdcState, dcdcRes, acdcState, acdcRes]
  );

  const [selectedId, setSelectedId] = useState<string>(() => requirements[0]?.id || 'dcdc-out-cap');

  useEffect(() => {
    if (requestedItemId && requirements.some((r) => r.id === requestedItemId)) {
      setSelectedId(requestedItemId);
    }
  }, [requestedItemId, jumpNonce, requirements]);

  const activeReq = useMemo(
    () => requirements.find((r) => r.id === selectedId) || requirements[0],
    [requirements, selectedId]
  );

  const [searchQuery, setSearchQuery] = useState('');
  const [syncedNotice, setSyncedNotice] = useState<string | null>(null);

  const updateActiveCfg = (updater: (prev: PerCapConfig) => PerCapConfig) => {
    if (!activeReq) return;
    updateCapacitorConfig(activeReq.id, updater);
  };

  const allSolved = useMemo(() => {
    return requirements.map((req) => {
      const cfg = configs[req.id] || {
        viewMode: 'builder' as const,
        overrides: {},
        locks: { ...DEFAULT_CAP_LOCKS },
      };
      const sol = solveCapacitorBank(req, cfg.overrides, cfg.locks);
      const catalogRanked = rankReadyCotsCapacitors(req);
      return { req, cfg, sol, catalogRanked };
    });
  }, [requirements, configs]);

  const activeEntry = allSolved.find((e) => e.req.id === activeReq?.id) || allSolved[0];
  const activeCfg = activeEntry.cfg;
  const sol = activeEntry.sol;
  const guidedFixes = useMemo(
    () =>
      sol.status !== 'ok'
        ? generateCapacitorFixOptions(activeReq, sol, activeCfg.overrides, activeCfg.locks)
        : [],
    [activeReq, sol, activeCfg]
  );

  const filteredCatalog = useMemo(() => {
    if (!searchQuery.trim()) return activeEntry.catalogRanked;
    const q = searchQuery.toLowerCase();
    return activeEntry.catalogRanked.filter(
      (c) =>
        c.unitPart.mpn.toLowerCase().includes(q) ||
        c.unitPart.manufacturer.toLowerCase().includes(q) ||
        c.unitPart.dielectricLabel.toLowerCase().includes(q) ||
        (c.unitPart.lcscPartNumber || '').toLowerCase().includes(q)
    );
  }, [activeEntry.catalogRanked, searchQuery]);

  const toggleLock = (k: keyof CustomCapBankLocks) => {
    updateActiveCfg((prev) => ({
      ...prev,
      locks: { ...prev.locks, [k]: !prev.locks[k] },
      overrides: {
        ...prev.overrides,
        ...(k === 'targetC_uF' && !prev.locks.targetC_uF ? { targetC_uF: activeReq.targetC_uF } : {}),
        ...(k === 'partId' && !prev.locks.partId ? { partId: sol.unitPart.id } : {}),
        ...(k === 'seriesCount' && !prev.locks.seriesCount ? { seriesCount: sol.seriesCount } : {}),
        ...(k === 'parallelCount' && !prev.locks.parallelCount ? { parallelCount: sol.parallelCount } : {}),
      },
    }));
  };

  const setOverride = <K extends keyof CustomCapBankOverrides>(
    k: K,
    val: CustomCapBankOverrides[K],
    lockKey?: keyof CustomCapBankLocks
  ) => {
    updateActiveCfg((prev) => ({
      ...prev,
      overrides: { ...prev.overrides, [k]: val },
      locks: lockKey ? { ...prev.locks, [lockKey]: true } : prev.locks,
    }));
  };

  const applyBankToCircuit = (bankSol: CapacitorBankSolution) => {
    const sync = activeReq.syncTarget;
    if (!sync) return;
    const cVal = Number((bankSol.bank_C_uF * (sync.scaleFactorToState ?? 1)).toFixed(1));
    const esrVal = Number(bankSol.bank_ESR_mOhm.toFixed(1));
    if (sync.domain === 'dcdc') {
      const patch: Partial<DcDcDesignState> = { [sync.cKey]: cVal };
      if (sync.esrKey) (patch as Record<string, number>)[sync.esrKey] = esrVal;
      applyDcdcPatch(patch, sync.cKey as keyof DcDcDesignState);
    } else {
      const patch: Partial<AcDcDesignState> = { [sync.cKey]: cVal };
      if (sync.esrKey) (patch as Record<string, number>)[sync.esrKey] = esrVal;
      applyAcdcPatch(patch, sync.cKey as keyof AcDcDesignState);
    }
    setSyncedNotice(
      `Applied ${formatCapValue(bankSol.bank_C_uF)} (ESR ${esrVal} mΩ) to ${activeReq.designator}`
    );
    setTimeout(() => setSyncedNotice(null), 2600);
  };

  const equipCatalogBank = (cand: CapacitorBankSolution) => {
    updateActiveCfg((prev) => ({
      ...prev,
      viewMode: 'builder',
      overrides: {
        ...prev.overrides,
        partId: cand.unitPart.id,
        seriesCount: cand.seriesCount,
        parallelCount: cand.parallelCount,
      },
      locks: {
        ...prev.locks,
        partId: true,
        seriesCount: false,
        parallelCount: false,
      },
    }));
    if (activeReq.syncTarget) {
      applyBankToCircuit(cand);
    }
  };

  const applyGuidedCapFix = (fix: CapacitorBankFixOption) => {
    const nextOverrides: CustomCapBankOverrides = {
      ...activeCfg.overrides,
      ...(fix.overridesPatch || {}),
    };
    const nextLocks: CustomCapBankLocks = fix.unlockMatrix
      ? {
          ...activeCfg.locks,
          partId: Boolean(fix.overridesPatch?.partId),
          seriesCount: false,
          parallelCount: false,
        }
      : {
          ...activeCfg.locks,
          ...(fix.overridesPatch?.partId ? { partId: true } : {}),
          ...(fix.overridesPatch?.seriesCount !== undefined ? { seriesCount: true } : {}),
          ...(fix.overridesPatch?.parallelCount !== undefined ? { parallelCount: true } : {}),
        };
    updateActiveCfg((prev) => ({
      ...prev,
      viewMode: 'builder',
      overrides: nextOverrides,
      locks: nextLocks,
    }));
    if (fix.syncToCircuit && activeReq.syncTarget) {
      const nextSol = solveCapacitorBank(activeReq, nextOverrides, nextLocks);
      applyBankToCircuit(nextSol);
    } else {
      setSyncedNotice(`Applied fix: ${fix.label}`);
      setTimeout(() => setSyncedNotice(null), 2600);
    }
  };

  return (
    <div className="space-y-4">
      {/* 1. ALL CIRCUIT CAPACITORS MATRIX */}
      <div className="bg-white dark:bg-[#0E131D] border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
        <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-[13px] font-medium text-slate-900 dark:text-[#eef0f5]">
              All Circuit Capacitor Banks — Matrix, Derating &amp; L10 Life ({mode === 'dcdc' ? 'DC-DC Stage' : 'AC-DC PFC Stage'})
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              Click any capacitor bank to configure Series × Parallel matrix, ESR/ESL, self-resonance, or equip ready COTS parts
            </div>
          </div>
          {syncedNotice && (
            <div className="inline-flex items-center gap-1.5 text-xs font-mono font-medium text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{syncedNotice}</span>
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs font-mono">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 bg-slate-50/40 dark:bg-slate-900/30">
                <th className="py-2 px-3">Designator &amp; Role</th>
                <th className="py-2 px-3">Req C / V_pk</th>
                <th className="py-2 px-3">I_rms Total</th>
                <th className="py-2 px-3">Bank Config (S×P)</th>
                <th className="py-2 px-3">Selected Part (MPN)</th>
                <th className="py-2 px-3">Bank C / ESR</th>
                <th className="py-2 px-3">V-Derate / I-Util</th>
                <th className="py-2 px-3">L10 Life / T_hot</th>
                <th className="py-2 px-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800/70">
              {allSolved.map(({ req, sol: bank }) => {
                const isSelected = req.id === activeReq.id;
                return (
                  <tr
                    key={req.id}
                    onClick={() => setSelectedId(req.id)}
                    className={`cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-cyan-50/70 dark:bg-cyan-950/25'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-900/40'
                    }`}
                  >
                    <td className="py-2.5 px-3">
                      <div className="font-semibold text-slate-900 dark:text-slate-100">{req.designator}</div>
                      <div className="text-[10px] font-sans text-slate-500 truncate max-w-[200px]">{req.name}</div>
                    </td>
                    <td className="py-2.5 px-3 tabular-nums">
                      <div className="text-cyan-600 dark:text-cyan-400 font-semibold">{formatCapValue(req.targetC_uF)}</div>
                      <div className="text-[10px] text-slate-500">{req.V_op_pk_V.toFixed(0)} Vpk</div>
                    </td>
                    <td className="py-2.5 px-3 tabular-nums text-slate-800 dark:text-slate-200">
                      {req.I_total_rms_A.toFixed(1)} A
                    </td>
                    <td className="py-2.5 px-3 tabular-nums font-semibold">
                      {bank.seriesCount}S × {bank.parallelCount}P ({bank.totalUnits}×)
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="font-semibold text-slate-800 dark:text-slate-200">{bank.unitPart.mpn}</div>
                      <div className="text-[10px] text-slate-500">{bank.unitPart.dielectricLabel}</div>
                    </td>
                    <td className="py-2.5 px-3 tabular-nums">
                      <div>{formatCapValue(bank.bank_C_uF)}</div>
                      <div className="text-[10px] text-slate-500">{bank.bank_ESR_mOhm.toFixed(1)} mΩ</div>
                    </td>
                    <td className="py-2.5 px-3 tabular-nums">
                      <div className={bank.voltageDerating_pct > 85 ? 'text-amber-600 dark:text-amber-400 font-semibold' : ''}>
                        {bank.voltageDerating_pct.toFixed(0)}% V
                      </div>
                      <div className="text-[10px] text-slate-500">{bank.rippleUtilization_pct.toFixed(0)}% I_rms</div>
                    </td>
                    <td className="py-2.5 px-3 tabular-nums">
                      <div>{(bank.L10_life_hrs / 1000).toFixed(0)}k hrs</div>
                      <div className="text-[10px] text-slate-500">{bank.T_hotspot_C.toFixed(1)}°C</div>
                    </td>
                    <td className="py-2.5 px-3 font-sans font-medium">
                      {bank.status === 'critical' ? (
                        <span className="inline-flex items-center gap-1.5 text-rose-600 dark:text-rose-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                          Critical
                        </span>
                      ) : bank.status === 'warning' ? (
                        <span className="inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                          Tight
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          Nominal
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 2. SELECTED CAPACITOR WORKBENCH HEADER */}
      <div className="bg-white dark:bg-[#0E131D] border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <BatteryCharging className="w-4 h-4 text-cyan-500" />
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {activeReq.designator} — {activeReq.name}
              </h3>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{activeReq.description}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-md border border-slate-200 dark:border-slate-700 overflow-hidden">
              <button
                type="button"
                onClick={() => updateActiveCfg((p) => ({ ...p, viewMode: 'builder' }))}
                className={`px-3 py-1.5 text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                  activeCfg.viewMode === 'builder'
                    ? 'bg-cyan-600 text-white'
                    : 'bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-300'
                }`}
              >
                <Sliders className="w-3.5 h-3.5" />
                Bank Matrix Builder
              </button>
              <button
                type="button"
                onClick={() => updateActiveCfg((p) => ({ ...p, viewMode: 'catalog' }))}
                className={`px-3 py-1.5 text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                  activeCfg.viewMode === 'catalog'
                    ? 'bg-cyan-600 text-white'
                    : 'bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-300'
                }`}
              >
                <Package className="w-3.5 h-3.5" />
                Ready COTS Catalog ({activeEntry.catalogRanked.length})
              </button>
            </div>

            {activeReq.syncTarget && (
              <button
                type="button"
                onClick={() => applyBankToCircuit(sol)}
                className="px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <ArrowRightLeft className="w-3.5 h-3.5" />
                Apply {formatCapValue(sol.bank_C_uF)} &amp; ESR to Circuit
              </button>
            )}
          </div>
        </div>

        {/* GUIDED 1-CLICK BANK STRESS & DERATING FIX ASSISTANT */}
        {sol.status !== 'ok' && guidedFixes.length > 0 && (
          <div
            role="alert"
            className={`rounded-md border p-3 space-y-2.5 ${
              sol.status === 'critical'
                ? 'border-rose-500/70 bg-rose-50 dark:bg-rose-950/25'
                : 'border-amber-500/70 bg-amber-50 dark:bg-amber-950/25'
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex items-start gap-2">
                {sol.status === 'critical' ? (
                  <ShieldAlert className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                )}
                <div>
                  <div
                    className={`text-xs font-semibold ${
                      sol.status === 'critical'
                        ? 'text-rose-800 dark:text-rose-200'
                        : 'text-amber-800 dark:text-amber-200'
                    }`}
                  >
                    {sol.status === 'critical' ? 'Critical Stress Detected' : 'Tight Margin Warning'} on {activeReq.designator} ({sol.unitPart.mpn})
                  </div>
                  <div className="text-[11px] text-slate-700 dark:text-slate-300 mt-0.5">
                    {sol.statusReason}
                  </div>
                </div>
              </div>
              <div className="text-[11px] font-mono tabular-nums text-slate-600 dark:text-slate-300">
                {sol.voltageDerating_pct.toFixed(0)}% V · {sol.rippleUtilization_pct.toFixed(0)}% I_rms · T={sol.T_hotspot_C.toFixed(0)}°C
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200/70 dark:border-slate-800">
              <span className="inline-flex items-center gap-1 text-[11px] font-mono text-slate-600 dark:text-slate-400">
                <Wrench className="w-3 h-3" /> Ranked 1-Click Fixes:
              </span>
              {guidedFixes.map((fix, idx) => (
                <button
                  key={fix.id}
                  type="button"
                  onClick={() => applyGuidedCapFix(fix)}
                  className={`px-2.5 py-1 rounded text-[11px] font-medium inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                    idx === 0
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                      : 'bg-white dark:bg-[#131A26] border border-slate-300 dark:border-slate-700 hover:border-cyan-500 text-slate-800 dark:text-slate-200'
                  }`}
                  title={fix.impact}
                >
                  <Check className="w-3 h-3 shrink-0" />
                  <span>{fix.label}</span>
                  <span className={`text-[10px] font-mono ${idx === 0 ? 'text-emerald-100' : 'text-slate-500 dark:text-slate-400'}`}>
                    ({fix.impact.split('·')[0].trim()})
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ==================================================================== */}
      {/* VIEW A: BANK MATRIX BUILDER & SELF-RESONANT IMPEDANCE ANALYSIS       */}
      {/* ==================================================================== */}
      {activeCfg.viewMode === 'builder' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
            {/* Controls Card */}
            <div className="xl:col-span-5 bg-white dark:bg-[#0E131D] border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
                <div className="text-xs font-mono font-bold uppercase text-cyan-600 dark:text-cyan-400">
                  Bank Synthesis Controls (Lock / Auto)
                </div>
                <button
                  type="button"
                  onClick={() =>
                    updateActiveCfg((p) => ({
                      ...p,
                      locks: { ...DEFAULT_CAP_LOCKS },
                      overrides: {},
                    }))
                  }
                  className="text-[11px] font-medium text-cyan-600 dark:text-cyan-400 hover:underline cursor-pointer"
                >
                  Auto-Solve Optimal Matrix
                </button>
              </div>

              <div>
                <div className="flex items-center justify-between gap-1 mb-0.5">
                  <span className="text-[11px] font-mono text-slate-500">Unit Capacitor Part (Dielectric &amp; Dimensions)</span>
                  <LockToggleButton
                    compact
                    locked={activeCfg.locks.partId}
                    recentlyAutoUpdated={!activeCfg.locks.partId}
                    onToggle={() => toggleLock('partId')}
                    label="Unit Capacitor"
                  />
                </div>
                <select
                  value={sol.unitPart.id}
                  onChange={(e) => setOverride('partId', e.target.value, 'partId')}
                  className={`w-full px-2 py-1.5 text-xs font-mono bg-slate-50 dark:bg-slate-900 border rounded ${
                    activeCfg.locks.partId ? 'border-amber-500/60' : 'border-slate-300 dark:border-slate-700'
                  }`}
                >
                  {READY_COTS_CAPACITORS.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.mpn} · {formatCapValue(c.C_uF)} / {c.V_rated_V}V ({c.dielectricLabel})
                    </option>
                  ))}
                </select>
                <div className="mt-1 text-[10px] font-mono text-slate-500 tabular-nums">
                  Unit: {sol.unitPart.dimensions_mm} · LCSC {sol.unitPart.lcscPartNumber || '—'} · I_rms={sol.unitPart.I_rms_A}A · ESR={sol.unitPart.ESR_mOhm}mΩ
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <div className="flex items-center justify-between gap-1 mb-0.5">
                    <span className="text-[11px] font-mono text-slate-500">Target C (µF)</span>
                    <LockToggleButton
                      compact
                      locked={activeCfg.locks.targetC_uF}
                      recentlyAutoUpdated={!activeCfg.locks.targetC_uF}
                      onToggle={() => toggleLock('targetC_uF')}
                      label="Target C"
                    />
                  </div>
                  <input
                    type="number"
                    step={activeReq.targetC_uF < 1 ? 0.01 : 10}
                    min={0.001}
                    value={activeCfg.locks.targetC_uF ? activeCfg.overrides.targetC_uF ?? activeReq.targetC_uF : activeReq.targetC_uF}
                    onChange={(e) => setOverride('targetC_uF', Math.max(0.001, Number(e.target.value)), 'targetC_uF')}
                    className={`w-full px-2 py-1 text-xs font-mono tabular-nums bg-slate-50 dark:bg-slate-900 border rounded ${
                      activeCfg.locks.targetC_uF ? 'border-amber-500/60' : 'border-slate-300 dark:border-slate-700'
                    }`}
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between gap-1 mb-0.5">
                    <span className="text-[11px] font-mono text-slate-500">Series (S)</span>
                    <LockToggleButton
                      compact
                      locked={activeCfg.locks.seriesCount}
                      recentlyAutoUpdated={!activeCfg.locks.seriesCount}
                      onToggle={() => toggleLock('seriesCount')}
                      label="Series Count"
                    />
                  </div>
                  <input
                    type="number"
                    min={1}
                    max={4}
                    value={sol.seriesCount}
                    onChange={(e) => setOverride('seriesCount', Math.max(1, Math.min(4, Math.round(Number(e.target.value)))), 'seriesCount')}
                    className={`w-full px-2 py-1 text-xs font-mono tabular-nums bg-slate-50 dark:bg-slate-900 border rounded ${
                      activeCfg.locks.seriesCount ? 'border-amber-500/60' : 'border-emerald-500/60'
                    }`}
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between gap-1 mb-0.5">
                    <span className="text-[11px] font-mono text-slate-500">Parallel (P)</span>
                    <LockToggleButton
                      compact
                      locked={activeCfg.locks.parallelCount}
                      recentlyAutoUpdated={!activeCfg.locks.parallelCount}
                      onToggle={() => toggleLock('parallelCount')}
                      label="Parallel Count"
                    />
                  </div>
                  <input
                    type="number"
                    min={1}
                    max={32}
                    value={sol.parallelCount}
                    onChange={(e) => setOverride('parallelCount', Math.max(1, Math.min(32, Math.round(Number(e.target.value)))), 'parallelCount')}
                    className={`w-full px-2 py-1 text-xs font-mono tabular-nums bg-slate-50 dark:bg-slate-900 border rounded ${
                      activeCfg.locks.parallelCount ? 'border-amber-500/60' : 'border-emerald-500/60'
                    }`}
                  />
                </div>
              </div>

              {/* Status Banner */}
              <div
                className={`p-2.5 rounded border text-xs ${
                  sol.status === 'critical'
                    ? 'bg-rose-50 dark:bg-rose-950/30 border-rose-500/60 text-rose-800 dark:text-rose-200'
                    : sol.status === 'warning'
                    ? 'bg-amber-50 dark:bg-amber-950/25 border-amber-500/60 text-amber-800 dark:text-amber-200'
                    : 'bg-emerald-50/70 dark:bg-emerald-950/20 border-emerald-500/40 text-emerald-800 dark:text-emerald-200'
                }`}
              >
                <div className="font-semibold flex items-center gap-1.5">
                  {sol.status === 'ok' ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 shrink-0" />}
                  <span>{sol.seriesCount}S × {sol.parallelCount}P = {sol.totalUnits}× Units (${sol.totalCost_USD.toFixed(2)})</span>
                </div>
                <div className="text-[11px] mt-0.5">{sol.statusReason}</div>
              </div>

              {/* Bank Computed Specs */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs font-mono border-t border-slate-200 dark:border-slate-800 pt-2.5">
                <div className="flex justify-between">
                  <span className="text-slate-500">Bank C_total:</span>
                  <span className="font-semibold text-cyan-600 dark:text-cyan-400 tabular-nums">{formatCapValue(sol.bank_C_uF)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Bank V_rated:</span>
                  <span className="font-semibold tabular-nums">{sol.bank_V_rated_V} V ({sol.voltageDerating_pct.toFixed(0)}%)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Bank ESR / ESL:</span>
                  <span className="tabular-nums">{sol.bank_ESR_mOhm.toFixed(1)}mΩ / {sol.bank_ESL_nH.toFixed(1)}nH</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Self-Resonant f_SRF:</span>
                  <span className="tabular-nums">{sol.f_SRF_kHz.toFixed(0)} kHz</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Ripple Loss / Thot:</span>
                  <span className="tabular-nums">{sol.P_loss_total_W.toFixed(2)}W · {sol.T_hotspot_C.toFixed(1)}°C</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Arrhenius L10 Life:</span>
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                    {(sol.L10_life_hrs / 1000).toFixed(1)}k hrs ({sol.L10_life_years.toFixed(1)}y)
                  </span>
                </div>
              </div>
            </div>

            {/* Impedance vs Frequency Chart */}
            <div className="xl:col-span-7 bg-white dark:bg-[#0E131D] border border-slate-200 dark:border-slate-800 rounded-lg p-4">
              <InteractiveChart
                title={`Capacitor Bank Impedance |Z(f)| & Self-Resonant Notch (${activeReq.designator})`}
                subtitle={`Total ESL=${sol.bank_ESL_nH.toFixed(1)}nH, ESR=${sol.bank_ESR_mOhm.toFixed(1)}mΩ · f_SRF=${sol.f_SRF_kHz.toFixed(0)}kHz · f_sw=${activeReq.f_sw_kHz.toFixed(0)}kHz`}
                data={sol.impedanceCurve}
                xKey="freq_kHz"
                xLabel="Frequency"
                xUnit="kHz"
                logX
                currentX={activeReq.f_sw_kHz}
                currentXLabel={`f_rip=${activeReq.f_sw_kHz.toFixed(0)}kHz`}
                series={[
                  { key: 'Z_mOhm', name: 'Bank |Z(f)|', unit: 'mΩ', color: '#06b6d4', axis: 'left' },
                  { key: 'Xc_mOhm', name: 'Capacitive Xc', unit: 'mΩ', color: '#10b981', axis: 'left', dashed: true },
                ]}
              />
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* VIEW B: READY COTS CAPACITOR CATALOG MATCHER                         */}
      {/* ==================================================================== */}
      {activeCfg.viewMode === 'catalog' && (
        <div className="bg-white dark:bg-[#0E131D] border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-xs font-mono font-bold uppercase text-cyan-600 dark:text-cyan-400">
                Off-The-Shelf Capacitor Selector ({activeReq.designator})
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Auto-sizes Series × Parallel arrays for each ready COTS capacitor to meet {formatCapValue(activeReq.targetC_uF)}, ≥{activeReq.V_min_rated_V}V, &amp; {activeReq.I_total_rms_A.toFixed(1)}Arms
              </div>
            </div>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search MPN / Dielectric / LCSC..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-2.5 py-1 text-xs font-mono bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs font-mono">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 bg-slate-50/40 dark:bg-slate-900/30">
                  <th className="py-2 px-3">MPN / Mfr / LCSC</th>
                  <th className="py-2 px-3">Dielectric</th>
                  <th className="py-2 px-3">Array (S×P)</th>
                  <th className="py-2 px-3">Bank C / V_rated</th>
                  <th className="py-2 px-3">ESR / f_SRF</th>
                  <th className="py-2 px-3">Ripple Util</th>
                  <th className="py-2 px-3">L10 Life / Cost</th>
                  <th className="py-2 px-3">Dimensions</th>
                  <th className="py-2 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800/70">
                {filteredCatalog.map((cand) => {
                  const isActive = cand.unitPart.id === sol.unitPart.id;
                  return (
                    <tr
                      key={cand.unitPart.id}
                      className={isActive ? 'bg-emerald-50/70 dark:bg-emerald-950/25' : 'hover:bg-slate-50 dark:hover:bg-slate-900/40'}
                    >
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">{cand.unitPart.mpn}</div>
                        <div className="text-[10px] text-slate-500">
                          {cand.unitPart.manufacturer} · LCSC {cand.unitPart.lcscPartNumber || '—'}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 font-sans text-[11px] text-slate-600 dark:text-slate-300">
                        {cand.unitPart.dielectricLabel}
                      </td>
                      <td className="py-2.5 px-3 font-semibold tabular-nums">
                        {cand.seriesCount}S × {cand.parallelCount}P ({cand.totalUnits}×)
                      </td>
                      <td className="py-2.5 px-3 tabular-nums">
                        <div className="text-cyan-600 dark:text-cyan-400 font-semibold">{formatCapValue(cand.bank_C_uF)}</div>
                        <div className="text-[10px] text-slate-500">
                          {cand.bank_V_rated_V}V ({cand.voltageDerating_pct.toFixed(0)}%)
                        </div>
                      </td>
                      <td className="py-2.5 px-3 tabular-nums">
                        <div>{cand.bank_ESR_mOhm.toFixed(1)} mΩ</div>
                        <div className="text-[10px] text-slate-500">SRF {cand.f_SRF_kHz.toFixed(0)} kHz</div>
                      </td>
                      <td className="py-2.5 px-3 tabular-nums">
                        <div>{cand.rippleUtilization_pct.toFixed(0)}% I_rms</div>
                        <div className="text-[10px] text-slate-500">{cand.P_loss_total_W.toFixed(2)}W</div>
                      </td>
                      <td className="py-2.5 px-3 tabular-nums">
                        <div className="text-emerald-600 dark:text-emerald-400">{(cand.L10_life_hrs / 1000).toFixed(0)}k hrs</div>
                        <div className="text-[10px] text-slate-500">${cand.totalCost_USD.toFixed(2)}</div>
                      </td>
                      <td className="py-2.5 px-3 text-[11px] text-slate-500">
                        {cand.unitPart.dimensions_mm}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          type="button"
                          onClick={() => equipCatalogBank(cand)}
                          className={`px-2.5 py-1 rounded text-xs font-medium inline-flex items-center gap-1 cursor-pointer ${
                            isActive
                              ? 'bg-emerald-600 text-white'
                              : 'bg-cyan-600 hover:bg-cyan-500 text-white'
                          }`}
                        >
                          {isActive ? (
                            <>
                              <Check className="w-3 h-3" /> Active
                            </>
                          ) : (
                            'Equip Bank'
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
