---
name: pcmc-type2-control
description: Exact small-signal and component synthesis rules for Peak Current-Mode Control (PCMC) paired with Type-II (2P2Z) analog (Op-Amp & OTA transconductance) and digital compensators, grounded in Ridley (1990), TI SLVA662, TI SPRABE7A, and switchmode.io.
sources:
  - R. B. Ridley, "A New Small-Signal Model for Current-Mode Control," Ph.D. Diss., Virginia Tech, 1990
  - TI Application Report SLVA662 (Type II Op-Amp & Transconductance Compensator Design)
  - TI Application Report SPRABE7A (Digital Peak Current Mode Control With Slope Compensation)
  - https://switchmode.io/resources/current-mode-compensator-design-part1
  - https://switchmode.io/resources/current-mode-compensator-design-part2
---

# PCMC + Type-II Compensator Engineering Skill

## 1. Ridley Peak Current-Mode Control Plant Model
Under Peak Current-Mode Control (PCMC) with inner sense gain $R_i$ ($\Omega$) and external ramp slope $S_e$, the inductor current loop turns the $LC$ double pole into:
- **Dominant low-frequency output pole** $\omega_{p1}$ (Ridley load + current-loop damping):
  $$m_c = 1 + \frac{S_e}{S_n}, \qquad \omega_{p1} = \frac{1}{R_{\text{load}} C_o} + \frac{m_c D' - 0.5}{L_{o,\text{eq}} C_o f_{\text{eff}}}$$
  where for PSFB full-wave rectification $f_{\text{eff}} = 2 f_{\text{sw}}$ ($T_{s,\text{eff}} = 1/(2 f_{\text{sw}})$) and $D' = 1 - D_{\text{eff}}$; for primary-sensed current sense transformer/shunt, $R_i = R_{\text{sense}} / n$.
- **Exact DC control-to-output gain**:
  $$H_{\text{dc}} = \frac{R_{\text{load}}}{R_i} \cdot \frac{1}{1 + \frac{R_{\text{load}} T_{s,\text{eff}}}{L_{o,\text{eq}}}\left(m_c D' - 0.5\right)}$$
- **ESR zero**: $\omega_{z,\text{esr}} = \frac{1}{R_{\text{esr}} C_o}$.
- **Sample-and-hold subharmonic double pole** at $\omega_n = \pi f_{\text{eff}}$:
  $$H_e(s) = \frac{1}{1 + \frac{s}{\omega_n Q_p} + \frac{s^2}{\omega_n^2}}, \qquad Q_p = \frac{1}{\pi (m_c D' - 0.5)}$$
  Enforce $m_c > \frac{0.5}{D'}$ and target $Q_p \le 1.2$ across the full input line range $[V_{\text{in,min}}, V_{\text{in,max}}]$ (checking worst-case $D'_{\min} = 1 - D_{\text{eff,max}}$ at $V_{\text{in,min}}$).

## 2. Type-II Compensator Synthesis (Symmetric Boost & ESR Pole Placement)
Because the PCMC plant has only ~$-90^\circ$ phase near crossover ($f_c \in [f_{\text{sw}}/20, f_{\text{sw}}/6]$), a **Type-II** network (origin integrator + 1 zero $f_z$ + 1 high-frequency pole $f_p$) provides up to $+90^\circ$ boost:
$$G_c(s) = \frac{\omega_{p0}}{s} \cdot \frac{1 + s/\omega_z}{1 + s/\omega_p}$$
1. Required phase boost at $f_c$: $\phi_{\text{boost}} = \text{PM}_{\text{target}} - \angle H_p(j\omega_c) - \angle e^{-j\omega_c T_d} - 90^\circ$.
2. $k$-factor symmetric placement ($f_z f_p = f_c^2$):
   $$k = \tan\!\left(45^\circ + \frac{\phi_{\text{boost}}}{2}\right), \qquad f_z = \frac{f_c}{k}, \qquad f_p = \min\!\left(f_c \cdot k,\; f_{\text{esr}},\; 0.45 f_{\text{sw}}\right)$$
3. Exact gain magnitude $G = |H_c(j\omega_c)| = 1 / |H_p(j\omega_c)|$ fixes $R_2, C_1, C_2$ (for both **Op-Amp** and **OTA $g_m$** topologies per TI SLVA662):
   - **Op-Amp Type-II** (`COMP`–`FB` feedback):
     $$R_2 = G\,R_1 \frac{f_p}{f_p - f_z} \frac{\sqrt{1+(f_c/f_p)^2}}{\sqrt{1+(f_z/f_c)^2}}, \quad C_1 = \frac{1}{2\pi f_z R_2}, \quad C_2 = C_1 \frac{f_z}{f_p - f_z}$$
   - **OTA ($g_m$) Type-II** (`COMP` to `GND`, shunt termination):
     $$R_2 = G \frac{R_1 + R_4}{R_4\, g_m} \frac{f_p}{f_p - f_z} \frac{\sqrt{1+(f_c/f_p)^2}}{\sqrt{1+(f_z/f_c)^2}}$$
   - Snap $R_1, R_2, R_4$ to E96 1% values, recompute $C_1, C_2$ for C0G/NP0 bounds ($C_1 \le 47\text{ nF}$, $C_2 \ge 15\text{ pF}$), and map via pre-warped Tustin transform to exact digital 2P2Z ($b_0, b_1, b_2, a_1, a_2$ with $a_1 + a_2 = 1$).
