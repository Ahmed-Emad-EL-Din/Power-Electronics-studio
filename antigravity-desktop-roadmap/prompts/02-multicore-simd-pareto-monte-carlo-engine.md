# Prompt 02: Multi-Core CPU (`rayon` + AVX2 SIMD) Physics Engine, 100k Pareto Optimizer & Monte Carlo Solver

## Agent Role & Objective
You are a High-Performance Scientific Computing & Power Electronics Engineer. Your objective is to port the single-threaded TypeScript solvers (`/src/engine/dcdcEngine.ts` and `/src/engine/acdcEngine.ts`) into a multi-threaded, SIMD-vectorized Rust physics crate (`src-tauri/src/physics/`) that exploits all logical CPU cores (16–64 threads) on the user's PC.

Beyond 1-to-1 parity with the web solver, you will implement two PC-exclusive compute modules impossible in a browser tab:
1. **Multi-Objective 100,000-Point Design Space Pareto Explorer** ($f_{sw} \times L_{lk} \times \text{Core} \times \text{MOSFET} \times N_p:N_s$) computing Efficiency ($\eta$) vs. Power Density ($\text{W/in}^3$) vs. BOM Cost ($\$$) vs. Peak Junction Temp ($T_j$).
2. **50,000-Run Monte Carlo Tolerance & Lifetime Stress Simulator** using Box-Muller / Sobol quasi-random sampling across component tolerances ($\pm 15\% L_m$, $\pm 10\% C_{oss}$, $\pm 20\% R_{dson}(T_j)$, $\pm 10\% \text{ESR}$).

---

## Step-by-Step Implementation Instructions

### 1. Port & Upgrade Core Solvers to Rust (`src-tauri/src/physics/`)
- **`dcdc_psfb_llc.rs`**:
  - Port the full PSFB (1-Phase & 2-Phase Interleaved) and Half-Bridge LLC solvers.
  - Upgrade the LLC solver from Fundamental Harmonic Approximation (FHA) alone to a **hybrid FHA + Time-Domain State-Plane Mode Solver** (solving the exact piecewise-resonant ODE matrices across $[t_0, t_1, t_2]$ using `nalgebra` and 4th-order Runge-Kutta `rk4`) so gain $M(f_n, Q, L_n)$ and ZVS boundary are exact even far below and above resonance.
- **`magnetics_igse.rs`**:
  - Implement Generalized Steinmetz Equation (iGSE) numerical contour integration over non-sinusoidal piecewise-linear flux waveforms:
    $$P_v = \frac{1}{T} \int_0^T k_i \left|\frac{dB}{dt}\right|^\alpha (\Delta B)^{\beta - \alpha} dt$$
  - Implement 2D Dowell + Ferreira proximity and skin-effect AC resistance calculation across up to 24 winding layers and harmonic orders $h = 1 \dots 31$ using `wide::f64x4` SIMD vector lanes.

### 2. Multi-Core `rayon` Pareto Front Optimizer (`src-tauri/src/physics/pareto_optimizer.rs`)
Implement `run_pareto_design_sweep`:
- Accept search bounds:
  - $f_{sw} \in [40\text{ kHz}, 500\text{ kHz}]$ (50 steps)
  - Primary device candidates (all compatible 650V–1200V SiC/GaN/SJ MOSFETs)
  - Secondary SR device candidates
  - Ferrite core geometries & materials (N87, N97, 3C95, 3F36, PC95)
  - Number of parallel devices $N_{par} \in \{1, 2, 3, 4\}$
- Use `rayon::prelude::IntoParallelIterator` (`par_iter()`) to evaluate 50,000 to 250,000 candidate converter designs across all CPU cores in parallel.
- Filter out infeasible designs ($B_{pk} > 0.85 B_{sat}(100^\circ\text{C})$, window fill $K_u > 0.55$, $T_{j,max} > 150^\circ\text{C}$, ZVS lost at full load).
- Extract the non-dominated **3D Pareto Frontier** ($\eta_{\text{full}}$ vs. Power Density $\text{W/L}$ vs. Total Loss $P_{\text{loss}}$) and stream progress back to the React UI via `tauri::ipc::Channel`.

### 3. 50,000-Run SIMD Monte Carlo Yield & Reliability Engine (`src-tauri/src/physics/monte_carlo.rs`)
Implement `run_monte_carlo_sensitivity`:
- Perturb 12 critical parameters simultaneously using Gaussian / uniform distributions:
  - $L_{lk} \sim \mathcal{N}(\mu, (0.08\mu)^2)$, $L_m \sim \mathcal{N}(\mu, (0.12\mu)^2)$, $C_r \sim \mathcal{N}(\mu, (0.05\mu)^2)$
  - $R_{ds(on),25^\circ\text{C}} \sim \text{Uniform}[\text{typ}, \text{max}]$, Gate driver propagation skew $\Delta t_{skew} \in [-8\text{ ns}, +8\text{ ns}]$
  - Ambient temperature $T_{amb} \in [25^\circ\text{C}, 65^\circ\text{C}]$
- Compute statistical distributions (P01, P05, Median, P95, P99, $C_{pk}$ process capability index) for:
  - Phase Margin (deg) & Gain Margin (dB) worst-case stability
  - ZVS Retention Probability (%)
  - Peak Secondary Clamped/Unclamped Ringing Voltage ($V_{sec,pk}$)
  - Capacitor Bank $L_{10}$ Lifetime (Hours)

### 4. React UI Integration: "PC Multi-Core Pareto & Monte Carlo Lab"
Add an interactive panel in `DcDcWorkbench.tsx` and `AcDcWorkbench.tsx`:
- Displays CPU core utilization, execution time in milliseconds, and throughput ($\text{designs/sec}$).
- Renders an interactive scatter chart of the Pareto Frontier where clicking any point immediately loads that optimal design into the workbench.
- Renders histogram distributions and $C_{pk}$ yield badges from the 50,000-run Monte Carlo sweep.

---

## Verification Criteria
1. Write unit tests in `src-tauri/src/physics/tests.rs` comparing Rust solver outputs against reference benchmarks (within 0.1% of analytical targets).
2. Benchmark a 100,000-point sweep with `cargo test --release -- --nocapture` and verify completion in $< 250\text{ ms}$ on a modern multi-core PC.
