import { useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D, { type ForceGraphMethods, type NodeObject, type LinkObject } from "react-force-graph-2d";

export interface GraphData {
  nodes: { id: string; title: string; links: number }[];
  edges: { source: string; target: string }[];
}

interface GraphNode extends NodeObject {
  id: string;
  title: string;
  links: number;
  radius: number;
}

type GraphLink = LinkObject<GraphNode>;

function readCssVar(name: string): string {
  if (typeof window === "undefined") return "";
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v;
}

function useThemeTokens() {
  const [tokens, setTokens] = useState({ fg: "", muted: "", border: "", accent: "" });
  useEffect(() => {
    const update = () => setTokens({
      fg: readCssVar("--foreground"),
      muted: readCssVar("--muted-foreground"),
      border: readCssVar("--border"),
      accent: readCssVar("--primary"),
    });
    update();
    const obs = new MutationObserver(update);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return tokens;
}

function useContainerSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        const cr = e.contentRect;
        setSize({ width: Math.floor(cr.width), height: Math.floor(cr.height) });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, ...size };
}

export interface GraphViewProps {
  data: GraphData;
  onNodeClick: (id: string) => void;
}

export function GraphView({ data, onNodeClick }: GraphViewProps) {
  const { ref, width, height } = useContainerSize<HTMLDivElement>();
  const tokens = useThemeTokens();
  const fgRef = useRef<ForceGraphMethods<GraphNode, GraphLink> | undefined>(undefined);
  const [zoom, setZoom] = useState(1);
  const [hoverId, setHoverId] = useState<string | null>(null);

  const graph = useMemo(() => {
    const nodes: GraphNode[] = data.nodes.map(n => ({
      id: n.id,
      title: n.title,
      links: n.links,
      radius: 3 + Math.sqrt(n.links) * 2,
    }));
    const links: GraphLink[] = data.edges.map(e => ({ source: e.source, target: e.target }));
    return { nodes, links };
  }, [data]);

  // The pointer cursor is set on document.body during node hover, so we must
  // reset it both on click (navigation prevents a hover-out) and on unmount.
  useEffect(() => {
    return () => {
      if (typeof document !== "undefined") document.body.style.cursor = "";
    };
  }, []);

  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    const charge = fg.d3Force("charge") as unknown as { strength?: (n: number) => unknown } | null;
    charge?.strength?.(-90);
    const link = fg.d3Force("link") as unknown as { distance?: (n: number) => unknown } | null;
    link?.distance?.(40);

    // Gravity — pull every node toward the origin so the graph stays bounded.
    type SimNode = { x?: number; y?: number; vx?: number; vy?: number };
    type GravityForce = ((alpha: number) => void) & { initialize?: (nodes: SimNode[]) => void };
    let simNodes: SimNode[] = [];
    const strength = 0.04;
    const gravity: GravityForce = (alpha: number) => {
      for (const n of simNodes) {
        n.vx = (n.vx ?? 0) - (n.x ?? 0) * strength * alpha;
        n.vy = (n.vy ?? 0) - (n.y ?? 0) * strength * alpha;
      }
    };
    gravity.initialize = (nodes: SimNode[]) => { simNodes = nodes; };
    fg.d3Force("gravity", gravity as unknown as Parameters<typeof fg.d3Force>[1]);
    fg.d3ReheatSimulation();
  }, [graph]);

  const showLabels = zoom > 1.6;
  const fgColor = tokens.fg || "#111";
  const mutedColor = tokens.muted || "#888";
  const borderColor = tokens.border || "#ddd";
  const accentColor = tokens.accent || "#3b82f6";

  return (
    <div ref={ref} className="relative h-full w-full overflow-hidden">
      {width > 0 && height > 0 && (
        <ForceGraph2D<GraphNode, GraphLink>
          ref={fgRef}
          graphData={graph}
          width={width}
          height={height}
          backgroundColor="transparent"
          cooldownTicks={120}
          warmupTicks={20}
          d3VelocityDecay={0.3}
          linkColor={() => borderColor}
          linkWidth={1}
          onZoom={t => setZoom(t.k)}
          onNodeHover={(node) => {
            setHoverId(node?.id != null ? String(node.id) : null);
            if (typeof document !== "undefined") {
              document.body.style.cursor = node ? "pointer" : "";
            }
          }}
          onNodeClick={(node) => {
            if (typeof document !== "undefined") document.body.style.cursor = "";
            setHoverId(null);
            if (node?.id != null) onNodeClick(String(node.id));
          }}
          onNodeDragEnd={(node) => {
            // release the pin so the node drifts back under simulation forces
            node.fx = undefined;
            node.fy = undefined;
          }}
          nodeCanvasObject={(node, ctx, globalScale) => {
            const n = node as GraphNode;
            const r = n.radius;
            const isHover = hoverId === n.id;
            ctx.beginPath();
            ctx.arc(n.x ?? 0, n.y ?? 0, r, 0, 2 * Math.PI);
            ctx.fillStyle = isHover ? accentColor : fgColor;
            ctx.fill();

            if (showLabels || isHover) {
              const fontSize = Math.max(10 / globalScale, 2);
              ctx.font = `${fontSize}px ui-sans-serif, system-ui, sans-serif`;
              ctx.textAlign = "center";
              ctx.textBaseline = "top";
              const label = n.title;
              const padY = r + 2;
              ctx.fillStyle = isHover ? accentColor : mutedColor;
              ctx.fillText(label, n.x ?? 0, (n.y ?? 0) + padY);
            }
          }}
          nodePointerAreaPaint={(node, color, ctx) => {
            const n = node as GraphNode;
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(n.x ?? 0, n.y ?? 0, n.radius + 2, 0, 2 * Math.PI);
            ctx.fill();
          }}
        />
      )}
    </div>
  );
}
