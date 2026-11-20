import React, { useEffect, useMemo, useState } from 'react';
import {
  AcDcDesignState,
  CapBranchSpec,
  CapTechnology,
  DcDcDesignState,
  HybridCapBankConfig,
} from '../data/databases';
import { AcDcResults } from '../engine/acdcEngine';
import { DcDcResults } from '../engine/dcdcEngine';
import { READY_COTS_CAPACITORS } from '../data/passiveDatabase';
import {
  CapacitorBankFixOption,
  CapacitorBankSolution,
  CustomCapBankLocks,
  CustomCapBankOverrides,
  HybridCapPresetId,
  HybridCapRole,
  PerCapConfig,
  buildHybridCapPreset,
  extractCircuitCapacitors,
  generateCapacitorFixOptions,
  getDefaultHybridCapBank,
  rankReadyCotsCapacitors,
  solveCapacitorBank,
  solveHybridCapBank,
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
  Layers,
  Plus,
  Trash2,
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

  // ==========================================================================
  // HYBRID MULTI-BRANCH CAPACITOR BANK COMPOSER (Cin, Cout, Cdc)
  // ==========================================================================
  const [hybridRole, setHybridRole] = useState<HybridCapRole>(() =>
    mode === 'acdc' ? 'acdc-cdc' : 'dcdc-cout'
  );

  useEffect(() => {
    if (mode === 'acdc') {
      setHybridRole('acdc-cdc');
    } else if (hybridRole === 'acdc-cdc') {
      setHybridRole('dcdc-cout');
    }
  }, [mode, hybridRole]);

  const activeHybridConfig: HybridCapBankConfig = useMemo(
    () => getDefaultHybridCapBank(hybridRole, dcdcState, acdcState),
    [hybridRole, dcdcState, acdcState]
  );

  const hybridConditions = useMemo(() => {
    if (hybridRole === 'acdc-cdc' && acdcState && acdcRes) {
      return {
        fsw_kHz: acdcRes.f_emi_fundamental_kHz,
        f_lf_Hz: acdcState.f_line_Hz * 2,
        I_hf_rms_A: acdcRes.ICdc_hf_rms_A,
        I_lf_rms_A: acdcRes.ICdc_lf_rms_A,
        V_op_pk_V: acdcState.Vdc_bus_V * 1.04,
        Tamb_C: acdcState.capAmbient_C ?? 45,
      };
    }
    if (hybridRole === 'dcdc-cin' && dcdcState && dcdcRes) {
      const iInRip = (dcdcState.Pout_W / Math.max(100, dcdcState.Vin_min_V)) * 0.55;
      return {
        fsw_kHz: dcdcState.fsw_kHz * 2,
        f_lf_Hz: 0,
        I_hf_rms_A: iInRip,
        I_lf_rms_A: 0,
        V_op_pk_V: dcdcState.Vin_max_V,
        Tamb_C: dcdcState.Tamb_C,
      };
    }
    return {
      fsw_kHz: dcdcRes?.fRipple_out_kHz ?? (dcdcState?.fsw_kHz ?? 100) * 2,
      f_lf_Hz: 0,
      I_hf_rms_A: dcdcRes?.ICo_rms_A ?? 12,
      I_lf_rms_A: 0,
      V_op_pk_V: (dcdcState?.Vout_V ?? 48) * 1.05,
      Tamb_C: dcdcState?.Tamb_C ?? 45,
    };
  }, [hybridRole, dcdcState, dcdcRes, acdcState, acdcRes]);

  const hybridSol = useMemo(
    () => solveHybridCapBank(activeHybridConfig, hybridConditions),
    [activeHybridConfig, hybridConditions]
  );

  const commitHybridConfig = (nextCfg: HybridCapBankConfig, noticeText?: string) => {
    const solved = solveHybridCapBank(nextCfg, hybridConditions);
    const cEff = Number(Math.max(1, solved.totalCapEff_uF).toFixed(1));
    const esrEff = Number(Math.max(0.5, solved.esrEffAtFsw_mOhm).toFixed(2));
    if (hybridRole === 'dcdc-cin') {
      applyDcdcPatch({ cinBank: nextCfg }, 'cinBank');
    } else if (hybridRole === 'dcdc-cout') {
      applyDcdcPatch(
        { coutBank: nextCfg, Co_uF: cEff, ESR_Co_mOhm: esrEff },
        'coutBank'
      );
    } else {
      applyAcdcPatch(
        { cdcBank: nextCfg, Cdc_uF: cEff, ESR_Cdc_mOhm: esrEff },
        'cdcBank'
      );
    }
    if (noticeText) {
      setSyncedNotice(noticeText);
      setTimeout(() => setSyncedNotice(null), 2600);
    }
  };

  const applyHybridPreset = (presetId: HybridCapPresetId) => {
    const cfg = buildHybridCapPreset(hybridRole, presetId, hybridConditions.V_op_pk_V);
    const solved = solveHybridCapBank(cfg, hybridConditions);
    commitHybridConfig(cfg, `Loaded hybrid bank: ${solved.summaryLabel}`);
  };

  const updateBranchField = <K extends keyof CapBranchSpec>(
    branchIdx: number,
    key: K,
    value: CapBranchSpec[K]
  ) => {
    const nextBranches = activeHybridConfig.branches.map((b, i) =>
      i === branchIdx ? { ...b, [key]: value } : b
    );
    commitHybridConfig({ branches: nextBranches });
  };

  const assignCotsPartToBranch = (branchIdx: number, partId: string) => {
    const part = READY_COTS_CAPACITORS.find((p) => p.id === partId);
    if (!part) return;
    const tech: CapTechnology =
      part.dielectric === 'mlcc-x7r' || part.dielectric === 'mlcc-c0g'
        ? 'mlcc'
        : part.dielectric === 'polymer-hybrid'
        ? 'polymer'
        : part.dielectric === 'mkp-dc-link' || part.dielectric === 'mkp-resonant' || part.dielectric === 'x2-film'
        ? 'film'
        : 'electrolytic';
    const nextBranches = activeHybridConfig.branches.map((b, i) =>
      i === branchIdx
        ? {
            ...b,
            label: part.mpn,
            technology: tech,
            capEach_uF: part.C_uF,
            esrEach_mOhm: part.ESR_mOhm,
            eslEach_nH: part.ESL_nH,
            vRated_V: part.V_dc_rated_V ?? part.V_rated_V,
            iRmsEach_A: part.I_rms_A,
            rthCa_CW: part.Rth_ca_CW,
            tMax_C: part.Tmax_C,
            l0_hrs: part.L0_hrs,
            mpn: part.mpn,
          }
        : b
    );
    commitHybridConfig({ branches: nextBranches }, `Assigned ${part.mpn} to branch ${branchIdx + 1}`);
  };

  const addHybridBranch = () => {
    if (activeHybridConfig.branches.length >= 4) return;
    const vOp = hybridConditions.V_op_pk_V;
    const isHV = vOp > 160;
    const newBranch: CapBranchSpec = isHV
      ? {
          id: `branch-${Date.now()}`,
          label: 'HF MLCC Decoupling',
          technology: 'mlcc',
          qty: 2,
          capEach_uF: 0.47,
          esrEach_mOhm: 2.5,
          eslEach_nH: 1.0,
          vRated_V: Math.max(630, Math.ceil(vOp * 1.4)),
          iRmsEach_A: 5.0,
        }
      : {
          id: `branch-${Date.now()}`,
          label: 'X7S MLCC 2220',
          technology: 'mlcc',
          qty: 2,
          capEach_uF: 10,
          esrEach_mOhm: 2.2,
          eslEach_nH: 0.9,
          vRated_V: Math.max(100, Math.ceil(vOp * 1.5)),
          iRmsEach_A: 6.0,
          mpn: 'C5750X7S2A106M230KB',
        };
    commitHybridConfig({ branches: [...activeHybridConfig.branches, newBranch] });
  };

  const removeHybridBranch = (branchIdx: number) => {
    if (activeHybridConfig.branches.length <= 1) return;
    commitHybridConfig({
      branches: activeHybridConfig.branches.filter((_, i) => i !== branchIdx),
    });
  };

  const hybridImpedanceChartData = useMemo(() => {
    return hybridSol.impedanceCurve.map((pt) => {
      const row: Record<string, number> = {
        freq_kHz: pt.freq_kHz,
        Z_total_mOhm: pt.Z_total_mOhm,
      };
      pt.branchZ_mOhm.forEach((bz, idx) => {
        row[`b${idx}`] = bz;
      });
      return row;
    });
  }, [hybridSol]);

  return (
    <div className="space-y-4">
      {/* 0. HYBRID MULTI-BRANCH CAPACITOR BANK COMPOSER (Cin / Cout / Cdc) */}
      <div className="bg-white dark:bg-[#0E131D] border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-cyan-500 shrink-0" />
            <div>
              <div className="text-[13px] font-medium text-slate-900 dark:text-[#eef0f5]">
                Hardware Hybrid Capacitor Bank Composer (Parallel Multi-Technology Matrix)
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Combine Bulk Electrolytic / Polymer / MKP Film + HF MLCC branches — synced directly to Schematic, LTspice (.asc), QSPICE (.qsch), SPICE (.cir) &amp; PLECS (.plecs)
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {mode === 'dcdc' ? (
              <>
                <button
                  type="button"
                  onClick={() => setHybridRole('dcdc-cin')}
                  className={`px-2.5 py-1 rounded text-xs font-mono border cursor-pointer ${
                    hybridRole === 'dcdc-cin'
                      ? 'bg-cyan-600 border-cyan-600 text-white font-semibold'
                      : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  C_in (Primary DC Bus)
                </button>
                <button
                  type="button"
                  onClick={() => setHybridRole('dcdc-cout')}
                  className={`px-2.5 py-1 rounded text-xs font-mono border cursor-pointer ${
                    hybridRole === 'dcdc-cout'
                      ? 'bg-cyan-600 border-cyan-600 text-white font-semibold'
                      : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  C_out (Secondary Output)
                </button>
              </>
            ) : (
              <span className="px-2.5 py-1 rounded text-xs font-mono bg-cyan-600 text-white font-semibold">
                C_DC (HV DC-Link Bank)
              </span>
            )}
          </div>
        </div>

        <div className="p-4 space-y-4">
          {/* Quick Presets + Add Branch */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-mono uppercase text-slate-500 mr-1">Quick Combinations:</span>
              {(
                [
                  { id: '3elec-2mlcc', label: '3× Electrolytic + 2× MLCC' },
                  { id: '4poly-4mlcc', label: '4× Polymer + 4× MLCC' },
                  { id: '2film-4mlcc', label: '2× MKP Film + 4× MLCC' },
                  { id: '4elec-2film', label: '4× Electrolytic + 2× Film' },
                ] as { id: HybridCapPresetId; label: string }[]
              ).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => applyHybridPreset(p.id)}
                  className="px-2.5 py-1 rounded text-[11px] font-mono bg-slate-100 hover:bg-cyan-50 dark:bg-slate-900 dark:hover:bg-cyan-950/40 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 hover:border-cyan-500 cursor-pointer"
                >
                  {p.label}
                </button>
              ))}
            </div>

            {activeHybridConfig.branches.length < 4 && (
              <button
                type="button"
                onClick={addHybridBranch}
                className="px-2.5 py-1 rounded text-xs font-mono bg-emerald-600 hover:bg-emerald-500 text-white inline-flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Add Parallel Branch
              </button>
            )}
          </div>

          {/* KPI Summary Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2.5 text-xs font-mono">
            <div className="p-2.5 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50">
              <div className="text-[10px] text-slate-500 uppercase">Active Topology</div>
              <div className="font-semibold text-cyan-600 dark:text-cyan-400 truncate" title={hybridSol.summaryLabel}>
                {hybridSol.summaryLabel}
              </div>
              <div className="text-[10px] text-slate-500">{hybridSol.totalUnits} total units</div>
            </div>
            <div className="p-2.5 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50">
              <div className="text-[10px] text-slate-500 uppercase">Effective C (Bias-Adj)</div>
              <div className="font-semibold text-slate-900 dark:text-white tabular-nums">
                {formatCapValue(hybridSol.totalCapEff_uF)}
              </div>
              <div className="text-[10px] text-slate-500">Nom: {formatCapValue(hybridSol.totalCapNominal_uF)}</div>
            </div>
            <div className="p-2.5 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50">
              <div className="text-[10px] text-slate-500 uppercase">ESR / |Z| @ {hybridConditions.fsw_kHz.toFixed(0)} kHz</div>
              <div className="font-semibold text-slate-900 dark:text-white tabular-nums">
                {hybridSol.esrEffAtFsw_mOhm.toFixed(2)} mΩ / {hybridSol.Z_at_fsw_mOhm.toFixed(2)} mΩ
              </div>
              <div className="text-[10px] text-slate-500">ESL_eff: {hybridSol.eslEff_nH.toFixed(2)} nH</div>
            </div>
            <div className="p-2.5 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50">
              <div className="text-[10px] text-slate-500 uppercase">Anti-Resonance Peak</div>
              <div className={`font-semibold tabular-nums ${
                hybridSol.antiResonanceRisk === 'high'
                  ? 'text-rose-600 dark:text-rose-400'
                  : hybridSol.antiResonanceRisk === 'moderate'
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-emerald-600 dark:text-emerald-400'
              }`}>
                {hybridSol.f_antiresonance_kHz
                  ? `${hybridSol.f_antiresonance_kHz.toFixed(0)} kHz (${hybridSol.Z_antiresonance_mOhm?.toFixed(1)} mΩ)`
                  : 'Damped (No Peak)'}
              </div>
              <div className="text-[10px] text-slate-500">Risk: {hybridSol.antiResonanceRisk.toUpperCase()}</div>
            </div>
            <div className="p-2.5 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50">
              <div className="text-[10px] text-slate-500 uppercase">Peak Stress / Loss</div>
              <div className="font-semibold text-slate-900 dark:text-white tabular-nums">
                {hybridSol.worstVoltageDerating_pct.toFixed(0)}% V · {hybridSol.worstRippleUtilization_pct.toFixed(0)}% I_rms
              </div>
              <div className="text-[10px] text-slate-500">Loss: {hybridSol.P_loss_total_W.toFixed(2)} W</div>
            </div>
            <div className="p-2.5 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50">
              <div className="text-[10px] text-slate-500 uppercase">Min L10 / Hotspot</div>
              <div className={`font-semibold tabular-nums ${
                hybridSol.status === 'critical'
                  ? 'text-rose-600 dark:text-rose-400'
                  : hybridSol.status === 'warning'
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-emerald-600 dark:text-emerald-400'
              }`}>
                {(hybridSol.minL10Life_hrs / 1000).toFixed(0)}k hrs · {hybridSol.worstHotspot_C.toFixed(1)}°C
              </div>
              <div className="text-[10px] text-slate-500 uppercase">Verdict: {hybridSol.status}</div>
            </div>
          </div>

          {/* Branch-by-Branch Editable Table with Exact Ripple Current Sharing */}
          <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
            <table className="w-full text-left border-collapse text-xs font-mono">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-[10px] uppercase text-slate-500 bg-slate-50/60 dark:bg-slate-900/40">
                  <th className="py-2 px-2.5">Branch / Technology</th>
                  <th className="py-2 px-2.5">COTS Part Preset</th>
                  <th className="py-2 px-2.5">Qty</th>
                  <th className="py-2 px-2.5">C_each (µF)</th>
                  <th className="py-2 px-2.5">ESR (mΩ)</th>
                  <th className="py-2 px-2.5">ESL (nH)</th>
                  <th className="py-2 px-2.5">V_rated (V)</th>
                  <th className="py-2 px-2.5">I_rms/ea (A)</th>
                  <th className="py-2 px-2.5">Shared Ripple</th>
                  <th className="py-2 px-2.5">T_hot / L10</th>
                  <th className="py-2 px-2.5 text-right">Del</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {hybridSol.branches.map((br, idx) => (
                  <tr key={br.branch.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/30">
                    <td className="py-2 px-2.5 space-y-1">
                      <select
                        value={br.branch.technology}
                        onChange={(e) => updateBranchField(idx, 'technology', e.target.value as CapTechnology)}
                        className="w-28 px-1.5 py-1 rounded bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-[11px]"
                      >
                        <option value="electrolytic">Electrolytic</option>
                        <option value="polymer">Polymer Solid</option>
                        <option value="mlcc">MLCC Ceramic</option>
                        <option value="film">MKP Film</option>
                      </select>
                      <input
                        type="text"
                        value={br.branch.label}
                        onChange={(e) => updateBranchField(idx, 'label', e.target.value)}
                        className="w-28 block px-1.5 py-0.5 rounded bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-[10px] text-slate-600 dark:text-slate-300"
                      />
                    </td>
                    <td className="py-2 px-2.5">
                      <select
                        value={READY_COTS_CAPACITORS.find((p) => p.mpn === br.branch.mpn)?.id || ''}
                        onChange={(e) => assignCotsPartToBranch(idx, e.target.value)}
                        className="w-36 px-1.5 py-1 rounded bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-[10px]"
                      >
                        <option value="">Custom / Manual</option>
                        {READY_COTS_CAPACITORS.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.mpn} ({p.C_uF}µF/{p.V_dc_rated_V ?? p.V_rated_V}V)
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 px-2.5">
                      <input
                        type="number"
                        min={1}
                        max={24}
                        value={br.branch.qty}
                        onChange={(e) => updateBranchField(idx, 'qty', Math.max(1, Number(e.target.value) || 1))}
                        className="w-12 px-1.5 py-1 rounded bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 tabular-nums font-bold"
                      />
                    </td>
                    <td className="py-2 px-2.5">
                      <input
                        type="number"
                        step="any"
                        min={0.01}
                        value={br.branch.capEach_uF}
                        onChange={(e) => updateBranchField(idx, 'capEach_uF', Math.max(0.001, Number(e.target.value) || 0.1))}
                        className="w-16 px-1.5 py-1 rounded bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 tabular-nums"
                      />
                      {br.mlccBiasDerate_pct > 1 && (
                        <div className="text-[9px] text-amber-600 dark:text-amber-400">
                          -{br.mlccBiasDerate_pct}% bias
                        </div>
                      )}
                    </td>
                    <td className="py-2 px-2.5">
                      <input
                        type="number"
                        step="0.1"
                        min={0.1}
                        value={br.branch.esrEach_mOhm}
                        onChange={(e) => updateBranchField(idx, 'esrEach_mOhm', Math.max(0.1, Number(e.target.value) || 1))}
                        className="w-14 px-1.5 py-1 rounded bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 tabular-nums"
                      />
                    </td>
                    <td className="py-2 px-2.5">
                      <input
                        type="number"
                        step="0.1"
                        min={0.2}
                        value={br.branch.eslEach_nH}
                        onChange={(e) => updateBranchField(idx, 'eslEach_nH', Math.max(0.2, Number(e.target.value) || 1))}
                        className="w-14 px-1.5 py-1 rounded bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 tabular-nums"
                      />
                    </td>
                    <td className="py-2 px-2.5">
                      <input
                        type="number"
                        min={10}
                        value={br.branch.vRated_V}
                        onChange={(e) => updateBranchField(idx, 'vRated_V', Math.max(10, Number(e.target.value) || 50))}
                        className="w-14 px-1.5 py-1 rounded bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 tabular-nums"
                      />
                      <div className={`text-[9px] ${br.voltageDerating_pct > 85 ? 'text-amber-600 dark:text-amber-400 font-bold' : 'text-slate-500'}`}>
                        {br.voltageDerating_pct.toFixed(0)}% V
                      </div>
                    </td>
                    <td className="py-2 px-2.5">
                      <input
                        type="number"
                        step="0.1"
                        min={0.1}
                        value={br.branch.iRmsEach_A}
                        onChange={(e) => updateBranchField(idx, 'iRmsEach_A', Math.max(0.1, Number(e.target.value) || 1))}
                        className="w-14 px-1.5 py-1 rounded bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 tabular-nums"
                      />
                    </td>
                    <td className="py-2 px-2.5 tabular-nums">
                      <div className="font-semibold text-cyan-600 dark:text-cyan-400">
                        {br.I_total_branch_A.toFixed(2)} A ({br.rippleShare_pct.toFixed(0)}%)
                      </div>
                      <div className={`text-[10px] ${
                        br.rippleUtilization_pct > 100
                          ? 'text-rose-600 dark:text-rose-400 font-bold'
                          : br.rippleUtilization_pct > 85
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-slate-500'
                      }`}>
                        {br.I_per_cap_A.toFixed(2)} A/ea ({br.rippleUtilization_pct.toFixed(0)}%)
                      </div>
                    </td>
                    <td className="py-2 px-2.5 tabular-nums">
                      <div>{br.T_hotspot_C.toFixed(1)}°C</div>
                      <div className="text-[10px] text-emerald-600 dark:text-emerald-400">
                        {(br.L10_life_hrs / 1000).toFixed(0)}k hrs
                      </div>
                    </td>
                    <td className="py-2 px-2.5 text-right">
                      <button
                        type="button"
                        disabled={activeHybridConfig.branches.length <= 1}
                        onClick={() => removeHybridBranch(idx)}
                        className="p-1 rounded text-slate-400 hover:text-rose-500 disabled:opacity-30 cursor-pointer"
                        title="Remove branch"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Hybrid Multi-Branch |Z(f)| Frequency Response & Anti-Resonance Chart */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
            <div className="xl:col-span-4 space-y-2 text-xs font-mono">
              <div className={`p-3 rounded-lg border ${
                hybridSol.status === 'critical'
                  ? 'border-rose-500/40 bg-rose-500/5 text-rose-700 dark:text-rose-300'
                  : hybridSol.status === 'warning'
                  ? 'border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-300'
                  : 'border-emerald-500/40 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300'
              }`}>
                <div className="font-bold uppercase text-[10px] mb-1">Hybrid Bank Engineering Audit</div>
                <div className="font-sans text-[11px] leading-relaxed">{hybridSol.statusReason}</div>
              </div>
              <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 space-y-1 text-[11px]">
                <div className="font-bold text-slate-700 dark:text-slate-200">Why Combine Electrolytic + MLCC?</div>
                <p className="font-sans text-slate-600 dark:text-slate-400 leading-relaxed">
                  Bulk Electrolytic/Polymer carries LF energy &amp; dampens LC resonances with its moderate ESR, while parallel MLCCs provide ~1 nH ESL shunting for fast switching edges. Always check the parallel anti-resonance peak between bulk ESL and MLCC C.
                </p>
              </div>
            </div>

            <div className="xl:col-span-8 bg-slate-50/40 dark:bg-slate-900/30 border border-slate-200 dark:border-slate-800 rounded-lg p-3">
              <InteractiveChart
                title={`Hybrid Parallel Bank Impedance |Z(f)| & Anti-Resonance (${hybridRole === 'dcdc-cin' ? 'C_in' : hybridRole === 'dcdc-cout' ? 'C_out' : 'C_DC'})`}
                subtitle={`Combined Bank |Z| vs Individual Branches · Switching Ripple Marker @ ${hybridConditions.fsw_kHz.toFixed(0)} kHz`}
                data={hybridImpedanceChartData}
                xKey="freq_kHz"
                xLabel="Frequency"
                xUnit="kHz"
                logX
                currentX={hybridConditions.fsw_kHz}
                currentXLabel={`f_rip=${hybridConditions.fsw_kHz.toFixed(0)}kHz`}
                series={[
                  { key: 'Z_total_mOhm', name: 'Combined Bank |Z|', unit: 'mΩ', color: '#06b6d4', axis: 'left' },
                  ...hybridSol.branches.map((br, i) => ({
                    key: `b${i}`,
                    name: `${br.branch.qty}× ${br.branch.label}`,
                    unit: 'mΩ',
                    color: ['#f59e0b', '#10b981', '#a855f7', '#ec4899'][i % 4],
                    axis: 'left' as const,
                    dashed: true,
                  })),
                ]}
              />
            </div>
          </div>
        </div>
      </div>

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
