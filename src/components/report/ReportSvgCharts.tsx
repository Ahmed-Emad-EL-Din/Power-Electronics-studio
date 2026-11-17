import React from 'react';
import { DcDcResults } from '../../engine/dcdcEngine';
import { AcDcResults } from '../../engine/acdcEngine';
import { computeWindowAnalysis, GapStrategyMode } from '../WindingWindowVisualizer';
import { CORE_DATABASE, DcDcDesignState } from '../../data/databases';

const AWG_DIAM_MM: Record<number, number> = {
  36: 0.127,
  38: 0.1016,
  40: 0.0787,
  42: 0.0635,
  44: 0.0508,
};

function fmtNum(v: number, digits = 1): string {
  if (!Number.isFinite(v)) return '0';
  return Math.abs(v) >= 1000 ? v.toFixed(0) : v.toFixed(digits);
}

// ----------------------------------------------------------------------------
// 1. DC-DC SWITCHING WAVEFORMS (V_pri, I_pri, V_sec, I_Lo)
// ----------------------------------------------------------------------------
export const ReportDcDcWaveformsSvg: React.FC<{ res: DcDcResults }> = ({ res }) => {
  const pts = res.waveforms;
  if (!pts || pts.length < 2) return null;

  const W = 740;
  const H = 260;
  const padL = 56;
  const padR = 54;
  const padT = 28;
  const padB = 34;
  const cw = W - padL - padR;
  const ch = H - padT - padB;

  const tMin = pts[0].t_us;
  const tMax = pts[pts.length - 1].t_us || 1;
  const vMax = Math.max(50, ...pts.map((p) => Math.max(Math.abs(p.v_pri_V), Math.abs(p.v_sec_V)))) * 1.12;
  const iMax = Math.max(1, ...pts.map((p) => Math.max(Math.abs(p.i_pri_A), Math.abs(p.i_lo_A)))) * 1.15;

  const xOf = (t: number) => padL + ((t - tMin) / Math.max(1e-6, tMax - tMin)) * cw;
  const yVOf = (v: number) => padT + ch / 2 - (v / vMax) * (ch * 0.44);
  const yIOf = (i: number) => padT + ch / 2 - (i / iMax) * (ch * 0.44);

  const pathVpri = pts.map((p, idx) => `${idx === 0 ? 'M' : 'L'}${xOf(p.t_us).toFixed(1)},${yVOf(p.v_pri_V).toFixed(1)}`).join(' ');
  const pathIpri = pts.map((p, idx) => `${idx === 0 ? 'M' : 'L'}${xOf(p.t_us).toFixed(1)},${yIOf(p.i_pri_A).toFixed(1)}`).join(' ');
  const pathIlo = pts.map((p, idx) => `${idx === 0 ? 'M' : 'L'}${xOf(p.t_us).toFixed(1)},${yIOf(p.i_lo_A).toFixed(1)}`).join(' ');

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-white border border-slate-200 rounded">
      <text x={padL} y={17} fontSize="11" fontWeight="700" fill="#0f172a" fontFamily="IBM Plex Sans, sans-serif">
        Switching Cycle Waveforms — Primary V_pri(t), Tank I_pri(t) &amp; Output Current I_Lo(t)
      </text>
      {/* Grid */}
      {[-1, -0.5, 0, 0.5, 1].map((frac, i) => {
        const y = padT + ch / 2 - frac * (ch * 0.44);
        return (
          <g key={i}>
            <line x1={padL} y1={y} x2={W - padR} y2={y} stroke={frac === 0 ? '#94a3b8' : '#e2e8f0'} strokeWidth={frac === 0 ? 1.1 : 0.7} />
            <text x={padL - 6} y={y + 3} textAnchor="end" fontSize="9" fill="#475569" fontFamily="IBM Plex Mono, monospace">
              {fmtNum(frac * vMax, 0)}V
            </text>
            <text x={W - padR + 6} y={y + 3} textAnchor="start" fontSize="9" fill="#0e7490" fontFamily="IBM Plex Mono, monospace">
              {fmtNum(frac * iMax, 1)}A
            </text>
          </g>
        );
      })}
      {[0, 0.25, 0.5, 0.75, 1].map((frac, i) => {
        const t = tMin + frac * (tMax - tMin);
        const x = xOf(t);
        return (
          <g key={i}>
            <line x1={x} y1={padT} x2={x} y2={H - padB} stroke="#e2e8f0" strokeWidth="0.7" />
            <text x={x} y={H - padB + 13} textAnchor="middle" fontSize="9" fill="#475569" fontFamily="IBM Plex Mono, monospace">
              {t.toFixed(1)} µs
            </text>
          </g>
        );
      })}
      <rect x={padL} y={padT} width={cw} height={ch} fill="none" stroke="#cbd5e1" strokeWidth="1" />
      <path d={pathVpri} fill="none" stroke="#0891b2" strokeWidth="1.9" />
      <path d={pathIpri} fill="none" stroke="#d97706" strokeWidth="1.8" />
      <path d={pathIlo} fill="none" stroke="#059669" strokeWidth="1.6" strokeDasharray="4 2.5" />
      {/* Legend */}
      <g transform={`translate(${padL}, ${H - 10})`} fontSize="9.5" fontFamily="IBM Plex Mono, monospace">
        <line x1="0" y1="-3" x2="16" y2="-3" stroke="#0891b2" strokeWidth="2.2" />
        <text x="20" y="0" fill="#0f172a">V_pri(t) [V]</text>
        <line x1="120" y1="-3" x2="136" y2="-3" stroke="#d97706" strokeWidth="2.2" />
        <text x="140" y="0" fill="#0f172a">I_pri(t) [A]</text>
        <line x1="240" y1="-3" x2="256" y2="-3" stroke="#059669" strokeWidth="2.0" strokeDasharray="4 2.5" />
        <text x="260" y="0" fill="#0f172a">I_Lo(t) [A]</text>
      </g>
    </svg>
  );
};

// ----------------------------------------------------------------------------
// 2. B-H HYSTERESIS LOOP & SATURATION ENVELOPE
// ----------------------------------------------------------------------------
export const ReportBhLoopSvg: React.FC<{ res: DcDcResults }> = ({ res }) => {
  const { majorCurve, minorLoop, Bsat_100C_mT, Bpk_mT, H_pk_Am } = res.bhLoopAnalysis;
  const W = 740;
  const H = 250;
  const padL = 56;
  const padR = 24;
  const padT = 28;
  const padB = 34;
  const cw = W - padL - padR;
  const ch = H - padT - padB;

  const hLimit = Math.max(120, ...majorCurve.map((p) => Math.abs(p.H_Am))) * 1.05;
  const bLimit = Math.max(460, Bsat_100C_mT * 1.25);

  const xOf = (h: number) => padL + ((h + hLimit) / (2 * hLimit)) * cw;
  const yOf = (b: number) => padT + ch - ((b + bLimit) / (2 * bLimit)) * ch;

  const upPath = majorCurve
    .map((p, idx) => `${idx === 0 ? 'M' : 'L'}${xOf(p.H_Am).toFixed(1)},${yOf(p.B_major_up_100C_mT).toFixed(1)}`)
    .join(' ');
  const downPath = [...majorCurve]
    .reverse()
    .map((p, idx) => `${idx === 0 ? 'M' : 'L'}${xOf(p.H_Am).toFixed(1)},${yOf(p.B_major_down_100C_mT).toFixed(1)}`)
    .join(' ');
  const minorPath =
    minorLoop.map((p, idx) => `${idx === 0 ? 'M' : 'L'}${xOf(p.H_Am).toFixed(1)},${yOf(p.B_mT).toFixed(1)}`).join(' ') +
    ' Z';

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-white border border-slate-200 rounded">
      <text x={padL} y={17} fontSize="11" fontWeight="700" fill="#0f172a" fontFamily="IBM Plex Sans, sans-serif">
        B–H Hysteresis Characteristics at 100°C — Major Envelope vs Operating Minor Loop
      </text>
      {/* Zero axes */}
      <line x1={padL} y1={yOf(0)} x2={W - padR} y2={yOf(0)} stroke="#94a3b8" strokeWidth="1" />
      <line x1={xOf(0)} y1={padT} x2={xOf(0)} y2={H - padB} stroke="#94a3b8" strokeWidth="1" />
      {/* Saturation ceilings */}
      <line x1={padL} y1={yOf(Bsat_100C_mT)} x2={W - padR} y2={yOf(Bsat_100C_mT)} stroke="#e11d48" strokeWidth="1.2" strokeDasharray="5 3" />
      <text x={padL + 6} y={yOf(Bsat_100C_mT) - 4} fontSize="9" fill="#e11d48" fontFamily="IBM Plex Mono, monospace" fontWeight="600">
        +B_sat(100°C) = {Bsat_100C_mT.toFixed(0)} mT
      </text>
      <line x1={padL} y1={yOf(-Bsat_100C_mT)} x2={W - padR} y2={yOf(-Bsat_100C_mT)} stroke="#e11d48" strokeWidth="1.2" strokeDasharray="5 3" />

      {/* Y labels */}
      {[-400, -200, 0, 200, 400].map((b) => (
        <text key={b} x={padL - 6} y={yOf(b) + 3} textAnchor="end" fontSize="9" fill="#475569" fontFamily="IBM Plex Mono, monospace">
          {b}
        </text>
      ))}
      <text x={14} y={padT + ch / 2} transform={`rotate(-90 14 ${padT + ch / 2})`} textAnchor="middle" fontSize="9" fill="#475569" fontFamily="IBM Plex Mono, monospace">
        B [mT]
      </text>
      <rect x={padL} y={padT} width={cw} height={ch} fill="none" stroke="#cbd5e1" strokeWidth="1" />

      <path d={upPath} fill="none" stroke="#64748b" strokeWidth="1.5" />
      <path d={downPath} fill="none" stroke="#64748b" strokeWidth="1.5" strokeDasharray="3 2" />
      <path d={minorPath} fill="#0891b2" fillOpacity="0.18" stroke="#0891b2" strokeWidth="2.2" />

      {/* Operating peak point */}
      <circle cx={xOf(H_pk_Am)} cy={yOf(Bpk_mT)} r="4" fill="#d97706" stroke="#ffffff" strokeWidth="1" />
      <text x={Math.min(W - padR - 140, xOf(H_pk_Am) + 8)} y={yOf(Bpk_mT) - 6} fontSize="9.5" fontWeight="700" fill="#b45309" fontFamily="IBM Plex Mono, monospace">
        Op: ±{Bpk_mT.toFixed(1)} mT @ {H_pk_Am.toFixed(1)} A/m
      </text>
      <text x={W / 2} y={H - 8} textAnchor="middle" fontSize="9.5" fill="#475569" fontFamily="IBM Plex Mono, monospace">
        Magnetic Field Strength H [A/m] (Range: ±{hLimit.toFixed(0)} A/m)
      </text>
    </svg>
  );
};

// ----------------------------------------------------------------------------
// 3. CORE THERMAL EQUILIBRIUM & LOSS VS TEMPERATURE
// ----------------------------------------------------------------------------
export const ReportCoreThermalSvg: React.FC<{ res: DcDcResults }> = ({ res }) => {
  const pts = res.coreThermalAnalysis.tempEquilibriumSweep;
  if (!pts || pts.length < 2) return null;
  const W = 740;
  const H = 225;
  const padL = 54;
  const padR = 54;
  const padT = 26;
  const padB = 34;
  const cw = W - padL - padR;
  const ch = H - padT - padB;

  const tMin = pts[0].x;
  const tMax = pts[pts.length - 1].x;
  const yMax = Math.max(20, ...pts.map((p) => Math.max(p.y1, p.y2))) * 1.1;

  const xOf = (t: number) => padL + ((t - tMin) / Math.max(1, tMax - tMin)) * cw;
  const yOf = (p: number) => padT + ch - (p / yMax) * ch;

  const pGenPath = pts.map((p, idx) => `${idx === 0 ? 'M' : 'L'}${xOf(p.x).toFixed(1)},${yOf(p.y1).toFixed(1)}`).join(' ');
  const pCapPath = pts.map((p, idx) => `${idx === 0 ? 'M' : 'L'}${xOf(p.x).toFixed(1)},${yOf(p.y2).toFixed(1)}`).join(' ');

  const tOp = Math.min(tMax, Math.max(tMin, res.coreThermalAnalysis.Tcore_hotspot_C));
  const pOp = res.coreThermalAnalysis.Pmag_total_W;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-white border border-slate-200 rounded">
      <text x={padL} y={17} fontSize="11" fontWeight="700" fill="#0f172a" fontFamily="IBM Plex Sans, sans-serif">
        Steinmetz Core Thermal Equilibrium — Heat Generated P_mag(T) vs Natural/Forced Cooling Capacity
      </text>
      {[0, 0.25, 0.5, 0.75, 1].map((f, i) => {
        const y = padT + ch - f * ch;
        return (
          <g key={i}>
            <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="#e2e8f0" strokeWidth="0.7" />
            <text x={padL - 6} y={y + 3} textAnchor="end" fontSize="9" fill="#475569" fontFamily="IBM Plex Mono, monospace">
              {(f * yMax).toFixed(0)}W
            </text>
          </g>
        );
      })}
      {[40, 60, 80, 100, 120, 140, 160].filter((t) => t >= tMin && t <= tMax).map((t) => (
        <g key={t}>
          <line x1={xOf(t)} y1={padT} x2={xOf(t)} y2={H - padB} stroke="#e2e8f0" strokeWidth="0.7" />
          <text x={xOf(t)} y={H - padB + 13} textAnchor="middle" fontSize="9" fill="#475569" fontFamily="IBM Plex Mono, monospace">
            {t}°C
          </text>
        </g>
      ))}
      <line x1={xOf(125)} y1={padT} x2={xOf(125)} y2={H - padB} stroke="#e11d48" strokeWidth="1.2" strokeDasharray="4 3" />
      <text x={xOf(125) + 4} y={padT + 12} fontSize="8.5" fill="#e11d48" fontFamily="IBM Plex Mono, monospace" fontWeight="600">
        125°C Limit
      </text>
      <rect x={padL} y={padT} width={cw} height={ch} fill="none" stroke="#cbd5e1" strokeWidth="1" />
      <path d={pGenPath} fill="none" stroke="#d97706" strokeWidth="2.1" />
      <path d={pCapPath} fill="none" stroke="#0891b2" strokeWidth="2.0" strokeDasharray="5 3" />
      <circle cx={xOf(tOp)} cy={yOf(pOp)} r="4.5" fill={tOp > 125 ? '#e11d48' : '#059669'} stroke="#ffffff" strokeWidth="1.2" />
      <text x={Math.min(W - padR - 140, xOf(tOp) + 8)} y={Math.max(padT + 14, yOf(pOp) - 6)} fontSize="9.5" fontWeight="700" fill={tOp > 125 ? '#e11d48' : '#059669'} fontFamily="IBM Plex Mono, monospace">
        T_hot = {res.coreThermalAnalysis.Tcore_hotspot_C.toFixed(1)}°C ({pOp.toFixed(1)}W)
      </text>
      <g transform={`translate(${padL}, ${H - 8})`} fontSize="9" fontFamily="IBM Plex Mono, monospace">
        <line x1="0" y1="-3" x2="14" y2="-3" stroke="#d97706" strokeWidth="2.1" />
        <text x="18" y="0" fill="#0f172a">Total Mag Loss P_core+P_cu [W]</text>
        <line x1="215" y1="-3" x2="229" y2="-3" stroke="#0891b2" strokeWidth="2" strokeDasharray="5 3" />
        <text x="233" y="0" fill="#0f172a">Heat Dissipation Limit (T−Tamb)/R_th</text>
      </g>
    </svg>
  );
};

// ----------------------------------------------------------------------------
// 4. BOBBIN WINDING WINDOW RADIAL BUILD CROSS-SECTION
// ----------------------------------------------------------------------------
export const ReportWindowCrossSectionSvg: React.FC<{ state: DcDcDesignState; res: DcDcResults }> = ({ state, res }) => {
  const core = CORE_DATABASE.find((c) => c.id === state.coreId) || res.core;
  const marginTape = state.Vin_nom_V >= 300 ? 3.0 : state.Vin_nom_V >= 150 ? 2.5 : 1.5;
  const bobbin = core.Ve_mm3 >= 30000 ? 1.3 : core.Ve_mm3 >= 12000 ? 1.1 : 0.9;
  const gapMode: GapStrategyMode = res.airGap_mm >= 0.45 ? 'distributed-multigap' : 'local-notch';

  const win = computeWindowAnalysis({
    core,
    Vin_nom_V: state.Vin_nom_V,
    interleaving: state.interleaving,
    txType: state.txType,
    Np: res.Np_actual,
    Ns_single: res.Ns_actual,
    priStrands: state.priStrands,
    secStrands: state.secStrands,
    strandDiam_mm: AWG_DIAM_MM[state.litzStrandAWG] || 0.1016,
    insulationThickness_mm: state.insulationThickness_mm,
    airGap_mm: res.airGap_mm,
    I_pri_pk: res.I_lead_turnoff_A,
    Pcu_W: res.Pcu_W,
    marginTape_mm: marginTape,
    bobbinThickness_mm: bobbin,
    conductorForm: 'auto-parallel',
    gapStrategy: gapMode,
  });

  const W = 740;
  const H = 220;
  const winX = 70;
  const winY = 44;
  const winW = 430;
  const winH = 128;

  const pxPerMmY = winH / Math.max(win.hw_mm, win.totalRadialBuild_mm * 1.05);
  const marginFrac = Math.min(0.18, marginTape / Math.max(4, win.bw_mm));
  const coilX = winX + winW * marginFrac;
  const coilW = winW * (1 - 2 * marginFrac);

  let yCursor = winY + winH;
  const bobbinBandPx = Math.max(5, win.budget.bobbin_mm * pxPerMmY);
  const bobbinTop = yCursor - bobbinBandPx;
  yCursor = bobbinTop;

  const bands = win.layers.map((layer) => {
    const hPx = Math.max(4, layer.bundleDiam_mm * pxPerMmY);
    const yTop = yCursor - hPx;
    yCursor = yTop;
    const fill = layer.role === 'primary' ? '#0891b2' : '#059669';
    return { ...layer, yTop, hPx, fill };
  });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-white border border-slate-200 rounded">
      <text x={winX} y={20} fontSize="11" fontWeight="700" fill="#0f172a" fontFamily="IBM Plex Sans, sans-serif">
        Bobbin Winding Window Radial Stack-Up — {core.name} ({state.interleaving})
      </text>

      {/* Margin Tape Bands */}
      <rect x={winX} y={winY} width={winW} height={winH} fill="#f8fafc" stroke="#334155" strokeWidth="1.5" />
      <rect x={winX} y={winY} width={winW * marginFrac} height={winH} fill="#fef3c7" stroke="#f59e0b" strokeWidth="0.7" />
      <rect x={coilX + coilW} y={winY} width={winW * marginFrac} height={winH} fill="#fef3c7" stroke="#f59e0b" strokeWidth="0.7" />

      {/* Bobbin Wall Slab */}
      <rect
        x={winX}
        y={bobbinTop}
        width={winW}
        height={bobbinBandPx}
        fill="#64748b"
        fillOpacity={0.8}
        stroke="#ffffff"
        strokeWidth="0.5"
      />
      {bobbinBandPx >= 8 && (
        <text x={coilX + coilW / 2} y={bobbinTop + bobbinBandPx / 2 + 3} textAnchor="middle" fontSize="8" fontWeight="600" fill="#ffffff" fontFamily="IBM Plex Mono, monospace">
          Bobbin Former ({win.budget.bobbin_mm.toFixed(2)}mm)
        </text>
      )}

      {/* Winding Stack */}
      {bands.map((b, i) => (
        <g key={i}>
          <rect
            x={coilX}
            y={b.yTop}
            width={coilW}
            height={b.hPx}
            fill={b.fill}
            fillOpacity={0.82}
            stroke="#ffffff"
            strokeWidth="0.5"
          />
          {b.hPx >= 9 && (
            <text x={coilX + coilW / 2} y={b.yTop + b.hPx / 2 + 3} textAnchor="middle" fontSize="8" fontWeight="600" fill="#ffffff" fontFamily="IBM Plex Mono, monospace">
              {b.label} ({b.turns}T · {b.bundleDiam_mm.toFixed(2)}mm)
            </text>
          )}
        </g>
      ))}

      {/* Core Top Ceiling Line */}
      <line x1={winX - 8} y1={winY} x2={winX + winW + 8} y2={winY} stroke={win.fitsInWindow ? '#059669' : '#e11d48'} strokeWidth="1.6" strokeDasharray="5 3" />
      <text x={winX - 10} y={winY + 4} textAnchor="end" fontSize="8.5" fontWeight="700" fill={win.fitsInWindow ? '#059669' : '#e11d48'} fontFamily="IBM Plex Mono, monospace">
        h_w={win.hw_mm.toFixed(1)}mm
      </text>

      {/* Summary Readout Column on Right */}
      <g transform="translate(520, 48)" fontSize="9.5" fontFamily="IBM Plex Mono, monospace" fill="#0f172a">
        <text y="0" fontWeight="700" fill="#0e7490">WINDOW BUDGET</text>
        <text y="18">Bobbin bw × hw: {win.bw_mm.toFixed(1)} × {win.hw_mm.toFixed(1)} mm</text>
        <text y="34">Radial Build:   {win.totalRadialBuild_mm.toFixed(2)} mm</text>
        <text y="50" fill={win.fitsInWindow ? '#059669' : '#e11d48'} fontWeight="700">
          Radial Fill:    {win.radialFill_pct.toFixed(1)}% ({win.fitsInWindow ? 'FITS' : 'OVERFLOW'})
        </text>
        <text y="66">Creepage:       {win.actualCreepage_mm.toFixed(1)} / {win.reqCreepage_mm.toFixed(1)} mm</text>
        <text y="82">Margin Tape:    {marginTape.toFixed(1)} mm/side</text>
        <text y="98">Strand Ø:       {(AWG_DIAM_MM[state.litzStrandAWG] || 0.1016).toFixed(3)} mm (AWG{state.litzStrandAWG})</text>
      </g>

      <text x={winX + winW / 2} y={H - 12} textAnchor="middle" fontSize="9" fill="#475569" fontFamily="IBM Plex Mono, monospace">
        Active Width b_eff = {win.b_eff_mm.toFixed(1)} mm · Total Winding Width bw = {win.bw_mm.toFixed(1)} mm
      </text>
    </svg>
  );
};

// ----------------------------------------------------------------------------
// 5. EFFICIENCY CURVE & LOSS BREAKDOWN BAR CHART (DC-DC)
// ----------------------------------------------------------------------------
export const ReportDcDcEfficiencySvg: React.FC<{ res: DcDcResults }> = ({ res }) => {
  const pts = res.efficiencySweep;
  if (!pts || pts.length < 2) return null;
  const W = 740;
  const H = 225;

  // Left half: Efficiency curve
  const padL = 48;
  const padT = 28;
  const cw = 320;
  const ch = 158;
  const yMin = Math.max(70, Math.floor(Math.min(...pts.map((p) => p.y1)) / 2) * 2 - 2);
  const yMax = 100;
  const xOf = (load: number) => padL + ((load - 10) / 90) * cw;
  const yOf = (eff: number) => padT + ch - ((eff - yMin) / Math.max(1, yMax - yMin)) * ch;
  const effPath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(p.x).toFixed(1)},${yOf(p.y1).toFixed(1)}`).join(' ');

  // Right half: Loss breakdown horizontal bars
  const pPriTot = res.Pcond_pri_W + res.Psw_pri_W;
  const pSecTot = res.Pcond_sec_W + res.Psnub_W;
  const pOther = Math.max(0.5, res.Ptotal_loss_W - pPriTot - pSecTot - res.Pcore_W - res.Pcu_W);
  const bars = [
    { label: 'Pri FETs (Cond+Sw)', val: pPriTot, color: '#0891b2' },
    { label: 'Sec SRs + Snub', val: pSecTot, color: '#059669' },
    { label: 'Tx Copper (Dowell)', val: res.Pcu_W, color: '#d97706' },
    { label: 'Tx Core (iGSE)', val: res.Pcore_W, color: '#e11d48' },
    { label: 'Gate / Out Choke', val: pOther, color: '#6366f1' },
  ];
  const barMax = Math.max(5, ...bars.map((b) => b.val));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-white border border-slate-200 rounded">
      <text x={padL} y={17} fontSize="11" fontWeight="700" fill="#0f172a" fontFamily="IBM Plex Sans, sans-serif">
        DC-DC Efficiency Load Curve &amp; Component Power Loss Breakdown (Total P_loss = {res.Ptotal_loss_W.toFixed(1)} W)
      </text>

      {/* Left Plot */}
      {[yMin, (yMin + 100) / 2, 100].map((v, i) => (
        <g key={i}>
          <line x1={padL} y1={yOf(v)} x2={padL + cw} y2={yOf(v)} stroke="#e2e8f0" strokeWidth="0.7" />
          <text x={padL - 5} y={yOf(v) + 3} textAnchor="end" fontSize="8.5" fill="#475569" fontFamily="IBM Plex Mono, monospace">
            {v.toFixed(0)}%
          </text>
        </g>
      ))}
      {[10, 25, 50, 75, 100].map((l) => (
        <g key={l}>
          <line x1={xOf(l)} y1={padT} x2={xOf(l)} y2={padT + ch} stroke="#e2e8f0" strokeWidth="0.7" />
          <text x={xOf(l)} y={padT + ch + 12} textAnchor="middle" fontSize="8.5" fill="#475569" fontFamily="IBM Plex Mono, monospace">
            {l}%
          </text>
        </g>
      ))}
      <rect x={padL} y={padT} width={cw} height={ch} fill="none" stroke="#cbd5e1" strokeWidth="1" />
      <path d={effPath} fill="none" stroke="#0891b2" strokeWidth="2.2" />
      <circle cx={xOf(100)} cy={yOf(res.efficiency_pct)} r="4" fill="#059669" />
      <text x={xOf(100) - 6} y={yOf(res.efficiency_pct) - 8} textAnchor="end" fontSize="9.5" fontWeight="700" fill="#059669" fontFamily="IBM Plex Mono, monospace">
        η = {res.efficiency_pct.toFixed(2)}%
      </text>
      <text x={padL + cw / 2} y={H - 8} textAnchor="middle" fontSize="9" fill="#475569" fontFamily="IBM Plex Mono, monospace">
        Output Load Percentage [%]
      </text>

      {/* Right Bars */}
      <g transform="translate(415, 36)">
        {bars.map((b, idx) => {
          const y = idx * 31;
          const bw = (b.val / barMax) * 195;
          return (
            <g key={b.label} transform={`translate(0, ${y})`}>
              <text x="0" y="10" fontSize="9" fill="#334155" fontFamily="IBM Plex Sans, sans-serif" fontWeight="600">
                {b.label}
              </text>
              <rect x="0" y="14" width="195" height="9" rx="2" fill="#f1f5f9" />
              <rect x="0" y="14" width={Math.max(3, bw)} height="9" rx="2" fill={b.color} />
              <text x="202" y="21.5" fontSize="9" fontWeight="700" fill="#0f172a" fontFamily="IBM Plex Mono, monospace">
                {b.val.toFixed(1)} W ({((b.val / Math.max(0.1, res.Ptotal_loss_W)) * 100).toFixed(0)}%)
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
};

// ----------------------------------------------------------------------------
// 6. CONTROL LOOP BODE PLOT (MAGNITUDE dB + PHASE deg)
// ----------------------------------------------------------------------------
export const ReportBodeSvg: React.FC<{
  title: string;
  points: { freq_Hz: number; mag_dB: number; phase_deg: number }[];
  fc_Hz: number;
  pm_deg: number;
}> = ({ title, points, fc_Hz, pm_deg }) => {
  if (!points || points.length < 2) return null;
  const W = 740;
  const H = 225;
  const padL = 52;
  const padR = 52;
  const padT = 28;
  const padB = 34;
  const cw = W - padL - padR;
  const ch = H - padT - padB;

  const logMin = Math.log10(Math.max(1, points[0].freq_Hz));
  const logMax = Math.log10(Math.max(10, points[points.length - 1].freq_Hz));

  const rawMaxDb = Math.max(...points.map((p) => p.mag_dB));
  const rawMinDb = Math.min(...points.map((p) => p.mag_dB));
  const magMax = Math.min(120, Math.max(40, Math.ceil(rawMaxDb / 20) * 20));
  const magMin = Math.max(-80, Math.min(-40, Math.floor(rawMinDb / 20) * 20));
  const magSpan = Math.max(40, magMax - magMin);

  const rawMinPh = Math.min(...points.map((p) => p.phase_deg));
  const phMin = rawMinPh < -180 ? -225 : -180;
  const phSpan = Math.abs(phMin);

  const xOf = (f: number) =>
    padL + ((Math.log10(Math.max(1, f)) - logMin) / Math.max(0.1, logMax - logMin)) * cw;
  const yMagOf = (db: number) =>
    padT + ((magMax - Math.max(magMin, Math.min(magMax, db))) / magSpan) * ch;
  const yPhOf = (deg: number) =>
    padT + ((0 - Math.max(phMin, Math.min(0, deg))) / phSpan) * ch;

  const magTicks: number[] = [];
  for (let db = magMin; db <= magMax; db += 20) magTicks.push(db);
  const phTicks = phMin === -225 ? [0, -45, -90, -135, -180, -225] : [0, -45, -90, -135, -180];

  const magPath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(p.freq_Hz).toFixed(1)},${yMagOf(p.mag_dB).toFixed(1)}`).join(' ');
  const phPath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(p.freq_Hz).toFixed(1)},${yPhOf(p.phase_deg).toFixed(1)}`).join(' ');

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-white border border-slate-200 rounded">
      <text x={padL} y={17} fontSize="11" fontWeight="700" fill="#0f172a" fontFamily="IBM Plex Sans, sans-serif">
        {title} (f_c = {fc_Hz >= 1000 ? `${(fc_Hz / 1000).toFixed(1)} kHz` : `${fc_Hz.toFixed(1)} Hz`} · PM = {pm_deg.toFixed(1)}°)
      </text>

      {magTicks.map((db) => (
        <g key={db}>
          <line x1={padL} y1={yMagOf(db)} x2={W - padR} y2={yMagOf(db)} stroke={db === 0 ? '#94a3b8' : '#e2e8f0'} strokeWidth={db === 0 ? 1.1 : 0.7} />
          <text x={padL - 5} y={yMagOf(db) + 3} textAnchor="end" fontSize="8.5" fill="#0891b2" fontFamily="IBM Plex Mono, monospace">
            {db}dB
          </text>
        </g>
      ))}
      {phTicks.map((deg) => (
        <text key={deg} x={W - padR + 5} y={yPhOf(deg) + 3} textAnchor="start" fontSize="8.5" fill="#d97706" fontFamily="IBM Plex Mono, monospace">
          {deg}°
        </text>
      ))}
      <line x1={xOf(fc_Hz)} y1={padT} x2={xOf(fc_Hz)} y2={H - padB} stroke="#059669" strokeWidth="1.2" strokeDasharray="4 3" />
      <rect x={padL} y={padT} width={cw} height={ch} fill="none" stroke="#cbd5e1" strokeWidth="1" />
      <path d={magPath} fill="none" stroke="#0891b2" strokeWidth="2.1" />
      <path d={phPath} fill="none" stroke="#d97706" strokeWidth="1.9" strokeDasharray="4 2" />

      <g transform={`translate(${padL}, ${H - 8})`} fontSize="9" fontFamily="IBM Plex Mono, monospace">
        <line x1="0" y1="-3" x2="14" y2="-3" stroke="#0891b2" strokeWidth="2.1" />
        <text x="18" y="0" fill="#0f172a">Open-Loop Gain |T(jf)| [dB]</text>
        <line x1="205" y1="-3" x2="219" y2="-3" stroke="#d97706" strokeWidth="1.9" strokeDasharray="4 2" />
        <text x="223" y="0" fill="#0f172a">Phase ∠T(jf) [°]</text>
        <text x="375" y="0" fill="#059669" fontWeight="700">Crossover f_c · PM={pm_deg.toFixed(1)}°</text>
      </g>
    </svg>
  );
};

// ----------------------------------------------------------------------------
// 7. AC-DC LINE CYCLE WAVEFORMS & RIPPLE CANCELLATION ENVELOPE
// ----------------------------------------------------------------------------
export const ReportAcDcLineSvg: React.FC<{ res: AcDcResults }> = ({ res }) => {
  const pts = res.lineAngleCurve;
  if (!pts || pts.length < 2) return null;
  const W = 740;
  const H = 230;
  const padL = 52;
  const padR = 52;
  const padT = 28;
  const padB = 34;
  const cw = W - padL - padR;
  const ch = H - padT - padB;

  const iMax = Math.max(10, ...pts.map((p) => p.i_ac_total_A)) * 1.15;
  const ripMax = Math.max(2, ...pts.map((p) => Math.max(p.dIL_1ph_A, p.dI_in_2ph_A))) * 1.2;

  const xOf = (deg: number) => padL + (deg / 180) * cw;
  const yIOf = (i: number) => padT + ch - (i / iMax) * ch;
  const yROf = (r: number) => padT + ch - (r / ripMax) * ch;

  const iPath = pts.map((p, idx) => `${idx === 0 ? 'M' : 'L'}${xOf(p.theta_deg).toFixed(1)},${yIOf(p.i_ac_total_A).toFixed(1)}`).join(' ');
  const r1Path = pts.map((p, idx) => `${idx === 0 ? 'M' : 'L'}${xOf(p.theta_deg).toFixed(1)},${yROf(p.dIL_1ph_A).toFixed(1)}`).join(' ');
  const rNetPath = pts.map((p, idx) => `${idx === 0 ? 'M' : 'L'}${xOf(p.theta_deg).toFixed(1)},${yROf(p.dI_in_2ph_A).toFixed(1)}`).join(' ');

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-white border border-slate-200 rounded">
      <text x={padL} y={17} fontSize="11" fontWeight="700" fill="#0f172a" fontFamily="IBM Plex Sans, sans-serif">
        PFC Half-Line Cycle — Sinusoidal Line Current i_in(θ) &amp; Interleaved Switching Ripple Envelope
      </text>
      {[0, 0.25, 0.5, 0.75, 1].map((f, i) => (
        <g key={i}>
          <line x1={padL} y1={padT + ch - f * ch} x2={W - padR} y2={padT + ch - f * ch} stroke="#e2e8f0" strokeWidth="0.7" />
          <text x={padL - 5} y={padT + ch - f * ch + 3} textAnchor="end" fontSize="8.5" fill="#0891b2" fontFamily="IBM Plex Mono, monospace">
            {(f * iMax).toFixed(0)}A
          </text>
          <text x={W - padR + 5} y={padT + ch - f * ch + 3} textAnchor="start" fontSize="8.5" fill="#d97706" fontFamily="IBM Plex Mono, monospace">
            {(f * ripMax).toFixed(1)}App
          </text>
        </g>
      ))}
      {[0, 45, 90, 135, 180].map((d) => (
        <g key={d}>
          <line x1={xOf(d)} y1={padT} x2={xOf(d)} y2={H - padB} stroke="#e2e8f0" strokeWidth="0.7" />
          <text x={xOf(d)} y={H - padB + 13} textAnchor="middle" fontSize="8.5" fill="#475569" fontFamily="IBM Plex Mono, monospace">
            {d}°
          </text>
        </g>
      ))}
      <rect x={padL} y={padT} width={cw} height={ch} fill="none" stroke="#cbd5e1" strokeWidth="1" />
      <path d={iPath} fill="none" stroke="#0891b2" strokeWidth="2.2" />
      <path d={r1Path} fill="none" stroke="#d97706" strokeWidth="1.6" strokeDasharray="4 2.5" />
      <path d={rNetPath} fill="none" stroke="#059669" strokeWidth="2.0" />
      <g transform={`translate(${padL}, ${H - 8})`} fontSize="9" fontFamily="IBM Plex Mono, monospace">
        <line x1="0" y1="-3" x2="14" y2="-3" stroke="#0891b2" strokeWidth="2.2" />
        <text x="18" y="0" fill="#0f172a">Line Current I_in(θ)</text>
        <line x1="150" y1="-3" x2="164" y2="-3" stroke="#d97706" strokeWidth="1.6" strokeDasharray="4 2.5" />
        <text x="168" y="0" fill="#0f172a">Phase ΔI_L</text>
        <line x1="255" y1="-3" x2="269" y2="-3" stroke="#059669" strokeWidth="2" />
        <text x="273" y="0" fill="#0f172a">Net Input Ripple ΔI_net</text>
      </g>
    </svg>
  );
};

// ----------------------------------------------------------------------------
// 8. AC-DC HARMONICS SPECTRUM VS IEC 61000-3-2 LIMITS
// ----------------------------------------------------------------------------
export const ReportHarmonicsSvg: React.FC<{ res: AcDcResults }> = ({ res }) => {
  const pts = res.harmonicSpectrum.slice(0, 12);
  if (!pts.length) return null;
  const W = 740;
  const H = 210;
  const padL = 50;
  const padR = 24;
  const padT = 26;
  const padB = 34;
  const cw = W - padL - padR;
  const ch = H - padT - padB;

  const yMax = Math.max(1, ...pts.map((p) => Math.max(p.In_rms_A, p.iecLimit_A))) * 1.15;
  const stepW = cw / pts.length;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-white border border-slate-200 rounded">
      <text x={padL} y={17} fontSize="11" fontWeight="700" fill="#0f172a" fontFamily="IBM Plex Sans, sans-serif">
        AC Input Current Harmonic Spectrum vs IEC 61000-3-2/12 Limits (THDi = {res.THD_est_pct.toFixed(2)}%)
      </text>
      {[0, 0.5, 1].map((f, i) => (
        <g key={i}>
          <line x1={padL} y1={padT + ch - f * ch} x2={W - padR} y2={padT + ch - f * ch} stroke="#e2e8f0" strokeWidth="0.7" />
          <text x={padL - 6} y={padT + ch - f * ch + 3} textAnchor="end" fontSize="8.5" fill="#475569" fontFamily="IBM Plex Mono, monospace">
            {(f * yMax).toFixed(2)}A
          </text>
        </g>
      ))}
      <rect x={padL} y={padT} width={cw} height={ch} fill="none" stroke="#cbd5e1" strokeWidth="1" />

      {pts.map((h, i) => {
        const cx = padL + i * stepW + stepW * 0.2;
        const barW = Math.max(8, stepW * 0.34);
        const hBar = (h.In_rms_A / yMax) * ch;
        const hLim = (h.iecLimit_A / yMax) * ch;
        return (
          <g key={h.order}>
            <rect x={cx} y={padT + ch - hBar} width={barW} height={hBar} fill={h.pass ? '#0891b2' : '#e11d48'} rx="1" />
            <rect x={cx + barW + 2} y={padT + ch - hLim} width={barW * 0.7} height={hLim} fill="#cbd5e1" rx="1" />
            <text x={cx + barW} y={padT + ch + 13} textAnchor="middle" fontSize="8.5" fill="#334155" fontFamily="IBM Plex Mono, monospace">
              H{h.order}
            </text>
          </g>
        );
      })}
      <g transform={`translate(${padL}, ${H - 8})`} fontSize="9" fontFamily="IBM Plex Mono, monospace">
        <rect x="0" y="-8" width="10" height="8" fill="#0891b2" />
        <text x="14" y="0" fill="#0f172a">Converter Harmonic I_n [A_rms]</text>
        <rect x="210" y="-8" width="10" height="8" fill="#cbd5e1" />
        <text x="224" y="0" fill="#0f172a">IEC Limit [A_rms]</text>
      </g>
    </svg>
  );
};
