import {
  AcDcDesignState,
  CORE_DATABASE,
  DcDcDesignState,
  MATERIAL_DATABASE,
  SEMICONDUCTOR_DATABASE,
} from '../data/databases';

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

  // 4. Core Material Auto-Selection (if unlocked)
  if (isCanEdit('materialId')) {
    const matOpt =
      next.fsw_kHz >= 125 ? 'PC95' : next.fsw_kHz >= 75 ? '3C97' : 'N97';
    applyStr(
      'materialId',
      'Core Material',
      matOpt,
      `Lowest Steinmetz loss density at ${next.fsw_kHz} kHz`
    );
  }

  // 5. Coupled Voltage & Transformer Turns Ratio (Vin, Vout, turnsRatio_n, Np, Ns)
  const targetDeff = 0.72;
  const bridgeFactor = isHalfBridge ? 0.5 : 1.0;
  const cdrFactor = isCDR ? 2.0 : 1.0;

  if (locked.Np_turns && locked.Ns_turns && isCanEdit('turnsRatio_n')) {
    const nFromTurns = clamp(
      Number((next.Np_turns / Math.max(1, next.Ns_turns)).toFixed(2)),
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

  // 6. Core Geometry Selection via Area Product Ap + Radial Window Fit Guard (if unlocked)
  const material = MATERIAL_DATABASE.find((m) => m.id === next.materialId) || MATERIAL_DATABASE[0];
  const Ap_req_cm4 = (() => {
    const P_per_core = Pout / nPhases;
    const Kf = 4.0;
    const Ku = 0.32;
    const B_op_T = 0.45 * material.Bsat_100C_T;
    const J_A_cm2 = 450;
    return (P_per_core * 1.12 * 1e4) / (Kf * Ku * B_op_T * fsw * J_A_cm2);
  })();
  if (isCanEdit('coreId')) {
    const nonPlanarCores = CORE_DATABASE.filter((c) => c.id !== 'elp64').sort(
      (a, b) => a.Ap_cm4 - b.Ap_cm4
    );
    const estAwg: 38 | 40 | 42 = next.fsw_kHz > 180 ? 42 : next.fsw_kHz > 100 ? 40 : 38;
    const estStrandArea = AWG_AREA_MM2[estAwg];
    const estPriStrands = clamp(Math.round(Ipri_est / 4.6 / estStrandArea), 20, 1200);
    const iSecEst = Iout_phase * (next.txType === 'center-tapped' ? 0.72 : 1.0);
    const estSecStrands = clamp(Math.round(iSecEst / 4.6 / estStrandArea), 30, 2000);
    const estGap = isLLC ? 1.2 : 0.2;
    const estInterleaving = locked.interleaving
      ? next.interleaving
      : Pout >= 1500 || next.fsw_kHz >= 140
      ? 'full-interleaved'
      : 'split-pri';

    const chosen =
      nonPlanarCores.find((c) => {
        if (c.Ap_cm4 < Ap_req_cm4) return false;
        const voltSecHalfEst = V_bridge * (Deff_est * Tsw * 0.5);
        const npEst = Math.max(
          4,
          Math.round(voltSecHalfEst / (2 * 0.55 * material.Bsat_100C_T * (c.Ae_mm2 * 1e-6)))
        );
        const nsEst = Math.max(1, Math.round(npEst / n));
        const radialEst = estimateTransformerRadialBuildMm({
          bw_mm: c.bw_mm,
          Ve_mm3: c.Ve_mm3,
          Vin_nom_V: next.Vin_nom_V,
          Np: npEst,
          Ns: nsEst,
          isCenterTapped: next.txType === 'center-tapped',
          priStrands: estPriStrands,
          secStrands: estSecStrands,
          litzAwg: estAwg,
          interleaving: estInterleaving,
          insulationThickness_mm: next.insulationThickness_mm,
          estAirGap_mm: estGap,
        });
        return radialEst <= c.hw_mm * 0.92;
      }) ||
      nonPlanarCores.find((c) => c.Ap_cm4 >= Ap_req_cm4) ||
      nonPlanarCores[nonPlanarCores.length - 1];
    applyStr(
      'coreId',
      'Core Geometry',
      chosen.id,
      `Ap=${chosen.Ap_cm4} cm⁴ ≥ ${Ap_req_cm4.toFixed(2)} cm⁴ & fits hw=${chosen.hw_mm}mm window`
    );
  }
  let core = CORE_DATABASE.find((c) => c.id === next.coreId) || CORE_DATABASE[3];

  // 7. Secondary Rectifier Auto-Selection (if unlocked)
  const vSecPkEst =
    next.txType === 'center-tapped'
      ? (2 * next.Vin_max_V) / n
      : next.Vin_max_V / n;
  if (isCanEdit('secDeviceId')) {
    const wantDiode = next.rectMode === 'schottky-diode';
    const vSecReq = vSecPkEst * 1.42;
    const secCandidates = SEMICONDUCTOR_DATABASE.filter(
      (d) =>
        (d.role === 'secondary' || d.role === 'both') &&
        (wantDiode ? d.tech === 'SiC Schottky' : d.tech !== 'SiC Schottky') &&
        d.Vds_max_V >= vSecReq
    ).sort((a, b) => a.Rds_on_25C_mOhm - b.Rds_on_25C_mOhm);
    if (secCandidates.length > 0) {
      applyStr(
        'secDeviceId',
        'Secondary Rectifier',
        secCandidates[0].id,
        `Lowest Rds (${secCandidates[0].Rds_on_25C_mOhm} mΩ) rated ≥ ${Math.round(vSecReq)} V`
      );
    }
  }
  const secDevice =
    SEMICONDUCTOR_DATABASE.find((d) => d.id === next.secDeviceId) || SEMICONDUCTOR_DATABASE[14];

  // 8. Device Paralleling (nParallelPri, nParallelSec)
  if (isCanEdit('nParallelPri')) {
    const idMaxPri = priDevice.Id_max_A ?? 50;
    const nParPriOpt = clamp(Math.ceil((Ipri_est * 1.25) / (0.62 * idMaxPri)), 1, 4);
    applyNum('nParallelPri', 'Parallel Pri FETs', nParPriOpt, '×', 'Maintains <62% Id,max & safe Tj');
  }
  if (isCanEdit('nParallelSec')) {
    const idMaxSec = secDevice.Id_max_A ?? 80;
    const iSecPerLeg = Iout_phase * (next.txType === 'center-tapped' ? 0.72 : 0.78);
    const nParSecOpt = clamp(Math.ceil((iSecPerLeg * 1.15) / (0.60 * idMaxSec)), 1, 6);
    applyNum('nParallelSec', 'Parallel Sec FETs', nParSecOpt, '×', 'Shares secondary RMS current safely');
  }

  // 9. Leakage / Resonant Inductance (Llk_uH / Lr) & Resonant Capacitor (Cr_nF)
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

  // 10. Magnetizing Inductance Lm_uH
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

  // 11. Output Filter Inductor Lo_uH (PSFB) & Output Filter Capacitor Co_uF + ESR
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

  // 12. Primary & Secondary Transformer Turns (Np_turns, Ns_turns)
  const Ae_m2 = core.Ae_mm2 * 1e-6;
  const voltSecHalf = V_bridge * (Deff_est * Tsw * 0.5);
  if (isCanEdit('Np_turns') && isCanEdit('Ns_turns')) {
    const B_target_T = 0.55 * material.Bsat_100C_T;
    let nsOpt = Math.max(1, Math.round(voltSecHalf / (2 * B_target_T * Ae_m2 * n)));
    let npOpt = Math.max(2, Math.round(nsOpt * n));
    while (voltSecHalf / (2 * npOpt * Ae_m2) > 0.78 * material.Bsat_100C_T && npOpt < 200) {
      nsOpt += 1;
      npOpt = Math.max(2, Math.round(nsOpt * n));
    }
    applyNum(
      'Np_turns',
      'Np Turns',
      npOpt,
      'T',
      `Sized for ~55% ${material.id} B_sat (${(material.Bsat_100C_T * 1000).toFixed(0)} mT)`
    );
    applyNum('Ns_turns', 'Ns Turns', nsOpt, 'T', 'Matched integer turns to turns ratio n');
  } else if (isCanEdit('Np_turns')) {
    const npOpt = clamp(Math.round(next.Ns_turns * n), 2, 200);
    applyNum('Np_turns', 'Np Turns', npOpt, 'T', 'Matched Np = n · Ns_locked');
  } else if (isCanEdit('Ns_turns')) {
    const nsOpt = clamp(Math.round(next.Np_turns / n), 1, 100);
    applyNum('Ns_turns', 'Ns Turns', nsOpt, 'T', 'Matched Ns = Np_locked / n');
  }

  // 13. Litz Winding Build (litzStrandAWG, priStrands, secStrands)
  if (isCanEdit('litzStrandAWG')) {
    const awgOpt: 38 | 40 | 42 = next.fsw_kHz > 180 ? 42 : next.fsw_kHz > 100 ? 40 : 38;
    applyNum('litzStrandAWG', 'Litz AWG', awgOpt, 'AWG', `Skin-depth optimal at ${next.fsw_kHz} kHz`);
  }
  const strandArea = AWG_AREA_MM2[next.litzStrandAWG];
  const J_target_A_mm2 = 4.6;
  if (isCanEdit('priStrands')) {
    const reqAreaPri = Ipri_est / J_target_A_mm2;
    const rawPri = Math.max(20, Math.round(reqAreaPri / strandArea / 10) * 10);
    const maxWindowPri = Math.max(40, Math.floor((core.Aw_mm2 * 0.28) / (next.Np_turns * strandArea)));
    const priOpt = clamp(Math.min(rawPri, maxWindowPri), 20, 1200);
    applyNum('priStrands', 'Pri Strands', priOpt, '', `J ≈ ${J_target_A_mm2} A/mm² inside bobbin`);
  }
  if (isCanEdit('secStrands')) {
    const iSecRms = Iout_phase * (next.txType === 'center-tapped' ? 0.72 : 1.0);
    const reqAreaSec = iSecRms / J_target_A_mm2;
    const rawSec = Math.max(30, Math.round(reqAreaSec / strandArea / 10) * 10);
    const maxWindowSec = Math.max(60, Math.floor((core.Aw_mm2 * 0.32) / (Math.max(1, next.Ns_turns) * strandArea)));
    const secOpt = clamp(Math.min(rawSec, maxWindowSec), 30, 2000);
    applyNum('secStrands', 'Sec Strands', secOpt, '', `J ≈ ${J_target_A_mm2} A/mm² inside bobbin`);
  }
  if (isCanEdit('interleaving')) {
    const interleaveOpt = Pout >= 1500 || next.fsw_kHz >= 140 ? 'full-interleaved' : 'split-pri';
    applyStr('interleaving', 'Interleaving', interleaveOpt, 'Minimized Dowell proximity loss & MMF peak');
  }
  if (isCanEdit('insulationThickness_mm')) {
    const insOpt = next.Vin_max_V >= 450 ? 0.36 : next.Vin_max_V >= 200 ? 0.24 : 0.16;
    applyNum('insulationThickness_mm', 'Pri-Sec Tape', insOpt, 'mm', `IEC 62368-1 reinforced barrier for ${next.Vin_max_V}V`);
  }

  // Radial fit verification after final strand/interleaving selection
  const finalRadialEst = estimateTransformerRadialBuildMm({
    bw_mm: core.bw_mm,
    Ve_mm3: core.Ve_mm3,
    Vin_nom_V: next.Vin_nom_V,
    Np: next.Np_turns,
    Ns: next.Ns_turns,
    isCenterTapped: next.txType === 'center-tapped',
    priStrands: next.priStrands,
    secStrands: next.secStrands,
    litzAwg: next.litzStrandAWG,
    interleaving: next.interleaving,
    insulationThickness_mm: next.insulationThickness_mm,
    estAirGap_mm: isLLC ? 1.2 : 0.2,
  });
  if (finalRadialEst > core.hw_mm * 0.92 && isCanEdit('coreId')) {
    const largerFitCore = CORE_DATABASE
      .filter((c) => c.id !== 'elp64' && c.Ap_cm4 >= Ap_req_cm4)
      .sort((a, b) => a.hw_mm * a.Aw_mm2 - b.hw_mm * b.Aw_mm2)
      .find((c) => {
        const rTry = estimateTransformerRadialBuildMm({
          bw_mm: c.bw_mm,
          Ve_mm3: c.Ve_mm3,
          Vin_nom_V: next.Vin_nom_V,
          Np: next.Np_turns,
          Ns: next.Ns_turns,
          isCenterTapped: next.txType === 'center-tapped',
          priStrands: next.priStrands,
          secStrands: next.secStrands,
          litzAwg: next.litzStrandAWG,
          interleaving: next.interleaving,
          insulationThickness_mm: next.insulationThickness_mm,
          estAirGap_mm: isLLC ? 1.2 : 0.2,
        });
        return rTry <= c.hw_mm * 0.92;
      });
    if (largerFitCore) {
      core = largerFitCore;
      applyStr(
        'coreId',
        'Core Geometry',
        largerFitCore.id,
        `Stepped to ${largerFitCore.name} (hw=${largerFitCore.hw_mm}mm) to prevent radial window overflow`
      );
    }
  } else if (finalRadialEst > core.hw_mm * 0.94 && !isCanEdit('coreId') && isCanEdit('interleaving') && next.interleaving === 'full-interleaved') {
    applyStr(
      'interleaving',
      'Interleaving',
      'split-pri',
      `Relaxed to P/2-S-P/2 so winding fits locked ${core.name} window`
    );
  }

  // 14. Gate Drive & Dead-Time (Vgs_drive_V, Rg_ext_Ohm, deadTime_ns)
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

  // 15. Electro-Thermal Targets (Tj_max_limit_C, Rth_TIM_CW, Rth_heatsink_CW)
  if (isCanEdit('Tj_max_limit_C')) {
    const tjLimOpt = priDevice.tech === 'SiC MOSFET' ? 150 : 125;
    applyNum('Tj_max_limit_C', 'Tj Limit', tjLimOpt, '°C', `Safe SOA ceiling for ${priDevice.tech}`);
  }
  if (isCanEdit('Rth_TIM_CW')) {
    applyNum('Rth_TIM_CW', 'Rth,TIM', 0.12, '°C/W', 'Standard high-conductivity thermal pad');
  }
  if (isCanEdit('Rth_heatsink_CW')) {
    const tjLim = next.Tj_max_limit_C ?? (priDevice.tech === 'SiC MOSFET' ? 150 : 125);
    const tjTarget = Math.min(115, tjLim - 28);
    const rdsHot_Ohm = (priDevice.Rds_on_25C_mOhm * 1e-3 * 1.45) / Math.max(1, next.nParallelPri);
    const iPosRms = Ipri_est / Math.sqrt(2);
    const pCondPos = iPosRms * iPosRms * rdsHot_Ohm;
    const pSwPos =
      0.5 * Vin * Ipri_est * (priDevice.tf_ns * 1e-9) * fsw * (isLLC ? 0.25 : 0.45) +
      (priDevice.Qg_nC * 1e-9) * next.Vgs_drive_V * fsw;
    const pPosTotal = Math.max(1.5, pCondPos + pSwPos);
    const rthTim = next.Rth_TIM_CW ?? 0.12;
    const rthAvail = (tjTarget - next.Tamb_C) / pPosTotal - priDevice.Rth_JC_CW - rthTim;
    const rthOpt = clamp(Number(roundTo(rthAvail, 0.05).toFixed(2)), 0.12, 2.5);
    applyNum(
      'Rth_heatsink_CW',
      'Heatsink Rth',
      rthOpt,
      '°C/W',
      `Holds Tj ≤ ${tjTarget}°C at Tamb=${next.Tamb_C}°C`
    );
  }

  // 16. Control Loop & Current Sense Auto-Tuning
  if (isCanEdit('fc_target_kHz')) {
    const fcOpt = clamp(
      Number((isLLC ? Math.min(next.fsw_kHz / 12, 12) : Math.min(next.fsw_kHz / 10, 15)).toFixed(1)),
      1.5,
      25
    );
    applyNum('fc_target_kHz', 'fc', fcOpt, 'kHz', 'Bounded ≤ f_sw/10 for Nyquist phase margin');
  }
  if (isCanEdit('pm_target_deg')) {
    applyNum('pm_target_deg', 'PM', 58, '°', 'Optimal damping target (58° phase margin)');
  }
  if (isCanEdit('slopeFactor_mc')) {
    applyNum('slopeFactor_mc', 'Slope mc', 1.8, '', 'Subharmonic-free slope compensation (Qp < 0.7)');
  }
  if (isCanEdit('Rsense_mOhm')) {
    const rsOpt = clamp(Math.round((2100 / Math.max(4, Ipri_est * 1.4)) / 5) * 5, 5, 100);
    applyNum('Rsense_mOhm', 'Rsense', rsOpt, 'mΩ', 'Scaled for full 3.3V ADC dynamic range');
  }
  if (isCanEdit('fs_digital_kHz')) {
    const fsDigOpt = clamp(roundTo(Math.min(400, next.fsw_kHz * 2), 10), 50, 500);
    applyNum('fs_digital_kHz', 'fs Digital', fsDigOpt, 'kHz', 'Double-update PWM/ADC sampling');
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
