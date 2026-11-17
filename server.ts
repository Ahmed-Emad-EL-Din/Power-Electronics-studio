import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '2mb' }));

  // ============================================================================
  // POST /api/component-search
  // Uses Gemini 3.8 Flash + Google Search Grounding to pull real-world MOSFET,
  // SiC, GaN, or Schottky diode datasheet parameters from DigiKey / Mouser / OEMs
  // ============================================================================
  app.post('/api/component-search', async (req, res) => {
    try {
      const { query, operatingContext } = req.body as {
        query?: string;
        operatingContext?: {
          domain?: string;
          topology?: string;
          Vin_V?: number;
          Vout_V?: number;
          Pout_W?: number;
          fsw_kHz?: number;
        };
      };

      if (!query || typeof query !== 'string' || !query.trim()) {
        res.status(400).json({ error: 'Please provide a part number or component search query.' });
        return;
      }

      const contextText = operatingContext
        ? `Active converter context: Topology=${operatingContext.topology || 'PSFB/LLC'}, Vin=${operatingContext.Vin_V || 400}V, Vout=${operatingContext.Vout_V || 48}V, Pout=${operatingContext.Pout_W || 3300}W, fsw=${operatingContext.fsw_kHz || 100}kHz.`
        : '';

      const prompt = `Search LCSC (lcsc.com), JLCPCB Parts Library (jlcpcb.com/parts), DigiKey, Mouser, and official semiconductor manufacturer datasheets (Infineon, Wolfspeed, onsemi, STMicroelectronics, Renesas/GaN Systems, Innoscience, Oriental Semi, CR Micro, Vishay, Rohm, Nexperia) for the following power electronics component query or LCSC C-number: "${query.trim()}".
${contextText}

Return 1 to 4 real, commercially available power semiconductor devices matching the query with accurate datasheet electrical, thermal, and LCSC/JLCPCB catalog specifications:
- Exact manufacturer part number (id), manufacturer name, package type (e.g., PG-TO247-4, PG-TO263-7 / D2PAK-7, PG-HSOF-8 / TOLL, TDSON-8 5x6, TO-247-3)
- lcscPartNumber: Real LCSC part code starting with 'C' followed by digits (e.g., "C2904521", "C2839104", "C2931840", "C96748") if listed on LCSC/JLCPCB
- jlcpcbClass: "Extended Part", "Basic Part", or "Through-Hole" based on package and JLCPCB SMT assembly classification
- lcscStock: Typical or current LCSC stock count (integer, e.g. 2500)
- Technology classification: one of "SiC MOSFET", "GaN HEMT", "SJ Si MOSFET", "OptiMOS SR", or "SiC Schottky"
- Recommended converter role: "primary" (for >=400V high-voltage switches), "secondary" (for <=250V low-Rds synchronous rectifiers or Schottky diodes), or "both"
- Vds_max_V (drain-source breakdown voltage V)
- Id_max_A (continuous drain current at 25°C in A)
- Rds_on_25C_mOhm (typical on-state resistance at 25°C in mΩ)
- alpha_R_per_C (temperature coefficient per °C, typically 0.0035 to 0.0045 for SiC, 0.0055 for GaN, 0.0060 to 0.0085 for Si MOSFET)
- Coss_er_pF (effective energy-related output capacitance Coss(er) in pF at rated Vds)
- Coss_tr_pF (effective time-related output capacitance Coss(tr) in pF; if not explicitly in datasheet, estimate as ~1.45 * Coss_er_pF for SiC/GaN or ~3.5 * Coss_er_pF for Superjunction Si)
- Qg_nC (total gate charge Qg in nC)
- Qgd_nC (gate-drain Miller plateau charge Qgd in nC)
- Rg_int_Ohm (internal gate mesh resistance Rg(int) in Ω, typically 0.8 to 4.5 Ω)
- Qrr_nC (reverse recovery charge Qrr in nC at 25°C; 0 for GaN HEMT or pure SiC Schottky)
- Vsd_V (body diode or 3rd-quadrant forward voltage drop Vsd in V)
- tr_ns (turn-on rise time tr in ns)
- tf_ns (turn-off fall time tf in ns)
- Rth_JC_CW (junction-to-case thermal resistance Rth(j-c) in °C/W)
- kelvinSource (true if package has a 4-pin Kelvin source pin like TO-247-4, D2PAK-7, TOLL, or DFN; false for 3-lead TO-247-3 / TO-220)
- unitPrice_USD (approximate 1-unit LCSC/DigiKey/Mouser price in USD)
- distributorSku (LCSC C-number and DigiKey/Mouser catalog reference)
- datasheetSummary (concise 1-sentence summary of test conditions, LCSC availability, and why this part fits the converter)`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          systemInstruction:
            'You are a senior power electronics component engineer with live access to LCSC (lcsc.com), JLCPCB Parts Library, DigiKey, Mouser, and OEM semiconductor datasheets via Google Search. Always return accurate, real-world datasheet numbers and LCSC C-numbers in the requested JSON schema.',
          tools: [{ googleSearch: {} }],
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              searchSummary: {
                type: Type.STRING,
                description: 'Brief summary of the LCSC/JLCPCB/DigiKey/datasheet search results.',
              },
              components: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING, description: 'Exact manufacturer part number, e.g. IMZA65R027M1H' },
                    name: { type: Type.STRING, description: 'Display name with vendor, voltage, Rds(on), and LCSC C-number' },
                    manufacturer: { type: Type.STRING },
                    packageType: { type: Type.STRING },
                    lcscPartNumber: { type: Type.STRING, description: 'LCSC C-number e.g. C2904521' },
                    jlcpcbClass: {
                      type: Type.STRING,
                      description: 'Must be one of: Basic Part, Extended Part, Through-Hole',
                    },
                    lcscStock: { type: Type.NUMBER },
                    tech: {
                      type: Type.STRING,
                      description: 'Must be one of: SiC MOSFET, GaN HEMT, SJ Si MOSFET, OptiMOS SR, SiC Schottky',
                    },
                    role: {
                      type: Type.STRING,
                      description: 'Must be one of: primary, secondary, both',
                    },
                    Vds_max_V: { type: Type.NUMBER },
                    Id_max_A: { type: Type.NUMBER },
                    Rds_on_25C_mOhm: { type: Type.NUMBER },
                    alpha_R_per_C: { type: Type.NUMBER },
                    Coss_er_pF: { type: Type.NUMBER },
                    Coss_tr_pF: { type: Type.NUMBER },
                    Qg_nC: { type: Type.NUMBER },
                    Qgd_nC: { type: Type.NUMBER },
                    Rg_int_Ohm: { type: Type.NUMBER },
                    Qrr_nC: { type: Type.NUMBER },
                    Vsd_V: { type: Type.NUMBER },
                    tr_ns: { type: Type.NUMBER },
                    tf_ns: { type: Type.NUMBER },
                    Rth_JC_CW: { type: Type.NUMBER },
                    kelvinSource: { type: Type.BOOLEAN },
                    unitPrice_USD: { type: Type.NUMBER },
                    distributorSku: { type: Type.STRING },
                    datasheetSummary: { type: Type.STRING },
                  },
                  required: [
                    'id',
                    'name',
                    'manufacturer',
                    'packageType',
                    'lcscPartNumber',
                    'jlcpcbClass',
                    'lcscStock',
                    'tech',
                    'role',
                    'Vds_max_V',
                    'Id_max_A',
                    'Rds_on_25C_mOhm',
                    'alpha_R_per_C',
                    'Coss_er_pF',
                    'Coss_tr_pF',
                    'Qg_nC',
                    'Qgd_nC',
                    'Rg_int_Ohm',
                    'Qrr_nC',
                    'Vsd_V',
                    'tr_ns',
                    'tf_ns',
                    'Rth_JC_CW',
                    'kelvinSource',
                    'unitPrice_USD',
                    'distributorSku',
                    'datasheetSummary',
                  ],
                },
              },
            },
            required: ['searchSummary', 'components'],
          },
        },
      });

      const rawText = (response.text ?? '{}').trim();
      let parsed: { searchSummary?: string; components?: unknown[] } = {};
      try {
        parsed = JSON.parse(rawText);
      } catch {
        // Fallback if markdown fences were included
        const cleaned = rawText.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
        parsed = JSON.parse(cleaned);
      }

      const groundingChunks =
        response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      const sources = groundingChunks
        .map((chunk) => {
          const web = (chunk as { web?: { uri?: string; title?: string } }).web;
          if (web && web.uri) {
            return {
              uri: web.uri,
              title: web.title || web.uri,
            };
          }
          return null;
        })
        .filter((s): s is { uri: string; title: string } => s !== null);

      res.json({
        searchSummary: parsed.searchSummary || `Found ${parsed.components?.length || 0} components for "${query}".`,
        components: parsed.components || [],
        sources,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to fetch grounded component data.';
      console.error('Component search grounding error:', err);
      res.status(500).json({ error: message });
    }
  });

  // ============================================================================
  // POST /api/ai-agent
  // Full-context agentic power electronics verification, Danger/Warning fix
  // planner, and interactive engineering Q&A powered by Gemini 4 Hydrogen.
  // ============================================================================
  app.post('/api/ai-agent', async (req, res) => {
    try {
      const { mode, userMessage, chatHistory, snapshot, isVerificationPass, appliedSummary } =
        req.body as {
          mode?: 'audit' | 'chat';
          userMessage?: string;
          chatHistory?: { role: 'user' | 'model'; text: string }[];
          snapshot?: Record<string, unknown>;
          isVerificationPass?: boolean;
          appliedSummary?: string[];
        };

      if (!snapshot || typeof snapshot !== 'object') {
        res.status(400).json({ error: 'Missing converter design snapshot.' });
        return;
      }

      const activeMode: 'audit' | 'chat' = mode === 'chat' ? 'chat' : 'audit';

      const systemInstruction = `You are a Principal Power Electronics Design Verification Agent embedded inside a live AC-DC PFC + Isolated DC-DC CAD workbench.
You receive a complete live engineering telemetry JSON snapshot containing:
- dcdc.state & dcdc.results (PSFB/LLC/DAB electrical, ZVS, iGSE/Dowell transformer, thermal Tj/Tcore, ringing peak, small-signal Bode f_c/PM/GM/Qp)
- acdc.state & acdc.results (Totem-Pole/Interleaved PFC electrical, hold-up, DC-link life, boost magnetics, EMI/Cy leakage, inner/outer loop PM)
- inductors[] & capacitors[] (every passive magnetic core, saturation utilization %, window fill %, hotspot C, capacitor MPN/matrix/derating/L10 life)
- activeAlerts[] (every Danger and Warning violation, metric, and pre-synthesized candidateFixes with exact alertFixId)
- catalogs (valid transformerCores, transformerMaterials, semiconductors, inductorCores, inductorMaterials, capacitors)

Strict Engineering Rules:
1. NEVER hallucinate part IDs, core IDs, or capacitor IDs. Only use exact IDs present in snapshot.catalogs or exact alertFixId values present in snapshot.activeAlerts[].candidateFixes[].
2. Prioritize Danger alerts first (severity: "danger"), then Warning alerts (severity: "warning").
3. When a suitable pre-synthesized candidateFix exists in activeAlerts[].candidateFixes[] that cleanly resolves the violation without regression, prefer referencing its exact alertFixId alongside matching targetKind and itemId.
4. When a Warning/Danger has no candidateFix or needs a coordinated multi-parameter adjustment (e.g. balancing Np_turns, priStrands, coreId, slopeFactor_mc, Cy_nF, Cdc_uF, nParallelSec), provide exact validated fields inside dcdcPatch / acdcPatch / inductorOverridesPatch / capacitorOverridesPatch.
5. Note coupled trade-offs explicitly in couplingNote (e.g., increasing Np lowers B_pk and P_core but increases window fill and P_cu; raising L_lk helps ZVS but increases D_loss).
6. In "audit" mode: synthesize a ranked, non-redundant fix plan for all active Danger and Warning issues (or confirm "verified-safe" if dangerCount === 0 and warningCount === 0).
7. In "chat" mode: answer the user's question thoroughly in replyMarkdown referencing exact live numbers from the snapshot, and ONLY include proposedFixes[] if your answer recommends concrete parameter/component adjustments.`;

      const historyBlock =
        Array.isArray(chatHistory) && chatHistory.length > 0
          ? `\nRECENT CONVERSATION:\n${chatHistory
              .slice(-8)
              .map((m) => `${m.role === 'user' ? 'ENGINEER' : 'AI_AGENT'}: ${m.text}`)
              .join('\n')}\n`
          : '';

      const verificationNote = isVerificationPass
        ? `\nPOST-APPLY VERIFICATION PASS: The user just applied these fixes: ${JSON.stringify(appliedSummary || [])}. Re-verify the updated snapshot to confirm whether all Danger and Warning alerts are resolved or if any secondary trade-off needs follow-up.\n`
        : '';

      const userPrompt =
        activeMode === 'audit'
          ? `Perform a full engineering verification audit on the active converter design snapshot below.${verificationNote}
LIVE DESIGN SNAPSHOT:
${JSON.stringify(snapshot)}

Return JSON strictly matching the responseSchema.`
          : `Answer the engineer's question below using exact numbers and parts from the live design snapshot.${historyBlock}
ENGINEER QUESTION:
${(userMessage || '').trim()}

LIVE DESIGN SNAPSHOT:
${JSON.stringify(snapshot)}

Return JSON strictly matching the responseSchema.`;

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: userPrompt,
        config: {
          systemInstruction,
          thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              overallVerdict: {
                type: Type.STRING,
                description: 'Must be one of: critical, warning, verified-safe',
              },
              headline: {
                type: Type.STRING,
                description: 'Concise 1-line engineering status headline.',
              },
              executiveSummary: {
                type: Type.STRING,
                description: '2-3 sentences explaining root causes, coupled physics, or verification status.',
              },
              replyMarkdown: {
                type: Type.STRING,
                description: 'Detailed engineering Q&A answer (used in chat mode, concise summary in audit mode).',
              },
              proposedFixes: {
                type: Type.ARRAY,
                description: 'Ordered list of concrete, non-redundant fixes (Danger first, then Warning). Empty if verified-safe or pure informational Q&A.',
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    alertId: {
                      type: Type.STRING,
                      description: 'Matching alert id from activeAlerts[], or custom id like opt-efficiency.',
                    },
                    severity: {
                      type: Type.STRING,
                      description: 'Must be one of: danger, warning, optimization',
                    },
                    domain: {
                      type: Type.STRING,
                      description: 'Must be one of: dcdc, acdc',
                    },
                    title: { type: Type.STRING },
                    rationale: { type: Type.STRING },
                    couplingNote: { type: Type.STRING },
                    patchSummary: { type: Type.STRING },
                    patch: {
                      type: Type.OBJECT,
                      properties: {
                        targetKind: {
                          type: Type.STRING,
                          description: 'Must be one of: dcdc, acdc, inductor, capacitor',
                        },
                        alertFixId: { type: Type.STRING },
                        itemId: { type: Type.STRING },
                        capacitorUnlockMatrix: { type: Type.BOOLEAN },
                        syncToCircuit: { type: Type.BOOLEAN },
                        dcdcPatch: {
                          type: Type.OBJECT,
                          properties: {
                            fsw_kHz: { type: Type.NUMBER },
                            turnsRatio_n: { type: Type.NUMBER },
                            Llk_uH: { type: Type.NUMBER },
                            Lm_uH: { type: Type.NUMBER },
                            Lo_uH: { type: Type.NUMBER },
                            Co_uF: { type: Type.NUMBER },
                            ESR_Co_mOhm: { type: Type.NUMBER },
                            deadTime_ns: { type: Type.NUMBER },
                            coreId: { type: Type.STRING },
                            materialId: { type: Type.STRING },
                            Np_turns: { type: Type.NUMBER },
                            Ns_turns: { type: Type.NUMBER },
                            litzStrandAWG: { type: Type.NUMBER },
                            priStrands: { type: Type.NUMBER },
                            secStrands: { type: Type.NUMBER },
                            interleaving: { type: Type.STRING },
                            insulationThickness_mm: { type: Type.NUMBER },
                            priDeviceId: { type: Type.STRING },
                            secDeviceId: { type: Type.STRING },
                            nParallelPri: { type: Type.NUMBER },
                            nParallelSec: { type: Type.NUMBER },
                            Rth_heatsink_CW: { type: Type.NUMBER },
                            Rth_TIM_CW: { type: Type.NUMBER },
                            fc_target_kHz: { type: Type.NUMBER },
                            pm_target_deg: { type: Type.NUMBER },
                            slopeFactor_mc: { type: Type.NUMBER },
                          },
                        },
                        acdcPatch: {
                          type: Type.OBJECT,
                          properties: {
                            fsw_kHz: { type: Type.NUMBER },
                            Lpfc_uH: { type: Type.NUMBER },
                            Cdc_uF: { type: Type.NUMBER },
                            ESR_Cdc_mOhm: { type: Type.NUMBER },
                            fastSwitchId: { type: Type.STRING },
                            fc_i_kHz: { type: Type.NUMBER },
                            pm_i_deg: { type: Type.NUMBER },
                            fc_v_Hz: { type: Type.NUMBER },
                            pm_v_deg: { type: Type.NUMBER },
                            Cy_nF: { type: Type.NUMBER },
                            prechargeR_Ohm: { type: Type.NUMBER },
                          },
                        },
                        inductorOverridesPatch: {
                          type: Type.OBJECT,
                          properties: {
                            coreId: { type: Type.STRING },
                            materialId: { type: Type.STRING },
                            turnsN: { type: Type.NUMBER },
                            airGap_mm: { type: Type.NUMBER },
                            parallelStrands: { type: Type.NUMBER },
                          },
                        },
                        capacitorOverridesPatch: {
                          type: Type.OBJECT,
                          properties: {
                            partId: { type: Type.STRING },
                            seriesCount: { type: Type.NUMBER },
                            parallelCount: { type: Type.NUMBER },
                          },
                        },
                      },
                      required: ['targetKind'],
                    },
                  },
                  required: [
                    'id',
                    'alertId',
                    'severity',
                    'domain',
                    'title',
                    'rationale',
                    'couplingNote',
                    'patchSummary',
                    'patch',
                  ],
                },
              },
            },
            required: ['overallVerdict', 'headline', 'executiveSummary', 'proposedFixes'],
          },
        },
      });

      const rawText = (response.text ?? '{}').trim();
      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(rawText);
      } catch {
        const cleaned = rawText.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
        parsed = JSON.parse(cleaned);
      }

      res.json({
        mode: activeMode,
        overallVerdict: parsed.overallVerdict || 'warning',
        headline: parsed.headline || 'Design Analysis Complete',
        executiveSummary: parsed.executiveSummary || '',
        replyMarkdown: parsed.replyMarkdown || parsed.executiveSummary || '',
        proposedFixes: Array.isArray(parsed.proposedFixes) ? parsed.proposedFixes : [],
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'AI Engineer service failed.';
      console.error('AI Agent error:', err);
      res.status(500).json({ error: message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`PowerStage CAD & Control Studio server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
