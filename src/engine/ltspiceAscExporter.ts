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
  placeMosfet(xDrain: number, yDrain: number, name: string, modelName: string) {
    this.symbol('nmos', xDrain - 48, yDrain, 'R0', name, modelName);
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
    modelName: string
  ) {
    this.symbol(sym, xAnode, y + 16, 'R270', name, modelName);
    return { anode: [xAnode, y] as [number, number], cathode: [xAnode + 64, y] as [number, number] };
  }

  /** Vertical diode (cathode top -> anode bottom): Cathode=(x, y), Anode=(x, y + 64). */
  placeVerticalDiodeUp(
    sym: 'diode' | 'schottky',
    x: number,
    yCathode: number,
    name: string,
    modelName: string
  ) {
    this.symbol(sym, x + 16, yCathode + 64, 'R180', name, modelName);
    return { cathode: [x, yCathode] as [number, number], anode: [x, yCathode + 64] as [number, number] };
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
  const asc = new AscSchematicBuilder(2880, 1344);

  const fswHz = state.fsw_kHz * 1e3;
  const Tsw = 1 / fswHz;
  const Thalf = Tsw / 2;
  const tDead_ns = Math.max(20, state.deadTime_ns);
  const tOnHalf_ns = Math.max(80, Math.round(Thalf * 1e9 - tDead_ns));
  const Tsw_ns = Math.round(Tsw * 1e9);
  const half_ns = Math.round(Thalf * 1e9);
  const phaseShift_ns = Math.round((1 - Math.min(0.95, res.Deff_nom)) * Thalf * 1e9);

  const Ron_pri = Math.max(
    0.002,
    ((res.priDevice.Rds_on_25C_mOhm * 1.45) / Math.max(1, state.nParallelPri)) * 1e-3
  );
  const Ron_sec = Math.max(
    0.001,
    ((res.secDevice.Rds_on_25C_mOhm * 1.4) / Math.max(1, state.nParallelSec)) * 1e-3
  );
  const Coss_pri_pF = Math.max(15, res.priDevice.Coss_er_pF * state.nParallelPri);
  const n = Math.max(0.2, res.Np_actual / Math.max(1, res.Ns_actual));
  const Lpri_uH = Math.max(50, state.Lm_uH);
  const Lsec_uH = Lpri_uH / (n * n);
  const Rload_Ohm = (state.Vout_V * state.Vout_V) / Math.max(1, state.Pout_W);
  const tStop_us = Math.round(Math.max(400, (1e6 / fswHz) * 45));

  const tShiftA = res.isLLC ? half_ns : phaseShift_ns;
  const tShiftB = res.isLLC ? 0 : Math.round((phaseShift_ns + half_ns) % Tsw_ns);

  // Header & Zone Banners (pure 7-bit ASCII)
  asc.comment(64, 32, `VoltCraft Power Electronics Studio -- ${state.topology.toUpperCase()} (${state.presetName})`);
  asc.comment(
    64,
    60,
    `Vin=${state.Vin_nom_V}V (${state.Vin_min_V}..${state.Vin_max_V}V) -> Vout=${state.Vout_V}V @ ${state.Pout_W}W | fsw=${state.fsw_kHz}kHz | Core=${res.core.name} (${res.Np_actual}:${res.Ns_actual}T)`
  );

  // Top Row Zones (Power Path)
  asc.graphicRect(64, 112, 352, 624);
  asc.comment(80, 120, '1. INPUT BUS');

  asc.graphicRect(384, 112, 928, 624);
  asc.comment(400, 120, `2. PRIMARY ${state.topology === 'llc-hb' ? 'HALF-BRIDGE' : 'FULL-BRIDGE'}`);

  asc.graphicRect(960, 112, 1632, 624);
  asc.comment(976, 120, '3. TANK & ISOLATION TRANSFORMER');

  asc.graphicRect(1664, 112, 2752, 624);
  asc.comment(1680, 120, `4. ${state.txType.toUpperCase()} RECTIFIER, OUTPUT FILTER & LOAD`);

  // Bottom Row Zones (Gate Drives, Control Loop, Directives)
  asc.graphicRect(64, 672, 928, 1200);
  asc.comment(80, 680, '5A. ISOLATED GATE DRIVE SOURCES');

  asc.graphicRect(960, 672, 1936, 1200);
  asc.comment(
    976,
    680,
    `5B. CONTROL & COMPENSATOR (${state.controlType.toUpperCase()} | ${res.type2Architecture === 'ota' ? `OTA gm=${res.ota_gm_mS.toFixed(2)}mS` : 'Op-Amp'})`
  );

  asc.graphicRect(1968, 672, 2752, 1200);
  asc.comment(1984, 680, '6. SPICE PARAMETERS, MODELS & DIRECTIVES');

  // --------------------------------------------------------------------------
  // ZONE 1: INPUT DC SOURCE & BULK CAPACITOR
  // --------------------------------------------------------------------------
  const Y_BUS_TOP = 192;
  const Y_BUS_BOT = 560;

  const vinSrc = asc.placeVerticalSource('voltage', 144, 336, 'V_IN', '{VIN}');
  asc.wirePath([vinSrc.pos, [144, Y_BUS_TOP]]);
  asc.wirePath([vinSrc.neg, [144, Y_BUS_BOT]]);
  asc.gnd(144, Y_BUS_BOT);
  asc.flag(144, Y_BUS_TOP, 'vin_pos');

  const cin = asc.placeVerticalCap(272, 352, 'C_IN', '47u', 'Rser=5m');
  asc.wirePath([[144, Y_BUS_TOP], [272, Y_BUS_TOP], cin.top]);
  asc.wirePath([[144, Y_BUS_BOT], [272, Y_BUS_BOT], cin.bot]);

  // --------------------------------------------------------------------------
  // ZONE 2: PRIMARY BRIDGE LEGS (CLEAN MOSFET SYMBOLS, NO CLUTTERING PULSE TEXT)
  // --------------------------------------------------------------------------
  const X_LEG_A = 528;
  const X_LEG_B = 784;
  const Y_MID = 384;

  asc.wirePath([[272, Y_BUS_TOP], [X_LEG_A, Y_BUS_TOP]]);
  asc.wirePath([[272, Y_BUS_BOT], [X_LEG_A, Y_BUS_BOT]]);

  // Leg A: Q1 (high) + Q2 (low)
  const q1 = asc.placeMosfet(X_LEG_A, 224, 'Q1', 'Q_PRI');
  asc.wirePath([[X_LEG_A, Y_BUS_TOP], q1.drain]);
  asc.wirePath([q1.source, [X_LEG_A, Y_MID]]);
  asc.wirePath([[X_LEG_A - 80, q1.gate[1]], q1.gate]);
  asc.flag(X_LEG_A - 80, q1.gate[1], 'g1');

  const q2 = asc.placeMosfet(X_LEG_A, 432, 'Q2', 'Q_PRI');
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
    const q3 = asc.placeMosfet(X_LEG_B, 224, 'Q3', 'Q_PRI');
    asc.wirePath([[X_LEG_B, Y_BUS_TOP], q3.drain]);
    asc.wirePath([q3.source, [X_LEG_B, Y_MID]]);
    asc.wirePath([[X_LEG_B - 80, q3.gate[1]], q3.gate]);
    asc.flag(X_LEG_B - 80, q3.gate[1], 'g3');

    const q4 = asc.placeMosfet(X_LEG_B, 432, 'Q4', 'Q_PRI');
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
    asc.wirePath([lsec1.bot, lsec2.top]);
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
  // ZONE 4: SECONDARY RECTIFIER, OUTPUT LC FILTER & LOAD (SPACIOUS >=192PX LEGS)
  // --------------------------------------------------------------------------
  const Y_OUT_RAIL = 240;
  const Y_SEC_GND = 560;

  if (state.txType === 'center-tapped') {
    asc.flag(1712, 240, 'sec_p');
    asc.flag(1712, 432, 'sec_n');
    const d1 = asc.placeVerticalDiodeUp('schottky', 1808, 240, 'D_SR1', 'D_SEC');
    const d2 = asc.placeVerticalDiodeUp('schottky', 1808, 432, 'D_SR2', 'D_SEC');
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
    const d1 = asc.placeVerticalDiodeUp('schottky', 1824, 240, 'D_SR1', 'D_SEC');
    const d2 = asc.placeVerticalDiodeUp('schottky', 1824, 416, 'D_SR2', 'D_SEC');
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
    const d1 = asc.placeVerticalDiodeUp('schottky', X_REC_1, 240, 'D_SR1', 'D_SEC');
    const d2 = asc.placeVerticalDiodeUp('schottky', X_REC_1, 448, 'D_SR2', 'D_SEC');
    const d3 = asc.placeVerticalDiodeUp('schottky', X_REC_2, 240, 'D_SR3', 'D_SEC');
    const d4 = asc.placeVerticalDiodeUp('schottky', X_REC_2, 448, 'D_SR4', 'D_SEC');

    asc.wirePath([d1.cathode, d3.cathode, [2112, Y_OUT_RAIL]]);
    asc.wirePath([d1.anode, d2.cathode]);
    asc.flag(1712, 368, 'sec_p');
    asc.wirePath([[1712, 368], [X_REC_1, 368]]);

    asc.wirePath([d3.anode, d4.cathode]);
    asc.flag(1936, 384, 'sec_n');
    asc.wirePath([[1936, 384], [X_REC_2, 384]]);

    asc.wirePath([d2.anode, [X_REC_1, Y_SEC_GND], [X_REC_2, Y_SEC_GND], d4.anode]);
    asc.gnd(1904, Y_SEC_GND);

    const lout = asc.placeHorizontalInd(2144, Y_OUT_RAIL, 'L_OUT', `${state.Lo_uH.toFixed(2)}u`, 'Rser=1.5m');
    asc.wirePath([[2112, Y_OUT_RAIL], lout.left]);
    asc.wirePath([lout.right, [2464, Y_OUT_RAIL]]);
    asc.flag(2320, Y_OUT_RAIL, 'v_out');
  }

  // Output Capacitor Bank & Load Resistor
  const cout = asc.placeVerticalCap(
    2416,
    336,
    'C_OUT',
    `${state.Co_uF.toFixed(1)}u`,
    `Rser=${state.ESR_Co_mOhm.toFixed(2)}m`
  );
  asc.wirePath([[2416, Y_OUT_RAIL], cout.top]);
  asc.wirePath([cout.bot, [2416, Y_SEC_GND]]);
  asc.gnd(2416, Y_SEC_GND);

  const rload = asc.placeVerticalRes(2608, 336, 'R_LOAD', `${Rload_Ohm.toFixed(3)}`);
  asc.wirePath([[2464, Y_OUT_RAIL], [2608, Y_OUT_RAIL], rload.top]);
  asc.wirePath([rload.bot, [2608, Y_SEC_GND]]);
  asc.gnd(2608, Y_SEC_GND);

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

    const rComp = asc.placeVerticalRes(1664, 832, 'R_OTA_Z', `${res.R2_ota_kOhm.toFixed(2)}k`);
    const c1 = asc.placeVerticalCap(1664, 960, 'C_OTA_1', `${res.C1_ota_e24_nF.toFixed(2)}n`);
    asc.wirePath([[1424, 800], [1664, 800], rComp.top]);
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
      'V=limit(1e5*(V(ref_node)-V(fb_node)),0,5)'
    );
    asc.flag(1712, 880, 'comp_node');
    asc.wirePath([[1712, 880], bErr.pos]);
    asc.gnd(bErr.neg[0], bErr.neg[1]);
  }

  // --------------------------------------------------------------------------
  // ZONE 6: SPICE PARAMETERS, DEVICE MODELS & SIMULATION COMMANDS
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
  asc.directive(
    X_DIR,
    800,
    `.model Q_PRI VDMOS(Rg=${(res.priDevice.Rg_int_Ohm ?? 1.5).toFixed(2)} Vto=3.0 Rd=${(Ron_pri * 0.6).toFixed(5)} Rs=${(Ron_pri * 0.4).toFixed(5)} Cgdmax=${Math.max(5, Math.round(Coss_pri_pF * 0.25))}p Cgdmin=5p Cgs=${Math.max(50, Math.round(res.priDevice.Qg_nC * 40))}p Cjo=${Coss_pri_pF.toFixed(1)}p Is=1e-10)`
  );
  asc.directive(
    X_DIR,
    840,
    `.model D_SEC D(Ron=${Ron_sec.toFixed(5)} Roff=1Meg Vfwd=${state.rectMode === 'schottky-diode' ? res.secDevice.Vsd_V.toFixed(2) : '0.45'})`
  );
  asc.directive(X_DIR, 888, `.tran 0 ${tStop_us}u ${(tStop_us * 0.6).toFixed(0)}u 20n`);
  asc.directive(
    X_DIR,
    928,
    `.meas TRAN Vout_avg AVG V(v_out) FROM ${(tStop_us * 0.7).toFixed(0)}u TO ${tStop_us}u`
  );
  asc.directive(
    X_DIR,
    968,
    `.meas TRAN Vout_pp PP V(v_out) FROM ${(tStop_us * 0.7).toFixed(0)}u TO ${tStop_us}u`
  );
  asc.directive(
    X_DIR,
    1008,
    `.meas TRAN Ipri_rms RMS I(L_LK) FROM ${(tStop_us * 0.7).toFixed(0)}u TO ${tStop_us}u`
  );
  asc.comment(
    X_DIR,
    1064,
    `PCMC Slope Se=${res.Se_ramp_V_us.toFixed(3)} V/us | mc=${res.mc_slope.toFixed(2)} | Qp(wc)=${res.Qp_subharmonic_wc.toFixed(2)}`
  );

  return asc.build();
}

/**
 * Generates an accurate, well-organized, 16px-grid-aligned LTspice .asc schematic
 * for the active AC-DC PFC Front-End stage (1-Phase / 2-Phase Interleaved).
 */
export function generateAcDcLtspiceAsc(state: AcDcDesignState, res: AcDcResults): string {
  const asc = new AscSchematicBuilder(2464, 1120);

  const Vac_pk = state.Vac_rms_V * Math.SQRT2;
  const fswHz = state.fsw_kHz * 1e3;
  const Tsw_ns = Math.round((1 / fswHz) * 1e9);
  const tOn_ns = Math.round(Tsw_ns * 0.45);
  const td2_ns = Math.round(Tsw_ns * 0.5);
  const Ron_sw = Math.max(0.005, res.sw.Rds_on_25C_mOhm * 1.45 * 1e-3);
  const Coss_pF = Math.max(15, res.sw.Coss_er_pF);
  const Rload_dc = (state.Vdc_bus_V * state.Vdc_bus_V) / Math.max(10, state.Pout_W);
  const nPh = res.nPhases;

  asc.comment(64, 32, `VoltCraft Power Electronics Studio -- AC-DC PFC (${state.topology})`);
  asc.comment(
    64,
    60,
    `Vac=${state.Vac_rms_V}Vrms @ ${state.f_line_Hz}Hz -> Vdc=${state.Vdc_bus_V}V @ ${state.Pout_W}W | fsw=${state.fsw_kHz}kHz | Switch=${res.sw.name}`
  );

  asc.graphicRect(64, 112, 624, 592);
  asc.comment(80, 120, '1. AC MAINS & DM EMI FILTER');

  asc.graphicRect(656, 112, 1152, 592);
  asc.comment(672, 120, '2. INPUT BRIDGE RECTIFIER');

  asc.graphicRect(1184, 112, 1936, 592);
  asc.comment(1200, 120, `3. ${nPh}-PHASE BOOST STAGE`);

  asc.graphicRect(1968, 112, 2400, 592);
  asc.comment(1984, 120, '4. DC-LINK BULK & LOAD');

  asc.graphicRect(64, 640, 1152, 1024);
  asc.comment(80, 648, '5A. PFC GATE DRIVE SOURCES');

  asc.graphicRect(1184, 640, 2400, 1024);
  asc.comment(1200, 648, '5B. SPICE PARAMETERS, MODELS & DIRECTIVES');

  const Y_TOP = 240;
  const Y_AC_N = 432;

  // 1. AC Mains + EMI Filter
  const vac = asc.placeVerticalSource('voltage', 144, 304, 'V_AC', 'SIN(0 {VAC_PK} {FLINE})');
  asc.wirePath([vac.pos, [144, Y_TOP]]);
  asc.wirePath([vac.neg, [144, Y_AC_N]]);
  asc.flag(144, Y_AC_N, 'ac_n');

  const ldm = asc.placeHorizontalInd(208, Y_TOP, 'L_DM', `${res.Ldm_uH.toFixed(1)}u`, 'Rser=5m');
  asc.wirePath([[144, Y_TOP], ldm.left]);
  asc.flag(320, Y_TOP, 'ac_dm');

  const cx = asc.placeVerticalCap(368, 320, 'C_X', `${res.Cx_each_uF.toFixed(2)}u`);
  asc.wirePath([ldm.right, [368, Y_TOP], cx.top]);
  asc.wirePath([cx.bot, [368, Y_AC_N]]);
  asc.flag(368, Y_AC_N, 'ac_n');

  const rpre = asc.placeHorizontalRes(448, Y_TOP, 'R_PRE', `${state.prechargeR_Ohm ?? 22}`);
  asc.wirePath([[368, Y_TOP], rpre.left]);
  asc.wirePath([rpre.right, [768, Y_TOP]]);
  asc.flag(576, Y_TOP, 'ac_bus');

  // 2. Diode Bridge (224px horizontal leg separation)
  const dr1 = asc.placeVerticalDiodeUp('diode', 768, 192, 'D_R1', 'D_PFC');
  const dr2 = asc.placeVerticalDiodeUp('diode', 768, 416, 'D_R2', 'D_PFC');
  const dr3 = asc.placeVerticalDiodeUp('diode', 992, 192, 'D_R3', 'D_PFC');
  const dr4 = asc.placeVerticalDiodeUp('diode', 992, 416, 'D_R4', 'D_PFC');

  asc.wirePath([[768, Y_TOP], dr1.anode, dr2.cathode]);
  asc.flag(912, 336, 'ac_n');
  asc.wirePath([[912, 336], [992, 336]]);
  asc.wirePath([dr3.anode, dr4.cathode]);
  asc.wirePath([dr1.cathode, dr3.cathode, [1264, 192]]);
  asc.flag(1120, 192, 'v_rect');
  asc.wirePath([dr2.anode, [768, 528], [992, 528], dr4.anode]);
  asc.wirePath([[992, 528], [2288, 528]]);
  asc.gnd(880, 528);

  // 3. 1-Phase or 2-Phase Interleaved Boost Stage (Side-by-Side Zero-Crossing Layout)
  const lpfc1 = asc.placeHorizontalInd(1264, 192, 'L_PFC1', `${state.Lpfc_uH.toFixed(1)}u`, 'Rser=8m');
  const q1 = asc.placeMosfet(1408, 368, 'Q_PFC1', 'Q_PFC');
  const db1 = asc.placeHorizontalDiode('diode', 1440, 192, 'D_B1', 'D_PFC');
  asc.wirePath([lpfc1.right, [1408, 192], q1.drain]);
  asc.wirePath([[1408, 192], db1.anode]);
  asc.wirePath([q1.source, [1408, 528]]);
  asc.flag(1408, 192, 'sw1');
  asc.wirePath([[1328, q1.gate[1]], q1.gate]);
  asc.flag(1328, q1.gate[1], 'gpfc1');

  const vg1 = asc.placeVerticalSource(
    'voltage',
    144,
    736,
    'V_GPFC1',
    'PULSE(0 12 0 10n 10n {TON} {TSW})'
  );
  asc.flag(144, 720, 'gpfc1');
  asc.wirePath([[144, 720], vg1.pos]);
  asc.wirePath([vg1.neg, [144, 848]]);
  asc.gnd(144, 848);

  if (nPh === 2) {
    asc.wirePath([db1.cathode, [1552, 192]]);
    asc.flag(1552, 192, 'v_dc');

    asc.flag(1600, 192, 'v_rect');
    const lpfc2 = asc.placeHorizontalInd(1632, 192, 'L_PFC2', `${state.Lpfc_uH.toFixed(1)}u`, 'Rser=8m');
    asc.wirePath([[1600, 192], lpfc2.left]);
    const q2 = asc.placeMosfet(1776, 368, 'Q_PFC2', 'Q_PFC');
    const db2 = asc.placeHorizontalDiode('diode', 1808, 192, 'D_B2', 'D_PFC');
    asc.wirePath([lpfc2.right, [1776, 192], q2.drain]);
    asc.wirePath([[1776, 192], db2.anode]);
    asc.wirePath([q2.source, [1776, 528]]);
    asc.flag(1776, 192, 'sw2');
    asc.wirePath([[1696, q2.gate[1]], q2.gate]);
    asc.flag(1696, q2.gate[1], 'gpfc2');

    const vg2 = asc.placeVerticalSource(
      'voltage',
      592,
      736,
      'V_GPFC2',
      'PULSE(0 12 {TD2} 10n 10n {TON} {TSW})'
    );
    asc.flag(592, 720, 'gpfc2');
    asc.wirePath([[592, 720], vg2.pos]);
    asc.wirePath([vg2.neg, [592, 848]]);
    asc.gnd(592, 848);

    asc.wirePath([db2.cathode, [2096, 192]]);
  } else {
    asc.wirePath([db1.cathode, [2096, 192]]);
  }

  // 4. DC-Link Capacitor Bank & Load
  asc.flag(2016, 192, 'v_dc');
  const cdc = asc.placeVerticalCap(
    2096,
    320,
    'C_DC',
    `${state.Cdc_uF.toFixed(0)}u`,
    `Rser=${state.ESR_Cdc_mOhm.toFixed(1)}m`
  );
  asc.wirePath([[2096, 192], cdc.top]);
  asc.wirePath([cdc.bot, [2096, 528]]);

  const rload = asc.placeVerticalRes(2288, 320, 'R_LOAD', `${Rload_dc.toFixed(2)}`);
  asc.wirePath([[2096, 192], [2288, 192], rload.top]);
  asc.wirePath([rload.bot, [2288, 528]]);

  // 5B. Directives
  const X_DIR = 1216;
  asc.directive(
    X_DIR,
    696,
    `.param FSW=${fswHz} TSW={1/FSW} TON=${tOn_ns}n TD2=${td2_ns}n VAC_PK=${Vac_pk.toFixed(2)} FLINE=${state.f_line_Hz} VDC_REF=${state.Vdc_bus_V}`
  );
  asc.directive(
    X_DIR,
    744,
    `.model Q_PFC VDMOS(Rg=${(res.sw.Rg_int_Ohm ?? 1.5).toFixed(2)} Vto=3.0 Rd=${(Ron_sw * 0.6).toFixed(5)} Rs=${(Ron_sw * 0.4).toFixed(5)} Cjo=${Coss_pF.toFixed(1)}p Is=1e-10)`
  );
  asc.directive(X_DIR, 792, '.model D_PFC D(Ron=0.015 Roff=1Meg Vfwd=1.1)');
  asc.directive(X_DIR, 840, `.tran 0 40m 20m 200n`);
  asc.directive(X_DIR, 888, `.meas TRAN Vdc_avg AVG V(v_dc) FROM 20m TO 40m`);
  asc.directive(X_DIR, 936, `.meas TRAN Iac_rms RMS I(L_DM) FROM 20m TO 40m`);

  return asc.build();
}
