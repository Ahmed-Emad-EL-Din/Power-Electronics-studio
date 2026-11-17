# VoltCraft Studio — Power Converter Design Studio

> **Notice:** This software is **proprietary and NOT free to use**. All rights are reserved by the copyright holder. See [`LICENSE`](./LICENSE) for full terms and licensing inquiries.

**VoltCraft Studio** (*Power Converter Design Studio*) is a full-stack electrical power engineering CAD workbench for designing, analyzing, and verifying **AC-DC Power Factor Correction (PFC)** front-ends, **Isolated DC-DC converters**, **high-frequency magnetics**, **electro-thermal semiconductor stages**, and **digital small-signal control loops**.

---

## Key Engineering Capabilities

### 1. AC-DC PFC Workbench (`AcDcWorkbench`)
- **Supported Topologies**:
  - 2-Phase Interleaved Totem-Pole PFC (`2ph-interleaved-totem`)
  - 1-Phase Bridgeless Totem-Pole PFC (`1ph-totem-pfc`)
  - 2-Phase Interleaved Diode-Bridge Boost PFC (`2ph-interleaved-boost`)
  - Dual-Boost Semi-Bridgeless PFC (`dual-boost-bridgeless`)
- **Analysis Modules**:
  - Line-angle waveform, ripple-cancellation factor ($k_{\text{cancel}}$), and phase-shedding evaluation
  - IEC 61000-3-2 harmonic spectrum compliance and zero-crossing current distortion analysis
  - DC-link capacitor bank sizing, $2f_{\text{line}}$ voltage ripple, hold-up time, and $L_{10}$ lifetime modeling
  - Inrush / pre-charge resistor stress, EMI common-mode/differential-mode filter & $C_y$ leakage sizing
  - Cascaded inner current loop ($f_{c,i}, \text{PM}_i$) and outer voltage loop ($f_{c,v}, \text{PM}_v$) Bode stability

### 2. Isolated DC-DC Converter Workbench (`DcDcWorkbench`)
- **Supported Topologies & Variants**:
  - Single-Phase & 2-Phase Interleaved Phase-Shifted Full-Bridge (`psfb-1ph`, `psfb-2ph`)
  - Full-Bridge & Half-Bridge LLC Resonant (`llc-fb`, `llc-hb`)
  - Secondary Windings: Center-Tapped, Full-Bridge, and Current-Doubler (`center-tapped`, `full-bridge`, `current-doubler`)
  - Rectification & Clamping: Synchronous FET vs. SiC Schottky Diode; Primary Diode Clamp, Active Clamp, and RC Snubber
- **Physics & Magnetics Solvers**:
  - Nonlinear $C_{\text{oss}}$ Zero-Voltage Switching (ZVS) energy & dead-time verification
  - **iGSE / Steinmetz** core loss modeling with custom Steinmetz override support
  - **Dowell** high-frequency AC winding resistance, skin/proximity effect, Litz-wire stranding, and winding-window cross-section visualization (`WindingWindowVisualizer`)
  - Jiles-Atherton / major & minor **B-H Loop** and DC-bias saturation inspection (`BhLoopVisualizer`, `MagneticSaturationPanel`)
  - **All-Inductors & All-Capacitors Designers** (`AllInductorsDesigner`, `AllCapacitorsDesigner`) for stage-wide passive optimization
  - Gate-drive switching transient & ringing check (`GateDriveAnalysisPanel`) and current-sense/OCP protection analysis (`ProtectionCurrentSensePanel`)

### 3. Small-Signal & Digital Control Lab (`SmallSignalDashboard`)
- Compensator architectures: `2p2z`, `type-iii`, `pcmc`, `acmc`, `cascaded-pi`, `charge-control`, and `mpc`
- Open-loop plant, compensator, and total loop Bode magnitude/phase plots with crossover frequency ($f_c$), phase margin ($\text{PM}$), gain margin ($\text{GM}$), and subharmonic peaking ($Q_p$)
- Interactive pole-zero sandbox, step-load transient response, Nyquist contour, and auto-generated **DSP C-code** (`2P2Z` / `3P3Z` digital filter coefficients)

### 4. Electro-Thermal & LCSC / JLCPCB Component Grounding (`ComponentSearchDrawer`)
- Built-in semiconductor, ferrite core, core material, and passive capacitor catalogs (`src/data/databases.ts`, `src/data/passiveDatabase.ts`)
- Real-time junction temperature ($T_j$), heatsink/TIM thermal derating, and benchmark FOM comparisons
- Server-side `/api/component-search` endpoint powered by **Gemini + Google Search Grounding** to pull real datasheet specs, LCSC C-numbers, JLCPCB assembly classifications, and distributor references

### 5. Automated Design Alerts, Auto-Optimizer & AI Verification Agent (`AiEngineerDrawer`)
- Continuous safety & margin evaluation (`evaluateDesignAlerts`) with direct UI jump-to-section and 1-click corrective fixes (`designFixSynthesizer.ts`)
- Lock-aware parametric auto-optimizer (`autoOptimizer.ts`) with pinned reference curve overlays
- Server-side `/api/ai-agent` design verification assistant that audits live converter telemetry, proposes non-redundant staged patches with coupling trade-offs, supports batch rollback, and runs post-apply verification passes

### 6. Textbook-Style Engineering Report & PDF Export (`DesignReportModal`)
- Structured multi-chapter design report with table of contents, KaTeX symbolic derivations, substituted engineering calculations, SVG charts (`ReportSvgCharts`), and downloadable PDF export via `jspdf`

---

## Tech Stack

| Layer | Technologies |
|---|---|
| **Frontend** | React 19, TypeScript, Vite 8, Tailwind CSS v4, Lucide Icons, KaTeX, Recharts, Motion |
| **Backend** | Node.js, Express 4, `tsx`, `@google/genai` (server-side Gemini API & Search Grounding) |
| **Reporting** | `jspdf`, custom SVG vector chart generators, KaTeX math rendering |

---

## Repository Structure

```text
├── server.ts                        # Express server + Vite dev middleware + /api/component-search & /api/ai-agent
├── index.html                       # Application HTML entry point
├── metadata.json                    # App metadata & server-side Gemini capability declaration
├── package.json                     # Dependencies and npm scripts
├── .env.example                     # Environment variable template
├── LICENSE                          # Proprietary license (All Rights Reserved)
├── antigravity-desktop-roadmap/     # Architecture roadmap & prompts for future Tauri v2 + Rust desktop build
└── src/
    ├── App.tsx                      # Root workbench shell, alert center, AI agent drawer, report & part modals
    ├── data/                        # Semiconductor, core, material, and passive component databases
    ├── engine/                      # AC-DC, DC-DC, magnetics, passive, auto-optimizer, alert, and AI agent engines
    ├── components/                  # Workbenches, schematic views, Bode/BH/thermal visualizers, report UI
    └── utils/                       # Design report model & PDF report builder
```

---

## Getting Started (Authorized Licensees Only)

### Prerequisites
- **Node.js** 22+ and **npm**
- A valid `GEMINI_API_KEY` (required only for the AI Verification Agent and Live Component Search endpoints)

### Installation

```bash
npm install
```

### Environment Configuration

Copy `.env.example` to `.env` and populate your key:

```env
GEMINI_API_KEY=your_gemini_api_key_here
DISABLE_HMR=true
```

### Running the Application

- **Development Server** (Express + Vite middleware on port `3000`):
  ```bash
  npm run dev
  ```
- **Production Build & Start**:
  ```bash
  npm run build
  NODE_ENV=production npm start
  ```
- **Type Check**:
  ```bash
  npm run lint
  ```

---

## License & Copyright

**Copyright (c) 2026 Ahmed Emad El-Din. All Rights Reserved.**

This software is **NOT open-source** and **NOT free to use**. Unauthorized copying, execution, modification, redistribution, reverse engineering, or commercial/non-commercial use without a signed written license agreement from the copyright holder is strictly prohibited.

For licensing inquiries, contact: **mr.electron1915@gmail.com**
