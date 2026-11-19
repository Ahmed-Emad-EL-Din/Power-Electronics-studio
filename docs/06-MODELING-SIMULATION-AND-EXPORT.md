# 06 — Modeling, Simulation & CAD/Firmware Export Blueprint

## 1. In-Browser RK4 Closed-Loop Switched ODE Simulator (`src/engine/transientOdeSolver.ts`)
Analytical small-signal Bode plots assume linearization around a single operating point. Real converters hit duty-cycle saturation, inductor slew-rate limits, and ESR zero transients during large load steps.
- **State Vector** $\mathbf{x}(t) = [i_{L_o}(t),\; v_{C_o}(t)]^T$ (with ESR decoupling $v_{\text{out}}(t) = v_{C_o}(t) + i_{C_o}(t) \cdot R_{\text{ESR}}$):
  $$\frac{di_{L_o}}{dt} = \frac{u_{\text{eff}}(t) \cdot V_{\text{sec,eff}} - v_{\text{out}}(t)}{L_o}, \qquad \frac{dv_{C_o}}{dt} = \frac{i_{L_o}(t) - i_{\text{load}}(t)}{C_o}$$
- **Digital Controller Integration**:
  - Sample $v_{\text{out}}[k]$ at `fs_digital_kHz` (`T_s = 1 / fs_digital`).
  - Execute exact Tustin `2P2Z` or `3P3Z` difference equation (`b0..b3`, `a1..a3`) from `dcdcEngine.ts` with anti-windup clamping `u ∈ [0.02, 0.95]`.
  - Apply effective duty loss reduction $D_{\text{eff}} = \max(0, u - 4 L_{lk} i_{L_o} f_{\text{sw}} / (n V_{\text{in}}))$ for PSFB!
- **Scenarios**:
  - **Load Step** ($I_{\text{init}} \to I_{\text{step}}$ at configurable $t_{\text{step}}$ and $di/dt$)
  - **Soft-Start Ramp** ($0 \to V_{\text{out}}$)
- **Measured KPIs**: Peak undershoot/overshoot ($\Delta V_{\text{mV}}$, $\%\Delta V$), 2% settling time ($t_{\text{settle},\mu\text{s}}$), peak inductor current ($I_{L_o,\text{pk}}$), and steady-state error.

---

## 2. SPICE Netlist Exporter (`src/engine/spiceNetlistExporter.ts`)
Generate authentic, simulation-ready `.cir` netlists compatible with **LTspice**, **ngspice**, and **PSpice**:
- **DC-DC PSFB (`psfb-1ph`, `psfb-2ph`)**:
  - `Vin` DC source + `C_in`
  - 4 behavioral voltage-controlled MOSFET switches (`SW_Q1..Q4`) driven by phase-shifted PWM `PULSE` sources with exact `deadTime_ns` and phase-shift `T_ps`
  - Primary leakage `L_lk`, magnetizing `L_m`, coupled transformer `L_pri / L_sec` (`K1 L_pri L_sec 0.9995`) with exact `L_pri / L_sec = (Np/Ns)^2`
  - Center-tapped / full-bridge / current-doubler secondary rectifier (`SW_SR` or `D_SR` with `Ron = Rds_on / nParallelSec`)
  - Output choke `L_o` + `R_DCR`, output capacitor `C_o` + `R_ESR`, and pulsed step-load `I_LOAD`
  - `.tran` + `.meas` statements for efficiency, $V_{\text{out}}$ ripple, and $I_{\text{pri,rms}}$
- **DC-DC LLC (`llc-fb`, `llc-hb`)**:
  - Half/full-bridge switching node, `Cr`, `Lr`, `Lm`, coupled transformer, secondary rectifier, `Co`/`ESR`.
- **AC-DC PFC (`2ph-interleaved-totem`, `1ph-totem-pfc`, `2ph-interleaved-boost`, `dual-boost-bridgeless`)**:
  - AC mains `SIN(0 Vpk f_line)`, DM/CM filter `Ldm/Cx/Lcm/Cy`, boost inductors `Lpfc1/Lpfc2`, high-frequency switches + slow line-rectifier switches, DC-link bulk cap `Cdc + ESR`, and resistive/power load.

---

## 3. Embedded DSP Control Header Export (`powerstage_control_cfg.h`)
Generate a drop-in C header for **TI C2000 (DCL/CLA)** and **STM32G4 (HRTIM)** containing:
- Exact pre-warped Tustin `2P2Z` or `3P3Z` float32 coefficients (`CTRL_B0..B3`, `CTRL_A1..A3`)
- Switching frequency, ISR frequency, dead-time in nanoseconds & ticks
- PCMC slope compensation `CTRL_PCMC_SE_V_US`, `CTRL_PCMC_MC`
- Voltage divider & current sense scaling macros + OVP / OCP trip limits
