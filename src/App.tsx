/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  ACDC_PRESETS,
  DCDC_PRESETS,
  AcDcDesignState,
  DcDcDesignState,
  hydrateCustomSemiconductors,
  SemiconductorSpec,
} from './data/databases';
import { solveAcDcDesign } from './engine/acdcEngine';
import { solveDcDcDesign } from './engine/dcdcEngine';
import { DesignAlertFix, DesignAlertItem, evaluateDesignAlerts } from './engine/designAlerts';
import { extractCircuitCapacitors, solveCapacitorBank } from './engine/passiveDesignEngine';
import { AcDcSubTab, AcDcWorkbench } from './components/AcDcWorkbench';
import { DcDcSubTab, DcDcWorkbench } from './components/DcDcWorkbench';
import { SmallSignalDashboard } from './components/SmallSignalDashboard';
import { ComponentSearchDrawer } from './components/ComponentSearchDrawer';
import { DesignReportModal } from './components/DesignReportModal';
import { AiChatMessage, AiEngineerDrawer } from './components/AiEngineerDrawer';
import {
  AiAgentServerResponse,
  AiAppliedLogEntry,
  AiContextInputs,
  AiStagedFix,
  DesignRollbackSnapshot,
  buildAiDesignSnapshot,
  computeDesignFingerprint,
  simulateSequentialSafeBatch,
  stageAndValidateAiFixes,
} from './engine/aiAgentEngine';
import {
  AI_PROVIDER_META,
  AiProviderConfig,
  loadAiProviderConfig,
  saveAiProviderConfig,
  toServerAiConfig,
  validateAiProviderConfig,
} from './engine/aiProviderConfig';
import { AiProviderSettingsPanel } from './components/AiProviderSettingsPanel';
import {
  DEFAULT_CAP_BANK_LOCKS,
  DEFAULT_INDUCTOR_LOCKS,
  DesignSolverProvider,
  useDesignSolver,
} from './components/DesignSolverContext';
import {
  Pin,
  RotateCcw,
  Sun,
  Moon,
  Download,
  FileText,
  Cpu,
  Zap,
  Search,
  Compass,
  ShieldAlert,
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  X,
  Bot,
  KeyRound,
} from 'lucide-react';

export default function App() {
  const [acdcState, setAcdcState] = useState<AcDcDesignState>({ ...ACDC_PRESETS[0].state });
  const [dcdcState, setDcdcState] = useState<DcDcDesignState>({ ...DCDC_PRESETS[0].state });

  return (
    <DesignSolverProvider
      dcdcState={dcdcState}
      setDcdcState={setDcdcState}
      acdcState={acdcState}
      setAcdcState={setAcdcState}
    >
      <AppContent
        acdcState={acdcState}
        setAcdcState={setAcdcState}
        dcdcState={dcdcState}
        setDcdcState={setDcdcState}
      />
    </DesignSolverProvider>
  );
}

interface AppContentProps {
  acdcState: AcDcDesignState;
  setAcdcState: React.Dispatch<React.SetStateAction<AcDcDesignState>>;
  dcdcState: DcDcDesignState;
  setDcdcState: React.Dispatch<React.SetStateAction<DcDcDesignState>>;
}

function AppContent({ acdcState, setAcdcState, dcdcState, setDcdcState }: AppContentProps) {
  const {
    setDcdcField,
    applyDcdcPatch,
    clearDcdcChanges,
    setAcdcField,
    applyAcdcPatch,
    clearAcdcChanges,
    inductorConfigs,
    updateInductorConfig,
    replaceInductorConfigs,
    resetInductorConfigs,
    capacitorConfigs,
    updateCapacitorConfig,
    replaceCapacitorConfigs,
    resetCapacitorConfigs,
  } = useDesignSolver();

  const [domainTab, setDomainTab] = useState<'dcdc' | 'acdc' | 'small-signal'>('dcdc');
  const [dcdcSubTab, setDcdcSubTab] = useState<DcDcSubTab>('schematic');
  const [acdcSubTab, setAcdcSubTab] = useState<AcDcSubTab>('schematic');
  const [jumpState, setJumpState] = useState<{ targetItemId?: string | null; nonce: number }>({
    targetItemId: null,
    nonce: 0,
  });
  const [openAlertFilter, setOpenAlertFilter] = useState<'danger' | 'warning' | 'all' | null>(null);
  const [alertStageScope, setAlertStageScope] = useState<'all' | 'active'>('all');
  const alertPopoverRef = useRef<HTMLDivElement | null>(null);

  const [darkMode, setDarkMode] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('powerstage_theme');
      return saved ? saved === 'dark' : true;
    } catch {
      return true;
    }
  });
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);
  const [reportOpen, setReportOpen] = useState<boolean>(false);
  const [dbVersion, setDbVersion] = useState<number>(0);

  // AI Engineer Agent State
  const [aiEnabled, setAiEnabled] = useState<boolean>(false);
  const [aiCollapsed, setAiCollapsed] = useState<boolean>(false);
  const [aiAuditing, setAiAuditing] = useState<boolean>(false);
  const [aiVerifyingPass, setAiVerifyingPass] = useState<boolean>(false);
  const [aiAuditError, setAiAuditError] = useState<string | null>(null);
  const [aiOverallVerdict, setAiOverallVerdict] = useState<'critical' | 'warning' | 'verified-safe' | null>(null);
  const [aiHeadline, setAiHeadline] = useState<string>('');
  const [aiExecutiveSummary, setAiExecutiveSummary] = useState<string>('');
  const [aiStagedFixes, setAiStagedFixes] = useState<AiStagedFix[]>([]);
  const [aiAppliedLog, setAiAppliedLog] = useState<AiAppliedLogEntry[]>([]);
  const [aiRollback, setAiRollback] = useState<DesignRollbackSnapshot | null>(null);
  const [aiChatMessages, setAiChatMessages] = useState<AiChatMessage[]>([]);
  const [aiSendingChat, setAiSendingChat] = useState<boolean>(false);
  const [aiLastAuditedFingerprint, setAiLastAuditedFingerprint] = useState<string>('');
  const [aiConfig, setAiConfigState] = useState<AiProviderConfig>(() => loadAiProviderConfig());
  const [aiKeysModalOpen, setAiKeysModalOpen] = useState<boolean>(false);
  const pendingVerificationRef = useRef<{ active: boolean; appliedSummary: string[] }>({
    active: false,
    appliedSummary: [],
  });

  const handleChangeAiConfig = (next: AiProviderConfig) => {
    setAiConfigState(saveAiProviderConfig(next));
    setAiAuditError(null);
  };

  useEffect(() => {
    if (!aiKeysModalOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAiKeysModalOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [aiKeysModalOpen]);

  const [pinnedAcdc, setPinnedAcdc] = useState<AcDcDesignState | null>(null);
  const [pinnedDcdc, setPinnedDcdc] = useState<DcDcDesignState | null>(null);

  useEffect(() => {
    hydrateCustomSemiconductors();
    setDbVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
    }
    try {
      localStorage.setItem('powerstage_theme', darkMode ? 'dark' : 'light');
    } catch {
      // ignore storage errors
    }
  }, [darkMode]);

  const acdcRes = useMemo(() => solveAcDcDesign(acdcState), [acdcState, dbVersion]);
  const dcdcRes = useMemo(() => solveDcDcDesign(dcdcState), [dcdcState, dbVersion]);

  const pinnedAcdcRes = useMemo(
    () => (pinnedAcdc ? solveAcDcDesign(pinnedAcdc) : null),
    [pinnedAcdc, dbVersion]
  );
  const pinnedDcdcRes = useMemo(
    () => (pinnedDcdc ? solveDcDcDesign(pinnedDcdc) : null),
    [pinnedDcdc, dbVersion]
  );

  const designAlerts = useMemo(
    () =>
      evaluateDesignAlerts({
        dcdcState,
        dcdcRes,
        acdcState,
        acdcRes,
        inductorConfigs,
        capacitorConfigs,
      }),
    [dcdcState, dcdcRes, acdcState, acdcRes, inductorConfigs, capacitorConfigs]
  );

  const aiContextInputs: AiContextInputs = useMemo(
    () => ({
      dcdcState,
      dcdcRes,
      acdcState,
      acdcRes,
      inductorConfigs,
      capacitorConfigs,
      designAlerts,
    }),
    [dcdcState, dcdcRes, acdcState, acdcRes, inductorConfigs, capacitorConfigs, designAlerts]
  );

  const currentFingerprint = useMemo(
    () => computeDesignFingerprint(aiContextInputs),
    [aiContextInputs]
  );

  const isAuditStale =
    Boolean(aiLastAuditedFingerprint) && aiLastAuditedFingerprint !== currentFingerprint;

  const runAiAudit = async (opts?: { isVerificationPass?: boolean; appliedSummary?: string[] }) => {
    const cfgErr = validateAiProviderConfig(aiConfig);
    if (cfgErr) {
      setAiAuditError(cfgErr);
      setAiAuditing(false);
      setAiVerifyingPass(false);
      return;
    }
    const isVerify = Boolean(opts?.isVerificationPass);
    setAiAuditing(true);
    setAiVerifyingPass(isVerify);
    setAiAuditError(null);
    const snapshotFingerprint = computeDesignFingerprint(aiContextInputs);
    try {
      const snapshot = buildAiDesignSnapshot(aiContextInputs);
      const res = await fetch('/api/ai-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'audit',
          snapshot,
          isVerificationPass: isVerify,
          appliedSummary: opts?.appliedSummary || [],
          aiConfig: toServerAiConfig(aiConfig),
        }),
      });
      const rawText = await res.text();
      let data: Record<string, unknown> = {};
      if (rawText) {
        try {
          data = JSON.parse(rawText) as Record<string, unknown>;
        } catch {
          if (!res.ok) {
            const snippet = rawText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180);
            throw new Error(`AI service returned HTTP ${res.status}: ${snippet || res.statusText}`);
          }
          if (/<html|<!doctype/i.test(rawText)) {
            throw new Error(
              'AI request received an HTML page instead of JSON (proxy timeout or session refresh). Try again or switch to gemini-2.5-flash in AI Keys.'
            );
          }
          throw new Error(
            `AI service returned non-JSON (${res.status}): ${rawText.slice(0, 140)}`
          );
        }
      }
      if (!res.ok) {
        throw new Error(
          (typeof data?.error === 'string' && data.error) || `AI service returned HTTP ${res.status}`
        );
      }
      const parsed = data as unknown as AiAgentServerResponse;
      setAiOverallVerdict(parsed.overallVerdict);
      setAiHeadline(parsed.headline);
      setAiExecutiveSummary(parsed.executiveSummary);
      setAiStagedFixes(stageAndValidateAiFixes(parsed.proposedFixes || [], aiContextInputs));
      setAiLastAuditedFingerprint(snapshotFingerprint);
    } catch (err: unknown) {
      setAiAuditError(err instanceof Error ? err.message : 'Failed to run AI design audit.');
    } finally {
      setAiAuditing(false);
      setAiVerifyingPass(false);
    }
  };

  // Trigger automatic post-apply agentic verification pass after React commits updated state
  useEffect(() => {
    if (!aiEnabled || !pendingVerificationRef.current.active) return;
    const summary = pendingVerificationRef.current.appliedSummary;
    pendingVerificationRef.current = { active: false, appliedSummary: [] };
    runAiAudit({ isVerificationPass: true, appliedSummary: summary });
  }, [currentFingerprint, aiEnabled]);

  const handleToggleAiEngineer = () => {
    if (!aiEnabled) {
      setAiEnabled(true);
      setAiCollapsed(false);
      if (!aiLastAuditedFingerprint || aiLastAuditedFingerprint !== currentFingerprint) {
        runAiAudit();
      }
    } else {
      setAiEnabled(false);
    }
  };

  const createRollbackSnapshot = (label: string): DesignRollbackSnapshot => ({
    dcdcState: { ...dcdcState },
    acdcState: { ...acdcState },
    inductorConfigs: { ...inductorConfigs },
    capacitorConfigs: { ...capacitorConfigs },
    label,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
  });

  const handleAiApplySingleFix = (staged: AiStagedFix) => {
    const fix = staged.validation.resolvedFix;
    if (!fix) return;
    setAiRollback(createRollbackSnapshot(staged.title));
    handleApplyAlertFix(fix);
    const deltaStr =
      staged.validation.physicsDeltas[0] ||
      `Danger ${staged.validation.dangerBefore}→${staged.validation.dangerAfter}`;
    setAiAppliedLog((prev) => [
      {
        id: `${staged.id}-${Date.now()}`,
        title: staged.title,
        domain: staged.domain,
        severity: staged.severity,
        patchSummary: staged.patchSummary,
        resultDelta: deltaStr,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
      ...prev,
    ]);
    setAiStagedFixes((prev) =>
      prev.map((item) => (item.id === staged.id ? { ...item, applied: true } : item))
    );
    pendingVerificationRef.current = {
      active: true,
      appliedSummary: [`${staged.title}: ${staged.patchSummary}`],
    };
  };

  const handleAiApproveAllSafeFixes = () => {
    const activeStaged = aiStagedFixes.filter((f) => !f.skipped && !f.applied);
    const batch = simulateSequentialSafeBatch(activeStaged, aiContextInputs);
    if (!batch.finalContext || batch.fixesToApply.length === 0) return;

    setAiRollback(createRollbackSnapshot(`Batch (${batch.fixesToApply.length} fixes)`));
    applyDcdcPatch(batch.finalContext.dcdcState, null, { bypassAutoOpt: true });
    applyAcdcPatch(batch.finalContext.acdcState, null, { bypassAutoOpt: true });
    replaceInductorConfigs(batch.finalContext.inductorConfigs);
    replaceCapacitorConfigs(batch.finalContext.capacitorConfigs);

    const ts = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const newLogs: AiAppliedLogEntry[] = batch.fixesToApply.map(({ stageItem, resultDelta }, i) => ({
      id: `${stageItem.id}-${Date.now()}-${i}`,
      title: stageItem.title,
      domain: stageItem.domain,
      severity: stageItem.severity,
      patchSummary: stageItem.patchSummary,
      resultDelta,
      timestamp: ts,
    }));
    setAiAppliedLog((prev) => [...newLogs, ...prev]);

    const appliedIds = new Set(batch.fixesToApply.map((b) => b.stageItem.id));
    setAiStagedFixes((prev) =>
      prev.map((item) => (appliedIds.has(item.id) ? { ...item, applied: true } : item))
    );

    pendingVerificationRef.current = {
      active: true,
      appliedSummary: batch.fixesToApply.map((b) => `${b.stageItem.title}: ${b.stageItem.patchSummary}`),
    };
  };

  const handleAiUndoLastBatch = () => {
    if (!aiRollback) return;
    applyDcdcPatch(aiRollback.dcdcState, null, { bypassAutoOpt: true });
    applyAcdcPatch(aiRollback.acdcState, null, { bypassAutoOpt: true });
    replaceInductorConfigs(aiRollback.inductorConfigs);
    replaceCapacitorConfigs(aiRollback.capacitorConfigs);
    setAiRollback(null);
    setAiLastAuditedFingerprint('');
  };

  const handleAiSkipFix = (fixId: string) => {
    setAiStagedFixes((prev) =>
      prev.map((item) => (item.id === fixId ? { ...item, skipped: true } : item))
    );
  };

  const handleAiJumpToAlertId = (alertId: string, fallbackDomain: 'dcdc' | 'acdc') => {
    const matched = designAlerts.all.find((a) => a.id === alertId);
    if (matched) {
      handleJumpToAlert(matched);
      return;
    }
    setDomainTab(fallbackDomain);
  };

  const handleAiSendChat = async (question: string) => {
    const ts = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const userMsg: AiChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: question,
      timestamp: ts,
    };
    const nextHistory = [...aiChatMessages, userMsg];
    setAiChatMessages(nextHistory);

    const cfgErr = validateAiProviderConfig(aiConfig);
    if (cfgErr) {
      setAiChatMessages((prev) => [
        ...prev,
        {
          id: `ai-err-${Date.now()}`,
          role: 'assistant',
          text: `Configuration required: ${cfgErr}`,
          error: cfgErr,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
      return;
    }

    setAiSendingChat(true);

    try {
      const snapshot = buildAiDesignSnapshot(aiContextInputs, { compactForChat: true });
      const res = await fetch('/api/ai-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'chat',
          userMessage: question,
          chatHistory: nextHistory
            .filter((m) => !m.error)
            .map((m) => ({
              role: m.role === 'user' ? 'user' : 'model',
              text: m.text,
            })),
          snapshot,
          aiConfig: toServerAiConfig(aiConfig),
        }),
      });
      const rawText = await res.text();
      let data: Record<string, unknown> = {};
      if (rawText) {
        try {
          data = JSON.parse(rawText) as Record<string, unknown>;
        } catch {
          if (!res.ok) {
            const snippet = rawText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180);
            throw new Error(`AI service returned HTTP ${res.status}: ${snippet || res.statusText}`);
          }
          if (/<html|<!doctype/i.test(rawText)) {
            throw new Error(
              'AI request received an HTML page instead of JSON (proxy timeout or session refresh). Try again or switch to gemini-2.5-flash in AI Keys.'
            );
          }
          throw new Error(
            `AI service returned non-JSON (${res.status}): ${rawText.slice(0, 140)}`
          );
        }
      }
      if (!res.ok) {
        throw new Error(
          (typeof data?.error === 'string' && data.error) || `AI service returned HTTP ${res.status}`
        );
      }
      const parsed = data as unknown as AiAgentServerResponse;
      const attached = stageAndValidateAiFixes(parsed.proposedFixes || [], aiContextInputs);
      setAiChatMessages((prev) => [
        ...prev,
        {
          id: `ai-${Date.now()}`,
          role: 'assistant',
          text: parsed.replyMarkdown || parsed.executiveSummary || parsed.headline,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          attachedFixes: attached,
        },
      ]);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Failed to reach AI Engineer.';
      setAiChatMessages((prev) => [
        ...prev,
        {
          id: `ai-err-${Date.now()}`,
          role: 'assistant',
          text: `Error: ${errMsg}`,
          error: errMsg,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setAiSendingChat(false);
    }
  };

  // Close alert popover on outside click or Escape key
  useEffect(() => {
    if (!openAlertFilter) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (alertPopoverRef.current && !alertPopoverRef.current.contains(e.target as Node)) {
        setOpenAlertFilter(null);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenAlertFilter(null);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [openAlertFilter]);

  const toggleAlertPopover = (filter: 'danger' | 'warning') => {
    setAlertStageScope('all');
    setOpenAlertFilter((prev) => (prev === filter ? null : filter));
  };

  const handleJumpToAlert = (alert: DesignAlertItem) => {
    if (alert.domain === 'dcdc') {
      setDomainTab('dcdc');
      setDcdcSubTab(alert.subTab as DcDcSubTab);
    } else {
      setDomainTab('acdc');
      setAcdcSubTab(alert.subTab as AcDcSubTab);
    }
    setJumpState({
      targetItemId: alert.targetItemId ?? null,
      nonce: Date.now(),
    });
    setOpenAlertFilter(null);
  };

  const handleApplyAlertFix = (fix: DesignAlertFix) => {
    if (fix.targetKind === 'dcdc' && fix.dcdcPatch) {
      applyDcdcPatch(fix.dcdcPatch, null, { bypassAutoOpt: true });
      return;
    }
    if (fix.targetKind === 'acdc' && fix.acdcPatch) {
      applyAcdcPatch(fix.acdcPatch, null, { bypassAutoOpt: true });
      return;
    }
    if (fix.targetKind === 'inductor' && fix.itemId && fix.inductorOverridesPatch) {
      const p = fix.inductorOverridesPatch;
      updateInductorConfig(fix.itemId, (prev) => ({
        ...prev,
        buildMode: 'custom',
        overrides: { ...prev.overrides, ...p },
        locks: {
          ...(prev.locks || DEFAULT_INDUCTOR_LOCKS),
          ...(p.coreId ? { coreId: true } : {}),
          ...(p.materialId ? { materialId: true } : {}),
          ...(p.wireAwg !== undefined ? { wireAwg: true } : {}),
          ...(p.parallelStrands !== undefined ? { parallelStrands: true } : {}),
          ...(p.conductorForm !== undefined ? { conductorForm: true } : {}),
          ...(p.airGap_mm !== undefined ? { airGap_mm: true } : {}),
          ...(p.turnsN !== undefined ? { turnsN: true } : p.coreId ? { turnsN: false } : {}),
        },
      }));
      return;
    }
    if (fix.targetKind === 'capacitor' && fix.itemId && fix.capacitorOverridesPatch) {
      const p = fix.capacitorOverridesPatch;
      const existing = capacitorConfigs[fix.itemId] || {
        viewMode: 'builder' as const,
        overrides: {},
        locks: { ...DEFAULT_CAP_BANK_LOCKS },
      };
      const nextOverrides = { ...existing.overrides, ...p };
      const nextLocks = fix.capacitorUnlockMatrix
        ? {
            ...existing.locks,
            partId: Boolean(p.partId),
            seriesCount: false,
            parallelCount: false,
          }
        : {
            ...existing.locks,
            ...(p.partId ? { partId: true } : {}),
            ...(p.seriesCount !== undefined ? { seriesCount: true } : {}),
            ...(p.parallelCount !== undefined ? { parallelCount: true } : {}),
          };

      updateCapacitorConfig(fix.itemId, (prev) => ({
        ...prev,
        viewMode: 'builder',
        overrides: nextOverrides,
        locks: nextLocks,
      }));

      if (fix.syncToCircuit) {
        const mode: 'acdc' | 'dcdc' = fix.itemId.startsWith('acdc-') ? 'acdc' : 'dcdc';
        const reqs = extractCircuitCapacitors(mode, dcdcState, dcdcRes, acdcState, acdcRes);
        const req = reqs.find((r) => r.id === fix.itemId);
        if (req?.syncTarget) {
          const solvedBank = solveCapacitorBank(req, nextOverrides, nextLocks);
          const cVal = Number(
            (solvedBank.bank_C_uF * (req.syncTarget.scaleFactorToState ?? 1)).toFixed(1)
          );
          const esrVal = Number(solvedBank.bank_ESR_mOhm.toFixed(1));
          if (req.syncTarget.domain === 'dcdc') {
            const patch: Partial<DcDcDesignState> = { [req.syncTarget.cKey]: cVal };
            if (req.syncTarget.esrKey) {
              (patch as Record<string, number>)[req.syncTarget.esrKey] = esrVal;
            }
            applyDcdcPatch(patch, null, { bypassAutoOpt: true });
          } else {
            const patch: Partial<AcDcDesignState> = { [req.syncTarget.cKey]: cVal };
            if (req.syncTarget.esrKey) {
              (patch as Record<string, number>)[req.syncTarget.esrKey] = esrVal;
            }
            applyAcdcPatch(patch, null, { bypassAutoOpt: true });
          }
        }
      }
    }
  };

  const visiblePopoverAlerts = useMemo(() => {
    if (!openAlertFilter) return [];
    const base =
      openAlertFilter === 'danger'
        ? designAlerts.danger
        : openAlertFilter === 'warning'
        ? designAlerts.warning
        : designAlerts.all;
    const scoped =
      alertStageScope === 'active' && domainTab !== 'small-signal'
        ? base.filter((a) => a.domain === domainTab)
        : base;

    // Sort active stage alerts first while preserving Danger before Warning
    return [...scoped].sort((a, b) => {
      if (a.severity !== b.severity) return a.severity === 'danger' ? -1 : 1;
      if (domainTab !== 'small-signal') {
        if (a.domain === domainTab && b.domain !== domainTab) return -1;
        if (b.domain === domainTab && a.domain !== domainTab) return 1;
      }
      return 0;
    });
  }, [openAlertFilter, designAlerts, alertStageScope, domainTab]);

  const handlePinToggle = () => {
    if (domainTab === 'acdc') {
      setPinnedAcdc((prev) => (prev ? null : { ...acdcState }));
    } else {
      setPinnedDcdc((prev) => (prev ? null : { ...dcdcState }));
    }
  };

  const handleReset = () => {
    if (domainTab === 'acdc') {
      clearAcdcChanges();
      setAcdcState({ ...ACDC_PRESETS[0].state });
      setPinnedAcdc(null);
      resetInductorConfigs(Object.keys(inductorConfigs).filter((k) => k.startsWith('acdc-')));
      resetCapacitorConfigs(Object.keys(capacitorConfigs).filter((k) => k.startsWith('acdc-')));
    } else {
      clearDcdcChanges();
      setDcdcState({ ...DCDC_PRESETS[0].state });
      setPinnedDcdc(null);
      resetInductorConfigs(Object.keys(inductorConfigs).filter((k) => k.startsWith('dcdc-')));
      resetCapacitorConfigs(Object.keys(capacitorConfigs).filter((k) => k.startsWith('dcdc-')));
    }
  };

  const handleExportJson = () => {
    const payload =
      domainTab === 'acdc'
        ? { domain: 'ac-dc-pfc', state: acdcState, results: acdcRes }
        : { domain: 'dc-dc-isolated', state: dcdcState, results: dcdcRes };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${domainTab}_design_spec.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleEquipDcDcPrimary = (part: SemiconductorSpec) => {
    setDbVersion((v) => v + 1);
    applyDcdcPatch(
      {
        priDeviceId: part.id,
        kelvinSourcePri: part.kelvinSource ?? dcdcState.kelvinSourcePri,
      },
      'priDeviceId'
    );
    setDomainTab('dcdc');
  };

  const handleEquipDcDcSecondary = (part: SemiconductorSpec) => {
    setDbVersion((v) => v + 1);
    setDcdcField('secDeviceId', part.id);
    setDomainTab('dcdc');
  };

  const handleEquipAcDcFastSwitch = (part: SemiconductorSpec) => {
    setDbVersion((v) => v + 1);
    setAcdcField('fastSwitchId', part.id);
    setDomainTab('acdc');
  };

  const isPinned = domainTab === 'acdc' ? Boolean(pinnedAcdc) : Boolean(pinnedDcdc);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#090C12] text-slate-900 dark:text-slate-100 flex flex-col transition-colors duration-150">
      <div className={reportOpen ? 'no-print flex-1 flex flex-col' : 'flex-1 flex flex-col'}>
      {/* 3-ZONE TOP HEADER BAR */}
      <header className="sticky top-0 z-30 min-h-14 py-2 px-4 lg:px-6 bg-white dark:bg-[#0D1119] border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4 lg:gap-8">
        {/* Zone 1: Brand Title */}
        <div className="shrink-0">
          <div className="text-[15px] font-semibold tracking-tight text-slate-900 dark:text-slate-100 leading-tight whitespace-nowrap">
            Power Converter Design Studio
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5 whitespace-nowrap">
            Made By: Ahmed Emad
          </div>
        </div>

        {/* Zone 2: Primary Domain Switcher */}
        <nav
          aria-label="Workbench domains"
          className="flex items-center gap-1 bg-slate-100 dark:bg-[#090C12] p-1 rounded-md border border-slate-200 dark:border-slate-800 overflow-x-auto"
        >
          <button
            type="button"
            onClick={() => setDomainTab('acdc')}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
              domainTab === 'acdc'
                ? 'bg-white dark:bg-[#161E2E] text-cyan-700 dark:text-cyan-300 border border-slate-200 dark:border-slate-700 font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 border border-transparent'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            AC-DC PFC
          </button>
          <button
            type="button"
            onClick={() => setDomainTab('dcdc')}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
              domainTab === 'dcdc'
                ? 'bg-white dark:bg-[#161E2E] text-cyan-700 dark:text-cyan-300 border border-slate-200 dark:border-slate-700 font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 border border-transparent'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            DC-DC Converter
          </button>
          <button
            type="button"
            onClick={() => setDomainTab('small-signal')}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
              domainTab === 'small-signal'
                ? 'bg-white dark:bg-[#161E2E] text-emerald-700 dark:text-emerald-300 border border-slate-200 dark:border-slate-700 font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 border border-transparent'
            }`}
          >
            <Compass className="w-3.5 h-3.5" />
            Small-Signal Lab
          </button>
        </nav>

        {/* Zone 3: Alert Center + Global Utility Actions */}
        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          {/* Danger & Warning Header Counters + Direct Jump Dropdown */}
          <div ref={alertPopoverRef} className="relative flex items-center gap-1.5 mr-1">
            <button
              type="button"
              onClick={() => toggleAlertPopover('danger')}
              aria-expanded={openAlertFilter === 'danger'}
              className={`h-8 px-2.5 text-xs font-medium rounded-md border transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
                designAlerts.danger.length > 0
                  ? openAlertFilter === 'danger'
                    ? 'bg-rose-600 border-rose-600 text-white font-semibold'
                    : 'bg-rose-500/10 hover:bg-rose-500/15 border-rose-500/50 text-rose-700 dark:text-rose-300 font-semibold'
                  : openAlertFilter === 'danger'
                  ? 'bg-emerald-600 border-emerald-600 text-white font-semibold'
                  : 'bg-emerald-500/10 hover:bg-emerald-500/15 border-emerald-500/40 text-emerald-700 dark:text-emerald-300'
              }`}
              title="Critical danger alerts that cannot be left as-is — click to list and jump directly"
            >
              <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
              <span className="font-mono font-bold tabular-nums">{designAlerts.danger.length}</span>
              <span>Danger</span>
            </button>

            <button
              type="button"
              onClick={() => toggleAlertPopover('warning')}
              aria-expanded={openAlertFilter === 'warning'}
              className={`h-8 px-2.5 text-xs font-medium rounded-md border transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
                designAlerts.warning.length > 0
                  ? openAlertFilter === 'warning'
                    ? 'bg-amber-600 border-amber-600 text-white font-semibold'
                    : 'bg-amber-500/10 hover:bg-amber-500/15 border-amber-500/50 text-amber-700 dark:text-amber-300 font-semibold'
                  : openAlertFilter === 'warning'
                  ? 'bg-slate-700 border-slate-600 text-white font-semibold'
                  : 'bg-white dark:bg-[#131A26] border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700'
              }`}
              title="Advisory warnings that are better to change — click to list and jump directly"
            >
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span className="font-mono font-bold tabular-nums">{designAlerts.warning.length}</span>
              <span>Warning</span>
            </button>

            {openAlertFilter && (
              <div
                role="dialog"
                aria-label="Design alerts list"
                className="fixed sm:absolute left-3 right-3 sm:left-auto sm:right-0 top-16 sm:top-full sm:mt-2 sm:w-[440px] max-h-[75vh] flex flex-col bg-white dark:bg-[#0E131D] border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl z-50 overflow-hidden"
              >
                {/* Popover Header */}
                <div className="px-3.5 py-2.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 bg-slate-50 dark:bg-[#0B0F17]">
                  <div>
                    <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                      Design Alerts — Click any item to jump directly
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      {openAlertFilter === 'danger'
                        ? 'Critical limit violations that must be fixed'
                        : openAlertFilter === 'warning'
                        ? 'Tight margins or sub-optimal specs better to change'
                        : 'All critical and advisory design findings'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpenAlertFilter(null)}
                    aria-label="Close alerts list"
                    className="h-7 w-7 rounded border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 inline-flex items-center justify-center cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Filter & Scope Controls */}
                <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 bg-white dark:bg-[#0E131D]">
                  <div className="inline-flex items-center gap-1 bg-slate-100 dark:bg-[#090C12] p-0.5 rounded border border-slate-200 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => setOpenAlertFilter('danger')}
                      className={`px-2 py-1 text-[11px] font-mono rounded cursor-pointer transition-colors ${
                        openAlertFilter === 'danger'
                          ? 'bg-rose-600 text-white font-semibold'
                          : 'text-rose-700 dark:text-rose-400 hover:bg-rose-500/10'
                      }`}
                    >
                      ✖ Danger ({designAlerts.danger.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setOpenAlertFilter('warning')}
                      className={`px-2 py-1 text-[11px] font-mono rounded cursor-pointer transition-colors ${
                        openAlertFilter === 'warning'
                          ? 'bg-amber-600 text-white font-semibold'
                          : 'text-amber-700 dark:text-amber-400 hover:bg-amber-500/10'
                      }`}
                    >
                      ▲ Warning ({designAlerts.warning.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setOpenAlertFilter('all')}
                      className={`px-2 py-1 text-[11px] font-mono rounded cursor-pointer transition-colors ${
                        openAlertFilter === 'all'
                          ? 'bg-cyan-600 text-white font-semibold'
                          : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800'
                      }`}
                    >
                      All ({designAlerts.all.length})
                    </button>
                  </div>

                  {domainTab !== 'small-signal' && (
                    <div className="inline-flex items-center gap-1 text-[10px] font-mono">
                      <button
                        type="button"
                        onClick={() => setAlertStageScope('all')}
                        className={`px-1.5 py-0.5 rounded border cursor-pointer ${
                          alertStageScope === 'all'
                            ? 'bg-slate-800 dark:bg-slate-700 border-slate-700 text-white'
                            : 'border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        Both Stages
                      </button>
                      <button
                        type="button"
                        onClick={() => setAlertStageScope('active')}
                        className={`px-1.5 py-0.5 rounded border cursor-pointer ${
                          alertStageScope === 'active'
                            ? 'bg-cyan-600 border-cyan-600 text-white'
                            : 'border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {domainTab === 'dcdc' ? 'DC-DC Only' : 'AC-DC Only'}
                      </button>
                    </div>
                  )}
                </div>

                {/* Scrollable Alert Rows */}
                <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/80">
                  {visiblePopoverAlerts.length === 0 ? (
                    <div className="p-6 text-center space-y-1.5">
                      <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto" />
                      <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                        {openAlertFilter === 'danger'
                          ? 'No critical danger alerts active'
                          : openAlertFilter === 'warning'
                          ? 'No advisory warnings active'
                          : 'All converter parameters within safe limits'}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        {alertStageScope === 'active'
                          ? 'Switch to "Both Stages" to inspect the other converter stage.'
                          : 'All magnetic, thermal, electrical, and control checks pass.'}
                      </div>
                    </div>
                  ) : (
                    visiblePopoverAlerts.map((alert) => {
                      const isDanger = alert.severity === 'danger';
                      const quickFixes = (alert.fixes || []).slice(0, 2);
                      return (
                        <div
                          key={alert.id}
                          className={`px-3.5 py-2.5 transition-colors space-y-2 ${
                            isDanger
                              ? 'bg-rose-50/40 dark:bg-rose-950/15 hover:bg-rose-50/70 dark:hover:bg-rose-950/25'
                              : 'bg-amber-50/35 dark:bg-amber-950/10 hover:bg-amber-50/65 dark:hover:bg-amber-950/20'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => handleJumpToAlert(alert)}
                            className="w-full text-left flex items-start gap-2.5 cursor-pointer"
                          >
                            <div className="pt-0.5 shrink-0">
                              {isDanger ? (
                                <ShieldAlert className="w-4 h-4 text-rose-500" />
                              ) : (
                                <AlertTriangle className="w-4 h-4 text-amber-500" />
                              )}
                            </div>

                            <div className="min-w-0 flex-1 space-y-1">
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <span
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold border shrink-0 ${
                                      alert.domain === 'dcdc'
                                        ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-700 dark:text-cyan-300'
                                        : 'bg-indigo-500/10 border-indigo-500/30 text-indigo-700 dark:text-indigo-300'
                                    }`}
                                  >
                                    {alert.domainLabel}
                                  </span>
                                  <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 truncate">
                                    → {alert.subTabLabel}
                                  </span>
                                </div>
                                <span
                                  className={`inline-flex items-center gap-0.5 text-[10px] font-mono font-semibold shrink-0 ${
                                    isDanger
                                      ? 'text-rose-600 dark:text-rose-400'
                                      : 'text-amber-600 dark:text-amber-400'
                                  }`}
                                >
                                  Inspect
                                  <ArrowUpRight className="w-3 h-3" />
                                </span>
                              </div>

                              <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 leading-snug">
                                {alert.title}
                              </div>

                              <div
                                className={`text-[11px] font-mono tabular-nums leading-snug ${
                                  isDanger
                                    ? 'text-rose-700 dark:text-rose-300'
                                    : 'text-amber-700 dark:text-amber-300'
                                }`}
                              >
                                {alert.metric}
                              </div>

                              <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                                {alert.actionHint}
                              </div>
                            </div>
                          </button>

                          {quickFixes.length > 0 && (
                            <div className="pl-6 flex flex-col gap-1.5">
                              {quickFixes.map((fix) => (
                                <button
                                  key={fix.id}
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleApplyAlertFix(fix);
                                  }}
                                  className={`w-full text-left px-2.5 py-1.5 rounded border transition-colors cursor-pointer ${
                                    isDanger
                                      ? 'bg-white dark:bg-[#0D131E] border-rose-300 dark:border-rose-500/40 hover:border-emerald-500 dark:hover:border-emerald-500/70'
                                      : 'bg-white dark:bg-[#0D131E] border-amber-300 dark:border-amber-500/40 hover:border-emerald-500 dark:hover:border-emerald-500/70'
                                  }`}
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-[11px] font-semibold text-slate-900 dark:text-slate-100 leading-tight">
                                      1-Click Fix: {fix.label}
                                    </span>
                                    <span className="px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[10px] font-mono font-semibold shrink-0">
                                      Apply
                                    </span>
                                  </div>
                                  <div className="text-[10px] font-mono tabular-nums text-emerald-700 dark:text-emerald-300 mt-0.5">
                                    {fix.impact}
                                  </div>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setAiKeysModalOpen(true)}
            aria-expanded={aiKeysModalOpen}
            className={`h-8 px-2.5 text-xs font-medium rounded-md border transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
              aiKeysModalOpen
                ? 'bg-cyan-600 border-cyan-600 text-white font-semibold'
                : validateAiProviderConfig(aiConfig)
                ? 'bg-amber-500/10 border-amber-500/60 text-amber-700 dark:text-amber-300 hover:bg-amber-500/15'
                : 'bg-white dark:bg-[#131A26] border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:border-cyan-500/60'
            }`}
            title={`Configure AI API Keys & Provider (${AI_PROVIDER_META[aiConfig.provider].label} · ${aiConfig.model})`}
          >
            <KeyRound className="w-3.5 h-3.5 shrink-0" />
            <span>AI Keys · {AI_PROVIDER_META[aiConfig.provider].shortLabel}</span>
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                validateAiProviderConfig(aiConfig)
                  ? 'bg-amber-500'
                  : aiConfig.apiKey
                  ? 'bg-emerald-500'
                  : 'bg-cyan-500'
              }`}
            />
          </button>

          <button
            type="button"
            onClick={handleToggleAiEngineer}
            aria-pressed={aiEnabled}
            className={`h-8 px-2.5 text-xs font-medium rounded-md border transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
              aiEnabled
                ? 'bg-cyan-600 border-cyan-600 text-white font-semibold hover:bg-cyan-500'
                : designAlerts.danger.length > 0
                ? 'bg-white dark:bg-[#131A26] border-cyan-500/60 text-cyan-700 dark:text-cyan-300 hover:bg-cyan-500/10'
                : 'bg-white dark:bg-[#131A26] border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-700'
            }`}
            title="Toggle AI Engineer Assistant to audit full converter state, propose verified Danger/Warning fixes, and verify safety"
          >
            <Bot className="w-3.5 h-3.5 shrink-0" />
            <span>AI Agent: {aiEnabled ? 'ON' : 'OFF'}</span>
          </button>

          <button
            type="button"
            onClick={() => setReportOpen(true)}
            className="h-8 px-3 text-xs font-medium rounded-md bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-500 text-white transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            title="Generate textbook-style Engineering Design Report with TOC, derivations, graphs & PDF print"
          >
            <FileText className="w-3.5 h-3.5" />
            Generate Report
          </button>

          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="h-8 px-3 text-xs font-medium rounded-md bg-cyan-600 hover:bg-cyan-500 text-white transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            title="Open LCSC / DigiKey Component Database and BOM Exporter"
          >
            <Search className="w-3.5 h-3.5" />
            Component DB
          </button>

          <button
            type="button"
            onClick={handlePinToggle}
            className={`h-8 px-2.5 text-xs font-medium rounded-md border transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
              isPinned
                ? 'bg-amber-500/10 border-amber-500/60 text-amber-700 dark:text-amber-300 font-semibold'
                : 'bg-white dark:bg-[#131A26] border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-700'
            }`}
            title="Pin current curves as reference overlay"
          >
            <Pin className="w-3.5 h-3.5" />
            {isPinned ? 'Pinned' : 'Pin Ref'}
          </button>

          <button
            type="button"
            onClick={handleExportJson}
            className="h-8 px-2.5 text-xs font-medium rounded-md bg-white dark:bg-[#131A26] border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-700 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
            title="Export design specification as JSON"
          >
            <Download className="w-3.5 h-3.5" />
            Export
          </button>

          <button
            type="button"
            onClick={handleReset}
            className="h-8 w-8 rounded-md bg-white dark:bg-[#131A26] border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-700 inline-flex items-center justify-center shrink-0 cursor-pointer transition-colors"
            title="Reset current tab to default preset"
            aria-label="Reset current tab to default preset"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => setDarkMode((d) => !d)}
            className="h-8 w-8 rounded-md bg-white dark:bg-[#131A26] border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-700 inline-flex items-center justify-center shrink-0 cursor-pointer transition-colors"
            title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            aria-label={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {darkMode ? (
              <Sun className="w-3.5 h-3.5 text-amber-400" />
            ) : (
              <Moon className="w-3.5 h-3.5 text-slate-700" />
            )}
          </button>
        </div>
      </header>

      {/* WORKBENCH + COLLAPSIBLE RIGHT-SIDE AI ENGINEER DRAWER */}
      <div className="flex-1 flex items-start min-w-0">
        <main className="flex-1 min-w-0 max-w-[1640px] w-full mx-auto p-4 lg:p-5">
          {domainTab === 'acdc' ? (
            <AcDcWorkbench
              state={acdcState}
              onChange={setAcdcState}
              res={acdcRes}
              pinnedRes={pinnedAcdcRes}
              onOpenPartDrawer={() => setDrawerOpen(true)}
              onOpenSmallSignalLab={() => setDomainTab('small-signal')}
              requestedSubTab={acdcSubTab}
              onChangeSubTab={setAcdcSubTab}
              jumpTargetId={jumpState.targetItemId}
              jumpNonce={jumpState.nonce}
            />
          ) : domainTab === 'dcdc' ? (
            <DcDcWorkbench
              state={dcdcState}
              onChange={setDcdcState}
              res={dcdcRes}
              pinnedRes={pinnedDcdcRes}
              onOpenPartDrawer={() => setDrawerOpen(true)}
              onOpenSmallSignalLab={() => setDomainTab('small-signal')}
              activeSubTab={dcdcSubTab}
              onChangeSubTab={setDcdcSubTab}
              jumpTargetId={jumpState.targetItemId}
              jumpNonce={jumpState.nonce}
            />
          ) : (
            <SmallSignalDashboard
              dcdcState={dcdcState}
              setDcdcState={setDcdcState}
              dcdcRes={dcdcRes}
              pinnedDcdcRes={pinnedDcdcRes}
              acdcState={acdcState}
              setAcdcState={setAcdcState}
              acdcRes={acdcRes}
            />
          )}
        </main>

        <AiEngineerDrawer
          isEnabled={aiEnabled}
          isCollapsed={aiCollapsed}
          onToggleCollapse={() => setAiCollapsed((c) => !c)}
          onTurnOff={() => setAiEnabled(false)}
          isAuditing={aiAuditing}
          isVerifyingPass={aiVerifyingPass}
          auditError={aiAuditError}
          isAuditStale={isAuditStale}
          overallVerdict={aiOverallVerdict}
          headline={aiHeadline}
          executiveSummary={aiExecutiveSummary}
          stagedFixes={aiStagedFixes}
          appliedLog={aiAppliedLog}
          rollbackSnapshot={aiRollback}
          chatMessages={aiChatMessages}
          isSendingChat={aiSendingChat}
          ctx={aiContextInputs}
          onRunAudit={() => runAiAudit()}
          onApplySingleFix={handleAiApplySingleFix}
          onSkipFix={handleAiSkipFix}
          onApproveAllSafeFixes={handleAiApproveAllSafeFixes}
          onUndoLastBatch={handleAiUndoLastBatch}
          onSendChat={handleAiSendChat}
          onJumpToAlertId={handleAiJumpToAlertId}
          onJumpToAlertObj={handleJumpToAlert}
          aiConfig={aiConfig}
          onChangeAiConfig={handleChangeAiConfig}
        />
      </div>

      {/* REAL-WORLD COMPONENT SEARCH & DATASHEET GROUNDING DRAWER */}
      <ComponentSearchDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        activeDomain={domainTab === 'acdc' ? 'acdc' : 'dcdc'}
        operatingContext={
          domainTab !== 'acdc'
            ? {
                topology: dcdcState.topology,
                Vin_V: dcdcState.Vin_nom_V,
                Vout_V: dcdcState.Vout_V,
                Pout_W: dcdcState.Pout_W,
                fsw_kHz: dcdcState.fsw_kHz,
                Vsec_pk_V: Math.round(dcdcRes.Vsec_unclamped_pk_V),
              }
            : {
                topology: acdcState.topology,
                Vin_V: acdcState.Vac_rms_V,
                Vout_V: acdcState.Vdc_bus_V,
                Pout_W: acdcState.Pout_W,
                fsw_kHz: acdcState.fsw_kHz,
              }
        }
        currentPriDevice={dcdcRes.priDevice}
        currentSecDevice={dcdcRes.secDevice}
        currentPfcDevice={acdcRes.sw}
        onEquipDcDcPrimary={handleEquipDcDcPrimary}
        onEquipDcDcSecondary={handleEquipDcDcSecondary}
        onEquipAcDcFastSwitch={handleEquipAcDcFastSwitch}
        aiConfig={aiConfig}
        onChangeAiConfig={handleChangeAiConfig}
      />
      </div>

      {/* TEXTBOOK-STYLE ENGINEERING DESIGN REPORT MODAL & PDF PRINT ROOT */}
      <DesignReportModal
        isOpen={reportOpen}
        onClose={() => setReportOpen(false)}
        initialScope={domainTab === 'acdc' ? 'acdc' : domainTab === 'dcdc' ? 'dcdc' : 'both'}
        dcdcState={dcdcState}
        dcdcRes={dcdcRes}
        acdcState={acdcState}
        acdcRes={acdcRes}
        inductorConfigs={inductorConfigs}
        capacitorConfigs={capacitorConfigs}
        alerts={designAlerts}
      />

      {/* TOP-BAR AI PROVIDER & API KEYS MODAL */}
      {aiKeysModalOpen && (
        <div
          className="no-print fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          aria-label="Configure AI Provider and API Keys"
          onClick={() => setAiKeysModalOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-lg shadow-2xl bg-white dark:bg-[#0E131D] border border-slate-200 dark:border-slate-700 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <AiProviderSettingsPanel
              aiConfig={aiConfig}
              onChangeAiConfig={handleChangeAiConfig}
              onClose={() => setAiKeysModalOpen(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
