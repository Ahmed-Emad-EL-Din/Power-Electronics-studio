// ============================================================================
// QSPICE FULL SIMULATION SUITE EXPORTER (.zip)
// Aligned with QSPICE native file & C++ DLL specifications:
//  - .qsch : 4-byte binary header (\xff\xd8\xff\xdb) + Latin-1 CRLF schematic
//            with authentic QSPICE symbols (V, R, C, L, L2, NMOS, D, Ø(.DLL)),
//            Cartesian Y-up coordinates, orthogonal «wire» nets, and
//            manufacturer .SUBCKT bindings («type: X» + voltcraft_models.lib)
//  - .qsym : 4-byte binary header (\xff\xd8\xff\xdb) + Latin-1 CRLF symbol files
//  - .lib  : Standalone manufacturer semiconductor .SUBCKT library
//  - .cpp  : C++98 / DMC (dmc -mn -WD) & MSVC compatible Ø(.DLL) controller
//  - .cir  : Ready-to-run standalone SPICE/QSPICE ASCII netlist
//  - .qraw : Pre-computed transient waveforms (Flags: real forward log double)
// ============================================================================

import { AcDcDesignState, DcDcDesignState } from '../data/databases';
import { AcDcResults } from './acdcEngine';
import { DcDcResults } from './dcdcEngine';
import {
  generateManufacturerMosfetSubckt,
  generateManufacturerRectifierSubckt,
  generatePfcBoostDiodeSubckt,
} from './spiceModelLibrary';
import { generateAcDcSpiceNetlist, generateDcDcSpiceNetlist } from './spiceNetlistExporter';
import { runTransientLoadStep } from './transientOdeSolver';
import { buildQspiceBinaryFile, buildZipArchive, ZipEntry } from './zipBuilder';

export interface QspiceSimulationBundle {
  baseName: string;
  qschFileName: string;
  qschContent: string;
  qsymFiles: { path: string; content: string }[];
  libFileName: string;
  libContent: string;
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

function toCrlf(s: string): string {
  return s.replace(/\r?\n/g, '\r\n');
}

// Inline UTF-8 BOM prefix required inside top-level QSPICE «text» directive strings
const QSPICE_UTF8_BOM = '\xef\xbb\xbf';

function toQspiceLatin1Text(s: string): string {
  return s
    .replace(/[—–]/g, '--')
    .replace(/·/g, '|')
    .replace(/Ω/g, 'Ohm')
    .replace(/[^\x09\x0a\x0d\x20-\x7e\xa0-\xff]/g, '');
}

// ============================================================================
// 1. AUTHENTIC QSPICE BUILT-IN SYMBOL TEMPLATES (CARTESIAN Y-UP, 100-GRID)
// ============================================================================

function qsymV(ref: string, value: string, x: number, y: number, rot = 0): string[] {
  return [
    `  «component (${x},${y}) ${rot} 0`,
    `    «symbol V`,
    `      «type: V»`,
    `      «description: Independent Voltage Source»`,
    `      «shorted pins: false»`,
    `      «line (0,-130) (0,-200) 0 0 0x1000000 -1 -1»`,
    `      «line (0,200) (0,130) 0 0 0x1000000 -1 -1»`,
    `      «rect (-25,77) (25,73) 0 0 0 0x1000000 0x3000000 -1 0 -1»`,
    `      «rect (-2,50) (2,100) 0 0 0 0x1000000 0x3000000 -1 0 -1»`,
    `      «rect (-25,-73) (25,-77) 0 0 0 0x1000000 0x3000000 -1 0 -1»`,
    `      «ellipse (-130,130) (130,-130) 0 0 0 0x1000000 0x1000000 -1 -1»`,
    `      «text (160,100) 1 7 0 0x1000000 -1 -1 "${ref}"»`,
    `      «text (160,-100) 1 7 0 0x1000000 -1 -1 "${toQspiceLatin1Text(value)}"»`,
    `      «pin (0,200) (0,0) 1 0 0 0x0 -1 "+"»`,
    `      «pin (0,-200) (0,0) 1 0 0 0x0 -1 "-"»`,
    `    »`,
    `  »`,
  ];
}

function qsymR(ref: string, value: string, x: number, y: number, rot = 0): string[] {
  const tx = rot === 2 ? -100 : 120;
  const ty1 = rot === 2 ? 140 : 100;
  const ty2 = rot === 2 ? -140 : -100;
  return [
    `  «component (${x},${y}) ${rot} 0`,
    `    «symbol R`,
    `      «type: R»`,
    `      «description: Resistor(USA Style Symbol)»`,
    `      «shorted pins: false»`,
    `      «line (0,200) (0,180) 0 0 0x1000000 -1 -1»`,
    `      «line (0,-180) (0,-200) 0 0 0x1000000 -1 -1»`,
    `      «zigzag (-80,180) (80,-180) 0 0 0 0x1000000 -1 -1»`,
    `      «text (${tx},${ty1}) 1 7 0 0x1000000 -1 -1 "${ref}"»`,
    `      «text (${tx},${ty2}) 1 7 0 0x1000000 -1 -1 "${toQspiceLatin1Text(value)}"»`,
    `      «pin (0,200) (0,0) 1 0 0 0x0 -1 "1"»`,
    `      «pin (0,-200) (0,0) 1 0 0 0x0 -1 "2"»`,
    `    »`,
    `  »`,
  ];
}

function qsymC(
  ref: string,
  value: string,
  x: number,
  y: number,
  rot = 0,
  spiceLine?: string
): string[] {
  const extra = spiceLine
    ? [`      «text (160,-220) 0.9 7 0 0x1000000 -1 -1 "${toQspiceLatin1Text(spiceLine)}"»`]
    : [];
  return [
    `  «component (${x},${y}) ${rot} 0`,
    `    «symbol C`,
    `      «type: C»`,
    `      «description: Capacitor»`,
    `      «shorted pins: false»`,
    `      «line (0,200) (0,40) 0 0 0x1000000 -1 -1»`,
    `      «line (0,-40) (0,-200) 0 0 0x1000000 -1 -1»`,
    `      «rect (-130,-40) (130,-30) 0 0 0 0x1000000 0x3000000 -1 0 -1»`,
    `      «rect (-130,30) (130,40) 0 0 0 0x1000000 0x3000000 -1 0 -1»`,
    `      «text (160,120) 1 7 0 0x1000000 -1 -1 "${ref}"»`,
    `      «text (160,-100) 1 7 0 0x1000000 -1 -1 "${toQspiceLatin1Text(value)}"»`,
    ...extra,
    `      «pin (0,200) (0,0) 1 0 0 0x0 -1 "+"»`,
    `      «pin (0,-200) (0,0) 1 0 0 0x0 -1 "-"»`,
    `    »`,
    `  »`,
  ];
}

function qsymL(
  ref: string,
  value: string,
  x: number,
  y: number,
  rot = 2,
  withDot = false,
  spiceLine?: string
): string[] {
  const symName = withDot ? 'L2' : 'L';
  const dotLines = withDot
    ? [`      «ellipse (-60,160) (-30,130) 0 0 0 0x1000000 0x3000000 -1 -1»`]
    : [];
  const extra = spiceLine
    ? [`      «text (140,-240) 0.85 7 0 0x1000000 -1 -1 "${toQspiceLatin1Text(spiceLine)}"»`]
    : [];
  return [
    `  «component (${x},${y}) ${rot} 0`,
    `    «symbol ${symName}`,
    `      «type: L»`,
    `      «description: ${withDot ? 'Inductor Showing Phasing Dot' : 'Inductor'}»`,
    `      «shorted pins: false»`,
    `      «line (0,200) (0,180) 0 0 0x1000000 -1 -1»`,
    `      «line (0,-200) (0,-180) 0 0 0x1000000 -1 -1»`,
    ...dotLines,
    `      «coil (-80,180) (80,-180) 0 0 0 0x1000000 -1 -1»`,
    `      «text (140,120) 1 7 0 0x1000000 -1 -1 "${ref}"»`,
    `      «text (140,-120) 1 7 0 0x1000000 -1 -1 "${toQspiceLatin1Text(value)}"»`,
    ...extra,
    `      «pin (0,200) (0,0) 1 0 0 0x0 -1 "1"»`,
    `      «pin (0,-200) (0,0) 1 0 0 0x0 -1 "2"»`,
    `    »`,
    `  »`,
  ];
}

/**
 * QSPICE NMOS symbol bound to a manufacturer .SUBCKT («type: X»).
 * Pins at rot=0: D=(x+100, y+200), G=(x-200, y), S=(x+100, y-200).
 */
function qsymNmosSubckt(ref: string, subcktName: string, x: number, y: number): string[] {
  return [
    `  «component (${x},${y}) 0 0`,
    `    «symbol NMOS`,
    `      «type: X»`,
    `      «description: N-Channel Power Switch (.SUBCKT ${subcktName})»`,
    `      «library file: voltcraft_models.lib»`,
    `      «shorted pins: false»`,
    `      «line (100,200) (100,150) 0 0 0x1000000 -1 -1»`,
    `      «line (100,-150) (100,-200) 0 0 0x1000000 -1 -1»`,
    `      «line (-100,150) (-100,-150) 0 0 0x1000000 -1 -1»`,
    `      «line (-100,0) (-200,0) 0 0 0x1000000 -1 -1»`,
    `      «line (100,-150) (-50,-150) 0 0 0x1000000 -1 -1»`,
    `      «line (100,150) (-50,150) 0 0 0x1000000 -1 -1»`,
    `      «line (-50,150) (-50,-150) 0 0 0x1000000 -1 -1»`,
    `      «triangle (70,-150) (-25,-125) (-25,-175) 0 0 0x1000000 0x3000000 -1 -1»`,
    `      «text (160,120) 1 7 0 0x1000000 -1 -1 "${ref}"»`,
    `      «text (160,-120) 0.9 7 0 0x1000000 -1 -1 "${subcktName}"»`,
    `      «pin (100,200) (0,0) 1 0 0 0x0 -1 "D"»`,
    `      «pin (-200,0) (0,0) 1 0 0 0x0 -1 "G"»`,
    `      «pin (100,-200) (0,0) 1 0 0 0x0 -1 "S"»`,
    `    »`,
    `  »`,
  ];
}

/**
 * QSPICE Diode symbol bound to a manufacturer .SUBCKT («type: X»).
 * Pins at rot=0: A=(x, y-200), K=(x, y+200).
 * Pins at rot=6 (270° CCW): A=(x-200, y), K=(x+200, y).
 */
function qsymDiodeSubckt(ref: string, subcktName: string, x: number, y: number, rot = 0): string[] {
  return [
    `  «component (${x},${y}) ${rot} 0`,
    `    «symbol D`,
    `      «type: X»`,
    `      «description: Power Diode / SR Rectifier (.SUBCKT ${subcktName})»`,
    `      «library file: voltcraft_models.lib»`,
    `      «shorted pins: false»`,
    `      «line (100,80) (-100,80) 0 0 0x1000000 -1 -1»`,
    `      «line (0,200) (0,80) 0 0 0x1000000 -1 -1»`,
    `      «line (0,-200) (0,-70) 0 0 0x1000000 -1 -1»`,
    `      «triangle (0,80) (100,-70) (-100,-70) 0 0 0x1000000 0x2000000 -1 -1»`,
    `      «text (140,80) 1 7 0 0x1000000 -1 -1 "${ref}"»`,
    `      «text (140,-80) 0.9 7 0 0x1000000 -1 -1 "${subcktName}"»`,
    `      «pin (0,-200) (0,0) 1 0 0 0x0 -1 "A"»`,
    `      «pin (0,200) (0,0) 1 0 0 0x0 -1 "K"»`,
    `    »`,
    `  »`,
  ];
}

/** QSPICE Behavioral Voltage Source (B1) for isolated/buffered gate-drive mapping. */
function qsymBv(ref: string, expr: string, x: number, y: number): string[] {
  return [
    `  «component (${x},${y}) 0 0`,
    `    «symbol B1`,
    `      «type: B»`,
    `      «description: Behavioral Voltage Source»`,
    `      «shorted pins: false»`,
    `      «line (0,-130) (0,-200) 0 0 0x1000000 -1 -1»`,
    `      «line (0,200) (0,130) 0 0 0x1000000 -1 -1»`,
    `      «rect (-25,77) (25,73) 0 0 0 0x1000000 0x3000000 -1 0 -1»`,
    `      «rect (-2,50) (2,100) 0 0 0 0x1000000 0x3000000 -1 0 -1»`,
    `      «rect (-25,-73) (25,-77) 0 0 0 0x1000000 0x3000000 -1 0 -1»`,
    `      «ellipse (-130,130) (130,-130) 0 0 0 0x1000000 0x1000000 -1 -1»`,
    `      «text (160,100) 1 7 0 0x1000000 -1 -1 "${ref}"»`,
    `      «text (160,-100) 0.9 7 0 0x1000000 -1 -1 "${toQspiceLatin1Text(expr)}"»`,
    `      «pin (0,200) (0,0) 1 0 0 0x0 -1 "+"»`,
    `      «pin (0,-200) (0,0) 1 0 0 0x0 -1 "-"»`,
    `    »`,
    `  »`,
  ];
}

interface DllPinDef {
  name: string;
  side: 'left' | 'right';
  yOffset: number;
}

function buildDllComponentBlock(
  ref: string,
  dllBaseName: string,
  description: string,
  x: number,
  y: number,
  pins: DllPinDef[]
): string[] {
  const ys = pins.map((p) => p.yOffset);
  const topY = Math.max(...ys) + 200;
  const botY = Math.min(...ys) - 200;
  const pinLines = pins.map((p) => {
    if (p.side === 'left') {
      return `      «pin (-400,${p.yOffset}) (150,-50) 0.681 14 145 0x0 -1 "${p.name}"»`;
    }
    return `      «pin (400,${p.yOffset}) (-150,-50) 0.681 14 146 0x0 -1 "${p.name}"»`;
  });

  return [
    `  «component (${x},${y}) 0 0`,
    `    «symbol ${dllBaseName}`,
    `      «type: Ø(.DLL)»`,
    `      «description: ${toQspiceLatin1Text(description)}»`,
    `      «library file: ${dllBaseName}.dll»`,
    `      «shorted pins: false»`,
    `      «rect (-400,${topY}) (400,${botY}) 0 0 0 0x4000000 0x4000000 -1 1 -1»`,
    `      «text (0,${topY + 120}) 1 12 0 0x1000000 -1 -1 "${ref}"»`,
    `      «text (0,${botY - 120}) 0.68781 13 0 0x1000000 -1 -1 "${dllBaseName}"»`,
    ...pinLines,
    `    »`,
    `  »`,
  ];
}

function wire(x1: number, y1: number, x2: number, y2: number, net: string): string {
  return `  «wire (${x1},${y1}) (${x2},${y2}) "${net}"»`;
}

function netLabel(x: number, y: number, name: string): string {
  if (name === 'GND' || name === '0') {
    return `  «net (${x},${y}) 1 13 0 "GND"»`;
  }
  return `  «net (${x},${y}) 1 14 0 "${name}"»`;
}

function directiveText(x: number, y: number, text: string, scale = 1): string {
  return `  «text (${x},${y}) ${scale} 7 0 0x1000000 -1 -1 "${QSPICE_UTF8_BOM}${toQspiceLatin1Text(text)}"»`;
}

// ============================================================================
// 2. QSPICE STANDALONE SYMBOL (.qsym) GENERATORS (LATIN-1 CRLF + HEADER)
// ============================================================================

function buildDllStandaloneQsym(
  dllBaseName: string,
  description: string,
  pins: DllPinDef[]
): string {
  const ys = pins.map((p) => p.yOffset);
  const topY = Math.max(...ys) + 200;
  const botY = Math.min(...ys) - 200;
  const pinLines = pins.map((p) => {
    if (p.side === 'left') {
      return `  «pin (-400,${p.yOffset}) (150,-50) 0.681 14 145 0x0 -1 "${p.name}"»`;
    }
    return `  «pin (400,${p.yOffset}) (-150,-50) 0.681 14 146 0x0 -1 "${p.name}"»`;
  });

  return toCrlf(
    [
      `«symbol ${dllBaseName}`,
      `  «type: Ø(.DLL)»`,
      `  «description: ${toQspiceLatin1Text(description)}»`,
      `  «library file: ${dllBaseName}.dll»`,
      `  «shorted pins: false»`,
      `  «rect (-400,${topY}) (400,${botY}) 0 0 0 0x4000000 0x4000000 -1 1 -1»`,
      `  «text (0,${topY + 120}) 1 12 0 0x1000000 -1 -1 "X1"»`,
      `  «text (0,${botY - 120}) 0.68781 13 0 0x1000000 -1 -1 "${dllBaseName}"»`,
      ...pinLines,
      `»`,
      ``,
    ].join('\n')
  );
}

function buildCoupledTransformerQsym(state: DcDcDesignState, res: DcDcResults): string {
  return toCrlf(
    [
      `«symbol xfmr_coupled`,
      `  «type: K»`,
      `  «description: Coupled HF Power Transformer (${res.core.name}, ${res.Np_actual}:${res.Ns_actual}T)»`,
      `  «shorted pins: false»`,
      `  «rect (-300,300) (300,-300) 0 0 0 0x4000000 0x4000000 -1 1 -1»`,
      `  «line (-40,220) (-40,-220) 0 0 0x1000000 -1 -1»`,
      `  «line (40,220) (40,-220) 0 0 0x1000000 -1 -1»`,
      `  «text (0,420) 1 12 0 0x1000000 -1 -1 "${res.core.name} (${res.Np_actual}:${res.Ns_actual}T)"»`,
      `  «text (0,-420) 0.8 13 0 0x1000000 -1 -1 "Lm=${state.Lm_uH}uH Llk=${state.Llk_uH}uH"»`,
      `  «pin (-300,200) (150,-50) 0.681 14 145 0x0 -1 "PRI_P"»`,
      `  «pin (-300,-200) (150,-50) 0.681 14 145 0x0 -1 "PRI_N"»`,
      `  «pin (300,200) (-150,-50) 0.681 14 146 0x0 -1 "SEC_P"»`,
      `  «pin (300,0) (-150,-50) 0.681 14 146 0x0 -1 "SEC_CT"»`,
      `  «pin (300,-200) (-150,-50) 0.681 14 146 0x0 -1 "SEC_N"»`,
      `»`,
      ``,
    ].join('\n')
  );
}

// ============================================================================
// 3. QSPICE C++98 / DMC & MSVC COMPATIBLE Ø(.DLL) CONTROLLER GENERATORS
// ============================================================================

function buildDcDcControllerCpp(fnName: string, state: DcDcDesignState, res: DcDcResults): string {
  const { b0, b1, b2, b3, a1, a2, a3 } = res;
  const fsHz = state.fs_digital_kHz * 1e3;
  const Ts = 1 / Math.max(1e3, fsHz);
  const fswHz = state.fsw_kHz * 1e3;
  const tDead = Math.max(20e-9, state.deadTime_ns * 1e-9);
  const isPcmc = state.controlType === 'pcmc';
  const structName = `s${fnName.toUpperCase()}`;

  return `// ============================================================================
// QSPICE C++ Behavioral Controller DLL -- ${state.topology.toUpperCase()} (${state.presetName})
// Generated by VoltCraft Power Electronics Studio
// Compatible with QSPICE bundled Digital Mars C++ (dmc.exe) & MSVC:
//   dmc -mn -WD ${fnName}.cpp kernel32.lib
//   cl /LD /EHsc ${fnName}.cpp
// ============================================================================
#include <math.h>
#include <stdlib.h>

extern "C" {
  int __stdcall DllMain(void *hinstDLL, unsigned long fdwReason, void *lpvReserved) {
    (void)hinstDLL;
    (void)fdwReason;
    (void)lpvReserved;
    return 1;
  }
}

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

struct ${structName} {
  double t_next_sample;
  double e_z1;
  double e_z2;
  double e_z3;
  double u_z1;
  double u_z2;
  double u_z3;
  double duty;
  double comp_v;
};

static double clampd(double x, double lo, double hi) {
  return x < lo ? lo : (x > hi ? hi : x);
}

#undef VOUT_FB
#undef VREF
#undef ISNS
#undef PWM_A_HI
#undef PWM_A_LO
#undef PWM_B_HI
#undef PWM_B_LO
#undef COMP

// Pin order matches symbols/${fnName}.qsym:
//   data[0]: VOUT_FB   (input, V)
//   data[1]: VREF      (input, V)
//   data[2]: ISNS      (input, A or V)
//   data[3]: PWM_A_HI  (output, V)
//   data[4]: PWM_A_LO  (output, V)
//   data[5]: PWM_B_HI  (output, V)
//   data[6]: PWM_B_LO  (output, V)
//   data[7]: COMP      (output, V)
extern "C" __declspec(dllexport) void ${fnName}(
  struct ${structName} **opaque,
  double t,
  union uData *data
) {
  double VOUT_FB = data[0].d;
  double VREF    = (data[1].d > 0.05) ? data[1].d : ${state.Vout_V.toFixed(4)};
  double ISNS    = data[2].d;

  double &PWM_A_HI = data[3].d;
  double &PWM_A_LO = data[4].d;
  double &PWM_B_HI = data[5].d;
  double &PWM_B_LO = data[6].d;
  double &COMP     = data[7].d;

  struct ${structName} *inst = *opaque;
  if (!inst) {
    inst = (struct ${structName} *)calloc(1, sizeof(struct ${structName}));
    *opaque = inst;
    inst->duty = ${res.Deff_nom.toFixed(4)};
    inst->comp_v = 2.5;
  }

  // Discrete Tustin 3P3Z compensator @ fs = ${state.fs_digital_kHz.toFixed(1)} kHz
  const double Ts_ctrl = ${Ts.toExponential(8)};
  const double B0 = ${b0.toExponential(8)};
  const double B1 = ${b1.toExponential(8)};
  const double B2 = ${b2.toExponential(8)};
  const double B3 = ${b3.toExponential(8)};
  const double A1 = ${a1.toExponential(8)};
  const double A2 = ${a2.toExponential(8)};
  const double A3 = ${a3.toExponential(8)};
  const double FSW_HZ = ${fswHz.toFixed(1)};
  const double TSW = 1.0 / FSW_HZ;
  const double TDEAD = ${tDead.toExponential(4)};
  const double SE_V_S = ${(res.Se_ramp_V_us * 1e6).toExponential(5)};

  if (t >= inst->t_next_sample - 1e-12) {
    const double e0 = VREF - VOUT_FB;
    double u0 = B0 * e0 + B1 * inst->e_z1 + B2 * inst->e_z2 + B3 * inst->e_z3
              - A1 * inst->u_z1 - A2 * inst->u_z2 - A3 * inst->u_z3;
    u0 = clampd(u0, 0.02, 0.94);

    inst->e_z3 = inst->e_z2;
    inst->e_z2 = inst->e_z1;
    inst->e_z1 = e0;
    inst->u_z3 = inst->u_z2;
    inst->u_z2 = inst->u_z1;
    inst->u_z1 = u0;
    inst->duty = u0;
    inst->comp_v = 0.5 + 4.0 * u0;
    inst->t_next_sample += Ts_ctrl;
  }

  const double t_cyc = fmod(t, TSW);
  const double t_half = 0.5 * TSW;

  // Leg A complementary pair with dead-time TDEAD
  const double a_hi_on = (t_cyc >= 0.0 && t_cyc < (t_half - TDEAD)) ? 12.0 : 0.0;
  const double a_lo_on = (t_cyc >= t_half && t_cyc < (TSW - TDEAD)) ? 12.0 : 0.0;

  // ${isPcmc ? 'PCMC + artificial slope compensation' : 'Voltage-mode / phase-shift modulation'}
  const double slope_v = SE_V_S * t_cyc;
  const double eff_cmd = ${isPcmc ? 'clampd((inst->comp_v - slope_v - 0.1 * ISNS) * 0.25, 0.05, 0.94)' : 'inst->duty'};
  const double phase_shift = ${res.isLLC ? '0.0' : '(1.0 - eff_cmd) * t_half'};

  const double t_b_hi_start = phase_shift;
  const double t_b_hi_end = fmod(phase_shift + t_half - TDEAD, TSW);
  const double t_b_lo_start = fmod(phase_shift + t_half, TSW);
  const double t_b_lo_end = fmod(phase_shift + TSW - TDEAD, TSW);

  const int b_hi = (t_b_hi_end > t_b_hi_start)
    ? (t_cyc >= t_b_hi_start && t_cyc < t_b_hi_end)
    : (t_cyc >= t_b_hi_start || t_cyc < t_b_hi_end);
  const int b_lo = (t_b_lo_end > t_b_lo_start)
    ? (t_cyc >= t_b_lo_start && t_cyc < t_b_lo_end)
    : (t_cyc >= t_b_lo_start || t_cyc < t_b_lo_end);

  PWM_A_HI = a_hi_on;
  PWM_A_LO = a_lo_on;
  PWM_B_HI = b_hi ? 12.0 : 0.0;
  PWM_B_LO = b_lo ? 12.0 : 0.0;
  COMP     = inst->comp_v;
}

extern "C" __declspec(dllexport) double MaxExtStepSize(struct ${structName} *inst, double t) {
  (void)inst;
  (void)t;
  return ${(Math.min(1 / (fswHz * 40), 50e-9)).toExponential(3)};
}

extern "C" __declspec(dllexport) void Trunc(
  struct ${structName} *inst,
  double t,
  union uData *data,
  double *timestep
) {
  (void)inst;
  (void)t;
  (void)data;
  const double max_dt = ${(Math.min(1 / (fswHz * 25), 80e-9)).toExponential(3)};
  if (*timestep > max_dt) *timestep = max_dt;
}

extern "C" __declspec(dllexport) void Destroy(struct ${structName} *inst) {
  free(inst);
}
`;
}

function buildAcDcControllerCpp(fnName: string, state: AcDcDesignState, res: AcDcResults): string {
  const fswHz = state.fsw_kHz * 1e3;
  const structName = `s${fnName.toUpperCase()}`;

  return `// ============================================================================
// QSPICE C++ Behavioral Controller DLL -- AC-DC PFC (${state.topology})
// Generated by VoltCraft Power Electronics Studio
// Compatible with QSPICE bundled Digital Mars C++ (dmc.exe) & MSVC:
//   dmc -mn -WD ${fnName}.cpp kernel32.lib
// ============================================================================
#include <math.h>
#include <stdlib.h>

extern "C" {
  int __stdcall DllMain(void *hinstDLL, unsigned long fdwReason, void *lpvReserved) {
    (void)hinstDLL;
    (void)fdwReason;
    (void)lpvReserved;
    return 1;
  }
}

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

struct ${structName} {
  double v_int;
  double i_int;
  double t_next;
  double duty;
};

static double clampd(double x, double lo, double hi) {
  return x < lo ? lo : (x > hi ? hi : x);
}

#undef VAC_RECT
#undef VDC_FB
#undef IL_SNS
#undef PWM_PH1
#undef PWM_PH2

// Pin order matches symbols/${fnName}.qsym:
//   data[0]: VAC_RECT (input, V)
//   data[1]: VDC_FB   (input, V)
//   data[2]: IL_SNS   (input, A)
//   data[3]: PWM_PH1  (output, V)
//   data[4]: PWM_PH2  (output, V)
extern "C" __declspec(dllexport) void ${fnName}(
  struct ${structName} **opaque,
  double t,
  union uData *data
) {
  double VAC_RECT = fabs(data[0].d);
  double VDC_FB   = data[1].d;
  double IL_SNS   = data[2].d;

  double &PWM_PH1 = data[3].d;
  double &PWM_PH2 = data[4].d;

  struct ${structName} *inst = *opaque;
  if (!inst) {
    inst = (struct ${structName} *)calloc(1, sizeof(struct ${structName}));
    *opaque = inst;
    inst->duty = 0.45;
  }

  const double VDC_REF = ${state.Vdc_bus_V.toFixed(2)};
  const double FSW_HZ  = ${fswHz.toFixed(1)};
  const double TSW     = 1.0 / FSW_HZ;
  const double TS      = TSW;

  if (t >= inst->t_next - 1e-12) {
    const double ev = VDC_REF - VDC_FB;
    inst->v_int = clampd(inst->v_int + ev * TS * 25.0, -50.0, 50.0);
    const double g_cmd = clampd(0.02 * ev + inst->v_int * 0.01, 0.001, 0.25);
    const double i_ref = g_cmd * VAC_RECT;
    const double ei = i_ref - IL_SNS;
    inst->i_int = clampd(inst->i_int + ei * TS * 2e4, -0.5, 0.5);
    const double d_ff = clampd(1.0 - VAC_RECT / VDC_REF, 0.05, 0.94);
    inst->duty = clampd(d_ff + 0.04 * ei + inst->i_int, 0.04, 0.94);
    inst->t_next += TS;
  }

  const double t_cyc1 = fmod(t, TSW);
  const double t_cyc2 = fmod(t + 0.5 * TSW, TSW);
  PWM_PH1 = (t_cyc1 < inst->duty * TSW) ? 12.0 : 0.0;
  PWM_PH2 = (${res.nPhases} >= 2 && t_cyc2 < inst->duty * TSW) ? 12.0 : 0.0;
}

extern "C" __declspec(dllexport) double MaxExtStepSize(struct ${structName} *inst, double t) {
  (void)inst;
  (void)t;
  return ${(1 / (fswHz * 25)).toExponential(3)};
}

extern "C" __declspec(dllexport) void Destroy(struct ${structName} *inst) {
  free(inst);
}
`;
}

// ============================================================================
// 4. QSPICE SCHEMATIC (.qsch) GENERATORS (EXACT PIN COORDS & .SUBCKT MODELS)
// ============================================================================

const DCDC_DLL_PINS: DllPinDef[] = [
  { name: 'VOUT_FB', side: 'left', yOffset: 200 },
  { name: 'VREF', side: 'left', yOffset: 0 },
  { name: 'ISNS', side: 'left', yOffset: -200 },
  { name: 'PWM_A_HI', side: 'right', yOffset: 400 },
  { name: 'PWM_A_LO', side: 'right', yOffset: 200 },
  { name: 'PWM_B_HI', side: 'right', yOffset: 0 },
  { name: 'PWM_B_LO', side: 'right', yOffset: -200 },
  { name: 'COMP', side: 'right', yOffset: -400 },
];

const ACDC_DLL_PINS: DllPinDef[] = [
  { name: 'VAC_RECT', side: 'left', yOffset: 200 },
  { name: 'VDC_FB', side: 'left', yOffset: 0 },
  { name: 'IL_SNS', side: 'left', yOffset: -200 },
  { name: 'PWM_PH1', side: 'right', yOffset: 100 },
  { name: 'PWM_PH2', side: 'right', yOffset: -100 },
];

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
  const tStop_us = Math.round(Math.max(400, (1e6 / fswHz) * 45));

  const priModel = generateManufacturerMosfetSubckt(res.priDevice, state.nParallelPri);
  const secModel = generateManufacturerRectifierSubckt(
    res.secDevice,
    state.nParallelSec,
    state.rectMode
  );

  // Cartesian Y-up QSPICE schematic layout (100-unit grid)
  const lines: string[] = [
    '«schematic',
    directiveText(
      -2600,
      2000,
      `; VoltCraft Power Electronics Studio -- QSPICE (${state.topology.toUpperCase()} | ${state.presetName})`,
      1.2
    ),
    directiveText(
      -2600,
      1800,
      `; Pri: ${priModel.manufacturer} ${res.priDevice.id} (.SUBCKT ${priModel.subcktName}) | Sec: ${secModel.manufacturer} ${res.secDevice.id} (.SUBCKT ${secModel.subcktName})`,
      0.95
    ),

    // --- 1. INPUT BUS & BULK CAPACITOR ---
    ...qsymV('V_IN', `${state.Vin_nom_V}`, -2400, 400, 0),
    ...qsymC('C_IN', '47u', -1900, 400, 0, 'Rser=5m'),
    wire(-2400, 600, -2400, 1000, 'vin_pos'),
    wire(-2400, 1000, -1900, 1000, 'vin_pos'),
    wire(-1900, 1000, -1900, 600, 'vin_pos'),
    wire(-2400, 200, -2400, -200, 'GND'),
    wire(-2400, -200, -1900, -200, 'GND'),
    wire(-1900, 200, -1900, -200, 'GND'),
    netLabel(-2400, -200, 'GND'),
    netLabel(-2100, 1000, 'vin_pos'),

    // --- 2. PRIMARY BRIDGE LEGS (REAL MANUFACTURER .SUBCKT «type: X») ---
    // Leg A: Q1 (center -1300,700 -> D=(-1200,900), G=(-1500,700), S=(-1200,500))
    //        Q2 (center -1300,100 -> D=(-1200,300), G=(-1500,100), S=(-1200,-100))
    ...qsymNmosSubckt('Q1', priModel.subcktName, -1300, 700),
    ...qsymNmosSubckt('Q2', priModel.subcktName, -1300, 100),
    wire(-1900, 1000, -1200, 1000, 'vin_pos'),
    wire(-1200, 1000, -1200, 900, 'vin_pos'),
    wire(-1200, 500, -1200, 400, 'sw_a'),
    wire(-1200, 400, -1200, 300, 'sw_a'),
    wire(-1200, -100, -1200, -200, 'GND'),
    wire(-1900, -200, -1200, -200, 'GND'),
    wire(-1500, 700, -1600, 700, 'g1'),
    netLabel(-1600, 700, 'g1'),
    wire(-1500, 100, -1600, 100, 'g2'),
    netLabel(-1600, 100, 'g2'),
    netLabel(-1200, 400, 'sw_a'),
  ];

  if (state.topology === 'llc-hb') {
    lines.push(
      ...qsymC('C_HB_TOP', '22u', -600, 700, 0),
      ...qsymC('C_HB_BOT', '22u', -600, 100, 0),
      wire(-1200, 1000, -600, 1000, 'vin_pos'),
      wire(-600, 1000, -600, 900, 'vin_pos'),
      wire(-600, 500, -600, 300, 'sw_b'),
      wire(-600, -100, -600, -200, 'GND'),
      wire(-1200, -200, -600, -200, 'GND'),
      netLabel(-600, 400, 'sw_b')
    );
  } else {
    lines.push(
      ...qsymNmosSubckt('Q3', priModel.subcktName, -700, 700),
      ...qsymNmosSubckt('Q4', priModel.subcktName, -700, 100),
      wire(-1200, 1000, -600, 1000, 'vin_pos'),
      wire(-600, 1000, -600, 900, 'vin_pos'),
      wire(-600, 500, -600, 400, 'sw_b'),
      wire(-600, 400, -600, 300, 'sw_b'),
      wire(-600, -100, -600, -200, 'GND'),
      wire(-1200, -200, -600, -200, 'GND'),
      wire(-900, 700, -1000, 700, 'g3'),
      netLabel(-1000, 700, 'g3'),
      wire(-900, 100, -1000, 100, 'g4'),
      netLabel(-1000, 100, 'g4'),
      netLabel(-600, 400, 'sw_b')
    );
  }

  // --- 3. RESONANT / LEAKAGE TANK & COUPLED HF TRANSFORMER (L2 + K_TX) ---
  // L_LK (rot=2 -> 1=(-200,0) left, 2=(+200,0) right) at (100, 700)
  // C_RES / C_BLK (rot=2) at (600, 700)
  // L_PRI (L2, rot=0 -> 1=(0,+200) top dot, 2=(0,-200) bot) at (1000, 400)
  // R_ISNS (rot=2) at (600, 100) from sw_b to pri_ret for current sense
  lines.push(
    netLabel(-200, 700, 'sw_a'),
    wire(-200, 700, -100, 700, 'sw_a'),
    ...qsymL('L_LK', `${state.Llk_uH.toFixed(2)}u`, 100, 700, 2, false, 'Rser=4m'),
    wire(300, 700, 400, 700, 'pri_lk'),
    ...qsymC(
      res.isLLC ? 'C_RES' : 'C_BLK',
      res.isLLC ? `${state.Cr_nF.toFixed(1)}n` : '4.7u',
      600,
      700,
      2
    ),
    wire(800, 700, 1000, 700, 'pri_hot'),
    wire(1000, 700, 1000, 600, 'pri_hot'),
    ...qsymL(
      'L_PRI',
      `${Lpri_uH.toFixed(2)}u`,
      1000,
      400,
      0,
      true,
      `Rser=${Math.max(0.002, res.Rpri_ac_mOhm * 1e-3).toFixed(4)}`
    ),
    wire(1000, 200, 1000, 100, 'pri_ret'),
    wire(1000, 100, 800, 100, 'pri_ret'),
    ...qsymR('R_ISNS', '10m', 600, 100, 2),
    wire(400, 100, 200, 100, 'sw_b'),
    netLabel(200, 100, 'sw_b'),
    netLabel(1000, 100, 'isns_node')
  );

  // Secondary Windings & Rectifier
  if (state.txType === 'center-tapped') {
    lines.push(
      ...qsymL('L_SEC1', `${Lsec_uH.toFixed(3)}u`, 1500, 700, 0, true),
      ...qsymL('L_SEC2', `${Lsec_uH.toFixed(3)}u`, 1500, 100, 0, true),
      wire(1500, 900, 1800, 900, 'sec_p'),
      wire(1500, 500, 1500, 400, 'sec_ct'),
      wire(1500, 400, 1500, 300, 'sec_ct'),
      wire(1500, -100, 1800, -100, 'sec_n'),
      netLabel(1800, 900, 'sec_p'),
      netLabel(1500, 400, 'sec_ct'),
      netLabel(1800, -100, 'sec_n'),
      directiveText(1100, -300, 'K_TX L_PRI L_SEC1 L_SEC2 0.9995', 1),

      ...qsymDiodeSubckt('D_SR1', secModel.subcktName, 2100, 700, 0),
      ...qsymDiodeSubckt('D_SR2', secModel.subcktName, 2100, 100, 0),
      wire(2100, 900, 2200, 900, 'sec_p'),
      netLabel(2200, 900, 'sec_p'),
      wire(2100, 300, 2200, 300, 'sec_n'),
      netLabel(2200, 300, 'sec_n'),
      wire(2100, 500, 2100, 400, 'GND'),
      wire(2100, -100, 2100, -200, 'GND'),
      wire(2100, 400, 2300, 400, 'GND'),
      wire(2300, 400, 2300, -200, 'GND'),
      wire(2100, -200, 2300, -200, 'GND'),
      netLabel(2100, -200, 'GND'),

      netLabel(2400, 700, 'sec_ct'),
      wire(2400, 700, 2500, 700, 'sec_ct'),
      ...qsymL('L_OUT', `${state.Lo_uH.toFixed(2)}u`, 2700, 700, 2, false, 'Rser=1.5m'),
      wire(2900, 700, 3200, 700, 'v_out')
    );
  } else {
    lines.push(
      ...qsymL('L_SEC1', `${Lsec_uH.toFixed(3)}u`, 1500, 400, 0, true),
      wire(1500, 600, 1800, 600, 'sec_p'),
      wire(1500, 200, 1800, 200, 'sec_n'),
      netLabel(1800, 600, 'sec_p'),
      netLabel(1800, 200, 'sec_n'),
      directiveText(1100, -300, 'K_TX L_PRI L_SEC1 0.9995', 1),

      ...qsymDiodeSubckt('D_SR1', secModel.subcktName, 2100, 700, 0),
      ...qsymDiodeSubckt('D_SR2', secModel.subcktName, 2100, 100, 0),
      ...qsymDiodeSubckt('D_SR3', secModel.subcktName, 2500, 700, 0),
      ...qsymDiodeSubckt('D_SR4', secModel.subcktName, 2500, 100, 0),
      wire(2100, 900, 2500, 900, 'v_rect'),
      wire(2500, 900, 2600, 900, 'v_rect'),
      wire(2100, 500, 2100, 300, 'sec_p'),
      netLabel(2100, 400, 'sec_p'),
      wire(2500, 500, 2500, 300, 'sec_n'),
      netLabel(2500, 400, 'sec_n'),
      wire(2100, -100, 2100, -200, 'GND'),
      wire(2500, -100, 2500, -200, 'GND'),
      wire(2100, -200, 2500, -200, 'GND'),
      netLabel(2100, -200, 'GND'),

      ...qsymL('L_OUT', `${state.Lo_uH.toFixed(2)}u`, 2800, 900, 2, false, 'Rser=1.5m'),
      wire(2600, 900, 2600, 900, 'v_rect'),
      wire(3000, 900, 3200, 900, 'v_out'),
      wire(3200, 900, 3200, 700, 'v_out')
    );
  }

  // --- 4. OUTPUT FILTER CAPACITOR BANK & LOAD ---
  lines.push(
    ...qsymC(
      'C_OUT',
      `${state.Co_uF.toFixed(1)}u`,
      3200,
      300,
      0,
      `Rser=${state.ESR_Co_mOhm.toFixed(2)}m`
    ),
    ...qsymR('R_LOAD', `${Rload.toFixed(3)}`, 3700, 300, 0),
    wire(3200, 700, 3200, 500, 'v_out'),
    wire(3200, 700, 3700, 700, 'v_out'),
    wire(3700, 700, 3700, 500, 'v_out'),
    wire(3200, 100, 3200, -200, 'GND'),
    wire(3700, 100, 3700, -200, 'GND'),
    wire(3200, -200, 3700, -200, 'GND'),
    netLabel(3200, -200, 'GND'),
    netLabel(3400, 700, 'v_out'),

    // --- 5. CLOSED-LOOP C++ Ø(.DLL) CONTROLLER + GATE DRIVERS ---
    ...qsymV('V_REF', `${state.Vout_V.toFixed(3)}`, -2400, -1400, 0),
    wire(-2400, -1200, -2200, -1200, 'ref_node'),
    netLabel(-2200, -1200, 'ref_node'),
    wire(-2400, -1600, -2400, -1700, 'GND'),
    netLabel(-2400, -1700, 'GND'),

    ...buildDllComponentBlock(
      'X_CTRL',
      ctrlFn,
      `VoltCraft ${state.controlType.toUpperCase()} Digital Controller`,
      -1200,
      -1200,
      DCDC_DLL_PINS
    ),
    // Left inputs (-400 relative to -1200 => -1600)
    wire(-1800, -1000, -1600, -1000, 'v_out'),
    netLabel(-1800, -1000, 'v_out'),
    wire(-1800, -1200, -1600, -1200, 'ref_node'),
    netLabel(-1800, -1200, 'ref_node'),
    wire(-1800, -1400, -1600, -1400, 'isns_node'),
    netLabel(-1800, -1400, 'isns_node'),
    // Right outputs (+400 relative to -1200 => -800)
    wire(-800, -800, -600, -800, 'pwm_a_hi'),
    netLabel(-600, -800, 'pwm_a_hi'),
    wire(-800, -1000, -600, -1000, 'pwm_a_lo'),
    netLabel(-600, -1000, 'pwm_a_lo'),
    wire(-800, -1200, -600, -1200, 'pwm_b_hi'),
    netLabel(-600, -1200, 'pwm_b_hi'),
    wire(-800, -1400, -600, -1400, 'pwm_b_lo'),
    netLabel(-600, -1400, 'pwm_b_lo'),
    wire(-800, -1600, -600, -1600, 'comp_node'),
    netLabel(-600, -1600, 'comp_node'),
    ...qsymR('R_COMP_PD', '10k', -400, -1800, 0),
    wire(-600, -1600, -400, -1600, 'comp_node'),
    wire(-400, -2000, -400, -2100, 'GND'),
    netLabel(-400, -2100, 'GND'),

    // Isolated gate driver buffers mapping DLL outputs to Q1..Q4 gates
    ...qsymBv('B_G1', 'V=V(pwm_a_hi)', 200, -1000),
    wire(200, -800, 200, -700, 'g1'),
    netLabel(200, -700, 'g1'),
    wire(200, -1200, 200, -1300, 'sw_a'),
    netLabel(200, -1300, 'sw_a'),

    ...qsymBv('B_G2', 'V=V(pwm_a_lo)', 200, -1700),
    wire(200, -1500, 200, -1400, 'g2'),
    netLabel(200, -1400, 'g2'),
    wire(200, -1900, 200, -2000, 'GND'),
    netLabel(200, -2000, 'GND')
  );

  if (state.topology !== 'llc-hb') {
    lines.push(
      ...qsymBv('B_G3', 'V=V(pwm_b_hi)', 800, -1000),
      wire(800, -800, 800, -700, 'g3'),
      netLabel(800, -700, 'g3'),
      wire(800, -1200, 800, -1300, 'sw_b'),
      netLabel(800, -1300, 'sw_b'),

      ...qsymBv('B_G4', 'V=V(pwm_b_lo)', 800, -1700),
      wire(800, -1500, 800, -1400, 'g4'),
      netLabel(800, -1400, 'g4'),
      wire(800, -1900, 800, -2000, 'GND'),
      netLabel(800, -2000, 'GND')
    );
  }

  // --- 6. QSPICE SIMULATION DIRECTIVES & MANUFACTURER MODEL LIBRARY ---
  lines.push(
    directiveText(1600, -900, '.lib voltcraft_models.lib', 1),
    directiveText(1600, -1100, `.param FSW=${fswHz} VIN=${state.Vin_nom_V} VOUT_REF=${state.Vout_V}`, 1),
    directiveText(1600, -1300, `.tran 0 ${tStop_us}u ${(tStop_us * 0.6).toFixed(0)}u 20n`, 1),
    directiveText(
      1600,
      -1500,
      `.meas TRAN Vout_avg AVG V(v_out) FROM ${(tStop_us * 0.7).toFixed(0)}u TO ${tStop_us}u`,
      1
    ),
    directiveText(
      1600,
      -1700,
      `.meas TRAN Ipri_rms RMS I(L_LK) FROM ${(tStop_us * 0.7).toFixed(0)}u TO ${tStop_us}u`,
      1
    ),
    directiveText(
      1600,
      -1900,
      `; Standalone netlist: ${baseName}.cir | C++ DLL: ${ctrlFn}.cpp | Waveforms: ${baseName}.qraw`,
      0.9
    ),
    '»',
    ''
  );

  return toCrlf(lines.join('\n'));
}

function buildAcDcQsch(
  baseName: string,
  ctrlFn: string,
  state: AcDcDesignState,
  res: AcDcResults
): string {
  const fswHz = state.fsw_kHz * 1e3;
  const Rload = (state.Vdc_bus_V * state.Vdc_bus_V) / Math.max(10, state.Pout_W);
  const swModel = generateManufacturerMosfetSubckt(res.sw, 1);
  const boostDiode = generatePfcBoostDiodeSubckt(state.Vdc_bus_V);

  const lines: string[] = [
    '«schematic',
    directiveText(
      -2600,
      1900,
      `; VoltCraft Power Electronics Studio -- QSPICE AC-DC PFC (${state.topology} | ${state.presetName})`,
      1.2
    ),
    directiveText(
      -2600,
      1700,
      `; Switch: ${swModel.manufacturer} ${res.sw.id} (.SUBCKT ${swModel.subcktName}) | Diode: ${boostDiode.manufacturer} ${boostDiode.mpn}`,
      0.95
    ),

    // --- 1. AC MAINS & EMI FILTER ---
    ...qsymV('V_AC', `SIN(0 ${(state.Vac_rms_V * Math.SQRT2).toFixed(2)} ${state.f_line_Hz})`, -2400, 400, 0),
    ...qsymL('L_DM', `${res.Ldm_uH.toFixed(1)}u`, -1900, 600, 2, false, 'Rser=5m'),
    ...qsymC('C_X', `${res.Cx_each_uF.toFixed(2)}u`, -1500, 400, 0),
    ...qsymR('R_PRE', `${state.prechargeR_Ohm ?? 22}`, -1100, 600, 2),
    wire(-2400, 600, -2100, 600, 'ac_in'),
    wire(-1700, 600, -1500, 600, 'ac_dm'),
    wire(-1500, 600, -1300, 600, 'ac_dm'),
    wire(-900, 600, -600, 600, 'ac_bus'),
    wire(-2400, 200, -1500, 200, 'ac_n'),
    wire(-1500, 200, -200, 200, 'ac_n'),
    netLabel(-2400, 200, 'ac_n'),
    netLabel(-600, 600, 'ac_bus'),

    // --- 2. FULL-WAVE DIODE BRIDGE (GBJ2510_DIODE) ---
    ...qsymDiodeSubckt('D_R1', 'GBJ2510_DIODE', -600, 800, 0),
    ...qsymDiodeSubckt('D_R2', 'GBJ2510_DIODE', -600, 0, 0),
    ...qsymDiodeSubckt('D_R3', 'GBJ2510_DIODE', -200, 800, 0),
    ...qsymDiodeSubckt('D_R4', 'GBJ2510_DIODE', -200, 0, 0),
    wire(-600, 1000, -200, 1000, 'v_rect'),
    wire(-200, 1000, 200, 1000, 'v_rect'),
    wire(-600, 600, -600, 200, 'ac_bus'),
    wire(-200, 600, -200, 200, 'ac_n'),
    wire(-600, -200, -200, -200, 'GND'),
    wire(-200, -200, 2200, -200, 'GND'),
    netLabel(-400, -200, 'GND'),
    netLabel(0, 1000, 'v_rect'),

    // --- 3. 1-PHASE / 2-PHASE INTERLEAVED BOOST STAGE ---
    ...qsymL('L_PFC1', `${state.Lpfc_uH.toFixed(1)}u`, 400, 1000, 2, false, 'Rser=8m'),
    ...qsymNmosSubckt('Q_PFC1', swModel.subcktName, 700, 400),
    ...qsymDiodeSubckt('D_B1', boostDiode.subcktName, 1100, 1000, 6),
    wire(600, 1000, 800, 1000, 'sw1'),
    wire(800, 1000, 800, 600, 'sw1'),
    wire(800, 1000, 900, 1000, 'sw1'),
    wire(800, 200, 800, -200, 'GND'),
    wire(500, 400, 400, 400, 'gpfc1'),
    netLabel(400, 400, 'gpfc1'),
    wire(1300, 1000, 1900, 1000, 'v_dc'),
  ];

  if (res.nPhases === 2) {
    lines.push(
      netLabel(1300, 1300, 'v_rect'),
      wire(1300, 1300, 1400, 1300, 'v_rect'),
      ...qsymL('L_PFC2', `${state.Lpfc_uH.toFixed(1)}u`, 1600, 1300, 2, false, 'Rser=8m'),
      ...qsymNmosSubckt('Q_PFC2', swModel.subcktName, 1500, 400),
      ...qsymDiodeSubckt('D_B2', boostDiode.subcktName, 2000, 1300, 6),
      wire(1800, 1300, 1800, 1000, 'sw2'),
      wire(1800, 1000, 1600, 1000, 'sw2'),
      wire(1600, 1000, 1600, 600, 'sw2'),
      wire(1600, 200, 1600, -200, 'GND'),
      wire(1300, 400, 1200, 400, 'gpfc2'),
      netLabel(1200, 400, 'gpfc2'),
      wire(2200, 1300, 2200, 1000, 'v_dc')
    );
  }

  // --- 4. DC-LINK BULK CAPACITOR & LOAD ---
  lines.push(
    ...qsymC(
      'C_DC',
      `${state.Cdc_uF.toFixed(0)}u`,
      1900,
      400,
      0,
      `Rser=${state.ESR_Cdc_mOhm.toFixed(1)}m`
    ),
    ...qsymR('R_LOAD', `${Rload.toFixed(2)}`, 2200, 400, 0),
    wire(1900, 1000, 1900, 600, 'v_dc'),
    wire(1900, 1000, 2200, 1000, 'v_dc'),
    wire(2200, 1000, 2200, 600, 'v_dc'),
    wire(1900, 200, 1900, -200, 'GND'),
    wire(2200, 200, 2200, -200, 'GND'),
    netLabel(2050, 1000, 'v_dc'),

    // --- 5. CLOSED-LOOP PFC C++ Ø(.DLL) CONTROLLER ---
    ...buildDllComponentBlock(
      'X_PFC_CTRL',
      ctrlFn,
      `VoltCraft ${res.nPhases}-Phase PFC Controller`,
      -1200,
      -1200,
      ACDC_DLL_PINS
    ),
    wire(-1800, -1000, -1600, -1000, 'v_rect'),
    netLabel(-1800, -1000, 'v_rect'),
    wire(-1800, -1200, -1600, -1200, 'v_dc'),
    netLabel(-1800, -1200, 'v_dc'),
    wire(-1800, -1400, -1600, -1400, 'sw1'),
    netLabel(-1800, -1400, 'sw1'),
    wire(-800, -1100, -600, -1100, 'gpfc1'),
    netLabel(-600, -1100, 'gpfc1'),
    wire(-800, -1300, -600, -1300, 'gpfc2'),
    netLabel(-600, -1300, 'gpfc2'),

    // --- 6. SIMULATION DIRECTIVES ---
    directiveText(400, -900, '.lib voltcraft_models.lib', 1),
    directiveText(
      400,
      -1100,
      `.param FSW=${fswHz} VAC_PK=${(state.Vac_rms_V * Math.SQRT2).toFixed(2)} FLINE=${state.f_line_Hz} VDC_REF=${state.Vdc_bus_V}`,
      1
    ),
    directiveText(400, -1300, '.tran 0 40m 20m 200n', 1),
    directiveText(400, -1500, '.meas TRAN Vdc_avg AVG V(v_dc) FROM 20m TO 40m', 1),
    directiveText(
      400,
      -1700,
      `; Netlist: ${baseName}.cir | C++ DLL: ${ctrlFn}.cpp | Waveforms: ${baseName}.qraw`,
      0.9
    ),
    '»',
    ''
  );

  return toCrlf(lines.join('\n'));
}

// ============================================================================
// 5. QSPICE WAVEFORM DATA (.qraw) GENERATOR (QSPICE ASCII .qraw FORMAT)
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
    `Flags: real forward log double`,
    `No. Variables: 6`,
    `No. Points: ${pts.length}`,
    `Variables:`,
    `\t0\ttime\ttime`,
    `\t1\tV(v_out)\tvoltage`,
    `\t2\tV(ref_node)\tvoltage`,
    `\t3\tI(L_OUT)\tcurrent`,
    `\t4\tI(R_LOAD)\tcurrent`,
    `\t5\tV(comp_node)\tvoltage`,
    `Values:`,
  ];

  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const tSec = (p.t_us * 1e-6).toExponential(8);
    const vComp = 0.5 + 4.0 * p.duty_u;
    lines.push(`${i}\t${tSec}`);
    lines.push(`${p.v_out_V.toExponential(8)}`);
    lines.push(`${p.v_ref_V.toExponential(8)}`);
    lines.push(`${p.i_lo_A.toExponential(8)}`);
    lines.push(`${p.i_load_A.toExponential(8)}`);
    lines.push(`${vComp.toExponential(8)}`);
  }

  return toCrlf(lines.join('\n') + '\n');
}

function buildAcDcQraw(state: AcDcDesignState, res: AcDcResults): string {
  const nPts = 240;
  const tStop_s = 2 / Math.max(45, state.f_line_Hz);
  const omega = 2 * Math.PI * state.f_line_Hz;
  const Vac_pk = state.Vac_rms_V * Math.SQRT2;
  const Iac_pk = res.Iin_rms_A * Math.SQRT2;
  const vRipple_pk = Math.max(0.5, res.Vdc_ripple_pp_V * 0.5);

  const lines: string[] = [
    `Title: VoltCraft AC-DC PFC Line-Cycle Simulation (${state.topology})`,
    `Date: ${new Date().toUTCString()}`,
    `Plotname: Transient Analysis`,
    `Flags: real forward log double`,
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
    lines.push(`${i}\t${t.toExponential(8)}`);
    lines.push(`${vac.toExponential(8)}`);
    lines.push(`${vdc.toExponential(8)}`);
    lines.push(`${iac.toExponential(8)}`);
    lines.push(`${iL1.toExponential(8)}`);
  }

  return toCrlf(lines.join('\n') + '\n');
}

// ============================================================================
// 6. PUBLIC BUNDLE GENERATORS (DC-DC & AC-DC)
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
  const libFileName = 'voltcraft_models.lib';

  const priModel = generateManufacturerMosfetSubckt(res.priDevice, state.nParallelPri);
  const secModel = generateManufacturerRectifierSubckt(
    res.secDevice,
    state.nParallelSec,
    state.rectMode
  );
  const libContent = toCrlf(
    [
      `* VoltCraft Power Electronics Studio -- Manufacturer SPICE Model Library`,
      `* Primary: ${priModel.manufacturer} ${res.priDevice.id} (.SUBCKT ${priModel.subcktName})`,
      `* Secondary: ${secModel.manufacturer} ${res.secDevice.id} (.SUBCKT ${secModel.subcktName})`,
      ``,
      priModel.spiceText,
      ``,
      secModel.spiceText,
      ``,
    ].join('\n')
  );

  const qschContent = buildDcDcQsch(baseName, ctrlFn, state, res);
  const cirContent = generateDcDcSpiceNetlist(state, res);
  const cppContent = buildDcDcControllerCpp(ctrlFn, state, res);
  const qrawContent = buildDcDcQraw(state, res);
  const qsymFiles = [
    {
      path: `symbols/${ctrlFn}.qsym`,
      content: buildDllStandaloneQsym(
        ctrlFn,
        `VoltCraft ${state.controlType.toUpperCase()} Digital Controller`,
        DCDC_DLL_PINS
      ),
    },
    {
      path: `symbols/xfmr_coupled.qsym`,
      content: buildCoupledTransformerQsym(state, res),
    },
  ];

  const readmeContent = [
    `VoltCraft Power Electronics Studio -- QSPICE Simulation Bundle (${state.topology.toUpperCase()})`,
    `================================================================================`,
    `Manufacturer Semiconductor Models Embedded:`,
    `  * Primary Switch : ${priModel.manufacturer} ${res.priDevice.id} -> .SUBCKT ${priModel.subcktName}`,
    `  * Secondary Rect : ${secModel.manufacturer} ${res.secDevice.id} -> .SUBCKT ${secModel.subcktName} (${state.rectMode})`,
    ``,
    `Included Files:`,
    `  1. ${qschFileName}          - Native QSPICE schematic (\\xff\\xd8\\xff\\xdb Latin-1 CRLF)`,
    `  2. ${libFileName}          - Manufacturer SPICE .SUBCKT library`,
    `  3. symbols/${ctrlFn}.qsym   - QSPICE Ø(.DLL) controller symbol`,
    `  4. symbols/xfmr_coupled.qsym - Coupled HF transformer symbol (${res.core.name})`,
    `  5. ${cirFileName}           - Standalone SPICE/QSPICE ASCII netlist (open-loop PWM)`,
    `  6. ${cppFileName}      - C++98 / DMC & MSVC compatible Ø(.DLL) closed-loop controller`,
    `  7. ${qrawFileName}          - Pre-computed RK4 load-step transient waveforms`,
    ``,
    `Quick Start in QSPICE:`,
    `  Option A (Instant Netlist Simulation):`,
    `    1. Open ${cirFileName} in QSPICE (File -> Open) and press Run (F5).`,
    `    2. Or CLI: QSPICE64.exe -r ${qrawFileName} ${cirFileName}`,
    ``,
    `  Option B (Closed-Loop Schematic + C++ Ø(.DLL) Controller):`,
    `    1. Compile ${cppFileName} (in QSPICE: Right-click X_CTRL -> Compile C++ DLL,`,
    `       or from QSPICE command prompt: dmc -mn -WD ${cppFileName} kernel32.lib).`,
    `    2. Open ${qschFileName} in QSPICE (keep ${libFileName} and ${ctrlFn}.dll in same folder).`,
    `    3. Press Run (F5) and compare switching waveforms against ${qrawFileName}.`,
    ``,
  ].join('\r\n');

  const entries: ZipEntry[] = [
    { path: qschFileName, content: buildQspiceBinaryFile(qschContent) },
    ...qsymFiles.map((s) => ({
      path: s.path,
      content: buildQspiceBinaryFile(s.content),
    })),
    { path: libFileName, content: libContent },
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
    libFileName,
    libContent,
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
  const libFileName = 'voltcraft_models.lib';

  const swModel = generateManufacturerMosfetSubckt(res.sw, 1);
  const boostDiode = generatePfcBoostDiodeSubckt(state.Vdc_bus_V);
  const libContent = toCrlf(
    [
      `* VoltCraft Power Electronics Studio -- Manufacturer AC-DC PFC SPICE Model Library`,
      `* Fast Switch : ${swModel.manufacturer} ${res.sw.id} (.SUBCKT ${swModel.subcktName})`,
      `* Boost Diode : ${boostDiode.manufacturer} ${boostDiode.mpn} (.SUBCKT ${boostDiode.subcktName})`,
      ``,
      swModel.spiceText,
      ``,
      boostDiode.spiceText,
      ``,
    ].join('\n')
  );

  const qschContent = buildAcDcQsch(baseName, ctrlFn, state, res);
  const cirContent = generateAcDcSpiceNetlist(state, res);
  const cppContent = buildAcDcControllerCpp(ctrlFn, state, res);
  const qrawContent = buildAcDcQraw(state, res);
  const qsymFiles = [
    {
      path: `symbols/${ctrlFn}.qsym`,
      content: buildDllStandaloneQsym(
        ctrlFn,
        `VoltCraft ${res.nPhases}-Phase PFC Controller`,
        ACDC_DLL_PINS
      ),
    },
  ];

  const readmeContent = [
    `VoltCraft Power Electronics Studio -- QSPICE AC-DC PFC Bundle (${state.topology})`,
    `================================================================================`,
    `Manufacturer Semiconductor Models Embedded:`,
    `  * Fast Switch : ${swModel.manufacturer} ${res.sw.id} -> .SUBCKT ${swModel.subcktName}`,
    `  * Boost Diode : ${boostDiode.manufacturer} ${boostDiode.mpn} -> .SUBCKT ${boostDiode.subcktName}`,
    ``,
    `Included Files:`,
    `  1. ${qschFileName}          - Native QSPICE PFC schematic (\\xff\\xd8\\xff\\xdb Latin-1 CRLF)`,
    `  2. ${libFileName}          - Manufacturer SPICE .SUBCKT library`,
    `  3. symbols/${ctrlFn}.qsym   - QSPICE Ø(.DLL) PFC controller symbol`,
    `  4. ${cirFileName}           - Standalone SPICE/QSPICE ASCII netlist`,
    `  5. ${cppFileName}      - C++98 / DMC & MSVC compatible Ø(.DLL) PFC controller`,
    `  6. ${qrawFileName}          - Pre-computed 2-line-cycle PFC waveform data`,
    ``,
    `Quick Start in QSPICE:`,
    `  1. Open ${cirFileName} directly in QSPICE and press Run (F5), OR`,
    `  2. Compile ${cppFileName} to ${ctrlFn}.dll (dmc -mn -WD ${cppFileName} kernel32.lib)`,
    `     and open ${qschFileName} (with ${libFileName} in the same directory).`,
    ``,
  ].join('\r\n');

  const entries: ZipEntry[] = [
    { path: qschFileName, content: buildQspiceBinaryFile(qschContent) },
    ...qsymFiles.map((s) => ({
      path: s.path,
      content: buildQspiceBinaryFile(s.content),
    })),
    { path: libFileName, content: libContent },
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
    libFileName,
    libContent,
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
