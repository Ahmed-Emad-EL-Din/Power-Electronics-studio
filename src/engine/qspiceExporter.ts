// ============================================================================
// QSPICE FULL SIMULATION SUITE EXPORTER (.zip)
// Aligned with QSPICE64 native file & C++ DLL specifications:
//  - <base>.qsch       : Ready-to-run primary QSPICE schematic (\xff\xd8\xff\xdb +
//                        Latin-1 CRLF), native PULSE gate drives + manufacturer
//                        .SUBCKT FETs/diodes + L2/K_TX + Type-II compensator.
//                        Press Run (F5) immediately with zero DLL compilation.
//  - <base>_cblock.qsch: Optional C++ Ø(.DLL) closed-loop schematic matching
//                        QSPICE Ø(.DLL) tag syntax («symbol / «type: Ø(.DLL)»).
//  - symbols/*.qsym    : 4-byte header (\xff\xd8\xff\xdb) + Latin-1 CRLF symbols
//  - voltcraft_models.lib : Standalone manufacturer .SUBCKT library
//  - <base>_ctrl.cpp   : C++98 / DMC (dmc -mn -WD) & MSVC Ø(.DLL) controller
//  - <base>.cir        : Standalone SPICE/QSPICE ASCII netlist
//  - <base>.qraw       : QSPICE64 binary waveform file (Flags: real + <f8 IEEE-754)
// ============================================================================

import { AcDcDesignState, DcDcDesignState } from '../data/databases';
import { AcDcResults } from './acdcEngine';
import { DcDcResults } from './dcdcEngine';
import { expandHybridCapBankForSpice, getDefaultHybridCapBank } from './passiveDesignEngine';
import {
  generateManufacturerMosfetSubckt,
  generateManufacturerRectifierSubckt,
  generatePfcBoostDiodeSubckt,
} from './spiceModelLibrary';
import {
  generateAcDcSpiceNetlist,
  generateCombinedSystemSpiceNetlist,
  generateDcDcSpiceNetlist,
} from './spiceNetlistExporter';
import { runTransientLoadStep } from './transientOdeSolver';
import { buildQspiceBinaryFile, buildZipArchive, encodeLatin1, ZipEntry } from './zipBuilder';

export interface QspiceSimulationBundle {
  baseName: string;
  qschFileName: string;
  qschContent: string;
  cblockQschFileName: string;
  cblockQschContent: string;
  qsymFiles: { path: string; content: string }[];
  libFileName: string;
  libContent: string;
  qrawFileName: string;
  qrawContent: string;
  qrawBytes: Uint8Array;
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
// 1. AUTHENTIC QSPICE BUILT-IN SYMBOL TEMPLATES WITH HORIZONTAL TEXT ALIGNMENT
//    Rotation text flags (verified against QSPICE64 Flyback_sim.qsch):
//      rot=0  : 7 = left-aligned right of symbol; 11 = right-aligned left of symbol
//      rot=2  : 110 = horizontal centered ABOVE; 109 = horizontal centered BELOW
//      rot=6  : 46 = horizontal centered ABOVE; 45 = horizontal centered BELOW
//      rot=12 : 75 = mirror-X left-aligned right of symbol
// ============================================================================

function qsymV(
  ref: string,
  value: string,
  x: number,
  y: number,
  rot = 0,
  valueBelow = false
): string[] {
  const valLine = valueBelow
    ? `      «text (-120,-520) 0.85 7 0 0x1000000 -1 -1 "${toQspiceLatin1Text(value)}"»`
    : `      «text (160,-100) 0.95 7 0 0x1000000 -1 -1 "${toQspiceLatin1Text(value)}"»`;

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
    `      «text (160,110) 1 7 0 0x1000000 -1 -1 "${ref}"»`,
    valLine,
    `      «pin (0,200) (0,0) 1 0 0 0x0 -1 "+"»`,
    `      «pin (0,-200) (0,0) 1 0 0 0x0 -1 "-"»`,
    `    »`,
    `  »`,
  ];
}

function qsymR(ref: string, value: string, x: number, y: number, rot = 0): string[] {
  const textLines =
    rot === 2
      ? [
          `      «text (110,0) 1 110 0 0x1000000 -1 -1 "${ref}"»`,
          `      «text (-110,0) 0.95 109 0 0x1000000 -1 -1 "${toQspiceLatin1Text(value)}"»`,
        ]
      : [
          `      «text (130,110) 1 7 0 0x1000000 -1 -1 "${ref}"»`,
          `      «text (130,-110) 0.95 7 0 0x1000000 -1 -1 "${toQspiceLatin1Text(value)}"»`,
        ];

  return [
    `  «component (${x},${y}) ${rot} 0`,
    `    «symbol R`,
    `      «type: R»`,
    `      «description: Resistor(USA Style Symbol)»`,
    `      «shorted pins: false»`,
    `      «line (0,200) (0,180) 0 0 0x1000000 -1 -1»`,
    `      «line (0,-180) (0,-200) 0 0 0x1000000 -1 -1»`,
    `      «zigzag (-80,180) (80,-180) 0 0 0 0x1000000 -1 -1»`,
    ...textLines,
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
  const textLines =
    rot === 2
      ? [
          `      «text (140,0) 1 110 0 0x1000000 -1 -1 "${ref}"»`,
          `      «text (-140,0) 0.95 109 0 0x1000000 -1 -1 "${toQspiceLatin1Text(value)}"»`,
          ...(spiceLine
            ? [`      «text (-270,0) 0.85 109 0 0x1000000 -1 -1 "${toQspiceLatin1Text(spiceLine)}"»`]
            : []),
        ]
      : [
          `      «text (160,120) 1 7 0 0x1000000 -1 -1 "${ref}"»`,
          `      «text (160,-80) 0.95 7 0 0x1000000 -1 -1 "${toQspiceLatin1Text(value)}"»`,
          ...(spiceLine
            ? [`      «text (160,-230) 0.85 7 0 0x1000000 -1 -1 "${toQspiceLatin1Text(spiceLine)}"»`]
            : []),
        ];

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
    ...textLines,
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
  spiceLine?: string,
  textSide: 'auto' | 'left' | 'right' = 'auto'
): string[] {
  const symName = withDot ? 'L2' : 'L';
  const dotLines = withDot
    ? [`      «ellipse (-60,160) (-30,130) 0 0 0 0x1000000 0x3000000 -1 -1»`]
    : [];

  let textLines: string[];
  if (rot === 2) {
    textLines = [
      `      «text (110,0) 1 110 0 0x1000000 -1 -1 "${ref}"»`,
      `      «text (-110,0) 0.95 109 0 0x1000000 -1 -1 "${toQspiceLatin1Text(value)}"»`,
      ...(spiceLine
        ? [`      «text (-240,0) 0.85 109 0 0x1000000 -1 -1 "${toQspiceLatin1Text(spiceLine)}"»`]
        : []),
    ];
  } else if (rot === 12) {
    textLines = [
      `      «text (150,120) 1 75 0 0x1000000 -1 -1 "${ref}"»`,
      `      «text (150,-60) 0.95 75 0 0x1000000 -1 -1 "${toQspiceLatin1Text(value)}"»`,
      ...(spiceLine
        ? [`      «text (150,-220) 0.85 75 0 0x1000000 -1 -1 "${toQspiceLatin1Text(spiceLine)}"»`]
        : []),
    ];
  } else if (textSide === 'left') {
    textLines = [
      `      «text (-160,120) 1 11 0 0x1000000 -1 -1 "${ref}"»`,
      `      «text (-160,-60) 0.95 11 0 0x1000000 -1 -1 "${toQspiceLatin1Text(value)}"»`,
      ...(spiceLine
        ? [`      «text (-160,-220) 0.85 11 0 0x1000000 -1 -1 "${toQspiceLatin1Text(spiceLine)}"»`]
        : []),
    ];
  } else {
    textLines = [
      `      «text (150,120) 1 7 0 0x1000000 -1 -1 "${ref}"»`,
      `      «text (150,-60) 0.95 7 0 0x1000000 -1 -1 "${toQspiceLatin1Text(value)}"»`,
      ...(spiceLine
        ? [`      «text (150,-220) 0.85 7 0 0x1000000 -1 -1 "${toQspiceLatin1Text(spiceLine)}"»`]
        : []),
    ];
  }

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
    ...textLines,
    `      «pin (0,200) (0,0) 1 0 0 0x0 -1 "1"»`,
    `      «pin (0,-200) (0,0) 1 0 0 0x0 -1 "2"»`,
    `    »`,
    `  »`,
  ];
}

/**
 * QSPICE NMOS symbol bound to a manufacturer .SUBCKT («type: X»).
 * Pins at rot=0: D=(x+100, y+200), G=(x-200, y), S=(x+100, y-200).
 * Library is loaded once globally via `.lib voltcraft_models.lib`.
 */
function qsymNmosSubckt(ref: string, subcktName: string, x: number, y: number): string[] {
  return [
    `  «component (${x},${y}) 0 0`,
    `    «symbol NMOS`,
    `      «type: X»`,
    `      «description: N-Channel Power Switch (.SUBCKT ${subcktName})»`,
    `      «shorted pins: false»`,
    `      «line (100,200) (100,150) 0 0 0x1000000 -1 -1»`,
    `      «line (100,-150) (100,-200) 0 0 0x1000000 -1 -1»`,
    `      «line (-100,150) (-100,-150) 0 0 0x1000000 -1 -1»`,
    `      «line (-100,0) (-200,0) 0 0 0x1000000 -1 -1»`,
    `      «line (100,-150) (-50,-150) 0 0 0x1000000 -1 -1»`,
    `      «line (100,150) (-50,150) 0 0 0x1000000 -1 -1»`,
    `      «line (-50,150) (-50,-150) 0 0 0x1000000 -1 -1»`,
    `      «triangle (70,-150) (-25,-125) (-25,-175) 0 0 0x1000000 0x3000000 -1 -1»`,
    `      «text (160,110) 1 7 0 0x1000000 -1 -1 "${ref}"»`,
    `      «text (160,-110) 0.85 7 0 0x1000000 -1 -1 "${subcktName}"»`,
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
  const textLines =
    rot === 6
      ? [
          `      «text (-130,0) 1 46 0 0x1000000 -1 -1 "${ref}"»`,
          `      «text (130,0) 0.85 45 0 0x1000000 -1 -1 "${subcktName}"»`,
        ]
      : rot === 2
        ? [
            `      «text (130,0) 1 110 0 0x1000000 -1 -1 "${ref}"»`,
            `      «text (-130,0) 0.85 109 0 0x1000000 -1 -1 "${subcktName}"»`,
          ]
        : [
            `      «text (150,90) 1 7 0 0x1000000 -1 -1 "${ref}"»`,
            `      «text (150,-90) 0.85 7 0 0x1000000 -1 -1 "${subcktName}"»`,
          ];

  return [
    `  «component (${x},${y}) ${rot} 0`,
    `    «symbol D`,
    `      «type: X»`,
    `      «description: Power Diode / SR Rectifier (.SUBCKT ${subcktName})»`,
    `      «shorted pins: false»`,
    `      «line (100,80) (-100,80) 0 0 0x1000000 -1 -1»`,
    `      «line (0,200) (0,80) 0 0 0x1000000 -1 -1»`,
    `      «line (0,-200) (0,-70) 0 0 0x1000000 -1 -1»`,
    `      «triangle (0,80) (100,-70) (-100,-70) 0 0 0x1000000 0x2000000 -1 -1»`,
    ...textLines,
    `      «pin (0,-200) (0,0) 1 0 0 0x0 -1 "A"»`,
    `      «pin (0,200) (0,0) 1 0 0 0x0 -1 "K"»`,
    `    »`,
    `  »`,
  ];
}

/** QSPICE Behavioral Voltage Source (B1). */
function qsymBv(
  ref: string,
  expr: string,
  x: number,
  y: number,
  exprBelow = false
): string[] {
  const exprLine = exprBelow
    ? `      «text (-120,-520) 0.85 7 0 0x1000000 -1 -1 "${toQspiceLatin1Text(expr)}"»`
    : `      «text (160,-100) 0.85 7 0 0x1000000 -1 -1 "${toQspiceLatin1Text(expr)}"»`;
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
    exprLine,
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

/**
 * Matches QSPICE native Ø(.DLL) block structure (Flyback_sim.qsch / digital_pwm_cblock.qsch):
 * unnamed «symbol, «type: Ø(.DLL)», no «library file:», and dllBaseName as the 2nd text tag.
 */
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
    `    «symbol`,
    `      «type: Ø(.DLL)»`,
    `      «description: ${toQspiceLatin1Text(description)}»`,
    `      «shorted pins: false»`,
    `      «rect (-400,${topY}) (400,${botY}) 0 0 0 0x4000000 0x4000000 -1 1 -1»`,
    `      «text (0,${topY + 140}) 1 12 0 0x1000000 -1 -1 "${ref}"»`,
    `      «text (0,${botY - 140}) 0.68781 13 0 0x1000000 -1 -1 "${dllBaseName}"»`,
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
      `«symbol`,
      `  «type: Ø(.DLL)»`,
      `  «description: ${toQspiceLatin1Text(description)}»`,
      `  «shorted pins: false»`,
      `  «rect (-400,${topY}) (400,${botY}) 0 0 0 0x4000000 0x4000000 -1 1 -1»`,
      `  «text (0,${topY + 140}) 1 12 0 0x1000000 -1 -1 "X1"»`,
      `  «text (0,${botY - 140}) 0.68781 13 0 0x1000000 -1 -1 "${dllBaseName}"»`,
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
    u0 = clampd(u0, 0.05, 0.94);

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

  const double a_hi_on = (t_cyc >= 0.0 && t_cyc < (t_half - TDEAD)) ? 12.0 : 0.0;
  const double a_lo_on = (t_cyc >= t_half && t_cyc < (TSW - TDEAD)) ? 12.0 : 0.0;

  const double slope_v = SE_V_S * t_cyc;
  const double eff_cmd = ${isPcmc ? 'clampd((inst->comp_v - slope_v - 0.1 * ISNS) * 0.25, 0.05, 0.94)' : 'inst->duty'};
  // PSFB overlap duty Deff = phase_shift / t_half; LLC-FB operates at 180 deg phase shift
  const double phase_shift = ${res.isLLC ? 't_half' : 'eff_cmd * t_half'};

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
// 4. QSPICE SCHEMATIC (.qsch) GENERATORS -- SPACIOUS, ZERO-OVERLAP LAYOUT
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

function buildDcDcPowerStageLines(
  state: DcDcDesignState,
  res: DcDcResults,
  priModel: ReturnType<typeof generateManufacturerMosfetSubckt>,
  secModel: ReturnType<typeof generateManufacturerRectifierSubckt>
): string[] {
  const n = Math.max(0.2, res.Np_actual / Math.max(1, res.Ns_actual));
  const Lpri_uH = Math.max(50, state.Lm_uH);
  const Lsec_uH = Lpri_uH / (n * n);
  const Rload = (state.Vout_V * state.Vout_V) / Math.max(1, state.Pout_W);
  const cinBank = getDefaultHybridCapBank('dcdc-cin', state);
  const coutBank = getDefaultHybridCapBank('dcdc-cout', state);
  let cinUnits = expandHybridCapBankForSpice(cinBank, 'C_IN', state.Vin_max_V, 4);
  if (cinUnits.length > 4) {
    cinUnits = expandHybridCapBankForSpice(cinBank, 'C_IN', state.Vin_max_V, 2);
  }
  const coutUnits = expandHybridCapBankForSpice(coutBank, 'C_OUT', state.Vout_V * 1.05, 4);

  const lines: string[] = [
    // --- ZONE 1: INPUT BUS & HYBRID PARALLEL CAPACITOR BANK (Cin) ---
    ...qsymV('V_IN', `{VIN}`, -5400, 900, 0),
    wire(-5400, 1100, -5400, 1800, 'vin_pos'),
    wire(-5400, 700, -5400, 0, 'GND'),
    netLabel(-5400, 0, 'GND'),
    netLabel(-5100, 1800, 'vin_pos'),
  ];

  let prevCinX = -5400;
  cinUnits.forEach((u, idx) => {
    const cx = -4700 + idx * 300;
    lines.push(
      ...qsymC(u.refDes, `${u.cap_uF}u`, cx, 900, 0, `Rser=${u.esr_mOhm}m Lser=${u.esl_nH}n`),
      wire(prevCinX, 1800, cx, 1800, 'vin_pos'),
      wire(cx, 1800, cx, 1100, 'vin_pos'),
      wire(prevCinX, 0, cx, 0, 'GND'),
      wire(cx, 700, cx, 0, 'GND')
    );
    prevCinX = cx;
  });

  lines.push(
    // --- ZONE 2: PRIMARY BRIDGE LEGS (1800-unit horizontal spacing, 1000-unit vertical) ---
    // Leg A (x=-3000): Q1 at y=1400, Q2 at y=400 -> D/S at x=-2900, G at x=-3200
    ...qsymNmosSubckt('Q1', priModel.subcktName, -3000, 1400),
    ...qsymNmosSubckt('Q2', priModel.subcktName, -3000, 400),
    wire(prevCinX, 1800, -2900, 1800, 'vin_pos'),
    wire(-2900, 1800, -2900, 1600, 'vin_pos'),
    wire(-2900, 1200, -2900, 900, 'sw_a'),
    wire(-2900, 900, -2900, 600, 'sw_a'),
    wire(-2900, 200, -2900, 0, 'GND'),
    wire(prevCinX, 0, -2900, 0, 'GND'),
    wire(-3200, 1400, -3400, 1400, 'g1'),
    netLabel(-3400, 1400, 'g1'),
    wire(-3200, 400, -3400, 400, 'g2'),
    netLabel(-3400, 400, 'g2'),
    netLabel(-2900, 900, 'sw_a')
  );

  // Leg B (x=-1200): 1800 units right of Leg A so MPN names never collide
  if (state.topology === 'llc-hb') {
    lines.push(
      ...qsymC('C_HB_TOP', '22u', -1100, 1400, 0, 'Rser=5m'),
      ...qsymC('C_HB_BOT', '22u', -1100, 400, 0, 'Rser=5m'),
      wire(-2900, 1800, -1100, 1800, 'vin_pos'),
      wire(-1100, 1800, -1100, 1600, 'vin_pos'),
      wire(-1100, 1200, -1100, 600, 'sw_b'),
      wire(-1100, 200, -1100, 0, 'GND'),
      wire(-2900, 0, -1100, 0, 'GND'),
      netLabel(-1100, 900, 'sw_b')
    );
  } else {
    lines.push(
      ...qsymNmosSubckt('Q3', priModel.subcktName, -1200, 1400),
      ...qsymNmosSubckt('Q4', priModel.subcktName, -1200, 400),
      wire(-2900, 1800, -1100, 1800, 'vin_pos'),
      wire(-1100, 1800, -1100, 1600, 'vin_pos'),
      wire(-1100, 1200, -1100, 900, 'sw_b'),
      wire(-1100, 900, -1100, 600, 'sw_b'),
      wire(-1100, 200, -1100, 0, 'GND'),
      wire(-2900, 0, -1100, 0, 'GND'),
      wire(-1400, 1400, -1600, 1400, 'g3'),
      netLabel(-1600, 1400, 'g3'),
      wire(-1400, 400, -1600, 400, 'g4'),
      netLabel(-1600, 400, 'g4'),
      netLabel(-1100, 900, 'sw_b')
    );
  }

  // --- ZONE 3: RESONANT / LEAKAGE TANK & COUPLED HF TRANSFORMER (x=+200..+4200) ---
  // L_LK (rot=2) at (600,1400) -> pins (400,1400) & (800,1400)
  // C_RES / C_BLK (rot=2) at (1700,1400) -> pins (1500,1400) & (1900,1400)
  // L_PRI (rot=0, left-aligned text) at (2600,900) -> pins (2600,1100) & (2600,700)
  // R_ISNS (rot=2) at (1700,400) -> pins (1500,400) & (1900,400)
  lines.push(
    netLabel(100, 1400, 'sw_a'),
    wire(100, 1400, 400, 1400, 'sw_a'),
    ...qsymL('L_LK', `${state.Llk_uH.toFixed(2)}u`, 600, 1400, 2, false, 'Rser=4m'),
    wire(800, 1400, 1500, 1400, 'pri_lk'),
    ...qsymC(
      res.isLLC ? 'C_RES' : 'C_BLK',
      res.isLLC ? `${state.Cr_nF.toFixed(1)}n` : '4.7u',
      1700,
      1400,
      2
    ),
    wire(1900, 1400, 2600, 1400, 'pri_hot'),
    wire(2600, 1400, 2600, 1100, 'pri_hot'),
    ...qsymL(
      'L_PRI',
      `${Lpri_uH.toFixed(2)}u`,
      2600,
      900,
      0,
      true,
      `Rser=${Math.max(0.002, res.Rpri_ac_mOhm * 1e-3).toFixed(4)}`,
      'left'
    ),
    wire(2600, 700, 2600, 400, 'pri_ret'),
    wire(2600, 400, 1900, 400, 'pri_ret'),
    ...qsymR('R_ISNS', '10m', 1700, 400, 2),
    wire(1500, 400, 1100, 400, 'sw_b'),
    netLabel(1100, 400, 'sw_b'),
    netLabel(2300, 400, 'isns_node')
  );

  // Secondary Windings (x=4000, rot=12 mirror-X) & Rectifier (x=5400..7000)
  if (state.txType === 'center-tapped') {
    lines.push(
      ...qsymL('L_SEC1', `${Lsec_uH.toFixed(3)}u`, 4000, 1300, 12, true),
      ...qsymL('L_SEC2', `${Lsec_uH.toFixed(3)}u`, 4000, 500, 12, true),
      wire(4000, 1500, 4700, 1500, 'sec_p'),
      wire(4000, 1100, 4000, 900, 'sec_ct'),
      wire(4000, 900, 4000, 700, 'sec_ct'),
      wire(4000, 300, 4700, 300, 'sec_n'),
      netLabel(4700, 1500, 'sec_p'),
      netLabel(4000, 900, 'sec_ct'),
      netLabel(4700, 300, 'sec_n'),
      directiveText(2700, -200, 'K_TX L_PRI L_SEC1 L_SEC2 0.9995', 1),

      ...qsymDiodeSubckt('D_SR1', secModel.subcktName, 5600, 1400, 0),
      ...qsymDiodeSubckt('D_SR2', secModel.subcktName, 5600, 400, 0),
      wire(5600, 1600, 5900, 1600, 'sec_p'),
      netLabel(5900, 1600, 'sec_p'),
      wire(5600, 600, 5900, 600, 'sec_n'),
      netLabel(5900, 600, 'sec_n'),
      wire(5600, 1200, 5600, 900, 'GND'),
      wire(5600, 200, 5600, 0, 'GND'),
      wire(5600, 900, 6200, 900, 'GND'),
      wire(6200, 900, 6200, 0, 'GND'),
      wire(5600, 0, 6200, 0, 'GND'),
      netLabel(5600, 0, 'GND'),

      netLabel(7400, 1600, 'sec_ct'),
      wire(7400, 1600, 8200, 1600, 'sec_ct'),
      ...qsymL('L_OUT', `${state.Lo_uH.toFixed(2)}u`, 8400, 1600, 2, false, 'Rser=1.5m'),
      wire(8600, 1600, 9600, 1600, 'v_out')
    );
  } else {
    lines.push(
      ...qsymL('L_SEC1', `${Lsec_uH.toFixed(3)}u`, 4000, 900, 12, true),
      wire(4000, 1100, 4700, 1100, 'sec_p'),
      wire(4000, 700, 4700, 700, 'sec_n'),
      netLabel(4700, 1100, 'sec_p'),
      netLabel(4700, 700, 'sec_n'),
      directiveText(2700, -200, 'K_TX L_PRI L_SEC1 0.9995', 1),

      ...qsymDiodeSubckt('D_SR1', secModel.subcktName, 5600, 1400, 0),
      ...qsymDiodeSubckt('D_SR2', secModel.subcktName, 5600, 400, 0),
      ...qsymDiodeSubckt('D_SR3', secModel.subcktName, 7200, 1400, 0),
      ...qsymDiodeSubckt('D_SR4', secModel.subcktName, 7200, 400, 0),
      wire(5600, 1600, 7200, 1600, 'v_rect'),
      wire(7200, 1600, 8200, 1600, 'v_rect'),
      wire(5600, 1200, 5600, 600, 'sec_p'),
      netLabel(5600, 900, 'sec_p'),
      wire(7200, 1200, 7200, 600, 'sec_n'),
      netLabel(7200, 900, 'sec_n'),
      wire(5600, 200, 5600, 0, 'GND'),
      wire(7200, 200, 7200, 0, 'GND'),
      wire(5600, 0, 7200, 0, 'GND'),
      netLabel(5600, 0, 'GND'),

      ...qsymL('L_OUT', `${state.Lo_uH.toFixed(2)}u`, 8400, 1600, 2, false, 'Rser=1.5m'),
      wire(8600, 1600, 9600, 1600, 'v_out')
    );
  }

  // --- ZONE 4: HYBRID OUTPUT CAPACITOR BANK & LOAD (x=9600..) ---
  let prevCoutX = 9600;
  coutUnits.forEach((u, idx) => {
    const cx = 9600 + idx * 500;
    lines.push(
      ...qsymC(u.refDes, `${u.cap_uF}u`, cx, 800, 0, `Rser=${u.esr_mOhm}m Lser=${u.esl_nH}n`),
      wire(cx, 1600, cx, 1000, 'v_out'),
      wire(cx, 600, cx, 0, 'GND')
    );
    if (idx > 0) {
      lines.push(wire(prevCoutX, 1600, cx, 1600, 'v_out'), wire(prevCoutX, 0, cx, 0, 'GND'));
    }
    prevCoutX = cx;
  });
  const rloadX = prevCoutX + 600;
  lines.push(
    ...qsymR('R_LOAD', `${Rload.toFixed(3)}`, rloadX, 800, 0),
    wire(prevCoutX, 1600, rloadX, 1600, 'v_out'),
    wire(rloadX, 1600, rloadX, 1000, 'v_out'),
    wire(rloadX, 600, rloadX, 0, 'GND'),
    wire(prevCoutX, 0, rloadX, 0, 'GND'),
    netLabel(9600, 0, 'GND'),
    netLabel(prevCoutX + 300, 1600, 'v_out')
  );

  return lines;
}

/**
 * Primary DC-DC Schematic: 100% Native SPICE (immediately runnable on F5 in QSPICE).
 */
function buildDcDcQsch(
  baseName: string,
  ctrlFn: string,
  state: DcDcDesignState,
  res: DcDcResults
): string {
  const fswHz = state.fsw_kHz * 1e3;
  const tDead_ns = Math.max(40, state.deadTime_ns);
  const tStop_us = Math.round(Math.max(500, (1e6 / fswHz) * 60));
  const tMeasStart_us = Math.round(tStop_us * 0.72);
  const deff = res.isLLC ? 1.0 : Math.max(0.15, Math.min(0.92, res.Deff_nom));

  const priModel = generateManufacturerMosfetSubckt(res.priDevice, state.nParallelPri);
  const secModel = generateManufacturerRectifierSubckt(
    res.secDevice,
    state.nParallelSec,
    state.rectMode
  );

  const lines: string[] = [
    '«schematic',
    directiveText(
      -5400,
      2600,
      `; VoltCraft Power Electronics Studio -- QSPICE (${state.topology.toUpperCase()} | ${state.presetName})`,
      1.25
    ),
    directiveText(
      -5400,
      2300,
      `; Pri: ${priModel.manufacturer} ${res.priDevice.id} (.SUBCKT ${priModel.subcktName}) | Sec: ${secModel.manufacturer} ${res.secDevice.id} (.SUBCKT ${secModel.subcktName})`,
      1.0
    ),
    ...buildDcDcPowerStageLines(state, res, priModel, secModel),

    // --- ZONE 5A: NATIVE ISOLATED GATE DRIVERS (2x2 GRID, 2600-UNIT HORIZONTAL PITCH) ---
    ...qsymV('V_G1', 'PULSE(0 12 0 15n 15n {TON} {TSW})', -5200, -1400, 0, true),
    wire(-5200, -1200, -5200, -1000, 'g1'),
    netLabel(-5200, -1000, 'g1'),
    wire(-5200, -1600, -5200, -1800, 'sw_a'),
    netLabel(-5200, -1800, 'sw_a'),

    ...qsymV('V_G2', 'PULSE(0 12 {THALF} 15n 15n {TON} {TSW})', -2600, -1400, 0, true),
    wire(-2600, -1200, -2600, -1000, 'g2'),
    netLabel(-2600, -1000, 'g2'),
    wire(-2600, -1600, -2600, -1800, 'GND'),
    netLabel(-2600, -1800, 'GND'),
  ];

  if (state.topology !== 'llc-hb') {
    lines.push(
      ...qsymV('V_G3', 'PULSE(0 12 {TD_B} 15n 15n {TON} {TSW})', -5200, -2700, 0, true),
      wire(-5200, -2500, -5200, -2300, 'g3'),
      netLabel(-5200, -2300, 'g3'),
      wire(-5200, -2900, -5200, -3100, 'sw_b'),
      netLabel(-5200, -3100, 'sw_b'),

      ...qsymV('V_G4', 'PULSE(0 12 {TD_B+THALF} 15n 15n {TON} {TSW})', -2600, -2700, 0, true),
      wire(-2600, -2500, -2600, -2300, 'g4'),
      netLabel(-2600, -2300, 'g4'),
      wire(-2600, -2900, -2600, -3100, 'GND'),
      netLabel(-2600, -3100, 'GND')
    );
  }

  const isOta = !res.isTwoZeroComp && res.type2Architecture === 'ota';
  const rFbTopK = isOta ? res.R1_ota_kOhm : res.R1_kOhm;
  const rFbBotK = isOta ? res.R4_ota_kOhm : res.R1_kOhm;
  const rCompK = isOta ? res.R2_ota_kOhm : res.R2_kOhm;

  // --- ZONE 5B: REFERENCE & TYPE-II COMPENSATOR NETWORK (x=+400..+4200, y=-1400..-2400) ---
  lines.push(
    ...qsymV('V_REF', `{VOUT_REF}`, 400, -1600, 0),
    wire(400, -1400, 400, -1200, 'ref_node'),
    netLabel(400, -1200, 'ref_node'),
    wire(400, -1800, 400, -2000, 'GND'),
    netLabel(400, -2000, 'GND'),

    ...qsymR('R_FB_TOP', `${rFbTopK.toFixed(2)}k`, 1700, -1300, 2),
    wire(1300, -1300, 1500, -1300, 'v_out'),
    netLabel(1300, -1300, 'v_out'),
    wire(1900, -1300, 2200, -1300, 'fb_node'),
    ...qsymR('R_FB_BOT', `${rFbBotK.toFixed(2)}k`, 2200, -1700, 0),
    wire(2200, -1300, 2200, -1500, 'fb_node'),
    wire(2200, -1900, 2200, -2100, 'GND'),
    netLabel(2200, -2100, 'GND'),
    netLabel(2200, -1300, 'fb_node'),

    ...qsymBv('B_COMP', 'V=limit(2.5+8*(V(ref_node)-V(v_out)),0.4,4.8)', 3300, -1600, true),
    wire(3300, -1400, 3300, -1200, 'comp_node'),
    netLabel(3300, -1200, 'comp_node'),
    wire(3300, -1800, 3300, -2000, 'GND'),
    netLabel(3300, -2000, 'GND'),
    ...qsymR('R_COMP', `${rCompK.toFixed(2)}k`, 4300, -1600, 0),
    wire(3300, -1200, 4300, -1200, 'comp_node'),
    wire(4300, -1200, 4300, -1400, 'comp_node'),
    wire(4300, -1800, 4300, -2000, 'GND'),
    netLabel(4300, -2000, 'GND'),

    // --- ZONE 6: QSPICE SIMULATION DIRECTIVES (x=+5600, y=-1100..-3400) ---
    directiveText(5600, -1100, '.lib voltcraft_models.lib', 1),
    directiveText(
      5600,
      -1420,
      `.param FSW=${fswHz} VIN=${state.Vin_nom_V} VOUT_REF=${state.Vout_V} DEFF=${deff.toFixed(4)}`,
      1
    ),
    directiveText(
      5600,
      -1740,
      `.param TSW={1/FSW} THALF={0.5*TSW} TDEAD=${tDead_ns}n TON={THALF-TDEAD} TD_B={DEFF*THALF}`,
      1
    ),
    directiveText(5600, -2060, `.ic V(v_out)={VOUT_REF*0.92}`, 1),
    directiveText(5600, -2380, '.options reltol=1m', 1),
    directiveText(5600, -2700, `.tran 0 ${tStop_us}u 0 25n`, 1),
    directiveText(
      5600,
      -3020,
      `.meas TRAN Vout_avg AVG V(v_out) FROM ${tMeasStart_us}u TO ${tStop_us}u`,
      1
    ),
    directiveText(
      5600,
      -3340,
      `.meas TRAN Ipri_rms RMS I(L_LK) FROM ${tMeasStart_us}u TO ${tStop_us}u`,
      1
    ),
    directiveText(
      5600,
      -3660,
      `; C++ DLL closed-loop variant: ${baseName}_cblock.qsch (${ctrlFn}.cpp) | Pre-sim: ${baseName}.qraw`,
      0.9
    ),
    '»',
    ''
  );

  return toCrlf(lines.join('\n'));
}

/**
 * Optional C++ Ø(.DLL) Closed-Loop Schematic (<baseName>_cblock.qsch).
 */
function buildDcDcCblockQsch(
  baseName: string,
  ctrlFn: string,
  state: DcDcDesignState,
  res: DcDcResults
): string {
  const fswHz = state.fsw_kHz * 1e3;
  const tStop_us = Math.round(Math.max(500, (1e6 / fswHz) * 60));
  const tMeasStart_us = Math.round(tStop_us * 0.72);

  const priModel = generateManufacturerMosfetSubckt(res.priDevice, state.nParallelPri);
  const secModel = generateManufacturerRectifierSubckt(
    res.secDevice,
    state.nParallelSec,
    state.rectMode
  );

  const lines: string[] = [
    '«schematic',
    directiveText(
      -5400,
      2600,
      `; VoltCraft C++ DLL Closed-Loop Schematic -- ${state.topology.toUpperCase()} (${state.presetName})`,
      1.25
    ),
    directiveText(
      -5400,
      2300,
      `; Compile ${ctrlFn}.cpp first (Right-click X_CTRL -> Compile C++ DLL or: dmc -mn -WD ${ctrlFn}.cpp kernel32.lib)`,
      1.0
    ),
    ...buildDcDcPowerStageLines(state, res, priModel, secModel),

    // --- ZONE 5: SPACIOUS Ø(.DLL) CONTROLLER & ISOLATED GATE DRIVERS ---
    ...qsymV('V_REF', `{VOUT_REF}`, -4800, -1800, 0),
    wire(-4800, -1600, -4400, -1600, 'ref_node'),
    netLabel(-4400, -1600, 'ref_node'),
    wire(-4800, -2000, -4800, -2200, 'GND'),
    netLabel(-4800, -2200, 'GND'),

    ...buildDllComponentBlock(
      'X_CTRL',
      ctrlFn,
      `VoltCraft ${state.controlType.toUpperCase()} Digital Controller`,
      -2600,
      -1800,
      DCDC_DLL_PINS
    ),
    // Left inputs (-400 relative to -2600 => -3000)
    wire(-3500, -1600, -3000, -1600, 'v_out'),
    netLabel(-3500, -1600, 'v_out'),
    wire(-3500, -1800, -3000, -1800, 'ref_node'),
    netLabel(-3500, -1800, 'ref_node'),
    wire(-3500, -2000, -3000, -2000, 'isns_node'),
    netLabel(-3500, -2000, 'isns_node'),
    // Right outputs (+400 relative to -2600 => -2200)
    wire(-2200, -1400, -1700, -1400, 'pwm_a_hi'),
    netLabel(-1700, -1400, 'pwm_a_hi'),
    wire(-2200, -1600, -1700, -1600, 'pwm_a_lo'),
    netLabel(-1700, -1600, 'pwm_a_lo'),
    wire(-2200, -1800, -1700, -1800, 'pwm_b_hi'),
    netLabel(-1700, -1800, 'pwm_b_hi'),
    wire(-2200, -2000, -1700, -2000, 'pwm_b_lo'),
    netLabel(-1700, -2000, 'pwm_b_lo'),
    wire(-2200, -2200, -1700, -2200, 'comp_node'),
    netLabel(-1700, -2200, 'comp_node'),
    ...qsymR('R_COMP_PD', '10k', -1300, -2500, 0),
    wire(-1700, -2200, -1300, -2200, 'comp_node'),
    wire(-1300, -2200, -1300, -2300, 'comp_node'),
    wire(-1300, -2700, -1300, -2900, 'GND'),
    netLabel(-1300, -2900, 'GND'),

    // Isolated gate driver buffers (1400-unit spacing, clean horizontal labels)
    ...qsymBv('B_G1', 'V=V(pwm_a_hi)', 200, -1500),
    wire(200, -1300, 200, -1100, 'g1'),
    netLabel(200, -1100, 'g1'),
    wire(200, -1700, 200, -1900, 'sw_a'),
    netLabel(200, -1900, 'sw_a'),

    ...qsymBv('B_G2', 'V=V(pwm_a_lo)', 200, -2600),
    wire(200, -2400, 200, -2200, 'g2'),
    netLabel(200, -2200, 'g2'),
    wire(200, -2800, 200, -3000, 'GND'),
    netLabel(200, -3000, 'GND'),
  ];

  if (state.topology !== 'llc-hb') {
    lines.push(
      ...qsymBv('B_G3', 'V=V(pwm_b_hi)', 1800, -1500),
      wire(1800, -1300, 1800, -1100, 'g3'),
      netLabel(1800, -1100, 'g3'),
      wire(1800, -1700, 1800, -1900, 'sw_b'),
      netLabel(1800, -1900, 'sw_b'),

      ...qsymBv('B_G4', 'V=V(pwm_b_lo)', 1800, -2600),
      wire(1800, -2400, 1800, -2200, 'g4'),
      netLabel(1800, -2200, 'g4'),
      wire(1800, -2800, 1800, -3000, 'GND'),
      netLabel(1800, -3000, 'GND')
    );
  }

  lines.push(
    directiveText(3800, -1200, '.lib voltcraft_models.lib', 1),
    directiveText(
      3800,
      -1520,
      `.param FSW=${fswHz} VIN=${state.Vin_nom_V} VOUT_REF=${state.Vout_V}`,
      1
    ),
    directiveText(3800, -1840, `.ic V(v_out)={VOUT_REF*0.92}`, 1),
    directiveText(3800, -2160, '.options reltol=1m', 1),
    directiveText(3800, -2480, `.tran 0 ${tStop_us}u 0 25n`, 1),
    directiveText(
      3800,
      -2800,
      `.meas TRAN Vout_avg AVG V(v_out) FROM ${tMeasStart_us}u TO ${tStop_us}u`,
      1
    ),
    directiveText(
      3800,
      -3120,
      `.meas TRAN Ipri_rms RMS I(L_LK) FROM ${tMeasStart_us}u TO ${tStop_us}u`,
      1
    ),
    directiveText(
      3800,
      -3440,
      `; Native instant-run version: ${baseName}.qsch | Netlist: ${baseName}.cir`,
      0.9
    ),
    '»',
    ''
  );

  return toCrlf(lines.join('\n'));
}

function buildAcDcPowerStageLines(
  state: AcDcDesignState,
  res: AcDcResults,
  swModel: ReturnType<typeof generateManufacturerMosfetSubckt>,
  boostDiode: ReturnType<typeof generatePfcBoostDiodeSubckt>
): string[] {
  const Rload = (state.Vdc_bus_V * state.Vdc_bus_V) / Math.max(10, state.Pout_W);

  const lines: string[] = [
    // --- ZONE 1: AC MAINS & EMI FILTER (x=-5000..-2000) ---
    ...qsymV(
      'V_AC',
      `SIN(0 ${(state.Vac_rms_V * Math.SQRT2).toFixed(2)} ${state.f_line_Hz})`,
      -5000,
      800,
      0,
      true
    ),
    ...qsymL('L_DM', `${res.Ldm_uH.toFixed(1)}u`, -3800, 1200, 2, false, 'Rser=5m'),
    ...qsymC('C_X', `${res.Cx_each_uF.toFixed(2)}u`, -3000, 800, 0),
    ...qsymR('R_PRE', `${state.prechargeR_Ohm ?? 22}`, -2200, 1200, 2),
    wire(-5000, 1000, -5000, 1200, 'ac_in'),
    wire(-5000, 1200, -4000, 1200, 'ac_in'),
    wire(-3600, 1200, -3000, 1200, 'ac_dm'),
    wire(-3000, 1200, -3000, 1000, 'ac_dm'),
    wire(-3000, 1200, -2400, 1200, 'ac_dm'),
    wire(-2000, 1200, -1200, 1200, 'ac_bus'),
    wire(-5000, 600, -5000, 400, 'ac_n'),
    wire(-5000, 400, -3000, 400, 'ac_n'),
    wire(-3000, 600, -3000, 400, 'ac_n'),
    wire(-3000, 400, -200, 400, 'ac_n'),
    netLabel(-4600, 400, 'ac_n'),
    netLabel(-1500, 1200, 'ac_bus'),

    // --- ZONE 2: FULL-WAVE DIODE BRIDGE (GBJ2510_DIODE, x=-1200..-200, 1000-unit spacing) ---
    ...qsymDiodeSubckt('D_R1', 'GBJ2510_DIODE', -1200, 1500, 0),
    ...qsymDiodeSubckt('D_R2', 'GBJ2510_DIODE', -1200, 300, 0),
    ...qsymDiodeSubckt('D_R3', 'GBJ2510_DIODE', -200, 1500, 0),
    ...qsymDiodeSubckt('D_R4', 'GBJ2510_DIODE', -200, 300, 0),
    wire(-1200, 1700, -200, 1700, 'v_rect'),
    wire(-200, 1700, 600, 1700, 'v_rect'),
    wire(-1200, 1300, -1200, 500, 'ac_bus'),
    wire(-200, 1300, -200, 500, 'ac_n'),
    wire(-1200, 100, -1200, 0, 'GND'),
    wire(-200, 100, -200, 0, 'GND'),
    wire(-1200, 0, 5600, 0, 'GND'),
    netLabel(-700, 0, 'GND'),
    netLabel(200, 1700, 'v_rect'),

    // --- ZONE 3: 1-PHASE / 2-PHASE INTERLEAVED BOOST STAGE ---
    ...qsymL('L_PFC1', `${state.Lpfc_uH.toFixed(1)}u`, 800, 1700, 2, false, 'Rser=8m'),
    ...qsymNmosSubckt('Q_PFC1', swModel.subcktName, 1400, 800),
    ...qsymDiodeSubckt('D_B1', boostDiode.subcktName, 2400, 1700, 6),
    wire(1000, 1700, 1500, 1700, 'sw1'),
    wire(1500, 1700, 1500, 1000, 'sw1'),
    wire(1500, 1700, 2200, 1700, 'sw1'),
    wire(1500, 600, 1500, 0, 'GND'),
    wire(1200, 800, 1000, 800, 'gpfc1'),
    netLabel(1000, 800, 'gpfc1'),
    wire(2600, 1700, 4400, 1700, 'v_dc'),
  ];

  if (res.nPhases === 2) {
    lines.push(
      netLabel(2500, 2300, 'v_rect'),
      wire(2500, 2300, 2700, 2300, 'v_rect'),
      ...qsymL('L_PFC2', `${state.Lpfc_uH.toFixed(1)}u`, 2900, 2300, 2, false, 'Rser=8m'),
      ...qsymNmosSubckt('Q_PFC2', swModel.subcktName, 3400, 800),
      ...qsymDiodeSubckt('D_B2', boostDiode.subcktName, 4100, 2300, 6),
      wire(3100, 2300, 3500, 2300, 'sw2'),
      wire(3500, 2300, 3500, 1000, 'sw2'),
      wire(3500, 2300, 3900, 2300, 'sw2'),
      wire(3500, 600, 3500, 0, 'GND'),
      wire(3200, 800, 3000, 800, 'gpfc2'),
      netLabel(3000, 800, 'gpfc2'),
      wire(4300, 2300, 4400, 2300, 'v_dc'),
      wire(4400, 2300, 4400, 1700, 'v_dc')
    );
  }

  // --- ZONE 4: HYBRID DC-LINK CAPACITOR BANK & LOAD (x=4400..) ---
  const cdcBank = getDefaultHybridCapBank('acdc-cdc', undefined, state);
  const cdcUnits = expandHybridCapBankForSpice(cdcBank, 'C_DC', state.Vdc_bus_V * 1.04, 4);
  let prevCdcX = 4400;
  cdcUnits.forEach((u, idx) => {
    const cx = 4400 + idx * 500;
    lines.push(
      ...qsymC(u.refDes, `${u.cap_uF}u`, cx, 800, 0, `Rser=${u.esr_mOhm}m Lser=${u.esl_nH}n`),
      wire(cx, 1700, cx, 1000, 'v_dc'),
      wire(cx, 600, cx, 0, 'GND')
    );
    if (idx > 0) {
      lines.push(wire(prevCdcX, 1700, cx, 1700, 'v_dc'), wire(prevCdcX, 0, cx, 0, 'GND'));
    }
    prevCdcX = cx;
  });
  const acdcRloadX = prevCdcX + 600;
  lines.push(
    ...qsymR('R_LOAD', `${Rload.toFixed(2)}`, acdcRloadX, 800, 0),
    wire(prevCdcX, 1700, acdcRloadX, 1700, 'v_dc'),
    wire(acdcRloadX, 1700, acdcRloadX, 1000, 'v_dc'),
    wire(acdcRloadX, 600, acdcRloadX, 0, 'GND'),
    wire(prevCdcX, 0, acdcRloadX, 0, 'GND'),
    netLabel(prevCdcX + 300, 1700, 'v_dc')
  );

  return lines;
}

/**
 * Primary AC-DC PFC Schematic: 100% Native SPICE (immediately runnable on F5 in QSPICE).
 */
function buildAcDcQsch(
  baseName: string,
  ctrlFn: string,
  state: AcDcDesignState,
  res: AcDcResults
): string {
  const fswHz = state.fsw_kHz * 1e3;
  const swModel = generateManufacturerMosfetSubckt(res.sw, 1);
  const boostDiode = generatePfcBoostDiodeSubckt(state.Vdc_bus_V);

  const lines: string[] = [
    '«schematic',
    directiveText(
      -5000,
      2900,
      `; VoltCraft Power Electronics Studio -- QSPICE AC-DC PFC (${state.topology} | ${state.presetName})`,
      1.25
    ),
    directiveText(
      -5000,
      2600,
      `; Switch: ${swModel.manufacturer} ${res.sw.id} (.SUBCKT ${swModel.subcktName}) | Diode: ${boostDiode.manufacturer} ${boostDiode.mpn}`,
      1.0
    ),
    ...buildAcDcPowerStageLines(state, res, swModel, boostDiode),

    // --- ZONE 5: NATIVE AVERAGE-CURRENT PFC GATE DRIVERS ---
    ...qsymBv('B_DUTY', 'V=limit(1-abs(V(v_rect))/max(50,V(v_dc))+0.02*(VDC_REF-V(v_dc)),0.05,0.92)', -4400, -1400, true),
    wire(-4400, -1200, -4400, -1000, 'd_cmd'),
    netLabel(-4400, -1000, 'd_cmd'),
    wire(-4400, -1600, -4400, -1800, 'GND'),
    netLabel(-4400, -1800, 'GND'),

    ...qsymV('V_SAW1', 'PULSE(0 1 0 {0.98*TSW} {0.02*TSW} 1n {TSW})', -2000, -1400, 0, true),
    wire(-2000, -1200, -2000, -1000, 'saw1'),
    netLabel(-2000, -1000, 'saw1'),
    wire(-2000, -1600, -2000, -1800, 'GND'),
    netLabel(-2000, -1800, 'GND'),

    ...qsymBv('B_PWM1', 'V=if(V(d_cmd)>V(saw1),12,0)', 400, -1400, true),
    wire(400, -1200, 400, -1000, 'gpfc1'),
    netLabel(400, -1000, 'gpfc1'),
    wire(400, -1600, 400, -1800, 'GND'),
    netLabel(400, -1800, 'GND'),
  ];

  if (res.nPhases === 2) {
    lines.push(
      ...qsymV('V_SAW2', 'PULSE(0 1 {0.5*TSW} {0.98*TSW} {0.02*TSW} 1n {TSW})', -2000, -2700, 0, true),
      wire(-2000, -2500, -2000, -2300, 'saw2'),
      netLabel(-2000, -2300, 'saw2'),
      wire(-2000, -2900, -2000, -3100, 'GND'),
      netLabel(-2000, -3100, 'GND'),

      ...qsymBv('B_PWM2', 'V=if(V(d_cmd)>V(saw2),12,0)', 400, -2700, true),
      wire(400, -2500, 400, -2300, 'gpfc2'),
      netLabel(400, -2300, 'gpfc2'),
      wire(400, -2900, 400, -3100, 'GND'),
      netLabel(400, -3100, 'GND')
    );
  }

  lines.push(
    directiveText(2600, -1100, '.lib voltcraft_models.lib', 1),
    directiveText(
      2600,
      -1420,
      `.param FSW=${fswHz} TSW={1/FSW} VAC_PK=${(state.Vac_rms_V * Math.SQRT2).toFixed(2)} FLINE=${state.f_line_Hz} VDC_REF=${state.Vdc_bus_V}`,
      1
    ),
    directiveText(2600, -1740, `.ic V(v_dc)=${state.Vdc_bus_V.toFixed(1)}`, 1),
    directiveText(2600, -2060, '.options reltol=1m', 1),
    directiveText(2600, -2380, '.tran 0 40m 20m 250n', 1),
    directiveText(2600, -2700, '.meas TRAN Vdc_avg AVG V(v_dc) FROM 20m TO 40m', 1),
    directiveText(
      2600,
      -3020,
      `; C++ DLL closed-loop variant: ${baseName}_cblock.qsch (${ctrlFn}.cpp) | Pre-sim: ${baseName}.qraw`,
      0.9
    ),
    '»',
    ''
  );

  return toCrlf(lines.join('\n'));
}

function buildAcDcCblockQsch(
  baseName: string,
  ctrlFn: string,
  state: AcDcDesignState,
  res: AcDcResults
): string {
  const fswHz = state.fsw_kHz * 1e3;
  const swModel = generateManufacturerMosfetSubckt(res.sw, 1);
  const boostDiode = generatePfcBoostDiodeSubckt(state.Vdc_bus_V);

  const lines: string[] = [
    '«schematic',
    directiveText(
      -5000,
      2900,
      `; VoltCraft C++ DLL Closed-Loop PFC -- ${state.topology} (${state.presetName})`,
      1.25
    ),
    directiveText(
      -5000,
      2600,
      `; Compile ${ctrlFn}.cpp first (Right-click X_PFC_CTRL -> Compile C++ DLL or: dmc -mn -WD ${ctrlFn}.cpp kernel32.lib)`,
      1.0
    ),
    ...buildAcDcPowerStageLines(state, res, swModel, boostDiode),

    ...buildDllComponentBlock(
      'X_PFC_CTRL',
      ctrlFn,
      `VoltCraft ${res.nPhases}-Phase PFC Controller`,
      -2600,
      -1600,
      ACDC_DLL_PINS
    ),
    wire(-3500, -1400, -3000, -1400, 'v_rect'),
    netLabel(-3500, -1400, 'v_rect'),
    wire(-3500, -1600, -3000, -1600, 'v_dc'),
    netLabel(-3500, -1600, 'v_dc'),
    wire(-3500, -1800, -3000, -1800, 'sw1'),
    netLabel(-3500, -1800, 'sw1'),
    wire(-2200, -1500, -1600, -1500, 'gpfc1'),
    netLabel(-1600, -1500, 'gpfc1'),
    wire(-2200, -1700, -1600, -1700, 'gpfc2'),
    netLabel(-1600, -1700, 'gpfc2'),

    directiveText(1200, -1100, '.lib voltcraft_models.lib', 1),
    directiveText(
      1200,
      -1420,
      `.param FSW=${fswHz} VAC_PK=${(state.Vac_rms_V * Math.SQRT2).toFixed(2)} FLINE=${state.f_line_Hz} VDC_REF=${state.Vdc_bus_V}`,
      1
    ),
    directiveText(1200, -1740, `.ic V(v_dc)=${state.Vdc_bus_V.toFixed(1)}`, 1),
    directiveText(1200, -2060, '.options reltol=1m', 1),
    directiveText(1200, -2380, '.tran 0 40m 20m 250n', 1),
    directiveText(1200, -2700, '.meas TRAN Vdc_avg AVG V(v_dc) FROM 20m TO 40m', 1),
    directiveText(
      1200,
      -3020,
      `; Native instant-run version: ${baseName}.qsch | Netlist: ${baseName}.cir`,
      0.9
    ),
    '»',
    ''
  ];

  return toCrlf(lines.join('\n'));
}

// ============================================================================
// 5. QSPICE64 BINARY WAVEFORM (.qraw) GENERATOR (Flags: real + <f8 IEEE-754)
//    Verified against QSPICE64 qux_export_source.qraw fixture:
//      - Header uses LF (`\n`), `Flags: real`, `0\tTime\ttime`, `Command: QSPICE64...`
//      - Payload after `Binary:\n` is little-endian IEEE-754 Float64 (`<f8`)
// ============================================================================

function buildQspiceBinaryQraw(
  title: string,
  variables: { name: string; type: string }[],
  rows: number[][]
): { qrawBytes: Uint8Array; qrawSummary: string } {
  const nVars = variables.length;
  const nPts = rows.length;
  const tMax = nPts > 0 ? rows[nPts - 1][0] : 0;

  const headerLines = [
    `Title: * ${toQspiceLatin1Text(title)}`,
    `Date: ${new Date().toUTCString()}`,
    `Plotname: Transient Analysis`,
    `Flags: real`,
    `Abscissa:     0.000000000000000e+00     ${tMax.toExponential(15)}                     `,
    `No. Variables: ${nVars}`,
    `No. Points: ${nPts}`,
    `Command: QSPICE64, Build Apr 18 2026 11:48:13`,
    `Variables:`,
    ...variables.map((v, idx) => `\t${idx}\t${v.name}\t${v.type}`),
    `Binary:`,
  ];
  const headerStr = headerLines.join('\n') + '\n';
  const headerBytes = encodeLatin1(headerStr);

  const payloadByteLen = nPts * nVars * 8;
  const out = new Uint8Array(headerBytes.length + payloadByteLen);
  out.set(headerBytes, 0);

  const view = new DataView(out.buffer, headerBytes.length, payloadByteLen);
  let offset = 0;
  for (let i = 0; i < nPts; i++) {
    const row = rows[i];
    for (let j = 0; j < nVars; j++) {
      view.setFloat64(offset, Number.isFinite(row[j]) ? row[j] : 0, true);
      offset += 8;
    }
  }

  return { qrawBytes: out, qrawSummary: headerStr };
}

function buildDcDcQraw(state: DcDcDesignState, res: DcDcResults): {
  qrawBytes: Uint8Array;
  qrawSummary: string;
} {
  const sim = runTransientLoadStep(state, res, {
    scenario: 'load-step',
    initialLoad_pct: 25,
    finalLoad_pct: 90,
    stepTime_us: 150,
    totalTime_us: 900,
    slewRate_A_us: 8,
  });

  const rows = sim.points.map((p) => [
    p.t_us * 1e-6,
    p.v_out_V,
    p.v_ref_V,
    p.i_lo_A,
    p.i_load_A,
    0.5 + 4.0 * p.duty_u,
  ]);

  return buildQspiceBinaryQraw(
    `VoltCraft ${state.topology.toUpperCase()} Transient Response (${state.presetName})`,
    [
      { name: 'Time', type: 'time' },
      { name: 'V(v_out)', type: 'voltage' },
      { name: 'V(ref_node)', type: 'voltage' },
      { name: 'I(L_OUT)', type: 'current' },
      { name: 'I(R_LOAD)', type: 'current' },
      { name: 'V(comp_node)', type: 'voltage' },
    ],
    rows
  );
}

function buildAcDcQraw(state: AcDcDesignState, res: AcDcResults): {
  qrawBytes: Uint8Array;
  qrawSummary: string;
} {
  const nPts = 400;
  const tStop_s = 2 / Math.max(45, state.f_line_Hz);
  const omega = 2 * Math.PI * state.f_line_Hz;
  const Vac_pk = state.Vac_rms_V * Math.SQRT2;
  const Iac_pk = res.Iin_rms_A * Math.SQRT2;
  const vRipple_pk = Math.max(0.5, res.Vdc_ripple_pp_V * 0.5);

  const rows: number[][] = [];
  for (let i = 0; i < nPts; i++) {
    const t = (i / (nPts - 1)) * tStop_s;
    const vac = Vac_pk * Math.sin(omega * t);
    const iac = Iac_pk * Math.sin(omega * t);
    const vdc = state.Vdc_bus_V - vRipple_pk * Math.cos(2 * omega * t);
    const iL1 = Math.abs(iac) / Math.max(1, res.nPhases);
    rows.push([t, vac, vdc, iac, iL1]);
  }

  return buildQspiceBinaryQraw(
    `VoltCraft AC-DC PFC Line-Cycle Simulation (${state.topology})`,
    [
      { name: 'Time', type: 'time' },
      { name: 'V(ac_in)', type: 'voltage' },
      { name: 'V(v_dc)', type: 'voltage' },
      { name: 'I(L_DM)', type: 'current' },
      { name: 'I(L_PFC1)', type: 'current' },
    ],
    rows
  );
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
  const cblockQschFileName = `${baseName}_cblock.qsch`;
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
  const cblockQschContent = buildDcDcCblockQsch(baseName, ctrlFn, state, res);
  const cirContent = generateDcDcSpiceNetlist(state, res);
  const cppContent = buildDcDcControllerCpp(ctrlFn, state, res);
  const { qrawBytes, qrawSummary } = buildDcDcQraw(state, res);
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
    `  1. ${qschFileName}          - Ready-to-run QSPICE schematic (press Run / F5 immediately!)`,
    `  2. ${cblockQschFileName}   - Optional C++ Ø(.DLL) closed-loop schematic`,
    `  3. ${libFileName}          - Manufacturer SPICE .SUBCKT library`,
    `  4. symbols/${ctrlFn}.qsym   - QSPICE Ø(.DLL) controller symbol`,
    `  5. symbols/xfmr_coupled.qsym - Coupled HF transformer symbol (${res.core.name})`,
    `  6. ${cirFileName}           - Standalone SPICE/QSPICE ASCII netlist`,
    `  7. ${cppFileName}      - C++98 / DMC & MSVC compatible Ø(.DLL) closed-loop controller`,
    `  8. ${qrawFileName}          - QSPICE64 binary waveform file (opens directly in QUX viewer)`,
    ``,
    `Quick Start in QSPICE:`,
    `  Option A (Instant Schematic Simulation -- No Compilation Required):`,
    `    1. Extract the entire ZIP into one folder (keep ${libFileName} alongside ${qschFileName}).`,
    `    2. Open ${qschFileName} in QSPICE and press Run (F5).`,
    `    3. Or double-click ${qrawFileName} to inspect pre-computed load-step waveforms.`,
    ``,
    `  Option B (Closed-Loop Schematic + C++ Ø(.DLL) Controller):`,
    `    1. Open ${cblockQschFileName} in QSPICE.`,
    `    2. Compile ${cppFileName} (Right-click X_CTRL -> Compile C++ DLL,`,
    `       or from QSPICE command prompt: dmc -mn -WD ${cppFileName} kernel32.lib).`,
    `    3. Press Run (F5) to simulate the discrete-time digital compensator DLL.`,
    ``,
  ].join('\r\n');

  const entries: ZipEntry[] = [
    { path: qschFileName, content: buildQspiceBinaryFile(qschContent) },
    { path: cblockQschFileName, content: buildQspiceBinaryFile(cblockQschContent) },
    ...qsymFiles.map((s) => ({
      path: s.path,
      content: buildQspiceBinaryFile(s.content),
    })),
    { path: libFileName, content: libContent },
    { path: cirFileName, content: cirContent },
    { path: cppFileName, content: cppContent },
    { path: qrawFileName, content: qrawBytes },
    { path: 'README_QSPICE.txt', content: readmeContent },
  ];

  return {
    baseName,
    qschFileName,
    qschContent,
    cblockQschFileName,
    cblockQschContent,
    qsymFiles,
    libFileName,
    libContent,
    qrawFileName,
    qrawContent: qrawSummary,
    qrawBytes,
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
  const cblockQschFileName = `${baseName}_cblock.qsch`;
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
  const cblockQschContent = buildAcDcCblockQsch(baseName, ctrlFn, state, res);
  const cirContent = generateAcDcSpiceNetlist(state, res);
  const cppContent = buildAcDcControllerCpp(ctrlFn, state, res);
  const { qrawBytes, qrawSummary } = buildAcDcQraw(state, res);
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
    `  1. ${qschFileName}          - Ready-to-run QSPICE PFC schematic (press Run / F5 immediately!)`,
    `  2. ${cblockQschFileName}   - Optional C++ Ø(.DLL) closed-loop PFC schematic`,
    `  3. ${libFileName}          - Manufacturer SPICE .SUBCKT library`,
    `  4. symbols/${ctrlFn}.qsym   - QSPICE Ø(.DLL) PFC controller symbol`,
    `  5. ${cirFileName}           - Standalone SPICE/QSPICE ASCII netlist`,
    `  6. ${cppFileName}      - C++98 / DMC & MSVC compatible Ø(.DLL) PFC controller`,
    `  7. ${qrawFileName}          - QSPICE64 binary 2-line-cycle waveform file`,
    ``,
    `Quick Start in QSPICE:`,
    `  1. Extract the ZIP into one folder, open ${qschFileName}, and press Run (F5).`,
    `  2. Or double-click ${qrawFileName} to inspect pre-computed line-cycle waveforms.`,
    `  3. For C++ DLL co-simulation, compile ${cppFileName} (dmc -mn -WD ${cppFileName} kernel32.lib)`,
    `     and open ${cblockQschFileName}.`,
    ``,
  ].join('\r\n');

  const entries: ZipEntry[] = [
    { path: qschFileName, content: buildQspiceBinaryFile(qschContent) },
    { path: cblockQschFileName, content: buildQspiceBinaryFile(cblockQschContent) },
    ...qsymFiles.map((s) => ({
      path: s.path,
      content: buildQspiceBinaryFile(s.content),
    })),
    { path: libFileName, content: libContent },
    { path: cirFileName, content: cirContent },
    { path: cppFileName, content: cppContent },
    { path: qrawFileName, content: qrawBytes },
    { path: 'README_QSPICE.txt', content: readmeContent },
  ];

  return {
    baseName,
    qschFileName,
    qschContent,
    cblockQschFileName,
    cblockQschContent,
    qsymFiles,
    libFileName,
    libContent,
    qrawFileName,
    qrawContent: qrawSummary,
    qrawBytes,
    cirFileName,
    cirContent,
    cppFileName,
    cppContent,
    readmeContent,
    zipBytes: buildZipArchive(entries),
  };
}

function transformQschLinesForCombined(
  qschText: string,
  dy: number,
  options: {
    dropInstNames: Set<string>;
    replaceVinPosWithVdc?: boolean;
    tswParamName: string;
    dropDirectives: boolean;
  }
): string[] {
  const lines = qschText.split(/\r\n|\n/);
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line === '«schematic' || line === '»' || line.trim() === '') {
      i++;
      continue;
    }

    if (line.startsWith('«symbol ')) {
      const symBlock: string[] = [line];
      let j = i + 1;
      let depth = 1;
      while (j < lines.length && depth > 0) {
        const l = lines[j];
        if (l.startsWith('«')) depth++;
        if (l === '»') depth--;
        symBlock.push(l);
        j++;
      }
      const joined = symBlock.join('\n');
      const instMatch = joined.match(/"(V_IN|R_LOAD)"/);
      if (instMatch && options.dropInstNames.has(instMatch[1])) {
        i = j;
        continue;
      }
      const headerM = symBlock[0].match(/^«symbol\s+(-?\d+)\s+(-?\d+)\s+(.*)$/);
      if (headerM) {
        symBlock[0] = `«symbol ${headerM[1]} ${Math.round(Number(headerM[2]) + dy)} ${headerM[3]}`;
      }
      for (let k = 1; k < symBlock.length; k++) {
        if (symBlock[k].includes('{TSW}')) {
          symBlock[k] = symBlock[k].replace(/\{TSW\}/g, `{${options.tswParamName}}`);
        }
      }
      out.push(...symBlock);
      i = j;
      continue;
    }

    if (line.startsWith('«wire ')) {
      const m = line.match(/^«wire\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)\s+(.*)$/);
      if (m) {
        let rest = m[5];
        if (options.replaceVinPosWithVdc) {
          rest = rest.replace(/"vin_pos"/g, '"v_dc"');
        }
        out.push(
          `«wire ${m[1]} ${Math.round(Number(m[2]) + dy)} ${m[3]} ${Math.round(Number(m[4]) + dy)} ${rest}`
        );
        i++;
        continue;
      }
    }

    if (line.startsWith('«net ')) {
      const m = line.match(/^«net\s+(-?\d+)\s+(-?\d+)\s+(.*)$/);
      if (m) {
        let rest = m[3];
        if (options.replaceVinPosWithVdc) {
          rest = rest.replace(/"vin_pos"/g, '"v_dc"');
        }
        out.push(`«net ${m[1]} ${Math.round(Number(m[2]) + dy)} ${rest}`);
        i++;
        continue;
      }
    }

    if (line.startsWith('«text ')) {
      if (options.dropDirectives) {
        i++;
        continue;
      }
      const m = line.match(/^«text\s+(-?\d+)\s+(-?\d+)\s+(.*)$/);
      if (m) {
        out.push(`«text ${m[1]} ${Math.round(Number(m[2]) + dy)} ${m[3]}`);
        i++;
        continue;
      }
    }

    out.push(line);
    i++;
  }
  return out;
}

export function generateCombinedSystemQspiceBundle(
  acdcState: AcDcDesignState,
  acdcRes: AcDcResults,
  dcdcState: DcDcDesignState,
  dcdcRes: DcDcResults
): QspiceSimulationBundle {
  const baseName = sanitizeBase(`voltcraft_combined_${acdcState.topology}_to_${dcdcState.topology}`);
  const ctrlFn = `${baseName}_ctrl`;

  const qschFileName = `${baseName}.qsch`;
  const cblockQschFileName = `${baseName}_cblock.qsch`;
  const cirFileName = `${baseName}.cir`;
  const cppFileName = `${ctrlFn}.cpp`;
  const qrawFileName = `${baseName}.qraw`;
  const libFileName = 'voltcraft_models.lib';

  const swModel = generateManufacturerMosfetSubckt(acdcRes.sw, 1);
  const boostDiode = generatePfcBoostDiodeSubckt(acdcState.Vdc_bus_V);
  const priModel = generateManufacturerMosfetSubckt(dcdcRes.priDevice, dcdcState.nParallelPri);
  const secModel = generateManufacturerRectifierSubckt(
    dcdcRes.secDevice,
    dcdcState.nParallelSec,
    dcdcState.rectMode
  );

  const uniqueSubckts = Array.from(
    new Map<string, string>([
      [swModel.subcktName, swModel.spiceText],
      [boostDiode.subcktName, boostDiode.spiceText],
      [priModel.subcktName, priModel.spiceText],
      [secModel.subcktName, secModel.spiceText],
    ]).values()
  );
  const libContent = toCrlf(
    [
      `* VoltCraft Power Electronics Studio -- Combined 2-Stage Manufacturer SPICE Library`,
      `* Stage 1 Switch : ${swModel.manufacturer} ${acdcRes.sw.id} (.SUBCKT ${swModel.subcktName})`,
      `* Stage 1 Diode  : ${boostDiode.manufacturer} ${boostDiode.mpn} (.SUBCKT ${boostDiode.subcktName})`,
      `* Stage 2 Primary: ${priModel.manufacturer} ${dcdcRes.priDevice.id} (.SUBCKT ${priModel.subcktName})`,
      `* Stage 2 Rect   : ${secModel.manufacturer} ${dcdcRes.secDevice.id} (.SUBCKT ${secModel.subcktName})`,
      ``,
      ...uniqueSubckts,
      ``,
    ].join('\n')
  );

  const acdcQschRaw = buildAcDcQsch(baseName, ctrlFn, acdcState, acdcRes);
  const dcdcQschRaw = buildDcDcQsch(baseName, ctrlFn, dcdcState, dcdcRes);

  const stage1Lines = transformQschLinesForCombined(acdcQschRaw, 0, {
    dropInstNames: new Set(['R_LOAD']),
    tswParamName: 'TSW_PFC',
    dropDirectives: true,
  });
  const stage2Lines = transformQschLinesForCombined(dcdcQschRaw, -6800, {
    dropInstNames: new Set(['V_IN']),
    replaceVinPosWithVdc: true,
    tswParamName: 'TSW_DC',
    dropDirectives: true,
  });

  const Vac_pk = acdcState.Vac_rms_V * Math.SQRT2;
  const fswPfcHz = acdcState.fsw_kHz * 1e3;
  const fswDcHz = dcdcState.fsw_kHz * 1e3;
  const tDead_ns = Math.max(20, dcdcState.deadTime_ns);
  const deff = dcdcRes.isLLC ? 1.0 : Math.max(0.15, Math.min(0.95, dcdcRes.Deff_nom));

  const combinedQschContent = toCrlf(
    [
      '«schematic',
      directiveText(
        -5000,
        3200,
        `; VoltCraft Power Electronics Studio -- COMBINED 2-STAGE QSPICE (${acdcState.topology} -> ${dcdcState.topology.toUpperCase()})`,
        1.25
      ),
      directiveText(
        -5000,
        2900,
        `; Shared Hybrid C_DC Bus (v_dc) feeds Stage 2 Primary Bridge directly (Press F5 to simulate)`,
        1.0
      ),
      ...stage1Lines,
      ...stage2Lines,
      directiveText(5600, -7900, '.lib voltcraft_models.lib', 1),
      directiveText(
        5600,
        -8220,
        `.param FSW_PFC=${fswPfcHz} TSW_PFC={1/FSW_PFC} VAC_PK=${Vac_pk.toFixed(2)} FLINE=${acdcState.f_line_Hz} VDC_REF=${acdcState.Vdc_bus_V}`,
        1
      ),
      directiveText(
        5600,
        -8540,
        `.param FSW_DC=${fswDcHz} TSW_DC={1/FSW_DC} VOUT_REF=${dcdcState.Vout_V} DEFF=${deff.toFixed(4)} TDEAD=${tDead_ns}n THALF={0.5*TSW_DC} TON={THALF-TDEAD} TD_B={DEFF*THALF}`,
        1
      ),
      directiveText(
        5600,
        -8860,
        `.ic V(v_dc)=${acdcState.Vdc_bus_V.toFixed(1)} V(v_out)=${(dcdcState.Vout_V * 0.94).toFixed(2)}`,
        1
      ),
      directiveText(5600, -9180, '.options reltol=1m', 1),
      directiveText(
        5600,
        -9500,
        `.tran 0 ${(1 / acdcState.f_line_Hz * 1e3).toFixed(1)}m 0 100n`,
        1
      ),
      directiveText(5600, -9820, `.meas TRAN Vdc_avg AVG V(v_dc)`, 1),
      directiveText(5600, -10140, `.meas TRAN Vout_avg AVG V(v_out)`, 1),
      '»',
      '',
    ].join('\n')
  );

  const cirContent = generateCombinedSystemSpiceNetlist(acdcState, acdcRes, dcdcState, dcdcRes);
  const cblockQschContent = buildDcDcCblockQsch(baseName, ctrlFn, dcdcState, dcdcRes);
  const cppContent = buildDcDcControllerCpp(ctrlFn, dcdcState, dcdcRes);
  const { qrawBytes, qrawSummary } = buildDcDcQraw(dcdcState, dcdcRes);
  const qsymFiles = [
    {
      path: `symbols/${ctrlFn}.qsym`,
      content: buildDllStandaloneQsym(
        ctrlFn,
        `VoltCraft ${dcdcState.controlType.toUpperCase()} Digital Controller`,
        DCDC_DLL_PINS
      ),
    },
  ];

  const readmeContent = [
    `VoltCraft Power Electronics Studio -- COMBINED 2-STAGE QSPICE Bundle`,
    `========================================================================`,
    `Stage 1 (PFC)  : ${acdcState.topology} (${acdcState.Vac_rms_V}Vac -> ${acdcState.Vdc_bus_V}Vdc)`,
    `Stage 2 (DC-DC): ${dcdcState.topology} (${dcdcState.Vin_nom_V}Vdc -> ${dcdcState.Vout_V}Vdc @ ${dcdcState.Pout_W}W)`,
    `Connected Link : Shared Hybrid C_DC Bus (v_dc) directly powers Stage 2 Primary Bridge`,
    ``,
    `Included Files:`,
    `  1. ${qschFileName}          - Unified 2-stage QSPICE schematic (press F5 to simulate!)`,
    `  2. ${libFileName}          - Deduplicated manufacturer .SUBCKT library`,
    `  3. ${cirFileName}           - Unified 2-stage SPICE ASCII netlist`,
    `  4. ${qrawFileName}          - Pre-computed Stage 2 transient waveform file`,
    ``,
  ].join('\r\n');

  const entries: ZipEntry[] = [
    { path: qschFileName, content: buildQspiceBinaryFile(combinedQschContent) },
    { path: libFileName, content: libContent },
    { path: cirFileName, content: cirContent },
    { path: qrawFileName, content: qrawBytes },
    { path: 'README_QSPICE.txt', content: readmeContent },
  ];

  return {
    baseName,
    qschFileName,
    qschContent: combinedQschContent,
    cblockQschFileName,
    cblockQschContent,
    qsymFiles,
    libFileName,
    libContent,
    qrawFileName,
    qrawContent: qrawSummary,
    qrawBytes,
    cirFileName,
    cirContent,
    cppFileName,
    cppContent,
    readmeContent,
    zipBytes: buildZipArchive(entries),
  };
}
