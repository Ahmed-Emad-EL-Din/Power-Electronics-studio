# 07 — Studio UI, Workflow Organization, Graph Consolidation, PCMC + Type-II & Live LCSC Upgrade Plan

> **Purpose:** Complete, deep engineering plan covering UI/color professionalism, logical tool placement, elimination of repeated graphs, graph interactivity & accuracy, **PCMC + Compensator Type-II** control theory & implementation, and a **zero-key live LCSC / JLCPCB component library**.
>
> **Skills Applied (`.agents/skills/`):**
> - [`precision-lab-ui`](../.agents/skills/precision-lab-ui/SKILL.md) — Synthesized from `anthropics/skills/frontend-design`, `vercel-labs/agent-skills/web-design-guidelines`, `Leonxlnx/taste-skill`, and `nextlevelbuilder/ui-ux-pro-max-skill`.
> - [`lcsc-live-sourcing`](../.agents/skills/lcsc-live-sourcing/SKILL.md) — Synthesized from `tscircuit/jlcsearch` and `hashgraph-online/awesome-codex-plugins` (`aklofas/kicad-happy` `lcsc`, `jlcpcb`, `bom`).
> - [`pcmc-type2-control`](../.agents/skills/pcmc-type2-control/SKILL.md) — Synthesized from R. B. Ridley (1990), TI `SLVA662`, TI `SPRABE7A`, NXP `AN4716`, and `switchmode.io`.

---

## 1. Professional UI Style, Semantic Color System & Typography

### 1.1 Audit of Current Visual Weaknesses
1. **Fragmented Dark Hexes & CSS Hacks (`src/index.css`, `src/App.tsx`, workbenches)**:
   - Currently the codebase mixes 8 different dark backgrounds (`#090C12`, `#0D1119`, `#0E131D`, `#131A26`, `#111827`, `#0B0E17`, `#07090E`, `bg-slate-900`) and relies on 120 lines of low-specificity `:where(html:not(.dark))` CSS overrides in `src/index.css` to force light mode onto hardcoded dark classes.
2. **Oversaturated / Competing Accents**:
   - Buttons and status badges simultaneously use bright `cyan-600`, `emerald-600`, `indigo-600`, `purple-400`, `amber-500`, and `rose-500` in close proximity, diluting visual hierarchy between primary CTAs, electrical channel colors, and safety alerts.
3. **Typography & Alignment Drift**:
   - Several KPI cards and table cells omit `tabular-nums`, and mixed border radii (`rounded`, `rounded-md`, `rounded-lg`) create inconsistent framing.

### 1.2 Target "Precision Bench Instrument" Design System
Inspired by **Keysight PathWave / Rohde & Schwarz / Altium / Linear** (Cockpit Density 8–9): calm neutral surfaces where **color strictly encodes electrical signal or safety state**.

| Semantic CSS Token | Light Mode ("Architectural CAD Sheet") | Dark Mode ("Lab Bench Graphite") | Usage Role |
| --- | --- | --- | --- |
| `--bg-canvas` | `#F4F6F9` | `#0B0F17` | App shell backdrop (no pure `#FFFFFF` / `#000000` glare) |
| `--bg-panel` | `#FFFFFF` | `#111722` | Primary cards, workbench panels, sidebars |
| `--bg-elevated` | `#F8FAFC` | `#171F2E` | Toolbars, table headers, popovers, active tabs |
| `--bg-inset` | `#EEF2F6` | `#090D14` | Input wells, schematic/scope wells, code blocks |
| `--border-hairline` | `#DCE3EC` | `#1F293B` | `1px` structural panel & cell dividers |
| `--border-strong` | `#B8C4D4` | `#324158` | Interactive control borders & focus tracks |
| `--text-primary` | `#0F172A` | `#E6EDF7` | Headings, active values, primary labels (`>= 12:1` contrast) |
| `--text-secondary` | `#334155` | `#A3B3C9` | Body labels, axis labels, table descriptions |
| `--text-muted` | `#64748B` | `#6B7D96` | Units, hints, secondary metadata (`>= 4.5:1` contrast) |
| `--accent-brand` | `#0284C7` | `#22D3EE` | Active tab, primary CTA, focus ring, nominal marker |
| `--accent-brand-subtle` | `rgba(2,132,199,0.10)` | `rgba(34,211,238,0.12)` | Selected control pill & active nav indicator |
| `--status-pass` | `#059669` | `#34D399` | Safe margins, ZVS achieved, verified pass |
| `--status-warn` | `#D97706` | `#FBBF24` | Tight margin warning, thermal/duty advisory |
| `--status-danger` | `#DC2626` | `#F87171` | Saturation, SOA/voltage violation, unstable loop |

#### Dedicated Waveform & Channel Palette (Colorblind-Safe, High-Contrast on Both Themes)
- **CH1 (`v_pri` / Primary Voltage)**: `#0EA5E9` (Sky Blue)
- **CH2 (`i_pri` / Primary Current)**: `#F59E0B` (Instrument Amber)
- **CH3 (`v_sec` / Secondary Voltage)**: `#10B981` (Signal Emerald)
- **CH4 (`i_lo` / Output Inductor Current)**: `#A855F7` (Trace Violet)
- **CH5 (`i_lm` / Magnetizing Current)**: `#EC4899` (Magenta)
- **CH6 (`v_cr` / Resonant Cap Voltage)**: `#6366F1` (Indigo)
- **Pinned Reference Overlay**: Dashed `#94A3B8` (`opacity: 0.65`) — immediately distinguishable from live traces.

#### Refactoring Rules (`src/index.css` & Components)
1. Replace all hardcoded dark hex classes (`bg-[#111827]`, `bg-[#0E131D]`, `bg-[#0B0E17]`, etc.) across components with semantic utility classes (`bg-panel`, `bg-canvas`, `bg-inset`, `border-hairline`) backed by CSS variables in `src/index.css`.
2. Delete the brittle `:where(html:not(.dark))` regex-style hex override block once components consume semantic tokens directly.
3. Enforce `IBM Plex Sans` for UI copy and `IBM Plex Mono` (`font-variant-numeric: tabular-nums`) for every numeric KPI, cursor readout, table value, and form input.
4. Enforce `vercel-labs/web-design-guidelines`: `aria-label` on all icon buttons, `focus-visible:outline-2`, `overscroll-behavior: contain` on drawers/modals, no `transition: all` (explicit `transition-colors` / `transition-transform`), and `prefers-reduced-motion` support.

---

## 2. Workspace Organization & Tool Placement (Make Every Tool Live Where It Belongs)

### 2.1 Audit of Current Clutter (`src/App.tsx` + Workbenches)
- **Header Overload (`App.tsx`)**: Zone 3 currently packs 12 controls (`Danger`, `Warning`, `AI Keys`, `AI Agent`, `Generate Report`, `Component DB`, `Pin Ref`, `Undo`, `Redo`, `Projects`, `Export`, `Reset`, `Theme`) onto a single wrapping toolbar.
- **Misplaced Tools**:
  - `Component DB` is isolated in a top-bar button instead of being directly accessible from Switch/Inductor/Capacitor selection cards and BOM management.
  - `Small-Signal Lab` is a top-level tab *while* both `DcDcWorkbench` and `AcDcWorkbench` also embed their own `Control & DSP` sub-tabs — splitting a single engineering task across 3 locations.
  - `Projects` and `Export` and `SPICE/C-Header Export` live in 3 separate places (`Projects` modal, top-bar `Export`, and `Scope & Sim`).
  - `DcDcWorkbench` has **13 horizontal sub-tabs** and `AcDcWorkbench` has **10**, wrapping onto 2 rows on laptops.

### 2.2 Target Information Architecture (Clean 3-Zone Shell + Purpose-Aligned Workspaces)

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ [VoltCraft]  [Project: 3.3kW PSFB ▾] [↶] [↷] │  AC-DC PFC │ DC-DC Stage │ Control Lab │ Verification │ Parts & BOM  │  [● 0 Danger 1 Warn] [Pin] [AI] [Export ▾] [☀/☾] │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ Cascade Link Strip (contextual when linked): PFC 400V ──▶ DC-DC 48V/3.3kW · η_sys 95.8%│
├──────────────────────────┬─────────────────────────────────────────────────────────────┤
│ Left Design Spec &       │ Active Workspace Canvas                                     │
│ Parameters Rail          │   - Sticky 5-KPI Strip (η, Tj_max, Bpk/Bsat, PM, Cost/BOM)  │
│ (Collapsible 340px)      │   - Clean Single-Row Sub-Tabs (max 6–7, zero repetition)    │
│  • Preset + Auto-Solve   │   - Interactive Canvas / Schematics / Graphs                │
│  • Topology & Control    │                                                             │
│  • Locked Inputs         │                                                             │
└──────────────────────────┴─────────────────────────────────────────────────────────────┘
```

#### Where Each Tool Lives & Why
1. **Top Command Bar (Strictly 3 Focused Zones)**:
   - **Left (Project & History)**: Studio mark + **Project Pill** (click to open Project Slots, Save, Load, Import JSON, Reset) + **Undo / Redo** (`Ctrl+Z` / `Ctrl+Shift+Z`).
   - **Center (5 Engineering Workflow Workspaces)**:
     1. `AC-DC PFC` — Front-end rectifier/PFC power stage, harmonics/ZCD, inrush, PFC magnetics & DC-link.
     2. `DC-DC Stage` — Isolated converter (`PSFB` / `LLC`), schematic, ZVS/tank, electro-thermal, magnetics, passives.
     3. `Control & Stability` — **Unified** small-signal workbench (`SmallSignalDashboard`) covering DC-DC (`PCMC + Type-II`, `2P2Z`, `Type-III`, `ACMC`) & AC-DC inner/outer loops, Bode, Nyquist, s-plane, and live C/DSP code.
     4. `Scope & Verification` — 6-channel Virtual Oscilloscope, RK4 step-load transient ODE, Monte Carlo yield/tornado sensitivity, and SPICE `.cir` inspection.
     5. `Parts, LCSC & BOM` — Live LCSC/JLCPCB search + Datasheet/Stock/Price checker + Full Converter BOM Cost/Area Rollup + Engineering Report/PDF generator.
   - **Right (Global Diagnostics & Output)**:
     - **Alerts Pill** (`Danger` / `Warning` popover with 1-click fixes & direct tab jumps)
     - **Pin Ref** (baseline comparison toggle)
     - **AI Copilot** (drawer containing AI Keys settings inside its header gear — removing the redundant top-bar `AI Keys` button)
     - **Export ▾** unified dropdown (`Project .json`, `SPICE .cir`, `Firmware .h`, `JLCPCB BOM .csv`, `Engineering PDF Report`) + **Theme Toggle**.
2. **Contextual Inline Triggers (Get the Tool Right Where You Need It)**:
   - Every MOSFET / Diode card in `DcDcWorkbench` & `AcDcWorkbench` gets a `"Swap from LCSC…"` button that opens `ComponentSearchDrawer` pre-filtered to that stage's voltage & role (`>= 1.5 × Vin`, `primary` or `secondary`).
   - Clicking a component on `CircuitSchematics.tsx` opens its quick-inspect card with direct jump to its sizing panel or LCSC replacement.

---

## 3. Eliminating Graph & Panel Repetition ("One Canonical Home")

### 3.1 Exact Duplication Audit & Consolidation Map

| Component / Graph | Currently Repeated In | Canonical New Home (Single Location) | Action |
| --- | --- | --- | --- |
| `EfficiencyLoadPowerChart` | `DcDcWorkbench` (`schematic` line 1648 **AND** `graphs` line 1672) | `DcDcWorkbench` → **Performance & ZVS** | Remove duplicate from `Schematic & Equations` (keep compact KPI summary + schematic + KaTeX equations only) |
| `GateDriveAnalysisPanel` | `DcDcWorkbench` (`thermal` line 2274 **AND** `gatedrive` line 2619) | `DcDcWorkbench` → **Thermal & Gate Drive** | Merge into one cohesive Thermal + Gate-Drive + SOA tab; remove standalone duplicate |
| `ProtectionCurrentSensePanel` | `DcDcWorkbench` (`control` line 2576 **AND** `protection` line 2638) | `DcDcWorkbench` → **Protection & EMI** (or `Control & Stability` PCMC sense section) | Single home in **Protection & EMI**; link from Control PCMC `Rsense` |
| `EmiFilterDesignAssistant` | `DcDcWorkbench` (`control` line 2568 **AND** `emi` line 2607) | `DcDcWorkbench` → **Protection & EMI** | Remove duplicate from `Control` (keep only Middlebrook $\Delta Z_{\text{MB}}$ check in `Control & Stability`) |
| `WindingWindowVisualizer` & `MagneticSaturationPanel` | `DcDcWorkbench` (`winding`, `saturation`, **AND** both inside `magnetics`!) | `DcDcWorkbench` → **Magnetics & Saturation** | Unify `iGSE Core Loss`, `B-H Loop`, `DC/AC Saturation`, and `2D Winding Window` into **one** structured Magnetics sub-tab with section anchors |
| `CapacitorBankAnalyzer` | `DcDcWorkbench` (`graphs` line 1871 **AND** `capacitors` line 2702) | `DcDcWorkbench` → **Inductors & Capacitors** | Remove duplicate from `graphs` |
| `BodeStabilityGraph` & Loop Charts | `DcDcWorkbench` (`control`) **AND** top-level `SmallSignalLab` | Top-level **`Control & Stability`** workspace | DC-DC `Control & DSP` tab links cleanly or embeds compact summary KPIs + jumps to `Control & Stability`, eliminating 2× redundant Bode/Nyquist renders |
| Switching Waveform Approximation | `DcDcWorkbench` (`graphs` InteractiveChart) **AND** `OscilloscopeViewer` (`scope-sim`) | **`Scope & Verification`** (`OscilloscopeViewer`) | Remove simplified duplicate waveform from `graphs`; keep `graphs` focused on sweeps (`Llk` ZVS curve, `Vin` gain curve, Efficiency vs Load) |

### 3.2 Resulting Sub-Tab Reduction (Zero Two-Row Wrapping)
- **DC-DC Stage (`DcDcWorkbench.tsx`)**: Reduced from **13 tabs → 6 focused tabs**:
  1. `Schematic & Equations` (CAD schematic + KaTeX table)
  2. `Efficiency & ZVS Tank` (`EfficiencyLoadPowerChart` + ZVS/Gain sweeps + tank tuning bar)
  3. `Thermal & Gate Drive` (Electro-thermal equilibrium + SOA derating + `GateDriveAnalysisPanel`)
  4. `Magnetics & Winding` (Unified iGSE + `BhLoopVisualizer` + `MagneticSaturationPanel` + `WindingWindowVisualizer`)
  5. `Passives (L & C)` (`AllInductorsDesigner` + `AllCapacitorsDesigner` + `CapacitorBankAnalyzer`)
  6. `EMI & Protection` (`EmiFilterDesignAssistant` + `ProtectionCurrentSensePanel`)
- *(Control & Bode move to the dedicated **`Control & Stability`** workspace; Oscilloscope, RK4 Transient, Monte Carlo, and SPICE `.cir` live in **`Scope & Verification`**.)*
- **AC-DC PFC (`AcDcWorkbench.tsx`)**: Reduced from **10 tabs → 6 focused tabs**:
  1. `Schematic & Variants`
  2. `Ripple, Hold-Up & Grid`
  3. `Harmonics & ZCD`
  4. `Magnetics & Passives` (`AllInductorsDesigner` + `AllCapacitorsDesigner` + PFC DC-bias saturation)
  5. `EMI & Inrush`
  6. `Efficiency & Thermal`

---

## 4. Making Every Graph Truly Interactive & Numerically Accurate

### 4.1 Fixing Current Bugs & Gaps in `InteractiveChart.tsx` & `BodeStabilityGraph.tsx`
1. **Preserve Pinned Reference Curves During Zoom/Pan (`InteractiveChart.tsx:246`)**:
   - Currently `if (!refData || isZoomedOrPanned) return null;` drops the pinned comparison curve whenever the user zooms in unless `refEvaluator` is supplied!
   - **Fix**: Filter `refData` to `[xMin, xMax]` when `isZoomedOrPanned && !refEvaluator`, and support `refEvaluator` across all dynamic sweep plots (`EfficiencyLoadPowerChart`, `BodeStabilityGraph`, `DcDcWorkbench` sweeps).
2. **Responsive Vector Coordinates (`ResizeObserver`)**:
   - Measure actual container width via `ResizeObserver` so SVG font sizes (`11px` mono), tick spacing, and crosshair hit targets never squash or stretch on narrow/wide viewports.
3. **Rich Direct-Manipulation Interactivity**:
   - **Scroll-Wheel / Trackpad Zoom** centered on pointer X (with `Ctrl/Cmd` or toggleable Zoom-Wheel lock so page scrolling isn't hijacked unexpectedly).
   - **Click-to-Apply Operating Point**: Every parametric sweep chart (`fsw` vs Efficiency/Loss, `Bpk` vs Core Loss, `Llk` vs ZVS Energy, `Rg` vs Loss/dv-dt) wires `onPointClick` so clicking any point updates the solver parameter directly (with Undo snapshot!).
   - **Synchronized Cross-Chart Cursor Bus**: Hovering `P_out` on Efficiency or `f` on Bode Magnitude highlights the exact same X-coordinate across stacked/paired charts in the active tab.
   - **Keyboard Precision Stepping**: Focusing a chart lets `←` / `→` step `M1` / `M2` cursors sample-by-sample, `[` / `]` switch active cursor, and `R` reset zoom.
   - **Interactive Legend Toggle**: Clicking a series pill toggles visibility with clear dimmed/strikethrough feedback while locking at least 1 active series.

### 4.2 Accuracy & Single-Source-of-Truth Verification
- All charts (`OscilloscopeViewer`, `InteractiveChart`, `BodeStabilityGraph`, `TransientAndMonteCarloLab`, `EfficiencyLoadPowerChart`) consume evaluators directly from `solveDcDcDesign()` / `solveAcDcDesign()` — zero duplicate math formulas inside React chart components.
- **Numerical Consistency Gate**: Automated test verifies `OscilloscopeViewer` `evalFullWaveforms` mean/RMS vs `Iout_phase_A` & `Im_pk_A` (`< 2.5%`), Bode crossover/PM interpolation vs `fc_actual_kHz` / `pm_actual_deg` (`< 0.5°`), and RK4 steady-state DC output vs `Vout_V`.

---

## 5. Adding Explicit `PCMC + Compensator Type-II` (`pcmc-type-ii`)

### 5.1 Engineering Gap in Current Code
- `src/data/databases.ts` currently separates `'2p2z'` (labeled Voltage-Mode in `SmallSignalDashboard.tsx:1305`) from `'pcmc'` (`"PCMC + Slope Se"`).
- `src/engine/dcdcEngine.ts` approximates PCMC DC gain with an arbitrary `0.65` constant (`(Rload / Rsense) * 0.65`) and omits:
  1. Ridley's exact current-loop DC gain reduction and pole shift due to `(m_c D' - 0.5)`,
  2. Effective current-sense gain referred to the output inductor ($R_i = R_{\text{sense}} / n$ for primary-side sensing vs direct $R_{\text{sense}}$ for secondary sensing),
  3. **OTA (Transconductance $g_m$) Type-II** synthesis alongside **Op-Amp Type-II** (TI `SLVA662` / `switchmode.io`),
  4. Symmetric $k$-factor boost placement ($f_z = f_c/k,\; f_p = \min(f_c \cdot k, f_{\text{esr}}, 0.45 f_{\text{sw}})$) vs explicit ESR-pole cancellation mode.

### 5.2 Exact Governing Equations to Implement
1. **Control Type & Options (`DcDcControlType`)**:
   - Add `'pcmc-type-ii'` (keeping `'pcmc'` as an alias so existing presets/JSON imports continue working identically) plus `compensatorImpl: 'opamp' | 'ota' | 'digital-2p2z'` and `otaGm_uS` (default `350 µS`, e.g., UCC28950 / TPS-class OTA).
2. **Ridley Exact PCMC Control-to-Output Plant (`dcdcEngine.ts`)**:
   - Effective inductor ripple frequency: $f_{\text{eff}} = 2 f_{\text{sw}}$ for full-wave secondary PSFB ($T_{s,\text{eff}} = 1 / f_{\text{eff}}$), $f_{\text{eff}} = f_{\text{sw}}$ for LLC/single-ended.
   - Effective current-sense gain: $R_i = R_{\text{sense}} / n$ (primary CT/shunt reflected to secondary inductor) and $m_c = 1 + S_e / S_n$.
   - Exact DC gain & low-frequency pole:
     $$H_{\text{dc}} = \frac{R_{\text{load}}}{R_i} \cdot \frac{1}{1 + \frac{R_{\text{load}} T_{s,\text{eff}}}{L_{o,\text{eq}}}\left(m_c D' - 0.5\right)}$$
     $$\omega_{p1} = \frac{1}{R_{\text{load}} C_o} + \frac{m_c D' - 0.5}{L_{o,\text{eq}} C_o f_{\text{eff}}}$$
   - Sample-and-hold subharmonic double pole at $\omega_n = \pi f_{\text{eff}}$:
     $$H_e(s) = \frac{1}{1 + \frac{s}{\omega_n Q_p} + \frac{s^2}{\omega_n^2}}, \qquad Q_p = \frac{1}{\pi (m_c D' - 0.5)}$$
   - Full plant transfer function:
     $$H_p(s) = H_{\text{dc}} \cdot \frac{1 + s/\omega_{z,\text{esr}}}{1 + s/\omega_{p1}} \cdot H_e(s)$$
3. **Type-II Compensator Synthesis (Op-Amp & OTA + Digital 2P2Z)**:
   - Required boost at crossover $f_c$: $\phi_{\text{boost}} = \text{PM}_{\text{target}} - \angle H_p(j\omega_c) - \angle e^{-j\omega_c T_d} - 90^\circ$.
   - Symmetric $k$-factor placement:
     $$k = \tan\!\left(45^\circ + \frac{\phi_{\text{boost}}}{2}\right), \qquad f_z = \frac{f_c}{k}, \qquad f_p = \min\!\left(f_c \cdot k,\; f_{\text{esr}},\; 0.45 f_{\text{sw}}\right)$$
   - Required compensator magnitude at $f_c$: $G = 1 / |H_p(j\omega_c)|$, with pole/zero correction $a = \sqrt{1 + (f_c/f_p)^2}$, $b = \sqrt{1 + (f_z/f_c)^2}$:
     - **Op-Amp Type-II** (`COMP`–`FB`): $R_2 = G R_1 \frac{f_p}{f_p - f_z} \frac{a}{b}$, $C_1 = \frac{1}{2\pi f_z R_2}$, $C_2 = C_1 \frac{f_z}{f_p - f_z}$.
     - **OTA ($g_m$) Type-II** (`COMP`–`GND`): $R_2 = G \frac{R_1 + R_4}{R_4 g_m} \frac{f_p}{f_p - f_z} \frac{a}{b}$, with the same $C_1, C_2$ formulas and $R_4$ set by reference voltage $V_{\text{ref}}$.
   - **Digital 2P2Z Mapping**: Pre-warped Tustin transform produces `b0, b1, b2, a1, a2` ($a_1 + a_2 = 1$) plus C ISR snippet including DAC slope ramp `Se_ramp_V_us` and peak current limit `Ipri_ocp_trip_A`.
4. **Closed-Loop RK4 ODE Integration (`transientOdeSolver.ts`)**:
   - When `controlType === 'pcmc' || 'pcmc-type-ii'`, run inner peak-current envelope (`i_L_cmd = clamp(v_c / R_i - Se * D_eff * Ts, 0, I_lim)`) driven by the outer Type-II discrete 2P2Z integrator + zero/pole state, accurately reproducing PCMC's fast single-pole load-step response!

---

## 6. Truly Live LCSC / JLCPCB Component Library

### 6.1 Audit of Current Gap (`server.ts` & `ComponentSearchDrawer.tsx`)
- Currently `/api/component-search` requires a user-supplied LLM API key and asks an AI model to generate LCSC C-numbers, stock counts, and unit prices — which **blocks searching without an AI key** and risks stale or hallucinated stock/pricing.

### 6.2 Zero-Key Live Architecture (`jlcsearch` + LCSC Direct API)

```
Browser (Parts & BOM / Inline Picker)
   │  (No AI Key Required)
   ├── GET /api/lcsc/search?q=...&category=...&basicOnly=...&inStock=...
   ├── GET /api/lcsc/part/:lcscCode           (e.g. C2904521)
   └── POST /api/lcsc/verify-bom              (batch stock/price check for active BOM)
   ▼
Express Proxy (`server.ts` — TTL Cache + 400ms Rate Limiter)
   ├── Discovery:  https://jlcsearch.tscircuit.com/api/search & /{category}/list.json
   ├── Enrichment: https://wmsc.lcsc.com/ftps/wm/product/detail?productCode=Cxxxxx
   └── Optional AI Fallback (only if user clicks "Extract Missing Switching Specs from PDF")
```

#### Backend Proxy Endpoints (`server.ts`)
1. **`GET /api/lcsc/search`**:
   - Supports `q`, `category` (`all`, `mosfets`, `diodes`, `capacitors`, `inductors`, `resistors`, `voltage_regulators`, `microcontrollers`), `package`, `basicOnly`, `inStock`, `limit`.
   - Calls `jlcsearch.tscircuit.com` (`/api/search` for keyword search, or `/{category}/list.json` for parametric search).
   - If query matches exact LCSC C-number (`/^C\d{4,}$/i`) and `jlcsearch` returns 0 rows, automatically falls back to `wmsc.lcsc.com/ftps/wm/product/detail`.
   - In-memory TTL cache: **5 minutes** for search/stock queries, **24 hours** for static attributes, with polite `>= 400 ms` upstream spacing.
2. **`GET /api/lcsc/part/:lcscCode`**:
   - Queries `https://wmsc.lcsc.com/ftps/wm/product/detail?productCode=C...`.
   - Returns normalized live data:
     - `lcscPartNumber`, `mfr` (`productModel`), `manufacturer` (`brandNameEn`), `packageType` (`encapStandard`)
     - `datasheetUrl` (`pdfUrl` on `wmsc.lcsc.com`), `lcscStock` (`stockNumber`)
     - `priceBreaks[]` (`qty`, `usdPrice` from `productPriceList`)
     - `attributes` parsed from `paramVOList[]` (`Vds`, `Id`, `Rds_on`, `Qg`, `Coss`, `Vsd`, `RthJC`, capacitance, voltage rating, ESR, tolerance, inductance, Isat, DCR).
   - Auto-maps parsed semiconductor parameters into `SemiconductorSpec` (`mappedSpec` + `missingDynamicFields[]` flag if `Coss_tr_pF` / `Qrr_nC` / `tr_ns` had to be estimated from tech heuristics, with optional `"AI Enrich from Datasheet"` action if the user has an AI key configured).
3. **`POST /api/lcsc/verify-bom`**:
   - Batch-checks active BOM LCSC numbers against `wmsc.lcsc.com` (capped + cached) to display live stock status (`In Stock`, `Low Stock < 50`, `Out of Stock`), `Basic` vs `Extended ($3 feeder fee)` badge, and `1 / 100 / 1000` unit cost rollup.

#### Frontend UX (`Parts, LCSC & BOM` Workspace + Inline Pickers)
- **Instant Live Search**: Works out-of-the-box with zero API keys; shows live stock counts, JLCPCB Basic/Preferred/Extended badges, tiered pricing, package filter, and 1-click **"Datasheet PDF"** link.
- **Persistent Custom Library**: Any live LCSC part equipped or edited is persisted in `localStorage` (`voltcraft_custom_lcsc_parts_v1`) so custom parts survive page reloads and project JSON exports.
- **JLCPCB Production BOM Export**: Generates exact JLCPCB-compliant CSV (`Comment,Designator,Footprint,LCSC Part #,Manufacturer,MPN,Stock,Unit Price,Feeder Class`) alongside KiCad BOM format.

---

## 7. Implementation Execution Order (Tasks 36–41 in `plain.md`)

1. **Task 36 — Precision UI Color Tokens & CSS Refactor** (`src/index.css`, `index.html`, component token migration)
2. **Task 37 — Shell Reorganization & Graph/Panel Deduplication** (`src/App.tsx`, `DcDcWorkbench.tsx`, `AcDcWorkbench.tsx`, `SmallSignalDashboard.tsx`)
3. **Task 38 — Interactive & Accurate Graphing Engine Upgrade** (`InteractiveChart.tsx`, `BodeStabilityGraph.tsx`, `EfficiencyLoadPowerChart.tsx`, `OscilloscopeViewer.tsx`)
4. **Task 39 — `PCMC + Compensator Type-II` Solver, Op-Amp/OTA Synthesis & ODE Integration** (`databases.ts`, `dcdcEngine.ts`, `transientOdeSolver.ts`, `SmallSignalDashboard.tsx`, `dcdcSolver.test.ts`)
5. **Task 40 — Zero-Key Live LCSC / JLCPCB Component Library & BOM Verification** (`server.ts`, `ComponentSearchDrawer.tsx`, `bomEngine.ts`)
6. **Task 41 — Full End-to-End Verification** (`tsc --noEmit`, unit tests, `vite build`, live Light/Dark visual inspection via preview server)
