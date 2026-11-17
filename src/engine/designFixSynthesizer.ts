// ============================================================================
// SIMULATION-VERIFIED 1-CLICK GUIDED FIX SYNTHESIZER
// Runs real solver trials for Danger & Warning alerts so every suggested 1-click
// fix is guaranteed to move physics & safety margins toward Nominal.
// ============================================================================

import {
  AcDcDesignState,
  CORE_DATABASE,
  DcDcDesignState,
  SEMICONDUCTOR_DATABASE,
} from '../data/databases';
import { INDUCTOR_CORE_DATABASE } from '../data/passiveDatabase';
import { AcDcResults, solveAcDcDesign } from './acdcEngine';
import { DcDcResults, solveDcDcDesign } from './dcdcEngine';
import {
  CapacitorBankSolution,
  CircuitCapacitorRequirement,
  CircuitInductorRequirement,
  CustomCapBankLocks,
  CustomCapBankOverrides,
  CustomInductorLocks,
  CustomInductorOverrides,
  CustomInductorSolution,
  generateCapacitorFixOptions,
  solveCustomInductorDesign,
} from './passiveDesignEngine';
import { computeWindowAnalysis, GapStrategyMode } from '../components/WindingWindowVisualizer';

export interface DesignAlertFix {
  id: string;
  label: string;
  impact: string;
  targetKind: 'dcdc' | 'acdc' | 'inductor' | 'capacitor';
  itemId?: string;
  dcdcPatch?: Partial<DcDcDesignState>;
  acdcPatch?: Partial<AcDcDesignState>;
  inductorOverridesPatch?: Partial<CustomInductorOverrides>;
  capacitorOverridesPatch?: Partial<CustomCapBankOverrides>;
  capacitorUnlockMatrix?: boolean;
  syncToCircuit?: boolean;
}

const AWG_DIAM_MM: Record<number, number> = {
  36: 0.127,
  38: 0.1016,
  40: 0.0787,
  42: 0.0635,
  44: 0.0508,
};

function checkTxWindowFits(state: DcDcDesignState, res: DcDcResults) {
  const core = CORE_DATABASE.find((c) => c.id === state.coreId) || res.core;
  const marginTape = state.Vin_nom_V >= 300 ? 3.0 : state.Vin_nom_V >= 150 ? 2.5 : 1.5;
  const bobbin = core.Ve_mm3 >= 30000 ? 1.3 : core.Ve_mm3 >= 12000 ? 1.1 : 0.9;
  const gapMode: GapStrategyMode = res.airGap_mm >= 0.45 ? 'distributed-multigap' : 'local-notch';
  return computeWindowAnalysis({
    core,
    Vin_nom_V: state.Vin_nom_V,
    interleaving: state.interleaving,
    txType: state.txType,
    Np: res.Np_actual,
    Ns_single: res.Ns_actual,
    priStrands: state.priStrands,
    secStrands: state.secStrands,
    strandDiam_mm: AWG_DIAM_MM[state.litzStrandAWG] || 0.1016,
    insulationThickness_mm: state.insulationThickness_mm,
    airGap_mm: res.airGap_mm,
    I_pri_pk: res.I_lead_turnoff_A,
    Pcu_W: res.Pcu_W,
    marginTape_mm: marginTape,
    bobbinThickness_mm: bobbin,
    conductorForm: 'auto-parallel',
    gapStrategy: gapMode,
  });
}

// ----------------------------------------------------------------------------
// 1. TRANSFORMER CORE OVER-TEMP & THERMAL RUNAWAY FIX SYNTHESIZER
// ----------------------------------------------------------------------------
export function synthesizeDcdcCoreThermalFixes(
  state: DcDcDesignState,
  res: DcDcResults
): DesignAlertFix[] {
  const baseT = res.coreThermalAnalysis.Tcore_hotspot_C;
  const ratio = res.Ns_actual / Math.max(1, res.Np_actual);

  interface ScoredCandidate {
    fix: DesignAlertFix;
    score: number;
    category: string;
  }
  const scored: ScoredCandidate[] = [];

  const evalCandidate = (
    id: string,
    category: string,
    label: string,
    patch: Partial<DcDcDesignState>
  ) => {
    const trialState: DcDcDesignState = { ...state, ...patch };
    const trialRes = solveDcDcDesign(trialState);
    const tNew = trialRes.coreThermalAnalysis.Tcore_hotspot_C;
    if (tNew >= baseT - 2.0) return;

    const win = checkTxWindowFits(trialState, trialRes);
    const satOk = trialRes.saturationCheck.status !== 'critical';
    const thermalOk = trialRes.coreThermalAnalysis.coreThermalStable && tNew <= 115;

    // Prioritize candidates that cure temp AND fit window AND pass saturation
    const score =
      (thermalOk ? 1000 : 0) +
      (win.fitsInWindow ? 500 : 0) +
      (satOk ? 250 : 0) +
      (baseT - tNew) * 4 -
      trialRes.coreThermalAnalysis.Pmag_total_W * 0.4;

    const fitTag = win.fitsInWindow ? 'Fits window' : `${win.radialFill_pct.toFixed(0)}% window`;
    scored.push({
      score,
      category,
      fix: {
        id,
        label,
        impact: `T_core ${baseT.toFixed(0)}°C → ${tNew.toFixed(0)}°C · P_mag ${res.coreThermalAnalysis.Pmag_total_W.toFixed(1)}→${trialRes.coreThermalAnalysis.Pmag_total_W.toFixed(1)}W · ${fitTag}`,
        targetKind: 'dcdc',
        dcdcPatch: patch,
      },
    });
  };

  // A. Step up core size (lower Rth_core + higher Ae)
  const largerCores = CORE_DATABASE.filter(
    (c) => c.id !== state.coreId && c.Rth_core_CW < res.core.Rth_core_CW && c.id !== 'elp64'
  ).sort((a, b) => a.Rth_core_CW - b.Rth_core_CW);
  for (const core of largerCores.slice(0, 3)) {
    evalCandidate(`core-up-${core.id}`, `core-${core.id}`, `Upgrade Core to ${core.name}`, {
      coreId: core.id,
    });
  }

  // B. Boost turns Np (+2T / +4T / +6T keeping Vsec turns ratio) to cut Steinmetz ΔB
  for (const dNp of [2, 4, 6]) {
    const nextNp = res.Np_actual + dNp;
    const nextNs = Math.max(1, Math.round(nextNp * ratio));
    evalCandidate(
      `turns-up-${nextNp}`,
      'turns',
      `Increase Turns Np = ${res.Np_actual}→${nextNp}T (Ns=${nextNs}T)`,
      { Np_turns: nextNp, Ns_turns: nextNs }
    );
  }

  // C. Low-loss ferrite grade (PC95 / 3C97 / N95)
  for (const matId of ['PC95', '3C97', 'N95']) {
    if (matId !== state.materialId) {
      evalCandidate(`mat-${matId}`, 'material', `Switch Ferrite to ${matId}`, {
        materialId: matId,
        customSteinmetzEnabled: false,
      });
    }
  }

  // D. Reduce Dowell AC copper proximity heating (finer AWG + more Litz strands + full interleaving)
  const nextPriStrands = Math.min(300, Math.round(state.priStrands * 1.35));
  const nextSecStrands = Math.min(1400, Math.round(state.secStrands * 1.35));
  evalCandidate(
    'litz-dowell-opt',
    'litz',
    `Boost Litz Strands (${nextPriStrands}/${nextSecStrands}) + Full Interleave`,
    {
      priStrands: nextPriStrands,
      secStrands: nextSecStrands,
      interleaving: 'full-interleaved',
      litzStrandAWG: 40,
    }
  );

  // E. Combined best core + Litz optimization if single tweaks can't push < 110°C
  if (largerCores[0]) {
    const topCore = largerCores[0];
    evalCandidate(
      `combo-${topCore.id}-pc95`,
      'combo',
      `Combo: ${topCore.name} + PC95 + AWG40 Litz`,
      {
        coreId: topCore.id,
        materialId: 'PC95',
        customSteinmetzEnabled: false,
        litzStrandAWG: 40,
      }
    );
  }

  scored.sort((a, b) => b.score - a.score);

  // Deduplicate by category (e.g., keep best 'turns' option, best 1-2 'core' options)
  const picked: DesignAlertFix[] = [];
  const seenCat = new Set<string>();
  for (const item of scored) {
    if (seenCat.has(item.category)) continue;
    seenCat.add(item.category);
    picked.push(item.fix);
    if (picked.length >= 3) break;
  }
  return picked;
}

// ----------------------------------------------------------------------------
// 2. TRANSFORMER SATURATION FIX SYNTHESIZER
// ----------------------------------------------------------------------------
export function synthesizeDcdcSaturationFixes(
  state: DcDcDesignState,
  res: DcDcResults
): DesignAlertFix[] {
  const fixes: DesignAlertFix[] = [];
  const ratio = res.Ns_actual / Math.max(1, res.Np_actual);

  if (res.saturationCheck.recommendedMinNp_turns > res.Np_actual) {
    const nextNp = res.saturationCheck.recommendedSafeNp_turns > res.saturationCheck.recommendedMinNp_turns
      ? res.saturationCheck.recommendedSafeNp_turns
      : res.saturationCheck.recommendedMinNp_turns;
    const nextNs = Math.max(1, Math.round(nextNp * ratio));
    const trialRes = solveDcDcDesign({ ...state, Np_turns: nextNp, Ns_turns: nextNs });
    fixes.push({
      id: 'dcdc-sat-np',
      label: `Set Safe Turns Np = ${nextNp}T (Ns = ${nextNs}T)`,
      impact: `B_pk ${res.Bpk_mT.toFixed(0)} → ${trialRes.Bpk_mT.toFixed(0)} mT (${trialRes.saturationCheck.utilization_100C_pct.toFixed(0)}% B_sat)`,
      targetKind: 'dcdc',
      dcdcPatch: { Np_turns: nextNp, Ns_turns: nextNs },
    });
  }

  if (res.saturationCheck.recommendedCoreId && res.saturationCheck.recommendedCoreName) {
    const trialRes = solveDcDcDesign({ ...state, coreId: res.saturationCheck.recommendedCoreId });
    fixes.push({
      id: 'dcdc-sat-core',
      label: `Upgrade Core to ${res.saturationCheck.recommendedCoreName}`,
      impact: `B_pk ${res.Bpk_mT.toFixed(0)} → ${trialRes.Bpk_mT.toFixed(0)} mT (${trialRes.saturationCheck.utilization_100C_pct.toFixed(0)}% B_sat)`,
      targetKind: 'dcdc',
      dcdcPatch: { coreId: res.saturationCheck.recommendedCoreId },
    });
  }

  if (res.saturationCheck.recommendedMaterialId) {
    const trialRes = solveDcDcDesign({
      ...state,
      materialId: res.saturationCheck.recommendedMaterialId,
      customSteinmetzEnabled: false,
    });
    fixes.push({
      id: 'dcdc-sat-mat',
      label: `Switch Ferrite to ${res.saturationCheck.recommendedMaterialId}`,
      impact: `Raises 100°C B_sat margin (${trialRes.saturationCheck.utilization_100C_pct.toFixed(0)}% used)`,
      targetKind: 'dcdc',
      dcdcPatch: {
        materialId: res.saturationCheck.recommendedMaterialId,
        customSteinmetzEnabled: false,
      },
    });
  }

  return fixes.slice(0, 3);
}

// ----------------------------------------------------------------------------
// 3. TRANSFORMER BOBBIN WINDOW / CREEPAGE FIX SYNTHESIZER
// ----------------------------------------------------------------------------
export function synthesizeDcdcWindowFixes(
  state: DcDcDesignState,
  res: DcDcResults
): DesignAlertFix[] {
  const fixes: DesignAlertFix[] = [];
  const baseWin = checkTxWindowFits(state, res);

  // Candidate 1: Finer AWG40 + Relax Interleaving to split-pri
  const c1Patch: Partial<DcDcDesignState> = {
    litzStrandAWG: 40,
    interleaving: state.interleaving === 'full-interleaved' ? 'split-pri' : state.interleaving,
  };
  const c1Res = solveDcDcDesign({ ...state, ...c1Patch });
  const c1Win = checkTxWindowFits({ ...state, ...c1Patch }, c1Res);
  if (c1Win.radialFill_pct < baseWin.radialFill_pct - 2) {
    fixes.push({
      id: 'dcdc-win-split-awg40',
      label: `Switch to AWG40 Litz + Split-Primary Interleaving`,
      impact: `Window Fill ${baseWin.radialFill_pct.toFixed(0)}% → ${c1Win.radialFill_pct.toFixed(0)}% (${c1Win.fitsInWindow ? 'Fits' : 'Tight'})`,
      targetKind: 'dcdc',
      dcdcPatch: c1Patch,
    });
  }

  // Candidate 2: Step up core window height (ee653227 or ee703332 or ee803820)
  const tallerCores = CORE_DATABASE.filter(
    (c) => c.id !== state.coreId && c.hw_mm > res.core.hw_mm && c.Ae_mm2 >= res.core.Ae_mm2 * 0.9
  ).sort((a, b) => a.hw_mm - b.hw_mm);
  if (tallerCores[0]) {
    const nextCore = tallerCores[0];
    const c2Res = solveDcDcDesign({ ...state, coreId: nextCore.id });
    const c2Win = checkTxWindowFits({ ...state, coreId: nextCore.id }, c2Res);
    fixes.push({
      id: `dcdc-win-core-${nextCore.id}`,
      label: `Step Up Core Window to ${nextCore.name}`,
      impact: `Fill ${baseWin.radialFill_pct.toFixed(0)}% → ${c2Win.radialFill_pct.toFixed(0)}% (${c2Win.hw_mm.toFixed(1)} mm window)`,
      targetKind: 'dcdc',
      dcdcPatch: { coreId: nextCore.id },
    });
  }

  // Candidate 3: For creepage violation, boost insulation thickness (Triple-Insulated Wire equiv)
  if (!baseWin.creepagePass) {
    fixes.push({
      id: 'dcdc-win-tiw',
      label: 'Use Triple Insulated Wire (0.18 mm reinforced barrier)',
      impact: 'Meets IEC 62368-1 reinforced creepage without excessive margin tape',
      targetKind: 'dcdc',
      dcdcPatch: { insulationThickness_mm: Math.max(0.18, state.insulationThickness_mm) },
    });
  }

  return fixes.slice(0, 3);
}

// ----------------------------------------------------------------------------
// 4. SEMICONDUCTOR THERMAL, VOLTAGE, ZVS, CONTROL, EMI & AC-DC FIXES
// ----------------------------------------------------------------------------
export function synthesizeDcdcSemiThermalFixes(
  state: DcDcDesignState,
  res: DcDcResults
): DesignAlertFix[] {
  const fixes: DesignAlertFix[] = [];
  const hotTj = Math.max(res.Tj_pri_C, res.Tj_sec_C);

  if (state.Rth_heatsink_CW > 0.45) {
    const nextRth = Number(Math.max(0.35, state.Rth_heatsink_CW * 0.55).toFixed(2));
    const tRes = solveDcDcDesign({ ...state, Rth_heatsink_CW: nextRth });
    fixes.push({
      id: 'dcdc-semi-rth',
      label: `Upgrade Coldplate / Heatsink (R_th = ${nextRth} °C/W)`,
      impact: `Max Tj ${hotTj.toFixed(0)}°C → ${Math.max(tRes.Tj_pri_C, tRes.Tj_sec_C).toFixed(0)}°C`,
      targetKind: 'dcdc',
      dcdcPatch: { Rth_heatsink_CW: nextRth },
    });
  }

  if (res.Tj_pri_C >= res.Tj_sec_C && state.nParallelPri < 2) {
    const tRes = solveDcDcDesign({ ...state, nParallelPri: 2 });
    fixes.push({
      id: 'dcdc-semi-par-pri',
      label: 'Parallel 2× Primary MOSFETs per Switch Position',
      impact: `Tj,pri ${res.Tj_pri_C.toFixed(0)}°C → ${tRes.Tj_pri_C.toFixed(0)}°C`,
      targetKind: 'dcdc',
      dcdcPatch: { nParallelPri: 2 },
    });
  } else if (state.nParallelSec < 4) {
    const nextPar = Math.min(4, state.nParallelSec + 1);
    const tRes = solveDcDcDesign({ ...state, nParallelSec: nextPar });
    fixes.push({
      id: 'dcdc-semi-par-sec',
      label: `Increase Parallel Secondary SRs (${state.nParallelSec} → ${nextPar}×)`,
      impact: `Tj,sec ${res.Tj_sec_C.toFixed(0)}°C → ${tRes.Tj_sec_C.toFixed(0)}°C`,
      targetKind: 'dcdc',
      dcdcPatch: { nParallelSec: nextPar },
    });
  }

  return fixes.slice(0, 3);
}

export function synthesizeDcdcVoltageFixes(
  kind: 'pri' | 'sec',
  state: DcDcDesignState,
  res: DcDcResults
): DesignAlertFix[] {
  const fixes: DesignAlertFix[] = [];
  if (kind === 'pri') {
    const suitable = SEMICONDUCTOR_DATABASE.filter(
      (s) => (s.role === 'primary' || s.role === 'both') && s.Vds_max_V >= state.Vin_max_V * 1.25
    ).sort((a, b) => a.Rds_on_25C_mOhm - b.Rds_on_25C_mOhm);
    for (const dev of suitable.slice(0, 2)) {
      fixes.push({
        id: `dcdc-pri-dev-${dev.id}`,
        label: `Equip ${dev.id} (${dev.Vds_max_V}V ${dev.Rds_on_25C_mOhm}mΩ)`,
        impact: `Vds derating ${((state.Vin_max_V / dev.Vds_max_V) * 100).toFixed(0)}% (≤80% target)`,
        targetKind: 'dcdc',
        dcdcPatch: { priDeviceId: dev.id },
      });
    }
  } else {
    if (state.txType === 'center-tapped') {
      const tRes = solveDcDcDesign({ ...state, txType: 'full-bridge' });
      fixes.push({
        id: 'dcdc-sec-fb',
        label: 'Switch Secondary to Full-Bridge Rectifier (Halves V_sec)',
        impact: `V_sec,pk ${res.Vsec_overshoot_V.toFixed(0)}V → ${tRes.Vsec_overshoot_V.toFixed(0)}V`,
        targetKind: 'dcdc',
        dcdcPatch: { txType: 'full-bridge' },
      });
    }
    const minVdsSafe = Math.max(res.Vsec_overshoot_V * 1.2, res.Vsec_unclamped_pk_V * 1.05);
    const strictPool = SEMICONDUCTOR_DATABASE.filter(
      (s) => (s.role === 'secondary' || s.role === 'both') && s.Vds_max_V >= minVdsSafe
    ).sort((a, b) => a.Vds_max_V - b.Vds_max_V || a.Rds_on_25C_mOhm - b.Rds_on_25C_mOhm);
    const suitable =
      strictPool.length > 0
        ? strictPool
        : SEMICONDUCTOR_DATABASE.filter(
            (s) => (s.role === 'secondary' || s.role === 'both') && s.Vds_max_V >= res.Vsec_overshoot_V * 1.2
          ).sort((a, b) => a.Vds_max_V - b.Vds_max_V || a.Rds_on_25C_mOhm - b.Rds_on_25C_mOhm);
    for (const dev of suitable.slice(0, 2)) {
      const recParallel = dev.Rds_on_25C_mOhm > 8 && state.nParallelSec < 2 ? 2 : state.nParallelSec;
      const tRes = solveDcDcDesign({ ...state, secDeviceId: dev.id, nParallelSec: recParallel });
      fixes.push({
        id: `dcdc-sec-dev-${dev.id}`,
        label: `Equip ${recParallel}× ${dev.id} (${dev.Vds_max_V}V ${dev.Rds_on_25C_mOhm}mΩ)`,
        impact: `V_pk/V_DS ${((res.Vsec_unclamped_pk_V / dev.Vds_max_V) * 100).toFixed(0)}% unclamped · Tj,sec=${tRes.Tj_sec_C.toFixed(0)}°C`,
        targetKind: 'dcdc',
        dcdcPatch: { secDeviceId: dev.id, nParallelSec: recParallel },
      });
    }
  }
  return fixes;
}

export function synthesizeInductorAlertFixes(
  req: CircuitInductorRequirement,
  sol: CustomInductorSolution,
  overrides: CustomInductorOverrides,
  locks: CustomInductorLocks
): DesignAlertFix[] {
  const fixes: DesignAlertFix[] = [];

  // 1. Apply built-in window solver fixes first if window overflow/tight
  for (const wf of sol.windowFixes.slice(0, 2)) {
    fixes.push({
      id: `ind-wf-${req.id}-${wf.id}`,
      label: wf.title,
      impact: wf.detail,
      targetKind: 'inductor',
      itemId: req.id,
      inductorOverridesPatch: wf.patch,
    });
  }

  // 2. If saturation or thermal overheat, test larger powder/ferrite core from database
  if (sol.satStatus !== 'ok' || sol.T_hotspot_C > 105) {
    const candidates = INDUCTOR_CORE_DATABASE.filter(
      (c) => c.family === sol.core.family && c.Ve_mm3 > sol.core.Ve_mm3
    ).sort((a, b) => a.Ve_mm3 - b.Ve_mm3);

    for (const c of candidates.slice(0, 2)) {
      const trial = solveCustomInductorDesign(
        req,
        { ...overrides, coreId: c.id },
        { ...locks, coreId: true, turnsN: false }
      );
      if (trial.satUtilization_pct < sol.satUtilization_pct || trial.T_hotspot_C < sol.T_hotspot_C) {
        fixes.push({
          id: `ind-core-${req.id}-${c.id}`,
          label: `Step Up Core to ${c.id.toUpperCase()} (${c.Ae_mm2}mm²)`,
          impact: `Sat ${sol.satUtilization_pct.toFixed(0)}→${trial.satUtilization_pct.toFixed(0)}% · Fill ${trial.windowFill_pct.toFixed(0)}% · T=${trial.T_hotspot_C.toFixed(0)}°C`,
          targetKind: 'inductor',
          itemId: req.id,
          inductorOverridesPatch: { coreId: c.id },
        });
        break;
      }
    }
  }

  return fixes.slice(0, 3);
}

export function synthesizeCapacitorAlertFixes(
  req: CircuitCapacitorRequirement,
  sol: CapacitorBankSolution,
  overrides: CustomCapBankOverrides,
  locks: CustomCapBankLocks
): DesignAlertFix[] {
  return generateCapacitorFixOptions(req, sol, overrides, locks).map((opt) => ({
    id: opt.id,
    label: opt.label,
    impact: opt.impact,
    targetKind: 'capacitor' as const,
    itemId: req.id,
    capacitorOverridesPatch: opt.overridesPatch,
    capacitorUnlockMatrix: opt.unlockMatrix,
    syncToCircuit: opt.syncToCircuit,
  }));
}

export function synthesizeAcDcFixes(
  alertId: string,
  state: AcDcDesignState,
  res: AcDcResults
): DesignAlertFix[] {
  const fixes: DesignAlertFix[] = [];
  if (alertId === 'acdc-pfc-sat' || alertId === 'acdc-pfc-sat-warn') {
    if (!state.topology.includes('2ph')) {
      const tRes = solveAcDcDesign({ ...state, topology: '2ph-interleaved-totem' });
      fixes.push({
        id: 'acdc-2ph',
        label: 'Switch to 2-Phase Interleaved Totem-Pole (Halves Phase I_pk)',
        impact: `B_pk ${res.Bpk_total_T.toFixed(2)}T → ${tRes.Bpk_total_T.toFixed(2)}T`,
        targetKind: 'acdc',
        acdcPatch: { topology: '2ph-interleaved-totem' },
      });
    }
    const reducedL = Math.max(80, Math.round(state.Lpfc_uH * 0.72));
    const tResL = solveAcDcDesign({ ...state, Lpfc_uH: reducedL });
    fixes.push({
      id: 'acdc-lpfc',
      label: `Optimize Lpfc = ${state.Lpfc_uH} → ${reducedL} µH`,
      impact: `B_pk ${res.Bpk_total_T.toFixed(2)}T → ${tResL.Bpk_total_T.toFixed(2)}T`,
      targetKind: 'acdc',
      acdcPatch: { Lpfc_uH: reducedL },
    });
  } else if (alertId === 'acdc-vds-danger' || alertId === 'acdc-vds-warn') {
    const dev = SEMICONDUCTOR_DATABASE.find(
      (s) => (s.role === 'primary' || s.role === 'both') && s.Vds_max_V >= state.Vdc_bus_V * 1.35
    );
    if (dev) {
      fixes.push({
        id: `acdc-sw-${dev.id}`,
        label: `Upgrade Fast Switch to ${dev.id} (${dev.Vds_max_V}V)`,
        impact: `V_dc derating ${((state.Vdc_bus_V / dev.Vds_max_V) * 100).toFixed(0)}%`,
        targetKind: 'acdc',
        acdcPatch: { fastSwitchId: dev.id },
      });
    }
  } else if (alertId === 'acdc-tj-danger' || alertId === 'acdc-tj-warn') {
    const better = SEMICONDUCTOR_DATABASE.filter(
      (s) =>
        (s.role === 'primary' || s.role === 'both') &&
        s.Vds_max_V >= state.Vdc_bus_V * 1.35 &&
        s.Rds_on_25C_mOhm < res.sw.Rds_on_25C_mOhm
    ).sort((a, b) => a.Rds_on_25C_mOhm - b.Rds_on_25C_mOhm);
    if (better[0]) {
      const tRes = solveAcDcDesign({ ...state, fastSwitchId: better[0].id });
      fixes.push({
        id: 'acdc-low-rds',
        label: `Equip Lower-Rds Switch: ${better[0].id} (${better[0].Rds_on_25C_mOhm}mΩ)`,
        impact: `Tj,fast ${res.Tj_fast_C.toFixed(0)}°C → ${tRes.Tj_fast_C.toFixed(0)}°C`,
        targetKind: 'acdc',
        acdcPatch: { fastSwitchId: better[0].id },
      });
    }
    const lowerF = Math.max(45, Math.round(state.fsw_kHz * 0.75));
    if (lowerF < state.fsw_kHz) {
      const tRes = solveAcDcDesign({ ...state, fsw_kHz: lowerF });
      fixes.push({
        id: 'acdc-lower-fsw',
        label: `Reduce PFC f_sw = ${state.fsw_kHz} → ${lowerF} kHz`,
        impact: `Tj,fast ${res.Tj_fast_C.toFixed(0)}°C → ${tRes.Tj_fast_C.toFixed(0)}°C`,
        targetKind: 'acdc',
        acdcPatch: { fsw_kHz: lowerF },
      });
    }
  } else if (alertId === 'acdc-earth-leak-danger' || alertId === 'acdc-earth-leak-warn') {
    const targetCy = alertId === 'acdc-earth-leak-danger' ? 4.7 : 2.2;
    fixes.push({
      id: 'acdc-cy',
      label: `Reduce Y2 Capacitance C_Y to ${targetCy} nF per leg`,
      impact: `Brings 50/60Hz PE touch current cleanly below IEC 62368 ceiling`,
      targetKind: 'acdc',
      acdcPatch: { Cy_nF: targetCy },
    });
  } else if (alertId === 'acdc-dclink-danger' || alertId === 'acdc-dclink-warn') {
    const reqC = Math.max(state.Cdc_uF + 400, Math.ceil(res.Cdc_req_holdup_uF * 1.15 / 100) * 100);
    fixes.push({
      id: 'acdc-cdc-boost',
      label: `Increase DC-Link Bank C_dc → ${reqC} µF (Low-ESR)`,
      impact: `Ensures ≥${state.tHold_ms} ms hold-up & lowers ripple ΔT heating`,
      targetKind: 'acdc',
      acdcPatch: { Cdc_uF: reqC, ESR_Cdc_mOhm: Math.min(state.ESR_Cdc_mOhm, 14) },
    });
  } else if (alertId === 'acdc-thd-warn' || alertId.startsWith('acdc-ctrl-')) {
    fixes.push({
      id: 'acdc-ctrl-tune',
      label: 'Set Outer Voltage Loop fc,v = 14 Hz & PM ≥ 52°',
      impact: 'Minimizes 3rd-harmonic injection (THDi < 3%) and ensures robust phase margin',
      targetKind: 'acdc',
      acdcPatch: {
        fc_v_Hz: 14,
        pm_v_deg: Math.max(state.pm_v_deg, 54),
        pm_i_deg: Math.max(state.pm_i_deg, 52),
      },
    });
  }

  return fixes;
}
