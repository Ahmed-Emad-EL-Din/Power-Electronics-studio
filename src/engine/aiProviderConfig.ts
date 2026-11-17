export type AiProviderId = 'gemini' | 'openai' | 'anthropic' | 'openai-compatible';

export interface AiProviderConfig {
  provider: AiProviderId;
  apiKey: string;
  model: string;
  baseUrl: string;
}

export interface AiProviderMeta {
  id: AiProviderId;
  label: string;
  shortLabel: string;
  defaultModel: string;
  defaultBaseUrl: string;
  keyPlaceholder: string;
  requiresKey: boolean;
  requiresBaseUrl: boolean;
  supportsWebSearch: boolean;
  hint: string;
}

export const AI_PROVIDER_META: Record<AiProviderId, AiProviderMeta> = {
  gemini: {
    id: 'gemini',
    label: 'Google Gemini',
    shortLabel: 'Gemini',
    defaultModel: 'gemini-4-hydrogen',
    defaultBaseUrl: '',
    keyPlaceholder: 'Optional (uses server env key if blank) or AIza...',
    requiresKey: false,
    requiresBaseUrl: false,
    supportsWebSearch: true,
    hint: 'Leave API key blank to use the workspace server key, or enter your own Gemini API key.',
  },
  openai: {
    id: 'openai',
    label: 'OpenAI',
    shortLabel: 'OpenAI',
    defaultModel: 'gpt-4o',
    defaultBaseUrl: 'https://api.openai.com/v1',
    keyPlaceholder: 'sk-...',
    requiresKey: true,
    requiresBaseUrl: false,
    supportsWebSearch: false,
    hint: 'Uses OpenAI Chat Completions JSON mode (e.g., gpt-4o, gpt-4.1, o3-mini).',
  },
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic Claude',
    shortLabel: 'Claude',
    defaultModel: 'claude-sonnet-4-20250514',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    keyPlaceholder: 'sk-ant-...',
    requiresKey: true,
    requiresBaseUrl: false,
    supportsWebSearch: false,
    hint: 'Uses Anthropic Messages API (e.g., claude-sonnet-4-20250514, claude-3-7-sonnet-latest).',
  },
  'openai-compatible': {
    id: 'openai-compatible',
    label: 'OpenAI-Compatible',
    shortLabel: 'Compatible',
    defaultModel: 'deepseek-chat',
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    keyPlaceholder: 'API key (optional for local Ollama / LM Studio)',
    requiresKey: false,
    requiresBaseUrl: true,
    supportsWebSearch: false,
    hint: 'Works with OpenRouter, DeepSeek, Groq, Together, vLLM, LM Studio, or Ollama (/v1).',
  },
};

export const AI_PROVIDER_LIST: AiProviderMeta[] = [
  AI_PROVIDER_META.gemini,
  AI_PROVIDER_META.openai,
  AI_PROVIDER_META.anthropic,
  AI_PROVIDER_META['openai-compatible'],
];

const STORAGE_KEY = 'voltcraft_ai_provider_config_v1';

export function getDefaultAiProviderConfig(provider: AiProviderId = 'gemini'): AiProviderConfig {
  const meta = AI_PROVIDER_META[provider] || AI_PROVIDER_META.gemini;
  return {
    provider: meta.id,
    apiKey: '',
    model: meta.defaultModel,
    baseUrl: meta.defaultBaseUrl,
  };
}

export function normalizeAiProviderConfig(raw: Partial<AiProviderConfig> | null | undefined): AiProviderConfig {
  const provider: AiProviderId =
    raw?.provider === 'openai' ||
    raw?.provider === 'anthropic' ||
    raw?.provider === 'openai-compatible'
      ? raw.provider
      : 'gemini';
  const meta = AI_PROVIDER_META[provider];
  return {
    provider,
    apiKey: typeof raw?.apiKey === 'string' ? raw.apiKey.trim() : '',
    model:
      typeof raw?.model === 'string' && raw.model.trim()
        ? raw.model.trim()
        : meta.defaultModel,
    baseUrl:
      typeof raw?.baseUrl === 'string' && raw.baseUrl.trim()
        ? raw.baseUrl.trim()
        : meta.defaultBaseUrl,
  };
}

export function loadAiProviderConfig(): AiProviderConfig {
  try {
    if (typeof localStorage === 'undefined') return getDefaultAiProviderConfig();
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return getDefaultAiProviderConfig();
    const parsed = JSON.parse(saved) as Partial<AiProviderConfig>;
    return normalizeAiProviderConfig(parsed);
  } catch {
    return getDefaultAiProviderConfig();
  }
}

export function saveAiProviderConfig(cfg: AiProviderConfig): AiProviderConfig {
  const normalized = normalizeAiProviderConfig(cfg);
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    }
  } catch {
    // ignore storage quota errors
  }
  return normalized;
}

export function clearAiProviderConfig(): AiProviderConfig {
  const def = getDefaultAiProviderConfig('gemini');
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // ignore
  }
  return def;
}

export function validateAiProviderConfig(cfg: AiProviderConfig): string | null {
  const norm = normalizeAiProviderConfig(cfg);
  if (norm.provider === 'openai' && !norm.apiKey) {
    return 'OpenAI requires an API key (sk-...). Configure it in AI Provider Settings.';
  }
  if (norm.provider === 'anthropic' && !norm.apiKey) {
    return 'Anthropic Claude requires an API key (sk-ant-...). Configure it in AI Provider Settings.';
  }
  if (norm.provider === 'openai-compatible') {
    if (!norm.baseUrl) {
      return 'OpenAI-Compatible provider requires a Base URL (e.g. https://openrouter.ai/api/v1 or http://localhost:11434/v1).';
    }
    if (!norm.model) {
      return 'OpenAI-Compatible provider requires a Model ID.';
    }
  }
  return null;
}

export function toServerAiConfig(cfg: AiProviderConfig): AiProviderConfig {
  return normalizeAiProviderConfig(cfg);
}
