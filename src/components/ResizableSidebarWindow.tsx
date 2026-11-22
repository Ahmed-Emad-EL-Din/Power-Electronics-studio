import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  PanelLeftClose,
  PanelLeftOpen,
  GripVertical,
  SlidersHorizontal,
  RotateCcw,
  X,
} from 'lucide-react';

interface ResizableSidebarWindowProps {
  title?: string;
  subtitle?: string;
  mobileSummary?: string;
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  children: React.ReactNode;
}

export const ResizableSidebarWindow: React.FC<ResizableSidebarWindowProps> = ({
  title = 'Converter Parameters',
  subtitle = 'Drag border to resize',
  mobileSummary,
  defaultWidth = 360,
  minWidth = 270,
  maxWidth = 680,
  children,
}) => {
  const [isDesktop, setIsDesktop] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return window.matchMedia('(min-width: 1024px)').matches;
  });

  // Automatically open docked sidebar on desktop, automatically start closed as a clean drawer on phone/tablet
  const [isOpen, setIsOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return window.matchMedia('(min-width: 1024px)').matches;
  });
  const [width, setWidth] = useState<number>(defaultWidth);
  const [isResizing, setIsResizing] = useState(false);

  const asideRef = useRef<HTMLElement | null>(null);
  const dragStartXRef = useRef<number>(0);
  const dragStartWidthRef = useRef<number>(defaultWidth);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const handleChange = (e: MediaQueryListEvent) => {
      setIsDesktop(e.matches);
      setIsOpen(e.matches);
    };
    mq.addEventListener('change', handleChange);
    return () => mq.removeEventListener('change', handleChange);
  }, []);

  // Allow mobile bottom dock or keyboard shortcut to open parameters drawer
  useEffect(() => {
    const onOpenParams = () => setIsOpen(true);
    const onToggleParams = () => setIsOpen((v) => !v);
    window.addEventListener('pe-open-params', onOpenParams);
    window.addEventListener('pe-toggle-params', onToggleParams);
    return () => {
      window.removeEventListener('pe-open-params', onOpenParams);
      window.removeEventListener('pe-toggle-params', onToggleParams);
    };
  }, []);

  // Close mobile drawer on Escape
  useEffect(() => {
    if (isDesktop || !isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isDesktop, isOpen]);

  const startResize = useCallback(
    (clientX: number) => {
      dragStartXRef.current = clientX;
      dragStartWidthRef.current = width;
      setIsResizing(true);
    },
    [width]
  );

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - dragStartXRef.current;
      const nextWidth = Math.min(maxWidth, Math.max(minWidth, dragStartWidthRef.current + delta));
      setWidth(nextWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, minWidth, maxWidth]);

  return (
    <>
      {/* Collapsed state trigger: sleek horizontal bar on phone/tablet, vertical dock rail on desktop */}
      {!isOpen && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          title="Open Parameters Panel"
          className="w-full lg:w-auto lg:sticky lg:top-16 z-20 shrink-0 flex lg:flex-col items-center justify-between lg:justify-center gap-2 px-3 py-2.5 lg:px-2.5 lg:py-3 bg-white dark:bg-[#14171f] hover:border-blue-500/60 text-slate-800 dark:text-[#eef0f6] hover:text-blue-600 dark:hover:text-blue-400 border border-slate-200 dark:border-white/[0.08] rounded-xl lg:rounded-lg transition-colors cursor-pointer shadow-xs lg:shadow-none"
        >
          <span className="inline-flex items-center gap-2 lg:flex-col">
            <SlidersHorizontal className="w-4 h-4 text-blue-600 dark:text-blue-400 lg:hidden" aria-hidden="true" />
            <PanelLeftOpen className="w-4 h-4 text-blue-600 dark:text-blue-400 hidden lg:block" aria-hidden="true" />
            <span className="text-xs lg:text-[11px] font-semibold lg:font-medium tracking-wide lg:[writing-mode:vertical-rl] lg:rotate-180 whitespace-nowrap">
              {isDesktop ? 'Parameters' : `Tune ${title}`}
            </span>
          </span>
          {mobileSummary && (
            <span className="lg:hidden text-[11px] font-mono tabular-nums text-slate-500 dark:text-[#a1a8b8] truncate max-w-[55%]">
              {mobileSummary}
            </span>
          )}
        </button>
      )}

      {/* Mobile backdrop when parameter sheet is open */}
      {!isDesktop && isOpen && (
        <div
          aria-hidden="true"
          onClick={() => setIsOpen(false)}
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px] lg:hidden"
        />
      )}

      {/* Desktop: sticky resizable sidebar | Mobile: slide-up bottom sheet drawer */}
      <aside
        ref={asideRef}
        role={!isDesktop && isOpen ? 'dialog' : undefined}
        aria-modal={!isDesktop && isOpen ? true : undefined}
        aria-label={title}
        style={
          {
            '--sidebar-width': `${width}px`,
          } as React.CSSProperties
        }
        className={
          !isOpen
            ? 'hidden'
            : !isDesktop
            ? 'fixed inset-x-0 bottom-0 z-50 max-h-[88dvh] rounded-t-2xl bg-white dark:bg-[#14171f] border-t border-x border-slate-200 dark:border-white/[0.12] shadow-2xl overflow-y-auto overflow-x-hidden overscroll-contain px-4 pt-2 pb-[max(1.25rem,env(safe-area-inset-bottom))] space-y-4'
            : `relative shrink-0 w-full lg:w-[var(--sidebar-width)] bg-white dark:bg-[#14171f] border border-slate-200 dark:border-white/[0.08] ${
                isResizing ? 'border-r-2 border-r-blue-500 dark:border-r-blue-400' : ''
              } rounded-xl lg:sticky lg:top-16 lg:max-h-[calc(100vh-5rem)] overflow-y-auto overflow-x-hidden overscroll-contain p-4 pr-5 space-y-4`
        }
      >
        {/* Mobile grab handle pill */}
        {!isDesktop && (
          <div className="flex justify-center pt-1 pb-0.5 lg:hidden" aria-hidden="true">
            <span className="w-10 h-1 rounded-full bg-slate-300 dark:bg-white/[0.2]" />
          </div>
        )}

        {/* Sticky Window Header Bar */}
        <header className="sticky -top-2 lg:-top-4 -mx-4 lg:-mr-5 lg:-mt-4 mb-2 px-4 py-2.5 bg-white dark:bg-[#14171f] border-b border-slate-200 dark:border-white/[0.08] z-20 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <SlidersHorizontal className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <div className="text-xs font-semibold text-slate-900 dark:text-[#eef0f6] truncate">
                {title}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-[#727b8e] truncate">
                {isDesktop ? (
                  <>
                    {subtitle} · <span className="font-mono tabular-nums">{width} px</span>
                  </>
                ) : (
                  <span className="font-mono tabular-nums">{mobileSummary || subtitle}</span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {isDesktop && width !== defaultWidth && (
              <button
                type="button"
                onClick={() => setWidth(defaultWidth)}
                title="Reset Window Width"
                aria-label="Reset Window Width"
                className="p-1.5 rounded-md text-slate-500 hover:text-blue-600 dark:text-[#a1a8b8] dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-[#1c202b] transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              title={isDesktop ? 'Collapse Parameters Window' : 'Done tuning parameters'}
              aria-label={isDesktop ? 'Collapse Parameters Window' : 'Close parameters'}
              className="flex items-center gap-1 px-2.5 py-1.5 lg:py-1 rounded-lg text-xs lg:text-[11px] font-medium bg-blue-600 lg:bg-slate-100 dark:lg:bg-[#1c202b] hover:bg-blue-500 lg:hover:bg-slate-200 dark:lg:hover:bg-white/[0.1] text-white lg:text-slate-700 dark:lg:text-[#a1a8b8] border border-transparent lg:border-slate-200 dark:lg:border-white/[0.08] transition-colors cursor-pointer whitespace-nowrap"
            >
              {isDesktop ? (
                <>
                  <PanelLeftClose className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Hide</span>
                </>
              ) : (
                <>
                  <X className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Done</span>
                </>
              )}
            </button>
          </div>
        </header>

        {/* Full-Height Sticky Right-Border Drag Handle (desktop only, with keyboard support) */}
        <span
          role="separator"
          tabIndex={0}
          aria-orientation="vertical"
          aria-label="Resize parameter panel width (drag or use Left/Right arrow keys)"
          aria-valuemin={minWidth}
          aria-valuemax={maxWidth}
          aria-valuenow={width}
          title="Drag right border or press ←/→ to resize (Double-click to reset)"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            startResize(e.clientX);
          }}
          onDoubleClick={(e) => {
            e.stopPropagation();
            setWidth(defaultWidth);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') {
              e.preventDefault();
              setWidth((w) => Math.min(maxWidth, w + 24));
            } else if (e.key === 'ArrowLeft') {
              e.preventDefault();
              setWidth((w) => Math.max(minWidth, w - 24));
            } else if (e.key === 'Home') {
              e.preventDefault();
              setWidth(defaultWidth);
            }
          }}
          className={`hidden lg:flex sticky top-12 float-right -mr-5 z-30 w-2.5 h-[calc(100vh-9rem)] -mb-[calc(100vh-9rem)] items-center justify-center cursor-col-resize group select-none transition-colors ${
            isResizing ? 'bg-blue-500/20' : 'hover:bg-blue-500/10'
          }`}
        >
          <span
            className={`w-2.5 h-10 rounded-l flex items-center justify-center transition-opacity ${
              isResizing
                ? 'bg-blue-500 text-white opacity-100'
                : 'bg-slate-300 dark:bg-white/[0.15] text-slate-600 dark:text-slate-300 opacity-50 group-hover:opacity-100 group-hover:bg-blue-500 group-hover:text-white'
            }`}
          >
            <GripVertical className="w-2.5 h-2.5" aria-hidden="true" />
          </span>
        </span>

        {/* Parameter Sections */}
        {children}
      </aside>
    </>
  );
};
