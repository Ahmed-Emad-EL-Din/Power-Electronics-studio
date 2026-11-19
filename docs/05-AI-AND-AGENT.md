# 05 — AI Engineering Agent & Copilot Blueprint

## 1. Current AI Architecture
- `src/engine/aiAgentEngine.ts`: Builds full engineering telemetry snapshot (`buildAiDesignSnapshot`), validates every AI-proposed fix via deterministic `dryRunProposedFix` & `simulateSequentialSafeBatch`, and supports rollback snapshots.
- `src/engine/aiProviderConfig.ts`: Supports 4 providers (`gemini`, `openai`, `anthropic`, `openai-compatible`) stored in browser `localStorage`.
- `server.ts`: Proxies `/api/ai-agent` and `/api/component-search` with provider normalization, reasoning-model parameter handling, and Gemini fallback.
- `src/components/AiEngineerDrawer.tsx`: Docked right-hand drawer with `Fix Plan` and `Ask AI` tabs.

### Immediate Bug Identified
- In `aiAgentEngine.ts`, `buildAiDesignSnapshot(ctx, { compactForChat: true })` only compacted `catalogs` (reducing full snapshot `21,845 B` to `11,308 B`, which fails the `< 50%` test threshold `10,922 B` in Test 13!).
- **Fix**: In `compactForChat` mode, also trim verbose nested descriptions (`actionHint`, full `candidateFixes` arrays beyond IDs, verbose inductor/capacitor metadata, and redundant catalog strings) so chat snapshots drop cleanly to ~`6–8 KB` (`< 38%` of full snapshot) while preserving 100% of numerical KPIs and component IDs.

---

## 2. High-Impact Agentic Upgrades

### A. Focused Audit Presets & Context Telemetry (`AiEngineerDrawer.tsx`)
- Display live snapshot payload size (`KB` / `~tokens`) and active provider/model pill inside the drawer header.
- Add **1-Click Focused Audit Presets** in Chat/Plan mode:
  1. **Full Safety & Margin Audit** (all Danger + Warning alerts)
  2. **Thermal & Efficiency Boost** (reduce $T_j$, $P_{\text{sw}}$, $P_{\text{core}}$, $P_{\text{cu}}$)
  3. **ZVS & Ringing Hardening** (light-load ZVS boundary, dead-time, 200 V SR margin)
  4. **EMI & Capacitor Lifetime** ($L_{10}$ hours, $C_y$ leakage, DM/CM attenuation)
- Show **Parameter Diff Preview** (`key: old -> new`) directly inside each `AiStagedFix` card before the user clicks Apply.

### B. Deterministic What-If Trade-Off & Pareto Copilot
- Never trust an LLM's mental math for power electronics:
  - Every AI suggestion produces structured patches validated by `solveDcDcDesign` / `solveAcDcDesign` / `evaluateDesignAlerts`.
  - Extend `AiProposedFixRaw` to support multi-option trade-off bundles (e.g., *Option A: Lower Loss*, *Option B: Smaller Core*, *Option C: Lower Cost*) so engineers can compare deterministic solver outcomes side by side.

### C. Datasheet Text / Table Extractor
- Allow pasting raw datasheet excerpts (MOSFET $R_{ds(on)}, Q_g, Q_{rr}, C_{oss}$ or Ferrite Steinmetz $k, \alpha, \beta, B_{\text{sat}}$) into the AI provider/component drawer to parse and validate directly into `SemiconductorSpec` / `CoreMaterialSpec` entries.
