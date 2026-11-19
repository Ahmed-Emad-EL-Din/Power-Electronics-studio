import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AcDcDesignState, DcDcDesignState } from '../data/databases';
import { AcDcResults } from '../engine/acdcEngine';
import { DcDcResults } from '../engine/dcdcEngine';
import { DesignAlertSummary } from '../engine/designAlerts';
import {
  PerCapConfig,
  PerInductorConfig,
  extractCircuitCapacitors,
  extractCircuitInductors,
  solveCapacitorBank,
  solveCustomInductorDesign,
} from '../engine/passiveDesignEngine';
import { DEFAULT_CAP_BANK_LOCKS, DEFAULT_INDUCTOR_LOCKS } from './DesignSolverContext';
import { MathFormula } from './MathFormula';
import {
  ReportAcDcLineSvg,
  ReportBhLoopSvg,
  ReportBodeSvg,
  ReportCoreThermalSvg,
  ReportDcDcEfficiencySvg,
  ReportDcDcWaveformsSvg,
  ReportHarmonicsSvg,
  ReportWindowCrossSectionSvg,
} from './report/ReportSvgCharts';
import {
  ReportChapter,
  ReportStageScope,
  ReportStep,
  buildDesignReportModel,
} from '../utils/designReportModel';
import { generateRealDesignPdf } from '../utils/pdfReportBuilder';
import {
  BookOpen,
  FileDown,
  Printer,
  X,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  ListTree,
  Lightbulb,
  Loader2,
} from 'lucide-react';

export type { ReportStageScope };

interface DesignReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialScope?: ReportStageScope;
  dcdcState: DcDcDesignState;
  dcdcRes: DcDcResults;
  acdcState: AcDcDesignState;
  acdcRes: AcDcResults;
  inductorConfigs: Record<string, PerInductorConfig>;
  capacitorConfigs: Record<string, PerCapConfig>;
  alerts: DesignAlertSummary;
}

const CalcStep: React.FC<ReportStep> = ({
  step,
  title,
  given,
  tex,
  substitution,
  result,
  verdict,
}) => (
  <div className="report-avoid-break border border-slate-200 rounded-md p-3.5 bg-white space-y-2">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-1.5">
      <div className="text-xs font-semibold text-slate-900">
        <span className="font-mono text-cyan-700 mr-2">Step {step}</span>
        {title}
      </div>
      {verdict && (
        <span
          className={`text-[11px] font-mono font-semibold ${
            verdict.status === 'fail'
              ? 'text-rose-700'
              : verdict.status === 'warn'
              ? 'text-amber-700'
              : 'text-emerald-700'
          }`}
        >
          <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1 align-middle ${verdict.status === 'fail' ? 'bg-rose-600' : verdict.status === 'warn' ? 'bg-amber-600' : 'bg-emerald-600'}`} />
          {verdict.label}
        </span>
      )}
    </div>

    <div className="grid grid-cols-1 md:grid-cols-12 gap-3 text-xs">
      <div className="md:col-span-5 space-y-1.5">
        <div>
          <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 block">
            1. Given Inputs
          </span>
          <div className="font-mono text-[11px] text-slate-700 leading-relaxed">{given}</div>
        </div>
        <div>
          <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 block">
            3. Numerical Substitution
          </span>
          <div className="font-mono text-[11px] text-slate-800 bg-slate-50 border border-slate-200 rounded px-2 py-1 leading-relaxed break-words">
            {substitution}
          </div>
        </div>
      </div>

      <div className="md:col-span-7 flex flex-col justify-between gap-2">
        <div>
          <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 block mb-0.5">
            2. Governing Equation
          </span>
          <div className="bg-slate-50 border border-slate-200 rounded px-2.5 py-1.5 overflow-x-auto text-slate-900">
            <MathFormula tex={tex} displayMode />
          </div>
        </div>
        <div className="flex items-baseline justify-between gap-2 bg-cyan-50/70 border border-cyan-200 rounded px-2.5 py-1.5">
          <span className="text-[10px] font-mono uppercase tracking-wider text-cyan-800 shrink-0">
            4. Computed Result
          </span>
          <span className="font-mono font-bold text-xs text-slate-900 tabular-nums text-right">
            {result}
          </span>
        </div>
      </div>
    </div>
  </div>
);

export const DesignReportModal: React.FC<DesignReportModalProps> = ({
  isOpen,
  onClose,
  initialScope = 'both',
  dcdcState,
  dcdcRes,
  acdcState,
  acdcRes,
  inductorConfigs,
  capacitorConfigs,
  alerts,
}) => {
  const [scope, setScope] = useState<ReportStageScope>(initialScope);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfNotice, setPdfNotice] = useState<string | null>(null);
  const articleRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setScope(initialScope);
      setPdfNotice(null);
    }
  }, [isOpen, initialScope]);

  const includeDcDc = scope === 'both' || scope === 'dcdc';
  const includeAcDc = scope === 'both' || scope === 'acdc';

  const dcdcInductorRows = useMemo(() => {
    if (!includeDcDc) return [];
    return extractCircuitInductors('dcdc', dcdcState, dcdcRes, acdcState, acdcRes).map((req) => {
      const cfg = inductorConfigs[req.id];
      const sol = solveCustomInductorDesign(
        req,
        cfg?.overrides || {},
        cfg?.locks || DEFAULT_INDUCTOR_LOCKS
      );
      return { req, sol };
    });
  }, [includeDcDc, dcdcState, dcdcRes, acdcState, acdcRes, inductorConfigs]);

  const dcdcCapRows = useMemo(() => {
    if (!includeDcDc) return [];
    return extractCircuitCapacitors('dcdc', dcdcState, dcdcRes, acdcState, acdcRes).map((req) => {
      const cfg = capacitorConfigs[req.id];
      const sol = solveCapacitorBank(req, cfg?.overrides || {}, cfg?.locks || DEFAULT_CAP_BANK_LOCKS);
      return { req, sol };
    });
  }, [includeDcDc, dcdcState, dcdcRes, acdcState, acdcRes, capacitorConfigs]);

  const acdcInductorRows = useMemo(() => {
    if (!includeAcDc) return [];
    return extractCircuitInductors('acdc', dcdcState, dcdcRes, acdcState, acdcRes).map((req) => {
      const cfg = inductorConfigs[req.id];
      const sol = solveCustomInductorDesign(
        req,
        cfg?.overrides || {},
        cfg?.locks || DEFAULT_INDUCTOR_LOCKS
      );
      return { req, sol };
    });
  }, [includeAcDc, dcdcState, dcdcRes, acdcState, acdcRes, inductorConfigs]);

  const acdcCapRows = useMemo(() => {
    if (!includeAcDc) return [];
    return extractCircuitCapacitors('acdc', dcdcState, dcdcRes, acdcState, acdcRes).map((req) => {
      const cfg = capacitorConfigs[req.id];
      const sol = solveCapacitorBank(req, cfg?.overrides || {}, cfg?.locks || DEFAULT_CAP_BANK_LOCKS);
      return { req, sol };
    });
  }, [includeAcDc, dcdcState, dcdcRes, acdcState, acdcRes, capacitorConfigs]);

  const scopedAlerts = useMemo(() => {
    if (scope === 'both') return alerts;
    const danger = alerts.danger.filter((a) => a.domain === scope);
    const warning = alerts.warning.filter((a) => a.domain === scope);
    return { all: [...danger, ...warning], danger, warning };
  }, [alerts, scope]);

  const model = useMemo(
    () =>
      buildDesignReportModel({
        scope,
        dcdcState,
        dcdcRes,
        acdcState,
        acdcRes,
        dcdcInductorRows,
        dcdcCapRows,
        acdcInductorRows,
        acdcCapRows,
        scopedAlerts,
      }),
    [
      scope,
      dcdcState,
      dcdcRes,
      acdcState,
      acdcRes,
      dcdcInductorRows,
      dcdcCapRows,
      acdcInductorRows,
      acdcCapRows,
      scopedAlerts,
    ]
  );

  const nonAuditChapters = model.chapters.filter((c) => c.stage !== 'audit');
  const failedChapters = nonAuditChapters.filter((c) => c.status === 'fail');
  const warnedChapters = nonAuditChapters.filter((c) => c.status === 'warn');
  const totalFailCount = scopedAlerts.danger.length + failedChapters.length;
  const totalWarnCount = scopedAlerts.warning.length + warnedChapters.length;

  if (!isOpen) return null;

  const handleDownloadPdf = async () => {
    if (pdfBusy) return;
    setPdfBusy(true);
    setPdfNotice(null);
    try {
      const fileName = await generateRealDesignPdf({
        model,
        dcdcState,
        dcdcRes,
        acdcState,
        acdcRes,
        articleElement: articleRef.current,
      });
      setPdfNotice(`Saved ${fileName}`);
      setTimeout(() => setPdfNotice(null), 4000);
    } catch {
      setPdfNotice('PDF download fallback: use Print button');
    } finally {
      setPdfBusy(false);
    }
  };

  const renderFigureById = (figId: string) => {
    switch (figId) {
      case 'acdc-line':
        return <ReportAcDcLineSvg res={acdcRes} />;
      case 'acdc-harmonics':
        return <ReportHarmonicsSvg res={acdcRes} />;
      case 'acdc-bode':
        return (
          <ReportBodeSvg
            title="PFC Inner Current Loop Open-Loop Frequency Response"
            points={acdcRes.bodeInner}
            fc_Hz={acdcRes.fc_i_actual_kHz * 1000}
            pm_deg={acdcRes.pm_i_actual_deg}
          />
        );
      case 'dcdc-waveforms':
        return <ReportDcDcWaveformsSvg res={dcdcRes} />;
      case 'dcdc-bh':
        return <ReportBhLoopSvg res={dcdcRes} />;
      case 'dcdc-thermal':
        return <ReportCoreThermalSvg res={dcdcRes} />;
      case 'dcdc-window':
        return <ReportWindowCrossSectionSvg state={dcdcState} res={dcdcRes} />;
      case 'dcdc-eff':
        return <ReportDcDcEfficiencySvg res={dcdcRes} />;
      case 'dcdc-bode':
        return (
          <ReportBodeSvg
            title="DC-DC Open-Loop Gain & Phase Bode Characteristics"
            points={dcdcRes.bodeData.map((b) => ({
              freq_Hz: b.freq_Hz,
              mag_dB: b.loopMag_dB,
              phase_deg: b.loopPhase_deg,
            }))}
            fc_Hz={dcdcRes.fc_actual_kHz * 1000}
            pm_deg={dcdcRes.pm_actual_deg}
          />
        );
      default:
        return null;
    }
  };

  const renderChapter = (ch: ReportChapter, idx: number) => {
    const borderColor =
      ch.stage === 'acdc'
        ? 'border-indigo-700'
        : ch.stage === 'dcdc'
        ? 'border-cyan-700'
        : 'border-slate-900';

    return (
      <section
        key={ch.id}
        id={ch.id}
        className={`${idx > 0 ? 'report-chapter-break' : ''} space-y-4`}
      >
        <h2 className={`text-lg font-bold border-b-2 ${borderColor} pb-1.5 text-slate-900`}>
          Chapter {ch.num}. {ch.title}
        </h2>

        <p className="text-xs text-slate-600 leading-relaxed">{ch.intro}</p>

        {/* Engineering Selection Rationale Box ("Why Chosen") */}
        <div className="report-avoid-break border border-sky-200 bg-sky-50/70 rounded-md p-3.5 space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-sky-900">
            <Lightbulb className="w-3.5 h-3.5 text-sky-700 shrink-0" />
            <span>Why Selected — {ch.rationale.heading}</span>
          </div>
          <ul className="space-y-1.5 text-xs text-slate-800">
            {ch.rationale.points.map((pt) => (
              <li key={pt.label} className="leading-relaxed">
                <strong className="font-mono text-[11px] text-sky-950">{pt.label}:</strong>{' '}
                <span>{pt.detail}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Sequential Calculation Steps */}
        {ch.steps.length > 0 && (
          <div className="space-y-3">
            {ch.steps.map((st) => (
              <CalcStep key={st.step} {...st} />
            ))}
          </div>
        )}

        {/* Synthesized Parameter Tables */}
        {ch.paramTables?.map((tbl) => (
          <div key={tbl.title} className="report-avoid-break space-y-1.5">
            <h3 className="text-xs font-mono font-bold uppercase text-slate-700">{tbl.title}</h3>
            <div className="overflow-x-auto border border-slate-300 rounded">
              <table className="w-full text-left border-collapse text-[11px] font-mono tabular-nums">
                <thead className="bg-slate-100 border-b border-slate-300 text-slate-700">
                  <tr>
                    {tbl.headers.map((h) => (
                      <th key={h} className="py-1.5 px-2.5">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {tbl.rows.map((r, rIdx) => (
                    <tr key={rIdx}>
                      {r.map((cell, cIdx) => (
                        <td
                          key={cIdx}
                          className={`py-1.5 px-2.5 ${
                            cIdx === 0 ? 'font-bold text-slate-900' : cIdx === 3 ? 'font-sans text-slate-700' : ''
                          }`}
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}

        {/* Inductor Schedule Table */}
        {ch.inductorSchedule && ch.inductorSchedule.rows.length > 0 && (
          <div className="report-avoid-break space-y-1.5">
            <h3 className="text-xs font-mono font-bold uppercase text-slate-700">
              {ch.inductorSchedule.title}
            </h3>
            <div className="overflow-x-auto border border-slate-300 rounded">
              <table className="w-full text-left border-collapse text-[11px] font-mono tabular-nums">
                <thead className="bg-slate-100 border-b border-slate-300 text-slate-700">
                  <tr>
                    <th className="py-1.5 px-2.5">Ref</th>
                    <th className="py-1.5 px-2.5">Target L</th>
                    <th className="py-1.5 px-2.5">Core &amp; Material</th>
                    <th className="py-1.5 px-2.5">Turns &amp; Wire</th>
                    <th className="py-1.5 px-2.5">Fill %</th>
                    <th className="py-1.5 px-2.5">B_pk / B_sat</th>
                    <th className="py-1.5 px-2.5">P_tot / T_hot</th>
                    <th className="py-1.5 px-2.5">Verdict</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {ch.inductorSchedule.rows.map(({ req, sol }) => (
                    <tr key={req.id}>
                      <td className="py-1.5 px-2.5 font-bold">
                        {req.designator} ({req.quantity}×)
                      </td>
                      <td className="py-1.5 px-2.5">
                        {req.targetL_uH >= 1000
                          ? `${(req.targetL_uH / 1000).toFixed(2)} mH`
                          : `${req.targetL_uH.toFixed(1)} µH`}
                      </td>
                      <td className="py-1.5 px-2.5">
                        {sol.core.id.toUpperCase()} · {sol.material.name}
                      </td>
                      <td className="py-1.5 px-2.5">
                        {sol.turnsN}T × {sol.parallelStrands}×AWG{sol.wire.awg}
                      </td>
                      <td className="py-1.5 px-2.5">{sol.windowFill_pct.toFixed(0)}%</td>
                      <td className="py-1.5 px-2.5">
                        {sol.B_pk_T.toFixed(2)}/{sol.B_sat_T.toFixed(2)} T
                      </td>
                      <td className="py-1.5 px-2.5">
                        {sol.P_total_W.toFixed(1)}W / {sol.T_hotspot_C.toFixed(0)}°C
                      </td>
                      <td className="py-1.5 px-2.5 font-medium">
                        {sol.satStatus === 'critical' || sol.windowFitStatus === 'overflow' ? (
                          <span className="text-rose-700">Fail</span>
                        ) : sol.satStatus === 'warning' || sol.windowFitStatus === 'tight' ? (
                          <span className="text-amber-700">Tight</span>
                        ) : (
                          <span className="text-emerald-700">Pass</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Capacitor Bank Schedule Table */}
        {ch.capacitorSchedule && ch.capacitorSchedule.rows.length > 0 && (
          <div className="report-avoid-break space-y-1.5">
            <h3 className="text-xs font-mono font-bold uppercase text-slate-700">
              {ch.capacitorSchedule.title}
            </h3>
            <div className="overflow-x-auto border border-slate-300 rounded">
              <table className="w-full text-left border-collapse text-[11px] font-mono tabular-nums">
                <thead className="bg-slate-100 border-b border-slate-300 text-slate-700">
                  <tr>
                    <th className="py-1.5 px-2.5">Ref</th>
                    <th className="py-1.5 px-2.5">Matrix</th>
                    <th className="py-1.5 px-2.5">Unit MPN</th>
                    <th className="py-1.5 px-2.5">Bank C / ESR</th>
                    <th className="py-1.5 px-2.5">V_op / V_rate</th>
                    <th className="py-1.5 px-2.5">I_rms Util</th>
                    <th className="py-1.5 px-2.5">L10 / T_hot</th>
                    <th className="py-1.5 px-2.5">Verdict</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {ch.capacitorSchedule.rows.map(({ req, sol }) => (
                    <tr key={req.id}>
                      <td className="py-1.5 px-2.5 font-bold">{req.designator}</td>
                      <td className="py-1.5 px-2.5">
                        {sol.seriesCount}S×{sol.parallelCount}P
                      </td>
                      <td className="py-1.5 px-2.5">{sol.unitPart.mpn}</td>
                      <td className="py-1.5 px-2.5">
                        {sol.bank_C_uF < 1
                          ? `${(sol.bank_C_uF * 1000).toFixed(1)}nF`
                          : `${sol.bank_C_uF.toFixed(0)}µF`}{' '}
                        / {sol.bank_ESR_mOhm.toFixed(1)}mΩ
                      </td>
                      <td className="py-1.5 px-2.5">
                        {req.V_op_pk_V.toFixed(0)}/{sol.bank_V_rated_V}V ({sol.voltageDerating_pct.toFixed(0)}%)
                      </td>
                      <td className="py-1.5 px-2.5">{sol.rippleUtilization_pct.toFixed(0)}%</td>
                      <td className="py-1.5 px-2.5">
                        {(sol.L10_life_hrs / 1000).toFixed(0)}k h / {sol.T_hotspot_C.toFixed(0)}°C
                      </td>
                      <td className="py-1.5 px-2.5 font-medium">
                        {sol.status === 'critical' ? (
                          <span className="text-rose-700">Fail</span>
                        ) : sol.status === 'warning' ? (
                          <span className="text-amber-700">Tight</span>
                        ) : (
                          <span className="text-emerald-700">Pass</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Vector SVG Figures (captured into PDF automatically) */}
        {ch.figures && ch.figures.length > 0 && (
          <div className="grid grid-cols-1 gap-4">
            {ch.figures.map((fig) => (
              <figure
                key={fig.figId}
                data-report-fig={fig.figId}
                className="report-avoid-break space-y-1.5"
              >
                {renderFigureById(fig.figId)}
                <figcaption className="text-[11px] font-mono text-slate-600 text-center">
                  {fig.caption}
                </figcaption>
              </figure>
            ))}
          </div>
        )}

        {/* Final Engineering Audit Findings Table */}
        {ch.stage === 'audit' && (
          <>
            {scopedAlerts.all.length === 0 && ch.status === 'pass' ? (
              <div className="border border-emerald-500 bg-emerald-50 rounded-md p-4 flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-bold text-emerald-900">
                    PASSED — Zero Critical Violations &amp; Zero Warnings Active
                  </div>
                  <p className="text-xs text-emerald-800 mt-1">
                    All magnetic saturation margins, Steinmetz thermal equilibria, semiconductor SOA limits, passive capacitor banks, control loop phase/gain margins, and IEC safety clearances pass verification.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-2.5">
                <p className="text-xs text-slate-700">
                  Active verification flagged{' '}
                  <strong className="text-rose-700">
                    {scopedAlerts.danger.length} critical alert(s) / {failedChapters.length} failed chapter(s)
                  </strong>{' '}
                  and{' '}
                  <strong className="text-amber-700">
                    {scopedAlerts.warning.length} warning alert(s) / {warnedChapters.length} warned chapter(s)
                  </strong>
                  :
                </p>
                {scopedAlerts.all.length > 0 && (
                  <div className="border border-slate-300 rounded overflow-hidden">
                    <table className="w-full text-left border-collapse text-[11px] font-mono">
                      <thead className="bg-slate-100 border-b border-slate-300 text-slate-700">
                        <tr>
                          <th className="py-1.5 px-2.5">Severity</th>
                          <th className="py-1.5 px-2.5">Stage</th>
                          <th className="py-1.5 px-2.5">Finding</th>
                          <th className="py-1.5 px-2.5">Measured Telemetry</th>
                          <th className="py-1.5 px-2.5">Recommended Fix</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {scopedAlerts.all.map((a) => (
                          <tr key={a.id}>
                            <td className="py-1.5 px-2.5 font-medium">
                              <span className={a.severity === 'danger' ? 'text-rose-700' : 'text-amber-700'}>
                                {a.severity === 'danger' ? 'Danger' : 'Warning'}
                              </span>
                            </td>
                            <td className="py-1.5 px-2.5">{a.domainLabel}</td>
                            <td className="py-1.5 px-2.5 font-sans font-semibold">{a.title}</td>
                            <td className="py-1.5 px-2.5 tabular-nums">{a.metric}</td>
                            <td className="py-1.5 px-2.5 font-sans text-slate-700">
                              {a.fixes?.[0]?.label || a.actionHint}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            <footer className="pt-6 border-t border-slate-300 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-slate-500">
              <span>Power Converter Design Studio · Prepared By: Ahmed Emad</span>
              <span>Document Date: {model.dateStr} · Engineering Design Book Specification</span>
            </footer>
          </>
        )}
      </section>
    );
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Engineering Design Report Book"
      className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex flex-col report-print-root"
    >
      {/* STICKY TOOLBAR (Hidden when printing) */}
      <div className="no-print bg-slate-950 text-slate-100 border-b border-slate-800 px-4 lg:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2.5">
          <BookOpen className="w-4 h-4 text-cyan-400 shrink-0" />
          <div>
            <div className="text-xs font-semibold tracking-tight text-white">
              Engineering Design Book &amp; Step-by-Step Verification Report
            </div>
            <div className="text-[11px] text-slate-400">
              Selection rationale (&ldquo;Why Chosen&rdquo;), KaTeX derivations, figures &amp; real multi-page PDF download
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Scope Selector */}
          <div className="inline-flex items-center bg-slate-900 border border-slate-800 rounded p-0.5 text-xs">
            {(
              [
                { id: 'both', label: 'Complete System (AC-DC + DC-DC)' },
                { id: 'dcdc', label: 'DC-DC Converter' },
                { id: 'acdc', label: 'AC-DC PFC' },
              ] as { id: ReportStageScope; label: string }[]
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setScope(opt.id)}
                className={`px-2.5 py-1 rounded text-xs font-medium cursor-pointer transition-colors whitespace-nowrap ${
                  scope === opt.id
                    ? 'bg-cyan-600 text-white'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Primary PDF Action (div:nth-of-type(2) > button:nth-of-type(1)) */}
          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={pdfBusy}
            className="h-8 px-3 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-70 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap"
            title="Generate & download real multi-page vector PDF engineering book with clickable TOC and embedded high-DPI figures"
          >
            {pdfBusy ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <FileDown className="w-3.5 h-3.5" />
            )}
            {pdfBusy ? 'Generating PDF...' : pdfNotice ? pdfNotice : 'Download PDF'}
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            className="h-8 px-2.5 rounded border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-200 text-xs inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            title="Open native browser print dialog"
          >
            <Printer className="w-3.5 h-3.5" />
            Print
          </button>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close design report"
            className="h-8 px-2.5 rounded border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-200 text-xs inline-flex items-center gap-1 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
            Close
          </button>
        </div>
      </div>

      {/* SCROLLABLE WHITE-PAPER ENGINEERING BOOK BODY */}
      <div className="flex-1 overflow-y-auto bg-slate-200 py-6 px-3 sm:px-6 report-print-root">
        <article
          ref={articleRef}
          className="max-w-[960px] mx-auto bg-white text-slate-900 shadow-xl border border-slate-300 rounded-sm p-6 sm:p-10 space-y-8 report-print-root"
        >
          {/* COVER TITLE BLOCK & SYSTEM VERIFICATION SUMMARY */}
          <header className="border-b-2 border-slate-900 pb-6 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="text-[11px] font-mono font-bold uppercase tracking-widest text-cyan-800">
                  POWER CONVERTER DESIGN STUDIO · ENGINEERING DESIGN SPECIFICATION BOOK
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
                  {model.title}
                </h1>
                <p className="text-xs text-slate-600">
                  Prepared By: <strong className="text-slate-900">Ahmed Emad</strong> · Date: {model.dateStr} · Scope:{' '}
                  <span className="font-mono font-semibold text-slate-900">{model.scopeLabel}</span>
                </p>
              </div>

              <div
                className={`border rounded-md px-3.5 py-2 text-xs font-mono ${
                  totalFailCount > 0
                    ? 'border-rose-600 bg-rose-50 text-rose-800'
                    : totalWarnCount > 0
                    ? 'border-amber-600 bg-amber-50 text-amber-900'
                    : 'border-emerald-600 bg-emerald-50 text-emerald-900'
                }`}
              >
                <div className="font-bold flex items-center gap-1.5">
                  {totalFailCount > 0 ? (
                    <ShieldAlert className="w-4 h-4" />
                  ) : totalWarnCount > 0 ? (
                    <AlertTriangle className="w-4 h-4" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  <span>
                    {totalFailCount > 0
                      ? `${scopedAlerts.danger.length > 0 ? scopedAlerts.danger.length : failedChapters.length} CRITICAL VIOLATION(S)`
                      : totalWarnCount > 0
                      ? `${scopedAlerts.warning.length > 0 ? scopedAlerts.warning.length : warnedChapters.length} ADVISORY WARNING(S)`
                      : 'ALL CHECKS NOMINAL'}
                  </span>
                </div>
                <div className="text-[10px] mt-0.5 tabular-nums">
                  Danger: {scopedAlerts.danger.length} ({failedChapters.length} ch) · Warning: {scopedAlerts.warning.length} ({warnedChapters.length} ch)
                </div>
              </div>
            </div>

            {/* Executive Summary KPI Table */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              {includeAcDc && (
                <div className="border border-slate-200 rounded p-3 bg-slate-50/70">
                  <div className="text-[11px] font-medium text-indigo-800 mb-1.5">
                    Stage A · AC-DC PFC Summary ({acdcState.topology})
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs font-mono tabular-nums">
                    <div>
                      <span className="text-[10px] text-slate-500 block">AC Input</span>
                      <strong>{acdcState.Vac_rms_V} Vac</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block">DC Bus / P_out</span>
                      <strong>
                        {acdcState.Vdc_bus_V}V / {(acdcState.Pout_W / 1000).toFixed(2)}kW
                      </strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block">Efficiency / PF</span>
                      <strong className="text-emerald-700">
                        {acdcRes.efficiency_pct.toFixed(2)}% / {acdcRes.powerFactor_true.toFixed(3)}
                      </strong>
                    </div>
                  </div>
                </div>
              )}

              {includeDcDc && (
                <div className="border border-slate-200 rounded p-3 bg-slate-50/70">
                  <div className="text-[11px] font-medium text-cyan-800 mb-1.5">
                    Stage B · DC-DC Converter Summary ({dcdcState.topology.toUpperCase()})
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs font-mono tabular-nums">
                    <div>
                      <span className="text-[10px] text-slate-500 block">V_in → V_out</span>
                      <strong>
                        {dcdcState.Vin_nom_V}V → {dcdcState.Vout_V}V
                      </strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block">Power / f_sw</span>
                      <strong>
                        {(dcdcState.Pout_W / 1000).toFixed(2)}kW @ {dcdcState.fsw_kHz}kHz
                      </strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block">Efficiency / T_core</span>
                      <strong
                        className={
                          dcdcRes.coreThermalAnalysis.Tcore_hotspot_C > 125
                            ? 'text-rose-700'
                            : 'text-emerald-700'
                        }
                      >
                        {dcdcRes.efficiency_pct.toFixed(2)}% /{' '}
                        {dcdcRes.coreThermalAnalysis.Tcore_hotspot_C.toFixed(0)}°C
                      </strong>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </header>

          {/* TABLE OF CONTENTS */}
          <section id="toc" className="border border-slate-300 rounded-md p-5 bg-slate-50/60 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-300 pb-2">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
                <ListTree className="w-4 h-4 text-cyan-700" />
                <span>Table of Contents</span>
              </div>
              <span className="text-[11px] font-mono text-slate-500">
                Click any chapter to jump · Sequential Calculation &amp; Selection Order
              </span>
            </div>

            <ol className="space-y-1.5">
              {model.chapters.map((ch) => (
                <li key={ch.id}>
                  <a
                    href={`#${ch.id}`}
                    onClick={(e) => {
                      e.preventDefault();
                      document
                        .getElementById(ch.id)
                        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }}
                    className="group flex items-baseline justify-between gap-3 py-1 px-2 rounded hover:bg-white border border-transparent hover:border-slate-200 transition-colors"
                  >
                    <div className="min-w-0">
                      <span className="font-mono font-bold text-xs text-cyan-800 mr-2">
                        Chapter {ch.num}.
                      </span>
                      <span className="text-xs font-semibold text-slate-900 group-hover:text-cyan-800">
                        {ch.title}
                      </span>
                      <span className="text-[11px] text-slate-500 ml-2 hidden sm:inline">
                        — {ch.subtitle}
                      </span>
                    </div>
                    <span
                      className={`text-[10px] font-mono font-medium shrink-0 ${
                        ch.status === 'fail'
                          ? 'text-rose-700'
                          : ch.status === 'warn'
                          ? 'text-amber-700'
                          : 'text-emerald-700'
                      }`}
                    >
                      {ch.status === 'fail' ? 'Fail' : ch.status === 'warn' ? 'Warn' : 'Pass'}
                    </span>
                  </a>
                </li>
              ))}
            </ol>
          </section>

          {/* ALL CHAPTERS RENDERED SEQUENTIALLY */}
          <div className="space-y-8">{model.chapters.map((ch, idx) => renderChapter(ch, idx))}</div>
        </article>
      </div>
    </div>
  );
};
