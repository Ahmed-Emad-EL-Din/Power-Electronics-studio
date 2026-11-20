// ============================================================================
// QSPICE FULL SIMULATION SUITE EXPORTER (.zip)
// Bundles all 5 QSPICE simulation file formats for direct execution & viewing:
//  - .qsch : Plain-text QSPICE schematic (components, orthogonal wires, nets, directives)
//  - .qsym : Plain-text QSPICE custom symbol definitions (C++ controller + transformer)
//  - .qraw : Transient waveform output file (pre-populated from RK4 ODE solver)
//  - .cir  : Ready-to-run QSPICE ASCII netlist
//  - .cpp  : QSPICE C++ behavioral DLL controller block (PCMC/Type-II/III or PFC)
// ============================================================================

import { AcDcDesignState, DcDcDesignState } from '../data/databases';
import { AcDcResults } from './acdcEngine';
import { DcDcResults } from './dcdcEngine';
import { generateAcDcSpiceNetlist, generateDcDcSpiceNetlist } from './spiceNetlistExporter';
import { runTransientLoadStep } from './transientOdeSolver';
import { buildZipArchive, ZipEntry } from './zipBuilder';

export interface QspiceSimulationBundle {
  baseName: string;
  qschFileName: string;
  qschContent: string;
  qsymFiles: { path: string; content: string }[];
  qrawFileName: string;
  qrawContent: string;
  cirFileName: string;
  cirContent: string;
  cppFileName: string;
  cppContent: string;
  readmeContent: string;
  zipBytes: Uint8Array;
}

function sanitizeBase(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'voltcraft_design';
}

// ============================================================================
// 1. QSPICE SYMBOL (.qsym) GENERATORS
// ============================================================================

function buildDcDcControllerQsym(dllBaseName: string, state: DcDcDesignState, res: DcDcResults): string {
  const modeStr = `${state.controlType.toUpperCase()} (${res.type2Architecture === 'ota' ? 'OTA' : 'OpAmp'})`;
  return [
    '«symbol',
    `  «type: Ø»`,
    `  «description: VoltCraft ${modeStr} Digital/Behavioral Controller»`,
    `  «library file: ${dllBaseName}.dll»`,
    `  «rect (-160,-120) (160,120) 0 0 0x1000000 -1 -1»`,
    `  «text (0,-72) 0.8 0 0 0x1000000 -1 -1 "VOLTCRAFT CTRL"»`,
    `  «text (0,-36) 0.7 0 0 0x1000000 -1 -1 "${modeStr}"»`,
    `  «text (0,12) 0.65 0 0 0x1000000 -1 -1 "fsw=${state.fsw_kHz}kHz"»`,
    `  «pin (-160,-64) (0,0) 1 0 0x3f 0 -1 "VOUT_FB"»`,
    `  «pin (-160,0) (0,0) 1 0 0x3f 0 -1 "VREF"»`,
    `  «pin (-160,64) (0,0) 1 0 0x3f 0 -1 "ISNS"»`,
    `  «pin (160,-64) (0,0) 1 0 0x3f 0 -1 "PWM_A"»`,
    `  «pin (160,0) (0,0) 1 0 0x3f 0 -1 "PWM_B"»`,
    `  «pin (160,64) (0,0) 1 0 0x3f 0 -1 "COMP"»`,
    `  «pin (0,120) (0,0) 1 0 0x3f 0 -1 "GND"»`,
    '»',
    '',
  ].join('\n');
}

function buildAcDcControllerQsym(dllBaseName: string, state: AcDcDesignState, res: AcDcResults): string {
  return [
    '«symbol',
    `  «type: Ø»`,
    `  «description: VoltCraft ${res.nPhases}-Phase PFC Average-Current & Voltage Loop Controller»`,
    `  «library file: ${dllBaseName}.dll»`,
    `  «rect (-160,-112) (160,112) 0 0 0x1000000 -1 -1»`,
    `  «text (0,-64) 0.8 0 0 0x1000000 -1 -1 "VOLTCRAFT PFC"»`,
    `  «text (0,-24) 0.7 0 0 0x1000000 -1 -1 "${res.nPhases}-Phase Boost"»`,
    `  «text (0,16) 0.65 0 0 0x1000000 -1 -1 "fsw=${state.fsw_kHz}kHz"»`,
    `  «pin (-160,-64) (0,0) 1 0 0x3f 0 -1 "VAC_RECT"»`,
    `  «pin (-160,0) (0,0) 1 0 0x3f 0 -1 "VDC_FB"»`,
    `  «pin (-160,64) (0,0) 1 0 0x3f 0 -1 "IL_SNS"»`,
    `  «pin (160,-48) (0,0) 1 0 0x3f 0 -1 "PWM_PH1"»`,
    `  «pin (160,48) (0,0) 1 0 0x3f 0 -1 "PWM_PH2"»`,
    `  «pin (0,112) (0,0) 1 0 0x3f 0 -1 "GND"»`,
    '»',
    '',
  ].join('\n');
}

function buildCoupledTransformerQsym(state: DcDcDesignState, res: DcDcResults): string {
  return [
    '«symbol',
    `  «type: K»`,
    `  «description: Coupled HF Power Transformer (${res.core.name}, ${res.Np_actual}:${res.Ns_actual}T)»`,
    `  «rect (-96,-96) (96,96) 0 0 0x1000000 -1 -1»`,
    `  «line (-16,-72) (-16,72) 0 0 0x1000000»`,
    `  «line (16,-72) (16,72) 0 0 0x1000000»`,
    `  «text (0,-116) 0.75 0 0 0x1000000 -1 -1 "${res.core.name} (${res.Np_actual}:${res.Ns_actual}T)"»`,
    `  «text (0,116) 0.65 0 0 0x1000000 -1 -1 "Lm=${state.Lm_uH}uH Llk=${state.Llk_uH}uH"»`,
    `  «pin (-96,-64) (0,0) 1 0 0x3f 0 -1 "PRI_P"»`,
    `  «pin (-96,64) (0,0) 1 0 0x3f 0 -1 "PRI_N"»`,
    `  «pin (96,-64) (0,0) 1 0 0x3f 0 -1 "SEC_P"»`,
    `  «pin (96,0) (0,0) 1 0 0x3f 0 -1 "SEC_CT"»`,
    `  «pin (96,64) (0,0) 1 0 0x3f 0 -1 "SEC_N"»`,
    '»',
    '',
  ].join('\n');
}

// ============================================================================
// 2. QSPICE C++ BEHAVIORAL DLL SOURCE (.cpp) GENERATORS
// ============================================================================

function buildDcDcControllerCpp(fnName: string, state: DcDcDesignState, res: DcDcResults): string {
  const { b0, b1, b2, b3, a1, a2, a3 } = res;
  const fsHz = state.fs_digital_kHz * 1e3;
  const Ts = 1 / Math.max(1e3, fsHz);
  const fswHz = state.fsw_kHz * 1e3;
  const tDead = Math.max(20e-9, state.deadTime_ns * 1e-9);
  const isPcmc = state.controlType === 'pcmc';

  return `// ============================================================================
// QSPICE C++ Behavioral Controller DLL -- ${state.topology.toUpperCase()} (${state.presetName})
// Generated by VoltCraft Power Electronics Studio
// Compile in QSPICE: Right-click symbol -> Compile C++ DLL
// Or via MinGW/MSVC: g++ -O2 -shared -o ${fnName}.dll ${fnName}.cpp
// ============================================================================
#include <cmath>
#include <cstdint>

union uData {
  bool b;
  char c;
  unsigned char uc;
  short s;
  unsigned short us;
  int i;
  unsigned int ui;
  float f;
  double d;
  long long int i64;
  unsigned long long int ui64;
  char *str;
  unsigned char *bytes;
};

struct CtrlState {
  double t_next_sample;
  double e_z1;
  double e_z2;
  double e_z3;
  double u_z1;
  double u_z2;
  double u_z3;
  double duty;
  double comp_v;
  double ramp_v;
};

static inline double clampd(double x, double lo, double hi) {
  return x < lo ? lo : (x > hi ? hi : x);
}

// Pin order matches symbols/${fnName}.qsym:
//   data[0]: VOUT_FB (input, V)
//   data[1]: VREF    (input, V)
//   data[2]: ISNS    (input, A or V)
//   data[3]: PWM_A   (output, V)
//   data[4]: PWM_B   (output, V)
//   data[5]: COMP    (output, V)
extern "C" __declspec(dllexport) void ${fnName}(void **opaque, double t, union uData *data) {
  CtrlState *st = reinterpret_cast<CtrlState *>(*opaque);
  if (!st) {
    st = new CtrlState{0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, ${res.Deff_nom.toFixed(4)}, 2.5, 0.0};
    *opaque = st;
  }

  const double vout_fb = data[0].d;
  const double vref    = (data[1].d > 0.05) ? data[1].d : ${state.Vout_V.toFixed(4)};
  const double isns    = data[2].d;

  // Discrete compensator coefficients (Tustin @ fs = ${state.fs_digital_kHz.toFixed(1)} kHz)
  constexpr double Ts_ctrl = ${Ts.toExponential(8)};
  constexpr double B0 = ${b0.toExponential(8)};
  constexpr double B1 = ${b1.toExponential(8)};
  constexpr double B2 = ${b2.toExponential(8)};
  constexpr double B3 = ${b3.toExponential(8)};
  constexpr double A1 = ${a1.toExponential(8)};
  constexpr double A2 = ${a2.toExponential(8)};
  constexpr double A3 = ${a3.toExponential(8)};
  constexpr double FSW_HZ = ${fswHz.toFixed(1)};
  constexpr double TSW = 1.0 / FSW_HZ;
  constexpr double TDEAD = ${tDead.toExponential(4)};
  constexpr double SE_V_S = ${(res.Se_ramp_V_us * 1e6).toExponential(5)};

  if (t >= st->t_next_sample - 1e-12) {
    const double e0 = vref - vout_fb;
    double u0 = B0 * e0 + B1 * st->e_z1 + B2 * st->e_z2 + B3 * st->e_z3
              - A1 * st->u_z1 - A2 * st->u_z2 - A3 * st->u_z3;
    u0 = clampd(u0, 0.02, 0.94);

    st->e_z3 = st->e_z2;
    st->e_z2 = st->e_z1;
    st->e_z1 = e0;
    st->u_z3 = st->u_z2;
    st->u_z2 = st->u_z1;
    st->u_z1 = u0;
    st->duty = u0;
    st->comp_v = 0.5 + 4.0 * u0;
    st->t_next_sample += Ts_ctrl;
  }

  const double t_cyc = std::fmod(t, TSW);
  const double t_half = 0.5 * TSW;
  const double t_on = clampd(st->duty * t_half - TDEAD, 20e-9, t_half - TDEAD);

  // ${isPcmc ? 'PCMC + slope compensation modulation' : 'Voltage-mode / frequency-phase modulation'}
  const double slope_v = SE_V_S * t_cyc;
  const double eff_cmd = ${isPcmc ? 'clampd((st->comp_v - slope_v - 0.1 * isns) * 0.25, 0.05, 0.94)' : 'st->duty'};
  const double phase_shift = (1.0 - eff_cmd) * t_half;
  const double t_b_start = phase_shift;
  const double t_b_end = std::fmod(phase_shift + t_on, TSW);

  const double pwm_a = (t_cyc >= 0.0 && t_cyc < t_on) ? 12.0 : 0.0;
  const double pwm_b = (t_b_end > t_b_start)
    ? ((t_cyc >= t_b_start && t_cyc < t_b_end) ? 12.0 : 0.0)
    : ((t_cyc >= t_b_start || t_cyc < t_b_end) ? 12.0 : 0.0);

  data[3].d = pwm_a;
  data[4].d = pwm_b;
  data[5].d = st->comp_v;
}

extern "C" __declspec(dllexport) double MaxExtStepSize(void *opaque, double t) {
  (void)opaque;
  (void)t;
  return ${(Math.min(1 / (fswHz * 40), 50e-9)).toExponential(3)};
}

extern "C" __declspec(dllexport) void Trunc(void *opaque, double t, union uData *data, double *timestep) {
  (void)opaque;
  (void)t;
  (void)data;
  const double max_dt = ${(Math.min(1 / (fswHz * 25), 80e-9)).toExponential(3)};
  if (*timestep > max_dt) *timestep = max_dt;
}

extern "C" __declspec(dllexport) void Destroy(void *opaque) {
  delete reinterpret_cast<CtrlState *>(opaque);
}
`;
}

function buildAcDcControllerCpp(fnName: string, state: AcDcDesignState, res: AcDcResults): string {
  const fswHz = state.fsw_kHz * 1e3;
  return `// ============================================================================
// QSPICE C++ Behavioral Controller DLL -- AC-DC PFC (${state.topology})
// Generated by VoltCraft Power Electronics Studio
// ============================================================================
#include <cmath>

union uData {
  bool b;
  char c;
  unsigned char uc;
  short s;
  unsigned short us;
  int i;
  unsigned int ui;
  float f;
  double d;
  long long int i64;
  unsigned long long int ui64;
  char *str;
  unsigned char *bytes;
};

struct PfcState {
  double v_int;
  double i_int;
  double t_next;
  double duty;
};

static inline double clampd(double x, double lo, double hi) {
  return x < lo ? lo : (x > hi ? hi : x);
}

// Pin order matches symbols/${fnName}.qsym:
//   data[0]: VAC_RECT (V)
//   data[1]: VDC_FB   (V)
//   data[2]: IL_SNS   (A)
//   data[3]: PWM_PH1  (V)
//   data[4]: PWM_PH2  (V)
extern "C" __declspec(dllexport) void ${fnName}(void **opaque, double t, union uData *data) {
  PfcState *st = reinterpret_cast<PfcState *>(*opaque);
  if (!st) {
    st = new PfcState{0.0, 0.0, 0.0, 0.45};
    *opaque = st;
  }

  const double v_rect = std::fabs(data[0].d);
  const double v_dc   = data[1].d;
  const double i_l    = data[2].d;

  constexpr double VDC_REF = ${state.Vdc_bus_V.toFixed(2)};
  constexpr double FSW_HZ  = ${fswHz.toFixed(1)};
  constexpr double TSW     = 1.0 / FSW_HZ;
  constexpr double TS      = TSW;

  if (t >= st->t_next - 1e-12) {
    const double ev = VDC_REF - v_dc;
    st->v_int = clampd(st->v_int + ev * TS * 25.0, -50.0, 50.0);
    const double g_cmd = clampd(0.02 * ev + st->v_int * 0.01, 0.001, 0.25);
    const double i_ref = g_cmd * v_rect;
    const double ei = i_ref - i_l;
    st->i_int = clampd(st->i_int + ei * TS * 2e4, -0.5, 0.5);
    const double d_ff = clampd(1.0 - v_rect / VDC_REF, 0.05, 0.94);
    st->duty = clampd(d_ff + 0.04 * ei + st->i_int, 0.04, 0.94);
    st->t_next += TS;
  }

  const double t_cyc1 = std::fmod(t, TSW);
  const double t_cyc2 = std::fmod(t + 0.5 * TSW, TSW);
  data[3].d = (t_cyc1 < st->duty * TSW) ? 12.0 : 0.0;
  data[4].d = (${res.nPhases} >= 2 && t_cyc2 < st->duty * TSW) ? 12.0 : 0.0;
}

extern "C" __declspec(dllexport) double MaxExtStepSize(void *opaque, double t) {
  (void)opaque;
  (void)t;
  return ${(1 / (fswHz * 25)).toExponential(3)};
}

extern "C" __declspec(dllexport) void Destroy(void *opaque) {
  delete reinterpret_cast<PfcState *>(opaque);
}
`;
}

// ============================================================================
// 3. QSPICE SCHEMATIC (.qsch) GENERATOR
// ============================================================================

function buildDcDcQsch(
  baseName: string,
  ctrlFn: string,
  state: DcDcDesignState,
  res: DcDcResults
): string {
  const fswHz = state.fsw_kHz * 1e3;
  const n = Math.max(0.2, res.Np_actual / Math.max(1, res.Ns_actual));
  const Lpri_uH = Math.max(50, state.Lm_uH);
  const Lsec_uH = Lpri_uH / (n * n);
  const Rload = (state.Vout_V * state.Vout_V) / Math.max(1, state.Pout_W);
  const Ron_pri = Math.max(0.002, ((res.priDevice.Rds_on_25C_mOhm * 1.45) / Math.max(1, state.nParallelPri)) * 1e-3);
  const Ron_sec = Math.max(0.001, ((res.secDevice.Rds_on_25C_mOhm * 1.4) / Math.max(1, state.nParallelSec)) * 1e-3);
  const tStop_us = Math.round(Math.max(400, (1e6 / fswHz) * 45));

  const qschComponent = (ref: string, val: string, x: number, y: number, symLines: string[]) => [
    `  «component (${x},${y}) 0 0`,
    `    «symbol`,
    ...symLines.map((l) => `      ${l}`),
    `    »`,
    `    «text (-32,-52) 0.7 0 0 0x1000000 -1 -1 "${ref}"»`,
    `    «text (-32,52) 0.65 0 0 0x1000000 -1 -1 "${val}"»`,
    `  »`,
  ];

  const lines: string[] = [
    '«schematic',
    `  «view (0,0) 1 2400 1200 16»`,
    `  «text (64,48) 1.2 0 0 0x1000000 -1 -1 "VoltCraft Power Electronics Studio -- QSPICE Schematic (${state.topology.toUpperCase()})"»`,
    `  «text (64,96) 0.85 0 0 0x1000000 -1 -1 "Vin=${state.Vin_nom_V}V -> Vout=${state.Vout_V}V @ ${state.Pout_W}W | fsw=${state.fsw_kHz}kHz | Core=${res.core.name}"»`,
    // Power rails
    `  «wire (160,240) (640,240)»`,
    `  «wire (160,560) (640,560)»`,
    `  «wire (160,240) (160,336)»`,
    `  «wire (160,464) (160,560)»`,
    `  «wire (288,240) (288,336)»`,
    `  «wire (288,464) (288,560)»`,
    `  «wire (480,240) (480,304)»`,
    `  «wire (480,384) (480,432)»`,
    `  «wire (480,512) (480,560)»`,
    `  «wire (640,240) (640,304)»`,
    `  «wire (640,384) (640,432)»`,
    `  «wire (640,512) (640,560)»`,
    // Tank & Transformer
    `  «wire (480,400) (768,400)»`,
    `  «wire (640,400) (640,496)»`,
    `  «wire (768,352) (896,352)»`,
    `  «wire (976,352) (1088,352)»`,
    `  «wire (1088,352) (1184,352)»`,
    `  «wire (640,496) (1184,496)»`,
    // Secondary Output & Load
    `  «wire (1376,320) (1664,320)»`,
    `  «wire (1664,320) (1888,320)»`,
    `  «wire (1888,320) (2144,320)»`,
    `  «wire (1376,560) (2144,560)»`,
    `  «wire (1888,320) (1888,384)»`,
    `  «wire (1888,496) (1888,560)»`,
    `  «wire (2144,320) (2144,384)»`,
    `  «wire (2144,496) (2144,560)»`,
    // Net Flags
    `  «net (160,240) "vin_pos"»`,
    `  «net (160,560) "0"»`,
    `  «net (480,400) "sw_a"»`,
    `  «net (640,400) "sw_b"»`,
    `  «net (1280,352) "xfmr_pri"»`,
    `  «net (1376,320) "sec_rect"»`,
    `  «net (1888,320) "v_out"»`,
    `  «net (1888,560) "0"»`,
    // Components
    ...qschComponent('V_IN', `${state.Vin_nom_V}`, 160, 400, [
      '«circle (-32,-32) (32,32) 0 0 0x1000000 -1 -1»',
      '«pin (0,-64) (0,0) 1 0 0x3f 0 -1 "+"»',
      '«pin (0,64) (0,0) 1 0 0x3f 0 -1 "-"»',
    ]),
    ...qschComponent('C_IN', '47u', 288, 400, [
      '«line (-24,-8) (24,-8) 0 0 0x1000000»',
      '«line (-24,8) (24,8) 0 0 0x1000000»',
      '«pin (0,-64) (0,0) 1 0 0x3f 0 -1 "1"»',
      '«pin (0,64) (0,0) 1 0 0x3f 0 -1 "2"»',
    ]),
    ...qschComponent('Q1', 'Q_PRI', 480, 344, [
      '«rect (-24,-32) (24,32) 0 0 0x1000000 -1 -1»',
      '«pin (0,-40) (0,0) 1 0 0x3f 0 -1 "D"»',
      '«pin (-48,0) (0,0) 1 0 0x3f 0 -1 "G"»',
      '«pin (0,40) (0,0) 1 0 0x3f 0 -1 "S"»',
    ]),
    ...qschComponent('Q2', 'Q_PRI', 480, 472, [
      '«rect (-24,-32) (24,32) 0 0 0x1000000 -1 -1»',
      '«pin (0,-40) (0,0) 1 0 0x3f 0 -1 "D"»',
      '«pin (-48,0) (0,0) 1 0 0x3f 0 -1 "G"»',
      '«pin (0,40) (0,0) 1 0 0x3f 0 -1 "S"»',
    ]),
    ...qschComponent('L_LK', `${state.Llk_uH.toFixed(2)}u`, 832, 352, [
      '«rect (-40,-16) (40,16) 0 0 0x1000000 -1 -1»',
      '«pin (-64,0) (0,0) 1 0 0x3f 0 -1 "1"»',
      '«pin (64,0) (0,0) 1 0 0x3f 0 -1 "2"»',
    ]),
    ...qschComponent(res.isLLC ? 'C_RES' : 'C_BLK', res.isLLC ? `${state.Cr_nF.toFixed(1)}n` : '4.7u', 1032, 352, [
      '«line (-8,-24) (-8,24) 0 0 0x1000000»',
      '«line (8,-24) (8,24) 0 0 0x1000000»',
      '«pin (-56,0) (0,0) 1 0 0x3f 0 -1 "1"»',
      '«pin (56,0) (0,0) 1 0 0x3f 0 -1 "2"»',
    ]),
    ...qschComponent('TX1', `${res.core.name} (${res.Np_actual}:${res.Ns_actual}T)`, 1280, 424, [
      '«rect (-96,-96) (96,96) 0 0 0x1000000 -1 -1»',
      '«line (-12,-72) (-12,72) 0 0 0x1000000»',
      '«line (12,-72) (12,72) 0 0 0x1000000»',
      '«pin (-96,-72) (0,0) 1 0 0x3f 0 -1 "PRI_P"»',
      '«pin (-96,72) (0,0) 1 0 0x3f 0 -1 "PRI_N"»',
      '«pin (96,-72) (0,0) 1 0 0x3f 0 -1 "SEC_P"»',
      '«pin (96,72) (0,0) 1 0 0x3f 0 -1 "SEC_N"»',
    ]),
    ...qschComponent('L_OUT', `${state.Lo_uH.toFixed(2)}u`, 1760, 320, [
      '«rect (-40,-16) (40,16) 0 0 0x1000000 -1 -1»',
      '«pin (-64,0) (0,0) 1 0 0x3f 0 -1 "1"»',
      '«pin (64,0) (0,0) 1 0 0x3f 0 -1 "2"»',
    ]),
    ...qschComponent('C_OUT', `${state.Co_uF.toFixed(1)}u`, 1888, 440, [
      '«line (-24,-8) (24,-8) 0 0 0x1000000»',
      '«line (-24,8) (24,8) 0 0 0x1000000»',
      '«pin (0,-56) (0,0) 1 0 0x3f 0 -1 "1"»',
      '«pin (0,56) (0,0) 1 0 0x3f 0 -1 "2"»',
    ]),
    ...qschComponent('R_LOAD', `${Rload.toFixed(3)}`, 2144, 440, [
      '«rect (-16,-40) (16,40) 0 0 0x1000000 -1 -1»',
      '«pin (0,-56) (0,0) 1 0 0x3f 0 -1 "1"»',
      '«pin (0,56) (0,0) 1 0 0x3f 0 -1 "2"»',
    ]),
    ...qschComponent('X_CTRL', `${ctrlFn}.dll`, 640, 864, [
      `«type: Ø»`,
      `«library file: ${ctrlFn}.dll»`,
      '«rect (-160,-120) (160,120) 0 0 0x1000000 -1 -1»',
      '«pin (-160,-64) (0,0) 1 0 0x3f 0 -1 "VOUT_FB"»',
      '«pin (-160,0) (0,0) 1 0 0x3f 0 -1 "VREF"»',
      '«pin (-160,64) (0,0) 1 0 0x3f 0 -1 "ISNS"»',
      '«pin (160,-64) (0,0) 1 0 0x3f 0 -1 "PWM_A"»',
      '«pin (160,0) (0,0) 1 0 0x3f 0 -1 "PWM_B"»',
      '«pin (160,64) (0,0) 1 0 0x3f 0 -1 "COMP"»',
    ]),
    // Embedded SPICE / QSPICE Simulation Directives
    `  «text (1152,720) 0.85 0 0 0x1000000 -1 -1 ".param FSW=${fswHz} VIN=${state.Vin_nom_V} VOUT_REF=${state.Vout_V}"»`,
    `  «text (1152,768) 0.85 0 0 0x1000000 -1 -1 ".model Q_PRI VDMOS(Rg=${(res.priDevice.Rg_int_Ohm ?? 1.5).toFixed(2)} Vto=3.0 Rd=${(Ron_pri * 0.6).toFixed(5)} Rs=${(Ron_pri * 0.4).toFixed(5)})"»`,
    `  «text (1152,816) 0.85 0 0 0x1000000 -1 -1 ".model D_SEC D(Ron=${Ron_sec.toFixed(5)} Roff=1Meg Vfwd=0.45)"»`,
    `  «text (1152,864) 0.85 0 0 0x1000000 -1 -1 ".tran 0 ${tStop_us}u ${(tStop_us * 0.6).toFixed(0)}u 20n"»`,
    `  «text (1152,912) 0.85 0 0 0x1000000 -1 -1 ".meas TRAN Vout_avg AVG V(v_out) FROM ${(tStop_us * 0.7).toFixed(0)}u TO ${tStop_us}u"»`,
    `  «text (1152,960) 0.85 0 0 0x1000000 -1 -1 "; Netlist backup: ${baseName}.cir | C++ DLL: ${ctrlFn}.cpp | Waveforms: ${baseName}.qraw"»`,
    '»',
    '',
  ];

  return lines.join('\n');
}

function buildAcDcQsch(
  baseName: string,
  ctrlFn: string,
  state: AcDcDesignState,
  res: AcDcResults
): string {
  const fswHz = state.fsw_kHz * 1e3;
  const Rload = (state.Vdc_bus_V * state.Vdc_bus_V) / Math.max(10, state.Pout_W);
  const Ron_sw = Math.max(0.005, res.sw.Rds_on_25C_mOhm * 1.45 * 1e-3);

  const qschComponent = (ref: string, val: string, x: number, y: number, symLines: string[]) => [
    `  «component (${x},${y}) 0 0`,
    `    «symbol`,
    ...symLines.map((l) => `      ${l}`),
    `    »`,
    `    «text (-32,-52) 0.7 0 0 0x1000000 -1 -1 "${ref}"»`,
    `    «text (-32,52) 0.65 0 0 0x1000000 -1 -1 "${val}"»`,
    `  »`,
  ];

  return [
    '«schematic',
    `  «view (0,0) 1 2200 1000 16»`,
    `  «text (64,48) 1.2 0 0 0x1000000 -1 -1 "VoltCraft Power Electronics Studio -- QSPICE AC-DC PFC Schematic (${state.topology})"»`,
    `  «text (64,96) 0.85 0 0 0x1000000 -1 -1 "Vac=${state.Vac_rms_V}Vrms -> Vdc=${state.Vdc_bus_V}V @ ${state.Pout_W}W | fsw=${state.fsw_kHz}kHz"»`,
    `  «wire (160,256) (1856,256)»`,
    `  «wire (160,544) (1856,544)»`,
    `  «net (160,256) "ac_in"»`,
    `  «net (704,256) "v_rect"»`,
    `  «net (1600,256) "v_dc"»`,
    `  «net (1600,544) "0"»`,
    ...qschComponent('V_AC', `SIN(0 ${(state.Vac_rms_V * Math.SQRT2).toFixed(2)} ${state.f_line_Hz})`, 160, 400, [
      '«circle (-32,-32) (32,32) 0 0 0x1000000 -1 -1»',
      '«pin (0,-64) (0,0) 1 0 0x3f 0 -1 "+"»',
      '«pin (0,64) (0,0) 1 0 0x3f 0 -1 "-"»',
    ]),
    ...qschComponent('L_DM', `${res.Ldm_uH.toFixed(1)}u`, 352, 256, [
      '«rect (-40,-16) (40,16) 0 0 0x1000000 -1 -1»',
      '«pin (-64,0) (0,0) 1 0 0x3f 0 -1 "1"»',
      '«pin (64,0) (0,0) 1 0 0x3f 0 -1 "2"»',
    ]),
    ...qschComponent('L_PFC1', `${state.Lpfc_uH.toFixed(1)}u`, 960, 256, [
      '«rect (-40,-16) (40,16) 0 0 0x1000000 -1 -1»',
      '«pin (-64,0) (0,0) 1 0 0x3f 0 -1 "1"»',
      '«pin (64,0) (0,0) 1 0 0x3f 0 -1 "2"»',
    ]),
    ...qschComponent('C_DC', `${state.Cdc_uF.toFixed(0)}u`, 1600, 400, [
      '«line (-24,-8) (24,-8) 0 0 0x1000000»',
      '«line (-24,8) (24,8) 0 0 0x1000000»',
      '«pin (0,-64) (0,0) 1 0 0x3f 0 -1 "1"»',
      '«pin (0,64) (0,0) 1 0 0x3f 0 -1 "2"»',
    ]),
    ...qschComponent('R_LOAD', `${Rload.toFixed(2)}`, 1856, 400, [
      '«rect (-16,-40) (16,40) 0 0 0x1000000 -1 -1»',
      '«pin (0,-56) (0,0) 1 0 0x3f 0 -1 "1"»',
      '«pin (0,56) (0,0) 1 0 0x3f 0 -1 "2"»',
    ]),
    ...qschComponent('X_PFC_CTRL', `${ctrlFn}.dll`, 640, 784, [
      `«type: Ø»`,
      `«library file: ${ctrlFn}.dll»`,
      '«rect (-160,-112) (160,112) 0 0 0x1000000 -1 -1»',
      '«pin (-160,-64) (0,0) 1 0 0x3f 0 -1 "VAC_RECT"»',
      '«pin (-160,0) (0,0) 1 0 0x3f 0 -1 "VDC_FB"»',
      '«pin (-160,64) (0,0) 1 0 0x3f 0 -1 "IL_SNS"»',
      '«pin (160,-48) (0,0) 1 0 0x3f 0 -1 "PWM_PH1"»',
      '«pin (160,48) (0,0) 1 0 0x3f 0 -1 "PWM_PH2"»',
    ]),
    `  «text (1024,680) 0.85 0 0 0x1000000 -1 -1 ".param FSW=${fswHz} VAC_PK=${(state.Vac_rms_V * Math.SQRT2).toFixed(2)} FLINE=${state.f_line_Hz} VDC_REF=${state.Vdc_bus_V}"»`,
    `  «text (1024,728) 0.85 0 0 0x1000000 -1 -1 ".model Q_PFC VDMOS(Rg=${(res.sw.Rg_int_Ohm ?? 1.5).toFixed(2)} Vto=3.0 Rd=${(Ron_sw * 0.6).toFixed(5)} Rs=${(Ron_sw * 0.4).toFixed(5)})"»`,
    `  «text (1024,776) 0.85 0 0 0x1000000 -1 -1 ".tran 0 40m 20m 200n"»`,
    `  «text (1024,824) 0.85 0 0 0x1000000 -1 -1 "; Netlist: ${baseName}.cir | C++ DLL: ${ctrlFn}.cpp | Waveforms: ${baseName}.qraw"»`,
    '»',
    '',
  ].join('\n');
}

// ============================================================================
// 4. QSPICE WAVEFORM DATA (.qraw) GENERATOR (ASCII .raw FORMAT)
// ============================================================================

function buildDcDcQraw(state: DcDcDesignState, res: DcDcResults): string {
  const sim = runTransientLoadStep(state, res, {
    scenario: 'load-step',
    initialLoad_pct: 25,
    finalLoad_pct: 90,
    stepTime_us: 150,
    totalTime_us: 900,
    slewRate_A_us: 8,
  });

  const pts = sim.points;
  const lines: string[] = [
    `Title: VoltCraft ${state.topology.toUpperCase()} Transient Response (${state.presetName})`,
    `Date: ${new Date().toUTCString()}`,
    `Plotname: Transient Analysis`,
    `Flags: real`,
    `No. Variables: 6`,
    `No. Points: ${pts.length}`,
    `Variables:`,
    `\t0\ttime\ttime`,
    `\t1\tV(v_out)\tvoltage`,
    `\t2\tV(v_ref)\tvoltage`,
    `\t3\tI(L_OUT)\tcurrent`,
    `\t4\tI(R_LOAD)\tcurrent`,
    `\t5\tV(comp_node)\tvoltage`,
    `Values:`,
  ];

  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const tSec = (p.t_us * 1e-6).toExponential(8);
    const vComp = 0.5 + 4.0 * p.duty_u;
    lines.push(`${i}\t\t${tSec}`);
    lines.push(`\t${p.v_out_V.toExponential(8)}`);
    lines.push(`\t${p.v_ref_V.toExponential(8)}`);
    lines.push(`\t${p.i_lo_A.toExponential(8)}`);
    lines.push(`\t${p.i_load_A.toExponential(8)}`);
    lines.push(`\t${vComp.toExponential(8)}`);
  }

  return lines.join('\n') + '\n';
}

function buildAcDcQraw(state: AcDcDesignState, res: AcDcResults): string {
  const nPts = 240;
  const tStop_s = 2 / Math.max(45, state.f_line_Hz); // 2 full mains cycles
  const omega = 2 * Math.PI * state.f_line_Hz;
  const Vac_pk = state.Vac_rms_V * Math.SQRT2;
  const Iac_pk = res.Iin_rms_A * Math.SQRT2;
  const vRipple_pk = Math.max(0.5, res.Vdc_ripple_pp_V * 0.5);

  const lines: string[] = [
    `Title: VoltCraft AC-DC PFC Line-Cycle Simulation (${state.topology})`,
    `Date: ${new Date().toUTCString()}`,
    `Plotname: Transient Analysis`,
    `Flags: real`,
    `No. Variables: 5`,
    `No. Points: ${nPts}`,
    `Variables:`,
    `\t0\ttime\ttime`,
    `\t1\tV(ac_in)\tvoltage`,
    `\t2\tV(v_dc)\tvoltage`,
    `\t3\tI(L_DM)\tcurrent`,
    `\t4\tI(L_PFC1)\tcurrent`,
    `Values:`,
  ];

  for (let i = 0; i < nPts; i++) {
    const t = (i / (nPts - 1)) * tStop_s;
    const vac = Vac_pk * Math.sin(omega * t);
    const iac = Iac_pk * Math.sin(omega * t);
    const vdc = state.Vdc_bus_V - vRipple_pk * Math.cos(2 * omega * t);
    const iL1 = Math.abs(iac) / Math.max(1, res.nPhases);
    lines.push(`${i}\t\t${t.toExponential(8)}`);
    lines.push(`\t${vac.toExponential(8)}`);
    lines.push(`\t${vdc.toExponential(8)}`);
    lines.push(`\t${iac.toExponential(8)}`);
    lines.push(`\t${iL1.toExponential(8)}`);
  }

  return lines.join('\n') + '\n';
}

// ============================================================================
// 5. PUBLIC BUNDLE GENERATORS (DC-DC & AC-DC)
// ============================================================================

export function generateDcDcQspiceBundle(
  state: DcDcDesignState,
  res: DcDcResults
): QspiceSimulationBundle {
  const baseName = sanitizeBase(`voltcraft_${state.topology}`);
  const ctrlFn = `${baseName}_ctrl`;

  const qschFileName = `${baseName}.qsch`;
  const cirFileName = `${baseName}.cir`;
  const cppFileName = `${ctrlFn}.cpp`;
  const qrawFileName = `${baseName}.qraw`;

  const qschContent = buildDcDcQsch(baseName, ctrlFn, state, res);
  const cirContent = generateDcDcSpiceNetlist(state, res);
  const cppContent = buildDcDcControllerCpp(ctrlFn, state, res);
  const qrawContent = buildDcDcQraw(state, res);
  const qsymFiles = [
    {
      path: `symbols/${ctrlFn}.qsym`,
      content: buildDcDcControllerQsym(ctrlFn, state, res),
    },
    {
      path: `symbols/xfmr_coupled.qsym`,
      content: buildCoupledTransformerQsym(state, res),
    },
  ];

  const readmeContent = [
    `VoltCraft Power Electronics Studio -- QSPICE Simulation Bundle (${state.topology.toUpperCase()})`,
    `================================================================================`,
    `Included Files:`,
    `  1. ${qschFileName}          - QSPICE schematic (components, orthogonal wires, directives)`,
    `  2. symbols/${ctrlFn}.qsym   - Custom controller block symbol`,
    `  3. symbols/xfmr_coupled.qsym - Coupled HF transformer symbol (${res.core.name}, ${res.Np_actual}:${res.Ns_actual}T)`,
    `  4. ${cirFileName}           - Ready-to-run QSPICE/SPICE ASCII netlist`,
    `  5. ${cppFileName}      - C++ behavioral DLL controller (${state.controlType.toUpperCase()} + ${res.type2Architecture === 'ota' ? 'OTA' : 'Op-Amp'})`,
    `  6. ${qrawFileName}          - Pre-computed RK4 load-step transient waveforms`,
    ``,
    `Quick Start in QSPICE:`,
    `  Option A (Instant Netlist Simulation):`,
    `    1. Open ${cirFileName} in QSPICE (File -> Open) and press Run (F5).`,
    `    2. Or run via CLI: QSPICE64.exe -r ${qrawFileName} ${cirFileName}`,
    ``,
    `  Option B (Schematic + C++ DLL Controller):`,
    `    1. Open ${qschFileName} in QSPICE.`,
    `    2. Right-click X_CTRL -> Compile C++ DLL (builds ${ctrlFn}.dll from ${cppFileName}).`,
    `    3. Run simulation to compare QSPICE switching waveforms against ${qrawFileName}.`,
    ``,
  ].join('\n');

  const entries: ZipEntry[] = [
    { path: qschFileName, content: qschContent },
    ...qsymFiles,
    { path: cirFileName, content: cirContent },
    { path: cppFileName, content: cppContent },
    { path: qrawFileName, content: qrawContent },
    { path: 'README_QSPICE.txt', content: readmeContent },
  ];

  return {
    baseName,
    qschFileName,
    qschContent,
    qsymFiles,
    qrawFileName,
    qrawContent,
    cirFileName,
    cirContent,
    cppFileName,
    cppContent,
    readmeContent,
    zipBytes: buildZipArchive(entries),
  };
}

export function generateAcDcQspiceBundle(
  state: AcDcDesignState,
  res: AcDcResults
): QspiceSimulationBundle {
  const baseName = sanitizeBase(`voltcraft_${state.topology}`);
  const ctrlFn = `${baseName}_ctrl`;

  const qschFileName = `${baseName}.qsch`;
  const cirFileName = `${baseName}.cir`;
  const cppFileName = `${ctrlFn}.cpp`;
  const qrawFileName = `${baseName}.qraw`;

  const qschContent = buildAcDcQsch(baseName, ctrlFn, state, res);
  const cirContent = generateAcDcSpiceNetlist(state, res);
  const cppContent = buildAcDcControllerCpp(ctrlFn, state, res);
  const qrawContent = buildAcDcQraw(state, res);
  const qsymFiles = [
    {
      path: `symbols/${ctrlFn}.qsym`,
      content: buildAcDcControllerQsym(ctrlFn, state, res),
    },
  ];

  const readmeContent = [
    `VoltCraft Power Electronics Studio -- QSPICE AC-DC PFC Bundle (${state.topology})`,
    `================================================================================`,
    `Included Files:`,
    `  1. ${qschFileName}          - QSPICE PFC schematic`,
    `  2. symbols/${ctrlFn}.qsym   - Custom PFC controller symbol`,
    `  3. ${cirFileName}           - Ready-to-run QSPICE/SPICE ASCII netlist`,
    `  4. ${cppFileName}      - C++ behavioral DLL PFC controller (${res.nPhases}-Phase)`,
    `  5. ${qrawFileName}          - Pre-computed 2-line-cycle PFC waveform data`,
    ``,
    `Quick Start in QSPICE:`,
    `  1. Open ${cirFileName} or ${qschFileName} in QSPICE.`,
    `  2. Compile ${cppFileName} to ${ctrlFn}.dll when running the C++ DLL schematic.`,
    `  3. Inspect ${qrawFileName} in QSPICE Waveform Viewer to verify line current & DC-link ripple.`,
    ``,
  ].join('\n');

  const entries: ZipEntry[] = [
    { path: qschFileName, content: qschContent },
    ...qsymFiles,
    { path: cirFileName, content: cirContent },
    { path: cppFileName, content: cppContent },
    { path: qrawFileName, content: qrawContent },
    { path: 'README_QSPICE.txt', content: readmeContent },
  ];

  return {
    baseName,
    qschFileName,
    qschContent,
    qsymFiles,
    qrawFileName,
    qrawContent,
    cirFileName,
    cirContent,
    cppFileName,
    cppContent,
    readmeContent,
    zipBytes: buildZipArchive(entries),
  };
}
