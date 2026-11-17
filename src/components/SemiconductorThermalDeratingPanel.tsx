import React, { useMemo } from 'react';
import { DcDcDesignState } from '../data/databases';
import { DcDcResults } from '../engine/dcdcEngine';
import { MathFormula } from './MathFormula';
import { InteractiveChart } from './InteractiveChart';
import { LockToggleButton } from './AutoSolverControls';
import { useDesignSolver } from './DesignSolverContext';
import {
  Flame,
  ShieldCheck,
  AlertTriangle,
  Thermometer,
  Zap,
  Layers,
  Cpu,
} from 'lucide-react';

interface SemiconductorThermalDeratingPanelProps {
  state: DcDcDesignState;
  res: DcDcResults;
  onChange: (next: DcDcDesignState) => void;
}

const HEATSINK_PRESETS: { label: string; rth: number; desc: string }[] = [
  { label: 'Liquid Cold-Plate', rth: 0.12, desc: '0.12 °C/W · Glycol/Water Cold-Plate' },
  { label: 'Forced-Air Finned', rth: 0.45, desc: '0.45 °C/W · 400 LFM Ducted Extrusion' },
  { label: 'Standard Heatsink', rth: 1.0, desc: '1.00 °C/W · Chassis Extruded Sink' },
  { label: 'Natural Convection', rth: 2.2, desc: '2.20 °C/W · Passive Finned Heatsink' },
  { label: 'PCB Copper Only', rth: 3.6, desc: '3.60 °C/W · 2oz Thermal Via Plane' },
];

const TIM_PRESETS: { label: string; rth: number }[] = [
  { label: 'Phase-Change (0.08)', rth: 0.08 },
  { label: 'AlN Ceramic (0.15)', rth: 0.15 },
  { label: 'Silicone Pad (0.35)', rth: 0.35 },
  { label: 'Mica + Grease (0.60)', rth: 0.6 },
];

export const SemiconductorThermalDeratingPanel: React.FC<
  SemiconductorThermalDeratingPanelProps
> = ({ state, res, onChange }) => {
  const rthTim = state.Rth_TIM_CW ?? 0.15;
  const tjLimit = state.Tj_max_limit_C ?? 150;
  const nPriSwitches = state.topology === 'llc-hb' ? 2 : 4;
  const nPhases = state.topology === 'psfb-2ph' ? 2 : 1;
  const totalPriPositions = nPriSwitches * nPhases;

  const { dcdcLocked, toggleDcdcLock, dcdcChanges, setDcdcField: setField } = useDesignSolver();
  const isAuto = (k: keyof typeof dcdcLocked) => dcdcChanges.some((c) => c.key === k);

  // Helper to solve self-consistent primary conduction & switching loss for any (Rth_hs, Tamb)
  const solvePriAtRthAndTamb = useMemo(() => {
    const dev = res.priDevice;
    const alpha_sw =
      dev.tech === 'GaN HEMT' ? 0.0018 : dev.tech === 'SiC MOSFET' ? 0.0024 : 0.0038;

    return (rth_hs_CW: number, tamb_C: number) => {
      const rth_pos = dev.Rth_JC_CW + rthTim + Math.max(0.02, rth_hs_CW);
      let tj = tamb_C + 20;
      let pCond = res.Pcond_pri_25C_W;
      let pSw = res.Psw_pri_25C_W;

      for (let it = 0; it < 10; it++) {
        const dT = tj - 25;
        const rdsMult = Math.max(
          0.65,
          1 + dev.alpha_R_per_C * dT + 1.8e-5 * dT * Math.max(0, dT)
        );
        pCond = res.Pcond_pri_25C_W * rdsMult;

        // Switching + Reverse Recovery thermal scaling
        const swOverlap25 = Math.max(0, res.Psw_pri_25C_W - res.Poss_hyst_pri_W - res.Pgate_pri_W);
        const swMult = Math.max(0.82, 1 + (alpha_sw + 0.0012) * dT);
        pSw = swOverlap25 * swMult + res.Poss_hyst_pri_W + res.Pgate_pri_W;

        const pTot = pCond + pSw;
        const pPerPos = pTot / totalPriPositions;
        tj = Math.min(280, tamb_C + pPerPos * rth_pos);
      }

      const pTot = pCond + pSw;
      const pPerPos = pTot / totalPriPositions;
      const tSink = tamb_C + pPerPos * rth_hs_CW;
      const tCase = tSink + pPerPos * rthTim;

      return {
        rth_hs_CW,
        tamb_C,
        tj_C: tj,
        tCase_C: tCase,
        tSink_C: tSink,
        pCond_W: pCond,
        pSw_W: pSw,
        pTot_W: pTot,
      };
    };
  }, [
    res.priDevice,
    res.Pcond_pri_25C_W,
    res.Psw_pri_25C_W,
    res.Poss_hyst_pri_W,
    res.Pgate_pri_W,
    rthTim,
    totalPriPositions,
  ]);

  const evalRthPoint = useMemo(() => {
    return (rthRaw: number) => {
      const rth = Math.max(0.01, rthRaw);
      const pt = solvePriAtRthAndTamb(rth, state.Tamb_C);
      return {
        rth_hs_CW: Number(rth.toFixed(2)),
        pTot_W: Number(pt.pTot_W.toFixed(2)),
        pCond_W: Number(pt.pCond_W.toFixed(2)),
        pSw_W: Number(pt.pSw_W.toFixed(2)),
        tj_C: Number(pt.tj_C.toFixed(1)),
      };
    };
  }, [solvePriAtRthAndTamb, state.Tamb_C]);

  // Sweep 1: Heatsink Thermal Resistance Rth_hs from 0.05 to 4.0 °C/W at current Tamb
  const rthSweepPoints = useMemo(() => {
    const N = 60;
    const pts = [];
    for (let i = 0; i <= N; i++) {
      const rth = 0.05 + (3.95 * i) / N;
      pts.push(evalRthPoint(rth));
    }
    return pts;
  }, [evalRthPoint]);

  const evalDeratingPoint = useMemo(() => {
    const dev = res.priDevice;
    const alpha_sw =
      dev.tech === 'GaN HEMT' ? 0.0018 : dev.tech === 'SiC MOSFET' ? 0.0024 : 0.0038;
    const dT_lim = tjLimit - 25;
    const rdsMultLim = Math.max(
      0.65,
      1 + dev.alpha_R_per_C * dT_lim + 1.8e-5 * dT_lim * Math.max(0, dT_lim)
    );
    const swMultLim = Math.max(0.82, 1 + (alpha_sw + 0.0012) * dT_lim);

    const pCondAtNomLoad_Lim = res.Pcond_pri_25C_W * rdsMultLim;
    const swOverlap25 = Math.max(0, res.Psw_pri_25C_W - res.Poss_hyst_pri_W - res.Pgate_pri_W);
    const pSwVarAtNomLoad_Lim = swOverlap25 * swMultLim;
    const pFixed_Lim = res.Poss_hyst_pri_W + res.Pgate_int_pri_W;

    const rth_pos_active = dev.Rth_JC_CW + rthTim + state.Rth_heatsink_CW;
    const rth_pos_coldplate = dev.Rth_JC_CW + 0.08 + 0.12;

    const computeMaxPowerForRth = (tamb: number, rth_pos: number) => {
      if (tamb >= tjLimit) return 0;
      const pDissMaxTotal_W = ((tjLimit - tamb) / Math.max(0.05, rth_pos)) * totalPriPositions;
      const availVarLoss_W = Math.max(0, pDissMaxTotal_W - pFixed_Lim);
      const a = Math.max(0.05, pCondAtNomLoad_Lim);
      const b = Math.max(0, pSwVarAtNomLoad_Lim);
      const c = -availVarLoss_W;
      const scaleS = Math.max(0, (-b + Math.sqrt(Math.max(0, b * b - 4 * a * c))) / (2 * a));
      return Math.min(state.Pout_W * 1.8, state.Pout_W * scaleS);
    };

    return (tambRaw: number) => {
      const tamb = tambRaw;
      const pMaxUser_W = computeMaxPowerForRth(tamb, rth_pos_active);
      const pMaxCold_W = computeMaxPowerForRth(tamb, rth_pos_coldplate);
      const deratingPct = Math.min(150, (pMaxUser_W / Math.max(1, state.Pout_W)) * 100);
      return {
        tamb_C: Number(tamb.toFixed(1)),
        pMaxUser_kW: Number((pMaxUser_W / 1000).toFixed(3)),
        pMaxCold_kW: Number((pMaxCold_W / 1000).toFixed(3)),
        deratingPct: Number(deratingPct.toFixed(1)),
      };
    };
  }, [
    res.priDevice,
    res.Pcond_pri_25C_W,
    res.Psw_pri_25C_W,
    res.Poss_hyst_pri_W,
    res.Pgate_pri_W,
    res.Pgate_int_pri_W,
    tjLimit,
    rthTim,
    state.Rth_heatsink_CW,
    state.Pout_W,
    totalPriPositions,
  ]);

  // Sweep 2: Safe Power & Current Derating Envelope vs Ambient Temperature Tamb (-20°C to +130°C)
  const deratingSweepPoints = useMemo(() => {
    const pts = [];
    const N = 60;
    for (let i = 0; i <= N; i++) {
      const tamb = -20 + (150 * i) / N;
      pts.push(evalDeratingPoint(tamb));
    }
    return pts;
  }, [evalDeratingPoint]);

  // Thermal penalty deltas (Active Equilibrium vs 25°C Cold Datasheet)
  const condDelta_W = res.Pcond_pri_W - res.Pcond_pri_25C_W;
  const condDelta_pct = (condDelta_W / Math.max(0.01, res.Pcond_pri_25C_W)) * 100;
  const swDelta_W = res.Psw_pri_W - res.Psw_pri_25C_W;
  const swDelta_pct = (swDelta_W / Math.max(0.01, res.Psw_pri_25C_W)) * 100;
  const totPri25_W = res.Pcond_pri_25C_W + res.Psw_pri_25C_W;
  const totPriHot_W = res.Pcond_pri_W + res.Psw_pri_W;
  const totDelta_W = totPriHot_W - totPri25_W;
  const totDelta_pct = (totDelta_W / Math.max(0.01, totPri25_W)) * 100;

  const isOverTemp = res.Tj_pri_C > tjLimit;
  const isWarningTemp = res.Tj_pri_C > tjLimit - 15 && !isOverTemp;

  return (
    <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-4">
      {/* HEADER BAR */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <Flame className="w-4 h-4 text-amber-400" />
            <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-amber-400">
              Real-Time Semiconductor Thermal Derating &amp; Heatsink Impedance Calculator (Rth,hs &amp; Tamb)
            </h3>
            <span
              className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded inline-flex items-center gap-1 ${
                isOverTemp
                  ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                  : isWarningTemp
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                  : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
              }`}
            >
              {isOverTemp ? (
                <>
                  <AlertTriangle className="w-3 h-3" /> DERATING REQUIRED: Tj = {res.Tj_pri_C.toFixed(1)}°C &gt; {tjLimit}°C
                </>
              ) : isWarningTemp ? (
                <>
                  <Thermometer className="w-3 h-3" /> NEAR THERMAL CEILING (Tj = {res.Tj_pri_C.toFixed(1)}°C)
                </>
              ) : (
                <>
                  <ShieldCheck className="w-3 h-3" /> WITHIN SOA ENVELOPE (+{(tjLimit - res.Tj_pri_C).toFixed(1)}°C Margin)
                </>
              )}
            </span>
          </div>
          <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">
            Dynamically adjusts <strong className="text-amber-400">Conduction Loss P_cond(Tj)</strong> and{' '}
            <strong className="text-cyan-400">Switching + Qrr Loss P_sw(Tj)</strong> via self-consistent Cauer thermal feedback across{' '}
            <strong className="text-slate-200">R_th,jc ({res.priDevice.Rth_JC_CW} °C/W)</strong> +{' '}
            <strong className="text-slate-200">R_th,TIM ({rthTim.toFixed(2)} °C/W)</strong> +{' '}
            <strong className="text-emerald-400">R_th,hs ({state.Rth_heatsink_CW.toFixed(2)} °C/W)</strong> at{' '}
            <strong className="text-rose-400">T_amb = {state.Tamb_C}°C</strong>.
          </p>
        </div>

        {/* 1-Click Auto-Size Heatsink Button when Tj exceeds limit */}
        {isOverTemp && (
          <button
            type="button"
            onClick={() =>
              setField(
                'Rth_heatsink_CW',
                Number(Math.max(0.08, res.Rth_hs_crit_CW * 0.82).toFixed(2))
              )
            }
            className="px-2.5 py-1 text-[11px] font-mono rounded bg-emerald-600/20 border border-emerald-500/50 text-emerald-300 hover:bg-emerald-600/30 inline-flex items-center gap-1 cursor-pointer"
          >
            <Thermometer className="w-3 h-3" /> Auto-Size R_th,hs →{' '}
            {Math.max(0.08, res.Rth_hs_crit_CW * 0.82).toFixed(2)} °C/W (Safe Tj &lt; {tjLimit}°C)
          </button>
        )}
      </div>

      {/* INTERACTIVE HEATSINK Rth_hs, TIM Rth_cs, AMBIENT Tamb, & Tj_limit CONTROLS */}
      <div className="bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 rounded-lg p-3 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          {/* 1. Heatsink Thermal Resistance Rth_hs */}
          <div className="p-2.5 rounded bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
            <div className="flex justify-between items-center text-[11px] font-mono mb-1 gap-1">
              <span className="text-slate-400 font-semibold">Heatsink R_th,hs (°C/W)</span>
              <div className="flex items-center gap-1.5">
                <span className="text-emerald-400 font-bold">
                  {state.Rth_heatsink_CW.toFixed(2)} (Crit: {res.Rth_hs_crit_CW.toFixed(2)})
                </span>
                <LockToggleButton
                  compact
                  locked={dcdcLocked.Rth_heatsink_CW}
                  recentlyAutoUpdated={isAuto('Rth_heatsink_CW')}
                  onToggle={() => toggleDcdcLock('Rth_heatsink_CW')}
                  label="Heatsink Rth"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={0.05}
                max={4.0}
                step={0.05}
                value={state.Rth_heatsink_CW}
                onChange={(e) => setField('Rth_heatsink_CW', Number(e.target.value))}
                className="flex-1 accent-emerald-500 cursor-pointer"
              />
              <input
                type="number"
                step={0.05}
                min={0.05}
                max={10}
                value={state.Rth_heatsink_CW}
                onChange={(e) =>
                  setField('Rth_heatsink_CW', Math.max(0.05, Number(e.target.value)))
                }
                className="w-16 px-1.5 py-0.5 text-xs font-mono bg-slate-900 border border-slate-700 rounded text-right text-slate-100"
              />
            </div>
            <div className="flex flex-wrap gap-1 mt-2">
              {HEATSINK_PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  title={p.desc}
                  onClick={() => setField('Rth_heatsink_CW', p.rth)}
                  className={`px-1.5 py-0.5 text-[9.5px] font-mono rounded border cursor-pointer transition-colors ${
                    Math.abs(state.Rth_heatsink_CW - p.rth) < 0.03
                      ? 'bg-emerald-600 text-white border-emerald-500 font-bold'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {p.label} ({p.rth})
                </button>
              ))}
            </div>
          </div>

          {/* 2. Ambient Temperature Tamb */}
          <div className="p-2.5 rounded bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
            <div className="flex justify-between items-center text-[11px] font-mono mb-1 gap-1">
              <span className="text-slate-400 font-semibold">Ambient Temp T_amb (°C)</span>
              <div className="flex items-center gap-1.5">
                <span className="text-rose-400 font-bold">{state.Tamb_C} °C</span>
                <LockToggleButton
                  compact
                  locked={dcdcLocked.Tamb_C}
                  recentlyAutoUpdated={isAuto('Tamb_C')}
                  onToggle={() => toggleDcdcLock('Tamb_C')}
                  label="Tamb"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={-20}
                max={105}
                step={1}
                value={state.Tamb_C}
                onChange={(e) => setField('Tamb_C', Number(e.target.value))}
                className="flex-1 accent-rose-500 cursor-pointer"
              />
              <input
                type="number"
                step={5}
                min={-40}
                max={125}
                value={state.Tamb_C}
                onChange={(e) => setField('Tamb_C', Number(e.target.value))}
                className="w-16 px-1.5 py-0.5 text-xs font-mono bg-slate-900 border border-slate-700 rounded text-right text-slate-100"
              />
            </div>
            <div className="flex flex-wrap gap-1 mt-2">
              {[
                { label: 'Lab 25°C', t: 25 },
                { label: 'Industrial 45°C', t: 45 },
                { label: 'Server 55°C', t: 55 },
                { label: 'Sealed 70°C', t: 70 },
                { label: 'Auto AEC 85°C', t: 85 },
              ].map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => setField('Tamb_C', p.t)}
                  className={`px-1.5 py-0.5 text-[9.5px] font-mono rounded border cursor-pointer transition-colors ${
                    state.Tamb_C === p.t
                      ? 'bg-rose-600 text-white border-rose-500 font-bold'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* 3. TIM / Interface Thermal Resistance Rth_TIM */}
          <div className="p-2.5 rounded bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
            <div className="flex justify-between items-center text-[11px] font-mono mb-1 gap-1">
              <span className="text-slate-400 font-semibold">TIM Interface R_th,cs (°C/W)</span>
              <div className="flex items-center gap-1.5">
                <span className="text-cyan-400 font-bold">{rthTim.toFixed(2)} °C/W</span>
                <LockToggleButton
                  compact
                  locked={dcdcLocked.Rth_TIM_CW}
                  recentlyAutoUpdated={isAuto('Rth_TIM_CW')}
                  onToggle={() => toggleDcdcLock('Rth_TIM_CW')}
                  label="TIM Rth"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={0.02}
                max={0.8}
                step={0.02}
                value={rthTim}
                onChange={(e) => setField('Rth_TIM_CW', Number(e.target.value))}
                className="flex-1 accent-cyan-500 cursor-pointer"
              />
              <input
                type="number"
                step={0.02}
                min={0}
                max={2.0}
                value={rthTim}
                onChange={(e) => setField('Rth_TIM_CW', Math.max(0, Number(e.target.value)))}
                className="w-16 px-1.5 py-0.5 text-xs font-mono bg-slate-900 border border-slate-700 rounded text-right text-slate-100"
              />
            </div>
            <div className="flex flex-wrap gap-1 mt-2">
              {TIM_PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => setField('Rth_TIM_CW', p.rth)}
                  className={`px-1.5 py-0.5 text-[9.5px] font-mono rounded border cursor-pointer transition-colors ${
                    Math.abs(rthTim - p.rth) < 0.015
                      ? 'bg-cyan-600 text-white border-cyan-500 font-bold'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* 4. Max Junction Temperature Limit & Parallel Die Scaling */}
          <div className="p-2.5 rounded bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-center text-[11px] font-mono mb-1 gap-1">
                <span className="text-slate-400 font-semibold">Derating Ceiling T_j,max</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-amber-400 font-bold">{tjLimit} °C</span>
                  <LockToggleButton
                    compact
                    locked={dcdcLocked.Tj_max_limit_C}
                    recentlyAutoUpdated={isAuto('Tj_max_limit_C')}
                    onToggle={() => toggleDcdcLock('Tj_max_limit_C')}
                    label="Tj Limit"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-1">
                {[
                  { label: '125°C (High-Rel)', val: 125 },
                  { label: '150°C (Ind.)', val: 150 },
                  { label: '175°C (Max)', val: 175 },
                ].map((opt) => (
                  <button
                    key={opt.val}
                    type="button"
                    onClick={() => setField('Tj_max_limit_C', opt.val)}
                    className={`px-1.5 py-1 text-[10px] font-mono rounded border cursor-pointer ${
                      tjLimit === opt.val
                        ? 'bg-amber-500/20 border-amber-500 text-amber-300 font-bold'
                        : 'bg-slate-900 border-slate-800 text-slate-400'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] font-mono">
              <span className="text-slate-400">Total R_th,j-a per Switch:</span>
              <span className="text-slate-200 font-bold">
                {(res.priDevice.Rth_JC_CW + rthTim + state.Rth_heatsink_CW).toFixed(2)} °C/W
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 4-CARD COLD (25°C) VS THERMALLY DERATED (Tj,eq) LOSS ADJUSTMENT SUMMARY */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <div className="bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-lg p-3">
          <div className="text-[10px] font-mono uppercase text-slate-400">
            1. Conduction Loss Thermal Adjustment
          </div>
          <div className="flex items-baseline gap-2 mt-0.5">
            <span className="text-lg font-mono font-bold text-amber-400">
              {res.Pcond_pri_W.toFixed(2)} W
            </span>
            <span className="text-xs font-mono text-rose-400 font-semibold">
              ({condDelta_W >= 0 ? '+' : ''}
              {condDelta_W.toFixed(2)} W / {condDelta_pct >= 0 ? '+' : ''}
              {condDelta_pct.toFixed(1)}%)
            </span>
          </div>
          <div className="text-[10px] font-mono text-slate-500 mt-1">
            25°C Un-derated: <strong>{res.Pcond_pri_25C_W.toFixed(2)} W</strong> · R_ds,on(Tj) ={' '}
            <strong className="text-slate-300">{res.Rds_pri_actual_mOhm.toFixed(1)} mΩ</strong> (vs{' '}
            {(res.priDevice.Rds_on_25C_mOhm / state.nParallelPri).toFixed(1)} mΩ @ 25°C)
          </div>
        </div>

        <div className="bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-lg p-3">
          <div className="text-[10px] font-mono uppercase text-slate-400">
            2. Switching + Qrr Thermal Adjustment
          </div>
          <div className="flex items-baseline gap-2 mt-0.5">
            <span className="text-lg font-mono font-bold text-cyan-400">
              {res.Psw_pri_W.toFixed(2)} W
            </span>
            <span className="text-xs font-mono text-rose-400 font-semibold">
              ({swDelta_W >= 0 ? '+' : ''}
              {swDelta_W.toFixed(2)} W / {swDelta_pct >= 0 ? '+' : ''}
              {swDelta_pct.toFixed(1)}%)
            </span>
          </div>
          <div className="text-[10px] font-mono text-slate-500 mt-1">
            25°C Un-derated: <strong>{res.Psw_pri_25C_W.toFixed(2)} W</strong> · Q_rr(Tj) ={' '}
            <strong className="text-slate-300">{res.Qrr_pri_hot_nC.toFixed(0)} nC</strong> (vs{' '}
            {res.priDevice.Qrr_nC} nC @ 25°C)
          </div>
        </div>

        <div className="bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-lg p-3">
          <div className="text-[10px] font-mono uppercase text-slate-400">
            3. Total Primary Thermal Loss Penalty
          </div>
          <div className="flex items-baseline gap-2 mt-0.5">
            <span className="text-lg font-mono font-bold text-purple-400">
              {totPriHot_W.toFixed(2)} W
            </span>
            <span className="text-xs font-mono text-amber-400 font-semibold">
              ({totDelta_W >= 0 ? '+' : ''}
              {totDelta_W.toFixed(2)} W / +{totDelta_pct.toFixed(1)}%)
            </span>
          </div>
          <div className="text-[10px] font-mono text-slate-500 mt-1">
            Sec SR Conduction: <strong>{res.Pcond_sec_ch_W.toFixed(2)} W</strong> @ Tj,sec ={' '}
            {res.Tj_sec_C.toFixed(1)}°C (vs {res.Pcond_sec_25C_W.toFixed(2)} W @ 25°C)
          </div>
        </div>

        <div className="bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-lg p-3">
          <div className="text-[10px] font-mono uppercase text-slate-400">
            4. Safe Derated Power &amp; Current Ceiling
          </div>
          <div className="flex items-baseline gap-2 mt-0.5">
            <span
              className={`text-lg font-mono font-bold ${
                res.Pout_derated_max_W < state.Pout_W ? 'text-rose-400' : 'text-emerald-400'
              }`}
            >
              {(res.Pout_derated_max_W / 1000).toFixed(2)} kW
            </span>
            <span className="text-xs font-mono text-slate-400">
              (I_rms,max = {res.Id_pri_derated_max_A.toFixed(1)} A)
            </span>
          </div>
          <div className="text-[10px] font-mono text-slate-500 mt-1">
            Rated Load: <strong>{(state.Pout_W / 1000).toFixed(2)} kW</strong> · Derating Factor:{' '}
            <strong
              className={
                res.Pout_derated_max_W < state.Pout_W ? 'text-rose-400' : 'text-emerald-400'
              }
            >
              {((res.Pout_derated_max_W / Math.max(1, state.Pout_W)) * 100).toFixed(0)}%
            </strong>{' '}
            of nominal
          </div>
        </div>
      </div>

      {/* 1D CAUER THERMAL RESISTANCE NETWORK LADDER VISUALIZER */}
      <div className="bg-slate-950 border border-slate-800 rounded-lg p-3">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-cyan-400">
            1D Steady-State Cauer Thermal Resistance Network (Per Primary Switch Position · P_diss ={' '}
            {(totPriHot_W / totalPriPositions).toFixed(2)} W/pos)
          </div>
          <div className="text-[10px] font-mono text-slate-400">
            ΔT_j-a = {(res.Tj_pri_C - state.Tamb_C).toFixed(1)}°C = ΔT_jc (
            {(res.Tj_pri_C - res.Tcase_pri_C).toFixed(1)}°C) + ΔT_TIM (
            {(res.Tcase_pri_C - res.Tsink_pri_C).toFixed(1)}°C) + ΔT_hs (
            {(res.Tsink_pri_C - state.Tamb_C).toFixed(1)}°C)
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-7 gap-1.5 items-center text-center font-mono text-xs">
          <div className="p-2 rounded bg-rose-500/15 border border-rose-500/40">
            <div className="text-[10px] text-rose-300 uppercase">Die Junction T_j</div>
            <div className="text-sm font-bold text-rose-400">{res.Tj_pri_C.toFixed(1)} °C</div>
            <div className="text-[9px] text-slate-400">Limit: {tjLimit}°C</div>
          </div>

          <div className="text-[10px] text-slate-400 flex flex-col items-center">
            <span className="text-amber-400 font-semibold">R_th,jc = {res.priDevice.Rth_JC_CW} °C/W</span>
            <span className="w-full border-b border-dashed border-amber-500/50 my-1" />
            <span>ΔT = {(res.Tj_pri_C - res.Tcase_pri_C).toFixed(1)}°C</span>
          </div>

          <div className="p-2 rounded bg-amber-500/15 border border-amber-500/40">
            <div className="text-[10px] text-amber-300 uppercase">Package Case T_c</div>
            <div className="text-sm font-bold text-amber-400">{res.Tcase_pri_C.toFixed(1)} °C</div>
            <div className="text-[9px] text-slate-400">{res.priDevice.packageType}</div>
          </div>

          <div className="text-[10px] text-slate-400 flex flex-col items-center">
            <span className="text-cyan-400 font-semibold">R_th,TIM = {rthTim.toFixed(2)} °C/W</span>
            <span className="w-full border-b border-dashed border-cyan-500/50 my-1" />
            <span>ΔT = {(res.Tcase_pri_C - res.Tsink_pri_C).toFixed(1)}°C</span>
          </div>

          <div className="p-2 rounded bg-cyan-500/15 border border-cyan-500/40">
            <div className="text-[10px] text-cyan-300 uppercase">Heatsink Surface T_s</div>
            <div className="text-sm font-bold text-cyan-400">{res.Tsink_pri_C.toFixed(1)} °C</div>
            <div className="text-[9px] text-slate-400">Sec Tj: {res.Tj_sec_C.toFixed(1)}°C</div>
          </div>

          <div className="text-[10px] text-slate-400 flex flex-col items-center">
            <span className="text-emerald-400 font-semibold">
              R_th,hs = {state.Rth_heatsink_CW.toFixed(2)} °C/W
            </span>
            <span className="w-full border-b border-dashed border-emerald-500/50 my-1" />
            <span>ΔT = {(res.Tsink_pri_C - state.Tamb_C).toFixed(1)}°C</span>
          </div>

          <div className="p-2 rounded bg-emerald-500/15 border border-emerald-500/40">
            <div className="text-[10px] text-emerald-300 uppercase">Ambient Air T_amb</div>
            <div className="text-sm font-bold text-emerald-400">{state.Tamb_C.toFixed(1)} °C</div>
            <div className="text-[9px] text-slate-400">Cooling Boundary</div>
          </div>
        </div>
      </div>

      {/* DUAL INTERACTIVE DERATING CANVASES */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* LEFT CANVAS: CONDUCTION & SWITCHING LOSS ESCALATION VS HEATSINK Rth_hs */}
        <InteractiveChart
          title={`A. Conduction & Switching Loss Escalation vs. Heatsink R_th,hs (@ T_amb = ${state.Tamb_C}°C)`}
          subtitle={`Active R_th,hs = ${state.Rth_heatsink_CW.toFixed(2)} °C/W → Tj = ${res.Tj_pri_C.toFixed(1)}°C (Click to set R_th,hs)`}
          data={rthSweepPoints}
          xKey="rth_hs_CW"
          xLabel="Rth,hs"
          xUnit="°C/W"
          domainEvaluator={evalRthPoint}
          currentX={state.Rth_heatsink_CW}
          currentXLabel={`Active (${state.Rth_heatsink_CW.toFixed(2)}°C/W)`}
          onSelectX={(x) => setField('Rth_heatsink_CW', Number(Math.max(0.05, Math.min(4.0, x)).toFixed(2)))}
          verticalMarkers={
            res.Rth_hs_crit_CW <= 4.0
              ? [
                  {
                    x: Number(res.Rth_hs_crit_CW.toFixed(2)),
                    label: `Max Rth,hs (${tjLimit}°C)=${res.Rth_hs_crit_CW.toFixed(2)}`,
                    color: '#f43f5e',
                    dashed: true,
                  },
                ]
              : []
          }
          horizontalMarkers={[
            {
              value: Number(totPri25_W.toFixed(1)),
              label: `25°C Cold Loss (${totPri25_W.toFixed(1)}W)`,
              color: '#64748b',
              axis: 'left',
              dashed: true,
            },
            {
              value: tjLimit,
              label: `Tj,max Limit (${tjLimit}°C)`,
              color: '#f43f5e',
              axis: 'right',
              dashed: true,
            },
          ]}
          series={[
            {
              key: 'pTot_W',
              name: 'Total Loss P_tot(Rth,hs)',
              unit: 'W',
              color: '#a855f7',
              axis: 'left',
            },
            {
              key: 'pCond_W',
              name: 'Conduction P_cond(Rth,hs)',
              unit: 'W',
              color: '#f59e0b',
              axis: 'left',
            },
            {
              key: 'pSw_W',
              name: 'Switching + Qrr P_sw(Rth,hs)',
              unit: 'W',
              color: '#06b6d4',
              axis: 'left',
            },
            {
              key: 'tj_C',
              name: 'Equilibrium Tj',
              unit: '°C',
              color: '#f43f5e',
              axis: 'right',
              dashed: true,
            },
          ]}
        />

        {/* RIGHT CANVAS: SAFE OPERATING POWER DERATING ENVELOPE VS AMBIENT TEMPERATURE Tamb */}
        <InteractiveChart
          title={`B. Semiconductor Power Derating Curve P_out,max(T_amb) for T_j ≤ ${tjLimit}°C`}
          subtitle={`Max Safe Power @ ${state.Tamb_C}°C = ${(res.Pout_derated_max_W / 1000).toFixed(2)} kW (Click to set T_amb)`}
          data={deratingSweepPoints}
          xKey="tamb_C"
          xLabel="T_amb"
          xUnit="°C"
          domainEvaluator={evalDeratingPoint}
          currentX={state.Tamb_C}
          currentXLabel={`Tamb=${state.Tamb_C}°C`}
          onSelectX={(x) => setField('Tamb_C', Math.max(-20, Math.min(105, Math.round(x))))}
          horizontalMarkers={[
            {
              value: Number((state.Pout_W / 1000).toFixed(2)),
              label: `Nominal Load (${(state.Pout_W / 1000).toFixed(2)} kW)`,
              color: '#38bdf8',
              axis: 'left',
              dashed: true,
            },
          ]}
          series={[
            {
              key: 'pMaxUser_kW',
              name: `Safe Max Power @ Rth,hs=${state.Rth_heatsink_CW.toFixed(2)}°C/W`,
              unit: 'kW',
              color: '#10b981',
              axis: 'left',
            },
            {
              key: 'pMaxCold_kW',
              name: 'Cold-Plate Reference (0.12 °C/W)',
              unit: 'kW',
              color: '#38bdf8',
              axis: 'left',
              dashed: true,
            },
            {
              key: 'deratingPct',
              name: 'Rated Power Capability',
              unit: '%',
              color: '#a855f7',
              axis: 'right',
              dashed: true,
            },
          ]}
        />
      </div>

      {/* GOVERNING COUPLED ELECTRO-THERMAL DERATING EQUATIONS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
        <div className="p-2.5 rounded bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
          <div className="text-[10px] font-mono text-slate-400 mb-1">
            1. Temperature-Scaled Conduction Loss:
          </div>
          <MathFormula tex="P_{\text{cond}}(T_j) = P_{\text{cond,25C}}\left[1 + \alpha_R (T_j - 25) + \beta_R (T_j - 25)^2\right]" />
        </div>
        <div className="p-2.5 rounded bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
          <div className="text-[10px] font-mono text-slate-400 mb-1">
            2. Temperature-Scaled Switching &amp; Qrr Loss:
          </div>
          <MathFormula tex="P_{\text{sw}}(T_j) = P_{\text{overlap,25C}}\left[1 + \alpha_{\text{sw}}(T_j - 25)\right] + P_{\text{rr}}(T_j) + P_{\text{oss}}" />
        </div>
        <div className="p-2.5 rounded bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
          <div className="text-[10px] font-mono text-slate-400 mb-1">
            3. Self-Consistent Heatsink Equilibrium:
          </div>
          <MathFormula tex="T_j = T_{\text{amb}} + \frac{P_{\text{cond}}(T_j) + P_{\text{sw}}(T_j)}{N_{\text{sw}}}\left(R_{\theta,\text{jc}} + R_{\theta,\text{TIM}} + R_{\theta,\text{hs}}\right)" />
        </div>
      </div>
    </div>
  );
};
