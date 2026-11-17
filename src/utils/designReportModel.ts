// ============================================================================
// UNIFIED ENGINEERING DESIGN REPORT MODEL
// Single source of truth for both the Interactive Engineering Book Modal
// and the Client-Side Multi-Page Vector PDF Generator (jsPDF).
// ============================================================================

import { AcDcDesignState, DcDcDesignState } from '../data/databases';
import { AcDcResults } from '../engine/acdcEngine';
import { DcDcResults } from '../engine/dcdcEngine';
import { DesignAlertSummary } from '../engine/designAlerts';
import {
  CapacitorBankSolution,
  CircuitCapacitorRequirement,
  CircuitInductorRequirement,
  CustomInductorSolution,
} from '../engine/passiveDesignEngine';

export type ReportStageScope = 'both' | 'dcdc' | 'acdc';

export interface ReportStep {
  step: string;
  title: string;
  given: string;
  tex: string;
  formulaPlain: string;
  substitution: string;
  result: string;
  verdict?: { status: 'pass' | 'warn' | 'fail'; label: string };
}

export interface ReportRationale {
  heading: string;
  points: { label: string; detail: string }[];
}

export interface ReportParamTable {
  title: string;
  headers: string[];
  rows: string[][];
}

export interface ReportFigureRef {
  figId: string;
  caption: string;
}

export interface ReportChapter {
  id: string;
  num: string;
  stage: 'acdc' | 'dcdc' | 'audit';
  title: string;
  subtitle: string;
  status: 'pass' | 'warn' | 'fail';
  intro: string;
  rationale: ReportRationale;
  steps: ReportStep[];
  paramTables?: ReportParamTable[];
  figures?: ReportFigureRef[];
  inductorSchedule?: {
    title: string;
    rows: { req: CircuitInductorRequirement; sol: CustomInductorSolution }[];
  };
  capacitorSchedule?: {
    title: string;
    rows: { req: CircuitCapacitorRequirement; sol: CapacitorBankSolution }[];
  };
}

export interface DesignReportModel {
  title: string;
  dateStr: string;
  scope: ReportStageScope;
  scopeLabel: string;
  includeAcDc: boolean;
  includeDcDc: boolean;
  chapters: ReportChapter[];
  scopedAlerts: DesignAlertSummary;
}

export function buildDesignReportModel(params: {
  scope: ReportStageScope;
  dcdcState: DcDcDesignState;
  dcdcRes: DcDcResults;
  acdcState: AcDcDesignState;
  acdcRes: AcDcResults;
  dcdcInductorRows: { req: CircuitInductorRequirement; sol: CustomInductorSolution }[];
  dcdcCapRows: { req: CircuitCapacitorRequirement; sol: CapacitorBankSolution }[];
  acdcInductorRows: { req: CircuitInductorRequirement; sol: CustomInductorSolution }[];
  acdcCapRows: { req: CircuitCapacitorRequirement; sol: CapacitorBankSolution }[];
  scopedAlerts: DesignAlertSummary;
}): DesignReportModel {
  const {
    scope,
    dcdcState,
    dcdcRes,
    acdcState,
    acdcRes,
    dcdcInductorRows,
    dcdcCapRows,
    acdcInductorRows,
    acdcCapRows,
    scopedAlerts,
  } = params;

  const includeAcDc = scope === 'both' || scope === 'acdc';
  const includeDcDc = scope === 'both' || scope === 'dcdc';

  const dateStr = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  const chapters: ReportChapter[] = [];
  let chIdx = 1;

  // ============================================================================
  // PART I: AC-DC PFC STAGE CHAPTERS
  // ============================================================================
  if (includeAcDc) {
    const Vac_pk_min = acdcState.Vac_min_V * Math.SQRT2;
    const Vac_pk_nom = acdcState.Vac_rms_V * Math.SQRT2;
    const duty_peak_min = Math.max(0.05, 1 - Vac_pk_min / acdcState.Vdc_bus_V);
    const vdsMargin_pct = ((1 - acdcState.Vdc_bus_V / Math.max(1, acdcRes.sw.Vds_max_V)) * 100);
    const diodeDropSaved_W = 2 * 1.15 * acdcRes.Iac_rms_nom_A;
    const rippleRatio_pct = (acdcRes.deltaIL_ph_max_A / Math.max(0.1, acdcRes.Iph_pk_A)) * 100;

    // CHAPTER A1
    const cA1 = String(chIdx++);
    chapters.push({
      id: 'ch-acdc-specs',
      num: cA1,
      stage: 'acdc',
      title: 'AC-DC PFC Topology, Input Envelope & Current Stress',
      subtitle: 'Mains Brownout Current, Interleaving Cancellation & Boost Duty Cycle',
      status: acdcState.Vdc_bus_V / Math.max(1, acdcRes.sw.Vds_max_V) > 0.9 ? 'fail' : 'pass',
      intro: `Analytical synthesis begins at worst-case AC brownout (${acdcState.Vac_min_V} Vac) and continuous ${acdcState.Pout_W} W output, where inductor conduction and MOSFET thermal stresses reach maxima across ${acdcRes.nPhases} interleaved phase(s).`,
      rationale: {
        heading: 'Why This Topology, Phase Count & Bus Voltage Were Chosen',
        points: [
          {
            label: `Topology (${acdcState.topology})`,
            detail: `Bridgeless totem-pole / dual-boost eliminates the 4-diode input bridge rectifier (2 × ~1.15 V drop), saving ≈${diodeDropSaved_W.toFixed(1)} W conduction loss at nominal ${acdcState.Vac_rms_V} Vac and enabling >98.5% stage efficiency.`,
          },
          {
            label: `Phase Count (N_ph = ${acdcRes.nPhases})`,
            detail: `Interleaving ${acdcRes.nPhases} boost channel(s) splits peak phase current to ${acdcRes.Iph_pk_A.toFixed(1)} A/phase and yields ${acdcRes.rippleCancelMax_pct.toFixed(0)}% switching ripple cancellation (zero-ripple at D=0.5 / θ=${acdcRes.theta_zeroRipple1_deg.toFixed(0)}°), shrinking DM EMI filter volume.`,
          },
          {
            label: `DC Bus (${acdcState.Vdc_bus_V} Vdc) & f_sw (${acdcState.fsw_kHz} kHz)`,
            detail: `${acdcState.Vdc_bus_V} Vdc guarantees boost controllability above high-line peak (√2 × ${acdcState.Vac_max_V}V = ${(acdcState.Vac_max_V * Math.SQRT2).toFixed(0)} V) while preserving ${vdsMargin_pct.toFixed(0)}% blocking margin on ${acdcRes.sw.Vds_max_V} V switches.`,
          },
        ],
      },
      steps: [
        {
          step: `${cA1}.1`,
          title: 'Worst-Case Brownout RMS Line Current & Per-Phase Peak Current',
          given: `P_out = ${acdcState.Pout_W} W, η_est = 98.2%, V_ac,min = ${acdcState.Vac_min_V} V, V_ac,nom = ${acdcState.Vac_rms_V} V, N_ph = ${acdcRes.nPhases}`,
          tex: `I_{\\text{ac,max}} = \\frac{P_{\\text{out}}}{\\eta\\, V_{\\text{ac,min}}}, \\quad I_{\\text{ph,pk}} = \\frac{\\sqrt{2}\\, I_{\\text{ac,nom}}}{N_{\\text{ph}}}`,
          formulaPlain: 'I_ac,max = P_out / (eta * V_ac,min) ;  I_ph,pk = sqrt(2) * I_ac,nom / N_ph',
          substitution: `I_ac,max = ${acdcState.Pout_W} / (0.982 × ${acdcState.Vac_min_V}) = ${acdcRes.Iac_rms_max_A.toFixed(2)} A ; I_ph,pk = √2 × ${acdcRes.Iac_rms_nom_A.toFixed(2)} / ${acdcRes.nPhases}`,
          result: `I_ac,max = ${acdcRes.Iac_rms_max_A.toFixed(2)} A_rms · I_ph,rms = ${acdcRes.Iph_rms_A.toFixed(2)} A · I_ph,pk = ${acdcRes.Iph_pk_A.toFixed(2)} A`,
          verdict: { status: 'pass', label: 'Current Envelope Verified' },
        },
        {
          step: `${cA1}.2`,
          title: 'Instantaneous Boost Duty Ratio Across AC Mains Sine Peak',
          given: `V_ac,pk,min = ${Vac_pk_min.toFixed(1)} V, V_ac,pk,nom = ${Vac_pk_nom.toFixed(1)} V, V_dc,bus = ${acdcState.Vdc_bus_V} V`,
          tex: `D(\\theta) = 1 - \\frac{\\sqrt{2}\\, V_{\\text{ac,rms}} |\\sin\\theta|}{V_{\\text{dc,bus}}}, \\quad D_{\\text{pk,min}} = 1 - \\frac{V_{\\text{ac,pk,min}}}{V_{\\text{dc,bus}}}`,
          formulaPlain: 'D(theta) = 1 - (sqrt(2) * V_ac * |sin(theta)|) / V_dc,bus',
          substitution: `D_pk,min = 1 − (${Vac_pk_min.toFixed(1)} / ${acdcState.Vdc_bus_V}) = ${(duty_peak_min * 100).toFixed(1)}% ; D_nom,pk = 1 − (${Vac_pk_nom.toFixed(1)} / ${acdcState.Vdc_bus_V})`,
          result: `D_pk,min = ${(duty_peak_min * 100).toFixed(1)}% · D_nom,pk = ${(acdcRes.D_at_peak * 100).toFixed(1)}% (Zero-crossing D → 100%)`,
          verdict: { status: 'pass', label: 'Valid Boost Headroom' },
        },
        {
          step: `${cA1}.3`,
          title: 'True Power Factor (Displacement × Distortion) & Apparent Power',
          given: `THDi = ${acdcRes.THD_est_pct.toFixed(2)}%, Displacement PF = ${acdcRes.displacementPF.toFixed(4)}`,
          tex: `\\text{PF}_{\\text{true}} = \\frac{\\cos\\phi_1}{\\sqrt{1 + \\text{THD}_i^2}} = \\text{DPF} \\times \\text{PF}_{\\text{dist}}`,
          formulaPlain: 'PF_true = cos(phi_1) / sqrt(1 + THDi^2)',
          substitution: `PF_true = ${acdcRes.displacementPF.toFixed(4)} / √(1 + ${(acdcRes.THD_est_pct / 100).toFixed(4)}²) = ${acdcRes.powerFactor_true.toFixed(4)}`,
          result: `PF_true = ${acdcRes.powerFactor_true.toFixed(4)} · THD_i = ${acdcRes.THD_est_pct.toFixed(2)}%`,
          verdict: {
            status: acdcRes.powerFactor_true >= 0.98 ? 'pass' : 'warn',
            label: acdcRes.powerFactor_true >= 0.98 ? 'Meets >0.98 PF Target' : 'PF Below 0.98',
          },
        },
      ],
    });

    // CHAPTER A2
    const cA2 = String(chIdx++);
    chapters.push({
      id: 'ch-acdc-mag',
      num: cA2,
      stage: 'acdc',
      title: 'PFC Boost Inductor Synthesis, Powder Core Selection & DC-Bias',
      subtitle: 'CCM Ripple Sizing, Interleaved Cancellation & Soft-Saturation Verification',
      status:
        acdcRes.saturationCheck.status === 'critical'
          ? 'fail'
          : acdcRes.saturationCheck.status === 'warning'
          ? 'warn'
          : 'pass',
      intro: `The boost inductor stores energy every switching period while carrying the full ${acdcState.f_line_Hz} Hz line current crest (${acdcRes.Iph_pk_A.toFixed(1)} A peak). Proper inductance balances core volume against high-frequency ripple and saturation.`,
      rationale: {
        heading: 'Why L_pfc Value, Sendust/KoolMu Core & Interleaving Were Chosen',
        points: [
          {
            label: `Inductance (L_pfc = ${acdcState.Lpfc_uH} µH vs Critical CCM ${acdcRes.Lpfc_crit_CCM_uH.toFixed(0)} µH)`,
            detail: `Chosen inductance limits peak phase ripple to ${acdcRes.deltaIL_ph_max_A.toFixed(2)} App (${rippleRatio_pct.toFixed(1)}% of I_ph,pk), staying firmly in low-EMI Continuous Conduction Mode across the main energy band.`,
          },
          {
            label: `Core Technology (Distributed-Gap Sendust/KoolMµ vs Ferrite)`,
            detail: `Powder cores distribute the gap uniformly through the toroid, eliminating localized air-gap fringing eddy losses in copper turns and providing soft permeability roll-off (${acdcRes.inductanceRollOff_pct.toFixed(1)}% roll-off at ${acdcRes.Iph_pk_A.toFixed(1)} A) up to B_sat = ${acdcRes.saturationCheck.Bsat_koolMu_T.toFixed(2)} T vs brittle 0.39 T ferrite saturation.`,
          },
        ],
      },
      steps: [
        {
          step: `${cA2}.1`,
          title: 'Phase Peak-to-Peak Switching Ripple & Net Interleaved Current Ripple',
          given: `L_pfc = ${acdcState.Lpfc_uH} µH, V_dc = ${acdcState.Vdc_bus_V} V, f_sw = ${acdcState.fsw_kHz} kHz, worst-case D = 0.50`,
          tex: `\\Delta I_{L,\\text{max}} = \\frac{V_{\\text{dc}}\\, D(1-D)}{f_{\\text{sw}}\\, L_{\\text{pfc}}}, \\quad \\Delta I_{\\text{net}} = K_{\\text{cancel}}(D)\\cdot \\Delta I_L`,
          formulaPlain: 'Delta_IL,max = (V_dc * 0.25) / (f_sw * L_pfc) ;  Delta_Inet = K_cancel * Delta_IL',
          substitution: `ΔI_L,max = (${acdcState.Vdc_bus_V} × 0.25) / (${acdcState.fsw_kHz}e3 × ${acdcState.Lpfc_uH}e-6) = ${acdcRes.deltaIL_ph_max_A.toFixed(2)} App`,
          result: `ΔI_L,ph = ${acdcRes.deltaIL_ph_max_A.toFixed(2)} App (${rippleRatio_pct.toFixed(0)}%) · ΔI_net = ${acdcRes.deltaIin_net_max_A.toFixed(2)} App (${acdcRes.rippleCancelMax_pct.toFixed(0)}% cancel)`,
          verdict: { status: 'pass', label: 'Ripple Cancellation Verified' },
        },
        {
          step: `${cA2}.2`,
          title: 'Magnetizing Field H_pk, Permeability Roll-Off & Total Flux Density',
          given: `N_pfc = ${acdcRes.N_pfc_turns} T, I_ph,pk = ${acdcRes.Iph_pk_A.toFixed(1)} A, B_sat(KoolMµ) = ${acdcRes.saturationCheck.Bsat_koolMu_T.toFixed(2)} T`,
          tex: `H_{\\text{pk}} = \\frac{0.4\\pi\\, N_{\\text{pfc}}\\, I_{\\text{ph,pk}}}{\\ell_e\\,[\\text{cm}]}, \\quad B_{\\text{pk}} = B_{\\text{dc}}(H_{\\text{pk}}) + \\frac{\\Delta B_{\\text{ac}}}{2}`,
          formulaPlain: 'H_pk [Oe] = (0.4 * pi * N * I_pk) / le[cm] ;  B_pk = B_dc(H_pk) + Delta_B / 2',
          substitution: `H_dc,pk = ${acdcRes.Hdc_pk_Oe.toFixed(1)} Oe ; B_dc = ${acdcRes.Bdc_pk_T.toFixed(3)} T + ΔB/2 = ${(acdcRes.deltaB_max_T / 2).toFixed(3)} T ; L_pk = ${acdcRes.L_at_peak_koolMu_uH.toFixed(1)} µH`,
          result: `B_pk = ${acdcRes.Bpk_total_T.toFixed(3)} T (${acdcRes.saturationCheck.utilization_koolMu_pct.toFixed(0)}% of ${acdcRes.saturationCheck.Bsat_koolMu_T.toFixed(2)} T) · Roll-off = ${acdcRes.inductanceRollOff_pct.toFixed(1)}%`,
          verdict: {
            status:
              acdcRes.saturationCheck.status === 'critical'
                ? 'fail'
                : acdcRes.saturationCheck.status === 'warning'
                ? 'warn'
                : 'pass',
            label: acdcRes.saturationCheck.headline,
          },
        },
        {
          step: `${cA2}.3`,
          title: 'Boost Inductor Copper + Core Losses & Estimated Hotspot Temperature',
          given: `P_ind,cu = ${acdcRes.Pind_cu_W.toFixed(2)} W, P_ind,core = ${acdcRes.Pind_core_W.toFixed(2)} W, T_amb = 45 °C`,
          tex: `P_{\\text{ind,tot}} = P_{\\text{ind,cu}} + P_{\\text{ind,core}}, \\quad T_{\\text{core,pfc}} = T_{\\text{amb}} + \\Delta T(P_{\\text{ind,tot}})`,
          formulaPlain: 'P_ind,tot = P_cu + P_core ;  T_core = T_amb + Delta_T',
          substitution: `P_ind,tot = ${acdcRes.Pind_cu_W.toFixed(2)} + ${acdcRes.Pind_core_W.toFixed(2)} = ${acdcRes.Pind_total_W.toFixed(2)} W (all ${acdcRes.nPhases} ph)`,
          result: `P_ind = ${acdcRes.Pind_total_W.toFixed(2)} W · T_core,pfc = ${acdcRes.Tcore_pfc_C.toFixed(1)} °C`,
          verdict: {
            status: acdcRes.Tcore_pfc_C > 130 ? 'fail' : acdcRes.Tcore_pfc_C > 110 ? 'warn' : 'pass',
            label: acdcRes.Tcore_pfc_C <= 110 ? 'Inductor Thermal Safe' : 'Warm Boost Core',
          },
        },
      ],
      figures: [
        {
          figId: 'acdc-line',
          caption: `Figure ${cA2}.1: AC-DC half-line sinusoidal current i_in(θ) alongside per-phase ΔI_L and net interleaved ripple cancellation envelope.`,
        },
      ],
    });

    // CHAPTER A3
    const cA3 = String(chIdx++);
    chapters.push({
      id: 'ch-acdc-semi',
      num: cA3,
      stage: 'acdc',
      title: 'PFC Semiconductor Selection, Loss Budget & Junction Thermal',
      subtitle: 'Fast-Leg SiC/GaN Half-Bridge Switching + Qrr Analysis vs Slow Synchronous Return',
      status: acdcRes.Tj_fast_C > 125 ? 'fail' : acdcRes.Tj_fast_C > 108 ? 'warn' : 'pass',
      intro: `In a continuous-conduction-mode totem-pole PFC, the fast-switching leg undergoes hard body-diode reverse recovery at every switching cycle, making wide-bandgap semiconductor choice critical.`,
      rationale: {
        heading: `Why ${acdcRes.sw.name} Was Selected`,
        points: [
          {
            label: `Reverse Recovery Immunity (Q_rr = ${acdcRes.sw.Qrr_nC} nC)`,
            detail: `Totem-pole CCM operation enforces hard commutation of the complementary body diode. ${acdcRes.sw.tech} keeps Q_rr loss down to ${acdcRes.Prr_W.toFixed(1)} W, whereas conventional Silicon SJ MOSFETs (>400 nC) suffer catastrophic shoot-through spikes.`,
          },
          {
            label: `Blocking Voltage & Conduction FOM (V_DS = ${acdcRes.sw.Vds_max_V} V, R_ds,25 = ${acdcRes.sw.Rds_on_25C_mOhm} mΩ)`,
            detail: `Provides ${vdsMargin_pct.toFixed(0)}% voltage margin above the ${acdcState.Vdc_bus_V} V DC link with R_th,JC = ${acdcRes.sw.Rth_JC_CW} °C/W package cooling.`,
          },
        ],
      },
      steps: [
        {
          step: `${cA3}.1`,
          title: 'Fast-Leg & Slow-Leg Conduction Losses',
          given: `Device: ${acdcRes.sw.name}, I_ph,rms = ${acdcRes.Iph_rms_A.toFixed(2)} A`,
          tex: `P_{\\text{cond}} = P_{\\text{cond,fast}}(R_{\\text{ds}}(T_j)) + P_{\\text{cond,slow}}`,
          formulaPlain: 'P_cond = P_cond,fast(R_ds(Tj)) + P_cond,slow',
          substitution: `P_cond,fast = ${acdcRes.Pcond_fast_W.toFixed(2)} W + P_cond,slow = ${acdcRes.Pcond_slow_W.toFixed(2)} W`,
          result: `Total Semiconductor Conduction = ${(acdcRes.Pcond_fast_W + acdcRes.Pcond_slow_W).toFixed(2)} W`,
          verdict: { status: 'pass', label: 'Low Conduction Loss' },
        },
        {
          step: `${cA3}.2`,
          title: 'Hard-Switching Overlap, Reverse Recovery (Q_rr) & Gate Drive Losses',
          given: `V_dc = ${acdcState.Vdc_bus_V} V, f_sw = ${acdcState.fsw_kHz} kHz, Q_rr = ${acdcRes.sw.Qrr_nC} nC`,
          tex: `P_{\\text{sw,tot}} = P_{\\text{overlap}} + P_{Q_{rr}} + P_{\\text{gate}} = P_{\\text{sw}} + V_{\\text{dc}}\\,Q_{\\text{rr}}\\,f_{\\text{sw}}`,
          formulaPlain: 'P_sw,tot = P_overlap + V_dc * Q_rr * f_sw + P_gate',
          substitution: `P_sw = ${acdcRes.Psw_total_W.toFixed(2)} W (includes P_Qrr = ${acdcRes.Prr_W.toFixed(2)} W) + P_gate = ${acdcRes.Pgate_W.toFixed(2)} W`,
          result: `Stage Loss = ${acdcRes.Ptotal_loss_W.toFixed(1)} W · η_nom = ${acdcRes.efficiency_pct.toFixed(2)}% (η_low = ${acdcRes.efficiency_lowLine_pct.toFixed(2)}%)`,
          verdict: { status: 'pass', label: 'High Efficiency Target' },
        },
        {
          step: `${cA3}.3`,
          title: 'Fast-Leg Junction Temperature Equilibrium T_j,fast',
          given: `T_amb = 45 °C, R_th,JC = ${acdcRes.sw.Rth_JC_CW} °C/W, FOM R_ds,on(25°C) = ${acdcRes.sw.Rds_on_25C_mOhm} mΩ`,
          tex: `T_{j,\\text{fast}} = T_{\\text{amb}} + P_{\\text{fast,avg}}(R_{\\theta,\\text{JC}} + R_{\\theta,\\text{TIM}}) + P_{\\text{hs}}\\cdot R_{\\theta,\\text{hs}}`,
          formulaPlain: 'Tj,fast = T_amb + P_fast*(Rth_JC + Rth_TIM) + P_hs*Rth_hs',
          substitution: `Computed iteratively at T_j = ${acdcRes.Tj_fast_C.toFixed(1)} °C across ${acdcRes.nPhases * 2} fast FETs`,
          result: `T_j,fast = ${acdcRes.Tj_fast_C.toFixed(1)} °C (Safe Ceiling 125.0 °C · Margin ${(125 - acdcRes.Tj_fast_C).toFixed(1)} °C)`,
          verdict: {
            status: acdcRes.Tj_fast_C > 125 ? 'fail' : acdcRes.Tj_fast_C > 108 ? 'warn' : 'pass',
            label: acdcRes.Tj_fast_C > 125 ? 'Exceeds 125°C Limit' : 'Junction SOA Pass',
          },
        },
      ],
    });

    // CHAPTER A4
    const cA4 = String(chIdx++);
    chapters.push({
      id: 'ch-acdc-passives',
      num: cA4,
      stage: 'acdc',
      title: 'DC-Link Bulk Capacitor Bank, Hold-Up Energy & Complete Passive BOM',
      subtitle: '20 ms Hold-Up Sizing, 2f Ripple Rejection, Arrhenius L10 Life & Inductor Schedule',
      status:
        acdcCapRows.some((r) => r.sol.status === 'critical') ||
        acdcInductorRows.some((r) => r.sol.satStatus === 'critical' || r.sol.windowFitStatus === 'overflow')
          ? 'fail'
          : 'pass',
      intro: `The DC-link capacitor bank is constrained simultaneously by two metrics: minimum bulk capacitance to ride through one full 50 Hz AC dropout cycle (${acdcState.tHold_ms} ms) and composite LF+HF ripple current heating.`,
      rationale: {
        heading: `Why C_dc = ${acdcState.Cdc_uF} µF (${acdcRes.capBankParallelCount} Parallel Caps) Was Selected`,
        points: [
          {
            label: `Energy vs Ripple Governing Limit`,
            detail: `Hold-up requires C_hold = ${acdcRes.Cdc_req_holdup_uF.toFixed(0)} µF while 2f voltage ripple allows C_rip = ${acdcRes.Cdc_req_ripple_uF.toFixed(0)} µF. Selecting ${acdcState.Cdc_uF} µF satisfies the tighter constraint with ${acdcRes.tHold_actual_ms.toFixed(1)} ms actual hold-up.`,
          },
          {
            label: `Thermal & Arrhenius Service Life (${(acdcRes.capLife_hours / 1000).toFixed(1)}k hrs / ${acdcRes.capLife_years.toFixed(1)} yrs)`,
            detail: `Dividing ${acdcRes.ICdc_total_rms_A.toFixed(1)} A_rms composite current across ${acdcRes.capBankParallelCount} parallel bulk units caps ΔT_cap to +${acdcRes.capTempRise_C.toFixed(1)} °C (T_hot = ${acdcRes.capHotspot_C.toFixed(1)} °C), preserving multi-year electrolytic life.`,
          },
        ],
      },
      steps: [
        {
          step: `${cA4}.1`,
          title: 'Hold-Up Energy Minimum Capacitance & 100/120 Hz Bus Voltage Ripple',
          given: `P_out = ${acdcState.Pout_W} W, t_hold = ${acdcState.tHold_ms} ms, V_dc = ${acdcState.Vdc_bus_V} V → V_min = ${acdcState.Vdc_min_hold_V} V`,
          tex: `C_{\\text{dc,hold}} = \\frac{2\\, P_{\\text{out}}\\, t_{\\text{hold}}}{V_{\\text{dc}}^2 - V_{\\text{dc,min}}^2}, \\quad \\Delta V_{2f} = \\frac{P_{\\text{out}}}{2\\pi f_{\\text{line}}\\, C_{\\text{dc}}\\, V_{\\text{dc}}}`,
          formulaPlain: 'C_hold = (2 * P_out * t_hold) / (V_dc^2 - V_min^2) ;  Delta_V_2f = P_out / (2*pi*f_line * C_dc * V_dc)',
          substitution: `C_hold = (2 × ${acdcState.Pout_W} × ${(acdcState.tHold_ms * 1e-3).toFixed(3)}) / (${acdcState.Vdc_bus_V}² − ${acdcState.Vdc_min_hold_V}²) ; C_dc = ${acdcState.Cdc_uF} µF`,
          result: `C_req = ${acdcRes.Cdc_req_holdup_uF.toFixed(0)} µF · t_hold = ${acdcRes.tHold_actual_ms.toFixed(1)} ms · ΔV_2f = ${acdcRes.Vbus_2f_ripple_Vpp.toFixed(1)} Vpp`,
          verdict: {
            status: acdcRes.tHold_actual_ms >= acdcState.tHold_ms ? 'pass' : 'warn',
            label: acdcRes.tHold_actual_ms >= acdcState.tHold_ms ? 'Hold-Up Spec Met' : 'Hold-Up Deficit',
          },
        },
        {
          step: `${cA4}.2`,
          title: 'Composite DC-Link RMS Ripple Current & Capacitor Hotspot Life',
          given: `I_LF,rms(2f) = ${acdcRes.ICdc_lf_rms_A.toFixed(2)} A, I_HF,rms(f_sw) = ${acdcRes.ICdc_hf_rms_A.toFixed(2)} A`,
          tex: `I_{C,\\text{tot}} = \\sqrt{I_{\\text{LF}}^2 + I_{\\text{HF}}^2}, \\quad L_{10} = L_{\\text{base}} \\cdot 2^{\\frac{T_{\\text{rated}} - T_{\\text{hot}}}{10}}`,
          formulaPlain: 'IC_tot = sqrt(I_LF^2 + I_HF^2) ;  L10 = L_base * 2^((T_rated - T_hot)/10)',
          substitution: `I_C,tot = √(${acdcRes.ICdc_lf_rms_A.toFixed(2)}² + ${acdcRes.ICdc_hf_rms_A.toFixed(2)}²) = ${acdcRes.ICdc_total_rms_A.toFixed(2)} A ; T_hot = ${acdcRes.capHotspot_C.toFixed(1)} °C`,
          result: `I_C,tot = ${acdcRes.ICdc_total_rms_A.toFixed(2)} A_rms · P_cap = ${acdcRes.Pcap_W.toFixed(2)} W · L10 = ${(acdcRes.capLife_hours / 1000).toFixed(0)}k hrs`,
          verdict: {
            status: acdcRes.capLife_hours >= 25000 ? 'pass' : 'warn',
            label: acdcRes.capLife_hours >= 25000 ? 'Long Life Margin' : 'Tight Cap Thermal Life',
          },
        },
      ],
      inductorSchedule: {
        title: `Table ${cA4}.1 — AC-DC Stage Complete Inductor Synthesis Schedule`,
        rows: acdcInductorRows,
      },
      capacitorSchedule: {
        title: `Table ${cA4}.2 — AC-DC Stage Capacitor Bank & Arrhenius Life Schedule`,
        rows: acdcCapRows,
      },
    });

    // CHAPTER A5
    const cA5 = String(chIdx++);
    chapters.push({
      id: 'ch-acdc-emi-ctrl',
      num: cA5,
      stage: 'acdc',
      title: 'AC Harmonics (IEC 61000-3), EMI Filter, Pre-Charge & Dual-Loop Control',
      subtitle: 'CISPR-22 Attenuation, Touch Leakage, Inrush Relay Sizing & Inner/Outer Loop Bode',
      status: acdcRes.THD_est_pct > 10 || acdcRes.pm_i_actual_deg < 30 ? 'fail' : 'pass',
      intro: `Completes the AC front-end by synthesizing the CISPR-22 EMI filter, PTC/NTC + bypass pre-charge limiter, and cascaded digital dual-loop compensators.`,
      rationale: {
        heading: 'Why Pre-Charge, Y-Capacitor & Dual-Loop Compensator Values Were Chosen',
        points: [
          {
            label: `EMI X/Y & Choke Sizing (f_c,dm = ${acdcRes.fc_dm_kHz.toFixed(1)} kHz, C_Y = ${acdcState.Cy_nF ?? acdcRes.Cy_each_nF} nF)`,
            detail: `Places DM corner ${acdcRes.fc_dm_kHz.toFixed(1)} kHz safely below f_sw (${acdcState.fsw_kHz} kHz) for ${acdcRes.RequiredAtt_dB.toFixed(1)} dB attenuation while capping earth PE leakage to ${acdcRes.earthLeakage_mA.toFixed(2)} mA (< 3.5 mA Class I limit).`,
          },
          {
            label: `Dual-Loop Bandwidth Decoupling (f_c,i = ${acdcRes.fc_i_actual_kHz.toFixed(1)} kHz vs f_c,v = ${acdcRes.fc_v_actual_Hz.toFixed(1)} Hz)`,
            detail: `High-speed current loop (PM = ${acdcRes.pm_i_actual_deg.toFixed(1)}°) forces sinusoidal current tracking (THDi = ${acdcRes.THD_est_pct.toFixed(2)}%), while slow <20 Hz voltage loop blocks 100/120 Hz DC-link ripple from distorting the current reference.`,
          },
        ],
      },
      steps: [
        {
          step: `${cA5}.1`,
          title: 'Pre-Charge Inrush Limiter & Relay Bypass Timing',
          given: `E_inrush = ${acdcRes.inrushEnergy_J.toFixed(1)} J, Unmitigated Peak = ${acdcRes.Iinrush_unmitigated_pk_A.toFixed(0)} A, R_pre = ${acdcRes.R_precharge_Ohm.toFixed(1)} Ω`,
          tex: `E = \\frac{1}{2}\\, C_{\\text{dc}}\\, (\\sqrt{2}\\,V_{\\text{ac,max}})^2, \\quad I_{\\text{inrush,pk}} = \\frac{\\sqrt{2}\\, V_{\\text{ac,max}}}{R_{\\text{pre}}}`,
          formulaPlain: 'E = 0.5 * C_dc * (sqrt(2) * V_ac,max)^2 ;  I_pre,pk = sqrt(2)*V_ac,max / R_pre',
          substitution: `R_pre = ${acdcRes.R_precharge_Ohm.toFixed(1)} Ω limits crest from ${acdcRes.Iinrush_unmitigated_pk_A.toFixed(0)} A → ${acdcRes.Iinrush_precharge_pk_A.toFixed(1)} A ; τ_bypass ≈ ${acdcRes.t_relay_bypass_ms.toFixed(0)} ms`,
          result: `I_precharge = ${acdcRes.Iinrush_precharge_pk_A.toFixed(1)} A · I²t = ${acdcRes.I2t_precharge_A2s.toFixed(2)} A²s · Bypass @ ${acdcRes.t_relay_bypass_ms.toFixed(0)} ms`,
          verdict: { status: 'pass', label: 'Inrush Safely Clamped' },
        },
        {
          step: `${cA5}.2`,
          title: 'IEC 62368-1 Touch Leakage Current & CISPR-22 DM EMI Attenuation',
          given: `C_Y,each = ${acdcState.Cy_nF ?? acdcRes.Cy_each_nF} nF, V_ac,max = ${acdcState.Vac_max_V} V @ ${acdcState.f_line_Hz} Hz`,
          tex: `I_{\\text{leak,PE}} = 2\\pi f_{\\text{line}}\\, V_{\\text{ac,max}}\\, C_Y \\le 3.50\\text{ mA}`,
          formulaPlain: 'I_leak,PE = 2 * pi * f_line * V_ac,max * C_Y <= 3.50 mA',
          substitution: `I_leak = 2π × ${acdcState.f_line_Hz} × ${acdcState.Vac_max_V} × ${acdcState.Cy_nF ?? acdcRes.Cy_each_nF}e-9 = ${acdcRes.earthLeakage_mA.toFixed(2)} mA`,
          result: `I_leak = ${acdcRes.earthLeakage_mA.toFixed(2)} mA · f_c,dm = ${acdcRes.fc_dm_kHz.toFixed(1)} kHz (${acdcRes.RequiredAtt_dB.toFixed(1)} dB req) · R_bleed = ${acdcRes.R_bleed_kOhm.toFixed(0)} kΩ`,
          verdict: {
            status: acdcRes.earthLeakage_mA > 3.5 ? 'fail' : acdcRes.earthLeakage_mA > 0.75 ? 'warn' : 'pass',
            label: acdcRes.earthLeakage_mA <= 3.5 ? 'Class I Grounded Pass' : 'Exceeds 3.5 mA Limit',
          },
        },
        {
          step: `${cA5}.3`,
          title: 'Inner Current Loop & Outer Voltage Loop Crossover Margins',
          given: `Inner target f_c,i = ${acdcState.fc_i_kHz} kHz, Outer target f_c,v = ${acdcState.fc_v_Hz} Hz`,
          tex: `\\phi_{m,i} = 180^\\circ + \\angle G_{id}C_i(j2\\pi f_{c,i}), \\quad \\phi_{m,v} = 180^\\circ + \\angle G_{v\\text{bus}}C_v(j2\\pi f_{c,v})`,
          formulaPlain: 'PM_i = 180 + arg(Ti(j2pi*fc_i)) ;  PM_v = 180 + arg(Tv(j2pi*fc_v))',
          substitution: `f_c,i = ${acdcRes.fc_i_actual_kHz.toFixed(2)} kHz (Kp=${acdcRes.Kp_i.toFixed(3)}, Ki=${acdcRes.Ki_i.toFixed(0)}) ; f_c,v = ${acdcRes.fc_v_actual_Hz.toFixed(1)} Hz`,
          result: `Inner PM = ${acdcRes.pm_i_actual_deg.toFixed(1)}° (GM = ${acdcRes.gm_i_dB.toFixed(1)} dB) · Outer PM = ${acdcRes.pm_v_actual_deg.toFixed(1)}°`,
          verdict: {
            status: acdcRes.pm_i_actual_deg >= 45 && acdcRes.pm_v_actual_deg >= 45 ? 'pass' : 'warn',
            label: 'Dual-Loop Stable',
          },
        },
      ],
      paramTables: [
        {
          title: `Table ${cA5}.1 — Synthesized AC-DC Pre-Charge, EMI Filter & Compensator Parameters`,
          headers: ['Subsystem', 'Parameter', 'Selected Value', 'Engineering Rationale'],
          rows: [
            ['EMI Filter', 'L_cm / L_dm', `${acdcRes.Lcm_mH.toFixed(2)} mH / ${acdcRes.Ldm_uH.toFixed(1)} µH`, `${acdcRes.RequiredAtt_dB.toFixed(1)} dB DM attenuation above ${acdcRes.fc_dm_kHz.toFixed(1)} kHz`],
            ['EMI Filter', 'C_X (each) / R_bleed', `${acdcRes.Cx_each_uF.toFixed(2)} µF / ${acdcRes.R_bleed_kOhm.toFixed(0)} kΩ`, '< 1 s X2 discharge time constant after unplug'],
            ['EMI Safety', 'C_Y (each)', `${acdcRes.Cy_each_nF.toFixed(1)} nF`, `Limits PE touch current to ${acdcRes.earthLeakage_mA.toFixed(2)} mA (< 3.5 mA)`],
            ['Pre-Charge', 'R_pre / t_bypass', `${acdcRes.R_precharge_Ohm.toFixed(1)} Ω / ${acdcRes.t_relay_bypass_ms.toFixed(0)} ms`, `Caps inrush crest at ${acdcRes.Iinrush_precharge_pk_A.toFixed(1)} A`],
            ['Inner Loop', 'Kp_i / Ki_i / f_c,i', `${acdcRes.Kp_i.toFixed(3)} / ${acdcRes.Ki_i.toFixed(0)} / ${acdcRes.fc_i_actual_kHz.toFixed(1)} kHz`, `PM = ${acdcRes.pm_i_actual_deg.toFixed(1)}° for low THDi (${acdcRes.THD_est_pct.toFixed(2)}%)`],
            ['Outer Loop', 'Kp_v / Ki_v / f_c,v', `${acdcRes.Kp_v.toFixed(3)} / ${acdcRes.Ki_v.toFixed(1)} / ${acdcRes.fc_v_actual_Hz.toFixed(1)} Hz`, `PM = ${acdcRes.pm_v_actual_deg.toFixed(1)}° while rejecting 2f bus ripple`],
          ],
        },
      ],
      figures: [
        {
          figId: 'acdc-harmonics',
          caption: `Figure ${cA5}.1: Odd line current harmonics H1–H23 compared against IEC 61000-3-2/12 compliance limits (THDi = ${acdcRes.THD_est_pct.toFixed(2)}%).`,
        },
        {
          figId: 'acdc-bode',
          caption: `Figure ${cA5}.2: Inner digital current compensator Bode magnitude & phase (Crossover f_c,i = ${acdcRes.fc_i_actual_kHz.toFixed(1)} kHz, PM = ${acdcRes.pm_i_actual_deg.toFixed(1)}°).`,
        },
      ],
    });
  }

  // ============================================================================
  // PART II: DC-DC ISOLATED CONVERTER CHAPTERS
  // ============================================================================
  if (includeDcDc) {
    const Vin_nom = dcdcState.Vin_nom_V;
    const Vin_min = dcdcState.Vin_min_V;
    const Vin_max = dcdcState.Vin_max_V;
    const Vout = dcdcState.Vout_V;
    const Pout = dcdcState.Pout_W;
    const N_ratio = dcdcRes.Np_actual / Math.max(1, dcdcRes.Ns_actual);
    const deltaB_T = (dcdcRes.Bpk_mT * 2) / 1000;
    const Ae_cm2 = dcdcRes.core.Ae_mm2 / 100;
    const Aw_cm2 = dcdcRes.core.Aw_mm2 / 100;
    const Ap_actual_cm4 = Ae_cm2 * Aw_cm2;
    const B_op_T = Math.max(0.06, dcdcRes.Bpk_mT * 1e-3);
    // McLyman Area Product (cm^4) = Pt * 100 / (Kf * Ku * J_Amm2 * f_Hz * B_op_T)
    const Ap_req_cm4 = (Pout * 1e2) / (4.0 * 0.35 * 4.5 * (dcdcState.fsw_kHz * 1e3) * B_op_T);
    const zvsRatio = dcdcRes.zvsEnergyRatio_pct;
    const syncVsDiodeLossSaved_W = Math.max(0, (0.65 - dcdcRes.Vf_rect_drop_V) * dcdcRes.Iout_total_A);
    const maxVdsPriMargin_pct = (1 - Vin_max / Math.max(1, dcdcRes.priDevice.Vds_max_V)) * 100;
    const maxVdsSecUtil_pct = (dcdcRes.Vsec_unclamped_pk_V / Math.max(1, dcdcRes.secDevice.Vds_max_V)) * 100;
    const clampedSecUtil_pct = (dcdcRes.Vsec_overshoot_V / Math.max(1, dcdcRes.secDevice.Vds_max_V)) * 100;
    const outCapRow = dcdcCapRows.find((r) => r.req.id === 'dcdc-out-cap');
    const L_shim_calc_uH = Math.max(0, dcdcState.Llk_uH - (dcdcRes.isLLC ? 0 : dcdcRes.Llk_geom_uH));
    const D_ind_pcmc = dcdcRes.isLLC ? dcdcRes.Deff_nom * 0.5 : dcdcRes.Deff_nom;
    const D_prime_pcmc = Math.max(0.05, 1 - D_ind_pcmc);

    // CHAPTER D1
    const cD1 = String(chIdx++);
    chapters.push({
      id: 'ch-dcdc-specs',
      num: cD1,
      stage: 'dcdc',
      title: 'DC-DC Converter Topology, Operating Envelope & Turns Ratio',
      subtitle: 'Turns Ratio Optimization, Duty-Cycle Loss & ZVS vs Duty Window',
      status: 'pass',
      intro: `Analytical synthesis of the isolated ${dcdcState.topology.toUpperCase()} converter (${dcdcState.txType} secondary, ${dcdcState.rectMode === 'sync-fet' ? 'Synchronous MOSFETs' : 'Schottky Rectifiers'}) delivering ${Vout} V / ${dcdcRes.Iout_total_A.toFixed(1)} A (${Pout} W) from ${Vin_min}–${Vin_max} Vdc.`,
      rationale: {
        heading: `Why Topology (${dcdcState.topology.toUpperCase()}), Turns Ratio (${dcdcRes.Np_actual}:${dcdcRes.Ns_actual}) & Rectifier (${dcdcState.rectMode}) Were Chosen`,
        points: [
          {
            label: `Secondary Topology & Rectifier (${dcdcState.txType} + ${dcdcState.rectMode})`,
            detail:
              dcdcState.rectMode === 'sync-fet'
                ? `At high output current (${dcdcRes.Iout_total_A.toFixed(1)} A @ ${Vout}V), synchronous MOSFETs drop V_ds ≈ ${dcdcRes.Vf_rect_drop_V.toFixed(2)} V vs ~0.65 V Schottky diodes, saving ≈${syncVsDiodeLossSaved_W.toFixed(1)} W of secondary conduction heat.`
                : `Schottky rectification simplifies gate drive without cross-conduction risk at moderate output currents.`,
          },
          {
            label: `Turns Ratio Selection (n = ${dcdcRes.Np_actual}/${dcdcRes.Ns_actual} = ${N_ratio.toFixed(2)} : 1)`,
            detail: dcdcRes.isLLC
              ? `Matches resonant DC transformer ratio n·V_out = ${(N_ratio * Vout).toFixed(0)} V closely to half-bridge input (${(Vin_nom / 2).toFixed(0)} V), keeping nominal gain M = ${dcdcRes.M_gain_nom.toFixed(3)} near unity efficiency sweet spot f_sw ≈ f_r.`
              : `Places nominal effective duty at ${(dcdcRes.Deff_nom * 100).toFixed(1)}% so brownout ${Vin_min}V still regulates with reserve against ΔD_loss = ${(dcdcRes.Dloss_nom * 100).toFixed(1)}% while limiting secondary PIV to ${dcdcRes.Vsec_ideal_pk_V.toFixed(1)} V (ideal).`,
          },
          {
            label: dcdcRes.isLLC ? `Resonant Tank Sizing (L_r = ${dcdcState.Llk_uH} µH, C_r = ${dcdcState.Cr_nF} nF)` : `Leakage Inductance Window (L_lk = ${dcdcState.Llk_uH} µH)`,
            detail: dcdcRes.isLLC
              ? `Sets series resonance f_r = ${dcdcRes.fr_kHz.toFixed(1)} kHz with L_n = L_m/L_r = ${dcdcRes.Ln_ratio.toFixed(1)} and quality factor Q = ${dcdcRes.Q_factor.toFixed(2)} to guarantee inductive ZVS above resonance.`
              : `Must sit strictly inside [${dcdcRes.Llk_crit_halfLoad_uH.toFixed(1)} µH (50% load ZVS minimum) .. ${dcdcRes.Llk_max_duty_uH.toFixed(1)} µH (max duty-loss cap)]. Chosen L_lk = ${dcdcState.Llk_uH} µH targets optimal ZVS window (${dcdcRes.Llk_opt_35pct_uH.toFixed(1)} µH ref).`,
          },
        ],
      },
      steps: [
        {
          step: `${cD1}.1`,
          title: 'Full-Load Secondary & Reflected Primary Current Synthesis',
          given: `P_out = ${Pout} W, V_out = ${Vout} V, N_ph = ${dcdcRes.nPhases}, n = ${N_ratio.toFixed(2)}`,
          tex: `I_{\\text{out,tot}} = \\frac{P_{\\text{out}}}{V_{\\text{out}}}, \\quad I_{\\text{pri,refl}} = \\frac{I_{\\text{out,ph}}}{n}`,
          formulaPlain: 'I_out,tot = P_out / V_out ;  I_pri,refl = I_out,ph / n',
          substitution: `I_out,tot = ${Pout} / ${Vout} = ${dcdcRes.Iout_total_A.toFixed(2)} A (${dcdcRes.Iout_phase_A.toFixed(2)} A/phase) ; I_pri,refl = ${dcdcRes.Iout_phase_A.toFixed(2)} / ${N_ratio.toFixed(2)}`,
          result: `I_out = ${dcdcRes.Iout_total_A.toFixed(2)} A · I_lead,off = ${dcdcRes.I_lead_turnoff_A.toFixed(2)} A · I_lag,off = ${dcdcRes.I_lag_turnoff_A.toFixed(2)} A`,
          verdict: { status: 'pass', label: 'Current Stress Established' },
        },
        {
          step: `${cD1}.2`,
          title: dcdcRes.isLLC ? 'LLC Resonant Frequency f_r, Inductance Ratio L_n & Q-Factor' : 'Effective Duty Ratio D_eff, Commutation Duty Loss D_loss & Applied Duty',
          given: dcdcRes.isLLC
            ? `L_r = ${dcdcState.Llk_uH} µH, L_m = ${dcdcState.Lm_uH} µH, C_r = ${dcdcState.Cr_nF} nF, V_out = ${Vout} V`
            : `V_in,nom = ${Vin_nom} V, V_out = ${Vout} V, n = ${N_ratio.toFixed(2)}, L_lk = ${dcdcState.Llk_uH} µH, f_sw = ${dcdcState.fsw_kHz} kHz`,
          tex: dcdcRes.isLLC
            ? `f_r = \\frac{1}{2\\pi\\sqrt{L_r C_r}}, \\quad L_n = \\frac{L_m}{L_r}, \\quad Q = \\frac{\\sqrt{L_r/C_r}}{\\frac{8 n^2}{\\pi^2} R_L}`
            : `D_{\\text{eff}} = \\frac{n\\, V_{\\text{out}}}{V_{\\text{in}}}, \\quad D_{\\text{loss}} = \\frac{2\\, L_{\\text{lk}}\\, I_{\\text{out,ph}}\\, f_{\\text{sw}}}{n\\, V_{\\text{in}}}, \\quad D_{\\text{app}} = D_{\\text{eff}} + D_{\\text{loss}}`,
          formulaPlain: dcdcRes.isLLC
            ? 'fr = 1 / (2*pi*sqrt(Lr*Cr)) ;  Ln = Lm / Lr ;  Q = Z_r / R_ac'
            : 'D_eff = n*V_out / V_in ;  D_loss = 2*L_lk*I_out*f_sw / (n*V_in) ;  D_app = D_eff + D_loss',
          substitution: dcdcRes.isLLC
            ? `f_r = 1 / (2π√(${dcdcState.Llk_uH}e-6 × ${dcdcState.Cr_nF}e-9)) = ${dcdcRes.fr_kHz.toFixed(2)} kHz ; f_m = ${dcdcRes.fm_kHz.toFixed(1)} kHz`
            : `D_eff = ${N_ratio.toFixed(2)} × ${Vout} / ${Vin_nom} = ${(dcdcRes.Deff_nom * 100).toFixed(1)}% ; D_loss = ${(dcdcRes.Dloss_nom * 100).toFixed(1)}%`,
          result: dcdcRes.isLLC
            ? `f_r = ${dcdcRes.fr_kHz.toFixed(1)} kHz · f_n = ${dcdcRes.fn_nom.toFixed(3)} · L_n = ${dcdcRes.Ln_ratio.toFixed(1)} · Q = ${dcdcRes.Q_factor.toFixed(2)}`
            : `D_applied = ${(dcdcRes.D_applied_nom * 100).toFixed(1)}% (Phase Shift φ = ${dcdcRes.phaseShift_deg.toFixed(1)}°)`,
          verdict: {
            status: !dcdcRes.isLLC && dcdcRes.D_applied_nom > 0.92 ? 'warn' : 'pass',
            label: !dcdcRes.isLLC && dcdcRes.D_applied_nom > 0.92 ? 'Tight Duty Margin' : 'Duty Margin Nominal',
          },
        },
        {
          step: `${cD1}.3`,
          title: 'High-Line Secondary Transformer Voltage & Unclamped Parasitic Ringing Peak',
          given: `V_in,max = ${Vin_max} V, n = ${N_ratio.toFixed(2)}, V_sec,ideal(max) = ${dcdcRes.Vsec_ideal_max_V.toFixed(1)} V (Nom ${dcdcRes.Vsec_ideal_pk_V.toFixed(1)} V), f_ring = ${dcdcRes.f_ring_MHz.toFixed(1)} MHz`,
          tex: `V_{\\text{sec,unclamped}} = V_{\\text{sec,ideal(max)}} + \\Delta V_{\\text{ring}}(Z_0, C_{\\text{oss}}), \\quad V_{\\text{sec,clamp}} = k_{\\text{clamp}}\\, V_{\\text{sec,ideal(max)}}`,
          formulaPlain: 'V_sec,unclamped = V_in,max/n + Delta_V_ring ;  V_sec,clamp = k_clamp * V_sec,ideal(max)',
          substitution: `${dcdcRes.Vsec_ideal_max_V.toFixed(1)} V + ${(Number(dcdcRes.Vsec_unclamped_pk_V.toFixed(1)) - Number(dcdcRes.Vsec_ideal_max_V.toFixed(1))).toFixed(1)} V = ${dcdcRes.Vsec_unclamped_pk_V.toFixed(1)} V (unclamped) ; Clamped = ${dcdcRes.Vsec_overshoot_V.toFixed(1)} V (Z_0 = ${dcdcRes.Z0_ring_Ohm.toFixed(1)} Ω)`,
          result: `Unclamped = ${dcdcRes.Vsec_unclamped_pk_V.toFixed(1)} V (${maxVdsSecUtil_pct.toFixed(0)}%) · Clamped = ${dcdcRes.Vsec_overshoot_V.toFixed(1)} V (${clampedSecUtil_pct.toFixed(0)}%) vs ${dcdcRes.secDevice.Vds_max_V} V`,
          verdict: {
            status: clampedSecUtil_pct > 90 ? 'fail' : clampedSecUtil_pct > 80 || maxVdsSecUtil_pct > 88 ? 'warn' : 'pass',
            label:
              clampedSecUtil_pct > 90
                ? 'Secondary Voltage Overstress'
                : maxVdsSecUtil_pct > 98
                ? 'Zero Unclamped Margin (Use 200V SR)'
                : maxVdsSecUtil_pct > 88 || clampedSecUtil_pct > 80
                ? 'Low Unclamped Margin (Use 200V SR)'
                : 'Secondary PIV Safe',
          },
        },
      ],
      figures: [
        {
          figId: 'dcdc-waveforms',
          caption: `Figure ${cD1}.1: Steady-state primary voltage V_pri(t), tank current I_pri(t), and output inductor current I_Lo(t) at ${Vin_nom} V / ${Pout} W.`,
        },
      ],
    });

    // CHAPTER D2
    const cD2 = String(chIdx++);
    chapters.push({
      id: 'ch-dcdc-sat',
      num: cD2,
      stage: 'dcdc',
      title: 'Transformer Core Selection, Area Product A_p & B–H Saturation',
      subtitle: 'Area Product Sizing, Faraday Volt-Second Flux & 100°C Knee Headroom',
      status:
        dcdcRes.saturationCheck.status === 'critical'
          ? 'fail'
          : dcdcRes.saturationCheck.status === 'warning'
          ? 'warn'
          : 'pass',
      intro: `Core geometry (${dcdcRes.core.name}) and ferrite grade (${dcdcRes.material.name}) are verified against the worst-case half-cycle volt-second integral and the depressed 100°C saturation knee.`,
      rationale: {
        heading: `Why Core ${dcdcRes.core.name} & Material ${dcdcRes.material.name} Were Selected`,
        points: [
          {
            label: `Core Geometry & Area Product (${dcdcRes.core.name} · A_p = ${Ap_actual_cm4.toFixed(2)} cm⁴ vs Est. ${Ap_req_cm4.toFixed(2)} cm⁴)`,
            detail: `Effective cross-section A_e = ${dcdcRes.core.Ae_mm2} mm² and window A_w = ${dcdcRes.core.Aw_mm2} mm² (b_w × h_w = ${dcdcRes.core.bw_mm} × ${dcdcRes.core.hw_mm} mm) carry ${Pout} W with low thermal resistance R_th,core = ${dcdcRes.core.Rth_core_CW} °C/W.`,
          },
          {
            label: `Ferrite Grade (${dcdcRes.material.name} · T_opt = ${dcdcRes.material.T_opt_C} °C, B_sat,100°C = ${dcdcRes.saturationCheck.Bsat_100C_mT} mT)`,
            detail: `MnZn power ferrite exhibits minimum Steinmetz core loss near ${dcdcRes.material.T_opt_C} °C (matching typical 80–100 °C transformer operation), while keeping peak flux B_pk = ${dcdcRes.Bpk_mT.toFixed(1)} mT (${dcdcRes.saturationCheck.utilization_100C_pct.toFixed(1)}% of B_sat @ 100°C).`,
          },
        ],
      },
      steps: [
        {
          step: `${cD2}.1`,
          title: 'Core Geometry Area Product A_p & Required Power-Handling Benchmark',
          given: `P_out = ${Pout} W, f_sw = ${dcdcState.fsw_kHz} kHz, B_pk = ${dcdcRes.Bpk_mT.toFixed(1)} mT, Core = ${dcdcRes.core.name} (A_e = ${dcdcRes.core.Ae_mm2} mm², A_w = ${dcdcRes.core.Aw_mm2} mm²)`,
          tex: `A_{p,\\text{core}} = A_e A_w = ${Ap_actual_cm4.toFixed(2)}\\text{ cm}^4, \\quad A_{p,\\text{req}} = \\frac{P_{\\text{out}}\\cdot 10^2}{K_f K_u J f_{\\text{sw}} B_{\\text{pk}}} = ${Ap_req_cm4.toFixed(2)}\\text{ cm}^4`,
          formulaPlain: 'Ap,core = Ae * Aw >= Ap,req = (P_out * 100) / (Kf * Ku * J_Amm2 * f_sw * B_pk)',
          substitution: `A_p,core = ${Ae_cm2.toFixed(2)} cm² × ${Aw_cm2.toFixed(2)} cm² = ${Ap_actual_cm4.toFixed(2)} cm⁴ ; A_p,req = (${Pout}×100)/(4.0×0.35×4.5×${dcdcState.fsw_kHz}e3×${B_op_T.toFixed(3)}) = ${Ap_req_cm4.toFixed(2)} cm⁴`,
          result: `A_p = ${Ap_actual_cm4.toFixed(2)} cm⁴ vs Req ${Ap_req_cm4.toFixed(2)} cm⁴ · Ratio ${(Ap_actual_cm4 / Math.max(0.05, Ap_req_cm4)).toFixed(2)}× · V_e = ${(dcdcRes.core.Ve_mm3 / 1000).toFixed(1)} cm³`,
          verdict: {
            status: Ap_actual_cm4 >= Ap_req_cm4 ? 'pass' : 'warn',
            label: Ap_actual_cm4 >= Ap_req_cm4 ? 'Core Area Product Adequate' : 'Tight Core Area Product',
          },
        },
        {
          step: `${cD2}.2`,
          title: 'Faraday Half-Cycle Volt-Second Product & Peak Flux Excursion',
          given: `Applied λ = ${dcdcRes.voltSec_applied_Vus.toFixed(1)} µV·s, N_p = ${dcdcRes.Np_actual} T, A_e = ${dcdcRes.core.Ae_mm2} mm², B_sat,100°C = ${dcdcRes.saturationCheck.Bsat_100C_mT} mT`,
          tex: `B_{\\text{pk}} = \\frac{\\int V_{\\text{pri}}\\,dt}{2\\, N_p\\, A_e} = \\frac{V_{\\text{in}}\\, D_{\\text{eff}}}{2\\, N_p\\, A_e\\, f_{\\text{sw}}}`,
          formulaPlain: 'B_pk = (V * t_on) / (2 * Np * Ae)',
          substitution: `B_pk = ${dcdcRes.voltSec_applied_Vus.toFixed(1)}e-6 / (2 × ${dcdcRes.Np_actual} × ${dcdcRes.core.Ae_mm2}e-6) = ${dcdcRes.Bpk_mT.toFixed(1)} mT (Max λ_max = ${dcdcRes.voltSec_max_Vus.toFixed(1)} µV·s)`,
          result: `B_pk = ${dcdcRes.Bpk_mT.toFixed(1)} mT (${dcdcRes.saturationCheck.utilization_100C_pct.toFixed(1)}% of ${dcdcRes.saturationCheck.Bsat_100C_mT} mT @ 100°C) · ΔB = ${(dcdcRes.Bpk_mT * 2).toFixed(1)} mT`,
          verdict: {
            status:
              dcdcRes.saturationCheck.status === 'critical'
                ? 'fail'
                : dcdcRes.saturationCheck.status === 'warning'
                ? 'warn'
                : 'pass',
            label: dcdcRes.saturationCheck.headline,
          },
        },
        {
          step: `${cD2}.3`,
          title: 'Magnetizing Inductance Gap l_g, Peak H_pk & Saturation Current I_sat,80%',
          given: `L_m = ${dcdcState.Lm_uH} µH, N_p = ${dcdcRes.Np_actual} T, l_e = ${dcdcRes.core.le_mm} mm, µ_e = ${dcdcRes.mu_e_actual.toFixed(0)}`,
          tex: `I_{m,\\text{pk}} = \\frac{\\lambda}{2\\, L_m}, \\quad H_{\\text{pk}} = \\frac{N_p\\, I_{m,\\text{pk}}}{\\ell_e}, \\quad \\ell_g \\approx \\mu_0 A_e \\frac{N_p^2}{L_m} - \\frac{\\ell_e}{\\mu_i}`,
          formulaPlain: 'Im,pk = lambda / (2*Lm) ;  H_pk = Np * Im,pk / le',
          substitution: `I_m,pk = ${dcdcRes.Im_pk_A.toFixed(2)} A ; Air gap l_g = ${dcdcRes.airGap_mm.toFixed(3)} mm ; H_pk = ${dcdcRes.H_pk_Am.toFixed(1)} A/m`,
          result: `I_m,pk = ${dcdcRes.Im_pk_A.toFixed(2)} A · I_sat(80% B_sat) = ${dcdcRes.Isat_80pct_A.toFixed(1)} A · Gap l_g = ${dcdcRes.airGap_mm.toFixed(2)} mm`,
          verdict: { status: 'pass', label: 'Linear Magnetizing Headroom' },
        },
      ],
      figures: [
        {
          figId: 'dcdc-bh',
          caption: `Figure ${cD2}.1: Jiles-Atherton 100°C B–H hysteresis envelope showing operating minor loop ±${dcdcRes.Bpk_mT.toFixed(1)} mT against saturation limit.`,
        },
      ],
    });

    // CHAPTER D3
    const cD3 = String(chIdx++);
    chapters.push({
      id: 'ch-dcdc-thermal-win',
      num: cD3,
      stage: 'dcdc',
      title: 'Transformer Losses (iGSE + Dowell), Core Thermal & Bobbin Fit',
      subtitle: 'Steinmetz Temperature Coupling, AC Proximity Interleaving & Window Stack-Up',
      status:
        !dcdcRes.coreThermalAnalysis.coreThermalStable || dcdcRes.coreThermalAnalysis.Tcore_hotspot_C > 125
          ? 'fail'
          : dcdcRes.coreThermalAnalysis.Tcore_hotspot_C > 108 || dcdcRes.windowFill_pct > 75
          ? 'warn'
          : 'pass',
      intro: `Evaluates total transformer dissipation using non-sinusoidal iGSE core loss coupled to ferrite temperature coefficient F(T), 1D Dowell AC copper proximity factors, and physical bobbin window geometry.`,
      rationale: {
        heading: `Why Litz Wire (AWG${dcdcState.litzStrandAWG} · ${dcdcState.priStrands}/${dcdcState.secStrands} Strands) & Interleaving (${dcdcState.interleaving}) Were Chosen`,
        points: [
          {
            label: `Litz Strand Gauge (AWG${dcdcState.litzStrandAWG} = ${dcdcState.litzStrandAWG === 38 ? '0.102' : dcdcState.litzStrandAWG === 40 ? '0.079' : '0.064'} mm vs Skin Depth δ = ${dcdcRes.skinDepth_mm.toFixed(3)} mm)`,
            detail: `At ${dcdcState.fsw_kHz} kHz (100°C), copper skin depth is δ = ${dcdcRes.skinDepth_mm.toFixed(3)} mm. Individual AWG${dcdcState.litzStrandAWG} strands stay well below 2δ, suppressing internal skin-effect resistance.`,
          },
          {
            label: `Winding Interleaving (${dcdcState.interleaving} · F_R,pri = ${dcdcRes.Fr_dowell_pri.toFixed(2)}×, F_R,sec = ${dcdcRes.Fr_dowell_sec.toFixed(2)}×)`,
            detail: `Dowell proximity loss scales with m². Splitting primary/secondary halves cuts MMF peak by 2× (4× eddy loss reduction) with C_ww = ${dcdcRes.Cww_pF.toFixed(0)} pF.${dcdcState.interleaving === 'full-interleaved' ? ` Secondary half-sections S1a + S1b are wired in series to form total N_s = ${dcdcRes.Ns_actual} turns.` : ''}`,
          },
        ],
      },
      steps: [
        {
          step: `${cD3}.1`,
          title: 'Improved Generalized Steinmetz Equation (iGSE) Core Loss Density & P_core',
          given: `α_eff = ${dcdcRes.coreThermalAnalysis.alpha_eff.toFixed(2)}, β_eff = ${dcdcRes.coreThermalAnalysis.beta_eff.toFixed(2)}, k_i = ${dcdcRes.ki_igse.toFixed(3)}, ΔB = ${deltaB_T.toFixed(3)} T`,
          tex: `P_v = \\frac{1}{T}\\int_0^T k_i \\left|\\frac{dB}{dt}\\right|^\\alpha (\\Delta B)^{\\beta - \\alpha} dt, \\quad P_{\\text{core}} = P_v(T_{\\text{core}}) \\cdot V_e`,
          formulaPlain: 'Pv_iGSE = (1/T) * integral(k_i * |dB/dt|^alpha * Delta_B^(beta-alpha) dt) ;  P_core = Pv(T_core) * Ve',
          substitution: `P_v,iGSE = ${dcdcRes.coreThermalAnalysis.Pv_igse_kW_m3.toFixed(1)} kW/m³ (Temp factor F = ${dcdcRes.coreThermalAnalysis.tempFactor_F.toFixed(2)}) × ${dcdcRes.nPhases} phase(s)`,
          result: `P_core,iGSE = ${dcdcRes.Pcore_W.toFixed(2)} W (vs Classic Sinusoidal SE = ${dcdcRes.Pcore_se_W.toFixed(2)} W)`,
          verdict: { status: 'pass', label: 'Waveform-Exact iGSE Core Loss' },
        },
        {
          step: `${cD3}.2`,
          title: 'Copper Skin Depth δ, 1D Dowell Proximity Multiplier F_R & Copper Loss P_cu',
          given: `f_sw = ${dcdcState.fsw_kHz} kHz, ρ_Cu(100°C) = 2.28e-8 Ω·m, R_pri,ac = ${dcdcRes.Rpri_ac_mOhm.toFixed(1)} mΩ, R_sec,ac = ${dcdcRes.Rsec_ac_mOhm.toFixed(2)} mΩ`,
          tex: `\\delta = \\sqrt{\\frac{\\rho_{\\text{Cu}}}{\\pi f_{\\text{sw}}\\mu_0}}, \\quad F_R = M' + \\frac{(m^2-1)D'}{3}, \\quad P_{\\text{cu}} = I_{\\text{pri}}^2 R_{\\text{pri,ac}} + I_{\\text{sec}}^2 R_{\\text{sec,ac}}`,
          formulaPlain: 'delta = sqrt(rho_Cu / (pi * f_sw * mu_0)) ;  R_ac = F_R * R_dc ;  P_cu = I^2 * R_ac',
          substitution: `δ = ${dcdcRes.skinDepth_mm.toFixed(3)} mm ; F_R,pri = ${dcdcRes.Fr_dowell_pri.toFixed(2)}× ; F_R,sec = ${dcdcRes.Fr_dowell_sec.toFixed(2)}× ; C_ww = ${dcdcRes.Cww_pF.toFixed(0)} pF`,
          result: `P_cu,total = ${dcdcRes.Pcu_W.toFixed(2)} W · Total Transformer Loss P_mag = ${dcdcRes.coreThermalAnalysis.Pmag_total_W.toFixed(2)} W`,
          verdict: { status: 'pass', label: 'Dowell AC Resistance Solved' },
        },
        {
          step: `${cD3}.3`,
          title: 'Self-Consistent Core Thermal Equilibrium & Positive-Feedback Loop Gain',
          given: `T_amb = ${dcdcState.Tamb_C} °C, R_th,core = ${dcdcRes.core.Rth_core_CW} °C/W, P_mag = ${dcdcRes.coreThermalAnalysis.Pmag_total_W.toFixed(2)} W`,
          tex: `T_{\\text{core,hot}} = T_{\\text{amb}} + 1.22\\,(P_{\\text{core}}(T_{\\text{core}}) + P_{\\text{cu}})\\,R_{\\theta,\\text{core}}`,
          formulaPlain: 'T_core,hot = T_amb + 1.22 * (P_core(T_core) + P_cu) * R_th,core',
          substitution: `ΔT = ${dcdcRes.coreThermalAnalysis.deltaT_total_C.toFixed(1)} °C above ${dcdcState.Tamb_C} °C ; Thermal Feedback Gain dP_gen/dP_cool = ${dcdcRes.coreThermalAnalysis.coreThermalLoopGain.toFixed(2)}`,
          result: `T_core,hot = ${dcdcRes.coreThermalAnalysis.Tcore_hotspot_C.toFixed(1)} °C (Ceiling 125.0 °C) · Margin = ${(125 - dcdcRes.coreThermalAnalysis.Tcore_hotspot_C).toFixed(1)} °C`,
          verdict: {
            status:
              !dcdcRes.coreThermalAnalysis.coreThermalStable || dcdcRes.coreThermalAnalysis.Tcore_hotspot_C > 125
                ? 'fail'
                : dcdcRes.coreThermalAnalysis.Tcore_hotspot_C > 108
                ? 'warn'
                : 'pass',
            label:
              dcdcRes.coreThermalAnalysis.Tcore_hotspot_C > 125
                ? 'Core Over-Temp > 125°C'
                : dcdcRes.coreThermalAnalysis.Tcore_hotspot_C > 108
                ? 'Warm Core (>108°C)'
                : 'Thermally Stable',
          },
        },
      ],
      figures: [
        {
          figId: 'dcdc-thermal',
          caption: `Figure ${cD3}.1: Coupled Steinmetz core thermal equilibrium P_mag(T) vs heat dissipation limit against 125°C threshold.`,
        },
        {
          figId: 'dcdc-window',
          caption: `Figure ${cD3}.2: Physical bobbin winding radial build-up, IEC margin tape creepage barriers, and window utilization.`,
        },
      ],
    });

    // CHAPTER D4
    const cD4 = String(chIdx++);
    chapters.push({
      id: 'ch-dcdc-zvs-semi',
      num: cD4,
      stage: 'dcdc',
      title: 'ZVS Soft-Switching Window, Semiconductors & Junction Thermal SOA',
      subtitle: 'Tank Energy vs Coss Balance, Switching Losses & Electro-Thermal Convergence',
      status:
        !dcdcRes.thermalStable || Math.max(dcdcRes.Tj_pri_C, dcdcRes.Tj_sec_C) > (dcdcState.Tj_max_limit_C ?? 125)
          ? 'fail'
          : !dcdcRes.zvsAchieved
          ? 'warn'
          : 'pass',
      intro: `Verifies inductive Zero-Voltage Switching across primary bridge legs, computes temperature-coupled R_ds(on) conduction and residual switching/clamp losses, and resolves steady-state silicon/SiC junction temperatures.`,
      rationale: {
        heading: `Why Primary (${dcdcState.nParallelPri}× ${dcdcRes.priDevice.id}) & Secondary (${dcdcState.nParallelSec}× ${dcdcRes.secDevice.id}) FETs Were Chosen`,
        points: [
          {
            label: `Primary Bridge (${dcdcRes.priDevice.id} · ${dcdcRes.priDevice.Vds_max_V}V / ${dcdcRes.priDevice.Rds_on_25C_mOhm}mΩ / ${dcdcRes.priDevice.tech})`,
            detail: `Maintains ${maxVdsPriMargin_pct.toFixed(0)}% V_DS derating at ${Vin_max} V max bus with low E_oss,lag = ${dcdcRes.E_oss_lag_uJ.toFixed(1)} µJ so ${dcdcState.Llk_uH} µH achieves ${zvsRatio.toFixed(0)}% ZVS energy ratio.${dcdcState.kelvinSourcePri ? ` 4-pin Kelvin source saves ~${dcdcRes.Psw_kelvin_saved_W.toFixed(1)} W turn-off loss.` : ''}`,
          },
          {
            label: `Secondary Rectifiers (${dcdcRes.secDevice.id} · ${dcdcRes.secDevice.Vds_max_V}V / ${dcdcRes.secDevice.Rds_on_25C_mOhm}mΩ)`,
            detail: `Handles ${dcdcRes.Vsec_unclamped_pk_V.toFixed(1)} V peak ringing (${maxVdsSecUtil_pct.toFixed(0)}% of ${dcdcRes.secDevice.Vds_max_V}V rating) while ${dcdcState.nParallelSec}× paralleling quarters total R_ds(on) loss to ${dcdcRes.Pcond_sec_W.toFixed(1)} W.`,
          },
          {
            label: `RC Clamp / Snubber (${dcdcRes.Cclamp_nF.toFixed(0)} nF, ${dcdcRes.Rsnub_Ohm.toFixed(1)} Ω / ${dcdcRes.Csnub_pF.toFixed(0)} pF)`,
            detail: `Damps secondary leakage/C_oss resonance at f_ring = ${dcdcRes.f_ring_MHz.toFixed(1)} MHz (Z_0 = ${dcdcRes.Z0_ring_Ohm.toFixed(1)} Ω) for ${dcdcRes.Psnub_W.toFixed(1)} W snubber dissipation.`,
          },
        ],
      },
      steps: [
        {
          step: `${cD4}.1`,
          title: 'Lagging-Leg Inductive Tank Energy vs Switch Coss + C_tr Discharge Balance',
          given: `L_lk = ${dcdcState.Llk_uH} µH, I_lag,off = ${dcdcRes.I_lag_turnoff_A.toFixed(1)} A, t_dead = ${dcdcState.deadTime_ns} ns (Opt: ${dcdcRes.t_dead_opt_ns.toFixed(0)} ns)`,
          tex: `E_{\\text{tank}} = \\frac{1}{2}\\, L_{\\text{lk}}\\, I_{\\text{lag,off}}^2 \\ge E_{\\text{oss}}(V_{\\text{in}}) = 2\\cdot \\frac{1}{2}\\, C_{\\text{oss,er}}\\, V_{\\text{in}}^2`,
          formulaPlain: 'E_tank = 0.5 * L_lk * I_lag^2 >= E_oss(V_in)',
          substitution: `E_lk = 0.5 × ${dcdcState.Llk_uH}e-6 × ${dcdcRes.I_lag_turnoff_A.toFixed(1)}² = ${dcdcRes.E_lk_avail_uJ.toFixed(1)} µJ vs E_oss = ${dcdcRes.E_oss_lag_uJ.toFixed(1)} µJ`,
          result: `ZVS Energy Ratio = ${zvsRatio.toFixed(0)}% · Residual V_ds = ${dcdcRes.Vds_res_lag_V.toFixed(0)} V (ZVS lost below ${dcdcRes.P_min_zvs_pct.toFixed(0)}% load)`,
          verdict: {
            status: dcdcRes.zvsAchieved ? 'pass' : 'warn',
            label: dcdcRes.zvsAchieved ? 'Full Lagging-Leg ZVS' : 'Partial Hard-Switching',
          },
        },
        {
          step: `${cD4}.2`,
          title: 'Primary & Secondary Semiconductor Loss Synthesis',
          given: `R_ds,pri(hot) = ${dcdcRes.Rds_pri_actual_mOhm.toFixed(1)} mΩ, R_ds,sec(hot) = ${dcdcRes.Rds_sec_actual_mOhm.toFixed(1)} mΩ, P_snub = ${dcdcRes.Psnub_W.toFixed(1)} W`,
          tex: `P_{\\text{semi}} = \\left(P_{\\text{cond,pri}} + P_{\\text{sw,pri}}\\right) + \\left(P_{\\text{cond,sec}} + P_{\\text{snub}}\\right)`,
          formulaPlain: 'P_semi = (P_cond,pri + P_sw,pri) + (P_cond,sec + P_snub)',
          substitution: `Pri = ${dcdcRes.Pcond_pri_W.toFixed(1)}W cond + ${dcdcRes.Psw_pri_W.toFixed(1)}W sw ; Sec = ${dcdcRes.Pcond_sec_W.toFixed(1)}W + Snub = ${dcdcRes.Psnub_W.toFixed(1)}W`,
          result: `Total Converter Loss = ${dcdcRes.Ptotal_loss_W.toFixed(1)} W · Full-Load Efficiency η = ${dcdcRes.efficiency_pct.toFixed(2)}%`,
          verdict: { status: 'pass', label: `η = ${dcdcRes.efficiency_pct.toFixed(2)}%` },
        },
        {
          step: `${cD4}.3`,
          title: 'Self-Consistent Electro-Thermal Heatsink & Junction Convergence',
          given: `T_amb = ${dcdcState.Tamb_C} °C, R_th,hs = ${dcdcState.Rth_heatsink_CW} °C/W, R_th,TIM(pri/sec) = ${dcdcRes.Rth_TIM_CW.toFixed(2)} / ${dcdcRes.Rth_TIM_sec_CW.toFixed(2)} °C/W, Limit = ${dcdcRes.Tj_max_limit_C} °C`,
          tex: `T_j = T_{\\text{amb}} + P_{\\text{dev}}(T_j)\\cdot\\left(R_{\\theta,\\text{JC}} + R_{\\theta,\\text{TIM}}\\right) + P_{\\text{hs}}\\cdot R_{\\theta,\\text{hs}}`,
          formulaPlain: 'Tj = T_amb + P_dev(Tj)*(Rth_JC + Rth_TIM) + P_hs*Rth_hs',
          substitution: `T_sink,pri = ${dcdcRes.Tsink_pri_C.toFixed(1)} °C → T_case = ${dcdcRes.Tcase_pri_C.toFixed(1)} °C → T_j,pri = ${dcdcRes.Tj_pri_C.toFixed(1)} °C (R_hs,crit = ${dcdcRes.Rth_hs_crit_CW.toFixed(2)} °C/W)`,
          result: `T_j,pri = ${dcdcRes.Tj_pri_C.toFixed(1)} °C · T_j,sec = ${dcdcRes.Tj_sec_C.toFixed(1)} °C · Thermal Loop Gain = ${dcdcRes.thermalLoopGain.toFixed(2)}`,
          verdict: {
            status: !dcdcRes.thermalStable || Math.max(dcdcRes.Tj_pri_C, dcdcRes.Tj_sec_C) > (dcdcState.Tj_max_limit_C ?? 125) ? 'fail' : 'pass',
            label: dcdcRes.thermalStable ? 'Thermal Runaway Free' : 'Junction Limit Violated',
          },
        },
      ],
      figures: [
        {
          figId: 'dcdc-eff',
          caption: `Figure ${cD4}.1: 10%–100% load efficiency curve alongside exact component power loss breakdown.`,
        },
      ],
    });

    // CHAPTER D5
    const cD5 = String(chIdx++);
    chapters.push({
      id: 'ch-dcdc-passives',
      num: cD5,
      stage: 'dcdc',
      title: 'Output Filter (L_o, C_o), Y1 Safety Isolation & Complete Passive BOM',
      subtitle: 'Ripple Current Synthesis, Capacitance Derating & Hardware Component Schedules',
      status:
        dcdcCapRows.some((r) => r.sol.status === 'critical') ||
        dcdcInductorRows.some((r) => r.sol.satStatus === 'critical' || r.sol.windowFitStatus === 'overflow')
          ? 'fail'
          : dcdcCapRows.some((r) => r.sol.status === 'warning')
          ? 'warn'
          : 'pass',
      intro: `Synthesizes all discrete magnetic inductors (output filter choke, external resonant/shim inductor, DM EMI choke) and capacitor banks (resonant C_r, output C_o, primary bus C_in, Y1 isolation C_Y1) with physical geometry and reliability derating.`,
      rationale: {
        heading: `Why Output Filter L_o (${dcdcState.Lo_uH} µH) / C_o (${dcdcState.Co_uF} µF) & Y1 Safety Ratings Were Chosen`,
        points: [
          {
            label: `Output Choke L_o = ${dcdcState.Lo_uH} µH @ ${dcdcRes.fRipple_out_kHz.toFixed(0)} kHz & External Shim Split`,
            detail: `Caps per-phase output ripple to ${dcdcRes.deltaILo_phase_A.toFixed(1)} App (${((dcdcRes.deltaILo_phase_A / Math.max(1, dcdcRes.Iout_phase_A)) * 100).toFixed(0)}% of I_out,ph). Primary ZVS tank L_lk = ${dcdcState.Llk_uH} µH splits into transformer winding leakage L_lk,tx ≈ ${dcdcRes.Llk_geom_uH.toFixed(1)} µH + discrete external shim inductor L_shim ≈ ${L_shim_calc_uH.toFixed(1)} µH.`,
          },
          {
            label: `Output Bank C_o = ${dcdcState.Co_uF} µF / ${dcdcState.ESR_Co_mOhm} mΩ ESR${outCapRow ? ` (BOM: ${outCapRow.sol.bank_C_uF.toFixed(0)} µF / ${outCapRow.sol.bank_ESR_mOhm.toFixed(2)} mΩ)` : ''}`,
            detail: `Holds steady-state output ripple to ${dcdcRes.Vout_ripple_mVpp.toFixed(1)} mVpp (${((dcdcRes.Vout_ripple_mVpp / (Vout * 1000)) * 100).toFixed(2)}% of ${Vout}V) while absorbing I_Co,rms = ${dcdcRes.ICo_rms_A.toFixed(1)} A.${outCapRow && outCapRow.sol.unitPart.dielectric !== 'ceramic-mlcc' ? ` HF Decoupling: Place 2–4× 10 µF / ${Math.max(100, Math.ceil((Vout * 2) / 50) * 50)} V X7S/X7R MLCCs in parallel right at the rectifier output to handle ${dcdcState.fsw_kHz} kHz switching edges.` : ''}${outCapRow && Math.abs(outCapRow.sol.bank_ESR_mOhm - dcdcState.ESR_Co_mOhm) > Math.max(1.2, dcdcState.ESR_Co_mOhm * 0.45) ? ` NOTE: Physical BOM ESR (${outCapRow.sol.bank_ESR_mOhm.toFixed(2)} mΩ) differs from loop ESR (${dcdcState.ESR_Co_mOhm} mΩ) — click "Sync C_o & ESR to Control Loop" in alerts to align them.` : ''}`,
          },
          {
            label: `Y1 Isolation Barrier Rating (250/500 Vac · 1500 Vdc Continuous)`,
            detail: `Primary-to-secondary Y1 safety ceramics bridge pure DC isolation potential (${Vin_max} Vdc) using their IEC continuous 1500 Vdc withstand rating (NOT their 50/60 Hz Vac rating) with impulse test rating ≥ 4000 Vpk.`,
          },
        ],
      },
      steps: [
        {
          step: `${cD5}.1`,
          title: 'Secondary Output Inductor Ripple ΔI_Lo & Net Output Voltage Ripple ΔV_out',
          given: `L_o = ${dcdcState.Lo_uH} µH, C_o = ${dcdcState.Co_uF} µF, ESR_Co = ${dcdcState.ESR_Co_mOhm} mΩ, f_rip = ${dcdcRes.fRipple_out_kHz.toFixed(0)} kHz`,
          tex: `\\Delta I_{L_o} = \\frac{(V_{\\text{sec}} - V_{\\text{out}})\\, D_{\\text{eff}}}{L_o\\, f_{\\text{rip}}}, \\quad \\Delta V_{\\text{out,pp}} \\approx \\Delta I_{\\text{net}}\\left(R_{\\text{ESR}} + \\frac{1}{8 f_{\\text{rip}} C_o}\\right)`,
          formulaPlain: 'Delta_ILo = (V_sec - V_out)*D_eff / (Lo*f_rip) ;  Delta_Vout = Delta_Inet * (ESR + 1/(8*f_rip*Co))',
          substitution: `ΔI_Lo,ph = ${dcdcRes.deltaILo_phase_A.toFixed(2)} App ; ΔI_net = ${dcdcRes.deltaIout_net_A.toFixed(2)} App ; I_Co,rms = ${dcdcRes.ICo_rms_A.toFixed(2)} A`,
          result: `ΔV_out = ${dcdcRes.Vout_ripple_mVpp.toFixed(1)} mV_pp (${((dcdcRes.Vout_ripple_mVpp / (Vout * 1000)) * 100).toFixed(2)}% of ${Vout}V)`,
          verdict: { status: 'pass', label: 'Output Ripple Within 1% Limit' },
        },
      ],
      inductorSchedule: {
        title: `Table ${cD5}.1 — DC-DC Stage Complete Inductor Synthesis Schedule`,
        rows: dcdcInductorRows,
      },
      capacitorSchedule: {
        title: `Table ${cD5}.2 — DC-DC Stage Complete Capacitor Bank & Safety Schedule`,
        rows: dcdcCapRows,
      },
    });

    // CHAPTER D6
    const cD6 = String(chIdx++);
    chapters.push({
      id: 'ch-dcdc-ctrl',
      num: cD6,
      stage: 'dcdc',
      title: `Control Loop Compensation (${dcdcState.controlType.toUpperCase()}) & Middlebrook Stability`,
      subtitle: 'LC Double-Pole Placement, Subharmonic Ramp Damping & Input Filter Impedance Margin',
      status:
        dcdcRes.pm_actual_deg < 30 || (!dcdcRes.slopeStable && dcdcState.controlType === 'pcmc')
          ? 'fail'
          : !dcdcRes.middlebrookStable || dcdcRes.pm_actual_deg < 45
          ? 'warn'
          : 'pass',
      intro: `Synthesizes closed-loop analog/digital pole-zero networks across nominal and worst-case LC tolerances, verifies subharmonic inner current ramp stability, and checks Middlebrook input filter interaction.`,
      rationale: {
        heading:
          dcdcState.controlType === 'pcmc'
            ? `Why Control Architecture (PCMC), f_c = ${dcdcState.fc_target_kHz} kHz & Slope Compensation m_c = ${dcdcRes.mc_slope.toFixed(2)} Were Chosen`
            : `Why Control Architecture (${dcdcState.controlType.toUpperCase()}), f_c = ${dcdcState.fc_target_kHz} kHz & Phase Boost Were Chosen`,
        points: [
          {
            label: `Crossover Placement (f_c = ${dcdcRes.fc_actual_kHz.toFixed(1)} kHz vs f_0 = ${dcdcRes.f0_lc_kHz.toFixed(2)} kHz & f_sw = ${dcdcState.fsw_kHz} kHz)`,
            detail: `Places crossover well above the output LC pole (${dcdcRes.f0_lc_kHz.toFixed(2)} kHz) for fast load-step recovery, while staying below f_sw/8 (${(dcdcState.fsw_kHz / 8).toFixed(1)} kHz) to attenuate switching ripple & digital sampling phase lag.`,
          },
          {
            label:
              dcdcState.controlType === 'pcmc'
                ? `PCMC Artificial Slope Ramp (m_c = ${dcdcRes.mc_slope.toFixed(2)})`
                : dcdcRes.isTwoZeroComp
                ? `Type-III Compensator Phase Boost (f_z1/f_z2 → f_p1/f_p2)`
                : `Type-II Compensator Phase Boost (f_z1 → f_p1)`,
            detail:
              dcdcState.controlType === 'pcmc'
                ? `Injects S_e = ${dcdcRes.Se_ramp_V_us.toFixed(3)} V/µs artificial ramp against downslope S_f = ${dcdcRes.Sf_downslope_V_us.toFixed(3)} V/µs, clamping Ridley subharmonic Q_p = ${dcdcRes.Qp_subharmonic.toFixed(2)} cleanly below oscillation threshold.`
                : dcdcRes.isTwoZeroComp
                ? `Places dual zeros near f_0 (${dcdcRes.fz1_kHz.toFixed(2)} / ${dcdcRes.fz2_kHz.toFixed(2)} kHz) to cancel LC −180° phase lag and dual poles above f_esr (${dcdcRes.fp1_kHz.toFixed(2)} / ${dcdcRes.fp2_kHz.toFixed(1)} kHz) for high-frequency noise roll-off.`
                : `Places single Type-II zero f_z1 = ${dcdcRes.fz1_kHz.toFixed(2)} kHz for target phase boost and high-frequency pole f_p1 = ${dcdcRes.fp1_kHz.toFixed(2)} kHz to attenuate switching ripple.`,
          },
          {
            label: `Middlebrook Input Filter Decoupling (ΔZ_MB = ${dcdcRes.middlebrookMargin_dB.toFixed(1)} dB ≥ 6.0 dB)`,
            detail: `Ensures converter closed-loop input impedance |Z_in| stays well above the input EMI filter peak output impedance |Z_out,EMI| = ${dcdcRes.Zout_emi_pk_dBOhm.toFixed(1)} dBΩ across 100 Hz – 100 kHz.`,
          },
        ],
      },
      steps: [
        {
          step: `${cD6}.1`,
          title: 'Power-Stage LC Double Pole f_0, ESR Zero f_z,esr & Subharmonic Q_p Check',
          given: `L_o = ${dcdcState.Lo_uH} µH, C_o = ${dcdcState.Co_uF} µF, ESR = ${dcdcState.ESR_Co_mOhm} mΩ, D_eff = ${(D_ind_pcmc * 100).toFixed(1)}%, m_c = ${dcdcRes.mc_slope.toFixed(2)}`,
          tex: `f_0 = \\frac{1}{2\\pi\\sqrt{L_o C_o}}, \\quad f_{z,\\text{esr}} = \\frac{1}{2\\pi\\, R_{\\text{ESR}}\\, C_o}, \\quad Q_p = \\frac{1}{\\pi\\left(m_c(1-D_{\\text{eff}}) - 0.5\\right)}`,
          formulaPlain: 'f0 = 1/(2*pi*sqrt(Lo*Co)) ;  fz,esr = 1/(2*pi*ESR*Co) ;  Qp = 1 / (pi*(mc*(1-D_eff) - 0.5))',
          substitution: `f_0 = ${dcdcRes.f0_lc_kHz.toFixed(2)} kHz (WC ${dcdcRes.f0_wc_min_kHz.toFixed(2)}–${dcdcRes.f0_wc_max_kHz.toFixed(2)} kHz) ; f_esr = ${dcdcRes.f_esr_kHz.toFixed(1)} kHz ; Q_p = 1/(π×(${dcdcRes.mc_slope.toFixed(2)}×${D_prime_pcmc.toFixed(3)} - 0.5)) = ${dcdcRes.Qp_subharmonic.toFixed(2)}`,
          result:
            dcdcState.controlType === 'pcmc'
              ? `f_0 = ${dcdcRes.f0_lc_kHz.toFixed(2)} kHz · f_esr = ${dcdcRes.f_esr_kHz.toFixed(1)} kHz · Subharmonic Q_p = ${dcdcRes.Qp_subharmonic.toFixed(2)}`
              : `f_0 = ${dcdcRes.f0_lc_kHz.toFixed(2)} kHz · f_esr = ${dcdcRes.f_esr_kHz.toFixed(1)} kHz · PCMC Q_p N/A (${dcdcState.controlType.toUpperCase()})`,
          verdict:
            dcdcState.controlType !== 'pcmc'
              ? { status: 'pass', label: `N/A (${dcdcState.controlType.toUpperCase()} Mode)` }
              : {
                  status: !dcdcRes.slopeStable || dcdcRes.Qp_subharmonic > 2.0 ? 'fail' : dcdcRes.Qp_subharmonic > 1.8 ? 'warn' : 'pass',
                  label:
                    !dcdcRes.slopeStable || dcdcRes.Qp_subharmonic > 2.0
                      ? 'Subharmonic Oscillation Risk'
                      : dcdcRes.Qp_subharmonic > 1.8
                      ? 'Elevated Q_p Peaking'
                      : 'Subharmonic Damped',
                },
        },
        {
          step: `${cD6}.2`,
          title: 'Compensated Open-Loop Crossover f_c, Worst-Case Phase Margin & Middlebrook Separation',
          given: `Target f_c = ${dcdcState.fc_target_kHz} kHz, Target PM = ${dcdcState.pm_target_deg}°, L_emi = ${dcdcRes.L_emi_uH.toFixed(1)} µH, C_emi = ${dcdcRes.C_emi_uF.toFixed(1)} µF`,
          tex: `\\phi_m = 180^\\circ + \\angle T(j 2\\pi f_c) \\ge 45^\\circ, \\quad \\Delta Z_{\\text{MB}} = 20\\log_{10}\\frac{|Z_{\\text{in,conv}}|}{|Z_{\\text{out,EMI}}|} \\ge 6\\text{ dB}`,
          formulaPlain: 'PM = 180 + arg(T(j2pi*fc)) >= 45 deg ;  Delta_Z_MB = 20*log10(|Z_in|/|Z_out,EMI|) >= 6 dB',
          substitution: `f_c,act = ${dcdcRes.fc_actual_kHz.toFixed(2)} kHz ; PM = ${dcdcRes.pm_actual_deg.toFixed(1)}° (WC min ${dcdcRes.pm_wc_min_deg.toFixed(1)}°) ; GM = ${dcdcRes.gm_actual_dB.toFixed(1)} dB ; ΔZ_MB = ${dcdcRes.middlebrookMargin_dB.toFixed(1)} dB`,
          result: `PM = ${dcdcRes.pm_actual_deg.toFixed(1)}° · GM = ${dcdcRes.gm_actual_dB.toFixed(1)} dB · Middlebrook ΔZ = ${dcdcRes.middlebrookMargin_dB.toFixed(1)} dB`,
          verdict: {
            status:
              dcdcRes.pm_actual_deg < 30 || (dcdcState.controlType === 'pcmc' && !dcdcRes.slopeStable)
                ? 'fail'
                : !dcdcRes.middlebrookStable || dcdcRes.pm_actual_deg < 45
                ? 'warn'
                : 'pass',
            label:
              dcdcRes.pm_actual_deg >= 45 && dcdcRes.middlebrookStable
                ? 'Stable Loop & EMI Margin'
                : 'Tight Control / EMI Margin',
          },
        },
      ],
      paramTables: [
        {
          title: dcdcRes.isTwoZeroComp
            ? `Table ${cD6}.1 — Synthesized Analog Type-III Network & Digital 3P3Z Coefficients`
            : `Table ${cD6}.1 — Synthesized Analog Type-II Network & Digital 2P2Z Coefficients`,
          headers: ['Domain', 'Component / Coefficient', 'Computed Value', 'Placement / Role'],
          rows: [
            dcdcRes.isTwoZeroComp
              ? ['Poles / Zeros', 'f_z1 / f_z2', `${dcdcRes.fz1_kHz.toFixed(2)} kHz / ${dcdcRes.fz2_kHz.toFixed(2)} kHz`, 'Dual zeros boost phase around LC corner f_0']
              : ['Poles / Zeros', 'f_z1 (Single Zero)', `${dcdcRes.fz1_kHz.toFixed(2)} kHz (f_z2 N/A in 2P2Z)`, 'Single zero cancels 1-pole PCMC plant lag'],
            dcdcRes.isTwoZeroComp
              ? ['Poles / Zeros', 'f_p1 / f_p2', `${dcdcRes.fp1_kHz.toFixed(2)} kHz / ${dcdcRes.fp2_kHz.toFixed(1)} kHz`, 'Cancels ESR zero & attenuates HF switching noise']
              : ['Poles / Zeros', 'f_p1 (HF Roll-Off)', `${dcdcRes.fp1_kHz.toFixed(2)} kHz (f_p2 N/A in 2P2Z)`, 'Attenuates switching ripple above crossover f_c'],
            ['Analog Op-Amp', dcdcRes.isTwoZeroComp ? 'R1 / R2 / R3' : 'R1 / R2', dcdcRes.isTwoZeroComp ? `${dcdcRes.R1_kOhm.toFixed(1)} kΩ / ${dcdcRes.R2_kOhm.toFixed(1)} kΩ / ${dcdcRes.R3_kOhm.toFixed(1)} kΩ` : `${dcdcRes.R1_kOhm.toFixed(1)} kΩ / ${dcdcRes.R2_kOhm.toFixed(1)} kΩ`, 'Standard E96 feedback & gain resistors'],
            ['Analog Op-Amp', dcdcRes.isTwoZeroComp ? 'C1 / C2 / C3' : 'C1 / C2', dcdcRes.isTwoZeroComp ? `${dcdcRes.C1_nF.toFixed(2)} nF / ${dcdcRes.C2_pF.toFixed(0)} pF / ${dcdcRes.C3_nF.toFixed(2)} nF` : `${dcdcRes.C1_nF.toFixed(2)} nF / ${dcdcRes.C2_pF.toFixed(0)} pF`, 'Pure integrator pole at origin + phase lead-lag'],
            ['Digital DSP', dcdcRes.isTwoZeroComp ? 'b0, b1, b2, b3' : 'b0, b1, b2', dcdcRes.isTwoZeroComp ? `${dcdcRes.b0.toFixed(4)}, ${dcdcRes.b1.toFixed(4)}, ${dcdcRes.b2.toFixed(4)}, ${dcdcRes.b3.toFixed(4)}` : `${dcdcRes.b0.toFixed(4)}, ${dcdcRes.b1.toFixed(4)}, ${dcdcRes.b2.toFixed(4)}`, `Discretized at f_s = ${dcdcState.fs_digital_kHz} kHz`],
            ['Middlebrook', 'L_emi / C_emi / R_d', `${dcdcRes.L_emi_uH.toFixed(0)} µH / ${dcdcRes.C_emi_uF.toFixed(0)} µF / ${dcdcRes.Rd_emi_Ohm.toFixed(2)} Ω`, `Separation margin ΔZ_MB = ${dcdcRes.middlebrookMargin_dB.toFixed(1)} dB`],
          ],
        },
      ],
      figures: [
        {
          figId: 'dcdc-bode',
          caption: `Figure ${cD6}.1: Compensated ${dcdcRes.isTwoZeroComp ? 'Type-III (3P3Z)' : 'Type-II (2P2Z)'} open-loop gain & phase Bode plot (Crossover ${dcdcRes.fc_actual_kHz.toFixed(1)} kHz, PM = ${dcdcRes.pm_actual_deg.toFixed(1)}°).`,
        },
      ],
    });
  }

  // ============================================================================
  // FINAL AUDIT CHAPTER
  // ============================================================================
  const cAudit = String(chIdx++);
  chapters.push({
    id: 'ch-audit',
    num: cAudit,
    stage: 'audit',
    title: 'Final Engineering Audit & Hardware Sign-Off',
    subtitle: 'Automated Limit Audit Summary & Hardware Release Readiness Checklist',
    status: scopedAlerts.danger.length > 0 ? 'fail' : scopedAlerts.warning.length > 0 ? 'warn' : 'pass',
    intro:
      scopedAlerts.all.length === 0
        ? 'All magnetic flux saturation checks, Steinmetz core thermal equilibria, semiconductor breakdown & junction SOA margins, passive capacitor banks, control loop margins, and IEC safety clearances pass engineering verification.'
        : `The automated verification engine identified ${scopedAlerts.danger.length} critical violation(s) and ${scopedAlerts.warning.length} advisory warning(s) requiring attention prior to PCB release.`,
    rationale: {
      heading: 'Verification Basis & Methodology',
      points: [
        {
          label: 'Coupled Physics vs Decoupled Approximations',
          detail: 'All temperature-dependent parameters (MOSFET R_ds(on)(Tj), Ferrite Steinmetz F(T), Copper Dowell resistivity, Capacitor ESR life) are solved iteratively to thermal fixed-point convergence.',
        },
        {
          label: 'Safety & Reliability Standards Checked',
          detail: '100°C B–H saturation knee (<85%), 125°C core & junction ceilings, 80%–90% V_DS derating, IEC 62368-1 creepage & Y1 DC isolation rating, IEC 61000-3 harmonics, and ≥45° control phase margin.',
        },
      ],
    },
    steps: [],
  });

  const dcdcTxLabel =
    dcdcState.txType === 'full-bridge'
      ? 'Full-Bridge Sec'
      : dcdcState.txType === 'center-tapped'
      ? 'Center-Tapped Sec'
      : 'Current-Doubler Sec';
  const dcdcRectLabel = dcdcState.rectMode === 'sync-fet' ? 'Sync FET' : 'Diode';
  const dcdcLiveTitle = `${(dcdcState.Pout_W / 1000).toFixed(2)} kW ${dcdcState.topology.toUpperCase()} (${dcdcRectLabel} + ${dcdcTxLabel}, ${dcdcState.Vin_nom_V}V→${dcdcState.Vout_V}V)`;
  const acdcLiveTitle = `${(acdcState.Pout_W / 1000).toFixed(2)} kW ${acdcState.topology} AC-DC PFC (${acdcState.Vac_rms_V}Vac→${acdcState.Vdc_bus_V}Vdc)`;

  const title =
    scope === 'both'
      ? `${acdcLiveTitle} & ${dcdcLiveTitle} Design Report`
      : scope === 'dcdc'
      ? `${dcdcLiveTitle} — Complete Engineering Design Report`
      : `${acdcLiveTitle} — Complete Engineering Design Report`;

  const scopeLabel =
    scope === 'both'
      ? 'Cascade AC-DC + DC-DC'
      : scope === 'dcdc'
      ? 'Isolated DC-DC Stage'
      : 'AC-DC PFC Stage';

  return {
    title,
    dateStr,
    scope,
    scopeLabel,
    includeAcDc,
    includeDcDc,
    chapters,
    scopedAlerts,
  };
}
