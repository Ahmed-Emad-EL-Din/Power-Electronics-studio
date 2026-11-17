import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import {
  AcDcDesignState,
  DcDcDesignState,
  DCDC_PRESETS,
  ACDC_PRESETS,
} from '../data/databases';
import {
  ACDC_DEFAULT_LOCKS,
  AcDcLockableKey,
  AutoOptChange,
  DCDC_DEFAULT_LOCKS,
  DcDcLockableKey,
  optimizeAcDcUnlocked,
  optimizeDcDcUnlocked,
} from '../engine/autoOptimizer';
import {
  PerCapConfig,
  PerInductorConfig,
} from '../engine/passiveDesignEngine';

export const DEFAULT_INDUCTOR_LOCKS = {
  targetL_uH: false,
  coreId: false,
  materialId: false,
  turnsN: false,
  airGap_mm: false,
  wireAwg: false,
  parallelStrands: false,
  conductorForm: false,
};

export const DEFAULT_CAP_BANK_LOCKS = {
  targetC_uF: false,
  partId: false,
  seriesCount: false,
  parallelCount: false,
};

interface PatchApplyOptions {
  bypassAutoOpt?: boolean;
}

interface DesignSolverContextValue {
  // DC-DC Solver State
  dcdcAutoOpt: boolean;
  setDcdcAutoOpt: React.Dispatch<React.SetStateAction<boolean>>;
  dcdcLocked: Record<DcDcLockableKey, boolean>;
  toggleDcdcLock: (key: DcDcLockableKey) => void;
  setAllDcdcLocks: (locked: boolean) => void;
  resetDcdcLocksSpecsOnly: () => void;
  dcdcChanges: AutoOptChange<DcDcLockableKey>[];
  clearDcdcChanges: () => void;
  setDcdcField: <K extends keyof DcDcDesignState>(key: K, val: DcDcDesignState[K]) => void;
  applyDcdcPatch: (
    patch: Partial<DcDcDesignState>,
    changedKey?: keyof DcDcDesignState | null,
    options?: PatchApplyOptions
  ) => void;
  optimizeDcdcNow: () => void;

  // AC-DC Solver State
  acdcAutoOpt: boolean;
  setAcdcAutoOpt: React.Dispatch<React.SetStateAction<boolean>>;
  acdcLocked: Record<AcDcLockableKey, boolean>;
  toggleAcdcLock: (key: AcDcLockableKey) => void;
  setAllAcdcLocks: (locked: boolean) => void;
  resetAcdcLocksSpecsOnly: () => void;
  acdcChanges: AutoOptChange<AcDcLockableKey>[];
  clearAcdcChanges: () => void;
  setAcdcField: <K extends keyof AcDcDesignState>(key: K, val: AcDcDesignState[K]) => void;
  applyAcdcPatch: (
    patch: Partial<AcDcDesignState>,
    changedKey?: keyof AcDcDesignState | null,
    options?: PatchApplyOptions
  ) => void;
  optimizeAcdcNow: () => void;

  // Shared Passive Bank Configs (synchronized between Alert Inspector and Sub-Tool Panels)
  inductorConfigs: Record<string, PerInductorConfig>;
  updateInductorConfig: (id: string, updater: (prev: PerInductorConfig) => PerInductorConfig) => void;
  replaceInductorConfigs: (next: Record<string, PerInductorConfig>) => void;
  resetInductorConfigs: (ids?: string[]) => void;
  capacitorConfigs: Record<string, PerCapConfig>;
  updateCapacitorConfig: (id: string, updater: (prev: PerCapConfig) => PerCapConfig) => void;
  replaceCapacitorConfigs: (next: Record<string, PerCapConfig>) => void;
  resetCapacitorConfigs: (ids?: string[]) => void;
}

const DesignSolverContext = createContext<DesignSolverContextValue | null>(null);

interface DesignSolverProviderProps {
  dcdcState: DcDcDesignState;
  setDcdcState: React.Dispatch<React.SetStateAction<DcDcDesignState>>;
  acdcState: AcDcDesignState;
  setAcdcState: React.Dispatch<React.SetStateAction<AcDcDesignState>>;
  children: React.ReactNode;
}

export const DesignSolverProvider: React.FC<DesignSolverProviderProps> = ({
  dcdcState,
  setDcdcState,
  acdcState,
  setAcdcState,
  children,
}) => {
  const [dcdcAutoOpt, setDcdcAutoOpt] = useState<boolean>(true);
  const [dcdcLocked, setDcdcLocked] = useState<Record<DcDcLockableKey, boolean>>(() => ({
    ...DCDC_DEFAULT_LOCKS,
  }));
  const [dcdcChanges, setDcdcChanges] = useState<AutoOptChange<DcDcLockableKey>[]>([]);

  const [acdcAutoOpt, setAcdcAutoOpt] = useState<boolean>(true);
  const [acdcLocked, setAcdcLocked] = useState<Record<AcDcLockableKey, boolean>>(() => ({
    ...ACDC_DEFAULT_LOCKS,
  }));
  const [acdcChanges, setAcdcChanges] = useState<AutoOptChange<AcDcLockableKey>[]>([]);
  const [inductorConfigs, setInductorConfigs] = useState<Record<string, PerInductorConfig>>({});
  const [capacitorConfigs, setCapacitorConfigs] = useState<Record<string, PerCapConfig>>({});

  const dcdcStateRef = useRef<DcDcDesignState>(dcdcState);
  const prevDcdcPropRef = useRef<DcDcDesignState>(dcdcState);
  if (dcdcState !== prevDcdcPropRef.current) {
    prevDcdcPropRef.current = dcdcState;
    dcdcStateRef.current = dcdcState;
  }

  const acdcStateRef = useRef<AcDcDesignState>(acdcState);
  const prevAcdcPropRef = useRef<AcDcDesignState>(acdcState);
  if (acdcState !== prevAcdcPropRef.current) {
    prevAcdcPropRef.current = acdcState;
    acdcStateRef.current = acdcState;
  }

  const toggleDcdcLock = useCallback((key: DcDcLockableKey) => {
    setDcdcLocked((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const setAllDcdcLocks = useCallback((lockedVal: boolean) => {
    setDcdcLocked((prev) => {
      const next = { ...prev };
      (Object.keys(next) as DcDcLockableKey[]).forEach((k) => {
        next[k] = lockedVal;
      });
      return next;
    });
  }, []);

  const resetDcdcLocksSpecsOnly = useCallback(() => {
    setDcdcLocked({ ...DCDC_DEFAULT_LOCKS });
  }, []);

  const clearDcdcChanges = useCallback(() => setDcdcChanges([]), []);

  const applyDcdcPatch = useCallback(
    (
      patch: Partial<DcDcDesignState>,
      changedKey: keyof DcDcDesignState | null = null,
      options?: PatchApplyOptions
    ) => {
      const prev = dcdcStateRef.current;
      const candidate: DcDcDesignState = { ...prev, ...patch };
      if (changedKey === 'materialId' && patch.customSteinmetzEnabled === undefined) {
        candidate.customSteinmetzEnabled = false;
      }
      if (options?.bypassAutoOpt || !dcdcAutoOpt || changedKey === 'presetName') {
        dcdcStateRef.current = candidate;
        setDcdcState(candidate);
        if (options?.bypassAutoOpt) {
          setDcdcChanges([]);
        }
        return;
      }
      const { nextState, changes } = optimizeDcDcUnlocked(prev, candidate, changedKey, dcdcLocked);
      dcdcStateRef.current = nextState;
      setDcdcState(nextState);
      setDcdcChanges(changes);
    },
    [dcdcAutoOpt, dcdcLocked, setDcdcState]
  );

  const setDcdcField = useCallback(
    <K extends keyof DcDcDesignState>(key: K, val: DcDcDesignState[K]) => {
      const patch = { [key]: val } as Partial<DcDcDesignState>;
      applyDcdcPatch(patch, key);
    },
    [applyDcdcPatch]
  );

  const optimizeDcdcNow = useCallback(() => {
    const prev = dcdcStateRef.current;
    const { nextState, changes } = optimizeDcDcUnlocked(prev, prev, null, dcdcLocked);
    dcdcStateRef.current = nextState;
    setDcdcState(nextState);
    setDcdcChanges(changes);
  }, [dcdcLocked, setDcdcState]);

  const toggleAcdcLock = useCallback((key: AcDcLockableKey) => {
    setAcdcLocked((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const setAllAcdcLocks = useCallback((lockedVal: boolean) => {
    setAcdcLocked((prev) => {
      const next = { ...prev };
      (Object.keys(next) as AcDcLockableKey[]).forEach((k) => {
        next[k] = lockedVal;
      });
      return next;
    });
  }, []);

  const resetAcdcLocksSpecsOnly = useCallback(() => {
    setAcdcLocked({ ...ACDC_DEFAULT_LOCKS });
  }, []);

  const clearAcdcChanges = useCallback(() => setAcdcChanges([]), []);

  const applyAcdcPatch = useCallback(
    (
      patch: Partial<AcDcDesignState>,
      changedKey: keyof AcDcDesignState | null = null,
      options?: PatchApplyOptions
    ) => {
      const prev = acdcStateRef.current;
      const candidate: AcDcDesignState = { ...prev, ...patch };
      if (options?.bypassAutoOpt || !acdcAutoOpt || changedKey === 'presetName') {
        acdcStateRef.current = candidate;
        setAcdcState(candidate);
        if (options?.bypassAutoOpt) {
          setAcdcChanges([]);
        }
        return;
      }
      const { nextState, changes } = optimizeAcDcUnlocked(prev, candidate, changedKey, acdcLocked);
      acdcStateRef.current = nextState;
      setAcdcState(nextState);
      setAcdcChanges(changes);
    },
    [acdcAutoOpt, acdcLocked, setAcdcState]
  );

  const setAcdcField = useCallback(
    <K extends keyof AcDcDesignState>(key: K, val: AcDcDesignState[K]) => {
      const patch = { [key]: val } as Partial<AcDcDesignState>;
      applyAcdcPatch(patch, key);
    },
    [applyAcdcPatch]
  );

  const optimizeAcdcNow = useCallback(() => {
    const prev = acdcStateRef.current;
    const { nextState, changes } = optimizeAcDcUnlocked(prev, prev, null, acdcLocked);
    acdcStateRef.current = nextState;
    setAcdcState(nextState);
    setAcdcChanges(changes);
  }, [acdcLocked, setAcdcState]);

  const updateInductorConfig = useCallback(
    (id: string, updater: (prev: PerInductorConfig) => PerInductorConfig) => {
      setInductorConfigs((prev) => {
        const current = prev[id] || {
          buildMode: 'custom' as const,
          overrides: {},
          locks: { ...DEFAULT_INDUCTOR_LOCKS },
        };
        return { ...prev, [id]: updater(current) };
      });
    },
    []
  );

  const resetInductorConfigs = useCallback((ids?: string[]) => {
    if (!ids) {
      setInductorConfigs({});
      return;
    }
    setInductorConfigs((prev) => {
      const next = { ...prev };
      ids.forEach((id) => delete next[id]);
      return next;
    });
  }, []);

  const updateCapacitorConfig = useCallback(
    (id: string, updater: (prev: PerCapConfig) => PerCapConfig) => {
      setCapacitorConfigs((prev) => {
        const current = prev[id] || {
          viewMode: 'builder' as const,
          overrides: {},
          locks: { ...DEFAULT_CAP_BANK_LOCKS },
        };
        return { ...prev, [id]: updater(current) };
      });
    },
    []
  );

  const resetCapacitorConfigs = useCallback((ids?: string[]) => {
    if (!ids) {
      setCapacitorConfigs({});
      return;
    }
    setCapacitorConfigs((prev) => {
      const next = { ...prev };
      ids.forEach((id) => delete next[id]);
      return next;
    });
  }, []);

  const replaceInductorConfigs = useCallback((next: Record<string, PerInductorConfig>) => {
    setInductorConfigs({ ...next });
  }, []);

  const replaceCapacitorConfigs = useCallback((next: Record<string, PerCapConfig>) => {
    setCapacitorConfigs({ ...next });
  }, []);

  return (
    <DesignSolverContext.Provider
      value={{
        dcdcAutoOpt,
        setDcdcAutoOpt,
        dcdcLocked,
        toggleDcdcLock,
        setAllDcdcLocks,
        resetDcdcLocksSpecsOnly,
        dcdcChanges,
        clearDcdcChanges,
        setDcdcField,
        applyDcdcPatch,
        optimizeDcdcNow,
        acdcAutoOpt,
        setAcdcAutoOpt,
        acdcLocked,
        toggleAcdcLock,
        setAllAcdcLocks,
        resetAcdcLocksSpecsOnly,
        acdcChanges,
        clearAcdcChanges,
        setAcdcField,
        applyAcdcPatch,
        optimizeAcdcNow,
        inductorConfigs,
        updateInductorConfig,
        replaceInductorConfigs,
        resetInductorConfigs,
        capacitorConfigs,
        updateCapacitorConfig,
        replaceCapacitorConfigs,
        resetCapacitorConfigs,
      }}
    >
      {children}
    </DesignSolverContext.Provider>
  );
};

export function useDesignSolver(): DesignSolverContextValue {
  const ctx = useContext(DesignSolverContext);
  if (ctx) return ctx;
  // Fallback no-op for standalone rendering if ever mounted outside provider
  return {
    dcdcAutoOpt: false,
    setDcdcAutoOpt: () => {},
    dcdcLocked: { ...DCDC_DEFAULT_LOCKS },
    toggleDcdcLock: () => {},
    setAllDcdcLocks: () => {},
    resetDcdcLocksSpecsOnly: () => {},
    dcdcChanges: [],
    clearDcdcChanges: () => {},
    setDcdcField: () => {},
    applyDcdcPatch: () => {},
    optimizeDcdcNow: () => {},
    acdcAutoOpt: false,
    setAcdcAutoOpt: () => {},
    acdcLocked: { ...ACDC_DEFAULT_LOCKS },
    toggleAcdcLock: () => {},
    setAllAcdcLocks: () => {},
    resetAcdcLocksSpecsOnly: () => {},
    acdcChanges: [],
    clearAcdcChanges: () => {},
    setAcdcField: () => {},
    applyAcdcPatch: () => {},
    optimizeAcdcNow: () => {},
    inductorConfigs: {},
    updateInductorConfig: () => {},
    replaceInductorConfigs: () => {},
    resetInductorConfigs: () => {},
    capacitorConfigs: {},
    updateCapacitorConfig: () => {},
    replaceCapacitorConfigs: () => {},
    resetCapacitorConfigs: () => {},
  };
}

/**
 * Reusable hook for sub-tool engineering parameters.
 * When unlocked (default), value dynamically tracks `autoCalculatedValue`.
 * When the user edits the control or clicks Lock, value locks to the manual value;
 * unlocking snaps immediately back to `autoCalculatedValue`.
 */
export function useLockableValue<T>(
  autoCalculatedValue: T,
  initialLocked = false
): {
  value: T;
  locked: boolean;
  setManual: (nextVal: T) => void;
  toggleLock: () => void;
  resetToAuto: () => void;
} {
  const [locked, setLocked] = useState<boolean>(initialLocked);
  const [manualValue, setManualValue] = useState<T>(autoCalculatedValue);

  useEffect(() => {
    if (!locked) {
      setManualValue(autoCalculatedValue);
    }
  }, [locked, autoCalculatedValue]);

  const setManual = useCallback((nextVal: T) => {
    setManualValue(nextVal);
    setLocked(true);
  }, []);

  const toggleLock = useCallback(() => {
    const next = !locked;
    if (next) {
      setManualValue(autoCalculatedValue);
    }
    setLocked(next);
  }, [locked, autoCalculatedValue]);

  const resetToAuto = useCallback(() => {
    setLocked(false);
    setManualValue(autoCalculatedValue);
  }, [autoCalculatedValue]);

  return {
    value: locked ? manualValue : autoCalculatedValue,
    locked,
    setManual,
    toggleLock,
    resetToAuto,
  };
}

export { DCDC_PRESETS, ACDC_PRESETS };
