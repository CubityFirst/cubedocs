import { useMemo } from "react";
import { Network } from "lucide-react";
import { GraphView, type GraphData } from "@/components/GraphView";

function localSubgraph(g: GraphData, id: string): GraphData {
  const neighbors = new Set<string>([id]);
  for (const e of g.edges) {
    if (e.source === id) neighbors.add(e.target);
    if (e.target === id) neighbors.add(e.source);
  }
  return {
    nodes: g.nodes.filter(n => neighbors.has(n.id)),
    edges: g.edges.filter(e => neighbors.has(e.source) && neighbors.has(e.target)),
    tagColors: g.tagColors,
  };
}

export interface LinkedDocsPanelProps {
  data: GraphData;
  currentDocId: string;
  onExpand: () => void;
  onNodeClick: (id: string) => void;
}

export function LinkedDocsPanel({ data, currentDocId, onExpand, onNodeClick }: LinkedDocsPanelProps) {
  const subgraph = useMemo(() => localSubgraph(data, currentDocId), [data, currentDocId]);
  if (subgraph.nodes.length < 2) return null;

  return (
    <div className="mb-6">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Linked Documents
      </p>
      <div className="relative aspect-square w-full overflow-hidden rounded-md border border-border bg-muted/20">
        <GraphView data={subgraph} onNodeClick={onNodeClick} />
        <button
          type="button"
          onClick={onExpand}
          title="Expand graph"
          aria-label="Expand graph"
          className="absolute bottom-1.5 right-1.5 z-10 flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background/90 text-muted-foreground backdrop-blur-sm transition-colors hover:bg-accent hover:text-foreground"
        >
          <Network className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
