import React, { useState, useRef, useMemo } from 'react';
import {
  Download,
  Crosshair,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  MousePointerClick,
  ArrowUpRight,
  ArrowDownRight,
  Target,
  SlidersHorizontal,
  Anchor,
} from 'lucide-react';

export interface ChartSeriesConfig {
  key: string;
  name?: string;
  label?: string;
  unit: string;
  color: string;
  refKey?: string;
  axis?: 'left' | 'right';
  dashed?: boolean;
}

export interface LegacySeriesProp {
  label: string;
  unit: string;
  color: string;
}

export interface ReferenceMarker {
  value?: number;
  x?: number;
  label: string;
  color: string;
  axis?: 'left' | 'right';
  dashed?: boolean;
}

export interface InteractiveChartProps {
  title: string;
  subtitle?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any[];
  xKey?: string;
  xLabel: string;
  xUnit: string;
  series?: ChartSeriesConfig[];
  series1?: LegacySeriesProp;
  series2?: LegacySeriesProp;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  refData?: any[] | null;
  horizontalMarkers?: ReferenceMarker[];
  verticalMarkers?: ReferenceMarker[];
  currentX?: number;
  currentXLabel?: string;
  height?: number;
  logX?: boolean;
  /** Dynamic physical evaluator to compute accurate curve points when zooming out or panning beyond initial data */
  domainEvaluator?: (x: number) => Record<string, number | undefined>;
  /** Optional evaluator for pinned baseline comparison when zoomed out */
  refEvaluator?: (x: number) => Record<string, number | undefined>;
  minPhysX?: number;
  maxPhysX?: number;
  /** Optional click callback to apply the clicked X value directly into the design state */
  onPointClick?: (xVal: number, y1Val: number, y2Val?: number) => void;
  onSelectX?: (xVal: number) => void;
  clickActionHint?: string;
  /** Optional shaded valid design window [min, max] on the X-axis */
  validRange?: { min: number; max: number; label: string; color?: string };
}

export const InteractiveChart: React.FC<InteractiveChartProps> = ({
  title,
  subtitle,
  data,
  xKey,
  xLabel,
  xUnit,
  series,
  series1,
  series2,
  refData,
  horizontalMarkers = [],
  verticalMarkers = [],
  currentX,
  currentXLabel,
  height = 285,
  logX = false,
  domainEvaluator,
  refEvaluator,
  minPhysX,
  maxPhysX,
  onPointClick,
  onSelectX,
  clickActionHint,
  validRange,
}) => {
  const resolvedXKey = xKey || 'x';

  const resolvedSeries = useMemo(() => {
    if (series && series.length > 0) {
      return series.map((s) => ({
        ...s,
        name: s.name || s.label || s.key,
      }));
    }
    const list: Array<ChartSeriesConfig & { name: string }> = [];
    if (series1) {
      list.push({
        key: 'y1',
        name: series1.label,
        unit: series1.unit,
        color: series1.color,
        refKey: 'refY1',
        axis: 'left',
      });
    }
    if (series2) {
      list.push({
        key: 'y2',
        name: series2.label,
        unit: series2.unit,
        color: series2.color,
        refKey: 'refY2',
        axis: series1 && series1.unit !== series2.unit ? 'right' : 'left',
      });
    }
    return list;
  }, [series, series1, series2]);

  const resolvedVerticalMarkers = useMemo(() => {
    const markers: Array<ReferenceMarker & { value: number }> = verticalMarkers.map((m) => ({
      ...m,
      value: m.value ?? m.x ?? 0,
    }));
    if (currentX !== undefined && !Number.isNaN(currentX)) {
      markers.push({
        value: currentX,
        label: currentXLabel || `Active (${Number(currentX.toFixed(2))}${xUnit ? ' ' + xUnit : ''})`,
        color: '#22d3ee',
        dashed: true,
      });
    }
    return markers;
  }, [verticalMarkers, currentX, currentXLabel, xUnit]);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [scrubIdx, setScrubIdx] = useState<number | null>(null);
  const [cursor1Idx, setCursor1Idx] = useState<number | null>(null);
  const [cursor2Idx, setCursor2Idx] = useState<number | null>(null);
  const [showScrubber, setShowScrubber] = useState<boolean>(false);
  const [targetYInput, setTargetYInput] = useState<string>('');
  const [zeroLockY, setZeroLockY] = useState<boolean>(false);
  const [hiddenSeriesKeys, setHiddenSeriesKeys] = useState<Record<string, boolean>>({});

  // Continuous Zoom & Pan X-Domain State
  const [customDomain, setCustomDomain] = useState<[number, number] | null>(null);
  const [dragStartX, setDragStartX] = useState<number | null>(null);
  const [dragCurrentX, setDragCurrentX] = useState<number | null>(null);

  const visibleSeries = useMemo(() => {
    const filtered = resolvedSeries.filter((s) => !hiddenSeriesKeys[s.key]);
    return filtered.length > 0 ? filtered : resolvedSeries;
  }, [resolvedSeries, hiddenSeriesKeys]);

  const toggleSeriesVisibility = (key: string) => {
    if (resolvedSeries.length <= 1) return;
    setHiddenSeriesKeys((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      const remaining = resolvedSeries.filter((s) => !next[s.key]);
      if (remaining.length === 0) return prev;
      return next;
    });
  };

  // Base X domain from initial data
  const baseDomain: [number, number] = useMemo(() => {
    if (!data || data.length === 0) return [0, 1];
    const xs = data.map((d) => Number(d[resolvedXKey]) || 0);
    const min = Math.min(...xs);
    const max = Math.max(...xs);
    return [min, max === min ? min + 1 : max];
  }, [data, resolvedXKey]);

  const activeDomain: [number, number] = customDomain || baseDomain;
  const isZoomedOrPanned = customDomain !== null;

  // Dynamically synthesized or filtered dataset for active X domain
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const activeData: any[] = useMemo(() => {
    if (!data || data.length === 0) return [];

    if (domainEvaluator && isZoomedOrPanned) {
      const N = 64;
      const [xMin, xMax] = activeDomain;
      const pts = [];
      for (let i = 0; i <= N; i++) {
        let xVal: number;
        if (logX && xMin > 0 && xMax > 0) {
          xVal = xMin * Math.pow(xMax / xMin, i / N);
        } else {
          xVal = xMin + ((xMax - xMin) * i) / N;
        }
        const evaluated = domainEvaluator(xVal);
        const refEval = refEvaluator ? refEvaluator(xVal) : undefined;
        pts.push({
          ...evaluated,
          [resolvedXKey]: Number(xVal.toPrecision(5)),
          y1: evaluated.y1,
          y2: evaluated.y2,
          refY1: refEval?.y1,
          refY2: refEval?.y2,
        });
      }
      return pts;
    }

    if (isZoomedOrPanned) {
      const [xMin, xMax] = activeDomain;
      const filtered = data.filter((d) => {
        const xv = Number(d[resolvedXKey]);
        return xv >= xMin && xv <= xMax;
      });
      return filtered.length >= 2 ? filtered : data;
    }

    return data;
  }, [data, domainEvaluator, refEvaluator, isZoomedOrPanned, activeDomain, logX, resolvedXKey]);

  const activeRefData = useMemo(() => {
    if (!refData || isZoomedOrPanned) return null;
    return refData;
  }, [refData, isZoomedOrPanned]);

  const hasRightAxis = visibleSeries.some((s) => s.axis === 'right');
  const padL = 62;
  const padR = hasRightAxis ? 62 : 24;
  const padT = 26;
  const padB = 38;
  const width = 680;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const xValues = useMemo(
    () => activeData.map((d) => Number(d[resolvedXKey]) || 0),
    [activeData, resolvedXKey]
  );
  const xMin = xValues.length ? Math.min(...xValues) : 0;
  const xMax = xValues.length ? Math.max(...xValues) : 1;

  const toX = (val: number) => {
    if (xMax === xMin) return padL + plotW / 2;
    if (logX && val > 0 && xMin > 0) {
      const logMin = Math.log10(xMin);
      const logMax = Math.log10(xMax);
      return padL + ((Math.log10(val) - logMin) / (logMax - logMin)) * plotW;
    }
    return padL + ((val - xMin) / (xMax - xMin)) * plotW;
  };

  const fromSvgX = (px: number): number => {
    const ratio = Math.max(0, Math.min(1, (px - padL) / plotW));
    if (logX && xMin > 0 && xMax > 0) {
      return xMin * Math.pow(xMax / xMin, ratio);
    }
    return xMin + ratio * (xMax - xMin);
  };

  const leftSeries = visibleSeries.filter((s) => s.axis !== 'right');
  const rightSeries = visibleSeries.filter((s) => s.axis === 'right');

  const computeBounds = (seriesList: ChartSeriesConfig[], axisType: 'left' | 'right') => {
    if (seriesList.length === 0) return { min: 0, max: 1 };
    let min = Infinity;
    let max = -Infinity;
    for (const s of seriesList) {
      for (const row of activeData) {
        const v = Number(row[s.key]);
        if (Number.isFinite(v)) {
          if (v < min) min = v;
          if (v > max) max = v;
        }
        if (s.refKey && row[s.refKey] !== undefined) {
          const rv = Number(row[s.refKey]);
          if (Number.isFinite(rv)) {
            if (rv < min) min = rv;
            if (rv > max) max = rv;
          }
        }
      }
      if (activeRefData) {
        for (const row of activeRefData) {
          const v = Number(row[s.key]);
          if (Number.isFinite(v)) {
            if (v < min) min = v;
            if (v > max) max = v;
          }
        }
      }
    }
    for (const m of horizontalMarkers) {
      const mVal = m.value ?? m.x;
      if ((m.axis || 'left') === axisType && mVal !== undefined && Number.isFinite(mVal)) {
        if (mVal < min) min = mVal;
        if (mVal > max) max = mVal;
      }
    }
    if (zeroLockY) {
      if (0 < min) min = 0;
      if (0 > max) max = 0;
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: 0, max: 1 };
    if (max === min) return { min: min - 1, max: max + 1 };
    const span = max - min;
    return { min: min - span * 0.08, max: max + span * 0.1 };
  };

  const leftBounds = computeBounds(leftSeries, 'left');
  const rightBounds = computeBounds(rightSeries, 'right');

  const toYLeft = (val: number) =>
    padT + plotH - ((val - leftBounds.min) / (leftBounds.max - leftBounds.min)) * plotH;

  const toYRight = (val: number) =>
    padT + plotH - ((val - rightBounds.min) / (rightBounds.max - rightBounds.min)) * plotH;

  // Auto-detect Peak, Min, Mean, and RMS for both Primary (Series 1) and Secondary (Series 2)
  const primarySeries = resolvedSeries[0];
  const secondarySeries = resolvedSeries[1];

  const computeSeriesStats = (s?: ChartSeriesConfig) => {
    if (!s || activeData.length === 0) return null;
    let maxVal = -Infinity;
    let maxX = 0;
    let maxIdx = 0;
    let minVal = Infinity;
    let minX = 0;
    let minIdx = 0;
    let sum = 0;
    let sumSq = 0;
    let count = 0;

    activeData.forEach((row, idx) => {
      const v = Number(row[s.key]);
      const x = Number(row[resolvedXKey]);
      if (Number.isFinite(v)) {
        if (v > maxVal) {
          maxVal = v;
          maxX = x;
          maxIdx = idx;
        }
        if (v < minVal) {
          minVal = v;
          minX = x;
          minIdx = idx;
        }
        sum += v;
        sumSq += v * v;
        count++;
      }
    });
    if (!Number.isFinite(maxVal) || count === 0) return null;
    return {
      maxVal,
      maxX,
      maxIdx,
      minVal,
      minX,
      minIdx,
      meanVal: sum / count,
      rmsVal: Math.sqrt(sumSq / count),
    };
  };

  const s1Stats = useMemo(
    () => computeSeriesStats(primarySeries),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeData, primarySeries, resolvedXKey]
  );

  const s2Stats = useMemo(
    () => computeSeriesStats(secondarySeries),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeData, secondarySeries, resolvedXKey]
  );

  // Interval integration & statistics between M1 and M2 cursors
  const m1m2Analysis = useMemo(() => {
    if (
      cursor1Idx === null ||
      cursor2Idx === null ||
      !activeData[cursor1Idx] ||
      !activeData[cursor2Idx]
    ) {
      return null;
    }
    const iStart = Math.min(cursor1Idx, cursor2Idx);
    const iEnd = Math.max(cursor1Idx, cursor2Idx);
    const p1 = activeData[cursor1Idx];
    const p2 = activeData[cursor2Idx];
    const x1 = Number(p1[resolvedXKey]);
    const x2 = Number(p2[resolvedXKey]);
    const dx = x2 - x1;

    const s1Key = primarySeries?.key || 'y1';
    const s2Key = secondarySeries?.key;
    const y1_1 = Number(p1[s1Key]);
    const y1_2 = Number(p2[s1Key]);
    const dy1 = y1_2 - y1_1;
    const slope1 = Math.abs(dx) > 1e-9 ? dy1 / dx : 0;

    const y2_1 = s2Key ? Number(p1[s2Key]) : NaN;
    const y2_2 = s2Key ? Number(p2[s2Key]) : NaN;
    const dy2 = Number.isFinite(y2_1) && Number.isFinite(y2_2) ? y2_2 - y2_1 : NaN;
    const slope2 = Number.isFinite(dy2) && Math.abs(dx) > 1e-9 ? dy2 / dx : NaN;

    // Trapezoidal definite integral int_{x_start}^{x_end} y1(x) dx, mean, and RMS over [iStart, iEnd]
    let area1 = 0;
    let sumSq1 = 0;
    let spanX = 0;
    for (let k = iStart; k < iEnd; k++) {
      const xa = Number(activeData[k][resolvedXKey]);
      const xb = Number(activeData[k + 1][resolvedXKey]);
      const ya = Number(activeData[k][s1Key]);
      const yb = Number(activeData[k + 1][s1Key]);
      const segDx = xb - xa;
      if (Number.isFinite(ya) && Number.isFinite(yb) && segDx > 0) {
        area1 += 0.5 * (ya + yb) * segDx;
        sumSq1 += ((ya * ya + ya * yb + yb * yb) / 3) * segDx;
        spanX += segDx;
      }
    }
    const mean1 = spanX > 0 ? area1 / spanX : 0.5 * (y1_1 + y1_2);
    const rms1 = spanX > 0 ? Math.sqrt(Math.max(0, sumSq1 / spanX)) : Math.abs(mean1);

    return {
      x1,
      x2,
      dx,
      dy1,
      slope1,
      dy2,
      slope2,
      area1,
      mean1,
      rms1,
    };
  }, [cursor1Idx, cursor2Idx, activeData, resolvedXKey, primarySeries, secondarySeries]);

  // Zoom & Pan Handlers
  const clampDomain = (dMin: number, dMax: number): [number, number] => {
    let low = dMin;
    let high = dMax;
    if (minPhysX !== undefined) low = Math.max(minPhysX, low);
    if (maxPhysX !== undefined) high = Math.min(maxPhysX, high);
    if (logX) {
      low = Math.max(minPhysX ?? 1e-3, low);
      if (high <= low * 1.05) high = low * 1.2;
    } else if (high <= low + 1e-6) {
      high = low + 1;
    }
    return [low, high];
  };

  const handleZoomOut = () => {
    const [cMin, cMax] = activeDomain;
    if (logX && cMin > 0 && cMax > 0) {
      setCustomDomain(clampDomain(cMin / 2.2, cMax * 2.2));
    } else {
      const span = cMax - cMin;
      const center = (cMin + cMax) / 2;
      setCustomDomain(clampDomain(center - span * 0.9, center + span * 0.9));
    }
    setCursor1Idx(null);
    setCursor2Idx(null);
  };

  const handleZoomIn = () => {
    const [cMin, cMax] = activeDomain;
    if (logX && cMin > 0 && cMax > 0) {
      const ratio = Math.pow(cMax / cMin, 0.25);
      setCustomDomain(clampDomain(cMin * ratio, cMax / ratio));
    } else {
      const span = cMax - cMin;
      const center = (cMin + cMax) / 2;
      setCustomDomain(clampDomain(center - span * 0.3, center + span * 0.3));
    }
    setCursor1Idx(null);
    setCursor2Idx(null);
  };

  const handlePan = (dir: -1 | 1) => {
    const [cMin, cMax] = activeDomain;
    if (logX && cMin > 0 && cMax > 0) {
      const factor = dir > 0 ? 1.45 : 1 / 1.45;
      setCustomDomain(clampDomain(cMin * factor, cMax * factor));
    } else {
      const shift = (cMax - cMin) * 0.28 * dir;
      setCustomDomain(clampDomain(cMin + shift, cMax + shift));
    }
  };

  const handleResetView = () => {
    setCustomDomain(null);
    setCursor1Idx(null);
    setCursor2Idx(null);
    setScrubIdx(null);
  };

  // Jump helpers for Peak, Min, and Operating Point
  const jumpToIndex = (idx: number) => {
    if (idx < 0 || idx >= activeData.length) return;
    setScrubIdx(idx);
    setHoverIdx(idx);
    setCursor1Idx(idx);
  };

  const handleJumpOperatingPoint = () => {
    if (currentX === undefined || activeData.length === 0) return;
    let bestIdx = 0;
    let bestDist = Infinity;
    activeData.forEach((row, idx) => {
      const d = Math.abs(Number(row[resolvedXKey]) - currentX);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = idx;
      }
    });
    jumpToIndex(bestIdx);
  };

  const handleAutoLockMinToPeak = () => {
    if (!s1Stats) return;
    setCursor1Idx(s1Stats.minIdx);
    setCursor2Idx(s1Stats.maxIdx);
  };

  const handleFindTargetY = () => {
    const targetVal = Number(targetYInput);
    if (!Number.isFinite(targetVal) || !primarySeries || activeData.length === 0) return;
    let bestIdx = 0;
    let bestDiff = Infinity;
    activeData.forEach((row, idx) => {
      const yv = Number(row[primarySeries.key]);
      const diff = Math.abs(yv - targetVal);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestIdx = idx;
      }
    });
    jumpToIndex(bestIdx);
  };

  // Mouse interaction handlers
  const getSvgCoords = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return null;
    const rect = svgRef.current.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * width;
    return relX;
  };

  const findNearestIndex = (relX: number) => {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < xValues.length; i++) {
      const d = Math.abs(toX(xValues[i]) - relX);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    return bestIdx;
  };

  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    const relX = getSvgCoords(e);
    if (relX === null || relX < padL || relX > width - padR) return;
    setDragStartX(relX);
    setDragCurrentX(relX);
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const relX = getSvgCoords(e);
    if (relX === null) return;
    if (dragStartX !== null) {
      setDragCurrentX(Math.max(padL, Math.min(width - padR, relX)));
    }
    setHoverIdx(findNearestIndex(relX));
  };

  const handleMouseUp = (e: React.MouseEvent<SVGSVGElement>) => {
    const relX = getSvgCoords(e);
    if (dragStartX !== null && dragCurrentX !== null) {
      const dist = Math.abs(dragCurrentX - dragStartX);
      if (dist > 14) {
        const x1 = fromSvgX(Math.min(dragStartX, dragCurrentX));
        const x2 = fromSvgX(Math.max(dragStartX, dragCurrentX));
        if (x2 > x1) {
          setCustomDomain(clampDomain(x1, x2));
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

    const targetIdx = hoverIdx !== null ? hoverIdx : relX !== null ? findNearestIndex(relX) : null;
    if (targetIdx === null || !activeData[targetIdx]) return;

    if (onSelectX) {
      onSelectX(Number(activeData[targetIdx][resolvedXKey]));
    }

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

  const handleDoubleClick = () => {
    handleResetView();
  };

  const handleWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    if (!e.ctrlKey && !e.metaKey && !e.shiftKey) return;
    e.preventDefault();
    if (e.deltaY > 0) {
      handleZoomOut();
    } else {
      handleZoomIn();
    }
  };

  const exportCsv = () => {
    if (!activeData || activeData.length === 0) return;
    const headers = [
      `${xLabel} (${xUnit})`,
      ...resolvedSeries.map((s) => `${s.name} (${s.unit})`),
    ];
    const rows = activeData.map((row) =>
      [row[resolvedXKey], ...resolvedSeries.map((s) => row[s.key] ?? '')].join(',')
    );
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '_')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!activeData || activeData.length === 0) return null;

  const activeIdx =
    hoverIdx !== null
      ? hoverIdx
      : scrubIdx !== null
      ? scrubIdx
      : cursor1Idx !== null
      ? cursor1Idx
      : Math.floor(activeData.length / 2);
  const activePoint = activeData[activeIdx] || activeData[0];

  const c1 = cursor1Idx !== null ? activeData[cursor1Idx] : null;
  const c2 = cursor2Idx !== null ? activeData[cursor2Idx] : null;

  return (
    <div className="bg-white dark:bg-[#0E131D] border border-slate-200 dark:border-slate-800 rounded-lg p-3.5 flex flex-col justify-between">
      {/* Header & Interactive Toolbar */}
      <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
              {title}
            </h4>
            {isZoomedOrPanned && (
              <span className="px-1.5 py-0.5 text-[10px] font-mono tabular-nums rounded bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border border-cyan-500/30">
                Range: [{xMin.toFixed(1)}, {xMax.toFixed(1)}] {xUnit}
              </span>
            )}
          </div>
          {subtitle && (
            <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5 leading-snug">{subtitle}</p>
          )}
          {clickActionHint && (
            <p className="text-[10px] font-mono text-cyan-400/90 mt-0.5 flex items-center gap-1">
              <MousePointerClick className="w-3 h-3" />
              {clickActionHint}
            </p>
          )}
        </div>

        {/* Zoom / Pan / Cursor / Export Controls */}
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={() => handlePan(-1)}
            className="p-1 text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded border border-slate-700 cursor-pointer"
            title="Pan Left across domain"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleZoomIn}
            className="px-1.5 py-1 text-[10px] font-mono text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded border border-slate-700 inline-flex items-center gap-0.5 cursor-pointer"
            title="Zoom In (or drag a box on the graph)"
          >
            <ZoomIn className="w-3 h-3 text-cyan-400" />
            In
          </button>
          <button
            type="button"
            onClick={handleZoomOut}
            className="px-1.5 py-1 text-[10px] font-mono text-cyan-300 hover:text-white bg-cyan-950/60 hover:bg-cyan-900/70 rounded border border-cyan-500/40 inline-flex items-center gap-0.5 cursor-pointer"
            title="Zoom Out & Dynamically Calculate Extended Curve"
          >
            <ZoomOut className="w-3 h-3 text-cyan-400" />
            Zoom Out
          </button>
          <button
            type="button"
            onClick={() => handlePan(1)}
            className="p-1 text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded border border-slate-700 cursor-pointer"
            title="Pan Right across domain"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>

          {isZoomedOrPanned && (
            <button
              type="button"
              onClick={handleResetView}
              className="px-1.5 py-1 text-[10px] font-mono bg-amber-500/15 text-amber-300 border border-amber-500/30 rounded hover:bg-amber-500/25 inline-flex items-center gap-0.5 cursor-pointer"
              title="Reset Zoom/Pan (or Double-Click Graph)"
            >
              <RotateCcw className="w-3 h-3" />
              Reset
            </button>
          )}

          {/* Quick Jump to Peak / Min / Operating Point */}
          {s1Stats && (
            <>
              <button
                type="button"
                onClick={() => jumpToIndex(s1Stats.maxIdx)}
                className="px-1.5 py-1 text-[10px] font-mono bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-slate-700 rounded cursor-pointer"
                title="Jump cursor to Series 1 Peak"
              >
                Peak
              </button>
              <button
                type="button"
                onClick={() => jumpToIndex(s1Stats.minIdx)}
                className="px-1.5 py-1 text-[10px] font-mono bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 rounded cursor-pointer"
                title="Jump cursor to Series 1 Minimum"
              >
                Min
              </button>
              <button
                type="button"
                onClick={handleAutoLockMinToPeak}
                className="px-1.5 py-1 text-[10px] font-mono bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 rounded cursor-pointer"
                title="Lock M1 at Minimum and M2 at Peak to inspect full span ΔY, slope, RMS & integral"
              >
                M1..M2
              </button>
            </>
          )}

          {currentX !== undefined && (
            <button
              type="button"
              onClick={handleJumpOperatingPoint}
              className="px-1.5 py-1 text-[10px] font-mono bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 rounded inline-flex items-center gap-0.5 cursor-pointer"
              title="Jump cursor to Active Operating Point"
            >
              <Target className="w-3 h-3" />
              Op.Pt
            </button>
          )}

          <button
            type="button"
            onClick={() => setZeroLockY((z) => !z)}
            className={`px-1.5 py-1 text-[10px] font-mono rounded border inline-flex items-center gap-0.5 cursor-pointer ${
              zeroLockY
                ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                : 'bg-slate-800 text-slate-400 hover:text-slate-200 border-slate-700'
            }`}
            title="Anchor Y-Axis to include 0"
          >
            <Anchor className="w-3 h-3" />
            0-Y
          </button>

          <button
            type="button"
            onClick={() => setShowScrubber((s) => !s)}
            className={`px-1.5 py-1 text-[10px] font-mono rounded border inline-flex items-center gap-0.5 cursor-pointer ${
              showScrubber
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                : 'bg-slate-800 text-slate-300 hover:text-white border-slate-700'
            }`}
            title="Toggle Precision Point Scrubber & Goal-Seek Y-Finder"
          >
            <SlidersHorizontal className="w-3 h-3" />
            Scrub
          </button>

          {onPointClick && activePoint && (
            <button
              type="button"
              onClick={() =>
                onPointClick(
                  Number(activePoint[resolvedXKey]),
                  Number(activePoint[resolvedSeries[0]?.key || 'y1']),
                  resolvedSeries[1] ? Number(activePoint[resolvedSeries[1].key]) : undefined
                )
              }
              className="px-2 py-1 text-[10px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded hover:bg-emerald-500/30 inline-flex items-center gap-1 cursor-pointer font-semibold"
              title="Apply current cursor X value to converter design"
            >
              <MousePointerClick className="w-3 h-3" />
              Apply {Number(activePoint[resolvedXKey]).toFixed(1)}
              {xUnit}
            </button>
          )}

          {(cursor1Idx !== null || cursor2Idx !== null) && (
            <button
              type="button"
              onClick={() => {
                setCursor1Idx(null);
                setCursor2Idx(null);
              }}
              className="px-1.5 py-1 text-[10px] font-mono bg-slate-800 text-slate-300 border border-slate-700 rounded hover:bg-slate-700 cursor-pointer"
            >
              Clear M1/M2
            </button>
          )}

          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-mono text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded border border-slate-700 cursor-pointer"
            title="Export active calculated curve to CSV"
          >
            <Download className="w-3 h-3" />
            CSV
          </button>
        </div>
      </div>

      {/* Live Readout Strip + Peak/Min/RMS Telemetry for Series 1 & Series 2 */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-2.5 py-1.5 mb-2 rounded bg-slate-950/90 border border-slate-800/80 text-[11px] font-mono">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 text-slate-300">
            <Crosshair className="w-3 h-3 text-cyan-400" />
            <span className="text-slate-400">{xLabel}:</span>
            <span className="text-white font-semibold">
              {typeof activePoint[resolvedXKey] === 'number'
                ? activePoint[resolvedXKey].toFixed(2)
                : activePoint[resolvedXKey]}{' '}
              {xUnit}
            </span>
          </div>

          {resolvedSeries.map((s) => {
            const val = Number(activePoint[s.key]);
            const refVal =
              s.refKey && activePoint[s.refKey] !== undefined
                ? Number(activePoint[s.refKey])
                : activeRefData && activeRefData[activeIdx]
                ? Number(activeRefData[activeIdx][s.key])
                : null;
            const delta =
              refVal !== null && Number.isFinite(refVal) ? val - refVal : null;
            const isHidden = Boolean(hiddenSeriesKeys[s.key]);
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => toggleSeriesVisibility(s.key)}
                className={`flex items-center gap-1.5 text-left transition-opacity cursor-pointer ${
                  isHidden ? 'opacity-40 line-through' : 'opacity-100'
                }`}
                title={resolvedSeries.length > 1 ? `Click to toggle ${s.name} visibility` : s.name}
              >
                <svg className="w-2.5 h-2.5 shrink-0" viewBox="0 0 10 10">
                  <circle cx="5" cy="5" r="4" fill={s.color} />
                </svg>
                <span className="text-slate-400">{s.name}:</span>
                <span className="font-semibold text-slate-100">
                  {Number.isFinite(val) ? val.toFixed(2) : '—'} {s.unit}
                </span>
                {delta !== null && (
                  <span
                    className={`text-[10px] px-1 rounded ${
                      delta >= 0
                        ? 'bg-emerald-500/10 text-emerald-300'
                        : 'bg-rose-500/10 text-rose-300'
                    }`}
                  >
                    ({delta >= 0 ? '+' : ''}
                    {delta.toFixed(2)})
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Auto-Computed Extrema & RMS Summary for Series 1 & Series 2 */}
        <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-400">
          {s1Stats && primarySeries && (
            <>
              <span className="inline-flex items-center gap-0.5 text-emerald-400/90">
                <ArrowUpRight className="w-3 h-3" />
                Pk1: <strong>{s1Stats.maxVal.toFixed(2)}</strong>
                {primarySeries.unit}@{s1Stats.maxX.toFixed(1)}
              </span>
              <span className="inline-flex items-center gap-0.5 text-cyan-400/90">
                <ArrowDownRight className="w-3 h-3" />
                Min1: <strong>{s1Stats.minVal.toFixed(2)}</strong>
                {primarySeries.unit}
              </span>
              <span className="text-slate-400">
                RMS1: <strong className="text-slate-200">{s1Stats.rmsVal.toFixed(2)}</strong>
                {primarySeries.unit}
              </span>
            </>
          )}
          {s2Stats && secondarySeries && (
            <span className="text-amber-300/90 border-l border-slate-800 pl-2">
              Pk2: <strong>{s2Stats.maxVal.toFixed(2)}</strong>
              {secondarySeries.unit} · Min2: <strong>{s2Stats.minVal.toFixed(2)}</strong>
              {secondarySeries.unit}
            </span>
          )}
        </div>
      </div>

      {/* Dual-Cursor M1 / M2 Differential, Slope, RMS & Definite Integral Bar */}
      {c1 && c2 && m1m2Analysis && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-2.5 py-1.5 mb-2 rounded bg-amber-500/10 border border-amber-500/30 text-[11px] font-mono text-amber-200">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-bold text-amber-300">
              Δ(M2 − M1): Δ{xLabel} = {m1m2Analysis.dx.toFixed(2)} {xUnit}
            </span>
            {primarySeries && (
              <span>
                Δ{primarySeries.name}: <strong>{m1m2Analysis.dy1 >= 0 ? '+' : ''}{m1m2Analysis.dy1.toFixed(2)} {primarySeries.unit}</strong>{' '}
                <span className="text-cyan-300">
                  (Slope: {m1m2Analysis.slope1.toFixed(3)} {primarySeries.unit}/{xUnit || 'u'})
                </span>
              </span>
            )}
            {secondarySeries && Number.isFinite(m1m2Analysis.dy2) && (
              <span>
                Δ{secondarySeries.name}: <strong>{m1m2Analysis.dy2 >= 0 ? '+' : ''}{m1m2Analysis.dy2.toFixed(2)} {secondarySeries.unit}</strong>
              </span>
            )}
          </div>
          {primarySeries && (
            <div className="flex flex-wrap items-center gap-3 text-[10px] text-emerald-300">
              <span>
                Mean: <strong>{m1m2Analysis.mean1.toFixed(2)} {primarySeries.unit}</strong>
              </span>
              <span>
                RMS: <strong>{m1m2Analysis.rms1.toFixed(2)} {primarySeries.unit}</strong>
              </span>
              <span>
                ∫Y₁·dX: <strong>{m1m2Analysis.area1.toFixed(2)} {primarySeries.unit}·{xUnit || 'u'}</strong>
              </span>
            </div>
          )}
        </div>
      )}

      {/* Optional Precision Point Scrubber & Goal-Seek Y-Value Finder */}
      {showScrubber && (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-2 px-2.5 py-2 mb-2 rounded bg-slate-950/90 border border-slate-800 text-[11px] font-mono items-center">
          <div className="md:col-span-7 flex items-center gap-2">
            <span className="text-slate-400 shrink-0">
              Pt [{activeIdx + 1}/{activeData.length}]:
            </span>
            <button
              type="button"
              onClick={() => jumpToIndex(Math.max(0, activeIdx - 1))}
              className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 cursor-pointer"
            >
              -1
            </button>
            <input
              type="range"
              min={0}
              max={Math.max(0, activeData.length - 1)}
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
              onClick={() => jumpToIndex(Math.min(activeData.length - 1, activeIdx + 1))}
              className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 cursor-pointer"
            >
              +1
            </button>
            <button
              type="button"
              onClick={() => setCursor1Idx(activeIdx)}
              className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 cursor-pointer shrink-0"
            >
              Set M1
            </button>
            <button
              type="button"
              onClick={() => setCursor2Idx(activeIdx)}
              className="px-1.5 py-0.5 rounded bg-pink-500/20 text-pink-300 border border-pink-500/40 cursor-pointer shrink-0"
            >
              Set M2
            </button>
          </div>

          <div className="md:col-span-5 flex items-center justify-end gap-1.5">
            <span className="text-slate-400 shrink-0">
              Find {primarySeries?.name.split(' ')[0] || 'Y1'}:
            </span>
            <input
              type="number"
              step="any"
              placeholder={`Target (${primarySeries?.unit || ''})`}
              value={targetYInput}
              onChange={(e) => setTargetYInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleFindTargetY();
              }}
              className="w-24 px-1.5 py-0.5 text-[11px] font-mono bg-slate-900 border border-slate-700 rounded text-slate-100"
            />
            <button
              type="button"
              onClick={handleFindTargetY}
              className="px-2 py-0.5 rounded bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 cursor-pointer shrink-0"
            >
              Find X
            </button>
          </div>
        </div>
      )}

      {/* SVG Interactive Canvas */}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto select-none cursor-crosshair overflow-visible"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onDoubleClick={handleDoubleClick}
        onWheel={handleWheel}
        onMouseLeave={() => {
          setHoverIdx(null);
          setDragStartX(null);
          setDragCurrentX(null);
        }}
      >
        <rect
          x={padL}
          y={padT}
          width={plotW}
          height={plotH}
          fill="#090d16"
          stroke="#1e293b"
          strokeWidth={1}
          rx={4}
        />

        {/* Optional Shaded Valid Design Window [validRange.min, validRange.max] */}
        {validRange &&
          (() => {
            const vx1 = Math.max(padL, Math.min(padL + plotW, toX(validRange.min)));
            const vx2 = Math.max(padL, Math.min(padL + plotW, toX(validRange.max)));
            if (vx2 <= vx1 + 2) return null;
            const vColor = validRange.color || '#10b981';
            return (
              <g>
                <rect
                  x={vx1}
                  y={padT}
                  width={vx2 - vx1}
                  height={plotH}
                  fill={vColor}
                  fillOpacity={0.09}
                />
                <line
                  x1={vx1}
                  y1={padT}
                  x2={vx1}
                  y2={padT + plotH}
                  stroke={vColor}
                  strokeWidth={1}
                  strokeDasharray="3 3"
                  opacity={0.6}
                />
                <line
                  x1={vx2}
                  y1={padT}
                  x2={vx2}
                  y2={padT + plotH}
                  stroke={vColor}
                  strokeWidth={1}
                  strokeDasharray="3 3"
                  opacity={0.6}
                />
                <text
                  x={(vx1 + vx2) / 2}
                  y={padT + 11}
                  fill={vColor}
                  fontSize={9}
                  fontFamily="monospace"
                  textAnchor="middle"
                  opacity={0.9}
                >
                  {validRange.label}
                </text>
              </g>
            );
          })()}

        {/* Shaded Area Between M1 and M2 Cursors when both are active */}
        {cursor1Idx !== null &&
          cursor2Idx !== null &&
          activeData[cursor1Idx] &&
          activeData[cursor2Idx] &&
          (() => {
            const x1Px = toX(Number(activeData[cursor1Idx][resolvedXKey]));
            const x2Px = toX(Number(activeData[cursor2Idx][resolvedXKey]));
            const leftPx = Math.max(padL, Math.min(x1Px, x2Px));
            const rightPx = Math.min(padL + plotW, Math.max(x1Px, x2Px));
            return (
              <rect
                x={leftPx}
                y={padT}
                width={Math.max(1, rightPx - leftPx)}
                height={plotH}
                fill="#f59e0b"
                fillOpacity={0.07}
              />
            );
          })()}

        {/* Horizontal Grid & Y Axis Ticks */}
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const y = padT + plotH * (1 - t);
          const lVal = leftBounds.min + t * (leftBounds.max - leftBounds.min);
          const rVal = rightBounds.min + t * (rightBounds.max - rightBounds.min);
          return (
            <g key={t}>
              <line
                x1={padL}
                y1={y}
                x2={padL + plotW}
                y2={y}
                stroke="#1e293b"
                strokeDasharray="3 3"
                strokeWidth={1}
              />
              <text
                x={padL - 6}
                y={y + 3}
                textAnchor="end"
                fill="#94a3b8"
                fontSize={10}
                fontFamily="monospace"
              >
                {lVal.toFixed(Math.abs(lVal) < 10 ? 2 : 1)}
              </text>
              {hasRightAxis && (
                <text
                  x={padL + plotW + 6}
                  y={y + 3}
                  textAnchor="start"
                  fill="#94a3b8"
                  fontSize={10}
                  fontFamily="monospace"
                >
                  {rVal.toFixed(Math.abs(rVal) < 10 ? 2 : 1)}
                </text>
              )}
            </g>
          );
        })}

        {/* Vertical Grid & X Axis Ticks */}
        {[0, 0.2, 0.4, 0.6, 0.8, 1].map((t) => {
          const x = padL + plotW * t;
          const xVal =
            logX && xMin > 0
              ? Math.pow(
                  10,
                  Math.log10(xMin) + t * (Math.log10(xMax) - Math.log10(xMin))
                )
              : xMin + t * (xMax - xMin);
          return (
            <g key={t}>
              <line
                x1={x}
                y1={padT}
                x2={x}
                y2={padT + plotH}
                stroke="#1e293b"
                strokeDasharray="3 3"
                strokeWidth={1}
              />
              <text
                x={x}
                y={padT + plotH + 14}
                textAnchor="middle"
                fill="#94a3b8"
                fontSize={10}
                fontFamily="monospace"
              >
                {xVal >= 1000 && logX
                  ? `${(xVal / 1000).toFixed(1)}k`
                  : xVal.toFixed(xMax - xMin < 5 ? 2 : 1)}
              </text>
            </g>
          );
        })}

        {/* Axis Titles */}
        <text
          x={padL + plotW / 2}
          y={height - 5}
          textAnchor="middle"
          fill="#64748b"
          fontSize={10}
          fontFamily="monospace"
        >
          {xLabel} ({xUnit}) — [Drag box to Zoom · Zoom Out for extended curve · Click to lock M1/M2]
        </text>

        {/* Horizontal Reference Markers */}
        {horizontalMarkers.map((m, idx) => {
          const mVal = m.value ?? m.x ?? 0;
          const y = m.axis === 'right' ? toYRight(mVal) : toYLeft(mVal);
          if (y < padT || y > padT + plotH) return null;
          return (
            <g key={idx}>
              <line
                x1={padL}
                y1={y}
                x2={padL + plotW}
                y2={y}
                stroke={m.color}
                strokeWidth={1.3}
                strokeDasharray={m.dashed !== false ? '4 4' : undefined}
              />
              <text
                x={padL + 6}
                y={y - 4}
                fill={m.color}
                fontSize={9}
                fontFamily="monospace"
              >
                {m.label}
              </text>
            </g>
          );
        })}

        {/* Vertical Reference Markers */}
        {resolvedVerticalMarkers.map((m, idx) => {
          const x = toX(m.value);
          if (x < padL || x > padL + plotW) return null;
          return (
            <g key={idx}>
              <line
                x1={x}
                y1={padT}
                x2={x}
                y2={padT + plotH}
                stroke={m.color}
                strokeWidth={1.4}
                strokeDasharray={m.dashed !== false ? '4 4' : undefined}
              />
              <text
                x={Math.min(padL + plotW - 45, Math.max(padL + 4, x + 4))}
                y={padT + 12 + idx * 11}
                fill={m.color}
                fontSize={9}
                fontFamily="monospace"
              >
                {m.label}
              </text>
            </g>
          );
        })}

        {/* Pinned Reference Ghost Series */}
        {visibleSeries.map((s) => {
          const mapY = s.axis === 'right' ? toYRight : toYLeft;
          const hasInlineRef =
            s.refKey && activeData.some((row) => row[s.refKey!] !== undefined);
          if (!hasInlineRef && !activeRefData) return null;

          const sourceRows = hasInlineRef ? activeData : activeRefData!;
          const valKey = hasInlineRef ? s.refKey! : s.key;

          const pts = sourceRows
            .map((row) => {
              const xv = Number(row[resolvedXKey]);
              const yv = Number(row[valKey]);
              if (!Number.isFinite(xv) || !Number.isFinite(yv)) return null;
              const px = toX(xv);
              const py = Math.max(padT, Math.min(padT + plotH, mapY(yv)));
              return `${px.toFixed(1)},${py.toFixed(1)}`;
            })
            .filter(Boolean)
            .join(' ');

          if (!pts) return null;
          return (
            <polyline
              key={`ref-${s.key}`}
              fill="none"
              stroke={s.color}
              strokeWidth={1.5}
              strokeDasharray="3 3"
              opacity={0.45}
              points={pts}
            />
          );
        })}

        {/* Active Data Polylines */}
        {visibleSeries.map((s) => {
          const mapY = s.axis === 'right' ? toYRight : toYLeft;
          const pts = activeData
            .map((row) => {
              const xv = Number(row[resolvedXKey]);
              const yv = Number(row[s.key]);
              if (!Number.isFinite(xv) || !Number.isFinite(yv)) return null;
              const px = toX(xv);
              const py = Math.max(padT, Math.min(padT + plotH, mapY(yv)));
              return `${px.toFixed(1)},${py.toFixed(1)}`;
            })
            .filter(Boolean)
            .join(' ');

          return (
            <polyline
              key={s.key}
              fill="none"
              stroke={s.color}
              strokeWidth={2.3}
              strokeDasharray={s.dashed ? '4 4' : undefined}
              points={pts}
            />
          );
        })}

        {/* Peak Marker Dot on Series 1 */}
        {s1Stats &&
          primarySeries &&
          !hiddenSeriesKeys[primarySeries.key] &&
          (() => {
            const px = toX(s1Stats.maxX);
            const mapY = primarySeries.axis === 'right' ? toYRight : toYLeft;
            const py = Math.max(padT, Math.min(padT + plotH, mapY(s1Stats.maxVal)));
            if (px < padL || px > padL + plotW) return null;
            return (
              <g>
                <circle
                  cx={px}
                  cy={py}
                  r={3.5}
                  fill="#10b981"
                  stroke="#090d16"
                  strokeWidth={1.2}
                />
              </g>
            );
          })()}

        {/* Drag-to-Zoom Selection Box */}
        {dragStartX !== null &&
          dragCurrentX !== null &&
          Math.abs(dragCurrentX - dragStartX) > 6 && (
            <rect
              x={Math.min(dragStartX, dragCurrentX)}
              y={padT}
              width={Math.abs(dragCurrentX - dragStartX)}
              height={plotH}
              fill="#38bdf8"
              fillOpacity={0.18}
              stroke="#38bdf8"
              strokeWidth={1}
              strokeDasharray="3 2"
            />
          )}

        {/* Locked Cursor 1 (M1) */}
        {cursor1Idx !== null && activeData[cursor1Idx] && (
          <g>
            <line
              x1={toX(Number(activeData[cursor1Idx][resolvedXKey]))}
              y1={padT}
              x2={toX(Number(activeData[cursor1Idx][resolvedXKey]))}
              y2={padT + plotH}
              stroke="#f59e0b"
              strokeWidth={1.5}
            />
            <text
              x={toX(Number(activeData[cursor1Idx][resolvedXKey])) + 3}
              y={padT + plotH - 6}
              fill="#f59e0b"
              fontSize={9}
              fontFamily="monospace"
              fontWeight="bold"
            >
              M1 ({Number(activeData[cursor1Idx][resolvedXKey]).toFixed(1)})
            </text>
          </g>
        )}

        {/* Locked Cursor 2 (M2) */}
        {cursor2Idx !== null && activeData[cursor2Idx] && (
          <g>
            <line
              x1={toX(Number(activeData[cursor2Idx][resolvedXKey]))}
              y1={padT}
              x2={toX(Number(activeData[cursor2Idx][resolvedXKey]))}
              y2={padT + plotH}
              stroke="#ec4899"
              strokeWidth={1.5}
            />
            <text
              x={toX(Number(activeData[cursor2Idx][resolvedXKey])) + 3}
              y={padT + plotH - 18}
              fill="#ec4899"
              fontSize={9}
              fontFamily="monospace"
              fontWeight="bold"
            >
              M2 ({Number(activeData[cursor2Idx][resolvedXKey]).toFixed(1)})
            </text>
          </g>
        )}

        {/* Hover / Active Crosshair & Dots */}
        {activePoint && (
          <g>
            <line
              x1={toX(Number(activePoint[resolvedXKey]))}
              y1={padT}
              x2={toX(Number(activePoint[resolvedXKey]))}
              y2={padT + plotH}
              stroke="#94a3b8"
              strokeWidth={1}
              strokeDasharray="2 2"
            />
            {visibleSeries.map((s) => {
              const mapY = s.axis === 'right' ? toYRight : toYLeft;
              const yv = Number(activePoint[s.key]);
              if (!Number.isFinite(yv)) return null;
              const py = Math.max(padT, Math.min(padT + plotH, mapY(yv)));
              return (
                <circle
                  key={`dot-${s.key}`}
                  cx={toX(Number(activePoint[resolvedXKey]))}
                  cy={py}
                  r={4.5}
                  fill={s.color}
                  stroke="#0f172a"
                  strokeWidth={1.5}
                />
              );
            })}
          </g>
        )}
      </svg>
    </div>
  );
};
