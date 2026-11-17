# Power Electronics Studio — Engineering Accuracy, Stability & Multi-Provider AI Master Plan

> Living engineering checklist. Every task is checked (`[x]`) immediately upon completion and verification.

---

## Baseline & Environment Setup (Completed Prior)
- [x] Migrate project dependencies & dev server from Bun to Node.js 22 + npm (`/.env.example`, remove `/bun.lock`, configure `server.ts` on `0.0.0.0:3000`)
- [x] Complete full-codebase engineering audit across `dcdcEngine.ts`, `autoOptimizer.ts`, `designAlerts.ts`, `designFixSynthesizer.ts`, `databases.ts`, `designReportModel.ts`, `pdfReportBuilder.ts`, `SmallSignalDashboard.tsx`, `AiProviderSettingsPanel.tsx`, and `server.ts`
- [x] Run baseline test suite (`npx tsx --test src/engine/dcdcSolver.test.ts`) to capture exact initial failures (3 failures: PC95 `PQ50/50` core loss, `Auto-Optimizer` retaining `EE70/33/32` at 7.1% utilization, and `dcdc-core-oversized` 1-click compact core fix returning empty)

---

## Task 1 — Steinmetz iGSE & Thermal `Pcore` Model Calibration (`dcdcEngine.ts`, `databases.ts`)
- [x] Verify TDK `PC95` flat-temperature Steinmetz parabolic coefficient (`tempCoeff_c2`, `T_opt_C`) against real TDK PC95 datasheet behavior (`25–120°C` flat curve) so solved `Pcore_se_W` on `PQ50/50` (`100 kHz`, `73.2 mT`, `Np=30/Ns=5`) matches physical `~4.68–6.5 W` without artificial thermal runaway distortion
- [x] Audit primary RMS current circulating factor `Ipri_rms_A` in `dcdcEngine.ts` (`sqrt(Deff + (1 - Deff) * 0.72) * 1.02` vs hardcoded `1.09` and FHA RMS for LLC) so primary copper loss `Pcu_pri` reflects actual PSFB/LLC conduction duty and freewheeling decay
- [x] Re-run `npx tsx --test src/engine/dcdcSolver.test.ts` and confirm Test 1 (`Steinmetz iGSE: TDK PC95 PQ 50/50`) passes cleanly

---

## Task 2 — Turns Ratio Sync, Duty Loss, Low-Line Envelope & Secondary Ringing Math (`dcdcEngine.ts`)
- [x] Add worst-case low-line (`Vin_min_V`) duty computation (`Deff_max`, `Dloss_max`, `D_applied_max`) and subharmonic quality factor (`Qp_subharmonic_wc`, `slopeStable_wc`, `mc_min_recommended`) to `DcDcResults` in `dcdcEngine.ts`
- [x] Audit center-tapped vs full-bridge vs current-doubler secondary RMS currents, `Vsec_ideal_max_V`, and `Vsec_unclamped_pk_V` across all 4 DC-DC topologies (`psfb-1ph`, `psfb-2ph`, `llc-fb`, `llc-hb`)
- [x] Ensure integer turns (`Np_turns / Ns_turns`) and `turnsRatio_n` remain 100% locked in sync across manual edits, optimizer passes, and solver outputs

---

## Task 3 — Control Loop Compensator RC Scaling, Crossover Frequency & Type-II vs Type-III Accuracy (`dcdcEngine.ts`, `SmallSignalDashboard.tsx`)
- [x] Harden analog op-amp compensator impedance scaling in `dcdcEngine.ts` so across all control modes (`pcmc`, `2p2z`, `type-iii`, `acmc`, `cascaded-pi`, `charge-control`, `mpc`) and wide `fc_target_kHz` / `Vout_V` ranges: `R1 >= 4.7 kΩ`, `R2` stays in `10–220 kΩ`, `C1 <= 47 nF` (C0G/NP0 friendly), and `C2 >= 15 pF` while preserving exact `fz1/fp1`
- [x] Fix `dspCode` generator bug in `dcdcEngine.ts` so PCMC slope ramp comment (`Se`, `mc`, `Qp`) is emitted ONLY when `controlType === 'pcmc'` (not for `2p2z`, `acmc`, `cascaded-pi`, `charge-control`, or `mpc`)
- [x] Update `SmallSignalDashboard.tsx` synthesized compensator card so `R3`, `C3`, `f_z2`, and `f_p2` clearly indicate `N/A (2P2Z)` when `!dcdcRes.isTwoZeroComp` (matching Type-II vs Type-III topology accurately)

---

## Task 4 — Auto-Optimizer & 1-Click Compact Core Fix Synthesizer (`autoOptimizer.ts`, `designFixSynthesizer.ts`)
- [x] Fix `maxWindowSec` in `autoOptimizer.ts` & `designFixSynthesizer.ts` to account for center-tapped doubled secondary windings (`isCT ? 2 : 1`) so secondary strand sizing does not overflow compact core windows (`PQ 50/50`, `ETD 59`, `EE 55/28/21`, `ETD 49`)
- [x] Improve `autoOptimizer.ts` transformer search (`turnPairs`, `secTryVariants`, `interleaveModes`, actual Steinmetz material selection, and `Ap_req` candidate filtering) and scoring penalty so compact cores (`utilization_100C_pct >= 12%`) consistently beat oversized `EE 70/33/32` at both `100 kHz` and `200 kHz` for `center-tapped` and `full-bridge`
- [x] Upgrade `autoOptimizer.ts` secondary MOSFET selector and control tuning:
  - [x] Select `200 V` SR (`IPP110N20N3` / `BSC160N20NSFD`) whenever `150 V` devices lack sufficient unclamped ringing margin (`Vsec_unclamped_pk_V > 0.88 * Vds_max`), adjusting `nParallelSec` appropriately
  - [x] Auto-tune `slopeFactor_mc` against **worst-case low-line** `D'_min` so `Qp_subharmonic_wc <= 1.20` and `Qp_subharmonic <= 1.20`
  - [x] Keep unlocked `fc_target_kHz >= max(5.0, 2.2 * f0_lc_kHz)` (safely capped below `fsw / 6.5`) with a closed-loop PM/GM guard so crossover never collapses onto `f_0`
- [x] Fix `synthesizeDcdcCompactCoreFixes` in `designFixSynthesizer.ts` to sweep multiple strand counts, Litz AWGs, interleaving modes (`full-interleaved`, `split-pri`), and turn pairs so valid 1-click compact core fixes are always synthesized when `dcdc-core-oversized` triggers

---

## Task 5 — Design Alerts & Engineering Report / PDF Final Audit Synchronization (`designAlerts.ts`, `designReportModel.ts`, `pdfReportBuilder.ts`, `DesignReportModal.tsx`)
- [x] Harden `evaluateDesignAlerts` in `designAlerts.ts`:
  - [x] Audit PCMC subharmonic stability at BOTH nominal `Vin_nom_V` and worst-case low-line `Vin_min_V` (`Qp_subharmonic_wc > 2.0` -> Danger, `> 1.5` -> Warning) and synthesize worst-case-safe 1-click `dcdc-pcmc-slope` fixes
  - [x] Tighten `dcdc-core-oversized` detection (`utilization_100C_pct < 14 && Pcu_W > 3.0 * Math.max(0.25, Pcore_W) && Pcu_W > 2.2 && core.Ve_mm3 >= 35000`) with reliable compact-core fixes
  - [x] Ensure `dcdc-ctrl-fc-near-f0` catches `fc_target_kHz < Math.max(f0_lc_kHz * 1.45, f0_lc_kHz + 0.4)` cleanly and offers 1-click retune
  - [x] Add low-line duty saturation warning/danger (`D_applied_max > 0.94`) if `Vin_min_V` risks dropout
  - [x] Ensure `dcdc-sec-vds-warn` triggers reliably when unclamped secondary ringing > 88% of `secDevice.Vds_max_V` and offers `200 V` `IPP110N20N3` upgrade fixes
- [x] Fix `designReportModel.ts`:
  - [x] Fix Step `D1.2` LaTeX and `formulaPlain` for `D_loss` (`4 L_lk I_pri,valley f_sw / V_in`, or `2` factor note for CDR) and display exact `D_eff`, `D_loss`, and low-line `D_applied(Vin_min)`
  - [x] Update `ch-dcdc-specs.status` dynamically (reflect secondary voltage / duty verdicts instead of hardcoded `'pass'`)
  - [x] Mark Table `D6.1` capacitors explicitly as C0G/NP0 dielectric and display worst-case `Q_p(Vin_min)` in Step `D6.1`
  - [x] Fix Page 9 `ch-audit` (`Final Engineering Audit & Hardware Sign-Off`) so it aggregates BOTH `scopedAlerts` AND any preceding chapter `warn`/`fail` status, adds an explicit Chapter-by-Chapter Sign-Off Verification Matrix in `steps` / `paramTables`, and guarantees zero silent regressions between Cover / Chapter verdicts / Page 9 Audit
- [x] Sync `pdfReportBuilder.ts` & `DesignReportModal.tsx` so Cover badges and Page 9 Audit table reflect aggregated chapter/alert statuses consistently

---

## Task 6 — Audit & Upgrade Built-In Presets (`src/data/databases.ts`)
- [x] Upgrade `DCDC_PRESETS[0]` (`3.3 kW PSFB Sync Rectifier Center-Tapped`) from `IPP041N15N5` (150 V) to `IPP110N20N3` (200 V, `nParallelSec: 2`) so the default boot preset has clean unclamped secondary margin and `0 Danger / 0 Warning`
- [x] Audit all remaining `DCDC_PRESETS` (1–3) and `ACDC_PRESETS` (0–4) via `solve` + `evaluateDesignAlerts` to ensure every built-in preset solves cleanly with zero unintended violations

---

## Task 7 — Multi-Provider AI API Key Experience & Proxy Hardening (`App.tsx`, `server.ts`, `AiProviderSettingsPanel.tsx`)
- [x] Add a prominent, directly accessible `"AI Keys"` / Provider settings trigger + modal/popover in the top navigation bar (`src/App.tsx`) showing the active provider (`Gemini`, `OpenAI`, `Claude`, `OpenAI-Compatible`) and key status so users can configure any API key immediately without hunting inside sub-drawers
- [x] Harden `/api/ai-agent` & `/api/component-search` in `server.ts`:
  - [x] Handle OpenAI reasoning models (`o1`, `o3`, `o4-mini`, `gpt-5*`) cleanly by omitting unsupported `temperature` and automatically retrying without `response_format` on HTTP 400/422 for both `openai` and `openai-compatible`
  - [x] Ensure Anthropic Claude, Gemini (`@google/genai`), OpenAI, and OpenAI-Compatible custom endpoints return clear, actionable error messages on invalid/missing keys or rate limits
- [x] Ensure `aiProviderConfig.ts` keeps keys safely in browser `localStorage` (`voltcraft_ai_provider_config_v1`) and validates all 4 providers properly

---

## Task 8 — Test Suite Expansion & Full Build/Lint/Server Verification (`dcdcSolver.test.ts`)
- [x] Fix `ch-dcdc-passives` / `ch-dcdc-ctrl` chapter ID lookups in `dcdcSolver.test.ts` and add new automated unit tests covering:
  - [x] Worst-case low-line (`Vin_min_V`) PCMC subharmonic oscillation detection & 1-click fix
  - [x] Accurate `D_loss` & low-line duty saturation checks
  - [x] Page 9 `ch-audit` catching any chapter `warn`/`fail` even if alerts were missed
  - [x] All `DCDC_PRESETS` and `ACDC_PRESETS` producing 0 Danger alerts out-of-the-box
  - [x] Analog compensator C0G/NP0 RC bounds across `pcmc`, `2p2z`, `type-iii`, and `48V`/`400V` outputs
- [x] Run `npx tsx --test src/engine/dcdcSolver.test.ts` — verify 100% pass rate
- [x] Run `compile_applet` and `lint_applet` together and verify zero errors
- [x] Restart dev server (`restart_dev_server`) and inspect UI/startup cleanly
- [x] Mark all checkboxes in `/plain.md` as `[x]` upon completion

---

## Task 9 — Human-Readable KaTeX Mathematical Rendering in Generated PDF Report (`pdfReportBuilder.ts`, `mathTexHelper.ts`)
- [x] Build `calcStringToTex` helper to convert numerical substitutions, given inputs, and computed results cleanly into valid KaTeX LaTeX (proper subscripts, scientific notation $10^n$, square roots, fractions/operators, Greek letters $\eta, \Delta, \Omega, \mu, \phi, \theta$, degrees) with zero parse errors across all DC-DC & AC-DC report steps
- [x] Implement self-contained browser KaTeX-to-PNG rasterizer in `pdfReportBuilder.ts` (extracting live `.katex` CSS + inlining `@font-face` `.woff2` fonts as base64 data URIs inside XHTML-serialized SVG `<foreignObject>` -> 3× Retina PNG with automatic ASCII fallback)
- [x] Update Step calculation cards in `pdfReportBuilder.ts` to render Governing Equations (`st.tex`), Numerical Substitutions, Given Inputs, and Computed Results using crisp KaTeX math images instead of raw ASCII Courier text
- [x] Verify 100% of generated LaTeX strings across all presets pass strict KaTeX parsing in automated unit tests

---

## Task 10 — Fix AI Chat with User-Supplied Gemini API Keys (`server.ts`, `aiProviderConfig.ts`, `AiProviderSettingsPanel.tsx`, `AiEngineerDrawer.tsx`, `App.tsx`)
- [x] Fix Gemini model & parameter handling in `server.ts`:
  - [x] Only pass `thinkingConfig.thinkingLevel` on Gemini 3/4 models (never on `gemini-2.5-*` where it throws HTTP 400)
  - [x] Automatically fall back to `gemini-2.5-flash` when a user's personal Gemini API key receives 404/unsupported model on workspace aliases (`gemini-4-hydrogen` / `gemini-3.8-flash`), and retry without strict `responseSchema` if schema constraints reject a request
  - [x] Parse nested JSON error payloads from `@google/genai` into clean human-readable messages and require `replyMarkdown` in `/api/ai-agent` schema
- [x] Update `AiProviderSettingsPanel.tsx`, `AiEngineerDrawer.tsx`, and `App.tsx`:
  - [x] Include `gemini-2.5-flash` and `gemini-2.5-pro` in Gemini model chips alongside `gemini-4-hydrogen` and strip quotes/whitespace from pasted keys
  - [x] Filter prior error messages out of `chatHistory`, safely parse non-JSON HTTP error bodies, and auto-scroll chat messages when AI responses/errors arrive
- [x] Re-run unit tests, build + lint checks (`compile_applet` + `lint_applet`), restart dev server, and mark all Task 9 & 10 checkboxes `[x]` in `/plain.md`
