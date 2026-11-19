// ============================================================================
// UNIFIED DESIGN ALERT EVALUATOR (DANGER VS WARNING ACROSS DC-DC & AC-DC)
// Surfaces critical hardware/safety violations ("Danger") and tight margins
// ("Warning") with exact domain + sub-tab + component deep-link targets.
// ============================================================================

import {
  AcDcDesignState,
  CORE_DATABASE,
  DcDcDesignState,
} from '../data/databases';
import { AcDcResults } from './acdcEngine';
import { DcDcResults } from './dcdcEngine';
import {
  CustomCapBankLocks,
  CustomInductorLocks,
  PerCapConfig,
  PerInductorConfig,
  extractCircuitCapacitors,
  extractCircuitInductors,
  solveCapacitorBank,
  solveCustomInductorDesign,
} from './passiveDesignEngine';
import { computeWindowAnalysis, GapStrategyMode } from '../components/WindingWindowVisualizer';
import {
  DesignAlertFix,
  synthesizeAcDcFixes,
  synthesizeCapacitorAlertFixes,
  synthesizeDcdcCompactCoreFixes,
  synthesizeDcdcCoreThermalFixes,
  synthesizeDcdcLlcGainFixes,
  synthesizeDcdcSaturationFixes,
  synthesizeDcdcSemiThermalFixes,
  synthesizeDcdcVoltageFixes,
  synthesizeDcdcWindowFixes,
  synthesizeDcdcZvsFixes,
  synthesizeInductorAlertFixes,
} from './designFixSynthesizer';

export type { DesignAlertFix };

export type DesignAlertSeverity = 'danger' | 'warning';
export type DesignAlertDomain = 'dcdc' | 'acdc';

export interface DesignAlertItem {
  id: string;
  severity: DesignAlertSeverity;
  domain: DesignAlertDomain;
  domainLabel: 'DC-DC' | 'AC-DC';
  subTab: string;
  subTabLabel: string;
  targetItemId?: string;
  title: string;
  metric: string;
  actionHint: string;
  fixes?: DesignAlertFix[];
}

export interface DesignAlertSummary {
  all: DesignAlertItem[];
  danger: DesignAlertItem[];
  warning: DesignAlertItem[];
}

const AWG_DIAM_MM: Record<number, number> = {
  36: 0.127,
  38: 0.1016,
  40: 0.0787,
  42: 0.0635,
  44: 0.0508,
};

const DEFAULT_IND_LOCKS: CustomInductorLocks = {
  targetL_uH: false,
  coreId: false,
  materialId: false,
  turnsN: false,
  airGap_mm: false,
  wireAwg: false,
  parallelStrands: false,
  conductorForm: false,
};

const DEFAULT_CAP_LOCKS: CustomCapBankLocks = {
  targetC_uF: false,
  partId: false,
  seriesCount: false,
  parallelCount: false,
};

export function evaluateDesignAlerts(params: {
  dcdcState: DcDcDesignState;
  dcdcRes: DcDcResults;
  acdcState: AcDcDesignState;
  acdcRes: AcDcResults;
  inductorConfigs?: Record<string, PerInductorConfig>;
  capacitorConfigs?: Record<string, PerCapConfig>;
}): DesignAlertSummary {
  const {
    dcdcState,
    dcdcRes,
    acdcState,
    acdcRes,
    inductorConfigs = {},
    capacitorConfigs = {},
  } = params;
  const alerts: DesignAlertItem[] = [];

  // ==========================================================================
  // 1. DC-DC CONVERTER STAGE CHECKS
  // ==========================================================================

  // 1a. Transformer Core Saturation
  if (dcdcRes.saturationCheck.status === 'critical') {
    alerts.push({
      id: 'dcdc-tx-saturation',
      severity: 'danger',
      domain: 'dcdc',
      domainLabel: 'DC-DC',
      subTab: 'saturation',
      subTabLabel: 'Core Saturation & BH',
      title: 'Transformer Core Saturation Exceeded',
      metric: `B_pk = ${dcdcRes.Bpk_mT.toFixed(0)} mT (${dcdcRes.saturationCheck.utilization_100C_pct.toFixed(0)}% of ${dcdcRes.saturationCheck.Bsat_100C_mT.toFixed(0)} mT B_sat)`,
      actionHint: `Increase Np ≥ ${dcdcRes.saturationCheck.recommendedMinNp_turns}T${
        dcdcRes.saturationCheck.recommendedCoreName
          ? ` or step up core to ${dcdcRes.saturationCheck.recommendedCoreName}`
          : ''
      }.`,
      fixes: synthesizeDcdcSaturationFixes(dcdcState, dcdcRes),
    });
  } else if (dcdcRes.saturationCheck.status === 'warning') {
    alerts.push({
      id: 'dcdc-tx-sat-warn',
      severity: 'warning',
      domain: 'dcdc',
      domainLabel: 'DC-DC',
      subTab: 'saturation',
      subTabLabel: 'Core Saturation & BH',
      title: 'Transformer Flux Approaching Core Knee',
      metric: `B_pk = ${dcdcRes.Bpk_mT.toFixed(0)} mT (${dcdcRes.saturationCheck.utilization_100C_pct.toFixed(0)}% of ${dcdcRes.saturationCheck.Bsat_100C_mT.toFixed(0)} mT)`,
      actionHint: `Increase Np ≥ ${dcdcRes.saturationCheck.recommendedMinNp_turns}T for ≥20% high-temp flux headroom.`,
      fixes: synthesizeDcdcSaturationFixes(dcdcState, dcdcRes),
    });
  }

  // 1b. Transformer Winding Window Fit & Reinforced Creepage
  const txCore = CORE_DATABASE.find((c) => c.id === dcdcState.coreId) || dcdcRes.core;
  const autoMarginTape_mm =
    dcdcState.Vin_nom_V >= 300 ? 3.0 : dcdcState.Vin_nom_V >= 150 ? 2.5 : 1.5;
  const autoBobbin_mm = txCore.Ve_mm3 >= 30000 ? 1.3 : txCore.Ve_mm3 >= 12000 ? 1.1 : 0.9;
  const autoGapStrategy: GapStrategyMode =
    dcdcRes.airGap_mm >= 0.45 ? 'distributed-multigap' : 'local-notch';

  const txWindow = computeWindowAnalysis({
    core: txCore,
    Vin_nom_V: dcdcState.Vin_nom_V,
    interleaving: dcdcState.interleaving,
    txType: dcdcState.txType,
    Np: dcdcRes.Np_actual,
    Ns_single: dcdcRes.Ns_actual,
    priStrands: dcdcState.priStrands,
    secStrands: dcdcState.secStrands,
    strandDiam_mm: AWG_DIAM_MM[dcdcState.litzStrandAWG] || 0.1016,
    insulationThickness_mm: dcdcState.insulationThickness_mm,
    airGap_mm: dcdcRes.airGap_mm,
    I_pri_pk: dcdcRes.I_lead_turnoff_A,
    Pcu_W: dcdcRes.Pcu_W,
    marginTape_mm: autoMarginTape_mm,
    bobbinThickness_mm: autoBobbin_mm,
    conductorForm: 'auto-parallel',
    gapStrategy: autoGapStrategy,
  });

  if (!txWindow.fitsInWindow) {
    alerts.push({
      id: 'dcdc-tx-window-overflow',
      severity: 'danger',
      domain: 'dcdc',
      domainLabel: 'DC-DC',
      subTab: 'winding',
      subTabLabel: 'Winding Window',
      title: 'Transformer Bobbin Window Overflow',
      metric: `Build ${txWindow.totalRadialBuild_mm.toFixed(1)} mm / ${txWindow.hw_mm.toFixed(1)} mm (${txWindow.radialFill_pct.toFixed(0)}% fill)`,
      actionHint: txWindow.rootCauseSummary,
      fixes: synthesizeDcdcWindowFixes(dcdcState, dcdcRes),
    });
  } else if (txWindow.isTightMargin) {
    alerts.push({
      id: 'dcdc-tx-window-tight',
      severity: 'warning',
      domain: 'dcdc',
      domainLabel: 'DC-DC',
      subTab: 'winding',
      subTabLabel: 'Winding Window',
      title: 'Tight Transformer Winding Window Fit',
      metric: `Build ${txWindow.totalRadialBuild_mm.toFixed(1)} mm / ${txWindow.hw_mm.toFixed(1)} mm (${txWindow.radialFill_pct.toFixed(0)}% fill)`,
      actionHint: 'Consider flat-ribbon/foil packing or stepping up core height for manufacturing clearance.',
      fixes: synthesizeDcdcWindowFixes(dcdcState, dcdcRes),
    });
  }

  if (!txWindow.creepagePass) {
    alerts.push({
      id: 'dcdc-tx-creepage',
      severity: 'danger',
      domain: 'dcdc',
      domainLabel: 'DC-DC',
      subTab: 'winding',
      subTabLabel: 'Winding Window',
      title: 'Transformer Reinforced Creepage Violation',
      metric: `Actual ${txWindow.actualCreepage_mm.toFixed(1)} mm < ${txWindow.reqCreepage_mm.toFixed(1)} mm IEC req`,
      actionHint: 'Increase margin tape width or select Triple Insulated Wire (TIW) to meet IEC 62368.',
      fixes: synthesizeDcdcWindowFixes(dcdcState, dcdcRes),
    });
  }

  // 1c. Semiconductor Thermal SOA & Runaway
  const tjLimit = dcdcState.Tj_max_limit_C ?? 125;
  if (!dcdcRes.thermalStable || dcdcRes.Tj_pri_C > tjLimit || dcdcRes.Tj_sec_C > tjLimit) {
    alerts.push({
      id: 'dcdc-semi-overtemp',
      severity: 'danger',
      domain: 'dcdc',
      domainLabel: 'DC-DC',
      subTab: 'thermal',
      subTabLabel: 'Electro-Thermal',
      title: 'Semiconductor Junction Over-Temperature',
      metric: `Tj,pri = ${dcdcRes.Tj_pri_C.toFixed(1)}°C · Tj,sec = ${dcdcRes.Tj_sec_C.toFixed(1)}°C (Limit ${tjLimit}°C)`,
      actionHint: 'Lower R_th,heatsink, improve TIM, or increase parallel MOSFET count.',
      fixes: synthesizeDcdcSemiThermalFixes(dcdcState, dcdcRes),
    });
  } else if (Math.max(dcdcRes.Tj_pri_C, dcdcRes.Tj_sec_C) > tjLimit - 15) {
    const hotTj = Math.max(dcdcRes.Tj_pri_C, dcdcRes.Tj_sec_C);
    alerts.push({
      id: 'dcdc-semi-warm',
      severity: 'warning',
      domain: 'dcdc',
      domainLabel: 'DC-DC',
      subTab: 'thermal',
      subTabLabel: 'Electro-Thermal',
      title: 'Semiconductor Approaching Thermal Ceiling',
      metric: `Max Tj = ${hotTj.toFixed(1)}°C (+${(tjLimit - hotTj).toFixed(1)}°C margin to ${tjLimit}°C)`,
      actionHint: 'Tight thermal headroom under high ambient; consider lower R_ds(on) or better cooling.',
      fixes: synthesizeDcdcSemiThermalFixes(dcdcState, dcdcRes),
    });
  }

  // 1d. Magnetic Core Thermal Stability (Steinmetz Equilibrium)
  if (!dcdcRes.coreThermalAnalysis.coreThermalStable || dcdcRes.coreThermalAnalysis.Tcore_hotspot_C > 125) {
    alerts.push({
      id: 'dcdc-core-thermal-danger',
      severity: 'danger',
      domain: 'dcdc',
      domainLabel: 'DC-DC',
      subTab: 'magnetics',
      subTabLabel: 'Tx Magnetics (iGSE)',
      title: 'Transformer Core Over-Temperature / Runaway Risk',
      metric: `T_core,hotspot = ${dcdcRes.coreThermalAnalysis.Tcore_hotspot_C.toFixed(1)}°C (Loop Gain ${dcdcRes.coreThermalAnalysis.coreThermalLoopGain.toFixed(2)})`,
      actionHint: 'Upgrade core, increase Np to cut ΔB, switch to PC95/3C97, or boost Litz strands.',
      fixes: synthesizeDcdcCoreThermalFixes(dcdcState, dcdcRes),
    });
  } else if (dcdcRes.coreThermalAnalysis.Tcore_hotspot_C > 108) {
    alerts.push({
      id: 'dcdc-core-thermal-warn',
      severity: 'warning',
      domain: 'dcdc',
      domainLabel: 'DC-DC',
      subTab: 'magnetics',
      subTabLabel: 'Tx Magnetics (iGSE)',
      title: 'Elevated Transformer Core Hotspot',
      metric: `T_core,hotspot = ${dcdcRes.coreThermalAnalysis.Tcore_hotspot_C.toFixed(1)}°C (P_mag = ${dcdcRes.coreThermalAnalysis.Pmag_total_W.toFixed(1)} W)`,
      actionHint: 'Approaching Steinmetz loss minimum inflection; check forced cooling or strand count.',
      fixes: synthesizeDcdcCoreThermalFixes(dcdcState, dcdcRes),
    });
  }

  if (
    dcdcRes.saturationCheck.utilization_100C_pct < 14 &&
    dcdcRes.Pcu_W > 3.0 * Math.max(0.25, dcdcRes.Pcore_W) &&
    dcdcRes.Pcu_W > 2.2 &&
    dcdcRes.core.Ve_mm3 >= 35000
  ) {
    const compactFixes = synthesizeDcdcCompactCoreFixes(dcdcState, dcdcRes);
    alerts.push({
      id: 'dcdc-core-oversized',
      severity: 'warning',
      domain: 'dcdc',
      domainLabel: 'DC-DC',
      subTab: 'magnetics',
      subTabLabel: 'Tx Magnetics (iGSE)',
      title: 'Oversized Transformer Core (Copper-Loss Dominated)',
      metric: `B_pk = ${dcdcRes.Bpk_mT.toFixed(1)} mT (${dcdcRes.saturationCheck.utilization_100C_pct.toFixed(1)}% B_sat) · P_cu = ${dcdcRes.Pcu_W.toFixed(2)} W vs P_core = ${dcdcRes.Pcore_W.toFixed(2)} W`,
      actionHint:
        'Downsize to a compact core with balanced flux density (~20–45% B_sat) to shorten mean turn length and reduce copper loss.',
      fixes: compactFixes.length > 0 ? compactFixes : undefined,
    });
  }

  // 1e. Primary & Secondary Switch Voltage Breakdown Margin
  const priVdsUtil = (dcdcState.Vin_max_V / Math.max(1, dcdcRes.priDevice.Vds_max_V)) * 100;
  if (priVdsUtil > 90) {
    alerts.push({
      id: 'dcdc-pri-vds-danger',
      severity: 'danger',
      domain: 'dcdc',
      domainLabel: 'DC-DC',
      subTab: 'schematic',
      subTabLabel: 'Schematic & Equations',
      title: 'Primary Switch Voltage Rating Exceeded',
      metric: `Vin,max = ${dcdcState.Vin_max_V} V vs ${dcdcRes.priDevice.Vds_max_V} V rating (${priVdsUtil.toFixed(0)}%)`,
      actionHint: `Replace ${dcdcRes.priDevice.name} with higher V_DS device (≥80% derating needed).`,
      fixes: synthesizeDcdcVoltageFixes('pri', dcdcState, dcdcRes),
    });
  } else if (priVdsUtil > 82) {
    alerts.push({
      id: 'dcdc-pri-vds-warn',
      severity: 'warning',
      domain: 'dcdc',
      domainLabel: 'DC-DC',
      subTab: 'schematic',
      subTabLabel: 'Schematic & Equations',
      title: 'Tight Primary Switch V_DS Derating',
      metric: `Vin,max = ${dcdcState.Vin_max_V} V (${priVdsUtil.toFixed(0)}% of ${dcdcRes.priDevice.Vds_max_V} V)`,
      actionHint: 'Consider higher voltage class primary switch for inductive turn-off spike margin.',
      fixes: synthesizeDcdcVoltageFixes('pri', dcdcState, dcdcRes),
    });
  }

  const secVdsUtil = (dcdcRes.Vsec_overshoot_V / Math.max(1, dcdcRes.secDevice.Vds_max_V)) * 100;
  const secUnclampedUtil = (dcdcRes.Vsec_unclamped_pk_V / Math.max(1, dcdcRes.secDevice.Vds_max_V)) * 100;
  if (secVdsUtil > 90) {
    alerts.push({
      id: 'dcdc-sec-vds-danger',
      severity: 'danger',
      domain: 'dcdc',
      domainLabel: 'DC-DC',
      subTab: 'graphs',
      subTabLabel: 'ZVS & Tank Graphs',
      title: 'Secondary Rectifier Over-Voltage Stress',
      metric: `V_clamp = ${dcdcRes.Vsec_overshoot_V.toFixed(0)} V (${secVdsUtil.toFixed(0)}%) · Unclamped ${dcdcRes.Vsec_unclamped_pk_V.toFixed(0)} V vs ${dcdcRes.secDevice.Vds_max_V} V`,
      actionHint: 'Upgrade secondary MOSFETs to 200 V class (e.g. IPP110N20N3), use Full-Bridge secondary, or tune active clamp.',
      fixes: synthesizeDcdcVoltageFixes('sec', dcdcState, dcdcRes),
    });
  } else if (secVdsUtil > 80 || secUnclampedUtil > 88) {
    alerts.push({
      id: 'dcdc-sec-vds-warn',
      severity: 'warning',
      domain: 'dcdc',
      domainLabel: 'DC-DC',
      subTab: 'graphs',
      subTabLabel: 'ZVS & Tank Graphs',
      title:
        secUnclampedUtil > 98
          ? 'Zero Unclamped Margin on Secondary MOSFETs at High Line'
          : 'Low Unclamped Margin on Secondary MOSFETs at High Line',
      metric: `V_unclamped = ${dcdcRes.Vsec_unclamped_pk_V.toFixed(1)} V (${secUnclampedUtil.toFixed(0)}% of ${dcdcRes.secDevice.Vds_max_V} V) · Clamped ${dcdcRes.Vsec_overshoot_V.toFixed(1)} V`,
      actionHint: 'Upgrade to 200 V secondary MOSFETs for ≥20% margin against clamp fault or load-dump transients.',
      fixes: synthesizeDcdcVoltageFixes('sec', dcdcState, dcdcRes),
    });
  }

  // 1f. ZVS Soft-Switching Loss & Dead-Time Check
  if (!dcdcRes.zvsAchieved) {
    alerts.push({
      id: 'dcdc-zvs-incomplete',
      severity: 'warning',
      domain: 'dcdc',
      domainLabel: 'DC-DC',
      subTab: 'graphs',
      subTabLabel: 'ZVS & Tank Graphs',
      title: dcdcRes.zvsDeadTimeInsufficient
        ? 'Insufficient Dead-Time for Complete ZVS'
        : 'Incomplete Lagging-Leg ZVS (Partial Hard Switching)',
      metric: dcdcRes.zvsDeadTimeInsufficient
        ? `t_dead = ${dcdcState.deadTime_ns} ns < ${dcdcRes.t_dead_zvs_req_ns.toFixed(0)} ns req · V_ds,res = ${dcdcRes.Vds_res_lag_V.toFixed(0)} V`
        : `Tank energy ${dcdcRes.zvsEnergyRatio_pct.toFixed(0)}% · V_ds,res = ${dcdcRes.Vds_res_lag_V.toFixed(0)} V`,
      actionHint: dcdcRes.zvsDeadTimeInsufficient
        ? `Increase dead-time toward ${dcdcRes.t_dead_opt_ns.toFixed(0)} ns so Coss finishes discharging before turn-on.`
        : dcdcRes.isLLC
        ? `Lower L_m to raise I_m,pk or increase dead-time toward ${dcdcRes.t_dead_opt_ns.toFixed(0)} ns.`
        : `Increase L_lk ≥ ${dcdcRes.Llk_crit_fullLoad_uH.toFixed(1)} µH or adjust dead-time toward ${dcdcRes.t_dead_opt_ns.toFixed(0)} ns.`,
      fixes: synthesizeDcdcZvsFixes(dcdcState, dcdcRes),
    });
  }

  // LLC Low-Line Peak Inductive Gain Deficit Check
  if (dcdcRes.isLLC && !dcdcRes.llcRegulatesMinLine) {
    alerts.push({
      id: 'dcdc-llc-gain-deficit',
      severity: dcdcRes.M_peak_zvs < dcdcRes.M_req_max ? 'danger' : 'warning',
      domain: 'dcdc',
      domainLabel: 'DC-DC',
      subTab: 'graphs',
      subTabLabel: 'ZVS & Tank Graphs',
      title:
        dcdcRes.M_peak_zvs < dcdcRes.M_req_max
          ? 'LLC Low-Line Gain Deficit (Cannot Regulate at Vin,min)'
          : 'Tight LLC Low-Line Inductive Gain Margin',
      metric: `M_peak,ZVS = ${dcdcRes.M_peak_zvs.toFixed(2)} vs M_req(${dcdcState.Vin_min_V}V) = ${dcdcRes.M_req_max.toFixed(2)} (${dcdcRes.llcGainMargin_pct.toFixed(1)}% margin)`,
      actionHint: `Lower L_m (reduce L_n = L_m/L_r) or reduce turns ratio n to boost peak inductive gain above M_req.`,
      fixes: synthesizeDcdcLlcGainFixes(dcdcState, dcdcRes),
    });
  }

  // Low-line Duty Cycle Saturation Check
  if (!dcdcRes.isLLC && dcdcRes.D_applied_max > 0.94) {
    const isDropOut = dcdcRes.D_applied_max >= 0.985;
    const ratioCur = dcdcRes.Np_actual / Math.max(1, dcdcRes.Ns_actual);
    const nextNpDuty = Math.max(2, Math.round(dcdcRes.Np_actual * 0.92));
    const nextRatioDuty = Number((nextNpDuty / Math.max(1, dcdcRes.Ns_actual)).toFixed(4));
    alerts.push({
      id: 'dcdc-duty-saturation',
      severity: isDropOut ? 'danger' : 'warning',
      domain: 'dcdc',
      domainLabel: 'DC-DC',
      subTab: 'schematic',
      subTabLabel: 'Schematic & Equations',
      title: isDropOut
        ? 'Low-Line Duty Cycle Saturation (Regulation Dropout)'
        : 'Tight Low-Line Duty Cycle Headroom',
      metric: `D_app(Vin,min) = ${(dcdcRes.D_applied_max * 100).toFixed(1)}% (D_eff ${(dcdcRes.Deff_max * 100).toFixed(1)}% + ΔD ${(dcdcRes.Dloss_max * 100).toFixed(1)}%) at ${dcdcState.Vin_min_V} V`,
      actionHint: `Lower turns ratio n (${ratioCur.toFixed(2)} → ${nextRatioDuty.toFixed(2)}) or reduce leakage L_lk to preserve regulation headroom at ${dcdcState.Vin_min_V} V.`,
      fixes:
        nextNpDuty < dcdcRes.Np_actual
          ? [
              {
                id: 'dcdc-duty-np-reduce',
                label: `Reduce Turns Np = ${dcdcRes.Np_actual} → ${nextNpDuty}T (n = ${nextRatioDuty.toFixed(2)})`,
                impact: 'Lowers required D_eff at Vin,min and restores regulation headroom',
                targetKind: 'dcdc',
                dcdcPatch: { Np_turns: nextNpDuty, turnsRatio_n: nextRatioDuty },
              },
            ]
          : undefined,
    });
  }

  // 1g. Control Loop Stability & Subharmonic Peaking (Nominal & Worst-Case Low-Line)
  const fcFloor = dcdcRes.isLLC
    ? 2.5
    : Math.max(2.5, Number((dcdcRes.f0_lc_kHz * 1.6).toFixed(1)));

  if (
    dcdcState.controlType === 'pcmc' &&
    (!dcdcRes.slopeStable ||
      !dcdcRes.slopeStable_wc ||
      dcdcRes.Qp_subharmonic > 1.8 ||
      dcdcRes.Qp_subharmonic_wc > 1.8)
  ) {
    const mcTarget = Math.max(1.85, Number(dcdcRes.mc_min_recommended.toFixed(2)));
    const isCritSlope =
      !dcdcRes.slopeStable ||
      !dcdcRes.slopeStable_wc ||
      dcdcRes.Qp_subharmonic > 2.0 ||
      dcdcRes.Qp_subharmonic_wc > 2.0;
    alerts.push({
      id: 'dcdc-pcmc-slope',
      severity: isCritSlope ? 'danger' : 'warning',
      domain: 'dcdc',
      domainLabel: 'DC-DC',
      subTab: 'control',
      subTabLabel: 'Control & DSP',
      title: isCritSlope
        ? 'PCMC Subharmonic Oscillation Instability'
        : 'Elevated PCMC Subharmonic Peaking Q_p',
      metric: `Qp(nom) = ${dcdcRes.Qp_subharmonic.toFixed(2)} · Qp(Vin,min) = ${dcdcRes.Qp_subharmonic_wc.toFixed(2)} (mc = ${dcdcState.slopeFactor_mc.toFixed(2)}, Deff max = ${(dcdcRes.Deff_max * 100).toFixed(0)}%)`,
      actionHint: `Increase slope compensation multiplier m_c ≥ ${mcTarget.toFixed(2)} to clamp Ridley Q_p ≤ 1.15–1.25 across ${dcdcState.Vin_min_V}–${dcdcState.Vin_max_V} V.`,
      fixes: [
        {
          id: 'dcdc-slope-fix',
          label: `Set Slope Compensation m_c = ${mcTarget.toFixed(2)}`,
          impact: 'Restores Q_p ≤ 1.25 at both nominal & low-line Vin,min, eliminating subharmonic oscillation',
          targetKind: 'dcdc',
          dcdcPatch: { slopeFactor_mc: mcTarget },
        },
      ],
    });
  }

  if (dcdcRes.pm_actual_deg < 30 || dcdcRes.pm_wc_min_deg < 20 || dcdcRes.gm_actual_dB < 4) {
    const fcRetune = Number(
      Math.min(Math.max(fcFloor, 8), Math.max(fcFloor, dcdcState.fc_target_kHz * 0.65)).toFixed(1)
    );
    alerts.push({
      id: 'dcdc-ctrl-unstable',
      severity: 'danger',
      domain: 'dcdc',
      domainLabel: 'DC-DC',
      subTab: 'control',
      subTabLabel: 'Control & DSP',
      title: 'Control Loop Phase / Gain Margin Critically Low',
      metric: `PM = ${dcdcRes.pm_actual_deg.toFixed(0)}° (WC ${dcdcRes.pm_wc_min_deg.toFixed(0)}°) · GM = ${dcdcRes.gm_actual_dB.toFixed(1)} dB`,
      actionHint: 'Lower crossover frequency fc (staying above f_0) or increase target phase margin to ≥50°.',
      fixes: [
        {
          id: 'dcdc-ctrl-retune',
          label: `Retune Loop: fc = ${fcRetune} kHz & PM = 55°`,
          impact: 'Restores robust phase & gain margin across worst-case tolerances',
          targetKind: 'dcdc',
          dcdcPatch: {
            fc_target_kHz: fcRetune,
            pm_target_deg: 55,
          },
        },
      ],
    });
  } else if (dcdcRes.pm_actual_deg < 45 || dcdcRes.pm_wc_min_deg < 35 || dcdcRes.gm_actual_dB < 6) {
    alerts.push({
      id: 'dcdc-ctrl-marginal',
      severity: 'warning',
      domain: 'dcdc',
      domainLabel: 'DC-DC',
      subTab: 'control',
      subTabLabel: 'Control & DSP',
      title: 'Marginal Control Loop Stability Corner',
      metric: `PM = ${dcdcRes.pm_actual_deg.toFixed(0)}° (WC ${dcdcRes.pm_wc_min_deg.toFixed(0)}°) · GM = ${dcdcRes.gm_actual_dB.toFixed(1)} dB`,
      actionHint: 'Increase phase margin target or reduce f_c slightly for robustness across tolerance.',
      fixes: [
        {
          id: 'dcdc-ctrl-pm-up',
          label: 'Boost Target Phase Margin to 55°',
          impact: 'Raises worst-case corner phase margin safely above 40°',
          targetKind: 'dcdc',
          dcdcPatch: { pm_target_deg: 55 },
        },
      ],
    });
  }

  if (
    !dcdcRes.isLLC &&
    dcdcState.fc_target_kHz < Math.max(dcdcRes.f0_lc_kHz * 1.45, dcdcRes.f0_lc_kHz + 0.4)
  ) {
    const fcTargetNext = Number(
      Math.min(
        dcdcState.fsw_kHz / 6.5,
        Math.max(5.5, Math.round(dcdcRes.f0_lc_kHz * 2.2 * 2) / 2)
      ).toFixed(1)
    );
    alerts.push({
      id: 'dcdc-ctrl-fc-near-f0',
      severity: 'warning',
      domain: 'dcdc',
      domainLabel: 'DC-DC',
      subTab: 'control',
      subTabLabel: 'Control & DSP',
      title: 'Crossover Bandwidth f_c Too Close to Output LC Pole f_0',
      metric: `f_c = ${dcdcState.fc_target_kHz.toFixed(1)} kHz vs f_0 = ${dcdcRes.f0_lc_kHz.toFixed(2)} kHz (${(dcdcState.fc_target_kHz / Math.max(0.1, dcdcRes.f0_lc_kHz)).toFixed(2)}× f_0)`,
      actionHint: `Raise crossover toward ${fcTargetNext.toFixed(1)} kHz (>1.5× f_0) to avoid sluggish load-step recovery.`,
      fixes:
        fcTargetNext > dcdcState.fc_target_kHz + 0.3
          ? [
              {
                id: 'dcdc-ctrl-fc-up',
                label: `Raise Crossover Bandwidth f_c = ${dcdcState.fc_target_kHz.toFixed(1)} → ${fcTargetNext.toFixed(1)} kHz`,
                impact: 'Improves load-step transient recovery while maintaining ≥55° phase margin',
                targetKind: 'dcdc',
                dcdcPatch: { fc_target_kHz: fcTargetNext },
              },
            ]
          : undefined,
    });
  }

  // 1h. Middlebrook Input EMI Impedance Interaction
  if (!dcdcRes.middlebrookStable) {
    const fcNext = Math.max(fcFloor, Number((dcdcState.fc_target_kHz * 0.5).toFixed(1)));
    alerts.push({
      id: 'dcdc-emi-middlebrook',
      severity: dcdcRes.middlebrookMargin_dB < 3 ? 'danger' : 'warning',
      domain: 'dcdc',
      domainLabel: 'DC-DC',
      subTab: 'control',
      subTabLabel: 'Control & Loop',
      title:
        dcdcRes.middlebrookMargin_dB < 3
          ? 'Middlebrook Input Filter Oscillation Risk'
          : 'Tight Middlebrook Input Impedance Margin',
      metric: `ΔZ_MB = ${dcdcRes.middlebrookMargin_dB.toFixed(1)} dB vs L=${dcdcRes.L_emi_uH.toFixed(0)}µH / C=${dcdcRes.C_emi_uF.toFixed(0)}µF (Require ≥ 6.0 dB)`,
      actionHint: `Separate loop bandwidth f_c below EMI filter resonance (or add R_d ≈ ${dcdcRes.Rd_emi_Ohm.toFixed(2)} Ω damping).`,
      fixes:
        fcNext < dcdcState.fc_target_kHz - 0.1
          ? [
              {
                id: 'dcdc-emi-fc-sep',
                label: `Decouple Bandwidth f_c = ${dcdcState.fc_target_kHz.toFixed(1)} → ${fcNext.toFixed(1)} kHz`,
                impact: 'Raises converter closed-loop input impedance above EMI filter resonance peak',
                targetKind: 'dcdc',
                dcdcPatch: { fc_target_kHz: fcNext },
              },
            ]
          : undefined,
    });
  }

  // 1i. All Circuit Inductors in DC-DC Stage
  const dcdcInductors = extractCircuitInductors('dcdc', dcdcState, dcdcRes, acdcState, acdcRes);
  for (const req of dcdcInductors) {
    const cfg = inductorConfigs[req.id];
    const overrides = cfg?.overrides || {};
    const locks = cfg?.locks || DEFAULT_IND_LOCKS;
    const sol = solveCustomInductorDesign(req, overrides, locks);
    if (
      sol.satStatus === 'critical' ||
      sol.windowFitStatus === 'overflow' ||
      sol.T_hotspot_C > 125
    ) {
      const issue =
        sol.satStatus === 'critical'
          ? 'Core Saturation'
          : sol.windowFitStatus === 'overflow'
          ? 'Window Overflow'
          : 'Thermal Overheat';
      alerts.push({
        id: `dcdc-ind-${req.id}`,
        severity: 'danger',
        domain: 'dcdc',
        domainLabel: 'DC-DC',
        subTab: 'all-inductors',
        subTabLabel: 'All Inductors',
        targetItemId: req.id,
        title: `${req.designator} Inductor: ${issue}`,
        metric: `Fill ${sol.windowFill_pct.toFixed(0)}% · B_pk ${sol.B_pk_T.toFixed(2)}/${sol.B_sat_T.toFixed(2)} T · T=${sol.T_hotspot_C.toFixed(0)}°C`,
        actionHint: sol.windowFixes[0]?.title || 'Step up core size, adjust gap, or select COTS alternative.',
        fixes: synthesizeInductorAlertFixes(req, sol, overrides, locks),
      });
    } else if (
      sol.satStatus === 'warning' ||
      sol.windowFitStatus === 'tight' ||
      sol.T_hotspot_C > 105
    ) {
      alerts.push({
        id: `dcdc-ind-warn-${req.id}`,
        severity: 'warning',
        domain: 'dcdc',
        domainLabel: 'DC-DC',
        subTab: 'all-inductors',
        subTabLabel: 'All Inductors',
        targetItemId: req.id,
        title: `${req.designator} Inductor: Tight Design Margin`,
        metric: `Fill ${sol.windowFill_pct.toFixed(0)}% · Sat ${sol.satUtilization_pct.toFixed(0)}% · T=${sol.T_hotspot_C.toFixed(0)}°C`,
        actionHint: sol.windowFixes[0]?.title || 'Inspect flat-ribbon packing or slightly larger core.',
        fixes: synthesizeInductorAlertFixes(req, sol, overrides, locks),
      });
    }
  }

  // 1j. All Circuit Capacitors in DC-DC Stage
  const dcdcCaps = extractCircuitCapacitors('dcdc', dcdcState, dcdcRes, acdcState, acdcRes);
  for (const req of dcdcCaps) {
    const cfg = capacitorConfigs[req.id];
    const overrides = cfg?.overrides || {};
    const locks = cfg?.locks || DEFAULT_CAP_LOCKS;
    const sol = solveCapacitorBank(req, overrides, locks);
    if (sol.status === 'critical') {
      alerts.push({
        id: `dcdc-cap-${req.id}`,
        severity: 'danger',
        domain: 'dcdc',
        domainLabel: 'DC-DC',
        subTab: 'capacitors',
        subTabLabel: 'All Capacitors',
        targetItemId: req.id,
        title: `${req.designator} Bank Critical Stress`,
        metric: `${sol.voltageDerating_pct.toFixed(0)}% V_rated · ${sol.rippleUtilization_pct.toFixed(0)}% I_rms · T=${sol.T_hotspot_C.toFixed(0)}°C`,
        actionHint: sol.statusReason,
        fixes: synthesizeCapacitorAlertFixes(req, sol, overrides, locks),
      });
    } else if (sol.status === 'warning') {
      alerts.push({
        id: `dcdc-cap-warn-${req.id}`,
        severity: 'warning',
        domain: 'dcdc',
        domainLabel: 'DC-DC',
        subTab: 'capacitors',
        subTabLabel: 'All Capacitors',
        targetItemId: req.id,
        title: `${req.designator} Bank Tight Derating / Life`,
        metric: `${sol.voltageDerating_pct.toFixed(0)}% V_rated · ${(sol.L10_life_hrs / 1000).toFixed(1)}k hrs L10`,
        actionHint: sol.statusReason,
        fixes: synthesizeCapacitorAlertFixes(req, sol, overrides, locks),
      });
    }

    // Check Control Loop <-> Physical Output Capacitor Bank (C_o + ESR_Co) Consistency
    if (
      req.id === 'dcdc-out-cap' &&
      (Math.abs(sol.bank_ESR_mOhm - dcdcState.ESR_Co_mOhm) > Math.max(1.2, dcdcState.ESR_Co_mOhm * 0.45) ||
        Math.abs(sol.bank_C_uF - dcdcState.Co_uF) > dcdcState.Co_uF * 0.25)
    ) {
      const syncedCo = Math.max(20, Math.round(sol.bank_C_uF));
      const syncedEsr = Number(Math.max(0.2, sol.bank_ESR_mOhm).toFixed(2));
      alerts.push({
        id: 'dcdc-co-esr-sync',
        severity: 'warning',
        domain: 'dcdc',
        domainLabel: 'DC-DC',
        subTab: 'control',
        subTabLabel: 'Control & DSP',
        targetItemId: req.id,
        title: 'Output C_o / ESR Out of Sync Between BOM & Control Loop',
        metric: `BOM ${sol.bank_C_uF.toFixed(0)}µF / ${sol.bank_ESR_mOhm.toFixed(2)}mΩ vs Loop ${dcdcState.Co_uF}µF / ${dcdcState.ESR_Co_mOhm}mΩ`,
        actionHint: 'Sync solved physical C_o capacitance & ESR into control-loop f_z,esr and ripple equations.',
        fixes: [
          {
            id: 'dcdc-sync-co-esr',
            label: `Sync C_o = ${syncedCo} µF & ESR = ${syncedEsr} mΩ to Control Loop`,
            impact: 'Eliminates f_z,esr and output ripple discrepancies across BOM & Bode analysis',
            targetKind: 'dcdc',
            dcdcPatch: { Co_uF: syncedCo, ESR_Co_mOhm: syncedEsr },
          },
        ],
      });
    }
  }

  // ==========================================================================
  // 2. AC-DC PFC STAGE CHECKS
  // ==========================================================================

  // 2a. PFC Boost Inductor Saturation
  if (acdcRes.saturationCheck.status === 'critical') {
    alerts.push({
      id: 'acdc-pfc-sat',
      severity: 'danger',
      domain: 'acdc',
      domainLabel: 'AC-DC',
      subTab: 'magnetics',
      subTabLabel: 'PFC DC-Bias Curves',
      title: 'PFC Boost Inductor Saturation Exceeded',
      metric: `B_pk = ${acdcRes.Bpk_total_T.toFixed(2)} T (${acdcRes.saturationCheck.utilization_koolMu_pct.toFixed(0)}% of 1.05 T)`,
      actionHint: 'Upgrade to High-Flux 60µ core (1.50 T), reduce Lpfc, or split across 2 interleaved phases.',
      fixes: synthesizeAcDcFixes('acdc-pfc-sat', acdcState, acdcRes),
    });
  } else if (acdcRes.saturationCheck.status === 'warning') {
    alerts.push({
      id: 'acdc-pfc-sat-warn',
      severity: 'warning',
      domain: 'acdc',
      domainLabel: 'AC-DC',
      subTab: 'magnetics',
      subTabLabel: 'PFC DC-Bias Curves',
      title: 'PFC Boost Inductor Near Saturation Knee',
      metric: `B_pk = ${acdcRes.Bpk_total_T.toFixed(2)} T (${acdcRes.saturationCheck.utilization_koolMu_pct.toFixed(0)}% of 1.05 T)`,
      actionHint: 'Verify inductance roll-off at brownout low-line peak current.',
      fixes: synthesizeAcDcFixes('acdc-pfc-sat-warn', acdcState, acdcRes),
    });
  }

  // 2b. PFC Switch Voltage & Thermal Limits
  const acdcVdsUtil = (acdcState.Vdc_bus_V / Math.max(1, acdcRes.sw.Vds_max_V)) * 100;
  if (acdcVdsUtil > 90) {
    alerts.push({
      id: 'acdc-vds-danger',
      severity: 'danger',
      domain: 'acdc',
      domainLabel: 'AC-DC',
      subTab: 'schematic',
      subTabLabel: 'Schematic & Variants',
      title: 'PFC Fast-Switch Voltage Rating Exceeded',
      metric: `V_dc,bus = ${acdcState.Vdc_bus_V} V vs ${acdcRes.sw.Vds_max_V} V rating (${acdcVdsUtil.toFixed(0)}%)`,
      actionHint: 'Select 900V/1200V SiC MOSFET or reduce V_dc,bus setpoint.',
      fixes: synthesizeAcDcFixes('acdc-vds-danger', acdcState, acdcRes),
    });
  } else if (acdcVdsUtil > 80) {
    alerts.push({
      id: 'acdc-vds-warn',
      severity: 'warning',
      domain: 'acdc',
      domainLabel: 'AC-DC',
      subTab: 'schematic',
      subTabLabel: 'Schematic & Variants',
      title: 'Tight PFC Fast-Switch V_DS Derating',
      metric: `V_dc,bus = ${acdcState.Vdc_bus_V} V (${acdcVdsUtil.toFixed(0)}% of ${acdcRes.sw.Vds_max_V} V)`,
      actionHint: 'Ensure ≥20% margin for bus overshoot and commutation stray ringing.',
      fixes: synthesizeAcDcFixes('acdc-vds-warn', acdcState, acdcRes),
    });
  }

  if (acdcRes.Tj_fast_C > 125) {
    alerts.push({
      id: 'acdc-tj-danger',
      severity: 'danger',
      domain: 'acdc',
      domainLabel: 'AC-DC',
      subTab: 'efficiency',
      subTabLabel: 'Efficiency & Thermal',
      title: 'PFC Fast-Leg Junction Over-Temperature',
      metric: `T_j,fast = ${acdcRes.Tj_fast_C.toFixed(1)}°C > 125°C ceiling`,
      actionHint: 'Switch to lower R_ds(on) SiC/GaN device, reduce f_sw, or use 2-phase interleaving.',
      fixes: synthesizeAcDcFixes('acdc-tj-danger', acdcState, acdcRes),
    });
  } else if (acdcRes.Tj_fast_C > 108) {
    alerts.push({
      id: 'acdc-tj-warn',
      severity: 'warning',
      domain: 'acdc',
      domainLabel: 'AC-DC',
      subTab: 'efficiency',
      subTabLabel: 'Efficiency & Thermal',
      title: 'Elevated PFC Switch Junction Temperature',
      metric: `T_j,fast = ${acdcRes.Tj_fast_C.toFixed(1)}°C (P_loss = ${acdcRes.Ptotal_loss_W.toFixed(1)} W)`,
      actionHint: 'Verify heatsink airflow at Vac_min low-line full load.',
      fixes: synthesizeAcDcFixes('acdc-tj-warn', acdcState, acdcRes),
    });
  }

  // 2c. Earth Leakage Current (IEC 62368-1 Touch Current)
  const customCy_nF = acdcState.Cy_nF ?? acdcRes.Cy_each_nF;
  const earthLeak_mA =
    2 * Math.PI * acdcState.f_line_Hz * acdcState.Vac_max_V * (customCy_nF * 1e-9) * 1e3;
  if (earthLeak_mA > 3.5) {
    alerts.push({
      id: 'acdc-earth-leak-danger',
      severity: 'danger',
      domain: 'acdc',
      domainLabel: 'AC-DC',
      subTab: 'emi',
      subTabLabel: 'EMI & Earth Leakage',
      title: 'PE Earth Leakage Exceeds IEC 62368-1 Limit',
      metric: `I_leak = ${earthLeak_mA.toFixed(2)} mA > 3.50 mA max (Cy = ${customCy_nF} nF)`,
      actionHint: 'Reduce Y2 capacitor Cy_nF or increase Common-Mode choke L_CM inductance.',
      fixes: synthesizeAcDcFixes('acdc-earth-leak-danger', acdcState, acdcRes),
    });
  } else if (earthLeak_mA > 0.75) {
    alerts.push({
      id: 'acdc-earth-leak-warn',
      severity: 'warning',
      domain: 'acdc',
      domainLabel: 'AC-DC',
      subTab: 'emi',
      subTabLabel: 'EMI & Earth Leakage',
      title: 'PE Leakage Above Handheld 0.75 mA Limit',
      metric: `I_leak = ${earthLeak_mA.toFixed(2)} mA (Class I industrial < 3.5 mA OK)`,
      actionHint: 'Acceptable for grounded chassis; reduce Cy ≤ 2.2 nF if medical/portable class needed.',
      fixes: synthesizeAcDcFixes('acdc-earth-leak-warn', acdcState, acdcRes),
    });
  }

  // 2d. DC-Link Hold-Up Time & Capacitor Life
  const capAmbient = acdcState.capAmbient_C ?? 45;
  const capHotspot_C = capAmbient + acdcRes.capTempRise_C;
  const capLife_hrs = Math.min(250000, 8000 * Math.pow(2, (105 - capHotspot_C) / 10));
  if (acdcRes.tHold_actual_ms < acdcState.tHold_ms * 0.85 || capHotspot_C > 105) {
    alerts.push({
      id: 'acdc-dclink-danger',
      severity: 'danger',
      domain: 'acdc',
      domainLabel: 'AC-DC',
      subTab: 'dc-link',
      subTabLabel: 'All Capacitors & Life',
      title:
        capHotspot_C > 105
          ? 'DC-Link Capacitor Over-Temperature (>105°C)'
          : 'DC-Link Hold-Up Time Deficit',
      metric: `t_hold = ${acdcRes.tHold_actual_ms.toFixed(1)} ms (req ${acdcState.tHold_ms} ms) · Th = ${capHotspot_C.toFixed(0)}°C`,
      actionHint: `Increase C_dc ≥ ${Math.ceil(acdcRes.Cdc_req_holdup_uF)} µF or add parallel caps to lower ESR heating.`,
      fixes: synthesizeAcDcFixes('acdc-dclink-danger', acdcState, acdcRes),
    });
  } else if (acdcRes.tHold_actual_ms < acdcState.tHold_ms || capLife_hrs < 25000) {
    alerts.push({
      id: 'acdc-dclink-warn',
      severity: 'warning',
      domain: 'acdc',
      domainLabel: 'AC-DC',
      subTab: 'dc-link',
      subTabLabel: 'All Capacitors & Life',
      title: 'Tight DC-Link Hold-Up or Capacitor L10 Life',
      metric: `t_hold = ${acdcRes.tHold_actual_ms.toFixed(1)}/${acdcState.tHold_ms} ms · L10 = ${(capLife_hrs / 1000).toFixed(1)}k hrs`,
      actionHint: 'Increase bulk C_dc or lower cap ambient/ESR for >25k-hour service life.',
      fixes: synthesizeAcDcFixes('acdc-dclink-warn', acdcState, acdcRes),
    });
  }

  // 2e. PFC Harmonics & THD
  const failedHarmonics = acdcRes.harmonicSpectrum.filter((h) => !h.pass);
  if (acdcRes.THD_est_pct > 8.0 || failedHarmonics.length > 0) {
    alerts.push({
      id: 'acdc-thd-warn',
      severity: acdcRes.THD_est_pct > 10 ? 'danger' : 'warning',
      domain: 'acdc',
      domainLabel: 'AC-DC',
      subTab: 'harmonics',
      subTabLabel: 'Harmonics & ZCD',
      title:
        failedHarmonics.length > 0
          ? `IEC 61000-3 Harmonic Limit Miss (${failedHarmonics.length} orders)`
          : 'Elevated Input Current THD',
      metric: `THDi = ${acdcRes.THD_est_pct.toFixed(2)}% · PF = ${acdcRes.powerFactor_true.toFixed(4)}`,
      actionHint: 'Lower outer voltage loop fc,v ≤ 15 Hz or increase C_dc to reduce 2f_line 3rd-harmonic injection.',
      fixes: synthesizeAcDcFixes('acdc-thd-warn', acdcState, acdcRes),
    });
  }

  // 2f. PFC Inner / Outer Control Stability
  if (acdcRes.pm_i_actual_deg < 30 || acdcRes.pm_v_actual_deg < 30) {
    alerts.push({
      id: 'acdc-ctrl-danger',
      severity: 'danger',
      domain: 'acdc',
      domainLabel: 'AC-DC',
      subTab: 'control',
      subTabLabel: 'Control & DSP',
      title: 'PFC Control Loop Phase Margin Critically Low',
      metric: `Inner PM = ${acdcRes.pm_i_actual_deg.toFixed(0)}° · Outer PM = ${acdcRes.pm_v_actual_deg.toFixed(0)}°`,
      actionHint: 'Increase target phase margin ≥ 50° or widen sampling-to-crossover ratio.',
      fixes: synthesizeAcDcFixes('acdc-ctrl-danger', acdcState, acdcRes),
    });
  } else if (acdcRes.pm_i_actual_deg < 45 || acdcRes.pm_v_actual_deg < 45 || acdcState.fc_v_Hz > 25) {
    alerts.push({
      id: 'acdc-ctrl-warn',
      severity: 'warning',
      domain: 'acdc',
      domainLabel: 'AC-DC',
      subTab: 'control',
      subTabLabel: 'Control & DSP',
      title:
        acdcState.fc_v_Hz > 25
          ? 'Outer Voltage Loop Too Fast (>25 Hz) — Injects 3rd Harmonic'
          : 'Marginal PFC Loop Phase Margin',
      metric: `fc,v = ${acdcState.fc_v_Hz} Hz · PM_i = ${acdcRes.pm_i_actual_deg.toFixed(0)}° · PM_v = ${acdcRes.pm_v_actual_deg.toFixed(0)}°`,
      actionHint: 'Keep outer voltage loop fc,v in 10–22 Hz band with ≥45° phase margin.',
      fixes: synthesizeAcDcFixes('acdc-ctrl-warn', acdcState, acdcRes),
    });
  }

  // 2g. All Inductors in AC-DC Stage
  const acdcInductors = extractCircuitInductors('acdc', dcdcState, dcdcRes, acdcState, acdcRes);
  for (const req of acdcInductors) {
    const cfg = inductorConfigs[req.id];
    const overrides = cfg?.overrides || {};
    const locks = cfg?.locks || DEFAULT_IND_LOCKS;
    const sol = solveCustomInductorDesign(req, overrides, locks);
    if (
      sol.satStatus === 'critical' ||
      sol.windowFitStatus === 'overflow' ||
      sol.T_hotspot_C > 125
    ) {
      const issue =
        sol.satStatus === 'critical'
          ? 'Core Saturation'
          : sol.windowFitStatus === 'overflow'
          ? 'Window Overflow'
          : 'Thermal Overheat';
      alerts.push({
        id: `acdc-ind-${req.id}`,
        severity: 'danger',
        domain: 'acdc',
        domainLabel: 'AC-DC',
        subTab: 'all-inductors',
        subTabLabel: 'All Inductors',
        targetItemId: req.id,
        title: `${req.designator} Inductor: ${issue}`,
        metric: `Fill ${sol.windowFill_pct.toFixed(0)}% · B_pk ${sol.B_pk_T.toFixed(2)}/${sol.B_sat_T.toFixed(2)} T · T=${sol.T_hotspot_C.toFixed(0)}°C`,
        actionHint: sol.windowFixes[0]?.title || 'Step up core size or pick COTS inductor.',
        fixes: synthesizeInductorAlertFixes(req, sol, overrides, locks),
      });
    } else if (
      sol.satStatus === 'warning' ||
      sol.windowFitStatus === 'tight' ||
      sol.T_hotspot_C > 105
    ) {
      alerts.push({
        id: `acdc-ind-warn-${req.id}`,
        severity: 'warning',
        domain: 'acdc',
        domainLabel: 'AC-DC',
        subTab: 'all-inductors',
        subTabLabel: 'All Inductors',
        targetItemId: req.id,
        title: `${req.designator} Inductor: Tight Window / Margin`,
        metric: `Fill ${sol.windowFill_pct.toFixed(0)}% · Sat ${sol.satUtilization_pct.toFixed(0)}% · T=${sol.T_hotspot_C.toFixed(0)}°C`,
        actionHint: sol.windowFixes[0]?.title || 'Review strand count or step up toroid OD.',
        fixes: synthesizeInductorAlertFixes(req, sol, overrides, locks),
      });
    }
  }

  // 2h. All Capacitors in AC-DC Stage
  const acdcCaps = extractCircuitCapacitors('acdc', dcdcState, dcdcRes, acdcState, acdcRes);
  for (const req of acdcCaps) {
    const cfg = capacitorConfigs[req.id];
    const overrides = cfg?.overrides || {};
    const locks = cfg?.locks || DEFAULT_CAP_LOCKS;
    const sol = solveCapacitorBank(req, overrides, locks);
    if (sol.status === 'critical') {
      alerts.push({
        id: `acdc-cap-${req.id}`,
        severity: 'danger',
        domain: 'acdc',
        domainLabel: 'AC-DC',
        subTab: 'dc-link',
        subTabLabel: 'All Capacitors & Life',
        targetItemId: req.id,
        title: `${req.designator} Bank Critical Stress`,
        metric: `${sol.voltageDerating_pct.toFixed(0)}% V_rated · ${sol.rippleUtilization_pct.toFixed(0)}% I_rms · T=${sol.T_hotspot_C.toFixed(0)}°C`,
        actionHint: sol.statusReason,
        fixes: synthesizeCapacitorAlertFixes(req, sol, overrides, locks),
      });
    } else if (sol.status === 'warning') {
      alerts.push({
        id: `acdc-cap-warn-${req.id}`,
        severity: 'warning',
        domain: 'acdc',
        domainLabel: 'AC-DC',
        subTab: 'dc-link',
        subTabLabel: 'All Capacitors & Life',
        targetItemId: req.id,
        title: `${req.designator} Bank Tight Derating / Life`,
        metric: `${sol.voltageDerating_pct.toFixed(0)}% V_rated · ${(sol.L10_life_hrs / 1000).toFixed(1)}k hrs L10`,
        actionHint: sol.statusReason,
        fixes: synthesizeCapacitorAlertFixes(req, sol, overrides, locks),
      });
    }
  }

  const danger = alerts.filter((a) => a.severity === 'danger');
  const warning = alerts.filter((a) => a.severity === 'warning');

  return {
    all: [...danger, ...warning],
    danger,
    warning,
  };
}
