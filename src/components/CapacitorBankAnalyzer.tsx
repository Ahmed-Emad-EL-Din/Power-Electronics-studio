import React, { useState, useMemo } from 'react';
import { DcDcDesignState } from '../data/databases';
import { DcDcResults } from '../engine/dcdcEngine';
import { MathFormula } from './MathFormula';
import { InteractiveChart } from './InteractiveChart';
import { useDesignSolver, useLockableValue } from './DesignSolverContext';
import { LockToggleButton } from './AutoSolverControls';
import {
  BatteryCharging,
  ShieldCheck,
  AlertTriangle,
  Sliders,
  Flame,
  Activity,
  Clock,
  ExternalLink,
  TrendingUp,
} from 'lucide-react';

interface CapacitorBankAnalyzerProps {
  state: DcDcDesignState;
  res: DcDcResults;
  onChange: (next: DcDcDesignState) => void;
  onOpenPartDrawer?: () => void;
}

export type OutputCapTechId = 'polymer-solid' | 'low-esr-elec' | 'film-mkp';
export type DcLinkCapTechId = 'mkp-film' | 'hv-electrolytic' | 'hybrid-film-elec';

interface CapDielectricPreset {
  id: OutputCapTechId;
  name: string;
  mpn: string;
  manufacturer: string;
  lcsc: string;
  unitCap_uF: number;
  esr_100kHz_mOhm: number;
  esl_nH: number;
  rippleRating_105C_A: number;
  Rth_ca_CW: number;
  Tmax_C: number;
  L0_base_hrs: number;
  isPolymerLaw: boolean;
}

interface DcLinkDielectricPreset {
  id: DcLinkCapTechId;
  name: string;
  mpn: string;
  manufacturer: string;
  lcsc: string;
  unitCap_uF: number;
  esr_100kHz_mOhm: number;
  rippleRating_A: number;
  Rth_ca_CW: number;
  Tmax_C: number;
  L0_base_hrs: number;
}

const OUTPUT_CAP_PRESETS: Record<OutputCapTechId, CapDielectricPreset> = {
  'polymer-solid': {
    id: 'polymer-solid',
    name: 'Conductive Polymer Aluminum Solid (OS-CON / A750)',
    mpn: 'EEH-ZS1H101P / A750KS',
    manufacturer: 'Panasonic / KEMET',
    lcsc: 'C289104',
    unitCap_uF: 100,
    esr_100kHz_mOhm: 11,
    esl_nH: 3.2,
    rippleRating_105C_A: 4.2,
    Rth_ca_CW: 18,
    Tmax_C: 105,
    L0_base_hrs: 4000,
    isPolymerLaw: true,
  },
  'low-esr-elec': {
    id: 'low-esr-elec',
    name: 'Low-Z Wet Aluminum Electrolytic (105°C Long-Life)',
    mpn: 'UPW1H221MPD / EKZE',
    manufacturer: 'Nichicon / Chemi-Con',
    lcsc: 'C134920',
    unitCap_uF: 220,
    esr_100kHz_mOhm: 38,
    esl_nH: 12.0,
    rippleRating_105C_A: 1.95,
    Rth_ca_CW: 22,
    Tmax_C: 105,
    L0_base_hrs: 5000,
    isPolymerLaw: false,
  },
  'film-mkp': {
    id: 'film-mkp',
    name: 'Metallized Polypropylene DC-Filter Film (MKP)',
    mpn: 'C4AQJBW5200A3LJ',
    manufacturer: 'KEMET / TDK',
    lcsc: 'C289412',
    unitCap_uF: 47,
    esr_100kHz_mOhm: 3.5,
    esl_nH: 14.0,
    rippleRating_105C_A: 14.0,
    Rth_ca_CW: 9.5,
    Tmax_C: 105,
    L0_base_hrs: 100000,
    isPolymerLaw: false,
  },
};

const DCLINK_CAP_PRESETS: Record<DcLinkCapTechId, DcLinkDielectricPreset> = {
  'mkp-film': {
    id: 'mkp-film',
    name: 'Metallized Polypropylene DC-Link Film (MKP)',
    mpn: 'C4AQJBW5200A3LJ',
    manufacturer: 'KEMET',
    lcsc: 'C289412',
    unitCap_uF: 20,
    esr_100kHz_mOhm: 3.2,
    rippleRating_A: 14.5,
    Rth_ca_CW: 8.5,
    Tmax_C: 105,
    L0_base_hrs: 100000,
  },
  'hv-electrolytic': {
    id: 'hv-electrolytic',
    name: '450V/500V Snap-In Aluminum Electrolytic (105°C)',
    mpn: 'LGU2W151MELB',
    manufacturer: 'Nichicon',
    lcsc: 'C189402',
    unitCap_uF: 150,
    esr_100kHz_mOhm: 48.0,
    rippleRating_A: 2.85,
    Rth_ca_CW: 14.5,
    Tmax_C: 105,
    L0_base_hrs: 5000,
  },
  'hybrid-film-elec': {
    id: 'hybrid-film-elec',
    name: 'Hybrid MKP Film + Snap-In Electrolytic Bank',
    mpn: 'B32674D + LGU2W',
    manufacturer: 'TDK / Nichicon',
    lcsc: 'C2910425',
    unitCap_uF: 68,
    esr_100kHz_mOhm: 7.5,
    rippleRating_A: 8.5,
    Rth_ca_CW: 11.0,
    Tmax_C: 105,
    L0_base_hrs: 15000,
  },
};

export const CapacitorBankAnalyzer: React.FC<CapacitorBankAnalyzerProps> = ({
  state,
  res,
  onOpenPartDrawer,
}) => {
  const { setDcdcField, applyDcdcPatch, dcdcLocked, toggleDcdcLock, dcdcChanges } = useDesignSolver();

  // Auto-calculated optimal dielectrics, derating margin, and parallel capacitor counts
  const autoOutTech: OutputCapTechId = state.Vout_V >= 100 ? 'film-mkp' : 'polymer-solid';
  const autoDcLinkTech: DcLinkCapTechId =
    state.Vin_nom_V >= 350 && state.Pout_W >= 2500
      ? 'hybrid-film-elec'
      : state.Vin_nom_V >= 200
      ? 'mkp-film'
      : 'hv-electrolytic';

  const outTechLock = useLockableValue<OutputCapTechId>(autoOutTech, false);
  const dcLinkTechLock = useLockableValue<DcLinkCapTechId>(autoDcLinkTech, false);
  const outTech = outTechLock.value;
  const dcLinkTech = dcLinkTechLock.value;

  const outPreset = OUTPUT_CAP_PRESETS[outTech];
  const inPreset = DCLINK_CAP_PRESETS[dcLinkTech];

  const autoSafetyMarginPct = state.Tamb_C >= 70 ? 30 : 25;
  const safetyMarginLock = useLockableValue<number>(autoSafetyMarginPct, false);
  const safetyMarginPct = safetyMarginLock.value;

  const mlccUnitCap_uF = 10;
  const autoMarginFactor = 1 / Math.max(0.4, 1 - safetyMarginPct / 100);
  const autoIinDc_A = state.Pout_W / Math.max(24, state.Vin_nom_V * (res.efficiency_pct / 100));
  const autoDeff = Math.max(0.15, Math.min(0.92, res.Deff_nom));
  let autoIcinRms_A = 0;
  if (res.isLLC) {
    const imRms = res.Im_pk_A / Math.SQRT2;
    const ipowRms = (Math.PI / (2 * Math.SQRT2)) * (autoIinDc_A / (state.topology === 'llc-hb' ? 0.5 : 1.0));
    const ipriRms = Math.hypot(ipowRms, imRms);
    autoIcinRms_A =
      state.topology === 'llc-hb'
        ? ipriRms * 0.72
        : Math.sqrt(Math.max(0.05, ipriRms * ipriRms - autoIinDc_A * autoIinDc_A * 0.82));
  } else {
    const ipriPk = autoIinDc_A / autoDeff;
    const singleCin = ipriPk * Math.sqrt(autoDeff * (1 - autoDeff) + 0.025);
    const interleaveF = state.topology === 'psfb-2ph' ? Math.max(0.32, Math.abs(1 - 2 * autoDeff)) : 1.0;
    autoIcinRms_A = singleCin * interleaveF;
  }
  const autoIcoutRms_A = res.isLLC
    ? res.Iout_total_A * Math.sqrt((Math.PI * Math.PI) / 8 - 1) * Math.max(0.8, Math.min(1.35, 1 / Math.max(0.5, res.fn_nom)))
    : res.ICo_rms_A;

  const autoBulkOutCount = Math.max(
    2,
    Math.min(
      20,
      Math.max(
        Math.ceil((autoIcoutRms_A * autoMarginFactor * 0.82) / outPreset.rippleRating_105C_A),
        Math.round(state.Co_uF / outPreset.unitCap_uF)
      )
    )
  );
  const autoDcLinkCount = Math.max(
    1,
    Math.min(16, Math.ceil((autoIcinRms_A * autoMarginFactor) / inPreset.rippleRating_A))
  );
  const autoMlccOutCount = Math.max(2, Math.min(24, Math.ceil(res.Iout_total_A / 12) * 2));

  const bulkOutLock = useLockableValue<number>(autoBulkOutCount, false);
  const mlccOutLock = useLockableValue<number>(autoMlccOutCount, false);
  const dcLinkCountLock = useLockableValue<number>(autoDcLinkCount, false);
  const esrLock = useLockableValue<number>(outPreset.esr_100kHz_mOhm, false);

  const nParallelBulkOut = bulkOutLock.value;
  const nParallelMlccOut = mlccOutLock.value;
  const dcLinkParallelCount = dcLinkCountLock.value;
  const unitBulkEsrManual_mOhm = esrLock.value;

  const [activeChart, setActiveChart] = useState<'load-stress' | 'lifetime' | 'impedance'>('load-stress');

  const capAnalysis = useMemo(() => {
    const f_ripple_Hz = res.fRipple_out_kHz * 1e3;
    const Tamb_C = state.Tamb_C;
    const isLLC = res.isLLC;
    const isHalfBridge = state.topology === 'llc-hb';
    const isInterleaved2Ph = state.topology === 'psfb-2ph';
    const marginFactor = 1 / Math.max(0.4, 1 - safetyMarginPct / 100);

    // =========================================================================
    // 1. TOPOLOGY-EXACT INPUT & OUTPUT RMS RIPPLE CURRENT STRESS FORMULATION
    // =========================================================================
    const evalRippleStressAtLoad = (loadFraction: number) => {
      const k = Math.max(0.05, loadFraction);
      const P_load_W = state.Pout_W * k;
      const I_out_dc_A = res.Iout_total_A * k;
      const I_in_dc_A = P_load_W / Math.max(24, state.Vin_nom_V * (res.efficiency_pct / 100));
      const D_eff = Math.max(0.15, Math.min(0.92, res.Deff_nom));

      // A) Input Capacitor RMS Ripple Current I_Cin,rms based on Topology:
      let I_cin_rms_A = 0;
      if (isLLC) {
        // Resonant tank draws quasi-sinusoidal primary current with magnetizing current Im_pk floor even at light load
        const I_m_rms_A = res.Im_pk_A / Math.SQRT2;
        const I_power_rms_A = (Math.PI / (2 * Math.SQRT2)) * (I_in_dc_A / (isHalfBridge ? 0.5 : 1.0));
        const I_pri_rms_k_A = Math.hypot(I_power_rms_A, I_m_rms_A);
        if (isHalfBridge) {
          // Half-bridge split/blocking capacitor carries full primary tank RMS current; bus cap carries 1/sqrt(2)
          I_cin_rms_A = I_pri_rms_k_A * 0.72;
        } else {
          // Full-bridge rectified sinusoidal input pulses: I_cin,rms = sqrt(I_pri,rms^2 - I_in,dc^2)
          I_cin_rms_A = Math.sqrt(Math.max(0.05, I_pri_rms_k_A * I_pri_rms_k_A - I_in_dc_A * I_in_dc_A * 0.82));
        }
      } else {
        // PSFB 1-Phase or 2-Phase Interleaved: Pulsating trapezoidal bridge input current
        const I_pri_pk_k_A = I_in_dc_A / D_eff;
        const singlePhaseCinRms = I_pri_pk_k_A * Math.sqrt(D_eff * (1 - D_eff) + 0.025);
        // 2-phase interleaving cancels fundamental input capacitor ripple by factor K_in
        const interleaveFactor = isInterleaved2Ph ? Math.max(0.32, Math.abs(1 - 2 * D_eff)) : 1.0;
        I_cin_rms_A = singlePhaseCinRms * interleaveFactor;
      }

      // B) Output Capacitor RMS Ripple Current I_Cout,rms based on Topology:
      let I_cout_rms_A = 0;
      if (isLLC) {
        // LLC has capacitive output filter (no output inductor): capacitor absorbs rectified sinusoidal ripple!
        // Exact analytical relation at fn: I_Cout,rms = I_out * sqrt(pi^2 / 8 - 1) ≈ 0.4834 * I_out
        const fn_corr = Math.max(0.8, Math.min(1.35, 1 / Math.max(0.5, res.fn_nom)));
        I_cout_rms_A = I_out_dc_A * Math.sqrt((Math.PI * Math.PI) / 8 - 1) * fn_corr;
      } else {
        // PSFB has inductive output filter Lo: output capacitor only carries triangular inductor ripple deltaI_out / (2*sqrt(3))
        // Inductor ripple deltaI_L is voltage-driven (nearly constant across CCM load, tapering slightly in DCM at very light load)
        const ccmFactor = Math.min(1.0, k / 0.15);
        I_cout_rms_A = res.ICo_rms_A * (0.75 + 0.25 * ccmFactor);
      }

      return {
        P_load_W,
        I_in_dc_A,
        I_out_dc_A,
        I_cin_rms_A,
        I_cout_rms_A,
        I_cin_req_rating_A: I_cin_rms_A * marginFactor,
        I_cout_req_rating_A: I_cout_rms_A * marginFactor,
      };
    };

    const nomStress = evalRippleStressAtLoad(1.0);

    // =========================================================================
    // 2. OUTPUT CAPACITOR BANK + PARALLEL MLCC HF DECOUPLING ANALYSIS
    // =========================================================================
    const mlccDcBiasDerating = state.Vout_V > 30 ? 0.58 : 0.72;
    const C_mlcc_eff_uF = nParallelMlccOut * mlccUnitCap_uF * mlccDcBiasDerating;
    const ESR_mlcc_net_mOhm = 3.2 / Math.max(1, nParallelMlccOut);
    const ESL_mlcc_net_nH = 0.85 / Math.max(1, nParallelMlccOut);

    const unitBulkEsr_mOhm = unitBulkEsrManual_mOhm;
    const C_bulk_eff_uF = nParallelBulkOut * outPreset.unitCap_uF;
    const ESR_bulk_net_mOhm = unitBulkEsr_mOhm / Math.max(1, nParallelBulkOut);
    const ESL_bulk_net_nH = outPreset.esl_nH / Math.max(1, nParallelBulkOut);

    const C_out_total_eff_uF = C_bulk_eff_uF + C_mlcc_eff_uF;

    const evalBranchImpedance = (f_Hz: number) => {
      const w = 2 * Math.PI * f_Hz;
      const freqScaleBulk =
        f_Hz < 100e3
          ? Math.pow(100e3 / Math.max(100, f_Hz), 0.18)
          : 1 + 0.08 * Math.log10(f_Hz / 100e3);
      const rBulk = ESR_bulk_net_mOhm * 1e-3 * freqScaleBulk;
      const xBulk = w * (ESL_bulk_net_nH * 1e-9) - 1 / (w * (C_bulk_eff_uF * 1e-6));
      const zBulk_Ohm = Math.hypot(rBulk, xBulk);

      const rMlcc = ESR_mlcc_net_mOhm * 1e-3;
      const xMlcc = w * (ESL_mlcc_net_nH * 1e-9) - 1 / (w * Math.max(1e-9, C_mlcc_eff_uF * 1e-6));
      const zMlcc_Ohm = nParallelMlccOut > 0 ? Math.hypot(rMlcc, xMlcc) : 1e6;

      if (nParallelMlccOut === 0) {
        return {
          zBulk_mOhm: zBulk_Ohm * 1e3,
          zMlcc_mOhm: 1e6,
          zTot_mOhm: zBulk_Ohm * 1e3,
          esrTot_mOhm: rBulk * 1e3,
          bulkCurrentShare: 1.0,
        };
      }

      const denRe = rBulk + rMlcc;
      const denIm = xBulk + xMlcc;
      const denMag2 = Math.max(1e-12, denRe * denRe + denIm * denIm);
      const numRe = rBulk * rMlcc - xBulk * xMlcc;
      const numIm = rBulk * xMlcc + xBulk * rMlcc;

      const zTotRe = (numRe * denRe + numIm * denIm) / denMag2;
      const zTotIm = (numIm * denRe - numRe * denIm) / denMag2;
      const zTot_Ohm = Math.hypot(zTotRe, zTotIm);
      const bulkShare = Math.hypot(rMlcc, xMlcc) / Math.sqrt(denMag2);

      return {
        zBulk_mOhm: zBulk_Ohm * 1e3,
        zMlcc_mOhm: zMlcc_Ohm * 1e3,
        zTot_mOhm: zTot_Ohm * 1e3,
        esrTot_mOhm: Math.max(0.1, zTotRe * 1e3),
        bulkCurrentShare: Math.min(1.0, bulkShare),
      };
    };

    const atRipple = evalBranchImpedance(f_ripple_Hz);

    // Output Ripple Current Stress & Required Rating
    const I_out_ripple_rms_A = nomStress.I_cout_rms_A;
    const I_out_req_rating_A = nomStress.I_cout_req_rating_A;
    const I_bulk_bank_rms_A = I_out_ripple_rms_A * atRipple.bulkCurrentShare;
    const I_mlcc_bank_rms_A =
      I_out_ripple_rms_A * Math.sqrt(Math.max(0, 1 - Math.pow(atRipple.bulkCurrentShare, 2)));

    const totalOutBankRatedRipple_A = nParallelBulkOut * outPreset.rippleRating_105C_A;
    const I_bulk_per_cap_rms_A = I_bulk_bank_rms_A / Math.max(1, nParallelBulkOut);
    const outRippleStress_pct = (I_bulk_per_cap_rms_A / outPreset.rippleRating_105C_A) * 100;
    const minParallelOutForRipple = Math.max(
      1,
      Math.ceil((I_out_req_rating_A * atRipple.bulkCurrentShare) / outPreset.rippleRating_105C_A)
    );

    const P_loss_bulk_total_W = I_bulk_bank_rms_A * I_bulk_bank_rms_A * (ESR_bulk_net_mOhm * 1e-3);
    const P_loss_mlcc_total_W = I_mlcc_bank_rms_A * I_mlcc_bank_rms_A * (ESR_mlcc_net_mOhm * 1e-3);
    const P_loss_out_cap_total_W = P_loss_bulk_total_W + P_loss_mlcc_total_W;

    const deltaT_core_out_C =
      (P_loss_bulk_total_W / Math.max(1, nParallelBulkOut)) * outPreset.Rth_ca_CW;
    const T_core_out_C = Tamb_C + deltaT_core_out_C;

    const calcOutLifetimeHours = (tCore_C: number) => {
      const dT = outPreset.Tmax_C - tCore_C;
      const rawHrs = outPreset.isPolymerLaw
        ? outPreset.L0_base_hrs * Math.pow(10, dT / 20)
        : outPreset.L0_base_hrs * Math.pow(2, dT / 10);
      return Math.max(500, Math.min(500000, rawHrs));
    };

    const L10_out_hrs = calcOutLifetimeHours(T_core_out_C);
    const L10_out_years = L10_out_hrs / 8760;

    // Decomposed Output Voltage Ripple
    const deltaI_pp_A = isLLC ? I_out_ripple_rms_A * 2.2 : res.deltaIout_net_A;
    const vRipple_cap_mVpp =
      (deltaI_pp_A / (8 * f_ripple_Hz * (C_out_total_eff_uF * 1e-6))) * 1e3;
    const vRipple_esr_mVpp = deltaI_pp_A * atRipple.esrTot_mOhm;
    const ESL_tot_nH =
      nParallelMlccOut > 0
        ? (ESL_bulk_net_nH * ESL_mlcc_net_nH) / (ESL_bulk_net_nH + ESL_mlcc_net_nH)
        : ESL_bulk_net_nH;
    const vRipple_esl_mVpp =
      ((ESL_tot_nH * 1e-9) * (deltaI_pp_A / (0.15 / f_ripple_Hz))) * 1e3;
    const vRipple_total_mVpp =
      Math.hypot(vRipple_cap_mVpp, vRipple_esr_mVpp) + vRipple_esl_mVpp * 0.35;

    const f_srf_bulk_kHz =
      1 / (2 * Math.PI * Math.sqrt(ESL_bulk_net_nH * 1e-9 * C_bulk_eff_uF * 1e-6)) / 1e3;
    const f_srf_mlcc_MHz =
      nParallelMlccOut > 0
        ? 1 / (2 * Math.PI * Math.sqrt(ESL_mlcc_net_nH * 1e-9 * C_mlcc_eff_uF * 1e-6)) / 1e6
        : 0;

    // =========================================================================
    // 3. INPUT DC-LINK CAPACITOR BANK STRESS & L10 LIFETIME ANALYSIS
    // =========================================================================
    const C_dclink_total_uF = dcLinkParallelCount * inPreset.unitCap_uF;
    const ESR_dclink_net_mOhm = inPreset.esr_100kHz_mOhm / Math.max(1, dcLinkParallelCount);

    const I_dclink_rms_A = nomStress.I_cin_rms_A;
    const I_dclink_req_rating_A = nomStress.I_cin_req_rating_A;
    const totalInBankRatedRipple_A = dcLinkParallelCount * inPreset.rippleRating_A;
    const I_dclink_per_cap_rms_A = I_dclink_rms_A / Math.max(1, dcLinkParallelCount);
    const inRippleStress_pct = (I_dclink_per_cap_rms_A / inPreset.rippleRating_A) * 100;
    const minParallelInForRipple = Math.max(
      1,
      Math.ceil(I_dclink_req_rating_A / inPreset.rippleRating_A)
    );

    const P_dclink_loss_W = I_dclink_rms_A * I_dclink_rms_A * (ESR_dclink_net_mOhm * 1e-3);
    const deltaT_core_in_C =
      (P_dclink_loss_W / Math.max(1, dcLinkParallelCount)) * inPreset.Rth_ca_CW;
    const T_core_in_C = Tamb_C + deltaT_core_in_C;

    const L10_in_hrs = Math.max(
      1000,
      Math.min(500000, inPreset.L0_base_hrs * Math.pow(2, (inPreset.Tmax_C - T_core_in_C) / 10))
    );
    const L10_in_years = L10_in_hrs / 8760;

    const deltaV_dclink_Vpp =
      (I_dclink_rms_A * 1.4) / (2 * Math.PI * f_ripple_Hz * (C_dclink_total_uF * 1e-6));
    const E_stored_dclink_J = 0.5 * (C_dclink_total_uF * 1e-6) * state.Vin_nom_V * state.Vin_nom_V;

    // =========================================================================
    // 4. SWEEP CURVES FOR INTERACTIVE CHARTS
    // =========================================================================
    // Sweep 1: Load % (10% to 150%) -> Input & Output RMS Ripple Current & L10 Life
    const loadStressSweep = [];
    for (let pct = 10; pct <= 150; pct += 5) {
      const st = evalRippleStressAtLoad(pct / 100);
      const iBulkK = st.I_cout_rms_A * atRipple.bulkCurrentShare;
      const pBulkK = iBulkK * iBulkK * (ESR_bulk_net_mOhm * 1e-3);
      const tCoreOutK = Tamb_C + (pBulkK / Math.max(1, nParallelBulkOut)) * outPreset.Rth_ca_CW;
      const l10OutKHrs = calcOutLifetimeHours(tCoreOutK) / 1e3;

      loadStressSweep.push({
        loadPct: pct,
        P_load_W: Number(st.P_load_W.toFixed(0)),
        I_cin_rms_A: Number(st.I_cin_rms_A.toFixed(2)),
        I_cout_rms_A: Number(st.I_cout_rms_A.toFixed(2)),
        I_cout_bulk_rms_A: Number(iBulkK.toFixed(2)),
        tCoreOut_C: Number(tCoreOutK.toFixed(1)),
        l10Out_kHrs: Number(l10OutKHrs.toFixed(1)),
      });
    }

    // Sweep 2: Ambient Temperature (25°C to 105°C) -> Output & Input L10 Lifetime
    const lifetimeSweep = [];
    for (let tAmb = 25; tAmb <= 105; tAmb += 4) {
      const tCoreOut = tAmb + deltaT_core_out_C;
      const tCoreIn = tAmb + deltaT_core_in_C;
      const lOutHrs = calcOutLifetimeHours(tCoreOut);
      const lInHrs = Math.max(
        1000,
        Math.min(500000, inPreset.L0_base_hrs * Math.pow(2, (inPreset.Tmax_C - tCoreIn) / 10))
      );
      lifetimeSweep.push({
        tAmb_C: tAmb,
        tCoreOut_C: Number(tCoreOut.toFixed(1)),
        l10Out_kHrs: Number((lOutHrs / 1e3).toFixed(1)),
        l10In_kHrs: Number((lInHrs / 1e3).toFixed(1)),
      });
    }

    // Sweep 3: Impedance Spectrum |Z(f)|
    const impedanceSweep = [];
    for (let i = 0; i <= 70; i++) {
      const f_Hz = 1e3 * Math.pow(30e6 / 1e3, i / 70);
      const pt = evalBranchImpedance(f_Hz);
      impedanceSweep.push({
        f_Hz,
        f_kHz: f_Hz / 1e3,
        zBulk_mOhm: pt.zBulk_mOhm,
        zMlcc_mOhm: pt.zMlcc_mOhm,
        zTot_mOhm: pt.zTot_mOhm,
      });
    }

    const evalLoadStressAtPct = (pct: number) => {
      const k = Math.max(0.02, pct / 100);
      const st = evalRippleStressAtLoad(k);
      const iBulkK = st.I_cout_rms_A * atRipple.bulkCurrentShare;
      return {
        I_cin_rms_A: Number(st.I_cin_rms_A.toFixed(2)),
        I_cout_rms_A: Number(st.I_cout_rms_A.toFixed(2)),
        I_cout_bulk_rms_A: Number(iBulkK.toFixed(2)),
      };
    };

    const evalLifetimeAtTamb = (tAmb: number) => {
      const tCoreOut = tAmb + deltaT_core_out_C;
      const tCoreIn = tAmb + deltaT_core_in_C;
      const lOutHrs = calcOutLifetimeHours(tCoreOut);
      const lInHrs = Math.max(
        1000,
        Math.min(500000, inPreset.L0_base_hrs * Math.pow(2, (inPreset.Tmax_C - tCoreIn) / 10))
      );
      return {
        l10Out_kHrs: Number((lOutHrs / 1e3).toFixed(2)),
        l10In_kHrs: Number((lInHrs / 1e3).toFixed(2)),
      };
    };

    return {
      unitBulkEsr_mOhm,
      C_bulk_eff_uF,
      C_mlcc_eff_uF,
      C_out_total_eff_uF,
      ESR_bulk_net_mOhm,
      ESR_mlcc_net_mOhm,
      atRipple,
      I_out_ripple_rms_A,
      I_out_req_rating_A,
      I_bulk_bank_rms_A,
      I_mlcc_bank_rms_A,
      totalOutBankRatedRipple_A,
      I_bulk_per_cap_rms_A,
      outRippleStress_pct,
      minParallelOutForRipple,
      P_loss_bulk_total_W,
      P_loss_mlcc_total_W,
      P_loss_out_cap_total_W,
      deltaT_core_out_C,
      T_core_out_C,
      L10_out_hrs,
      L10_out_years,
      vRipple_cap_mVpp,
      vRipple_esr_mVpp,
      vRipple_esl_mVpp,
      vRipple_total_mVpp,
      f_srf_bulk_kHz,
      f_srf_mlcc_MHz,
      C_dclink_total_uF,
      ESR_dclink_net_mOhm,
      I_dclink_rms_A,
      I_dclink_req_rating_A,
      totalInBankRatedRipple_A,
      I_dclink_per_cap_rms_A,
      inRippleStress_pct,
      minParallelInForRipple,
      P_dclink_loss_W,
      deltaT_core_in_C,
      T_core_in_C,
      L10_in_hrs,
      L10_in_years,
      deltaV_dclink_Vpp,
      E_stored_dclink_J,
      loadStressSweep,
      lifetimeSweep,
      impedanceSweep,
      evalLoadStressAtPct,
      evalLifetimeAtTamb,
      evalBranchImpedance,
    };
  }, [
    state,
    res,
    outPreset,
    inPreset,
    nParallelBulkOut,
    nParallelMlccOut,
    mlccUnitCap_uF,
    dcLinkParallelCount,
    safetyMarginPct,
    unitBulkEsrManual_mOhm,
  ]);

  const svgW = 860;
  const svgH = 315;
  const padL = 58;
  const padR = 56;
  const padT = 24;
  const padB = 40;
  const plotW = svgW - padL - padR;
  const plotH = svgH - padT - padB;

  const bothBanksSafe =
    capAnalysis.outRippleStress_pct <= 100 &&
    capAnalysis.inRippleStress_pct <= 100 &&
    capAnalysis.T_core_out_C <= outPreset.Tmax_C - 5;

  return (
    <div className="bg-white dark:bg-[#14171f] border border-slate-200 dark:border-white/[0.08] rounded-xl p-4 space-y-4">
      {/* HEADER BAR */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-white/[0.08] pb-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <BatteryCharging className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <h3 className="text-sm font-bold font-mono text-slate-900 dark:text-[#eef0f6]">
              Capacitor Stress Analysis: RMS Ripple Current Rating &amp; L10 Life
            </h3>
            <span
              className={`px-2 py-0.5 text-[11px] font-mono font-semibold rounded inline-flex items-center gap-1 ${
                bothBanksSafe
                  ? 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-500/30'
                  : 'bg-amber-50 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-500/30'
              }`}
            >
              {bothBanksSafe ? (
                <>
                  <ShieldCheck className="w-3.5 h-3.5" /> PASS · Out L10 {(capAnalysis.L10_out_hrs / 1e3).toFixed(0)}k hrs · In L10 {(capAnalysis.L10_in_hrs / 1e3).toFixed(0)}k hrs
                </>
              ) : (
                <>
                  <AlertTriangle className="w-3.5 h-3.5" /> OVERSTRESS (Out: {capAnalysis.outRippleStress_pct.toFixed(0)}% · In: {capAnalysis.inRippleStress_pct.toFixed(0)}%) — Auto-Size Recommended
                </>
              )}
            </span>
          </div>
          <p className="text-xs text-slate-600 dark:text-[#a1a8b8] mt-1">
            Computes <strong className="text-blue-700 dark:text-blue-400">Input DC-Link (I_Cin,rms)</strong> &amp;{' '}
            <strong className="text-emerald-700 dark:text-emerald-400">Output Filter (I_Cout,rms)</strong> ripple stress for{' '}
            <span className="font-mono font-semibold text-slate-800 dark:text-[#eef0f6]">
              {state.topology.toUpperCase()} ({state.Pout_W} W, {state.fsw_kHz} kHz)
            </span>
            , including <strong className="text-amber-700 dark:text-amber-400">ESR self-heating ΔT_core</strong> and Arrhenius / Polymer life.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              bulkOutLock.setManual(capAnalysis.minParallelOutForRipple);
              dcLinkCountLock.setManual(capAnalysis.minParallelInForRipple);
            }}
            className="px-2.5 py-1.5 text-[11px] font-mono bg-blue-50 dark:bg-blue-500/15 hover:bg-blue-100 dark:hover:bg-blue-500/25 border border-blue-300 dark:border-blue-500/40 text-blue-700 dark:text-blue-300 rounded-lg font-semibold cursor-pointer transition-colors"
          >
            Auto-Size for +{safetyMarginPct}% Margin (In: {capAnalysis.minParallelInForRipple}×, Out: {capAnalysis.minParallelOutForRipple}×)
          </button>
          <button
            type="button"
            onClick={() =>
              applyDcdcPatch({
                Co_uF: Math.round(capAnalysis.C_out_total_eff_uF),
                ESR_Co_mOhm: Number(capAnalysis.atRipple.esrTot_mOhm.toFixed(2)),
              })
            }
            className="px-2.5 py-1.5 text-[11px] font-mono bg-blue-600 hover:bg-blue-500 text-white rounded-lg inline-flex items-center gap-1.5 font-semibold shadow-2xs cursor-pointer transition-colors"
          >
            <Sliders className="w-3 h-3" /> Apply C_out ({capAnalysis.C_out_total_eff_uF.toFixed(0)}µF,{' '}
            {capAnalysis.atRipple.esrTot_mOhm.toFixed(1)}mΩ) to Stage
          </button>
          {onOpenPartDrawer && (
            <button
              type="button"
              onClick={onOpenPartDrawer}
              className="px-2.5 py-1.5 text-[11px] font-mono bg-white dark:bg-[#1c202b] hover:border-blue-400 border border-slate-300 dark:border-white/[0.12] text-slate-700 dark:text-[#eef0f6] rounded-lg inline-flex items-center gap-1.5 font-medium cursor-pointer transition-colors"
            >
              <ExternalLink className="w-3 h-3 text-blue-600 dark:text-blue-400" /> Parts Catalog
            </button>
          )}
        </div>
      </div>

      {/* ROW 1: CONTROLS & INPUT/OUTPUT CAPACITOR STRESS KPI CARDS */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5">
        {/* Left Controls (5 cols) */}
        <div className="lg:col-span-5 bg-slate-50 dark:bg-[#0e1015] border border-slate-200 dark:border-white/[0.08] rounded-xl p-3.5 space-y-3">
          <div className="text-[13px] font-medium text-slate-900 dark:text-[#eef0f6] flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" /> Capacitor Dielectrics, ESR &amp; Thermal Controls
            </span>
            {esrLock.locked && (
              <button
                type="button"
                onClick={() => esrLock.resetToAuto()}
                className="text-[10px] text-amber-700 dark:text-amber-400 underline cursor-pointer"
              >
                Reset ESR to Auto
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <div className="flex items-center justify-between gap-1 mb-1">
                <label className="text-[10px] font-mono font-medium text-slate-600 dark:text-[#a1a8b8]">
                  Output Cap Dielectric
                </label>
                <LockToggleButton compact locked={outTechLock.locked} onToggle={outTechLock.toggleLock} label="Output Cap Dielectric" />
              </div>
              <select
                value={outTech}
                onChange={(e) => {
                  outTechLock.setManual(e.target.value as OutputCapTechId);
                  esrLock.resetToAuto();
                }}
                className="w-full px-2 py-1.5 text-xs font-mono bg-white dark:bg-[#14171f] border border-slate-300 dark:border-white/[0.12] rounded-md text-slate-900 dark:text-[#eef0f6]"
              >
                <option value="polymer-solid">Conductive Polymer Solid (11mΩ, 4.2A)</option>
                <option value="low-esr-elec">Low-ESR Wet Electrolytic (38mΩ, 1.95A)</option>
                <option value="film-mkp">Metallized Polypropylene Film (3.5mΩ, 14A)</option>
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between gap-1 mb-1">
                <label className="text-[10px] font-mono font-medium text-slate-600 dark:text-[#a1a8b8]">
                  Input DC-Link Dielectric
                </label>
                <LockToggleButton compact locked={dcLinkTechLock.locked} onToggle={dcLinkTechLock.toggleLock} label="DC-Link Dielectric" />
              </div>
              <select
                value={dcLinkTech}
                onChange={(e) => dcLinkTechLock.setManual(e.target.value as DcLinkCapTechId)}
                className="w-full px-2 py-1.5 text-xs font-mono bg-white dark:bg-[#14171f] border border-slate-300 dark:border-white/[0.12] rounded-md text-slate-900 dark:text-[#eef0f6]"
              >
                <option value="mkp-film">MKP Polypropylene Film (3.2mΩ, 14.5A)</option>
                <option value="hv-electrolytic">450V Snap-In Electrolytic (48mΩ, 2.85A)</option>
                <option value="hybrid-film-elec">Hybrid Film + Electrolytic (7.5mΩ, 8.5A)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200 dark:border-white/[0.08]">
            <div>
              <div className="flex justify-between items-center text-[10px] font-mono mb-1">
                <span className="text-slate-600 dark:text-[#a1a8b8]">Out Bulk (×{outPreset.unitCap_uF}µF)</span>
                <div className="inline-flex items-center gap-1">
                  <span className="text-emerald-700 dark:text-emerald-400 font-bold tabular-nums">{nParallelBulkOut}× ({capAnalysis.C_bulk_eff_uF}µF)</span>
                  <LockToggleButton compact locked={bulkOutLock.locked} onToggle={bulkOutLock.toggleLock} label="Output Bulk Count" />
                </div>
              </div>
              <input
                type="range"
                min={1}
                max={20}
                step={1}
                value={nParallelBulkOut}
                onChange={(e) => bulkOutLock.setManual(Number(e.target.value))}
                className="w-full cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between items-center text-[10px] font-mono mb-1">
                <span className="text-slate-600 dark:text-[#a1a8b8]">In DC-Link (×{inPreset.unitCap_uF}µF)</span>
                <div className="inline-flex items-center gap-1">
                  <span className="text-blue-700 dark:text-blue-400 font-bold tabular-nums">{dcLinkParallelCount}× ({capAnalysis.C_dclink_total_uF}µF)</span>
                  <LockToggleButton compact locked={dcLinkCountLock.locked} onToggle={dcLinkCountLock.toggleLock} label="DC-Link Cap Count" />
                </div>
              </div>
              <input
                type="range"
                min={1}
                max={16}
                step={1}
                value={dcLinkParallelCount}
                onChange={(e) => dcLinkCountLock.setManual(Number(e.target.value))}
                className="w-full cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between items-center text-[10px] font-mono mb-1">
                <span className="text-slate-600 dark:text-[#a1a8b8]">Unit Cap ESR (100kHz)</span>
                <div className="inline-flex items-center gap-1">
                  <span className="text-amber-700 dark:text-amber-400 font-bold tabular-nums">{capAnalysis.unitBulkEsr_mOhm.toFixed(1)} mΩ</span>
                  <LockToggleButton compact locked={esrLock.locked} onToggle={esrLock.toggleLock} label="Unit Cap ESR" />
                </div>
              </div>
              <input
                type="range"
                min={2}
                max={80}
                step={1}
                value={capAnalysis.unitBulkEsr_mOhm}
                onChange={(e) => esrLock.setManual(Number(e.target.value))}
                className="w-full cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between items-center text-[10px] font-mono mb-1">
                <span className="text-slate-600 dark:text-[#a1a8b8]">Ambient Temp T_amb</span>
                <div className="inline-flex items-center gap-1">
                  <span className="text-rose-700 dark:text-rose-400 font-bold tabular-nums">{state.Tamb_C} °C</span>
                  <LockToggleButton
                    compact
                    locked={dcdcLocked.Tamb_C}
                    recentlyAutoUpdated={dcdcChanges.some((c) => c.key === 'Tamb_C')}
                    onToggle={() => toggleDcdcLock('Tamb_C')}
                    label="Ambient Temp Tamb"
                  />
                </div>
              </div>
              <input
                type="range"
                min={25}
                max={85}
                step={5}
                value={state.Tamb_C}
                onChange={(e) => setDcdcField('Tamb_C', Number(e.target.value))}
                className="w-full cursor-pointer"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200 dark:border-white/[0.08]">
            <div>
              <div className="flex justify-between items-center text-[10px] font-mono mb-1">
                <span className="text-slate-600 dark:text-[#a1a8b8]">Parallel HF MLCCs</span>
                <div className="inline-flex items-center gap-1">
                  <span className="text-blue-700 dark:text-blue-400 font-bold tabular-nums">{nParallelMlccOut}× {mlccUnitCap_uF}µF</span>
                  <LockToggleButton compact locked={mlccOutLock.locked} onToggle={mlccOutLock.toggleLock} label="Parallel HF MLCCs" />
                </div>
              </div>
              <input
                type="range"
                min={0}
                max={24}
                step={2}
                value={nParallelMlccOut}
                onChange={(e) => mlccOutLock.setManual(Number(e.target.value))}
                className="w-full cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between items-center text-[10px] font-mono mb-1">
                <span className="text-slate-600 dark:text-[#a1a8b8]">Ripple Derating Margin</span>
                <div className="inline-flex items-center gap-1">
                  <span className="text-blue-700 dark:text-blue-300 font-bold tabular-nums">{safetyMarginPct}%</span>
                  <LockToggleButton compact locked={safetyMarginLock.locked} onToggle={safetyMarginLock.toggleLock} label="Ripple Derating Margin" />
                </div>
              </div>
              <input
                type="range"
                min={10}
                max={40}
                step={5}
                value={safetyMarginPct}
                onChange={(e) => safetyMarginLock.setManual(Number(e.target.value))}
                className="w-full cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Right KPI Cards (7 cols): Card 1 = Input DC-Link Stress, Card 2 = Output Filter Stress */}
        <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Card 1: Input Capacitor Bank Stress & Life-Expectancy */}
          <div className="bg-white dark:bg-[#14171f] border border-slate-200 dark:border-white/[0.08] border-t-2 border-t-blue-500 rounded-xl p-3.5 flex flex-col justify-between space-y-2.5">
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-900 dark:text-[#eef0f6]">
                  1. Input DC-Link ({state.Vin_nom_V}V)
                </span>
                <span
                  className={`px-2 py-0.5 text-[10px] font-mono font-semibold rounded border shrink-0 ${
                    capAnalysis.inRippleStress_pct <= 85
                      ? 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-500/30'
                      : capAnalysis.inRippleStress_pct <= 100
                      ? 'bg-amber-50 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-500/30'
                      : 'bg-rose-50 dark:bg-rose-500/15 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-500/30'
                  }`}
                >
                  {capAnalysis.inRippleStress_pct <= 100 ? 'PASS' : 'OVER'} · {capAnalysis.inRippleStress_pct.toFixed(0)}% Load
                </span>
              </div>

              {/* Ripple Capacity Utilization Bar */}
              <div className="mt-2">
                <div className="flex justify-between text-[10px] font-mono text-slate-500 dark:text-[#727b8e] mb-1">
                  <span>Ripple Utilization ({capAnalysis.I_dclink_rms_A.toFixed(2)}A / {capAnalysis.totalInBankRatedRipple_A.toFixed(1)}A rated)</span>
                  <span>{dcLinkParallelCount}×{inPreset.rippleRating_A}A</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-white/[0.08] overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      capAnalysis.inRippleStress_pct <= 85
                        ? 'bg-blue-600 dark:bg-blue-400'
                        : capAnalysis.inRippleStress_pct <= 100
                        ? 'bg-amber-500'
                        : 'bg-rose-500'
                    }`}
                    style={{ width: `${Math.min(100, Math.max(4, capAnalysis.inRippleStress_pct))}%` }}
                  />
                </div>
              </div>

              <div className="mt-2.5 grid grid-cols-2 gap-2 text-xs font-mono">
                <div className="p-2 rounded-lg bg-slate-50 dark:bg-[#0e1015] border border-slate-200 dark:border-white/[0.08]">
                  <div className="text-[10px] text-slate-500 dark:text-[#727b8e]">I_Cin,rms (Op / Req)</div>
                  <div className="text-sm font-bold text-blue-700 dark:text-blue-400 mt-0.5 tabular-nums">
                    {capAnalysis.I_dclink_rms_A.toFixed(2)} / {capAnalysis.I_dclink_req_rating_A.toFixed(2)} A
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-[#727b8e] mt-0.5">
                    C_total = {capAnalysis.C_dclink_total_uF} µF
                  </div>
                </div>
                <div className="p-2 rounded-lg bg-slate-50 dark:bg-[#0e1015] border border-slate-200 dark:border-white/[0.08]">
                  <div className="text-[10px] text-slate-500 dark:text-[#727b8e]">Hotspot &amp; L10 Life</div>
                  <div className="text-sm font-bold text-slate-900 dark:text-[#eef0f6] mt-0.5 tabular-nums">
                    {capAnalysis.T_core_in_C.toFixed(1)} °C (+{capAnalysis.deltaT_core_in_C.toFixed(1)}°)
                  </div>
                  <div className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 mt-0.5">
                    {(capAnalysis.L10_in_hrs / 1e3).toFixed(0)}k hrs ({capAnalysis.L10_in_years.toFixed(1)} yrs)
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t border-slate-200 dark:border-white/[0.08] pt-2 text-[11px] font-mono space-y-1">
              <div className="flex justify-between gap-2">
                <span className="text-slate-600 dark:text-[#a1a8b8]">Net ESR &amp; Loss:</span>
                <span className="text-amber-700 dark:text-amber-400 font-semibold tabular-nums">
                  {capAnalysis.ESR_dclink_net_mOhm.toFixed(2)} mΩ · {(capAnalysis.P_dclink_loss_W * 1e3).toFixed(0)} mW
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-600 dark:text-[#a1a8b8]">Bus Ripple &amp; Energy:</span>
                <span className="text-blue-700 dark:text-blue-300 font-semibold tabular-nums">
                  ΔV = {capAnalysis.deltaV_dclink_Vpp.toFixed(2)} Vpp · {capAnalysis.E_stored_dclink_J.toFixed(2)} J
                </span>
              </div>
            </div>
          </div>

          {/* Card 2: Output Capacitor Bank Stress & Life-Expectancy */}
          <div className="bg-white dark:bg-[#14171f] border border-slate-200 dark:border-white/[0.08] border-t-2 border-t-emerald-500 rounded-xl p-3.5 flex flex-col justify-between space-y-2.5">
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-900 dark:text-[#eef0f6]">
                  2. Output Filter ({state.Vout_V}V)
                </span>
                <span
                  className={`px-2 py-0.5 text-[10px] font-mono font-semibold rounded border shrink-0 ${
                    capAnalysis.outRippleStress_pct <= 85
                      ? 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-500/30'
                      : capAnalysis.outRippleStress_pct <= 100
                      ? 'bg-amber-50 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-500/30'
                      : 'bg-rose-50 dark:bg-rose-500/15 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-500/30'
                  }`}
                >
                  {capAnalysis.outRippleStress_pct <= 100 ? 'PASS' : 'OVER'} · {capAnalysis.outRippleStress_pct.toFixed(0)}% Load
                </span>
              </div>

              {/* Ripple Capacity Utilization Bar */}
              <div className="mt-2">
                <div className="flex justify-between text-[10px] font-mono text-slate-500 dark:text-[#727b8e] mb-1">
                  <span>Ripple Utilization ({capAnalysis.I_bulk_bank_rms_A.toFixed(2)}A / {capAnalysis.totalOutBankRatedRipple_A.toFixed(1)}A rated)</span>
                  <span>{nParallelBulkOut}×{outPreset.rippleRating_105C_A}A</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-white/[0.08] overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      capAnalysis.outRippleStress_pct <= 85
                        ? 'bg-emerald-600 dark:bg-emerald-400'
                        : capAnalysis.outRippleStress_pct <= 100
                        ? 'bg-amber-500'
                        : 'bg-rose-500'
                    }`}
                    style={{ width: `${Math.min(100, Math.max(4, capAnalysis.outRippleStress_pct))}%` }}
                  />
                </div>
              </div>

              <div className="mt-2.5 grid grid-cols-2 gap-2 text-xs font-mono">
                <div className="p-2 rounded-lg bg-slate-50 dark:bg-[#0e1015] border border-slate-200 dark:border-white/[0.08]">
                  <div className="text-[10px] text-slate-500 dark:text-[#727b8e]">I_Cout,rms (Op / Req)</div>
                  <div className="text-sm font-bold text-emerald-700 dark:text-emerald-400 mt-0.5 tabular-nums">
                    {capAnalysis.I_out_ripple_rms_A.toFixed(2)} / {capAnalysis.I_out_req_rating_A.toFixed(2)} A
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-[#727b8e] mt-0.5">
                    Bulk {capAnalysis.I_bulk_bank_rms_A.toFixed(1)}A · MLCC {capAnalysis.I_mlcc_bank_rms_A.toFixed(1)}A
                  </div>
                </div>
                <div className="p-2 rounded-lg bg-slate-50 dark:bg-[#0e1015] border border-slate-200 dark:border-white/[0.08]">
                  <div className="text-[10px] text-slate-500 dark:text-[#727b8e]">Hotspot &amp; L10 Life</div>
                  <div className="text-sm font-bold text-slate-900 dark:text-[#eef0f6] mt-0.5 tabular-nums">
                    {capAnalysis.T_core_out_C.toFixed(1)} °C (+{capAnalysis.deltaT_core_out_C.toFixed(1)}°)
                  </div>
                  <div className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 mt-0.5">
                    {(capAnalysis.L10_out_hrs / 1e3).toFixed(0)}k hrs ({capAnalysis.L10_out_years.toFixed(1)} yrs)
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t border-slate-200 dark:border-white/[0.08] pt-2 text-[11px] font-mono space-y-1">
              <div className="flex justify-between gap-2">
                <span className="text-slate-600 dark:text-[#a1a8b8]">Net ESR &amp; Loss:</span>
                <span className="text-amber-700 dark:text-amber-400 font-semibold tabular-nums">
                  {capAnalysis.atRipple.esrTot_mOhm.toFixed(2)} mΩ · {capAnalysis.P_loss_out_cap_total_W.toFixed(2)} W
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-600 dark:text-[#a1a8b8]">Output Ripple ΔV_out:</span>
                <span className="text-slate-900 dark:text-[#eef0f6] font-semibold tabular-nums">
                  {capAnalysis.vRipple_total_mVpp.toFixed(0)} mVpp <span className="text-slate-500 dark:text-[#727b8e] font-normal">(ESR {capAnalysis.vRipple_esr_mVpp.toFixed(0)}mV, ΔQ {capAnalysis.vRipple_cap_mVpp.toFixed(0)}mV)</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ROW 2: INTERACTIVE SVG CHARTS */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-white/[0.08] pb-2.5">
          <div className="flex flex-nowrap sm:flex-wrap items-center gap-1 bg-[#eceef2] dark:bg-[#090a0d] p-1 rounded-lg border border-slate-200/80 dark:border-white/[0.07] overflow-x-auto no-scrollbar max-w-full">
            <button
              type="button"
              onClick={() => setActiveChart('load-stress')}
              className={`px-2.5 py-1 text-xs font-mono rounded-md inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                activeChart === 'load-stress'
                  ? 'bg-white dark:bg-[#1c202b] text-blue-700 dark:text-blue-300 border border-slate-200 dark:border-white/[0.12] font-semibold shadow-2xs'
                  : 'text-slate-600 dark:text-[#a1a8b8] hover:text-slate-900 dark:hover:text-[#eef0f6] border border-transparent'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" /> 1. RMS Ripple vs. Load (10–150%)
            </button>
            <button
              type="button"
              onClick={() => setActiveChart('lifetime')}
              className={`px-2.5 py-1 text-xs font-mono rounded-md inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                activeChart === 'lifetime'
                  ? 'bg-white dark:bg-[#1c202b] text-blue-700 dark:text-blue-300 border border-slate-200 dark:border-white/[0.12] font-semibold shadow-2xs'
                  : 'text-slate-600 dark:text-[#a1a8b8] hover:text-slate-900 dark:hover:text-[#eef0f6] border border-transparent'
              }`}
            >
              <Clock className="w-3.5 h-3.5" /> 2. L10 Life vs. Temperature
            </button>
            <button
              type="button"
              onClick={() => setActiveChart('impedance')}
              className={`px-2.5 py-1 text-xs font-mono rounded-md inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                activeChart === 'impedance'
                  ? 'bg-white dark:bg-[#1c202b] text-blue-700 dark:text-blue-300 border border-slate-200 dark:border-white/[0.12] font-semibold shadow-2xs'
                  : 'text-slate-600 dark:text-[#a1a8b8] hover:text-slate-900 dark:hover:text-[#eef0f6] border border-transparent'
              }`}
            >
              <Activity className="w-3.5 h-3.5" /> 3. Bank Impedance |Z(f)|
            </button>
          </div>

          <div className="text-[11px] font-mono text-slate-600 dark:text-[#a1a8b8]">
            Out: <strong className="text-emerald-700 dark:text-emerald-400">{outPreset.mpn}</strong> · In:{' '}
            <strong className="text-blue-700 dark:text-blue-400">{inPreset.mpn}</strong>
          </div>
        </div>

        {/* CHART 1: INPUT & OUTPUT RMS RIPPLE CURRENT STRESS VS LOAD % — INTERACTIVE ZOOM & PAN */}
        {activeChart === 'load-stress' && (
          <InteractiveChart
            title="Input & Output Capacitor RMS Ripple Current vs. Converter Load (%)"
            subtitle={`Drag on chart or click + / - to Zoom In / Out · Output Bank Rating = ${capAnalysis.totalOutBankRatedRipple_A.toFixed(1)} A_rms (${nParallelBulkOut}×${outPreset.rippleRating_105C_A}A)`}
            xLabel="Converter Load"
            xUnit="%"
            minPhysX={5}
            maxPhysX={200}
            currentX={100}
            currentXLabel={`100% (${state.Pout_W}W)`}
            domainEvaluator={(pct) => {
              const r = capAnalysis.evalLoadStressAtPct(pct);
              return {
                I_cout_rms_A: r.I_cout_rms_A,
                I_cin_rms_A: r.I_cin_rms_A,
                I_cout_bulk_rms_A: r.I_cout_bulk_rms_A,
              };
            }}
            horizontalMarkers={[
              {
                value: Number(capAnalysis.totalOutBankRatedRipple_A.toFixed(2)),
                label: `Out Bulk Bank Rating (${capAnalysis.totalOutBankRatedRipple_A.toFixed(1)} A_rms)`,
                color: '#f43f5e',
                axis: 'left',
              },
              {
                value: Number(capAnalysis.totalInBankRatedRipple_A.toFixed(2)),
                label: `In DC-Link Rating (${capAnalysis.totalInBankRatedRipple_A.toFixed(1)} A_rms)`,
                color: '#38bdf8',
                axis: 'left',
              },
            ]}
            data={capAnalysis.loadStressSweep.map((p) => ({
              x: p.loadPct,
              I_cout_rms_A: p.I_cout_rms_A,
              I_cin_rms_A: p.I_cin_rms_A,
              I_cout_bulk_rms_A: p.I_cout_bulk_rms_A,
            }))}
            series={[
              {
                key: 'I_cout_rms_A',
                label: 'Total Output I_Cout,rms',
                unit: 'A',
                color: '#10b981',
                axis: 'left',
              },
              {
                key: 'I_cin_rms_A',
                label: 'Input DC-Link I_Cin,rms',
                unit: 'A',
                color: '#38bdf8',
                axis: 'left',
              },
              {
                key: 'I_cout_bulk_rms_A',
                label: 'Output Bulk Bank Share',
                unit: 'A',
                color: '#c084fc',
                axis: 'left',
                dashed: true,
              },
            ]}
          />
        )}

        {/* CHART 2: ARRHENIUS / POLYMER L10 OPERATING LIFETIME VS TEMPERATURE — INTERACTIVE ZOOM & PAN */}
        {activeChart === 'lifetime' && (
          <InteractiveChart
            title="Capacitor Bank Life-Expectancy L_10 (kHrs) vs. Ambient Temperature"
            subtitle={`Drag on chart or click + / - to Zoom In / Out · Click anywhere to set T_amb · At T_amb=${state.Tamb_C}°C: Out L_10 = ${(capAnalysis.L10_out_hrs / 1e3).toFixed(1)}k hrs (${capAnalysis.L10_out_years.toFixed(1)} yrs)`}
            xLabel="Ambient Temperature T_amb"
            xUnit="°C"
            minPhysX={-20}
            maxPhysX={125}
            currentX={state.Tamb_C}
            currentXLabel={`Tamb=${state.Tamb_C}°C`}
            onSelectX={(tAmb) =>
              setDcdcField('Tamb_C', Math.max(-20, Math.min(105, Math.round(tAmb))))
            }
            domainEvaluator={(tAmb) => {
              const r = capAnalysis.evalLifetimeAtTamb(tAmb);
              return {
                l10Out_kHrs: r.l10Out_kHrs,
                l10In_kHrs: r.l10In_kHrs,
              };
            }}
            data={capAnalysis.lifetimeSweep.map((p) => ({
              x: p.tAmb_C,
              l10Out_kHrs: p.l10Out_kHrs,
              l10In_kHrs: p.l10In_kHrs,
            }))}
            series={[
              {
                key: 'l10Out_kHrs',
                label: `Output Bank L_10 (${outPreset.mpn})`,
                unit: 'kHrs',
                color: '#10b981',
                axis: 'left',
              },
              {
                key: 'l10In_kHrs',
                label: `Input DC-Link L_10 (${inPreset.mpn})`,
                unit: 'kHrs',
                color: '#38bdf8',
                axis: 'left',
                dashed: true,
              },
            ]}
          />
        )}

        {/* CHART 3: COMPOSITE BANK IMPEDANCE |Z(f)| SPECTRUM — INTERACTIVE ZOOM & PAN */}
        {activeChart === 'impedance' && (
          <InteractiveChart
            title="Composite Output Capacitor Bank Impedance |Z(f)| & Self-Resonance (SRF)"
            subtitle={`Drag on chart or click + / - to Zoom In / Out across 100 Hz – 100 MHz · f_ripple = ${res.fRipple_out_kHz.toFixed(0)} kHz (|Z_tot| = ${capAnalysis.atRipple.zTot_mOhm.toFixed(2)} mΩ)`}
            xLabel="Frequency"
            xUnit="kHz"
            logX={true}
            minPhysX={0.1}
            maxPhysX={100000}
            currentX={res.fRipple_out_kHz}
            currentXLabel={`f_rip=${res.fRipple_out_kHz.toFixed(0)}kHz`}
            domainEvaluator={(f_kHz) => {
              const pt = capAnalysis.evalBranchImpedance(Math.max(10, f_kHz * 1e3));
              return {
                zTot_mOhm: Number(pt.zTot_mOhm.toFixed(3)),
                zBulk_mOhm: Number(pt.zBulk_mOhm.toFixed(3)),
                zMlcc_mOhm: Number(Math.min(2000, pt.zMlcc_mOhm).toFixed(3)),
              };
            }}
            verticalMarkers={[
              {
                x: Number(capAnalysis.f_srf_bulk_kHz.toFixed(1)),
                label: `Bulk SRF (${capAnalysis.f_srf_bulk_kHz.toFixed(0)} kHz)`,
                color: '#38bdf8',
              },
              ...(nParallelMlccOut > 0
                ? [
                    {
                      x: Number((capAnalysis.f_srf_mlcc_MHz * 1e3).toFixed(0)),
                      label: `MLCC SRF (${capAnalysis.f_srf_mlcc_MHz.toFixed(2)} MHz)`,
                      color: '#c084fc',
                    },
                  ]
                : []),
            ]}
            data={capAnalysis.impedanceSweep.map((p) => ({
              x: Number(p.f_kHz.toFixed(3)),
              zTot_mOhm: Number(p.zTot_mOhm.toFixed(3)),
              zBulk_mOhm: Number(p.zBulk_mOhm.toFixed(3)),
              zMlcc_mOhm: Number(Math.min(2000, p.zMlcc_mOhm).toFixed(3)),
            }))}
            series={[
              {
                key: 'zTot_mOhm',
                label: 'Composite Bank |Z_tot(f)|',
                unit: 'mΩ',
                color: '#10b981',
                axis: 'left',
              },
              {
                key: 'zBulk_mOhm',
                label: 'Bulk Stage |Z_bulk(f)|',
                unit: 'mΩ',
                color: '#38bdf8',
                axis: 'left',
                dashed: true,
              },
              ...(nParallelMlccOut > 0
                ? [
                    {
                      key: 'zMlcc_mOhm',
                      label: 'MLCC Stage |Z_mlcc(f)|',
                      unit: 'mΩ',
                      color: '#c084fc',
                      axis: 'left' as const,
                      dashed: true,
                    },
                  ]
                : []),
            ]}
          />
        )}
      </div>

      {/* ROW 3: GOVERNING TOPOLOGY RIPPLE & LIFE-EXPECTANCY EQUATIONS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs font-mono">
        <div className="p-2.5 rounded bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
          <div className="text-[10px] text-slate-400 mb-1 flex items-center gap-1">
            <Flame className="w-3 h-3 text-blue-400" /> 1. Topology Input &amp; Output RMS Ripple:
          </div>
          <MathFormula
            tex={
              res.isLLC
                ? 'I_{C,\\text{out,rms}}^{\\text{LLC}} = I_{\\text{out}}\\sqrt{\\frac{\\pi^2}{8}-1}, \\quad I_{C,\\text{in,rms}} = \\sqrt{I_{\\text{pri,rms}}^2 - I_{\\text{in,dc}}^2}'
                : 'I_{C,\\text{in,rms}}^{\\text{PSFB}} = I_{\\text{pri,pk}}\\sqrt{D_{\\text{eff}}(1-D_{\\text{eff}})}, \\quad I_{C,\\text{out,rms}} = \\frac{\\Delta I_{L,\\text{net}}}{2\\sqrt{3}}'
            }
          />
        </div>
        <div className="p-2.5 rounded bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
          <div className="text-[10px] text-slate-400 mb-1">2. ESR Self-Heating &amp; Core Hot-Spot:</div>
          <MathFormula tex="T_{\text{core}} = T_{\text{amb}} + \left(\frac{I_{C,\text{rms}}}{N_{\text{par}}}\right)^2 \text{ESR}(f_{\text{rip}}) \cdot R_{\text{th,ca}}" />
        </div>
        <div className="p-2.5 rounded bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
          <div className="text-[10px] text-slate-400 mb-1">3. Arrhenius / Polymer Life-Expectancy L_10:</div>
          <MathFormula tex="L_{10,\text{elec}} = L_0 \cdot 2^{\frac{T_{\max}-T_{\text{core}}}{10}}, \quad L_{10,\text{poly}} = L_0 \cdot 10^{\frac{T_{\max}-T_{\text{core}}}{20}}" />
        </div>
      </div>
    </div>
  );
};
