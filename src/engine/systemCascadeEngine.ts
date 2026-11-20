import { AcDcDesignState, DcDcDesignState } from '../data/databases';
import { AcDcResults } from './acdcEngine';
import { DcDcResults } from './dcdcEngine';

export type ProjectOutputMode = 'dcdc-only' | 'acdc-only' | 'combined';

export interface SystemLinkConfig {
  outputMode?: ProjectOutputMode;
  linkBusVoltage: boolean;
  linkLoadPower: boolean;
  /** Combined 2-stage digital controller choice: true = same shared MCU, false = separate MCUs with isolated handshake. */
  sharedMcu?: boolean;
}

export interface SystemCascadeSummary {
  eta_system_pct: number;
  Pout_system_W: number;
  Pin_ac_system_W: number;
  P_pfc_required_W: number;
  Ploss_acdc_W: number;
  Ploss_dcdc_W: number;
  Ploss_system_W: number;
  Iac_system_rms_nom_A: number;
  Iac_system_rms_max_A: number;
  busVoltageMismatch_V: number;
  powerMismatch_W: number;
  holdupMatched: boolean;
  bottleneckStage: 'acdc' | 'dcdc' | 'balanced';
  dcdcLossShare_pct: number;
  acdcLossShare_pct: number;
}

export function computeCoupledStagePatches(params: {
  acdcState: AcDcDesignState;
  acdcRes: AcDcResults;
  dcdcState: DcDcDesignState;
  dcdcRes: DcDcResults;
  linkConfig: SystemLinkConfig;
}): {
  dcdcPatch: Partial<DcDcDesignState> | null;
  acdcPatch: Partial<AcDcDesignState> | null;
} {
  const { acdcState, acdcRes, dcdcState, dcdcRes, linkConfig } = params;
  let dcdcPatch: Partial<DcDcDesignState> | null = null;
  let acdcPatch: Partial<AcDcDesignState> | null = null;

  if (linkConfig.linkBusVoltage) {
    const vNom = Math.round(acdcState.Vdc_bus_V);
    const halfRipple = 0.5 * Math.max(4, acdcRes.Vdc_ripple_pp_V);
    const vMin = Math.max(120, Math.round(Math.min(acdcState.Vdc_min_hold_V, vNom - halfRipple - 10)));
    const vMax = Math.round(vNom + halfRipple + 15);
    if (
      Math.abs(dcdcState.Vin_nom_V - vNom) >= 1 ||
      Math.abs(dcdcState.Vin_min_V - vMin) >= 2 ||
      Math.abs(dcdcState.Vin_max_V - vMax) >= 2
    ) {
      dcdcPatch = {
        Vin_nom_V: vNom,
        Vin_min_V: vMin,
        Vin_max_V: vMax,
      };
    }
  }

  if (linkConfig.linkLoadPower) {
    const etaDcdc = Math.max(0.55, Math.min(0.995, dcdcRes.efficiency_pct / 100));
    const pReq = Math.round(dcdcState.Pout_W / etaDcdc);
    if (Math.abs(acdcState.Pout_W - pReq) >= 5) {
      acdcPatch = {
        Pout_W: pReq,
      };
    }
  }

  return { dcdcPatch, acdcPatch };
}

export function solveSystemCascade(
  acdcState: AcDcDesignState,
  acdcRes: AcDcResults,
  dcdcState: DcDcDesignState,
  dcdcRes: DcDcResults
): SystemCascadeSummary {
  const etaAcdc = Math.max(0.3, Math.min(0.998, acdcRes.efficiency_pct / 100));
  const etaDcdc = Math.max(0.3, Math.min(0.998, dcdcRes.efficiency_pct / 100));
  const eta_system_pct = etaAcdc * etaDcdc * 100;

  const Pout_system_W = dcdcState.Pout_W;
  const P_pfc_required_W = Pout_system_W / etaDcdc;
  const Ploss_dcdc_W = dcdcRes.Ptotal_loss_W;
  const Ploss_acdc_W = acdcRes.Ptotal_loss_W;
  const Ploss_system_W = Ploss_acdc_W + Ploss_dcdc_W;
  const Pin_ac_system_W = Pout_system_W / Math.max(0.25, etaAcdc * etaDcdc);

  const pf = Math.max(0.7, acdcRes.powerFactor_true);
  const Iac_system_rms_nom_A = Pin_ac_system_W / Math.max(40, acdcState.Vac_rms_V * pf);
  const Iac_system_rms_max_A = Pin_ac_system_W / Math.max(40, acdcState.Vac_min_V * pf);

  const busVoltageMismatch_V = Math.abs(acdcState.Vdc_bus_V - dcdcState.Vin_nom_V);
  const powerMismatch_W = Math.abs(acdcState.Pout_W - P_pfc_required_W);
  const holdupMatched = acdcState.Vdc_min_hold_V >= dcdcState.Vin_min_V * 0.96;

  const totalLossSafe = Math.max(1e-3, Ploss_system_W);
  const dcdcLossShare_pct = (Ploss_dcdc_W / totalLossSafe) * 100;
  const acdcLossShare_pct = (Ploss_acdc_W / totalLossSafe) * 100;

  const bottleneckStage: SystemCascadeSummary['bottleneckStage'] =
    dcdcLossShare_pct > 58 ? 'dcdc' : acdcLossShare_pct > 58 ? 'acdc' : 'balanced';

  return {
    eta_system_pct: Number(eta_system_pct.toFixed(2)),
    Pout_system_W,
    Pin_ac_system_W: Number(Pin_ac_system_W.toFixed(1)),
    P_pfc_required_W: Number(P_pfc_required_W.toFixed(1)),
    Ploss_acdc_W: Number(Ploss_acdc_W.toFixed(1)),
    Ploss_dcdc_W: Number(Ploss_dcdc_W.toFixed(1)),
    Ploss_system_W: Number(Ploss_system_W.toFixed(1)),
    Iac_system_rms_nom_A: Number(Iac_system_rms_nom_A.toFixed(2)),
    Iac_system_rms_max_A: Number(Iac_system_rms_max_A.toFixed(2)),
    busVoltageMismatch_V: Number(busVoltageMismatch_V.toFixed(1)),
    powerMismatch_W: Number(powerMismatch_W.toFixed(0)),
    holdupMatched,
    bottleneckStage,
    dcdcLossShare_pct: Number(dcdcLossShare_pct.toFixed(1)),
    acdcLossShare_pct: Number(acdcLossShare_pct.toFixed(1)),
  };
}
