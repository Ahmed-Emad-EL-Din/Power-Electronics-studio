// ============================================================================
// AI ENGINEER BACKEND TOOL REGISTRY & MULTI-TURN SANDBOX SESSION
// Allows the LLM (Gemini / OpenAI / Anthropic) to inspect, simulate, optimize,
// rank magnetics/passives, run RK4 transient checks, and edit converter state
// in an iterative verification loop before returning verified engineering answers.
// ============================================================================

import {
  ACDC_PRESETS,
  AcDcDesignState,
  CORE_DATABASE,
  DCDC_PRESETS,
  DcDcDesignState,
  MATERIAL_DATABASE,
  SEMICONDUCTOR_DATABASE,
} from '../data/databases';
import {
  INDUCTOR_CORE_DATABASE,
  INDUCTOR_MATERIAL_DATABASE,
  READY_COTS_CAPACITORS,
} from '../data/passiveDatabase';
import { solveAcDcDesign } from './acdcEngine';
import {
  AcDcLockableKey,
  DcDcLockableKey,
  optimizeAcDcUnlocked,
  optimizeDcDcUnlocked,
} from './autoOptimizer';
import { solveDcDcDesign } from './dcdcEngine';
import { evaluateDesignAlerts } from './designAlerts';
import {
  CustomCapBankLocks,
  CustomInductorLocks,
  InductorOptGoal,
  InductorShapeFilter,
  PerCapConfig,
  PerInductorConfig,
  extractCircuitCapacitors,
  extractCircuitInductors,
  rankInductorCoreMaterials,
  rankReadyCotsCapacitors,
  rankTransformerCoresForDcDc,
  solveCapacitorBank,
  solveCustomInductorDesign,
} from './passiveDesignEngine';
import { runTransientLoadStep } from './transientOdeSolver';

const DEFAULT_IND_LOCKS: CustomInductorLocks = {
  targetL_uH: false,
  coreId: false,
  materialId: false,
  turnsN: false,
  airGap_mm: false,
  wireAwg: false,
  parallelStrands: false,
  conductorForm: false,
};

const DEFAULT_CAP_LOCKS: CustomCapBankLocks = {
  targetC_uF: false,
  partId: false,
  seriesCount: false,
  parallelCount: false,
};

export interface AiWorkspaceFullContext {
  dcdcState: DcDcDesignState;
  acdcState: AcDcDesignState;
  inductorConfigs: Record<string, PerInductorConfig>;
  capacitorConfigs: Record<string, PerCapConfig>;
  dcdcLocked?: Partial<Record<DcDcLockableKey, boolean>>;
  acdcLocked?: Partial<Record<AcDcLockableKey, boolean>>;
}

export interface AiToolTraceEntry {
  step: number;
  tool: string;
  argsSummary: string;
  resultSummary: string;
  committed: boolean;
}

export interface AiToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, Record<string, unknown>>;
    required?: string[];
  };
}

export const AI_TOOL_DEFINITIONS: AiToolDefinition[] = [
  {
    name: 'get_design_summary',
    description:
      'Returns the current working DC-DC and AC-DC operating point, small-signal margins, thermal/magnetic checks, passive health, and active Danger/Warning alerts.',
    parameters: {
      type: 'object',
      properties: {
        stage: {
          type: 'string',
          enum: ['all', 'dcdc', 'acdc', 'passives', 'alerts'],
          description: 'Which subsystem summary to inspect (default: all).',
        },
      },
    },
  },
  {
    name: 'simulate_dcdc_patch',
    description:
      'Applies a partial DC-DC parameter patch (controlType, type2Architecture, ota_gm_mS, slopeFactor_mc, fc_target_kHz, pm_target_deg, fsw_kHz, Llk_uH, Lo_uH, Co_uF, deadTime_ns, coreId, materialId, Np_turns, Ns_turns, priDeviceId, secDeviceId, Rth_heatsink_CW, etc.) and solves full electrical, ZVS, magnetic, thermal, small-signal Bode/PCMC, and alert outcomes. Set commit=true to persist this edit in the working design.',
    parameters: {
      type: 'object',
      properties: {
        patch: {
          type: 'object',
          description: 'Key-value map of DcDcDesignState fields to modify.',
        },
        commit: {
          type: 'boolean',
          description: 'If true, saves the patch to the working state for subsequent tool calls and returns it as a verified edit.',
        },
      },
      required: ['patch'],
    },
  },
  {
    name: 'simulate_acdc_patch',
    description:
      'Applies a partial AC-DC PFC parameter patch (fsw_kHz, Lpfc_uH, Cdc_uF, ESR_Cdc_mOhm, fastSwitchId, fc_i_kHz, pm_i_deg, fc_v_Hz, pm_v_deg, Cy_nF, prechargeR_Ohm, controlType) and solves PFC losses, hold-up, EMI, control margins, and alerts. Set commit=true to persist.',
    parameters: {
      type: 'object',
      properties: {
        patch: {
          type: 'object',
          description: 'Key-value map of AcDcDesignState fields to modify.',
        },
        commit: {
          type: 'boolean',
          description: 'If true, commits the patch to the working AC-DC state.',
        },
      },
      required: ['patch'],
    },
  },
  {
    name: 'design_and_rank_inductor',
    description:
      'Runs the physical inductor solver and multi-core × multi-material Pareto ranker for any circuit inductor (dcdc-out-choke, dcdc-res-shim, dcdc-dm-emi, pfc-boost, ac-dm-emi, ac-cm-emi). Can also apply custom core/material/turns/airGap/wire overrides with commit=true.',
    parameters: {
      type: 'object',
      properties: {
        inductorId: {
          type: 'string',
          description: 'Inductor ID: dcdc-out-choke, dcdc-res-shim, dcdc-dm-emi, pfc-boost, ac-dm-emi, or ac-cm-emi.',
        },
        goal: {
          type: 'string',
          enum: ['balanced', 'min-loss', 'compact', 'low-temp'],
          description: 'Optimization ranking objective.',
        },
        shapeFilter: {
          type: 'string',
          enum: ['all', 'toroid', 'pq', 'etd', 'ee', 'rm'],
          description: 'Optional core shape filter.',
        },
        overrides: {
          type: 'object',
          description: 'Optional custom overrides: coreId, materialId, turnsN, airGap_mm, wireAwg, parallelStrands, useLitz, conductorForm.',
        },
        commit: {
          type: 'boolean',
          description: 'If true, commits the overrides (or top-ranked core/material if overrides omitted) to working inductorConfigs.',
        },
      },
      required: ['inductorId'],
    },
  },
  {
    name: 'rank_transformer_cores',
    description:
      'Evaluates and ranks transformer cores from CORE_DATABASE for the current DC-DC stage, returning window fill %, Bpk, core+copper losses, and core temperature.',
    parameters: {
      type: 'object',
      properties: {
        commitBest: {
          type: 'boolean',
          description: 'If true, switches dcdcState.coreId to the #1 passing core.',
        },
      },
    },
  },
  {
    name: 'design_capacitor_bank',
    description:
      'Solves or updates a capacitor bank (dcdc-out-cap, dcdc-res-cap, dcdc-clamp-cap, acdc-dc-link, acdc-hf-mkp, acdc-x2, acdc-y2) and lists top COTS candidates with L10 lifetime, ESR, ripple utilization, and hotspot C.',
    parameters: {
      type: 'object',
      properties: {
        capacitorId: {
          type: 'string',
          description: 'Capacitor bank ID.',
        },
        overrides: {
          type: 'object',
          description: 'Optional overrides: partId, seriesCount, parallelCount.',
        },
        commit: {
          type: 'boolean',
          description: 'If true, saves capacitor bank overrides to working capacitorConfigs.',
        },
      },
      required: ['capacitorId'],
    },
  },
  {
    name: 'run_transient_step_check',
    description:
      'Runs the 4th-order RK4 closed-loop ODE transient simulator (20%->90% load step or soft-start) using the active DC-DC Tustin 2P2Z/3P3Z compensator and LC filter. Returns overshoot, undershoot, settling time, and peak inductor current.',
    parameters: {
      type: 'object',
      properties: {
        scenario: {
          type: 'string',
          enum: ['load-step', 'soft-start'],
        },
        initialLoad_pct: { type: 'number' },
        finalLoad_pct: { type: 'number' },
      },
    },
  },
  {
    name: 'run_auto_optimizer',
    description:
      'Runs the multi-variable analytical auto-optimizer on unlocked parameters for DC-DC or AC-DC to eliminate Danger/Warning alerts and improve efficiency/margins. Set commit=true to persist.',
    parameters: {
      type: 'object',
      properties: {
        domain: {
          type: 'string',
          enum: ['dcdc', 'acdc'],
        },
        commit: {
          type: 'boolean',
        },
      },
      required: ['domain'],
    },
  },
  {
    name: 'search_parts_catalog',
    description:
      'Searches built-in semiconductor, transformer core/material, inductor core/material, and COTS capacitor catalogs by keyword or minimum voltage so you only use exact verified IDs.',
    parameters: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          enum: ['semiconductors', 'transformerCores', 'transformerMaterials', 'inductorCores', 'inductorMaterials', 'capacitors'],
        },
        query: {
          type: 'string',
          description: 'Optional substring filter (e.g. "150V", "SiC", "PQ", "KoolMu", "MKP").',
        },
      },
      required: ['category'],
    },
  },
];

function sanitizeDcdcPatch(raw: Record<string, unknown>): Partial<DcDcDesignState> {
  const allowedKeys = new Set<string>(Object.keys(DCDC_PRESETS[0].state));
  allowedKeys.add('type2Architecture');
  allowedKeys.add('ota_gm_mS');
  allowedKeys.add('Tj_max_limit_C');
  allowedKeys.add('kelvinSourcePri');
  allowedKeys.add('Rth_TIM_CW');
  allowedKeys.add('Rth_TIM_sec_CW');

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw || {})) {
    if (!allowedKeys.has(k) || v === undefined || v === null) continue;
    if (k === 'coreId' && !CORE_DATABASE.some((c) => c.id === v)) continue;
    if (k === 'materialId' && !MATERIAL_DATABASE.some((m) => m.id === v)) continue;
    if ((k === 'priDeviceId' || k === 'secDeviceId') && !SEMICONDUCTOR_DATABASE.some((s) => s.id === v)) continue;
    out[k] = v;
  }
  return out as Partial<DcDcDesignState>;
}

function sanitizeAcdcPatch(raw: Record<string, unknown>): Partial<AcDcDesignState> {
  const allowedKeys = new Set<string>(Object.keys(ACDC_PRESETS[0].state));
  allowedKeys.add('deadTime_zcd_ns');
  allowedKeys.add('prechargeR_Ohm');
  allowedKeys.add('Cy_nF');
  allowedKeys.add('capAmbient_C');

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw || {})) {
    if (!allowedKeys.has(k) || v === undefined || v === null) continue;
    if (k === 'fastSwitchId' && !SEMICONDUCTOR_DATABASE.some((s) => s.id === v)) continue;
    out[k] = v;
  }
  return out as Partial<AcDcDesignState>;
}

export function createAiToolSession(initialInput?: Partial<AiWorkspaceFullContext>) {
  const initialDcdc: DcDcDesignState = {
    ...DCDC_PRESETS[0].state,
    ...(initialInput?.dcdcState || {}),
  };
  const initialAcdc: AcDcDesignState = {
    ...ACDC_PRESETS[0].state,
    ...(initialInput?.acdcState || {}),
  };
  const initialIndCfg: Record<string, PerInductorConfig> = JSON.parse(
    JSON.stringify(initialInput?.inductorConfigs || {})
  );
  const initialCapCfg: Record<string, PerCapConfig> = JSON.parse(
    JSON.stringify(initialInput?.capacitorConfigs || {})
  );

  let workingDcdc: DcDcDesignState = { ...initialDcdc };
  let workingAcdc: AcDcDesignState = { ...initialAcdc };
  const workingIndCfg: Record<string, PerInductorConfig> = JSON.parse(JSON.stringify(initialIndCfg));
  const workingCapCfg: Record<string, PerCapConfig> = JSON.parse(JSON.stringify(initialCapCfg));

  const dcdcLocked = (initialInput?.dcdcLocked || {}) as Record<DcDcLockableKey, boolean>;
  const acdcLocked = (initialInput?.acdcLocked || {}) as Record<AcDcLockableKey, boolean>;

  const trace: AiToolTraceEntry[] = [];
  let committedAny = false;

  const evaluateAll = () => {
    const dcdcRes = solveDcDcDesign(workingDcdc);
    const acdcRes = solveAcDcDesign(workingAcdc);
    const alerts = evaluateDesignAlerts({
      dcdcState: workingDcdc,
      dcdcRes,
      acdcState: workingAcdc,
      acdcRes,
      inductorConfigs: workingIndCfg,
      capacitorConfigs: workingCapCfg,
    });
    return { dcdcRes, acdcRes, alerts };
  };

  const executeTool = (name: string, rawArgs: Record<string, unknown> = {}): Record<string, unknown> => {
    const step = trace.length + 1;
    let result: Record<string, unknown> = {};
    let argsSummary = '';
    let resultSummary = '';
    let committed = false;

    if (name === 'get_design_summary') {
      const stage = String(rawArgs.stage || 'all');
      argsSummary = `stage=${stage}`;
      const { dcdcRes, acdcRes, alerts } = evaluateAll();
      result = {
        counts: {
          danger: alerts.danger.length,
          warning: alerts.warning.length,
          totalAlerts: alerts.all.length,
        },
        ...(stage === 'all' || stage === 'dcdc'
          ? {
              dcdc: {
                topology: workingDcdc.topology,
                controlType: workingDcdc.controlType,
                type2Architecture: dcdcRes.type2Architecture,
                ota_gm_mS: dcdcRes.ota_gm_mS,
                slopeFactor_mc: workingDcdc.slopeFactor_mc,
                Vin_nom_V: workingDcdc.Vin_nom_V,
                Vout_V: workingDcdc.Vout_V,
                Pout_W: workingDcdc.Pout_W,
                fsw_kHz: workingDcdc.fsw_kHz,
                efficiency_pct: Number(dcdcRes.efficiency_pct.toFixed(2)),
                Tj_pri_C: Number(dcdcRes.Tj_pri_C.toFixed(1)),
                Tj_sec_C: Number(dcdcRes.Tj_sec_C.toFixed(1)),
                Tcore_C: Number(dcdcRes.Tcore_C.toFixed(1)),
                Bpk_mT: Number(dcdcRes.Bpk_mT.toFixed(1)),
                windowFill_pct: Number(dcdcRes.windowFill_pct.toFixed(1)),
                zvsAchieved: dcdcRes.zvsAchieved,
                fc_actual_kHz: Number(dcdcRes.fc_actual_kHz.toFixed(2)),
                pm_actual_deg: Number(dcdcRes.pm_actual_deg.toFixed(1)),
                pm_wc_min_deg: Number(dcdcRes.pm_wc_min_deg.toFixed(1)),
                gm_actual_dB: Number(dcdcRes.gm_actual_dB.toFixed(1)),
                Qp_subharmonic_wc: Number(dcdcRes.Qp_subharmonic_wc.toFixed(2)),
                type2_R1_kOhm: dcdcRes.type2Architecture === 'ota' ? dcdcRes.R1_ota_kOhm : dcdcRes.R1_kOhm,
                type2_R2_kOhm: dcdcRes.type2Architecture === 'ota' ? dcdcRes.R2_ota_kOhm : dcdcRes.R2_kOhm,
                type2_C1_nF: dcdcRes.type2Architecture === 'ota' ? dcdcRes.C1_ota_e24_nF : dcdcRes.C1_e24_nF,
                type2_C2_pF: dcdcRes.type2Architecture === 'ota' ? dcdcRes.C2_ota_e24_pF : dcdcRes.C2_e24_pF,
              },
            }
          : {}),
        ...(stage === 'all' || stage === 'acdc'
          ? {
              acdc: {
                topology: workingAcdc.topology,
                Vac_rms_V: workingAcdc.Vac_rms_V,
                Vdc_bus_V: workingAcdc.Vdc_bus_V,
                Pout_W: workingAcdc.Pout_W,
                fsw_kHz: workingAcdc.fsw_kHz,
                efficiency_pct: Number(acdcRes.efficiency_pct.toFixed(2)),
                Tj_max_C: Number(acdcRes.Tj_fast_C.toFixed(1)),
                pm_i_deg: Number(acdcRes.pm_i_actual_deg.toFixed(1)),
                pm_v_deg: Number(acdcRes.pm_v_actual_deg.toFixed(1)),
                earthLeakage_mA: Number(acdcRes.earthLeakage_mA.toFixed(2)),
              },
            }
          : {}),
        ...(stage === 'all' || stage === 'alerts'
          ? {
              alerts: alerts.all.slice(0, 12).map((a) => ({
                id: a.id,
                severity: a.severity,
                domain: a.domain,
                title: a.title,
                metric: a.metric,
              })),
            }
          : {}),
      };
      resultSummary = `${alerts.danger.length}D/${alerts.warning.length}W · η_dc=${dcdcRes.efficiency_pct.toFixed(2)}% · PM=${dcdcRes.pm_actual_deg.toFixed(1)}°`;
    } else if (name === 'simulate_dcdc_patch') {
      const cleanPatch = sanitizeDcdcPatch((rawArgs.patch as Record<string, unknown>) || {});
      const commit = Boolean(rawArgs.commit);
      const trialState: DcDcDesignState = { ...workingDcdc, ...cleanPatch };
      // Synchronize Np_turns / Ns_turns / turnsRatio_n when any turns field changed
      if (cleanPatch.Np_turns !== undefined || cleanPatch.Ns_turns !== undefined) {
        const np = Math.max(1, Math.round(trialState.Np_turns));
        const ns = Math.max(1, Math.round(trialState.Ns_turns));
        trialState.Np_turns = np;
        trialState.Ns_turns = ns;
        trialState.turnsRatio_n = Number((np / ns).toFixed(4));
      }
      if (commit && Object.keys(cleanPatch).length > 0) {
        workingDcdc = trialState;
        committed = true;
        committedAny = true;
      }
      const dcdcRes = solveDcDcDesign(trialState);
      const acdcRes = solveAcDcDesign(workingAcdc);
      const alerts = evaluateDesignAlerts({
        dcdcState: trialState,
        dcdcRes,
        acdcState: workingAcdc,
        acdcRes,
        inductorConfigs: workingIndCfg,
        capacitorConfigs: workingCapCfg,
      });
      argsSummary = Object.keys(cleanPatch)
        .slice(0, 5)
        .map((k) => `${k}=${String((cleanPatch as Record<string, unknown>)[k])}`)
        .join(', ');
      result = {
        appliedPatch: cleanPatch,
        committed,
        efficiency_pct: Number(dcdcRes.efficiency_pct.toFixed(2)),
        Ptotal_loss_W: Number(dcdcRes.Ptotal_loss_W.toFixed(2)),
        Tj_pri_C: Number(dcdcRes.Tj_pri_C.toFixed(1)),
        Tj_sec_C: Number(dcdcRes.Tj_sec_C.toFixed(1)),
        Tcore_C: Number(dcdcRes.Tcore_C.toFixed(1)),
        Bpk_mT: Number(dcdcRes.Bpk_mT.toFixed(1)),
        windowFill_pct: Number(dcdcRes.windowFill_pct.toFixed(1)),
        zvsAchieved: dcdcRes.zvsAchieved,
        Vout_ripple_mVpp: Number(dcdcRes.Vout_ripple_mVpp.toFixed(1)),
        control: {
          controlType: trialState.controlType,
          type2Architecture: dcdcRes.type2Architecture,
          ota_gm_mS: dcdcRes.ota_gm_mS,
          fc_actual_kHz: Number(dcdcRes.fc_actual_kHz.toFixed(2)),
          pm_actual_deg: Number(dcdcRes.pm_actual_deg.toFixed(1)),
          pm_wc_min_deg: Number(dcdcRes.pm_wc_min_deg.toFixed(1)),
          gm_actual_dB: Number(dcdcRes.gm_actual_dB.toFixed(1)),
          Qp_subharmonic: Number(dcdcRes.Qp_subharmonic.toFixed(2)),
          Qp_subharmonic_wc: Number(dcdcRes.Qp_subharmonic_wc.toFixed(2)),
          fz1_kHz: Number(dcdcRes.fz1_kHz.toFixed(2)),
          fp1_kHz: Number(dcdcRes.fp1_kHz.toFixed(2)),
          R1_kOhm: dcdcRes.type2Architecture === 'ota' ? dcdcRes.R1_ota_kOhm : dcdcRes.R1_kOhm,
          R2_kOhm: dcdcRes.type2Architecture === 'ota' ? dcdcRes.R2_ota_kOhm : dcdcRes.R2_kOhm,
          C1_nF: dcdcRes.type2Architecture === 'ota' ? dcdcRes.C1_ota_e24_nF : dcdcRes.C1_e24_nF,
          C2_pF: dcdcRes.type2Architecture === 'ota' ? dcdcRes.C2_ota_e24_pF : dcdcRes.C2_e24_pF,
        },
        alerts: {
          dangerCount: alerts.danger.length,
          warningCount: alerts.warning.length,
          items: alerts.all.slice(0, 8).map((a) => `${a.severity.toUpperCase()}: ${a.title} (${a.metric})`),
        },
      };
      resultSummary = `η=${dcdcRes.efficiency_pct.toFixed(2)}% · PM=${dcdcRes.pm_actual_deg.toFixed(1)}° · Qp_wc=${dcdcRes.Qp_subharmonic_wc.toFixed(2)} · ${alerts.danger.length}D/${alerts.warning.length}W`;
    } else if (name === 'simulate_acdc_patch') {
      const cleanPatch = sanitizeAcdcPatch((rawArgs.patch as Record<string, unknown>) || {});
      const commit = Boolean(rawArgs.commit);
      const trialState: AcDcDesignState = { ...workingAcdc, ...cleanPatch };
      if (commit && Object.keys(cleanPatch).length > 0) {
        workingAcdc = trialState;
        committed = true;
        committedAny = true;
      }
      const dcdcRes = solveDcDcDesign(workingDcdc);
      const acdcRes = solveAcDcDesign(trialState);
      const alerts = evaluateDesignAlerts({
        dcdcState: workingDcdc,
        dcdcRes,
        acdcState: trialState,
        acdcRes,
        inductorConfigs: workingIndCfg,
        capacitorConfigs: workingCapCfg,
      });
      argsSummary = Object.keys(cleanPatch)
        .slice(0, 5)
        .map((k) => `${k}=${String((cleanPatch as Record<string, unknown>)[k])}`)
        .join(', ');
      result = {
        appliedPatch: cleanPatch,
        committed,
        efficiency_pct: Number(acdcRes.efficiency_pct.toFixed(2)),
        Ptotal_loss_W: Number(acdcRes.Ptotal_loss_W.toFixed(2)),
        Tj_fast_C: Number(acdcRes.Tj_fast_C.toFixed(1)),
        pm_i_deg: Number(acdcRes.pm_i_actual_deg.toFixed(1)),
        pm_v_deg: Number(acdcRes.pm_v_actual_deg.toFixed(1)),
        earthLeakage_mA: Number(acdcRes.earthLeakage_mA.toFixed(2)),
        alerts: {
          dangerCount: alerts.danger.length,
          warningCount: alerts.warning.length,
          items: alerts.all.slice(0, 8).map((a) => `${a.severity.toUpperCase()}: ${a.title} (${a.metric})`),
        },
      };
      resultSummary = `η_pfc=${acdcRes.efficiency_pct.toFixed(2)}% · Tj=${acdcRes.Tj_fast_C.toFixed(1)}°C · ${alerts.danger.length}D/${alerts.warning.length}W`;
    } else if (name === 'design_and_rank_inductor') {
      const inductorId = String(rawArgs.inductorId || 'dcdc-out-choke');
      const goal = (rawArgs.goal as InductorOptGoal) || 'balanced';
      const shapeFilter = (rawArgs.shapeFilter as InductorShapeFilter) || 'all';
      const commit = Boolean(rawArgs.commit);
      const overrides = (rawArgs.overrides as Record<string, unknown>) || {};

      const { dcdcRes, acdcRes } = evaluateAll();
      const domain: 'dcdc' | 'acdc' = inductorId.startsWith('ac-') || inductorId === 'pfc-boost' ? 'acdc' : 'dcdc';
      const reqs = extractCircuitInductors(domain, workingDcdc, dcdcRes, workingAcdc, acdcRes);
      const req = reqs.find((r) => r.id === inductorId) || reqs[0];
      const ranked = rankInductorCoreMaterials(req, goal, shapeFilter);

      let nextOverrides = { ...(workingIndCfg[req.id]?.overrides || {}), ...overrides };
      const nextLocks: CustomInductorLocks = {
        ...(workingIndCfg[req.id]?.locks || DEFAULT_IND_LOCKS),
        ...(overrides.coreId ? { coreId: true } : {}),
        ...(overrides.materialId ? { materialId: true } : {}),
        ...(overrides.turnsN !== undefined ? { turnsN: true } : {}),
        ...(overrides.airGap_mm !== undefined ? { airGap_mm: true } : {}),
      };

      if (commit && Object.keys(overrides).length === 0 && ranked[0]) {
        nextOverrides = {
          ...nextOverrides,
          coreId: ranked[0].core.id,
          materialId: ranked[0].material.id,
        };
        nextLocks.coreId = true;
        nextLocks.materialId = true;
      }

      const sol = solveCustomInductorDesign(req, nextOverrides, nextLocks);
      if (commit) {
        workingIndCfg[req.id] = {
          buildMode: 'custom',
          overrides: nextOverrides,
          locks: nextLocks,
        };
        committed = true;
        committedAny = true;
      }

      argsSummary = `${req.id} (${goal}, ${shapeFilter})`;
      result = {
        inductorId: req.id,
        committed,
        activeDesign: {
          coreId: sol.core.id,
          coreName: sol.core.name,
          materialId: sol.material.id,
          materialName: sol.material.name,
          turnsN: sol.turnsN,
          airGap_mm: sol.airGap_mm,
          wireAwg: sol.wire.awg,
          parallelStrands: sol.parallelStrands,
          L_at_Idc_uH: Number(sol.L_at_Idc_uH.toFixed(2)),
          B_pk_mT: Number((sol.B_pk_T * 1000).toFixed(0)),
          satMargin_pct: Number(sol.satMargin_pct.toFixed(1)),
          windowFill_pct: Number(sol.windowFill_pct.toFixed(1)),
          P_cu_total_W: Number(sol.P_cu_total_W.toFixed(2)),
          P_core_W: Number(sol.P_core_W.toFixed(2)),
          P_total_W: Number(sol.P_total_W.toFixed(2)),
          T_hotspot_C: Number(sol.T_hotspot_C.toFixed(1)),
        },
        topRanked: ranked.slice(0, 4).map((r) => ({
          coreId: r.core.id,
          materialId: r.material.id,
          turnsN: r.sol.turnsN,
          airGap_mm: r.sol.airGap_mm,
          B_pk_mT: Number((r.sol.B_pk_T * 1000).toFixed(0)),
          fill_pct: Number(r.sol.windowFill_pct.toFixed(1)),
          P_total_W: Number(r.sol.P_total_W.toFixed(2)),
          T_hot_C: Number(r.sol.T_hotspot_C.toFixed(1)),
          passesAll: r.passesAll,
        })),
      };
      resultSummary = `${sol.core.id}/${sol.material.id} · ${sol.turnsN}T · ${sol.P_total_W.toFixed(2)}W · ${sol.T_hotspot_C.toFixed(0)}°C`;
    } else if (name === 'rank_transformer_cores') {
      const commitBest = Boolean(rawArgs.commitBest);
      const ranked = rankTransformerCoresForDcDc(workingDcdc).slice(0, 5);
      if (commitBest && ranked[0]) {
        workingDcdc = { ...workingDcdc, coreId: ranked[0].core.id };
        committed = true;
        committedAny = true;
      }
      argsSummary = `commitBest=${commitBest}`;
      result = {
        committed,
        activeCoreId: workingDcdc.coreId,
        rankedCores: ranked.map((r) => ({
          coreId: r.core.id,
          name: r.core.name,
          Np_Ns: `${r.res.Np_actual}:${r.res.Ns_actual}`,
          Bpk_mT: Number(r.res.Bpk_mT.toFixed(1)),
          windowFill_pct: Number(r.res.windowFill_pct.toFixed(1)),
          Pmag_total_W: Number((r.res.Pcore_W + r.res.Pcu_W).toFixed(2)),
          Tcore_C: Number(r.res.Tcore_C.toFixed(1)),
          passesAll: r.passesAll,
        })),
      };
      resultSummary = ranked[0]
        ? `Best: ${ranked[0].core.id} (${ranked[0].res.windowFill_pct.toFixed(0)}% fill, ${(ranked[0].res.Pcore_W + ranked[0].res.Pcu_W).toFixed(1)}W)`
        : 'No cores ranked';
    } else if (name === 'design_capacitor_bank') {
      const capId = String(rawArgs.capacitorId || 'dcdc-out-cap');
      const commit = Boolean(rawArgs.commit);
      const overrides = (rawArgs.overrides as Record<string, unknown>) || {};
      const { dcdcRes, acdcRes } = evaluateAll();
      const domain: 'dcdc' | 'acdc' = capId.startsWith('acdc-') ? 'acdc' : 'dcdc';
      const reqs = extractCircuitCapacitors(domain, workingDcdc, dcdcRes, workingAcdc, acdcRes);
      const req = reqs.find((r) => r.id === capId) || reqs[0];
      const nextOverrides = { ...(workingCapCfg[req.id]?.overrides || {}), ...overrides };
      const nextLocks: CustomCapBankLocks = {
        ...(workingCapCfg[req.id]?.locks || DEFAULT_CAP_LOCKS),
        ...(overrides.partId ? { partId: true } : {}),
        ...(overrides.seriesCount !== undefined ? { seriesCount: true } : {}),
        ...(overrides.parallelCount !== undefined ? { parallelCount: true } : {}),
      };
      const sol = solveCapacitorBank(req, nextOverrides, nextLocks);
      const candidates = rankReadyCotsCapacitors(req).slice(0, 4);
      if (commit) {
        workingCapCfg[req.id] = {
          viewMode: 'builder',
          overrides: nextOverrides,
          locks: nextLocks,
        };
        committed = true;
        committedAny = true;
      }
      argsSummary = req.id;
      result = {
        capacitorId: req.id,
        committed,
        activeBank: {
          partId: sol.unitPart.id,
          mpn: sol.unitPart.mpn,
          matrix: `${sol.seriesCount}S × ${sol.parallelCount}P`,
          bank_C_uF: Number(sol.bank_C_uF.toFixed(1)),
          bank_ESR_mOhm: Number(sol.bank_ESR_mOhm.toFixed(2)),
          voltageDerating_pct: Number(sol.voltageDerating_pct.toFixed(1)),
          rippleUtilization_pct: Number(sol.rippleUtilization_pct.toFixed(1)),
          T_hotspot_C: Number(sol.T_hotspot_C.toFixed(1)),
          L10_life_years: Number(sol.L10_life_years.toFixed(1)),
          status: sol.status,
        },
        topParts: candidates.map((c) => ({
          partId: c.unitPart.id,
          mpn: c.unitPart.mpn,
          dielectric: c.unitPart.dielectric,
          V_rated_V: c.unitPart.V_rated_V,
          C_uF: c.unitPart.C_uF,
        })),
      };
      resultSummary = `${sol.unitPart.mpn} (${sol.seriesCount}S×${sol.parallelCount}P) · L10=${sol.L10_life_years.toFixed(1)}yr`;
    } else if (name === 'run_transient_step_check') {
      const scenario = rawArgs.scenario === 'soft-start' ? 'soft-start' : 'load-step';
      const initialLoad_pct = Number(rawArgs.initialLoad_pct ?? 20);
      const finalLoad_pct = Number(rawArgs.finalLoad_pct ?? 90);
      const dcdcRes = solveDcDcDesign(workingDcdc);
      const sim = runTransientLoadStep(workingDcdc, dcdcRes, {
        scenario,
        initialLoad_pct,
        finalLoad_pct,
      });
      argsSummary = `${scenario} ${initialLoad_pct}%->${finalLoad_pct}%`;
      result = {
        scenario,
        controllerLabel: sim.controllerLabel,
        v_nom_V: Number(sim.v_nom_V.toFixed(3)),
        maxOvershoot_mV: Number(sim.maxOvershoot_mV.toFixed(1)),
        maxUndershoot_mV: Number(sim.maxUndershoot_mV.toFixed(1)),
        maxDeviation_pct: Number(sim.maxDeviation_pct.toFixed(2)),
        settlingTime_us: Number(sim.settlingTime_us.toFixed(0)),
        i_lo_peak_A: Number(sim.i_lo_peak_A.toFixed(2)),
      };
      resultSummary = `ΔV_max=${sim.maxDeviation_pct.toFixed(2)}% · t_settle=${sim.settlingTime_us.toFixed(0)}µs`;
    } else if (name === 'run_auto_optimizer') {
      const domain = rawArgs.domain === 'acdc' ? 'acdc' : 'dcdc';
      const commit = Boolean(rawArgs.commit);
      argsSummary = `${domain} (commit=${commit})`;
      if (domain === 'dcdc') {
        const opt = optimizeDcDcUnlocked(workingDcdc, workingDcdc, null, dcdcLocked);
        if (commit) {
          workingDcdc = opt.nextState;
          committed = true;
          committedAny = true;
        }
        const dcdcRes = solveDcDcDesign(opt.nextState);
        result = {
          domain: 'dcdc',
          committed,
          changesCount: opt.changes.length,
          changes: opt.changes.slice(0, 10),
          efficiency_pct: Number(dcdcRes.efficiency_pct.toFixed(2)),
          pm_actual_deg: Number(dcdcRes.pm_actual_deg.toFixed(1)),
        };
        resultSummary = `${opt.changes.length} updates · η=${dcdcRes.efficiency_pct.toFixed(2)}%`;
      } else {
        const opt = optimizeAcDcUnlocked(workingAcdc, workingAcdc, null, acdcLocked);
        if (commit) {
          workingAcdc = opt.nextState;
          committed = true;
          committedAny = true;
        }
        const acdcRes = solveAcDcDesign(opt.nextState);
        result = {
          domain: 'acdc',
          committed,
          changesCount: opt.changes.length,
          changes: opt.changes.slice(0, 10),
          efficiency_pct: Number(acdcRes.efficiency_pct.toFixed(2)),
        };
        resultSummary = `${opt.changes.length} updates · η=${acdcRes.efficiency_pct.toFixed(2)}%`;
      }
    } else if (name === 'search_parts_catalog') {
      const cat = String(rawArgs.category || 'semiconductors');
      const q = String(rawArgs.query || '').toLowerCase().trim();
      argsSummary = `${cat} "${q}"`;
      const match = (text: string) => !q || text.toLowerCase().includes(q);
      if (cat === 'semiconductors') {
        result = {
          items: SEMICONDUCTOR_DATABASE.filter((s) =>
            match(`${s.id} ${s.name} ${s.tech} ${s.role} ${s.Vds_max_V}V`)
          )
            .slice(0, 12)
            .map((s) => ({
              id: s.id,
              name: s.name,
              tech: s.tech,
              role: s.role,
              Vds_max_V: s.Vds_max_V,
              Id_max_A: s.Id_max_A,
              Rds_on_25C_mOhm: s.Rds_on_25C_mOhm,
            })),
        };
      } else if (cat === 'transformerCores') {
        result = {
          items: CORE_DATABASE.filter((c) => match(`${c.id} ${c.name}`)).map((c) => ({
            id: c.id,
            name: c.name,
            Ae_mm2: c.Ae_mm2,
            Aw_mm2: c.Aw_mm2,
          })),
        };
      } else if (cat === 'transformerMaterials') {
        result = {
          items: MATERIAL_DATABASE.filter((m) => match(`${m.id} ${m.name}`)).map((m) => ({
            id: m.id,
            name: m.name,
            Bsat_100C_mT: Math.round(m.Bsat_100C_T * 1000),
          })),
        };
      } else if (cat === 'inductorCores') {
        result = {
          items: INDUCTOR_CORE_DATABASE.filter((c) => match(`${c.id} ${c.name} ${c.shape} ${c.family}`))
            .slice(0, 15)
            .map((c) => ({
              id: c.id,
              name: c.name,
              shape: c.shape,
              family: c.family,
              Ae_mm2: c.Ae_mm2,
              Aw_mm2: c.Aw_mm2,
            })),
        };
      } else if (cat === 'inductorMaterials') {
        result = {
          items: INDUCTOR_MATERIAL_DATABASE.filter((m) => match(`${m.id} ${m.name} ${m.category}`)).map((m) => ({
            id: m.id,
            name: m.name,
            category: m.category,
            mu_i: m.mu_i,
            Bsat_T: m.Bsat_T,
          })),
        };
      } else {
        result = {
          items: READY_COTS_CAPACITORS.filter((c) => match(`${c.id} ${c.mpn} ${c.dielectric} ${c.V_rated_V}V`))
            .slice(0, 12)
            .map((c) => ({
              id: c.id,
              mpn: c.mpn,
              dielectric: c.dielectric,
              V_rated_V: c.V_rated_V,
              C_uF: c.C_uF,
              ESR_mOhm: c.ESR_mOhm,
            })),
        };
      }
      const items = (result.items as unknown[]) || [];
      resultSummary = `${items.length} matches`;
    } else {
      argsSummary = name;
      result = { error: `Unknown tool: ${name}` };
      resultSummary = 'error';
    }

    trace.push({ step, tool: name, argsSummary, resultSummary, committed });
    return result;
  };

  const getCommittedDiff = () => {
    const dcdcDiff: Partial<DcDcDesignState> = {};
    for (const k of Object.keys(workingDcdc) as (keyof DcDcDesignState)[]) {
      if (JSON.stringify(workingDcdc[k]) !== JSON.stringify(initialDcdc[k])) {
        (dcdcDiff as Record<string, unknown>)[k] = workingDcdc[k];
      }
    }
    const acdcDiff: Partial<AcDcDesignState> = {};
    for (const k of Object.keys(workingAcdc) as (keyof AcDcDesignState)[]) {
      if (JSON.stringify(workingAcdc[k]) !== JSON.stringify(initialAcdc[k])) {
        (acdcDiff as Record<string, unknown>)[k] = workingAcdc[k];
      }
    }
    const indDiff: Record<string, PerInductorConfig> = {};
    for (const k of Object.keys(workingIndCfg)) {
      if (JSON.stringify(workingIndCfg[k]) !== JSON.stringify(initialIndCfg[k])) {
        indDiff[k] = workingIndCfg[k];
      }
    }
    const capDiff: Record<string, PerCapConfig> = {};
    for (const k of Object.keys(workingCapCfg)) {
      if (JSON.stringify(workingCapCfg[k]) !== JSON.stringify(initialCapCfg[k])) {
        capDiff[k] = workingCapCfg[k];
      }
    }

    const hasChanges =
      committedAny &&
      (Object.keys(dcdcDiff).length > 0 ||
        Object.keys(acdcDiff).length > 0 ||
        Object.keys(indDiff).length > 0 ||
        Object.keys(capDiff).length > 0);

    return {
      hasChanges,
      dcdcPatch: dcdcDiff,
      acdcPatch: acdcDiff,
      inductorConfigsPatch: indDiff,
      capacitorConfigsPatch: capDiff,
      finalEvaluation: evaluateAll(),
    };
  };

  return {
    executeTool,
    getTrace: () => trace,
    getCommittedDiff,
    getWorkingState: () => ({
      dcdcState: workingDcdc,
      acdcState: workingAcdc,
      inductorConfigs: workingIndCfg,
      capacitorConfigs: workingCapCfg,
    }),
  };
}
