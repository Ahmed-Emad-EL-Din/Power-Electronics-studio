import React, { useState, useRef, useMemo } from 'react';
import { DcDcResults, BodePoint } from '../engine/dcdcEngine';
import { DcDcControlType } from '../data/databases';
import {
  Crosshair,
  ShieldCheck,
  AlertTriangle,
  Download,
  Sliders,
  Eye,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Target,
} from 'lucide-react';
import { MathFormula } from './MathFormula';

interface BodeStabilityGraphProps {
  res: DcDcResults;
  pinnedRes: DcDcResults | null;
  onSelectControlType?: (ctrl: DcDcControlType) => void;
}

export const BodeStabilityGraph: React.FC<BodeStabilityGraphProps> = ({
  res,
  pinnedRes,
  onSelectControlType,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [scrubIdx, setScrubIdx] = useState<number | null>(null);
  const [showPlant, setShowPlant] = useState(true);
  const [showComp, setShowComp] = useState(true);
  const [showLoop, setShowLoop] = useState(true);
  const [showEnvelope, setShowEnvelope] = useState(true);
  const [showPolesZeros, setShowPolesZeros] = useState(true);
  const [cursor1Idx, setCursor1Idx] = useState<number | null>(null);
  const [cursor2Idx, setCursor2Idx] = useState<number | null>(null);

  // Continuous Zoom & Pan Frequency Domain State [fMin_Hz, fMax_Hz]
  const [customFreqDomain, setCustomFreqDomain] = useState<[number, number] | null>(null);
  const [dragStartX, setDragStartX] = useState<number | null>(null);
  const [dragCurrentX, setDragCurrentX] = useState<number | null>(null);

  const baseFreqDomain: [number, number] = useMemo(() => {
    const data = res.bodeData;
    if (!data || data.length === 0) return [20, 100000];
    return [data[0].freq_Hz, data[data.length - 1].freq_Hz];
  }, [res.bodeData]);

  const activeFreqDomain: [number, number] = customFreqDomain || baseFreqDomain;
  const isZoomedOrPanned = customFreqDomain !== null;

  // Dynamically evaluate exact Bode points across arbitrary zoomed/panned frequency domain
  const activeBodeData: BodePoint[] = useMemo(() => {
    if (!isZoomedOrPanned) return res.bodeData;
    const [fMin, fMax] = activeFreqDomain;
    const N = 96;
    const pts: BodePoint[] = [];
    for (let i = 0; i <= N; i++) {
      const f = fMin * Math.pow(fMax / fMin, i / N);
      pts.push(res.evaluators.evalBodePoint(f));
    }
    return pts;
  }, [res.bodeData, res.evaluators, isZoomedOrPanned, activeFreqDomain]);

  // Also dynamically evaluate pinned baseline across zoomed/panned domain if present
  const activePinnedBodeData: BodePoint[] | null = useMemo(() => {
    if (!pinnedRes) return null;
    if (!isZoomedOrPanned) return pinnedRes.bodeData;
    const [fMin, fMax] = activeFreqDomain;
    const N = 96;
    const pts: BodePoint[] = [];
    for (let i = 0; i <= N; i++) {
      const f = fMin * Math.pow(fMax / fMin, i / N);
      pts.push(pinnedRes.evaluators.evalBodePoint(f));
    }
    return pts;
  }, [pinnedRes, isZoomedOrPanned, activeFreqDomain]);

  const fMin = activeBodeData[0]?.freq_Hz || 20;
  const fMax = activeBodeData[activeBodeData.length - 1]?.freq_Hz || 100000;
  const logMin = Math.log10(Math.max(0.1, fMin));
  const logMax = Math.log10(Math.max(1, fMax));

  // SVG Layout dimensions (Two stacked subplots: Top = Magnitude dB, Bottom = Phase deg)
  const width = 920;
  const height = 540;
  const padL = 68;
  const padR = 34;
  const padT = 26;
  const gapY = 38;
  const padB = 42;

  const plotW = width - padL - padR;
  const magH = 225;
  const phaseH = 195;

  const magTop = padT;
  const magBot = magTop + magH;
  const phaseTop = magBot + gapY;
  const phaseBot = phaseTop + phaseH;

  // Dynamic auto-expanding Magnitude & Phase Y bounds so wide zoom-outs never clip flat
  const { magMin, magMax, magTicks } = useMemo(() => {
    let lo = -60;
    let hi = 80;
    for (const d of activeBodeData) {
      const candidates: number[] = [];
      if (showLoop) candidates.push(d.loopMag_dB);
      if (showPlant) candidates.push(d.plantMag_dB);
      if (showComp) candidates.push(d.compMag_dB);
      if (showEnvelope) candidates.push(d.loopMagMin_dB, d.loopMagMax_dB);
      for (const v of candidates) {
        if (Number.isFinite(v)) {
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
      }
    }
    const minBound = Math.min(-70, Math.floor(lo / 20) * 20);
    const maxBound = Math.max(90, Math.ceil(hi / 20) * 20);
    const step = maxBound - minBound > 200 ? 40 : 20;
    const ticks: number[] = [];
    for (let v = Math.ceil(minBound / step) * step; v <= maxBound; v += step) {
      ticks.push(v);
    }
    if (!ticks.includes(0)) ticks.push(0);
    ticks.sort((a, b) => b - a);
    return { magMin: minBound, magMax: maxBound, magTicks: ticks };
  }, [activeBodeData, showLoop, showPlant, showComp, showEnvelope]);

  const { phaseMin, phaseMax, phaseTicks } = useMemo(() => {
    let lo = -250;
    let hi = 30;
    for (const d of activeBodeData) {
      const candidates: number[] = [];
      if (showLoop) candidates.push(d.loopPhase_deg);
      if (showPlant) candidates.push(d.plantPhase_deg);
      if (showComp) candidates.push(d.compPhase_deg);
      if (showEnvelope) candidates.push(d.loopPhaseMin_deg, d.loopPhaseMax_deg);
      for (const v of candidates) {
        if (Number.isFinite(v)) {
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
      }
    }
    const minBound = Math.min(-270, Math.floor(lo / 45) * 45);
    const maxBound = Math.max(45, Math.ceil(hi / 45) * 45);
    const step = maxBound - minBound > 360 ? 90 : 45;
    const ticks: number[] = [];
    for (let v = Math.ceil(minBound / step) * step; v <= maxBound; v += step) {
      ticks.push(v);
    }
    if (!ticks.includes(-180)) ticks.push(-180);
    ticks.sort((a, b) => b - a);
    return { phaseMin: minBound, phaseMax: maxBound, phaseTicks: ticks };
  }, [activeBodeData, showLoop, showPlant, showComp, showEnvelope]);

  const toX = (f_Hz: number) => {
    const lf = Math.log10(Math.max(f_Hz, fMin));
    return padL + ((lf - logMin) / Math.max(1e-6, logMax - logMin)) * plotW;
  };

  const fromSvgX = (px: number) => {
    const ratio = Math.max(0, Math.min(1, (px - padL) / plotW));
    return Math.pow(10, logMin + ratio * (logMax - logMin));
  };

  const toMagY = (db: number) => {
    const clamped = Math.max(magMin, Math.min(magMax, db));
    return magTop + magH - ((clamped - magMin) / (magMax - magMin)) * magH;
  };

  const toPhaseY = (deg: number) => {
    const clamped = Math.max(phaseMin, Math.min(phaseMax, deg));
    return phaseTop + phaseH - ((clamped - phaseMin) / (phaseMax - phaseMin)) * phaseH;
  };

  // Zoom & Pan Handlers
  const clampFreq = (low: number, high: number): [number, number] => {
    const l = Math.max(0.2, low);
    const h = Math.min(10e6, Math.max(l * 1.25, high));
    return [l, h];
  };

  const handleZoomOut = () => {
    const [l, h] = activeFreqDomain;
    setCustomFreqDomain(clampFreq(l / 3.0, h * 2.5));
    setCursor1Idx(null);
    setCursor2Idx(null);
  };

  const handleZoomIn = () => {
    const [l, h] = activeFreqDomain;
    const ratio = Math.pow(h / l, 0.22);
    setCustomFreqDomain(clampFreq(l * ratio, h / ratio));
    setCursor1Idx(null);
    setCursor2Idx(null);
  };

  const handlePan = (dir: -1 | 1) => {
    const [l, h] = activeFreqDomain;
    const factor = dir > 0 ? 1.8 : 1 / 1.8;
    setCustomFreqDomain(clampFreq(l * factor, h * factor));
  };

  const handleResetView = () => {
    setCustomFreqDomain(null);
    setCursor1Idx(null);
    setCursor2Idx(null);
    setScrubIdx(null);
  };

  const findNearestFreqIndex = (targetFreq_Hz: number) => {
    let best = 0;
    let bestDist = Infinity;
    activeBodeData.forEach((d, idx) => {
      const dist = Math.abs(Math.log10(Math.max(0.1, d.freq_Hz)) - Math.log10(Math.max(0.1, targetFreq_Hz)));
      if (dist < bestDist) {
        bestDist = dist;
        best = idx;
      }
    });
    return best;
  };

  const handleLockSlopeAroundFc = () => {
    const fc_Hz = res.fc_actual_kHz * 1e3;
    const idx1 = findNearestFreqIndex(fc_Hz / 1.8);
    const idx2 = findNearestFreqIndex(fc_Hz * 1.8);
    setCursor1Idx(idx1);
    setCursor2Idx(idx2 === idx1 ? Math.min(activeBodeData.length - 1, idx1 + 2) : idx2);
  };

  const handleLockF0ToFc = () => {
    const idx1 = findNearestFreqIndex(res.f0_lc_kHz * 1e3);
    const idx2 = findNearestFreqIndex(res.fc_actual_kHz * 1e3);
    setCursor1Idx(idx1);
    setCursor2Idx(idx2 === idx1 ? Math.min(activeBodeData.length - 1, idx1 + 2) : idx2);
  };

  // Mouse handlers
  const getRelX = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return null;
    const rect = svgRef.current.getBoundingClientRect();
    return ((e.clientX - rect.left) / rect.width) * width;
  };

  const findNearestIdx = (relX: number) => {
    let best = 0;
    let bestDist = Infinity;
    activeBodeData.forEach((d, idx) => {
      const dist = Math.abs(toX(d.freq_Hz) - relX);
      if (dist < bestDist) {
        bestDist = dist;
        best = idx;
      }
    });
    return best;
  };

  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    const relX = getRelX(e);
    if (relX === null || relX < padL || relX > width - padR) return;
    setDragStartX(relX);
    setDragCurrentX(relX);
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const relX = getRelX(e);
    if (relX === null) return;
    if (dragStartX !== null) {
      setDragCurrentX(Math.max(padL, Math.min(width - padR, relX)));
    }
    setHoverIdx(findNearestIdx(relX));
  };

  const handleMouseUp = (e: React.MouseEvent<SVGSVGElement>) => {
    const relX = getRelX(e);
    if (dragStartX !== null && dragCurrentX !== null) {
      const dist = Math.abs(dragCurrentX - dragStartX);
      if (dist > 14) {
        const f1 = fromSvgX(Math.min(dragStartX, dragCurrentX));
        const f2 = fromSvgX(Math.max(dragStartX, dragCurrentX));
        if (f2 > f1 * 1.05) {
          setCustomFreqDomain(clampFreq(f1, f2));
          setCursor1Idx(null);
          setCursor2Idx(null);
        }
        setDragStartX(null);
        setDragCurrentX(null);
        return;
      }
    }
    setDragStartX(null);
    setDragCurrentX(null);

    const targetIdx = hoverIdx !== null ? hoverIdx : relX !== null ? findNearestIdx(relX) : null;
    if (targetIdx === null) return;
    if (e.shiftKey || cursor1Idx === null) {
      setCursor1Idx(targetIdx);
      setScrubIdx(targetIdx);
    } else if (cursor2Idx === null && cursor1Idx !== targetIdx) {
      setCursor2Idx(targetIdx);
      setScrubIdx(targetIdx);
    } else {
      setCursor1Idx(targetIdx);
      setCursor2Idx(null);
      setScrubIdx(targetIdx);
    }
  };

  // Build SVG polylines & worst-case tolerance polygon
  const magLoopPts = activeBodeData
    .map((d) => `${toX(d.freq_Hz).toFixed(1)},${toMagY(d.loopMag_dB).toFixed(1)}`)
    .join(' ');
  const magPlantPts = activeBodeData
    .map((d) => `${toX(d.freq_Hz).toFixed(1)},${toMagY(d.plantMag_dB).toFixed(1)}`)
    .join(' ');
  const magCompPts = activeBodeData
    .map((d) => `${toX(d.freq_Hz).toFixed(1)},${toMagY(d.compMag_dB).toFixed(1)}`)
    .join(' ');

  const phaseLoopPts = activeBodeData
    .map((d) => `${toX(d.freq_Hz).toFixed(1)},${toPhaseY(d.loopPhase_deg).toFixed(1)}`)
    .join(' ');
  const phasePlantPts = activeBodeData
    .map((d) => `${toX(d.freq_Hz).toFixed(1)},${toPhaseY(d.plantPhase_deg).toFixed(1)}`)
    .join(' ');
  const phaseCompPts = activeBodeData
    .map((d) => `${toX(d.freq_Hz).toFixed(1)},${toPhaseY(d.compPhase_deg).toFixed(1)}`)
    .join(' ');

  const magEnvPolygon = [
    ...activeBodeData.map((d) => `${toX(d.freq_Hz).toFixed(1)},${toMagY(d.loopMagMax_dB).toFixed(1)}`),
    ...[...activeBodeData]
      .reverse()
      .map((d) => `${toX(d.freq_Hz).toFixed(1)},${toMagY(d.loopMagMin_dB).toFixed(1)}`),
  ].join(' ');

  const phaseEnvPolygon = [
    ...activeBodeData.map((d) => `${toX(d.freq_Hz).toFixed(1)},${toPhaseY(d.loopPhaseMax_deg).toFixed(1)}`),
    ...[...activeBodeData]
      .reverse()
      .map((d) => `${toX(d.freq_Hz).toFixed(1)},${toPhaseY(d.loopPhaseMin_deg).toFixed(1)}`),
  ].join(' ');

  const pinnedMagLoopPts = activePinnedBodeData
    ? activePinnedBodeData
        .map((d) => `${toX(d.freq_Hz).toFixed(1)},${toMagY(d.loopMag_dB).toFixed(1)}`)
        .join(' ')
    : null;
  const pinnedPhaseLoopPts = activePinnedBodeData
    ? activePinnedBodeData
        .map((d) => `${toX(d.freq_Hz).toFixed(1)},${toPhaseY(d.loopPhase_deg).toFixed(1)}`)
        .join(' ')
    : null;

  // Key Frequencies on X-Axis
  const fc_Hz = res.fc_actual_kHz * 1e3;
  const fgm_Hz = res.f_gm_kHz * 1e3;
  const f0_Hz = res.f0_lc_kHz * 1e3;
  const fesr_Hz = res.f_esr_kHz * 1e3;
  const fnyq_Hz = res.state.fsw_kHz * 500;
  const fz1_Hz = res.fz1_kHz * 1e3;
  const fz2_Hz = res.fz2_kHz * 1e3;
  const fp1_Hz = res.fp1_kHz * 1e3;
  const fp2_Hz = res.fp2_kHz * 1e3;

  const xFc = toX(fc_Hz);
  const xFgm = toX(fgm_Hz);

  const phaseAtFc = -180 + res.pm_actual_deg;
  const magAtFgm = -res.gm_actual_dB;

  const activeIdx =
    hoverIdx !== null
      ? hoverIdx
      : scrubIdx !== null
      ? scrubIdx
      : cursor1Idx !== null
      ? cursor1Idx
      : Math.floor(activeBodeData.length * 0.55);
  const activePt = activeBodeData[activeIdx] || activeBodeData[0];

  // Differential M1 / M2 Bode Roll-Off Slope & Phase Rate Analysis
  const m1m2BodeAnalysis = useMemo(() => {
    if (
      cursor1Idx === null ||
      cursor2Idx === null ||
      !activeBodeData[cursor1Idx] ||
      !activeBodeData[cursor2Idx]
    ) {
      return null;
    }
    const p1 = activeBodeData[cursor1Idx];
    const p2 = activeBodeData[cursor2Idx];
    const f1 = p1.freq_Hz;
    const f2 = p2.freq_Hz;
    const df = f2 - f1;
    const decades = Math.log10(Math.max(1e-6, f2) / Math.max(1e-6, f1));
    const octaves = Math.log2(Math.max(1e-6, f2) / Math.max(1e-6, f1));

    const dLoopMag = p2.loopMag_dB - p1.loopMag_dB;
    const dPlantMag = p2.plantMag_dB - p1.plantMag_dB;
    const dCompMag = p2.compMag_dB - p1.compMag_dB;
    const dLoopPhase = p2.loopPhase_deg - p1.loopPhase_deg;

    const loopSlope_dB_dec = Math.abs(decades) > 1e-6 ? dLoopMag / decades : 0;
    const loopSlope_dB_oct = Math.abs(octaves) > 1e-6 ? dLoopMag / octaves : 0;
    const plantSlope_dB_dec = Math.abs(decades) > 1e-6 ? dPlantMag / decades : 0;
    const compSlope_dB_dec = Math.abs(decades) > 1e-6 ? dCompMag / decades : 0;
    const phaseSlope_deg_dec = Math.abs(decades) > 1e-6 ? dLoopPhase / decades : 0;

    return {
      p1,
      p2,
      f1,
      f2,
      df,
      decades,
      octaves,
      dLoopMag,
      dLoopPhase,
      loopSlope_dB_dec,
      loopSlope_dB_oct,
      plantSlope_dB_dec,
      compSlope_dB_dec,
      phaseSlope_deg_dec,
    };
  }, [cursor1Idx, cursor2Idx, activeBodeData]);

  const exportBodeCsv = () => {
    const headers = [
      'Freq_Hz',
      'Plant_Mag_dB',
      'Plant_Phase_deg',
      'Comp_Mag_dB',
      'Comp_Phase_deg',
      'Loop_Mag_dB',
      'Loop_Phase_deg',
      'Loop_Mag_WC_Min_dB',
      'Loop_Mag_WC_Max_dB',
      'Loop_Phase_WC_Min_deg',
      'Loop_Phase_WC_Max_deg',
    ];
    const rows = activeBodeData.map((b) =>
      [
        b.freq_Hz.toFixed(1),
        b.plantMag_dB.toFixed(2),
        b.plantPhase_deg.toFixed(2),
        b.compMag_dB.toFixed(2),
        b.compPhase_deg.toFixed(2),
        b.loopMag_dB.toFixed(2),
        b.loopPhase_deg.toFixed(2),
        b.loopMagMin_dB.toFixed(2),
        b.loopMagMax_dB.toFixed(2),
        b.loopPhaseMin_deg.toFixed(2),
        b.loopPhaseMax_deg.toFixed(2),
      ].join(',')
    );
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bode_stability_${res.state.topology}_${res.state.controlType}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const isStable = res.pm_actual_deg >= 45 && res.gm_actual_dB >= 6 && res.pm_wc_min_deg >= 35;

  // Dynamic decade grid ticks based on active logMin..logMax
  const freqTicks = useMemo(() => {
    const list: number[] = [];
    const minPow = Math.floor(logMin);
    const maxPow = Math.ceil(logMax);
    for (let p = minPow; p <= maxPow; p++) {
      const base = Math.pow(10, p);
      [1, 2, 5].forEach((mult) => {
        const val = base * mult;
        if (val >= fMin * 0.99 && val <= fMax * 1.01) {
          list.push(val);
        }
      });
    }
    return list;
  }, [logMin, logMax, fMin, fMax]);

  const formatFreq = (f: number) => {
    if (f >= 1e6) return `${(f / 1e6).toFixed(2)} MHz`;
    if (f >= 1e3) return `${(f / 1e3).toFixed(2)} kHz`;
    return `${f.toFixed(1)} Hz`;
  };

  return (
    <div className="bg-white dark:bg-[#0E131D] border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-3">
      {/* Top Header: Title, Stability Verdict Badge, Trace Toggles & Zoom/Pan Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Bode Stability Analyzer — Plant <MathFormula tex="G_{vd}(s)" />, Compensator{' '}
              <MathFormula tex="G_c(s)" /> &amp; Loop <MathFormula tex="T(s)" />
            </h3>
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded border ${
                isStable
                  ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/35'
                  : 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/35'
              }`}
            >
              {isStable ? (
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
              ) : (
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
              )}
              {isStable ? 'Stable across ±15% L / ±20% C corners' : 'Margin warning (<45° PM or <6dB GM)'}
            </span>
            {isZoomedOrPanned && (
              <span className="px-2 py-0.5 text-[10px] font-mono tabular-nums rounded bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border border-cyan-500/30">
                Span: {formatFreq(fMin)} – {formatFreq(fMax)}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
            Click 2 points to measure roll-off slope (<strong className="text-amber-600 dark:text-amber-300">dB/dec</strong> &amp; <strong className="text-pink-600 dark:text-pink-300">dB/oct</strong>) · Drag box to zoom in · Click{' '}
            <strong className="text-cyan-600 dark:text-cyan-300">Zoom Out</strong> to evaluate 0.2 Hz to 10 MHz
          </p>
        </div>

        {/* Zoom / Pan / Slope Preset & Trace Visibility Toolbar */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => handlePan(-1)}
            className="p-1 text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded border border-slate-700 cursor-pointer"
            title="Pan Left to lower frequencies"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleZoomIn}
            className="px-2 py-1 text-[11px] font-mono text-slate-200 bg-slate-800 hover:bg-slate-700 rounded border border-slate-700 inline-flex items-center gap-1 cursor-pointer"
          >
            <ZoomIn className="w-3 h-3 text-cyan-400" />
            In
          </button>
          <button
            type="button"
            onClick={handleZoomOut}
            className="px-2 py-1 text-[11px] font-mono text-cyan-300 bg-cyan-950/60 hover:bg-cyan-900/70 rounded border border-cyan-500/40 inline-flex items-center gap-1 cursor-pointer"
          >
            <ZoomOut className="w-3 h-3 text-cyan-400" />
            Zoom Out
          </button>
          <button
            type="button"
            onClick={() => handlePan(1)}
            className="p-1 text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded border border-slate-700 cursor-pointer"
            title="Pan Right to higher frequencies"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
          {isZoomedOrPanned && (
            <button
              type="button"
              onClick={handleResetView}
              className="px-2 py-1 text-[11px] font-mono bg-amber-500/15 text-amber-300 border border-amber-500/40 rounded hover:bg-amber-500/25 inline-flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              Reset
            </button>
          )}

          {/* 1-Click Bode Slope Measurement Presets */}
          <button
            type="button"
            onClick={handleLockSlopeAroundFc}
            className="px-2 py-1 text-[11px] font-mono bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/40 rounded inline-flex items-center gap-1 cursor-pointer"
            title="Lock M1 & M2 around crossover fc to measure exact crossover slope (dB/decade)"
          >
            <Target className="w-3 h-3" />
            Slope @ fc
          </button>
          <button
            type="button"
            onClick={handleLockF0ToFc}
            className="px-2 py-1 text-[11px] font-mono bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 rounded cursor-pointer"
            title="Lock M1 at LC resonance f0 and M2 at crossover fc"
          >
            f0→fc
          </button>

          {(cursor1Idx !== null || cursor2Idx !== null) && (
            <button
              type="button"
              onClick={() => {
                setCursor1Idx(null);
                setCursor2Idx(null);
              }}
              className="px-2 py-1 text-[11px] font-mono bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded cursor-pointer"
            >
              Clear M1/M2
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowLoop(!showLoop)}
            className={`px-2 py-1 text-[11px] font-mono rounded border flex items-center gap-1.5 cursor-pointer ${
              showLoop
                ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300 font-semibold'
                : 'bg-slate-800 border-slate-700 text-slate-400'
            }`}
          >
            <span className="w-2.5 h-0.5 bg-cyan-400 inline-block" />
            Loop T(s)
          </button>
          <button
            type="button"
            onClick={() => setShowPlant(!showPlant)}
            className={`px-2 py-1 text-[11px] font-mono rounded border flex items-center gap-1.5 cursor-pointer ${
              showPlant
                ? 'bg-amber-500/20 border-amber-500 text-amber-300 font-semibold'
                : 'bg-slate-800 border-slate-700 text-slate-400'
            }`}
          >
            <span className="w-2.5 h-0.5 bg-amber-400 inline-block" />
            Plant Gvd
          </button>
          <button
            type="button"
            onClick={() => setShowComp(!showComp)}
            className={`px-2 py-1 text-[11px] font-mono rounded border flex items-center gap-1.5 cursor-pointer ${
              showComp
                ? 'bg-purple-500/20 border-purple-500 text-purple-300 font-semibold'
                : 'bg-slate-800 border-slate-700 text-slate-400'
            }`}
          >
            <span className="w-2.5 h-0.5 bg-purple-400 inline-block" />
            Comp Gc
          </button>
          <button
            type="button"
            onClick={() => setShowEnvelope(!showEnvelope)}
            className={`px-2 py-1 text-[11px] font-mono rounded border flex items-center gap-1 cursor-pointer ${
              showEnvelope
                ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                : 'bg-slate-800 border-slate-700 text-slate-400'
            }`}
          >
            <Eye className="w-3 h-3" />
            WC Band
          </button>
          <button
            type="button"
            onClick={() => setShowPolesZeros(!showPolesZeros)}
            className={`px-2 py-1 text-[11px] font-mono rounded border flex items-center gap-1 cursor-pointer ${
              showPolesZeros
                ? 'bg-pink-500/20 border-pink-500 text-pink-300'
                : 'bg-slate-800 border-slate-700 text-slate-400'
            }`}
          >
            <Sliders className="w-3 h-3" />
            Poles/Zeros
          </button>
          <button
            type="button"
            onClick={exportBodeCsv}
            className="px-2 py-1 text-[11px] font-mono bg-slate-800 hover:bg-slate-700 text-slate-200 rounded border border-slate-700 flex items-center gap-1 cursor-pointer"
          >
            <Download className="w-3 h-3" />
            CSV
          </button>
        </div>
      </div>

      {/* Quick Control Architecture Switcher */}
      {onSelectControlType && (
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-mono bg-slate-950/70 px-3 py-1.5 rounded border border-slate-800">
          <span className="text-slate-400 mr-1">Compare Compensator Architecture:</span>
          {(
            [
              { id: '2p2z', label: 'Digital 2P2Z (Type-II)' },
              { id: 'type-iii', label: 'Type-III (3P3Z)' },
              { id: 'pcmc', label: 'Peak Current Mode + Slope' },
              { id: 'acmc', label: 'Average Current Mode' },
              { id: 'cascaded-pi', label: 'Cascaded Dual-Loop PI' },
              { id: 'charge-control', label: 'Resonant Charge Control' },
              { id: 'mpc', label: 'Trajectory MPC' },
            ] as { id: DcDcControlType; label: string }[]
          ).map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onSelectControlType(c.id)}
              className={`px-2 py-0.5 rounded border transition-colors cursor-pointer ${
                res.state.controlType === c.id
                  ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 font-bold'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}

      {/* Stability Telemetry Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-xs font-mono">
        <div className="bg-slate-950/90 border border-slate-800 rounded p-2">
          <div className="text-[10px] text-slate-400 uppercase">Crossover Freq fc</div>
          <div className="text-sm font-bold text-cyan-400">
            {res.fc_actual_kHz.toFixed(2)} kHz
          </div>
          <div className="text-[10px] text-slate-500">
            WC: [{res.fc_wc_min_kHz.toFixed(1)}, {res.fc_wc_max_kHz.toFixed(1)}] kHz
          </div>
        </div>

        <div className="bg-slate-950/90 border border-slate-800 rounded p-2">
          <div className="text-[10px] text-slate-400 uppercase">Phase Margin (PM)</div>
          <div
            className={`text-sm font-bold ${
              res.pm_actual_deg >= 45 ? 'text-emerald-400' : 'text-amber-400'
            }`}
          >
            {res.pm_actual_deg.toFixed(1)}°
          </div>
          <div className="text-[10px] text-slate-500">
            WC: [{res.pm_wc_min_deg.toFixed(1)}°, {res.pm_wc_max_deg.toFixed(1)}°]
          </div>
        </div>

        <div className="bg-slate-950/90 border border-slate-800 rounded p-2">
          <div className="text-[10px] text-slate-400 uppercase">Gain Margin (GM)</div>
          <div
            className={`text-sm font-bold ${
              res.gm_actual_dB >= 6 ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            +{res.gm_actual_dB.toFixed(1)} dB
          </div>
          <div className="text-[10px] text-slate-500">
            @ f(-180°) = {res.f_gm_kHz.toFixed(1)} kHz
          </div>
        </div>

        <div className="bg-slate-950/90 border border-slate-800 rounded p-2">
          <div className="text-[10px] text-slate-400 uppercase">Plant LC &amp; ESR</div>
          <div className="text-sm font-bold text-amber-400">
            f0 = {res.f0_lc_kHz.toFixed(2)} kHz
          </div>
          <div className="text-[10px] text-slate-500">
            f_esr = {res.f_esr_kHz.toFixed(1)} kHz | Rd = {res.Rd_damping_Ohm.toFixed(3)}Ω
          </div>
        </div>

        <div className="bg-slate-950/90 border border-slate-800 rounded p-2">
          <div className="text-[10px] text-slate-400 uppercase">Compensator Zeros</div>
          <div className="text-sm font-bold text-purple-400">
            {res.fz1_kHz.toFixed(2)} / {res.fz2_kHz.toFixed(2)} kHz
          </div>
          <div className="text-[10px] text-slate-500">
            Boosts phase across f0..fc
          </div>
        </div>

        <div className="bg-slate-950/90 border border-slate-800 rounded p-2">
          <div className="text-[10px] text-slate-400 uppercase">Compensator Poles</div>
          <div className="text-sm font-bold text-pink-400">
            {res.fp1_kHz.toFixed(1)} / {res.fp2_kHz.toFixed(1)} kHz
          </div>
          <div className="text-[10px] text-slate-500">
            Attenuates f_sw ripple
          </div>
        </div>
      </div>

      {/* Live Cursor Readout Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-1.5 rounded bg-slate-950 border border-slate-800 text-[11px] font-mono">
        <div className="flex items-center gap-2">
          <Crosshair className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-slate-400">Cursor Frequency:</span>
          <span className="text-white font-bold">{formatFreq(activePt.freq_Hz)}</span>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <span className="text-cyan-300">
            |T(jω)|: <strong>{activePt.loopMag_dB.toFixed(2)} dB</strong> (∠{activePt.loopPhase_deg.toFixed(1)}°)
          </span>
          <span className="text-amber-300">
            |Gvd(jω)|: <strong>{activePt.plantMag_dB.toFixed(2)} dB</strong> (∠{activePt.plantPhase_deg.toFixed(1)}°)
          </span>
          <span className="text-purple-300">
            |Gc(jω)|: <strong>{activePt.compMag_dB.toFixed(2)} dB</strong> (∠{activePt.compPhase_deg.toFixed(1)}°)
          </span>
          <span className="text-emerald-300">
            WC |T|: [{activePt.loopMagMin_dB.toFixed(1)}, {activePt.loopMagMax_dB.toFixed(1)}] dB
          </span>
        </div>
      </div>

      {/* Dual-Cursor M1 / M2 Differential Bode Roll-Off Slope (dB/decade & dB/octave) Bar */}
      {m1m2BodeAnalysis && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 rounded bg-amber-500/10 border border-amber-500/30 text-[11px] font-mono text-amber-200">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-bold text-amber-300">
              Bode Cursors M1 ({formatFreq(m1m2BodeAnalysis.f1)}) → M2 ({formatFreq(m1m2BodeAnalysis.f2)}):
            </span>
            <span>
              Span: <strong>{m1m2BodeAnalysis.decades.toFixed(2)} dec</strong> ({m1m2BodeAnalysis.octaves.toFixed(2)} oct)
            </span>
            <span>
              Δ|T|: <strong>{m1m2BodeAnalysis.dLoopMag >= 0 ? '+' : ''}{m1m2BodeAnalysis.dLoopMag.toFixed(2)} dB</strong>
            </span>
            <span className="px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold">
              Loop Slope: {m1m2BodeAnalysis.loopSlope_dB_dec.toFixed(1)} dB/dec ({m1m2BodeAnalysis.loopSlope_dB_oct.toFixed(1)} dB/oct)
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-[10px]">
            <span className="text-amber-300">
              Plant Slope: <strong>{m1m2BodeAnalysis.plantSlope_dB_dec.toFixed(1)} dB/dec</strong>
            </span>
            <span className="text-purple-300">
              Comp Slope: <strong>{m1m2BodeAnalysis.compSlope_dB_dec.toFixed(1)} dB/dec</strong>
            </span>
            <span className="text-emerald-300">
              Δ∠T: <strong>{m1m2BodeAnalysis.dLoopPhase >= 0 ? '+' : ''}{m1m2BodeAnalysis.dLoopPhase.toFixed(1)}°</strong> ({m1m2BodeAnalysis.phaseSlope_deg_dec.toFixed(1)}°/dec)
            </span>
          </div>
        </div>
      )}

      {/* Dual-Plot SVG Canvas (Top = Magnitude dB, Bottom = Phase deg) */}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto select-none cursor-crosshair overflow-visible"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onDoubleClick={handleResetView}
        onMouseLeave={() => {
          setHoverIdx(null);
          setDragStartX(null);
          setDragCurrentX(null);
        }}
      >
        {/* Top Subplot Background: Magnitude (dB) */}
        <rect
          x={padL}
          y={magTop}
          width={plotW}
          height={magH}
          fill="#070a12"
          stroke="#1e293b"
          strokeWidth={1}
          rx={4}
        />

        {/* Bottom Subplot Background: Phase (deg) */}
        <rect
          x={padL}
          y={phaseTop}
          width={plotW}
          height={phaseH}
          fill="#070a12"
          stroke="#1e293b"
          strokeWidth={1}
          rx={4}
        />

        {/* Shaded Band Between M1 and M2 Cursors */}
        {cursor1Idx !== null &&
          cursor2Idx !== null &&
          activeBodeData[cursor1Idx] &&
          activeBodeData[cursor2Idx] &&
          (() => {
            const x1 = toX(activeBodeData[cursor1Idx].freq_Hz);
            const x2 = toX(activeBodeData[cursor2Idx].freq_Hz);
            const leftPx = Math.max(padL, Math.min(x1, x2));
            const rightPx = Math.min(padL + plotW, Math.max(x1, x2));
            return (
              <g>
                <rect
                  x={leftPx}
                  y={magTop}
                  width={Math.max(1, rightPx - leftPx)}
                  height={magH}
                  fill="#f59e0b"
                  fillOpacity={0.07}
                />
                <rect
                  x={leftPx}
                  y={phaseTop}
                  width={Math.max(1, rightPx - leftPx)}
                  height={phaseH}
                  fill="#f59e0b"
                  fillOpacity={0.07}
                />
              </g>
            );
          })()}

        {/* Vertical Log-Frequency Grid Lines */}
        {freqTicks.map((f) => {
          const x = toX(f);
          const isDecade = Math.abs(Math.log10(f) - Math.round(Math.log10(f))) < 1e-4;
          return (
            <g key={f}>
              <line
                x1={x}
                y1={magTop}
                x2={x}
                y2={magBot}
                stroke={isDecade ? '#1e293b' : '#0f172a'}
                strokeWidth={isDecade ? 1.2 : 0.8}
                strokeDasharray={isDecade ? undefined : '2 3'}
              />
              <line
                x1={x}
                y1={phaseTop}
                x2={x}
                y2={phaseBot}
                stroke={isDecade ? '#1e293b' : '#0f172a'}
                strokeWidth={isDecade ? 1.2 : 0.8}
                strokeDasharray={isDecade ? undefined : '2 3'}
              />
              <text
                x={x}
                y={phaseBot + 14}
                textAnchor="middle"
                fill={isDecade ? '#94a3b8' : '#475569'}
                fontSize={10}
                fontFamily="monospace"
              >
                {f >= 1e6 ? `${f / 1e6}M` : f >= 1000 ? `${f / 1000}k` : f}
              </text>
            </g>
          );
        })}

        {/* Horizontal Magnitude Grid & 0 dB Crossover Line */}
        {magTicks.map((db) => {
          const y = toMagY(db);
          const isZero = db === 0;
          return (
            <g key={db}>
              <line
                x1={padL}
                y1={y}
                x2={padL + plotW}
                y2={y}
                stroke={isZero ? '#38bdf8' : '#1e293b'}
                strokeWidth={isZero ? 1.5 : 1}
                strokeDasharray={isZero ? '5 3' : '3 3'}
                opacity={isZero ? 0.85 : 0.7}
              />
              <text
                x={padL - 8}
                y={y + 3}
                textAnchor="end"
                fill={isZero ? '#38bdf8' : '#94a3b8'}
                fontSize={10}
                fontFamily="monospace"
                fontWeight={isZero ? 'bold' : 'normal'}
              >
                {db > 0 ? `+${db}` : db} dB
              </text>
            </g>
          );
        })}

        {/* Horizontal Phase Grid & -180 deg Instability Boundary */}
        {phaseTicks.map((deg) => {
          const y = toPhaseY(deg);
          const is180 = deg === -180;
          return (
            <g key={deg}>
              <line
                x1={padL}
                y1={y}
                x2={padL + plotW}
                y2={y}
                stroke={is180 ? '#f43f5e' : '#1e293b'}
                strokeWidth={is180 ? 1.6 : 1}
                strokeDasharray={is180 ? '5 3' : '3 3'}
                opacity={is180 ? 0.9 : 0.7}
              />
              <text
                x={padL - 8}
                y={y + 3}
                textAnchor="end"
                fill={is180 ? '#f43f5e' : '#94a3b8'}
                fontSize={10}
                fontFamily="monospace"
                fontWeight={is180 ? 'bold' : 'normal'}
              >
                {deg}°
              </text>
            </g>
          );
        })}

        {/* Subplot Titles */}
        <text
          x={padL + 10}
          y={magTop + 14}
          fill="#cbd5e1"
          fontSize={10}
          fontFamily="monospace"
          fontWeight="bold"
        >
          GAIN MAGNITUDE |G(jω)| (dB) — [0 dB Reference Highlighted]
        </text>
        <text
          x={padL + 10}
          y={phaseTop + 14}
          fill="#cbd5e1"
          fontSize={10}
          fontFamily="monospace"
          fontWeight="bold"
        >
          PHASE ANGLE ∠G(jω) (deg) — [−180° Stability Limit Highlighted]
        </text>

        {/* Shaded Worst-Case Component Tolerance Envelope (±15% L, ±20% C) */}
        {showEnvelope && showLoop && (
          <>
            <polygon points={magEnvPolygon} fill="#06b6d4" fillOpacity={0.14} />
            <polygon points={phaseEnvPolygon} fill="#10b981" fillOpacity={0.14} />
          </>
        )}

        {/* Pole & Zero Vertical Markers */}
        {showPolesZeros && (
          <g>
            {[
              { f: f0_Hz, label: `f0,LC (${res.f0_lc_kHz.toFixed(1)}k)`, color: '#f59e0b' },
              { f: fesr_Hz, label: `f_esr (${res.f_esr_kHz.toFixed(1)}k)`, color: '#eab308' },
              { f: fz1_Hz, label: `fz1 (${res.fz1_kHz.toFixed(1)}k)`, color: '#a855f7' },
              { f: fz2_Hz, label: `fz2 (${res.fz2_kHz.toFixed(1)}k)`, color: '#c084fc' },
              { f: fp1_Hz, label: `fp1 (${res.fp1_kHz.toFixed(1)}k)`, color: '#ec4899' },
              { f: fp2_Hz, label: `fp2 (${res.fp2_kHz.toFixed(1)}k)`, color: '#f472b6' },
              { f: fnyq_Hz, label: `f_sw/2 (${(res.state.fsw_kHz / 2).toFixed(0)}k)`, color: '#ef4444' },
            ].map((m, i) => {
              if (m.f < fMin || m.f > fMax) return null;
              const x = toX(m.f);
              return (
                <g key={i}>
                  <line
                    x1={x}
                    y1={magTop}
                    x2={x}
                    y2={magBot}
                    stroke={m.color}
                    strokeWidth={1}
                    strokeDasharray="2 3"
                    opacity={0.6}
                  />
                  <text
                    x={x + 3}
                    y={magBot - 8 - (i % 3) * 12}
                    fill={m.color}
                    fontSize={9}
                    fontFamily="monospace"
                  >
                    {m.label}
                  </text>
                </g>
              );
            })}
          </g>
        )}

        {/* Pinned Reference Ghost Loop */}
        {pinnedMagLoopPts && showLoop && (
          <polyline
            fill="none"
            stroke="#06b6d4"
            strokeWidth={1.5}
            strokeDasharray="4 4"
            opacity={0.45}
            points={pinnedMagLoopPts}
          />
        )}
        {pinnedPhaseLoopPts && showLoop && (
          <polyline
            fill="none"
            stroke="#10b981"
            strokeWidth={1.5}
            strokeDasharray="4 4"
            opacity={0.45}
            points={pinnedPhaseLoopPts}
          />
        )}

        {/* Plant Gvd(s) Traces */}
        {showPlant && (
          <>
            <polyline
              fill="none"
              stroke="#f59e0b"
              strokeWidth={1.8}
              strokeDasharray="5 3"
              points={magPlantPts}
            />
            <polyline
              fill="none"
              stroke="#f59e0b"
              strokeWidth={1.8}
              strokeDasharray="5 3"
              points={phasePlantPts}
            />
          </>
        )}

        {/* Compensator Gc(s) Traces */}
        {showComp && (
          <>
            <polyline
              fill="none"
              stroke="#a855f7"
              strokeWidth={1.8}
              strokeDasharray="3 2"
              points={magCompPts}
            />
            <polyline
              fill="none"
              stroke="#a855f7"
              strokeWidth={1.8}
              strokeDasharray="3 2"
              points={phaseCompPts}
            />
          </>
        )}

        {/* Open-Loop T(s) = Gvd(s)*Gc(s) Traces */}
        {showLoop && (
          <>
            <polyline fill="none" stroke="#06b6d4" strokeWidth={2.6} points={magLoopPts} />
            <polyline fill="none" stroke="#10b981" strokeWidth={2.6} points={phaseLoopPts} />
          </>
        )}

        {/* PHASE MARGIN (PM) VISUAL CALLOUT VECTOR AT fc */}
        {fc_Hz >= fMin && fc_Hz <= fMax && (
          <g>
            <line
              x1={xFc}
              y1={magTop}
              x2={xFc}
              y2={phaseBot}
              stroke="#22d3ee"
              strokeWidth={1.2}
              strokeDasharray="3 3"
              opacity={0.75}
            />
            <circle
              cx={xFc}
              cy={toMagY(0)}
              r={4.5}
              fill="#22d3ee"
              stroke="#090d16"
              strokeWidth={1.5}
            />
            <line
              x1={xFc}
              y1={toPhaseY(-180)}
              x2={xFc}
              y2={toPhaseY(phaseAtFc)}
              stroke="#10b981"
              strokeWidth={3}
            />
            <circle
              cx={xFc}
              cy={toPhaseY(phaseAtFc)}
              r={4.5}
              fill="#10b981"
              stroke="#090d16"
              strokeWidth={1.5}
            />
            <rect
              x={Math.min(padL + plotW - 115, xFc + 6)}
              y={toPhaseY((phaseAtFc - 180) / 2) - 10}
              width={108}
              height={18}
              rx={3}
              fill="#064e3b"
              stroke="#10b981"
              strokeWidth={1}
            />
            <text
              x={Math.min(padL + plotW - 61, xFc + 60)}
              y={toPhaseY((phaseAtFc - 180) / 2) + 2}
              textAnchor="middle"
              fill="#6ee7b7"
              fontSize={9.5}
              fontFamily="monospace"
              fontWeight="bold"
            >
              PM = {res.pm_actual_deg.toFixed(1)}° @ {res.fc_actual_kHz.toFixed(1)}k
            </text>
          </g>
        )}

        {/* GAIN MARGIN (GM) VISUAL CALLOUT VECTOR AT f(-180°) */}
        {fgm_Hz >= fMin && fgm_Hz <= fMax && (
          <g>
            <line
              x1={xFgm}
              y1={magTop}
              x2={xFgm}
              y2={phaseBot}
              stroke="#f43f5e"
              strokeWidth={1.2}
              strokeDasharray="3 3"
              opacity={0.75}
            />
            <line
              x1={xFgm}
              y1={toMagY(0)}
              x2={xFgm}
              y2={toMagY(magAtFgm)}
              stroke="#f43f5e"
              strokeWidth={3}
            />
            <circle
              cx={xFgm}
              cy={toMagY(magAtFgm)}
              r={4.5}
              fill="#f43f5e"
              stroke="#090d16"
              strokeWidth={1.5}
            />
            <circle
              cx={xFgm}
              cy={toPhaseY(-180)}
              r={4.5}
              fill="#f43f5e"
              stroke="#090d16"
              strokeWidth={1.5}
            />
            <rect
              x={Math.max(padL + 6, xFgm - 112)}
              y={toMagY(magAtFgm / 2) - 9}
              width={105}
              height={18}
              rx={3}
              fill="#4c0519"
              stroke="#f43f5e"
              strokeWidth={1}
            />
            <text
              x={Math.max(padL + 58, xFgm - 59)}
              y={toMagY(magAtFgm / 2) + 3}
              textAnchor="middle"
              fill="#fda4af"
              fontSize={9.5}
              fontFamily="monospace"
              fontWeight="bold"
            >
              GM = +{res.gm_actual_dB.toFixed(1)} dB
            </text>
          </g>
        )}

        {/* Locked Cursor M1 (Amber) */}
        {cursor1Idx !== null && activeBodeData[cursor1Idx] && (
          <g>
            <line
              x1={toX(activeBodeData[cursor1Idx].freq_Hz)}
              y1={magTop}
              x2={toX(activeBodeData[cursor1Idx].freq_Hz)}
              y2={phaseBot}
              stroke="#f59e0b"
              strokeWidth={1.5}
            />
            <circle
              cx={toX(activeBodeData[cursor1Idx].freq_Hz)}
              cy={toMagY(activeBodeData[cursor1Idx].loopMag_dB)}
              r={4}
              fill="#f59e0b"
              stroke="#070a12"
              strokeWidth={1.5}
            />
            <circle
              cx={toX(activeBodeData[cursor1Idx].freq_Hz)}
              cy={toPhaseY(activeBodeData[cursor1Idx].loopPhase_deg)}
              r={4}
              fill="#f59e0b"
              stroke="#070a12"
              strokeWidth={1.5}
            />
            <text
              x={toX(activeBodeData[cursor1Idx].freq_Hz) + 4}
              y={magTop + 26}
              fill="#f59e0b"
              fontSize={9.5}
              fontFamily="monospace"
              fontWeight="bold"
            >
              M1 ({formatFreq(activeBodeData[cursor1Idx].freq_Hz)})
            </text>
          </g>
        )}

        {/* Locked Cursor M2 (Pink) */}
        {cursor2Idx !== null && activeBodeData[cursor2Idx] && (
          <g>
            <line
              x1={toX(activeBodeData[cursor2Idx].freq_Hz)}
              y1={magTop}
              x2={toX(activeBodeData[cursor2Idx].freq_Hz)}
              y2={phaseBot}
              stroke="#ec4899"
              strokeWidth={1.5}
            />
            <circle
              cx={toX(activeBodeData[cursor2Idx].freq_Hz)}
              cy={toMagY(activeBodeData[cursor2Idx].loopMag_dB)}
              r={4}
              fill="#ec4899"
              stroke="#070a12"
              strokeWidth={1.5}
            />
            <circle
              cx={toX(activeBodeData[cursor2Idx].freq_Hz)}
              cy={toPhaseY(activeBodeData[cursor2Idx].loopPhase_deg)}
              r={4}
              fill="#ec4899"
              stroke="#070a12"
              strokeWidth={1.5}
            />
            <text
              x={toX(activeBodeData[cursor2Idx].freq_Hz) + 4}
              y={magTop + 38}
              fill="#ec4899"
              fontSize={9.5}
              fontFamily="monospace"
              fontWeight="bold"
            >
              M2 ({formatFreq(activeBodeData[cursor2Idx].freq_Hz)})
            </text>
          </g>
        )}

        {/* Drag-to-Zoom Selection Box */}
        {dragStartX !== null &&
          dragCurrentX !== null &&
          Math.abs(dragCurrentX - dragStartX) > 6 && (
            <>
              <rect
                x={Math.min(dragStartX, dragCurrentX)}
                y={magTop}
                width={Math.abs(dragCurrentX - dragStartX)}
                height={magH}
                fill="#38bdf8"
                fillOpacity={0.18}
                stroke="#38bdf8"
                strokeWidth={1}
              />
              <rect
                x={Math.min(dragStartX, dragCurrentX)}
                y={phaseTop}
                width={Math.abs(dragCurrentX - dragStartX)}
                height={phaseH}
                fill="#38bdf8"
                fillOpacity={0.18}
                stroke="#38bdf8"
                strokeWidth={1}
              />
            </>
          )}

        {/* Hover Crosshair & Active Dots */}
        {activePt && (
          <g>
            <line
              x1={toX(activePt.freq_Hz)}
              y1={magTop}
              x2={toX(activePt.freq_Hz)}
              y2={phaseBot}
              stroke="#94a3b8"
              strokeWidth={1}
              strokeDasharray="2 2"
            />
            {showLoop && (
              <>
                <circle
                  cx={toX(activePt.freq_Hz)}
                  cy={toMagY(activePt.loopMag_dB)}
                  r={4.5}
                  fill="#06b6d4"
                  stroke="#0f172a"
                  strokeWidth={1.5}
                />
                <circle
                  cx={toX(activePt.freq_Hz)}
                  cy={toPhaseY(activePt.loopPhase_deg)}
                  r={4.5}
                  fill="#10b981"
                  stroke="#0f172a"
                  strokeWidth={1.5}
                />
              </>
            )}
            {showPlant && (
              <>
                <circle
                  cx={toX(activePt.freq_Hz)}
                  cy={toMagY(activePt.plantMag_dB)}
                  r={3.5}
                  fill="#f59e0b"
                />
                <circle
                  cx={toX(activePt.freq_Hz)}
                  cy={toPhaseY(activePt.plantPhase_deg)}
                  r={3.5}
                  fill="#f59e0b"
                />
              </>
            )}
            {showComp && (
              <>
                <circle
                  cx={toX(activePt.freq_Hz)}
                  cy={toMagY(activePt.compMag_dB)}
                  r={3.5}
                  fill="#a855f7"
                />
                <circle
                  cx={toX(activePt.freq_Hz)}
                  cy={toPhaseY(activePt.compPhase_deg)}
                  r={3.5}
                  fill="#a855f7"
                />
              </>
            )}
          </g>
        )}

        {/* X Axis Label */}
        <text
          x={padL + plotW / 2}
          y={height - 6}
          textAnchor="middle"
          fill="#64748b"
          fontSize={10.5}
          fontFamily="monospace"
        >
          Frequency f (Hz, Logarithmic Scale) — [Click 2 points to measure dB/dec slope · Drag box to Zoom · Double-Click Reset]
        </text>
      </svg>

      {/* Precision Frequency Scrubber Slider & Quick-Jump Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 rounded bg-slate-950/90 border border-slate-800 text-[11px] font-mono">
        <div className="flex items-center gap-2 flex-1 min-w-[240px]">
          <span className="text-slate-400 shrink-0">Scrub f:</span>
          <input
            type="range"
            min={0}
            max={Math.max(0, activeBodeData.length - 1)}
            value={activeIdx}
            onChange={(e) => {
              const idx = Number(e.target.value);
              setScrubIdx(idx);
              setHoverIdx(idx);
            }}
            className="w-full accent-cyan-400 cursor-pointer"
          />
          <button
            type="button"
            onClick={() => setCursor1Idx(activeIdx)}
            className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 cursor-pointer shrink-0"
          >
            Set M1
          </button>
          <button
            type="button"
            onClick={() => setCursor2Idx(activeIdx)}
            className="px-2 py-0.5 rounded bg-pink-500/20 text-pink-300 border border-pink-500/40 cursor-pointer shrink-0"
          >
            Set M2
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
          <span className="text-slate-500">Jump to:</span>
          {[
            { label: 'f0,LC', f: f0_Hz },
            { label: 'fz1', f: fz1_Hz },
            { label: 'fc (0dB)', f: fc_Hz },
            { label: 'fp1', f: fp1_Hz },
            { label: 'f(-180°)', f: fgm_Hz },
            { label: 'fsw/2', f: fnyq_Hz },
          ].map((jb) => (
            <button
              key={jb.label}
              type="button"
              onClick={() => {
                const idx = findNearestFreqIndex(jb.f);
                setScrubIdx(idx);
                setHoverIdx(idx);
              }}
              className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 cursor-pointer"
            >
              {jb.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
