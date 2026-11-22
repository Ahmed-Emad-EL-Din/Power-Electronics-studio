import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Search, X } from 'lucide-react';

export interface CommandPaletteAction {
  id: string;
  label: string;
  category: string;
  keywords?: string;
  hint?: string;
  run: () => void;
}

interface CommandPaletteModalProps {
  isOpen: boolean;
  onClose: () => void;
  actions: CommandPaletteAction[];
}

export const CommandPaletteModal: React.FC<CommandPaletteModalProps> = ({
  isOpen,
  onClose,
  actions,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setQuery('');
    setSelectedIdx(0);
    const t = setTimeout(() => inputRef.current?.focus(), 20);
    return () => clearTimeout(t);
  }, [isOpen]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return actions;
    return actions.filter((a) => {
      const hay = `${a.category} ${a.label} ${a.keywords || ''} ${a.hint || ''}`.toLowerCase();
      return q.split(/\s+/).every((tok) => hay.includes(tok));
    });
  }, [actions, query]);

  useEffect(() => {
    setSelectedIdx(0);
  }, [query]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIdx((i) => (filtered.length > 0 ? (i + 1) % filtered.length : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIdx((i) =>
          filtered.length > 0 ? (i - 1 + filtered.length) % filtered.length : 0
        );
      } else if (e.key === 'Enter' && filtered[selectedIdx]) {
        e.preventDefault();
        filtered[selectedIdx].run();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, filtered, selectedIdx, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-start justify-center pt-[12vh] p-4 bg-[#07080d]/65 backdrop-blur-[2px] overscroll-contain"
      role="dialog"
      aria-modal="true"
      aria-label="Quick command palette"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-xl shadow-2xl bg-white dark:bg-[#11141c] border border-slate-200 dark:border-white/[0.12] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-3.5 py-2.5 border-b border-slate-200 dark:border-white/[0.08] flex items-center gap-2.5 bg-[#f5f7fa] dark:bg-[#0b0d14] focus-within:ring-2 focus-within:ring-inset focus-within:ring-cyan-500/60">
          <Search className="w-4 h-4 text-cyan-600 dark:text-cyan-400 shrink-0" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            name="command-palette-query"
            aria-label="Search views, presets, optimizers, or exports"
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Jump to view, switch preset, optimize, or export…"
            className="flex-1 bg-transparent text-xs sm:text-sm text-slate-900 dark:text-[#eef0f5] placeholder:text-slate-400 focus:outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close command palette"
            className="h-6 w-6 rounded border border-slate-200 dark:border-white/[0.1] text-slate-400 hover:text-slate-900 dark:hover:text-white inline-flex items-center justify-center cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="max-h-[55vh] overflow-y-auto overscroll-contain divide-y divide-slate-100 dark:divide-white/[0.05]">
          {filtered.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500 dark:text-[#7a8296]">
              No matching views or actions for &quot;{query}&quot;.
            </div>
          ) : (
            filtered.map((item, idx) => {
              const active = idx === selectedIdx;
              return (
                <button
                  key={item.id}
                  type="button"
                  onMouseEnter={() => setSelectedIdx(idx)}
                  onClick={() => {
                    item.run();
                    onClose();
                  }}
                  className={`w-full px-3.5 py-2 text-left flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                    active
                      ? 'bg-cyan-500/12 text-cyan-800 dark:text-cyan-200'
                      : 'hover:bg-slate-50 dark:hover:bg-white/[0.03] text-slate-800 dark:text-[#eef0f5]'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-100 dark:bg-[#1a1e28] text-slate-600 dark:text-[#a3a9b8] border border-slate-200 dark:border-white/[0.08] shrink-0">
                      {item.category}
                    </span>
                    <span className="text-xs font-medium truncate">{item.label}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {item.hint && (
                      <span className="text-[11px] font-mono text-slate-400 dark:text-[#7a8296]">
                        {item.hint}
                      </span>
                    )}
                    <ArrowRight
                      className={`w-3.5 h-3.5 ${
                        active ? 'text-cyan-600 dark:text-cyan-400' : 'text-slate-300 dark:text-slate-700'
                      }`}
                    />
                  </div>
                </button>
              );
            })
          )}
        </div>

        <div className="px-3.5 py-1.5 border-t border-slate-200 dark:border-white/[0.08] bg-[#f5f7fa] dark:bg-[#0b0d14] flex items-center justify-between text-[10px] font-mono text-slate-500 dark:text-[#7a8296]">
          <span>↑↓ Navigate · Enter Execute · Esc Close</span>
          <span>Ctrl+K / Cmd+K</span>
        </div>
      </div>
    </div>
  );
};
