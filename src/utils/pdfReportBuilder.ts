// ============================================================================
// CLIENT-SIDE VECTOR-FIRST PDF BOOK GENERATOR (jsPDF + SVG -> High-DPI PNG)
// Works reliably inside sandboxed iframes without window.print() dependency.
// ============================================================================

import { jsPDF } from 'jspdf';
import katex from 'katex';
import { AcDcDesignState, DcDcDesignState } from '../data/databases';
import { AcDcResults } from '../engine/acdcEngine';
import { DcDcResults } from '../engine/dcdcEngine';
import { DesignReportModel, ReportChapter, ReportStep } from './designReportModel';
import { calcStringToTexLines } from './mathTexHelper';

function pdfSafeText(raw: string): string {
  return String(raw ?? '')
    .replace(/[\u2013\u2014\u2212]/g, '-')
    .replace(/\u2192/g, '->')
    .replace(/\u2265/g, '>=')
    .replace(/\u2264/g, '<=')
    .replace(/\u2248/g, '~=')
    .replace(/\u221a/g, 'sqrt')
    .replace(/\u00b2/g, '^2')
    .replace(/\u00b3/g, '^3')
    .replace(/[\u00b5\u03bc]/g, 'u')
    .replace(/\u03a9/g, 'Ohm')
    .replace(/\u0394/g, 'Delta ')
    .replace(/\u03b7/g, 'eta')
    .replace(/\u03c6/g, 'phi')
    .replace(/\u03b8/g, 'theta')
    .replace(/\u03c0/g, 'pi')
    .replace(/\u03b1/g, 'alpha')
    .replace(/\u03b2/g, 'beta')
    .replace(/\u03bb/g, 'lambda')
    .replace(/\u03b4/g, 'delta')
    .replace(/\u03c1/g, 'rho')
    .replace(/\u2716/g, '[FAIL]')
    .replace(/\u25b2/g, '[WARN]')
    .replace(/\u25cf/g, '[PASS]')
    // Keep standard printable ASCII + Latin-1 safe subset (° \xb0, × \xd7, · \xb7, ± \xb1, etc.)
    .replace(/[^\x20-\x7e\xa0-\xff\n]/g, ' ');
}

interface CapturedFigure {
  dataUrl: string;
  aspect: number; // height / width
}

interface CapturedMathBlock {
  dataUrl: string;
  widthMm: number;
  heightMm: number;
}

interface PreRenderedStepMath {
  given: CapturedMathBlock | null;
  equation: CapturedMathBlock | null;
  substitution: CapturedMathBlock | null;
  result: CapturedMathBlock | null;
}

let cachedKatexCssPromise: Promise<string> | null = null;

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function getKatexStandaloneCss(): Promise<string> {
  if (cachedKatexCssPromise) return cachedKatexCssPromise;
  cachedKatexCssPromise = (async () => {
    if (typeof document === 'undefined') return '';
    const fontUrlMap = new Map<string, string>();
    const fontRules: string[] = [];
    const katexRules: string[] = [];

    for (const sheet of Array.from(document.styleSheets)) {
      let rules: CSSRule[];
      try {
        rules = Array.from(sheet.cssRules || []);
      } catch {
        continue;
      }
      const baseHref = sheet.href || window.location.href;
      for (const rule of rules) {
        const cssText = rule.cssText || '';
        if (rule.type === CSSRule.FONT_FACE_RULE && /KaTeX/i.test(cssText)) {
          const woff2Match = cssText.match(/url\(["']?([^"')]+\.woff2(?:\?[^"')]+)?)["']?\)/i);
          if (woff2Match) {
            try {
              const absUrl = new URL(woff2Match[1], baseHref).href;
              fontUrlMap.set(absUrl, '');
              fontRules.push(`${cssText}__ABS_URL__${absUrl}`);
            } catch {
              // ignore malformed font URL
            }
          }
        } else if (cssText.includes('.katex')) {
          katexRules.push(cssText);
        }
      }
    }

    // Fetch and inline each KaTeX .woff2 font once as base64 data URI so SVG foreignObject stays 100% self-contained
    await Promise.all(
      Array.from(fontUrlMap.keys()).map(async (url) => {
        try {
          const resp = await fetch(url);
          if (!resp.ok) return;
          const buf = await resp.arrayBuffer();
          fontUrlMap.set(url, `data:font/woff2;base64,${arrayBufferToBase64(buf)}`);
        } catch {
          // ignore network errors cleanly
        }
      })
    );

    const resolvedFontCss = fontRules
      .map((entry) => {
        const [ruleText, absUrl] = entry.split('__ABS_URL__');
        const dataUri = fontUrlMap.get(absUrl);
        if (!dataUri) return '';
        // Replace entire src: ...; with single inline woff2 data URI for zero external fetches inside SVG
        return ruleText.replace(/src\s*:[^;]+;/i, `src: url("${dataUri}") format("woff2"); font-display: block;`);
      })
      .filter(Boolean)
      .join('\n');

    return `${resolvedFontCss}\n${katexRules.join('\n')}`;
  })();
  return cachedKatexCssPromise;
}

const PDF_PX_PER_MM = 96 / 25.4;

async function renderKatexLinesToPng(
  texLines: string[],
  opts: {
    fontSizePx: number;
    maxWidthMm: number;
    bgHex: string;
    textHex?: string;
    align?: 'left' | 'center';
    padX?: number;
    padY?: number;
    displayScaleMm?: number;
  }
): Promise<CapturedMathBlock | null> {
  if (typeof document === 'undefined' || texLines.length === 0) return null;
  try {
    const katexCss = await getKatexStandaloneCss();
    const textHex = opts.textHex || '#0f172a';
    const align = opts.align || 'left';
    const padX = opts.padX ?? 6;
    const padY = opts.padY ?? 4;
    const scaleMm = opts.displayScaleMm ?? 0.84;

    const katexBlocksHtml = texLines
      .map((tex) =>
        katex.renderToString(tex, {
          displayMode: true,
          output: 'html',
          throwOnError: false,
          strict: false,
        })
      )
      .join('');

    const host = document.createElement('div');
    host.style.position = 'fixed';
    host.style.left = '-99999px';
    host.style.top = '0';
    host.style.visibility = 'hidden';
    host.style.pointerEvents = 'none';
    host.style.background = opts.bgHex;

    const wrapper = document.createElement('div');
    wrapper.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
    wrapper.style.display = 'inline-block';
    wrapper.style.boxSizing = 'border-box';
    wrapper.style.padding = `${padY}px ${padX}px`;
    wrapper.style.background = opts.bgHex;
    wrapper.style.color = textHex;
    wrapper.style.fontFamily = 'KaTeX_Main, "Times New Roman", serif';
    wrapper.style.fontSize = `${opts.fontSizePx}px`;
    wrapper.style.lineHeight = '1.28';
    wrapper.style.textAlign = align;
    wrapper.style.whiteSpace = 'nowrap';
    wrapper.innerHTML = katexBlocksHtml;

    // Ensure .katex-display spacing inside compact PDF cards stays tight and aligned
    wrapper.querySelectorAll<HTMLElement>('.katex-display').forEach((el) => {
      el.style.margin = '2px 0';
      el.style.textAlign = align;
      el.style.color = textHex;
    });
    wrapper.querySelectorAll<HTMLElement>('.katex').forEach((el) => {
      el.style.color = textHex;
    });

    host.appendChild(wrapper);
    document.body.appendChild(host);

    const rect = wrapper.getBoundingClientRect();
    const wPx = Math.max(16, Math.ceil(rect.width) + 2);
    const hPx = Math.max(12, Math.ceil(rect.height) + 2);

    const xhtmlBody = new XMLSerializer().serializeToString(wrapper);
    document.body.removeChild(host);

    const svgStyle = `
      ${katexCss}
      .katex-display { margin: 2px 0 !important; text-align: ${align} !important; color: ${textHex} !important; }
      .katex { color: ${textHex} !important; font-size: 1em !important; }
      .katex .frac-line { border-bottom-color: ${textHex} !important; }
    `;
    const svgString = `<svg xmlns="http://www.w3.org/2000/svg" width="${wPx}" height="${hPx}" viewBox="0 0 ${wPx} ${hPx}"><style>${svgStyle}</style><rect x="0" y="0" width="${wPx}" height="${hPx}" fill="${opts.bgHex}"/><foreignObject x="0" y="0" width="${wPx}" height="${hPx}">${xhtmlBody}</foreignObject></svg>`;

    const imgUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgString)}`;
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = (err) => reject(err);
      i.src = imgUrl;
    });

    const retinaScale = 3.0;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(wPx * retinaScale));
    canvas.height = Math.max(1, Math.round(hPx * retinaScale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.fillStyle = opts.bgHex;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const rawWmm = (wPx / PDF_PX_PER_MM) * scaleMm;
    const rawHmm = (hPx / PDF_PX_PER_MM) * scaleMm;
    const fitRatio = rawWmm > opts.maxWidthMm ? opts.maxWidthMm / rawWmm : 1;

    return {
      dataUrl: canvas.toDataURL('image/png'),
      widthMm: rawWmm * fitRatio,
      heightMm: rawHmm * fitRatio,
    };
  } catch {
    return null;
  }
}

async function preRenderAllStepMath(
  chapters: ReportChapter[],
  maxWidthMm: number
): Promise<Map<string, PreRenderedStepMath>> {
  const result = new Map<string, PreRenderedStepMath>();
  const allEntries: { key: string; step: ReportStep }[] = [];
  for (const ch of chapters) {
    for (const st of ch.steps) {
      allEntries.push({ key: `${ch.id}::${st.step}`, step: st });
    }
  }

  const chunkSize = 6;
  for (let i = 0; i < allEntries.length; i += chunkSize) {
    const batch = allEntries.slice(i, i + chunkSize);
    await Promise.all(
      batch.map(async ({ key, step: st }) => {
        const [given, equation, substitution, resultImg] = await Promise.all([
          renderKatexLinesToPng(calcStringToTexLines(st.given), {
            fontSizePx: 11,
            maxWidthMm,
            bgHex: '#ffffff',
            textHex: '#334155',
            align: 'left',
            padX: 3,
            padY: 2,
            displayScaleMm: 0.78,
          }),
          renderKatexLinesToPng([st.tex], {
            fontSizePx: 13.5,
            maxWidthMm: maxWidthMm - 4,
            bgHex: '#f8fafc',
            textHex: '#0f172a',
            align: 'center',
            padX: 6,
            padY: 5,
            displayScaleMm: 0.85,
          }),
          renderKatexLinesToPng(calcStringToTexLines(st.substitution), {
            fontSizePx: 11.5,
            maxWidthMm: maxWidthMm - 4,
            bgHex: '#f8fafc',
            textHex: '#1e293b',
            align: 'left',
            padX: 5,
            padY: 3,
            displayScaleMm: 0.8,
          }),
          renderKatexLinesToPng(calcStringToTexLines(st.result), {
            fontSizePx: 11.5,
            maxWidthMm: maxWidthMm - 4,
            bgHex: '#ecfeff',
            textHex: '#0e7490',
            align: 'left',
            padX: 5,
            padY: 3,
            displayScaleMm: 0.82,
          }),
        ]);
        result.set(key, { given, equation, substitution, result: resultImg });
      })
    );
  }
  return result;
}

async function svgElementToPng(svgEl: SVGSVGElement): Promise<CapturedFigure | null> {
  try {
    const clone = svgEl.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

    let vbW = 740;
    let vbH = 240;
    const vb = clone.getAttribute('viewBox');
    if (vb) {
      const parts = vb.trim().split(/[\s,]+/).map(Number);
      if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
        vbW = parts[2];
        vbH = parts[3];
      }
    }
    clone.setAttribute('width', String(vbW));
    clone.setAttribute('height', String(vbH));

    // Prepend crisp white background rect inside SVG clone
    const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bgRect.setAttribute('x', '0');
    bgRect.setAttribute('y', '0');
    bgRect.setAttribute('width', String(vbW));
    bgRect.setAttribute('height', String(vbH));
    bgRect.setAttribute('fill', '#ffffff');
    clone.insertBefore(bgRect, clone.firstChild);

    const xml = new XMLSerializer().serializeToString(clone);
    const svgBlob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = (err) => reject(err);
      i.src = url;
    });

    const scale = 2.4;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(vbW * scale);
    canvas.height = Math.round(vbH * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      URL.revokeObjectURL(url);
      return null;
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);

    return {
      dataUrl: canvas.toDataURL('image/png'),
      aspect: vbH / vbW,
    };
  } catch {
    return null;
  }
}

async function captureReportFigures(containerEl: HTMLElement | null): Promise<Record<string, CapturedFigure>> {
  const out: Record<string, CapturedFigure> = {};
  if (!containerEl) return out;
  const figNodes = containerEl.querySelectorAll<HTMLElement>('[data-report-fig]');
  for (const figNode of Array.from(figNodes)) {
    const id = figNode.getAttribute('data-report-fig');
    const svg = figNode.querySelector('svg');
    if (!id || !svg) continue;
    const captured = await svgElementToPng(svg);
    if (captured) out[id] = captured;
  }
  return out;
}

const MARGIN_L = 14;
const MARGIN_R = 14;
const PAGE_W = 210;
const PAGE_H = 297;
const CONTENT_W = PAGE_W - MARGIN_L - MARGIN_R; // 182 mm
const TOP_Y = 18;
const BOTTOM_LIMIT = 280;

export async function generateRealDesignPdf(params: {
  model: DesignReportModel;
  dcdcState: DcDcDesignState;
  dcdcRes: DcDcResults;
  acdcState: AcDcDesignState;
  acdcRes: AcDcResults;
  articleElement: HTMLElement | null;
}): Promise<string> {
  const { model, dcdcState, dcdcRes, acdcState, acdcRes, articleElement } = params;

  const [figures, stepMathMap] = await Promise.all([
    captureReportFigures(articleElement),
    preRenderAllStepMath(model.chapters, CONTENT_W - 7),
  ]);
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });

  let curY = TOP_Y;
  const chapterPageMap: Record<string, number> = {};
  const tocSlots: { chapterId: string; page: number; y: number }[] = [];

  const ensureSpace = (neededMm: number) => {
    if (curY + neededMm > BOTTOM_LIMIT) {
      doc.addPage();
      curY = TOP_Y;
      return true;
    }
    return false;
  };

  const verdictColors = (status: 'pass' | 'warn' | 'fail'): [number, number, number] => {
    if (status === 'fail') return [190, 18, 60];
    if (status === 'warn') return [180, 83, 9];
    return [4, 120, 87];
  };

  // ============================================================================
  // PAGE 1: COVER HEADER, EXECUTIVE SUMMARY & TABLE OF CONTENTS
  // ============================================================================
  doc.setFillColor(15, 23, 42); // Slate-900 header banner
  doc.rect(MARGIN_L, 12, CONTENT_W, 28, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(34, 211, 238);
  doc.text('POWER CONVERTER DESIGN STUDIO · ENGINEERING SPECIFICATION BOOK', MARGIN_L + 4, 19);

  doc.setFontSize(13.5);
  doc.setTextColor(255, 255, 255);
  const titleLines = doc.splitTextToSize(pdfSafeText(model.title), CONTENT_W - 8);
  doc.text(titleLines, MARGIN_L + 4, 26);

  const failedChCount = model.chapters.filter((c) => c.stage !== 'audit' && c.status === 'fail').length;
  const warnedChCount = model.chapters.filter((c) => c.stage !== 'audit' && c.status === 'warn').length;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(203, 213, 225);
  doc.text(
    pdfSafeText(
      `Prepared By: Ahmed Emad  |  Date: ${model.dateStr}  |  Scope: ${model.scopeLabel}  |  Danger: ${model.scopedAlerts.danger.length} (${failedChCount} ch)  |  Warning: ${model.scopedAlerts.warning.length} (${warnedChCount} ch)`
    ),
    MARGIN_L + 4,
    36.5
  );

  curY = 46;

  // Stage Executive Summary Boxes
  const drawKpiBox = (x: number, y: number, w: number, header: string, lines: string[], accentRgb: [number, number, number]) => {
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(x, y, w, 24, 1.5, 1.5, 'FD');
    doc.setFont('courier', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...accentRgb);
    doc.text(pdfSafeText(header), x + 3, y + 5.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    lines.forEach((ln, idx) => {
      doc.text(pdfSafeText(ln), x + 3, y + 11.2 + idx * 4.6);
    });
  };

  if (model.includeAcDc && model.includeDcDc) {
    const halfW = (CONTENT_W - 4) / 2;
    drawKpiBox(
      MARGIN_L,
      curY,
      halfW,
      `STAGE A: AC-DC PFC (${acdcState.topology})`,
      [
        `Input: ${acdcState.Vac_rms_V} Vac (${acdcState.Vac_min_V}-${acdcState.Vac_max_V} V)`,
        `Bus / P_out: ${acdcState.Vdc_bus_V} Vdc / ${(acdcState.Pout_W / 1000).toFixed(2)} kW`,
        `Eff / PF / THDi: ${acdcRes.efficiency_pct.toFixed(2)}% / ${acdcRes.powerFactor_true.toFixed(3)} / ${acdcRes.THD_est_pct.toFixed(1)}%`,
      ],
      [67, 56, 202]
    );
    drawKpiBox(
      MARGIN_L + halfW + 4,
      curY,
      halfW,
      `STAGE B: DC-DC (${dcdcState.topology.toUpperCase()})`,
      [
        `V_in -> V_out: ${dcdcState.Vin_nom_V} V -> ${dcdcState.Vout_V} V (${dcdcRes.Iout_total_A.toFixed(1)} A)`,
        `Power / f_sw: ${(dcdcState.Pout_W / 1000).toFixed(2)} kW @ ${dcdcState.fsw_kHz} kHz`,
        `Eff / T_core / T_j: ${dcdcRes.efficiency_pct.toFixed(2)}% / ${dcdcRes.coreThermalAnalysis.Tcore_hotspot_C.toFixed(0)}°C / ${Math.max(dcdcRes.Tj_pri_C, dcdcRes.Tj_sec_C).toFixed(0)}°C`,
      ],
      [14, 116, 144]
    );
    curY += 29;
  } else if (model.includeAcDc) {
    drawKpiBox(
      MARGIN_L,
      curY,
      CONTENT_W,
      `AC-DC PFC STAGE (${acdcState.topology})`,
      [
        `Input Envelope: ${acdcState.Vac_rms_V} Vac nom (${acdcState.Vac_min_V}-${acdcState.Vac_max_V} V)  |  f_sw = ${acdcState.fsw_kHz} kHz`,
        `DC Link / Power: ${acdcState.Vdc_bus_V} Vdc / ${(acdcState.Pout_W / 1000).toFixed(2)} kW (${acdcRes.nPhases} phase)`,
        `Performance: Eff = ${acdcRes.efficiency_pct.toFixed(2)}%  |  PF = ${acdcRes.powerFactor_true.toFixed(4)}  |  THDi = ${acdcRes.THD_est_pct.toFixed(2)}%`,
      ],
      [67, 56, 202]
    );
    curY += 29;
  } else if (model.includeDcDc) {
    drawKpiBox(
      MARGIN_L,
      curY,
      CONTENT_W,
      `ISOLATED DC-DC STAGE (${dcdcState.topology.toUpperCase()} · ${dcdcState.txType})`,
      [
        `Input -> Output: ${dcdcState.Vin_nom_V} Vdc (${dcdcState.Vin_min_V}-${dcdcState.Vin_max_V} V) -> ${dcdcState.Vout_V} Vdc / ${dcdcRes.Iout_total_A.toFixed(1)} A`,
        `Transformer: ${dcdcRes.core.name} (${dcdcRes.material.name}) ${dcdcRes.Np_actual}:${dcdcRes.Ns_actual}  |  f_sw = ${dcdcState.fsw_kHz} kHz`,
        `Performance: Eff = ${dcdcRes.efficiency_pct.toFixed(2)}%  |  T_core = ${dcdcRes.coreThermalAnalysis.Tcore_hotspot_C.toFixed(1)}°C  |  ZVS = ${dcdcRes.zvsEnergyRatio_pct.toFixed(0)}%`,
      ],
      [14, 116, 144]
    );
    curY += 29;
  }

  // Table of Contents Header
  doc.setFillColor(241, 245, 249);
  doc.setDrawColor(148, 163, 184);
  doc.rect(MARGIN_L, curY, CONTENT_W, 8, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text('TABLE OF CONTENTS (Sequential Calculation & Design Rationale Order)', MARGIN_L + 3, curY + 5.5);
  curY += 11;

  for (const ch of model.chapters) {
    ensureSpace(12);
    const tocPage = doc.getNumberOfPages();
    const rowY = curY;
    tocSlots.push({ chapterId: ch.id, page: tocPage, y: rowY });

    doc.setFont('courier', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(14, 116, 144);
    doc.text(`Ch ${ch.num}.`, MARGIN_L + 2, curY);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(pdfSafeText(ch.title), MARGIN_L + 16, curY);

    const statusTag = ch.status === 'fail' ? '[FAIL]' : ch.status === 'warn' ? '[WARN]' : '[PASS]';
    doc.setFont('courier', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...verdictColors(ch.status));
    doc.text(statusTag, PAGE_W - MARGIN_R - 26, curY);

    // Subtitle line
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(pdfSafeText(ch.subtitle), MARGIN_L + 16, curY + 3.8);

    // Subtle divider
    doc.setDrawColor(226, 232, 240);
    doc.line(MARGIN_L, curY + 5.8, PAGE_W - MARGIN_R, curY + 5.8);
    curY += 9.2;
  }

  // Helper to draw wrapped table cleanly across page breaks
  const drawTable = (title: string, headers: string[], rows: string[][], colWidths: number[]) => {
    ensureSpace(22);
    doc.setFont('courier', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(51, 65, 85);
    doc.text(pdfSafeText(title), MARGIN_L, curY + 3);
    curY += 5;

    const drawHeader = () => {
      doc.setFillColor(241, 245, 249);
      doc.setDrawColor(148, 163, 184);
      doc.rect(MARGIN_L, curY, CONTENT_W, 6.5, 'FD');
      doc.setFont('courier', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(30, 41, 59);
      let x = MARGIN_L + 1.5;
      headers.forEach((h, i) => {
        doc.text(pdfSafeText(h), x, curY + 4.3, { maxWidth: colWidths[i] - 2 });
        x += colWidths[i];
      });
      curY += 6.5;
    };

    drawHeader();

    for (const row of rows) {
      doc.setFont('courier', 'normal');
      doc.setFontSize(7);
      const cellLines = row.map((cell, i) => doc.splitTextToSize(pdfSafeText(cell), colWidths[i] - 2.2));
      const maxLines = Math.max(1, ...cellLines.map((cl) => cl.length));
      const rowH = Math.max(5.5, maxLines * 3.4 + 2.2);

      if (curY + rowH > BOTTOM_LIMIT) {
        doc.addPage();
        curY = TOP_Y;
        drawHeader();
      }

      doc.setDrawColor(226, 232, 240);
      doc.rect(MARGIN_L, curY, CONTENT_W, rowH);
      let x = MARGIN_L + 1.5;
      cellLines.forEach((lines, i) => {
        const rawCell = row[i] || '';
        if (rawCell.includes('✖') || rawCell.includes('FAIL') || rawCell.includes('DANGER')) {
          doc.setFont('courier', 'bold');
          doc.setTextColor(190, 18, 60);
        } else if (rawCell.includes('▲') || rawCell.includes('TIGHT') || rawCell.includes('WARN')) {
          doc.setFont('courier', 'bold');
          doc.setTextColor(180, 83, 9);
        } else if (rawCell.includes('●') || rawCell.includes('PASS')) {
          doc.setFont('courier', 'bold');
          doc.setTextColor(4, 120, 87);
        } else {
          doc.setFont('courier', i === 0 ? 'bold' : 'normal');
          doc.setTextColor(15, 23, 42);
        }
        doc.text(lines, x, curY + 3.8);
        x += colWidths[i];
      });
      curY += rowH;
    }
    curY += 4;
  };

  // ============================================================================
  // CHAPTER PAGES
  // ============================================================================
  const renderChapter = (ch: ReportChapter, idx: number) => {
    // Each chapter starts on a clean new page for authentic engineering book flow
    doc.addPage();
    curY = TOP_Y;
    chapterPageMap[ch.id] = doc.getNumberOfPages();

    // Chapter Heading Bar
    const accentRgb: [number, number, number] =
      ch.stage === 'acdc' ? [67, 56, 202] : ch.stage === 'dcdc' ? [14, 116, 144] : [15, 23, 42];
    doc.setFillColor(...accentRgb);
    doc.rect(MARGIN_L, curY, CONTENT_W, 1.2, 'F');
    curY += 5;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(15, 23, 42);
    const chTitleLines = doc.splitTextToSize(pdfSafeText(`Chapter ${ch.num}. ${ch.title}`), CONTENT_W);
    doc.text(chTitleLines, MARGIN_L, curY);
    curY += chTitleLines.length * 5.2 + 1;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    const introLines = doc.splitTextToSize(pdfSafeText(ch.intro), CONTENT_W);
    doc.text(introLines, MARGIN_L, curY);
    curY += introLines.length * 4 + 3;

    // 1. Engineering Selection Rationale ("Why Chosen") Box
    const ratLines: { label: string; wrapped: string[] }[] = ch.rationale.points.map((pt) => {
      const text = `${pt.label}: ${pt.detail}`;
      return {
        label: pt.label,
        wrapped: doc.splitTextToSize(pdfSafeText(`- ${text}`), CONTENT_W - 7),
      };
    });
    const ratTotalLines = ratLines.reduce((s, r) => s + r.wrapped.length, 0);
    const ratBoxH = 8 + ratTotalLines * 3.7 + ratLines.length * 1.1;
    ensureSpace(ratBoxH + 3);

    doc.setFillColor(240, 249, 255);
    doc.setDrawColor(125, 211, 252);
    doc.roundedRect(MARGIN_L, curY, CONTENT_W, ratBoxH, 1.5, 1.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(12, 74, 110);
    doc.text(pdfSafeText(`WHY SELECTED — ${ch.rationale.heading}`), MARGIN_L + 3, curY + 5);

    let ry = curY + 9.5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);
    for (const r of ratLines) {
      doc.text(r.wrapped, MARGIN_L + 3.5, ry);
      ry += r.wrapped.length * 3.7 + 1.1;
    }
    curY += ratBoxH + 4;

    // 2. Step-by-Step Calculation Cards (KaTeX math rendering + ASCII fallback)
    for (const st of ch.steps) {
      const rendered = stepMathMap.get(`${ch.id}::${st.step}`);
      const innerW = CONTENT_W - 6;

      doc.setFont('courier', 'normal');
      doc.setFontSize(7.5);
      const givenFallback = doc.splitTextToSize(pdfSafeText(st.given), innerW - 2);
      const eqFallback = doc.splitTextToSize(pdfSafeText(st.formulaPlain), innerW - 4);
      const subFallback = doc.splitTextToSize(pdfSafeText(st.substitution), innerW - 4);
      const resFallback = doc.splitTextToSize(pdfSafeText(st.result), innerW - 4);

      const givenBodyH = rendered?.given ? rendered.given.heightMm + 1.0 : givenFallback.length * 3.5 + 1.2;
      const eqBoxH = rendered?.equation ? Math.max(7.2, rendered.equation.heightMm + 2.0) : eqFallback.length * 3.6 + 2.4;
      const subBoxH = rendered?.substitution ? Math.max(6.4, rendered.substitution.heightMm + 1.6) : subFallback.length * 3.5 + 2.0;
      const resBodyH = rendered?.result ? rendered.result.heightMm + 1.4 : resFallback.length * 3.6 + 1.4;
      const resBoxH = 3.8 + resBodyH + 1.0;

      const headerH = 6.2;
      const cardH =
        headerH +
        2.2 + // top pad
        3.4 + givenBodyH + 1.4 + // 1. Given
        3.4 + eqBoxH + 1.4 +     // 2. Equation
        3.4 + subBoxH + 1.6 +    // 3. Substitution
        resBoxH +                // 4. Result box
        2.4;                     // bottom pad

      ensureSpace(cardH + 3);

      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(203, 213, 225);
      doc.roundedRect(MARGIN_L, curY, CONTENT_W, cardH, 1.2, 1.2, 'FD');

      // Card header strip
      doc.setFillColor(248, 250, 252);
      doc.rect(MARGIN_L, curY, CONTENT_W, headerH, 'F');
      doc.setDrawColor(226, 232, 240);
      doc.line(MARGIN_L, curY + headerH, PAGE_W - MARGIN_R, curY + headerH);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(14, 116, 144);
      doc.text(pdfSafeText(`Step ${st.step}`), MARGIN_L + 3, curY + 4.3);

      doc.setTextColor(15, 23, 42);
      doc.text(pdfSafeText(st.title), MARGIN_L + 20, curY + 4.3, { maxWidth: CONTENT_W - 64 });

      if (st.verdict) {
        doc.setFont('courier', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(...verdictColors(st.verdict.status));
        const vTxt = pdfSafeText(
          `${st.verdict.status === 'fail' ? '[FAIL]' : st.verdict.status === 'warn' ? '[WARN]' : '[PASS]'} ${st.verdict.label}`
        );
        doc.text(vTxt, PAGE_W - MARGIN_R - 3, curY + 4.3, { align: 'right' });
      }

      let sy = curY + headerH + 2.2;

      // 1. GIVEN INPUTS
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(100, 116, 139);
      doc.text('1. GIVEN INPUTS', MARGIN_L + 3, sy + 2.2);
      sy += 3.4;
      if (rendered?.given) {
        doc.addImage(rendered.given.dataUrl, 'PNG', MARGIN_L + 3, sy, rendered.given.widthMm, rendered.given.heightMm, undefined, 'FAST');
      } else {
        doc.setFont('courier', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(51, 65, 85);
        doc.text(givenFallback, MARGIN_L + 3.5, sy + 2.8);
      }
      sy += givenBodyH + 1.4;

      // 2. GOVERNING EQUATION
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(100, 116, 139);
      doc.text('2. GOVERNING EQUATION', MARGIN_L + 3, sy + 2.2);
      sy += 3.4;
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(MARGIN_L + 3, sy, innerW, eqBoxH, 0.9, 0.9, 'FD');
      if (rendered?.equation) {
        const eqX = MARGIN_L + 3 + Math.max(1, (innerW - rendered.equation.widthMm) / 2);
        const eqY = sy + Math.max(0.8, (eqBoxH - rendered.equation.heightMm) / 2);
        doc.addImage(rendered.equation.dataUrl, 'PNG', eqX, eqY, rendered.equation.widthMm, rendered.equation.heightMm, undefined, 'FAST');
      } else {
        doc.setFont('courier', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(15, 23, 42);
        doc.text(eqFallback, MARGIN_L + 5, sy + 3.6);
      }
      sy += eqBoxH + 1.4;

      // 3. NUMERICAL SUBSTITUTION
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(100, 116, 139);
      doc.text('3. NUMERICAL SUBSTITUTION', MARGIN_L + 3, sy + 2.2);
      sy += 3.4;
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(MARGIN_L + 3, sy, innerW, subBoxH, 0.9, 0.9, 'FD');
      if (rendered?.substitution) {
        const subY = sy + Math.max(0.6, (subBoxH - rendered.substitution.heightMm) / 2);
        doc.addImage(rendered.substitution.dataUrl, 'PNG', MARGIN_L + 4, subY, rendered.substitution.widthMm, rendered.substitution.heightMm, undefined, 'FAST');
      } else {
        doc.setFont('courier', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(51, 65, 85);
        doc.text(subFallback, MARGIN_L + 4.5, sy + 3.4);
      }
      sy += subBoxH + 1.6;

      // 4. COMPUTED RESULT
      doc.setFillColor(236, 254, 255);
      doc.setDrawColor(165, 243, 252);
      doc.roundedRect(MARGIN_L + 3, sy, innerW, resBoxH, 0.9, 0.9, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(14, 116, 144);
      doc.text('4. COMPUTED RESULT', MARGIN_L + 4.5, sy + 2.8);
      if (rendered?.result) {
        doc.addImage(rendered.result.dataUrl, 'PNG', MARGIN_L + 4.2, sy + 3.7, rendered.result.widthMm, rendered.result.heightMm, undefined, 'FAST');
      } else {
        doc.setFont('courier', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(14, 116, 144);
        doc.text(resFallback, MARGIN_L + 4.5, sy + 6.4);
      }

      curY += cardH + 3;
    }

    // 3. Parameter Synthesis Tables
    if (ch.paramTables) {
      for (const tbl of ch.paramTables) {
        drawTable(tbl.title, tbl.headers, tbl.rows, [28, 36, 46, 72]);
      }
    }

    // 4. Inductor Schedule Table
    if (ch.inductorSchedule && ch.inductorSchedule.rows.length > 0) {
      drawTable(
        ch.inductorSchedule.title,
        ['Ref', 'Target L', 'Core & Material', 'Turns & Wire', 'Fill %', 'B_pk / B_sat', 'P_tot / T_hot', 'Verdict'],
        ch.inductorSchedule.rows.map(({ req, sol }) => [
          `${req.designator} (${req.quantity}x)`,
          req.targetL_uH >= 1000 ? `${(req.targetL_uH / 1000).toFixed(2)} mH` : `${req.targetL_uH.toFixed(1)} uH`,
          `${sol.core.id.toUpperCase()} / ${sol.material.name}`,
          `${sol.turnsN}T x ${sol.parallelStrands}xAWG${sol.wire.awg}`,
          `${sol.windowFill_pct.toFixed(0)}%`,
          `${sol.B_pk_T.toFixed(2)}/${sol.B_sat_T.toFixed(2)}T`,
          `${sol.P_total_W.toFixed(1)}W/${sol.T_hotspot_C.toFixed(0)}°C`,
          sol.satStatus === 'critical' || sol.windowFitStatus === 'overflow'
            ? 'FAIL'
            : sol.satStatus === 'warning' || sol.windowFitStatus === 'tight'
            ? 'TIGHT'
            : 'PASS',
        ]),
        [20, 19, 34, 28, 13, 25, 27, 16]
      );
    }

    // 5. Capacitor Bank Schedule Table
    if (ch.capacitorSchedule && ch.capacitorSchedule.rows.length > 0) {
      drawTable(
        ch.capacitorSchedule.title,
        ['Ref', 'Matrix', 'Unit MPN', 'Bank C / ESR', 'V_op / V_rate', 'I_rms %', 'L10 / T_hot', 'Verdict'],
        ch.capacitorSchedule.rows.map(({ req, sol }) => [
          req.designator,
          `${sol.seriesCount}Sx${sol.parallelCount}P`,
          sol.unitPart.mpn,
          `${sol.bank_C_uF < 1 ? `${(sol.bank_C_uF * 1000).toFixed(1)}nF` : `${sol.bank_C_uF.toFixed(0)}uF`} / ${sol.bank_ESR_mOhm.toFixed(1)}mOhm`,
          `${req.V_op_pk_V.toFixed(0)}/${sol.bank_V_rated_V}V (${sol.voltageDerating_pct.toFixed(0)}%)`,
          `${sol.rippleUtilization_pct.toFixed(0)}%`,
          `${(sol.L10_life_hrs / 1000).toFixed(0)}kh / ${sol.T_hotspot_C.toFixed(0)}°C`,
          sol.status === 'critical' ? 'FAIL' : sol.status === 'warning' ? 'TIGHT' : 'PASS',
        ]),
        [18, 16, 36, 30, 29, 14, 24, 15]
      );
    }

    // 6. Vector Figures (captured at 2.4x PNG DPI)
    if (ch.figures) {
      for (const fig of ch.figures) {
        const cap = figures[fig.figId];
        if (!cap) continue;
        const imgW = CONTENT_W;
        const imgH = imgW * cap.aspect;
        ensureSpace(imgH + 10);
        doc.setDrawColor(203, 213, 225);
        doc.rect(MARGIN_L, curY, imgW, imgH);
        doc.addImage(cap.dataUrl, 'PNG', MARGIN_L, curY, imgW, imgH, undefined, 'FAST');
        curY += imgH + 3.5;

        doc.setFont('courier', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(71, 85, 105);
        const capLines = doc.splitTextToSize(pdfSafeText(fig.caption), CONTENT_W);
        doc.text(capLines, MARGIN_L, curY);
        curY += capLines.length * 3.5 + 3.5;
      }
    }

    // 7. Final Audit Alerts Table on last chapter
    if (idx === model.chapters.length - 1) {
      if (model.scopedAlerts.all.length > 0) {
        drawTable(
          'Active Engineering Audit Findings',
          ['Severity', 'Stage', 'Finding', 'Measured Telemetry', 'Recommended Fix'],
          model.scopedAlerts.all.map((a) => [
            a.severity === 'danger' ? 'DANGER' : 'WARN',
            a.domainLabel,
            a.title,
            a.metric,
            a.fixes?.[0]?.label || a.actionHint,
          ]),
          [17, 15, 42, 52, 56]
        );
      } else {
        drawTable(
          'Final Release Verdict',
          ['Audit Scope', 'Danger Alerts', 'Warning Alerts', 'Overall Sign-Off'],
          [
            [
              model.scopeLabel,
              String(model.scopedAlerts.danger.length),
              String(model.scopedAlerts.warning.length),
              ch.status === 'fail' ? '✖ FAIL (See Chapter Matrix)' : ch.status === 'warn' ? '▲ WARN (See Chapter Matrix)' : '● PASS — Zero Violations',
            ],
          ],
          [50, 32, 32, 68]
        );
      }
    }
  };

  model.chapters.forEach((ch, idx) => renderChapter(ch, idx));

  // ============================================================================
  // PASS 2: FILL EXACT PAGE NUMBERS IN TOC + STAMP RUNNING HEADERS & FOOTERS
  // ============================================================================
  for (const slot of tocSlots) {
    const targetPage = chapterPageMap[slot.chapterId];
    if (!targetPage) continue;
    doc.setPage(slot.page);
    doc.setFont('courier', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text(`p. ${targetPage}`, PAGE_W - MARGIN_R - 2, slot.y, { align: 'right' });

    // Clickable internal PDF link on each TOC row
    doc.link(MARGIN_L, slot.y - 4.5, CONTENT_W, 7.5, { pageNumber: targetPage });
  }

  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    if (p > 1) {
      doc.setFont('courier', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text(pdfSafeText(`Power Converter Design Studio — ${model.scopeLabel}`), MARGIN_L, 10.5);
      doc.text(pdfSafeText(model.dateStr), PAGE_W - MARGIN_R, 10.5, { align: 'right' });
      doc.setDrawColor(226, 232, 240);
      doc.line(MARGIN_L, 12.2, PAGE_W - MARGIN_R, 12.2);
    }

    doc.setDrawColor(226, 232, 240);
    doc.line(MARGIN_L, 285, PAGE_W - MARGIN_R, 285);
    doc.setFont('courier', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text('Prepared By: Ahmed Emad · Engineering Design Book Report', MARGIN_L, 289.5);
    doc.text(`Page ${p} of ${totalPages}`, PAGE_W - MARGIN_R, 289.5, { align: 'right' });
  }

  const fileSlug =
    model.scope === 'both'
      ? 'Complete_ACDC_DCDC'
      : model.scope === 'dcdc'
      ? 'DCDC_Converter'
      : 'ACDC_PFC';
  const fileName = `PowerStage_Engineering_Report_${fileSlug}.pdf`;
  doc.save(fileName);
  return fileName;
}
