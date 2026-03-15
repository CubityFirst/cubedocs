import React, { useRef, useCallback, useMemo, useState } from "react";
import { GripVerticalIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import type { Layout } from "react-resizable-panels";

export interface ColumnDef {
  label: string;
  defaultSize: number; // % for resizable columns; ignored for constrained (minWidth) columns
  minSize?: number;    // % minimum for resizable columns
  minWidth?: number;   // px — if set, column becomes a standalone fixed-width segment
  maxWidth?: number;   // px — maximum width for constrained columns (only used with minWidth)
}

export interface CellDef {
  content: React.ReactNode;
  className?: string;
  onClick?: React.MouseEventHandler<HTMLDivElement>;
}

interface ResizableTableProps {
  columns: ColumnDef[];
  checkboxColumn?: boolean;
  storageKey?: string;
  children: React.ReactNode;
}

interface ResizableTableRowProps {
  columns: ColumnDef[];
  cells: CellDef[];
  checkboxCell?: React.ReactNode;
  className?: string;
  draggable?: boolean;
  onDragStart?: React.DragEventHandler;
  onDragEnd?: React.DragEventHandler;
  onDragOver?: React.DragEventHandler;
  onDragLeave?: React.DragEventHandler;
  onDrop?: React.DragEventHandler<HTMLDivElement>;
}

// ── Segment helpers ──────────────────────────────────────────────────────────

interface ResizableSegment {
  type: "resizable";
  cols: { col: ColumnDef; idx: number }[];
  segIdx: number;
  isLast: boolean;
  /** true when this segment came from a single column with minWidth/maxWidth */
  constrained: boolean;
  minPx: number;
  maxPx: number;
}
type Segment = ResizableSegment;

function buildSegments(columns: ColumnDef[]): Segment[] {
  const segments: Segment[] = [];
  let segIdx = 0;
  let current: { col: ColumnDef; idx: number }[] = [];

  const flush = (minPx = 50, maxPx = Infinity, constrained = false) => {
    if (current.length > 0) {
      segments.push({
        type: "resizable",
        cols: current,
        segIdx: segIdx++,
        isLast: false,
        constrained,
        minPx,
        maxPx,
      });
      current = [];
    }
  };

  for (let i = 0; i < columns.length; i++) {
    const col = columns[i];
    if (col.minWidth != null) {
      flush(); // flush preceding resizable columns
      current = [{ col, idx: i }];
      flush(col.minWidth, col.maxWidth ?? Infinity, true); // standalone constrained segment
    } else {
      current.push({ col, idx: i });
    }
  }
  flush();

  // Mark the last segment
  for (let i = segments.length - 1; i >= 0; i--) {
    segments[i].isLast = true;
    break;
  }

  return segments;
}

// ── ResizableTable ────────────────────────────────────────────────────────────

export function ResizableTable({ columns, checkboxColumn = true, storageKey, children }: ResizableTableProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const segments = useMemo(() => buildSegments(columns), [columns]);

  const [saved] = useState<Record<string, string>>(() => {
    if (!storageKey) return {};
    try { return JSON.parse(localStorage.getItem(storageKey) ?? "{}") as Record<string, string>; }
    catch { return {}; }
  });

  const save = useCallback((key: string, value: string) => {
    if (!storageKey) return;
    try {
      const current = JSON.parse(localStorage.getItem(storageKey) ?? "{}") as Record<string, string>;
      current[key] = value;
      localStorage.setItem(storageKey, JSON.stringify(current));
    } catch {}
  }, [storageKey]);

  const initialStyle = useMemo((): React.CSSProperties => {
    const style: Record<string, string> = {};
    const totalResizable = columns.reduce((s, c) => c.minWidth == null ? s + c.defaultSize : s, 0);

    for (const seg of segments) {
      if (!seg.isLast) {
        const savedWidth = saved[`--seg-${seg.segIdx}-width`];
        if (savedWidth) {
          style[`--seg-${seg.segIdx}-width`] = savedWidth;
        } else if (seg.constrained) {
          style[`--seg-${seg.segIdx}-width`] = `${seg.minPx}px`;
        } else {
          const segTotal = seg.cols.reduce((s, c) => s + c.col.defaultSize, 0);
          style[`--seg-${seg.segIdx}-width`] = `${(segTotal / totalResizable) * 100}%`;
        }
      }

      if (seg.constrained) {
        // Single constrained column always fills 100% of its segment
        style[`--col-${seg.cols[0].idx}`] = "100%";
      } else {
        const segColTotal = seg.cols.reduce((s, c) => s + c.col.defaultSize, 0);
        for (const { col, idx } of seg.cols) {
          style[`--col-${idx}`] = saved[`--col-${idx}`] ?? `${(col.defaultSize / segColTotal) * 100}%`;
        }
      }
    }

    return style as React.CSSProperties;
  }, [columns, segments, saved]);

  const segDefaultLayout = useCallback((seg: ResizableSegment): Layout => {
    const layout: Layout = {};
    const segColTotal = seg.cols.reduce((s, c) => s + c.col.defaultSize, 0);
    for (const { col, idx } of seg.cols) {
      const savedVal = saved[`--col-${idx}`];
      const pct = savedVal ? parseFloat(savedVal) : (segColTotal > 0 ? (col.defaultSize / segColTotal) * 100 : 100);
      layout[`col-${idx}`] = isNaN(pct) ? 100 : pct;
    }
    return layout;
  }, [saved]);

  const makeLayoutHandler = useCallback(
    (seg: ResizableSegment) => (layout: Layout) => {
      const el = containerRef.current;
      if (!el) return;
      const sizes = seg.cols.map(({ idx }) => layout[`col-${idx}`] ?? 0);
      const total = sizes.reduce((s, v) => s + v, 0);
      seg.cols.forEach(({ idx }, j) => {
        const pct = total > 0 ? (sizes[j] / total) * 100 : 100 / seg.cols.length;
        const value = `${pct}%`;
        el.style.setProperty(`--col-${idx}`, value);
        save(`--col-${idx}`, value);
      });
    },
    [save],
  );

  const startSegDrag = useCallback((seg: ResizableSegment, e: React.MouseEvent) => {
    e.preventDefault();
    const el = containerRef.current;
    if (!el) return;
    const segEl = el.querySelector<HTMLElement>(`[data-seg="${seg.segIdx}"]`);
    if (!segEl) return;
    const startWidth = segEl.getBoundingClientRect().width;
    const startX = e.clientX;

    const onMove = (ev: MouseEvent) => {
      const raw = startWidth + ev.clientX - startX;
      const newWidth = Math.max(seg.minPx, Math.min(seg.maxPx, raw));
      const value = `${newWidth}px`;
      el.style.setProperty(`--seg-${seg.segIdx}-width`, value);
      save(`--seg-${seg.segIdx}-width`, value);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [save]);

  return (
    <div ref={containerRef} className="rounded-md border overflow-x-auto bg-background" style={initialStyle}>
    <div className="min-w-[700px]">
      <div className="flex items-center bg-muted/50 border-b h-10">
        {checkboxColumn && <div className="w-10 shrink-0" />}

        {segments.map((seg, i) => {
          const wrapperStyle: React.CSSProperties = seg.isLast
            ? { flex: "1 1 0", minWidth: 0 }
            : { width: `var(--seg-${seg.segIdx}-width)`, flexShrink: 0 };

          const nextSeg = segments[i + 1];
          const needsDragHandle = !seg.isLast && nextSeg != null;

          return (
            <React.Fragment key={`seg-${seg.segIdx}`}>
              <div data-seg={seg.segIdx} style={wrapperStyle} className="h-full flex">
                {seg.constrained ? (
                  // Constrained (standalone) segment — no internal panel group needed
                  <div className="flex items-center h-full px-3 text-xs font-medium text-muted-foreground w-full">
                    {seg.cols[0].col.label}
                  </div>
                ) : (
                  <ResizablePanelGroup
                    className="flex-1 h-full"
                    defaultLayout={segDefaultLayout(seg)}
                    onLayoutChange={makeLayoutHandler(seg)}
                  >
                    {seg.cols.flatMap(({ col, idx }, j) => [
                      j > 0 ? <ResizableHandle key={`h${idx}`} /> : null,
                      <ResizablePanel
                        key={`p${idx}`}
                        id={`col-${idx}`}
                        defaultSize={col.defaultSize}
                        minSize={col.minSize ?? 8}
                      >
                        <div className="flex items-center h-full px-3 text-xs font-medium text-muted-foreground">
                          {col.label}
                        </div>
                      </ResizablePanel>,
                    ])}
                  </ResizablePanelGroup>
                )}
              </div>
              {needsDragHandle && (
                <div
                  className="relative flex w-px shrink-0 items-center justify-center cursor-col-resize bg-border after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2 hover:bg-ring transition-colors"
                  onMouseDown={e => startSegDrag(seg, e)}
                >
                  <div className="z-10 flex h-4 w-3 items-center justify-center rounded-xs border bg-border">
                    <GripVerticalIcon className="size-2.5" />
                  </div>
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>

      {children}
    </div>
    </div>
  );
}

// ── ResizableTableRow ─────────────────────────────────────────────────────────

export function ResizableTableRow({
  columns,
  cells,
  checkboxCell,
  className,
  draggable,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
}: ResizableTableRowProps) {
  const segments = useMemo(() => buildSegments(columns), [columns]);

  return (
    <div
      className={cn(
        "flex items-center border-b last:border-b-0 h-10 select-none transition-colors hover:bg-muted/40",
        className,
      )}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {checkboxCell !== undefined && (
        <div className="w-10 shrink-0 px-3" onClick={e => e.stopPropagation()}>
          {checkboxCell}
        </div>
      )}

      {segments.map((seg) => {
        const containerStyle: React.CSSProperties = seg.isLast
          ? { flex: "1 1 0", minWidth: 0, display: "flex" }
          : { width: `var(--seg-${seg.segIdx}-width)`, flexShrink: 0, display: "flex" };

        return (
          <div key={`seg-${seg.segIdx}`} style={containerStyle}>
            {seg.cols.map(({ idx }) => {
              const cell = cells[idx];
              return (
                <div
                  key={idx}
                  style={{ width: `var(--col-${idx})` }}
                  className={cn("flex items-center overflow-hidden shrink-0", cell?.className ?? "px-3")}
                  onClick={cell?.onClick}
                >
                  {cell?.content}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
