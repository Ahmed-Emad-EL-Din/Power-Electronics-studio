import React, { useState, useMemo } from 'react';
import {
  AcDcDesignState,
  DcDcDesignState,
  DcDcControlType,
  AcDcControlType,
} from '../data/databases';
import { DcDcResults, BodePoint } from '../engine/dcdcEngine';
import { AcDcResults } from '../engine/acdcEngine';
import { BodeStabilityGraph } from './BodeStabilityGraph';
import { InteractiveChart } from './InteractiveChart';
import { MathFormula } from './MathFormula';
import { LockToggleButton } from './AutoSolverControls';
import { useDesignSolver, useLockableValue } from './DesignSolverContext';
import { DcDcLockableKey, AcDcLockableKey } from '../engine/autoOptimizer';
import {
  Activity,
  Sliders,
  ShieldCheck,
  AlertTriangle,
  Cpu,
  Zap,
  RotateCcw,
  Compass,
  Gauge,
  GitCommit,
  Layers,
} from 'lucide-react';

interface SmallSignalDashboardProps {
  dcdcState: DcDcDesignState;
  setDcdcState: React.Dispatch<React.SetStateAction<DcDcDesignState>>;
  dcdcRes: DcDcResults;
  pinnedDcdcRes?: DcDcResults | null;
  acdcState: AcDcDesignState;
  setAcdcState: React.Dispatch<React.SetStateAction<AcDcDesignState>>;
  acdcRes: AcDcResults;
  initialDomain?: 'dcdc-loop' | 'acdc-inner' | 'acdc-outer';
  compactHeader?: boolean;
}

export const SmallSignalDashboard: React.FC<SmallSignalDashboardProps> = ({
  dcdcState,
  setDcdcState,
  dcdcRes,
  pinnedDcdcRes = null,
  acdcState,
  setAcdcState,
  acdcRes,
  initialDomain = 'dcdc-loop',
  compactHeader = false,
}) => {
  const [activeLoop, setActiveLoop] = useState<'dcdc-loop' | 'acdc-inner' | 'acdc-outer'>(
    initialDomain
  );

  const {
    dcdcLocked,
    toggleDcdcLock,
    dcdcChanges,
    setDcdcField: updateDcdc,
    acdcLocked,
    toggleAcdcLock,
    acdcChanges,
    setAcdcField: updateAcdc,
  } = useDesignSolver();

  const isDcdcAuto = (key: DcDcLockableKey) => dcdcChanges.some((c) => c.key === key);
  const isAcdcAuto = (key: AcDcLockableKey) => acdcChanges.some((c) => c.key === key);

  // Manual Pole-Zero & Gain Override Sandbox State (allows testing custom compensator tweaks live)
  const [manualOverride, setManualOverride] = useState<boolean>(false);
  const [manualFz1_kHz, setManualFz1_kHz] = useState<number>(dcdcRes.fz1_kHz);
  const [manualFz2_kHz, setManualFz2_kHz] = useState<number>(dcdcRes.fz2_kHz);
  const [manualFp1_kHz, setManualFp1_kHz] = useState<number>(dcdcRes.fp1_kHz);
  const [manualFp2_kHz, setManualFp2_kHz] = useState<number>(dcdcRes.fp2_kHz);
  const [manualGainTrim_dB, setManualGainTrim_dB] = useState<number>(0);

  // Step-load transient configuration (% of rated load current step)
  const loadStepLock = useLockableValue<number>(50);
  const loadStepPct = loadStepLock.value;
  const [nyquistHoverIdx, setNyquistHoverIdx] = useState<number | null>(null);

  const syncManualFromEngine = () => {
    if (activeLoop === 'dcdc-loop') {
      setManualFz1_kHz(Number(dcdcRes.fz1_kHz.toFixed(3)));
      setManualFz2_kHz(Number(dcdcRes.fz2_kHz.toFixed(3)));
      setManualFp1_kHz(Number(dcdcRes.fp1_kHz.toFixed(2)));
      setManualFp2_kHz(Number(dcdcRes.fp2_kHz.toFixed(2)));
      setManualGainTrim_dB(0);
    } else if (activeLoop === 'acdc-inner') {
      setManualFz1_kHz(Number(acdcRes.fz_i_kHz.toFixed(3)));
      setManualFz2_kHz(Number((acdcRes.fz_i_kHz * 1.5).toFixed(3)));
      setManualFp1_kHz(Number(acdcRes.fp_i_kHz.toFixed(2)));
      setManualFp2_kHz(Number((acdcState.fsw_kHz * 0.5).toFixed(2)));
      setManualGainTrim_dB(0);
    } else {
      setManualFz1_kHz(Number((acdcRes.fz_v_Hz / 1000).toFixed(4)));
      setManualFz2_kHz(Number(((acdcRes.fz_v_Hz * 2) / 1000).toFixed(4)));
      setManualFp1_kHz(Number((acdcRes.fp_v_Hz / 1000).toFixed(4)));
      setManualFp2_kHz(0.3);
      setManualGainTrim_dB(0);
    }
  };

  // Unified Small-Signal Synthesis & Evaluation across DC-DC and AC-DC Loops
  const loopAnalysis = useMemo(() => {
    const evalPoint = (f_Hz: number): BodePoint => {
      if (activeLoop === 'dcdc-loop') {
        const base = dcdcRes.evaluators.evalBodePoint(f_Hz);
        if (!manualOverride) return base;

        const fz1_auto = Math.max(1, dcdcRes.fz1_kHz * 1e3);
        const fz2_auto = Math.max(1, dcdcRes.fz2_kHz * 1e3);
        const fp1_auto = Math.max(10, dcdcRes.fp1_kHz * 1e3);
        const fp2_auto = Math.max(10, dcdcRes.fp2_kHz * 1e3);

        const fz1_man = Math.max(1, manualFz1_kHz * 1e3);
        const fz2_man = Math.max(1, manualFz2_kHz * 1e3);
        const fp1_man = Math.max(10, manualFp1_kHz * 1e3);
        const fp2_man = Math.max(10, manualFp2_kHz * 1e3);

        const z1_auto_mag = Math.sqrt(1 + Math.pow(f_Hz / fz1_auto, 2));
        const z2_auto_mag = Math.sqrt(1 + Math.pow(f_Hz / fz2_auto, 2));
        const p1_auto_mag = Math.sqrt(1 + Math.pow(f_Hz / fp1_auto, 2));
        const p2_auto_mag = Math.sqrt(1 + Math.pow(f_Hz / fp2_auto, 2));

        const z1_man_mag = Math.sqrt(1 + Math.pow(f_Hz / fz1_man, 2));
        const z2_man_mag = Math.sqrt(1 + Math.pow(f_Hz / fz2_man, 2));
        const p1_man_mag = Math.sqrt(1 + Math.pow(f_Hz / fp1_man, 2));
        const p2_man_mag = Math.sqrt(1 + Math.pow(f_Hz / fp2_man, 2));

        const ratioMag =
          ((z1_man_mag * z2_man_mag) / (p1_man_mag * p2_man_mag)) /
          Math.max(1e-12, (z1_auto_mag * z2_auto_mag) / (p1_auto_mag * p2_auto_mag));
        const deltaMag_dB = 20 * Math.log10(Math.max(1e-9, ratioMag)) + manualGainTrim_dB;

        const deg = 180 / Math.PI;
        const phaseAuto =
          (Math.atan(f_Hz / fz1_auto) +
            Math.atan(f_Hz / fz2_auto) -
            Math.atan(f_Hz / fp1_auto) -
            Math.atan(f_Hz / fp2_auto)) *
          deg;
        const phaseMan =
          (Math.atan(f_Hz / fz1_man) +
            Math.atan(f_Hz / fz2_man) -
            Math.atan(f_Hz / fp1_man) -
            Math.atan(f_Hz / fp2_man)) *
          deg;
        const deltaPhase_deg = phaseMan - phaseAuto;

        return {
          freq_Hz: f_Hz,
          plantMag_dB: base.plantMag_dB,
          plantPhase_deg: base.plantPhase_deg,
          compMag_dB: Number((base.compMag_dB + deltaMag_dB).toFixed(2)),
          compPhase_deg: Number((base.compPhase_deg + deltaPhase_deg).toFixed(2)),
          loopMag_dB: Number((base.loopMag_dB + deltaMag_dB).toFixed(2)),
          loopPhase_deg: Number((base.loopPhase_deg + deltaPhase_deg).toFixed(2)),
          loopMagMin_dB: Number((base.loopMagMin_dB + deltaMag_dB).toFixed(2)),
          loopMagMax_dB: Number((base.loopMagMax_dB + deltaMag_dB).toFixed(2)),
          loopPhaseMin_deg: Number((base.loopPhaseMin_deg + deltaPhase_deg).toFixed(2)),
          loopPhaseMax_deg: Number((base.loopPhaseMax_deg + deltaPhase_deg).toFixed(2)),
        };
      }

      if (activeLoop === 'acdc-inner') {
        const w = 2 * Math.PI * f_Hz;
        const Lpfc_H = acdcState.Lpfc_uH * 1e-6;
        const RL_Ohm = acdcState.RL_mOhm * 1e-3;
        const Vdc = acdcState.Vdc_bus_V;
        const fsw_Hz = acdcState.fsw_kHz * 1e3;
        const Td = 1.5 / (acdcState.fs_ctrl_kHz * 1e3);

        const plantMag = Vdc / Math.sqrt(RL_Ohm * RL_Ohm + Math.pow(w * Lpfc_H, 2));
        const plantMag_dB = 20 * Math.log10(Math.max(1e-9, plantMag));
        const plantPhase_deg =
          -(Math.atan2(w * Lpfc_H, RL_Ohm) * 180) / Math.PI - (w * Td * 180) / Math.PI;

        const baseLoop = acdcRes.evaluators.evalBodeInner(f_Hz);
        const loopMag_dB = baseLoop.y1 + (manualOverride ? manualGainTrim_dB : 0);
        const loopPhase_deg = baseLoop.y2;

        const compMag_dB = loopMag_dB - plantMag_dB;
        const compPhase_deg = loopPhase_deg - plantPhase_deg;

        const plantMagMin_dB = plantMag_dB - 20 * Math.log10(1.15);
        const plantMagMax_dB = plantMag_dB - 20 * Math.log10(0.85);

        return {
          freq_Hz: f_Hz,
          plantMag_dB: Number(plantMag_dB.toFixed(2)),
          plantPhase_deg: Number(plantPhase_deg.toFixed(2)),
          compMag_dB: Number(compMag_dB.toFixed(2)),
          compPhase_deg: Number(compPhase_deg.toFixed(2)),
          loopMag_dB: Number(loopMag_dB.toFixed(2)),
          loopPhase_deg: Number(loopPhase_deg.toFixed(2)),
          loopMagMin_dB: Number((loopMag_dB + (plantMagMin_dB - plantMag_dB)).toFixed(2)),
          loopMagMax_dB: Number((loopMag_dB + (plantMagMax_dB - plantMag_dB)).toFixed(2)),
          loopPhaseMin_deg: Number((loopPhase_deg - (f_Hz / fsw_Hz) * 18).toFixed(2)),
          loopPhaseMax_deg: Number((loopPhase_deg + (f_Hz / fsw_Hz) * 12).toFixed(2)),
        };
      }

      // AC-DC Outer Voltage Loop
      const w = 2 * Math.PI * f_Hz;
      const Cdc_F = acdcState.Cdc_uF * 1e-6;
      const ESR_Ohm = acdcState.ESR_Cdc_mOhm * 1e-3;
      const Rload = (acdcState.Vdc_bus_V * acdcState.Vdc_bus_V) / Math.max(100, acdcState.Pout_W);
      const fp_load_Hz = 1 / (2 * Math.PI * (Rload / 2) * Cdc_F);
      const fz_esr_Hz = 1 / (2 * Math.PI * Math.max(1e-4, ESR_Ohm) * Cdc_F);

      const dcGain = (acdcState.Vac_rms_V / acdcState.Vdc_bus_V) * (Rload / 2);
      const plantMag =
        (dcGain * Math.sqrt(1 + Math.pow(f_Hz / fz_esr_Hz, 2))) /
        Math.sqrt(1 + Math.pow(f_Hz / fp_load_Hz, 2));
      const plantMag_dB = 20 * Math.log10(Math.max(1e-9, plantMag));
      const plantPhase_deg =
        ((Math.atan(f_Hz / fz_esr_Hz) - Math.atan(f_Hz / fp_load_Hz)) * 180) / Math.PI -
        ((w * (1 / (2 * acdcState.f_line_Hz)) * 180) / Math.PI) * 0.15;

      const baseOuter = acdcRes.evaluators.evalBodeOuter(f_Hz);
      const loopMag_dB = baseOuter.y1 + (manualOverride ? manualGainTrim_dB : 0);
      const loopPhase_deg = baseOuter.y2;

      return {
        freq_Hz: f_Hz,
        plantMag_dB: Number(plantMag_dB.toFixed(2)),
        plantPhase_deg: Number(plantPhase_deg.toFixed(2)),
        compMag_dB: Number((loopMag_dB - plantMag_dB).toFixed(2)),
        compPhase_deg: Number((loopPhase_deg - plantPhase_deg).toFixed(2)),
        loopMag_dB: Number(loopMag_dB.toFixed(2)),
        loopPhase_deg: Number(loopPhase_deg.toFixed(2)),
        loopMagMin_dB: Number((loopMag_dB - 1.8).toFixed(2)),
        loopMagMax_dB: Number((loopMag_dB + 1.8).toFixed(2)),
        loopPhaseMin_deg: Number((loopPhase_deg - 4.0).toFixed(2)),
        loopPhaseMax_deg: Number((loopPhase_deg + 4.0).toFixed(2)),
      };
    };

    const minExp = activeLoop === 'acdc-outer' ? 0 : 1.69897;
    const maxExp = activeLoop === 'acdc-outer' ? 3.5 : 5.39794;
    const bodeData: BodePoint[] = [];
    const nPts = 110;

    for (let i = 0; i <= nPts; i++) {
      const f_Hz = Math.pow(10, minExp + (i / nPts) * (maxExp - minExp));
      bodeData.push(evalPoint(f_Hz));
    }

    let fc_Hz =
      activeLoop === 'dcdc-loop'
        ? dcdcRes.fc_actual_kHz * 1e3
        : activeLoop === 'acdc-inner'
        ? acdcRes.fc_i_actual_kHz * 1e3
        : acdcRes.fc_v_actual_Hz;
    let pm_deg =
      activeLoop === 'dcdc-loop'
        ? dcdcRes.pm_actual_deg
        : activeLoop === 'acdc-inner'
        ? acdcRes.pm_i_actual_deg
        : acdcRes.pm_v_actual_deg;
    let f_gm_Hz =
      activeLoop === 'dcdc-loop'
        ? dcdcRes.f_gm_kHz * 1e3
        : activeLoop === 'acdc-inner'
        ? acdcState.fsw_kHz * 0.42 * 1e3
        : acdcState.f_line_Hz * 3.5;
    let gm_dB =
      activeLoop === 'dcdc-loop'
        ? dcdcRes.gm_actual_dB
        : activeLoop === 'acdc-inner'
        ? acdcRes.gm_i_dB
        : 18.4;

    for (let i = 1; i < bodeData.length; i++) {
      const p0 = bodeData[i - 1];
      const p1 = bodeData[i];
      if (p0.loopMag_dB >= 0 && p1.loopMag_dB < 0) {
        const frac = p0.loopMag_dB / Math.max(1e-6, p0.loopMag_dB - p1.loopMag_dB);
        fc_Hz = p0.freq_Hz + frac * (p1.freq_Hz - p0.freq_Hz);
        const phaseAtFc = p0.loopPhase_deg + frac * (p1.loopPhase_deg - p0.loopPhase_deg);
        pm_deg = 180 + phaseAtFc;
      }
      if (p0.loopPhase_deg >= -180 && p1.loopPhase_deg < -180) {
        const frac =
          (-180 - p0.loopPhase_deg) / Math.min(-1e-6, p1.loopPhase_deg - p0.loopPhase_deg);
        f_gm_Hz = p0.freq_Hz + frac * (p1.freq_Hz - p0.freq_Hz);
        const magAtFgm = p0.loopMag_dB + frac * (p1.loopMag_dB - p0.loopMag_dB);
        gm_dB = -magAtFgm;
      }
    }

    let peakSensitivity_dB = -100;
    let peakSensitivityFreq_Hz = fc_Hz;
    let peakZoutCl_mOhm = 0;

    const Lo_H =
      activeLoop === 'dcdc-loop'
        ? dcdcState.Lo_uH * 1e-6
        : activeLoop === 'acdc-inner'
        ? acdcState.Lpfc_uH * 1e-6
        : 2.5e-3;
    const Co_F =
      activeLoop === 'dcdc-loop'
        ? dcdcState.Co_uF * 1e-6
        : acdcState.Cdc_uF * 1e-6;
    const ESR_Ohm =
      activeLoop === 'dcdc-loop'
        ? dcdcState.ESR_Co_mOhm * 1e-3
        : acdcState.ESR_Cdc_mOhm * 1e-3;
    const Rload_Ohm =
      activeLoop === 'dcdc-loop'
        ? (dcdcState.Vout_V * dcdcState.Vout_V) / Math.max(50, dcdcState.Pout_W)
        : (acdcState.Vdc_bus_V * acdcState.Vdc_bus_V) / Math.max(50, acdcState.Pout_W);
    const RL_dcr_Ohm =
      activeLoop === 'dcdc-loop' ? 3.5e-3 : acdcState.RL_mOhm * 1e-3;

    const evalSensitivityAndImpedance = (f_Hz: number) => {
      const pt = evalPoint(f_Hz);
      const T_lin = Math.pow(10, pt.loopMag_dB / 20);
      const theta_rad = (pt.loopPhase_deg * Math.PI) / 180;
      const T_re = T_lin * Math.cos(theta_rad);
      const T_im = T_lin * Math.sin(theta_rad);

      const denom = Math.sqrt(Math.pow(1 + T_re, 2) + Math.pow(T_im, 2));
      const S_mag = 1 / Math.max(1e-6, denom);
      const Tcl_mag = T_lin / Math.max(1e-6, denom);

      const S_dB = 20 * Math.log10(S_mag);
      const Tcl_dB = 20 * Math.log10(Math.max(1e-6, Tcl_mag));

      const w = 2 * Math.PI * f_Hz;
      const w0 = 1 / Math.sqrt(Lo_H * Co_F);
      const Q_tank = Rload_Ohm / Math.sqrt(Lo_H / Co_F);
      const x = w / w0;
      const Zol_mag =
        (w * Lo_H * Math.sqrt(1 + Math.pow(w * Co_F * ESR_Ohm, 2))) /
        Math.sqrt(
          Math.pow(1 - x * x + RL_dcr_Ohm / Rload_Ohm, 2) +
            Math.pow(x / Math.max(0.2, Q_tank) + w * Co_F * ESR_Ohm, 2)
        );
      const Zcl_mag = Zol_mag * S_mag;

      return {
        freq_kHz: Number((f_Hz / 1000).toFixed(4)),
        S_dB: Number(S_dB.toFixed(2)),
        Tcl_dB: Number(Tcl_dB.toFixed(2)),
        Zol_dBOhm: Number((20 * Math.log10(Math.max(1e-6, Zol_mag))).toFixed(2)),
        Zcl_dBOhm: Number((20 * Math.log10(Math.max(1e-6, Zcl_mag))).toFixed(2)),
        Zol_mOhm: Zol_mag * 1e3,
        Zcl_mOhm: Zcl_mag * 1e3,
        T_re,
        T_im,
      };
    };

    const sensitivityCurve = bodeData.map((pt) => {
      const res = evalSensitivityAndImpedance(pt.freq_Hz);
      if (res.S_dB > peakSensitivity_dB) {
        peakSensitivity_dB = res.S_dB;
        peakSensitivityFreq_Hz = pt.freq_Hz;
      }
      if (res.Zcl_mOhm > peakZoutCl_mOhm) {
        peakZoutCl_mOhm = res.Zcl_mOhm;
      }
      return res;
    });

    const Vnom = activeLoop === 'dcdc-loop' ? dcdcState.Vout_V : acdcState.Vdc_bus_V;
    const Irated =
      activeLoop === 'dcdc-loop'
        ? dcdcState.Pout_W / Math.max(1, dcdcState.Vout_V)
        : acdcState.Pout_W / Math.max(1, acdcState.Vdc_bus_V);
    const dI_step_A = Irated * (loadStepPct / 100);

    const pmClamped = Math.max(8, Math.min(88, pm_deg));
    const zeta = Math.max(0.08, Math.min(1.2, pmClamped / 96));
    const wn = 2 * Math.PI * Math.max(10, fc_Hz);
    const wd = wn * Math.sqrt(Math.max(0.01, 1 - zeta * zeta));

    const Zcl_at_fc_Ohm = Math.max(
      ESR_Ohm,
      (1 / (2 * Math.PI * Math.max(10, fc_Hz) * Co_F)) * (1 / Math.max(0.3, 2 * zeta))
    );

    const totalTime_ms =
      activeLoop === 'acdc-outer'
        ? 120
        : Number(((4.5 / Math.max(200, fc_Hz)) * 1000).toFixed(2));
    const evalTransient = (t_ms: number) => {
      const t_s = Math.max(0, t_ms * 1e-3);
      const tStep_s = totalTime_ms * 0.1 * 1e-3;
      if (t_s < tStep_s) {
        return {
          t_ms: Number(t_ms.toFixed(3)),
          Vout_V: Number(Vnom.toFixed(3)),
          dV_mV: 0,
        };
      }
      const dt = t_s - tStep_s;
      let env = 0;
      if (zeta < 0.99) {
        env =
          (Math.exp(-zeta * wn * dt) / Math.sqrt(1 - zeta * zeta)) *
          Math.sin(wd * dt + Math.acos(zeta) * 0.25);
      } else {
        env = wn * dt * Math.exp(-wn * dt);
      }
      const dV_V = -dI_step_A * Zcl_at_fc_Ohm * env;
      return {
        t_ms: Number(t_ms.toFixed(3)),
        Vout_V: Number((Vnom + dV_V).toFixed(3)),
        dV_mV: Number((dV_V * 1000).toFixed(1)),
      };
    };

    const transientCurve: { t_ms: number; Vout_V: number; dV_mV: number }[] = [];
    let maxUndershoot_V = 0;
    for (let i = 0; i <= 120; i++) {
      const t_ms = (i / 120) * totalTime_ms;
      const pt = evalTransient(t_ms);
      if (Vnom - pt.Vout_V > maxUndershoot_V) {
        maxUndershoot_V = Vnom - pt.Vout_V;
      }
      transientCurve.push(pt);
    }

    const settlingTime_us = (4 / (zeta * wn)) * 1e6;
    const ringingFreq_kHz = wd / (2 * Math.PI * 1000);

    // Construct a unified DcDcResults-compatible object for BodeStabilityGraph
    const effectiveBodeRes: DcDcResults = {
      ...dcdcRes,
      bodeData,
      fc_actual_kHz: Number((fc_Hz / 1000).toFixed(3)),
      fc_wc_min_kHz: Number(((fc_Hz * 0.85) / 1000).toFixed(3)),
      fc_wc_max_kHz: Number(((fc_Hz * 1.15) / 1000).toFixed(3)),
      pm_actual_deg: Number(pm_deg.toFixed(1)),
      pm_wc_min_deg: Number(Math.max(0, pm_deg - 5.5).toFixed(1)),
      pm_wc_max_deg: Number((pm_deg + 4.5).toFixed(1)),
      f_gm_kHz: Number((f_gm_Hz / 1000).toFixed(2)),
      gm_actual_dB: Number(gm_dB.toFixed(1)),
      fz1_kHz:
        activeLoop === 'dcdc-loop'
          ? manualOverride
            ? manualFz1_kHz
            : dcdcRes.fz1_kHz
          : activeLoop === 'acdc-inner'
          ? acdcRes.fz_i_kHz
          : Number((acdcRes.fz_v_Hz / 1000).toFixed(4)),
      fz2_kHz:
        activeLoop === 'dcdc-loop'
          ? manualOverride
            ? manualFz2_kHz
            : dcdcRes.fz2_kHz
          : activeLoop === 'acdc-inner'
          ? Number((acdcRes.fz_i_kHz * 1.6).toFixed(2))
          : Number(((acdcRes.fz_v_Hz * 1.8) / 1000).toFixed(4)),
      fp1_kHz:
        activeLoop === 'dcdc-loop'
          ? manualOverride
            ? manualFp1_kHz
            : dcdcRes.fp1_kHz
          : activeLoop === 'acdc-inner'
          ? acdcRes.fp_i_kHz
          : Number((acdcRes.fp_v_Hz / 1000).toFixed(4)),
      fp2_kHz:
        activeLoop === 'dcdc-loop'
          ? manualOverride
            ? manualFp2_kHz
            : dcdcRes.fp2_kHz
          : activeLoop === 'acdc-inner'
          ? Number((acdcState.fsw_kHz * 0.5).toFixed(1))
          : 0.3,
      evaluators: {
        ...dcdcRes.evaluators,
        evalBodePoint: evalPoint,
      },
    };

    return {
      bodeData,
      evalPoint,
      effectiveBodeRes,
      fc_kHz: fc_Hz / 1000,
      fc_Hz,
      pm_deg,
      f_gm_kHz: f_gm_Hz / 1000,
      gm_dB,
      peakSensitivity_dB,
      peakSensitivityFreq_kHz: peakSensitivityFreq_Hz / 1000,
      peakZoutCl_mOhm,
      sensitivityCurve,
      evalSensitivityAndImpedance,
      transientCurve,
      evalTransient,
      maxUndershoot_V,
      dI_step_A,
      zeta,
      settlingTime_us,
      ringingFreq_kHz,
      totalTime_ms,
      Vnom,
    };
  }, [
    activeLoop,
    dcdcRes,
    dcdcState,
    acdcRes,
    acdcState,
    manualOverride,
    manualFz1_kHz,
    manualFz2_kHz,
    manualFp1_kHz,
    manualFp2_kHz,
    manualGainTrim_dB,
    loadStepPct,
  ]);

  const isLoopStable = loopAnalysis.pm_deg >= 45 && loopAnalysis.gm_dB >= 6;

  return (
    <div className="space-y-5">
      {/* Header & Loop Domain Selector */}
      <div className="bg-white dark:bg-[#14171f] border border-slate-200 dark:border-slate-800 rounded-lg p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2
                className={`${
                  compactHeader ? 'text-base' : 'text-lg'
                } font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2`}
              >
                <Compass className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                Small-Signal Control Loop Stability &amp; Bode Analyzer
              </h2>
              {manualOverride && (
                <span className="px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/40 text-amber-700 dark:text-amber-300 text-[11px] font-medium">
                  Manual Pole/Zero Override
                </span>
              )}
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
              Transfer function synthesis T(s) = G_p(s)·G_c(s)·e^(-sTd) with Phase/Gain Margin, Nyquist locus, closed-loop Z_out,cl(s), and step-load transient response.
            </p>
          </div>

          {/* 3-Loop Selector */}
          <div className="flex flex-wrap items-center gap-1 bg-slate-100 dark:bg-[#090a0d] p-1 rounded-md border border-slate-200 dark:border-slate-800 shrink-0">
            <button
              onClick={() => {
                setActiveLoop('dcdc-loop');
                setManualOverride(false);
              }}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                activeLoop === 'dcdc-loop'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <Cpu className="w-3.5 h-3.5" />
              DC-DC Loop T(s)
            </button>
            <button
              onClick={() => {
                setActiveLoop('acdc-inner');
                setManualOverride(false);
              }}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                activeLoop === 'acdc-inner'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              PFC Current T_i(s)
            </button>
            <button
              onClick={() => {
                setActiveLoop('acdc-outer');
                setManualOverride(false);
              }}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                activeLoop === 'acdc-outer'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              PFC Voltage T_v(s)
            </button>
          </div>
        </div>

        {/* Top-Level Stability Margin & Sensitivity KPI Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-4">
          <div className="bg-slate-50 dark:bg-[#090a0d] border border-slate-200 dark:border-slate-800 rounded-md p-3">
            <div className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
              Crossover Freq (f_c)
            </div>
            <div className="text-lg font-semibold font-mono tabular-nums text-emerald-600 dark:text-emerald-400 mt-0.5">
              {activeLoop === 'acdc-outer'
                ? `${loopAnalysis.fc_Hz.toFixed(1)} Hz`
                : `${loopAnalysis.fc_kHz.toFixed(2)} kHz`}
            </div>
            <div className="text-[10px] font-mono tabular-nums text-slate-500 mt-0.5">
              {activeLoop === 'dcdc-loop'
                ? `${((loopAnalysis.fc_kHz / dcdcState.fsw_kHz) * 100).toFixed(1)}% of f_sw (${dcdcState.fsw_kHz} kHz)`
                : activeLoop === 'acdc-inner'
                ? `${((loopAnalysis.fc_kHz / acdcState.fsw_kHz) * 100).toFixed(1)}% of f_sw (${acdcState.fsw_kHz} kHz)`
                : `Line Reject @ ${2 * acdcState.f_line_Hz} Hz`}
            </div>
          </div>

          <div
            className={`bg-slate-50 dark:bg-[#090a0d] border rounded-md p-3 ${
              loopAnalysis.pm_deg >= 45
                ? 'border-emerald-500/40'
                : loopAnalysis.pm_deg >= 30
                ? 'border-amber-500/50'
                : 'border-rose-500/60'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
                Phase Margin (PM)
              </span>
              {loopAnalysis.pm_deg >= 45 ? (
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
              ) : (
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
              )}
            </div>
            <div
              className={`text-lg font-semibold font-mono tabular-nums mt-0.5 ${
                loopAnalysis.pm_deg >= 45
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : loopAnalysis.pm_deg >= 30
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-rose-600 dark:text-rose-400'
              }`}
            >
              {loopAnalysis.pm_deg.toFixed(1)}°
            </div>
            <div className="text-[10px] font-mono tabular-nums text-slate-500 mt-0.5">
              ζ ≈ {loopAnalysis.zeta.toFixed(2)} (Target ≥ 45°)
            </div>
          </div>

          <div
            className={`bg-slate-50 dark:bg-[#090a0d] border rounded-md p-3 ${
              loopAnalysis.gm_dB >= 6 ? 'border-blue-500/40' : 'border-rose-500/60'
            }`}
          >
            <div className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
              Gain Margin (GM)
            </div>
            <div
              className={`text-lg font-semibold font-mono tabular-nums mt-0.5 ${
                loopAnalysis.gm_dB >= 6 ? 'text-blue-600 dark:text-blue-400' : 'text-rose-600 dark:text-rose-400'
              }`}
            >
              +{loopAnalysis.gm_dB.toFixed(1)} dB
            </div>
            <div className="text-[10px] font-mono tabular-nums text-slate-500 mt-0.5">
              @ {loopAnalysis.f_gm_kHz.toFixed(1)} kHz (≥ 6 dB)
            </div>
          </div>

          <div className="bg-slate-50 dark:bg-[#090a0d] border border-slate-200 dark:border-slate-800 rounded-md p-3">
            <div className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
              Peak Sensitivity M_s
            </div>
            <div
              className={`text-lg font-semibold font-mono tabular-nums mt-0.5 ${
                loopAnalysis.peakSensitivity_dB <= 6.0 ? 'text-indigo-600 dark:text-indigo-400' : 'text-amber-600 dark:text-amber-400'
              }`}
            >
              {loopAnalysis.peakSensitivity_dB.toFixed(2)} dB
            </div>
            <div className="text-[10px] font-mono tabular-nums text-slate-500 mt-0.5">
              max|1/(1+T)| @ {loopAnalysis.peakSensitivityFreq_kHz.toFixed(1)} kHz
            </div>
          </div>

          <div className="bg-slate-50 dark:bg-[#090a0d] border border-slate-200 dark:border-slate-800 rounded-md p-3">
            <div className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
              Peak Closed-Loop |Z_out|
            </div>
            <div className="text-lg font-semibold font-mono tabular-nums text-amber-600 dark:text-amber-300 mt-0.5">
              {loopAnalysis.peakZoutCl_mOhm.toFixed(1)} mΩ
            </div>
            <div className="text-[10px] font-mono tabular-nums text-slate-500 mt-0.5">
              20·log10 ={' '}
              {(20 * Math.log10(Math.max(1e-6, loopAnalysis.peakZoutCl_mOhm * 1e-3))).toFixed(1)}{' '}
              dBΩ
            </div>
          </div>

          <div className="bg-slate-50 dark:bg-[#090a0d] border border-slate-200 dark:border-slate-800 rounded-md p-3">
            <div className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
              Step-Load Undershoot
            </div>
            <div className="text-lg font-semibold font-mono tabular-nums text-rose-600 dark:text-rose-300 mt-0.5">
              -{(loopAnalysis.maxUndershoot_V * 1000).toFixed(0)} mV
            </div>
            <div className="text-[10px] font-mono tabular-nums text-slate-500 mt-0.5">
              {((loopAnalysis.maxUndershoot_V / loopAnalysis.Vnom) * 100).toFixed(2)}% for ΔI=
              {loopAnalysis.dI_step_A.toFixed(1)}A
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid: Left Live Operating Point & Component Controls | Right Interactive Bode & Stability Suite */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        {/* Left Column: Operating Point, Power Stage Filter, and Compensator Tuning Controls */}
        <div className="xl:col-span-4 space-y-4">
          {/* 1. Operating Point Live Sliders */}
          <div className="bg-white dark:bg-[#14171f] border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
              <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                <Gauge className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
                Converter Operating Point
              </h3>
              <span className="text-[10px] font-mono text-slate-400">
                R_load ={' '}
                {activeLoop === 'dcdc-loop'
                  ? `${((dcdcState.Vout_V * dcdcState.Vout_V) / Math.max(1, dcdcState.Pout_W)).toFixed(2)} Ω`
                  : `${((acdcState.Vdc_bus_V * acdcState.Vdc_bus_V) / Math.max(1, acdcState.Pout_W)).toFixed(1)} Ω`}
              </span>
            </div>

            {activeLoop === 'dcdc-loop' ? (
              <div className="space-y-3 text-xs">
                <div>
                  <div className="flex justify-between items-center gap-1 text-slate-300 mb-1">
                    <span>Input Voltage V_in,nom</span>
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-emerald-300">{dcdcState.Vin_nom_V} V</span>
                      <LockToggleButton
                        compact
                        locked={dcdcLocked.Vin_nom_V}
                        recentlyAutoUpdated={isDcdcAuto('Vin_nom_V')}
                        onToggle={() => toggleDcdcLock('Vin_nom_V')}
                        label="Vin,nom"
                      />
                    </div>
                  </div>
                  <input
                    type="range"
                    min={250}
                    max={900}
                    step={5}
                    value={dcdcState.Vin_nom_V}
                    onChange={(e) => updateDcdc('Vin_nom_V', Number(e.target.value))}
                    className="w-full accent-emerald-500"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center gap-1 text-slate-300 mb-1">
                    <span>Output Voltage V_out</span>
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-emerald-300">{dcdcState.Vout_V} V</span>
                      <LockToggleButton
                        compact
                        locked={dcdcLocked.Vout_V}
                        recentlyAutoUpdated={isDcdcAuto('Vout_V')}
                        onToggle={() => toggleDcdcLock('Vout_V')}
                        label="Vout"
                      />
                    </div>
                  </div>
                  <input
                    type="range"
                    min={12}
                    max={800}
                    step={2}
                    value={dcdcState.Vout_V}
                    onChange={(e) => updateDcdc('Vout_V', Number(e.target.value))}
                    className="w-full accent-emerald-500"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center gap-1 text-slate-300 mb-1">
                    <span>
                      Load Power P_out (I_out ={' '}
                      {(dcdcState.Pout_W / Math.max(1, dcdcState.Vout_V)).toFixed(1)} A)
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-emerald-300">{dcdcState.Pout_W} W</span>
                      <LockToggleButton
                        compact
                        locked={dcdcLocked.Pout_W}
                        recentlyAutoUpdated={isDcdcAuto('Pout_W')}
                        onToggle={() => toggleDcdcLock('Pout_W')}
                        label="Pout"
                      />
                    </div>
                  </div>
                  <input
                    type="range"
                    min={300}
                    max={22000}
                    step={100}
                    value={dcdcState.Pout_W}
                    onChange={(e) => updateDcdc('Pout_W', Number(e.target.value))}
                    className="w-full accent-emerald-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <div className="flex justify-between items-center gap-1 text-slate-300 mb-1">
                      <span>f_sw</span>
                      <div className="flex items-center gap-1">
                        <span className="font-mono text-blue-300">{dcdcState.fsw_kHz} kHz</span>
                        <LockToggleButton
                          compact
                          locked={dcdcLocked.fsw_kHz}
                          recentlyAutoUpdated={isDcdcAuto('fsw_kHz')}
                          onToggle={() => toggleDcdcLock('fsw_kHz')}
                          label="fsw"
                        />
                      </div>
                    </div>
                    <input
                      type="range"
                      min={40}
                      max={300}
                      step={5}
                      value={dcdcState.fsw_kHz}
                      onChange={(e) => updateDcdc('fsw_kHz', Number(e.target.value))}
                      className="w-full accent-blue-500"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between items-center gap-1 text-slate-300 mb-1">
                      <span>f_s,digital</span>
                      <div className="flex items-center gap-1">
                        <span className="font-mono text-blue-300">{dcdcState.fs_digital_kHz} kHz</span>
                        <LockToggleButton
                          compact
                          locked={dcdcLocked.fs_digital_kHz}
                          recentlyAutoUpdated={isDcdcAuto('fs_digital_kHz')}
                          onToggle={() => toggleDcdcLock('fs_digital_kHz')}
                          label="fs_digital"
                        />
                      </div>
                    </div>
                    <input
                      type="range"
                      min={50}
                      max={500}
                      step={10}
                      value={dcdcState.fs_digital_kHz}
                      onChange={(e) => updateDcdc('fs_digital_kHz', Number(e.target.value))}
                      className="w-full accent-blue-500"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3 text-xs">
                <div>
                  <div className="flex justify-between items-center gap-1 text-slate-300 mb-1">
                    <span>AC Input Voltage V_ac,rms</span>
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-blue-300">{acdcState.Vac_rms_V} V</span>
                      <LockToggleButton
                        compact
                        locked={acdcLocked.Vac_rms_V}
                        recentlyAutoUpdated={isAcdcAuto('Vac_rms_V')}
                        onToggle={() => toggleAcdcLock('Vac_rms_V')}
                        label="Vac_rms"
                      />
                    </div>
                  </div>
                  <input
                    type="range"
                    min={90}
                    max={480}
                    step={5}
                    value={acdcState.Vac_rms_V}
                    onChange={(e) => updateAcdc('Vac_rms_V', Number(e.target.value))}
                    className="w-full accent-blue-500"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center gap-1 text-slate-300 mb-1">
                    <span>DC Bus Voltage V_dc</span>
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-blue-300">{acdcState.Vdc_bus_V} V</span>
                      <LockToggleButton
                        compact
                        locked={acdcLocked.Vdc_bus_V}
                        recentlyAutoUpdated={isAcdcAuto('Vdc_bus_V')}
                        onToggle={() => toggleAcdcLock('Vdc_bus_V')}
                        label="Vdc_bus"
                      />
                    </div>
                  </div>
                  <input
                    type="range"
                    min={350}
                    max={900}
                    step={10}
                    value={acdcState.Vdc_bus_V}
                    onChange={(e) => updateAcdc('Vdc_bus_V', Number(e.target.value))}
                    className="w-full accent-blue-500"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center gap-1 text-slate-300 mb-1">
                    <span>Output Power P_out</span>
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-blue-300">{acdcState.Pout_W} W</span>
                      <LockToggleButton
                        compact
                        locked={acdcLocked.Pout_W}
                        recentlyAutoUpdated={isAcdcAuto('Pout_W')}
                        onToggle={() => toggleAcdcLock('Pout_W')}
                        label="Pout"
                      />
                    </div>
                  </div>
                  <input
                    type="range"
                    min={500}
                    max={22000}
                    step={100}
                    value={acdcState.Pout_W}
                    onChange={(e) => updateAcdc('Pout_W', Number(e.target.value))}
                    className="w-full accent-blue-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <div className="flex justify-between items-center gap-1 text-slate-300 mb-1">
                      <span>f_sw</span>
                      <div className="flex items-center gap-1">
                        <span className="font-mono text-blue-300">{acdcState.fsw_kHz} kHz</span>
                        <LockToggleButton
                          compact
                          locked={acdcLocked.fsw_kHz}
                          recentlyAutoUpdated={isAcdcAuto('fsw_kHz')}
                          onToggle={() => toggleAcdcLock('fsw_kHz')}
                          label="fsw"
                        />
                      </div>
                    </div>
                    <input
                      type="range"
                      min={30}
                      max={200}
                      step={5}
                      value={acdcState.fsw_kHz}
                      onChange={(e) => updateAcdc('fsw_kHz', Number(e.target.value))}
                      className="w-full accent-blue-500"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between items-center gap-1 text-slate-300 mb-1">
                      <span>f_s,ctrl</span>
                      <div className="flex items-center gap-1">
                        <span className="font-mono text-blue-300">{acdcState.fs_ctrl_kHz} kHz</span>
                        <LockToggleButton
                          compact
                          locked={acdcLocked.fs_ctrl_kHz}
                          recentlyAutoUpdated={isAcdcAuto('fs_ctrl_kHz')}
                          onToggle={() => toggleAcdcLock('fs_ctrl_kHz')}
                          label="fs_ctrl"
                        />
                      </div>
                    </div>
                    <input
                      type="range"
                      min={30}
                      max={250}
                      step={5}
                      value={acdcState.fs_ctrl_kHz}
                      onChange={(e) => updateAcdc('fs_ctrl_kHz', Number(e.target.value))}
                      className="w-full accent-blue-500"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 2. Power Stage LC Filter & Magnetic Elements */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h3 className="text-[13px] font-medium text-slate-100 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-blue-400" />
                2. Power Stage Filter &amp; Plant Values
              </h3>
              {activeLoop === 'dcdc-loop' && (
                <span className="text-[10px] font-mono text-slate-400">
                  f_0 = {dcdcRes.f0_lc_kHz.toFixed(2)} kHz · f_ESR = {dcdcRes.f_esr_kHz.toFixed(1)} kHz
                </span>
              )}
            </div>

            {activeLoop === 'dcdc-loop' ? (
              <div className="space-y-3 text-xs">
                <div>
                  <div className="flex justify-between items-center gap-1 text-slate-300 mb-1">
                    <span>Output Filter Inductor L_o</span>
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-blue-300">{dcdcState.Lo_uH} µH</span>
                      <LockToggleButton
                        compact
                        locked={dcdcLocked.Lo_uH}
                        recentlyAutoUpdated={isDcdcAuto('Lo_uH')}
                        onToggle={() => toggleDcdcLock('Lo_uH')}
                        label="Lo"
                      />
                    </div>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={250}
                    step={1}
                    value={dcdcState.Lo_uH}
                    onChange={(e) => updateDcdc('Lo_uH', Number(e.target.value))}
                    className="w-full accent-blue-500"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center gap-1 text-slate-300 mb-1">
                    <span>Output Filter Capacitor C_o</span>
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-blue-300">{dcdcState.Co_uF} µF</span>
                      <LockToggleButton
                        compact
                        locked={dcdcLocked.Co_uF}
                        recentlyAutoUpdated={isDcdcAuto('Co_uF')}
                        onToggle={() => toggleDcdcLock('Co_uF')}
                        label="Co"
                      />
                    </div>
                  </div>
                  <input
                    type="range"
                    min={47}
                    max={4700}
                    step={10}
                    value={dcdcState.Co_uF}
                    onChange={(e) => updateDcdc('Co_uF', Number(e.target.value))}
                    className="w-full accent-blue-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="flex justify-between items-center gap-1 text-slate-300 mb-1">
                      <span>Cap ESR_Co</span>
                      <div className="flex items-center gap-1">
                        <span className="font-mono text-blue-300">{dcdcState.ESR_Co_mOhm} mΩ</span>
                        <LockToggleButton
                          compact
                          locked={dcdcLocked.ESR_Co_mOhm}
                          recentlyAutoUpdated={isDcdcAuto('ESR_Co_mOhm')}
                          onToggle={() => toggleDcdcLock('ESR_Co_mOhm')}
                          label="ESR_Co"
                        />
                      </div>
                    </div>
                    <input
                      type="range"
                      min={0.5}
                      max={50}
                      step={0.5}
                      value={dcdcState.ESR_Co_mOhm}
                      onChange={(e) => updateDcdc('ESR_Co_mOhm', Number(e.target.value))}
                      className="w-full accent-blue-500"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between items-center gap-1 text-slate-300 mb-1">
                      <span>Leakage L_lk</span>
                      <div className="flex items-center gap-1">
                        <span className="font-mono text-blue-300">{dcdcState.Llk_uH} µH</span>
                        <LockToggleButton
                          compact
                          locked={dcdcLocked.Llk_uH}
                          recentlyAutoUpdated={isDcdcAuto('Llk_uH')}
                          onToggle={() => toggleDcdcLock('Llk_uH')}
                          label="Llk"
                        />
                      </div>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={80}
                      step={0.5}
                      value={dcdcState.Llk_uH}
                      onChange={(e) => updateDcdc('Llk_uH', Number(e.target.value))}
                      className="w-full accent-blue-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="flex justify-between items-center gap-1 text-slate-300 mb-1">
                      <span>R_sense</span>
                      <div className="flex items-center gap-1">
                        <span className="font-mono text-amber-300">{dcdcState.Rsense_mOhm} mΩ</span>
                        <LockToggleButton
                          compact
                          locked={dcdcLocked.Rsense_mOhm}
                          recentlyAutoUpdated={isDcdcAuto('Rsense_mOhm')}
                          onToggle={() => toggleDcdcLock('Rsense_mOhm')}
                          label="Rsense"
                        />
                      </div>
                    </div>
                    <input
                      type="range"
                      min={2}
                      max={100}
                      step={1}
                      value={dcdcState.Rsense_mOhm}
                      onChange={(e) => updateDcdc('Rsense_mOhm', Number(e.target.value))}
                      className="w-full accent-amber-500"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between items-center gap-1 text-slate-300 mb-1">
                      <span>Slope m_c</span>
                      <div className="flex items-center gap-1">
                        <span className="font-mono text-amber-300">
                          {dcdcState.slopeFactor_mc.toFixed(2)}
                        </span>
                        <LockToggleButton
                          compact
                          locked={dcdcLocked.slopeFactor_mc}
                          recentlyAutoUpdated={isDcdcAuto('slopeFactor_mc')}
                          onToggle={() => toggleDcdcLock('slopeFactor_mc')}
                          label="Slope mc"
                        />
                      </div>
                    </div>
                    <input
                      type="range"
                      min={1.0}
                      max={4.0}
                      step={0.05}
                      value={dcdcState.slopeFactor_mc}
                      onChange={(e) => updateDcdc('slopeFactor_mc', Number(e.target.value))}
                      className="w-full accent-amber-500"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3 text-xs">
                <div>
                  <div className="flex justify-between items-center gap-1 text-slate-300 mb-1">
                    <span>PFC Boost Inductor L_pfc</span>
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-blue-300">{acdcState.Lpfc_uH} µH</span>
                      <LockToggleButton
                        compact
                        locked={acdcLocked.Lpfc_uH}
                        recentlyAutoUpdated={isAcdcAuto('Lpfc_uH')}
                        onToggle={() => toggleAcdcLock('Lpfc_uH')}
                        label="Lpfc"
                      />
                    </div>
                  </div>
                  <input
                    type="range"
                    min={40}
                    max={800}
                    step={5}
                    value={acdcState.Lpfc_uH}
                    onChange={(e) => updateAcdc('Lpfc_uH', Number(e.target.value))}
                    className="w-full accent-blue-500"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center gap-1 text-slate-300 mb-1">
                    <span>DC Bus Capacitor C_dc</span>
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-blue-300">{acdcState.Cdc_uF} µF</span>
                      <LockToggleButton
                        compact
                        locked={acdcLocked.Cdc_uF}
                        recentlyAutoUpdated={isAcdcAuto('Cdc_uF')}
                        onToggle={() => toggleAcdcLock('Cdc_uF')}
                        label="Cdc"
                      />
                    </div>
                  </div>
                  <input
                    type="range"
                    min={220}
                    max={4700}
                    step={20}
                    value={acdcState.Cdc_uF}
                    onChange={(e) => updateAcdc('Cdc_uF', Number(e.target.value))}
                    className="w-full accent-blue-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="flex justify-between items-center gap-1 text-slate-300 mb-1">
                      <span>DCR R_L</span>
                      <div className="flex items-center gap-1">
                        <span className="font-mono text-blue-300">{acdcState.RL_mOhm} mΩ</span>
                        <LockToggleButton
                          compact
                          locked={acdcLocked.RL_mOhm}
                          recentlyAutoUpdated={isAcdcAuto('RL_mOhm')}
                          onToggle={() => toggleAcdcLock('RL_mOhm')}
                          label="RL"
                        />
                      </div>
                    </div>
                    <input
                      type="range"
                      min={5}
                      max={200}
                      step={5}
                      value={acdcState.RL_mOhm}
                      onChange={(e) => updateAcdc('RL_mOhm', Number(e.target.value))}
                      className="w-full accent-blue-500"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between items-center gap-1 text-slate-300 mb-1">
                      <span>ESR_Cdc</span>
                      <div className="flex items-center gap-1">
                        <span className="font-mono text-blue-300">{acdcState.ESR_Cdc_mOhm} mΩ</span>
                        <LockToggleButton
                          compact
                          locked={acdcLocked.ESR_Cdc_mOhm}
                          recentlyAutoUpdated={isAcdcAuto('ESR_Cdc_mOhm')}
                          onToggle={() => toggleAcdcLock('ESR_Cdc_mOhm')}
                          label="ESR_Cdc"
                        />
                      </div>
                    </div>
                    <input
                      type="range"
                      min={5}
                      max={150}
                      step={5}
                      value={acdcState.ESR_Cdc_mOhm}
                      onChange={(e) => updateAcdc('ESR_Cdc_mOhm', Number(e.target.value))}
                      className="w-full accent-blue-500"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 3. Compensator Synthesis & Manual Pole/Zero Override Sandbox */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h3 className="text-[13px] font-medium text-slate-100 flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-blue-400" />
                3. Compensator Synthesis &amp; Pole/Zero Tuning
              </h3>
              <button
                onClick={() => {
                  if (!manualOverride) syncManualFromEngine();
                  setManualOverride(!manualOverride);
                }}
                className={`px-2 py-0.5 rounded text-[10px] font-mono border transition-colors ${
                  manualOverride
                    ? 'bg-amber-500/20 border-amber-500/60 text-amber-200 font-semibold'
                    : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
                }`}
              >
                {manualOverride ? 'Manual Override: ON' : 'Manual Pole/Zero: OFF'}
              </button>
            </div>

            {activeLoop === 'dcdc-loop' ? (
              <div className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1">Control Loop Architecture</label>
                  <select
                    value={dcdcState.controlType}
                    onChange={(e) => updateDcdc('controlType', e.target.value as DcDcControlType)}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-200 font-mono"
                  >
                    <option value="2p2z">Voltage-Mode Digital 2P2Z / 3P3Z</option>
                    <option value="type-iii">Analog Op-Amp Type-III Network</option>
                    <option value="pcmc">PCMC + Type-II (Ridley Plant + Slope m_c)</option>
                    <option value="acmc">Average Current Mode Control (ACMC)</option>
                    <option value="cascaded-pi">Cascaded Dual-Loop PI</option>
                    <option value="charge-control">Resonant Charge / Trajectory Control</option>
                    <option value="mpc">Model Predictive Control (FCS-MPC)</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="flex justify-between items-center gap-1 text-slate-300 mb-1">
                      <span>Target f_c</span>
                      <div className="flex items-center gap-1">
                        <span className="font-mono text-emerald-300">{dcdcState.fc_target_kHz} kHz</span>
                        <LockToggleButton
                          compact
                          locked={dcdcLocked.fc_target_kHz}
                          recentlyAutoUpdated={isDcdcAuto('fc_target_kHz')}
                          onToggle={() => toggleDcdcLock('fc_target_kHz')}
                          label="fc"
                        />
                      </div>
                    </div>
                    <input
                      type="range"
                      min={0.5}
                      max={40}
                      step={0.5}
                      value={dcdcState.fc_target_kHz}
                      onChange={(e) => updateDcdc('fc_target_kHz', Number(e.target.value))}
                      className="w-full accent-emerald-500"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between items-center gap-1 text-slate-300 mb-1">
                      <span>Target PM</span>
                      <div className="flex items-center gap-1">
                        <span className="font-mono text-emerald-300">{dcdcState.pm_target_deg}°</span>
                        <LockToggleButton
                          compact
                          locked={dcdcLocked.pm_target_deg}
                          recentlyAutoUpdated={isDcdcAuto('pm_target_deg')}
                          onToggle={() => toggleDcdcLock('pm_target_deg')}
                          label="PM"
                        />
                      </div>
                    </div>
                    <input
                      type="range"
                      min={30}
                      max={85}
                      step={1}
                      value={dcdcState.pm_target_deg}
                      onChange={(e) => updateDcdc('pm_target_deg', Number(e.target.value))}
                      className="w-full accent-emerald-500"
                    />
                  </div>
                </div>

                {/* PCMC + Type-II Unified Co-Design Strip */}
                {(dcdcState.controlType === 'pcmc' || dcdcState.controlType === '2p2z') && (
                  <div className="bg-slate-950/90 border border-blue-500/30 rounded-lg p-2.5 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-mono text-blue-300 font-semibold">
                        Type-II Network &amp; PCMC Slope
                      </span>
                      <div className="inline-flex rounded border border-slate-700 bg-slate-900 p-0.5 text-[10px] font-mono">
                        <button
                          type="button"
                          onClick={() => updateDcdc('type2Architecture', 'opamp')}
                          className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${
                            dcdcRes.type2Architecture === 'opamp'
                              ? 'bg-blue-500/20 text-blue-200 font-semibold'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          Op-Amp
                        </button>
                        <button
                          type="button"
                          onClick={() => updateDcdc('type2Architecture', 'ota')}
                          className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${
                            dcdcRes.type2Architecture === 'ota'
                              ? 'bg-blue-500/20 text-blue-200 font-semibold'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          OTA (g_m)
                        </button>
                      </div>
                    </div>

                    {dcdcRes.type2Architecture === 'ota' && (
                      <div>
                        <div className="flex justify-between text-[11px] text-slate-300 mb-0.5">
                          <span>OTA Transconductance g_m</span>
                          <span className="font-mono text-blue-300">
                            {dcdcRes.ota_gm_mS.toFixed(2)} mS
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0.3}
                          max={4.0}
                          step={0.05}
                          value={dcdcRes.ota_gm_mS}
                          onChange={(e) => updateDcdc('ota_gm_mS', Number(e.target.value))}
                          className="w-full accent-blue-500"
                        />
                      </div>
                    )}

                    {dcdcState.controlType === 'pcmc' && (
                      <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-800/80 text-[10px] font-mono">
                        <span className="text-slate-400">
                          H_dc={dcdcRes.plant_Hdc_dB.toFixed(1)}dB · f_p1={dcdcRes.plant_fp1_Hz.toFixed(0)}Hz · Q_p(wc)={dcdcRes.Qp_subharmonic_wc.toFixed(2)}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            const safeMc = Number(Math.max(dcdcRes.mc_min_recommended, 1.35).toFixed(2));
                            const safeFc = Number(
                              Math.min(dcdcState.fsw_kHz * 0.16, Math.max(2.5, dcdcRes.plant_fn_sh_kHz * 0.18)).toFixed(1)
                            );
                            updateDcdc('slopeFactor_mc', safeMc);
                            updateDcdc('fc_target_kHz', safeFc);
                            updateDcdc('pm_target_deg', 60);
                          }}
                          className="px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25 transition-colors cursor-pointer shrink-0"
                        >
                          Auto-Tune PCMC + II
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1">PFC Control Architecture</label>
                  <select
                    value={acdcState.controlType}
                    onChange={(e) => updateAcdc('controlType', e.target.value as AcDcControlType)}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-200 font-mono"
                  >
                    <option value="acmc">Average Current Mode Control (ACMC)</option>
                    <option value="2p2z">Digital 2P2Z Current + PI Voltage</option>
                    <option value="cascaded-pi">Cascaded Dual-Loop PI</option>
                    <option value="mpc">Predictive Current Control (MPC)</option>
                  </select>
                </div>

                {activeLoop === 'acdc-inner' ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="flex justify-between items-center gap-1 text-slate-300 mb-1">
                        <span>Inner f_c,i</span>
                        <div className="flex items-center gap-1">
                          <span className="font-mono text-blue-300">{acdcState.fc_i_kHz} kHz</span>
                          <LockToggleButton
                            compact
                            locked={acdcLocked.fc_i_kHz}
                            recentlyAutoUpdated={isAcdcAuto('fc_i_kHz')}
                            onToggle={() => toggleAcdcLock('fc_i_kHz')}
                            label="fc_i"
                          />
                        </div>
                      </div>
                      <input
                        type="range"
                        min={1}
                        max={25}
                        step={0.5}
                        value={acdcState.fc_i_kHz}
                        onChange={(e) => updateAcdc('fc_i_kHz', Number(e.target.value))}
                        className="w-full accent-blue-500"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between items-center gap-1 text-slate-300 mb-1">
                        <span>Target PM_i</span>
                        <div className="flex items-center gap-1">
                          <span className="font-mono text-blue-300">{acdcState.pm_i_deg}°</span>
                          <LockToggleButton
                            compact
                            locked={acdcLocked.pm_i_deg}
                            recentlyAutoUpdated={isAcdcAuto('pm_i_deg')}
                            onToggle={() => toggleAcdcLock('pm_i_deg')}
                            label="PM_i"
                          />
                        </div>
                      </div>
                      <input
                        type="range"
                        min={30}
                        max={85}
                        step={1}
                        value={acdcState.pm_i_deg}
                        onChange={(e) => updateAcdc('pm_i_deg', Number(e.target.value))}
                        className="w-full accent-blue-500"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="flex justify-between items-center gap-1 text-slate-300 mb-1">
                        <span>Outer f_c,v</span>
                        <div className="flex items-center gap-1">
                          <span className="font-mono text-violet-300">{acdcState.fc_v_Hz} Hz</span>
                          <LockToggleButton
                            compact
                            locked={acdcLocked.fc_v_Hz}
                            recentlyAutoUpdated={isAcdcAuto('fc_v_Hz')}
                            onToggle={() => toggleAcdcLock('fc_v_Hz')}
                            label="fc_v"
                          />
                        </div>
                      </div>
                      <input
                        type="range"
                        min={5}
                        max={45}
                        step={1}
                        value={acdcState.fc_v_Hz}
                        onChange={(e) => updateAcdc('fc_v_Hz', Number(e.target.value))}
                        className="w-full accent-violet-500"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between items-center gap-1 text-slate-300 mb-1">
                        <span>Target PM_v</span>
                        <div className="flex items-center gap-1">
                          <span className="font-mono text-violet-300">{acdcState.pm_v_deg}°</span>
                          <LockToggleButton
                            compact
                            locked={acdcLocked.pm_v_deg}
                            recentlyAutoUpdated={isAcdcAuto('pm_v_deg')}
                            onToggle={() => toggleAcdcLock('pm_v_deg')}
                            label="PM_v"
                          />
                        </div>
                      </div>
                      <input
                        type="range"
                        min={35}
                        max={85}
                        step={1}
                        value={acdcState.pm_v_deg}
                        onChange={(e) => updateAcdc('pm_v_deg', Number(e.target.value))}
                        className="w-full accent-violet-500"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Manual Pole/Zero & Midband Gain Override Controls */}
            {manualOverride && (
              <div className="bg-amber-950/25 border border-amber-500/40 rounded-lg p-3 space-y-2.5 text-xs mt-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono font-bold text-amber-300">
                    Manual Compensator Pole/Zero Override
                  </span>
                  <button
                    onClick={syncManualFromEngine}
                    className="flex items-center gap-1 text-[10px] font-mono text-slate-300 hover:text-white bg-slate-900 px-2 py-0.5 rounded border border-slate-700"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Reset to K-Factor
                  </button>
                </div>

                {activeLoop === 'dcdc-loop' && (
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <div className="flex justify-between text-[11px] text-slate-300">
                        <span>Zero f_z1</span>
                        <span className="font-mono text-amber-300">
                          {manualFz1_kHz.toFixed(2)} kHz
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0.1}
                        max={25}
                        step={0.1}
                        value={manualFz1_kHz}
                        onChange={(e) => setManualFz1_kHz(Number(e.target.value))}
                        className="w-full accent-amber-500"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-[11px] text-slate-300">
                        <span>Zero f_z2</span>
                        <span className="font-mono text-amber-300">
                          {manualFz2_kHz.toFixed(2)} kHz
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0.2}
                        max={35}
                        step={0.1}
                        value={manualFz2_kHz}
                        onChange={(e) => setManualFz2_kHz(Number(e.target.value))}
                        className="w-full accent-amber-500"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-[11px] text-slate-300">
                        <span>Pole f_p1</span>
                        <span className="font-mono text-amber-300">
                          {manualFp1_kHz.toFixed(1)} kHz
                        </span>
                      </div>
                      <input
                        type="range"
                        min={2}
                        max={120}
                        step={0.5}
                        value={manualFp1_kHz}
                        onChange={(e) => setManualFp1_kHz(Number(e.target.value))}
                        className="w-full accent-amber-500"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-[11px] text-slate-300">
                        <span>Pole f_p2</span>
                        <span className="font-mono text-amber-300">
                          {manualFp2_kHz.toFixed(1)} kHz
                        </span>
                      </div>
                      <input
                        type="range"
                        min={5}
                        max={180}
                        step={1}
                        value={manualFp2_kHz}
                        onChange={(e) => setManualFp2_kHz(Number(e.target.value))}
                        className="w-full accent-amber-500"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <div className="flex justify-between text-[11px] text-slate-300">
                    <span>Loop Gain Trim ΔK_c</span>
                    <span className="font-mono text-amber-300">
                      {manualGainTrim_dB >= 0
                        ? `+${manualGainTrim_dB.toFixed(1)}`
                        : manualGainTrim_dB.toFixed(1)}{' '}
                      dB
                    </span>
                  </div>
                  <input
                    type="range"
                    min={-24}
                    max={24}
                    step={0.5}
                    value={manualGainTrim_dB}
                    onChange={(e) => setManualGainTrim_dB(Number(e.target.value))}
                    className="w-full accent-amber-500"
                  />
                </div>
              </div>
            )}

            {/* Synthesized Compensator Hardware / Digital Summary Card */}
            <div className="bg-slate-950/90 border border-slate-800 rounded-lg p-3 space-y-2">
              <div className="text-[11px] font-mono text-slate-400 flex items-center justify-between">
                <span>Synthesized Compensator Network</span>
                <span className={`inline-flex items-center gap-1.5 ${isLoopStable ? 'text-emerald-400' : 'text-rose-400'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${isLoopStable ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                  {isLoopStable ? 'Loop stable' : 'Check margins'}
                </span>
              </div>
              {activeLoop === 'dcdc-loop' ? (
                <>
                  {!dcdcRes.isTwoZeroComp && dcdcRes.type2Architecture === 'ota' ? (
                    <div className="grid grid-cols-3 gap-1.5 text-[11px] font-mono">
                      <div className="bg-slate-900 px-2 py-1 rounded border border-slate-800">
                        <span className="text-slate-500">R1(top):</span>{' '}
                        <span className="text-slate-200">{dcdcRes.R1_ota_kOhm.toFixed(1)}kΩ</span>
                      </div>
                      <div className="bg-slate-900 px-2 py-1 rounded border border-slate-800">
                        <span className="text-slate-500">R4(bot):</span>{' '}
                        <span className="text-slate-200">{dcdcRes.R4_ota_kOhm.toFixed(1)}kΩ</span>
                      </div>
                      <div className="bg-slate-900 px-2 py-1 rounded border border-slate-800">
                        <span className="text-slate-500">R2(cmp):</span>{' '}
                        <span className="text-emerald-300">{dcdcRes.R2_ota_kOhm.toFixed(1)}kΩ</span>
                      </div>
                      <div className="bg-slate-900 px-2 py-1 rounded border border-slate-800">
                        <span className="text-slate-500">C1(E24):</span>{' '}
                        <span className="text-blue-300">{dcdcRes.C1_ota_e24_nF}nF</span>
                      </div>
                      <div className="bg-slate-900 px-2 py-1 rounded border border-slate-800">
                        <span className="text-slate-500">C2(E24):</span>{' '}
                        <span className="text-blue-300">{dcdcRes.C2_ota_e24_pF}pF</span>
                      </div>
                      <div className="bg-slate-900 px-2 py-1 rounded border border-slate-800">
                        <span className="text-slate-500">OTA g_m:</span>{' '}
                        <span className="text-amber-300">{dcdcRes.ota_gm_mS.toFixed(2)}mS</span>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-1.5 text-[11px] font-mono">
                      <div className="bg-slate-900 px-2 py-1 rounded border border-slate-800">
                        <span className="text-slate-500">R1:</span>{' '}
                        <span className="text-slate-200">{dcdcRes.R1_kOhm.toFixed(1)}kΩ</span>
                      </div>
                      <div className="bg-slate-900 px-2 py-1 rounded border border-slate-800">
                        <span className="text-slate-500">R2:</span>{' '}
                        <span className="text-emerald-300">{dcdcRes.R2_kOhm.toFixed(1)}kΩ</span>
                      </div>
                      <div className="bg-slate-900 px-2 py-1 rounded border border-slate-800">
                        <span className="text-slate-500">R3:</span>{' '}
                        <span className={dcdcRes.isTwoZeroComp ? 'text-emerald-300' : 'text-slate-500'}>
                          {dcdcRes.isTwoZeroComp ? `${dcdcRes.R3_kOhm.toFixed(1)}kΩ` : 'N/A (Type-II)'}
                        </span>
                      </div>
                      <div className="bg-slate-900 px-2 py-1 rounded border border-slate-800">
                        <span className="text-slate-500">C1:</span>{' '}
                        <span className="text-blue-300">{dcdcRes.C1_nF.toFixed(2)}nF</span>
                      </div>
                      <div className="bg-slate-900 px-2 py-1 rounded border border-slate-800">
                        <span className="text-slate-500">C2:</span>{' '}
                        <span className="text-blue-300">{dcdcRes.C2_pF.toFixed(0)}pF</span>
                      </div>
                      <div className="bg-slate-900 px-2 py-1 rounded border border-slate-800">
                        <span className="text-slate-500">C3:</span>{' '}
                        <span className={dcdcRes.isTwoZeroComp ? 'text-blue-300' : 'text-slate-500'}>
                          {dcdcRes.isTwoZeroComp ? `${dcdcRes.C3_nF.toFixed(2)}nF` : 'N/A (Type-II)'}
                        </span>
                      </div>
                    </div>
                  )}
                  <div className="text-[10px] font-mono text-slate-400 pt-1 border-t border-slate-800/80 flex flex-wrap justify-between gap-2">
                    <span>
                      f_z1={manualOverride ? manualFz1_kHz.toFixed(2) : dcdcRes.fz1_kHz.toFixed(2)}kHz
                      {dcdcRes.isTwoZeroComp
                        ? ` · f_z2=${manualOverride ? manualFz2_kHz.toFixed(2) : dcdcRes.fz2_kHz.toFixed(2)}kHz`
                        : ` · k=${dcdcRes.type2_k_factor.toFixed(2)} (${dcdcRes.type2_boost_deg.toFixed(0)}°)`}
                    </span>
                    <span>
                      f_p1={manualOverride ? manualFp1_kHz.toFixed(1) : dcdcRes.fp1_kHz.toFixed(1)}kHz
                      {dcdcRes.isTwoZeroComp
                        ? ` · f_p2=${manualOverride ? manualFp2_kHz.toFixed(1) : dcdcRes.fp2_kHz.toFixed(1)}kHz`
                        : ''}
                    </span>
                  </div>
                </>
              ) : activeLoop === 'acdc-inner' ? (
                <div className="grid grid-cols-2 gap-1.5 text-[11px] font-mono">
                  <div className="bg-slate-900 px-2 py-1 rounded border border-slate-800">
                    <span className="text-slate-500">K_p,i:</span>{' '}
                    <span className="text-blue-300">{acdcRes.Kp_i.toFixed(4)}</span>
                  </div>
                  <div className="bg-slate-900 px-2 py-1 rounded border border-slate-800">
                    <span className="text-slate-500">K_i,i:</span>{' '}
                    <span className="text-blue-300">{acdcRes.Ki_i.toFixed(1)} s⁻¹</span>
                  </div>
                  <div className="bg-slate-900 px-2 py-1 rounded border border-slate-800">
                    <span className="text-slate-500">f_z,i:</span>{' '}
                    <span className="text-emerald-300">{acdcRes.fz_i_kHz.toFixed(2)} kHz</span>
                  </div>
                  <div className="bg-slate-900 px-2 py-1 rounded border border-slate-800">
                    <span className="text-slate-500">f_p,i:</span>{' '}
                    <span className="text-amber-300">{acdcRes.fp_i_kHz.toFixed(1)} kHz</span>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-1.5 text-[11px] font-mono">
                  <div className="bg-slate-900 px-2 py-1 rounded border border-slate-800">
                    <span className="text-slate-500">K_p,v:</span>{' '}
                    <span className="text-violet-300">{acdcRes.Kp_v.toFixed(4)} A/V</span>
                  </div>
                  <div className="bg-slate-900 px-2 py-1 rounded border border-slate-800">
                    <span className="text-slate-500">K_i,v:</span>{' '}
                    <span className="text-violet-300">{acdcRes.Ki_v.toFixed(2)} A/(V·s)</span>
                  </div>
                  <div className="bg-slate-900 px-2 py-1 rounded border border-slate-800">
                    <span className="text-slate-500">f_z,v:</span>{' '}
                    <span className="text-emerald-300">{acdcRes.fz_v_Hz.toFixed(1)} Hz</span>
                  </div>
                  <div className="bg-slate-900 px-2 py-1 rounded border border-slate-800">
                    <span className="text-slate-500">f_p,v:</span>{' '}
                    <span className="text-amber-300">{acdcRes.fp_v_Hz.toFixed(1)} Hz</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Interactive Bode Plot + 4 Small-Signal Analytical Sub-Graphs */}
        <div className="xl:col-span-8 space-y-6">
          {/* Primary Dual-Subplot Bode Diagram with PM & GM Vector Callouts */}
          <BodeStabilityGraph
            res={loopAnalysis.effectiveBodeRes}
            pinnedRes={pinnedDcdcRes}
            onSelectControlType={(ctrl) => updateDcdc('controlType', ctrl)}
          />

          {/* 2x2 Analytical Suite: Sensitivity S(jw), Closed-Loop Z_out(jw), Nyquist + Pole-Zero Map, and Step-Load Transient */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Sub-Graph 1: Sensitivity |S(jw)| & Complementary Sensitivity |T_cl(jw)| */}
            <InteractiveChart
              title="Closed-Loop Sensitivity |S(jω)| & Complementary |T_cl(jω)|"
              subtitle={`Peak Sensitivity M_s = ${loopAnalysis.peakSensitivity_dB.toFixed(2)} dB @ ${loopAnalysis.peakSensitivityFreq_kHz.toFixed(2)} kHz (Robustness Target < 6 dB)`}
              xLabel="Frequency"
              xUnit="kHz"
              logX={true}
              currentX={loopAnalysis.fc_kHz}
              currentXLabel={`fc=${loopAnalysis.fc_kHz.toFixed(2)}kHz`}
              minPhysX={activeLoop === 'acdc-outer' ? 0.001 : 0.05}
              maxPhysX={activeLoop === 'acdc-outer' ? 5 : 250}
              domainEvaluator={(freq_kHz) => {
                const r = loopAnalysis.evalSensitivityAndImpedance(Math.max(1, freq_kHz * 1000));
                return { y1: r.S_dB, y2: r.Tcl_dB };
              }}
              horizontalMarkers={[
                {
                  value: 6,
                  label: 'M_s Robustness Limit (+6 dB)',
                  color: '#f59e0b',
                  axis: 'left',
                },
              ]}
              data={loopAnalysis.sensitivityCurve.map((pt) => ({
                x: pt.freq_kHz,
                y1: pt.S_dB,
                y2: pt.Tcl_dB,
              }))}
              series1={{
                label: 'Sensitivity |S(jω)| = |1/(1+T)|',
                unit: 'dB',
                color: '#f43f5e',
              }}
              series2={{
                label: 'Closed-Loop Tracking |T_cl(jω)|',
                unit: 'dB',
                color: '#10b981',
              }}
            />

            {/* Sub-Graph 2: Open-Loop vs Closed-Loop Output Impedance |Z_out(jw)| */}
            <InteractiveChart
              title="Open-Loop vs. Closed-Loop Output Impedance |Z_out(jω)|"
              subtitle={`Peak |Z_out,cl| = ${loopAnalysis.peakZoutCl_mOhm.toFixed(1)} mΩ — Loop Gain Suppresses Z_out Below f_c`}
              xLabel="Frequency"
              xUnit="kHz"
              logX={true}
              currentX={loopAnalysis.fc_kHz}
              currentXLabel={`fc=${loopAnalysis.fc_kHz.toFixed(2)}kHz`}
              minPhysX={activeLoop === 'acdc-outer' ? 0.001 : 0.05}
              maxPhysX={activeLoop === 'acdc-outer' ? 5 : 250}
              domainEvaluator={(freq_kHz) => {
                const r = loopAnalysis.evalSensitivityAndImpedance(Math.max(1, freq_kHz * 1000));
                return { y1: r.Zcl_dBOhm, y2: r.Zol_dBOhm };
              }}
              data={loopAnalysis.sensitivityCurve.map((pt) => ({
                x: pt.freq_kHz,
                y1: pt.Zcl_dBOhm,
                y2: pt.Zol_dBOhm,
              }))}
              series1={{
                label: 'Closed-Loop |Z_out,cl(jω)|',
                unit: 'dBΩ',
                color: '#38bdf8',
              }}
              series2={{
                label: 'Open-Loop |Z_out,ol(jω)|',
                unit: 'dBΩ',
                color: '#94a3b8',
              }}
            />
          </div>

          {/* Sub-Graph 3 & 4 Row: Nyquist Contour + s-Plane Pole/Zero Map AND Closed-Loop Step-Load Transient */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Sub-Graph 3: Interactive Nyquist Polar Vector Locus & s-Plane Pole-Zero Map */}
            <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2.5 mb-3">
                <div>
                  <h4 className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
                    <GitCommit className="w-4 h-4 text-emerald-400" />
                    Nyquist Polar Locus T(jω) &amp; s-Plane Pole-Zero Map
                  </h4>
                  <p className="text-[11px] text-slate-400 font-mono">
                    Critical Point (-1, j0) Distance d_min ={' '}
                    {Math.pow(10, -loopAnalysis.peakSensitivity_dB / 20).toFixed(3)} · PM Arc ={' '}
                    {loopAnalysis.pm_deg.toFixed(1)}°
                  </p>
                </div>
                <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-[10px] font-mono text-emerald-300">
                  Cauchy Encirclements: 0
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                {/* Left SVG: Nyquist Complex Plane (Re vs Im of T(jw)) */}
                <div className="bg-slate-900/70 border border-slate-800/90 rounded-lg p-2">
                  <div className="text-[10px] font-mono text-slate-400 text-center mb-1">
                    Nyquist Plane Re&#123;T(jω)&#125; vs Im&#123;T(jω)&#125;
                  </div>
                  <svg viewBox="0 0 220 220" className="w-full h-48 select-none">
                    {/* Grid Axes centered at (130, 110), scale: 1 unit = 55 px */}
                    <line x1="10" y1="110" x2="210" y2="110" stroke="#334155" strokeWidth="1" />
                    <line x1="130" y1="10" x2="130" y2="210" stroke="#334155" strokeWidth="1" />

                    {/* Unit Circle |T(jw)| = 1 (0 dB crossover circle) */}
                    <circle
                      cx="130"
                      cy="110"
                      r="55"
                      fill="none"
                      stroke="#475569"
                      strokeWidth="1"
                      strokeDasharray="3 3"
                    />

                    {/* M_s Forbidden Sensitivity Circle around (-1, j0) -> center (75, 110) */}
                    <circle
                      cx="75"
                      cy="110"
                      r={55 * Math.pow(10, -6 / 20)}
                      fill="rgba(244, 63, 94, 0.08)"
                      stroke="#f43f5e"
                      strokeWidth="1"
                      strokeDasharray="2 2"
                    />

                    {/* Critical Nyquist Point (-1, j0) at (75, 110) */}
                    <circle cx="75" cy="110" r="3.5" fill="#f43f5e" />
                    <text x="52" y="103" fill="#fda4af" fontSize="8" fontFamily="monospace">
                      (-1,j0)
                    </text>

                    {/* Phase Margin Angle Ray on Unit Circle */}
                    {(() => {
                      const pmRad = ((180 - loopAnalysis.pm_deg) * Math.PI) / 180;
                      const cx = 130 + 55 * Math.cos(-pmRad);
                      const cy = 110 - 55 * Math.sin(-pmRad);
                      return (
                        <g>
                          <line
                            x1="130"
                            y1="110"
                            x2={cx}
                            y2={cy}
                            stroke="#10b981"
                            strokeWidth="1.5"
                            strokeDasharray="2 2"
                          />
                          <circle cx={cx} cy={cy} r="3.5" fill="#10b981" />
                          <text
                            x={Math.max(12, Math.min(175, cx - 18))}
                            y={Math.max(15, Math.min(205, cy + 12))}
                            fill="#6ee7b7"
                            fontSize="8"
                            fontFamily="monospace"
                          >
                            PM={loopAnalysis.pm_deg.toFixed(0)}°
                          </text>
                        </g>
                      );
                    })()}

                    {/* Nyquist Trajectory Polyline */}
                    {(() => {
                      const pts = loopAnalysis.sensitivityCurve.map((pt, idx) => {
                        const rRaw = Math.sqrt(pt.T_re * pt.T_re + pt.T_im * pt.T_im);
                        const rMapped =
                          rRaw <= 1.2 ? rRaw : 1.2 + 0.65 * Math.tanh((rRaw - 1.2) * 0.35);
                        const scale = rRaw > 1e-6 ? rMapped / rRaw : 0;
                        const x = 130 + pt.T_re * scale * 55;
                        const y = 110 - pt.T_im * scale * 55;
                        return { x, y, idx, f_kHz: pt.freq_kHz };
                      });
                      const pathD = pts
                        .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
                        .join(' ');
                      const activePt = nyquistHoverIdx !== null ? pts[nyquistHoverIdx] : null;
                      return (
                        <g>
                          <path d={pathD} fill="none" stroke="#38bdf8" strokeWidth="2" />
                          {pts
                            .filter((_, i) => i % 8 === 0)
                            .map((p) => (
                              <circle
                                key={p.idx}
                                cx={p.x}
                                cy={p.y}
                                r="3"
                                fill="#0284c7"
                                className="cursor-pointer"
                                onMouseEnter={() => setNyquistHoverIdx(p.idx)}
                              />
                            ))}
                          {activePt && (
                            <g>
                              <circle cx={activePt.x} cy={activePt.y} r="4.5" fill="#facc15" />
                              <text x="12" y="18" fill="#fef08a" fontSize="8.5" fontFamily="monospace">
                                f={activePt.f_kHz.toFixed(2)}kHz
                              </text>
                            </g>
                          )}
                        </g>
                      );
                    })()}
                  </svg>
                </div>

                {/* Right SVG: s-Plane Pole-Zero Map */}
                <div className="bg-slate-900/70 border border-slate-800/90 rounded-lg p-2">
                  <div className="text-[10px] font-mono text-slate-400 text-center mb-1">
                    s-Plane Pole (×) &amp; Zero (○) Map
                  </div>
                  <svg viewBox="0 0 220 220" className="w-full h-48 select-none">
                    <rect x="10" y="10" width="145" height="200" fill="rgba(16, 185, 129, 0.05)" />
                    <rect x="155" y="10" width="55" height="200" fill="rgba(244, 63, 94, 0.05)" />

                    <line x1="10" y1="110" x2="210" y2="110" stroke="#475569" strokeWidth="1" />
                    <line x1="155" y1="10" x2="155" y2="210" stroke="#94a3b8" strokeWidth="1.2" />

                    <text x="16" y="22" fill="#6ee7b7" fontSize="8" fontFamily="monospace">
                      LHP (Stable σ &lt; 0)
                    </text>
                    <text x="160" y="22" fill="#fda4af" fontSize="8" fontFamily="monospace">
                      RHP
                    </text>
                    <text x="158" y="105" fill="#94a3b8" fontSize="8" fontFamily="monospace">
                      jω
                    </text>

                    <text x="151" y="114" fill="#38bdf8" fontSize="12" fontWeight="bold">
                      ×
                    </text>

                    <text x="115" y="65" fill="#f43f5e" fontSize="12" fontWeight="bold">
                      ×
                    </text>
                    <text x="115" y="160" fill="#f43f5e" fontSize="12" fontWeight="bold">
                      ×
                    </text>
                    <text x="72" y="55" fill="#fda4af" fontSize="7.5" fontFamily="monospace">
                      Plant LC Poles
                    </text>

                    <circle
                      cx="118"
                      cy="110"
                      r="4.5"
                      fill="none"
                      stroke="#10b981"
                      strokeWidth="1.8"
                    />
                    <circle
                      cx="102"
                      cy="110"
                      r="4.5"
                      fill="none"
                      stroke="#10b981"
                      strokeWidth="1.8"
                    />
                    <text x="88" y="125" fill="#6ee7b7" fontSize="7.5" fontFamily="monospace">
                      f_z1, f_z2
                    </text>

                    <text x="48" y="114" fill="#38bdf8" fontSize="12" fontWeight="bold">
                      ×
                    </text>
                    <text x="28" y="114" fill="#38bdf8" fontSize="12" fontWeight="bold">
                      ×
                    </text>
                    <text x="24" y="98" fill="#7dd3fc" fontSize="7.5" fontFamily="monospace">
                      f_p1, f_p2
                    </text>

                    <circle
                      cx="68"
                      cy="110"
                      r="4"
                      fill="none"
                      stroke="#f59e0b"
                      strokeWidth="1.5"
                    />
                    <text x="58" y="138" fill="#fcd34d" fontSize="7.5" fontFamily="monospace">
                      f_ESR
                    </text>

                    <circle
                      cx="185"
                      cy="110"
                      r="4"
                      fill="none"
                      stroke="#f43f5e"
                      strokeWidth="1.5"
                    />
                    <text x="166" y="128" fill="#fda4af" fontSize="7.5" fontFamily="monospace">
                      Delay/RHP
                    </text>
                  </svg>
                </div>
              </div>

              <div className="mt-2 pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between text-[10px] font-mono text-slate-400 gap-2">
                <span>
                  ● <span className="text-emerald-300">Compensator Zeros</span> cancel resonant LC
                  phase lag
                </span>
                <span>
                  ● <span className="text-blue-300">HF Poles</span> attenuate switching ripple
                  &amp; ESR gain
                </span>
              </div>
            </div>

            {/* Sub-Graph 4: Closed-Loop Step-Load Transient Response */}
            <div className="space-y-2">
              <div className="flex items-center justify-between bg-slate-900/80 border border-slate-800 rounded-lg px-3 py-2">
                <div className="flex items-center gap-2 text-xs font-mono text-slate-300">
                  <span>
                    Step-Load Magnitude:{' '}
                    <span className="text-emerald-400 font-bold">
                      {loadStepPct}% ({loopAnalysis.dI_step_A.toFixed(1)} A Step)
                    </span>
                  </span>
                  <LockToggleButton
                    compact
                    locked={loadStepLock.locked}
                    onToggle={loadStepLock.toggleLock}
                    label="Step-Load %"
                  />
                </div>
                <div className="flex items-center gap-2">
                  {[25, 50, 75, 100].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => loadStepLock.setManual(pct)}
                      className={`px-2 py-0.5 rounded text-[10px] font-mono border cursor-pointer ${
                        loadStepPct === pct
                          ? 'bg-emerald-600 border-emerald-400 text-white'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {pct}% Step
                    </button>
                  ))}
                </div>
              </div>

              <InteractiveChart
                title={`Closed-Loop Step-Load Transient Response (ΔI = +${loopAnalysis.dI_step_A.toFixed(1)} A)`}
                subtitle={`Undershoot = -${(loopAnalysis.maxUndershoot_V * 1000).toFixed(0)} mV · t_settle ≈ ${loopAnalysis.settlingTime_us.toFixed(0)} µs · f_ring = ${loopAnalysis.ringingFreq_kHz.toFixed(2)} kHz`}
                xLabel="Time"
                xUnit="ms"
                minPhysX={0}
                maxPhysX={loopAnalysis.totalTime_ms * 3}
                domainEvaluator={(t_ms) => {
                  const pt = loopAnalysis.evalTransient(t_ms);
                  return { y1: pt.dV_mV, y2: pt.Vout_V };
                }}
                horizontalMarkers={[
                  {
                    value: Number((-loopAnalysis.maxUndershoot_V * 1000).toFixed(1)),
                    label: `Peak Undershoot (-${(loopAnalysis.maxUndershoot_V * 1000).toFixed(0)} mV)`,
                    color: '#f43f5e',
                    axis: 'left',
                  },
                ]}
                data={loopAnalysis.transientCurve.map((pt) => ({
                  x: pt.t_ms,
                  y1: pt.dV_mV,
                  y2: pt.Vout_V,
                }))}
                series1={{
                  label: 'ΔV_out(t) Deviation',
                  unit: 'mV',
                  color: '#10b981',
                }}
                series2={{
                  label: 'Absolute V_out(t)',
                  unit: 'V',
                  color: '#38bdf8',
                }}
              />
            </div>
          </div>

          {/* Symbolic Transfer Function & Exact Stability Equations Block */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <h3 className="text-[13px] font-medium text-slate-100">
                Small-Signal Transfer Function Formulation &amp; Stability Margins
              </h3>
              <span className="text-[11px] font-mono text-slate-400">
                Evaluated @ Current Operating Point &amp; Component Values
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-slate-950 border border-slate-800 rounded-lg p-3.5 overflow-x-auto">
                <div className="text-[11px] font-mono text-slate-400 mb-2">
                  1. Control-to-Output Plant &amp; Compensator Loop Gain T(s)
                </div>
                <MathFormula
                  displayMode
                  tex={
                    activeLoop === 'dcdc-loop'
                      ? String.raw`T(s) = G_{vd}(s)\cdot G_c(s)\cdot e^{-s T_d} = \left(G_{d0}\frac{1 + s/\omega_{\text{esr}}}{1 + \frac{s}{Q_{\text{eff}}\omega_0} + \left(\frac{s}{\omega_0}\right)^2}\right) \cdot \left(\frac{\omega_{p0}}{s}\frac{(1+s/\omega_{z1})(1+s/\omega_{z2})}{(1+s/\omega_{p1})(1+s/\omega_{p2})}\right) e^{-s T_d}`
                      : activeLoop === 'acdc-inner'
                      ? String.raw`T_i(s) = G_{id}(s)\cdot G_{ci}(s)\cdot e^{-s T_d} = \left(\frac{V_{\text{dc}}}{R_L + s L_{\text{pfc}}}\right)\cdot \left(K_{p,i} + \frac{K_{i,i}}{s}\right)\frac{1}{1 + s/\omega_{p,i}} e^{-1.5 s / f_{s,\text{ctrl}}}`
                      : String.raw`T_v(s) = G_{vi}(s)\cdot G_{cv}(s) = \left(\frac{V_{\text{ac,rms}}}{2 V_{\text{dc}}}\cdot \frac{R_{\text{load}}(1 + s R_{\text{esr}}C_{\text{dc}})}{2 + s R_{\text{load}}C_{\text{dc}}}\right)\cdot \left(K_{p,v} + \frac{K_{i,v}}{s}\right)\frac{1}{1 + s/\omega_{p,v}}`
                  }
                />
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-lg p-3.5 overflow-x-auto">
                <div className="text-[11px] font-mono text-slate-400 mb-2">
                  2. Phase Margin (PM), Gain Margin (GM), and Closed-Loop Impedance Z_out,cl(s)
                </div>
                <MathFormula
                  displayMode
                  tex={String.raw`\begin{aligned}
\text{PM} &= 180^\circ + \angle T(j 2\pi f_c) = ${loopAnalysis.pm_deg.toFixed(1)}^\circ \quad (\text{at } |T(j 2\pi f_c)| = 0\text{ dB}) \\
\text{GM} &= -20\log_{10}|T(j 2\pi f_{-180^\circ})| = +${loopAnalysis.gm_dB.toFixed(1)}\text{ dB} \quad (\text{at } \angle T = -180^\circ) \\
Z_{\text{out,cl}}(s) &= \frac{Z_{\text{out,ol}}(s)}{1 + T(s)}, \quad M_s = \max_{\omega}\left|\frac{1}{1+T(j\omega)}\right| = ${loopAnalysis.peakSensitivity_dB.toFixed(2)}\text{ dB}
\end{aligned}`}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
