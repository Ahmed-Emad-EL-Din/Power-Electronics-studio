import { DcDcDesignState } from '../data/databases';
import { solveDcDcDesign } from './dcdcEngine';

export interface MonteCarloConfig {
  numTrials: number;
  tolL_pct: number;
  tolC_pct: number;
  tolEsr_pct: number;
  tolVin_pct: number;
  tambJitter_C: number;
  tolTempRise_pct: number;
  seed?: number;
}

export interface MetricStats {
  label: string;
  unit: string;
  mean: number;
  std: number;
  min: number;
  p05: number;
  p50: number;
  p95: number;
  max: number;
  specLimitLabel?: string;
}

export interface HistogramBin {
  xStart: number;
  xEnd: number;
  xMid: number;
  count: number;
  passCount: number;
  failCount: number;
}

export interface SensitivityDriver {
  parameter: string;
  impactOnYieldPct: number;
  correlationEff: number;
  correlationTj: number;
}

export interface MonteCarloTrialRow {
  trial: number;
  efficiency_pct: number;
  Tj_max_C: number;
  satUtil_pct: number;
  pm_deg: number;
  Qp_wc: number;
  Vout_ripple_mVpp: number;
  zvsPct: number;
  passed: boolean;
  failReasons: string[];
}

export interface MonteCarloResult {
  config: MonteCarloConfig;
  numTrials: number;
  passCount: number;
  failCount: number;
  yield_pct: number;
  failBreakdown: Record<string, number>;
  stats: {
    efficiency_pct: MetricStats;
    Tj_max_C: MetricStats;
    satUtil_pct: MetricStats;
    pm_deg: MetricStats;
    Vout_ripple_mVpp: MetricStats;
    zvsPct: MetricStats;
  };
  histograms: {
    efficiency_pct: HistogramBin[];
    Tj_max_C: HistogramBin[];
    pm_deg: HistogramBin[];
    satUtil_pct: HistogramBin[];
  };
  sensitivities: SensitivityDriver[];
  worstTrial: MonteCarloTrialRow | null;
}

function createMulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sampleTruncatedNormal(rng: () => number): number {
  const u1 = Math.max(1e-7, rng());
  const u2 = rng();
  const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  return Math.max(-3.0, Math.min(3.0, z)) / 3.0; // Normalized to [-1, +1] at 3-sigma
}

function computeStats(label: string, unit: string, values: number[], specLimitLabel?: string): MetricStats {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length || 1;
  const mean = sorted.reduce((acc, v) => acc + v, 0) / n;
  const variance = sorted.reduce((acc, v) => acc + (v - mean) * (v - mean), 0) / n;
  const std = Math.sqrt(variance);
  const q = (p: number) => sorted[Math.min(n - 1, Math.max(0, Math.floor(p * (n - 1))))];
  return {
    label,
    unit,
    mean: Number(mean.toFixed(2)),
    std: Number(std.toFixed(2)),
    min: Number(sorted[0].toFixed(2)),
    p05: Number(q(0.05).toFixed(2)),
    p50: Number(q(0.5).toFixed(2)),
    p95: Number(q(0.95).toFixed(2)),
    max: Number(sorted[n - 1].toFixed(2)),
    specLimitLabel,
  };
}

function buildHistogram(values: number[], passedFlags: boolean[], bins = 16): HistogramBin[] {
  if (values.length === 0) return [];
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const span = Math.max(1e-3, maxVal - minVal);
  const step = span / bins;
  const result: HistogramBin[] = [];
  for (let b = 0; b < bins; b++) {
    const xStart = minVal + b * step;
    const xEnd = xStart + step;
    result.push({
      xStart: Number(xStart.toFixed(2)),
      xEnd: Number(xEnd.toFixed(2)),
      xMid: Number(((xStart + xEnd) / 2).toFixed(2)),
      count: 0,
      passCount: 0,
      failCount: 0,
    });
  }
  for (let i = 0; i < values.length; i++) {
    const idx = Math.min(bins - 1, Math.max(0, Math.floor((values[i] - minVal) / step)));
    result[idx].count++;
    if (passedFlags[i]) result[idx].passCount++;
    else result[idx].failCount++;
  }
  return result;
}

function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 3) return 0;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const vx = xs[i] - mx;
    const vy = ys[i] - my;
    num += vx * vy;
    dx += vx * vx;
    dy += vy * vy;
  }
  const denom = Math.sqrt(dx * dy);
  return denom > 1e-9 ? Number((num / denom).toFixed(3)) : 0;
}

export function runMonteCarloAnalysis(
  baseState: DcDcDesignState,
  config?: Partial<MonteCarloConfig>
): MonteCarloResult {
  const cfg: MonteCarloConfig = {
    numTrials: Math.max(40, Math.min(1000, config?.numTrials ?? 200)),
    tolL_pct: config?.tolL_pct ?? 10,
    tolC_pct: config?.tolC_pct ?? 20,
    tolEsr_pct: config?.tolEsr_pct ?? 25,
    tolVin_pct: config?.tolVin_pct ?? 5,
    tambJitter_C: config?.tambJitter_C ?? 8,
    tolTempRise_pct: config?.tolTempRise_pct ?? 12,
    seed: config?.seed ?? 1337,
  };

  const rng = createMulberry32(cfg.seed ?? 1337);
  const tjLimit = baseState.Tj_max_limit_C ?? 125;
  const vRippleLimit_mV = Math.max(250, baseState.Vout_V * 1000 * 0.025);

  const trials: MonteCarloTrialRow[] = [];
  const zSamples = {
    L: [] as number[],
    C: [] as number[],
    ESR: [] as number[],
    Vin: [] as number[],
    Tamb: [] as number[],
    Rth: [] as number[],
  };
  const failBreakdown: Record<string, number> = {
    'Over-Temp (Tj > Limit)': 0,
    'Core Saturation (> 85%)': 0,
    'Low Phase Margin (< 40°)': 0,
    'Subharmonic Qp (> 1.8)': 0,
    'Output Ripple (> 2.5%)': 0,
  };

  let passCount = 0;
  let worstTrial: MonteCarloTrialRow | null = null;

  for (let t = 0; t < cfg.numTrials; t++) {
    const zL = sampleTruncatedNormal(rng);
    const zC = sampleTruncatedNormal(rng);
    const zEsr = sampleTruncatedNormal(rng);
    const zVin = sampleTruncatedNormal(rng);
    const zTamb = sampleTruncatedNormal(rng);
    const zRth = sampleTruncatedNormal(rng);

    zSamples.L.push(zL);
    zSamples.C.push(zC);
    zSamples.ESR.push(zEsr);
    zSamples.Vin.push(zVin);
    zSamples.Tamb.push(zTamb);
    zSamples.Rth.push(zRth);

    const mulL = 1 + zL * (cfg.tolL_pct / 100);
    const mulC = 1 + zC * (cfg.tolC_pct / 100);
    const mulEsr = 1 + zEsr * (cfg.tolEsr_pct / 100);
    const mulVin = 1 + zVin * (cfg.tolVin_pct / 100);
    const mulRth = 1 + zRth * (cfg.tolTempRise_pct / 100);

    const sampledState: DcDcDesignState = {
      ...baseState,
      Llk_uH: Math.max(0.4, baseState.Llk_uH * mulL),
      Lm_uH: Math.max(30, baseState.Lm_uH * mulL),
      Lo_uH: Math.max(0.5, baseState.Lo_uH * mulL),
      Co_uF: Math.max(10, baseState.Co_uF * mulC),
      ESR_Co_mOhm: Math.max(0.2, baseState.ESR_Co_mOhm * mulEsr),
      Vin_nom_V: Math.max(baseState.Vin_min_V, Math.min(baseState.Vin_max_V, baseState.Vin_nom_V * mulVin)),
      Tamb_C: Math.max(-20, baseState.Tamb_C + zTamb * cfg.tambJitter_C),
      Rth_heatsink_CW: Math.max(0.08, baseState.Rth_heatsink_CW * mulRth),
    };

    const res = solveDcDcDesign(sampledState);
    const Tj_max_C = Math.max(res.Tj_pri_C, res.Tj_sec_C);
    const satUtil_pct = res.saturationCheck.utilization_100C_pct;
    const pm_deg = res.pm_actual_deg;
    const Qp_wc = res.Qp_subharmonic_wc;
    const Vout_ripple_mVpp = res.Vout_ripple_mVpp;
    const zvsPct = res.zvsEnergyRatio_pct;

    const failReasons: string[] = [];
    if (Tj_max_C > tjLimit) {
      failReasons.push('Over-Temp (Tj > Limit)');
      failBreakdown['Over-Temp (Tj > Limit)']++;
    }
    if (satUtil_pct > 85) {
      failReasons.push('Core Saturation (> 85%)');
      failBreakdown['Core Saturation (> 85%)']++;
    }
    if (pm_deg < 40) {
      failReasons.push('Low Phase Margin (< 40°)');
      failBreakdown['Low Phase Margin (< 40°)']++;
    }
    if (baseState.controlType === 'pcmc' && Qp_wc > 1.8) {
      failReasons.push('Subharmonic Qp (> 1.8)');
      failBreakdown['Subharmonic Qp (> 1.8)']++;
    }
    if (Vout_ripple_mVpp > vRippleLimit_mV) {
      failReasons.push('Output Ripple (> 2.5%)');
      failBreakdown['Output Ripple (> 2.5%)']++;
    }

    const passed = failReasons.length === 0;
    if (passed) passCount++;

    const row: MonteCarloTrialRow = {
      trial: t + 1,
      efficiency_pct: Number(res.efficiency_pct.toFixed(2)),
      Tj_max_C: Number(Tj_max_C.toFixed(1)),
      satUtil_pct: Number(satUtil_pct.toFixed(1)),
      pm_deg: Number(pm_deg.toFixed(1)),
      Qp_wc: Number(Qp_wc.toFixed(2)),
      Vout_ripple_mVpp: Number(Vout_ripple_mVpp.toFixed(1)),
      zvsPct: Number(zvsPct.toFixed(1)),
      passed,
      failReasons,
    };

    if (!worstTrial || row.failReasons.length > worstTrial.failReasons.length || (row.failReasons.length === worstTrial.failReasons.length && row.Tj_max_C > worstTrial.Tj_max_C)) {
      worstTrial = row;
    }

    trials.push(row);
  }

  const effArr = trials.map((r) => r.efficiency_pct);
  const tjArr = trials.map((r) => r.Tj_max_C);
  const satArr = trials.map((r) => r.satUtil_pct);
  const pmArr = trials.map((r) => r.pm_deg);
  const ripArr = trials.map((r) => r.Vout_ripple_mVpp);
  const zvsArr = trials.map((r) => r.zvsPct);
  const passFlags = trials.map((r) => r.passed);

  const sensitivities: SensitivityDriver[] = [
    {
      parameter: `Inductance ±${cfg.tolL_pct}%`,
      impactOnYieldPct: Number((Math.abs(pearson(zSamples.L, passFlags.map(Number))) * 100).toFixed(1)),
      correlationEff: pearson(zSamples.L, effArr),
      correlationTj: pearson(zSamples.L, tjArr),
    },
    {
      parameter: `Capacitance ±${cfg.tolC_pct}%`,
      impactOnYieldPct: Number((Math.abs(pearson(zSamples.C, passFlags.map(Number))) * 100).toFixed(1)),
      correlationEff: pearson(zSamples.C, effArr),
      correlationTj: pearson(zSamples.C, tjArr),
    },
    {
      parameter: `Cap ESR ±${cfg.tolEsr_pct}%`,
      impactOnYieldPct: Number((Math.abs(pearson(zSamples.ESR, passFlags.map(Number))) * 100).toFixed(1)),
      correlationEff: pearson(zSamples.ESR, effArr),
      correlationTj: pearson(zSamples.ESR, tjArr),
    },
    {
      parameter: `Line Vin ±${cfg.tolVin_pct}%`,
      impactOnYieldPct: Number((Math.abs(pearson(zSamples.Vin, passFlags.map(Number))) * 100).toFixed(1)),
      correlationEff: pearson(zSamples.Vin, effArr),
      correlationTj: pearson(zSamples.Vin, tjArr),
    },
    {
      parameter: `Ambient ±${cfg.tambJitter_C}°C`,
      impactOnYieldPct: Number((Math.abs(pearson(zSamples.Tamb, passFlags.map(Number))) * 100).toFixed(1)),
      correlationEff: pearson(zSamples.Tamb, effArr),
      correlationTj: pearson(zSamples.Tamb, tjArr),
    },
    {
      parameter: `Heatsink Rθ ±${cfg.tolTempRise_pct}%`,
      impactOnYieldPct: Number((Math.abs(pearson(zSamples.Rth, passFlags.map(Number))) * 100).toFixed(1)),
      correlationEff: pearson(zSamples.Rth, effArr),
      correlationTj: pearson(zSamples.Rth, tjArr),
    },
  ].sort((a, b) => b.impactOnYieldPct - a.impactOnYieldPct);

  return {
    config: cfg,
    numTrials: cfg.numTrials,
    passCount,
    failCount: cfg.numTrials - passCount,
    yield_pct: Number(((passCount / cfg.numTrials) * 100).toFixed(1)),
    failBreakdown,
    stats: {
      efficiency_pct: computeStats('Efficiency', '%', effArr),
      Tj_max_C: computeStats('Max Junction Temp', '°C', tjArr, `<= ${tjLimit}°C`),
      satUtil_pct: computeStats('Core Flux Utilization', '%', satArr, '<= 85%'),
      pm_deg: computeStats('Phase Margin', '°', pmArr, '>= 40°'),
      Vout_ripple_mVpp: computeStats('Output Ripple', 'mVpp', ripArr, `<= ${vRippleLimit_mV.toFixed(0)} mV`),
      zvsPct: computeStats('ZVS Energy Ratio', '%', zvsArr, '>= 100%'),
    },
    histograms: {
      efficiency_pct: buildHistogram(effArr, passFlags),
      Tj_max_C: buildHistogram(tjArr, passFlags),
      pm_deg: buildHistogram(pmArr, passFlags),
      satUtil_pct: buildHistogram(satArr, passFlags),
    },
    sensitivities,
    worstTrial,
  };
}
