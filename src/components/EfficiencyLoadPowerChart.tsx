import React, { useState, useMemo } from 'react';
import { DcDcDesignState } from '../data/databases';
import { DcDcResults } from '../engine/dcdcEngine';
import { MathFormula } from './MathFormula';
import { InteractiveChart } from './InteractiveChart';
import { useDesignSolver } from './DesignSolverContext';
import { TrendingUp, Zap, Flame, Layers, Award, Sliders } from 'lucide-react';

interface EfficiencyLoadPowerChartProps {
  state: DcDcDesignState;
  res: DcDcResults;
  pinnedRes?: DcDcResults | null;
  onChange?: (next: DcDcDesignState) => void;
}

export interface LoadPowerEfficiencyPoint {
  loadPct: number;
  Pout_W: number;
  Iout_A: number;
  eff_active_pct: number;
  eff_alt_rect_pct: number;
  eff_cold25C_pct: number;
  eff_pinned_pct?: number;
  Ploss_total_W: number;
  Psemi_cond_W: number;
  Psemi_sw_gate_W: number;
  Psemi_total_W: number;
  Pmag_core_W: number;
  Pmag_cu_W: number;
  Pmag_total_W: number;
  Psnub_W: number;
  zvsActive: boolean;
}

export const EfficiencyLoadPowerChart: React.FC<EfficiencyLoadPowerChartProps> = ({
  state,
  res,
  pinnedRes,
  onChange,
}) => {
  const { setDcdcField } = useDesignSolver();
  const [chartView, setChartView] = useState<'combined' | 'efficiency-only' | 'loss-stack'>('combined');
  const [maxOverloadPct, setMaxOverloadPct] = useState<number>(125);
  const [show80PlusTitanium, setShow80PlusTitanium] = useState<boolean>(true);

  const analysis = useMemo(() => {
    const P_rated_W = Math.max(50, state.Pout_W);
    const Vout = Math.max(1, state.Vout_V);
    const fsw_Hz = state.fsw_kHz * 1e3;
    const Llk_H = state.Llk_uH * 1e-6;
    const nPhases = res.nPhases;

    const points: LoadPowerEfficiencyPoint[] = [];
    let peakEff_pct = 0;
    let peakEffPower_W = P_rated_W * 0.5;
    let peakEffLoad_pct = 50;

    const stepPct = 2.5;
    const numSteps = Math.round(maxOverloadPct / stepPct);

    for (let i = 2; i <= numSteps; i++) {
      const loadPct = Number((i * stepPct).toFixed(1));
      const k = loadPct / 100;
      const P_load_W = Number((P_rated_W * k).toFixed(1));
      const I_load_A = Number((P_load_W / Vout).toFixed(2));

      // 1. Light-Load Lagging-Leg ZVS Tank Energy Check
      const iLagAtLoad_A = res.I_lag_turnoff_A * k;
      const eAvailAtLoad_uJ = 0.5 * Llk_H * iLagAtLoad_A * iLagAtLoad_A * 1e6;
      const zvsFraction = Math.min(1, eAvailAtLoad_uJ / Math.max(res.E_oss_lag_uJ, 0.01));
      const lightLoadZvsPenalty_W =
        (1 - zvsFraction) * (2 * fsw_Hz * (res.E_oss_lag_uJ * 1e-6) * nPhases);

      // 2. Magnetic Losses (iGSE Core Loss + Dowell AC Copper Winding Loss)
      // Core loss is primarily voltage-driven (slight flux ripple increase with load)
      const Pmag_core_W = res.Pcore_W * (0.96 + 0.04 * k);
      // Copper loss scales with I^2 and slight winding temperature rise factor
      const cuTempScale = 1 + 0.00393 * Math.max(0, (res.Tcore_C - state.Tamb_C) * k * k * 0.45);
      const Pmag_cu_W = res.Pcu_W * k * k * cuTempScale;
      const Pmag_total_W = Pmag_core_W + Pmag_cu_W;

      // 3. Primary Semiconductor Conduction & Switching Losses
      // Include thermal Rds,on(Tj) scaling between 25°C baseline and full-load equilibrium Tj
      const thermalRdsMultiplier =
        res.Pcond_pri_25C_W > 0.01
          ? 1 + (res.Pcond_pri_W / res.Pcond_pri_25C_W - 1) * Math.min(1.5, k * k)
          : 1.0;
      const Pcond_pri_k_W = res.Pcond_pri_25C_W * k * k * thermalRdsMultiplier;

      const Psw_pri_active_k_W =
        res.Pgate_pri_W +
        res.Poss_hyst_pri_W +
        lightLoadZvsPenalty_W +
        (res.Psw_on_pri_W + res.Psw_off_pri_W + res.Pdt_body_pri_W + res.Prr_pri_W) *
          (0.25 * k + 0.75 * k * k);

      // 4. Secondary Rectifier Losses (Sync MOSFET SR vs Schottky Diode Comparison)
      const Psec_sync_k_W =
        res.Pcond_sec_ch_W * k * k +
        (res.Pdt_body_sec_W + res.Prr_sec_W) * k +
        res.Pgate_sec_W;

      const nSecDevices = state.txType === 'full-bridge' ? 4 : 2;
      const Psec_diode_k_W =
        nSecDevices *
        (0.82 * (res.Iout_phase_A * k * 0.5) +
          Math.pow(res.Isec_rms_per_dev_A * k, 2) * 0.013) *
        nPhases;

      const Psec_active_k_W = state.rectMode === 'sync-fet' ? Psec_sync_k_W : Psec_diode_k_W;
      const Psec_alt_k_W = state.rectMode === 'sync-fet' ? Psec_diode_k_W : Psec_sync_k_W;

      const Psemi_cond_W =
        Pcond_pri_k_W +
        (state.rectMode === 'sync-fet' ? res.Pcond_sec_ch_W * k * k : Psec_diode_k_W * 0.85);
      const Psemi_sw_gate_W =
        Psw_pri_active_k_W +
        (state.rectMode === 'sync-fet'
          ? (res.Pdt_body_sec_W + res.Prr_sec_W) * k + res.Pgate_sec_W
          : Psec_diode_k_W * 0.15);
      const Psemi_total_W = Psemi_cond_W + Psemi_sw_gate_W;

      // 5. Snubber / Clamp Loss
      const Psnub_k_W = res.Psnub_W * (0.35 + 0.65 * k * k);

      // Total Losses & Efficiencies
      const Ploss_total_W = Pmag_total_W + Psemi_total_W + Psnub_k_W;
      const Ploss_alt_W = Pmag_total_W + Pcond_pri_k_W + Psw_pri_active_k_W + Psec_alt_k_W + Psnub_k_W;
      const Ploss_cold25C_W =
        Pmag_core_W +
        res.Pcu_W * k * k +
        res.Pcond_pri_25C_W * k * k +
        res.Pcond_sec_25C_W * k * k +
        Psemi_sw_gate_W * 0.88 +
        Psnub_k_W;

      const eff_active_pct = Number(((P_load_W / (P_load_W + Ploss_total_W)) * 100).toFixed(2));
      const eff_alt_rect_pct = Number(((P_load_W / (P_load_W + Ploss_alt_W)) * 100).toFixed(2));
      const eff_cold25C_pct = Number(((P_load_W / (P_load_W + Ploss_cold25C_W)) * 100).toFixed(2));

      const eff_pinned_pct = pinnedRes
        ? Number(pinnedRes.evaluators.evalEfficiency(loadPct).y1.toFixed(2))
        : undefined;

      if (eff_active_pct > peakEff_pct) {
        peakEff_pct = eff_active_pct;
        peakEffPower_W = P_load_W;
        peakEffLoad_pct = loadPct;
      }

      points.push({
        loadPct,
        Pout_W: P_load_W,
        Iout_A: I_load_A,
        eff_active_pct,
        eff_alt_rect_pct,
        eff_cold25C_pct,
        eff_pinned_pct,
        Ploss_total_W: Number(Ploss_total_W.toFixed(2)),
        Psemi_cond_W: Number(Psemi_cond_W.toFixed(2)),
        Psemi_sw_gate_W: Number(Psemi_sw_gate_W.toFixed(2)),
        Psemi_total_W: Number(Psemi_total_W.toFixed(2)),
        Pmag_core_W: Number(Pmag_core_W.toFixed(2)),
        Pmag_cu_W: Number(Pmag_cu_W.toFixed(2)),
        Pmag_total_W: Number(Pmag_total_W.toFixed(2)),
        Psnub_W: Number(Psnub_k_W.toFixed(2)),
        zvsActive: loadPct >= res.P_min_zvs_pct,
      });
    }

    const findAtPct = (targetPct: number) =>
      points.reduce((prev, curr) =>
        Math.abs(curr.loadPct - targetPct) < Math.abs(prev.loadPct - targetPct) ? curr : prev
      );

    const pt10 = findAtPct(10);
    const pt20 = findAtPct(20);
    const pt30 = findAtPct(30);
    const pt50 = findAtPct(50);
    const pt75 = findAtPct(75);
    const pt100 = findAtPct(100);

    // California Energy Commission (CEC) Weighted Efficiency
    const cecWeightedEff_pct = Number(
      (
        0.04 * pt10.eff_active_pct +
        0.05 * pt20.eff_active_pct +
        0.12 * pt30.eff_active_pct +
        0.21 * pt50.eff_active_pct +
        0.53 * pt75.eff_active_pct +
        0.05 * pt100.eff_active_pct
      ).toFixed(2)
    );

    // Theoretical optimal load power where Fixed Losses (Core + Gate/Coss) = Quadratic I^2*R Losses (Semi Cond + Winding Cu)
    const P_fixed_nom_W =
      res.Pcore_W + res.Pgate_pri_W + res.Pgate_sec_W + res.Poss_hyst_pri_W + res.Psnub_W * 0.35;
    const P_quad_nom_W = Math.max(
      1.0,
      res.Pcond_pri_W + res.Pcond_sec_W + res.Pcu_W + res.Psw_pri_W * 0.75
    );
    const k_opt_theory = Math.min(1.25, Math.max(0.15, Math.sqrt(P_fixed_nom_W / P_quad_nom_W)));
    const P_opt_theory_W = Number((P_rated_W * k_opt_theory).toFixed(0));

    const evalAtPowerW = (pRaw: number) => {
      const P_load_W = Math.max(10, pRaw);
      const k = P_load_W / P_rated_W;
      const loadPct = Number((k * 100).toFixed(1));
      const I_load_A = Number((P_load_W / Vout).toFixed(2));

      const iLagAtLoad_A = res.I_lag_turnoff_A * k;
      const eAvailAtLoad_uJ = 0.5 * Llk_H * iLagAtLoad_A * iLagAtLoad_A * 1e6;
      const zvsFraction = Math.min(1, eAvailAtLoad_uJ / Math.max(res.E_oss_lag_uJ, 0.01));
      const lightLoadZvsPenalty_W =
        (1 - zvsFraction) * (2 * fsw_Hz * (res.E_oss_lag_uJ * 1e-6) * nPhases);

      const Pmag_core_W = res.Pcore_W * (0.96 + 0.04 * k);
      const cuTempScale = 1 + 0.00393 * Math.max(0, (res.Tcore_C - state.Tamb_C) * k * k * 0.45);
      const Pmag_cu_W = res.Pcu_W * k * k * cuTempScale;
      const Pmag_total_W = Pmag_core_W + Pmag_cu_W;

      const thermalRdsMultiplier =
        res.Pcond_pri_25C_W > 0.01
          ? 1 + (res.Pcond_pri_W / res.Pcond_pri_25C_W - 1) * Math.min(1.5, k * k)
          : 1.0;
      const Pcond_pri_k_W = res.Pcond_pri_25C_W * k * k * thermalRdsMultiplier;

      const Psw_pri_active_k_W =
        res.Pgate_pri_W +
        res.Poss_hyst_pri_W +
        lightLoadZvsPenalty_W +
        (res.Psw_on_pri_W + res.Psw_off_pri_W + res.Pdt_body_pri_W + res.Prr_pri_W) *
          (0.25 * k + 0.75 * k * k);

      const Psec_sync_k_W =
        res.Pcond_sec_ch_W * k * k +
        (res.Pdt_body_sec_W + res.Prr_sec_W) * k +
        res.Pgate_sec_W;

      const nSecDevices = state.txType === 'full-bridge' ? 4 : 2;
      const Psec_diode_k_W =
        nSecDevices *
        (0.82 * (res.Iout_phase_A * k * 0.5) +
          Math.pow(res.Isec_rms_per_dev_A * k, 2) * 0.013) *
        nPhases;

      const Psec_alt_k_W = state.rectMode === 'sync-fet' ? Psec_diode_k_W : Psec_sync_k_W;

      const Psemi_cond_W =
        Pcond_pri_k_W +
        (state.rectMode === 'sync-fet' ? res.Pcond_sec_ch_W * k * k : Psec_diode_k_W * 0.85);
      const Psemi_sw_gate_W =
        Psw_pri_active_k_W +
        (state.rectMode === 'sync-fet'
          ? (res.Pdt_body_sec_W + res.Prr_sec_W) * k + res.Pgate_sec_W
          : Psec_diode_k_W * 0.15);
      const Psemi_total_W = Psemi_cond_W + Psemi_sw_gate_W;
      const Psnub_k_W = res.Psnub_W * (0.35 + 0.65 * k * k);

      const Ploss_total_W = Pmag_total_W + Psemi_total_W + Psnub_k_W;
      const Ploss_alt_W = Pmag_total_W + Pcond_pri_k_W + Psw_pri_active_k_W + Psec_alt_k_W + Psnub_k_W;
      const Ploss_cold25C_W =
        Pmag_core_W +
        res.Pcu_W * k * k +
        res.Pcond_pri_25C_W * k * k +
        res.Pcond_sec_25C_W * k * k +
        Psemi_sw_gate_W * 0.88 +
        Psnub_k_W;

      return {
        Pout_W: Number(P_load_W.toFixed(1)),
        loadPct,
        Iout_A: I_load_A,
        eff_active_pct: Number(((P_load_W / (P_load_W + Ploss_total_W)) * 100).toFixed(2)),
        eff_alt_rect_pct: Number(((P_load_W / (P_load_W + Ploss_alt_W)) * 100).toFixed(2)),
        eff_cold25C_pct: Number(((P_load_W / (P_load_W + Ploss_cold25C_W)) * 100).toFixed(2)),
        Ploss_total_W: Number(Ploss_total_W.toFixed(2)),
        Psemi_cond_W: Number(Psemi_cond_W.toFixed(2)),
        Psemi_sw_gate_W: Number(Psemi_sw_gate_W.toFixed(2)),
        Psemi_total_W: Number(Psemi_total_W.toFixed(2)),
        Pmag_core_W: Number(Pmag_core_W.toFixed(2)),
        Pmag_cu_W: Number(Pmag_cu_W.toFixed(2)),
        Pmag_total_W: Number(Pmag_total_W.toFixed(2)),
      };
    };

    return {
      points,
      peakEff_pct,
      peakEffPower_W,
      peakEffLoad_pct,
      cecWeightedEff_pct,
      P_opt_theory_W,
      pt10,
      pt20,
      pt50,
      pt75,
      pt100,
      P_zvs_min_W: Number(((res.P_min_zvs_pct / 100) * P_rated_W).toFixed(0)),
      evalAtPowerW,
    };
  }, [state, res, pinnedRes, maxOverloadPct]);

  return (
    <div className="bg-white dark:bg-[#14171f] border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-4">
      {/* HEADER BAR */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <TrendingUp className="w-4 h-4 text-blue-400" />
            <h3 className="text-sm font-bold font-mono text-slate-900 dark:text-slate-100">
              Estimated Efficiency (η) &amp; Decomposed Loss vs. Load Power Curve (Recharts)
            </h3>
            <span className="px-2 py-0.5 text-[11px] font-mono font-semibold rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 inline-flex items-center gap-1">
              <Award className="w-3.5 h-3.5" /> Peak η = {analysis.peakEff_pct.toFixed(2)}% @ {analysis.peakEffPower_W} W ({analysis.peakEffLoad_pct}% Load)
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Couples <strong className="text-amber-400">Semiconductor Conduction &amp; Switching Losses</strong> (
            {res.priDevice.id} + {res.secDevice.id}) with{' '}
            <strong className="text-purple-400">Magnetic Core (iGSE) &amp; Winding (1D Dowell) Losses</strong> (
            {res.core.name} · {res.material.name}) across output load power <span className="font-mono">P_out (W)</span>.
          </p>
        </div>

        {/* View Mode Selector & Controls */}
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              { id: 'combined', label: 'Dual-Axis: Efficiency (%) + Loss Breakdown (W)' },
              { id: 'efficiency-only', label: 'Efficiency Curve + 80 PLUS Benchmarks' },
              { id: 'loss-stack', label: 'Semiconductor vs Magnetic Loss Stack (W)' },
            ] as const
          ).map((mode) => (
            <button
              key={mode.id}
              type="button"
              onClick={() => setChartView(mode.id)}
              className={`px-2.5 py-1 text-[11px] font-mono rounded border transition-colors cursor-pointer ${
                chartView === mode.id
                  ? 'bg-blue-600 text-white border-blue-500 font-semibold'
                  : 'bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-slate-700'
              }`}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI SUMMARY CARDS */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-2.5">
        <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800">
          <div className="text-[10px] font-mono uppercase text-slate-400">Peak Efficiency Point</div>
          <div className="text-base font-mono font-bold text-emerald-400 tabular-nums">
            {analysis.peakEff_pct.toFixed(2)}%
          </div>
          <div className="text-[11px] font-mono text-slate-400">
            At P_out = <strong className="text-slate-200">{analysis.peakEffPower_W} W</strong> ({analysis.peakEffLoad_pct}%)
          </div>
        </div>

        <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800">
          <div className="text-[10px] font-mono uppercase text-slate-400">100% Rated Power ({state.Pout_W} W)</div>
          <div className="text-base font-mono font-bold text-blue-400 tabular-nums">
            {analysis.pt100.eff_active_pct.toFixed(2)}%
          </div>
          <div className="text-[11px] font-mono text-slate-400">
            Total Loss = <strong className="text-amber-400">{analysis.pt100.Ploss_total_W.toFixed(1)} W</strong>
          </div>
        </div>

        <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800">
          <div className="text-[10px] font-mono uppercase text-slate-400">CEC Weighted Efficiency</div>
          <div className="text-base font-mono font-bold text-purple-400 tabular-nums">
            {analysis.cecWeightedEff_pct.toFixed(2)}%
          </div>
          <div className="text-[11px] font-mono text-slate-400">
            20%: {analysis.pt20.eff_active_pct.toFixed(1)}% | 50%: {analysis.pt50.eff_active_pct.toFixed(1)}%
          </div>
        </div>

        <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800">
          <div className="text-[10px] font-mono uppercase text-amber-400 flex items-center gap-1">
            <Flame className="w-3 h-3" /> Semiconductor Loss (100%)
          </div>
          <div className="text-base font-mono font-bold text-amber-400 tabular-nums">
            {analysis.pt100.Psemi_total_W.toFixed(1)} W
          </div>
          <div className="text-[11px] font-mono text-slate-400">
            Cond: {analysis.pt100.Psemi_cond_W.toFixed(1)}W | Sw+Gate: {analysis.pt100.Psemi_sw_gate_W.toFixed(1)}W
          </div>
        </div>

        <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800">
          <div className="text-[10px] font-mono uppercase text-blue-400 flex items-center gap-1">
            <Layers className="w-3 h-3" /> Magnetic Loss (100%)
          </div>
          <div className="text-base font-mono font-bold text-blue-300 tabular-nums">
            {analysis.pt100.Pmag_total_W.toFixed(1)} W
          </div>
          <div className="text-[11px] font-mono text-slate-400">
            Core (iGSE): {analysis.pt100.Pmag_core_W.toFixed(1)}W | Cu (AC): {analysis.pt100.Pmag_cu_W.toFixed(1)}W
          </div>
        </div>
      </div>

      {/* RECHARTS INTERACTIVE VISUALIZATION CONTAINER */}
      <div className="bg-slate-950 border border-slate-800 rounded-lg p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex flex-wrap items-center gap-3 text-xs font-mono text-slate-300">
            <span className="inline-flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-blue-400" />
              Load Sweep Range: <strong>{(state.Pout_W * 0.05).toFixed(0)} W</strong> to{' '}
              <strong>{((state.Pout_W * maxOverloadPct) / 100).toFixed(0)} W</strong> ({maxOverloadPct}% Load)
            </span>
            <div className="inline-flex items-center gap-1">
              {[100, 125, 150].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => setMaxOverloadPct(pct)}
                  className={`px-2 py-0.5 text-[10px] rounded border cursor-pointer ${
                    maxOverloadPct === pct
                      ? 'bg-blue-500/20 border-blue-500 text-blue-300 font-bold'
                      : 'bg-slate-900 border-slate-800 text-slate-400'
                  }`}
                >
                  Max {pct}%
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono">
            <label className="inline-flex items-center gap-1.5 text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={show80PlusTitanium}
                onChange={(e) => setShow80PlusTitanium(e.target.checked)}
                className="rounded accent-emerald-500"
              />
              Show 96% (80 PLUS Titanium 50%-Load Target)
            </label>
            {onChange && (
              <button
                type="button"
                onClick={() =>
                  setDcdcField(
                    'rectMode',
                    state.rectMode === 'sync-fet' ? 'schottky-diode' : 'sync-fet'
                  )
                }
                className="px-2.5 py-0.5 rounded bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/40 text-purple-300 cursor-pointer"
              >
                Toggle Rectifier ({state.rectMode === 'sync-fet' ? 'Sync MOSFET → Diode' : 'Diode → Sync MOSFET'})
              </button>
            )}
          </div>
        </div>

        <InteractiveChart
          title={
            chartView === 'combined'
              ? 'Dual-Axis Efficiency η (%) & Decomposed Power Loss vs. Output Power P_out (W)'
              : chartView === 'efficiency-only'
              ? 'Converter Efficiency η (%) vs. Output Power P_out (W) + 80 PLUS Titanium Benchmark'
              : 'Decomposed Semiconductor & Magnetic Power Losses (W) vs. Output Power P_out (W)'
          }
          subtitle={`Peak η = ${analysis.peakEff_pct.toFixed(2)}% @ ${analysis.peakEffPower_W} W (${analysis.peakEffLoad_pct}% Load) · Min ZVS Power = ${analysis.P_zvs_min_W} W`}
          data={analysis.points}
          xKey="Pout_W"
          xLabel="P_out"
          xUnit="W"
          domainEvaluator={analysis.evalAtPowerW}
          currentX={state.Pout_W}
          currentXLabel={`100% Rated (${state.Pout_W}W)`}
          verticalMarkers={[
            {
              x: analysis.P_zvs_min_W,
              label: `Min ZVS (${analysis.P_zvs_min_W}W)`,
              color: '#f43f5e',
              dashed: true,
            },
            {
              x: analysis.peakEffPower_W,
              label: `Peak η (${analysis.peakEffPower_W}W)`,
              color: '#10b981',
              dashed: true,
            },
          ]}
          horizontalMarkers={
            show80PlusTitanium && chartView !== 'loss-stack'
              ? [
                  {
                    value: 96.0,
                    label: '80+ Titanium 50% Target (96.0%)',
                    color: '#22d3ee',
                    axis: 'left',
                    dashed: true,
                  },
                ]
              : []
          }
          series={
            chartView === 'combined'
              ? [
                  {
                    key: 'eff_active_pct',
                    name: `Active η (${state.rectMode === 'sync-fet' ? 'Sync MOSFET' : 'Diode'}, Hot Tj)`,
                    unit: '%',
                    color: '#10b981',
                    axis: 'left',
                  },
                  {
                    key: 'eff_cold25C_pct',
                    name: '25°C Cold Junction η',
                    unit: '%',
                    color: '#06b6d4',
                    axis: 'left',
                    dashed: true,
                  },
                  {
                    key: 'eff_alt_rect_pct',
                    name: `Alt Rectifier η (${state.rectMode === 'sync-fet' ? 'Diode' : 'Sync MOSFET'})`,
                    unit: '%',
                    color: '#c084fc',
                    axis: 'left',
                    dashed: true,
                  },
                  {
                    key: 'Ploss_total_W',
                    name: 'Total Loss P_loss',
                    unit: 'W',
                    color: '#f59e0b',
                    axis: 'right',
                  },
                  {
                    key: 'Psemi_total_W',
                    name: 'Semiconductor Loss',
                    unit: 'W',
                    color: '#f43f5e',
                    axis: 'right',
                    dashed: true,
                  },
                  {
                    key: 'Pmag_total_W',
                    name: 'Magnetic Loss (Core+Cu)',
                    unit: 'W',
                    color: '#38bdf8',
                    axis: 'right',
                    dashed: true,
                  },
                ]
              : chartView === 'efficiency-only'
              ? [
                  {
                    key: 'eff_active_pct',
                    name: `Active η (${state.rectMode === 'sync-fet' ? 'Sync MOSFET' : 'Diode'}, Hot Tj)`,
                    unit: '%',
                    color: '#10b981',
                    axis: 'left',
                  },
                  {
                    key: 'eff_cold25C_pct',
                    name: '25°C Cold Junction η',
                    unit: '%',
                    color: '#06b6d4',
                    axis: 'left',
                    dashed: true,
                  },
                  {
                    key: 'eff_alt_rect_pct',
                    name: `Alt Rectifier η (${state.rectMode === 'sync-fet' ? 'Diode' : 'Sync MOSFET'})`,
                    unit: '%',
                    color: '#c084fc',
                    axis: 'left',
                    dashed: true,
                  },
                ]
              : [
                  {
                    key: 'Ploss_total_W',
                    name: 'Total Power Loss',
                    unit: 'W',
                    color: '#f43f5e',
                    axis: 'left',
                  },
                  {
                    key: 'Psemi_cond_W',
                    name: 'Semi Conduction Loss I²Rds(Tj)',
                    unit: 'W',
                    color: '#f59e0b',
                    axis: 'left',
                  },
                  {
                    key: 'Psemi_sw_gate_W',
                    name: 'Semi Switching + Gate + ZVS Loss',
                    unit: 'W',
                    color: '#ec4899',
                    axis: 'left',
                    dashed: true,
                  },
                  {
                    key: 'Pmag_cu_W',
                    name: 'Mag Copper Loss (1D Dowell)',
                    unit: 'W',
                    color: '#a855f7',
                    axis: 'right',
                  },
                  {
                    key: 'Pmag_core_W',
                    name: 'Mag Core Loss (iGSE)',
                    unit: 'W',
                    color: '#38bdf8',
                    axis: 'right',
                    dashed: true,
                  },
                ]
          }
        />
      </div>

      {/* BOTTOM ROW: MULTI-LOAD EFFICIENCY & LOSS BREAKDOWN TABLE + PEAK EFFICIENCY EQUATION */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <div className="xl:col-span-4 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-lg p-3.5 space-y-2">
          <div className="text-[13px] font-medium text-slate-900 dark:text-[#eef0f5] flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-blue-500" /> Peak Efficiency Load Law
          </div>
          <div className="p-2.5 rounded bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
            <MathFormula tex="\eta(P_{\text{out}}) = \frac{P_{\text{out}}}{P_{\text{out}} + P_{\text{fixed}} + k_{\text{load}}^2 P_{\text{quad}}(T_j)}" />
          </div>
          <div className="p-2.5 rounded bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
            <MathFormula tex="\frac{\partial \eta}{\partial P_{\text{out}}} = 0 \implies P_{\text{opt}} = P_{\text{rated}}\sqrt{\frac{P_{\text{core}} + P_{\text{gate}} + P_{\text{oss}}}{P_{\text{cond,semi}} + P_{\text{cu,mag}}}}" />
          </div>
          <p className="text-[11px] font-mono text-slate-400 leading-relaxed">
            Maximum efficiency occurs where <strong className="text-blue-300">load-independent losses</strong> (iGSE core loss + gate drive + C_oss) equal <strong className="text-amber-300">quadratic I²R conduction &amp; winding losses</strong> (theoretical P_opt ≈ {analysis.P_opt_theory_W} W).
          </p>
        </div>

        <div className="xl:col-span-8 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-lg p-3.5">
          <div className="text-[13px] font-medium text-slate-900 dark:text-[#eef0f5] mb-2">
            Standard Load-Point Efficiency &amp; Semiconductor / Magnetic Loss Audit (10% – 100% Rated Power)
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs font-mono">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                  <th className="py-1.5 pr-3">Load Point</th>
                  <th className="py-1.5 pr-3">Output Power</th>
                  <th className="py-1.5 pr-3">Output Current</th>
                  <th className="py-1.5 pr-3">Semi Cond + Sw</th>
                  <th className="py-1.5 pr-3">Mag Core + Cu</th>
                  <th className="py-1.5 pr-3">Total Loss</th>
                  <th className="py-1.5 pr-3">Active η (Hot)</th>
                  <th className="py-1.5">25°C Cold η</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800/70">
                {[analysis.pt10, analysis.pt20, analysis.pt50, analysis.pt75, analysis.pt100].map(
                  (pt) => (
                    <tr key={pt.loadPct} className="hover:bg-slate-900/40">
                      <td className="py-2 pr-3 font-bold text-slate-200">
                        {pt.loadPct.toFixed(0)}% Load
                      </td>
                      <td className="py-2 pr-3 text-blue-300 font-semibold">{pt.Pout_W.toFixed(0)} W</td>
                      <td className="py-2 pr-3 text-slate-400">{pt.Iout_A.toFixed(1)} A</td>
                      <td className="py-2 pr-3 text-amber-300">
                        {pt.Psemi_total_W.toFixed(1)} W{' '}
                        <span className="text-[10px] text-slate-500">
                          ({pt.Psemi_cond_W.toFixed(1)}+{pt.Psemi_sw_gate_W.toFixed(1)})
                        </span>
                      </td>
                      <td className="py-2 pr-3 text-purple-300">
                        {pt.Pmag_total_W.toFixed(1)} W{' '}
                        <span className="text-[10px] text-slate-500">
                          ({pt.Pmag_core_W.toFixed(1)}+{pt.Pmag_cu_W.toFixed(1)})
                        </span>
                      </td>
                      <td className="py-2 pr-3 font-semibold text-rose-400">
                        {pt.Ploss_total_W.toFixed(1)} W
                      </td>
                      <td className="py-2 pr-3 font-bold text-emerald-400">
                        {pt.eff_active_pct.toFixed(2)}%
                      </td>
                      <td className="py-2 text-blue-400">{pt.eff_cold25C_pct.toFixed(2)}%</td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
