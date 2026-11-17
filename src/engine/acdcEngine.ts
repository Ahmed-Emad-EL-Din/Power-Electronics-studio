import {
  AcDcDesignState,
  SEMICONDUCTOR_DATABASE,
  SemiconductorSpec,
} from '../data/databases';

export interface AcDcLineAnglePoint {
  theta_deg: number;
  v_ac_V: number;
  duty: number;
  i_ac_total_A: number;
  i_phase_A: number;
  dIL_1ph_A: number;
  dI_in_2ph_A: number;
  k_cancel: number;
}

export interface AcDcBodePoint {
  freq_Hz: number;
  iLoopMag_dB: number;
  iLoopPhase_deg: number;
  vLoopMag_dB: number;
  vLoopPhase_deg: number;
}

export interface AcDcHoldUpPoint {
  Cdc_uF: number;
  v_ripple_2f_Vpp: number;
  t_hold_ms: number;
  ICdc_rms_A: number;
}

export interface AcDcEquationRow {
  symbol: string;
  symbolTex: string;
  name: string;
  formula: string;
  formulaTex: string;
  value: string;
  status: 'ok' | 'warn';
}

export interface AcDcHarmonicPoint {
  order: number;
  freq_Hz: number;
  In_rms_A: number;
  In_pct: number;
  iecLimit_A: number;
  pass: boolean;
}

export interface AcDcZeroCrossingPoint {
  theta_deg: number;
  i_ideal_A: number;
  i_unmitigated_A: number;
  i_softStart_A: number;
}

export interface AcDcDcBiasPoint {
  Idc_A: number;
  H_Oe: number;
  L_koolMu_uH: number;
  L_highFlux_uH: number;
  L_ferrite_uH: number;
  mu_koolMu_pct: number;
  mu_highFlux_pct: number;
}

export interface AcDcInrushPoint {
  time_ms: number;
  Vdc_precharge_V: number;
  I_precharge_A: number;
  I_unmitigated_A: number;
}

export interface AcDcEmiPoint {
  freq_MHz: number;
  freq_label: string;
  unfiltered_dBuV: number;
  filtered_dBuV: number;
  cisprQP_dBuV: number;
  cisprAvg_dBuV: number;
}

export interface AcDcEfficiencyPoint {
  load_pct: number;
  Pout_kW: number;
  eff_highLine_pct: number;
  eff_lowLine_pct: number;
  eff_phaseShed_pct: number;
  Ploss_highLine_W: number;
  Ploss_lowLine_W: number;
}

export interface AcDcResults {
  state: AcDcDesignState;
  sw: SemiconductorSpec;
  nPhases: number;

  // Electrical KPIs
  Iin_rms_A: number;
  Iac_rms_nom_A: number;
  Iac_rms_max_A: number;
  Iac_pk_nom_A: number;
  Iph_rms_A: number;
  Iph_pk_A: number;
  D_at_peak: number;
  deltaIL_ph_max_A: number;
  deltaIin_net_max_A: number;
  dIL_ph_max_A: number;
  dIin_net_max_A: number;
  rippleCancel_peak: number;
  rippleCancelMax_pct: number;
  theta_zeroRipple1_deg: number;
  Lpfc_crit_CCM_uH: number;

  // DC Bus Bulk Cap KPIs & Lifetime
  Cdc_req_hold_uF: number;
  Cdc_req_holdup_uF: number;
  Cdc_req_ripple_uF: number;
  Vdc_ripple_pp_V: number;
  Vbus_2f_ripple_Vpp: number;
  tHold_actual_ms: number;
  ICdc_lf_rms_A: number;
  ICdc_hf_rms_A: number;
  ICdc_rms_A: number;
  ICdc_total_rms_A: number;
  ICdc_freq_weighted_100Hz_A: number;
  capTempRise_C: number;
  capHotspot_C: number;
  capLife_hours: number;
  capLife_years: number;
  capBankParallelCount: number;

  // Loss & Efficiency Breakdown
  Pcond_fast_W: number;
  Pcond_slow_W: number;
  Pcond_sw_W: number;
  Psw_total_W: number;
  Pgate_W: number;
  Prr_W: number;
  Tj_fast_C: number;
  Pind_cu_W: number;
  Pind_core_W: number;
  Pind_total_W: number;
  Pcap_W: number;
  Ptotal_loss_W: number;
  efficiency_pct: number;
  efficiency_lowLine_pct: number;
  THDi_est_pct: number;
  THD_est_pct: number;
  powerFactor_true: number;
  displacementPF: number;
  distortionPF: number;
  zcdSpike_A: number;

  // Boost Inductor Magnetics & DC-Bias
  N_pfc_turns: number;
  Hdc_pk_Oe: number;
  Bdc_pk_T: number;
  deltaB_max_T: number;
  Bpk_total_T: number;
  L_at_peak_koolMu_uH: number;
  L_at_peak_highFlux_uH: number;
  inductanceRollOff_pct: number;
  Tcore_pfc_C: number;
  saturationCheck: {
    status: 'critical' | 'warning' | 'ok';
    exceedsKoolMuLimit: boolean;
    exceedsHighFluxLimit: boolean;
    exceedsFerriteLimit: boolean;
    Bpk_total_T: number;
    Bsat_koolMu_T: number;
    Bsat_highFlux_T: number;
    Bsat_ferrite_T: number;
    utilization_koolMu_pct: number;
    excess_koolMu_T: number;
    headline: string;
    detail: string;
  };

  // Inrush Current & Pre-Charge Relay Synthesis
  inrushEnergy_J: number;
  Iinrush_unmitigated_pk_A: number;
  R_precharge_Ohm: number;
  Iinrush_precharge_pk_A: number;
  I2t_precharge_A2s: number;
  t_relay_bypass_ms: number;

  // AC-Side EMI Filter & Safety Leakage
  f_emi_fundamental_kHz: number;
  Vdm_unfiltered_dBuV: number;
  RequiredAtt_dB: number;
  fc_dm_kHz: number;
  Cx_each_uF: number;
  Ldm_uH: number;
  Cy_each_nF: number;
  Lcm_mH: number;
  earthLeakage_mA: number;
  R_bleed_kOhm: number;

  // Control Loop Synthesis (ACMC / Cascaded PI / 2P2Z / MPC)
  fc_i_actual_kHz: number;
  Kp_i: number;
  Ki_i: number;
  fz_i_kHz: number;
  fp_i_kHz: number;
  pm_i_actual_deg: number;
  gm_i_dB: number;

  fc_v_actual_Hz: number;
  Kp_v: number;
  Ki_v: number;
  fz_v_Hz: number;
  fp_v_Hz: number;
  pm_v_actual_deg: number;

  // Digital 2P2Z Coefficients (b0, b1, b2, a1, a2)
  b0_i: number;
  b1_i: number;
  b2_i: number;
  a1_i: number;
  a2_i: number;

  dspCode: string;
  dspCodeSnippet: string;

  // Curves
  rippleCurve: {
    theta_deg: number;
    deltaIL_ph_A: number;
    deltaIin_net_A: number;
  }[];
  lineAngleCurve: AcDcLineAnglePoint[];
  bodeInner: {
    freq_Hz: number;
    mag_dB: number;
    phase_deg: number;
  }[];
  bodeOuter: {
    freq_Hz: number;
    mag_dB: number;
    phase_deg: number;
  }[];
  bodeCurve: AcDcBodePoint[];
  holdUpCurve: {
    Cdc_uF: number;
    v_ripple_2f_Vpp: number;
    t_hold_ms: number;
    tHold_ms: number;
    Vripple_pp_V: number;
    ICdc_rms_A: number;
  }[];
  harmonicSpectrum: AcDcHarmonicPoint[];
  zeroCrossingCurve: AcDcZeroCrossingPoint[];
  dcBiasCurve: AcDcDcBiasPoint[];
  inrushCurve: AcDcInrushPoint[];
  emiSpectrumCurve: AcDcEmiPoint[];
  efficiencyLoadCurve: AcDcEfficiencyPoint[];
  equations: AcDcEquationRow[];

  evaluators: {
    evalRipple: (theta_deg: number) => { y1: number; y2: number };
    evalHoldUp: (Cdc_uF: number) => { y1: number; y2: number };
    evalBodeInner: (f_Hz: number) => { y1: number; y2: number };
    evalBodeOuter: (f_Hz: number) => { y1: number; y2: number };
  };
}

export function solveAcDcDesign(state: AcDcDesignState): AcDcResults {
  const sw =
    SEMICONDUCTOR_DATABASE.find((d) => d.id === state.fastSwitchId) ||
    SEMICONDUCTOR_DATABASE[0];

  const isInterleaved2Ph =
    state.topology === '2ph-interleaved-totem' || state.topology === '2ph-interleaved-boost';
  const nPhases = isInterleaved2Ph ? 2 : 1;
  const fsw_Hz = state.fsw_kHz * 1e3;
  const Lpfc_H = state.Lpfc_uH * 1e-6;
  const Cdc_F = state.Cdc_uF * 1e-6;
  const w_line = 2 * Math.PI * state.f_line_Hz;

  const eff_est = 0.982;
  const Pin_W = state.Pout_W / eff_est;
  const Iac_rms_nom_A = Pin_W / state.Vac_rms_V;
  const Iac_rms_max_A = Pin_W / state.Vac_min_V;
  const Iac_pk_nom_A = Iac_rms_nom_A * Math.sqrt(2);

  const Iph_rms_A = Iac_rms_nom_A / nPhases;
  const Iph_pk_A = Iac_pk_nom_A / nPhases;

  const evalRipple = (deg: number) => {
    const rad = (deg * Math.PI) / 180;
    const s = Math.abs(Math.sin(rad));
    const v_ac_V = state.Vac_rms_V * Math.sqrt(2) * s;
    const duty = Math.max(0.02, Math.min(0.98, 1 - v_ac_V / state.Vdc_bus_V));
    const dIL_1ph_A = (state.Vdc_bus_V * duty * (1 - duty)) / (fsw_Hz * Lpfc_H);
    const k_cancel =
      nPhases === 2
        ? Math.abs(1 - 2 * duty) / Math.max(duty, 1 - duty)
        : 1.0;
    const dI_in_2ph_A = nPhases === 2 ? dIL_1ph_A * k_cancel : dIL_1ph_A;
    return {
      y1: Number(dIL_1ph_A.toFixed(3)),
      y2: Number(dI_in_2ph_A.toFixed(3)),
    };
  };

  // Line-angle sweep [0..180 deg]
  const lineAngleCurve: AcDcLineAnglePoint[] = [];
  let dIL_ph_max_A = 0;
  let dIin_net_max_A = 0;

  for (let deg = 0; deg <= 180; deg += 3) {
    const rad = (deg * Math.PI) / 180;
    const s = Math.sin(rad);
    const v_ac_V = state.Vac_rms_V * Math.sqrt(2) * s;
    const duty = Math.max(0.02, Math.min(0.98, 1 - v_ac_V / state.Vdc_bus_V));
    const i_ac_total_A = Iac_pk_nom_A * s;
    const i_phase_A = i_ac_total_A / nPhases;

    const { y1: dIL_1ph_A, y2: dI_in_2ph_A } = evalRipple(deg);
    const k_cancel =
      nPhases === 2
        ? Math.abs(1 - 2 * duty) / Math.max(duty, 1 - duty)
        : 1.0;

    if (dIL_1ph_A > dIL_ph_max_A) dIL_ph_max_A = dIL_1ph_A;
    if (dI_in_2ph_A > dIin_net_max_A) dIin_net_max_A = dI_in_2ph_A;

    lineAngleCurve.push({
      theta_deg: deg,
      v_ac_V: Number(v_ac_V.toFixed(1)),
      duty: Number(duty.toFixed(3)),
      i_ac_total_A: Number(i_ac_total_A.toFixed(2)),
      i_phase_A: Number(i_phase_A.toFixed(2)),
      dIL_1ph_A: Number(dIL_1ph_A.toFixed(2)),
      dI_in_2ph_A: Number(dI_in_2ph_A.toFixed(2)),
      k_cancel: Number(k_cancel.toFixed(3)),
    });
  }

  const rippleCancelMax_pct =
    nPhases === 2
      ? ((dIL_ph_max_A - dIin_net_max_A) / Math.max(0.01, dIL_ph_max_A)) * 100
      : 0;

  const sinZero = Math.min(1, (0.5 * state.Vdc_bus_V) / (state.Vac_rms_V * Math.sqrt(2)));
  const theta_zeroRipple1_deg = (Math.asin(sinZero) * 180) / Math.PI;

  const D_at_pk = Math.max(0.05, 1 - (state.Vac_rms_V * Math.sqrt(2)) / state.Vdc_bus_V);
  const Lpfc_crit_CCM_uH =
    ((state.Vdc_bus_V * D_at_pk * (1 - D_at_pk)) / (2 * fsw_Hz * (0.2 * Iph_pk_A))) * 1e6;

  // ============================================================================
  // DC-Link Bulk Capacitor Hold-Up, Dual-Frequency Ripple & Lifetime Synthesis
  // ============================================================================
  const Cdc_req_holdup_uF =
    ((2 * state.Pout_W * (state.tHold_ms * 1e-3)) /
      Math.max(10, state.Vdc_bus_V * state.Vdc_bus_V - state.Vdc_min_hold_V * state.Vdc_min_hold_V)) *
    1e6;

  const Vbus_2f_ripple_Vpp = state.Pout_W / (w_line * state.Vdc_bus_V * Cdc_F);
  const Cdc_req_ripple_uF =
    (state.Pout_W / (w_line * state.Vdc_bus_V * (0.03 * state.Vdc_bus_V))) * 1e6;

  const tHold_actual_ms =
    ((0.5 * Cdc_F * (state.Vdc_bus_V * state.Vdc_bus_V - state.Vdc_min_hold_V * state.Vdc_min_hold_V)) /
      state.Pout_W) *
    1e3;

  const Idc_out_A = state.Pout_W / state.Vdc_bus_V;
  const ICdc_lf_rms_A = Idc_out_A / Math.sqrt(2);
  const ICdc_hf_rms_A =
    Idc_out_A *
    Math.sqrt(Math.max(0.1, (16 * state.Vdc_bus_V) / (3 * Math.PI * state.Vac_rms_V * Math.sqrt(2)) - 1.5)) *
    (nPhases === 2 ? 0.58 : 1.0);
  const ICdc_total_rms_A = Math.sqrt(ICdc_lf_rms_A * ICdc_lf_rms_A + ICdc_hf_rms_A * ICdc_hf_rms_A);
  // Aluminum Electrolytic 100Hz-equivalent ripple current (Kf = 1.43 at fsw >= 50kHz)
  const ICdc_freq_weighted_100Hz_A = Math.sqrt(
    ICdc_lf_rms_A * ICdc_lf_rms_A + Math.pow(ICdc_hf_rms_A / 1.43, 2)
  );
  const capBankParallelCount = Math.max(2, Math.ceil(state.Cdc_uF / 560));

  const evalHoldUp = (c_uF: number) => {
    const c_F = Math.max(50, c_uF) * 1e-6;
    const vRip = state.Pout_W / (w_line * state.Vdc_bus_V * c_F);
    const tH =
      ((0.5 * c_F * (state.Vdc_bus_V * state.Vdc_bus_V - state.Vdc_min_hold_V * state.Vdc_min_hold_V)) /
        state.Pout_W) *
      1e3;
    return {
      y1: Number(tH.toFixed(2)),
      y2: Number(vRip.toFixed(2)),
    };
  };

  const holdUpCurve: {
    Cdc_uF: number;
    v_ripple_2f_Vpp: number;
    t_hold_ms: number;
    tHold_ms: number;
    Vripple_pp_V: number;
    ICdc_rms_A: number;
  }[] = [];
  for (let c_uF = 400; c_uF <= 4000; c_uF += 150) {
    const { y1: tHRound, y2: vRipRound } = evalHoldUp(c_uF);
    holdUpCurve.push({
      Cdc_uF: c_uF,
      v_ripple_2f_Vpp: vRipRound,
      t_hold_ms: tHRound,
      tHold_ms: tHRound,
      Vripple_pp_V: vRipRound,
      ICdc_rms_A: Number(ICdc_total_rms_A.toFixed(2)),
    });
  }

  // ============================================================================
  // Iterative Electro-Thermal Power Losses & Efficiency
  // ============================================================================
  const alpha_rds = sw.alpha_R_per_C;
  let Tj_fast_C = 40 + 25;
  let Pcond_fast_W = 0;
  let Psw_total_W = 0;
  let Prr_W = 0;
  const Pgate_W = 2 * nPhases * (sw.Qg_nC * 1e-9) * 18.0 * fsw_Hz;

  for (let iter = 0; iter < 8; iter++) {
    const rdsHot_Ohm =
      sw.Rds_on_25C_mOhm * 1e-3 * Math.max(0.85, 1 + alpha_rds * (Tj_fast_C - 25));
    if (state.topology === '2ph-interleaved-boost' || state.topology === 'dual-boost-bridgeless') {
      // Unidirectional boost cell: MOSFET conducts during D, SiC Schottky diode conducts during (1-D)
      const D_avg = 1 - (2 * Math.sqrt(2) * state.Vac_rms_V) / (Math.PI * state.Vdc_bus_V);
      const P_fet = nPhases * Iph_rms_A * Iph_rms_A * D_avg * rdsHot_Ohm;
      const P_diode =
        nPhases * (Iph_rms_A * (1 - D_avg) * 1.35 + Iph_rms_A * Iph_rms_A * (1 - D_avg) * 0.018);
      Pcond_fast_W = P_fet + P_diode;
    } else {
      // Synchronous Totem-Pole fast leg
      Pcond_fast_W = nPhases * Iph_rms_A * Iph_rms_A * rdsHot_Ohm;
    }
    const qrrHot_C =
      sw.Qrr_nC * 1e-9 * Math.max(1.0, 1 + 0.0055 * (Tj_fast_C - 25));
    Prr_W = nPhases * fsw_Hz * qrrHot_C * state.Vdc_bus_V * 0.5;
    const Esw_cycle_J =
      0.5 * state.Vdc_bus_V * (Iph_rms_A * 0.9) * ((sw.tr_ns + sw.tf_ns) * 1e-9) +
      0.5 * (sw.Coss_er_pF * 1e-12) * state.Vdc_bus_V * state.Vdc_bus_V;
    Psw_total_W = nPhases * fsw_Hz * Esw_cycle_J + Prr_W + Pgate_W;
    const P_per_dev = (Pcond_fast_W + Psw_total_W) / (2 * nPhases);
    Tj_fast_C = Math.min(200, 40 + P_per_dev * (sw.Rth_JC_CW + 0.45));
  }

  const Iac_avg_A = (2 * Math.sqrt(2) * Iac_rms_nom_A) / Math.PI;
  const Pcond_slow_W =
    state.topology === '2ph-interleaved-boost'
      ? 2 * 1.05 * Iac_avg_A + 2 * Iac_rms_nom_A * Iac_rms_nom_A * 0.006 // 2 bridge diodes in series
      : state.topology === 'dual-boost-bridgeless'
      ? 1.02 * Iac_avg_A + Iac_rms_nom_A * Iac_rms_nom_A * 0.006 // 1 return diode in series
      : Iac_rms_nom_A * Iac_rms_nom_A * 0.0095; // Synchronous 50/60Hz low-Rds(on) Si leg (S1/S2)
  const Pcond_sw_W = Pcond_fast_W + Pcond_slow_W;

  // ============================================================================
  // Boost Inductor Magnetics & Powder/Ferrite Core DC-Bias Analysis
  // ============================================================================
  // Reference Toroid Stack: 2x Magnetics Kool Mu / High-Flux 0077439A7 (OD 47mm, Ae=199mm2, le=107mm, Ve=21.3cm3)
  const Ae_pfc_m2 = 199e-6 * (state.Pout_W > 5000 ? 1.5 : 1.0);
  const le_pfc_m = 0.107;
  const Ve_pfc_cm3 = Ae_pfc_m2 * le_pfc_m * 1e6;
  const AL_nH_nom = 135 * (state.Pout_W > 5000 ? 1.35 : 1.0);
  const N_pfc_turns = Math.max(18, Math.round(Math.sqrt((state.Lpfc_uH * 1e3) / AL_nH_nom)));

  const Iph_pk_max_A = (Iac_rms_max_A * Math.sqrt(2)) / nPhases;
  const Hdc_pk_Am = (N_pfc_turns * Iph_pk_max_A) / le_pfc_m;
  const Hdc_pk_Oe = Hdc_pk_Am * (0.4 * Math.PI * 1e-2); // 1 A/m = 4*pi*10^-3 Oe

  const mu_koolMu_at_pk_pct = 100 / (1 + 0.0038 * Math.pow(Hdc_pk_Oe, 1.48));
  const mu_highFlux_at_pk_pct = 100 / (1 + 0.0014 * Math.pow(Hdc_pk_Oe, 1.55));
  const L_at_peak_koolMu_uH = state.Lpfc_uH * (mu_koolMu_at_pk_pct / 100);
  const L_at_peak_highFlux_uH = state.Lpfc_uH * (mu_highFlux_at_pk_pct / 100);
  const inductanceRollOff_pct = 100 - mu_koolMu_at_pk_pct;

  const Bdc_pk_T = (Lpfc_H * (mu_koolMu_at_pk_pct / 100) * Iph_pk_max_A) / (N_pfc_turns * Ae_pfc_m2);
  const deltaB_max_T = (Lpfc_H * dIL_ph_max_A) / (N_pfc_turns * Ae_pfc_m2);
  const Bpk_total_T = Bdc_pk_T + 0.5 * deltaB_max_T;

  const Bsat_koolMu_T = 1.05;
  const Bsat_highFlux_T = 1.50;
  const Bsat_ferrite_T = 0.39;
  const exceedsKoolMuLimit = Bpk_total_T > Bsat_koolMu_T;
  const exceedsHighFluxLimit = Bpk_total_T > Bsat_highFlux_T;
  const exceedsFerriteLimit = Bpk_total_T > Bsat_ferrite_T;
  const utilization_koolMu_pct = (Bpk_total_T / Bsat_koolMu_T) * 100;
  const excess_koolMu_T = Bpk_total_T - Bsat_koolMu_T;
  const satStatus: 'critical' | 'warning' | 'ok' = exceedsKoolMuLimit
    ? 'critical'
    : Bpk_total_T >= 0.85 * Bsat_koolMu_T
    ? 'warning'
    : 'ok';

  const saturationCheck = {
    status: satStatus,
    exceedsKoolMuLimit,
    exceedsHighFluxLimit,
    exceedsFerriteLimit,
    Bpk_total_T: Number(Bpk_total_T.toFixed(3)),
    Bsat_koolMu_T,
    Bsat_highFlux_T,
    Bsat_ferrite_T,
    utilization_koolMu_pct: Number(utilization_koolMu_pct.toFixed(1)),
    excess_koolMu_T: Number(excess_koolMu_T.toFixed(3)),
    headline: exceedsHighFluxLimit
      ? `SEVERE BOOST INDUCTOR SATURATION: B_pk = ${Bpk_total_T.toFixed(2)} T Exceeds Kool Mµ (1.05 T) & High-Flux (1.50 T) Limits`
      : exceedsKoolMuLimit
      ? `BOOST INDUCTOR SATURATION ALERT: B_pk = ${Bpk_total_T.toFixed(2)} T Exceeds Kool Mµ Datasheet Limit (1.05 T)`
      : satStatus === 'warning'
      ? `BOOST INDUCTOR KNEE WARNING: B_pk = ${Bpk_total_T.toFixed(2)} T (${utilization_koolMu_pct.toFixed(0)}% of 1.05 T Kool Mµ B_sat)`
      : `Boost Inductor Flux Check Passed: B_pk = ${Bpk_total_T.toFixed(2)} T ≤ Kool Mµ B_sat (1.05 T)`,
    detail: exceedsKoolMuLimit
      ? `Peak flux density (${Bpk_total_T.toFixed(2)} T = B_dc ${Bdc_pk_T.toFixed(2)} T + ΔB/2 ${(deltaB_max_T / 2).toFixed(2)} T) exceeds Sendust / Kool Mµ 60µ datasheet saturation limit (1.05 T) by +${excess_koolMu_T.toFixed(2)} T. Upgrade to High-Flux 60µ (B_sat = 1.50 T), increase core cross-section Ae, or split across more phases.`
      : satStatus === 'warning'
      ? `Operating at ${utilization_koolMu_pct.toFixed(1)}% of Kool Mµ 1.05 T datasheet limit with -${inductanceRollOff_pct.toFixed(1)}% DC-bias inductance roll-off. (Note: Gapped Ferrite N87/N97 0.39 T limit is already exceeded).`
      : `Operating within Kool Mµ 60µ datasheet limit (${utilization_koolMu_pct.toFixed(1)}% of 1.05 T, L_eff = ${L_at_peak_koolMu_uH.toFixed(1)} µH).${
          exceedsFerriteLimit ? ' Note: Exceeds gapped ferrite B_sat (0.39 T); powder core required.' : ''
        }`,
  };

  const dcBiasCurve: AcDcDcBiasPoint[] = [];
  const maxBiasSweep_A = Math.max(25, Math.ceil(Iph_pk_max_A * 1.25));
  for (let i_A = 0; i_A <= maxBiasSweep_A; i_A += Math.max(1, Math.round(maxBiasSweep_A / 24))) {
    const H_Oe = ((N_pfc_turns * i_A) / le_pfc_m) * (0.4 * Math.PI * 1e-2);
    const mu_km = 100 / (1 + 0.0038 * Math.pow(H_Oe, 1.48));
    const mu_hf = 100 / (1 + 0.0014 * Math.pow(H_Oe, 1.55));
    const B_ferrite = (Lpfc_H * i_A) / (N_pfc_turns * Ae_pfc_m2 * 1.15);
    const mu_ferr = B_ferrite < 0.34 ? 98 : Math.max(12, 98 * Math.exp(-14 * (B_ferrite - 0.34)));
    dcBiasCurve.push({
      Idc_A: Number(i_A.toFixed(1)),
      H_Oe: Number(H_Oe.toFixed(1)),
      L_koolMu_uH: Number(((state.Lpfc_uH * mu_km) / 100).toFixed(1)),
      L_highFlux_uH: Number(((state.Lpfc_uH * mu_hf) / 100).toFixed(1)),
      L_ferrite_uH: Number(((state.Lpfc_uH * mu_ferr) / 100).toFixed(1)),
      mu_koolMu_pct: Number(mu_km.toFixed(1)),
      mu_highFlux_pct: Number(mu_hf.toFixed(1)),
    });
  }

  const nActiveInductors = state.topology === 'dual-boost-bridgeless' ? 2 : nPhases;
  const Pind_cu_W = nPhases * (Iph_rms_A * Iph_rms_A * (state.RL_mOhm * 1e-3));
  // Steinmetz HF Core Loss for Sendust / Kool Mu: Pv = 42 * f_kHz^1.46 * (deltaB/2)^2.1 (mW/cm3)
  const Pv_mW_cm3 = 42 * Math.pow(state.fsw_kHz, 1.46) * Math.pow(Math.max(0.01, deltaB_max_T / 2), 2.1);
  const Pind_core_W = nPhases * (Pv_mW_cm3 * 1e-3 * Ve_pfc_cm3);
  const Pind_total_W = Pind_cu_W + Pind_core_W;
  const Tcore_pfc_C = 40 + (Pind_total_W / nActiveInductors) * 5.8;

  const Pcap_W = ICdc_total_rms_A * ICdc_total_rms_A * (state.ESR_Cdc_mOhm * 1e-3);
  const capTempRise_C = (Pcap_W / capBankParallelCount) * 8.2;
  const capHotspot_C = 45 + capTempRise_C;
  const capLife_hours = Math.min(250000, 8000 * Math.pow(2, (105 - capHotspot_C) / 10));
  const capLife_years = capLife_hours / 8760;

  const Ptotal_loss_W = Pcond_sw_W + Psw_total_W + Pind_total_W + Pcap_W;
  const efficiency_pct = (state.Pout_W / (state.Pout_W + Ptotal_loss_W)) * 100;

  // Low-Line Efficiency & Full Load Sweep (10% .. 100%)
  const efficiencyLoadCurve: AcDcEfficiencyPoint[] = [];
  let efficiency_lowLine_pct = efficiency_pct - 1.45;
  for (let loadPct = 10; loadPct <= 100; loadPct += 10) {
    const p_W = (state.Pout_W * loadPct) / 100;
    const scaleI = loadPct / 100;
    const ratioLowLine = state.Vac_rms_V / Math.max(90, state.Vac_min_V);

    // High-line both phases active
    const pLoss_HL =
      Pcond_sw_W * scaleI * scaleI +
      Psw_total_W * (0.45 + 0.55 * scaleI) +
      Pind_cu_W * scaleI * scaleI +
      Pind_core_W * (0.6 + 0.4 * scaleI) +
      Pcap_W * scaleI * scaleI;
    const eff_HL = (p_W / (p_W + pLoss_HL)) * 100;

    // High-line with Phase Shedding below 40% load (1 phase turned off -> halves switching/gate/core loss)
    const shedActive = isInterleaved2Ph && state.phaseShedding && loadPct <= 40;
    const pLoss_Shed = shedActive
      ? Pcond_sw_W * scaleI * scaleI * 1.45 +
        Psw_total_W * 0.52 * (0.45 + 0.55 * scaleI * 2) +
        Pind_cu_W * scaleI * scaleI * 1.6 +
        Pind_core_W * 0.52 +
        Pcap_W * scaleI * scaleI
      : pLoss_HL;
    const eff_Shed = (p_W / (p_W + pLoss_Shed)) * 100;

    // Low-line (Vac_min) loss
    const pLoss_LL =
      Pcond_sw_W * Math.pow(scaleI * ratioLowLine, 2) +
      Psw_total_W * (0.45 + 0.55 * scaleI * ratioLowLine) +
      Pind_cu_W * Math.pow(scaleI * ratioLowLine, 2) +
      Pind_core_W * (0.65 + 0.35 * scaleI) +
      Pcap_W * scaleI * scaleI;
    const eff_LL = (p_W / (p_W + pLoss_LL)) * 100;
    if (loadPct === 100) efficiency_lowLine_pct = eff_LL;

    efficiencyLoadCurve.push({
      load_pct: loadPct,
      Pout_kW: Number((p_W / 1e3).toFixed(2)),
      eff_highLine_pct: Number(eff_HL.toFixed(2)),
      eff_lowLine_pct: Number(eff_LL.toFixed(2)),
      eff_phaseShed_pct: Number(eff_Shed.toFixed(2)),
      Ploss_highLine_W: Number(pLoss_HL.toFixed(1)),
      Ploss_lowLine_W: Number(pLoss_LL.toFixed(1)),
    });
  }

  // ============================================================================
  // Control Loop Synthesis: ACMC, Cascaded PI, Digital 2P2Z, and FCS-MPC
  // ============================================================================
  const wc_i = 2 * Math.PI * (state.fc_i_kHz * 1e3);
  const Ts_ctrl = 1 / (state.fs_ctrl_kHz * 1e3);
  const Td_delay = 0.75 * Ts_ctrl; // Synchronous ADC sampling + trailing-edge DPWM update transport delay

  // Plant G_id(s) (-90°) + Type-II Integrator (-90°) = -180° unboosted; lead-lag pair supplies pm_i_deg + w*Td
  const boost_i_rad = ((state.pm_i_deg + (wc_i * Td_delay * 180) / Math.PI) * Math.PI) / 180;
  const k_boost_i = Math.max(1.3, Math.tan(Math.PI / 4 + Math.max(0.1, Math.min(1.42, boost_i_rad)) / 2));

  const wz_i = wc_i / k_boost_i;
  const wp_i = wc_i * k_boost_i;
  const fz_i_kHz = wz_i / (2 * Math.PI * 1e3);
  const fp_i_kHz = wp_i / (2 * Math.PI * 1e3);

  const plantMagAtWci = state.Vdc_bus_V / (wc_i * Lpfc_H);
  const Kp_i = 1 / plantMagAtWci;
  const Ki_i = Kp_i * wz_i;

  const wc_v = 2 * Math.PI * state.fc_v_Hz;
  const fz_v_Hz = state.fc_v_Hz / 3.0;
  const fp_v_Hz = state.f_line_Hz * 2.0;
  const Kp_v = (2 * state.Vdc_bus_V * wc_v * Cdc_F) / state.Vac_rms_V;
  const Ki_v = Kp_v * (2 * Math.PI * fz_v_Hz);

  // Pre-Warped Tustin (Bilinear) Discretization of Type-II / 2P2Z Current Controller
  // H(z) = (b0 + b1*z^-1 + b2*z^-2) / (1 - a1*z^-1 - a2*z^-2) with a1 + a2 = 1.00000
  const K_tust = 2 / Ts_ctrl;
  const wz_i_pw = K_tust * Math.tan(Math.min(Math.PI * 0.45, (wz_i * Ts_ctrl) / 2));
  const wp_i_pw = K_tust * Math.tan(Math.min(Math.PI * 0.45, (wp_i * Ts_ctrl) / 2));
  const alpha_p = (K_tust - wp_i_pw) / (K_tust + wp_i_pw);
  const a1_i = 1 + alpha_p;
  const a2_i = -alpha_p;

  const numScale = (Ki_i * wp_i_pw) / (wz_i_pw * K_tust * (K_tust + wp_i_pw));
  const b0_i = numScale * (K_tust + wz_i_pw);
  const b1_i = numScale * (2 * wz_i_pw);
  const b2_i = numScale * (wz_i_pw - K_tust);

  const evalBodeInner = (f_Hz: number) => {
    const w = 2 * Math.PI * Math.max(0.5, f_Hz);
    const gId_mag = state.Vdc_bus_V / Math.sqrt(Math.pow(state.RL_mOhm * 1e-3, 2) + Math.pow(w * Lpfc_H, 2));
    const gId_ph = (-Math.atan2(w * Lpfc_H, state.RL_mOhm * 1e-3) * 180) / Math.PI;
    const cI_mag =
      (Ki_i / w) *
      (Math.sqrt(1 + Math.pow(w / wz_i, 2)) / Math.sqrt(1 + Math.pow(w / wp_i, 2)));
    const cI_ph =
      -90 +
      ((Math.atan(w / wz_i) - Math.atan(w / wp_i) - w * Td_delay) * 180) / Math.PI;
    const mpcFactor = state.controlType === 'mpc' ? 1 + 0.01 * state.mpcL_mismatch_pct : 1.0;
    const iLoopMag_dB = 20 * Math.log10(Math.max(1e-6, gId_mag * cI_mag * mpcFactor));
    const iLoopPhase_deg = gId_ph + cI_ph;
    return {
      y1: Number(iLoopMag_dB.toFixed(2)),
      y2: Number(iLoopPhase_deg.toFixed(1)),
    };
  };

  const evalBodeOuter = (f_Hz: number) => {
    const w = 2 * Math.PI * Math.max(0.1, f_Hz);
    const wz_v = 2 * Math.PI * fz_v_Hz;
    const wp_v = 2 * Math.PI * fp_v_Hz;
    const gVi_mag = state.Vac_rms_V / (2 * state.Vdc_bus_V * w * Cdc_F);
    const cV_mag =
      (Ki_v / w) *
      (Math.sqrt(1 + Math.pow(w / wz_v, 2)) / Math.sqrt(1 + Math.pow(w / wp_v, 2)));
    const vLoopMag_dB = 20 * Math.log10(Math.max(1e-6, gVi_mag * cV_mag));
    const vLoopPhase_deg =
      -180 + ((Math.atan(w / wz_v) - Math.atan(w / wp_v)) * 180) / Math.PI;
    return {
      y1: Number(vLoopMag_dB.toFixed(2)),
      y2: Number(vLoopPhase_deg.toFixed(1)),
    };
  };

  // Bode Curve Generation (2 Hz to 50 kHz)
  const bodeCurve: AcDcBodePoint[] = [];
  let pm_i_actual_deg = state.pm_i_deg;
  let pm_v_actual_deg = state.pm_v_deg;
  let minIDiff = 999;
  let minVDiff = 999;

  for (let idx = 0; idx <= 48; idx++) {
    const f_Hz = Math.pow(10, 0.3 + (idx / 48) * 4.4);
    const { y1: iLoopMag_dB, y2: iLoopPhase_deg } = evalBodeInner(f_Hz);
    const { y1: vLoopMag_dB, y2: vLoopPhase_deg } = evalBodeOuter(f_Hz);

    if (Math.abs(iLoopMag_dB) < minIDiff) {
      minIDiff = Math.abs(iLoopMag_dB);
      pm_i_actual_deg = 180 + iLoopPhase_deg;
    }
    if (Math.abs(vLoopMag_dB) < minVDiff) {
      minVDiff = Math.abs(vLoopMag_dB);
      pm_v_actual_deg = 180 + vLoopPhase_deg;
    }

    bodeCurve.push({
      freq_Hz: Number(f_Hz.toFixed(1)),
      iLoopMag_dB,
      iLoopPhase_deg,
      vLoopMag_dB,
      vLoopPhase_deg,
    });
  }

  // ============================================================================
  // IEC 61000-3-2 / 61000-3-12 Harmonics, Power Factor & Zero-Crossing Model
  // ============================================================================
  // 3rd harmonic injection from outer voltage loop 2*f_line ripple + switching ripple
  const I3_pct_vloop = (state.fc_v_Hz / (2 * state.f_line_Hz)) * (Vbus_2f_ripple_Vpp / state.Vdc_bus_V) * 85;
  const rippleRatio = (dIin_net_max_A / Math.max(1, Iac_pk_nom_A)) * 18;
  const mpcPenalty = state.controlType === 'mpc' ? Math.abs(state.mpcL_mismatch_pct) * 0.07 : 0;

  // Base IEC 61000-3-2 Class A limits (scaled by Iac_rms_nom_A / 16A for >16A IEC 61000-3-12 equipment)
  const iecScale = Math.max(1.0, Iac_rms_nom_A / 16.0);
  const iecBaseLimits: Record<number, number> = {
    3: 2.3,
    5: 1.14,
    7: 0.77,
    9: 0.4,
    11: 0.33,
    13: 0.21,
  };

  const harmonicSpectrum: AcDcHarmonicPoint[] = [];
  let sumHarmSq_pct = 0;
  for (let n = 3; n <= 39; n += 2) {
    const baseLimit_A = (iecBaseLimits[n] ?? 0.15 * (15 / n)) * iecScale;
    const In_pct =
      n === 3
        ? Math.max(0.85, 1.15 + I3_pct_vloop + rippleRatio * 0.25 + mpcPenalty)
        : (1.85 + rippleRatio * 0.35 + mpcPenalty) / Math.pow(n / 3, 1.38);
    const In_rms_A = (In_pct / 100) * Iac_rms_nom_A;
    sumHarmSq_pct += In_pct * In_pct;
    harmonicSpectrum.push({
      order: n,
      freq_Hz: n * state.f_line_Hz,
      In_rms_A: Number(In_rms_A.toFixed(3)),
      In_pct: Number(In_pct.toFixed(2)),
      iecLimit_A: Number(baseLimit_A.toFixed(3)),
      pass: In_rms_A <= baseLimit_A,
    });
  }

  const THD_est_pct = Math.sqrt(sumHarmSq_pct);
  const displacementPF = Math.cos(((2.4 - Math.min(1.8, state.fc_i_kHz * 0.15)) * Math.PI) / 180);
  const distortionPF = 1 / Math.sqrt(1 + Math.pow(THD_est_pct / 100, 2));
  const powerFactor_true = displacementPF * distortionPF;

  // Totem-Pole Zero-Crossing Spike & Soft-Start Mitigation Waveform (-15 deg to +15 deg)
  const zcdSpike_A = (state.Vdc_bus_V * 180e-9) / Lpfc_H; // Spike during 180ns dead-time if unmitigated
  const zeroCrossingCurve: AcDcZeroCrossingPoint[] = [];
  for (let deg = -15; deg <= 15; deg += 1) {
    const rad = (deg * Math.PI) / 180;
    const i_ideal = Iac_pk_nom_A * Math.sin(rad);
    const zcWindow = Math.exp(-Math.pow(deg / 2.2, 2));
    const cuspLag = deg >= 0 && deg <= 3 ? -zcdSpike_A * zcWindow * Math.cos((deg * Math.PI) / 3) : 0;
    const i_unmit = i_ideal + cuspLag + (Math.abs(deg) <= 1 ? (deg >= 0 ? zcdSpike_A : -zcdSpike_A * 0.6) : 0);
    const i_soft = i_ideal * (1 - 0.12 * zcWindow);
    zeroCrossingCurve.push({
      theta_deg: deg,
      i_ideal_A: Number(i_ideal.toFixed(2)),
      i_unmitigated_A: Number(i_unmit.toFixed(2)),
      i_softStart_A: Number(i_soft.toFixed(2)),
    });
  }

  // ============================================================================
  // Inrush Current, NTC/PTC Pre-Charge & Relay Bypass Synthesizer
  // ============================================================================
  const Vpk_max_V = state.Vac_max_V * Math.sqrt(2);
  const inrushEnergy_J = 0.5 * Cdc_F * Vpk_max_V * Vpk_max_V;
  const R_grid_plus_esr_Ohm = 0.15 + state.ESR_Cdc_mOhm * 1e-3;
  const Iinrush_unmitigated_pk_A = Vpk_max_V / R_grid_plus_esr_Ohm;
  const R_precharge_Ohm = state.Pout_W >= 6000 ? 10 : 15;
  const Iinrush_precharge_pk_A = Vpk_max_V / (R_precharge_Ohm + R_grid_plus_esr_Ohm);
  const tau_pre_s = R_precharge_Ohm * Cdc_F;
  const t_relay_bypass_ms = 4.2 * tau_pre_s * 1e3;
  const I2t_precharge_A2s = 0.5 * Iinrush_precharge_pk_A * Iinrush_precharge_pk_A * tau_pre_s;

  const inrushCurve: AcDcInrushPoint[] = [];
  const maxTime_ms = Math.max(60, Math.ceil(t_relay_bypass_ms * 1.25));
  for (let t_ms = 0; t_ms <= maxTime_ms; t_ms += Math.max(2, Math.round(maxTime_ms / 30))) {
    const t_s = t_ms * 1e-3;
    const v_dc_t = Vpk_max_V * (1 - Math.exp(-t_s / tau_pre_s));
    const i_pre_t = Iinrush_precharge_pk_A * Math.exp(-t_s / tau_pre_s);
    const tau_unmit_s = Math.max(0.0005, R_grid_plus_esr_Ohm * Cdc_F);
    const i_unmit_t = Iinrush_unmitigated_pk_A * Math.exp(-t_s / tau_unmit_s);
    inrushCurve.push({
      time_ms: t_ms,
      Vdc_precharge_V: Number(v_dc_t.toFixed(1)),
      I_precharge_A: Number(i_pre_t.toFixed(2)),
      I_unmitigated_A: Number(i_unmit_t.toFixed(1)),
    });
  }

  // ============================================================================
  // AC-Side DM/CM EMI Filter & Safety Earth Leakage Synthesizer (CISPR 32 Class B)
  // ============================================================================
  const f_emi_fundamental_kHz = nPhases * state.fsw_kHz;
  // First switching harmonic falling inside CISPR 32 conducted band (>= 150 kHz)
  const n_cispr_harm = Math.max(1, Math.ceil(150 / Math.max(20, f_emi_fundamental_kHz)));
  const f_cispr_design_kHz = f_emi_fundamental_kHz * n_cispr_harm;
  const I_ripple_rms_A = (dIin_net_max_A / (2 * Math.sqrt(3))) * Math.pow(n_cispr_harm, -1.45);
  // Conducted noise voltage across 50-Ohm LISN after local bridge X-cap HF impedance division (~4.2 Ohm effective source)
  const Vdm_unfiltered_dBuV = 20 * Math.log10(Math.max(1e-3, I_ripple_rms_A * 4.2) * 1e6);
  const cisprLimitAtFemi_dBuV = 56; // CISPR 32 Class B Average limit at 150kHz-500kHz
  const RequiredAtt_dB = Math.max(24, Vdm_unfiltered_dBuV - cisprLimitAtFemi_dBuV + 6);
  // 2-stage Pi (C_X1 - L_dm - C_X2 + CM leakage) yields ~60 dB/decade above corner fc_dm
  const fc_dm_kHz = Math.max(12.0, f_cispr_design_kHz / Math.pow(10, RequiredAtt_dB / 60));
  const Cx_each_uF = state.Pout_W >= 6000 ? 2.2 : 1.5;
  const Ldm_uH =
    (1 / (Math.pow(2 * Math.PI * fc_dm_kHz * 1e3, 2) * (Cx_each_uF * 1e-6))) * 1e6;
  const Cy_each_nF = 4.7; // 2x 4.7nF Y2 caps (Line-PE and Neutral-PE)
  const Lcm_mH = state.topology === '2ph-interleaved-boost' ? 6.8 : 12.0; // Bridgeless needs higher Lcm
  const earthLeakage_mA =
    2 * Math.PI * state.f_line_Hz * state.Vac_max_V * (Cy_each_nF * 1e-9) * 1e3;
  // IEC 62368-1 X-cap discharge time constant tau = R_bleed * Cx_total <= 1.8 s
  const R_bleed_kOhm = Math.min(680, Math.floor((1.6 / (2 * Cx_each_uF * 1e-6)) / 1e3));

  const emiSpectrumCurve: AcDcEmiPoint[] = [];
  const emiFreqPoints_MHz = [0.15, 0.2, 0.3, 0.5, 0.75, 1.0, 2.0, 3.5, 5.0, 10.0, 15.0, 22.0, 30.0];
  for (const f_MHz of emiFreqPoints_MHz) {
    const cisprQP = f_MHz < 0.5 ? 66 - 10 * Math.log10(f_MHz / 0.15) : f_MHz <= 5 ? 56 : 60;
    const cisprAvg = f_MHz < 0.5 ? 56 - 10 * Math.log10(f_MHz / 0.15) : f_MHz <= 5 ? 46 : 50;
    const f_kHz = f_MHz * 1e3;
    const unfilt = Vdm_unfiltered_dBuV - 22 * Math.log10(Math.max(1, f_kHz / f_cispr_design_kHz));
    const filterAtt = Math.min(76, 60 * Math.log10(Math.max(1.1, f_kHz / fc_dm_kHz)));
    emiSpectrumCurve.push({
      freq_MHz: f_MHz,
      freq_label: f_MHz < 1 ? `${Math.round(f_MHz * 1000)}k` : `${f_MHz}M`,
      unfiltered_dBuV: Number(unfilt.toFixed(1)),
      filtered_dBuV: Number(Math.max(22, unfilt - filterAtt).toFixed(1)),
      cisprQP_dBuV: Number(cisprQP.toFixed(1)),
      cisprAvg_dBuV: Number(cisprAvg.toFixed(1)),
    });
  }

  let dspCodeSnippet = '';
  if (state.controlType === '2p2z') {
    dspCodeSnippet = `// Pre-Warped Tustin 2P2Z Interleaved Current Controller (fs = ${state.fs_ctrl_kHz} kHz, a1+a2 = ${(a1_i + a2_i).toFixed(5)})
#define B0_I  (${b0_i.toFixed(6)}f)
#define B1_I  (${b1_i.toFixed(6)}f)
#define B2_I  (${b2_i.toFixed(6)}f)
#define A1_I  (${a1_i.toFixed(6)}f)
#define A2_I  (${a2_i.toFixed(6)}f)

static inline float PFC_2P2Z_Step(float i_ref, float i_meas, float v_ac_ff, float v_dc, float *e, float *u) {
    e[0] = i_ref - i_meas;
    float u_fb = A1_I * u[1] + A2_I * u[2] + B0_I * e[0] + B1_I * e[1] + B2_I * e[2];
    float d_ff = 1.0f - (fabsf(v_ac_ff) / fmaxf(v_dc, 100.0f)); // Duty feedforward
    u[2] = u[1]; u[1] = u_fb;
    e[2] = e[1]; e[1] = e[0];
    return fminf(0.98f, fmaxf(0.02f, d_ff + u_fb));
}`;
  } else if (state.controlType === 'mpc') {
    dspCodeSnippet = `// Finite-Control-Set / Deadbeat Predictive Current Control (fs = ${state.fs_ctrl_kHz} kHz)
#define L_PFC_HAT  (${(Lpfc_H * (1 + state.mpcL_mismatch_pct / 100)).toExponential(4)}f)
#define FS_CTRL    (${(state.fs_ctrl_kHz * 1e3).toFixed(1)}f)

static inline float PFC_MPC_Deadbeat(float i_ref_next, float i_L_k, float v_ac_k, float v_dc_k) {
    float v_L_req = L_PFC_HAT * FS_CTRL * (i_ref_next - i_L_k);
    float d_opt = 1.0f - ((fabsf(v_ac_k) - v_L_req) / fmaxf(v_dc_k, 100.0f));
    return fminf(0.98f, fmaxf(0.02f, d_opt));
}`;
  } else {
    dspCodeSnippet = `// Cascaded ACMC / PI Controller (Inner fc = ${state.fc_i_kHz} kHz, Outer fc = ${state.fc_v_Hz} Hz)
#define KP_I  (${Kp_i.toFixed(5)}f)
#define KI_I  (${(Ki_i * Ts_ctrl).toFixed(5)}f)
#define KP_V  (${Kp_v.toFixed(5)}f)
#define KI_V  (${(Ki_v * Ts_ctrl).toFixed(6)}f)

// Inner loop executes at ${state.fs_ctrl_kHz} kHz; Phase 2 PWM carrier shifted by TBPHS = TBPRD / 2 (180 deg)`;
  }

  const equations: AcDcEquationRow[] = [
    {
      symbol: 'D(θ)',
      symbolTex: String.raw`D(\theta)`,
      name: 'Instantaneous Boost Duty',
      formula: 'D(θ) = 1 - (√2·Vac·sinθ) / Vdc',
      formulaTex: String.raw`D(\theta) = 1 - \frac{\sqrt{2}\,V_{\text{ac,rms}}\sin\theta}{V_{\text{dc}}}`,
      value: `D(90°) = ${(1 - (state.Vac_rms_V * Math.sqrt(2)) / state.Vdc_bus_V).toFixed(3)} | Null @ θ = ${theta_zeroRipple1_deg.toFixed(1)}°`,
      status: 'ok',
    },
    {
      symbol: 'ΔI_in,2ph',
      symbolTex: String.raw`\Delta I_{\text{in,2ph}}(\theta)`,
      name: 'Interleaved Net Ripple',
      formula: 'ΔI_in = Vdc·|1 - 2D|·min(D, 1-D) / (fsw·Lpfc)',
      formulaTex: String.raw`\Delta I_{\text{in}} = \frac{V_{\text{dc}}\,\left|1 - 2D(\theta)\right|\,\min\!\left(D, 1-D\right)}{f_{\text{sw}}\,L_{\text{pfc}}}`,
      value: `${dIin_net_max_A.toFixed(2)} App (vs ${dIL_ph_max_A.toFixed(2)} A 1-Ph, -${rippleCancelMax_pct.toFixed(0)}%)`,
      status: 'ok',
    },
    {
      symbol: 'C_dc,min',
      symbolTex: String.raw`C_{\text{dc,min}},\;\Delta V_{2f}`,
      name: 'Hold-Up & 2f_line Bulk Cap',
      formula: 'C_hold = 2·Pout·t_hold / (Vdc² - Vmin²),  ΔV_2f = Pout / (2π·f_line·Vdc·Cdc)',
      formulaTex: String.raw`C_{\text{hold}} \ge \frac{2\,P_{\text{out}}\,t_{\text{hold}}}{V_{\text{dc}}^2 - V_{\text{dc,min}}^2}, \qquad \Delta V_{2f,\text{pp}} = \frac{P_{\text{out}}}{2\pi f_{\text{line}} V_{\text{dc}} C_{\text{dc}}}`,
      value: `t_hold = ${tHold_actual_ms.toFixed(1)} ms | ΔV_2f = ${Vbus_2f_ripple_Vpp.toFixed(1)} Vpp`,
      status: tHold_actual_ms >= state.tHold_ms ? 'ok' : 'warn',
    },
    {
      symbol: 'G_id(s)',
      symbolTex: String.raw`G_{id}(s),\;f_{c,i}`,
      name: 'Inner Current Loop Plant & Comp',
      formula: 'G_id(s) = Vdc / (s·Lpfc + RL),  fc,i = Vdc·Kp,i / (2π·Lpfc)',
      formulaTex: String.raw`G_{id}(s) = \frac{\hat{i}_L(s)}{\hat{d}(s)} = \frac{V_{\text{dc}}}{s\,L_{\text{pfc}} + R_L}, \qquad f_{c,i} \approx \frac{V_{\text{dc}}\,K_{p,i}}{2\pi L_{\text{pfc}}}`,
      value: `Kp,i = ${Kp_i.toFixed(4)} | fz = ${fz_i_kHz.toFixed(2)} kHz | PM = ${pm_i_actual_deg.toFixed(1)}°`,
      status: pm_i_actual_deg >= 45 ? 'ok' : 'warn',
    },
    {
      symbol: 'G_vi(s)',
      symbolTex: String.raw`G_{vi}(s),\;f_{p,v}`,
      name: 'Outer 2f-Attenuated Voltage Loop',
      formula: 'G_vi(s) = Vac / (2·Vdc·s·Cdc),  fp,v ≤ 2·f_line',
      formulaTex: String.raw`G_{vi}(s) = \frac{\hat{v}_{\text{dc}}(s)}{\hat{i}_{\text{ac,pk}}(s)} = \frac{V_{\text{ac,rms}}}{2\,V_{\text{dc}}\,s\,C_{\text{dc}}}, \qquad f_{p,v} \le 2 f_{\text{line}}`,
      value: `Kp,v = ${Kp_v.toFixed(3)} | fc,v = ${state.fc_v_Hz} Hz | THD ≈ ${THD_est_pct.toFixed(2)}%`,
      status: state.fc_v_Hz <= 25 ? 'ok' : 'warn',
    },
    {
      symbol: 'L_eff(H)',
      symbolTex: String.raw`L_{\text{pfc}}(I_{\text{pk}}),\;B_{\text{pk}}`,
      name: 'Boost Inductor DC-Bias & Flux',
      formula: 'H_pk = 0.4π·N·I_pk / le,  B_pk = B_dc + ΔB / 2 < B_sat',
      formulaTex: String.raw`H_{\text{pk}} = \frac{0.4\pi N_{\text{pfc}} I_{\text{ph,pk}}}{l_e\;(\text{cm})}, \qquad B_{\text{pk}} = B_{\text{dc,pk}} + \frac{\Delta B_{\max}}{2} < B_{\text{sat}}`,
      value: `L(Ipk) = ${L_at_peak_koolMu_uH.toFixed(1)} µH (-${inductanceRollOff_pct.toFixed(1)}%) | Bpk = ${Bpk_total_T.toFixed(2)} T`,
      status: Bpk_total_T <= 1.05 * 0.85 ? 'ok' : 'warn',
    },
  ];

  const rippleCurve = lineAngleCurve.map((p) => ({
    theta_deg: p.theta_deg,
    deltaIL_ph_A: p.dIL_1ph_A,
    deltaIin_net_A: p.dI_in_2ph_A,
  }));

  const bodeInner = bodeCurve.map((b) => ({
    freq_Hz: b.freq_Hz,
    mag_dB: b.iLoopMag_dB,
    phase_deg: b.iLoopPhase_deg,
  }));

  const bodeOuter = bodeCurve.map((b) => ({
    freq_Hz: b.freq_Hz,
    mag_dB: b.vLoopMag_dB,
    phase_deg: b.vLoopPhase_deg,
  }));

  return {
    state,
    sw,
    nPhases,
    Iin_rms_A: Iac_rms_nom_A,
    Iac_rms_nom_A,
    Iac_rms_max_A,
    Iac_pk_nom_A,
    Iph_rms_A,
    Iph_pk_A,
    D_at_peak: D_at_pk,
    deltaIL_ph_max_A: dIL_ph_max_A,
    deltaIin_net_max_A: dIin_net_max_A,
    dIL_ph_max_A,
    dIin_net_max_A,
    rippleCancel_peak: dIin_net_max_A / Math.max(0.01, dIL_ph_max_A),
    rippleCancelMax_pct,
    theta_zeroRipple1_deg,
    Lpfc_crit_CCM_uH,
    Cdc_req_hold_uF: Cdc_req_holdup_uF,
    Cdc_req_holdup_uF,
    Cdc_req_ripple_uF,
    Vdc_ripple_pp_V: Vbus_2f_ripple_Vpp,
    Vbus_2f_ripple_Vpp,
    tHold_actual_ms,
    ICdc_lf_rms_A,
    ICdc_hf_rms_A,
    ICdc_rms_A: ICdc_total_rms_A,
    ICdc_total_rms_A,
    ICdc_freq_weighted_100Hz_A,
    capTempRise_C,
    capHotspot_C,
    capLife_hours,
    capLife_years,
    capBankParallelCount,
    Pcond_fast_W,
    Pcond_slow_W,
    Pcond_sw_W,
    Psw_total_W,
    Pgate_W,
    Prr_W,
    Tj_fast_C,
    Pind_cu_W,
    Pind_core_W,
    Pind_total_W,
    Pcap_W,
    Ptotal_loss_W,
    efficiency_pct,
    efficiency_lowLine_pct,
    THDi_est_pct: THD_est_pct,
    THD_est_pct,
    powerFactor_true,
    displacementPF,
    distortionPF,
    zcdSpike_A,
    N_pfc_turns,
    Hdc_pk_Oe,
    Bdc_pk_T,
    deltaB_max_T,
    Bpk_total_T,
    L_at_peak_koolMu_uH,
    L_at_peak_highFlux_uH,
    inductanceRollOff_pct,
    Tcore_pfc_C,
    saturationCheck,
    inrushEnergy_J,
    Iinrush_unmitigated_pk_A,
    R_precharge_Ohm,
    Iinrush_precharge_pk_A,
    I2t_precharge_A2s,
    t_relay_bypass_ms,
    f_emi_fundamental_kHz,
    Vdm_unfiltered_dBuV,
    RequiredAtt_dB,
    fc_dm_kHz,
    Cx_each_uF,
    Ldm_uH,
    Cy_each_nF,
    Lcm_mH,
    earthLeakage_mA,
    R_bleed_kOhm,
    fc_i_actual_kHz: state.fc_i_kHz,
    Kp_i,
    Ki_i,
    fz_i_kHz,
    fp_i_kHz,
    pm_i_actual_deg,
    gm_i_dB: 16.5,
    fc_v_actual_Hz: state.fc_v_Hz,
    Kp_v,
    Ki_v,
    fz_v_Hz,
    fp_v_Hz,
    pm_v_actual_deg,
    b0_i,
    b1_i,
    b2_i,
    a1_i,
    a2_i,
    dspCode: dspCodeSnippet,
    dspCodeSnippet,
    rippleCurve,
    lineAngleCurve,
    bodeInner,
    bodeOuter,
    bodeCurve,
    holdUpCurve,
    harmonicSpectrum,
    zeroCrossingCurve,
    dcBiasCurve,
    inrushCurve,
    emiSpectrumCurve,
    efficiencyLoadCurve,
    equations,
    evaluators: {
      evalRipple,
      evalHoldUp,
      evalBodeInner,
      evalBodeOuter,
    },
  };
}

