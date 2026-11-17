import React, { useState, useMemo } from 'react';
import {
  SemiconductorSpec,
  SEMICONDUCTOR_DATABASE,
  LCSC_AUXILIARY_BOM_DATABASE,
  registerCustomSemiconductor,
} from '../data/databases';
import {
  Search,
  X,
  ExternalLink,
  CheckCircle2,
  Cpu,
  Zap,
  Loader2,
  Database,
  ArrowRight,
  AlertCircle,
  Download,
  Package,
  Filter,
  Sliders,
  Settings,
} from 'lucide-react';
import {
  AI_PROVIDER_META,
  AiProviderConfig,
  toServerAiConfig,
  validateAiProviderConfig,
} from '../engine/aiProviderConfig';
import { AiProviderSettingsPanel } from './AiProviderSettingsPanel';

interface GroundingSource {
  uri: string;
  title: string;
}

interface ComponentSearchDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  activeDomain: 'dcdc' | 'acdc';
  operatingContext: {
    topology: string;
    Vin_V: number;
    Vout_V: number;
    Pout_W: number;
    fsw_kHz: number;
    Vsec_pk_V?: number;
  };
  currentPriDevice: SemiconductorSpec;
  currentSecDevice: SemiconductorSpec;
  currentPfcDevice: SemiconductorSpec;
  onEquipDcDcPrimary: (spec: SemiconductorSpec) => void;
  onEquipDcDcSecondary: (spec: SemiconductorSpec) => void;
  onEquipAcDcFastSwitch: (spec: SemiconductorSpec) => void;
  aiConfig: AiProviderConfig;
  onChangeAiConfig: (next: AiProviderConfig) => void;
}

const QUICK_LCSC_CHIPS = [
  {
    label: 'C2904521 · IMZA65R027M1H (650V 27mΩ SiC)',
    query: 'LCSC C2904521 Infineon IMZA65R027M1H 650V 27mOhm CoolSiC MOSFET datasheet',
  },
  {
    label: 'C2929104 · IMBG65R022M1H (650V 22mΩ SMD SiC)',
    query: 'LCSC C2929104 Infineon IMBG65R022M1H 650V 22mOhm D2PAK-7 SiC MOSFET',
  },
  {
    label: 'C2839098 · C3M0021120K (1200V 21mΩ SiC)',
    query: 'LCSC C2839098 Wolfspeed C3M0021120K 1200V 21mOhm SiC MOSFET TO-247-4',
  },
  {
    label: 'C2894510 · INN650D080BS (650V GaN DFN8x8)',
    query: 'LCSC C2894510 Innoscience INN650D080BS 650V 80mOhm GaN HEMT datasheet',
  },
  {
    label: 'C5129840 · CRJQ150N10G2 (100V 1.5mΩ TOLL SR)',
    query: 'LCSC C5129840 CR Micro CRJQ150N10G2 100V 1.5mOhm TOLL Synchronous Rectifier MOSFET',
  },
  {
    label: 'C2891044 · IPT007N06N (60V 0.75mΩ TOLL SR)',
    query: 'LCSC C2891044 Infineon IPT007N06N 60V 0.75mOhm TOLL OptiMOS SR MOSFET',
  },
];

export const ComponentSearchDrawer: React.FC<ComponentSearchDrawerProps> = ({
  isOpen,
  onClose,
  activeDomain,
  operatingContext,
  currentPriDevice,
  currentSecDevice,
  currentPfcDevice,
  onEquipDcDcPrimary,
  onEquipDcDcSecondary,
  onEquipAcDcFastSwitch,
  aiConfig,
  onChangeAiConfig,
}) => {
  const [drawerTab, setDrawerTab] = useState<'lcsc-catalog' | 'live-search' | 'jlcpcb-bom'>('lcsc-catalog');
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);

  // Local LCSC Catalog Filters
  const [catalogFilter, setCatalogFilter] = useState<string>('');
  const [techFilter, setTechFilter] = useState<string>('ALL');
  const [roleFilter, setRoleFilter] = useState<'ALL' | 'primary' | 'secondary'>('ALL');
  const [jlcClassFilter, setJlcClassFilter] = useState<'ALL' | 'SMD' | 'THT'>('ALL');

  // Live Grounded Search State
  const [query, setQuery] = useState<string>('C2904521 IMZA65R027M1H');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [searchSummary, setSearchSummary] = useState<string>('');
  const [results, setResults] = useState<SemiconductorSpec[]>([]);
  const [sources, setSources] = useState<GroundingSource[]>([]);
  const [selectedIdx, setSelectedIdx] = useState<number>(0);
  const [equippedBanner, setEquippedBanner] = useState<string | null>(null);

  // Auxiliary BOM Selection State
  const [selectedGateDriverLcsc, setSelectedGateDriverLcsc] = useState<string>('C2845912');
  const [selectedMcuLcsc, setSelectedMcuLcsc] = useState<string>('C2058119');

  const filteredCatalog = useMemo(() => {
    const q = catalogFilter.trim().toLowerCase();
    return SEMICONDUCTOR_DATABASE.filter((dev) => {
      if (techFilter !== 'ALL' && dev.tech !== techFilter) return false;
      if (roleFilter === 'primary' && dev.role === 'secondary') return false;
      if (roleFilter === 'secondary' && dev.role === 'primary') return false;
      if (jlcClassFilter === 'SMD' && dev.jlcpcbClass === 'Through-Hole') return false;
      if (jlcClassFilter === 'THT' && dev.jlcpcbClass !== 'Through-Hole') return false;
      if (!q) return true;
      return (
        dev.id.toLowerCase().includes(q) ||
        dev.name.toLowerCase().includes(q) ||
        (dev.lcscPartNumber || '').toLowerCase().includes(q) ||
        (dev.manufacturer || '').toLowerCase().includes(q) ||
        (dev.packageType || '').toLowerCase().includes(q) ||
        (dev.datasheetSummary || '').toLowerCase().includes(q)
      );
    });
  }, [catalogFilter, techFilter, roleFilter, jlcClassFilter]);

  if (!isOpen) return null;

  const runGroundedSearch = async (searchQuery: string) => {
    if (!searchQuery.trim()) return;
    setDrawerTab('live-search');

    const cfgError = validateAiProviderConfig(aiConfig);
    if (cfgError) {
      setError(cfgError);
      setSettingsOpen(true);
      return;
    }

    setLoading(true);
    setError(null);
    setEquippedBanner(null);

    try {
      const response = await fetch('/api/component-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: searchQuery,
          operatingContext: {
            domain: activeDomain,
            ...operatingContext,
          },
          aiConfig: toServerAiConfig(aiConfig),
        }),
      });

      const rawText = await response.text();
      let data: Record<string, unknown> = {};
      if (rawText) {
        try {
          data = JSON.parse(rawText) as Record<string, unknown>;
        } catch {
          throw new Error(
            `Component search returned non-JSON (${response.status}): ${rawText.replace(/<[^>]+>/g, ' ').trim().slice(0, 150)}`
          );
        }
      }
      if (!response.ok) {
        throw new Error(
          (typeof data.error === 'string' && data.error) || `Search request failed (${response.status})`
        );
      }

      const rawComponents = Array.isArray(data.components) ? data.components : [];
      const normalized: SemiconductorSpec[] = rawComponents.map((c: Record<string, unknown>) => {
        const techRaw = String(c.tech || 'SiC MOSFET');
        const validTech: SemiconductorSpec['tech'] =
          techRaw === 'GaN HEMT' ||
          techRaw === 'SJ Si MOSFET' ||
          techRaw === 'OptiMOS SR' ||
          techRaw === 'SiC Schottky'
            ? techRaw
            : 'SiC MOSFET';

        const roleRaw = String(c.role || 'both');
        const validRole: SemiconductorSpec['role'] =
          roleRaw === 'primary' || roleRaw === 'secondary' ? roleRaw : 'both';

        const jlcRaw = String(c.jlcpcbClass || 'Extended Part');
        const validJlc: SemiconductorSpec['jlcpcbClass'] =
          jlcRaw === 'Basic Part' || jlcRaw === 'Through-Hole' ? jlcRaw : 'Extended Part';

        const lcscCode = String(c.lcscPartNumber || '').trim();

        return {
          id: String(c.id || 'CUSTOM_FET'),
          name: String(c.name || c.id || 'LCSC Grounded Semiconductor'),
          manufacturer: String(c.manufacturer || 'OEM'),
          packageType: String(c.packageType || 'TO-247-4'),
          lcscPartNumber: lcscCode || 'C2904521',
          jlcpcbClass: validJlc,
          lcscStock: Number(c.lcscStock) || 1200,
          tech: validTech,
          role: validRole,
          Vds_max_V: Number(c.Vds_max_V) || 650,
          Id_max_A: Number(c.Id_max_A) || 60,
          Rds_on_25C_mOhm: Number(c.Rds_on_25C_mOhm) || 25,
          alpha_R_per_C: Number(c.alpha_R_per_C) || 0.004,
          Coss_er_pF: Number(c.Coss_er_pF) || 140,
          Coss_tr_pF: Number(c.Coss_tr_pF) || 210,
          Qg_nC: Number(c.Qg_nC) || 52,
          Qgd_nC: Number(c.Qgd_nC) || 16,
          Rg_int_Ohm: Number(c.Rg_int_Ohm) || 1.8,
          Qrr_nC: Number(c.Qrr_nC) || 0,
          Vsd_V: Number(c.Vsd_V) || 3.8,
          tr_ns: Number(c.tr_ns) || 12,
          tf_ns: Number(c.tf_ns) || 8,
          Rth_JC_CW: Number(c.Rth_JC_CW) || 0.42,
          kelvinSource: Boolean(c.kelvinSource ?? true),
          unitPrice_USD: Number(c.unitPrice_USD) || 0,
          distributorSku: String(c.distributorSku || `LCSC ${lcscCode || 'Catalog'} / DigiKey`),
          datasheetSummary: String(c.datasheetSummary || ''),
          isCustomGrounded: true,
        };
      });

      setSearchSummary(typeof data.searchSummary === 'string' ? data.searchSummary : '');
      setResults(normalized);
      setSources(Array.isArray(data.sources) ? data.sources : []);
      setSelectedIdx(0);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to fetch LCSC / datasheet parameters.');
    } finally {
      setLoading(false);
    }
  };

  const handleAutoRecommendForSpecs = () => {
    const vPri = Math.round(operatingContext.Vin_V * 1.5);
    const vSec = Math.round((operatingContext.Vsec_pk_V || operatingContext.Vout_V * 2.2) * 1.35);
    const autoQ =
      activeDomain === 'acdc'
        ? `Best in-stock LCSC (lcsc.com) C-number ${vPri}V low Rds(on) SiC MOSFET or GaN HEMT for ${operatingContext.Pout_W}W ${operatingContext.fsw_kHz}kHz Totem-Pole PFC`
        : `Best in-stock LCSC (lcsc.com) C-number ${vPri}V primary SiC/GaN MOSFET and ${vSec}V low-Rds TOLL synchronous rectifier MOSFET for ${operatingContext.Pout_W}W ${operatingContext.Vin_V}V to ${operatingContext.Vout_V}V ${operatingContext.topology.toUpperCase()} converter`;
    setQuery(autoQ);
    runGroundedSearch(autoQ);
  };

  const handleInspectInEditor = (part: SemiconductorSpec) => {
    setResults([{ ...part }]);
    setSelectedIdx(0);
    setSearchSummary(
      `Loaded ${part.id} (${part.lcscPartNumber ? `LCSC ${part.lcscPartNumber}` : 'Catalog'}) into parameter inspector for custom tuning or replacement.`
    );
    setDrawerTab('live-search');
  };

  const activePart = results[selectedIdx] || null;

  const updateActivePartField = <K extends keyof SemiconductorSpec>(
    key: K,
    val: SemiconductorSpec[K]
  ) => {
    if (!activePart) return;
    const next = [...results];
    next[selectedIdx] = {
      ...activePart,
      [key]: val,
    };
    setResults(next);
  };

  const handleEquip = (partToEquip: SemiconductorSpec, target: 'pri' | 'sec' | 'pfc' | 'library') => {
    const saved = partToEquip.isCustomGrounded
      ? registerCustomSemiconductor(partToEquip)
      : partToEquip;
    const lcscTag = saved.lcscPartNumber ? ` [LCSC ${saved.lcscPartNumber}]` : '';
    if (target === 'pri') {
      onEquipDcDcPrimary(saved);
      setEquippedBanner(
        `Equipped ${saved.id}${lcscTag} as DC-DC Primary Bridge Switch & recalculated electro-thermal model.`
      );
    } else if (target === 'sec') {
      onEquipDcDcSecondary(saved);
      setEquippedBanner(
        `Equipped ${saved.id}${lcscTag} as DC-DC Secondary Rectifier (SR) & recalculated ringing/losses.`
      );
    } else if (target === 'pfc') {
      onEquipAcDcFastSwitch(saved);
      setEquippedBanner(
        `Equipped ${saved.id}${lcscTag} as AC-DC Fast Leg Switch & recalculated PFC efficiency.`
      );
    } else {
      registerCustomSemiconductor(partToEquip);
      setEquippedBanner(
        `Saved ${saved.id}${lcscTag} into active LCSC Semiconductor Database (${SEMICONDUCTOR_DATABASE.length} parts).`
      );
    }
  };

  const handleExportJlcpcbBomCsv = () => {
    const gateDrv =
      LCSC_AUXILIARY_BOM_DATABASE.find((p) => p.lcscPartNumber === selectedGateDriverLcsc) ||
      LCSC_AUXILIARY_BOM_DATABASE[0];
    const mcu =
      LCSC_AUXILIARY_BOM_DATABASE.find((p) => p.lcscPartNumber === selectedMcuLcsc) ||
      LCSC_AUXILIARY_BOM_DATABASE[2];
    const csAmp = LCSC_AUXILIARY_BOM_DATABASE[4];
    const filmCap = LCSC_AUXILIARY_BOM_DATABASE[6];
    const busCap = LCSC_AUXILIARY_BOM_DATABASE[7];
    const clampDiode = LCSC_AUXILIARY_BOM_DATABASE[8];

    const rows: { comment: string; designator: string; footprint: string; lcsc: string; qty: number; unitUsd: number }[] =
      activeDomain === 'dcdc'
        ? [
            {
              comment: `${currentPriDevice.id} (${currentPriDevice.tech} ${currentPriDevice.Vds_max_V}V ${currentPriDevice.Rds_on_25C_mOhm}mOhm)`,
              designator: 'Q1,Q2,Q3,Q4',
              footprint: currentPriDevice.packageType || 'TO-247-4',
              lcsc: currentPriDevice.lcscPartNumber || 'C2904521',
              qty: 4,
              unitUsd: currentPriDevice.unitPrice_USD || 8.95,
            },
            {
              comment: `${currentSecDevice.id} (${currentSecDevice.tech} ${currentSecDevice.Vds_max_V}V ${currentSecDevice.Rds_on_25C_mOhm}mOhm)`,
              designator: 'SR1,SR2,SR3,SR4',
              footprint: currentSecDevice.packageType || 'PG-HSOF-8-TOLL',
              lcsc: currentSecDevice.lcscPartNumber || 'C2931840',
              qty: 4,
              unitUsd: currentSecDevice.unitPrice_USD || 3.85,
            },
            {
              comment: `${gateDrv.mpn} (${gateDrv.description})`,
              designator: 'U1,U2,U3,U4',
              footprint: gateDrv.packageType,
              lcsc: gateDrv.lcscPartNumber,
              qty: 4,
              unitUsd: gateDrv.unitPrice_USD,
            },
            {
              comment: `${mcu.mpn} (${mcu.description})`,
              designator: 'U5',
              footprint: mcu.packageType,
              lcsc: mcu.lcscPartNumber,
              qty: 1,
              unitUsd: mcu.unitPrice_USD,
            },
            {
              comment: `${csAmp.mpn} (${csAmp.description})`,
              designator: 'U6,U7',
              footprint: csAmp.packageType,
              lcsc: csAmp.lcscPartNumber,
              qty: 2,
              unitUsd: csAmp.unitPrice_USD,
            },
            {
              comment: `${filmCap.mpn} (Resonant / Primary Blocking Film Cap)`,
              designator: 'Cr1,Cr2',
              footprint: filmCap.packageType,
              lcsc: filmCap.lcscPartNumber,
              qty: 2,
              unitUsd: filmCap.unitPrice_USD,
            },
            {
              comment: `${clampDiode.mpn} (Primary Circulating Clamp SiC Diode)`,
              designator: 'D_CLP1,D_CLP2',
              footprint: clampDiode.packageType,
              lcsc: clampDiode.lcscPartNumber,
              qty: 2,
              unitUsd: clampDiode.unitPrice_USD,
            },
          ]
        : [
            {
              comment: `${currentPfcDevice.id} (${currentPfcDevice.tech} ${currentPfcDevice.Vds_max_V}V ${currentPfcDevice.Rds_on_25C_mOhm}mOhm)`,
              designator: 'Q_PH1_H,Q_PH1_L,Q_PH2_H,Q_PH2_L',
              footprint: currentPfcDevice.packageType || 'TO-247-4',
              lcsc: currentPfcDevice.lcscPartNumber || 'C2904521',
              qty: 4,
              unitUsd: currentPfcDevice.unitPrice_USD || 8.95,
            },
            {
              comment: `${gateDrv.mpn} (Isolated Totem-Pole Gate Driver)`,
              designator: 'U1,U2,U3,U4',
              footprint: gateDrv.packageType,
              lcsc: gateDrv.lcscPartNumber,
              qty: 4,
              unitUsd: gateDrv.unitPrice_USD,
            },
            {
              comment: `${mcu.mpn} (Digital PFC Controller)`,
              designator: 'U5',
              footprint: mcu.packageType,
              lcsc: mcu.lcscPartNumber,
              qty: 1,
              unitUsd: mcu.unitPrice_USD,
            },
            {
              comment: `${csAmp.mpn} (Phase Current Sense Amplifier)`,
              designator: 'U6,U7',
              footprint: csAmp.packageType,
              lcsc: csAmp.lcscPartNumber,
              qty: 2,
              unitUsd: csAmp.unitPrice_USD,
            },
            {
              comment: `${busCap.mpn} (DC-Link High-Ripple Film Cap)`,
              designator: 'C_BUS1,C_BUS2,C_BUS3,C_BUS4',
              footprint: busCap.packageType,
              lcsc: busCap.lcscPartNumber,
              qty: 4,
              unitUsd: busCap.unitPrice_USD,
            },
          ];

    const csvHeader = 'Comment,Designator,Footprint,LCSC Part #,Quantity,Est Unit Price (USD)\n';
    const csvLines = rows
      .map(
        (r) =>
          `"${r.comment.replace(/"/g, '""')}","${r.designator}","${r.footprint}","${r.lcsc}",${r.qty},${r.unitUsd.toFixed(2)}`
      )
      .join('\n');

    const blob = new Blob([csvHeader + csvLines], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `JLCPCB_LCSC_BOM_${activeDomain}_${operatingContext.topology}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setEquippedBanner(
      `Exported JLCPCB / LCSC SMT BOM CSV (${rows.length} line items with C-numbers) for ${operatingContext.topology.toUpperCase()}.`
    );
  };

  const refCompareDevice =
    activePart?.role === 'secondary'
      ? currentSecDevice
      : activeDomain === 'acdc'
      ? currentPfcDevice
      : currentPriDevice;

  const formatDelta = (newVal: number, oldVal: number, unit: string, lowerIsBetter = true) => {
    const diff = newVal - oldVal;
    if (Math.abs(diff) < 1e-3) return <span className="text-slate-500">0 {unit}</span>;
    const good = lowerIsBetter ? diff < 0 : diff > 0;
    const sign = diff > 0 ? '+' : '';
    return (
      <span className={good ? 'text-emerald-400 font-semibold' : 'text-amber-400'}>
        ({sign}
        {diff.toFixed(diff % 1 === 0 ? 0 : 2)}
        {unit})
      </span>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/70 backdrop-blur-xs">
      <div className="w-full max-w-3xl bg-white dark:bg-[#0F172A] border-l border-slate-200 dark:border-slate-800 h-full flex flex-col shadow-2xl overflow-hidden">
        {/* Drawer Header */}
        <div className="px-4 py-3 bg-slate-50 dark:bg-[#111827] border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded bg-cyan-500/15 border border-cyan-500/40 flex items-center justify-center text-cyan-400 font-mono font-bold text-xs">
              LCSC
            </div>
            <div>
              <div className="text-sm font-bold font-mono text-slate-900 dark:text-slate-100 flex flex-wrap items-center gap-2">
                LCSC / JLCPCB &amp; DigiKey Component Database
                <span className="px-1.5 py-0.5 text-[10px] rounded bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">
                  {SEMICONDUCTOR_DATABASE.length} Power Switches + C-Numbers
                </span>
                <span className="px-1.5 py-0.5 text-[10px] rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  {AI_PROVIDER_META[aiConfig.provider].supportsWebSearch
                    ? 'Live Search Grounded'
                    : `${AI_PROVIDER_META[aiConfig.provider].shortLabel} Datasheet Lookup`}
                </span>
              </div>
              <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                Browse LCSC C-numbers, pull live datasheets, replace model parameters, and export JLCPCB SMT BOM CSV
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                setDrawerTab('live-search');
                setSettingsOpen((s) => !s);
              }}
              className="px-2.5 py-1.5 text-[11px] font-mono font-medium rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:border-cyan-500 inline-flex items-center gap-1 cursor-pointer"
              title={`Configure AI Provider & API Key (${AI_PROVIDER_META[aiConfig.provider].label})`}
            >
              <Settings className="w-3.5 h-3.5 text-cyan-500" />
              <span>{AI_PROVIDER_META[aiConfig.provider].shortLabel} Key</span>
            </button>
            <button
              type="button"
              onClick={handleExportJlcpcbBomCsv}
              className="px-2.5 py-1.5 text-[11px] font-mono font-semibold rounded bg-emerald-600 hover:bg-emerald-500 text-white inline-flex items-center gap-1 cursor-pointer"
              title="Download JLCPCB / LCSC compatible BOM CSV with C-numbers"
            >
              <Download className="w-3.5 h-3.5" />
              Export LCSC BOM (.csv)
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 3-Mode Navigation Sub-Tabs */}
        <div className="px-4 py-2 bg-slate-100/80 dark:bg-slate-900/90 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setDrawerTab('lcsc-catalog')}
              className={`px-3 py-1.5 text-xs font-mono rounded transition-colors inline-flex items-center gap-1.5 cursor-pointer ${
                drawerTab === 'lcsc-catalog'
                  ? 'bg-cyan-600 text-white font-semibold'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
              }`}
            >
              <Database className="w-3.5 h-3.5" />
              1. LCSC Semiconductor Catalog ({SEMICONDUCTOR_DATABASE.length})
            </button>
            <button
              type="button"
              onClick={() => setDrawerTab('live-search')}
              className={`px-3 py-1.5 text-xs font-mono rounded transition-colors inline-flex items-center gap-1.5 cursor-pointer ${
                drawerTab === 'live-search'
                  ? 'bg-cyan-600 text-white font-semibold'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
              }`}
            >
              <Search className="w-3.5 h-3.5" />
              2. Live LCSC (C#) / Datasheet Lookup
            </button>
            <button
              type="button"
              onClick={() => setDrawerTab('jlcpcb-bom')}
              className={`px-3 py-1.5 text-xs font-mono rounded transition-colors inline-flex items-center gap-1.5 cursor-pointer ${
                drawerTab === 'jlcpcb-bom'
                  ? 'bg-cyan-600 text-white font-semibold'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
              }`}
            >
              <Package className="w-3.5 h-3.5" />
              3. JLCPCB / LCSC Full Converter BOM
            </button>
          </div>
        </div>

        {/* Equipped / Export Confirmation Banner */}
        {equippedBanner && (
          <div className="mx-4 mt-3 p-2.5 rounded bg-emerald-500/15 border border-emerald-500/40 text-xs font-mono text-emerald-300 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{equippedBanner}</span>
            </div>
            <button
              type="button"
              onClick={() => setEquippedBanner(null)}
              className="text-slate-400 hover:text-white text-[10px]"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Currently Equipped Active Converter Devices Strip */}
        <div className="mx-4 mt-3 p-2.5 rounded bg-slate-50 dark:bg-[#111827] border border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] font-mono">
          <div className="flex items-center justify-between sm:block">
            <div className="text-[10px] uppercase text-slate-400">Active DC-DC Primary</div>
            <div className="font-bold text-cyan-400 truncate">
              {currentPriDevice.id}{' '}
              {currentPriDevice.lcscPartNumber && (
                <span className="text-[10px] px-1 py-0.2 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                  {currentPriDevice.lcscPartNumber}
                </span>
              )}
            </div>
            <div className="text-[10px] text-slate-500">
              {currentPriDevice.Vds_max_V}V · {currentPriDevice.Rds_on_25C_mOhm}mΩ · {currentPriDevice.Coss_er_pF}pF
            </div>
          </div>

          <div className="flex items-center justify-between sm:block border-t sm:border-t-0 sm:border-l border-slate-200 dark:border-slate-800 pt-1.5 sm:pt-0 sm:pl-2.5">
            <div className="text-[10px] uppercase text-slate-400">Active DC-DC Secondary SR</div>
            <div className="font-bold text-emerald-400 truncate">
              {currentSecDevice.id}{' '}
              {currentSecDevice.lcscPartNumber && (
                <span className="text-[10px] px-1 py-0.2 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                  {currentSecDevice.lcscPartNumber}
                </span>
              )}
            </div>
            <div className="text-[10px] text-slate-500">
              {currentSecDevice.Vds_max_V}V · {currentSecDevice.Rds_on_25C_mOhm}mΩ · Qrr={currentSecDevice.Qrr_nC}nC
            </div>
          </div>

          <div className="flex items-center justify-between sm:block border-t sm:border-t-0 sm:border-l border-slate-200 dark:border-slate-800 pt-1.5 sm:pt-0 sm:pl-2.5">
            <div className="text-[10px] uppercase text-slate-400">Active AC-DC PFC Switch</div>
            <div className="font-bold text-purple-400 truncate">
              {currentPfcDevice.id}{' '}
              {currentPfcDevice.lcscPartNumber && (
                <span className="text-[10px] px-1 py-0.2 rounded bg-purple-500/15 text-purple-300 border border-purple-500/30">
                  {currentPfcDevice.lcscPartNumber}
                </span>
              )}
            </div>
            <div className="text-[10px] text-slate-500">
              {currentPfcDevice.Vds_max_V}V · {currentPfcDevice.Rds_on_25C_mOhm}mΩ · Qg={currentPfcDevice.Qg_nC}nC
            </div>
          </div>
        </div>

        {/* Scrollable Main Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* =====================================================================
              TAB 1: BUILT-IN LCSC POWER SEMICONDUCTOR CATALOG
             ===================================================================== */}
          {drawerTab === 'lcsc-catalog' && (
            <div className="space-y-3">
              {/* Filter Bar */}
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#111827] border border-slate-200 dark:border-slate-800 space-y-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative flex-1 min-w-[220px]">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                    <input
                      type="text"
                      value={catalogFilter}
                      onChange={(e) => setCatalogFilter(e.target.value)}
                      placeholder="Filter by LCSC C-Number (e.g. C2904521, C96748), MPN, Package, or Brand..."
                      className="w-full pl-8 pr-3 py-1.5 text-xs font-mono bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded text-slate-900 dark:text-slate-100"
                    />
                  </div>
                  <select
                    value={roleFilter}
                    onChange={(e) => setRoleFilter(e.target.value as 'ALL' | 'primary' | 'secondary')}
                    className="px-2.5 py-1.5 text-xs font-mono bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded"
                  >
                    <option value="ALL">All Converter Roles</option>
                    <option value="primary">Primary / PFC Switches (≥600V)</option>
                    <option value="secondary">Secondary SR / Rectifiers</option>
                  </select>
                  <select
                    value={jlcClassFilter}
                    onChange={(e) => setJlcClassFilter(e.target.value as 'ALL' | 'SMD' | 'THT')}
                    className="px-2.5 py-1.5 text-xs font-mono bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded"
                  >
                    <option value="ALL">All JLCPCB Classes</option>
                    <option value="SMD">SMD (JLCPCB Pick &amp; Place)</option>
                    <option value="THT">Through-Hole (TO-247 / TO-220)</option>
                  </select>
                </div>

                {/* Technology Filter Pills */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1">
                    <Filter className="w-3 h-3 text-slate-400 mr-1" />
                    {['ALL', 'SiC MOSFET', 'GaN HEMT', 'SJ Si MOSFET', 'OptiMOS SR', 'SiC Schottky'].map(
                      (tech) => (
                        <button
                          key={tech}
                          type="button"
                          onClick={() => setTechFilter(tech)}
                          className={`px-2 py-0.5 text-[10px] font-mono rounded border transition-colors cursor-pointer ${
                            techFilter === tech
                              ? 'bg-cyan-600 text-white border-cyan-500 font-semibold'
                              : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          {tech}
                        </button>
                      )
                    )}
                  </div>
                  <span className="text-[11px] font-mono text-slate-400">
                    Showing {filteredCatalog.length} of {SEMICONDUCTOR_DATABASE.length} LCSC parts
                  </span>
                </div>
              </div>

              {/* LCSC Catalog Cards */}
              <div className="space-y-2">
                {filteredCatalog.map((dev) => {
                  const isPriEquipped = dev.id === currentPriDevice.id;
                  const isSecEquipped = dev.id === currentSecDevice.id;
                  const isPfcEquipped = dev.id === currentPfcDevice.id;
                  const lcscSearchHref = `https://www.lcsc.com/search?q=${encodeURIComponent(
                    dev.lcscPartNumber || dev.id
                  )}`;

                  return (
                    <div
                      key={dev.id}
                      className={`p-3 rounded-lg border transition-colors font-mono text-xs ${
                        isPriEquipped || isSecEquipped || isPfcEquipped
                          ? 'bg-cyan-500/10 border-cyan-500/50'
                          : 'bg-slate-50 dark:bg-[#111827] border-slate-200 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-700'
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-sm font-bold text-slate-900 dark:text-white">
                              {dev.id}
                            </span>
                            {dev.lcscPartNumber && (
                              <a
                                href={lcscSearchHref}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-2 py-0.5 text-[10px] font-bold rounded bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 inline-flex items-center gap-1"
                                title="Open part on LCSC.com"
                              >
                                LCSC {dev.lcscPartNumber}
                                <ExternalLink className="w-2.5 h-2.5" />
                              </a>
                            )}
                            <span className="px-1.5 py-0.5 text-[10px] rounded bg-purple-500/15 text-purple-300 border border-purple-500/30">
                              {dev.tech}
                            </span>
                            <span className="px-1.5 py-0.5 text-[10px] rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                              {dev.packageType || 'TO-247-4'}
                            </span>
                            {dev.jlcpcbClass && (
                              <span
                                className={`px-1.5 py-0.5 text-[10px] rounded border ${
                                  dev.jlcpcbClass === 'Through-Hole'
                                    ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                                    : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                                }`}
                              >
                                JLCPCB {dev.jlcpcbClass}
                              </span>
                            )}
                          </div>

                          <div className="text-[11px] text-slate-600 dark:text-slate-300">
                            {dev.manufacturer} ·{' '}
                            {dev.datasheetSummary || `${dev.Vds_max_V}V ${dev.Rds_on_25C_mOhm}mΩ ${dev.tech}`}
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          {dev.unitPrice_USD ? (
                            <div className="text-emerald-400 font-bold">
                              ${dev.unitPrice_USD.toFixed(2)} <span className="text-[10px] font-normal">/pc</span>
                            </div>
                          ) : null}
                          {dev.lcscStock !== undefined && (
                            <div className="text-[10px] text-slate-400">
                              LCSC Stock: <span className="text-slate-200">{dev.lcscStock.toLocaleString()}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Parametric Spec Strip */}
                      <div className="mt-2 pt-2 border-t border-slate-200/70 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400">
                          <span>
                            Vds: <strong className="text-slate-800 dark:text-slate-200">{dev.Vds_max_V}V</strong>
                          </span>
                          <span>
                            Rds(on):{' '}
                            <strong className="text-amber-400">{dev.Rds_on_25C_mOhm}mΩ</strong>
                          </span>
                          <span>
                            Coss(er):{' '}
                            <strong className="text-cyan-400">{dev.Coss_er_pF}pF</strong>
                          </span>
                          <span>
                            Qg: <strong className="text-emerald-400">{dev.Qg_nC}nC</strong>
                          </span>
                          <span>
                            Qrr: <strong className="text-rose-400">{dev.Qrr_nC}nC</strong>
                          </span>
                          <span>
                            RthJC: <strong className="text-purple-400">{dev.Rth_JC_CW}°C/W</strong>
                          </span>
                        </div>

                        {/* 1-Click Equip Buttons */}
                        <div className="flex flex-wrap items-center gap-1.5">
                          {dev.role !== 'secondary' && (
                            <button
                              type="button"
                              onClick={() => handleEquip(dev, 'pri')}
                              className={`px-2 py-1 text-[10px] rounded border cursor-pointer ${
                                isPriEquipped
                                  ? 'bg-cyan-600 text-white border-cyan-400 font-bold'
                                  : 'bg-cyan-600/15 hover:bg-cyan-600/30 text-cyan-300 border-cyan-500/40'
                              }`}
                            >
                              {isPriEquipped ? '✓ Pri Equipped' : 'Equip Primary'}
                            </button>
                          )}
                          {dev.role !== 'primary' && (
                            <button
                              type="button"
                              onClick={() => handleEquip(dev, 'sec')}
                              className={`px-2 py-1 text-[10px] rounded border cursor-pointer ${
                                isSecEquipped
                                  ? 'bg-emerald-600 text-white border-emerald-400 font-bold'
                                  : 'bg-emerald-600/15 hover:bg-emerald-600/30 text-emerald-300 border-emerald-500/40'
                              }`}
                            >
                              {isSecEquipped ? '✓ SR Equipped' : 'Equip Sec SR'}
                            </button>
                          )}
                          {dev.role !== 'secondary' && (
                            <button
                              type="button"
                              onClick={() => handleEquip(dev, 'pfc')}
                              className={`px-2 py-1 text-[10px] rounded border cursor-pointer ${
                                isPfcEquipped
                                  ? 'bg-purple-600 text-white border-purple-400 font-bold'
                                  : 'bg-purple-600/15 hover:bg-purple-600/30 text-purple-300 border-purple-500/40'
                              }`}
                            >
                              {isPfcEquipped ? '✓ PFC Equipped' : 'Equip PFC'}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleInspectInEditor(dev)}
                            className="px-2 py-1 text-[10px] rounded bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 inline-flex items-center gap-1 cursor-pointer"
                            title="Inspect delta vs current device & edit parameters"
                          >
                            <Sliders className="w-2.5 h-2.5" />
                            Edit/Diff
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* =====================================================================
              TAB 2: LIVE LCSC (C#) / DIGIKEY / DATASHEET GROUNDED SEARCH
             ===================================================================== */}
          {drawerTab === 'live-search' && (
            <div className="space-y-4">
              {/* Active AI Provider Bar & Expandable Settings */}
              <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-[#111827] border border-slate-200 dark:border-slate-800 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono">
                  <div className="text-slate-600 dark:text-slate-300 truncate">
                    AI Engine:{' '}
                    <span className="font-semibold text-cyan-600 dark:text-cyan-400">
                      {AI_PROVIDER_META[aiConfig.provider].label}
                    </span>{' '}
                    · <span className="text-slate-500 dark:text-slate-400">{aiConfig.model}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSettingsOpen((s) => !s)}
                    className="px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-cyan-500 text-[11px] font-medium text-slate-700 dark:text-slate-200 inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Settings className="w-3 h-3 text-cyan-500" />
                    <span>{settingsOpen ? 'Hide Provider Settings' : 'Provider & API Key'}</span>
                  </button>
                </div>
                {settingsOpen && (
                  <AiProviderSettingsPanel
                    aiConfig={aiConfig}
                    onChangeAiConfig={onChangeAiConfig}
                    compact
                    onClose={() => setSettingsOpen(false)}
                  />
                )}
              </div>

              <div className="space-y-2">
                <label className="block text-[11px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Live Search by LCSC Part Number (Cxxxxxx), MPN, or Converter Spec
                </label>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    runGroundedSearch(query);
                  }}
                  className="flex gap-2"
                >
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="e.g. C2904521, C5129840, IMZA65R020M2H, IPT007N06N, or 650V 20mOhm SiC LCSC..."
                    className="flex-1 px-3 py-2 text-xs font-mono bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded text-slate-900 dark:text-slate-100"
                  />
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-4 py-2 text-xs font-mono font-semibold bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white rounded inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Grounding LCSC...
                      </>
                    ) : (
                      <>
                        <Search className="w-3.5 h-3.5" /> Pull LCSC &amp; Datasheet
                      </>
                    )}
                  </button>
                </form>

                {/* 1-Click Auto-Find for Current Converter Specs */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleAutoRecommendForSpecs}
                    disabled={loading}
                    className="px-2.5 py-1.5 text-[11px] font-mono bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-400 rounded inline-flex items-center gap-1.5 font-semibold cursor-pointer"
                  >
                    <Search className="w-3.5 h-3.5" />
                    Auto-Find In-Stock LCSC Parts for {operatingContext.Vin_V}V→{operatingContext.Vout_V}V (
                    {operatingContext.Pout_W}W)
                  </button>
                </div>

                {/* Quick LCSC C-Number Chips */}
                <div className="pt-1">
                  <div className="text-[10px] font-mono uppercase text-slate-400 mb-1">
                    Quick-Pull LCSC C-Numbers &amp; Datasheets:
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {QUICK_LCSC_CHIPS.map((chip) => (
                      <button
                        key={chip.label}
                        type="button"
                        onClick={() => {
                          setQuery(chip.query);
                          runGroundedSearch(chip.query);
                        }}
                        className="px-2 py-1 text-[11px] font-mono bg-slate-100 dark:bg-slate-800/90 hover:border-cyan-500/50 border border-slate-300 dark:border-slate-700 rounded text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
                      >
                        {chip.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Error Banner */}
              {error && (
                <div className="p-3 rounded bg-rose-500/15 border border-rose-500/40 text-xs font-mono text-rose-300 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <div>{error}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSettingsOpen(true)}
                    className="px-2.5 py-1 rounded border border-rose-400/50 bg-rose-950/40 hover:border-cyan-400 text-[11px] font-medium text-rose-200 cursor-pointer shrink-0"
                  >
                    Configure API Key
                  </button>
                </div>
              )}

              {/* Search Results & Parameter Replacement Inspector */}
              {results.length > 0 && activePart && (
                <div className="space-y-3">
                  {searchSummary && (
                    <div className="p-2.5 rounded bg-slate-100 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 text-xs font-mono text-slate-600 dark:text-slate-300">
                      {searchSummary}
                    </div>
                  )}

                  {/* Candidate Selector Tabs if multiple devices returned */}
                  {results.length > 1 && (
                    <div className="flex flex-wrap gap-1.5">
                      {results.map((r, idx) => (
                        <button
                          key={r.id + idx}
                          type="button"
                          onClick={() => setSelectedIdx(idx)}
                          className={`px-2.5 py-1.5 text-xs font-mono rounded border transition-colors cursor-pointer ${
                            selectedIdx === idx
                              ? 'bg-cyan-600 text-white border-cyan-400 font-semibold'
                              : 'bg-slate-100 dark:bg-slate-900 border-slate-300 dark:border-slate-800 text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          {r.id} {r.lcscPartNumber ? `[${r.lcscPartNumber}]` : ''} ({r.Vds_max_V}V ·{' '}
                          {r.Rds_on_25C_mOhm}mΩ)
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Selected Part Datasheet Card */}
                  <div className="bg-slate-50 dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg p-3.5 space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-2.5">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-bold font-mono text-cyan-400">{activePart.id}</span>
                          {activePart.lcscPartNumber && (
                            <a
                              href={`https://www.lcsc.com/search?q=${encodeURIComponent(
                                activePart.lcscPartNumber
                              )}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-2 py-0.5 text-[10px] font-mono font-bold rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 inline-flex items-center gap-1"
                            >
                              LCSC {activePart.lcscPartNumber}
                              <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          )}
                          <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-purple-500/15 text-purple-300 border border-purple-500/30">
                            {activePart.tech}
                          </span>
                          <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-slate-800 text-slate-300">
                            {activePart.packageType}{' '}
                            {activePart.kelvinSource ? '(4-Pin Kelvin)' : '(3-Pin)'}
                          </span>
                        </div>
                        <div className="text-xs font-mono text-slate-600 dark:text-slate-300 mt-0.5">
                          {activePart.name} · {activePart.manufacturer}
                        </div>
                        {activePart.datasheetSummary && (
                          <div className="text-[11px] font-mono text-slate-400 mt-1">
                            {activePart.datasheetSummary}
                          </div>
                        )}
                      </div>
                      <div className="text-right font-mono text-xs">
                        {activePart.unitPrice_USD ? (
                          <div className="text-emerald-400 font-bold">
                            ~${activePart.unitPrice_USD.toFixed(2)} USD
                          </div>
                        ) : null}
                        <div className="text-[10px] text-slate-400">{activePart.distributorSku}</div>
                      </div>
                    </div>

                    {/* Editable Grounded Datasheet Parameters vs Currently Equipped Device */}
                    <div className="text-[11px] font-mono text-slate-400 flex items-center justify-between">
                      <span>Extracted LCSC &amp; Datasheet Parameters (Editable before applying):</span>
                      <span>
                        Comparing vs Equipped:{' '}
                        <strong className="text-cyan-300">{refCompareDevice.id}</strong>
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs font-mono">
                      <div className="p-2 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                        <div className="text-[10px] text-slate-400">LCSC Part # (C-Code)</div>
                        <input
                          type="text"
                          value={activePart.lcscPartNumber || ''}
                          onChange={(e) => updateActivePartField('lcscPartNumber', e.target.value)}
                          className="w-full mt-1 px-1.5 py-0.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded font-bold text-cyan-400"
                        />
                      </div>

                      <div className="p-2 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                        <div className="text-[10px] text-slate-400 flex justify-between">
                          <span>Vds,max (V)</span>
                          {formatDelta(activePart.Vds_max_V, refCompareDevice.Vds_max_V, 'V', false)}
                        </div>
                        <input
                          type="number"
                          value={activePart.Vds_max_V}
                          onChange={(e) => updateActivePartField('Vds_max_V', Number(e.target.value))}
                          className="w-full mt-1 px-1.5 py-0.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded font-bold text-slate-900 dark:text-white"
                        />
                      </div>

                      <div className="p-2 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                        <div className="text-[10px] text-slate-400 flex justify-between">
                          <span>Rds,on @25°C (mΩ)</span>
                          {formatDelta(
                            activePart.Rds_on_25C_mOhm,
                            refCompareDevice.Rds_on_25C_mOhm,
                            'mΩ',
                            true
                          )}
                        </div>
                        <input
                          type="number"
                          step={0.1}
                          value={activePart.Rds_on_25C_mOhm}
                          onChange={(e) =>
                            updateActivePartField('Rds_on_25C_mOhm', Number(e.target.value))
                          }
                          className="w-full mt-1 px-1.5 py-0.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded font-bold text-amber-400"
                        />
                      </div>

                      <div className="p-2 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                        <div className="text-[10px] text-slate-400 flex justify-between">
                          <span>Coss(er) (pF)</span>
                          {formatDelta(activePart.Coss_er_pF, refCompareDevice.Coss_er_pF, 'pF', true)}
                        </div>
                        <input
                          type="number"
                          value={activePart.Coss_er_pF}
                          onChange={(e) => updateActivePartField('Coss_er_pF', Number(e.target.value))}
                          className="w-full mt-1 px-1.5 py-0.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded font-bold text-cyan-400"
                        />
                      </div>

                      <div className="p-2 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                        <div className="text-[10px] text-slate-400 flex justify-between">
                          <span>Qg Total (nC)</span>
                          {formatDelta(activePart.Qg_nC, refCompareDevice.Qg_nC, 'nC', true)}
                        </div>
                        <input
                          type="number"
                          step={0.5}
                          value={activePart.Qg_nC}
                          onChange={(e) => updateActivePartField('Qg_nC', Number(e.target.value))}
                          className="w-full mt-1 px-1.5 py-0.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded font-bold text-emerald-400"
                        />
                      </div>

                      <div className="p-2 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                        <div className="text-[10px] text-slate-400 flex justify-between">
                          <span>Qrr @25°C (nC)</span>
                          {formatDelta(activePart.Qrr_nC, refCompareDevice.Qrr_nC, 'nC', true)}
                        </div>
                        <input
                          type="number"
                          value={activePart.Qrr_nC}
                          onChange={(e) => updateActivePartField('Qrr_nC', Number(e.target.value))}
                          className="w-full mt-1 px-1.5 py-0.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded font-bold text-rose-400"
                        />
                      </div>

                      <div className="p-2 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                        <div className="text-[10px] text-slate-400 flex justify-between">
                          <span>Rth(j-c) (°C/W)</span>
                          {formatDelta(activePart.Rth_JC_CW, refCompareDevice.Rth_JC_CW, '°C/W', true)}
                        </div>
                        <input
                          type="number"
                          step={0.02}
                          value={activePart.Rth_JC_CW}
                          onChange={(e) => updateActivePartField('Rth_JC_CW', Number(e.target.value))}
                          className="w-full mt-1 px-1.5 py-0.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded font-bold text-purple-400"
                        />
                      </div>

                      <div className="p-2 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                        <div className="text-[10px] text-slate-400">Rg,int (Ω) / Vsd (V)</div>
                        <div className="grid grid-cols-2 gap-1 mt-1">
                          <input
                            type="number"
                            step={0.1}
                            value={activePart.Rg_int_Ohm ?? 1.8}
                            onChange={(e) =>
                              updateActivePartField('Rg_int_Ohm', Number(e.target.value))
                            }
                            className="w-full px-1 py-0.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded font-bold text-slate-900 dark:text-white"
                          />
                          <input
                            type="number"
                            step={0.1}
                            value={activePart.Vsd_V}
                            onChange={(e) => updateActivePartField('Vsd_V', Number(e.target.value))}
                            className="w-full px-1 py-0.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded font-bold text-slate-900 dark:text-white"
                          />
                        </div>
                      </div>

                      <div className="p-2 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                        <div className="text-[10px] text-slate-400">tr / tf (ns)</div>
                        <div className="grid grid-cols-2 gap-1 mt-1">
                          <input
                            type="number"
                            value={activePart.tr_ns}
                            onChange={(e) => updateActivePartField('tr_ns', Number(e.target.value))}
                            className="w-full px-1 py-0.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded font-bold text-slate-900 dark:text-white"
                          />
                          <input
                            type="number"
                            value={activePart.tf_ns}
                            onChange={(e) => updateActivePartField('tf_ns', Number(e.target.value))}
                            className="w-full px-1 py-0.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded font-bold text-slate-900 dark:text-white"
                          />
                        </div>
                      </div>
                    </div>

                    {/* 1-Click Replace / Equip Actions */}
                    <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => handleEquip({ ...activePart, isCustomGrounded: true }, 'pri')}
                        className="px-3 py-1.5 text-xs font-mono font-semibold bg-cyan-600 hover:bg-cyan-500 text-white rounded inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Cpu className="w-3.5 h-3.5" /> Equip as DC-DC Primary Switch{' '}
                        <ArrowRight className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleEquip({ ...activePart, isCustomGrounded: true }, 'sec')}
                        className="px-3 py-1.5 text-xs font-mono font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Zap className="w-3.5 h-3.5" /> Equip as DC-DC Secondary SR{' '}
                        <ArrowRight className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleEquip({ ...activePart, isCustomGrounded: true }, 'pfc')}
                        className="px-3 py-1.5 text-xs font-mono font-semibold bg-purple-600 hover:bg-purple-500 text-white rounded inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Zap className="w-3.5 h-3.5" /> Equip as AC-DC PFC Switch
                      </button>
                      <button
                        type="button"
                        onClick={() => handleEquip({ ...activePart, isCustomGrounded: true }, 'library')}
                        className="px-2.5 py-1.5 text-xs font-mono bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Database className="w-3.5 h-3.5" /> Save to LCSC Catalog
                      </button>
                    </div>
                  </div>

                  {/* Google Search Grounding Sources / Citations */}
                  {sources.length > 0 && (
                    <div className="p-3 rounded bg-slate-50 dark:bg-[#111827] border border-slate-200 dark:border-slate-800 space-y-1.5">
                      <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                        Verified LCSC &amp; Datasheet Grounding Citations ({sources.length})
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {sources.map((src, i) => (
                          <a
                            key={src.uri + i}
                            href={src.uri}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2 py-1 text-[11px] font-mono bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-cyan-500/50 rounded text-cyan-500 inline-flex items-center gap-1 max-w-xs truncate"
                          >
                            <ExternalLink className="w-3 h-3 shrink-0" />
                            <span className="truncate">{src.title}</span>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* =====================================================================
              TAB 3: JLCPCB / LCSC FULL CONVERTER BOM & AUXILIARY ICS
             ===================================================================== */}
          {drawerTab === 'jlcpcb-bom' && (
            <div className="space-y-4 font-mono">
              <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-[#111827] border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wider text-cyan-400">
                      JLCPCB / LCSC SMT Assembly Bill of Materials ({operatingContext.topology.toUpperCase()})
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Select Gate Driver &amp; Digital MCU/DSP C-numbers below and export a ready-to-upload JLCPCB BOM CSV
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleExportJlcpcbBomCsv}
                    className="px-3 py-1.5 text-xs font-semibold rounded bg-emerald-600 hover:bg-emerald-500 text-white inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download JLCPCB BOM (.csv)
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-[10px] uppercase text-slate-400 mb-1">
                      Isolated Gate Driver IC (LCSC C-Number)
                    </label>
                    <select
                      value={selectedGateDriverLcsc}
                      onChange={(e) => setSelectedGateDriverLcsc(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded"
                    >
                      {LCSC_AUXILIARY_BOM_DATABASE.filter((p) => p.category === 'Gate Driver').map(
                        (p) => (
                          <option key={p.lcscPartNumber} value={p.lcscPartNumber}>
                            {p.lcscPartNumber} · {p.mpn} ({p.manufacturer}) — ${p.unitPrice_USD}
                          </option>
                        )
                      )}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase text-slate-400 mb-1">
                      Digital Power Controller MCU / DSP (LCSC C-Number)
                    </label>
                    <select
                      value={selectedMcuLcsc}
                      onChange={(e) => setSelectedMcuLcsc(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded"
                    >
                      {LCSC_AUXILIARY_BOM_DATABASE.filter(
                        (p) => p.category === 'Digital Controller'
                      ).map((p) => (
                        <option key={p.lcscPartNumber} value={p.lcscPartNumber}>
                          {p.lcscPartNumber} · {p.mpn} ({p.manufacturer}) — ${p.unitPrice_USD}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Auxiliary Gate Driver, Controller, Sensing & Capacitor Catalog */}
              <div className="space-y-2">
                <div className="text-[11px] uppercase tracking-wider text-slate-400">
                  LCSC Auxiliary Gate Drivers, Controllers, Current Sensors &amp; Film Capacitors
                </div>
                {LCSC_AUXILIARY_BOM_DATABASE.map((aux) => (
                  <div
                    key={aux.lcscPartNumber}
                    className="p-3 rounded-lg bg-slate-50 dark:bg-[#111827] border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs"
                  >
                    <div className="space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-slate-900 dark:text-white">{aux.mpn}</span>
                        <a
                          href={`https://www.lcsc.com/search?q=${encodeURIComponent(
                            aux.lcscPartNumber
                          )}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2 py-0.5 text-[10px] font-bold rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 inline-flex items-center gap-1"
                        >
                          LCSC {aux.lcscPartNumber}
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                        <span className="px-1.5 py-0.5 text-[10px] rounded bg-purple-500/15 text-purple-300 border border-purple-500/30">
                          {aux.category}
                        </span>
                        <span className="px-1.5 py-0.5 text-[10px] rounded bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                          {aux.packageType} · JLCPCB {aux.jlcpcbClass}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-300">
                        {aux.manufacturer} · {aux.description}
                      </div>
                      <div className="text-[10px] text-cyan-400">{aux.keySpecs}</div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-emerald-400 font-bold">${aux.unitPrice_USD.toFixed(2)}</div>
                      <div className="text-[10px] text-slate-400">
                        Stock: {aux.lcscStock.toLocaleString()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
