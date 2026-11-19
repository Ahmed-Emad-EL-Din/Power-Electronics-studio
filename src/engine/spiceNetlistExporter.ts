import { AcDcDesignState, DcDcDesignState } from '../data/databases';
import { AcDcResults } from './acdcEngine';
import { DcDcResults } from './dcdcEngine';

/**
 * Generates an LTspice / ngspice compatible .cir behavioral switching SPICE netlist
 * for the active Isolated DC-DC stage (PSFB or LLC) using solved design parameters.
 */
export function generateDcDcSpiceNetlist(state: DcDcDesignState, res: DcDcResults): string {
  const fswHz = state.fsw_kHz * 1e3;
  const Tsw = 1 / fswHz;
  const Thalf = Tsw / 2;
  const tDead_ns = Math.max(20, state.deadTime_ns);
  const tOnHalf_ns = Math.max(80, Thalf * 1e9 - tDead_ns);
  const phaseShift_ns = Math.round(((1 - Math.min(0.95, res.Deff_nom)) * Thalf) * 1e9);

  const Ron_pri = Math.max(
    0.002,
    ((res.priDevice.Rds_on_25C_mOhm * 1.45) / Math.max(1, state.nParallelPri)) * 1e-3
  );
  const Ron_sec = Math.max(
    0.001,
    ((res.secDevice.Rds_on_25C_mOhm * 1.4) / Math.max(1, state.nParallelSec)) * 1e-3
  );
  const Coss_pri_pF = Math.max(15, res.priDevice.Coss_er_pF * state.nParallelPri);
  const n = Math.max(0.2, res.Np_actual / Math.max(1, res.Ns_actual));
  const Lpri_uH = Math.max(50, state.Lm_uH);
  const Lsec_uH = Lpri_uH / (n * n);
  const Rload_Ohm = (state.Vout_V * state.Vout_V) / Math.max(1, state.Pout_W);
  const tStop_us = Math.round(Math.max(400, (1e6 / fswHz) * 45));

  const header = [
    `* ============================================================================`,
    `* VoltCraft Power Electronics Studio — SPICE Netlist (${state.topology.toUpperCase()})`,
    `* Preset: ${state.presetName}`,
    `* Vin=${state.Vin_nom_V}V (min=${state.Vin_min_V}V, max=${state.Vin_max_V}V) -> Vout=${state.Vout_V}V @ ${state.Pout_W}W`,
    `* Core: ${res.core.name} (${res.material.name}), Np=${res.Np_actual}, Ns=${res.Ns_actual}, n=${n.toFixed(3)}`,
    `* Primary FET: ${res.priDevice.name} x${state.nParallelPri} | Secondary: ${res.secDevice.name} x${state.nParallelSec}`,
    `* ============================================================================`,
    `.param FSW=${fswHz} TSW={1/FSW} VIN=${state.Vin_nom_V} VOUT_REF=${state.Vout_V}`,
    `.model SW_PRI SW(Ron=${Ron_pri.toFixed(5)} Roff=1Meg Vt=2.5 Vh=0.2)`,
    `.model SW_SEC SW(Ron=${Ron_sec.toFixed(5)} Roff=1Meg Vt=2.5 Vh=0.2)`,
    `.model D_BODY D(Ron=0.02 Vfwd=${res.priDevice.Vsd_V.toFixed(2)})`,
    `.model D_SEC D(Ron=${Ron_sec.toFixed(5)} Vfwd=${state.rectMode === 'schottky-diode' ? res.secDevice.Vsd_V.toFixed(2) : '0.65'})`,
    ``,
    `* Input Source & Bulk Decoupling`,
    `V_IN vin_pos 0 DC {VIN}`,
    `C_IN vin_pos 0 47u Rser=5m`,
    ``,
    `* Primary Full-Bridge Switching Stage (Leading Leg A, Lagging Leg B)`,
    `S_Q1 vin_pos sw_a g_q1 0 SW_PRI`,
    `S_Q2 sw_a 0 g_q2 0 SW_PRI`,
    `D_B1 sw_a vin_pos D_BODY`,
    `D_B2 0 sw_a D_BODY`,
    `C_OSS1 sw_a 0 ${Coss_pri_pF.toFixed(1)}p`,
    ``,
  ];

  if (state.topology === 'llc-hb') {
    header.push(
      `* Half-Bridge Split Capacitor Leg`,
      `C_HB_TOP vin_pos sw_b 22u`,
      `C_HB_BOT sw_b 0 22u`,
      ``
    );
  } else {
    header.push(
      `S_Q3 vin_pos sw_b g_q3 0 SW_PRI`,
      `S_Q4 sw_b 0 g_q4 0 SW_PRI`,
      `D_B3 sw_b vin_pos D_BODY`,
      `D_B4 0 sw_b D_BODY`,
      `C_OSS2 sw_b 0 ${Coss_pri_pF.toFixed(1)}p`,
      ``
    );
  }

  const Tsw_ns = Math.round(Tsw * 1e9);
  header.push(
    `* Gate PWM Generators (fsw=${state.fsw_kHz} kHz, t_dead=${tDead_ns} ns, PS=${phaseShift_ns} ns)`,
    `V_G1 g_q1 0 PULSE(0 10 0 10n 10n ${tOnHalf_ns.toFixed(0)}n ${Tsw_ns}n)`,
    `V_G2 g_q2 0 PULSE(0 10 ${(Thalf * 1e9).toFixed(0)}n 10n 10n ${tOnHalf_ns.toFixed(0)}n ${Tsw_ns}n)`
  );

  if (state.topology !== 'llc-hb') {
    const tShiftA = res.isLLC ? Thalf * 1e9 : phaseShift_ns;
    const tShiftB = res.isLLC ? 0 : (phaseShift_ns + Thalf * 1e9) % Tsw_ns;
    header.push(
      `V_G3 g_q3 0 PULSE(0 10 ${tShiftA.toFixed(0)}n 10n 10n ${tOnHalf_ns.toFixed(0)}n ${Tsw_ns}n)`,
      `V_G4 g_q4 0 PULSE(0 10 ${tShiftB.toFixed(0)}n 10n 10n ${tOnHalf_ns.toFixed(0)}n ${Tsw_ns}n)`
    );
  }

  header.push(
    ``,
    `* Resonant / Leakage Tank & Transformer (Np=${res.Np_actual} : Ns=${res.Ns_actual})`,
    `L_LK sw_a pri_lk ${state.Llk_uH.toFixed(2)}u Rser=4m`
  );

  if (res.isLLC) {
    header.push(`C_RES pri_lk pri_hot ${state.Cr_nF.toFixed(1)}n`);
  } else {
    header.push(`C_BLK pri_lk pri_hot 4.7u`);
  }

  header.push(
    `L_PRI pri_hot sw_b ${Lpri_uH.toFixed(2)}u Rser=${Math.max(0.002, res.Rpri_ac_mOhm * 1e-3).toFixed(4)}`,
    `L_SEC1 sec_p sec_ct ${Lsec_uH.toFixed(3)}u`,
    `L_SEC2 sec_ct sec_n ${Lsec_uH.toFixed(3)}u`,
    `K_TX L_PRI L_SEC1 L_SEC2 0.9995`,
    ``,
    `* Secondary Rectifier (${state.txType} / ${state.rectMode})`
  );

  if (state.txType === 'center-tapped') {
    header.push(
      `D_SR1 0 sec_p D_SEC`,
      `D_SR2 0 sec_n D_SEC`,
      `L_OUT sec_ct v_out ${state.Lo_uH.toFixed(2)}u Rser=1.5m`
    );
  } else {
    header.push(
      `D_SR1 sec_p v_rect D_SEC`,
      `D_SR2 0 sec_p D_SEC`,
      `D_SR3 sec_n v_rect D_SEC`,
      `D_SR4 0 sec_n D_SEC`,
      `L_OUT v_rect v_out ${state.Lo_uH.toFixed(2)}u Rser=1.5m`
    );
  }

  header.push(
    ``,
    `* Output Capacitor Bank & Load`,
    `C_OUT v_out 0 ${state.Co_uF.toFixed(1)}u Rser=${state.ESR_Co_mOhm.toFixed(2)}m`,
    `R_LOAD v_out 0 ${Rload_Ohm.toFixed(3)}`,
    ``,
    `* Transient Simulation & Measurements`,
    `.tran 0 ${tStop_us}u ${(tStop_us * 0.6).toFixed(0)}u 20n`,
    `.meas TRAN Vout_avg AVG V(v_out) FROM ${(tStop_us * 0.7).toFixed(0)}u TO ${tStop_us}u`,
    `.meas TRAN Vout_pp PP V(v_out) FROM ${(tStop_us * 0.7).toFixed(0)}u TO ${tStop_us}u`,
    `.meas TRAN Ipri_rms RMS I(L_LK) FROM ${(tStop_us * 0.7).toFixed(0)}u TO ${tStop_us}u`,
    `.backanno`,
    `.end`
  );

  return header.join('\n');
}

/**
 * Generates an LTspice / ngspice compatible .cir behavioral SPICE netlist
 * for the active AC-DC PFC Front-End stage.
 */
export function generateAcDcSpiceNetlist(state: AcDcDesignState, res: AcDcResults): string {
  const Vac_pk = state.Vac_rms_V * Math.SQRT2;
  const fswHz = state.fsw_kHz * 1e3;
  const Tsw_ns = Math.round((1 / fswHz) * 1e9);
  const Ron_sw = Math.max(0.005, (res.sw.Rds_on_25C_mOhm * 1.45) * 1e-3);
  const Rload_dc = (state.Vdc_bus_V * state.Vdc_bus_V) / Math.max(10, state.Pout_W);
  const nPh = res.nPhases;

  const lines = [
    `* ============================================================================`,
    `* VoltCraft Power Electronics Studio — AC-DC PFC SPICE Netlist`,
    `* Topology: ${state.topology} | Preset: ${state.presetName}`,
    `* Vac=${state.Vac_rms_V}Vrms @ ${state.f_line_Hz}Hz -> Vdc=${state.Vdc_bus_V}V @ ${state.Pout_W}W`,
    `* Fast Switch: ${res.sw.name} | Lpfc=${state.Lpfc_uH}uH x${nPh} | Cdc=${state.Cdc_uF}uF`,
    `* ============================================================================`,
    `.param FSW=${fswHz} VAC_PK=${Vac_pk.toFixed(1)} FLINE=${state.f_line_Hz}`,
    `.model SW_PFC SW(Ron=${Ron_sw.toFixed(5)} Roff=1Meg Vt=2.5 Vh=0.2)`,
    `.model D_PFC D(Ron=${Ron_sw.toFixed(5)} Vfwd=0.9)`,
    ``,
    `* AC Mains & Differential EMI Input Filter`,
    `V_AC ac_in 0 SIN(0 {VAC_PK} {FLINE})`,
    `L_DM ac_in ac_dm ${res.Ldm_uH.toFixed(1)}u Rser=5m`,
    `C_X ac_dm 0 ${res.Cx_each_uF.toFixed(2)}u`,
    `R_PRE ac_dm ac_bus ${state.prechargeR_Ohm ?? 22}`,
    ``,
    `* Rectified Bridge / Totem-Pole Input Envelope`,
    `D_R1 ac_bus v_rect D_PFC`,
    `D_R2 0 ac_bus D_PFC`,
    `D_R3 0 ac_ret D_PFC`,
    `D_R4 ac_ret v_rect D_PFC`,
    ``,
    `* Boost Inductor Stage (${nPh}-Phase)`,
    `L_PFC1 v_rect sw1 ${state.Lpfc_uH.toFixed(1)}u Rser=8m`,
    `S_PFC1 sw1 0 g_pfc1 0 SW_PFC`,
    `D_B1 sw1 v_dc D_PFC`,
    `V_GPFC1 g_pfc1 0 PULSE(0 10 0 10n 10n ${Math.round(Tsw_ns * 0.45)}n ${Tsw_ns}n)`,
  ];

  if (nPh === 2) {
    lines.push(
      `L_PFC2 v_rect sw2 ${state.Lpfc_uH.toFixed(1)}u Rser=8m`,
      `S_PFC2 sw2 0 g_pfc2 0 SW_PFC`,
      `D_B2 sw2 v_dc D_PFC`,
      `V_GPFC2 g_pfc2 0 PULSE(0 10 ${Math.round(Tsw_ns * 0.5)}n 10n 10n ${Math.round(Tsw_ns * 0.45)}n ${Tsw_ns}n)`
    );
  }

  lines.push(
    ``,
    `* DC-Link Hold-Up Bulk Capacitor Bank & Load`,
    `C_DC v_dc 0 ${state.Cdc_uF.toFixed(0)}u Rser=${state.ESR_Cdc_mOhm.toFixed(1)}m`,
    `R_LOAD v_dc 0 ${Rload_dc.toFixed(2)}`,
    ``,
    `.tran 0 ${(2 / state.f_line_Hz * 1e3).toFixed(1)}m 0 1u`,
    `.meas TRAN Vdc_avg AVG V(v_dc)`,
    `.meas TRAN Vdc_pp PP V(v_dc)`,
    `.end`
  );

  return lines.join('\n');
}

/**
 * Generates an embedded C header file (powerstage_control_cfg.h) for TI C2000 / STM32G4
 * containing exact pre-warped Tustin coefficients, timing, and protection thresholds.
 */
export function generateControlFirmwareHeader(
  dcdcState: DcDcDesignState,
  dcdcRes: DcDcResults,
  acdcState: AcDcDesignState,
  acdcRes: AcDcResults
): string {
  const ocpTripA = (dcdcRes.Iout_total_A * 1.35).toFixed(2);
  const ovpTripV = (dcdcState.Vout_V * 1.15).toFixed(2);
  const pfcOvpV = (acdcState.Vdc_bus_V * 1.12).toFixed(1);

  return `/**
 * @file powerstage_control_cfg.h
 * @brief Auto-generated by VoltCraft Power Electronics Studio
 * @date ${new Date().toISOString()}
 *
 * Target MCU: TI C2000 (TMS320F28003x / F2837xD) or STM32G474 (HRTIM)
 */
#ifndef POWERSTAGE_CONTROL_CFG_H
#define POWERSTAGE_CONTROL_CFG_H

#ifdef __cplusplus
extern "C" {
#endif

/* ==================== DC-DC STAGE (${dcdcState.topology.toUpperCase()}) ==================== */
#define DCDC_VIN_NOM_V              (${dcdcState.Vin_nom_V.toFixed(2)}f)
#define DCDC_VOUT_REF_V             (${dcdcState.Vout_V.toFixed(3)}f)
#define DCDC_POUT_RATED_W           (${dcdcState.Pout_W.toFixed(1)}f)
#define DCDC_FSW_HZ                 (${(dcdcState.fsw_kHz * 1000).toFixed(0)}U)
#define DCDC_ISR_FREQ_HZ            (${(dcdcState.fs_digital_kHz * 1000).toFixed(0)}U)
#define DCDC_DEADTIME_NS            (${dcdcState.deadTime_ns.toFixed(0)}U)
#define DCDC_TURNS_RATIO_N          (${(dcdcRes.Np_actual / Math.max(1, dcdcRes.Ns_actual)).toFixed(4)}f)

/* Protection Thresholds */
#define DCDC_OVP_TRIP_V             (${ovpTripV}f)
#define DCDC_OCP_TRIP_A             (${ocpTripA}f)
#define DCDC_TJ_LIMIT_C             (${(dcdcState.Tj_max_limit_C ?? 125).toFixed(1)}f)

/* Digital Compensator (${dcdcState.controlType.toUpperCase()} — ${dcdcRes.isTwoZeroComp ? '3P3Z' : '2P2Z'}) */
#define DCDC_CTRL_IS_3P3Z           (${dcdcRes.isTwoZeroComp ? 1 : 0})
#define DCDC_CTRL_B0                (${dcdcRes.b0.toFixed(7)}f)
#define DCDC_CTRL_B1                (${dcdcRes.b1.toFixed(7)}f)
#define DCDC_CTRL_B2                (${dcdcRes.b2.toFixed(7)}f)
#define DCDC_CTRL_B3                (${dcdcRes.b3.toFixed(7)}f)
#define DCDC_CTRL_A1                (${dcdcRes.a1.toFixed(7)}f)
#define DCDC_CTRL_A2                (${dcdcRes.a2.toFixed(7)}f)
#define DCDC_CTRL_A3                (${dcdcRes.a3.toFixed(7)}f)

/* PCMC Slope Compensation & Charge Threshold */
#define DCDC_PCMC_SLOPE_V_US        (${dcdcRes.Se_ramp_V_us.toFixed(4)}f)
#define DCDC_PCMC_MC                (${dcdcState.slopeFactor_mc.toFixed(3)}f)
#define DCDC_CHARGE_VTH_V           (${dcdcRes.Vth_charge_V.toFixed(3)}f)

/* ==================== AC-DC PFC STAGE (${acdcState.topology.toUpperCase()}) ==================== */
#define ACDC_VAC_NOM_RMS_V          (${acdcState.Vac_rms_V.toFixed(1)}f)
#define ACDC_LINE_FREQ_HZ           (${acdcState.f_line_Hz.toFixed(1)}f)
#define ACDC_VDC_BUS_REF_V          (${acdcState.Vdc_bus_V.toFixed(1)}f)
#define ACDC_VDC_OVP_TRIP_V         (${pfcOvpV}f)
#define ACDC_FSW_HZ                 (${(acdcState.fsw_kHz * 1000).toFixed(0)}U)

/* Inner Current Loop 2P2Z Coefficients */
#define ACDC_I_B0                   (${acdcRes.b0_i.toFixed(7)}f)
#define ACDC_I_B1                   (${acdcRes.b1_i.toFixed(7)}f)
#define ACDC_I_B2                   (${acdcRes.b2_i.toFixed(7)}f)
#define ACDC_I_A1                   (${acdcRes.a1_i.toFixed(7)}f)
#define ACDC_I_A2                   (${acdcRes.a2_i.toFixed(7)}f)

/* Outer Voltage PI Gains */
#define ACDC_V_KP                   (${acdcRes.Kp_v.toFixed(6)}f)
#define ACDC_V_KI                   (${acdcRes.Ki_v.toFixed(6)}f)

#ifdef __cplusplus
}
#endif

#endif /* POWERSTAGE_CONTROL_CFG_H */
`;
}
