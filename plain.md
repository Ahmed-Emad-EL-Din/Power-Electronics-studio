# Power Electronics Studio (VoltCraft) — Complete Master Development Plan

> **Living Engineering Checklist.** Every task is tracked with `[ ]` / `[x]` and checked off immediately upon implementation and automated verification (`npm run lint`, `npm run build`, and unit tests).
>
> **Architecture & Deep-Dive Blueprints (`docs/`):**
> - [`docs/01-LOGIC-AND-ARCHITECTURE.md`](./docs/01-LOGIC-AND-ARCHITECTURE.md) — State coupling, undo/redo, persistence, validation, test architecture
> - [`docs/02-CALCULATION-AND-PHYSICS.md`](./docs/02-CALCULATION-AND-PHYSICS.md) — Multi-stage physics, thermal RC networks, Monte Carlo, new topologies
> - [`docs/03-DESIGN-AND-GUI.md`](./docs/03-DESIGN-AND-GUI.md) — Workbench UX, project manager, BOM rollup, interactive schematic probing
> - [`docs/04-GRAPH-TOOLS-AND-VISUALIZATION.md`](./docs/04-GRAPH-TOOLS-AND-VISUALIZATION.md) — 4-channel oscilloscope, 2D efficiency heatmaps, Monte Carlo histograms, CSV/SVG
> - [`docs/05-AI-AND-AGENT.md`](./docs/05-AI-AND-AGENT.md) — Compact telemetry, audit presets, what-if trade-off sweeps, multi-provider resilience
> - [`docs/06-MODELING-SIMULATION-AND-EXPORT.md`](./docs/06-MODELING-SIMULATION-AND-EXPORT.md) — RK4 switched ODE transient solver, SPICE `.cir` export, C2000/STM32 `.h` firmware, KiCad BOM
> - [`docs/07-STUDIO-UPGRADE-PLAN.md`](./docs/07-STUDIO-UPGRADE-PLAN.md) — UI color tokens, shell & tool organization, graph deduplication & interactivity, **PCMC + Type-II**, and **Live LCSC Library**
> - [`.agents/skills/INDEX.md`](./.agents/skills/INDEX.md) — Curated GitHub AI engineering skills (`precision-lab-ui`, `lcsc-live-sourcing`, `pcmc-type2-control`)

---

## Completed Foundation (Tasks 1–10)

### Task 1 — Steinmetz iGSE & Thermal `Pcore` Model Calibration
- [x] Calibrate TDK `PC95` flat-temperature Steinmetz parabolic curve (`tempCoeff_c2`, `T_opt_C`) in `databases.ts`
- [x] Audit primary RMS circulating current factor `Ipri_rms_A` in `dcdcEngine.ts`
- [x] Verify Steinmetz iGSE `PQ50/50` test passes

### Task 2 — Turns Ratio Sync, Duty Loss & Secondary Ringing Math
- [x] Compute worst-case low-line (`Vin_min_V`) duty saturation (`Deff_max`, `Dloss_max`, `D_applied_max`) and subharmonic `Qp_subharmonic_wc`
- [x] Audit secondary RMS currents & unclamped ringing (`Vsec_unclamped_pk_V`) across all 4 DC-DC topologies
- [x] Synchronize integer `Np_turns / Ns_turns` and `turnsRatio_n` across edits, optimizer, and solver

### Task 3 — Control Loop Compensator RC Scaling & Type-II vs Type-III Accuracy
- [x] Enforce C0G/NP0-friendly op-amp RC scaling (`R1 >= 4.7kΩ`, `R2 ∈ [10,220]kΩ`, `C1 <= 47nF`, `C2 >= 15pF`)
- [x] Gate PCMC slope ramp comments in `dspCode` strictly on `controlType === 'pcmc'`
- [x] Mark Type-II vs Type-III fields cleanly in `SmallSignalDashboard.tsx`

### Task 4 — Auto-Optimizer & 1-Click Compact Core Fix Synthesizer
- [x] Account for center-tapped doubled secondary windings in `maxWindowSec`
- [x] Improve `autoOptimizer.ts` transformer search, 200 V SR selection, and low-line `slopeFactor_mc` tuning
- [x] Synthesize reliable 1-click compact core fixes in `designFixSynthesizer.ts`

### Task 5 — Design Alerts & Engineering Report / PDF Final Audit Synchronization
- [x] Harden `evaluateDesignAlerts` for low-line PCMC stability, oversized core, `fc` near `f0`, duty saturation, and SR voltage margin
- [x] Synchronize `designReportModel.ts` (`ch-dcdc-specs`, `ch-audit`), `pdfReportBuilder.ts`, and `DesignReportModal.tsx`

### Task 6 — Audit & Upgrade Built-In Presets
- [x] Upgrade `DCDC_PRESETS[0]` to 200 V SR (`IPP110N20N3`) with 0 Danger / 0 Warning
- [x] Audit all `DCDC_PRESETS` and `ACDC_PRESETS` for clean baseline solves

### Task 7 — Multi-Provider AI API Key Experience & Proxy Hardening
- [x] Add top-bar `AI Keys` trigger & modal supporting Gemini, OpenAI, Anthropic, and OpenAI-Compatible providers
- [x] Harden `/api/ai-agent` and `/api/component-search` for reasoning models (`o1/o3/o4-mini/gpt-5*`) and error formatting

### Task 8 — Test Suite Expansion (Baseline)
- [x] Expand `dcdcSolver.test.ts` covering alerts, low-line stability, presets, and RC bounds

### Task 9 — Human-Readable KaTeX Mathematical Rendering in PDF Report
- [x] Implement `calcStringToTex` and self-contained browser KaTeX-to-PNG rasterizer in `pdfReportBuilder.ts`
- [x] Validate 100% strict KaTeX parsing across all presets and report chapters

### Task 10 — Gemini API Key Sanitization & Model Fallback
- [x] Gate `thinkingConfig.thinkingLevel` strictly on Gemini 3/4 models and add automatic `gemini-2.5-flash` fallback
- [x] Add `gemini-2.5-flash`/`pro` chips and strip quotes/whitespace from pasted keys

---

## Phase A — Logic, Architecture & System Coupling

### Task 11 — 2-Stage System Bus Coupling (`AC-DC PFC` ↔ `Isolated DC-DC`)
- [x] Build `src/engine/systemCascadeEngine.ts` to couple AC-DC PFC output (`Vdc_bus_V`, `Vdc_ripple_pp_V`) into DC-DC input (`Vin_nom_V`, `Vin_min_V`, `Vin_max_V`) when System Link is enabled
- [x] Compute true cascaded system metrics (`eta_sys_pct`, `Ptotal_loss_sys_W`, `P_pfc_required_W`, `Iin_ac_system_A`, system hold-up time margin, and bottleneck stage identification)
- [x] Add bidirectional propagation mode (`Link DC-DC Load → AC-DC Pout` and `Link PFC Bus → DC-DC Vin`) with clear lock indicators in the UI
- [x] Add automated unit tests verifying cascaded efficiency, ripple voltage propagation, and power balance conservation

### Task 12 — Project Persistence, JSON Import/Export & Undo/Redo History
- [x] Build `src/engine/projectStorage.ts` defining a versioned `PowerStudioProjectFile` schema (`schemaVersion: 2`, `dcdcState`, `acdcState`, `inductorConfigs`, `capacitorConfigs`, `systemLinkConfig`, metadata)
- [x] Implement browser `localStorage` autosave recovery + named multi-project slots (Save, Rename, Duplicate, Delete, Load)
- [x] Implement safe JSON file import with structural validation & backward compatibility for v1 single-domain exports
- [x] Implement bounded Undo / Redo state stack (`Ctrl+Z` / `Ctrl+Shift+Z` / `Ctrl+Y`) across `dcdcState`, `acdcState`, and passive configs

### Task 13 — Dependency Hygiene, Modular Engine Split & Expanded Test Suite
- [ ] Resolve `vite@8` vs `esbuild` peer dependency alignment in `package.json` so `npm install` runs cleanly without `--legacy-peer-deps`
- [ ] Add dedicated unit test files: `acdcSolver.test.ts`, `passiveDesign.test.ts`, `systemCascade.test.ts`, and `simulationExport.test.ts`
- [ ] Add CI validation script (`npm run verify`) running `tsc --noEmit`, all `tsx --test` suites, and `vite build`
- [ ] Refactor oversized `dcdcEngine.ts` (2,600+ lines) into cohesive sub-modules (`magneticsSolver.ts`, `thermalSolver.ts`, `smallSignalSolver.ts`, `waveformSolver.ts`) while preserving public API exports

---

## Phase B — Calculation & Physics Accuracy

### Task 14 — High-Resolution Multi-Channel Switching Cycle Waveform Physics
- [x] Upgrade `WaveformPoint` & `evalFullWaveforms(t_us)` in `dcdcEngine.ts` to compute authentic cycle-by-cycle `v_pri_V`, `i_pri_A`, `v_sec_V`, `i_lo_A`, `i_lm_A` (magnetizing ramp), and `v_cr_V` (resonant capacitor voltage for LLC / clamping plateau for PSFB)
- [x] Model PSFB dead-time $C_{\text{oss}}$ resonant charging transition (`v_pri` finite slew rate) and leakage-inductance duty-loss current commutation interval accurately
- [x] Model LLC switching above/at/below resonance ($f_{\text{sw}} > f_r$, $f_{\text{sw}} = f_r$, $f_{\text{sw}} < f_r$ DCM secondary current clamping) in `evalFullWaveforms`
- [x] Validate RMS and average values integrated numerically over `evalFullWaveforms` against closed-form analytical `Ipri_rms_A`, `Iout_phase_A`, and `Im_pk_A`

### Task 15 — Monte Carlo Tolerance & Worst-Case Corner Analysis Engine
- [x] Build `src/engine/monteCarloEngine.ts` with deterministic seeded PRNG (Mulberry32) and Box-Muller Gaussian sampling
- [x] Support configurable component tolerances (`Llk ±10%`, `Lm ±15%`, `Lo ±10%`, `Co ±20%`, `ESR ±25%`, `Rds_on ±15%`, `Bsat ±10%`, `Vin`, `Tamb`)
- [x] Compute statistical yield (`passRate_pct`), mean, std-dev, 5th/95th/99th percentiles, and worst-case corner vectors for: `efficiency_pct`, `Tj_pri_C`, `Tj_sec_C`, `Bpk_mT` saturation margin, `pm_actual_deg`, `Qp_subharmonic_wc`, `zvsEnergyRatio_pct`, and `Vout_ripple_mVpp`
- [x] Identify top sensitivity drivers (Pearson correlation / tornado ranking of which tolerance drives each failure mode)

### Task 16 — Thermal RC Cauer/Foster Network & Transient Overload Modeling
- [ ] Extend `dcdcEngine.ts` and `acdcEngine.ts` with 4-node Foster/Cauer thermal RC network (`Junction → Case → TIM → Heatsink → Ambient`)
- [ ] Compute pulsed load / short-circuit $T_j(t)$ peak temperature response for single pulse and repetitive duty pulses ($Z_{\theta JC}(t)$)
- [ ] Model forced-air vs natural convection heatsink airflow derating (`LFM` / `m/s` airflow curve)

### Task 17 — Next-Generation Topologies (DAB, CLLC, Buck-Boost, Vienna PFC)
- [ ] Add **Dual Active Bridge (DAB)** bidirectional topology solver (SPS / EPS / TPS phase-shift modulation, ZVS soft-switching map, backflow power)
- [ ] Add **Bidirectional CLLC Resonant** converter solver (forward/reverse FHA + time-domain gain curves)
- [ ] Add **4-Switch Buck-Boost / Interleaved Synchronous Buck** non-isolated DC-DC topology for auxiliary/point-of-load stages
- [ ] Add **3-Phase Vienna Rectifier & 3-Level ANPC PFC** to `acdcEngine.ts` with neutral-point balance & 3-phase line harmonic modeling

### Task 18 — Advanced Magnetics, Parasitic PCB Layout & EMI Physics
- [ ] Add PCB trace stray inductance & resistance estimator (trace width, length, copper weight `1oz/2oz/4oz`, loop area) feeding directly into `Vsec_ringing_delta_V` and gate-drive ringing
- [ ] Add 2D Dowell / fringing-flux air-gap proximity loss enhancement around gapped center legs in `passiveDesignEngine.ts`
- [ ] Add multi-stage differential-mode + common-mode EMI filter insertion loss solver (`CISPR 22 / EN 55032 Class A & Class B` margin check across `150 kHz – 30 MHz`)

---

## Phase C — Design, GUI & UX Workflows

### Task 19 — Top-Bar Project Manager, Undo/Redo & System Cascade Strip
- [x] Add **Undo / Redo** buttons with keyboard shortcuts (`Ctrl+Z`, `Ctrl+Shift+Z`) and change tooltip in `src/App.tsx`
- [x] Add **Projects & Import/Export** popover/modal (Save named project to `localStorage`, Load/Delete saved designs, Import `.json` design file, Export full studio JSON, Export SPICE `.cir`, Export C Header `.h`)
- [x] Add **System Cascade Link Bar** below header showing AC-DC → DC-DC voltage/power coupling toggle, cascaded efficiency $\eta_{\text{sys}}$, total system loss $P_{\text{loss,sys}}$, and bottleneck indicator
- [x] Support `Ctrl+S` quick-save and `Esc` modal close consistently across all drawers/modals

### Task 20 — Complete BOM Cost, Area & LCSC/JLCPCB Rollup Workspace
- [ ] Build `src/engine/bomEngine.ts` aggregating every active & passive component (primary switches, secondary switches/diodes, transformer core + bobbin + Litz wire, output/PFC/EMI inductors, capacitor banks, gate drivers, current-sense, auxiliaries)
- [ ] Add interactive **BOM & Cost Rollup** panel/drawer with unit pricing at `1 / 100 / 1000` qty, PCB footprint area ($mm^2$), and JLCPCB Basic/Extended classification
- [ ] Add 1-click **Export BOM CSV** and **Export KiCad BOM / Netlist**

### Task 21 — Interactive Schematic Cross-Probing & Component Inspector
- [ ] Link `CircuitSchematics.tsx` component clicks (`Q1-Q4`, `T1`, `Llk`, `Lo`, `Co`, `SR1-SR4`, `Cdc`, `Lpfc`) directly to open quick-inspect popovers or jump to the corresponding parameter tab
- [ ] Add live current/voltage/temperature callout badges toggleable directly on schematic nodes (`Overlay Telemetry: ON/OFF`)
- [ ] Add interactive schematic comparison diff badge when `Pin Ref` is active

### Task 22 — Responsive Precision Lab UI & Multi-Screen / Print Polish
- [ ] Add compact **Executive Summary Strip** at top of both `DcDcWorkbench` and `AcDcWorkbench` so key KPIs stay visible while scrolling sub-tabs
- [ ] Improve mobile/tablet responsiveness for parameter grids and wide tables
- [ ] Add configurable Report Sections selector in `DesignReportModal.tsx` (include/exclude chapters, waveforms, BOM, Monte Carlo summary)

---

## Phase D — Graph Tools & Visualization

### Task 23 — 4-Channel Virtual Oscilloscope (`OscilloscopeViewer.tsx`)
- [x] Build dedicated interactive multi-channel oscilloscope component rendering `CH1: v_pri(t)`, `CH2: i_pri(t)`, `CH3: v_sec(t)`, `CH4: i_Lo(t)` plus toggleable `i_Lm(t)` and `v_Cr(t)`
- [x] Support per-channel enable/disable, vertical grid divisions, timebase zoom (`0.25x` to `8x` switching periods), trigger threshold line, and live **M1 / M2 Cursor Measurements** (`RMS`, `Mean`, `Pk-Pk`, `Max`, `Min`, `Δt`, `1/Δt`, `dV/dt`, `dI/dt`, `∫i·dt`)
- [x] Support 1-click **Export Scope CSV** and **Export Scope SVG/PNG**
- [x] Integrate `OscilloscopeViewer` into `DcDcWorkbench` (upgrading waveform inspection & new `"Scope & Sim"` sub-tab)

### Task 24 — Closed-Loop Step-Load Transient & Monte Carlo Plots
- [x] Build interactive **Time-Domain Step-Load Transient Graph** comparing RK4 nonlinear switched response vs small-signal linearized envelope (with overshoot % / undershoot mV / settling time markers)
- [x] Build **Monte Carlo Distribution Histogram & Yield CDF Chart** with spec limit vertical markers (`Tj_max`, `PM_min`, `Bsat_limit`, `Vripple_max`) and tornado sensitivity bar chart
- [x] Upgrade `InteractiveChart.tsx` to expose **Export CSV** button directly in its chart toolbar alongside SVG/PNG export

### Task 25 — 2D Parametric Efficiency & Loss Surface / Heatmap Tool
- [ ] Build interactive **2D Heatmap / Contour Explorer** (`Vin` vs `Pout` efficiency map, `fsw` vs `Lm` ZVS/loss contour, or `Np` vs `fsw` transformer loss map)
- [ ] Allow clicking any cell on the 2D heatmap to inspect full loss breakdown or jump operating point (`Vin`, `Pout`, `fsw`) directly into the solver

### Task 26 — Unified Multi-Plot Pin Comparison & Bode/Nyquist Enhancements
- [ ] Overlay pinned reference (`Pin Ref`) curves cleanly across `OscilloscopeViewer` and `TransientAndMonteCarloLab`
- [ ] Add worst-case corner Bode family overlay (`Vin_min / Vin_nom / Vin_max` + `Co_min / Co_max`) in `BodeStabilityGraph.tsx`
- [ ] Add interactive Nyquist sensitivity circle ($M_s = 6\text{ dB}$) hover readout and Nichols chart toggle in `SmallSignalDashboard.tsx`

---

## Phase E — AI Engineering Agent & Copilot

### Task 27 — Fix Compact Chat Snapshot & Context Budgeter
- [x] Optimize `buildAiDesignSnapshot(ctx, { compactForChat: true })` in `src/engine/aiAgentEngine.ts` so compact chat payload is strictly `< 45%` of full snapshot bytes (fixing Test 13 and reducing LLM latency/cost)
- [x] Display live snapshot payload size (`KB` / estimated tokens) and active provider badge inside `AiEngineerDrawer.tsx`

### Task 28 — Focused Audit Presets & Multi-Candidate Trade-Off Explorer
- [x] Add 1-click focused audit templates in `AiEngineerDrawer.tsx`: **Full Safety Audit**, **Thermal & Efficiency Boost**, **Light-Load ZVS & Ringing**, and **EMI & Passive Lifetime**
- [ ] Upgrade `/api/ai-agent` prompt & response handling so AI can propose alternative trade-off options (e.g., *Lowest Loss* vs *Smallest Footprint* vs *Lowest BOM Cost*), all dry-run verified before one-click apply
- [ ] Add live **Design Diff Preview** inside each staged AI fix card showing exact parameter before → after changes before clicking Apply

### Task 29 — Automated What-If Parametric Sweep & Pareto Copilot
- [ ] Add client-side deterministic **AI Tool Runner** (`runParetoSweep`, `runMonteCarloCheck`, `checkComponentMargin`) that the AI Agent can invoke or summarize in Chat mode with verified numbers (zero hallucinated specs)
- [ ] Add **Datasheet Spec Extractor** in `ComponentSearchDrawer` / `AiProviderSettingsPanel` to parse pasted datasheet text/tables into validated `SemiconductorSpec` / `CoreMaterialSpec` JSON entries

### Task 30 — Multi-Provider Streaming & Resilient Error Recovery
- [ ] Add graceful retry/backoff and clear diagnostic banner when provider rate limits or network timeouts occur
- [ ] Support custom system prompt engineering constraints (e.g. "Max height 25mm", "Automotive AEC-Q100 only", "Target cost < $18") saved per project

---

## Phase F — Modeling, Simulation & Export

### Task 31 — In-Browser RK4 Time-Domain Switched ODE Transient Simulator (`transientOdeSolver.ts`)
- [x] Build `src/engine/transientOdeSolver.ts` implementing a 4th-order Runge-Kutta (`RK4`) closed-loop state-space transient solver for DC-DC converters
- [x] Simulate **Startup Soft-Start** and **Step-Load Transient** (`I_load_1 → I_load_2` with configurable `di/dt` slew rate), computing exact `v_out(t)`, `i_Lo(t)`, `i_C_out(t)`, duty/control effort `u(t)`, peak overshoot/undershoot (`ΔV_pk_mV`), and 2% settling time (`t_settle_us`)
- [x] Integrate closed-loop digital `2P2Z` / `3P3Z` / `PCMC` discrete-time difference equation synchronized at `fs_digital_kHz` inside the RK4 simulation loop

### Task 32 — LTspice / ngspice `.cir` Netlist Exporter (`spiceNetlistExporter.ts`)
- [x] Build `src/engine/spiceNetlistExporter.ts` generating simulation-ready `.cir` SPICE netlists for:
  - [x] DC-DC PSFB (`psfb-1ph`, `psfb-2ph`) with phase-shifted full-bridge voltage-controlled switches, `Llk`, coupled transformer `K1 Lpri Lsec`, `Lm`, center-tapped / full-bridge / current-doubler secondary, `Lo`, `Co`/`ESR`, and load step `PULSE` source
  - [x] DC-DC LLC (`llc-fb`, `llc-hb`) with half/full-bridge switching network, `Cr`, `Lr`, `Lm`, ideal transformer, rectifier bridge, and `.tran` / `.meas` efficiency & ripple directives
  - [x] AC-DC PFC (`2ph-interleaved-totem`, `1ph-totem-pfc`, `2ph-interleaved-boost`, `dual-boost-bridgeless`) with AC mains source, EMI DM/CM stage, boost inductors `Lpfc`, DC-link bulk cap + ESR, and resistive/constant-power load
- [x] Expose live SPICE netlist inspector + copy/download `.cir` button in the Workbench `"Scope & Sim"` tab and Top-Bar Export menu

### Task 33 — Embedded DSP Firmware Config Header Exporter (`.h`)
- [x] Implement `generateControlFirmwareHeader()` in `src/engine/spiceNetlistExporter.ts` producing a complete, compile-ready C header (`powerstage_control_cfg.h`) for **TI C2000 (DCL / CLA)** and **STM32G4 (HRTIM)**
- [x] Include exact pre-warped Tustin `2P2Z` / `3P3Z` coefficients (`b0..b3`, `a1..a3`), `fsw_Hz`, `deadTime_ns`, PCMC slope `Se_V_us`, ADC scaling gains, and OCP/OVP protection thresholds

### Task 34 — Interactive `"Scope & Sim"` Workbench Sub-Tab (`TransientAndMonteCarloLab.tsx`)
- [x] Create `src/components/TransientAndMonteCarloLab.tsx` combining:
  - [x] 4-Channel Virtual Oscilloscope (`OscilloscopeViewer`)
  - [x] RK4 Closed-Loop Step-Load Transient Simulator with interactive step %, slew rate, and overshoot KPIs
  - [x] Monte Carlo Tolerance & Yield Analyzer (100–1000 trials, yield %, worst-case corners, histogram)
  - [x] SPICE `.cir` & Embedded Firmware `.h` Live Code Preview + Download
- [x] Wire `"Scope & Sim"` tab cleanly into `DcDcWorkbench.tsx`

### Task 35 — Native Desktop Bridge Preparation (Future Tauri v2 Alignment)
- [ ] Align all engine DTOs (`DcDcResults`, `AcDcResults`, `WaveformPoint`, `SpiceNetlist`) for clean serialization with `antigravity-desktop-roadmap/` Rust/Tauri IPC contracts
- [ ] Support optional `ngspice` / `LTspice` batch simulation runner hook when running inside desktop shell

---

## Phase G — Professional UI, Tool Organization, Graph Consolidation, PCMC + Type-II & Live LCSC (See `docs/07-STUDIO-UPGRADE-PLAN.md`)

### Task 36 — Precision Bench Instrument Color Tokens & CSS Refactor
- [ ] Define unified semantic tokens (`--bg-canvas`, `--bg-panel`, `--bg-elevated`, `--bg-inset`, `--border-hairline`, `--border-strong`, `--text-primary/secondary/muted`, `--accent-brand`, `--status-pass/warn/danger`) in `src/index.css` for Light ("Architectural CAD Sheet") and Dark ("Lab Bench Graphite") parity
- [ ] Standardize colorblind-safe 6-channel oscilloscope/plot palette (`CH1..CH6` + dashed `#94A3B8` Pin Ref)
- [ ] Eliminate hardcoded legacy dark hex overrides (`#111827`, `#0B0E17`, `#07090E`, etc.) and enforce `tabular-nums`, `focus-visible`, `aria-label`, and `overscroll-behavior: contain`

### Task 37 — Shell Reorganization, Contextual Tool Placement & Graph Deduplication
- [ ] Streamline `src/App.tsx` top command bar into 3 focused zones: `[Project Pill + Undo/Redo]` | `[AC-DC PFC | DC-DC Stage | Control & Stability | Scope & Verification | Parts, LCSC & BOM]` | `[Alerts | Pin Ref | AI Copilot | Export ▾ | Theme]`
- [ ] Move `AI Keys` settings inside `AiEngineerDrawer` header and consolidate `.json` / `.cir` / `.h` / `.csv` / PDF exports into one `Export ▾` menu
- [ ] Remove all 8 duplicated panels/graphs across `DcDcWorkbench.tsx` (13 → 6 single-row sub-tabs), `AcDcWorkbench.tsx` (10 → 6 sub-tabs), and `SmallSignalDashboard.tsx` ("One Canonical Home per Tool")
- [ ] Add contextual inline `"Swap from LCSC…"` actions on semiconductor/passive cards and interactive `CircuitSchematics.tsx` click-to-inspect jump links

### Task 38 — Interactive & Numerically Accurate Graphing Engine Upgrade
- [ ] Fix `InteractiveChart.tsx` so pinned `refData` remains visible when zoomed/panned even without `refEvaluator`
- [ ] Add `ResizeObserver` coordinate responsiveness, pointer-centered scroll-wheel zoom (with lock toggle), keyboard cursor stepping (`←`/`→`, `[`/`]`, `R`), interactive legend toggles, and synchronized cross-chart X-cursor bus
- [ ] Wire `onPointClick` across parametric sweeps (`fsw`, `Bpk`, `Llk`, `Rg`) with Undo history integration

### Task 39 — `PCMC + Compensator Type-II` (`pcmc-type-ii`) Physics, Op-Amp/OTA & ODE Integration
- [ ] Add `'pcmc-type-ii'` (`DcDcControlType`, aliasing legacy `'pcmc'`) + `compensatorImpl: 'opamp' | 'ota' | 'digital-2p2z'` and `otaGm_uS` to `databases.ts`
- [ ] Implement exact Ridley PCMC plant in `dcdcEngine.ts`: $H_{\text{dc}} = \frac{R_{\text{load}}}{R_i}\frac{1}{1 + \frac{R_{\text{load}} T_{s,\text{eff}}}{L_{o,\text{eq}}}(m_c D' - 0.5)}$, $\omega_{p1} = \frac{1}{R_{\text{load}}C_o} + \frac{m_c D' - 0.5}{L_{o,\text{eq}} C_o f_{\text{eff}}}$, and $H_e(s)$ subharmonic double pole at $\pi f_{\text{eff}}$
- [ ] Support both **Op-Amp Type-II** and **OTA ($g_m$) Type-II** (`SLVA662` / `switchmode.io`) symmetric $k$-factor + ESR-pole synthesis, E96 resistor snapping, and exact Tustin `2P2Z` coefficients
- [ ] Update `transientOdeSolver.ts` with inner peak-current envelope + outer Type-II discrete 2P2Z loop and add dedicated unit tests in `dcdcSolver.test.ts`

### Task 40 — Zero-Key Live LCSC / JLCPCB Component Library & BOM Verification
- [ ] Add `GET /api/lcsc/search`, `GET /api/lcsc/part/:lcscCode`, and `POST /api/lcsc/verify-bom` in `server.ts` proxying `jlcsearch.tscircuit.com` + `wmsc.lcsc.com` with TTL caching and rate-limit spacing (zero AI key required)
- [ ] Auto-map live LCSC parametric attributes (`paramVOList`) into `SemiconductorSpec` / passive ratings with live stock, `Basic` vs `Extended ($3 fee)` badges, price breaks (`1/10/100/1000`), and direct PDF datasheet links
- [ ] Persist equipped/custom LCSC parts in `localStorage` and export JLCPCB-compliant BOM CSV (`Comment,Designator,Footprint,LCSC Part #`)

### Task 41 — Full Verification & Visual Quality Gate
- [ ] Pass `npm run lint`, all `tsx --test` suites (including PCMC+Type-II & live LCSC mapper tests), `npm run build`, and live preview inspection in both Light & Dark modes

---

## Immediate Execution Queue (Completed This Milestone)

The following high-impact tasks were implemented and verified across all 6 dimensions:
- [x] **Audit & Plan**: Inspect entire 48.7k-line codebase, run baseline tests/lint, write complete `plain.md` and 6 deep-dive blueprints in `docs/`
- [x] **AI & Agent (Task 27 & 28)**: Fix `buildAiDesignSnapshot({ compactForChat: true })` so Test 13 passes cleanly (< 45% of full snapshot bytes) + add snapshot byte telemetry & 1-click focused audit presets in `AiEngineerDrawer.tsx`
- [x] **Logic & Architecture (Task 11 & 12)**: Implement `src/engine/systemCascadeEngine.ts` (2-stage AC-DC ↔ DC-DC bus/efficiency/power coupling) and `src/engine/projectStorage.ts` (versioned JSON import/export, `localStorage` project slots, Undo/Redo stack)
- [x] **Calculation & Modeling (Task 14, 15, 31, 32, 33)**: Upgrade multi-channel `evalFullWaveforms` in `dcdcEngine.ts`, build `transientOdeSolver.ts` (RK4 closed-loop step-load/startup), build `monteCarloEngine.ts` (seeded tolerance yield), and build `spiceNetlistExporter.ts` (LTspice/ngspice `.cir` + C2000/STM32 `.h` firmware header)
- [x] **Design, GUI & Graph Tools (Task 19, 23, 24, 34)**: Build `OscilloscopeViewer.tsx` (6-channel scope + M1/M2 RMS/pk-pk/dY/dt cursors + CSV/SVG export), build `TransientAndMonteCarloLab.tsx` (`"Scope & Sim"` tab in `DcDcWorkbench.tsx`), add Undo/Redo + Stage Link + Project Manager/Import JSON/SPICE export to `src/App.tsx`
- [x] **Verification**: Expand unit tests in `src/engine/dcdcSolver.test.ts` (18/18 passing), pass `npm run lint`, and pass `npm run build`
