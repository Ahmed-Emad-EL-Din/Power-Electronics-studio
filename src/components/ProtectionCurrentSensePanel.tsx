import React, { useState, useMemo } from 'react';
import { DcDcDesignState } from '../data/databases';
import { DcDcResults } from '../engine/dcdcEngine';
import { MathFormula } from './MathFormula';
import { InteractiveChart } from './InteractiveChart';
import { useLockableValue } from './DesignSolverContext';
import { LockToggleButton } from './AutoSolverControls';
import {
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Cpu,
  Sliders,
  Zap,
  Activity,
  ExternalLink,
} from 'lucide-react';

interface ProtectionCurrentSensePanelProps {
  state: DcDcDesignState;
  res: DcDcResults;
  onChange: (next: DcDcDesignState) => void;
  onOpenPartDrawer?: () => void;
}

export type SenseTopologyId = 'ct-primary' | 'shunt-amc1302' | 'shunt-ina240';

const E24_SERIES = [
  1.0, 1.1, 1.2, 1.3, 1.5, 1.6, 1.8, 2.0, 2.2, 2.4, 2.7, 3.0, 3.3, 3.6, 3.9, 4.3, 4.7, 5.1, 5.6,
  6.2, 6.8, 7.5, 8.2, 9.1,
];

function snapE24(val: number): number {
  if (val <= 0 || !Number.isFinite(val)) return 1.0;
  const exp = Math.floor(Math.log10(val));
  const base = Math.pow(10, exp);
  const norm = val / base;
  let best = E24_SERIES[0];
  let minDiff = 999;
  for (const s of E24_SERIES) {
    const d = Math.abs(s - norm);
    if (d < minDiff) {
      minDiff = d;
      best = s;
    }
  }
  return Number((best * base).toPrecision(3));
}

export const ProtectionCurrentSensePanel: React.FC<ProtectionCurrentSensePanelProps> = ({
  state,
  res,
  onOpenPartDrawer,
}) => {
  // Auto-calculated optimal sensing & fault timing defaults from operating point & switch tech
  const Ipri_pk_est_A = Math.max(1.0, res.I_lead_turnoff_A);
  const autoSenseMode: SenseTopologyId =
    state.Vin_nom_V >= 120 && state.Pout_W >= 600
      ? 'ct-primary'
      : state.Pout_W <= 500
      ? 'shunt-ina240'
      : 'shunt-amc1302';
  const autoCtTurnsRatio =
    Ipri_pk_est_A >= 28 ? 200 : Ipri_pk_est_A >= 16 ? 150 : Ipri_pk_est_A >= 7 ? 100 : 50;
  const autoLebTime_ns = Math.min(
    250,
    Math.max(60, Math.round((res.priDevice.tr_ns * 3 + 40) / 10) * 10)
  );
  const autoDesatTime_ns = res.priDevice.tech === 'GaN HEMT' ? 220 : 350;
  const autoStoFactor =
    res.priDevice.tech === 'SiC MOSFET' ? 5.5 : res.priDevice.tech === 'GaN HEMT' ? 4.0 : 5.0;

  const senseModeLock = useLockableValue<SenseTopologyId>(autoSenseMode, false);
  const ctRatioLock = useLockableValue<number>(autoCtTurnsRatio, false);
  const ocpMultLock = useLockableValue<number>(1.3, false);
  const scMultLock = useLockableValue<number>(1.65, false);
  const lebLock = useLockableValue<number>(autoLebTime_ns, false);
  const compDelayLock = useLockableValue<number>(25, false);
  const desatLock = useLockableValue<number>(autoDesatTime_ns, false);
  const stoLock = useLockableValue<number>(autoStoFactor, false);

  const senseMode = senseModeLock.value;
  const ctTurnsRatio = ctRatioLock.value;
  const ocpTripMult = ocpMultLock.value;
  const scTripMult = scMultLock.value;
  const lebTime_ns = lebLock.value;
  const compDelay_ns = compDelayLock.value;
  const desatTargetTime_ns = desatLock.value;
  const softTurnOffFactor = stoLock.value;

  const [viewMode, setViewMode] = useState<'waveform' | 'schematic'>('waveform');

  const protAnalysis = useMemo(() => {
    const fsw_Hz = state.fsw_kHz * 1e3;
    const Tsw_us = 1e6 / fsw_Hz;
    const Vin = state.Vin_nom_V;
    const Vadc_fs_V = 3.3; // Standard C2000 / STM32G4 ADC & CMPSS full-scale reference
    const Vadc_target_max_V = 2.85; // Leave headroom up to 3.3V for SC fault trip

    // Nominal primary peak & RMS currents
    const Ipri_pk_nom_A = Math.max(1.0, res.I_lead_turnoff_A);
    const Ipri_rms_A = Math.max(0.7, Ipri_pk_nom_A / Math.SQRT2);

    // 1. Over-Current Protection (OCP) & Short-Circuit Thresholds
    const I_ocp_cbc_A = Ipri_pk_nom_A * ocpTripMult;
    const I_sc_trip_A = Ipri_pk_nom_A * scTripMult;
    const I_fullscale_design_A = Ipri_pk_nom_A * 1.9;

    // 2. Current-Sense Network Synthesis (CT vs Isolated Shunt vs INA240 Shunt)
    // A) Current-Sense Transformer (CT)
    const R_burden_ideal_Ohm = (Vadc_target_max_V * ctTurnsRatio) / I_fullscale_design_A;
    const R_burden_Ohm = snapE24(Math.max(1.0, R_burden_ideal_Ohm));
    const Gain_ct_V_per_A = R_burden_Ohm / ctTurnsRatio;
    const P_burden_W = Math.pow(Ipri_rms_A / ctTurnsRatio, 2) * R_burden_Ohm;

    // CT Reset Resistor R_reset = R_burden * (D_max / (1 - D_max)) to prevent core saturation
    const D_max = Math.min(0.48, Math.max(0.35, res.Deff_nom * 0.52));
    const R_reset_Ohm = snapE24(R_burden_Ohm * 0.25);
    const V_sec_ct_pk_V = (Ipri_pk_nom_A / ctTurnsRatio) * R_burden_Ohm;
    const ctVoltSec_Vus = (V_sec_ct_pk_V + 0.7) * D_max * Tsw_us;

    // B) Shunt + AMC1302 (±50mV Linear / ±64mV Clipping, Gain = 8.2 V/V differential -> 4.1 V/V single-ended)
    const V_shunt_target_mV = 42.0; // 42 mV at I_sc_trip_A
    const R_shunt_amc_mOhm = snapE24(V_shunt_target_mV / I_sc_trip_A);
    const P_shunt_amc_W = Ipri_rms_A * Ipri_rms_A * (R_shunt_amc_mOhm * 1e-3);
    const Gain_amc_V_per_A = (R_shunt_amc_mOhm * 1e-3) * 41.0; // With 5x post-amp to 0..3.3V ADC

    // C) Shunt + INA240A2 (Gain = 50 V/V)
    const R_shunt_ina_mOhm = snapE24(((Vadc_target_max_V / 50) * 1e3) / I_fullscale_design_A);
    const P_shunt_ina_W = Ipri_rms_A * Ipri_rms_A * (R_shunt_ina_mOhm * 1e-3);
    const Gain_ina_V_per_A = (R_shunt_ina_mOhm * 1e-3) * 50.0;

    const activeGain_V_A =
      senseMode === 'ct-primary'
        ? Gain_ct_V_per_A
        : senseMode === 'shunt-amc1302'
        ? Gain_amc_V_per_A
        : Gain_ina_V_per_A;

    const activeSenseLoss_W =
      senseMode === 'ct-primary'
        ? P_burden_W
        : senseMode === 'shunt-amc1302'
        ? P_shunt_amc_W
        : P_shunt_ina_W;

    // Sense voltages and 12-bit DAC codes (0..4095 for 0..3.3V)
    const V_sense_nom_V = Math.min(3.25, Ipri_pk_nom_A * activeGain_V_A);
    const V_sense_ocp_V = Math.min(3.28, I_ocp_cbc_A * activeGain_V_A);
    const V_sense_sc_V = Math.min(3.29, I_sc_trip_A * activeGain_V_A);

    const dacCode_ocp = Math.min(4095, Math.round((V_sense_ocp_V / Vadc_fs_V) * 4095));
    const dacCode_sc = Math.min(4095, Math.round((V_sense_sc_V / Vadc_fs_V) * 4095));

    // RC Leading-Edge Blanking (LEB) Low-Pass Filter (tau_LEB = R_f * C_f = lebTime_ns / 2.2)
    const R_leb_Ohm = 100;
    const C_leb_pF = snapE24((lebTime_ns / (2.2 * R_leb_Ohm)) * 1e3);
    const fc_leb_MHz = 1 / (2 * Math.PI * R_leb_Ohm * (C_leb_pF * 1e-12)) / 1e6;

    // 3. Short-Circuit Fault di/dt & Propagation Delay Overshoot
    // During secondary/transformer short-circuit, di/dt = Vin / L_lk
    const L_fault_uH = Math.max(1.5, state.Llk_uH);
    const di_dt_fault_A_us = Vin / L_fault_uH; // V / uH = A / us
    const di_dt_fault_A_ns = di_dt_fault_A_us * 1e-3;

    const driverPropDelay_ns = 42; // Isolated gate driver propagation delay
    const sensorDelay_ns =
      senseMode === 'ct-primary' ? lebTime_ns : senseMode === 'shunt-amc1302' ? lebTime_ns + 180 : lebTime_ns + 65;
    const totalPropDelay_ns = sensorDelay_ns + compDelay_ns + driverPropDelay_ns;

    const deltaI_overshoot_A = di_dt_fault_A_ns * totalPropDelay_ns;
    const I_fault_pk_A = I_sc_trip_A + deltaI_overshoot_A;

    // Device Safe Pulsed Current Limit (typically 3.0x continuous Id_max)
    const Id_cont_rating_A = (res.priDevice.Id_max_A ?? 45) * state.nParallelPri;
    const Id_pulsed_limit_A = Id_cont_rating_A * 2.8;
    const scSafe = I_fault_pk_A <= Id_pulsed_limit_A;

    // 4. Desaturation (V_ds,desat) & Soft Turn-Off (STO) Network Synthesis
    const V_desat_th_V = res.priDevice.tech === 'GaN HEMT' ? 4.5 : 6.5;
    const I_desat_chg_uA = 500; // Standard 500 uA internal desat current source (e.g., 1ED3122 / UCC21750)
    const C_blank_raw_pF = (I_desat_chg_uA * 1e-6 * (desatTargetTime_ns * 1e-9) / V_desat_th_V) * 1e12;
    const C_blank_pF = snapE24(Math.max(22, C_blank_raw_pF));
    const t_blank_actual_ns = (C_blank_pF * 1e-12 * V_desat_th_V) / (I_desat_chg_uA * 1e-6) * 1e9;

    // Soft Turn-Off (STO) vs Hard Turn-Off Voltage Overshoot across stray bus inductance L_stray (~25 nH)
    const L_stray_nH = 25;
    const Rg_nom_Ohm = state.Rg_ext_Ohm ?? res.Rg_ext_Ohm;
    const R_sto_Ohm = snapE24(Rg_nom_Ohm * softTurnOffFactor);
    const t_off_hard_ns = Math.max(12, res.priDevice.tf_ns * 1.1);
    const t_off_sto_ns = t_off_hard_ns * Math.pow(softTurnOffFactor, 0.72);

    const V_spike_hard_V = Vin + L_stray_nH * (I_fault_pk_A / t_off_hard_ns);
    const V_spike_sto_V = Vin + L_stray_nH * (I_fault_pk_A / t_off_sto_ns);
    const vSpikeSafe = V_spike_sto_V <= res.priDevice.Vds_max_V * 0.92;

    // 5. Build Short-Circuit Fault Trajectory Points & Continuous Evaluator for Interactive Plot
    const t_to_sc_ns = Math.max(150, ((I_sc_trip_A - Ipri_pk_nom_A * 0.35) / Math.max(di_dt_fault_A_ns, 0.005)));
    const t_peak_ns = t_to_sc_ns + totalPropDelay_ns;
    const t_end_ns = t_peak_ns + t_off_sto_ns * 1.3;

    const keyPoints = [
      { t_ns: 0, i_A: Ipri_pk_nom_A * 0.35, vds_sto_V: 1.5, vds_hard_V: 1.5 },
      { t_ns: t_to_sc_ns * 0.65, i_A: I_ocp_cbc_A, vds_sto_V: 2.2, vds_hard_V: 2.2 },
      { t_ns: t_to_sc_ns, i_A: I_sc_trip_A, vds_sto_V: 3.1, vds_hard_V: 3.1 },
      { t_ns: t_peak_ns, i_A: I_fault_pk_A, vds_sto_V: V_desat_th_V, vds_hard_V: V_desat_th_V },
      {
        t_ns: t_peak_ns + t_off_hard_ns * 0.5,
        i_A: I_fault_pk_A * 0.65,
        vds_sto_V: V_spike_sto_V,
        vds_hard_V: V_spike_hard_V,
      },
      {
        t_ns: t_peak_ns + t_off_hard_ns,
        i_A: I_fault_pk_A * 0.35,
        vds_sto_V: V_spike_sto_V * 0.96,
        vds_hard_V: Vin,
      },
      { t_ns: t_peak_ns + t_off_sto_ns, i_A: 0, vds_sto_V: Vin, vds_hard_V: Vin },
      { t_ns: t_end_ns, i_A: 0, vds_sto_V: Vin, vds_hard_V: Vin },
    ];

    const evalFaultAtT = (tRaw: number) => {
      const t = Math.max(0, tRaw);
      if (t <= 0) {
        return { t_ns: 0, i_A: keyPoints[0].i_A, vds_sto_V: keyPoints[0].vds_sto_V, vds_hard_V: keyPoints[0].vds_hard_V };
      }
      for (let i = 0; i < keyPoints.length - 1; i++) {
        const p0 = keyPoints[i];
        const p1 = keyPoints[i + 1];
        if (t <= p1.t_ns) {
          const span = Math.max(1e-6, p1.t_ns - p0.t_ns);
          const u = (t - p0.t_ns) / span;
          return {
            t_ns: Number(t.toFixed(1)),
            i_A: Number((p0.i_A + u * (p1.i_A - p0.i_A)).toFixed(2)),
            vds_sto_V: Number((p0.vds_sto_V + u * (p1.vds_sto_V - p0.vds_sto_V)).toFixed(1)),
            vds_hard_V: Number((p0.vds_hard_V + u * (p1.vds_hard_V - p0.vds_hard_V)).toFixed(1)),
          };
        }
      }
      const last = keyPoints[keyPoints.length - 1];
      return { t_ns: Number(t.toFixed(1)), i_A: 0, vds_sto_V: last.vds_sto_V, vds_hard_V: last.vds_hard_V };
    };

    const faultWaveform: { t_ns: number; i_A: number; vds_sto_V: number; vds_hard_V: number }[] = [];
    const nPts = 64;
    for (let i = 0; i <= nPts; i++) {
      const t = (t_end_ns * i) / nPts;
      faultWaveform.push(evalFaultAtT(t));
    }
    keyPoints.forEach((kp) => faultWaveform.push(evalFaultAtT(kp.t_ns)));
    faultWaveform.sort((a, b) => a.t_ns - b.t_ns);

    return {
      Ipri_pk_nom_A,
      Ipri_rms_A,
      I_ocp_cbc_A,
      I_sc_trip_A,
      R_burden_Ohm,
      R_reset_Ohm,
      P_burden_W,
      ctVoltSec_Vus,
      R_shunt_amc_mOhm,
      P_shunt_amc_W,
      R_shunt_ina_mOhm,
      P_shunt_ina_W,
      activeGain_V_A,
      activeSenseLoss_W,
      V_sense_nom_V,
      V_sense_ocp_V,
      V_sense_sc_V,
      dacCode_ocp,
      dacCode_sc,
      R_leb_Ohm,
      C_leb_pF,
      fc_leb_MHz,
      di_dt_fault_A_us,
      sensorDelay_ns,
      totalPropDelay_ns,
      deltaI_overshoot_A,
      I_fault_pk_A,
      Id_pulsed_limit_A,
      scSafe,
      V_desat_th_V,
      C_blank_pF,
      t_blank_actual_ns,
      R_sto_Ohm,
      t_off_hard_ns,
      t_off_sto_ns,
      V_spike_hard_V,
      V_spike_sto_V,
      vSpikeSafe,
      t_to_sc_ns,
      t_peak_ns,
      t_end_ns,
      faultWaveform,
      evalFaultAtT,
    };
  }, [
    state,
    res,
    senseMode,
    ctTurnsRatio,
    ocpTripMult,
    scTripMult,
    lebTime_ns,
    compDelay_ns,
    desatTargetTime_ns,
    softTurnOffFactor,
  ]);

  return (
    <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-4">
      {/* HEADER BAR */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-rose-400" />
            <h3 className="text-sm font-bold font-mono text-slate-900 dark:text-slate-100">
              Hardware Protection, Current-Sense Network &amp; Desaturation Short-Circuit Synthesizer
            </h3>
            <span
              className={`px-2 py-0.5 text-[11px] font-mono font-semibold rounded inline-flex items-center gap-1 ${
                protAnalysis.scSafe && protAnalysis.vSpikeSafe
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                  : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
              }`}
            >
              {protAnalysis.scSafe && protAnalysis.vSpikeSafe ? (
                <>
                  <ShieldCheck className="w-3.5 h-3.5" /> SOA VERIFIED (I_fault,pk = {protAnalysis.I_fault_pk_A.toFixed(1)}A &lt; {protAnalysis.Id_pulsed_limit_A.toFixed(0)}A Pulsed Limit)
                </>
              ) : (
                <>
                  <AlertTriangle className="w-3.5 h-3.5" /> FAULT OVERSHOOT EXCEEDS SOA ({protAnalysis.I_fault_pk_A.toFixed(1)}A / {protAnalysis.V_spike_sto_V.toFixed(0)}V)
                </>
              )}
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Synthesizes <strong className="text-cyan-400">Primary CT / Isolated Shunt Sensing</strong>,{' '}
            <strong className="text-amber-400">Cycle-by-Cycle Comparator DAC Trip Codes</strong>,{' '}
            <strong className="text-rose-400">Fault Propagation Delay Overshoot (ΔI_prop)</strong>, and{' '}
            <strong className="text-purple-400">Desaturation + Soft Turn-Off (R_STO)</strong> networks.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setViewMode('waveform')}
            className={`px-2.5 py-1 text-[11px] font-mono rounded inline-flex items-center gap-1 cursor-pointer ${
              viewMode === 'waveform'
                ? 'bg-rose-600 text-white font-semibold'
                : 'bg-slate-100 dark:bg-slate-900 text-slate-400 border border-slate-800'
            }`}
          >
            <Activity className="w-3.5 h-3.5" /> Short-Circuit Fault Trajectory &amp; V_ds Spike
          </button>
          <button
            type="button"
            onClick={() => setViewMode('schematic')}
            className={`px-2.5 py-1 text-[11px] font-mono rounded inline-flex items-center gap-1 cursor-pointer ${
              viewMode === 'schematic'
                ? 'bg-cyan-600 text-white font-semibold'
                : 'bg-slate-100 dark:bg-slate-900 text-slate-400 border border-slate-800'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" /> Sense &amp; Desat Schematic + C2000 CMPSS Code
          </button>
          {onOpenPartDrawer && (
            <button
              type="button"
              onClick={onOpenPartDrawer}
              className="px-2.5 py-1 text-[11px] font-mono bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/40 text-cyan-300 rounded inline-flex items-center gap-1 font-semibold cursor-pointer"
            >
              <ExternalLink className="w-3 h-3" /> LCSC Current Sensors
            </button>
          )}
        </div>
      </div>

      {/* ROW 1: CONTROLS & KPI CARDS */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5">
        {/* Left Controls (5 cols) */}
        <div className="lg:col-span-5 bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 rounded-lg p-3.5 space-y-3">
          <div className="text-[13px] font-medium text-slate-900 dark:text-[#eef0f5] flex items-center gap-1.5">
            <Sliders className="w-3.5 h-3.5 text-cyan-500" /> Sensing Architecture &amp; Trip Timing Parameters
          </div>

          <div>
            <div className="flex items-center justify-between gap-1 mb-1">
              <label className="text-[10px] font-mono text-slate-400">
                Current-Sensing Hardware Topology
              </label>
              <LockToggleButton compact locked={senseModeLock.locked} onToggle={senseModeLock.toggleLock} label="Sense Topology" />
            </div>
            <div className="grid grid-cols-3 gap-1">
              {(
                [
                  { id: 'ct-primary', label: 'Primary HF CT', sub: `1:${ctTurnsRatio} Toroid` },
                  { id: 'shunt-amc1302', label: 'Shunt + AMC1302', sub: '±50mV Isolated' },
                  { id: 'shunt-ina240', label: 'Shunt + INA240', sub: '50V/V PWM-Rej' },
                ] as { id: SenseTopologyId; label: string; sub: string }[]
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => senseModeLock.setManual(m.id)}
                  className={`px-2 py-1.5 text-left rounded border transition-colors cursor-pointer ${
                    senseMode === m.id
                      ? 'bg-cyan-600/15 border-cyan-500 text-cyan-300 font-semibold'
                      : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-400'
                  }`}
                >
                  <div className="text-[11px] font-mono">{m.label}</div>
                  <div className="text-[9px] font-mono text-slate-500">{m.sub}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5 pt-1 border-t border-slate-200 dark:border-slate-800">
            <div>
              <div className="flex justify-between items-center text-[10px] font-mono">
                <span className="text-slate-400">CBC OCP Trip Mult</span>
                <div className="inline-flex items-center gap-1">
                  <span className="text-amber-400 font-bold tabular-nums">{(ocpTripMult * 100).toFixed(0)}% ({protAnalysis.I_ocp_cbc_A.toFixed(1)}A)</span>
                  <LockToggleButton compact locked={ocpMultLock.locked} onToggle={ocpMultLock.toggleLock} label="OCP Multiplier" />
                </div>
              </div>
              <input
                type="range"
                min={1.1}
                max={1.6}
                step={0.05}
                value={ocpTripMult}
                onChange={(e) => ocpMultLock.setManual(Number(e.target.value))}
                className="w-full accent-amber-500 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between items-center text-[10px] font-mono">
                <span className="text-slate-400">Hard SC Trip Mult</span>
                <div className="inline-flex items-center gap-1">
                  <span className="text-rose-400 font-bold tabular-nums">{(scTripMult * 100).toFixed(0)}% ({protAnalysis.I_sc_trip_A.toFixed(1)}A)</span>
                  <LockToggleButton compact locked={scMultLock.locked} onToggle={scMultLock.toggleLock} label="SC Trip Multiplier" />
                </div>
              </div>
              <input
                type="range"
                min={1.35}
                max={2.4}
                step={0.05}
                value={scTripMult}
                onChange={(e) => scMultLock.setManual(Number(e.target.value))}
                className="w-full accent-rose-500 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between items-center text-[10px] font-mono">
                <span className="text-slate-400">LEB Filter Blanking</span>
                <div className="inline-flex items-center gap-1">
                  <span className="text-cyan-400 font-bold tabular-nums">{lebTime_ns} ns</span>
                  <LockToggleButton compact locked={lebLock.locked} onToggle={lebLock.toggleLock} label="LEB Time" />
                </div>
              </div>
              <input
                type="range"
                min={40}
                max={350}
                step={10}
                value={lebTime_ns}
                onChange={(e) => lebLock.setManual(Number(e.target.value))}
                className="w-full accent-cyan-500 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between items-center text-[10px] font-mono">
                <span className="text-slate-400">Soft Turn-Off R_STO</span>
                <div className="inline-flex items-center gap-1">
                  <span className="text-purple-400 font-bold tabular-nums">{softTurnOffFactor.toFixed(1)}× ({protAnalysis.R_sto_Ohm}Ω)</span>
                  <LockToggleButton compact locked={stoLock.locked} onToggle={stoLock.toggleLock} label="Soft Turn-Off Factor" />
                </div>
              </div>
              <input
                type="range"
                min={2.0}
                max={12.0}
                step={0.5}
                value={softTurnOffFactor}
                onChange={(e) => stoLock.setManual(Number(e.target.value))}
                className="w-full accent-purple-500 cursor-pointer"
              />
            </div>
          </div>

          {senseMode === 'ct-primary' && (
            <div className="pt-1 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs font-mono">
              <div className="inline-flex items-center gap-1.5">
                <span className="text-slate-400">CT Turns Ratio (1 : N_CT):</span>
                <LockToggleButton compact locked={ctRatioLock.locked} onToggle={ctRatioLock.toggleLock} label="CT Turns Ratio" />
              </div>
              <div className="flex gap-1">
                {[50, 100, 150, 200].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => ctRatioLock.setManual(n)}
                    className={`px-2 py-0.5 text-[11px] rounded border cursor-pointer ${
                      ctTurnsRatio === n
                        ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300 font-bold'
                        : 'bg-slate-900 border-slate-800 text-slate-400'
                    }`}
                  >
                    1:{n}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right KPI Cards (7 cols) */}
        <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Card 1: Synthesized Current Sensor & Comparator DAC */}
          <div className="bg-slate-50 dark:bg-slate-900/70 border border-cyan-500/30 rounded-lg p-3.5 flex flex-col justify-between space-y-2">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-900 dark:text-[#eef0f5]">
                  1. Synthesized Current-Sense Network
                </span>
                <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                  Gain = {(protAnalysis.activeGain_V_A * 1e3).toFixed(1)} mV/A
                </span>
              </div>

              <div className="mt-2 grid grid-cols-2 gap-2 text-xs font-mono">
                <div className="p-2 rounded bg-slate-950/70 border border-slate-800">
                  <div className="text-[10px] text-slate-400">
                    {senseMode === 'ct-primary' ? `CT Burden R_burden (1:${ctTurnsRatio})` : 'Precision Shunt R_shunt'}
                  </div>
                  <div className="text-sm font-bold text-cyan-400">
                    {senseMode === 'ct-primary'
                      ? `${protAnalysis.R_burden_Ohm} Ω`
                      : senseMode === 'shunt-amc1302'
                      ? `${protAnalysis.R_shunt_amc_mOhm} mΩ`
                      : `${protAnalysis.R_shunt_ina_mOhm} mΩ`}
                  </div>
                  <div className="text-[10px] text-slate-500">
                    Sense Loss: {(protAnalysis.activeSenseLoss_W * 1e3).toFixed(0)} mW
                  </div>
                </div>
                <div className="p-2 rounded bg-slate-950/70 border border-slate-800">
                  <div className="text-[10px] text-slate-400">12-Bit Comparator DAC</div>
                  <div className="text-sm font-bold text-emerald-400">
                    OCP: {protAnalysis.dacCode_ocp} / SC: {protAnalysis.dacCode_sc}
                  </div>
                  <div className="text-[10px] text-slate-500">
                    V_ocp={protAnalysis.V_sense_ocp_V.toFixed(2)}V | V_sc={protAnalysis.V_sense_sc_V.toFixed(2)}V
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t border-slate-800 pt-2 text-xs font-mono space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-400">LEB Filter (R_f = {protAnalysis.R_leb_Ohm} Ω, C_f = {protAnalysis.C_leb_pF} pF):</span>
                <span className="text-cyan-300 font-semibold">
                  f_c = {protAnalysis.fc_leb_MHz.toFixed(1)} MHz (t_LEB = {lebTime_ns} ns)
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Nominal Peak Sense Voltage:</span>
                <span className="text-emerald-300 font-semibold">
                  {protAnalysis.V_sense_nom_V.toFixed(2)} V @ I_pk = {protAnalysis.Ipri_pk_nom_A.toFixed(1)} A
                </span>
              </div>
            </div>
          </div>

          {/* Card 2: Short-Circuit Overshoot & Desaturation Protection */}
          <div className="bg-slate-50 dark:bg-slate-900/70 border border-rose-500/30 rounded-lg p-3.5 flex flex-col justify-between space-y-2">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-900 dark:text-[#eef0f5]">
                  2. Fault Propagation Overshoot &amp; Desat
                </span>
                <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-rose-500/15 text-rose-300 border border-rose-500/30">
                  di/dt = {protAnalysis.di_dt_fault_A_us.toFixed(1)} A/µs
                </span>
              </div>

              <div className="mt-2 grid grid-cols-2 gap-2 text-xs font-mono">
                <div className="p-2 rounded bg-slate-950/70 border border-slate-800">
                  <div className="text-[10px] text-slate-400">Peak Fault Current I_fault,pk</div>
                  <div className="text-sm font-bold text-rose-400">
                    {protAnalysis.I_fault_pk_A.toFixed(1)} A
                  </div>
                  <div className="text-[10px] text-slate-500">
                    +{protAnalysis.deltaI_overshoot_A.toFixed(1)}A overshoot in {protAnalysis.totalPropDelay_ns}ns
                  </div>
                </div>
                <div className="p-2 rounded bg-slate-950/70 border border-slate-800">
                  <div className="text-[10px] text-slate-400">Soft Turn-Off V_ds Spike</div>
                  <div className="text-sm font-bold text-purple-400">
                    {protAnalysis.V_spike_sto_V.toFixed(0)} V
                  </div>
                  <div className="text-[10px] text-rose-400">
                    Hard Turn-Off: {protAnalysis.V_spike_hard_V.toFixed(0)} V
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t border-slate-800 pt-2 text-xs font-mono space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-400">Desat Blanking Cap C_blank (500µA → {protAnalysis.V_desat_th_V}V):</span>
                <span className="text-purple-300 font-semibold">
                  {protAnalysis.C_blank_pF} pF (t_blank = {protAnalysis.t_blank_actual_ns.toFixed(0)} ns)
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Soft Turn-Off Resistor R_STO:</span>
                <span className="text-amber-300 font-semibold">
                  {protAnalysis.R_sto_Ohm} Ω (Saves {(protAnalysis.V_spike_hard_V - protAnalysis.V_spike_sto_V).toFixed(0)} V overshoot)
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ROW 2: VISUALIZATION (SHORT-CIRCUIT FAULT TRAJECTORY OR SCHEMATIC + C2000 CODE) */}
      {viewMode === 'waveform' ? (
        <InteractiveChart
          title="Short-Circuit Fault Current Trajectory & Soft Turn-Off (STO) Vds Overshoot"
          subtitle={`t_trip = ${protAnalysis.t_to_sc_ns.toFixed(0)} ns · Δt_prop = ${protAnalysis.totalPropDelay_ns} ns (+${protAnalysis.deltaI_overshoot_A.toFixed(1)} A Overshoot) · I_fault,pk = ${protAnalysis.I_fault_pk_A.toFixed(1)} A`}
          data={protAnalysis.faultWaveform}
          xKey="t_ns"
          xLabel="t"
          xUnit="ns"
          domainEvaluator={protAnalysis.evalFaultAtT}
          currentX={Number(protAnalysis.t_peak_ns.toFixed(1))}
          currentXLabel={`I_pk=${protAnalysis.I_fault_pk_A.toFixed(0)}A`}
          verticalMarkers={[
            {
              x: Number(protAnalysis.t_to_sc_ns.toFixed(1)),
              label: `SC Trip (${protAnalysis.t_to_sc_ns.toFixed(0)}ns)`,
              color: '#f59e0b',
              dashed: true,
            },
          ]}
          horizontalMarkers={[
            {
              value: Number(protAnalysis.I_sc_trip_A.toFixed(1)),
              label: `I_SC = ${protAnalysis.I_sc_trip_A.toFixed(1)} A`,
              color: '#f59e0b',
              axis: 'left',
              dashed: true,
            },
            {
              value: res.priDevice.Vds_max_V,
              label: `V_ds,max = ${res.priDevice.Vds_max_V} V`,
              color: '#f43f5e',
              axis: 'right',
              dashed: true,
            },
          ]}
          series={[
            {
              key: 'i_A',
              name: 'Fault Current i_pri(t)',
              unit: 'A',
              color: '#22d3ee',
              axis: 'left',
            },
            {
              key: 'vds_sto_V',
              name: `Soft Turn-Off V_ds(t) (R_STO=${protAnalysis.R_sto_Ohm}Ω)`,
              unit: 'V',
              color: '#c084fc',
              axis: 'right',
            },
            {
              key: 'vds_hard_V',
              name: 'Hard Turn-Off V_ds(t)',
              unit: 'V',
              color: '#f43f5e',
              axis: 'right',
              dashed: true,
            },
          ]}
        />
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="bg-slate-950 border border-slate-800 rounded-lg p-3.5 space-y-2">
            <div className="text-xs font-mono font-bold text-cyan-400">
              Synthesized C2000 CMPSS &amp; EPWM Trip-Zone Hardware Protection Initialization
            </div>
            <pre className="text-[11px] font-mono text-emerald-300 overflow-x-auto leading-relaxed">
{`// ${senseMode.toUpperCase()} | Gain = ${(protAnalysis.activeGain_V_A * 1e3).toFixed(2)} mV/A
// CBC Limit = ${protAnalysis.I_ocp_cbc_A.toFixed(1)}A (DAC=${protAnalysis.dacCode_ocp}) | SC Trip = ${protAnalysis.I_sc_trip_A.toFixed(1)}A (DAC=${protAnalysis.dacCode_sc})
void Init_CurrentProtection_CMPSS(void) {
    CMPSS_enableModule(CMPSS1_BASE);
    CMPSS_configHighComparator(CMPSS1_BASE, CMPSS_INSRC_DAC);
    CMPSS_setDACValueHigh(CMPSS1_BASE, ${protAnalysis.dacCode_sc}U); // One-Shot SC Fault Latch
    CMPSS_setDACValueLow(CMPSS1_BASE, ${protAnalysis.dacCode_ocp}U);  // Cycle-by-Cycle Current Limit
    // Hardware Digital Filter & Leading-Edge Blanking (${lebTime_ns} ns)
    EPWM_setDigitalCompareBlankingEvent(EPWM1_BASE, EPWM_DC_WINDOW_START_TBCTR_ZERO);
    EPWM_setDigitalCompareWindowLength(EPWM1_BASE, ${Math.round(lebTime_ns / 5)}U);
    EPWM_enableTripZoneSignals(EPWM1_BASE, EPWM_TZ_SIGNAL_DCBEVT1 | EPWM_TZ_SIGNAL_DCAEVT2);
}`}
            </pre>
          </div>

          <div className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-lg p-3.5 space-y-2 text-xs font-mono">
            <div className="font-medium font-sans text-slate-900 dark:text-[#eef0f5]">
              Governing Fault &amp; Desaturation Equations
            </div>
            <div className="p-2 rounded bg-white dark:bg-slate-950 border border-slate-800">
              <MathFormula tex="I_{\text{fault,pk}} = I_{\text{SC,trip}} + \frac{V_{\text{in}}}{L_{\text{lk}}}\left(t_{\text{LEB}} + t_{\text{comp}} + t_{\text{drv}}\right)" />
            </div>
            <div className="p-2 rounded bg-white dark:bg-slate-950 border border-slate-800">
              <MathFormula tex="C_{\text{blank}} = \frac{I_{\text{chg}} \cdot t_{\text{blank}}}{V_{\text{desat,th}}}, \quad V_{\text{ds,spike}} = V_{\text{in}} + L_{\text{stray}}\frac{I_{\text{fault,pk}}}{t_{\text{off}}(R_{\text{STO}})}" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
