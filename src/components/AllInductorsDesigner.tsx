import React, { useEffect, useMemo, useState } from 'react';
import { AcDcDesignState, DcDcDesignState } from '../data/databases';
import { AcDcResults } from '../engine/acdcEngine';
import { DcDcResults } from '../engine/dcdcEngine';
import {
  INDUCTOR_CORE_DATABASE,
  INDUCTOR_MATERIAL_DATABASE,
  MAGNET_WIRE_DATABASE,
} from '../data/passiveDatabase';
import {
  CircuitInductorRequirement,
  CustomInductorLocks,
  CustomInductorOverrides,
  CustomInductorSolution,
  InductorConductorForm,
  InductorOptGoal,
  InductorShapeFilter,
  PerInductorConfig,
  ReadyCotsInductorCandidate,
  extractCircuitInductors,
  rankInductorCoreMaterials,
  rankReadyCotsInductors,
  solveCustomInductorDesign,
} from '../engine/passiveDesignEngine';
import { synthesizeInductorAlertFixes } from '../engine/designFixSynthesizer';
import { InteractiveChart } from './InteractiveChart';
import { LockToggleButton } from './AutoSolverControls';
import { useDesignSolver } from './DesignSolverContext';
import {
  CheckCircle2,
  AlertTriangle,
  Package,
  Sliders,
  Layers,
  Search,
  Check,
  ArrowRightLeft,
  Magnet,
  Wrench,
  Info,
} from 'lucide-react';

interface AllInductorsDesignerProps {
  mode: 'dcdc' | 'acdc';
  dcdcState?: DcDcDesignState;
  dcdcRes?: DcDcResults;
  acdcState?: AcDcDesignState;
  acdcRes?: AcDcResults;
  requestedItemId?: string | null;
  jumpNonce?: number;
}

type BuildMode = 'custom' | 'ready';

const DEFAULT_LOCKS: CustomInductorLocks = {
  targetL_uH: false,
  coreId: false,
  materialId: false,
  turnsN: false,
  airGap_mm: false,
  wireAwg: false,
  parallelStrands: false,
  conductorForm: false,
};

// ============================================================================
// 2D SCALED WINDING CROSS-SECTION SVG (TOROID OR GAPPED FERRITE BOBBIN)
// ============================================================================
const InductorWindingDiagramSvg: React.FC<{ sol: CustomInductorSolution }> = ({ sol }) => {
  const { core, material, turnsN, parallelStrands, wire, airGap_mm, windowFill_pct } = sol;

  if (core.shape === 'toroid') {
    const cx = 140;
    const cy = 115;
    const outerR = Math.min(82, Math.max(52, core.od_or_A_mm * 1.05));
    const innerR = Math.max(24, outerR * (core.id_or_B_mm / core.od_or_A_mm));
    const wireVisR = Math.max(2.1, Math.min(5.2, wire.d_od_mm * Math.sqrt(parallelStrands) * 1.45));
    const numVisTurns = Math.min(turnsN, 48);

    const coreFill =
      material.category === 'nanocrystalline'
        ? '#0284c7'
        : material.category === 'high-flux'
        ? '#4f46e5'
        : material.category === 'sendust-koolmu'
        ? '#14171f'
        : '#64748b';

    return (
      <svg viewBox="0 0 280 230" className="w-full h-56 select-none">
        {/* Core Ring */}
        <circle
          cx={cx}
          cy={cy}
          r={outerR}
          fill={coreFill}
          fillOpacity={0.18}
          stroke={coreFill}
          strokeWidth={1.5}
        />
        <circle
          cx={cx}
          cy={cy}
          r={innerR}
          fill="currentColor"
          className="text-white dark:text-[#14171f]"
          stroke={coreFill}
          strokeWidth={1.5}
        />

        {/* Radial Copper Winding Turns */}
        {Array.from({ length: numVisTurns }).map((_, idx) => {
          const angle = (idx / numVisTurns) * Math.PI * 2;
          const rIn = innerR - wireVisR * 0.9;
          const rOut = outerR + wireVisR * 0.85;
          const x1 = cx + Math.cos(angle) * rIn;
          const y1 = cy + Math.sin(angle) * rIn;
          const x2 = cx + Math.cos(angle) * rOut;
          const y2 = cy + Math.sin(angle) * rOut;
          return (
            <g key={idx}>
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="#d97706"
                strokeWidth={wireVisR * 0.95}
                strokeLinecap="round"
                opacity={0.9}
              />
              <circle
                cx={x1}
                cy={y1}
                r={wireVisR * 0.65}
                fill="#f59e0b"
                stroke="#92400e"
                strokeWidth={0.4}
              />
            </g>
          );
        })}

        {/* Dimension Callouts */}
        <line x1={cx - outerR} y1={212} x2={cx + outerR} y2={212} stroke="#06b6d4" strokeWidth={1} />
        <text x={cx} y={224} textAnchor="middle" className="fill-cyan-600 dark:fill-cyan-400 font-mono text-[10px]">
          OD {core.od_or_A_mm} mm · ID {core.id_or_B_mm} mm · H {core.h_or_C_mm} mm
        </text>
        <text x={cx} y={cy - 4} textAnchor="middle" className="fill-slate-700 dark:fill-slate-200 font-mono text-[10px] font-semibold">
          {turnsN}T × {parallelStrands}×AWG{wire.awg}
        </text>
        <text x={cx} y={cy + 10} textAnchor="middle" className="fill-slate-500 font-mono text-[9px]">
          Fill {windowFill_pct.toFixed(1)}%
        </text>
      </svg>
    );
  }

  // Gapped Ferrite Bobbin Cross Section (Half-Window Symmetric View)
  const layers = Math.min(8, sol.layersEst);
  const perLayer = Math.min(18, sol.turnsPerLayer);
  const gapPx = Math.max(2, Math.min(16, airGap_mm * 5));

  return (
    <svg viewBox="0 0 280 230" className="w-full h-56 select-none">
      {/* Core Outer E/PQ Frame */}
      {/* Top & Bottom I/Yoke */}
      <rect x={28} y={24} width={224} height={24} rx={2} className="fill-slate-600/30 stroke-slate-500" strokeWidth={1.2} />
      <rect x={28} y={168} width={224} height={24} rx={2} className="fill-slate-600/30 stroke-slate-500" strokeWidth={1.2} />
      {/* Left & Right Outer Legs */}
      <rect x={28} y={48} width={20} height={120} className="fill-slate-600/30 stroke-slate-500" strokeWidth={1.2} />
      <rect x={232} y={48} width={20} height={120} className="fill-slate-600/30 stroke-slate-500" strokeWidth={1.2} />

      {/* Center Post Top & Bottom with Air Gap */}
      <rect
        x={116}
        y={48}
        width={48}
        height={60 - gapPx / 2}
        className="fill-slate-600/40 stroke-slate-500"
        strokeWidth={1.2}
      />
      <rect
        x={116}
        y={108 + gapPx / 2}
        width={48}
        height={60 - gapPx / 2}
        className="fill-slate-600/40 stroke-slate-500"
        strokeWidth={1.2}
      />

      {/* Air Gap Highlight */}
      <rect
        x={115}
        y={108 - gapPx / 2}
        width={50}
        height={gapPx}
        fill="#ef4444"
        fillOpacity={0.22}
        stroke="#ef4444"
        strokeDasharray="2 2"
        strokeWidth={1}
      />
      <text x={140} y={111} textAnchor="middle" className="fill-rose-600 dark:fill-rose-400 font-mono text-[9px] font-bold">
        lg={airGap_mm.toFixed(2)}mm
      </text>

      {/* Bobbin Wall */}
      <rect x={54} y={54} width={58} height={108} fill="none" stroke="#94a3b8" strokeWidth={1} />
      <rect x={168} y={54} width={58} height={108} fill="none" stroke="#94a3b8" strokeWidth={1} />

      {/* Copper Winding Turns Inside Both Window Halves */}
      {Array.from({ length: layers }).map((_, layIdx) =>
        Array.from({ length: perLayer }).map((__, tIdx) => {
          const r = Math.max(2.2, Math.min(4.8, 44 / Math.max(8, perLayer)));
          const y = 60 + tIdx * (96 / Math.max(1, perLayer));
          const xStep = sol.conductorForm === 'flat-ribbon' ? r * 1.55 : r * 2.15;
          const xLeft = 106 - layIdx * xStep;
          const xRight = 174 + layIdx * xStep;
          if (xLeft < 58 || xRight > 222) return null;
          if (sol.conductorForm === 'flat-ribbon') {
            const rectH = Math.max(2.6, Math.min(6.5, (96 / Math.max(1, perLayer)) * 0.72));
            const rectW = Math.max(3.2, r * 1.25);
            return (
              <g key={`${layIdx}-${tIdx}`}>
                <rect x={xLeft - rectW / 2} y={y - rectH / 2} width={rectW} height={rectH} rx={0.8} fill="#f59e0b" stroke="#92400e" strokeWidth={0.5} />
                <rect x={xRight - rectW / 2} y={y - rectH / 2} width={rectW} height={rectH} rx={0.8} fill="#f59e0b" stroke="#92400e" strokeWidth={0.5} />
              </g>
            );
          }
          return (
            <g key={`${layIdx}-${tIdx}`}>
              <circle cx={xLeft} cy={y} r={r} fill="#f59e0b" stroke="#92400e" strokeWidth={0.5} />
              <circle cx={xRight} cy={y} r={r} fill="#f59e0b" stroke="#92400e" strokeWidth={0.5} />
            </g>
          );
        })
      )}

      {/* Dimensions Footer */}
      <text x={140} y={208} textAnchor="middle" className="fill-cyan-600 dark:fill-cyan-400 font-mono text-[10px]">
        {core.od_or_A_mm} × {core.id_or_B_mm} × {core.h_or_C_mm} mm · bw={core.bw_mm}mm · hw={core.hw_mm}mm
      </text>
      <text x={140} y={222} textAnchor="middle" className="fill-slate-500 font-mono text-[9px]">
        {turnsN}T ({layers}L × {sol.turnsPerLayer}T/L · {sol.conductorForm === 'flat-ribbon' ? 'Flat' : 'Round'}) · Fill {windowFill_pct.toFixed(1)}%
      </text>
    </svg>
  );
};

// ============================================================================
// MAIN ALL-INDUCTORS DESIGN WORKBENCH
// ============================================================================
export const AllInductorsDesigner: React.FC<AllInductorsDesignerProps> = ({
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
    inductorConfigs: configs,
    updateInductorConfig,
  } = useDesignSolver();

  // Safe fallbacks in case only one stage props are passed
  const dummyDcdcState = dcdcState!;
  const dummyDcdcRes = dcdcRes!;
  const dummyAcdcState = acdcState!;
  const dummyAcdcRes = acdcRes!;

  const requirements = useMemo(
    () =>
      extractCircuitInductors(
        mode,
        dummyDcdcState,
        dummyDcdcRes,
        dummyAcdcState,
        dummyAcdcRes
      ),
    [mode, dummyDcdcState, dummyDcdcRes, dummyAcdcState, dummyAcdcRes]
  );

  const [selectedId, setSelectedId] = useState<string>(() => requirements[0]?.id || 'dcdc-out-choke');

  useEffect(() => {
    if (requestedItemId && requirements.some((r) => r.id === requestedItemId)) {
      setSelectedId(requestedItemId);
    }
  }, [requestedItemId, jumpNonce, requirements]);

  const activeReq = useMemo(
    () => requirements.find((r) => r.id === selectedId) || requirements[0],
    [requirements, selectedId]
  );

  const [cotsFilterMount, setCotsFilterMount] = useState<'ALL' | 'SMD' | 'THT'>('ALL');
  const [cotsSearch, setCotsSearch] = useState('');
  const [syncedNotice, setSyncedNotice] = useState<string | null>(null);
  const [optGoal, setOptGoal] = useState<InductorOptGoal>('balanced');
  const [shapeFilter, setShapeFilter] = useState<InductorShapeFilter>('all');

  const updateActiveCfg = (updater: (prev: PerInductorConfig) => PerInductorConfig) => {
    if (!activeReq) return;
    updateInductorConfig(activeReq.id, updater);
  };

  // Solve all circuit inductors for the overview matrix
  const allSolved = useMemo(() => {
    return requirements.map((req) => {
      const cfg = configs[req.id] || {
        buildMode: 'custom' as BuildMode,
        overrides: {},
        locks: { ...DEFAULT_LOCKS },
      };
      const customSol = solveCustomInductorDesign(req, cfg.overrides, cfg.locks);
      const cotsRanked = rankReadyCotsInductors(req, cfg.locks.targetL_uH ? cfg.overrides.targetL_uH : undefined);
      const equippedCots = cfg.equippedCotsKey
        ? cotsRanked.find((c) => `${c.part.id}|${c.seriesCount}x${c.parallelCount}` === cfg.equippedCotsKey) || cotsRanked[0]
        : cotsRanked[0];
      return { req, cfg, customSol, cotsRanked, equippedCots };
    });
  }, [requirements, configs]);

  const activeEntry = allSolved.find((e) => e.req.id === activeReq?.id) || allSolved[0];
  const activeCfg = activeEntry.cfg;
  const sol = activeEntry.customSol;
  const rankedCoreMats = useMemo(
    () =>
      rankInductorCoreMaterials(
        activeReq,
        optGoal,
        shapeFilter,
        activeCfg.locks.targetL_uH ? activeCfg.overrides.targetL_uH : undefined
      ),
    [activeReq, optGoal, shapeFilter, activeCfg.locks.targetL_uH, activeCfg.overrides.targetL_uH]
  );
  const cotsCandidates = useMemo(() => {
    return activeEntry.cotsRanked.filter((c) => {
      if (cotsFilterMount !== 'ALL' && c.part.mounting !== cotsFilterMount) return false;
      if (cotsSearch.trim()) {
        const q = cotsSearch.toLowerCase();
        return (
          c.part.mpn.toLowerCase().includes(q) ||
          c.part.manufacturer.toLowerCase().includes(q) ||
          (c.part.lcscPartNumber || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [activeEntry.cotsRanked, cotsFilterMount, cotsSearch]);

  const toggleLock = (k: keyof CustomInductorLocks) => {
    updateActiveCfg((prev) => ({
      ...prev,
      locks: { ...prev.locks, [k]: !prev.locks[k] },
      overrides: {
        ...prev.overrides,
        // Capture current auto value when locking so it freezes cleanly
        ...(k === 'coreId' && !prev.locks.coreId ? { coreId: sol.core.id } : {}),
        ...(k === 'materialId' && !prev.locks.materialId ? { materialId: sol.material.id } : {}),
        ...(k === 'turnsN' && !prev.locks.turnsN ? { turnsN: sol.turnsN } : {}),
        ...(k === 'airGap_mm' && !prev.locks.airGap_mm ? { airGap_mm: sol.airGap_mm } : {}),
        ...(k === 'wireAwg' && !prev.locks.wireAwg ? { wireAwg: sol.wire.awg } : {}),
        ...(k === 'parallelStrands' && !prev.locks.parallelStrands ? { parallelStrands: sol.parallelStrands } : {}),
        ...(k === 'conductorForm' && !prev.locks.conductorForm ? { conductorForm: sol.conductorForm } : {}),
        ...(k === 'targetL_uH' && !prev.locks.targetL_uH ? { targetL_uH: activeReq.targetL_uH } : {}),
      },
    }));
  };

  const setOverride = <K extends keyof CustomInductorOverrides>(
    k: K,
    val: CustomInductorOverrides[K],
    lockKey?: keyof CustomInductorLocks
  ) => {
    updateActiveCfg((prev) => ({
      ...prev,
      overrides: { ...prev.overrides, [k]: val },
      locks: lockKey ? { ...prev.locks, [lockKey]: true } : prev.locks,
    }));
  };

  const syncInductanceToCircuit = (L_uH: number, dcr_mOhm?: number, label?: string) => {
    const sync = activeReq.syncFieldL;
    if (!sync) return;
    const roundedL = Number(L_uH.toFixed(1));
    if (sync.domain === 'dcdc') {
      applyDcdcPatch({ [sync.key]: roundedL }, sync.key);
    } else {
      const patch: Partial<AcDcDesignState> = { [sync.key]: roundedL };
      if (sync.dcrKey && dcr_mOhm !== undefined) {
        patch[sync.dcrKey] = Number(dcr_mOhm.toFixed(1));
      }
      applyAcdcPatch(patch, sync.key);
    }
    setSyncedNotice(label || `Applied ${roundedL} µH to ${activeReq.designator}`);
    setTimeout(() => setSyncedNotice(null), 2600);
  };

  const handleEquipCots = (cand: ReadyCotsInductorCandidate) => {
    const key = `${cand.part.id}|${cand.seriesCount}x${cand.parallelCount}`;
    updateActiveCfg((prev) => ({
      ...prev,
      buildMode: 'ready',
      equippedCotsKey: key,
    }));
    if (activeReq.syncFieldL) {
      syncInductanceToCircuit(
        cand.eff_L_uH,
        cand.eff_DCR_mOhm,
        `Equipped ${cand.part.mpn} (${cand.eff_L_uH.toFixed(1)} µH, ${cand.eff_DCR_mOhm.toFixed(1)} mΩ)`
      );
    }
  };

  // Filtered cores matching selected material family
  const compatibleCores = useMemo(() => {
    const fam =
      sol.material.category === 'nanocrystalline'
        ? 'cm-toroid'
        : sol.material.category === 'ferrite'
        ? 'ferrite'
        : 'powder';
    return INDUCTOR_CORE_DATABASE.filter((c) => c.family === fam);
  }, [sol.material.category]);

  return (
    <div className="space-y-4">
      {/* 1. ALL INDUCTORS IN CIRCUIT OVERVIEW TABLE */}
      <div className="bg-white dark:bg-[#14171f] border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
        <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-[13px] font-medium text-slate-900 dark:text-[#eef0f5]">
              All Circuit Inductors — Magnetic &amp; COTS Design Matrix ({mode === 'dcdc' ? 'DC-DC Stage' : 'AC-DC PFC Stage'})
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              Select any inductor row to design complete custom core/turns/wire specs OR equip a ready off-the-shelf part
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
                <th className="py-2 px-3">Qty</th>
                <th className="py-2 px-3">Target L</th>
                <th className="py-2 px-3">I_pk / I_rms</th>
                <th className="py-2 px-3">Selected Build (Custom / Ready)</th>
                <th className="py-2 px-3">Winding / Package</th>
                <th className="py-2 px-3">B_pk / B_sat</th>
                <th className="py-2 px-3">Loss / ΔT</th>
                <th className="py-2 px-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800/70">
              {allSolved.map(({ req, cfg, customSol, equippedCots }) => {
                const isSelected = req.id === activeReq.id;
                const isReady = cfg.buildMode === 'ready' && equippedCots;
                const statusBad = isReady
                  ? equippedCots.fitStatus === 'undersized'
                  : customSol.satStatus === 'critical' || customSol.windowFitStatus === 'overflow';
                const statusWarn = isReady
                  ? equippedCots.fitStatus === 'acceptable'
                  : customSol.satStatus === 'warning' || customSol.windowFitStatus === 'tight';

                return (
                  <tr
                    key={req.id}
                    onClick={() => setSelectedId(req.id)}
                    className={`cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-blue-50/70 dark:bg-blue-950/25'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-900/40'
                    }`}
                  >
                    <td className="py-2.5 px-3">
                      <div className="font-semibold text-slate-900 dark:text-slate-100">
                        {req.designator}
                      </div>
                      <div className="text-[10px] font-sans text-slate-500 truncate max-w-[210px]">
                        {req.name}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 tabular-nums text-slate-700 dark:text-slate-300">
                      {req.quantity}×
                    </td>
                    <td className="py-2.5 px-3 tabular-nums font-semibold text-blue-600 dark:text-blue-400">
                      {req.targetL_uH >= 1000
                        ? `${(req.targetL_uH / 1000).toFixed(2)} mH`
                        : `${req.targetL_uH.toFixed(1)} µH`}
                    </td>
                    <td className="py-2.5 px-3 tabular-nums text-slate-700 dark:text-slate-300">
                      {req.I_pk_A.toFixed(1)}A / {req.I_rms_A.toFixed(1)}A
                    </td>
                    <td className="py-2.5 px-3">
                      {isReady ? (
                        <div>
                          <div className="font-semibold text-emerald-700 dark:text-emerald-400">
                            Ready: {equippedCots.part.mpn}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            {equippedCots.configLabel} · {equippedCots.eff_L_uH.toFixed(1)} µH
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div className="font-semibold text-slate-800 dark:text-slate-200">
                            Custom: {customSol.core.id.toUpperCase()}
                          </div>
                          <div className="text-[10px] text-slate-500 truncate max-w-[180px]">
                            {customSol.material.name}
                          </div>
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-3 tabular-nums text-slate-700 dark:text-slate-300">
                      {isReady
                        ? `${equippedCots.part.mounting} · ${equippedCots.part.dimensions_mm.split(' ')[0]}mm`
                        : `${customSol.turnsN}T · ${customSol.parallelStrands}×AWG${customSol.wire.awg}`}
                    </td>
                    <td className="py-2.5 px-3 tabular-nums">
                      {isReady
                        ? `Isat ${equippedCots.eff_I_sat_A.toFixed(0)}A (${equippedCots.Isat_margin_pct >= 0 ? '+' : ''}${equippedCots.Isat_margin_pct.toFixed(0)}%)`
                        : `${customSol.B_pk_T.toFixed(2)}T / ${customSol.B_sat_T.toFixed(2)}T (${customSol.satUtilization_pct.toFixed(0)}%)`}
                    </td>
                    <td className="py-2.5 px-3 tabular-nums">
                      {isReady
                        ? `${equippedCots.estCopperLoss_W.toFixed(1)} W (Cu)`
                        : `${customSol.P_total_W.toFixed(1)} W / +${customSol.deltaT_C.toFixed(0)}°C`}
                    </td>
                    <td className="py-2.5 px-3 font-sans font-medium">
                      {statusBad ? (
                        <span className="inline-flex items-center gap-1.5 text-rose-600 dark:text-rose-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                          Redesign
                        </span>
                      ) : statusWarn ? (
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

      {/* 2. SELECTED INDUCTOR WORKBENCH HEADER */}
      <div className="bg-white dark:bg-[#14171f] border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Magnet className="w-4 h-4 text-blue-500" />
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {activeReq.designator} — {activeReq.name} ({activeReq.quantity}× in circuit)
              </h3>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {activeReq.description} {activeReq.windingNote}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Workflow Switcher: Custom Winding vs Ready COTS */}
            <div className="inline-flex rounded-md border border-slate-200 dark:border-slate-700 overflow-hidden">
              <button
                type="button"
                onClick={() => updateActiveCfg((p) => ({ ...p, buildMode: 'custom' }))}
                className={`px-3 py-1.5 text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                  activeCfg.buildMode === 'custom'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Sliders className="w-3.5 h-3.5" />
                Custom Winding Design
              </button>
              <button
                type="button"
                onClick={() => updateActiveCfg((p) => ({ ...p, buildMode: 'ready' }))}
                className={`px-3 py-1.5 text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                  activeCfg.buildMode === 'ready'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Package className="w-3.5 h-3.5" />
                Ready Off-The-Shelf ({activeEntry.cotsRanked.length})
              </button>
            </div>

            {/* Apply Designed L & DCR back into Converter Solver */}
            {activeReq.syncFieldL && activeCfg.buildMode === 'custom' && (
              <button
                type="button"
                onClick={() => syncInductanceToCircuit(sol.L_at_Idc_uH, sol.R_dc_hot_mOhm)}
                className="px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                title="Push the actual biased inductance & DCR from your winding design back into the main converter solver"
              >
                <ArrowRightLeft className="w-3.5 h-3.5" />
                Apply L={sol.L_at_Idc_uH.toFixed(1)}µH to Circuit
              </button>
            )}
          </div>
        </div>

        {/* Electrical Spec Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 pt-2 border-t border-slate-200 dark:border-slate-800 text-xs font-mono">
          <div>
            <div className="text-[10px] text-slate-500 uppercase">Target L</div>
            <div className="font-semibold text-blue-600 dark:text-blue-400 tabular-nums">
              {sol.req.targetL_uH.toFixed(1)} µH
            </div>
          </div>
          <div>
            <div className="text-[10px] text-slate-500 uppercase">I_dc / I_rms</div>
            <div className="font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
              {activeReq.I_dc_A.toFixed(1)} / {activeReq.I_rms_A.toFixed(1)} A
            </div>
          </div>
          <div>
            <div className="text-[10px] text-slate-500 uppercase">I_pk (Sat Lim)</div>
            <div className="font-semibold text-amber-600 dark:text-amber-400 tabular-nums">
              {activeReq.I_pk_A.toFixed(1)} A
            </div>
          </div>
          <div>
            <div className="text-[10px] text-slate-500 uppercase">ΔI_pp @ f_rip</div>
            <div className="font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
              {activeReq.deltaI_pp_A.toFixed(2)} A · {activeReq.f_ripple_kHz.toFixed(0)}kHz
            </div>
          </div>
          <div>
            <div className="text-[10px] text-slate-500 uppercase">Skin Depth δ</div>
            <div className="font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
              {sol.skinDepth_mm.toFixed(3)} mm
            </div>
          </div>
          <div>
            <div className="text-[10px] text-slate-500 uppercase">Min Req Ap</div>
            <div className="font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
              {sol.Ap_required_cm4.toFixed(2)} cm⁴
            </div>
          </div>
          <div>
            <div className="text-[10px] text-slate-500 uppercase">Core Ap</div>
            <div
              className={`font-semibold tabular-nums ${
                sol.Ap_actual_cm4 >= sol.Ap_required_cm4
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-amber-600 dark:text-amber-400'
              }`}
            >
              {sol.Ap_actual_cm4.toFixed(2)} cm⁴
            </div>
          </div>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* MODE A: COMPLETE CUSTOM WINDING DESIGN (CORE, MATERIAL, N, WIRE)     */}
      {/* ==================================================================== */}
      {activeCfg.buildMode === 'custom' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
            {/* Left Controls: Lockable Engineering Design Knobs */}
            <div className="xl:col-span-5 bg-white dark:bg-[#14171f] border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
                <div className="text-xs font-mono font-bold uppercase text-blue-600 dark:text-blue-400">
                  Core, Turns &amp; Wire Synthesis (Lock / Auto)
                </div>
                <button
                  type="button"
                  onClick={() =>
                    updateActiveCfg((p) => ({
                      ...p,
                      locks: { ...DEFAULT_LOCKS },
                      overrides: {},
                    }))
                  }
                  className="text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                >
                  Auto-Solve All Optimal
                </button>
              </div>

              {/* 1. Core Material & Target L */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <div className="flex items-center justify-between gap-1 mb-0.5">
                    <span className="text-[11px] font-mono text-slate-500">Core Material</span>
                    <LockToggleButton
                      compact
                      locked={activeCfg.locks.materialId}
                      recentlyAutoUpdated={!activeCfg.locks.materialId}
                      onToggle={() => toggleLock('materialId')}
                      label="Core Material"
                    />
                  </div>
                  <select
                    value={sol.material.id}
                    onChange={(e) => setOverride('materialId', e.target.value, 'materialId')}
                    className={`w-full px-2 py-1.5 text-xs font-mono bg-slate-50 dark:bg-slate-900 border rounded ${
                      activeCfg.locks.materialId
                        ? 'border-amber-500/60'
                        : 'border-slate-300 dark:border-slate-700'
                    }`}
                  >
                    {INDUCTOR_MATERIAL_DATABASE.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} (µ={m.mu_i}, Bsat={m.Bsat_T}T)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between gap-1 mb-0.5">
                    <span className="text-[11px] font-mono text-slate-500">Target L (µH)</span>
                    <LockToggleButton
                      compact
                      locked={activeCfg.locks.targetL_uH}
                      recentlyAutoUpdated={!activeCfg.locks.targetL_uH}
                      onToggle={() => toggleLock('targetL_uH')}
                      label="Target Inductance"
                    />
                  </div>
                  <input
                    type="number"
                    step={0.5}
                    min={0.5}
                    value={activeCfg.locks.targetL_uH ? activeCfg.overrides.targetL_uH ?? activeReq.targetL_uH : activeReq.targetL_uH}
                    onChange={(e) =>
                      setOverride('targetL_uH', Math.max(0.5, Number(e.target.value)), 'targetL_uH')
                    }
                    className={`w-full px-2 py-1.5 text-xs font-mono tabular-nums bg-slate-50 dark:bg-slate-900 border rounded ${
                      activeCfg.locks.targetL_uH
                        ? 'border-amber-500/60'
                        : 'border-slate-300 dark:border-slate-700'
                    }`}
                  />
                </div>
              </div>

              {/* 2. Core Dimensions & Shape */}
              <div>
                <div className="flex items-center justify-between gap-1 mb-0.5">
                  <span className="text-[11px] font-mono text-slate-500">
                    Core Geometry &amp; Dimensions ({sol.core.shape.toUpperCase()})
                  </span>
                  <LockToggleButton
                    compact
                    locked={activeCfg.locks.coreId}
                    recentlyAutoUpdated={!activeCfg.locks.coreId}
                    onToggle={() => toggleLock('coreId')}
                    label="Core Size"
                  />
                </div>
                <select
                  value={sol.core.id}
                  onChange={(e) => setOverride('coreId', e.target.value, 'coreId')}
                  className={`w-full px-2 py-1.5 text-xs font-mono bg-slate-50 dark:bg-slate-900 border rounded ${
                    activeCfg.locks.coreId
                      ? 'border-amber-500/60'
                      : 'border-slate-300 dark:border-slate-700'
                  }`}
                >
                  {compatibleCores.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <div className="mt-1 text-[10px] font-mono text-slate-500 tabular-nums">
                  Ae={sol.core.Ae_mm2}mm² · le={sol.core.le_mm}mm · Aw={sol.core.Aw_mm2}mm² · Ve={(sol.core.Ve_mm3 / 1000).toFixed(1)}cm³ · MLT={sol.MLT_mm.toFixed(1)}mm
                </div>
              </div>

              {/* 3. Turns & Air Gap */}
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <div className="flex items-center justify-between gap-1 mb-0.5">
                    <span className="text-[11px] font-mono text-slate-500">Number of Turns (N)</span>
                    <LockToggleButton
                      compact
                      locked={activeCfg.locks.turnsN}
                      recentlyAutoUpdated={!activeCfg.locks.turnsN}
                      onToggle={() => toggleLock('turnsN')}
                      label="Turns N"
                    />
                  </div>
                  <input
                    type="number"
                    min={1}
                    max={400}
                    value={sol.turnsN}
                    onChange={(e) => setOverride('turnsN', Math.max(1, Math.round(Number(e.target.value))), 'turnsN')}
                    className={`w-full px-2 py-1 text-xs font-mono tabular-nums bg-slate-50 dark:bg-slate-900 border rounded ${
                      activeCfg.locks.turnsN
                        ? 'border-amber-500/60'
                        : 'border-emerald-500/60'
                    }`}
                  />
                  <input
                    type="range"
                    min={Math.max(2, Math.floor(sol.turnsN * 0.4))}
                    max={Math.max(25, Math.ceil(sol.turnsN * 1.8))}
                    value={sol.turnsN}
                    onChange={(e) => setOverride('turnsN', Math.max(1, Number(e.target.value)), 'turnsN')}
                    className="w-full mt-1 h-1.5 accent-blue-500 cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between gap-1 mb-0.5">
                    <span className="text-[11px] font-mono text-slate-500">
                      {sol.material.category === 'ferrite' ? 'Center Gap lg (mm)' : 'Effective AL (nH/T²)'}
                    </span>
                    {sol.material.category === 'ferrite' && (
                      <LockToggleButton
                        compact
                        locked={activeCfg.locks.airGap_mm}
                        recentlyAutoUpdated={!activeCfg.locks.airGap_mm}
                        onToggle={() => toggleLock('airGap_mm')}
                        label="Air Gap"
                      />
                    )}
                  </div>
                  {sol.material.category === 'ferrite' ? (
                    <>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          step={0.05}
                          min={0.05}
                          max={8}
                          value={sol.airGap_mm}
                          onChange={(e) => setOverride('airGap_mm', Math.max(0.05, Number(e.target.value)), 'airGap_mm')}
                          className={`w-full px-2 py-1 text-xs font-mono tabular-nums bg-slate-50 dark:bg-slate-900 border rounded ${
                            activeCfg.locks.airGap_mm
                              ? 'border-amber-500/60'
                              : 'border-emerald-500/60'
                          }`}
                        />
                        {activeCfg.locks.airGap_mm && (
                          <button
                            type="button"
                            onClick={() =>
                              updateActiveCfg((prev) => ({
                                ...prev,
                                locks: { ...prev.locks, airGap_mm: false },
                                overrides: { ...prev.overrides, airGap_mm: undefined },
                              }))
                            }
                            className="px-1.5 py-1 text-[10px] font-mono bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded text-blue-700 dark:text-blue-300 whitespace-nowrap cursor-pointer"
                            title="Recompute optimal air gap for target inductance"
                          >
                            Auto
                          </button>
                        )}
                      </div>
                      <input
                        type="range"
                        step={0.05}
                        min={0.05}
                        max={4.5}
                        value={Math.min(4.5, sol.airGap_mm)}
                        onChange={(e) => setOverride('airGap_mm', Math.max(0.05, Number(e.target.value)), 'airGap_mm')}
                        className="w-full mt-1 h-1.5 accent-blue-500 cursor-pointer"
                      />
                      <div className="text-[10px] font-mono text-slate-500 mt-0.5 tabular-nums">
                        Fringing F = {sol.fringingFactor.toFixed(2)}× · P_gap = {sol.P_gap_fringing_W.toFixed(2)}W
                      </div>
                    </>
                  ) : (
                    <div className="px-2 py-1 text-xs font-mono tabular-nums bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded text-slate-700 dark:text-slate-300">
                      {sol.AL_0_nH.toFixed(0)} nH/N² (Distributed)
                    </div>
                  )}
                </div>
              </div>

              {/* 4. Wire Thickness (AWG), Parallel Strands & Litz Option */}
              <div className="grid grid-cols-2 gap-2.5 pt-2 border-t border-slate-200 dark:border-slate-800">
                <div>
                  <div className="flex items-center justify-between gap-1 mb-0.5">
                    <span className="text-[11px] font-mono text-slate-500">Wire Gauge (AWG)</span>
                    <LockToggleButton
                      compact
                      locked={activeCfg.locks.wireAwg}
                      recentlyAutoUpdated={!activeCfg.locks.wireAwg}
                      onToggle={() => toggleLock('wireAwg')}
                      label="Wire AWG"
                    />
                  </div>
                  <select
                    value={sol.wire.awg}
                    onChange={(e) => setOverride('wireAwg', Number(e.target.value), 'wireAwg')}
                    className={`w-full px-2 py-1.5 text-xs font-mono bg-slate-50 dark:bg-slate-900 border rounded ${
                      activeCfg.locks.wireAwg
                        ? 'border-amber-500/60'
                        : 'border-emerald-500/60'
                    }`}
                  >
                    {MAGNET_WIRE_DATABASE.map((w) => (
                      <option key={w.awg} value={w.awg}>
                        AWG {w.awg} ({w.d_bare_mm.toFixed(2)}mm · {w.area_mm2.toFixed(2)}mm²)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between gap-1 mb-0.5">
                    <span className="text-[11px] font-mono text-slate-500">Strands in Hand</span>
                    <LockToggleButton
                      compact
                      locked={activeCfg.locks.parallelStrands}
                      recentlyAutoUpdated={!activeCfg.locks.parallelStrands}
                      onToggle={() => toggleLock('parallelStrands')}
                      label="Parallel Strands"
                    />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min={1}
                      max={30}
                      value={sol.parallelStrands}
                      onChange={(e) =>
                        setOverride('parallelStrands', Math.max(1, Math.round(Number(e.target.value))), 'parallelStrands')
                      }
                      className={`w-full px-2 py-1 text-xs font-mono tabular-nums bg-slate-50 dark:bg-slate-900 border rounded ${
                        activeCfg.locks.parallelStrands
                          ? 'border-amber-500/60'
                          : 'border-emerald-500/60'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setOverride('useLitz', !sol.useLitz)}
                      className={`px-2 py-1 text-[11px] font-mono rounded border whitespace-nowrap cursor-pointer ${
                        sol.useLitz
                          ? 'bg-blue-600/15 border-blue-500 text-blue-700 dark:text-blue-300 font-semibold'
                          : 'bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                      }`}
                      title="Switch between solid magnet wire strands and AWG 38 HF Litz bundle"
                    >
                      {sol.useLitz ? 'Litz ON' : 'Solid'}
                    </button>
                  </div>
                  <div className="text-[10px] font-mono text-slate-500 mt-1 tabular-nums">
                    Total Cu: {sol.copperAreaTotal_mm2.toFixed(2)} mm² · J = {sol.J_rms_A_mm2.toFixed(2)} A/mm²
                  </div>
                </div>
              </div>

              {/* 5. Conductor Packing Form (Round vs Side-by-Side Flat Ribbon) */}
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between gap-1 mb-0.5">
                  <span className="text-[11px] font-mono text-slate-500">Conductor Form &amp; Window Packing</span>
                  <LockToggleButton
                    compact
                    locked={activeCfg.locks.conductorForm}
                    recentlyAutoUpdated={!activeCfg.locks.conductorForm}
                    onToggle={() => toggleLock('conductorForm')}
                    label="Conductor Form"
                  />
                </div>
                <select
                  value={activeCfg.locks.conductorForm ? activeCfg.overrides.conductorForm ?? sol.conductorForm : 'auto'}
                  onChange={(e) => {
                    const val = e.target.value as InductorConductorForm;
                    if (val === 'auto') {
                      updateActiveCfg((p) => ({
                        ...p,
                        locks: { ...p.locks, conductorForm: false },
                        overrides: { ...p.overrides, conductorForm: 'auto' },
                      }));
                    } else {
                      setOverride('conductorForm', val, 'conductorForm');
                    }
                  }}
                  className={`w-full px-2 py-1.5 text-xs font-mono bg-slate-50 dark:bg-slate-900 border rounded ${
                    activeCfg.locks.conductorForm
                      ? 'border-amber-500/60'
                      : 'border-emerald-500/60'
                  }`}
                >
                  <option value="auto">Auto (Optimal Round / Flat-Ribbon)</option>
                  <option value="flat-ribbon">Side-by-Side Flat Ribbon Strands</option>
                  <option value="round">Round Wire Bundle</option>
                </select>
              </div>
            </div>

            {/* Middle: 2D Scaled Cross-Section + Winding House Spec Sheet */}
            <div className="xl:col-span-4 bg-white dark:bg-[#14171f] border border-slate-200 dark:border-slate-800 rounded-lg p-4 flex flex-col justify-between">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2 mb-2">
                <span className="text-xs font-mono font-bold uppercase text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5" /> Scaled Geometry &amp; Winding Cross-Section
                </span>
                <span
                  className={`text-[11px] font-mono font-semibold tabular-nums ${
                    sol.windowFitStatus === 'overflow'
                      ? 'text-rose-600 dark:text-rose-400'
                      : sol.windowFitStatus === 'tight'
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-emerald-600 dark:text-emerald-400'
                  }`}
                >
                  {sol.windowFitStatus === 'overflow'
                    ? `Fill ${sol.windowFill_pct.toFixed(1)}% (Overflow)`
                    : sol.windowFitStatus === 'tight'
                    ? `Fill ${sol.windowFill_pct.toFixed(1)}% (Tight)`
                    : `Fill ${sol.windowFill_pct.toFixed(1)}% (OK)`}
                </span>
              </div>

              <InductorWindingDiagramSvg sol={sol} />

              <div className="border-t border-slate-200 dark:border-slate-800 pt-2.5 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] font-mono">
                <div className="flex justify-between">
                  <span className="text-slate-500">Wire Build:</span>
                  <span className="text-slate-900 dark:text-slate-100 font-semibold">
                    {sol.useLitz
                      ? `Litz Eq. ${sol.copperAreaTotal_mm2.toFixed(1)}mm²`
                      : `${sol.parallelStrands}× AWG${sol.wire.awg}`}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Wire Length:</span>
                  <span className="text-slate-900 dark:text-slate-100 tabular-nums">{sol.wireLength_m.toFixed(2)} m</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Layers / Radial:</span>
                  <span className="text-slate-900 dark:text-slate-100 tabular-nums">
                    {sol.layersEst}L ({sol.radialBuild_mm.toFixed(1)}/{sol.radialMax_mm.toFixed(1)}mm)
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Window Used:</span>
                  <span className="text-slate-900 dark:text-slate-100 tabular-nums">
                    {sol.copperSumArea_mm2.toFixed(0)}/{sol.maxSafeArea_mm2.toFixed(0)} mm²
                  </span>
                </div>
              </div>
            </div>

            {/* Right: Magnetic Flux, Losses, Saturation & Thermal Telemetry */}
            <div className="xl:col-span-3 bg-white dark:bg-[#14171f] border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-2.5">
              <div className="text-xs font-mono font-bold uppercase text-blue-600 dark:text-blue-400 border-b border-slate-200 dark:border-slate-800 pb-2">
                Electromagnetic &amp; Thermal Verification
              </div>

              {/* Saturation Guardrail Box */}
              <div
                className={`p-2.5 rounded border text-xs ${
                  sol.satStatus === 'critical'
                    ? 'bg-rose-50 dark:bg-rose-950/30 border-rose-500/60 text-rose-800 dark:text-rose-200'
                    : sol.satStatus === 'warning'
                    ? 'bg-amber-50 dark:bg-amber-950/25 border-amber-500/60 text-amber-800 dark:text-amber-200'
                    : 'bg-emerald-50/70 dark:bg-emerald-950/20 border-emerald-500/40 text-emerald-800 dark:text-emerald-200'
                }`}
              >
                <div className="font-semibold flex items-center gap-1.5">
                  {sol.satStatus === 'ok' ? (
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  )}
                  <span>
                    B_pk = {(sol.B_pk_T * 1000).toFixed(0)} mT / {(sol.B_sat_T * 1000).toFixed(0)} mT
                  </span>
                </div>
                <div className="text-[11px] font-mono tabular-nums mt-0.5">
                  Sat Margin: {sol.satMargin_pct.toFixed(1)}% · ΔB={(sol.deltaB_pp_T * 1000).toFixed(1)} mT
                </div>
                {(sol.satStatus !== 'ok' || sol.T_hotspot_C > 105) && (() => {
                  const quickFixes = synthesizeInductorAlertFixes(activeReq, sol, activeCfg.overrides, activeCfg.locks);
                  if (quickFixes.length === 0) return null;
                  return (
                    <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-slate-200/70 dark:border-slate-800">
                      {quickFixes.map((qf) => (
                        <button
                          key={qf.id}
                          type="button"
                          onClick={() =>
                            updateActiveCfg((prev) => ({
                              ...prev,
                              overrides: { ...prev.overrides, ...(qf.inductorOverridesPatch || {}) },
                              locks: {
                                ...prev.locks,
                                ...(qf.inductorOverridesPatch?.coreId ? { coreId: true, turnsN: false } : {}),
                              },
                            }))
                          }
                          className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-semibold cursor-pointer inline-flex items-center gap-1"
                          title={qf.impact}
                        >
                          <Check className="w-2.5 h-2.5" /> {qf.label}
                        </button>
                      ))}
                    </div>
                  );
                })()}
              </div>

              <div className="space-y-1.5 text-xs font-mono">
                <div className="flex justify-between">
                  <span className="text-slate-500">L @ 0A (Zero Bias):</span>
                  <span className="font-semibold tabular-nums text-slate-900 dark:text-slate-100">{sol.L_0_uH.toFixed(1)} µH</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">L @ I_dc ({activeReq.I_dc_A.toFixed(1)}A):</span>
                  <span className="font-semibold tabular-nums text-blue-600 dark:text-blue-400">{sol.L_at_Idc_uH.toFixed(1)} µH</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">L @ I_pk ({activeReq.I_pk_A.toFixed(1)}A):</span>
                  <span className="font-semibold tabular-nums text-amber-600 dark:text-amber-400">
                    {sol.L_at_Ipk_uH.toFixed(1)} µH (-{sol.rollOffAtIpk_pct.toFixed(0)}%)
                  </span>
                </div>
                <div className="flex justify-between border-t border-slate-200 dark:border-slate-800 pt-1.5">
                  <span className="text-slate-500">DCR (20°C / 85°C):</span>
                  <span className="tabular-nums text-slate-900 dark:text-slate-100">
                    {sol.R_dc_20C_mOhm.toFixed(1)} / {sol.R_dc_hot_mOhm.toFixed(1)} mΩ
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Dowell AC Factor F_R:</span>
                  <span className="tabular-nums text-slate-900 dark:text-slate-100">
                    {sol.Fr_ac.toFixed(2)}× (R_ac={sol.R_ac_mOhm.toFixed(1)} mΩ)
                  </span>
                </div>
                <div className="flex justify-between border-t border-slate-200 dark:border-slate-800 pt-1.5">
                  <span className="text-slate-500">P_cu (DC + AC{sol.P_gap_fringing_W > 0.01 ? ' + Gap' : ''}):</span>
                  <span className="tabular-nums text-slate-900 dark:text-slate-100">
                    {sol.P_cu_dc_W.toFixed(2)} + {(sol.P_cu_ac_W + sol.P_gap_fringing_W).toFixed(2)} W
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">P_core (Steinmetz):</span>
                  <span className="tabular-nums text-slate-900 dark:text-slate-100">{sol.P_core_W.toFixed(2)} W</span>
                </div>
                {/* Loss Split Bar (Copper DC / Copper AC+Fringing / Core) */}
                {sol.P_total_W > 0.01 && (() => {
                  const tot = Math.max(0.01, sol.P_total_W);
                  const dcPct = (sol.P_cu_dc_W / tot) * 100;
                  const acPct = ((sol.P_cu_ac_W + sol.P_gap_fringing_W) / tot) * 100;
                  const corePct = (sol.P_core_W / tot) * 100;
                  return (
                    <div className="space-y-1 pt-0.5">
                      <div className="h-2 w-full rounded overflow-hidden flex bg-slate-200 dark:bg-slate-800">
                        <div style={{ width: `${dcPct}%` }} className="bg-amber-500" title={`Cu DC: ${dcPct.toFixed(0)}%`} />
                        <div style={{ width: `${acPct}%` }} className="bg-orange-500" title={`Cu AC+Gap: ${acPct.toFixed(0)}%`} />
                        <div style={{ width: `${corePct}%` }} className="bg-blue-500" title={`Core: ${corePct.toFixed(0)}%`} />
                      </div>
                      <div className="flex justify-between text-[10px] text-slate-500">
                        <span>Cu {((sol.P_cu_total_W / tot) * 100).toFixed(0)}%</span>
                        <span>Core {corePct.toFixed(0)}%</span>
                      </div>
                    </div>
                  );
                })()}
                <div className="flex justify-between font-bold border-t border-slate-200 dark:border-slate-800 pt-1.5">
                  <span className="text-slate-700 dark:text-slate-200">Total Loss / T_hot:</span>
                  <span
                    className={`tabular-nums ${
                      sol.T_hotspot_C > sol.material.maxTemp_C - 15
                        ? 'text-rose-600 dark:text-rose-400'
                        : 'text-emerald-600 dark:text-emerald-400'
                    }`}
                  >
                    {sol.P_total_W.toFixed(2)} W · {sol.T_hotspot_C.toFixed(1)}°C
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* MULTI-CORE × MATERIAL PARETO AUTO-RANKER */}
          <div className="bg-white dark:bg-[#14171f] border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-2.5">
              <div>
                <div className="text-xs font-mono font-bold uppercase text-blue-700 dark:text-blue-400">
                  Pareto Core × Material Auto-Ranker ({activeReq.designator})
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Evaluates every compatible core shape and magnetic alloy for {activeReq.targetL_uH} µH @ {activeReq.I_pk_A.toFixed(1)} A_pk, {activeReq.f_ripple_kHz.toFixed(0)} kHz.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 p-0.5 text-[10px] font-mono">
                  {(
                    [
                      { id: 'balanced', label: 'Balanced' },
                      { id: 'min-loss', label: 'Min Loss' },
                      { id: 'compact', label: 'Compact' },
                      { id: 'low-temp', label: 'Coolest' },
                    ] as { id: InductorOptGoal; label: string }[]
                  ).map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => setOptGoal(g.id)}
                      className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${
                        optGoal === g.id
                          ? 'bg-blue-600/20 text-blue-700 dark:text-blue-300 font-semibold'
                          : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                      }`}
                    >
                      {g.label}
                    </button>
                  ))}
                </div>
                <select
                  value={shapeFilter}
                  onChange={(e) => setShapeFilter(e.target.value as InductorShapeFilter)}
                  className="px-2 py-1 text-[11px] font-mono bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded text-slate-700 dark:text-slate-200"
                >
                  <option value="all">All Shapes</option>
                  <option value="toroid">Toroid</option>
                  <option value="pq">PQ Ferrite</option>
                  <option value="etd">ETD Ferrite</option>
                  <option value="ee">EE Ferrite</option>
                  <option value="rm">RM Ferrite</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs font-mono">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-[10px] uppercase text-slate-500">
                    <th className="py-1.5 px-2">Core &amp; Material</th>
                    <th className="py-1.5 px-2">Winding / Gap</th>
                    <th className="py-1.5 px-2">B_pk / Sat</th>
                    <th className="py-1.5 px-2">Fill %</th>
                    <th className="py-1.5 px-2">Cu / Core / Total</th>
                    <th className="py-1.5 px-2">T_hot</th>
                    <th className="py-1.5 px-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800/70">
                  {rankedCoreMats.map((row, idx) => {
                    const isEquipped =
                      row.core.id === sol.core.id && row.material.id === sol.material.id;
                    return (
                      <tr
                        key={`${row.core.id}-${row.material.id}`}
                        className={
                          isEquipped
                            ? 'bg-blue-500/10'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-900/50'
                        }
                      >
                        <td className="py-1.5 px-2">
                          <div className="font-semibold text-slate-900 dark:text-slate-100">
                            {idx === 0 ? '★ ' : ''}
                            {row.core.name.split(' (')[0]} · {row.material.name}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            Ve={(row.core.Ve_mm3 / 1000).toFixed(1)}cm³ · ~${row.core.approxCost_USD.toFixed(1)}
                          </div>
                        </td>
                        <td className="py-1.5 px-2 tabular-nums text-slate-700 dark:text-slate-300">
                          {row.sol.turnsN}T × {row.sol.parallelStrands}×AWG{row.sol.wire.awg}
                          {row.material.category === 'ferrite' ? ` (${row.sol.airGap_mm}mm gap)` : ''}
                        </td>
                        <td className="py-1.5 px-2 tabular-nums">
                          <span
                            className={
                              row.sol.satStatus === 'critical'
                                ? 'text-rose-600 dark:text-rose-400'
                                : row.sol.satStatus === 'warning'
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-emerald-600 dark:text-emerald-400'
                            }
                          >
                            {(row.sol.B_pk_T * 1000).toFixed(0)}mT ({row.sol.satUtilization_pct.toFixed(0)}%)
                          </span>
                        </td>
                        <td className="py-1.5 px-2 tabular-nums">
                          <span
                            className={
                              row.sol.windowFitStatus === 'overflow'
                                ? 'text-rose-600 dark:text-rose-400'
                                : row.sol.windowFitStatus === 'tight'
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-emerald-600 dark:text-emerald-400'
                            }
                          >
                            {row.sol.windowFill_pct.toFixed(1)}%
                          </span>
                        </td>
                        <td className="py-1.5 px-2 tabular-nums text-slate-700 dark:text-slate-300">
                          {row.sol.P_cu_total_W.toFixed(1)} / {row.sol.P_core_W.toFixed(1)} /{' '}
                          <strong className="text-slate-900 dark:text-slate-100">
                            {row.sol.P_total_W.toFixed(2)}W
                          </strong>
                        </td>
                        <td className="py-1.5 px-2 tabular-nums">
                          <span
                            className={
                              row.sol.T_hotspot_C > 110
                                ? 'text-rose-600 dark:text-rose-400'
                                : 'text-slate-700 dark:text-slate-200'
                            }
                          >
                            {row.sol.T_hotspot_C.toFixed(0)}°C
                          </span>
                        </td>
                        <td className="py-1.5 px-2 text-right">
                          <button
                            type="button"
                            onClick={() =>
                              updateActiveCfg((prev) => ({
                                ...prev,
                                overrides: {
                                  ...prev.overrides,
                                  coreId: row.core.id,
                                  materialId: row.material.id,
                                  turnsN: undefined,
                                  airGap_mm: undefined,
                                  wireAwg: undefined,
                                  parallelStrands: undefined,
                                },
                                locks: {
                                  ...prev.locks,
                                  coreId: true,
                                  materialId: true,
                                  turnsN: false,
                                  airGap_mm: false,
                                  wireAwg: false,
                                  parallelStrands: false,
                                },
                              }))
                            }
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold cursor-pointer ${
                              isEquipped
                                ? 'bg-blue-600 text-white'
                                : 'bg-slate-100 dark:bg-slate-800 hover:bg-emerald-600 hover:text-white text-slate-700 dark:text-slate-200'
                            }`}
                          >
                            {isEquipped ? 'Active' : 'Equip'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* INDUCTOR WINDOW FIT BUDGET & 1-CLICK FIX SOLVER */}
          <div className="bg-white dark:bg-[#14171f] border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-mono font-bold uppercase text-blue-700 dark:text-blue-400">
                <Wrench className="w-3.5 h-3.5" />
                <span>Inductor Window Fit Budget &amp; Packing Assistant</span>
              </div>
              <div className="flex items-center gap-3 text-xs font-mono tabular-nums text-slate-600 dark:text-slate-400">
                <span>
                  Cu + Insulation:{' '}
                  <strong className="text-slate-900 dark:text-slate-100">
                    {sol.copperSumArea_mm2.toFixed(0)} mm²
                  </strong>{' '}
                  / Safe {sol.maxSafeArea_mm2.toFixed(0)} mm² ({sol.maxSafeFill_pct}% max of {sol.core.Aw_mm2} mm²)
                </span>
                {sol.windowFixes.length > 0 && sol.windowFitStatus !== 'ok' && (
                  <button
                    type="button"
                    onClick={() =>
                      updateActiveCfg((prev) => ({
                        ...prev,
                        overrides: { ...prev.overrides, ...sol.windowFixes[0].patch },
                      }))
                    }
                    className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-semibold cursor-pointer"
                  >
                    Fit Window Automatically
                  </button>
                )}
              </div>
            </div>

            {(() => {
              const scaleMax = Math.max(sol.core.Aw_mm2, sol.copperSumArea_mm2);
              const cuPct = ((sol.rawCopperAreaTotal_mm2 / scaleMax) * 100).toFixed(1);
              const insPct = ((sol.insulationPackingArea_mm2 / scaleMax) * 100).toFixed(1);
              const safeLimPct = ((sol.maxSafeArea_mm2 / scaleMax) * 100).toFixed(1);
              return (
                <div className="relative h-5 w-full bg-slate-100 dark:bg-[#090a0d] border border-slate-200 dark:border-slate-800 rounded overflow-hidden flex">
                  <div
                    style={{ width: `${cuPct}%` }}
                    className="h-full bg-blue-600 flex items-center justify-center text-[10px] font-mono text-white font-semibold truncate px-1"
                    title={`Pure Copper Area: ${sol.rawCopperAreaTotal_mm2.toFixed(0)} mm²`}
                  >
                    Cu {sol.rawCopperAreaTotal_mm2.toFixed(0)}mm²
                  </div>
                  <div
                    style={{ width: `${insPct}%` }}
                    className="h-full bg-amber-500 flex items-center justify-center text-[10px] font-mono text-slate-950 font-semibold truncate px-1"
                    title={`Enamel & Air Packing Space: ${sol.insulationPackingArea_mm2.toFixed(0)} mm²`}
                  >
                    {sol.insulationPackingArea_mm2 >= 18 ? `+${sol.insulationPackingArea_mm2.toFixed(0)}` : ''}
                  </div>
                  <div
                    style={{ left: `${safeLimPct}%` }}
                    className="absolute top-0 bottom-0 w-0.5 bg-rose-600 dark:bg-rose-400 z-10"
                    title={`Max Safe Fill (${sol.maxSafeFill_pct}%) = ${sol.maxSafeArea_mm2.toFixed(0)} mm²`}
                  />
                </div>
              );
            })()}

            <div
              className={`flex items-start gap-2 px-3 py-2 rounded border text-xs ${
                sol.windowFitStatus === 'overflow'
                  ? 'bg-rose-50 dark:bg-rose-950/25 border-rose-300 dark:border-rose-500/40 text-rose-800 dark:text-rose-200'
                  : sol.windowFitStatus === 'tight'
                  ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-300 dark:border-amber-500/40 text-amber-800 dark:text-amber-200'
                  : 'bg-emerald-50/70 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-200'
              }`}
            >
              <Info className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{sol.fitDiagnostic}</span>
            </div>

            {sol.windowFixes.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 pt-0.5">
                {sol.windowFixes.slice(0, 3).map((fix) => (
                  <button
                    key={fix.id}
                    type="button"
                    onClick={() =>
                      updateActiveCfg((prev) => ({
                        ...prev,
                        overrides: { ...prev.overrides, ...fix.patch },
                        locks: {
                          ...prev.locks,
                          ...(fix.patch.coreId ? { coreId: true } : {}),
                          ...(fix.patch.conductorForm && fix.patch.conductorForm !== 'auto'
                            ? { conductorForm: true }
                            : {}),
                          ...(fix.patch.parallelStrands ? { parallelStrands: true } : {}),
                          ...(fix.patch.materialId ? { materialId: true } : {}),
                        },
                      }))
                    }
                    className="text-left p-2.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/50 hover:border-blue-500 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center justify-between gap-2 text-xs font-mono font-semibold text-slate-900 dark:text-slate-100">
                      <span>{fix.title}</span>
                      <span className="text-emerald-600 dark:text-emerald-400 tabular-nums">
                        → {fix.predictedFill_pct.toFixed(1)}%
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      {fix.detail}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 3. INTERACTIVE DC-BIAS & LOSS OPTIMIZATION CURVES */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <InteractiveChart
              title="DC-Bias Inductance Roll-Off L(I) & Peak Flux Density B_pk(I)"
              subtitle={`Shows soft saturation roll-off up to ${(activeReq.I_pk_A * 1.45).toFixed(1)}A · Target I_pk = ${activeReq.I_pk_A.toFixed(1)}A`}
              data={sol.biasCurve}
              xKey="I_A"
              xLabel="Bias / Peak Current"
              xUnit="A"
              currentX={activeReq.I_pk_A}
              currentXLabel={`I_pk=${activeReq.I_pk_A.toFixed(1)}A`}
              series={[
                { key: 'L_uH', name: 'Inductance L(I)', unit: 'µH', color: '#06b6d4', axis: 'left' },
                { key: 'B_pk_T', name: 'Flux Density B(I)', unit: 'T', color: '#f59e0b', axis: 'right' },
              ]}
              horizontalMarkers={[
                { value: sol.B_sat_T, label: `B_sat=${sol.B_sat_T}T`, color: '#ef4444', axis: 'right', dashed: true },
              ]}
            />

            <InteractiveChart
              title="Turns Optimization: Total Loss (P_cu + P_core) & B_pk vs Turns (N)"
              subtitle="Click any point on the curve to lock Number of Turns (N) at the loss minimum"
              data={sol.turnsSweep}
              xKey="N"
              xLabel="Turns N"
              xUnit="T"
              currentX={sol.turnsN}
              currentXLabel={`N=${sol.turnsN}T`}
              series={[
                { key: 'P_total_W', name: 'Total Loss P_tot', unit: 'W', color: '#10b981', axis: 'left' },
                { key: 'B_pk_mT', name: 'Peak Flux B_pk', unit: 'mT', color: '#f59e0b', axis: 'right' },
              ]}
              onPointClick={(xVal) => setOverride('turnsN', Math.max(2, Math.round(xVal)), 'turnsN')}
              clickActionHint="Click curve to lock Turns N"
            />
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODE B: CHOOSE READY OFF-THE-SHELF COMMERCIAL INDUCTOR (COTS)        */}
      {/* ==================================================================== */}
      {activeCfg.buildMode === 'ready' && (
        <div className="bg-white dark:bg-[#14171f] border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-xs font-mono font-bold uppercase text-blue-600 dark:text-blue-400">
                Off-The-Shelf Commercial Inductor Catalog Matcher ({activeReq.designator})
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Ranked automatically by required L={activeReq.targetL_uH.toFixed(1)}µH, I_rms≥{activeReq.I_rms_A.toFixed(1)}A, I_sat≥{activeReq.I_pk_A.toFixed(1)}A (auto-evaluates 1×, 2S, 2P arrays)
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search MPN / LCSC..."
                  value={cotsSearch}
                  onChange={(e) => setCotsSearch(e.target.value)}
                  className="pl-8 pr-2.5 py-1 text-xs font-mono bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded"
                />
              </div>

              <div className="inline-flex rounded border border-slate-200 dark:border-slate-700 overflow-hidden text-[11px] font-mono">
                {(['ALL', 'SMD', 'THT'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setCotsFilterMount(m)}
                    className={`px-2.5 py-1 cursor-pointer ${
                      cotsFilterMount === m
                        ? 'bg-blue-600 text-white font-semibold'
                        : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {cotsCandidates.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500">
              No single COTS inductor matched within range for {activeReq.targetL_uH.toFixed(1)} µH / {activeReq.I_pk_A.toFixed(1)} A. Use Custom Winding Design mode above.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs font-mono">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 bg-slate-50/40 dark:bg-slate-900/30">
                    <th className="py-2 px-3">MPN / Manufacturer / LCSC</th>
                    <th className="py-2 px-3">Array</th>
                    <th className="py-2 px-3">Eff. L (µH)</th>
                    <th className="py-2 px-3">I_rms Margin</th>
                    <th className="py-2 px-3">I_sat Margin</th>
                    <th className="py-2 px-3">DCR / P_cu</th>
                    <th className="py-2 px-3">Package (mm)</th>
                    <th className="py-2 px-3">Status</th>
                    <th className="py-2 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800/70">
                  {cotsCandidates.map((cand) => {
                    const key = `${cand.part.id}|${cand.seriesCount}x${cand.parallelCount}`;
                    const isEquipped = activeCfg.equippedCotsKey === key;
                    return (
                      <tr
                        key={key}
                        className={isEquipped ? 'bg-emerald-50/70 dark:bg-emerald-950/25' : 'hover:bg-slate-50 dark:hover:bg-slate-900/40'}
                      >
                        <td className="py-2.5 px-3">
                          <div className="font-semibold text-slate-900 dark:text-slate-100">{cand.part.mpn}</div>
                          <div className="text-[10px] text-slate-500">
                            {cand.part.manufacturer} · LCSC {cand.part.lcscPartNumber || '—'} · ${cand.estTotalCost_USD.toFixed(2)}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-slate-700 dark:text-slate-300">
                          {cand.configLabel}
                        </td>
                        <td className="py-2.5 px-3 tabular-nums">
                          <div className="font-semibold text-blue-600 dark:text-blue-400">{cand.eff_L_uH.toFixed(1)} µH</div>
                          <div className="text-[10px] text-slate-500">
                            {cand.L_error_pct >= 0 ? '+' : ''}
                            {cand.L_error_pct.toFixed(0)}% vs req
                          </div>
                        </td>
                        <td className="py-2.5 px-3 tabular-nums">
                          <div>{cand.eff_I_rms_A.toFixed(1)} A</div>
                          <div className={`text-[10px] ${cand.Irms_margin_pct < 0 ? 'text-rose-500' : 'text-emerald-600 dark:text-emerald-400'}`}>
                            {cand.Irms_margin_pct >= 0 ? '+' : ''}{cand.Irms_margin_pct.toFixed(0)}%
                          </div>
                        </td>
                        <td className="py-2.5 px-3 tabular-nums">
                          <div>{cand.eff_I_sat_A.toFixed(1)} A</div>
                          <div className={`text-[10px] ${cand.Isat_margin_pct < 0 ? 'text-rose-500' : 'text-emerald-600 dark:text-emerald-400'}`}>
                            {cand.Isat_margin_pct >= 0 ? '+' : ''}{cand.Isat_margin_pct.toFixed(0)}%
                          </div>
                        </td>
                        <td className="py-2.5 px-3 tabular-nums">
                          <div>{cand.eff_DCR_mOhm.toFixed(1)} mΩ</div>
                          <div className="text-[10px] text-slate-500">{cand.estCopperLoss_W.toFixed(2)} W Cu</div>
                        </td>
                        <td className="py-2.5 px-3 text-[11px] text-slate-600 dark:text-slate-300">
                          <div>{cand.part.mounting}</div>
                          <div className="text-[10px] text-slate-500">{cand.part.dimensions_mm}</div>
                        </td>
                        <td className="py-2.5 px-3 font-sans font-medium">
                          {cand.fitStatus === 'optimal' ? (
                            <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                              Optimal
                            </span>
                          ) : cand.fitStatus === 'acceptable' ? (
                            <span className="inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                              Tight
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-rose-600 dark:text-rose-400">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                              Undersized
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <button
                            type="button"
                            onClick={() => handleEquipCots(cand)}
                            className={`px-2.5 py-1 rounded text-xs font-medium inline-flex items-center gap-1 cursor-pointer transition-colors ${
                              isEquipped
                                ? 'bg-emerald-600 text-white'
                                : 'bg-blue-600 hover:bg-blue-500 text-white'
                            }`}
                          >
                            {isEquipped ? (
                              <>
                                <Check className="w-3 h-3" /> Equipped
                              </>
                            ) : (
                              'Equip Part'
                            )}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
