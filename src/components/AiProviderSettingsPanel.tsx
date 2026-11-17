import React, { useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  EyeOff,
  Globe,
  KeyRound,
  RotateCcw,
  X,
} from 'lucide-react';
import {
  AI_PROVIDER_LIST,
  AI_PROVIDER_META,
  AiProviderConfig,
  AiProviderId,
  clearAiProviderConfig,
  getDefaultAiProviderConfig,
  validateAiProviderConfig,
} from '../engine/aiProviderConfig';

interface AiProviderSettingsPanelProps {
  aiConfig: AiProviderConfig;
  onChangeAiConfig: (next: AiProviderConfig) => void;
  compact?: boolean;
  onClose?: () => void;
}

const MODEL_SUGGESTIONS: Record<AiProviderId, string[]> = {
  gemini: ['gemini-4-hydrogen', 'gemini-3.8-flash'],
  openai: ['gpt-4o', 'gpt-4.1', 'o3-mini'],
  anthropic: ['claude-sonnet-4-20250514', 'claude-3-7-sonnet-latest'],
  'openai-compatible': ['deepseek-chat', 'deepseek-reasoner', 'llama-3.3-70b-versatile'],
};

const COMPATIBLE_ENDPOINT_PRESETS: { label: string; baseUrl: string; model: string }[] = [
  { label: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  { label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', model: 'anthropic/claude-sonnet-4' },
  { label: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile' },
  { label: 'Ollama (Local)', baseUrl: 'http://localhost:11434/v1', model: 'qwen2.5:14b' },
];

export const AiProviderSettingsPanel: React.FC<AiProviderSettingsPanelProps> = ({
  aiConfig,
  onChangeAiConfig,
  compact = false,
  onClose,
}) => {
  const [showKey, setShowKey] = useState(false);
  const perProviderCacheRef = useRef<Partial<Record<AiProviderId, AiProviderConfig>>>({
    [aiConfig.provider]: aiConfig,
  });

  // Keep cache current for active provider
  perProviderCacheRef.current[aiConfig.provider] = aiConfig;

  const meta = AI_PROVIDER_META[aiConfig.provider];
  const validationError = validateAiProviderConfig(aiConfig);

  const handleSelectProvider = (nextProvider: AiProviderId) => {
    if (nextProvider === aiConfig.provider) return;
    perProviderCacheRef.current[aiConfig.provider] = aiConfig;
    const cached = perProviderCacheRef.current[nextProvider];
    onChangeAiConfig(cached ? { ...cached } : getDefaultAiProviderConfig(nextProvider));
  };

  const handleFieldChange = (patch: Partial<AiProviderConfig>) => {
    onChangeAiConfig({
      ...aiConfig,
      ...patch,
    });
  };

  const handleReset = () => {
    perProviderCacheRef.current = {};
    onChangeAiConfig(clearAiProviderConfig());
  };

  return (
    <div
      data-testid="ai-provider-settings-panel"
      className={`${
        compact ? 'p-3' : 'p-3.5'
      } rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0F17] space-y-3 text-xs`}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <KeyRound className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400 shrink-0" />
          <span className="font-semibold text-slate-900 dark:text-slate-100 truncate">
            AI Provider &amp; API Key Settings
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={handleReset}
            className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#131A26] text-[10px] font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white inline-flex items-center gap-1 cursor-pointer transition-colors"
            title="Reset AI provider settings to default Gemini workspace mode"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset</span>
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close AI provider settings"
              className="p-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#131A26] text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* 4 Provider Selector Buttons */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5" role="group" aria-label="Select AI Provider">
        {AI_PROVIDER_LIST.map((p) => {
          const active = aiConfig.provider === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => handleSelectProvider(p.id)}
              aria-pressed={active}
              className={`px-2 py-1.5 rounded border text-[11px] font-medium transition-colors cursor-pointer text-center truncate ${
                active
                  ? 'bg-cyan-600 border-cyan-500 text-white font-semibold'
                  : 'bg-white dark:bg-[#131A26] border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-cyan-500/60'
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {/* API Key Input */}
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <label
            htmlFor="ai-provider-api-key"
            className="text-[11px] font-medium text-slate-700 dark:text-slate-300"
          >
            {meta.label} API Key{' '}
            <span className="text-[10px] font-normal text-slate-500 dark:text-slate-400">
              {meta.requiresKey ? '(Required)' : '(Optional)'}
            </span>
          </label>
          {aiConfig.apiKey && (
            <button
              type="button"
              onClick={() => handleFieldChange({ apiKey: '' })}
              className="text-[10px] text-rose-600 dark:text-rose-400 hover:underline cursor-pointer"
            >
              Clear Key
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <input
            id="ai-provider-api-key"
            type={showKey ? 'text' : 'password'}
            value={aiConfig.apiKey}
            onChange={(e) => handleFieldChange({ apiKey: e.target.value })}
            placeholder={meta.keyPlaceholder}
            autoComplete="off"
            spellCheck={false}
            className="flex-1 min-w-0 px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0E131D] text-xs font-mono text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-cyan-500"
          />
          <button
            type="button"
            onClick={() => setShowKey((s) => !s)}
            aria-label="Toggle API key visibility"
            title={showKey ? 'Hide API key' : 'Show API key'}
            className="h-8 w-8 shrink-0 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#131A26] text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white inline-flex items-center justify-center cursor-pointer transition-colors"
          >
            {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Model ID Input + Quick Presets */}
      <div className="space-y-1">
        <label
          htmlFor="ai-provider-model"
          className="block text-[11px] font-medium text-slate-700 dark:text-slate-300"
        >
          Model ID
        </label>
        <input
          id="ai-provider-model"
          type="text"
          value={aiConfig.model}
          onChange={(e) => handleFieldChange({ model: e.target.value })}
          placeholder={meta.defaultModel}
          spellCheck={false}
          className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0E131D] text-xs font-mono text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-cyan-500"
        />
        <div className="flex flex-wrap gap-1 pt-0.5">
          {MODEL_SUGGESTIONS[aiConfig.provider].map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => handleFieldChange({ model: m })}
              className={`px-1.5 py-0.5 rounded border text-[10px] font-mono cursor-pointer transition-colors ${
                aiConfig.model === m
                  ? 'bg-cyan-600/15 border-cyan-500/60 text-cyan-700 dark:text-cyan-300 font-semibold'
                  : 'bg-white dark:bg-[#131A26] border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-400'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Base URL for OpenAI-Compatible Endpoints */}
      {aiConfig.provider === 'openai-compatible' && (
        <div className="space-y-1">
          <label
            htmlFor="ai-provider-base-url"
            className="flex items-center gap-1 text-[11px] font-medium text-slate-700 dark:text-slate-300"
          >
            <Globe className="w-3 h-3 text-cyan-600 dark:text-cyan-400" />
            <span>OpenAI-Compatible Base URL</span>
          </label>
          <input
            id="ai-provider-base-url"
            type="url"
            value={aiConfig.baseUrl}
            onChange={(e) => handleFieldChange({ baseUrl: e.target.value })}
            placeholder={meta.defaultBaseUrl}
            spellCheck={false}
            className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0E131D] text-xs font-mono text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-cyan-500"
          />
          <div className="flex flex-wrap gap-1 pt-0.5">
            {COMPATIBLE_ENDPOINT_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() =>
                  handleFieldChange({
                    baseUrl: preset.baseUrl,
                    model: preset.model,
                  })
                }
                className="px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#131A26] text-[10px] font-mono text-slate-600 dark:text-slate-300 hover:border-cyan-500/60 cursor-pointer"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Status / Validation / Grounding / Privacy Info */}
      {validationError ? (
        <div className="p-2 rounded border border-amber-400/60 bg-amber-50 dark:bg-amber-950/30 text-[11px] text-amber-800 dark:text-amber-300 flex items-start gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{validationError}</span>
        </div>
      ) : (
        <div className="p-2 rounded border border-emerald-500/35 bg-emerald-50/70 dark:bg-emerald-950/20 text-[11px] text-emerald-800 dark:text-emerald-300 flex items-start gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>
            Ready: <strong>{meta.label}</strong> ({aiConfig.model})
            {aiConfig.apiKey
              ? ' using your saved browser API key.'
              : aiConfig.provider === 'gemini'
              ? ' using workspace server key fallback.'
              : ' (no key sent).'}
          </span>
        </div>
      )}

      {!meta.supportsWebSearch && (
        <div className="text-[10px] text-amber-700 dark:text-amber-300/90 leading-snug">
          Note: Live Component Search uses {meta.shortLabel} datasheet knowledge without live Google Web Search grounding.
        </div>
      )}

      <div className="text-[10px] text-slate-500 dark:text-slate-400 leading-snug">
        {meta.hint} API keys are stored only in your browser localStorage and forwarded per-request to your selected provider via the local server proxy.
      </div>
    </div>
  );
};
