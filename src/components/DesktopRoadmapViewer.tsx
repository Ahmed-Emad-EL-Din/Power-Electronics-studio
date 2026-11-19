import React, { useState } from 'react';
import {
  Terminal,
  Cpu,
  Copy,
  Check,
  Download,
  FolderOpen,
  FileText,
  Layers,
  HardDrive,
  Gauge,
  Wrench,
  Usb,
  CircuitBoard,
  PackageCheck,
} from 'lucide-react';

import masterRoadmapTxt from '../../antigravity-desktop-roadmap/00-PLAIN-ROADMAP.txt?raw';
import prompt01Md from '../../antigravity-desktop-roadmap/prompts/01-foundation-tauri-v2-rust-workspace.md?raw';
import prompt02Md from '../../antigravity-desktop-roadmap/prompts/02-multicore-simd-pareto-monte-carlo-engine.md?raw';
import prompt03Md from '../../antigravity-desktop-roadmap/prompts/03-gpu-fem-magnetics-and-thermal-solver.md?raw';
import prompt04Md from '../../antigravity-desktop-roadmap/prompts/04-native-ngspice-ltspice-transient-bridge.md?raw';
import prompt05Md from '../../antigravity-desktop-roadmap/prompts/05-sqlite-offline-catalog-and-spice-parser.md?raw';
import prompt06Md from '../../antigravity-desktop-roadmap/prompts/06-usb-serial-visa-hil-instrument-control.md?raw';
import prompt07Md from '../../antigravity-desktop-roadmap/prompts/07-kicad-pcb-step-3d-and-firmware-export.md?raw';
import prompt08Md from '../../antigravity-desktop-roadmap/prompts/08-agent-mcp-tools-and-exe-release-pipeline.md?raw';

export interface RoadmapFileItem {
  id: string;
  phase: string;
  filename: string;
  relativePath: string;
  title: string;
  pcHardwareGain: string;
  requiredTools: string[];
  content: string;
  icon: 'roadmap' | 'tauri' | 'simd' | 'gpu' | 'spice' | 'sqlite' | 'hil' | 'eda' | 'exe';
}

const ROADMAP_FILES: RoadmapFileItem[] = [
  {
    id: '00-master',
    phase: 'MASTER PLAN',
    filename: '00-PLAIN-ROADMAP.txt',
    relativePath: '/antigravity-desktop-roadmap/00-PLAIN-ROADMAP.txt',
    title: 'Plain-Text Master Architecture & PC Hardware Execution Roadmap',
    pcHardwareGain: 'Full Tauri v2 + Rust + GPU + Native Sidecar blueprint & folder tree',
    requiredTools: ['rustup (MSVC x64)', 'Tauri v2 CLI', 'filesystem-mcp', 'terminal-mcp', 'sqlite-mcp'],
    content: masterRoadmapTxt,
    icon: 'roadmap',
  },
  {
    id: '01-tauri',
    phase: 'PROMPT 01',
    filename: '01-foundation-tauri-v2-rust-workspace.md',
    relativePath: '/antigravity-desktop-roadmap/prompts/01-foundation-tauri-v2-rust-workspace.md',
    title: 'Tauri v2 + Rust Cargo Workspace Foundation & Zero-Copy IPC Bridge',
    pcHardwareGain: 'Eliminates browser sandbox; enables native OS threads, file I/O & AVX2 compilation flags',
    requiredTools: ['@tauri-apps/cli@^2.0', 'rustc MSVC', 'serde', 'tauri::ipc::Channel'],
    content: prompt01Md,
    icon: 'tauri',
  },
  {
    id: '02-simd',
    phase: 'PROMPT 02',
    filename: '02-multicore-simd-pareto-monte-carlo-engine.md',
    relativePath: '/antigravity-desktop-roadmap/prompts/02-multicore-simd-pareto-monte-carlo-engine.md',
    title: 'Multi-Core CPU (Rayon + AVX2 SIMD) Physics, 100k Pareto & 50k Monte Carlo',
    pcHardwareGain: '16–64 CPU cores run 100,000+ Pareto sweeps & 50,000 tolerance runs in <200 ms',
    requiredTools: ['rayon 1.10', 'wide (f64x4 SIMD)', 'nalgebra 0.33', 'num-complex'],
    content: prompt02Md,
    icon: 'simd',
  },
  {
    id: '03-gpu',
    phase: 'PROMPT 03',
    filename: '03-gpu-fem-magnetics-and-thermal-solver.md',
    relativePath: '/antigravity-desktop-roadmap/prompts/03-gpu-fem-magnetics-and-thermal-solver.md',
    title: 'GPU Compute (wgpu DirectX 12 / Vulkan) 2D/3D Magnetic Fringing & PCB Thermal FEM',
    pcHardwareGain: '512×512 Poisson magnetic vector potential A_z & 3D heatsink thermal solve in <35 ms on GPU',
    requiredTools: ['wgpu 22 (DX12/Vulkan)', 'WGSL Compute Shaders', 'FEMM 4.2 Sidecar (femm.exe)'],
    content: prompt03Md,
    icon: 'gpu',
  },
  {
    id: '04-spice',
    phase: 'PROMPT 04',
    filename: '04-native-ngspice-ltspice-transient-bridge.md',
    relativePath: '/antigravity-desktop-roadmap/prompts/04-native-ngspice-ltspice-transient-bridge.md',
    title: 'Native ngspice.dll FFI & Headless LTspice.exe -b Transient Simulation Bridge',
    pcHardwareGain: 'Sub-nanosecond parasitic ringing, non-linear Coss ZVS & LISN EMI FFT with real SPICE engines',
    requiredTools: ['ngspice.dll (C FFI libloading)', 'LTspice.exe -b -Run', 'Binary .raw parser'],
    content: prompt04Md,
    icon: 'spice',
  },
  {
    id: '05-sqlite',
    phase: 'PROMPT 05',
    filename: '05-sqlite-offline-catalog-and-spice-parser.md',
    relativePath: '/antigravity-desktop-roadmap/prompts/05-sqlite-offline-catalog-and-spice-parser.md',
    title: 'Local SQLite 500k+ Part Vault, Vendor .lib SPICE Parser & Curve Digitizer',
    pcHardwareGain: '<2 ms SQL queries across 500k+ parts + automated Double-Pulse Testbench on dropped .lib files',
    requiredTools: ['rusqlite (bundled + FTS5)', 'ngspice DPT Extractor', 'LCSC/DigiKey CSV Importer'],
    content: prompt05Md,
    icon: 'sqlite',
  },
  {
    id: '06-hil',
    phase: 'PROMPT 06',
    filename: '06-usb-serial-visa-hil-instrument-control.md',
    relativePath: '/antigravity-desktop-roadmap/prompts/06-usb-serial-visa-hil-instrument-control.md',
    title: 'PC Hardware-in-the-Loop (HIL): VISA/SCPI Oscilloscope & Live DSP UART/CAN Tuning',
    pcHardwareGain: 'Overlay live Keysight/Rigol/Bode100 traces & hot-swap 2p2z/3p3z coefficients into C2000/STM32 RAM',
    requiredTools: ['tokio-serial', 'rusb (USB-TMC)', 'SCPI TCP/IP Socket (Port 5025)', 'CRC-16 Telemetry'],
    content: prompt06Md,
    icon: 'hil',
  },
  {
    id: '07-eda',
    phase: 'PROMPT 07',
    filename: '07-kicad-pcb-step-3d-and-firmware-export.md',
    relativePath: '/antigravity-desktop-roadmap/prompts/07-kicad-pcb-step-3d-and-firmware-export.md',
    title: 'Native KiCad 8 (.kicad_sch/.kicad_pcb), 3D .STEP Core & Full C2000/STM32 Project Export',
    pcHardwareGain: 'Direct disk generation of hierarchical KiCad 8 schematics, IPC-2221B HV rules & 3D STEP cores',
    requiredTools: ['kicad-cli.exe', 'ISO 10303-21 STEP Writer', 'TI CCS / STM32CubeIDE Generator'],
    content: prompt07Md,
    icon: 'eda',
  },
  {
    id: '08-exe',
    phase: 'PROMPT 08',
    filename: '08-agent-mcp-tools-and-exe-release-pipeline.md',
    relativePath: '/antigravity-desktop-roadmap/prompts/08-agent-mcp-tools-and-exe-release-pipeline.md',
    title: 'Antigravity Agent Self-Verification Harness & Windows .EXE / .MSI Packaging',
    pcHardwareGain: 'Automated physics regression tests + LTO fat AVX2 native Windows .exe & .msi installer build',
    requiredTools: ['tauri build (NSIS + MSI)', 'cargo test --release', 'WebView2 Bootstrapper'],
    content: prompt08Md,
    icon: 'exe',
  },
];

export const DesktopRoadmapViewer: React.FC = () => {
  const [selectedId, setSelectedId] = useState<string>(ROADMAP_FILES[0].id);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState<boolean>(false);

  const activeFile = ROADMAP_FILES.find((f) => f.id === selectedId) ?? ROADMAP_FILES[0];

  const handleCopy = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleCopyAllBundle = async () => {
    const combined = ROADMAP_FILES.map(
      (f) =>
        `################################################################################\n# FILE: ${f.relativePath}\n# PHASE: ${f.phase} — ${f.title}\n################################################################################\n\n${f.content}\n\n`
    ).join('\n');
    try {
      await navigator.clipboard.writeText(combined);
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2500);
    } catch {
      // ignore
    }
  };

  const handleDownloadSingle = (file: RoadmapFileItem) => {
    const blob = new Blob([file.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadFullBundle = () => {
    const combined = ROADMAP_FILES.map(
      (f) =>
        `################################################################################\n# FILE: ${f.relativePath}\n# PHASE: ${f.phase} — ${f.title}\n################################################################################\n\n${f.content}\n\n`
    ).join('\n');
    const blob = new Blob([combined], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'antigravity-desktop-exe-roadmap-and-prompts-bundle.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  const renderIcon = (iconType: RoadmapFileItem['icon']) => {
    switch (iconType) {
      case 'roadmap':
        return <FolderOpen className="w-4 h-4 text-amber-500" />;
      case 'tauri':
        return <Terminal className="w-4 h-4 text-cyan-500" />;
      case 'simd':
        return <Cpu className="w-4 h-4 text-emerald-500" />;
      case 'gpu':
        return <Layers className="w-4 h-4 text-purple-500" />;
      case 'spice':
        return <Gauge className="w-4 h-4 text-rose-500" />;
      case 'sqlite':
        return <HardDrive className="w-4 h-4 text-sky-500" />;
      case 'hil':
        return <Usb className="w-4 h-4 text-orange-500" />;
      case 'eda':
        return <CircuitBoard className="w-4 h-4 text-teal-500" />;
      case 'exe':
        return <PackageCheck className="w-4 h-4 text-indigo-500" />;
    }
  };

  return (
    <div className="space-y-4">
      {/* TOP BANNER: PC .EXE ARCHITECTURE & HARDWARE ACCELERATION MATRIX */}
      <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-xs font-mono font-medium mb-2">
              <FolderOpen className="w-3.5 h-3.5" />
              /antigravity-desktop-roadmap/
            </div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              Native Windows <span className="font-mono text-cyan-600 dark:text-cyan-400">.EXE</span> Agent Roadmap &amp; Prompt Suite (Antigravity / Desktop AI Agent)
            </h1>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 max-w-4xl">
              Complete 8-stage prompt folder and plain-text master roadmap instructing an autonomous coding agent how to port this workbench into a native 64-bit Windows executable (<code className="font-mono text-cyan-600 dark:text-cyan-400">PowerStageStudio.exe</code>) using <strong>Tauri v2 + Rust (`rayon` AVX2 SIMD + `wgpu` DX12/Vulkan + `ngspice.dll` FFI + `LTspice.exe` CLI + `rusqlite` + USB/VISA HIL)</strong>.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleCopyAllBundle}
              className="px-3 py-2 text-xs font-mono font-semibold rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white transition-colors inline-flex items-center gap-1.5 cursor-pointer shadow-sm"
            >
              {copiedAll ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copiedAll ? 'Copied All 9 Files!' : 'Copy Full Roadmap + All 8 Prompts'}
            </button>
            <button
              type="button"
              onClick={handleDownloadFullBundle}
              className="px-3 py-2 text-xs font-mono font-semibold rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 transition-colors inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Download Bundle (.txt)
            </button>
          </div>
        </div>

        {/* PC Hardware Gains Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-4 pt-4 border-t border-slate-200 dark:border-slate-800">
          <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2 text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">
              <Cpu className="w-4 h-4" />
              1. Multi-Core CPU (Rayon + AVX2)
            </div>
            <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1">
              Evaluates <strong>100,000+ Pareto designs</strong> &amp; <strong>50,000 Monte Carlo</strong> tolerance runs across all 16–64 CPU threads in <strong>&lt;180 ms</strong> instead of freezing the browser thread.
            </p>
          </div>

          <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2 text-xs font-mono font-bold text-purple-600 dark:text-purple-400">
              <Layers className="w-4 h-4" />
              2. GPU DirectX 12 / Vulkan FEM
            </div>
            <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1">
              Solves <strong>512×512 2D/3D Poisson Magnetic Vector Potential ($A_z$)</strong> air-gap fringing flux &amp; 3D PCB/heatsink finite-volume thermal fields on GPU shaders.
            </p>
          </div>

          <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2 text-xs font-mono font-bold text-rose-600 dark:text-rose-400">
              <Gauge className="w-4 h-4" />
              3. Native ngspice.dll &amp; LTspice.exe
            </div>
            <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1">
              Zero-copy C FFI to embedded <code className="font-mono">ngspice.dll</code> + headless <code className="font-mono">LTspice.exe -b</code> batch runner &amp; binary <code className="font-mono">.raw</code> parser for exact switching transients.
            </p>
          </div>

          <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2 text-xs font-mono font-bold text-orange-600 dark:text-orange-400">
              <Usb className="w-4 h-4" />
              4. USB/VISA Scope &amp; Live DSP HIL
            </div>
            <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1">
              Streams live SCPI waveforms from Rigol/Keysight/Bode 100 &amp; hot-swaps 2p2z/3p3z compensator coefficients into TI C2000 / STM32G4 RAM over UART/CAN-FD.
            </p>
          </div>
        </div>
      </div>

      {/* MAIN 2-COLUMN WORKSPACE: FILE TREE SIDEBAR + PROMPT INSPECTOR */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* LEFT COLUMN: FOLDER FILE SELECTOR */}
        <div className="lg:col-span-4 bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl p-3 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between px-2 pb-2.5 mb-2 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2 text-xs font-mono font-bold text-slate-800 dark:text-slate-200">
                <FolderOpen className="w-4 h-4 text-cyan-500" />
                /antigravity-desktop-roadmap/
              </div>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                9 Files
              </span>
            </div>

            <div className="space-y-1.5">
              {ROADMAP_FILES.map((item) => {
                const isSelected = item.id === activeFile.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedId(item.id)}
                    className={`w-full text-left p-2.5 rounded-lg border transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-cyan-500/10 dark:bg-cyan-500/15 border-cyan-500/60 shadow-xs'
                        : 'bg-slate-50/70 dark:bg-slate-900/50 border-slate-200/80 dark:border-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-mono font-bold text-cyan-700 dark:text-cyan-400">
                        {renderIcon(item.icon)}
                        {item.phase}
                      </span>
                      <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 truncate">
                        {item.filename}
                      </span>
                    </div>
                    <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 mt-1 leading-snug">
                      {item.title}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-1">
                      {item.pcHardwareGain}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Agent Execution Tip Box */}
          <div className="mt-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-slate-700 dark:text-slate-300">
            <div className="font-mono font-bold text-amber-700 dark:text-amber-300 flex items-center gap-1.5 mb-1">
              <Wrench className="w-3.5 h-3.5" />
              How to Use with Antigravity / Cursor / Claude Code
            </div>
            <p className="text-[11px] leading-relaxed">
              1. Open this repository on your Windows PC.<br />
              2. Point your AI agent to <code className="font-mono">/antigravity-desktop-roadmap/00-PLAIN-ROADMAP.txt</code> as system context.<br />
              3. Feed <strong>Prompts 01 through 08</strong> sequentially. Each prompt includes deterministic <code className="font-mono">cargo test</code> &amp; <code className="font-mono">tauri build</code> verification gates.
            </p>
          </div>
        </div>

        {/* RIGHT COLUMN: ACTIVE FILE VIEWER & ONE-CLICK COPY */}
        <div className="lg:col-span-8 bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl flex flex-col overflow-hidden">
          {/* Viewer Header */}
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 text-[11px] font-mono font-bold rounded bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border border-cyan-500/30">
                  {activeFile.phase}
                </span>
                <code className="text-xs font-mono text-slate-600 dark:text-slate-400">
                  {activeFile.relativePath}
                </code>
              </div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 mt-1.5">
                {activeFile.title}
              </h2>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleCopy(activeFile.content, activeFile.id)}
                className="px-3 py-1.5 text-xs font-mono font-semibold rounded-md bg-cyan-600 hover:bg-cyan-500 text-white transition-colors inline-flex items-center gap-1.5 cursor-pointer"
              >
                {copiedId === activeFile.id ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    Copied to Clipboard!
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    Copy Prompt
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => handleDownloadSingle(activeFile)}
                className="px-2.5 py-1.5 text-xs font-mono rounded-md bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 transition-colors inline-flex items-center gap-1.5 cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5" />
                Download {activeFile.filename}
              </button>
            </div>
          </div>

          {/* Required Tools & Crates Bar */}
          <div className="px-4 py-2.5 bg-slate-100/80 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-mono font-semibold text-slate-500 dark:text-slate-400">
              Required PC Tools / Crates:
            </span>
            {activeFile.requiredTools.map((tool) => (
              <span
                key={tool}
                className="px-2 py-0.5 text-[11px] font-mono rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300"
              >
                {tool}
              </span>
            ))}
          </div>

          {/* Prompt / Roadmap Code Content */}
          <div className="p-4 flex-1 overflow-y-auto max-h-[680px] bg-slate-950 text-slate-100">
            <pre className="text-xs font-mono leading-relaxed whitespace-pre-wrap break-words select-all">
              {activeFile.content}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};
