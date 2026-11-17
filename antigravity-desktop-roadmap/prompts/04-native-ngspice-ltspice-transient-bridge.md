# Prompt 04: Native `ngspice.dll` FFI & Headless `LTspice.exe -b` Transient Simulation Bridge

## Agent Role & Objective
You are a SPICE Simulation & Circuit Verification Architect. Analytical equations and state-space averaging cannot capture every sub-nanosecond parasitic ringing event, reverse-recovery snap-off ($dI_{rr}/dt$), or non-linear $C_{oss}(V_{ds})$ dead-time resonance. Because this application runs as a native Windows `.exe`, you will integrate **two real industry-standard SPICE engines**:
1. **Embedded `ngspice.dll` (Shared Library via Rust C FFI)**: Bundled directly inside the `.exe` installer so every user gets instant transient and AC small-signal SPICE verification out-of-the-box with zero external setup.
2. **Headless `LTspice.exe -b` CLI Bridge**: Auto-detects Analog Devices LTspice (installed on >90% of power electronics engineers' PCs), generates both `.cir` netlists and native `.asc` schematics, runs batch simulations in the background, and parses binary `.raw` waveform files back into the React oscilloscope view.

---

## Step-by-Step Implementation Instructions

### 1. Create the Parametric SPICE Netlist Synthesizer (`src-tauri/src/spice_bridge/netlist_synth.rs`)
Build a deterministic Rust module that translates the active `DcDcDesignState` or `AcDcDesignState` into a complete, convergence-hardened SPICE netlist including all real-world layout parasitics:
- **Topologies Supported**:
  - Phase-Shifted Full-Bridge (PSFB) with saturable/linear leakage inductor $L_{lk}$, magnetizing inductance $L_m$, core loss parallel resistor $R_c$, inter-winding capacitance $C_{ww}$, and secondary center-tapped or full-bridge synchronous rectifiers.
  - Half-Bridge LLC Resonant Converter with resonant tank ($L_r, C_r, L_m$), dead-time controller, and non-linear switch capacitances.
  - 2-Phase Interleaved Boost PFC & 3-Level Vienna Rectifier with LISN (50 $\Omega$ / 50 $\mu\text{H}$ CISPR 22/32 network) for time-domain FFT EMI verification.
- **Parasitic Injection**:
  - Primary power-loop stray inductance $L_{loop,pri}$ (nH), common-source inductance $L_{source}$ (or 4-pin Kelvin source separation), gate drive internal/external $R_{g,on}/R_{g,off}$, and secondary rectifier trace inductance $L_{sec}$ + RC snubber ($R_{snub}, C_{snub}$).
- **Convergence Options**:
  - Automatically inject `.options reltol=1e-3 abstol=1e-9 vntol=1e-5 method=gear maxord=2 cshunt=1e-13` to guarantee convergence with hard-switching SiC/GaN models.

### 2. Implement Embedded `ngspice.dll` FFI Wrapper (`src-tauri/src/spice_bridge/ngspice_ffi.rs`)
Use the `libloading` crate to load `ngspice.dll` and bind its standard shared API:
- `ngSpice_Init`, `ngSpice_Command`, `ngSpice_Circ`, `ngGet_Vec_Info`
- Register the `SendData` callback to stream time-step vectors (`time`, `V(pri_sw_a)`, `V(pri_sw_b)`, `I(L_lk)`, `V(sec_rect_1)`, `V(vout)`) directly into a Rust ring buffer and forward decimated chunks to the React frontend via `tauri::ipc::Channel`.
- Support `.tran 2n 400u 350u uic` (steady-state switching cycle capture) and `.ac dec 100 10 1Meg` (small-signal frequency response verification).

### 3. Implement Headless `LTspice.exe` Runner & Binary `.raw` Parser (`src-tauri/src/spice_bridge/ltspice_cli.rs`)
- Scan standard Windows installation paths:
  - `%LOCALAPPDATA%\Programs\ADI\LTspice\LTspice.exe`
  - `C:\Program Files\LTC\LTspiceXVII\XVIIx64.exe`
  - `C:\Program Files\ADI\LTspice\LTspice.exe`
- Provide two actions:
  1. **"Run Headless LTspice (`-b -Run`)"**: Spawns `LTspice.exe -b -Run temp_design.cir`, waits for completion, and parses the binary `.raw` output file (supporting both double-precision and single-precision fast-access binary `.raw` formats) into typed waveform arrays.
  2. **"Open Interactive Schematic in LTspice (`.asc`)"**: Generates a valid LTspice `.asc` schematic file with placed symbols (`nmos`, `ind2`, `cap`, `voltage`, `.param` directives, `.meas` efficiency scripts) and launches LTspice GUI directly on the user's desktop.

### 4. React UI: "Native SPICE Transient & Ringing Oscilloscope"
Upgrade `WaveformScope.tsx` and `DcDcWorkbench.tsx`:
- Add a **"Run Native SPICE Transient (`ngspice` / `LTspice`)"** button next to the analytical waveform scope.
- Overlay the real SPICE-simulated $V_{ds}(t)$, $V_{gs}(t)$ Miller plateau, and secondary diode/SR voltage ringing directly on top of the analytical predictions so the engineer can verify ZVS transition completion and snubber clamping accuracy.

---

## Verification Criteria
1. Verify netlist generation produces valid syntax for PSFB, LLC, and 2-Ph Interleaved PFC.
2. Verify the `.raw` binary parser accurately reads time and voltage/current traces and computes FFT spectrum peaks ($150\text{ kHz} \dots 30\text{ MHz}$) matching the EMI Filter Synthesis assistant.
