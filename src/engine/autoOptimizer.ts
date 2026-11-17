import {
  AcDcDesignState,
  CORE_DATABASE,
  DcDcDesignState,
  MATERIAL_DATABASE,
  SEMICONDUCTOR_DATABASE,
} from '../data/databases';
import { solveDcDcDesign } from './dcdcEngine';

export type DcDcLockableKey =
  | 'Vin_nom_V'
  | 'Vin_min_V'
  | 'Vin_max_V'
  | 'Vout_V'
  | 'Pout_W'
  | 'fsw_kHz'
  | 'Tamb_C'
  | 'turnsRatio_n'
  | 'Llk_uH'
  | 'Lm_uH'
  | 'Cr_nF'
  | 'Lo_uH'
  | 'Co_uF'
  | 'ESR_Co_mOhm'
  | 'coreId'
  | 'materialId'
  | 'Np_turns'
  | 'Ns_turns'
  | 'litzStrandAWG'
  | 'priStrands'
  | 'secStrands'
  | 'interleaving'
  | 'insulationThickness_mm'
  | 'priDeviceId'
  | 'secDeviceId'
  | 'nParallelPri'
  | 'nParallelSec'
  | 'Vgs_drive_V'
  | 'Rg_ext_Ohm'
  | 'deadTime_ns'
  | 'Rth_heatsink_CW'
  | 'Rth_TIM_CW'
  | 'Tj_max_limit_C'
  | 'fc_target_kHz'
  | 'pm_target_deg'
  | 'slopeFactor_mc'
  | 'Rsense_mOhm'
  | 'fs_digital_kHz';

export type AcDcLockableKey =
  | 'Vac_rms_V'
  | 'Vac_min_V'
  | 'Vac_max_V'
  | 'Vdc_bus_V'
  | 'Pout_W'
  | 'fsw_kHz'
  | 'fastSwitchId'
  | 'Lpfc_uH'
  | 'RL_mOhm'
  | 'Cdc_uF'
  | 'ESR_Cdc_mOhm'
  | 'tHold_ms'
  | 'Vdc_min_hold_V'
  | 'fc_i_kHz'
  | 'pm_i_deg'
  | 'fc_v_Hz'
  | 'pm_v_deg'
  | 'fs_ctrl_kHz'
  | 'deadTime_zcd_ns'
  | 'prechargeR_Ohm'
  | 'Cy_nF'
  | 'capAmbient_C';

export interface AutoOptChange<K extends string> {
  key: K;
  label: string;
  oldVal: number | string;
  newVal: number | string;
  unit: string;
  reason: string;
}

export const DCDC_DEFAULT_LOCKS: Record<DcDcLockableKey, boolean> = {
  Vin_nom_V: true,
  Vin_min_V: false,
  Vin_max_V: false,
  Vout_V: true,
  Pout_W: true,
  fsw_kHz: true,
  Tamb_C: true,
  turnsRatio_n: false,
  Llk_uH: false,
  Lm_uH: false,
  Cr_nF: false,
  Lo_uH: false,
  Co_uF: false,
  ESR_Co_mOhm: false,
  coreId: false,
  materialId: false,
  Np_turns: false,
  Ns_turns: false,
  litzStrandAWG: false,
  priStrands: false,
  secStrands: false,
  interleaving: false,
  insulationThickness_mm: false,
  priDeviceId: true, // Keep user's explicit MOSFET unless unlocked or Optimize All requested
  secDeviceId: true,
  nParallelPri: false,
  nParallelSec: false,
  Vgs_drive_V: false,
  Rg_ext_Ohm: false,
  deadTime_ns: false,
  Rth_heatsink_CW: false,
  Rth_TIM_CW: false,
  Tj_max_limit_C: true,
  fc_target_kHz: false,
  pm_target_deg: false,
  slopeFactor_mc: false,
  Rsense_mOhm: false,
  fs_digital_kHz: false,
};

export const ACDC_DEFAULT_LOCKS: Record<AcDcLockableKey, boolean> = {
  Vac_rms_V: true,
  Vac_min_V: false,
  Vac_max_V: false,
  Vdc_bus_V: true,
  Pout_W: true,
  fsw_kHz: true,
  fastSwitchId: true,
  Lpfc_uH: false,
  RL_mOhm: false,
  Cdc_uF: false,
  ESR_Cdc_mOhm: false,
  tHold_ms: true,
  Vdc_min_hold_V: false,
  fc_i_kHz: false,
  pm_i_deg: false,
  fc_v_Hz: false,
  pm_v_deg: false,
  fs_ctrl_kHz: false,
  deadTime_zcd_ns: false,
  prechargeR_Ohm: false,
  Cy_nF: false,
  capAmbient_C: true,
};

const clamp = (val: number, min: number, max: number) => Math.min(max, Math.max(min, val));
const roundTo = (val: number, step: number) => Math.round(val / step) * step;

const AWG_AREA_MM2: Record<38 | 40 | 42, number> = {
  38: 0.00811,
  40: 0.00487,
  42: 0.00317,
};

const AWG_DIAM_OPT_MM: Record<38 | 40 | 42, number> = {
  38: 0.1016,
  40: 0.0787,
  42: 0.0635,
};

function estimatePackedSectionRadialMm(
  turns: number,
  totalStrands: number,
  strandDiam_mm: number,
  b_eff_mm: number
): number {
  const nominalRound = Math.sqrt(totalStrands) * strandDiam_mm * 1.28;
  if (totalStrands < 70 || nominalRound < 1.25) {
    const tPerLayer = Math.max(1, Math.floor(b_eff_mm / Math.max(0.25, nominalRound)));
    const layers = Math.max(1, Math.ceil(turns / tPerLayer));
    return layers * nominalRound + Math.max(0, layers - 1) * 0.08;
  }
  let bestStack = Infinity;
  const maxK = Math.min(6, Math.max(1, Math.floor(totalStrands / 24)));
  for (let k = 1; k <= maxK; k++) {
    const strandsPerSub = Math.ceil(totalStrands / k);
    const d_sub = Math.sqrt(strandsPerSub) * strandDiam_mm * 1.24;
    const subWidth = d_sub * (k >= 2 ? 1.18 : 1.0);
    const subHeight = d_sub / (k >= 2 ? 1.26 : 1.0);
    const axialPitch = k * subWidth + (k - 1) * 0.06;
    const tPerLayer = Math.max(1, Math.floor(b_eff_mm / Math.max(0.3, axialPitch)));
    const layers = Math.max(1, Math.ceil(turns / tPerLayer));
    const stack = layers * subHeight + Math.max(0, layers - 1) * 0.08;
    const axUtil = (Math.min(turns, tPerLayer) * axialPitch) / b_eff_mm;
    if (axUtil <= 0.96 && stack < bestStack) {
      bestStack = stack;
    }
  }
  if (!Number.isFinite(bestStack)) {
    const tPerLayer = Math.max(1, Math.floor(b_eff_mm / Math.max(0.25, nominalRound)));
    const layers = Math.max(1, Math.ceil(turns / tPerLayer));
    return layers * nominalRound + Math.max(0, layers - 1) * 0.08;
  }
  return bestStack;
}

function estimateTransformerRadialBuildMm(params: {
  bw_mm: number;
  Ve_mm3: number;
  Vin_nom_V: number;
  Np: number;
  Ns: number;
  isCenterTapped: boolean;
  priStrands: number;
  secStrands: number;
  litzAwg: 38 | 40 | 42;
  interleaving: 'none' | 'split-pri' | 'full-interleaved';
  insulationThickness_mm: number;
  estAirGap_mm: number;
}): number {
  const marginTape = params.Vin_nom_V >= 300 ? 3.0 : params.Vin_nom_V >= 150 ? 2.5 : 1.5;
  const bobbinWall = params.Ve_mm3 >= 30000 ? 1.3 : params.Ve_mm3 >= 12000 ? 1.1 : 0.9;
  const b_eff = Math.max(4.0, params.bw_mm - 2 * marginTape);
  const strandDiam = AWG_DIAM_OPT_MM[params.litzAwg] || 0.1016;
  const gapOffset = params.estAirGap_mm > 0.05 ? Math.min(1.5, params.estAirGap_mm * 0.95) : 0;
  const NsTotal = params.Ns * (params.isCenterTapped ? 2 : 1);
  const h_ins = Math.max(0.08, params.insulationThickness_mm);

  let copperStack = 0;
  let insul = 0.12;
  if (params.interleaving === 'none') {
    copperStack += estimatePackedSectionRadialMm(params.Np, params.priStrands, strandDiam, b_eff);
    copperStack += estimatePackedSectionRadialMm(NsTotal, params.secStrands, strandDiam, b_eff);
    insul += h_ins;
  } else if (params.interleaving === 'split-pri') {
    const np1 = Math.ceil(params.Np / 2);
    const np2 = Math.max(1, params.Np - np1);
    copperStack += estimatePackedSectionRadialMm(np1, params.priStrands, strandDiam, b_eff);
    copperStack += estimatePackedSectionRadialMm(NsTotal, params.secStrands, strandDiam, b_eff);
    copperStack += estimatePackedSectionRadialMm(np2, params.priStrands, strandDiam, b_eff);
    insul += h_ins * 2;
  } else {
    const np1 = Math.ceil(params.Np / 2);
    const np2 = Math.max(1, params.Np - np1);
    const ns1 = Math.ceil(NsTotal / 2);
    const ns2 = Math.max(1, NsTotal - ns1);
    copperStack += estimatePackedSectionRadialMm(np1, params.priStrands, strandDiam, b_eff);
    copperStack += estimatePackedSectionRadialMm(ns1, params.secStrands, strandDiam, b_eff);
    copperStack += estimatePackedSectionRadialMm(np2, params.priStrands, strandDiam, b_eff);
    copperStack += estimatePackedSectionRadialMm(ns2, params.secStrands, strandDiam, b_eff);
    insul += h_ins * 3;
  }
  return Number((bobbinWall + gapOffset + copperStack + insul).toFixed(2));
}

const Y_CAP_SERIES_NF = [1.0, 2.2, 3.3, 4.7, 6.8, 10, 15, 22];

function snapFloor(val: number, series: number[]): number {
  let chosen = series[0];
  for (const s of series) {
    if (s <= val * 1.01) chosen = s;
  }
  return chosen;
}

/**
 * Automatically recalculates unlocked DC-DC circuit parameters across power stage,
 * magnetics, windings, output filter, semiconductors, gate drive, thermal & control.
 */
export function optimizeDcDcUnlocked(
  prevState: DcDcDesignState,
  candidateState: DcDcDesignState,
  changedKey: keyof DcDcDesignState | null,
  locked: Record<DcDcLockableKey, boolean>
): {
  nextState: DcDcDesignState;
  changes: AutoOptChange<DcDcLockableKey>[];
} {
  const next: DcDcDesignState = { ...candidateState };
  const changes: AutoOptChange<DcDcLockableKey>[] = [];

  const isCanEdit = (k: DcDcLockableKey) => !locked[k] && changedKey !== k;

  const upsertChange = (entry: AutoOptChange<DcDcLockableKey>) => {
    const idx = changes.findIndex((c) => c.key === entry.key);
    if (String(entry.oldVal) === String(entry.newVal)) {
      if (idx >= 0) changes.splice(idx, 1);
      return;
    }
    if (idx >= 0) {
      changes[idx] = { ...entry, oldVal: changes[idx].oldVal };
    } else {
      changes.push(entry);
    }
  };

  const applyNum = (
    k: DcDcLockableKey,
    label: string,
    newVal: number,
    unit: string,
    reason: string
  ) => {
    const prevVal = (prevState as unknown as Record<string, unknown>)[k] ?? (next as unknown as Record<string, unknown>)[k];
    const currentVal = (next as unknown as Record<string, unknown>)[k];
    const curNum = typeof currentVal === 'number' ? currentVal : newVal;
    if (typeof currentVal !== 'number' || Math.abs(newVal - curNum) > 1e-6) {
      (next as unknown as Record<string, unknown>)[k] = newVal;
      upsertChange({
        key: k,
        label,
        oldVal: typeof prevVal === 'number' ? Number(prevVal.toFixed(2)) : curNum,
        newVal: Number(newVal.toFixed(2)),
        unit,
        reason,
      });
    }
  };

  const applyStr = (
    k: DcDcLockableKey,
    label: string,
    newVal: string,
    reason: string
  ) => {
    const prevVal = String((prevState as unknown as Record<string, unknown>)[k] ?? '');
    const curVal = String((next as unknown as Record<string, unknown>)[k] ?? '');
    if (newVal !== curVal) {
      (next as unknown as Record<string, unknown>)[k] = newVal;
      upsertChange({
        key: k,
        label,
        oldVal: prevVal,
        newVal,
        unit: '',
        reason,
      });
    }
  };

  const isLLC = next.topology === 'llc-fb' || next.topology === 'llc-hb';
  const isHalfBridge = next.topology === 'llc-hb';
  const isCDR = next.txType === 'current-doubler';
  const nPhases = next.topology === 'psfb-2ph' ? 2 : 1;

  // 1. Line Envelope (Vin_min_V, Vin_max_V)
  if (isCanEdit('Vin_min_V')) {
    const vminOpt = clamp(Math.round(next.Vin_nom_V * 0.9), 24, next.Vin_nom_V);
    applyNum('Vin_min_V', 'Vin,min', vminOpt, 'V', '10% low-line brownout envelope');
  }
  if (isCanEdit('Vin_max_V')) {
    const vmaxOpt = clamp(Math.round(next.Vin_nom_V * 1.075), next.Vin_nom_V + 5, 1100);
    applyNum('Vin_max_V', 'Vin,max', vmaxOpt, 'V', '+7.5% high-line overshoot margin');
  }

  // 2. Primary Semiconductor Auto-Selection (if unlocked OR if current device is over-volted when unlocked)
  if (isCanEdit('priDeviceId')) {
    const vReq = next.Vin_max_V * 1.42;
    const candidates = SEMICONDUCTOR_DATABASE.filter(
      (d) => (d.role === 'primary' || d.role === 'both') && d.Vds_max_V >= vReq
    );
    if (candidates.length > 0) {
      const iApprox = next.Pout_W / Math.max(48, next.Vin_nom_V * 0.96);
      const preferGaN = next.fsw_kHz >= 140 && next.Vin_max_V <= 460;
      const scored = candidates
        .map((d) => {
          const fom = d.Rds_on_25C_mOhm * Math.max(4, d.Qg_nC);
          const currentPenalty = d.Id_max_A && d.Id_max_A < iApprox * 1.3 ? 3.5 : 1.0;
          const techBonus =
            preferGaN && d.tech === 'GaN HEMT'
              ? 0.55
              : !preferGaN && d.tech === 'SiC MOSFET'
              ? 0.8
              : 1.0;
          return { d, score: fom * currentPenalty * techBonus };
        })
        .sort((a, b) => a.score - b.score);
      applyStr(
        'priDeviceId',
        'Primary FET',
        scored[0].d.id,
        `Optimal ${scored[0].d.Vds_max_V}V ${scored[0].d.tech} FOM for ${next.Vin_max_V}V / ${next.Pout_W}W`
      );
    }
  }

  const priDevice =
    SEMICONDUCTOR_DATABASE.find((d) => d.id === next.priDeviceId) || SEMICONDUCTOR_DATABASE[0];

  // 3. Switching Frequency fsw_kHz (if unlocked)
  if (isCanEdit('fsw_kHz')) {
    let fswOpt =
      priDevice.tech === 'GaN HEMT' ? 160 : priDevice.tech === 'SiC MOSFET' ? 105 : 65;
    if (isLLC && locked.Llk_uH && locked.Cr_nF) {
      const fr_kHz =
        1 /
        (2 * Math.PI * Math.sqrt(Math.max(0.2e-6, next.Llk_uH * 1e-6) * Math.max(1e-9, next.Cr_nF * 1e-9))) /
        1e3;
      fswOpt = clamp(roundTo(fr_kHz, 1), 20, 500);
      applyNum('fsw_kHz', 'f_sw', fswOpt, 'kHz', 'Matched resonant f_r of locked L_r & C_r');
    } else {
      if (next.Pout_W > 8000) fswOpt = Math.round(fswOpt * 0.8);
      else if (next.Pout_W < 1500) fswOpt = Math.round(fswOpt * 1.25);
      fswOpt = clamp(roundTo(fswOpt, 5), 25, 400);
      applyNum('fsw_kHz', 'f_sw', fswOpt, 'kHz', `Optimal loss/size point for ${priDevice.tech}`);
    }
  }

  // 4. Core Material Auto-Selection (if unlocked) — lowest actual Steinmetz Pv at f_sw & 90°C
  if (isCanEdit('materialId')) {
    const fswEst = Math.max(10e3, next.fsw_kHz * 1e3);
    const B_ref_T = Math.max(0.045, 0.14 * Math.pow(100 / Math.max(25, next.fsw_kHz), 0.52));
    const bestMat = [...MATERIAL_DATABASE].sort((a, b) => {
      const fA = Math.max(0.75, 1 + a.tempCoeff_c2 * Math.pow(90 - a.T_opt_C, 2));
      const fB = Math.max(0.75, 1 + b.tempCoeff_c2 * Math.pow(90 - b.T_opt_C, 2));
      const pvA = a.k_si * Math.pow(fswEst, a.alpha) * Math.pow(B_ref_T, a.beta) * fA;
      const pvB = b.k_si * Math.pow(fswEst, b.alpha) * Math.pow(B_ref_T, b.beta) * fB;
      return pvA - pvB;
    })[0];
    applyStr(
      'materialId',
      'Core Material',
      bestMat.id,
      `Lowest Steinmetz loss density at ${next.fsw_kHz} kHz (${bestMat.name})`
    );
  }

  // 5. Coupled Voltage & Transformer Turns Ratio (Vin, Vout, turnsRatio_n, Np, Ns)
  const targetDeff = 0.72;
  const bridgeFactor = isHalfBridge ? 0.5 : 1.0;
  const cdrFactor = isCDR ? 2.0 : 1.0;
  const userEditedTurns = changedKey === 'Np_turns' || changedKey === 'Ns_turns';

  if (userEditedTurns && isCanEdit('turnsRatio_n')) {
    const nFromTurns = clamp(
      Number((next.Np_turns / Math.max(1, next.Ns_turns)).toFixed(4)),
      0.25,
      20
    );
    applyNum('turnsRatio_n', 'Turns Ratio n', nFromTurns, ':1', 'Derived from edited integer turns Np / Ns');
  } else if (locked.Np_turns && locked.Ns_turns && isCanEdit('turnsRatio_n')) {
    const nFromTurns = clamp(
      Number((next.Np_turns / Math.max(1, next.Ns_turns)).toFixed(4)),
      0.25,
      20
    );
    applyNum('turnsRatio_n', 'Turns Ratio n', nFromTurns, ':1', 'Derived from locked Np / Ns');
  } else if (isCanEdit('turnsRatio_n')) {
    const nIdeal = isLLC
      ? (bridgeFactor * next.Vin_nom_V) / (cdrFactor * Math.max(1, next.Vout_V))
      : (targetDeff * next.Vin_nom_V) / (cdrFactor * Math.max(1, next.Vout_V));
    const nOpt = clamp(Number(roundTo(nIdeal, 0.05).toFixed(2)), 0.25, 20);
    applyNum(
      'turnsRatio_n',
      'Turns Ratio n',
      nOpt,
      ':1',
      isLLC ? 'Unity gain (M = 1.0) at nominal Vin' : 'Optimal Deff ≈ 72% with low-line headroom'
    );
  } else if (isCanEdit('Vin_nom_V')) {
    const vinIdeal = isLLC
      ? (next.turnsRatio_n * cdrFactor * next.Vout_V) / bridgeFactor
      : (next.turnsRatio_n * cdrFactor * next.Vout_V) / targetDeff;
    const vinOpt = clamp(roundTo(vinIdeal, 5), 48, 1000);
    applyNum('Vin_nom_V', 'Vin,nom', vinOpt, 'V', 'Matched Vin to locked turns ratio n & Vout');
    if (!locked.Vin_min_V) next.Vin_min_V = Math.max(24, Math.round(vinOpt * 0.9));
    if (!locked.Vin_max_V) next.Vin_max_V = Math.round(vinOpt * 1.075);
  } else if (isCanEdit('Vout_V')) {
    const voutIdeal = isLLC
      ? (bridgeFactor * next.Vin_nom_V) / (cdrFactor * Math.max(0.2, next.turnsRatio_n))
      : (targetDeff * next.Vin_nom_V) / (cdrFactor * Math.max(0.2, next.turnsRatio_n));
    const voutOpt = clamp(Math.round(voutIdeal), 12, 800);
    applyNum('Vout_V', 'Vout', voutOpt, 'V', 'Matched Vout to locked Vin & turns ratio n');
  }

  const fsw = Math.max(10e3, next.fsw_kHz * 1e3);
  const Tsw = 1 / fsw;
  const Vin = Math.max(24, next.Vin_nom_V);
  const Vout = Math.max(5, next.Vout_V);
  const Pout = Math.max(50, next.Pout_W);
  const n = Math.max(0.2, next.turnsRatio_n);
  const Iout_total = Pout / Vout;
  const Iout_phase = Iout_total / nPhases;
  const k_refl = isCDR ? 1 / (2 * n) : 1 / n;
  const Ipri_est = Math.max(0.5, Iout_phase * k_refl);
  const V_bridge = isHalfBridge ? Vin * 0.5 : Vin;
  const Deff_est = isLLC
    ? 0.94
    : clamp(isCDR ? (2 * n * Vout) / Vin : (n * Vout) / Vin, 0.15, 0.92);

  const material = MATERIAL_DATABASE.find((m) => m.id === next.materialId) || MATERIAL_DATABASE[0];

  // 6. Secondary Rectifier Auto-Selection (with unclamped ringing & clamp-fault margin)
  const vSecPkEst =
    next.txType === 'center-tapped'
      ? (2 * next.Vin_max_V) / n
      : next.Vin_max_V / n;
  if (isCanEdit('secDeviceId')) {
    const wantDiode = next.rectMode === 'schottky-diode';
    const clampMult =
      next.clampVariant === 'active-clamp'
        ? 1.14
        : next.clampVariant === 'pri-diode-clamp'
        ? 1.24
        : 1.44;
    const vSecReqStrict = isLLC
      ? vSecPkEst * 1.28
      : Math.max(vSecPkEst * clampMult * 1.25, vSecPkEst * 1.88 * 1.15);
    const vSecReqFallback = vSecPkEst * clampMult * 1.25;
    const pool = SEMICONDUCTOR_DATABASE.filter(
      (d) =>
        (d.role === 'secondary' || d.role === 'both') &&
        (wantDiode ? d.tech === 'SiC Schottky' : d.tech !== 'SiC Schottky')
    );
    const strictCands = pool.filter((d) => d.Vds_max_V >= vSecReqStrict);
    const fallbackCands =
      strictCands.length > 0
        ? strictCands
        : pool.filter((d) => d.Vds_max_V >= vSecReqFallback);
    const secCandidates = (
      fallbackCands.length > 0
        ? fallbackCands
        : pool.filter((d) => d.Vds_max_V >= vSecPkEst * 1.12)
    ).sort((a, b) => {
      const scoreA = a.Rds_on_25C_mOhm * (1 + a.Qg_nC / 400);
      const scoreB = b.Rds_on_25C_mOhm * (1 + b.Qg_nC / 400);
      return scoreA - scoreB || a.Rds_on_25C_mOhm - b.Rds_on_25C_mOhm;
    });
    if (secCandidates.length > 0) {
      applyStr(
        'secDeviceId',
        'Secondary Rectifier',
        secCandidates[0].id,
        `Rated ${secCandidates[0].Vds_max_V}V (${secCandidates[0].Rds_on_25C_mOhm} mΩ) with unclamped ringing headroom ≥ ${Math.round(vSecReqStrict)} V`
      );
    }
  }
  const secDevice =
    SEMICONDUCTOR_DATABASE.find((d) => d.id === next.secDeviceId) || SEMICONDUCTOR_DATABASE[14];

  // 7. Device Paralleling (nParallelPri, nParallelSec) with Thermal & Current Headroom
  if (isCanEdit('nParallelPri')) {
    const idMaxPri = priDevice.Id_max_A ?? 50;
    const nParPriOpt = clamp(Math.ceil((Ipri_est * 1.25) / (0.62 * idMaxPri)), 1, 4);
    applyNum('nParallelPri', 'Parallel Pri FETs', nParPriOpt, '×', 'Maintains <62% Id,max & safe Tj');
  }
  if (isCanEdit('nParallelSec')) {
    const idMaxSec = secDevice.Id_max_A ?? 80;
    const iSecRmsEst =
      next.txType === 'center-tapped'
        ? Iout_phase / Math.SQRT2
        : next.txType === 'current-doubler'
        ? Iout_phase * 0.58
        : Iout_phase / Math.SQRT2;
    let nParSecOpt = clamp(Math.ceil((iSecRmsEst * 1.15) / (0.60 * idMaxSec)), 1, 6);
    if (secDevice.Rds_on_25C_mOhm > 7 && iSecRmsEst > 18 && nParSecOpt < 2) {
      nParSecOpt = 2;
    }
    const isSecTht = /to-?220|to-?247|hip247/i.test(secDevice.packageType ?? '');
    const rthTimSec = next.Rth_TIM_CW ?? (isSecTht ? 0.75 : 0.25);
    const rthPerFet = secDevice.Rth_JC_CW + rthTimSec;
    const secSwitches = next.txType === 'full-bridge' ? 4 : 2;
    while (nParSecOpt < 6) {
      const iPerFet = iSecRmsEst / nParSecOpt;
      const pPerFet =
        iPerFet * iPerFet * (secDevice.Rds_on_25C_mOhm * 1e-3 * 1.45) +
        (next.rectMode === 'schottky-diode' ? iPerFet * secDevice.Vsd_V * 0.45 : 0);
      const pTotalSecApprox = pPerFet * nParSecOpt * secSwitches;
      const tjEst =
        next.Tamb_C +
        (pTotalSecApprox / (secSwitches * nPhases)) * (next.Rth_heatsink_CW || 0.75) +
        pPerFet * rthPerFet;
      if (tjEst <= 102) break;
      nParSecOpt += 1;
    }
    applyNum('nParallelSec', 'Parallel Sec FETs', nParSecOpt, '×', 'Shares secondary RMS current & R_ds(on) heat safely');
  }

  // 8. Leakage / Resonant Inductance (Llk_uH / Lr) & Resonant Capacitor (Cr_nF)
  const Coss_lag_J =
    0.5 *
    (2 * priDevice.Coss_er_pF * 1e-12 * Math.max(1, next.nParallelPri)) *
    Vin *
    Vin;
  const Coss_total_F =
    2 * priDevice.Coss_tr_pF * 1e-12 * Math.max(1, next.nParallelPri) +
    (next.Ctr_par_pF || 80) * 1e-12;

  if (isLLC) {
    const Rac = (8 / (Math.PI * Math.PI)) * n * n * (Vout / Math.max(0.1, Iout_phase));
    const Q_opt = 0.42;

    if (isCanEdit('Llk_uH') && isCanEdit('Cr_nF')) {
      const Z0_opt = Q_opt * Rac;
      const lrOpt = clamp(Number(((Z0_opt / (2 * Math.PI * fsw)) * 1e6).toFixed(1)), 1.0, 150);
      const crOpt = clamp(Math.round((1 / (2 * Math.PI * fsw * Z0_opt)) * 1e9), 5, 500);
      applyNum('Llk_uH', 'Lr', lrOpt, 'µH', 'Targeted Q ≈ 0.42 resonant tank impedance');
      applyNum('Cr_nF', 'Cr', crOpt, 'nF', 'Tuned f_r = f_sw for unity resonant gain');
    } else if (isCanEdit('Cr_nF')) {
      const lr_H = Math.max(0.5e-6, next.Llk_uH * 1e-6);
      const crOpt = clamp(Math.round(1e9 / (Math.pow(2 * Math.PI * fsw, 2) * lr_H)), 5, 500);
      applyNum('Cr_nF', 'Cr', crOpt, 'nF', 'Resonant match f_r = f_sw with locked L_r');
    } else if (isCanEdit('Llk_uH')) {
      const cr_F = Math.max(5e-9, next.Cr_nF * 1e-9);
      const lrOpt = clamp(Number((1e6 / (Math.pow(2 * Math.PI * fsw, 2) * cr_F)).toFixed(1)), 1.0, 150);
      applyNum('Llk_uH', 'Lr', lrOpt, 'µH', 'Resonant match f_r = f_sw with locked C_r');
    }
  } else {
    if (isCanEdit('Llk_uH')) {
      const I_lag_35 = Math.max(0.4, Ipri_est * 0.35);
      const Llk_zvs35_uH = ((2.2 * Coss_lag_J) / (I_lag_35 * I_lag_35)) * 1e6;
      const Llk_maxDuty_uH = ((0.14 * Vin) / (4 * fsw * Ipri_est)) * 1e6;
      const llkOpt = clamp(
        Number(Math.min(Math.max(1.5, Llk_zvs35_uH), Math.max(3.0, Llk_maxDuty_uH)).toFixed(1)),
        1.0,
        150
      );
      applyNum('Llk_uH', 'L_lk', llkOpt, 'µH', 'Balanced light-load ZVS energy vs. ΔD duty loss');
    }
  }

  // 9. Magnetizing Inductance Lm_uH
  if (isCanEdit('Lm_uH')) {
    if (isLLC) {
      const lmFromLn = 5.5 * next.Llk_uH;
      const td_s = Math.max(40e-9, next.deadTime_ns * 1e-9);
      const imMinZvs = Math.max(0.3, (2 * Coss_total_F * V_bridge) / td_s);
      const lmMaxZvs_uH = ((V_bridge * (Tsw / 4)) / imMinZvs) * 1e6;
      const lmOpt = clamp(roundTo(Math.min(lmFromLn, lmMaxZvs_uH), 5), 15, 2500);
      applyNum('Lm_uH', 'Lm', lmOpt, 'µH', 'Optimal Ln ≈ 5.5 with full ZVS magnetizing current');
    } else {
      const voltSecHalf = V_bridge * (Deff_est * Tsw * 0.5);
      const imTarget = Math.max(0.25, 0.07 * Ipri_est);
      const lmOpt = clamp(roundTo((voltSecHalf / (2 * imTarget)) * 1e6, 10), 40, 2500);
      applyNum('Lm_uH', 'Lm', lmOpt, 'µH', 'Sized Im,pk ≈ 7% of I_pri for low circulating loss');
    }
  }

  // 10. Output Filter Inductor Lo_uH (PSFB) & Output Filter Capacitor Co_uF + ESR
  if (!isLLC && isCanEdit('Lo_uH')) {
    const V_lo_on = Math.max(2, Vin / n - (isCDR ? Vout * 0.5 : Vout));
    const deltaIL_target = Math.max(0.5, 0.22 * Iout_phase);
    const loOpt = clamp(
      Math.round(((V_lo_on * (Deff_est * Tsw * 0.5)) / deltaIL_target) * 1e6),
      2,
      500
    );
    applyNum('Lo_uH', 'Lo', loOpt, 'µH', 'Targeted ~22% peak-to-peak inductor current ripple');
  }

  if (isCanEdit('Co_uF')) {
    const fRip_Hz = isCDR || nPhases === 2 ? 4 * fsw : 2 * fsw;
    const dVrip_target = Math.max(0.05, 0.004 * Vout); // 0.4% ripple ceiling
    const dIL_est = isLLC ? 0.35 * Iout_total : 0.22 * Iout_phase;
    const cRipple_uF = (dIL_est / (8 * fRip_Hz * dVrip_target)) * 1e6;
    const dI_step = 0.5 * Iout_total;
    const dVstep_target = Math.max(0.25, 0.025 * Vout); // 2.5% step deviation
    const Lo_H = Math.max(2e-6, next.Lo_uH * 1e-6);
    const cTransient_uF = isLLC
      ? (dI_step / (2 * Math.PI * Math.max(1e3, next.fc_target_kHz * 1e3) * dVstep_target)) * 1e6
      : ((Lo_H * dI_step * dI_step) / (2 * Vout * dVstep_target)) * 1e6;
    const coRaw = Math.max(cRipple_uF, cTransient_uF, (Pout / Math.max(12, Vout)) * 5.5);
    const coOpt = clamp(Math.ceil(coRaw / 20) * 20, 40, 4000);
    applyNum('Co_uF', 'Co', coOpt, 'µF', 'Sized for ≤0.4% Vout ripple & ≤2.5% step-load dip');
  }

  if (isCanEdit('ESR_Co_mOhm')) {
    const esrOpt = clamp(Number((2800 / Math.max(100, next.Co_uF)).toFixed(1)), 0.8, 25);
    applyNum('ESR_Co_mOhm', 'ESR Co', esrOpt, 'mΩ', 'Parallel low-ESR polymer/MLCC bank scaling');
  }

  // 11. Gate Drive & Dead-Time (Vgs_drive_V, Rg_ext_Ohm, deadTime_ns)
  if (isCanEdit('Vgs_drive_V')) {
    const vgsOpt =
      priDevice.tech === 'GaN HEMT' ? 6.5 : priDevice.tech === 'SiC MOSFET' ? 18 : 12;
    applyNum('Vgs_drive_V', 'Vgs Drive', vgsOpt, 'V', `Datasheet optimal Vgs for ${priDevice.tech}`);
  }
  if (isCanEdit('Rg_ext_Ohm')) {
    const rgOpt =
      priDevice.tech === 'GaN HEMT' ? 2.2 : priDevice.tech === 'SiC MOSFET' ? 4.7 : 8.2;
    applyNum('Rg_ext_Ohm', 'Rg,ext', rgOpt, 'Ω', `Balanced dv/dt & E_sw for ${priDevice.tech}`);
  }
  if (isCanEdit('deadTime_ns')) {
    const tdOpt = clamp(
      roundTo((Math.PI / 2) * Math.sqrt(Math.max(0.5e-6, next.Llk_uH * 1e-6) * Coss_total_F) * 1e9, 5),
      40,
      500
    );
    applyNum('deadTime_ns', 't_dead', tdOpt, 'ns', 'Quarter-wave LC resonant ZVS commutation');
  }

  // 12. Electro-Thermal Targets (Tj_max_limit_C, Rth_TIM_CW, Rth_heatsink_CW)
  if (isCanEdit('Tj_max_limit_C')) {
    const tjLimOpt = priDevice.tech === 'SiC MOSFET' ? 150 : 125;
    applyNum('Tj_max_limit_C', 'Tj Limit', tjLimOpt, '°C', `Safe SOA ceiling for ${priDevice.tech}`);
  }
  if (isCanEdit('Rth_TIM_CW')) {
    applyNum('Rth_TIM_CW', 'Rth,TIM', 0.12, '°C/W', 'Standard high-conductivity thermal pad');
  }
  if (isCanEdit('Rth_heatsink_CW')) {
    const tjLim = next.Tj_max_limit_C ?? (priDevice.tech === 'SiC MOSFET' ? 150 : 125);
    const tjTarget = Math.min(108, tjLim - 20);
    const rdsHot_Ohm = (priDevice.Rds_on_25C_mOhm * 1e-3 * 1.45) / Math.max(1, next.nParallelPri);
    const iPosRms = Ipri_est / Math.sqrt(2);
    const pCondPos = iPosRms * iPosRms * rdsHot_Ohm;
    const pSwPos =
      0.5 * Vin * Ipri_est * (priDevice.tf_ns * 1e-9) * fsw * (isLLC ? 0.25 : 0.45) +
      (priDevice.Qg_nC * 1e-9) * next.Vgs_drive_V * fsw;
    const pPosTotal = Math.max(1.5, pCondPos + pSwPos);
    const isPriTht = /to-?220|to-?247|hip247/i.test(priDevice.packageType ?? '');
    const rthTimPri = next.Rth_TIM_CW ?? (isPriTht ? 0.75 : 0.25);
    const rthAvailPri = (tjTarget - next.Tamb_C) / pPosTotal - priDevice.Rth_JC_CW - rthTimPri;

    // Also include secondary rectifier thermal budget so SR FETs never exceed tjTarget
    const nSecSw = next.txType === 'full-bridge' ? 4 : 2;
    const iSecRms =
      next.txType === 'center-tapped'
        ? Iout_phase / Math.SQRT2
        : next.txType === 'current-doubler'
        ? Iout_phase * 0.58
        : Iout_phase / Math.SQRT2;
    const rdsSecHot_Ohm = (secDevice.Rds_on_25C_mOhm * 1e-3 * 1.55) / Math.max(1, next.nParallelSec);
    const pSecCondPerPos = iSecRms * iSecRms * rdsSecHot_Ohm;
    const pSecDtPerPos =
      next.rectMode === 'sync-fet'
        ? (2 * Iout_phase * secDevice.Vsd_V * (next.deadTime_ns * 1e-9) * fsw) / nSecSw
        : 0;
    const pSecRrPerPos = 0.5 * fsw * vSecPkEst * (secDevice.Qrr_nC * 1e-9);
    const pSecPosTotal = Math.max(1.0, pSecCondPerPos + pSecDtPerPos + pSecRrPerPos);
    const isSecTht = /to-?220|to-?247|hip247/i.test(secDevice.packageType ?? '');
    const rthTimSec = next.Rth_TIM_CW ?? (isSecTht ? 0.85 : 0.25);
    const rthAvailSec = (tjTarget - next.Tamb_C) / pSecPosTotal - secDevice.Rth_JC_CW - rthTimSec;

    const rthAvail = Math.min(rthAvailPri, rthAvailSec);
    const rthOpt = clamp(Number(roundTo(rthAvail, 0.05).toFixed(2)), 0.12, 2.5);
    applyNum(
      'Rth_heatsink_CW',
      'Heatsink Rth',
      rthOpt,
      '°C/W',
      `Holds both Tj,pri & Tj,sec ≤ ${tjTarget}°C at Tamb=${next.Tamb_C}°C`
    );
  }

  // 13. Joint Transformer Core + Winding Turns + Litz Build Co-Optimization
  if (isCanEdit('litzStrandAWG')) {
    const awgOpt: 38 | 40 | 42 = next.fsw_kHz >= 240 ? 42 : next.fsw_kHz >= 130 ? 40 : 38;
    applyNum('litzStrandAWG', 'Litz AWG', awgOpt, 'AWG', `Skin-depth optimal at ${next.fsw_kHz} kHz`);
  }
  if (isCanEdit('insulationThickness_mm')) {
    const insOpt = next.Vin_max_V >= 450 ? 0.36 : next.Vin_max_V >= 200 ? 0.24 : 0.16;
    applyNum('insulationThickness_mm', 'Pri-Sec Tape', insOpt, 'mm', `IEC 62368-1 reinforced barrier for ${next.Vin_max_V}V`);
  }

  const strandArea = AWG_AREA_MM2[next.litzStrandAWG];
  const J_target_A_mm2 = 4.6;
  const Ap_req_cm4 = (() => {
    const P_per_core = Pout / nPhases;
    const Kf = 4.0;
    const Ku = 0.32;
    const B_op_T = Math.min(0.45 * material.Bsat_100C_T, Math.max(0.05, 0.14 * Math.pow(100 / Math.max(25, next.fsw_kHz), 0.52)));
    const J_A_cm2 = 450;
    return (P_per_core * 1.12 * 1e4) / (Kf * Ku * B_op_T * fsw * J_A_cm2);
  })();

  const lockedCore = CORE_DATABASE.find((c) => c.id === next.coreId) || CORE_DATABASE[3];
  const nonPlanarCores = CORE_DATABASE.filter((c) => c.id !== 'elp64').sort(
    (a, b) => a.Ap_cm4 - b.Ap_cm4
  );
  const filteredCores = nonPlanarCores.filter((c) => c.Ap_cm4 >= Ap_req_cm4 * 0.65);
  const candidateCores = isCanEdit('coreId')
    ? filteredCores.length > 0
      ? filteredCores
      : nonPlanarCores
    : [lockedCore];

  const voltSecHalf = V_bridge * (Deff_est * Tsw * 0.5);
  const bHfTarget_T = Math.min(
    0.48 * material.Bsat_100C_T,
    Math.max(0.045, 0.14 * Math.pow(100 / Math.max(25, next.fsw_kHz), 0.52))
  );
  const baseInterleave: 'none' | 'split-pri' | 'full-interleaved' = isCanEdit('interleaving')
    ? Pout >= 1500 || next.fsw_kHz >= 140
      ? 'full-interleaved'
      : 'split-pri'
    : next.interleaving;

  interface TxOptCandidate {
    coreId: string;
    Np: number;
    Ns: number;
    priStrands: number;
    secStrands: number;
    interleaving: 'none' | 'split-pri' | 'full-interleaved';
    fits: boolean;
    safe: boolean;
    score: number;
    Bpk_mT: number;
    utilPct: number;
    Tcore_C: number;
  }

  let bestSafe: TxOptCandidate | null = null;
  let bestFallback: TxOptCandidate | null = null;

  for (const candCore of candidateCores) {
    const Ae_m2 = candCore.Ae_mm2 * 1e-6;
    const turnPairs: { np: number; ns: number }[] = [];

    if (isCanEdit('Np_turns') && isCanEdit('Ns_turns')) {
      const seen = new Set<string>();
      for (const bScale of [0.75, 0.95, 1.15, 1.40, 1.65]) {
        const bTry = Math.min(0.66 * material.Bsat_100C_T, Math.max(0.04, bHfTarget_T * bScale));
        let nsCenter = Math.max(1, Math.round(voltSecHalf / (2 * bTry * Ae_m2 * n)));
        const nsStart = Math.max(1, nsCenter - 1);
        const nsEnd = Math.min(24, nsCenter + 2);
        for (let nsTry = nsStart; nsTry <= nsEnd; nsTry++) {
          let npTry = clamp(Math.round(nsTry * n), 2, 200);
          while (voltSecHalf / (2 * npTry * Ae_m2) > 0.78 * material.Bsat_100C_T && npTry < 200) {
            npTry += 1;
          }
          const key = `${npTry}:${nsTry}`;
          if (!seen.has(key)) {
            seen.add(key);
            turnPairs.push({ np: npTry, ns: nsTry });
          }
        }
      }
    } else if (isCanEdit('Np_turns')) {
      const nsFixed = Math.max(1, Math.round(next.Ns_turns));
      const npMatched = clamp(Math.round(nsFixed * n), 2, 200);
      turnPairs.push({ np: npMatched, ns: nsFixed });
    } else if (isCanEdit('Ns_turns')) {
      const npFixed = Math.max(2, Math.round(next.Np_turns));
      const nsMatched = clamp(Math.round(npFixed / n), 1, 100);
      turnPairs.push({ np: npFixed, ns: nsMatched });
    } else {
      turnPairs.push({ np: Math.max(1, Math.round(next.Np_turns)), ns: Math.max(1, Math.round(next.Ns_turns)) });
    }

    const interleaveModes: ('none' | 'split-pri' | 'full-interleaved')[] = isCanEdit('interleaving')
      ? baseInterleave === 'full-interleaved'
        ? ['full-interleaved', 'split-pri']
        : ['split-pri', 'full-interleaved']
      : [next.interleaving];

    const secWindowMult = next.txType === 'center-tapped' ? 2 : 1;

    for (const pair of turnPairs) {
      const reqAreaPri = Ipri_est / J_target_A_mm2;
      const rawPri = Math.max(20, Math.round(reqAreaPri / strandArea / 10) * 10);
      const maxWindowPri = Math.max(30, Math.floor((candCore.Aw_mm2 * 0.28) / (pair.np * strandArea)));
      const priTryBase = isCanEdit('priStrands')
        ? clamp(Math.min(rawPri, maxWindowPri), 20, 1200)
        : next.priStrands;
      const priTryVariants = isCanEdit('priStrands') && priTryBase >= 80
        ? [priTryBase, clamp(Math.round((priTryBase * 0.80) / 10) * 10, 20, 1200)]
        : [priTryBase];

      const iSecRms = Iout_phase * (next.txType === 'center-tapped' ? 0.72 : 1.0);
      const reqAreaSec = iSecRms / J_target_A_mm2;
      const rawSec = Math.max(30, Math.round(reqAreaSec / strandArea / 10) * 10);
      const maxWindowSec = Math.max(
        40,
        Math.floor((candCore.Aw_mm2 * 0.30) / (Math.max(1, pair.ns) * secWindowMult * strandArea))
      );
      const secTryBase = isCanEdit('secStrands')
        ? clamp(Math.min(rawSec, maxWindowSec), 30, 1400)
        : next.secStrands;
      const secTryVariants = isCanEdit('secStrands') && secTryBase >= 140
        ? Array.from(
            new Set([
              secTryBase,
              clamp(Math.round((secTryBase * 0.80) / 10) * 10, 40, 1400),
              clamp(Math.round((secTryBase * 0.62) / 10) * 10, 40, 1400),
            ])
          )
        : [secTryBase];

      for (const priTry of priTryVariants) {
        for (const secTry of secTryVariants) {
          for (const intMode of interleaveModes) {
            const ratioTry = Number((pair.np / Math.max(1, pair.ns)).toFixed(4));
            const trialState: DcDcDesignState = {
              ...next,
              coreId: candCore.id,
              Np_turns: pair.np,
              Ns_turns: pair.ns,
              turnsRatio_n: ratioTry,
              priStrands: priTry,
              secStrands: secTry,
              interleaving: intMode,
            };
            const trialRes = solveDcDcDesign(trialState);
            const radialEst = estimateTransformerRadialBuildMm({
              bw_mm: candCore.bw_mm,
              Ve_mm3: candCore.Ve_mm3,
              Vin_nom_V: next.Vin_nom_V,
              Np: pair.np,
              Ns: pair.ns,
              isCenterTapped: next.txType === 'center-tapped',
              priStrands: priTry,
              secStrands: secTry,
              litzAwg: next.litzStrandAWG,
              interleaving: intMode,
              insulationThickness_mm: next.insulationThickness_mm,
              estAirGap_mm: Math.max(0.2, trialRes.airGap_mm),
            });
            const fits = radialEst <= candCore.hw_mm * 0.92;
            const fitsComfortably = radialEst <= candCore.hw_mm * 0.82;
            if (
              !fitsComfortably &&
              isCanEdit('interleaving') &&
              intMode === 'full-interleaved' &&
              interleaveModes.length > 1
            ) {
              continue;
            }

            const utilPct = trialRes.saturationCheck.utilization_100C_pct;
            const tCore = trialRes.coreThermalAnalysis.Tcore_hotspot_C;
            const safe =
              fitsComfortably &&
              trialRes.saturationCheck.status !== 'critical' &&
              trialRes.coreThermalAnalysis.coreThermalStable &&
              tCore <= 108 &&
              utilPct <= 78;

            const ratioDriftPenalty = locked.turnsRatio_n
              ? Math.abs(ratioTry - n) * 40
              : Math.abs(ratioTry - n) * 2.5;
            const oversizePenalty =
              utilPct < 12 && candCore.Ve_mm3 >= 35000
                ? 40
                : utilPct < 14 && trialRes.Pcu_W > 3.0 * Math.max(0.25, trialRes.Pcore_W) && candCore.Ve_mm3 >= 35000
                ? 22
                : 0;
            const score =
              trialRes.Pcore_W +
              trialRes.Pcu_W +
              0.00022 * candCore.Ve_mm3 +
              oversizePenalty +
              ratioDriftPenalty +
              (utilPct > 75 ? (utilPct - 75) * 0.4 : 0) +
              (tCore > 100 ? (tCore - 100) * 0.6 : 0) +
              (fits ? 0 : 120) +
              (fitsComfortably ? 0 : 18) +
              (trialRes.saturationCheck.status === 'critical' ? 200 : 0) +
              (trialRes.coreThermalAnalysis.coreThermalStable ? 0 : 200);

            const item: TxOptCandidate = {
              coreId: candCore.id,
              Np: pair.np,
              Ns: pair.ns,
              priStrands: priTry,
              secStrands: secTry,
              interleaving: intMode,
              fits,
              safe,
              score,
              Bpk_mT: trialRes.Bpk_mT,
              utilPct,
              Tcore_C: tCore,
            };

            if (safe && (!bestSafe || item.score < bestSafe.score)) {
              bestSafe = item;
            }
            if (!bestFallback || item.score < bestFallback.score) {
              bestFallback = item;
            }
          }
        }
      }
    }
  }

  const txWinner = bestSafe || bestFallback;
  if (txWinner) {
    const winCore = CORE_DATABASE.find((c) => c.id === txWinner.coreId) || lockedCore;
    if (isCanEdit('coreId')) {
      applyStr(
        'coreId',
        'Core Geometry',
        txWinner.coreId,
        `Compact ${winCore.name} (Bpk=${txWinner.Bpk_mT.toFixed(0)} mT, ${txWinner.utilPct.toFixed(0)}% B_sat, T_core=${txWinner.Tcore_C.toFixed(0)}°C)`
      );
    }
    if (isCanEdit('Np_turns')) {
      applyNum(
        'Np_turns',
        'Np Turns',
        txWinner.Np,
        'T',
        `Joint core/loss optimal (${txWinner.utilPct.toFixed(0)}% of ${(material.Bsat_100C_T * 1000).toFixed(0)} mT B_sat)`
      );
    }
    if (isCanEdit('Ns_turns')) {
      applyNum('Ns_turns', 'Ns Turns', txWinner.Ns, 'T', 'Matched integer turns to turns ratio n');
    }
    if (isCanEdit('priStrands')) {
      applyNum('priStrands', 'Pri Strands', txWinner.priStrands, '', `J ≈ ${J_target_A_mm2} A/mm² inside bobbin`);
    }
    if (isCanEdit('secStrands')) {
      applyNum('secStrands', 'Sec Strands', txWinner.secStrands, '', `J ≈ ${J_target_A_mm2} A/mm² inside bobbin`);
    }
    if (isCanEdit('interleaving')) {
      applyStr('interleaving', 'Interleaving', txWinner.interleaving, 'Minimized Dowell proximity loss & window fit');
    }
  }

  // Keep turnsRatio_n synchronized with finalized integer turns whenever unlocked or turns were edited
  const actualRatio = Number((next.Np_turns / Math.max(1, next.Ns_turns)).toFixed(4));
  if ((isCanEdit('turnsRatio_n') || userEditedTurns) && Math.abs(next.turnsRatio_n - actualRatio) > 1e-4) {
    applyNum(
      'turnsRatio_n',
      'Turns Ratio n',
      actualRatio,
      ':1',
      `Synced exact Np/Ns ratio (${next.Np_turns}/${next.Ns_turns})`
    );
  }

  // 16. Control Loop & Current Sense Auto-Tuning
  const nActual = Math.max(0.2, next.Np_turns / Math.max(1, next.Ns_turns));
  if (isCanEdit('fc_target_kHz')) {
    const Lo_eq_H = Math.max(1e-6, (next.Lo_uH * 1e-6) / nPhases);
    const Co_H = Math.max(10e-6, next.Co_uF * 1e-6);
    const f0_est_kHz = 1 / (2 * Math.PI * Math.sqrt(Lo_eq_H * Co_H)) / 1e3;
    const fcFloor = isLLC ? 2.5 : Math.max(5.0, f0_est_kHz * 2.2);
    const fcCeiling = Math.min(25, Math.max(fcFloor, next.fsw_kHz / 6.5));
    const fcOpt = clamp(
      Number(roundTo(Math.min(fcCeiling, Math.max(fcFloor, next.fsw_kHz / 10)), 0.5).toFixed(1)),
      1.5,
      25
    );
    applyNum(
      'fc_target_kHz',
      'fc',
      fcOpt,
      'kHz',
      `Decoupled well above LC f_0 (${f0_est_kHz.toFixed(1)} kHz) & bounded ≤ f_sw/6.5`
    );
  }
  if (isCanEdit('pm_target_deg')) {
    applyNum('pm_target_deg', 'PM', 58, '°', 'Optimal damping target (58° phase margin)');
  }
  if (isCanEdit('slopeFactor_mc')) {
    const preSlopeRes = solveDcDcDesign(next);
    const Deff_nom_est = preSlopeRes.Deff_nom;
    const Deff_wc_est = preSlopeRes.Deff_max;
    const dPrimeNom = Math.max(0.08, 1 - (isLLC ? Deff_nom_est * 0.5 : Deff_nom_est));
    const dPrimeWc = Math.max(0.05, 1 - (isLLC ? Deff_wc_est * 0.5 : Deff_wc_est));
    const mcNom = (0.5 + 1 / (Math.PI * 1.15)) / dPrimeNom;
    const mcWc = (0.5 + 1 / (Math.PI * 1.2)) / dPrimeWc;
    const mcOpt = clamp(Number(roundTo(Math.max(1.5, mcNom, mcWc), 0.05).toFixed(2)), 1.5, 6.5);
    applyNum(
      'slopeFactor_mc',
      'Slope mc',
      mcOpt,
      '',
      `Ridley subharmonic damping Q_p ≤ 1.15 at ${(Deff_nom_est * 100).toFixed(0)}% duty & Q_p(Vin,min) ≤ 1.20`
    );
  }
  if (isCanEdit('Rsense_mOhm')) {
    const rsOpt = clamp(Math.round((2100 / Math.max(4, Ipri_est * 1.4)) / 5) * 5, 5, 100);
    applyNum('Rsense_mOhm', 'Rsense', rsOpt, 'mΩ', 'Scaled for full 3.3V ADC dynamic range');
  }
  if (isCanEdit('fs_digital_kHz')) {
    const fsDigOpt = clamp(roundTo(Math.min(400, next.fsw_kHz * 2), 10), 50, 500);
    applyNum('fs_digital_kHz', 'fs Digital', fsDigOpt, 'kHz', 'Double-update PWM/ADC sampling');
  }

  // Control loop stability verification guard (ensures PM >= 48°, WC >= 38°, GM >= 6.8 dB)
  let ctrlVerifyRes = solveDcDcDesign(next);
  if (
    ctrlVerifyRes.pm_actual_deg < 48 ||
    ctrlVerifyRes.pm_wc_min_deg < 38 ||
    ctrlVerifyRes.gm_actual_dB < 6.8
  ) {
    if (isCanEdit('pm_target_deg') && next.pm_target_deg < 65) {
      let pmTry = next.pm_target_deg;
      while (
        pmTry < 65 &&
        (ctrlVerifyRes.pm_actual_deg < 48 || ctrlVerifyRes.pm_wc_min_deg < 38)
      ) {
        pmTry = Math.min(65, pmTry + 3);
        ctrlVerifyRes = solveDcDcDesign({ ...next, pm_target_deg: pmTry });
      }
      if (pmTry !== next.pm_target_deg) {
        applyNum('pm_target_deg', 'PM', pmTry, '°', 'Verified closed-loop phase margin ≥ 48°');
      }
    }
    if (
      isCanEdit('fc_target_kHz') &&
      (ctrlVerifyRes.pm_actual_deg < 48 ||
        ctrlVerifyRes.pm_wc_min_deg < 38 ||
        ctrlVerifyRes.gm_actual_dB < 6.8)
    ) {
      const fcFloorSafe = isLLC ? 2.5 : Math.max(4.5, ctrlVerifyRes.f0_lc_kHz * 1.75);
      let fcTry = next.fc_target_kHz;
      while (
        fcTry > fcFloorSafe + 0.4 &&
        (ctrlVerifyRes.pm_actual_deg < 48 ||
          ctrlVerifyRes.pm_wc_min_deg < 38 ||
          ctrlVerifyRes.gm_actual_dB < 6.8)
      ) {
        fcTry = Math.max(fcFloorSafe, Number((fcTry - 0.5).toFixed(1)));
        ctrlVerifyRes = solveDcDcDesign({ ...next, fc_target_kHz: fcTry });
      }
      if (Math.abs(fcTry - next.fc_target_kHz) > 0.05) {
        applyNum(
          'fc_target_kHz',
          'fc',
          fcTry,
          'kHz',
          `Verified PM ≥ 48° & GM ≥ 6.8 dB while keeping f_c ≥ 1.75×f_0`
        );
      }
    }
  }

  // 17. Final Exact Electro-Thermal Verification Guard (nParallelSec & Rth_heatsink_CW)
  const tjVerifyCeiling = Math.min(108, (next.Tj_max_limit_C ?? 125) - 17);
  let verifyRes = solveDcDcDesign(next);
  if (isCanEdit('nParallelSec') && verifyRes.Tj_sec_C > tjVerifyCeiling) {
    let nParTry = next.nParallelSec;
    while (nParTry < 6 && verifyRes.Tj_sec_C > tjVerifyCeiling) {
      nParTry += 1;
      verifyRes = solveDcDcDesign({ ...next, nParallelSec: nParTry });
    }
    if (nParTry !== next.nParallelSec) {
      applyNum(
        'nParallelSec',
        'Parallel Sec FETs',
        nParTry,
        '×',
        `Verified secondary Tj ≤ ${tjVerifyCeiling}°C across exact electro-thermal loop`
      );
    }
  }
  if (
    isCanEdit('Rth_heatsink_CW') &&
    Math.max(verifyRes.Tj_pri_C, verifyRes.Tj_sec_C) > tjVerifyCeiling
  ) {
    let rthTry = next.Rth_heatsink_CW;
    while (rthTry > 0.12 && Math.max(verifyRes.Tj_pri_C, verifyRes.Tj_sec_C) > tjVerifyCeiling) {
      rthTry = Math.max(0.1, Number((rthTry - 0.05).toFixed(2)));
      verifyRes = solveDcDcDesign({ ...next, Rth_heatsink_CW: rthTry });
    }
    if (rthTry !== next.Rth_heatsink_CW) {
      applyNum(
        'Rth_heatsink_CW',
        'Heatsink Rth',
        rthTry,
        '°C/W',
        `Verified primary & secondary Tj ≤ ${tjVerifyCeiling}°C`
      );
    }
  }

  return { nextState: next, changes };
}

/**
 * Automatically recalculates unlocked AC-DC PFC circuit parameters across
 * grid envelope, switch selection, magnetics, DC-link bulk bank, control loops,
 * and protection/EMI sub-tool parameters.
 */
export function optimizeAcDcUnlocked(
  prevState: AcDcDesignState,
  candidateState: AcDcDesignState,
  changedKey: keyof AcDcDesignState | null,
  locked: Record<AcDcLockableKey, boolean>
): {
  nextState: AcDcDesignState;
  changes: AutoOptChange<AcDcLockableKey>[];
} {
  const next: AcDcDesignState = { ...candidateState };
  const changes: AutoOptChange<AcDcLockableKey>[] = [];

  const isCanEdit = (k: AcDcLockableKey) => !locked[k] && changedKey !== k;
  const upsertChange = (entry: AutoOptChange<AcDcLockableKey>) => {
    const idx = changes.findIndex((c) => c.key === entry.key);
    if (String(entry.oldVal) === String(entry.newVal)) {
      if (idx >= 0) changes.splice(idx, 1);
      return;
    }
    if (idx >= 0) {
      changes[idx] = { ...entry, oldVal: changes[idx].oldVal };
    } else {
      changes.push(entry);
    }
  };

  const applyNum = (
    k: AcDcLockableKey,
    label: string,
    newVal: number,
    unit: string,
    reason: string
  ) => {
    const prevVal = (prevState as unknown as Record<string, unknown>)[k];
    const currentVal = (next as unknown as Record<string, unknown>)[k];
    const curNum = typeof currentVal === 'number' ? currentVal : newVal;
    if (typeof currentVal !== 'number' || Math.abs(newVal - curNum) > 1e-6) {
      (next as unknown as Record<string, unknown>)[k] = newVal;
      upsertChange({
        key: k,
        label,
        oldVal: typeof prevVal === 'number' ? Number(prevVal.toFixed(2)) : curNum,
        newVal: Number(newVal.toFixed(2)),
        unit,
        reason,
      });
    }
  };
  const applyStr = (
    k: AcDcLockableKey,
    label: string,
    newVal: string,
    reason: string
  ) => {
    const prevVal = String((prevState as unknown as Record<string, unknown>)[k] ?? '');
    const curVal = String((next as unknown as Record<string, unknown>)[k] ?? '');
    if (newVal !== curVal) {
      (next as unknown as Record<string, unknown>)[k] = newVal;
      upsertChange({
        key: k,
        label,
        oldVal: prevVal,
        newVal,
        unit: '',
        reason,
      });
    }
  };

  // 1. AC Grid Min/Max Bounds
  if (isCanEdit('Vac_min_V')) {
    const vminOpt = clamp(Math.round(next.Vac_rms_V * 0.8), 85, next.Vac_rms_V);
    applyNum('Vac_min_V', 'Vac,min', vminOpt, 'V', '-20% AC brownout line limit');
  }
  if (isCanEdit('Vac_max_V')) {
    const vmaxOpt = clamp(Math.round(next.Vac_rms_V * 1.15), next.Vac_rms_V + 10, 520);
    applyNum('Vac_max_V', 'Vac,max', vmaxOpt, 'V', '+15% high-line swell envelope');
  }

  const nPhases =
    next.topology === '2ph-interleaved-totem' || next.topology === '2ph-interleaved-boost' ? 2 : 1;

  // 2. Optimal DC Bus Voltage (if unlocked)
  if (isCanEdit('Vdc_bus_V')) {
    const vpkMax = next.Vac_max_V * Math.sqrt(2);
    const vdcOpt = clamp(roundTo(Math.max(400, vpkMax * 1.08), 10), 350, 900);
    applyNum('Vdc_bus_V', 'Vdc Bus', vdcOpt, 'V', 'Maintained boost headroom above √2·Vac,max');
  }

  // 3. Fast Switching Device Auto-Selection (if unlocked)
  if (isCanEdit('fastSwitchId')) {
    const vReq = next.Vdc_bus_V * 1.45;
    const isTotem = next.topology === '2ph-interleaved-totem' || next.topology === '1ph-totem-pfc';
    const candidates = SEMICONDUCTOR_DATABASE.filter(
      (d) =>
        (d.role === 'primary' || d.role === 'both') &&
        d.Vds_max_V >= vReq &&
        (!isTotem || d.tech !== 'SJ Si MOSFET') // Totem-pole CCM requires GaN or SiC (low Qrr)
    );
    if (candidates.length > 0) {
      const sorted = candidates.sort(
        (a, b) => a.Rds_on_25C_mOhm * Math.max(4, a.Qg_nC) - b.Rds_on_25C_mOhm * Math.max(4, b.Qg_nC)
      );
      applyStr(
        'fastSwitchId',
        'Fast Switch',
        sorted[0].id,
        `Rated ${sorted[0].Vds_max_V}V ${sorted[0].tech} for ${next.Vdc_bus_V}V bus`
      );
    }
  }

  const sw =
    SEMICONDUCTOR_DATABASE.find((d) => d.id === next.fastSwitchId) || SEMICONDUCTOR_DATABASE[0];

  // 4. Hold-up minimum bus threshold
  if (isCanEdit('Vdc_min_hold_V')) {
    const vminOpt = clamp(roundTo(next.Vdc_bus_V * 0.8, 10), 250, 750);
    applyNum('Vdc_min_hold_V', 'Vdc,min Hold', vminOpt, 'V', '80% of nominal DC bus voltage');
  }

  // 5. Optimal Switching Frequency (if unlocked)
  if (isCanEdit('fsw_kHz')) {
    let fswOpt = sw.tech === 'GaN HEMT' ? 110 : sw.tech === 'SiC MOSFET' ? 75 : 55;
    if (next.Pout_W > 7500) fswOpt = Math.round(fswOpt * 0.85);
    fswOpt = clamp(roundTo(fswOpt, 5), 25, 250);
    applyNum('fsw_kHz', 'f_sw', fswOpt, 'kHz', `Optimal loss/EMI point for ${sw.tech}`);
  }

  const fsw = Math.max(20e3, next.fsw_kHz * 1e3);
  const Vac_min = Math.max(85, next.Vac_min_V);
  const Vdc = Math.max(350, next.Vdc_bus_V);
  const Pout = Math.max(200, next.Pout_W);

  // 6. Boost Inductor Lpfc_uH sized for ~24% ripple at low-line peak
  if (isCanEdit('Lpfc_uH')) {
    const Vpk_min = Vac_min * Math.sqrt(2);
    const Iph_pk_max = (Math.sqrt(2) * (Pout / (0.97 * Vac_min))) / nPhases;
    const D_low = clamp(1 - Vpk_min / Math.max(Vpk_min + 20, Vdc), 0.12, 0.78);
    const dIL_target = Math.max(0.8, 0.24 * Iph_pk_max);
    const lpfcOpt = clamp(
      roundTo(((Vpk_min * D_low) / (fsw * dIL_target)) * 1e6, 5),
      40,
      600
    );
    applyNum('Lpfc_uH', 'Lpfc / Ph', lpfcOpt, 'µH', 'Targeted ~24% inductor ripple at low-line peak');
  }

  // 7. Inductor Copper Resistance RL_mOhm
  if (isCanEdit('RL_mOhm')) {
    const Iph_rms = Pout / (0.97 * next.Vac_rms_V * nPhases);
    const rlOpt = clamp(Math.round(12 + next.Lpfc_uH / 16 + 80 / Math.max(4, Iph_rms)), 5, 120);
    applyNum('RL_mOhm', 'Inductor RL', rlOpt, 'mΩ', 'Estimated DCR scaling with Lpfc & current');
  }

  // 8. DC-Link Capacitor Cdc_uF sized for hold-up time & <= 4% 2f_line ripple
  if (isCanEdit('Cdc_uF')) {
    const vMinHold = Math.min(Vdc - 20, next.Vdc_min_hold_V);
    const C_hold_uF =
      ((2 * Pout * (next.tHold_ms * 1e-3)) / Math.max(5000, Vdc * Vdc - vMinHold * vMinHold)) * 1e6;
    const dV_2f_target = 0.04 * Vdc;
    const C_ripple_uF =
      (Pout / (2 * Math.PI * next.f_line_Hz * Vdc * dV_2f_target)) * 1e6;
    const cdcOpt = clamp(
      Math.ceil((Math.max(C_hold_uF, C_ripple_uF) * 1.06) / 50) * 50,
      300,
      4500
    );
    applyNum(
      'Cdc_uF',
      'Cdc Bank',
      cdcOpt,
      'µF',
      `Satisfies ${next.tHold_ms}ms hold-up & ≤4% 2f-ripple`
    );
  }

  // 9. DC-Link ESR
  if (isCanEdit('ESR_Cdc_mOhm')) {
    const esrOpt = clamp(Math.round(38000 / Math.max(300, next.Cdc_uF)), 5, 80);
    applyNum('ESR_Cdc_mOhm', 'ESR Cdc', esrOpt, 'mΩ', 'Parallel bulk capacitor bank ESR scaling');
  }

  // 10. Digital Control Loops
  if (isCanEdit('fs_ctrl_kHz')) {
    const fsOpt = clamp(roundTo(next.fsw_kHz, 5), 25, 200);
    applyNum('fs_ctrl_kHz', 'ADC fs_ctrl', fsOpt, 'kHz', 'Synchronized PWM/ADC control sampling');
  }
  if (isCanEdit('fc_i_kHz')) {
    const fciOpt = clamp(Number(roundTo(next.fsw_kHz / 10, 0.5).toFixed(1)), 2.0, 20.0);
    applyNum('fc_i_kHz', 'fc,i', fciOpt, 'kHz', 'Optimal f_sw/10 inner current bandwidth');
  }
  if (isCanEdit('pm_i_deg')) {
    applyNum('pm_i_deg', 'PM_i', 58, '°', 'Optimal inner current loop phase margin (58°)');
  }
  if (isCanEdit('fc_v_Hz')) {
    const fcvOpt = next.f_line_Hz === 60 ? 18 : 15;
    applyNum('fc_v_Hz', 'fc,v', fcvOpt, 'Hz', '2f_line ripple attenuation for <2.5% THDi');
  }
  if (isCanEdit('pm_v_deg')) {
    applyNum('pm_v_deg', 'PM_v', 60, '°', 'Overdamped outer DC bus voltage response');
  }

  // 11. Sub-Tool Engineering Parameters (ZCD dead-time, Pre-charge R_NTC, Safety Y2 Cap)
  if (isCanEdit('deadTime_zcd_ns')) {
    const cOssEff_F = Math.max(60e-12, 2 * sw.Coss_tr_pF * 1e-12);
    const lRes_H = next.Lpfc_uH * 1e-6;
    const tdZcdOpt = clamp(
      roundTo((Math.PI / 2) * Math.sqrt(lRes_H * cOssEff_F) * 1e9 * 0.55, 10),
      60,
      320
    );
    applyNum(
      'deadTime_zcd_ns',
      'ZCD t_dead',
      tdZcdOpt,
      'ns',
      `LC zero-crossing blanking for ${sw.id}`
    );
  }

  if (isCanEdit('prechargeR_Ohm')) {
    const vPkMax = next.Vac_max_V * Math.sqrt(2);
    const iLinePk = (Math.sqrt(2) * Pout) / Math.max(85, next.Vac_min_V);
    const iInrushTarget = Math.max(22, Math.min(48, 1.35 * iLinePk));
    const rOpt = clamp(Math.round(vPkMax / iInrushTarget), 5, 47);
    applyNum(
      'prechargeR_Ohm',
      'R_NTC Precharge',
      rOpt,
      'Ω',
      `Caps peak surge ≤ ${Math.round(iInrushTarget)} A at ${Math.round(vPkMax)} Vpk`
    );
  }

  if (isCanEdit('Cy_nF')) {
    const maxLeak_A = 0.00072; // Safe below 0.75mA handheld / 3.5mA industrial IEC 62368-1
    const cyMax_nF = (maxLeak_A / (2 * Math.PI * next.f_line_Hz * next.Vac_max_V)) * 1e9;
    const cyOpt = snapFloor(Math.max(1.0, cyMax_nF), Y_CAP_SERIES_NF);
    applyNum(
      'Cy_nF',
      'Safety Y2 Cap',
      cyOpt,
      'nF',
      `Keeps PE leakage ≤ 0.72 mA @ ${next.Vac_max_V} Vac`
    );
  }

  return { nextState: next, changes };
}
