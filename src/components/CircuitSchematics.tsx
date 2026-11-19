import React, { useRef, useState } from 'react';
import { DcDcResults } from '../engine/dcdcEngine';
import { AcDcResults } from '../engine/acdcEngine';
import { AcDcTopologyType } from '../data/databases';
import { generateAcDcLtspiceAsc, generateDcDcLtspiceAsc } from '../engine/spiceNetlistExporter';
import { Download, Image as ImageIcon, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';

// ============================================================================
// STANDARD IEEE / IEC ELECTRICAL CAD SVG PRIMITIVES
// ============================================================================

interface MosfetProps {
  x: number;
  y: number;
  label: string;
  sublabel?: string;
  color?: string;
  scale?: number;
}

export const MosfetSymbol: React.FC<MosfetProps> = ({
  x,
  y,
  label,
  sublabel,
  color = '#06b6d4',
  scale = 1,
}) => (
  <g transform={`translate(${x}, ${y}) scale(${scale})`}>
    {/* Device envelope circle */}
    <circle
      cx="0"
      cy="0"
      r="16"
      fill="#0f172a"
      fillOpacity="0.65"
      stroke={color}
      strokeWidth="1.2"
      strokeOpacity="0.7"
    />
    {/* Drain & Source external leads */}
    <line x1="0" y1="-22" x2="0" y2="-9" stroke="currentColor" strokeWidth="1.7" />
    <line x1="0" y1="9" x2="0" y2="22" stroke="currentColor" strokeWidth="1.7" />
    {/* Drain & Source horizontal internal links to channel */}
    <line x1="-4" y1="-9" x2="0" y2="-9" stroke={color} strokeWidth="1.5" />
    <line x1="-4" y1="0" x2="0" y2="0" stroke={color} strokeWidth="1.3" />
    <line x1="0" y1="0" x2="0" y2="9" stroke="currentColor" strokeWidth="1.5" />
    <line x1="-4" y1="9" x2="0" y2="9" stroke={color} strokeWidth="1.5" />
    {/* 3 broken channel segments (Enhancement-mode MOSFET) */}
    <line x1="-4" y1="-11.5" x2="-4" y2="-6.5" stroke={color} strokeWidth="1.8" />
    <line x1="-4" y1="-2.5" x2="-4" y2="2.5" stroke={color} strokeWidth="1.8" />
    <line x1="-4" y1="6.5" x2="-4" y2="11.5" stroke={color} strokeWidth="1.8" />
    {/* Gate vertical plate + gate terminal lead */}
    <line x1="-8" y1="-10" x2="-8" y2="10" stroke={color} strokeWidth="1.6" />
    <line x1="-15" y1="6" x2="-8" y2="6" stroke={color} strokeWidth="1.4" />
    {/* Anti-parallel Body Diode inside envelope */}
    <line x1="0" y1="-9" x2="7" y2="-9" stroke={color} strokeWidth="1.1" />
    <line x1="0" y1="9" x2="7" y2="9" stroke={color} strokeWidth="1.1" />
    <line x1="7" y1="-9" x2="7" y2="9" stroke={color} strokeWidth="1.1" />
    <polygon points="4,3.5 10,3.5 7,-3.5" fill={color} stroke="none" />
    <line x1="3.8" y1="-3.5" x2="10.2" y2="-3.5" stroke={color} strokeWidth="1.3" />
    {/* Labels */}
    <text x="19" y="-3" fill={color} fontSize="9.5" fontWeight="bold">
      {label}
    </text>
    {sublabel && (
      <text x="19" y="8" fill="#94a3b8" fontSize="8">
        {sublabel}
      </text>
    )}
  </g>
);

interface DiodeProps {
  x: number;
  y: number;
  dir?: 'up' | 'down' | 'right' | 'left';
  isSchottky?: boolean;
  label?: string;
  sublabel?: string;
  color?: string;
}

export const DiodeSymbol: React.FC<DiodeProps> = ({
  x,
  y,
  dir = 'up',
  isSchottky = false,
  label,
  sublabel,
  color = '#f59e0b',
}) => {
  const rot = dir === 'up' ? 0 : dir === 'right' ? 90 : dir === 'down' ? 180 : -90;
  return (
    <g transform={`translate(${x}, ${y})`}>
      <g transform={`rotate(${rot})`}>
        <line x1="0" y1="-18" x2="0" y2="18" stroke="currentColor" strokeWidth="1.6" />
        <polygon points="-7,6 7,6 0,-6" fill={color} fillOpacity="0.3" stroke={color} strokeWidth="1.6" />
        {isSchottky ? (
          <path
            d="M -7 -3.5 L -7 -6 L 7 -6 L 7 -8.5"
            fill="none"
            stroke={color}
            strokeWidth="1.6"
          />
        ) : (
          <line x1="-7" y1="-6" x2="7" y2="-6" stroke={color} strokeWidth="1.8" />
        )}
      </g>
      {label && (
        <text x="11" y="-2" fill={color} fontSize="9.5" fontWeight="bold">
          {label}
        </text>
      )}
      {sublabel && (
        <text x="11" y="8" fill="#94a3b8" fontSize="8">
          {sublabel}
        </text>
      )}
    </g>
  );
};

interface InductorHProps {
  x: number;
  y: number;
  width?: number;
  label: string;
  sublabel?: string;
  color?: string;
  hasCore?: boolean;
}

export const InductorH: React.FC<InductorHProps> = ({
  x,
  y,
  label,
  sublabel,
  color = '#38bdf8',
  hasCore = true,
}) => (
  <g transform={`translate(${x}, ${y})`}>
    {/* 4 semicircular coil lobes totaling 48px */}
    <path
      d="M -24 0 a 6 6 0 0 1 12 0 a 6 6 0 0 1 12 0 a 6 6 0 0 1 12 0 a 6 6 0 0 1 12 0"
      fill="none"
      stroke={color}
      strokeWidth="2"
    />
    {hasCore && (
      <line x1="-22" y1="-9" x2="22" y2="-9" stroke={color} strokeWidth="1.2" strokeDasharray="4 2" />
    )}
    <circle cx="-21" cy="-4" r="1.8" fill={color} />
    <text x="0" y="-13" textAnchor="middle" fill={color} fontSize="9.5" fontWeight="bold">
      {label}
    </text>
    {sublabel && (
      <text x="0" y="13" textAnchor="middle" fill="#94a3b8" fontSize="8.5">
        {sublabel}
      </text>
    )}
  </g>
);

interface CapacitorVProps {
  x: number;
  y: number;
  label: string;
  sublabel?: string;
  color?: string;
}

export const CapacitorV: React.FC<CapacitorVProps> = ({
  x,
  y,
  label,
  sublabel,
  color = '#10b981',
}) => (
  <g transform={`translate(${x}, ${y})`}>
    <line x1="0" y1="-22" x2="0" y2="-3.5" stroke="currentColor" strokeWidth="1.7" />
    <line x1="-10" y1="-3.5" x2="10" y2="-3.5" stroke={color} strokeWidth="2.2" />
    <line x1="-10" y1="3.5" x2="10" y2="3.5" stroke={color} strokeWidth="2.2" />
    <line x1="0" y1="3.5" x2="0" y2="22" stroke="currentColor" strokeWidth="1.7" />
    <text x="13" y="-2" fill={color} fontSize="9.5" fontWeight="bold">
      {label}
    </text>
    {sublabel && (
      <text x="13" y="9" fill="#94a3b8" fontSize="8">
        {sublabel}
      </text>
    )}
  </g>
);

interface CapacitorHProps {
  x: number;
  y: number;
  label: string;
  sublabel?: string;
  color?: string;
}

export const CapacitorH: React.FC<CapacitorHProps> = ({
  x,
  y,
  label,
  sublabel,
  color = '#f59e0b',
}) => (
  <g transform={`translate(${x}, ${y})`}>
    <line x1="-16" y1="0" x2="-3.5" y2="0" stroke="currentColor" strokeWidth="1.7" />
    <line x1="-3.5" y1="-10" x2="-3.5" y2="10" stroke={color} strokeWidth="2.2" />
    <line x1="3.5" y1="-10" x2="3.5" y2="10" stroke={color} strokeWidth="2.2" />
    <line x1="3.5" y1="0" x2="16" y2="0" stroke="currentColor" strokeWidth="1.7" />
    <text x="0" y="-13" textAnchor="middle" fill={color} fontSize="9.5" fontWeight="bold">
      {label}
    </text>
    {sublabel && (
      <text x="0" y="19" textAnchor="middle" fill="#94a3b8" fontSize="8">
        {sublabel}
      </text>
    )}
  </g>
);

interface ResistorVProps {
  x: number;
  y: number;
  label: string;
  sublabel?: string;
  color?: string;
}

export const ResistorV: React.FC<ResistorVProps> = ({
  x,
  y,
  label,
  sublabel,
  color = '#cbd5e1',
}) => (
  <g transform={`translate(${x}, ${y})`}>
    <path
      d="M 0 -24 L 0 -15 L -6 -12 L 6 -6 L -6 0 L 6 6 L -6 12 L 0 15 L 0 24"
      fill="none"
      stroke={color}
      strokeWidth="1.7"
    />
    <text x="10" y="-2" fill={color} fontSize="9.5" fontWeight="bold">
      {label}
    </text>
    {sublabel && (
      <text x="10" y="9" fill="#94a3b8" fontSize="8">
        {sublabel}
      </text>
    )}
  </g>
);

export const GroundSymbol: React.FC<{ x: number; y: number }> = ({ x, y }) => (
  <g transform={`translate(${x}, ${y})`} stroke="currentColor" strokeWidth="1.6">
    <line x1="0" y1="0" x2="0" y2="7" />
    <line x1="-10" y1="7" x2="10" y2="7" />
    <line x1="-6" y1="11" x2="6" y2="11" />
    <line x1="-2.5" y1="15" x2="2.5" y2="15" />
  </g>
);

// Helper to export SVG or 2x PNG
function useSchematicExport(svgRef: React.RefObject<SVGSVGElement | null>, baseName: string) {
  const exportSvg = () => {
    if (!svgRef.current) return;
    const serializer = new XMLSerializer();
    let source = serializer.serializeToString(svgRef.current);
    if (!source.match(/^<svg[^>]+xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)) {
      source = source.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
    }
    const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${baseName}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPng = () => {
    if (!svgRef.current) return;
    const serializer = new XMLSerializer();
    const source = serializer.serializeToString(svgRef.current);
    const svgBlob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 2160;
      canvas.height = 1040;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#0B0E17';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const pngUrl = canvas.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = pngUrl;
        a.download = `${baseName}_2x.png`;
        a.click();
      }
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  return { exportSvg, exportPng };
}

// ============================================================================
// 1. DC-DC CONVERTER DYNAMIC CIRCUIT SCHEMATIC (PSFB & LLC + ALL VARIANTS)
// ============================================================================
export const DcDcSchematicView: React.FC<{ res: DcDcResults }> = ({ res }) => {
  const { state } = res;
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [zoom, setZoom] = useState<number>(100);
  const { exportSvg, exportPng } = useSchematicExport(
    svgRef,
    `${state.topology}_${state.txType}_${state.rectMode}_${state.controlType}`
  );

  const isLLC = res.isLLC;
  const isHB = state.topology === 'llc-hb';
  const is2Ph = state.topology === 'psfb-2ph';
  const isCT = state.txType === 'center-tapped';
  const isCDR = state.txType === 'current-doubler';
  const isSync = state.rectMode === 'sync-fet';
  const lagColor = res.zvsAchieved ? '#10b981' : '#f59e0b';

  return (
    <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
      {/* Compact Header Bar */}
      <div className="px-3.5 py-2.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 bg-slate-50/70 dark:bg-slate-900/50">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[13px] font-medium text-slate-900 dark:text-[#eef0f5]">
            Live CAD Circuit Diagram
          </span>
          <span className="text-xs font-mono text-slate-600 dark:text-slate-300">
            {state.topology.toUpperCase()} · {state.txType.toUpperCase()} ·{' '}
            {isSync ? 'SYNC MOSFET SR' : 'SCHOTTKY DIODE'} · {state.clampVariant.toUpperCase()} ·{' '}
            {state.controlType.toUpperCase()}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setZoom(100)}
            className="px-2 py-1 text-[11px] font-mono bg-slate-200/80 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded hover:bg-slate-300 dark:hover:bg-slate-700 inline-flex items-center gap-1 whitespace-nowrap shrink-0"
          >
            <Maximize2 className="w-3 h-3" /> Fit
          </button>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(75, z - 15))}
            className="p-1 text-xs font-mono bg-slate-200/80 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="text-[11px] font-mono tabular-nums text-slate-600 dark:text-slate-300 px-1">
            {zoom}%
          </span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(145, z + 15))}
            className="p-1 text-xs font-mono bg-slate-200/80 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={exportSvg}
            className="px-2 py-1 text-[11px] font-mono bg-cyan-600 text-white rounded hover:bg-cyan-500 inline-flex items-center gap-1 whitespace-nowrap shrink-0"
          >
            <Download className="w-3 h-3" /> SVG
          </button>
          <button
            type="button"
            onClick={exportPng}
            className="px-2 py-1 text-[11px] font-mono bg-slate-700 text-white rounded hover:bg-slate-600 inline-flex items-center gap-1 whitespace-nowrap shrink-0"
          >
            <ImageIcon className="w-3 h-3" /> PNG 2x
          </button>
          <button
            type="button"
            onClick={() => {
              const asc = generateDcDcLtspiceAsc(state, res);
              const blob = new Blob([asc], { type: 'text/plain;charset=utf-8' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `voltcraft_${state.topology}.asc`;
              a.click();
              URL.revokeObjectURL(url);
            }}
            className="px-2 py-1 text-[11px] font-mono bg-emerald-600 text-white rounded hover:bg-emerald-500 inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
            title="Download grid-aligned LTspice .asc schematic diagram"
          >
            <Download className="w-3 h-3" /> LTspice .asc
          </button>
        </div>
      </div>

      {/* Interactive SVG Canvas */}
      <div className="p-3 bg-slate-950 text-slate-200 overflow-x-auto">
        <div style={{ width: `${zoom}%`, minWidth: '860px' }} className="mx-auto transition-[width] duration-150">
          <svg
            ref={svgRef}
            viewBox="0 0 1120 510"
            className="w-full h-auto font-mono select-none text-slate-300"
          >
            <defs>
              <pattern id="dcdc-cad-grid" width="20" height="20" patternUnits="userSpaceOnUse">
                <path
                  d="M 20 0 L 0 0 0 20"
                  fill="none"
                  stroke="#1e293b"
                  strokeWidth="0.7"
                />
              </pattern>
            </defs>

            <rect width="1120" height="510" fill="#090D16" rx="6" />
            <rect width="1120" height="510" fill="url(#dcdc-cad-grid)" rx="6" />

            {/* Stage Headers */}
            <text x="55" y="24" fill="#64748b" fontSize="9.5" fontWeight="bold">
              DC INPUT BUS
            </text>
            <text x="165" y="24" fill="#06b6d4" fontSize="9.5" fontWeight="bold">
              {isHB
                ? 'HALF-BRIDGE (Q1–Q2)'
                : is2Ph
                ? '2-PHASE INTERLEAVED H-BRIDGES (0° & 90°)'
                : 'PRIMARY FULL-BRIDGE (Q1–Q4)'}
            </text>
            <text x="365" y="24" fill="#38bdf8" fontSize="9.5" fontWeight="bold">
              {isLLC ? 'RESONANT TANK (Cr, Lr, Lm)' : `ZVS TANK & CLAMP (${state.clampVariant.toUpperCase()})`}
            </text>
            <text x="545" y="24" fill="#a855f7" fontSize="9.5" fontWeight="bold">
              HF TRANSFORMER ({res.core.name})
            </text>
            <text x="690" y="24" fill="#10b981" fontSize="9.5" fontWeight="bold">
              {isCT ? 'CENTER-TAPPED' : isCDR ? 'CURRENT-DOUBLER' : 'FULL-BRIDGE'}{' '}
              {isSync ? 'SYNC FETs' : 'DIODES'}
            </text>
            <text x="895" y="24" fill="#f59e0b" fontSize="9.5" fontWeight="bold">
              OUTPUT FILTER & LOAD
            </text>

            {/* ============================================================== */}
            {/* 1. DC INPUT SOURCE & INPUT CAPACITOR                           */}
            {/* ============================================================== */}
            <g stroke="currentColor" strokeWidth="1.7">
              <line x1="50" y1="60" x2="290" y2="60" />
              <line x1="50" y1="310" x2="290" y2="310" />
              <line x1="50" y1="60" x2="50" y2="162" />
              <line x1="50" y1="206" x2="50" y2="310" />
              <circle cx="50" cy="184" r="22" fill="#0f172a" stroke="#06b6d4" strokeWidth="2" />
              <text x="50" y="181" textAnchor="middle" stroke="none" fill="#06b6d4" fontSize="10" fontWeight="bold">
                Vin
              </text>
              <text x="50" y="193" textAnchor="middle" stroke="none" fill="#e2e8f0" fontSize="9.5">
                {state.Vin_nom_V}V
              </text>
              <text x="50" y="48" textAnchor="middle" stroke="none" fill="#94a3b8" fontSize="8.5">
                [{state.Vin_min_V}–{state.Vin_max_V}V]
              </text>
            </g>

            {/* Input Decoupling Cap Cin */}
            <line x1="105" y1="60" x2="105" y2="163" stroke="currentColor" strokeWidth="1.6" />
            <CapacitorV x={105} y={185} label="Cin" sublabel="DC Bus" color="#06b6d4" />
            <line x1="105" y1="207" x2="105" y2="310" stroke="currentColor" strokeWidth="1.6" />
            <circle cx="105" cy="60" r="3" fill="#06b6d4" />
            <circle cx="105" cy="310" r="3" fill="#06b6d4" />
            <GroundSymbol x={105} y={310} />

            {/* ============================================================== */}
            {/* 2. PRIMARY BRIDGE (FULL-BRIDGE Q1..Q4 OR HALF-BRIDGE Q1..Q2)   */}
            {/* ============================================================== */}
            {/* Leading Leg Q1 & Q2 */}
            <line x1="175" y1="60" x2="175" y2="93" stroke="currentColor" strokeWidth="1.7" />
            <MosfetSymbol
              x={175}
              y={115}
              label="Q1"
              sublabel={`${res.priDevice.Rds_on_25C_mOhm}mΩ`}
              color="#06b6d4"
            />
            <line x1="175" y1="137" x2="175" y2="233" stroke="currentColor" strokeWidth="1.7" />
            <MosfetSymbol
              x={175}
              y={255}
              label="Q2"
              sublabel={isLLC ? `dt=${state.deadTime_ns}ns` : 'Lead Leg'}
              color="#06b6d4"
            />
            <line x1="175" y1="277" x2="175" y2="310" stroke="currentColor" strokeWidth="1.7" />
            <circle cx="175" cy="60" r="3" fill="#06b6d4" />
            <circle cx="175" cy="310" r="3" fill="#06b6d4" />
            {/* Switch Node A */}
            <circle cx="175" cy="172" r="3.5" fill="#38bdf8" />
            <text x="166" y="167" textAnchor="end" fill="#38bdf8" fontSize="9" fontWeight="bold">
              vA
            </text>

            {!isHB ? (
              <>
                {/* Lagging Leg Q3 & Q4 */}
                <line x1="275" y1="60" x2="275" y2="93" stroke="currentColor" strokeWidth="1.7" />
                <MosfetSymbol
                  x={275}
                  y={115}
                  label="Q3"
                  sublabel={res.zvsAchieved ? 'ZVS OK' : 'Hard Sw'}
                  color={lagColor}
                />
                <line x1="275" y1="137" x2="275" y2="233" stroke="currentColor" strokeWidth="1.7" />
                <MosfetSymbol
                  x={275}
                  y={255}
                  label="Q4"
                  sublabel={`φ=${res.phaseShift_deg.toFixed(0)}°`}
                  color={lagColor}
                />
                <line x1="275" y1="277" x2="275" y2="310" stroke="currentColor" strokeWidth="1.7" />
                <circle cx="275" cy="60" r="3" fill="#06b6d4" />
                <circle cx="275" cy="310" r="3" fill="#06b6d4" />
                {/* Switch Node B */}
                <circle cx="275" cy="212" r="3.5" fill={lagColor} />
                <text x="266" y="224" textAnchor="end" fill={lagColor} fontSize="9" fontWeight="bold">
                  vB
                </text>
                <line x1="275" y1="212" x2="555" y2="212" stroke={lagColor} strokeWidth="1.8" />
              </>
            ) : (
              <>
                {/* LLC Half-Bridge Split Capacitor Leg */}
                <line x1="275" y1="60" x2="275" y2="100" stroke="currentColor" strokeWidth="1.6" />
                <CapacitorV x={275} y={122} label="Cb1" sublabel="Vin/2" color="#f59e0b" />
                <line x1="275" y1="144" x2="275" y2="230" stroke="currentColor" strokeWidth="1.6" />
                <CapacitorV x={275} y={252} label="Cb2" sublabel="Vin/2" color="#f59e0b" />
                <line x1="275" y1="274" x2="275" y2="310" stroke="currentColor" strokeWidth="1.6" />
                <circle cx="275" cy="212" r="3.5" fill="#f59e0b" />
                <line x1="275" y1="212" x2="555" y2="212" stroke="#f59e0b" strokeWidth="1.8" />
              </>
            )}

            {/* 2-Phase Interleaved Slave Module Overlay Badge */}
            {is2Ph && (
              <g>
                <rect
                  x="150"
                  y="322"
                  width="210"
                  height="38"
                  rx="4"
                  fill="#0f172a"
                  stroke="#06b6d4"
                  strokeWidth="1.3"
                  strokeDasharray="4 2"
                />
                <text x="255" y="337" textAnchor="middle" fill="#06b6d4" fontSize="9.5" fontWeight="bold">
                  + PHASE 2 SLAVE H-BRIDGE (90° SHIFT)
                </text>
                <text x="255" y="351" textAnchor="middle" fill="#94a3b8" fontSize="8.5">
                  Q5–Q8 + Tx2 + SR_Ph2 → Parallel Vout (K={Math.round(res.rippleCancel_K * 100)}%)
                </text>
              </g>
            )}

            {/* ============================================================== */}
            {/* 3. SERIES RESONANT / LEAKAGE TANK & PRIMARY CLAMPING DIODES    */}
            {/* ============================================================== */}
            {isLLC ? (
              <>
                {/* LLC Series Resonant Capacitor Cr + Resonant Inductor Lr */}
                <line x1="175" y1="172" x2="359" y2="172" stroke="#38bdf8" strokeWidth="1.8" />
                <CapacitorH
                  x={375}
                  y={172}
                  label={`Cr=${state.Cr_nF}nF`}
                  sublabel={`fr=${res.fr_kHz.toFixed(0)}kHz`}
                  color="#f59e0b"
                />
                <line x1="391" y1="172" x2="421" y2="172" stroke="#38bdf8" strokeWidth="1.8" />
                <InductorH
                  x={445}
                  y={172}
                  label={`Lr=${state.Llk_uH}µH`}
                  sublabel={`Q=${res.Q_factor.toFixed(2)}`}
                  color="#38bdf8"
                />
                <line x1="469" y1="172" x2="555" y2="172" stroke="#38bdf8" strokeWidth="1.8" />
              </>
            ) : (
              <>
                {/* PSFB Series L_lk + Optional Primary Clamping Diodes Dc1 / Dc2 */}
                <line x1="175" y1="172" x2="386" y2="172" stroke="#38bdf8" strokeWidth="1.8" />
                <InductorH
                  x={410}
                  y={172}
                  label={`Llk=${state.Llk_uH}µH`}
                  sublabel={`ΔD=${(res.Dloss_nom * 100).toFixed(1)}%`}
                  color="#38bdf8"
                />
                <line x1="434" y1="172" x2="555" y2="172" stroke="#38bdf8" strokeWidth="1.8" />

                {state.clampVariant === 'pri-diode-clamp' && (
                  <g>
                    {/* Connect top/bottom rails to clamping diodes Dc1 & Dc2 at x=478 */}
                    <line x1="275" y1="60" x2="478" y2="60" stroke="currentColor" strokeWidth="1.5" />
                    <line x1="275" y1="310" x2="478" y2="310" stroke="currentColor" strokeWidth="1.5" />
                    <line x1="478" y1="60" x2="478" y2="96" stroke="currentColor" strokeWidth="1.5" />
                    <DiodeSymbol x={478} y={114} dir="up" label="Dc1" sublabel="Clamp" color="#f59e0b" />
                    <line x1="478" y1="132" x2="478" y2="232" stroke="currentColor" strokeWidth="1.5" />
                    <DiodeSymbol x={478} y={250} dir="up" label="Dc2" sublabel="Clamp" color="#f59e0b" />
                    <line x1="478" y1="268" x2="478" y2="310" stroke="currentColor" strokeWidth="1.5" />
                    <circle cx="478" cy="172" r="3.5" fill="#f59e0b" />
                  </g>
                )}
              </>
            )}

            {/* Shunt Magnetizing Inductance Lm across Transformer Primary */}
            <line x1="522" y1="172" x2="522" y2="180" stroke="#a855f7" strokeWidth="1.4" />
            <path
              d="M 522 180 a 4 4 0 0 1 0 8 a 4 4 0 0 1 0 8 a 4 4 0 0 1 0 8 a 4 4 0 0 1 0 8"
              fill="none"
              stroke="#a855f7"
              strokeWidth="1.5"
            />
            <line x1="522" y1="212" x2="522" y2="212" stroke="#a855f7" strokeWidth="1.4" />
            <circle cx="522" cy="172" r="2.5" fill="#a855f7" />
            <circle cx="522" cy="212" r="2.5" fill="#a855f7" />
            <text x="515" y="198" textAnchor="end" fill="#c084fc" fontSize="8.5">
              Lm={state.Lm_uH}µH
            </text>

            {/* ============================================================== */}
            {/* 4. HIGH-FREQUENCY ISOLATION TRANSFORMER (CT vs NON-CT)         */}
            {/* ============================================================== */}
            <g>
              {/* Primary Winding Vertical Coil at x=555 (y=152..232) */}
              <line x1="555" y1="172" x2="555" y2="152" stroke="#38bdf8" strokeWidth="1.8" />
              <path
                d="M 555 152 a 7 7 0 0 1 0 14 a 7 7 0 0 1 0 14 a 7 7 0 0 1 0 14 a 7 7 0 0 1 0 14"
                fill="none"
                stroke="#a855f7"
                strokeWidth="2.2"
              />
              <line x1="555" y1="208" x2="555" y2="212" stroke="#10b981" strokeWidth="1.8" />
              <circle cx="548" cy="156" r="2.2" fill="#e2e8f0" />

              {/* Dual Ferrite Core Lines */}
              <line x1="569" y1="138" x2="569" y2="246" stroke="#c084fc" strokeWidth="2" />
              <line x1="574" y1="138" x2="574" y2="246" stroke="#c084fc" strokeWidth="2" />

              {/* Secondary Winding(s) at x=588 */}
              {isCT ? (
                <>
                  {/* Upper Secondary Winding Ns1 (y=136..184) */}
                  <path
                    d="M 588 136 a 6 6 0 0 0 0 12 a 6 6 0 0 0 0 12 a 6 6 0 0 0 0 12 a 6 6 0 0 0 0 12"
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="2.2"
                  />
                  <circle cx="595" cy="141" r="2.2" fill="#e2e8f0" />
                  {/* Lower Secondary Winding Ns2 (y=196..244) */}
                  <path
                    d="M 588 196 a 6 6 0 0 0 0 12 a 6 6 0 0 0 0 12 a 6 6 0 0 0 0 12 a 6 6 0 0 0 0 12"
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="2.2"
                  />
                  <circle cx="595" cy="201" r="2.2" fill="#e2e8f0" />
                  {/* Center-Tap Junction joining y=184 and y=196 at y=190 */}
                  <line x1="588" y1="184" x2="588" y2="196" stroke="#10b981" strokeWidth="2.2" />
                  <circle cx="588" cy="190" r="3.2" fill="#f59e0b" />
                  <text x="596" y="187" fill="#f59e0b" fontSize="8.5" fontWeight="bold">
                    CT
                  </text>
                </>
              ) : (
                <>
                  {/* Single Non-Center-Tapped Secondary Winding Ns (y=148..228) */}
                  <path
                    d="M 588 148 a 8 8 0 0 0 0 16 a 8 8 0 0 0 0 16 a 8 8 0 0 0 0 16 a 8 8 0 0 0 0 16"
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="2.2"
                  />
                  <circle cx="596" cy="154" r="2.2" fill="#e2e8f0" />
                </>
              )}

              {/* Transformer Specs Callout */}
              <text x="571" y="122" textAnchor="middle" fill="#e2e8f0" fontSize="9.5" fontWeight="bold">
                Np:{res.Np_actual} / Ns:{res.Ns_actual}
              </text>
              <text x="571" y="264" textAnchor="middle" fill="#c084fc" fontSize="9">
                n={state.turnsRatio_n}:1 · Bpk={res.Bpk_mT.toFixed(0)}mT
              </text>
              <text x="571" y="276" textAnchor="middle" fill="#94a3b8" fontSize="8.5">
                {state.materialId} · Tcore={res.Tcore_C.toFixed(0)}°C
              </text>
            </g>

            {/* ============================================================== */}
            {/* 5. SECONDARY RECTIFIER STAGE & CLAMP/SNUBBER                   */}
            {/* ============================================================== */}
            {isCT && (
              <g>
                {/* Top secondary end (y=136) -> x=695; Bottom secondary end (y=244) -> x=760 */}
                <line x1="588" y1="136" x2="695" y2="136" stroke="#10b981" strokeWidth="1.8" />
                <line x1="588" y1="244" x2="760" y2="244" stroke="#10b981" strokeWidth="1.8" />

                {/* Center-Tap wire (y=190) goes straight to Output Inductor Lo at x=855, y=105 */}
                <line x1="588" y1="190" x2="640" y2="190" stroke="#f59e0b" strokeWidth="2" />
                <line x1="640" y1="190" x2="640" y2="105" stroke="#f59e0b" strokeWidth="2" />
                <line x1="640" y1="105" x2="856" y2="105" stroke="#f59e0b" strokeWidth="2" />

                {/* SR1 / D1 connected from top secondary wire (x=695, y=136) down to Ground Return (y=310) */}
                <line x1="695" y1="136" x2="695" y2="238" stroke="currentColor" strokeWidth="1.7" />
                {isSync ? (
                  <MosfetSymbol
                    x={695}
                    y={260}
                    label="SR1"
                    sublabel={`${res.secDevice.Rds_on_25C_mOhm}mΩ`}
                    color="#10b981"
                  />
                ) : (
                  <DiodeSymbol
                    x={695}
                    y={260}
                    dir="up"
                    isSchottky
                    label="D1"
                    sublabel={`Vf=${res.Vf_rect_drop_V.toFixed(2)}V`}
                    color="#10b981"
                  />
                )}
                <line x1="695" y1="282" x2="695" y2="310" stroke="currentColor" strokeWidth="1.7" />

                {/* SR2 / D2 connected from bottom secondary wire (x=760, y=244) down to Ground Return (y=310) */}
                <line x1="760" y1="244" x2="760" y2="248" stroke="currentColor" strokeWidth="1.7" />
                {isSync ? (
                  <MosfetSymbol
                    x={760}
                    y={265}
                    label="SR2"
                    sublabel={`Vpk=${res.Vsec_overshoot_V.toFixed(0)}V`}
                    color="#10b981"
                  />
                ) : (
                  <DiodeSymbol
                    x={760}
                    y={265}
                    dir="up"
                    isSchottky
                    label="D2"
                    sublabel={`Vpk=${res.Vsec_overshoot_V.toFixed(0)}V`}
                    color="#10b981"
                  />
                )}
                <line x1="760" y1="287" x2="760" y2="310" stroke="currentColor" strokeWidth="1.7" />

                <line x1="670" y1="310" x2="1055" y2="310" stroke="currentColor" strokeWidth="1.8" />
                <circle cx="695" cy="310" r="3" fill="#10b981" />
                <circle cx="760" cy="310" r="3" fill="#10b981" />
              </g>
            )}

            {state.txType === 'full-bridge' && (
              <g>
                {/* 2-wire secondary (y=148 and y=212) feeding Full-Bridge Rectifier legs at x=685 and x=755 */}
                <line x1="588" y1="148" x2="685" y2="148" stroke="#10b981" strokeWidth="1.8" />
                <line x1="588" y1="212" x2="755" y2="212" stroke="#10b981" strokeWidth="1.8" />
                <circle cx="685" cy="148" r="3" fill="#10b981" />
                <circle cx="755" cy="212" r="3" fill="#10b981" />

                {/* Top rectifier bus at y=85 -> feeds Lo at x=856 */}
                <line x1="685" y1="85" x2="856" y2="85" stroke="#f59e0b" strokeWidth="2" />
                <line x1="856" y1="85" x2="856" y2="105" stroke="#f59e0b" strokeWidth="2" />
                {/* Bottom rectifier bus at y=310 */}
                <line x1="685" y1="310" x2="1055" y2="310" stroke="currentColor" strokeWidth="1.8" />

                {/* Leg 1: SR1/D1 (top) & SR2/D2 (bottom) at x=685 */}
                <line x1="685" y1="85" x2="685" y2="100" stroke="currentColor" strokeWidth="1.6" />
                {isSync ? (
                  <MosfetSymbol x={685} y={118} label="SR1" color="#10b981" scale={0.85} />
                ) : (
                  <DiodeSymbol x={685} y={118} dir="up" isSchottky label="D1" color="#10b981" />
                )}
                <line x1="685" y1="136" x2="685" y2="238" stroke="currentColor" strokeWidth="1.6" />
                {isSync ? (
                  <MosfetSymbol x={685} y={260} label="SR2" color="#10b981" scale={0.85} />
                ) : (
                  <DiodeSymbol x={685} y={260} dir="up" isSchottky label="D2" color="#10b981" />
                )}
                <line x1="685" y1="278" x2="685" y2="310" stroke="currentColor" strokeWidth="1.6" />

                {/* Leg 2: SR3/D3 (top) & SR4/D4 (bottom) at x=755 */}
                <line x1="755" y1="85" x2="755" y2="100" stroke="currentColor" strokeWidth="1.6" />
                {isSync ? (
                  <MosfetSymbol x={755} y={118} label="SR3" color="#10b981" scale={0.85} />
                ) : (
                  <DiodeSymbol x={755} y={118} dir="up" isSchottky label="D3" color="#10b981" />
                )}
                <line x1="755" y1="136" x2="755" y2="238" stroke="currentColor" strokeWidth="1.6" />
                {isSync ? (
                  <MosfetSymbol
                    x={755}
                    y={260}
                    label="SR4"
                    sublabel={`${res.Vsec_overshoot_V.toFixed(0)}V`}
                    color="#10b981"
                    scale={0.85}
                  />
                ) : (
                  <DiodeSymbol
                    x={755}
                    y={260}
                    dir="up"
                    isSchottky
                    label="D4"
                    sublabel={`${res.Vsec_overshoot_V.toFixed(0)}V`}
                    color="#10b981"
                  />
                )}
                <line x1="755" y1="278" x2="755" y2="310" stroke="currentColor" strokeWidth="1.6" />
              </g>
            )}

            {isCDR && (
              <g>
                {/* Current-Doubler Rectifier: 2 Secondary Inductors Lo1 & Lo2 + 2 Bottom Rectifiers SR1 & SR2 */}
                <line x1="588" y1="148" x2="685" y2="148" stroke="#10b981" strokeWidth="1.8" />
                <line x1="588" y1="212" x2="755" y2="212" stroke="#10b981" strokeWidth="1.8" />
                <circle cx="685" cy="148" r="3" fill="#10b981" />
                <circle cx="755" cy="212" r="3" fill="#10b981" />

                {/* Bottom Rectifiers SR1/D1 at x=685 and SR2/D2 at x=755 */}
                <line x1="685" y1="148" x2="685" y2="238" stroke="currentColor" strokeWidth="1.6" />
                {isSync ? (
                  <MosfetSymbol x={685} y={260} label="SR1" sublabel="CDR1" color="#10b981" />
                ) : (
                  <DiodeSymbol x={685} y={260} dir="up" isSchottky label="D1" sublabel="CDR1" color="#10b981" />
                )}
                <line x1="685" y1="282" x2="685" y2="310" stroke="currentColor" strokeWidth="1.6" />

                <line x1="755" y1="212" x2="755" y2="238" stroke="currentColor" strokeWidth="1.6" />
                {isSync ? (
                  <MosfetSymbol x={755} y={260} label="SR2" sublabel="CDR2" color="#10b981" />
                ) : (
                  <DiodeSymbol x={755} y={260} dir="up" isSchottky label="D2" sublabel="CDR2" color="#10b981" />
                )}
                <line x1="755" y1="282" x2="755" y2="310" stroke="currentColor" strokeWidth="1.6" />

                {/* Dual Current-Doubler Inductors Lo1 & Lo2 feeding Output Bus */}
                <line x1="685" y1="148" x2="685" y2="85" stroke="#38bdf8" strokeWidth="1.7" />
                <line x1="685" y1="85" x2="786" y2="85" stroke="#38bdf8" strokeWidth="1.7" />
                <InductorH x={810} y={85} label={`Lo1=${state.Lo_uH}µH`} color="#38bdf8" />
                <line x1="834" y1="85" x2="905" y2="85" stroke="#f59e0b" strokeWidth="1.8" />
                <line x1="905" y1="85" x2="905" y2="105" stroke="#f59e0b" strokeWidth="1.8" />

                <line x1="755" y1="212" x2="755" y2="135" stroke="#38bdf8" strokeWidth="1.7" />
                <line x1="755" y1="135" x2="786" y2="135" stroke="#38bdf8" strokeWidth="1.7" />
                <InductorH x={810} y={135} label={`Lo2=${state.Lo_uH}µH`} color="#38bdf8" />
                <line x1="834" y1="135" x2="905" y2="135" stroke="#f59e0b" strokeWidth="1.8" />
                <line x1="905" y1="135" x2="905" y2="105" stroke="#f59e0b" strokeWidth="1.8" />

                <line x1="670" y1="310" x2="1055" y2="310" stroke="currentColor" strokeWidth="1.8" />
              </g>
            )}

            {/* Secondary Active Clamp or RC Snubber Symbol */}
            {state.clampVariant === 'active-clamp' && !isLLC && (
              <g>
                <rect
                  x="660"
                  y="38"
                  width="135"
                  height="34"
                  rx="4"
                  fill="#0f172a"
                  stroke="#38bdf8"
                  strokeWidth="1.3"
                />
                <text x="727" y="52" textAnchor="middle" fill="#38bdf8" fontSize="8.5" fontWeight="bold">
                  ACTIVE CLAMP (Qcl + Ccl)
                </text>
                <text x="727" y="64" textAnchor="middle" fill="#e2e8f0" fontSize="8">
                  Cclamp={res.Cclamp_nF.toFixed(0)}nF · Vpk={res.Vsec_overshoot_V.toFixed(0)}V
                </text>
              </g>
            )}
            {state.clampVariant === 'rc-snubber' && (
              <g>
                <rect
                  x="660"
                  y="38"
                  width="135"
                  height="34"
                  rx="4"
                  fill="#0f172a"
                  stroke="#f59e0b"
                  strokeWidth="1.3"
                />
                <text x="727" y="52" textAnchor="middle" fill="#f59e0b" fontSize="8.5" fontWeight="bold">
                  RC SNUBBER NETWORK
                </text>
                <text x="727" y="64" textAnchor="middle" fill="#e2e8f0" fontSize="8">
                  R={res.Rsnub_Ohm.toFixed(1)}Ω + C={res.Csnub_pF.toFixed(0)}pF ({res.Psnub_W.toFixed(1)}W)
                </text>
              </g>
            )}

            {/* ============================================================== */}
            {/* 6. OUTPUT FILTER INDUCTOR Lo, CAPACITOR Co & LOAD R_load       */}
            {/* ============================================================== */}
            {!isCDR && (
              <>
                {isLLC ? (
                  <line x1="856" y1="105" x2="905" y2="105" stroke="#f59e0b" strokeWidth="2" />
                ) : (
                  <>
                    <InductorH
                      x={880}
                      y={105}
                      label={`Lo=${state.Lo_uH}µH`}
                      sublabel={`ΔIL=${res.deltaIout_net_A.toFixed(1)}A`}
                      color="#f59e0b"
                    />
                  </>
                )}
              </>
            )}

            <line x1="904" y1="105" x2="1055" y2="105" stroke="#f59e0b" strokeWidth="2" />

            {/* Output Filter Capacitor Co */}
            <line x1="955" y1="105" x2="955" y2="180" stroke="currentColor" strokeWidth="1.7" />
            <CapacitorV
              x={955}
              y={202}
              label={`Co=${state.Co_uF}µF`}
              sublabel={`ESR=${state.ESR_Co_mOhm}mΩ`}
              color="#10b981"
            />
            <line x1="955" y1="224" x2="955" y2="310" stroke="currentColor" strokeWidth="1.7" />
            <circle cx="955" cy="105" r="3" fill="#f59e0b" />
            <circle cx="955" cy="310" r="3" fill="#10b981" />
            <GroundSymbol x={955} y={310} />

            {/* Load Resistor R_load */}
            <line x1="1035" y1="105" x2="1035" y2="178" stroke="currentColor" strokeWidth="1.7" />
            <ResistorV
              x={1035}
              y={202}
              label={`Vout=${state.Vout_V}V`}
              sublabel={`Iout=${res.Iout_total_A.toFixed(1)}A (${(state.Pout_W / 1e3).toFixed(2)}kW)`}
              color="#f59e0b"
            />
            <line x1="1035" y1="226" x2="1035" y2="310" stroke="currentColor" strokeWidth="1.7" />
            <circle cx="1035" cy="105" r="3.5" fill="#f59e0b" />
            <circle cx="1035" cy="310" r="3" fill="#10b981" />

            {/* ============================================================== */}
            {/* 7. CLOSED-LOOP CONTROL & MODULATION HARDWARE OVERLAY           */}
            {/* ============================================================== */}
            {/* Feedback sense dashed paths from Vout and Current / Charge sensor */}
            <path
              d="M 1035 105 L 1085 105 L 1085 435 L 785 435"
              fill="none"
              stroke="#10b981"
              strokeWidth="1.3"
              strokeDasharray="4 3"
            />
            <text x="980" y="428" fill="#10b981" fontSize="8.5">
              Vout Sense ({state.Vout_V}V)
            </text>

            {/* Primary Current / Charge Sense Node */}
            <circle cx="342" cy="172" r="7" fill="none" stroke="#38bdf8" strokeWidth="1.5" />
            <path
              d="M 342 179 L 342 435 L 430 435"
              fill="none"
              stroke="#38bdf8"
              strokeWidth="1.3"
              strokeDasharray="4 3"
            />
            <text x="348" y="395" fill="#38bdf8" fontSize="8.5">
              {state.controlType === 'charge-control'
                ? `∫i_r dt (Vth=${res.Vth_charge_V.toFixed(1)}V)`
                : `I_sense (Rs=${state.Rsense_mOhm}mΩ)`}
            </text>

            {/* Gate Drive Output Path back to Primary & SR Switches */}
            <path
              d="M 430 415 L 225 415 L 225 318"
              fill="none"
              stroke="#06b6d4"
              strokeWidth="1.3"
              strokeDasharray="4 3"
            />
            <text x="235" y="407" fill="#06b6d4" fontSize="8.5">
              {isLLC
                ? `PFM Gate Drive (fsw=${state.fsw_kHz}kHz)`
                : `Phase-Shift PWM φ=${res.phaseShift_deg.toFixed(1)}° (Deff=${res.Deff_nom.toFixed(3)})`}
            </text>

            {/* Controller Hardware Block */}
            <rect
              x="430"
              y="382"
              width="355"
              height="95"
              rx="6"
              fill="#0f172a"
              stroke="#06b6d4"
              strokeWidth="1.8"
            />
            <text x="607" y="401" textAnchor="middle" fill="#06b6d4" fontSize="10.5" fontWeight="bold">
              CONTROL SYNTHESIS: {state.controlType.toUpperCase()} @ fs={state.fs_digital_kHz} kHz
            </text>
            <text x="607" y="418" textAnchor="middle" fill="#e2e8f0" fontSize="9">
              fc = {res.fc_actual_kHz.toFixed(2)} kHz · PM = {res.pm_actual_deg.toFixed(1)}° · GM ={' '}
              {res.gm_actual_dB.toFixed(1)} dB · Rd,lk = {res.Rd_damping_Ohm.toFixed(2)} Ω
            </text>
            <text x="607" y="435" textAnchor="middle" fill="#38bdf8" fontSize="9">
              {state.controlType === 'pcmc'
                ? `PCMC+Type-II (${res.type2Architecture === 'ota' ? `OTA gm=${res.ota_gm_mS.toFixed(1)}mS` : 'Op-Amp'}): Se=${res.Se_ramp_V_us.toFixed(2)}V/µs · mc=${res.mc_slope.toFixed(2)} · Qp=${res.Qp_subharmonic.toFixed(2)}`
                : state.controlType === 'charge-control'
                ? `Resonant Charge Q_Cr=${res.Q_charge_nC.toFixed(0)} nC | Vth=${res.Vth_charge_V.toFixed(2)} V | fz1=${res.fz1_kHz.toFixed(2)} kHz`
                : `Kp=${res.Kp_ctrl.toFixed(3)} · Ki=${res.Ki_ctrl.toFixed(0)} rad/s · fz1=${res.fz1_kHz.toFixed(2)} kHz · fp1=${res.fp1_kHz.toFixed(1)} kHz`}
            </text>
            <text x="607" y="452" textAnchor="middle" fill="#10b981" fontSize="8.5">
              {!res.isTwoZeroComp && res.type2Architecture === 'ota'
                ? `OTA Type-II: R1=${res.R1_ota_kOhm.toFixed(1)}k R2=${res.R2_ota_kOhm.toFixed(1)}k C1=${res.C1_ota_e24_nF}nF C2=${res.C2_ota_e24_pF}pF | b0=${res.b0.toFixed(3)}`
                : `2P2Z: b0=${res.b0.toFixed(4)}, b1=${res.b1.toFixed(4)}, b2=${res.b2.toFixed(4)} | a1=${res.a1.toFixed(4)}, a2=${res.a2.toFixed(4)}`}
            </text>
            <text x="607" y="468" textAnchor="middle" fill="#f59e0b" fontSize="8.5">
              η = {res.efficiency_pct.toFixed(2)}% | Ploss = {res.Ptotal_loss_W.toFixed(1)} W | ΔVout ={' '}
              {res.Vout_ripple_mVpp.toFixed(1)} mVpp ({res.fRipple_out_kHz.toFixed(0)} kHz)
            </text>
          </svg>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// 2. AC-DC PFC DYNAMIC CIRCUIT SCHEMATIC & CONNECTION POINT VISUALIZER
// ============================================================================
interface AcDcConnectionNode {
  id: string;
  code: string;
  name: string;
  stage: 'input-filter' | 'pfc-core' | 'bus-cap';
  x: number;
  y: number;
  color: string;
  pins: string[];
  telemetry: string;
  layoutRule: string;
}

export const AcDcSchematicView: React.FC<{
  res: AcDcResults;
  onTopologyChange?: (topo: AcDcTopologyType) => void;
}> = ({ res, onTopologyChange }) => {
  const { state } = res;
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [zoom, setZoom] = useState<number>(100);
  const [selectedNodeId, setSelectedNodeId] = useState<string>('N3');
  const [showPinBadges, setShowPinBadges] = useState<boolean>(true);
  const [halfCycleMode, setHalfCycleMode] = useState<'both' | 'pos' | 'neg'>('both');

  const { exportSvg, exportPng } = useSchematicExport(
    svgRef,
    `${state.topology}_${state.controlType}`
  );

  const isTotem2Ph = state.topology === '2ph-interleaved-totem';
  const isTotem1Ph = state.topology === '1ph-totem-pfc';
  const isDiodeBoost2Ph = state.topology === '2ph-interleaved-boost';
  const isDualBoostBridgeless = state.topology === 'dual-boost-bridgeless';

  const stage2Title = isTotem2Ph
    ? 'INTERLEAVED BOOST INDUCTORS (L1 @ 0°, L2 @ 180°)'
    : isTotem1Ph
    ? 'SINGLE-PHASE CCM BOOST INDUCTOR (L1)'
    : isDiodeBoost2Ph
    ? 'DIODE BRIDGE (DB1–DB4) + INTERLEAVED L1, L2'
    : 'DUAL-BOOST INDUCTORS (L1 POS, L2 NEG)';

  const stage3Title = isTotem2Ph
    ? '2-PH SiC/GaN LEGS (Q1–Q4) + 50/60Hz SYNC LEG (S1, S2)'
    : isTotem1Ph
    ? 'FAST SiC/GaN LEG (Q1, Q2) + 50/60Hz SYNC LEG (S1, S2)'
    : isDiodeBoost2Ph
    ? 'INTERLEAVED BOOST FETs (Q1, Q2) & SiC DIODES (D1, D2)'
    : 'DUAL-BOOST CELLS (Q1/D1, Q2/D2) + CM RETURN DIODES (DR1, DR2)';

  const connectionNodes: AcDcConnectionNode[] = [
    {
      id: 'N1',
      code: 'N1: AC_L',
      name: 'AC Line Input Terminal & Fuse Node',
      stage: 'input-filter',
      x: 52,
      y: 115,
      color: '#38bdf8',
      pins: ['J_AC.1 (Line)', 'F1.1 (Input Fuse)', 'Cx1.1 (X2 DM Cap)', 'Rb.1 (Bleeder)'],
      telemetry: `Vac = ${state.Vac_rms_V} Vrms (${state.f_line_Hz} Hz) | Iin = ${res.Iin_rms_A.toFixed(1)} Arms`,
      layoutRule: 'Maintain ≥ 4.0 mm creepage/clearance between AC_L and AC_N/PE per IEC 62368-1 Basic Insulation.',
    },
    {
      id: 'N2',
      code: 'N2: AC_N',
      name: 'AC Neutral Input Return Terminal',
      stage: 'input-filter',
      x: 52,
      y: 265,
      color: '#94a3b8',
      pins: ['J_AC.2 (Neutral)', 'Cx1.2 (X2 DM Cap)', 'Rb.2 (Bleeder)', 'L_CM.3 (CM Choke N-In)'],
      telemetry: `Neutral Return Path | I_N = ${res.Iin_rms_A.toFixed(1)} Arms | SOGI-PLL Vac Ref`,
      layoutRule: 'Route AC_N symmetrically parallel to AC_L into Cx1 and L_CM to minimize differential loop area.',
    },
    {
      id: 'N3',
      code: 'N3: DM_CX1',
      name: 'Input Filter X2 Cap & Bleeder Connection Point',
      stage: 'input-filter',
      x: 92,
      y: 115,
      color: '#06b6d4',
      pins: ['Cx1.1 (X2 Film)', 'Rb.1 (Safety Discharge)', 'L_CM.1 (Coupled Choke L-In)'],
      telemetry: `Cx1 = ${res.Cx_each_uF.toFixed(2)} µF (Class X2) || R_bleed = ${res.R_bleed_kOhm.toFixed(0)} kΩ (τ < 1.0s)`,
      layoutRule: 'Place Cx1 directly across AC connector pins before L_CM; connect R_bleed in parallel for IEC 62368-1 discharge.',
    },
    {
      id: 'N4',
      code: 'N4: CM_OUT',
      name: 'Common-Mode Choke Output & Y-Cap Node',
      stage: 'input-filter',
      x: 176,
      y: 115,
      color: '#38bdf8',
      pins: ['L_CM.2 (Choke L-Out)', 'Cy1.1 (Y2 Cap to PE)', 'Cx2.1 (Stage-2 X2 Cap)'],
      telemetry: `L_CM = 2 × ${res.Lcm_mH.toFixed(1)} mH | L_DM,leak = ${res.Ldm_uH.toFixed(0)} µH`,
      layoutRule: 'Keep ≥ 6 mm isolation slot underneath L_CM core between input (N3) and output (N4) copper pours.',
    },
    {
      id: 'N5',
      code: 'N5: PE_GND',
      name: 'Safety Y2 Capacitor Center-Tap to Protective Earth (PE)',
      stage: 'input-filter',
      x: 176,
      y: 190,
      color: '#10b981',
      pins: ['Cy1.2 (Line Y2 Cap)', 'Cy2.1 (Neutral Y2 Cap)', 'PE_STUD (Chassis Earth)'],
      telemetry: `Cy1 = Cy2 = ${res.Cy_each_nF.toFixed(1)} nF (Class Y2) | I_leak = ${res.earthLeakage_mA.toFixed(2)} mA (<3.5mA)`,
      layoutRule: 'Tie Cy1.2 and Cy2.1 with ultra-short (<5 mm) wide traces directly to the chassis PE mounting standoff.',
    },
    {
      id: 'N6',
      code: 'N6: PRE_OUT',
      name: 'Inrush Pre-Charge NTC / Bypass Relay Output Node',
      stage: 'input-filter',
      x: 282,
      y: 115,
      color: '#f59e0b',
      pins: ['R_NTC.2 (Pre-Charge)', 'K_BYP.2 (Relay NO Contact)', isDiodeBoost2Ph ? 'DB1.A / DB2.K (Bridge AC_L)' : 'L1.1 / L2.1 (Boost Inductor In)'],
      telemetry: `I_inrush,pk = ${res.Iinrush_precharge_pk_A.toFixed(1)} A (E = ${res.inrushEnergy_J.toFixed(1)} J) | Relay closes @ ${res.t_relay_bypass_ms.toFixed(0)} ms`,
      layoutRule: 'Place K_BYPASS relay in parallel with R_NTC after EMI filter so inrush current is damped before charging Cdc.',
    },
    {
      id: 'N7',
      code: 'N7: SW_PH1',
      name: isTotem1Ph
        ? 'Fast SiC/GaN Half-Bridge Switching Node (SW1)'
        : isDiodeBoost2Ph
        ? 'Phase 1 Boost Inductor-to-Switch/Diode Node (SW1)'
        : 'Phase 1 Interleaved Fast Switching Node (SW_PH1)',
      stage: 'pfc-core',
      x: isTotem1Ph ? 535 : isDiodeBoost2Ph ? 575 : 515,
      y: isTotem1Ph ? 155 : 145,
      color: '#06b6d4',
      pins: isDiodeBoost2Ph
        ? ['L1.2 (Boost Inductor Out)', 'Q1.D (Boost FET Drain)', 'D1.A (SiC Boost Diode Anode)']
        : isDualBoostBridgeless
        ? ['L1.2 (Pos Boost Inductor Out)', 'Q1.D (Low-Side FET Drain)', 'D1.A (High-Side SiC Anode)']
        : ['L1.2 (Boost Inductor Out)', 'Q1.S (High-Side Source)', 'Q2.D (Low-Side Drain)'],
      telemetry: `f_sw = ${state.fsw_kHz} kHz | ΔI_L1 = ${res.deltaIL_ph_max_A.toFixed(2)} App | dV/dt > 35 V/ns`,
      layoutRule: 'CRITICAL HIGH dV/dt NODE: Minimize copper polygon area to prevent capacitive coupling to heatsink/PE (reduces CM EMI).',
    },
    {
      id: 'N8',
      code: isTotem1Ph ? 'N8: SW_SYNC' : isDiodeBoost2Ph ? 'N8: SW_PH2' : 'N8: SW_PH2/SYNC',
      name: isTotem1Ph
        ? '50/60Hz Synchronous Unfolding Leg Midpoint (N_RET)'
        : isDiodeBoost2Ph
        ? 'Phase 2 Interleaved Boost Switching Node (180°)'
        : isDualBoostBridgeless
        ? 'Phase 2 Negative Half-Cycle Switching Node (SW2)'
        : 'Phase 2 Switching Node (180°) & Sync Return Leg',
      stage: 'pfc-core',
      x: isTotem1Ph ? 705 : isDiodeBoost2Ph ? 700 : 620,
      y: isTotem1Ph ? 180 : isDiodeBoost2Ph ? 200 : 195,
      color: '#a855f7',
      pins: isTotem1Ph
        ? ['AC_N (Neutral)', 'S1.S (High-Side Sync Source)', 'S2.D (Low-Side Sync Drain)']
        : isDiodeBoost2Ph
        ? ['L2.2 (Ph2 Inductor Out)', 'Q2.D (Ph2 FET Drain)', 'D2.A (Ph2 SiC Anode)']
        : isDualBoostBridgeless
        ? ['L2.2 (Neg Inductor Out)', 'Q2.D (Ph2 FET Drain)', 'D2.A (Ph2 SiC Anode)']
        : ['L2.2 (Ph2 Inductor Out @ 180°)', 'Q3.S (Ph2 High-Side)', 'Q4.D (Ph2 Low-Side)'],
      telemetry:
        res.nPhases === 2
          ? `180° Interleaved Carrier | Net ΔI_in = ${res.deltaIin_net_max_A.toFixed(2)} App (-${res.rippleCancelMax_pct.toFixed(0)}% Cancel)`
          : `Line-Sync Unfolding @ ${state.f_line_Hz} Hz | ZCD Spike = ${res.zcdSpike_A.toFixed(2)} Apk`,
      layoutRule: 'Use separate Kelvin gate-drive return traces for each phase leg to prevent cross-conduction from common source inductance.',
    },
    {
      id: 'N9',
      code: 'N9: +VDC_BUS',
      name: 'High-Voltage Positive DC Bus Capacitor Connection Point (+VDC)',
      stage: 'bus-cap',
      x: 915,
      y: 55,
      color: '#f59e0b',
      pins: [
        isDiodeBoost2Ph || isDualBoostBridgeless ? 'D1.K / D2.K (SiC Cathodes)' : 'Q1.D / Q3.D / S1.D (Bridge Drains)',
        'C_HF.1 (1.0µF MKP Film Decoupling +)',
        `C_DC1.+ .. C_DC${res.capBankParallelCount}.+ (Bulk Electrolytic Anodes)`,
        'J_OUT.+ (+Vdc Load Bus)',
      ],
      telemetry: `Vdc = ${state.Vdc_bus_V} Vdc | ΔV_2f = ${res.Vdc_ripple_pp_V.toFixed(1)} Vpp | I_C,HF = ${res.ICdc_hf_rms_A.toFixed(2)} Arms | I_C,2f = ${res.ICdc_lf_rms_A.toFixed(2)} Arms`,
      layoutRule: 'Place C_HF.1 within <8 mm of fast leg Drain pins (Q1.D/D1.K) using overlapping planar busbars before routing to bulk C_DC1/C_DC2.',
    },
    {
      id: 'N10',
      code: 'N10: DC_RTN',
      name: 'DC-Link Negative Bus Capacitor & Star Return Connection Point',
      stage: 'bus-cap',
      x: 965,
      y: 305,
      color: '#10b981',
      pins: [
        'Q2.S / Q4.S / S2.S (Power Switch Sources)',
        'C_HF.2 (HF Film Return)',
        `C_DC1.- .. C_DC${res.capBankParallelCount}.- (Bulk Cap Cathodes via ESR=${state.ESR_Cdc_mOhm}mΩ)`,
        'STAR_GND (Vdc Sense & Load Return)',
      ],
      telemetry: `Total Cdc = ${state.Cdc_uF} µF (${res.capBankParallelCount}× ${(state.Cdc_uF / res.capBankParallelCount).toFixed(0)}µF) | T_core = ${res.capHotspot_C.toFixed(1)}°C | Life = ${(res.capLife_hours / 1000).toFixed(1)}k hrs`,
      layoutRule: 'Establish the Kelvin Star Ground at the negative terminal of the bulk capacitor bank (N10) to isolate high-di/dt switching loops from ADC Vdc sense.',
    },
  ];

  const activeNode = connectionNodes.find((n) => n.id === selectedNodeId) || connectionNodes[2];

  const renderNodePin = (node: AcDcConnectionNode) => {
    const isSelected = node.id === selectedNodeId;
    return (
      <g
        key={node.id}
        onClick={() => setSelectedNodeId(node.id)}
        className="cursor-pointer"
        style={{ cursor: 'pointer' }}
      >
        {isSelected && (
          <circle
            cx={node.x}
            cy={node.y}
            r="11"
            fill="none"
            stroke={node.color}
            strokeWidth="1.8"
            strokeDasharray="3 2"
          />
        )}
        <circle
          cx={node.x}
          cy={node.y}
          r={isSelected ? 5.2 : 4}
          fill="#090D16"
          stroke={node.color}
          strokeWidth={isSelected ? 2.4 : 1.8}
        />
        <circle cx={node.x} cy={node.y} r="1.8" fill={node.color} />
        {showPinBadges && (
          <g transform={`translate(${node.x}, ${node.y - 14})`}>
            <rect
              x="-16"
              y="-8"
              width="32"
              height="13"
              rx="3"
              fill={isSelected ? node.color : '#0f172a'}
              stroke={node.color}
              strokeWidth="1.1"
            />
            <text
              x="0"
              y="1"
              textAnchor="middle"
              fill={isSelected ? '#090D16' : node.color}
              fontSize="7.5"
              fontWeight="bold"
            >
              {node.id}
            </text>
          </g>
        )}
      </g>
    );
  };

  return (
    <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
      {/* Top Toolbar: Live Topology Switcher, Conduction Path & Export */}
      <div className="px-3.5 py-2.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 bg-slate-50/70 dark:bg-slate-900/50">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[13px] font-medium text-slate-900 dark:text-[#eef0f5]">
            Dynamic PFC CAD Schematic &amp; Node Visualizer
          </span>
          <span className="text-xs font-mono text-slate-600 dark:text-slate-300">
            {state.Vac_rms_V}Vac → {state.Vdc_bus_V}Vdc ({(state.Pout_W / 1e3).toFixed(1)} kW)
          </span>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => setShowPinBadges((v) => !v)}
            className={`px-2 py-1 text-[10px] font-mono font-semibold rounded border transition-colors cursor-pointer ${
              showPinBadges
                ? 'bg-cyan-500/15 border-cyan-500 text-cyan-600 dark:text-cyan-300'
                : 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-500'
            }`}
          >
            {showPinBadges ? '● Node Pins: ON' : '○ Node Pins: OFF'}
          </button>

          <div className="inline-flex rounded border border-slate-300 dark:border-slate-700 overflow-hidden text-[10px] font-mono">
            <button
              type="button"
              onClick={() => setHalfCycleMode('both')}
              className={`px-2 py-1 cursor-pointer ${
                halfCycleMode === 'both'
                  ? 'bg-cyan-600 text-white font-bold'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400'
              }`}
            >
              Full AC
            </button>
            <button
              type="button"
              onClick={() => setHalfCycleMode('pos')}
              className={`px-2 py-1 cursor-pointer border-l border-slate-300 dark:border-slate-700 ${
                halfCycleMode === 'pos'
                  ? 'bg-emerald-600 text-white font-bold'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400'
              }`}
            >
              +Vac Half
            </button>
            <button
              type="button"
              onClick={() => setHalfCycleMode('neg')}
              className={`px-2 py-1 cursor-pointer border-l border-slate-300 dark:border-slate-700 ${
                halfCycleMode === 'neg'
                  ? 'bg-amber-600 text-white font-bold'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400'
              }`}
            >
              -Vac Half
            </button>
          </div>

          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(80, z - 10))}
            className="p-1 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 rounded"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setZoom(100)}
            className="px-2 py-1 text-[11px] font-mono bg-slate-200/80 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded"
          >
            {zoom}%
          </button>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(140, z + 10))}
            className="p-1 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 rounded"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={exportSvg}
            className="px-2 py-1 text-[11px] font-mono bg-cyan-600 text-white rounded hover:bg-cyan-500 inline-flex items-center gap-1"
          >
            <Download className="w-3 h-3" /> SVG
          </button>
          <button
            type="button"
            onClick={() => {
              const asc = generateAcDcLtspiceAsc(state, res);
              const blob = new Blob([asc], { type: 'text/plain;charset=utf-8' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `voltcraft_${state.topology}.asc`;
              a.click();
              URL.revokeObjectURL(url);
            }}
            className="px-2 py-1 text-[11px] font-mono bg-emerald-600 text-white rounded hover:bg-emerald-500 inline-flex items-center gap-1 cursor-pointer"
            title="Download grid-aligned LTspice .asc schematic diagram"
          >
            <Download className="w-3 h-3" /> LTspice .asc
          </button>
          <button
            type="button"
            onClick={exportPng}
            className="px-2 py-1 text-[11px] font-mono bg-slate-700 text-white rounded hover:bg-slate-600 inline-flex items-center gap-1"
          >
            <ImageIcon className="w-3 h-3" /> PNG 2x
          </button>
        </div>
      </div>

      {/* Quick Topology Variant Switcher Bar */}
      {onTopologyChange && (
        <div className="px-3.5 py-2 border-b border-slate-200 dark:border-slate-800 bg-slate-100/60 dark:bg-slate-900/80 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 mr-1">
              Switch PFC Topology:
            </span>
            {(
              [
                { id: '2ph-interleaved-totem', label: '2-Ph Interleaved Totem-Pole' },
                { id: '1ph-totem-pfc', label: '1-Ph Bridgeless Totem-Pole' },
                { id: '2ph-interleaved-boost', label: '2-Ph Diode-Bridge Interleaved Boost' },
                { id: 'dual-boost-bridgeless', label: 'Dual-Boost Semi-Bridgeless' },
              ] as { id: AcDcTopologyType; label: string }[]
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onTopologyChange(item.id)}
                className={`px-2.5 py-1 rounded text-[11px] font-mono transition-colors cursor-pointer ${
                  state.topology === item.id
                    ? 'bg-cyan-600 text-white font-bold shadow-xs'
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:border-cyan-500/50'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <span className="text-[10px] font-mono text-cyan-600 dark:text-cyan-400">
            Click any N1–N10 pin on the schematic to inspect filter & bus capacitor connections
          </span>
        </div>
      )}

      {/* Main CAD SVG Schematic Canvas */}
      <div className="p-3 bg-slate-950 text-slate-200 overflow-x-auto">
        <div style={{ width: `${zoom}%`, minWidth: '940px' }} className="mx-auto">
          <svg
            ref={svgRef}
            viewBox="0 0 1160 490"
            className="w-full h-auto font-mono select-none text-slate-300"
          >
            <defs>
              <pattern id="acdc-cad-grid" width="20" height="20" patternUnits="userSpaceOnUse">
                <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#1e293b" strokeWidth="0.7" />
              </pattern>
            </defs>
            <rect width="1160" height="490" fill="#090D16" rx="6" />
            <rect width="1160" height="490" fill="url(#acdc-cad-grid)" rx="6" />

            {/* Stage Bounding Enclosures (Subtle Dashed Sub-System Zones) */}
            <rect
              x="22"
              y="32"
              width="270"
              height="304"
              rx="5"
              fill="#0f172a"
              fillOpacity="0.35"
              stroke="#06b6d4"
              strokeWidth="1"
              strokeDasharray="4 3"
              strokeOpacity="0.5"
            />
            <rect
              x="865"
              y="32"
              width="275"
              height="304"
              rx="5"
              fill="#0f172a"
              fillOpacity="0.35"
              stroke="#10b981"
              strokeWidth="1"
              strokeDasharray="4 3"
              strokeOpacity="0.5"
            />

            {/* Section Header Callouts */}
            <text x="30" y="23" fill="#06b6d4" fontSize="9" fontWeight="bold">
              1. INPUT EMI FILTER (DM/CM) & PRE-CHARGE NODES
            </text>
            <text x="305" y="23" fill="#38bdf8" fontSize="9" fontWeight="bold">
              2. {stage2Title}
            </text>
            <text x="545" y="23" fill="#a855f7" fontSize="9" fontWeight="bold">
              3. {stage3Title}
            </text>
            <text x="872" y="23" fill="#10b981" fontSize="9" fontWeight="bold">
              4. DC-LINK BUS CAPACITOR NETWORK (C_HF || C_DC1..N)
            </text>

            {/* Half-Cycle Conduction Indicator Banner if active */}
            {halfCycleMode !== 'both' && (
              <g transform="translate(305, 36)">
                <rect
                  x="0"
                  y="0"
                  width="545"
                  height="16"
                  rx="3"
                  fill={halfCycleMode === 'pos' ? '#064e3b' : '#78350f'}
                  stroke={halfCycleMode === 'pos' ? '#10b981' : '#f59e0b'}
                  strokeWidth="1"
                />
                <text
                  x="272"
                  y="11"
                  textAnchor="middle"
                  fill={halfCycleMode === 'pos' ? '#6ee7b7' : '#fcd34d'}
                  fontSize="8"
                  fontWeight="bold"
                >
                  {halfCycleMode === 'pos'
                    ? 'POSITIVE HALF-CYCLE (Vac > 0): Active Conduction Path Highlighted (L → Boost Stage → +VDC_BUS → DC_RTN → N)'
                    : 'NEGATIVE HALF-CYCLE (Vac < 0): Active Conduction Path Highlighted (N → Boost Stage → +VDC_BUS → DC_RTN → L)'}
                </text>
              </g>
            )}

            {/* ============================================================== */}
            {/* 1. DETAILED INPUT EMI FILTER & INRUSH PRE-CHARGE STAGE         */}
            {/* ============================================================== */}
            {/* AC Mains Source at x=42, y=190 */}
            <line x1="42" y1="115" x2="42" y2="170" stroke="#38bdf8" strokeWidth="1.8" />
            <circle cx="42" cy="190" r="19" fill="#0f172a" stroke="#38bdf8" strokeWidth="2" />
            <path d="M 32 190 Q 37 179 42 190 T 52 190" fill="none" stroke="#38bdf8" strokeWidth="1.8" />
            <text x="42" y="160" textAnchor="middle" fill="#38bdf8" fontSize="8.5" fontWeight="bold">
              {state.Vac_rms_V}Vac
            </text>
            <text x="42" y="222" textAnchor="middle" fill="#94a3b8" fontSize="7.5">
              {res.Iin_rms_A.toFixed(1)}Arms
            </text>
            <line x1="42" y1="209" x2="42" y2="265" stroke="#94a3b8" strokeWidth="1.8" />

            {/* Line (y=115) & Neutral (y=265) Entry Feeders */}
            <line x1="42" y1="115" x2="128" y2="115" stroke="#38bdf8" strokeWidth="1.8" />
            <line x1="42" y1="265" x2="128" y2="265" stroke="#94a3b8" strokeWidth="1.8" />
            <text x="64" y="108" fill="#38bdf8" fontSize="7.5" fontWeight="bold">
              AC_L
            </text>
            <text x="64" y="277" fill="#94a3b8" fontSize="7.5" fontWeight="bold">
              AC_N
            </text>

            {/* DM Capacitor Cx1 (x=82) + Safety Bleeder Resistor R_bleed (x=108) */}
            <line x1="82" y1="115" x2="82" y2="172" stroke="currentColor" strokeWidth="1.5" />
            <CapacitorV
              x={82}
              y={192}
              label="Cx1"
              sublabel={`${res.Cx_each_uF.toFixed(1)}µF X2`}
              color="#06b6d4"
            />
            <line x1="82" y1="212" x2="82" y2="265" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="82" cy="115" r="2.8" fill="#06b6d4" />
            <circle cx="82" cy="265" r="2.8" fill="#06b6d4" />
            <text x="74" y="128" textAnchor="end" fill="#67e8f9" fontSize="6.5">
              Cx1.1
            </text>
            <text x="74" y="258" textAnchor="end" fill="#67e8f9" fontSize="6.5">
              Cx1.2
            </text>

            {/* Bleeder Resistor R_bleed across Cx1 at x=112 */}
            <line x1="112" y1="115" x2="112" y2="170" stroke="#64748b" strokeWidth="1.2" strokeDasharray="2 2" />
            <rect x="106" y="170" width="12" height="36" rx="2" fill="#0f172a" stroke="#64748b" strokeWidth="1.3" />
            <text x="112" y="191" textAnchor="middle" fill="#94a3b8" fontSize="6.5">
              Rb
            </text>
            <line x1="112" y1="206" x2="112" y2="265" stroke="#64748b" strokeWidth="1.2" strokeDasharray="2 2" />
            <circle cx="112" cy="115" r="2.2" fill="#64748b" />
            <circle cx="112" cy="265" r="2.2" fill="#64748b" />

            {/* Coupled Common-Mode Choke L_CM (x=128..164) on Line (y=115) & Neutral (y=265) */}
            <path
              d="M 128 115 Q 134 103 140 115 Q 146 103 152 115 Q 158 103 164 115"
              fill="none"
              stroke="#38bdf8"
              strokeWidth="1.8"
            />
            <path
              d="M 128 265 Q 134 277 140 265 Q 146 277 152 265 Q 158 277 164 265"
              fill="none"
              stroke="#94a3b8"
              strokeWidth="1.8"
            />
            {/* Coupled Magnetic Core Bar between Line & Neutral windings */}
            <line x1="143" y1="122" x2="143" y2="258" stroke="#38bdf8" strokeWidth="1.2" strokeDasharray="4 3" />
            <line x1="149" y1="122" x2="149" y2="258" stroke="#38bdf8" strokeWidth="1.2" strokeDasharray="4 3" />
            {/* Phasing Dots */}
            <circle cx="131" cy="106" r="2.2" fill="#38bdf8" />
            <circle cx="131" cy="256" r="2.2" fill="#94a3b8" />
            <text x="146" y="96" textAnchor="middle" fill="#38bdf8" fontSize="7.5" fontWeight="bold">
              L_CM ({res.Lcm_mH.toFixed(1)}mH)
            </text>

            {/* Wire from L_CM output (x=164) to Cy1/Cy2 (x=176) and Cx2 (x=212) */}
            <line x1="164" y1="115" x2="225" y2="115" stroke="#38bdf8" strokeWidth="1.8" />
            <line x1="164" y1="265" x2="295" y2="265" stroke="#94a3b8" strokeWidth="1.8" />

            {/* Class Y2 Common-Mode Capacitors Cy1 (top) & Cy2 (bottom) at x=176 meeting at PE (y=190) */}
            <line x1="176" y1="115" x2="176" y2="148" stroke="#10b981" strokeWidth="1.4" />
            <line x1="169" y1="148" x2="183" y2="148" stroke="#10b981" strokeWidth="2" />
            <line x1="169" y1="154" x2="183" y2="154" stroke="#10b981" strokeWidth="2" />
            <line x1="176" y1="154" x2="176" y2="190" stroke="#10b981" strokeWidth="1.4" />
            <text x="185" y="149" fill="#10b981" fontSize="7" fontWeight="bold">
              Cy1
            </text>

            <line x1="176" y1="190" x2="176" y2="226" stroke="#10b981" strokeWidth="1.4" />
            <line x1="169" y1="226" x2="183" y2="226" stroke="#10b981" strokeWidth="2" />
            <line x1="169" y1="232" x2="183" y2="232" stroke="#10b981" strokeWidth="2" />
            <line x1="176" y1="232" x2="176" y2="265" stroke="#10b981" strokeWidth="1.4" />
            <text x="185" y="236" fill="#10b981" fontSize="7" fontWeight="bold">
              Cy2
            </text>
            <circle cx="176" cy="265" r="2.8" fill="#10b981" />

            {/* Protective Earth (PE) Chassis Ground Connection at (176, 190) -> (156, 190) */}
            <line x1="176" y1="190" x2="156" y2="190" stroke="#10b981" strokeWidth="1.6" />
            <line x1="156" y1="190" x2="156" y2="198" stroke="#10b981" strokeWidth="1.6" />
            <line x1="149" y1="198" x2="163" y2="198" stroke="#10b981" strokeWidth="1.6" />
            <line x1="152" y1="202" x2="160" y2="202" stroke="#10b981" strokeWidth="1.6" />
            <text x="156" y="212" textAnchor="middle" fill="#10b981" fontSize="6.5" fontWeight="bold">
              PE
            </text>

            {/* Second DM Capacitor Cx2 at x=212 */}
            <line x1="212" y1="115" x2="212" y2="175" stroke="#06b6d4" strokeWidth="1.4" />
            <line x1="204" y1="175" x2="220" y2="175" stroke="#06b6d4" strokeWidth="2" />
            <line x1="204" y1="181" x2="220" y2="181" stroke="#06b6d4" strokeWidth="2" />
            <line x1="212" y1="181" x2="212" y2="265" stroke="#06b6d4" strokeWidth="1.4" />
            <circle cx="212" cy="115" r="2.6" fill="#06b6d4" />
            <circle cx="212" cy="265" r="2.6" fill="#06b6d4" />
            <text x="212" y="168" textAnchor="middle" fill="#06b6d4" fontSize="7" fontWeight="bold">
              Cx2
            </text>

            {/* Inrush Pre-Charge Resistor R_NTC (x=232..270, y=115) + Parallel Bypass Relay K_BYPASS (y=82) */}
            <rect
              x="232"
              y="108"
              width="38"
              height="14"
              rx="2"
              fill="#0f172a"
              stroke="#f59e0b"
              strokeWidth="1.6"
            />
            <text x="251" y="118" textAnchor="middle" fill="#f59e0b" fontSize="7.5" fontWeight="bold">
              R_NTC
            </text>
            <text x="251" y="133" textAnchor="middle" fill="#fcd34d" fontSize="6.5">
              {res.R_precharge_Ohm.toFixed(1)}Ω Pre
            </text>
            {/* Bypass Relay Switch K_BYPASS in parallel above R_NTC */}
            <line x1="225" y1="115" x2="225" y2="82" stroke="#10b981" strokeWidth="1.4" />
            <line x1="225" y1="82" x2="240" y2="82" stroke="#10b981" strokeWidth="1.4" />
            <circle cx="240" cy="82" r="2.2" fill="#10b981" />
            <line x1="240" y1="82" x2="258" y2="74" stroke="#10b981" strokeWidth="1.6" />
            <circle cx="260" cy="82" r="2.2" fill="#10b981" />
            <line x1="260" y1="82" x2="275" y2="82" stroke="#10b981" strokeWidth="1.4" />
            <line x1="275" y1="82" x2="275" y2="115" stroke="#10b981" strokeWidth="1.4" />
            <text x="251" y="68" textAnchor="middle" fill="#10b981" fontSize="7" fontWeight="bold">
              K_BYP ({res.t_relay_bypass_ms.toFixed(0)}ms)
            </text>
            <circle cx="225" cy="115" r="2.6" fill="#38bdf8" />
            <line x1="270" y1="115" x2="295" y2="115" stroke="#38bdf8" strokeWidth="1.8" />

            {/* Input Filter Summary Telemetry Label inside Stage 1 box */}
            <rect x="30" y="302" width="254" height="26" rx="3" fill="#090D16" stroke="#1e293b" strokeWidth="1" />
            <text x="157" y="313" textAnchor="middle" fill="#67e8f9" fontSize="7.5" fontWeight="bold">
              INPUT FILTER NODES: Cx1/Cx2={res.Cx_each_uF.toFixed(2)}µF · Lcm={res.Lcm_mH.toFixed(1)}mH
            </text>
            <text x="157" y="323" textAnchor="middle" fill="#94a3b8" fontSize="7">
              Cy1/Cy2={res.Cy_each_nF.toFixed(1)}nF → PE ({res.earthLeakage_mA.toFixed(2)}mA) · I_inrush={res.Iinrush_precharge_pk_A.toFixed(1)}Apk
            </text>

            {/* ============================================================== */}
            {/* VARIANT A: 2-PHASE INTERLEAVED BRIDGELESS TOTEM-POLE PFC       */}
            {/* ============================================================== */}
            {isTotem2Ph && (
              <g>
                {/* AC Line splits at x=305 into Phase 1 (y=145) and Phase 2 (y=195) */}
                <line x1="295" y1="115" x2="305" y2="115" stroke="#38bdf8" strokeWidth="1.8" />
                <line x1="305" y1="115" x2="305" y2="195" stroke="#38bdf8" strokeWidth="1.8" />
                <circle cx="305" cy="145" r="3.2" fill="#38bdf8" />

                {/* Phase 1 Boost Inductor L1 (0° Carrier) at y=145 -> connects to Q1/Q2 midpoint (x=515, y=145) */}
                <line x1="305" y1="145" x2="346" y2="145" stroke="#38bdf8" strokeWidth="1.8" />
                <InductorH
                  x={370}
                  y={145}
                  label={`L1=${state.Lpfc_uH}µH`}
                  sublabel={`ΔIL1=${res.deltaIL_ph_max_A.toFixed(1)}A (0°)`}
                  color="#38bdf8"
                />
                <line x1="394" y1="145" x2="515" y2="145" stroke="#38bdf8" strokeWidth="1.8" />
                <circle cx="445" cy="145" r="6" fill="none" stroke="#38bdf8" strokeWidth="1.4" />
                <text x="445" y="134" textAnchor="middle" fill="#38bdf8" fontSize="7.5">
                  CT1 (i_L1)
                </text>

                {/* Phase 2 Boost Inductor L2 (180° Carrier) at y=195 -> connects to Q3/Q4 midpoint (x=620, y=195) */}
                <line x1="305" y1="195" x2="346" y2="195" stroke="#10b981" strokeWidth="1.8" />
                <InductorH
                  x={370}
                  y={195}
                  label={`L2=${state.Lpfc_uH}µH`}
                  sublabel="Phase 2 (180° Shift)"
                  color="#10b981"
                />
                <line x1="394" y1="195" x2="620" y2="195" stroke="#10b981" strokeWidth="1.8" />
                <circle cx="465" cy="195" r="6" fill="none" stroke="#10b981" strokeWidth="1.4" />
                <text x="465" y="184" textAnchor="middle" fill="#10b981" fontSize="7.5">
                  CT2 (i_L2)
                </text>

                {/* DC Bus Rails (+Vdc at y=55, DC_RTN at y=305) */}
                <line x1="515" y1="55" x2="1085" y2="55" stroke="#f59e0b" strokeWidth="2.4" />
                <line x1="515" y1="305" x2="1085" y2="305" stroke="currentColor" strokeWidth="2.2" />

                {/* Fast Leg 1 (Q1 High-Side @ y=95, Q2 Low-Side @ y=250) at x=515 */}
                <line x1="515" y1="55" x2="515" y2="76" stroke="currentColor" strokeWidth="1.7" />
                <MosfetSymbol x={515} y={95} label="Q1" sublabel={`${state.fsw_kHz}kHz`} color="#06b6d4" scale={0.85} />
                <line x1="515" y1="114" x2="515" y2="231" stroke="currentColor" strokeWidth="1.7" />
                <MosfetSymbol x={515} y={250} label="Q2" sublabel="Ph1 (0°)" color="#06b6d4" scale={0.85} />
                <line x1="515" y1="269" x2="515" y2="305" stroke="currentColor" strokeWidth="1.7" />
                <circle cx="515" cy="55" r="3.2" fill="#f59e0b" />
                <circle cx="515" cy="305" r="3.2" fill="#94a3b8" />

                {/* Fast Leg 2 (Q3 High-Side @ y=95, Q4 Low-Side @ y=250) at x=620 */}
                <line x1="620" y1="55" x2="620" y2="76" stroke="currentColor" strokeWidth="1.7" />
                <MosfetSymbol x={620} y={95} label="Q3" sublabel={`${state.fsw_kHz}kHz`} color="#10b981" scale={0.85} />
                <line x1="620" y1="114" x2="620" y2="231" stroke="currentColor" strokeWidth="1.7" />
                <MosfetSymbol x={620} y={250} label="Q4" sublabel="Ph2 (180°)" color="#10b981" scale={0.85} />
                <line x1="620" y1="269" x2="620" y2="305" stroke="currentColor" strokeWidth="1.7" />
                <circle cx="620" cy="55" r="3.2" fill="#f59e0b" />
                <circle cx="620" cy="305" r="3.2" fill="#94a3b8" />

                {/* Slow Line-Frequency Synchronous Unfolding Leg (S1 @ y=95, S2 @ y=250) at x=745 */}
                <line x1="745" y1="55" x2="745" y2="76" stroke="currentColor" strokeWidth="1.7" />
                <MosfetSymbol
                  x={745}
                  y={95}
                  label="S1"
                  sublabel={halfCycleMode === 'neg' ? 'ON (-Vac)' : `${state.f_line_Hz}Hz Sync`}
                  color="#a855f7"
                  scale={0.85}
                />
                <line x1="745" y1="114" x2="745" y2="231" stroke="currentColor" strokeWidth="1.7" />
                <MosfetSymbol
                  x={745}
                  y={250}
                  label="S2"
                  sublabel={halfCycleMode === 'pos' ? 'ON (+Vac)' : `${state.f_line_Hz}Hz Sync`}
                  color="#a855f7"
                  scale={0.85}
                />
                <line x1="745" y1="269" x2="745" y2="305" stroke="currentColor" strokeWidth="1.7" />
                <circle cx="745" cy="55" r="3.2" fill="#f59e0b" />
                <circle cx="745" cy="305" r="3.2" fill="#94a3b8" />

                {/* AC Neutral wire routes to MIDPOINT of S1/S2 at (745, 172) */}
                <line x1="295" y1="265" x2="695" y2="265" stroke="#a855f7" strokeWidth="1.8" />
                <line x1="695" y1="265" x2="695" y2="172" stroke="#a855f7" strokeWidth="1.8" />
                <line x1="695" y1="172" x2="745" y2="172" stroke="#a855f7" strokeWidth="1.8" />
                <circle cx="745" cy="172" r="3.8" fill="#a855f7" />
                <text x="718" y="165" textAnchor="middle" fill="#c084fc" fontSize="8" fontWeight="bold">
                  N_SW
                </text>
              </g>
            )}

            {/* ============================================================== */}
            {/* VARIANT B: 1-PHASE BRIDGELESS TOTEM-POLE PFC                   */}
            {/* ============================================================== */}
            {isTotem1Ph && (
              <g>
                {/* AC Line goes to Single Boost Inductor L1 at y=155 -> connects to Q1/Q2 midpoint (x=535, y=155) */}
                <line x1="295" y1="115" x2="315" y2="115" stroke="#38bdf8" strokeWidth="1.8" />
                <line x1="315" y1="115" x2="315" y2="155" stroke="#38bdf8" strokeWidth="1.8" />
                <line x1="315" y1="155" x2="366" y2="155" stroke="#38bdf8" strokeWidth="1.8" />
                <InductorH
                  x={390}
                  y={155}
                  label={`L1=${state.Lpfc_uH}µH`}
                  sublabel={`ΔIL=${res.deltaIL_ph_max_A.toFixed(1)}App`}
                  color="#38bdf8"
                />
                <line x1="414" y1="155" x2="535" y2="155" stroke="#38bdf8" strokeWidth="1.8" />
                <circle cx="465" cy="155" r="6" fill="none" stroke="#38bdf8" strokeWidth="1.4" />
                <text x="465" y="143" textAnchor="middle" fill="#38bdf8" fontSize="7.5">
                  CT1 (i_L)
                </text>

                {/* DC Bus Rails (+Vdc at y=55, DC_RTN at y=305) */}
                <line x1="535" y1="55" x2="1085" y2="55" stroke="#f59e0b" strokeWidth="2.4" />
                <line x1="535" y1="305" x2="1085" y2="305" stroke="currentColor" strokeWidth="2.2" />

                {/* Fast SiC/GaN Switching Leg (Q1 @ y=95, Q2 @ y=250) at x=535 */}
                <line x1="535" y1="55" x2="535" y2="76" stroke="currentColor" strokeWidth="1.7" />
                <MosfetSymbol
                  x={535}
                  y={95}
                  label="Q1 (Fast)"
                  sublabel={`${state.fsw_kHz}kHz SiC/GaN`}
                  color="#06b6d4"
                  scale={0.85}
                />
                <line x1="535" y1="114" x2="535" y2="231" stroke="currentColor" strokeWidth="1.7" />
                <MosfetSymbol
                  x={535}
                  y={250}
                  label="Q2 (Fast)"
                  sublabel={`${state.fsw_kHz}kHz SiC/GaN`}
                  color="#06b6d4"
                  scale={0.85}
                />
                <line x1="535" y1="269" x2="535" y2="305" stroke="currentColor" strokeWidth="1.7" />
                <circle cx="535" cy="55" r="3.2" fill="#f59e0b" />
                <circle cx="535" cy="305" r="3.2" fill="#94a3b8" />

                {/* Slow Line-Frequency Return Leg (S1 @ y=95, S2 @ y=250) at x=705 */}
                <line x1="705" y1="55" x2="705" y2="76" stroke="currentColor" strokeWidth="1.7" />
                <MosfetSymbol
                  x={705}
                  y={95}
                  label="S1 (Slow)"
                  sublabel={`${state.f_line_Hz}Hz Sync`}
                  color="#a855f7"
                  scale={0.85}
                />
                <line x1="705" y1="114" x2="705" y2="231" stroke="currentColor" strokeWidth="1.7" />
                <MosfetSymbol
                  x={705}
                  y={250}
                  label="S2 (Slow)"
                  sublabel={`${state.f_line_Hz}Hz Sync`}
                  color="#a855f7"
                  scale={0.85}
                />
                <line x1="705" y1="269" x2="705" y2="305" stroke="currentColor" strokeWidth="1.7" />
                <circle cx="705" cy="55" r="3.2" fill="#f59e0b" />
                <circle cx="705" cy="305" r="3.2" fill="#94a3b8" />

                {/* AC Neutral wire routes to MIDPOINT of S1/S2 at (705, 180) */}
                <line x1="295" y1="265" x2="650" y2="265" stroke="#a855f7" strokeWidth="1.8" />
                <line x1="650" y1="265" x2="650" y2="180" stroke="#a855f7" strokeWidth="1.8" />
                <line x1="650" y1="180" x2="705" y2="180" stroke="#a855f7" strokeWidth="1.8" />
              </g>
            )}

            {/* ============================================================== */}
            {/* VARIANT C: 2-PHASE INTERLEAVED DIODE-BRIDGE BOOST PFC          */}
            {/* ============================================================== */}
            {isDiodeBoost2Ph && (
              <g>
                {/* Full-Wave Input Diode Bridge Rectifier (DB1..DB4) at x=315 and x=365 */}
                <line x1="315" y1="80" x2="405" y2="80" stroke="#38bdf8" strokeWidth="1.8" />
                <line x1="315" y1="305" x2="1085" y2="305" stroke="currentColor" strokeWidth="2.2" />

                {/* Bridge Leg A (x=315): DB1 (top, y=120) and DB2 (bottom, y=245) */}
                <line x1="315" y1="80" x2="315" y2="104" stroke="currentColor" strokeWidth="1.6" />
                <DiodeSymbol x={315} y={120} dir="up" label="DB1" color="#94a3b8" />
                <line x1="315" y1="136" x2="315" y2="229" stroke="currentColor" strokeWidth="1.6" />
                <DiodeSymbol x={315} y={245} dir="up" label="DB2" color="#94a3b8" />
                <line x1="315" y1="261" x2="315" y2="305" stroke="currentColor" strokeWidth="1.6" />

                {/* Bridge Leg B (x=365): DB3 (top, y=120) and DB4 (bottom, y=245) */}
                <line x1="365" y1="80" x2="365" y2="104" stroke="currentColor" strokeWidth="1.6" />
                <DiodeSymbol x={365} y={120} dir="up" label="DB3" color="#94a3b8" />
                <line x1="365" y1="136" x2="365" y2="229" stroke="currentColor" strokeWidth="1.6" />
                <DiodeSymbol x={365} y={245} dir="up" label="DB4" color="#94a3b8" />
                <line x1="365" y1="261" x2="365" y2="305" stroke="currentColor" strokeWidth="1.6" />
                <circle cx="365" cy="80" r="3" fill="#38bdf8" />
                <circle cx="365" cy="305" r="3" fill="#94a3b8" />

                {/* Connect Pre-charge Out (y=115) to Bridge Leg A midpoint (315, 175) */}
                <line x1="295" y1="115" x2="295" y2="175" stroke="#38bdf8" strokeWidth="1.8" />
                <line x1="295" y1="175" x2="315" y2="175" stroke="#38bdf8" strokeWidth="1.8" />
                <circle cx="315" cy="175" r="3.2" fill="#38bdf8" />

                {/* Connect AC Neutral (y=265) to Bridge Leg B midpoint (365, 195) */}
                <line x1="295" y1="265" x2="348" y2="265" stroke="#94a3b8" strokeWidth="1.8" />
                <line x1="348" y1="265" x2="348" y2="195" stroke="#94a3b8" strokeWidth="1.8" />
                <line x1="348" y1="195" x2="365" y2="195" stroke="#94a3b8" strokeWidth="1.8" />
                <circle cx="365" cy="195" r="3.2" fill="#94a3b8" />

                {/* Rectified |Vac| splits at x=405 into L1 (y=145, 0°) and L2 (y=200, 180°) */}
                <line x1="405" y1="80" x2="405" y2="200" stroke="#38bdf8" strokeWidth="1.8" />
                <circle cx="405" cy="145" r="3.2" fill="#38bdf8" />

                {/* Phase 1 Boost Inductor L1 (y=145) -> Node SW1 (x=575, y=145) */}
                <line x1="405" y1="145" x2="446" y2="145" stroke="#38bdf8" strokeWidth="1.8" />
                <InductorH
                  x={470}
                  y={145}
                  label={`L1=${state.Lpfc_uH}µH`}
                  sublabel={`ΔIL1=${res.deltaIL_ph_max_A.toFixed(1)}A (0°)`}
                  color="#38bdf8"
                />
                <line x1="494" y1="145" x2="575" y2="145" stroke="#38bdf8" strokeWidth="1.8" />

                {/* Phase 2 Boost Inductor L2 (y=200) -> Node SW2 (x=700, y=200) */}
                <line x1="405" y1="200" x2="446" y2="200" stroke="#10b981" strokeWidth="1.8" />
                <InductorH
                  x={470}
                  y={200}
                  label={`L2=${state.Lpfc_uH}µH`}
                  sublabel="Phase 2 (180° Shift)"
                  color="#10b981"
                />
                <line x1="494" y1="200" x2="700" y2="200" stroke="#10b981" strokeWidth="1.8" />

                {/* Positive Output DC Bus Rail (+Vdc at y=55) */}
                <line x1="575" y1="55" x2="1085" y2="55" stroke="#f59e0b" strokeWidth="2.4" />

                {/* Phase 1 Cell at x=575: High-Side SiC Boost Diode D1 (y=98) & Low-Side Boost FET Q1 (y=245) */}
                <line x1="575" y1="55" x2="575" y2="82" stroke="currentColor" strokeWidth="1.7" />
                <DiodeSymbol x={575} y={98} dir="up" isSchottky label="D1" sublabel="SiC Boost" color="#f59e0b" />
                <line x1="575" y1="114" x2="575" y2="226" stroke="currentColor" strokeWidth="1.7" />
                <MosfetSymbol
                  x={575}
                  y={245}
                  label="Q1"
                  sublabel={`${state.fsw_kHz}kHz (0°)`}
                  color="#06b6d4"
                  scale={0.85}
                />
                <line x1="575" y1="264" x2="575" y2="305" stroke="currentColor" strokeWidth="1.7" />
                <circle cx="575" cy="55" r="3.2" fill="#f59e0b" />
                <circle cx="575" cy="305" r="3.2" fill="#94a3b8" />

                {/* Phase 2 Cell at x=700: High-Side SiC Boost Diode D2 (y=98) & Low-Side Boost FET Q2 (y=250) */}
                <line x1="700" y1="55" x2="700" y2="82" stroke="currentColor" strokeWidth="1.7" />
                <DiodeSymbol x={700} y={98} dir="up" isSchottky label="D2" sublabel="SiC Boost" color="#f59e0b" />
                <line x1="700" y1="114" x2="700" y2="231" stroke="currentColor" strokeWidth="1.7" />
                <MosfetSymbol
                  x={700}
                  y={250}
                  label="Q2"
                  sublabel={`${state.fsw_kHz}kHz (180°)`}
                  color="#10b981"
                  scale={0.85}
                />
                <line x1="700" y1="269" x2="700" y2="305" stroke="currentColor" strokeWidth="1.7" />
                <circle cx="700" cy="55" r="3.2" fill="#f59e0b" />
                <circle cx="700" cy="305" r="3.2" fill="#94a3b8" />
              </g>
            )}

            {/* ============================================================== */}
            {/* VARIANT D: DUAL-BOOST SEMI-BRIDGELESS PFC (WITH DR1, DR2)      */}
            {/* ============================================================== */}
            {isDualBoostBridgeless && (
              <g>
                {/* AC Line feeds L1 (y=145) for Positive Half-Cycle; tap at x=305 goes to Return Diode DR1 */}
                <line x1="295" y1="115" x2="305" y2="115" stroke="#38bdf8" strokeWidth="1.8" />
                <line x1="305" y1="115" x2="305" y2="145" stroke="#38bdf8" strokeWidth="1.8" />
                <circle cx="305" cy="145" r="3.2" fill="#38bdf8" />
                <line x1="305" y1="145" x2="356" y2="145" stroke="#38bdf8" strokeWidth="1.8" />
                <InductorH
                  x={380}
                  y={145}
                  label={`L1=${state.Lpfc_uH}µH`}
                  sublabel="Pos Half-Cycle"
                  color="#38bdf8"
                />
                <line x1="404" y1="145" x2="515" y2="145" stroke="#38bdf8" strokeWidth="1.8" />

                {/* AC Neutral feeds L2 (y=195) for Negative Half-Cycle; tap at x=325 goes to Return Diode DR2 */}
                <line x1="295" y1="265" x2="325" y2="265" stroke="#10b981" strokeWidth="1.8" />
                <circle cx="325" cy="265" r="3.2" fill="#10b981" />
                <line x1="325" y1="265" x2="325" y2="195" stroke="#10b981" strokeWidth="1.8" />
                <line x1="325" y1="195" x2="356" y2="195" stroke="#10b981" strokeWidth="1.8" />
                <InductorH
                  x={380}
                  y={195}
                  label={`L2=${state.Lpfc_uH}µH`}
                  sublabel="Neg Half-Cycle"
                  color="#10b981"
                />
                <line x1="404" y1="195" x2="620" y2="195" stroke="#10b981" strokeWidth="1.8" />

                {/* DC Bus Rails (+Vdc at y=55, DC_RTN at y=305) */}
                <line x1="515" y1="55" x2="1085" y2="55" stroke="#f59e0b" strokeWidth="2.4" />
                <line x1="515" y1="305" x2="1085" y2="305" stroke="currentColor" strokeWidth="2.2" />

                {/* Cell 1 (x=515): High-Side SiC Diode D1 (y=98) & Low-Side Switch Q1 (y=245) */}
                <line x1="515" y1="55" x2="515" y2="82" stroke="currentColor" strokeWidth="1.7" />
                <DiodeSymbol x={515} y={98} dir="up" isSchottky label="D1" sublabel="SiC" color="#f59e0b" />
                <line x1="515" y1="114" x2="515" y2="226" stroke="currentColor" strokeWidth="1.7" />
                <MosfetSymbol x={515} y={245} label="Q1" sublabel="Pos Boost" color="#06b6d4" scale={0.85} />
                <line x1="515" y1="264" x2="515" y2="305" stroke="currentColor" strokeWidth="1.7" />

                {/* Cell 2 (x=620): High-Side SiC Diode D2 (y=98) & Low-Side Switch Q2 (y=250) */}
                <line x1="620" y1="55" x2="620" y2="82" stroke="currentColor" strokeWidth="1.7" />
                <DiodeSymbol x={620} y={98} dir="up" isSchottky label="D2" sublabel="SiC" color="#f59e0b" />
                <line x1="620" y1="114" x2="620" y2="231" stroke="currentColor" strokeWidth="1.7" />
                <MosfetSymbol x={620} y={250} label="Q2" sublabel="Neg Boost" color="#10b981" scale={0.85} />
                <line x1="620" y1="269" x2="620" y2="305" stroke="currentColor" strokeWidth="1.7" />
                <circle cx="620" cy="55" r="3.2" fill="#f59e0b" />
                <circle cx="620" cy="305" r="3.2" fill="#94a3b8" />

                {/* Slow Common-Mode Clamping Return Diodes DR1 (x=715) & DR2 (x=780) */}
                <line x1="305" y1="145" x2="305" y2="222" stroke="#a855f7" strokeWidth="1.4" strokeDasharray="4 2" />
                <line x1="305" y1="222" x2="715" y2="222" stroke="#a855f7" strokeWidth="1.5" />
                <line x1="715" y1="222" x2="715" y2="239" stroke="currentColor" strokeWidth="1.6" />
                <DiodeSymbol x={715} y={255} dir="up" label="DR1" sublabel="Line Ret" color="#a855f7" />
                <line x1="715" y1="271" x2="715" y2="305" stroke="currentColor" strokeWidth="1.6" />
                <circle cx="715" cy="305" r="3" fill="#a855f7" />

                <line x1="325" y1="265" x2="675" y2="265" stroke="#a855f7" strokeWidth="1.5" />
                <line x1="675" y1="265" x2="675" y2="210" stroke="#a855f7" strokeWidth="1.5" />
                <line x1="675" y1="210" x2="780" y2="210" stroke="#a855f7" strokeWidth="1.5" />
                <line x1="780" y1="210" x2="780" y2="239" stroke="currentColor" strokeWidth="1.6" />
                <DiodeSymbol x={780} y={255} dir="up" label="DR2" sublabel="Neut Ret" color="#a855f7" />
                <line x1="780" y1="271" x2="780" y2="305" stroke="currentColor" strokeWidth="1.6" />
                <circle cx="780" cy="305" r="3" fill="#a855f7" />
              </g>
            )}

            {/* ============================================================== */}
            {/* 4. DETAILED DC-LINK BUS CAPACITOR NETWORK & CONNECTION POINTS  */}
            {/* ============================================================== */}
            {/* Positive Rail Label (+VDC_BUS) & Negative Rail Label (DC_RTN) */}
            <text x="875" y="48" fill="#f59e0b" fontSize="8" fontWeight="bold">
              +VDC_BUS ({state.Vdc_bus_V}V)
            </text>
            <text x="875" y="298" fill="#10b981" fontSize="8" fontWeight="bold">
              DC_RTN / STAR_GND
            </text>

            {/* Branch 4A: High-Frequency Film Decoupling Capacitor C_HF at x=890 */}
            <line x1="890" y1="55" x2="890" y2="152" stroke="#06b6d4" strokeWidth="1.7" />
            <CapacitorV
              x={890}
              y={174}
              label="C_HF"
              sublabel={`1.0µF Film (${res.ICdc_hf_rms_A.toFixed(1)}A)`}
              color="#06b6d4"
            />
            <line x1="890" y1="196" x2="890" y2="305" stroke="#06b6d4" strokeWidth="1.7" />
            <circle cx="890" cy="55" r="3.2" fill="#06b6d4" />
            <circle cx="890" cy="305" r="3.2" fill="#06b6d4" />
            <text x="882" y="72" textAnchor="end" fill="#67e8f9" fontSize="6.5">
              C_HF.1
            </text>
            <text x="882" y="290" textAnchor="end" fill="#67e8f9" fontSize="6.5">
              C_HF.2
            </text>

            {/* Branch 4B: Bulk Electrolytic Hold-Up Capacitor Bank (C_DC1..N) + Series ESR at x=965 */}
            <line x1="965" y1="55" x2="965" y2="132" stroke="#10b981" strokeWidth="1.9" />
            <text x="955" y="72" textAnchor="end" fill="#6ee7b7" fontSize="7" fontWeight="bold">
              +C_DC1..{res.capBankParallelCount}
            </text>
            <CapacitorV
              x={965}
              y={154}
              label={`Cdc=${state.Cdc_uF}µF`}
              sublabel={`${res.capBankParallelCount}× Cans (ΔV=${res.Vdc_ripple_pp_V.toFixed(1)}V)`}
              color="#10b981"
            />
            {/* Internal connection between C_DC ideal capacitance and series ESR_Cdc */}
            <line x1="965" y1="176" x2="965" y2="212" stroke="#10b981" strokeWidth="1.7" />
            <circle cx="965" cy="195" r="2.5" fill="#f59e0b" />
            <text x="974" y="198" fill="#fcd34d" fontSize="6.5">
              N_ESR (I_2f={res.ICdc_lf_rms_A.toFixed(1)}A)
            </text>
            {/* Series ESR resistor block */}
            <rect
              x="958"
              y="212"
              width="14"
              height="34"
              rx="2"
              fill="#0f172a"
              stroke="#f59e0b"
              strokeWidth="1.4"
            />
            <text x="977" y="228" fill="#f59e0b" fontSize="7" fontWeight="bold">
              ESR={state.ESR_Cdc_mOhm}mΩ
            </text>
            <text x="977" y="239" fill="#94a3b8" fontSize="6.5">
              Tc={res.capHotspot_C.toFixed(0)}°C
            </text>
            <line x1="965" y1="246" x2="965" y2="305" stroke="#10b981" strokeWidth="1.9" />
            <GroundSymbol x={965} y={305} />

            {/* Branch 4C: Output DC Bus Load Terminal (J_OUT) at x=1085 */}
            <line x1="1085" y1="55" x2="1085" y2="156" stroke="currentColor" strokeWidth="1.8" />
            <ResistorV
              x={1085}
              y={180}
              label={`Vdc=${state.Vdc_bus_V}V`}
              sublabel={`P=${(state.Pout_W / 1e3).toFixed(2)}kW`}
              color="#f59e0b"
            />
            <line x1="1085" y1="204" x2="1085" y2="305" stroke="currentColor" strokeWidth="1.8" />
            <circle cx="1085" cy="55" r="3.5" fill="#f59e0b" />
            <circle cx="1085" cy="305" r="3.5" fill="#10b981" />

            {/* Bus Capacitor Network Summary Box */}
            <rect x="873" y="308" width="259" height="22" rx="3" fill="#090D16" stroke="#1e293b" strokeWidth="1" />
            <text x="1002" y="322" textAnchor="middle" fill="#6ee7b7" fontSize="7.2" fontWeight="bold">
              BUS CAPS: C_HF(1µF) + {res.capBankParallelCount}×Bulk({state.Cdc_uF}µF) · t_hold={res.tHold_actual_ms.toFixed(1)}ms
            </text>

            {/* ============================================================== */}
            {/* 5. CLOSED-LOOP CONTROL, SOGI-PLL & SENSING PATHS               */}
            {/* ============================================================== */}
            {/* Vdc Feedback Sense Path from N9 (+VDC_BUS) */}
            <path
              d="M 1085 55 L 1148 55 L 1148 405 L 830 405"
              fill="none"
              stroke="#10b981"
              strokeWidth="1.3"
              strokeDasharray="4 3"
            />
            <text x="995" y="397" fill="#10b981" fontSize="8">
              Kelvin Vdc Sense ({state.Vdc_bus_V}V)
            </text>

            {/* Vac SOGI-PLL Phase Sense Path from Input Filter */}
            <path
              d="M 82 265 L 82 405 L 310 405"
              fill="none"
              stroke="#38bdf8"
              strokeWidth="1.3"
              strokeDasharray="4 3"
            />
            <text x="115" y="397" fill="#38bdf8" fontSize="8">
              Vac Differential Sense → SOGI-PLL (θ_grid)
            </text>

            {/* Control Loop Block at Bottom */}
            <rect
              x="310"
              y="356"
              width="520"
              height="98"
              rx="6"
              fill="#0f172a"
              stroke="#06b6d4"
              strokeWidth="1.8"
            />
            <text x="570" y="376" textAnchor="middle" fill="#06b6d4" fontSize="10.5" fontWeight="bold">
              PFC CONTROL SYNTHESIS: {state.controlType.toUpperCase()} + SOGI-PLL (fs={state.fs_ctrl_kHz} kHz)
            </text>
            <text x="570" y="393" textAnchor="middle" fill="#e2e8f0" fontSize="9">
              Inner I-Loop: fc,i={res.fc_i_actual_kHz.toFixed(2)} kHz (PM={res.pm_i_actual_deg.toFixed(1)}°) | Outer
              V-Loop: fc,v={res.fc_v_actual_Hz.toFixed(1)} Hz (PM={res.pm_v_actual_deg.toFixed(1)}°)
            </text>
            <text x="570" y="410" textAnchor="middle" fill="#38bdf8" fontSize="9">
              Kp,i={res.Kp_i.toFixed(4)} · Ki,i={res.Ki_i.toFixed(1)} | 2P2Z: b0={res.b0_i.toFixed(4)}, b1=
              {res.b1_i.toFixed(4)}, b2={res.b2_i.toFixed(4)}
            </text>
            <text x="570" y="427" textAnchor="middle" fill="#10b981" fontSize="8.5">
              η={res.efficiency_pct.toFixed(2)}% | Ploss={res.Ptotal_loss_W.toFixed(1)}W | Net Ripple ΔIin=
              {res.deltaIin_net_max_A.toFixed(2)}App (t_hold={res.tHold_actual_ms.toFixed(1)}ms)
            </text>
            <text x="570" y="443" textAnchor="middle" fill="#f59e0b" fontSize="8.5">
              PF = {res.powerFactor_true.toFixed(4)} · THDi = {res.THD_est_pct.toFixed(2)}% (IEC 61000-3-2 PASS) · Inrush E ={' '}
              {res.inrushEnergy_J.toFixed(1)}J
            </text>

            {/* ============================================================== */}
            {/* 6. INTERACTIVE CONNECTION POINT NODE PINS (N1..N10)            */}
            {/* ============================================================== */}
            {connectionNodes.map((node) => renderNodePin(node))}
          </svg>
        </div>
      </div>

      {/* Interactive Component Connection Point & Netlist Inspector Panel */}
      <div className="p-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/60 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-900 dark:text-[#eef0f5]">
              Component Connection Point &amp; Pin Netlist Inspector
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-600 dark:text-cyan-300 border border-cyan-500/30">
              Selected: {activeNode.code}
            </span>
          </div>
          <div className="flex flex-wrap gap-1">
            {connectionNodes.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => setSelectedNodeId(n.id)}
                className={`px-2 py-0.5 rounded text-[10px] font-mono transition-colors cursor-pointer ${
                  selectedNodeId === n.id
                    ? 'bg-cyan-600 text-white font-bold'
                    : n.stage === 'input-filter'
                    ? 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/20'
                    : n.stage === 'bus-cap'
                    ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/20'
                    : 'bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/30 hover:bg-purple-500/20'
                }`}
              >
                {n.code}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 text-xs font-mono">
          {/* Selected Node Pin Connections */}
          <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded p-3">
            <div className="text-[10px] uppercase text-slate-500 mb-1 flex items-center justify-between">
              <span>Active Node & Connected Component Pins</span>
              <span
                className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase"
                style={{
                  backgroundColor: `${activeNode.color}20`,
                  color: activeNode.color,
                }}
              >
                {activeNode.stage === 'input-filter'
                  ? 'Input EMI / Pre-Charge'
                  : activeNode.stage === 'bus-cap'
                  ? 'DC-Link Bus Capacitor'
                  : 'PFC Switching Core'}
              </span>
            </div>
            <div className="font-bold text-slate-900 dark:text-white mb-1.5">{activeNode.name}</div>
            <div className="flex flex-wrap gap-1.5">
              {activeNode.pins.map((pin) => (
                <span
                  key={pin}
                  className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 text-[10px]"
                >
                  {pin}
                </span>
              ))}
            </div>
          </div>

          {/* Live Electrical Telemetry at Node */}
          <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded p-3">
            <div className="text-[10px] uppercase text-slate-500 mb-1">
              Live Node Electrical Telemetry
            </div>
            <div className="text-cyan-600 dark:text-cyan-400 font-bold mb-1.5">{activeNode.telemetry}</div>
            <div className="text-[11px] text-slate-600 dark:text-slate-400">
              {activeNode.stage === 'input-filter'
                ? `DM Corner: ${res.fc_dm_kHz.toFixed(1)} kHz | EMI Fund: ${res.f_emi_fundamental_kHz.toFixed(0)} kHz | Required Atten: ${res.RequiredAtt_dB.toFixed(1)} dB`
                : activeNode.stage === 'bus-cap'
                ? `100Hz Equiv Stress: ${res.ICdc_freq_weighted_100Hz_A.toFixed(2)} Arms | Cap Loss: ${res.Pcap_W.toFixed(2)} W`
                : `Fast Switch Loss: ${(res.Psw_total_W + res.Pcond_fast_W).toFixed(1)} W | Inductor Loss: ${(res.Pind_cu_W + res.Pind_core_W).toFixed(1)} W`}
            </div>
          </div>

          {/* Hardware Layout & Parasitic Inductance Rule */}
          <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded p-3">
            <div className="text-[10px] uppercase text-amber-600 dark:text-amber-400 font-bold mb-1">
              PCB Layout & Connection Point Guideline
            </div>
            <p className="text-[11px] text-slate-700 dark:text-slate-300 leading-relaxed">
              {activeNode.layoutRule}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};


