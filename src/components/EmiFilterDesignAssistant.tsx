import React, { useState, useMemo } from 'react';
import { DcDcDesignState } from '../data/databases';
import { DcDcResults } from '../engine/dcdcEngine';
import { MathFormula } from './MathFormula';
import { InteractiveChart } from './InteractiveChart';
import { useDesignSolver, useLockableValue } from './DesignSolverContext';
import { LockToggleButton } from './AutoSolverControls';
import {
  ShieldCheck,
  AlertTriangle,
  Radio,
  Sliders,
  Zap,
  Layers,
  CheckCircle2,
  ExternalLink,
  Activity,
  ArrowRightLeft,
} from 'lucide-react';

export type EmcStandardId = 'cispr32-b' | 'cispr32-a' | 'cispr25-5' | 'mil461-ce102';
export type FilterStageCount = 1 | 2;
export type ChokeCoreMaterial = 'nanocrystalline' | 'mnzn-t38' | 'mnzn-n30';
export type FilterPortFocus = 'both' | 'input' | 'output';

interface EmiFilterDesignAssistantProps {
  state: DcDcDesignState;
  res: DcDcResults;
  onChange?: (next: DcDcDesignState) => void;
  onOpenPartDrawer?: () => void;
}

// Standard E6/E12 capacitor & inductor series helpers
const E6_SERIES = [1.0, 1.5, 2.2, 3.3, 4.7, 6.8];
const E12_SERIES = [1.0, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2];
const Y_CAP_NP_SERIES = [1.0, 2.2, 3.3, 4.7, 6.8, 10, 15, 22, 33, 47, 68, 100];

function snapToSeries(val: number, series: number[], roundUp = true): number {
  if (val <= 0 || !Number.isFinite(val)) return series[0];
  const exp = Math.floor(Math.log10(val));
  const base = Math.pow(10, exp);
  const norm = val / base;
  if (roundUp) {
    for (const s of series) {
      if (s >= norm * 0.96) return Number((s * base).toPrecision(3));
    }
    return Number((series[0] * base * 10).toPrecision(3));
  } else {
    let best = series[0];
    for (const s of series) {
      if (s <= norm * 1.04) best = s;
    }
    return Number((best * base).toPrecision(3));
  }
}

interface EmcStandardSpec {
  id: EmcStandardId;
  name: string;
  shortName: string;
  application: string;
  getLimits_dBuV: (f_MHz: number) => { qp: number; avg: number };
}

const EMC_STANDARDS: Record<EmcStandardId, EmcStandardSpec> = {
  'cispr32-b': {
    id: 'cispr32-b',
    name: 'CISPR 32 / EN 55032 Class B',
    shortName: 'CISPR 32 Class B',
    application: 'Residential, Commercial & Light-Industrial Multimedia / Telecom / Server',
    getLimits_dBuV: (f_MHz: number) => {
      if (f_MHz < 0.5) {
        const frac = Math.max(0, Math.min(1, Math.log10(f_MHz / 0.15) / Math.log10(0.5 / 0.15)));
        return { qp: 66 - 10 * frac, avg: 56 - 10 * frac };
      } else if (f_MHz <= 5.0) {
        return { qp: 56, avg: 46 };
      } else {
        return { qp: 60, avg: 50 };
      }
    },
  },
  'cispr32-a': {
    id: 'cispr32-a',
    name: 'CISPR 32 / EN 55032 Class A',
    shortName: 'CISPR 32 Class A',
    application: 'Industrial, Data Center & Heavy Telecom Infrastructure',
    getLimits_dBuV: (f_MHz: number) => {
      if (f_MHz < 0.5) {
        return { qp: 79, avg: 66 };
      }
      return { qp: 73, avg: 60 };
    },
  },
  'cispr25-5': {
    id: 'cispr25-5',
    name: 'CISPR 25 Class 5 (Automotive)',
    shortName: 'CISPR 25 Class 5',
    application: 'EV On-Board Charger (OBC), HV-LV DC-DC & Automotive Grade',
    getLimits_dBuV: (f_MHz: number) => {
      if (f_MHz <= 0.3) return { qp: 50, avg: 40 };
      if (f_MHz <= 1.8) return { qp: 44, avg: 34 };
      if (f_MHz <= 5.9) return { qp: 42, avg: 32 };
      return { qp: 38, avg: 28 };
    },
  },
  'mil461-ce102': {
    id: 'mil461-ce102',
    name: 'MIL-STD-461G CE102',
    shortName: 'MIL-STD-461G CE102',
    application: 'Aerospace, Defense & Avionics Primary Power Bus (10 kHz – 10 MHz)',
    getLimits_dBuV: (f_MHz: number) => {
      if (f_MHz <= 0.5) {
        const frac = Math.max(0, Math.min(1, Math.log10(Math.max(0.15, f_MHz) / 0.15) / Math.log10(0.5 / 0.15)));
        const lim = 74 - 14 * frac;
        return { qp: lim + 6, avg: lim };
      }
      return { qp: 66, avg: 60 };
    },
  },
};

export interface FilterStageComponentSpec {
  port: 'Input' | 'Output' | 'Bridge';
  mode: 'DM' | 'CM' | 'Damping / Safety';
  refDes: string;
  role: string;
  valueFormatted: string;
  ratingFormatted: string;
  dielectricOrCore: string;
  mpn: string;
  manufacturer: string;
  lcsc: string;
  notes: string;
}

export const EmiFilterDesignAssistant: React.FC<EmiFilterDesignAssistantProps> = ({
  state,
  res,
  onOpenPartDrawer,
}) => {
  const { applyDcdcPatch } = useDesignSolver();
  const [standardId, setStandardId] = useState<EmcStandardId>('cispr32-b');

  // Lockable What-If / Sandbox operating point overrides (track converter automatically when unlocked)
  const fswSandboxLock = useLockableValue<number>(state.fsw_kHz, false);
  const poutSandboxLock = useLockableValue<number>(state.Pout_W, false);
  const activeFsw_kHz = fswSandboxLock.value;
  const activePout_W = poutSandboxLock.value;
  const isSandboxDirty = fswSandboxLock.locked || poutSandboxLock.locked;

  // Auto-calculated optimal EMI filter architecture parameters derived from power, fsw, and EMC standard
  const autoStageCount: FilterStageCount = activePout_W >= 1500 || activeFsw_kHz >= 140 ? 2 : 1;
  const autoOutStageCount: FilterStageCount = activePout_W >= 2500 ? 2 : 1;
  const autoSafetyMargin_dB =
    standardId === 'mil461-ce102' || standardId === 'cispr25-5' ? 8 : 6;
  const autoCoreType: ChokeCoreMaterial =
    activePout_W >= 1200 || activeFsw_kHz >= 150 ? 'nanocrystalline' : 'mnzn-t38';
  const autoHeatsinkCp_pF = Math.min(
    280,
    Math.max(25, Math.round((35 + activePout_W * 0.015) / 5) * 5)
  );
  const autoMaxLeakage_mA = standardId === 'cispr25-5' ? 0.75 : 3.5;
  const autoUseCmLeakageForDm = true;
  const autoIncludeY1BridgeCap = state.Vin_nom_V >= 150;

  const stageCountLock = useLockableValue<FilterStageCount>(autoStageCount, false);
  const outStageCountLock = useLockableValue<FilterStageCount>(autoOutStageCount, false);
  const safetyMarginLock = useLockableValue<number>(autoSafetyMargin_dB, false);
  const coreTypeLock = useLockableValue<ChokeCoreMaterial>(autoCoreType, false);
  const heatsinkCpLock = useLockableValue<number>(autoHeatsinkCp_pF, false);
  const maxLeakageLock = useLockableValue<number>(autoMaxLeakage_mA, false);
  const cmLeakageDmLock = useLockableValue<boolean>(autoUseCmLeakageForDm, false);
  const y1BridgeLock = useLockableValue<boolean>(autoIncludeY1BridgeCap, false);

  const stageCount = stageCountLock.value;
  const outStageCount = outStageCountLock.value;
  const safetyMargin_dB = safetyMarginLock.value;
  const coreType = coreTypeLock.value;
  const heatsinkCp_pF = heatsinkCpLock.value;
  const maxLeakage_mA = maxLeakageLock.value;
  const useCmLeakageForDm = cmLeakageDmLock.value;
  const includeY1BridgeCap = y1BridgeLock.value;

  const [visualMode, setVisualMode] = useState<'spectrum' | 'attenuation' | 'schematic'>('spectrum');
  const [spectrumPort, setSpectrumPort] = useState<'input' | 'output'>('input');
  const [bomPortFilter, setBomPortFilter] = useState<FilterPortFocus>('both');
  const [hoveredHarmonicIdx, setHoveredHarmonicIdx] = useState<number | null>(null);

  const activeVin_V = state.Vin_nom_V;
  const activeVout_V = state.Vout_V;
  const nPhases = state.topology === 'psfb-2ph' ? 2 : 1;
  // Effective ripple frequency seen at the input/output bus
  const f_ripple_kHz = activeFsw_kHz * (state.topology === 'llc-hb' ? 1 : 2) * nPhases;

  const emiDesign = useMemo(() => {
    const std = EMC_STANDARDS[standardId];
    const eff = Math.max(0.85, res.efficiency_pct / 100);
    const Pin_W = activePout_W / eff;
    const Iin_dc_A = Pin_W / Math.max(12, activeVin_V);
    const Iout_dc_A = activePout_W / Math.max(3.3, activeVout_V);

    // =========================================================================
    // PART A: INPUT PORT (PRIMARY BUS) DM & CM NOISE SOURCE & FILTER SYNTHESIS
    // =========================================================================
    const D_eff = Math.max(0.15, Math.min(0.92, res.Deff_nom));
    const I_pulse_pk_A = Iin_dc_A / D_eff;
    const t_sw_ns = Math.max(6, (res.priDevice.tr_ns + res.priDevice.tf_ns) * 0.5);
    const t_r_s = t_sw_ns * 1e-9;
    const f_fund_Hz = activeFsw_kHz * 1e3;

    // Input Common-Mode (CM) Noise Source Model
    // Driven by primary switch dv/dt across inter-winding capacitance Cww + switch-to-heatsink/PE capacitance Cp_hs
    const C_ww_pF = res.Cww_pF;
    const C_Y_bridge_nF = includeY1BridgeCap ? 2.2 : 0;
    // Bridging Y1 capacitor across isolation barrier shunts C_ww displacement current locally
    const cmBridgeReduction = includeY1BridgeCap
      ? C_ww_pF / (C_ww_pF + C_Y_bridge_nF * 1000 * 0.35)
      : 1.0;
    const C_cm_total_pF = C_ww_pF * cmBridgeReduction + heatsinkCp_pF;
    const C_cm_total_F = C_cm_total_pF * 1e-12;
    const dv_dt_V_ns = activeVin_V / Math.max(t_sw_ns, 5);

    // Standard 50Ω // 50µH CISPR 16-1-2 LISN Equivalent Impedances
    const evalLisnSingleLineOhm = (f_Hz: number) => {
      const w = 2 * Math.PI * f_Hz;
      const L_lisn = 50e-6;
      const R_branch = 5.0;
      const R_rx = 50.0;
      const num = Math.hypot(R_branch * R_rx, w * L_lisn * R_rx);
      const den = Math.hypot(R_branch + R_rx, w * L_lisn);
      return num / den;
    };

    // First harmonic inside the regulated CISPR band (f >= 150 kHz)
    const k_crit = Math.max(1, Math.ceil(150 / activeFsw_kHz));
    const f_crit_kHz = k_crit * activeFsw_kHz;
    const f_crit_MHz = f_crit_kHz / 1e3;
    const f_crit_Hz = f_crit_kHz * 1e3;

    // Evaluate Unfiltered Input DM and CM noise at any harmonic n (f = n * f_sw)
    const evalUnfilteredInputHarmonic = (n: number) => {
      const f_Hz = n * f_fund_Hz;
      const f_MHz = f_Hz / 1e6;
      const zLisnLine = evalLisnSingleLineOhm(f_Hz);
      const zLisnDm = 2 * zLisnLine; // 100 Ω nominal differential
      const zLisnCm = 0.5 * zLisnLine; // 25 Ω nominal common-mode

      const sincD = Math.abs(Math.sin(n * Math.PI * D_eff)) / (n * Math.PI * D_eff);
      const xTr = n * Math.PI * f_fund_Hz * t_r_s;
      const sincTr = xTr > 1e-4 ? Math.abs(Math.sin(xTr)) / xTr : 1.0;

      const interleaveFactor = nPhases === 2 && n % 2 === 1 ? 0.22 : 1.0;
      const I_dm_raw_A = 2 * I_pulse_pk_A * D_eff * Math.max(0.18, sincD) * sincTr * interleaveFactor;

      const C_dc_local_F = 10e-6;
      const ESL_dc_local_H = 15e-9;
      const w = 2 * Math.PI * f_Hz;
      const zLocalCap = Math.hypot(0.015, w * ESL_dc_local_H - 1 / (w * C_dc_local_F));
      const dmCurrentSplit = zLocalCap / Math.hypot(zLocalCap + zLisnDm * 0.18, 1.0);

      const V_dm_rms_V = (I_dm_raw_A / Math.SQRT2) * dmCurrentSplit * zLisnDm;
      const V_dm_unfilt_dBuV = 20 * Math.log10(Math.max(V_dm_rms_V * 1e6, 1.0));

      const V_cm_src_pk_V =
        ((2 * activeVin_V * 0.55) / (n * Math.PI)) *
        Math.max(0.25, Math.abs(Math.sin(n * Math.PI * 0.48))) *
        sincTr;
      const zCcm = 1 / (w * C_cm_total_F);
      const V_cm_rms_V = (V_cm_src_pk_V / Math.SQRT2) * (zLisnCm / Math.hypot(zCcm, zLisnCm));
      const V_cm_unfilt_dBuV = 20 * Math.log10(Math.max(V_cm_rms_V * 1e6, 1.0));

      const V_total_unfilt_dBuV =
        10 * Math.log10(Math.pow(10, V_dm_unfilt_dBuV / 10) + Math.pow(10, V_cm_unfilt_dBuV / 10));

      const limits = std.getLimits_dBuV(Math.max(0.15, f_MHz));

      return {
        n,
        f_Hz,
        f_kHz: f_Hz / 1e3,
        f_MHz,
        V_dm_unfilt_dBuV,
        V_cm_unfilt_dBuV,
        V_total_unfilt_dBuV,
        limit_qp_dBuV: limits.qp,
        limit_avg_dBuV: limits.avg,
      };
    };

    const critPt = evalUnfilteredInputHarmonic(k_crit);
    const Att_DM_req_dB = Math.max(
      12,
      critPt.V_dm_unfilt_dBuV - critPt.limit_avg_dBuV + safetyMargin_dB
    );
    const Att_CM_req_dB = Math.max(
      16,
      critPt.V_cm_unfilt_dBuV - critPt.limit_avg_dBuV + safetyMargin_dB
    );

    const slope_dB_per_dec = 40 * stageCount;
    const fc_DM_req_Hz = Math.min(
      f_crit_Hz * 0.45,
      Math.max(2500, f_crit_Hz / Math.pow(10, Att_DM_req_dB / slope_dB_per_dec))
    );
    const fc_CM_req_Hz = Math.min(
      f_crit_Hz * 0.45,
      Math.max(3500, f_crit_Hz / Math.pow(10, Att_CM_req_dB / slope_dB_per_dec))
    );

    // Input Common-Mode Components (C_Y,in and L_CM,in)
    const C_Y_max_leak_nF = ((maxLeakage_mA * 1e-3) / (2 * Math.PI * 60 * 250)) * 1e9;
    const target_CY_per_stage_nF = Math.min(
      C_Y_max_leak_nF / stageCount,
      stageCount === 2 ? 10 : 22
    );
    const C_Y_line_nF = snapToSeries(Math.max(2.2, target_CY_per_stage_nF), Y_CAP_NP_SERIES, false);
    const C_Y_tot_per_stage_F = 2 * C_Y_line_nF * 1e-9;

    const L_CM_raw_mH =
      (1 / (Math.pow(2 * Math.PI * fc_CM_req_Hz, 2) * C_Y_tot_per_stage_F)) * 1e3;
    const L_CM_stage_mH = snapToSeries(Math.max(0.68, Math.min(33, L_CM_raw_mH)), E12_SERIES, true);
    const L_CM_stage_H = L_CM_stage_mH * 1e-3;

    const fc_CM_actual_kHz =
      1 / (2 * Math.PI * Math.sqrt(L_CM_stage_H * C_Y_tot_per_stage_F)) / 1e3;

    const total_CY_line_nF = C_Y_line_nF * stageCount;
    const I_leak_PE_mA = 2 * Math.PI * 60 * 250 * (total_CY_line_nF * 1e-9) * 1e3;

    // Input Differential-Mode Components (C_X,in and L_DM,in)
    const L_lk_from_CM_uH = Number((L_CM_stage_mH * 1000 * 0.0075).toFixed(1));
    const L_DM_target_uH = useCmLeakageForDm
      ? Math.max(8.2, L_lk_from_CM_uH)
      : snapToSeries(Math.max(10, (activeVin_V / Math.max(Iin_dc_A, 1)) * 1.2), E12_SERIES, true);

    const L_DM_stage_uH = useCmLeakageForDm
      ? L_DM_target_uH
      : snapToSeries(L_DM_target_uH, E12_SERIES, true);
    const L_DM_stage_H = L_DM_stage_uH * 1e-6;

    const C_X_raw_uF =
      (1 / (Math.pow(2 * Math.PI * fc_DM_req_Hz, 2) * L_DM_stage_H)) * 1e6;
    const C_X_stage_uF = snapToSeries(Math.max(0.47, Math.min(22, C_X_raw_uF)), E6_SERIES, true);
    const C_X_stage_F = C_X_stage_uF * 1e-6;

    const fc_DM_actual_kHz =
      1 / (2 * Math.PI * Math.sqrt(L_DM_stage_H * C_X_stage_F)) / 1e3;

    // Middlebrook Parallel Damping Network (Rd + Cd) & Bleeder Resistor (R_bleed)
    const R_in_neg_Ohm = (activeVin_V * activeVin_V) / Math.max(Pin_W, 10);
    const Zin_neg_dBOhm = 20 * Math.log10(Math.max(R_in_neg_Ohm, 0.1));

    const C_d_uF = snapToSeries(C_X_stage_uF * 3.3, E6_SERIES, true);
    const R_d_ideal_Ohm = Math.sqrt(L_DM_stage_H / C_X_stage_F);
    const R_d_Ohm = snapToSeries(Math.max(0.47, R_d_ideal_Ohm), E12_SERIES, false);

    const Z0_dm_Ohm = Math.sqrt(L_DM_stage_H / C_X_stage_F);
    const Zout_damped_pk_Ohm = Z0_dm_Ohm * 0.92;
    const Zout_undamped_pk_Ohm = Z0_dm_Ohm * 8.5;
    const Zout_damped_pk_dBOhm = 20 * Math.log10(Math.max(Zout_damped_pk_Ohm, 0.01));
    const Zout_undamped_pk_dBOhm = 20 * Math.log10(Math.max(Zout_undamped_pk_Ohm, 0.01));
    const middlebrookMargin_dB = Zin_neg_dBOhm - Zout_damped_pk_dBOhm;
    const middlebrookPass = middlebrookMargin_dB >= 6.0;

    const C_X_total_uF = C_X_stage_uF * (stageCount + 1);
    const R_bleed_max_kOhm = 1000 / Math.max(C_X_total_uF, 0.47);
    const R_bleed_kOhm = snapToSeries(Math.min(1000, R_bleed_max_kOhm * 0.85), E12_SERIES, false);
    const P_bleed_mW = ((activeVin_V * activeVin_V) / (R_bleed_kOhm * 1e3)) * 1e3;

    // =========================================================================
    // PART B: OUTPUT PORT (SECONDARY BUS) DM & CM NOISE SOURCE & FILTER SYNTHESIS
    // =========================================================================
    // Secondary ripple fundamental is f_ripple_kHz = m * f_sw
    const k_crit_out = Math.max(1, Math.ceil(150 / f_ripple_kHz));
    const f_crit_out_kHz = k_crit_out * f_ripple_kHz;
    const f_crit_out_Hz = f_crit_out_kHz * 1e3;
    const f_crit_out_MHz = f_crit_out_kHz / 1e3;

    // Secondary rectifier switching transition time & dv/dt
    const t_sw_sec_ns = Math.max(5, res.secDevice.tr_ns || 12);
    const dv_dt_sec_V_ns = Math.max(activeVout_V * 1.5, res.Vsec_overshoot_V) / t_sw_sec_ns;
    const C_cm_sec_pF = C_ww_pF * cmBridgeReduction * 0.75 + 45; // Secondary bus + SR heatsink to PE
    const C_cm_sec_F = C_cm_sec_pF * 1e-12;

    const evalUnfilteredOutputHarmonic = (n: number) => {
      const f_Hz = n * f_fund_Hz;
      const f_MHz = f_Hz / 1e6;
      const zLisnLine = evalLisnSingleLineOhm(f_Hz);
      const zLisnDm = 2 * zLisnLine;
      const zLisnCm = 0.5 * zLisnLine;
      const w = 2 * Math.PI * f_Hz;

      // Output inductor ripple current harmonic attenuated by main output cap bank C_out (with ESR & ESL)
      const deltaI_Lo_A = Math.max(0.5, res.deltaIout_net_A || Iout_dc_A * 0.2);
      const I_dm_sec_harm_A = (2 * deltaI_Lo_A) / (Math.PI * Math.PI * n * n) * (n % 2 === 0 ? 1.35 : 0.65);
      // Main output capacitor impedance at f_Hz (ESR ~ 3 mΩ, ESL ~ 4 nH, C_out = state.Co_uF)
      const C_out_F = Math.max(47, state.Co_uF) * 1e-6;
      const zMainCout = Math.hypot(0.0035, w * 4.5e-9 - 1 / (w * C_out_F));
      // Secondary ringing resonance boost near f_ring_MHz
      const f_ring_MHz = Math.max(2.5, res.f_ring_MHz || 14);
      const ringBoost = 1 + 2.8 / (1 + Math.pow((f_MHz - f_ring_MHz) / (0.28 * f_ring_MHz), 2));

      const V_dm_out_rms_V = (I_dm_sec_harm_A / Math.SQRT2) * zMainCout * ringBoost;
      const V_dm_out_unfilt_dBuV = 20 * Math.log10(Math.max(V_dm_out_rms_V * 1e6, 1.0));

      // Output CM noise from secondary dv/dt and C_ww coupling into 25 Ω LISN CM load
      const xTrSec = n * Math.PI * f_fund_Hz * (t_sw_sec_ns * 1e-9);
      const sincTrSec = xTrSec > 1e-4 ? Math.abs(Math.sin(xTrSec)) / xTrSec : 1.0;
      const V_cm_sec_pk_V =
        ((2 * Math.max(activeVout_V * 1.4, res.Vsec_overshoot_V * 0.6)) / (n * Math.PI)) *
        sincTrSec *
        ringBoost *
        0.55;
      const zCcmSec = 1 / (w * C_cm_sec_F);
      const V_cm_out_rms_V = (V_cm_sec_pk_V / Math.SQRT2) * (zLisnCm / Math.hypot(zCcmSec, zLisnCm));
      const V_cm_out_unfilt_dBuV = 20 * Math.log10(Math.max(V_cm_out_rms_V * 1e6, 1.0));

      const V_total_out_unfilt_dBuV =
        10 *
        Math.log10(
          Math.pow(10, V_dm_out_unfilt_dBuV / 10) + Math.pow(10, V_cm_out_unfilt_dBuV / 10)
        );

      const limits = std.getLimits_dBuV(Math.max(0.15, f_MHz));
      return {
        n,
        f_Hz,
        f_kHz: f_Hz / 1e3,
        f_MHz,
        V_dm_unfilt_dBuV: V_dm_out_unfilt_dBuV,
        V_cm_unfilt_dBuV: V_cm_out_unfilt_dBuV,
        V_total_unfilt_dBuV: V_total_out_unfilt_dBuV,
        limit_qp_dBuV: limits.qp,
        limit_avg_dBuV: limits.avg,
      };
    };

    const critOutHarmonicNum = Math.max(1, Math.ceil(150 / activeFsw_kHz));
    const critOutPt = evalUnfilteredOutputHarmonic(critOutHarmonicNum);
    const Att_DM_out_req_dB = Math.max(
      14,
      critOutPt.V_dm_unfilt_dBuV - critOutPt.limit_avg_dBuV + safetyMargin_dB
    );
    const Att_CM_out_req_dB = Math.max(
      14,
      critOutPt.V_cm_unfilt_dBuV - critOutPt.limit_avg_dBuV + safetyMargin_dB
    );

    const outSlope_dB_per_dec = 40 * outStageCount;
    const fc_DM_out_req_Hz = Math.min(
      f_crit_Hz * 0.5,
      Math.max(4000, f_crit_Hz / Math.pow(10, Att_DM_out_req_dB / outSlope_dB_per_dec))
    );
    const fc_CM_out_req_Hz = Math.min(
      f_crit_Hz * 0.5,
      Math.max(5000, f_crit_Hz / Math.pow(10, Att_CM_out_req_dB / outSlope_dB_per_dec))
    );

    // Synthesize Output DM Post-Filter (L_DM,out and C_DM,out)
    // Constrain L_DM,out by output current Iout_dc_A so it remains compact with ultra-low DCR
    const raw_LDM_out_uH =
      Iout_dc_A > 60 ? 0.47 : Iout_dc_A > 25 ? 1.0 : Iout_dc_A > 10 ? 2.2 : 4.7;
    const L_DM_out_stage_uH = snapToSeries(
      raw_LDM_out_uH * (100 / Math.max(40, activeFsw_kHz)),
      E12_SERIES,
      true
    );
    const L_DM_out_stage_H = L_DM_out_stage_uH * 1e-6;

    const raw_CDM_out_uF =
      (1 / (Math.pow(2 * Math.PI * fc_DM_out_req_Hz, 2) * L_DM_out_stage_H)) * 1e6;
    const C_DM_out_stage_uF = snapToSeries(
      Math.max(10, Math.min(220, raw_CDM_out_uF)),
      E6_SERIES,
      true
    );
    const C_DM_out_stage_F = C_DM_out_stage_uF * 1e-6;
    const fc_DM_out_actual_kHz =
      1 / (2 * Math.PI * Math.sqrt(L_DM_out_stage_H * C_DM_out_stage_F)) / 1e3;

    // Synthesize Output CM Filter (L_CM,out and C_Y,out)
    // Secondary DC bus allows larger Y-caps to chassis (10 nF - 47 nF) since there is no 60Hz AC line leakage
    const C_Y_out_line_nF = snapToSeries(
      activeVout_V <= 60 ? 22 : 10,
      Y_CAP_NP_SERIES,
      true
    );
    const C_Y_out_tot_F = 2 * C_Y_out_line_nF * 1e-9;
    const raw_LCM_out_uH =
      (1 / (Math.pow(2 * Math.PI * fc_CM_out_req_Hz, 2) * C_Y_out_tot_F)) * 1e6;
    const L_CM_out_stage_uH = snapToSeries(
      Math.max(100, Math.min(2200, raw_LCM_out_uH)),
      E12_SERIES,
      true
    );
    const L_CM_out_stage_H = L_CM_out_stage_uH * 1e-6;
    const fc_CM_out_actual_kHz =
      1 / (2 * Math.PI * Math.sqrt(L_CM_out_stage_H * C_Y_out_tot_F)) / 1e3;

    // =========================================================================
    // PART C: TRANSFER FUNCTIONS, HARMONIC SPECTRA & COMMERCIAL BOM
    // =========================================================================
    const EPC_cm_F = (coreType === 'nanocrystalline' ? 7.5 : 13.5) * 1e-12;
    const f_srf_CM_MHz = 1 / (2 * Math.PI * Math.sqrt(L_CM_stage_H * EPC_cm_F)) / 1e6;
    const ESL_cx_H = 12e-9;
    const f_srf_DM_MHz = 1 / (2 * Math.PI * Math.sqrt(ESL_cx_H * C_X_stage_F)) / 1e6;

    const evalInputFilterAttenuation = (f_Hz: number) => {
      const f_kHz = f_Hz / 1e3;
      const f_MHz = f_Hz / 1e6;

      const ratioDm = f_kHz / Math.max(fc_DM_actual_kHz, 0.5);
      const hfPenaltyDm = 1 + Math.pow(f_MHz / Math.max(f_srf_DM_MHz * 2.5, 4.0), 2);
      const il_dm_1st_dB =
        ratioDm <= 1
          ? 10 * Math.log10(1 + Math.pow(ratioDm, 4))
          : 40 * Math.log10(ratioDm) - 10 * Math.log10(hfPenaltyDm);
      const IL_DM_dB = Math.max(0, Math.min(105, il_dm_1st_dB * stageCount));

      const ratioCm = f_kHz / Math.max(fc_CM_actual_kHz, 0.5);
      const hfPenaltyCm = 1 + Math.pow(f_MHz / Math.max(f_srf_CM_MHz * 1.8, 3.5), 2.2);
      const il_cm_1st_dB =
        ratioCm <= 1
          ? 10 * Math.log10(1 + Math.pow(ratioCm, 4))
          : 40 * Math.log10(ratioCm) - 10 * Math.log10(hfPenaltyCm);
      const IL_CM_dB = Math.max(0, Math.min(110, il_cm_1st_dB * stageCount));

      return { IL_DM_dB, IL_CM_dB };
    };

    const evalOutputFilterAttenuation = (f_Hz: number) => {
      const f_kHz = f_Hz / 1e3;
      const f_MHz = f_Hz / 1e6;

      const ratioDmOut = f_kHz / Math.max(fc_DM_out_actual_kHz, 0.5);
      const hfPenaltyDmOut = 1 + Math.pow(f_MHz / 12.0, 2);
      const il_dm_out_1st_dB =
        ratioDmOut <= 1
          ? 10 * Math.log10(1 + Math.pow(ratioDmOut, 4))
          : 40 * Math.log10(ratioDmOut) - 10 * Math.log10(hfPenaltyDmOut);
      const IL_DM_out_dB = Math.max(0, Math.min(95, il_dm_out_1st_dB * outStageCount));

      const ratioCmOut = f_kHz / Math.max(fc_CM_out_actual_kHz, 0.5);
      const hfPenaltyCmOut = 1 + Math.pow(f_MHz / 9.5, 2);
      const il_cm_out_1st_dB =
        ratioCmOut <= 1
          ? 10 * Math.log10(1 + Math.pow(ratioCmOut, 4))
          : 40 * Math.log10(ratioCmOut) - 10 * Math.log10(hfPenaltyCmOut);
      const IL_CM_out_dB = Math.max(0, Math.min(95, il_cm_out_1st_dB * outStageCount));

      return { IL_DM_dB: IL_DM_out_dB, IL_CM_dB: IL_CM_out_dB };
    };

    // Build Input & Output Harmonic Spectra (up to 30 MHz, max 90 harmonics)
    const maxHarmonic = Math.min(90, Math.floor(30000 / activeFsw_kHz));
    const inputHarmonics = [];
    const outputHarmonics = [];
    let worstFilteredMargin_dB = 99;
    let worstOutputMargin_dB = 99;
    let worstHarmonicFreq_MHz = f_crit_MHz;

    for (let n = 1; n <= maxHarmonic; n++) {
      const rawIn = evalUnfilteredInputHarmonic(n);
      const rawOut = evalUnfilteredOutputHarmonic(n);
      if (rawIn.f_kHz < 100) continue;

      const attIn = evalInputFilterAttenuation(rawIn.f_Hz);
      const V_dm_filt_dBuV = Math.max(8, rawIn.V_dm_unfilt_dBuV - attIn.IL_DM_dB);
      const V_cm_filt_dBuV = Math.max(8, rawIn.V_cm_unfilt_dBuV - attIn.IL_CM_dB);
      const V_tot_filt_dBuV =
        10 * Math.log10(Math.pow(10, V_dm_filt_dBuV / 10) + Math.pow(10, V_cm_filt_dBuV / 10));
      const margin_avg_dB = rawIn.limit_avg_dBuV - V_tot_filt_dBuV;

      if (rawIn.f_kHz >= 150 && margin_avg_dB < worstFilteredMargin_dB) {
        worstFilteredMargin_dB = margin_avg_dB;
        worstHarmonicFreq_MHz = rawIn.f_MHz;
      }

      inputHarmonics.push({
        ...rawIn,
        IL_DM_dB: attIn.IL_DM_dB,
        IL_CM_dB: attIn.IL_CM_dB,
        V_dm_filt_dBuV,
        V_cm_filt_dBuV,
        V_tot_filt_dBuV,
        margin_avg_dB,
      });

      const attOut = evalOutputFilterAttenuation(rawOut.f_Hz);
      const V_dm_out_filt_dBuV = Math.max(8, rawOut.V_dm_unfilt_dBuV - attOut.IL_DM_dB);
      const V_cm_out_filt_dBuV = Math.max(8, rawOut.V_cm_unfilt_dBuV - attOut.IL_CM_dB);
      const V_tot_out_filt_dBuV =
        10 *
        Math.log10(
          Math.pow(10, V_dm_out_filt_dBuV / 10) + Math.pow(10, V_cm_out_filt_dBuV / 10)
        );
      const margin_out_avg_dB = rawOut.limit_avg_dBuV - V_tot_out_filt_dBuV;
      if (rawOut.f_kHz >= 150 && margin_out_avg_dB < worstOutputMargin_dB) {
        worstOutputMargin_dB = margin_out_avg_dB;
      }

      outputHarmonics.push({
        ...rawOut,
        IL_DM_dB: attOut.IL_DM_dB,
        IL_CM_dB: attOut.IL_CM_dB,
        V_dm_filt_dBuV: V_dm_out_filt_dBuV,
        V_cm_filt_dBuV: V_cm_out_filt_dBuV,
        V_tot_filt_dBuV: V_tot_out_filt_dBuV,
        margin_avg_dB: margin_out_avg_dB,
      });
    }

    const critFiltered = inputHarmonics.find((h) => h.n === k_crit) || inputHarmonics[0];
    const critOutFiltered =
      outputHarmonics.find((h) => h.n === critOutHarmonicNum) || outputHarmonics[0];

    // Continuous Attenuation Curve (10 kHz to 30 MHz) for Input & Output Filters
    const evalAttenuationAtMHz = (f_MHz: number) => {
      const f_Hz = Math.max(1e3, f_MHz * 1e6);
      const attIn = evalInputFilterAttenuation(f_Hz);
      const attOut = evalOutputFilterAttenuation(f_Hz);
      return {
        f_Hz,
        f_kHz: f_Hz / 1e3,
        f_MHz,
        IL_DM_dB: Number(attIn.IL_DM_dB.toFixed(2)),
        IL_CM_dB: Number(attIn.IL_CM_dB.toFixed(2)),
        IL_DM_out_dB: Number(attOut.IL_DM_dB.toFixed(2)),
        IL_CM_out_dB: Number(attOut.IL_CM_dB.toFixed(2)),
      };
    };

    const evalSpectrumEnvelopeAtMHz = (f_MHz: number, port: 'input' | 'output') => {
      const f_Hz = Math.max(10e3, f_MHz * 1e6);
      const nEff = Math.max(1, f_Hz / Math.max(1e3, f_fund_Hz));
      const raw =
        port === 'input'
          ? evalUnfilteredInputHarmonic(nEff)
          : evalUnfilteredOutputHarmonic(nEff);
      const att =
        port === 'input'
          ? evalInputFilterAttenuation(f_Hz)
          : evalOutputFilterAttenuation(f_Hz);
      const V_dm_filt_dBuV = Math.max(8, raw.V_dm_unfilt_dBuV - att.IL_DM_dB);
      const V_cm_filt_dBuV = Math.max(8, raw.V_cm_unfilt_dBuV - att.IL_CM_dB);
      const V_tot_filt_dBuV =
        10 * Math.log10(Math.pow(10, V_dm_filt_dBuV / 10) + Math.pow(10, V_cm_filt_dBuV / 10));
      const limits = std.getLimits_dBuV(Math.max(0.15, f_MHz));
      return {
        f_MHz: Number(f_MHz.toFixed(4)),
        V_tot_filt_dBuV: Number(V_tot_filt_dBuV.toFixed(2)),
        V_dm_unfilt_dBuV: Number(raw.V_dm_unfilt_dBuV.toFixed(2)),
        V_cm_unfilt_dBuV: Number(raw.V_cm_unfilt_dBuV.toFixed(2)),
        limit_qp_dBuV: Number(limits.qp.toFixed(2)),
        limit_avg_dBuV: Number(limits.avg.toFixed(2)),
      };
    };

    const attenuationCurve = [];
    for (let i = 0; i <= 70; i++) {
      const f_Hz = 10e3 * Math.pow(30e6 / 10e3, i / 70);
      attenuationCurve.push(evalAttenuationAtMHz(f_Hz / 1e6));
    }

    // Complete Commercial BOM Table covering Input & Output DM/CM Inductors & Capacitors
    const vRatingCap = activeVin_V > 500 ? '800V DC / 440VAC X1' : '630V DC / 310VAC X2';
    const vRatingOutCap = activeVout_V > 200 ? `${Math.ceil(activeVout_V * 1.5)}V Film/MLCC` : `${Math.max(25, Math.ceil(activeVout_V * 2))}V X7R MLCC + Polymer`;

    const bom: FilterStageComponentSpec[] = [
      {
        port: 'Input',
        mode: 'DM',
        refDes: stageCount === 2 ? 'CX1, CX2, CX3' : 'CX1, CX2',
        role: 'Input Differential-Mode X-Capacitors',
        valueFormatted: `${C_X_stage_uF} µF (×${stageCount + 1})`,
        ratingFormatted: vRatingCap,
        dielectricOrCore: 'Metallized Polypropylene Film (MKP)',
        mpn: C_X_stage_uF >= 2.2 ? 'B32924C3225M' : 'R46KI347050M1K',
        manufacturer: C_X_stage_uF >= 2.2 ? 'TDK EPCOS' : 'KEMET',
        lcsc: C_X_stage_uF >= 2.2 ? 'C115422' : 'C94672',
        notes: `fc,DM,in = ${fc_DM_actual_kHz.toFixed(1)} kHz; Low-ESL (<12 nH) safety film`,
      },
      {
        port: 'Input',
        mode: 'CM',
        refDes: stageCount === 2 ? 'LCM,in1, LCM,in2' : 'LCM,in1',
        role: 'Input Common-Mode Choke(s)',
        valueFormatted: `${L_CM_stage_mH} mH @ 10 kHz (×${stageCount})`,
        ratingFormatted: `${Math.ceil(Iin_dc_A * 1.25)} A RMS, 1500 VAC Hi-Pot`,
        dielectricOrCore:
          coreType === 'nanocrystalline'
            ? 'Nanocrystalline Vitroperm 500F (µi=60,000, Bsat=1.2T)'
            : coreType === 'mnzn-t38'
            ? 'TDK Ferrite T38 Toroid (µi=10,000, Bsat=0.38T)'
            : 'TDK Ferrite N30 Toroid (µi=4,300, Broadband)',
        mpn:
          coreType === 'nanocrystalline'
            ? 'T60405-R6123-X016'
            : 'B82725S2103N040',
        manufacturer: coreType === 'nanocrystalline' ? 'VACUUMSCHMELZE (VAC)' : 'TDK EPCOS',
        lcsc: coreType === 'nanocrystalline' ? 'C512904' : 'C129482',
        notes: `fc,CM,in = ${fc_CM_actual_kHz.toFixed(1)} kHz; f_SRF = ${f_srf_CM_MHz.toFixed(1)} MHz`,
      },
      {
        port: 'Input',
        mode: 'DM',
        refDes: useCmLeakageForDm ? 'Llk(LCM,in)' : stageCount === 2 ? 'LDM,in1, LDM,in2' : 'LDM,in1',
        role: useCmLeakageForDm
          ? 'Input Integrated CM Leakage DM Inductance'
          : 'Input Discrete Differential-Mode Choke(s)',
        valueFormatted: `${L_DM_stage_uH} µH (×${stageCount})`,
        ratingFormatted: `${Math.ceil(Iin_dc_A * 1.35)} A DC Bias (No Saturation)`,
        dielectricOrCore: useCmLeakageForDm
          ? '0.75% Leakage Flux of LCM Toroid (Zero Extra Core)'
          : 'Magnetics Kool Mµ / Sendust Powder Core (µ=60)',
        mpn: useCmLeakageForDm ? 'Integrated in LCM,in' : '744373965150',
        manufacturer: useCmLeakageForDm ? 'Internal Leakage' : 'Würth Elektronik',
        lcsc: useCmLeakageForDm ? '—' : 'C135718',
        notes: useCmLeakageForDm
          ? `Utilizes ${L_lk_from_CM_uH} µH leakage inductance of Input CM Choke`
          : `Distributed air-gap powder core immune to ${Iin_dc_A.toFixed(1)} A DC input bias`,
      },
      {
        port: 'Input',
        mode: 'CM',
        refDes: stageCount === 2 ? 'CY,in1..CY,in4' : 'CY,in1, CY,in2',
        role: 'Input Common-Mode Y2 Safety Capacitors',
        valueFormatted: `${C_Y_line_nF} nF/line to PE (×${stageCount * 2})`,
        ratingFormatted: '300 VAC Y2 / 2500 VDC Impulse',
        dielectricOrCore: 'Class I C0G / High-Stability X7R Safety Disc',
        mpn: 'DE2E3KY472MA3BM02F',
        manufacturer: 'Murata',
        lcsc: 'C106238',
        notes: `Total PE leakage = ${I_leak_PE_mA.toFixed(2)} mA (Limit ≤ ${maxLeakage_mA} mA)`,
      },
      {
        port: 'Output',
        mode: 'DM',
        refDes: outStageCount === 2 ? 'LDM,out1, LDM,out2' : 'LDM,out1',
        role: 'Output Differential-Mode Post-Filter Inductor',
        valueFormatted: `${L_DM_out_stage_uH} µH (×${outStageCount})`,
        ratingFormatted: `${Math.ceil(Iout_dc_A * 1.35)} A Isat, DCR ≤ 0.65 mΩ`,
        dielectricOrCore: 'Flat-Wire Helical Shielded Composite Powder Core',
        mpn: Iout_dc_A > 35 ? '74436410100' : 'IHLP6767GZER2R2M11',
        manufacturer: Iout_dc_A > 35 ? 'Würth Elektronik' : 'Vishay Dale',
        lcsc: Iout_dc_A > 35 ? 'C408122' : 'C89235',
        notes: `fc,DM,out = ${fc_DM_out_actual_kHz.toFixed(1)} kHz; Attenuates ${f_ripple_kHz} kHz ripple & ${res.f_ring_MHz.toFixed(1)} MHz SR ringing`,
      },
      {
        port: 'Output',
        mode: 'DM',
        refDes: outStageCount === 2 ? 'CDM,out1, CDM,out2' : 'CDM,out1',
        role: 'Output Differential-Mode HF Decoupling Bank',
        valueFormatted: `${C_DM_out_stage_uF} µF (×${outStageCount})`,
        ratingFormatted: vRatingOutCap,
        dielectricOrCore: 'Low-ESL 1210 X7R MLCC Array + Conductive Polymer',
        mpn: activeVout_V <= 60 ? 'GRM32ER71H106KA12L' : 'C5750X7T2E225K250KA',
        manufacturer: activeVout_V <= 60 ? 'Murata' : 'TDK',
        lcsc: activeVout_V <= 60 ? 'C13585' : 'C90418',
        notes: `Provides ${critOutFiltered.IL_DM_dB.toFixed(1)} dB output DM attenuation at ${f_crit_out_kHz} kHz`,
      },
      {
        port: 'Output',
        mode: 'CM',
        refDes: outStageCount === 2 ? 'LCM,out1, LCM,out2' : 'LCM,out1',
        role: 'Output Common-Mode Busbar/Toroid Choke',
        valueFormatted: `${L_CM_out_stage_uH >= 1000 ? `${(L_CM_out_stage_uH / 1000).toFixed(2)} mH` : `${L_CM_out_stage_uH} µH`} (×${outStageCount})`,
        ratingFormatted: `${Math.ceil(Iout_dc_A * 1.25)} A DC Rated`,
        dielectricOrCore: 'High-Permeability Bifilar Nanocrystalline / MnZn Core',
        mpn: Iout_dc_A > 30 ? '7448392021' : 'B82724J2602N001',
        manufacturer: Iout_dc_A > 30 ? 'Würth Elektronik' : 'TDK EPCOS',
        lcsc: Iout_dc_A > 30 ? 'C289104' : 'C116220',
        notes: `fc,CM,out = ${fc_CM_out_actual_kHz.toFixed(1)} kHz; Suppresses secondary dv/dt (${dv_dt_sec_V_ns.toFixed(1)} V/ns) CM currents`,
      },
      {
        port: 'Output',
        mode: 'CM',
        refDes: 'CY,out+, CY,out-',
        role: 'Output Common-Mode Chassis Bypass Capacitors',
        valueFormatted: `${C_Y_out_line_nF} nF/rail to PE (×${outStageCount * 2})`,
        ratingFormatted: `${Math.max(250, Math.ceil(activeVout_V * 3))} VDC Low-ESL Ceramic`,
        dielectricOrCore: '0805 / 1206 C0G / X7R Soft-Termination',
        mpn: 'GA342DR7GF223KW01L',
        manufacturer: 'Murata',
        lcsc: 'C158921',
        notes: `Shunts high-frequency secondary common-mode noise to chassis ground`,
      },
      ...(includeY1BridgeCap
        ? [
            {
              port: 'Bridge' as const,
              mode: 'CM' as const,
              refDes: 'CY,bridge (Y1)',
              role: 'Pri-to-Sec Isolation Barrier Return Capacitor',
              valueFormatted: `${C_Y_bridge_nF} nF Y1 Safety`,
              ratingFormatted: '500 VAC Y1 / 8000 V Impulse Reinforced Isolation',
              dielectricOrCore: 'Safety Certified Ceramic Disc Y1 (IEC 60384-14)',
              mpn: 'DE1E3KX222MA4BP01F',
              manufacturer: 'Murata',
              lcsc: 'C108452',
              notes: `Local return path for C_ww = ${C_ww_pF.toFixed(0)} pF transformer displacement current`,
            },
          ]
        : []),
      {
        port: 'Input',
        mode: 'Damping / Safety',
        refDes: 'Rd, Cd + Rbleed',
        role: 'Middlebrook Input Damper & IEC 62368-1 Bleeder',
        valueFormatted: `Rd=${R_d_Ohm}Ω, Cd=${C_d_uF}µF | Rbleed=${R_bleed_kOhm}kΩ`,
        ratingFormatted: `Rd: 2W Pulse | Rbleed: ${P_bleed_mW.toFixed(0)} mW`,
        dielectricOrCore: 'MELF Pulse Resistor + MKP Film + HV Thick Film',
        mpn: 'CRCW2512 + HVR37',
        manufacturer: 'Vishay / TDK',
        lcsc: 'C291844',
        notes: `Clamps input filter peak to ${Zout_damped_pk_dBOhm.toFixed(1)} dBΩ (ΔZ_MB = +${middlebrookMargin_dB.toFixed(1)} dB)`,
      },
    ];

    return {
      std,
      Pin_W,
      Iin_dc_A,
      Iout_dc_A,
      t_sw_ns,
      dv_dt_V_ns,
      dv_dt_sec_V_ns,
      C_ww_pF,
      C_cm_total_pF,
      C_cm_sec_pF,
      C_Y_bridge_nF,
      k_crit,
      f_crit_kHz,
      f_crit_MHz,
      critPt,
      critFiltered,
      Att_DM_req_dB,
      Att_CM_req_dB,
      fc_DM_req_Hz,
      fc_CM_req_Hz,
      fc_DM_actual_kHz,
      fc_CM_actual_kHz,
      C_X_stage_uF,
      C_X_total_uF,
      L_DM_stage_uH,
      L_lk_from_CM_uH,
      L_CM_stage_mH,
      C_Y_line_nF,
      total_CY_line_nF,
      I_leak_PE_mA,
      C_d_uF,
      R_d_Ohm,
      R_bleed_kOhm,
      P_bleed_mW,
      Zin_neg_dBOhm,
      Zout_damped_pk_dBOhm,
      Zout_undamped_pk_dBOhm,
      middlebrookMargin_dB,
      middlebrookPass,
      f_srf_CM_MHz,
      f_srf_DM_MHz,
      // Output EMI Filter Synthesized Metrics
      f_crit_out_kHz,
      f_crit_out_MHz,
      critOutPt,
      critOutFiltered,
      Att_DM_out_req_dB,
      Att_CM_out_req_dB,
      fc_DM_out_actual_kHz,
      fc_CM_out_actual_kHz,
      L_DM_out_stage_uH,
      C_DM_out_stage_uF,
      L_CM_out_stage_uH,
      C_Y_out_line_nF,
      worstOutputMargin_dB,
      // Spectra & BOM
      harmonics: inputHarmonics,
      outputHarmonics,
      attenuationCurve,
      evalAttenuationAtMHz,
      evalSpectrumEnvelopeAtMHz,
      worstFilteredMargin_dB,
      worstHarmonicFreq_MHz,
      bom,
    };
  }, [
    standardId,
    stageCount,
    outStageCount,
    safetyMargin_dB,
    coreType,
    heatsinkCp_pF,
    maxLeakage_mA,
    useCmLeakageForDm,
    includeY1BridgeCap,
    activeFsw_kHz,
    activePout_W,
    activeVin_V,
    activeVout_V,
    nPhases,
    f_ripple_kHz,
    state.Co_uF,
    res.efficiency_pct,
    res.Deff_nom,
    res.deltaIout_net_A,
    res.Vsec_overshoot_V,
    res.f_ring_MHz,
    res.priDevice.tr_ns,
    res.priDevice.tf_ns,
    res.secDevice.tr_ns,
    res.Cww_pF,
  ]);

  const activeSpectrumHarmonics =
    spectrumPort === 'input' ? emiDesign.harmonics : emiDesign.outputHarmonics;
  const activeHarmonic =
    hoveredHarmonicIdx !== null && activeSpectrumHarmonics[hoveredHarmonicIdx]
      ? activeSpectrumHarmonics[hoveredHarmonicIdx]
      : spectrumPort === 'input'
      ? emiDesign.critFiltered
      : emiDesign.critOutFiltered;

  const filteredBom = emiDesign.bom.filter((item) => {
    if (bomPortFilter === 'both') return true;
    if (bomPortFilter === 'input') return item.port === 'Input' || item.port === 'Bridge';
    return item.port === 'Output' || item.port === 'Bridge';
  });

  // SVG Coordinate Helpers for Conducted Emission Spectrum (100 kHz to 30 MHz, 10 to 125 dBµV)
  const svgW = 860;
  const svgH = 340;
  const padL = 56;
  const padR = 24;
  const padT = 24;
  const padB = 42;
  const plotW = svgW - padL - padR;
  const plotH = svgH - padT - padB;

  const fMin_MHz = 0.1;
  const fMax_MHz = 30.0;
  const logMin = Math.log10(fMin_MHz);
  const logMax = Math.log10(fMax_MHz);

  const freqToX = (f_MHz: number) => {
    const clamped = Math.max(fMin_MHz, Math.min(fMax_MHz, f_MHz));
    return padL + ((Math.log10(clamped) - logMin) / (logMax - logMin)) * plotW;
  };

  const yMin_dBuV = 10;
  const yMax_dBuV = 125;
  const dBuVToY = (val: number) => {
    const clamped = Math.max(yMin_dBuV, Math.min(yMax_dBuV, val));
    return padT + plotH - ((clamped - yMin_dBuV) / (yMax_dBuV - yMin_dBuV)) * plotH;
  };

  // Build CISPR Limit Polylines across 0.15 MHz to 30 MHz
  const limitPts = [0.15, 0.25, 0.3, 0.4999, 0.5, 1.8, 1.8001, 5.0, 5.0001, 5.9, 5.9001, 30.0];
  const qpPath = limitPts
    .map((f, idx) => {
      const lim = emiDesign.std.getLimits_dBuV(f).qp;
      return `${idx === 0 ? 'M' : 'L'} ${freqToX(f).toFixed(1)} ${dBuVToY(lim).toFixed(1)}`;
    })
    .join(' ');
  const avgPath = limitPts
    .map((f, idx) => {
      const lim = emiDesign.std.getLimits_dBuV(f).avg;
      return `${idx === 0 ? 'M' : 'L'} ${freqToX(f).toFixed(1)} ${dBuVToY(lim).toFixed(1)}`;
    })
    .join(' ');

  return (
    <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-4">
      {/* HEADER BAR */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Radio className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-bold font-mono text-slate-900 dark:text-slate-100">
              EMI Filter Synthesis — Input &amp; Output Common-Mode (CM) &amp; Differential-Mode (DM)
            </h3>
            <span
              className={`px-2 py-0.5 text-[11px] font-mono font-semibold rounded inline-flex items-center gap-1 ${
                emiDesign.worstFilteredMargin_dB >= 0 &&
                emiDesign.worstOutputMargin_dB >= 0 &&
                emiDesign.middlebrookPass
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                  : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
              }`}
            >
              {emiDesign.worstFilteredMargin_dB >= 0 && emiDesign.worstOutputMargin_dB >= 0 ? (
                <>
                  <ShieldCheck className="w-3.5 h-3.5" /> {emiDesign.std.shortName} IN/OUT COMPLIANT (In +{emiDesign.worstFilteredMargin_dB.toFixed(1)} dB | Out +{emiDesign.worstOutputMargin_dB.toFixed(1)} dB)
                </>
              ) : (
                <>
                  <AlertTriangle className="w-3.5 h-3.5" /> INCREASE STAGES (In {emiDesign.worstFilteredMargin_dB.toFixed(1)} dB | Out {emiDesign.worstOutputMargin_dB.toFixed(1)} dB)
                </>
              )}
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Recommends <strong className="text-cyan-400">Input &amp; Output DM Inductors/Capacitors</strong> and{' '}
            <strong className="text-purple-400">Input &amp; Output CM Chokes/Y-Capacitors</strong> based on switching frequency{' '}
            <span className="font-mono text-slate-300">
              f_sw = {activeFsw_kHz} kHz
            </span>{' '}
            and power level{' '}
            <span className="font-mono text-slate-300">
              P_out = {activePout_W} W (V_in = {activeVin_V} V, V_out = {activeVout_V} V)
            </span>.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {isSandboxDirty && (
            <button
              type="button"
              onClick={() => {
                fswSandboxLock.resetToAuto();
                poutSandboxLock.resetToAuto();
              }}
              className="px-2.5 py-1 text-[11px] font-mono bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 rounded cursor-pointer"
            >
              Reset f_sw / P_out Sandbox
            </button>
          )}
          {isSandboxDirty && (
            <button
              type="button"
              onClick={() => {
                applyDcdcPatch({
                  fsw_kHz: activeFsw_kHz,
                  Pout_W: activePout_W,
                });
                fswSandboxLock.resetToAuto();
                poutSandboxLock.resetToAuto();
              }}
              className="px-2.5 py-1 text-[11px] font-mono bg-emerald-600 hover:bg-emerald-500 text-white rounded font-semibold cursor-pointer"
            >
              Apply Sandbox f_sw &amp; P_out to Power Stage
            </button>
          )}
          {onOpenPartDrawer && (
            <button
              type="button"
              onClick={onOpenPartDrawer}
              className="px-2.5 py-1 text-[11px] font-mono bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/40 text-cyan-300 rounded inline-flex items-center gap-1 font-semibold cursor-pointer"
            >
              <ExternalLink className="w-3 h-3" /> Search EMI Parts in LCSC Catalog
            </button>
          )}
        </div>
      </div>

      {/* ROW 1: OPERATING POINT CONTROLS (5 COLS) + 4-QUADRANT INPUT/OUTPUT CM & DM SYNTHESIS CARDS (7 COLS) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5">
        {/* Left Control Column (5 cols) */}
        <div className="lg:col-span-5 bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 rounded-lg p-3.5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-400 inline-flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5" /> 1. Switching Frequency, Power &amp; Filter Topology
            </span>
            <span className="text-[11px] font-mono text-slate-400">
              f_rip = {f_ripple_kHz} kHz
            </span>
          </div>

          {/* EMC Standard Selector */}
          <div>
            <label className="block text-[11px] font-mono text-slate-400 mb-1">
              Target Conducted Emission Standard (150 kHz – 30 MHz LISN)
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              {(Object.values(EMC_STANDARDS) as EmcStandardSpec[]).map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setStandardId(s.id)}
                  className={`px-2 py-1.5 text-left rounded border transition-colors cursor-pointer ${
                    standardId === s.id
                      ? 'bg-cyan-600/15 border-cyan-500 text-cyan-300 font-semibold'
                      : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="text-xs font-mono">{s.shortName}</div>
                  <div className="text-[10px] font-mono text-slate-500 truncate">{s.application}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Switching Frequency & Power Sliders */}
          <div className="grid grid-cols-2 gap-2.5 pt-1">
            <div>
              <div className="flex justify-between items-center text-[11px] font-mono">
                <span className="text-slate-400">Switching Freq f_sw</span>
                <div className="inline-flex items-center gap-1">
                  <span className="text-cyan-400 font-bold tabular-nums">{activeFsw_kHz} kHz</span>
                  <LockToggleButton compact locked={fswSandboxLock.locked} onToggle={fswSandboxLock.toggleLock} label="Sandbox f_sw" />
                </div>
              </div>
              <input
                type="range"
                min={25}
                max={500}
                step={5}
                value={activeFsw_kHz}
                onChange={(e) => fswSandboxLock.setManual(Number(e.target.value))}
                className="w-full accent-cyan-500 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] font-mono text-slate-500">
                <span>25 kHz</span>
                <span>150 kHz (CISPR)</span>
                <span>500 kHz</span>
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center text-[11px] font-mono">
                <span className="text-slate-400">Power Level P_out</span>
                <div className="inline-flex items-center gap-1">
                  <span className="text-emerald-400 font-bold tabular-nums">{activePout_W} W</span>
                  <LockToggleButton compact locked={poutSandboxLock.locked} onToggle={poutSandboxLock.toggleLock} label="Sandbox P_out" />
                </div>
              </div>
              <input
                type="range"
                min={200}
                max={12000}
                step={100}
                value={activePout_W}
                onChange={(e) => poutSandboxLock.setManual(Number(e.target.value))}
                className="w-full accent-emerald-500 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] font-mono text-slate-500">
                <span>I_in={emiDesign.Iin_dc_A.toFixed(1)}A</span>
                <span>I_out={emiDesign.Iout_dc_A.toFixed(1)}A</span>
              </div>
            </div>
          </div>

          {/* Input & Output Stage Counts + Choke Core Material */}
          <div className="grid grid-cols-3 gap-2 pt-1 border-t border-slate-200 dark:border-slate-800">
            <div>
              <div className="flex items-center justify-between gap-1 mb-1">
                <label className="text-[10px] font-mono text-slate-400">
                  Input Stages
                </label>
                <LockToggleButton compact locked={stageCountLock.locked} onToggle={stageCountLock.toggleLock} label="Input Filter Stages" />
              </div>
              <div className="grid grid-cols-2 gap-1">
                {([1, 2] as FilterStageCount[]).map((cnt) => (
                  <button
                    key={cnt}
                    type="button"
                    onClick={() => stageCountLock.setManual(cnt)}
                    className={`px-1.5 py-1 text-[11px] font-mono rounded border cursor-pointer ${
                      stageCount === cnt
                        ? 'bg-cyan-600/20 border-cyan-500 text-cyan-300 font-semibold'
                        : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-400'
                    }`}
                  >
                    {cnt}-Stg
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between gap-1 mb-1">
                <label className="text-[10px] font-mono text-slate-400">
                  Output Stages
                </label>
                <LockToggleButton compact locked={outStageCountLock.locked} onToggle={outStageCountLock.toggleLock} label="Output Filter Stages" />
              </div>
              <div className="grid grid-cols-2 gap-1">
                {([1, 2] as FilterStageCount[]).map((cnt) => (
                  <button
                    key={cnt}
                    type="button"
                    onClick={() => outStageCountLock.setManual(cnt)}
                    className={`px-1.5 py-1 text-[11px] font-mono rounded border cursor-pointer ${
                      outStageCount === cnt
                        ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300 font-semibold'
                        : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-400'
                    }`}
                  >
                    {cnt}-Stg
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between gap-1 mb-1">
                <label className="text-[10px] font-mono text-slate-400">
                  CM Core Material
                </label>
                <LockToggleButton compact locked={coreTypeLock.locked} onToggle={coreTypeLock.toggleLock} label="CM Core Material" />
              </div>
              <select
                value={coreType}
                onChange={(e) => coreTypeLock.setManual(e.target.value as ChokeCoreMaterial)}
                className="w-full px-1.5 py-1 text-[11px] font-mono bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded text-slate-200"
              >
                <option value="nanocrystalline">Nanocryst. (µ=60k)</option>
                <option value="mnzn-t38">TDK T38 (µ=10k)</option>
                <option value="mnzn-n30">TDK N30 (µ=4.3k)</option>
              </select>
            </div>
          </div>

          {/* Parasitic CM Capacitance, Safety Margin & Leakage Cap */}
          <div className="grid grid-cols-3 gap-2 pt-1 border-t border-slate-200 dark:border-slate-800">
            <div>
              <div className="flex justify-between items-center text-[10px] font-mono">
                <span className="text-slate-400">Margin</span>
                <div className="inline-flex items-center gap-1">
                  <span className="text-amber-400 font-bold tabular-nums">+{safetyMargin_dB} dB</span>
                  <LockToggleButton compact locked={safetyMarginLock.locked} onToggle={safetyMarginLock.toggleLock} label="EMC Margin" />
                </div>
              </div>
              <input
                type="range"
                min={3}
                max={12}
                step={1}
                value={safetyMargin_dB}
                onChange={(e) => safetyMarginLock.setManual(Number(e.target.value))}
                className="w-full accent-amber-500 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between items-center text-[10px] font-mono">
                <span className="text-slate-400">C_p,hs</span>
                <div className="inline-flex items-center gap-1">
                  <span className="text-purple-400 font-bold tabular-nums">{heatsinkCp_pF} pF</span>
                  <LockToggleButton compact locked={heatsinkCpLock.locked} onToggle={heatsinkCpLock.toggleLock} label="Heatsink Capacitance" />
                </div>
              </div>
              <input
                type="range"
                min={15}
                max={350}
                step={5}
                value={heatsinkCp_pF}
                onChange={(e) => heatsinkCpLock.setManual(Number(e.target.value))}
                className="w-full accent-purple-500 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between items-center text-[10px] font-mono">
                <span className="text-slate-400">PE I_leak</span>
                <div className="inline-flex items-center gap-1">
                  <span className="text-emerald-400 font-bold tabular-nums">{maxLeakage_mA} mA</span>
                  <LockToggleButton compact locked={maxLeakageLock.locked} onToggle={maxLeakageLock.toggleLock} label="Max PE Leakage" />
                </div>
              </div>
              <select
                value={maxLeakage_mA}
                onChange={(e) => maxLeakageLock.setManual(Number(e.target.value))}
                className="w-full mt-0.5 px-1.5 py-0.5 text-[11px] font-mono bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded text-slate-200"
              >
                <option value={0.75}>0.75 mA (Med/Hand)</option>
                <option value={3.5}>3.5 mA (IEC 62368)</option>
                <option value={5.0}>5.0 mA (Industrial)</option>
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-200 dark:border-slate-800">
            <div className="inline-flex items-center gap-1.5">
              <label className="inline-flex items-center gap-1.5 text-[11px] font-mono text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useCmLeakageForDm}
                  onChange={(e) => cmLeakageDmLock.setManual(e.target.checked)}
                  className="rounded accent-cyan-500"
                />
                Use LCM Leakage ({emiDesign.L_lk_from_CM_uH} µH) as Input L_DM
              </label>
              <LockToggleButton compact locked={cmLeakageDmLock.locked} onToggle={cmLeakageDmLock.toggleLock} label="CM Leakage for DM" />
            </div>
            <div className="inline-flex items-center gap-1.5">
              <label className="inline-flex items-center gap-1.5 text-[11px] font-mono text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeY1BridgeCap}
                  onChange={(e) => y1BridgeLock.setManual(e.target.checked)}
                  className="rounded accent-purple-500"
                />
                Pri-Sec Y1 Bridge Cap (2.2 nF)
              </label>
              <LockToggleButton compact locked={y1BridgeLock.locked} onToggle={y1BridgeLock.toggleLock} label="Y1 Bridge Cap" />
            </div>
          </div>
        </div>

        {/* Right 4-Quadrant Input & Output CM/DM Recommended Component Cards (7 cols) */}
        <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {/* Card 1: INPUT Differential-Mode (DM) Recommended L & C */}
          <div className="bg-slate-50 dark:bg-slate-900/70 border border-cyan-500/30 rounded-lg p-3 flex flex-col justify-between space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-400">
                1. Input DM Filter (Primary Bus)
              </span>
              <span className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                Req: {emiDesign.Att_DM_req_dB.toFixed(1)} dB @ {emiDesign.f_crit_kHz} kHz
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
              <div className="p-2 rounded bg-slate-950/60 border border-slate-800">
                <div className="text-[10px] text-slate-400">Rec. Input DM Inductor</div>
                <div className="text-sm font-bold text-amber-300">
                  L_DM,in = {emiDesign.L_DM_stage_uH} µH
                </div>
                <div className="text-[10px] text-slate-500">
                  {stageCount}× Stage ({useCmLeakageForDm ? 'LCM L_lk' : 'Kool Mµ'})
                </div>
              </div>
              <div className="p-2 rounded bg-slate-950/60 border border-slate-800">
                <div className="text-[10px] text-slate-400">Rec. Input X-Capacitor</div>
                <div className="text-sm font-bold text-emerald-300">
                  C_X,in = {emiDesign.C_X_stage_uF} µF
                </div>
                <div className="text-[10px] text-slate-500">
                  {stageCount + 1}× MKP Safety Film
                </div>
              </div>
            </div>

            <div className="border-t border-slate-800 pt-1.5 flex items-center justify-between text-[11px] font-mono">
              <span className="text-slate-400">
                f_c,DM,in = <strong className="text-cyan-300">{emiDesign.fc_DM_actual_kHz.toFixed(1)} kHz</strong>
              </span>
              <span className="text-emerald-400">
                Actual IL_DM = {emiDesign.critFiltered.IL_DM_dB.toFixed(1)} dB
              </span>
            </div>
          </div>

          {/* Card 2: INPUT Common-Mode (CM) Recommended L & C */}
          <div className="bg-slate-50 dark:bg-slate-900/70 border border-purple-500/30 rounded-lg p-3 flex flex-col justify-between space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-purple-400">
                2. Input CM Filter (Primary Bus)
              </span>
              <span className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-purple-500/15 text-purple-300 border border-purple-500/30">
                Req: {emiDesign.Att_CM_req_dB.toFixed(1)} dB (dv/dt={emiDesign.dv_dt_V_ns.toFixed(1)}V/ns)
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
              <div className="p-2 rounded bg-slate-950/60 border border-slate-800">
                <div className="text-[10px] text-slate-400">Rec. Input CM Choke</div>
                <div className="text-sm font-bold text-purple-300">
                  L_CM,in = {emiDesign.L_CM_stage_mH} mH
                </div>
                <div className="text-[10px] text-slate-500">
                  {stageCount}× {coreType === 'nanocrystalline' ? 'Nanocryst.' : 'MnZn Toroid'}
                </div>
              </div>
              <div className="p-2 rounded bg-slate-950/60 border border-slate-800">
                <div className="text-[10px] text-slate-400">Rec. Input Y2-Capacitor</div>
                <div className="text-sm font-bold text-emerald-300">
                  C_Y,in = {emiDesign.C_Y_line_nF} nF/line
                </div>
                <div className="text-[10px] text-slate-500">
                  I_PE = {emiDesign.I_leak_PE_mA.toFixed(2)} mA (≤{maxLeakage_mA}mA)
                </div>
              </div>
            </div>

            <div className="border-t border-slate-800 pt-1.5 flex items-center justify-between text-[11px] font-mono">
              <span className="text-slate-400">
                f_c,CM,in = <strong className="text-purple-300">{emiDesign.fc_CM_actual_kHz.toFixed(1)} kHz</strong>
              </span>
              <span className="text-emerald-400">
                Actual IL_CM = {emiDesign.critFiltered.IL_CM_dB.toFixed(1)} dB
              </span>
            </div>
          </div>

          {/* Card 3: OUTPUT Differential-Mode (DM) Recommended L & C */}
          <div className="bg-slate-50 dark:bg-slate-900/70 border border-emerald-500/30 rounded-lg p-3 flex flex-col justify-between space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-emerald-400">
                3. Output DM Post-Filter (Secondary)
              </span>
              <span className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                Req: {emiDesign.Att_DM_out_req_dB.toFixed(1)} dB @ I_out={emiDesign.Iout_dc_A.toFixed(1)}A
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
              <div className="p-2 rounded bg-slate-950/60 border border-slate-800">
                <div className="text-[10px] text-slate-400">Rec. Output DM Inductor</div>
                <div className="text-sm font-bold text-amber-300">
                  L_DM,out = {emiDesign.L_DM_out_stage_uH} µH
                </div>
                <div className="text-[10px] text-slate-500">
                  {outStageCount}× Flat-Wire Powder Core
                </div>
              </div>
              <div className="p-2 rounded bg-slate-950/60 border border-slate-800">
                <div className="text-[10px] text-slate-400">Rec. Output DM Cap Bank</div>
                <div className="text-sm font-bold text-emerald-300">
                  C_DM,out = {emiDesign.C_DM_out_stage_uF} µF
                </div>
                <div className="text-[10px] text-slate-500">
                  Low-ESL X7R + Polymer
                </div>
              </div>
            </div>

            <div className="border-t border-slate-800 pt-1.5 flex items-center justify-between text-[11px] font-mono">
              <span className="text-slate-400">
                f_c,DM,out = <strong className="text-emerald-300">{emiDesign.fc_DM_out_actual_kHz.toFixed(1)} kHz</strong>
              </span>
              <span className="text-cyan-400">
                Actual IL_DM,out = {emiDesign.critOutFiltered.IL_DM_dB.toFixed(1)} dB
              </span>
            </div>
          </div>

          {/* Card 4: OUTPUT Common-Mode (CM) Recommended L & C + Y1 Bridge */}
          <div className="bg-slate-50 dark:bg-slate-900/70 border border-amber-500/30 rounded-lg p-3 flex flex-col justify-between space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-amber-400">
                4. Output CM Filter &amp; Isolation Bridge
              </span>
              <span className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                Req: {emiDesign.Att_CM_out_req_dB.toFixed(1)} dB (C_ww={emiDesign.C_ww_pF.toFixed(0)}pF)
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
              <div className="p-2 rounded bg-slate-950/60 border border-slate-800">
                <div className="text-[10px] text-slate-400">Rec. Output CM Choke</div>
                <div className="text-sm font-bold text-purple-300">
                  L_CM,out ={' '}
                  {emiDesign.L_CM_out_stage_uH >= 1000
                    ? `${(emiDesign.L_CM_out_stage_uH / 1000).toFixed(2)} mH`
                    : `${emiDesign.L_CM_out_stage_uH} µH`}
                </div>
                <div className="text-[10px] text-slate-500">
                  {outStageCount}× High-Current Bifilar
                </div>
              </div>
              <div className="p-2 rounded bg-slate-950/60 border border-slate-800">
                <div className="text-[10px] text-slate-400">Rec. Output Chassis Cap</div>
                <div className="text-sm font-bold text-emerald-300">
                  C_Y,out = {emiDesign.C_Y_out_line_nF} nF/rail
                </div>
                <div className="text-[10px] text-slate-500">
                  {includeY1BridgeCap ? '+ 2.2 nF Y1 Pri-Sec Bridge' : 'No Pri-Sec Y1 Bridge'}
                </div>
              </div>
            </div>

            <div className="border-t border-slate-800 pt-1.5 flex items-center justify-between text-[11px] font-mono">
              <span className="text-slate-400">
                f_c,CM,out = <strong className="text-amber-300">{emiDesign.fc_CM_out_actual_kHz.toFixed(1)} kHz</strong>
              </span>
              <span className="text-emerald-400">
                Actual IL_CM,out = {emiDesign.critOutFiltered.IL_CM_dB.toFixed(1)} dB
              </span>
            </div>
          </div>

          {/* Card 5: Middlebrook Input Stability & Safety Discharge Summary (Full Width across 2 cols) */}
          <div className="sm:col-span-2 bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 rounded-lg p-2.5 flex flex-wrap items-center justify-between gap-2">
            <div className="space-y-0.5">
              <div className="text-xs font-mono font-bold text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Middlebrook Input Impedance Damping &amp; IEC 62368-1 X-Cap Bleeder Synthesis
              </div>
              <div className="text-[11px] font-mono text-slate-400">
                Negative Input Impedance{' '}
                <strong className="text-cyan-300">|Z_in,neg| = {emiDesign.Zin_neg_dBOhm.toFixed(1)} dBΩ</strong> vs
                Damped Filter Peak{' '}
                <strong className="text-emerald-300">
                  |Z_out,EMI| = {emiDesign.Zout_damped_pk_dBOhm.toFixed(1)} dBΩ
                </strong>{' '}
                (Undamped: <span className="text-rose-400">{emiDesign.Zout_undamped_pk_dBOhm.toFixed(1)} dBΩ</span>)
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
              <span className="px-2 py-1 rounded bg-slate-950 border border-slate-800 text-amber-300">
                Damper: Rd = <strong>{emiDesign.R_d_Ohm} Ω</strong> + Cd = <strong>{emiDesign.C_d_uF} µF</strong>
              </span>
              <span className="px-2 py-1 rounded bg-slate-950 border border-slate-800 text-cyan-300">
                Bleeder: R_bleed = <strong>{emiDesign.R_bleed_kOhm} kΩ</strong> ({emiDesign.P_bleed_mW.toFixed(0)} mW)
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ROW 2: INTERACTIVE VISUALIZATION TABS (SPECTRUM, INSERTION LOSS, CAD SCHEMATIC) */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setVisualMode('spectrum')}
              className={`px-3 py-1.5 text-xs font-mono rounded inline-flex items-center gap-1.5 cursor-pointer ${
                visualMode === 'spectrum'
                  ? 'bg-cyan-600 text-white font-semibold'
                  : 'bg-slate-100 dark:bg-slate-900 text-slate-400 border border-slate-800'
              }`}
            >
              <Activity className="w-3.5 h-3.5" /> 1. Conducted Emission Spectrum (150 kHz – 30 MHz)
            </button>
            <button
              type="button"
              onClick={() => setVisualMode('attenuation')}
              className={`px-3 py-1.5 text-xs font-mono rounded inline-flex items-center gap-1.5 cursor-pointer ${
                visualMode === 'attenuation'
                  ? 'bg-purple-600 text-white font-semibold'
                  : 'bg-slate-100 dark:bg-slate-900 text-slate-400 border border-slate-800'
              }`}
            >
              <Zap className="w-3.5 h-3.5" /> 2. Input &amp; Output DM/CM Insertion Loss Curves
            </button>
            <button
              type="button"
              onClick={() => setVisualMode('schematic')}
              className={`px-3 py-1.5 text-xs font-mono rounded inline-flex items-center gap-1.5 cursor-pointer ${
                visualMode === 'schematic'
                  ? 'bg-emerald-600 text-white font-semibold'
                  : 'bg-slate-100 dark:bg-slate-900 text-slate-400 border border-slate-800'
              }`}
            >
              <Layers className="w-3.5 h-3.5" /> 3. Complete Input &amp; Output EMI Filter CAD Schematic
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {visualMode === 'spectrum' && (
              <div className="inline-flex rounded border border-slate-800 bg-slate-900 p-0.5 text-[11px] font-mono">
                <button
                  type="button"
                  onClick={() => setSpectrumPort('input')}
                  className={`px-2 py-0.5 rounded cursor-pointer ${
                    spectrumPort === 'input'
                      ? 'bg-cyan-600 text-white font-semibold'
                      : 'text-slate-400'
                  }`}
                >
                  Input Port LISN
                </button>
                <button
                  type="button"
                  onClick={() => setSpectrumPort('output')}
                  className={`px-2 py-0.5 rounded cursor-pointer ${
                    spectrumPort === 'output'
                      ? 'bg-emerald-600 text-white font-semibold'
                      : 'text-slate-400'
                  }`}
                >
                  Output Port LISN
                </button>
              </div>
            )}

            {activeHarmonic && (
              <div className="text-[11px] font-mono text-slate-400 bg-slate-900/90 px-2.5 py-1 rounded border border-slate-800">
                {spectrumPort === 'input' ? 'Input' : 'Output'} Harmonic{' '}
                <strong className="text-cyan-300">n={activeHarmonic.n}</strong> ({activeHarmonic.f_MHz.toFixed(3)} MHz): Unfilt DM={' '}
                <span className="text-rose-400">{activeHarmonic.V_dm_unfilt_dBuV.toFixed(1)}</span> / CM={' '}
                <span className="text-amber-400">{activeHarmonic.V_cm_unfilt_dBuV.toFixed(1)} dBµV</span> → Filtered={' '}
                <strong className="text-emerald-400">{activeHarmonic.V_tot_filt_dBuV.toFixed(1)} dBµV</strong> (Limit AVG:{' '}
                {activeHarmonic.limit_avg_dBuV.toFixed(1)} dBµV)
              </div>
            )}
          </div>
        </div>

        {/* VIEW 1: CONDUCTED EMISSION SPECTRUM (150 kHz - 30 MHz) — INTERACTIVE ZOOM & PAN */}
        {visualMode === 'spectrum' && (
          <div className="space-y-2">
            <InteractiveChart
              title={`Conducted Emission Spectrum (${spectrumPort === 'input' ? 'Input Port LISN' : 'Output Port LISN'} · 150 kHz – 30 MHz · ${emiDesign.std.shortName})`}
              subtitle={`Drag on chart or use + / - buttons to Zoom In / Out · Click any harmonic to inspect · Critical f_crit = ${emiDesign.f_crit_kHz} kHz (k=${emiDesign.k_crit})`}
              xLabel="Frequency"
              xUnit="MHz"
              logX={true}
              minPhysX={0.05}
              maxPhysX={100}
              currentX={emiDesign.f_crit_MHz}
              currentXLabel={`f_crit=${emiDesign.f_crit_kHz}kHz`}
              onSelectX={(f_MHz) => {
                let bestIdx = 0;
                let bestDist = Infinity;
                activeSpectrumHarmonics.forEach((h, idx) => {
                  const d = Math.abs(h.f_MHz - f_MHz);
                  if (d < bestDist) {
                    bestDist = d;
                    bestIdx = idx;
                  }
                });
                setHoveredHarmonicIdx(bestIdx);
              }}
              domainEvaluator={(f_MHz) => {
                const pt = emiDesign.evalSpectrumEnvelopeAtMHz(f_MHz, spectrumPort);
                return {
                  V_tot_filt_dBuV: pt.V_tot_filt_dBuV,
                  V_dm_unfilt_dBuV: pt.V_dm_unfilt_dBuV,
                  V_cm_unfilt_dBuV: pt.V_cm_unfilt_dBuV,
                  limit_qp_dBuV: pt.limit_qp_dBuV,
                  limit_avg_dBuV: pt.limit_avg_dBuV,
                };
              }}
              verticalMarkers={[
                {
                  x: 0.15,
                  label: '150 kHz CISPR Band B Start',
                  color: '#38bdf8',
                },
                {
                  x: emiDesign.f_crit_MHz,
                  label: `f_crit = ${emiDesign.f_crit_kHz} kHz (k=${emiDesign.k_crit})`,
                  color: '#10b981',
                },
              ]}
              data={activeSpectrumHarmonics.map((h) => ({
                x: Number(h.f_MHz.toFixed(4)),
                V_tot_filt_dBuV: Number(h.V_tot_filt_dBuV.toFixed(2)),
                V_dm_unfilt_dBuV: Number(h.V_dm_unfilt_dBuV.toFixed(2)),
                V_cm_unfilt_dBuV: Number(h.V_cm_unfilt_dBuV.toFixed(2)),
                limit_qp_dBuV: Number(h.limit_qp_dBuV.toFixed(2)),
                limit_avg_dBuV: Number(h.limit_avg_dBuV.toFixed(2)),
              }))}
              series={[
                {
                  key: 'V_tot_filt_dBuV',
                  label: `Filtered Total (${spectrumPort === 'input' ? `${stageCount}-Stg In` : `${outStageCount}-Stg Out`})`,
                  unit: 'dBµV',
                  color: '#10b981',
                  axis: 'left',
                },
                {
                  key: 'V_dm_unfilt_dBuV',
                  label: 'Unfiltered DM Noise',
                  unit: 'dBµV',
                  color: '#38bdf8',
                  axis: 'left',
                  dashed: true,
                },
                {
                  key: 'V_cm_unfilt_dBuV',
                  label: 'Unfiltered CM Noise',
                  unit: 'dBµV',
                  color: '#c084fc',
                  axis: 'left',
                  dashed: true,
                },
                {
                  key: 'limit_qp_dBuV',
                  label: `${emiDesign.std.shortName} QP Limit`,
                  unit: 'dBµV',
                  color: '#f43f5e',
                  axis: 'left',
                },
                {
                  key: 'limit_avg_dBuV',
                  label: `${emiDesign.std.shortName} AVG Limit`,
                  unit: 'dBµV',
                  color: '#f59e0b',
                  axis: 'left',
                  dashed: true,
                },
              ]}
            />
          </div>
        )}

        {/* VIEW 2: FILTER INSERTION LOSS (INPUT & OUTPUT DM/CM) & PARASITIC SRF — INTERACTIVE ZOOM & PAN */}
        {visualMode === 'attenuation' && (
          <div className="space-y-2">
            <InteractiveChart
              title="Input & Output DM/CM Filter Insertion Loss IL(f) & Parasitic Self-Resonance (SRF)"
              subtitle={`Drag to Zoom In or click + / - to Zoom In / Out across 1 kHz – 100 MHz · f_SRF,CM = ${emiDesign.f_srf_CM_MHz.toFixed(1)} MHz, f_SRF,DM = ${emiDesign.f_srf_DM_MHz.toFixed(1)} MHz`}
              xLabel="Frequency"
              xUnit="MHz"
              logX={true}
              minPhysX={0.001}
              maxPhysX={100}
              currentX={emiDesign.f_crit_MHz}
              currentXLabel={`f_crit=${emiDesign.f_crit_kHz}kHz`}
              domainEvaluator={(f_MHz) => {
                const pt = emiDesign.evalAttenuationAtMHz(f_MHz);
                return {
                  IL_DM_dB: pt.IL_DM_dB,
                  IL_CM_dB: pt.IL_CM_dB,
                  IL_DM_out_dB: pt.IL_DM_out_dB,
                  IL_CM_out_dB: pt.IL_CM_out_dB,
                };
              }}
              verticalMarkers={[
                {
                  x: Number((emiDesign.fc_DM_actual_kHz / 1e3).toFixed(4)),
                  label: `fc,DM,in=${emiDesign.fc_DM_actual_kHz.toFixed(1)}kHz`,
                  color: '#38bdf8',
                },
                {
                  x: Number((emiDesign.fc_CM_actual_kHz / 1e3).toFixed(4)),
                  label: `fc,CM,in=${emiDesign.fc_CM_actual_kHz.toFixed(1)}kHz`,
                  color: '#c084fc',
                },
                {
                  x: emiDesign.f_crit_MHz,
                  label: `f_crit=${emiDesign.f_crit_kHz}kHz`,
                  color: '#10b981',
                },
              ]}
              horizontalMarkers={[
                {
                  value: Number(emiDesign.Att_DM_req_dB.toFixed(1)),
                  label: `Req DM Att (${emiDesign.Att_DM_req_dB.toFixed(1)} dB)`,
                  color: '#38bdf8',
                  axis: 'left',
                },
                {
                  value: Number(emiDesign.Att_CM_req_dB.toFixed(1)),
                  label: `Req CM Att (${emiDesign.Att_CM_req_dB.toFixed(1)} dB)`,
                  color: '#c084fc',
                  axis: 'left',
                },
              ]}
              data={emiDesign.attenuationCurve.map((p) => ({
                x: Number(p.f_MHz.toFixed(4)),
                IL_DM_dB: p.IL_DM_dB,
                IL_CM_dB: p.IL_CM_dB,
                IL_DM_out_dB: p.IL_DM_out_dB,
                IL_CM_out_dB: p.IL_CM_out_dB,
              }))}
              series={[
                {
                  key: 'IL_DM_dB',
                  label: `Input IL_DM (${stageCount}-Stg)`,
                  unit: 'dB',
                  color: '#38bdf8',
                  axis: 'left',
                },
                {
                  key: 'IL_CM_dB',
                  label: `Input IL_CM (${stageCount}-Stg)`,
                  unit: 'dB',
                  color: '#c084fc',
                  axis: 'left',
                },
                {
                  key: 'IL_DM_out_dB',
                  label: `Output IL_DM,out (${outStageCount}-Stg)`,
                  unit: 'dB',
                  color: '#10b981',
                  axis: 'left',
                  dashed: true,
                },
                {
                  key: 'IL_CM_out_dB',
                  label: `Output IL_CM,out (${outStageCount}-Stg)`,
                  unit: 'dB',
                  color: '#f59e0b',
                  axis: 'left',
                  dashed: true,
                },
              ]}
            />
          </div>
        )}

        {/* VIEW 3: COMPLETE INPUT & OUTPUT EMI FILTER CAD SCHEMATIC */}
        {visualMode === 'schematic' && (
          <div className="bg-slate-950 border border-slate-800 rounded-lg p-3">
            <svg viewBox="0 0 920 290" className="w-full h-auto select-none font-mono">
              {/* Primary Top & Bottom Bus Rails + Secondary Top & Bottom Rails + PE Chassis Rail */}
              <line x1={30} y1={65} x2={495} y2={65} stroke="#38bdf8" strokeWidth={2.2} />
              <line x1={30} y1={175} x2={495} y2={175} stroke="#94a3b8" strokeWidth={2.2} />

              <line x1={595} y1={65} x2={890} y2={65} stroke="#10b981" strokeWidth={2.4} />
              <line x1={595} y1={175} x2={890} y2={175} stroke="#94a3b8" strokeWidth={2.4} />

              <line
                x1={30}
                y1={245}
                x2={890}
                y2={245}
                stroke="#10b981"
                strokeWidth={1.5}
                strokeDasharray="6 3"
              />

              <text x={32} y={52} className="fill-cyan-400 text-[10px] font-bold">
                VIN+ ({activeVin_V}V, {emiDesign.Iin_dc_A.toFixed(1)}A)
              </text>
              <text x={32} y={193} className="fill-slate-400 text-[10px] font-bold">
                VIN- / RTN
              </text>
              <text x={32} y={262} className="fill-emerald-400 text-[10px]">
                PE / CHASSIS SHIELD GROUND (I_leak = {emiDesign.I_leak_PE_mA.toFixed(2)} mA)
              </text>

              {/* INPUT CX1 + R_bleed */}
              <g transform="translate(105, 0)">
                <line x1={0} y1={65} x2={0} y2={108} stroke="#e2e8f0" strokeWidth={1.8} />
                <line x1={-10} y1={108} x2={10} y2={108} stroke="#38bdf8" strokeWidth={2.5} />
                <line x1={-10} y1={118} x2={10} y2={118} stroke="#38bdf8" strokeWidth={2.5} />
                <line x1={0} y1={118} x2={0} y2={175} stroke="#e2e8f0" strokeWidth={1.8} />
                <text x={13} y={112} className="fill-cyan-300 text-[9px] font-bold">
                  CX,in
                </text>
                <text x={13} y={123} className="fill-slate-300 text-[9px]">
                  {emiDesign.C_X_stage_uF}µF
                </text>
              </g>

              {/* INPUT LCM,in + LDM,in */}
              <g transform="translate(205, 0)">
                <rect
                  x={-26}
                  y={48}
                  width={52}
                  height={144}
                  rx={6}
                  fill="#0f172a"
                  stroke="#a855f7"
                  strokeDasharray="3 2"
                />
                <path
                  d="M -18 65 Q -9 50 0 65 Q 9 50 18 65"
                  fill="none"
                  stroke="#c084fc"
                  strokeWidth={2.5}
                />
                <path
                  d="M -18 175 Q -9 190 0 175 Q 9 190 18 175"
                  fill="none"
                  stroke="#c084fc"
                  strokeWidth={2.5}
                />
                <text x={0} y={38} textAnchor="middle" className="fill-purple-300 text-[9px] font-bold">
                  {stageCount}×LCM,in={emiDesign.L_CM_stage_mH}mH
                </text>
                <text x={0} y={118} textAnchor="middle" className="fill-amber-300 text-[9px]">
                  LDM,in={emiDesign.L_DM_stage_uH}µH
                </text>
              </g>

              {/* INPUT CY,in + Middlebrook Rd/Cd */}
              <g transform="translate(310, 0)">
                <line x1={0} y1={175} x2={0} y2={204} stroke="#10b981" strokeWidth={1.5} />
                <line x1={-9} y1={204} x2={9} y2={204} stroke="#10b981" strokeWidth={2.2} />
                <line x1={-9} y1={212} x2={9} y2={212} stroke="#10b981" strokeWidth={2.2} />
                <line x1={0} y1={212} x2={0} y2={245} stroke="#10b981" strokeWidth={1.5} />
                <text x={12} y={214} className="fill-emerald-300 text-[9px] font-bold">
                  CY,in={emiDesign.C_Y_line_nF}nF
                </text>

                {/* Middlebrook Damper Rd + Cd */}
                <line x1={85} y1={65} x2={85} y2={92} stroke="#f59e0b" strokeWidth={1.6} />
                <line x1={76} y1={92} x2={94} y2={92} stroke="#f59e0b" strokeWidth={2.2} />
                <line x1={76} y1={100} x2={94} y2={100} stroke="#f59e0b" strokeWidth={2.2} />
                <line x1={85} y1={100} x2={85} y2={118} stroke="#f59e0b" strokeWidth={1.6} />
                <rect
                  x={79}
                  y={118}
                  width={12}
                  height={28}
                  fill="#0f172a"
                  stroke="#f59e0b"
                  strokeWidth={1.6}
                />
                <line x1={85} y1={146} x2={85} y2={175} stroke="#f59e0b" strokeWidth={1.6} />
                <text x={98} y={102} className="fill-amber-300 text-[9px] font-bold">
                  Cd={emiDesign.C_d_uF}µF
                </text>
                <text x={98} y={136} className="fill-amber-300 text-[9px] font-bold">
                  Rd={emiDesign.R_d_Ohm}Ω
                </text>
              </g>

              {/* ISOLATED DC-DC STAGE + C_ww + Y1 BRIDGE CAP */}
              <g transform="translate(495, 0)">
                <rect
                  x={0}
                  y={48}
                  width={100}
                  height={144}
                  rx={6}
                  fill="#0f172a"
                  stroke="#38bdf8"
                  strokeWidth={1.8}
                />
                <text x={50} y={95} textAnchor="middle" className="fill-cyan-300 text-[10px] font-bold">
                  DC-DC STAGE
                </text>
                <text x={50} y={112} textAnchor="middle" className="fill-slate-400 text-[9px]">
                  f_sw={activeFsw_kHz}kHz
                </text>
                <text x={50} y={126} textAnchor="middle" className="fill-purple-300 text-[9px]">
                  C_ww={emiDesign.C_ww_pF.toFixed(0)}pF
                </text>
                {includeY1BridgeCap && (
                  <text x={50} y={160} textAnchor="middle" className="fill-emerald-300 text-[9px] font-bold">
                    CY,brg=2.2nF(Y1)
                  </text>
                )}
              </g>

              {/* OUTPUT DM FILTER (LDM,out + CDM,out) */}
              <g transform="translate(655, 0)">
                <path
                  d="M -22 65 Q -11 48 0 65 Q 11 48 22 65"
                  fill="none"
                  stroke="#f59e0b"
                  strokeWidth={2.5}
                />
                <text x={0} y={40} textAnchor="middle" className="fill-amber-300 text-[9px] font-bold">
                  LDM,out={emiDesign.L_DM_out_stage_uH}µH
                </text>

                <line x1={42} y1={65} x2={42} y2={108} stroke="#e2e8f0" strokeWidth={1.8} />
                <line x1={32} y1={108} x2={52} y2={108} stroke="#10b981" strokeWidth={2.5} />
                <line x1={32} y1={118} x2={52} y2={118} stroke="#10b981" strokeWidth={2.5} />
                <line x1={42} y1={118} x2={42} y2={175} stroke="#e2e8f0" strokeWidth={1.8} />
                <text x={55} y={112} className="fill-emerald-300 text-[9px] font-bold">
                  CDM,out
                </text>
                <text x={55} y={123} className="fill-slate-300 text-[9px]">
                  {emiDesign.C_DM_out_stage_uF}µF
                </text>
              </g>

              {/* OUTPUT CM CHOKE (LCM,out) + OUTPUT Y-CAPS (CY,out) */}
              <g transform="translate(790, 0)">
                <rect
                  x={-24}
                  y={48}
                  width={48}
                  height={144}
                  rx={6}
                  fill="#0f172a"
                  stroke="#a855f7"
                  strokeDasharray="3 2"
                />
                <path
                  d="M -16 65 Q -8 50 0 65 Q 8 50 16 65"
                  fill="none"
                  stroke="#c084fc"
                  strokeWidth={2.5}
                />
                <path
                  d="M -16 175 Q -8 190 0 175 Q 8 190 16 175"
                  fill="none"
                  stroke="#c084fc"
                  strokeWidth={2.5}
                />
                <text x={0} y={38} textAnchor="middle" className="fill-purple-300 text-[9px] font-bold">
                  LCM,out={emiDesign.L_CM_out_stage_uH}µH
                </text>

                <line x1={50} y1={175} x2={50} y2={204} stroke="#10b981" strokeWidth={1.5} />
                <line x1={41} y1={204} x2={59} y2={204} stroke="#10b981" strokeWidth={2.2} />
                <line x1={41} y1={212} x2={59} y2={212} stroke="#10b981" strokeWidth={2.2} />
                <line x1={50} y1={212} x2={50} y2={245} stroke="#10b981" strokeWidth={1.5} />
                <text x={10} y={232} className="fill-emerald-300 text-[9px] font-bold">
                  2×CY,out={emiDesign.C_Y_out_line_nF}nF
                </text>
              </g>

              <text x={885} y={52} textAnchor="end" className="fill-emerald-400 text-[10px] font-bold">
                VOUT+ ({activeVout_V}V, {emiDesign.Iout_dc_A.toFixed(1)}A)
              </text>
            </svg>
          </div>
        )}
      </div>

      {/* ROW 3: GOVERNING EMI EQUATIONS & RECOMMENDED COMMERCIAL FILTER STAGE BOM */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        {/* Governing Equations Card (4 cols) */}
        <div className="xl:col-span-4 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-lg p-3.5 space-y-2.5">
          <div className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-400">
            Input &amp; Output EMI Filter Synthesis Equations
          </div>
          <div className="space-y-2 text-xs font-mono">
            <div className="p-2 rounded bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
              <div className="text-[10px] text-slate-400 mb-1">
                1. Required Input &amp; Output DM/CM Attenuation:
              </div>
              <MathFormula tex="\text{Att}_{\text{req}}(f_{\text{crit}}) = V_{\text{unfilt}}(f_{\text{crit}}) - L_{\text{EMC}}(f_{\text{crit}}) + M_{\text{safety}}" />
            </div>
            <div className="p-2 rounded bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
              <div className="text-[10px] text-slate-400 mb-1">
                2. Input &amp; Output DM/CM Corner Frequencies:
              </div>
              <MathFormula tex="f_{c,\text{DM}} = \frac{1}{2\pi\sqrt{L_{\text{DM}}C_{\text{DM}}}}, \quad f_{c,\text{CM}} = \frac{1}{2\pi\sqrt{L_{\text{CM}}(2C_Y)}}" />
            </div>
            <div className="p-2 rounded bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
              <div className="text-[10px] text-slate-400 mb-1">
                3. Middlebrook Damping &amp; Negative Input Resistance:
              </div>
              <MathFormula tex="C_d \approx 3.3 C_X, \quad R_d = \sqrt{\frac{L_{\text{DM,in}}}{C_X}}, \quad \|Z_{\text{out,EMI}}\| \ll \frac{V_{\text{in}}^2}{P_{\text{in}}}" />
            </div>
          </div>
        </div>

        {/* Recommended Commercial Filter Stage BOM Table (8 cols) */}
        <div className="xl:col-span-8 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-lg p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
            <div>
              <div className="text-xs font-mono font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5" /> Synthesized Input &amp; Output EMI Filter BOM ({emiDesign.std.shortName})
              </div>
              <div className="text-[11px] font-mono text-slate-400">
                Recommended CM &amp; DM inductors and capacitors for P_out = {activePout_W} W at f_sw = {activeFsw_kHz} kHz
              </div>
            </div>

            <div className="inline-flex rounded border border-slate-800 bg-slate-950 p-0.5 text-[11px] font-mono">
              {(
                [
                  { id: 'both', label: 'All Ports (In + Out)' },
                  { id: 'input', label: 'Input Filter' },
                  { id: 'output', label: 'Output Filter' },
                ] as { id: FilterPortFocus; label: string }[]
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setBomPortFilter(tab.id)}
                  className={`px-2 py-0.5 rounded cursor-pointer ${
                    bomPortFilter === tab.id
                      ? 'bg-cyan-600 text-white font-semibold'
                      : 'text-slate-400'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs font-mono">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                  <th className="py-1.5 pr-2">Port / Mode</th>
                  <th className="py-1.5 pr-2">Stage Ref</th>
                  <th className="py-1.5 pr-2">Recommended Value</th>
                  <th className="py-1.5 pr-2">Rating &amp; Core/Dielectric</th>
                  <th className="py-1.5 pr-2">Suggested MPN / LCSC</th>
                  <th className="py-1.5">Engineering Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800/70">
                {filteredBom.map((item) => (
                  <tr key={item.refDes} className="hover:bg-slate-900/40">
                    <td className="py-2 pr-2 whitespace-nowrap">
                      <span
                        className={`px-1.5 py-0.5 text-[10px] rounded font-bold ${
                          item.port === 'Input'
                            ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                            : item.port === 'Output'
                            ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                            : 'bg-purple-500/15 text-purple-300 border border-purple-500/30'
                        }`}
                      >
                        {item.port} · {item.mode}
                      </span>
                    </td>
                    <td className="py-2 pr-2 font-bold text-cyan-300 whitespace-nowrap">
                      <div>{item.refDes}</div>
                      <div className="text-[10px] font-normal text-slate-400">{item.role}</div>
                    </td>
                    <td className="py-2 pr-2 font-bold text-emerald-400 whitespace-nowrap">
                      {item.valueFormatted}
                    </td>
                    <td className="py-2 pr-2 text-[11px] text-slate-300">
                      <div>{item.ratingFormatted}</div>
                      <div className="text-[10px] text-slate-500">{item.dielectricOrCore}</div>
                    </td>
                    <td className="py-2 pr-2 whitespace-nowrap">
                      <div className="text-amber-300 font-semibold">{item.mpn}</div>
                      <div className="text-[10px] text-slate-400">
                        {item.manufacturer}{' '}
                        {item.lcsc !== '—' && (
                          <a
                            href={`https://www.lcsc.com/search?q=${encodeURIComponent(item.lcsc)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-cyan-400 underline ml-1"
                          >
                            {item.lcsc}
                          </a>
                        )}
                      </div>
                    </td>
                    <td className="py-2 text-[10px] text-slate-400 max-w-xs">{item.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
