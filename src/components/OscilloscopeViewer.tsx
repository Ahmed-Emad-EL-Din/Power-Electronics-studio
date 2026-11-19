import React, { useMemo, useRef, useState } from 'react';
import { WaveformPoint, DcDcResults } from '../engine/dcdcEngine';
import { Download, Crosshair, RotateCcw, ZoomIn, ZoomOut, Activity } from 'lucide-react';

interface OscilloscopeViewerProps {
  res: DcDcResults;
  pinnedRes?: DcDcResults | null;
}

type ChannelKey = 'v_pri_V' | 'i_pri_A' | 'v_sec_V' | 'i_lo_A' | 'i_lm_A' | 'v_cr_V';

interface ChannelDef {
  key: ChannelKey;
  label: string;
  unit: string;
  color: string;
  group: 'voltage' | 'current';
  defaultOn: boolean;
}

const CHANNELS: ChannelDef[] = [
  { key: 'v_pri_V', label: 'CH1 v_pri', unit: 'V', color: '#f59e0b', group: 'voltage', defaultOn: true },
  { key: 'i_pri_A', label: 'CH2 i_pri', unit: 'A', color: '#38bdf8', group: 'current', defaultOn: true },
  { key: 'v_sec_V', label: 'CH3 v_sec', unit: 'V', color: '#a855f7', group: 'voltage', defaultOn: true },
  { key: 'i_lo_A', label: 'CH4 i_Lo', unit: 'A', color: '#10b981', group: 'current', defaultOn: true },
  { key: 'i_lm_A', label: 'CH5 i_Lm', unit: 'A', color: '#ec4899', group: 'current', defaultOn: false },
  { key: 'v_cr_V', label: 'CH6 v_Cr', unit: 'V', color: '#fb7185', group: 'voltage', defaultOn: false },
];

export const OscilloscopeViewer: React.FC<OscilloscopeViewerProps> = ({ res, pinnedRes }) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const T_us = 1000 / Math.max(10, res.state.fsw_kHz);

  const [cyclesVisible, setCyclesVisible] = useState<number>(2);
  const [panCycles, setPanCycles] = useState<number>(0);
  const [enabled, setEnabled] = useState<Record<ChannelKey, boolean>>({
    v_pri_V: true,
    i_pri_A: true,
    v_sec_V: true,
    i_lo_A: true,
    i_lm_A: false,
    v_cr_V: false,
  });
  const [cursor1Idx, setCursor1Idx] = useState<number | null>(30);
  const [cursor2Idx, setCursor2Idx] = useState<number | null>(90);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [showPinned, setShowPinned] = useState<boolean>(true);

  const tStart = panCycles * T_us;
  const tEnd = tStart + cyclesVisible * T_us;
  const sampleCount = 240;

  const samples: WaveformPoint[] = useMemo(() => {
    const out: WaveformPoint[] = [];
    for (let i = 0; i <= sampleCount; i++) {
      const t = tStart + ((tEnd - tStart) * i) / sampleCount;
      out.push(res.evaluators.evalFullWaveforms(t));
    }
    return out;
  }, [res, tStart, tEnd]);

  const pinnedSamples: WaveformPoint[] | null = useMemo(() => {
    if (!pinnedRes || !showPinned) return null;
    const out: WaveformPoint[] = [];
    for (let i = 0; i <= sampleCount; i++) {
      const t = tStart + ((tEnd - tStart) * i) / sampleCount;
      out.push(pinnedRes.evaluators.evalFullWaveforms(t));
    }
    return out;
  }, [pinnedRes, showPinned, tStart, tEnd]);

  const activeVoltageChannels = CHANNELS.filter((c) => c.group === 'voltage' && enabled[c.key]);
  const activeCurrentChannels = CHANNELS.filter((c) => c.group === 'current' && enabled[c.key]);

  const { vMin, vMax } = useMemo(() => {
    if (activeVoltageChannels.length === 0) return { vMin: -10, vMax: 10 };
    let lo = Infinity;
    let hi = -Infinity;
    for (const pt of samples) {
      for (const ch of activeVoltageChannels) {
        const val = pt[ch.key] ?? 0;
        if (val < lo) lo = val;
        if (val > hi) hi = val;
      }
    }
    const pad = Math.max(10, (hi - lo) * 0.14);
    return { vMin: lo - pad, vMax: hi + pad };
  }, [samples, activeVoltageChannels]);

  const { iMin, iMax } = useMemo(() => {
    if (activeCurrentChannels.length === 0) return { iMin: -5, iMax: 5 };
    let lo = Infinity;
    let hi = -Infinity;
    for (const pt of samples) {
      for (const ch of activeCurrentChannels) {
        const val = pt[ch.key] ?? 0;
        if (val < lo) lo = val;
        if (val > hi) hi = val;
      }
    }
    const pad = Math.max(1, (hi - lo) * 0.16);
    return { iMin: lo - pad, iMax: hi + pad };
  }, [samples, activeCurrentChannels]);

  const W = 920;
  const H = 340;
  const padL = 62;
  const padR = 62;
  const padT = 24;
  const padB = 34;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const toX = (t: number) => padL + ((t - tStart) / Math.max(1e-6, tEnd - tStart)) * plotW;
  const toYV = (v: number) => padT + plotH - ((v - vMin) / Math.max(1e-6, vMax - vMin)) * plotH;
  const toYI = (iVal: number) => padT + plotH - ((iVal - iMin) / Math.max(1e-6, iMax - iMin)) * plotH;

  const activeChannels = CHANNELS.filter((c) => enabled[c.key]);

  // Cursor M1..M2 metrics
  const cursorMetrics = useMemo(() => {
    const i1 = cursor1Idx !== null ? Math.min(samples.length - 1, Math.max(0, cursor1Idx)) : 0;
    const i2 = cursor2Idx !== null ? Math.min(samples.length - 1, Math.max(0, cursor2Idx)) : samples.length - 1;
    const lo = Math.min(i1, i2);
    const hi = Math.max(i1, i2);
    const slice = samples.slice(lo, hi + 1);
    const dt_us = Math.max(1e-4, samples[hi].t_us - samples[lo].t_us);

    return activeChannels.map((ch) => {
      const v1 = samples[i1][ch.key] ?? 0;
      const v2 = samples[i2][ch.key] ?? 0;
      let sum = 0;
      let sumSq = 0;
      let minV = Infinity;
      let maxV = -Infinity;
      for (const s of slice) {
        const val = s[ch.key] ?? 0;
        sum += val;
        sumSq += val * val;
        if (val < minV) minV = val;
        if (val > maxV) maxV = val;
      }
      const n = Math.max(1, slice.length);
      const mean = sum / n;
      const rms = Math.sqrt(sumSq / n);
      const pkPk = maxV - minV;
      const slope = (v2 - v1) / dt_us;
      return {
        ch,
        v1,
        v2,
        delta: v2 - v1,
        mean,
        rms,
        pkPk,
        slope,
      };
    });
  }, [samples, cursor1Idx, cursor2Idx, activeChannels]);

  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * W;
    const frac = Math.max(0, Math.min(1, (relX - padL) / plotW));
    const idx = Math.round(frac * (samples.length - 1));
    if (e.shiftKey) setCursor2Idx(idx);
    else if (cursor1Idx === null) setCursor1Idx(idx);
    else if (cursor2Idx === null) setCursor2Idx(idx);
    else {
      setCursor1Idx(idx);
      setCursor2Idx(null);
    }
  };

  const handleSvgMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * W;
    if (relX < padL || relX > padL + plotW) {
      setHoverIdx(null);
      return;
    }
    const frac = (relX - padL) / plotW;
    setHoverIdx(Math.round(frac * (samples.length - 1)));
  };

  const exportCsv = () => {
    const header = ['t_us', ...CHANNELS.map((c) => `${c.key}`)].join(',');
    const rows = samples.map((s) =>
      [s.t_us, ...CHANNELS.map((c) => s[c.key] ?? 0)].join(',')
    );
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `oscilloscope_${res.state.topology}_${res.state.fsw_kHz}kHz.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportSvg = () => {
    if (!svgRef.current) return;
    const xml = new XMLSerializer().serializeToString(svgRef.current);
    const blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `oscilloscope_${res.state.topology}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const p1 = cursor1Idx !== null ? samples[cursor1Idx] : null;
  const p2 = cursor2Idx !== null ? samples[cursor2Idx] : null;
  const hoverPt = hoverIdx !== null ? samples[hoverIdx] : null;

  return (
    <div className="bg-[#090D16] border border-slate-800 rounded-xl p-4 space-y-3 text-slate-100">
      {/* Scope Header & Timebase Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-cyan-400" />
            <h4 className="text-xs font-bold font-mono text-slate-100">
              Multi-Channel Virtual Oscilloscope ({res.state.topology.toUpperCase()} · T_sw = {T_us.toFixed(2)} µs)
            </h4>
            <span className="px-2 py-0.5 rounded bg-cyan-500/15 border border-cyan-500/30 text-[10px] font-mono text-cyan-300">
              {cyclesVisible} {cyclesVisible === 1 ? 'Cycle' : 'Cycles'} · {samples.length} pts
            </span>
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Click to place M1 cursor · Shift+Click to place M2 cursor · Inspect RMS, Pk-Pk, Mean &amp; dY/dt
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setCyclesVisible((c) => Math.max(0.5, Number((c * 0.5).toFixed(2))))}
            className="px-2 py-1 text-[10px] font-mono rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 inline-flex items-center gap-1 cursor-pointer"
            title="Zoom in timebase"
          >
            <ZoomIn className="w-3 h-3 text-cyan-400" />
            Time/Div -
          </button>
          <button
            type="button"
            onClick={() => setCyclesVisible((c) => Math.min(8, Number((c * 1.5).toFixed(2))))}
            className="px-2 py-1 text-[10px] font-mono rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 inline-flex items-center gap-1 cursor-pointer"
            title="Zoom out timebase"
          >
            <ZoomOut className="w-3 h-3 text-cyan-400" />
            Time/Div +
          </button>
          <button
            type="button"
            onClick={() => setPanCycles((p) => p + 0.25)}
            className="px-2 py-1 text-[10px] font-mono rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 cursor-pointer"
          >
            Shift +0.25T
          </button>
          <button
            type="button"
            onClick={() => {
              setCyclesVisible(2);
              setPanCycles(0);
              setCursor1Idx(30);
              setCursor2Idx(90);
            }}
            className="px-2 py-1 text-[10px] font-mono rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 inline-flex items-center gap-1 cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            Reset
          </button>
          {pinnedRes && (
            <button
              type="button"
              onClick={() => setShowPinned((v) => !v)}
              className={`px-2 py-1 text-[10px] font-mono rounded border cursor-pointer ${
                showPinned
                  ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                  : 'bg-slate-800 border-slate-700 text-slate-400'
              }`}
            >
              Ref Overlay
            </button>
          )}
          <button
            type="button"
            onClick={exportCsv}
            className="px-2 py-1 text-[10px] font-mono rounded bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 inline-flex items-center gap-1 cursor-pointer"
          >
            <Download className="w-3 h-3" />
            CSV
          </button>
          <button
            type="button"
            onClick={exportSvg}
            className="px-2 py-1 text-[10px] font-mono rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 inline-flex items-center gap-1 cursor-pointer"
          >
            <Download className="w-3 h-3" />
            SVG
          </button>
        </div>
      </div>

      {/* Channel Toggle Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {CHANNELS.map((ch) => {
            const on = enabled[ch.key];
            return (
              <button
                key={ch.key}
                type="button"
                onClick={() => setEnabled((prev) => ({ ...prev, [ch.key]: !prev[ch.key] }))}
                className={`px-2.5 py-1 rounded text-[11px] font-mono border transition-colors cursor-pointer inline-flex items-center gap-1.5 ${
                  on
                    ? 'bg-slate-900 text-slate-100 border-slate-600 font-semibold'
                    : 'bg-slate-950 text-slate-500 border-slate-800 opacity-65'
                }`}
              >
                <span
                  className="w-2 h-2 rounded-full inline-block"
                  style={{ backgroundColor: on ? ch.color : '#475569' }}
                />
                {ch.label} ({ch.unit})
              </button>
            );
          })}
        </div>

        {hoverPt && (
          <div className="text-[11px] font-mono text-cyan-300 tabular-nums flex items-center gap-2">
            <Crosshair className="w-3.5 h-3.5" />
            t = {hoverPt.t_us.toFixed(2)} µs
            {enabled.v_pri_V && ` · v_pri=${hoverPt.v_pri_V}V`}
            {enabled.i_pri_A && ` · i_pri=${hoverPt.i_pri_A}A`}
            {enabled.i_lo_A && ` · i_Lo=${hoverPt.i_lo_A}A`}
          </div>
        )}
      </div>

      {/* Scope Graticule SVG */}
      <div className="w-full overflow-x-auto">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          onClick={handleSvgClick}
          onMouseMove={handleSvgMove}
          onMouseLeave={() => setHoverIdx(null)}
          className="w-full min-w-[640px] h-[320px] bg-[#060910] rounded-lg border border-slate-800 cursor-crosshair select-none"
        >
          {/* 10x8 Oscilloscope Graticule */}
          {Array.from({ length: 11 }).map((_, idx) => {
            const x = padL + (plotW * idx) / 10;
            const tVal = tStart + ((tEnd - tStart) * idx) / 10;
            return (
              <g key={`gx-${idx}`}>
                <line
                  x1={x}
                  y1={padT}
                  x2={x}
                  y2={padT + plotH}
                  stroke={idx === 0 || idx === 10 ? '#334155' : '#1e293b'}
                  strokeDasharray={idx % 2 === 0 ? undefined : '2 3'}
                  strokeWidth={1}
                />
                <text
                  x={x}
                  y={H - 12}
                  textAnchor="middle"
                  fill="#94a3b8"
                  fontSize="9.5"
                  fontFamily="monospace"
                >
                  {tVal.toFixed(1)}µs
                </text>
              </g>
            );
          })}

          {Array.from({ length: 7 }).map((_, idx) => {
            const y = padT + (plotH * idx) / 6;
            const vTick = vMax - ((vMax - vMin) * idx) / 6;
            const iTick = iMax - ((iMax - iMin) * idx) / 6;
            return (
              <g key={`gy-${idx}`}>
                <line
                  x1={padL}
                  y1={y}
                  x2={padL + plotW}
                  y2={y}
                  stroke={idx === 3 ? '#334155' : '#1e293b'}
                  strokeDasharray={idx === 3 ? undefined : '2 3'}
                  strokeWidth={1}
                />
                {activeVoltageChannels.length > 0 && (
                  <text
                    x={padL - 6}
                    y={y + 3}
                    textAnchor="end"
                    fill="#fbbf24"
                    fontSize="9"
                    fontFamily="monospace"
                  >
                    {vTick.toFixed(0)}V
                  </text>
                )}
                {activeCurrentChannels.length > 0 && (
                  <text
                    x={padL + plotW + 6}
                    y={y + 3}
                    textAnchor="start"
                    fill="#34d399"
                    fontSize="9"
                    fontFamily="monospace"
                  >
                    {iTick.toFixed(1)}A
                  </text>
                )}
              </g>
            );
          })}

          {/* Pinned Reference Overlay */}
          {pinnedSamples &&
            activeChannels.map((ch) => {
              const yMap = ch.group === 'voltage' ? toYV : toYI;
              const pts = pinnedSamples
                .map((s) => `${toX(s.t_us).toFixed(1)},${yMap(s[ch.key] ?? 0).toFixed(1)}`)
                .join(' ');
              return (
                <polyline
                  key={`pin-${ch.key}`}
                  fill="none"
                  stroke={ch.color}
                  strokeOpacity={0.35}
                  strokeWidth={1.4}
                  strokeDasharray="4 4"
                  points={pts}
                />
              );
            })}

          {/* Live Channels */}
          {activeChannels.map((ch) => {
            const yMap = ch.group === 'voltage' ? toYV : toYI;
            const pts = samples
              .map((s) => `${toX(s.t_us).toFixed(1)},${yMap(s[ch.key] ?? 0).toFixed(1)}`)
              .join(' ');
            return (
              <polyline
                key={`live-${ch.key}`}
                fill="none"
                stroke={ch.color}
                strokeWidth={2}
                points={pts}
              />
            );
          })}

          {/* M1 & M2 Shaded Measurement Band */}
          {p1 && p2 && (
            <rect
              x={Math.min(toX(p1.t_us), toX(p2.t_us))}
              y={padT}
              width={Math.abs(toX(p2.t_us) - toX(p1.t_us))}
              height={plotH}
              fill="#38bdf8"
              fillOpacity={0.07}
            />
          )}

          {p1 && (
            <g>
              <line
                x1={toX(p1.t_us)}
                y1={padT}
                x2={toX(p1.t_us)}
                y2={padT + plotH}
                stroke="#f59e0b"
                strokeWidth={1.5}
              />
              <text
                x={toX(p1.t_us) + 4}
                y={padT + 12}
                fill="#f59e0b"
                fontSize="9.5"
                fontFamily="monospace"
                fontWeight="bold"
              >
                M1 ({p1.t_us.toFixed(2)}µs)
              </text>
            </g>
          )}

          {p2 && (
            <g>
              <line
                x1={toX(p2.t_us)}
                y1={padT}
                x2={toX(p2.t_us)}
                y2={padT + plotH}
                stroke="#ec4899"
                strokeWidth={1.5}
              />
              <text
                x={toX(p2.t_us) + 4}
                y={padT + 24}
                fill="#ec4899"
                fontSize="9.5"
                fontFamily="monospace"
                fontWeight="bold"
              >
                M2 ({p2.t_us.toFixed(2)}µs)
              </text>
            </g>
          )}

          {hoverPt && (
            <line
              x1={toX(hoverPt.t_us)}
              y1={padT}
              x2={toX(hoverPt.t_us)}
              y2={padT + plotH}
              stroke="#94a3b8"
              strokeWidth={1}
              strokeDasharray="2 2"
            />
          )}
        </svg>
      </div>

      {/* M1..M2 Cursor Telemetry Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-[11px] font-mono border-collapse">
          <thead>
            <tr className="border-b border-slate-800 text-slate-400 text-left">
              <th className="py-1.5 pr-3">Channel</th>
              <th className="py-1.5 px-2">M1</th>
              <th className="py-1.5 px-2">M2</th>
              <th className="py-1.5 px-2">Δ(M2−M1)</th>
              <th className="py-1.5 px-2">Window RMS</th>
              <th className="py-1.5 px-2">Window Mean</th>
              <th className="py-1.5 px-2">Pk-Pk</th>
              <th className="py-1.5 pl-2">dY/dt</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/70">
            {cursorMetrics.map(({ ch, v1, v2, delta, rms, mean, pkPk, slope }) => (
              <tr key={ch.key}>
                <td className="py-1.5 pr-3 font-semibold" style={{ color: ch.color }}>
                  {ch.label} ({ch.unit})
                </td>
                <td className="py-1.5 px-2 tabular-nums">{v1.toFixed(2)}</td>
                <td className="py-1.5 px-2 tabular-nums">{v2.toFixed(2)}</td>
                <td className="py-1.5 px-2 tabular-nums text-cyan-300">
                  {delta >= 0 ? '+' : ''}
                  {delta.toFixed(2)}
                </td>
                <td className="py-1.5 px-2 tabular-nums font-semibold">{rms.toFixed(2)}</td>
                <td className="py-1.5 px-2 tabular-nums">{mean.toFixed(2)}</td>
                <td className="py-1.5 px-2 tabular-nums">{pkPk.toFixed(2)}</td>
                <td className="py-1.5 pl-2 tabular-nums text-slate-400">
                  {slope.toFixed(2)} {ch.unit}/µs
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
