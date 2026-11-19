# 03 — Design, GUI & UX Blueprint

## 1. Precision Lab Shell & Top Navigation Enhancements
The top header bar (`src/App.tsx`) should give power engineers immediate access to critical workflow actions without clutter:
1. **Undo / Redo Stack**: Compact icon buttons + `Ctrl+Z` / `Ctrl+Shift+Z` shortcuts so accidental edits or aggressive Auto-Optimizer sweeps can be reverted instantaneously.
2. **Project Manager & Import/Export Menu**:
   - Save current workspace (both AC-DC + DC-DC + passive custom banks + system link flags) as a named project in `localStorage`.
   - Load, duplicate, or delete saved projects.
   - **Import JSON** from local file (supporting both full v2 projects and v1 single-stage exports).
   - **Export Bundle**: Full Project `.json`, SPICE Netlist `.cir`, Embedded C Header `.h`, and BOM `.csv`.
3. **System Cascade Link Strip**:
   - Slim, high-contrast telemetry strip directly beneath the header showing `AC-DC PFC ↔ DC-DC` coupling status.
   - 1-click toggle: `Link Bus V (Vdc → Vin)` and `Link Power (P_dcdc / η → P_pfc)`.
   - Live cascaded KPIs: `η_system (%)`, `P_loss_total (W)`, `I_ac_system (A rms)`, and thermal/hold-up status badge.

---

## 2. Workbench Sub-Tab Organization
- **DC-DC Workbench (`DcDcWorkbench.tsx`)**:
  - Keep existing 12 engineering tabs (`Schematic`, `Graphs & Caps`, `Thermal & FETs`, `Small-Signal`, `EMI Filter`, `Gate Drive`, `Winding 2D`, `OCP & Sense`, `All Inductors`, `All Capacitors`, `Core Saturation`, `Steinmetz iGSE`).
  - Add **`Scope & Sim`** sub-tab hosting:
    1. 4-Channel Virtual Oscilloscope (`OscilloscopeViewer`)
    2. RK4 Closed-Loop Step-Load Transient Simulator
    3. Monte Carlo Tolerance & Yield Analyzer
    4. Live SPICE `.cir` & Embedded C `.h` Exporter
- **AC-DC Workbench (`AcDcWorkbench.tsx`)**:
  - Add direct SPICE `.cir` PFC netlist export and stage-link indicator on bus voltage / output power inputs when coupled to DC-DC.

---

## 3. BOM Cost, Footprint & Interactive Schematic Probing
- **BOM Engine (`bomEngine.ts`)**: Roll up semiconductors, transformer core + bobbin + Litz wire, inductors, capacitor banks, and LCSC auxiliary ICs into a sortable table with `1 / 100 / 1000` qty pricing and CSV/KiCad export.
- **Interactive Schematic Probing**: Clicking any component in `CircuitSchematics.tsx` opens an inline quick-inspector card showing live stress (`Vds_pk`, `I_rms`, `Tj`, `P_loss`, margin %) and a button to jump directly to its design tab.
- **Sticky Executive KPI Strip**: Keep efficiency, max $T_j$, max $B_{\text{pk}}$, and phase margin pinned in a compact bar inside the workbench.
