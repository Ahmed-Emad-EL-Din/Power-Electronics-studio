// ============================================================================
// SHARED COMPONENT DATABASES (CORES, MATERIALS, SEMICONDUCTORS)
// ============================================================================

export interface CoreSpec {
  id: string;
  name: string;
  Ae_mm2: number;
  le_mm: number;
  Ve_mm3: number;
  Aw_mm2: number;
  Ap_cm4: number;
  MLT_mm: number;
  bw_mm: number;
  hw_mm: number;
  Rth_core_CW: number;
}

export interface CoreMaterialSpec {
  id: string;
  name: string;
  k_si: number;
  alpha: number;
  beta: number;
  Bsat_100C_T: number;
  T_opt_C: number;
  tempCoeff_c2: number;
}

export interface SemiconductorSpec {
  id: string;
  name: string;
  tech: 'SiC MOSFET' | 'GaN HEMT' | 'SJ Si MOSFET' | 'OptiMOS SR' | 'SiC Schottky';
  role: 'primary' | 'secondary' | 'both';
  Vds_max_V: number;
  Rds_on_25C_mOhm: number;
  alpha_R_per_C: number;
  Coss_er_pF: number;
  Coss_tr_pF: number;
  Qg_nC: number;
  Qrr_nC: number;
  Vsd_V: number;
  tr_ns: number;
  tf_ns: number;
  Rth_JC_CW: number;
  // Extended Real-World Datasheet & Distributor Fields (LCSC / JLCPCB / DigiKey / Mouser Grounded)
  manufacturer?: string;
  packageType?: string;
  Id_max_A?: number;
  Qgd_nC?: number;
  Rg_int_Ohm?: number;
  kelvinSource?: boolean;
  unitPrice_USD?: number;
  distributorSku?: string;
  lcscPartNumber?: string; // e.g. 'C2904521'
  jlcpcbClass?: 'Basic Part' | 'Extended Part' | 'Through-Hole';
  lcscStock?: number;
  lcscUrl?: string;
  datasheetSummary?: string;
  isCustomGrounded?: boolean;
}

export interface LcscAuxiliaryPart {
  lcscPartNumber: string;
  mpn: string;
  manufacturer: string;
  category: 'Gate Driver' | 'Digital Controller' | 'Current Sense' | 'Film / Electrolytic Cap' | 'Snubber / Clamp Diode';
  packageType: string;
  jlcpcbClass: 'Basic Part' | 'Extended Part' | 'Through-Hole';
  description: string;
  keySpecs: string;
  unitPrice_USD: number;
  lcscStock: number;
  designatorPrefix: string;
}

export const LCSC_AUXILIARY_BOM_DATABASE: LcscAuxiliaryPart[] = [
  {
    lcscPartNumber: 'C2845912',
    mpn: '1ED3122MC12H',
    manufacturer: 'Infineon',
    category: 'Gate Driver',
    packageType: 'DSO-8 (Wide-Body)',
    jlcpcbClass: 'Extended Part',
    description: '5.7kVrms Single-Channel Isolated Gate Driver for SiC/IGBT with Active Miller Clamp',
    keySpecs: '10A Peak Source/Sink · 45ns Prop Delay · 100kV/µs CMTI',
    unitPrice_USD: 2.38,
    lcscStock: 4820,
    designatorPrefix: 'U_DRV',
  },
  {
    lcscPartNumber: 'C193842',
    mpn: 'UCC21520ADWR',
    manufacturer: 'Texas Instruments',
    category: 'Gate Driver',
    packageType: 'SOIC-16-WB',
    jlcpcbClass: 'Extended Part',
    description: '4A/6A Dual-Channel Isolated Half-Bridge Gate Driver with Programmable Dead-Time',
    keySpecs: '5.7kVrms Isolation · 19ns Prop Delay · 100V/ns CMTI',
    unitPrice_USD: 2.65,
    lcscStock: 8640,
    designatorPrefix: 'U_DRV',
  },
  {
    lcscPartNumber: 'C2058119',
    mpn: 'STM32G474RET6',
    manufacturer: 'STMicroelectronics',
    category: 'Digital Controller',
    packageType: 'LQFP-64',
    jlcpcbClass: 'Extended Part',
    description: '170MHz Mixed-Signal Digital Power MCU with 184ps High-Resolution Timer (HRTIM)',
    keySpecs: '12-Ch HRTIM · 5x 12-bit 4MSPS ADC · Hardware FMAC Filter Accelerator',
    unitPrice_USD: 4.15,
    lcscStock: 12450,
    designatorPrefix: 'U_MCU',
  },
  {
    lcscPartNumber: 'C2054192',
    mpn: 'TMS320F280049CPZS',
    manufacturer: 'Texas Instruments',
    category: 'Digital Controller',
    packageType: 'LQFP-100',
    jlcpcbClass: 'Extended Part',
    description: '100MHz C2000 Real-Time Microcontroller with CLA & High-Resolution PWM (150ps)',
    keySpecs: '16x ePWM Channels · 3x 12-bit 3.45MSPS ADC · 7x Windowed CMPSS + Slope DAC',
    unitPrice_USD: 5.40,
    lcscStock: 3910,
    designatorPrefix: 'U_DSP',
  },
  {
    lcscPartNumber: 'C133728',
    mpn: 'INA240A2PWR',
    manufacturer: 'Texas Instruments',
    category: 'Current Sense',
    packageType: 'TSSOP-8',
    jlcpcbClass: 'Extended Part',
    description: '-4V to 80V Bidirectional Current-Sense Amplifier with Enhanced PWM Rejection',
    keySpecs: '50V/V Gain · 400kHz BW · 93dB AC CMRR at 50kHz',
    unitPrice_USD: 1.52,
    lcscStock: 9280,
    designatorPrefix: 'U_CS',
  },
  {
    lcscPartNumber: 'C476812',
    mpn: 'AMC1302DWVR',
    manufacturer: 'Texas Instruments',
    category: 'Current Sense',
    packageType: 'SOIC-8-WB',
    jlcpcbClass: 'Extended Part',
    description: 'Precision ±50mV Input Reinforced Isolated Amplifier for Shunt Current Sensing',
    keySpecs: '7kVpk Isolation · 280kHz Bandwidth · 15kV/µs CMTI',
    unitPrice_USD: 2.95,
    lcscStock: 3150,
    designatorPrefix: 'U_ISO',
  },
  {
    lcscPartNumber: 'C2910425',
    mpn: 'B32674D8684K000',
    manufacturer: 'TDK / EPCOS',
    category: 'Film / Electrolytic Cap',
    packageType: 'Radial P=27.5mm',
    jlcpcbClass: 'Through-Hole',
    description: 'MKP Metallized Polypropylene Film Capacitor for LLC Resonant Tank / High-Freq DC-Link',
    keySpecs: '0.68µF (680nF) · 875Vdc / 500Vac · 14A RMS @ 100kHz · ESR < 3.5mΩ',
    unitPrice_USD: 1.48,
    lcscStock: 6400,
    designatorPrefix: 'C_RES',
  },
  {
    lcscPartNumber: 'C289412',
    mpn: 'C4AQJBW5200A3LJ',
    manufacturer: 'KEMET',
    category: 'Film / Electrolytic Cap',
    packageType: 'Radial 4-Pin P=37.5mm',
    jlcpcbClass: 'Through-Hole',
    description: '20µF 700Vdc Automotive Grade DC-Link Polypropylene Film Capacitor',
    keySpecs: '20µF · 700Vdc · 21A RMS · ESR 2.8mΩ · ESL 18nH',
    unitPrice_USD: 4.10,
    lcscStock: 2890,
    designatorPrefix: 'C_BUS',
  },
  {
    lcscPartNumber: 'C509184',
    mpn: 'STPSC10H065DY',
    manufacturer: 'STMicroelectronics',
    category: 'Snubber / Clamp Diode',
    packageType: 'TO-252 (DPAK)',
    jlcpcbClass: 'Extended Part',
    description: '650V 10A Zero-Recovery SiC Schottky Diode for PSFB Primary Circulating Clamp',
    keySpecs: '650V · 10A · Qrr = 0nC · Vf = 1.35V · SMD DPAK',
    unitPrice_USD: 1.65,
    lcscStock: 7500,
    designatorPrefix: 'D_CLP',
  },
];

export const CORE_DATABASE: CoreSpec[] = [
  { id: 'etd39', name: 'ETD 39/20/13', Ae_mm2: 125, le_mm: 92.2, Ve_mm3: 11500, Aw_mm2: 177, Ap_cm4: 2.21, MLT_mm: 69, bw_mm: 25.7, hw_mm: 6.9, Rth_core_CW: 11.5 },
  { id: 'etd44', name: 'ETD 44/22/15', Ae_mm2: 173, le_mm: 103, Ve_mm3: 17800, Aw_mm2: 214, Ap_cm4: 3.70, MLT_mm: 77.7, bw_mm: 29.5, hw_mm: 7.3, Rth_core_CW: 9.4 },
  { id: 'etd49', name: 'ETD 49/25/16', Ae_mm2: 211, le_mm: 114, Ve_mm3: 24000, Aw_mm2: 273, Ap_cm4: 5.76, MLT_mm: 86, bw_mm: 32.7, hw_mm: 8.35, Rth_core_CW: 7.8 },
  { id: 'etd59', name: 'ETD 59/31/22', Ae_mm2: 368, le_mm: 139, Ve_mm3: 51500, Aw_mm2: 366, Ap_cm4: 13.47, MLT_mm: 106, bw_mm: 41.0, hw_mm: 8.9, Rth_core_CW: 5.2 },
  { id: 'pq3535', name: 'PQ 35/35', Ae_mm2: 196, le_mm: 87.9, Ve_mm3: 17200, Aw_mm2: 148, Ap_cm4: 2.90, MLT_mm: 75.2, bw_mm: 23.0, hw_mm: 6.4, Rth_core_CW: 8.6 },
  { id: 'pq4040', name: 'PQ 40/40', Ae_mm2: 201, le_mm: 102, Ve_mm3: 20500, Aw_mm2: 202, Ap_cm4: 4.06, MLT_mm: 83.9, bw_mm: 26.8, hw_mm: 7.5, Rth_core_CW: 7.4 },
  { id: 'pq5050', name: 'PQ 50/50', Ae_mm2: 328, le_mm: 113, Ve_mm3: 37100, Aw_mm2: 288, Ap_cm4: 9.45, MLT_mm: 103, bw_mm: 32.0, hw_mm: 9.0, Rth_core_CW: 5.4 },
  { id: 'ee552821', name: 'EE 55/28/21', Ae_mm2: 354, le_mm: 124, Ve_mm3: 43900, Aw_mm2: 278, Ap_cm4: 9.84, MLT_mm: 110, bw_mm: 34.5, hw_mm: 8.05, Rth_core_CW: 5.5 },
  { id: 'ee653227', name: 'EE 65/32/27', Ae_mm2: 535, le_mm: 147, Ve_mm3: 78650, Aw_mm2: 394, Ap_cm4: 21.08, MLT_mm: 132, bw_mm: 41.2, hw_mm: 9.56, Rth_core_CW: 4.1 },
  { id: 'ee703332', name: 'EE 70/33/32', Ae_mm2: 683, le_mm: 149, Ve_mm3: 102000, Aw_mm2: 496, Ap_cm4: 33.88, MLT_mm: 146, bw_mm: 44.0, hw_mm: 11.27, Rth_core_CW: 3.4 },
  { id: 'ee803820', name: 'EE 80/38/20', Ae_mm2: 392, le_mm: 184, Ve_mm3: 72100, Aw_mm2: 752, Ap_cm4: 29.48, MLT_mm: 144, bw_mm: 56.4, hw_mm: 13.33, Rth_core_CW: 3.6 },
  { id: 'elp64', name: 'Planar ELP 64/10/50', Ae_mm2: 519, le_mm: 69.7, Ve_mm3: 36200, Aw_mm2: 108, Ap_cm4: 5.60, MLT_mm: 148, bw_mm: 21.6, hw_mm: 5.0, Rth_core_CW: 4.8 },
];

export const MATERIAL_DATABASE: CoreMaterialSpec[] = [
  { id: 'N97', name: 'TDK N97', k_si: 2.45, alpha: 1.46, beta: 2.65, Bsat_100C_T: 0.41, T_opt_C: 95, tempCoeff_c2: 0.00011 },
  { id: 'N87', name: 'TDK N87', k_si: 3.12, alpha: 1.45, beta: 2.62, Bsat_100C_T: 0.39, T_opt_C: 95, tempCoeff_c2: 0.00012 },
  { id: 'N95', name: 'TDK N95 (Flat-Temp)', k_si: 2.65, alpha: 1.45, beta: 2.64, Bsat_100C_T: 0.41, T_opt_C: 85, tempCoeff_c2: 0.00005 },
  { id: '3C95', name: 'Ferroxcube 3C95', k_si: 2.52, alpha: 1.45, beta: 2.63, Bsat_100C_T: 0.41, T_opt_C: 85, tempCoeff_c2: 0.00006 },
  { id: '3C97', name: 'Ferroxcube 3C97', k_si: 2.38, alpha: 1.46, beta: 2.65, Bsat_100C_T: 0.42, T_opt_C: 95, tempCoeff_c2: 0.00007 },
  { id: 'PC95', name: 'TDK PC95 (HF)', k_si: 2.78, alpha: 1.54, beta: 2.68, Bsat_100C_T: 0.41, T_opt_C: 90, tempCoeff_c2: 0.00006 },
];

export const SEMICONDUCTOR_DATABASE: SemiconductorSpec[] = [
  // --- 650V & 1200V SiC MOSFETs (LCSC Catalog) ---
  { id: 'IMZA65R027M1H', name: 'Infineon IMZA65R027M1H (650V 27mΩ SiC · LCSC C2904521)', manufacturer: 'Infineon', packageType: 'PG-TO247-4', tech: 'SiC MOSFET', role: 'both', Vds_max_V: 650, Id_max_A: 64, Rds_on_25C_mOhm: 27, alpha_R_per_C: 0.0038, Coss_er_pF: 155, Coss_tr_pF: 235, Qg_nC: 54, Qgd_nC: 16, Rg_int_Ohm: 4.0, Qrr_nC: 110, Vsd_V: 4.0, tr_ns: 11, tf_ns: 8, Rth_JC_CW: 0.45, kelvinSource: true, unitPrice_USD: 8.95, lcscPartNumber: 'C2904521', jlcpcbClass: 'Through-Hole', lcscStock: 1840, distributorSku: 'LCSC C2904521 · DigiKey IMZA65R027M1HXKSA1-ND', datasheetSummary: 'CoolSiC Trench 650V M1H with 4-pin Kelvin source; benchmark 400V PSFB/LLC/Totem-PFC switch.' },
  { id: 'IMBG65R022M1H', name: 'Infineon IMBG65R022M1H (650V 22mΩ SMD SiC · LCSC C2929104)', manufacturer: 'Infineon', packageType: 'PG-TO263-7 (D2PAK-7)', tech: 'SiC MOSFET', role: 'both', Vds_max_V: 650, Id_max_A: 78, Rds_on_25C_mOhm: 22, alpha_R_per_C: 0.0038, Coss_er_pF: 188, Coss_tr_pF: 278, Qg_nC: 66, Qgd_nC: 19, Rg_int_Ohm: 3.5, Qrr_nC: 125, Vsd_V: 4.0, tr_ns: 10, tf_ns: 7, Rth_JC_CW: 0.39, kelvinSource: true, unitPrice_USD: 9.40, lcscPartNumber: 'C2929104', jlcpcbClass: 'Extended Part', lcscStock: 2310, distributorSku: 'LCSC C2929104 · JLCPCB SMT Extended', datasheetSummary: 'Surface-mount 7-pin D2PAK CoolSiC 650V 22mΩ with Kelvin source for automated JLCPCB SMT assembly.' },
  { id: 'SCTW90N65G2V', name: 'STMicro SCTW90N65G2V (650V 18mΩ SiC · LCSC C1984312)', manufacturer: 'STMicroelectronics', packageType: 'HiP247-4', tech: 'SiC MOSFET', role: 'both', Vds_max_V: 650, Id_max_A: 109, Rds_on_25C_mOhm: 18, alpha_R_per_C: 0.0040, Coss_er_pF: 215, Coss_tr_pF: 310, Qg_nC: 98, Qgd_nC: 31, Rg_int_Ohm: 1.9, Qrr_nC: 135, Vsd_V: 3.8, tr_ns: 13, tf_ns: 9, Rth_JC_CW: 0.30, kelvinSource: true, unitPrice_USD: 11.20, lcscPartNumber: 'C1984312', jlcpcbClass: 'Through-Hole', lcscStock: 960, distributorSku: 'LCSC C1984312 · ST Gen2 SiC', datasheetSummary: 'Ultra-low 18mΩ 650V Gen2 SiC MOSFET rated to Tj=200°C for high-current 3.3kW–6.6kW bridges.' },
  { id: 'NVBG020N065SC1', name: 'onsemi NVBG020N065SC1 (650V 20mΩ SMD SiC · LCSC C5182904)', manufacturer: 'onsemi', packageType: 'D2PAK-7L', tech: 'SiC MOSFET', role: 'both', Vds_max_V: 650, Id_max_A: 97, Rds_on_25C_mOhm: 20, alpha_R_per_C: 0.0039, Coss_er_pF: 192, Coss_tr_pF: 280, Qg_nC: 106, Qgd_nC: 30, Rg_int_Ohm: 1.8, Qrr_nC: 92, Vsd_V: 3.9, tr_ns: 12, tf_ns: 8, Rth_JC_CW: 0.34, kelvinSource: true, unitPrice_USD: 8.65, lcscPartNumber: 'C5182904', jlcpcbClass: 'Extended Part', lcscStock: 3420, distributorSku: 'LCSC C5182904 · EliteSiC D2PAK-7L', datasheetSummary: 'Automotive AEC-Q101 EliteSiC 650V 20mΩ in 7-lead SMD package for high-density OBC and LLC stages.' },
  { id: 'C3M0040120K', name: 'Wolfspeed C3M0040120K (1200V 40mΩ SiC · LCSC C2839104)', manufacturer: 'Wolfspeed', packageType: 'TO-247-4', tech: 'SiC MOSFET', role: 'both', Vds_max_V: 1200, Id_max_A: 66, Rds_on_25C_mOhm: 40, alpha_R_per_C: 0.0042, Coss_er_pF: 112, Coss_tr_pF: 175, Qg_nC: 62, Qgd_nC: 21, Rg_int_Ohm: 1.8, Qrr_nC: 150, Vsd_V: 4.1, tr_ns: 14, tf_ns: 10, Rth_JC_CW: 0.46, kelvinSource: true, unitPrice_USD: 12.80, lcscPartNumber: 'C2839104', jlcpcbClass: 'Through-Hole', lcscStock: 1450, distributorSku: 'LCSC C2839104 · Mouser 941-C3M0040120K', datasheetSummary: 'C3M Gen3 1200V 40mΩ SiC with Kelvin source for 800V bus EV chargers and 3-phase PFC.' },
  { id: 'C3M0021120K', name: 'Wolfspeed C3M0021120K (1200V 21mΩ SiC · LCSC C2839098)', manufacturer: 'Wolfspeed', packageType: 'TO-247-4', tech: 'SiC MOSFET', role: 'both', Vds_max_V: 1200, Id_max_A: 100, Rds_on_25C_mOhm: 21, alpha_R_per_C: 0.0043, Coss_er_pF: 195, Coss_tr_pF: 295, Qg_nC: 126, Qgd_nC: 40, Rg_int_Ohm: 1.4, Qrr_nC: 220, Vsd_V: 4.2, tr_ns: 16, tf_ns: 11, Rth_JC_CW: 0.32, kelvinSource: true, unitPrice_USD: 19.90, lcscPartNumber: 'C2839098', jlcpcbClass: 'Through-Hole', lcscStock: 1120, distributorSku: 'LCSC C2839098 · Wolfspeed Gen3 1200V', datasheetSummary: 'Sweet-spot 1200V 21mΩ SiC MOSFET balancing conduction and ZVS Coss for 6.6kW–11kW 800V converters.' },
  { id: 'C3M0016120K', name: 'Wolfspeed C3M0016120K (1200V 16mΩ SiC · LCSC C2839101)', manufacturer: 'Wolfspeed', packageType: 'TO-247-4', tech: 'SiC MOSFET', role: 'both', Vds_max_V: 1200, Id_max_A: 115, Rds_on_25C_mOhm: 16, alpha_R_per_C: 0.0044, Coss_er_pF: 265, Coss_tr_pF: 410, Qg_nC: 178, Qgd_nC: 54, Rg_int_Ohm: 1.6, Qrr_nC: 290, Vsd_V: 4.3, tr_ns: 19, tf_ns: 12, Rth_JC_CW: 0.27, kelvinSource: true, unitPrice_USD: 25.40, lcscPartNumber: 'C2839101', jlcpcbClass: 'Through-Hole', lcscStock: 780, distributorSku: 'LCSC C2839101 · DigiKey C3M0016120K-ND', datasheetSummary: 'Flagship 1200V 16mΩ TO-247-4 SiC switch for 11kW–22kW 800V DC fast-charger modules.' },
  { id: 'C3M0075120K', name: 'Wolfspeed C3M0075120K (1200V 75mΩ SiC · LCSC C2839108)', manufacturer: 'Wolfspeed', packageType: 'TO-247-4', tech: 'SiC MOSFET', role: 'both', Vds_max_V: 1200, Id_max_A: 32, Rds_on_25C_mOhm: 75, alpha_R_per_C: 0.0041, Coss_er_pF: 61, Coss_tr_pF: 94, Qg_nC: 35, Qgd_nC: 11, Rg_int_Ohm: 2.6, Qrr_nC: 88, Vsd_V: 4.1, tr_ns: 10, tf_ns: 8, Rth_JC_CW: 0.70, kelvinSource: true, unitPrice_USD: 6.45, lcscPartNumber: 'C2839108', jlcpcbClass: 'Through-Hole', lcscStock: 4290, distributorSku: 'LCSC C2839108 · Low-Coss 1200V SiC', datasheetSummary: 'Ultra-low Coss(er)=61pF 1200V SiC for effortless light-load ZVS in 1kW–3.3kW 800V LLC/PSFB stages.' },

  // --- 650V GaN E-HEMTs (LCSC Catalog) ---
  { id: 'GS66516T', name: 'GaN Systems GS66516T (650V 25mΩ GaN · LCSC C2681520)', manufacturer: 'Renesas / GaN Systems', packageType: 'GaNPX Top-Cool', tech: 'GaN HEMT', role: 'both', Vds_max_V: 650, Id_max_A: 60, Rds_on_25C_mOhm: 25, alpha_R_per_C: 0.0058, Coss_er_pF: 134, Coss_tr_pF: 205, Qg_nC: 14.2, Qgd_nC: 3.8, Rg_int_Ohm: 1.1, Qrr_nC: 0, Vsd_V: 2.2, tr_ns: 5.5, tf_ns: 4.5, Rth_JC_CW: 0.30, kelvinSource: true, unitPrice_USD: 16.80, lcscPartNumber: 'C2681520', jlcpcbClass: 'Extended Part', lcscStock: 1290, distributorSku: 'LCSC C2681520 · Mouser 425-GS66516T-MR', datasheetSummary: '650V 60A Top-Cooled GaN E-HEMT with zero Qrr and 14.2nC Qg for >200kHz LLC and Totem-Pole PFC.' },
  { id: 'IGLD60R070D1', name: 'Infineon IGLD60R070D1 (600V 70mΩ CoolGaN · LCSC C2914820)', manufacturer: 'Infineon', packageType: 'PG-LSON-8 (8x8)', tech: 'GaN HEMT', role: 'both', Vds_max_V: 600, Id_max_A: 31, Rds_on_25C_mOhm: 70, alpha_R_per_C: 0.0056, Coss_er_pF: 58, Coss_tr_pF: 90, Qg_nC: 5.8, Qgd_nC: 1.6, Rg_int_Ohm: 1.2, Qrr_nC: 0, Vsd_V: 2.1, tr_ns: 4.0, tf_ns: 3.5, Rth_JC_CW: 0.65, kelvinSource: true, unitPrice_USD: 7.20, lcscPartNumber: 'C2914820', jlcpcbClass: 'Extended Part', lcscStock: 3110, distributorSku: 'LCSC C2914820 · CoolGaN 600V SMD', datasheetSummary: 'Ultra-low Qg=5.8nC 600V CoolGaN SMD switch for 250kHz–500kHz high-density server LLC/PFC.' },
  { id: 'INN650D080BS', name: 'Innoscience INN650D080BS (650V 80mΩ GaN · LCSC C2894510)', manufacturer: 'Innoscience', packageType: 'DFN 8x8', tech: 'GaN HEMT', role: 'both', Vds_max_V: 650, Id_max_A: 24, Rds_on_25C_mOhm: 80, alpha_R_per_C: 0.0057, Coss_er_pF: 49, Coss_tr_pF: 78, Qg_nC: 5.2, Qgd_nC: 1.4, Rg_int_Ohm: 1.4, Qrr_nC: 0, Vsd_V: 2.0, tr_ns: 4.2, tf_ns: 3.8, Rth_JC_CW: 0.72, kelvinSource: true, unitPrice_USD: 3.45, lcscPartNumber: 'C2894510', jlcpcbClass: 'Extended Part', lcscStock: 8950, distributorSku: 'LCSC C2894510 · High-Stock LCSC GaN', datasheetSummary: 'Cost-effective LCSC favorite 650V E-mode GaN in DFN 8x8 with Kelvin sense pin and zero Qrr.' },

  // --- 600V / 650V Superjunction Si MOSFETs (LCSC Catalog) ---
  { id: 'IPW65R035CFD7', name: 'Infineon IPW65R035CFD7 (650V 35mΩ SJ Si · LCSC C472819)', manufacturer: 'Infineon', packageType: 'TO-247-3', tech: 'SJ Si MOSFET', role: 'primary', Vds_max_V: 650, Id_max_A: 65, Rds_on_25C_mOhm: 35, alpha_R_per_C: 0.0085, Coss_er_pF: 125, Coss_tr_pF: 780, Qg_nC: 121, Qgd_nC: 38, Rg_int_Ohm: 1.5, Qrr_nC: 490, Vsd_V: 1.0, tr_ns: 18, tf_ns: 9, Rth_JC_CW: 0.36, kelvinSource: false, unitPrice_USD: 6.90, lcscPartNumber: 'C472819', jlcpcbClass: 'Through-Hole', lcscStock: 3650, distributorSku: 'LCSC C472819 · CoolMOS CFD7 Fast Body Diode', datasheetSummary: 'CoolMOS CFD7 650V with ultra-fast body diode for resonant LLC and ZVS PSFB primary bridges.' },
  { id: 'IPP60R040C7', name: 'Infineon IPP60R040C7 (600V 40mΩ CoolMOS C7 · LCSC C132485)', manufacturer: 'Infineon', packageType: 'TO-220-3', tech: 'SJ Si MOSFET', role: 'primary', Vds_max_V: 600, Id_max_A: 50, Rds_on_25C_mOhm: 40, alpha_R_per_C: 0.0082, Coss_er_pF: 98, Coss_tr_pF: 640, Qg_nC: 94, Qgd_nC: 28, Rg_int_Ohm: 1.3, Qrr_nC: 620, Vsd_V: 0.95, tr_ns: 15, tf_ns: 8, Rth_JC_CW: 0.45, kelvinSource: false, unitPrice_USD: 4.85, lcscPartNumber: 'C132485', jlcpcbClass: 'Through-Hole', lcscStock: 5400, distributorSku: 'LCSC C132485 · CoolMOS C7', datasheetSummary: 'Popular LCSC 600V 40mΩ CoolMOS C7 switch for interleaved boost PFC and 1–2kW LLC stages.' },
  { id: 'OSG65R038HZ', name: 'Oriental Semi OSG65R038HZ (650V 38mΩ SJ Si · LCSC C2918432)', manufacturer: 'Oriental Semiconductor', packageType: 'TO-247-3', tech: 'SJ Si MOSFET', role: 'primary', Vds_max_V: 650, Id_max_A: 62, Rds_on_25C_mOhm: 38, alpha_R_per_C: 0.0084, Coss_er_pF: 132, Coss_tr_pF: 810, Qg_nC: 115, Qgd_nC: 35, Rg_int_Ohm: 1.8, Qrr_nC: 440, Vsd_V: 0.98, tr_ns: 19, tf_ns: 10, Rth_JC_CW: 0.38, kelvinSource: false, unitPrice_USD: 3.10, lcscPartNumber: 'C2918432', jlcpcbClass: 'Through-Hole', lcscStock: 11200, distributorSku: 'LCSC C2918432 · GreenMOS High-Stock', datasheetSummary: 'High-stock LCSC domestic favorite 650V 38mΩ fast-recovery Superjunction MOSFET for cost-optimized PSFB/LLC.' },

  // --- Low-Voltage Synchronous Rectifiers (40V - 150V TOLL / PQFN / TO-220, LCSC Catalog) ---
  { id: 'IPT015N10N5', name: 'Infineon IPT015N10N5 (100V 1.5mΩ TOLL SR · LCSC C2931840)', manufacturer: 'Infineon', packageType: 'PG-HSOF-8 (TOLL)', tech: 'OptiMOS SR', role: 'secondary', Vds_max_V: 100, Id_max_A: 300, Rds_on_25C_mOhm: 1.5, alpha_R_per_C: 0.0062, Coss_er_pF: 1850, Coss_tr_pF: 2750, Qg_nC: 155, Qgd_nC: 44, Rg_int_Ohm: 1.2, Qrr_nC: 118, Vsd_V: 0.82, tr_ns: 16, tf_ns: 11, Rth_JC_CW: 0.35, kelvinSource: true, unitPrice_USD: 3.85, lcscPartNumber: 'C2931840', jlcpcbClass: 'Extended Part', lcscStock: 6820, distributorSku: 'LCSC C2931840 · Mouser 726-IPT015N10N5ATMA1', datasheetSummary: 'Industry-standard 100V 1.5mΩ TOLL package Synchronous Rectifier for 24V–48V high-current secondary stages.' },
  { id: 'IPT007N06N', name: 'Infineon IPT007N06N (60V 0.75mΩ TOLL SR · LCSC C2891044)', manufacturer: 'Infineon', packageType: 'PG-HSOF-8 (TOLL)', tech: 'OptiMOS SR', role: 'secondary', Vds_max_V: 60, Id_max_A: 300, Rds_on_25C_mOhm: 0.75, alpha_R_per_C: 0.0058, Coss_er_pF: 2950, Coss_tr_pF: 4200, Qg_nC: 210, Qgd_nC: 58, Rg_int_Ohm: 1.0, Qrr_nC: 96, Vsd_V: 0.78, tr_ns: 18, tf_ns: 12, Rth_JC_CW: 0.32, kelvinSource: true, unitPrice_USD: 4.10, lcscPartNumber: 'C2891044', jlcpcbClass: 'Extended Part', lcscStock: 4510, distributorSku: 'LCSC C2891044 · OptiMOS 60V 0.75mΩ', datasheetSummary: 'Ultra-low 0.75mΩ 60V TOLL synchronous rectifier for 12V–24V high-current server/telecom DC-DC outputs.' },
  { id: 'BSC010N04LS', name: 'Infineon BSC010N04LS (40V 1.0mΩ SuperSO8 SR · LCSC C96748)', manufacturer: 'Infineon', packageType: 'TDSON-8 (5x6)', tech: 'OptiMOS SR', role: 'secondary', Vds_max_V: 40, Id_max_A: 100, Rds_on_25C_mOhm: 1.0, alpha_R_per_C: 0.0055, Coss_er_pF: 1920, Coss_tr_pF: 2680, Qg_nC: 98, Qgd_nC: 26, Rg_int_Ohm: 0.9, Qrr_nC: 54, Vsd_V: 0.76, tr_ns: 11, tf_ns: 8, Rth_JC_CW: 0.80, kelvinSource: false, unitPrice_USD: 1.25, lcscPartNumber: 'C96748', jlcpcbClass: 'Extended Part', lcscStock: 19400, distributorSku: 'LCSC C96748 · JLCPCB High-Volume SMD', datasheetSummary: 'Massive LCSC stock (19k+) 40V 1.0mΩ 5x6mm SMD synchronous rectifier for 12V output LLC/PSFB stages.' },
  { id: 'CRJQ150N10G2', name: 'CR Micro CRJQ150N10G2 (100V 1.5mΩ TOLL SR · LCSC C5129840)', manufacturer: 'CR Micro (China Resources)', packageType: 'TOLL-8L', tech: 'OptiMOS SR', role: 'secondary', Vds_max_V: 100, Id_max_A: 295, Rds_on_25C_mOhm: 1.5, alpha_R_per_C: 0.0063, Coss_er_pF: 1790, Coss_tr_pF: 2690, Qg_nC: 148, Qgd_nC: 41, Rg_int_Ohm: 1.3, Qrr_nC: 112, Vsd_V: 0.81, tr_ns: 15, tf_ns: 11, Rth_JC_CW: 0.36, kelvinSource: true, unitPrice_USD: 1.95, lcscPartNumber: 'C5129840', jlcpcbClass: 'Extended Part', lcscStock: 14800, distributorSku: 'LCSC C5129840 · Domestic TOLL Drop-In', datasheetSummary: 'High-stock LCSC drop-in TOLL 100V 1.5mΩ synchronous rectifier at 50% lower BOM cost than imported equivalents.' },
  { id: 'IPP041N15N5', name: 'Infineon IPP041N15N5 (150V 4.1mΩ SR · LCSC C508421)', manufacturer: 'Infineon', packageType: 'TO-220-3', tech: 'OptiMOS SR', role: 'secondary', Vds_max_V: 150, Id_max_A: 120, Rds_on_25C_mOhm: 4.1, alpha_R_per_C: 0.0068, Coss_er_pF: 890, Coss_tr_pF: 1320, Qg_nC: 82, Qgd_nC: 24, Rg_int_Ohm: 1.6, Qrr_nC: 185, Vsd_V: 0.85, tr_ns: 15, tf_ns: 10, Rth_JC_CW: 0.42, kelvinSource: false, unitPrice_USD: 3.30, lcscPartNumber: 'C508421', jlcpcbClass: 'Through-Hole', lcscStock: 4120, distributorSku: 'LCSC C508421 · DigiKey IPP041N15N5AKSA1-ND', datasheetSummary: '150V 4.1mΩ OptiMOS 5 SR with avalanche margin for center-tapped 48V–60V PSFB secondary stages.' },
  { id: 'IPP110N20N3', name: 'Infineon IPP110N20N3 (200V 10.7mΩ SR · LCSC C2894120)', manufacturer: 'Infineon', packageType: 'TO-220-3', tech: 'OptiMOS SR', role: 'secondary', Vds_max_V: 200, Id_max_A: 88, Rds_on_25C_mOhm: 10.7, alpha_R_per_C: 0.0072, Coss_er_pF: 520, Coss_tr_pF: 810, Qg_nC: 66, Qgd_nC: 16, Rg_int_Ohm: 1.8, Qrr_nC: 240, Vsd_V: 0.90, tr_ns: 14, tf_ns: 10, Rth_JC_CW: 0.45, kelvinSource: false, unitPrice_USD: 3.15, lcscPartNumber: 'C2894120', jlcpcbClass: 'Through-Hole', lcscStock: 5280, distributorSku: 'LCSC C2894120 · DigiKey IPP110N20N3GXKSA1-ND', datasheetSummary: '200V 10.7mΩ OptiMOS 3 SR providing >25% ringing margin above 430V high-line full-bridge/CT transients.' },
  { id: 'BSC160N20NSFD', name: 'Infineon BSC160N20NSFD (200V 16mΩ SuperSO8 SR · LCSC C2910488)', manufacturer: 'Infineon', packageType: 'TDSON-8 (5x6)', tech: 'OptiMOS SR', role: 'secondary', Vds_max_V: 200, Id_max_A: 56, Rds_on_25C_mOhm: 16.0, alpha_R_per_C: 0.0070, Coss_er_pF: 360, Coss_tr_pF: 550, Qg_nC: 44, Qgd_nC: 11, Rg_int_Ohm: 1.4, Qrr_nC: 170, Vsd_V: 0.88, tr_ns: 12, tf_ns: 8, Rth_JC_CW: 0.70, kelvinSource: false, unitPrice_USD: 2.25, lcscPartNumber: 'C2910488', jlcpcbClass: 'Extended Part', lcscStock: 7640, distributorSku: 'LCSC C2910488 · OptiMOS FD 200V SMD', datasheetSummary: 'Fast-recovery 200V 16mΩ TDSON-8 SMD synchronous rectifier for compact low-parasitic-inductance 48V secondary bridges.' },

  // --- High-Voltage SiC Schottky Diodes (LCSC Catalog) ---
  { id: 'C4D20120D', name: 'Wolfspeed C4D20120D (1200V 20A SiC Diode · LCSC C194302)', manufacturer: 'Wolfspeed', packageType: 'TO-247-3', tech: 'SiC Schottky', role: 'secondary', Vds_max_V: 1200, Id_max_A: 28, Rds_on_25C_mOhm: 28, alpha_R_per_C: 0.0035, Coss_er_pF: 95, Coss_tr_pF: 130, Qg_nC: 0, Qgd_nC: 0, Rg_int_Ohm: 0, Qrr_nC: 0, Vsd_V: 1.35, tr_ns: 5, tf_ns: 5, Rth_JC_CW: 0.55, kelvinSource: false, unitPrice_USD: 6.80, lcscPartNumber: 'C194302', jlcpcbClass: 'Through-Hole', lcscStock: 3280, distributorSku: 'LCSC C194302 · Mouser 941-C4D20120D', datasheetSummary: 'Zero-recovery 1200V SiC Schottky diode for 400V–800V high-voltage output rectifiers.' },
];

const CUSTOM_SEMI_STORAGE_KEY = 'voltcraft_custom_semiconductors_v1';

export function registerCustomSemiconductor(spec: SemiconductorSpec): SemiconductorSpec {
  const existingIdx = SEMICONDUCTOR_DATABASE.findIndex(
    (d) => d.id.toLowerCase() === spec.id.toLowerCase()
  );
  const normalized: SemiconductorSpec = {
    ...spec,
    isCustomGrounded: true,
  };
  if (existingIdx >= 0) {
    SEMICONDUCTOR_DATABASE[existingIdx] = normalized;
  } else {
    SEMICONDUCTOR_DATABASE.unshift(normalized);
  }
  try {
    const customOnly = SEMICONDUCTOR_DATABASE.filter((d) => d.isCustomGrounded);
    localStorage.setItem(CUSTOM_SEMI_STORAGE_KEY, JSON.stringify(customOnly));
  } catch {
    // ignore storage errors
  }
  return normalized;
}

export function hydrateCustomSemiconductors(): void {
  try {
    const raw = localStorage.getItem(CUSTOM_SEMI_STORAGE_KEY);
    if (!raw) return;
    const list = JSON.parse(raw) as SemiconductorSpec[];
    if (Array.isArray(list)) {
      list.forEach((item) => {
        const idx = SEMICONDUCTOR_DATABASE.findIndex(
          (d) => d.id.toLowerCase() === item.id.toLowerCase()
        );
        if (idx >= 0) {
          SEMICONDUCTOR_DATABASE[idx] = { ...item, isCustomGrounded: true };
        } else {
          SEMICONDUCTOR_DATABASE.push({ ...item, isCustomGrounded: true });
        }
      });
    }
  } catch {
    // ignore storage errors
  }
}

// ============================================================================
// TAB 1: AC-DC CONVERTER (2-PHASE INTERLEAVED PFC & BRIDGELESS TOTEM-POLE)
// ============================================================================
export type AcDcTopologyType =
  | '2ph-interleaved-totem'
  | '2ph-interleaved-boost'
  | '1ph-totem-pfc'
  | 'dual-boost-bridgeless';
export type AcDcControlType = 'acmc' | 'cascaded-pi' | '2p2z' | 'mpc';

export interface AcDcDesignState {
  topology: AcDcTopologyType;
  controlType: AcDcControlType;
  presetName: string;

  // AC Input & DC Bus Specs
  Vac_rms_V: number;
  Vac_min_V: number;
  Vac_max_V: number;
  f_line_Hz: 50 | 60;
  Vdc_bus_V: number;
  Pout_W: number;
  fsw_kHz: number;

  // Power Stage Inductors & DC-Link Bulk Cap
  Lpfc_uH: number;         // Boost inductor per phase (µH)
  RL_mOhm: number;         // Inductor DCR/ACR (mΩ)
  Cdc_uF: number;          // DC-Link capacitor bank (µF)
  ESR_Cdc_mOhm: number;    // DC-Link ESR (mΩ)
  tHold_ms: number;        // Target hold-up time (ms)
  Vdc_min_hold_V: number;  // Min bus voltage after hold-up dropout (V)

  // Devices
  fastSwitchId: string;
  phaseShedding: boolean;

  // Control Loop Parameters
  fc_i_kHz: number;        // Inner current loop crossover freq (kHz)
  pm_i_deg: number;        // Inner current loop target phase margin (deg)
  fc_v_Hz: number;         // Outer DC bus voltage loop crossover (Hz)
  pm_v_deg: number;        // Outer voltage loop target phase margin (deg)
  fs_ctrl_kHz: number;     // Digital ADC/PWM sampling frequency (kHz)
  mpcL_mismatch_pct: number;// Inductance mismatch for MPC sensitivity (%)

  // Sub-Tool Dynamic Parameters (ZCD, Inrush Pre-charge, Safety Y-Cap & Cap Thermal)
  deadTime_zcd_ns?: number;
  prechargeR_Ohm?: number;
  Cy_nF?: number;
  capAmbient_C?: number;
}

export const ACDC_PRESETS: { id: string; title: string; state: AcDcDesignState }[] = [
  {
    id: 'acdc-6k6-totem-2ph',
    title: '6.6 kW 2-Phase Interleaved Totem-Pole PFC (230Vac → 400Vdc)',
    state: {
      topology: '2ph-interleaved-totem',
      controlType: 'acmc',
      presetName: '6.6 kW 2-Phase Interleaved Totem-Pole PFC',
      Vac_rms_V: 230,
      Vac_min_V: 185,
      Vac_max_V: 265,
      f_line_Hz: 50,
      Vdc_bus_V: 400,
      Pout_W: 6600,
      fsw_kHz: 65,
      Lpfc_uH: 220,
      RL_mOhm: 28,
      Cdc_uF: 2200,
      ESR_Cdc_mOhm: 18,
      tHold_ms: 20,
      Vdc_min_hold_V: 320,
      fastSwitchId: 'IMZA65R027M1H',
      phaseShedding: true,
      fc_i_kHz: 6.5,
      pm_i_deg: 58,
      fc_v_Hz: 15,
      pm_v_deg: 60,
      fs_ctrl_kHz: 65,
      mpcL_mismatch_pct: 0,
    },
  },
  {
    id: 'acdc-3k6-totem-1ph',
    title: '3.6 kW 1-Phase Bridgeless Totem-Pole GaN PFC (230Vac → 400Vdc)',
    state: {
      topology: '1ph-totem-pfc',
      controlType: '2p2z',
      presetName: '3.6 kW 1-Phase Bridgeless Totem-Pole GaN PFC',
      Vac_rms_V: 230,
      Vac_min_V: 185,
      Vac_max_V: 265,
      f_line_Hz: 50,
      Vdc_bus_V: 400,
      Pout_W: 3600,
      fsw_kHz: 100,
      Lpfc_uH: 180,
      RL_mOhm: 24,
      Cdc_uF: 1500,
      ESR_Cdc_mOhm: 22,
      tHold_ms: 20,
      Vdc_min_hold_V: 320,
      fastSwitchId: 'GS66516T',
      phaseShedding: false,
      fc_i_kHz: 9.5,
      pm_i_deg: 58,
      fc_v_Hz: 16,
      pm_v_deg: 60,
      fs_ctrl_kHz: 100,
      mpcL_mismatch_pct: 0,
    },
  },
  {
    id: 'acdc-3k3-boost-2ph',
    title: '3.3 kW 2-Phase Interleaved Diode-Bridge Boost PFC (230Vac → 400Vdc)',
    state: {
      topology: '2ph-interleaved-boost',
      controlType: '2p2z',
      presetName: '3.3 kW 2-Phase Interleaved Boost PFC',
      Vac_rms_V: 230,
      Vac_min_V: 175,
      Vac_max_V: 265,
      f_line_Hz: 50,
      Vdc_bus_V: 400,
      Pout_W: 3300,
      fsw_kHz: 100,
      Lpfc_uH: 260,
      RL_mOhm: 35,
      Cdc_uF: 1360,
      ESR_Cdc_mOhm: 25,
      tHold_ms: 20,
      Vdc_min_hold_V: 320,
      fastSwitchId: 'GS66516T',
      phaseShedding: true,
      fc_i_kHz: 9.0,
      pm_i_deg: 55,
      fc_v_Hz: 18,
      pm_v_deg: 60,
      fs_ctrl_kHz: 100,
      mpcL_mismatch_pct: 0,
    },
  },
  {
    id: 'acdc-4k0-dual-boost',
    title: '4.0 kW Dual-Boost Semi-Bridgeless PFC (230Vac → 400Vdc)',
    state: {
      topology: 'dual-boost-bridgeless',
      controlType: 'cascaded-pi',
      presetName: '4.0 kW Dual-Boost Semi-Bridgeless PFC',
      Vac_rms_V: 230,
      Vac_min_V: 180,
      Vac_max_V: 265,
      f_line_Hz: 50,
      Vdc_bus_V: 400,
      Pout_W: 4000,
      fsw_kHz: 75,
      Lpfc_uH: 240,
      RL_mOhm: 30,
      Cdc_uF: 1800,
      ESR_Cdc_mOhm: 20,
      tHold_ms: 20,
      Vdc_min_hold_V: 320,
      fastSwitchId: 'IMBG65R022M1H',
      phaseShedding: false,
      fc_i_kHz: 7.5,
      pm_i_deg: 56,
      fc_v_Hz: 15,
      pm_v_deg: 60,
      fs_ctrl_kHz: 75,
      mpcL_mismatch_pct: 0,
    },
  },
  {
    id: 'acdc-11kw-hv-pfc',
    title: '11 kW High-Power 2-Phase Interleaved Totem-Pole (400Vac → 800Vdc)',
    state: {
      topology: '2ph-interleaved-totem',
      controlType: 'mpc',
      presetName: '11 kW 800V Bus Interleaved Totem-Pole PFC',
      Vac_rms_V: 400,
      Vac_min_V: 340,
      Vac_max_V: 440,
      f_line_Hz: 50,
      Vdc_bus_V: 800,
      Pout_W: 11000,
      fsw_kHz: 80,
      Lpfc_uH: 320,
      RL_mOhm: 30,
      Cdc_uF: 940,
      ESR_Cdc_mOhm: 22,
      tHold_ms: 16,
      Vdc_min_hold_V: 650,
      fastSwitchId: 'C3M0016120K',
      phaseShedding: true,
      fc_i_kHz: 8.0,
      pm_i_deg: 60,
      fc_v_Hz: 20,
      pm_v_deg: 62,
      fs_ctrl_kHz: 80,
      mpcL_mismatch_pct: -10,
    },
  },
];

// ============================================================================
// TAB 2: DC-DC CONVERTER (PSFB & LLC WITH RECTIFIER, TRANSFORMER & CONTROL VARIANTS)
// ============================================================================
export type DcDcTopologyFamily = 'psfb-1ph' | 'psfb-2ph' | 'llc-fb' | 'llc-hb';
export type TransformerSecondaryType = 'center-tapped' | 'full-bridge' | 'current-doubler';
export type RectifierDeviceType = 'sync-fet' | 'schottky-diode';
export type ClampVariantType = 'pri-diode-clamp' | 'active-clamp' | 'rc-snubber';
export type InterleavingPattern = 'none' | 'split-pri' | 'full-interleaved';
export type DcDcControlType =
  | '2p2z'
  | 'type-iii'
  | 'pcmc'
  | 'acmc'
  | 'cascaded-pi'
  | 'charge-control'
  | 'mpc';

export interface DcDcDesignState {
  topology: DcDcTopologyFamily;
  txType: TransformerSecondaryType;
  rectMode: RectifierDeviceType;
  clampVariant: ClampVariantType;
  controlType: DcDcControlType;
  presetName: string;

  // Operating Specs
  Vin_min_V: number;
  Vin_nom_V: number;
  Vin_max_V: number;
  Vout_V: number;
  Pout_W: number;
  fsw_kHz: number;
  Tamb_C: number;

  // Tank / Inductance / Filter
  turnsRatio_n: number;
  Llk_uH: number;         // PSFB series L_lk or LLC resonant L_r (µH)
  Lm_uH: number;          // Magnetizing inductance L_m (µH)
  Cr_nF: number;          // LLC resonant capacitor C_r (nF)
  Lo_uH: number;          // Output filter inductor L_o (µH)
  Co_uF: number;          // Output filter capacitor C_o (µF)
  ESR_Co_mOhm: number;    // Output capacitor ESR (mΩ)
  deadTime_ns: number;    // Primary bridge dead-time (ns)
  Ctr_par_pF: number;     // Transformer parasitic capacitance (pF)

  // Magnetics & Winding Build
  coreId: string;
  materialId: string;
  Np_turns: number;
  Ns_turns: number;
  litzStrandAWG: 38 | 40 | 42;
  priStrands: number;
  secStrands: number;
  interleaving: InterleavingPattern;
  insulationThickness_mm: number;
  customSteinmetzEnabled?: boolean;
  custom_k_si?: number;
  custom_alpha?: number;
  custom_beta?: number;
  custom_T_opt_C?: number;
  custom_tempCoeff_c2?: number;

  // Semiconductors & Electro-Thermal Gate Drive
  priDeviceId: string;
  secDeviceId: string;
  nParallelPri: number;
  nParallelSec: number;
  Vgs_drive_V: number;
  Rg_ext_Ohm?: number;
  kelvinSourcePri?: boolean;
  Rth_heatsink_CW: number;
  Rth_TIM_CW?: number;     // Case-to-heatsink TIM thermal resistance (°C/W)
  Tj_max_limit_C?: number; // Target maximum junction temperature limit for thermal derating (°C)

  // Control Loop & Slope / Charge Parameters
  fc_target_kHz: number;
  pm_target_deg: number;
  Rsense_mOhm: number;     // Current sense transfer gain (mΩ)
  slopeFactor_mc: number;  // Artificial ramp multiplier mc = 1 + Se/Sf (1.0 = no ramp, 2.0 = Se=Sf)
  fs_digital_kHz: number;  // Digital controller sampling rate (kHz)
}

export const DCDC_PRESETS: { id: string; title: string; state: DcDcDesignState }[] = [
  {
    id: 'psfb-1ph-3k3-sr-ct',
    title: '3.3 kW PSFB · Sync Rectifier · Center-Tapped (400V→48V · PCMC)',
    state: {
      topology: 'psfb-1ph',
      txType: 'center-tapped',
      rectMode: 'sync-fet',
      clampVariant: 'pri-diode-clamp',
      controlType: 'pcmc',
      presetName: '3.3 kW PSFB (Sync FET + Center-Tapped)',
      Vin_min_V: 360,
      Vin_nom_V: 400,
      Vin_max_V: 430,
      Vout_V: 48,
      Pout_W: 3300,
      fsw_kHz: 100,
      Tamb_C: 45,
      turnsRatio_n: 6.0,
      Llk_uH: 14.5,
      Lm_uH: 650,
      Cr_nF: 68,
      Lo_uH: 18,
      Co_uF: 680,
      ESR_Co_mOhm: 3.0,
      deadTime_ns: 180,
      Ctr_par_pF: 80,
      coreId: 'etd59',
      materialId: 'N97',
      Np_turns: 18,
      Ns_turns: 3,
      litzStrandAWG: 38,
      priStrands: 120,
      secStrands: 650,
      interleaving: 'split-pri',
      insulationThickness_mm: 0.25,
      priDeviceId: 'IMZA65R027M1H',
      secDeviceId: 'IPP041N15N5',
      nParallelPri: 1,
      nParallelSec: 2,
      Vgs_drive_V: 18,
      Rth_heatsink_CW: 1.0,
      fc_target_kHz: 8.5,
      pm_target_deg: 58,
      Rsense_mOhm: 25,
      slopeFactor_mc: 2.5,
      fs_digital_kHz: 200,
    },
  },
  {
    id: 'psfb-2ph-6k6-cdr-2p2z',
    title: '6.6 kW 2-Phase Interleaved PSFB · Sync Rect · Current-Doubler (400V→48V · 2P2Z)',
    state: {
      topology: 'psfb-2ph',
      txType: 'current-doubler',
      rectMode: 'sync-fet',
      clampVariant: 'active-clamp',
      controlType: '2p2z',
      presetName: '6.6 kW 2-Ph Interleaved PSFB (Sync FET + CDR)',
      Vin_min_V: 360,
      Vin_nom_V: 400,
      Vin_max_V: 430,
      Vout_V: 48,
      Pout_W: 6600,
      fsw_kHz: 100,
      Tamb_C: 45,
      turnsRatio_n: 3.0,
      Llk_uH: 13.5,
      Lm_uH: 600,
      Cr_nF: 68,
      Lo_uH: 16,
      Co_uF: 820,
      ESR_Co_mOhm: 2.2,
      deadTime_ns: 170,
      Ctr_par_pF: 75,
      coreId: 'ee552821',
      materialId: '3C97',
      Np_turns: 18,
      Ns_turns: 6,
      litzStrandAWG: 38,
      priStrands: 140,
      secStrands: 500,
      interleaving: 'full-interleaved',
      insulationThickness_mm: 0.25,
      priDeviceId: 'IMZA65R027M1H',
      secDeviceId: 'IPT015N10N5',
      nParallelPri: 1,
      nParallelSec: 2,
      Vgs_drive_V: 18,
      Rth_heatsink_CW: 0.9,
      fc_target_kHz: 10.0,
      pm_target_deg: 60,
      Rsense_mOhm: 20,
      slopeFactor_mc: 1.7,
      fs_digital_kHz: 200,
    },
  },
  {
    id: 'psfb-11kw-diode-fb',
    title: '11 kW HV PSFB · SiC Diode Bridge · Full-Bridge Sec (800V→400V · ACMC)',
    state: {
      topology: 'psfb-1ph',
      txType: 'full-bridge',
      rectMode: 'schottky-diode',
      clampVariant: 'pri-diode-clamp',
      controlType: 'acmc',
      presetName: '11 kW HV PSFB (SiC Schottky + Full-Bridge Sec)',
      Vin_min_V: 720,
      Vin_nom_V: 800,
      Vin_max_V: 850,
      Vout_V: 400,
      Pout_W: 11000,
      fsw_kHz: 85,
      Tamb_C: 50,
      turnsRatio_n: 1.5,
      Llk_uH: 22.0,
      Lm_uH: 900,
      Cr_nF: 47,
      Lo_uH: 120,
      Co_uF: 220,
      ESR_Co_mOhm: 6.0,
      deadTime_ns: 200,
      Ctr_par_pF: 105,
      coreId: 'ee653227',
      materialId: '3C97',
      Np_turns: 18,
      Ns_turns: 12,
      litzStrandAWG: 38,
      priStrands: 180,
      secStrands: 250,
      interleaving: 'full-interleaved',
      insulationThickness_mm: 0.35,
      priDeviceId: 'C3M0016120K',
      secDeviceId: 'C4D20120D',
      nParallelPri: 1,
      nParallelSec: 2,
      Vgs_drive_V: 18,
      Rth_heatsink_CW: 0.8,
      fc_target_kHz: 6.5,
      pm_target_deg: 58,
      Rsense_mOhm: 30,
      slopeFactor_mc: 1.6,
      fs_digital_kHz: 170,
    },
  },
  {
    id: 'llc-3kw-sr-ct-charge',
    title: '3.0 kW Full-Bridge LLC · Sync Rectifier · Center-Tapped (400V→48V · Charge Control)',
    state: {
      topology: 'llc-fb',
      txType: 'center-tapped',
      rectMode: 'sync-fet',
      clampVariant: 'rc-snubber',
      controlType: 'charge-control',
      presetName: '3.0 kW Full-Bridge LLC (Sync FET + Center-Tapped)',
      Vin_min_V: 360,
      Vin_nom_V: 400,
      Vin_max_V: 425,
      Vout_V: 48,
      Pout_W: 3000,
      fsw_kHz: 130,
      Tamb_C: 40,
      turnsRatio_n: 8.33,
      Llk_uH: 20.5,
      Lm_uH: 125,
      Cr_nF: 68,
      Lo_uH: 2.0,
      Co_uF: 940,
      ESR_Co_mOhm: 2.0,
      deadTime_ns: 140,
      Ctr_par_pF: 65,
      coreId: 'pq5050',
      materialId: 'PC95',
      Np_turns: 25,
      Ns_turns: 3,
      litzStrandAWG: 40,
      priStrands: 160,
      secStrands: 680,
      interleaving: 'split-pri',
      insulationThickness_mm: 0.2,
      priDeviceId: 'GS66516T',
      secDeviceId: 'IPT015N10N5',
      nParallelPri: 1,
      nParallelSec: 2,
      Vgs_drive_V: 6.5,
      Rth_heatsink_CW: 1.0,
      fc_target_kHz: 9.0,
      pm_target_deg: 60,
      Rsense_mOhm: 20,
      slopeFactor_mc: 1.5,
      fs_digital_kHz: 260,
    },
  },
];
