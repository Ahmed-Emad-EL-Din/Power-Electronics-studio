import {
  ACDC_PRESETS,
  AcDcDesignState,
  DCDC_PRESETS,
  DcDcDesignState,
} from '../data/databases';
import { PerCapConfig, PerInductorConfig } from './passiveDesignEngine';
import { SystemLinkConfig } from './systemCascadeEngine';

export interface PowerStudioProjectFile {
  schemaVersion: 2;
  name: string;
  savedAt: string;
  systemLink: SystemLinkConfig;
  dcdcState: DcDcDesignState;
  acdcState: AcDcDesignState;
  inductorConfigs: Record<string, PerInductorConfig>;
  capacitorConfigs: Record<string, PerCapConfig>;
}

export interface SavedProjectEntry {
  id: string;
  name: string;
  savedAt: string;
  project: PowerStudioProjectFile;
}

export interface StudioWorkspaceSnapshot {
  dcdcState: DcDcDesignState;
  acdcState: AcDcDesignState;
  inductorConfigs: Record<string, PerInductorConfig>;
  capacitorConfigs: Record<string, PerCapConfig>;
  systemLink: SystemLinkConfig;
  label?: string;
}

export interface HistoryStack<T> {
  past: T[];
  present: T;
  future: T[];
  maxSize: number;
}

const PROJECTS_STORAGE_KEY = 'voltcraft_saved_projects_v2';
const AUTOSAVE_STORAGE_KEY = 'voltcraft_autosave_v2';

export function buildProjectFile(
  name: string,
  snapshot: StudioWorkspaceSnapshot
): PowerStudioProjectFile {
  return {
    schemaVersion: 2,
    name: name.trim() || 'Untitled Power Stage',
    savedAt: new Date().toISOString(),
    systemLink: { ...snapshot.systemLink },
    dcdcState: { ...snapshot.dcdcState },
    acdcState: { ...snapshot.acdcState },
    inductorConfigs: structuredCloneSafe(snapshot.inductorConfigs),
    capacitorConfigs: structuredCloneSafe(snapshot.capacitorConfigs),
  };
}

function structuredCloneSafe<T>(val: T): T {
  return JSON.parse(JSON.stringify(val)) as T;
}

export function parseImportedProjectJson(
  rawText: string,
  fallback: StudioWorkspaceSnapshot
): { ok: true; project: PowerStudioProjectFile; importKind: string } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? `Invalid JSON: ${err.message}` : 'Invalid JSON file.',
    };
  }

  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, error: 'JSON root must be an object.' };
  }

  const obj = parsed as Record<string, unknown>;

  // Case 1: Full v2 Studio Project File
  if (obj.schemaVersion === 2 && obj.dcdcState && obj.acdcState) {
    const dcdcRaw = obj.dcdcState as Partial<DcDcDesignState>;
    const acdcRaw = obj.acdcState as Partial<AcDcDesignState>;
    const linkRaw = (obj.systemLink as Partial<SystemLinkConfig>) || {};
    return {
      ok: true,
      importKind: 'Full Studio Project (v2)',
      project: {
        schemaVersion: 2,
        name: typeof obj.name === 'string' && obj.name.trim() ? obj.name.trim() : 'Imported Studio Project',
        savedAt: typeof obj.savedAt === 'string' ? obj.savedAt : new Date().toISOString(),
        systemLink: {
          linkBusVoltage: Boolean(linkRaw.linkBusVoltage),
          linkLoadPower: Boolean(linkRaw.linkLoadPower),
        },
        dcdcState: { ...DCDC_PRESETS[0].state, ...dcdcRaw },
        acdcState: { ...ACDC_PRESETS[0].state, ...acdcRaw },
        inductorConfigs:
          obj.inductorConfigs && typeof obj.inductorConfigs === 'object'
            ? (obj.inductorConfigs as Record<string, PerInductorConfig>)
            : {},
        capacitorConfigs:
          obj.capacitorConfigs && typeof obj.capacitorConfigs === 'object'
            ? (obj.capacitorConfigs as Record<string, PerCapConfig>)
            : {},
      },
    };
  }

  // Case 2: v1 Single-Domain Export ({ domain: 'dc-dc-isolated' | 'ac-dc-pfc', state })
  if (obj.domain === 'dc-dc-isolated' && obj.state && typeof obj.state === 'object') {
    const dcdcRaw = obj.state as Partial<DcDcDesignState>;
    return {
      ok: true,
      importKind: 'DC-DC Design Export (v1)',
      project: buildProjectFile(dcdcRaw.presetName || 'Imported DC-DC Design', {
        ...fallback,
        dcdcState: { ...DCDC_PRESETS[0].state, ...dcdcRaw },
      }),
    };
  }

  if (obj.domain === 'ac-dc-pfc' && obj.state && typeof obj.state === 'object') {
    const acdcRaw = obj.state as Partial<AcDcDesignState>;
    return {
      ok: true,
      importKind: 'AC-DC PFC Design Export (v1)',
      project: buildProjectFile(acdcRaw.presetName || 'Imported AC-DC Design', {
        ...fallback,
        acdcState: { ...ACDC_PRESETS[0].state, ...acdcRaw },
      }),
    };
  }

  // Case 3: Raw DcDcDesignState or AcDcDesignState object
  if (typeof obj.Vin_nom_V === 'number' && typeof obj.Vout_V === 'number') {
    return {
      ok: true,
      importKind: 'Raw DC-DC State JSON',
      project: buildProjectFile('Imported DC-DC State', {
        ...fallback,
        dcdcState: { ...DCDC_PRESETS[0].state, ...(obj as Partial<DcDcDesignState>) },
      }),
    };
  }

  if (typeof obj.Vac_rms_V === 'number' && typeof obj.Vdc_bus_V === 'number') {
    return {
      ok: true,
      importKind: 'Raw AC-DC State JSON',
      project: buildProjectFile('Imported AC-DC State', {
        ...fallback,
        acdcState: { ...ACDC_PRESETS[0].state, ...(obj as Partial<AcDcDesignState>) },
      }),
    };
  }

  return {
    ok: false,
    error: 'Unrecognized JSON structure. Expected VoltCraft Studio v2 project or v1 domain export.',
  };
}

export function loadSavedProjects(): SavedProjectEntry[] {
  try {
    const raw = localStorage.getItem(PROJECTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is SavedProjectEntry =>
        Boolean(item && typeof item.id === 'string' && item.project?.dcdcState && item.project?.acdcState)
    );
  } catch {
    return [];
  }
}

export function saveNamedProject(
  name: string,
  snapshot: StudioWorkspaceSnapshot
): SavedProjectEntry[] {
  const existing = loadSavedProjects();
  const entry: SavedProjectEntry = {
    id: `proj_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name: name.trim() || 'Untitled Power Stage',
    savedAt: new Date().toISOString(),
    project: buildProjectFile(name, snapshot),
  };
  const next = [entry, ...existing].slice(0, 25);
  try {
    localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore quota errors
  }
  return next;
}

export function deleteSavedProject(id: string): SavedProjectEntry[] {
  const next = loadSavedProjects().filter((p) => p.id !== id);
  try {
    localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore storage errors
  }
  return next;
}

export function saveAutosaveProject(snapshot: StudioWorkspaceSnapshot): void {
  try {
    const file = buildProjectFile('Autosave Session', snapshot);
    localStorage.setItem(AUTOSAVE_STORAGE_KEY, JSON.stringify(file));
  } catch {
    // ignore storage errors
  }
}

export function loadAutosaveProject(): PowerStudioProjectFile | null {
  try {
    const raw = localStorage.getItem(AUTOSAVE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PowerStudioProjectFile;
    if (parsed?.schemaVersion === 2 && parsed.dcdcState && parsed.acdcState) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function createHistory<T>(initial: T, maxSize = 40): HistoryStack<T> {
  return {
    past: [],
    present: initial,
    future: [],
    maxSize,
  };
}

export function pushHistoryState<T>(
  stack: HistoryStack<T>,
  nextPresent: T,
  isEqual?: (a: T, b: T) => boolean
): HistoryStack<T> {
  if (isEqual ? isEqual(stack.present, nextPresent) : JSON.stringify(stack.present) === JSON.stringify(nextPresent)) {
    return stack;
  }
  const past = [...stack.past, stack.present].slice(-stack.maxSize);
  return {
    ...stack,
    past,
    present: nextPresent,
    future: [],
  };
}

export function undoHistory<T>(stack: HistoryStack<T>): HistoryStack<T> {
  if (stack.past.length === 0) return stack;
  const previous = stack.past[stack.past.length - 1];
  const past = stack.past.slice(0, -1);
  return {
    ...stack,
    past,
    present: previous,
    future: [stack.present, ...stack.future].slice(0, stack.maxSize),
  };
}

export function redoHistory<T>(stack: HistoryStack<T>): HistoryStack<T> {
  if (stack.future.length === 0) return stack;
  const next = stack.future[0];
  const future = stack.future.slice(1);
  return {
    ...stack,
    past: [...stack.past, stack.present].slice(-stack.maxSize),
    present: next,
    future,
  };
}
