// ============================================================================
// PASSIVE DESIGN ENGINE: ALL INDUCTORS & ALL CAPACITORS IN CIRCUIT
// Iterative Physical Winding Solver (Powder & Gapped Ferrite) + COTS Matcher
// ============================================================================

import {
  AcDcDesignState,
  CapBranchSpec,
  CapTechnology,
  CORE_DATABASE,
  CoreSpec,
  DcDcDesignState,
  HybridCapBankConfig,
} from '../data/databases';
import { AcDcResults } from './acdcEngine';
import { DcDcResults, solveDcDcDesign } from './dcdcEngine';
import {
  INDUCTOR_CORE_DATABASE,
  INDUCTOR_MATERIAL_DATABASE,
  InductorCoreSpec,
  InductorMaterialSpec,
  MAGNET_WIRE_DATABASE,
  MagnetWireSpec,
  READY_COTS_CAPACITORS,
  READY_COTS_INDUCTORS,
  ReadyCotsCapacitorSpec,
  ReadyCotsInductorSpec,
} from '../data/passiveDatabase';

const MU_0 = 4 * Math.PI * 1e-7;

export type InductorRole = 'output-choke' | 'resonant-shim' | 'pfc-boost' | 'dm-emi' | 'cm-choke';

export interface CircuitInductorRequirement {
  id: string;
  designator: string;
  name: string;
  role: InductorRole;
  quantity: number;
  targetL_uH: number;
  I_dc_A: number;
  I_rms_A: number;
  I_pk_A: number;
  deltaI_pp_A: number;
  f_ripple_kHz: number;
  V_applied_V: number;
  Tamb_C: number;
  syncFieldL?:
    | { domain: 'dcdc'; key: 'Lo_uH' | 'Llk_uH' }
    | { domain: 'acdc'; key: 'Lpfc_uH'; dcrKey?: 'RL_mOhm' };
  description: string;
  windingNote: string;
}

export type InductorConductorForm = 'auto' | 'round' | 'flat-ribbon';

export interface InductorWindowFixOption {
  id: string;
  title: string;
  detail: string;
  predictedFill_pct: number;
  predictedTemp_C: number;
  patch: Partial<CustomInductorOverrides>;
}

export interface CustomInductorOverrides {
  targetL_uH?: number;
  coreId?: string;
  materialId?: string;
  turnsN?: number;
  airGap_mm?: number;
  wireAwg?: number;
  parallelStrands?: number;
  useLitz?: boolean;
  conductorForm?: InductorConductorForm;
}

export interface CustomInductorLocks {
  targetL_uH: boolean;
  coreId: boolean;
  materialId: boolean;
  turnsN: boolean;
  airGap_mm: boolean;
  wireAwg: boolean;
  parallelStrands: boolean;
  conductorForm: boolean;
}

export interface CustomInductorSolution {
  req: CircuitInductorRequirement;
  core: InductorCoreSpec;
  material: InductorMaterialSpec;
  wire: MagnetWireSpec;
  useLitz: boolean;
  conductorForm: 'round' | 'flat-ribbon';
  turnsN: number;
  parallelStrands: number;
  airGap_mm: number;
  fringingFactor: number;

  // Magnetic Telemetry
  AL_0_nH: number;
  L_0_uH: number;
  L_at_Idc_uH: number;
  L_at_Ipk_uH: number;
  rollOffAtIpk_pct: number;
  H_dc_Oe: number;
  H_pk_Oe: number;
  B_dc_T: number;
  B_ac_pk_T: number;
  deltaB_pp_T: number;
  B_pk_T: number;
  B_sat_T: number;
  satUtilization_pct: number;
  satMargin_pct: number;
  satStatus: 'ok' | 'warning' | 'critical';

  // Copper, Window & Loss Telemetry
  MLT_mm: number;
  wireLength_m: number;
  copperAreaTotal_mm2: number;
  J_rms_A_mm2: number;
  skinDepth_mm: number;
  R_dc_20C_mOhm: number;
  R_dc_hot_mOhm: number;
  Fr_ac: number;
  R_ac_mOhm: number;
  P_cu_dc_W: number;
  P_cu_ac_W: number;
  P_gap_fringing_W: number;
  P_cu_total_W: number;
  P_core_W: number;
  P_total_W: number;
  deltaT_C: number;
  T_hotspot_C: number;

  // Mechanical & Winding Window Fit
  windowFill_pct: number;
  maxSafeFill_pct: number;
  layersEst: number;
  turnsPerLayer: number;
  radialBuild_mm: number;
  radialMax_mm: number;
  radialFill_pct: number;
  copperSumArea_mm2: number;
  rawCopperAreaTotal_mm2: number;
  insulationPackingArea_mm2: number;
  maxSafeArea_mm2: number;
  windowFitStatus: 'ok' | 'tight' | 'overflow';
  fitDiagnostic: string;
  windowFixes: InductorWindowFixOption[];
  Ap_required_cm4: number;
  Ap_actual_cm4: number;

  // Curves for Charts
  biasCurve: {
    I_A: number;
    L_uH: number;
    B_pk_T: number;
    mu_pct: number;
  }[];
  turnsSweep: {
    N: number;
    P_total_W: number;
    B_pk_mT: number;
  }[];
}

export interface ReadyCotsInductorCandidate {
  part: ReadyCotsInductorSpec;
  seriesCount: number;
  parallelCount: number;
  totalUnits: number;
  configLabel: string;
  eff_L_uH: number;
  eff_I_rms_A: number;
  eff_I_sat_A: number;
  eff_DCR_mOhm: number;
  L_error_pct: number;
  Irms_margin_pct: number;
  Isat_margin_pct: number;
  estCopperLoss_W: number;
  estTotalCost_USD: number;
  fitStatus: 'optimal' | 'acceptable' | 'undersized';
  matchScore: number;
}

// ============================================================================
// 1. EXTRACT ALL INDUCTORS IN ACTIVE CONVERTER STAGE
// ============================================================================
export function extractCircuitInductors(
  mode: 'dcdc' | 'acdc',
  dcdcState: DcDcDesignState,
  dcdcRes: DcDcResults,
  acdcState: AcDcDesignState,
  acdcRes: AcDcResults
): CircuitInductorRequirement[] {
  if (mode === 'acdc') {
    const isInterleaved = acdcRes.nPhases === 2;
    const isDualBoost = acdcState.topology === 'dual-boost-bridgeless';
    const qty = isInterleaved || isDualBoost ? 2 : 1;
    const f_pfc_ripp = acdcState.fsw_kHz;
    const Vpfc_step = Math.max(acdcState.Vdc_bus_V * 0.5, acdcState.Vdc_bus_V - acdcState.Vac_min_V * Math.SQRT2);

    const pfcInductor: CircuitInductorRequirement = {
      id: 'pfc-boost',
      designator: qty === 2 ? 'L_PFC1, L_PFC2' : 'L_PFC',
      name: isInterleaved
        ? '2-Ph Interleaved PFC Boost Choke (per phase)'
        : isDualBoost
        ? 'Dual-Boost Bridgeless PFC Chokes'
        : 'Main Boost PFC Inductor',
      role: 'pfc-boost',
      quantity: qty,
      targetL_uH: acdcState.Lpfc_uH,
      I_dc_A: acdcRes.Iph_rms_A * 0.9,
      I_rms_A: acdcRes.Iph_rms_A,
      I_pk_A: acdcRes.Iph_pk_A + acdcRes.dIL_ph_max_A * 0.5,
      deltaI_pp_A: acdcRes.dIL_ph_max_A,
      f_ripple_kHz: f_pfc_ripp,
      V_applied_V: Vpfc_step,
      Tamb_C: 45,
      syncFieldL: { domain: 'acdc', key: 'Lpfc_uH', dcrKey: 'RL_mOhm' },
      description: 'Carries full line-frequency 50/60 Hz sinusoidal current + HF switching ripple with peak current at low AC line.',
      windingNote: 'Powder Toroid (KoolMµ / High-Flux) prevents hard saturation snap at brownout peak; single-layer reduces C_p.',
    };

    const dmAcChoke: CircuitInductorRequirement = {
      id: 'ac-dm-emi',
      designator: 'L_DM,AC',
      name: 'AC Input Differential-Mode EMI Choke',
      role: 'dm-emi',
      quantity: 1,
      targetL_uH: Math.max(15, Math.round(acdcRes.Ldm_uH)),
      I_dc_A: acdcRes.Iac_rms_max_A,
      I_rms_A: acdcRes.Iac_rms_max_A,
      I_pk_A: acdcRes.Iac_rms_max_A * Math.SQRT2 * 1.1,
      deltaI_pp_A: Math.max(0.4, acdcRes.dIin_net_max_A * 0.15),
      f_ripple_kHz: acdcRes.f_emi_fundamental_kHz,
      V_applied_V: 15,
      Tamb_C: 45,
      description: 'Attenuates differential-mode HF ripple at switching fundamental against CISPR 32 Class B limit.',
      windingNote: 'Sendust or Iron Powder -52 toroid with thick single-layer magnet wire for ultra-low 50/60 Hz conduction drop.',
    };

    const cmAcChoke: CircuitInductorRequirement = {
      id: 'ac-cm-emi',
      designator: 'L_CM,AC',
      name: 'AC Input Common-Mode EMI Choke (Bifilar)',
      role: 'cm-choke',
      quantity: 1,
      targetL_uH: Math.max(500, Math.round(acdcRes.Lcm_mH * 1000)),
      I_dc_A: 0, // Net flux cancels in bifilar CM winding!
      I_rms_A: acdcRes.Iac_rms_max_A,
      I_pk_A: 0.06, // High-impedance CM choke blocks HF CM leakage to ~30-60 mA peak
      deltaI_pp_A: 0.04,
      f_ripple_kHz: acdcRes.f_emi_fundamental_kHz,
      V_applied_V: 12,
      Tamb_C: 45,
      description: 'Current-compensated bifilar choke blocking switching CM displacement currents to PE earth.',
      windingNote: 'High-µ Vitroperm 500F nanocrystalline core; bifilar sector-wound (L/N separated by 3mm+ creepage barrier).',
    };

    return [pfcInductor, dmAcChoke, cmAcChoke];
  }

  // DC-DC Stage Inductors
  const isCDR = dcdcState.txType === 'current-doubler';
  const outQty = dcdcRes.nPhases * (isCDR ? 2 : 1);
  const Iout_choke_dc = dcdcRes.Iout_phase_A;
  const deltaI_choke = dcdcRes.deltaILo_phase_A;
  const Iout_choke_rms = Math.sqrt(Iout_choke_dc * Iout_choke_dc + (deltaI_choke * deltaI_choke) / 12);
  const Iout_choke_pk = Iout_choke_dc + deltaI_choke * 0.5;

  const outputChoke: CircuitInductorRequirement = {
    id: 'dcdc-out-choke',
    designator: outQty > 1 ? `L_o1..L_o${outQty}` : 'L_o',
    name: dcdcRes.isLLC
      ? 'Output Post-Filter Inductance (Optional LC Stage)'
      : isCDR
      ? 'Current-Doubler Output Filter Inductors (per leg)'
      : dcdcRes.nPhases === 2
      ? '2-Phase Interleaved Output Filter Inductors'
      : 'Main Output Filter Choke',
    role: 'output-choke',
    quantity: outQty,
    targetL_uH: Math.max(1.5, dcdcState.Lo_uH),
    I_dc_A: Iout_choke_dc,
    I_rms_A: Iout_choke_rms,
    I_pk_A: Iout_choke_pk,
    deltaI_pp_A: dcdcRes.isLLC ? Math.max(1.0, Iout_choke_dc * 0.12) : deltaI_choke,
    f_ripple_kHz: dcdcRes.fRipple_out_kHz / Math.max(1, dcdcRes.nPhases),
    V_applied_V: dcdcRes.isLLC ? 4 : Math.max(12, dcdcRes.Vsec_ideal_pk_V - dcdcState.Vout_V),
    Tamb_C: dcdcState.Tamb_C,
    syncFieldL: { domain: 'dcdc', key: 'Lo_uH' },
    description: dcdcRes.isLLC
      ? 'Optional small secondary post-filter inductor to attenuate HF switching ripple into the load rail.'
      : 'Primary energy-storage output choke smoothing rectified transformer pulses at high DC bias.',
    windingNote: 'High-DC-bias KoolMµ / High-Flux toroid OR Gapped PQ Ferrite with multi-strand / flat wire.',
  };

  // Primary Resonant / Shim Inductor Lr
  const Ipri_rms =
    (dcdcState.Pout_W / Math.max(0.8, 0.96) / Math.max(100, dcdcState.Vin_min_V)) *
    (dcdcRes.isLLC ? 1.15 : 1.05);
  const Ipri_pk = Math.max(Ipri_rms * 1.45, dcdcRes.I_lag_turnoff_A * 1.15);
  const L_ext_shim = Math.max(2.0, dcdcState.Llk_uH - (dcdcRes.isLLC ? 0 : Math.min(dcdcState.Llk_uH * 0.35, dcdcRes.Llk_geom_uH)));

  const resonantInductor: CircuitInductorRequirement = {
    id: 'dcdc-res-shim',
    designator: dcdcRes.isLLC ? 'L_r' : 'L_shim / L_lk',
    name: dcdcRes.isLLC
      ? 'Series Resonant Tank Inductor (L_r)'
      : 'Primary ZVS Commutation / Shim Inductor (External L_r)',
    role: 'resonant-shim',
    quantity: 1,
    targetL_uH: Number((dcdcRes.isLLC ? dcdcState.Llk_uH : L_ext_shim).toFixed(2)),
    I_dc_A: 0, // Pure AC zero-DC bipolar waveform!
    I_rms_A: Ipri_rms,
    I_pk_A: Ipri_pk,
    deltaI_pp_A: Ipri_pk * 2,
    f_ripple_kHz: dcdcState.fsw_kHz,
    V_applied_V: dcdcState.Vin_nom_V * 0.5,
    Tamb_C: dcdcState.Tamb_C,
    syncFieldL: { domain: 'dcdc', key: 'Llk_uH' },
    description: dcdcRes.isLLC
      ? 'Pure AC high-frequency resonant tank inductor setting f_r = 1/(2π√(L_r·C_r)) and ZVS energy.'
      : 'Pure AC ZVS commutation choke augmenting transformer leakage to guarantee lagging-leg soft switching.',
    windingNote: 'Zero DC bias -> MUST use low-loss Gapped Ferrite (PC95/N97) with Litz wire & center-leg gap!',
  };

  const Iin_dc_bus = dcdcState.Pout_W / (0.96 * dcdcState.Vin_min_V);
  const dmDcChoke: CircuitInductorRequirement = {
    id: 'dcdc-dm-emi',
    designator: 'L_DM,IN',
    name: 'Input DC-Bus Differential-Mode EMI Filter Choke',
    role: 'dm-emi',
    quantity: 1,
    targetL_uH: Math.max(4.7, Number(dcdcRes.L_emi_uH.toFixed(1))),
    I_dc_A: Iin_dc_bus,
    I_rms_A: Iin_dc_bus * 1.04,
    I_pk_A: Iin_dc_bus * 1.25,
    deltaI_pp_A: Math.max(0.5, Iin_dc_bus * 0.12),
    f_ripple_kHz: dcdcState.fsw_kHz * 2,
    V_applied_V: 12,
    Tamb_C: dcdcState.Tamb_C,
    description: 'Forms 2nd-order Middlebrook-damped input LC filter isolating primary bridge ripple from DC source.',
    windingNote: 'Compact KoolMµ / Iron-Powder toroid keeps Z_out < Z_in(-R) across Middlebrook boundary.',
  };

  const cmDcChoke: CircuitInductorRequirement = {
    id: 'dcdc-cm-emi',
    designator: 'L_CM,IN',
    name: 'Primary Input Common-Mode EMI Choke',
    role: 'cm-choke',
    quantity: 1,
    targetL_uH: 1500,
    I_dc_A: 0,
    I_rms_A: Iin_dc_bus * 1.05,
    I_pk_A: 0.12,
    deltaI_pp_A: 0.06,
    f_ripple_kHz: dcdcState.fsw_kHz,
    V_applied_V: 10,
    Tamb_C: dcdcState.Tamb_C,
    description: 'Suppresses inter-winding parasitic C_ww dv/dt displacement currents across isolation barrier.',
    windingNote: 'Nanocrystalline Vitroperm 500F toroid with split bifilar winding (>= 4mm primary HV clearance).',
  };

  return [outputChoke, resonantInductor, dmDcChoke, cmDcChoke];
}

// ============================================================================
// 2. AUTO-SELECTION & ITERATIVE MAGNETIC WINDING SOLVER
// ============================================================================

function computePowderMuFrac(mat: InductorMaterialSpec, H_Oe: number): number {
  if (mat.category === 'ferrite' || mat.category === 'nanocrystalline') return 1.0;
  const h = Math.max(0, H_Oe);
  return 1 / (1 + mat.bias_a * Math.pow(h, mat.bias_b));
}

function getDefaultMaterialForRole(role: InductorRole): InductorMaterialSpec {
  if (role === 'resonant-shim') {
    return INDUCTOR_MATERIAL_DATABASE.find((m) => m.id === 'ferrite-pc95')!;
  }
  if (role === 'cm-choke') {
    return INDUCTOR_MATERIAL_DATABASE.find((m) => m.id === 'vitroperm-500f')!;
  }
  if (role === 'pfc-boost') {
    return INDUCTOR_MATERIAL_DATABASE.find((m) => m.id === 'high-flux-60')!;
  }
  if (role === 'dm-emi') {
    return INDUCTOR_MATERIAL_DATABASE.find((m) => m.id === 'koolmu-40')!;
  }
  return INDUCTOR_MATERIAL_DATABASE.find((m) => m.id === 'koolmu-max-60')!;
}

function computeRequiredApCm4(req: CircuitInductorRequirement, Bmax_T = 0.35, Ku = 0.4, J_A_mm2 = 4.5): number {
  const L_H = req.targetL_uH * 1e-6;
  // Energy handling capacity: Ap (cm^4) = (L * Ipk * Irms * 1e4) / (Ku * Bmax * J)
  return (L_H * req.I_pk_A * Math.max(0.5, req.I_rms_A) * 1e4) / (Ku * Bmax_T * J_A_mm2);
}

function solveCoreTrial(
  req: CircuitInductorRequirement,
  core: InductorCoreSpec,
  mat: InductorMaterialSpec,
  targetL_uH: number,
  lockedN?: number,
  lockedGap_mm?: number,
  lockedAwg?: number,
  lockedStrands?: number,
  useLitzOverride?: boolean,
  conductorFormPref: InductorConductorForm = 'auto',
  includeFixes = true
): CustomInductorSolution {
  const Ae_m2 = core.Ae_mm2 * 1e-6;
  const le_m = core.le_mm * 1e-3;
  const Ve_m3 = core.Ve_mm3 * 1e-9;
  const isFerrite = mat.category === 'ferrite';
  const isCM = mat.category === 'nanocrystalline' || req.role === 'cm-choke';
  const targetL_H = Math.max(0.5, targetL_uH) * 1e-6;
  const f_kHz = Math.max(10, req.f_ripple_kHz);
  const f_Hz = f_kHz * 1e3;

  // Skin depth in Copper at ~90°C
  const skinDepth_mm = 72 / Math.sqrt(f_Hz);

  // Target B_limit to keep generous saturation headroom
  const B_design_lim_T = isFerrite
    ? 0.28 // Keep < 0.28T on 0.39-0.41T ferrite to allow overload margin
    : isCM
    ? 0.45
    : mat.Bsat_T * 0.65;

  // Determine Turns N & Air Gap
  let N = lockedN ?? 10;
  let airGap_mm = lockedGap_mm ?? 0;
  let fringingFactor = 1.0;

  if (isFerrite) {
    // Minimum turns against saturation at peak current
    const N_sat_min = Math.max(
      2,
      Math.ceil((targetL_H * Math.max(0.2, req.I_pk_A)) / (B_design_lim_T * Ae_m2))
    );
    // Core-loss-balanced turns estimate (try slightly more turns if AC ripple is huge)
    const B_ac_target_T = f_kHz >= 100 ? 0.08 : 0.12;
    const N_ac_est =
      req.I_dc_A < 0.2 * req.I_pk_A
        ? Math.max(N_sat_min, Math.ceil((targetL_H * (req.deltaI_pp_A * 0.5)) / (B_ac_target_T * Ae_m2)))
        : N_sat_min;

    if (lockedN === undefined) {
      N = Math.max(2, Math.min(200, Math.round((N_sat_min + N_ac_est) * 0.5)));
    }
    if (lockedGap_mm === undefined) {
      const relCore = le_m / (MU_0 * mat.mu_i * Ae_m2);
      const relReq = (N * N) / targetL_H;
      const relGap = Math.max(0.05e6, relReq - relCore);
      const lg_m_ideal = relGap * MU_0 * Ae_m2;
      // Iterative fringing correction F = 1 + (lg / sqrt(Ae)) * ln(2*hw / lg)
      let lg_mm_est = lg_m_ideal * 1e3;
      for (let k = 0; k < 4; k++) {
        const lg_cm = Math.max(0.01, lg_mm_est / 10);
        const G_cm = Math.max(0.4, core.bw_mm / 10);
        const F = 1 + (lg_cm / Math.sqrt(Math.max(0.1, core.Ae_mm2 / 100))) * Math.log((2 * G_cm) / lg_cm);
        fringingFactor = Math.max(1.0, Math.min(1.6, F));
        lg_mm_est = (lg_m_ideal * fringingFactor) * 1e3;
      }
      airGap_mm = Number(Math.max(0.05, Math.min(8.0, lg_mm_est)).toFixed(2));
    } else {
      const lg_cm = Math.max(0.01, airGap_mm / 10);
      const G_cm = Math.max(0.4, core.bw_mm / 10);
      fringingFactor = Math.max(
        1.0,
        Math.min(1.6, 1 + (lg_cm / Math.sqrt(Math.max(0.1, core.Ae_mm2 / 100))) * Math.log((2 * G_cm) / lg_cm))
      );
    }
  } else if (isCM) {
    airGap_mm = 0;
    const AL_0_H = (MU_0 * mat.mu_i * Ae_m2) / le_m;
    if (lockedN === undefined) {
      N = Math.max(4, Math.min(60, Math.round(Math.sqrt(targetL_H / AL_0_H))));
    }
  } else {
    // Powder core (distributed gap): solve N iteratively accounting for DC bias roll-off!
    airGap_mm = 0;
    const AL_0_H = (MU_0 * mat.mu_i * Ae_m2) / le_m;
    if (lockedN === undefined) {
      let nTry = Math.max(4, Math.round(Math.sqrt(targetL_H / AL_0_H)));
      for (let iter = 0; iter < 15; iter++) {
        const H_dc_Am = (nTry * req.I_dc_A) / le_m;
        const H_dc_Oe = H_dc_Am * 0.012566;
        const muFrac = computePowderMuFrac(mat, H_dc_Oe);
        const L_dc_uH = AL_0_H * 1e6 * nTry * nTry * muFrac;
        const B_pk_try = (L_dc_uH * 1e-6 * req.I_pk_A) / (nTry * Ae_m2);
        if (B_pk_try > B_design_lim_T && nTry < 240) {
          nTry += 1;
          continue;
        }
        if (Math.abs(L_dc_uH - targetL_uH) / Math.max(1, targetL_uH) < 0.025) break;
        const ratio = Math.sqrt(targetL_uH / Math.max(0.2, L_dc_uH));
        const nextN = Math.max(4, Math.min(260, Math.round(nTry * (0.65 * ratio + 0.35))));
        if (nextN === nTry) break;
        nTry = nextN;
      }
      N = nTry;
    }
  }

  // Compute exact Magnetic Field Parameters
  const AL_0_nH = ((MU_0 * mat.mu_i * Ae_m2) / le_m) * 1e9;
  const relCore = le_m / (MU_0 * mat.mu_i * Ae_m2);
  const relGap = isFerrite ? (airGap_mm * 1e-3) / (MU_0 * Ae_m2 * fringingFactor) : 0;

  const evalLAtCurrent = (I_A: number) => {
    if (isFerrite) {
      const L_lin_uH = ((N * N) / (relCore + relGap)) * 1e6;
      const B_lin_T = (L_lin_uH * 1e-6 * I_A) / (N * Ae_m2);
      // Soft knee above 88% Bsat for gapped ferrite
      const knee = Math.max(0, (B_lin_T - 0.88 * mat.Bsat_T) / (0.12 * mat.Bsat_T));
      const L_eff_uH = L_lin_uH / (1 + Math.pow(knee, 2.8) * 3.5);
      return { L_uH: L_eff_uH, B_T: Math.min(mat.Bsat_T * 1.05, B_lin_T / (1 + 0.2 * knee)), mu_pct: (L_eff_uH / L_lin_uH) * 100 };
    } else if (isCM) {
      const L_cm_uH = AL_0_nH * 1e-3 * N * N;
      const B_cm_T = (L_cm_uH * 1e-6 * I_A) / (N * Ae_m2);
      return { L_uH: L_cm_uH, B_T: B_cm_T, mu_pct: 100 };
    } else {
      const H_Am = (N * I_A) / le_m;
      const H_Oe = H_Am * 0.012566;
      const muFrac = computePowderMuFrac(mat, H_Oe);
      const L_uH = AL_0_nH * 1e-3 * N * N * muFrac;
      const B_T = (L_uH * 1e-6 * I_A) / (N * Ae_m2);
      return { L_uH, B_T, mu_pct: muFrac * 100 };
    }
  };

  const atZero = evalLAtCurrent(0.01);
  const atIdc = evalLAtCurrent(req.I_dc_A);
  const atIpk = evalLAtCurrent(req.I_pk_A);
  const L_0_uH = atZero.L_uH;
  const L_at_Idc_uH = atIdc.L_uH;
  const L_at_Ipk_uH = atIpk.L_uH;
  const rollOffAtIpk_pct = Math.max(0, (1 - L_at_Ipk_uH / Math.max(0.01, L_0_uH)) * 100);

  const H_dc_Oe = ((N * req.I_dc_A) / le_m) * 0.012566;
  const H_pk_Oe = ((N * req.I_pk_A) / le_m) * 0.012566;
  const B_dc_T = atIdc.B_T;
  const deltaB_pp_T = (L_at_Idc_uH * 1e-6 * req.deltaI_pp_A) / (N * Ae_m2);
  const B_ac_pk_T = deltaB_pp_T * 0.5;
  const B_pk_T = Math.max(atIpk.B_T, B_dc_T + B_ac_pk_T);
  const B_sat_T = mat.Bsat_T;
  const satUtilization_pct = (B_pk_T / B_sat_T) * 100;
  const satMargin_pct = Math.max(-100, (1 - B_pk_T / B_sat_T) * 100);
  const satStatus: 'ok' | 'warning' | 'critical' =
    satUtilization_pct >= 92 ? 'critical' : satUtilization_pct >= 78 ? 'warning' : 'ok';

  // Wire Sizing (Auto or Locked)
  const useLitz = useLitzOverride ?? (f_kHz >= 90 && req.deltaI_pp_A > req.I_rms_A * 0.45);
  const J_target_A_mm2 = 4.4;
  const A_cu_req_mm2 = Math.max(0.15, req.I_rms_A / J_target_A_mm2);

  let selectedWire: MagnetWireSpec = MAGNET_WIRE_DATABASE[4]; // AWG 16 default
  let parallelStrands = lockedStrands ?? 1;

  if (lockedAwg !== undefined) {
    selectedWire =
      MAGNET_WIRE_DATABASE.find((w) => w.awg === lockedAwg) ||
      MAGNET_WIRE_DATABASE[4];
    if (lockedStrands === undefined) {
      parallelStrands = Math.max(1, Math.min(48, Math.ceil(A_cu_req_mm2 / selectedWire.area_mm2)));
    }
  } else {
    // Auto-select wire diameter <= 2.4 * skin depth to curb skin effect, stepping up AWG when DC/LF current dominates
    const maxBareDiam_mm = Math.max(0.35, Math.min(2.6, 2.4 * skinDepth_mm));
    const candidates = MAGNET_WIRE_DATABASE.filter((w) => w.d_bare_mm <= maxBareDiam_mm);
    selectedWire = candidates[0] || MAGNET_WIRE_DATABASE[MAGNET_WIRE_DATABASE.length - 1];
    if (lockedStrands === undefined) {
      parallelStrands = Math.max(1, Math.min(48, Math.ceil(A_cu_req_mm2 / selectedWire.area_mm2)));
      // Step up to thicker wire when > 8 strands would be needed and DC/LF current dominates HF ripple
      if (parallelStrands > 8) {
        const allowThickMultiplier = req.deltaI_pp_A < req.I_rms_A * 0.55 ? 2.4 : 1.5;
        const thicker = MAGNET_WIRE_DATABASE.find(
          (w) =>
            Math.ceil(A_cu_req_mm2 / w.area_mm2) <= 10 &&
            (w.d_bare_mm <= Math.max(maxBareDiam_mm * allowThickMultiplier, 1.65) ||
              req.deltaI_pp_A < req.I_rms_A * 0.45)
        );
        if (thicker) {
          selectedWire = thicker;
          parallelStrands = Math.max(1, Math.min(48, Math.ceil(A_cu_req_mm2 / selectedWire.area_mm2)));
        }
      }
    }
  }

  const totalWindTurns = N * (isCM ? 2 : 1);
  const copperAreaTotal_mm2 = selectedWire.area_mm2 * parallelStrands;
  const rawCopperAreaTotal_mm2 = totalWindTurns * copperAreaTotal_mm2;
  const maxSafeFill_pct = core.shape === 'toroid' ? 45 : 58;
  const maxSafeArea_mm2 = (core.Aw_mm2 * maxSafeFill_pct) / 100;

  // Evaluate Round vs Side-by-Side Flat Ribbon geometry
  const windingWidth_mm =
    core.shape === 'toroid' ? Math.PI * (core.id_or_B_mm * 0.78) : core.bw_mm * 0.88;
  const radialMax_mm =
    core.shape === 'toroid' ? core.id_or_B_mm * 0.36 : core.hw_mm * 0.88;

  const evalPacking = (form: 'round' | 'flat-ribbon') => {
    // Round twisted bundle wastes ~18% interstitial space; flat side-by-side ribbons pack at ~6% interstitial overhead
    const packOverhead = form === 'flat-ribbon' && parallelStrands >= 2 ? 1.06 : 1.18;
    const effTurnArea = Math.pow(selectedWire.d_od_mm, 2) * (Math.PI / 4) * parallelStrands * packOverhead;
    const sumArea = totalWindTurns * effTurnArea;
    const areaFillPct = (sumArea / Math.max(1, core.Aw_mm2)) * 100;

    // Layer & radial height model
    const axialTurnWidth_mm =
      form === 'flat-ribbon' && parallelStrands >= 2
        ? selectedWire.d_od_mm * Math.min(parallelStrands, Math.max(1, Math.floor(windingWidth_mm / (totalWindTurns * selectedWire.d_od_mm)) || parallelStrands))
        : selectedWire.d_od_mm * Math.sqrt(parallelStrands);
    const layerHeight_mm =
      form === 'flat-ribbon' && parallelStrands >= 2
        ? selectedWire.d_od_mm * Math.ceil(parallelStrands / Math.max(1, Math.floor(axialTurnWidth_mm / selectedWire.d_od_mm)))
        : selectedWire.d_od_mm * Math.sqrt(parallelStrands);

    const tPerLayer = Math.max(1, Math.floor(windingWidth_mm / Math.max(0.35, axialTurnWidth_mm)));
    const nLayers = Math.max(1, Math.ceil(totalWindTurns / tPerLayer));
    const radBuild_mm = nLayers * layerHeight_mm + Math.max(0, nLayers - 1) * 0.08;
    return { sumArea, areaFillPct, tPerLayer, nLayers, radBuild_mm };
  };

  let resolvedForm: 'round' | 'flat-ribbon';
  if (conductorFormPref === 'round') {
    resolvedForm = 'round';
  } else if (conductorFormPref === 'flat-ribbon') {
    resolvedForm = 'flat-ribbon';
  } else {
    const roundPack = evalPacking('round');
    const flatPack = evalPacking('flat-ribbon');
    // Auto prefers flat side-by-side ribbons when multiple strands exist and round exceeds safe fill or swells radially
    resolvedForm =
      parallelStrands >= 2 && (roundPack.areaFillPct > maxSafeFill_pct || roundPack.radBuild_mm > radialMax_mm * 0.85 || flatPack.radBuild_mm < roundPack.radBuild_mm * 0.8)
        ? 'flat-ribbon'
        : 'round';
  }

  const activePack = evalPacking(resolvedForm);
  const copperSumArea_mm2 = activePack.sumArea;
  const insulationPackingArea_mm2 = Math.max(0, copperSumArea_mm2 - rawCopperAreaTotal_mm2);
  const windowFill_pct = activePack.areaFillPct;
  const turnsPerLayer = activePack.tPerLayer;
  const layersEst = activePack.nLayers;
  const radialBuild_mm = activePack.radBuild_mm;
  const radialFill_pct = (radialBuild_mm / Math.max(1, radialMax_mm)) * 100;

  // Adjust MLT with fill factor
  const MLT_mm = core.MLT_base_mm * (0.9 + 0.25 * Math.min(1.2, windowFill_pct / 45));
  const wireLength_m = (N * MLT_mm) / 1000;
  const R_dc_20C_mOhm = (selectedWire.R20_mOhm_m * wireLength_m) / parallelStrands;
  // Assume ~85°C copper steady temperature for hot DCR
  const R_dc_hot_mOhm = R_dc_20C_mOhm * (1 + 0.00393 * (85 - 20));

  // Dowell AC resistance factor Fr at f_ripple_kHz
  const d_eff_mm = useLitz ? 0.102 : selectedWire.d_bare_mm; // AWG 38 Litz strand = 0.102mm
  const deltaRatio = (d_eff_mm * 0.886) / Math.max(0.05, skinDepth_mm);
  const mProx = useLitz ? 1.2 : layersEst;
  const d_clamped = Math.min(5.0, Math.max(0.05, deltaRatio));
  const Fr_ac = Math.max(
    1.0,
    1.0 + 0.08 * Math.pow(d_clamped, 3.2) + ((mProx * mProx - 1) / 3) * 0.12 * Math.pow(d_clamped, 2.2)
  );
  const R_ac_mOhm = R_dc_hot_mOhm * Fr_ac;

  // Copper Losses (DC/line RMS component + HF AC ripple RMS component + gapped ferrite fringing eddy loss)
  const I_hf_rms_A = req.deltaI_pp_A / Math.sqrt(12);
  const I_lf_rms_A = Math.sqrt(Math.max(0, req.I_rms_A * req.I_rms_A - I_hf_rms_A * I_hf_rms_A));
  const P_cu_dc_W = I_lf_rms_A * I_lf_rms_A * (R_dc_hot_mOhm * 1e-3) * (isCM ? 2 : 1);
  const P_cu_ac_W = I_hf_rms_A * I_hf_rms_A * (R_ac_mOhm * 1e-3) * (isCM ? 2 : 1);
  // Gapped ferrite center-leg fringing H-field proximity loss in inner winding layers
  const gapProximityScale =
    isFerrite && airGap_mm > 0.02
      ? Math.min(2.5, (airGap_mm / Math.max(4, core.bw_mm)) * (useLitz ? 0.12 : 0.85) * Math.pow(d_clamped, 1.8))
      : 0;
  const P_gap_fringing_W = Number((P_cu_ac_W * gapProximityScale).toFixed(3));
  const P_cu_total_W = P_cu_dc_W + P_cu_ac_W + P_gap_fringing_W;

  // Steinmetz Core Loss (kW/m^3 -> W)
  const Pv_kW_m3 = mat.k_se * Math.pow(f_kHz, mat.alpha) * Math.pow(Math.max(0.002, B_ac_pk_T), mat.beta);
  const P_core_W = Pv_kW_m3 * 1e3 * Ve_m3;
  const P_total_W = P_cu_total_W + P_core_W;
  const deltaT_C = P_total_W * core.Rth_CW;
  const T_hotspot_C = req.Tamb_C + deltaT_C;

  const isAreaOverflow = windowFill_pct > maxSafeFill_pct + 8;
  const isRadialOverflow = core.shape !== 'toroid' && radialBuild_mm > core.hw_mm * 0.96;
  const isAreaTight = windowFill_pct > maxSafeFill_pct;
  const isRadialTight = radialBuild_mm > radialMax_mm;

  const windowFitStatus: 'ok' | 'tight' | 'overflow' =
    isAreaOverflow || isRadialOverflow
      ? 'overflow'
      : isAreaTight || isRadialTight
      ? 'tight'
      : 'ok';

  // Root-cause diagnostic message
  let fitDiagnostic = `${N}T × ${parallelStrands}×AWG${selectedWire.awg} (${resolvedForm === 'flat-ribbon' ? 'side-by-side flat ribbon' : 'round bundle'}) fits comfortably: ${copperSumArea_mm2.toFixed(0)} mm² vs ${maxSafeArea_mm2.toFixed(0)} mm² safe window (${windowFill_pct.toFixed(1)}%).`;
  if (windowFitStatus !== 'ok') {
    const reasons: string[] = [];
    if (isAreaOverflow || isAreaTight) {
      reasons.push(
        `Copper + packing needs ${copperSumArea_mm2.toFixed(0)} mm² vs ${maxSafeArea_mm2.toFixed(0)} mm² safe ${core.shape === 'toroid' ? 'toroid ID' : 'bobbin'} limit (${windowFill_pct.toFixed(1)}% vs ${maxSafeFill_pct}% max)`
      );
    }
    if (isRadialOverflow || isRadialTight) {
      reasons.push(
        `Radial stack ${radialBuild_mm.toFixed(1)} mm (${layersEst} layers) reaches ${radialFill_pct.toFixed(0)}% of ${radialMax_mm.toFixed(1)} mm available height`
      );
    }
    if (resolvedForm === 'round' && parallelStrands >= 2) {
      reasons.push(`Round bundle twist wastes space; side-by-side flat ribbons cut build`);
    }
    fitDiagnostic = reasons.join('. ') + '.';
  }

  // Generate Ranked 1-Click Fix Suggestions if Tight or Overflow
  const windowFixes: InductorWindowFixOption[] = [];
  if (includeFixes && windowFitStatus !== 'ok') {
    // 1. Flat-ribbon packing option
    if (resolvedForm !== 'flat-ribbon' && parallelStrands >= 2) {
      const flatTrial = solveCoreTrial(
        req,
        core,
        mat,
        targetL_uH,
        lockedN,
        lockedGap_mm,
        lockedAwg,
        lockedStrands,
        useLitzOverride,
        'flat-ribbon',
        false
      );
      if (flatTrial.windowFill_pct < windowFill_pct || flatTrial.radialBuild_mm < radialBuild_mm) {
        windowFixes.push({
          id: 'ind-flat-ribbon',
          title: 'Pack Strands Side-by-Side (Flat Ribbon)',
          detail: `Window fill ${windowFill_pct.toFixed(1)}% → ${flatTrial.windowFill_pct.toFixed(1)}%, radial build ${radialBuild_mm.toFixed(1)} → ${flatTrial.radialBuild_mm.toFixed(1)} mm`,
          predictedFill_pct: flatTrial.windowFill_pct,
          predictedTemp_C: flatTrial.T_hotspot_C,
          patch: { conductorForm: 'flat-ribbon' },
        });
      }
    }

    // 2. Step up to smallest larger compatible core that fits cleanly
    const compatFamily: InductorCoreSpec['family'] =
      mat.category === 'nanocrystalline' ? 'cm-toroid' : mat.category === 'ferrite' ? 'ferrite' : 'powder';
    const largerCores = INDUCTOR_CORE_DATABASE
      .filter((c) => c.family === compatFamily && c.Aw_mm2 > core.Aw_mm2)
      .sort((a, b) => a.Aw_mm2 - b.Aw_mm2);
    for (const c of largerCores) {
      const coreTrial = solveCoreTrial(
        req,
        c,
        mat,
        targetL_uH,
        lockedN,
        lockedGap_mm,
        lockedAwg,
        lockedStrands,
        useLitzOverride,
        'auto',
        false
      );
      if (coreTrial.windowFitStatus === 'ok' && coreTrial.satStatus !== 'critical') {
        windowFixes.push({
          id: `ind-core-${c.id}`,
          title: `Step Up Core to ${c.name.split(' (')[0]}`,
          detail: `Aw increases ${core.Aw_mm2} → ${c.Aw_mm2} mm² · Fill drops ${windowFill_pct.toFixed(1)}% → ${coreTrial.windowFill_pct.toFixed(1)}%`,
          predictedFill_pct: coreTrial.windowFill_pct,
          predictedTemp_C: coreTrial.T_hotspot_C,
          patch: { coreId: c.id, conductorForm: 'auto' },
        });
        break;
      }
    }

    // 3. Relax J slightly (~5.5 A/mm2) if thermally safe
    const reducedStrands = Math.max(1, Math.ceil((req.I_rms_A / 5.6) / selectedWire.area_mm2));
    if (reducedStrands < parallelStrands) {
      const strandTrial = solveCoreTrial(
        req,
        core,
        mat,
        targetL_uH,
        lockedN,
        lockedGap_mm,
        selectedWire.awg,
        reducedStrands,
        useLitzOverride,
        'flat-ribbon',
        false
      );
      windowFixes.push({
        id: 'ind-reduce-strands',
        title: `Compact to ${reducedStrands}× AWG${selectedWire.awg} (J = ${strandTrial.J_rms_A_mm2.toFixed(1)} A/mm²)`,
        detail: `Fill ${windowFill_pct.toFixed(1)}% → ${strandTrial.windowFill_pct.toFixed(1)}% · T_hot ≈ ${strandTrial.T_hotspot_C.toFixed(0)}°C`,
        predictedFill_pct: strandTrial.windowFill_pct,
        predictedTemp_C: strandTrial.T_hotspot_C,
        patch: { parallelStrands: reducedStrands, wireAwg: selectedWire.awg, conductorForm: 'flat-ribbon' },
      });
    }

    // 4. Higher Bsat / Perm material if powder toroid requires excessive turns
    if (!isFerrite && !isCM && mat.id !== 'high-flux-60') {
      const hfMat = INDUCTOR_MATERIAL_DATABASE.find((m) => m.id === 'high-flux-60');
      if (hfMat) {
        const matTrial = solveCoreTrial(
          req,
          core,
          hfMat,
          targetL_uH,
          undefined,
          undefined,
          lockedAwg,
          lockedStrands,
          useLitzOverride,
          'auto',
          false
        );
        if (matTrial.windowFill_pct < windowFill_pct - 3) {
          windowFixes.push({
            id: 'ind-highflux',
            title: 'Switch Material to High-Flux 60µ (1.5 T)',
            detail: `Fewer turns (${N}T → ${matTrial.turnsN}T) · Fill drops ${windowFill_pct.toFixed(1)}% → ${matTrial.windowFill_pct.toFixed(1)}%`,
            predictedFill_pct: matTrial.windowFill_pct,
            predictedTemp_C: matTrial.T_hotspot_C,
            patch: { materialId: 'high-flux-60', turnsN: matTrial.turnsN },
          });
        }
      }
    }
  }

  // Generate I_dc Bias Curve (0 to 1.5 * I_pk)
  const iMaxPlot = Math.max(5, Math.ceil(req.I_pk_A * 1.45));
  const biasCurve: CustomInductorSolution['biasCurve'] = [];
  for (let i = 0; i <= 16; i++) {
    const I_A = Number(((iMaxPlot * i) / 16).toFixed(2));
    const pt = evalLAtCurrent(I_A);
    biasCurve.push({
      I_A,
      L_uH: Number(pt.L_uH.toFixed(2)),
      B_pk_T: Number(pt.B_T.toFixed(3)),
      mu_pct: Number(pt.mu_pct.toFixed(1)),
    });
  }

  // Generate Turns vs Total Loss Sweep
  const turnsSweep: CustomInductorSolution['turnsSweep'] = [];
  const nMin = Math.max(3, Math.floor(N * 0.5));
  const nMax = Math.max(nMin + 8, Math.ceil(N * 1.7));
  const step = Math.max(1, Math.round((nMax - nMin) / 12));
  for (let nTry = nMin; nTry <= nMax; nTry += step) {
    const scale = nTry / N;
    const pCu = P_cu_total_W * scale;
    const bAc = B_ac_pk_T / scale;
    const pv = mat.k_se * Math.pow(f_kHz, mat.alpha) * Math.pow(Math.max(0.002, bAc), mat.beta);
    const pFe = pv * 1e3 * Ve_m3;
    turnsSweep.push({
      N: nTry,
      P_total_W: Number((pCu + pFe).toFixed(2)),
      B_pk_mT: Number(((B_pk_T / scale) * 1000).toFixed(1)),
    });
  }

  return {
    req,
    core,
    material: mat,
    wire: selectedWire,
    useLitz,
    conductorForm: resolvedForm,
    turnsN: N,
    parallelStrands,
    airGap_mm,
    fringingFactor,
    AL_0_nH,
    L_0_uH,
    L_at_Idc_uH,
    L_at_Ipk_uH,
    rollOffAtIpk_pct,
    H_dc_Oe,
    H_pk_Oe,
    B_dc_T,
    B_ac_pk_T,
    deltaB_pp_T,
    B_pk_T,
    B_sat_T,
    satUtilization_pct,
    satMargin_pct,
    satStatus,
    MLT_mm,
    wireLength_m,
    copperAreaTotal_mm2,
    J_rms_A_mm2: req.I_rms_A / copperAreaTotal_mm2,
    skinDepth_mm,
    R_dc_20C_mOhm,
    R_dc_hot_mOhm,
    Fr_ac,
    R_ac_mOhm,
    P_cu_dc_W,
    P_cu_ac_W,
    P_gap_fringing_W,
    P_cu_total_W,
    P_core_W,
    P_total_W,
    deltaT_C,
    T_hotspot_C,
    windowFill_pct,
    maxSafeFill_pct,
    layersEst,
    turnsPerLayer,
    radialBuild_mm,
    radialMax_mm,
    radialFill_pct,
    copperSumArea_mm2,
    rawCopperAreaTotal_mm2,
    insulationPackingArea_mm2,
    maxSafeArea_mm2,
    windowFitStatus,
    fitDiagnostic,
    windowFixes,
    Ap_required_cm4: computeRequiredApCm4(req, mat.Bsat_T * 0.55),
    Ap_actual_cm4: (core.Ae_mm2 * core.Aw_mm2) / 1e4,
    biasCurve,
    turnsSweep,
  };
}

export function solveCustomInductorDesign(
  req: CircuitInductorRequirement,
  overrides: CustomInductorOverrides,
  locks: CustomInductorLocks
): CustomInductorSolution {
  const effTargetL = locks.targetL_uH && overrides.targetL_uH !== undefined
    ? overrides.targetL_uH
    : req.targetL_uH;

  const chosenMat =
    locks.materialId && overrides.materialId
      ? INDUCTOR_MATERIAL_DATABASE.find((m) => m.id === overrides.materialId) || getDefaultMaterialForRole(req.role)
      : overrides.materialId
      ? INDUCTOR_MATERIAL_DATABASE.find((m) => m.id === overrides.materialId) || getDefaultMaterialForRole(req.role)
      : getDefaultMaterialForRole(req.role);

  // Determine candidate core list compatible with material family, sorted by Window Area Aw_mm2 ascending
  const compatFamily: InductorCoreSpec['family'] =
    chosenMat.category === 'nanocrystalline'
      ? 'cm-toroid'
      : chosenMat.category === 'ferrite'
      ? 'ferrite'
      : 'powder';

  let chosenCore: InductorCoreSpec | undefined;
  if (locks.coreId && overrides.coreId) {
    chosenCore = INDUCTOR_CORE_DATABASE.find((c) => c.id === overrides.coreId);
  } else if (overrides.coreId && INDUCTOR_CORE_DATABASE.find((c) => c.id === overrides.coreId)?.family === compatFamily) {
    chosenCore = INDUCTOR_CORE_DATABASE.find((c) => c.id === overrides.coreId);
  }

  const conductorPref: InductorConductorForm = overrides.conductorForm || 'auto';

  if (!chosenCore) {
    const evalPool = (mat: InductorMaterialSpec) => {
      const fam: InductorCoreSpec['family'] =
        mat.category === 'nanocrystalline' ? 'cm-toroid' : mat.category === 'ferrite' ? 'ferrite' : 'powder';
      return INDUCTOR_CORE_DATABASE
        .filter((c) => c.family === fam)
        .sort((a, b) => a.Aw_mm2 - b.Aw_mm2)
        .map((c) =>
          solveCoreTrial(
            req,
            c,
            mat,
            effTargetL,
            locks.turnsN ? overrides.turnsN : undefined,
            locks.airGap_mm ? overrides.airGap_mm : undefined,
            locks.wireAwg ? overrides.wireAwg : undefined,
            locks.parallelStrands ? overrides.parallelStrands : undefined,
            overrides.useLitz,
            conductorPref,
            true
          )
        );
    };

    const pickFromTrials = (trials: CustomInductorSolution[]) =>
      trials.find((t) => t.satStatus === 'ok' && t.windowFitStatus === 'ok' && t.deltaT_C < 52) ||
      trials.find((t) => t.satStatus === 'ok' && t.windowFitStatus !== 'overflow' && t.deltaT_C < 58) ||
      trials.find((t) => t.satStatus !== 'critical' && t.windowFitStatus !== 'overflow' && t.deltaT_C < 65);

    const primaryTrials = evalPool(chosenMat);
    let best = pickFromTrials(primaryTrials);

    // If unlocked material struggles thermally or overflows, try High-Flux 60µ or Gapped Ferrite PC95 automatically
    if (!best && !locks.materialId && !overrides.materialId && req.role !== 'cm-choke') {
      const fallbackMatIds = ['high-flux-60', 'ferrite-pc95', 'koolmu-40'];
      for (const fmId of fallbackMatIds) {
        const fm = INDUCTOR_MATERIAL_DATABASE.find((m) => m.id === fmId);
        if (!fm || fm.id === chosenMat.id) continue;
        const cand = pickFromTrials(evalPool(fm));
        if (cand) {
          best = cand;
          break;
        }
      }
    }

    if (!best) {
      const safe = primaryTrials.filter((t) => t.satStatus !== 'critical' && t.windowFitStatus !== 'overflow');
      const poolToSort = safe.length > 0 ? safe : primaryTrials;
      best = [...poolToSort].sort((a, b) => a.T_hotspot_C - b.T_hotspot_C)[0];
    }
    if (best) return best;
    const pool = INDUCTOR_CORE_DATABASE
      .filter((c) => c.family === compatFamily)
      .sort((a, b) => a.Aw_mm2 - b.Aw_mm2);
    chosenCore = pool[pool.length - 1] || INDUCTOR_CORE_DATABASE[0];
  }

  return solveCoreTrial(
    req,
    chosenCore,
    chosenMat,
    effTargetL,
    locks.turnsN ? overrides.turnsN : undefined,
    locks.airGap_mm ? overrides.airGap_mm : undefined,
    locks.wireAwg ? overrides.wireAwg : undefined,
    locks.parallelStrands ? overrides.parallelStrands : undefined,
    overrides.useLitz,
    conductorPref,
    true
  );
}

// ============================================================================
// 2B. MULTI-CORE × MULTI-MATERIAL PARETO AUTO-RANKER & TRANSFORMER CORE RANKER
// ============================================================================
export type InductorOptGoal = 'balanced' | 'min-loss' | 'compact' | 'low-temp';
export type InductorShapeFilter = 'all' | InductorCoreSpec['shape'];

export interface InductorRankedCandidate {
  core: InductorCoreSpec;
  material: InductorMaterialSpec;
  sol: CustomInductorSolution;
  rankScore: number;
  passesAll: boolean;
  dominantLoss: 'copper' | 'core' | 'balanced';
}

export function rankInductorCoreMaterials(
  req: CircuitInductorRequirement,
  goal: InductorOptGoal = 'balanced',
  shapeFilter: InductorShapeFilter = 'all',
  targetL_uH?: number
): InductorRankedCandidate[] {
  const effTargetL = targetL_uH ?? req.targetL_uH;
  const results: InductorRankedCandidate[] = [];

  for (const mat of INDUCTOR_MATERIAL_DATABASE) {
    if (req.role === 'cm-choke' && mat.category !== 'nanocrystalline') continue;
    if (req.role !== 'cm-choke' && mat.category === 'nanocrystalline') continue;
    if (req.role === 'resonant-shim' && mat.category !== 'ferrite') continue;

    const fam: InductorCoreSpec['family'] =
      mat.category === 'nanocrystalline'
        ? 'cm-toroid'
        : mat.category === 'ferrite'
        ? 'ferrite'
        : 'powder';

    const cores = INDUCTOR_CORE_DATABASE.filter(
      (c) => c.family === fam && (shapeFilter === 'all' || c.shape === shapeFilter)
    );

    for (const core of cores) {
      const sol = solveCoreTrial(
        req,
        core,
        mat,
        effTargetL,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        'auto',
        false
      );

      const passesAll =
        sol.satStatus !== 'critical' &&
        sol.windowFitStatus !== 'overflow' &&
        sol.T_hotspot_C <= Math.min(125, mat.maxTemp_C - 10);

      const penalty =
        (sol.satStatus === 'critical' ? 500 : sol.satStatus === 'warning' ? 35 : 0) +
        (sol.windowFitStatus === 'overflow' ? 450 : sol.windowFitStatus === 'tight' ? 30 : 0) +
        (sol.T_hotspot_C > 120 ? (sol.T_hotspot_C - 120) * 8 : 0);

      const volCm3 = core.Ve_mm3 / 1000;
      let costMetric = 0;
      if (goal === 'min-loss') {
        costMetric = sol.P_total_W * 12 + volCm3 * 0.25 + core.approxCost_USD * 0.5;
      } else if (goal === 'compact') {
        costMetric = volCm3 * 3.5 + sol.P_total_W * 2.5 + sol.windowFill_pct * 0.15;
      } else if (goal === 'low-temp') {
        costMetric = sol.deltaT_C * 1.6 + sol.P_total_W * 4.0 + volCm3 * 0.15;
      } else {
        // balanced
        costMetric = sol.P_total_W * 6.5 + volCm3 * 1.1 + sol.deltaT_C * 0.45 + core.approxCost_USD * 1.4;
      }

      const dominantLoss: InductorRankedCandidate['dominantLoss'] =
        sol.P_cu_total_W > sol.P_core_W * 1.4
          ? 'copper'
          : sol.P_core_W > sol.P_cu_total_W * 1.4
          ? 'core'
          : 'balanced';

      results.push({
        core,
        material: mat,
        sol,
        rankScore: Math.max(0, 1000 - costMetric - penalty),
        passesAll,
        dominantLoss,
      });
    }
  }

  return results
    .sort((a, b) => {
      if (a.passesAll !== b.passesAll) return a.passesAll ? -1 : 1;
      return b.rankScore - a.rankScore;
    })
    .slice(0, 8);
}

export interface TransformerCoreRankRow {
  core: CoreSpec;
  res: DcDcResults;
  passesAll: boolean;
  score: number;
}

export function rankTransformerCoresForDcDc(state: DcDcDesignState): TransformerCoreRankRow[] {
  const rows: TransformerCoreRankRow[] = [];
  for (const core of CORE_DATABASE) {
    const res = solveDcDcDesign({ ...state, coreId: core.id });
    const fillOk = res.windowFill_pct <= 52;
    const bOk = res.Bpk_mT <= res.material.Bsat_100C_T * 1000 * 0.85;
    const tempOk = res.Tcore_C <= 115;
    const passesAll = fillOk && bOk && tempOk;
    const penalty =
      (fillOk ? 0 : (res.windowFill_pct - 52) * 15 + 250) +
      (bOk ? 0 : 350) +
      (tempOk ? 0 : (res.Tcore_C - 115) * 10);
    const totalMagLoss = res.Pcore_W + res.Pcu_W;
    const volCm3 = core.Ve_mm3 / 1000;
    const score = Math.max(0, 1000 - totalMagLoss * 8 - volCm3 * 1.4 - Math.abs(res.windowFill_pct - 36) * 1.2 - penalty);
    rows.push({ core, res, passesAll, score });
  }
  return rows.sort((a, b) => {
    if (a.passesAll !== b.passesAll) return a.passesAll ? -1 : 1;
    return b.score - a.score;
  });
}

// ============================================================================
// 3. READY OFF-THE-SHELF COTS INDUCTOR MATCHER
// ============================================================================
export function rankReadyCotsInductors(
  req: CircuitInductorRequirement,
  targetLOverride?: number
): ReadyCotsInductorCandidate[] {
  const targetL = targetLOverride ?? req.targetL_uH;
  const pool = READY_COTS_INDUCTORS.filter((p) =>
    req.role === 'cm-choke' ? p.role === 'cm-choke' : p.role !== 'cm-choke'
  );

  const configs: { s: number; p: number; label: string }[] = [
    { s: 1, p: 1, label: '1× Single' },
    { s: 2, p: 1, label: '2× Series' },
    { s: 1, p: 2, label: '2× Parallel' },
    { s: 2, p: 2, label: '2S×2P Matrix' },
  ];

  const out: ReadyCotsInductorCandidate[] = [];

  for (const part of pool) {
    // Pick best array config for this part
    let bestForPart: ReadyCotsInductorCandidate | null = null;
    for (const cfg of configs) {
      const eff_L = (part.L_uH * cfg.s) / cfg.p;
      const eff_Irms = part.I_rms_A * cfg.p;
      const eff_Isat = part.I_sat_A * cfg.p;
      const eff_DCR = (part.DCR_mOhm * cfg.s) / cfg.p;

      const L_err = ((eff_L - targetL) / Math.max(0.5, targetL)) * 100;
      const Irms_margin = ((eff_Irms - req.I_rms_A) / Math.max(0.2, req.I_rms_A)) * 100;
      const Isat_margin =
        req.I_pk_A > 0.5 ? ((eff_Isat - req.I_pk_A) / Math.max(0.2, req.I_pk_A)) * 100 : 100;

      // Filter absurd inductance mismatches (> 3.5x off) unless CM choke
      if (req.role !== 'cm-choke' && (eff_L < targetL * 0.38 || eff_L > targetL * 2.8)) continue;

      const fitStatus: 'optimal' | 'acceptable' | 'undersized' =
        Isat_margin >= 8 && Irms_margin >= 5 && Math.abs(L_err) <= 30
          ? 'optimal'
          : Isat_margin >= -2 && Irms_margin >= -5
          ? 'acceptable'
          : 'undersized';

      // Score (higher = better)
      let score = 100;
      score -= Math.abs(L_err) * 0.85;
      score -= (cfg.s * cfg.p - 1) * 14; // Prefer 1x single when capable
      if (Isat_margin < 0) score -= Math.abs(Isat_margin) * 4.5 + 35;
      else score += Math.min(18, Isat_margin * 0.25);
      if (Irms_margin < 0) score -= Math.abs(Irms_margin) * 3.5 + 25;
      if (part.role === req.role) score += 10;

      const estCuLoss = req.I_rms_A * req.I_rms_A * (eff_DCR * 1e-3);
      const cand: ReadyCotsInductorCandidate = {
        part,
        seriesCount: cfg.s,
        parallelCount: cfg.p,
        totalUnits: cfg.s * cfg.p,
        configLabel: cfg.label,
        eff_L_uH: eff_L,
        eff_I_rms_A: eff_Irms,
        eff_I_sat_A: eff_Isat,
        eff_DCR_mOhm: eff_DCR,
        L_error_pct: L_err,
        Irms_margin_pct: Irms_margin,
        Isat_margin_pct: Isat_margin,
        estCopperLoss_W: estCuLoss,
        estTotalCost_USD: part.unitPrice_USD * cfg.s * cfg.p,
        fitStatus,
        matchScore: score,
      };
      if (!bestForPart || cand.matchScore > bestForPart.matchScore) {
        bestForPart = cand;
      }
    }
    if (bestForPart) out.push(bestForPart);
  }

  return out.sort((a, b) => b.matchScore - a.matchScore);
}

// ============================================================================
// 4. ALL CAPACITORS EXTRACTOR, BANK SOLVER & READY COTS MATCHER
// ============================================================================
export type CapRole =
  | 'dc-link-bulk'
  | 'hf-decoupling'
  | 'resonant-tank'
  | 'output-filter'
  | 'clamp-snubber'
  | 'x2-emi'
  | 'y-safety';

export interface CircuitCapacitorRequirement {
  id: string;
  designator: string;
  name: string;
  role: CapRole;
  targetC_uF: number;
  V_op_pk_V: number;
  V_min_rated_V: number; // Applying 80% industrial derating (Vop / 0.8)
  I_lf_rms_A: number;
  I_hf_rms_A: number;
  I_total_rms_A: number;
  f_sw_kHz: number;
  Tamb_C: number;
  recommendedDielectrics: ReadyCotsCapacitorSpec['dielectric'][];
  syncTarget?: { domain: 'dcdc' | 'acdc'; cKey: string; esrKey?: string; scaleFactorToState?: number };
  description: string;
}

export interface CustomCapBankOverrides {
  targetC_uF?: number;
  partId?: string;
  seriesCount?: number;
  parallelCount?: number;
  Tamb_C?: number;
}

export interface CustomCapBankLocks {
  targetC_uF: boolean;
  partId: boolean;
  seriesCount: boolean;
  parallelCount: boolean;
}

export interface PerInductorConfig {
  buildMode: 'custom' | 'ready';
  overrides: CustomInductorOverrides;
  locks: CustomInductorLocks;
  equippedCotsKey?: string;
}

export interface PerCapConfig {
  viewMode: 'builder' | 'catalog';
  overrides: CustomCapBankOverrides;
  locks: CustomCapBankLocks;
}

export interface CapacitorBankFixOption {
  id: string;
  label: string;
  impact: string;
  overridesPatch?: Partial<CustomCapBankOverrides>;
  unlockMatrix?: boolean;
  syncToCircuit?: boolean;
}

export interface CapacitorBankSolution {
  req: CircuitCapacitorRequirement;
  unitPart: ReadyCotsCapacitorSpec;
  seriesCount: number;
  parallelCount: number;
  totalUnits: number;
  bank_C_uF: number;
  bank_C_nominal_uF?: number;
  mlccBiasDerate_pct?: number;
  bank_V_rated_V: number;
  voltageDerating_pct: number;
  bank_ESR_mOhm: number;
  bank_ESL_nH: number;
  f_SRF_kHz: number;
  bank_I_rms_rating_A: number;
  I_rms_per_cap_A: number;
  rippleUtilization_pct: number;
  P_loss_total_W: number;
  P_loss_per_cap_W: number;
  deltaT_C: number;
  T_hotspot_C: number;
  L10_life_hrs: number;
  L10_life_years: number;
  status: 'ok' | 'warning' | 'critical';
  statusReason: string;
  totalCost_USD: number;
  impedanceCurve: {
    freq_kHz: number;
    Z_mOhm: number;
    Xc_mOhm: number;
    Xl_mOhm: number;
  }[];
}

export function extractCircuitCapacitors(
  mode: 'dcdc' | 'acdc',
  dcdcState: DcDcDesignState,
  dcdcRes: DcDcResults,
  acdcState: AcDcDesignState,
  acdcRes: AcDcResults
): CircuitCapacitorRequirement[] {
  if (mode === 'acdc') {
    const Tamb = acdcState.capAmbient_C ?? 45;
    const bulkBank: CircuitCapacitorRequirement = {
      id: 'acdc-dc-link',
      designator: 'C_DC',
      name: 'HV Bulk DC-Link Hold-Up Bank',
      role: 'dc-link-bulk',
      targetC_uF: acdcState.Cdc_uF,
      V_op_pk_V: acdcState.Vdc_bus_V * 1.04,
      V_min_rated_V: Math.ceil((acdcState.Vdc_bus_V * 1.04) / 0.84),
      I_lf_rms_A: acdcRes.ICdc_lf_rms_A,
      I_hf_rms_A: acdcRes.ICdc_hf_rms_A,
      I_total_rms_A: acdcRes.ICdc_total_rms_A,
      f_sw_kHz: acdcRes.f_emi_fundamental_kHz,
      Tamb_C: Tamb,
      recommendedDielectrics: acdcState.Vdc_bus_V > 480 ? ['hv-elec', 'mkp-dc-link'] : ['hv-elec', 'mkp-dc-link'],
      syncTarget: { domain: 'acdc', cKey: 'Cdc_uF', esrKey: 'ESR_Cdc_mOhm', scaleFactorToState: 1 },
      description: 'Stores hold-up energy (t_hold) and absorbs double-line-frequency 100/120 Hz + switching ripple.',
    };

    const hfDecoupling: CircuitCapacitorRequirement = {
      id: 'acdc-hf-mkp',
      designator: 'C_HF,BUS',
      name: 'Fast Switching Leg MKP Film Decoupling Bank',
      role: 'hf-decoupling',
      targetC_uF: 20,
      V_op_pk_V: acdcState.Vdc_bus_V * 1.06,
      V_min_rated_V: Math.ceil(acdcState.Vdc_bus_V * 1.25),
      I_lf_rms_A: acdcRes.ICdc_lf_rms_A * 0.05,
      I_hf_rms_A: acdcRes.ICdc_hf_rms_A * 0.85,
      I_total_rms_A: acdcRes.ICdc_hf_rms_A * 0.85,
      f_sw_kHz: acdcRes.f_emi_fundamental_kHz,
      Tamb_C: Tamb,
      recommendedDielectrics: ['mkp-dc-link', 'mkp-resonant'],
      description: 'Placed tightly across GaN/SiC bridge to carry HF switching di/dt and keep commutation loop < 10 nH.',
    };

    const acX2: CircuitCapacitorRequirement = {
      id: 'acdc-x2',
      designator: 'C_X1, C_X2',
      name: 'AC Input EMI X2 Safety Film Capacitors',
      role: 'x2-emi',
      targetC_uF: acdcRes.Cx_each_uF,
      V_op_pk_V: acdcState.Vac_max_V,
      V_min_rated_V: Math.max(305, Math.ceil(acdcState.Vac_max_V * 1.12)),
      I_lf_rms_A: 0.45,
      I_hf_rms_A: Math.max(0.8, acdcRes.dIin_net_max_A * 0.4),
      I_total_rms_A: Math.max(1.0, acdcRes.dIin_net_max_A * 0.45),
      f_sw_kHz: acdcRes.f_emi_fundamental_kHz,
      Tamb_C: 45,
      recommendedDielectrics: ['x2-film'],
      description: 'Across L-N mains terminals; certified IEC 60384-14 Class X2 with self-healing film.',
    };

    const yCapLineToPe_Vac =
      acdcState.Vac_max_V > 300 ? Math.round(acdcState.Vac_max_V / Math.sqrt(3)) : acdcState.Vac_max_V;
    const acY2: CircuitCapacitorRequirement = {
      id: 'acdc-y2',
      designator: 'C_Y1, C_Y2',
      name: 'Earth-Leakage Y1/Y2 Safety Bypass Capacitors',
      role: 'y-safety',
      targetC_uF: (acdcState.Cy_nF ?? acdcRes.Cy_each_nF) * 1e-3,
      V_op_pk_V: yCapLineToPe_Vac,
      V_min_rated_V: Math.max(305, Math.ceil(yCapLineToPe_Vac * 1.25)),
      I_lf_rms_A: (acdcRes.earthLeakage_mA ?? 1.5) * 1e-3,
      I_hf_rms_A: 0.35,
      I_total_rms_A: 0.35,
      f_sw_kHz: acdcRes.f_emi_fundamental_kHz,
      Tamb_C: 45,
      recommendedDielectrics: ['y-safety'],
      description: 'Line-to-PE chassis bypass shunting CM noise; capped by IEC 62368 3.5 mA touch-current limit.',
    };

    return [bulkBank, hfDecoupling, acX2, acY2];
  }

  // DC-DC Stage Capacitors
  const Tamb = dcdcState.Tamb_C;
  const outBank: CircuitCapacitorRequirement = {
    id: 'dcdc-out-cap',
    designator: 'C_o',
    name: 'Secondary Output Bulk + Ripple Filter Bank',
    role: 'output-filter',
    targetC_uF: dcdcState.Co_uF,
    V_op_pk_V: dcdcState.Vout_V * 1.05,
    V_min_rated_V: Math.ceil((dcdcState.Vout_V * 1.05) / 0.78),
    I_lf_rms_A: 0,
    I_hf_rms_A: dcdcRes.ICo_rms_A,
    I_total_rms_A: dcdcRes.ICo_rms_A,
    f_sw_kHz: dcdcRes.fRipple_out_kHz,
    Tamb_C: Tamb,
    recommendedDielectrics: dcdcState.Vout_V > 120 ? ['mkp-dc-link', 'hv-elec'] : ['polymer-hybrid', 'low-z-elec', 'mlcc-x7r'],
    syncTarget: { domain: 'dcdc', cKey: 'Co_uF', esrKey: 'ESR_Co_mOhm', scaleFactorToState: 1 },
    description: 'Absorbs secondary inductor ripple current (PSFB) or pulsed rectifier current (LLC) to meet ΔV_out spec.',
  };

  const Ipri_rms =
    (dcdcState.Pout_W / Math.max(0.8, 0.96) / Math.max(100, dcdcState.Vin_min_V)) *
    (dcdcRes.isLLC ? 1.15 : 1.05);
  // For non-LLC PSFB, any series primary capacitor must be a large DC-blocking film cap (f_res <= f_sw / 6), NOT nF resonant Cr!
  const fBlockTarget_Hz = Math.max(5e3, dcdcState.fsw_kHz * 1e3 * 0.14);
  const cBlockMin_uF = 1e6 / (Math.pow(2 * Math.PI * fBlockTarget_Hz, 2) * Math.max(1e-6, dcdcState.Llk_uH * 1e-6));
  const cBlockStd_uF = Math.max(4.7, Math.ceil(cBlockMin_uF / 5) * 5);
  const V_cr_pk = dcdcRes.isLLC
    ? dcdcState.Vin_max_V * 0.5 + (Ipri_rms * 1.414) / (2 * Math.PI * dcdcState.fsw_kHz * 1e3 * Math.max(1e-9, dcdcState.Cr_nF * 1e-9))
    : Math.max(120, Math.round((Ipri_rms * 1.414) / (2 * Math.PI * dcdcState.fsw_kHz * 1e3 * (cBlockStd_uF * 1e-6)) * 4 + 80));

  const resBank: CircuitCapacitorRequirement = dcdcRes.isLLC
    ? {
        id: 'dcdc-res-cap',
        designator: 'C_r',
        name: 'LLC Series Resonant Tank Capacitor Bank',
        role: 'resonant-tank',
        targetC_uF: Number((dcdcState.Cr_nF * 1e-3).toFixed(4)),
        V_op_pk_V: Math.round(V_cr_pk),
        V_min_rated_V: Math.ceil(V_cr_pk * 1.3),
        I_lf_rms_A: 0,
        I_hf_rms_A: Ipri_rms,
        I_total_rms_A: Ipri_rms,
        f_sw_kHz: dcdcState.fsw_kHz,
        Tamb_C: Tamb,
        recommendedDielectrics: ['mkp-resonant'],
        syncTarget: { domain: 'dcdc', cKey: 'Cr_nF', scaleFactorToState: 1000 },
        description: 'High-dv/dt MKP/FKP polypropylene film bank carrying full primary tank current.',
      }
    : {
        id: 'dcdc-res-cap',
        designator: 'C_block',
        name: 'Primary Flux-Walk DC-Blocking Film Bank (Sub-Resonant)',
        role: 'resonant-tank',
        targetC_uF: cBlockStd_uF,
        V_op_pk_V: Math.round(V_cr_pk),
        V_min_rated_V: Math.max(250, Math.ceil(V_cr_pk * 1.4)),
        I_lf_rms_A: 0,
        I_hf_rms_A: Ipri_rms,
        I_total_rms_A: Ipri_rms,
        f_sw_kHz: dcdcState.fsw_kHz,
        Tamb_C: Tamb,
        recommendedDielectrics: ['mkp-dc-link', 'mkp-resonant'],
        description: `Sized ≥${cBlockStd_uF.toFixed(0)} µF so f_res ≤ f_sw/7 (avoids 100+ kHz tank resonance while blocking transformer volt-second asymmetry).`,
      };

  const I_in_rip = (dcdcState.Pout_W / dcdcState.Vin_min_V) * 0.55;
  const inBusBank: CircuitCapacitorRequirement = {
    id: 'dcdc-in-bus',
    designator: 'C_in,bus',
    name: 'Primary Input DC-Bus Decoupling Bank',
    role: 'hf-decoupling',
    targetC_uF: dcdcState.Vin_max_V > 500 ? 60 : 80,
    V_op_pk_V: dcdcState.Vin_max_V,
    V_min_rated_V: Math.ceil(dcdcState.Vin_max_V * 1.2),
    I_lf_rms_A: 0,
    I_hf_rms_A: I_in_rip,
    I_total_rms_A: I_in_rip,
    f_sw_kHz: dcdcState.fsw_kHz * 2,
    Tamb_C: Tamb,
    recommendedDielectrics: ['mkp-dc-link', 'hv-elec'],
    description: 'Provides low-impedance HF path adjacent to primary full-bridge switches.',
  };

  const clampCap: CircuitCapacitorRequirement = {
    id: 'dcdc-clamp',
    designator: 'C_clamp',
    name: 'Primary/Secondary Clamp & Snubber Capacitor',
    role: 'clamp-snubber',
    targetC_uF: Number(Math.max(0.01, dcdcRes.Cclamp_nF * 1e-3).toFixed(4)),
    V_op_pk_V: Math.round(Math.max(dcdcRes.Vsec_ideal_pk_V * 1.35, dcdcState.Vin_max_V)),
    V_min_rated_V: Math.ceil(Math.max(dcdcRes.Vsec_ideal_pk_V * 1.65, dcdcState.Vin_max_V * 1.25)),
    I_lf_rms_A: 0,
    I_hf_rms_A: Math.max(1.2, Ipri_rms * 0.25),
    I_total_rms_A: Math.max(1.2, Ipri_rms * 0.25),
    f_sw_kHz: dcdcState.fsw_kHz * 2,
    Tamb_C: Tamb,
    recommendedDielectrics: ['mlcc-c0g', 'mkp-resonant'],
    description: 'Low-ESL pulse/C0G capacitor clamping leakage-inductance ringing spikes.',
  };

  const y1Cap: CircuitCapacitorRequirement = {
    id: 'dcdc-y1',
    designator: 'C_Y1',
    name: 'Galvanic Isolation Y1 Bridge Return Capacitor',
    role: 'y-safety',
    targetC_uF: 0.0022,
    V_op_pk_V: dcdcState.Vin_max_V,
    V_min_rated_V: Math.max(600, Math.ceil(dcdcState.Vin_max_V * 1.25)),
    I_lf_rms_A: 0,
    I_hf_rms_A: 0.25,
    I_total_rms_A: 0.25,
    f_sw_kHz: dcdcState.fsw_kHz,
    Tamb_C: Tamb,
    recommendedDielectrics: ['y-safety'],
    description: 'Reinforced Y1 capacitor shunting transformer C_ww displacement currents back to primary ground (IEC 60384-14: 250–500 Vac / 1500 Vdc working).',
  };

  return [outBank, resBank, inBusBank, clampCap, y1Cap];
}

function getEffectiveUnitVoltageRating(req: CircuitCapacitorRequirement, part: ReadyCotsCapacitorSpec): number {
  const isDcBarrierSafety = (req.role === 'y-safety' || req.role === 'x2-emi') && req.id.startsWith('dcdc-');
  return isDcBarrierSafety ? (part.V_dc_rated_V ?? part.V_rated_V) : part.V_rated_V;
}

export function solveCapacitorBank(
  req: CircuitCapacitorRequirement,
  overrides: CustomCapBankOverrides,
  locks: CustomCapBankLocks
): CapacitorBankSolution {
  const targetC = locks.targetC_uF && overrides.targetC_uF !== undefined ? overrides.targetC_uF : req.targetC_uF;
  const Tamb = overrides.Tamb_C ?? req.Tamb_C;

  // Choose unit part
  let unitPart: ReadyCotsCapacitorSpec | undefined;
  if (overrides.partId) {
    unitPart = READY_COTS_CAPACITORS.find((c) => c.id === overrides.partId);
  }
  if (!unitPart) {
    const preferred = READY_COTS_CAPACITORS.filter((c) => req.recommendedDielectrics.includes(c.dielectric));
    const pool = preferred.length > 0 ? preferred : READY_COTS_CAPACITORS;
    // Pick best voltage & capacitance match
    unitPart =
      pool.find((c) => getEffectiveUnitVoltageRating(req, c) >= req.V_min_rated_V * 0.9 && c.C_uF <= targetC * 1.5) ||
      pool.find((c) => getEffectiveUnitVoltageRating(req, c) >= req.V_min_rated_V * 0.9) ||
      pool[0];
  }

  const unitVRatedEff = getEffectiveUnitVoltageRating(req, unitPart);

  // Series count for voltage rating
  let S = locks.seriesCount && overrides.seriesCount !== undefined
    ? Math.max(1, Math.min(4, overrides.seriesCount))
    : Math.max(1, Math.min(3, Math.ceil(req.V_min_rated_V / Math.max(10, unitVRatedEff))));

  // Class-2 MLCC (X7R/X7S) DC-bias capacitance derating
  const isClass2Mlcc = unitPart.dielectric === 'mlcc-x7r';
  const vUnitRatio = isClass2Mlcc ? Math.min(1.0, (req.V_op_pk_V / S) / Math.max(10, unitVRatedEff)) : 0;
  const biasFactor = isClass2Mlcc ? Math.max(0.28, 1 - 0.85 * Math.pow(vUnitRatio, 1.35)) : 1.0;
  const effUnitC_uF = unitPart.C_uF * biasFactor;
  const mlccBiasDerate_pct = Number(((1 - biasFactor) * 100).toFixed(1));

  // Parallel count for capacitance AND ripple current AND thermal limits
  let P = 1;
  if (locks.parallelCount && overrides.parallelCount !== undefined) {
    P = Math.max(1, Math.min(32, overrides.parallelCount));
  } else {
    const P_cap = Math.max(1, Math.ceil((targetC * S) / Math.max(1e-5, effUnitC_uF)));
    const P_rms = Math.max(1, Math.ceil(req.I_total_rms_A / Math.max(0.2, unitPart.I_rms_A * 0.85)));
    P = Math.min(32, Math.max(P_cap, P_rms));
  }

  const bank_C_nominal_uF = (unitPart.C_uF * P) / S;
  const bank_C_uF = (effUnitC_uF * P) / S;
  const bank_V_rated_V = unitVRatedEff * S;
  const voltageDerating_pct = (req.V_op_pk_V / Math.max(1, bank_V_rated_V)) * 100;
  const bank_ESR_mOhm = (unitPart.ESR_mOhm * S) / P;
  const bank_ESL_nH = (unitPart.ESL_nH * S) / P;
  const f_SRF_kHz =
    (1 / (2 * Math.PI * Math.sqrt(Math.max(1e-12, bank_ESL_nH * 1e-9) * Math.max(1e-12, bank_C_uF * 1e-6)))) * 1e-3;

  const bank_I_rms_rating_A = unitPart.I_rms_A * P;
  const I_rms_per_cap_A = req.I_total_rms_A / P;
  const rippleUtilization_pct = (I_rms_per_cap_A / Math.max(0.1, unitPart.I_rms_A)) * 100;

  const P_loss_total_W = req.I_total_rms_A * req.I_total_rms_A * (bank_ESR_mOhm * 1e-3);
  const P_loss_per_cap_W = P_loss_total_W / (S * P);
  const deltaT_C = P_loss_per_cap_W * unitPart.Rth_ca_CW;
  const T_hotspot_C = Tamb + deltaT_C;

  // Arrhenius Lifetime Model (10°C doubling rule; Film / MLCC have very high base hours)
  const L10_life_hrs = Math.min(
    500000,
    unitPart.L0_hrs * Math.pow(2, (unitPart.Tmax_C - T_hotspot_C) / 10)
  );
  const L10_life_years = L10_life_hrs / 8760;

  let status: 'ok' | 'warning' | 'critical' = 'ok';
  let statusReason = 'Voltage derating <= 80%, RMS ripple within spec, and thermal life nominal.';
  const isAcSafetyCap = unitPart.dielectric === 'x2-film' || unitPart.dielectric === 'y-safety';
  const voltageWarnPct = isAcSafetyCap ? 92 : 82;
  if (voltageDerating_pct > 95 || rippleUtilization_pct > 105 || T_hotspot_C > unitPart.Tmax_C) {
    status = 'critical';
    statusReason =
      voltageDerating_pct > 95
        ? `Peak voltage (${req.V_op_pk_V.toFixed(0)}V) exceeds safe rating (${bank_V_rated_V}V). Add series units or choose higher V_rated.`
        : `Ripple current or hotspot (${T_hotspot_C.toFixed(1)}°C > ${unitPart.Tmax_C}°C) exceeded. Increase parallel count P.`;
  } else if (voltageDerating_pct > voltageWarnPct || rippleUtilization_pct > 85 || L10_life_hrs < 25000) {
    status = 'warning';
    statusReason = `Tight derating (${voltageDerating_pct.toFixed(0)}% V_rated, ${rippleUtilization_pct.toFixed(0)}% I_rms, ${(L10_life_hrs / 1000).toFixed(1)}k hrs).`;
  } else if (isClass2Mlcc && (mlccBiasDerate_pct > 20 || (req.role === 'output-filter' && bank_ESR_mOhm < 0.8))) {
    status = 'warning';
    statusReason = `X7R/X7S MLCC loses ~${mlccBiasDerate_pct.toFixed(0)}% C under ${req.V_op_pk_V.toFixed(0)}V DC bias & yields ESR=${bank_ESR_mOhm.toFixed(2)} mΩ (undamped LC); prefer Conductive Polymer Bulk.`;
  }

  // Build |Z(f)| curve from 100 Hz to 10 MHz
  const impedanceCurve: CapacitorBankSolution['impedanceCurve'] = [];
  const freqs_kHz = [0.1, 0.25, 0.5, 1, 2.5, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];
  for (const fk of freqs_kHz) {
    const w = 2 * Math.PI * fk * 1e3;
    const Xc = 1 / (w * bank_C_uF * 1e-6);
    const Xl = w * bank_ESL_nH * 1e-9;
    const R = bank_ESR_mOhm * 1e-3;
    const Z = Math.sqrt(R * R + (Xl - Xc) * (Xl - Xc)) * 1e3;
    impedanceCurve.push({
      freq_kHz: fk,
      Z_mOhm: Number(Z.toFixed(2)),
      Xc_mOhm: Number((Xc * 1e3).toFixed(2)),
      Xl_mOhm: Number((Xl * 1e3).toFixed(2)),
    });
  }

  return {
    req,
    unitPart,
    seriesCount: S,
    parallelCount: P,
    totalUnits: S * P,
    bank_C_uF,
    bank_C_nominal_uF,
    mlccBiasDerate_pct,
    bank_V_rated_V,
    voltageDerating_pct,
    bank_ESR_mOhm,
    bank_ESL_nH,
    f_SRF_kHz,
    bank_I_rms_rating_A,
    I_rms_per_cap_A,
    rippleUtilization_pct,
    P_loss_total_W,
    P_loss_per_cap_W,
    deltaT_C,
    T_hotspot_C,
    L10_life_hrs,
    L10_life_years,
    status,
    statusReason,
    totalCost_USD: unitPart.unitPrice_USD * S * P,
    impedanceCurve,
  };
}

export function rankReadyCotsCapacitors(req: CircuitCapacitorRequirement): CapacitorBankSolution[] {
  const defaultLocks: CustomCapBankLocks = {
    targetC_uF: false,
    partId: true,
    seriesCount: false,
    parallelCount: false,
  };
  return READY_COTS_CAPACITORS
    .filter((p) => req.recommendedDielectrics.includes(p.dielectric) || getEffectiveUnitVoltageRating(req, p) >= req.V_op_pk_V * 0.9)
    .map((p) => solveCapacitorBank(req, { partId: p.id }, defaultLocks))
    .sort((a, b) => {
      const rank = { ok: 0, warning: 1, critical: 2 };
      if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
      return a.totalCost_USD - b.totalCost_USD;
    });
}

export function generateCapacitorFixOptions(
  req: CircuitCapacitorRequirement,
  sol: CapacitorBankSolution,
  overrides: CustomCapBankOverrides,
  locks: CustomCapBankLocks
): CapacitorBankFixOption[] {
  const fixes: CapacitorBankFixOption[] = [];

  // Option 1: Auto-scale S x P for the currently selected part (unlock manual S/P constraints)
  const autoLocks: CustomCapBankLocks = { ...locks, seriesCount: false, parallelCount: false };
  const autoSol = solveCapacitorBank(req, { partId: sol.unitPart.id, targetC_uF: overrides.targetC_uF, Tamb_C: overrides.Tamb_C }, autoLocks);
  if (
    (autoSol.seriesCount !== sol.seriesCount || autoSol.parallelCount !== sol.parallelCount) &&
    autoSol.status !== 'critical'
  ) {
    // Also check if boosting P by 1 eliminates warning/L10 tight life
    let finalSol = autoSol;
    if (autoSol.status !== 'ok' && autoSol.parallelCount < 16) {
      const boosted = solveCapacitorBank(
        req,
        { partId: sol.unitPart.id, seriesCount: autoSol.seriesCount, parallelCount: autoSol.parallelCount + 2 },
        { ...locks, seriesCount: true, parallelCount: true }
      );
      if (boosted.status === 'ok') finalSol = boosted;
    }
    fixes.push({
      id: `${req.id}-autoscale`,
      label: `Re-scale ${sol.unitPart.mpn} Matrix to ${finalSol.seriesCount}S × ${finalSol.parallelCount}P`,
      impact: `Derating ${sol.voltageDerating_pct.toFixed(0)}% → ${finalSol.voltageDerating_pct.toFixed(0)}% V · I_rms ${finalSol.rippleUtilization_pct.toFixed(0)}% · ${(finalSol.L10_life_hrs / 1000).toFixed(0)}k hrs`,
      overridesPatch: {
        partId: sol.unitPart.id,
        seriesCount: finalSol.seriesCount,
        parallelCount: finalSol.parallelCount,
      },
      unlockMatrix: finalSol === autoSol,
      syncToCircuit: Boolean(req.syncTarget),
    });
  }

  // Option 2: Switch to highest-scoring COTS part that passes cleanly
  const ranked = rankReadyCotsCapacitors(req);
  const bestNominal = ranked.find(
    (c) =>
      c.status === 'ok' &&
      (c.unitPart.id !== sol.unitPart.id || c.seriesCount !== sol.seriesCount || c.parallelCount !== sol.parallelCount)
  );
  if (bestNominal) {
    fixes.push({
      id: `${req.id}-best-cots`,
      label: `Equip ${bestNominal.unitPart.mpn} (${bestNominal.seriesCount}S × ${bestNominal.parallelCount}P)`,
      impact: `${bestNominal.voltageDerating_pct.toFixed(0)}% V · ${bestNominal.rippleUtilization_pct.toFixed(0)}% I_rms · T=${bestNominal.T_hotspot_C.toFixed(0)}°C · $${bestNominal.totalCost_USD.toFixed(2)}`,
      overridesPatch: {
        partId: bestNominal.unitPart.id,
        seriesCount: bestNominal.seriesCount,
        parallelCount: bestNominal.parallelCount,
      },
      unlockMatrix: true,
      syncToCircuit: Boolean(req.syncTarget),
    });
  }

  // Option 3: If thermal or ripple warning still remains, boost parallel branches by +2
  if (sol.status !== 'ok' && fixes.length < 3 && sol.parallelCount < 24) {
    const plusP = Math.min(24, Math.max(sol.parallelCount + 2, Math.ceil(sol.parallelCount * 1.4)));
    const pSol = solveCapacitorBank(
      req,
      { ...overrides, partId: sol.unitPart.id, parallelCount: plusP },
      { ...locks, parallelCount: true }
    );
    if (pSol.T_hotspot_C < sol.T_hotspot_C || pSol.rippleUtilization_pct < sol.rippleUtilization_pct) {
      fixes.push({
        id: `${req.id}-boost-p`,
        label: `Increase Parallel Count P = ${sol.parallelCount} → ${plusP}`,
        impact: `I_rms ${sol.rippleUtilization_pct.toFixed(0)}% → ${pSol.rippleUtilization_pct.toFixed(0)}% · T=${pSol.T_hotspot_C.toFixed(0)}°C · ${(pSol.L10_life_hrs / 1000).toFixed(0)}k hrs`,
        overridesPatch: {
          partId: sol.unitPart.id,
          parallelCount: plusP,
        },
        syncToCircuit: Boolean(req.syncTarget),
      });
    }
  }

  return fixes.slice(0, 3);
}

// ============================================================================
// HYBRID MULTI-BRANCH CAPACITOR BANK ENGINE (Cin, Cout, Cdc)
// Supports parallel technology mixes (e.g. 3× Electrolytic + 2× MLCC)
// Computes complex |Z(f)| admittance matrix, HF/LF ripple sharing,
// anti-resonance Q-peak detection, DC-bias derating & thermal L10 life.
// ============================================================================

export type HybridCapRole = 'dcdc-cin' | 'dcdc-cout' | 'acdc-cdc';

export interface HybridCapBranchResult {
  branch: CapBranchSpec;
  effCapEach_uF: number;
  mlccBiasDerate_pct: number;
  branchCapNominal_uF: number;
  branchCapEff_uF: number;
  branchEsr_mOhm: number;
  branchEsl_nH: number;
  f_srf_kHz: number;
  Z_at_fsw_mOhm: number;
  I_lf_branch_A: number;
  I_hf_branch_A: number;
  I_total_branch_A: number;
  I_per_cap_A: number;
  rippleShare_pct: number;
  rippleUtilization_pct: number;
  voltageDerating_pct: number;
  P_loss_branch_W: number;
  P_loss_per_cap_W: number;
  deltaT_C: number;
  T_hotspot_C: number;
  L10_life_hrs: number;
  status: 'ok' | 'warning' | 'critical';
}

export interface HybridCapBankSolution {
  config: HybridCapBankConfig;
  branches: HybridCapBranchResult[];
  totalUnits: number;
  totalCapNominal_uF: number;
  totalCapEff_uF: number;
  esrEffAtFsw_mOhm: number;
  Z_at_fsw_mOhm: number;
  eslEff_nH: number;
  minVoltageRating_V: number;
  worstVoltageDerating_pct: number;
  worstRippleUtilization_pct: number;
  worstHotspot_C: number;
  minL10Life_hrs: number;
  P_loss_total_W: number;
  f_antiresonance_kHz: number | null;
  Z_antiresonance_mOhm: number | null;
  antiResonanceRisk: 'none' | 'moderate' | 'high';
  summaryLabel: string;
  status: 'ok' | 'warning' | 'critical';
  statusReason: string;
  impedanceCurve: {
    freq_kHz: number;
    Z_total_mOhm: number;
    branchZ_mOhm: number[];
  }[];
}

export interface SpiceCapUnitDescriptor {
  refDes: string;
  branchId: string;
  label: string;
  technology: CapTechnology;
  qtyRepresented: number;
  cap_uF: number;
  esr_mOhm: number;
  esl_nH: number;
  vRated_V: number;
}

function defaultRthAndLifeForTech(tech: CapTechnology): { rth: number; tmax: number; l0: number } {
  switch (tech) {
    case 'electrolytic':
      return { rth: 14.0, tmax: 105, l0: 5000 };
    case 'polymer':
      return { rth: 17.0, tmax: 125, l0: 4000 };
    case 'film':
      return { rth: 9.5, tmax: 105, l0: 100000 };
    case 'mlcc':
      return { rth: 28.0, tmax: 125, l0: 150000 };
  }
}

export function getDefaultHybridCapBank(
  role: HybridCapRole,
  dcdcState?: DcDcDesignState,
  acdcState?: AcDcDesignState
): HybridCapBankConfig {
  if (role === 'dcdc-cin') {
    if (dcdcState?.cinBank && dcdcState.cinBank.branches.length > 0) {
      return dcdcState.cinBank;
    }
    const vinMax = dcdcState?.Vin_max_V ?? 430;
    const isHV = vinMax > 480;
    return {
      branches: [
        {
          id: 'cin-bulk-elec',
          label: isHV ? 'HV Al-Electrolytic (500V)' : 'HV Al-Electrolytic',
          technology: 'electrolytic',
          qty: 2,
          capEach_uF: isHV ? 150 : 220,
          esrEach_mOhm: isHV ? 210 : 170,
          eslEach_nH: 18,
          vRated_V: isHV ? 500 : 450,
          iRmsEach_A: isHV ? 2.65 : 3.25,
          mpn: isHV ? 'EKMH501VSN331MA45T' : 'B43644B5477M000',
        },
        {
          id: 'cin-hf-film',
          label: 'MKP DC-Link Film',
          technology: 'film',
          qty: 2,
          capEach_uF: isHV ? 15 : 20,
          esrEach_mOhm: 2.8,
          eslEach_nH: 12,
          vRated_V: isHV ? 900 : 700,
          iRmsEach_A: 18,
          mpn: isHV ? 'B32776G8306K000' : 'C4AQJBW5200A3LJ',
        },
        {
          id: 'cin-hf-mlcc',
          label: 'HF MLCC Decoupling',
          technology: 'mlcc',
          qty: 2,
          capEach_uF: 0.47,
          esrEach_mOhm: 2.5,
          eslEach_nH: 1.0,
          vRated_V: isHV ? 1000 : 630,
          iRmsEach_A: 5.5,
          mpn: 'GRM55D7U2J223JW31L',
        },
      ],
    };
  }

  if (role === 'dcdc-cout') {
    if (dcdcState?.coutBank && dcdcState.coutBank.branches.length > 0) {
      return dcdcState.coutBank;
    }
    const vout = dcdcState?.Vout_V ?? 48;
    const targetCo = Math.max(20, dcdcState?.Co_uF ?? 440);
    const targetEsr = Math.max(1.5, dcdcState?.ESR_Co_mOhm ?? 7.5);
    if (vout > 120) {
      const unitC = Math.max(100, Math.round(targetCo / 3));
      const vRate = vout > 360 ? 500 : 450;
      return {
        branches: [
          {
            id: 'cout-bulk-elec',
            label: 'HV Electrolytic Bulk',
            technology: 'electrolytic',
            qty: 3,
            capEach_uF: unitC,
            esrEach_mOhm: Math.max(45, Math.round(targetEsr * 3)),
            eslEach_nH: 18,
            vRated_V: vRate,
            iRmsEach_A: 3.1,
            mpn: vRate >= 500 ? 'EKMH501VSN331MA45T' : 'B43644B5477M000',
          },
          {
            id: 'cout-hf-film',
            label: 'HF MKP Film / MLCC',
            technology: 'film',
            qty: 2,
            capEach_uF: 10,
            esrEach_mOhm: 3.2,
            eslEach_nH: 10,
            vRated_V: 700,
            iRmsEach_A: 12.0,
            mpn: 'C4AQJBW5200A3LJ',
          },
        ],
      };
    }

    const vRate = vout <= 54 ? 80 : 100;
    const bulkQty = 3;
    const mlccQty = 2;
    const mlccEach = 10;
    const bulkUnitC = Math.max(47, Math.round((targetCo - mlccQty * mlccEach * 0.75) / bulkQty));
    const bulkUnitEsr = Math.max(12, Number((targetEsr * bulkQty * 1.15).toFixed(1)));
    return {
      branches: [
        {
          id: 'cout-bulk-elec',
          label: 'Bulk Electrolytic',
          technology: 'electrolytic',
          qty: bulkQty,
          capEach_uF: bulkUnitC,
          esrEach_mOhm: bulkUnitEsr,
          eslEach_nH: 12,
          vRated_V: vRate,
          iRmsEach_A: 3.6,
          mpn: vRate <= 80 ? 'EEH-ZS1K151P' : 'EKYB101ELL331MK25S',
        },
        {
          id: 'cout-hf-mlcc',
          label: 'HF X7S MLCC',
          technology: 'mlcc',
          qty: mlccQty,
          capEach_uF: mlccEach,
          esrEach_mOhm: 2.2,
          eslEach_nH: 0.9,
          vRated_V: 100,
          iRmsEach_A: 6.0,
          mpn: 'C5750X7S2A106M230KB',
        },
      ],
    };
  }

  // acdc-cdc
  if (acdcState?.cdcBank && acdcState.cdcBank.branches.length > 0) {
    return acdcState.cdcBank;
  }
  const vdc = acdcState?.Vdc_bus_V ?? 400;
  const targetCdc = Math.max(220, acdcState?.Cdc_uF ?? 2240);
  const bulkQty = vdc > 500 ? 4 : 4;
  const bulkUnitC = Math.max(220, Math.round((targetCdc - 40) / bulkQty));
  return {
    branches: [
      {
        id: 'cdc-bulk-elec',
        label: vdc > 500 ? 'HV Snap-In Elec (500V)' : 'HV Snap-In Elec (450V)',
        technology: 'electrolytic',
        qty: bulkQty,
        capEach_uF: bulkUnitC,
        esrEach_mOhm: Math.max(60, Math.round((acdcState?.ESR_Cdc_mOhm ?? 18) * bulkQty)),
        eslEach_nH: 18,
        vRated_V: vdc > 500 ? 500 : 450,
        iRmsEach_A: 3.25,
        mpn: vdc > 500 ? 'EKMH501VSN331MA45T' : 'LGN2W561MELC45',
      },
      {
        id: 'cdc-hf-film',
        label: 'HF MKP Commutation Film',
        technology: 'film',
        qty: 2,
        capEach_uF: 20,
        esrEach_mOhm: 2.8,
        eslEach_nH: 12,
        vRated_V: vdc > 500 ? 900 : 700,
        iRmsEach_A: 21.0,
        mpn: vdc > 500 ? 'B32776G8306K000' : 'C4AQJBW5200A3LJ',
      },
    ],
  };
}

export type HybridCapPresetId = '3elec-2mlcc' | '4poly-4mlcc' | '2film-4mlcc' | '4elec-2film';

export function buildHybridCapPreset(
  role: HybridCapRole,
  presetId: HybridCapPresetId,
  vOp_V: number
): HybridCapBankConfig {
  const isHV = vOp_V > 160;
  if (role === 'acdc-cdc' || isHV) {
    const elecV = vOp_V > 440 ? 500 : 450;
    const filmV = vOp_V > 520 ? 900 : 700;
    switch (presetId) {
      case '3elec-2mlcc':
        return {
          branches: [
            {
              id: 'b1-elec',
              label: 'HV Bulk Electrolytic',
              technology: 'electrolytic',
              qty: 3,
              capEach_uF: 470,
              esrEach_mOhm: 170,
              eslEach_nH: 18,
              vRated_V: elecV,
              iRmsEach_A: 3.25,
              mpn: elecV >= 500 ? 'EKMH501VSN331MA45T' : 'B43644B5477M000',
            },
            {
              id: 'b2-mlcc',
              label: 'HF HV MLCC',
              technology: 'mlcc',
              qty: 2,
              capEach_uF: 1.0,
              esrEach_mOhm: 3.5,
              eslEach_nH: 1.1,
              vRated_V: 630,
              iRmsEach_A: 5.0,
              mpn: 'GRM55D7U2J223JW31L',
            },
          ],
        };
      case '4poly-4mlcc':
        return {
          branches: [
            {
              id: 'b1-elec',
              label: 'Low-ESR Snap-In Bulk',
              technology: 'electrolytic',
              qty: 4,
              capEach_uF: 560,
              esrEach_mOhm: 150,
              eslEach_nH: 16,
              vRated_V: elecV,
              iRmsEach_A: 3.4,
              mpn: 'LGN2W561MELC45',
            },
            {
              id: 'b2-mlcc',
              label: 'HF HV MLCC',
              technology: 'mlcc',
              qty: 4,
              capEach_uF: 0.47,
              esrEach_mOhm: 2.8,
              eslEach_nH: 0.9,
              vRated_V: 1000,
              iRmsEach_A: 5.5,
            },
          ],
        };
      case '2film-4mlcc':
        return {
          branches: [
            {
              id: 'b1-film',
              label: 'MKP DC-Link Film',
              technology: 'film',
              qty: 2,
              capEach_uF: 30,
              esrEach_mOhm: 2.5,
              eslEach_nH: 16,
              vRated_V: filmV,
              iRmsEach_A: 23.5,
              mpn: 'B32776G8306K000',
            },
            {
              id: 'b2-mlcc',
              label: 'HF HV MLCC',
              technology: 'mlcc',
              qty: 4,
              capEach_uF: 0.47,
              esrEach_mOhm: 2.5,
              eslEach_nH: 0.9,
              vRated_V: 1000,
              iRmsEach_A: 5.5,
            },
          ],
        };
      case '4elec-2film':
      default:
        return {
          branches: [
            {
              id: 'b1-elec',
              label: 'HV Bulk Electrolytic',
              technology: 'electrolytic',
              qty: 4,
              capEach_uF: 560,
              esrEach_mOhm: 195,
              eslEach_nH: 18,
              vRated_V: elecV,
              iRmsEach_A: 3.25,
              mpn: 'LGN2W561MELC45',
            },
            {
              id: 'b2-film',
              label: 'MKP Commutation Film',
              technology: 'film',
              qty: 2,
              capEach_uF: 20,
              esrEach_mOhm: 2.8,
              eslEach_nH: 12,
              vRated_V: filmV,
              iRmsEach_A: 21.0,
              mpn: 'C4AQJBW5200A3LJ',
            },
          ],
        };
    }
  }

  // Low/Medium Voltage DC-DC Cout (e.g. 24V - 100V)
  const lvRate = vOp_V <= 52 ? 63 : vOp_V <= 66 ? 80 : 100;
  switch (presetId) {
    case '3elec-2mlcc':
      return {
        branches: [
          {
            id: 'b1-elec',
            label: 'Low-Z Electrolytic',
            technology: 'electrolytic',
            qty: 3,
            capEach_uF: lvRate <= 63 ? 470 : 330,
            esrEach_mOhm: lvRate <= 63 ? 26 : 32,
            eslEach_nH: 11,
            vRated_V: lvRate,
            iRmsEach_A: 2.65,
            mpn: lvRate <= 63 ? 'UPW1J471MHD' : 'EKYB101ELL331MK25S',
          },
          {
            id: 'b2-mlcc',
            label: 'X7S MLCC 2220',
            technology: 'mlcc',
            qty: 2,
            capEach_uF: 10,
            esrEach_mOhm: 2.2,
            eslEach_nH: 0.9,
            vRated_V: 100,
            iRmsEach_A: 6.0,
            mpn: 'C5750X7S2A106M230KB',
          },
        ],
      };
    case '4poly-4mlcc':
      return {
        branches: [
          {
            id: 'b1-poly',
            label: 'Hybrid Polymer 125°C',
            technology: 'polymer',
            qty: 4,
            capEach_uF: 150,
            esrEach_mOhm: 14,
            eslEach_nH: 4.2,
            vRated_V: Math.max(80, lvRate),
            iRmsEach_A: 4.8,
            mpn: 'EEH-ZS1K151P',
          },
          {
            id: 'b2-mlcc',
            label: 'X7S MLCC 2220',
            technology: 'mlcc',
            qty: 4,
            capEach_uF: 10,
            esrEach_mOhm: 2.2,
            eslEach_nH: 0.9,
            vRated_V: 100,
            iRmsEach_A: 6.0,
            mpn: 'C5750X7S2A106M230KB',
          },
        ],
      };
    case '2film-4mlcc':
      return {
        branches: [
          {
            id: 'b1-film',
            label: 'MKP DC-Link Film',
            technology: 'film',
            qty: 2,
            capEach_uF: 30,
            esrEach_mOhm: 2.5,
            eslEach_nH: 14,
            vRated_V: 400,
            iRmsEach_A: 20.0,
            mpn: 'B32776G8306K000',
          },
          {
            id: 'b2-mlcc',
            label: 'X7S MLCC 2220',
            technology: 'mlcc',
            qty: 4,
            capEach_uF: 10,
            esrEach_mOhm: 2.2,
            eslEach_nH: 0.9,
            vRated_V: 100,
            iRmsEach_A: 6.0,
            mpn: 'C5750X7S2A106M230KB',
          },
        ],
      };
    case '4elec-2film':
    default:
      return {
        branches: [
          {
            id: 'b1-elec',
            label: 'Low-Z Electrolytic',
            technology: 'electrolytic',
            qty: 4,
            capEach_uF: 330,
            esrEach_mOhm: 32,
            eslEach_nH: 12,
            vRated_V: Math.max(80, lvRate),
            iRmsEach_A: 2.65,
            mpn: 'EKYB101ELL331MK25S',
          },
          {
            id: 'b2-film',
            label: 'HF MKP Film',
            technology: 'film',
            qty: 2,
            capEach_uF: 20,
            esrEach_mOhm: 2.8,
            eslEach_nH: 12,
            vRated_V: 400,
            iRmsEach_A: 18.0,
            mpn: 'C4AQJBW5200A3LJ',
          },
        ],
      };
  }
}

export function solveHybridCapBank(
  config: HybridCapBankConfig,
  opts: {
    fsw_kHz: number;
    f_lf_Hz?: number;
    I_hf_rms_A: number;
    I_lf_rms_A?: number;
    V_op_pk_V: number;
    Tamb_C: number;
  }
): HybridCapBankSolution {
  const safeBranches =
    config.branches && config.branches.length > 0
      ? config.branches
      : [
          {
            id: 'fallback',
            label: 'Default Bulk',
            technology: 'electrolytic' as CapTechnology,
            qty: 1,
            capEach_uF: 220,
            esrEach_mOhm: 20,
            eslEach_nH: 12,
            vRated_V: Math.max(100, Math.ceil(opts.V_op_pk_V * 1.3)),
            iRmsEach_A: 4.0,
          },
        ];

  const fsw_Hz = Math.max(1e3, opts.fsw_kHz * 1e3);
  const wSw = 2 * Math.PI * fsw_Hz;
  const I_hf_total = Math.max(0, opts.I_hf_rms_A);
  const I_lf_total = Math.max(0, opts.I_lf_rms_A ?? 0);

  // Per-branch effective parameters & admittance at fsw
  const preBranches = safeBranches.map((b) => {
    const qty = Math.max(1, Math.round(b.qty));
    const isMlcc = b.technology === 'mlcc';
    const vRatio = isMlcc ? Math.min(1.0, opts.V_op_pk_V / Math.max(10, b.vRated_V)) : 0;
    const biasFactor = isMlcc ? Math.max(0.32, 1 - 0.8 * Math.pow(vRatio, 1.35)) : 1.0;
    const effCapEach_uF = b.capEach_uF * biasFactor;
    const branchCapNominal_uF = b.capEach_uF * qty;
    const branchCapEff_uF = effCapEach_uF * qty;
    const branchEsr_mOhm = Math.max(0.1, b.esrEach_mOhm) / qty;
    const branchEsl_nH = Math.max(0.1, b.eslEach_nH) / qty;

    const R = branchEsr_mOhm * 1e-3;
    const C = Math.max(1e-12, branchCapEff_uF * 1e-6);
    const L = Math.max(1e-12, branchEsl_nH * 1e-9);
    const X = wSw * L - 1 / (wSw * C);
    const denom = R * R + X * X;
    const G = R / denom;
    const B = -X / denom;
    const Ymag = Math.sqrt(G * G + B * B);
    const Zmag_mOhm = (1 / Math.max(1e-12, Ymag)) * 1e3;
    const f_srf_kHz = (1 / (2 * Math.PI * Math.sqrt(L * C))) * 1e-3;

    return {
      branch: { ...b, qty },
      effCapEach_uF,
      mlccBiasDerate_pct: Number(((1 - biasFactor) * 100).toFixed(1)),
      branchCapNominal_uF,
      branchCapEff_uF,
      branchEsr_mOhm,
      branchEsl_nH,
      f_srf_kHz,
      G,
      B,
      Ymag,
      Z_at_fsw_mOhm: Zmag_mOhm,
    };
  });

  const G_tot = preBranches.reduce((s, b) => s + b.G, 0);
  const B_tot = preBranches.reduce((s, b) => s + b.B, 0);
  const Y_tot_mag = Math.max(1e-9, Math.sqrt(G_tot * G_tot + B_tot * B_tot));
  const Z_tot_re_Ohm = G_tot / (Y_tot_mag * Y_tot_mag);
  const Z_at_fsw_mOhm = (1 / Y_tot_mag) * 1e3;
  const esrEffAtFsw_mOhm = Z_tot_re_Ohm * 1e3;

  const totalCapNominal_uF = preBranches.reduce((s, b) => s + b.branchCapNominal_uF, 0);
  const totalCapEff_uF = Math.max(1e-6, preBranches.reduce((s, b) => s + b.branchCapEff_uF, 0));
  const sumInvEsl = preBranches.reduce((s, b) => s + 1 / Math.max(0.05, b.branchEsl_nH), 0);
  const eslEff_nH = 1 / Math.max(1e-6, sumInvEsl);

  // Sum of individual |Y_k| vs |sum Y_k| gives exact branch RMS current distribution
  const sumYmag = Math.max(1e-9, preBranches.reduce((s, b) => s + b.Ymag, 0));
  // Voltage phasor magnitude across bus at fsw = I_hf_total / |Y_tot|
  const V_bus_hf_V = I_hf_total / Y_tot_mag;

  const branches: HybridCapBranchResult[] = preBranches.map((pb) => {
    const I_hf_branch_A = V_bus_hf_V * pb.Ymag;
    const I_lf_branch_A = I_lf_total * (pb.branchCapEff_uF / totalCapEff_uF);
    const I_total_branch_A = Math.sqrt(I_hf_branch_A * I_hf_branch_A + I_lf_branch_A * I_lf_branch_A);
    const I_per_cap_A = I_total_branch_A / pb.branch.qty;
    const rippleShare_pct = (pb.Ymag / sumYmag) * 100;
    const rippleUtilization_pct = (I_per_cap_A / Math.max(0.1, pb.branch.iRmsEach_A)) * 100;
    const voltageDerating_pct = (opts.V_op_pk_V / Math.max(1, pb.branch.vRated_V)) * 100;

    const P_loss_branch_W = I_total_branch_A * I_total_branch_A * (pb.branchEsr_mOhm * 1e-3);
    const P_loss_per_cap_W = P_loss_branch_W / pb.branch.qty;

    const defaults = defaultRthAndLifeForTech(pb.branch.technology);
    const rth = pb.branch.rthCa_CW ?? defaults.rth;
    const tmax = pb.branch.tMax_C ?? defaults.tmax;
    const l0 = pb.branch.l0_hrs ?? defaults.l0;

    const deltaT_C = P_loss_per_cap_W * rth;
    const T_hotspot_C = opts.Tamb_C + deltaT_C;
    const L10_life_hrs = Math.min(500000, l0 * Math.pow(2, (tmax - T_hotspot_C) / 10));

    let bStatus: 'ok' | 'warning' | 'critical' = 'ok';
    if (voltageDerating_pct > 95 || rippleUtilization_pct > 105 || T_hotspot_C > tmax) {
      bStatus = 'critical';
    } else if (voltageDerating_pct > 84 || rippleUtilization_pct > 85 || L10_life_hrs < 20000) {
      bStatus = 'warning';
    }

    return {
      branch: pb.branch,
      effCapEach_uF: pb.effCapEach_uF,
      mlccBiasDerate_pct: pb.mlccBiasDerate_pct,
      branchCapNominal_uF: pb.branchCapNominal_uF,
      branchCapEff_uF: pb.branchCapEff_uF,
      branchEsr_mOhm: pb.branchEsr_mOhm,
      branchEsl_nH: pb.branchEsl_nH,
      f_srf_kHz: pb.f_srf_kHz,
      Z_at_fsw_mOhm: pb.Z_at_fsw_mOhm,
      I_lf_branch_A,
      I_hf_branch_A,
      I_total_branch_A,
      I_per_cap_A,
      rippleShare_pct,
      rippleUtilization_pct,
      voltageDerating_pct,
      P_loss_branch_W,
      P_loss_per_cap_W,
      deltaT_C,
      T_hotspot_C,
      L10_life_hrs,
      status: bStatus,
    };
  });

  // High-resolution log sweep 100 Hz .. 10 MHz to capture |Z(f)| & anti-resonance peaks
  const impedanceCurve: HybridCapBankSolution['impedanceCurve'] = [];
  const nPts = 61;
  for (let i = 0; i < nPts; i++) {
    const fk = Math.pow(10, -1 + (5 * i) / (nPts - 1)); // 0.1 kHz to 10,000 kHz
    const w = 2 * Math.PI * fk * 1e3;
    let gSum = 0;
    let bSum = 0;
    const branchZ_mOhm: number[] = [];
    for (const pb of preBranches) {
      const r = pb.branchEsr_mOhm * 1e-3;
      const c = Math.max(1e-12, pb.branchCapEff_uF * 1e-6);
      const l = Math.max(1e-12, pb.branchEsl_nH * 1e-9);
      const x = w * l - 1 / (w * c);
      const d = r * r + x * x;
      gSum += r / d;
      bSum += -x / d;
      branchZ_mOhm.push(Number((Math.sqrt(d) * 1e3).toFixed(3)));
    }
    const zTot = (1 / Math.max(1e-12, Math.sqrt(gSum * gSum + bSum * bSum))) * 1e3;
    impedanceCurve.push({
      freq_kHz: Number(fk.toFixed(3)),
      Z_total_mOhm: Number(zTot.toFixed(3)),
      branchZ_mOhm,
    });
  }

  // Detect parallel anti-resonance peak (local maximum in |Z(f)| between 5 kHz and 5 MHz)
  let f_antiresonance_kHz: number | null = null;
  let Z_antiresonance_mOhm: number | null = null;
  for (let i = 1; i < impedanceCurve.length - 1; i++) {
    const prev = impedanceCurve[i - 1];
    const curr = impedanceCurve[i];
    const next = impedanceCurve[i + 1];
    if (
      curr.freq_kHz >= 5 &&
      curr.freq_kHz <= 5000 &&
      curr.Z_total_mOhm > prev.Z_total_mOhm * 1.08 &&
      curr.Z_total_mOhm > next.Z_total_mOhm * 1.08
    ) {
      if (Z_antiresonance_mOhm === null || curr.Z_total_mOhm > Z_antiresonance_mOhm) {
        f_antiresonance_kHz = curr.freq_kHz;
        Z_antiresonance_mOhm = curr.Z_total_mOhm;
      }
    }
  }

  let antiResonanceRisk: 'none' | 'moderate' | 'high' = 'none';
  if (f_antiresonance_kHz !== null && Z_antiresonance_mOhm !== null) {
    const nearSwitchingHarmonic =
      Math.abs(f_antiresonance_kHz - opts.fsw_kHz) / Math.max(1, opts.fsw_kHz) < 0.25 ||
      Math.abs(f_antiresonance_kHz - 2 * opts.fsw_kHz) / Math.max(1, 2 * opts.fsw_kHz) < 0.2;
    if (Z_antiresonance_mOhm > esrEffAtFsw_mOhm * 4 && nearSwitchingHarmonic) {
      antiResonanceRisk = 'high';
    } else if (Z_antiresonance_mOhm > esrEffAtFsw_mOhm * 3) {
      antiResonanceRisk = 'moderate';
    }
  }

  const totalUnits = branches.reduce((s, b) => s + b.branch.qty, 0);
  const minVoltageRating_V = Math.min(...branches.map((b) => b.branch.vRated_V));
  const worstVoltageDerating_pct = Math.max(...branches.map((b) => b.voltageDerating_pct));
  const worstRippleUtilization_pct = Math.max(...branches.map((b) => b.rippleUtilization_pct));
  const worstHotspot_C = Math.max(...branches.map((b) => b.T_hotspot_C));
  const minL10Life_hrs = Math.min(...branches.map((b) => b.L10_life_hrs));
  const P_loss_total_W = branches.reduce((s, b) => s + b.P_loss_branch_W, 0);

  let status: 'ok' | 'warning' | 'critical' = 'ok';
  if (branches.some((b) => b.status === 'critical')) {
    status = 'critical';
  } else if (branches.some((b) => b.status === 'warning') || antiResonanceRisk === 'high') {
    status = 'warning';
  }

  const shortParts = branches.map((b) => {
    const techTag =
      b.branch.technology === 'electrolytic'
        ? 'Elec'
        : b.branch.technology === 'polymer'
        ? 'Poly'
        : b.branch.technology === 'mlcc'
        ? 'MLCC'
        : 'Film';
    const cStr = b.branch.capEach_uF < 1 ? `${(b.branch.capEach_uF * 1000).toFixed(0)}nF` : `${b.branch.capEach_uF}µF`;
    return `${b.branch.qty}×${cStr} ${techTag}`;
  });
  const summaryLabel = shortParts.join(' + ');

  const statusReason =
    status === 'critical'
      ? `One or more branches exceed voltage/ripple/thermal limits (${worstVoltageDerating_pct.toFixed(0)}% V, ${worstRippleUtilization_pct.toFixed(0)}% I_rms, ${worstHotspot_C.toFixed(0)}°C).`
      : antiResonanceRisk === 'high'
      ? `Anti-resonance peak (${Z_antiresonance_mOhm?.toFixed(1)} mΩ @ ${f_antiresonance_kHz?.toFixed(0)} kHz) sits near f_sw; add ESR damping or adjust MLCC count.`
      : status === 'warning'
      ? `Tight branch margin (${worstVoltageDerating_pct.toFixed(0)}% V, ${worstRippleUtilization_pct.toFixed(0)}% I_rms, L10=${(minL10Life_hrs / 1000).toFixed(0)}k hrs).`
      : `Balanced parallel bank (${summaryLabel}) · ESR_eff=${esrEffAtFsw_mOhm.toFixed(1)} mΩ @ ${opts.fsw_kHz} kHz.`;

  return {
    config: { branches: safeBranches },
    branches,
    totalUnits,
    totalCapNominal_uF,
    totalCapEff_uF,
    esrEffAtFsw_mOhm,
    Z_at_fsw_mOhm,
    eslEff_nH,
    minVoltageRating_V,
    worstVoltageDerating_pct,
    worstRippleUtilization_pct,
    worstHotspot_C,
    minL10Life_hrs,
    P_loss_total_W,
    f_antiresonance_kHz,
    Z_antiresonance_mOhm,
    antiResonanceRisk,
    summaryLabel,
    status,
    statusReason,
    impedanceCurve,
  };
}

/**
 * Expands a HybridCapBankConfig into concrete parallel unit/branch instances for
 * CAD schematics, LTspice (.asc), QSPICE (.qsch), SPICE (.cir), and PLECS (.plecs).
 * Branches with qty <= maxIndividualPerBranch are expanded 1-by-1 (e.g. 3× Elec + 2× MLCC -> 5 symbols);
 * larger branches (qty > maxIndividualPerBranch) are represented cleanly with scaled parallel Rser/Lser.
 */
export function expandHybridCapBankForSpice(
  config: HybridCapBankConfig,
  prefix: string,
  vOpPk_V: number,
  maxIndividualPerBranch = 4
): SpiceCapUnitDescriptor[] {
  const units: SpiceCapUnitDescriptor[] = [];
  const branches = config.branches && config.branches.length > 0 ? config.branches : [];

  branches.forEach((b, bIdx) => {
    const qty = Math.max(1, Math.round(b.qty));
    const isMlcc = b.technology === 'mlcc';
    const vRatio = isMlcc ? Math.min(1.0, vOpPk_V / Math.max(10, b.vRated_V)) : 0;
    const biasFactor = isMlcc ? Math.max(0.32, 1 - 0.8 * Math.pow(vRatio, 1.35)) : 1.0;
    const effEach_uF = Math.max(0.001, b.capEach_uF * biasFactor);
    const techChar =
      b.technology === 'electrolytic'
        ? 'E'
        : b.technology === 'polymer'
        ? 'P'
        : b.technology === 'mlcc'
        ? 'M'
        : 'F';

    if (qty <= maxIndividualPerBranch) {
      for (let i = 1; i <= qty; i++) {
        units.push({
          refDes: `${prefix}_${techChar}${bIdx + 1}_${i}`,
          branchId: b.id,
          label: b.label,
          technology: b.technology,
          qtyRepresented: 1,
          cap_uF: Number(effEach_uF.toFixed(4)),
          esr_mOhm: Number(Math.max(0.2, b.esrEach_mOhm).toFixed(3)),
          esl_nH: Number(Math.max(0.2, b.eslEach_nH).toFixed(2)),
          vRated_V: b.vRated_V,
        });
      }
    } else {
      units.push({
        refDes: `${prefix}_${techChar}${bIdx + 1}_X${qty}`,
        branchId: b.id,
        label: `${qty}x ${b.label}`,
        technology: b.technology,
        qtyRepresented: qty,
        cap_uF: Number((effEach_uF * qty).toFixed(4)),
        esr_mOhm: Number(Math.max(0.1, b.esrEach_mOhm / qty).toFixed(3)),
        esl_nH: Number(Math.max(0.1, b.eslEach_nH / qty).toFixed(2)),
        vRated_V: b.vRated_V,
      });
    }
  });

  return units;
}
