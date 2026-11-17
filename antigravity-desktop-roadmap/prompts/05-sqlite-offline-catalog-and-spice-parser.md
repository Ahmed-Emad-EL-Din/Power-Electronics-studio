# Prompt 05: Local SQLite 500k+ Component Catalog, Vendor `.lib` SPICE Parser & Datasheet Curve Digitizer

## Agent Role & Objective
You are a Database Systems & Component Modeling Engineer. The web version of PowerStage Studio stores a curated set of parts in memory and relies on `localStorage`. On a native Windows PC, you will build an embedded, high-speed **SQLite (`rusqlite` with FTS5 full-text search) Component & Material Engineering Vault** stored in `%APPDATA%\PowerStageStudio\catalog.sqlite3`, paired with an automated **Vendor `.lib` / `.subckt` SPICE Model Parameter Extractor** and an interactive **Datasheet Curve Digitizer**.

---

## Step-by-Step Implementation Instructions

### 1. Design the Local SQLite Schema (`src-tauri/src/catalog_db/schema.sql`)
Create normalized, indexed tables capable of querying 500,000+ components in $< 2\text{ ms}$:
- `semiconductors`:
  - `id`, `mpn`, `manufacturer`, `lcsc_code`, `digikey_pn`, `mouser_pn`, `technology` (`SiC`, `GaN`, `SJ_MOSFET`, `IGBT`, `Schottky`), `package`, `vds_max_v`, `id_cont_25c_a`, `id_cont_100c_a`, `rdson_25c_mohm`, `rdson_125c_mohm`, `qg_total_nc`, `qgd_nc`, `qgs_nc`, `coss_er_pf`, `coss_tr_pf`, `qrr_nc`, `vgs_th_v`, `vgs_drive_on_v`, `vgs_drive_off_v`, `rg_int_ohm`, `rth_jc_cw`, `kelvin_source_pin`, `unit_price_usd`, `stock_qty`, `spice_subckt_text`
- `semiconductor_curves`:
  - Stores digitized multi-point look-up tables (LUTs) per part:
    - $R_{ds(on)}$ vs. $T_j$ and $I_d$
    - $C_{iss}(V_{ds})$, $C_{oss}(V_{ds})$, $C_{rss}(V_{ds})$ non-linear capacitance curves (for exact ZVS charge $Q_{oss}(V_{bus}) = \int_0^{V_{bus}} C_{oss}(v) dv$)
    - $E_{on}(I_d, V_{ds}, R_g, T_j)$ and $E_{off}(I_d, V_{ds}, R_g, T_j)$ switching energy surfaces
- `magnetic_cores` & `core_materials`:
  - Full catalogs from TDK/Epcos, Ferroxcube, Magnetics Inc., Micrometals, Fair-Rite, Hitachi Finemet/Nanocrystalline, including Steinmetz $(k, \alpha, \beta)$ across frequency bands ($25\text{ kHz} \dots 1\text{ MHz}$) and temperature polynomial coefficients $(c_{t0}, c_{t1}, c_{t2})$.
- `capacitors`:
  - Film (DC-Link / Resonant polypropylene), Aluminum Electrolytic, OS-CON Polymer, and C0G/X7R MLCCs with frequency-dependent $\text{ESR}(f)$, $\text{ESL}$, ripple current ratings $I_{rms}(100\text{ kHz}, 105^\circ\text{C})$, and voltage derating curves.

### 2. Build the Automated Vendor `.lib` / `.subckt` SPICE Model Importer (`src-tauri/src/catalog_db/spice_model_parser.rs`)
Engineers frequently download encrypted or unencrypted `.lib` / `.mod` SPICE files from Infineon (CoolMOS / CoolSiC), Wolfspeed, ROHM, STMicroelectronics, and EPC.
Implement a native Rust parser + mini-testbench runner that:
1. Parses `.SUBCKT` pinouts (3-pin D-G-S vs. 4-pin D-G-S-Ks vs. 5-pin thermal models with `Tj`/`Tcase` nodes).
2. Automatically runs 3 micro-simulations via the embedded `ngspice.dll` engine in $< 150\text{ ms}$ when a user drops a `.lib` file onto the app:
   - **DC Sweep Testbench**: Extracts $R_{ds(on)}(25^\circ\text{C})$, $R_{ds(on)}(125^\circ\text{C})$, $V_{gs(th)}$, and body diode $V_{sd}(I_s)$.
   - **Small-Signal CV Sweep Testbench**: Sweeps $V_{ds}$ from $0\text{ V}$ to $V_{ds,max}$ to extract exact $C_{oss}(V)$, $C_{iss}(V)$, $C_{rss}(V)$, and integrates $Q_{oss}(V)$ and $E_{oss}(V)$.
   - **Double-Pulse Test (DPT) Testbench**: Runs an inductive clamped DPT at the user's $V_{in}$ and $I_{load}$ to extract real $E_{on}$, $E_{off}$, $t_{d(on)}$, $t_r$, $t_{d(off)}$, and $t_f$, and saves the part directly into the SQLite vault.

### 3. Bulk CSV / JLCPCB / LCSC Parts Library Importer
- Allow importing full JLCPCB / LCSC Basic & Extended SMT/THT part catalogs (`.csv` / `.sqlite` dumps) so users can filter by real-time stock and assembly tier entirely offline.

### 4. React UI Integration: Upgrade `ComponentSearchDrawer.tsx`
- Add a **"Drag & Drop Vendor `.lib` / `.subckt` File"** dropzone that runs the automated `ngspice` characterization testbenches and plots the extracted $C_{oss}(V_{ds})$ and $E_{on}/E_{off}$ curves before saving to the SQLite database.
- Add multi-column parametric SQL sorting and instant offline search across hundreds of thousands of parts.

---

## Verification Criteria
1. Verify SQLite database creation, migration, FTS5 search, and CRUD operations in `src-tauri/src/catalog_db/tests.rs`.
2. Verify that dropping a standard 3-pin or 4-pin SiC MOSFET `.subckt` extracts $R_{ds(on)}$ and $C_{oss}$ curves and persists them to SQLite.
