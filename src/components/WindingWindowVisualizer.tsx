import React, { useState, useMemo } from 'react';
import { CoreSpec, DcDcDesignState, CORE_DATABASE } from '../data/databases';
import { DcDcResults } from '../engine/dcdcEngine';
import { rankTransformerCoresForDcDc } from '../engine/passiveDesignEngine';
import { useDesignSolver, useLockableValue } from './DesignSolverContext';
import { LockToggleButton } from './AutoSolverControls';
import { InteractiveChart } from './InteractiveChart';
import {
  Layers,
  Sliders,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Wrench,
  ArrowUpRight,
  Info,
} from 'lucide-react';

interface WindingWindowVisualizerProps {
  state: DcDcDesignState;
  res: DcDcResults;
  onChange: (next: DcDcDesignState) => void;
}

export type ConductorFormMode = 'auto-parallel' | 'round-litz' | 'flat-ribbon' | 'sec-foil';
export type GapStrategyMode = 'local-notch' | 'distributed-multigap' | 'full-radial';

const AWG_DIAM_MM: Record<number, number> = {
  36: 0.127,
  38: 0.1016,
  40: 0.0787,
  42: 0.0635,
  44: 0.0508,
};

const AWG_AREA_MM2: Record<number, number> = {
  36: 0.0127,
  38: 0.00811,
  40: 0.00487,
  42: 0.00317,
  44: 0.00202,
};

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export interface WindingLayerVisual {
  index: number;
  role: 'primary' | 'secondary';
  label: string;
  turns: number;
  parallelInHand: number;
  visualStyle: 'round' | 'ribbon' | 'foil';
  bundleDiam_mm: number; // radial thickness of this layer
  axialPitch_mm: number; // axial width consumed per electrical turn
  xStart_mm: number;
  xEnd_mm: number;
  mmfStart_At: number;
  mmfEnd_At: number;
  inFringingZone: boolean;
}

export interface WindowBudgetBreakdown {
  bobbin_mm: number;
  gapSpacer_mm: number;
  priCopper_mm: number;
  secCopper_mm: number;
  insulation_mm: number;
  total_mm: number;
  safeLimit_mm: number;
  hw_mm: number;
}

export interface WindowSolverAction {
  id: string;
  title: string;
  tradeoffNote: string;
  category: 'packing' | 'gap' | 'core' | 'interleaving' | 'wire';
  predictedBuild_mm: number;
  predictedFill_pct: number;
  unlocksField?: string;
  apply: () => void;
}

interface PackedSectionResult {
  visualStyle: 'round' | 'ribbon' | 'foil';
  parallelInHand: number;
  radialThickness_mm: number;
  axialPitch_mm: number;
  turnsPerLayer: number;
  numSubLayers: number;
  nominalRoundDiam_mm: number;
  axialUtilization_pct: number;
}

function packWindingSection(
  turns: number,
  totalStrands: number,
  strandDiam_mm: number,
  b_eff_mm: number,
  role: 'primary' | 'secondary',
  mode: ConductorFormMode
): PackedSectionResult {
  const strandArea = Math.PI * Math.pow(strandDiam_mm / 2, 2);
  const nominalRoundDiam_mm = Number((Math.sqrt(totalStrands) * strandDiam_mm * 1.28).toFixed(2));

  // Copper Foil mode on Secondary (ideal for 2-10T high-current secondaries)
  if (role === 'secondary' && mode === 'sec-foil' && turns <= 16) {
    const cuAreaTurn = totalStrands * strandArea;
    const foilWidth = Math.max(4.0, b_eff_mm * 0.86);
    const foilThick = clamp(cuAreaTurn / foilWidth, 0.15, 1.1);
    const layerHeight = Number((foilThick + 0.06).toFixed(2)); // Cu + 0.06mm Mylar film
    return {
      visualStyle: 'foil',
      parallelInHand: 1,
      radialThickness_mm: layerHeight,
      axialPitch_mm: Number(foilWidth.toFixed(2)),
      turnsPerLayer: 1,
      numSubLayers: turns,
      nominalRoundDiam_mm,
      axialUtilization_pct: Number(((foilWidth / b_eff_mm) * 100).toFixed(0)),
    };
  }

  // Round Litz Rope baseline (no parallel axial splitting)
  if (mode === 'round-litz') {
    const tPerLayer = Math.max(1, Math.floor(b_eff_mm / Math.max(0.25, nominalRoundDiam_mm)));
    const numLayers = Math.max(1, Math.ceil(turns / tPerLayer));
    const axUtil = (Math.min(turns, tPerLayer) * nominalRoundDiam_mm) / b_eff_mm;
    return {
      visualStyle: 'round',
      parallelInHand: 1,
      radialThickness_mm: nominalRoundDiam_mm,
      axialPitch_mm: nominalRoundDiam_mm,
      turnsPerLayer: tPerLayer,
      numSubLayers: numLayers,
      nominalRoundDiam_mm,
      axialUtilization_pct: Number((axUtil * 100).toFixed(0)),
    };
  }

  // 'flat-ribbon' or 'auto-parallel': optimize parallel sub-bundles laid side-by-side along b_eff_mm
  const allowMultiHand =
    mode === 'flat-ribbon' || (mode === 'auto-parallel' && totalStrands >= 70 && nominalRoundDiam_mm >= 1.25);

  if (!allowMultiHand) {
    const tPerLayer = Math.max(1, Math.floor(b_eff_mm / Math.max(0.25, nominalRoundDiam_mm)));
    const numLayers = Math.max(1, Math.ceil(turns / tPerLayer));
    const axUtil = (Math.min(turns, tPerLayer) * nominalRoundDiam_mm) / b_eff_mm;
    return {
      visualStyle: 'round',
      parallelInHand: 1,
      radialThickness_mm: nominalRoundDiam_mm,
      axialPitch_mm: nominalRoundDiam_mm,
      turnsPerLayer: tPerLayer,
      numSubLayers: numLayers,
      nominalRoundDiam_mm,
      axialUtilization_pct: Number((axUtil * 100).toFixed(0)),
    };
  }

  let bestOption: PackedSectionResult | null = null;
  let bestScore = Infinity;

  const maxK = Math.min(6, Math.max(1, Math.floor(totalStrands / 24)));
  for (let k = 1; k <= maxK; k++) {
    const strandsPerSub = Math.ceil(totalStrands / k);
    const d_sub = Math.sqrt(strandsPerSub) * strandDiam_mm * 1.24;
    const flattenFactor = mode === 'flat-ribbon' || k >= 2 ? 1.26 : 1.0;
    const subWidth = d_sub * (mode === 'flat-ribbon' || k >= 2 ? 1.18 : 1.0);
    const subHeight = Number((d_sub / flattenFactor).toFixed(2));
    const axialPitch = Number((k * subWidth + (k - 1) * 0.06).toFixed(2));

    const tPerLayer = Math.max(1, Math.floor(b_eff_mm / Math.max(0.3, axialPitch)));
    const numLayers = Math.max(1, Math.ceil(turns / tPerLayer));
    const totalStack_mm = numLayers * subHeight + Math.max(0, numLayers - 1) * 0.08;
    const axUtil = (Math.min(turns, tPerLayer) * axialPitch) / b_eff_mm;

    // Penalize over-splitting beyond 94% axial fill or unnecessarily splitting if height gain is tiny
    const score = totalStack_mm + k * 0.03 + (axUtil > 0.94 ? 3.0 : 0);
    if (score < bestScore) {
      bestScore = score;
      bestOption = {
        visualStyle: k >= 2 || mode === 'flat-ribbon' ? 'ribbon' : 'round',
        parallelInHand: k,
        radialThickness_mm: subHeight,
        axialPitch_mm: axialPitch,
        turnsPerLayer: tPerLayer,
        numSubLayers: numLayers,
        nominalRoundDiam_mm,
        axialUtilization_pct: Number((axUtil * 100).toFixed(0)),
      };
    }
  }

  return bestOption!;
}

export interface WindowAnalysisResult {
  bw_mm: number;
  hw_mm: number;
  b_eff_mm: number;
  airGap_mm: number;
  h_ins_mm: number;
  d_bundle_pri_mm: number;
  d_bundle_sec_mm: number;
  priPack: PackedSectionResult;
  secPack: PackedSectionResult;
  gapKeepoutRadius_mm: number;
  radialGapOffset_mm: number;
  F_fringe: number;
  layers: WindingLayerVisual[];
  budget: WindowBudgetBreakdown;
  totalRadialBuild_mm: number;
  radialFill_pct: number;
  radialMargin_mm: number;
  fitsInWindow: boolean;
  isTightMargin: boolean;
  peakMmf_At: number;
  nonInterleavedPeakMmf_At: number;
  mmfReductionRatio: number;
  P_fringe_eddy_W: number;
  reqCreepage_mm: number;
  actualCreepage_mm: number;
  creepagePass: boolean;
  rootCauseSummary: string;
  spatialMmfCurve: {
    x_mm: number;
    mmf_At: number;
    absMmf_At: number;
    hField_kA_m: number;
  }[];
  evalSpatialMmfAtX: (x_mm_raw: number) => {
    x_mm: number;
    mmf_At: number;
    absMmf_At: number;
    hField_kA_m: number;
  };
}

export function computeWindowAnalysis(params: {
  core: CoreSpec;
  Vin_nom_V: number;
  interleaving: 'none' | 'split-pri' | 'full-interleaved';
  txType: DcDcDesignState['txType'];
  Np: number;
  Ns_single: number;
  priStrands: number;
  secStrands: number;
  strandDiam_mm: number;
  insulationThickness_mm: number;
  airGap_mm: number;
  I_pri_pk: number;
  Pcu_W: number;
  marginTape_mm: number;
  bobbinThickness_mm: number;
  conductorForm: ConductorFormMode;
  gapStrategy: GapStrategyMode;
}): WindowAnalysisResult {
  const {
    core,
    Vin_nom_V,
    interleaving,
    txType,
    Np,
    Ns_single,
    priStrands,
    secStrands,
    strandDiam_mm,
    insulationThickness_mm,
    airGap_mm,
    I_pri_pk,
    Pcu_W,
    marginTape_mm,
    bobbinThickness_mm,
    conductorForm,
    gapStrategy,
  } = params;

  const bw_mm = core.bw_mm;
  const hw_mm = core.hw_mm;
  const h_ins_mm = Math.max(0.05, insulationThickness_mm);
  const b_eff_mm = Math.max(4.0, bw_mm - 2 * marginTape_mm);

  // Air-gap fringing keep-out radius depending on construction strategy
  const effectiveSingleGap_mm =
    gapStrategy === 'distributed-multigap' ? airGap_mm * 0.45 : airGap_mm;
  const gapKeepoutRadius_mm =
    airGap_mm > 0.02 ? Number(Math.max(0.35, effectiveSingleGap_mm * 2.1).toFixed(2)) : 0;

  // Radial offset pushed across whole bobbin:
  // 'full-radial': 1.0 * gapKeepoutRadius
  // 'distributed-multigap': smaller individual gap fringes (~45% radial radius, min 0.4mm wafer)
  // 'local-notch': keeps only localized axial gap band recessed; turns clear bobbin with 0.25 * r_keepout capped
  const radialGapOffset_mm =
    airGap_mm <= 0.02
      ? 0
      : gapStrategy === 'full-radial'
      ? gapKeepoutRadius_mm
      : gapStrategy === 'distributed-multigap'
      ? Number(Math.min(1.6, gapKeepoutRadius_mm).toFixed(2))
      : Number(Math.min(0.45, gapKeepoutRadius_mm * 0.25).toFixed(2));

  const F_fringe =
    airGap_mm > 0.02
      ? 1 +
        (effectiveSingleGap_mm / Math.sqrt(core.Ae_mm2)) *
          Math.log((2 * bw_mm) / Math.max(effectiveSingleGap_mm, 0.05))
      : 1.0;

  // Representative packing for Pri & Sec
  const Ns = Ns_single * (txType === 'center-tapped' ? 2 : 1);
  const priSectionTurns = interleaving === 'none' ? Np : Math.ceil(Np / 2);
  const secSectionTurns = interleaving === 'full-interleaved' ? Math.ceil(Ns / 2) : Ns;

  const priPack = packWindingSection(
    priSectionTurns,
    priStrands,
    strandDiam_mm,
    b_eff_mm,
    'primary',
    conductorForm
  );
  const secPack = packWindingSection(
    secSectionTurns,
    secStrands,
    strandDiam_mm,
    b_eff_mm,
    'secondary',
    conductorForm
  );

  const sections: { role: 'primary' | 'secondary'; turns: number; label: string }[] = [];
  if (interleaving === 'none') {
    sections.push({ role: 'primary', turns: Np, label: `Primary P1 (${Np}T)` });
    sections.push({ role: 'secondary', turns: Ns, label: `Secondary S1 (${Ns}T)` });
  } else if (interleaving === 'split-pri') {
    const np1 = Math.ceil(Np / 2);
    const np2 = Math.max(1, Np - np1);
    sections.push({ role: 'primary', turns: np1, label: `Primary P1a (${np1}T)` });
    sections.push({ role: 'secondary', turns: Ns, label: `Secondary S1 (${Ns}T)` });
    sections.push({ role: 'primary', turns: np2, label: `Primary P1b (${np2}T)` });
  } else {
    const np1 = Math.ceil(Np / 2);
    const np2 = Math.max(1, Np - np1);
    const ns1 = Math.ceil(Ns / 2);
    const ns2 = Math.max(1, Ns - ns1);
    sections.push({ role: 'primary', turns: np1, label: `Primary P1a (${np1}T)` });
    sections.push({ role: 'secondary', turns: ns1, label: `Secondary S1a (${ns1}T)` });
    sections.push({ role: 'primary', turns: np2, label: `Primary P1b (${np2}T)` });
    sections.push({ role: 'secondary', turns: ns2, label: `Secondary S1b (${ns2}T)` });
  }

  const layers: WindingLayerVisual[] = [];
  let currentX_mm = bobbinThickness_mm + radialGapOffset_mm;
  let currentMmf_At = 0;
  const totalPriAt = Np * I_pri_pk;

  let priCopper_mm = 0;
  let secCopper_mm = 0;
  let insulation_mm = 0;

  sections.forEach((sec, secIdx) => {
    const packed = packWindingSection(
      sec.turns,
      sec.role === 'primary' ? priStrands : secStrands,
      strandDiam_mm,
      b_eff_mm,
      sec.role,
      conductorForm
    );

    const numSubLayers = packed.numSubLayers;
    let turnsRemaining = sec.turns;

    for (let sub = 0; sub < numSubLayers; sub++) {
      const turnsInLayer =
        sub === numSubLayers - 1
          ? turnsRemaining
          : Math.min(turnsRemaining, Math.ceil(sec.turns / numSubLayers));
      turnsRemaining = Math.max(0, turnsRemaining - turnsInLayer);

      const xStart = currentX_mm;
      const xEnd = xStart + packed.radialThickness_mm;
      const deltaMmf =
        sec.role === 'primary'
          ? (turnsInLayer / Math.max(1, Np)) * totalPriAt
          : -(turnsInLayer / Math.max(1, Ns)) * totalPriAt;
      const mmfStart = currentMmf_At;
      const mmfEnd = mmfStart + deltaMmf;

      if (sec.role === 'primary') priCopper_mm += packed.radialThickness_mm;
      else secCopper_mm += packed.radialThickness_mm;

      const parallelBadge = packed.parallelInHand > 1 ? ` · ${packed.parallelInHand}×par` : '';
      layers.push({
        index: layers.length,
        role: sec.role,
        label:
          numSubLayers > 1
            ? `${sec.label} [L${sub + 1}${parallelBadge}]`
            : `${sec.label}${parallelBadge}`,
        turns: turnsInLayer,
        parallelInHand: packed.parallelInHand,
        visualStyle: packed.visualStyle,
        bundleDiam_mm: packed.radialThickness_mm,
        axialPitch_mm: packed.axialPitch_mm,
        xStart_mm: Number(xStart.toFixed(2)),
        xEnd_mm: Number(xEnd.toFixed(2)),
        mmfStart_At: Number(mmfStart.toFixed(1)),
        mmfEnd_At: Number(mmfEnd.toFixed(1)),
        inFringingZone: airGap_mm > 0.02 && xStart < bobbinThickness_mm + gapKeepoutRadius_mm,
      });

      currentMmf_At = mmfEnd;
      const isSectionBoundary = sub === numSubLayers - 1 && secIdx < sections.length - 1;
      const insAdded =
        sub === numSubLayers - 1 && secIdx === sections.length - 1
          ? 0.12 // outer wrapper tape
          : isSectionBoundary
          ? h_ins_mm
          : 0.08;
      insulation_mm += insAdded;
      currentX_mm = xEnd + insAdded;
    }
  });

  const totalRadialBuild_mm = Number(currentX_mm.toFixed(2));
  const safeLimit_mm = Number((hw_mm * 0.95).toFixed(2));
  const radialFill_pct = Number(((totalRadialBuild_mm / hw_mm) * 100).toFixed(1));
  const radialMargin_mm = Number((safeLimit_mm - totalRadialBuild_mm).toFixed(2));
  const fitsInWindow = totalRadialBuild_mm <= safeLimit_mm;
  const isTightMargin = fitsInWindow && radialFill_pct > 84;

  const peakMmf_At = Math.max(
    ...layers.map((l) => Math.max(Math.abs(l.mmfStart_At), Math.abs(l.mmfEnd_At))),
    1
  );
  const nonInterleavedPeakMmf_At = totalPriAt;
  const mmfReductionRatio = nonInterleavedPeakMmf_At / Math.max(peakMmf_At, 1);

  // Fringing eddy penalty reflects actual gap exposure
  const fringeMultiplier =
    airGap_mm <= 0.02
      ? 0.01
      : gapStrategy === 'full-radial'
      ? 0.025
      : gapStrategy === 'distributed-multigap'
      ? Math.min(0.14, (effectiveSingleGap_mm / 0.8) * 0.09)
      : Math.min(0.28, (airGap_mm / 1.2) * 0.14); // local-notch confines fringing to center ~15% of turn length
  const P_fringe_eddy_W = Number((Pcu_W * fringeMultiplier).toFixed(2));

  const reqCreepage_mm = Number(Math.max(2.0, (Vin_nom_V / 100) * 0.55).toFixed(2));
  const actualCreepage_mm = Number((2 * marginTape_mm).toFixed(2));
  const creepagePass = actualCreepage_mm >= reqCreepage_mm;

  // Build plain-English Root Cause summary
  const dominantParts: string[] = [];
  if (!fitsInWindow || isTightMargin) {
    if (secCopper_mm >= priCopper_mm && secCopper_mm > hw_mm * 0.35) {
      dominantParts.push(
        `Secondary uses ${secCopper_mm.toFixed(1)} mm radial height (${Math.round((secCopper_mm / totalRadialBuild_mm) * 100)}% of stack)` +
          (conductorForm === 'round-litz'
            ? ` because ${secStrands}-strand round bundle stacks vertically while axial width is ${secPack.axialUtilization_pct}% used`
            : '')
      );
    } else if (priCopper_mm > hw_mm * 0.35) {
      dominantParts.push(
        `Primary uses ${priCopper_mm.toFixed(1)} mm radial height across ${layers.filter((l) => l.role === 'primary').length} layers`
      );
    }
    if (radialGapOffset_mm > hw_mm * 0.22) {
      dominantParts.push(
        `Gap keep-out spacer consumes ${radialGapOffset_mm.toFixed(1)} mm (${Math.round((radialGapOffset_mm / hw_mm) * 100)}% of h_w)`
      );
    }
    if (interleaving === 'full-interleaved' && layers.length >= 4) {
      dominantParts.push(`P-S-P-S interleaving adds ${layers.length} separate copper/insulation layers`);
    }
  }
  const rootCauseSummary = fitsInWindow
    ? isTightMargin
      ? `Fits within ${safeLimit_mm} mm limit with tight ${radialMargin_mm.toFixed(2)} mm margin (${dominantParts.join('; ') || 'high fill density'}).`
      : `Window stackup ${totalRadialBuild_mm} mm fits cleanly inside ${hw_mm} mm core window (+${radialMargin_mm.toFixed(2)} mm assembly clearance).`
    : `Exceeds safe 95% window height (${safeLimit_mm} mm of ${hw_mm} mm) by ${Math.abs(radialMargin_mm).toFixed(2)} mm: ${dominantParts.join('; ') || 'windings exceed available h_w'}.`;

  const evalSpatialMmfAtX = (x_mm_raw: number) => {
    const x = Math.max(0, x_mm_raw);
    let mmf = 0;
    for (const l of layers) {
      if (x >= l.xStart_mm && x <= l.xEnd_mm) {
        const u = (x - l.xStart_mm) / Math.max(1e-4, l.xEnd_mm - l.xStart_mm);
        mmf = l.mmfStart_At + u * (l.mmfEnd_At - l.mmfStart_At);
        break;
      } else if (x > l.xEnd_mm) {
        mmf = l.mmfEnd_At;
      }
    }
    if (layers.length > 0 && x > layers[layers.length - 1].xEnd_mm) {
      mmf = 0;
    }
    const hField_kA_m = mmf / Math.max(1e-3, b_eff_mm);
    return {
      x_mm: Number(x.toFixed(2)),
      mmf_At: Number(mmf.toFixed(2)),
      absMmf_At: Number(Math.abs(mmf).toFixed(2)),
      hField_kA_m: Number(hField_kA_m.toFixed(2)),
    };
  };

  const maxX = Math.max(hw_mm, totalRadialBuild_mm * 1.05);
  const spatialMmfCurve = [];
  const nSamples = 64;
  for (let i = 0; i <= nSamples; i++) {
    spatialMmfCurve.push(evalSpatialMmfAtX((maxX * i) / nSamples));
  }
  layers.forEach((l) => {
    spatialMmfCurve.push(evalSpatialMmfAtX(l.xStart_mm));
    spatialMmfCurve.push(evalSpatialMmfAtX(l.xEnd_mm));
  });
  spatialMmfCurve.sort((a, b) => a.x_mm - b.x_mm);

  return {
    bw_mm,
    hw_mm,
    b_eff_mm,
    airGap_mm,
    h_ins_mm,
    d_bundle_pri_mm: priPack.radialThickness_mm,
    d_bundle_sec_mm: secPack.radialThickness_mm,
    priPack,
    secPack,
    gapKeepoutRadius_mm,
    radialGapOffset_mm,
    F_fringe,
    layers,
    budget: {
      bobbin_mm: Number(bobbinThickness_mm.toFixed(2)),
      gapSpacer_mm: Number(radialGapOffset_mm.toFixed(2)),
      priCopper_mm: Number(priCopper_mm.toFixed(2)),
      secCopper_mm: Number(secCopper_mm.toFixed(2)),
      insulation_mm: Number(insulation_mm.toFixed(2)),
      total_mm: totalRadialBuild_mm,
      safeLimit_mm,
      hw_mm,
    },
    totalRadialBuild_mm,
    radialFill_pct,
    radialMargin_mm,
    fitsInWindow,
    isTightMargin,
    peakMmf_At,
    nonInterleavedPeakMmf_At,
    mmfReductionRatio,
    P_fringe_eddy_W,
    reqCreepage_mm,
    actualCreepage_mm,
    creepagePass,
    rootCauseSummary,
    spatialMmfCurve,
    evalSpatialMmfAtX,
  };
}

export const WindingWindowVisualizer: React.FC<WindingWindowVisualizerProps> = ({
  state,
  res,
}) => {
  const { setDcdcField, applyDcdcPatch, dcdcLocked, toggleDcdcLock, dcdcChanges } =
    useDesignSolver();
  const core = res.core;
  const strandDiam_mm = AWG_DIAM_MM[state.litzStrandAWG] || 0.1016;

  // Auto-calculated parameters backed by Lock/Auto hooks
  const autoMarginTape_mm = state.Vin_nom_V >= 300 ? 3.0 : state.Vin_nom_V >= 150 ? 2.5 : 1.5;
  const autoBobbin_mm = core.Ve_mm3 >= 30000 ? 1.3 : core.Ve_mm3 >= 12000 ? 1.1 : 0.9;
  const autoGapStrategy: GapStrategyMode =
    res.airGap_mm >= 0.45 ? 'distributed-multigap' : 'local-notch';

  const marginTapeLock = useLockableValue<number>(autoMarginTape_mm, false);
  const bobbinLock = useLockableValue<number>(autoBobbin_mm, false);
  const conductorFormLock = useLockableValue<ConductorFormMode>('auto-parallel', false);
  const gapStrategyLock = useLockableValue<GapStrategyMode>(autoGapStrategy, false);

  const marginTape_mm = marginTapeLock.value;
  const bobbinThickness_mm = bobbinLock.value;
  const conductorForm = conductorFormLock.value;
  const gapStrategy = gapStrategyLock.value;

  const [hoveredLayerIdx, setHoveredLayerIdx] = useState<number | null>(null);
  const [winZoom, setWinZoom] = useState<number>(1.0);
  const [winPan, setWinPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [winDrag, setWinDrag] = useState<{ cx: number; cy: number; x0: number; y0: number } | null>(
    null
  );

  const windowAnalysis = useMemo(
    () =>
      computeWindowAnalysis({
        core,
        Vin_nom_V: state.Vin_nom_V,
        interleaving: state.interleaving,
        txType: state.txType,
        Np: res.Np_actual,
        Ns_single: res.Ns_actual,
        priStrands: state.priStrands,
        secStrands: state.secStrands,
        strandDiam_mm,
        insulationThickness_mm: state.insulationThickness_mm,
        airGap_mm: res.airGap_mm,
        I_pri_pk: res.I_lead_turnoff_A,
        Pcu_W: res.Pcu_W,
        marginTape_mm,
        bobbinThickness_mm,
        conductorForm,
        gapStrategy,
      }),
    [
      core,
      state.Vin_nom_V,
      state.interleaving,
      state.txType,
      res.Np_actual,
      res.Ns_actual,
      state.priStrands,
      state.secStrands,
      strandDiam_mm,
      state.insulationThickness_mm,
      res.airGap_mm,
      res.I_lead_turnoff_A,
      res.Pcu_W,
      marginTape_mm,
      bobbinThickness_mm,
      conductorForm,
      gapStrategy,
    ]
  );

  // Ordered non-planar cores sorted by true window capacity (hw * Aw) so step-up NEVER jumps to shallow planar ELP64
  const sortedNonPlanarCores = useMemo(
    () =>
      CORE_DATABASE.filter((c) => c.id !== 'elp64').sort(
        (a, b) => a.hw_mm * a.Aw_mm2 - b.hw_mm * b.Aw_mm2
      ),
    []
  );

  const rankedTransformerCores = useMemo(
    () => rankTransformerCoresForDcDc(state).slice(0, 4),
    [state]
  );

  // Evaluate ranked 1-click Build-Out Solver candidates
  const solverActions = useMemo<WindowSolverAction[]>(() => {
    const actions: WindowSolverAction[] = [];
    const baseCfg = {
      core,
      Vin_nom_V: state.Vin_nom_V,
      interleaving: state.interleaving,
      txType: state.txType,
      Np: res.Np_actual,
      Ns_single: res.Ns_actual,
      priStrands: state.priStrands,
      secStrands: state.secStrands,
      strandDiam_mm,
      insulationThickness_mm: state.insulationThickness_mm,
      airGap_mm: res.airGap_mm,
      I_pri_pk: res.I_lead_turnoff_A,
      Pcu_W: res.Pcu_W,
      marginTape_mm,
      bobbinThickness_mm,
      conductorForm,
      gapStrategy,
    };

    // 1. Secondary Copper Foil (if center-tapped / low turn count & not foil yet)
    if (conductorForm !== 'sec-foil' && res.Ns_actual <= 8) {
      const trial = computeWindowAnalysis({ ...baseCfg, conductorForm: 'sec-foil' });
      if (trial.totalRadialBuild_mm < windowAnalysis.totalRadialBuild_mm - 0.15) {
        actions.push({
          id: 'opt-sec-foil',
          title: 'Use Copper Foil Secondary + Parallel Pri Ribbons',
          tradeoffNote: `Foil winding cuts Sec height to ${trial.d_bundle_sec_mm} mm/T with ultra-low AC proximity loss.`,
          category: 'packing',
          predictedBuild_mm: trial.totalRadialBuild_mm,
          predictedFill_pct: trial.radialFill_pct,
          apply: () => conductorFormLock.setManual('sec-foil'),
        });
      }
    }

    // 2. Auto-Parallel / Flat Ribbon packing (if currently round-litz)
    if (conductorForm === 'round-litz') {
      const trial = computeWindowAnalysis({ ...baseCfg, conductorForm: 'flat-ribbon' });
      if (trial.totalRadialBuild_mm < windowAnalysis.totalRadialBuild_mm - 0.15) {
        actions.push({
          id: 'opt-flat-ribbon',
          title: 'Switch Round Rope → Parallel Flat Litz Ribbons',
          tradeoffNote: 'Spreads high-strand turns laterally across empty bobbin width (same Cu mm²).',
          category: 'packing',
          predictedBuild_mm: trial.totalRadialBuild_mm,
          predictedFill_pct: trial.radialFill_pct,
          apply: () => conductorFormLock.setManual('flat-ribbon'),
        });
      }
    }

    // 3. Air-Gap Strategy optimization (if full-radial or multi-gap with measurable lg)
    if (res.airGap_mm > 0.35 && gapStrategy !== 'local-notch') {
      const trial = computeWindowAnalysis({ ...baseCfg, gapStrategy: 'local-notch' });
      if (trial.totalRadialBuild_mm < windowAnalysis.totalRadialBuild_mm - 0.3) {
        actions.push({
          id: 'opt-local-notch',
          title: 'Switch to Local Gap-Notch Spacer',
          tradeoffNote: `Recovers ${(windowAnalysis.totalRadialBuild_mm - trial.totalRadialBuild_mm).toFixed(1)} mm radially (+${(trial.P_fringe_eddy_W - windowAnalysis.P_fringe_eddy_W).toFixed(1)} W local gap eddy).`,
          category: 'gap',
          predictedBuild_mm: trial.totalRadialBuild_mm,
          predictedFill_pct: trial.radialFill_pct,
          apply: () => gapStrategyLock.setManual('local-notch'),
        });
      }
    }

    // 4. Step up to smallest non-planar core that fits window cleanly
    const currentCapacity = core.hw_mm * core.Aw_mm2;
    for (const c of sortedNonPlanarCores) {
      if (c.id === core.id || c.hw_mm * c.Aw_mm2 <= currentCapacity) continue;
      const trial = computeWindowAnalysis({
        ...baseCfg,
        core: c,
        bobbinThickness_mm: c.Ve_mm3 >= 30000 ? 1.3 : 1.1,
      });
      if (trial.fitsInWindow) {
        actions.push({
          id: `opt-core-${c.id}`,
          title: `Step Up Core → ${c.name} (hw = ${c.hw_mm} mm)`,
          tradeoffNote: `Zero conductor compromise · Adds mechanical clearance (${trial.radialMargin_mm.toFixed(1)} mm margin).`,
          category: 'core',
          predictedBuild_mm: trial.totalRadialBuild_mm,
          predictedFill_pct: trial.radialFill_pct,
          unlocksField: dcdcLocked.coreId ? 'Core Geometry' : undefined,
          apply: () => setDcdcField('coreId', c.id),
        });
        break;
      }
    }

    // 5. Relax Interleaving if full-interleaved overflows insulation/layers
    if (state.interleaving === 'full-interleaved') {
      const trial = computeWindowAnalysis({ ...baseCfg, interleaving: 'split-pri' });
      if (trial.totalRadialBuild_mm < windowAnalysis.totalRadialBuild_mm - 0.15) {
        actions.push({
          id: 'opt-split-pri',
          title: 'Relax Interleaving P-S-P-S → Sandwich P/2-S-P/2',
          tradeoffNote: 'Eliminates 1 Pri-Sec barrier + layer transition; keeps 2× MMF cancellation.',
          category: 'interleaving',
          predictedBuild_mm: trial.totalRadialBuild_mm,
          predictedFill_pct: trial.radialFill_pct,
          apply: () => setDcdcField('interleaving', 'split-pri'),
        });
      }
    }

    // 6. Optimize Current Density J ≈ 5.4 A/mm² + Finer AWG if window still tight/overflowing
    if (!windowAnalysis.fitsInWindow || windowAnalysis.isTightMargin) {
      const awg40Area = AWG_AREA_MM2[40];
      const Ipri_rms = Math.max(1, res.I_lead_turnoff_A * 0.85);
      const isCT = state.txType === 'center-tapped';
      const Isec_rms = res.Iout_phase_A * (isCT ? 0.72 : 1.0);
      const J_compact = 5.4;
      const optPriStrands = Math.max(40, Math.round((Ipri_rms / J_compact / awg40Area) / 10) * 10);
      const optSecStrands = Math.max(80, Math.round((Isec_rms / J_compact / awg40Area) / 10) * 10);
      if (optPriStrands < state.priStrands || optSecStrands < state.secStrands || state.litzStrandAWG !== 40) {
        const trial = computeWindowAnalysis({
          ...baseCfg,
          priStrands: Math.min(state.priStrands, optPriStrands),
          secStrands: Math.min(state.secStrands, optSecStrands),
          strandDiam_mm: AWG_DIAM_MM[40],
        });
        if (trial.totalRadialBuild_mm < windowAnalysis.totalRadialBuild_mm - 0.15) {
          actions.push({
            id: 'opt-strands-compact',
            title: `Compact Litz to AWG40 (${Math.min(state.priStrands, optPriStrands)}/${Math.min(state.secStrands, optSecStrands)} str · J=5.4 A/mm²)`,
            tradeoffNote: 'Finer AWG 40 maintains low HF skin factor F_R while shedding excess copper bulk.',
            category: 'wire',
            predictedBuild_mm: trial.totalRadialBuild_mm,
            predictedFill_pct: trial.radialFill_pct,
            apply: () =>
              applyDcdcPatch(
                {
                  litzStrandAWG: 40,
                  priStrands: Math.min(state.priStrands, optPriStrands),
                  secStrands: Math.min(state.secStrands, optSecStrands),
                },
                'secStrands'
              ),
          });
        }
      }
    }

    return actions.sort((a, b) => a.predictedFill_pct - b.predictedFill_pct);
  }, [
    core,
    state,
    res,
    strandDiam_mm,
    marginTape_mm,
    bobbinThickness_mm,
    conductorForm,
    gapStrategy,
    windowAnalysis.totalRadialBuild_mm,
    windowAnalysis.P_fringe_eddy_W,
    windowAnalysis.fitsInWindow,
    windowAnalysis.isTightMargin,
    sortedNonPlanarCores,
    dcdcLocked.coreId,
    setDcdcField,
    applyDcdcPatch,
    conductorFormLock,
    gapStrategyLock,
  ]);

  const bestFittingCoreAction = solverActions.find((a) => a.category === 'core');

  const svgW = 880;
  const svgH = 380;

  return (
    <div className="bg-white dark:bg-[#0E131D] border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-4">
      {/* HEADER BAR */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <Layers className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
            <h3 className="text-sm font-bold font-mono text-slate-900 dark:text-slate-100">
              2D Transformer Winding Window, Fit Solver &amp; Spatial MMF F(x) Visualizer
            </h3>
            <span
              className={`text-xs font-mono font-semibold tabular-nums ${
                !windowAnalysis.fitsInWindow || !windowAnalysis.creepagePass
                  ? 'text-rose-600 dark:text-rose-400'
                  : windowAnalysis.isTightMargin
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-emerald-600 dark:text-emerald-400'
              }`}
            >
              {windowAnalysis.fitsInWindow
                ? windowAnalysis.isTightMargin
                  ? `Tight fit (${windowAnalysis.radialFill_pct}% · +${windowAnalysis.radialMargin_mm} mm)`
                  : `Window fit OK (${windowAnalysis.radialFill_pct}% · +${windowAnalysis.radialMargin_mm} mm)`
                : `Window overflow (${windowAnalysis.totalRadialBuild_mm} > ${windowAnalysis.budget.safeLimit_mm} mm safe)`}
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Physical cross-section of <strong className="text-cyan-700 dark:text-cyan-400">{core.name}</strong> (
            <span className="font-mono tabular-nums">
              b_w = {windowAnalysis.bw_mm} mm × h_w = {windowAnalysis.hw_mm} mm · b_eff = {windowAnalysis.b_eff_mm.toFixed(1)} mm
            </span>
            ) with side-by-side Litz ribbon / foil packing &amp; air-gap fringing model.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {state.interleaving !== 'full-interleaved' && windowAnalysis.radialFill_pct < 76 && (
            <button
              type="button"
              onClick={() => setDcdcField('interleaving', 'full-interleaved')}
              className="px-2.5 py-1 text-[11px] font-mono bg-purple-600/10 hover:bg-purple-600/20 border border-purple-500/40 text-purple-700 dark:text-purple-300 rounded inline-flex items-center gap-1 font-semibold cursor-pointer"
            >
              <Layers className="w-3 h-3" /> Try Full Interleaving P-S-P-S
            </button>
          )}
          {!windowAnalysis.fitsInWindow && bestFittingCoreAction && (
            <button
              type="button"
              onClick={bestFittingCoreAction.apply}
              className="px-2.5 py-1 text-[11px] font-mono bg-emerald-600 hover:bg-emerald-500 text-white rounded font-semibold inline-flex items-center gap-1 cursor-pointer"
            >
              {bestFittingCoreAction.title} <ArrowUpRight className="w-3 h-3" />
            </button>
          )}
          {rankedTransformerCores[0] && rankedTransformerCores[0].core.id !== state.coreId && (
            <button
              type="button"
              onClick={() => setDcdcField('coreId', rankedTransformerCores[0].core.id)}
              className="px-2.5 py-1 text-[11px] font-mono bg-cyan-600/15 hover:bg-cyan-600/25 border border-cyan-500/40 text-cyan-700 dark:text-cyan-300 rounded inline-flex items-center gap-1 font-semibold cursor-pointer"
              title="Equip top-ranked core by combined core+copper loss, window fill, and volume"
            >
              Auto-Pick {rankedTransformerCores[0].core.name.split(' (')[0]}
            </button>
          )}
        </div>
      </div>

      {/* ROW 1: CONTROLS & KPI SUMMARY */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5">
        {/* Left Controls (5 cols) */}
        <div className="lg:col-span-5 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-lg p-3.5 space-y-3">
          <div className="text-[13px] font-medium text-slate-900 dark:text-[#eef0f5] flex items-center gap-1.5">
            <Sliders className="w-3.5 h-3.5 text-cyan-500" /> Winding Form, Gap Strategy &amp; Bobbin Controls
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <div className="flex items-center justify-between gap-1 mb-0.5">
                <label className="text-[10px] font-mono text-slate-600 dark:text-slate-400">
                  Core Geometry
                </label>
                <LockToggleButton
                  compact
                  locked={dcdcLocked.coreId}
                  recentlyAutoUpdated={dcdcChanges.some((c) => c.key === 'coreId')}
                  onToggle={() => toggleDcdcLock('coreId')}
                  label="Core Geometry"
                />
              </div>
              <select
                value={state.coreId}
                onChange={(e) => setDcdcField('coreId', e.target.value)}
                className="w-full px-2 py-1 text-xs font-mono bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded text-slate-900 dark:text-slate-200"
              >
                {CORE_DATABASE.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.bw_mm}×{c.hw_mm}mm)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between gap-1 mb-0.5">
                <label className="text-[10px] font-mono text-slate-600 dark:text-slate-400">
                  Interleaving Topology
                </label>
                <LockToggleButton
                  compact
                  locked={dcdcLocked.interleaving}
                  recentlyAutoUpdated={dcdcChanges.some((c) => c.key === 'interleaving')}
                  onToggle={() => toggleDcdcLock('interleaving')}
                  label="Interleaving"
                />
              </div>
              <select
                value={state.interleaving}
                onChange={(e) =>
                  setDcdcField(
                    'interleaving',
                    e.target.value as 'none' | 'split-pri' | 'full-interleaved'
                  )
                }
                className="w-full px-2 py-1 text-xs font-mono bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded text-slate-900 dark:text-slate-200"
              >
                <option value="none">Non-Interleaved (P-S, M=1)</option>
                <option value="split-pri">Sandwich Split-Pri (P/2-S-P/2, M=2)</option>
                <option value="full-interleaved">Full Interleaved (P-S-P-S, M=4)</option>
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between gap-1 mb-0.5">
                <label className="text-[10px] font-mono text-slate-600 dark:text-slate-400">
                  Conductor Packing Mode
                </label>
                <LockToggleButton
                  compact
                  locked={conductorFormLock.locked}
                  onToggle={conductorFormLock.toggleLock}
                  label="Conductor Packing"
                />
              </div>
              <select
                value={conductorForm}
                onChange={(e) => conductorFormLock.setManual(e.target.value as ConductorFormMode)}
                className="w-full px-2 py-1 text-xs font-mono bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded text-slate-900 dark:text-slate-200"
              >
                <option value="auto-parallel">Auto Parallel Ribbons</option>
                <option value="flat-ribbon">Flat Rectangular Litz</option>
                <option value="sec-foil">Copper Foil Sec + Litz Pri</option>
                <option value="round-litz">Single Round Litz Rope</option>
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between gap-1 mb-0.5">
                <label className="text-[10px] font-mono text-slate-600 dark:text-slate-400">
                  Air-Gap Keep-Out Strategy
                </label>
                <LockToggleButton
                  compact
                  locked={gapStrategyLock.locked}
                  onToggle={gapStrategyLock.toggleLock}
                  label="Air-Gap Strategy"
                />
              </div>
              <select
                value={gapStrategy}
                onChange={(e) => gapStrategyLock.setManual(e.target.value as GapStrategyMode)}
                className="w-full px-2 py-1 text-xs font-mono bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded text-slate-900 dark:text-slate-200"
              >
                <option value="distributed-multigap">Distributed Multi-Gap (lg/2)</option>
                <option value="local-notch">Local Notch Spacer (Gap Band)</option>
                <option value="full-radial">Strict Full Radial Spacer</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            <div>
              <div className="flex justify-between items-center text-[10px] font-mono">
                <span className="text-slate-500 dark:text-slate-400">Margin Tape</span>
                <div className="inline-flex items-center gap-1">
                  <span className="text-cyan-700 dark:text-cyan-400 font-bold tabular-nums">
                    {marginTape_mm.toFixed(1)}mm
                  </span>
                  <LockToggleButton
                    compact
                    locked={marginTapeLock.locked}
                    onToggle={marginTapeLock.toggleLock}
                    label="Margin Tape"
                  />
                </div>
              </div>
              <input
                type="range"
                min={0.5}
                max={5.0}
                step={0.5}
                value={marginTape_mm}
                onChange={(e) => marginTapeLock.setManual(Number(e.target.value))}
                className="w-full accent-cyan-600 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between items-center text-[10px] font-mono">
                <span className="text-slate-500 dark:text-slate-400">Pri-Sec Tape</span>
                <div className="inline-flex items-center gap-1">
                  <span className="text-amber-700 dark:text-amber-400 font-bold tabular-nums">
                    {state.insulationThickness_mm.toFixed(2)}mm
                  </span>
                  <LockToggleButton
                    compact
                    locked={dcdcLocked.insulationThickness_mm}
                    recentlyAutoUpdated={dcdcChanges.some((c) => c.key === 'insulationThickness_mm')}
                    onToggle={() => toggleDcdcLock('insulationThickness_mm')}
                    label="Insulation Thickness"
                  />
                </div>
              </div>
              <input
                type="range"
                min={0.08}
                max={0.8}
                step={0.04}
                value={state.insulationThickness_mm}
                onChange={(e) => setDcdcField('insulationThickness_mm', Number(e.target.value))}
                className="w-full accent-amber-500 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between items-center text-[10px] font-mono">
                <span className="text-slate-500 dark:text-slate-400">Bobbin Wall</span>
                <div className="inline-flex items-center gap-1">
                  <span className="text-purple-700 dark:text-purple-400 font-bold tabular-nums">
                    {bobbinThickness_mm.toFixed(1)}mm
                  </span>
                  <LockToggleButton
                    compact
                    locked={bobbinLock.locked}
                    onToggle={bobbinLock.toggleLock}
                    label="Bobbin Wall"
                  />
                </div>
              </div>
              <input
                type="range"
                min={0.6}
                max={2.2}
                step={0.1}
                value={bobbinThickness_mm}
                onChange={(e) => bobbinLock.setManual(Number(e.target.value))}
                className="w-full accent-purple-500 cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Right KPI Cards (7 cols) */}
        <div className="lg:col-span-7 grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
            <div className="text-[10px] font-mono uppercase text-slate-500 dark:text-slate-400">
              Radial Build vs Window h_w
            </div>
            <div
              className={`text-base font-mono font-bold tabular-nums ${
                !windowAnalysis.fitsInWindow
                  ? 'text-rose-600 dark:text-rose-400'
                  : windowAnalysis.isTightMargin
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-emerald-600 dark:text-emerald-400'
              }`}
            >
              {windowAnalysis.totalRadialBuild_mm} / {windowAnalysis.hw_mm} mm
            </div>
            <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 tabular-nums">
              Radial: <strong>{windowAnalysis.radialFill_pct}%</strong> · Area:{' '}
              <strong>{res.windowFill_pct.toFixed(1)}%</strong>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
            <div className="text-[10px] font-mono uppercase text-purple-700 dark:text-purple-400">
              Peak Spatial MMF F_pk
            </div>
            <div className="text-base font-mono font-bold text-purple-700 dark:text-purple-400 tabular-nums">
              {windowAnalysis.peakMmf_At.toFixed(0)} A·turns
            </div>
            <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 tabular-nums">
              {windowAnalysis.mmfReductionRatio.toFixed(1)}× lower than P-S
            </div>
          </div>

          <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
            <div className="text-[10px] font-mono uppercase text-amber-700 dark:text-amber-400">
              Gap Fringing &amp; Eddy Loss
            </div>
            <div className="text-base font-mono font-bold text-amber-700 dark:text-amber-400 tabular-nums">
              +{windowAnalysis.P_fringe_eddy_W} W
            </div>
            <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 tabular-nums">
              l_g={windowAnalysis.airGap_mm.toFixed(2)}mm · Spacer={windowAnalysis.radialGapOffset_mm}mm
            </div>
          </div>

          <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
            <div className="text-[10px] font-mono uppercase text-cyan-700 dark:text-cyan-400">
              Layer Height &amp; Packing
            </div>
            <div className="text-sm font-mono font-bold text-cyan-700 dark:text-cyan-300 tabular-nums">
              Pri {windowAnalysis.d_bundle_pri_mm}mm · Sec {windowAnalysis.d_bundle_sec_mm}mm
            </div>
            <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 tabular-nums">
              Sec {windowAnalysis.secPack.parallelInHand > 1 ? `${windowAnalysis.secPack.parallelInHand}×par` : windowAnalysis.secPack.visualStyle} ({windowAnalysis.secPack.axialUtilization_pct}% b_eff)
            </div>
          </div>

          <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
            <div className="text-[10px] font-mono uppercase text-emerald-700 dark:text-emerald-400">
              Geometric Leakage &amp; C_ww
            </div>
            <div className="text-sm font-mono font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">
              L_lk {res.Llk_geom_uH.toFixed(2)}µH · {res.Cww_pF.toFixed(0)}pF
            </div>
            <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 tabular-nums">
              Dowell F_R: {res.Fr_dowell_pri.toFixed(2)}× / {res.Fr_dowell_sec.toFixed(2)}×
            </div>
          </div>

          <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
            <div className="text-[10px] font-mono uppercase text-slate-500 dark:text-slate-400">
              IEC 62368-1 Creepage
            </div>
            <div
              className={`text-sm font-mono font-bold tabular-nums ${
                windowAnalysis.creepagePass
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-rose-600 dark:text-rose-400'
              }`}
            >
              {windowAnalysis.actualCreepage_mm} mm (Req ≥ {windowAnalysis.reqCreepage_mm} mm)
            </div>
            <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 tabular-nums">
              2 × {marginTape_mm.toFixed(1)} mm end-margin tape
            </div>
          </div>
        </div>
      </div>

      {/* WINDOW FIT BUDGET & BUILD-OUT SOLVER ASSISTANT */}
      <div className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-lg p-3.5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-[13px] font-medium text-slate-900 dark:text-[#eef0f5]">
            <Wrench className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
            <span>Window Fit Budget &amp; Build-Out Solver Assistant</span>
          </div>
          <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
            Safe Limit (95% h_w):{' '}
            <strong className="text-slate-800 dark:text-slate-200">
              {windowAnalysis.budget.safeLimit_mm} mm
            </strong>{' '}
            of {windowAnalysis.hw_mm} mm · Used:{' '}
            <strong
              className={
                windowAnalysis.fitsInWindow
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-rose-600 dark:text-rose-400'
              }
            >
              {windowAnalysis.totalRadialBuild_mm} mm
            </strong>
          </div>
        </div>

        {/* Segmented Horizontal Radial Build Bar */}
        {(() => {
          const b = windowAnalysis.budget;
          const scaleMax = Math.max(b.hw_mm, b.total_mm);
          const pct = (mm: number) => `${Math.max(0, (mm / scaleMax) * 100).toFixed(2)}%`;
          const safeLimitPct = ((b.safeLimit_mm / scaleMax) * 100).toFixed(2);
          return (
            <div className="space-y-1.5">
              <div className="relative h-6 w-full bg-white dark:bg-[#090C12] border border-slate-300 dark:border-slate-800 rounded overflow-hidden flex">
                <div
                  style={{ width: pct(b.bobbin_mm) }}
                  className="h-full bg-slate-500 flex items-center justify-center text-[10px] font-mono text-white font-semibold truncate px-0.5"
                  title={`Bobbin Former Wall: ${b.bobbin_mm} mm`}
                >
                  {b.bobbin_mm >= 0.8 ? `${b.bobbin_mm}` : ''}
                </div>
                {b.gapSpacer_mm > 0 && (
                  <div
                    style={{ width: pct(b.gapSpacer_mm) }}
                    className="h-full bg-rose-500/80 flex items-center justify-center text-[10px] font-mono text-white font-semibold truncate px-0.5"
                    title={`Gap Spacer (${gapStrategy}): ${b.gapSpacer_mm} mm`}
                  >
                    {b.gapSpacer_mm >= 0.7 ? `Gap ${b.gapSpacer_mm}` : ''}
                  </div>
                )}
                <div
                  style={{ width: pct(b.priCopper_mm) }}
                  className="h-full bg-sky-500 flex items-center justify-center text-[10px] font-mono text-white font-semibold truncate px-1"
                  title={`Primary Copper Total: ${b.priCopper_mm} mm`}
                >
                  {b.priCopper_mm >= 0.9 ? `Pri ${b.priCopper_mm}mm` : ''}
                </div>
                <div
                  style={{ width: pct(b.secCopper_mm) }}
                  className="h-full bg-emerald-500 flex items-center justify-center text-[10px] font-mono text-white font-semibold truncate px-1"
                  title={`Secondary Copper Total: ${b.secCopper_mm} mm`}
                >
                  {b.secCopper_mm >= 0.9 ? `Sec ${b.secCopper_mm}mm` : ''}
                </div>
                <div
                  style={{ width: pct(b.insulation_mm) }}
                  className="h-full bg-amber-500 flex items-center justify-center text-[10px] font-mono text-slate-950 font-semibold truncate px-0.5"
                  title={`Inter-layer & Pri-Sec Tape: ${b.insulation_mm} mm`}
                >
                  {b.insulation_mm >= 0.55 ? `${b.insulation_mm}` : ''}
                </div>

                {/* Safe 95% hw threshold line */}
                <div
                  style={{ left: `${safeLimitPct}%` }}
                  className="absolute top-0 bottom-0 w-0.5 bg-rose-600 dark:bg-rose-400 z-10"
                  title={`Safe Window Limit (95% hw) = ${b.safeLimit_mm} mm`}
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono tabular-nums text-slate-600 dark:text-slate-400">
                <div className="flex flex-wrap items-center gap-3">
                  <span>■ Bobbin {b.bobbin_mm}mm</span>
                  {b.gapSpacer_mm > 0 && (
                    <span className="text-rose-600 dark:text-rose-400">
                      ■ Gap Keep-Out {b.gapSpacer_mm}mm
                    </span>
                  )}
                  <span className="text-sky-600 dark:text-sky-400">■ Pri Cu {b.priCopper_mm}mm</span>
                  <span className="text-emerald-600 dark:text-emerald-400">
                    ■ Sec Cu {b.secCopper_mm}mm
                  </span>
                  <span className="text-amber-600 dark:text-amber-400">
                    ■ Tape {b.insulation_mm}mm
                  </span>
                </div>
                <div
                  className={`font-semibold ${
                    windowAnalysis.fitsInWindow
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {windowAnalysis.radialMargin_mm >= 0
                    ? `Remaining Margin: +${windowAnalysis.radialMargin_mm} mm`
                    : `Overflow Deficit: ${windowAnalysis.radialMargin_mm} mm`}
                </div>
              </div>
            </div>
          );
        })()}

        {/* Root-Cause Explanation Line */}
        <div
          className={`flex items-start gap-2 px-3 py-2 rounded border text-xs ${
            !windowAnalysis.fitsInWindow
              ? 'bg-rose-50 dark:bg-rose-950/25 border-rose-300 dark:border-rose-500/40 text-rose-800 dark:text-rose-200'
              : windowAnalysis.isTightMargin
              ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-300 dark:border-amber-500/40 text-amber-800 dark:text-amber-200'
              : 'bg-emerald-50/70 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-200'
          }`}
        >
          <Info className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{windowAnalysis.rootCauseSummary}</span>
        </div>

        {/* Ranked 1-Click Build-Out Solver Matrix */}
        {solverActions.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {windowAnalysis.fitsInWindow
                ? 'Optional Build-Out & Loss Trade-Off Improvements'
                : 'Recommended 1-Click Remedies (Ranked by Predicted Radial Fit)'}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {solverActions.slice(0, 3).map((act) => (
                <button
                  key={act.id}
                  type="button"
                  onClick={act.apply}
                  className="text-left p-2.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0E131D] hover:border-cyan-500 dark:hover:border-cyan-400 transition-colors cursor-pointer flex flex-col justify-between gap-1.5"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-mono font-semibold text-slate-900 dark:text-slate-100">
                        {act.title}
                      </span>
                      <span className="text-[11px] font-mono font-bold tabular-nums text-emerald-600 dark:text-emerald-400 shrink-0">
                        → {act.predictedFill_pct}%
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      {act.tradeoffNote}
                    </p>
                  </div>
                  <div className="flex items-center justify-between text-[10px] font-mono text-cyan-700 dark:text-cyan-400 border-t border-slate-100 dark:border-slate-800 pt-1">
                    <span>
                      Build: {act.predictedBuild_mm} mm
                      {act.unlocksField ? ` · Overrides ${act.unlocksField}` : ''}
                    </span>
                    <span className="font-semibold">Apply →</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Top-4 Ranked Transformer Core & Turns Recommender */}
        <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-1.5">
          <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Top-Ranked Transformer Cores ({state.Pout_W} W @ {state.fsw_kHz} kHz)
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {rankedTransformerCores.map((row, idx) => {
              const isActive = row.core.id === state.coreId;
              return (
                <button
                  key={row.core.id}
                  type="button"
                  onClick={() => setDcdcField('coreId', row.core.id)}
                  className={`text-left p-2 rounded border transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-cyan-500/10 border-cyan-500/60'
                      : 'bg-white dark:bg-[#0E131D] border-slate-200 dark:border-slate-700 hover:border-cyan-500/50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1 text-[11px] font-mono font-semibold text-slate-900 dark:text-slate-100">
                    <span className="truncate">
                      {idx === 0 ? '★ ' : ''}{row.core.name.split(' (')[0]}
                    </span>
                    <span className={row.passesAll ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}>
                      {row.res.windowFill_pct.toFixed(0)}%
                    </span>
                  </div>
                  <div className="text-[10px] font-mono text-slate-500 tabular-nums mt-0.5">
                    {row.res.Np_actual}:{row.res.Ns_actual}T · Bpk {row.res.Bpk_mT.toFixed(0)}mT · {(row.res.Pcore_W + row.res.Pcu_W).toFixed(1)}W · {row.res.Tcore_C.toFixed(0)}°C
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ROW 2: 2D CORE WINDOW CROSS-SECTION + SPATIAL MMF PROFILE F(x) */}
      <div className="bg-[#090C12] border border-slate-800 rounded-lg p-3 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-[11px] font-mono text-slate-400">
            Interactive 2D Winding Cross-Section (Scroll Wheel to Zoom · Drag to Pan)
          </div>
          <div className="inline-flex items-center rounded border border-slate-700 overflow-hidden bg-slate-900 text-[11px] font-mono">
            <button
              type="button"
              onClick={() => setWinZoom((z) => Math.min(4, Number((z * 1.25).toFixed(2))))}
              className="px-2 py-1 hover:bg-cyan-500/20 text-slate-200 inline-flex items-center gap-0.5 cursor-pointer"
              title="Zoom In (+)"
            >
              <ZoomIn className="w-3.5 h-3.5 text-cyan-400" /> +
            </button>
            <button
              type="button"
              onClick={() => setWinZoom((z) => Math.max(0.6, Number((z / 1.25).toFixed(2))))}
              className="px-2 py-1 border-l border-slate-700 hover:bg-cyan-500/20 text-slate-200 inline-flex items-center gap-0.5 cursor-pointer"
              title="Zoom Out (-)"
            >
              <ZoomOut className="w-3.5 h-3.5 text-cyan-400" /> −
            </button>
            <button
              type="button"
              onClick={() => {
                setWinZoom(1.0);
                setWinPan({ x: 0, y: 0 });
              }}
              className="px-2 py-1 border-l border-slate-700 hover:bg-cyan-500/20 text-cyan-400 font-bold inline-flex items-center gap-1 cursor-pointer"
              title="Reset View (100%)"
            >
              <RotateCcw className="w-3 h-3" /> {(winZoom * 100).toFixed(0)}%
            </button>
          </div>
        </div>

        <svg
          viewBox={`${(svgW * (1 - 1 / winZoom)) / 2 - winPan.x} ${(svgH * (1 - 1 / winZoom)) / 2 - winPan.y} ${svgW / winZoom} ${svgH / winZoom}`}
          className="w-full h-auto select-none font-mono cursor-grab active:cursor-grabbing bg-[#070b14] rounded border border-slate-800/80"
          onWheel={(e) => {
            e.preventDefault();
            const factor = e.deltaY < 0 ? 1.18 : 1 / 1.18;
            setWinZoom((z) => Math.max(0.6, Math.min(4.0, Number((z * factor).toFixed(2)))));
          }}
          onMouseDown={(e) => {
            setWinDrag({ cx: e.clientX, cy: e.clientY, x0: winPan.x, y0: winPan.y });
          }}
          onMouseMove={(e) => {
            if (!winDrag) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const dx = ((e.clientX - winDrag.cx) / rect.width) * (svgW / winZoom);
            const dy = ((e.clientY - winDrag.cy) / rect.height) * (svgH / winZoom);
            setWinPan({ x: winDrag.x0 + dx, y: winDrag.y0 + dy });
          }}
          onMouseUp={() => setWinDrag(null)}
          onMouseLeave={() => setWinDrag(null)}
        >
          {(() => {
            const winX0 = 135;
            const winW = 460;
            const winY0 = 32;
            const winH = 205;

            const maxRadialPlot_mm = Math.max(
              windowAnalysis.hw_mm * 1.12,
              windowAnalysis.totalRadialBuild_mm * 1.05
            );
            const mmToPxX = (x_mm: number) => winX0 + (x_mm / maxRadialPlot_mm) * winW;
            const mmToPxY = (y_mm: number) => winY0 + (y_mm / windowAnalysis.bw_mm) * winH;

            const xOuterLeg = mmToPxX(windowAnalysis.hw_mm);
            const yGapCenter = winY0 + winH / 2;
            const gapPxH = Math.max(
              3,
              (windowAnalysis.airGap_mm / windowAnalysis.bw_mm) * winH * 3.0
            );
            const keepoutPxR =
              ((bobbinThickness_mm + windowAnalysis.gapKeepoutRadius_mm) / maxRadialPlot_mm) * winW;

            const mmfY0 = 262;
            const mmfH = 88;
            const mmfZeroY = mmfY0 + mmfH / 2;
            const maxMmfPlot = Math.max(windowAnalysis.nonInterleavedPeakMmf_At * 1.05, 10);
            const mmfToY = (at: number) => mmfZeroY - (at / maxMmfPlot) * (mmfH * 0.45);

            const mmfPts: { x: number; y: number }[] = [{ x: winX0, y: mmfZeroY }];
            windowAnalysis.layers.forEach((l) => {
              mmfPts.push({ x: mmToPxX(l.xStart_mm), y: mmfToY(l.mmfStart_At) });
              mmfPts.push({ x: mmToPxX(l.xEnd_mm), y: mmfToY(l.mmfEnd_At) });
            });
            mmfPts.push({ x: xOuterLeg, y: mmfZeroY });

            const mmfPolyline = mmfPts
              .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
              .join(' ');
            const mmfArea = `${mmfPolyline} L ${xOuterLeg.toFixed(1)} ${mmfZeroY} L ${winX0} ${mmfZeroY} Z`;

            return (
              <g>
                {/* Top & Bottom Yokes */}
                <rect x={55} y={8} width={xOuterLeg - 55 + 36} height={24} fill="#334155" stroke="#64748b" />
                <rect x={55} y={winY0 + winH} width={xOuterLeg - 55 + 36} height={22} fill="#334155" stroke="#64748b" />

                {/* Center Leg with Air Gap (Single or Distributed Multi-Gap visual) */}
                {gapStrategy === 'distributed-multigap' && windowAnalysis.airGap_mm > 0.2 ? (
                  <>
                    <rect x={55} y={winY0} width={winX0 - 55} height={winH * 0.34} fill="#334155" stroke="#64748b" />
                    <rect
                      x={55}
                      y={winY0 + winH * 0.34 + gapPxH * 0.55}
                      width={winX0 - 55}
                      height={winH * 0.32 - gapPxH * 1.1}
                      fill="#334155"
                      stroke="#64748b"
                    />
                    <rect
                      x={55}
                      y={winY0 + winH * 0.66 + gapPxH * 0.55}
                      width={winX0 - 55}
                      height={winH * 0.34 - gapPxH * 0.55}
                      fill="#334155"
                      stroke="#64748b"
                    />
                  </>
                ) : (
                  <>
                    <rect
                      x={55}
                      y={winY0}
                      width={winX0 - 55}
                      height={winH / 2 - gapPxH / 2}
                      fill="#334155"
                      stroke="#64748b"
                    />
                    <rect
                      x={55}
                      y={yGapCenter + gapPxH / 2}
                      width={winX0 - 55}
                      height={winH / 2 - gapPxH / 2}
                      fill="#334155"
                      stroke="#64748b"
                    />
                  </>
                )}

                {/* Outer Return Leg */}
                <rect x={xOuterLeg} y={winY0} width={36} height={winH} fill="#334155" stroke="#64748b" />

                <text x={95} y={winY0 + 22} textAnchor="middle" className="fill-slate-300 text-[10px] font-bold">
                  CENTER LEG
                </text>
                <text x={95} y={yGapCenter + 3} textAnchor="middle" className="fill-amber-400 text-[9px] font-bold">
                  l_g={windowAnalysis.airGap_mm.toFixed(2)}mm
                </text>

                {/* Air-Gap Fringing Keep-Out Visualization */}
                {windowAnalysis.airGap_mm > 0.02 &&
                  (gapStrategy === 'distributed-multigap'
                    ? [winY0 + winH * 0.34, winY0 + winH * 0.66]
                    : [yGapCenter]
                  ).map((yc, gIdx) => (
                    <g key={gIdx}>
                      {[0.48, 0.85].map((frac, idx) => {
                        const r = keepoutPxR * frac;
                        return (
                          <path
                            key={idx}
                            d={`M ${winX0} ${yc - gapPxH * 0.45} A ${r} ${r} 0 0 1 ${winX0} ${
                              yc + gapPxH * 0.45
                            }`}
                            fill="none"
                            stroke="#f43f5e"
                            strokeWidth={1.3}
                            strokeDasharray="3 2"
                          />
                        );
                      })}
                      <rect
                        x={winX0}
                        y={yc - keepoutPxR * 0.85}
                        width={keepoutPxR}
                        height={keepoutPxR * 1.7}
                        fill="#f43f5e"
                        fillOpacity={0.12}
                        stroke="#f43f5e"
                        strokeDasharray="3 3"
                      />
                    </g>
                  ))}

                {/* Bobbin Former Wall */}
                <rect
                  x={winX0}
                  y={winY0 + 2}
                  width={Math.max(4, mmToPxX(bobbinThickness_mm) - winX0)}
                  height={winH - 4}
                  fill="#475569"
                />

                {/* Top & Bottom Safety Margin Tape */}
                {(() => {
                  const marginH = (marginTape_mm / windowAnalysis.bw_mm) * winH;
                  const buildW = Math.max(
                    12,
                    mmToPxX(windowAnalysis.totalRadialBuild_mm) - mmToPxX(bobbinThickness_mm)
                  );
                  return (
                    <g>
                      <rect
                        x={mmToPxX(bobbinThickness_mm)}
                        y={winY0 + 2}
                        width={buildW}
                        height={marginH}
                        fill="#eab308"
                        fillOpacity={0.28}
                        stroke="#eab308"
                        strokeWidth={0.8}
                      />
                      <rect
                        x={mmToPxX(bobbinThickness_mm)}
                        y={winY0 + winH - 2 - marginH}
                        width={buildW}
                        height={marginH}
                        fill="#eab308"
                        fillOpacity={0.28}
                        stroke="#eab308"
                        strokeWidth={0.8}
                      />
                    </g>
                  );
                })()}

                {/* Winding Layers: Render Round, Side-by-Side Ribbon Strips, or Copper Foil */}
                {windowAnalysis.layers.map((layer) => {
                  const x1 = mmToPxX(layer.xStart_mm);
                  const x2 = mmToPxX(layer.xEnd_mm);
                  const layerW = Math.max(5, x2 - x1);
                  const yTop = mmToPxY(marginTape_mm);
                  const yBot = mmToPxY(windowAnalysis.bw_mm - marginTape_mm);
                  const effH = Math.max(20, yBot - yTop);
                  const isPri = layer.role === 'primary';
                  const isHovered = hoveredLayerIdx === layer.index;

                  const nSlots = Math.min(28, Math.max(1, layer.turns));
                  const stepY = effH / nSlots;
                  const rCircle = Math.min(layerW * 0.42, stepY * 0.42);

                  return (
                    <g
                      key={layer.index}
                      onMouseEnter={() => setHoveredLayerIdx(layer.index)}
                      onMouseLeave={() => setHoveredLayerIdx(null)}
                      className="cursor-pointer"
                    >
                      <rect
                        x={x1}
                        y={yTop}
                        width={layerW}
                        height={effH}
                        fill={isPri ? '#0ea5e9' : '#10b981'}
                        fillOpacity={isHovered ? 0.35 : 0.16}
                        stroke={layer.inFringingZone ? '#f43f5e' : isPri ? '#38bdf8' : '#34d399'}
                        strokeWidth={isHovered ? 2 : 1}
                      />
                      {layer.visualStyle === 'foil' ? (
                        <rect
                          x={x1 + 1}
                          y={yTop + 4}
                          width={Math.max(3, layerW - 2)}
                          height={effH - 8}
                          fill="#f59e0b"
                          fillOpacity={0.85}
                          stroke="#78350f"
                          strokeWidth={0.7}
                        />
                      ) : layer.visualStyle === 'ribbon' ? (
                        Array.from({ length: nSlots }).map((_, cIdx) => {
                          const ySlot = yTop + stepY * cIdx + stepY * 0.12;
                          const rectH = Math.max(2.2, stepY * 0.76);
                          const subW = layerW * 0.82;
                          const xRect = x1 + (layerW - subW) / 2;
                          return (
                            <rect
                              key={cIdx}
                              x={xRect}
                              y={ySlot}
                              width={subW}
                              height={rectH}
                              rx={1.2}
                              fill={isPri ? '#38bdf8' : '#34d399'}
                              stroke="#020617"
                              strokeWidth={0.6}
                            />
                          );
                        })
                      ) : (
                        Array.from({ length: nSlots }).map((_, cIdx) => {
                          const cy = yTop + stepY * (cIdx + 0.5);
                          return (
                            <circle
                              key={cIdx}
                              cx={(x1 + x2) / 2}
                              cy={cy}
                              r={Math.max(1.8, rCircle)}
                              fill={isPri ? '#38bdf8' : '#34d399'}
                              stroke="#020617"
                              strokeWidth={0.7}
                            />
                          );
                        })
                      )}
                    </g>
                  );
                })}

                {/* Outer Window Boundary Line (x = hw_mm) */}
                <line
                  x1={xOuterLeg}
                  y1={winY0}
                  x2={xOuterLeg}
                  y2={mmfY0 + mmfH}
                  stroke="#94a3b8"
                  strokeDasharray="4 3"
                />
                <text x={xOuterLeg - 6} y={winY0 + 14} textAnchor="end" className="fill-slate-300 text-[10px]">
                  Window Limit h_w = {windowAnalysis.hw_mm} mm
                </text>

                {/* Bottom Sub-Plot: 1D Spatial MMF F(x) Profile */}
                <rect x={winX0} y={mmfY0} width={winW} height={mmfH} fill="#090d16" stroke="#1e293b" />
                <line x1={winX0} y1={mmfZeroY} x2={winX0 + winW} y2={mmfZeroY} stroke="#334155" strokeDasharray="2 2" />
                <path d={mmfArea} fill="#a855f7" fillOpacity={0.22} />
                <path d={mmfPolyline} fill="none" stroke="#c084fc" strokeWidth={2.5} />

                <text x={winX0 - 8} y={mmfY0 + 14} textAnchor="end" className="fill-purple-400 text-[10px] font-bold">
                  +F_pk ({windowAnalysis.peakMmf_At.toFixed(0)} At)
                </text>
                <text x={winX0 - 8} y={mmfZeroY + 4} textAnchor="end" className="fill-slate-500 text-[10px]">
                  0 At
                </text>
                <text x={winX0 + 8} y={mmfY0 + mmfH - 6} className="fill-purple-300 text-[10px]">
                  Spatial Magnetomotive Force F(x) = ∫ J(x) dx across Window Radial Build x (mm)
                </text>

                {/* Right Side Legend & Layer Inspector Panel */}
                <g transform="translate(645, 22)">
                  <rect x={0} y={0} width={220} height={330} rx={6} fill="#0f172a" stroke="#1e293b" />
                  <text x={12} y={22} className="fill-cyan-400 text-[11px] font-bold">
                    LAYER STACKUP ({windowAnalysis.layers.length} LAYERS)
                  </text>

                  <circle cx={18} cy={40} r={4.5} fill="#38bdf8" />
                  <text x={28} y={43} className="fill-slate-300 text-[10px]">
                    Pri ({res.Np_actual}T, {state.priStrands}-str · {windowAnalysis.priPack.parallelInHand}×par)
                  </text>

                  <circle cx={18} cy={58} r={4.5} fill="#34d399" />
                  <text x={28} y={61} className="fill-slate-300 text-[10px]">
                    Sec ({res.Ns_actual}T, {state.secStrands}-str · {windowAnalysis.secPack.parallelInHand}×par)
                  </text>

                  <rect x={13} y={71} width={10} height={8} fill="#eab308" fillOpacity={0.5} />
                  <text x={28} y={78} className="fill-amber-300 text-[10px]">
                    IEC Margin Tape ({marginTape_mm} mm)
                  </text>

                  <line x1={12} y1={90} x2={208} y2={90} stroke="#1e293b" />

                  {windowAnalysis.layers.slice(0, 8).map((l, i) => (
                    <g key={l.index} transform={`translate(12, ${106 + i * 26})`}>
                      <text
                        x={0}
                        y={0}
                        className={`text-[10px] font-bold ${
                          l.role === 'primary' ? 'fill-cyan-300' : 'fill-emerald-300'
                        }`}
                      >
                        L{l.index + 1}: {l.label}
                      </text>
                      <text x={0} y={12} className="fill-slate-400 text-[9px]">
                        x=[{l.xStart_mm}..{l.xEnd_mm}mm] · |MMF|={Math.max(Math.abs(l.mmfStart_At), Math.abs(l.mmfEnd_At)).toFixed(0)}At
                      </text>
                    </g>
                  ))}
                </g>
              </g>
            );
          })()}
        </svg>
      </div>

      {/* ROW 3: INTERACTIVE ZOOMABLE 1D SPATIAL MMF F(x) & LEAKAGE H-FIELD CHART */}
      <InteractiveChart
        title="1D Spatial Magnetomotive Force F(x) & Leakage H-Field Profile Across Radial Window Build"
        subtitle={`Peak MMF F_pk = ${windowAnalysis.peakMmf_At.toFixed(1)} A·turns (${windowAnalysis.mmfReductionRatio.toFixed(1)}× reduction vs non-interleaved) · Radial Build = ${windowAnalysis.totalRadialBuild_mm} / ${windowAnalysis.hw_mm} mm`}
        data={windowAnalysis.spatialMmfCurve}
        xKey="x_mm"
        xLabel="x"
        xUnit="mm"
        domainEvaluator={windowAnalysis.evalSpatialMmfAtX}
        currentX={windowAnalysis.totalRadialBuild_mm}
        currentXLabel={`Build=${windowAnalysis.totalRadialBuild_mm}mm`}
        verticalMarkers={[
          {
            x: windowAnalysis.hw_mm,
            label: `Window Limit hw (${windowAnalysis.hw_mm}mm)`,
            color: '#f43f5e',
            dashed: true,
          },
        ]}
        series={[
          {
            key: 'mmf_At',
            name: 'Spatial MMF F(x)',
            unit: 'A·t',
            color: '#c084fc',
            axis: 'left',
          },
          {
            key: 'hField_kA_m',
            name: 'Inter-Layer Leakage Field H(x)',
            unit: 'kA/m',
            color: '#22d3ee',
            axis: 'right',
            dashed: true,
          },
        ]}
      />
    </div>
  );
};
