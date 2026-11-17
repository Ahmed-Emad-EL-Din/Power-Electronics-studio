import React from 'react';
import { SaturationCheckResult } from '../engine/dcdcEngine';
import { AlertTriangle, ShieldAlert, ShieldCheck, Check, Flame } from 'lucide-react';

interface SaturationCheckAlertProps {
  check: SaturationCheckResult;
  coreName: string;
  materialName: string;
  currentNp: number;
  onApplyTurns?: (np: number) => void;
  onApplyCore?: (coreId: string) => void;
  onApplyMaterial?: (materialId: string) => void;
  compact?: boolean;
}

export const SaturationCheckAlert: React.FC<SaturationCheckAlertProps> = ({
  check,
  coreName,
  materialName,
  currentNp,
  onApplyTurns,
  onApplyCore,
  onApplyMaterial,
  compact = false,
}) => {
  if (check.status === 'ok') {
    return (
      <div
        role="status"
        className={`rounded-md border border-emerald-500/35 bg-emerald-500/5 dark:bg-emerald-950/20 flex flex-wrap items-center justify-between gap-2 ${
          compact ? 'px-3 py-2' : 'px-4 py-2.5'
        }`}
      >
        <div className="flex items-center gap-2 text-xs text-emerald-800 dark:text-emerald-300">
          <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span className="font-semibold">{check.headline}</span>
          {!compact && (
            <span className="text-slate-600 dark:text-slate-400 hidden sm:inline">
              · {check.detail}
            </span>
          )}
        </div>
        <div className="text-[11px] font-mono tabular-nums text-emerald-700 dark:text-emerald-400 font-semibold">
          {check.utilization_100C_pct.toFixed(1)}% of 100°C B_sat
        </div>
      </div>
    );
  }

  const isCritical = check.status === 'critical';

  return (
    <div
      role="alert"
      className={`rounded-md border ${
        isCritical
          ? 'border-rose-500/70 bg-rose-50 dark:bg-rose-950/25'
          : 'border-amber-500/70 bg-amber-50 dark:bg-amber-950/25'
      } ${compact ? 'p-3' : 'p-4'} space-y-3`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <div
            className={`p-1.5 rounded shrink-0 mt-0.5 ${
              isCritical
                ? 'bg-rose-600 text-white'
                : 'bg-amber-500 text-slate-950'
            }`}
          >
            {isCritical ? (
              <ShieldAlert className="w-4 h-4" />
            ) : (
              <AlertTriangle className="w-4 h-4" />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`text-xs font-semibold ${
                  isCritical
                    ? 'text-rose-800 dark:text-rose-200'
                    : 'text-amber-800 dark:text-amber-200'
                }`}
              >
                {check.headline}
              </span>
              <span
                className={`text-[11px] font-mono tabular-nums font-semibold ${
                  isCritical
                    ? 'text-rose-700 dark:text-rose-300'
                    : 'text-amber-700 dark:text-amber-300'
                }`}
              >
                · {check.utilization_100C_pct.toFixed(1)}% of B_sat(100°C)
              </span>
            </div>
            <p className="text-xs text-slate-700 dark:text-slate-300 mt-1 leading-relaxed">
              {check.detail}
            </p>
          </div>
        </div>

        {/* Clean Unboxed Telemetry Readout */}
        <div className="flex flex-wrap items-center gap-3 text-xs shrink-0 text-slate-700 dark:text-slate-300">
          <div>
            <span className="text-slate-500 dark:text-slate-400">Calc B_pk: </span>
            <span
              className={`font-mono tabular-nums font-semibold ${
                isCritical
                  ? 'text-rose-700 dark:text-rose-300'
                  : 'text-amber-700 dark:text-amber-300'
              }`}
            >
              {check.Bpk_mT.toFixed(1)} mT
            </span>
          </div>
          <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">
            ·
          </span>
          <div>
            <span className="text-slate-500 dark:text-slate-400">B_sat(100°C): </span>
            <span className="font-mono tabular-nums font-semibold">
              {check.Bsat_100C_mT.toFixed(0)} mT
            </span>
          </div>
          <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">
            ·
          </span>
          <div className="inline-flex items-center gap-1">
            <Flame className="w-3 h-3 text-amber-500" />
            <span className="text-slate-500 dark:text-slate-400">
              B_sat({check.Tcore_C.toFixed(0)}°C):
            </span>
            <span className="font-mono tabular-nums font-semibold">
              {check.Bsat_at_Tcore_mT.toFixed(0)} mT
            </span>
          </div>
        </div>
      </div>

      {/* Remediation Actions */}
      {(onApplyTurns || onApplyCore || onApplyMaterial) && (
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200/80 dark:border-slate-800">
          <span className="text-[11px] text-slate-600 dark:text-slate-400">
            Remediation ({coreName} · {materialName} · Np = <span className="font-mono tabular-nums">{currentNp}T</span>):
          </span>
          {onApplyTurns && check.recommendedMinNp_turns > currentNp && (
            <button
              type="button"
              onClick={() => onApplyTurns(check.recommendedMinNp_turns)}
              className="px-2.5 py-1 text-[11px] font-medium rounded bg-emerald-600 hover:bg-emerald-500 text-white inline-flex items-center gap-1 cursor-pointer transition-colors whitespace-nowrap"
            >
              <Check className="w-3 h-3" /> Set Safe Np = {check.recommendedMinNp_turns}T (≤80% B_sat)
            </button>
          )}
          {onApplyTurns &&
            check.recommendedSafeNp_turns > check.recommendedMinNp_turns && (
              <button
                type="button"
                onClick={() => onApplyTurns(check.recommendedSafeNp_turns)}
                className="px-2.5 py-1 text-[11px] font-medium rounded bg-cyan-600 hover:bg-cyan-500 text-white inline-flex items-center gap-1 cursor-pointer transition-colors whitespace-nowrap"
              >
                <Check className="w-3 h-3" /> Set Optimal Np = {check.recommendedSafeNp_turns}T (30% Margin)
              </button>
            )}
          {onApplyCore && check.recommendedCoreId && check.recommendedCoreName && (
            <button
              type="button"
              onClick={() => onApplyCore(check.recommendedCoreId!)}
              className="px-2.5 py-1 text-[11px] font-medium rounded bg-slate-800 hover:bg-slate-700 text-white inline-flex items-center gap-1 cursor-pointer transition-colors whitespace-nowrap"
            >
              Upgrade Core: {check.recommendedCoreName}
            </button>
          )}
          {onApplyMaterial && check.recommendedMaterialId && (
            <button
              type="button"
              onClick={() => onApplyMaterial(check.recommendedMaterialId!)}
              className="px-2.5 py-1 text-[11px] font-medium rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#131A26] hover:border-slate-400 text-slate-800 dark:text-slate-200 inline-flex items-center gap-1 cursor-pointer transition-colors whitespace-nowrap"
            >
              Switch Grade: {check.recommendedMaterialId}
            </button>
          )}
        </div>
      )}
    </div>
  );
};
