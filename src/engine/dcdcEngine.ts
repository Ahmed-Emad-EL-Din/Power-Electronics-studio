import {
  CORE_DATABASE,
  MATERIAL_DATABASE,
  SEMICONDUCTOR_DATABASE,
  DcDcDesignState,
  CoreSpec,
  CoreMaterialSpec,
  SemiconductorSpec,
} from '../data/databases';

export interface BodePoint {
  freq_Hz: number;
  plantMag_dB: number;
  plantPhase_deg: number;
  compMag_dB: number;
  compPhase_deg: number;
  loopMag_dB: number;
  loopPhase_deg: number;
  loopMagMin_dB: number;
  loopMagMax_dB: number;
  loopPhaseMin_deg: number;
  loopPhaseMax_deg: number;
}

export interface SweepPoint {
  x: number;
  y1: number;
  y2: number;
  y3?: number;
}

export interface WaveformPoint {
  t_us: number;
  v_pri_V: number;
  i_pri_A: number;
  v_sec_V: number;
  i_lo_A: number;
}

export interface DeviceBenchmarkRow {
  id: string;
  name: string;
  tech: string;
  lcscPartNumber?: string;
  jlcpcbClass?: string;
  unitPrice_USD?: number;
  fom_hard_mOhm_nC: number;
  fom_zvs_mOhm_nF: number;
  fom_qrr_mOhm_nC: number;
  Ppri_total_W: number;
  Tj_est_C: number;
  isGroundedCustom: boolean;
}

export interface BhMajorPoint {
  H_Am: number;
  Im_A: number;
  B_anh_100C_mT: number;
  B_anh_25C_mT: number;
  B_major_up_100C_mT: number;
  B_major_down_100C_mT: number;
  B_linear_mT: number;
}

export interface BhMinorLoopPoint {
  phase_deg: number;
  H_Am: number;
  Im_A: number;
  B_mT: number;
}

export interface BhLoopAnalysis {
  Bsat_100C_mT: number;
  Bsat_25C_mT: number;
  Bpk_mT: number;
  deltaB_mT: number;
  Bmax_mT: number;
  Bmin_mT: number;
  fluxHeadroom_100C_mT: number;
  fluxUtilization_100C_pct: number;
  fluxUtilization_25C_pct: number;
  H_pk_Am: number;
  H_char_100C_Am: number;
  H_sat_80pct_Am: number;
  H_sat_90pct_Am: number;
  Hc_eff_Am: number;
  Hc_major_Am: number;
  Br_eff_mT: number;
  Br_major_mT: number;
  energyPerCycle_mJ: number;
  volumetricEnergy_J_m3: number;
  Np_opt_55pct: number;
  majorCurve: BhMajorPoint[];
  minorLoop: BhMinorLoopPoint[];
}

export interface CoreMaterialBenchmarkRow {
  id: string;
  name: string;
  k_si: number;
  alpha: number;
  beta: number;
  ki_igse: number;
  Bsat_100C_mT: number;
  T_opt_C: number;
  tempCoeff_c2: number;
  Pv_igse_kW_m3: number;
  Pv_se_kW_m3: number;
  Pcore_igse_W: number;
  Pcore_se_W: number;
  deltaT_fe_C: number;
  Tcore_eq_C: number;
  fluxMargin_pct: number;
}

export interface SaturationCheckResult {
  status: 'critical' | 'warning' | 'ok';
  exceedsDatasheetLimit: boolean;
  exceedsActiveTempLimit: boolean;
  exceedsRoomTempLimit: boolean;
  isNearKnee: boolean;
  Bpk_mT: number;
  Bsat_100C_mT: number;
  Bsat_25C_mT: number;
  Bsat_at_Tcore_mT: number;
  Tcore_C: number;
  excess_100C_mT: number;
  excess_100C_pct: number;
  utilization_100C_pct: number;
  utilization_Tcore_pct: number;
  recommendedMinNp_turns: number;
  recommendedSafeNp_turns: number;
  recommendedCoreId: string | null;
  recommendedCoreName: string | null;
  recommendedMaterialId: string | null;
  headline: string;
  detail: string;
}

export interface SteinmetzCoreThermalAnalysis {
  customSteinmetzEnabled: boolean;
  k_eff: number;
  alpha_eff: number;
  beta_eff: number;
  ki_eff: number;
  T_opt_eff_C: number;
  c2_eff: number;
  tempFactor_F: number;
  Pv_se_kW_m3: number;
  Pv_igse_kW_m3: number;
  Pcore_se_W: number;
  Pcore_igse_W: number;
  Pcu_W: number;
  Pmag_total_W: number;
  deltaT_fe_C: number;
  deltaT_cu_C: number;
  deltaT_total_C: number;
  Tcore_surface_C: number;
  Tcore_hotspot_C: number;
  coreThermalLoopGain: number;
  coreThermalStable: boolean;
  Bpk_opt_loss_mT: number;
  Np_opt_loss: number;
  freqSweep: SweepPoint[];
  fluxSweep: SweepPoint[];
  tempEquilibriumSweep: SweepPoint[];
  materialBenchmarks: CoreMaterialBenchmarkRow[];
}

export interface DcDcResults {
  state: DcDcDesignState;
  core: CoreSpec;
  material: CoreMaterialSpec;
  priDevice: SemiconductorSpec;
  secDevice: SemiconductorSpec;
  nPhases: number;
  isLLC: boolean;

  // Operating & Duty / Gain Metrics
  Iout_total_A: number;
  Iout_phase_A: number;
  Deff_nom: number;
  Dloss_nom: number;
  D_applied_nom: number;
  Deff_max: number;
  Dloss_max: number;
  D_applied_max: number;
  phaseShift_deg: number;
  M_gain_nom: number;
  fr_kHz: number;
  fm_kHz: number;
  fn_nom: number;
  Q_factor: number;
  Ln_ratio: number;

  // ZVS & Tank Metrics (Leading vs Lagging Leg Separation + Load Boundary Tricks)
  E_oss_lag_uJ: number;
  E_lk_avail_uJ: number;
  E_lead_avail_uJ: number;
  zvsEnergyRatio_pct: number;
  I_zvs_min_A: number;
  I_lag_turnoff_A: number;
  I_lead_turnoff_A: number;
  zvsAchieved: boolean;
  zvsLeadAchieved: boolean;
  Vds_res_lag_V: number;
  t_dead_min_ns: number;
  t_dead_opt_ns: number;
  P_min_zvs_pct: number;
  Llk_crit_fullLoad_uH: number;
  Llk_crit_halfLoad_uH: number;
  Llk_opt_35pct_uH: number;
  Llk_max_duty_uH: number;

  // Secondary Rectifier, Ringing & Clamp Stress
  Vsec_ideal_pk_V: number;
  Vsec_ideal_max_V: number;
  Vsec_ringing_delta_V: number;
  Vsec_overshoot_V: number;
  Vsec_unclamped_pk_V: number;
  f_ring_MHz: number;
  Z0_ring_Ohm: number;
  Isec_rms_per_dev_A: number;
  Vf_rect_drop_V: number;
  Cclamp_nF: number;
  Rsnub_Ohm: number;
  Csnub_pF: number;
  Psnub_W: number;

  // Output Filter & Interleaving
  fRipple_out_kHz: number;
  deltaILo_phase_A: number;
  deltaIout_net_A: number;
  rippleCancel_K: number;
  Vout_ripple_mVpp: number;
  ICo_rms_A: number;

  // Magnetics (iGSE + 1D Dowell + Core Saturation B-Im Analysis)
  Np_actual: number;
  Ns_actual: number;
  Bpk_mT: number;
  fluxMargin_pct: number;
  Im_pk_A: number;
  H_pk_Am: number;
  mu_e_actual: number;
  airGap_mm: number;
  Isat_80pct_A: number;
  Isat_90pct_A: number;
  Lm_at_Im_pk_uH: number;
  voltSec_applied_Vus: number;
  voltSec_max_Vus: number;
  skinDepth_mm: number;
  Fr_dowell_pri: number;
  Fr_dowell_sec: number;
  Cww_pF: number;
  Rpri_ac_mOhm: number;
  Rsec_ac_mOhm: number;
  windowFill_pct: number;
  Llk_geom_uH: number;
  ki_igse: number;
  Pcore_se_W: number;
  Pcore_igse_W: number;

  // Electro-Thermal MOSFET / SiC / GaN Detailed Breakdown & Thermal Equilibrium
  Rg_ext_Ohm: number;
  Rg_int_pri_Ohm: number;
  kelvinSourceActive: boolean;
  Ls_common_nH: number;
  Psw_kelvin_saved_W: number;
  Rds_pri_actual_mOhm: number;
  Rds_sec_actual_mOhm: number;
  Pcond_pri_W: number;
  Pcond_pri_125C_W: number;
  Psw_on_pri_W: number;
  Psw_off_pri_W: number;
  Poss_hyst_pri_W: number;
  Pdt_body_pri_W: number;
  Prr_pri_W: number;
  Pgate_pri_W: number;
  Pgate_ext_pri_W: number;
  Pgate_int_pri_W: number;
  Ig_pk_pri_A: number;
  Psw_pri_W: number;

  Pcond_sec_ch_W: number;
  Pdt_body_sec_W: number;
  Prr_sec_W: number;
  Pgate_sec_W: number;
  Pcond_sec_W: number;
  Qrr_pri_hot_nC: number;
  Qrr_sec_hot_nC: number;

  Pcore_W: number;
  Pcu_W: number;
  Ptotal_loss_W: number;
  efficiency_pct: number;
  Tj_pri_C: number;
  Tj_sec_C: number;
  Tcase_pri_C: number;
  Tsink_pri_C: number;
  Tcase_sec_C: number;
  Tsink_sec_C: number;
  Rth_TIM_CW: number;
  Rth_TIM_sec_CW: number;
  Tj_max_limit_C: number;
  Pcond_pri_25C_W: number;
  Psw_pri_25C_W: number;
  Pcond_sec_25C_W: number;
  Pout_derated_max_W: number;
  Id_pri_derated_max_A: number;
  Rth_hs_crit_CW: number;
  Tcore_C: number;
  thermalLoopGain: number;
  thermalStable: boolean;
  deviceBenchmarks: DeviceBenchmarkRow[];

  // Control Loop, Worst-Case Corners & Middlebrook EMI Stability
  Rd_damping_Ohm: number;
  Sf_downslope_V_us: number;
  Se_ramp_V_us: number;
  mc_slope: number;
  Qp_subharmonic: number;
  slopeStable: boolean;
  Qp_subharmonic_wc: number;
  slopeStable_wc: boolean;
  mc_min_recommended: number;
  isTwoZeroComp: boolean;
  f0_lc_kHz: number;
  f0_wc_min_kHz: number;
  f0_wc_max_kHz: number;
  f_esr_kHz: number;
  fc_actual_kHz: number;
  fc_wc_min_kHz: number;
  fc_wc_max_kHz: number;
  pm_actual_deg: number;
  pm_wc_min_deg: number;
  pm_wc_max_deg: number;
  f_gm_kHz: number;
  gm_actual_dB: number;
  fz1_kHz: number;
  fz2_kHz: number;
  fp1_kHz: number;
  fp2_kHz: number;
  Kp_ctrl: number;
  Ki_ctrl: number;
  b0: number;
  b1: number;
  b2: number;
  b3: number;
  a1: number;
  a2: number;
  a3: number;
  R1_kOhm: number;
  R2_kOhm: number;
  R3_kOhm: number;
  C1_nF: number;
  C2_pF: number;
  C3_nF: number;
  Q_charge_nC: number;
  Vth_charge_V: number;
  L_emi_uH: number;
  C_emi_uF: number;
  Rd_emi_Ohm: number;
  Zin_neg_dBOhm: number;
  Zout_emi_pk_dBOhm: number;
  middlebrookMargin_dB: number;
  middlebrookStable: boolean;
  dspCode: string;

  // Interactive Curves
  primarySweep: SweepPoint[];
  efficiencySweep: SweepPoint[];
  bodeData: BodePoint[];
  slopeSweep: SweepPoint[];
  igseSweep: SweepPoint[];
  dowellSweep: SweepPoint[];
  ringingSweep: SweepPoint[];
  middlebrookSweep: SweepPoint[];
  electroThermalCurve: SweepPoint[]; // Tj vs Heat Generated P_gen(Tj) & Heatsink Capacity P_sink(Tj)
  gateLossSweep: SweepPoint[];       // Rg_ext vs Switching+Qrr Loss & Peak Gate Current Ig,pk
  zvsLoadSweep: SweepPoint[];        // Load % vs ZVS Energy Ratio % & Residual Vds,res (V)
  saturationCurve: {
    Im_A: number;
    H_Am: number;
    B_100C_mT: number;
    B_25C_mT: number;
    B_linear_mT: number;
    Lm_inc_uH: number;
  }[];
  bhLoopAnalysis: BhLoopAnalysis;
  coreThermalAnalysis: SteinmetzCoreThermalAnalysis;
  saturationCheck: SaturationCheckResult;
  waveforms: WaveformPoint[];

  // Live Analytical Domain Evaluators for Dynamic Zoom-Out / Pan on All Graphs
  evaluators: {
    evalPrimarySweep: (x: number) => { y1: number; y2: number };
    evalEfficiency: (loadPct: number) => { y1: number; y2: number };
    evalSaturationB: (im_A: number) => { y1: number; y2: number };
    evalSaturationLm: (im_A: number) => { y1: number; y2: number };
    evalWaveforms: (t_us: number) => { y1: number; y2: number };
    evalSlope: (d: number) => { y1: number; y2: number };
    evalIgse: (d: number) => { y1: number; y2: number };
    evalDowell: (f_kHz: number) => { y1: number; y2: number };
    evalRinging: (t_ns: number) => { y1: number; y2: number };
    evalMiddlebrook: (f_Hz: number) => { y1: number; y2: number };
    evalElectroThermal: (tj_C: number) => { y1: number; y2: number };
    evalGateLoss: (rg_Ohm: number) => { y1: number; y2: number };
    evalZvsLoad: (loadPct: number) => { y1: number; y2: number };
    evalBodePoint: (f_Hz: number) => BodePoint;
    evalCoreLossFreq: (f_kHz: number) => { y1: number; y2: number };
    evalCoreLossFlux: (bpk_mT: number) => { y1: number; y2: number };
    evalCoreTempEquilibrium: (tCore_C: number) => { y1: number; y2: number };
  };

  warnings: { severity: 'error' | 'warn' | 'ok'; text: string }[];
}

const MU_0 = 4 * Math.PI * 1e-7;
const EPS_0 = 8.854e-12;
const RHO_CU_100C = 2.28e-8;

const AWG_DIAM_MM: Record<number, number> = {
  38: 0.1016,
  40: 0.0787,
  42: 0.0635,
};

function calcHyperbolicDowell(delta: number, mLayers: number): number {
  const d = Math.max(0.02, Math.min(delta, 8.0));
  const m = Math.max(1, mLayers);
  const sinh2d = Math.sinh(2 * d);
  const cosh2d = Math.cosh(2 * d);
  const sin2d = Math.sin(2 * d);
  const cos2d = Math.cos(2 * d);
  const sinhd = Math.sinh(d);
  const coshd = Math.cosh(d);
  const sind = Math.sin(d);
  const cosd = Math.cos(d);

  const skinTerm = (sinh2d + sin2d) / Math.max(cosh2d - cos2d, 1e-9);
  const proxTerm = ((2 * (m * m - 1)) / 3) * ((sinhd - sind) / Math.max(coshd + cosd, 1e-9));
  return Math.max(1.0, d * (skinTerm + proxTerm));
}

const MATERIAL_CURIE_C: Record<string, number> = {
  N97: 230,
  N87: 210,
  N95: 215,
  '3C95': 215,
  '3C97': 220,
  PC95: 215,
};

function calcBsatAtTemp_mT(materialId: string, Bsat_100C_T: number, temp_C: number): number {
  const Tc = MATERIAL_CURIE_C[materialId] || 220;
  const T_clamped = Math.max(-40, Math.min(Tc - 2, temp_C));
  const Bsat_100_mT = Bsat_100C_T * 1000;
  const ratio25 = (Tc - 25) / (Tc - 100);
  const gamma = Math.log(1.24) / Math.log(ratio25);
  return Bsat_100_mT * Math.pow(Math.max(0.01, (Tc - T_clamped) / (Tc - 100)), gamma);
}

/**
 * Keeps integer transformer turns (Np_turns, Ns_turns) and turnsRatio_n strictly
 * synchronized across manual edits, 1-click fixes, and AI patches.
 */
export function syncDcdcTurnsRatioState(
  patch: Partial<DcDcDesignState>,
  candidate: DcDcDesignState,
  changedKey: keyof DcDcDesignState | null,
  locks?: { Np_turns?: boolean; Ns_turns?: boolean }
): DcDcDesignState {
  const next = { ...candidate };
  const touchedNpNs =
    changedKey === 'Np_turns' ||
    changedKey === 'Ns_turns' ||
    patch.Np_turns !== undefined ||
    patch.Ns_turns !== undefined;
  const touchedRatio =
    changedKey === 'turnsRatio_n' ||
    (patch.turnsRatio_n !== undefined && !touchedNpNs);

  if (touchedRatio && patch.Np_turns === undefined && patch.Ns_turns === undefined) {
    const nTarget = Math.max(0.2, Math.min(25, next.turnsRatio_n));
    if (locks?.Np_turns && !locks?.Ns_turns) {
      const npFixed = Math.max(1, Math.round(next.Np_turns));
      const nsMatched = Math.max(1, Math.round(npFixed / nTarget));
      next.Np_turns = npFixed;
      next.Ns_turns = nsMatched;
      next.turnsRatio_n = Number((npFixed / nsMatched).toFixed(4));
    } else if (locks?.Ns_turns && !locks?.Np_turns) {
      const nsFixed = Math.max(1, Math.round(next.Ns_turns));
      const npMatched = Math.max(2, Math.round(nsFixed * nTarget));
      next.Np_turns = npMatched;
      next.Ns_turns = nsFixed;
      next.turnsRatio_n = Number((npMatched / nsFixed).toFixed(4));
    } else {
      const nsBase = Math.max(1, Math.round(next.Ns_turns));
      const npBase = Math.max(2, Math.round(nsBase * nTarget));
      let bestNp = npBase;
      let bestNs = nsBase;
      let bestErr = Math.abs(npBase / nsBase - nTarget);
      if (bestErr > 0.015) {
        const minNs = Math.max(1, nsBase - 2);
        const maxNs = Math.min(24, nsBase + 6);
        for (let nsTry = minNs; nsTry <= maxNs; nsTry++) {
          const npTry = Math.max(2, Math.round(nsTry * nTarget));
          const err = Math.abs(npTry / nsTry - nTarget) + Math.abs(nsTry - nsBase) * 0.002;
          if (err < bestErr) {
            bestErr = err;
            bestNp = npTry;
            bestNs = nsTry;
          }
        }
      }
      next.Np_turns = bestNp;
      next.Ns_turns = bestNs;
      next.turnsRatio_n = Number((bestNp / bestNs).toFixed(4));
    }
    return next;
  }

  const npActual = Math.max(1, Math.round(next.Np_turns));
  const nsActual = Math.max(1, Math.round(next.Ns_turns));
  next.Np_turns = npActual;
  next.Ns_turns = nsActual;
  next.turnsRatio_n = Number((npActual / nsActual).toFixed(4));
  return next;
}

export function solveDcDcDesign(state: DcDcDesignState): DcDcResults {
  const core = CORE_DATABASE.find((c) => c.id === state.coreId) || CORE_DATABASE[3];
  const material = MATERIAL_DATABASE.find((m) => m.id === state.materialId) || MATERIAL_DATABASE[0];
  const priDevice = SEMICONDUCTOR_DATABASE.find((d) => d.id === state.priDeviceId) || SEMICONDUCTOR_DATABASE[0];
  const secDevice = SEMICONDUCTOR_DATABASE.find((d) => d.id === state.secDeviceId) || SEMICONDUCTOR_DATABASE[5];

  const isLLC = state.topology === 'llc-fb' || state.topology === 'llc-hb';
  const isHalfBridge = state.topology === 'llc-hb';
  const nPhases = state.topology === 'psfb-2ph' ? 2 : 1;

  const fsw = state.fsw_kHz * 1e3;
  const Tsw = 1 / fsw;
  const Vin = state.Vin_nom_V;
  const Vout = state.Vout_V;
  const Pout = state.Pout_W;
  const Iout_total_A = Pout / Math.max(Vout, 1);
  const Iout_phase_A = Iout_total_A / nPhases;

  // Derive physical transformer turns ratio strictly from actual integer winding turns
  const Np_actual = Math.max(1, Math.round(state.Np_turns));
  const Ns_actual = Math.max(1, Math.round(state.Ns_turns));
  const n = Math.max(Np_actual / Ns_actual, 0.2);
  const Llk = Math.max(state.Llk_uH * 1e-6, 0.1e-6);
  const Lm = Math.max(state.Lm_uH * 1e-6, 5e-6);
  const Cr = Math.max(state.Cr_nF * 1e-9, 1e-9);
  const Lo = Math.max(state.Lo_uH * 1e-6, 0.5e-6);
  const Co = Math.max(state.Co_uF * 1e-6, 10e-6);
  const Rg_ext_Ohm = Math.max(0.2, state.Rg_ext_Ohm ?? 4.7);

  // Secondary rectifier current reflection factor
  const isCDR = state.txType === 'current-doubler';
  const isCT = state.txType === 'center-tapped';
  const k_refl = isCDR ? 1 / (2 * n) : 1 / n;

  // Resonant parameters (used for LLC or parasitic ringing for PSFB)
  const fr_Hz = 1 / (2 * Math.PI * Math.sqrt(Llk * Cr));
  const fm_Hz = 1 / (2 * Math.PI * Math.sqrt((Llk + Lm) * Cr));
  const fr_kHz = fr_Hz / 1e3;
  const fm_kHz = fm_Hz / 1e3;
  const fn_nom = fsw / fr_Hz;
  const Ln_ratio = Lm / Llk;
  const Rac = (8 / (Math.PI * Math.PI)) * n * n * (Vout / Math.max(Iout_phase_A, 0.1));
  const Q_factor = Math.sqrt(Llk / Cr) / Math.max(Rac, 0.1);

  // Effective duty cycle, duty loss, worst-case low-line envelope, or LLC FHA Voltage Gain
  let Deff_nom = 0.72;
  let Dloss_nom = 0.06;
  let D_applied_nom = 0.78;
  let Deff_max = 0.72;
  let Dloss_max = 0.06;
  let D_applied_max = 0.78;
  let M_gain_nom = 1.0;

  if (!isLLC) {
    Deff_nom = Math.min(0.94, isCDR ? (2 * n * Vout) / Vin : (n * Vout) / Vin);
    const V_lo_on = Vin / n - (isCDR ? Vout / 2 : Vout);
    const dt_on = (Deff_nom * Tsw) / 2;
    const dILo_est = Math.max(0.5, (Math.max(V_lo_on, 2) * dt_on) / Lo);
    const I_lo_valley = Math.max(0.2, Iout_phase_A - dILo_est / 2);
    const Ipri_valley = I_lo_valley * k_refl;
    Dloss_nom = Math.min(0.32, (4 * fsw * Llk * Ipri_valley) / Math.max(Vin, 10));
    D_applied_nom = Math.min(0.98, Deff_nom + Dloss_nom);
    M_gain_nom = Deff_nom;

    const Vin_min_safe = Math.max(10, Math.min(state.Vin_min_V, Vin));
    Deff_max = Math.min(0.96, isCDR ? (2 * n * Vout) / Vin_min_safe : (n * Vout) / Vin_min_safe);
    const V_lo_on_min = Vin_min_safe / n - (isCDR ? Vout / 2 : Vout);
    const dt_on_min = (Deff_max * Tsw) / 2;
    const dILo_est_min = Math.max(0.5, (Math.max(V_lo_on_min, 2) * dt_on_min) / Lo);
    const I_lo_valley_min = Math.max(0.2, Iout_phase_A - dILo_est_min / 2);
    const Ipri_valley_min = I_lo_valley_min * k_refl;
    Dloss_max = Math.min(0.36, (4 * fsw * Llk * Ipri_valley_min) / Vin_min_safe);
    D_applied_max = Math.min(0.99, Deff_max + Dloss_max);
  } else {
    const fn2 = fn_nom * fn_nom;
    const realPart = 1 + (1 / Ln_ratio) * (1 - 1 / Math.max(fn2, 0.05));
    const imagPart = Q_factor * (fn_nom - 1 / Math.max(fn_nom, 0.05));
    M_gain_nom = 1 / Math.sqrt(realPart * realPart + imagPart * imagPart);
    Deff_nom = Math.min(0.96, 1 - (2 * state.deadTime_ns * 1e-9) / Tsw);
    Dloss_nom = (2 * state.deadTime_ns * 1e-9) / Tsw;
    D_applied_nom = Deff_nom;
    Deff_max = Deff_nom;
    Dloss_max = Dloss_nom;
    D_applied_max = D_applied_nom;
  }

  const phaseShift_deg = D_applied_nom * 180;

  // Output Inductor Ripple & Interleaved Cancellation
  const fRipple_out_kHz = 2 * state.fsw_kHz * nPhases;
  const V_lo_applied = Math.max(2, Vin / (isHalfBridge ? 2 * n : n) - (isCDR ? Vout / 2 : Vout));
  const deltaILo_phase_A = isLLC
    ? Iout_phase_A * 0.18
    : (V_lo_applied * (Deff_nom * Tsw * 0.5)) / Lo;

  let rippleCancel_K = 1.0;
  if (nPhases === 2) {
    const d_mod = Deff_nom % 0.5;
    rippleCancel_K =
      Deff_nom >= 0.99 ? 0.05 : (d_mod * (0.5 - d_mod)) / Math.max(0.05, Deff_nom * (1 - Deff_nom));
    rippleCancel_K = Math.max(0.04, Math.min(1.0, rippleCancel_K));
  }
  const deltaIout_net_A = deltaILo_phase_A * nPhases * rippleCancel_K;
  const ICo_rms_A = deltaIout_net_A / (2 * Math.sqrt(3));
  const fRipple_Hz = fRipple_out_kHz * 1e3;
  const Vout_ripple_mVpp =
    (deltaIout_net_A * (state.ESR_Co_mOhm * 1e-3) + deltaIout_net_A / (8 * fRipple_Hz * Co)) * 1e3;

  // ============================================================================
  // FIX 1: SEPARATE LEADING-LEG vs LAGGING-LEG ZVS ENERGY & RESIDUAL Vds
  // ============================================================================
  const Coss_eff_F = priDevice.Coss_er_pF * 1e-12 * state.nParallelPri;
  const Ctr_F = state.Ctr_par_pF * 1e-12;
  const C_node_F = 2 * Coss_eff_F + Ctr_F;
  const V_bridge = isHalfBridge ? Vin / 2 : Vin;
  const E_oss_lag_uJ = 0.5 * C_node_F * V_bridge * V_bridge * 1e6;

  const Im_pk_A = (V_bridge * Deff_nom * Tsw) / (4 * Lm);
  const I_lead_turnoff_A = isLLC
    ? Math.max(Im_pk_A, Iout_phase_A * k_refl * 0.45)
    : Math.max(0.4, (Iout_phase_A + deltaILo_phase_A / 2) * k_refl + Im_pk_A);
  const I_lag_turnoff_A = isLLC
    ? Math.max(Im_pk_A, Iout_phase_A * k_refl * 0.42)
    : Math.max(0.2, (Iout_phase_A - deltaILo_phase_A / 2) * k_refl + Im_pk_A * 0.5);

  // Leading leg commutates with reflected output filter inductance (Llk + n^2 * Lo)
  const L_lead_eff_H = isLLC ? Llk : Llk + (Lo / (k_refl * k_refl)) * 0.35;
  const E_lead_avail_uJ = 0.5 * L_lead_eff_H * I_lead_turnoff_A * I_lead_turnoff_A * 1e6;
  const zvsLeadAchieved = E_lead_avail_uJ >= E_oss_lag_uJ;

  // Lagging leg commutates with Llk only during freewheeling transition
  const E_lk_avail_uJ = 0.5 * Llk * I_lag_turnoff_A * I_lag_turnoff_A * 1e6;
  const zvsEnergyRatio_pct = (E_lk_avail_uJ / Math.max(E_oss_lag_uJ, 0.01)) * 100;
  const I_zvs_min_A = Math.sqrt((2 * E_oss_lag_uJ * 1e-6) / Llk);
  const zvsAchieved = E_lk_avail_uJ >= E_oss_lag_uJ;
  const Vds_res_lag_V = zvsAchieved
    ? 0
    : Math.sqrt(Math.max(0, V_bridge * V_bridge - (Llk * I_lag_turnoff_A * I_lag_turnoff_A) / C_node_F));
  const t_dead_min_ns = (Math.PI / 2) * Math.sqrt(Llk * C_node_F) * 1e9;
  const Coss_tr_node_F = 2 * (priDevice.Coss_tr_pF * 1e-12 * state.nParallelPri) + Ctr_F;
  const t_dead_opt_ns = Math.round(Math.max(45, (Math.PI / 2) * Math.sqrt(Llk * Coss_tr_node_F) * 1e9));

  // Minimum load percentage where lagging-leg ZVS is achieved (100% energy ratio)
  const P_min_zvs_pct = isLLC
    ? Math.max(5, Math.min(100, (I_zvs_min_A / Math.max(Im_pk_A, 0.2)) * 18))
    : Math.max(
        5,
        Math.min(
          120,
          ((I_zvs_min_A - Im_pk_A * 0.5) / Math.max(0.2, Iout_phase_A * k_refl)) * 100
        )
      );

  const I_lag_half = Math.max(0.4, 0.5 * I_lag_turnoff_A);
  const I_lag_35pct = Math.max(0.35, 0.35 * I_lag_turnoff_A + Im_pk_A * 0.35);
  const Llk_crit_fullLoad_uH = ((2 * E_oss_lag_uJ * 1e-6) / (I_lag_turnoff_A * I_lag_turnoff_A)) * 1e6;
  const Llk_crit_halfLoad_uH = ((2 * E_oss_lag_uJ * 1e-6) / (I_lag_half * I_lag_half)) * 1e6;
  const D_max_margin = Math.max(0.03, 0.93 - Deff_nom);
  const Llk_max_duty_uH = ((D_max_margin * V_bridge) / (4 * fsw * Math.max(I_lag_turnoff_A, 0.5))) * 1e6;
  const Llk_raw_35pct_uH = ((2 * E_oss_lag_uJ * 1e-6) / (I_lag_35pct * I_lag_35pct)) * 1e6;
  const Llk_opt_35pct_uH = Number(
    Math.max(Llk_crit_fullLoad_uH * 1.15, Math.min(Llk_max_duty_uH * 0.92, Llk_raw_35pct_uH)).toFixed(1)
  );

  // Load-Dependent ZVS Commutation Boundary Sweep (5% to 120% Load)
  const evalZvsLoad = (loadPct: number) => {
    const ratio = Math.max(0.02, loadPct / 100);
    const iLagAtLoad = isLLC
      ? Math.max(Im_pk_A, Iout_phase_A * ratio * k_refl * 0.42)
      : Math.max(0.15, (Iout_phase_A * ratio - deltaILo_phase_A * 0.35) * k_refl + Im_pk_A * 0.5);
    const eAvail_uJ = 0.5 * Llk * iLagAtLoad * iLagAtLoad * 1e6;
    const zvsPct = Math.min(350, (eAvail_uJ / Math.max(E_oss_lag_uJ, 0.01)) * 100);
    const vRes =
      eAvail_uJ >= E_oss_lag_uJ
        ? 0
        : Math.sqrt(Math.max(0, V_bridge * V_bridge - (Llk * iLagAtLoad * iLagAtLoad) / C_node_F));
    return {
      y1: Number(zvsPct.toFixed(1)),
      y2: Number(vRes.toFixed(1)),
    };
  };

  const zvsLoadSweep: SweepPoint[] = [];
  for (let lp = 5; lp <= 120; lp += 5) {
    const pt = evalZvsLoad(lp);
    zvsLoadSweep.push({ x: lp, y1: pt.y1, y2: pt.y2 });
  }

  // ============================================================================
  // SECONDARY PARASITIC RINGING & SNUBBER / CLAMP SYNTHESIZER
  // ============================================================================
  const V_bridge_max = isHalfBridge ? state.Vin_max_V * 0.5 : state.Vin_max_V;
  const Vsec_ideal_pk_V = isCT ? (2 * V_bridge) / n : V_bridge / n;
  const Vsec_ideal_max_V = isCT ? (2 * V_bridge_max) / n : V_bridge_max / n;
  const Coss_sec_F = secDevice.Coss_er_pF * 1e-12 * state.nParallelSec;
  const Llk_sec_H = Llk / (n * n);
  const f_ring_Hz = 1 / (2 * Math.PI * Math.sqrt(Math.max(Llk_sec_H * Coss_sec_F, 1e-18)));
  const f_ring_MHz = f_ring_Hz / 1e6;
  const Z0_ring_Ohm = Math.sqrt(Llk_sec_H / Math.max(Coss_sec_F, 50e-12));

  const Vsec_unclamped_pk_V = Vsec_ideal_max_V * 1.88;
  const Vsec_ringing_delta_V = Vsec_unclamped_pk_V - Vsec_ideal_max_V;
  const clampFactor =
    state.clampVariant === 'active-clamp' ? 1.14 : state.clampVariant === 'pri-diode-clamp' ? 1.24 : 1.44;
  const Vsec_overshoot_V = isLLC ? Vsec_ideal_max_V * 1.08 : Vsec_ideal_max_V * clampFactor;

  const nSecDevices = state.txType === 'full-bridge' ? 4 : 2;
  const Isec_rms_total_A = isCDR
    ? Iout_phase_A * 0.72
    : Iout_phase_A * Math.sqrt(Math.max(0.35, Deff_nom));
  const Isec_rms_per_dev_A = Isec_rms_total_A / Math.sqrt(nSecDevices / 2);

  const Cclamp_nF = ((I_lag_turnoff_A * Dloss_nom * Tsw) / Math.max(0.1 * Vsec_ideal_pk_V, 2)) * 1e9;
  const Rsnub_Ohm = Z0_ring_Ohm;
  const Csnub_pF = Coss_sec_F * 2.5 * 1e12;
  const Psnub_W = isLLC
    ? 1.2
    : state.clampVariant === 'active-clamp'
    ? 0.25 * fsw * (Csnub_pF * 1e-12) * Vsec_overshoot_V * Vsec_overshoot_V * nPhases
    : state.clampVariant === 'pri-diode-clamp'
    ? 0.45 * fsw * (Csnub_pF * 1e-12) * Vsec_overshoot_V * Vsec_overshoot_V * nPhases
    : 1.15 * fsw * (Csnub_pF * 1e-12) * Vsec_overshoot_V * Vsec_overshoot_V * nPhases;

  const w_ring = 2 * Math.PI * f_ring_Hz;
  const zeta_unclamped = 0.06;
  const zeta_snubbed =
    state.clampVariant === 'active-clamp' ? 0.68 : state.clampVariant === 'pri-diode-clamp' ? 0.52 : 0.34;
  const evalRinging = (t_ns: number) => {
    const t_s = Math.max(0, t_ns) * 1e-9;
    const env_unclamped = 0.88 * Math.exp(-zeta_unclamped * w_ring * t_s) * Math.cos(w_ring * t_s);
    const env_snubbed =
      (clampFactor - 1.0) * Math.exp(-zeta_snubbed * w_ring * t_s) * Math.cos(w_ring * 0.82 * t_s);
    return {
      y1: Number((Vsec_ideal_pk_V * (1 + env_snubbed)).toFixed(2)),
      y2: Number((Vsec_ideal_pk_V * (1 + env_unclamped)).toFixed(2)),
    };
  };

  const ringingSweep: SweepPoint[] = [];
  for (let i = 0; i <= 50; i++) {
    const t_ns = i * 5;
    const pt = evalRinging(t_ns);
    ringingSweep.push({ x: t_ns, y1: pt.y1, y2: pt.y2 });
  }

  // ============================================================================
  // MAGNETICS (iGSE + 1D HYPERBOLIC DOWELL + CORE SATURATION)
  // ============================================================================
  const Ae_m2 = core.Ae_mm2 * 1e-6;
  const le_m = core.le_mm * 1e-3;
  const Ve_m3 = core.Ve_mm3 * 1e-9;

  const voltSec = V_bridge * (Deff_nom * Tsw * 0.5);
  const voltSec_applied_Vus = voltSec * 1e6;
  const voltSec_max_Vus = Np_actual * Ae_m2 * (2 * material.Bsat_100C_T) * 1e6;
  const deltaB_T = voltSec / (Np_actual * Ae_m2);
  const Bpk_T = deltaB_T / 2;
  const Bpk_mT = Bpk_T * 1e3;
  const fluxMargin_pct = ((material.Bsat_100C_T - Bpk_T) / material.Bsat_100C_T) * 100;

  const mu_e_actual = (Lm * le_m) / (MU_0 * Np_actual * Np_actual * Ae_m2);
  const mu_i_ferrite = 2200;
  const airGap_mm = Math.max(0, le_m * (1 / Math.max(mu_e_actual, 1) - 1 / mu_i_ferrite) * 1e3);
  const H_pk_Am = (Np_actual * Im_pk_A) / le_m;

  const Bsat_100C_T = material.Bsat_100C_T;
  const Bsat_25C_T = Bsat_100C_T * 1.24;
  const I_char_100C = (Np_actual * Ae_m2 * Bsat_100C_T) / Lm;
  const I_char_25C = (Np_actual * Ae_m2 * Bsat_25C_T) / Lm;
  const atanh_08 = 0.5 * Math.log((1 + 0.8) / (1 - 0.8));
  const atanh_09 = 0.5 * Math.log((1 + 0.9) / (1 - 0.9));
  const Isat_80pct_A = I_char_100C * atanh_08;
  const Isat_90pct_A = I_char_100C * atanh_09;

  const u_op = Im_pk_A / Math.max(I_char_100C, 1e-4);
  const sech_op = 1 / Math.cosh(Math.min(u_op, 10));
  const Lm_at_Im_pk_uH = state.Lm_uH * sech_op * sech_op;

  const evalSatAtIm = (im_A: number) => {
    const im = Math.max(0, im_A);
    const h = (Np_actual * im) / le_m;
    const b_lin_T = (Lm * im) / (Np_actual * Ae_m2);
    const u100 = im / Math.max(I_char_100C, 1e-4);
    const u25 = im / Math.max(I_char_25C, 1e-4);
    const b100_T = Bsat_100C_T * Math.tanh(u100) + MU_0 * h;
    const b25_T = Bsat_25C_T * Math.tanh(u25) + MU_0 * h;
    const sech100 = 1 / Math.cosh(Math.min(u100, 10));
    const lm_inc = state.Lm_uH * sech100 * sech100;
    return {
      Im_A: Number(im.toFixed(2)),
      H_Am: Number(h.toFixed(1)),
      B_100C_mT: Number((b100_T * 1e3).toFixed(1)),
      B_25C_mT: Number((b25_T * 1e3).toFixed(1)),
      B_linear_mT: Number(Math.min(b25_T * 1.45 * 1e3, b_lin_T * 1e3).toFixed(1)),
      Lm_inc_uH: Number(lm_inc.toFixed(1)),
    };
  };

  const saturationCurve: {
    Im_A: number;
    H_Am: number;
    B_100C_mT: number;
    B_25C_mT: number;
    B_linear_mT: number;
    Lm_inc_uH: number;
  }[] = [];
  const I_sweep_max = Math.max(Isat_90pct_A * 1.55, Im_pk_A * 1.8, 2.0);
  for (let i = 0; i <= 50; i++) {
    const im = (I_sweep_max * i) / 50;
    saturationCurve.push(evalSatAtIm(im));
  }

  const customSteinmetzEnabled = Boolean(state.customSteinmetzEnabled);
  const k_eff = customSteinmetzEnabled ? (state.custom_k_si ?? material.k_si) : material.k_si;
  const alpha_eff = customSteinmetzEnabled ? (state.custom_alpha ?? material.alpha) : material.alpha;
  const beta_eff = customSteinmetzEnabled ? (state.custom_beta ?? material.beta) : material.beta;
  const T_opt_eff_C = customSteinmetzEnabled ? (state.custom_T_opt_C ?? material.T_opt_C) : material.T_opt_C;
  const c2_eff = customSteinmetzEnabled ? (state.custom_tempCoeff_c2 ?? material.tempCoeff_c2) : material.tempCoeff_c2;

  const computeKiFromSteinmetz = (k_val: number, a_val: number, b_val: number) => {
    let quadSum = 0;
    const nQ = 36;
    for (let j = 0; j < nQ; j++) {
      const theta = ((j + 0.5) / nQ) * (Math.PI / 2);
      quadSum += Math.pow(Math.cos(theta), a_val) * (Math.PI / (2 * nQ));
    }
    return k_val / (Math.pow(2 * Math.PI, a_val - 1) * 4 * quadSum * Math.pow(2, b_val - a_val));
  };

  const ki_igse = computeKiFromSteinmetz(k_eff, alpha_eff, beta_eff);

  const Pv_se_base_W_m3 =
    k_eff * Math.pow(fsw, alpha_eff) * Math.pow(Bpk_T, beta_eff);

  const calcIgseCoreLossBaseW = (d_duty: number): { pIgse: number; pSe: number; pvIgse_W_m3: number; pvSe_W_m3: number } => {
    const dClamped = Math.max(0.05, Math.min(0.98, d_duty));
    const vs = V_bridge * (dClamped * Tsw * 0.5);
    const dB = vs / (Np_actual * Ae_m2);
    const bPk = dB / 2;
    const pvSe = k_eff * Math.pow(fsw, alpha_eff) * Math.pow(bPk, beta_eff);
    const dbdt_active = (2 * dB) / (dClamped * Tsw);
    const pvIgse =
      ki_igse *
      Math.pow(dB, beta_eff - alpha_eff) *
      dClamped *
      Math.pow(dbdt_active, alpha_eff);
    return {
      pIgse: Math.max(0.15, pvIgse * Ve_m3 * nPhases),
      pSe: Math.max(0.15, pvSe * Ve_m3 * nPhases),
      pvIgse_W_m3: pvIgse,
      pvSe_W_m3: pvSe,
    };
  };

  const nominalCoreLossBase = calcIgseCoreLossBaseW(Deff_nom);
  let Pcore_se_W = Math.max(0.2, Pv_se_base_W_m3 * Ve_m3 * nPhases);
  let Pcore_igse_W = nominalCoreLossBase.pIgse;
  let Pcore_W = Pcore_igse_W;

  const calcIgseCoreLossW = (d_duty: number, tempFactor = 1.0): { pIgse: number; pSe: number } => {
    const base = calcIgseCoreLossBaseW(d_duty);
    return {
      pIgse: base.pIgse * tempFactor,
      pSe: base.pSe * tempFactor,
    };
  };

  // ============================================================================
  // 4-QUADRANT B-H HYSTERESIS LOOP & CORE GEOMETRY FLUX SWING ANALYSIS
  // ============================================================================
  const Bsat_100C_mT = Bsat_100C_T * 1e3;
  const Bsat_25C_mT = Bsat_25C_T * 1e3;
  const deltaB_mT = deltaB_T * 1e3;
  const Bmax_mT = Bpk_mT;
  const Bmin_mT = -Bpk_mT;
  const fluxHeadroom_100C_mT = Math.max(0, Bsat_100C_mT - Bpk_mT);
  const fluxUtilization_100C_pct = (Bpk_mT / Math.max(Bsat_100C_mT, 1)) * 100;
  const fluxUtilization_25C_pct = (Bpk_mT / Math.max(Bsat_25C_mT, 1)) * 100;

  const H_char_100C_Am = (Np_actual * I_char_100C) / le_m;
  const H_char_25C_Am = (Np_actual * I_char_25C) / le_m;
  const H_sat_80pct_Am = (Np_actual * Isat_80pct_A) / le_m;
  const H_sat_90pct_Am = (Np_actual * Isat_90pct_A) / le_m;

  // Per-cycle core hysteresis energy density w_core = oint(H dB) = P_core / (Ve * fsw * nPhases) [J/m^3]
  const energyPerCycle_mJ = (Pcore_igse_W / (fsw * nPhases)) * 1e3;
  const volumetricEnergy_J_m3 = Pcore_igse_W / Math.max(Ve_m3 * fsw * nPhases, 1e-12);

  // Dynamic coercive field half-width Hc_eff from oint(H dB) = pi * Hc_eff * Bpk
  const Hc_dyn_Am = volumetricEnergy_J_m3 / Math.max(Math.PI * Math.max(Bpk_T, 0.005), 1e-6);
  const Hc_major_Am = Math.max(18, H_char_100C_Am * 0.16, Hc_dyn_Am * 1.25);
  const Hc_eff_Am = Math.min(
    Math.max(8, Hc_dyn_Am),
    Math.max(H_pk_Am * 0.68, 14)
  );

  // Remanent flux density Br when H crosses 0
  const Br_major_mT = Number(
    (Bsat_100C_mT * Math.tanh(Hc_major_Am / Math.max(H_char_100C_Am, 1))).toFixed(1)
  );
  const Br_eff_mT = Number(
    (Bpk_mT * Math.tanh(Hc_eff_Am / Math.max(H_pk_Am, 1)) * 0.85).toFixed(1)
  );

  // Optimal primary turns Np for Bpk = 0.55 * Bsat_100C
  const Np_opt_55pct = Math.max(
    1,
    Math.round(voltSec / (2 * (0.55 * Bsat_100C_T) * Ae_m2))
  );

  const H_plot_max_Am = Math.max(H_sat_90pct_Am * 1.45, H_pk_Am * 1.75, 120);
  const majorCurve: BhMajorPoint[] = [];
  const nMajorSteps = 80;
  for (let i = 0; i <= nMajorSteps; i++) {
    const h = -H_plot_max_Am + (2 * H_plot_max_Am * i) / nMajorSteps;
    const im = (h * le_m) / Np_actual;
    const bAnh100 =
      (Bsat_100C_T * Math.tanh(h / Math.max(H_char_100C_Am, 1e-3)) + MU_0 * h) * 1e3;
    const bAnh25 =
      (Bsat_25C_T * Math.tanh(h / Math.max(H_char_25C_Am, 1e-3)) + MU_0 * h) * 1e3;
    // Ascending branch (dH/dt > 0, shifted by +Hc_major) & Descending branch (dH/dt < 0, shifted by -Hc_major)
    const bUp100 =
      (Bsat_100C_T * Math.tanh((h - Hc_major_Am) / Math.max(H_char_100C_Am, 1e-3)) + MU_0 * h) * 1e3;
    const bDown100 =
      (Bsat_100C_T * Math.tanh((h + Hc_major_Am) / Math.max(H_char_100C_Am, 1e-3)) + MU_0 * h) * 1e3;
    const bLin = MU_0 * mu_e_actual * h * 1e3;
    majorCurve.push({
      H_Am: Number(h.toFixed(1)),
      Im_A: Number(im.toFixed(2)),
      B_anh_100C_mT: Number(bAnh100.toFixed(1)),
      B_anh_25C_mT: Number(bAnh25.toFixed(1)),
      B_major_up_100C_mT: Number(bUp100.toFixed(1)),
      B_major_down_100C_mT: Number(bDown100.toFixed(1)),
      B_linear_mT: Number(Math.max(-Bsat_25C_mT * 1.35, Math.min(Bsat_25C_mT * 1.35, bLin)).toFixed(1)),
    });
  }

  // Closed 360-degree minor operating B-H loop under actual excitation
  const minorLoop: BhMinorLoopPoint[] = [];
  const nLoopSteps = 72;
  const u_pk = H_pk_Am / Math.max(H_char_100C_Am, 1e-3);
  const tanh_upk = Math.max(Math.tanh(u_pk), 1e-4);
  for (let i = 0; i <= nLoopSteps; i++) {
    const theta = (2 * Math.PI * i) / nLoopSteps;
    const sinT = Math.sin(theta);
    const cosT = Math.cos(theta);
    // H(theta) includes magnetizing drive H_pk*sin(theta) + rate-dependent hysteresis width Hc_eff*cos(theta)
    const hLoop = H_pk_Am * sinT + Hc_eff_Am * cosT * (1 - 0.22 * sinT * sinT);
    const imLoop = (hLoop * le_m) / Np_actual;
    // B(theta) tracks the anhysteretic S-curve scaled so tips hit exact Faraday +-Bpk_mT at theta = +-90 deg
    const bLoop = Bpk_mT * (Math.tanh(u_pk * sinT) / tanh_upk);
    minorLoop.push({
      phase_deg: Math.round((theta * 180) / Math.PI),
      H_Am: Number(hLoop.toFixed(1)),
      Im_A: Number(imLoop.toFixed(3)),
      B_mT: Number(bLoop.toFixed(1)),
    });
  }

  const bhLoopAnalysis: BhLoopAnalysis = {
    Bsat_100C_mT: Number(Bsat_100C_mT.toFixed(1)),
    Bsat_25C_mT: Number(Bsat_25C_mT.toFixed(1)),
    Bpk_mT: Number(Bpk_mT.toFixed(1)),
    deltaB_mT: Number(deltaB_mT.toFixed(1)),
    Bmax_mT: Number(Bmax_mT.toFixed(1)),
    Bmin_mT: Number(Bmin_mT.toFixed(1)),
    fluxHeadroom_100C_mT: Number(fluxHeadroom_100C_mT.toFixed(1)),
    fluxUtilization_100C_pct: Number(fluxUtilization_100C_pct.toFixed(1)),
    fluxUtilization_25C_pct: Number(fluxUtilization_25C_pct.toFixed(1)),
    H_pk_Am: Number(H_pk_Am.toFixed(1)),
    H_char_100C_Am: Number(H_char_100C_Am.toFixed(1)),
    H_sat_80pct_Am: Number(H_sat_80pct_Am.toFixed(1)),
    H_sat_90pct_Am: Number(H_sat_90pct_Am.toFixed(1)),
    Hc_eff_Am: Number(Hc_eff_Am.toFixed(1)),
    Hc_major_Am: Number(Hc_major_Am.toFixed(1)),
    Br_eff_mT,
    Br_major_mT,
    energyPerCycle_mJ: Number(energyPerCycle_mJ.toFixed(3)),
    volumetricEnergy_J_m3: Number(volumetricEnergy_J_m3.toFixed(1)),
    Np_opt_55pct,
    majorCurve,
    minorLoop,
  };

  // Exact 1D Hyperbolic Dowell Winding Resistance & Interleaving Analysis
  const skinDepth_m = Math.sqrt(RHO_CU_100C / (Math.PI * fsw * MU_0));
  const skinDepth_mm = skinDepth_m * 1e3;
  const d_strand_m = (AWG_DIAM_MM[state.litzStrandAWG] || 0.1016) * 1e-3;
  const xi = (Math.pow(Math.PI / 4, 0.75) * d_strand_m) / skinDepth_m;

  const M_sections =
    state.interleaving === 'full-interleaved' ? 4 : state.interleaving === 'split-pri' ? 2 : 1;
  const m_pri = Math.max(
    1,
    (Np_actual * Math.sqrt(state.priStrands) * d_strand_m) / (core.bw_mm * 1e-3 * M_sections)
  );
  const m_sec = Math.max(
    1,
    (Ns_actual * Math.sqrt(state.secStrands) * d_strand_m) / (core.bw_mm * 1e-3 * M_sections)
  );
  const m_pri_nonInt = Math.max(
    1,
    (Np_actual * Math.sqrt(state.priStrands) * d_strand_m) / (core.bw_mm * 1e-3 * 1)
  );

  const Fr_dowell_pri = calcHyperbolicDowell(xi, m_pri);
  const Fr_dowell_sec = calcHyperbolicDowell(xi, m_sec);

  const evalDowell = (f_kHz: number) => {
    const f_clamped = Math.max(1, f_kHz);
    const delta_f =
      (Math.pow(Math.PI / 4, 0.75) * d_strand_m) /
      Math.sqrt(RHO_CU_100C / (Math.PI * (f_clamped * 1e3) * MU_0));
    return {
      y1: Number(calcHyperbolicDowell(delta_f, m_pri).toFixed(2)),
      y2: Number(calcHyperbolicDowell(delta_f, m_pri_nonInt).toFixed(2)),
    };
  };

  const dowellSweep: SweepPoint[] = [];
  for (let i = 0; i <= 38; i++) {
    const f_kHz = 20 + i * 10;
    const pt = evalDowell(f_kHz);
    dowellSweep.push({ x: f_kHz, y1: pt.y1, y2: pt.y2 });
  }

  const A_strand_m2 = Math.PI * Math.pow(d_strand_m / 2, 2);
  const MLT_m = core.MLT_mm * 1e-3;
  const Rpri_dc = (RHO_CU_100C * Np_actual * MLT_m) / (state.priStrands * A_strand_m2);
  const Rsec_dc = (RHO_CU_100C * Ns_actual * MLT_m) / (state.secStrands * A_strand_m2);
  const Rpri_ac_mOhm = Rpri_dc * Fr_dowell_pri * 1e3;
  const Rsec_ac_mOhm = Rsec_dc * Fr_dowell_sec * 1e3;

  const Ipri_rms_A = isLLC
    ? Math.hypot(1.11 * Iout_phase_A * k_refl, Im_pk_A / Math.sqrt(2))
    : Iout_phase_A * k_refl * Math.sqrt(Deff_nom + (1 - Deff_nom) * 0.72) * 1.02;
  const Pcu_W =
    (Ipri_rms_A * Ipri_rms_A * (Rpri_ac_mOhm * 1e-3) +
      Isec_rms_total_A * Isec_rms_total_A * (Rsec_ac_mOhm * 1e-3)) *
    nPhases;

  const Acu_mm2 =
    (Np_actual * state.priStrands + Ns_actual * state.secStrands * (isCT ? 2 : 1)) * (A_strand_m2 * 1e6);
  const windowFill_pct = (Acu_mm2 / (core.Aw_mm2 * 0.42)) * 100;

  const h_ins_m = Math.max(0.05e-3, state.insulationThickness_mm * 1e-3);
  const hw_m = core.hw_mm * 1e-3;
  const bw_m = core.bw_mm * 1e-3;
  // Margin tape (~6-8mm total axial creepage) reduces active winding breadth b_eff
  const bw_eff_m = Math.max(bw_m * 0.48, bw_m - (state.Vin_max_V > 550 ? 0.010 : 0.006));
  const Llk_geom_uH =
    ((MU_0 * Np_actual * Np_actual * MLT_m) / (bw_eff_m * M_sections * M_sections)) *
    (h_ins_m + hw_m / 3) *
    1e6;

  const eps_r_ins = 3.4;
  const Cww_pF = ((EPS_0 * eps_r_ins * MLT_m * bw_m * M_sections) / h_ins_m) * 1e12;

  // ============================================================================
  // FIX 2 & ELECTRO-THERMAL MOSFET / SiC / GaN CALCULATOR
  // Iterative Self-Consistent Tj <-> Rds,on(Tj), Qrr(Tj), Gate Drive & Kelvin Ls
  // ============================================================================
  const nPriSwitches = isHalfBridge ? 2 : 4;
  const I_sw_rms = Ipri_rms_A / Math.sqrt(2);
  const Rg_int_pri_Ohm =
    priDevice.Rg_int_Ohm !== undefined && priDevice.Rg_int_Ohm > 0
      ? priDevice.Rg_int_Ohm
      : priDevice.tech === 'GaN HEMT'
      ? 1.1
      : 1.8;
  const kelvinSourceActive = state.kelvinSourcePri ?? (priDevice.kelvinSource ?? true);
  const Ls_common_nH = kelvinSourceActive ? 0.6 : 7.2; // 4-pin Kelvin (0.6nH) vs 3-pin TO-247-3 (7.2nH)
  const V_plateau = priDevice.tech === 'GaN HEMT' ? 3.2 : 4.5;
  const Vgs_drv = Math.max(5.0, state.Vgs_drive_V);

  // Gate Drive Loss & Peak Gate Current for given Rg_ext and Common-Source Inductance Ls
  const calcGateAndOverlap = (rg_ext: number, tj_pri: number, useKelvin = kelvinSourceActive) => {
    const rg_tot = Rg_int_pri_Ohm + Math.max(0.1, rg_ext);
    const rg_scale = rg_tot / (Rg_int_pri_Ohm + 2.5);
    const ig_pk = Vgs_drv / rg_tot;

    const pGateTotal =
      nPriSwitches * state.nParallelPri * fsw * (priDevice.Qg_nC * 1e-9) * Vgs_drv * nPhases;
    const pGateExt = pGateTotal * (rg_ext / rg_tot);
    const pGateInt = pGateTotal * (Rg_int_pri_Ohm / rg_tot);

    // Temperature-dependent Miller plateau shift & carrier mobility switching overlap factor
    const dT = tj_pri - 25;
    const kappa_th = priDevice.tech === 'GaN HEMT' ? 0.0015 : 0.0042; // V/°C threshold negative drift
    const V_plateau_hot = Math.max(1.8, V_plateau - kappa_th * dT);
    const alpha_sw =
      priDevice.tech === 'GaN HEMT'
        ? 0.0018
        : priDevice.tech === 'SiC MOSFET'
        ? 0.0024
        : 0.0038;
    const swTempMult = Math.max(0.82, 1 + alpha_sw * dT);

    // Common-source inductance Ls slows dI/dt by V_Ls = Ls * dI/dt opposing gate drive
    const ls_H = (useKelvin ? 0.6 : 7.2) * 1e-9;
    const v_drive_headroom = Math.max(2.0, Vgs_drv - V_plateau_hot);
    const t_ls_adder_on = (ls_H * I_lag_turnoff_A) / v_drive_headroom;
    const t_ls_adder_off = (ls_H * (I_lead_turnoff_A + I_lag_turnoff_A) * 0.5) / Math.max(1.8, V_plateau_hot);

    const nLegPairs = nPriSwitches / 2;
    const t_on_eff = (priDevice.tr_ns * 1e-9 * Math.pow(rg_scale, 0.65) + t_ls_adder_on) * swTempMult;
    const t_off_eff = (priDevice.tf_ns * 1e-9 * Math.pow(rg_scale, 0.65) + t_ls_adder_off) * swTempMult;

    // Leading leg turn-on: if zvsLeadAchieved, channel turn-on overlap is zero
    const pOnLead = zvsLeadAchieved
      ? 0
      : nLegPairs * fsw * 0.5 * V_bridge * I_lead_turnoff_A * t_on_eff * nPhases;

    // Lagging leg turn-on: if incomplete ZVS, discharges residual Vds_res_lag_V + V-I overlap
    const eOssResidual_J = 0.5 * C_node_F * Vds_res_lag_V * Vds_res_lag_V;
    const pOnLag = zvsAchieved
      ? 0
      : nLegPairs *
        fsw *
        (eOssResidual_J + 0.5 * Vds_res_lag_V * I_lag_turnoff_A * t_on_eff) *
        nPhases;

    const pSwOn = pOnLead + pOnLag;

    // Turn-off overlap loss (snubbed by Coss, reduced by 4-pin Kelvin source, increases with Tj as V_plateau drops)
    const zvsOffRelief = useKelvin ? 0.36 : 0.54;
    const pSwOff =
      nLegPairs *
      fsw *
      0.5 *
      V_bridge *
      (I_lead_turnoff_A + I_lag_turnoff_A) *
      t_off_eff *
      zvsOffRelief *
      nPhases;

    // Coss non-linear hysteresis loss (~7% of E_oss per transition even in ZVS)
    const pOssHyst = nPriSwitches * fsw * (E_oss_lag_uJ * 1e-6 * 0.07) * nPhases;

    // Primary Body-Diode Dead-Time Conduction Loss (with negative temp coeff on Vsd)
    const t_body_cond_s = Math.max(8e-9, state.deadTime_ns * 1e-9 - t_dead_min_ns * 1e-9 * 0.72);
    const Vsd_hot = Math.max(0.55, priDevice.Vsd_V - 0.0016 * dT);
    const pDtBodyPri =
      nPriSwitches * 0.5 * (I_lead_turnoff_A + I_lag_turnoff_A) * Vsd_hot * t_body_cond_s * fsw * nPhases;

    // Primary Body-Diode Reverse-Recovery Loss Qrr(Tj)
    const qrr_pri_hot_nC =
      priDevice.Qrr_nC * (1 + 0.0065 * Math.max(-40, dT)) * Math.sqrt(I_lag_turnoff_A / 20);
    const hardFraction = zvsAchieved ? 0.08 : Math.min(1.0, Vds_res_lag_V / Math.max(V_bridge, 1));
    const pRrPri = nLegPairs * fsw * V_bridge * (qrr_pri_hot_nC * 1e-9) * hardFraction * nPhases;

    // Temperature-dependent Rds,on(Tj)
    const rds_mult = Math.max(0.65, 1 + priDevice.alpha_R_per_C * dT + 1.8e-5 * dT * Math.max(0, dT));
    const rds_pri_hot_Ohm = ((priDevice.Rds_on_25C_mOhm * 1e-3) / state.nParallelPri) * rds_mult;
    const pCondPri = nPriSwitches * I_sw_rms * I_sw_rms * rds_pri_hot_Ohm * nPhases;

    return {
      rds_pri_hot_Ohm,
      pCondPri,
      pSwOn,
      pSwOff,
      pOssHyst,
      pDtBodyPri,
      pRrPri,
      pGateTotal,
      pGateExt,
      pGateInt,
      ig_pk,
      qrr_pri_hot_nC,
      pTotalPri: pCondPri + pSwOn + pSwOff + pOssHyst + pDtBodyPri + pRrPri + pGateInt,
    };
  };

  // Iterative Fixed-Point Electro-Thermal Solver for Primary Junction Temperature Tj,pri
  // Through-hole drain-tab packages (TO-220 / TO-247) require electrical insulation pads (~0.75-0.85 °C/W)
  const isPriThtPkg = /to-?220|to-?247|hip247/i.test(priDevice.packageType ?? '');
  const isSecThtPkg = /to-?220|to-?247|hip247/i.test(secDevice.packageType ?? '');
  const Rth_TIM_CW = state.Rth_TIM_CW ?? (isPriThtPkg ? 0.75 : 0.25);
  const Rth_TIM_sec_CW = state.Rth_TIM_CW ?? (isSecThtPkg ? 0.85 : 0.25);
  const Tj_max_limit_C = state.Tj_max_limit_C ?? 150;
  const Rth_pri_per_pos = priDevice.Rth_JC_CW + Rth_TIM_CW + state.Rth_heatsink_CW;
  let Tj_pri_C = state.Tamb_C + 25;
  for (let iter = 0; iter < 8; iter++) {
    const evalStep = calcGateAndOverlap(Rg_ext_Ohm, Tj_pri_C, kelvinSourceActive);
    const pPerSwitchPos = evalStep.pTotalPri / (nPriSwitches * nPhases);
    Tj_pri_C = Math.min(260, state.Tamb_C + pPerSwitchPos * Rth_pri_per_pos);
  }

  const priElectroThermal = calcGateAndOverlap(Rg_ext_Ohm, Tj_pri_C, kelvinSourceActive);
  const priAt25C = calcGateAndOverlap(Rg_ext_Ohm, 25, kelvinSourceActive);
  const pri3PinComparison = calcGateAndOverlap(Rg_ext_Ohm, Tj_pri_C, false);
  const pri4PinComparison = calcGateAndOverlap(Rg_ext_Ohm, Tj_pri_C, true);
  const Psw_kelvin_saved_W = Math.max(0, pri3PinComparison.pTotalPri - pri4PinComparison.pTotalPri);

  const Rds_pri_actual_mOhm = priElectroThermal.rds_pri_hot_Ohm * 1e3;
  const Pcond_pri_W = priElectroThermal.pCondPri;
  const Pcond_pri_25C_W = priAt25C.pCondPri;
  const Psw_on_pri_W = priElectroThermal.pSwOn;
  const Psw_off_pri_W = priElectroThermal.pSwOff;
  const Poss_hyst_pri_W = priElectroThermal.pOssHyst;
  const Pdt_body_pri_W = priElectroThermal.pDtBodyPri;
  const Prr_pri_W = priElectroThermal.pRrPri;
  const Pgate_pri_W = priElectroThermal.pGateTotal;
  const Pgate_ext_pri_W = priElectroThermal.pGateExt;
  const Pgate_int_pri_W = priElectroThermal.pGateInt;
  const Ig_pk_pri_A = priElectroThermal.ig_pk;
  const Qrr_pri_hot_nC = priElectroThermal.qrr_pri_hot_nC;
  const Psw_pri_W = Psw_on_pri_W + Psw_off_pri_W + Poss_hyst_pri_W + Pdt_body_pri_W + Prr_pri_W + Pgate_pri_W;
  const Psw_pri_25C_W =
    priAt25C.pSwOn + priAt25C.pSwOff + priAt25C.pOssHyst + priAt25C.pDtBodyPri + priAt25C.pRrPri + priAt25C.pGateTotal;

  // Cauer Thermal Ladder Node Temperatures for Primary Switch
  const pPriPerPos_W = priElectroThermal.pTotalPri / (nPriSwitches * nPhases);
  const Tsink_pri_C = state.Tamb_C + pPriPerPos_W * state.Rth_heatsink_CW;
  const Tcase_pri_C = Tsink_pri_C + pPriPerPos_W * Rth_TIM_CW;

  const priAt125C = calcGateAndOverlap(Rg_ext_Ohm, 125, kelvinSourceActive);
  const Pcond_pri_125C_W = priAt125C.pCondPri;

  // Multi-Device Figure-of-Merit (FOM) & Operating Point Benchmark Table
  const deviceBenchmarks: DeviceBenchmarkRow[] = SEMICONDUCTOR_DATABASE.filter(
    (d) => d.role !== 'secondary' && d.Vds_max_V >= V_bridge * 1.1
  ).map((dev) => {
    const fom_hard = dev.Rds_on_25C_mOhm * dev.Qg_nC;
    const fom_zvs = dev.Rds_on_25C_mOhm * (dev.Coss_er_pF / 1e3); // mOhm * nF
    const fom_qrr = dev.Rds_on_25C_mOhm * dev.Qrr_nC;
    const rds85 = ((dev.Rds_on_25C_mOhm * 1e-3) / state.nParallelPri) * (1 + dev.alpha_R_per_C * 60);
    const pCondEst = nPriSwitches * I_sw_rms * I_sw_rms * rds85 * nPhases;
    const pSwEst =
      nPriSwitches *
      0.5 *
      fsw *
      (0.5 * V_bridge * (I_lead_turnoff_A + I_lag_turnoff_A) * (dev.tf_ns * 1e-9) * 0.4 +
        (dev.Qg_nC * 1e-9) * Vgs_drv) *
      nPhases;
    const pTot = pCondEst + pSwEst;
    const tjEst = state.Tamb_C + (pTot / (nPriSwitches * nPhases)) * (dev.Rth_JC_CW + state.Rth_heatsink_CW);
    return {
      id: dev.id,
      name: dev.name,
      tech: dev.tech,
      lcscPartNumber: dev.lcscPartNumber,
      jlcpcbClass: dev.jlcpcbClass,
      unitPrice_USD: dev.unitPrice_USD,
      fom_hard_mOhm_nC: Number(fom_hard.toFixed(0)),
      fom_zvs_mOhm_nF: Number(fom_zvs.toFixed(2)),
      fom_qrr_mOhm_nC: Number(fom_qrr.toFixed(0)),
      Ppri_total_W: Number(pTot.toFixed(2)),
      Tj_est_C: Number(tjEst.toFixed(1)),
      isGroundedCustom: Boolean(dev.isCustomGrounded),
    };
  });

  // Thermal Runaway Loop Gain: (dP_pri / dTj) * Rth_eff
  const priPlus1C = calcGateAndOverlap(Rg_ext_Ohm, Tj_pri_C + 1.0);
  const dP_dTj_per_sw = (priPlus1C.pTotalPri - priElectroThermal.pTotalPri) / (nPriSwitches * nPhases);
  const thermalLoopGain = Math.max(0, dP_dTj_per_sw * Rth_pri_per_pos);
  const thermalStable = thermalLoopGain < 0.85 && Tj_pri_C < 175;

  // Iterative Electro-Thermal Solver for Secondary Synchronous Rectifier / Diode
  const Rth_sec_per_pos = secDevice.Rth_JC_CW + Rth_TIM_sec_CW + state.Rth_heatsink_CW;
  let Tj_sec_C = state.Tamb_C + 20;
  let Rds_sec_actual_mOhm = secDevice.Rds_on_25C_mOhm / state.nParallelSec;
  let Pcond_sec_ch_W = 0;
  let Pdt_body_sec_W = 0;
  let Prr_sec_W = 0;
  let Pgate_sec_W = 0;
  let Qrr_sec_hot_nC = secDevice.Qrr_nC;
  let Vf_rect_drop_V = 0;

  for (let iter = 0; iter < 6; iter++) {
    const dT_sec = Tj_sec_C - 25;
    Qrr_sec_hot_nC = secDevice.Qrr_nC * (1 + 0.0055 * Math.max(-40, dT_sec));
    Prr_sec_W = nSecDevices * 0.5 * fsw * Vsec_ideal_pk_V * (Qrr_sec_hot_nC * 1e-9) * nPhases;

    if (state.rectMode === 'sync-fet') {
      const rds_sec_mult = Math.max(0.65, 1 + secDevice.alpha_R_per_C * dT_sec + 1.5e-5 * dT_sec * Math.max(0, dT_sec));
      const rds_sec_Ohm = ((secDevice.Rds_on_25C_mOhm * 1e-3) / state.nParallelSec) * rds_sec_mult;
      Rds_sec_actual_mOhm = rds_sec_Ohm * 1e3;
      Vf_rect_drop_V = Isec_rms_per_dev_A * rds_sec_Ohm;
      Pcond_sec_ch_W = nSecDevices * Isec_rms_per_dev_A * Isec_rms_per_dev_A * rds_sec_Ohm * nPhases;
      Pdt_body_sec_W = 2 * Iout_phase_A * secDevice.Vsd_V * (state.deadTime_ns * 1e-9) * fsw * nPhases;
      Pgate_sec_W = nSecDevices * state.nParallelSec * fsw * (secDevice.Qg_nC * 1e-9) * 10.0 * nPhases;
    } else {
      const Vd0 = Math.max(0.72, secDevice.Vsd_V - 0.0012 * dT_sec);
      const Rd_diode = (Math.max(12, secDevice.Rds_on_25C_mOhm) * 1e-3) / state.nParallelSec;
      Rds_sec_actual_mOhm = Rd_diode * 1e3;
      const I_avg_per_diode = Iout_phase_A / (nSecDevices / 2);
      Vf_rect_drop_V = Vd0 + Isec_rms_per_dev_A * Rd_diode;
      Pcond_sec_ch_W =
        nSecDevices *
        (Vd0 * (I_avg_per_diode / 2) + Isec_rms_per_dev_A * Isec_rms_per_dev_A * Rd_diode) *
        nPhases;
      Pdt_body_sec_W = 0;
      Pgate_sec_W = 0;
    }
    const pSecTotal = Pcond_sec_ch_W + Pdt_body_sec_W + Prr_sec_W + Pgate_sec_W * 0.4;
    Tj_sec_C = Math.min(250, state.Tamb_C + (pSecTotal / (nSecDevices * nPhases)) * Rth_sec_per_pos);
  }

  const pSecPerPos_W = (Pcond_sec_ch_W + Pdt_body_sec_W + Prr_sec_W + Pgate_sec_W * 0.4) / (nSecDevices * nPhases);
  const Tsink_sec_C = state.Tamb_C + pSecPerPos_W * state.Rth_heatsink_CW;
  const Tcase_sec_C = Tsink_sec_C + pSecPerPos_W * Rth_TIM_sec_CW;
  const Pcond_sec_25C_W =
    state.rectMode === 'sync-fet'
      ? nSecDevices * Isec_rms_per_dev_A * Isec_rms_per_dev_A * ((secDevice.Rds_on_25C_mOhm * 1e-3) / state.nParallelSec) * nPhases
      : Pcond_sec_ch_W * 1.05;

  // Thermal Derating Envelope Metrics at Tj_max_limit_C (for user-defined Rth_heatsink_CW & Tamb_C)
  const priAtLimit = calcGateAndOverlap(Rg_ext_Ohm, Tj_max_limit_C, kelvinSourceActive);
  const maxDissTotalPri_W =
    (Math.max(0, Tj_max_limit_C - state.Tamb_C) / Math.max(0.05, Rth_pri_per_pos)) *
    (nPriSwitches * nPhases);
  const fixedSwAtLimit_W = priAtLimit.pOssHyst + priAtLimit.pGateInt;
  const availVariableLoss_W = Math.max(0, maxDissTotalPri_W - fixedSwAtLimit_W);
  const currentVarLossAtLimit_W = Math.max(
    0.5,
    priAtLimit.pCondPri + priAtLimit.pSwOn + priAtLimit.pSwOff + priAtLimit.pDtBodyPri + priAtLimit.pRrPri
  );
  // Since P_cond ~ I^2 and P_sw ~ I, approximate safe power scaling ratio
  const powerScaleRatio = Math.sqrt(availVariableLoss_W / currentVarLossAtLimit_W);
  const Pout_derated_max_W = Number((state.Pout_W * Math.min(2.5, powerScaleRatio)).toFixed(0));
  const Id_pri_derated_max_A = Number((I_sw_rms * Math.min(2.5, powerScaleRatio)).toFixed(1));
  const pPerSwitchAtLimit_W = priAtLimit.pTotalPri / (nPriSwitches * nPhases);
  const Rth_hs_crit_CW = Number(
    Math.max(
      0.05,
      (Tj_max_limit_C - state.Tamb_C) / Math.max(0.1, pPerSwitchAtLimit_W) -
        priDevice.Rth_JC_CW -
        Rth_TIM_CW
    ).toFixed(2)
  );

  // ============================================================================
  // ITERATIVE FERRITE PARABOLIC CORE LOSS & CORE HEATING SOLVER
  // Pv(Tcore) = Pv(Topt) * [1 + c2 * (Tcore - Topt)^2]
  // ============================================================================
  let Tcore_C = state.Tamb_C + ((Pcore_igse_W + Pcu_W) / nPhases) * core.Rth_core_CW;
  let tempFactor_F = 1.0;
  for (let iter = 0; iter < 6; iter++) {
    const dT_opt = Tcore_C - T_opt_eff_C;
    tempFactor_F = Math.max(0.75, Math.min(2.8, 1 + c2_eff * dT_opt * dT_opt));
    Pcore_igse_W = nominalCoreLossBase.pIgse * tempFactor_F;
    Pcore_se_W = nominalCoreLossBase.pSe * tempFactor_F;
    Pcore_W = Pcore_igse_W;
    Tcore_C = Math.min(240, state.Tamb_C + ((Pcore_W + Pcu_W) / nPhases) * core.Rth_core_CW);
  }

  // Update dynamic B-H hysteresis energy & coercive field width with temperature-corrected Pcore_igse_W
  bhLoopAnalysis.energyPerCycle_mJ = Number(((Pcore_igse_W / (fsw * nPhases)) * 1e3).toFixed(3));
  bhLoopAnalysis.volumetricEnergy_J_m3 = Number(
    (Pcore_igse_W / Math.max(Ve_m3 * fsw * nPhases, 1e-12)).toFixed(1)
  );

  const igseSweep: SweepPoint[] = [];
  for (let i = 0; i <= 30; i++) {
    const d = 0.15 + (0.75 * i) / 30;
    const { pIgse, pSe } = calcIgseCoreLossW(d, tempFactor_F);
    igseSweep.push({
      x: Number(d.toFixed(2)),
      y1: Number(pIgse.toFixed(2)),
      y2: Number(pSe.toFixed(2)),
    });
  }

  const Pv_igse_kW_m3 = (Pcore_igse_W / Math.max(Ve_m3 * nPhases, 1e-12)) * 1e-3;
  const Pv_se_kW_m3 = (Pcore_se_W / Math.max(Ve_m3 * nPhases, 1e-12)) * 1e-3;
  const deltaT_fe_C = (Pcore_igse_W / nPhases) * core.Rth_core_CW;
  const deltaT_cu_C = (Pcu_W / nPhases) * core.Rth_core_CW;
  const deltaT_total_C = deltaT_fe_C + deltaT_cu_C;
  const Tcore_hotspot_C = state.Tamb_C + 1.22 * deltaT_total_C;

  // Ferrite thermal loop gain above T_opt: dP_core/dT * (Rth_core / nPhases)
  const dPcore_dT =
    Tcore_C > T_opt_eff_C
      ? nominalCoreLossBase.pIgse * 2 * c2_eff * (Tcore_C - T_opt_eff_C)
      : 0;
  const coreThermalLoopGain = Math.max(0, (dPcore_dT / nPhases) * core.Rth_core_CW);
  const coreThermalStable = coreThermalLoopGain < 0.85 && Tcore_C < 130;

  // Optimal Flux Density Swing Bpk_opt where P_core = (2 / beta) * P_cu (Hurley & Wolfle criterion)
  const Bpk_opt_loss_mT = Math.min(
    Bsat_100C_mT * 0.82,
    Math.max(
      25,
      Bpk_mT * Math.pow((2 * Pcu_W) / Math.max(beta_eff * Pcore_igse_W, 0.1), 1 / (beta_eff + 2))
    )
  );
  const Np_opt_loss = Math.max(
    1,
    Math.round((voltSec / (2 * (Bpk_opt_loss_mT * 1e-3) * Ae_m2)))
  );

  // Evaluator 1: Core Loss & Core Heating vs Switching Frequency f_kHz at current Bpk vs Coupled Faraday Bpk(f)
  const evalCoreLossFreq = (f_kHz: number) => {
    const f_Hz = Math.max(5e3, f_kHz * 1e3);
    const dClamped = Math.max(0.05, Math.min(0.98, Deff_nom));
    // Series 1: Fixed Flux Swing Bpk_T at frequency f_Hz (Pure Steinmetz f^alpha scaling)
    const dbdt_fixedB = (2 * deltaB_T * f_Hz) / dClamped;
    const pv_fixedB =
      ki_igse *
      Math.pow(deltaB_T, beta_eff - alpha_eff) *
      dClamped *
      Math.pow(dbdt_fixedB, alpha_eff) *
      tempFactor_F;
    const pCore_fixedB_W = Math.max(0.05, pv_fixedB * Ve_m3 * nPhases);
    const tCore_fixedB_C = Math.min(
      250,
      state.Tamb_C + ((pCore_fixedB_W + Pcu_W) / nPhases) * core.Rth_core_CW
    );
    return {
      y1: Number(pCore_fixedB_W.toFixed(2)),
      y2: Number(tCore_fixedB_C.toFixed(1)),
    };
  };

  const coreLossFreqSweep: SweepPoint[] = [];
  for (let i = 0; i <= 40; i++) {
    const f_kHz = 20 + i * 12; // 20 kHz to 500 kHz
    const pt = evalCoreLossFreq(f_kHz);
    coreLossFreqSweep.push({ x: f_kHz, y1: pt.y1, y2: pt.y2 });
  }

  // Evaluator 2: Core Loss & Core Temp vs Flux Density Swing Bpk (mT) at current fsw
  const evalCoreLossFlux = (bpk_mT_val: number) => {
    const bPk_T_val = Math.max(0.005, bpk_mT_val * 1e-3);
    const dB_T_val = 2 * bPk_T_val;
    const dClamped = Math.max(0.05, Math.min(0.98, Deff_nom));
    const dbdt_val = (2 * dB_T_val) / (dClamped * Tsw);
    const pv_igse_val =
      ki_igse *
      Math.pow(dB_T_val, beta_eff - alpha_eff) *
      dClamped *
      Math.pow(dbdt_val, alpha_eff) *
      tempFactor_F;
    const pCore_val_W = Math.max(0.05, pv_igse_val * Ve_m3 * nPhases);
    const tCore_val_C = Math.min(
      250,
      state.Tamb_C + ((pCore_val_W + Pcu_W) / nPhases) * core.Rth_core_CW
    );
    return {
      y1: Number(pCore_val_W.toFixed(2)),
      y2: Number(tCore_val_C.toFixed(1)),
    };
  };

  const coreLossFluxSweep: SweepPoint[] = [];
  const maxFluxSweep_mT = Math.round(Bsat_25C_mT * 1.05);
  for (let i = 0; i <= 40; i++) {
    const b_mT = Math.round(15 + ((maxFluxSweep_mT - 15) * i) / 40);
    const pt = evalCoreLossFlux(b_mT);
    coreLossFluxSweep.push({ x: b_mT, y1: pt.y1, y2: pt.y2 });
  }

  // Evaluator 3: Parabolic Ferrite Thermal Equilibrium P_mag(Tcore) vs Core Heat Removal P_diss(Tcore)
  const evalCoreTempEquilibrium = (tCore_C_val: number) => {
    const tc = Math.max(-20, Math.min(250, tCore_C_val));
    const dT_opt = tc - T_opt_eff_C;
    const f_temp = Math.max(0.75, Math.min(3.5, 1 + c2_eff * dT_opt * dT_opt));
    const pMagGen_W = nominalCoreLossBase.pIgse * f_temp + Pcu_W;
    const pCoreSink_W = (Math.max(0, tc - state.Tamb_C) / Math.max(0.1, core.Rth_core_CW)) * nPhases;
    return {
      y1: Number(pMagGen_W.toFixed(2)),
      y2: Number(pCoreSink_W.toFixed(2)),
    };
  };

  const coreTempEquilibriumSweep: SweepPoint[] = [];
  for (let i = 0; i <= 36; i++) {
    const tc = i * 5; // 0°C to 180°C
    const pt = evalCoreTempEquilibrium(tc);
    coreTempEquilibriumSweep.push({ x: tc, y1: pt.y1, y2: pt.y2 });
  }

  // Multi-Material Steinmetz & Thermal Benchmark Table
  const materialBenchmarks: CoreMaterialBenchmarkRow[] = MATERIAL_DATABASE.map((mat) => {
    const ki_mat = computeKiFromSteinmetz(mat.k_si, mat.alpha, mat.beta);
    const dClamped = Math.max(0.05, Math.min(0.98, Deff_nom));
    const dbdt_act = (2 * deltaB_T) / (dClamped * Tsw);
    const pv_se_base = mat.k_si * Math.pow(fsw, mat.alpha) * Math.pow(Bpk_T, mat.beta);
    const pv_igse_base =
      ki_mat *
      Math.pow(deltaB_T, mat.beta - mat.alpha) *
      dClamped *
      Math.pow(dbdt_act, mat.alpha);
    let t_eq = state.Tamb_C + ((pv_igse_base * Ve_m3 * nPhases + Pcu_W) / nPhases) * core.Rth_core_CW;
    let f_t = 1.0;
    for (let it = 0; it < 5; it++) {
      f_t = Math.max(0.75, Math.min(2.8, 1 + mat.tempCoeff_c2 * Math.pow(t_eq - mat.T_opt_C, 2)));
      const p_ig = Math.max(0.15, pv_igse_base * f_t * Ve_m3 * nPhases);
      t_eq = Math.min(240, state.Tamb_C + ((p_ig + Pcu_W) / nPhases) * core.Rth_core_CW);
    }
    const p_igse_final = Math.max(0.15, pv_igse_base * f_t * Ve_m3 * nPhases);
    const p_se_final = Math.max(0.15, pv_se_base * f_t * Ve_m3 * nPhases);
    const dt_fe = (p_igse_final / nPhases) * core.Rth_core_CW;
    const margin_pct = ((mat.Bsat_100C_T - Bpk_T) / mat.Bsat_100C_T) * 100;
    return {
      id: mat.id,
      name: mat.name,
      k_si: mat.k_si,
      alpha: mat.alpha,
      beta: mat.beta,
      ki_igse: Number(ki_mat.toFixed(3)),
      Bsat_100C_mT: Number((mat.Bsat_100C_T * 1e3).toFixed(0)),
      T_opt_C: mat.T_opt_C,
      tempCoeff_c2: mat.tempCoeff_c2,
      Pv_igse_kW_m3: Number(((p_igse_final / (Ve_m3 * nPhases)) * 1e-3).toFixed(1)),
      Pv_se_kW_m3: Number(((p_se_final / (Ve_m3 * nPhases)) * 1e-3).toFixed(1)),
      Pcore_igse_W: Number(p_igse_final.toFixed(2)),
      Pcore_se_W: Number(p_se_final.toFixed(2)),
      deltaT_fe_C: Number(dt_fe.toFixed(1)),
      Tcore_eq_C: Number(t_eq.toFixed(1)),
      fluxMargin_pct: Number(margin_pct.toFixed(1)),
    };
  });

  const coreThermalAnalysis: SteinmetzCoreThermalAnalysis = {
    customSteinmetzEnabled,
    k_eff,
    alpha_eff,
    beta_eff,
    ki_eff: Number(ki_igse.toFixed(3)),
    T_opt_eff_C,
    c2_eff,
    tempFactor_F: Number(tempFactor_F.toFixed(3)),
    Pv_se_kW_m3: Number(Pv_se_kW_m3.toFixed(1)),
    Pv_igse_kW_m3: Number(Pv_igse_kW_m3.toFixed(1)),
    Pcore_se_W: Number(Pcore_se_W.toFixed(2)),
    Pcore_igse_W: Number(Pcore_igse_W.toFixed(2)),
    Pcu_W: Number(Pcu_W.toFixed(2)),
    Pmag_total_W: Number((Pcore_igse_W + Pcu_W).toFixed(2)),
    deltaT_fe_C: Number(deltaT_fe_C.toFixed(1)),
    deltaT_cu_C: Number(deltaT_cu_C.toFixed(1)),
    deltaT_total_C: Number(deltaT_total_C.toFixed(1)),
    Tcore_surface_C: Number(Tcore_C.toFixed(1)),
    Tcore_hotspot_C: Number(Tcore_hotspot_C.toFixed(1)),
    coreThermalLoopGain: Number(coreThermalLoopGain.toFixed(3)),
    coreThermalStable,
    Bpk_opt_loss_mT: Number(Bpk_opt_loss_mT.toFixed(1)),
    Np_opt_loss,
    freqSweep: coreLossFreqSweep,
    fluxSweep: coreLossFluxSweep,
    tempEquilibriumSweep: coreTempEquilibriumSweep,
    materialBenchmarks,
  };

  // ============================================================================
  // MAGNETICS SATURATION CHECK ALERT (vs MATERIAL DATASHEET Bsat LIMITS)
  // ============================================================================
  const Bsat_at_Tcore_mT = calcBsatAtTemp_mT(material.id, material.Bsat_100C_T, Tcore_C);
  const exceedsDatasheetLimit = Bpk_mT > Bsat_100C_mT;
  const exceedsActiveTempLimit = Bpk_mT > Bsat_at_Tcore_mT;
  const exceedsRoomTempLimit = Bpk_mT > Bsat_25C_mT;
  const effectiveLimit_mT = Math.min(Bsat_100C_mT, Bsat_at_Tcore_mT);
  const isNearKnee =
    !exceedsDatasheetLimit &&
    !exceedsActiveTempLimit &&
    Bpk_mT >= 0.8 * effectiveLimit_mT;

  const saturationStatus: 'critical' | 'warning' | 'ok' =
    exceedsDatasheetLimit || exceedsActiveTempLimit
      ? 'critical'
      : isNearKnee
      ? 'warning'
      : 'ok';

  const excess_100C_mT = Bpk_mT - Bsat_100C_mT;
  const excess_100C_pct = (excess_100C_mT / Math.max(1, Bsat_100C_mT)) * 100;
  const utilization_100C_pct = (Bpk_mT / Math.max(1, Bsat_100C_mT)) * 100;
  const utilization_Tcore_pct = (Bpk_mT / Math.max(1, Bsat_at_Tcore_mT)) * 100;

  const recommendedMinNp_turns = Math.max(
    1,
    Math.ceil(voltSec / (2 * (0.8 * Bsat_100C_T) * Ae_m2))
  );
  const recommendedSafeNp_turns = Math.max(
    1,
    Math.ceil(voltSec / (2 * (0.7 * Bsat_100C_T) * Ae_m2))
  );

  const sortedCores = [...CORE_DATABASE].sort((a, b) => a.Ae_mm2 - b.Ae_mm2);
  const safeLargerCore =
    sortedCores.find((c) => {
      const candidateBpk_mT = (voltSec / (2 * Np_actual * (c.Ae_mm2 * 1e-6))) * 1e3;
      return candidateBpk_mT <= 0.8 * Bsat_100C_mT;
    }) || null;

  const higherBsatMat =
    [...MATERIAL_DATABASE]
      .sort((a, b) => b.Bsat_100C_T - a.Bsat_100C_T)
      .find((m) => m.id !== material.id && Bpk_mT <= m.Bsat_100C_T * 1000) || null;

  const saturationHeadline = exceedsDatasheetLimit
    ? `CORE SATURATION ALERT: Peak Flux Density (${Bpk_mT.toFixed(1)} mT) Exceeds ${material.name} Datasheet Limit (${Bsat_100C_mT.toFixed(0)} mT @ 100°C)`
    : exceedsActiveTempLimit
    ? `THERMAL SATURATION ALERT: Peak Flux Density (${Bpk_mT.toFixed(1)} mT) Exceeds ${material.name} Derated Limit (${Bsat_at_Tcore_mT.toFixed(0)} mT @ T_core=${Tcore_C.toFixed(0)}°C)`
    : isNearKnee
    ? `SATURATION KNEE WARNING: Peak Flux Density (${Bpk_mT.toFixed(1)} mT) Reaches ${utilization_100C_pct.toFixed(1)}% of ${material.name} Datasheet B_sat`
    : `Saturation Check Passed: B_pk = ${Bpk_mT.toFixed(1)} mT ≤ ${material.name} Datasheet B_sat (${Bsat_100C_mT.toFixed(0)} mT @ 100°C)`;

  const saturationDetail = exceedsDatasheetLimit
    ? `Calculated B_pk exceeds ${material.name} datasheet B_sat(100°C) = ${Bsat_100C_mT.toFixed(0)} mT by +${excess_100C_mT.toFixed(1)} mT (+${excess_100C_pct.toFixed(1)}%)${
        exceedsRoomTempLimit ? ` and even exceeds 25°C room-temp B_sat (${Bsat_25C_mT.toFixed(0)} mT)` : ''
      }. Magnetizing inductance collapses, causing severe primary current spikes.`
    : exceedsActiveTempLimit
    ? `At equilibrium T_core = ${Tcore_C.toFixed(1)}°C, ${material.name} saturation flux rolls off to ${Bsat_at_Tcore_mT.toFixed(0)} mT. B_pk = ${Bpk_mT.toFixed(1)} mT exceeds this limit.`
    : isNearKnee
    ? `B_pk leaves only ${(Bsat_100C_mT - Bpk_mT).toFixed(1)} mT (${fluxMargin_pct.toFixed(1)}%) headroom to 100°C datasheet B_sat. Transient load steps or flux walking may saturate the core.`
    : `Flux margin = +${(Bsat_100C_mT - Bpk_mT).toFixed(1)} mT (${fluxMargin_pct.toFixed(1)}% below 100°C datasheet B_sat; ${utilization_Tcore_pct.toFixed(1)}% utilization at T_core = ${Tcore_C.toFixed(1)}°C).`;

  const saturationCheck: SaturationCheckResult = {
    status: saturationStatus,
    exceedsDatasheetLimit,
    exceedsActiveTempLimit,
    exceedsRoomTempLimit,
    isNearKnee,
    Bpk_mT: Number(Bpk_mT.toFixed(1)),
    Bsat_100C_mT: Number(Bsat_100C_mT.toFixed(1)),
    Bsat_25C_mT: Number(Bsat_25C_mT.toFixed(1)),
    Bsat_at_Tcore_mT: Number(Bsat_at_Tcore_mT.toFixed(1)),
    Tcore_C: Number(Tcore_C.toFixed(1)),
    excess_100C_mT: Number(excess_100C_mT.toFixed(1)),
    excess_100C_pct: Number(excess_100C_pct.toFixed(1)),
    utilization_100C_pct: Number(utilization_100C_pct.toFixed(1)),
    utilization_Tcore_pct: Number(utilization_Tcore_pct.toFixed(1)),
    recommendedMinNp_turns,
    recommendedSafeNp_turns,
    recommendedCoreId: safeLargerCore ? safeLargerCore.id : null,
    recommendedCoreName: safeLargerCore ? safeLargerCore.name : null,
    recommendedMaterialId: higherBsatMat ? higherBsatMat.id : null,
    headline: saturationHeadline,
    detail: saturationDetail,
  };

  const Pcond_sec_W = Pcond_sec_ch_W + Pdt_body_sec_W + Prr_sec_W + Pgate_sec_W;
  const Ptotal_loss_W = Pcond_pri_W + Psw_pri_W + Pcond_sec_W + Pcore_W + Pcu_W + Psnub_W;
  const efficiency_pct = (Pout / (Pout + Ptotal_loss_W)) * 100;

  // Electro-Thermal Curve: Junction Temp Tj vs Heat Generated P_gen(Tj) & Heatsink Removal P_sink(Tj)
  const evalElectroThermal = (tj_C: number) => {
    const tjClamped = Math.max(-55, Math.min(300, tj_C));
    const gen = calcGateAndOverlap(Rg_ext_Ohm, tjClamped).pTotalPri;
    const sink =
      (Math.max(0, tjClamped - state.Tamb_C) / Math.max(0.05, Rth_pri_per_pos)) *
      (nPriSwitches * nPhases);
    return {
      y1: Number(gen.toFixed(2)),
      y2: Number(sink.toFixed(2)),
    };
  };

  const electroThermalCurve: SweepPoint[] = [];
  for (let i = 0; i <= 40; i++) {
    const tj = 0 + i * 5; // 0°C to 200°C
    const pt = evalElectroThermal(tj);
    electroThermalCurve.push({ x: tj, y1: pt.y1, y2: pt.y2 });
  }

  // Gate Resistance Rg_ext Sweep: Switching+Qrr Loss vs Peak Gate Current Ig,pk
  const evalGateLoss = (rg_Ohm: number) => {
    const rg = Math.max(0.2, rg_Ohm);
    const resRg = calcGateAndOverlap(rg, Tj_pri_C);
    const pSwAndRr = resRg.pSwOn + resRg.pSwOff + resRg.pRrPri + resRg.pGateTotal;
    return {
      y1: Number(pSwAndRr.toFixed(2)),
      y2: Number(resRg.ig_pk.toFixed(2)),
    };
  };

  const gateLossSweep: SweepPoint[] = [];
  for (let i = 1; i <= 40; i++) {
    const rg = 0.5 + i * 0.6; // 1.1 to 24.5 Ohm
    const pt = evalGateLoss(rg);
    gateLossSweep.push({ x: Number(rg.toFixed(1)), y1: pt.y1, y2: pt.y2 });
  }

  // ============================================================================
  // CONTROL LOOP SYNTHESIS + FIX 3 (EXACT TUSTIN BILINEAR PRE-WARPED 2P2Z/3P3Z)
  // ============================================================================
  const Rd_damping_Ohm = (4 * fsw * Llk) / (n * n * nPhases);
  const Rload_Ohm = Vout / Math.max(Iout_total_A, 0.5);
  const Rsense_Ohm = (state.Rsense_mOhm * 1e-3) / k_refl;
  const Resr_Ohm = Math.max(state.ESR_Co_mOhm * 1e-3, 0.5e-3);

  const Sf_downslope_V_us = (Vout / Lo) * Rsense_Ohm * 1e-6;
  const mc_slope = Math.max(1.0, state.slopeFactor_mc);
  const Se_ramp_V_us = (mc_slope - 1.0) * Sf_downslope_V_us;
  // Output inductor ripple cycles at 2*fsw with effective duty D_eff (so D' = 1 - D_eff for PSFB)
  const D_ind_pcmc = isLLC ? Deff_nom * 0.5 : Deff_nom;
  const D_prime = Math.max(0.05, 1 - D_ind_pcmc);
  const denom_Qp = Math.PI * (mc_slope * D_prime - 0.5);
  const Qp_subharmonic = denom_Qp > 0.04 ? 1 / denom_Qp : 12.0;
  const slopeStable = denom_Qp > 0.12 && Qp_subharmonic <= 2.0;

  // Worst-case low-line (Vin_min_V -> maximum D_eff) subharmonic stability check
  const D_ind_pcmc_wc = isLLC ? Deff_max * 0.5 : Deff_max;
  const D_prime_wc = Math.max(0.05, 1 - D_ind_pcmc_wc);
  const denom_Qp_wc = Math.PI * (mc_slope * D_prime_wc - 0.5);
  const Qp_subharmonic_wc = denom_Qp_wc > 0.04 ? 1 / denom_Qp_wc : 12.0;
  const slopeStable_wc = denom_Qp_wc > 0.12 && Qp_subharmonic_wc <= 2.0;
  const mc_min_hint = Math.max(1.5, (0.5 + 1 / (Math.PI * 1.25)) / D_prime);
  const mc_min_recommended = Number(Math.max(1.5, (0.5 + 1 / (Math.PI * 1.2)) / D_prime_wc).toFixed(2));

  const Q_charge_nC = ((Ipri_rms_A * Math.sqrt(2)) / (Math.PI * fsw)) * 1e9;
  const Vth_charge_V = (Q_charge_nC * 1e-9) / Cr;

  const fc_Hz = state.fc_target_kHz * 1e3;
  const wc = 2 * Math.PI * fc_Hz;
  const Lo_eq = Lo / nPhases;
  const f0_lc_Hz = 1 / (2 * Math.PI * Math.sqrt(Lo_eq * Co));
  const f0_lc_kHz = f0_lc_Hz / 1e3;
  const f0_wc_min_kHz = (1 / (2 * Math.PI * Math.sqrt(Lo_eq * 1.15 * (Co * 1.2)))) / 1e3;
  const f0_wc_max_kHz = (1 / (2 * Math.PI * Math.sqrt(Lo_eq * 0.85 * (Co * 0.8)))) / 1e3;

  const f_esr_Hz = 1 / (2 * Math.PI * Co * Resr_Ohm);
  const f_esr_kHz = f_esr_Hz / 1e3;
  const Ts_d = 1 / (state.fs_digital_kHz * 1e3);
  const Td_delay = 1.25 * Ts_d;

  const isCurrentOrChargeMode =
    state.controlType === 'pcmc' ||
    state.controlType === 'charge-control' ||
    state.controlType === 'mpc';

  const isTwoZeroComp =
    state.controlType === 'type-iii' ||
    state.controlType === 'acmc' ||
    state.controlType === 'cascaded-pi';

  const evalPlantCorner = (
    w: number,
    lScale = 1.0,
    cScale = 1.0
  ): { mag: number; phase_deg: number } => {
    const Lo_c = Lo_eq * lScale;
    const Co_c = Co * cScale;
    const w_esr = 1 / (Co_c * Resr_Ohm);
    const mag_esr = Math.sqrt(1 + Math.pow(w / w_esr, 2));
    const ph_esr = (Math.atan(w / w_esr) * 180) / Math.PI;

    if (isCurrentOrChargeMode) {
      const dcGain = (Rload_Ohm / Math.max(Rsense_Ohm, 0.01)) * 0.65;
      const w_p1 = 1 / (Rload_Ohm * Co_c);
      const mag1 = (dcGain * mag_esr) / Math.sqrt(1 + Math.pow(w / w_p1, 2));
      const ph1 = -((Math.atan(w / w_p1) * 180) / Math.PI) + ph_esr;

      const wn_sh = Math.PI * fsw;
      const q_eff = state.controlType === 'mpc' ? 0.707 : Math.max(Qp_subharmonic * lScale, 0.35);
      const re_sh = 1 - Math.pow(w / wn_sh, 2);
      const im_sh = w / (wn_sh * q_eff);
      const mag_sh = 1 / Math.sqrt(re_sh * re_sh + im_sh * im_sh);
      const ph_sh = (-Math.atan2(im_sh, re_sh) * 180) / Math.PI;

      return { mag: Math.max(mag1 * mag_sh, 1e-6), phase_deg: ph1 + ph_sh };
    } else {
      const dcGain = V_bridge / n;
      const wn = 1 / Math.sqrt(Lo_c * Co_c);
      const zeta = Math.max(
        0.1,
        0.5 *
          ((Rd_damping_Ohm + Resr_Ohm) * Math.sqrt(Co_c / Lo_c) +
            (1 / Rload_Ohm) * Math.sqrt(Lo_c / Co_c))
      );
      const re = 1 - Math.pow(w / wn, 2);
      const im = 2 * zeta * (w / wn);
      const mag_lc = (dcGain * mag_esr) / Math.sqrt(re * re + im * im);
      const ph_lc = (-Math.atan2(im, re) * 180) / Math.PI + ph_esr;

      const w_hf = Math.PI * fsw;
      const mag_hf = 1 / Math.sqrt(1 + Math.pow(w / w_hf, 2));
      const ph_hf = (-Math.atan(w / w_hf) * 180) / Math.PI;

      return { mag: Math.max(mag_lc * mag_hf, 1e-6), phase_deg: ph_lc + ph_hf };
    }
  };

  const plantAtWc = evalPlantCorner(wc, 1.0, 1.0);
  const delayDegAtWc = (-wc * Td_delay * 180) / Math.PI;
  const reqBoost_deg = state.pm_target_deg - (plantAtWc.phase_deg + delayDegAtWc) - 90;

  let fz1_kHz = 1.0;
  let fz2_kHz = 1.0;
  let fp1_kHz = 25.0;
  let fp2_kHz = 45.0;

  if (isTwoZeroComp) {
    const boostClamped = Math.max(25, Math.min(162, reqBoost_deg));
    const k_sqrt = Math.tan(((boostClamped / 4 + 45) * Math.PI) / 180);
    fz1_kHz = Math.max(0.15, (state.fc_target_kHz / k_sqrt) * 0.86);
    fz2_kHz = Math.max(0.2, (state.fc_target_kHz / k_sqrt) * 1.16);
    fp1_kHz = Math.min(state.fsw_kHz * 0.44, state.fc_target_kHz * k_sqrt * 0.9);
    fp2_kHz = Math.min(state.fsw_kHz * 0.49, state.fc_target_kHz * k_sqrt * 1.18);
  } else {
    const boostClamped = Math.max(15, Math.min(76, reqBoost_deg));
    const k2 = Math.tan(((boostClamped / 2 + 45) * Math.PI) / 180);
    fz1_kHz = Math.max(0.15, state.fc_target_kHz / k2);
    fz2_kHz = fz1_kHz;
    fp1_kHz = Math.min(state.fsw_kHz * 0.45, state.fc_target_kHz * k2);
    fp2_kHz = state.fsw_kHz * 0.49;
  }

  const wz1 = 2 * Math.PI * (fz1_kHz * 1e3);
  const wz2 = 2 * Math.PI * (fz2_kHz * 1e3);
  const wp1 = 2 * Math.PI * (fp1_kHz * 1e3);
  const wp2 = 2 * Math.PI * (fp2_kHz * 1e3);

  const calcCompUnscaled = (w: number): { mag: number; phase_deg: number } => {
    const m_z1 = Math.sqrt(1 + Math.pow(w / wz1, 2));
    const p_z1 = (Math.atan(w / wz1) * 180) / Math.PI;
    const m_p1 = Math.sqrt(1 + Math.pow(w / wp1, 2));
    const p_p1 = (Math.atan(w / wp1) * 180) / Math.PI;
    const ph_delay = (-w * Td_delay * 180) / Math.PI;

    if (isTwoZeroComp) {
      const m_z2 = Math.sqrt(1 + Math.pow(w / wz2, 2));
      const p_z2 = (Math.atan(w / wz2) * 180) / Math.PI;
      const m_p2 = Math.sqrt(1 + Math.pow(w / wp2, 2));
      const p_p2 = (Math.atan(w / wp2) * 180) / Math.PI;
      return {
        mag: (m_z1 * m_z2) / (w * m_p1 * m_p2),
        phase_deg: -90 + p_z1 + p_z2 - p_p1 - p_p2 + ph_delay,
      };
    } else {
      return {
        mag: m_z1 / (w * m_p1),
        phase_deg: -90 + p_z1 - p_p1 + ph_delay,
      };
    }
  };

  const compAtWc = calcCompUnscaled(wc);
  const Ki_ctrl = 1 / Math.max(plantAtWc.mag * compAtWc.mag, 1e-6);
  const Kp_ctrl = Ki_ctrl / wz1;

  // Analog Type-II / Type-III Op-Amp RC Network Synthesis with Automatic Impedance Scaling
  // Scales R & C inversely so poles/zeros (wz1, wp1, wz2, wp2) and gains (Kp, Ki) stay exact
  // while keeping R2 in practical E96 range (10–220 kOhm) and C1/C2 in stable C0G/NP0 range.
  const R1_base_Ohm = 10_000;
  const C2_base_F = 1 / (wp1 * Kp_ctrl * R1_base_Ohm);
  const C1_base_F = Math.max(1e-12, C2_base_F * Math.max(0.05, wp1 / wz1 - 1));
  const R2_base_Ohm = 1 / (wz1 * C1_base_F);
  const R3_base_Ohm = R1_base_Ohm / Math.max(wp2 / wz2 - 1, 1.2);
  const C3_base_F = 1 / (wp2 * R3_base_Ohm);

  const R1_min_Ohm = Vout > 120 ? 15_000 : 4_700;
  const idealImpedanceScale = 47_000 / Math.max(R2_base_Ohm, 1);
  const scaleMin = Math.max(
    0.47,
    10_000 / Math.max(R2_base_Ohm, 1),
    C1_base_F / 47e-9,
    R1_min_Ohm / R1_base_Ohm
  );
  const scaleMax = Math.min(
    470,
    220_000 / Math.max(R2_base_Ohm, 1),
    C2_base_F / 15e-12,
    4_700_000 / R1_base_Ohm
  );
  const impedanceScale =
    scaleMax >= scaleMin
      ? Math.min(scaleMax, Math.max(scaleMin, idealImpedanceScale))
      : Math.max(0.47, Math.min(470, scaleMax));

  const R1_Ohm = R1_base_Ohm * impedanceScale;
  const R2_Ohm = R2_base_Ohm * impedanceScale;
  const R3_Ohm = R3_base_Ohm * impedanceScale;
  const C1_F = C1_base_F / impedanceScale;
  const C2_F = C2_base_F / impedanceScale;
  const C3_F = C3_base_F / impedanceScale;

  const R1_kOhm = R1_Ohm / 1e3;
  const R2_kOhm = R2_Ohm / 1e3;
  const R3_kOhm = R3_Ohm / 1e3;
  const C1_nF = C1_F * 1e9;
  const C2_pF = C2_F * 1e12;
  const C3_nF = C3_F * 1e9;

  // ============================================================================
  // FIX 3: EXACT TUSTIN BILINEAR TRANSFORM s = (2/Ts)*(1 - z^-1)/(1 + z^-1)
  // Guarantees exact integrator pole at z = 1 (a1 + a2 + a3 === 1.00000)
  // ============================================================================
  const c_tustin = 2 / Ts_d;
  // Pre-warp poles & zeros inside Nyquist limit
  const prewarp = (w_target: number) => {
    const arg = Math.min(Math.PI * 0.47, (w_target * Ts_d) / 2);
    return (2 / Ts_d) * Math.tan(arg);
  };
  const wz1_pw = prewarp(wz1);
  const wz2_pw = prewarp(wz2);
  const wp1_pw = prewarp(wp1);
  const wp2_pw = prewarp(wp2);

  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let b3 = 0;
  let a1 = 0;
  let a2 = 0;
  let a3 = 0;

  if (!isTwoZeroComp) {
    // Exact 2P2Z (Type-II): Gc(s) = Ki * (1 + s/wz1) / [s * (1 + s/wp1)]
    const D0 = c_tustin * (1 + c_tustin / wp1_pw);
    const p1_pole = (c_tustin / wp1_pw - 1) / (c_tustin / wp1_pw + 1); // Stable pole in (-1, 1)
    a1 = 1 + p1_pole;
    a2 = -p1_pole;
    a3 = 0.0;

    const z1_term = c_tustin / wz1_pw;
    b0 = (Ki_ctrl * (1 + z1_term)) / D0;
    b1 = (Ki_ctrl * 2) / D0;
    b2 = (Ki_ctrl * (1 - z1_term)) / D0;
    b3 = 0.0;
  } else {
    // Exact 3P3Z (Type-III): Gc(s) = Ki * (1 + s/wz1)(1 + s/wz2) / [s * (1 + s/wp1)(1 + s/wp2)]
    const kp1 = c_tustin / wp1_pw;
    const kp2 = c_tustin / wp2_pw;
    const kz1 = c_tustin / wz1_pw;
    const kz2 = c_tustin / wz2_pw;

    const p1_z = (kp1 - 1) / (kp1 + 1);
    const p2_z = (kp2 - 1) / (kp2 + 1);
    // Denominator (1 - z^-1)(1 - p1_z*z^-1)(1 - p2_z*z^-1) = 1 - a1*z^-1 - a2*z^-2 - a3*z^-3
    // Note: a1 + a2 + a3 = (1 + p1_z + p2_z) - (p1_z + p2_z + p1_z*p2_z) + p1_z*p2_z === 1.00000!
    a1 = 1 + p1_z + p2_z;
    a2 = -(p1_z + p2_z + p1_z * p2_z);
    a3 = p1_z * p2_z;

    const D0_3p = c_tustin * (1 + kp1) * (1 + kp2);
    // Numerator Ki * (1 + z^-1) * [(1 + kz1) + (1 - kz1)z^-1] * [(1 + kz2) + (1 - kz2)z^-1] / D0_3p
    const u0 = 1 + kz1;
    const u1 = 1 - kz1;
    const v0 = 1 + kz2;
    const v1 = 1 - kz2;
    const q0 = u0 * v0;
    const q1 = u0 * v1 + u1 * v0;
    const q2 = u1 * v1;

    b0 = (Ki_ctrl * q0) / D0_3p;
    b1 = (Ki_ctrl * (q0 + q1)) / D0_3p;
    b2 = (Ki_ctrl * (q1 + q2)) / D0_3p;
    b3 = (Ki_ctrl * q2) / D0_3p;
  }

  // Bode Point Evaluator for arbitrary frequency f_Hz (used for both nominal sweep & dynamic zoom/pan)
  const corners = [
    { l: 0.85, c: 0.8 },
    { l: 0.85, c: 1.2 },
    { l: 1.15, c: 0.8 },
    { l: 1.15, c: 1.2 },
  ];

  const evalBodePoint = (f_Hz: number): BodePoint => {
    const f = Math.max(0.1, f_Hz);
    const w = 2 * Math.PI * f;
    const pEval = evalPlantCorner(w, 1.0, 1.0);
    const cEval = calcCompUnscaled(w);

    const plantMag_dB = 20 * Math.log10(Math.max(pEval.mag, 1e-6));
    const plantPhase_deg = pEval.phase_deg;

    const compMag = Ki_ctrl * cEval.mag;
    const compMag_dB = 20 * Math.log10(Math.max(compMag, 1e-6));
    const compPhase_deg = cEval.phase_deg;

    const loopMag_dB = plantMag_dB + compMag_dB;
    const loopPhase_deg = plantPhase_deg + compPhase_deg;

    let loopMagMin_dB = loopMag_dB;
    let loopMagMax_dB = loopMag_dB;
    let loopPhaseMin_deg = loopPhase_deg;
    let loopPhaseMax_deg = loopPhase_deg;

    for (const cr of corners) {
      const pCr = evalPlantCorner(w, cr.l, cr.c);
      const mCr = 20 * Math.log10(Math.max(pCr.mag, 1e-6)) + compMag_dB;
      const phCr = pCr.phase_deg + compPhase_deg;
      if (mCr < loopMagMin_dB) loopMagMin_dB = mCr;
      if (mCr > loopMagMax_dB) loopMagMax_dB = mCr;
      if (phCr < loopPhaseMin_deg) loopPhaseMin_deg = phCr;
      if (phCr > loopPhaseMax_deg) loopPhaseMax_deg = phCr;
    }

    return {
      freq_Hz: f,
      plantMag_dB,
      plantPhase_deg,
      compMag_dB,
      compPhase_deg,
      loopMag_dB,
      loopPhase_deg,
      loopMagMin_dB,
      loopMagMax_dB,
      loopPhaseMin_deg,
      loopPhaseMax_deg,
    };
  };

  const bodeData: BodePoint[] = [];
  let fc_actual_kHz = state.fc_target_kHz;
  let pm_actual_deg = state.pm_target_deg;
  let f_gm_kHz = state.fsw_kHz * 0.38;
  let gm_actual_dB = 14.5;
  let foundCrossover = false;
  let foundPhaseCross = false;

  for (let i = 0; i <= 85; i++) {
    const f = 20 * Math.pow((state.fsw_kHz * 1e3) / 20, i / 85);
    const pt = evalBodePoint(f);

    if (i > 0) {
      const prev = bodeData[i - 1];
      if (!foundCrossover && prev.loopMag_dB >= 0 && pt.loopMag_dB < 0) {
        const frac = prev.loopMag_dB / Math.max(prev.loopMag_dB - pt.loopMag_dB, 1e-5);
        const fCross = prev.freq_Hz + frac * (f - prev.freq_Hz);
        const phCross = prev.loopPhase_deg + frac * (pt.loopPhase_deg - prev.loopPhase_deg);
        fc_actual_kHz = fCross / 1e3;
        pm_actual_deg = 180 + phCross;
        foundCrossover = true;
      }
      if (!foundPhaseCross && prev.loopPhase_deg >= -180 && pt.loopPhase_deg < -180) {
        const frac = (prev.loopPhase_deg + 180) / Math.max(prev.loopPhase_deg - pt.loopPhase_deg, 1e-5);
        const fGm = prev.freq_Hz + frac * (f - prev.freq_Hz);
        const magAt180 = prev.loopMag_dB + frac * (pt.loopMag_dB - prev.loopMag_dB);
        f_gm_kHz = fGm / 1e3;
        gm_actual_dB = -magAt180;
        foundPhaseCross = true;
      }
    }
    bodeData.push(pt);
  }

  // Compute true worst-case crossover & phase margin across +/-15% L and +/-20% C corners
  let fc_wc_min_kHz = fc_actual_kHz * 0.82;
  let fc_wc_max_kHz = fc_actual_kHz * 1.22;
  let pm_wc_min_deg = pm_actual_deg;
  let pm_wc_max_deg = pm_actual_deg;

  let foundWcMinCross = false;
  let foundWcMaxCross = false;
  for (let i = 1; i < bodeData.length; i++) {
    const prev = bodeData[i - 1];
    const curr = bodeData[i];
    if (!foundWcMinCross && prev.loopMagMin_dB >= 0 && curr.loopMagMin_dB < 0) {
      const frac = prev.loopMagMin_dB / Math.max(prev.loopMagMin_dB - curr.loopMagMin_dB, 1e-5);
      fc_wc_min_kHz = (prev.freq_Hz + frac * (curr.freq_Hz - prev.freq_Hz)) / 1e3;
      const phMinCross = prev.loopPhaseMin_deg + frac * (curr.loopPhaseMin_deg - prev.loopPhaseMin_deg);
      pm_wc_min_deg = Math.max(5, 180 + phMinCross);
      foundWcMinCross = true;
    }
    if (!foundWcMaxCross && prev.loopMagMax_dB >= 0 && curr.loopMagMax_dB < 0) {
      const frac = prev.loopMagMax_dB / Math.max(prev.loopMagMax_dB - curr.loopMagMax_dB, 1e-5);
      fc_wc_max_kHz = (prev.freq_Hz + frac * (curr.freq_Hz - prev.freq_Hz)) / 1e3;
      const phMaxCross = prev.loopPhaseMax_deg + frac * (curr.loopPhaseMax_deg - prev.loopPhaseMax_deg);
      pm_wc_max_deg = Math.min(120, 180 + phMaxCross);
      foundWcMaxCross = true;
    }
  }
  if (!foundWcMinCross) pm_wc_min_deg = Math.max(5, pm_actual_deg - 8.5);
  if (!foundWcMaxCross) pm_wc_max_deg = pm_actual_deg + 6.5;
  pm_wc_min_deg = Math.min(pm_wc_min_deg, pm_actual_deg);
  pm_wc_max_deg = Math.max(pm_wc_max_deg, pm_actual_deg);

  // ============================================================================
  // MIDDLEBROOK INPUT EMI FILTER IMPEDANCE CRITERION
  // ============================================================================
  const R_in_neg_Ohm = (Vin * Vin) / Math.max(Pout * (efficiency_pct / 100), 10);
  const Zin_neg_dBOhm = 20 * Math.log10(Math.max(R_in_neg_Ohm, 0.1));

  const L_emi_H = 18e-6;
  const C_emi_F = 12e-6;
  const L_emi_uH = L_emi_H * 1e6;
  const C_emi_uF = C_emi_F * 1e6;
  const Rd_emi_Ohm = Math.sqrt(L_emi_H / C_emi_F) * 0.85;

  const evalMiddlebrook = (f_Hz: number) => {
    const f = Math.max(1, f_Hz);
    const w = 2 * Math.PI * f;
    const ratioFc = f / Math.max(fc_actual_kHz * 1e3, 100);
    const zIn_cl_Ohm =
      R_in_neg_Ohm * Math.sqrt((1 + Math.pow(ratioFc * 1.4, 2)) / (1 + Math.pow(ratioFc * 0.45, 2)));
    const zIn_dBOhm = 20 * Math.log10(Math.max(zIn_cl_Ohm, 0.05));

    const w0_emi = 1 / Math.sqrt(L_emi_H * C_emi_F);
    const q_emi = 1.65;
    const re_emi = 1 - Math.pow(w / w0_emi, 2);
    const im_emi = w / (w0_emi * q_emi);
    const zOut_emi_Ohm = (w * L_emi_H) / Math.sqrt(re_emi * re_emi + im_emi * im_emi);
    const zOut_dBOhm = 20 * Math.log10(Math.max(zOut_emi_Ohm, 0.01));

    return {
      y1: Number(zIn_dBOhm.toFixed(2)),
      y2: Number(zOut_dBOhm.toFixed(2)),
    };
  };

  const middlebrookSweep: SweepPoint[] = [];
  let Zout_emi_pk_dBOhm = -40;
  let middlebrookMargin_dB = 40;

  for (let i = 0; i <= 50; i++) {
    const f_Hz = 100 * Math.pow(100000 / 100, i / 50);
    const pt = evalMiddlebrook(f_Hz);
    if (pt.y2 > Zout_emi_pk_dBOhm) Zout_emi_pk_dBOhm = pt.y2;
    const gap = pt.y1 - pt.y2;
    if (gap < middlebrookMargin_dB) middlebrookMargin_dB = gap;

    middlebrookSweep.push({
      x: Number(f_Hz.toFixed(0)),
      y1: pt.y1,
      y2: pt.y2,
    });
  }
  const middlebrookStable = middlebrookMargin_dB >= 6.0;

  // Sweep 1: PSFB Llk Window OR LLC Gain M(fn) Curve
  const evalPrimarySweep = (xVal: number) => {
    if (!isLLC) {
      const l_uH = Math.max(0.1, xVal);
      const l_H = l_uH * 1e-6;
      const zvsRatio =
        ((0.5 * l_H * I_lag_turnoff_A * I_lag_turnoff_A * 1e6) / Math.max(E_oss_lag_uJ, 0.01)) * 100;
      const dLossPct = Math.min(95, ((4 * fsw * l_H * I_lag_turnoff_A) / V_bridge) * 100);
      return {
        y1: Number(Math.min(600, zvsRatio).toFixed(1)),
        y2: Number(dLossPct.toFixed(2)),
      };
    } else {
      const fn = Math.max(0.1, xVal);
      const fn2 = fn * fn;
      const calcM = (q: number) => {
        const re = 1 + (1 / Ln_ratio) * (1 - 1 / fn2);
        const im = q * (fn - 1 / fn);
        return 1 / Math.sqrt(re * re + im * im);
      };
      return {
        y1: Number(Math.min(4.5, calcM(Q_factor)).toFixed(3)),
        y2: Number(Math.min(4.5, calcM(Q_factor * 0.25)).toFixed(3)),
      };
    }
  };

  const primarySweep: SweepPoint[] = [];
  if (!isLLC) {
    const maxL = Math.max(35, state.Llk_uH * 2.2);
    for (let i = 1; i <= 45; i++) {
      const l_uH = Number(((maxL * i) / 45).toFixed(2));
      const pt = evalPrimarySweep(l_uH);
      primarySweep.push({ x: l_uH, y1: pt.y1, y2: pt.y2 });
    }
  } else {
    for (let i = 0; i <= 50; i++) {
      const fn = Number((0.45 + (1.35 * i) / 50).toFixed(3));
      const pt = evalPrimarySweep(fn);
      primarySweep.push({ x: fn, y1: pt.y1, y2: pt.y2 });
    }
  }

  // Sweep 2: Efficiency vs Load (Sync FET vs Diode Rectifier Comparison)
  const evalEfficiency = (loadPct: number) => {
    const k = Math.max(0.02, loadPct / 100);
    const pLoad = Pout * k;
    // Account for lagging-leg ZVS loss at light load
    const iLagAtLoad = I_lag_turnoff_A * k;
    const eAvailAtLoad = 0.5 * Llk * iLagAtLoad * iLagAtLoad * 1e6;
    const lightLoadHardPenalty =
      eAvailAtLoad >= E_oss_lag_uJ
        ? 0
        : (1 - eAvailAtLoad / Math.max(E_oss_lag_uJ, 0.01)) * (2 * fsw * (E_oss_lag_uJ * 1e-6) * nPhases);

    const pFixed = Pcore_W + Psnub_W * 0.7 + Pgate_pri_W + Poss_hyst_pri_W + lightLoadHardPenalty;
    const pQuadSync =
      (Pcond_pri_W + Pcu_W + (Psw_on_pri_W + Psw_off_pri_W + Pdt_body_pri_W + Prr_pri_W) * 0.85) * k * k;
    const rdsSec = Rds_sec_actual_mOhm * 1e-3;
    const pSecSync =
      (nSecDevices * Math.pow(Isec_rms_per_dev_A * k, 2) * rdsSec +
        (Pdt_body_sec_W + Prr_sec_W) * k +
        Pgate_sec_W) *
      nPhases;
    const pSecDiode =
      nSecDevices *
      (0.85 * (Iout_phase_A * k * 0.5) + Math.pow(Isec_rms_per_dev_A * k, 2) * 0.014) *
      nPhases;

    const effSync = (pLoad / (pLoad + pFixed + pQuadSync + pSecSync)) * 100;
    const effDiode = (pLoad / (pLoad + pFixed + pQuadSync + pSecDiode)) * 100;

    return {
      y1: Number((state.rectMode === 'sync-fet' ? effSync : effDiode).toFixed(2)),
      y2: Number((state.rectMode === 'sync-fet' ? effDiode : effSync).toFixed(2)),
    };
  };

  const efficiencySweep: SweepPoint[] = [];
  for (let i = 1; i <= 20; i++) {
    const loadPct = i * 5;
    const pt = evalEfficiency(loadPct);
    efficiencySweep.push({ x: loadPct, y1: pt.y1, y2: pt.y2 });
  }

  // Sweep 3: PCMC Subharmonic Qp vs Output Inductor Duty D (Selected mc vs Uncompensated mc=1)
  const evalSlope = (dVal: number) => {
    const d = Math.max(0.02, Math.min(0.95, dVal));
    const dp = Math.max(0.05, 1 - d);
    const qComp = 1 / Math.max(0.08, Math.PI * (mc_slope * dp - 0.5));
    const qUncomp = 1 / Math.max(0.08, Math.PI * (1.0 * dp - 0.5));
    return {
      y1: Number(Math.min(10, qComp).toFixed(2)),
      y2: Number(Math.min(10, qUncomp).toFixed(2)),
    };
  };

  const slopeSweep: SweepPoint[] = [];
  for (let i = 1; i <= 40; i++) {
    const d = Number((0.15 + (0.75 * i) / 40).toFixed(2));
    const pt = evalSlope(d);
    slopeSweep.push({ x: d, y1: pt.y1, y2: pt.y2 });
  }

  // Waveforms (supports multi-cycle evaluation when zoomed out)
  const T_us = Tsw * 1e6;
  const evalWaveforms = (t_us: number) => {
    const tau = ((t_us / Math.max(T_us, 1e-3)) % 1 + 1) % 1;
    const halfTau = tau % 0.5;
    const sign = tau < 0.5 ? 1 : -1;
    const dHalf = (Deff_nom / 2) * 0.5;
    const active = halfTau > Dloss_nom * 0.25 && halfTau < dHalf + Dloss_nom * 0.25;

    const i_pri_A = isLLC
      ? Ipri_rms_A * Math.sqrt(2) * Math.sin(2 * Math.PI * tau)
      : sign * (Iout_phase_A * k_refl + deltaILo_phase_A * k_refl * (halfTau / 0.25 - 0.5));
    const i_lo_A =
      Iout_phase_A + deltaILo_phase_A * (active ? halfTau / Math.max(dHalf, 0.05) - 0.5 : 0.5 - halfTau);
    return {
      y1: Number(i_pri_A.toFixed(2)),
      y2: Number(i_lo_A.toFixed(2)),
    };
  };

  const waveforms: WaveformPoint[] = [];
  for (let i = 0; i <= 80; i++) {
    const tau = i / 80;
    const t_us = Number((tau * T_us).toFixed(2));
    const halfTau = tau % 0.5;
    const sign = tau < 0.5 ? 1 : -1;
    const dHalf = (Deff_nom / 2) * 0.5;
    const active = halfTau > Dloss_nom * 0.25 && halfTau < dHalf + Dloss_nom * 0.25;
    const v_pri_V = isLLC ? sign * V_bridge : active ? sign * V_bridge : 0;
    const v_sec_V = active || isLLC ? Vsec_ideal_pk_V : 0;
    const pt = evalWaveforms(t_us);

    waveforms.push({
      t_us,
      v_pri_V: Number(v_pri_V.toFixed(1)),
      i_pri_A: pt.y1,
      v_sec_V: Number(v_sec_V.toFixed(1)),
      i_lo_A: pt.y2,
    });
  }

  // DSP Code Snippet with Exact Pre-Warped Tustin Coefficients
  const dspCode = isTwoZeroComp
    ? `// ${state.topology.toUpperCase()} | ${state.controlType.toUpperCase()} (Type-III / Digital 3P3Z) ISR @ fs = ${state.fs_digital_kHz} kHz
// Zeros: fz1=${fz1_kHz.toFixed(2)}kHz, fz2=${fz2_kHz.toFixed(2)}kHz | Poles: fp1=${fp1_kHz.toFixed(2)}kHz, fp2=${fp2_kHz.toFixed(2)}kHz
// Analog Type-III Op-Amp RC (C0G): R1=${R1_kOhm.toFixed(1)}k, R2=${R2_kOhm.toFixed(2)}k, R3=${R3_kOhm.toFixed(2)}k, C1=${C1_nF.toFixed(2)}nF, C2=${C2_pF.toFixed(0)}pF, C3=${C3_nF.toFixed(2)}nF
// Exact Tustin 3P3Z (sum(a_k) = ${(a1 + a2 + a3).toFixed(5)}): b0=${b0.toFixed(5)}f, b1=${b1.toFixed(5)}f, b2=${b2.toFixed(5)}f, b3=${b3.toFixed(5)}f | a1=${a1.toFixed(5)}f, a2=${a2.toFixed(5)}f, a3=${a3.toFixed(5)}f
inline void DcDc_3P3Z_ISR(float v_out_adc) {
    float e0 = ${Vout.toFixed(1)}f - v_out_adc;
    float u0 = a1*u1 + a2*u2 + a3*u3 + b0*e0 + b1*e1 + b2*e2 + b3*e3;
    u3 = u2; u2 = u1; u1 = CLAMP(u0, 0.05f, 0.95f);
    e3 = e2; e2 = e1; e1 = e0;
    EPWM_setPhaseShift(PHASE_SHIFT_BASE, (uint16_t)(u1 * TBPRD));
}`
    : `// ${state.topology.toUpperCase()} | ${state.controlType.toUpperCase()} (Type-II / Exact Tustin 2P2Z) ISR @ fs = ${state.fs_digital_kHz} kHz
// Zero: fz1=${fz1_kHz.toFixed(2)}kHz | Pole: fp1=${fp1_kHz.toFixed(2)}kHz | Analog RC (C0G): R1=${R1_kOhm.toFixed(1)}k, R2=${R2_kOhm.toFixed(2)}k, C1=${C1_nF.toFixed(2)}nF, C2=${C2_pF.toFixed(0)}pF
// b0=${b0.toFixed(5)}f, b1=${b1.toFixed(5)}f, b2=${b2.toFixed(5)}f | a1=${a1.toFixed(5)}f, a2=${a2.toFixed(5)}f (a1+a2 = ${(a1 + a2).toFixed(5)})${
        state.controlType === 'pcmc'
          ? `\n// PCMC Slope Ramp: Se = ${Se_ramp_V_us.toFixed(3)} V/us (mc = ${mc_slope.toFixed(2)}, Qp_nom = ${Qp_subharmonic.toFixed(2)}, Qp_wc = ${Qp_subharmonic_wc.toFixed(2)})`
          : state.controlType === 'charge-control'
          ? `\n// Charge Control Integrator Threshold: Q_chg = ${Q_charge_nC.toFixed(1)} nC, V_th = ${Vth_charge_V.toFixed(2)} V`
          : ''
      }
inline void DcDc_Control_ISR(float v_out_adc, float i_pri_adc) {
    float e0 = ${Vout.toFixed(1)}f - v_out_adc;
    float u0 = a1*u1 + a2*u2 + b0*e0 + b1*e1 + b2*e2;
    u2 = u1; u1 = CLAMP(u0, 0.05f, 0.95f); e2 = e1; e1 = e0;
    ${
      state.controlType === 'pcmc'
        ? `CMPSS_setDACValueHigh(u1 * DAC_SCALE); // Peak current reference + Hardware Ramp Se`
        : state.controlType === 'charge-control'
        ? `CMPSS_setChargeThreshold(u1 * ${Vth_charge_V.toFixed(2)}f); // Resonant Cr Charge Threshold`
        : `EPWM_setPhaseShift(PHASE_SHIFT_BASE, (uint16_t)(u1 * TBPRD));`
    }
}`;

  const warnings: { severity: 'error' | 'warn' | 'ok'; text: string }[] = [];
  if (!zvsAchieved) {
    warnings.push({
      severity: 'warn',
      text: `Incomplete Lagging-Leg ZVS (${zvsEnergyRatio_pct.toFixed(0)}% energy, Vds,res = ${Vds_res_lag_V.toFixed(0)} V): Increase L_lk ≥ ${Llk_crit_fullLoad_uH.toFixed(1)} µH.`,
    });
  } else {
    warnings.push({
      severity: 'ok',
      text: `ZVS Verified on Leading & Lagging Legs (${zvsEnergyRatio_pct.toFixed(0)}% tank energy margin, t_dead,min = ${t_dead_min_ns.toFixed(0)} ns).`,
    });
  }
  if (!thermalStable) {
    warnings.push({
      severity: 'error',
      text: `Electro-Thermal Warning: Tj,pri = ${Tj_pri_C.toFixed(1)}°C (Thermal Loop Gain = ${thermalLoopGain.toFixed(2)}). Reduce Rth,SA or add parallel MOSFETs.`,
    });
  }
  if (state.controlType === 'pcmc' && !slopeStable) {
    warnings.push({
      severity: 'error',
      text: `PCMC Subharmonic Peaking (Qp = ${Qp_subharmonic.toFixed(2)}): Increase slope factor m_c ≥ ${mc_min_hint.toFixed(2)}.`,
    });
  }
  if (Vsec_overshoot_V > secDevice.Vds_max_V * 0.9) {
    warnings.push({
      severity: 'error',
      text: `Secondary V_pk (${Vsec_overshoot_V.toFixed(1)} V) exceeds 90% of ${secDevice.name} (${secDevice.Vds_max_V} V).`,
    });
  }
  if (saturationCheck.status === 'critical') {
    warnings.push({
      severity: 'error',
      text: `${saturationCheck.headline}. Increase Np ≥ ${saturationCheck.recommendedMinNp_turns}T${
        saturationCheck.recommendedCoreName ? ` or upgrade core to ${saturationCheck.recommendedCoreName}` : ''
      }.`,
    });
  } else if (saturationCheck.status === 'warning') {
    warnings.push({
      severity: 'warn',
      text: `${saturationCheck.headline}. Consider increasing Np ≥ ${saturationCheck.recommendedMinNp_turns}T for ≥20% flux headroom.`,
    });
  }

  return {
    state,
    core,
    material,
    priDevice,
    secDevice,
    nPhases,
    isLLC,
    Iout_total_A,
    Iout_phase_A,
    Deff_nom,
    Dloss_nom,
    D_applied_nom,
    Deff_max,
    Dloss_max,
    D_applied_max,
    phaseShift_deg,
    M_gain_nom,
    fr_kHz,
    fm_kHz,
    fn_nom,
    Q_factor,
    Ln_ratio,
    E_oss_lag_uJ,
    E_lk_avail_uJ,
    E_lead_avail_uJ,
    zvsEnergyRatio_pct,
    I_zvs_min_A,
    I_lag_turnoff_A,
    I_lead_turnoff_A,
    zvsAchieved,
    zvsLeadAchieved,
    Vds_res_lag_V,
    t_dead_min_ns,
    t_dead_opt_ns,
    P_min_zvs_pct,
    Llk_crit_fullLoad_uH,
    Llk_crit_halfLoad_uH,
    Llk_opt_35pct_uH,
    Llk_max_duty_uH,
    Vsec_ideal_pk_V,
    Vsec_ideal_max_V,
    Vsec_ringing_delta_V,
    Vsec_overshoot_V,
    Vsec_unclamped_pk_V,
    f_ring_MHz,
    Z0_ring_Ohm,
    Isec_rms_per_dev_A,
    Vf_rect_drop_V,
    Cclamp_nF,
    Rsnub_Ohm,
    Csnub_pF,
    Psnub_W,
    fRipple_out_kHz,
    deltaILo_phase_A,
    deltaIout_net_A,
    rippleCancel_K,
    Vout_ripple_mVpp,
    ICo_rms_A,
    Np_actual,
    Ns_actual,
    Bpk_mT,
    fluxMargin_pct,
    Im_pk_A,
    H_pk_Am,
    mu_e_actual,
    airGap_mm,
    Isat_80pct_A,
    Isat_90pct_A,
    Lm_at_Im_pk_uH,
    voltSec_applied_Vus,
    voltSec_max_Vus,
    skinDepth_mm,
    Fr_dowell_pri,
    Fr_dowell_sec,
    Cww_pF,
    Rpri_ac_mOhm,
    Rsec_ac_mOhm,
    windowFill_pct,
    Llk_geom_uH,
    ki_igse,
    Pcore_se_W,
    Pcore_igse_W,
    Rg_ext_Ohm,
    Rg_int_pri_Ohm,
    kelvinSourceActive,
    Ls_common_nH,
    Psw_kelvin_saved_W,
    Rds_pri_actual_mOhm,
    Rds_sec_actual_mOhm,
    Pcond_pri_W,
    Pcond_pri_125C_W,
    Psw_on_pri_W,
    Psw_off_pri_W,
    Poss_hyst_pri_W,
    Pdt_body_pri_W,
    Prr_pri_W,
    Pgate_pri_W,
    Pgate_ext_pri_W,
    Pgate_int_pri_W,
    Ig_pk_pri_A,
    Psw_pri_W,
    Pcond_sec_ch_W,
    Pdt_body_sec_W,
    Prr_sec_W,
    Pgate_sec_W,
    Pcond_sec_W,
    Qrr_pri_hot_nC,
    Qrr_sec_hot_nC,
    Pcore_W,
    Pcu_W,
    Ptotal_loss_W,
    efficiency_pct,
    Tj_pri_C,
    Tj_sec_C,
    Tcase_pri_C,
    Tsink_pri_C,
    Tcase_sec_C,
    Tsink_sec_C,
    Rth_TIM_CW,
    Rth_TIM_sec_CW,
    Tj_max_limit_C,
    Pcond_pri_25C_W,
    Psw_pri_25C_W,
    Pcond_sec_25C_W,
    Pout_derated_max_W,
    Id_pri_derated_max_A,
    Rth_hs_crit_CW,
    Tcore_C,
    thermalLoopGain,
    thermalStable,
    deviceBenchmarks,
    Rd_damping_Ohm,
    Sf_downslope_V_us,
    Se_ramp_V_us,
    mc_slope,
    Qp_subharmonic,
    slopeStable,
    Qp_subharmonic_wc,
    slopeStable_wc,
    mc_min_recommended,
    isTwoZeroComp,
    f0_lc_kHz,
    f0_wc_min_kHz,
    f0_wc_max_kHz,
    f_esr_kHz,
    fc_actual_kHz,
    fc_wc_min_kHz,
    fc_wc_max_kHz,
    pm_actual_deg,
    pm_wc_min_deg,
    pm_wc_max_deg,
    f_gm_kHz,
    gm_actual_dB,
    fz1_kHz,
    fz2_kHz,
    fp1_kHz,
    fp2_kHz,
    Kp_ctrl,
    Ki_ctrl,
    b0,
    b1,
    b2,
    b3,
    a1,
    a2,
    a3,
    R1_kOhm,
    R2_kOhm,
    R3_kOhm,
    C1_nF,
    C2_pF,
    C3_nF,
    Q_charge_nC,
    Vth_charge_V,
    L_emi_uH,
    C_emi_uF,
    Rd_emi_Ohm,
    Zin_neg_dBOhm,
    Zout_emi_pk_dBOhm,
    middlebrookMargin_dB,
    middlebrookStable,
    dspCode,
    primarySweep,
    efficiencySweep,
    bodeData,
    slopeSweep,
    igseSweep,
    dowellSweep,
    ringingSweep,
    middlebrookSweep,
    electroThermalCurve,
    gateLossSweep,
    zvsLoadSweep,
    saturationCurve,
    bhLoopAnalysis,
    coreThermalAnalysis,
    saturationCheck,
    waveforms,
    evaluators: {
      evalPrimarySweep,
      evalEfficiency,
      evalSaturationB: (im_A: number) => {
        const s = evalSatAtIm(im_A);
        return { y1: s.B_100C_mT, y2: s.B_25C_mT };
      },
      evalSaturationLm: (im_A: number) => {
        const s = evalSatAtIm(im_A);
        return { y1: s.Lm_inc_uH, y2: s.H_Am };
      },
      evalWaveforms,
      evalSlope,
      evalIgse: (d: number) => {
        const c = calcIgseCoreLossW(d, tempFactor_F);
        return { y1: Number(c.pIgse.toFixed(2)), y2: Number(c.pSe.toFixed(2)) };
      },
      evalDowell,
      evalRinging,
      evalMiddlebrook,
      evalElectroThermal,
      evalGateLoss,
      evalZvsLoad,
      evalBodePoint,
      evalCoreLossFreq,
      evalCoreLossFlux,
      evalCoreTempEquilibrium,
    },
    warnings,
  };
}


