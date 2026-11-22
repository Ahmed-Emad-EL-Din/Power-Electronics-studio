import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface SidebarSectionProps {
  title: string;
  summary?: string;
  defaultOpen?: boolean;
  alertStatus?: 'critical' | 'warning' | 'ok';
  children: React.ReactNode;
}

export const SidebarSection: React.FC<SidebarSectionProps> = ({
  title,
  summary,
  defaultOpen = true,
  alertStatus = 'ok',
  children,
}) => {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="border-t border-slate-200 dark:border-slate-800 pt-2.5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-2 py-1 text-left group cursor-pointer rounded-md hover:bg-slate-100/70 dark:hover:bg-white/[0.03] px-1 -mx-1 transition-colors"
      >
        <div className="flex items-center gap-1.5 min-w-0">
          {open ? (
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 group-hover:text-cyan-500 shrink-0" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-cyan-500 shrink-0" />
          )}
          <span className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate">
            {title}
          </span>
          {alertStatus === 'critical' && (
            <span
              className="w-2 h-2 rounded-full bg-rose-500 shrink-0"
              title="Critical design alert in this section"
            />
          )}
          {alertStatus === 'warning' && (
            <span
              className="w-2 h-2 rounded-full bg-amber-500 shrink-0"
              title="Warning in this section"
            />
          )}
        </div>
        {summary && (
          <span className="text-[10px] font-mono tabular-nums text-slate-500 dark:text-slate-400 truncate max-w-[140px]">
            {summary}
          </span>
        )}
      </button>
      {open && <div className="pt-2.5 space-y-2.5">{children}</div>}
    </section>
  );
};
