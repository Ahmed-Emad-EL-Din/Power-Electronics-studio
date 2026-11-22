/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, useLayoutEffect, useRef, lazy, Suspense } from 'react';
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
import type { AcDcSubTab } from './components/AcDcWorkbench';
import { DcDcSubTab, DcDcWorkbench } from './components/DcDcWorkbench';
import type { CommandPaletteAction } from './components/CommandPaletteModal';
import type { AiChatMessage } from './components/AiEngineerDrawer';
import { ErrorBoundary, ModalLoadingFallback, WorkbenchSkeleton } from './components/ErrorBoundary';

const loadAcDcWorkbench = () => import('./components/AcDcWorkbench');
const loadSmallSignalDashboard = () => import('./components/SmallSignalDashboard');
const loadDesignReportModal = () => import('./components/DesignReportModal');

const AcDcWorkbench = lazy(() => loadAcDcWorkbench().then((m) => ({ default: m.AcDcWorkbench })));
const SmallSignalDashboard = lazy(() =>
  loadSmallSignalDashboard().then((m) => ({ default: m.SmallSignalDashboard }))
);
const CombinedSystemSchematicView = lazy(() =>
  import('./components/CircuitSchematics').then((m) => ({ default: m.CombinedSystemSchematicView }))
);
const ComponentSearchDrawer = lazy(() =>
  import('./components/ComponentSearchDrawer').then((m) => ({ default: m.ComponentSearchDrawer }))
);
const DesignReportModal = lazy(() =>
  loadDesignReportModal().then((m) => ({ default: m.DesignReportModal }))
);
const CommandPaletteModal = lazy(() =>
  import('./components/CommandPaletteModal').then((m) => ({ default: m.CommandPaletteModal }))
);
const AiEngineerDrawer = lazy(() =>
  import('./components/AiEngineerDrawer').then((m) => ({ default: m.AiEngineerDrawer }))
);
const AiProviderSettingsPanel = lazy(() =>
  import('./components/AiProviderSettingsPanel').then((m) => ({ default: m.AiProviderSettingsPanel }))
);
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
import {
  DEFAULT_CAP_BANK_LOCKS,
  DEFAULT_INDUCTOR_LOCKS,
  DesignSolverProvider,
  useDesignSolver,
} from './components/DesignSolverContext';
import {
  ProjectOutputMode,
  SystemLinkConfig,
  computeCoupledStagePatches,
  getDefaultAcDcSimTimeMs,
  getDefaultCombinedSimTimeMs,
  getDefaultDcDcSimTimeUs,
  solveSystemCascade,
} from './engine/systemCascadeEngine';
import {
  SavedProjectEntry,
  StudioWorkspaceSnapshot,
  buildProjectFile,
  createHistory,
  deleteSavedProject,
  loadSavedProjects,
  parseImportedProjectJson,
  pushHistoryState,
  redoHistory,
  saveAutosaveProject,
  saveNamedProject,
  undoHistory,
} from './engine/projectStorage';
import {
  generateAcDcLtspiceAsc,
  generateAcDcPlecsBundle,
  generateAcDcQspiceBundle,
  generateAcDcSpiceNetlist,
  generateCombinedSystemLtspiceAsc,
  generateCombinedSystemPlecsBundle,
  generateCombinedSystemQspiceBundle,
  generateCombinedSystemSpiceNetlist,
  generateControlFirmwareHeader,
  generateDcDcLtspiceAsc,
  generateDcDcPlecsBundle,
  generateDcDcQspiceBundle,
  generateDcDcSpiceNetlist,
} from './engine/spiceNetlistExporter';
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
  Undo2,
  Redo2,
  FolderOpen,
  Link2,
  Layers,
  Upload,
  Save,
  Trash2,
  ChevronDown,
  MoreHorizontal,
  Clock,
  SlidersHorizontal,
  Sparkles,
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
    dcdcLocked,
    setAcdcField,
    applyAcdcPatch,
    clearAcdcChanges,
    acdcLocked,
    inductorConfigs,
    updateInductorConfig,
    replaceInductorConfigs,
    resetInductorConfigs,
    capacitorConfigs,
    updateCapacitorConfig,
    replaceCapacitorConfigs,
    resetCapacitorConfigs,
    optimizeDcdcNow,
    optimizeAcdcNow,
  } = useDesignSolver();

  const [domainTab, setDomainTab] = useState<'dcdc' | 'acdc' | 'combined' | 'small-signal'>(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      const st = sp.get('stage');
      if (st === 'acdc' || st === 'dcdc' || st === 'combined' || st === 'small-signal') return st;
    } catch {
      // ignore URL errors
    }
    return 'dcdc';
  });
  const [dcdcSubTab, setDcdcSubTab] = useState<DcDcSubTab>(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      const v = sp.get('view');
      const valid: DcDcSubTab[] = [
        'schematic', 'scope-sim', 'graphs', 'thermal', 'control', 'all-inductors',
        'magnetics', 'saturation', 'emi', 'gatedrive', 'winding', 'protection', 'capacitors',
      ];
      if (v && valid.includes(v as DcDcSubTab)) return v as DcDcSubTab;
    } catch {
      // ignore
    }
    return 'schematic';
  });
  const [acdcSubTab, setAcdcSubTab] = useState<AcDcSubTab>(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      const v = sp.get('acView');
      const valid: AcDcSubTab[] = [
        'schematic', 'scope-sim', 'graphs', 'control', 'harmonics', 'all-inductors',
        'magnetics', 'inrush', 'dc-link', 'emi', 'efficiency',
      ];
      if (v && valid.includes(v as AcDcSubTab)) return v as AcDcSubTab;
    } catch {
      // ignore
    }
    return 'schematic';
  });

  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('stage', domainTab);
      if (domainTab === 'dcdc') {
        url.searchParams.set('view', dcdcSubTab);
      } else if (domainTab === 'acdc') {
        url.searchParams.set('acView', acdcSubTab);
      }
      window.history.replaceState(null, '', url.toString());
    } catch {
      // ignore
    }
  }, [domainTab, dcdcSubTab, acdcSubTab]);
  const [jumpState, setJumpState] = useState<{ targetItemId?: string | null; nonce: number }>({
    targetItemId: null,
    nonce: 0,
  });
  const [openAlertFilter, setOpenAlertFilter] = useState<'danger' | 'warning' | 'all' | null>(null);
  const [alertStageScope, setAlertStageScope] = useState<'all' | 'active'>('all');
  const alertPopoverRef = useRef<HTMLDivElement | null>(null);
  const [alertPopoverStyle, setAlertPopoverStyle] = useState<React.CSSProperties>({});

  // Header Dropdowns, Command Palette & Toast Feedback
  const [exportMenuOpen, setExportMenuOpen] = useState<boolean>(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState<boolean>(false);
  const [cmdPaletteOpen, setCmdPaletteOpen] = useState<boolean>(false);
  const exportMenuRef = useRef<HTMLDivElement | null>(null);
  const moreMenuRef = useRef<HTMLDivElement | null>(null);
  const [toasts, setToasts] = useState<{ id: number; message: string; tone: 'info' | 'success' | 'warn' }[]>([]);
  const pushToast = (message: string, tone: 'info' | 'success' | 'warn' = 'success') => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((prev) => [...prev.slice(-2), { id, message, tone }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3200);
  };

  const [themeMode, setThemeMode] = useState<'auto' | 'dark' | 'light'>(() => {
    try {
      const savedMode = localStorage.getItem('powerstage_theme_mode');
      if (savedMode === 'auto' || savedMode === 'dark' || savedMode === 'light') return savedMode;
      const legacy = localStorage.getItem('powerstage_theme');
      if (legacy === 'dark' || legacy === 'light') return legacy;
      return 'auto';
    } catch {
      return 'auto';
    }
  });
  const [systemPrefersDark, setSystemPrefersDark] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => setSystemPrefersDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  const darkMode = themeMode === 'auto' ? systemPrefersDark : themeMode === 'dark';
  const cycleThemeMode = () => {
    setThemeMode((prev) => (prev === 'auto' ? 'dark' : prev === 'dark' ? 'light' : 'auto'));
  };
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

  // 2-Stage System Cascade Coupling & Project Persistence / Undo-Redo
  const [systemLink, setSystemLink] = useState<SystemLinkConfig>({
    outputMode: 'combined',
    linkBusVoltage: false,
    linkLoadPower: false,
    sharedMcu: true,
  });
  const outputMode: ProjectOutputMode = systemLink.outputMode ?? 'combined';
  const sharedMcu: boolean = systemLink.sharedMcu ?? true;
  const [projectsModalOpen, setProjectsModalOpen] = useState<boolean>(false);
  const [savedProjects, setSavedProjects] = useState<SavedProjectEntry[]>(() => loadSavedProjects());
  const [projectNameInput, setProjectNameInput] = useState<string>('');
  const [projectImportStatus, setProjectImportStatus] = useState<string | null>(null);
  const jsonFileInputRef = useRef<HTMLInputElement | null>(null);

  const [historyStack, setHistoryStack] = useState(() =>
    createHistory<StudioWorkspaceSnapshot>({
      dcdcState,
      acdcState,
      inductorConfigs,
      capacitorConfigs,
      systemLink: { outputMode: 'combined', linkBusVoltage: false, linkLoadPower: false, sharedMcu: true },
    })
  );
  const isApplyingHistoryRef = useRef<boolean>(false);

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
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', darkMode ? '#0e1015' : '#f6f7f9');
    }
    try {
      localStorage.setItem('powerstage_theme_mode', themeMode);
      localStorage.setItem('powerstage_theme', darkMode ? 'dark' : 'light');
    } catch {
      // ignore storage errors
    }
  }, [darkMode, themeMode]);

  const acdcRes = useMemo(() => solveAcDcDesign(acdcState), [acdcState, dbVersion]);
  const dcdcRes = useMemo(() => solveDcDcDesign(dcdcState), [dcdcState, dbVersion]);

  const systemCascade = useMemo(
    () => solveSystemCascade(acdcState, acdcRes, dcdcState, dcdcRes),
    [acdcState, acdcRes, dcdcState, dcdcRes]
  );

  // Sync AC-DC <-> DC-DC stages when Stage Bus / Load Link is enabled
  useEffect(() => {
    if (!systemLink.linkBusVoltage && !systemLink.linkLoadPower) return;
    const { dcdcPatch, acdcPatch } = computeCoupledStagePatches({
      acdcState,
      acdcRes,
      dcdcState,
      dcdcRes,
      linkConfig: systemLink,
    });
    if (dcdcPatch) {
      applyDcdcPatch(dcdcPatch, null, { bypassAutoOpt: true });
    }
    if (acdcPatch) {
      applyAcdcPatch(acdcPatch, null, { bypassAutoOpt: true });
    }
  }, [
    systemLink,
    acdcState.Vdc_bus_V,
    acdcState.Vdc_min_hold_V,
    acdcRes.Vdc_ripple_pp_V,
    dcdcState.Pout_W,
    dcdcRes.efficiency_pct,
  ]);

  // Track Undo/Redo history & autosave whenever design state changes
  useEffect(() => {
    const snap: StudioWorkspaceSnapshot = {
      dcdcState,
      acdcState,
      inductorConfigs,
      capacitorConfigs,
      systemLink,
    };
    saveAutosaveProject(snap);
    if (isApplyingHistoryRef.current) {
      isApplyingHistoryRef.current = false;
      return;
    }
    setHistoryStack((prev) => pushHistoryState(prev, snap));
  }, [dcdcState, acdcState, inductorConfigs, capacitorConfigs, systemLink]);

  const applyWorkspaceSnapshot = (snap: StudioWorkspaceSnapshot) => {
    isApplyingHistoryRef.current = true;
    clearDcdcChanges();
    clearAcdcChanges();
    setDcdcState({ ...snap.dcdcState });
    setAcdcState({ ...snap.acdcState });
    replaceInductorConfigs({ ...snap.inductorConfigs });
    replaceCapacitorConfigs({ ...snap.capacitorConfigs });
    setSystemLink({ ...snap.systemLink });
  };

  const handleUndo = () => {
    if (historyStack.past.length === 0) return;
    const nextStack = undoHistory(historyStack);
    setHistoryStack(nextStack);
    applyWorkspaceSnapshot(nextStack.present);
    pushToast('Undid last design change', 'info');
  };

  const handleRedo = () => {
    if (historyStack.future.length === 0) return;
    const nextStack = redoHistory(historyStack);
    setHistoryStack(nextStack);
    applyWorkspaceSnapshot(nextStack.present);
    pushToast('Redid design change', 'info');
  };

  useEffect(() => {
    if (!exportMenuOpen && !moreMenuOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (
        exportMenuOpen &&
        exportMenuRef.current &&
        !exportMenuRef.current.contains(target) &&
        !target.closest('[data-popover-trigger="export"]') &&
        !target.closest('[data-popover-panel="export"]')
      ) {
        setExportMenuOpen(false);
      }
      if (
        moreMenuOpen &&
        moreMenuRef.current &&
        !moreMenuRef.current.contains(target) &&
        !target.closest('[data-popover-trigger="more"]') &&
        !target.closest('[data-popover-panel="more"]')
      ) {
        setMoreMenuOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setExportMenuOpen(false);
        setMoreMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [exportMenuOpen, moreMenuOpen]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdPaletteOpen((v) => !v);
        return;
      }
      const target = e.target as HTMLElement | null;
      const isInput =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT';
      if (isInput) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
      } else if (e.key === 'Escape' && projectsModalOpen) {
        setProjectsModalOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

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
        outputMode,
      }),
    [dcdcState, dcdcRes, acdcState, acdcRes, inductorConfigs, capacitorConfigs, outputMode]
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
          fullContext: {
            dcdcState,
            acdcState,
            inductorConfigs,
            capacitorConfigs,
            dcdcLocked,
            acdcLocked,
          },
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
          fullContext: {
            dcdcState,
            acdcState,
            inductorConfigs,
            capacitorConfigs,
            dcdcLocked,
            acdcLocked,
          },
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
      const committedSummary: string[] = [];
      if (parsed.committedPatch) {
        const cp = parsed.committedPatch;
        const hasDcdc = cp.dcdcPatch && Object.keys(cp.dcdcPatch).length > 0;
        const hasAcdc = cp.acdcPatch && Object.keys(cp.acdcPatch).length > 0;
        const hasInd = cp.inductorConfigsPatch && Object.keys(cp.inductorConfigsPatch).length > 0;
        const hasCap = cp.capacitorConfigsPatch && Object.keys(cp.capacitorConfigsPatch).length > 0;
        if (hasDcdc || hasAcdc || hasInd || hasCap) {
          setAiRollback(createRollbackSnapshot('AI Tool-Verified Edit'));
          if (hasDcdc && cp.dcdcPatch) {
            applyDcdcPatch(cp.dcdcPatch, null, { bypassAutoOpt: true });
            committedSummary.push(
              `DC-DC: ${Object.entries(cp.dcdcPatch)
                .map(([k, v]) => `${k}=${String(v)}`)
                .join(', ')}`
            );
          }
          if (hasAcdc && cp.acdcPatch) {
            applyAcdcPatch(cp.acdcPatch, null, { bypassAutoOpt: true });
            committedSummary.push(
              `AC-DC: ${Object.entries(cp.acdcPatch)
                .map(([k, v]) => `${k}=${String(v)}`)
                .join(', ')}`
            );
          }
          if (hasInd && cp.inductorConfigsPatch) {
            replaceInductorConfigs({ ...inductorConfigs, ...cp.inductorConfigsPatch });
            committedSummary.push(
              `Inductors updated: ${Object.keys(cp.inductorConfigsPatch).join(', ')}`
            );
          }
          if (hasCap && cp.capacitorConfigsPatch) {
            replaceCapacitorConfigs({ ...capacitorConfigs, ...cp.capacitorConfigsPatch });
            committedSummary.push(
              `Capacitors updated: ${Object.keys(cp.capacitorConfigsPatch).join(', ')}`
            );
          }
        }
      }
      const attached = stageAndValidateAiFixes(parsed.proposedFixes || [], aiContextInputs);
      setAiChatMessages((prev) => [
        ...prev,
        {
          id: `ai-${Date.now()}`,
          role: 'assistant',
          text: parsed.replyMarkdown || parsed.executiveSummary || parsed.headline,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          attachedFixes: attached,
          toolTrace: parsed.toolTrace,
          committedSummary,
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
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (
        (!alertPopoverRef.current || !alertPopoverRef.current.contains(target)) &&
        !target.closest('[data-popover-trigger="alert"]') &&
        !target.closest('[data-popover-panel="alert"]')
      ) {
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

  // Keep Danger / Warning popover strictly clamped inside the visible viewport on all screen sizes
  useLayoutEffect(() => {
    if (!openAlertFilter) return;
    const updatePosition = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const margin = 8;
      const width = Math.min(440, vw - margin * 2);
      const anchor = alertPopoverRef.current;
      const rect = anchor ? anchor.getBoundingClientRect() : null;
      const hasDesktopAnchor = Boolean(rect && rect.width > 0);
      const top = hasDesktopAnchor && rect ? Math.max(margin, Math.min(rect.bottom + 8, vh - 220)) : 58;
      const left =
        hasDesktopAnchor && rect
          ? Math.max(margin, Math.min(rect.right - width, vw - width - margin))
          : Math.max(margin, (vw - width) / 2);
      const maxHeight = Math.max(200, vh - top - (vw < 768 ? 84 : 16));
      setAlertPopoverStyle({
        position: 'fixed',
        top: `${Math.round(top)}px`,
        left: `${Math.round(left)}px`,
        width: `${Math.round(width)}px`,
        maxHeight: `${Math.round(maxHeight)}px`,
      });
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [openAlertFilter]);

  const toggleAlertPopover = (filter: 'danger' | 'warning') => {
    setAlertStageScope('all');
    setOpenAlertFilter((prev) => (prev === filter ? null : filter));
  };

  const handleChangeOutputMode = (nextMode: ProjectOutputMode) => {
    if (nextMode === 'dcdc-only') {
      setSystemLink((s) => ({
        ...s,
        outputMode: 'dcdc-only',
        linkBusVoltage: false,
        linkLoadPower: false,
      }));
      if (domainTab === 'acdc' || domainTab === 'combined') {
        setDomainTab('dcdc');
      }
    } else if (nextMode === 'acdc-only') {
      setSystemLink((s) => ({
        ...s,
        outputMode: 'acdc-only',
        linkBusVoltage: false,
        linkLoadPower: false,
      }));
      if (domainTab === 'dcdc' || domainTab === 'combined') {
        setDomainTab('acdc');
      }
    } else {
      setSystemLink((s) => ({ ...s, outputMode: 'combined' }));
    }
  };

  const handleConnectTogether = () => {
    const bothOn = outputMode === 'combined' && systemLink.linkBusVoltage && systemLink.linkLoadPower;
    if (bothOn) {
      setSystemLink((s) => ({
        ...s,
        outputMode: 'combined',
        linkBusVoltage: false,
        linkLoadPower: false,
      }));
    } else {
      setSystemLink({
        outputMode: 'combined',
        linkBusVoltage: true,
        linkLoadPower: true,
      });
      setDomainTab('combined');
    }
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
    pushToast(`Applied fix: ${fix.label}`, 'success');
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
      alertStageScope === 'active' && domainTab !== 'small-signal' && domainTab !== 'combined'
        ? base.filter((a) => a.domain === domainTab)
        : base;

    // Sort active stage alerts first while preserving Danger before Warning
    return [...scoped].sort((a, b) => {
      if (a.severity !== b.severity) return a.severity === 'danger' ? -1 : 1;
      if (domainTab === 'dcdc' || domainTab === 'acdc') {
        if (a.domain === domainTab && b.domain !== domainTab) return -1;
        if (b.domain === domainTab && a.domain !== domainTab) return 1;
      }
      return 0;
    });
  }, [openAlertFilter, designAlerts, alertStageScope, domainTab]);

  // Idle prefetch secondary workbenches after initial render for zero-lag tab switching
  useEffect(() => {
    const win = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    const prefetchSecondary = () => {
      void loadAcDcWorkbench();
      void loadSmallSignalDashboard();
    };
    if (typeof win.requestIdleCallback === 'function') {
      const id = win.requestIdleCallback(prefetchSecondary, { timeout: 2500 });
      return () => win.cancelIdleCallback?.(id);
    }
    const timer = window.setTimeout(prefetchSecondary, 1500);
    return () => window.clearTimeout(timer);
  }, []);

  const handlePinToggle = () => {
    if (domainTab === 'acdc') {
      setPinnedAcdc((prev) => {
        const next = prev ? null : { ...acdcState };
        pushToast(next ? 'Pinned AC-DC reference curve' : 'Unpinned AC-DC reference', 'info');
        return next;
      });
    } else {
      setPinnedDcdc((prev) => {
        const next = prev ? null : { ...dcdcState };
        pushToast(next ? 'Pinned DC-DC reference curve' : 'Unpinned DC-DC reference', 'info');
        return next;
      });
    }
  };

  const handleReset = () => {
    if (domainTab === 'acdc') {
      clearAcdcChanges();
      setAcdcState({ ...ACDC_PRESETS[0].state });
      setPinnedAcdc(null);
      resetInductorConfigs(Object.keys(inductorConfigs).filter((k) => k.startsWith('acdc-')));
      resetCapacitorConfigs(Object.keys(capacitorConfigs).filter((k) => k.startsWith('acdc-')));
      pushToast('Reset AC-DC PFC stage to default preset', 'info');
    } else {
      clearDcdcChanges();
      setDcdcState({ ...DCDC_PRESETS[0].state });
      setPinnedDcdc(null);
      resetInductorConfigs(Object.keys(inductorConfigs).filter((k) => k.startsWith('dcdc-')));
      resetCapacitorConfigs(Object.keys(capacitorConfigs).filter((k) => k.startsWith('dcdc-')));
      pushToast('Reset DC-DC stage to default preset', 'info');
    }
  };

  const handleExportJson = () => {
    const payload =
      domainTab === 'acdc'
        ? { domain: 'ac-dc-pfc', state: acdcState, results: acdcRes }
        : { domain: 'dc-dc-isolated', state: dcdcState, results: dcdcRes };
    const filename = `${domainTab}_design_spec.json`;
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    pushToast(`Downloaded ${filename}`);
  };

  const handleExportFullProjectJson = () => {
    const file = buildProjectFile(projectNameInput || dcdcState.presetName || 'VoltCraft Project', {
      dcdcState,
      acdcState,
      inductorConfigs,
      capacitorConfigs,
      systemLink,
    });
    const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `voltcraft_project_v2.json`;
    a.click();
    URL.revokeObjectURL(url);
    pushToast('Downloaded voltcraft_project_v2.json');
  };

  const effectiveDcdcSimTimeUs =
    systemLink.dcdcSimTime_us ?? getDefaultDcDcSimTimeUs(dcdcState.fsw_kHz);
  const effectiveAcdcSimTimeMs =
    systemLink.acdcSimTime_ms ?? getDefaultAcDcSimTimeMs(acdcState.f_line_Hz);
  const effectiveCombinedSimTimeMs =
    systemLink.combinedSimTime_ms ?? getDefaultCombinedSimTimeMs(acdcState.f_line_Hz);

  const activeExportScopeLabel =
    domainTab === 'combined' || (outputMode === 'combined' && domainTab === 'small-signal')
      ? `Combined · ${effectiveCombinedSimTimeMs} ms`
      : domainTab === 'acdc'
      ? `AC-DC PFC · ${effectiveAcdcSimTimeMs} ms`
      : `DC-DC · ${effectiveDcdcSimTimeUs} µs`;

  const handleExportActiveSpice = () => {
    const isCombined = domainTab === 'combined' || (outputMode === 'combined' && domainTab === 'small-signal');
    const text = isCombined
      ? generateCombinedSystemSpiceNetlist(
          acdcState,
          acdcRes,
          dcdcState,
          dcdcRes,
          sharedMcu,
          effectiveCombinedSimTimeMs
        )
      : domainTab === 'acdc'
      ? generateAcDcSpiceNetlist(acdcState, acdcRes, effectiveAcdcSimTimeMs)
      : generateDcDcSpiceNetlist(dcdcState, dcdcRes, effectiveDcdcSimTimeUs);
    const filename = isCombined
      ? `voltcraft_combined_${acdcState.topology}_to_${dcdcState.topology}.cir`
      : domainTab === 'acdc'
      ? `voltcraft_${acdcState.topology}.cir`
      : `voltcraft_${dcdcState.topology}.cir`;
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    pushToast(`Downloaded ${filename} (${activeExportScopeLabel})`);
  };

  const handleExportActiveLtspiceAsc = () => {
    const isCombined = domainTab === 'combined' || (outputMode === 'combined' && domainTab === 'small-signal');
    const text = isCombined
      ? generateCombinedSystemLtspiceAsc(
          acdcState,
          acdcRes,
          dcdcState,
          dcdcRes,
          sharedMcu,
          effectiveCombinedSimTimeMs
        )
      : domainTab === 'acdc'
      ? generateAcDcLtspiceAsc(acdcState, acdcRes, effectiveAcdcSimTimeMs)
      : generateDcDcLtspiceAsc(dcdcState, dcdcRes, effectiveDcdcSimTimeUs);
    const filename = isCombined
      ? `voltcraft_combined_${acdcState.topology}_to_${dcdcState.topology}.asc`
      : domainTab === 'acdc'
      ? `voltcraft_${acdcState.topology}.asc`
      : `voltcraft_${dcdcState.topology}.asc`;
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    pushToast(`Downloaded ${filename} (${activeExportScopeLabel})`);
  };

  const handleExportActiveQspiceZip = () => {
    const isCombined = domainTab === 'combined' || (outputMode === 'combined' && domainTab === 'small-signal');
    const bundle = isCombined
      ? generateCombinedSystemQspiceBundle(
          acdcState,
          acdcRes,
          dcdcState,
          dcdcRes,
          sharedMcu,
          effectiveCombinedSimTimeMs
        )
      : domainTab === 'acdc'
      ? generateAcDcQspiceBundle(acdcState, acdcRes, effectiveAcdcSimTimeMs)
      : generateDcDcQspiceBundle(dcdcState, dcdcRes, effectiveDcdcSimTimeUs);
    const filename = `${bundle.baseName}_qspice.zip`;
    const blob = new Blob([new Uint8Array(bundle.zipBytes)], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    pushToast(`Downloaded ${filename} (${activeExportScopeLabel})`);
  };

  const handleExportActivePlecsZip = () => {
    const isCombined = domainTab === 'combined' || (outputMode === 'combined' && domainTab === 'small-signal');
    const bundle = isCombined
      ? generateCombinedSystemPlecsBundle(
          acdcState,
          acdcRes,
          dcdcState,
          dcdcRes,
          sharedMcu,
          effectiveCombinedSimTimeMs
        )
      : domainTab === 'acdc'
      ? generateAcDcPlecsBundle(acdcState, acdcRes, effectiveAcdcSimTimeMs)
      : generateDcDcPlecsBundle(dcdcState, dcdcRes, effectiveDcdcSimTimeUs);
    const filename = `${bundle.baseName}_plecs.zip`;
    const blob = new Blob([new Uint8Array(bundle.zipBytes)], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    pushToast(`Downloaded ${filename} (${activeExportScopeLabel})`);
  };

  const handleExportFirmwareHeader = () => {
    const text = generateControlFirmwareHeader(dcdcState, dcdcRes, acdcState, acdcRes, sharedMcu);
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'powerstage_control_cfg.h';
    a.click();
    URL.revokeObjectURL(url);
    pushToast('Downloaded powerstage_control_cfg.h');
  };

  const handleSaveNamedProject = () => {
    const name = projectNameInput.trim() || `${dcdcState.presetName} (${dcdcState.Pout_W}W)`;
    const updated = saveNamedProject(name, {
      dcdcState,
      acdcState,
      inductorConfigs,
      capacitorConfigs,
      systemLink,
    });
    setSavedProjects(updated);
    setProjectNameInput('');
    setProjectImportStatus(`Saved "${name}" to browser workspace.`);
  };

  const handleLoadSavedProject = (entry: SavedProjectEntry) => {
    applyWorkspaceSnapshot({
      dcdcState: entry.project.dcdcState,
      acdcState: entry.project.acdcState,
      inductorConfigs: entry.project.inductorConfigs || {},
      capacitorConfigs: entry.project.capacitorConfigs || {},
      systemLink: entry.project.systemLink || { linkBusVoltage: false, linkLoadPower: false },
    });
    setProjectImportStatus(`Loaded "${entry.name}".`);
    setProjectsModalOpen(false);
  };

  const handleDeleteSavedProject = (id: string) => {
    setSavedProjects(deleteSavedProject(id));
  };

  const handleImportJsonFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      const parsed = parseImportedProjectJson(text, {
        dcdcState,
        acdcState,
        inductorConfigs,
        capacitorConfigs,
        systemLink,
      });
      if (!parsed.ok) {
        setProjectImportStatus(`Import failed: ${parsed.error}`);
        return;
      }
      applyWorkspaceSnapshot({
        dcdcState: parsed.project.dcdcState,
        acdcState: parsed.project.acdcState,
        inductorConfigs: parsed.project.inductorConfigs,
        capacitorConfigs: parsed.project.capacitorConfigs,
        systemLink: parsed.project.systemLink,
      });
      setProjectImportStatus(`Imported ${parsed.importKind}: "${parsed.project.name}".`);
    };
    reader.readAsText(file);
    e.target.value = '';
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

  const commandPaletteActions: CommandPaletteAction[] = useMemo(() => {
    const acts: CommandPaletteAction[] = [
      // Domains
      ...(outputMode !== 'dcdc-only'
        ? [
            {
              id: 'domain-acdc',
              category: 'Workbench',
              label: 'Switch to AC-DC PFC Stage',
              keywords: 'pfc totem boost acdc',
              run: () => setDomainTab('acdc'),
            },
          ]
        : []),
      ...(outputMode !== 'acdc-only'
        ? [
            {
              id: 'domain-dcdc',
              category: 'Workbench',
              label: 'Switch to DC-DC Converter Stage',
              keywords: 'psfb llc transformer dcdc',
              run: () => setDomainTab('dcdc'),
            },
          ]
        : []),
      ...(outputMode === 'combined'
        ? [
            {
              id: 'domain-combined',
              category: 'Workbench',
              label: 'Open Combined 2-Stage Circuit',
              keywords: 'cascade system bus link',
              run: () => setDomainTab('combined'),
            },
          ]
        : []),
      {
        id: 'domain-small-signal',
        category: 'Workbench',
        label: 'Open Small-Signal & Bode Lab',
        keywords: 'bode phase margin compensator',
        run: () => setDomainTab('small-signal'),
      },
      // DC-DC Sub-views
      ...(
        [
          ['schematic', 'DC-DC: Schematic & Equations', 'katex circuit'],
          ['scope-sim', 'DC-DC: Scope & Sim (ODE / Monte Carlo / SPICE)', 'qspice ltspice plecs transient'],
          ['graphs', 'DC-DC: ZVS & Tank Graphs', 'waveform primary'],
          ['magnetics', 'DC-DC: Tx Magnetics (iGSE)', 'core loss transformer'],
          ['saturation', 'DC-DC: Core Saturation & BH Loop', 'flux bsat'],
          ['winding', 'DC-DC: Winding Window & Litz', 'copper fill'],
          ['all-inductors', 'DC-DC: All Inductors Designer', 'lo shim'],
          ['thermal', 'DC-DC: Electro-Thermal & Heatsink', 'tj mosfet'],
          ['gatedrive', 'DC-DC: Gate Drive Analysis', 'rg qg'],
          ['protection', 'DC-DC: OCP & Desat Protection', 'current sense'],
          ['capacitors', 'DC-DC: All Capacitors & Hybrid Bank', 'cout mlcc'],
          ['emi', 'DC-DC: EMI Filter Design', 'cm dm'],
          ['control', 'DC-DC: Control & DSP Firmware', '2p2z pcmc'],
        ] as [DcDcSubTab, string, string][]
      ).map(([tab, label, keywords]) => ({
        id: `dcdc-${tab}`,
        category: 'DC-DC View',
        label,
        keywords,
        run: () => {
          setDomainTab('dcdc');
          setDcdcSubTab(tab);
        },
      })),
      // AC-DC Sub-views
      ...(
        [
          ['schematic', 'AC-DC: Schematic & Variants', 'totem pole'],
          ['graphs', 'AC-DC: Ripple, Hold-Up & Bode', 'waveform'],
          ['scope-sim', 'AC-DC: SPICE / QSPICE / PLECS Sim', 'export qspice'],
          ['harmonics', 'AC-DC: Harmonics & ZCD', 'thdi'],
          ['magnetics', 'AC-DC: PFC DC-Bias Curves', 'kool mu'],
          ['all-inductors', 'AC-DC: All Inductors Designer', 'lpfc'],
          ['dc-link', 'AC-DC: All Capacitors & Life', 'cdc holdup'],
          ['inrush', 'AC-DC: Inrush & Pre-Charge', 'relay'],
          ['emi', 'AC-DC: EMI & Earth Leakage', 'cy'],
          ['efficiency', 'AC-DC: Efficiency & Thermal', 'tj'],
          ['control', 'AC-DC: Control & DSP', 'acmc'],
        ] as [AcDcSubTab, string, string][]
      ).map(([tab, label, keywords]) => ({
        id: `acdc-${tab}`,
        category: 'AC-DC View',
        label,
        keywords,
        run: () => {
          setDomainTab('acdc');
          setAcdcSubTab(tab);
        },
      })),
      // Actions & Exports
      {
        id: 'action-opt-dcdc',
        category: 'Optimize',
        label: 'Auto-Optimize DC-DC Stage Now',
        keywords: 'solve fixes',
        run: () => {
          optimizeDcdcNow();
          pushToast('Ran DC-DC Auto-Optimizer');
        },
      },
      {
        id: 'action-opt-acdc',
        category: 'Optimize',
        label: 'Auto-Optimize AC-DC Stage Now',
        keywords: 'solve fixes',
        run: () => {
          optimizeAcdcNow();
          pushToast('Ran AC-DC Auto-Optimizer');
        },
      },
      {
        id: 'export-qspice',
        category: 'Export',
        label: 'Download QSPICE Simulation Suite (.zip)',
        hint: activeExportScopeLabel,
        keywords: 'qsch qraw',
        run: handleExportActiveQspiceZip,
      },
      {
        id: 'export-ltspice',
        category: 'Export',
        label: 'Download LTspice Schematic (.asc)',
        hint: activeExportScopeLabel,
        keywords: 'ltspice',
        run: handleExportActiveLtspiceAsc,
      },
      {
        id: 'export-plecs',
        category: 'Export',
        label: 'Download PLECS Standalone Bundle (.zip)',
        hint: activeExportScopeLabel,
        keywords: 'plecs',
        run: handleExportActivePlecsZip,
      },
      {
        id: 'export-cir',
        category: 'Export',
        label: 'Download SPICE Netlist (.cir)',
        hint: activeExportScopeLabel,
        keywords: 'ngspice cir',
        run: handleExportActiveSpice,
      },
      {
        id: 'export-dsp',
        category: 'Export',
        label: 'Download DSP Firmware Header (.h)',
        keywords: 'c header code',
        run: handleExportFirmwareHeader,
      },
      {
        id: 'tool-report',
        category: 'Workspace',
        label: 'Open Engineering Design Report (PDF)',
        keywords: 'print pdf',
        run: () => setReportOpen(true),
      },
      {
        id: 'tool-db',
        category: 'Workspace',
        label: 'Open Component DB (LCSC / DigiKey)',
        keywords: 'mosfet search',
        run: () => setDrawerOpen(true),
      },
      {
        id: 'tool-projects',
        category: 'Workspace',
        label: 'Open Projects & JSON Import',
        keywords: 'save load',
        run: () => {
          setProjectImportStatus(null);
          setProjectsModalOpen(true);
        },
      },
      {
        id: 'tool-ai',
        category: 'Workspace',
        label: aiEnabled ? 'Hide AI Engineer Agent' : 'Open AI Engineer Agent',
        keywords: 'audit assistant',
        run: handleToggleAiEngineer,
      },
    ];
    return acts;
  }, [outputMode, activeExportScopeLabel, aiEnabled]);

  const handleAutoOptimizeActive = () => {
    if (domainTab === 'acdc') {
      optimizeAcdcNow();
      pushToast('Auto-optimized AC-DC PFC stage');
    } else if (domainTab === 'combined') {
      optimizeAcdcNow();
      optimizeDcdcNow();
      pushToast('Auto-optimized both AC-DC & DC-DC stages');
    } else {
      optimizeDcdcNow();
      pushToast('Auto-optimized DC-DC stage');
    }
  };

  return (
    <div className="min-h-screen bg-[#f6f7f9] dark:bg-[#0e1015] text-[#111318] dark:text-[#eef0f6] flex flex-col transition-colors duration-150">
      <a
        href="#main-workbench"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-3 focus:py-1.5 focus:rounded-md focus:bg-blue-600 focus:text-white focus:text-xs focus:font-medium focus:shadow-lg"
      >
        Skip to main workbench
      </a>
      <div className={reportOpen ? 'no-print flex-1 flex flex-col' : 'flex-1 flex flex-col'}>
      {/* 3-ZONE TOP HEADER BAR (Compact & streamlined on phone, full controls on desktop) */}
      <header className="sticky top-0 z-30 py-2 px-3 sm:px-4 lg:px-5 bg-white/95 dark:bg-[#14171f]/95 backdrop-blur-md border-b border-slate-200/90 dark:border-white/[0.08] flex flex-col md:flex-row md:flex-wrap xl:flex-nowrap md:items-center md:justify-between gap-2 md:gap-2.5">
        {/* Top Row on Mobile: Brand + Compact Alert & Utility Controls */}
        <div className="flex items-center justify-between gap-2 min-w-0 md:contents">
          {/* Zone 1: Brand Title */}
          <div className="shrink-0 min-w-0">
            <div className="text-[13px] sm:text-[14px] font-semibold tracking-tight text-slate-900 dark:text-[#eef0f6] leading-tight truncate">
              Power Converter Studio
            </div>
            <div className="text-[10px] text-slate-500 dark:text-[#727b8e] leading-tight mt-0.5 whitespace-nowrap md:hidden 2xl:block">
              Precision Magnetics &amp; Control CAD
            </div>
          </div>

          {/* Mobile Quick Controls (Alerts, Jump, Theme, More) */}
          <div className="flex items-center gap-1 md:hidden shrink-0">
            <button
              type="button"
              data-popover-trigger="alert"
              onClick={() => toggleAlertPopover('danger')}
              aria-label={`${designAlerts.danger.length} Danger alerts`}
              className={`h-8 px-2 text-xs font-mono font-medium rounded-lg border inline-flex items-center gap-1 cursor-pointer ${
                designAlerts.danger.length > 0
                  ? 'bg-rose-500/10 border-rose-500/40 text-rose-700 dark:text-rose-300'
                  : 'bg-[#eff1f5] dark:bg-[#1c202b] border-slate-200 dark:border-white/[0.08] text-emerald-700 dark:text-emerald-400'
              }`}
            >
              <ShieldAlert className="w-3.5 h-3.5" aria-hidden="true" />
              <span className="tabular-nums">{designAlerts.danger.length}</span>
            </button>
            <button
              type="button"
              data-popover-trigger="alert"
              onClick={() => toggleAlertPopover('warning')}
              aria-label={`${designAlerts.warning.length} Warning alerts`}
              className={`h-8 px-2 text-xs font-mono font-medium rounded-lg border inline-flex items-center gap-1 cursor-pointer ${
                designAlerts.warning.length > 0
                  ? 'bg-amber-500/10 border-amber-500/40 text-amber-700 dark:text-amber-300'
                  : 'bg-white dark:bg-[#1c202b] border-slate-200 dark:border-white/[0.08] text-slate-600 dark:text-[#a1a8b8]'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
              <span className="tabular-nums">{designAlerts.warning.length}</span>
            </button>
            <button
              type="button"
              onClick={() => setCmdPaletteOpen(true)}
              aria-label="Quick command jump"
              className="h-8 w-8 rounded-lg bg-white dark:bg-[#1c202b] border border-slate-200 dark:border-white/[0.08] text-slate-600 dark:text-[#a1a8b8] inline-flex items-center justify-center cursor-pointer"
            >
              <Search className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={cycleThemeMode}
              aria-label={`Theme: ${themeMode} (tap to cycle Auto, Dark, Light)`}
              title={`Theme: ${themeMode.toUpperCase()} (Auto follows system)`}
              className="h-8 px-2 rounded-lg bg-white dark:bg-[#1c202b] border border-slate-200 dark:border-white/[0.08] text-slate-600 dark:text-[#a1a8b8] inline-flex items-center gap-1 text-[10px] font-mono cursor-pointer"
            >
              {darkMode ? (
                <Sun className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
              ) : (
                <Moon className="w-3.5 h-3.5 text-slate-700" aria-hidden="true" />
              )}
              {themeMode === 'auto' && <span>Auto</span>}
            </button>
            <button
              type="button"
              data-popover-trigger="more"
              onClick={() => setMoreMenuOpen((v) => !v)}
              aria-label="More workspace tools"
              className="h-8 w-8 rounded-lg bg-white dark:bg-[#1c202b] border border-slate-200 dark:border-white/[0.08] text-slate-600 dark:text-[#a1a8b8] inline-flex items-center justify-center cursor-pointer"
            >
              <MoreHorizontal className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Zone 2: Primary Domain Switcher (Horizontal swipeable pill rail on mobile) */}
        <nav
          aria-label="Workbench domains"
          className="flex items-center gap-0.5 bg-[#eceef2] dark:bg-[#090a0d] p-1 rounded-lg border border-slate-200/80 dark:border-white/[0.07] overflow-x-auto no-scrollbar max-w-full shrink-0"
        >
          {(outputMode === 'acdc-only' || outputMode === 'combined') && (
            <button
              type="button"
              onMouseEnter={() => { void loadAcDcWorkbench(); }}
              onFocus={() => { void loadAcDcWorkbench(); }}
              onClick={() => setDomainTab('acdc')}
              className={`px-2 sm:px-2.5 py-1 text-xs font-medium rounded-md transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
                domainTab === 'acdc'
                  ? 'bg-white dark:bg-[#1c202b] text-blue-700 dark:text-blue-300 border border-slate-200/90 dark:border-white/[0.12] shadow-2xs'
                  : 'text-slate-600 dark:text-[#a1a8b8] hover:text-slate-900 dark:hover:text-[#eef0f6] border border-transparent'
              }`}
            >
              <Zap className="w-3.5 h-3.5" aria-hidden="true" />
              AC-DC PFC
            </button>
          )}
          {(outputMode === 'dcdc-only' || outputMode === 'combined') && (
            <button
              type="button"
              onClick={() => setDomainTab('dcdc')}
              className={`px-2 sm:px-2.5 py-1 text-xs font-medium rounded-md transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
                domainTab === 'dcdc'
                  ? 'bg-white dark:bg-[#1c202b] text-blue-700 dark:text-blue-300 border border-slate-200/90 dark:border-white/[0.12] shadow-2xs'
                  : 'text-slate-600 dark:text-[#a1a8b8] hover:text-slate-900 dark:hover:text-[#eef0f6] border border-transparent'
              }`}
            >
              <Cpu className="w-3.5 h-3.5" aria-hidden="true" />
              DC-DC
            </button>
          )}
          {outputMode === 'combined' && (
            <button
              type="button"
              onClick={() => setDomainTab('combined')}
              className={`px-2 sm:px-2.5 py-1 text-xs font-medium rounded-md transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
                domainTab === 'combined'
                  ? 'bg-white dark:bg-[#1c202b] text-emerald-700 dark:text-emerald-300 border border-emerald-500/40 shadow-2xs'
                  : 'text-slate-600 dark:text-[#a1a8b8] hover:text-slate-900 dark:hover:text-[#eef0f6] border border-transparent'
              }`}
            >
              <Layers className="w-3.5 h-3.5" aria-hidden="true" />
              Combined
            </button>
          )}
          <button
            type="button"
            onMouseEnter={() => { void loadSmallSignalDashboard(); }}
            onFocus={() => { void loadSmallSignalDashboard(); }}
            onClick={() => setDomainTab('small-signal')}
            className={`px-2 sm:px-2.5 py-1 text-xs font-medium rounded-md transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
              domainTab === 'small-signal'
                ? 'bg-white dark:bg-[#1c202b] text-blue-700 dark:text-blue-300 border border-slate-200/90 dark:border-white/[0.12] shadow-2xs'
                : 'text-slate-600 dark:text-[#a1a8b8] hover:text-slate-900 dark:hover:text-[#eef0f6] border border-transparent'
            }`}
          >
            <Compass className="w-3.5 h-3.5" aria-hidden="true" />
            Small-Signal
          </button>
        </nav>

        {/* Zone 3: Alert Center + Global Utility Actions (Desktop & Tablet md+) */}
        <div className="hidden md:flex flex-wrap xl:flex-nowrap items-center gap-1.5 w-auto min-w-0">
          {/* Danger & Warning Header Counters + Direct Jump Dropdown */}
          <div ref={alertPopoverRef} className="relative flex items-center gap-1">
            <button
              type="button"
              data-popover-trigger="alert"
              onClick={() => toggleAlertPopover('danger')}
              aria-expanded={openAlertFilter === 'danger'}
              className={`h-8 px-2 text-xs font-medium rounded-lg border transition-colors inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer ${
                designAlerts.danger.length > 0
                  ? openAlertFilter === 'danger'
                    ? 'bg-rose-600 border-rose-600 text-white'
                    : 'bg-rose-500/10 hover:bg-rose-500/15 border-rose-500/40 text-rose-700 dark:text-rose-300'
                  : openAlertFilter === 'danger'
                  ? 'bg-emerald-600 border-emerald-600 text-white'
                  : 'bg-[#eff1f5] dark:bg-[#1c202b] hover:border-slate-300 dark:hover:border-white/[0.16] border-slate-200 dark:border-white/[0.08] text-emerald-700 dark:text-emerald-400'
              }`}
              title="Critical danger alerts that require fixes — click to list and jump directly"
            >
              <ShieldAlert className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span className="font-mono font-medium tabular-nums">{designAlerts.danger.length}</span>
              <span className="hidden 2xl:inline">Danger</span>
            </button>

            <button
              type="button"
              data-popover-trigger="alert"
              onClick={() => toggleAlertPopover('warning')}
              aria-expanded={openAlertFilter === 'warning'}
              className={`h-8 px-2 text-xs font-medium rounded-lg border transition-colors inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer ${
                designAlerts.warning.length > 0
                  ? openAlertFilter === 'warning'
                    ? 'bg-amber-600 border-amber-600 text-white'
                    : 'bg-amber-500/10 hover:bg-amber-500/15 border-amber-500/40 text-amber-700 dark:text-amber-300'
                  : openAlertFilter === 'warning'
                  ? 'bg-slate-700 border-slate-600 text-white'
                  : 'bg-white dark:bg-[#1c202b] border-slate-200 dark:border-white/[0.08] text-slate-600 dark:text-[#a1a8b8] hover:border-slate-300 dark:hover:border-white/[0.16]'
              }`}
              title="Advisory warnings with tight design margins — click to list and jump directly"
            >
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span className="font-mono font-medium tabular-nums">{designAlerts.warning.length}</span>
              <span className="hidden 2xl:inline">Warning</span>
            </button>
          </div>

          {/* Command Palette Trigger (Ctrl+K) */}
          <button
            type="button"
            onClick={() => setCmdPaletteOpen(true)}
            className="h-8 px-2 text-xs font-medium rounded-lg bg-white dark:bg-[#1c202b] border border-slate-200 dark:border-white/[0.08] text-slate-600 dark:text-[#a1a8b8] hover:border-blue-500/50 hover:text-slate-900 dark:hover:text-[#eef0f6] transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            title="Quick jump to any view, preset, optimizer, or export (Ctrl+K / Cmd+K)"
          >
            <Search className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" aria-hidden="true" />
            <span className="hidden 2xl:inline">Jump</span>
            <kbd className="text-[10px] font-mono px-1 py-0.2 rounded bg-slate-100 dark:bg-[#0e1015] border border-slate-200 dark:border-white/[0.08] text-slate-500 dark:text-[#727b8e]">
              ⌘K
            </kbd>
          </button>

          {/* Auto-Optimize Active Stage (1-Click Automatic Tuning) */}
          <button
            type="button"
            onClick={handleAutoOptimizeActive}
            className="h-8 px-2.5 text-xs font-medium rounded-lg bg-blue-50 dark:bg-blue-600/15 hover:bg-blue-100 dark:hover:bg-blue-600/25 border border-blue-300 dark:border-blue-500/35 text-blue-700 dark:text-blue-300 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            title="Automatically recalculate unlocked parameters for optimal operation"
          >
            <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="hidden lg:inline">Optimize</span>
          </button>

          {/* Unified Export Menu Trigger */}
          <div ref={exportMenuRef} className="relative">
            <button
              type="button"
              data-popover-trigger="export"
              onClick={() => setExportMenuOpen((v) => !v)}
              aria-expanded={exportMenuOpen}
              className={`h-8 px-2.5 text-xs font-medium rounded-lg border transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
                exportMenuOpen
                  ? 'bg-[#eff1f5] dark:bg-[#1c202b] border-blue-500/60 text-blue-700 dark:text-blue-300'
                  : 'bg-white dark:bg-[#1c202b] border-slate-200 dark:border-white/[0.08] text-slate-700 dark:text-[#eef0f6] hover:border-slate-300 dark:hover:border-white/[0.16]'
              }`}
              title={`Export QSPICE, LTspice, PLECS, SPICE, DSP .h or JSON (${activeExportScopeLabel})`}
            >
              <Download className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              <span>Export</span>
              <ChevronDown className="w-3 h-3 opacity-70" aria-hidden="true" />
            </button>
          </div>

          <button
            type="button"
            onMouseEnter={() => { void loadDesignReportModal(); }}
            onFocus={() => { void loadDesignReportModal(); }}
            onClick={() => setReportOpen(true)}
            className="h-8 px-2.5 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-500 text-white shadow-2xs transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            title="Generate engineering design report with derivations, graphs & PDF print"
          >
            <FileText className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Report</span>
          </button>

          <button
            type="button"
            onClick={handleToggleAiEngineer}
            aria-pressed={aiEnabled}
            className={`h-8 px-2.5 text-xs font-medium rounded-lg border transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
              aiEnabled
                ? 'bg-blue-50 dark:bg-blue-500/15 border-blue-400 dark:border-blue-500/60 text-blue-700 dark:text-blue-300'
                : 'bg-white dark:bg-[#1c202b] border-slate-200 dark:border-white/[0.08] text-slate-700 dark:text-[#a1a8b8] hover:border-slate-300 dark:hover:border-white/[0.16]'
            }`}
            title={`Toggle AI Engineer Assistant (${AI_PROVIDER_META[aiConfig.provider].label} · ${aiConfig.model})`}
          >
            <Bot className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span className="hidden lg:inline">AI</span>
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                aiEnabled
                  ? 'bg-blue-500'
                  : validateAiProviderConfig(aiConfig)
                  ? 'bg-amber-500'
                  : 'bg-emerald-500'
              }`}
            />
          </button>

          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="h-8 px-2.5 text-xs font-medium rounded-lg bg-white dark:bg-[#1c202b] border border-slate-200 dark:border-white/[0.08] text-slate-700 dark:text-[#eef0f6] hover:border-slate-300 dark:hover:border-white/[0.16] transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            title="Open LCSC / DigiKey Component Database and BOM Exporter"
          >
            <Cpu className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" aria-hidden="true" />
            <span className="hidden xl:inline">Parts</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setProjectImportStatus(null);
              setProjectsModalOpen(true);
            }}
            className="h-8 px-2.5 text-xs font-medium rounded-lg bg-white dark:bg-[#1c202b] border border-slate-200 dark:border-white/[0.08] text-slate-700 dark:text-[#a1a8b8] hover:border-slate-300 dark:hover:border-white/[0.16] inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
            title="Save/Load Projects & Import JSON"
          >
            <FolderOpen className="w-3.5 h-3.5 text-slate-500 dark:text-[#727b8e]" aria-hidden="true" />
            <span className="hidden xl:inline">Projects</span>
          </button>

          <div className="inline-flex items-center rounded-lg border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#1c202b] overflow-hidden shrink-0">
            <button
              type="button"
              onClick={handleUndo}
              disabled={historyStack.past.length === 0}
              className="h-8 w-8 text-slate-600 dark:text-[#a1a8b8] hover:bg-slate-100 dark:hover:bg-white/[0.06] disabled:opacity-35 inline-flex items-center justify-center cursor-pointer transition-colors"
              title="Undo last design edit (Ctrl+Z)"
              aria-label="Undo"
            >
              <Undo2 className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={handleRedo}
              disabled={historyStack.future.length === 0}
              className="h-8 w-8 border-l border-slate-200 dark:border-white/[0.08] text-slate-600 dark:text-[#a1a8b8] hover:bg-slate-100 dark:hover:bg-white/[0.06] disabled:opacity-35 inline-flex items-center justify-center cursor-pointer transition-colors"
              title="Redo design edit (Ctrl+Shift+Z)"
              aria-label="Redo"
            >
              <Redo2 className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>

          <button
            type="button"
            onClick={cycleThemeMode}
            className="h-8 px-2 rounded-lg bg-white dark:bg-[#1c202b] border border-slate-200 dark:border-white/[0.08] text-slate-600 dark:text-[#a1a8b8] hover:border-slate-300 dark:hover:border-white/[0.16] inline-flex items-center justify-center gap-1 shrink-0 cursor-pointer transition-colors"
            title={`Theme: ${themeMode.toUpperCase()} (Auto follows system — click to cycle)`}
            aria-label={`Theme: ${themeMode} (click to cycle Auto, Dark, Light)`}
          >
            {darkMode ? (
              <Sun className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
            ) : (
              <Moon className="w-3.5 h-3.5 text-slate-700" aria-hidden="true" />
            )}
            {themeMode === 'auto' && <span className="text-[10px] font-mono">Auto</span>}
          </button>

          {/* Secondary Actions Overflow Menu Trigger */}
          <div ref={moreMenuRef} className="relative">
            <button
              type="button"
              data-popover-trigger="more"
              onClick={() => setMoreMenuOpen((v) => !v)}
              aria-expanded={moreMenuOpen}
              aria-label="More workspace tools"
              className={`h-8 w-8 rounded-lg border inline-flex items-center justify-center shrink-0 cursor-pointer transition-colors ${
                moreMenuOpen || isPinned
                  ? 'bg-amber-500/10 border-amber-500/50 text-amber-700 dark:text-amber-300'
                  : 'bg-white dark:bg-[#1c202b] border-slate-200 dark:border-white/[0.08] text-slate-600 dark:text-[#a1a8b8] hover:border-slate-300 dark:hover:border-white/[0.16]'
              }`}
              title="More tools: Pin Reference, AI API Keys, Reset Stage"
            >
              <MoreHorizontal className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      {/* SHARED RESPONSIVE POPOVERS (Work seamlessly from both Desktop Header and Mobile Header/Dock) */}
      {openAlertFilter && (
        <div
          role="dialog"
          data-popover-panel="alert"
          aria-label="Design alerts list"
          style={alertPopoverStyle}
          className="flex flex-col bg-white dark:bg-[#14171f] border border-slate-200 dark:border-white/[0.12] rounded-xl shadow-2xl z-50 overflow-hidden overscroll-contain"
        >
          {/* Popover Header */}
          <div className="px-3.5 py-2.5 border-b border-slate-200 dark:border-white/[0.08] flex items-center justify-between gap-2 bg-[#f6f7f9] dark:bg-[#0e1015]">
            <div className="min-w-0">
              <div className="text-xs font-medium text-slate-900 dark:text-[#eef0f6] truncate">
                Design alerts — tap to inspect or fix
              </div>
              <div className="text-[11px] text-slate-500 dark:text-[#727b8e] truncate">
                {openAlertFilter === 'danger'
                  ? 'Critical limit violations requiring resolution'
                  : openAlertFilter === 'warning'
                  ? 'Tight margins or sub-optimal operating points'
                  : 'All critical and advisory design findings'}
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {designAlerts.all.length > 0 && (
                <button
                  type="button"
                  onClick={() => handleAutoOptimizeActive()}
                  className="h-7 px-2 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-medium inline-flex items-center gap-1 cursor-pointer"
                  title="Run Auto-Optimizer on active stage"
                >
                  <Sparkles className="w-3 h-3" aria-hidden="true" />
                  <span>Auto-Fix</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpenAlertFilter(null)}
                aria-label="Close alerts list"
                className="h-7 w-7 rounded-md border border-slate-200 dark:border-white/[0.1] text-slate-500 hover:text-slate-900 dark:hover:text-[#eef0f6] inline-flex items-center justify-center cursor-pointer"
              >
                <X className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* Filter & Scope Controls */}
          <div className="px-3 py-2 border-b border-slate-200 dark:border-white/[0.08] flex flex-wrap items-center justify-between gap-2 bg-white dark:bg-[#14171f]">
            <div className="inline-flex items-center gap-1 bg-[#eceef2] dark:bg-[#090a0d] p-0.5 rounded-lg border border-slate-200 dark:border-white/[0.07]">
              <button
                type="button"
                onClick={() => setOpenAlertFilter('danger')}
                className={`px-2 py-1 text-[11px] font-mono rounded-md cursor-pointer transition-colors inline-flex items-center gap-1.5 ${
                  openAlertFilter === 'danger'
                    ? 'bg-rose-600 text-white font-medium'
                    : 'text-rose-700 dark:text-rose-400 hover:bg-rose-500/10'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${openAlertFilter === 'danger' ? 'bg-white' : 'bg-rose-500'}`} />
                Danger ({designAlerts.danger.length})
              </button>
              <button
                type="button"
                onClick={() => setOpenAlertFilter('warning')}
                className={`px-2 py-1 text-[11px] font-mono rounded-md cursor-pointer transition-colors inline-flex items-center gap-1.5 ${
                  openAlertFilter === 'warning'
                    ? 'bg-amber-600 text-white font-medium'
                    : 'text-amber-700 dark:text-amber-400 hover:bg-amber-500/10'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${openAlertFilter === 'warning' ? 'bg-white' : 'bg-amber-500'}`} />
                Warning ({designAlerts.warning.length})
              </button>
              <button
                type="button"
                onClick={() => setOpenAlertFilter('all')}
                className={`px-2 py-1 text-[11px] font-mono rounded-md cursor-pointer transition-colors ${
                  openAlertFilter === 'all'
                    ? 'bg-white dark:bg-[#1c202b] text-slate-900 dark:text-[#eef0f6] font-medium'
                    : 'text-slate-600 dark:text-[#a1a8b8] hover:bg-slate-200/60 dark:hover:bg-white/[0.05]'
                }`}
              >
                All ({designAlerts.all.length})
              </button>
            </div>

            {(domainTab === 'dcdc' || domainTab === 'acdc') && outputMode === 'combined' && (
              <div className="inline-flex items-center gap-1 text-[10px] font-mono">
                <button
                  type="button"
                  onClick={() => setAlertStageScope('all')}
                  className={`px-2 py-0.5 rounded-md border cursor-pointer ${
                    alertStageScope === 'all'
                      ? 'bg-slate-800 dark:bg-[#1c202b] border-slate-700 dark:border-white/[0.16] text-white'
                      : 'border-slate-200 dark:border-white/[0.08] text-slate-500 dark:text-[#727b8e]'
                  }`}
                >
                  Both Stages
                </button>
                <button
                  type="button"
                  onClick={() => setAlertStageScope('active')}
                  className={`px-2 py-0.5 rounded-md border cursor-pointer ${
                    alertStageScope === 'active'
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'border-slate-200 dark:border-white/[0.08] text-slate-500 dark:text-[#727b8e]'
                  }`}
                >
                  {domainTab === 'dcdc' ? 'DC-DC Only' : 'AC-DC Only'}
                </button>
              </div>
            )}
          </div>

          {/* Scrollable Alert Rows */}
          <div className="flex-1 overflow-y-auto overscroll-contain divide-y divide-slate-100 dark:divide-white/[0.06]">
            {visiblePopoverAlerts.length === 0 ? (
              <div className="p-6 text-center space-y-1.5">
                <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto" />
                <div className="text-xs font-medium text-slate-800 dark:text-[#eef0f6]">
                  {openAlertFilter === 'danger'
                    ? 'No critical danger alerts active'
                    : openAlertFilter === 'warning'
                    ? 'No advisory warnings active'
                    : 'All converter parameters within safe limits'}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-[#727b8e]">
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
                              className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-medium border shrink-0 ${
                                alert.domain === 'dcdc'
                                  ? 'bg-blue-500/10 border-blue-500/30 text-blue-700 dark:text-blue-300'
                                  : 'bg-slate-500/10 border-slate-500/30 text-slate-700 dark:text-[#a1a8b8]'
                              }`}
                            >
                              {alert.domainLabel}
                            </span>
                            <span className="text-[10px] font-mono text-slate-500 dark:text-[#727b8e] truncate">
                              / {alert.subTabLabel}
                            </span>
                          </div>
                          <span
                            className={`inline-flex items-center gap-0.5 text-[10px] font-mono font-medium shrink-0 ${
                              isDanger
                                ? 'text-rose-600 dark:text-rose-400'
                                : 'text-amber-600 dark:text-amber-400'
                            }`}
                          >
                            Inspect
                            <ArrowUpRight className="w-3 h-3" />
                          </span>
                        </div>

                        <div className="text-xs font-medium text-slate-900 dark:text-[#eef0f6] leading-snug">
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

                        <div className="text-[11px] text-slate-500 dark:text-[#727b8e] leading-snug">
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
                            className={`w-full text-left px-2.5 py-1.5 rounded-lg border transition-colors cursor-pointer ${
                              isDanger
                                ? 'bg-white dark:bg-[#1c202b] border-rose-300 dark:border-rose-500/35 hover:border-emerald-500 dark:hover:border-emerald-500/60'
                                : 'bg-white dark:bg-[#1c202b] border-amber-300 dark:border-amber-500/35 hover:border-emerald-500 dark:hover:border-emerald-500/60'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[11px] font-medium text-slate-900 dark:text-[#eef0f6] leading-tight">
                                1-Click Fix: {fix.label}
                              </span>
                              <span className="px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[10px] font-mono font-medium shrink-0">
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

      {exportMenuOpen && (
        <div
          role="menu"
          data-popover-panel="export"
          aria-label="Simulation and file exports"
          className="fixed inset-x-2 bottom-20 md:bottom-auto md:inset-x-auto md:top-14 md:right-24 md:w-80 rounded-xl bg-white dark:bg-[#14171f] border border-slate-200 dark:border-white/[0.12] shadow-2xl z-50 overflow-hidden overscroll-contain"
        >
          <div className="px-3.5 py-2.5 border-b border-slate-200 dark:border-white/[0.08] bg-[#f6f7f9] dark:bg-[#0e1015]">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-900 dark:text-[#eef0f6]">
                Simulation &amp; CAD Exports
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-500/10 border border-blue-500/30 text-blue-700 dark:text-blue-300">
                {activeExportScopeLabel}
              </span>
            </div>
            {/* Inline Simulation Stop Time */}
            <div className="mt-2 flex items-center justify-between gap-2 text-[11px] font-mono">
              <span className="inline-flex items-center gap-1 text-slate-500 dark:text-[#727b8e]">
                <Clock className="w-3 h-3" aria-hidden="true" /> Stop Time:
              </span>
              {domainTab === 'combined' ||
              (outputMode === 'combined' && domainTab === 'small-signal') ? (
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={1}
                    max={500}
                    step={5}
                    aria-label="Combined simulation stop time in milliseconds"
                    value={effectiveCombinedSimTimeMs}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setSystemLink((s) => ({
                        ...s,
                        combinedSimTime_ms: Number.isFinite(v) && v > 0 ? v : undefined,
                      }));
                    }}
                    className="w-20 px-2 py-0.5 text-right rounded border border-slate-300 dark:border-white/[0.12] bg-white dark:bg-[#14171f] text-slate-900 dark:text-white"
                  />
                  <span className="text-slate-500">ms</span>
                </div>
              ) : domainTab === 'acdc' ? (
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={1}
                    max={500}
                    step={5}
                    aria-label="AC-DC simulation stop time in milliseconds"
                    value={effectiveAcdcSimTimeMs}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setSystemLink((s) => ({
                        ...s,
                        acdcSimTime_ms: Number.isFinite(v) && v > 0 ? v : undefined,
                      }));
                    }}
                    className="w-20 px-2 py-0.5 text-right rounded border border-slate-300 dark:border-white/[0.12] bg-white dark:bg-[#14171f] text-slate-900 dark:text-white"
                  />
                  <span className="text-slate-500">ms</span>
                </div>
              ) : (
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={50}
                    max={50000}
                    step={100}
                    aria-label="DC-DC simulation stop time in microseconds"
                    value={effectiveDcdcSimTimeUs}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setSystemLink((s) => ({
                        ...s,
                        dcdcSimTime_us:
                          Number.isFinite(v) && v >= 50 ? Math.round(v) : undefined,
                      }));
                    }}
                    className="w-20 px-2 py-0.5 text-right rounded border border-slate-300 dark:border-white/[0.12] bg-white dark:bg-[#14171f] text-slate-900 dark:text-white"
                  />
                  <span className="text-slate-500">µs</span>
                </div>
              )}
            </div>
          </div>

          <div className="p-1.5 space-y-1 text-xs max-h-[55dvh] overflow-y-auto">
            {(
              [
                {
                  label: 'QSPICE Suite (.zip)',
                  sub: '.qsch, C-Block, .qsym, .lib, .qraw',
                  color: 'text-violet-600 dark:text-violet-400',
                  onClick: handleExportActiveQspiceZip,
                },
                {
                  label: 'LTspice Schematic (.asc)',
                  sub: 'Grid-aligned schematic + .SUBCKTs',
                  color: 'text-emerald-600 dark:text-emerald-400',
                  onClick: handleExportActiveLtspiceAsc,
                },
                {
                  label: 'PLECS Standalone (.zip)',
                  sub: '.plecs, init_params.m, thermal XML',
                  color: 'text-sky-600 dark:text-sky-400',
                  onClick: handleExportActivePlecsZip,
                },
                {
                  label: 'SPICE Netlist (.cir)',
                  sub: 'Standalone ngspice / QSPICE / LTspice',
                  color: 'text-blue-600 dark:text-blue-400',
                  onClick: handleExportActiveSpice,
                },
                {
                  label: 'DSP Control Header (.h)',
                  sub: `${sharedMcu ? 'Shared MCU' : 'Dual MCU'} Tustin coefficients`,
                  color: 'text-amber-600 dark:text-amber-400',
                  onClick: handleExportFirmwareHeader,
                },
                {
                  label: 'Active Stage Spec (.json)',
                  sub: 'Design parameters + analytical results',
                  color: 'text-slate-500 dark:text-slate-400',
                  onClick: handleExportJson,
                },
                {
                  label: 'Full 2-Stage Project (.json)',
                  sub: 'Includes custom magnetics, caps & sim times',
                  color: 'text-slate-500 dark:text-slate-400',
                  onClick: handleExportFullProjectJson,
                },
              ] as const
            ).map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => {
                  item.onClick();
                  setExportMenuOpen(false);
                }}
                className="w-full px-2.5 py-2 sm:py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-[#1c202b] text-left flex items-center justify-between gap-2 cursor-pointer transition-colors"
              >
                <div className="min-w-0">
                  <div className="font-medium text-slate-900 dark:text-[#eef0f6] truncate">
                    {item.label}
                  </div>
                  <div className="text-[10px] font-mono text-slate-500 dark:text-[#727b8e] truncate">
                    {item.sub}
                  </div>
                </div>
                <Download className={`w-3.5 h-3.5 shrink-0 ${item.color}`} aria-hidden="true" />
              </button>
            ))}
          </div>
        </div>
      )}

      {moreMenuOpen && (
        <div
          role="menu"
          data-popover-panel="more"
          aria-label="Workspace tools menu"
          className="fixed right-2 top-14 w-64 rounded-xl bg-white dark:bg-[#14171f] border border-slate-200 dark:border-white/[0.12] shadow-2xl z-50 p-1.5 space-y-1 text-xs"
        >
          {/* Mobile-accessible workspace shortcuts */}
          <div className="md:hidden border-b border-slate-200 dark:border-white/[0.08] pb-1 mb-1 space-y-1">
            <button
              type="button"
              onClick={() => {
                setDrawerOpen(true);
                setMoreMenuOpen(false);
              }}
              className="w-full px-2.5 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-[#1c202b] flex items-center gap-2 font-medium text-slate-800 dark:text-[#eef0f6] text-left cursor-pointer"
            >
              <Cpu className="w-3.5 h-3.5 text-blue-500" aria-hidden="true" />
              LCSC / DigiKey Parts DB
            </button>
            <button
              type="button"
              onClick={() => {
                setProjectImportStatus(null);
                setProjectsModalOpen(true);
                setMoreMenuOpen(false);
              }}
              className="w-full px-2.5 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-[#1c202b] flex items-center gap-2 font-medium text-slate-800 dark:text-[#eef0f6] text-left cursor-pointer"
            >
              <FolderOpen className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
              Projects &amp; JSON Import
            </button>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => {
                  handleUndo();
                  setMoreMenuOpen(false);
                }}
                disabled={historyStack.past.length === 0}
                className="flex-1 px-2.5 py-2 rounded-lg bg-slate-100 dark:bg-[#1c202b] disabled:opacity-40 flex items-center justify-center gap-1.5 font-medium text-slate-800 dark:text-[#eef0f6] cursor-pointer"
              >
                <Undo2 className="w-3.5 h-3.5" aria-hidden="true" /> Undo
              </button>
              <button
                type="button"
                onClick={() => {
                  handleRedo();
                  setMoreMenuOpen(false);
                }}
                disabled={historyStack.future.length === 0}
                className="flex-1 px-2.5 py-2 rounded-lg bg-slate-100 dark:bg-[#1c202b] disabled:opacity-40 flex items-center justify-center gap-1.5 font-medium text-slate-800 dark:text-[#eef0f6] cursor-pointer"
              >
                <Redo2 className="w-3.5 h-3.5" aria-hidden="true" /> Redo
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              handlePinToggle();
              setMoreMenuOpen(false);
            }}
            className="w-full px-2.5 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-[#1c202b] flex items-center justify-between gap-2 text-left cursor-pointer"
          >
            <span className="inline-flex items-center gap-2 font-medium text-slate-800 dark:text-[#eef0f6]">
              <Pin className={`w-3.5 h-3.5 ${isPinned ? 'text-amber-500' : 'text-slate-400'}`} aria-hidden="true" />
              {isPinned ? 'Unpin Reference Curve' : 'Pin Curve as Reference'}
            </span>
            {isPinned && (
              <span className="text-[10px] font-mono text-amber-600 dark:text-amber-400">
                Active
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              setAiKeysModalOpen(true);
              setMoreMenuOpen(false);
            }}
            className="w-full px-2.5 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-[#1c202b] flex items-center justify-between gap-2 text-left cursor-pointer"
          >
            <span className="inline-flex items-center gap-2 font-medium text-slate-800 dark:text-[#eef0f6]">
              <KeyRound className="w-3.5 h-3.5 text-blue-500" aria-hidden="true" />
              AI Keys ({AI_PROVIDER_META[aiConfig.provider].shortLabel})
            </span>
            <span
              className={`w-2 h-2 rounded-full ${
                validateAiProviderConfig(aiConfig)
                  ? 'bg-amber-500'
                  : aiConfig.apiKey
                  ? 'bg-emerald-500'
                  : 'bg-blue-500'
              }`}
            />
          </button>

          <button
            type="button"
            onClick={() => {
              handleReset();
              setMoreMenuOpen(false);
            }}
            className="w-full px-2.5 py-2 rounded-lg hover:bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center gap-2 font-medium text-left cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            Reset Active Stage Preset
          </button>
        </div>
      )}

      {/* PROJECT OUTPUT MODE & 2-STAGE SYSTEM CASCADE LINK STRIP */}
      <div className="no-print bg-[#eceef2]/80 dark:bg-[#090a0d] border-b border-slate-200 dark:border-white/[0.07] px-3 sm:px-4 lg:px-6 py-1.5 flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-1.5 sm:gap-2 text-[11px] font-mono">
        <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar min-w-0">
          {/* Project Output Scope Selector */}
          <div className="inline-flex items-center bg-white/90 dark:bg-[#14171f] p-0.5 rounded-lg border border-slate-300/80 dark:border-white/[0.08] shrink-0">
            {(
              [
                { id: 'dcdc-only', label: 'DC-DC Only' },
                { id: 'acdc-only', label: 'AC-DC Only' },
                { id: 'combined', label: 'Combined (AC-DC + DC-DC)' },
              ] as { id: ProjectOutputMode; label: string }[]
            ).map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => handleChangeOutputMode(m.id)}
                className={`px-2 py-0.5 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  outputMode === m.id
                    ? 'bg-blue-600 text-white font-semibold shadow-xs'
                    : 'text-slate-600 dark:text-[#a1a8b8] hover:text-slate-900 dark:hover:text-[#eef0f6]'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {outputMode === 'combined' && (
            <>
              <button
                type="button"
                onClick={handleConnectTogether}
                className={`px-2.5 py-0.5 rounded-md border cursor-pointer transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                  systemLink.linkBusVoltage && systemLink.linkLoadPower
                    ? 'bg-emerald-600 border-emerald-500 text-white font-semibold shadow-xs'
                    : 'bg-blue-600/10 hover:bg-blue-600/20 border-blue-500/45 text-blue-700 dark:text-blue-300 font-medium'
                }`}
                title="Connect AC-DC PFC output bus & DC-DC load power together and open unified circuit view"
              >
                <Link2 className="w-3.5 h-3.5" aria-hidden="true" />
                {systemLink.linkBusVoltage && systemLink.linkLoadPower
                  ? 'Connected'
                  : 'Connect Together'}
              </button>
              <button
                type="button"
                onClick={() =>
                  setSystemLink((s) => ({ ...s, linkBusVoltage: !s.linkBusVoltage }))
                }
                className={`px-2 py-0.5 rounded-md border cursor-pointer transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                  systemLink.linkBusVoltage
                    ? 'bg-white dark:bg-[#1c202b] border-blue-500/50 text-blue-700 dark:text-blue-300 font-medium'
                    : 'bg-white/70 dark:bg-[#14171f] border-slate-300 dark:border-white/[0.08] text-slate-600 dark:text-[#727b8e]'
                }`}
                title="Propagate AC-DC Vdc_bus & ripple directly into DC-DC Vin_nom/min/max"
              >
                <span className={`w-1.5 h-1.5 rounded-full ${systemLink.linkBusVoltage ? 'bg-blue-500' : 'bg-slate-400 dark:bg-slate-600'}`} />
                Link Bus V ({acdcState.Vdc_bus_V}V → {dcdcState.Vin_nom_V}V)
              </button>
              <button
                type="button"
                onClick={() =>
                  setSystemLink((s) => ({ ...s, linkLoadPower: !s.linkLoadPower }))
                }
                className={`px-2 py-0.5 rounded-md border cursor-pointer transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                  systemLink.linkLoadPower
                    ? 'bg-white dark:bg-[#1c202b] border-emerald-500/50 text-emerald-700 dark:text-emerald-300 font-medium'
                    : 'bg-white/70 dark:bg-[#14171f] border-slate-300 dark:border-white/[0.08] text-slate-600 dark:text-[#727b8e]'
                }`}
                title="Propagate DC-DC Pout / η_dcdc back into AC-DC PFC output power"
              >
                <span className={`w-1.5 h-1.5 rounded-full ${systemLink.linkLoadPower ? 'bg-emerald-500' : 'bg-slate-400 dark:bg-slate-600'}`} />
                Link Load P ({systemCascade.P_pfc_required_W.toFixed(0)}W)
              </button>
              <div
                className="inline-flex items-center rounded-md border border-slate-300 dark:border-white/[0.1] overflow-hidden shrink-0"
                title="Choose whether both stages share a single MCU or use two separate MCUs with an isolated handshake"
              >
                <button
                  type="button"
                  onClick={() => setSystemLink((s) => ({ ...s, sharedMcu: true }))}
                  className={`px-2 py-0.5 cursor-pointer transition-colors whitespace-nowrap ${
                    sharedMcu
                      ? 'bg-emerald-600 text-white font-semibold'
                      : 'bg-white/70 dark:bg-[#14171f] text-slate-600 dark:text-[#727b8e] hover:text-slate-900 dark:hover:text-[#eef0f6]'
                  }`}
                >
                  Same MCU
                </button>
                <button
                  type="button"
                  onClick={() => setSystemLink((s) => ({ ...s, sharedMcu: false }))}
                  className={`px-2 py-0.5 cursor-pointer border-l border-slate-300 dark:border-white/[0.1] transition-colors whitespace-nowrap ${
                    !sharedMcu
                      ? 'bg-amber-600 text-white font-semibold'
                      : 'bg-white/70 dark:bg-[#14171f] text-slate-600 dark:text-[#727b8e] hover:text-slate-900 dark:hover:text-[#eef0f6]'
                  }`}
                >
                  Separate MCUs
                </button>
              </div>
              {!systemLink.linkBusVoltage && systemCascade.busVoltageMismatch_V > 5 && (
                <span className="text-amber-600 dark:text-amber-400 shrink-0">
                  ΔBus = {systemCascade.busVoltageMismatch_V}V
                </span>
              )}
            </>
          )}
        </div>

        <div className="flex items-center gap-3 overflow-x-auto no-scrollbar tabular-nums text-slate-600 dark:text-[#a1a8b8] whitespace-nowrap">
          {outputMode === 'combined' ? (
            <>
              <span>
                η_sys: <strong className="font-medium text-emerald-600 dark:text-emerald-400">{systemCascade.eta_system_pct}%</strong>
              </span>
              <span>
                P_in(AC): <strong className="font-medium text-slate-900 dark:text-[#eef0f6]">{systemCascade.Pin_ac_system_W.toFixed(0)}W</strong>
              </span>
              <span>
                P_loss: <strong className="font-medium text-amber-600 dark:text-amber-400">{systemCascade.Ploss_system_W.toFixed(1)}W</strong>{' '}
                <span className="hidden sm:inline text-slate-400 dark:text-[#727b8e]">
                  (PFC {systemCascade.acdcLossShare_pct}% / DC-DC {systemCascade.dcdcLossShare_pct}%)
                </span>
              </span>
              <span>
                I_AC: <strong className="font-medium text-slate-900 dark:text-[#eef0f6]">{systemCascade.Iac_system_rms_nom_A}A</strong>
              </span>
            </>
          ) : outputMode === 'dcdc-only' ? (
            <span>
              Standalone DC-DC: <strong className="text-blue-600 dark:text-blue-400">{dcdcState.Vin_nom_V}V → {dcdcState.Vout_V}V @ {dcdcState.Pout_W}W</strong> · η={dcdcRes.efficiency_pct.toFixed(2)}%
            </span>
          ) : (
            <span>
              Standalone AC-DC PFC: <strong className="text-blue-600 dark:text-blue-400">{acdcState.Vac_rms_V}Vac → {acdcState.Vdc_bus_V}Vdc @ {acdcState.Pout_W}W</strong> · η={acdcRes.efficiency_pct.toFixed(2)}%
            </span>
          )}
        </div>
      </div>

      {/* WORKBENCH + COLLAPSIBLE RIGHT-SIDE AI ENGINEER DRAWER */}
      <div className="flex-1 flex items-start min-w-0">
        <main id="main-workbench" tabIndex={-1} className="flex-1 min-w-0 max-w-[1640px] w-full mx-auto p-3 sm:p-4 lg:p-5 pb-24 md:pb-5 space-y-3 focus:outline-none">
          {/* Pinned Reference Comparison Chip */}
          {domainTab === 'acdc' && pinnedAcdc && pinnedAcdcRes && (
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-lg border border-amber-500/40 bg-amber-500/10 text-xs font-mono">
              <div className="flex flex-wrap items-center gap-2 text-amber-800 dark:text-amber-200">
                <Pin className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <span>
                  Pinned Ref: <strong>{pinnedAcdc.Vac_rms_V}Vac → {pinnedAcdc.Vdc_bus_V}V @ {pinnedAcdc.Pout_W}W</strong> ({pinnedAcdcRes.efficiency_pct.toFixed(2)}%)
                </span>
                <span className="text-slate-500 dark:text-slate-400">·</span>
                <span>
                  Δη ={' '}
                  <strong className={acdcRes.efficiency_pct >= pinnedAcdcRes.efficiency_pct ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>
                    {acdcRes.efficiency_pct - pinnedAcdcRes.efficiency_pct >= 0 ? '+' : ''}
                    {(acdcRes.efficiency_pct - pinnedAcdcRes.efficiency_pct).toFixed(2)}%
                  </strong>
                  {' '}· ΔPloss ={' '}
                  <strong>
                    {acdcRes.Ptotal_loss_W - pinnedAcdcRes.Ptotal_loss_W >= 0 ? '+' : ''}
                    {(acdcRes.Ptotal_loss_W - pinnedAcdcRes.Ptotal_loss_W).toFixed(1)}W
                  </strong>
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPinnedAcdc(null);
                  pushToast('Unpinned AC-DC reference', 'info');
                }}
                className="px-2 py-0.5 rounded border border-amber-500/40 hover:bg-amber-500/20 text-amber-800 dark:text-amber-200 text-[11px] cursor-pointer"
              >
                Unpin
              </button>
            </div>
          )}

          {domainTab !== 'acdc' && domainTab !== 'combined' && pinnedDcdc && pinnedDcdcRes && (
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-lg border border-amber-500/40 bg-amber-500/10 text-xs font-mono">
              <div className="flex flex-wrap items-center gap-2 text-amber-800 dark:text-amber-200">
                <Pin className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <span>
                  Pinned Ref: <strong>{pinnedDcdc.Vin_nom_V}V → {pinnedDcdc.Vout_V}V @ {pinnedDcdc.Pout_W}W</strong> ({pinnedDcdcRes.efficiency_pct.toFixed(2)}%)
                </span>
                <span className="text-slate-500 dark:text-slate-400">·</span>
                <span>
                  Δη ={' '}
                  <strong className={dcdcRes.efficiency_pct >= pinnedDcdcRes.efficiency_pct ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>
                    {dcdcRes.efficiency_pct - pinnedDcdcRes.efficiency_pct >= 0 ? '+' : ''}
                    {(dcdcRes.efficiency_pct - pinnedDcdcRes.efficiency_pct).toFixed(2)}%
                  </strong>
                  {' '}· ΔPloss ={' '}
                  <strong>
                    {dcdcRes.Ptotal_loss_W - pinnedDcdcRes.Ptotal_loss_W >= 0 ? '+' : ''}
                    {(dcdcRes.Ptotal_loss_W - pinnedDcdcRes.Ptotal_loss_W).toFixed(1)}W
                  </strong>
                  {' '}· ΔTj,pri ={' '}
                  <strong>
                    {dcdcRes.Tj_pri_C - pinnedDcdcRes.Tj_pri_C >= 0 ? '+' : ''}
                    {(dcdcRes.Tj_pri_C - pinnedDcdcRes.Tj_pri_C).toFixed(1)}°C
                  </strong>
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPinnedDcdc(null);
                  pushToast('Unpinned DC-DC reference', 'info');
                }}
                className="px-2 py-0.5 rounded border border-amber-500/40 hover:bg-amber-500/20 text-amber-800 dark:text-amber-200 text-[11px] cursor-pointer"
              >
                Unpin
              </button>
            </div>
          )}

          {domainTab === 'acdc' ? (
            <ErrorBoundary name="AC-DC PFC Workbench">
              <Suspense fallback={<WorkbenchSkeleton label="Loading AC-DC PFC Workbench…" />}>
                <AcDcWorkbench
                  state={acdcState}
                  onChange={setAcdcState}
                  res={acdcRes}
                  pinnedRes={pinnedAcdcRes}
                  dcdcState={dcdcState}
                  dcdcRes={dcdcRes}
                  outputMode={outputMode}
                  sharedMcu={sharedMcu}
                  dcdcSimTimeUs={systemLink.dcdcSimTime_us}
                  onChangeDcdcSimTimeUs={(v) =>
                    setSystemLink((s) => ({ ...s, dcdcSimTime_us: v }))
                  }
                  acdcSimTimeMs={systemLink.acdcSimTime_ms}
                  onChangeAcdcSimTimeMs={(v) =>
                    setSystemLink((s) => ({ ...s, acdcSimTime_ms: v }))
                  }
                  combinedSimTimeMs={systemLink.combinedSimTime_ms}
                  onChangeCombinedSimTimeMs={(v) =>
                    setSystemLink((s) => ({ ...s, combinedSimTime_ms: v }))
                  }
                  onOpenPartDrawer={() => setDrawerOpen(true)}
                  onOpenSmallSignalLab={() => setDomainTab('small-signal')}
                  requestedSubTab={acdcSubTab}
                  onChangeSubTab={setAcdcSubTab}
                  jumpTargetId={jumpState.targetItemId}
                  jumpNonce={jumpState.nonce}
                />
              </Suspense>
            </ErrorBoundary>
          ) : domainTab === 'dcdc' ? (
            <ErrorBoundary name="DC-DC Workbench">
              <DcDcWorkbench
                state={dcdcState}
                onChange={setDcdcState}
                res={dcdcRes}
                pinnedRes={pinnedDcdcRes}
                acdcState={acdcState}
                acdcRes={acdcRes}
                onOpenPartDrawer={() => setDrawerOpen(true)}
                onOpenSmallSignalLab={() => setDomainTab('small-signal')}
                activeSubTab={dcdcSubTab}
                onChangeSubTab={setDcdcSubTab}
                jumpTargetId={jumpState.targetItemId}
                jumpNonce={jumpState.nonce}
                outputMode={outputMode}
                sharedMcu={sharedMcu}
                dcdcSimTimeUs={systemLink.dcdcSimTime_us}
                onChangeDcdcSimTimeUs={(v) =>
                  setSystemLink((s) => ({ ...s, dcdcSimTime_us: v }))
                }
                acdcSimTimeMs={systemLink.acdcSimTime_ms}
                onChangeAcdcSimTimeMs={(v) =>
                  setSystemLink((s) => ({ ...s, acdcSimTime_ms: v }))
                }
                combinedSimTimeMs={systemLink.combinedSimTime_ms}
                onChangeCombinedSimTimeMs={(v) =>
                  setSystemLink((s) => ({ ...s, combinedSimTime_ms: v }))
                }
              />
            </ErrorBoundary>
          ) : domainTab === 'combined' ? (
            <div className="space-y-4">
              {/* Combined Simulation & Export Action Bar */}
              <div className="bg-white dark:bg-[#14171f] border border-slate-200 dark:border-white/[0.08] rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
                  <span className="font-semibold text-slate-900 dark:text-[#eef0f6] font-sans">
                    2-Stage Combined Simulation Export
                  </span>
                  <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-[#727b8e]">
                    <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Stop Time:</span>
                    <input
                      type="number"
                      min={1}
                      max={500}
                      step={5}
                      value={effectiveCombinedSimTimeMs}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setSystemLink((s) => ({
                          ...s,
                          combinedSimTime_ms: Number.isFinite(v) && v > 0 ? v : undefined,
                        }));
                      }}
                      className="w-16 px-2 py-0.5 text-right rounded border border-slate-300 dark:border-white/[0.12] bg-slate-50 dark:bg-[#0e1015] text-slate-900 dark:text-white font-bold"
                    />
                    <span>ms</span>
                  </label>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 text-xs font-mono">
                  <button
                    type="button"
                    onClick={handleExportActiveQspiceZip}
                    className="px-2.5 py-1.5 rounded-lg border border-violet-500/40 bg-violet-500/10 hover:bg-violet-500/20 text-violet-700 dark:text-violet-300 inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" aria-hidden="true" />
                    Combined QSPICE .zip
                  </button>
                  <button
                    type="button"
                    onClick={handleExportActiveLtspiceAsc}
                    className="px-2.5 py-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" aria-hidden="true" />
                    LTspice .asc
                  </button>
                  <button
                    type="button"
                    onClick={handleExportActivePlecsZip}
                    className="px-2.5 py-1.5 rounded-lg border border-sky-500/40 bg-sky-500/10 hover:bg-sky-500/20 text-sky-700 dark:text-sky-300 inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" aria-hidden="true" />
                    PLECS .zip
                  </button>
                  <button
                    type="button"
                    onClick={handleExportActiveSpice}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-white/[0.12] bg-slate-50 dark:bg-[#1c202b] hover:border-blue-500/50 text-slate-700 dark:text-[#eef0f6] inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" aria-hidden="true" />
                    SPICE .cir
                  </button>
                  <button
                    type="button"
                    onClick={handleExportFirmwareHeader}
                    className="px-2.5 py-1.5 rounded-lg border border-blue-500/40 bg-blue-500/10 hover:bg-blue-500/20 text-blue-700 dark:text-blue-300 inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" aria-hidden="true" />
                    DSP .h
                  </button>
                </div>
              </div>

              <ErrorBoundary name="Combined Schematic">
                <Suspense fallback={<WorkbenchSkeleton label="Loading 2-Stage Combined View…" />}>
                  <CombinedSystemSchematicView
                    acdcRes={acdcRes}
                    dcdcRes={dcdcRes}
                    isConnected={systemLink.linkBusVoltage && systemLink.linkLoadPower}
                    sharedMcu={sharedMcu}
                    onToggleSharedMcu={(shared) =>
                      setSystemLink((s) => ({ ...s, sharedMcu: shared }))
                    }
                  />
                </Suspense>
              </ErrorBoundary>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs font-mono">
                <div className="bg-white dark:bg-[#14171f] border border-slate-200 dark:border-white/[0.08] rounded-lg p-3">
                  <div className="text-[10px] uppercase text-slate-500">Stage 1 AC-DC PFC</div>
                  <div className="font-bold text-slate-900 dark:text-white mt-0.5">
                    {acdcState.Vac_rms_V}Vac → {acdcState.Vdc_bus_V}Vdc ({acdcRes.efficiency_pct.toFixed(2)}%)
                  </div>
                  <button
                    type="button"
                    onClick={() => setDomainTab('acdc')}
                    className="mt-2 text-[11px] text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                  >
                    Open AC-DC PFC Parameters →
                  </button>
                </div>
                <div className="bg-white dark:bg-[#14171f] border border-slate-200 dark:border-white/[0.08] rounded-lg p-3">
                  <div className="text-[10px] uppercase text-slate-500">Shared DC-Link Bus</div>
                  <div className="font-bold text-amber-600 dark:text-amber-400 mt-0.5">
                    {acdcState.Vdc_bus_V}V · ΔV={acdcRes.Vdc_ripple_pp_V.toFixed(1)}Vpp · t_hold={acdcRes.tHold_actual_ms.toFixed(1)}ms
                  </div>
                  <div className="mt-1 text-[10px] text-slate-500">
                    {systemLink.linkBusVoltage ? 'Bus Voltage Synchronized' : 'Click Connect Together to sync'}
                  </div>
                </div>
                <div className="bg-white dark:bg-[#14171f] border border-slate-200 dark:border-white/[0.08] rounded-lg p-3">
                  <div className="text-[10px] uppercase text-slate-500">Stage 2 Isolated DC-DC</div>
                  <div className="font-bold text-slate-900 dark:text-white mt-0.5">
                    {dcdcState.Vin_nom_V}Vdc → {dcdcState.Vout_V}V @ {dcdcState.Pout_W}W ({dcdcRes.efficiency_pct.toFixed(2)}%)
                  </div>
                  <button
                    type="button"
                    onClick={() => setDomainTab('dcdc')}
                    className="mt-2 text-[11px] text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                  >
                    Open DC-DC Parameters →
                  </button>
                </div>
                <div className="bg-white dark:bg-[#14171f] border border-slate-200 dark:border-white/[0.08] rounded-lg p-3">
                  <div className="text-[10px] uppercase text-slate-500">Cascade End-to-End</div>
                  <div className="font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                    η_sys = {systemCascade.eta_system_pct}% · Loss = {systemCascade.Ploss_system_W.toFixed(1)}W
                  </div>
                  <div className="mt-1 text-[10px] text-slate-500">
                    P_in(AC)={systemCascade.Pin_ac_system_W.toFixed(0)}W · I_ac={systemCascade.Iac_system_rms_nom_A}A · {sharedMcu ? 'Same Shared MCU (ePWM Sync)' : 'Separate MCUs (Iso PG_OK)'}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <ErrorBoundary name="Small-Signal Lab">
              <Suspense fallback={<WorkbenchSkeleton label="Loading Small-Signal Bode Lab…" />}>
                <SmallSignalDashboard
                  dcdcState={dcdcState}
                  setDcdcState={setDcdcState}
                  dcdcRes={dcdcRes}
                  pinnedDcdcRes={pinnedDcdcRes}
                  acdcState={acdcState}
                  setAcdcState={setAcdcState}
                  acdcRes={acdcRes}
                />
              </Suspense>
            </ErrorBoundary>
          )}
        </main>

        {aiEnabled && (
          <ErrorBoundary name="AI Engineer">
            <Suspense fallback={null}>
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
            </Suspense>
          </ErrorBoundary>
        )}
      </div>

      {/* REAL-WORLD COMPONENT SEARCH & DATASHEET GROUNDING DRAWER */}
      {drawerOpen && (
        <ErrorBoundary name="Component Search Drawer">
          <Suspense fallback={<ModalLoadingFallback label="Loading Parts Database…" />}>
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
          </Suspense>
        </ErrorBoundary>
      )}
      </div>

      {/* TEXTBOOK-STYLE ENGINEERING DESIGN REPORT MODAL & PDF PRINT ROOT */}
      {reportOpen && (
        <ErrorBoundary name="Design Report Modal">
          <Suspense fallback={<ModalLoadingFallback label="Loading Engineering Report & KaTeX…" />}>
            <DesignReportModal
              isOpen={reportOpen}
              onClose={() => setReportOpen(false)}
              initialScope={
                outputMode === 'acdc-only'
                  ? 'acdc'
                  : outputMode === 'dcdc-only'
                  ? 'dcdc'
                  : domainTab === 'acdc'
                  ? 'acdc'
                  : domainTab === 'dcdc'
                  ? 'dcdc'
                  : 'both'
              }
              dcdcState={dcdcState}
              dcdcRes={dcdcRes}
              acdcState={acdcState}
              acdcRes={acdcRes}
              inductorConfigs={inductorConfigs}
              capacitorConfigs={capacitorConfigs}
              alerts={designAlerts}
              sharedMcu={sharedMcu}
            />
          </Suspense>
        </ErrorBoundary>
      )}

      {/* TOP-BAR AI PROVIDER & API KEYS MODAL */}
      {aiKeysModalOpen && (
        <div
          className="no-print fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#07080d]/65 backdrop-blur-[2px] overscroll-contain"
          role="dialog"
          aria-modal="true"
          aria-label="Configure AI Provider and API Keys"
          onClick={() => setAiKeysModalOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-xl shadow-lg bg-white dark:bg-[#11141c] border border-slate-200 dark:border-white/[0.12] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <Suspense fallback={<ModalLoadingFallback label="Loading AI Settings…" />}>
              <AiProviderSettingsPanel
                aiConfig={aiConfig}
                onChangeAiConfig={handleChangeAiConfig}
                onClose={() => setAiKeysModalOpen(false)}
              />
            </Suspense>
          </div>
        </div>
      )}

      {/* PROJECTS, JSON IMPORT & SPICE/FIRMWARE EXPORT MODAL */}
      {projectsModalOpen && (
        <div
          className="no-print fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#090a0d]/70 backdrop-blur-[2px] overscroll-contain"
          role="dialog"
          aria-modal="true"
          aria-label="Projects, Import and Engineering Export"
          onClick={() => setProjectsModalOpen(false)}
        >
          <div
            className="w-full max-w-2xl rounded-xl shadow-lg bg-white dark:bg-[#14171f] border border-slate-200 dark:border-white/[0.12] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-slate-200 dark:border-white/[0.08] bg-[#eff1f5] dark:bg-[#0e1015] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FolderOpen className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <h3 className="text-sm font-medium text-slate-900 dark:text-[#eef0f6]">
                  Projects, JSON Import &amp; Simulation Exports
                </h3>
              </div>
              <button
                type="button"
                aria-label="Close projects modal"
                onClick={() => setProjectsModalOpen(false)}
                className="h-7 w-7 rounded-md border border-slate-200 dark:border-white/[0.1] text-slate-500 hover:text-slate-900 dark:hover:text-[#eef0f6] inline-flex items-center justify-center cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="p-3 sm:p-4 space-y-4 max-h-[82dvh] overflow-y-auto overscroll-contain">
              {/* Save Current Workspace */}
              <div className="space-y-2">
                <div className="text-xs font-medium text-slate-700 dark:text-[#eef0f6]">
                  Save current 2-stage workspace
                </div>
                <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
                  <input
                    type="text"
                    value={projectNameInput}
                    onChange={(e) => setProjectNameInput(e.target.value)}
                    placeholder={`${dcdcState.presetName} (${dcdcState.Pout_W}W)`}
                    className="flex-1 px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-300 dark:border-white/[0.1] bg-[#f6f7f9] dark:bg-[#0e1015] text-slate-900 dark:text-[#eef0f6]"
                  />
                  <button
                    type="button"
                    onClick={handleSaveNamedProject}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-500 text-white inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5" />
                    Save Slot
                  </button>
                </div>
              </div>

              {/* Simulation Stop Time Setting for Exports */}
              <div className="px-3 py-2.5 rounded-lg border border-slate-200 dark:border-white/[0.1] bg-[#f6f7f9] dark:bg-[#1c202b] space-y-2 text-xs font-mono">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-slate-700 dark:text-[#eef0f6]">
                    Simulation Stop Time (SPICE / QSPICE / LTspice / PLECS)
                  </span>
                  <span className="text-[10px] text-slate-500">
                    Saved in project JSON &amp; applied to exports
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <label className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#14171f] focus-within:ring-2 focus-within:ring-blue-500/60 focus-within:border-blue-500">
                    <span className="text-[11px] text-slate-500">DC-DC (µs)</span>
                    <input
                      type="number"
                      min={50}
                      max={50000}
                      step={100}
                      value={effectiveDcdcSimTimeUs}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setSystemLink((s) => ({
                          ...s,
                          dcdcSimTime_us: Number.isFinite(v) && v >= 50 ? Math.round(v) : undefined,
                        }));
                      }}
                      className="w-20 bg-transparent text-right font-bold text-slate-900 dark:text-white focus:outline-none"
                    />
                  </label>
                  <label className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#14171f] focus-within:ring-2 focus-within:ring-blue-500/60 focus-within:border-blue-500">
                    <span className="text-[11px] text-slate-500">AC-DC (ms)</span>
                    <input
                      type="number"
                      min={1}
                      max={500}
                      step={5}
                      value={effectiveAcdcSimTimeMs}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setSystemLink((s) => ({
                          ...s,
                          acdcSimTime_ms: Number.isFinite(v) && v > 0 ? v : undefined,
                        }));
                      }}
                      className="w-20 bg-transparent text-right font-bold text-slate-900 dark:text-white focus:outline-none"
                    />
                  </label>
                  <label className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#14171f] focus-within:ring-2 focus-within:ring-blue-500/60 focus-within:border-blue-500">
                    <span className="text-[11px] text-slate-500">Combined (ms)</span>
                    <input
                      type="number"
                      min={1}
                      max={500}
                      step={5}
                      value={effectiveCombinedSimTimeMs}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setSystemLink((s) => ({
                          ...s,
                          combinedSimTime_ms: Number.isFinite(v) && v > 0 ? v : undefined,
                        }));
                      }}
                      className="w-20 bg-transparent text-right font-bold text-slate-900 dark:text-white focus:outline-none"
                    />
                  </label>
                </div>
              </div>

              {/* Import / Export Actions */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <input
                  ref={jsonFileInputRef}
                  type="file"
                  accept=".json,application/json"
                  onChange={handleImportJsonFile}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => jsonFileInputRef.current?.click()}
                  className="px-2.5 py-2 text-xs font-mono rounded-lg border border-slate-200 dark:border-white/[0.1] bg-[#f6f7f9] dark:bg-[#1c202b] hover:border-blue-500/60 text-blue-700 dark:text-blue-300 inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Import JSON
                </button>
                <button
                  type="button"
                  onClick={handleExportFullProjectJson}
                  className="px-2.5 py-2 text-xs font-mono rounded-lg border border-slate-200 dark:border-white/[0.1] bg-[#f6f7f9] dark:bg-[#1c202b] hover:border-slate-300 dark:hover:border-white/[0.2] text-slate-700 dark:text-[#eef0f6] inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  Project .json
                </button>
                <button
                  type="button"
                  onClick={handleExportActiveLtspiceAsc}
                  className="px-2.5 py-2 text-xs font-mono rounded-lg border border-slate-200 dark:border-white/[0.1] bg-[#f6f7f9] dark:bg-[#1c202b] hover:border-emerald-500/60 text-emerald-700 dark:text-emerald-300 inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  LTspice .asc
                </button>
                <button
                  type="button"
                  onClick={handleExportActiveQspiceZip}
                  className="px-2.5 py-2 text-xs font-mono rounded-lg border border-slate-200 dark:border-white/[0.1] bg-[#f6f7f9] dark:bg-[#1c202b] hover:border-violet-500/60 text-violet-700 dark:text-violet-300 inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                  title="Download QSPICE simulation suite ZIP (.qsch, .qsym, .qraw, .cir, .cpp)"
                >
                  <Download className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
                  QSPICE .zip
                </button>
                <button
                  type="button"
                  onClick={handleExportActivePlecsZip}
                  className="px-2.5 py-2 text-xs font-mono rounded-lg border border-slate-200 dark:border-white/[0.1] bg-[#f6f7f9] dark:bg-[#1c202b] hover:border-sky-500/60 text-sky-700 dark:text-sky-300 inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                  title="Download Plexim PLECS Standalone ZIP (.plecs, init_params.m, hybrid_cap_verification.m, thermal_descriptions.xml)"
                >
                  <Download className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                  PLECS .zip
                </button>
                <button
                  type="button"
                  onClick={handleExportActiveSpice}
                  className="px-2.5 py-2 text-xs font-mono rounded-lg border border-slate-200 dark:border-white/[0.1] bg-[#f6f7f9] dark:bg-[#1c202b] hover:border-slate-300 dark:hover:border-white/[0.2] text-slate-700 dark:text-[#eef0f6] inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  SPICE .cir
                </button>
                <button
                  type="button"
                  onClick={handleExportFirmwareHeader}
                  className="px-2.5 py-2 text-xs font-mono rounded-lg border border-slate-200 dark:border-white/[0.1] bg-[#f6f7f9] dark:bg-[#1c202b] hover:border-slate-300 dark:hover:border-white/[0.2] text-slate-700 dark:text-[#eef0f6] inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Download className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  DSP Config .h
                </button>
              </div>

              {projectImportStatus && (
                <div className="px-3 py-2 rounded-lg border border-blue-500/30 bg-blue-500/10 text-xs font-mono text-blue-700 dark:text-blue-300">
                  {projectImportStatus}
                </div>
              )}

              {/* Saved Browser Projects */}
              <div className="space-y-2">
                <div className="text-xs font-medium text-slate-700 dark:text-[#eef0f6]">
                  Saved Projects ({savedProjects.length})
                </div>
                {savedProjects.length === 0 ? (
                  <div className="p-4 rounded-lg border border-dashed border-slate-300 dark:border-white/[0.12] text-xs text-slate-500 dark:text-[#7a8296] text-center">
                    No saved project slots yet. Click &quot;Save Slot&quot; above to store your current design.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-200 dark:divide-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-lg overflow-hidden">
                    {savedProjects.map((entry) => (
                      <div
                        key={entry.id}
                        className="px-3 py-2 bg-white dark:bg-[#0b0d14] flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-slate-900 dark:text-[#eef0f5] truncate">
                            {entry.name}
                          </div>
                          <div className="text-[10px] font-mono text-slate-500 dark:text-[#7a8296] truncate">
                            {entry.project.dcdcState.topology.toUpperCase()} {entry.project.dcdcState.Vin_nom_V}V→
                            {entry.project.dcdcState.Vout_V}V ({entry.project.dcdcState.Pout_W}W) ·{' '}
                            {new Date(entry.savedAt).toLocaleString()}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleLoadSavedProject(entry)}
                            className="px-2.5 py-1 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-medium cursor-pointer"
                          >
                            Load
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteSavedProject(entry.id)}
                            className="p-1 rounded-md border border-slate-200 dark:border-white/[0.1] text-slate-400 hover:text-rose-500 cursor-pointer"
                            title="Delete saved project"
                            aria-label="Delete saved project"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MOBILE BOTTOM ACTION DOCK (Thumb-friendly navigation on phones < 768px) */}
      <nav
        aria-label="Mobile quick actions"
        className="no-print md:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 dark:bg-[#14171f]/95 backdrop-blur-md border-t border-slate-200 dark:border-white/[0.1] px-2 pt-1.5 pb-[max(0.45rem,env(safe-area-inset-bottom))] grid grid-cols-5 gap-1"
      >
        <button
          type="button"
          onClick={() => {
            if (domainTab === 'acdc' || domainTab === 'dcdc') {
              window.dispatchEvent(new CustomEvent('pe-open-params'));
            } else {
              setDomainTab('dcdc');
              setTimeout(() => window.dispatchEvent(new CustomEvent('pe-open-params')), 40);
            }
          }}
          className="flex flex-col items-center justify-center py-1 rounded-lg text-[10px] font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-500/10 cursor-pointer"
        >
          <SlidersHorizontal className="w-4 h-4 mb-0.5" aria-hidden="true" />
          <span>Params</span>
        </button>

        <button
          type="button"
          onClick={handleAutoOptimizeActive}
          className="flex flex-col items-center justify-center py-1 rounded-lg text-[10px] font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 cursor-pointer"
        >
          <Sparkles className="w-4 h-4 mb-0.5" aria-hidden="true" />
          <span>Optimize</span>
        </button>

        <button
          type="button"
          data-popover-trigger="export"
          onClick={() => setExportMenuOpen((v) => !v)}
          className={`flex flex-col items-center justify-center py-1 rounded-lg text-[10px] font-medium cursor-pointer ${
            exportMenuOpen
              ? 'bg-blue-500/15 text-blue-600 dark:text-blue-300'
              : 'text-slate-700 dark:text-[#a1a8b8]'
          }`}
        >
          <Download className="w-4 h-4 mb-0.5" aria-hidden="true" />
          <span>Export</span>
        </button>

        <button
          type="button"
          onClick={() => setReportOpen(true)}
          className="flex flex-col items-center justify-center py-1 rounded-lg text-[10px] font-medium text-slate-700 dark:text-[#a1a8b8] cursor-pointer"
        >
          <FileText className="w-4 h-4 mb-0.5" aria-hidden="true" />
          <span>Report</span>
        </button>

        <button
          type="button"
          onClick={handleToggleAiEngineer}
          className={`flex flex-col items-center justify-center py-1 rounded-lg text-[10px] font-medium cursor-pointer ${
            aiEnabled
              ? 'bg-blue-500/15 text-blue-600 dark:text-blue-300'
              : 'text-slate-700 dark:text-[#a1a8b8]'
          }`}
        >
          <Bot className="w-4 h-4 mb-0.5" aria-hidden="true" />
          <span>AI Agent</span>
        </button>
      </nav>

      {/* COMMAND PALETTE (Ctrl+K / Cmd+K) */}
      {cmdPaletteOpen && (
        <Suspense fallback={null}>
          <CommandPaletteModal
            isOpen={cmdPaletteOpen}
            onClose={() => setCmdPaletteOpen(false)}
            actions={commandPaletteActions}
          />
        </Suspense>
      )}

      {/* NON-BLOCKING TOAST FEEDBACK STACK */}
      {toasts.length > 0 && (
        <div
          aria-live="polite"
          className="no-print fixed bottom-20 md:bottom-4 right-3 sm:right-4 z-50 flex flex-col gap-2 max-w-sm pointer-events-none"
        >
          {toasts.map((t) => (
            <div
              key={t.id}
              className={`pointer-events-auto px-3.5 py-2 rounded-lg border shadow-lg text-xs font-medium flex items-center gap-2 backdrop-blur-md ${
                t.tone === 'warn'
                  ? 'bg-amber-50/95 dark:bg-[#1a1610]/95 border-amber-500/50 text-amber-800 dark:text-amber-200'
                  : t.tone === 'info'
                  ? 'bg-white/95 dark:bg-[#14171f]/95 border-blue-500/40 text-slate-800 dark:text-[#eef0f6]'
                  : 'bg-emerald-50/95 dark:bg-[#0e1a15]/95 border-emerald-500/50 text-emerald-800 dark:text-emerald-200'
              }`}
            >
              <CheckCircle2
                className={`w-3.5 h-3.5 shrink-0 ${
                  t.tone === 'warn'
                    ? 'text-amber-500'
                    : t.tone === 'info'
                    ? 'text-blue-500'
                    : 'text-emerald-500'
                }`}
              />
              <span className="truncate">{t.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
