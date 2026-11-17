// ============================================================================
// MATHEMATICAL EXPRESSION TO KATEX LATEX CONVERTER
// Converts calculation strings (given inputs, substitutions, computed results)
// from engineering report steps into valid, human-readable KaTeX LaTeX lines.
// ============================================================================

const PROSE_AND_UNIT_WORDS = new Set([
  'Hz', 'kHz', 'MHz', 'mHz',
  'mA', 'Arms', 'A_rms', 'App', 'Apk',
  'mV', 'Vac', 'Vdc', 'Vrms', 'Vpk', 'Vus',
  'mW', 'kW', 'MW',
  'mH', 'uH', 'nH',
  'mF', 'uF', 'nF', 'pF',
  'Ohm', 'mOhm', 'kOhm', 'MOhm',
  'mT', 'Oe', 'mm', 'cm', 'um', 'ns', 'us', 'ms', 'sec', 'min', 'max', 'nom',
  'hr', 'hrs', 'kh', 'dB', 'deg',
  'phase', 'phases', 'ph', 'all', 'at', 'as', 'by', 'to', 'of', 'on', 'in', 'or', 'vs', 'per', 'for', 'from',
  'and', 'with', 'above', 'below', 'across', 'under', 'only', 'both', 'no', 'yes',
  'unclamped', 'clamped', 'Clamped', 'Computed', 'iteratively', 'includes', 'assuming',
  'fast', 'slow', 'FETs', 'MOSFET', 'MOSFETs', 'diode', 'diodes',
  'Thermal', 'Feedback', 'Gain', 'Temp', 'factor', 'Max', 'Min', 'Peak',
  'cond', 'sw', 'Snub', 'snub', 'gate', 'core', 'pri', 'sec', 'tot', 'est',
  'limits', 'limit', 'crest', 'margin', 'Margin', 'drop', 'loss', 'ripple',
  'Zero', 'zero', 'crossing', 'WC', 'actual', 'target', 'req', 'avail', 'crit',
  'Mode', 'mode', 'Bypass', 'bypass', 'bridge', 'half', 'full', 'Air', 'air', 'gap',
  'series', 'parallel', 'turns', 'turn', 'eff', 'avg', 'rms', 'pk', 'opt', 'sat',
]);

function replaceSqrt(input: string): string {
  let out = '';
  let i = 0;
  while (i < input.length) {
    if (input[i] === '√') {
      if (input[i + 1] === '(') {
        let depth = 1;
        let j = i + 2;
        while (j < input.length && depth > 0) {
          if (input[j] === '(') depth++;
          else if (input[j] === ')') depth--;
          j++;
        }
        if (depth === 0) {
          const inner = input.slice(i + 2, j - 1);
          out += `\\sqrt{${replaceSqrt(inner)}}`;
          i = j;
          continue;
        }
      }
      const m = input.slice(i + 1).match(/^([A-Za-z0-9.,_]+)/);
      if (m) {
        out += `\\sqrt{${m[1]}}`;
        i += 1 + m[1].length;
        continue;
      }
      out += '\\sqrt{}';
      i += 1;
      continue;
    }
    out += input[i];
    i += 1;
  }
  return out;
}

function splitCalculationClauses(raw: string): string[] {
  const bySemi = raw
    .split(/\s*;\s*/)
    .map((s) => s.trim())
    .filter(Boolean);

  const clauses: string[] = [];
  for (const part of bySemi) {
    if (part.length > 74 && part.includes(' · ')) {
      const subParts = part.split(/\s+·\s+/).map((s) => s.trim()).filter(Boolean);
      let acc = '';
      for (const sp of subParts) {
        if (!acc) {
          acc = sp;
        } else if (acc.length + sp.length + 3 <= 68) {
          acc = `${acc} · ${sp}`;
        } else {
          clauses.push(acc);
          acc = sp;
        }
      }
      if (acc) clauses.push(acc);
    } else if (part.length > 78 && part.includes(', ')) {
      const subParts = part.split(/,\s+/).map((s) => s.trim()).filter(Boolean);
      let acc = '';
      for (const sp of subParts) {
        if (!acc) {
          acc = sp;
        } else if (acc.length + sp.length + 2 <= 68) {
          acc = `${acc}, ${sp}`;
        } else {
          clauses.push(acc);
          acc = sp;
        }
      }
      if (acc) clauses.push(acc);
    } else {
      clauses.push(part);
    }
  }
  return clauses.length > 0 ? clauses : [raw];
}

function singleClauseToTex(clause: string): string {
  let s = clause.trim();
  if (!s) return '';

  // 1. Expand balanced square roots before altering parens
  s = replaceSqrt(s);

  // 2. Scientific notation e.g. 65e3 -> 65 \times 10^{3}, 2.9e-6 -> 2.9 \times 10^{-6}
  s = s.replace(/(\d+(?:\.\d+)?)e([+-]?\d+)\b/g, '$1 \\times 10^{$2}');

  // 3. Special units & compound micro/ohm expressions
  s = s.replace(/µV·s|uV·s/g, '\\mu\\text{V}\\cdot\\text{s}');
  s = s.replace(/°C/g, '^{\\circ}\\text{C}');
  s = s.replace(/°/g, '^{\\circ}');
  s = s.replace(/²/g, '^{2}');
  s = s.replace(/³/g, '^{3}');
  s = s.replace(/⁴/g, '^{4}');
  s = s.replace(/%/g, '\\%');
  s = s.replace(/&/g, '\\&');

  // 4. Special ASCII/Unicode symbols -> LaTeX tokens
  s = s.replace(/->|→/g, ' \\to ');
  s = s.replace(/>=|≥/g, ' \\ge ');
  s = s.replace(/<=|≤/g, ' \\le ');
  s = s.replace(/~=|≈/g, ' \\approx ');
  s = s.replace(/±/g, ' \\pm ');
  s = s.replace(/×/g, ' \\times ');
  s = s.replace(/÷/g, ' \\div ');
  s = s.replace(/[−–—]/g, ' - ');
  s = s.replace(/·/g, ' \\cdot ');

  // 5. Subscripted symbols e.g. I_ac,max, V_dc,bus, T_j,pri, R_th,jc
  s = s.replace(/([A-Za-zηΔφθπαβλδρω]+)_([A-Za-z0-9,.]+)/g, (_m, sym: string, sub: string) => {
    const cleanSub = sub.replace(/\\text\{([^}]*)\}/g, '$1');
    return `${sym}_{\\text{${cleanSub}}}`;
  });

  // 6. Greek letters (do AFTER subscripts so ΔI_L,max becomes \Delta I_{\text{L,max}})
  s = s.replace(/η/g, '\\eta ');
  s = s.replace(/Δ/g, '\\Delta ');
  s = s.replace(/φ/g, '\\varphi ');
  s = s.replace(/θ/g, '\\theta ');
  s = s.replace(/π/g, '\\pi ');
  s = s.replace(/α/g, '\\alpha ');
  s = s.replace(/β/g, '\\beta ');
  s = s.replace(/λ/g, '\\lambda ');
  s = s.replace(/δ/g, '\\delta ');
  s = s.replace(/ρ/g, '\\rho ');
  s = s.replace(/ω/g, '\\omega ');
  s = s.replace(/µ|μ/g, '\\mu ');
  s = s.replace(/Ω/g, '\\Omega ');

  // 7. Wrap prose words and standard units in \text{...} safely without touching LaTeX commands or {...}
  // Walk token-by-token skipping \cmd and _{...} blocks
  let out = '';
  let idx = 0;
  while (idx < s.length) {
    // Skip existing \cmd or \text{...}
    if (s[idx] === '\\') {
      const cmdMatch = s.slice(idx).match(/^\\[A-Za-z]+/);
      if (cmdMatch) {
        const cmd = cmdMatch[0];
        out += cmd;
        idx += cmd.length;
        if (cmd === '\\text' && s[idx] === '{') {
          let depth = 1;
          let j = idx + 1;
          while (j < s.length && depth > 0) {
            if (s[j] === '{') depth++;
            else if (s[j] === '}') depth--;
            j++;
          }
          out += s.slice(idx, j);
          idx = j;
        }
        continue;
      }
      out += s.slice(idx, idx + 2);
      idx += 2;
      continue;
    }

    // Skip braced group _{...} or ^{...}
    if ((s[idx] === '_' || s[idx] === '^') && s[idx + 1] === '{') {
      let depth = 1;
      let j = idx + 2;
      while (j < s.length && depth > 0) {
        if (s[j] === '{') depth++;
        else if (s[j] === '}') depth--;
        j++;
      }
      out += s.slice(idx, j);
      idx = j;
      continue;
    }

    // Alphabetic word candidate
    const wordMatch = s.slice(idx).match(/^[A-Za-z]+/);
    if (wordMatch) {
      const word = wordMatch[0];
      const nextChar = s[idx + word.length];
      // Check if it is immediately followed by '_' or '^' (meaning it's a math symbol like D_eff or V^2)
      if (nextChar === '_' || nextChar === '^') {
        out += word;
      } else if (word === 'THDi') {
        out += '\\text{THD}_i';
      } else if (word === 'sin' || word === 'cos' || word === 'tan' || word === 'log') {
        out += `\\${word} `;
      } else if (word === 'mOhm') {
        out += '\\text{m}\\Omega';
      } else if (word === 'Ohm') {
        out += '\\Omega';
      } else if (word === 'uH') {
        out += '\\mu\\text{H}';
      } else if (word === 'uF') {
        out += '\\mu\\text{F}';
      } else if (word === 'us') {
        out += '\\mu\\text{s}';
      } else if (
        PROSE_AND_UNIT_WORDS.has(word) ||
        (word.length >= 3 && /^[a-z]+$/.test(word)) ||
        (word.length >= 4 && /^[A-Z][a-z]+$/.test(word))
      ) {
        // Add thin space before unit if preceded by digit or brace
        const prevChar = out[out.length - 1];
        const prefix = prevChar && /[0-9}]/.test(prevChar) ? '\\,' : '';
        out += `${prefix}\\text{${word}}`;
      } else if (word === 'V' || word === 'A' || word === 'W' || word === 'H' || word === 'F' || word === 'T' || word === 'K' || word === 'J' || word === 's' || word === 'm') {
        const prevChar = out[out.length - 1];
        // Unit letter right after a number (e.g. "48 V" or "12W")
        if (prevChar && (/[0-9}]/.test(prevChar) || (prevChar === ' ' && out.length >= 2 && /[0-9}]/.test(out[out.length - 2])))) {
          out += `\\text{${word}}`;
        } else {
          out += word;
        }
      } else {
        out += word;
      }
      idx += word.length;
      continue;
    }

    out += s[idx];
    idx += 1;
  }

  return out.replace(/\s{2,}/g, ' ').trim();
}

export function calcStringToTexLines(raw: string): string[] {
  const clauses = splitCalculationClauses(String(raw ?? ''));
  return clauses.map(singleClauseToTex).filter(Boolean);
}
