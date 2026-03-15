import { useRef } from "react";
import { cn } from "@/lib/utils";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";

export interface ColumnDef {
  label: string;
  defaultSize: number;
  minSize?: number;
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

/**
 * Renders a table with resizable columns. Column widths are tracked as CSS
 * custom properties (--col-0, --col-1, …) set directly on the container DOM
 * node via a ref, so header and body stay in sync without React re-renders.
 */
export function ResizableTable({ columns, checkboxColumn = true, children }: ResizableTableProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Set initial CSS custom properties so rows are sized correctly on first render.
  const initialStyle = columns.reduce((acc, col, i) => ({
    ...acc,
    [`--col-${i}`]: `${col.defaultSize}%`,
  }), {} as React.CSSProperties);

  const handleLayout = (sizes: number[]) => {
    const el = containerRef.current;
    if (!el) return;
    sizes.forEach((size, i) => el.style.setProperty(`--col-${i}`, `${size}%`));
  };

  return (
    <div ref={containerRef} className="rounded-md border overflow-hidden" style={initialStyle}>
      {/* Header — resize handles live only here */}
      <div className="flex items-center bg-muted/50 border-b h-10">
        {checkboxColumn && <div className="w-10 shrink-0" />}
        <ResizablePanelGroup direction="horizontal" className="flex-1 h-full" onLayout={handleLayout}>
          {columns.flatMap((col, i) => [
            i > 0 ? <ResizableHandle key={`h${i}`} /> : null,
            <ResizablePanel key={`p${i}`} defaultSize={col.defaultSize} minSize={col.minSize ?? 8}>
              <div className="flex items-center h-full px-3 text-xs font-medium text-muted-foreground">
                {col.label}
              </div>
            </ResizablePanel>,
          ])}
        </ResizablePanelGroup>
      </div>
      {children}
    </div>
  );
}

interface ResizableTableRowProps {
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

/**
 * A single body row. Cell widths come from --col-N CSS custom properties set
 * by the parent ResizableTable, so no props are needed for sizing.
 */
export function ResizableTableRow({
  cells, checkboxCell, className,
  draggable, onDragStart, onDragEnd, onDragOver, onDragLeave, onDrop,
}: ResizableTableRowProps) {
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
      <div className="flex-1 flex min-w-0">
        {cells.map((cell, i) => (
          <div
            key={i}
            style={{ width: `var(--col-${i})` }}
            className={cn("flex items-center overflow-hidden", cell.className ?? "px-3")}
            onClick={cell.onClick}
          >
            {cell.content}
          </div>
        ))}
      </div>
    </div>
  );
}
