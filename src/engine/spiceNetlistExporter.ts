import { AcDcDesignState, DcDcDesignState } from '../data/databases';
import { AcDcResults } from './acdcEngine';
import { DcDcResults } from './dcdcEngine';
import {
  generateManufacturerMosfetSubckt,
  generateManufacturerRectifierSubckt,
  generatePfcBoostDiodeSubckt,
} from './spiceModelLibrary';
export { generateAcDcLtspiceAsc, generateDcDcLtspiceAsc } from './ltspiceAscExporter';
export { generateAcDcQspiceBundle, generateDcDcQspiceBundle } from './qspiceExporter';
export type { QspiceSimulationBundle } from './qspiceExporter';

/**
 * Generates an LTspice / QSPICE compatible .cir switching SPICE netlist
 * for the active Isolated DC-DC stage (PSFB or LLC) with exact manufacturer
 * .SUBCKT semiconductor models and floating high-side gate drive references.
 */
export function generateDcDcSpiceNetlist(state: DcDcDesignState, res: DcDcResults): string {
  const fswHz = state.fsw_kHz * 1e3;
  const Tsw = 1 / fswHz;
  const Thalf = Tsw / 2;
  const tDead_ns = Math.max(20, state.deadTime_ns);
  const tOnHalf_ns = Math.max(80, Math.round(Thalf * 1e9 - tDead_ns));
  const deff = res.isLLC ? 1.0 : Math.max(0.15, Math.min(0.95, res.Deff_nom));
  const phaseShift_ns = Math.round(deff * Thalf * 1e9);

  const priModel = generateManufacturerMosfetSubckt(res.priDevice, state.nParallelPri);
  const secModel = generateManufacturerRectifierSubckt(
    res.secDevice,
    state.nParallelSec,
    state.rectMode
  );

  const n = Math.max(0.2, res.Np_actual / Math.max(1, res.Ns_actual));
  const Lpri_uH = Math.max(50, state.Lm_uH);
  const Lsec_uH = Lpri_uH / (n * n);
  const Rload_Ohm = (state.Vout_V * state.Vout_V) / Math.max(1, state.Pout_W);
  const tStop_us = Math.round(Math.max(500, (1e6 / fswHz) * 60));
  const Tsw_ns = Math.round(Tsw * 1e9);

  const header = [
    `* ============================================================================`,
    `* VoltCraft Power Electronics Studio -- SPICE Netlist (${state.topology.toUpperCase()})`,
    `* Preset: ${state.presetName}`,
    `* Vin=${state.Vin_nom_V}V (min=${state.Vin_min_V}V, max=${state.Vin_max_V}V) -> Vout=${state.Vout_V}V @ ${state.Pout_W}W`,
    `* Core: ${res.core.name} (${res.material.name}), Np=${res.Np_actual}, Ns=${res.Ns_actual}, n=${n.toFixed(3)}`,
    `* Primary FET: ${priModel.manufacturer} ${res.priDevice.id} x${state.nParallelPri} (.SUBCKT ${priModel.subcktName})`,
    `* Secondary: ${secModel.manufacturer} ${res.secDevice.id} x${state.nParallelSec} (.SUBCKT ${secModel.subcktName})`,
    `* ============================================================================`,
    `.param FSW=${fswHz} TSW={1/FSW} VIN=${state.Vin_nom_V} VOUT_REF=${state.Vout_V}`,
    ``,
    `* Input Source & Bulk Decoupling`,
    `V_IN vin_pos 0 DC {VIN}`,
    `C_IN vin_pos 0 47u Rser=5m`,
    ``,
    `* Primary Switching Stage (Manufacturer .SUBCKT: ${priModel.subcktName})`,
    `XQ1 vin_pos g_q1 sw_a ${priModel.subcktName}`,
    `XQ2 sw_a g_q2 0 ${priModel.subcktName}`,
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
      `XQ3 vin_pos g_q3 sw_b ${priModel.subcktName}`,
      `XQ4 sw_b g_q4 0 ${priModel.subcktName}`,
      ``
    );
  }

  header.push(
    `* Isolated Gate PWM Generators (source-referenced for high-side Q1 & Q3)`,
    `V_G1 g_q1 sw_a PULSE(0 12 0 10n 10n ${tOnHalf_ns}n ${Tsw_ns}n)`,
    `V_G2 g_q2 0 PULSE(0 12 ${Math.round(Thalf * 1e9)}n 10n 10n ${tOnHalf_ns}n ${Tsw_ns}n)`
  );

  if (state.topology !== 'llc-hb') {
    const tShiftA = res.isLLC ? Math.round(Thalf * 1e9) : phaseShift_ns;
    const tShiftB = res.isLLC ? 0 : Math.round(phaseShift_ns + Thalf * 1e9);
    header.push(
      `V_G3 g_q3 sw_b PULSE(0 12 ${tShiftA}n 10n 10n ${tOnHalf_ns}n ${Tsw_ns}n)`,
      `V_G4 g_q4 0 PULSE(0 12 ${tShiftB}n 10n 10n ${tOnHalf_ns}n ${Tsw_ns}n)`
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

  if (state.txType === 'center-tapped') {
    header.push(
      `L_PRI pri_hot sw_b ${Lpri_uH.toFixed(2)}u Rser=${Math.max(0.002, res.Rpri_ac_mOhm * 1e-3).toFixed(4)}`,
      `L_SEC1 sec_p sec_ct ${Lsec_uH.toFixed(3)}u`,
      `L_SEC2 sec_ct sec_n ${Lsec_uH.toFixed(3)}u`,
      `K_TX L_PRI L_SEC1 L_SEC2 0.9995`,
      ``,
      `* Secondary Center-Tapped Rectifier (${state.rectMode} -> ${secModel.subcktName})`,
      `XD_SR1 0 sec_p ${secModel.subcktName}`,
      `XD_SR2 0 sec_n ${secModel.subcktName}`,
      `L_OUT sec_ct v_out ${state.Lo_uH.toFixed(2)}u Rser=1.5m`
    );
  } else if (state.txType === 'current-doubler') {
    header.push(
      `L_PRI pri_hot sw_b ${Lpri_uH.toFixed(2)}u Rser=${Math.max(0.002, res.Rpri_ac_mOhm * 1e-3).toFixed(4)}`,
      `L_SEC1 sec_p sec_n ${Lsec_uH.toFixed(3)}u`,
      `K_TX L_PRI L_SEC1 0.9995`,
      ``,
      `* Secondary Current-Doubler Rectifier (${state.rectMode} -> ${secModel.subcktName})`,
      `XD_SR1 0 sec_p ${secModel.subcktName}`,
      `XD_SR2 0 sec_n ${secModel.subcktName}`,
      `L_OUT1 sec_p v_out ${state.Lo_uH.toFixed(2)}u Rser=1.5m`,
      `L_OUT2 sec_n v_out ${state.Lo_uH.toFixed(2)}u Rser=1.5m`
    );
  } else {
    header.push(
      `L_PRI pri_hot sw_b ${Lpri_uH.toFixed(2)}u Rser=${Math.max(0.002, res.Rpri_ac_mOhm * 1e-3).toFixed(4)}`,
      `L_SEC1 sec_p sec_n ${Lsec_uH.toFixed(3)}u`,
      `K_TX L_PRI L_SEC1 0.9995`,
      ``,
      `* Secondary Full-Bridge Rectifier (${state.rectMode} -> ${secModel.subcktName})`,
      `XD_SR1 sec_p v_rect ${secModel.subcktName}`,
      `XD_SR2 0 sec_p ${secModel.subcktName}`,
      `XD_SR3 sec_n v_rect ${secModel.subcktName}`,
      `XD_SR4 0 sec_n ${secModel.subcktName}`,
      `L_OUT v_rect v_out ${state.Lo_uH.toFixed(2)}u Rser=1.5m`
    );
  }

  header.push(
    ``,
    `* Output Capacitor Bank & Load`,
    `C_OUT v_out 0 ${state.Co_uF.toFixed(1)}u Rser=${state.ESR_Co_mOhm.toFixed(2)}m`,
    `R_LOAD v_out 0 ${Rload_Ohm.toFixed(3)}`,
    ``,
    `* Error Amplifier & Type-II / Type-III Compensator Subcircuit (${state.controlType.toUpperCase()} -- ${res.type2Architecture === 'ota' ? `OTA gm=${res.ota_gm_mS.toFixed(2)}mS` : 'Op-Amp'})`,
    ...(!res.isTwoZeroComp && res.type2Architecture === 'ota'
      ? [
          `R_FB_TOP v_out fb_node ${res.R1_ota_kOhm.toFixed(2)}k`,
          `R_FB_BOT fb_node 0 ${res.R4_ota_kOhm.toFixed(2)}k`,
          `V_REF ref_node 0 DC 1.25`,
          `G_OTA 0 comp_node ref_node fb_node ${(res.ota_gm_mS * 1e-3).toFixed(5)}`,
          `R_DC_COMP comp_node 0 10Meg`,
          `R_OTA_Z comp_node comp_z ${res.R2_ota_kOhm.toFixed(2)}k`,
          `C_OTA_1 comp_z 0 ${res.C1_ota_e24_nF.toFixed(2)}n`,
          `C_OTA_2 comp_node 0 ${res.C2_ota_e24_pF.toFixed(0)}p`,
        ]
      : [
          `R_COMP_1 v_out fb_node ${res.R1_kOhm.toFixed(2)}k`,
          `R_FB_BOT fb_node 0 ${res.R1_kOhm.toFixed(2)}k`,
          `R_COMP_2 fb_node comp_z ${res.R2_kOhm.toFixed(2)}k`,
          `C_COMP_1 comp_z comp_node ${res.C1_e24_nF.toFixed(2)}n`,
          `C_COMP_2 fb_node comp_node ${res.C2_e24_pF.toFixed(0)}p`,
          `B_ERR comp_node 0 V=limit(2.5+1e3*(V(ref_node)-V(fb_node)),0.2,4.8)`,
          `V_REF ref_node 0 DC ${(state.Vout_V * 0.5).toFixed(3)}`,
        ]),
    `* PCMC Artificial Slope Ramp: Se=${res.Se_ramp_V_us.toFixed(3)} V/us, mc=${res.mc_slope.toFixed(2)}, Qp=${res.Qp_subharmonic.toFixed(2)}`,
    ``,
    `* Manufacturer Semiconductor .SUBCKT Models`,
    priModel.spiceText,
    secModel.spiceText,
    ``,
    `* Transient Simulation & Measurements`,
    `.ic V(v_out)=${(state.Vout_V * 0.92).toFixed(2)}`,
    `.options reltol=1m`,
    `.tran 0 ${tStop_us}u 0 25n`,
    `.meas TRAN Vout_avg AVG V(v_out) FROM ${(tStop_us * 0.72).toFixed(0)}u TO ${tStop_us}u`,
    `.meas TRAN Vout_pp PP V(v_out) FROM ${(tStop_us * 0.72).toFixed(0)}u TO ${tStop_us}u`,
    `.meas TRAN Ipri_rms RMS I(L_LK) FROM ${(tStop_us * 0.72).toFixed(0)}u TO ${tStop_us}u`,
    `.backanno`,
    `.end`
  );

  return header.join('\n');
}

/**
 * Generates an LTspice / QSPICE compatible .cir switching SPICE netlist
 * for the active AC-DC PFC Front-End stage with manufacturer .SUBCKT models.
 */
export function generateAcDcSpiceNetlist(state: AcDcDesignState, res: AcDcResults): string {
  const Vac_pk = state.Vac_rms_V * Math.SQRT2;
  const fswHz = state.fsw_kHz * 1e3;
  const swModel = generateManufacturerMosfetSubckt(res.sw, 1);
  const boostDiode = generatePfcBoostDiodeSubckt(state.Vdc_bus_V);
  const Rload_dc = (state.Vdc_bus_V * state.Vdc_bus_V) / Math.max(10, state.Pout_W);
  const nPh = res.nPhases;

  const lines = [
    `* ============================================================================`,
    `* VoltCraft Power Electronics Studio -- AC-DC PFC SPICE Netlist`,
    `* Topology: ${state.topology} | Preset: ${state.presetName}`,
    `* Vac=${state.Vac_rms_V}Vrms @ ${state.f_line_Hz}Hz -> Vdc=${state.Vdc_bus_V}V @ ${state.Pout_W}W`,
    `* Fast Switch: ${swModel.manufacturer} ${res.sw.id} (.SUBCKT ${swModel.subcktName})`,
    `* Boost Diode: ${boostDiode.manufacturer} ${boostDiode.mpn} | Lpfc=${state.Lpfc_uH}uH x${nPh} | Cdc=${state.Cdc_uF}uF`,
    `* ============================================================================`,
    `.param FSW=${fswHz} TSW={1/FSW} VAC_PK=${Vac_pk.toFixed(1)} FLINE=${state.f_line_Hz} VDC_REF=${state.Vdc_bus_V}`,
    ``,
    `* AC Mains & Differential EMI Input Filter`,
    `V_AC ac_in ac_n SIN(0 {VAC_PK} {FLINE})`,
    `R_AC_GND ac_n 0 10Meg`,
    `L_DM ac_in ac_dm ${res.Ldm_uH.toFixed(1)}u Rser=5m`,
    `C_X ac_dm ac_n ${res.Cx_each_uF.toFixed(2)}u`,
    `R_PRE ac_dm ac_bus ${state.prechargeR_Ohm ?? 22}`,
    ``,
    `* Full-Wave Input Bridge Rectifier (Vishay GBJ2510)`,
    `XD_R1 ac_bus v_rect GBJ2510_DIODE`,
    `XD_R2 0 ac_bus GBJ2510_DIODE`,
    `XD_R3 ac_n v_rect GBJ2510_DIODE`,
    `XD_R4 0 ac_n GBJ2510_DIODE`,
    ``,
    `* Boost Inductor Stage (${nPh}-Phase, Manufacturer .SUBCKT ${swModel.subcktName} & ${boostDiode.subcktName})`,
    `L_PFC1 v_rect sw1 ${state.Lpfc_uH.toFixed(1)}u Rser=8m`,
    `XQ_PFC1 sw1 g_pfc1 0 ${swModel.subcktName}`,
    `XD_B1 sw1 v_dc ${boostDiode.subcktName}`,
    `B_DUTY d_cmd 0 V=limit(1-abs(V(v_rect))/max(50,V(v_dc))+0.02*(VDC_REF-V(v_dc)),0.05,0.92)`,
    `V_SAW1 saw1 0 PULSE(0 1 0 {0.98*TSW} {0.02*TSW} 1n {TSW})`,
    `B_PWM1 g_pfc1 0 V=if(V(d_cmd)>V(saw1),12,0)`,
  ];

  if (nPh === 2) {
    lines.push(
      `L_PFC2 v_rect sw2 ${state.Lpfc_uH.toFixed(1)}u Rser=8m`,
      `XQ_PFC2 sw2 g_pfc2 0 ${swModel.subcktName}`,
      `XD_B2 sw2 v_dc ${boostDiode.subcktName}`,
      `V_SAW2 saw2 0 PULSE(0 1 {0.5*TSW} {0.98*TSW} {0.02*TSW} 1n {TSW})`,
      `B_PWM2 g_pfc2 0 V=if(V(d_cmd)>V(saw2),12,0)`
    );
  }

  lines.push(
    ``,
    `* DC-Link Hold-Up Bulk Capacitor Bank & Load`,
    `C_DC v_dc 0 ${state.Cdc_uF.toFixed(0)}u Rser=${state.ESR_Cdc_mOhm.toFixed(1)}m`,
    `R_LOAD v_dc 0 ${Rload_dc.toFixed(2)}`,
    ``,
    `* Manufacturer Semiconductor .SUBCKT Models`,
    swModel.spiceText,
    boostDiode.spiceText,
    ``,
    `.ic V(v_dc)=${state.Vdc_bus_V.toFixed(1)}`,
    `.options reltol=1m`,
    `.tran 0 ${(2 / state.f_line_Hz * 1e3).toFixed(1)}m 0 250n`,
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
#define DCDC_PCMC_QP_WC             (${dcdcRes.Qp_subharmonic_wc.toFixed(3)}f)
#define DCDC_TYPE2_IS_OTA           (${dcdcRes.type2Architecture === 'ota' ? 1 : 0})
#define DCDC_TYPE2_R1_KOHM          (${(dcdcRes.type2Architecture === 'ota' ? dcdcRes.R1_ota_kOhm : dcdcRes.R1_kOhm).toFixed(2)}f)
#define DCDC_TYPE2_R2_KOHM          (${(dcdcRes.type2Architecture === 'ota' ? dcdcRes.R2_ota_kOhm : dcdcRes.R2_kOhm).toFixed(2)}f)
#define DCDC_TYPE2_C1_NF            (${(dcdcRes.type2Architecture === 'ota' ? dcdcRes.C1_ota_e24_nF : dcdcRes.C1_e24_nF).toFixed(2)}f)
#define DCDC_TYPE2_C2_PF            (${(dcdcRes.type2Architecture === 'ota' ? dcdcRes.C2_ota_e24_pF : dcdcRes.C2_e24_pF).toFixed(0)}f)
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
