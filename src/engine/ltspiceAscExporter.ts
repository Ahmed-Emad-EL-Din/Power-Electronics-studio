// ============================================================================
// LTSPICE .ASC SCHEMATIC DIAGRAM EXPORTER
// Generates clean, 16px-grid-aligned, well-organized LTspice Version 4 .asc
// schematics with standard symbols (voltage, res, cap, ind, ind2, nmos,
// schottky, diode, bi, bv), orthogonal wires, net flags, and runnable directives.
// ============================================================================

import { AcDcDesignState, DcDcDesignState } from '../data/databases';
import { AcDcResults } from './acdcEngine';
import { DcDcResults } from './dcdcEngine';

type AscRotation = 'R0' | 'R90' | 'R180' | 'R270' | 'M0' | 'M90' | 'M180' | 'M270';

class AscSchematicBuilder {
  private lines: string[] = [];
  private width: number;
  private height: number;

  constructor(width = 2160, height = 1280) {
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
    this.lines.push(`FLAG ${Math.round(x)} ${Math.round(y)} ${name}`);
  }

  gnd(x: number, y: number) {
    this.flag(x, y, '0');
  }

  comment(x: number, y: number, text: string) {
    this.lines.push(`TEXT ${Math.round(x)} ${Math.round(y)} Left 2 ;${text}`);
  }

  directive(x: number, y: number, spiceLine: string) {
    this.lines.push(`TEXT ${Math.round(x)} ${Math.round(y)} Left 2 !${spiceLine}`);
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
      `SYMATTR InstName ${instName}`,
      `SYMATTR Value ${value}`
    );
    if (extraAttrs) {
      for (const [k, v] of Object.entries(extraAttrs)) {
        this.lines.push(`SYMATTR ${k} ${v}`);
      }
    }
  }

  // Standard 16px-grid pin-exact placement helpers:

  /** Vertical voltage/bi/bv source: + pin at (x, y), - pin at (x, y + 80). */
  placeVerticalSource(sym: 'voltage' | 'bi' | 'bv', x: number, yTop: number, name: string, value: string) {
    // R0 pins: (0, 16) and (0, 96)
    this.symbol(sym, x, yTop - 16, 'R0', name, value);
    return { pos: [x, yTop] as [number, number], neg: [x, yTop + 80] as [number, number] };
  }

  /** Vertical resistor: top pin at (x, y), bottom pin at (x, y + 80). */
  placeVerticalRes(x: number, yTop: number, name: string, value: string) {
    // R0 pins: (16, 16) and (16, 96)
    this.symbol('res', x - 16, yTop - 16, 'R0', name, value);
    return { top: [x, yTop] as [number, number], bot: [x, yTop + 80] as [number, number] };
  }

  /** Horizontal resistor: left pin at (x, y), right pin at (x + 80, y). */
  placeHorizontalRes(xLeft: number, y: number, name: string, value: string) {
    // R270 pins: (16, -16) and (96, -16) -> anchor (xLeft - 16, y + 16)
    this.symbol('res', xLeft - 16, y + 16, 'R270', name, value);
    return { left: [xLeft, y] as [number, number], right: [xLeft + 80, y] as [number, number] };
  }

  /** Vertical capacitor: top pin at (x, y), bottom pin at (x, y + 64). */
  placeVerticalCap(x: number, yTop: number, name: string, value: string, spiceLine?: string) {
    // R0 pins: (16, 0) and (16, 64)
    this.symbol('cap', x - 16, yTop, 'R0', name, value, spiceLine ? { SpiceLine: spiceLine } : undefined);
    return { top: [x, yTop] as [number, number], bot: [x, yTop + 64] as [number, number] };
  }

  /** Horizontal capacitor: left pin at (x, y), right pin at (x + 64, y). */
  placeHorizontalCap(xLeft: number, y: number, name: string, value: string, spiceLine?: string) {
    // R270 pins: (0, -16) and (64, -16) -> anchor (xLeft, y + 16)
    this.symbol('cap', xLeft, y + 16, 'R270', name, value, spiceLine ? { SpiceLine: spiceLine } : undefined);
    return { left: [xLeft, y] as [number, number], right: [xLeft + 64, y] as [number, number] };
  }

  /** Horizontal inductor (ind or ind2): left pin at (x, y), right pin at (x + 80, y). */
  placeHorizontalInd(xLeft: number, y: number, name: string, value: string, spiceLine?: string) {
    // R270 pins: (16, -16) and (96, -16) -> anchor (xLeft - 16, y + 16)
    this.symbol('ind', xLeft - 16, y + 16, 'R270', name, value, spiceLine ? { SpiceLine: spiceLine } : undefined);
    return { left: [xLeft, y] as [number, number], right: [xLeft + 80, y] as [number, number] };
  }

  /** Vertical inductor (ind or ind2): top pin (dot on ind2) at (x, y), bottom pin at (x, y + 80). */
  placeVerticalInd(
    sym: 'ind' | 'ind2',
    x: number,
    yTop: number,
    name: string,
    value: string,
    mirror = false,
    spiceLine?: string
  ) {
    // R0 pins: (16, 16) & (16, 96); M0 pins: (-16, 16) & (-16, 96)
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
    // nmos R0 pins: D=(48,0), G=(0,80), S=(48,96)
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
    // R270 pins: A=(0,-16), K=(64,-16) -> anchor (xAnode, y + 16)
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
    // R180 pins: (-16, 0) & (-16, -64) -> anchor (x + 16, yCathode + 64) puts K at (x, yCathode), A at (x, yCathode + 64)
    this.symbol(sym, x + 16, yCathode + 64, 'R180', name, modelName);
    return { cathode: [x, yCathode] as [number, number], anode: [x, yCathode + 64] as [number, number] };
  }

  build(): string {
    return this.lines.join('\n') + '\n';
  }
}

/**
 * Generates an accurate, well-organized, 16px-grid-aligned LTspice .asc schematic
 * for the active Isolated DC-DC stage (PSFB / LLC-FB / LLC-HB) including
 * Input Bulk, Primary Bridge + Gate Drives, Resonant/Leakage Tank, Transformer,
 * Secondary Rectifier (Center-Tapped / Full-Bridge / Current-Doubler), Output Filter,
 * and Type-II/Type-III Compensator stage.
 */
export function generateDcDcLtspiceAsc(state: DcDcDesignState, res: DcDcResults): string {
  const asc = new AscSchematicBuilder(2240, 1280);

  const fswHz = state.fsw_kHz * 1e3;
  const Tsw = 1 / fswHz;
  const Thalf = Tsw / 2;
  const tDead_ns = Math.max(20, state.deadTime_ns);
  const tOnHalf_ns = Math.max(80, Math.round(Thalf * 1e9 - tDead_ns));
  const Tsw_ns = Math.round(Tsw * 1e9);
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

  // Header & Zone Banners
  asc.comment(64, 32, `VoltCraft Power Electronics Studio — ${state.topology.toUpperCase()} (${state.presetName})`);
  asc.comment(
    64,
    60,
    `Vin=${state.Vin_nom_V}V (${state.Vin_min_V}..${state.Vin_max_V}V) -> Vout=${state.Vout_V}V @ ${state.Pout_W}W | fsw=${state.fsw_kHz}kHz | Core=${res.core.name} (${res.Np_actual}:${res.Ns_actual}T)`
  );

  // Subtle Zone Guide Frames
  asc.graphicRect(64, 112, 288, 592);
  asc.comment(80, 120, '1. INPUT BUS');

  asc.graphicRect(304, 112, 816, 592);
  asc.comment(320, 120, `2. PRIMARY ${state.topology === 'llc-hb' ? 'HALF-BRIDGE' : 'FULL-BRIDGE'} & GATE DRIVES`);

  asc.graphicRect(832, 112, 1296, 592);
  asc.comment(848, 120, '3. TANK & TRANSFORMER');

  asc.graphicRect(1312, 112, 2064, 592);
  asc.comment(1328, 120, `4. ${state.txType.toUpperCase()} RECTIFIER, OUTPUT FILTER & LOAD`);

  asc.graphicRect(64, 624, 1024, 960);
  asc.comment(
    80,
    632,
    `5. CONTROL & COMPENSATOR (${state.controlType.toUpperCase()} · ${res.type2Architecture === 'ota' ? `OTA gm=${res.ota_gm_mS.toFixed(2)}mS` : 'Op-Amp'})`
  );

  // --------------------------------------------------------------------------
  // ZONE 1: INPUT DC SOURCE & BULK CAPACITOR
  // --------------------------------------------------------------------------
  const Y_BUS_TOP = 160;
  const Y_BUS_BOT = 544;

  const vinSrc = asc.placeVerticalSource('voltage', 128, 304, 'V_IN', '{VIN}');
  asc.wirePath([vinSrc.pos, [128, Y_BUS_TOP]]);
  asc.wirePath([vinSrc.neg, [128, Y_BUS_BOT]]);
  asc.gnd(128, Y_BUS_BOT);
  asc.flag(128, Y_BUS_TOP, 'vin_pos');

  const cin = asc.placeVerticalCap(240, 320, 'C_IN', '47u', 'Rser=5m');
  asc.wirePath([[128, Y_BUS_TOP], [240, Y_BUS_TOP], cin.top]);
  asc.wirePath([[128, Y_BUS_BOT], [240, Y_BUS_BOT], cin.bot]);

  // --------------------------------------------------------------------------
  // ZONE 2: PRIMARY BRIDGE LEGS (LEG A @ X=464, LEG B @ X=736)
  // --------------------------------------------------------------------------
  const X_LEG_A = 464;
  const X_LEG_B = 736;
  const Y_MID = 352;

  asc.wirePath([[240, Y_BUS_TOP], [X_LEG_A, Y_BUS_TOP]]);
  asc.wirePath([[240, Y_BUS_BOT], [X_LEG_A, Y_BUS_BOT]]);

  // Leg A: Q1 (high) + Q2 (low)
  const q1 = asc.placeMosfet(X_LEG_A, 208, 'Q1', 'Q_PRI');
  asc.wirePath([[X_LEG_A, Y_BUS_TOP], q1.drain]);
  asc.wirePath([q1.source, [X_LEG_A, Y_MID]]);
  const vg1 = asc.placeVerticalSource(
    'voltage',
    352,
    256,
    'V_G1',
    `PULSE(0 12 0 10n 10n ${tOnHalf_ns}n ${Tsw_ns}n)`
  );
  asc.wirePath([vg1.pos, [352, q1.gate[1]], q1.gate]);
  asc.wirePath([vg1.neg, [352, Y_MID], [X_LEG_A, Y_MID]]);

  const q2 = asc.placeMosfet(X_LEG_A, 400, 'Q2', 'Q_PRI');
  asc.wirePath([[X_LEG_A, Y_MID], q2.drain]);
  asc.wirePath([q2.source, [X_LEG_A, Y_BUS_BOT]]);
  const vg2 = asc.placeVerticalSource(
    'voltage',
    352,
    448,
    'V_G2',
    `PULSE(0 12 ${Math.round(Thalf * 1e9)}n 10n 10n ${tOnHalf_ns}n ${Tsw_ns}n)`
  );
  asc.wirePath([vg2.pos, [352, q2.gate[1]], q2.gate]);
  asc.wirePath([vg2.neg, [352, Y_BUS_BOT], [X_LEG_A, Y_BUS_BOT]]);
  asc.wirePath([[X_LEG_A, Y_MID], [512, Y_MID]]);
  asc.flag(512, Y_MID, 'sw_a');

  // Leg B: Q3 + Q4 OR Split Half-Bridge Capacitors
  asc.wirePath([[X_LEG_A, Y_BUS_TOP], [X_LEG_B, Y_BUS_TOP]]);
  asc.wirePath([[X_LEG_A, Y_BUS_BOT], [X_LEG_B, Y_BUS_BOT]]);

  if (state.topology === 'llc-hb') {
    const chbTop = asc.placeVerticalCap(X_LEG_B, 224, 'C_HB_TOP', '22u');
    const chbBot = asc.placeVerticalCap(X_LEG_B, 416, 'C_HB_BOT', '22u');
    asc.wirePath([[X_LEG_B, Y_BUS_TOP], chbTop.top]);
    asc.wirePath([chbTop.bot, [X_LEG_B, Y_MID], chbBot.top]);
    asc.wirePath([chbBot.bot, [X_LEG_B, Y_BUS_BOT]]);
  } else {
    const tShiftA = res.isLLC ? Math.round(Thalf * 1e9) : phaseShift_ns;
    const tShiftB = res.isLLC ? 0 : Math.round((phaseShift_ns + Thalf * 1e9) % Tsw_ns);

    const q3 = asc.placeMosfet(X_LEG_B, 208, 'Q3', 'Q_PRI');
    asc.wirePath([[X_LEG_B, Y_BUS_TOP], q3.drain]);
    asc.wirePath([q3.source, [X_LEG_B, Y_MID]]);
    const vg3 = asc.placeVerticalSource(
      'voltage',
      624,
      256,
      'V_G3',
      `PULSE(0 12 ${tShiftA}n 10n 10n ${tOnHalf_ns}n ${Tsw_ns}n)`
    );
    asc.wirePath([vg3.pos, [624, q3.gate[1]], q3.gate]);
    asc.wirePath([vg3.neg, [624, Y_MID], [X_LEG_B, Y_MID]]);

    const q4 = asc.placeMosfet(X_LEG_B, 400, 'Q4', 'Q_PRI');
    asc.wirePath([[X_LEG_B, Y_MID], q4.drain]);
    asc.wirePath([q4.source, [X_LEG_B, Y_BUS_BOT]]);
    const vg4 = asc.placeVerticalSource(
      'voltage',
      624,
      448,
      'V_G4',
      `PULSE(0 12 ${tShiftB}n 10n 10n ${tOnHalf_ns}n ${Tsw_ns}n)`
    );
    asc.wirePath([vg4.pos, [624, q4.gate[1]], q4.gate]);
    asc.wirePath([vg4.neg, [624, Y_BUS_BOT], [X_LEG_B, Y_BUS_BOT]]);
  }
  asc.wirePath([[X_LEG_B, Y_MID], [784, Y_MID]]);
  asc.flag(784, Y_MID, 'sw_b');

  // --------------------------------------------------------------------------
  // ZONE 3: LEAKAGE / RESONANT TANK & ISOLATION TRANSFORMER
  // --------------------------------------------------------------------------
  const Y_TANK_TOP = 288;
  const Y_TANK_BOT = 432;
  asc.flag(864, Y_TANK_TOP, 'sw_a');
  asc.flag(864, Y_TANK_BOT, 'sw_b');

  const llk = asc.placeHorizontalInd(896, Y_TANK_TOP, 'L_LK', `${state.Llk_uH.toFixed(2)}u`, 'Rser=4m');
  asc.wirePath([[864, Y_TANK_TOP], llk.left]);

  const cres = asc.placeHorizontalCap(
    1008,
    Y_TANK_TOP,
    res.isLLC ? 'C_RES' : 'C_BLK',
    res.isLLC ? `${state.Cr_nF.toFixed(1)}n` : '4.7u'
  );
  asc.wirePath([llk.right, cres.left]);
  asc.flag(992, Y_TANK_TOP, 'pri_lk');

  const X_TX_PRI = 1136;
  const X_TX_SEC = 1216;
  const lpri = asc.placeVerticalInd(
    'ind2',
    X_TX_PRI,
    320,
    'L_PRI',
    `${Lpri_uH.toFixed(2)}u`,
    false,
    `Rser=${Math.max(0.002, res.Rpri_ac_mOhm * 1e-3).toFixed(4)}`
  );
  asc.wirePath([cres.right, [X_TX_PRI, Y_TANK_TOP], lpri.top]);
  asc.flag(1104, Y_TANK_TOP, 'pri_hot');
  asc.wirePath([lpri.bot, [X_TX_PRI, Y_TANK_BOT], [864, Y_TANK_BOT]]);

  // Transformer core parallel bars
  asc.graphicLine(1168, 288, 1168, 432);
  asc.graphicLine(1180, 288, 1180, 432);

  if (state.txType === 'center-tapped') {
    const lsec1 = asc.placeVerticalInd('ind2', X_TX_SEC, 256, 'L_SEC1', `${Lsec_uH.toFixed(3)}u`, true);
    const lsec2 = asc.placeVerticalInd('ind2', X_TX_SEC, 368, 'L_SEC2', `${Lsec_uH.toFixed(3)}u`, true);
    asc.wirePath([lsec1.top, [1280, 256]]);
    asc.flag(1280, 256, 'sec_p');
    asc.wirePath([lsec1.bot, lsec2.top]);
    asc.wirePath([[X_TX_SEC, 352], [1280, 352]]);
    asc.flag(1280, 352, 'sec_ct');
    asc.wirePath([lsec2.bot, [1280, 448]]);
    asc.flag(1280, 448, 'sec_n');
    asc.directive(1120, 480, 'K_TX L_PRI L_SEC1 L_SEC2 0.9995');
  } else {
    const lsec = asc.placeVerticalInd('ind2', X_TX_SEC, 320, 'L_SEC1', `${Lsec_uH.toFixed(3)}u`, true);
    asc.wirePath([lsec.top, [1280, 320]]);
    asc.flag(1280, 320, 'sec_p');
    asc.wirePath([lsec.bot, [1280, 400]]);
    asc.flag(1280, 400, 'sec_n');
    asc.directive(1120, 480, 'K_TX L_PRI L_SEC1 0.9995');
  }

  // --------------------------------------------------------------------------
  // ZONE 4: SECONDARY RECTIFIER, OUTPUT LC FILTER & LOAD
  // --------------------------------------------------------------------------
  const Y_OUT_RAIL = 256;
  const Y_SEC_GND = 544;

  if (state.txType === 'center-tapped') {
    // Center-tapped rectifiers: D_SR1 from GND -> sec_p, D_SR2 from GND -> sec_n; sec_ct -> L_OUT
    asc.flag(1360, 256, 'sec_p');
    asc.flag(1360, 448, 'sec_n');
    const d1 = asc.placeVerticalDiodeUp('schottky', 1424, 256, 'D_SR1', 'D_SEC');
    const d2 = asc.placeVerticalDiodeUp('schottky', 1424, 448, 'D_SR2', 'D_SEC');
    asc.wirePath([[1360, 256], d1.cathode]);
    asc.wirePath([[1360, 448], d2.cathode]);
    asc.wirePath([d1.anode, [1472, 320], [1472, Y_SEC_GND]]);
    asc.wirePath([d2.anode, [1424, Y_SEC_GND], [1472, Y_SEC_GND]]);
    asc.gnd(1472, Y_SEC_GND);

    asc.flag(1536, Y_OUT_RAIL, 'sec_ct');
    const lout = asc.placeHorizontalInd(1584, Y_OUT_RAIL, 'L_OUT', `${state.Lo_uH.toFixed(2)}u`, 'Rser=1.5m');
    asc.wirePath([[1536, Y_OUT_RAIL], lout.left]);
    asc.wirePath([lout.right, [1888, Y_OUT_RAIL]]);
    asc.flag(1744, Y_OUT_RAIL, 'v_out');
  } else if (state.txType === 'current-doubler') {
    // Current doubler: L_O1 from sec_p -> v_out, L_O2 from sec_n -> v_out; D_SR1 GND->sec_p, D_SR2 GND->sec_n
    asc.flag(1360, 256, 'sec_p');
    asc.flag(1360, 400, 'sec_n');
    const d1 = asc.placeVerticalDiodeUp('schottky', 1440, 256, 'D_SR1', 'D_SEC');
    const d2 = asc.placeVerticalDiodeUp('schottky', 1440, 400, 'D_SR2', 'D_SEC');
    asc.wirePath([[1360, 256], d1.cathode]);
    asc.wirePath([[1360, 400], d2.cathode]);
    asc.wirePath([d1.anode, [1488, 320], [1488, Y_SEC_GND]]);
    asc.wirePath([d2.anode, [1440, Y_SEC_GND], [1488, Y_SEC_GND]]);
    asc.gnd(1488, Y_SEC_GND);

    const lo1 = asc.placeHorizontalInd(1552, 256, 'L_OUT1', `${state.Lo_uH.toFixed(2)}u`, 'Rser=1.5m');
    const lo2 = asc.placeHorizontalInd(1552, 400, 'L_OUT2', `${state.Lo_uH.toFixed(2)}u`, 'Rser=1.5m');
    asc.wirePath([[1440, 256], lo1.left]);
    asc.wirePath([[1440, 400], lo2.left]);
    asc.wirePath([lo1.right, [1712, Y_OUT_RAIL], [1888, Y_OUT_RAIL]]);
    asc.wirePath([lo2.right, [1712, 400], [1712, Y_OUT_RAIL]]);
    asc.flag(1744, Y_OUT_RAIL, 'v_out');
  } else {
    // Full-bridge rectifier (clean non-crossing flag entry for sec_p and sec_n)
    asc.flag(1360, 352, 'sec_p');
    asc.flag(1456, 368, 'sec_n');
    const d1 = asc.placeVerticalDiodeUp('schottky', 1424, 256, 'D_SR1', 'D_SEC');
    const d2 = asc.placeVerticalDiodeUp('schottky', 1424, 416, 'D_SR2', 'D_SEC');
    const d3 = asc.placeVerticalDiodeUp('schottky', 1520, 256, 'D_SR3', 'D_SEC');
    const d4 = asc.placeVerticalDiodeUp('schottky', 1520, 416, 'D_SR4', 'D_SEC');

    asc.wirePath([d1.cathode, d3.cathode, [1568, Y_OUT_RAIL]]);
    asc.wirePath([[1360, 352], [1424, 352]]);
    asc.wirePath([d1.anode, d2.cathode]);
    asc.wirePath([[1456, 368], [1520, 368]]);
    asc.wirePath([d3.anode, d4.cathode]);
    asc.wirePath([d2.anode, [1424, Y_SEC_GND], [1520, Y_SEC_GND], d4.anode]);
    asc.gnd(1472, Y_SEC_GND);

    const lout = asc.placeHorizontalInd(1584, Y_OUT_RAIL, 'L_OUT', `${state.Lo_uH.toFixed(2)}u`, 'Rser=1.5m');
    asc.wirePath([[1568, Y_OUT_RAIL], lout.left]);
    asc.wirePath([lout.right, [1888, Y_OUT_RAIL]]);
    asc.flag(1744, Y_OUT_RAIL, 'v_out');
  }

  // Output Capacitor Bank & Load Resistor
  const cout = asc.placeVerticalCap(
    1792,
    336,
    'C_OUT',
    `${state.Co_uF.toFixed(1)}u`,
    `Rser=${state.ESR_Co_mOhm.toFixed(2)}m`
  );
  asc.wirePath([[1792, Y_OUT_RAIL], cout.top]);
  asc.wirePath([cout.bot, [1792, Y_SEC_GND]]);
  asc.gnd(1792, Y_SEC_GND);

  const rload = asc.placeVerticalRes(1920, 336, 'R_LOAD', `${Rload_Ohm.toFixed(3)}`);
  asc.wirePath([[1888, Y_OUT_RAIL], [1920, Y_OUT_RAIL], rload.top]);
  asc.wirePath([rload.bot, [1920, Y_SEC_GND]]);
  asc.gnd(1920, Y_SEC_GND);

  // --------------------------------------------------------------------------
  // ZONE 5: COMPENSATOR & FEEDBACK SUBCIRCUIT (TYPE-II OP-AMP / OTA / TYPE-III)
  // --------------------------------------------------------------------------
  const isOta = !res.isTwoZeroComp && res.type2Architecture === 'ota';
  if (isOta) {
    asc.flag(128, 688, 'v_out');
    const rTop = asc.placeVerticalRes(128, 720, 'R_FB_TOP', `${res.R1_ota_kOhm.toFixed(2)}k`);
    const rBot = asc.placeVerticalRes(128, 832, 'R_FB_BOT', `${res.R4_ota_kOhm.toFixed(2)}k`);
    asc.wirePath([[128, 688], rTop.top]);
    asc.wirePath([rTop.bot, rBot.top]);
    asc.wirePath([[128, 816], [224, 816]]);
    asc.flag(224, 816, 'fb_node');
    asc.gnd(128, rBot.bot[1]);

    const vref = asc.placeVerticalSource('voltage', 320, 768, 'V_REF', '1.25');
    asc.flag(320, 752, 'ref_node');
    asc.wirePath([vref.pos, [320, 752]]);
    asc.gnd(vref.neg[0], vref.neg[1]);

    const gmS = (res.ota_gm_mS * 1e-3).toFixed(5);
    const bOta = asc.placeVerticalSource('bi', 480, 752, 'B_OTA', `I=${gmS}*(V(ref_node)-V(fb_node))`);
    asc.wirePath([[480, 720], bOta.pos]);
    asc.flag(480, 720, 'comp_node');
    asc.gnd(bOta.neg[0], bOta.neg[1]);

    const rComp = asc.placeVerticalRes(640, 736, 'R_OTA_Z', `${res.R2_ota_kOhm.toFixed(2)}k`);
    const c1 = asc.placeVerticalCap(640, 848, 'C_OTA_1', `${res.C1_ota_e24_nF.toFixed(2)}n`);
    asc.wirePath([[480, 720], [640, 720], rComp.top]);
    asc.wirePath([rComp.bot, c1.top]);
    asc.gnd(c1.bot[0], c1.bot[1]);

    const c2 = asc.placeVerticalCap(816, 768, 'C_OTA_2', `${res.C2_ota_e24_pF.toFixed(0)}p`);
    asc.wirePath([[640, 720], [816, 720], c2.top]);
    asc.gnd(c2.bot[0], c2.bot[1]);
  } else {
    asc.flag(128, 768, 'v_out');
    const r1 = asc.placeHorizontalRes(160, 768, 'R_COMP_1', `${res.R1_kOhm.toFixed(2)}k`);
    asc.wirePath([[128, 768], r1.left]);
    asc.flag(256, 768, 'fb_node');
    const rBot = asc.placeVerticalRes(256, 800, 'R_FB_BOT', `${res.R1_kOhm.toFixed(2)}k`);
    asc.wirePath([[256, 768], rBot.top]);
    asc.gnd(rBot.bot[0], rBot.bot[1]);

    const r2 = asc.placeHorizontalRes(304, 704, 'R_COMP_2', `${res.R2_kOhm.toFixed(2)}k`);
    const c1 = asc.placeHorizontalCap(416, 704, 'C_COMP_1', `${res.C1_e24_nF.toFixed(2)}n`);
    const c2 = asc.placeHorizontalCap(368, 832, 'C_COMP_2', `${res.C2_e24_pF.toFixed(0)}p`);

    asc.wirePath([r1.right, [272, 768], [272, 704], r2.left]);
    asc.wirePath([r2.right, c1.left]);
    asc.wirePath([[272, 768], [272, 832], c2.left]);
    asc.wirePath([c1.right, [512, 704], [512, 768]]);
    asc.wirePath([c2.right, [512, 832], [512, 768]]);
    asc.flag(512, 768, 'comp_node');

    const vref = asc.placeVerticalSource('voltage', 640, 768, 'V_REF', `${(state.Vout_V * 0.5).toFixed(3)}`);
    asc.flag(640, 752, 'ref_node');
    asc.wirePath([vref.pos, [640, 752]]);
    asc.gnd(vref.neg[0], vref.neg[1]);

    const bErr = asc.placeVerticalSource(
      'bv',
      800,
      768,
      'B_ERR',
      'V=limit(100k*(V(ref_node)-V(fb_node)),0,5)'
    );
    asc.flag(800, 752, 'comp_node');
    asc.wirePath([[800, 752], bErr.pos]);
    asc.gnd(bErr.neg[0], bErr.neg[1]);
  }

  // --------------------------------------------------------------------------
  // ZONE 6: SPICE PARAMETERS, DEVICE MODELS & SIMULATION COMMANDS
  // --------------------------------------------------------------------------
  const X_DIR = 1088;
  asc.comment(X_DIR, 632, '6. SPICE PARAMETERS, SEMICONDUCTOR MODELS & SIMULATION DIRECTIVES');
  asc.directive(
    X_DIR,
    664,
    `.param FSW=${fswHz} TSW={1/FSW} VIN=${state.Vin_nom_V} VOUT_REF=${state.Vout_V}`
  );
  asc.directive(
    X_DIR,
    696,
    `.model Q_PRI VDMOS(Rg=${(res.priDevice.Rg_int_Ohm ?? 1.5).toFixed(2)} Vto=3.0 Rd=${(Ron_pri * 0.6).toFixed(5)} Rs=${(Ron_pri * 0.4).toFixed(5)} Cgdmax=${Math.max(5, Math.round(Coss_pri_pF * 0.25))}p Cgdmin=5p Cgs=${Math.max(50, Math.round(res.priDevice.Qg_nC * 40))}p Cjo=${Coss_pri_pF.toFixed(1)}p Is=1e-10)`
  );
  asc.directive(
    X_DIR,
    728,
    `.model D_SEC D(Ron=${Ron_sec.toFixed(5)} Roff=1Meg Vfwd=${state.rectMode === 'schottky-diode' ? res.secDevice.Vsd_V.toFixed(2) : '0.45'})`
  );
  asc.directive(X_DIR, 760, `.tran 0 ${tStop_us}u ${(tStop_us * 0.6).toFixed(0)}u 20n`);
  asc.directive(
    X_DIR,
    792,
    `.meas TRAN Vout_avg AVG V(v_out) FROM ${(tStop_us * 0.7).toFixed(0)}u TO ${tStop_us}u`
  );
  asc.directive(
    X_DIR,
    824,
    `.meas TRAN Vout_pp PP V(v_out) FROM ${(tStop_us * 0.7).toFixed(0)}u TO ${tStop_us}u`
  );
  asc.directive(
    X_DIR,
    856,
    `.meas TRAN Ipri_rms RMS I(L_LK) FROM ${(tStop_us * 0.7).toFixed(0)}u TO ${tStop_us}u`
  );
  asc.comment(
    X_DIR,
    896,
    `PCMC Slope Se=${res.Se_ramp_V_us.toFixed(3)} V/us · mc=${res.mc_slope.toFixed(2)} · Qp(wc)=${res.Qp_subharmonic_wc.toFixed(2)}`
  );

  return asc.build();
}

/**
 * Generates an accurate, well-organized, 16px-grid-aligned LTspice .asc schematic
 * for the active AC-DC PFC Front-End stage (1-Phase / 2-Phase Interleaved).
 */
export function generateAcDcLtspiceAsc(state: AcDcDesignState, res: AcDcResults): string {
  const asc = new AscSchematicBuilder(2080, 1080);

  const Vac_pk = state.Vac_rms_V * Math.SQRT2;
  const fswHz = state.fsw_kHz * 1e3;
  const Tsw_ns = Math.round((1 / fswHz) * 1e9);
  const tOn_ns = Math.round(Tsw_ns * 0.45);
  const Ron_sw = Math.max(0.005, res.sw.Rds_on_25C_mOhm * 1.45 * 1e-3);
  const Coss_pF = Math.max(15, res.sw.Coss_er_pF);
  const Rload_dc = (state.Vdc_bus_V * state.Vdc_bus_V) / Math.max(10, state.Pout_W);
  const nPh = res.nPhases;

  asc.comment(64, 32, `VoltCraft Power Electronics Studio — AC-DC PFC (${state.topology})`);
  asc.comment(
    64,
    60,
    `Vac=${state.Vac_rms_V}Vrms @ ${state.f_line_Hz}Hz -> Vdc=${state.Vdc_bus_V}V @ ${state.Pout_W}W | fsw=${state.fsw_kHz}kHz | Switch=${res.sw.name}`
  );

  asc.graphicRect(64, 112, 576, 560);
  asc.comment(80, 120, '1. AC MAINS & DM EMI FILTER');

  asc.graphicRect(592, 112, 1024, 560);
  asc.comment(608, 120, '2. INPUT BRIDGE RECTIFIER');

  asc.graphicRect(1040, 112, 1664, 560);
  asc.comment(1056, 120, `3. ${nPh}-PHASE BOOST STAGE`);

  asc.graphicRect(1680, 112, 2048, 560);
  asc.comment(1696, 120, '4. DC-LINK BULK & LOAD');

  const Y_TOP = 240;
  const Y_AC_N = 400;

  // 1. AC Mains + EMI Filter
  const vac = asc.placeVerticalSource('voltage', 128, 304, 'V_AC', 'SIN(0 {VAC_PK} {FLINE})');
  asc.wirePath([vac.pos, [128, Y_TOP]]);
  asc.wirePath([vac.neg, [128, Y_AC_N]]);
  asc.flag(128, Y_AC_N, 'ac_n');

  const ldm = asc.placeHorizontalInd(176, Y_TOP, 'L_DM', `${res.Ldm_uH.toFixed(1)}u`, 'Rser=5m');
  asc.wirePath([[128, Y_TOP], ldm.left]);
  asc.flag(288, Y_TOP, 'ac_dm');

  const cx = asc.placeVerticalCap(320, 304, 'C_X', `${res.Cx_each_uF.toFixed(2)}u`);
  asc.wirePath([ldm.right, [320, Y_TOP], cx.top]);
  asc.wirePath([cx.bot, [320, Y_AC_N]]);
  asc.flag(320, Y_AC_N, 'ac_n');

  const rpre = asc.placeHorizontalRes(384, Y_TOP, 'R_PRE', `${state.prechargeR_Ohm ?? 22}`);
  asc.wirePath([[320, Y_TOP], rpre.left]);
  asc.wirePath([rpre.right, [688, Y_TOP]]);
  asc.flag(544, Y_TOP, 'ac_bus');

  // 2. Diode Bridge (clean non-crossing flag entry for ac_n)
  const dr1 = asc.placeVerticalDiodeUp('diode', 688, 176, 'D_R1', 'D_PFC');
  const dr2 = asc.placeVerticalDiodeUp('diode', 688, 368, 'D_R2', 'D_PFC');
  const dr3 = asc.placeVerticalDiodeUp('diode', 848, 176, 'D_R3', 'D_PFC');
  const dr4 = asc.placeVerticalDiodeUp('diode', 848, 368, 'D_R4', 'D_PFC');

  asc.wirePath([[688, Y_TOP], dr1.anode, dr2.cathode]);
  asc.flag(784, 304, 'ac_n');
  asc.wirePath([[784, 304], [848, 304]]);
  asc.wirePath([dr3.anode, dr4.cathode]);
  asc.wirePath([dr1.cathode, dr3.cathode, [1088, 176]]);
  asc.flag(976, 176, 'v_rect');
  asc.wirePath([dr2.anode, [688, 496], [848, 496], dr4.anode]);
  asc.wirePath([[848, 496], [1968, 496]]);
  asc.gnd(800, 496);

  // 3. 1-Phase or 2-Phase Interleaved Boost Stage (Side-by-Side Zero-Crossing Layout)
  const lpfc1 = asc.placeHorizontalInd(1088, 176, 'L_PFC1', `${state.Lpfc_uH.toFixed(1)}u`, 'Rser=8m');
  const q1 = asc.placeMosfet(1216, 336, 'Q_PFC1', 'Q_PFC');
  const db1 = asc.placeHorizontalDiode('diode', 1248, 176, 'D_B1', 'D_PFC');
  asc.wirePath([lpfc1.right, [1216, 176], q1.drain]);
  asc.wirePath([[1216, 176], db1.anode]);
  asc.wirePath([q1.source, [1216, 496]]);
  asc.flag(1216, 176, 'sw1');

  const vg1 = asc.placeVerticalSource(
    'voltage',
    1120,
    384,
    'V_GPFC1',
    `PULSE(0 12 0 10n 10n ${tOn_ns}n ${Tsw_ns}n)`
  );
  asc.wirePath([vg1.pos, [1120, q1.gate[1]], q1.gate]);
  asc.wirePath([vg1.neg, [1120, 496]]);

  if (nPh === 2) {
    asc.wirePath([db1.cathode, [1344, 176]]);
    asc.flag(1344, 176, 'v_dc');

    asc.flag(1376, 176, 'v_rect');
    const lpfc2 = asc.placeHorizontalInd(1408, 176, 'L_PFC2', `${state.Lpfc_uH.toFixed(1)}u`, 'Rser=8m');
    asc.wirePath([[1376, 176], lpfc2.left]);
    const q2 = asc.placeMosfet(1536, 336, 'Q_PFC2', 'Q_PFC');
    const db2 = asc.placeHorizontalDiode('diode', 1568, 176, 'D_B2', 'D_PFC');
    asc.wirePath([lpfc2.right, [1536, 176], q2.drain]);
    asc.wirePath([[1536, 176], db2.anode]);
    asc.wirePath([q2.source, [1536, 496]]);
    asc.flag(1536, 176, 'sw2');

    const vg2 = asc.placeVerticalSource(
      'voltage',
      1440,
      384,
      'V_GPFC2',
      `PULSE(0 12 ${Math.round(Tsw_ns * 0.5)}n 10n 10n ${tOn_ns}n ${Tsw_ns}n)`
    );
    asc.wirePath([vg2.pos, [1440, q2.gate[1]], q2.gate]);
    asc.wirePath([vg2.neg, [1440, 496]]);

    asc.wirePath([db2.cathode, [1792, 176]]);
  } else {
    asc.wirePath([db1.cathode, [1792, 176]]);
  }

  // 4. DC-Link Capacitor Bank & Load
  asc.flag(1712, 176, 'v_dc');
  const cdc = asc.placeVerticalCap(
    1792,
    288,
    'C_DC',
    `${state.Cdc_uF.toFixed(0)}u`,
    `Rser=${state.ESR_Cdc_mOhm.toFixed(1)}m`
  );
  asc.wirePath([[1792, 176], cdc.top]);
  asc.wirePath([cdc.bot, [1792, 496]]);

  const rload = asc.placeVerticalRes(1968, 288, 'R_LOAD', `${Rload_dc.toFixed(2)}`);
  asc.wirePath([[1792, 176], [1968, 176], rload.top]);
  asc.wirePath([rload.bot, [1968, 496]]);

  // Directives
  asc.comment(64, 608, '5. SPICE PARAMETERS, MODELS & SIMULATION DIRECTIVES');
  asc.directive(64, 640, `.param FSW=${fswHz} VAC_PK=${Vac_pk.toFixed(1)} FLINE=${state.f_line_Hz}`);
  asc.directive(
    64,
    672,
    `.model Q_PFC VDMOS(Rg=${(res.sw.Rg_int_Ohm ?? 1.5).toFixed(2)} Vto=3.0 Rd=${(Ron_sw * 0.6).toFixed(5)} Rs=${(Ron_sw * 0.4).toFixed(5)} Cjo=${Coss_pF.toFixed(1)}p Is=1e-10)`
  );
  asc.directive(64, 704, `.model D_PFC D(Ron=${Ron_sw.toFixed(5)} Roff=1Meg Vfwd=0.9)`);
  asc.directive(64, 736, `.tran 0 ${((2 / state.f_line_Hz) * 1e3).toFixed(1)}m 0 1u`);
  asc.directive(64, 768, '.meas TRAN Vdc_avg AVG V(v_dc)');
  asc.directive(64, 800, '.meas TRAN Vdc_pp PP V(v_dc)');

  return asc.build();
}
