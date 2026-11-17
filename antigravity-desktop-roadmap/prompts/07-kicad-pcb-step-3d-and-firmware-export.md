# Prompt 07: Native KiCad 8 Schematic/PCB S-Expression Generator, 3D `.STEP` Core Exporter & Full MCU IDE Project Generator

## Agent Role & Objective
You are an EDA Automation & CAD Geometry Engineer. Once a power stage design is verified in PowerStage Studio, the engineer needs to manufacture the PCB, wind the custom magnetics, and compile the embedded firmware. Running as a native Windows `.exe`, you will build `src-tauri/src/eda_export/` to write production-ready engineering files directly to the user's local filesystem and invoke local EDA tools (`kicad-cli.exe`).

---

## Step-by-Step Implementation Instructions

### 1. Native KiCad 8 `.kicad_sch` & `.kicad_pcb` Generator (`src-tauri/src/eda_export/kicad_sexpr.rs`)
KiCad 8 uses human-readable, deterministic Lisp S-expressions (`(kicad_sch (version 20231120) ...)`).
Build a Rust S-expression serializer that exports a complete KiCad 8 project folder (`<design_name>/`):
- **`<design_name>.kicad_pro` & `<design_name>.kicad_sch`**:
  - Places Hierarchical Sheets for:
    1. ** Sheet 1: Input EMI Filter & Protection** (Common-mode chokes $L_{CM1}, L_{CM2}$, X-caps $C_{X1}, C_{X2}$, Y-caps $C_{Y1 \dots Y4}$, MOV, inrush NTC + bypass relay).
    2. **Sheet 2: Primary Power Stage & Isolated Gate Drivers** (Primary MOSFETs with 4-pin Kelvin source symbols, UCC21530 / 1ED3321 gate drivers, bootstrap/isolated bias supplies, $R_{g,on}/R_{g,off}$ networks, and Desat / Shunt current sense from `ProtectionCurrentSensePanel`).
    3. **Sheet 3: Planar/Litz Isolation Transformer & Secondary Rectifier / Output Filter** (Custom transformer symbol with exact pin mapping, SR MOSFETs, RC snubbers, output inductor $L_o$, and parallel capacitor bank).
  - Pre-populates every symbol property with the exact selected MPN, LCSC Part Number (`LCSC_PN`), manufacturer, voltage/power rating, and footprint (`Package_TO_SOT_THT:TO-247-4_Vertical`, etc.).
- **Net Class & High-Voltage Creepage Rules in `<design_name>.kicad_pcb`**:
  - Automatically generates IPC-2221B / IEC 62368-1 net classes (`HV_PRIMARY_BUS`, `HV_SWITCH_NODE`, `ISOLATED_SECONDARY`, `KELVIN_GATE_DRIVE`) with exact minimum clearance and creepage rules (e.g., $\ge 6.4\text{ mm}$ reinforced isolation slot under the transformer and gate drivers).

### 2. 3D `.STEP` (ISO 10303-21) Transformer & Inductor CAD Exporter (`src-tauri/src/eda_export/step_3d_core.rs`)
Mechanical engineers need to check enclosure height and heatsink clearance in SolidWorks, Fusion 360, or KiCad 3D Viewer.
- Generate a valid ISO 10303-21 `.STEP` 3D assembly file representing:
  - The two ferrite core halves (ETD, EER, PQ, RM, or Planar ER geometry using exact dimensional tables $A, B, C, D, E, F$ in mm).
  - The bobbin/coil former and the outer copper winding envelope volume.
  - Attach the `.STEP` model path directly to the custom transformer footprint in the exported KiCad project.

### 3. Complete TI Code Composer Studio (C2000) & STM32CubeIDE Firmware Project Exporter (`src-tauri/src/eda_export/firmware_project.rs`)
Expand the single-file C ISR preview from `SmallSignalDashboard.tsx` into a complete, buildable firmware project folder written to disk:
- **Target A: TI C2000 (`TMS320F280049C` / `F28379D`)**:
  - `main.c`, `powerstage_control_isr.c`, `powerstage_epwm_hrpwm.c` (configures high-resolution phase-shift `TBPHS` / `TRREM` for PSFB or high-resolution period `TBPRDHR` for LLC, plus active dead-time `DBRED`/`DBFED` and Comparator Subsystem `CMPSS` slope-compensated peak current trip), and `powerstage_hil_slave.h`.
- **Target B: STMicroelectronics `STM32G474RE` (`HRTIM1`)**:
  - Generates `hrtim_config.c` (184 ps resolution Master/Timer A-F configuration), `cordic_math.c`, FMAC / 3p3z assembly-accelerated control loop ISR, and `.ioc` pin configuration notes.

### 4. React UI: "One-Click Native Engineering Package Export"
Add an **"Export Native Engineering Package (KiCad 8 + 3D STEP + C2000/STM32 Project)"** modal accessible from the top header bar and workbenches that writes the entire project tree to a user-selected local directory and offers a **"Launch in KiCad 8"** button.

---

## Verification Criteria
1. Verify exported `.kicad_sch` S-expressions have balanced parentheses, valid UUIDv4 identifiers, and pass `kicad-cli sch erc` (if KiCad is installed) or structural parser tests.
2. Verify exported C firmware files compile with `gcc -fsyntax-only` / `clang -fsyntax-only` in automated tests.
