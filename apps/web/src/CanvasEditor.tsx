import {
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { TextFileViewProps } from "./fileViewRenderers";
import { flattenWorkspaceTree } from "./workspaceTree";
import "./CanvasEditor.css";

interface JsonCanvas {
  readonly nodes?: readonly CanvasNode[];
  readonly edges?: readonly CanvasEdge[];
  readonly [key: string]: unknown;
}

interface CanvasNode {
  readonly id: string;
  readonly type: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly text?: string;
  readonly file?: string;
  readonly url?: string;
  readonly label?: string;
  readonly [key: string]: unknown;
}

interface CanvasEdge {
  readonly id: string;
  readonly fromNode: string;
  readonly toNode: string;
  readonly label?: string;
  readonly [key: string]: unknown;
}

const MIN_SCALE = 0.35;
const MAX_SCALE = 2.25;

export function CanvasEditor({
  value,
  tree,
  onChange,
  onOpenFile,
}: TextFileViewProps) {
  const parsed = useMemo(() => parseCanvas(value), [value]);
  const [viewport, setViewport] = useState({ x: 40, y: 40, scale: 1 });
  const panRef = useRef<
    | {
        readonly pointerId: number;
        readonly startX: number;
        readonly startY: number;
        readonly originX: number;
        readonly originY: number;
      }
    | undefined
  >();

  const filesByPath = useMemo(
    () =>
      new Map(
        flattenWorkspaceTree(tree)
          .filter((node) => node.metadata.kind === "file")
          .map((node) => [normalizePath(node.path), node] as const),
      ),
    [tree],
  );

  if (!parsed.ok) {
    return (
      <div className="json-canvas-error" role="alert">
        <strong>Invalid JSON Canvas</strong>
        <p>{parsed.error}</p>
        <textarea
          value={value}
          onChange={(event) => onChange(event.currentTarget.value)}
          aria-label="Raw canvas JSON"
        />
      </div>
    );
  }

  const canvas = parsed.canvas;
  const nodes = canvas.nodes ?? [];
  const nodeById = new Map(nodes.map((node) => [node.id, node] as const));

  function updateNode(id: string, patch: Partial<CanvasNode>) {
    const nextNodes = nodes.map((node) =>
      node.id === id ? { ...node, ...patch } : node,
    );
    onChange(serializeCanvas({ ...canvas, nodes: nextNodes }));
  }

  function addTextNode() {
    const id = crypto.randomUUID();
    const next: CanvasNode = {
      id,
      type: "text",
      x: Math.round((-viewport.x + 120) / viewport.scale),
      y: Math.round((-viewport.y + 100) / viewport.scale),
      width: 280,
      height: 160,
      text: "New note",
    };
    onChange(serializeCanvas({ ...canvas, nodes: [...nodes, next] }));
  }

  function pointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || event.target !== event.currentTarget) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    panRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: viewport.x,
      originY: viewport.y,
    };
  }

  function pointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const pan = panRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    setViewport((current) => ({
      ...current,
      x: pan.originX + event.clientX - pan.startX,
      y: pan.originY + event.clientY - pan.startY,
    }));
  }

  function pointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (panRef.current?.pointerId === event.pointerId) {
      panRef.current = undefined;
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  return (
    <div className="json-canvas-shell">
      <div className="json-canvas-toolbar">
        <button type="button" onClick={addTextNode}>+ Text</button>
        <button
          type="button"
          onClick={() => setViewport({ x: 40, y: 40, scale: 1 })}
        >
          Reset view
        </button>
        <span>{Math.round(viewport.scale * 100)}%</span>
      </div>
      <div
        className="json-canvas-viewport"
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onWheel={(event) => {
          if (!event.ctrlKey && !event.metaKey) return;
          event.preventDefault();
          const scale = clamp(
            viewport.scale * (event.deltaY > 0 ? 0.9 : 1.1),
            MIN_SCALE,
            MAX_SCALE,
          );
          setViewport((current) => ({ ...current, scale }));
        }}
      >
        <div
          className="json-canvas-stage"
          style={{
            transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`,
          }}
        >
          <svg className="json-canvas-edges" aria-hidden="true">
            {(canvas.edges ?? []).map((edge) => {
              const from = nodeById.get(edge.fromNode);
              const to = nodeById.get(edge.toNode);
              if (!from || !to) return null;
              const x1 = from.x + from.width / 2;
              const y1 = from.y + from.height / 2;
              const x2 = to.x + to.width / 2;
              const y2 = to.y + to.height / 2;
              return (
                <g key={edge.id}>
                  <line x1={x1} y1={y1} x2={x2} y2={y2} />
                  {edge.label ? (
                    <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 6}>
                      {edge.label}
                    </text>
                  ) : null}
                </g>
              );
            })}
          </svg>
          {nodes.map((node) => (
            <CanvasNodeView
              key={node.id}
              node={node}
              onMove={(x, y) => updateNode(node.id, { x, y })}
              onText={(text) => updateNode(node.id, { text })}
              onOpenFile={() => {
                if (!node.file) return;
                const target = filesByPath.get(normalizePath(node.file));
                if (target) onOpenFile(target.metadata.id);
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function CanvasNodeView({
  node,
  onMove,
  onText,
  onOpenFile,
}: {
  readonly node: CanvasNode;
  readonly onMove: (x: number, y: number) => void;
  readonly onText: (text: string) => void;
  readonly onOpenFile: () => void;
}) {
  const dragRef = useRef<
    | {
        readonly pointerId: number;
        readonly startX: number;
        readonly startY: number;
        readonly originX: number;
        readonly originY: number;
      }
    | undefined
  >();

  return (
    <article
      className={`json-canvas-node type-${node.type}`}
      style={{
        left: node.x,
        top: node.y,
        width: Math.max(80, node.width),
        height: Math.max(56, node.height),
      }}
      onDoubleClick={node.type === "file" ? onOpenFile : undefined}
    >
      <div
        className="json-canvas-node-handle"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          dragRef.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            originX: node.x,
            originY: node.y,
          };
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          if (!drag || drag.pointerId !== event.pointerId) return;
          onMove(
            Math.round(drag.originX + event.clientX - drag.startX),
            Math.round(drag.originY + event.clientY - drag.startY),
          );
        }}
        onPointerUp={(event) => {
          if (dragRef.current?.pointerId === event.pointerId) {
            dragRef.current = undefined;
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
        }}
      >
        {node.type === "group" ? node.label ?? "Group" : node.type}
      </div>
      {node.type === "text" ? (
        <textarea
          value={node.text ?? ""}
          onChange={(event) => onText(event.currentTarget.value)}
          aria-label="Canvas text node"
        />
      ) : node.type === "file" ? (
        <button type="button" className="json-canvas-file" onClick={onOpenFile}>
          {node.file ?? "Missing file"}
        </button>
      ) : node.type === "link" ? (
        <a href={node.url} target="_blank" rel="noreferrer">
          {node.url}
        </a>
      ) : (
        <div className="json-canvas-group-label">{node.label}</div>
      )}
    </article>
  );
}

function parseCanvas(
  value: string,
): { readonly ok: true; readonly canvas: JsonCanvas } | { readonly ok: false; readonly error: string } {
  try {
    const parsed = JSON.parse(value || "{}") as JsonCanvas;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, error: "The top level must be a JSON object." };
    }
    if (parsed.nodes !== undefined && !Array.isArray(parsed.nodes)) {
      return { ok: false, error: "nodes must be an array." };
    }
    if (parsed.edges !== undefined && !Array.isArray(parsed.edges)) {
      return { ok: false, error: "edges must be an array." };
    }
    return { ok: true, canvas: parsed };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unable to parse canvas.",
    };
  }
}

function serializeCanvas(canvas: JsonCanvas): string {
  return `${JSON.stringify(canvas, null, 2)}\n`;
}

function normalizePath(value: string): string {
  return value.replaceAll("\\", "/").replace(/^\.\//, "").replace(/^\//, "");
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
