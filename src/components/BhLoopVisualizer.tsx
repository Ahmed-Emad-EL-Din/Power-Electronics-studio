import React, { useState, useMemo, useEffect } from 'react';
import { DcDcResults } from '../engine/dcdcEngine';
import { CORE_DATABASE, MATERIAL_DATABASE } from '../data/databases';
import { MathFormula } from './MathFormula';
import { useDesignSolver, useLockableValue } from './DesignSolverContext';
import { LockToggleButton } from './AutoSolverControls';
import {
  Magnet,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  AlertTriangle,
  ShieldCheck,
  Compass,
  Flame,
  Sliders,
  Check,
  Download,
} from 'lucide-react';

interface BhLoopVisualizerProps {
  res: DcDcResults;
  pinnedRes?: DcDcResults | null;
  onUpdateField?: (field: string, value: number | string | boolean) => void;
}

export const BhLoopVisualizer: React.FC<BhLoopVisualizerProps> = ({
  res,
  pinnedRes,
  onUpdateField,
}) => {
  const { bhLoopAnalysis: bh, coreThermalAnalysis: ct, core, material, state } = res;
  const { dcdcLocked, toggleDcdcLock, dcdcChanges, applyDcdcPatch, setDcdcField } = useDesignSolver();

  // Interactive What-If controls inside the B-H & Steinmetz Core Heating Visualizer
  const dcBiasLock = useLockableValue<number>(0, false);
  const dcBiasCurrent_A = dcBiasLock.value;
  const [zoomToMinorLoop, setZoomToMinorLoop] = useState<boolean>(false);
  const [bhZoomFactor, setBhZoomFactor] = useState<number>(1.0);
  const [bhPan, setBhPan] = useState<{ h: number; b: number }>({ h: 0, b: 0 });
  const [dragStart, setDragStart] = useState<{
    clientX: number;
    clientY: number;
    h0: number;
    b0: number;
  } | null>(null);
  const [showMajorEnvelope, setShowMajorEnvelope] = useState<boolean>(true);
  const [show25CCurve, setShow25CCurve] = useState<boolean>(true);
  const [hoverPhaseIdx, setHoverPhaseIdx] = useState<number | null>(null);
  const [phaseLocked, setPhaseLocked] = useState<boolean>(false);

  // Interactive What-If Switching Frequency & Flux Swing Explorer (synced with converter when converter state changes)
  const [sandboxActive, setSandboxActive] = useState<boolean>(false);
  const [testFsw_kHz, setTestFsw_kHz] = useState<number>(state.fsw_kHz);
  const [testBpk_mT, setTestBpk_mT] = useState<number>(Number(bh.Bpk_mT.toFixed(1)));

  useEffect(() => {
    if (!sandboxActive) {
      setTestFsw_kHz(state.fsw_kHz);
      setTestBpk_mT(Number(bh.Bpk_mT.toFixed(1)));
    }
  }, [state.fsw_kHz, bh.Bpk_mT, sandboxActive]);

  const Ae_m2 = core.Ae_mm2 * 1e-6;
  const le_m = core.le_mm * 1e-3;
  const Ve_m3 = core.Ve_mm3 * 1e-9;
  const MU_0 = 4 * Math.PI * 1e-7;

  // Live Steinmetz + iGSE + Core Heating evaluation at active (or sandbox What-If) fsw and Bpk
  const activeSteinmetzMetrics = useMemo(() => {
    const f_Hz = (sandboxActive ? testFsw_kHz : state.fsw_kHz) * 1e3;
    const bPk_mT_eff = sandboxActive ? testBpk_mT : bh.Bpk_mT;
    const bPk_T_eff = Math.max(0.002, bPk_mT_eff * 1e-3);
    const dB_T_eff = 2 * bPk_T_eff;
    const dClamped = Math.max(0.05, Math.min(0.98, res.Deff_nom));
    // Base volumetric loss at T_opt (W/m^3)
    const pv_se_base = ct.k_eff * Math.pow(f_Hz, ct.alpha_eff) * Math.pow(bPk_T_eff, ct.beta_eff);
    const dbdt_active = (2 * dB_T_eff * f_Hz) / dClamped;
    const pv_igse_base =
      ct.ki_eff *
      Math.pow(dB_T_eff, ct.beta_eff - ct.alpha_eff) *
      dClamped *
      Math.pow(dbdt_active, ct.alpha_eff);

    // DC bias core loss multiplier (Premagnetization effect in ferrites: Pv increases with H_dc)
    const H_dc_Am = (res.Np_actual * dcBiasCurrent_A) / le_m;
    const dcBiasLossMult = 1 + 0.45 * Math.pow(H_dc_Am / Math.max(bh.H_char_100C_Am, 1), 1.6);

    // Iterative thermal equilibrium with parabolic ferrite temperature curve F_temp(Tcore)
    let tCore_eq_C =
      state.Tamb_C +
      ((pv_igse_base * dcBiasLossMult * Ve_m3 * res.nPhases + ct.Pcu_W) / res.nPhases) * core.Rth_core_CW;
    let tempFactor = 1.0;
    for (let iter = 0; iter < 6; iter++) {
      const dT_opt = tCore_eq_C - ct.T_opt_eff_C;
      tempFactor = Math.max(0.75, Math.min(2.8, 1 + ct.c2_eff * dT_opt * dT_opt));
      const pCore_iter = Math.max(0.1, pv_igse_base * dcBiasLossMult * tempFactor * Ve_m3 * res.nPhases);
      tCore_eq_C = Math.min(
        240,
        state.Tamb_C + ((pCore_iter + ct.Pcu_W) / res.nPhases) * core.Rth_core_CW
      );
    }

    const pv_igse_W_m3 = pv_igse_base * dcBiasLossMult * tempFactor;
    const pv_se_W_m3 = pv_se_base * dcBiasLossMult * tempFactor;
    const pCore_igse_W = Math.max(0.1, pv_igse_W_m3 * Ve_m3 * res.nPhases);
    const pCore_se_W = Math.max(0.1, pv_se_W_m3 * Ve_m3 * res.nPhases);

    const deltaT_fe_C = (pCore_igse_W / res.nPhases) * core.Rth_core_CW;
    const deltaT_cu_C = (ct.Pcu_W / res.nPhases) * core.Rth_core_CW;
    const deltaT_total_C = deltaT_fe_C + deltaT_cu_C;
    const tCore_hotspot_C = state.Tamb_C + 1.22 * deltaT_total_C;

    // Volumetric hysteresis energy per cycle w_core = oint(H dB) = Pv / f_Hz [J/m^3]
    const w_cycle_J_m3 = pv_igse_W_m3 / Math.max(f_Hz, 1);
    const e_cycle_mJ = (pCore_igse_W / (f_Hz * res.nPhases)) * 1e3;

    // Dynamic coercive half-width Hc_eff from Steinmetz core loss: Hc_eff = w_cycle / (pi * Bpk)
    const H_pk_scaled_Am = bh.H_pk_Am * (bPk_mT_eff / Math.max(bh.Bpk_mT, 1));
    const Hc_dyn_Am = w_cycle_J_m3 / Math.max(Math.PI * bPk_T_eff, 1e-6);
    const Hc_eff_Am = Math.min(Math.max(8, Hc_dyn_Am), Math.max(H_pk_scaled_Am * 0.72, 16));

    // Equivalent primary turns Np required to produce testBpk_mT at testFsw_kHz
    const voltSec_test =
      res.state.Vin_nom_V *
      (res.state.topology.includes('llc') ? 0.5 : 1.0) *
      (res.Deff_nom * (1 / f_Hz) * 0.5);
    const Np_for_test = Math.max(1, Math.round(voltSec_test / (2 * bPk_T_eff * Ae_m2)));

    return {
      fsw_kHz: sandboxActive ? testFsw_kHz : state.fsw_kHz,
      bPk_mT: bPk_mT_eff,
      deltaB_mT: bPk_mT_eff * 2,
      H_pk_Am: H_pk_scaled_Am,
      Hc_eff_Am: Number(Hc_eff_Am.toFixed(1)),
      w_cycle_J_m3: Number(w_cycle_J_m3.toFixed(1)),
      e_cycle_mJ: Number(e_cycle_mJ.toFixed(3)),
      pv_igse_kW_m3: Number((pv_igse_W_m3 * 1e-3).toFixed(1)),
      pv_se_kW_m3: Number((pv_se_W_m3 * 1e-3).toFixed(1)),
      pCore_igse_W: Number(pCore_igse_W.toFixed(2)),
      pCore_se_W: Number(pCore_se_W.toFixed(2)),
      tempFactor: Number(tempFactor.toFixed(3)),
      deltaT_fe_C: Number(deltaT_fe_C.toFixed(1)),
      deltaT_cu_C: Number(deltaT_cu_C.toFixed(1)),
      deltaT_total_C: Number(deltaT_total_C.toFixed(1)),
      tCore_eq_C: Number(tCore_eq_C.toFixed(1)),
      tCore_hotspot_C: Number(tCore_hotspot_C.toFixed(1)),
      Np_for_test,
    };
  }, [
    sandboxActive,
    testFsw_kHz,
    testBpk_mT,
    state.fsw_kHz,
    state.Tamb_C,
    bh.Bpk_mT,
    bh.H_pk_Am,
    bh.H_char_100C_Am,
    ct,
    res.Deff_nom,
    res.Np_actual,
    res.nPhases,
    res.state.Vin_nom_V,
    res.state.topology,
    dcBiasCurrent_A,
    le_m,
    Ve_m3,
    Ae_m2,
    core.Rth_core_CW,
  ]);

  // Recompute the active operating B-H loop under current/sandbox (fsw, Bpk, Steinmetz Hc) + DC bias
  const biasedLoop = useMemo(() => {
    const H_dc_Am = (res.Np_actual * dcBiasCurrent_A) / le_m;
    const H_char = Math.max(bh.H_char_100C_Am, 1e-3);
    const Bsat_100_mT = bh.Bsat_100C_mT;
    const activeBpk_mT = activeSteinmetzMetrics.bPk_mT;
    const activeHpk_Am = activeSteinmetzMetrics.H_pk_Am;
    const activeHc_Am = activeSteinmetzMetrics.Hc_eff_Am;

    const evalBAnh100 = (h_Am: number) =>
      Bsat_100_mT * Math.tanh(h_Am / H_char) + MU_0 * h_Am * 1e3;

    const B_bias_center_mT = evalBAnh100(H_dc_Am);
    const B_upper_target_mT = B_bias_center_mT + activeBpk_mT;

    const points: {
      phase_deg: number;
      H_Am: number;
      Im_A: number;
      B_mT: number;
      mu_inc_rel: number;
    }[] = [];

    const nSteps = 72;
    let maxH = -Infinity;
    let minH = Infinity;
    let maxB = -Infinity;
    let minB = Infinity;

    for (let i = 0; i <= nSteps; i++) {
      const theta = (2 * Math.PI * i) / nSteps;
      const sinT = Math.sin(theta);
      const cosT = Math.cos(theta);

      const bIdeal_mT = B_bias_center_mT + activeBpk_mT * sinT;
      const normB = Math.max(-0.985, Math.min(0.985, bIdeal_mT / Math.max(Bsat_100_mT, 1)));
      const hAnh_Am =
        dcBiasCurrent_A === 0 && !sandboxActive
          ? activeHpk_Am * sinT
          : H_char * 0.5 * Math.log((1 + normB) / (1 - normB));

      // Steinmetz core loss directly governs the loop coercive width activeHc_Am!
      const hLoop_Am = hAnh_Am + activeHc_Am * cosT * (1 - 0.2 * sinT * sinT);
      const bActual_mT =
        dcBiasCurrent_A === 0 && !sandboxActive
          ? activeBpk_mT * sinT
          : evalBAnh100(hAnh_Am);

      const im_A = (hLoop_Am * le_m) / res.Np_actual;
      const sechVal = 1 / Math.cosh(Math.min(Math.abs(hLoop_Am) / H_char, 10));
      const mu_inc_rel = Math.max(1, res.mu_e_actual * sechVal * sechVal);

      if (hLoop_Am > maxH) maxH = hLoop_Am;
      if (hLoop_Am < minH) minH = hLoop_Am;
      if (bActual_mT > maxB) maxB = bActual_mT;
      if (bActual_mT < minB) minB = bActual_mT;

      points.push({
        phase_deg: Math.round((theta * 180) / Math.PI),
        H_Am: Number(hLoop_Am.toFixed(1)),
        Im_A: Number(im_A.toFixed(3)),
        B_mT: Number(bActual_mT.toFixed(1)),
        mu_inc_rel: Number(mu_inc_rel.toFixed(0)),
      });
    }

    const peakB_mT = Math.max(Math.abs(maxB), Math.abs(minB), Math.abs(B_upper_target_mT), activeBpk_mT);
    const satRatio_100C_pct = (peakB_mT / Math.max(Bsat_100_mT, 1)) * 100;
    const headroom_mT = Bsat_100_mT - peakB_mT;

    return {
      points,
      H_dc_Am,
      maxH,
      minH,
      maxB,
      minB,
      deltaB_actual_mT: maxB - minB,
      peakB_mT,
      satRatio_100C_pct,
      headroom_mT,
    };
  }, [
    bh,
    activeSteinmetzMetrics,
    dcBiasCurrent_A,
    sandboxActive,
    le_m,
    res.Np_actual,
    res.mu_e_actual,
    MU_0,
  ]);

  // SVG coordinate system setup
  const svgW = 760;
  const svgH = 440;
  const padL = 68;
  const padR = 135;
  const padT = 32;
  const padB = 48;
  const plotW = svgW - padL - padR;
  const plotH = svgH - padT - padB;

  const hDomainMax = useMemo(() => {
    const majorMax = Math.abs(bh.majorCurve[bh.majorCurve.length - 1]?.H_Am || 250);
    const loopMax = Math.max(Math.abs(biasedLoop.maxH), Math.abs(biasedLoop.minH), bh.H_pk_Am * 1.35);
    const base = zoomToMinorLoop
      ? Math.max(loopMax * 1.45, activeSteinmetzMetrics.Hc_eff_Am * 3.0, 40)
      : Math.max(majorMax, loopMax * 1.15);
    return base / Math.max(0.25, bhZoomFactor);
  }, [bh, biasedLoop.maxH, biasedLoop.minH, activeSteinmetzMetrics.Hc_eff_Am, zoomToMinorLoop, bhZoomFactor]);

  const bDomainMax = useMemo(() => {
    const base = zoomToMinorLoop
      ? Math.min(
          bh.Bsat_25C_mT * 1.18,
          Math.max(Math.abs(biasedLoop.maxB), Math.abs(biasedLoop.minB), activeSteinmetzMetrics.bPk_mT) * 1.45,
          80
        )
      : bh.Bsat_25C_mT * 1.18;
    return base / Math.max(0.25, bhZoomFactor);
  }, [bh.Bsat_25C_mT, activeSteinmetzMetrics.bPk_mT, biasedLoop.maxB, biasedLoop.minB, zoomToMinorLoop, bhZoomFactor]);

  const hMinDom = bhPan.h - hDomainMax;
  const hMaxDom = bhPan.h + hDomainMax;
  const bMinDom = bhPan.b - bDomainMax;
  const bMaxDom = bhPan.b + bDomainMax;

  const toX = (h: number) => {
    const clamped = Math.max(hMinDom, Math.min(hMaxDom, h));
    return padL + ((clamped - hMinDom) / Math.max(1e-6, hMaxDom - hMinDom)) * plotW;
  };

  const toY = (b: number) => {
    const clamped = Math.max(bMinDom, Math.min(bMaxDom, b));
    return padT + ((bMaxDom - clamped) / Math.max(1e-6, bMaxDom - bMinDom)) * plotH;
  };

  const zeroX = toX(0);
  const zeroY = toY(0);

  const anh100Path = useMemo(
    () =>
      bh.majorCurve
        .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${toX(p.H_Am).toFixed(1)} ${toY(p.B_anh_100C_mT).toFixed(1)}`)
        .join(' '),
    [bh.majorCurve, hDomainMax, bDomainMax]
  );

  const anh25Path = useMemo(
    () =>
      bh.majorCurve
        .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${toX(p.H_Am).toFixed(1)} ${toY(p.B_anh_25C_mT).toFixed(1)}`)
        .join(' '),
    [bh.majorCurve, hDomainMax, bDomainMax]
  );

  const linearPath = useMemo(
    () =>
      bh.majorCurve
        .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${toX(p.H_Am).toFixed(1)} ${toY(p.B_linear_mT).toFixed(1)}`)
        .join(' '),
    [bh.majorCurve, hDomainMax, bDomainMax]
  );

  const majorEnvelopePolygon = useMemo(() => {
    const upPts = bh.majorCurve.map(
      (p) => `${toX(p.H_Am).toFixed(1)},${toY(p.B_major_up_100C_mT).toFixed(1)}`
    );
    const downPts = [...bh.majorCurve]
      .reverse()
      .map((p) => `${toX(p.H_Am).toFixed(1)},${toY(p.B_major_down_100C_mT).toFixed(1)}`);
    return [...upPts, ...downPts].join(' ');
  }, [bh.majorCurve, hDomainMax, bDomainMax]);

  const minorLoopPolygon = useMemo(
    () =>
      biasedLoop.points
        .map((p) => `${toX(p.H_Am).toFixed(1)},${toY(p.B_mT).toFixed(1)}`)
        .join(' '),
    [biasedLoop.points, hDomainMax, bDomainMax]
  );

  const pinnedMinorLoopPolygon = useMemo(() => {
    if (!pinnedRes?.bhLoopAnalysis) return null;
    return pinnedRes.bhLoopAnalysis.minorLoop
      .map((p) => `${toX(p.H_Am).toFixed(1)},${toY(p.B_mT).toFixed(1)}`)
      .join(' ');
  }, [pinnedRes, hDomainMax, bDomainMax]);

  const activeHoverPoint =
    hoverPhaseIdx !== null && biasedLoop.points[hoverPhaseIdx]
      ? biasedLoop.points[hoverPhaseIdx]
      : biasedLoop.points[18];

  const exceedsDatasheetBsat = biasedLoop.peakB_mT > bh.Bsat_100C_mT;
  const isSaturating = !exceedsDatasheetBsat && biasedLoop.satRatio_100C_pct >= 85;
  const isWarning = !exceedsDatasheetBsat && biasedLoop.satRatio_100C_pct >= 70 && biasedLoop.satRatio_100C_pct < 85;

  const yBsat100Pos = toY(bh.Bsat_100C_mT);
  const yBsat100Neg = toY(-bh.Bsat_100C_mT);
  const yBsat25Pos = toY(bh.Bsat_25C_mT);
  const yBsat25Neg = toY(-bh.Bsat_25C_mT);
  const yBmaxLoop = toY(biasedLoop.maxB);
  const yBminLoop = toY(biasedLoop.minB);

  const ptAsc = biasedLoop.points[2] || biasedLoop.points[0];
  const ptDesc = biasedLoop.points[38] || biasedLoop.points[36];

  const handleSvgMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (phaseLocked) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = ((e.clientX - rect.left) / rect.width) * svgW;
    const sy = ((e.clientY - rect.top) / rect.height) * svgH;
    if (sx < padL || sx > padL + plotW || sy < padT || sy > padT + plotH) return;
    let bestIdx = 0;
    let bestDist = Infinity;
    biasedLoop.points.forEach((pt, idx) => {
      const dx = toX(pt.H_Am) - sx;
      const dy = toY(pt.B_mT) - sy;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestDist) {
        bestDist = d2;
        bestIdx = idx;
      }
    });
    setHoverPhaseIdx(bestIdx);
  };

  const handleSvgClick = () => {
    setPhaseLocked((locked) => !locked);
  };

  const exportBhCsv = () => {
    const headers = ['Phase_deg', 'H_Am', 'Im_A', 'B_mT', 'mu_inc_rel'];
    const rows = biasedLoop.points.map((p) =>
      [p.phase_deg, p.H_Am, p.Im_A, p.B_mT, p.mu_inc_rel].join(',')
    );
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bh_loop_${core.id}_${material.id}_${activeSteinmetzMetrics.fsw_kHz}kHz.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-4">
      {/* Header Bar with Saturation & Core Heating Status Badges + Quick Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Magnet className="w-4 h-4 text-purple-400 shrink-0" />
            <h3 className="text-sm font-bold font-mono text-slate-900 dark:text-slate-100">
              4-Quadrant B-H Hysteresis Loop &amp; Steinmetz Core Heating Workstation
            </h3>
            <span
              className={`px-2 py-0.5 text-[11px] font-mono font-semibold rounded inline-flex items-center gap-1 ${
                exceedsDatasheetBsat
                  ? 'bg-rose-600 text-white border border-rose-400'
                  : isSaturating
                  ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                  : isWarning
                  ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                  : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
              }`}
            >
              {exceedsDatasheetBsat ? (
                <>
                  <AlertTriangle className="w-3.5 h-3.5" /> EXCEEDS DATASHEET B_sat ({biasedLoop.satRatio_100C_pct.toFixed(1)}% Bs)
                </>
              ) : isSaturating ? (
                <>
                  <AlertTriangle className="w-3.5 h-3.5" /> SATURATION DANGER ({biasedLoop.satRatio_100C_pct.toFixed(1)}% Bs)
                </>
              ) : isWarning ? (
                <>
                  <AlertTriangle className="w-3.5 h-3.5" /> HIGH FLUX ({biasedLoop.satRatio_100C_pct.toFixed(1)}% Bs)
                </>
              ) : (
                <>
                  <ShieldCheck className="w-3.5 h-3.5" /> SAFE FLUX ({biasedLoop.satRatio_100C_pct.toFixed(1)}% Bs)
                </>
              )}
            </span>
            <span
              className={`px-2 py-0.5 text-[11px] font-mono font-semibold rounded inline-flex items-center gap-1 ${
                activeSteinmetzMetrics.tCore_eq_C > 115
                  ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                  : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
              }`}
            >
              <Flame className="w-3.5 h-3.5" /> Tcore = {activeSteinmetzMetrics.tCore_eq_C}°C (ΔTfe=+{activeSteinmetzMetrics.deltaT_fe_C}°C, Pcore={activeSteinmetzMetrics.pCore_igse_W}W)
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-mono">
            {core.name} (<span className="text-cyan-400">Ae={core.Ae_mm2}mm²</span>,{' '}
            <span className="text-purple-400">le={core.le_mm}mm</span>,{' '}
            <span className="text-emerald-400">Ve={(core.Ve_mm3 / 1000).toFixed(2)}cm³</span>,{' '}
            <span className="text-amber-400">Rθ,core={core.Rth_core_CW}°C/W</span>) · Material:{' '}
            <strong className="text-slate-800 dark:text-slate-200">{material.name}</strong> (k={ct.k_eff}, α={ct.alpha_eff}, β={ct.beta_eff}, ki={ct.ki_eff})
          </p>
        </div>

        {/* Action & View Toggles */}
        <div className="flex flex-wrap items-center gap-1.5">
          {onUpdateField && ct.Np_opt_loss !== res.Np_actual && (
            <button
              type="button"
              onClick={() => {
                setSandboxActive(false);
                onUpdateField('Np_turns', ct.Np_opt_loss);
              }}
              className="px-2.5 py-1 text-[11px] font-mono bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 rounded inline-flex items-center gap-1 font-semibold cursor-pointer"
            >
              <Sliders className="w-3 h-3" /> Min-Loss Turns Np={ct.Np_opt_loss}T (Bopt={ct.Bpk_opt_loss_mT}mT)
            </button>
          )}
          {onUpdateField && bh.Np_opt_55pct !== res.Np_actual && (
            <button
              type="button"
              onClick={() => {
                setSandboxActive(false);
                onUpdateField('Np_turns', bh.Np_opt_55pct);
              }}
              className="px-2.5 py-1 text-[11px] font-mono bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/40 text-purple-300 rounded inline-flex items-center gap-1 font-semibold cursor-pointer"
            >
              <Sliders className="w-3 h-3" /> Auto-Size Np={bh.Np_opt_55pct}T (55% Bsat)
            </button>
          )}
          <button
            type="button"
            onClick={() => setZoomToMinorLoop((z) => !z)}
            className={`px-2.5 py-1 text-[11px] font-mono rounded border inline-flex items-center gap-1 cursor-pointer ${
              zoomToMinorLoop
                ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300 font-semibold'
                : 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300'
            }`}
          >
            {zoomToMinorLoop ? (
              <>
                <ZoomOut className="w-3.5 h-3.5" /> Full ±Bsat View
              </>
            ) : (
              <>
                <ZoomIn className="w-3.5 h-3.5" /> Zoom Operating Loop
              </>
            )}
          </button>
          <button
            type="button"
            onClick={() => setShowMajorEnvelope((v) => !v)}
            className={`px-2 py-1 text-[11px] font-mono rounded border cursor-pointer ${
              showMajorEnvelope
                ? 'bg-purple-500/15 border-purple-500/40 text-purple-300'
                : 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-500'
            }`}
          >
            Major Hyst. Envelope
          </button>
          <button
            type="button"
            onClick={() => setShow25CCurve((v) => !v)}
            className={`px-2 py-1 text-[11px] font-mono rounded border cursor-pointer ${
              show25CCurve
                ? 'bg-sky-500/15 border-sky-500/40 text-sky-300'
                : 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-500'
            }`}
          >
            25°C Cold Bsat
          </button>
            {/* Continuous Zoom In / Zoom Out / Reset Controls */}
            <div className="inline-flex items-center rounded border border-slate-300 dark:border-slate-700 overflow-hidden bg-slate-100 dark:bg-slate-900 text-[11px] font-mono">
              <button
                type="button"
                onClick={() => setBhZoomFactor((z) => Math.min(8, Number((z * 1.35).toFixed(2))))}
                className="px-2 py-1 hover:bg-cyan-500/20 text-slate-700 dark:text-slate-200 inline-flex items-center gap-0.5 cursor-pointer"
                title="Zoom In (+)"
              >
                <ZoomIn className="w-3.5 h-3.5 text-cyan-400" /> +
              </button>
              <button
                type="button"
                onClick={() => setBhZoomFactor((z) => Math.max(0.35, Number((z / 1.35).toFixed(2))))}
                className="px-2 py-1 border-l border-slate-300 dark:border-slate-700 hover:bg-cyan-500/20 text-slate-700 dark:text-slate-200 inline-flex items-center gap-0.5 cursor-pointer"
                title="Zoom Out (-)"
              >
                <ZoomOut className="w-3.5 h-3.5 text-cyan-400" /> −
              </button>
              <button
                type="button"
                onClick={() => {
                  setBhZoomFactor(1.0);
                  setBhPan({ h: 0, b: 0 });
                }}
                className="px-2 py-1 border-l border-slate-300 dark:border-slate-700 hover:bg-cyan-500/20 text-cyan-400 font-bold cursor-pointer"
                title="Reset Zoom & Pan (100%)"
              >
                {(bhZoomFactor * 100).toFixed(0)}%
              </button>
            </div>
            <button
              type="button"
              onClick={exportBhCsv}
              className="px-2 py-1 text-[11px] font-mono rounded border bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:text-white inline-flex items-center gap-1 cursor-pointer"
              title="Export active B-H hysteresis loop to CSV"
            >
              <Download className="w-3 h-3" />
              CSV
            </button>
          </div>
        </div>

        {/* Main Grid: Left = 4-Quadrant SVG B-H Curve Tracer | Right = Core Geometry & Flux Swing Telemetry */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
          {/* Left 8 Columns: 4-Quadrant Scientific SVG B-H Hysteresis Graph */}
          <div className="xl:col-span-8 bg-slate-950 border border-slate-800 rounded-lg p-3 space-y-2.5">
            {/* Top Legend & Live Point Readout */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono">
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-1.5 text-emerald-400 font-semibold">
                  <span className="w-3 h-2 rounded-xs bg-emerald-500/50 border border-emerald-400 inline-block" />
                  Active B-H Loop (ΔB={biasedLoop.deltaB_actual_mT.toFixed(0)}mT, Hc={activeSteinmetzMetrics.Hc_eff_Am}A/m)
                </span>
                <span className="inline-flex items-center gap-1.5 text-purple-400">
                  <span className="w-3 h-0.5 bg-purple-400 inline-block" />
                  B(H) @ 100°C (Bsat={bh.Bsat_100C_mT}mT)
                </span>
                {show25CCurve && (
                  <span className="inline-flex items-center gap-1.5 text-sky-400">
                    <span className="w-3 h-0.5 bg-sky-400 inline-block" />
                    B(H) @ 25°C (Bsat={bh.Bsat_25C_mT.toFixed(0)}mT)
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5 text-amber-400">
                  <span className="w-3 h-0.5 border-b border-dashed border-amber-400 inline-block" />
                  Ideal Gapped Linear (µe={res.mu_e_actual.toFixed(0)})
                </span>
              </div>
              <div className="text-slate-400">
                Phase <strong className="text-cyan-300">{activeHoverPoint.phase_deg}°</strong>: H=
                <strong className="text-amber-300">{activeHoverPoint.H_Am} A/m</strong> ({activeHoverPoint.Im_A}A) · B=
                <strong className="text-emerald-300">{activeHoverPoint.B_mT} mT</strong> · µinc=
                <strong className="text-purple-300">{activeHoverPoint.mu_inc_rel}</strong>
              </div>
            </div>

            {/* 4-Quadrant SVG B-H Plane (Wheel to Zoom, Drag to Pan) */}
            <div className="relative w-full overflow-x-auto">
              <svg
                viewBox={`0 0 ${svgW} ${svgH}`}
                className="w-full h-auto select-none cursor-grab active:cursor-grabbing bg-[#070B14] rounded border border-slate-800/90"
                onWheel={(e) => {
                  e.preventDefault();
                  const factor = e.deltaY < 0 ? 1.2 : 1 / 1.2;
                  setBhZoomFactor((z) => Math.max(0.35, Math.min(8, Number((z * factor).toFixed(2)))));
                }}
                onMouseDown={(e) => {
                  setDragStart({
                    clientX: e.clientX,
                    clientY: e.clientY,
                    h0: bhPan.h,
                    b0: bhPan.b,
                  });
                }}
                onMouseMove={(e) => {
                  if (dragStart) {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const dx = ((e.clientX - dragStart.clientX) / rect.width) * svgW;
                    const dy = ((e.clientY - dragStart.clientY) / rect.height) * svgH;
                    const dH = -(dx / plotW) * (2 * hDomainMax);
                    const dB = (dy / plotH) * (2 * bDomainMax);
                    setBhPan({ h: dragStart.h0 + dH, b: dragStart.b0 + dB });
                    return;
                  }
                  handleSvgMouseMove(e);
                }}
                onMouseUp={() => setDragStart(null)}
                onMouseLeave={() => setDragStart(null)}
                onClick={handleSvgClick}
              >
              <defs>
                <linearGradient id="bhLoopFill" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor={isSaturating ? '#f43f5e' : '#10b981'} stopOpacity="0.34" />
                  <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.16" />
                </linearGradient>
                <pattern id="satHazardPattern" width="8" height="8" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
                  <line x1="0" y1="0" x2="0" y2="8" stroke="#f43f5e" strokeWidth="1.5" strokeOpacity="0.22" />
                </pattern>
              </defs>

              {/* Upper & Lower Saturation Hazard Zones (|B| > Bsat_100C) */}
              {yBsat100Pos > padT && (
                <rect
                  x={padL}
                  y={padT}
                  width={plotW}
                  height={Math.max(0, yBsat100Pos - padT)}
                  fill="url(#satHazardPattern)"
                />
              )}
              {yBsat100Neg < padT + plotH && (
                <rect
                  x={padL}
                  y={yBsat100Neg}
                  width={plotW}
                  height={Math.max(0, padT + plotH - yBsat100Neg)}
                  fill="url(#satHazardPattern)"
                />
              )}

              {/* Active Flux Swing Horizontal Band (Bmin .. Bmax) */}
              <rect
                x={padL}
                y={Math.min(yBmaxLoop, yBminLoop)}
                width={plotW}
                height={Math.max(2, Math.abs(yBminLoop - yBmaxLoop))}
                fill={isSaturating ? '#f43f5e' : '#10b981'}
                fillOpacity="0.06"
              />

              {/* Background Grid Lines */}
              {[-0.75, -0.5, -0.25, 0.25, 0.5, 0.75].map((frac) => {
                const gx = padL + (frac + 1) * 0.5 * plotW;
                const gy = padT + (1 - (frac + 1) * 0.5) * plotH;
                const hVal = frac * hDomainMax;
                const bVal = frac * bDomainMax;
                return (
                  <g key={frac}>
                    <line
                      x1={gx}
                      y1={padT}
                      x2={gx}
                      y2={padT + plotH}
                      stroke="#1e293b"
                      strokeWidth="1"
                      strokeDasharray="3 3"
                    />
                    <line
                      x1={padL}
                      y1={gy}
                      x2={padL + plotW}
                      y2={gy}
                      stroke="#1e293b"
                      strokeWidth="1"
                      strokeDasharray="3 3"
                    />
                    <text
                      x={gx}
                      y={padT + plotH + 15}
                      textAnchor="middle"
                      className="fill-slate-500 text-[10px] font-mono"
                    >
                      {hVal >= 0 ? `+${hVal.toFixed(0)}` : hVal.toFixed(0)}
                    </text>
                    <text
                      x={padL - 8}
                      y={gy + 3}
                      textAnchor="end"
                      className="fill-slate-500 text-[10px] font-mono"
                    >
                      {bVal >= 0 ? `+${bVal.toFixed(0)}` : bVal.toFixed(0)}
                    </text>
                  </g>
                );
              })}

              {/* 4-Quadrant Origin Axes (H = 0, B = 0) */}
              <line
                x1={zeroX}
                y1={padT}
                x2={zeroX}
                y2={padT + plotH}
                stroke="#475569"
                strokeWidth="1.5"
              />
              <line
                x1={padL}
                y1={zeroY}
                x2={padL + plotW}
                y2={zeroY}
                stroke="#475569"
                strokeWidth="1.5"
              />

              {/* +Bsat and -Bsat Horizontal Asymptote Lines (100°C & 25°C) */}
              {show25CCurve && yBsat25Pos >= padT && yBsat25Pos <= padT + plotH && (
                <>
                  <line
                    x1={padL}
                    y1={yBsat25Pos}
                    x2={padL + plotW}
                    y2={yBsat25Pos}
                    stroke="#38bdf8"
                    strokeWidth="1"
                    strokeDasharray="6 4"
                    strokeOpacity="0.65"
                  />
                  <text
                    x={padL + 6}
                    y={yBsat25Pos - 4}
                    className="fill-sky-400 text-[10px] font-mono"
                  >
                    +Bsat(25°C) = +{bh.Bsat_25C_mT.toFixed(0)} mT
                  </text>
                  <line
                    x1={padL}
                    y1={yBsat25Neg}
                    x2={padL + plotW}
                    y2={yBsat25Neg}
                    stroke="#38bdf8"
                    strokeWidth="1"
                    strokeDasharray="6 4"
                    strokeOpacity="0.65"
                  />
                  <text
                    x={padL + 6}
                    y={yBsat25Neg + 11}
                    className="fill-sky-400 text-[10px] font-mono"
                  >
                    -Bsat(25°C) = -{bh.Bsat_25C_mT.toFixed(0)} mT
                  </text>
                </>
              )}

              {yBsat100Pos >= padT && yBsat100Pos <= padT + plotH && (
                <>
                  <line
                    x1={padL}
                    y1={yBsat100Pos}
                    x2={padL + plotW}
                    y2={yBsat100Pos}
                    stroke="#f43f5e"
                    strokeWidth="1.5"
                    strokeDasharray="5 3"
                  />
                  <text
                    x={padL + 6}
                    y={yBsat100Pos + 12}
                    className="fill-rose-400 text-[10px] font-mono font-bold"
                  >
                    +Bsat(100°C) = +{bh.Bsat_100C_mT.toFixed(0)} mT
                  </text>
                  <line
                    x1={padL}
                    y1={yBsat100Neg}
                    x2={padL + plotW}
                    y2={yBsat100Neg}
                    stroke="#f43f5e"
                    strokeWidth="1.5"
                    strokeDasharray="5 3"
                  />
                  <text
                    x={padL + 6}
                    y={yBsat100Neg - 5}
                    className="fill-rose-400 text-[10px] font-mono font-bold"
                  >
                    -Bsat(100°C) = -{bh.Bsat_100C_mT.toFixed(0)} mT
                  </text>
                </>
              )}

              {/* Major Hysteresis Outer Loop Envelope */}
              {showMajorEnvelope && (
                <polygon
                  points={majorEnvelopePolygon}
                  fill="#a855f7"
                  fillOpacity="0.07"
                  stroke="#a855f7"
                  strokeWidth="1"
                  strokeDasharray="3 3"
                  strokeOpacity="0.55"
                />
              )}

              {/* Ideal Linear Air-Gapped Permeability Slope B = mu0 * mu_e * H */}
              <path
                d={linearPath}
                fill="none"
                stroke="#f59e0b"
                strokeWidth="1.2"
                strokeDasharray="4 4"
                strokeOpacity="0.6"
              />

              {/* Anhysteretic Magnetization Curves (25°C and 100°C) */}
              {show25CCurve && (
                <path
                  d={anh25Path}
                  fill="none"
                  stroke="#38bdf8"
                  strokeWidth="1.6"
                  strokeOpacity="0.75"
                />
              )}
              <path
                d={anh100Path}
                fill="none"
                stroke="#a855f7"
                strokeWidth="2"
              />

              {/* Pinned Baseline Operating Loop */}
              {pinnedMinorLoopPolygon && (
                <polygon
                  points={pinnedMinorLoopPolygon}
                  fill="none"
                  stroke="#94a3b8"
                  strokeWidth="1.5"
                  strokeDasharray="4 2"
                />
              )}

              {/* Active Closed Minor B-H Hysteresis Loop */}
              <polygon
                points={minorLoopPolygon}
                fill="url(#bhLoopFill)"
                stroke={isSaturating ? '#f43f5e' : '#10b981'}
                strokeWidth="2.6"
              />

              {/* Directional Arrows on Ascending & Descending Branches */}
              <circle
                cx={toX(ptAsc.H_Am)}
                cy={toY(ptAsc.B_mT)}
                r="3.5"
                fill="#10b981"
              />
              <circle
                cx={toX(ptDesc.H_Am)}
                cy={toY(ptDesc.B_mT)}
                r="3.5"
                fill="#06b6d4"
              />

              {/* Operating Tip Markers (+Hpk, +Bmax) and (-Hpk, -Bmin) */}
              <line
                x1={padL}
                y1={yBmaxLoop}
                x2={padL + plotW}
                y2={yBmaxLoop}
                stroke="#10b981"
                strokeWidth="1"
                strokeDasharray="2 3"
                strokeOpacity="0.75"
              />
              <line
                x1={padL}
                y1={yBminLoop}
                x2={padL + plotW}
                y2={yBminLoop}
                stroke="#10b981"
                strokeWidth="1"
                strokeDasharray="2 3"
                strokeOpacity="0.75"
              />

              {/* Interactive Hover Point Marker on Loop */}
              <circle
                cx={toX(activeHoverPoint.H_Am)}
                cy={toY(activeHoverPoint.B_mT)}
                r="5.5"
                fill="#22d3ee"
                stroke="#0f172a"
                strokeWidth="2"
              />

              {/* RIGHT-SIDE CALLOUT BRACKET: ΔB Flux Swing & Saturation Margin to Bsat */}
              {(() => {
                const bx = padL + plotW + 14;
                const yTopSat = Math.max(padT, Math.min(padT + plotH, yBsat100Pos));
                const yPeak = Math.max(padT, Math.min(padT + plotH, yBmaxLoop));
                const yTrough = Math.max(padT, Math.min(padT + plotH, yBminLoop));
                const midSwingY = (yPeak + yTrough) / 2;
                const midMarginY = (yTopSat + yPeak) / 2;

                return (
                  <g>
                    <line x1={bx} y1={yPeak} x2={bx + 8} y2={yPeak} stroke="#10b981" strokeWidth="1.5" />
                    <line x1={bx + 4} y1={yPeak} x2={bx + 4} y2={yTrough} stroke="#10b981" strokeWidth="1.5" />
                    <line x1={bx} y1={yTrough} x2={bx + 8} y2={yTrough} stroke="#10b981" strokeWidth="1.5" />
                    <text
                      x={bx + 12}
                      y={midSwingY - 4}
                      className="fill-emerald-400 text-[10px] font-mono font-bold"
                    >
                      ΔB = {biasedLoop.deltaB_actual_mT.toFixed(0)} mT
                    </text>
                    <text
                      x={bx + 12}
                      y={midSwingY + 9}
                      className="fill-slate-400 text-[9px] font-mono"
                    >
                      (±{activeSteinmetzMetrics.bPk_mT.toFixed(0)} mT)
                    </text>

                    {yPeak > yTopSat + 8 && (
                      <>
                        <line x1={bx + 4} y1={yTopSat} x2={bx + 4} y2={yPeak} stroke="#a855f7" strokeWidth="1.5" strokeDasharray="2 2" />
                        <line x1={bx} y1={yTopSat} x2={bx + 8} y2={yTopSat} stroke="#f43f5e" strokeWidth="1.5" />
                        <text
                          x={bx + 12}
                          y={midMarginY + 3}
                          className="fill-purple-300 text-[9px] font-mono"
                        >
                          Margin: {Math.max(0, biasedLoop.headroom_mT).toFixed(0)}mT
                        </text>
                      </>
                    )}
                  </g>
                );
              })()}

              {/* Axis Labels */}
              <text
                x={padL + plotW / 2}
                y={svgH - 10}
                textAnchor="middle"
                className="fill-slate-300 text-[11px] font-mono font-semibold"
              >
                Magnetic Field Intensity H = Np·Im / le (A/m) — [Loop Width 2·Hc Proportional to Steinmetz Core Loss]
              </text>
              <text
                x={16}
                y={padT + plotH / 2}
                textAnchor="middle"
                transform={`rotate(-90 16 ${padT + plotH / 2})`}
                className="fill-slate-300 text-[11px] font-mono font-semibold"
              >
                Flux Density B (mT)
              </text>
            </svg>
          </div>

          {/* Interactive Phase Scrubber & DC Bias / Flux Walking Stress-Test Slider */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
            <div className="p-2.5 rounded bg-slate-900/90 border border-slate-800 space-y-1">
              <div className="flex items-center justify-between text-[11px] font-mono">
                <span className="text-slate-400 inline-flex items-center gap-1">
                  <Compass className="w-3.5 h-3.5 text-cyan-400" />
                  Cycle Phase Scrubber θ (Inspect Loop Point):
                </span>
                <span className="text-cyan-400 font-bold">
                  {activeHoverPoint.phase_deg}° ({activeHoverPoint.H_Am} A/m, {activeHoverPoint.B_mT} mT)
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={biasedLoop.points.length - 1}
                value={hoverPhaseIdx ?? 18}
                onChange={(e) => setHoverPhaseIdx(Number(e.target.value))}
                className="w-full accent-cyan-400 cursor-pointer"
              />
            </div>

            <div className="p-2.5 rounded bg-slate-900/90 border border-slate-800 space-y-1">
              <div className="flex items-center justify-between text-[11px] font-mono">
                <span className="text-slate-400">
                  DC Bias / Flux-Walking Test Offset I_dc,bias:
                </span>
                <div className="flex items-center gap-2">
                  <span className={dcBiasCurrent_A > 0 ? 'text-amber-400 font-bold tabular-nums' : 'text-emerald-400 tabular-nums'}>
                    +{dcBiasCurrent_A.toFixed(2)} A (+{biasedLoop.H_dc_Am.toFixed(0)} A/m)
                  </span>
                  <LockToggleButton
                    compact
                    locked={dcBiasLock.locked}
                    onToggle={dcBiasLock.toggleLock}
                    label="DC Bias"
                  />
                  {dcBiasCurrent_A > 0 && (
                    <button
                      type="button"
                      onClick={() => dcBiasLock.resetToAuto()}
                      className="px-1.5 py-0.5 text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 rounded inline-flex items-center gap-0.5 cursor-pointer"
                    >
                      <RotateCcw className="w-2.5 h-2.5" /> Reset
                    </button>
                  )}
                </div>
              </div>
              <input
                type="range"
                min={0}
                max={Number((res.Isat_90pct_A * 1.1).toFixed(2))}
                step={0.05}
                value={dcBiasCurrent_A}
                onChange={(e) => dcBiasLock.setManual(Number(e.target.value))}
                className="w-full accent-amber-400 cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Right 4 Columns: Core Geometry Mapping, Saturation Margin Bar & Governing Physics */}
        <div className="xl:col-span-4 space-y-3">
          {/* Saturation Flux Utilization Gauge Card */}
          <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-[#0B0E17] border border-slate-200 dark:border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="font-bold uppercase tracking-wider text-purple-400">
                Flux Swing vs. Material Saturation (Bs)
              </span>
              <span className="font-bold text-slate-900 dark:text-slate-100">
                {biasedLoop.maxB.toFixed(1)} / {bh.Bsat_100C_mT} mT
              </span>
            </div>

            <div className="space-y-1">
              <svg viewBox="0 0 300 14" className="w-full h-3.5 rounded-full overflow-hidden bg-slate-200 dark:bg-slate-800">
                <rect
                  x={0}
                  y={0}
                  width={Math.min(300, Math.max(6, biasedLoop.satRatio_100C_pct * 3))}
                  height={14}
                  className={
                    isSaturating
                      ? 'fill-rose-500'
                      : isWarning
                      ? 'fill-amber-500'
                      : 'fill-emerald-500'
                  }
                />
                <line x1={165} y1={0} x2={165} y2={14} stroke="#10b981" strokeWidth="1.5" strokeDasharray="2 2" />
              </svg>
              <div className="flex justify-between text-[10px] font-mono text-slate-400">
                <span>0 mT</span>
                <span className="text-emerald-400">Opt: {(bh.Bsat_100C_mT * 0.55).toFixed(0)}mT</span>
                <span className="text-rose-400">Bs(100°C): {bh.Bsat_100C_mT}mT</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1 text-xs font-mono">
              <div className="p-2 rounded bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800">
                <div className="text-[10px] text-slate-400">Peak-to-Peak Swing ΔB</div>
                <div className="text-sm font-bold text-emerald-400">
                  {biasedLoop.deltaB_actual_mT.toFixed(1)} mT
                </div>
                <div className="text-[10px] text-slate-500">
                  Bpk = ±{activeSteinmetzMetrics.bPk_mT.toFixed(1)} mT
                </div>
              </div>
              <div className="p-2 rounded bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800">
                <div className="text-[10px] text-slate-400">Headroom to Bs(100°C)</div>
                <div
                  className={`text-sm font-bold ${
                    biasedLoop.headroom_mT > 80 ? 'text-cyan-400' : 'text-rose-400'
                  }`}
                >
                  {Math.max(0, biasedLoop.headroom_mT).toFixed(1)} mT
                </div>
                <div className="text-[10px] text-slate-500">
                  {(100 - biasedLoop.satRatio_100C_pct).toFixed(1)}% reserve
                </div>
              </div>
              <div className="p-2 rounded bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800">
                <div className="text-[10px] text-slate-400">Peak Field H_pk &amp; H_c</div>
                <div className="text-sm font-bold text-amber-400">
                  {activeSteinmetzMetrics.H_pk_Am.toFixed(1)} A/m
                </div>
                <div className="text-[10px] text-slate-500">
                  Hc,eff = {activeSteinmetzMetrics.Hc_eff_Am} A/m · Br = {bh.Br_eff_mT} mT
                </div>
              </div>
              <div className="p-2 rounded bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800">
                <div className="text-[10px] text-slate-400">Loop Energy ∮H·dB</div>
                <div className="text-sm font-bold text-purple-400">
                  {activeSteinmetzMetrics.e_cycle_mJ.toFixed(2)} mJ/cyc
                </div>
                <div className="text-[10px] text-slate-500">
                  w = {activeSteinmetzMetrics.w_cycle_J_m3} J/m³ ({activeSteinmetzMetrics.pCore_igse_W}W)
                </div>
              </div>
            </div>
          </div>

          {/* Core Geometry -> B-H Coordinate Mapping Equations (KaTeX) */}
          <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-[#0B0E17] border border-slate-200 dark:border-slate-800 space-y-2.5 text-xs font-mono">
            <div className="font-bold uppercase tracking-wider text-cyan-400">
              Core Geometry to B-H Plane Physics
            </div>

            <div className="space-y-2">
              <div className="p-2 rounded bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800">
                <div className="text-[10px] text-slate-400 mb-1">
                  1. Vertical Axis — Faraday Flux Swing via Core Area Ae ({core.Ae_mm2} mm²):
                </div>
                <MathFormula tex="\Delta B = \frac{V_{\text{pri}} D_{\text{eff}} T_{\text{sw}}}{2 N_p A_e}, \quad B_{\text{pk}} = \frac{\lambda_{\text{pri}}}{2 N_p A_e}" />
                <div className="text-[10px] text-emerald-400 mt-1">
                  λ = {res.voltSec_applied_Vus.toFixed(1)} V·µs / ({res.Np_actual}T × {core.Ae_mm2}mm²) ⇒ ΔB ={' '}
                  {bh.deltaB_mT.toFixed(1)} mT
                </div>
              </div>

              <div className="p-2 rounded bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800">
                <div className="text-[10px] text-slate-400 mb-1">
                  2. Horizontal Axis — Ampère Field Intensity via Path Length le ({core.le_mm} mm):
                </div>
                <MathFormula tex="H(t) = \frac{N_p \cdot i_m(t)}{l_e}, \quad H_{\text{sat,80\%}} = \frac{B_{\text{sat}}}{\mu_0 \mu_e}\operatorname{atanh}(0.8)" />
                <div className="text-[10px] text-amber-400 mt-1">
                  Hpk = ({res.Np_actual}T × {res.Im_pk_A.toFixed(2)}A) / {core.le_mm}mm = {bh.H_pk_Am.toFixed(1)} A/m
                </div>
              </div>

              <div className="p-2 rounded bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800">
                <div className="text-[10px] text-slate-400 mb-1">
                  3. Enclosed Loop Area — Volumetric Core Loss via Core Volume Ve ({(core.Ve_mm3 / 1000).toFixed(2)} cm³):
                </div>
                <MathFormula tex="P_{\text{core}} = V_e f_{\text{sw}} \oint H\,dB \approx \pi V_e f_{\text{sw}} H_{c,\text{eff}} B_{\text{pk}}" />
              </div>
            </div>

            {onUpdateField && (
              <div className="grid grid-cols-3 gap-1.5 pt-1">
                <div>
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[10px] text-slate-400">Core Size</span>
                    <LockToggleButton
                      compact
                      locked={dcdcLocked.coreId}
                      recentlyAutoUpdated={dcdcChanges.some((c) => c.key === 'coreId')}
                      onToggle={() => toggleDcdcLock('coreId')}
                      label="Core Size"
                    />
                  </div>
                  <select
                    value={state.coreId}
                    onChange={(e) => setDcdcField('coreId', e.target.value)}
                    className="w-full mt-0.5 px-1.5 py-1 text-[11px] font-mono bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded"
                  >
                    {CORE_DATABASE.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.id} ({c.Ae_mm2}mm²)
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[10px] text-slate-400">Material</span>
                    <LockToggleButton
                      compact
                      locked={dcdcLocked.materialId}
                      recentlyAutoUpdated={dcdcChanges.some((c) => c.key === 'materialId')}
                      onToggle={() => toggleDcdcLock('materialId')}
                      label="Material"
                    />
                  </div>
                  <select
                    value={state.materialId}
                    onChange={(e) => setDcdcField('materialId', e.target.value)}
                    className="w-full mt-0.5 px-1.5 py-1 text-[11px] font-mono bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded"
                  >
                    {MATERIAL_DATABASE.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.id} ({m.Bsat_100C_T * 1000}mT)
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[10px] text-slate-400">Pri Turns Np</span>
                    <LockToggleButton
                      compact
                      locked={dcdcLocked.Np_turns}
                      recentlyAutoUpdated={dcdcChanges.some((c) => c.key === 'Np_turns')}
                      onToggle={() => toggleDcdcLock('Np_turns')}
                      label="Primary Turns Np"
                    />
                  </div>
                  <input
                    type="number"
                    min={1}
                    value={state.Np_turns}
                    onChange={(e) => setDcdcField('Np_turns', Math.max(1, Number(e.target.value)))}
                    className="w-full mt-0.5 px-1.5 py-1 text-[11px] font-mono bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ============================================================================
          INTEGRATED STEINMETZ & iGSE CORE LOSS + CORE HEATING MODULE
          ============================================================================ */}
      <div className="border-t border-slate-200 dark:border-slate-800 pt-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Flame className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-amber-400">
              Steinmetz &amp; iGSE Core Loss Module — Total Core Heating Under Specific f_sw &amp; ΔB Swings
            </span>
            <span
              className={`px-2 py-0.5 text-[10px] font-mono rounded font-semibold ${
                ct.coreThermalStable
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                  : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
              }`}
            >
              {ct.coreThermalStable
                ? `THERMALLY STABLE (dPfe/dT·Rθ = ${ct.coreThermalLoopGain} < 1)`
                : `FERRITE THERMAL RUNAWAY RISK (dPfe/dT·Rθ = ${ct.coreThermalLoopGain})`}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {onUpdateField && (
              <button
                type="button"
                onClick={() => {
                  const next = !ct.customSteinmetzEnabled;
                  applyDcdcPatch(
                    {
                      customSteinmetzEnabled: next,
                      ...(next && state.custom_k_si === undefined
                        ? {
                            custom_k_si: material.k_si,
                            custom_alpha: material.alpha,
                            custom_beta: material.beta,
                            custom_T_opt_C: material.T_opt_C,
                          }
                        : {}),
                    },
                    'customSteinmetzEnabled'
                  );
                }}
                className={`px-2.5 py-1 text-[11px] font-mono rounded border inline-flex items-center gap-1 cursor-pointer ${
                  ct.customSteinmetzEnabled
                    ? 'bg-amber-500/20 border-amber-500/50 text-amber-300 font-semibold'
                    : 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                }`}
              >
                <Sliders className="w-3 h-3" />
                {ct.customSteinmetzEnabled ? 'Custom Steinmetz Active (k, α, β)' : 'Customize Steinmetz (k, α, β)'}
              </button>
            )}
            {sandboxActive && (
              <div className="flex items-center gap-1.5">
                {onUpdateField && (
                  <button
                    type="button"
                    onClick={() => {
                      applyDcdcPatch({
                        fsw_kHz: testFsw_kHz,
                        Np_turns: activeSteinmetzMetrics.Np_for_test,
                      });
                      setSandboxActive(false);
                    }}
                    className="px-2.5 py-1 text-[11px] font-mono bg-emerald-600 hover:bg-emerald-500 text-white rounded inline-flex items-center gap-1 font-semibold cursor-pointer"
                  >
                    <Check className="w-3 h-3" /> Apply {testFsw_kHz}kHz &amp; Np={activeSteinmetzMetrics.Np_for_test}T to Converter
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setSandboxActive(false);
                    setTestFsw_kHz(state.fsw_kHz);
                    setTestBpk_mT(Number(bh.Bpk_mT.toFixed(1)));
                  }}
                  className="px-2 py-1 text-[11px] font-mono bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded inline-flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" /> Sync to Converter
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Interactive Steinmetz Parameters + Specific f_sw / ΔB Heating Explorer */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
          {/* Left 5 Cols: Interactive f_sw and B_pk Excitation Sliders + Custom Steinmetz Inputs */}
          <div className="lg:col-span-5 p-3 rounded-lg bg-slate-50 dark:bg-[#0B0E17] border border-slate-200 dark:border-slate-800 space-y-3 text-xs font-mono">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-800 dark:text-slate-200">
                Excitation Frequency f_sw &amp; Flux Swing B_pk Explorer
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-300 border border-purple-500/30">
                {sandboxActive ? 'What-If Explorer Mode' : 'Synced with Converter'}
              </span>
            </div>

            {/* Switching Frequency Slider */}
            <div className="space-y-1">
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-400">Switching Frequency f_sw:</span>
                <span className="font-bold text-cyan-400">
                  {activeSteinmetzMetrics.fsw_kHz} kHz
                </span>
              </div>
              <input
                type="range"
                min={20}
                max={500}
                step={5}
                value={activeSteinmetzMetrics.fsw_kHz}
                onChange={(e) => {
                  setSandboxActive(true);
                  setTestFsw_kHz(Number(e.target.value));
                }}
                className="w-full accent-cyan-400 cursor-pointer"
              />
            </div>

            {/* Peak Flux Density Swing B_pk Slider */}
            <div className="space-y-1">
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-400">Peak Flux Swing B_pk (ΔB = {(activeSteinmetzMetrics.bPk_mT * 2).toFixed(0)} mT):</span>
                <span className="font-bold text-emerald-400">
                  ±{activeSteinmetzMetrics.bPk_mT.toFixed(1)} mT (≈ Np={activeSteinmetzMetrics.Np_for_test}T)
                </span>
              </div>
              <input
                type="range"
                min={15}
                max={Math.round(bh.Bsat_100C_mT * 1.05)}
                step={2}
                value={activeSteinmetzMetrics.bPk_mT}
                onChange={(e) => {
                  setSandboxActive(true);
                  setTestBpk_mT(Number(e.target.value));
                }}
                className="w-full accent-emerald-400 cursor-pointer"
              />
            </div>

            {/* Steinmetz Coefficients Row (Editable when Custom Steinmetz is active, otherwise displays preset material specs) */}
            <div className="grid grid-cols-4 gap-1.5 pt-2 border-t border-slate-200 dark:border-slate-800">
              <div>
                <span className="text-[10px] text-slate-400">k_SE (SI)</span>
                <input
                  type="number"
                  step={0.05}
                  disabled={!ct.customSteinmetzEnabled}
                  value={ct.k_eff}
                  onChange={(e) => onUpdateField && onUpdateField('custom_k_si', Math.max(0.01, Number(e.target.value)))}
                  className="w-full mt-0.5 px-1.5 py-1 text-[11px] bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded disabled:opacity-70"
                />
              </div>
              <div>
                <span className="text-[10px] text-slate-400">Freq Exp α</span>
                <input
                  type="number"
                  step={0.02}
                  disabled={!ct.customSteinmetzEnabled}
                  value={ct.alpha_eff}
                  onChange={(e) => onUpdateField && onUpdateField('custom_alpha', Math.max(1.0, Math.min(2.5, Number(e.target.value))))}
                  className="w-full mt-0.5 px-1.5 py-1 text-[11px] bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded disabled:opacity-70"
                />
              </div>
              <div>
                <span className="text-[10px] text-slate-400">Flux Exp β</span>
                <input
                  type="number"
                  step={0.02}
                  disabled={!ct.customSteinmetzEnabled}
                  value={ct.beta_eff}
                  onChange={(e) => onUpdateField && onUpdateField('custom_beta', Math.max(1.5, Math.min(3.5, Number(e.target.value))))}
                  className="w-full mt-0.5 px-1.5 py-1 text-[11px] bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded disabled:opacity-70"
                />
              </div>
              <div>
                <span className="text-[10px] text-slate-400">T_opt (°C)</span>
                <input
                  type="number"
                  step={5}
                  disabled={!ct.customSteinmetzEnabled}
                  value={ct.T_opt_eff_C}
                  onChange={(e) => onUpdateField && onUpdateField('custom_T_opt_C', Number(e.target.value))}
                  className="w-full mt-0.5 px-1.5 py-1 text-[11px] bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded disabled:opacity-70"
                />
              </div>
            </div>
          </div>

          {/* Right 7 Cols: Steinmetz Equations & Core Heating Breakdown Telemetry */}
          <div className="lg:col-span-7 p-3 rounded-lg bg-slate-50 dark:bg-[#0B0E17] border border-slate-200 dark:border-slate-800 space-y-2.5 text-xs font-mono">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div className="p-2 rounded bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
                <div className="text-[10px] text-slate-400 mb-0.5">
                  Standard Steinmetz (SE) &amp; Parabolic Temp Factor F(T):
                </div>
                <MathFormula tex="P_{v,\text{SE}} = k f_{\text{sw}}^\alpha B_{\text{pk}}^\beta \left[1 + c_2(T_{\text{core}} - T_{\text{opt}})^2\right]" />
              </div>
              <div className="p-2 rounded bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
                <div className="text-[10px] text-slate-400 mb-0.5">
                  Improved Generalized Steinmetz (iGSE) + Core Heating:
                </div>
                <MathFormula tex="T_{\text{core}} = T_{\text{amb}} + \frac{P_{\text{core,iGSE}}(T_{\text{core}}) + P_{\text{cu}}}{N_{\text{ph}}} R_{\theta,\text{core}}" />
              </div>
            </div>

            {/* 4 Core Heating Telemetry Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="p-2 rounded bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
                <div className="text-[10px] text-slate-400">Specific Loss Density Pv</div>
                <div className="text-sm font-bold text-purple-400">
                  {activeSteinmetzMetrics.pv_igse_kW_m3} kW/m³
                </div>
                <div className="text-[10px] text-slate-500">
                  SE: {activeSteinmetzMetrics.pv_se_kW_m3} mW/cm³
                </div>
              </div>

              <div className="p-2 rounded bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
                <div className="text-[10px] text-slate-400">Total Core Loss P_core</div>
                <div className="text-sm font-bold text-amber-400">
                  {activeSteinmetzMetrics.pCore_igse_W} W (iGSE)
                </div>
                <div className="text-[10px] text-slate-500">
                  SE: {activeSteinmetzMetrics.pCore_se_W}W · F(T)={activeSteinmetzMetrics.tempFactor}×
                </div>
              </div>

              <div className="p-2 rounded bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
                <div className="text-[10px] text-slate-400">Core Temp Rise ΔT_core</div>
                <div className="text-sm font-bold text-cyan-400">
                  +{activeSteinmetzMetrics.deltaT_total_C} °C
                </div>
                <div className="text-[10px] text-slate-500">
                  Fe: +{activeSteinmetzMetrics.deltaT_fe_C}°C | Cu: +{activeSteinmetzMetrics.deltaT_cu_C}°C
                </div>
              </div>

              <div className="p-2 rounded bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
                <div className="text-[10px] text-slate-400">Equilibrium T_core / Hotspot</div>
                <div
                  className={`text-sm font-bold ${
                    activeSteinmetzMetrics.tCore_eq_C > 115 ? 'text-rose-400' : 'text-emerald-400'
                  }`}
                >
                  {activeSteinmetzMetrics.tCore_eq_C} °C
                </div>
                <div className="text-[10px] text-slate-500">
                  Hotspot: {activeSteinmetzMetrics.tCore_hotspot_C}°C (Tamb={state.Tamb_C}°C)
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
