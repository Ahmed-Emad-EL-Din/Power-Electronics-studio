import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACDC_PRESETS,
  DCDC_PRESETS,
  DcDcDesignState,
  SEMICONDUCTOR_DATABASE,
} from '../data/databases';
import {
  generateManufacturerMosfetSubckt,
  generateManufacturerRectifierSubckt,
  generatePfcBoostDiodeSubckt,
} from './spiceModelLibrary';
import { solveAcDcDesign } from './acdcEngine';
import { solveDcDcDesign, syncDcdcTurnsRatioState } from './dcdcEngine';
import { DCDC_DEFAULT_LOCKS, DcDcLockableKey, optimizeDcDcUnlocked } from './autoOptimizer';
import { evaluateDesignAlerts } from './designAlerts';
import {
  extractCircuitCapacitors,
  extractCircuitInductors,
  rankInductorCoreMaterials,
  rankTransformerCoresForDcDc,
  solveCapacitorBank,
  solveCustomInductorDesign,
} from './passiveDesignEngine';
import { createAiToolSession } from './aiToolRegistry';
import katex from 'katex';
import { buildDesignReportModel } from '../utils/designReportModel';
import { calcStringToTexLines } from '../utils/mathTexHelper';
import { buildAiDesignSnapshot } from './aiAgentEngine';
import { computeCoupledStagePatches, solveSystemCascade } from './systemCascadeEngine';
import {
  buildProjectFile,
  createHistory,
  parseImportedProjectJson,
  pushHistoryState,
  redoHistory,
  undoHistory,
} from './projectStorage';
import { runTransientLoadStep } from './transientOdeSolver';
import { runMonteCarloAnalysis } from './monteCarloEngine';
import {
  generateAcDcLtspiceAsc,
  generateAcDcQspiceBundle,
  generateAcDcSpiceNetlist,
  generateControlFirmwareHeader,
  generateDcDcLtspiceAsc,
  generateDcDcQspiceBundle,
  generateDcDcSpiceNetlist,
} from './spiceNetlistExporter';
import {
  clearAiProviderConfig,
  getDefaultAiProviderConfig,
  isGeminiThinkingLevelSupported,
  isOpenAiReasoningModel,
  normalizeAiProviderConfig,
  sanitizeApiKey,
  toServerAiConfig,
  validateAiProviderConfig,
} from './aiProviderConfig';

function makeUnlockedDcdcLocks(): Record<DcDcLockableKey, boolean> {
  const unlocked = { ...DCDC_DEFAULT_LOCKS };
  for (const k of Object.keys(unlocked) as DcDcLockableKey[]) {
    unlocked[k] = false;
  }
  // Keep user specs fixed as in real design session
  unlocked.Vin_nom_V = true;
  unlocked.Vin_min_V = true;
  unlocked.Vin_max_V = true;
  unlocked.Vout_V = true;
  unlocked.Pout_W = true;
  unlocked.fsw_kHz = true;
  unlocked.Tamb_C = true;
  unlocked.Tj_max_limit_C = true;
  return unlocked;
}

const UNLOCKED_INDUCTOR_LOCKS = {
  targetL_uH: false,
  coreId: false,
  materialId: false,
  turnsN: false,
  airGap_mm: false,
  wireAwg: false,
  parallelStrands: false,
  conductorForm: false,
};

const UNLOCKED_CAP_BANK_LOCKS = {
  targetC_uF: false,
  partId: false,
  seriesCount: false,
  parallelCount: false,
};

function solvePassiveRows(
  dcdcState: DcDcDesignState,
  dcdcRes: ReturnType<typeof solveDcDcDesign>,
  acdcState = ACDC_PRESETS[0].state,
  acdcRes = solveAcDcDesign(ACDC_PRESETS[0].state)
) {
  const dcdcIndReqs = extractCircuitInductors('dcdc', dcdcState, dcdcRes, acdcState, acdcRes);
  const dcdcInductorRows = dcdcIndReqs.map((req) => ({
    req,
    sol: solveCustomInductorDesign(req, {}, UNLOCKED_INDUCTOR_LOCKS),
  }));
  const dcdcCapReqs = extractCircuitCapacitors('dcdc', dcdcState, dcdcRes, acdcState, acdcRes);
  const dcdcCapRows = dcdcCapReqs.map((req) => ({
    req,
    sol: solveCapacitorBank(req, {}, UNLOCKED_CAP_BANK_LOCKS),
  }));
  const acdcIndReqs = extractCircuitInductors('acdc', dcdcState, dcdcRes, acdcState, acdcRes);
  const acdcInductorRows = acdcIndReqs.map((req) => ({
    req,
    sol: solveCustomInductorDesign(req, {}, UNLOCKED_INDUCTOR_LOCKS),
  }));
  const acdcCapReqs = extractCircuitCapacitors('acdc', dcdcState, dcdcRes, acdcState, acdcRes);
  const acdcCapRows = acdcCapReqs.map((req) => ({
    req,
    sol: solveCapacitorBank(req, {}, UNLOCKED_CAP_BANK_LOCKS),
  }));
  return { dcdcInductorRows, dcdcCapRows, acdcInductorRows, acdcCapRows };
}

test('Steinmetz iGSE: TDK PC95 PQ 50/50 at 100 kHz and Bpk = 73.2 mT yields Pv ~ 126 kW/m^3 and Pcore ~ 4.68 W', () => {
  const base: DcDcDesignState = {
    ...DCDC_PRESETS[0].state,
    coreId: 'pq5050',
    materialId: 'PC95',
    fsw_kHz: 100,
    Np_turns: 30,
    Ns_turns: 5,
    turnsRatio_n: 6.0,
  };
  const res = solveDcDcDesign(base);
  assert.ok(
    res.Bpk_mT >= 68 && res.Bpk_mT <= 78,
    `Expected Bpk_mT near 73.2 mT, got ${res.Bpk_mT}`
  );
  // Verify exact Steinmetz scaling at 100 kHz / 73.2 mT for PC95 (k_si=2.78, alpha=1.54, beta=2.68)
  const pv_at_73_2mT_kW_m3 =
    (res.material.k_si * Math.pow(100_000, res.material.alpha) * Math.pow(0.0732, res.material.beta)) /
    1000;
  const pcore_at_73_2mT_W = pv_at_73_2mT_kW_m3 * 1000 * (res.core.Ve_mm3 * 1e-9);
  assert.ok(
    pv_at_73_2mT_kW_m3 >= 115 && pv_at_73_2mT_kW_m3 <= 140,
    `Expected PC95 Pv_se ~126 kW/m^3, got ${pv_at_73_2mT_kW_m3.toFixed(2)}`
  );
  assert.ok(
    pcore_at_73_2mT_W >= 4.2 && pcore_at_73_2mT_W <= 5.2,
    `Expected PC95 Pcore ~4.68 W on PQ50/50, got ${pcore_at_73_2mT_W.toFixed(2)}`
  );
  assert.ok(
    res.Pcore_se_W >= 3.5 && res.Pcore_se_W <= 7.0,
    `Expected solved Pcore_se_W on PQ50/50 ~4.68 W range, got ${res.Pcore_se_W.toFixed(2)}`
  );
});

test('Turns Ratio Sync: integer Np/Ns and turnsRatio_n stay 100% synchronized across edits & solver', () => {
  const fbBase: DcDcDesignState = {
    ...DCDC_PRESETS[0].state,
    txType: 'full-bridge',
    Np_turns: 46,
    Ns_turns: 8,
  };
  const syncedFb = syncDcdcTurnsRatioState({ Np_turns: 46, Ns_turns: 8 }, fbBase, 'Np_turns');
  assert.equal(syncedFb.Np_turns, 46);
  assert.equal(syncedFb.Ns_turns, 8);
  assert.equal(syncedFb.turnsRatio_n, 5.75);

  const resFb = solveDcDcDesign(syncedFb);
  // Deff = 5.75 * 48 / 400 = 0.69
  assert.ok(Math.abs(resFb.Deff_nom - 0.69) < 0.005, `Expected Deff ~ 0.69, got ${resFb.Deff_nom}`);
  // Full-bridge Vsec_ideal_max = 430 / 5.75 = 74.78 V
  assert.ok(
    Math.abs(resFb.Vsec_ideal_max_V - 74.78) < 0.25,
    `Expected Full-Bridge Vsec_ideal_max ~ 74.78V, got ${resFb.Vsec_ideal_max_V}`
  );

  // Center-tapped Vsec_ideal_max = 2 * 430 / 5.75 = 149.57 V
  const resCt = solveDcDcDesign({ ...syncedFb, txType: 'center-tapped' });
  assert.ok(
    Math.abs(resCt.Vsec_ideal_max_V - 149.57) < 0.3,
    `Expected Center-Tapped Vsec_ideal_max ~ 149.57V, got ${resCt.Vsec_ideal_max_V}`
  );

  // Editing turnsRatio_n updates integer turns cleanly
  const ratioEdited = syncDcdcTurnsRatioState(
    { turnsRatio_n: 6.0 },
    { ...DCDC_PRESETS[0].state, turnsRatio_n: 6.0 },
    'turnsRatio_n'
  );
  assert.equal(
    Number((ratioEdited.Np_turns / ratioEdited.Ns_turns).toFixed(4)),
    ratioEdited.turnsRatio_n
  );
});

test('Analog Compensator RC Impedance Scaling: R2 in 10–220 kOhm, C1 <= 47 nF, C2 >= 15 pF with exact zero/pole preservation', () => {
  const state: DcDcDesignState = {
    ...DCDC_PRESETS[0].state,
    controlType: '2p2z',
    fc_target_kHz: 10.0,
    pm_target_deg: 60,
  };
  const res = solveDcDcDesign(state);
  assert.ok(
    res.R2_kOhm >= 10 && res.R2_kOhm <= 220,
    `Expected practical R2_kOhm in [10, 220], got ${res.R2_kOhm}`
  );
  assert.ok(res.C1_nF <= 47, `Expected C0G-friendly C1_nF <= 47 nF, got ${res.C1_nF}`);
  assert.ok(res.C2_pF >= 15, `Expected noise-immune C2_pF >= 15 pF, got ${res.C2_pF}`);

  // Verify zero frequency fz1 = 1 / (2*pi*R2*C1) matches res.fz1_kHz within 1%
  const fz1_from_rc_kHz = 1 / (2 * Math.PI * (res.R2_kOhm * 1e3) * (res.C1_nF * 1e-9)) / 1e3;
  const relErr = Math.abs(fz1_from_rc_kHz - res.fz1_kHz) / res.fz1_kHz;
  assert.ok(
    relErr < 0.01,
    `Expected RC zero frequency ${fz1_from_rc_kHz.toFixed(3)} kHz to match fz1_kHz ${res.fz1_kHz.toFixed(3)} kHz`
  );
});

test('Auto-Optimizer (Unlocked): solves 400V->48V 3.3kW PSFB cleanly across 100kHz & 200kHz with 0 Danger, 0 Warning, 200V SR, and compact core', () => {
  const acdcState = ACDC_PRESETS[0].state;
  const acdcRes = solveAcDcDesign(acdcState);
  const unlocked = makeUnlockedDcdcLocks();

  for (const fsw_kHz of [100, 200]) {
    for (const txType of ['center-tapped', 'full-bridge'] as const) {
      const init: DcDcDesignState = {
        ...DCDC_PRESETS[0].state,
        fsw_kHz,
        txType,
        coreId: 'ee703332',
        materialId: '3C97',
        Np_turns: 46,
        Ns_turns: 8,
        turnsRatio_n: 5.75,
        secDeviceId: 'IPP041N15N5',
        slopeFactor_mc: 1.8,
        fc_target_kHz: 4.2,
      };
      const opt = optimizeDcDcUnlocked(init, init, 'fsw_kHz', unlocked);
      const res = solveDcDcDesign(opt.nextState);
      const alerts = evaluateDesignAlerts({
        dcdcState: opt.nextState,
        dcdcRes: res,
        acdcState,
        acdcRes,
      });

      const dcdcDangers = alerts.danger.filter((a) => a.domain === 'dcdc');
      const dcdcWarnings = alerts.warning.filter((a) => a.domain === 'dcdc');

      assert.equal(
        dcdcDangers.length,
        0,
        `Expected 0 DC-DC Danger alerts for ${fsw_kHz}kHz ${txType}, got: ${dcdcDangers
          .map((a) => `${a.id}: ${a.metric}`)
          .join('; ')}`
      );
      assert.equal(
        dcdcWarnings.length,
        0,
        `Expected 0 DC-DC Warning alerts for ${fsw_kHz}kHz ${txType}, got: ${dcdcWarnings
          .map((a) => `${a.id}: ${a.metric}`)
          .join('; ')}`
      );

      // Turns ratio synced
      assert.equal(
        Number((opt.nextState.Np_turns / opt.nextState.Ns_turns).toFixed(4)),
        opt.nextState.turnsRatio_n
      );
      // Core is no longer grossly underutilized
      assert.ok(
        res.saturationCheck.utilization_100C_pct >= 12,
        `Expected core flux utilization >= 12%, got ${res.saturationCheck.utilization_100C_pct}% on ${opt.nextState.coreId}`
      );
      // Subharmonic Qp healthy
      assert.ok(
        res.Qp_subharmonic <= 1.25 && res.slopeStable,
        `Expected Qp <= 1.25, got ${res.Qp_subharmonic}`
      );
      // Crossover frequency safely above f0
      assert.ok(
        opt.nextState.fc_target_kHz >= res.f0_lc_kHz * 1.6,
        `Expected fc (${opt.nextState.fc_target_kHz} kHz) >= 1.6*f0 (${(res.f0_lc_kHz * 1.6).toFixed(2)} kHz)`
      );
      // SR FET margin healthy (< 88% unclamped)
      const secUnclampedUtil = (res.Vsec_unclamped_pk_V / res.secDevice.Vds_max_V) * 100;
      assert.ok(
        secUnclampedUtil <= 88,
        `Expected SR unclamped voltage util <= 88%, got ${secUnclampedUtil.toFixed(1)}% (${res.secDevice.id})`
      );
    }
  }
});

test('Design Alerts & Report Model catch Rev 4 regressions accurately (oversized core, subharmonic risk, fc near f0, 150V SR margin, 2P2Z wording, HF MLCC note)', () => {
  const acdcState = ACDC_PRESETS[0].state;
  const acdcRes = solveAcDcDesign(acdcState);

  // Reproduce Rev 4 broken configuration
  const rev4Broken: DcDcDesignState = {
    ...DCDC_PRESETS[0].state,
    fsw_kHz: 200,
    txType: 'full-bridge',
    controlType: 'pcmc',
    coreId: 'ee703332',
    materialId: '3C97',
    Np_turns: 46,
    Ns_turns: 8,
    turnsRatio_n: 5.75,
    secDeviceId: 'IPP041N15N5',
    nParallelSec: 2,
    Lo_uH: 4.5,
    Co_uF: 400,
    slopeFactor_mc: 1.8,
    fc_target_kHz: 4.2,
  };
  const resBroken = solveDcDcDesign(rev4Broken);
  const alertsBroken = evaluateDesignAlerts({
    dcdcState: rev4Broken,
    dcdcRes: resBroken,
    acdcState,
    acdcRes,
  });

  const ids = new Set(alertsBroken.all.map((a) => a.id));
  assert.ok(ids.has('dcdc-pcmc-slope'), 'Expected dcdc-pcmc-slope alert on mc=1.80, Deff=69%');
  assert.ok(ids.has('dcdc-sec-vds-warn'), 'Expected dcdc-sec-vds-warn on 150V SR with ~138V unclamped peak');
  assert.ok(ids.has('dcdc-core-oversized'), 'Expected dcdc-core-oversized on EE70/33/32 at low Bpk & high Pcu');
  assert.ok(ids.has('dcdc-ctrl-fc-near-f0') || ids.has('dcdc-ctrl-retune'), 'Expected crossover warning near LC f0');

  const oversizedAlert = alertsBroken.all.find((a) => a.id === 'dcdc-core-oversized');
  assert.ok(
    oversizedAlert?.fixes && oversizedAlert.fixes.length > 0,
    'Expected 1-click compact core fix on dcdc-core-oversized alert'
  );

  // Verify 2P2Z report wording is single-zero Type-II and marks PCMC Step D6.1 N/A
  const state2p2z: DcDcDesignState = {
    ...rev4Broken,
    controlType: '2p2z',
    fc_target_kHz: 10.0,
  };
  const res2p2z = solveDcDcDesign(state2p2z);
  const alerts2p2z = evaluateDesignAlerts({
    dcdcState: state2p2z,
    dcdcRes: res2p2z,
    acdcState,
    acdcRes,
  });
  const passiveRows = solvePassiveRows(state2p2z, res2p2z, acdcState, acdcRes);
  const report = buildDesignReportModel({
    scope: 'dcdc',
    dcdcState: state2p2z,
    dcdcRes: res2p2z,
    acdcState,
    acdcRes,
    ...passiveRows,
    scopedAlerts: alerts2p2z,
  });

  const ch5 = report.chapters.find((c) => c.id === 'ch-dcdc-passives');
  const ch6 = report.chapters.find((c) => c.id === 'ch-dcdc-ctrl');
  assert.ok(ch5 && ch6, 'Expected Chapters 5 and 6 in DC-DC report');
  const ch5Text = JSON.stringify(ch5);
  assert.ok(
    ch5Text.includes('MLCC') && ch5Text.includes('10 µF'),
    'Expected Chapter 5 to include parallel HF MLCC decoupling guidance for polymer/film Co'
  );
  const ch6Text = JSON.stringify(ch6);
  assert.ok(
    !ch6Text.includes('Places dual zeros'),
    'Type-II 2P2Z report must NOT claim dual zeros'
  );
  assert.ok(
    ch6Text.includes('N/A (2P2Z Mode)'),
    'Non-PCMC Step D6.1 verdict should read N/A (2P2Z Mode)'
  );
});

test('AI Provider Config validation, normalization, and server payload stripping', () => {
  const def = getDefaultAiProviderConfig('gemini');
  assert.equal(def.provider, 'gemini');
  assert.equal(validateAiProviderConfig(def), null);

  const openaiMissingKey = getDefaultAiProviderConfig('openai');
  assert.ok(validateAiProviderConfig(openaiMissingKey)?.includes('OpenAI requires'));

  const openaiValid = normalizeAiProviderConfig({
    provider: 'openai',
    apiKey: '  sk-test-123  ',
    model: ' gpt-4o ',
  });
  assert.equal(validateAiProviderConfig(openaiValid), null);
  assert.equal(toServerAiConfig(openaiValid).apiKey, 'sk-test-123');

  const claudeMissingKey = getDefaultAiProviderConfig('anthropic');
  assert.ok(validateAiProviderConfig(claudeMissingKey)?.includes('Anthropic Claude requires'));

  const compatValid = normalizeAiProviderConfig({
    provider: 'openai-compatible',
    baseUrl: 'http://localhost:11434/v1',
    model: 'qwen2.5:14b',
    apiKey: '',
  });
  assert.equal(validateAiProviderConfig(compatValid), null);

  const cleared = clearAiProviderConfig();
  assert.equal(cleared.provider, 'gemini');
  assert.equal(cleared.apiKey, '');

  assert.equal(isOpenAiReasoningModel('o3-mini'), true);
  assert.equal(isOpenAiReasoningModel('gpt-5-mini'), true);
  assert.equal(isOpenAiReasoningModel('openai/o4-mini'), true);
  assert.equal(isOpenAiReasoningModel('gpt-4o'), false);
  assert.equal(isOpenAiReasoningModel('claude-sonnet-4-20250514'), false);
});

test('Low-line (Vin_min_V) PCMC subharmonic oscillation & 1-click slope fix restore stability across entire line range', () => {
  const acdcState = ACDC_PRESETS[0].state;
  const acdcRes = solveAcDcDesign(acdcState);

  // Set slopeFactor_mc so nominal 400V looks borderline stable, but low-line Vin_min=360V hits Qp_wc > 2.0
  const lowLineRisk: DcDcDesignState = {
    ...DCDC_PRESETS[0].state,
    Vin_min_V: 350,
    Np_turns: 21,
    Ns_turns: 3,
    turnsRatio_n: 7.0,
    slopeFactor_mc: 1.55,
  };
  const resLowLine = solveDcDcDesign(lowLineRisk);
  assert.ok(
    resLowLine.Deff_max > resLowLine.Deff_nom,
    'Expected Deff_max at Vin_min to exceed nominal Deff_nom'
  );
  assert.ok(
    resLowLine.Qp_subharmonic_wc > 2.0,
    `Expected low-line Qp_subharmonic_wc > 2.0, got ${resLowLine.Qp_subharmonic_wc}`
  );

  const alerts = evaluateDesignAlerts({
    dcdcState: lowLineRisk,
    dcdcRes: resLowLine,
    acdcState,
    acdcRes,
  });
  const slopeAlert = alerts.danger.find((a) => a.id === 'dcdc-pcmc-slope');
  assert.ok(slopeAlert, 'Expected Danger dcdc-pcmc-slope alert when low-line Qp_wc > 2.0');
  const fix = slopeAlert?.fixes?.[0];
  assert.ok(fix?.dcdcPatch?.slopeFactor_mc, 'Expected 1-click slopeFactor_mc fix');

  const fixedState: DcDcDesignState = { ...lowLineRisk, ...fix!.dcdcPatch };
  const fixedRes = solveDcDcDesign(fixedState);
  assert.ok(
    fixedRes.slopeStable && fixedRes.slopeStable_wc && fixedRes.Qp_subharmonic_wc <= 1.25,
    `Expected fixed Qp_subharmonic_wc <= 1.25, got ${fixedRes.Qp_subharmonic_wc}`
  );
});

test('Low-line duty cycle saturation (D_loss & D_applied_max > 0.94) triggers dcdc-duty-saturation with 1-click fix', () => {
  const acdcState = ACDC_PRESETS[0].state;
  const acdcRes = solveAcDcDesign(acdcState);

  const satState: DcDcDesignState = {
    ...DCDC_PRESETS[0].state,
    Vin_min_V: 340,
    Np_turns: 22,
    Ns_turns: 3,
    turnsRatio_n: Number((22 / 3).toFixed(4)),
    Llk_uH: 6.5,
  };
  const satRes = solveDcDcDesign(satState);
  assert.ok(
    satRes.Dloss_max > 0 && satRes.D_applied_max > 0.94,
    `Expected D_applied_max > 0.94 with positive Dloss_max, got D_app=${satRes.D_applied_max}, Dloss=${satRes.Dloss_max}`
  );

  const alerts = evaluateDesignAlerts({
    dcdcState: satState,
    dcdcRes: satRes,
    acdcState,
    acdcRes,
  });
  const dutyAlert = alerts.all.find((a) => a.id === 'dcdc-duty-saturation');
  assert.ok(dutyAlert, 'Expected dcdc-duty-saturation alert when D_applied_max > 0.94');
  assert.ok(dutyAlert?.fixes?.[0]?.dcdcPatch?.Np_turns, 'Expected 1-click Np reduction fix');
});

test('Page 9 ch-audit catches chapter failures even if scopedAlerts is empty', () => {
  const acdcState = ACDC_PRESETS[0].state;
  const acdcRes = solveAcDcDesign(acdcState);
  const brokenState: DcDcDesignState = {
    ...DCDC_PRESETS[0].state,
    controlType: 'pcmc',
    slopeFactor_mc: 1.05,
    fc_target_kHz: 0.4,
  };
  const brokenRes = solveDcDcDesign(brokenState);
  const passiveRows = solvePassiveRows(brokenState, brokenRes, acdcState, acdcRes);

  const reportWithEmptyAlerts = buildDesignReportModel({
    scope: 'dcdc',
    dcdcState: brokenState,
    dcdcRes: brokenRes,
    acdcState,
    acdcRes,
    ...passiveRows,
    scopedAlerts: { danger: [], warning: [], all: [] },
  });

  const chCtrl = reportWithEmptyAlerts.chapters.find((c) => c.id === 'ch-dcdc-ctrl');
  const chAudit = reportWithEmptyAlerts.chapters.find((c) => c.id === 'ch-audit');
  assert.ok(chCtrl && chCtrl.status === 'fail', `Expected ch-dcdc-ctrl to fail, got ${chCtrl?.status}`);
  assert.ok(chAudit && chAudit.status === 'fail', `Expected ch-audit to aggregate chapter fail even with empty scopedAlerts, got ${chAudit?.status}`);
  assert.ok(
    JSON.stringify(chAudit.paramTables).includes('FAIL'),
    'Expected Page 9 Sign-Off Matrix to list chapter FAIL status'
  );
});

test('All built-in DCDC_PRESETS (0..3) and ACDC_PRESETS (0..4) solve with 0 Danger alerts and DCDC_PRESETS[0] has 0 Danger / 0 Warning', () => {
  const baseAcdc = ACDC_PRESETS[0].state;
  const baseAcdcRes = solveAcDcDesign(baseAcdc);
  const baseDcdc = DCDC_PRESETS[0].state;
  const baseDcdcRes = solveDcDcDesign(baseDcdc);

  const bootAlerts = evaluateDesignAlerts({
    dcdcState: baseDcdc,
    dcdcRes: baseDcdcRes,
    acdcState: baseAcdc,
    acdcRes: baseAcdcRes,
  });
  assert.equal(bootAlerts.danger.length, 0, `Expected 0 Danger on boot presets, got ${bootAlerts.danger.map((a) => a.id).join(', ')}`);
  assert.equal(bootAlerts.warning.length, 0, `Expected 0 Warning on boot presets, got ${bootAlerts.warning.map((a) => a.id).join(', ')}`);

  for (const preset of DCDC_PRESETS) {
    const res = solveDcDcDesign(preset.state);
    const al = evaluateDesignAlerts({
      dcdcState: preset.state,
      dcdcRes: res,
      acdcState: baseAcdc,
      acdcRes: baseAcdcRes,
    });
    assert.equal(
      al.danger.length,
      0,
      `Expected 0 Danger alerts on DC-DC preset "${preset.id}", got: ${al.danger.map((a) => a.id).join(', ')}`
    );
  }

  for (const preset of ACDC_PRESETS) {
    const res = solveAcDcDesign(preset.state);
    const al = evaluateDesignAlerts({
      dcdcState: baseDcdc,
      dcdcRes: baseDcdcRes,
      acdcState: preset.state,
      acdcRes: res,
    });
    assert.equal(
      al.danger.length,
      0,
      `Expected 0 Danger alerts on AC-DC preset "${preset.id}", got: ${al.danger.map((a) => a.id).join(', ')}`
    );
  }
});

test('Analog compensator C0G/NP0 RC bounds hold across pcmc, 2p2z, type-iii, and both 48V and 400V outputs', () => {
  for (const controlType of ['pcmc', '2p2z', 'type-iii'] as const) {
    for (const Vout_V of [48, 400]) {
      const state: DcDcDesignState = {
        ...DCDC_PRESETS[0].state,
        controlType,
        Vout_V,
        Np_turns: Vout_V === 400 ? 16 : 18,
        Ns_turns: Vout_V === 400 ? 20 : 3,
        turnsRatio_n: Vout_V === 400 ? 0.8 : 6.0,
        Lo_uH: Vout_V === 400 ? 140 : 4.5,
        Co_uF: Vout_V === 400 ? 220 : 440,
        ESR_Co_mOhm: Vout_V === 400 ? 120 : 7.5,
        fc_target_kHz: 7.5,
        pm_target_deg: 60,
      };
      const res = solveDcDcDesign(state);
      assert.ok(
        res.R1_kOhm >= 4.7,
        `[${controlType} ${Vout_V}V] Expected R1_kOhm >= 4.7, got ${res.R1_kOhm}`
      );
      assert.ok(
        res.R2_kOhm >= 10 && res.R2_kOhm <= 220,
        `[${controlType} ${Vout_V}V] Expected R2_kOhm in [10, 220], got ${res.R2_kOhm}`
      );
      assert.ok(
        res.C1_nF <= 47,
        `[${controlType} ${Vout_V}V] Expected C1_nF <= 47 nF (C0G-friendly), got ${res.C1_nF}`
      );
      assert.ok(
        res.C2_pF >= 15,
        `[${controlType} ${Vout_V}V] Expected C2_pF >= 15 pF, got ${res.C2_pF}`
      );
    }
  }
});

test('calcStringToTexLines produces 100% valid strict KaTeX across all DC-DC and AC-DC presets and report chapters', () => {
  const acdcDefault = ACDC_PRESETS[0].state;
  const acdcDefaultRes = solveAcDcDesign(acdcDefault);
  let checkedCount = 0;

  for (const preset of DCDC_PRESETS) {
    const dcdcRes = solveDcDcDesign(preset.state);
    const passiveRows = solvePassiveRows(preset.state, dcdcRes, acdcDefault, acdcDefaultRes);
    const alerts = evaluateDesignAlerts({
      dcdcState: preset.state,
      dcdcRes,
      acdcState: acdcDefault,
      acdcRes: acdcDefaultRes,
    });
    const report = buildDesignReportModel({
      scope: 'dcdc',
      dcdcState: preset.state,
      dcdcRes,
      acdcState: acdcDefault,
      acdcRes: acdcDefaultRes,
      ...passiveRows,
      scopedAlerts: alerts,
    });

    for (const ch of report.chapters) {
      for (const st of ch.steps) {
        // Check step governing equation st.tex
        assert.doesNotThrow(() => {
          katex.renderToString(st.tex, { displayMode: true, throwOnError: true, strict: false });
        }, `Failed st.tex on ${preset.id} Step ${st.step}: ${st.tex}`);
        checkedCount++;

        for (const field of [st.given, st.substitution, st.result]) {
          const lines = calcStringToTexLines(field);
          assert.ok(lines.length > 0, `Expected non-empty KaTeX lines for Step ${st.step}`);
          for (const tex of lines) {
            assert.doesNotThrow(() => {
              katex.renderToString(tex, { displayMode: true, throwOnError: true, strict: false });
            }, `Failed calcStringToTexLines on ${preset.id} Step ${st.step}: ${tex}`);
            checkedCount++;
          }
        }
      }
    }
  }

  for (const preset of ACDC_PRESETS) {
    const acdcRes = solveAcDcDesign(preset.state);
    const dcdcDefault = DCDC_PRESETS[0].state;
    const dcdcDefaultRes = solveDcDcDesign(dcdcDefault);
    const passiveRows = solvePassiveRows(dcdcDefault, dcdcDefaultRes, preset.state, acdcRes);
    const alerts = evaluateDesignAlerts({
      dcdcState: dcdcDefault,
      dcdcRes: dcdcDefaultRes,
      acdcState: preset.state,
      acdcRes,
    });
    const report = buildDesignReportModel({
      scope: 'acdc',
      dcdcState: dcdcDefault,
      dcdcRes: dcdcDefaultRes,
      acdcState: preset.state,
      acdcRes,
      ...passiveRows,
      scopedAlerts: alerts,
    });

    for (const ch of report.chapters) {
      for (const st of ch.steps) {
        assert.doesNotThrow(() => {
          katex.renderToString(st.tex, { displayMode: true, throwOnError: true, strict: false });
        }, `Failed st.tex on ${preset.id} Step ${st.step}: ${st.tex}`);
        checkedCount++;
        for (const field of [st.given, st.substitution, st.result]) {
          const lines = calcStringToTexLines(field);
          assert.ok(lines.length > 0);
          for (const tex of lines) {
            assert.doesNotThrow(() => {
              katex.renderToString(tex, { displayMode: true, throwOnError: true, strict: false });
            }, `Failed calcStringToTexLines on ${preset.id} Step ${st.step}: ${tex}`);
            checkedCount++;
          }
        }
      }
    }
  }

  assert.ok(checkedCount > 400, `Expected >400 validated KaTeX expressions, got ${checkedCount}`);
});

test('Gemini API key sanitization and thinkingLevel gating helpers work cleanly', () => {
  assert.equal(sanitizeApiKey('  "AIzaSyTestKey123"  '), 'AIzaSyTestKey123');
  assert.equal(sanitizeApiKey("  'sk-test-key' "), 'sk-test-key');

  const norm = normalizeAiProviderConfig({
    provider: 'gemini',
    apiKey: ' "AIzaSyCustomUserKey" ',
    model: ' gemini-2.5-flash ',
  });
  assert.equal(norm.apiKey, 'AIzaSyCustomUserKey');
  assert.equal(norm.model, 'gemini-2.5-flash');

  assert.equal(isGeminiThinkingLevelSupported('gemini-4-hydrogen'), true);
  assert.equal(isGeminiThinkingLevelSupported('gemini-3.8-flash'), true);
  assert.equal(isGeminiThinkingLevelSupported('gemini-2.5-flash'), false);
  assert.equal(isGeminiThinkingLevelSupported('gemini-2.5-pro'), false);

  const acdcState = ACDC_PRESETS[0].state;
  const acdcRes = solveAcDcDesign(acdcState);
  const dcdcState = DCDC_PRESETS[0].state;
  const dcdcRes = solveDcDcDesign(dcdcState);
  const designAlerts = evaluateDesignAlerts({ dcdcState, dcdcRes, acdcState, acdcRes });
  const fullSnap = buildAiDesignSnapshot({
    dcdcState,
    dcdcRes,
    acdcState,
    acdcRes,
    inductorConfigs: {},
    capacitorConfigs: {},
    designAlerts,
  });
  const chatSnap = buildAiDesignSnapshot(
    {
      dcdcState,
      dcdcRes,
      acdcState,
      acdcRes,
      inductorConfigs: {},
      capacitorConfigs: {},
      designAlerts,
    },
    { compactForChat: true }
  );
  const fullBytes = JSON.stringify(fullSnap).length;
  const chatBytes = JSON.stringify(chatSnap).length;
  assert.ok(chatBytes < fullBytes * 0.5, `Expected compact chat snapshot (${chatBytes}B) < 50% of full (${fullBytes}B)`);
  assert.ok(Array.isArray((chatSnap.catalogs as { transformerCoreIds?: string[] }).transformerCoreIds));
});

test('2-Stage System Cascade Coupling computes accurate cascaded efficiency, bus link, and power balance', () => {
  const acdcState = { ...ACDC_PRESETS[0].state, Vdc_bus_V: 400, Pout_W: 2500 };
  const acdcRes = solveAcDcDesign(acdcState);
  const dcdcState = { ...DCDC_PRESETS[0].state, Vin_nom_V: 380, Pout_W: 3300 };
  const dcdcRes = solveDcDcDesign(dcdcState);

  const cascade = solveSystemCascade(acdcState, acdcRes, dcdcState, dcdcRes);
  const expectedEta = (acdcRes.efficiency_pct / 100) * (dcdcRes.efficiency_pct / 100) * 100;
  assert.ok(Math.abs(cascade.eta_system_pct - expectedEta) < 0.05);
  assert.ok(cascade.Pin_ac_system_W > dcdcState.Pout_W);
  assert.ok(Math.abs(cascade.Ploss_system_W - (acdcRes.Ptotal_loss_W + dcdcRes.Ptotal_loss_W)) < 0.3);

  const patches = computeCoupledStagePatches({
    acdcState,
    acdcRes,
    dcdcState,
    dcdcRes,
    linkConfig: { linkBusVoltage: true, linkLoadPower: true },
  });
  assert.equal(patches.dcdcPatch?.Vin_nom_V, 400);
  assert.ok(patches.acdcPatch?.Pout_W && patches.acdcPatch.Pout_W > dcdcState.Pout_W);
});

test('Project Storage validates v2/v1 JSON imports and Undo/Redo history stack', () => {
  const fallback = {
    dcdcState: DCDC_PRESETS[0].state,
    acdcState: ACDC_PRESETS[0].state,
    inductorConfigs: {},
    capacitorConfigs: {},
    systemLink: { linkBusVoltage: false, linkLoadPower: false },
  };
  const fileV2 = buildProjectFile('Lab Rev 5', fallback);
  const parsedV2 = parseImportedProjectJson(JSON.stringify(fileV2), fallback);
  assert.equal(parsedV2.ok, true);
  if (parsedV2.ok) {
    assert.equal(parsedV2.project.name, 'Lab Rev 5');
    assert.equal(parsedV2.project.schemaVersion, 2);
  }

  const v1Export = JSON.stringify({
    domain: 'dc-dc-isolated',
    state: { ...DCDC_PRESETS[0].state, Pout_W: 4200, presetName: '4.2kW Custom' },
  });
  const parsedV1 = parseImportedProjectJson(v1Export, fallback);
  assert.equal(parsedV1.ok, true);
  if (parsedV1.ok) {
    assert.equal(parsedV1.project.dcdcState.Pout_W, 4200);
  }

  const bad = parseImportedProjectJson('{invalid', fallback);
  assert.equal(bad.ok, false);

  let hist = createHistory(1);
  hist = pushHistoryState(hist, 2);
  hist = pushHistoryState(hist, 3);
  assert.equal(hist.present, 3);
  hist = undoHistory(hist);
  assert.equal(hist.present, 2);
  hist = redoHistory(hist);
  assert.equal(hist.present, 3);
});

test('Multi-channel evalFullWaveforms produces realistic PSFB and LLC tank signals', () => {
  const psfbRes = solveDcDcDesign(DCDC_PRESETS[0].state);
  assert.ok(psfbRes.waveforms.length >= 100);
  const psfbPt = psfbRes.evaluators.evalFullWaveforms(2.5);
  assert.ok(Number.isFinite(psfbPt.v_pri_V));
  assert.ok(Number.isFinite(psfbPt.i_lm_A));
  assert.ok(Number.isFinite(psfbPt.v_cr_V));

  const llcPreset = DCDC_PRESETS.find((p) => p.state.topology.startsWith('llc')) ?? DCDC_PRESETS[1];
  const llcRes = solveDcDcDesign(llcPreset.state);
  const llcPt = llcRes.evaluators.evalFullWaveforms(1.5);
  assert.ok(Number.isFinite(llcPt.i_pri_A));
  assert.ok(Number.isFinite(llcPt.v_cr_V));
});

test('RK4 Transient ODE Solver & Monte Carlo Tolerance Engine compute bounded physical outputs', () => {
  const state = DCDC_PRESETS[0].state;
  const res = solveDcDcDesign(state);
  const tran = runTransientLoadStep(state, res, {
    scenario: 'load-step',
    initialLoad_pct: 20,
    finalLoad_pct: 90,
    totalTime_us: 800,
  });
  assert.ok(tran.points.length > 50);
  assert.ok(tran.maxDeviation_pct < 15, `Expected bounded transient deviation, got ${tran.maxDeviation_pct}%`);
  assert.ok(Math.abs(tran.steadyStateError_mV) < 1500);

  const mc = runMonteCarloAnalysis(state, { numTrials: 60, seed: 42 });
  assert.equal(mc.numTrials, 60);
  assert.ok(mc.yield_pct >= 0 && mc.yield_pct <= 100);
  assert.ok(mc.stats.efficiency_pct.mean > 85);
  assert.ok(mc.sensitivities.length >= 4);
});

test('SPICE .cir Netlist & Embedded C Header Exporters emit valid netlists and Tustin coefficients', () => {
  const dcdcState = DCDC_PRESETS[0].state;
  const dcdcRes = solveDcDcDesign(dcdcState);
  const acdcState = ACDC_PRESETS[0].state;
  const acdcRes = solveAcDcDesign(acdcState);

  const dcdcCir = generateDcDcSpiceNetlist(dcdcState, dcdcRes);
  assert.ok(dcdcCir.includes('.tran'));
  assert.ok(dcdcCir.includes('K_TX L_PRI L_SEC1'));
  assert.ok(dcdcCir.includes('.SUBCKT '));
  assert.ok(!dcdcCir.includes('SW_PRI'));
  assert.ok(dcdcCir.endsWith('.end'));

  const acdcCir = generateAcDcSpiceNetlist(acdcState, acdcRes);
  assert.ok(acdcCir.includes('L_PFC1'));
  assert.ok(acdcCir.endsWith('.end'));

  const header = generateControlFirmwareHeader(dcdcState, dcdcRes, acdcState, acdcRes);
  assert.ok(header.includes('#define DCDC_CTRL_B0'));
  assert.ok(header.includes('#define ACDC_I_B0'));
  assert.ok(header.includes('#endif /* POWERSTAGE_CONTROL_CFG_H */'));
});

test('Dowell Litz proximity factor scales physically with interleaving and AWG strand gauge', () => {
  const base = DCDC_PRESETS[0].state;
  const rNone = solveDcDcDesign({ ...base, fsw_kHz: 200, interleaving: 'none', litzStrandAWG: 38 });
  const rSplit = solveDcDcDesign({ ...base, fsw_kHz: 200, interleaving: 'split-pri', litzStrandAWG: 38 });
  const rFull = solveDcDcDesign({ ...base, fsw_kHz: 200, interleaving: 'full-interleaved', litzStrandAWG: 38 });
  const rAwg40 = solveDcDcDesign({ ...base, fsw_kHz: 200, interleaving: 'split-pri', litzStrandAWG: 40 });

  assert.ok(rNone.Fr_dowell_pri > 1.05, `Expected measurable Dowell Fr at 200kHz, got ${rNone.Fr_dowell_pri}`);
  assert.ok(rNone.Fr_dowell_pri > rSplit.Fr_dowell_pri, 'Expected non-interleaved Fr > split-pri Fr');
  assert.ok(rSplit.Fr_dowell_pri > rFull.Fr_dowell_pri, 'Expected split-pri Fr > full-interleaved Fr');
  assert.ok(rSplit.Fr_dowell_pri > rAwg40.Fr_dowell_pri, 'Expected AWG38 Fr > finer AWG40 Fr');
});

test('Dead-time-bounded ZVS & LLC low-line gain alerts synthesize safe 1-click fixes', () => {
  const acdcState = ACDC_PRESETS[0].state;
  const acdcRes = solveAcDcDesign(acdcState);

  // 1. PSFB with overly short dead-time triggers zvsDeadTimeInsufficient
  const shortDtState: DcDcDesignState = {
    ...DCDC_PRESETS[0].state,
    Llk_uH: 8.0,
    deadTime_ns: 12,
  };
  const shortDtRes = solveDcDcDesign(shortDtState);
  assert.equal(shortDtRes.zvsDeadTimeInsufficient, true);
  assert.equal(shortDtRes.zvsAchieved, false);
  assert.ok(shortDtRes.Vds_res_lag_V > 5);

  const shortDtAlerts = evaluateDesignAlerts({
    dcdcState: shortDtState,
    dcdcRes: shortDtRes,
    acdcState,
    acdcRes,
  });
  const zvsAlert = shortDtAlerts.all.find((a) => a.id === 'dcdc-zvs-incomplete');
  assert.ok(zvsAlert && zvsAlert.fixes && zvsAlert.fixes.length > 0);
  const zvsFixed = solveDcDcDesign({ ...shortDtState, ...zvsAlert.fixes[0].dcdcPatch });
  assert.equal(zvsFixed.zvsAchieved, true);

  // 2. LLC with excessive Lm and low Vin_min fails low-line gain and gets cured without corrupting Lr
  const llcBase = DCDC_PRESETS[3].state;
  const llcLowGainState: DcDcDesignState = {
    ...llcBase,
    Vin_min_V: 300,
    Lm_uH: 380,
  };
  const llcLowGainRes = solveDcDcDesign(llcLowGainState);
  assert.equal(llcLowGainRes.llcRegulatesMinLine, false);
  const llcAlerts = evaluateDesignAlerts({
    dcdcState: llcLowGainState,
    dcdcRes: llcLowGainRes,
    acdcState,
    acdcRes,
  });
  const gainAlert = llcAlerts.all.find((a) => a.id === 'dcdc-llc-gain-deficit');
  assert.ok(gainAlert && gainAlert.fixes && gainAlert.fixes.length > 0);
  const gainFixed = solveDcDcDesign({ ...llcLowGainState, ...gainAlert.fixes[0].dcdcPatch });
  assert.equal(gainFixed.llcRegulatesMinLine, true);
});

test('evalFullWaveforms numerical RMS & DC averages match analytical solver currents', () => {
  for (const preset of DCDC_PRESETS) {
    const res = solveDcDcDesign(preset.state);
    const N = 2000;
    const T_us = 1000 / preset.state.fsw_kHz;
    let sumIlo = 0;
    let sumIpri2 = 0;
    let imPkWf = 0;
    for (let i = 0; i < N; i++) {
      const pt = res.evaluators.evalFullWaveforms(((i + 0.5) / N) * T_us);
      sumIlo += pt.i_lo_A;
      sumIpri2 += pt.i_pri_A * pt.i_pri_A;
      imPkWf = Math.max(imPkWf, Math.abs(pt.i_lm_A ?? 0));
    }
    const meanIlo = sumIlo / N;
    const rmsIpriWf = Math.sqrt(sumIpri2 / N);
    const iloErrPct = (Math.abs(meanIlo - res.Iout_phase_A) / res.Iout_phase_A) * 100;
    const imErrPct = (Math.abs(imPkWf - res.Im_pk_A) / Math.max(0.1, res.Im_pk_A)) * 100;
    assert.ok(iloErrPct < 2.5, `[${preset.id}] Expected mean(i_lo) ≈ Iout_phase within 2.5%, got ${iloErrPct.toFixed(2)}%`);
    assert.ok(imErrPct < 2.5, `[${preset.id}] Expected max(|i_lm|) ≈ Im_pk within 2.5%, got ${imErrPct.toFixed(2)}%`);
    assert.ok(rmsIpriWf > 0.5 && Number.isFinite(rmsIpriWf));
  }
});

test('Auto-Optimizer solves unlocked LLC across low-line 330V with 0 Danger alerts & standard parts', () => {
  const acdcState = ACDC_PRESETS[0].state;
  const acdcRes = solveAcDcDesign(acdcState);
  const unlocked = makeUnlockedDcdcLocks();
  const llcInit: DcDcDesignState = {
    ...DCDC_PRESETS[3].state,
    Vin_min_V: 330,
    Lm_uH: 320,
    deadTime_ns: 60,
  };
  const opt = optimizeDcDcUnlocked(llcInit, llcInit, 'Vin_min_V', unlocked);
  const res = solveDcDcDesign(opt.nextState);
  assert.equal(res.llcRegulatesMinLine, true);
  assert.equal(res.zvsAchieved, true);
  const alerts = evaluateDesignAlerts({
    dcdcState: opt.nextState,
    dcdcRes: res,
    acdcState,
    acdcRes,
  });
  const dcdcDangers = alerts.danger.filter((a) => a.domain === 'dcdc');
  assert.equal(
    dcdcDangers.length,
    0,
    `Expected 0 DC-DC Danger alerts on optimized LLC, got: ${dcdcDangers.map((a) => a.id).join(', ')}`
  );
  assert.ok([5, 8, 10, 12, 15, 20, 25, 30, 33, 40, 50, 68, 75, 100].includes(opt.nextState.Rsense_mOhm));
});

test('Ridley PCMC + Type II (Op-Amp & OTA gm) synthesizes exact plant damping, BOM & SPICE/C exports', () => {
  const base = DCDC_PRESETS[0].state;
  const pcmcOta = solveDcDcDesign({
    ...base,
    controlType: 'pcmc',
    type2Architecture: 'ota',
    ota_gm_mS: 1.2,
    slopeFactor_mc: 1.65,
    fc_target_kHz: 12,
    pm_target_deg: 60,
  });

  assert.equal(pcmcOta.isTwoZeroComp, false);
  assert.equal(pcmcOta.type2Architecture, 'ota');
  assert.ok(pcmcOta.plant_fp1_Hz > 50, 'Ridley PCMC current-loop damping pole fp1 should be positive');
  assert.ok(pcmcOta.pm_actual_deg >= 50 && pcmcOta.pm_actual_deg <= 80, `Expected healthy PM, got ${pcmcOta.pm_actual_deg}`);
  assert.ok(pcmcOta.R2_ota_kOhm >= 1 && pcmcOta.R2_ota_kOhm <= 470);
  assert.ok(pcmcOta.C1_ota_e24_nF > 0 && pcmcOta.C2_ota_e24_pF > 0);
  assert.ok(pcmcOta.fz1_kHz < pcmcOta.fc_actual_kHz && pcmcOta.fp1_kHz > pcmcOta.fc_actual_kHz);

  const spice = generateDcDcSpiceNetlist(pcmcOta.state, pcmcOta);
  assert.ok(spice.includes('G_OTA') && spice.includes('R_OTA_Z') && spice.includes('PCMC Artificial Slope Ramp'));

  const acdcRes = solveAcDcDesign(ACDC_PRESETS[0].state);
  const fw = generateControlFirmwareHeader(pcmcOta.state, pcmcOta, ACDC_PRESETS[0].state, acdcRes);
  assert.ok(fw.includes('DCDC_TYPE2_IS_OTA           (1)'));
  assert.ok(fw.includes('DCDC_PCMC_QP_WC'));
});

test('Inductor Pareto Core×Material Ranker, Gap Fringing Loss & Transformer Core Ranker work accurately', () => {
  const dcdcState = DCDC_PRESETS[0].state;
  const dcdcRes = solveDcDcDesign(dcdcState);
  const acdcState = ACDC_PRESETS[0].state;
  const acdcRes = solveAcDcDesign(acdcState);

  const indReqs = extractCircuitInductors('dcdc', dcdcState, dcdcRes, acdcState, acdcRes);
  const shimReq = indReqs.find((r) => r.id === 'dcdc-res-shim')!;
  const rankedMinLoss = rankInductorCoreMaterials(shimReq, 'min-loss', 'all');
  assert.ok(rankedMinLoss.length > 0);
  assert.ok(rankedMinLoss[0].passesAll, 'Top-ranked AC shim inductor should pass all thermal/sat/fill limits');
  assert.ok(rankedMinLoss[0].sol.P_gap_fringing_W >= 0);

  const outChokeReq = indReqs.find((r) => r.id === 'dcdc-out-choke')!;
  const rankedCompact = rankInductorCoreMaterials(outChokeReq, 'compact', 'toroid');
  assert.ok(rankedCompact.length > 0 && rankedCompact.every((r) => r.core.shape === 'toroid'));

  const txRanked = rankTransformerCoresForDcDc(dcdcState);
  assert.ok(txRanked.length >= 4);
  assert.ok(txRanked.some((r) => r.passesAll));
});

test('AI Tool Registry session executes multi-step solver tools & commits verified edits', () => {
  const session = createAiToolSession({
    dcdcState: DCDC_PRESETS[0].state,
    acdcState: ACDC_PRESETS[0].state,
  });

  const summary = session.executeTool('get_design_summary', { stage: 'all' });
  assert.ok(summary.dcdc && summary.acdc);

  const simRes = session.executeTool('simulate_dcdc_patch', {
    patch: {
      controlType: 'pcmc',
      type2Architecture: 'ota',
      ota_gm_mS: 1.5,
      slopeFactor_mc: 1.75,
      fc_target_kHz: 10,
      pm_target_deg: 60,
    },
    commit: true,
  });
  assert.equal(simRes.committed, true);
  assert.equal((simRes.control as Record<string, unknown>).type2Architecture, 'ota');

  const indRes = session.executeTool('design_and_rank_inductor', {
    inductorId: 'dcdc-out-choke',
    goal: 'min-loss',
    commit: true,
  });
  assert.equal(indRes.committed, true);

  const tranRes = session.executeTool('run_transient_step_check', { scenario: 'load-step' });
  assert.ok(Number(tranRes.maxDeviation_pct) < 15);

  const catalog = session.executeTool('search_parts_catalog', { category: 'semiconductors', query: 'SiC' });
  assert.ok(Array.isArray(catalog.items) && catalog.items.length > 0);

  const diff = session.getCommittedDiff();
  assert.equal(diff.hasChanges, true);
  assert.equal(session.getWorkingState().dcdcState.controlType, 'pcmc');
  assert.equal(diff.dcdcPatch.type2Architecture, 'ota');
  assert.equal(diff.dcdcPatch.ota_gm_mS, 1.5);
  assert.ok(diff.inductorConfigsPatch['dcdc-out-choke']);
  assert.equal(session.getTrace().length, 5);
});

test('LTspice .asc schematic exporter produces grid-aligned, orthogonal, well-organized diagrams across DC-DC & AC-DC variants', () => {
  const verifyAsc = (ascText: string, label: string) => {
    assert.ok(!ascText.includes('NaN') && !ascText.includes('undefined'), `[${label}] Contains NaN/undefined`);
    const lines = ascText.trim().split('\n');
    assert.equal(lines[0], 'Version 4', `[${label}] Missing Version 4 header`);
    assert.ok(lines[1].startsWith('SHEET 1 '), `[${label}] Missing SHEET 1 line`);

    const wireLines = lines.filter((l) => l.startsWith('WIRE '));
    assert.ok(wireLines.length >= 15, `[${label}] Expected wired connections, got ${wireLines.length}`);
    for (const w of wireLines) {
      const [, x1s, y1s, x2s, y2s] = w.split(/\s+/);
      const [x1, y1, x2, y2] = [Number(x1s), Number(y1s), Number(x2s), Number(y2s)];
      assert.ok(
        x1 === x2 || y1 === y2,
        `[${label}] Non-orthogonal wire found: ${w}`
      );
      assert.ok(
        x1 % 16 === 0 && y1 % 16 === 0 && x2 % 16 === 0 && y2 % 16 === 0,
        `[${label}] Wire not aligned to 16px LTspice grid: ${w}`
      );
    }

    const symLines = lines.filter((l) => l.startsWith('SYMBOL '));
    assert.ok(symLines.length >= 8, `[${label}] Expected symbols`);
    for (const s of symLines) {
      const parts = s.split(/\s+/);
      const sx = Number(parts[2]);
      const sy = Number(parts[3]);
      assert.ok(sx % 16 === 0 && sy % 16 === 0, `[${label}] Symbol off 16px grid: ${s}`);
    }

    assert.ok(lines.some((l) => l.startsWith('FLAG ') && l.endsWith(' 0')), `[${label}] Missing GND flag 0`);
    assert.ok(lines.some((l) => l.includes('!.tran ')), `[${label}] Missing .tran directive`);
    // Verify pure 7-bit printable ASCII so LTspice Windows-1252 parser never renders mojibake
    assert.ok(/^[\x0A\x0D\x20-\x7E]+$/.test(ascText), `[${label}] Non-ASCII characters found in .asc`);
  };

  // Test DC-DC PSFB (CT + Op-Amp), PSFB (Full-Bridge + OTA), PSFB (Current-Doubler), and LLC-HB
  for (const variant of [
    { ...DCDC_PRESETS[0].state, txType: 'center-tapped' as const, type2Architecture: 'opamp' as const },
    { ...DCDC_PRESETS[0].state, txType: 'full-bridge' as const, type2Architecture: 'ota' as const },
    { ...DCDC_PRESETS[0].state, txType: 'current-doubler' as const, type2Architecture: 'ota' as const },
    { ...DCDC_PRESETS[3].state, topology: 'llc-hb' as const },
  ]) {
    const res = solveDcDcDesign(variant);
    const asc = generateDcDcLtspiceAsc(variant, res);
    verifyAsc(asc, `${variant.topology}-${variant.txType}-${variant.type2Architecture ?? 'default'}`);
    assert.ok(asc.includes('K_TX L_PRI L_SEC1'));
    assert.ok(asc.includes('SYMBOL nmos '));
    // Verify L_PRI uses M0 (labels left) and L_SEC1 uses R0 (labels right) so transformer labels never collide
    const priLine = asc.split('\n').find((l) => l.startsWith('SYMBOL ind2 ') && asc.split('\n')[asc.split('\n').indexOf(l) + 1]?.includes('L_PRI'));
    assert.ok(priLine?.endsWith(' M0'), 'Expected L_PRI to use M0 mirror so labels face away from core');
  }

  // Test AC-DC PFC (2-Phase Interleaved & 1-Phase)
  for (const preset of [ACDC_PRESETS[0].state, ACDC_PRESETS[1].state]) {
    const res = solveAcDcDesign(preset);
    const asc = generateAcDcLtspiceAsc(preset, res);
    verifyAsc(asc, preset.topology);
    assert.ok(asc.includes('SYMBOL nmos '));
  }
});

test('QSPICE ZIP bundle exports valid .zip with binary/Latin-1 .qsch, .qsym, .lib, .qraw, .cir, and DMC-compatible .cpp files', () => {
  const dcState = DCDC_PRESETS[0].state;
  const dcRes = solveDcDcDesign(dcState);
  const dcBundle = generateDcDcQspiceBundle(dcState, dcRes);

  assert.ok(dcBundle.qschContent.startsWith('«schematic'));
  assert.ok(dcBundle.qschContent.includes('«wire '));
  assert.ok(dcBundle.qschContent.includes('«component '));
  assert.ok(dcBundle.qschContent.includes('«type: Ø(.DLL)»'));
  assert.ok(dcBundle.qschContent.includes('«type: X»'));
  assert.ok(dcBundle.qschContent.includes('.lib voltcraft_models.lib'));
  assert.ok(dcBundle.libContent.includes(`.SUBCKT ${dcRes.priDevice.id.toUpperCase()}`));
  assert.ok(dcBundle.qsymFiles.length >= 2);
  assert.ok(
    dcBundle.qsymFiles.every((f) => f.path.endsWith('.qsym') && f.content.startsWith('«symbol'))
  );
  assert.ok(
    dcBundle.qrawContent.includes('Plotname: Transient Analysis') &&
      dcBundle.qrawContent.includes('Flags: real forward log double') &&
      dcBundle.qrawContent.includes('Variables:') &&
      dcBundle.qrawContent.includes('Values:')
  );
  assert.ok(dcBundle.cirContent.includes('.tran ') && dcBundle.cirContent.includes('.end'));
  assert.ok(
    dcBundle.cppContent.includes('__declspec(dllexport)') &&
      dcBundle.cppContent.includes('union uData') &&
      dcBundle.cppContent.includes('DllMain') &&
      dcBundle.cppContent.includes('calloc(') &&
      !dcBundle.cppContent.includes('constexpr')
  );
  assert.equal(dcBundle.zipBytes[0], 0x50); // 'P'
  assert.equal(dcBundle.zipBytes[1], 0x4b); // 'K'
  assert.equal(dcBundle.zipBytes[2], 0x03);
  assert.equal(dcBundle.zipBytes[3], 0x04);

  const acState = ACDC_PRESETS[0].state;
  const acRes = solveAcDcDesign(acState);
  const acBundle = generateAcDcQspiceBundle(acState, acRes);
  assert.ok(acBundle.qschContent.startsWith('«schematic'));
  assert.ok(acBundle.qschContent.includes('«type: Ø(.DLL)»'));
  assert.ok(acBundle.qschContent.includes('GBJ2510_DIODE'));
  assert.ok(acBundle.libContent.includes('GBJ2510_DIODE'));
  assert.ok(acBundle.qsymFiles.some((f) => f.path.endsWith('.qsym')));
  assert.ok(acBundle.qrawContent.includes('V(v_dc)') && acBundle.qrawContent.includes('I(L_DM)'));
  assert.ok(acBundle.cppContent.includes('struct sVOLTCRAFT_') && acBundle.cppContent.includes('DllMain'));
  assert.equal(acBundle.zipBytes[0], 0x50);
  assert.equal(acBundle.zipBytes[1], 0x4b);
});

test('Manufacturer SPICE .SUBCKT library covers all 22 catalog devices and binds cleanly in LTspice .asc, .cir, and QSPICE', () => {
  assert.equal(SEMICONDUCTOR_DATABASE.length, 22);

  for (const dev of SEMICONDUCTOR_DATABASE) {
    const mos = generateManufacturerMosfetSubckt(dev, 2);
    assert.ok(mos.spiceText.includes(`.SUBCKT ${mos.subcktName} d g s`), `Missing .SUBCKT for ${dev.id}`);
    assert.ok(mos.spiceText.includes('VDMOS('), `Missing VDMOS for ${dev.id}`);
    assert.ok(mos.spiceText.includes('L_D d d_int'), `Missing drain parasitic for ${dev.id}`);
    assert.ok(mos.spiceText.includes('.ENDS'), `Missing .ENDS for ${dev.id}`);

    const sr = generateManufacturerRectifierSubckt(dev, 2, 'sync-fet');
    assert.ok(sr.spiceText.includes(`.SUBCKT ${sr.subcktName} a k`), `Missing SR wrapper for ${dev.id}`);
    if (dev.tech === 'SiC Schottky') {
      assert.ok(sr.spiceText.includes('D_DIO'), `Missing diode instance for ${dev.id}`);
    } else {
      assert.ok(sr.spiceText.includes('B_SRDRV'), `Missing SR gate driver for ${dev.id}`);
    }

    const dio = generateManufacturerRectifierSubckt(dev, 1, 'schottky-diode');
    assert.ok(dio.spiceText.includes(`.SUBCKT ${dio.subcktName} a k`), `Missing diode wrapper for ${dev.id}`);
  }

  const sic400 = generatePfcBoostDiodeSubckt(400);
  assert.equal(sic400.mpn, 'STPSC10H065DY');
  assert.ok(sic400.spiceText.includes('.SUBCKT GBJ2510_DIODE a k'));

  const sic800 = generatePfcBoostDiodeSubckt(800);
  assert.equal(sic800.mpn, 'C4D20120D');

  // Verify LTspice .asc embeds Prefix X + exact manufacturer .SUBCKT for DC-DC and AC-DC
  const dcState = DCDC_PRESETS[0].state;
  const dcRes = solveDcDcDesign(dcState);
  const dcPri = generateManufacturerMosfetSubckt(dcRes.priDevice, dcState.nParallelPri);
  const dcSec = generateManufacturerRectifierSubckt(dcRes.secDevice, dcState.nParallelSec, dcState.rectMode);
  const dcAsc = generateDcDcLtspiceAsc(dcState, dcRes);
  assert.ok(dcAsc.includes('SYMATTR Prefix X'));
  assert.ok(dcAsc.includes(`.SUBCKT ${dcPri.subcktName} d g s`));
  assert.ok(dcAsc.includes(`.SUBCKT ${dcSec.subcktName} a k`));

  const acState = ACDC_PRESETS[0].state;
  const acRes = solveAcDcDesign(acState);
  const acSw = generateManufacturerMosfetSubckt(acRes.sw, 1);
  const acAsc = generateAcDcLtspiceAsc(acState, acRes);
  assert.ok(acAsc.includes('SYMATTR Prefix X'));
  assert.ok(acAsc.includes(`.SUBCKT ${acSw.subcktName} d g s`));
  assert.ok(acAsc.includes('.SUBCKT GBJ2510_DIODE a k'));
});





