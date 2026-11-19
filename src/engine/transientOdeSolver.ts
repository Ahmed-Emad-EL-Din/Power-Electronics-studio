import { DcDcDesignState } from '../data/databases';
import { DcDcResults } from './dcdcEngine';

export interface TransientSimConfig {
  scenario: 'load-step' | 'soft-start';
  initialLoad_pct: number;
  finalLoad_pct: number;
  stepTime_us: number;
  totalTime_us: number;
  slewRate_A_us: number;
}

export interface TransientPoint {
  t_us: number;
  v_out_V: number;
  v_ref_V: number;
  i_lo_A: number;
  i_load_A: number;
  duty_u: number;
  i_cap_A: number;
}

export interface TransientSimResult {
  points: TransientPoint[];
  v_nom_V: number;
  v_peak_V: number;
  v_min_V: number;
  maxOvershoot_mV: number;
  maxUndershoot_mV: number;
  maxDeviation_pct: number;
  settlingTime_us: number;
  i_lo_peak_A: number;
  steadyStateError_mV: number;
  controllerLabel: string;
}

/**
 * 4th-Order Runge-Kutta (RK4) Closed-Loop Switched-Averaged ODE Transient Simulator.
 * Couples output LC + ESR plant dynamics with the exact discrete-time Tustin
 * 2P2Z / 3P3Z compensator coefficients from DcDcResults at fs_digital_kHz.
 */
export function runTransientLoadStep(
  state: DcDcDesignState,
  res: DcDcResults,
  config?: Partial<TransientSimConfig>
): TransientSimResult {
  const cfg: TransientSimConfig = {
    scenario: config?.scenario ?? 'load-step',
    initialLoad_pct: Math.max(5, Math.min(120, config?.initialLoad_pct ?? 20)),
    finalLoad_pct: Math.max(5, Math.min(130, config?.finalLoad_pct ?? 90)),
    stepTime_us: Math.max(20, config?.stepTime_us ?? 150),
    totalTime_us: Math.max(200, config?.totalTime_us ?? 900),
    slewRate_A_us: Math.max(0.2, config?.slewRate_A_us ?? 8.0),
  };

  const nPhases = res.nPhases;
  const isHalfBridge = state.topology === 'llc-hb';
  const V_bridge = isHalfBridge ? state.Vin_nom_V * 0.5 : state.Vin_nom_V;
  const n = Math.max(0.1, res.Np_actual / Math.max(1, res.Ns_actual));
  const Vsec_drive =
    state.txType === 'current-doubler' ? V_bridge / (2 * n) : V_bridge / n;

  const Lo_eff = Math.max(0.4e-6, (state.Lo_uH * 1e-6) / nPhases);
  const Co_eff = Math.max(5e-6, state.Co_uF * 1e-6);
  const R_esr = Math.max(0.2e-3, state.ESR_Co_mOhm * 1e-3);
  const R_dcr = Math.max(0.5e-3, (res.Pcu_W / Math.max(1, res.Iout_total_A * res.Iout_total_A)) * 0.45);
  const Llk_H = Math.max(0.2e-6, state.Llk_uH * 1e-6);
  const fsw_Hz = Math.max(20e3, state.fsw_kHz * 1e3);

  const Iout_rated = Math.max(0.5, state.Pout_W / Math.max(1, state.Vout_V));
  const I_init = Iout_rated * (cfg.initialLoad_pct / 100);
  const I_final = Iout_rated * (cfg.finalLoad_pct / 100);

  const V_ref_target = state.Vout_V;
  const isSoftStart = cfg.scenario === 'soft-start';
  const softStartRamp_us = Math.max(120, cfg.totalTime_us * 0.45);

  const getIload = (t_us: number): number => {
    if (isSoftStart) {
      return I_final;
    }
    if (t_us <= cfg.stepTime_us) return I_init;
    const dt_step = t_us - cfg.stepTime_us;
    const deltaI = I_final - I_init;
    const rampDuration = Math.abs(deltaI) / cfg.slewRate_A_us;
    if (rampDuration <= 1e-6 || dt_step >= rampDuration) return I_final;
    return I_init + deltaI * (dt_step / rampDuration);
  };

  const getVref = (t_us: number): number => {
    if (!isSoftStart) return V_ref_target;
    if (t_us >= softStartRamp_us) return V_ref_target;
    return Math.max(0.2, V_ref_target * (t_us / softStartRamp_us));
  };

  // Compute steady-state open-loop duty needed to sustain Vout
  const D_ss = Math.max(0.08, Math.min(0.9, (V_ref_target + I_init * R_dcr) / Math.max(1, Vsec_drive)));

  const is3P3Z = res.isTwoZeroComp;
  const isCurrentMode =
    state.controlType === 'pcmc' ||
    state.controlType === 'charge-control' ||
    state.controlType === 'mpc';
  const k_refl = state.txType === 'current-doubler' ? 0.5 / n : 1 / n;
  const Rsense_eff = Math.max(0.01, (state.Rsense_mOhm * 1e-3) / k_refl);
  const { b0, b1, b2, b3, a1, a2, a3 } = res;
  const Kp_inner_i = (Lo_eff * (2 * Math.PI * (fsw_Hz / 5))) / Math.max(1, Vsec_drive);

  // Initial states
  let iLo = isSoftStart ? 0 : I_init;
  let vCo = isSoftStart ? 0 : V_ref_target;
  let u_duty = isSoftStart ? 0.05 : D_ss;
  let i_ref_cmd = isSoftStart ? 0 : I_init;

  // Initialize discrete filter histories at steady state so load-step starts completely flat
  let u1 = 0;
  let u2 = 0;
  let u3 = 0;
  let e1 = 0;
  let e2 = 0;
  let e3 = 0;

  // Choose integration step <= 0.5 us and aligned with digital sampling period
  const Ts_digital_us = 1e3 / Math.max(40, state.fs_digital_kHz);
  const dt_us = Math.min(0.5, Ts_digital_us / 4);
  const dt_s = dt_us * 1e-6;
  const totalSteps = Math.min(4000, Math.max(400, Math.round(cfg.totalTime_us / dt_us)));
  const sampleStride = Math.max(1, Math.floor(totalSteps / 220));

  let nextIsrTime_us = 0;
  const points: TransientPoint[] = [];

  const derivs = (t_us: number, x_iLo: number, x_vCo: number, duty: number): [number, number] => {
    const iLoad = getIload(t_us);
    // Effective duty after PSFB leakage duty loss
    const dLoss = res.isLLC
      ? 0
      : Math.min(0.35, (4 * Llk_H * Math.max(0, x_iLo) * fsw_Hz) / Math.max(10, n * V_bridge));
    const dEff = Math.max(0, Math.min(0.95, duty - dLoss));
    const vSwitch = dEff * Vsec_drive;
    const iCap = x_iLo - iLoad;
    const vOutInst = x_vCo + iCap * R_esr;
    const diLo_dt = (vSwitch - vOutInst - x_iLo * R_dcr) / Lo_eff;
    const dvCo_dt = iCap / Co_eff;
    return [diLo_dt, dvCo_dt];
  };

  for (let step = 0; step <= totalSteps; step++) {
    const t_us = step * dt_us;
    const iLoad = getIload(t_us);
    const vRef = getVref(t_us);
    const iCap = iLo - iLoad;
    const vOut = vCo + iCap * R_esr;

    // Digital ISR update
    if (t_us + 1e-9 >= nextIsrTime_us) {
      const e0 = vRef - vOut;
      let u_delta: number;
      if (is3P3Z) {
        u_delta = a1 * u1 + a2 * u2 + a3 * u3 + b0 * e0 + b1 * e1 + b2 * e2 + b3 * e3;
      } else {
        u_delta = a1 * u1 + a2 * u2 + b0 * e0 + b1 * e1 + b2 * e2;
      }

      if (isCurrentMode) {
        const iBase = isSoftStart ? 0 : I_init;
        const iRefRaw = iBase + (0.65 / Rsense_eff) * u_delta;
        const iRefClamped = Math.max(0, Math.min(Iout_rated * 1.75, iRefRaw));
        const uDeltaClamped = ((iRefClamped - iBase) * Rsense_eff) / 0.65;
        u3 = u2;
        u2 = u1;
        u1 = uDeltaClamped;
        i_ref_cmd = iRefClamped;
      } else {
        const uBase = isSoftStart ? 0 : D_ss;
        const uRaw = uBase + u_delta;
        const uClamped = Math.max(0.02, Math.min(0.94, uRaw));
        u3 = u2;
        u2 = u1;
        u1 = uClamped - uBase;
        u_duty = uClamped;
      }

      e3 = e2;
      e2 = e1;
      e1 = e0;
      nextIsrTime_us += Ts_digital_us;
    }

    // Fast inner current-mode modulator update
    if (isCurrentMode) {
      const dLossNom = res.isLLC
        ? 0
        : Math.min(0.28, (4 * Llk_H * Math.max(0, iLo) * fsw_Hz) / Math.max(10, n * V_bridge));
      const dFeedForward = (vRef + iLo * R_dcr) / Math.max(1, Vsec_drive) + dLossNom;
      u_duty = Math.max(0.02, Math.min(0.94, dFeedForward + Kp_inner_i * (i_ref_cmd - iLo)));
    }

    if (step % sampleStride === 0 || step === totalSteps) {
      points.push({
        t_us: Number(t_us.toFixed(1)),
        v_out_V: Number(vOut.toFixed(3)),
        v_ref_V: Number(vRef.toFixed(3)),
        i_lo_A: Number(iLo.toFixed(2)),
        i_load_A: Number(iLoad.toFixed(2)),
        duty_u: Number(u_duty.toFixed(4)),
        i_cap_A: Number(iCap.toFixed(2)),
      });
    }

    if (step === totalSteps) break;

    // 4th-order Runge-Kutta step
    const [k1i, k1v] = derivs(t_us, iLo, vCo, u_duty);
    const [k2i, k2v] = derivs(t_us + 0.5 * dt_us, iLo + 0.5 * dt_s * k1i, vCo + 0.5 * dt_s * k1v, u_duty);
    const [k3i, k3v] = derivs(t_us + 0.5 * dt_us, iLo + 0.5 * dt_s * k2i, vCo + 0.5 * dt_s * k2v, u_duty);
    const [k4i, k4v] = derivs(t_us + dt_us, iLo + dt_s * k3i, vCo + dt_s * k3v, u_duty);

    iLo = Math.max(0, iLo + (dt_s / 6) * (k1i + 2 * k2i + 2 * k3i + k4i));
    vCo = Math.max(0, vCo + (dt_s / 6) * (k1v + 2 * k2v + 2 * k3v + k4v));
  }

  // Extract transient KPIs after stepTime_us (or full run for soft-start)
  const evalStartUs = isSoftStart ? softStartRamp_us : cfg.stepTime_us;
  const postPts = points.filter((p) => p.t_us >= evalStartUs);
  const scanPts = postPts.length > 0 ? postPts : points;

  let v_peak_V = V_ref_target;
  let v_min_V = V_ref_target;
  let i_lo_peak_A = 0;

  for (const p of scanPts) {
    if (p.v_out_V > v_peak_V) v_peak_V = p.v_out_V;
    if (p.v_out_V < v_min_V) v_min_V = p.v_out_V;
    if (p.i_lo_A > i_lo_peak_A) i_lo_peak_A = p.i_lo_A;
  }

  const maxOvershoot_mV = Math.max(0, (v_peak_V - V_ref_target) * 1000);
  const maxUndershoot_mV = Math.max(0, (V_ref_target - v_min_V) * 1000);
  const maxDev_V = Math.max(v_peak_V - V_ref_target, V_ref_target - v_min_V);
  const maxDeviation_pct = (maxDev_V / Math.max(0.1, V_ref_target)) * 100;

  // 2% settling band (min 50 mV)
  const settleBand_V = Math.max(0.05, V_ref_target * 0.015);
  let lastOutsideUs = evalStartUs;
  for (const p of scanPts) {
    if (Math.abs(p.v_out_V - V_ref_target) > settleBand_V) {
      lastOutsideUs = p.t_us;
    }
  }
  const settlingTime_us = Math.max(0, lastOutsideUs - evalStartUs);
  const finalPt = points[points.length - 1];
  const steadyStateError_mV = finalPt ? (finalPt.v_out_V - V_ref_target) * 1000 : 0;

  return {
    points,
    v_nom_V: V_ref_target,
    v_peak_V: Number(v_peak_V.toFixed(3)),
    v_min_V: Number(v_min_V.toFixed(3)),
    maxOvershoot_mV: Number(maxOvershoot_mV.toFixed(1)),
    maxUndershoot_mV: Number(maxUndershoot_mV.toFixed(1)),
    maxDeviation_pct: Number(maxDeviation_pct.toFixed(2)),
    settlingTime_us: Number(settlingTime_us.toFixed(1)),
    i_lo_peak_A: Number(i_lo_peak_A.toFixed(2)),
    steadyStateError_mV: Number(steadyStateError_mV.toFixed(1)),
    controllerLabel: `${state.controlType.toUpperCase()} (${is3P3Z ? '3P3Z' : '2P2Z'} @ ${state.fs_digital_kHz} kHz)`,
  };
}
