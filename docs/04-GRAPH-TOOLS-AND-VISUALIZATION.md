# 04 — Graph Tools & Visualization Blueprint

## 1. Current Visualization Capabilities
- `InteractiveChart.tsx`: Dual-axis SVG chart with drag-box zoom, pan, dynamic `domainEvaluator`, M1/M2 delta cursors (`ΔY`, `Slope`, `RMS`, `∫Y·dX`), Target-Y solver, 0-Y anchor, PNG/SVG export, and CSV export.
- `BodeStabilityGraph.tsx`: Stacked Magnitude/Phase Bode plots with worst-case envelope, pole/zero markers, M1/M2 cursors, and CSV export.
- `BhLoopVisualizer.tsx`, `WindingWindowVisualizer.tsx`, `EfficiencyLoadPowerChart.tsx`, `SmallSignalDashboard.tsx` (Nyquist & s-plane).

---

## 2. High-Impact Graph Tool Additions

### A. 4-Channel Virtual Oscilloscope (`src/components/OscilloscopeViewer.tsx`)
Designed specifically for multi-signal power electronics switching waveform inspection:
- **6 Selectable Channels** (toggle up to 4–6 simultaneously with normalized or dual-axis voltage/current scaling):
  - `CH1`: Primary Bridge Voltage $v_{\text{pri}}(t)$ (V)
  - `CH2`: Primary Tank Current $i_{\text{pri}}(t)$ (A)
  - `CH3`: Secondary Rectifier Voltage $v_{\text{sec}}(t)$ (V)
  - `CH4`: Output Inductor Current $i_{L_o}(t)$ (A)
  - `CH5`: Magnetizing Current $i_{L_m}(t)$ (A)
  - `CH6`: Resonant / Blocking Cap Voltage $v_{C_r}(t)$ (V)
- **Oscilloscope Features**:
  - Timebase zoom (`0.5`, `1`, `2`, `4`, `6` switching cycles $T_{\text{sw}}$) + horizontal pan
  - Trigger marker (`T0` rising edge of $v_{\text{pri}}$) and dead-time window shading
  - **M1 / M2 Cursor Readouts**: Live channel-by-channel table computing `Value @ M1`, `Value @ M2`, `ΔY`, `dY/dt`, `Window RMS`, `Window Mean`, `Pk-Pk`, and `Charge ∫i·dt` (µC)
  - Pinned Reference (`Pin Ref`) ghost waveform overlay
  - 1-click **Export Scope CSV** and **Export Scope SVG**

### B. Closed-Loop Step-Load Transient & Monte Carlo Plots (`src/components/TransientAndMonteCarloLab.tsx`)
1. **Transient Plot**:
   - Top subplot: Output voltage deviation $\Delta v_{\text{out}}(t)$ (mV or V) with tolerance band markers ($\pm 2\%$, $\pm 5\%$), peak overshoot/undershoot badge, and settling time $t_{\text{settle}}$ marker.
   - Bottom subplot: Step load current $i_{\text{load}}(t)$, inductor current $i_{L_o}(t)$, and duty/control effort $u(t)$.
2. **Monte Carlo Yield Histogram**:
   - Distribution bars across 15–20 bins with mean $\mu$, $\pm 3\sigma$ markers, and red spec limit threshold line (e.g., `Tj_max = 125°C`, `PM_min = 45°`, `Bsat = 85%`).
   - Interactive metric selector (`Efficiency`, `Tj Primary`, `Tj Secondary`, `Flux Utilization`, `Phase Margin`, `Vout Ripple`, `ZVS Energy Ratio`).

### C. 2D Efficiency & Loss Contour Heatmap (Next Phase)
- Interactive grid evaluating `solveDcDcDesign` across `Vin ∈ [Vin_min, Vin_max]` × `Load ∈ [10%, 100%]` (or `fsw` × `Lm`), color-coded by efficiency or total power loss, with click-to-inspect operating point.
