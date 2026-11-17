// ============================================================================
// AGENTIC AI ENGINEER ENGINE
// Builds a complete telemetry snapshot across AC-DC PFC, Isolated DC-DC,
// Magnetics, Capacitor Banks, Small-Signal Control, & Active Alerts, and runs
// deterministic physics dry-runs on every AI-proposed fix before execution.
// ============================================================================

import {
  AcDcDesignState,
  CORE_DATABASE,
  DcDcDesignState,
  MATERIAL_DATABASE,
  SEMICONDUCTOR_DATABASE,
} from '../data/databases';
import {
  INDUCTOR_CORE_DATABASE,
  INDUCTOR_MATERIAL_DATABASE,
  READY_COTS_CAPACITORS,
} from '../data/passiveDatabase';
import { AcDcResults, solveAcDcDesign } from './acdcEngine';
import { DcDcResults, solveDcDcDesign, syncDcdcTurnsRatioState } from './dcdcEngine';
import {
  DesignAlertFix,
  DesignAlertItem,
  DesignAlertSummary,
  evaluateDesignAlerts,
} from './designAlerts';
import {
  CustomCapBankLocks,
  CustomCapBankOverrides,
  CustomInductorLocks,
  CustomInductorOverrides,
  PerCapConfig,
  PerInductorConfig,
  extractCircuitCapacitors,
  extractCircuitInductors,
  solveCapacitorBank,
  solveCustomInductorDesign,
} from './passiveDesignEngine';

const DEFAULT_IND_LOCKS: CustomInductorLocks = {
  targetL_uH: false,
  coreId: false,
  materialId: false,
  turnsN: false,
  airGap_mm: false,
  wireAwg: false,
  parallelStrands: false,
  conductorForm: false,
};

const DEFAULT_CAP_LOCKS: CustomCapBankLocks = {
  targetC_uF: false,
  partId: false,
  seriesCount: false,
  parallelCount: false,
};

export interface AiPatchPayload {
  targetKind: 'dcdc' | 'acdc' | 'inductor' | 'capacitor';
  alertFixId?: string;
  itemId?: string;
  dcdcPatch?: Partial<DcDcDesignState>;
  acdcPatch?: Partial<AcDcDesignState>;
  inductorOverridesPatch?: Partial<CustomInductorOverrides>;
  capacitorOverridesPatch?: Partial<CustomCapBankOverrides>;
  capacitorUnlockMatrix?: boolean;
  syncToCircuit?: boolean;
}

export interface AiProposedFixRaw {
  id: string;
  alertId: string;
  severity: 'danger' | 'warning' | 'optimization';
  domain: 'dcdc' | 'acdc';
  title: string;
  rationale: string;
  couplingNote: string;
  patchSummary: string;
  patch: AiPatchPayload;
}

export interface AiAgentServerResponse {
  mode: 'audit' | 'chat';
  overallVerdict: 'critical' | 'warning' | 'verified-safe';
  headline: string;
  executiveSummary: string;
  replyMarkdown?: string;
  proposedFixes: AiProposedFixRaw[];
}

export interface AiDryRunValidation {
  valid: boolean;
  validationError?: string;
  isSafeToAutoApply: boolean;
  alreadyResolved: boolean;
  dangerBefore: number;
  dangerAfter: number;
  warningBefore: number;
  warningAfter: number;
  targetAlertResolved: boolean;
  newDangersIntroduced: string[];
  physicsDeltas: string[];
  resolvedFix: DesignAlertFix | null;
}

export interface AiStagedFix extends AiProposedFixRaw {
  validation: AiDryRunValidation;
  skipped?: boolean;
  applied?: boolean;
}

export interface AiAppliedLogEntry {
  id: string;
  title: string;
  domain: 'dcdc' | 'acdc';
  severity: 'danger' | 'warning' | 'optimization';
  patchSummary: string;
  resultDelta: string;
  timestamp: string;
}

export interface DesignRollbackSnapshot {
  dcdcState: DcDcDesignState;
  acdcState: AcDcDesignState;
  inductorConfigs: Record<string, PerInductorConfig>;
  capacitorConfigs: Record<string, PerCapConfig>;
  label: string;
  timestamp: string;
}

export interface AiContextInputs {
  dcdcState: DcDcDesignState;
  dcdcRes: DcDcResults;
  acdcState: AcDcDesignState;
  acdcRes: AcDcResults;
  inductorConfigs: Record<string, PerInductorConfig>;
  capacitorConfigs: Record<string, PerCapConfig>;
  designAlerts: DesignAlertSummary;
}

export function computeDesignFingerprint(ctx: Pick<
  AiContextInputs,
  'dcdcState' | 'acdcState' | 'inductorConfigs' | 'capacitorConfigs'
>): string {
  return JSON.stringify({
    d: ctx.dcdcState,
    a: ctx.acdcState,
    i: ctx.inductorConfigs,
    c: ctx.capacitorConfigs,
  });
}

function solvePassiveRowsForContext(ctx: {
  dcdcState: DcDcDesignState;
  dcdcRes: DcDcResults;
  acdcState: AcDcDesignState;
  acdcRes: AcDcResults;
  inductorConfigs: Record<string, PerInductorConfig>;
  capacitorConfigs: Record<string, PerCapConfig>;
}) {
  const { dcdcState, dcdcRes, acdcState, acdcRes, inductorConfigs, capacitorConfigs } = ctx;

  const dcdcIndReqs = extractCircuitInductors('dcdc', dcdcState, dcdcRes, acdcState, acdcRes);
  const acdcIndReqs = extractCircuitInductors('acdc', dcdcState, dcdcRes, acdcState, acdcRes);
  const dcdcCapReqs = extractCircuitCapacitors('dcdc', dcdcState, dcdcRes, acdcState, acdcRes);
  const acdcCapReqs = extractCircuitCapacitors('acdc', dcdcState, dcdcRes, acdcState, acdcRes);

  const mapInd = (req: (typeof dcdcIndReqs)[number], domain: 'dcdc' | 'acdc') => {
    const cfg = inductorConfigs[req.id];
    const sol = solveCustomInductorDesign(
      req,
      cfg?.overrides || {},
      cfg?.locks || DEFAULT_IND_LOCKS
    );
    return { domain, req, sol };
  };

  const mapCap = (req: (typeof dcdcCapReqs)[number], domain: 'dcdc' | 'acdc') => {
    const cfg = capacitorConfigs[req.id];
    const sol = solveCapacitorBank(
      req,
      cfg?.overrides || {},
      cfg?.locks || DEFAULT_CAP_LOCKS
    );
    return { domain, req, sol };
  };

  return {
    inductors: [
      ...dcdcIndReqs.map((r) => mapInd(r, 'dcdc')),
      ...acdcIndReqs.map((r) => mapInd(r, 'acdc')),
    ],
    capacitors: [
      ...dcdcCapReqs.map((r) => mapCap(r, 'dcdc')),
      ...acdcCapReqs.map((r) => mapCap(r, 'acdc')),
    ],
  };
}

export function buildAiDesignSnapshot(
  ctx: AiContextInputs,
  opts?: { compactForChat?: boolean }
) {
  const { dcdcState, dcdcRes, acdcState, acdcRes, designAlerts } = ctx;
  const passives = solvePassiveRowsForContext(ctx);
  const compactForChat = Boolean(opts?.compactForChat);

  return {
    summaryCounts: {
      totalAlerts: designAlerts.all.length,
      dangerCount: designAlerts.danger.length,
      warningCount: designAlerts.warning.length,
    },
    dcdc: {
      state: {
        topology: dcdcState.topology,
        txType: dcdcState.txType,
        rectMode: dcdcState.rectMode,
        clampVariant: dcdcState.clampVariant,
        controlType: dcdcState.controlType,
        Vin_min_V: dcdcState.Vin_min_V,
        Vin_nom_V: dcdcState.Vin_nom_V,
        Vin_max_V: dcdcState.Vin_max_V,
        Vout_V: dcdcState.Vout_V,
        Pout_W: dcdcState.Pout_W,
        fsw_kHz: dcdcState.fsw_kHz,
        Tamb_C: dcdcState.Tamb_C,
        turnsRatio_n: dcdcState.turnsRatio_n,
        Llk_uH: dcdcState.Llk_uH,
        Lm_uH: dcdcState.Lm_uH,
        Cr_nF: dcdcState.Cr_nF,
        Lo_uH: dcdcState.Lo_uH,
        Co_uF: dcdcState.Co_uF,
        ESR_Co_mOhm: dcdcState.ESR_Co_mOhm,
        deadTime_ns: dcdcState.deadTime_ns,
        coreId: dcdcState.coreId,
        materialId: dcdcState.materialId,
        Np_turns: dcdcState.Np_turns,
        Ns_turns: dcdcState.Ns_turns,
        litzStrandAWG: dcdcState.litzStrandAWG,
        priStrands: dcdcState.priStrands,
        secStrands: dcdcState.secStrands,
        interleaving: dcdcState.interleaving,
        insulationThickness_mm: dcdcState.insulationThickness_mm,
        priDeviceId: dcdcState.priDeviceId,
        secDeviceId: dcdcState.secDeviceId,
        nParallelPri: dcdcState.nParallelPri,
        nParallelSec: dcdcState.nParallelSec,
        Rth_heatsink_CW: dcdcState.Rth_heatsink_CW,
        Rth_TIM_CW: dcdcState.Rth_TIM_CW,
        Tj_max_limit_C: dcdcState.Tj_max_limit_C ?? 125,
        fc_target_kHz: dcdcState.fc_target_kHz,
        pm_target_deg: dcdcState.pm_target_deg,
        slopeFactor_mc: dcdcState.slopeFactor_mc,
      },
      results: {
        Iout_total_A: Number(dcdcRes.Iout_total_A.toFixed(2)),
        Deff_nom: Number(dcdcRes.Deff_nom.toFixed(3)),
        Dloss_nom: Number(dcdcRes.Dloss_nom.toFixed(3)),
        zvsAchieved: dcdcRes.zvsAchieved,
        zvsEnergyRatio_pct: Number(dcdcRes.zvsEnergyRatio_pct.toFixed(1)),
        P_min_zvs_pct: Number(dcdcRes.P_min_zvs_pct.toFixed(1)),
        Vsec_ideal_max_V: Number(dcdcRes.Vsec_ideal_max_V.toFixed(1)),
        Vsec_unclamped_pk_V: Number(dcdcRes.Vsec_unclamped_pk_V.toFixed(1)),
        secDeviceVdsMax_V: dcdcRes.secDevice.Vds_max_V,
        priDeviceVdsMax_V: dcdcRes.priDevice.Vds_max_V,
        Np_actual: dcdcRes.Np_actual,
        Ns_actual: dcdcRes.Ns_actual,
        Bpk_mT: Number(dcdcRes.Bpk_mT.toFixed(1)),
        Bsat_100C_mT: Number(dcdcRes.saturationCheck.Bsat_100C_mT.toFixed(1)),
        satStatus: dcdcRes.saturationCheck.status,
        satUtil_100C_pct: Number(dcdcRes.saturationCheck.utilization_100C_pct.toFixed(1)),
        windowFill_pct: Number(dcdcRes.windowFill_pct.toFixed(1)),
        Pcore_W: Number(dcdcRes.Pcore_W.toFixed(2)),
        Pcu_W: Number(dcdcRes.Pcu_W.toFixed(2)),
        Tcore_hotspot_C: Number(dcdcRes.coreThermalAnalysis.Tcore_hotspot_C.toFixed(1)),
        coreThermalStable: dcdcRes.coreThermalAnalysis.coreThermalStable,
        Tj_pri_C: Number(dcdcRes.Tj_pri_C.toFixed(1)),
        Tj_sec_C: Number(dcdcRes.Tj_sec_C.toFixed(1)),
        thermalStable: dcdcRes.thermalStable,
        Ptotal_loss_W: Number(dcdcRes.Ptotal_loss_W.toFixed(1)),
        efficiency_pct: Number(dcdcRes.efficiency_pct.toFixed(2)),
        Vout_ripple_mVpp: Number(dcdcRes.Vout_ripple_mVpp.toFixed(1)),
        f0_lc_kHz: Number(dcdcRes.f0_lc_kHz.toFixed(2)),
        f_esr_kHz: Number(dcdcRes.f_esr_kHz.toFixed(1)),
        fc_actual_kHz: Number(dcdcRes.fc_actual_kHz.toFixed(2)),
        pm_actual_deg: Number(dcdcRes.pm_actual_deg.toFixed(1)),
        pm_wc_min_deg: Number(dcdcRes.pm_wc_min_deg.toFixed(1)),
        gm_actual_dB: Number(dcdcRes.gm_actual_dB.toFixed(1)),
        Qp_subharmonic: Number(dcdcRes.Qp_subharmonic.toFixed(2)),
        slopeStable: dcdcRes.slopeStable,
      },
    },
    acdc: {
      state: {
        topology: acdcState.topology,
        controlType: acdcState.controlType,
        Vac_rms_V: acdcState.Vac_rms_V,
        Vac_min_V: acdcState.Vac_min_V,
        Vac_max_V: acdcState.Vac_max_V,
        f_line_Hz: acdcState.f_line_Hz,
        Vdc_bus_V: acdcState.Vdc_bus_V,
        Pout_W: acdcState.Pout_W,
        fsw_kHz: acdcState.fsw_kHz,
        Lpfc_uH: acdcState.Lpfc_uH,
        Cdc_uF: acdcState.Cdc_uF,
        ESR_Cdc_mOhm: acdcState.ESR_Cdc_mOhm,
        tHold_ms: acdcState.tHold_ms,
        Vdc_min_hold_V: acdcState.Vdc_min_hold_V,
        fastSwitchId: acdcState.fastSwitchId,
        fc_i_kHz: acdcState.fc_i_kHz,
        pm_i_deg: acdcState.pm_i_deg,
        fc_v_Hz: acdcState.fc_v_Hz,
        pm_v_deg: acdcState.pm_v_deg,
        Cy_nF: acdcState.Cy_nF ?? 4.7,
        prechargeR_Ohm: acdcState.prechargeR_Ohm ?? 22,
      },
      results: {
        Iac_rms_max_A: Number(acdcRes.Iac_rms_max_A.toFixed(2)),
        Vdc_ripple_pp_V: Number(acdcRes.Vdc_ripple_pp_V.toFixed(1)),
        tHold_actual_ms: Number(acdcRes.tHold_actual_ms.toFixed(1)),
        Cdc_req_holdup_uF: Number(acdcRes.Cdc_req_holdup_uF.toFixed(0)),
        capHotspot_C: Number(acdcRes.capHotspot_C.toFixed(1)),
        capLife_years: Number(acdcRes.capLife_years.toFixed(1)),
        Tj_fast_C: Number(acdcRes.Tj_fast_C.toFixed(1)),
        Tcore_pfc_C: Number(acdcRes.Tcore_pfc_C.toFixed(1)),
        satStatus: acdcRes.saturationCheck.status,
        utilization_koolMu_pct: Number(acdcRes.saturationCheck.utilization_koolMu_pct.toFixed(1)),
        efficiency_pct: Number(acdcRes.efficiency_pct.toFixed(2)),
        THDi_est_pct: Number(acdcRes.THDi_est_pct.toFixed(2)),
        powerFactor_true: Number(acdcRes.powerFactor_true.toFixed(4)),
        earthLeakage_mA: Number(acdcRes.earthLeakage_mA.toFixed(2)),
        pm_i_actual_deg: Number(acdcRes.pm_i_actual_deg.toFixed(1)),
        pm_v_actual_deg: Number(acdcRes.pm_v_actual_deg.toFixed(1)),
        gm_i_dB: Number(acdcRes.gm_i_dB.toFixed(1)),
      },
    },
    inductors: passives.inductors.map(({ domain, req, sol }) => ({
      id: req.id,
      domain,
      designator: req.designator,
      name: req.name,
      targetL_uH: Number(req.targetL_uH.toFixed(1)),
      coreId: sol.core.id,
      coreName: sol.core.name,
      materialId: sol.material.id,
      materialName: sol.material.name,
      turnsN: sol.turnsN,
      satUtilization_pct: Number(sol.satUtilization_pct.toFixed(1)),
      satStatus: sol.satStatus,
      windowFill_pct: Number(sol.windowFill_pct.toFixed(1)),
      windowFitStatus: sol.windowFitStatus,
      T_hotspot_C: Number(sol.T_hotspot_C.toFixed(1)),
      P_total_W: Number(sol.P_total_W.toFixed(2)),
    })),
    capacitors: passives.capacitors.map(({ domain, req, sol }) => ({
      id: req.id,
      domain,
      designator: req.designator,
      name: req.name,
      targetC_uF: Number(req.targetC_uF.toFixed(2)),
      partId: sol.unitPart.id,
      mpn: sol.unitPart.mpn,
      matrix: `${sol.seriesCount}S × ${sol.parallelCount}P`,
      bank_C_uF: Number(sol.bank_C_uF.toFixed(2)),
      bank_ESR_mOhm: Number(sol.bank_ESR_mOhm.toFixed(2)),
      voltageDerating_pct: Number(sol.voltageDerating_pct.toFixed(1)),
      rippleUtilization_pct: Number(sol.rippleUtilization_pct.toFixed(1)),
      T_hotspot_C: Number(sol.T_hotspot_C.toFixed(1)),
      L10_life_years: Number(sol.L10_life_years.toFixed(1)),
      status: sol.status,
      statusReason: sol.statusReason,
    })),
    activeAlerts: designAlerts.all.map((a) => ({
      id: a.id,
      severity: a.severity,
      domain: a.domain,
      subTab: a.subTab,
      title: a.title,
      metric: a.metric,
      actionHint: a.actionHint,
      candidateFixes: (a.fixes || []).map((f) => ({
        alertFixId: f.id,
        label: f.label,
        impact: f.impact,
        targetKind: f.targetKind,
        itemId: f.itemId,
      })),
    })),
    catalogs: compactForChat
      ? {
          note: 'Compact ID list for chat mode',
          transformerCoreIds: CORE_DATABASE.map((c) => c.id),
          transformerMaterialIds: MATERIAL_DATABASE.map((m) => m.id),
          semiconductorIds: SEMICONDUCTOR_DATABASE.map((s) => `${s.id} (${s.Vds_max_V}V ${s.role})`),
          inductorCoreIds: INDUCTOR_CORE_DATABASE.slice(0, 20).map((c) => c.id),
          inductorMaterialIds: INDUCTOR_MATERIAL_DATABASE.map((m) => m.id),
          capacitorIds: READY_COTS_CAPACITORS.map((c) => `${c.id} (${c.mpn} ${c.V_rated_V}V)`),
        }
      : {
          transformerCores: CORE_DATABASE.map((c) => ({
            id: c.id,
            name: c.name,
            Ae_mm2: c.Ae_mm2,
            Ap_cm4: c.Ap_cm4,
            Rth_core_CW: c.Rth_core_CW,
          })),
          transformerMaterials: MATERIAL_DATABASE.map((m) => ({
            id: m.id,
            name: m.name,
            Bsat_100C_T: m.Bsat_100C_T,
            T_opt_C: m.T_opt_C,
          })),
          semiconductors: SEMICONDUCTOR_DATABASE.map((s) => ({
            id: s.id,
            name: s.name,
            tech: s.tech,
            role: s.role,
            Vds_max_V: s.Vds_max_V,
            Rds_on_25C_mOhm: s.Rds_on_25C_mOhm,
          })),
          inductorCores: INDUCTOR_CORE_DATABASE.slice(0, 30).map((c) => ({
            id: c.id,
            name: c.name,
            shape: c.shape,
            Ae_mm2: c.Ae_mm2,
            Aw_mm2: c.Aw_mm2,
          })),
          inductorMaterials: INDUCTOR_MATERIAL_DATABASE.map((m) => ({
            id: m.id,
            name: m.name,
            Bsat_T: m.Bsat_T,
          })),
          capacitors: READY_COTS_CAPACITORS.map((c) => ({
            id: c.id,
            mpn: c.mpn,
            dielectric: c.dielectric,
            dielectricLabel: c.dielectricLabel,
            C_uF: c.C_uF,
            V_rated_V: c.V_rated_V,
            I_rms_A: c.I_rms_A,
            ESR_mOhm: c.ESR_mOhm,
            isSafetyY: c.dielectric === 'y-safety',
            isSafetyX2: c.dielectric === 'x2-film',
          })),
        },
  };
}

function sanitizeDcdcPatch(raw: Partial<DcDcDesignState> | undefined): Partial<DcDcDesignState> | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const out: Partial<DcDcDesignState> = {};

  if (raw.coreId && CORE_DATABASE.some((c) => c.id === raw.coreId)) out.coreId = raw.coreId;
  if (raw.materialId && MATERIAL_DATABASE.some((m) => m.id === raw.materialId)) {
    out.materialId = raw.materialId;
    out.customSteinmetzEnabled = false;
  }
  if (raw.priDeviceId && SEMICONDUCTOR_DATABASE.some((s) => s.id === raw.priDeviceId)) {
    out.priDeviceId = raw.priDeviceId;
  }
  if (raw.secDeviceId && SEMICONDUCTOR_DATABASE.some((s) => s.id === raw.secDeviceId)) {
    out.secDeviceId = raw.secDeviceId;
  }

  const numField = <K extends keyof DcDcDesignState>(k: K, min: number, max: number) => {
    const val = raw[k];
    if (typeof val === 'number' && Number.isFinite(val)) {
      (out as Record<string, number>)[k as string] = Math.min(max, Math.max(min, val));
    }
  };

  numField('fsw_kHz', 35, 500);
  numField('turnsRatio_n', 1, 25);
  numField('Llk_uH', 0.5, 120);
  numField('Lm_uH', 40, 5000);
  numField('Cr_nF', 5, 2000);
  numField('Lo_uH', 1, 500);
  numField('Co_uF', 20, 20000);
  numField('ESR_Co_mOhm', 0.1, 100);
  numField('deadTime_ns', 20, 800);
  numField('Np_turns', 4, 80);
  numField('Ns_turns', 1, 40);
  numField('priStrands', 10, 800);
  numField('secStrands', 10, 1200);
  numField('insulationThickness_mm', 0.05, 1.5);
  numField('nParallelPri', 1, 6);
  numField('nParallelSec', 1, 8);
  numField('Rth_heatsink_CW', 0.1, 10);
  numField('Rth_TIM_CW', 0.05, 2.5);
  numField('fc_target_kHz', 0.5, 50);
  numField('pm_target_deg', 25, 85);
  numField('slopeFactor_mc', 1.0, 6.0);

  if (raw.litzStrandAWG === 38 || raw.litzStrandAWG === 40 || raw.litzStrandAWG === 42) {
    out.litzStrandAWG = raw.litzStrandAWG;
  }
  if (
    raw.interleaving === 'none' ||
    raw.interleaving === 'split-pri' ||
    raw.interleaving === 'full-interleaved'
  ) {
    out.interleaving = raw.interleaving;
  }

  return Object.keys(out).length > 0 ? out : undefined;
}

function sanitizeAcdcPatch(raw: Partial<AcDcDesignState> | undefined): Partial<AcDcDesignState> | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const out: Partial<AcDcDesignState> = {};

  if (raw.fastSwitchId && SEMICONDUCTOR_DATABASE.some((s) => s.id === raw.fastSwitchId)) {
    out.fastSwitchId = raw.fastSwitchId;
  }

  const numField = <K extends keyof AcDcDesignState>(k: K, min: number, max: number) => {
    const val = raw[k];
    if (typeof val === 'number' && Number.isFinite(val)) {
      (out as Record<string, number>)[k as string] = Math.min(max, Math.max(min, val));
    }
  };

  numField('fsw_kHz', 25, 300);
  numField('Lpfc_uH', 30, 2000);
  numField('Cdc_uF', 100, 15000);
  numField('ESR_Cdc_mOhm', 5, 500);
  numField('fc_i_kHz', 1, 25);
  numField('pm_i_deg', 30, 80);
  numField('fc_v_Hz', 4, 40);
  numField('pm_v_deg', 35, 80);
  numField('Cy_nF', 0.47, 22);
  numField('prechargeR_Ohm', 4, 150);

  return Object.keys(out).length > 0 ? out : undefined;
}

function findMatchingAlertFix(
  alerts: DesignAlertItem[],
  alertId: string,
  alertFixId?: string
): DesignAlertFix | null {
  if (!alertFixId) return null;
  const exactAlert = alerts.find((a) => a.id === alertId);
  const exactFix = exactAlert?.fixes?.find((f) => f.id === alertFixId);
  if (exactFix) return exactFix;
  for (const a of alerts) {
    const found = a.fixes?.find((f) => f.id === alertFixId);
    if (found) return found;
  }
  return null;
}

function resolveAiPatchToDesignAlertFix(
  proposal: AiProposedFixRaw,
  alerts: DesignAlertItem[]
): { fix: DesignAlertFix | null; error?: string } {
  const { patch } = proposal;
  if (!patch) return { fix: null, error: 'Missing patch payload.' };

  // 1. Prefer deterministic solver-synthesized candidate fix if referenced by ID
  if (patch.alertFixId) {
    const matched = findMatchingAlertFix(alerts, proposal.alertId, patch.alertFixId);
    if (matched) return { fix: matched };
  }

  // 2. Otherwise build and validate custom patch against real catalogs
  if (patch.targetKind === 'dcdc') {
    const clean = sanitizeDcdcPatch(patch.dcdcPatch);
    if (!clean) {
      return { fix: null, error: 'No valid DC-DC parameters found in AI patch.' };
    }
    return {
      fix: {
        id: proposal.id,
        label: proposal.title,
        impact: proposal.patchSummary,
        targetKind: 'dcdc',
        dcdcPatch: clean,
      },
    };
  }

  if (patch.targetKind === 'acdc') {
    const clean = sanitizeAcdcPatch(patch.acdcPatch);
    if (!clean) {
      return { fix: null, error: 'No valid AC-DC parameters found in AI patch.' };
    }
    return {
      fix: {
        id: proposal.id,
        label: proposal.title,
        impact: proposal.patchSummary,
        targetKind: 'acdc',
        acdcPatch: clean,
      },
    };
  }

  if (patch.targetKind === 'inductor' && patch.itemId) {
    const ov = patch.inductorOverridesPatch;
    if (!ov) return { fix: null, error: 'Missing inductor override patch.' };
    const cleanOv: Partial<CustomInductorOverrides> = {};
    if (ov.coreId && INDUCTOR_CORE_DATABASE.some((c) => c.id === ov.coreId)) cleanOv.coreId = ov.coreId;
    if (ov.materialId && INDUCTOR_MATERIAL_DATABASE.some((m) => m.id === ov.materialId)) {
      cleanOv.materialId = ov.materialId;
    }
    if (typeof ov.turnsN === 'number' && ov.turnsN >= 1 && ov.turnsN <= 300) cleanOv.turnsN = Math.round(ov.turnsN);
    if (typeof ov.airGap_mm === 'number' && ov.airGap_mm >= 0 && ov.airGap_mm <= 10) {
      cleanOv.airGap_mm = ov.airGap_mm;
    }
    if (typeof ov.parallelStrands === 'number' && ov.parallelStrands >= 1 && ov.parallelStrands <= 20) {
      cleanOv.parallelStrands = Math.round(ov.parallelStrands);
    }
    if (Object.keys(cleanOv).length === 0) {
      return { fix: null, error: 'No valid inductor overrides in AI patch.' };
    }
    return {
      fix: {
        id: proposal.id,
        label: proposal.title,
        impact: proposal.patchSummary,
        targetKind: 'inductor',
        itemId: patch.itemId,
        inductorOverridesPatch: cleanOv,
      },
    };
  }

  if (patch.targetKind === 'capacitor' && patch.itemId) {
    const ov = patch.capacitorOverridesPatch;
    if (!ov) return { fix: null, error: 'Missing capacitor override patch.' };
    const cleanOv: Partial<CustomCapBankOverrides> = {};
    if (ov.partId && READY_COTS_CAPACITORS.some((c) => c.id === ov.partId)) cleanOv.partId = ov.partId;
    if (typeof ov.seriesCount === 'number' && ov.seriesCount >= 1 && ov.seriesCount <= 8) {
      cleanOv.seriesCount = Math.round(ov.seriesCount);
    }
    if (typeof ov.parallelCount === 'number' && ov.parallelCount >= 1 && ov.parallelCount <= 48) {
      cleanOv.parallelCount = Math.round(ov.parallelCount);
    }
    if (Object.keys(cleanOv).length === 0) {
      return { fix: null, error: 'No valid capacitor bank overrides in AI patch.' };
    }
    return {
      fix: {
        id: proposal.id,
        label: proposal.title,
        impact: proposal.patchSummary,
        targetKind: 'capacitor',
        itemId: patch.itemId,
        capacitorOverridesPatch: cleanOv,
        capacitorUnlockMatrix: patch.capacitorUnlockMatrix ?? Boolean(cleanOv.partId && !cleanOv.parallelCount),
        syncToCircuit: patch.syncToCircuit ?? true,
      },
    };
  }

  return { fix: null, error: 'Unrecognized AI patch target.' };
}

export function applyFixToClonedContext(
  fix: DesignAlertFix,
  ctx: {
    dcdcState: DcDcDesignState;
    acdcState: AcDcDesignState;
    inductorConfigs: Record<string, PerInductorConfig>;
    capacitorConfigs: Record<string, PerCapConfig>;
  }
) {
  let nextDcdc = { ...ctx.dcdcState };
  let nextAcdc = { ...ctx.acdcState };
  const nextInds = { ...ctx.inductorConfigs };
  const nextCaps = { ...ctx.capacitorConfigs };

  if (fix.targetKind === 'dcdc' && fix.dcdcPatch) {
    nextDcdc = { ...nextDcdc, ...fix.dcdcPatch };
    if (
      fix.dcdcPatch.turnsRatio_n !== undefined ||
      fix.dcdcPatch.Np_turns !== undefined ||
      fix.dcdcPatch.Ns_turns !== undefined
    ) {
      nextDcdc = syncDcdcTurnsRatioState(fix.dcdcPatch, nextDcdc, null);
    }
  } else if (fix.targetKind === 'acdc' && fix.acdcPatch) {
    nextAcdc = { ...nextAcdc, ...fix.acdcPatch };
  } else if (fix.targetKind === 'inductor' && fix.itemId && fix.inductorOverridesPatch) {
    const p = fix.inductorOverridesPatch;
    const prev = nextInds[fix.itemId] || {
      buildMode: 'custom' as const,
      overrides: {},
      locks: { ...DEFAULT_IND_LOCKS },
    };
    nextInds[fix.itemId] = {
      ...prev,
      buildMode: 'custom',
      overrides: { ...prev.overrides, ...p },
      locks: {
        ...(prev.locks || DEFAULT_IND_LOCKS),
        ...(p.coreId ? { coreId: true } : {}),
        ...(p.materialId ? { materialId: true } : {}),
        ...(p.wireAwg !== undefined ? { wireAwg: true } : {}),
        ...(p.parallelStrands !== undefined ? { parallelStrands: true } : {}),
        ...(p.conductorForm !== undefined ? { conductorForm: true } : {}),
        ...(p.airGap_mm !== undefined ? { airGap_mm: true } : {}),
        ...(p.turnsN !== undefined ? { turnsN: true } : p.coreId ? { turnsN: false } : {}),
      },
    };
  } else if (fix.targetKind === 'capacitor' && fix.itemId && fix.capacitorOverridesPatch) {
    const p = fix.capacitorOverridesPatch;
    const prev = nextCaps[fix.itemId] || {
      viewMode: 'builder' as const,
      overrides: {},
      locks: { ...DEFAULT_CAP_LOCKS },
    };
    const nextOverrides = { ...prev.overrides, ...p };
    const nextLocks = fix.capacitorUnlockMatrix
      ? {
          ...prev.locks,
          partId: Boolean(p.partId),
          seriesCount: false,
          parallelCount: false,
        }
      : {
          ...prev.locks,
          ...(p.partId ? { partId: true } : {}),
          ...(p.seriesCount !== undefined ? { seriesCount: true } : {}),
          ...(p.parallelCount !== undefined ? { parallelCount: true } : {}),
        };

    nextCaps[fix.itemId] = {
      ...prev,
      viewMode: 'builder',
      overrides: nextOverrides,
      locks: nextLocks,
    };

    if (fix.syncToCircuit) {
      const dcdcRes = solveDcDcDesign(nextDcdc);
      const acdcRes = solveAcDcDesign(nextAcdc);
      const mode: 'acdc' | 'dcdc' = fix.itemId.startsWith('acdc-') ? 'acdc' : 'dcdc';
      const reqs = extractCircuitCapacitors(mode, nextDcdc, dcdcRes, nextAcdc, acdcRes);
      const req = reqs.find((r) => r.id === fix.itemId);
      if (req?.syncTarget) {
        const solvedBank = solveCapacitorBank(req, nextOverrides, nextLocks);
        const cVal = Number(
          (solvedBank.bank_C_uF * (req.syncTarget.scaleFactorToState ?? 1)).toFixed(1)
        );
        const esrVal = Number(solvedBank.bank_ESR_mOhm.toFixed(1));
        if (req.syncTarget.domain === 'dcdc') {
          nextDcdc = {
            ...nextDcdc,
            [req.syncTarget.cKey]: cVal,
            ...(req.syncTarget.esrKey ? { [req.syncTarget.esrKey]: esrVal } : {}),
          };
        } else {
          nextAcdc = {
            ...nextAcdc,
            [req.syncTarget.cKey]: cVal,
            ...(req.syncTarget.esrKey ? { [req.syncTarget.esrKey]: esrVal } : {}),
          };
        }
      }
    }
  }

  const nextDcdcRes = solveDcDcDesign(nextDcdc);
  const nextAcdcRes = solveAcDcDesign(nextAcdc);
  const nextAlerts = evaluateDesignAlerts({
    dcdcState: nextDcdc,
    dcdcRes: nextDcdcRes,
    acdcState: nextAcdc,
    acdcRes: nextAcdcRes,
    inductorConfigs: nextInds,
    capacitorConfigs: nextCaps,
  });

  return {
    dcdcState: nextDcdc,
    dcdcRes: nextDcdcRes,
    acdcState: nextAcdc,
    acdcRes: nextAcdcRes,
    inductorConfigs: nextInds,
    capacitorConfigs: nextCaps,
    designAlerts: nextAlerts,
  };
}

function collectPhysicsDeltas(
  before: { dcdcRes: DcDcResults; acdcRes: AcDcResults },
  after: { dcdcRes: DcDcResults; acdcRes: AcDcResults },
  domain: 'dcdc' | 'acdc'
): string[] {
  const deltas: string[] = [];
  if (domain === 'dcdc') {
    const b = before.dcdcRes;
    const a = after.dcdcRes;
    if (Math.abs(a.coreThermalAnalysis.Tcore_hotspot_C - b.coreThermalAnalysis.Tcore_hotspot_C) >= 0.8) {
      deltas.push(
        `T_core: ${b.coreThermalAnalysis.Tcore_hotspot_C.toFixed(0)}°C → ${a.coreThermalAnalysis.Tcore_hotspot_C.toFixed(0)}°C`
      );
    }
    if (Math.abs(a.Bpk_mT - b.Bpk_mT) >= 2) {
      deltas.push(`B_pk: ${b.Bpk_mT.toFixed(0)} mT → ${a.Bpk_mT.toFixed(0)} mT`);
    }
    if (Math.abs(a.Tj_sec_C - b.Tj_sec_C) >= 0.8) {
      deltas.push(`T_j,sec: ${b.Tj_sec_C.toFixed(0)}°C → ${a.Tj_sec_C.toFixed(0)}°C`);
    }
    if (Math.abs(a.Tj_pri_C - b.Tj_pri_C) >= 0.8) {
      deltas.push(`T_j,pri: ${b.Tj_pri_C.toFixed(0)}°C → ${a.Tj_pri_C.toFixed(0)}°C`);
    }
    if (Math.abs(a.Vsec_unclamped_pk_V - b.Vsec_unclamped_pk_V) >= 1) {
      deltas.push(`V_sec,pk: ${b.Vsec_unclamped_pk_V.toFixed(0)}V → ${a.Vsec_unclamped_pk_V.toFixed(0)}V`);
    }
    if (Math.abs(a.windowFill_pct - b.windowFill_pct) >= 1.0) {
      deltas.push(`Window: ${b.windowFill_pct.toFixed(0)}% → ${a.windowFill_pct.toFixed(0)}%`);
    }
    if (Math.abs(a.pm_actual_deg - b.pm_actual_deg) >= 1.0) {
      deltas.push(`PM: ${b.pm_actual_deg.toFixed(0)}° → ${a.pm_actual_deg.toFixed(0)}°`);
    }
    if (Math.abs(a.efficiency_pct - b.efficiency_pct) >= 0.08) {
      deltas.push(`η_DCDC: ${b.efficiency_pct.toFixed(2)}% → ${a.efficiency_pct.toFixed(2)}%`);
    }
  } else {
    const b = before.acdcRes;
    const a = after.acdcRes;
    if (Math.abs(a.Tj_fast_C - b.Tj_fast_C) >= 0.8) {
      deltas.push(`T_j,pfc: ${b.Tj_fast_C.toFixed(0)}°C → ${a.Tj_fast_C.toFixed(0)}°C`);
    }
    if (Math.abs(a.tHold_actual_ms - b.tHold_actual_ms) >= 0.5) {
      deltas.push(`Hold-up: ${b.tHold_actual_ms.toFixed(1)}ms → ${a.tHold_actual_ms.toFixed(1)}ms`);
    }
    if (Math.abs(a.capHotspot_C - b.capHotspot_C) >= 0.8) {
      deltas.push(`T_cap: ${b.capHotspot_C.toFixed(0)}°C → ${a.capHotspot_C.toFixed(0)}°C`);
    }
    if (Math.abs(a.pm_i_actual_deg - b.pm_i_actual_deg) >= 1.0) {
      deltas.push(`PM_i: ${b.pm_i_actual_deg.toFixed(0)}° → ${a.pm_i_actual_deg.toFixed(0)}°`);
    }
    if (Math.abs(a.efficiency_pct - b.efficiency_pct) >= 0.08) {
      deltas.push(`η_PFC: ${b.efficiency_pct.toFixed(2)}% → ${a.efficiency_pct.toFixed(2)}%`);
    }
  }
  return deltas.slice(0, 4);
}

export function dryRunProposedFix(
  proposal: AiProposedFixRaw,
  ctx: AiContextInputs
): AiDryRunValidation {
  const { fix, error } = resolveAiPatchToDesignAlertFix(proposal, ctx.designAlerts.all);
  if (!fix) {
    return {
      valid: false,
      validationError: error || 'Invalid patch specification.',
      isSafeToAutoApply: false,
      alreadyResolved: false,
      dangerBefore: ctx.designAlerts.danger.length,
      dangerAfter: ctx.designAlerts.danger.length,
      warningBefore: ctx.designAlerts.warning.length,
      warningAfter: ctx.designAlerts.warning.length,
      targetAlertResolved: false,
      newDangersIntroduced: [],
      physicsDeltas: [],
      resolvedFix: null,
    };
  }

  const after = applyFixToClonedContext(fix, ctx);
  const beforeDangerIds = new Set(ctx.designAlerts.danger.map((a) => a.id));
  const afterDangerIds = new Set(after.designAlerts.danger.map((a) => a.id));
  const afterAllIds = new Set(after.designAlerts.all.map((a) => a.id));

  const newDangersIntroduced = after.designAlerts.danger
    .filter((a) => !beforeDangerIds.has(a.id))
    .map((a) => a.title);

  const targetStillDanger = proposal.alertId ? afterDangerIds.has(proposal.alertId) : false;
  const targetStillPresent = proposal.alertId ? afterAllIds.has(proposal.alertId) : false;
  const targetAlertResolved = proposal.alertId
    ? !targetStillPresent || (beforeDangerIds.has(proposal.alertId) && !targetStillDanger)
    : after.designAlerts.all.length < ctx.designAlerts.all.length;

  const alreadyResolved =
    Boolean(proposal.alertId) && !ctx.designAlerts.all.some((a) => a.id === proposal.alertId);

  const physicsDeltas = collectPhysicsDeltas(
    { dcdcRes: ctx.dcdcRes, acdcRes: ctx.acdcRes },
    { dcdcRes: after.dcdcRes, acdcRes: after.acdcRes },
    proposal.domain
  );

  const dangerBefore = ctx.designAlerts.danger.length;
  const dangerAfter = after.designAlerts.danger.length;
  const warningBefore = ctx.designAlerts.warning.length;
  const warningAfter = after.designAlerts.warning.length;

  const improvesOrMaintainsSafety =
    newDangersIntroduced.length === 0 &&
    (dangerAfter < dangerBefore ||
      (dangerAfter === dangerBefore && (warningAfter < warningBefore || targetAlertResolved || proposal.severity === 'optimization')));

  return {
    valid: true,
    isSafeToAutoApply: improvesOrMaintainsSafety && !alreadyResolved,
    alreadyResolved,
    dangerBefore,
    dangerAfter,
    warningBefore,
    warningAfter,
    targetAlertResolved,
    newDangersIntroduced,
    physicsDeltas,
    resolvedFix: fix,
  };
}

export function stageAndValidateAiFixes(
  rawFixes: AiProposedFixRaw[],
  ctx: AiContextInputs
): AiStagedFix[] {
  const rankWeight = (s: AiProposedFixRaw['severity']) =>
    s === 'danger' ? 0 : s === 'warning' ? 1 : 2;
  const sorted = [...rawFixes].sort((a, b) => rankWeight(a.severity) - rankWeight(b.severity));
  return sorted.map((item) => ({
    ...item,
    validation: dryRunProposedFix(item, ctx),
  }));
}

export function simulateSequentialSafeBatch(
  stagedFixes: AiStagedFix[],
  ctx: AiContextInputs
): {
  fixesToApply: { fix: DesignAlertFix; stageItem: AiStagedFix; resultDelta: string }[];
  finalContext: ReturnType<typeof applyFixToClonedContext> | null;
} {
  let working = {
    dcdcState: { ...ctx.dcdcState },
    dcdcRes: ctx.dcdcRes,
    acdcState: { ...ctx.acdcState },
    acdcRes: ctx.acdcRes,
    inductorConfigs: { ...ctx.inductorConfigs },
    capacitorConfigs: { ...ctx.capacitorConfigs },
    designAlerts: ctx.designAlerts,
  };

  const fixesToApply: { fix: DesignAlertFix; stageItem: AiStagedFix; resultDelta: string }[] = [];
  let appliedAny = false;

  for (const item of stagedFixes) {
    if (item.skipped || item.applied) continue;
    // Re-validate dynamically against the cumulative working state!
    const dynCheck = dryRunProposedFix(item, working);
    if (!dynCheck.valid || !dynCheck.resolvedFix || dynCheck.alreadyResolved || !dynCheck.isSafeToAutoApply) {
      continue;
    }
    const next = applyFixToClonedContext(dynCheck.resolvedFix, working);
    const dStr = `Danger ${working.designAlerts.danger.length}→${next.designAlerts.danger.length} · Warn ${working.designAlerts.warning.length}→${next.designAlerts.warning.length}`;
    fixesToApply.push({
      fix: dynCheck.resolvedFix,
      stageItem: item,
      resultDelta: dynCheck.physicsDeltas.length > 0 ? `${dStr} (${dynCheck.physicsDeltas[0]})` : dStr,
    });
    working = next;
    appliedAny = true;
  }

  return {
    fixesToApply,
    finalContext: appliedAny ? working : null,
  };
}
