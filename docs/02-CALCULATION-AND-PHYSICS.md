# 02 — Calculation & Physics Blueprint

## 1. Multi-Channel Switching Cycle Waveform Physics
Currently `evalWaveforms` in `dcdcEngine.ts` provides a simplified 2-channel approximation (`i_pri`, `i_lo`). Upgrade to full 6-channel physically accurate time-domain reconstruction:
- **PSFB (`psfb-1ph`, `psfb-2ph`)**:
  - `v_pri_V(t)`: Bipolar quasi-square wave $\pm V_{\text{in}}$ during active overlap, finite resonant $C_{\text{oss}}$ slew transition during dead-time $t_{\text{dead}}$, and 0 V clamping during freewheeling.
  - `i_pri_A(t)`: Reflected load current $i_{L_o}(t)/n + i_{L_m}(t)$ during active energy transfer, commutating through $L_{\text{lk}}$ across duty-loss interval $D_{\text{loss}} T_{\text{sw}} / 2$, decaying slightly during freewheeling.
  - `v_sec_V(t)`: Rectified secondary bridge voltage including duty-loss zero plateau and optional damped ringing spike at turn-on.
  - `i_lo_A(t)`: Ripple slope $(V_{\text{sec}} - V_{\text{out}})/L_o$ during $D_{\text{eff}}$ and $-V_{\text{out}}/L_o$ during $(1-D_{\text{eff}})$ (accounting for 2-phase interleaving cancellation).
  - `i_lm_A(t)`: Magnetizing current triangle $\pm I_{m,\text{pk}}$ driven by $\int v_{\text{pri}}\,dt / L_m$.
  - `v_cr_V(t)`: Primary DC-blocking capacitor ripple voltage (for PSFB) or resonant tank capacitor voltage $v_{C_r}(t)$ (for LLC).
- **LLC (`llc-fb`, `llc-hb`)**:
  - Sinusoidal/piecewise resonant tank current $i_{\text{pri}}(t)$ at frequency $f_{\text{sw}}$ vs $f_r$, separating magnetizing ramp $i_{L_m}(t)$ from reflected secondary current $i_{\text{sec}}(t)/n$.
  - Accurate DCM clamping when $f_{\text{sw}} < f_r$ (secondary diode current reaches zero prior to half-period end).

---

## 2. Monte Carlo Tolerance & Worst-Case Corner Engine (`monteCarloEngine.ts`)
Real hardware must pass across manufacturing & environmental variations, not just nominal values.
- **Sampled Parameters (Gaussian truncated at $\pm 3\sigma$)**:
  - `Llk_uH` ($\pm 10\%$), `Lm_uH` ($\pm 15\%$), `Lo_uH` ($\pm 10\%$), `Co_uF` ($\pm 20\%$), `ESR_Co_mOhm` ($\pm 25\%$)
  - `Rds_on` ($\pm 15\%$), `Bsat_100C_T` ($\pm 10\%$), `coreLoss_mult` ($\pm 15\%$)
  - `Vin_V` ($\pm 5\%$ or uniform across $[V_{\text{in,min}}, V_{\text{in,max}}]$), `Tamb_C` ($\pm 10^\circ\text{C}$)
- **Pass/Fail Acceptance Criteria**:
  1. $T_{j,\text{pri}} \le T_{j,\text{limit}}$ and $T_{j,\text{sec}} \le T_{j,\text{limit}}$
  2. $B_{\text{pk}} \le 0.85 \cdot B_{\text{sat}}(T_{\text{core}})$
  3. Phase Margin $\text{PM} \ge 45^\circ$ and $Q_p \le 1.5$ (for PCMC)
  4. $V_{\text{out,ripple}} \le 2.5\% \cdot V_{\text{out}}$
  5. ZVS Energy Ratio $\ge 100\%$ at nominal load
- **Outputs**: Overall yield %, distribution histograms, P5/P50/P95/Max/Min bounds, and Pearson correlation sensitivity ranking.

---

## 3. Thermal RC Foster/Cauer Network & Overload Transients
- Static steady-state $T_j = T_{\text{amb}} + P_{\text{loss}}(R_{\theta JC} + R_{\theta TIM} + R_{\theta HS})$ misses transient thermal impedance during 150% overload pulses or startup inrush.
- 4-node RC ladder:
  - Node 1: Die junction ($C_{\text{th},j} \approx 2\text{–}15\text{ mJ/K}$)
  - Node 2: Package case / leadframe ($C_{\text{th},c} \approx 0.2\text{–}1.0\text{ J/K}$)
  - Node 3: TIM interface
  - Node 4: Heatsink thermal mass ($C_{\text{th},hs} \approx 30\text{–}300\text{ J/K}$)

---

## 4. Next-Generation Topologies Roadmap
1. **Dual Active Bridge (DAB)**: Bidirectional power flow $P = \frac{n V_1 V_2}{2 \pi f_{\text{sw}} L_{\text{lk}}} \phi (1 - |\phi|/\pi)$, SPS/EPS/TPS ZVS boundaries.
2. **Bidirectional CLLC Resonant**: Symmetric/asymmetric resonant tanks ($L_{r1}, C_{r1}, L_m, L_{r2}, C_{r2}$).
3. **4-Switch Buck-Boost / Interleaved Sync Buck**: Non-isolated POL / battery charger stage.
4. **3-Phase Vienna Rectifier & 3-Level ANPC PFC**: 400 VAC / 480 VAC 3-phase front-end with neutral-point balancing.
