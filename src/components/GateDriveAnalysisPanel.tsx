import React, { useState, useMemo } from 'react';
import { DcDcDesignState, SEMICONDUCTOR_DATABASE } from '../data/databases';
import { DcDcResults } from '../engine/dcdcEngine';
import { MathFormula } from './MathFormula';
import { InteractiveChart } from './InteractiveChart';
import { useDesignSolver, useLockableValue } from './DesignSolverContext';
import { LockToggleButton } from './AutoSolverControls';
import {
  Zap,
  Cpu,
  ShieldCheck,
  AlertTriangle,
  Sliders,
  Flame,
  Activity,
  ExternalLink,
} from 'lucide-react';

interface GateDriveAnalysisPanelProps {
  state: DcDcDesignState;
  res: DcDcResults;
  onChange: (next: DcDcDesignState) => void;
  onOpenPartDrawer?: () => void;
}

interface GateDriverIcSpec {
  id: string;
  mpn: string;
  manufacturer: string;
  lcsc: string;
  channels: string;
  I_source_pk_A: number;
  I_sink_pk_A: number;
  R_out_src_Ohm: number;
  R_out_snk_Ohm: number;
  cmti_V_ns: number;
  propDelay_ns: number;
  Rth_JA_CW: number;
  hasMillerClamp: boolean;
  maxP_ic_W: number;
}

const GATE_DRIVER_IC_CATALOG: GateDriverIcSpec[] = [
  {
    id: '1ed3122',
    mpn: '1ED3122MC12H',
    manufacturer: 'Infineon EiceDRIVER',
    lcsc: 'C2845912',
    channels: '1-Ch Isolated (5.7 kVrms)',
    I_source_pk_A: 10.0,
    I_sink_pk_A: 10.0,
    R_out_src_Ohm: 0.85,
    R_out_snk_Ohm: 0.45,
    cmti_V_ns: 100,
    propDelay_ns: 45,
    Rth_JA_CW: 95,
    hasMillerClamp: true,
    maxP_ic_W: 0.85,
  },
  {
    id: 'ucc21520',
    mpn: 'UCC21520ADWR',
    manufacturer: 'Texas Instruments',
    lcsc: 'C193842',
    channels: '2-Ch Isolated Half-Bridge',
    I_source_pk_A: 4.0,
    I_sink_pk_A: 6.0,
    R_out_src_Ohm: 1.2,
    R_out_snk_Ohm: 0.55,
    cmti_V_ns: 100,
    propDelay_ns: 19,
    Rth_JA_CW: 72,
    hasMillerClamp: false,
    maxP_ic_W: 1.15,
  },
  {
    id: 'ucc21750',
    mpn: 'UCC21750QDWRQ1',
    manufacturer: 'Texas Instruments',
    lcsc: 'C2684910',
    channels: '1-Ch Automotive SiC Driver',
    I_source_pk_A: 10.0,
    I_sink_pk_A: 10.0,
    R_out_src_Ohm: 0.7,
    R_out_snk_Ohm: 0.38,
    cmti_V_ns: 150,
    propDelay_ns: 90,
    Rth_JA_CW: 68,
    hasMillerClamp: true,
    maxP_ic_W: 1.25,
  },
  {
    id: 'si8271',
    mpn: 'Si8271GB-IS',
    manufacturer: 'Skyworks / Silicon Labs',
    lcsc: 'C509184',
    channels: '1-Ch Ultra-High CMTI (GaN/SiC)',
    I_source_pk_A: 4.0,
    I_sink_pk_A: 4.0,
    R_out_src_Ohm: 1.35,
    R_out_snk_Ohm: 0.65,
    cmti_V_ns: 200,
    propDelay_ns: 30,
    Rth_JA_CW: 105,
    hasMillerClamp: false,
    maxP_ic_W: 0.75,
  },
];

export const GateDriveAnalysisPanel: React.FC<GateDriveAnalysisPanelProps> = ({
  state,
  res,
  onOpenPartDrawer,
}) => {
  const { setDcdcField, dcdcLocked, toggleDcdcLock, dcdcChanges } = useDesignSolver();
  const priDev = res.priDevice;
  const totalQgPerPos_nC = priDev.Qg_nC * state.nParallelPri;

  // Auto-calculated optimal gate driver & turn-off bias from device technology & gate charge
  const autoDriverId =
    priDev.tech === 'GaN HEMT'
      ? 'si8271'
      : priDev.tech === 'SiC MOSFET' && (state.Pout_W >= 2500 || totalQgPerPos_nC >= 55)
      ? 'ucc21750'
      : totalQgPerPos_nC >= 45
      ? '1ed3122'
      : 'ucc21520';
  const autoVgsOff = priDev.tech === 'SiC MOSFET' ? -4.0 : 0.0;
  const autoSplitRg = priDev.tech === 'SiC MOSFET' || priDev.tech === 'GaN HEMT';
  const autoRgOffRatio = priDev.tech === 'SiC MOSFET' ? 0.5 : priDev.tech === 'GaN HEMT' ? 0.6 : 0.65;
  const autoGateLoop_nH = state.kelvinSourcePri ? 5 : 10;

  const driverLock = useLockableValue<string>(autoDriverId, false);
  const vgsOffLock = useLockableValue<number>(autoVgsOff, false);
  const splitRgLock = useLockableValue<boolean>(autoSplitRg, false);
  const rgOffRatioLock = useLockableValue<number>(autoRgOffRatio, false);
  const gateLoopLock = useLockableValue<number>(autoGateLoop_nH, false);

  const selectedDriverId = driverLock.value;
  const vgsOff_V = vgsOffLock.value;
  const splitRgEnabled = splitRgLock.value;
  const rgOffRatio = rgOffRatioLock.value;
  const gateLoopInductance_nH = gateLoopLock.value;

  const [activeChartTab, setActiveChartTab] = useState<'qg-curve' | 'freq-sweep'>('qg-curve');
  const [includeSecSrDrive, setIncludeSecSrDrive] = useState<boolean>(true);

  const driverIc =
    GATE_DRIVER_IC_CATALOG.find((d) => d.id === selectedDriverId) || GATE_DRIVER_IC_CATALOG[0];

  const gateAnalysis = useMemo(() => {
    const fsw_Hz = state.fsw_kHz * 1e3;
    const nPhases = res.nPhases;
    const isHalfBridge = state.topology === 'llc-hb';
    const nPriPositions = (isHalfBridge ? 2 : 4) * nPhases;
    const nParallelPri = state.nParallelPri;
    const totalPriFets = nPriPositions * nParallelPri;

    // 1. Gate Voltage Swing & Scaled Gate Charge Components
    const Vgs_on_V = Math.max(5.0, state.Vgs_drive_V);
    const Vgs_off_V = vgsOff_V;
    const deltaVgs_V = Vgs_on_V - Vgs_off_V;

    // Nominal datasheet Qg is specified at standard Vgs_nom (18V for SiC, 6V for GaN, 10V for Si)
    const Vgs_datasheet_nom =
      priDev.tech === 'SiC MOSFET' ? 22.0 : priDev.tech === 'GaN HEMT' ? 6.0 : 12.0;
    const qgScale = Math.max(0.65, Math.min(1.45, deltaVgs_V / Vgs_datasheet_nom));

    const Qg_dev_nC = priDev.Qg_nC * qgScale;
    const Qgd_dev_nC =
      priDev.Qgd_nC !== undefined && priDev.Qgd_nC > 0
        ? priDev.Qgd_nC
        : priDev.Qg_nC * (priDev.tech === 'GaN HEMT' ? 0.22 : 0.31);
    const Qgs_dev_nC = Math.min(Qg_dev_nC * 0.42, Math.max(2.0, (Qg_dev_nC - Qgd_dev_nC) * 0.46));
    const Qgs1_th_nC = Qgs_dev_nC * 0.52; // Charge to Vth
    const Qg_overdrive_nC = Math.max(1.0, Qg_dev_nC - Qgs_dev_nC - Qgd_dev_nC);

    const Vth_V = priDev.tech === 'GaN HEMT' ? 1.7 : priDev.tech === 'SiC MOSFET' ? 2.7 : 3.0;
    const Vplateau_V = priDev.tech === 'GaN HEMT' ? 3.2 : priDev.tech === 'SiC MOSFET' ? 4.6 : 4.3;

    // Effective input & Miller capacitances
    const Ciss_eff_pF = ((Qg_dev_nC - Qgd_dev_nC) / Math.max(deltaVgs_V, 4)) * 1e3;
    const Crss_eff_pF = (Qgd_dev_nC / Math.max(state.Vin_nom_V * 0.65, 50)) * 1e3;

    // 2. Gate Loop Resistances (Per Switch Position, accounting for N_parallel devices)
    const Rg_int_dev_Ohm =
      priDev.Rg_int_Ohm !== undefined && priDev.Rg_int_Ohm > 0
        ? priDev.Rg_int_Ohm
        : priDev.tech === 'GaN HEMT'
        ? 1.1
        : 1.8;
    const Rg_int_eff_Ohm = Rg_int_dev_Ohm / nParallelPri;
    const Rg_on_ext_Ohm = Math.max(0.2, state.Rg_ext_Ohm ?? res.Rg_ext_Ohm);
    const Rg_off_ext_Ohm = splitRgEnabled
      ? Number(Math.max(0.2, Rg_on_ext_Ohm * rgOffRatio).toFixed(2))
      : Rg_on_ext_Ohm;

    const R_loop_on_Ohm = driverIc.R_out_src_Ohm + Rg_on_ext_Ohm + Rg_int_eff_Ohm;
    const R_loop_off_Ohm = driverIc.R_out_snk_Ohm + Rg_off_ext_Ohm + Rg_int_eff_Ohm;

    // 3. Peak, Miller Plateau, Average & RMS Gate Drive Currents (Ig)
    const Qg_pos_nC = Qg_dev_nC * nParallelPri;
    const Qgd_pos_nC = Qgd_dev_nC * nParallelPri;

    // Average DC bias current per switch position & total primary bridge
    const Ig_avg_per_pos_mA = Qg_pos_nC * 1e-9 * fsw_Hz * 1e3;
    const Ig_avg_pri_total_mA = Ig_avg_per_pos_mA * nPriPositions;

    // Peak Turn-On & Turn-Off Gate Currents (per switch position)
    const Ig_pk_on_A = deltaVgs_V / R_loop_on_Ohm;
    const Ig_pk_off_A = deltaVgs_V / R_loop_off_Ohm;

    // Miller Plateau Current during Vds transition (determines switching dv/dt!)
    const Ig_miller_on_A = Math.max(0.2, (Vgs_on_V - Vplateau_V) / R_loop_on_Ohm);
    const Ig_miller_off_A = Math.max(0.2, (Vplateau_V - Vgs_off_V) / R_loop_off_Ohm);

    // Miller switching transition times & slew rate dv/dt
    const t_miller_on_ns = (Qgd_pos_nC / Ig_miller_on_A);
    const t_miller_off_ns = (Qgd_pos_nC / Ig_miller_off_A);
    const dv_dt_on_V_ns = state.Vin_nom_V / Math.max(t_miller_on_ns, 2.0);
    const dv_dt_off_V_ns = state.Vin_nom_V / Math.max(t_miller_off_ns, 2.0);

    // Total gate charging time constant tau_on = R_loop_on * Ciss_tot
    const Ciss_pos_nF = (Ciss_eff_pF * nParallelPri) * 1e-3;
    const tau_on_ns = R_loop_on_Ohm * Ciss_pos_nF;
    const tau_off_ns = R_loop_off_Ohm * Ciss_pos_nF;

    // RMS Gate Current per switch position: I_g,rms = sqrt( f_sw * Q_g * DeltaV_gs / R_loop_avg )
    const R_loop_avg_Ohm = 0.5 * (R_loop_on_Ohm + R_loop_off_Ohm);
    const E_gate_pulse_uJ = Qg_pos_nC * 1e-3 * deltaVgs_V; // nC * V = nJ -> *1e-3 = uJ
    const Ig_rms_per_pos_A = Math.sqrt(
      (fsw_Hz * (Qg_pos_nC * 1e-9) * deltaVgs_V) / Math.max(R_loop_avg_Ohm, 0.1)
    );

    // 4. Gate Drive Power (Pg) Partitioning (Driver IC vs External Rg vs Internal MOSFET Rg,int)
    const Pg_per_pos_W = (Qg_pos_nC * 1e-9) * deltaVgs_V * fsw_Hz;
    const Pg_pri_total_W = Pg_per_pos_W * nPriPositions;

    // Partition Turn-On (50% energy) and Turn-Off (50% energy) across series resistors
    const frac_ic_on = driverIc.R_out_src_Ohm / R_loop_on_Ohm;
    const frac_ext_on = Rg_on_ext_Ohm / R_loop_on_Ohm;
    const frac_int_on = Rg_int_eff_Ohm / R_loop_on_Ohm;

    const frac_ic_off = driverIc.R_out_snk_Ohm / R_loop_off_Ohm;
    const frac_ext_off = Rg_off_ext_Ohm / R_loop_off_Ohm;
    const frac_int_off = Rg_int_eff_Ohm / R_loop_off_Ohm;

    const Pg_ic_per_pos_W = Pg_per_pos_W * 0.5 * (frac_ic_on + frac_ic_off);
    const Pg_ext_per_pos_W = Pg_per_pos_W * 0.5 * (frac_ext_on + frac_ext_off);
    const Pg_int_per_pos_W = Pg_per_pos_W * 0.5 * (frac_int_on + frac_int_off);

    const Pg_ic_pri_total_W = Pg_ic_per_pos_W * nPriPositions;
    const Pg_ext_pri_total_W = Pg_ext_per_pos_W * nPriPositions;
    const Pg_int_pri_total_W = Pg_int_per_pos_W * nPriPositions;

    // Secondary Synchronous Rectifier Gate Drive (if Sync MOSFET mode)
    const nSecSwitches = (state.txType === 'full-bridge' ? 4 : 2) * nPhases;
    const Vgs_sec_V = 10.0;
    const Qg_sec_nC = state.rectMode === 'sync-fet' ? res.secDevice.Qg_nC : 0;
    const Ig_avg_sec_total_mA =
      state.rectMode === 'sync-fet' ? nSecSwitches * (Qg_sec_nC * 1e-9) * fsw_Hz * 1e3 : 0;
    const Pg_sec_total_W =
      state.rectMode === 'sync-fet' ? nSecSwitches * (Qg_sec_nC * 1e-9) * Vgs_sec_V * fsw_Hz : 0;

    const Pg_system_total_W = Pg_pri_total_W + (includeSecSrDrive ? Pg_sec_total_W : 0);
    const Ig_avg_system_mA = Ig_avg_pri_total_mA + (includeSecSrDrive ? Ig_avg_sec_total_mA : 0);

    // 5. Parasitic C_gd * dv/dt Miller Shoot-Through Check & Gate Loop Ringing Damping Factor
    // When complementary switch turns on at dv_dt_on_V_ns, displacement current I_miller = Crss * dv/dt flows into gate
    const I_miller_induced_A = (Crss_eff_pF * nParallelPri * 1e-12) * (dv_dt_on_V_ns * 1e9);
    const R_clamp_path_Ohm = driverIc.hasMillerClamp
      ? 0.65 + Rg_int_eff_Ohm
      : driverIc.R_out_snk_Ohm + Rg_off_ext_Ohm + Rg_int_eff_Ohm;
    const Vgs_miller_bounce_V = Vgs_off_V + I_miller_induced_A * R_clamp_path_Ohm;
    const Vth_hot_V = Math.max(1.2, Vth_V - 0.004 * (res.Tj_pri_C - 25));
    const millerMargin_V = Vth_hot_V - Vgs_miller_bounce_V;
    const millerSafe = millerMargin_V >= 0.5;

    // Gate Loop LC Ringing Damping Ratio zeta = (R_loop / 2) * sqrt(C_iss / L_gate)
    const L_gate_H = gateLoopInductance_nH * 1e-9;
    const C_iss_F = Ciss_pos_nF * 1e-9;
    const zeta_gate_on = (R_loop_on_Ohm / 2) * Math.sqrt(C_iss_F / Math.max(L_gate_H, 1e-10));
    const Rg_crit_nonOsc_Ohm = Math.max(
      0.5,
      2 * Math.sqrt(L_gate_H / Math.max(C_iss_F, 1e-12)) - driverIc.R_out_src_Ohm - Rg_int_eff_Ohm
    );

    // Recommended Decoupling / Bootstrap Capacitance (<1% V_gs droop per pulse)
    const C_decouple_min_nF = (Qg_pos_nC / (0.01 * deltaVgs_V));
    const C_decouple_rec_uF = Math.max(0.47, Number((C_decouple_min_nF * 2.5 * 1e-3).toFixed(2)));

    // 6. Piecewise-Linear Vgs(Qg) Curve Points for SVG Chart 1
    const q1 = Qgs1_th_nC * nParallelPri;
    const q2 = Qgs_dev_nC * nParallelPri;
    const q3 = (Qgs_dev_nC + Qgd_dev_nC) * nParallelPri;
    const q4 = Qg_pos_nC;

    const qgCurvePoints = [
      { q_nC: 0, vgs_V: Vgs_off_V, region: 'Start (Off-State)' },
      { q_nC: q1, vgs_V: Vth_V, region: 'Threshold V_th Reached' },
      { q_nC: q2, vgs_V: Vplateau_V, region: 'Miller Plateau Start (dI/dt Done)' },
      { q_nC: q3, vgs_V: Vplateau_V, region: 'Miller Plateau End (V_ds Collapsed)' },
      { q_nC: q4, vgs_V: Vgs_on_V, region: 'Full R_ds,on Enhancement (V_gs,on)' },
    ];

    // 7. Frequency Sweep (20 kHz to 1000 kHz) for SVG Chart 2
    const freqSweep = [];
    for (let i = 0; i <= 48; i++) {
      const f_kHz = 20 + i * 20;
      const f_Hz = f_kHz * 1e3;
      const pg_tot = (Qg_pos_nC * 1e-9) * deltaVgs_V * f_Hz * nPriPositions;
      const pg_ext = pg_tot * 0.5 * (frac_ext_on + frac_ext_off);
      const pg_ic = pg_tot * 0.5 * (frac_ic_on + frac_ic_off);
      const ig_mA = (Qg_pos_nC * 1e-9) * f_Hz * nPriPositions * 1e3;
      freqSweep.push({
        f_kHz,
        pg_tot_W: Number(pg_tot.toFixed(2)),
        pg_ext_W: Number(pg_ext.toFixed(2)),
        pg_ic_W: Number(pg_ic.toFixed(2)),
        ig_mA: Number(ig_mA.toFixed(1)),
      });
    }

    return {
      nPriPositions,
      totalPriFets,
      Vgs_on_V,
      Vgs_off_V,
      deltaVgs_V,
      Qg_dev_nC,
      Qgd_dev_nC,
      Qgs_dev_nC,
      Qg_overdrive_nC,
      Qg_pos_nC,
      Qgd_pos_nC,
      Vth_V,
      Vth_hot_V,
      Vplateau_V,
      Ciss_eff_pF,
      Crss_eff_pF,
      Rg_int_eff_Ohm,
      Rg_on_ext_Ohm,
      Rg_off_ext_Ohm,
      R_loop_on_Ohm,
      R_loop_off_Ohm,
      Ig_avg_per_pos_mA,
      Ig_avg_pri_total_mA,
      Ig_avg_sec_total_mA,
      Ig_avg_system_mA,
      Ig_pk_on_A,
      Ig_pk_off_A,
      Ig_miller_on_A,
      Ig_miller_off_A,
      Ig_rms_per_pos_A,
      t_miller_on_ns,
      t_miller_off_ns,
      dv_dt_on_V_ns,
      dv_dt_off_V_ns,
      tau_on_ns,
      tau_off_ns,
      E_gate_pulse_uJ,
      Pg_per_pos_W,
      Pg_pri_total_W,
      Pg_ic_per_pos_W,
      Pg_ext_per_pos_W,
      Pg_int_per_pos_W,
      Pg_ic_pri_total_W,
      Pg_ext_pri_total_W,
      Pg_int_pri_total_W,
      Pg_sec_total_W,
      Pg_system_total_W,
      I_miller_induced_A,
      Vgs_miller_bounce_V,
      millerMargin_V,
      millerSafe,
      zeta_gate_on,
      Rg_crit_nonOsc_Ohm,
      C_decouple_min_nF,
      C_decouple_rec_uF,
      q1,
      q2,
      q3,
      q4,
      qgCurvePoints,
      freqSweep,
      evalVgsAtQg: (q_nC: number) => {
        if (q_nC <= 0) return Vgs_off_V;
        if (q_nC <= q1) return Vgs_off_V + (q_nC / Math.max(0.1, q1)) * (Vth_V - Vgs_off_V);
        if (q_nC <= q2) return Vth_V + ((q_nC - q1) / Math.max(0.1, q2 - q1)) * (Vplateau_V - Vth_V);
        if (q_nC <= q3) return Vplateau_V;
        if (q_nC <= q4) return Vplateau_V + ((q_nC - q3) / Math.max(0.1, q4 - q3)) * (Vgs_on_V - Vplateau_V);
        return Vgs_on_V + ((q_nC - q4) / Math.max(1, q4)) * 1.5;
      },
      evalFreqSweepAtFsw: (f_kHz: number) => {
        const f_Hz = Math.max(1, f_kHz) * 1e3;
        const pg_tot = (Qg_pos_nC * 1e-9) * deltaVgs_V * f_Hz * nPriPositions;
        const pg_ext = pg_tot * 0.5 * (frac_ext_on + frac_ext_off);
        const pg_ic = pg_tot * 0.5 * (frac_ic_on + frac_ic_off);
        const ig_mA = (Qg_pos_nC * 1e-9) * f_Hz * nPriPositions * 1e3;
        return {
          f_kHz: Number(f_kHz.toFixed(1)),
          pg_tot_W: Number(pg_tot.toFixed(2)),
          pg_ext_W: Number(pg_ext.toFixed(2)),
          pg_ic_W: Number(pg_ic.toFixed(2)),
          ig_mA: Number(ig_mA.toFixed(1)),
        };
      },
    };
  }, [
    state,
    res,
    priDev,
    driverIc,
    vgsOff_V,
    splitRgEnabled,
    rgOffRatio,
    gateLoopInductance_nH,
    includeSecSrDrive,
  ]);

  // SVG Layout Helpers
  const svgW = 840;
  const svgH = 310;
  const padL = 56;
  const padR = 54;
  const padT = 24;
  const padB = 42;
  const plotW = svgW - padL - padR;
  const plotH = svgH - padT - padB;

  return (
    <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-4">
      {/* HEADER BAR */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Cpu className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-bold font-mono text-slate-900 dark:text-slate-100">
              Gate Drive Current (I_g) &amp; Power (P_g) Analysis Module
            </h3>
            <span
              className={`px-2 py-0.5 text-[11px] font-mono font-semibold rounded inline-flex items-center gap-1 ${
                gateAnalysis.millerSafe && gateAnalysis.Ig_pk_on_A <= driverIc.I_source_pk_A
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                  : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
              }`}
            >
              {gateAnalysis.millerSafe ? (
                <>
                  <ShieldCheck className="w-3.5 h-3.5" /> MILLER IMMUNE (Margin +{gateAnalysis.millerMargin_V.toFixed(2)}V to V_th)
                </>
              ) : (
                <>
                  <AlertTriangle className="w-3.5 h-3.5" /> PARASITIC dV/dt SHOOT-THROUGH RISK (Use Negative V_gs,off or Miller Clamp)
                </>
              )}
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Calculates required <strong className="text-cyan-400">Peak / Miller / Average Gate Current (I_g)</strong>,{' '}
            <strong className="text-amber-400">Partitioned Gate Drive Power (P_g)</strong>, and{' '}
            <strong className="text-purple-400">C_gd·dV/dt Shoot-Through Immunity</strong> for{' '}
            <span className="font-mono text-slate-300">
              {gateAnalysis.nPriPositions}× {priDev.id} (Q_g = {gateAnalysis.Qg_dev_nC.toFixed(1)} nC @ ΔV_gs ={' '}
              {gateAnalysis.deltaVgs_V.toFixed(1)} V, f_sw = {state.fsw_kHz} kHz)
            </span>
            .
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              const targetRg = Number(Math.max(1.0, gateAnalysis.Rg_crit_nonOsc_Ohm).toFixed(1));
              setDcdcField('Rg_ext_Ohm', targetRg);
            }}
            className="px-2.5 py-1 text-[11px] font-mono bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 rounded font-semibold cursor-pointer"
          >
            Set Critically-Damped R_g,ext ({gateAnalysis.Rg_crit_nonOsc_Ohm.toFixed(1)} Ω)
          </button>
          {priDev.tech === 'SiC MOSFET' && vgsOff_V >= 0 && (
            <button
              type="button"
              onClick={() => vgsOffLock.setManual(-4.0)}
              className="px-2.5 py-1 text-[11px] font-mono bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/40 text-purple-300 rounded font-semibold cursor-pointer"
            >
              Apply -4V Bipolar Turn-Off Bias (SiC Recommended)
            </button>
          )}
          {onOpenPartDrawer && (
            <button
              type="button"
              onClick={onOpenPartDrawer}
              className="px-2.5 py-1 text-[11px] font-mono bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/40 text-cyan-300 rounded inline-flex items-center gap-1 font-semibold cursor-pointer"
            >
              <ExternalLink className="w-3 h-3" /> LCSC Gate Drivers &amp; FETs
            </button>
          )}
        </div>
      </div>

      {/* ROW 1: CONTROLS & LIVE GATE DRIVE KPI CARDS */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5">
        {/* Left Control Column (5 cols) */}
        <div className="lg:col-span-5 bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 rounded-lg p-3.5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-400 inline-flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5" /> Gate Drive Network &amp; IC Configuration
            </span>
            <span className="text-[11px] font-mono text-slate-400">
              R_g,int = {gateAnalysis.Rg_int_eff_Ohm.toFixed(2)} Ω
            </span>
          </div>

          {/* Primary Switch & Isolated Gate Driver IC Selectors */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <div className="flex items-center justify-between gap-1 mb-0.5">
                <label className="text-[10px] font-mono text-slate-400">
                  Primary Switch (Q_g = {priDev.Qg_nC} nC)
                </label>
                <LockToggleButton
                  compact
                  locked={dcdcLocked.priDeviceId}
                  recentlyAutoUpdated={dcdcChanges.some((c) => c.key === 'priDeviceId')}
                  onToggle={() => toggleDcdcLock('priDeviceId')}
                  label="Primary Switch"
                />
              </div>
              <select
                value={state.priDeviceId}
                onChange={(e) => setDcdcField('priDeviceId', e.target.value)}
                className="w-full px-2 py-1 text-xs font-mono bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded text-slate-200"
              >
                {SEMICONDUCTOR_DATABASE.filter((d) => d.role !== 'secondary').map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.id} (Qg={d.Qg_nC}nC, Rg,int={d.Rg_int_Ohm ?? 1.8}Ω)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between gap-1 mb-0.5">
                <label className="text-[10px] font-mono text-slate-400">
                  Isolated Gate Driver IC
                </label>
                <LockToggleButton
                  compact
                  locked={driverLock.locked}
                  onToggle={driverLock.toggleLock}
                  label="Gate Driver IC"
                />
              </div>
              <select
                value={selectedDriverId}
                onChange={(e) => driverLock.setManual(e.target.value)}
                className="w-full px-2 py-1 text-xs font-mono bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded text-slate-200"
              >
                {GATE_DRIVER_IC_CATALOG.map((ic) => (
                  <option key={ic.id} value={ic.id}>
                    {ic.mpn} ({ic.I_source_pk_A}A/{ic.I_sink_pk_A}A)
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Sliders: Vgs,on, Vgs,off, Rg,on, Switching Frequency */}
          <div className="grid grid-cols-2 gap-2.5 pt-1 border-t border-slate-200 dark:border-slate-800">
            <div>
              <div className="flex justify-between items-center text-[11px] font-mono">
                <span className="text-slate-400">Turn-On V_gs,on</span>
                <div className="inline-flex items-center gap-1">
                  <span className="text-cyan-400 font-bold tabular-nums">+{state.Vgs_drive_V.toFixed(1)} V</span>
                  <LockToggleButton
                    compact
                    locked={dcdcLocked.Vgs_drive_V}
                    recentlyAutoUpdated={dcdcChanges.some((c) => c.key === 'Vgs_drive_V')}
                    onToggle={() => toggleDcdcLock('Vgs_drive_V')}
                    label="Gate Drive Vgs"
                  />
                </div>
              </div>
              <input
                type="range"
                min={5}
                max={20}
                step={0.5}
                value={state.Vgs_drive_V}
                onChange={(e) => setDcdcField('Vgs_drive_V', Number(e.target.value))}
                className="w-full accent-cyan-500 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between items-center text-[11px] font-mono">
                <span className="text-slate-400">Turn-Off V_gs,off</span>
                <div className="inline-flex items-center gap-1">
                  <span className="text-purple-400 font-bold tabular-nums">{vgsOff_V.toFixed(1)} V</span>
                  <LockToggleButton compact locked={vgsOffLock.locked} onToggle={vgsOffLock.toggleLock} label="Vgs Turn-Off" />
                </div>
              </div>
              <input
                type="range"
                min={-6}
                max={0}
                step={0.5}
                value={vgsOff_V}
                onChange={(e) => vgsOffLock.setManual(Number(e.target.value))}
                className="w-full accent-purple-500 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between items-center text-[11px] font-mono">
                <span className="text-slate-400">Ext Gate Res R_g,on</span>
                <div className="inline-flex items-center gap-1">
                  <span className="text-amber-400 font-bold tabular-nums">{(state.Rg_ext_Ohm ?? res.Rg_ext_Ohm).toFixed(1)} Ω</span>
                  <LockToggleButton
                    compact
                    locked={dcdcLocked.Rg_ext_Ohm}
                    recentlyAutoUpdated={dcdcChanges.some((c) => c.key === 'Rg_ext_Ohm')}
                    onToggle={() => toggleDcdcLock('Rg_ext_Ohm')}
                    label="External Gate Rg"
                  />
                </div>
              </div>
              <input
                type="range"
                min={0.5}
                max={22}
                step={0.5}
                value={state.Rg_ext_Ohm ?? res.Rg_ext_Ohm}
                onChange={(e) => setDcdcField('Rg_ext_Ohm', Number(e.target.value))}
                className="w-full accent-amber-500 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between items-center text-[11px] font-mono">
                <span className="text-slate-400">Switching Freq f_sw</span>
                <div className="inline-flex items-center gap-1">
                  <span className="text-emerald-400 font-bold tabular-nums">{state.fsw_kHz} kHz</span>
                  <LockToggleButton
                    compact
                    locked={dcdcLocked.fsw_kHz}
                    recentlyAutoUpdated={dcdcChanges.some((c) => c.key === 'fsw_kHz')}
                    onToggle={() => toggleDcdcLock('fsw_kHz')}
                    label="Switching Freq f_sw"
                  />
                </div>
              </div>
              <input
                type="range"
                min={20}
                max={500}
                step={5}
                value={state.fsw_kHz}
                onChange={(e) => setDcdcField('fsw_kHz', Number(e.target.value))}
                className="w-full accent-emerald-500 cursor-pointer"
              />
            </div>
          </div>

          {/* Split Rg,off & Parasitic Gate Loop Inductance */}
          <div className="grid grid-cols-2 gap-2.5 pt-1 border-t border-slate-200 dark:border-slate-800">
            <div>
              <div className="flex items-center justify-between gap-1">
                <label className="inline-flex items-center gap-1.5 text-[11px] font-mono text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={splitRgEnabled}
                    onChange={(e) => splitRgLock.setManual(e.target.checked)}
                    className="rounded accent-cyan-500"
                  />
                  Split Diode (R_off = {gateAnalysis.Rg_off_ext_Ohm} Ω)
                </label>
                <LockToggleButton compact locked={splitRgLock.locked} onToggle={splitRgLock.toggleLock} label="Split Rg" />
              </div>
              {splitRgEnabled && (
                <div className="flex items-center gap-1.5 mt-1">
                  <input
                    type="range"
                    min={0.25}
                    max={1.0}
                    step={0.05}
                    value={rgOffRatio}
                    onChange={(e) => rgOffRatioLock.setManual(Number(e.target.value))}
                    className="w-full accent-cyan-500 cursor-pointer"
                  />
                  <LockToggleButton compact locked={rgOffRatioLock.locked} onToggle={rgOffRatioLock.toggleLock} label="Rg Off Ratio" />
                </div>
              )}
            </div>

            <div>
              <div className="flex justify-between items-center text-[11px] font-mono">
                <span className="text-slate-400">PCB Gate Loop L_gate</span>
                <div className="inline-flex items-center gap-1">
                  <span className="text-rose-400 font-bold tabular-nums">{gateLoopInductance_nH} nH</span>
                  <LockToggleButton compact locked={gateLoopLock.locked} onToggle={gateLoopLock.toggleLock} label="Gate Loop L_g" />
                </div>
              </div>
              <input
                type="range"
                min={2}
                max={35}
                step={1}
                value={gateLoopInductance_nH}
                onChange={(e) => gateLoopLock.setManual(Number(e.target.value))}
                className="w-full mt-1 accent-rose-500 cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Right KPI Cards (7 cols) */}
        <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Card 1: Gate Current (Ig) Requirements */}
          <div className="bg-slate-50 dark:bg-slate-900/70 border border-cyan-500/30 rounded-lg p-3.5 flex flex-col justify-between space-y-2">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-400">
                  1. Required Gate Drive Current (I_g)
                </span>
                <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                  Q_g,pos = {gateAnalysis.Qg_pos_nC.toFixed(1)} nC
                </span>
              </div>

              <div className="mt-2 grid grid-cols-2 gap-2 text-xs font-mono">
                <div className="p-2 rounded bg-slate-950/70 border border-slate-800">
                  <div className="text-[10px] text-slate-400">Peak Source / Sink I_g,pk</div>
                  <div className="text-sm font-bold text-cyan-400">
                    +{gateAnalysis.Ig_pk_on_A.toFixed(2)} A / -{gateAnalysis.Ig_pk_off_A.toFixed(2)} A
                  </div>
                  <div className="text-[10px] text-slate-500">
                    Driver Rating: {driverIc.I_source_pk_A}A / {driverIc.I_sink_pk_A}A
                  </div>
                </div>
                <div className="p-2 rounded bg-slate-950/70 border border-slate-800">
                  <div className="text-[10px] text-slate-400">Avg DC Bias Supply I_g,avg</div>
                  <div className="text-sm font-bold text-emerald-400">
                    {gateAnalysis.Ig_avg_pri_total_mA.toFixed(1)} mA
                  </div>
                  <div className="text-[10px] text-slate-500">
                    {gateAnalysis.Ig_avg_per_pos_mA.toFixed(2)} mA/ch × {gateAnalysis.nPriPositions} ch
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t border-slate-800 pt-2 text-xs font-mono space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-400">Miller Plateau Current (On / Off):</span>
                <span className="text-cyan-300 font-semibold">
                  +{gateAnalysis.Ig_miller_on_A.toFixed(2)} A / -{gateAnalysis.Ig_miller_off_A.toFixed(2)} A
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">RMS Gate Pulse Current I_g,rms:</span>
                <span className="text-amber-300 font-semibold">
                  {gateAnalysis.Ig_rms_per_pos_A.toFixed(2)} A_rms (per switch pos)
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Miller Slew Rate dV_ds/dt (On / Off):</span>
                <span className="text-purple-300 font-semibold">
                  {gateAnalysis.dv_dt_on_V_ns.toFixed(1)} / {gateAnalysis.dv_dt_off_V_ns.toFixed(1)} V/ns
                </span>
              </div>
            </div>
          </div>

          {/* Card 2: Gate Drive Power (Pg) Breakdown */}
          <div className="bg-slate-50 dark:bg-slate-900/70 border border-amber-500/30 rounded-lg p-3.5 flex flex-col justify-between space-y-2">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-amber-400">
                  2. Gate Drive Power Dissipation (P_g)
                </span>
                <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                  E_pulse = {gateAnalysis.E_gate_pulse_uJ.toFixed(2)} µJ
                </span>
              </div>

              <div className="mt-2 grid grid-cols-2 gap-2 text-xs font-mono">
                <div className="p-2 rounded bg-slate-950/70 border border-slate-800">
                  <div className="text-[10px] text-slate-400">Total Primary Bridge P_g</div>
                  <div className="text-sm font-bold text-amber-400">
                    {gateAnalysis.Pg_pri_total_W.toFixed(2)} W
                  </div>
                  <div className="text-[10px] text-slate-500">
                    {gateAnalysis.Pg_per_pos_W.toFixed(2)} W per switch pos
                  </div>
                </div>
                <div className="p-2 rounded bg-slate-950/70 border border-slate-800">
                  <div className="text-[10px] text-slate-400">Total System P_g (Pri + SR)</div>
                  <div className="text-sm font-bold text-emerald-400">
                    {gateAnalysis.Pg_system_total_W.toFixed(2)} W
                  </div>
                  <div className="text-[10px] text-slate-500">
                    SR Gate: {gateAnalysis.Pg_sec_total_W.toFixed(2)} W ({gateAnalysis.Ig_avg_sec_total_mA.toFixed(0)} mA)
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t border-slate-800 pt-2 text-xs font-mono space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-400">External Resistor P_g,ext (Total / Per Ch):</span>
                <span className="text-amber-300 font-semibold">
                  {gateAnalysis.Pg_ext_pri_total_W.toFixed(2)} W ({gateAnalysis.Pg_ext_per_pos_W.toFixed(2)} W/ch)
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Driver IC Internal Dissipation P_g,IC:</span>
                <span className="text-cyan-300 font-semibold">
                  {gateAnalysis.Pg_ic_pri_total_W.toFixed(2)} W ({gateAnalysis.Pg_ic_per_pos_W.toFixed(2)} W/IC)
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">MOSFET Internal Gate Mesh P_g,int:</span>
                <span className="text-purple-300 font-semibold">
                  {gateAnalysis.Pg_int_pri_total_W.toFixed(2)} W ({gateAnalysis.Pg_int_per_pos_W.toFixed(2)} W/pos)
                </span>
              </div>
            </div>
          </div>

          {/* Card 3: Miller dV/dt Shoot-Through & Gate Loop Damping Bar */}
          <div className="sm:col-span-2 bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 rounded-lg p-3 flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-0.5 text-xs font-mono">
              <div className="font-bold text-slate-200 flex items-center gap-2">
                <span>
                  Parasitic Miller Bounce:{' '}
                  <strong className={gateAnalysis.millerSafe ? 'text-emerald-400' : 'text-rose-400'}>
                    V_gs,bounce = {gateAnalysis.Vgs_miller_bounce_V.toFixed(2)} V
                  </strong>{' '}
                  vs Hot Threshold <strong className="text-cyan-300">V_th(Tj) = {gateAnalysis.Vth_hot_V.toFixed(2)} V</strong>
                </span>
              </div>
              <div className="text-[11px] text-slate-400">
                Gate Loop Damping Factor{' '}
                <strong className={gateAnalysis.zeta_gate_on >= 0.7 ? 'text-emerald-400' : 'text-amber-400'}>
                  ζ_gate = {gateAnalysis.zeta_gate_on.toFixed(2)}
                </strong>{' '}
                (L_gate={gateLoopInductance_nH}nH, C_iss={(gateAnalysis.Ciss_eff_pF * state.nParallelPri / 1e3).toFixed(2)}nF) ·
                Rec. Local C_decouple ≥ <strong className="text-cyan-300">{gateAnalysis.C_decouple_rec_uF} µF</strong> C0G/X7R
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ROW 2: INTERACTIVE SVG CHARTS (V_GS vs Q_G TRAJECTORY & P_G / I_G vs FREQUENCY SWEEP) */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setActiveChartTab('qg-curve')}
              className={`px-3 py-1.5 text-xs font-mono rounded inline-flex items-center gap-1.5 cursor-pointer ${
                activeChartTab === 'qg-curve'
                  ? 'bg-cyan-600 text-white font-semibold'
                  : 'bg-slate-100 dark:bg-slate-900 text-slate-400 border border-slate-800'
              }`}
            >
              <Zap className="w-3.5 h-3.5" /> 1. Gate Charge V_gs(Q_g) Trajectory &amp; Miller Plateau Breakdown
            </button>
            <button
              type="button"
              onClick={() => setActiveChartTab('freq-sweep')}
              className={`px-3 py-1.5 text-xs font-mono rounded inline-flex items-center gap-1.5 cursor-pointer ${
                activeChartTab === 'freq-sweep'
                  ? 'bg-amber-600 text-white font-semibold'
                  : 'bg-slate-100 dark:bg-slate-900 text-slate-400 border border-slate-800'
              }`}
            >
              <Activity className="w-3.5 h-3.5" /> 2. Gate Drive Power P_g(f_sw) &amp; Bias Current I_g(f_sw) vs Frequency
            </button>
          </div>

          <div className="text-[11px] font-mono text-slate-400">
            Q_gs = <strong className="text-cyan-300">{(gateAnalysis.Qgs_dev_nC * state.nParallelPri).toFixed(1)} nC</strong> ·
            Q_gd (Miller) = <strong className="text-amber-300">{gateAnalysis.Qgd_pos_nC.toFixed(1)} nC</strong> ·
            Q_od = <strong className="text-emerald-300">{(gateAnalysis.Qg_overdrive_nC * state.nParallelPri).toFixed(1)} nC</strong>
          </div>
        </div>

        {/* CHART 1: PIECEWISE-LINEAR GATE CHARGE CURVE V_gs(Q_g) — INTERACTIVE ZOOM & PAN */}
        {activeChartTab === 'qg-curve' && (
          <InteractiveChart
            title={`Gate Charge Trajectory V_gs(Q_g) & Miller Plateau (${priDev.id} × ${state.nParallelPri})`}
            subtitle={`Drag on chart or click + / - to Zoom In / Out · Miller Q_gd = ${gateAnalysis.Qgd_pos_nC.toFixed(1)} nC @ V_plat = ${gateAnalysis.Vplateau_V.toFixed(1)} V · Total Q_g = ${gateAnalysis.Qg_pos_nC.toFixed(1)} nC`}
            xLabel="Total Gate Charge Q_g"
            xUnit="nC"
            minPhysX={0}
            maxPhysX={Math.max(50, gateAnalysis.Qg_pos_nC * 2)}
            domainEvaluator={(q_nC) => ({
              vgs_V: Number(gateAnalysis.evalVgsAtQg(q_nC).toFixed(2)),
            })}
            verticalMarkers={[
              {
                x: Number(gateAnalysis.q1.toFixed(1)),
                label: `Q_th (${gateAnalysis.q1.toFixed(1)} nC)`,
                color: '#10b981',
              },
              {
                x: Number(gateAnalysis.q2.toFixed(1)),
                label: `Miller Start Q_gs (${gateAnalysis.q2.toFixed(1)} nC)`,
                color: '#f59e0b',
              },
              {
                x: Number(gateAnalysis.q3.toFixed(1)),
                label: `Miller End Q_gs+Q_gd (${gateAnalysis.q3.toFixed(1)} nC)`,
                color: '#f43f5e',
              },
            ]}
            horizontalMarkers={[
              {
                value: Number(gateAnalysis.Vth_V.toFixed(2)),
                label: `Threshold V_th (${gateAnalysis.Vth_V.toFixed(1)} V)`,
                color: '#10b981',
                axis: 'left',
              },
              {
                value: Number(gateAnalysis.Vplateau_V.toFixed(2)),
                label: `Miller Plateau (${gateAnalysis.Vplateau_V.toFixed(1)} V)`,
                color: '#f59e0b',
                axis: 'left',
              },
            ]}
            data={gateAnalysis.qgCurvePoints.map((p) => ({
              x: p.q_nC,
              vgs_V: p.vgs_V,
            }))}
            series={[
              {
                key: 'vgs_V',
                label: 'Gate-Source Voltage V_gs(Q_g)',
                unit: 'V',
                color: '#22d3ee',
                axis: 'left',
              },
            ]}
          />
        )}

        {/* CHART 2: GATE DRIVE POWER P_g(f_sw) & BIAS CURRENT I_g(f_sw) VS FREQUENCY — INTERACTIVE ZOOM & PAN */}
        {activeChartTab === 'freq-sweep' && (
          <InteractiveChart
            title="Gate Drive Power P_g(f_sw) & Supply Current I_g(f_sw) vs. Switching Frequency"
            subtitle={`Drag on chart or click + / - to Zoom In / Out · Click anywhere to set f_sw · Active f_sw = ${state.fsw_kHz} kHz (P_g = ${gateAnalysis.Pg_pri_total_W.toFixed(2)} W, I_g = ${gateAnalysis.Ig_avg_pri_total_mA.toFixed(1)} mA)`}
            xLabel="Switching Frequency f_sw"
            xUnit="kHz"
            minPhysX={10}
            maxPhysX={2000}
            currentX={state.fsw_kHz}
            currentXLabel={`f_sw=${state.fsw_kHz}kHz`}
            onSelectX={(f_kHz) =>
              setDcdcField('fsw_kHz', Math.max(20, Math.min(500, Math.round(f_kHz / 5) * 5)))
            }
            domainEvaluator={(f_kHz) => {
              const r = gateAnalysis.evalFreqSweepAtFsw(f_kHz);
              return {
                pg_tot_W: r.pg_tot_W,
                pg_ext_W: r.pg_ext_W,
                pg_ic_W: r.pg_ic_W,
                ig_mA: r.ig_mA,
              };
            }}
            data={gateAnalysis.freqSweep.map((pt) => ({
              x: pt.f_kHz,
              pg_tot_W: pt.pg_tot_W,
              pg_ext_W: pt.pg_ext_W,
              pg_ic_W: pt.pg_ic_W,
              ig_mA: pt.ig_mA,
            }))}
            series={[
              {
                key: 'pg_tot_W',
                label: 'Total Primary Gate Power P_g,tot',
                unit: 'W',
                color: '#f59e0b',
                axis: 'left',
              },
              {
                key: 'pg_ext_W',
                label: 'External Resistor Power P_g,ext',
                unit: 'W',
                color: '#fb7185',
                axis: 'left',
                dashed: true,
              },
              {
                key: 'pg_ic_W',
                label: 'Driver IC Internal Dissipation P_g,IC',
                unit: 'W',
                color: '#c084fc',
                axis: 'left',
                dashed: true,
              },
              {
                key: 'ig_mA',
                label: 'Total Gate Bias Current I_g,avg',
                unit: 'mA',
                color: '#22d3ee',
                axis: 'right',
              },
            ]}
          />
        )}
      </div>

      {/* ROW 3: GOVERNING GATE DRIVE EQUATIONS & COMMERCIAL DRIVER IC COMPATIBILITY TABLE */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <div className="xl:col-span-5 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-lg p-3.5 space-y-2">
          <div className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
            <Flame className="w-3.5 h-3.5" /> Governing Gate Current &amp; Power Equations
          </div>
          <div className="p-2 rounded bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
            <MathFormula tex="I_{g,\text{avg}} = N_{\text{sw}} Q_g f_{\text{sw}}, \quad I_{g,\text{pk,on/off}} = \frac{V_{\text{gs,on}} - V_{\text{gs,off}}}{R_{\text{drv}} + R_{g,\text{ext}} + R_{g,\text{int}}}" />
          </div>
          <div className="p-2 rounded bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
            <MathFormula tex="P_{g,\text{tot}} = N_{\text{sw}} Q_g \Delta V_{\text{gs}} f_{\text{sw}} = P_{g,\text{IC}} + P_{g,\text{ext}} + P_{g,\text{int}}" />
          </div>
          <div className="p-2 rounded bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
            <MathFormula tex="P_{g,\text{ext}} = P_{g,\text{tot}} \frac{R_{g,\text{ext}}}{R_{\text{drv}} + R_{g,\text{ext}} + R_{g,\text{int}}}, \quad I_{g,\text{Miller}} = \frac{V_{\text{gs,on}} - V_{\text{plat}}}{R_{\text{loop,on}}}" />
          </div>
        </div>

        <div className="xl:col-span-7 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-lg p-3.5">
          <div className="text-xs font-mono font-bold uppercase tracking-wider text-emerald-400 mb-2">
            Isolated Gate Driver IC Sizing &amp; Thermal Verification Benchmark ({state.fsw_kHz} kHz)
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs font-mono">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                  <th className="py-1.5 pr-2">Driver IC / LCSC</th>
                  <th className="py-1.5 pr-2">Peak Source/Sink</th>
                  <th className="py-1.5 pr-2">Actual I_g,pk</th>
                  <th className="py-1.5 pr-2">IC Dissipation P_IC</th>
                  <th className="py-1.5 pr-2">Miller Clamp</th>
                  <th className="py-1.5">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800/70">
                {GATE_DRIVER_IC_CATALOG.map((ic) => {
                  const rOn = ic.R_out_src_Ohm + gateAnalysis.Rg_on_ext_Ohm + gateAnalysis.Rg_int_eff_Ohm;
                  const rOff = ic.R_out_snk_Ohm + gateAnalysis.Rg_off_ext_Ohm + gateAnalysis.Rg_int_eff_Ohm;
                  const igOn = gateAnalysis.deltaVgs_V / rOn;
                  const igOff = gateAnalysis.deltaVgs_V / rOff;
                  const pIc =
                    gateAnalysis.Pg_per_pos_W *
                    0.5 *
                    (ic.R_out_src_Ohm / rOn + ic.R_out_snk_Ohm / rOff);
                  const currentOk = igOn <= ic.I_source_pk_A && igOff <= ic.I_sink_pk_A;
                  const isSelected = ic.id === selectedDriverId;

                  return (
                    <tr
                      key={ic.id}
                      className={isSelected ? 'bg-cyan-500/10' : 'hover:bg-slate-900/40'}
                    >
                      <td className="py-2 pr-2">
                        <div className="font-bold text-slate-200">{ic.mpn}</div>
                        <div className="text-[10px] text-slate-400">
                          {ic.manufacturer} ·{' '}
                          <a
                            href={`https://www.lcsc.com/search?q=${encodeURIComponent(ic.lcsc)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-cyan-400 underline"
                          >
                            {ic.lcsc}
                          </a>
                        </div>
                      </td>
                      <td className="py-2 pr-2 text-cyan-300">
                        +{ic.I_source_pk_A}A / -{ic.I_sink_pk_A}A
                      </td>
                      <td className="py-2 pr-2">
                        <span className={currentOk ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-bold'}>
                          +{igOn.toFixed(2)}A / -{igOff.toFixed(2)}A
                        </span>
                      </td>
                      <td className="py-2 pr-2 text-amber-300">
                        {(pIc * 1e3).toFixed(0)} mW/ch (+{(pIc * ic.Rth_JA_CW).toFixed(1)}°C)
                      </td>
                      <td className="py-2 pr-2">
                        {ic.hasMillerClamp ? (
                          <span className="px-1.5 py-0.5 text-[10px] rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                            Active Clamp
                          </span>
                        ) : (
                          <span className="text-slate-500 text-[10px]">External Rg,off</span>
                        )}
                      </td>
                      <td className="py-2">
                        <button
                          type="button"
                          onClick={() => driverLock.setManual(ic.id)}
                          className={`px-2 py-0.5 text-[10px] rounded cursor-pointer ${
                            isSelected
                              ? 'bg-cyan-600 text-white font-semibold'
                              : 'bg-slate-800 text-slate-300 hover:bg-cyan-600 hover:text-white'
                          }`}
                        >
                          {isSelected ? 'Selected' : 'Select IC'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
