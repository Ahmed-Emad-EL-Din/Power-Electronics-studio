import React, { useMemo, useState } from 'react';
import { AcDcDesignState, DcDcDesignState } from '../data/databases';
import { AcDcResults } from '../engine/acdcEngine';
import { DcDcResults } from '../engine/dcdcEngine';
import { runTransientLoadStep } from '../engine/transientOdeSolver';
import { runMonteCarloAnalysis } from '../engine/monteCarloEngine';
import {
  generateAcDcLtspiceAsc,
  generateAcDcPlecsBundle,
  generateAcDcPlecsModel,
  generateAcDcQspiceBundle,
  generateAcDcSpiceNetlist,
  generateCombinedSystemLtspiceAsc,
  generateCombinedSystemPlecsBundle,
  generateCombinedSystemPlecsModel,
  generateCombinedSystemQspiceBundle,
  generateCombinedSystemSpiceNetlist,
  generateControlFirmwareHeader,
  generateDcDcLtspiceAsc,
  generateDcDcPlecsBundle,
  generateDcDcPlecsModel,
  generateDcDcQspiceBundle,
  generateDcDcSpiceNetlist,
} from '../engine/spiceNetlistExporter';
import {
  getDefaultAcDcSimTimeMs,
  getDefaultCombinedSimTimeMs,
  getDefaultDcDcSimTimeUs,
  type ProjectOutputMode,
} from '../engine/systemCascadeEngine';
import { buildQspiceBinaryFile } from '../engine/zipBuilder';
import { OscilloscopeViewer } from './OscilloscopeViewer';
import { InteractiveChart } from './InteractiveChart';
import {
  Activity,
  Archive,
  BarChart3,
  Check,
  Clock,
  Code2,
  Copy,
  Download,
  Play,
  ShieldAlert,
  ShieldCheck,
  Zap,
} from 'lucide-react';

interface TransientAndMonteCarloLabProps {
  dcdcState: DcDcDesignState;
  dcdcRes: DcDcResults;
  pinnedDcdcRes?: DcDcResults | null;
  acdcState: AcDcDesignState;
  acdcRes: AcDcResults;
  outputMode?: ProjectOutputMode;
  sharedMcu?: boolean;
  dcdcSimTimeUs?: number;
  onChangeDcdcSimTimeUs?: (v: number | undefined) => void;
  acdcSimTimeMs?: number;
  onChangeAcdcSimTimeMs?: (v: number | undefined) => void;
  combinedSimTimeMs?: number;
  onChangeCombinedSimTimeMs?: (v: number | undefined) => void;
}

export const TransientAndMonteCarloLab: React.FC<TransientAndMonteCarloLabProps> = ({
  dcdcState,
  dcdcRes,
  pinnedDcdcRes,
  acdcState,
  acdcRes,
  outputMode = 'combined',
  sharedMcu = true,
  dcdcSimTimeUs: propDcdcSimUs,
  onChangeDcdcSimTimeUs,
  acdcSimTimeMs: propAcdcSimMs,
  onChangeAcdcSimTimeMs,
  combinedSimTimeMs: propCombinedSimMs,
  onChangeCombinedSimTimeMs,
}) => {
  // Transient Simulator Controls
  const [scenario, setScenario] = useState<'load-step' | 'soft-start'>('load-step');
  const [initLoad, setInitLoad] = useState<number>(20);
  const [finalLoad, setFinalLoad] = useState<number>(90);
  const [slewRate, setSlewRate] = useState<number>(8);
  const [simHorizonUs, setSimHorizonUs] = useState<number>(900);

  // Local fallback state for SPICE / QSPICE / PLECS simulation time if not controlled by parent
  const [localDcdcSimUs, setLocalDcdcSimUs] = useState<number | undefined>(undefined);
  const [localAcdcSimMs, setLocalAcdcSimMs] = useState<number | undefined>(undefined);
  const [localCombinedSimMs, setLocalCombinedSimMs] = useState<number | undefined>(undefined);

  const dcdcSimOverrideUs = onChangeDcdcSimTimeUs ? propDcdcSimUs : localDcdcSimUs;
  const setDcdcSimOverrideUs = onChangeDcdcSimTimeUs ?? setLocalDcdcSimUs;
  const acdcSimOverrideMs = onChangeAcdcSimTimeMs ? propAcdcSimMs : localAcdcSimMs;
  const setAcdcSimOverrideMs = onChangeAcdcSimTimeMs ?? setLocalAcdcSimMs;
  const combinedSimOverrideMs = onChangeCombinedSimTimeMs ? propCombinedSimMs : localCombinedSimMs;
  const setCombinedSimOverrideMs = onChangeCombinedSimTimeMs ?? setLocalCombinedSimMs;

  const autoDcdcSimUs = getDefaultDcDcSimTimeUs(dcdcState.fsw_kHz);
  const autoAcdcSimMs = getDefaultAcDcSimTimeMs(acdcState.f_line_Hz);
  const autoCombinedSimMs = getDefaultCombinedSimTimeMs(acdcState.f_line_Hz);

  const effectiveDcdcSimUs = dcdcSimOverrideUs ?? autoDcdcSimUs;
  const effectiveAcdcSimMs = acdcSimOverrideMs ?? autoAcdcSimMs;
  const effectiveCombinedSimMs = combinedSimOverrideMs ?? autoCombinedSimMs;

  // Monte Carlo Controls
  const [mcTrials, setMcTrials] = useState<number>(200);
  const [tolL, setTolL] = useState<number>(10);
  const [tolC, setTolC] = useState<number>(20);
  const [tolVin, setTolVin] = useState<number>(5);
  const [mcHistogramMetric, setMcHistogramMetric] = useState<
    'efficiency_pct' | 'Tj_max_C' | 'pm_deg' | 'satUtil_pct'
  >('Tj_max_C');

  // Netlist / Schematic / Firmware Viewer Tab
  const [exportTab, setExportTab] = useState<
    | 'dcdc-asc'
    | 'acdc-asc'
    | 'combined-asc'
    | 'dcdc-qsch'
    | 'dcdc-cpp'
    | 'dcdc-plecs'
    | 'acdc-plecs'
    | 'combined-plecs'
    | 'dcdc-cir'
    | 'acdc-cir'
    | 'combined-cir'
    | 'firmware-h'
  >('dcdc-asc');
  const [copiedFlag, setCopiedFlag] = useState<boolean>(false);

  const transientRes = useMemo(
    () =>
      runTransientLoadStep(dcdcState, dcdcRes, {
        scenario,
        initialLoad_pct: initLoad,
        finalLoad_pct: finalLoad,
        stepTime_us: Math.round(simHorizonUs * 0.18),
        totalTime_us: simHorizonUs,
        slewRate_A_us: slewRate,
      }),
    [dcdcState, dcdcRes, scenario, initLoad, finalLoad, slewRate, simHorizonUs]
  );

  const pinnedTransientRes = useMemo(
    () =>
      pinnedDcdcRes
        ? runTransientLoadStep(pinnedDcdcRes.state, pinnedDcdcRes, {
            scenario,
            initialLoad_pct: initLoad,
            finalLoad_pct: finalLoad,
            stepTime_us: Math.round(simHorizonUs * 0.18),
            totalTime_us: simHorizonUs,
            slewRate_A_us: slewRate,
          })
        : null,
    [pinnedDcdcRes, scenario, initLoad, finalLoad, slewRate, simHorizonUs]
  );

  const mcRes = useMemo(
    () =>
      runMonteCarloAnalysis(dcdcState, {
        numTrials: mcTrials,
        tolL_pct: tolL,
        tolC_pct: tolC,
        tolVin_pct: tolVin,
      }),
    [dcdcState, mcTrials, tolL, tolC, tolVin]
  );

  const dcdcQspiceBundle = useMemo(
    () => generateDcDcQspiceBundle(dcdcState, dcdcRes, effectiveDcdcSimUs),
    [dcdcState, dcdcRes, effectiveDcdcSimUs]
  );

  const codePreview = useMemo(() => {
    if (exportTab === 'dcdc-asc') return generateDcDcLtspiceAsc(dcdcState, dcdcRes, effectiveDcdcSimUs);
    if (exportTab === 'acdc-asc') return generateAcDcLtspiceAsc(acdcState, acdcRes, effectiveAcdcSimMs);
    if (exportTab === 'combined-asc')
      return generateCombinedSystemLtspiceAsc(
        acdcState,
        acdcRes,
        dcdcState,
        dcdcRes,
        sharedMcu,
        effectiveCombinedSimMs
      );
    if (exportTab === 'dcdc-qsch') return dcdcQspiceBundle.qschContent;
    if (exportTab === 'dcdc-cpp') return dcdcQspiceBundle.cppContent;
    if (exportTab === 'dcdc-plecs') return generateDcDcPlecsModel(dcdcState, dcdcRes, effectiveDcdcSimUs);
    if (exportTab === 'acdc-plecs') return generateAcDcPlecsModel(acdcState, acdcRes, effectiveAcdcSimMs);
    if (exportTab === 'combined-plecs')
      return generateCombinedSystemPlecsModel(
        acdcState,
        acdcRes,
        dcdcState,
        dcdcRes,
        sharedMcu,
        effectiveCombinedSimMs
      );
    if (exportTab === 'dcdc-cir') return generateDcDcSpiceNetlist(dcdcState, dcdcRes, effectiveDcdcSimUs);
    if (exportTab === 'acdc-cir') return generateAcDcSpiceNetlist(acdcState, acdcRes, effectiveAcdcSimMs);
    if (exportTab === 'combined-cir')
      return generateCombinedSystemSpiceNetlist(
        acdcState,
        acdcRes,
        dcdcState,
        dcdcRes,
        sharedMcu,
        effectiveCombinedSimMs
      );
    return generateControlFirmwareHeader(dcdcState, dcdcRes, acdcState, acdcRes, sharedMcu);
  }, [
    exportTab,
    dcdcState,
    dcdcRes,
    acdcState,
    acdcRes,
    dcdcQspiceBundle,
    sharedMcu,
    effectiveDcdcSimUs,
    effectiveAcdcSimMs,
    effectiveCombinedSimMs,
  ]);

  const downloadCodeFile = () => {
    const filename =
      exportTab === 'dcdc-asc'
        ? `voltcraft_${dcdcState.topology}.asc`
        : exportTab === 'acdc-asc'
        ? `voltcraft_${acdcState.topology}.asc`
        : exportTab === 'combined-asc'
        ? `voltcraft_combined_${acdcState.topology}_to_${dcdcState.topology}.asc`
        : exportTab === 'dcdc-qsch'
        ? dcdcQspiceBundle.qschFileName
        : exportTab === 'dcdc-cpp'
        ? dcdcQspiceBundle.cppFileName
        : exportTab === 'dcdc-plecs'
        ? `voltcraft_${dcdcState.topology}.plecs`
        : exportTab === 'acdc-plecs'
        ? `voltcraft_${acdcState.topology}.plecs`
        : exportTab === 'combined-plecs'
        ? `voltcraft_combined_${acdcState.topology}_to_${dcdcState.topology}.plecs`
        : exportTab === 'dcdc-cir'
        ? `voltcraft_${dcdcState.topology}.cir`
        : exportTab === 'acdc-cir'
        ? `voltcraft_${acdcState.topology}.cir`
        : exportTab === 'combined-cir'
        ? `voltcraft_combined_${acdcState.topology}_to_${dcdcState.topology}.cir`
        : 'powerstage_control_cfg.h';
    const blob =
      exportTab === 'dcdc-qsch'
        ? new Blob([new Uint8Array(buildQspiceBinaryFile(dcdcQspiceBundle.qschContent))], {
            type: 'application/octet-stream',
          })
        : new Blob([codePreview], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadQspiceZip = (target: 'dcdc' | 'acdc' | 'combined') => {
    const bundle =
      target === 'combined'
        ? generateCombinedSystemQspiceBundle(
            acdcState,
            acdcRes,
            dcdcState,
            dcdcRes,
            sharedMcu,
            effectiveCombinedSimMs
          )
        : target === 'acdc'
        ? generateAcDcQspiceBundle(acdcState, acdcRes, effectiveAcdcSimMs)
        : dcdcQspiceBundle;
    const blob = new Blob([new Uint8Array(bundle.zipBytes)], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${bundle.baseName}_qspice.zip`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadPlecsZip = (target: 'dcdc' | 'acdc' | 'combined') => {
    const bundle =
      target === 'combined'
        ? generateCombinedSystemPlecsBundle(
            acdcState,
            acdcRes,
            dcdcState,
            dcdcRes,
            sharedMcu,
            effectiveCombinedSimMs
          )
        : target === 'acdc'
        ? generateAcDcPlecsBundle(acdcState, acdcRes, effectiveAcdcSimMs)
        : generateDcDcPlecsBundle(dcdcState, dcdcRes, effectiveDcdcSimUs);
    const blob = new Blob([new Uint8Array(bundle.zipBytes)], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${bundle.baseName}_plecs.zip`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(codePreview);
      setCopiedFlag(true);
      setTimeout(() => setCopiedFlag(false), 1800);
    } catch {
      // ignore clipboard errors
    }
  };

  const activeBins = mcRes.histograms[mcHistogramMetric];
  const maxBinCount = Math.max(1, ...activeBins.map((b) => b.count));

  return (
    <div className="space-y-5">
      {/* SECTION 1: 4/6-CHANNEL VIRTUAL OSCILLOSCOPE */}
      <OscilloscopeViewer res={dcdcRes} pinnedRes={pinnedDcdcRes} />

      {/* SECTION 2: RK4 CLOSED-LOOP TIME-DOMAIN TRANSIENT SIMULATOR */}
      <div className="bg-white dark:bg-[#0E131D] border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-2.5">
          <div>
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-emerald-500" />
              <h3 className="text-xs font-bold font-mono text-slate-900 dark:text-slate-100">
                RK4 Closed-Loop Switched-Averaged ODE Transient Simulator
              </h3>
              <span className="px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-[10px] font-mono text-emerald-600 dark:text-emerald-300">
                {transientRes.controllerLabel}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Integrates non-linear output LC + ESR dynamics with discrete Tustin digital ISR &amp; PSFB duty-loss saturation.
            </p>
          </div>

          {/* KPI Badges */}
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono tabular-nums">
            <span className="px-2 py-1 rounded bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              Undershoot: <strong className="text-rose-500">{transientRes.maxUndershoot_mV.toFixed(0)} mV</strong>
            </span>
            <span className="px-2 py-1 rounded bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              Overshoot: <strong className="text-amber-500">{transientRes.maxOvershoot_mV.toFixed(0)} mV</strong>
            </span>
            <span className="px-2 py-1 rounded bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              Dev: <strong className={transientRes.maxDeviation_pct <= 5 ? 'text-emerald-500' : 'text-rose-500'}>{transientRes.maxDeviation_pct.toFixed(2)}%</strong>
            </span>
            <span className="px-2 py-1 rounded bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              t_settle: <strong className="text-cyan-400">{transientRes.settlingTime_us.toFixed(0)} µs</strong>
            </span>
          </div>
        </div>

        {/* Controls */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 text-xs font-mono">
          <div>
            <span className="text-[10px] text-slate-500">Scenario</span>
            <select
              value={scenario}
              onChange={(e) => setScenario(e.target.value as 'load-step' | 'soft-start')}
              className="w-full mt-0.5 px-2 py-1 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded"
            >
              <option value="load-step">Load Step Transient</option>
              <option value="soft-start">Startup Soft-Start</option>
            </select>
          </div>
          <div>
            <span className="text-[10px] text-slate-500">Initial Load (%)</span>
            <input
              type="number"
              min={5}
              max={100}
              step={5}
              value={initLoad}
              onChange={(e) => setInitLoad(Number(e.target.value) || 20)}
              className="w-full mt-0.5 px-2 py-1 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded"
            />
          </div>
          <div>
            <span className="text-[10px] text-slate-500">Final Load (%)</span>
            <input
              type="number"
              min={10}
              max={125}
              step={5}
              value={finalLoad}
              onChange={(e) => setFinalLoad(Number(e.target.value) || 90)}
              className="w-full mt-0.5 px-2 py-1 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded"
            />
          </div>
          <div>
            <span className="text-[10px] text-slate-500">Slew Rate (A/µs)</span>
            <input
              type="number"
              min={0.5}
              max={50}
              step={0.5}
              value={slewRate}
              onChange={(e) => setSlewRate(Number(e.target.value) || 8)}
              className="w-full mt-0.5 px-2 py-1 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded"
            />
          </div>
          <div>
            <span className="text-[10px] text-slate-500">Window (µs)</span>
            <input
              type="number"
              min={100}
              max={50000}
              step={100}
              value={simHorizonUs}
              onChange={(e) => setSimHorizonUs(Math.max(100, Number(e.target.value) || 900))}
              className="w-full mt-0.5 px-2 py-1 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded"
            />
          </div>
        </div>

        <InteractiveChart
          title={`Closed-Loop RK4 Transient Response (${scenario === 'load-step' ? `${initLoad}% → ${finalLoad}% Load Step` : `0 → ${dcdcState.Vout_V}V Soft-Start`})`}
          subtitle="Tracks output voltage v_out(t) recovery and inductor current i_Lo(t) slew under exact digital compensator coefficients"
          xLabel="Time"
          xUnit="µs"
          data={transientRes.points.map((p, idx) => ({
            x: p.t_us,
            y1: p.v_out_V,
            y2: p.i_lo_A,
            refY1: pinnedTransientRes?.points[idx]?.v_out_V,
            refY2: pinnedTransientRes?.points[idx]?.i_lo_A,
          }))}
          horizontalMarkers={[
            {
              value: dcdcState.Vout_V,
              label: `Target ${dcdcState.Vout_V}V`,
              color: '#10b981',
              axis: 'left',
              dashed: true,
            },
          ]}
          series1={{ label: 'Output Voltage v_out(t)', unit: 'V', color: '#38bdf8' }}
          series2={{ label: 'Output Inductor i_Lo(t)', unit: 'A', color: '#10b981' }}
        />
      </div>

      {/* SECTION 3: MONTE CARLO TOLERANCE & YIELD ANALYZER */}
      <div className="bg-white dark:bg-[#0E131D] border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-2.5">
          <div>
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-purple-400" />
              <h3 className="text-xs font-bold font-mono text-slate-900 dark:text-slate-100">
                Monte Carlo Component Tolerance &amp; Corner Yield Analyzer ({mcRes.numTrials} Trials)
              </h3>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold inline-flex items-center gap-1 border ${
                  mcRes.yield_pct >= 95
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-500'
                    : mcRes.yield_pct >= 80
                    ? 'bg-amber-500/15 border-amber-500/40 text-amber-500'
                    : 'bg-rose-500/15 border-rose-500/40 text-rose-500'
                }`}
              >
                {mcRes.yield_pct >= 95 ? <ShieldCheck className="w-3 h-3" /> : <ShieldAlert className="w-3 h-3" />}
                Yield: {mcRes.yield_pct}% ({mcRes.passCount}/{mcRes.numTrials} Pass)
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              3σ Gaussian tolerance sweep across magnetics, Co/ESR, line Vin, ambient Tamb, and heatsink thermal resistance.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
            <label className="inline-flex items-center gap-1 text-[11px]">
              Trials:
              <select
                value={mcTrials}
                onChange={(e) => setMcTrials(Number(e.target.value))}
                className="px-1.5 py-0.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded"
              >
                <option value={100}>100</option>
                <option value={200}>200</option>
                <option value={400}>400</option>
              </select>
            </label>
            <label className="inline-flex items-center gap-1 text-[11px]">
              ±L%:
              <input
                type="number"
                min={2}
                max={30}
                value={tolL}
                onChange={(e) => setTolL(Number(e.target.value) || 10)}
                className="w-12 px-1.5 py-0.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded"
              />
            </label>
            <label className="inline-flex items-center gap-1 text-[11px]">
              ±C%:
              <input
                type="number"
                min={5}
                max={40}
                value={tolC}
                onChange={(e) => setTolC(Number(e.target.value) || 20)}
                className="w-12 px-1.5 py-0.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded"
              />
            </label>
            <label className="inline-flex items-center gap-1 text-[11px]">
              ±Vin%:
              <input
                type="number"
                min={1}
                max={20}
                value={tolVin}
                onChange={(e) => setTolVin(Number(e.target.value) || 5)}
                className="w-12 px-1.5 py-0.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded"
              />
            </label>
          </div>
        </div>

        {/* Stats Grid + Histogram */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Distribution Histogram */}
          <div className="bg-slate-50 dark:bg-[#090D16] border border-slate-200 dark:border-slate-800 rounded-lg p-3 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-mono font-semibold text-slate-700 dark:text-slate-200">
                Distribution Histogram
              </span>
              <div className="inline-flex items-center gap-1 text-[10px] font-mono">
                {(
                  [
                    { id: 'Tj_max_C', label: 'Tj max' },
                    { id: 'efficiency_pct', label: 'Efficiency' },
                    { id: 'pm_deg', label: 'Phase Margin' },
                    { id: 'satUtil_pct', label: 'Core Flux%' },
                  ] as const
                ).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMcHistogramMetric(m.id)}
                    className={`px-2 py-0.5 rounded border cursor-pointer ${
                      mcHistogramMetric === m.id
                        ? 'bg-cyan-600 border-cyan-600 text-white font-semibold'
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-500'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="h-36 flex items-end gap-1 pt-2 px-1">
              {activeBins.map((b, idx) => {
                const passH = (b.passCount / maxBinCount) * 100;
                const failH = (b.failCount / maxBinCount) * 100;
                return (
                  <div
                    key={idx}
                    className="flex-1 h-full flex flex-col justify-end group relative"
                    title={`[${b.xStart}, ${b.xEnd}]: ${b.passCount} pass / ${b.failCount} fail`}
                  >
                    {b.failCount > 0 && (
                      <div
                        className="w-full bg-rose-500/85 rounded-t-sm"
                        style={{ height: `${Math.max(3, failH)}%` }}
                      />
                    )}
                    {b.passCount > 0 && (
                      <div
                        className={`w-full bg-emerald-500/80 ${b.failCount === 0 ? 'rounded-t-sm' : ''}`}
                        style={{ height: `${Math.max(3, passH)}%` }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
              <span>Min: {mcRes.stats[mcHistogramMetric].min}</span>
              <span>
                μ = {mcRes.stats[mcHistogramMetric].mean} ± {mcRes.stats[mcHistogramMetric].std}{' '}
                {mcRes.stats[mcHistogramMetric].unit}
              </span>
              <span>Max: {mcRes.stats[mcHistogramMetric].max}</span>
            </div>
          </div>

          {/* Summary Table & Top Sensitivity Drivers */}
          <div className="space-y-2.5">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px] font-mono">
              {Object.values(mcRes.stats).map((st) => (
                <div
                  key={st.label}
                  className="p-2 rounded bg-slate-50 dark:bg-[#090D16] border border-slate-200 dark:border-slate-800"
                >
                  <div className="text-[10px] text-slate-500 truncate">{st.label}</div>
                  <div className="font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                    {st.mean} {st.unit}
                  </div>
                  <div className="text-[10px] text-slate-400 tabular-nums">
                    P5..P95: [{st.p05} .. {st.p95}]
                  </div>
                </div>
              ))}
            </div>

            <div className="p-2.5 rounded bg-slate-50 dark:bg-[#090D16] border border-slate-200 dark:border-slate-800 text-[11px] font-mono">
              <div className="text-[10px] font-semibold text-slate-500 uppercase mb-1.5">
                Top Tolerance Sensitivity Drivers (Correlation)
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {mcRes.sensitivities.slice(0, 4).map((s) => (
                  <div key={s.parameter} className="flex items-center justify-between gap-2 text-[10px]">
                    <span className="text-slate-700 dark:text-slate-300 truncate">{s.parameter}</span>
                    <span className="text-cyan-500 tabular-nums shrink-0">
                      r_eff={s.correlationEff >= 0 ? '+' : ''}
                      {s.correlationEff} · r_Tj={s.correlationTj >= 0 ? '+' : ''}
                      {s.correlationTj}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 4: SPICE (.cir) & EMBEDDED FIRMWARE (.h) GENERATOR */}
      <div className="bg-white dark:bg-[#0E131D] border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-2.5">
          <div>
            <div className="flex items-center gap-2">
              <Code2 className="w-4 h-4 text-cyan-500" />
              <h3 className="text-xs font-bold font-mono text-slate-900 dark:text-slate-100">
                LTspice (.asc), QSPICE (.zip), PLECS Standalone (.plecs/.zip) &amp; DSP (.h) Exporter
              </h3>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Download grid-aligned LTspice .asc diagrams, QSPICE bundles, Plexim PLECS .plecs/.m/.xml bundles, .cir netlists, or TI C2000 / STM32G4 headers.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'dcdc-asc', label: 'DC-DC LTspice (.asc)' },
                { id: 'acdc-asc', label: 'AC-DC LTspice (.asc)' },
                ...(outputMode === 'combined'
                  ? [{ id: 'combined-asc', label: 'Combined LTspice (.asc)' } as const]
                  : []),
                { id: 'dcdc-qsch', label: 'QSPICE (.qsch)' },
                { id: 'dcdc-cpp', label: 'QSPICE C++ (.cpp)' },
                { id: 'dcdc-plecs', label: 'DC-DC PLECS (.plecs)' },
                { id: 'acdc-plecs', label: 'AC-DC PLECS (.plecs)' },
                ...(outputMode === 'combined'
                  ? [{ id: 'combined-plecs', label: 'Combined PLECS (.plecs)' } as const]
                  : []),
                { id: 'dcdc-cir', label: 'DC-DC SPICE (.cir)' },
                { id: 'acdc-cir', label: 'AC-DC SPICE (.cir)' },
                ...(outputMode === 'combined'
                  ? [{ id: 'combined-cir', label: 'Combined SPICE (.cir)' } as const]
                  : []),
                { id: 'firmware-h', label: 'Firmware Config (.h)' },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setExportTab(t.id)}
                className={`px-2.5 py-1 rounded text-[11px] font-mono border cursor-pointer ${
                  exportTab === t.id
                    ? 'bg-cyan-600 border-cyan-600 text-white font-semibold'
                    : 'bg-slate-100 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
                }`}
              >
                {t.label}
              </button>
            ))}

            <button
              type="button"
              onClick={copyCode}
              className="px-2.5 py-1 rounded text-[11px] font-mono bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 inline-flex items-center gap-1 cursor-pointer"
            >
              {copiedFlag ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              {copiedFlag ? 'Copied' : 'Copy'}
            </button>
            <button
              type="button"
              onClick={downloadCodeFile}
              className="px-2.5 py-1 rounded text-[11px] font-mono bg-emerald-600 hover:bg-emerald-500 text-white inline-flex items-center gap-1 font-semibold cursor-pointer"
            >
              <Download className="w-3 h-3" />
              Download File
            </button>
            <button
              type="button"
              onClick={() =>
                downloadQspiceZip(
                  exportTab === 'combined-asc' || exportTab === 'combined-plecs' || exportTab === 'combined-cir'
                    ? 'combined'
                    : exportTab === 'acdc-cir' || exportTab === 'acdc-asc' || exportTab === 'acdc-plecs'
                    ? 'acdc'
                    : 'dcdc'
                )
              }
              className="px-2.5 py-1 rounded text-[11px] font-mono bg-violet-600 hover:bg-violet-500 text-white inline-flex items-center gap-1 font-semibold cursor-pointer"
              title="Download QSPICE ZIP containing .qsch, .qsym, .qraw, .cir, .cpp"
            >
              <Archive className="w-3 h-3" />
              QSPICE Bundle (.zip)
            </button>
            <button
              type="button"
              onClick={() =>
                downloadPlecsZip(
                  exportTab === 'combined-asc' || exportTab === 'combined-plecs' || exportTab === 'combined-cir'
                    ? 'combined'
                    : exportTab === 'acdc-cir' || exportTab === 'acdc-asc' || exportTab === 'acdc-plecs'
                    ? 'acdc'
                    : 'dcdc'
                )
              }
              className="px-2.5 py-1 rounded text-[11px] font-mono bg-sky-600 hover:bg-sky-500 text-white inline-flex items-center gap-1 font-semibold cursor-pointer"
              title="Download Plexim PLECS Standalone ZIP containing .plecs, init_params.m, hybrid_cap_verification.m, and thermal_descriptions.xml"
            >
              <Archive className="w-3 h-3" />
              PLECS Bundle (.zip)
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 dark:bg-[#090D16] border border-slate-200 dark:border-slate-800 px-3 py-2 text-[11px] font-mono">
          {exportTab === 'acdc-asc' || exportTab === 'acdc-plecs' || exportTab === 'acdc-cir' ? (
            <>
              <div className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-cyan-500" />
                <span className="font-semibold text-slate-700 dark:text-slate-200">
                  AC-DC Simulation Time (Tstop):
                </span>
                <input
                  type="number"
                  min={1}
                  max={500}
                  step={5}
                  value={effectiveAcdcSimMs}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v) && v > 0) setAcdcSimOverrideMs(v);
                  }}
                  className="w-20 px-2 py-0.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded text-right font-bold"
                />
                <span className="text-slate-500">ms</span>
              </div>
              <div className="flex flex-wrap items-center gap-1">
                {[20, 40, 80, 120].map((ms) => (
                  <button
                    key={ms}
                    type="button"
                    onClick={() => setAcdcSimOverrideMs(ms)}
                    className={`px-2 py-0.5 rounded border cursor-pointer ${
                      Math.abs(effectiveAcdcSimMs - ms) < 0.05
                        ? 'bg-cyan-600 border-cyan-600 text-white'
                        : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {ms} ms
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setAcdcSimOverrideMs(undefined)}
                  className="px-2 py-0.5 rounded border border-slate-300 dark:border-slate-700 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
                >
                  Auto ({autoAcdcSimMs} ms)
                </button>
              </div>
            </>
          ) : exportTab === 'combined-asc' || exportTab === 'combined-plecs' || exportTab === 'combined-cir' ? (
            <>
              <div className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-cyan-500" />
                <span className="font-semibold text-slate-700 dark:text-slate-200">
                  Combined Simulation Time (Tstop):
                </span>
                <input
                  type="number"
                  min={1}
                  max={500}
                  step={5}
                  value={effectiveCombinedSimMs}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v) && v > 0) setCombinedSimOverrideMs(v);
                  }}
                  className="w-20 px-2 py-0.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded text-right font-bold"
                />
                <span className="text-slate-500">ms</span>
              </div>
              <div className="flex flex-wrap items-center gap-1">
                {[10, 20, 40, 80].map((ms) => (
                  <button
                    key={ms}
                    type="button"
                    onClick={() => setCombinedSimOverrideMs(ms)}
                    className={`px-2 py-0.5 rounded border cursor-pointer ${
                      Math.abs(effectiveCombinedSimMs - ms) < 0.05
                        ? 'bg-cyan-600 border-cyan-600 text-white'
                        : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {ms} ms
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setCombinedSimOverrideMs(undefined)}
                  className="px-2 py-0.5 rounded border border-slate-300 dark:border-slate-700 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
                >
                  Auto ({autoCombinedSimMs} ms)
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-cyan-500" />
                <span className="font-semibold text-slate-700 dark:text-slate-200">
                  DC-DC Simulation Time (Tstop):
                </span>
                <input
                  type="number"
                  min={50}
                  max={50000}
                  step={100}
                  value={effectiveDcdcSimUs}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v) && v >= 50) setDcdcSimOverrideUs(Math.round(v));
                  }}
                  className="w-24 px-2 py-0.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded text-right font-bold"
                />
                <span className="text-slate-500">µs</span>
              </div>
              <div className="flex flex-wrap items-center gap-1">
                {[300, 600, 1000, 2000, 5000].map((us) => (
                  <button
                    key={us}
                    type="button"
                    onClick={() => setDcdcSimOverrideUs(us)}
                    className={`px-2 py-0.5 rounded border cursor-pointer ${
                      effectiveDcdcSimUs === us
                        ? 'bg-cyan-600 border-cyan-600 text-white'
                        : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {us >= 1000 ? `${us / 1000} ms` : `${us} µs`}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setDcdcSimOverrideUs(undefined)}
                  className="px-2 py-0.5 rounded border border-slate-300 dark:border-slate-700 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
                >
                  Auto ({autoDcdcSimUs} µs)
                </button>
              </div>
            </>
          )}
        </div>

        <pre className="max-h-72 overflow-auto p-3 rounded-lg bg-[#060910] border border-slate-800 text-[11px] font-mono text-cyan-200 leading-relaxed">
          {codePreview}
        </pre>
      </div>
    </div>
  );
};
