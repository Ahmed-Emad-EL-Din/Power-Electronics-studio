import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type AiProviderId = 'gemini' | 'openai' | 'anthropic' | 'openai-compatible';

interface ServerAiConfig {
  provider: AiProviderId;
  apiKey: string;
  model: string;
  baseUrl: string;
}

class AiHttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function normalizeServerAiConfig(raw: unknown): ServerAiConfig {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const provRaw = typeof obj.provider === 'string' ? obj.provider : 'gemini';
  const provider: AiProviderId =
    provRaw === 'openai' || provRaw === 'anthropic' || provRaw === 'openai-compatible'
      ? provRaw
      : 'gemini';
  const defaultModels: Record<AiProviderId, string> = {
    gemini: 'gemini-4-hydrogen',
    openai: 'gpt-4o',
    anthropic: 'claude-sonnet-4-20250514',
    'openai-compatible': 'deepseek-chat',
  };
  const defaultBaseUrls: Record<AiProviderId, string> = {
    gemini: '',
    openai: 'https://api.openai.com/v1',
    anthropic: 'https://api.anthropic.com/v1',
    'openai-compatible': 'https://api.deepseek.com/v1',
  };
  const apiKey = typeof obj.apiKey === 'string' ? obj.apiKey.trim() : '';
  const model =
    typeof obj.model === 'string' && obj.model.trim() ? obj.model.trim() : defaultModels[provider];
  const baseUrl =
    typeof obj.baseUrl === 'string' && obj.baseUrl.trim()
      ? obj.baseUrl.trim()
      : defaultBaseUrls[provider];
  return { provider, apiKey, model, baseUrl };
}

function extractJsonObject(rawText: string): Record<string, unknown> {
  const trimmed = rawText.trim();
  if (!trimmed) throw new Error('Model returned an empty response.');
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    const stripped = trimmed
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    try {
      return JSON.parse(stripped) as Record<string, unknown>;
    } catch {
      const start = stripped.indexOf('{');
      const end = stripped.lastIndexOf('}');
      if (start >= 0 && end > start) {
        return JSON.parse(stripped.slice(start, end + 1)) as Record<string, unknown>;
      }
      throw new Error('Model response was not valid JSON.');
    }
  }
}

async function callAiModelJson(params: {
  aiConfig: ServerAiConfig;
  defaultGeminiModel: string;
  systemInstruction: string;
  userPrompt: string;
  jsonSchemaHint: string;
  geminiResponseSchema: Record<string, unknown>;
  useGoogleSearch?: boolean;
  thinkingLevel?: ThinkingLevel;
}): Promise<{ data: Record<string, unknown>; sources: { uri: string; title: string }[] }> {
  const {
    aiConfig,
    defaultGeminiModel,
    systemInstruction,
    userPrompt,
    jsonSchemaHint,
    geminiResponseSchema,
    useGoogleSearch = false,
    thinkingLevel,
  } = params;

  if (aiConfig.provider === 'gemini') {
    const effectiveKey = aiConfig.apiKey || process.env.GEMINI_API_KEY || '';
    if (!effectiveKey) {
      throw new AiHttpError(
        400,
        'Gemini API key is missing. Enter your Gemini API key in AI Provider Settings or set GEMINI_API_KEY on the server.'
      );
    }
    const modelToUse = aiConfig.model || defaultGeminiModel;
    const client = new GoogleGenAI({
      apiKey: effectiveKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
    const response = await client.models.generateContent({
      model: modelToUse,
      contents: userPrompt,
      config: {
        systemInstruction,
        ...(thinkingLevel ? { thinkingConfig: { thinkingLevel } } : {}),
        ...(useGoogleSearch ? { tools: [{ googleSearch: {} }] } : {}),
        responseMimeType: 'application/json',
        responseSchema: geminiResponseSchema,
      },
    });
    const rawText = (response.text ?? '{}').trim();
    const data = extractJsonObject(rawText);
    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const sources = groundingChunks
      .map((chunk) => {
        const web = (chunk as { web?: { uri?: string; title?: string } }).web;
        if (web && web.uri) {
          return { uri: web.uri, title: web.title || web.uri };
        }
        return null;
      })
      .filter((s): s is { uri: string; title: string } => s !== null);

    return { data, sources };
  }

  const strictSystem = `${systemInstruction}\n\nOUTPUT CONTRACT:\nRespond with a SINGLE valid JSON object only (no markdown code fences, no extra prose outside JSON) matching:\n${jsonSchemaHint}`;

  if (aiConfig.provider === 'anthropic') {
    if (!aiConfig.apiKey) {
      throw new AiHttpError(
        400,
        'Anthropic Claude API key is required. Configure your sk-ant-... key in AI Provider Settings.'
      );
    }
    const base = (aiConfig.baseUrl || 'https://api.anthropic.com/v1').replace(/\/+$/, '');
    const endpoint = base.endsWith('/messages') ? base : `${base}/messages`;
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'x-api-key': aiConfig.apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: aiConfig.model,
        max_tokens: 4096,
        temperature: 0.2,
        system: strictSystem,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });
    const bodyText = await resp.text();
    let bodyJson: Record<string, unknown> = {};
    try {
      bodyJson = JSON.parse(bodyText) as Record<string, unknown>;
    } catch {
      // handled below
    }
    if (!resp.ok) {
      const errObj = bodyJson.error as { message?: string } | undefined;
      const errMsg = errObj?.message || bodyText || resp.statusText;
      throw new AiHttpError(resp.status >= 400 && resp.status < 500 ? resp.status : 502, `Anthropic error (${resp.status}): ${errMsg}`);
    }
    const contentBlocks = Array.isArray(bodyJson.content)
      ? (bodyJson.content as { type?: string; text?: string }[])
      : [];
    const combinedText = contentBlocks
      .filter((b) => b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text as string)
      .join('\n');
    return { data: extractJsonObject(combinedText), sources: [] };
  }

  // OpenAI & OpenAI-Compatible
  if (aiConfig.provider === 'openai' && !aiConfig.apiKey) {
    throw new AiHttpError(
      400,
      'OpenAI API key is required. Configure your sk-... key in AI Provider Settings.'
    );
  }
  const rawBase = aiConfig.baseUrl || 'https://api.openai.com/v1';
  if (!/^https?:\/\//i.test(rawBase)) {
    throw new AiHttpError(
      400,
      'OpenAI-Compatible Base URL must start with http:// or https://.'
    );
  }
  const cleanBase = rawBase.replace(/\/+$/, '');
  const endpoint = cleanBase.endsWith('/chat/completions')
    ? cleanBase
    : `${cleanBase}/chat/completions`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (aiConfig.apiKey) {
    headers.Authorization = `Bearer ${aiConfig.apiKey}`;
  }

  const sendOpenAiRequest = async (useResponseFormat: boolean) => {
    const payload: Record<string, unknown> = {
      model: aiConfig.model,
      messages: [
        { role: 'system', content: strictSystem },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,
    };
    if (useResponseFormat) {
      payload.response_format = { type: 'json_object' };
    }
    return fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
  };

  let resp = await sendOpenAiRequest(true);
  let bodyText = await resp.text();
  if (!resp.ok && aiConfig.provider === 'openai-compatible' && resp.status === 400 && /response_format|json_object/i.test(bodyText)) {
    resp = await sendOpenAiRequest(false);
    bodyText = await resp.text();
  }

  let bodyJson: Record<string, unknown> = {};
  try {
    bodyJson = JSON.parse(bodyText) as Record<string, unknown>;
  } catch {
    // handled below
  }

  if (!resp.ok) {
    const errObj = bodyJson.error as { message?: string } | undefined;
    const errMsg = errObj?.message || (typeof bodyJson.message === 'string' ? bodyJson.message : '') || bodyText || resp.statusText;
    const label = aiConfig.provider === 'openai' ? 'OpenAI' : 'OpenAI-Compatible';
    throw new AiHttpError(resp.status >= 400 && resp.status < 500 ? resp.status : 502, `${label} error (${resp.status}): ${errMsg}`);
  }

  const choices = Array.isArray(bodyJson.choices)
    ? (bodyJson.choices as { message?: { content?: string | { type?: string; text?: string }[] } }[])
    : [];
  const rawContent = choices[0]?.message?.content;
  const textContent =
    typeof rawContent === 'string'
      ? rawContent
      : Array.isArray(rawContent)
      ? rawContent.map((c) => c.text || '').join('\n')
      : '';
  return { data: extractJsonObject(textContent), sources: [] };
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '2mb' }));

  // ============================================================================
  // POST /api/component-search
  // Pulls real-world MOSFET, SiC, GaN, or Schottky diode datasheet & LCSC specs
  // using Gemini (with Google Search grounding), OpenAI, Claude, or Compatible LLM.
  // ============================================================================
  app.post('/api/component-search', async (req, res) => {
    try {
      const { query, operatingContext, aiConfig: rawAiConfig } = req.body as {
        query?: string;
        operatingContext?: {
          domain?: string;
          topology?: string;
          Vin_V?: number;
          Vout_V?: number;
          Pout_W?: number;
          fsw_kHz?: number;
        };
        aiConfig?: unknown;
      };

      if (!query || typeof query !== 'string' || !query.trim()) {
        res.status(400).json({ error: 'Please provide a part number or component search query.' });
        return;
      }

      const aiConfig = normalizeServerAiConfig(rawAiConfig);

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

      const geminiResponseSchema = {
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
      };

      const { data: parsed, sources } = await callAiModelJson({
        aiConfig: {
          ...aiConfig,
          // Default to flash model for component lookup when using Gemini default model
          model:
            aiConfig.provider === 'gemini' && aiConfig.model === 'gemini-4-hydrogen'
              ? 'gemini-3.8-flash'
              : aiConfig.model,
        },
        defaultGeminiModel: 'gemini-3.8-flash',
        systemInstruction:
          'You are a senior power electronics component engineer knowledgeable in LCSC (lcsc.com), JLCPCB Parts Library, DigiKey, Mouser, and OEM semiconductor datasheets. Always return accurate, real-world datasheet numbers and LCSC C-numbers in the requested JSON schema.',
        userPrompt: prompt,
        jsonSchemaHint:
          '{ "searchSummary": string, "components": [{ "id": string, "name": string, "manufacturer": string, "packageType": string, "lcscPartNumber": string, "jlcpcbClass": "Basic Part"|"Extended Part"|"Through-Hole", "lcscStock": number, "tech": "SiC MOSFET"|"GaN HEMT"|"SJ Si MOSFET"|"OptiMOS SR"|"SiC Schottky", "role": "primary"|"secondary"|"both", "Vds_max_V": number, "Id_max_A": number, "Rds_on_25C_mOhm": number, "alpha_R_per_C": number, "Coss_er_pF": number, "Coss_tr_pF": number, "Qg_nC": number, "Qgd_nC": number, "Rg_int_Ohm": number, "Qrr_nC": number, "Vsd_V": number, "tr_ns": number, "tf_ns": number, "Rth_JC_CW": number, "kelvinSource": boolean, "unitPrice_USD": number, "distributorSku": string, "datasheetSummary": string }] }',
        geminiResponseSchema,
        useGoogleSearch: true,
      });

      const components = Array.isArray(parsed.components) ? parsed.components : [];
      res.json({
        searchSummary:
          (typeof parsed.searchSummary === 'string' && parsed.searchSummary) ||
          `Found ${components.length} components for "${query}".`,
        components,
        sources,
      });
    } catch (err: unknown) {
      const status = err instanceof AiHttpError ? err.status : 500;
      const message = err instanceof Error ? err.message : 'Failed to fetch grounded component data.';
      console.error('Component search error:', err);
      res.status(status).json({ error: message });
    }
  });

  // ============================================================================
  // POST /api/ai-agent
  // Full-context agentic power electronics verification, Danger/Warning fix
  // planner, and interactive engineering Q&A across Gemini / OpenAI / Claude / Compatible.
  // ============================================================================
  app.post('/api/ai-agent', async (req, res) => {
    try {
      const {
        mode,
        userMessage,
        chatHistory,
        snapshot,
        isVerificationPass,
        appliedSummary,
        aiConfig: rawAiConfig,
      } = req.body as {
        mode?: 'audit' | 'chat';
        userMessage?: string;
        chatHistory?: { role: 'user' | 'model'; text: string }[];
        snapshot?: Record<string, unknown>;
        isVerificationPass?: boolean;
        appliedSummary?: string[];
        aiConfig?: unknown;
      };

      if (!snapshot || typeof snapshot !== 'object') {
        res.status(400).json({ error: 'Missing converter design snapshot.' });
        return;
      }

      const aiConfig = normalizeServerAiConfig(rawAiConfig);
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

      const geminiResponseSchema = {
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
      };

      const { data: parsed } = await callAiModelJson({
        aiConfig,
        defaultGeminiModel: 'gemini-4-hydrogen',
        systemInstruction,
        userPrompt,
        jsonSchemaHint:
          '{ "overallVerdict": "critical"|"warning"|"verified-safe", "headline": string, "executiveSummary": string, "replyMarkdown": string, "proposedFixes": [{ "id": string, "alertId": string, "severity": "danger"|"warning"|"optimization", "domain": "dcdc"|"acdc", "title": string, "rationale": string, "couplingNote": string, "patchSummary": string, "patch": { "targetKind": "dcdc"|"acdc"|"inductor"|"capacitor", "alertFixId"?: string, "itemId"?: string, "capacitorUnlockMatrix"?: boolean, "syncToCircuit"?: boolean, "dcdcPatch"?: object, "acdcPatch"?: object, "inductorOverridesPatch"?: object, "capacitorOverridesPatch"?: object } }] }',
        geminiResponseSchema,
        thinkingLevel: ThinkingLevel.MEDIUM,
      });

      res.json({
        mode: activeMode,
        overallVerdict: parsed.overallVerdict || 'warning',
        headline: parsed.headline || 'Design Analysis Complete',
        executiveSummary: parsed.executiveSummary || '',
        replyMarkdown: parsed.replyMarkdown || parsed.executiveSummary || '',
        proposedFixes: Array.isArray(parsed.proposedFixes) ? parsed.proposedFixes : [],
      });
    } catch (err: unknown) {
      const status = err instanceof AiHttpError ? err.status : 500;
      const message = err instanceof Error ? err.message : 'AI Engineer service failed.';
      console.error('AI Agent error:', err);
      res.status(status).json({ error: message });
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
