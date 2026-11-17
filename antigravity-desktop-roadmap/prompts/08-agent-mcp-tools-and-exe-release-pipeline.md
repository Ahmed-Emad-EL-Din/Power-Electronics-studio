# Prompt 08: Antigravity Agent Tooling, Self-Verification Harness & Windows `.EXE` / `.MSI` Release Packaging

## Agent Role & Objective
You are a Principal Release & Autonomous Agent Infrastructure Engineer. Your task is to configure the workspace so an autonomous AI agent (such as Antigravity) can self-test, benchmark, debug, and package the final standalone Windows 64-bit `.exe` and `.msi` / NSIS installer with full hardware acceleration (`AVX2` + `wgpu` + bundled `ngspice.dll` + seeded `catalog.sqlite3`).

---

## Step-by-Step Implementation Instructions

### 1. Configure Agent Self-Verification CLI Scripts (`package.json` & `scripts/`)
Autonomous coding agents perform best when they have deterministic, fast, machine-readable verification loops. Add these scripts to `package.json`:
```json
{
  "scripts": {
    "dev": "vite",
    "tauri:dev": "tauri dev",
    "tauri:build": "tauri build",
    "verify:frontend": "tsc --noEmit && vite build",
    "verify:rust": "cargo check --manifest-path src-tauri/Cargo.toml --message-format=short",
    "test:physics": "cargo test --manifest-path src-tauri/Cargo.toml --release -- --nocapture",
    "bench:pareto": "cargo test --manifest-path src-tauri/Cargo.toml --release bench_100k_pareto_sweep -- --nocapture"
  }
}
```

### 2. Configure `src-tauri/tauri.conf.json` for Standalone Windows `.EXE` Packaging
Configure Tauri v2 bundle settings in `src-tauri/tauri.conf.json`:
- **Identifier**: `com.powerstage.studio.desktop`
- **Product Name**: `PowerStage CAD & Control Studio`
- **Window Configuration**:
  - Default resolution: `1680 x 1020`, min resolution: `1280 x 768`, resizable, dark titlebar theme.
- **Bundled Resources & Sidecar Binaries**:
  ```json
  "bundle": {
    "active": true,
    "targets": ["nsis", "msi"],
    "resources": [
      "resources/catalog_seed.sqlite3",
      "resources/spice_models/*.lib",
      "binaries/ngspice.dll"
    ],
    "windows": {
      "webviewInstallMode": {
        "type": "embedBootstrapper"
      },
      "nsis": {
        "installMode": "currentUser",
        "compression": "lzma"
      }
    }
  }
  ```

### 3. Build Automated Physics & Hardware Regression Suite (`src-tauri/tests/integration_suite.rs`)
Create an end-to-end integration test suite that the agent must run before declaring the `.exe` build complete:
1. **Golden Reference Physics Check**:
   - Runs `solve_dcdc_native` on the 3.3 kW PSFB Server PSU preset and 3.3 kW Half-Bridge LLC EV Charger preset, verifying efficiency $\eta$, $L_{lk}$, transformer turns ratio $n$, Steinmetz core loss $P_{core}$, and capacitor $L_{10}$ lifetime match golden engineering tolerances within $\pm 0.05\%$.
2. **Multi-Core Scaling Benchmark**:
   - Runs a 100,000-point Pareto optimization sweep across all CPU cores and asserts execution time $< 500\text{ ms}$ and non-empty Pareto frontier.
3. **Headless GPU Compute Check**:
   - Initializes `wgpu` in headless mode, dispatches the $512 \times 512$ magnetic vector potential shader `magnetic_poisson.wgsl`, reads back the buffer, and verifies $\max(|B|) > 0$ and finite values (no `NaN`s).
4. **SQLite & KiCad Export Check**:
   - Queries the seeded SQLite component catalog and generates a temporary `.kicad_sch` schematic and C2000 ISR source file, verifying valid output size and syntax.

### 4. Produce Final Standalone `.EXE` Artifact
Execute:
```bash
npm run verify:frontend
npm run test:physics
npm run tauri:build
```
Verify the compiled native binaries are generated at:
- `src-tauri/target/release/powerstage-studio.exe` (Standalone portable native executable)
- `src-tauri/target/release/bundle/nsis/PowerStage CAD & Control Studio_2.0.0_x64-setup.exe` (NSIS Windows Installer)
- `src-tauri/target/release/bundle/msi/PowerStage CAD & Control Studio_2.0.0_x64_en-US.msi` (Enterprise MSI Package)
