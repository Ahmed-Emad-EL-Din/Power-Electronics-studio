import React from 'react';
import { Lock, Unlock, SlidersHorizontal, X } from 'lucide-react';
import { AutoOptChange } from '../engine/autoOptimizer';

interface LockToggleButtonProps {
  locked: boolean;
  recentlyAutoUpdated?: boolean;
  onToggle: () => void;
  label?: string;
  compact?: boolean;
}

export const LockToggleButton: React.FC<LockToggleButtonProps> = ({
  locked,
  recentlyAutoUpdated = false,
  onToggle,
  label = 'parameter',
  compact = false,
}) => {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={
        locked
          ? `Locked (${label}): stays fixed while unlocked parameters auto-adjust`
          : `Unlocked (${label}): auto-calculated for optimal values when circuit changes`
      }
      aria-label={locked ? `Unlock ${label}` : `Lock ${label}`}
      className={`inline-flex items-center gap-0.5 ${
        compact ? 'px-1 py-0.5 text-[9px]' : 'px-1.5 py-0.5 text-[10px]'
      } rounded border font-medium transition-colors cursor-pointer shrink-0 ${
        locked
          ? 'bg-amber-500/10 border-amber-500/45 text-amber-700 dark:text-amber-300'
          : recentlyAutoUpdated
          ? 'bg-emerald-500/10 border-emerald-500/45 text-emerald-700 dark:text-emerald-300'
          : 'bg-slate-100 dark:bg-[#151C2B] border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-cyan-500/60 hover:text-cyan-600 dark:hover:text-cyan-300'
      }`}
    >
      {locked ? (
        <>
          <Lock className="w-2.5 h-2.5" />
          {!compact && <span>Lock</span>}
        </>
      ) : (
        <>
          <Unlock className="w-2.5 h-2.5" />
          {!compact && <span>{recentlyAutoUpdated ? 'Auto' : 'Free'}</span>}
        </>
      )}
    </button>
  );
};

interface AutoSolverBannerProps<K extends string> {
  autoOptimize: boolean;
  onToggleAutoOptimize: () => void;
  onOptimizeNow: () => void;
  onLockSpecsOnly: () => void;
  onLockAll: () => void;
  onUnlockAll: () => void;
  lockedCount: number;
  totalCount: number;
  recentChanges: AutoOptChange<K>[];
  onClearChanges: () => void;
}

export function AutoSolverBanner<K extends string>({
  autoOptimize,
  onToggleAutoOptimize,
  onOptimizeNow,
  onLockSpecsOnly,
  onLockAll,
  onUnlockAll,
  lockedCount,
  totalCount,
  recentChanges,
  onClearChanges,
}: AutoSolverBannerProps<K>) {
  const unlockedCount = Math.max(0, totalCount - lockedCount);

  return (
    <div className="bg-slate-50 dark:bg-[#090C12] border border-slate-200 dark:border-slate-800 rounded-md p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-slate-800 dark:text-slate-100">
          Constraint Solver
        </span>
        <button
          type="button"
          onClick={onToggleAutoOptimize}
          className={`px-2 py-0.5 rounded border text-[11px] font-medium transition-colors cursor-pointer shrink-0 whitespace-nowrap ${
            autoOptimize
              ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-700 dark:text-emerald-300'
              : 'bg-slate-200 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400'
          }`}
        >
          Auto-solve: {autoOptimize ? 'On' : 'Off'}
        </button>
      </div>

      <p className="text-[11px] leading-snug text-slate-600 dark:text-slate-400">
        <span className="font-mono tabular-nums font-semibold text-amber-700 dark:text-amber-400">
          {lockedCount}
        </span>{' '}
        locked ·{' '}
        <span className="font-mono tabular-nums font-semibold text-emerald-700 dark:text-emerald-400">
          {unlockedCount}
        </span>{' '}
        unlocked auto-calculate on change.
      </p>

      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={onOptimizeNow}
          disabled={unlockedCount === 0}
          title="Recalculate all unlocked parameters immediately for optimal operation"
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap"
        >
          <SlidersHorizontal className="w-3 h-3" />
          Optimize
        </button>
        <button
          type="button"
          onClick={onLockSpecsOnly}
          className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#131A26] hover:border-slate-400 dark:hover:border-slate-600 text-[11px] font-medium text-slate-700 dark:text-slate-300 transition-colors cursor-pointer whitespace-nowrap"
          title="Lock top-level specs and unlock design parameters"
        >
          Specs Only
        </button>
        <button
          type="button"
          onClick={onUnlockAll}
          className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#131A26] hover:border-slate-400 dark:hover:border-slate-600 text-[11px] font-medium text-slate-700 dark:text-slate-300 transition-colors cursor-pointer whitespace-nowrap"
        >
          Unlock All
        </button>
        <button
          type="button"
          onClick={onLockAll}
          className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#131A26] hover:border-slate-400 dark:hover:border-slate-600 text-[11px] font-medium text-slate-700 dark:text-slate-300 transition-colors cursor-pointer whitespace-nowrap"
        >
          Lock All
        </button>
      </div>

      {recentChanges.length > 0 && (
        <div className="border-t border-slate-200 dark:border-slate-800 pt-2 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
              Updated parameters ({recentChanges.length})
            </span>
            <button
              type="button"
              onClick={onClearChanges}
              aria-label="Dismiss updated parameters"
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 cursor-pointer"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
          <div className="max-h-28 overflow-y-auto divide-y divide-slate-200/70 dark:divide-slate-800 pr-0.5">
            {recentChanges.map((ch) => (
              <div key={ch.key} className="py-1 text-[11px]">
                <div className="flex items-center justify-between gap-2 text-slate-800 dark:text-slate-200">
                  <span className="font-medium truncate">{ch.label}</span>
                  <span className="font-mono tabular-nums shrink-0">
                    <span className="text-slate-400 line-through mr-1.5">{ch.oldVal}</span>
                    <span className="text-emerald-700 dark:text-emerald-300 font-semibold">
                      {ch.newVal}
                      {ch.unit}
                    </span>
                  </span>
                </div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                  {ch.reason}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
