import { useState } from "react";
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
  children: (sizes: number[]) => React.ReactNode;
}

export function ResizableTable({ columns, checkboxColumn = true, children }: ResizableTableProps) {
  const [colSizes, setColSizes] = useState(columns.map(c => c.defaultSize));

  return (
    <div className="rounded-md border overflow-hidden">
      {/* Header with resize handles */}
      <div className="flex items-center bg-muted/50 border-b h-10">
        {checkboxColumn && <div className="w-10 shrink-0" />}
        <ResizablePanelGroup direction="horizontal" className="flex-1 h-full" onLayout={setColSizes}>
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
      {children(colSizes)}
    </div>
  );
}

interface ResizableTableRowProps {
  colSizes: number[];
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

export function ResizableTableRow({
  colSizes, cells, checkboxCell, className,
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
            style={{ width: `${colSizes[i]}%` }}
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
