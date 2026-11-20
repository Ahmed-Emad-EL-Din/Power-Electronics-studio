// ============================================================================
// LTSPICE .ASC SCHEMATIC DIAGRAM EXPORTER
// Generates clean, 16px-grid-aligned, well-organized LTspice Version 4 .asc
// schematics with standard symbols (voltage, res, cap, ind, ind2, nmos,
// schottky, diode, bi, bv), orthogonal wires, net flags, and runnable directives.
//
// Layout invariants verified against real LTspice rendering:
//  - Pure 7-bit ASCII strings (LTspice reads .asc as ANSI/Win-1252, never UTF-8)
//  - Primary bridge MOSFETs separated from gate-drive PULSE sources (no text clash)
//  - Transformer L_PRI mirrored (M0, labels LEFT) & L_SEC un-mirrored (R0, labels RIGHT)
//  - Rectifier diodes spaced >=192px horizontally and >=160px vertically
//  - Control & Compensator components given >=144px border clearance & separate
//    right-hand SPICE directive column so no .meas / B_ERR expression overlaps
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

type AscRotation = 'R0' | 'R90' | 'R180' | 'R270' | 'M0' | 'M90' | 'M180' | 'M270';

function toAscii(s: string): string {
  return s
    .replace(/[—–]/g, '--')
    .replace(/·/g, '|')
    .replace(/µ/g, 'u')
    .replace(/Ω/g, 'Ohm')
    .replace(/°/g, 'deg')
    .replace(/[^\x20-\x7E]/g, '');
}

class AscSchematicBuilder {
  private lines: string[] = [];
  private width: number;
  private height: number;

  constructor(width = 2720, height = 1280) {
    this.width = width;
    this.height = height;
    this.lines.push('Version 4', `SHEET 1 ${this.width} ${this.height}`);
  }

  wire(x1: number, y1: number, x2: number, y2: number) {
    if (x1 === x2 && y1 === y2) return;
    this.lines.push(`WIRE ${Math.round(x1)} ${Math.round(y1)} ${Math.round(x2)} ${Math.round(y2)}`);
  }

  /** Draws an orthogonal L-shaped or straight wire path across waypoints. */
  wirePath(pts: [number, number][]) {
    for (let i = 0; i < pts.length - 1; i++) {
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[i + 1];
      if (x1 !== x2 && y1 !== y2) {
        this.wire(x1, y1, x2, y1);
        this.wire(x2, y1, x2, y2);
      } else {
        this.wire(x1, y1, x2, y2);
      }
    }
  }

  flag(x: number, y: number, name: string) {
    this.lines.push(`FLAG ${Math.round(x)} ${Math.round(y)} ${toAscii(name)}`);
  }

  gnd(x: number, y: number) {
    this.flag(x, y, '0');
  }

  comment(x: number, y: number, text: string) {
    this.lines.push(`TEXT ${Math.round(x)} ${Math.round(y)} Left 2 ;${toAscii(text)}`);
  }

  directive(x: number, y: number, spiceLine: string) {
    this.lines.push(`TEXT ${Math.round(x)} ${Math.round(y)} Left 2 !${toAscii(spiceLine)}`);
  }

  graphicLine(x1: number, y1: number, x2: number, y2: number) {
    this.lines.push(
      `LINE Normal ${Math.round(x1)} ${Math.round(y1)} ${Math.round(x2)} ${Math.round(y2)}`
    );
  }

  graphicRect(x1: number, y1: number, x2: number, y2: number) {
    this.lines.push(
      `RECTANGLE Normal ${Math.round(x1)} ${Math.round(y1)} ${Math.round(x2)} ${Math.round(y2)}`
    );
  }

  symbol(
    symName: string,
    x: number,
    y: number,
    rot: AscRotation,
    instName: string,
    value: string,
    extraAttrs?: Record<string, string>
  ) {
    this.lines.push(
      `SYMBOL ${symName} ${Math.round(x)} ${Math.round(y)} ${rot}`,
      `SYMATTR InstName ${toAscii(instName)}`,
      `SYMATTR Value ${toAscii(value)}`
    );
    if (extraAttrs) {
      for (const [k, v] of Object.entries(extraAttrs)) {
        this.lines.push(`SYMATTR ${toAscii(k)} ${toAscii(v)}`);
      }
    }
  }

  // Standard 16px-grid pin-exact placement helpers:

  /** Vertical voltage/bi/bv source: + pin at (x, y), - pin at (x, y + 80). */
  placeVerticalSource(sym: 'voltage' | 'bi' | 'bv', x: number, yTop: number, name: string, value: string) {
    this.symbol(sym, x, yTop - 16, 'R0', name, value);
    return { pos: [x, yTop] as [number, number], neg: [x, yTop + 80] as [number, number] };
  }

  /** Vertical resistor: top pin at (x, y), bottom pin at (x, y + 80). */
  placeVerticalRes(x: number, yTop: number, name: string, value: string) {
    this.symbol('res', x - 16, yTop - 16, 'R0', name, value);
    return { top: [x, yTop] as [number, number], bot: [x, yTop + 80] as [number, number] };
  }

  /** Horizontal resistor: left pin at (x, y), right pin at (x + 80, y). */
  placeHorizontalRes(xLeft: number, y: number, name: string, value: string) {
    this.symbol('res', xLeft - 16, y + 16, 'R270', name, value);
    return { left: [xLeft, y] as [number, number], right: [xLeft + 80, y] as [number, number] };
  }

  /** Vertical capacitor: top pin at (x, y), bottom pin at (x, y + 64). */
  placeVerticalCap(x: number, yTop: number, name: string, value: string, spiceLine?: string) {
    this.symbol('cap', x - 16, yTop, 'R0', name, value, spiceLine ? { SpiceLine: spiceLine } : undefined);
    return { top: [x, yTop] as [number, number], bot: [x, yTop + 64] as [number, number] };
  }

  /** Horizontal capacitor: left pin at (x, y), right pin at (x + 64, y). */
  placeHorizontalCap(xLeft: number, y: number, name: string, value: string, spiceLine?: string) {
    this.symbol('cap', xLeft, y + 16, 'R270', name, value, spiceLine ? { SpiceLine: spiceLine } : undefined);
    return { left: [xLeft, y] as [number, number], right: [xLeft + 64, y] as [number, number] };
  }

  /** Horizontal inductor: left pin at (x, y), right pin at (x + 80, y). */
  placeHorizontalInd(xLeft: number, y: number, name: string, value: string, spiceLine?: string) {
    this.symbol('ind', xLeft - 16, y + 16, 'R270', name, value, spiceLine ? { SpiceLine: spiceLine } : undefined);
    return { left: [xLeft, y] as [number, number], right: [xLeft + 80, y] as [number, number] };
  }

  /** Vertical inductor (ind or ind2): top pin at (x, y), bottom pin at (x, y + 80). */
  placeVerticalInd(
    sym: 'ind' | 'ind2',
    x: number,
    yTop: number,
    name: string,
    value: string,
    mirror = false,
    spiceLine?: string
  ) {
    // R0 pins: (16, 16) & (16, 96) with labels RIGHT; M0 pins: (-16, 16) & (-16, 96) with labels LEFT
    const ax = mirror ? x + 16 : x - 16;
    this.symbol(
      sym,
      ax,
      yTop - 16,
      mirror ? 'M0' : 'R0',
      name,
      value,
      spiceLine ? { SpiceLine: spiceLine } : undefined
    );
    return { top: [x, yTop] as [number, number], bot: [x, yTop + 80] as [number, number] };
  }

  /** Vertical N-channel MOSFET (R0): Drain=(x, y), Gate=(x - 48, y + 80), Source=(x, y + 96). */
  placeMosfet(xDrain: number, yDrain: number, name: string, modelName: string, isSubckt = true) {
    this.symbol('nmos', xDrain - 48, yDrain, 'R0', name, modelName, isSubckt ? { Prefix: 'X' } : undefined);
    return {
      drain: [xDrain, yDrain] as [number, number],
      gate: [xDrain - 48, yDrain + 80] as [number, number],
      source: [xDrain, yDrain + 96] as [number, number],
    };
  }

  /** Horizontal diode (anode left -> cathode right): Anode=(x, y), Cathode=(x + 64, y). */
  placeHorizontalDiode(
    sym: 'diode' | 'schottky',
    xAnode: number,
    y: number,
    name: string,
    modelName: string,
    isSubckt = true
  ) {
    this.symbol(sym, xAnode, y + 16, 'R270', name, modelName, isSubckt ? { Prefix: 'X' } : undefined);
    return { anode: [xAnode, y] as [number, number], cathode: [xAnode + 64, y] as [number, number] };
  }

  /** Vertical diode (cathode top -> anode bottom): Cathode=(x, y), Anode=(x, y + 64). */
  placeVerticalDiodeUp(
    sym: 'diode' | 'schottky',
    x: number,
    yCathode: number,
    name: string,
    modelName: string,
    isSubckt = true
  ) {
    this.symbol(sym, x + 16, yCathode + 64, 'R180', name, modelName, isSubckt ? { Prefix: 'X' } : undefined);
    return { cathode: [x, yCathode] as [number, number], anode: [x, yCathode + 64] as [number, number] };
  }

  /** Emits a .SUBCKT/.MODEL SPICE block as a single atomic LTspice multi-line directive (`\n`-delimited). */
  placeSpiceBlock(x: number, yStart: number, spiceText: string, linePitch = 24): number {
    const cleanLines = spiceText
      .split('\n')
      .map((l) => toAscii(l.trimEnd()))
      .filter((l) => l.length > 0);
    if (cleanLines.length > 0) {
      this.lines.push(`TEXT ${Math.round(x)} ${Math.round(yStart)} Left 2 !${cleanLines.join('\\n')}`);
    }
    return yStart + cleanLines.length * linePitch;
  }

  build(): string {
    return this.lines.join('\n') + '\n';
  }
}

/**
 * Generates a spacious, zero-overlap, 16px-grid-aligned LTspice .asc schematic
 * for the active Isolated DC-DC stage (PSFB / LLC-FB / LLC-HB).
 */
export function generateDcDcLtspiceAsc(state: DcDcDesignState, res: DcDcResults): string {
  const asc = new AscSchematicBuilder(2880, 1920);

  const fswHz = state.fsw_kHz * 1e3;
  const Tsw = 1 / fswHz;
  const Thalf = Tsw / 2;
  const tDead_ns = Math.max(20, state.deadTime_ns);
  const tOnHalf_ns = Math.max(80, Math.round(Thalf * 1e9 - tDead_ns));
  const half_ns = Math.round(Thalf * 1e9);
  const deff = res.isLLC ? 1.0 : Math.max(0.15, Math.min(0.95, res.Deff_nom));
  const phaseShift_ns = Math.round(deff * Thalf * 1e9);

  const priModel = generateManufacturerMosfetSubckt(res.priDevice, state.nParallelPri);
  const secModel = generateManufacturerRectifierSubckt(
    res.secDevice,
    state.nParallelSec,
    state.rectMode
  );

  const n = Math.max(0.2, res.Np_actual / Math.max(1, res.Ns_actual));
  const Lpri_uH = Math.max(50, state.Lm_uH);
  const Lsec_uH = Lpri_uH / (n * n);
  const Rload_Ohm = (state.Vout_V * state.Vout_V) / Math.max(1, state.Pout_W);
  const tStop_us = Math.round(Math.max(500, (1e6 / fswHz) * 60));

  const tShiftA = res.isLLC ? half_ns : phaseShift_ns;
  const tShiftB = res.isLLC ? 0 : Math.round(phaseShift_ns + half_ns);

  // Header & Zone Banners (pure 7-bit ASCII)
  asc.comment(64, 32, `VoltCraft Power Electronics Studio -- ${state.topology.toUpperCase()} (${state.presetName})`);
  asc.comment(
    64,
    60,
    `Vin=${state.Vin_nom_V}V (${state.Vin_min_V}..${state.Vin_max_V}V) -> Vout=${state.Vout_V}V @ ${state.Pout_W}W | fsw=${state.fsw_kHz}kHz | Core=${res.core.name} (${res.Np_actual}:${res.Ns_actual}T)`
  );

  const cinBank = getDefaultHybridCapBank('dcdc-cin', state);
  const coutBank = getDefaultHybridCapBank('dcdc-cout', state);
  let cinUnits = expandHybridCapBankForSpice(cinBank, 'C_IN', state.Vin_max_V, 4);
  if (cinUnits.length > 5) {
    cinUnits = expandHybridCapBankForSpice(cinBank, 'C_IN', state.Vin_max_V, 2);
  }
  const coutUnits = expandHybridCapBankForSpice(coutBank, 'C_OUT', state.Vout_V * 1.05, 4);
  const coutBaseX = 2464;
  const rloadX = coutBaseX + Math.max(1, coutUnits.length) * 96;
  const zone4Right = Math.max(2752, rloadX + 128);

  // Top Row Zones (Power Path)
  asc.graphicRect(64, 112, 416, 624);
  asc.comment(80, 120, '1. INPUT BUS & HYBRID Cin BANK');

  asc.graphicRect(432, 112, 928, 624);
  asc.comment(448, 120, `2. PRIMARY ${state.topology === 'llc-hb' ? 'HALF-BRIDGE' : 'FULL-BRIDGE'} (${priModel.subcktName})`);

  asc.graphicRect(960, 112, 1632, 624);
  asc.comment(976, 120, '3. TANK & ISOLATION TRANSFORMER');

  asc.graphicRect(1664, 112, zone4Right, 624);
  asc.comment(1680, 120, `4. ${state.txType.toUpperCase()} RECTIFIER (${secModel.subcktName}), HYBRID Cout BANK & LOAD`);

  // Middle Row Zones (Gate Drives, Control Loop, Directives)
  asc.graphicRect(64, 672, 928, 1200);
  asc.comment(80, 680, '5A. ISOLATED GATE DRIVE SOURCES');

  asc.graphicRect(960, 672, 1936, 1200);
  asc.comment(
    976,
    680,
    `5B. CONTROL & COMPENSATOR (${state.controlType.toUpperCase()} | ${res.type2Architecture === 'ota' ? `OTA gm=${res.ota_gm_mS.toFixed(2)}mS` : 'Op-Amp'})`
  );

  asc.graphicRect(1968, 672, zone4Right, 1200);
  asc.comment(1984, 680, '6A. SPICE PARAMETERS & SIMULATION COMMANDS');

  // Bottom Row Zone (Manufacturer .SUBCKT SPICE Models)
  asc.graphicRect(64, 1232, zone4Right, 1808);
  asc.comment(80, 1244, `6B. MANUFACTURER SPICE SUBCIRCUITS (${priModel.manufacturer} ${res.priDevice.id} & ${secModel.manufacturer} ${res.secDevice.id})`);

  // --------------------------------------------------------------------------
  // ZONE 1: INPUT DC SOURCE & HYBRID PARALLEL CAPACITOR BANK (Cin)
  // --------------------------------------------------------------------------
  const Y_BUS_TOP = 192;
  const Y_BUS_BOT = 560;

  const vinSrc = asc.placeVerticalSource('voltage', 144, 336, 'V_IN', '{VIN}');
  asc.wirePath([vinSrc.pos, [144, Y_BUS_TOP]]);
  asc.wirePath([vinSrc.neg, [144, Y_BUS_BOT]]);
  asc.gnd(144, Y_BUS_BOT);
  asc.flag(144, Y_BUS_TOP, 'vin_pos');

  let lastCinX = 144;
  cinUnits.forEach((u, idx) => {
    const cx = 208 + idx * 48;
    const cinCap = asc.placeVerticalCap(
      cx,
      352,
      u.refDes,
      `${u.cap_uF}u`,
      `Rser=${u.esr_mOhm}m Lser=${u.esl_nH}n`
    );
    asc.wirePath([[lastCinX, Y_BUS_TOP], [cx, Y_BUS_TOP], cinCap.top]);
    asc.wirePath([[lastCinX, Y_BUS_BOT], [cx, Y_BUS_BOT], cinCap.bot]);
    lastCinX = cx;
  });

  // --------------------------------------------------------------------------
  // ZONE 2: PRIMARY BRIDGE LEGS (REAL MANUFACTURER .SUBCKT WITH PREFIX X)
  // --------------------------------------------------------------------------
  const X_LEG_A = 528;
  const X_LEG_B = 784;
  const Y_MID = 384;

  asc.wirePath([[lastCinX, Y_BUS_TOP], [X_LEG_A, Y_BUS_TOP]]);
  asc.wirePath([[lastCinX, Y_BUS_BOT], [X_LEG_A, Y_BUS_BOT]]);

  // Leg A: Q1 (high) + Q2 (low)
  const q1 = asc.placeMosfet(X_LEG_A, 224, 'Q1', priModel.subcktName, true);
  asc.wirePath([[X_LEG_A, Y_BUS_TOP], q1.drain]);
  asc.wirePath([q1.source, [X_LEG_A, Y_MID]]);
  asc.wirePath([[X_LEG_A - 80, q1.gate[1]], q1.gate]);
  asc.flag(X_LEG_A - 80, q1.gate[1], 'g1');

  const q2 = asc.placeMosfet(X_LEG_A, 432, 'Q2', priModel.subcktName, true);
  asc.wirePath([[X_LEG_A, Y_MID], q2.drain]);
  asc.wirePath([q2.source, [X_LEG_A, Y_BUS_BOT]]);
  asc.wirePath([[X_LEG_A - 80, q2.gate[1]], q2.gate]);
  asc.flag(X_LEG_A - 80, q2.gate[1], 'g2');

  asc.wirePath([[X_LEG_A, Y_MID], [592, Y_MID]]);
  asc.flag(592, Y_MID, 'sw_a');

  // Leg B: Q3 + Q4 OR Split Half-Bridge Capacitors
  asc.wirePath([[X_LEG_A, Y_BUS_TOP], [X_LEG_B, Y_BUS_TOP]]);
  asc.wirePath([[X_LEG_A, Y_BUS_BOT], [X_LEG_B, Y_BUS_BOT]]);

  if (state.topology === 'llc-hb') {
    const chbTop = asc.placeVerticalCap(X_LEG_B, 240, 'C_HB_TOP', '22u');
    const chbBot = asc.placeVerticalCap(X_LEG_B, 448, 'C_HB_BOT', '22u');
    asc.wirePath([[X_LEG_B, Y_BUS_TOP], chbTop.top]);
    asc.wirePath([chbTop.bot, [X_LEG_B, Y_MID], chbBot.top]);
    asc.wirePath([chbBot.bot, [X_LEG_B, Y_BUS_BOT]]);
  } else {
    const q3 = asc.placeMosfet(X_LEG_B, 224, 'Q3', priModel.subcktName, true);
    asc.wirePath([[X_LEG_B, Y_BUS_TOP], q3.drain]);
    asc.wirePath([q3.source, [X_LEG_B, Y_MID]]);
    asc.wirePath([[X_LEG_B - 80, q3.gate[1]], q3.gate]);
    asc.flag(X_LEG_B - 80, q3.gate[1], 'g3');

    const q4 = asc.placeMosfet(X_LEG_B, 432, 'Q4', priModel.subcktName, true);
    asc.wirePath([[X_LEG_B, Y_MID], q4.drain]);
    asc.wirePath([q4.source, [X_LEG_B, Y_BUS_BOT]]);
    asc.wirePath([[X_LEG_B - 80, q4.gate[1]], q4.gate]);
    asc.flag(X_LEG_B - 80, q4.gate[1], 'g4');
  }
  asc.wirePath([[X_LEG_B, Y_MID], [864, Y_MID]]);
  asc.flag(864, Y_MID, 'sw_b');

  // --------------------------------------------------------------------------
  // ZONE 3: LEAKAGE / RESONANT TANK & ISOLATION TRANSFORMER
  // --------------------------------------------------------------------------
  const Y_TANK_TOP = 304;
  const Y_TANK_BOT = 496;
  asc.flag(992, Y_TANK_TOP, 'sw_a');
  asc.flag(992, Y_TANK_BOT, 'sw_b');

  const llk = asc.placeHorizontalInd(1024, Y_TANK_TOP, 'L_LK', `${state.Llk_uH.toFixed(2)}u`, 'Rser=4m');
  asc.wirePath([[992, Y_TANK_TOP], llk.left]);

  const cres = asc.placeHorizontalCap(
    1184,
    Y_TANK_TOP,
    res.isLLC ? 'C_RES' : 'C_BLK',
    res.isLLC ? `${state.Cr_nF.toFixed(1)}n` : '4.7u'
  );
  asc.wirePath([llk.right, [1184, Y_TANK_TOP], cres.left]);
  asc.flag(1136, Y_TANK_TOP, 'pri_lk');

  // Primary mirrored (M0 -> labels point LEFT), Secondary un-mirrored (R0 -> labels point RIGHT)
  const X_TX_PRI = 1408;
  const X_TX_SEC = 1520;
  const lpri = asc.placeVerticalInd(
    'ind2',
    X_TX_PRI,
    336,
    'L_PRI',
    `${Lpri_uH.toFixed(2)}u`,
    true,
    `Rser=${Math.max(0.002, res.Rpri_ac_mOhm * 1e-3).toFixed(4)}`
  );
  asc.wirePath([cres.right, [X_TX_PRI, Y_TANK_TOP], lpri.top]);
  asc.flag(1312, Y_TANK_TOP, 'pri_hot');
  asc.wirePath([lpri.bot, [X_TX_PRI, Y_TANK_BOT], [992, Y_TANK_BOT]]);

  // Transformer core parallel bars centered at x=1456 & x=1472
  asc.graphicLine(1456, 272, 1456, 480);
  asc.graphicLine(1472, 272, 1472, 480);

  if (state.txType === 'center-tapped') {
    const lsec1 = asc.placeVerticalInd('ind2', X_TX_SEC, 256, 'L_SEC1', `${Lsec_uH.toFixed(3)}u`, false);
    const lsec2 = asc.placeVerticalInd('ind2', X_TX_SEC, 400, 'L_SEC2', `${Lsec_uH.toFixed(3)}u`, false);
    asc.wirePath([lsec1.top, [1600, 256]]);
    asc.flag(1600, 256, 'sec_p');
    asc.wirePath([lsec1.bot, [X_TX_SEC, 368]]);
    asc.wirePath([[X_TX_SEC, 368], lsec2.top]);
    asc.wirePath([[X_TX_SEC, 368], [1600, 368]]);
    asc.flag(1600, 368, 'sec_ct');
    asc.wirePath([lsec2.bot, [1600, 480]]);
    asc.flag(1600, 480, 'sec_n');
    asc.directive(1360, 560, 'K_TX L_PRI L_SEC1 L_SEC2 0.9995');
  } else {
    const lsec = asc.placeVerticalInd('ind2', X_TX_SEC, 336, 'L_SEC1', `${Lsec_uH.toFixed(3)}u`, false);
    asc.wirePath([lsec.top, [1600, 336]]);
    asc.flag(1600, 336, 'sec_p');
    asc.wirePath([lsec.bot, [1600, 416]]);
    asc.flag(1600, 416, 'sec_n');
    asc.directive(1360, 560, 'K_TX L_PRI L_SEC1 0.9995');
  }

  // --------------------------------------------------------------------------
  // ZONE 4: SECONDARY RECTIFIER, OUTPUT LC FILTER & LOAD (MANUFACTURER .SUBCKT)
  // --------------------------------------------------------------------------
  const Y_OUT_RAIL = 240;
  const Y_SEC_GND = 560;

  if (state.txType === 'center-tapped') {
    asc.flag(1712, 240, 'sec_p');
    asc.flag(1712, 432, 'sec_n');
    const d1 = asc.placeVerticalDiodeUp('schottky', 1808, 240, 'D_SR1', secModel.subcktName, true);
    const d2 = asc.placeVerticalDiodeUp('schottky', 1808, 432, 'D_SR2', secModel.subcktName, true);
    asc.wirePath([[1712, 240], d1.cathode]);
    asc.wirePath([[1712, 432], d2.cathode]);
    asc.wirePath([d1.anode, [1888, 304], [1888, Y_SEC_GND]]);
    asc.wirePath([d2.anode, [1808, Y_SEC_GND], [1888, Y_SEC_GND]]);
    asc.gnd(1888, Y_SEC_GND);

    asc.flag(2016, Y_OUT_RAIL, 'sec_ct');
    const lout = asc.placeHorizontalInd(2112, Y_OUT_RAIL, 'L_OUT', `${state.Lo_uH.toFixed(2)}u`, 'Rser=1.5m');
    asc.wirePath([[2016, Y_OUT_RAIL], lout.left]);
    asc.wirePath([lout.right, [2464, Y_OUT_RAIL]]);
    asc.flag(2288, Y_OUT_RAIL, 'v_out');
  } else if (state.txType === 'current-doubler') {
    asc.flag(1712, 240, 'sec_p');
    asc.flag(1712, 416, 'sec_n');
    const d1 = asc.placeVerticalDiodeUp('schottky', 1824, 240, 'D_SR1', secModel.subcktName, true);
    const d2 = asc.placeVerticalDiodeUp('schottky', 1824, 416, 'D_SR2', secModel.subcktName, true);
    asc.wirePath([[1712, 240], d1.cathode]);
    asc.wirePath([[1712, 416], d2.cathode]);
    asc.wirePath([d1.anode, [1904, 304], [1904, Y_SEC_GND]]);
    asc.wirePath([d2.anode, [1824, Y_SEC_GND], [1904, Y_SEC_GND]]);
    asc.gnd(1904, Y_SEC_GND);

    const lo1 = asc.placeHorizontalInd(2048, 240, 'L_OUT1', `${state.Lo_uH.toFixed(2)}u`, 'Rser=1.5m');
    const lo2 = asc.placeHorizontalInd(2048, 416, 'L_OUT2', `${state.Lo_uH.toFixed(2)}u`, 'Rser=1.5m');
    asc.wirePath([[1824, 240], lo1.left]);
    asc.wirePath([[1824, 416], lo2.left]);
    asc.wirePath([lo1.right, [2272, Y_OUT_RAIL], [2464, Y_OUT_RAIL]]);
    asc.wirePath([lo2.right, [2272, 416], [2272, Y_OUT_RAIL]]);
    asc.flag(2352, Y_OUT_RAIL, 'v_out');
  } else {
    // Full-bridge rectifier: legs separated by 224px horizontally, 160px vertically
    const X_REC_1 = 1792;
    const X_REC_2 = 2016;
    const d1 = asc.placeVerticalDiodeUp('schottky', X_REC_1, 240, 'D_SR1', secModel.subcktName, true);
    const d2 = asc.placeVerticalDiodeUp('schottky', X_REC_1, 448, 'D_SR2', secModel.subcktName, true);
    const d3 = asc.placeVerticalDiodeUp('schottky', X_REC_2, 240, 'D_SR3', secModel.subcktName, true);
    const d4 = asc.placeVerticalDiodeUp('schottky', X_REC_2, 448, 'D_SR4', secModel.subcktName, true);

    asc.wirePath([d1.cathode, d3.cathode, [2112, Y_OUT_RAIL]]);
    asc.wirePath([d1.anode, [X_REC_1, 368]]);
    asc.wirePath([[X_REC_1, 368], d2.cathode]);
    asc.flag(1712, 368, 'sec_p');
    asc.wirePath([[1712, 368], [X_REC_1, 368]]);

    asc.wirePath([d3.anode, [X_REC_2, 384]]);
    asc.wirePath([[X_REC_2, 384], d4.cathode]);
    asc.flag(1936, 384, 'sec_n');
    asc.wirePath([[1936, 384], [X_REC_2, 384]]);

    asc.wirePath([d2.anode, [X_REC_1, Y_SEC_GND], [1904, Y_SEC_GND]]);
    asc.wirePath([[1904, Y_SEC_GND], [X_REC_2, Y_SEC_GND], d4.anode]);
    asc.gnd(1904, Y_SEC_GND);

    const lout = asc.placeHorizontalInd(2144, Y_OUT_RAIL, 'L_OUT', `${state.Lo_uH.toFixed(2)}u`, 'Rser=1.5m');
    asc.wirePath([[2112, Y_OUT_RAIL], lout.left]);
    asc.wirePath([lout.right, [2464, Y_OUT_RAIL]]);
    asc.flag(2320, Y_OUT_RAIL, 'v_out');
  }

  // Hybrid Output Capacitor Bank (parallel Multi-Technology Branches) & Load Resistor
  let lastCoutX = coutBaseX;
  coutUnits.forEach((u, idx) => {
    const cx = coutBaseX + idx * 96;
    const cap = asc.placeVerticalCap(
      cx,
      336,
      u.refDes,
      `${u.cap_uF}u`,
      `Rser=${u.esr_mOhm}m Lser=${u.esl_nH}n`
    );
    asc.wirePath([[lastCoutX, Y_OUT_RAIL], [cx, Y_OUT_RAIL], cap.top]);
    asc.wirePath([cap.bot, [cx, Y_SEC_GND]]);
    if (idx > 0) {
      asc.wirePath([[lastCoutX, Y_SEC_GND], [cx, Y_SEC_GND]]);
    } else {
      asc.gnd(cx, Y_SEC_GND);
    }
    lastCoutX = cx;
  });

  const rload = asc.placeVerticalRes(rloadX, 336, 'R_LOAD', `${Rload_Ohm.toFixed(3)}`);
  asc.wirePath([[lastCoutX, Y_OUT_RAIL], [rloadX, Y_OUT_RAIL], rload.top]);
  asc.wirePath([rload.bot, [rloadX, Y_SEC_GND]]);
  asc.gnd(rloadX, Y_SEC_GND);

  // --------------------------------------------------------------------------
  // ZONE 5A: ISOLATED GATE DRIVE SOURCES (400+ PX CLEAR SPACE PER SOURCE)
  // --------------------------------------------------------------------------
  const vg1 = asc.placeVerticalSource(
    'voltage',
    144,
    768,
    'V_G1',
    'PULSE(0 12 0 10n 10n {TON} {TSW})'
  );
  asc.flag(144, 752, 'g1');
  asc.wirePath([[144, 752], vg1.pos]);
  asc.wirePath([vg1.neg, [144, 864]]);
  asc.flag(144, 864, 'sw_a');

  const vg2 = asc.placeVerticalSource(
    'voltage',
    144,
    992,
    'V_G2',
    'PULSE(0 12 {THALF} 10n 10n {TON} {TSW})'
  );
  asc.flag(144, 976, 'g2');
  asc.wirePath([[144, 976], vg2.pos]);
  asc.wirePath([vg2.neg, [144, 1088]]);
  asc.gnd(144, 1088);

  if (state.topology !== 'llc-hb') {
    const vg3 = asc.placeVerticalSource(
      'voltage',
      544,
      768,
      'V_G3',
      'PULSE(0 12 {TD_A} 10n 10n {TON} {TSW})'
    );
    asc.flag(544, 752, 'g3');
    asc.wirePath([[544, 752], vg3.pos]);
    asc.wirePath([vg3.neg, [544, 864]]);
    asc.flag(544, 864, 'sw_b');

    const vg4 = asc.placeVerticalSource(
      'voltage',
      544,
      992,
      'V_G4',
      'PULSE(0 12 {TD_B} 10n 10n {TON} {TSW})'
    );
    asc.flag(544, 976, 'g4');
    asc.wirePath([[544, 976], vg4.pos]);
    asc.wirePath([vg4.neg, [544, 1088]]);
    asc.gnd(544, 1088);
  }

  // --------------------------------------------------------------------------
  // ZONE 5B: COMPENSATOR & FEEDBACK SUBCIRCUIT (SPACIOUS GRID, ZERO CLASH)
  // --------------------------------------------------------------------------
  const isOta = !res.isTwoZeroComp && res.type2Architecture === 'ota';
  if (isOta) {
    asc.flag(1040, 768, 'v_out');
    const rTop = asc.placeVerticalRes(1040, 816, 'R_FB_TOP', `${res.R1_ota_kOhm.toFixed(2)}k`);
    const rBot = asc.placeVerticalRes(1040, 960, 'R_FB_BOT', `${res.R4_ota_kOhm.toFixed(2)}k`);
    asc.wirePath([[1040, 768], rTop.top]);
    asc.wirePath([rTop.bot, [1040, 928], rBot.top]);
    asc.wirePath([[1040, 928], [1168, 928]]);
    asc.flag(1168, 928, 'fb_node');
    asc.gnd(1040, rBot.bot[1]);

    const vref = asc.placeVerticalSource('voltage', 1248, 864, 'V_REF', '1.25');
    asc.flag(1248, 848, 'ref_node');
    asc.wirePath([vref.pos, [1248, 848]]);
    asc.gnd(vref.neg[0], vref.neg[1]);

    const gmS = (res.ota_gm_mS * 1e-3).toFixed(5);
    const bOta = asc.placeVerticalSource('bi', 1424, 864, 'B_OTA', `I=${gmS}*(V(ref_node)-V(fb_node))`);
    asc.wirePath([[1424, 800], bOta.pos]);
    asc.flag(1424, 800, 'comp_node');
    asc.gnd(bOta.neg[0], bOta.neg[1]);

    const rDcComp = asc.placeVerticalRes(1536, 864, 'R_DC_COMP', '10Meg');
    asc.wirePath([[1424, 800], [1536, 800], rDcComp.top]);
    asc.gnd(rDcComp.bot[0], rDcComp.bot[1]);

    const rComp = asc.placeVerticalRes(1664, 832, 'R_OTA_Z', `${res.R2_ota_kOhm.toFixed(2)}k`);
    const c1 = asc.placeVerticalCap(1664, 960, 'C_OTA_1', `${res.C1_ota_e24_nF.toFixed(2)}n`);
    asc.wirePath([[1536, 800], [1664, 800], rComp.top]);
    asc.wirePath([rComp.bot, c1.top]);
    asc.gnd(c1.bot[0], c1.bot[1]);

    const c2 = asc.placeVerticalCap(1840, 864, 'C_OTA_2', `${res.C2_ota_e24_pF.toFixed(0)}p`);
    asc.wirePath([[1664, 800], [1840, 800], c2.top]);
    asc.gnd(c2.bot[0], c2.bot[1]);
  } else {
    asc.flag(1008, 896, 'v_out');
    const r1 = asc.placeHorizontalRes(1040, 896, 'R_COMP_1', `${res.R1_kOhm.toFixed(2)}k`);
    asc.wirePath([[1008, 896], r1.left]);
    asc.flag(1152, 896, 'fb_node');
    const rBot = asc.placeVerticalRes(1152, 960, 'R_FB_BOT', `${res.R1_kOhm.toFixed(2)}k`);
    asc.wirePath([[1152, 896], rBot.top]);
    asc.gnd(rBot.bot[0], rBot.bot[1]);

    const r2 = asc.placeHorizontalRes(1232, 800, 'R_COMP_2', `${res.R2_kOhm.toFixed(2)}k`);
    const c1 = asc.placeHorizontalCap(1360, 800, 'C_COMP_1', `${res.C1_e24_nF.toFixed(2)}n`);
    const c2 = asc.placeHorizontalCap(1296, 1008, 'C_COMP_2', `${res.C2_e24_pF.toFixed(0)}p`);

    asc.wirePath([r1.right, [1184, 896], [1184, 800], r2.left]);
    asc.wirePath([r2.right, [1360, 800], c1.left]);
    asc.wirePath([[1184, 896], [1184, 1008], c2.left]);
    asc.wirePath([c1.right, [1472, 800], [1472, 896]]);
    asc.wirePath([c2.right, [1472, 1008], [1472, 896]]);
    asc.flag(1472, 896, 'comp_node');

    const vref = asc.placeVerticalSource('voltage', 1568, 896, 'V_REF', `${(state.Vout_V * 0.5).toFixed(3)}`);
    asc.flag(1568, 880, 'ref_node');
    asc.wirePath([vref.pos, [1568, 880]]);
    asc.gnd(vref.neg[0], vref.neg[1]);

    const bErr = asc.placeVerticalSource(
      'bv',
      1712,
      896,
      'B_ERR',
      'V=limit(2.5+1e3*(V(ref_node)-V(fb_node)),0.2,4.8)'
    );
    asc.flag(1712, 880, 'comp_node');
    asc.wirePath([[1712, 880], bErr.pos]);
    asc.gnd(bErr.neg[0], bErr.neg[1]);
  }

  // --------------------------------------------------------------------------
  // ZONE 6A: SPICE PARAMETERS & SIMULATION COMMANDS
  // --------------------------------------------------------------------------
  const X_DIR = 1984;
  asc.directive(
    X_DIR,
    720,
    `.param FSW=${fswHz} TSW={1/FSW} VIN=${state.Vin_nom_V} VOUT_REF=${state.Vout_V}`
  );
  asc.directive(
    X_DIR,
    760,
    `.param TON=${tOnHalf_ns}n THALF=${half_ns}n TD_A=${tShiftA}n TD_B=${tShiftB}n`
  );
  asc.directive(X_DIR, 800, `.ic V(v_out)=${(state.Vout_V * 0.92).toFixed(2)}`);
  asc.directive(X_DIR, 836, '.options reltol=1m');
  asc.directive(X_DIR, 872, `.tran 0 ${tStop_us}u 0 25n`);
  asc.directive(
    X_DIR,
    912,
    `.meas TRAN Vout_avg AVG V(v_out) FROM ${(tStop_us * 0.72).toFixed(0)}u TO ${tStop_us}u`
  );
  asc.directive(
    X_DIR,
    952,
    `.meas TRAN Vout_pp PP V(v_out) FROM ${(tStop_us * 0.72).toFixed(0)}u TO ${tStop_us}u`
  );
  asc.directive(
    X_DIR,
    992,
    `.meas TRAN Ipri_rms RMS I(L_LK) FROM ${(tStop_us * 0.72).toFixed(0)}u TO ${tStop_us}u`
  );
  asc.comment(
    X_DIR,
    1048,
    `Primary: ${priModel.manufacturer} ${res.priDevice.id} x${state.nParallelPri}`
  );
  asc.comment(
    X_DIR,
    1080,
    `Secondary: ${secModel.manufacturer} ${res.secDevice.id} x${state.nParallelSec} (${state.rectMode})`
  );
  asc.comment(
    X_DIR,
    1112,
    `PCMC Slope Se=${res.Se_ramp_V_us.toFixed(3)} V/us | mc=${res.mc_slope.toFixed(2)} | Qp(wc)=${res.Qp_subharmonic_wc.toFixed(2)}`
  );

  // --------------------------------------------------------------------------
  // ZONE 6B: EMBEDDED MANUFACTURER SPICE .SUBCKT MODELS (ZERO MISSING LIBS)
  // --------------------------------------------------------------------------
  asc.placeSpiceBlock(80, 1280, priModel.spiceText, 24);
  asc.placeSpiceBlock(1440, 1280, secModel.spiceText, 24);

  return asc.build();
}

/**
 * Generates an accurate, well-organized, 16px-grid-aligned LTspice .asc schematic
 * for the active AC-DC PFC Front-End stage (1-Phase / 2-Phase Interleaved).
 */
export function generateAcDcLtspiceAsc(state: AcDcDesignState, res: AcDcResults): string {
  const asc = new AscSchematicBuilder(2752, 1680);

  const Vac_pk = state.Vac_rms_V * Math.SQRT2;
  const fswHz = state.fsw_kHz * 1e3;
  const swModel = generateManufacturerMosfetSubckt(res.sw, 1);
  const boostDiode = generatePfcBoostDiodeSubckt(state.Vdc_bus_V);
  const Rload_dc = (state.Vdc_bus_V * state.Vdc_bus_V) / Math.max(10, state.Pout_W);
  const nPh = res.nPhases;

  asc.comment(64, 32, `VoltCraft Power Electronics Studio -- AC-DC PFC (${state.topology})`);
  asc.comment(
    64,
    60,
    `Vac=${state.Vac_rms_V}Vrms @ ${state.f_line_Hz}Hz -> Vdc=${state.Vdc_bus_V}V @ ${state.Pout_W}W | fsw=${state.fsw_kHz}kHz | Switch=${swModel.subcktName} | Diode=${boostDiode.subcktName}`
  );

  const cdcBank = getDefaultHybridCapBank('acdc-cdc', undefined, state);
  const cdcUnits = expandHybridCapBankForSpice(cdcBank, 'C_DC', state.Vdc_bus_V * 1.04, 4);
  const cdcBaseX = 2352;
  const acdcRloadX = cdcBaseX + Math.max(1, cdcUnits.length) * 96;
  const acdcZone4Right = Math.max(2688, acdcRloadX + 128);

  asc.graphicRect(64, 112, 624, 592);
  asc.comment(80, 120, '1. AC MAINS & DM EMI FILTER');

  asc.graphicRect(656, 112, 1152, 592);
  asc.comment(672, 120, '2. INPUT BRIDGE RECTIFIER (GBJ2510)');

  asc.graphicRect(1184, 112, 2176, 592);
  asc.comment(1200, 120, `3. ${nPh}-PHASE BOOST STAGE (${swModel.subcktName} + ${boostDiode.mpn})`);

  asc.graphicRect(2208, 112, acdcZone4Right, 592);
  asc.comment(2224, 120, '4. HYBRID DC-LINK CAPACITOR BANK & LOAD');

  asc.graphicRect(64, 640, 1296, 1088);
  asc.comment(80, 648, '5A. CLOSED-LOOP PFC PWM MODULATOR');

  asc.graphicRect(1328, 640, acdcZone4Right, 1088);
  asc.comment(1344, 648, '5B. SPICE PARAMETERS & DIRECTIVES');

  asc.graphicRect(64, 1120, acdcZone4Right, 1648);
  asc.comment(80, 1132, `5C. MANUFACTURER SPICE SUBCIRCUITS (${swModel.manufacturer} ${res.sw.id} & ${boostDiode.manufacturer} ${boostDiode.mpn})`);

  const Y_TOP = 240;
  const Y_AC_N = 336;
  const Y_VRECT = 176;
  const Y_GND = 528;

  // 1. AC Mains + EMI Filter + 10Meg Safety Bleed Ground Reference
  const vac = asc.placeVerticalSource('voltage', 144, 240, 'V_AC', 'SIN(0 {VAC_PK} {FLINE})');
  asc.wirePath([vac.neg, [144, Y_AC_N]]);
  asc.flag(144, Y_AC_N, 'ac_n');

  const rAcGnd = asc.placeVerticalRes(256, 400, 'R_AC_GND', '10Meg');
  asc.wirePath([[144, Y_AC_N], [256, Y_AC_N], rAcGnd.top]);
  asc.gnd(rAcGnd.bot[0], rAcGnd.bot[1]);

  const ldm = asc.placeHorizontalInd(208, Y_TOP, 'L_DM', `${res.Ldm_uH.toFixed(1)}u`, 'Rser=5m');
  asc.wirePath([vac.pos, ldm.left]);
  asc.flag(320, Y_TOP, 'ac_dm');

  const cx = asc.placeVerticalCap(368, 256, 'C_X', `${res.Cx_each_uF.toFixed(2)}u`);
  asc.wirePath([ldm.right, [368, Y_TOP], cx.top]);
  asc.wirePath([cx.bot, [368, Y_AC_N]]);
  asc.wirePath([[256, Y_AC_N], [368, Y_AC_N]]);

  const rpre = asc.placeHorizontalRes(448, Y_TOP, 'R_PRE', `${state.prechargeR_Ohm ?? 22}`);
  asc.wirePath([[368, Y_TOP], rpre.left]);
  asc.wirePath([rpre.right, [768, Y_TOP]]);
  asc.flag(576, Y_TOP, 'ac_bus');

  // 2. Diode Bridge (Vishay GBJ2510, 224px horizontal leg separation)
  const dr1 = asc.placeVerticalDiodeUp('diode', 768, Y_VRECT, 'D_R1', 'GBJ2510_DIODE', true);
  const dr2 = asc.placeVerticalDiodeUp('diode', 768, 400, 'D_R2', 'GBJ2510_DIODE', true);
  const dr3 = asc.placeVerticalDiodeUp('diode', 992, Y_VRECT, 'D_R3', 'GBJ2510_DIODE', true);
  const dr4 = asc.placeVerticalDiodeUp('diode', 992, 400, 'D_R4', 'GBJ2510_DIODE', true);

  asc.wirePath([[768, Y_TOP], dr1.anode]);
  asc.wirePath([dr1.anode, dr2.cathode]);
  asc.wirePath([[368, Y_AC_N], [992, Y_AC_N]]);
  asc.wirePath([dr3.anode, [992, Y_AC_N]]);
  asc.wirePath([[992, Y_AC_N], dr4.cathode]);
  asc.wirePath([dr1.cathode, dr3.cathode, [1264, Y_VRECT]]);
  asc.flag(1120, Y_VRECT, 'v_rect');
  asc.wirePath([dr2.anode, [768, Y_GND], [880, Y_GND]]);
  asc.wirePath([[880, Y_GND], [992, Y_GND], dr4.anode]);
  asc.wirePath([[992, Y_GND], [acdcRloadX, Y_GND]]);
  asc.gnd(880, Y_GND);

  // 3. 1-Phase or 2-Phase Interleaved Boost Stage (Manufacturer .SUBCKT)
  const lpfc1 = asc.placeHorizontalInd(1264, Y_VRECT, 'L_PFC1', `${state.Lpfc_uH.toFixed(1)}u`, 'Rser=8m');
  const q1 = asc.placeMosfet(1440, 368, 'Q_PFC1', swModel.subcktName, true);
  const db1 = asc.placeHorizontalDiode('schottky', 1488, Y_VRECT, 'D_B1', boostDiode.subcktName, true);
  asc.wirePath([lpfc1.right, [1440, Y_VRECT], db1.anode]);
  asc.wirePath([[1440, Y_VRECT], q1.drain]);
  asc.wirePath([q1.source, [1440, Y_GND]]);
  asc.flag(1440, Y_VRECT, 'sw1');
  asc.wirePath([[1360, q1.gate[1]], q1.gate]);
  asc.flag(1360, q1.gate[1], 'gpfc1');

  if (nPh === 2) {
    asc.wirePath([db1.cathode, [1600, Y_VRECT]]);
    asc.flag(1600, Y_VRECT, 'v_dc');

    asc.flag(1680, Y_VRECT, 'v_rect');
    const lpfc2 = asc.placeHorizontalInd(1728, Y_VRECT, 'L_PFC2', `${state.Lpfc_uH.toFixed(1)}u`, 'Rser=8m');
    asc.wirePath([[1680, Y_VRECT], lpfc2.left]);
    const q2 = asc.placeMosfet(1920, 368, 'Q_PFC2', swModel.subcktName, true);
    const db2 = asc.placeHorizontalDiode('schottky', 1968, Y_VRECT, 'D_B2', boostDiode.subcktName, true);
    asc.wirePath([lpfc2.right, [1920, Y_VRECT], db2.anode]);
    asc.wirePath([[1920, Y_VRECT], q2.drain]);
    asc.wirePath([q2.source, [1920, Y_GND]]);
    asc.flag(1920, Y_VRECT, 'sw2');
    asc.wirePath([[1840, q2.gate[1]], q2.gate]);
    asc.flag(1840, q2.gate[1], 'gpfc2');

    asc.wirePath([db2.cathode, [2352, Y_VRECT]]);
  } else {
    asc.wirePath([db1.cathode, [2352, Y_VRECT]]);
  }

  // 4. Hybrid DC-Link Capacitor Bank & Load
  asc.flag(2256, Y_VRECT, 'v_dc');
  let lastCdcX = cdcBaseX;
  cdcUnits.forEach((u, idx) => {
    const cx = cdcBaseX + idx * 96;
    const cap = asc.placeVerticalCap(
      cx,
      320,
      u.refDes,
      `${u.cap_uF}u`,
      `Rser=${u.esr_mOhm}m Lser=${u.esl_nH}n`
    );
    asc.wirePath([[lastCdcX, Y_VRECT], [cx, Y_VRECT], cap.top]);
    asc.wirePath([cap.bot, [cx, Y_GND]]);
    lastCdcX = cx;
  });

  const rload = asc.placeVerticalRes(acdcRloadX, 320, 'R_LOAD', `${Rload_dc.toFixed(2)}`);
  asc.wirePath([[lastCdcX, Y_VRECT], [acdcRloadX, Y_VRECT], rload.top]);
  asc.wirePath([rload.bot, [acdcRloadX, Y_GND]]);

  // 5A. Closed-Loop PFC PWM Modulator (B_DUTY + V_SAW + B_PWM)
  const bDuty = asc.placeVerticalSource(
    'bv',
    144,
    736,
    'B_DUTY',
    'V=limit(1-abs(V(v_rect))/max(50,V(v_dc))+0.02*(VDC_REF-V(v_dc)),0.05,0.92)'
  );
  asc.flag(144, 720, 'd_cmd');
  asc.wirePath([[144, 720], bDuty.pos]);
  asc.gnd(bDuty.neg[0], bDuty.neg[1]);

  const vSaw1 = asc.placeVerticalSource(
    'voltage',
    640,
    736,
    'V_SAW1',
    'PULSE(0 1 0 {0.98*TSW} {0.02*TSW} 1n {TSW})'
  );
  asc.flag(640, 720, 'saw1');
  asc.wirePath([[640, 720], vSaw1.pos]);
  asc.gnd(vSaw1.neg[0], vSaw1.neg[1]);

  const bPwm1 = asc.placeVerticalSource('bv', 1024, 736, 'B_PWM1', 'V=if(V(d_cmd)>V(saw1),12,0)');
  asc.flag(1024, 720, 'gpfc1');
  asc.wirePath([[1024, 720], bPwm1.pos]);
  asc.gnd(bPwm1.neg[0], bPwm1.neg[1]);

  if (nPh === 2) {
    const vSaw2 = asc.placeVerticalSource(
      'voltage',
      640,
      928,
      'V_SAW2',
      'PULSE(0 1 {0.5*TSW} {0.98*TSW} {0.02*TSW} 1n {TSW})'
    );
    asc.flag(640, 912, 'saw2');
    asc.wirePath([[640, 912], vSaw2.pos]);
    asc.gnd(vSaw2.neg[0], vSaw2.neg[1]);

    const bPwm2 = asc.placeVerticalSource('bv', 1024, 928, 'B_PWM2', 'V=if(V(d_cmd)>V(saw2),12,0)');
    asc.flag(1024, 912, 'gpfc2');
    asc.wirePath([[1024, 912], bPwm2.pos]);
    asc.gnd(bPwm2.neg[0], bPwm2.neg[1]);
  }

  // 5B. Directives
  const X_DIR = 1360;
  asc.directive(
    X_DIR,
    696,
    `.param FSW=${fswHz} TSW={1/FSW} VAC_PK=${Vac_pk.toFixed(2)} FLINE=${state.f_line_Hz} VDC_REF=${state.Vdc_bus_V}`
  );
  asc.directive(X_DIR, 736, `.ic V(v_dc)=${state.Vdc_bus_V.toFixed(1)}`);
  asc.directive(X_DIR, 776, '.options reltol=1m');
  asc.directive(X_DIR, 816, `.tran 0 40m 20m 250n`);
  asc.directive(X_DIR, 856, `.meas TRAN Vdc_avg AVG V(v_dc) FROM 20m TO 40m`);
  asc.directive(X_DIR, 896, `.meas TRAN Iac_rms RMS I(L_DM) FROM 20m TO 40m`);
  asc.comment(X_DIR, 952, `Switch: ${swModel.manufacturer} ${res.sw.id} | Diode: ${boostDiode.manufacturer} ${boostDiode.mpn}`);

  // 5C. Manufacturer .SUBCKT SPICE Models
  asc.placeSpiceBlock(80, 1168, swModel.spiceText, 24);
  asc.placeSpiceBlock(1360, 1168, boostDiode.spiceText, 24);

  return asc.build();
}

/**
 * Generates a unified 2-stage Combined AC-DC PFC -> DC-DC LTspice .asc schematic.
 * Stage 1 (AC-DC PFC) sits at the top feeding the shared `v_dc` bus (without a
 * dummy resistor load); Stage 2 (Isolated DC-DC) sits cleanly below, powered directly
 * from the shared `v_dc` bus (no separate V_IN source) with unified directives and
 * deduplicated manufacturer .SUBCKT models.
 */
export function generateCombinedSystemLtspiceAsc(
  acdcState: AcDcDesignState,
  acdcRes: AcDcResults,
  dcdcState: DcDcDesignState,
  dcdcRes: DcDcResults,
  sharedMcu = true
): string {
  const acdcRaw = generateAcDcLtspiceAsc(acdcState, acdcRes);
  const dcdcRaw = generateDcDcLtspiceAsc(dcdcState, dcdcRes);

  const filterAndShiftAsc = (
    raw: string,
    dy: number,
    options: {
      dropInstNames: Set<string>;
      replaceFlagVinPos?: boolean;
      tswParamName: string;
      maxRawYBeforeDirectives: number;
    }
  ): string[] => {
    const rawLines = raw.split(/\r?\n/);
    const out: string[] = [];
    let i = 0;
    while (i < rawLines.length) {
      const line = rawLines[i];
      if (
        line.startsWith('Version ') ||
        line.startsWith('SHEET ') ||
        line.trim() === ''
      ) {
        i++;
        continue;
      }
      // Drop standalone header banners and bottom .SUBCKT / directive blocks
      if (line.startsWith('SYMBOL ')) {
        const parts = line.split(/\s+/);
        const symY = Number(parts[3]);
        // Collect full symbol block (WINDOW + SYMATTR lines)
        const symBlock: string[] = [
          `SYMBOL ${parts[1]} ${parts[2]} ${Math.round(symY + dy)} ${parts[4]}`,
        ];
        let instName = '';
        let j = i + 1;
        while (j < rawLines.length && (rawLines[j].startsWith('WINDOW ') || rawLines[j].startsWith('SYMATTR '))) {
          let attrLine = rawLines[j];
          if (attrLine.startsWith('SYMATTR InstName ')) {
            instName = attrLine.slice('SYMATTR InstName '.length).trim();
          }
          if (attrLine.includes('{TSW}')) {
            attrLine = attrLine.replace(/\{TSW\}/g, `{${options.tswParamName}}`);
          }
          symBlock.push(attrLine);
          j++;
        }
        if (!options.dropInstNames.has(instName)) {
          out.push(...symBlock);
        }
        i = j;
        continue;
      }

      if (line.startsWith('WIRE ')) {
        const parts = line.split(/\s+/);
        const y1 = Number(parts[2]);
        const y2 = Number(parts[4]);
        if (y1 <= options.maxRawYBeforeDirectives && y2 <= options.maxRawYBeforeDirectives) {
          out.push(`WIRE ${parts[1]} ${Math.round(y1 + dy)} ${parts[3]} ${Math.round(y2 + dy)}`);
        }
        i++;
        continue;
      }

      if (line.startsWith('FLAG ')) {
        const parts = line.split(/\s+/);
        const y = Number(parts[2]);
        if (y <= options.maxRawYBeforeDirectives) {
          let name = parts.slice(3).join(' ');
          if (options.replaceFlagVinPos && name === 'vin_pos') name = 'v_dc';
          out.push(`FLAG ${parts[1]} ${Math.round(y + dy)} ${name}`);
        }
        i++;
        continue;
      }

      if (line.startsWith('LINE Normal ') || line.startsWith('RECTANGLE Normal ')) {
        const parts = line.split(/\s+/);
        const y1 = Number(parts[3]);
        const y2 = Number(parts[5]);
        if (y1 <= options.maxRawYBeforeDirectives && y2 <= options.maxRawYBeforeDirectives) {
          out.push(`${parts[0]} ${parts[1]} ${parts[2]} ${Math.round(y1 + dy)} ${parts[4]} ${Math.round(y2 + dy)}`);
        }
        i++;
        continue;
      }

      if (line.startsWith('TEXT ')) {
        const m = line.match(/^TEXT\s+(-?\d+)\s+(-?\d+)\s+(\S+)\s+(\d+)\s+(.*)$/);
        if (m) {
          const x = Number(m[1]);
          const y = Number(m[2]);
          const align = m[3];
          const size = m[4];
          const body = m[5];
          // Skip top banner, SPICE directives, and .SUBCKT blocks (re-emitted unified below)
          if (
            y >= 112 &&
            y <= options.maxRawYBeforeDirectives &&
            !body.startsWith('!') &&
            !(y >= 640 && x >= 1300)
          ) {
            out.push(`TEXT ${x} ${Math.round(y + dy)} ${align} ${size} ${body}`);
          }
        }
        i++;
        continue;
      }

      i++;
    }
    return out;
  };

  // Stage 1 sits at dy = 64; Stage 2 sits cleanly below at dy = 1168
  const stage1Lines = filterAndShiftAsc(acdcRaw, 64, {
    dropInstNames: new Set(['R_LOAD']),
    tswParamName: 'TSW_PFC',
    maxRawYBeforeDirectives: 1096,
  });

  const stage2Lines = filterAndShiftAsc(dcdcRaw, 1168, {
    dropInstNames: new Set(['V_IN']),
    replaceFlagVinPos: true,
    tswParamName: 'TSW_DC',
    maxRawYBeforeDirectives: 1216,
  });

  const Vac_pk = acdcState.Vac_rms_V * Math.SQRT2;
  const fswPfcHz = acdcState.fsw_kHz * 1e3;
  const fswDcHz = dcdcState.fsw_kHz * 1e3;
  const TswDc = 1 / fswDcHz;
  const ThalfDc = TswDc / 2;
  const half_ns = Math.round(ThalfDc * 1e9);
  const tOnHalf_ns = Math.max(80, Math.round(half_ns - Math.max(20, dcdcState.deadTime_ns)));
  const deff = dcdcRes.isLLC ? 1.0 : Math.max(0.15, Math.min(0.95, dcdcRes.Deff_nom));
  const phaseShift_ns = Math.round(deff * half_ns);
  const tShiftA = dcdcRes.isLLC ? half_ns : phaseShift_ns;
  const tShiftB = dcdcRes.isLLC ? 0 : Math.round(phaseShift_ns + half_ns);

  const swModel = generateManufacturerMosfetSubckt(acdcRes.sw, 1);
  const boostDiode = generatePfcBoostDiodeSubckt(acdcState.Vdc_bus_V);
  const priModel = generateManufacturerMosfetSubckt(dcdcRes.priDevice, dcdcState.nParallelPri);
  const secModel = generateManufacturerRectifierSubckt(
    dcdcRes.secDevice,
    dcdcState.nParallelSec,
    dcdcState.rectMode
  );

  const asc = new AscSchematicBuilder(2960, 3260);
  asc.comment(64, 32, `VoltCraft Power Electronics Studio -- COMBINED 2-STAGE (${acdcState.topology} -> ${dcdcState.topology.toUpperCase()})`);
  asc.comment(
    64,
    60,
    `Stage 1: ${acdcState.Vac_rms_V}Vrms -> ${acdcState.Vdc_bus_V}Vdc | Stage 2: ${dcdcState.Vin_nom_V}Vdc -> ${dcdcState.Vout_V}V @ ${dcdcState.Pout_W}W | ${
      sharedMcu ? 'Same Shared MCU (ePWM Sync + Direct Vdc_ff)' : 'Separate MCUs (Isolated PG_OK + Fault_Trip)'
    }`
  );

  // Unified Directives Panel (Right-side clear zone in Stage 2 row)
  const Y_DIR = 2464;
  asc.graphicRect(64, Y_DIR - 48, 2864, Y_DIR + 280);
  asc.comment(80, Y_DIR - 36, '7. COMBINED SYSTEM PARAMETERS & SIMULATION DIRECTIVES');
  asc.directive(
    80,
    Y_DIR,
    `.param FSW_PFC=${fswPfcHz} TSW_PFC={1/FSW_PFC} VAC_PK=${Vac_pk.toFixed(2)} FLINE=${acdcState.f_line_Hz} VDC_REF=${acdcState.Vdc_bus_V}`
  );
  asc.directive(
    80,
    Y_DIR + 40,
    `.param FSW_DC=${fswDcHz} TSW_DC={1/FSW_DC} VOUT_REF=${dcdcState.Vout_V} TON=${tOnHalf_ns}n THALF=${half_ns}n TD_A=${tShiftA}n TD_B=${tShiftB}n`
  );
  asc.directive(
    80,
    Y_DIR + 80,
    `.ic V(v_dc)=${acdcState.Vdc_bus_V.toFixed(1)} V(v_out)=${(dcdcState.Vout_V * 0.94).toFixed(2)}`
  );
  asc.directive(80, Y_DIR + 120, '.options reltol=1m');
  asc.directive(80, Y_DIR + 160, `.tran 0 ${(1 / acdcState.f_line_Hz * 1e3).toFixed(1)}m 0 100n`);
  asc.directive(80, Y_DIR + 200, `.meas TRAN Vdc_avg AVG V(v_dc)`);
  asc.directive(80, Y_DIR + 240, `.meas TRAN Vout_avg AVG V(v_out)`);

  // Deduplicated Manufacturer .SUBCKT Blocks
  const subckts = Array.from(
    new Map<string, string>([
      [swModel.subcktName, swModel.spiceText],
      [boostDiode.subcktName, boostDiode.spiceText],
      [priModel.subcktName, priModel.spiceText],
      [secModel.subcktName, secModel.spiceText],
    ]).values()
  );
  asc.graphicRect(64, Y_DIR + 304, 2864, Y_DIR + 760);
  asc.comment(80, Y_DIR + 316, '8. MANUFACTURER SPICE .SUBCKT MODELS (DEDUPLICATED)');
  subckts.forEach((txt, idx) => {
    asc.placeSpiceBlock(80 + idx * 680, Y_DIR + 356, txt, 24);
  });

  const combinedHeader = asc.build().split('\n');
  return [
    combinedHeader[0],
    combinedHeader[1],
    ...stage1Lines,
    ...stage2Lines,
    ...combinedHeader.slice(2),
  ].join('\n');
}
