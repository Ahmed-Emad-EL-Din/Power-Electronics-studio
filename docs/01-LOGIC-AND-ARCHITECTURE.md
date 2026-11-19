# 01 — Logic & Architecture Blueprint

## 1. Current Architecture Assessment
Power Electronics Studio currently separates state and physics across:
- `src/data/databases.ts`, `src/data/passiveDatabase.ts`: Component, core, material, and preset catalogs.
- `src/engine/`: Deterministic solvers (`dcdcEngine.ts`, `acdcEngine.ts`, `passiveDesignEngine.ts`, `autoOptimizer.ts`, `designAlerts.ts`, `designFixSynthesizer.ts`, `aiAgentEngine.ts`).
- `src/components/DesignSolverContext.tsx`: Lock-aware solver context synchronizing `dcdcState`, `acdcState`, `inductorConfigs`, `capacitorConfigs`, and turns-ratio coupling.
- `server.ts`: Express + Vite dev middleware + `/api/component-search` + `/api/ai-agent`.

### Key Architectural Gaps Identified
1. **Disconnected Stages**: `acdcState` and `dcdcState` solve independently. Changing `Vdc_bus_V` or `Pout_W` on one stage does not propagate to the other unless manually copied.
2. **No Project Persistence or Import**: `App.tsx` can export JSON, but there is no JSON file import, no named project slots in `localStorage`, and no Undo/Redo history stack.
3. **Test Suite Coverage**: Only `src/engine/dcdcSolver.test.ts` exists (13 tests, with Test 13 currently failing by ~386 bytes on `compactForChat`).
4. **Monolithic Solver File**: `dcdcEngine.ts` exceeds 2,600 lines, mixing magnetics, thermal, waveforms, small-signal Bode, and DSP code generation.

---

## 2. Target Architecture Enhancements

### A. 2-Stage System Cascade Engine (`src/engine/systemCascadeEngine.ts`)
- **Coupling Modes**:
  - `linkBusVoltage`: Propagates `acdcState.Vdc_bus_V` and `acdcRes.Vdc_ripple_pp_V` into `dcdcState.Vin_nom_V`, `Vin_min_V` (accounting for hold-up droop `Vdc_min_hold_V` and ripple valley), and `Vin_max_V`.
  - `linkLoadPower`: Computes required PFC output power $P_{\text{PFC,req}} = P_{\text{DC-DC,out}} / (\eta_{\text{DC-DC}} / 100)$ so AC-DC inductor, switch, and cap-bank stress automatically reflect true downstream demand.
- **Cascaded Telemetry (`SystemCascadeSummary`)**:
  - $\eta_{\text{sys}} = (\eta_{\text{AC-DC}} / 100) \times (\eta_{\text{DC-DC}} / 100) \times 100\%$
  - $P_{\text{loss,sys}} = P_{\text{loss,AC-DC}} + P_{\text{loss,DC-DC}}$
  - $P_{\text{in,AC}} = P_{\text{DC-DC,out}} + P_{\text{loss,sys}}$
  - System thermal bottleneck and hold-up margin check.

### B. Versioned Project Storage & Undo/Redo (`src/engine/projectStorage.ts`)
- **Schema v2 (`PowerStudioProjectFile`)**:
  ```ts
  interface PowerStudioProjectFile {
    schemaVersion: 2;
    name: string;
    savedAt: string;
    systemLink: { linkBusVoltage: boolean; linkLoadPower: boolean };
    dcdcState: DcDcDesignState;
    acdcState: AcDcDesignState;
    inductorConfigs: Record<string, PerInductorConfig>;
    capacitorConfigs: Record<string, PerCapConfig>;
  }
  ```
- **Backward Compatibility**: Import helper detects v1 single-domain exports (`{ domain: 'dc-dc-isolated', state }` or `{ domain: 'ac-dc-pfc', state }`) and merges them safely with validation and defaults.
- **Undo/Redo History**: Bounded 40-step immutable snapshot stack (`pushHistory`, `undo`, `redo`) wired to `Ctrl+Z` / `Ctrl+Shift+Z`.

### C. Solver Modularization Plan
Split `dcdcEngine.ts` progressively into clean pure-function sub-modules:
- `src/engine/magneticsSolver.ts` (iGSE, Dowell, Jiles-Atherton B-H loop, core thermal equilibrium)
- `src/engine/waveformSolver.ts` (multi-channel time-domain switching waveforms)
- `src/engine/transientOdeSolver.ts` (RK4 closed-loop time-domain transient simulator)
- `src/engine/monteCarloEngine.ts` (Monte Carlo tolerance & worst-case corner engine)
- `src/engine/spiceNetlistExporter.ts` (SPICE `.cir` + C firmware `.h` synthesis)

---

## 3. Verification & Quality Gates
- All engines must remain pure TypeScript functions (zero DOM dependencies in `src/engine/`) so they run identically in Node `tsx --test` and browser Vite bundles.
- `npm run lint` (`tsc --noEmit`), `npx tsx --test src/engine/*.test.ts`, and `npm run build` must all pass with zero errors on every milestone.
