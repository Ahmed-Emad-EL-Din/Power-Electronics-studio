import React, { useState, useRef, useEffect, useCallback } from 'react';
import { PanelLeftClose, PanelLeftOpen, GripVertical, SlidersHorizontal, RotateCcw } from 'lucide-react';

interface ResizableSidebarWindowProps {
  title?: string;
  subtitle?: string;
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  children: React.ReactNode;
}

export const ResizableSidebarWindow: React.FC<ResizableSidebarWindowProps> = ({
  title = 'Converter Parameters',
  subtitle = 'Scrollable • Drag Right Border',
  defaultWidth = 360,
  minWidth = 270,
  maxWidth = 680,
  children,
}) => {
  const [isOpen, setIsOpen] = useState(true);
  const [width, setWidth] = useState<number>(defaultWidth);
  const [isResizing, setIsResizing] = useState(false);

  const asideRef = useRef<HTMLElement | null>(null);
  const dragStartXRef = useRef<number>(0);
  const dragStartWidthRef = useRef<number>(defaultWidth);

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
      {/* Collapsed state button on left edge to drop/slide window right */}
      {!isOpen && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          title="Open Parameters Window"
          className="lg:sticky lg:top-16 z-20 shrink-0 flex lg:flex-col items-center justify-center gap-2 px-2.5 py-3 bg-white dark:bg-[#0E131D] hover:border-cyan-500 text-slate-700 dark:text-slate-200 hover:text-cyan-600 dark:hover:text-cyan-300 border border-slate-200 dark:border-slate-800 rounded-lg transition-colors group cursor-pointer"
        >
          <PanelLeftOpen className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
          <span className="text-[11px] font-medium tracking-wide lg:[writing-mode:vertical-rl] lg:rotate-180 whitespace-nowrap">
            Parameters
          </span>
        </button>
      )}

      {/* Sliding, Scrollable & Right-Border Resizable Parameter Window */}
      <aside
        ref={asideRef}
        style={
          {
            '--sidebar-width': `${width}px`,
          } as React.CSSProperties
        }
        className={`relative shrink-0 transition-[opacity,transform] duration-150 ease-out ${
          isOpen
            ? 'w-full lg:w-[var(--sidebar-width)] opacity-100 translate-x-0'
            : 'hidden w-0 opacity-0 -translate-x-full pointer-events-none overflow-hidden'
        } bg-white dark:bg-[#0E131D] border border-slate-200 dark:border-slate-800 ${
          isResizing
            ? 'border-r-2 border-r-cyan-500 dark:border-r-cyan-400'
            : ''
        } rounded-lg lg:sticky lg:top-16 lg:max-h-[calc(100vh-5rem)] overflow-y-auto overflow-x-hidden p-4 pr-5 space-y-4`}
      >
        {/* Sticky Window Header Bar */}
        <header className="sticky -top-4 -mx-4 -mr-5 -mt-4 mb-2 px-4 py-2.5 bg-white dark:bg-[#0E131D] border-b border-slate-200 dark:border-slate-800 z-20 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <SlidersHorizontal className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400 shrink-0" />
            <div className="truncate">
              <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                {title}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {subtitle} · <span className="font-mono tabular-nums">{width} px</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {width !== defaultWidth && (
              <button
                type="button"
                onClick={() => setWidth(defaultWidth)}
                title="Reset Window Width"
                aria-label="Reset Window Width"
                className="p-1.5 rounded text-slate-500 hover:text-cyan-600 dark:text-slate-400 dark:hover:text-cyan-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              title="Collapse Parameters Window Left"
              className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium bg-slate-100 dark:bg-[#151C2B] hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer whitespace-nowrap"
            >
              <PanelLeftClose className="w-3.5 h-3.5" />
              <span>Hide</span>
            </button>
          </div>
        </header>

        {/* Full-Height Sticky Right-Border Drag Handle */}
        <span
          role="separator"
          aria-orientation="vertical"
          aria-label="Drag right border to resize parameter window"
          title="Drag right border to resize window (Double-click to reset)"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            startResize(e.clientX);
          }}
          onDoubleClick={(e) => {
            e.stopPropagation();
            setWidth(defaultWidth);
          }}
          className={`hidden lg:flex sticky top-12 float-right -mr-5 z-30 w-2.5 h-[calc(100vh-9rem)] -mb-[calc(100vh-9rem)] items-center justify-center cursor-col-resize group select-none transition-colors ${
            isResizing ? 'bg-cyan-500/20' : 'hover:bg-cyan-500/10'
          }`}
        >
          <span
            className={`w-2.5 h-10 rounded-l flex items-center justify-center transition-opacity ${
              isResizing
                ? 'bg-cyan-500 text-white opacity-100'
                : 'bg-slate-300 dark:bg-slate-700 text-slate-600 dark:text-slate-300 opacity-50 group-hover:opacity-100 group-hover:bg-cyan-500 group-hover:text-white'
            }`}
          >
            <GripVertical className="w-2.5 h-2.5" />
          </span>
        </span>

        {/* Parameter Sections */}
        {children}
      </aside>
    </>
  );
};
