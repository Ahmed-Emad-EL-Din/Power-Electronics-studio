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
            ? [`      «text (-270,0) 0.78 109 0 0x1000000 -1 -1 "${toQspiceLatin1Text(spiceLine)}"»`]
            : []),
        ]
      : [
          `      «text (160,120) 1 7 0 0x1000000 -1 -1 "${ref}"»`,
          `      «text (160,-80) 0.95 7 0 0x1000000 -1 -1 "${toQspiceLatin1Text(value)}"»`,
          ...(spiceLine
            ? [`      «text (160,-230) 0.78 7 0 0x1000000 -1 -1 "${toQspiceLatin1Text(spiceLine)}"»`]
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
  const dInit = res.isLLC
    ? 1.0
    : Math.max(0.15, Math.min(0.94, res.D_applied_nom + tDead * fswHz * 2));
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
    inst->duty = ${dInit.toFixed(4)};
    inst->comp_v = 0.5 + 4.0 * ${dInit.toFixed(4)};
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
): { lines: string[]; vinX: number; cinStartX: number } {
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

  // Anchor Cin dynamically to the LEFT of Q1/Q2 (gate netlabels at x=-2800) so NO capacitor ever
  // approaches or intersects Q1/Q2 gate pins regardless of branch count.
  const capPitch = 1650;
  const lastCinTargetX = -4800;
  const cinStartX = lastCinTargetX - Math.max(0, cinUnits.length - 1) * capPitch;
  const vinX = cinStartX - capPitch;

  const lines: string[] = [
    // --- ZONE 1: INPUT BUS & HYBRID PARALLEL CAPACITOR BANK (Cin, 1650-unit pitch) ---
    ...qsymV('V_IN', `{VIN}`, vinX, 900, 0),
    wire(vinX, 1100, vinX, 1800, 'vin_pos'),
    wire(vinX, 700, vinX, 0, 'GND'),
    netLabel(vinX, 0, 'GND'),
    netLabel(vinX + 600, 1800, 'vin_pos'),
  ];

  let prevCinX = vinX;
  cinUnits.forEach((u, idx) => {
    const cx = cinStartX + idx * capPitch;
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
    // --- ZONE 2: PRIMARY BRIDGE LEGS (1800-unit horizontal spacing, clear of Cin text) ---
    // Leg A (x=-2400): Q1 at y=1400, Q2 at y=400 -> D/S at x=-2300, G at x=-2600
    ...qsymNmosSubckt('Q1', priModel.subcktName, -2400, 1400),
    ...qsymNmosSubckt('Q2', priModel.subcktName, -2400, 400),
    wire(prevCinX, 1800, -2300, 1800, 'vin_pos'),
    wire(-2300, 1800, -2300, 1600, 'vin_pos'),
    wire(-2300, 1200, -2300, 900, 'sw_a'),
    wire(-2300, 900, -2300, 600, 'sw_a'),
    wire(-2300, 200, -2300, 0, 'GND'),
    wire(prevCinX, 0, -2300, 0, 'GND'),
    wire(-2600, 1400, -2800, 1400, 'g1'),
    netLabel(-2800, 1400, 'g1'),
    wire(-2600, 400, -2800, 400, 'g2'),
    netLabel(-2800, 400, 'g2'),
    netLabel(-2300, 900, 'sw_a')
  );

  // Leg B (x=-600): 1800 units right of Leg A so MPN names never collide
  if (state.topology === 'llc-hb') {
    lines.push(
      ...qsymC('C_HB_TOP', '22u', -500, 1400, 0, 'Rser=5m'),
      ...qsymC('C_HB_BOT', '22u', -500, 400, 0, 'Rser=5m'),
      wire(-2300, 1800, -500, 1800, 'vin_pos'),
      wire(-500, 1800, -500, 1600, 'vin_pos'),
      wire(-500, 1200, -500, 600, 'sw_b'),
      wire(-500, 200, -500, 0, 'GND'),
      wire(-2300, 0, -500, 0, 'GND'),
      netLabel(-500, 900, 'sw_b')
    );
  } else {
    lines.push(
      ...qsymNmosSubckt('Q3', priModel.subcktName, -600, 1400),
      ...qsymNmosSubckt('Q4', priModel.subcktName, -600, 400),
      wire(-2300, 1800, -500, 1800, 'vin_pos'),
      wire(-500, 1800, -500, 1600, 'vin_pos'),
      wire(-500, 1200, -500, 900, 'sw_b'),
      wire(-500, 900, -500, 600, 'sw_b'),
      wire(-500, 200, -500, 0, 'GND'),
      wire(-2300, 0, -500, 0, 'GND'),
      wire(-800, 1400, -1000, 1400, 'g3'),
      netLabel(-1000, 1400, 'g3'),
      wire(-800, 400, -1000, 400, 'g4'),
      netLabel(-1000, 400, 'g4'),
      netLabel(-500, 900, 'sw_b')
    );
  }

  // --- ZONE 3: RESONANT / LEAKAGE TANK & COUPLED HF TRANSFORMER ---
  // L_PRI at x=3300 & L_SEC1 at x=3750 (tight 450-unit coupled coil pair, clear of Q3/Q4 MPN labels)
  lines.push(
    netLabel(800, 1400, 'sw_a'),
    wire(800, 1400, 1100, 1400, 'sw_a'),
    ...qsymL('L_LK', `${state.Llk_uH.toFixed(2)}u`, 1300, 1400, 2, false, 'Rser=4m'),
    wire(1500, 1400, 2100, 1400, 'pri_lk'),
    netLabel(1800, 1400, 'pri_lk'),
    ...qsymC(
      res.isLLC ? 'C_RES' : 'C_BLK',
      res.isLLC ? `${state.Cr_nF.toFixed(1)}n` : '4.7u',
      2300,
      1400,
      2
    ),
    wire(2500, 1400, 3300, 1400, 'pri_hot'),
    netLabel(2900, 1400, 'pri_hot'),
    wire(3300, 1400, 3300, 1100, 'pri_hot'),
    ...qsymL(
      'L_PRI',
      `${Lpri_uH.toFixed(2)}u`,
      3300,
      900,
      0,
      true,
      `Rser=${Math.max(0.002, res.Rpri_ac_mOhm * 1e-3).toFixed(4)}`,
      'left'
    ),
    wire(3300, 700, 3300, 400, 'isns_node'),
    wire(3300, 400, 2500, 400, 'isns_node'),
    ...qsymR('R_ISNS', '10m', 2300, 400, 2),
    wire(2100, 400, 1700, 400, 'sw_b'),
    netLabel(1700, 400, 'sw_b'),
    netLabel(2900, 400, 'isns_node')
  );

  // Coupled Secondary Windings (x=3750, right beside L_PRI at x=3300) wired directly to Rectifier
  const rSnubStr = Math.max(2, res.Rsnub_Ohm).toFixed(1);
  const cSnubStr = `${Math.max(220, Math.round(res.Csnub_pF))}p`;
  if (state.txType === 'center-tapped') {
    lines.push(
      ...qsymL('L_SEC1', `${Lsec_uH.toFixed(3)}u`, 3750, 1300, 12, true),
      ...qsymL('L_SEC2', `${Lsec_uH.toFixed(3)}u`, 3750, 500, 12, true),
      wire(3750, 1100, 3750, 900, 'sec_ct'),
      wire(3750, 900, 3750, 700, 'sec_ct'),
      wire(3750, 900, 4200, 900, 'sec_ct'),
      netLabel(4200, 900, 'sec_ct'),
      directiveText(3050, -250, 'K_TX L_PRI L_SEC1 L_SEC2 0.9995', 1),

      ...qsymDiodeSubckt('D_SR1', secModel.subcktName, 5500, 1400, 0),
      ...qsymDiodeSubckt('D_SR2', secModel.subcktName, 5500, 400, 0),
      wire(3750, 1500, 5500, 1500, 'sec_p'),
      wire(5500, 1500, 5500, 1600, 'sec_p'),
      netLabel(4900, 1500, 'sec_p'),
      wire(3750, 300, 5100, 300, 'sec_n'),
      wire(5100, 300, 5100, 600, 'sec_n'),
      wire(5100, 600, 5500, 600, 'sec_n'),
      netLabel(4800, 300, 'sec_n'),

      wire(5500, 1200, 5500, 900, 'GND'),
      wire(5500, 200, 5500, 0, 'GND'),
      wire(5500, 900, 6100, 900, 'GND'),
      wire(6100, 900, 6100, 0, 'GND'),
      wire(5500, 0, 9700, 0, 'GND'),
      netLabel(5500, 0, 'GND'),

      netLabel(7700, 1600, 'sec_ct'),
      wire(7700, 1600, 8200, 1600, 'sec_ct'),
      ...qsymR('R_SNUB', rSnubStr, 7800, 1100, 0),
      ...qsymC('C_SNUB', cSnubStr, 7800, 500, 0),
      wire(7800, 1600, 7800, 1300, 'sec_ct'),
      wire(7800, 900, 7800, 700, 'snub_mid'),
      netLabel(7800, 800, 'snub_mid'),
      wire(7800, 300, 7800, 0, 'GND'),
      ...qsymL('L_OUT', `${state.Lo_uH.toFixed(2)}u`, 8400, 1600, 2, false, 'Rser=1.5m'),
      wire(8600, 1600, 9700, 1600, 'v_out')
    );
  } else {
    lines.push(
      ...qsymL('L_SEC1', `${Lsec_uH.toFixed(3)}u`, 3750, 900, 12, true),
      directiveText(3050, -150, 'K_TX L_PRI L_SEC1 0.9995', 1),

      ...qsymDiodeSubckt('D_SR1', secModel.subcktName, 5500, 1400, 0),
      ...qsymDiodeSubckt('D_SR2', secModel.subcktName, 5500, 400, 0),
      ...qsymDiodeSubckt('D_SR3', secModel.subcktName, 7100, 1400, 0),
      ...qsymDiodeSubckt('D_SR4', secModel.subcktName, 7100, 400, 0),

      // Direct copper links from L_SEC1 into Rectifier midpoints (sec_n routed below GND bus to avoid crossings)
      wire(3750, 1100, 4900, 1100, 'sec_p'),
      wire(4900, 1100, 4900, 900, 'sec_p'),
      wire(4900, 900, 5500, 900, 'sec_p'),
      wire(3750, 700, 4700, 700, 'sec_n'),
      wire(4700, 700, 4700, -300, 'sec_n'),
      wire(4700, -300, 6700, -300, 'sec_n'),
      wire(6700, -300, 6700, 900, 'sec_n'),
      wire(6700, 900, 7100, 900, 'sec_n'),

      wire(5500, 1600, 7100, 1600, 'v_rect_sec'),
      wire(7100, 1600, 8200, 1600, 'v_rect_sec'),
      netLabel(7500, 1600, 'v_rect_sec'),
      wire(5500, 1200, 5500, 600, 'sec_p'),
      netLabel(5500, 900, 'sec_p'),
      wire(7100, 1200, 7100, 600, 'sec_n'),
      netLabel(7100, 900, 'sec_n'),
      wire(5500, 200, 5500, 0, 'GND'),
      wire(7100, 200, 7100, 0, 'GND'),
      wire(5500, 0, 9700, 0, 'GND'),
      netLabel(5500, 0, 'GND'),

      // Secondary RC snubber damps L_lk-C_oss rectifier commutation ringing
      ...qsymR('R_SNUB', rSnubStr, 7800, 1100, 0),
      ...qsymC('C_SNUB', cSnubStr, 7800, 500, 0),
      wire(7800, 1600, 7800, 1300, 'v_rect_sec'),
      wire(7800, 900, 7800, 700, 'snub_mid'),
      netLabel(7800, 800, 'snub_mid'),
      wire(7800, 300, 7800, 0, 'GND'),

      ...qsymL('L_OUT', `${state.Lo_uH.toFixed(2)}u`, 8400, 1600, 2, false, 'Rser=1.5m'),
      wire(8600, 1600, 9700, 1600, 'v_out')
    );
  }

  // --- ZONE 4: HYBRID OUTPUT CAPACITOR BANK & LOAD (x=9700.., 1650-unit pitch) ---
  let prevCoutX = 9700;
  coutUnits.forEach((u, idx) => {
    const cx = 9700 + idx * capPitch;
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
  const rloadX = prevCoutX + capPitch;
  lines.push(
    ...qsymR('R_LOAD', `${Rload.toFixed(3)}`, rloadX, 800, 0),
    wire(prevCoutX, 1600, rloadX, 1600, 'v_out'),
    wire(rloadX, 1600, rloadX, 1000, 'v_out'),
    wire(rloadX, 600, rloadX, 0, 'GND'),
    wire(prevCoutX, 0, rloadX, 0, 'GND'),
    netLabel(9700, 0, 'GND'),
    netLabel(prevCoutX + 700, 1600, 'v_out')
  );

  return { lines, vinX, cinStartX };
}

/**
 * Primary DC-DC Schematic: 100% Native SPICE (immediately runnable on F5 in QSPICE).
 */
function resolveDcDcSimStopUs(fswHz: number, simStopTime_us?: number): {
  tStop_us: number;
  tMeasStart_us: number;
  maxStep: string;
} {
  const tStop_us =
    typeof simStopTime_us === 'number' && Number.isFinite(simStopTime_us) && simStopTime_us > 0
      ? Math.max(50, Math.round(simStopTime_us))
      : Math.round(Math.max(500, (1e6 / fswHz) * 60));
  const tMeasStart_us = Math.round(tStop_us * 0.72);
  const maxStep = tStop_us <= 2000 ? '25n' : tStop_us <= 10000 ? '50n' : '100n';
  return { tStop_us, tMeasStart_us, maxStep };
}

function buildDcDcQsch(
  baseName: string,
  ctrlFn: string,
  state: DcDcDesignState,
  res: DcDcResults,
  simStopTime_us?: number
): string {
  const fswHz = state.fsw_kHz * 1e3;
  const tDead_ns = Math.max(40, state.deadTime_ns);
  const { tStop_us, tMeasStart_us, maxStep } = resolveDcDcSimStopUs(fswHz, simStopTime_us);
  const dInit = res.isLLC
    ? 1.0
    : Math.max(0.15, Math.min(0.94, res.D_applied_nom + (tDead_ns * 1e-9) * fswHz * 2));

  const priModel = generateManufacturerMosfetSubckt(res.priDevice, state.nParallelPri);
  const secModel = generateManufacturerRectifierSubckt(
    res.secDevice,
    state.nParallelSec,
    state.rectMode
  );
  const stage = buildDcDcPowerStageLines(state, res, priModel, secModel);

  const lines: string[] = [
    '«schematic',
    directiveText(
      stage.vinX,
      2600,
      `; VoltCraft Power Electronics Studio -- QSPICE (${state.topology.toUpperCase()} | ${state.presetName})`,
      1.25
    ),
    directiveText(
      stage.vinX,
      2300,
      `; Pri: ${priModel.manufacturer} ${res.priDevice.id} (.SUBCKT ${priModel.subcktName}) | Sec: ${secModel.manufacturer} ${res.secDevice.id} (.SUBCKT ${secModel.subcktName})`,
      1.0
    ),
    ...stage.lines,

    // --- ZONE 5A: NATIVE ISOLATED GATE DRIVERS & CLOSED-LOOP PHASE-SHIFT PWM ---
    ...qsymV('V_G1', 'PULSE(0 12 0 15n 15n {TON} {TSW})', -5400, -1400, 0, false),
    wire(-5400, -1200, -5400, -1000, 'g1'),
    netLabel(-5400, -1000, 'g1'),
    wire(-5400, -1600, -5400, -1800, 'sw_a'),
    netLabel(-5400, -1800, 'sw_a'),

    ...qsymV('V_G2', 'PULSE(0 12 {THALF} 15n 15n {TON} {TSW})', -1600, -1400, 0, false),
    wire(-1600, -1200, -1600, -1000, 'g2'),
    netLabel(-1600, -1000, 'g2'),
    wire(-1600, -1600, -1600, -1800, 'GND'),
    netLabel(-1600, -1800, 'GND'),
  ];

  if (state.topology !== 'llc-hb') {
    lines.push(
      ...qsymV('V_SAW', 'PULSE(0 1 0 {TSW-1n} 1n 0 {TSW})', -8200, -2700, 0, false),
      wire(-8200, -2500, -8200, -2300, 'saw_dc'),
      netLabel(-8200, -2300, 'saw_dc'),
      wire(-8200, -2900, -8200, -3100, 'GND'),
      netLabel(-8200, -3100, 'GND'),

      ...qsymBv(
        'B_DCMD',
        'V=limit((V(comp_node)+8*(V(ref_node)-V(fb_node)))*0.25,0.08,0.95)',
        -6600,
        -2700,
        false
      ),
      wire(-6600, -2500, -6600, -2300, 'd_cmd_dc'),
      netLabel(-6600, -2300, 'd_cmd_dc'),
      wire(-6600, -2900, -6600, -3100, 'GND'),
      netLabel(-6600, -3100, 'GND'),

      ...qsymBv(
        'B_G3',
        'V=12*0.5*(1+tanh(400*(sin(2*PI*(V(saw_dc)-0.5*V(d_cmd_dc)-0.5*TDEAD/TSW))-sin(PI*TDEAD/TSW))))',
        -4200,
        -2700,
        false
      ),
      wire(-4200, -2500, -4200, -2300, 'g3'),
      netLabel(-4200, -2300, 'g3'),
      wire(-4200, -2900, -4200, -3100, 'sw_b'),
      netLabel(-4200, -3100, 'sw_b'),

      ...qsymBv(
        'B_G4',
        'V=12*0.5*(1+tanh(400*(-sin(2*PI*(V(saw_dc)-0.5*V(d_cmd_dc)-0.5*TDEAD/TSW))-sin(PI*TDEAD/TSW))))',
        -1600,
        -2700,
        false
      ),
      wire(-1600, -2500, -1600, -2300, 'g4'),
      netLabel(-1600, -2300, 'g4'),
      wire(-1600, -2900, -1600, -3100, 'GND'),
      netLabel(-1600, -3100, 'GND')
    );
  }

  const rFbBotK = 10.0;
  const rFbTopK = Math.max(0.5, rFbBotK * (state.Vout_V / 2.5 - 1));

  // --- ZONE 5B: 2.5V REFERENCE, FEEDBACK DIVIDER & INTEGRATING COMPENSATOR ---
  lines.push(
    ...qsymV('V_REF', `2.5`, 2000, -1600, 0),
    wire(2000, -1400, 2000, -1200, 'ref_node'),
    netLabel(2000, -1200, 'ref_node'),
    wire(2000, -1800, 2000, -2000, 'GND'),
    netLabel(2000, -2000, 'GND'),

    ...qsymR('R_FB_TOP', `${rFbTopK.toFixed(2)}k`, 3500, -1300, 2),
    wire(3000, -1300, 3300, -1300, 'v_out'),
    netLabel(3000, -1300, 'v_out'),
    wire(3700, -1300, 4100, -1300, 'fb_node'),
    ...qsymR('R_FB_BOT', `${rFbBotK.toFixed(2)}k`, 4100, -1700, 0),
    wire(4100, -1300, 4100, -1500, 'fb_node'),
    wire(4100, -1900, 4100, -2100, 'GND'),
    netLabel(4100, -2100, 'GND'),
    netLabel(4100, -1300, 'fb_node'),

    ...qsymBv('B_COMP', 'V=limit(V(comp_node)+4.5*(V(ref_node)-V(fb_node)),0.25,3.85)', 5300, -1600, false),
    wire(5300, -1400, 5300, -1200, 'err_node'),
    netLabel(5300, -1200, 'err_node'),
    wire(5300, -1800, 5300, -2000, 'GND'),
    netLabel(5300, -2000, 'GND'),

    ...qsymR('R_COMP', '10.00k', 6800, -1200, 2),
    wire(5300, -1200, 6600, -1200, 'err_node'),
    wire(7000, -1200, 8600, -1200, 'comp_node'),
    netLabel(7800, -1200, 'comp_node'),

    ...qsymC('C_COMP', '22n', 8600, -1600, 0),
    wire(8600, -1200, 8600, -1400, 'comp_node'),
    wire(8600, -1800, 8600, -2000, 'GND'),
    netLabel(8600, -2000, 'GND'),

    // --- ZONE 6: QSPICE SIMULATION DIRECTIVES (x=+10000, y=-1100..-3660) ---
    directiveText(10000, -1100, '.lib voltcraft_models.lib', 1),
    directiveText(
      10000,
      -1420,
      `.param FSW=${fswHz} VIN=${state.Vin_nom_V} VOUT_REF=${state.Vout_V} D_INIT=${dInit.toFixed(4)}`,
      1
    ),
    directiveText(
      10000,
      -1740,
      `.param TSW={1/FSW} THALF={0.5*TSW} TDEAD=${tDead_ns}n TON={THALF-TDEAD}`,
      1
    ),
    directiveText(10000, -2060, `.ic V(v_out)={VOUT_REF*0.98} V(comp_node)={D_INIT*4.0}`, 1),
    directiveText(10000, -2380, '.options reltol=1m gmin=1e-10 abstol=1e-9', 1),
    directiveText(10000, -2700, `.tran 0 ${tStop_us}u 0 ${maxStep}`, 1),
    directiveText(
      10000,
      -3020,
      `.meas TRAN Vout_avg AVG V(v_out) FROM ${tMeasStart_us}u TO ${tStop_us}u`,
      1
    ),
    directiveText(
      10000,
      -3340,
      `.meas TRAN Ipri_rms RMS I(L_LK) FROM ${tMeasStart_us}u TO ${tStop_us}u`,
      1
    ),
    directiveText(
      10000,
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
  res: DcDcResults,
  simStopTime_us?: number
): string {
  const fswHz = state.fsw_kHz * 1e3;
  const { tStop_us, tMeasStart_us, maxStep } = resolveDcDcSimStopUs(fswHz, simStopTime_us);

  const priModel = generateManufacturerMosfetSubckt(res.priDevice, state.nParallelPri);
  const secModel = generateManufacturerRectifierSubckt(
    res.secDevice,
    state.nParallelSec,
    state.rectMode
  );
  const stage = buildDcDcPowerStageLines(state, res, priModel, secModel);

  const lines: string[] = [
    '«schematic',
    directiveText(
      stage.vinX,
      2600,
      `; VoltCraft C++ DLL Closed-Loop Schematic -- ${state.topology.toUpperCase()} (${state.presetName})`,
      1.25
    ),
    directiveText(
      stage.vinX,
      2300,
      `; Compile ${ctrlFn}.cpp first (Right-click X_CTRL -> Compile C++ DLL or: dmc -mn -WD ${ctrlFn}.cpp kernel32.lib)`,
      1.0
    ),
    ...stage.lines,

    // --- ZONE 5: SPACIOUS Ø(.DLL) CONTROLLER, CT SENSE & ISOLATED GATE DRIVERS ---
    ...qsymBv('B_ISNS', 'V=abs(I(L_LK))*0.2', -6200, -1800, false),
    wire(-6200, -1600, -5800, -1600, 'isns_ct'),
    netLabel(-5800, -1600, 'isns_ct'),
    wire(-6200, -2000, -6200, -2200, 'GND'),
    netLabel(-6200, -2200, 'GND'),

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
    wire(-3500, -2000, -3000, -2000, 'isns_ct'),
    netLabel(-3500, -2000, 'isns_ct'),
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
    directiveText(3800, -1840, `.ic V(v_out)={VOUT_REF*0.98}`, 1),
    directiveText(3800, -2160, '.options reltol=1m gmin=1e-10 abstol=1e-9', 1),
    directiveText(3800, -2480, `.tran 0 ${tStop_us}u 0 ${maxStep}`, 1),
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
): { lines: string[]; lastCdcX: number; rloadX: number } {
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
    netLabel(-4500, 1200, 'ac_in'),
    wire(-3600, 1200, -3000, 1200, 'ac_dm'),
    netLabel(-3300, 1200, 'ac_dm'),
    wire(-3000, 1200, -3000, 1000, 'ac_dm'),
    wire(-3000, 1200, -2400, 1200, 'ac_dm'),
    wire(-2000, 1200, -1200, 1200, 'ac_bus'),
    wire(-5000, 600, -5000, 400, 'ac_n'),
    wire(-5000, 400, -3000, 400, 'ac_n'),
    wire(-3000, 600, -3000, 400, 'ac_n'),
    wire(-3000, 400, 0, 400, 'ac_n'),
    netLabel(-4600, 400, 'ac_n'),
    netLabel(-1500, 1200, 'ac_bus'),

    // --- ZONE 2: FULL-WAVE DIODE BRIDGE (GBJ2510_DIODE, x=-1200..0, 1200-unit spacing) ---
    ...qsymDiodeSubckt('D_R1', 'GBJ2510_DIODE', -1200, 1500, 0),
    ...qsymDiodeSubckt('D_R2', 'GBJ2510_DIODE', -1200, 300, 0),
    ...qsymDiodeSubckt('D_R3', 'GBJ2510_DIODE', 0, 1500, 0),
    ...qsymDiodeSubckt('D_R4', 'GBJ2510_DIODE', 0, 300, 0),
    wire(-1200, 1700, 0, 1700, 'v_rect'),
    wire(0, 1700, 800, 1700, 'v_rect'),
    wire(-1200, 1300, -1200, 500, 'ac_bus'),
    wire(0, 1300, 0, 500, 'ac_n'),
    wire(-1200, 100, -1200, 0, 'GND'),
    wire(0, 100, 0, 0, 'GND'),
    wire(-1200, 0, 5200, 0, 'GND'),
    netLabel(-600, 0, 'GND'),
    netLabel(400, 1700, 'v_rect'),

    // --- ZONE 3: 1-PHASE / 2-PHASE INTERLEAVED BOOST STAGE ---
    ...qsymL('L_PFC1', `${state.Lpfc_uH.toFixed(1)}u`, 1000, 1700, 2, false, 'Rser=8m'),
    ...qsymNmosSubckt('Q_PFC1', swModel.subcktName, 1700, 800),
    ...qsymDiodeSubckt('D_B1', boostDiode.subcktName, 2700, 1700, 6),
    wire(1200, 1700, 1800, 1700, 'sw1'),
    wire(1800, 1700, 1800, 1000, 'sw1'),
    wire(1800, 1700, 2500, 1700, 'sw1'),
    netLabel(2150, 1700, 'sw1'),
    wire(1800, 600, 1800, 0, 'GND'),
    wire(1500, 800, 1300, 800, 'gpfc1'),
    netLabel(1300, 800, 'gpfc1'),
    wire(2900, 1700, 5200, 1700, 'v_dc'),
  ];

  if (res.nPhases === 2) {
    lines.push(
      netLabel(2600, 2300, 'v_rect'),
      wire(2600, 2300, 2900, 2300, 'v_rect'),
      ...qsymL('L_PFC2', `${state.Lpfc_uH.toFixed(1)}u`, 3100, 2300, 2, false, 'Rser=8m'),
      ...qsymNmosSubckt('Q_PFC2', swModel.subcktName, 3700, 800),
      ...qsymDiodeSubckt('D_B2', boostDiode.subcktName, 4500, 2300, 6),
      wire(3300, 2300, 3800, 2300, 'sw2'),
      wire(3800, 2300, 3800, 1000, 'sw2'),
      wire(3800, 2300, 4300, 2300, 'sw2'),
      netLabel(4050, 2300, 'sw2'),
      wire(3800, 600, 3800, 0, 'GND'),
      wire(3500, 800, 3300, 800, 'gpfc2'),
      netLabel(3300, 800, 'gpfc2'),
      wire(4700, 2300, 5200, 2300, 'v_dc'),
      wire(5200, 2300, 5200, 1700, 'v_dc')
    );
  }

  // --- ZONE 4: HYBRID DC-LINK CAPACITOR BANK & LOAD (x=5200.., 1650-unit pitch) ---
  const capPitch = 1650;
  const cdcBank = getDefaultHybridCapBank('acdc-cdc', undefined, state);
  const cdcUnits = expandHybridCapBankForSpice(cdcBank, 'C_DC', state.Vdc_bus_V * 1.04, 4);
  let prevCdcX = 5200;
  cdcUnits.forEach((u, idx) => {
    const cx = 5200 + idx * capPitch;
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
  const acdcRloadX = prevCdcX + capPitch;
  lines.push(
    ...qsymR('R_LOAD', `${Rload.toFixed(2)}`, acdcRloadX, 800, 0),
    wire(prevCdcX, 1700, acdcRloadX, 1700, 'v_dc'),
    wire(acdcRloadX, 1700, acdcRloadX, 1000, 'v_dc'),
    wire(acdcRloadX, 600, acdcRloadX, 0, 'GND'),
    wire(prevCdcX, 0, acdcRloadX, 0, 'GND'),
    netLabel(prevCdcX + 700, 1700, 'v_dc')
  );

  return { lines, lastCdcX: prevCdcX, rloadX: acdcRloadX };
}

/**
 * Primary AC-DC PFC Schematic: 100% Native SPICE (immediately runnable on F5 in QSPICE).
 */
function resolveAcDcSimStopMs(f_line_Hz: number, simStopTime_ms?: number, defaultCycles = 2): {
  tStop_ms: number;
  tMeasStart_ms: number;
} {
  const tStop_ms =
    typeof simStopTime_ms === 'number' && Number.isFinite(simStopTime_ms) && simStopTime_ms > 0
      ? Number(Math.max(1, simStopTime_ms).toFixed(2))
      : Number(((defaultCycles / Math.max(45, f_line_Hz)) * 1e3).toFixed(1));
  const tMeasStart_ms = Number((tStop_ms * 0.5).toFixed(2));
  return { tStop_ms, tMeasStart_ms };
}

function buildAcDcQsch(
  baseName: string,
  ctrlFn: string,
  state: AcDcDesignState,
  res: AcDcResults,
  simStopTime_ms?: number
): string {
  const fswHz = state.fsw_kHz * 1e3;
  const vacPk = state.Vac_rms_V * Math.SQRT2;
  const inomPk = (state.Pout_W / Math.max(80, state.Vac_rms_V * 0.96)) * Math.SQRT2 / Math.max(1, res.nPhases);
  const { tStop_ms, tMeasStart_ms } = resolveAcDcSimStopMs(state.f_line_Hz, simStopTime_ms, 2);
  const swModel = generateManufacturerMosfetSubckt(res.sw, 1);
  const boostDiode = generatePfcBoostDiodeSubckt(state.Vdc_bus_V);
  const stage = buildAcDcPowerStageLines(state, res, swModel, boostDiode);

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
    ...stage.lines,

    // --- ZONE 5: NATIVE AVERAGE-CURRENT PFC LOOP & INTERLEAVED GATE DRIVERS ---
    ...qsymBv(
      'B_IREF',
      'V=V(v_rect)*limit(0.004*(VDC_REF-V(v_dc))+INOM_PK/max(80,VAC_PK),0.001,0.50)',
      -8800,
      -1400,
      false
    ),
    wire(-8800, -1200, -8800, -1000, 'i_ref'),
    netLabel(-8800, -1000, 'i_ref'),
    wire(-8800, -1600, -8800, -1800, 'GND'),
    netLabel(-8800, -1800, 'GND'),

    ...qsymBv(
      'B_DUTY',
      'V=limit(1-abs(V(v_rect))/max(80,V(v_dc))+0.04*(V(i_ref)-I(L_PFC1)),0.04,0.92)',
      -4600,
      -1400,
      false
    ),
    wire(-4600, -1200, -4600, -1000, 'd_cmd'),
    netLabel(-4600, -1000, 'd_cmd'),
    wire(-4600, -1600, -4600, -1800, 'GND'),
    netLabel(-4600, -1800, 'GND'),

    ...qsymV('V_SAW1', 'PULSE(0 1 0 {0.98*TSW} {0.02*TSW} 1n {TSW})', -600, -1400, 0, false),
    wire(-600, -1200, -600, -1000, 'saw1'),
    netLabel(-600, -1000, 'saw1'),
    wire(-600, -1600, -600, -1800, 'GND'),
    netLabel(-600, -1800, 'GND'),

    ...qsymBv('B_PWM1', 'V=12*0.5*(1+tanh(200*(V(d_cmd)-V(saw1))))', 3000, -1400, false),
    wire(3000, -1200, 3000, -1000, 'gpfc1'),
    netLabel(3000, -1000, 'gpfc1'),
    wire(3000, -1600, 3000, -1800, 'GND'),
    netLabel(3000, -1800, 'GND'),
  ];

  if (res.nPhases === 2) {
    lines.push(
      ...qsymV('V_SAW2', 'PULSE(0 1 {0.5*TSW} {0.98*TSW} {0.02*TSW} 1n {TSW})', -600, -2700, 0, false),
      wire(-600, -2500, -600, -2300, 'saw2'),
      netLabel(-600, -2300, 'saw2'),
      wire(-600, -2900, -600, -3100, 'GND'),
      netLabel(-600, -3100, 'GND'),

      ...qsymBv('B_PWM2', 'V=12*0.5*(1+tanh(200*(V(d_cmd)-V(saw2))))', 3000, -2700, false),
      wire(3000, -2500, 3000, -2300, 'gpfc2'),
      netLabel(3000, -2300, 'gpfc2'),
      wire(3000, -2900, 3000, -3100, 'GND'),
      netLabel(3000, -3100, 'GND')
    );
  }

  lines.push(
    directiveText(6200, -1100, '.lib voltcraft_models.lib', 1),
    directiveText(
      6200,
      -1420,
      `.param FSW=${fswHz} TSW={1/FSW} VAC_PK=${vacPk.toFixed(2)} INOM_PK=${inomPk.toFixed(2)} FLINE=${state.f_line_Hz} VDC_REF=${state.Vdc_bus_V}`,
      1
    ),
    directiveText(6200, -1740, `.ic V(v_dc)=${state.Vdc_bus_V.toFixed(1)}`, 1),
    directiveText(6200, -2060, '.options reltol=1m gmin=1e-10 abstol=1e-9', 1),
    directiveText(6200, -2380, `.tran 0 ${tStop_ms}m 0 250n`, 1),
    directiveText(6200, -2700, `.meas TRAN Vdc_avg AVG V(v_dc) FROM ${tMeasStart_ms}m TO ${tStop_ms}m`, 1),
    directiveText(
      6200,
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
  res: AcDcResults,
  simStopTime_ms?: number
): string {
  const fswHz = state.fsw_kHz * 1e3;
  const { tStop_ms, tMeasStart_ms } = resolveAcDcSimStopMs(state.f_line_Hz, simStopTime_ms, 2);
  const swModel = generateManufacturerMosfetSubckt(res.sw, 1);
  const boostDiode = generatePfcBoostDiodeSubckt(state.Vdc_bus_V);
  const stage = buildAcDcPowerStageLines(state, res, swModel, boostDiode);

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
    ...stage.lines,

    ...qsymBv('B_ISNS_PFC', 'V=I(L_PFC1)', -5200, -1800, false),
    wire(-5200, -1600, -4800, -1600, 'il_sns'),
    netLabel(-4800, -1600, 'il_sns'),
    wire(-5200, -2000, -5200, -2200, 'GND'),
    netLabel(-5200, -2200, 'GND'),

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
    wire(-3500, -1800, -3000, -1800, 'il_sns'),
    netLabel(-3500, -1800, 'il_sns'),
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
    directiveText(1200, -2060, '.options reltol=1m gmin=1e-10 abstol=1e-9', 1),
    directiveText(1200, -2380, `.tran 0 ${tStop_ms}m 0 250n`, 1),
    directiveText(1200, -2700, `.meas TRAN Vdc_avg AVG V(v_dc) FROM ${tMeasStart_ms}m TO ${tStop_ms}m`, 1),
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

function buildDcDcQraw(
  state: DcDcDesignState,
  res: DcDcResults,
  simStopTime_us?: number
): {
  qrawBytes: Uint8Array;
  qrawSummary: string;
} {
  const totalTimeUs =
    typeof simStopTime_us === 'number' && Number.isFinite(simStopTime_us) && simStopTime_us > 0
      ? Math.max(50, Math.round(simStopTime_us))
      : 900;
  const sim = runTransientLoadStep(state, res, {
    scenario: 'load-step',
    initialLoad_pct: 25,
    finalLoad_pct: 90,
    stepTime_us: Math.round(totalTimeUs * 0.17),
    totalTime_us: totalTimeUs,
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

function buildAcDcQraw(
  state: AcDcDesignState,
  res: AcDcResults,
  simStopTime_ms?: number
): {
  qrawBytes: Uint8Array;
  qrawSummary: string;
} {
  const nPts = 400;
  const tStop_s =
    typeof simStopTime_ms === 'number' && Number.isFinite(simStopTime_ms) && simStopTime_ms > 0
      ? Math.max(1, simStopTime_ms) * 1e-3
      : 2 / Math.max(45, state.f_line_Hz);
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
  res: DcDcResults,
  simStopTime_us?: number
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

  const qschContent = buildDcDcQsch(baseName, ctrlFn, state, res, simStopTime_us);
  const cblockQschContent = buildDcDcCblockQsch(baseName, ctrlFn, state, res, simStopTime_us);
  const cirContent = generateDcDcSpiceNetlist(state, res, simStopTime_us);
  const cppContent = buildDcDcControllerCpp(ctrlFn, state, res);
  const { qrawBytes, qrawSummary } = buildDcDcQraw(state, res, simStopTime_us);
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
  res: AcDcResults,
  simStopTime_ms?: number
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

  const qschContent = buildAcDcQsch(baseName, ctrlFn, state, res, simStopTime_ms);
  const cblockQschContent = buildAcDcCblockQsch(baseName, ctrlFn, state, res, simStopTime_ms);
  const cirContent = generateAcDcSpiceNetlist(state, res, simStopTime_ms);
  const cppContent = buildAcDcControllerCpp(ctrlFn, state, res);
  const { qrawBytes, qrawSummary } = buildAcDcQraw(state, res, simStopTime_ms);
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
    dropWiresAtX?: number;
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
    const trimmed = line.trim();
    if (trimmed === '«schematic' || trimmed === '»' || trimmed === '') {
      i++;
      continue;
    }

    if (trimmed.startsWith('«component ')) {
      const compBlock: string[] = [line];
      let j = i + 1;
      let depth = 1;
      while (j < lines.length && depth > 0) {
        const l = lines[j];
        const lt = l.trim();
        if (lt.startsWith('«') && !lt.endsWith('»')) depth++;
        if (lt === '»') depth--;
        compBlock.push(l);
        j++;
      }
      const joined = compBlock.join('\n');
      const instMatch = joined.match(/"(V_IN|R_LOAD)"/);
      if (instMatch && options.dropInstNames.has(instMatch[1])) {
        i = j;
        continue;
      }
      const headerM = compBlock[0].match(/^(\s*«component\s+)\((-?\d+),(-?\d+)\)(.*)$/);
      if (headerM) {
        compBlock[0] = `${headerM[1]}(${headerM[2]},${Math.round(Number(headerM[3]) + dy)})${headerM[4]}`;
      }
      for (let k = 1; k < compBlock.length; k++) {
        if (/\bTSW\b/.test(compBlock[k])) {
          compBlock[k] = compBlock[k].replace(/\bTSW\b/g, options.tswParamName);
        }
      }
      out.push(...compBlock);
      i = j;
      continue;
    }

    if (trimmed.startsWith('«wire ')) {
      const m = line.match(/^(\s*«wire\s+)\((-?\d+),(-?\d+)\)\s+\((-?\d+),(-?\d+)\)\s+(.*)$/);
      if (m) {
        const x1 = Number(m[2]);
        const x2 = Number(m[4]);
        if (options.dropWiresAtX !== undefined && (x1 === options.dropWiresAtX || x2 === options.dropWiresAtX)) {
          i++;
          continue;
        }
        let rest = m[6];
        if (options.replaceVinPosWithVdc) {
          rest = rest.replace(/"vin_pos"/g, '"v_dc"');
        }
        out.push(
          `${m[1]}(${x1},${Math.round(Number(m[3]) + dy)}) (${x2},${Math.round(Number(m[5]) + dy)}) ${rest}`
        );
        i++;
        continue;
      }
    }

    if (trimmed.startsWith('«net ')) {
      const m = line.match(/^(\s*«net\s+)\((-?\d+),(-?\d+)\)\s+(.*)$/);
      if (m) {
        const x = Number(m[2]);
        if (options.dropWiresAtX !== undefined && x === options.dropWiresAtX) {
          i++;
          continue;
        }
        let rest = m[4];
        if (options.replaceVinPosWithVdc) {
          rest = rest.replace(/"vin_pos"/g, '"v_dc"');
        }
        out.push(`${m[1]}(${x},${Math.round(Number(m[3]) + dy)}) ${rest}`);
        i++;
        continue;
      }
    }

    if (trimmed.startsWith('«text ')) {
      if (options.dropDirectives && !trimmed.includes('K_TX')) {
        i++;
        continue;
      }
      const m = line.match(/^(\s*«text\s+)\((-?\d+),(-?\d+)\)\s+(.*)$/);
      if (m) {
        out.push(`${m[1]}(${m[2]},${Math.round(Number(m[3]) + dy)}) ${m[4]}`);
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
  dcdcRes: DcDcResults,
  sharedMcu = true,
  simStopTime_ms?: number
): QspiceSimulationBundle {
  const { tStop_ms, tMeasStart_ms } = resolveAcDcSimStopMs(acdcState.f_line_Hz, simStopTime_ms, 1);
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
      `* Control Arch  : ${sharedMcu ? 'Same Shared Dual-Stage MCU (Synchronized ePWM + Direct Vdc FF)' : 'Separate MCUs (Isolated PG_OK + Fault_Trip Handshake)'}`,
      `* Stage 1 Switch : ${swModel.manufacturer} ${acdcRes.sw.id} (.SUBCKT ${swModel.subcktName})`,
      `* Stage 1 Diode  : ${boostDiode.manufacturer} ${boostDiode.mpn} (.SUBCKT ${boostDiode.subcktName})`,
      `* Stage 2 Primary: ${priModel.manufacturer} ${dcdcRes.priDevice.id} (.SUBCKT ${priModel.subcktName})`,
      `* Stage 2 Rect   : ${secModel.manufacturer} ${dcdcRes.secDevice.id} (.SUBCKT ${secModel.subcktName})`,
      ``,
      ...uniqueSubckts,
      ``,
    ].join('\n')
  );

  const acdcStageInfo = buildAcDcPowerStageLines(acdcState, acdcRes, swModel, boostDiode);
  const dcdcStageInfo = buildDcDcPowerStageLines(dcdcState, dcdcRes, priModel, secModel);
  const acdcQschRaw = buildAcDcQsch(baseName, ctrlFn, acdcState, acdcRes);
  const dcdcQschRaw = buildDcDcQsch(baseName, ctrlFn, dcdcState, dcdcRes);

  const stage1Lines = transformQschLinesForCombined(acdcQschRaw, 0, {
    dropInstNames: new Set(['R_LOAD']),
    dropWiresAtX: acdcStageInfo.rloadX,
    tswParamName: 'TSW_PFC',
    dropDirectives: true,
  });
  const stage2Dy = -7400;
  const stage2Lines = [
    ...transformQschLinesForCombined(dcdcQschRaw, stage2Dy, {
      dropInstNames: new Set(['V_IN']),
      dropWiresAtX: dcdcStageInfo.vinX,
      replaceVinPosWithVdc: true,
      tswParamName: 'TSW_DC',
      dropDirectives: true,
    }),
    netLabel(dcdcStageInfo.cinStartX, stage2Dy + 1800, 'v_dc'),
    netLabel(dcdcStageInfo.cinStartX, stage2Dy, 'GND'),
  ];

  const Vac_pk = acdcState.Vac_rms_V * Math.SQRT2;
  const inomPk =
    (acdcState.Pout_W / Math.max(80, acdcState.Vac_rms_V * 0.96)) *
    Math.SQRT2 /
    Math.max(1, acdcRes.nPhases);
  const fswPfcHz = acdcState.fsw_kHz * 1e3;
  const fswDcHz = dcdcState.fsw_kHz * 1e3;
  const tDead_ns = Math.max(40, dcdcState.deadTime_ns);
  const dInit = dcdcRes.isLLC
    ? 1.0
    : Math.max(0.15, Math.min(0.94, dcdcRes.D_applied_nom + (tDead_ns * 1e-9) * fswDcHz * 2));

  const mcuArchBanner = sharedMcu
    ? `; Control Architecture: SAME SHARED MCU -- Unified ePWM carrier sync & direct internal V(v_dc) feedforward`
    : `; Control Architecture: SEPARATE MCUs -- Stage 1 PFC MCU + Stage 2 DC-DC MCU linked via isolated PG_OK / Fault_Trip`;

  const bannerX = Math.min(-8800, dcdcStageInfo.cinStartX);
  const combinedQschContent = toCrlf(
    [
      '«schematic',
      directiveText(
        bannerX,
        3200,
        `; VoltCraft Power Electronics Studio -- COMBINED 2-STAGE QSPICE (${acdcState.topology} -> ${dcdcState.topology.toUpperCase()})`,
        1.25
      ),
      directiveText(
        bannerX,
        2900,
        `; Shared Hybrid C_DC Bus (v_dc) feeds Stage 2 Primary Bridge directly (Press F5 to simulate)`,
        1.0
      ),
      directiveText(bannerX, 2600, mcuArchBanner, 1.0),
      ...stage1Lines,
      ...stage2Lines,
      directiveText(10000, -8500, '.lib voltcraft_models.lib', 1),
      directiveText(
        10000,
        -8820,
        `.param FSW_PFC=${fswPfcHz} TSW_PFC={1/FSW_PFC} VAC_PK=${Vac_pk.toFixed(2)} INOM_PK=${inomPk.toFixed(2)} FLINE=${acdcState.f_line_Hz} VDC_REF=${acdcState.Vdc_bus_V}`,
        1
      ),
      directiveText(
        10000,
        -9140,
        `.param FSW_DC=${fswDcHz} TSW_DC={1/FSW_DC} VOUT_REF=${dcdcState.Vout_V} D_INIT=${dInit.toFixed(4)} TDEAD=${tDead_ns}n THALF={0.5*TSW_DC} TON={THALF-TDEAD}`,
        1
      ),
      directiveText(
        10000,
        -9460,
        `.ic V(v_dc)=${acdcState.Vdc_bus_V.toFixed(1)} V(v_out)=${(dcdcState.Vout_V * 0.98).toFixed(2)} V(comp_node)={D_INIT*4.0}`,
        1
      ),
      directiveText(10000, -9780, '.options reltol=1m gmin=1e-10 abstol=1e-9', 1),
      directiveText(
        10000,
        -10100,
        `.tran 0 ${tStop_ms}m 0 100n`,
        1
      ),
      directiveText(10000, -10420, `.meas TRAN Vdc_avg AVG V(v_dc) FROM ${tMeasStart_ms}m TO ${tStop_ms}m`, 1),
      directiveText(10000, -10740, `.meas TRAN Vout_avg AVG V(v_out) FROM ${tMeasStart_ms}m TO ${tStop_ms}m`, 1),
      '»',
      '',
    ].join('\n')
  );

  const cirContent = generateCombinedSystemSpiceNetlist(
    acdcState,
    acdcRes,
    dcdcState,
    dcdcRes,
    sharedMcu,
    simStopTime_ms
  );
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
    `Control Arch   : ${sharedMcu ? 'Same Shared Dual-Stage MCU (Synchronized PWM + Direct Vdc FF)' : 'Separate MCUs (Isolated PG_OK + Fault_Trip Handshake)'}`,
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

export interface QspiceComponentPlacement {
  ref: string;
  symbol: string;
  x: number;
  y: number;
  rot: number;
  pins: Array<{ name: string; x: number; y: number }>;
}

function rotateQspicePin(px: number, py: number, rot: number): { dx: number; dy: number } {
  switch (rot) {
    case 2:
      return { dx: py, dy: -px };
    case 4:
      return { dx: -px, dy: -py };
    case 6:
      return { dx: -py, dy: px };
    case 12:
      return { dx: -px, dy: py };
    default:
      return { dx: px, dy: py };
  }
}

export function extractQspiceComponents(qschText: string): QspiceComponentPlacement[] {
  const lines = qschText.split(/\r\n|\n/);
  const out: QspiceComponentPlacement[] = [];
  for (let i = 0; i < lines.length; i++) {
    const headerM = lines[i].trim().match(/^«component\s+\((-?\d+),(-?\d+)\)\s+(\d+)/);
    if (!headerM) continue;
    const x = Number(headerM[1]);
    const y = Number(headerM[2]);
    const rot = Number(headerM[3]);
    let ref = `SYM_${i}`;
    let symbol = '';
    const pins: Array<{ name: string; x: number; y: number }> = [];
    let j = i + 1;
    let depth = 1;
    while (j < lines.length && depth > 0) {
      const l = lines[j].trim();
      if (l.startsWith('«') && !l.endsWith('»')) depth++;
      if (l === '»') depth--;
      const symM = l.match(/^«symbol\s*(\S*)/);
      if (symM && !symbol) {
        symbol = symM[1] || 'DLL';
      }
      const refM = l.match(/^«text\s+\(-?\d+,-?\d+\)\s+[^"]+"([^"]+)"/);
      if (refM && ref === `SYM_${i}`) {
        ref = refM[1];
      }
      const pinM = l.match(/^«pin\s+\((-?\d+),(-?\d+)\)\s+.*?"([^"]+)"»$/);
      if (pinM) {
        const { dx, dy } = rotateQspicePin(Number(pinM[1]), Number(pinM[2]), rot);
        pins.push({ name: pinM[3], x: x + dx, y: y + dy });
      }
      j++;
    }
    out.push({ ref, symbol, x, y, rot, pins });
  }
  return out;
}

export function findQspiceComponentOverlaps(
  qschText: string,
  minDx = 420,
  minDy = 420
): Array<[QspiceComponentPlacement, QspiceComponentPlacement]> {
  const comps = extractQspiceComponents(qschText);
  const overlaps: Array<[QspiceComponentPlacement, QspiceComponentPlacement]> = [];
  for (let i = 0; i < comps.length; i++) {
    for (let j = i + 1; j < comps.length; j++) {
      const a = comps[i];
      const b = comps[j];
      const dx = Math.abs(a.x - b.x);
      const dy = Math.abs(a.y - b.y);
      const directCollision = dx < minDx && dy < minDy;
      // Vertical capacitors with right-side Rser/Lser text must stay >= 1500 units clear horizontally
      // of other components in the same horizontal band (including stacked MOSFETs Q1/Q2).
      const capBandCollision =
        (a.ref.startsWith('C_IN') ||
          a.ref.startsWith('C_OUT') ||
          a.ref.startsWith('C_DC') ||
          b.ref.startsWith('C_IN') ||
          b.ref.startsWith('C_OUT') ||
          b.ref.startsWith('C_DC')) &&
        dx < 1500 &&
        dy < 700;
      if (directCollision || capBandCollision) {
        overlaps.push([a, b]);
      }
    }
  }
  return overlaps;
}

export interface QspiceWirePinCollision {
  ref: string;
  pinName: string;
  pinX: number;
  pinY: number;
  wireNet: string;
  wire: [number, number, number, number];
}

export function findQspiceWirePinCollisions(qschText: string): QspiceWirePinCollision[] {
  const comps = extractQspiceComponents(qschText);
  const wires: Array<{ x1: number; y1: number; x2: number; y2: number; net: string }> = [];
  for (const raw of qschText.split(/\r\n|\n/)) {
    const m = raw.trim().match(/^«wire\s+\((-?\d+),(-?\d+)\)\s+\((-?\d+),(-?\d+)\)\s+"([^"]*)"»$/);
    if (m) {
      wires.push({
        x1: Number(m[1]),
        y1: Number(m[2]),
        x2: Number(m[3]),
        y2: Number(m[4]),
        net: m[5],
      });
    }
  }

  const collisions: QspiceWirePinCollision[] = [];
  for (const comp of comps) {
    for (const pin of comp.pins) {
      for (const w of wires) {
        const isEndpoint =
          (pin.x === w.x1 && pin.y === w.y1) || (pin.x === w.x2 && pin.y === w.y2);
        if (isEndpoint) continue;
        const onHorizontal =
          w.y1 === w.y2 &&
          pin.y === w.y1 &&
          pin.x > Math.min(w.x1, w.x2) &&
          pin.x < Math.max(w.x1, w.x2);
        const onVertical =
          w.x1 === w.x2 &&
          pin.x === w.x1 &&
          pin.y > Math.min(w.y1, w.y2) &&
          pin.y < Math.max(w.y1, w.y2);
        if (onHorizontal || onVertical) {
          collisions.push({
            ref: comp.ref,
            pinName: pin.name,
            pinX: pin.x,
            pinY: pin.y,
            wireNet: w.net,
            wire: [w.x1, w.y1, w.x2, w.y2],
          });
        }
      }
    }
  }
  return collisions;
}

/**
 * Audits that every named wire net in a QSPICE schematic also has an explicit «net»
 * port label so QSPICE64 never emits anonymous V(n01)/V(n02) nodes in waveforms.
 */
export function findQspiceUnnamedWireNets(qschText: string): string[] {
  const wireNets = new Set<string>();
  const labeledNets = new Set<string>();
  for (const raw of qschText.split(/\r\n|\n/)) {
    const t = raw.trim();
    const wm = t.match(/^«wire\s+\(-?\d+,-?\d+\)\s+\(-?\d+,-?\d+\)\s+"([^"]+)"»$/);
    if (wm) wireNets.add(wm[1]);
    const nm = t.match(/^«net\s+\(-?\d+,-?\d+\)\s+\d+\s+\d+\s+\d+\s+"([^"]+)"»$/);
    if (nm) labeledNets.add(nm[1]);
  }
  return Array.from(wireNets).filter((net) => !labeledNets.has(net)).sort();
}
