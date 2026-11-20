// ============================================================================
// PLEXIM PLECS STANDALONE (.plecs) SIMULATION & ZIP BUNDLE EXPORTER
// Generates complete, runnable PLECS Standalone schematics (.plecs) with:
//   - Multi-branch Hybrid Capacitor Banks (Cin, Cout, Cdc: R_esr + L_esl + C)
//   - Power Semiconductor Switches (MOSFET + anti-parallel body Diode)
//   - Magnetics (Transformer Np:Ns + Lm, L_lk / L_r, L_o / L_pfc)
//   - Closed-Loop s-domain TransferFcn Compensator (Type-II / Type-III / 2P2Z)
//   - Inline Octave InitializationCommands + init_params.m +
//     hybrid_cap_verification.m + thermal_descriptions.xml + README_PLECS.txt
// ============================================================================

import { AcDcDesignState, DcDcDesignState } from '../data/databases';
import { AcDcResults } from './acdcEngine';
import { DcDcResults } from './dcdcEngine';
import {
  SpiceCapUnitDescriptor,
  expandHybridCapBankForSpice,
  getDefaultHybridCapBank,
  solveHybridCapBank,
} from './passiveDesignEngine';
import { ZipEntry, buildZipArchive } from './zipBuilder';

export interface PlecsBundle {
  baseName: string;
  plecsText: string;
  initScriptText: string;
  capVerifyScriptText: string;
  thermalXmlText: string;
  readmeText: string;
  zipBytes: Uint8Array;
}

interface PlecsBlockSpec {
  blockType: string;
  name: string;
  x: number;
  y: number;
  direction?: 'up' | 'down' | 'left' | 'right';
  flipped?: 'on' | 'off';
  params?: { variable: string; value: string; show?: 'on' | 'off' }[];
}

interface PlecsConnSpec {
  srcBlock: string;
  srcTerminal: number;
  dstBlock: string;
  dstTerminal: number;
  type?: 'Wire' | 'Signal';
}

function fmtParam(variable: string, value: string, show: 'on' | 'off' = 'on'): string {
  return [
    '      Parameter {',
    `        Variable      "${variable}"`,
    `        Value         "${value}"`,
    `        Show          ${show}`,
    '      }',
  ].join('\n');
}

function renderPlecsBlock(b: PlecsBlockSpec): string {
  const lines = [
    '    Block {',
    `      BlockType     ${b.blockType}`,
    `      Name          "${b.name}"`,
    `      Position      [${Math.round(b.x)}, ${Math.round(b.y)}]`,
    `      Direction     ${b.direction ?? 'right'}`,
    `      Flipped       ${b.flipped ?? 'off'}`,
  ];
  for (const p of b.params ?? []) {
    lines.push(fmtParam(p.variable, p.value, p.show ?? 'on'));
  }
  lines.push('    }');
  return lines.join('\n');
}

function renderPlecsConn(c: PlecsConnSpec): string {
  return [
    '    Connection {',
    `      Type          ${c.type ?? 'Wire'}`,
    `      SrcBlock      "${c.srcBlock}"`,
    `      SrcTerminal   ${c.srcTerminal}`,
    `      DstBlock      "${c.dstBlock}"`,
    `      DstTerminal   ${c.dstTerminal}`,
    '    }',
  ].join('\n');
}

function sanitizePlecsIdent(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_]/g, '_');
}

function buildThermalXml(entries: {
  name: string;
  manufacturer: string;
  vdsMax: number;
  rds25_Ohm: number;
  eon_mJ: number;
  eoff_mJ: number;
  rthJc_CW: number;
}[]): string {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<ThermalLibrary xmlns="http://www.plexim.com/xml/thermal/1.0" version="1.0">',
  ];
  for (const e of entries) {
    lines.push(
      `  <Semiconductor name="${e.name}" manufacturer="${e.manufacturer}" type="MOSFET">`,
      `    <ConductionLoss>`,
      `      <CurrentAxis>0 10 25 50 100</CurrentAxis>`,
      `      <TemperatureAxis>25 125</TemperatureAxis>`,
      `      <VoltageDrop>`,
      `        <Row>0 ${(10 * e.rds25_Ohm).toFixed(4)} ${(25 * e.rds25_Ohm).toFixed(4)} ${(50 * e.rds25_Ohm).toFixed(4)} ${(100 * e.rds25_Ohm).toFixed(4)}</Row>`,
      `        <Row>0 ${(10 * e.rds25_Ohm * 1.45).toFixed(4)} ${(25 * e.rds25_Ohm * 1.45).toFixed(4)} ${(50 * e.rds25_Ohm * 1.45).toFixed(4)} ${(100 * e.rds25_Ohm * 1.45).toFixed(4)}</Row>`,
      `      </VoltageDrop>`,
      `    </ConductionLoss>`,
      `    <TurnOnLoss>`,
      `      <VoltageAxis>0 ${(e.vdsMax * 0.5).toFixed(0)} ${e.vdsMax.toFixed(0)}</VoltageAxis>`,
      `      <CurrentAxis>0 20 50</CurrentAxis>`,
      `      <TemperatureAxis>25 125</TemperatureAxis>`,
      `      <Energy>`,
      `        <Slice temp="25">`,
      `          <Row>0 0 0</Row>`,
      `          <Row>0 ${(e.eon_mJ * 0.5 * 1e-3).toFixed(6)} ${(e.eon_mJ * 1.1 * 1e-3).toFixed(6)}</Row>`,
      `          <Row>0 ${(e.eon_mJ * 1.0 * 1e-3).toFixed(6)} ${(e.eon_mJ * 2.2 * 1e-3).toFixed(6)}</Row>`,
      `        </Slice>`,
      `        <Slice temp="125">`,
      `          <Row>0 0 0</Row>`,
      `          <Row>0 ${(e.eon_mJ * 0.6 * 1e-3).toFixed(6)} ${(e.eon_mJ * 1.3 * 1e-3).toFixed(6)}</Row>`,
      `          <Row>0 ${(e.eon_mJ * 1.2 * 1e-3).toFixed(6)} ${(e.eon_mJ * 2.5 * 1e-3).toFixed(6)}</Row>`,
      `        </Slice>`,
      `      </Energy>`,
      `    </TurnOnLoss>`,
      `    <TurnOffLoss>`,
      `      <VoltageAxis>0 ${(e.vdsMax * 0.5).toFixed(0)} ${e.vdsMax.toFixed(0)}</VoltageAxis>`,
      `      <CurrentAxis>0 20 50</CurrentAxis>`,
      `      <TemperatureAxis>25 125</TemperatureAxis>`,
      `      <Energy>`,
      `        <Slice temp="25">`,
      `          <Row>0 0 0</Row>`,
      `          <Row>0 ${(e.eoff_mJ * 0.5 * 1e-3).toFixed(6)} ${(e.eoff_mJ * 1.1 * 1e-3).toFixed(6)}</Row>`,
      `          <Row>0 ${(e.eoff_mJ * 1.0 * 1e-3).toFixed(6)} ${(e.eoff_mJ * 2.2 * 1e-3).toFixed(6)}</Row>`,
      `        </Slice>`,
      `        <Slice temp="125">`,
      `          <Row>0 0 0</Row>`,
      `          <Row>0 ${(e.eoff_mJ * 0.6 * 1e-3).toFixed(6)} ${(e.eoff_mJ * 1.3 * 1e-3).toFixed(6)}</Row>`,
      `          <Row>0 ${(e.eoff_mJ * 1.2 * 1e-3).toFixed(6)} ${(e.eoff_mJ * 2.5 * 1e-3).toFixed(6)}</Row>`,
      `        </Slice>`,
      `      </Energy>`,
      `    </TurnOffLoss>`,
      `    <ThermalModel>`,
      `      <Foster Rth="${(e.rthJc_CW * 0.35).toFixed(4)} ${(e.rthJc_CW * 0.45).toFixed(4)} ${(e.rthJc_CW * 0.2).toFixed(4)}" Cth="0.002 0.015 0.08"/>`,
      `    </ThermalModel>`,
      `  </Semiconductor>`
    );
  }
  lines.push('</ThermalLibrary>');
  return lines.join('\n');
}

function buildHybridCapVerifyScript(
  title: string,
  fswHz: number,
  iRmsTotal_A: number,
  units: SpiceCapUnitDescriptor[]
): string {
  const lines = [
    `% ============================================================================`,
    `% Hybrid Multi-Branch Capacitor Bank Impedance & Ripple Sharing Verification`,
    `% ${title}`,
    `% Run in GNU Octave or MATLAB (also compatible with PLECS Simulation Script)`,
    `% ============================================================================`,
    `clear; clc;`,
    `f = logspace(2, 7, 500); % 100 Hz to 10 MHz`,
    `w = 2 * pi * f;`,
    `f_sw = ${fswHz.toFixed(1)};`,
    `I_rms_tot = ${iRmsTotal_A.toFixed(3)};`,
    ``,
    `% Parallel capacitor units/branches: [C_F, R_esr_Ohm, L_esl_H, qty]`,
    `branches = {`,
  ];
  for (const u of units) {
    lines.push(
      `  '${u.refDes} (${u.label})', ${(u.cap_uF * 1e-6).toExponential(4)}, ${(u.esr_mOhm * 1e-3).toExponential(4)}, ${(u.esl_nH * 1e-9).toExponential(4)}, ${u.qtyRepresented};`
    );
  }
  lines.push(
    `};`,
    ``,
    `Y_tot = zeros(size(f));`,
    `for k = 1:size(branches, 1)`,
    `  Ck = branches{k, 2}; Rk = branches{k, 3}; Lk = branches{k, 4};`,
    `  Zk = Rk + 1j * (w * Lk - 1 ./ (w * Ck));`,
    `  Y_tot = Y_tot + 1 ./ Zk;`,
    `end`,
    `Z_bank = 1 ./ Y_tot;`,
    ``,
    `% Evaluate ripple current split at switching frequency`,
    `w_sw = 2 * pi * f_sw;`,
    `Y_sw_vec = zeros(size(branches, 1), 1);`,
    `for k = 1:size(branches, 1)`,
    `  Ck = branches{k, 2}; Rk = branches{k, 3}; Lk = branches{k, 4};`,
    `  Y_sw_vec(k) = 1 / (Rk + 1j * (w_sw * Lk - 1 / (w_sw * Ck)));`,
    `end`,
    `Y_sw_tot = sum(Y_sw_vec);`,
    `fprintf('Combined |Z(f_sw)| = %.3f mOhm, ESR_eff = %.3f mOhm\\n', abs(1/Y_sw_tot)*1e3, real(1/Y_sw_tot)*1e3);`,
    `for k = 1:size(branches, 1)`,
    `  Ik = I_rms_tot * abs(Y_sw_vec(k)) / abs(Y_sw_tot);`,
    `  fprintf('  %-20s : I_rms = %.3f A (%.1f%% share)\\n', branches{k, 1}, Ik, 100*abs(Y_sw_vec(k))/sum(abs(Y_sw_vec)));`,
    `end`,
    ``,
    `figure('Name', 'Hybrid Capacitor Bank Impedance');`,
    `loglog(f/1e3, abs(Z_bank)*1e3, 'LineWidth', 2); grid on; hold on;`,
    `for k = 1:size(branches, 1)`,
    `  Ck = branches{k, 2}; Rk = branches{k, 3}; Lk = branches{k, 4};`,
    `  Zk = Rk + 1j * (w * Lk - 1 ./ (w * Ck));`,
    `  loglog(f/1e3, abs(Zk)*1e3, '--');`,
    `end`,
    `xlabel('Frequency [kHz]'); ylabel('|Z(f)| [mOhm]');`,
    `title('${title.replace(/'/g, '')} - Hybrid Capacitor Bank |Z(f)|');`,
    `legend([{'Combined Bank'}; branches(:,1)], 'Location', 'best');`,
  );
  return lines.join('\n');
}

function appendHybridCapBranchBlocks(params: {
  blocks: PlecsBlockSpec[];
  conns: PlecsConnSpec[];
  units: SpiceCapUnitDescriptor[];
  busPosAnchorBlock: string;
  busPosAnchorTerm: number;
  busNegAnchorBlock: string;
  busNegAnchorTerm: number;
  startX: number;
  stepX: number;
  topY: number;
  vInitExpr: string;
}): { lastPosBlock: string; lastPosTerm: number; lastNegBlock: string; lastNegTerm: number } {
  const {
    blocks,
    conns,
    units,
    busPosAnchorBlock,
    busPosAnchorTerm,
    busNegAnchorBlock,
    busNegAnchorTerm,
    startX,
    stepX,
    topY,
    vInitExpr,
  } = params;

  let prevPosBlock = busPosAnchorBlock;
  let prevPosTerm = busPosAnchorTerm;
  let prevNegBlock = busNegAnchorBlock;
  let prevNegTerm = busNegAnchorTerm;

  units.forEach((u, idx) => {
    const cx = startX + idx * stepX;
    const rName = `R_${u.refDes}`;
    const lName = `L_${u.refDes}`;
    const cName = u.refDes;

    blocks.push(
      {
        blockType: 'Resistor',
        name: rName,
        x: cx,
        y: topY + 80,
        direction: 'down',
        params: [{ variable: 'R', value: `${(u.esr_mOhm * 1e-3).toExponential(3)}`, show: 'off' }],
      },
      {
        blockType: 'Inductor',
        name: lName,
        x: cx,
        y: topY + 170,
        direction: 'down',
        params: [
          { variable: 'L', value: `${(u.esl_nH * 1e-9).toExponential(3)}`, show: 'off' },
          { variable: 'I_init', value: '0', show: 'off' },
        ],
      },
      {
        blockType: 'Capacitor',
        name: cName,
        x: cx,
        y: topY + 260,
        direction: 'down',
        params: [
          { variable: 'C', value: `${u.cap_uF.toFixed(4)}e-6`, show: 'on' },
          { variable: 'v_init', value: vInitExpr, show: 'off' },
        ],
      }
    );

    conns.push(
      { srcBlock: prevPosBlock, srcTerminal: prevPosTerm, dstBlock: rName, dstTerminal: 1 },
      { srcBlock: rName, srcTerminal: 2, dstBlock: lName, dstTerminal: 1 },
      { srcBlock: lName, srcTerminal: 2, dstBlock: cName, dstTerminal: 1 },
      { srcBlock: cName, srcTerminal: 2, dstBlock: prevNegBlock, dstTerminal: prevNegTerm }
    );

    prevPosBlock = rName;
    prevPosTerm = 1;
    prevNegBlock = cName;
    prevNegTerm = 2;
  });

  return {
    lastPosBlock: prevPosBlock,
    lastPosTerm: prevPosTerm,
    lastNegBlock: prevNegBlock,
    lastNegTerm: prevNegTerm,
  };
}

// ============================================================================
// SHARED DC-DC STAGE BLOCK BUILDER (Clean, Non-Overlapping Grid Layout)
// ============================================================================
function appendDcDcStageBlocks(params: {
  blocks: PlecsBlockSpec[];
  conns: PlecsConnSpec[];
  state: DcDcDesignState;
  res: DcDcResults;
  coutUnits: SpiceCapUnitDescriptor[];
  busPosAnchorBlock: string;
  busPosAnchorTerm: number;
  busNegAnchorBlock: string;
  busNegAnchorTerm: number;
  xStart: number;
  topY: number;
}) {
  const {
    blocks,
    conns,
    state,
    res,
    coutUnits,
    busPosAnchorBlock,
    busPosAnchorTerm,
    busNegAnchorBlock,
    busNegAnchorTerm,
    xStart,
    topY,
  } = params;

  const fswHz = state.fsw_kHz * 1e3;
  const fz1_Hz = res.fz1_kHz * 1e3;
  const fp1_Hz = res.fp1_kHz * 1e3;
  const compNum = `[${(fz1_Hz > 0 ? 1 / (2 * Math.PI * fz1_Hz) : 1e-4).toExponential(3)} 1]`;
  const fp1 = Math.max(100, fp1_Hz || fswHz * 0.4);
  const compDen = `[${(1 / (2 * Math.PI * fp1)).toExponential(3)} 1 0]`;
  const kiGain = Math.max(0.05, Number((res.fc_actual_kHz / 5).toFixed(3)));

  // Zone A: Gate Drive A + Primary Leg A
  const xDrvA = xStart;
  const xBridge = xDrvA + 150;
  blocks.push(
    {
      blockType: 'PulseGenerator',
      name: 'PWM_A',
      x: xDrvA,
      y: topY + 60,
      direction: 'right',
      params: [
        { variable: 'f', value: 'fsw' },
        { variable: 'D', value: '0.47' },
        { variable: 'Phi', value: '0', show: 'off' },
      ],
    },
    {
      blockType: 'LogicalOperator',
      name: 'NOT_A',
      x: xDrvA,
      y: topY + 260,
      direction: 'right',
      params: [{ variable: 'Operator', value: 'NOT', show: 'off' }],
    },
    {
      blockType: 'Mosfet',
      name: 'Q1',
      x: xBridge,
      y: topY + 60,
      direction: 'down',
      params: [
        { variable: 'Ron', value: 'Rpri_on', show: 'off' },
        { variable: 's_init', value: '0', show: 'off' },
      ],
    },
    {
      blockType: 'Diode',
      name: 'D_Q1',
      x: xBridge + 75,
      y: topY + 60,
      direction: 'up',
      params: [
        { variable: 'Vf', value: '1.1', show: 'off' },
        { variable: 'Ron', value: 'Rpri_on', show: 'off' },
      ],
    },
    {
      blockType: 'Mosfet',
      name: 'Q2',
      x: xBridge,
      y: topY + 260,
      direction: 'down',
      params: [
        { variable: 'Ron', value: 'Rpri_on', show: 'off' },
        { variable: 's_init', value: '0', show: 'off' },
      ],
    },
    {
      blockType: 'Diode',
      name: 'D_Q2',
      x: xBridge + 75,
      y: topY + 260,
      direction: 'up',
      params: [
        { variable: 'Vf', value: '1.1', show: 'off' },
        { variable: 'Ron', value: 'Rpri_on', show: 'off' },
      ],
    }
  );
  conns.push(
    { srcBlock: busPosAnchorBlock, srcTerminal: busPosAnchorTerm, dstBlock: 'Q1', dstTerminal: 1 },
    { srcBlock: 'Q1', srcTerminal: 1, dstBlock: 'D_Q1', dstTerminal: 2 },
    { srcBlock: 'Q1', srcTerminal: 2, dstBlock: 'D_Q1', dstTerminal: 1 },
    { srcBlock: 'Q1', srcTerminal: 2, dstBlock: 'Q2', dstTerminal: 1 },
    { srcBlock: 'Q2', srcTerminal: 1, dstBlock: 'D_Q2', dstTerminal: 2 },
    { srcBlock: 'Q2', srcTerminal: 2, dstBlock: 'D_Q2', dstTerminal: 1 },
    { srcBlock: 'Q2', srcTerminal: 2, dstBlock: busNegAnchorBlock, dstTerminal: busNegAnchorTerm },
    { type: 'Signal', srcBlock: 'PWM_A', srcTerminal: 1, dstBlock: 'Q1', dstTerminal: 3 },
    { type: 'Signal', srcBlock: 'PWM_A', srcTerminal: 1, dstBlock: 'NOT_A', dstTerminal: 1 },
    { type: 'Signal', srcBlock: 'NOT_A', srcTerminal: 1, dstBlock: 'Q2', dstTerminal: 3 }
  );

  // Zone B: Leg B (Full-Bridge Q3/Q4 + Gate Drive B, or LLC Half-Bridge Split Caps)
  const xDrvB = xBridge + 205;
  const xLegB = state.topology === 'llc-hb' ? xBridge + 220 : xDrvB + 150;
  if (state.topology === 'llc-hb') {
    blocks.push(
      {
        blockType: 'Capacitor',
        name: 'C_HB1',
        x: xLegB,
        y: topY + 60,
        direction: 'down',
        params: [
          { variable: 'C', value: '22e-6' },
          { variable: 'v_init', value: 'Vin/2', show: 'off' },
        ],
      },
      {
        blockType: 'Capacitor',
        name: 'C_HB2',
        x: xLegB,
        y: topY + 260,
        direction: 'down',
        params: [
          { variable: 'C', value: '22e-6' },
          { variable: 'v_init', value: 'Vin/2', show: 'off' },
        ],
      }
    );
    conns.push(
      { srcBlock: 'Q1', srcTerminal: 1, dstBlock: 'C_HB1', dstTerminal: 1 },
      { srcBlock: 'C_HB1', srcTerminal: 2, dstBlock: 'C_HB2', dstTerminal: 1 },
      { srcBlock: 'C_HB2', srcTerminal: 2, dstBlock: 'Q2', dstTerminal: 2 }
    );
  } else {
    blocks.push(
      {
        blockType: 'PulseGenerator',
        name: 'PWM_B',
        x: xDrvB,
        y: topY + 60,
        direction: 'right',
        params: [
          { variable: 'f', value: 'fsw' },
          { variable: 'D', value: '0.47' },
          { variable: 'Phi', value: res.isLLC ? '0.5' : `${(res.phaseShift_deg / 360).toFixed(4)}`, show: 'off' },
        ],
      },
      {
        blockType: 'LogicalOperator',
        name: 'NOT_B',
        x: xDrvB,
        y: topY + 260,
        direction: 'right',
        params: [{ variable: 'Operator', value: 'NOT', show: 'off' }],
      },
      {
        blockType: 'Mosfet',
        name: 'Q3',
        x: xLegB,
        y: topY + 60,
        direction: 'down',
        params: [
          { variable: 'Ron', value: 'Rpri_on', show: 'off' },
          { variable: 's_init', value: '0', show: 'off' },
        ],
      },
      {
        blockType: 'Diode',
        name: 'D_Q3',
        x: xLegB + 75,
        y: topY + 60,
        direction: 'up',
        params: [
          { variable: 'Vf', value: '1.1', show: 'off' },
          { variable: 'Ron', value: 'Rpri_on', show: 'off' },
        ],
      },
      {
        blockType: 'Mosfet',
        name: 'Q4',
        x: xLegB,
        y: topY + 260,
        direction: 'down',
        params: [
          { variable: 'Ron', value: 'Rpri_on', show: 'off' },
          { variable: 's_init', value: '0', show: 'off' },
        ],
      },
      {
        blockType: 'Diode',
        name: 'D_Q4',
        x: xLegB + 75,
        y: topY + 260,
        direction: 'up',
        params: [
          { variable: 'Vf', value: '1.1', show: 'off' },
          { variable: 'Ron', value: 'Rpri_on', show: 'off' },
        ],
      }
    );
    conns.push(
      { srcBlock: 'Q1', srcTerminal: 1, dstBlock: 'Q3', dstTerminal: 1 },
      { srcBlock: 'Q3', srcTerminal: 1, dstBlock: 'D_Q3', dstTerminal: 2 },
      { srcBlock: 'Q3', srcTerminal: 2, dstBlock: 'D_Q3', dstTerminal: 1 },
      { srcBlock: 'Q3', srcTerminal: 2, dstBlock: 'Q4', dstTerminal: 1 },
      { srcBlock: 'Q4', srcTerminal: 1, dstBlock: 'D_Q4', dstTerminal: 2 },
      { srcBlock: 'Q4', srcTerminal: 2, dstBlock: 'D_Q4', dstTerminal: 1 },
      { srcBlock: 'Q4', srcTerminal: 2, dstBlock: 'Q2', dstTerminal: 2 },
      { type: 'Signal', srcBlock: 'PWM_B', srcTerminal: 1, dstBlock: 'Q3', dstTerminal: 3 },
      { type: 'Signal', srcBlock: 'PWM_B', srcTerminal: 1, dstBlock: 'NOT_B', dstTerminal: 1 },
      { type: 'Signal', srcBlock: 'NOT_B', srcTerminal: 1, dstBlock: 'Q4', dstTerminal: 3 }
    );
  }

  // Zone C: Tank (R_LLK, L_LK, C_RES/C_BLK, L_M) & HF Transformer
  const xTank = xLegB + 210;
  blocks.push(
    {
      blockType: 'Resistor',
      name: 'R_LLK',
      x: xTank,
      y: topY + 130,
      direction: 'right',
      params: [{ variable: 'R', value: `${Math.max(0.002, res.Rpri_ac_mOhm * 1e-3).toFixed(4)}`, show: 'off' }],
    },
    {
      blockType: 'Inductor',
      name: 'L_LK',
      x: xTank + 115,
      y: topY + 130,
      direction: 'right',
      params: [{ variable: 'L', value: 'Llk' }],
    },
    {
      blockType: 'Capacitor',
      name: res.isLLC ? 'C_RES' : 'C_BLK',
      x: xTank + 230,
      y: topY + 130,
      direction: 'right',
      params: [{ variable: 'C', value: 'Cr_tank' }],
    },
    {
      blockType: 'Inductor',
      name: 'L_M',
      x: xTank + 345,
      y: topY + 215,
      direction: 'down',
      params: [{ variable: 'L', value: 'Lm' }],
    },
    {
      blockType: 'Transformer',
      name: 'TX_HF',
      x: xTank + 475,
      y: topY + 215,
      direction: 'right',
      params: [{ variable: 'n', value: '[Np Ns]' }],
    }
  );
  const tankCapName = res.isLLC ? 'C_RES' : 'C_BLK';
  const legBMidBlock = state.topology === 'llc-hb' ? 'C_HB1' : 'Q3';
  conns.push(
    { srcBlock: 'Q1', srcTerminal: 2, dstBlock: 'R_LLK', dstTerminal: 1 },
    { srcBlock: 'R_LLK', srcTerminal: 2, dstBlock: 'L_LK', dstTerminal: 1 },
    { srcBlock: 'L_LK', srcTerminal: 2, dstBlock: tankCapName, dstTerminal: 1 },
    { srcBlock: tankCapName, srcTerminal: 2, dstBlock: 'L_M', dstTerminal: 1 },
    { srcBlock: tankCapName, srcTerminal: 2, dstBlock: 'TX_HF', dstTerminal: 1 },
    { srcBlock: 'L_M', srcTerminal: 2, dstBlock: legBMidBlock, dstTerminal: 2 },
    { srcBlock: 'TX_HF', srcTerminal: 2, dstBlock: legBMidBlock, dstTerminal: 2 }
  );

  // Zone D: Secondary Rectifier + Output Inductor + Hybrid Cout Bank + Load
  const xSec = xTank + 615;
  blocks.push(
    {
      blockType: 'Reference',
      name: 'GND_SEC',
      x: xSec + 130,
      y: topY + 380,
      direction: 'down',
    },
    {
      blockType: 'Diode',
      name: 'D_SEC1',
      x: xSec,
      y: topY + 60,
      direction: 'right',
      params: [
        { variable: 'Vf', value: state.rectMode === 'sync-fet' ? '0.15' : '0.65' },
        { variable: 'Ron', value: 'Rsec_on', show: 'off' },
      ],
    },
    {
      blockType: 'Diode',
      name: 'D_SEC2',
      x: xSec,
      y: topY + 260,
      direction: 'right',
      params: [
        { variable: 'Vf', value: state.rectMode === 'sync-fet' ? '0.15' : '0.65' },
        { variable: 'Ron', value: 'Rsec_on', show: 'off' },
      ],
    },
    {
      blockType: 'Diode',
      name: 'D_SEC3',
      x: xSec + 130,
      y: topY + 60,
      direction: 'up',
      params: [
        { variable: 'Vf', value: state.rectMode === 'sync-fet' ? '0.15' : '0.65' },
        { variable: 'Ron', value: 'Rsec_on', show: 'off' },
      ],
    },
    {
      blockType: 'Diode',
      name: 'D_SEC4',
      x: xSec + 130,
      y: topY + 260,
      direction: 'up',
      params: [
        { variable: 'Vf', value: state.rectMode === 'sync-fet' ? '0.15' : '0.65' },
        { variable: 'Ron', value: 'Rsec_on', show: 'off' },
      ],
    },
    {
      blockType: 'Inductor',
      name: 'L_OUT',
      x: xSec + 275,
      y: topY,
      direction: 'right',
      params: [
        { variable: 'L', value: 'Lo' },
        { variable: 'I_init', value: `${res.Iout_total_A.toFixed(2)}`, show: 'off' },
      ],
    },
    {
      blockType: 'Resistor',
      name: 'R_LO',
      x: xSec + 395,
      y: topY,
      direction: 'right',
      params: [{ variable: 'R', value: '1.5e-3', show: 'off' }],
    }
  );
  conns.push(
    { srcBlock: 'TX_HF', srcTerminal: 3, dstBlock: 'D_SEC1', dstTerminal: 1 },
    { srcBlock: 'TX_HF', srcTerminal: 3, dstBlock: 'D_SEC3', dstTerminal: 2 },
    { srcBlock: 'TX_HF', srcTerminal: 4, dstBlock: 'D_SEC2', dstTerminal: 1 },
    { srcBlock: 'TX_HF', srcTerminal: 4, dstBlock: 'D_SEC4', dstTerminal: 2 },
    { srcBlock: 'D_SEC1', srcTerminal: 2, dstBlock: 'L_OUT', dstTerminal: 1 },
    { srcBlock: 'D_SEC2', srcTerminal: 2, dstBlock: 'L_OUT', dstTerminal: 1 },
    { srcBlock: 'D_SEC3', srcTerminal: 1, dstBlock: 'GND_SEC', dstTerminal: 1 },
    { srcBlock: 'D_SEC4', srcTerminal: 1, dstBlock: 'GND_SEC', dstTerminal: 1 },
    { srcBlock: 'L_OUT', srcTerminal: 2, dstBlock: 'R_LO', dstTerminal: 1 }
  );

  const xOutCaps = xSec + 525;
  const coutChain = appendHybridCapBranchBlocks({
    blocks,
    conns,
    units: coutUnits,
    busPosAnchorBlock: 'R_LO',
    busPosAnchorTerm: 2,
    busNegAnchorBlock: 'GND_SEC',
    busNegAnchorTerm: 1,
    startX: xOutCaps,
    stepX: 120,
    topY,
    vInitExpr: 'Vout_init',
  });

  const xLoad = xOutCaps + Math.max(0, coutUnits.length - 1) * 120 + 145;
  blocks.push(
    {
      blockType: 'Resistor',
      name: 'R_LOAD',
      x: xLoad,
      y: topY + 170,
      direction: 'down',
      params: [{ variable: 'R', value: 'Rload' }],
    },
    {
      blockType: 'Voltmeter',
      name: 'VM_VOUT',
      x: xLoad + 125,
      y: topY + 170,
      direction: 'down',
    },
    {
      blockType: 'Scope',
      name: 'SCOPE_VOUT',
      x: xLoad + 260,
      y: topY + 170,
      direction: 'right',
    }
  );
  conns.push(
    { srcBlock: coutChain.lastPosBlock, srcTerminal: coutChain.lastPosTerm, dstBlock: 'R_LOAD', dstTerminal: 1 },
    { srcBlock: 'R_LOAD', srcTerminal: 2, dstBlock: coutChain.lastNegBlock, dstTerminal: coutChain.lastNegTerm },
    { srcBlock: 'R_LOAD', srcTerminal: 1, dstBlock: 'VM_VOUT', dstTerminal: 1 },
    { srcBlock: 'VM_VOUT', srcTerminal: 2, dstBlock: 'R_LOAD', dstTerminal: 2 },
    { type: 'Signal', srcBlock: 'VM_VOUT', srcTerminal: 3, dstBlock: 'SCOPE_VOUT', dstTerminal: 1 }
  );

  // Zone E: Closed-Loop Compensator Chain (cleanly below power stage, no dangling pins)
  const yCtrl = topY + 470;
  blocks.push(
    {
      blockType: 'Constant',
      name: 'V_REF',
      x: xLoad - 90,
      y: yCtrl,
      direction: 'left',
      params: [{ variable: 'Value', value: 'Vout_ref' }],
    },
    {
      blockType: 'Sum',
      name: 'ERR_SUM',
      x: xLoad - 220,
      y: yCtrl,
      direction: 'left',
      params: [{ variable: 'Inputs', value: '+-', show: 'off' }],
    },
    {
      blockType: 'Gain',
      name: 'K_LOOP',
      x: xLoad - 350,
      y: yCtrl,
      direction: 'left',
      params: [{ variable: 'K', value: `${kiGain}` }],
    },
    {
      blockType: 'TransferFcn',
      name: 'COMP_TF',
      x: xLoad - 485,
      y: yCtrl,
      direction: 'left',
      params: [
        { variable: 'Numerator', value: compNum },
        { variable: 'Denominator', value: compDen },
      ],
    },
    {
      blockType: 'Saturation',
      name: 'DUTY_LIM',
      x: xLoad - 620,
      y: yCtrl,
      direction: 'left',
      params: [
        { variable: 'UpperLimit', value: '0.48' },
        { variable: 'LowerLimit', value: '0.05' },
      ],
    },
    {
      blockType: 'Scope',
      name: 'SCOPE_CTRL',
      x: xLoad - 755,
      y: yCtrl,
      direction: 'left',
    }
  );
  conns.push(
    { type: 'Signal', srcBlock: 'VM_VOUT', srcTerminal: 3, dstBlock: 'ERR_SUM', dstTerminal: 2 },
    { type: 'Signal', srcBlock: 'V_REF', srcTerminal: 1, dstBlock: 'ERR_SUM', dstTerminal: 1 },
    { type: 'Signal', srcBlock: 'ERR_SUM', srcTerminal: 1, dstBlock: 'K_LOOP', dstTerminal: 1 },
    { type: 'Signal', srcBlock: 'K_LOOP', srcTerminal: 1, dstBlock: 'COMP_TF', dstTerminal: 1 },
    { type: 'Signal', srcBlock: 'COMP_TF', srcTerminal: 1, dstBlock: 'DUTY_LIM', dstTerminal: 1 },
    { type: 'Signal', srcBlock: 'DUTY_LIM', srcTerminal: 1, dstBlock: 'SCOPE_CTRL', dstTerminal: 1 }
  );
}

// ============================================================================
// 1. DC-DC CONVERTER PLECS GENERATOR (PSFB & LLC)
// ============================================================================
export function generateDcDcPlecsModel(state: DcDcDesignState, res: DcDcResults): string {
  const modelName = sanitizePlecsIdent(`voltcraft_${state.topology}_${state.txType}`);
  const fswHz = state.fsw_kHz * 1e3;
  const Rload = (state.Vout_V * state.Vout_V) / Math.max(1, state.Pout_W);
  const Lpri_H = state.Lm_uH * 1e-6;
  const nRatio = Math.max(0.1, state.turnsRatio_n);
  const Lsec_H = Lpri_H / (nRatio * nRatio);
  const crVal_F = res.isLLC ? state.Cr_nF * 1e-9 : 4.7e-6;

  const cinBank = getDefaultHybridCapBank('dcdc-cin', state);
  const coutBank = getDefaultHybridCapBank('dcdc-cout', state);
  const cinUnits = expandHybridCapBankForSpice(cinBank, 'C_IN', state.Vin_max_V, 4);
  const coutUnits = expandHybridCapBankForSpice(coutBank, 'C_OUT', state.Vout_V * 1.05, 4);

  const blocks: PlecsBlockSpec[] = [];
  const conns: PlecsConnSpec[] = [];

  // Zone 1: Input Source & Hybrid Cin Bank
  blocks.push(
    {
      blockType: 'DCVoltageSource',
      name: 'V_IN',
      x: 90,
      y: 280,
      direction: 'up',
      params: [{ variable: 'V', value: 'Vin' }],
    },
    {
      blockType: 'Reference',
      name: 'GND_PRI',
      x: 90,
      y: 470,
      direction: 'down',
    }
  );
  conns.push({ srcBlock: 'V_IN', srcTerminal: 2, dstBlock: 'GND_PRI', dstTerminal: 1 });

  const cinChain = appendHybridCapBranchBlocks({
    blocks,
    conns,
    units: cinUnits,
    busPosAnchorBlock: 'V_IN',
    busPosAnchorTerm: 1,
    busNegAnchorBlock: 'GND_PRI',
    busNegAnchorTerm: 1,
    startX: 230,
    stepX: 120,
    topY: 120,
    vInitExpr: 'Vin',
  });

  const xBridgeStart = 230 + Math.max(0, cinUnits.length - 1) * 120 + 165;
  appendDcDcStageBlocks({
    blocks,
    conns,
    state,
    res,
    coutUnits,
    busPosAnchorBlock: cinChain.lastPosBlock,
    busPosAnchorTerm: cinChain.lastPosTerm,
    busNegAnchorBlock: cinChain.lastNegBlock,
    busNegAnchorTerm: cinChain.lastNegTerm,
    xStart: xBridgeStart,
    topY: 120,
  });

  const rPriOn = Math.max(0.002, (res.priDevice.Rds_on_25C_mOhm * 1e-3) / Math.max(1, state.nParallelPri));
  const rSecOn =
    state.rectMode === 'sync-fet'
      ? Math.max(0.001, (res.secDevice.Rds_on_25C_mOhm * 1e-3) / Math.max(1, state.nParallelSec))
      : 0.008;

  const initCmd = [
    `Vin = ${state.Vin_nom_V};`,
    `Vout_ref = ${state.Vout_V};`,
    `Vout_init = ${(state.Vout_V * 0.94).toFixed(2)};`,
    `fsw = ${fswHz};`,
    `Np = ${state.Np_turns};`,
    `Ns = ${state.Ns_turns};`,
    `Llk = ${(state.Llk_uH * 1e-6).toExponential(4)};`,
    `Lm = ${(state.Lm_uH * 1e-6).toExponential(4)};`,
    `Cr_tank = ${crVal_F.toExponential(4)};`,
    `Lo = ${(state.Lo_uH * 1e-6).toExponential(4)};`,
    `Rload = ${Rload.toFixed(4)};`,
    `Rpri_on = ${rPriOn.toFixed(5)};`,
    `Rsec_on = ${rSecOn.toFixed(5)};`,
    `% Reference: ${Lsec_H.toExponential(3)} H sec`,
  ].join(' ');

  return [
    'Plecs {',
    `  Name          "${modelName}"`,
    '  Version       "4.8"',
    '  SavedModel    "True"',
    '  StoredState   "False"',
    '  SimulationTime "0.002"',
    '  StartTime     "0.0"',
    `  TimeStep      "${(1 / (fswHz * 40)).toExponential(2)}"`,
    `  MaxStep       "${(1 / (fswHz * 25)).toExponential(2)}"`,
    '  Refine        "1"',
    '  RelTol        "1e-3"',
    '  AbsTol        "1e-5"',
    '  AlgebraicLoop "error"',
    '  JacobianMethod "auto"',
    '  FixedStepTime "1e-6"',
    '  FixedStep     "False"',
    '  Solver        "RADAU"',
    '  ThermalControl "0"',
    `  InitializationCommands "${initCmd}"`,
    '  InitialState  "struct()"',
    '  System {',
    `    Name          "${modelName}"`,
    '    Location      [80, 80, 1420, 860]',
    '    Open          on',
    '    ModelBrowserVisibility off',
    '    ModelBrowserWidth 200',
    '    ScreenColor   "white"',
    '    PaperOrientation "landscape"',
    '    PaperPositionMode "auto"',
    '    PaperType     "usletter"',
    '    PaperUnits    "inches"',
    '    ZoomFactor    "100"',
    ...blocks.map(renderPlecsBlock),
    ...conns.map(renderPlecsConn),
    '  }',
    '}',
  ].join('\n');
}

export function generateDcDcPlecsBundle(state: DcDcDesignState, res: DcDcResults): PlecsBundle {
  const baseName = sanitizePlecsIdent(`voltcraft_${state.topology}_${state.txType}`);
  const plecsText = generateDcDcPlecsModel(state, res);

  const cinBank = getDefaultHybridCapBank('dcdc-cin', state);
  const coutBank = getDefaultHybridCapBank('dcdc-cout', state);
  const coutSol = solveHybridCapBank(coutBank, {
    fsw_kHz: res.fRipple_out_kHz,
    I_hf_rms_A: res.ICo_rms_A,
    V_op_pk_V: state.Vout_V * 1.05,
    Tamb_C: state.Tamb_C,
  });
  const coutUnits = expandHybridCapBankForSpice(coutBank, 'C_OUT', state.Vout_V * 1.05, 4);
  const cinUnits = expandHybridCapBankForSpice(cinBank, 'C_IN', state.Vin_max_V, 4);

  const Rload = (state.Vout_V * state.Vout_V) / Math.max(1, state.Pout_W);
  const initScriptText = [
    `% ============================================================================`,
    `% PLECS / MATLAB / Octave Parameter Initialization Script`,
    `% Model: ${state.presetName} (${state.topology} / ${state.txType} / ${state.rectMode})`,
    `% ============================================================================`,
    `Vin = ${state.Vin_nom_V};`,
    `Vout_ref = ${state.Vout_V};`,
    `Vout_init = ${(state.Vout_V * 0.94).toFixed(2)};`,
    `Pout_W = ${state.Pout_W};`,
    `fsw = ${state.fsw_kHz * 1e3};`,
    `Np = ${state.Np_turns};`,
    `Ns = ${state.Ns_turns};`,
    `Llk = ${(state.Llk_uH * 1e-6).toExponential(4)};`,
    `Lm = ${(state.Lm_uH * 1e-6).toExponential(4)};`,
    `Cr_tank = ${(res.isLLC ? state.Cr_nF * 1e-9 : 4.7e-6).toExponential(4)};`,
    `Lo = ${(state.Lo_uH * 1e-6).toExponential(4)};`,
    `Rload = ${Rload.toFixed(4)};`,
    `Rpri_on = ${Math.max(0.002, (res.priDevice.Rds_on_25C_mOhm * 1e-3) / Math.max(1, state.nParallelPri)).toFixed(5)};`,
    `Rsec_on = ${(state.rectMode === 'sync-fet' ? Math.max(0.001, (res.secDevice.Rds_on_25C_mOhm * 1e-3) / Math.max(1, state.nParallelSec)) : 0.008).toFixed(5)};`,
    ``,
    `% Hybrid Input Bank (Cin): ${cinUnits.map((u) => `${u.refDes}=${u.cap_uF}uF`).join(', ')}`,
    `% Hybrid Output Bank (Cout): ${coutSol.summaryLabel} (C_eff=${coutSol.totalCapEff_uF.toFixed(1)} uF, ESR_eff=${coutSol.esrEffAtFsw_mOhm.toFixed(2)} mOhm)`,
  ].join('\n');

  const capVerifyScriptText = buildHybridCapVerifyScript(
    `${state.presetName} Cout Hybrid Bank (${coutSol.summaryLabel})`,
    res.fRipple_out_kHz * 1e3,
    res.ICo_rms_A,
    coutUnits
  );

  const priIpk = Math.max(1, res.I_lead_turnoff_A, (state.Pout_W / Math.max(10, state.Vin_nom_V)) * 1.4);
  const secIpk = Math.max(1, res.Iout_total_A);
  const thermalXmlText = buildThermalXml([
    {
      name: res.priDevice.id,
      manufacturer: res.priDevice.manufacturer ?? 'Generic',
      vdsMax: res.priDevice.Vds_max_V,
      rds25_Ohm: res.priDevice.Rds_on_25C_mOhm * 1e-3,
      eon_mJ: 0.5 * state.Vin_nom_V * priIpk * res.priDevice.tr_ns * 1e-6,
      eoff_mJ: 0.5 * state.Vin_nom_V * priIpk * res.priDevice.tf_ns * 1e-6,
      rthJc_CW: res.priDevice.Rth_JC_CW,
    },
    {
      name: res.secDevice.id,
      manufacturer: res.secDevice.manufacturer ?? 'Generic',
      vdsMax: res.secDevice.Vds_max_V,
      rds25_Ohm: res.secDevice.Rds_on_25C_mOhm * 1e-3,
      eon_mJ: 0.5 * res.Vsec_ideal_pk_V * secIpk * res.secDevice.tr_ns * 1e-6,
      eoff_mJ: 0.5 * res.Vsec_ideal_pk_V * secIpk * res.secDevice.tf_ns * 1e-6,
      rthJc_CW: res.secDevice.Rth_JC_CW,
    },
  ]);

  const readmeText = [
    `VoltCraft Power Electronics Studio — PLECS Standalone Simulation Bundle`,
    `========================================================================`,
    `Model:       ${state.presetName}`,
    `Topology:    ${state.topology} | Secondary: ${state.txType} | Rectifier: ${state.rectMode}`,
    `Operating:   Vin=${state.Vin_nom_V}V -> Vout=${state.Vout_V}V @ ${state.Pout_W}W (fsw=${state.fsw_kHz} kHz)`,
    ``,
    `Files Included:`,
    `  1. ${baseName}.plecs           - Full PLECS Standalone power stage + closed-loop compensator`,
    `  2. init_params.m               - MATLAB/Octave initialization variables`,
    `  3. hybrid_cap_verification.m   - Frequency-domain |Z(f)| & ripple-sharing verification`,
    `  4. thermal_descriptions.xml    - PLECS thermal loss & Foster network XML`,
    ``,
    `Hybrid Capacitor Banks Modeled:`,
    `  - Cin:  ${cinUnits.map((u) => `${u.refDes} (${u.cap_uF}uF, ESR=${u.esr_mOhm}mOhm, ESL=${u.esl_nH}nH)`).join(' || ')}`,
    `  - Cout: ${coutUnits.map((u) => `${u.refDes} (${u.cap_uF}uF, ESR=${u.esr_mOhm}mOhm, ESL=${u.esl_nH}nH)`).join(' || ')}`,
    ``,
    `Quick Start in Plexim PLECS:`,
    `  1. Extract all files into one folder.`,
    `  2. Open ${baseName}.plecs in PLECS Standalone (v4.4+).`,
    `  3. Press Ctrl+T to run simulation (RADAU stiff solver, all parameters pre-initialized).`,
    `  4. Double-click SCOPE_VOUT to inspect output regulation and switching ripple.`,
  ].join('\n');

  const files: ZipEntry[] = [
    { path: `${baseName}.plecs`, content: plecsText },
    { path: 'init_params.m', content: initScriptText },
    { path: 'hybrid_cap_verification.m', content: capVerifyScriptText },
    { path: 'thermal_descriptions.xml', content: thermalXmlText },
    { path: 'README_PLECS.txt', content: readmeText },
  ];

  return {
    baseName,
    plecsText,
    initScriptText,
    capVerifyScriptText,
    thermalXmlText,
    readmeText,
    zipBytes: buildZipArchive(files),
  };
}

// ============================================================================
// SHARED AC-DC PFC FRONT-END BLOCK BUILDER (Clean, Non-Overlapping Grid)
// ============================================================================
function appendAcDcFrontEndBlocks(params: {
  blocks: PlecsBlockSpec[];
  conns: PlecsConnSpec[];
  state: AcDcDesignState;
  res: AcDcResults;
  cdcUnits: SpiceCapUnitDescriptor[];
  topY: number;
}): { busPosBlock: string; busPosTerm: number; busNegBlock: string; busNegTerm: number; xAfterCaps: number } {
  const { blocks, conns, state, res, cdcUnits, topY } = params;

  // Zone 1: AC Mains + EMI DM Filter + Rectifier Bridge
  blocks.push(
    {
      blockType: 'ACVoltageSource',
      name: 'V_AC',
      x: 90,
      y: topY + 150,
      direction: 'up',
      params: [
        { variable: 'V', value: 'Vac_pk' },
        { variable: 'f', value: 'f_line' },
        { variable: 'Phi', value: '0', show: 'off' },
      ],
    },
    {
      blockType: 'Reference',
      name: 'GND_AC',
      x: 90,
      y: topY + 340,
      direction: 'down',
    },
    {
      blockType: 'Inductor',
      name: 'L_DM',
      x: 220,
      y: topY,
      direction: 'right',
      params: [{ variable: 'L', value: `${(res.Ldm_uH * 1e-6).toExponential(3)}` }],
    },
    {
      blockType: 'Capacitor',
      name: 'C_X1',
      x: 340,
      y: topY + 165,
      direction: 'down',
      params: [{ variable: 'C', value: `${(res.Cx_each_uF * 1e-6).toExponential(3)}` }],
    },
    {
      blockType: 'Diode',
      name: 'D_REC1',
      x: 465,
      y: topY + 60,
      direction: 'up',
      params: [{ variable: 'Vf', value: '0.85', show: 'off' }],
    },
    {
      blockType: 'Diode',
      name: 'D_REC2',
      x: 465,
      y: topY + 255,
      direction: 'up',
      params: [{ variable: 'Vf', value: '0.85', show: 'off' }],
    },
    {
      blockType: 'Diode',
      name: 'D_REC3',
      x: 595,
      y: topY + 60,
      direction: 'up',
      params: [{ variable: 'Vf', value: '0.85', show: 'off' }],
    },
    {
      blockType: 'Diode',
      name: 'D_REC4',
      x: 595,
      y: topY + 255,
      direction: 'up',
      params: [{ variable: 'Vf', value: '0.85', show: 'off' }],
    }
  );
  conns.push(
    { srcBlock: 'V_AC', srcTerminal: 1, dstBlock: 'L_DM', dstTerminal: 1 },
    { srcBlock: 'V_AC', srcTerminal: 2, dstBlock: 'GND_AC', dstTerminal: 1 },
    { srcBlock: 'L_DM', srcTerminal: 2, dstBlock: 'C_X1', dstTerminal: 1 },
    { srcBlock: 'C_X1', srcTerminal: 2, dstBlock: 'GND_AC', dstTerminal: 1 },
    { srcBlock: 'L_DM', srcTerminal: 2, dstBlock: 'D_REC1', dstTerminal: 1 },
    { srcBlock: 'L_DM', srcTerminal: 2, dstBlock: 'D_REC2', dstTerminal: 2 },
    { srcBlock: 'GND_AC', srcTerminal: 1, dstBlock: 'D_REC3', dstTerminal: 1 },
    { srcBlock: 'GND_AC', srcTerminal: 1, dstBlock: 'D_REC4', dstTerminal: 2 },
    { srcBlock: 'D_REC2', srcTerminal: 1, dstBlock: 'D_REC4', dstTerminal: 1 }
  );

  // Zone 2: PFC Boost Stage (1 or 2 Interleaved Phases with clean row separation)
  const nPh = res.nPhases;
  const xBoost = 745;
  blocks.push(
    {
      blockType: 'Inductor',
      name: 'L_PFC1',
      x: xBoost,
      y: topY,
      direction: 'right',
      params: [{ variable: 'L', value: 'Lpfc' }],
    },
    {
      blockType: 'PulseGenerator',
      name: 'PWM_PFC1',
      x: xBoost,
      y: topY + 125,
      direction: 'right',
      params: [
        { variable: 'f', value: 'fsw_pfc' },
        { variable: 'D', value: '0.52' },
        { variable: 'Phi', value: '0', show: 'off' },
      ],
    },
    {
      blockType: 'Mosfet',
      name: 'Q_PFC1',
      x: xBoost + 145,
      y: topY + 125,
      direction: 'down',
      params: [{ variable: 'Ron', value: 'Rsw_on', show: 'off' }],
    },
    {
      blockType: 'Diode',
      name: 'D_BOOST1',
      x: xBoost + 280,
      y: topY,
      direction: 'right',
      params: [{ variable: 'Vf', value: '1.3', show: 'off' }],
    }
  );
  conns.push(
    { srcBlock: 'D_REC1', srcTerminal: 2, dstBlock: 'L_PFC1', dstTerminal: 1 },
    { srcBlock: 'D_REC3', srcTerminal: 2, dstBlock: 'L_PFC1', dstTerminal: 1 },
    { srcBlock: 'L_PFC1', srcTerminal: 2, dstBlock: 'Q_PFC1', dstTerminal: 1 },
    { srcBlock: 'L_PFC1', srcTerminal: 2, dstBlock: 'D_BOOST1', dstTerminal: 1 },
    { srcBlock: 'Q_PFC1', srcTerminal: 2, dstBlock: 'D_REC2', dstTerminal: 1 },
    { type: 'Signal', srcBlock: 'PWM_PFC1', srcTerminal: 1, dstBlock: 'Q_PFC1', dstTerminal: 3 }
  );

  if (nPh === 2) {
    blocks.push(
      {
        blockType: 'Inductor',
        name: 'L_PFC2',
        x: xBoost,
        y: topY + 265,
        direction: 'right',
        params: [{ variable: 'L', value: 'Lpfc' }],
      },
      {
        blockType: 'PulseGenerator',
        name: 'PWM_PFC2',
        x: xBoost,
        y: topY + 390,
        direction: 'right',
        params: [
          { variable: 'f', value: 'fsw_pfc' },
          { variable: 'D', value: '0.52' },
          { variable: 'Phi', value: '0.5', show: 'off' },
        ],
      },
      {
        blockType: 'Mosfet',
        name: 'Q_PFC2',
        x: xBoost + 145,
        y: topY + 390,
        direction: 'down',
        params: [{ variable: 'Ron', value: 'Rsw_on', show: 'off' }],
      },
      {
        blockType: 'Diode',
        name: 'D_BOOST2',
        x: xBoost + 280,
        y: topY + 265,
        direction: 'right',
        params: [{ variable: 'Vf', value: '1.3', show: 'off' }],
      }
    );
    conns.push(
      { srcBlock: 'D_REC1', srcTerminal: 2, dstBlock: 'L_PFC2', dstTerminal: 1 },
      { srcBlock: 'L_PFC2', srcTerminal: 2, dstBlock: 'Q_PFC2', dstTerminal: 1 },
      { srcBlock: 'L_PFC2', srcTerminal: 2, dstBlock: 'D_BOOST2', dstTerminal: 1 },
      { srcBlock: 'Q_PFC2', srcTerminal: 2, dstBlock: 'Q_PFC1', dstTerminal: 2 },
      { srcBlock: 'D_BOOST2', srcTerminal: 2, dstBlock: 'D_BOOST1', dstTerminal: 2 },
      { type: 'Signal', srcBlock: 'PWM_PFC2', srcTerminal: 1, dstBlock: 'Q_PFC2', dstTerminal: 3 }
    );
  }

  // Zone 3: Hybrid Cdc Bus Bank
  const xCaps = xBoost + 430;
  const cdcChain = appendHybridCapBranchBlocks({
    blocks,
    conns,
    units: cdcUnits,
    busPosAnchorBlock: 'D_BOOST1',
    busPosAnchorTerm: 2,
    busNegAnchorBlock: 'Q_PFC1',
    busNegAnchorTerm: 2,
    startX: xCaps,
    stepX: 120,
    topY,
    vInitExpr: 'Vdc_init',
  });

  const xAfterCaps = xCaps + Math.max(0, cdcUnits.length - 1) * 120 + 145;
  return {
    busPosBlock: cdcChain.lastPosBlock,
    busPosTerm: cdcChain.lastPosTerm,
    busNegBlock: cdcChain.lastNegBlock,
    busNegTerm: cdcChain.lastNegTerm,
    xAfterCaps,
  };
}

// ============================================================================
// 2. AC-DC PFC PLECS GENERATOR
// ============================================================================
export function generateAcDcPlecsModel(state: AcDcDesignState, res: AcDcResults): string {
  const modelName = sanitizePlecsIdent(`voltcraft_${state.topology}`);
  const fswHz = state.fsw_kHz * 1e3;
  const Vac_pk = state.Vac_rms_V * Math.SQRT2;
  const Rload = (state.Vdc_bus_V * state.Vdc_bus_V) / Math.max(10, state.Pout_W);
  const cdcBank = getDefaultHybridCapBank('acdc-cdc', undefined, state);
  const cdcUnits = expandHybridCapBankForSpice(cdcBank, 'C_DC', state.Vdc_bus_V * 1.04, 4);

  const blocks: PlecsBlockSpec[] = [];
  const conns: PlecsConnSpec[] = [];

  const front = appendAcDcFrontEndBlocks({
    blocks,
    conns,
    state,
    res,
    cdcUnits,
    topY: 120,
  });

  const xLoad = front.xAfterCaps;
  blocks.push(
    {
      blockType: 'Resistor',
      name: 'R_LOAD_DC',
      x: xLoad,
      y: 290,
      direction: 'down',
      params: [{ variable: 'R', value: 'Rload' }],
    },
    {
      blockType: 'Voltmeter',
      name: 'VM_VDC',
      x: xLoad + 125,
      y: 290,
      direction: 'down',
    },
    {
      blockType: 'Scope',
      name: 'SCOPE_PFC',
      x: xLoad + 260,
      y: 290,
      direction: 'right',
    }
  );
  conns.push(
    { srcBlock: front.busPosBlock, srcTerminal: front.busPosTerm, dstBlock: 'R_LOAD_DC', dstTerminal: 1 },
    { srcBlock: 'R_LOAD_DC', srcTerminal: 2, dstBlock: front.busNegBlock, dstTerminal: front.busNegTerm },
    { srcBlock: 'R_LOAD_DC', srcTerminal: 1, dstBlock: 'VM_VDC', dstTerminal: 1 },
    { srcBlock: 'VM_VDC', srcTerminal: 2, dstBlock: 'R_LOAD_DC', dstTerminal: 2 },
    { type: 'Signal', srcBlock: 'VM_VDC', srcTerminal: 3, dstBlock: 'SCOPE_PFC', dstTerminal: 1 }
  );

  const initCmd = [
    `Vac_pk = ${Vac_pk.toFixed(2)};`,
    `f_line = ${state.f_line_Hz};`,
    `Vdc_ref = ${state.Vdc_bus_V};`,
    `Vdc_init = ${(state.Vdc_bus_V * 0.96).toFixed(1)};`,
    `fsw_pfc = ${fswHz};`,
    `Lpfc = ${(state.Lpfc_uH * 1e-6).toExponential(4)};`,
    `Rload = ${Rload.toFixed(3)};`,
    `Rsw_on = ${Math.max(0.005, res.sw.Rds_on_25C_mOhm * 1e-3).toFixed(5)};`,
  ].join(' ');

  return [
    'Plecs {',
    `  Name          "${modelName}"`,
    '  Version       "4.8"',
    '  SavedModel    "True"',
    '  StoredState   "False"',
    `  SimulationTime "${(2 / state.f_line_Hz).toFixed(4)}"`,
    '  StartTime     "0.0"',
    `  TimeStep      "${(1 / (fswHz * 25)).toExponential(2)}"`,
    `  MaxStep       "${(1 / (fswHz * 15)).toExponential(2)}"`,
    '  Refine        "1"',
    '  RelTol        "1e-3"',
    '  AbsTol        "1e-5"',
    '  AlgebraicLoop "error"',
    '  JacobianMethod "auto"',
    '  FixedStepTime "1e-6"',
    '  FixedStep     "False"',
    '  Solver        "RADAU"',
    '  ThermalControl "0"',
    `  InitializationCommands "${initCmd}"`,
    '  InitialState  "struct()"',
    '  System {',
    `    Name          "${modelName}"`,
    '    Location      [80, 80, 1420, 860]',
    '    Open          on',
    '    ModelBrowserVisibility off',
    '    ModelBrowserWidth 200',
    '    ScreenColor   "white"',
    '    PaperOrientation "landscape"',
    '    PaperPositionMode "auto"',
    '    PaperType     "usletter"',
    '    PaperUnits    "inches"',
    '    ZoomFactor    "100"',
    ...blocks.map(renderPlecsBlock),
    ...conns.map(renderPlecsConn),
    '  }',
    '}',
  ].join('\n');
}

export function generateAcDcPlecsBundle(state: AcDcDesignState, res: AcDcResults): PlecsBundle {
  const baseName = sanitizePlecsIdent(`voltcraft_${state.topology}`);
  const plecsText = generateAcDcPlecsModel(state, res);

  const cdcBank = getDefaultHybridCapBank('acdc-cdc', undefined, state);
  const cdcSol = solveHybridCapBank(cdcBank, {
    fsw_kHz: res.f_emi_fundamental_kHz,
    f_lf_Hz: state.f_line_Hz * 2,
    I_hf_rms_A: res.ICdc_hf_rms_A,
    I_lf_rms_A: res.ICdc_lf_rms_A,
    V_op_pk_V: state.Vdc_bus_V * 1.04,
    Tamb_C: state.capAmbient_C ?? 45,
  });
  const cdcUnits = expandHybridCapBankForSpice(cdcBank, 'C_DC', state.Vdc_bus_V * 1.04, 4);

  const Vac_pk = state.Vac_rms_V * Math.SQRT2;
  const Rload = (state.Vdc_bus_V * state.Vdc_bus_V) / Math.max(10, state.Pout_W);

  const initScriptText = [
    `% ============================================================================`,
    `% PLECS / MATLAB / Octave Parameter Initialization Script (AC-DC PFC)`,
    `% Model: ${state.presetName} (${state.topology})`,
    `% ============================================================================`,
    `Vac_pk = ${Vac_pk.toFixed(2)};`,
    `f_line = ${state.f_line_Hz};`,
    `Vdc_ref = ${state.Vdc_bus_V};`,
    `Vdc_init = ${(state.Vdc_bus_V * 0.96).toFixed(1)};`,
    `fsw_pfc = ${state.fsw_kHz * 1e3};`,
    `Lpfc = ${(state.Lpfc_uH * 1e-6).toExponential(4)};`,
    `Rload = ${Rload.toFixed(3)};`,
    `Rsw_on = ${Math.max(0.005, res.sw.Rds_on_25C_mOhm * 1e-3).toFixed(5)};`,
    `% Hybrid DC-Link Bank: ${cdcSol.summaryLabel} (C_eff=${cdcSol.totalCapEff_uF.toFixed(1)} uF, ESR_eff=${cdcSol.esrEffAtFsw_mOhm.toFixed(2)} mOhm)`,
  ].join('\n');

  const capVerifyScriptText = buildHybridCapVerifyScript(
    `${state.presetName} Cdc Hybrid Bank (${cdcSol.summaryLabel})`,
    res.f_emi_fundamental_kHz * 1e3,
    res.ICdc_hf_rms_A,
    cdcUnits
  );

  const swIpk = Math.max(1, res.Iph_pk_A);
  const thermalXmlText = buildThermalXml([
    {
      name: res.sw.id,
      manufacturer: res.sw.manufacturer ?? 'Generic',
      vdsMax: res.sw.Vds_max_V,
      rds25_Ohm: res.sw.Rds_on_25C_mOhm * 1e-3,
      eon_mJ: 0.5 * state.Vdc_bus_V * swIpk * res.sw.tr_ns * 1e-6,
      eoff_mJ: 0.5 * state.Vdc_bus_V * swIpk * res.sw.tf_ns * 1e-6,
      rthJc_CW: res.sw.Rth_JC_CW,
    },
  ]);

  const readmeText = [
    `VoltCraft Power Electronics Studio — PLECS Standalone AC-DC PFC Bundle`,
    `========================================================================`,
    `Model:       ${state.presetName}`,
    `Topology:    ${state.topology} (${res.nPhases}-Phase)`,
    `Operating:   ${state.Vac_rms_V}Vrms @ ${state.f_line_Hz}Hz -> ${state.Vdc_bus_V}Vdc @ ${state.Pout_W}W`,
    ``,
    `Hybrid DC-Link Bank Modeled:`,
    `  - Cdc: ${cdcUnits.map((u) => `${u.refDes} (${u.cap_uF}uF, ESR=${u.esr_mOhm}mOhm, ESL=${u.esl_nH}nH)`).join(' || ')}`,
    ``,
    `Quick Start in Plexim PLECS:`,
    `  1. Extract all files into one folder.`,
    `  2. Open ${baseName}.plecs in PLECS Standalone (v4.4+).`,
    `  3. Press Ctrl+T to simulate 2 AC line cycles and inspect SCOPE_PFC.`,
  ].join('\n');

  const files: ZipEntry[] = [
    { path: `${baseName}.plecs`, content: plecsText },
    { path: 'init_params.m', content: initScriptText },
    { path: 'hybrid_cap_verification.m', content: capVerifyScriptText },
    { path: 'thermal_descriptions.xml', content: thermalXmlText },
    { path: 'README_PLECS.txt', content: readmeText },
  ];

  return {
    baseName,
    plecsText,
    initScriptText,
    capVerifyScriptText,
    thermalXmlText,
    readmeText,
    zipBytes: buildZipArchive(files),
  };
}

// ============================================================================
// 3. COMBINED 2-STAGE AC-DC PFC -> DC-DC CONVERTER PLECS GENERATOR
// ============================================================================
export function generateCombinedSystemPlecsModel(
  acdcState: AcDcDesignState,
  acdcRes: AcDcResults,
  dcdcState: DcDcDesignState,
  dcdcRes: DcDcResults,
  sharedMcu = true
): string {
  const modelName = sanitizePlecsIdent(`voltcraft_combined_${acdcState.topology}_to_${dcdcState.topology}`);
  const fswPfcHz = acdcState.fsw_kHz * 1e3;
  const fswDcHz = dcdcState.fsw_kHz * 1e3;
  const Vac_pk = acdcState.Vac_rms_V * Math.SQRT2;
  const Rload = (dcdcState.Vout_V * dcdcState.Vout_V) / Math.max(1, dcdcState.Pout_W);
  const crVal_F = dcdcRes.isLLC ? dcdcState.Cr_nF * 1e-9 : 4.7e-6;

  const cdcBank = getDefaultHybridCapBank('acdc-cdc', undefined, acdcState);
  const cdcUnits = expandHybridCapBankForSpice(cdcBank, 'C_DC', acdcState.Vdc_bus_V * 1.04, 4);
  const coutBank = getDefaultHybridCapBank('dcdc-cout', dcdcState);
  const coutUnits = expandHybridCapBankForSpice(coutBank, 'C_OUT', dcdcState.Vout_V * 1.05, 4);

  const blocks: PlecsBlockSpec[] = [];
  const conns: PlecsConnSpec[] = [];

  // Stage 1: AC-DC PFC Front-End -> Shared Hybrid C_DC Link Bus
  const front = appendAcDcFrontEndBlocks({
    blocks,
    conns,
    state: acdcState,
    res: acdcRes,
    cdcUnits,
    topY: 120,
  });

  // Shared DC-Link Bus Monitor (VM_VDC) cleanly separated before Stage 2
  const xVdcProbe = front.xAfterCaps;
  blocks.push(
    {
      blockType: 'Voltmeter',
      name: 'VM_VDC_BUS',
      x: xVdcProbe,
      y: 290,
      direction: 'down',
    },
    {
      blockType: 'Scope',
      name: 'SCOPE_VDC_BUS',
      x: xVdcProbe,
      y: 470,
      direction: 'down',
    }
  );
  conns.push(
    { srcBlock: front.busPosBlock, srcTerminal: front.busPosTerm, dstBlock: 'VM_VDC_BUS', dstTerminal: 1 },
    { srcBlock: 'VM_VDC_BUS', srcTerminal: 2, dstBlock: front.busNegBlock, dstTerminal: front.busNegTerm },
    { type: 'Signal', srcBlock: 'VM_VDC_BUS', srcTerminal: 3, dstBlock: 'SCOPE_VDC_BUS', dstTerminal: 1 }
  );

  // Stage 2: Isolated DC-DC Converter fed directly from Shared VDC_BUS
  appendDcDcStageBlocks({
    blocks,
    conns,
    state: dcdcState,
    res: dcdcRes,
    coutUnits,
    busPosAnchorBlock: front.busPosBlock,
    busPosAnchorTerm: front.busPosTerm,
    busNegAnchorBlock: front.busNegBlock,
    busNegAnchorTerm: front.busNegTerm,
    xStart: xVdcProbe + 165,
    topY: 120,
  });

  const rPriOn = Math.max(0.002, (dcdcRes.priDevice.Rds_on_25C_mOhm * 1e-3) / Math.max(1, dcdcState.nParallelPri));
  const rSecOn =
    dcdcState.rectMode === 'sync-fet'
      ? Math.max(0.001, (dcdcRes.secDevice.Rds_on_25C_mOhm * 1e-3) / Math.max(1, dcdcState.nParallelSec))
      : 0.008;

  const initCmd = [
    `Vac_pk = ${Vac_pk.toFixed(2)};`,
    `f_line = ${acdcState.f_line_Hz};`,
    `Vdc_init = ${acdcState.Vdc_bus_V.toFixed(1)};`,
    `Vin = ${acdcState.Vdc_bus_V.toFixed(1)};`,
    `fsw_pfc = ${fswPfcHz};`,
    `Lpfc = ${(acdcState.Lpfc_uH * 1e-6).toExponential(4)};`,
    `Rsw_on = ${Math.max(0.005, acdcRes.sw.Rds_on_25C_mOhm * 1e-3).toFixed(5)};`,
    `Vout_ref = ${dcdcState.Vout_V};`,
    `Vout_init = ${(dcdcState.Vout_V * 0.94).toFixed(2)};`,
    `fsw = ${fswDcHz};`,
    `Np = ${dcdcState.Np_turns};`,
    `Ns = ${dcdcState.Ns_turns};`,
    `Llk = ${(dcdcState.Llk_uH * 1e-6).toExponential(4)};`,
    `Lm = ${(dcdcState.Lm_uH * 1e-6).toExponential(4)};`,
    `Cr_tank = ${crVal_F.toExponential(4)};`,
    `Lo = ${(dcdcState.Lo_uH * 1e-6).toExponential(4)};`,
    `Rload = ${Rload.toFixed(4)};`,
    `Rpri_on = ${rPriOn.toFixed(5)};`,
    `Rsec_on = ${rSecOn.toFixed(5)};`,
    `SYSTEM_SHARED_MCU = ${sharedMcu ? 1 : 0};`,
  ].join(' ');

  return [
    'Plecs {',
    `  Name          "${modelName}"`,
    '  Version       "4.8"',
    '  SavedModel    "True"',
    '  StoredState   "False"',
    `  SimulationTime "${(1 / acdcState.f_line_Hz).toFixed(4)}"`,
    '  StartTime     "0.0"',
    `  TimeStep      "${(1 / (Math.max(fswPfcHz, fswDcHz) * 25)).toExponential(2)}"`,
    `  MaxStep       "${(1 / (Math.max(fswPfcHz, fswDcHz) * 15)).toExponential(2)}"`,
    '  Refine        "1"',
    '  RelTol        "1e-3"',
    '  AbsTol        "1e-5"',
    '  AlgebraicLoop "error"',
    '  JacobianMethod "auto"',
    '  FixedStepTime "1e-6"',
    '  FixedStep     "False"',
    '  Solver        "RADAU"',
    '  ThermalControl "0"',
    `  InitializationCommands "${initCmd}"`,
    '  InitialState  "struct()"',
    '  System {',
    `    Name          "${modelName}"`,
    '    Location      [60, 60, 1520, 880]',
    '    Open          on',
    '    ModelBrowserVisibility off',
    '    ModelBrowserWidth 200',
    '    ScreenColor   "white"',
    '    PaperOrientation "landscape"',
    '    PaperPositionMode "auto"',
    '    PaperType     "usletter"',
    '    PaperUnits    "inches"',
    '    ZoomFactor    "100"',
    ...blocks.map(renderPlecsBlock),
    ...conns.map(renderPlecsConn),
    '  }',
    '}',
  ].join('\n');
}

export function generateCombinedSystemPlecsBundle(
  acdcState: AcDcDesignState,
  acdcRes: AcDcResults,
  dcdcState: DcDcDesignState,
  dcdcRes: DcDcResults,
  sharedMcu = true
): PlecsBundle {
  const baseName = sanitizePlecsIdent(`voltcraft_combined_${acdcState.topology}_to_${dcdcState.topology}`);
  const plecsText = generateCombinedSystemPlecsModel(acdcState, acdcRes, dcdcState, dcdcRes, sharedMcu);

  const cdcBank = getDefaultHybridCapBank('acdc-cdc', undefined, acdcState);
  const cdcUnits = expandHybridCapBankForSpice(cdcBank, 'C_DC', acdcState.Vdc_bus_V * 1.04, 4);
  const coutBank = getDefaultHybridCapBank('dcdc-cout', dcdcState);
  const coutUnits = expandHybridCapBankForSpice(coutBank, 'C_OUT', dcdcState.Vout_V * 1.05, 4);

  const Rload = (dcdcState.Vout_V * dcdcState.Vout_V) / Math.max(1, dcdcState.Pout_W);
  const crVal_F = dcdcRes.isLLC ? dcdcState.Cr_nF * 1e-9 : 4.7e-6;
  const rPriOn = Math.max(0.002, (dcdcRes.priDevice.Rds_on_25C_mOhm * 1e-3) / Math.max(1, dcdcState.nParallelPri));
  const rSecOn =
    dcdcState.rectMode === 'sync-fet'
      ? Math.max(0.001, (dcdcRes.secDevice.Rds_on_25C_mOhm * 1e-3) / Math.max(1, dcdcState.nParallelSec))
      : 0.008;

  const initScriptText = [
    `% ============================================================================`,
    `% PLECS / MATLAB / Octave Parameter Initialization (COMBINED AC-DC -> DC-DC)`,
    `% Stage 1: ${acdcState.presetName} (${acdcState.Vac_rms_V}Vac -> ${acdcState.Vdc_bus_V}Vdc)`,
    `% Stage 2: ${dcdcState.presetName} (${dcdcState.Vin_nom_V}Vdc -> ${dcdcState.Vout_V}Vdc @ ${dcdcState.Pout_W}W)`,
    `% Control Arch: ${sharedMcu ? 'Same Shared MCU (ePWM Sync + Direct Vdc FF)' : 'Separate MCUs (Isolated PG_OK Handshake)'}`,
    `% ============================================================================`,
    `SYSTEM_SHARED_MCU = ${sharedMcu ? 1 : 0};`,
    `Vac_pk = ${(acdcState.Vac_rms_V * Math.SQRT2).toFixed(2)};`,
    `f_line = ${acdcState.f_line_Hz};`,
    `Vdc_init = ${acdcState.Vdc_bus_V.toFixed(1)};`,
    `Vin = ${acdcState.Vdc_bus_V.toFixed(1)};`,
    `fsw_pfc = ${acdcState.fsw_kHz * 1e3};`,
    `Lpfc = ${(acdcState.Lpfc_uH * 1e-6).toExponential(4)};`,
    `Rsw_on = ${Math.max(0.005, acdcRes.sw.Rds_on_25C_mOhm * 1e-3).toFixed(5)};`,
    `Vout_ref = ${dcdcState.Vout_V};`,
    `Vout_init = ${(dcdcState.Vout_V * 0.94).toFixed(2)};`,
    `fsw = ${dcdcState.fsw_kHz * 1e3};`,
    `Np = ${dcdcState.Np_turns};`,
    `Ns = ${dcdcState.Ns_turns};`,
    `Llk = ${(dcdcState.Llk_uH * 1e-6).toExponential(4)};`,
    `Lm = ${(dcdcState.Lm_uH * 1e-6).toExponential(4)};`,
    `Cr_tank = ${crVal_F.toExponential(4)};`,
    `Lo = ${(dcdcState.Lo_uH * 1e-6).toExponential(4)};`,
    `Rload = ${Rload.toFixed(4)};`,
    `Rpri_on = ${rPriOn.toFixed(5)};`,
    `Rsec_on = ${rSecOn.toFixed(5)};`,
  ].join('\n');

  const capVerifyScriptText = [
    buildHybridCapVerifyScript(
      `Combined Stage 1 Cdc (${acdcState.presetName})`,
      acdcRes.f_emi_fundamental_kHz * 1e3,
      acdcRes.ICdc_hf_rms_A,
      cdcUnits
    ),
    '',
    buildHybridCapVerifyScript(
      `Combined Stage 2 Cout (${dcdcState.presetName})`,
      dcdcRes.fRipple_out_kHz * 1e3,
      dcdcRes.ICo_rms_A,
      coutUnits
    ),
  ].join('\n');

  const swIpk = Math.max(1, acdcRes.Iph_pk_A);
  const priIpk = Math.max(1, dcdcRes.I_lead_turnoff_A, (dcdcState.Pout_W / Math.max(10, dcdcState.Vin_nom_V)) * 1.4);
  const secIpk = Math.max(1, dcdcRes.Iout_total_A);
  const thermalXmlText = buildThermalXml([
    {
      name: acdcRes.sw.id,
      manufacturer: acdcRes.sw.manufacturer ?? 'Generic',
      vdsMax: acdcRes.sw.Vds_max_V,
      rds25_Ohm: acdcRes.sw.Rds_on_25C_mOhm * 1e-3,
      eon_mJ: 0.5 * acdcState.Vdc_bus_V * swIpk * acdcRes.sw.tr_ns * 1e-6,
      eoff_mJ: 0.5 * acdcState.Vdc_bus_V * swIpk * acdcRes.sw.tf_ns * 1e-6,
      rthJc_CW: acdcRes.sw.Rth_JC_CW,
    },
    {
      name: dcdcRes.priDevice.id,
      manufacturer: dcdcRes.priDevice.manufacturer ?? 'Generic',
      vdsMax: dcdcRes.priDevice.Vds_max_V,
      rds25_Ohm: dcdcRes.priDevice.Rds_on_25C_mOhm * 1e-3,
      eon_mJ: 0.5 * dcdcState.Vin_nom_V * priIpk * dcdcRes.priDevice.tr_ns * 1e-6,
      eoff_mJ: 0.5 * dcdcState.Vin_nom_V * priIpk * dcdcRes.priDevice.tf_ns * 1e-6,
      rthJc_CW: dcdcRes.priDevice.Rth_JC_CW,
    },
    {
      name: dcdcRes.secDevice.id,
      manufacturer: dcdcRes.secDevice.manufacturer ?? 'Generic',
      vdsMax: dcdcRes.secDevice.Vds_max_V,
      rds25_Ohm: dcdcRes.secDevice.Rds_on_25C_mOhm * 1e-3,
      eon_mJ: 0.5 * dcdcRes.Vsec_ideal_pk_V * secIpk * dcdcRes.secDevice.tr_ns * 1e-6,
      eoff_mJ: 0.5 * dcdcRes.Vsec_ideal_pk_V * secIpk * dcdcRes.secDevice.tf_ns * 1e-6,
      rthJc_CW: dcdcRes.secDevice.Rth_JC_CW,
    },
  ]);

  const readmeText = [
    `VoltCraft Power Electronics Studio — COMBINED 2-STAGE PLECS Bundle`,
    `========================================================================`,
    `Stage 1 (PFC):   ${acdcState.topology} (${acdcState.Vac_rms_V}Vac -> ${acdcState.Vdc_bus_V}Vdc)`,
    `Stage 2 (DC-DC): ${dcdcState.topology} (${dcdcState.Vin_nom_V}Vdc -> ${dcdcState.Vout_V}Vdc @ ${dcdcState.Pout_W}W)`,
    `Control Arch:    ${sharedMcu ? 'Same Shared Dual-Stage MCU (Synchronized PWM + Direct Vdc FF)' : 'Separate MCUs (Isolated PG_OK + Fault_Trip Handshake)'}`,
    `Connected Link:  Shared Hybrid C_DC Bus feeds Primary Bridge directly`,
    ``,
    `Quick Start in Plexim PLECS:`,
    `  1. Extract all files into one folder.`,
    `  2. Open ${baseName}.plecs in PLECS Standalone (v4.4+).`,
    `  3. Press Ctrl+T to simulate full AC-DC -> DC-DC cascade and inspect SCOPE_VDC_BUS & SCOPE_VOUT.`,
  ].join('\n');

  const files: ZipEntry[] = [
    { path: `${baseName}.plecs`, content: plecsText },
    { path: 'init_params.m', content: initScriptText },
    { path: 'hybrid_cap_verification.m', content: capVerifyScriptText },
    { path: 'thermal_descriptions.xml', content: thermalXmlText },
    { path: 'README_PLECS.txt', content: readmeText },
  ];

  return {
    baseName,
    plecsText,
    initScriptText,
    capVerifyScriptText,
    thermalXmlText,
    readmeText,
    zipBytes: buildZipArchive(files),
  };
}

/**
 * Geometric audit utility: parses all Block Position [x, y] coordinates from a
 * generated .plecs file and returns any pairs closer than minDx x minDy.
 */
export function findPlecsBlockOverlaps(
  plecsText: string,
  minDx = 65,
  minDy = 65
): { a: string; b: string; dx: number; dy: number }[] {
  const blocks: { name: string; x: number; y: number }[] = [];
  const blockRegex = /Block\s*\{[\s\S]*?Name\s+"([^"]+)"[\s\S]*?Position\s+\[(\d+),\s*(\d+)\]/g;
  let m: RegExpExecArray | null;
  while ((m = blockRegex.exec(plecsText)) !== null) {
    blocks.push({ name: m[1], x: Number(m[2]), y: Number(m[3]) });
  }
  const overlaps: { a: string; b: string; dx: number; dy: number }[] = [];
  for (let i = 0; i < blocks.length; i++) {
    for (let j = i + 1; j < blocks.length; j++) {
      const dx = Math.abs(blocks[i].x - blocks[j].x);
      const dy = Math.abs(blocks[i].y - blocks[j].y);
      if (dx < minDx && dy < minDy) {
        overlaps.push({ a: blocks[i].name, b: blocks[j].name, dx, dy });
      }
    }
  }
  return overlaps;
}
