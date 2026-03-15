import { useRef, useCallback, useMemo } from "react";
import { cn } from "@/lib/utils";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import type { Layout } from "react-resizable-panels";

export interface ColumnDef {
  label: string;
  defaultSize: number; // percentage 0-100 for resizable columns; ignored for fixedWidth columns
  minSize?: number;    // percentage 0-100; ignored for fixedWidth columns
  fixedWidth?: number; // px — if set, column is non-resizable at exactly this pixel width
}

export interface CellDef {
  content: React.ReactNode;
  className?: string;
  onClick?: React.MouseEventHandler<HTMLDivElement>;
}

interface ResizableTableProps {
  columns: ColumnDef[];
  checkboxColumn?: boolean;
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
}
interface FixedSegment {
  type: "fixed";
  col: ColumnDef;
  idx: number;
}
type Segment = ResizableSegment | FixedSegment;

function buildSegments(columns: ColumnDef[]): Segment[] {
  const segments: Segment[] = [];
  let segIdx = 0;
  let current: { col: ColumnDef; idx: number }[] = [];

  const flush = () => {
    if (current.length > 0) {
      segments.push({ type: "resizable", cols: current, segIdx: segIdx++, isLast: false });
      current = [];
    }
  };

  for (let i = 0; i < columns.length; i++) {
    const col = columns[i];
    if (col.fixedWidth != null) {
      flush();
      segments.push({ type: "fixed", col, idx: i });
    } else {
      current.push({ col, idx: i });
    }
  }
  flush();

  // Mark the last resizable segment
  for (let i = segments.length - 1; i >= 0; i--) {
    if (segments[i].type === "resizable") {
      (segments[i] as ResizableSegment).isLast = true;
      break;
    }
  }

  return segments;
}

// ── ResizableTable ────────────────────────────────────────────────────────────

/**
 * Renders a table with resizable columns. Columns with `fixedWidth` are always
 * rendered at their specified pixel width and are not resizable. Resizable columns
 * use CSS custom properties (--col-N, --seg-N-width) kept in sync between the
 * header panel groups and body rows without React re-renders.
 */
export function ResizableTable({ columns, checkboxColumn = true, children }: ResizableTableProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const segments = useMemo(() => buildSegments(columns), [columns]);

  const initialStyle = useMemo((): React.CSSProperties => {
    const style: Record<string, string> = {};
    const totalResizable = columns.reduce((s, c) => c.fixedWidth == null ? s + c.defaultSize : s, 0);

    for (const seg of segments) {
      if (seg.type === "fixed") {
        style[`--col-${seg.idx}`] = `${seg.col.fixedWidth}px`;
      } else {
        if (!seg.isLast) {
          const segTotal = seg.cols.reduce((s, c) => s + c.col.defaultSize, 0);
          style[`--seg-${seg.segIdx}-width`] = `${(segTotal / totalResizable) * 100}%`;
        }
        const segColTotal = seg.cols.reduce((s, c) => s + c.col.defaultSize, 0);
        for (const { col, idx } of seg.cols) {
          style[`--col-${idx}`] = `${(col.defaultSize / segColTotal) * 100}%`;
        }
      }
    }

    return style as React.CSSProperties;
  }, [columns, segments]);

  // Custom drag handler to resize non-last resizable segments
  const startSegDrag = useCallback((segIdx: number, e: React.MouseEvent) => {
    e.preventDefault();
    const el = containerRef.current;
    if (!el) return;
    const segEl = el.querySelector<HTMLElement>(`[data-seg="${segIdx}"]`);
    if (!segEl) return;
    const startWidth = segEl.getBoundingClientRect().width;
    const startX = e.clientX;

    const onMove = (ev: MouseEvent) => {
      const newWidth = Math.max(50, startWidth + ev.clientX - startX);
      el.style.setProperty(`--seg-${segIdx}-width`, `${newWidth}px`);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, []);

  // onLayoutChange handler for a resizable segment's panel group.
  // Normalises flexGrow values to percentages within the segment.
  const makeLayoutHandler = useCallback(
    (seg: ResizableSegment) => (layout: Layout) => {
      const el = containerRef.current;
      if (!el) return;
      const sizes = seg.cols.map(({ idx }) => layout[`col-${idx}`] ?? 0);
      const total = sizes.reduce((s, v) => s + v, 0);
      seg.cols.forEach(({ idx }, j) => {
        const pct = total > 0 ? (sizes[j] / total) * 100 : 100 / seg.cols.length;
        el.style.setProperty(`--col-${idx}`, `${pct}%`);
      });
    },
    [],
  );

  return (
    <div ref={containerRef} className="rounded-md border overflow-hidden" style={initialStyle}>
      {/* Header — resize handles and panels live here */}
      <div className="flex items-center bg-muted/50 border-b h-10">
        {checkboxColumn && <div className="w-10 shrink-0" />}

        {segments.map((seg, i) => {
          if (seg.type === "fixed") {
            return (
              <div
                key={`fixed-${seg.idx}`}
                style={{ width: `${seg.col.fixedWidth}px`, flexShrink: 0 }}
                className="flex items-center h-full px-3 text-xs font-medium text-muted-foreground"
              >
                {seg.col.label}
              </div>
            );
          }

          const wrapperStyle: React.CSSProperties = seg.isLast
            ? { flex: "1 1 0", minWidth: 0 }
            : { width: `var(--seg-${seg.segIdx}-width)`, flexShrink: 0 };

          // Determine if a custom drag handle should follow this segment
          const nextSeg = segments[i + 1];
          const needsDragHandle = !seg.isLast && nextSeg != null;

          return (
            <div key={`seg-${seg.segIdx}`} style={{ display: "contents" }}>
              <div data-seg={seg.segIdx} style={wrapperStyle} className="h-full flex">
                <ResizablePanelGroup className="flex-1 h-full" onLayoutChange={makeLayoutHandler(seg)}>
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
              </div>
              {needsDragHandle && (
                <div
                  className="relative flex w-px shrink-0 cursor-col-resize bg-border after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2 hover:bg-ring transition-colors"
                  onMouseDown={e => startSegDrag(seg.segIdx, e)}
                />
              )}
            </div>
          );
        })}
      </div>

      {children}
    </div>
  );
}

// ── ResizableTableRow ─────────────────────────────────────────────────────────

/**
 * A single body row. Mirrors the segment structure of ResizableTable so that
 * fixed columns always align with header fixed columns, and resizable cells
 * track the same CSS custom properties updated by the header's panel groups.
 */
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
        if (seg.type === "fixed") {
          const cell = cells[seg.idx];
          return (
            <div
              key={`fixed-${seg.idx}`}
              style={{ width: `${seg.col.fixedWidth}px`, flexShrink: 0 }}
              className={cn("flex items-center overflow-hidden h-full", cell?.className ?? "px-1")}
              onClick={cell?.onClick}
            >
              {cell?.content}
            </div>
          );
        }

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
