import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Bot,
  Check,
  CheckCircle2,
  Loader2,
  MessageSquare,
  PanelRightClose,
  PanelRightOpen,
  Play,
  RefreshCw,
  Send,
  Settings,
  ShieldAlert,
  ShieldCheck,
  SkipForward,
  Undo2,
  Wrench,
  X,
} from 'lucide-react';
import {
  AiAppliedLogEntry,
  AiContextInputs,
  AiStagedFix,
  DesignRollbackSnapshot,
  dryRunProposedFix,
  simulateSequentialSafeBatch,
} from '../engine/aiAgentEngine';
import { DesignAlertFix, DesignAlertItem } from '../engine/designAlerts';
import { AI_PROVIDER_META, AiProviderConfig } from '../engine/aiProviderConfig';
import { AiProviderSettingsPanel } from './AiProviderSettingsPanel';

export interface AiChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: string;
  attachedFixes?: AiStagedFix[];
  error?: string;
}

interface AiEngineerDrawerProps {
  isEnabled: boolean;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onTurnOff: () => void;
  isAuditing: boolean;
  isVerifyingPass: boolean;
  auditError: string | null;
  isAuditStale: boolean;
  overallVerdict: 'critical' | 'warning' | 'verified-safe' | null;
  headline: string;
  executiveSummary: string;
  stagedFixes: AiStagedFix[];
  appliedLog: AiAppliedLogEntry[];
  rollbackSnapshot: DesignRollbackSnapshot | null;
  chatMessages: AiChatMessage[];
  isSendingChat: boolean;
  ctx: AiContextInputs;
  onRunAudit: () => void;
  onApplySingleFix: (staged: AiStagedFix) => void;
  onSkipFix: (fixId: string) => void;
  onApproveAllSafeFixes: () => void;
  onUndoLastBatch: () => void;
  onSendChat: (question: string) => void;
  onJumpToAlertId: (alertId: string, domain: 'dcdc' | 'acdc') => void;
  onJumpToAlertObj: (alert: DesignAlertItem) => void;
  aiConfig: AiProviderConfig;
  onChangeAiConfig: (next: AiProviderConfig) => void;
}

export const AiEngineerDrawer: React.FC<AiEngineerDrawerProps> = ({
  isEnabled,
  isCollapsed,
  onToggleCollapse,
  onTurnOff,
  isAuditing,
  isVerifyingPass,
  auditError,
  isAuditStale,
  overallVerdict,
  headline,
  executiveSummary,
  stagedFixes,
  appliedLog,
  rollbackSnapshot,
  chatMessages,
  isSendingChat,
  ctx,
  onRunAudit,
  onApplySingleFix,
  onSkipFix,
  onApproveAllSafeFixes,
  onUndoLastBatch,
  onSendChat,
  onJumpToAlertId,
  aiConfig,
  onChangeAiConfig,
}) => {
  const [activeTab, setActiveTab] = useState<'plan' | 'chat'>('plan');
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);
  const [chatInput, setChatInput] = useState<string>('');
  const chatBottomRef = useRef<HTMLDivElement | null>(null);

  const activeStaged = useMemo(
    () => stagedFixes.filter((f) => !f.skipped && !f.applied),
    [stagedFixes]
  );

  const safeBatchPreview = useMemo(
    () => simulateSequentialSafeBatch(activeStaged, ctx),
    [activeStaged, ctx]
  );

  const dangerCount = ctx.designAlerts.danger.length;
  const warningCount = ctx.designAlerts.warning.length;

  const quickPrompts = useMemo(() => {
    if (dangerCount > 0) {
      return [
        'Explain root causes of active Danger alerts and trade-offs',
        'Can I resolve thermal & saturation issues without sacrificing efficiency?',
        'Check secondary MOSFET ringing & ZVS margins across line limits',
      ];
    }
    if (warningCount > 0) {
      return [
        'How should I clean up the remaining Warning margins?',
        'Audit small-signal phase margin and subharmonic Qp stability',
        'Review passive capacitor bank life and inductor flux headroom',
      ];
    }
    return [
      'Summarize overall safety margins for both AC-DC and DC-DC stages',
      'Suggest targeted efficiency optimizations keeping 0 Danger',
      'Verify thermal headroom at high ambient and worst-case line',
    ];
  }, [dangerCount, warningCount]);

  if (!isEnabled) return null;

  // Collapsed edge restore strip (keeps AI Engineer ON without occupying main canvas width)
  if (isCollapsed) {
    return (
      <div className="no-print fixed right-0 top-24 z-30 flex flex-col items-end">
        <button
          type="button"
          onClick={onToggleCollapse}
          className="px-2.5 py-3 bg-white dark:bg-[#0E131D] border border-r-0 border-slate-200 dark:border-slate-700 rounded-l-lg shadow-lg flex flex-col items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-cyan-500 dark:hover:border-cyan-500 transition-colors cursor-pointer"
          title="Expand AI Engineer Drawer"
        >
          <PanelRightOpen className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
          <span
            className="text-[11px] font-semibold tracking-wide whitespace-nowrap"
            style={{ writingMode: 'vertical-rl' }}
          >
            AI Engineer
          </span>
          {dangerCount > 0 ? (
            <span className="font-mono text-[10px] font-bold text-rose-600 dark:text-rose-400 tabular-nums">
              {dangerCount}D
            </span>
          ) : warningCount > 0 ? (
            <span className="font-mono text-[10px] font-bold text-amber-600 dark:text-amber-400 tabular-nums">
              {warningCount}W
            </span>
          ) : (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
          )}
        </button>
      </div>
    );
  }

  const handleChatSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = chatInput.trim();
    if (!trimmed || isSendingChat) return;
    setChatInput('');
    onSendChat(trimmed);
    setTimeout(() => {
      chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 60);
  };

  return (
    <aside
      aria-label="AI Engineer Workspace"
      className="no-print fixed lg:sticky top-14 right-0 bottom-0 lg:h-[calc(100vh-3.5rem)] w-full sm:w-[420px] xl:w-[450px] shrink-0 z-30 bg-white dark:bg-[#0E131D] border-l border-slate-200 dark:border-slate-800 flex flex-col shadow-xl lg:shadow-none"
    >
      {/* DRAWER HEADER */}
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0F17] flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Bot className="w-4 h-4 text-cyan-600 dark:text-cyan-400 shrink-0" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
              AI Engineer
            </h2>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 font-mono tabular-nums">
            {isAuditing ? (
              <span className="inline-flex items-center gap-1 text-cyan-700 dark:text-cyan-300">
                <Loader2 className="w-3 h-3 animate-spin" />
                {isVerifyingPass ? 'Verifying post-fix physics...' : 'Auditing full design...'}
              </span>
            ) : dangerCount > 0 ? (
              <span className="text-rose-700 dark:text-rose-400 font-semibold">
                {dangerCount} Danger · {warningCount} Warning
              </span>
            ) : warningCount > 0 ? (
              <span className="text-amber-700 dark:text-amber-400 font-semibold">
                0 Danger · {warningCount} Warning
              </span>
            ) : (
              <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                Verified Safe · All Limits OK
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setSettingsOpen((s) => !s)}
            aria-expanded={settingsOpen}
            className={`h-7 px-2 rounded border text-[11px] font-medium inline-flex items-center gap-1 cursor-pointer transition-colors whitespace-nowrap ${
              settingsOpen
                ? 'bg-cyan-600 border-cyan-500 text-white'
                : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-[#131A26] text-slate-700 dark:text-slate-200 hover:border-cyan-500'
            }`}
            title={`Configure AI Provider & API Key (${AI_PROVIDER_META[aiConfig.provider].label} · ${aiConfig.model})`}
          >
            <Settings className="w-3 h-3" />
            <span>{AI_PROVIDER_META[aiConfig.provider].shortLabel}</span>
            {aiConfig.apiKey && (
              <span
                className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0"
                title="Custom API key configured"
              />
            )}
          </button>
          <button
            type="button"
            onClick={onRunAudit}
            disabled={isAuditing}
            className="h-7 px-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#131A26] text-[11px] font-medium text-slate-700 dark:text-slate-200 hover:border-cyan-500 disabled:opacity-50 inline-flex items-center gap-1 cursor-pointer transition-colors whitespace-nowrap"
            title="Re-audit full design state"
          >
            <RefreshCw className={`w-3 h-3 ${isAuditing ? 'animate-spin' : ''}`} />
            <span>Re-Audit</span>
          </button>
          <button
            type="button"
            onClick={onToggleCollapse}
            className="h-7 w-7 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#131A26] text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 inline-flex items-center justify-center cursor-pointer transition-colors"
            title="Collapse drawer (keep AI Engineer ON)"
            aria-label="Collapse drawer"
          >
            <PanelRightClose className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onTurnOff}
            className="h-7 w-7 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#131A26] text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 inline-flex items-center justify-center cursor-pointer transition-colors"
            title="Turn AI Engineer OFF"
            aria-label="Turn AI Engineer OFF"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* MODE SWITCHER */}
      <div className="px-4 py-2 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 bg-white dark:bg-[#0E131D]">
        <div className="inline-flex items-center gap-1 p-0.5 rounded-md bg-slate-100 dark:bg-[#090C12] border border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setActiveTab('plan')}
            className={`px-3 py-1 text-xs font-medium rounded transition-colors inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeTab === 'plan'
                ? 'bg-white dark:bg-[#161E2E] text-cyan-700 dark:text-cyan-300 border border-slate-200 dark:border-slate-700 font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 border border-transparent'
            }`}
          >
            <Wrench className="w-3.5 h-3.5" />
            <span>Fix Plan ({activeStaged.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('chat')}
            className={`px-3 py-1 text-xs font-medium rounded transition-colors inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeTab === 'chat'
                ? 'bg-white dark:bg-[#161E2E] text-cyan-700 dark:text-cyan-300 border border-slate-200 dark:border-slate-700 font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 border border-transparent'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Ask AI</span>
          </button>
        </div>

        {rollbackSnapshot && (
          <button
            type="button"
            onClick={onUndoLastBatch}
            className="px-2 py-1 text-[11px] font-medium rounded border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white inline-flex items-center gap-1 cursor-pointer transition-colors whitespace-nowrap"
            title={`Restore snapshot prior to: ${rollbackSnapshot.label}`}
          >
            <Undo2 className="w-3 h-3" />
            <span>Undo</span>
          </button>
        )}
      </div>

      {/* EXPANDABLE AI PROVIDER & API KEY SETTINGS */}
      {settingsOpen && (
        <div className="p-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0E131D]">
          <AiProviderSettingsPanel
            aiConfig={aiConfig}
            onChangeAiConfig={onChangeAiConfig}
            compact
            onClose={() => setSettingsOpen(false)}
          />
        </div>
      )}

      {/* STALE AUDIT NOTICE */}
      {isAuditStale && !isAuditing && (
        <div className="px-4 py-2 bg-amber-50 dark:bg-amber-950/20 border-b border-amber-200 dark:border-amber-800/60 flex items-center justify-between gap-2">
          <span className="text-[11px] text-amber-800 dark:text-amber-300">
            Design parameters changed since last AI audit.
          </span>
          <button
            type="button"
            onClick={onRunAudit}
            className="px-2 py-1 rounded bg-amber-600 hover:bg-amber-500 text-white text-[11px] font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors"
          >
            Re-Analyze
          </button>
        </div>
      )}

      {/* BODY */}
      {activeTab === 'plan' ? (
        <div className="flex-1 overflow-y-auto divide-y divide-slate-200 dark:divide-slate-800">
          {/* ERROR STATE */}
          {auditError && (
            <div className="p-4 bg-rose-50 dark:bg-rose-950/20 space-y-2">
              <div className="flex items-start gap-2 text-xs font-semibold text-rose-700 dark:text-rose-300">
                <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                <span>AI Audit Request Failed</span>
              </div>
              <p className="text-xs text-rose-700 dark:text-rose-300 leading-relaxed">
                {auditError}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={onRunAudit}
                  className="px-3 py-1.5 rounded bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium cursor-pointer"
                >
                  Retry Audit
                </button>
                <button
                  type="button"
                  onClick={() => setSettingsOpen(true)}
                  className="px-3 py-1.5 rounded border border-rose-300 dark:border-rose-700 bg-white dark:bg-[#131A26] text-rose-700 dark:text-rose-200 hover:border-cyan-500 text-xs font-medium cursor-pointer"
                >
                  AI Provider &amp; API Key
                </button>
              </div>
            </div>
          )}

          {/* 1-CLICK APPROVE ALL ACTION BAR */}
          {safeBatchPreview.fixesToApply.length > 0 && (
            <div className="p-4 bg-slate-50 dark:bg-[#0B0F17] space-y-2.5">
              <button
                type="button"
                onClick={onApproveAllSafeFixes}
                disabled={isAuditing}
                className="w-full py-2 px-4 rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <Play className="w-3.5 h-3.5" />
                <span>
                  Approve & Apply All Safe Fixes ({safeBatchPreview.fixesToApply.length})
                </span>
              </button>
              {safeBatchPreview.finalContext && (
                <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-600 dark:text-slate-300">
                  <span>Predicted Outcome:</span>
                  <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                    Danger {dangerCount} → {safeBatchPreview.finalContext.designAlerts.danger.length} · Warn{' '}
                    {warningCount} → {safeBatchPreview.finalContext.designAlerts.warning.length}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* LOADING SKELETON / AUDIT SUMMARY */}
          {isAuditing ? (
            <div className="p-4 space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-cyan-700 dark:text-cyan-300">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>
                  {isVerifyingPass
                    ? 'Running agentic verification pass on updated design...'
                    : 'Inspecting AC-DC PFC, DC-DC magnetics, thermals, caps & Bode loops...'}
                </span>
              </div>
              <div className="space-y-2">
                <div className="h-3 w-3/4 rounded bg-slate-200 dark:bg-slate-800 animate-pulse" />
                <div className="h-3 w-full rounded bg-slate-200 dark:bg-slate-800 animate-pulse" />
                <div className="h-3 w-5/6 rounded bg-slate-200 dark:bg-slate-800 animate-pulse" />
              </div>
            </div>
          ) : (
            (headline || executiveSummary) && (
              <div className="p-4 space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-900 dark:text-slate-100">
                  {overallVerdict === 'verified-safe' || (dangerCount === 0 && warningCount === 0) ? (
                    <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
                  ) : overallVerdict === 'critical' || dangerCount > 0 ? (
                    <ShieldAlert className="w-4 h-4 text-rose-500 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                  )}
                  <span>{headline || 'AI Design Verification Summary'}</span>
                </div>
                {executiveSummary && (
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    {executiveSummary}
                  </p>
                )}
              </div>
            )
          )}

          {/* ALL CLEAR VERIFIED SIGN-OFF */}
          {!isAuditing && activeStaged.length === 0 && dangerCount === 0 && warningCount === 0 && (
            <div className="p-4 space-y-3">
              <div className="p-3.5 rounded-md border border-emerald-500/40 bg-emerald-50/60 dark:bg-emerald-950/20 space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>All Magnetic, Thermal, Electrical & Stability Checks Pass</span>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px] font-mono tabular-nums text-slate-700 dark:text-slate-300 pt-1">
                  <div>
                    DC-DC η: <span className="font-semibold">{ctx.dcdcRes.efficiency_pct.toFixed(2)}%</span>
                  </div>
                  <div>
                    AC-DC η: <span className="font-semibold">{ctx.acdcRes.efficiency_pct.toFixed(2)}%</span>
                  </div>
                  <div>
                    T_core: <span className="font-semibold">{ctx.dcdcRes.coreThermalAnalysis.Tcore_hotspot_C.toFixed(1)}°C</span>
                  </div>
                  <div>
                    T_j,sec: <span className="font-semibold">{ctx.dcdcRes.Tj_sec_C.toFixed(1)}°C</span>
                  </div>
                  <div>
                    Loop PM: <span className="font-semibold">{ctx.dcdcRes.pm_actual_deg.toFixed(1)}°</span>
                  </div>
                  <div>
                    B_pk/B_sat: <span className="font-semibold">{ctx.dcdcRes.saturationCheck.utilization_100C_pct.toFixed(0)}%</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STAGED FIX QUEUE */}
          {activeStaged.length > 0 && (
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {activeStaged.map((item, idx) => {
                const isDanger = item.severity === 'danger';
                const v = item.validation;
                return (
                  <div key={item.id || `${item.alertId}-${idx}`} className="p-4 space-y-2.5">
                    {/* Unboxed metadata row */}
                    <div className="flex items-center justify-between gap-2 text-[11px] font-mono">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {isDanger ? (
                          <ShieldAlert className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                        ) : (
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                        )}
                        <span
                          className={`font-semibold ${
                            isDanger
                              ? 'text-rose-700 dark:text-rose-400'
                              : item.severity === 'warning'
                              ? 'text-amber-700 dark:text-amber-400'
                              : 'text-cyan-700 dark:text-cyan-300'
                          }`}
                        >
                          {item.severity === 'danger'
                            ? 'Danger'
                            : item.severity === 'warning'
                            ? 'Warning'
                            : 'Optimization'}
                        </span>
                        <span className="text-slate-400" aria-hidden="true">·</span>
                        <span className="text-slate-600 dark:text-slate-300 font-semibold">
                          {item.domain === 'dcdc' ? 'DC-DC' : 'AC-DC'}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => onJumpToAlertId(item.alertId, item.domain)}
                        className="inline-flex items-center gap-0.5 text-cyan-700 dark:text-cyan-300 hover:underline cursor-pointer shrink-0"
                      >
                        <span>Inspect</span>
                        <ArrowUpRight className="w-3 h-3" />
                      </button>
                    </div>

                    <div className="space-y-1">
                      <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 leading-snug">
                        {item.title}
                      </div>
                      <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                        {item.rationale}
                      </p>
                      {item.couplingNote && (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                          Trade-off: {item.couplingNote}
                        </p>
                      )}
                    </div>

                    {/* Exact Change & Dry-Run Physics Result */}
                    <div className="p-2.5 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0F17] space-y-1.5 text-[11px]">
                      <div className="font-mono text-slate-800 dark:text-slate-200 font-medium">
                        {item.patchSummary}
                      </div>
                      {v.valid ? (
                        <div className="space-y-1">
                          <div className="font-mono tabular-nums text-[10px] text-emerald-700 dark:text-emerald-300 flex flex-wrap gap-x-2.5 gap-y-0.5">
                            <span>
                              Alerts: {v.dangerBefore}D/{v.warningBefore}W → {v.dangerAfter}D/{v.warningAfter}W
                            </span>
                            {v.physicsDeltas.map((d, di) => (
                              <span key={di}>{d}</span>
                            ))}
                          </div>
                          {v.newDangersIntroduced.length > 0 && (
                            <div className="text-[10px] text-rose-700 dark:text-rose-400 font-medium">
                              Blocked from Auto-Apply: would trigger {v.newDangersIntroduced.join(', ')}
                            </div>
                          )}
                          {v.alreadyResolved && (
                            <div className="text-[10px] text-emerald-700 dark:text-emerald-400">
                              Already satisfied by current design state.
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-[10px] text-rose-700 dark:text-rose-400">
                          Validation note: {v.validationError}
                        </div>
                      )}
                    </div>

                    {/* Action Row */}
                    <div className="flex items-center justify-between gap-2 pt-0.5">
                      <button
                        type="button"
                        onClick={() => onApplySingleFix(item)}
                        disabled={!v.valid || !v.resolvedFix || v.alreadyResolved}
                        className="px-3 py-1.5 rounded bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white text-[11px] font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                      >
                        <Check className="w-3 h-3" />
                        <span>Apply Fix</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onSkipFix(item.id)}
                        className="px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-700 text-[11px] text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white inline-flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        <SkipForward className="w-3 h-3" />
                        <span>Skip</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* APPLIED LOG */}
          {appliedLog.length > 0 && (
            <div className="p-4 space-y-2 bg-slate-50/60 dark:bg-[#0B0F17]/60">
              <div className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                Applied AI Changes ({appliedLog.length})
              </div>
              <div className="space-y-1.5">
                {appliedLog.slice(0, 6).map((entry) => (
                  <div
                    key={entry.id}
                    className="text-[11px] flex items-start justify-between gap-2 py-1 border-b border-slate-200/70 dark:border-slate-800/70 last:border-b-0"
                  >
                    <div className="min-w-0">
                      <div className="font-medium text-slate-800 dark:text-slate-200 truncate">
                        {entry.title}
                      </div>
                      <div className="font-mono text-[10px] text-emerald-700 dark:text-emerald-400 tabular-nums">
                        {entry.resultDelta}
                      </div>
                    </div>
                    <span className="font-mono text-[10px] text-slate-400 shrink-0 tabular-nums">
                      {entry.timestamp}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* ASK AI (INTERACTIVE Q&A TAB) */
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {chatMessages.length === 0 ? (
              <div className="space-y-3">
                <div className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  Ask anything about your live AC-DC PFC, DC-DC converter, transformer magnetics,
                  capacitor banks, thermal margins, or Bode stability. If a design change helps,
                  I will attach a physics-verified 1-click patch right in the answer.
                </div>
                <div className="space-y-1.5">
                  <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    Suggested questions for current state:
                  </div>
                  {quickPrompts.map((qp) => (
                    <button
                      key={qp}
                      type="button"
                      onClick={() => onSendChat(qp)}
                      className="w-full text-left px-3 py-2 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0F17] hover:border-cyan-500 text-xs text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
                    >
                      {qp}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              chatMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`space-y-2 ${
                    msg.role === 'user' ? 'pl-6' : 'pr-2'
                  }`}
                >
                  <div
                    className={`p-3 rounded-md border text-xs leading-relaxed whitespace-pre-wrap ${
                      msg.role === 'user'
                        ? 'bg-cyan-50/70 dark:bg-cyan-950/30 border-cyan-200 dark:border-cyan-800/60 text-slate-900 dark:text-slate-100'
                        : msg.error
                        ? 'bg-rose-50 dark:bg-rose-950/25 border-rose-200 dark:border-rose-800/60 text-rose-800 dark:text-rose-200'
                        : 'bg-slate-50 dark:bg-[#0B0F17] border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 dark:text-slate-400 mb-1">
                      <span>{msg.role === 'user' ? 'Engineer' : 'AI Engineer'}</span>
                      <span className="tabular-nums">{msg.timestamp}</span>
                    </div>
                    <div>{msg.text}</div>
                    {msg.error && (
                      <div className="mt-2">
                        <button
                          type="button"
                          onClick={() => setSettingsOpen(true)}
                          className="px-2.5 py-1 rounded border border-rose-300 dark:border-rose-700 bg-white dark:bg-[#131A26] text-rose-700 dark:text-rose-200 hover:border-cyan-500 text-[11px] font-medium cursor-pointer"
                        >
                          Configure AI Provider &amp; API Key
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Inline Executable Patches Attached to AI Q&A Reply */}
                  {msg.attachedFixes && msg.attachedFixes.length > 0 && (
                    <div className="space-y-1.5">
                      {msg.attachedFixes.map((af) => {
                        const liveCheck = dryRunProposedFix(af, ctx);
                        return (
                          <div
                            key={af.id}
                            className="p-2.5 rounded-md border border-emerald-500/40 bg-emerald-50/40 dark:bg-emerald-950/15 space-y-1.5"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[11px] font-semibold text-slate-900 dark:text-slate-100">
                                {af.title}
                              </span>
                              <button
                                type="button"
                                onClick={() => onApplySingleFix({ ...af, validation: liveCheck })}
                                disabled={!liveCheck.valid || !liveCheck.resolvedFix || liveCheck.alreadyResolved}
                                className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-[10px] font-semibold shrink-0 cursor-pointer transition-colors"
                              >
                                {liveCheck.alreadyResolved ? 'Applied' : 'Apply Fix'}
                              </button>
                            </div>
                            <div className="text-[10px] font-mono text-slate-700 dark:text-slate-300">
                              {af.patchSummary}
                            </div>
                            {liveCheck.valid && (
                              <div className="text-[10px] font-mono tabular-nums text-emerald-700 dark:text-emerald-300 flex flex-wrap gap-x-2">
                                <span>
                                  Alerts: {liveCheck.dangerBefore}D/{liveCheck.warningBefore}W →{' '}
                                  {liveCheck.dangerAfter}D/{liveCheck.warningAfter}W
                                </span>
                                {liveCheck.physicsDeltas.map((d, i) => (
                                  <span key={i}>{d}</span>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))
            )}

            {isSendingChat && (
              <div className="p-3 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0F17] flex items-center gap-2 text-xs text-cyan-700 dark:text-cyan-300">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Analyzing live converter parameters...</span>
              </div>
            )}
            <div ref={chatBottomRef} />
          </div>

          {/* CHAT COMPOSER */}
          <form
            onSubmit={handleChatSubmit}
            className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0F17] space-y-2"
          >
            <div className="flex items-end gap-2">
              <textarea
                rows={2}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleChatSubmit();
                  }
                }}
                placeholder="Ask about Danger fixes, thermals, magnetics, ZVS, or Bode margins..."
                className="flex-1 resize-none rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0E131D] px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-cyan-500"
              />
              <button
                type="submit"
                disabled={!chatInput.trim() || isSendingChat}
                className="h-9 px-3 rounded-md bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white text-xs font-medium inline-flex items-center justify-center shrink-0 cursor-pointer transition-colors"
                aria-label="Send question to AI Engineer"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </form>
        </div>
      )}
    </aside>
  );
};
