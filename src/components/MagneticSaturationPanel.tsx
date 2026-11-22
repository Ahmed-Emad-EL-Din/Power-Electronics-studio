import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  DcDcDesignState,
  CORE_DATABASE,
  MATERIAL_DATABASE,
} from '../data/databases';
import { DcDcResults } from '../engine/dcdcEngine';
import { MathFormula } from './MathFormula';
import { InteractiveChart } from './InteractiveChart';
import { useDesignSolver, useLockableValue } from './DesignSolverContext';
import { LockToggleButton } from './AutoSolverControls';
import {
  Layers,
  Play,
  Pause,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  ShieldCheck,
  AlertTriangle,
  Flame,
  Sliders,
  Eye,
} from 'lucide-react';

interface MagneticSaturationPanelProps {
  state: DcDcDesignState;
  res: DcDcResults;
  onChange: (next: DcDcDesignState) => void;
}

const MATERIAL_COLORS: Record<string, string> = {
  N97: '#a855f7', // purple
  N87: '#38bdf8', // sky
  N95: '#10b981', // emerald
  '3C95': '#f59e0b', // amber
  '3C97': '#ec4899', // pink
  PC95: '#06b6d4', // cyan
};

const MATERIAL_CURIE_C: Record<string, number> = {
  N97: 230,
  N87: 210,
  N95: 215,
  '3C95': 215,
  '3C97': 220,
  PC95: 215,
};

/**
 * Computes temperature-dependent Bsat(T) in mT for a given ferrite material
 * calibrated to match Bsat_100C_T at 100°C and ~1.24 * Bsat_100C_T at 25°C,
 * rolling off toward Curie temperature Tc.
 */
function computeBsatAtTemp_mT(materialId: string, Bsat_100C_T: number, temp_C: number): number {
  const Tc = MATERIAL_CURIE_C[materialId] || 220;
  const T_clamped = Math.max(-40, Math.min(Tc - 2, temp_C));
  const Bsat_100_mT = Bsat_100C_T * 1000;
  // Power-law Brillouin approximation normalized at 100°C:
  // Bsat(T) = Bsat(100°C) * ((Tc - T) / (Tc - 100))^gamma
  // Choose gamma so Bsat(25°C) / Bsat(100°C) ≈ 1.24
  const ratio25 = (Tc - 25) / (Tc - 100);
  const gamma = Math.log(1.24) / Math.log(ratio25);
  return Bsat_100_mT * Math.pow(Math.max(0.01, (Tc - T_clamped) / (Tc - 100)), gamma);
}

export const MagneticSaturationPanel: React.FC<MagneticSaturationPanelProps> = ({
  state,
  res,
}) => {
  const bh = res.bhLoopAnalysis;
  const ct = res.coreThermalAnalysis;
  const { setDcdcField, dcdcLocked, toggleDcdcLock, dcdcChanges } = useDesignSolver();

  // Interactive simulation & visualization state
  const [phaseCursor, setPhaseCursor] = useState<number>(0.24); // t / Tsw in [0, 1]
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const dcBiasLock = useLockableValue<number>(0, false); // Simulates flux-walking / asymmetrical volt-sec bias
  const surgeLock = useLockableValue<number>(0, false); // Simulates load-step / Vin step volt-sec surge (0 to +60%)
  const tempLock = useLockableValue<number>(Number(ct.Tcore_surface_C.toFixed(1)), false);
  const dcBiasCurrent_A = dcBiasLock.value;
  const transientBurstPct = surgeLock.value;
  const activeTemp_C = tempLock.locked ? tempLock.value : ct.Tcore_surface_C;

  const [showAllMaterials, setShowAllMaterials] = useState<boolean>(true);
  const [show25CReference, setShow25CReference] = useState<boolean>(true);
  const [showTangentSlope, setShowTangentSlope] = useState<boolean>(true);

  // Zoom / Pan state for Left BH Curve Canvas
  const [bhZoom, setBhZoom] = useState<number>(1.0);
  const [bhPan, setBhPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const panStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  // Animation loop for real-time phase cursor scrubbing
  useEffect(() => {
    if (!isPlaying) return;
    let animId: number;
    let lastTime = performance.now();
    const tick = (now: number) => {
      const dt = (now - lastTime) / 1000;
      lastTime = now;
      setPhaseCursor((prev) => (prev + dt * 0.22) % 1.0);
      animId = requestAnimationFrame(tick);
    };
    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [isPlaying]);

  // Active material Bsat at current core temperature, 100°C, and 25°C
  const Bsat_active_mT = useMemo(
    () => computeBsatAtTemp_mT(res.material.id, res.material.Bsat_100C_T, activeTemp_C),
    [res.material.id, res.material.Bsat_100C_T, activeTemp_C]
  );
  const Bsat_100C_mT = res.material.Bsat_100C_T * 1000;
  const Bsat_25C_mT = useMemo(
    () => computeBsatAtTemp_mT(res.material.id, res.material.Bsat_100C_T, 25),
    [res.material.id, res.material.Bsat_100C_T]
  );

  // Characteristic field H_char at active temperature
  const mu0 = 4 * Math.PI * 1e-7;
  const mu_e = res.mu_e_actual;
  const H_char_active_Am = useMemo(
    () => (Bsat_active_mT * 1e-3) / (mu0 * mu_e),
    [Bsat_active_mT, mu0, mu_e]
  );

  // DC bias field H_dc from DC current offset (e.g., asymmetrical drive or flux walk)
  const le_m = res.core.le_mm * 1e-3;
  const H_dc_bias_Am = (res.Np_actual * dcBiasCurrent_A) / le_m;

  // Compute full switching cycle instantaneous waveform points (180 points for t/Tsw in [0, 1])
  const cycleWaveforms = useMemo(() => {
    const N = 180;
    const Tsw_us = 1000 / Math.max(1, state.fsw_kHz);
    const surgeMultiplier = 1 + transientBurstPct / 100;
    const B_ac_pk_mT = bh.Bpk_mT * surgeMultiplier;
    const Deff = Math.min(0.92, Math.max(0.1, res.Deff_nom));

    // DC flux offset induced by H_dc_bias on anhysteretic curve
    const B_dc_offset_mT =
      Bsat_active_mT * Math.tanh(H_dc_bias_Am / Math.max(1, H_char_active_Am)) +
      mu0 * H_dc_bias_Am * 1e3;

    const points: {
      phase: number; // 0..1
      t_us: number;
      v_pri_V: number;
      B_inst_mT: number;
      H_inst_Am: number;
      Im_inst_A: number;
      mu_inc_pct: number; // sech^2(H/Hchar) * 100
      Lm_inc_uH: number;
    }[] = [];

    for (let i = 0; i <= N; i++) {
      const u = i / N; // 0..1
      const t_us = u * Tsw_us;
      let bNorm = 0; // -1..+1 AC flux waveform shape
      let vNorm = 0; // -1..+1 primary excitation voltage shape

      if (res.isLLC) {
        // Resonant sinusoidal excitation: v_pri(t) ~ cos(2*pi*u), B(t) ~ sin(2*pi*u)
        const theta = 2 * Math.PI * u;
        bNorm = Math.sin(theta);
        vNorm = Math.cos(theta);
      } else {
        // Phase-Shifted Full-Bridge trapezoidal / piecewise-linear flux excitation
        // Half-cycle 1: u in [0, 0.5]
        // Active power transfer interval centered in [0, 0.5] of width Deff * 0.5
        const halfD = Deff * 0.5;
        const pad = (0.5 - halfD) * 0.5;
        if (u < pad) {
          bNorm = -1;
          vNorm = 0;
        } else if (u < pad + halfD) {
          const frac = (u - pad) / Math.max(1e-4, halfD);
          bNorm = -1 + 2 * frac;
          vNorm = 1;
        } else if (u < 0.5 + pad) {
          bNorm = 1;
          vNorm = 0;
        } else if (u < 0.5 + pad + halfD) {
          const frac = (u - (0.5 + pad)) / Math.max(1e-4, halfD);
          bNorm = 1 - 2 * frac;
          vNorm = -1;
        } else {
          bNorm = -1;
          vNorm = 0;
        }
      }

      const v_pri_V = vNorm * state.Vin_nom_V * (state.topology === 'llc-hb' ? 0.5 : 1.0);
      const B_inst_mT = B_dc_offset_mT + bNorm * B_ac_pk_mT;

      // Invert B(H) = Bsat * tanh(H / Hchar) + Hc_eff * vNorm to find instantaneous nonlinear H(t)
      // When B approaches Bsat, atanh(B/Bsat) diverges -> sharp magnetizing current spike!
      const bRatio = Math.max(-0.992, Math.min(0.992, B_inst_mT / Math.max(10, Bsat_active_mT)));
      const H_anh_Am = H_char_active_Am * Math.atanh(bRatio);
      const H_hyst_Am = bh.Hc_eff_Am * vNorm * 0.85;
      const H_inst_Am = H_anh_Am + H_hyst_Am;
      const Im_inst_A = (H_inst_Am * le_m) / Math.max(1, res.Np_actual);

      const sechVal = 1 / Math.cosh(H_anh_Am / Math.max(1, H_char_active_Am));
      const mu_inc_pct = Math.max(1, Math.min(100, sechVal * sechVal * 100));
      const Lm_inc_uH = Math.max(1, state.Lm_uH * (mu_inc_pct / 100));

      points.push({
        phase: Number(u.toFixed(4)),
        t_us: Number(t_us.toFixed(3)),
        v_pri_V: Number(v_pri_V.toFixed(1)),
        B_inst_mT: Number(B_inst_mT.toFixed(1)),
        H_inst_Am: Number(H_inst_Am.toFixed(1)),
        Im_inst_A: Number(Im_inst_A.toFixed(3)),
        mu_inc_pct: Number(mu_inc_pct.toFixed(1)),
        Lm_inc_uH: Number(Lm_inc_uH.toFixed(1)),
      });
    }
    return points;
  }, [
    state.fsw_kHz,
    state.Vin_nom_V,
    state.topology,
    state.Lm_uH,
    transientBurstPct,
    bh.Bpk_mT,
    bh.Hc_eff_Am,
    res.Deff_nom,
    res.isLLC,
    res.Np_actual,
    Bsat_active_mT,
    H_dc_bias_Am,
    H_char_active_Am,
    mu0,
    le_m,
  ]);

  const evalTimeDomainAtUs = useMemo(() => {
    const Tsw_us = 1000 / Math.max(1, state.fsw_kHz);
    const Deff = Math.min(0.96, Math.max(0.15, res.Deff_nom));
    const burstScale = 1 + transientBurstPct / 100;
    const B_ac_pk_mT = bh.Bpk_mT * burstScale;
    const B_dc_offset_mT =
      Bsat_active_mT * Math.tanh(H_dc_bias_Am / Math.max(1, H_char_active_Am)) +
      mu0 * H_dc_bias_Am * 1e3;

    return (t_us_raw: number) => {
      const u = ((t_us_raw / Tsw_us) % 1 + 1) % 1;
      let bNorm = 0;
      let vNorm = 0;
      if (res.isLLC) {
        const theta = 2 * Math.PI * u;
        bNorm = Math.sin(theta);
        vNorm = Math.cos(theta);
      } else {
        const halfD = Deff * 0.5;
        const pad = (0.5 - halfD) * 0.5;
        if (u < pad) {
          bNorm = -1;
          vNorm = 0;
        } else if (u < pad + halfD) {
          const frac = (u - pad) / Math.max(1e-4, halfD);
          bNorm = -1 + 2 * frac;
          vNorm = 1;
        } else if (u < 0.5 + pad) {
          bNorm = 1;
          vNorm = 0;
        } else if (u < 0.5 + pad + halfD) {
          const frac = (u - (0.5 + pad)) / Math.max(1e-4, halfD);
          bNorm = 1 - 2 * frac;
          vNorm = -1;
        } else {
          bNorm = -1;
          vNorm = 0;
        }
      }
      const B_inst_mT = B_dc_offset_mT + bNorm * B_ac_pk_mT;
      const bRatio = Math.max(-0.992, Math.min(0.992, B_inst_mT / Math.max(10, Bsat_active_mT)));
      const H_anh_Am = H_char_active_Am * Math.atanh(bRatio);
      const H_hyst_Am = bh.Hc_eff_Am * vNorm * 0.85;
      const H_inst_Am = H_anh_Am + H_hyst_Am;
      return {
        t_us: Number(t_us_raw.toFixed(3)),
        B_inst_mT: Number(B_inst_mT.toFixed(1)),
        H_inst_Am: Number(H_inst_Am.toFixed(1)),
      };
    };
  }, [
    state.fsw_kHz,
    transientBurstPct,
    bh.Bpk_mT,
    bh.Hc_eff_Am,
    res.Deff_nom,
    res.isLLC,
    Bsat_active_mT,
    H_dc_bias_Am,
    H_char_active_Am,
    mu0,
  ]);

  // Peak & Minimum values across the active switching cycle
  const cycleStats = useMemo(() => {
    let Bmax_mT = -Infinity;
    let Bmin_mT = Infinity;
    let Hmax_Am = -Infinity;
    let Hmin_Am = Infinity;
    let Im_max_A = 0;
    let minMuInc_pct = 100;

    for (const p of cycleWaveforms) {
      if (p.B_inst_mT > Bmax_mT) Bmax_mT = p.B_inst_mT;
      if (p.B_inst_mT < Bmin_mT) Bmin_mT = p.B_inst_mT;
      if (p.H_inst_Am > Hmax_Am) Hmax_Am = p.H_inst_Am;
      if (p.H_inst_Am < Hmin_Am) Hmin_Am = p.H_inst_Am;
      if (Math.abs(p.Im_inst_A) > Im_max_A) Im_max_A = Math.abs(p.Im_inst_A);
      if (p.mu_inc_pct < minMuInc_pct) minMuInc_pct = p.mu_inc_pct;
    }

    const absBmax_mT = Math.max(Math.abs(Bmax_mT), Math.abs(Bmin_mT));
    const headroom_mT = Bsat_active_mT - absBmax_mT;
    const utilization_pct = (absBmax_mT / Math.max(1, Bsat_active_mT)) * 100;
    const headroom_pct = Math.max(-100, 100 - utilization_pct);

    // Minimum safe primary turns for 30% headroom (70% Bsat utilization) at active temperature
    const targetB_mT = 0.7 * Bsat_active_mT;
    const Np_safe_70pct = Math.max(
      1,
      Math.ceil((res.Np_actual * absBmax_mT) / Math.max(10, targetB_mT))
    );

    return {
      Bmax_mT,
      Bmin_mT,
      absBmax_mT,
      deltaB_pp_mT: Bmax_mT - Bmin_mT,
      Hmax_Am,
      Hmin_Am,
      Im_max_A,
      minMuInc_pct,
      headroom_mT,
      utilization_pct,
      headroom_pct,
      Np_safe_70pct,
    };
  }, [cycleWaveforms, Bsat_active_mT, res.Np_actual]);

  // Instantaneous sample at current phaseCursor
  const cursorSample = useMemo(() => {
    const idx = Math.min(
      cycleWaveforms.length - 1,
      Math.max(0, Math.round(phaseCursor * (cycleWaveforms.length - 1)))
    );
    return cycleWaveforms[idx];
  }, [cycleWaveforms, phaseCursor]);

  // Multi-material comparison curves & headroom at the current operating Bmax
  const materialComparisons = useMemo(() => {
    return MATERIAL_DATABASE.map((m) => {
      const bsatT_mT = computeBsatAtTemp_mT(m.id, m.Bsat_100C_T, activeTemp_C);
      const bsat25_mT = computeBsatAtTemp_mT(m.id, m.Bsat_100C_T, 25);
      const hChar_Am = (bsatT_mT * 1e-3) / (mu0 * mu_e);
      const headroom_mT = bsatT_mT - cycleStats.absBmax_mT;
      const util_pct = (cycleStats.absBmax_mT / Math.max(1, bsatT_mT)) * 100;
      const bRatio = Math.min(0.99, cycleStats.absBmax_mT / Math.max(10, bsatT_mT));
      const hAtPeak = hChar_Am * Math.atanh(bRatio);
      const muRetained_pct = Math.pow(1 / Math.cosh(hAtPeak / Math.max(1, hChar_Am)), 2) * 100;

      return {
        ...m,
        bsatT_mT,
        bsat25_mT,
        hChar_Am,
        headroom_mT,
        util_pct,
        muRetained_pct,
        color: MATERIAL_COLORS[m.id] || '#a855f7',
      };
    });
  }, [activeTemp_C, mu0, mu_e, cycleStats.absBmax_mT]);

  // Left Canvas (B-H Saturation Curve & Instantaneous Operating Point) Geometry
  const bhSvgW = 640;
  const bhSvgH = 420;
  const bhPad = { top: 28, right: 28, bottom: 44, left: 58 };
  const bhPlotW = bhSvgW - bhPad.left - bhPad.right;
  const bhPlotH = bhSvgH - bhPad.top - bhPad.bottom;

  const baseMaxH = Math.max(450, H_char_active_Am * 3.6, Math.abs(cycleStats.Hmax_Am) * 1.35);
  const baseMaxB = Math.max(600, Bsat_25C_mT * 1.18, cycleStats.absBmax_mT * 1.15);

  const halfSpanH = baseMaxH / bhZoom;
  const halfSpanB = baseMaxB / bhZoom;
  const centerH = bhPan.x;
  const centerB = bhPan.y;

  const hMin = centerH - halfSpanH;
  const hMax = centerH + halfSpanH;
  const bMin = centerB - halfSpanB;
  const bMax = centerB + halfSpanB;

  const mapBhX = (h: number) => bhPad.left + ((h - hMin) / (hMax - hMin)) * bhPlotW;
  const mapBhY = (b: number) => bhPad.top + bhPlotH - ((b - bMin) / (bMax - bMin)) * bhPlotH;

  // Build SVG path for any ferrite material's anhysteretic B-H curve across [hMin, hMax]
  const buildBhCurvePath = (bsat_mT: number, hChar_Am: number) => {
    const steps = 120;
    const pts: string[] = [];
    for (let i = 0; i <= steps; i++) {
      const h = hMin + (i / steps) * (hMax - hMin);
      const b = bsat_mT * Math.tanh(h / Math.max(1, hChar_Am)) + mu0 * h * 1e3;
      pts.push(`${i === 0 ? 'M' : 'L'}${mapBhX(h).toFixed(1)},${mapBhY(b).toFixed(1)}`);
    }
    return pts.join(' ');
  };

  // Active Trajectory Loop path on B-H plane
  const activeLoopPath = useMemo(() => {
    return (
      cycleWaveforms
        .map(
          (p, i) =>
            `${i === 0 ? 'M' : 'L'}${mapBhX(p.H_inst_Am).toFixed(1)},${mapBhY(p.B_inst_mT).toFixed(1)}`
        )
        .join(' ') + ' Z'
    );
  }, [cycleWaveforms, hMin, hMax, bMin, bMax]);

  // Status badge & datasheet limit check
  const exceedsDatasheet100C = cycleStats.absBmax_mT > Bsat_100C_mT;
  const exceedsActiveBsat = cycleStats.absBmax_mT > Bsat_active_mT;
  const isLimitExceeded = exceedsDatasheet100C || exceedsActiveBsat;
  const isSaturating = !isLimitExceeded && cycleStats.utilization_pct >= 90;
  const isNearKnee = !isLimitExceeded && cycleStats.utilization_pct >= 75 && cycleStats.utilization_pct < 90;

  return (
    <div className="bg-white dark:bg-[#14171f] border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-4">
      {/* HEADER BAR */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-blue-500" />
            <h3 className="text-[13px] font-medium text-slate-900 dark:text-[#eef0f5]">
              Magnetic Core Saturation Headroom &amp; Instantaneous B-Field vs. Material B-H Analyzer
            </h3>
            <span
              className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded inline-flex items-center gap-1 ${
                isLimitExceeded
                  ? 'bg-rose-600 text-white border border-rose-400'
                  : isSaturating
                  ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                  : isNearKnee
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                  : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
              }`}
            >
              {isLimitExceeded ? (
                <>
                  <AlertTriangle className="w-3 h-3" /> DATASHEET B_sat EXCEEDED ({cycleStats.utilization_pct.toFixed(1)}% Bsat)
                </>
              ) : isSaturating ? (
                <>
                  <AlertTriangle className="w-3 h-3" /> SATURATION DANGER ({cycleStats.utilization_pct.toFixed(1)}% Bsat)
                </>
              ) : isNearKnee ? (
                <>
                  <Flame className="w-3 h-3" /> NEAR SATURATION KNEE ({cycleStats.utilization_pct.toFixed(1)}% Bsat)
                </>
              ) : (
                <>
                  <ShieldCheck className="w-3 h-3" /> SAFE HEADROOM (+{cycleStats.headroom_mT.toFixed(0)} mT / {cycleStats.headroom_pct.toFixed(1)}%)
                </>
              )}
            </span>
          </div>
          <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">
            Active Core: <strong className="text-slate-800 dark:text-slate-200">{res.core.name}</strong> ({res.material.name}) ·
            Np:Ns = <strong className="text-blue-400">{res.Np_actual}:{res.Ns_actual}</strong> ·
            Ae = {res.core.Ae_mm2} mm², le = {res.core.le_mm} mm ·
            T_core = <strong className="text-amber-400">{activeTemp_C.toFixed(1)}°C</strong> (B_sat = {Bsat_active_mT.toFixed(0)} mT)
          </p>
        </div>

        {/* Quick Hardware & Material Selector Strip */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-900 px-2 py-1 rounded border border-slate-300 dark:border-slate-800">
            <span className="text-[10px] font-mono text-slate-400">Ferrite:</span>
            {MATERIAL_DATABASE.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setDcdcField('materialId', m.id)}
                className={`px-2 py-0.5 text-[10px] font-mono rounded transition-colors cursor-pointer ${
                  state.materialId === m.id
                    ? 'bg-purple-600 text-white font-bold'
                    : 'text-slate-500 hover:text-slate-200'
                }`}
              >
                {m.id}
              </button>
            ))}
            <LockToggleButton
              compact
              locked={dcdcLocked.materialId}
              recentlyAutoUpdated={dcdcChanges.some((c) => c.key === 'materialId')}
              onToggle={() => toggleDcdcLock('materialId')}
              label="Ferrite Material"
            />
          </div>

          {cycleStats.utilization_pct > 70 && (
            <div className="inline-flex items-center gap-1">
              <button
                type="button"
                onClick={() => setDcdcField('Np_turns', cycleStats.Np_safe_70pct)}
                className="px-2.5 py-1 text-[11px] font-mono rounded bg-emerald-600/20 border border-emerald-500/50 text-emerald-300 hover:bg-emerald-600/30 inline-flex items-center gap-1 cursor-pointer"
              >
                <Sliders className="w-3 h-3" /> Auto-Fix Np → {cycleStats.Np_safe_70pct}T (30% Margin)
              </button>
              <LockToggleButton
                compact
                locked={dcdcLocked.Np_turns}
                recentlyAutoUpdated={dcdcChanges.some((c) => c.key === 'Np_turns')}
                onToggle={() => toggleDcdcLock('Np_turns')}
                label="Primary Turns Np"
              />
            </div>
          )}
        </div>
      </div>

      {/* DATASHEET LIMIT EXCEEDED SATURATION ALERT BANNER */}
      {isLimitExceeded && (
        <div
          role="alert"
          className="rounded-lg border-2 border-rose-500 bg-rose-50 dark:bg-rose-950/35 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs font-mono"
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-rose-700 dark:text-rose-300 uppercase">
                Saturation Alert: Peak |B_max| = {cycleStats.absBmax_mT.toFixed(1)} mT Exceeds {res.material.name} Datasheet Limit
              </span>
              <div className="text-[11px] text-slate-700 dark:text-slate-300 mt-0.5">
                {exceedsDatasheet100C
                  ? `Exceeds 100°C datasheet B_sat (${Bsat_100C_mT.toFixed(0)} mT) by +${(cycleStats.absBmax_mT - Bsat_100C_mT).toFixed(1)} mT`
                  : `Exceeds thermal B_sat (${Bsat_active_mT.toFixed(0)} mT @ ${activeTemp_C.toFixed(0)}°C) by +${(cycleStats.absBmax_mT - Bsat_active_mT).toFixed(1)} mT`}
                {(dcBiasCurrent_A !== 0 || transientBurstPct > 0) &&
                  ` (includes stress test: I_dc=${dcBiasCurrent_A.toFixed(2)}A, V·s surge=+${transientBurstPct}%)`}
                . Minimum incremental permeability drops to {cycleStats.minMuInc_pct.toFixed(1)}%.
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setDcdcField('Np_turns', cycleStats.Np_safe_70pct)}
            className="px-2.5 py-1 text-[11px] font-mono font-semibold rounded bg-rose-600 hover:bg-rose-500 text-white inline-flex items-center gap-1 cursor-pointer shrink-0"
          >
            <Sliders className="w-3 h-3" /> Auto-Fix Np → {cycleStats.Np_safe_70pct}T
          </button>
        </div>
      )}

      {/* 6-CARD REAL-TIME SATURATION HEADROOM TELEMETRY BAR */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2.5">
        <div className="bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded p-2.5">
          <div className="text-[10px] font-mono uppercase text-slate-400">Instantaneous B(t)</div>
          <div className="text-base font-mono font-bold tabular-nums text-blue-400">
            {cursorSample.B_inst_mT >= 0 ? '+' : ''}
            {cursorSample.B_inst_mT.toFixed(1)} mT
          </div>
          <div className="text-[10px] font-mono text-slate-500">
            At t = {cursorSample.t_us.toFixed(2)} µs ({(phaseCursor * 100).toFixed(0)}% Tsw)
          </div>
        </div>

        <div className="bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded p-2.5">
          <div className="text-[10px] font-mono uppercase text-slate-400">Peak |B_max| vs B_sat(T)</div>
          <div className="text-base font-mono font-bold tabular-nums text-purple-400">
            {cycleStats.absBmax_mT.toFixed(1)} / {Bsat_active_mT.toFixed(0)} mT
          </div>
          <div className="text-[10px] font-mono text-slate-500">
            B_sat(25°C) = {Bsat_25C_mT.toFixed(0)} mT | 100°C = {Bsat_100C_mT.toFixed(0)} mT
          </div>
        </div>

        <div className="bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded p-2.5">
          <div className="text-[10px] font-mono uppercase text-slate-400">Saturation Headroom ΔB</div>
          <div
            className={`text-base font-mono font-bold tabular-nums ${
              cycleStats.headroom_mT < 45
                ? 'text-rose-400'
                : cycleStats.headroom_mT < 100
                ? 'text-amber-400'
                : 'text-emerald-400'
            }`}
          >
            {cycleStats.headroom_mT >= 0 ? '+' : ''}
            {cycleStats.headroom_mT.toFixed(1)} mT ({cycleStats.headroom_pct.toFixed(1)}%)
          </div>
          <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden mt-1">
            <div
              className={`h-full transition-[width] duration-150 ${
                cycleStats.utilization_pct >= 90
                  ? 'bg-rose-500'
                  : cycleStats.utilization_pct >= 75
                  ? 'bg-amber-500'
                  : 'bg-emerald-500'
              }`}
              style={{ width: `${Math.min(100, Math.max(2, cycleStats.utilization_pct))}%` }}
            />
          </div>
        </div>

        <div className="bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded p-2.5">
          <div className="text-[10px] font-mono uppercase text-slate-400">Instantaneous H(t) &amp; Im(t)</div>
          <div className="text-base font-mono font-bold tabular-nums text-amber-400">
            {cursorSample.H_inst_Am.toFixed(1)} A/m ({cursorSample.Im_inst_A.toFixed(2)} A)
          </div>
          <div className="text-[10px] font-mono text-slate-500">
            Peak |H_pk| = {Math.max(Math.abs(cycleStats.Hmax_Am), Math.abs(cycleStats.Hmin_Am)).toFixed(1)} A/m ({cycleStats.Im_max_A.toFixed(2)} A)
          </div>
        </div>

        <div className="bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded p-2.5">
          <div className="text-[10px] font-mono uppercase text-slate-400">Permeability Retention µ_inc</div>
          <div
            className={`text-base font-mono font-bold tabular-nums ${
              cycleStats.minMuInc_pct < 50
                ? 'text-rose-400'
                : cycleStats.minMuInc_pct < 75
                ? 'text-amber-400'
                : 'text-emerald-400'
            }`}
          >
            {cursorSample.mu_inc_pct.toFixed(1)}% (Min {cycleStats.minMuInc_pct.toFixed(1)}%)
          </div>
          <div className="text-[10px] font-mono text-slate-500">
            Lm,inc(t) = {cursorSample.Lm_inc_uH.toFixed(0)} µH / {state.Lm_uH} µH
          </div>
        </div>

        <div className="bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded p-2.5">
          <div className="text-[10px] font-mono uppercase text-slate-400">Volt-Second Capacity</div>
          <div className="text-base font-mono font-bold tabular-nums text-blue-400">
            {res.voltSec_applied_Vus.toFixed(1)} / {res.voltSec_max_Vus.toFixed(1)} V·µs
          </div>
          <div className="text-[10px] font-mono text-slate-500">
            Knee Isat(80%) = {res.Isat_80pct_A.toFixed(2)} A
          </div>
        </div>
      </div>

      {/* INTERACTIVE TIME SCRUBBER & STRESS SIMULATION CONTROLS */}
      <div className="bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 rounded-lg p-3 grid grid-cols-1 lg:grid-cols-12 gap-3 items-center">
        {/* Time Scrubber + Play/Pause */}
        <div className="lg:col-span-5 flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setIsPlaying((p) => !p)}
            className={`px-2.5 py-1.5 rounded text-xs font-mono font-semibold inline-flex items-center gap-1 cursor-pointer ${
              isPlaying
                ? 'bg-amber-500 text-slate-950'
                : 'bg-purple-600 text-white hover:bg-purple-500'
            }`}
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            {isPlaying ? 'Pause' : 'Animate Cycle'}
          </button>
          <div className="flex-1">
            <div className="flex justify-between text-[10px] font-mono text-slate-400 mb-0.5">
              <span>Switching Phase Scrubber (t / T_sw)</span>
              <span className="text-blue-400 font-bold">
                t = {cursorSample.t_us.toFixed(2)} µs ({(phaseCursor * 360).toFixed(0)}°)
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.005}
              value={phaseCursor}
              onChange={(e) => {
                setIsPlaying(false);
                setPhaseCursor(Number(e.target.value));
              }}
              className="w-full accent-purple-500 cursor-pointer"
            />
          </div>
        </div>

        {/* DC Bias & Transient Volt-Second Surge Sliders */}
        <div className="lg:col-span-5 grid grid-cols-3 gap-2.5 border-l border-slate-200 dark:border-slate-800 pl-3">
          <div>
            <div className="flex justify-between items-center text-[10px] font-mono text-slate-400">
              <span>DC Bias I_dc</span>
              <div className="inline-flex items-center gap-1">
                <span className="text-amber-400 font-bold tabular-nums">{dcBiasCurrent_A.toFixed(2)} A</span>
                <LockToggleButton compact locked={dcBiasLock.locked} onToggle={dcBiasLock.toggleLock} label="DC Bias" />
              </div>
            </div>
            <input
              type="range"
              min={-2.5}
              max={2.5}
              step={0.05}
              value={dcBiasCurrent_A}
              onChange={(e) => dcBiasLock.setManual(Number(e.target.value))}
              className="w-full accent-amber-500 cursor-pointer"
            />
          </div>

          <div>
            <div className="flex justify-between items-center text-[10px] font-mono text-slate-400">
              <span>V·s Surge</span>
              <div className="inline-flex items-center gap-1">
                <span className="text-rose-400 font-bold tabular-nums">+{transientBurstPct}%</span>
                <LockToggleButton compact locked={surgeLock.locked} onToggle={surgeLock.toggleLock} label="V·s Surge" />
              </div>
            </div>
            <input
              type="range"
              min={0}
              max={60}
              step={2}
              value={transientBurstPct}
              onChange={(e) => surgeLock.setManual(Number(e.target.value))}
              className="w-full accent-rose-500 cursor-pointer"
            />
          </div>

          <div>
            <div className="flex justify-between items-center text-[10px] font-mono text-slate-400">
              <span>Core T_fe</span>
              <div className="inline-flex items-center gap-1">
                <span className="text-blue-400 font-bold tabular-nums">{activeTemp_C.toFixed(0)}°C</span>
                <LockToggleButton compact locked={tempLock.locked} onToggle={tempLock.toggleLock} label="Core Temp" />
              </div>
            </div>
            <input
              type="range"
              min={25}
              max={180}
              step={1}
              value={Math.round(activeTemp_C)}
              onChange={(e) => tempLock.setManual(Number(e.target.value))}
              className="w-full accent-blue-500 cursor-pointer"
            />
          </div>
        </div>

        {/* Display Toggles */}
        <div className="lg:col-span-2 flex flex-wrap items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={() => setShowAllMaterials((v) => !v)}
            className={`px-2 py-1 text-[10px] font-mono rounded border cursor-pointer inline-flex items-center gap-1 ${
              showAllMaterials
                ? 'bg-purple-600/20 border-purple-500 text-purple-300'
                : 'bg-slate-800 border-slate-700 text-slate-400'
            }`}
          >
            <Eye className="w-3 h-3" /> All 6 Ferrites
          </button>
          <button
            type="button"
            onClick={() => {
              dcBiasLock.resetToAuto();
              surgeLock.resetToAuto();
              tempLock.resetToAuto();
              setBhZoom(1.0);
              setBhPan({ x: 0, y: 0 });
            }}
            className="px-2 py-1 text-[10px] font-mono rounded bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 cursor-pointer inline-flex items-center gap-1"
            title="Reset Stress Overrides & Zoom"
          >
            <RotateCcw className="w-3 h-3" /> Reset
          </button>
        </div>
      </div>

      {/* SYNCHRONIZED DUAL-CANVAS VISUALIZER */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* LEFT CANVAS: B-H SATURATION CURVES & INSTANTANEOUS OPERATING LOCUS */}
        <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-xs font-mono font-bold text-slate-100">
                1. Ferrite Material B-H Saturation Curves &amp; Instantaneous Locus (H(t), B(t))
              </div>
              <div className="text-[10px] font-mono text-slate-400">
                Scroll to zoom · Drag to pan · Shows active {res.material.id} @ {activeTemp_C.toFixed(0)}°C, 25°C cold curve, &amp; headroom vector ΔB
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setShow25CReference((v) => !v)}
                className={`px-1.5 py-0.5 text-[10px] font-mono rounded border cursor-pointer ${
                  show25CReference
                    ? 'bg-sky-500/20 border-sky-500 text-sky-300'
                    : 'bg-slate-900 border-slate-700 text-slate-500'
                }`}
              >
                25°C Curve
              </button>
              <button
                type="button"
                onClick={() => setShowTangentSlope((v) => !v)}
                className={`px-1.5 py-0.5 text-[10px] font-mono rounded border cursor-pointer ${
                  showTangentSlope
                    ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                    : 'bg-slate-900 border-slate-700 text-slate-500'
                }`}
              >
                µ_inc Tangent
              </button>
              <button
                type="button"
                onClick={() => setBhZoom((z) => Math.min(6, z * 1.3))}
                className="p-1 rounded bg-slate-900 border border-slate-700 text-slate-300 hover:bg-slate-800 cursor-pointer"
                title="Zoom In"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setBhZoom((z) => Math.max(0.25, z / 1.3))}
                className="p-1 rounded bg-slate-900 border border-slate-700 text-slate-300 hover:bg-slate-800 cursor-pointer"
                title="Zoom Out to Deep Saturation"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <svg
            viewBox={`0 0 ${bhSvgW} ${bhSvgH}`}
            className="w-full h-auto select-none cursor-grab active:cursor-grabbing bg-[#090a0d] rounded border border-slate-800/80"
            onWheel={(e) => {
              e.preventDefault();
              const factor = e.deltaY < 0 ? 1.18 : 1 / 1.18;
              setBhZoom((z) => Math.max(0.25, Math.min(8, z * factor)));
            }}
            onMouseDown={(e) => {
              setIsPanning(true);
              panStartRef.current = {
                x: e.clientX,
                y: e.clientY,
                panX: bhPan.x,
                panY: bhPan.y,
              };
            }}
            onMouseMove={(e) => {
              if (!isPanning || !panStartRef.current) return;
              const dx = e.clientX - panStartRef.current.x;
              const dy = e.clientY - panStartRef.current.y;
              const dH = -(dx / bhPlotW) * (hMax - hMin);
              const dB = (dy / bhPlotH) * (bMax - bMin);
              setBhPan({
                x: panStartRef.current.panX + dH,
                y: panStartRef.current.panY + dB,
              });
            }}
            onMouseUp={() => setIsPanning(false)}
            onMouseLeave={() => setIsPanning(false)}
            onDoubleClick={() => {
              setBhZoom(1.0);
              setBhPan({ x: 0, y: 0 });
            }}
          >
            <defs>
              <clipPath id="bh-sat-clip">
                <rect x={bhPad.left} y={bhPad.top} width={bhPlotW} height={bhPlotH} />
              </clipPath>
            </defs>

            {/* Grid Lines */}
            {[-0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75].map((frac, idx) => {
              const hVal = hMin + (frac + 1) * 0.5 * (hMax - hMin);
              const bVal = bMin + (frac + 1) * 0.5 * (bMax - bMin);
              const x = mapBhX(hVal);
              const y = mapBhY(bVal);
              return (
                <g key={idx}>
                  <line
                    x1={x}
                    y1={bhPad.top}
                    x2={x}
                    y2={bhPad.top + bhPlotH}
                    stroke="#1e293b"
                    strokeDasharray="3 3"
                  />
                  <text
                    x={x}
                    y={bhPad.top + bhPlotH + 15}
                    textAnchor="middle"
                    className="fill-slate-500 text-[9px] font-mono"
                  >
                    {hVal.toFixed(0)}
                  </text>
                  <line
                    x1={bhPad.left}
                    y1={y}
                    x2={bhPad.left + bhPlotW}
                    y2={y}
                    stroke="#1e293b"
                    strokeDasharray="3 3"
                  />
                  <text
                    x={bhPad.left - 6}
                    y={y + 3}
                    textAnchor="end"
                    className="fill-slate-500 text-[9px] font-mono"
                  >
                    {bVal.toFixed(0)}
                  </text>
                </g>
              );
            })}

            {/* Origin Axes H=0, B=0 */}
            <g clipPath="url(#bh-sat-clip)">
              <line
                x1={mapBhX(0)}
                y1={bhPad.top}
                x2={mapBhX(0)}
                y2={bhPad.top + bhPlotH}
                stroke="#334155"
                strokeWidth={1.2}
              />
              <line
                x1={bhPad.left}
                y1={mapBhY(0)}
                x2={bhPad.left + bhPlotW}
                y2={mapBhY(0)}
                stroke="#334155"
                strokeWidth={1.2}
              />

              {/* Saturation Danger Shaded Zones (|B| > Bsat_active) */}
              <rect
                x={bhPad.left}
                y={bhPad.top}
                width={bhPlotW}
                height={Math.max(0, mapBhY(Bsat_active_mT) - bhPad.top)}
                fill="#f43f5e"
                fillOpacity={0.08}
              />
              <rect
                x={bhPad.left}
                y={mapBhY(-Bsat_active_mT)}
                width={bhPlotW}
                height={Math.max(0, bhPad.top + bhPlotH - mapBhY(-Bsat_active_mT))}
                fill="#f43f5e"
                fillOpacity={0.08}
              />

              {/* Horizontal +/- Bsat(T_core) Asymptotes */}
              <line
                x1={bhPad.left}
                y1={mapBhY(Bsat_active_mT)}
                x2={bhPad.left + bhPlotW}
                y2={mapBhY(Bsat_active_mT)}
                stroke="#f43f5e"
                strokeWidth={1.3}
                strokeDasharray="5 4"
              />
              <text
                x={bhPad.left + 8}
                y={mapBhY(Bsat_active_mT) - 5}
                className="fill-rose-400 text-[10px] font-mono font-bold"
              >
                +B_sat({activeTemp_C.toFixed(0)}°C) = +{Bsat_active_mT.toFixed(0)} mT
              </text>

              <line
                x1={bhPad.left}
                y1={mapBhY(-Bsat_active_mT)}
                x2={bhPad.left + bhPlotW}
                y2={mapBhY(-Bsat_active_mT)}
                stroke="#f43f5e"
                strokeWidth={1.3}
                strokeDasharray="5 4"
              />
              <text
                x={bhPad.left + 8}
                y={mapBhY(-Bsat_active_mT) + 12}
                className="fill-rose-400 text-[10px] font-mono font-bold"
              >
                -B_sat({activeTemp_C.toFixed(0)}°C) = -{Bsat_active_mT.toFixed(0)} mT
              </text>

              {/* 80% Knee Marker Line */}
              <line
                x1={bhPad.left}
                y1={mapBhY(0.8 * Bsat_active_mT)}
                x2={bhPad.left + bhPlotW}
                y2={mapBhY(0.8 * Bsat_active_mT)}
                stroke="#f59e0b"
                strokeWidth={1}
                strokeDasharray="2 4"
              />
              <text
                x={bhPad.left + bhPlotW - 8}
                y={mapBhY(0.8 * Bsat_active_mT) - 4}
                textAnchor="end"
                className="fill-amber-400/80 text-[9px] font-mono"
              >
                80% Knee (+{(0.8 * Bsat_active_mT).toFixed(0)} mT)
              </text>

              {/* Comparison Ferrite Materials Overlay */}
              {showAllMaterials &&
                materialComparisons
                  .filter((m) => m.id !== res.material.id)
                  .map((m) => (
                    <path
                      key={m.id}
                      d={buildBhCurvePath(m.bsatT_mT, m.hChar_Am)}
                      fill="none"
                      stroke={m.color}
                      strokeWidth={1.3}
                      strokeOpacity={0.45}
                      strokeDasharray="4 3"
                    />
                  ))}

              {/* Active Material 25°C Cold-Start B-H Reference Curve */}
              {show25CReference && (
                <path
                  d={buildBhCurvePath(
                    Bsat_25C_mT,
                    (Bsat_25C_mT * 1e-3) / (mu0 * mu_e)
                  )}
                  fill="none"
                  stroke="#38bdf8"
                  strokeWidth={1.5}
                  strokeDasharray="6 3"
                  strokeOpacity={0.75}
                />
              )}

              {/* Active Material Anhysteretic B-H Curve at T_core */}
              <path
                d={buildBhCurvePath(Bsat_active_mT, H_char_active_Am)}
                fill="none"
                stroke={MATERIAL_COLORS[res.material.id] || '#a855f7'}
                strokeWidth={2.6}
              />

              {/* Active Operating Trajectory Loop (H(t), B(t)) */}
              <path
                d={activeLoopPath}
                fill="#06b6d4"
                fillOpacity={0.18}
                stroke="#22d3ee"
                strokeWidth={2.2}
              />

              {/* Vertical Saturation Headroom Vector at Peak Operating Point */}
              {(() => {
                const pkX = mapBhX(cycleStats.Hmax_Am);
                const pkY = mapBhY(cycleStats.Bmax_mT);
                const satY = mapBhY(Bsat_active_mT);
                return (
                  <g>
                    <line
                      x1={pkX}
                      y1={pkY}
                      x2={pkX}
                      y2={satY}
                      stroke="#10b981"
                      strokeWidth={2}
                      strokeDasharray="3 2"
                    />
                    <circle cx={pkX} cy={pkY} r={3.5} fill="#10b981" />
                    <circle cx={pkX} cy={satY} r={3.5} fill="#f43f5e" />
                    <rect
                      x={Math.min(bhPad.left + bhPlotW - 140, Math.max(bhPad.left + 4, pkX + 8))}
                      y={(pkY + satY) / 2 - 10}
                      width={132}
                      height={18}
                      rx={3}
                      fill="#14171f"
                      stroke="#10b981"
                      strokeWidth={1}
                    />
                    <text
                      x={Math.min(bhPad.left + bhPlotW - 74, Math.max(bhPad.left + 70, pkX + 74))}
                      y={(pkY + satY) / 2 + 2}
                      textAnchor="middle"
                      className="fill-emerald-400 text-[9.5px] font-mono font-bold"
                    >
                      ΔB = {cycleStats.headroom_mT.toFixed(0)}mT ({cycleStats.headroom_pct.toFixed(0)}%)
                    </text>
                  </g>
                );
              })()}

              {/* Incremental Permeability Tangent Line at Instantaneous Operating Point */}
              {showTangentSlope &&
                (() => {
                  const h0 = cursorSample.H_inst_Am;
                  const b0 = cursorSample.B_inst_mT;
                  // dB/dH in mT / (A/m)
                  const slope_mT_per_Am =
                    (Bsat_active_mT / Math.max(1, H_char_active_Am)) *
                    (cursorSample.mu_inc_pct / 100);
                  const dH = (hMax - hMin) * 0.14;
                  const x1 = mapBhX(h0 - dH);
                  const y1 = mapBhY(b0 - slope_mT_per_Am * dH);
                  const x2 = mapBhX(h0 + dH);
                  const y2 = mapBhY(b0 + slope_mT_per_Am * dH);
                  return (
                    <line
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke="#10b981"
                      strokeWidth={1.8}
                      strokeDasharray="4 2"
                    />
                  );
                })()}

              {/* Instantaneous Operating Point Cursor (H(t), B(t)) */}
              {(() => {
                const cx = mapBhX(cursorSample.H_inst_Am);
                const cy = mapBhY(cursorSample.B_inst_mT);
                return (
                  <g>
                    <circle
                      cx={cx}
                      cy={cy}
                      r={9}
                      fill="#22d3ee"
                      fillOpacity={0.25}
                    />
                    <circle
                      cx={cx}
                      cy={cy}
                      r={5}
                      fill="#22d3ee"
                      stroke="#14171f"
                      strokeWidth={1.5}
                    />
                    <text
                      x={cx + 10}
                      y={cy - 8}
                      className="fill-cyan-300 text-[10px] font-mono font-bold"
                    >
                      ({cursorSample.H_inst_Am.toFixed(0)} A/m, {cursorSample.B_inst_mT.toFixed(0)} mT)
                    </text>
                  </g>
                );
              })()}
            </g>

            {/* Axis Titles */}
            <text
              x={bhPad.left + bhPlotW / 2}
              y={bhSvgH - 8}
              textAnchor="middle"
              className="fill-slate-400 text-[10px] font-mono"
            >
              Magnetic Field Intensity H(t) [A/m] (Proportional to Np·Im(t)/le)
            </text>
            <text
              x={14}
              y={bhPad.top + bhPlotH / 2}
              textAnchor="middle"
              transform={`rotate(-90 14 ${bhPad.top + bhPlotH / 2})`}
              className="fill-slate-400 text-[10px] font-mono"
            >
              Flux Density B(t) [mT]
            </text>
          </svg>

          {/* Legend Strip */}
          <div className="flex flex-wrap items-center gap-3 text-[10px] font-mono text-slate-400 pt-1">
            <span className="inline-flex items-center gap-1">
              <span
                className="w-3 h-0.5 inline-block"
                style={{ backgroundColor: MATERIAL_COLORS[res.material.id] || '#a855f7' }}
              />
              {res.material.id} @ {activeTemp_C.toFixed(0)}°C
            </span>
            {show25CReference && (
              <span className="inline-flex items-center gap-1">
                <span className="w-3 h-0.5 inline-block bg-sky-400" />
                {res.material.id} @ 25°C
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <span className="w-3 h-2 inline-block bg-blue-400/30 border border-blue-400" />
              Active Trajectory (H(t), B(t))
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full inline-block bg-blue-400" />
              Instantaneous Cursor
            </span>
          </div>
        </div>

        {/* RIGHT CANVAS: TIME-DOMAIN INSTANTANEOUS B(t) & H(t) WAVEFORMS */}
        <InteractiveChart
          title="2. Instantaneous B(t) & Nonlinear Field Peaking H(t) Over Switching Cycle"
          subtitle={`ΔB_pp = ${cycleStats.deltaB_pp_mT.toFixed(1)} mT · f_sw = ${state.fsw_kHz} kHz · Click to scrub time cursor`}
          data={cycleWaveforms}
          xKey="t_us"
          xLabel="t"
          xUnit="µs"
          domainEvaluator={evalTimeDomainAtUs}
          currentX={Number(cursorSample.t_us.toFixed(3))}
          currentXLabel={`t=${cursorSample.t_us.toFixed(2)}µs`}
          onSelectX={(tVal) => {
            const Tsw_us = 1000 / Math.max(1, state.fsw_kHz);
            const u = ((tVal / Tsw_us) % 1 + 1) % 1;
            setIsPlaying(false);
            setPhaseCursor(u);
          }}
          horizontalMarkers={[
            {
              value: Number(Bsat_active_mT.toFixed(0)),
              label: `+Bsat(${activeTemp_C.toFixed(0)}°C) = +${Bsat_active_mT.toFixed(0)} mT`,
              color: '#f43f5e',
              axis: 'left',
              dashed: true,
            },
            {
              value: Number((0.8 * Bsat_active_mT).toFixed(0)),
              label: `80% Knee (+${(0.8 * Bsat_active_mT).toFixed(0)} mT)`,
              color: '#f59e0b',
              axis: 'left',
              dashed: true,
            },
            {
              value: Number((-Bsat_active_mT).toFixed(0)),
              label: `-Bsat = -${Bsat_active_mT.toFixed(0)} mT`,
              color: '#f43f5e',
              axis: 'left',
              dashed: true,
            },
          ]}
          series={[
            {
              key: 'B_inst_mT',
              name: 'Instantaneous Flux B(t)',
              unit: 'mT',
              color: '#22d3ee',
              axis: 'left',
            },
            {
              key: 'H_inst_Am',
              name: 'Nonlinear Magnetizing Field H(t)',
              unit: 'A/m',
              color: '#f59e0b',
              axis: 'right',
              dashed: true,
            },
          ]}
        />
      </div>

      {/* MULTI-MATERIAL SATURATION HEADROOM BENCHMARK MATRIX & GOVERNING EQUATIONS */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <div className="xl:col-span-8 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-lg p-3">
          <div className="text-[13px] font-medium text-slate-900 dark:text-[#eef0f5] mb-2">
            Multi-Ferrite Saturation Headroom &amp; Permeability Retention Comparison (@ T_core = {activeTemp_C.toFixed(0)}°C, |B_max| = {cycleStats.absBmax_mT.toFixed(1)} mT)
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs font-mono">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 text-[10px]">
                  <th className="py-1.5 pr-2">Ferrite Grade</th>
                  <th className="py-1.5 pr-2">B_sat(25°C)</th>
                  <th className="py-1.5 pr-2">B_sat({activeTemp_C.toFixed(0)}°C)</th>
                  <th className="py-1.5 pr-2">Headroom ΔB</th>
                  <th className="py-1.5 pr-2">B_sat Utilization</th>
                  <th className="py-1.5 pr-2">µ_inc Retained @ Peak</th>
                  <th className="py-1.5">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800/60">
                {materialComparisons.map((m) => {
                  const isCurrent = m.id === res.material.id;
                  return (
                    <tr
                      key={m.id}
                      className={isCurrent ? 'bg-purple-500/10' : 'hover:bg-slate-800/40'}
                    >
                      <td className="py-1.5 pr-2 font-semibold flex items-center gap-1.5">
                        <span
                          className="w-2.5 h-2.5 rounded-full inline-block"
                          style={{ backgroundColor: m.color }}
                        />
                        {m.name}
                      </td>
                      <td className="py-1.5 pr-2 text-sky-400">{m.bsat25_mT.toFixed(0)} mT</td>
                      <td className="py-1.5 pr-2 text-purple-300 font-semibold">
                        {m.bsatT_mT.toFixed(0)} mT
                      </td>
                      <td
                        className={`py-1.5 pr-2 font-bold ${
                          m.headroom_mT < 45
                            ? 'text-rose-400'
                            : m.headroom_mT < 100
                            ? 'text-amber-400'
                            : 'text-emerald-400'
                        }`}
                      >
                        {m.headroom_mT >= 0 ? '+' : ''}
                        {m.headroom_mT.toFixed(0)} mT
                      </td>
                      <td className="py-1.5 pr-2">
                        <div className="flex items-center gap-1.5">
                          <div className="w-16 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                            <div
                              className={`h-full ${
                                m.util_pct >= 90
                                  ? 'bg-rose-500'
                                  : m.util_pct >= 75
                                  ? 'bg-amber-500'
                                  : 'bg-emerald-500'
                              }`}
                              style={{ width: `${Math.min(100, m.util_pct)}%` }}
                            />
                          </div>
                          <span>{m.util_pct.toFixed(1)}%</span>
                        </div>
                      </td>
                      <td className="py-1.5 pr-2 text-blue-400">
                        {m.muRetained_pct.toFixed(1)}%
                      </td>
                      <td className="py-1.5">
                        {isCurrent ? (
                          <span className="px-2 py-0.5 text-[10px] rounded bg-purple-600 text-white font-bold">
                            Active
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setDcdcField('materialId', m.id)}
                            className="px-2 py-0.5 text-[10px] rounded bg-slate-800 hover:bg-purple-600 text-slate-300 hover:text-white cursor-pointer"
                          >
                            Select
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Governing Nonlinear Magnetics Equations */}
        <div className="xl:col-span-4 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-lg p-3 flex flex-col justify-between space-y-2">
          <div className="text-[13px] font-medium text-slate-900 dark:text-[#eef0f5]">
            Instantaneous Field &amp; Headroom Equations
          </div>
          <div className="space-y-2 text-xs">
            <div className="p-2 rounded bg-slate-950/70 border border-slate-800">
              <div className="text-[10px] font-mono text-slate-400 mb-1">
                1. Instantaneous Faraday Flux &amp; DC Bias Trajectory:
              </div>
              <MathFormula tex="B(t) = B_{\text{dc}} + \frac{1}{N_p A_e}\int_0^t v_{\text{pri}}(\tau)\,\mathrm{d}\tau" />
            </div>
            <div className="p-2 rounded bg-slate-950/70 border border-slate-800">
              <div className="text-[10px] font-mono text-slate-400 mb-1">
                2. Thermal Brillouin Saturation &amp; Incremental Permeability:
              </div>
              <MathFormula tex="B(H,T) = B_{\text{sat}}(T)\tanh\!\left(\frac{H}{H_{\text{char}}}\right), \quad \frac{\mu_{\text{inc}}(H)}{\mu_e} = \operatorname{sech}^2\!\left(\frac{H}{H_{\text{char}}}\right)" />
            </div>
            <div className="p-2 rounded bg-slate-950/70 border border-slate-800">
              <div className="text-[10px] font-mono text-slate-400 mb-1">
                3. Real-Time Thermal Saturation Headroom:
              </div>
              <MathFormula tex="\Delta B_{\text{headroom}}(T_{\text{core}}) = B_{\text{sat}}(T_{\text{core}}) - \max_{t \in [0,T_{\text{sw}}]} |B(t)|" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
