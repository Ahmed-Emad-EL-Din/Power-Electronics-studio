# Prompt 01: Tauri v2 + Rust Cargo Workspace Foundation & Zero-Copy IPC Bridge

## Agent Role & Objective
You are an autonomous Principal Systems & Power Electronics Software Architect running on a Windows x64 workstation. Your task is to convert the existing React + TypeScript + Tailwind **PowerStage CAD & Control Studio** web application into a native Windows desktop application using **Tauri v2** and a modular **Rust backend workspace** (`src-tauri`), establishing high-throughput binary IPC channels between the Rust physics/hardware engine and the React UI.

---

## Tooling & Environment Pre-Check
Before writing code, execute the following verification commands in your terminal tool:
1. Verify Rust MSVC toolchain: `rustc --version` and `cargo --version` (ensure `x86_64-pc-windows-msvc` target is active).
2. Verify Node.js & package manager: `node --version` and `npm --version`.
3. Install Tauri v2 CLI and frontend bindings:
   ```bash
   npm install -D @tauri-apps/cli@^2.0.0
   npm install @tauri-apps/api@^2.0.0 @tauri-apps/plugin-dialog@^2.0.0 @tauri-apps/plugin-fs@^2.0.0 @tauri-apps/plugin-shell@^2.0.0
   ```

---

## Step-by-Step Implementation Instructions

### 1. Initialize `src-tauri` with High-Performance Cargo Configuration
Create `src-tauri/Cargo.toml` with the following crates optimized for scientific computing, multi-threading, and hardware I/O:
- `tauri = { version = "2.0", features = ["protocol-asset"] }`
- `tauri-plugin-dialog = "2.0"`
- `tauri-plugin-fs = "2.0"`
- `tauri-plugin-shell = "2.0"`
- `serde = { version = "1.0", features = ["derive"] }`
- `serde_json = "1.0"`
- `rayon = "1.10"` (multi-core CPU parallelism)
- `wide = "0.7"` (portable SIMD `f64x4` / `f32x8` AVX2 acceleration)
- `nalgebra = "0.33"` (matrix algebra for state-space & nodal equations)
- `num-complex = "0.4"` (complex frequency-domain $s=j\omega$ Bode/Nyquist/EMI transfer functions)
- `rusqlite = { version = "0.32", features = ["bundled", "vtab"] }` (embedded offline component SQLite DB)
- `tokio = { version = "1.40", features = ["full"] }`

Configure `.cargo/config.toml` at the workspace root to enable native CPU vector instructions (AVX2 + FMA) on the host PC:
```toml
[build]
rustflags = ["-C", "target-cpu=native"]

[profile.release]
opt-level = 3
lto = "fat"
codegen-units = 1
panic = "abort"
strip = false
```

### 2. Mirror TypeScript Domain Models in Rust (`src-tauri/src/models.rs`)
Inspect `/src/data/databases.ts`, `/src/engine/dcdcEngine.ts`, and `/src/engine/acdcEngine.ts`.
Create exact, strongly-typed Rust structs with `#[derive(Debug, Clone, Serialize, Deserialize)]` and `#[serde(rename_all = "camelCase")]`:
- `AcDcDesignState` and `AcDcSimulationResult`
- `DcDcDesignState` and `DcDcSimulationResult`
- `SemiconductorSpec`, `CoreGeometrySpec`, `CoreMaterialSpec`, `CapacitorSpec`
- `SystemHealthReport` (`pcCpuLogicalCores`, `pcSimdCapability`, `gpuAdapterName`, `ngspiceAvailable`, `ltspicePath`, `sqlitePartCount`)

### 3. Build Streaming IPC Command Bridge (`src-tauri/src/ipc_commands.rs`)
Implement Tauri v2 commands using both request/response and `tauri::ipc::Channel<T>` for zero-jank real-time streaming:
- `#[tauri::command] fn get_pc_hardware_capabilities() -> SystemHealthReport`
- `#[tauri::command] fn solve_dcdc_native(state: DcDcDesignState) -> Result<DcDcSimulationResult, String>`
- `#[tauri::command] fn solve_acdc_native(state: AcDcDesignState) -> Result<AcDcSimulationResult, String>`

### 4. Create Frontend Hybrid Adapter (`/src/bridge/tauriBridge.ts`)
Create a clean TypeScript bridge in `/src/bridge/tauriBridge.ts` that detects whether the app is running inside the Tauri native `.exe` window (`'__TAURI_INTERNALS__' in window`) or a standard browser:
- When running in the `.exe`, route solver calls, file dialogs, and hardware sweeps through `invoke()` from `@tauri-apps/api/core`.
- Display a native hardware badge in the top header bar showing the detected CPU thread count, AVX2 status, and active GPU adapter.

---

## Verification Criteria
1. Run `cargo check --manifest-path src-tauri/Cargo.toml` and confirm 0 warnings and 0 errors.
2. Run `npm run build` to verify the TypeScript frontend compiles cleanly.
3. Launch `npx tauri dev` and verify the native Windows window opens at 60 FPS with the PC Hardware Telemetry badge active.
