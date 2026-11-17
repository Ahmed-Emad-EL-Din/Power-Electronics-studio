# Prompt 03: GPU Compute (`wgpu` DirectX 12 / Vulkan) 2D/3D Magnetic Fringing Flux & PCB Thermal Solver

## Agent Role & Objective
You are a Computational Electromagnetics (CEM) & Thermal Physics Engineer. In the browser version of PowerStage Studio, the 2D Transformer Winding Window visualizer uses an analytical Gaussian distance approximation for air-gap fringing flux. On a desktop PC with a dedicated or integrated GPU (NVIDIA RTX / AMD Radeon / Intel Arc), you will implement a hardware-accelerated **2D Finite-Difference / Finite-Element Magnetic Vector Potential ($A_z$) & Eddy Loss Solver** and a **3D Finite-Volume Thermal Solver** using Rust `wgpu` (native DirectX 12 / Vulkan compute shaders), plus an optional headless bridge to **FEMM 4.2** (`femm.exe`).

---

## Step-by-Step Implementation Instructions

### 1. Add `wgpu` & `bytemuck` to `src-tauri/Cargo.toml`
```toml
wgpu = "22.1"
bytemuck = { version = "1.18", features = ["derive"] }
pollster = "0.3"
```

### 2. Implement GPU Magnetic Vector Potential Compute Shader (`src-tauri/src/gpu_fem/shaders/magnetic_poisson.wgsl`)
Solve the 2D magnetostatic / quasi-static Poisson equation across a $512 \times 512$ mesh of the transformer core window and center-leg air gap:
$$\nabla \cdot \left( \frac{1}{\mu(x,y)} \nabla A_z(x,y) \right) = -J_z(x,y) + j\omega \sigma(x,y) A_z(x,y)$$
- Map each grid cell $(i,j)$ to its physical region:
  - Ferrite Core ($\mu_r = \mu_{eff}(B)$, $\sigma \approx 0.1\text{ S/m}$)
  - Center-Leg / Distributed Air Gap ($\mu_r = 1.0$)
  - Primary & Secondary Copper Turns ($\mu_r = 1.0$, $\sigma = 5.8 \times 10^7\text{ S/m}$, carrying current density $J_z$)
- Use a Red-Black Successive Over-Relaxation (SOR) or Conjugate Gradient WGSL compute kernel with $\omega_{SOR} = 1.85$ dispatched over $(32, 32, 1)$ workgroups.
- Compute the exact magnetic flux density vector field at every pixel:
  $$B_x = \frac{\partial A_z}{\partial y}, \quad B_y = -\frac{\partial A_z}{\partial x}, \quad |B| = \sqrt{B_x^2 + B_y^2}$$
- Calculate localized fringing eddy-current power loss density $p_{eddy}(x,y) = \frac{1}{8} \sigma \omega^2 d_{wire}^2 (B_x^2 + B_y^2)$ inside each individual copper strand/foil layer.

### 3. Implement GPU 3D Heatsink & PCB Copper Thermal Solver (`src-tauri/src/gpu_fem/shaders/thermal_fvm.wgsl`)
Solve the steady-state and transient 3D heat conduction equation across a multi-layer FR4 PCB + thermal vias + TIM + extruded aluminum heatsink:
$$\rho c_p \frac{\partial T}{\partial t} = \nabla \cdot (k(x,y,z) \nabla T) + q'''(x,y,z)$$
- Place heat sources $q'''$ at the exact footprints of the Primary MOSFETs ($Q_1 \dots Q_4$), Secondary SR MOSFETs, Planar/Litz Transformer core & windings, and Output Inductor.
- Account for mutual thermal coupling between adjacent switches sharing a heatsink and PCB copper pour spreading resistance.
- Return a $256 \times 256$ surface temperature field $T(x,y)$ and exact per-device junction temperatures $T_{j,Q1 \dots Qn}$.

### 4. Optional Sidecar Integration with FEMM 4.2 (`src-tauri/src/gpu_fem/femm_bridge.rs`)
- Detect if `C:\femm42\bin\femm.exe` is installed on the user's Windows PC.
- Provide a button **"Verify in FEMM 4.2 (Lua Script)"** that auto-generates a complete `.lua` script defining the exact bobbin, air-gap length $l_g$, primary/secondary turns, Litz strand geometry, and harmonic currents, invokes `femm.exe -lua-script=winding_job.lua -windowhide`, and imports the resulting inductance matrix $[L_{11}, L_{12}, L_{22}]$ and AC resistance back into the workbench.

### 5. React UI: High-Speed WebGL / Canvas Heatmap Overlay
Upgrade `WindingWindowVisualizer.tsx`:
- Add a toggle between **"Analytical Fast Model"** and **"GPU DirectX 12 / Vulkan 512×512 FEM Field"**.
- Render streamline contours of $A_z$ (magnetic flux lines bowing out of the center-leg air gap) and per-turn hotspot badges showing exact milliwatts of fringing loss in turns closest to the gap.

---

## Verification Criteria
1. Verify `wgpu` initializes cleanly on Windows DirectX 12 and Vulkan backends.
2. Confirm the $512 \times 512$ magnetic field solve completes in $< 35\text{ ms}$ on GPU and accurately predicts higher eddy losses when turns are placed within $2 \times l_g$ of the air gap.
