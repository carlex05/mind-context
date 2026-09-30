import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  NodeResizer,
  Position,
  ReactFlow,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeProps,
  type Viewport,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useTranslation } from "react-i18next";

import type { PluginFileViewProps } from "../extensions/ExtensionHost";

type CanvasNodeKind = "text" | "file" | "link" | "group";
type CanvasSide = "top" | "right" | "bottom" | "left";

interface CanvasNodeData extends Record<string, unknown> {
  readonly canvasType: CanvasNodeKind;
  readonly text?: string;
  readonly file?: string;
  readonly url?: string;
  readonly label?: string;
  readonly original: Record<string, unknown>;
  readonly initialWidth: number;
  readonly initialHeight: number;
  readonly onPatch: (
    id: string,
    patch: Partial<Pick<CanvasNodeData, "text" | "file" | "url" | "label">>,
  ) => void;
}

interface CanvasEdgeData extends Record<string, unknown> {
  readonly original: Record<string, unknown>;
}

type CanvasFlowNode = Node<CanvasNodeData>;
type CanvasFlowEdge = Edge<CanvasEdgeData>;

interface ParsedCanvas {
  readonly extras: Record<string, unknown>;
  readonly nodes: readonly CanvasFlowNode[];
  readonly edges: readonly CanvasFlowEdge[];
}

const nodeTypes = {
  canvas: CanvasNode,
};

export function CanvasPluginView({
  name,
  path,
  content,
  syncState = "synced",
  onTextChange,
}: PluginFileViewProps) {
  const { t } = useTranslation();
  const parsed = useMemo(
    () => (typeof content === "string" ? parseCanvas(content) : undefined),
    [content],
  );

  if (typeof content !== "string") {
    return <CanvasMessage title={name} body={t("canvas.requiresText")} />;
  }

  if (!parsed) {
    return (
      <CanvasMessage
        title={name}
        body={t("canvas.invalid")}
      />
    );
  }

  return (
    <CanvasEditor
      key={path}
      name={name}
      path={path}
      initial={parsed}
      syncState={syncState}
      {...(onTextChange ? { onTextChange } : {})}
    />
  );
}

function CanvasEditor({
  name,
  path,
  initial,
  syncState,
  onTextChange,
}: {
  readonly name: string;
  readonly path: string;
  readonly initial: ParsedCanvas;
  readonly syncState: NonNullable<PluginFileViewProps["syncState"]>;
  readonly onTextChange?: (content: string) => void;
}) {
  const { t } = useTranslation();
  const [nodes, setNodes] = useState<CanvasFlowNode[]>(() => [
    ...initial.nodes,
  ]);
  const [edges, setEdges] = useState<CanvasFlowEdge[]>(() => [
    ...initial.edges,
  ]);
  const [viewport, setViewport] = useState<Viewport>({
    x: 0,
    y: 0,
    zoom: 1,
  });
  const boardRef = useRef<HTMLDivElement>(null);
  const firstEmissionRef = useRef(true);
  const extrasRef = useRef(initial.extras);
  const onTextChangeRef = useRef(onTextChange);

  useEffect(() => {
    onTextChangeRef.current = onTextChange;
  }, [onTextChange]);

  const patchNode = useCallback(
    (
      id: string,
      patch: Partial<
        Pick<CanvasNodeData, "text" | "file" | "url" | "label">
      >,
    ) => {
      setNodes((current) =>
        current.map((node) =>
          node.id === id
            ? { ...node, data: { ...node.data, ...patch } }
            : node,
        ),
      );
    },
    [],
  );

  useEffect(() => {
    setNodes((current) =>
      current.map((node) => ({
        ...node,
        data: { ...node.data, onPatch: patchNode },
      })),
    );
  }, [patchNode]);

  useEffect(() => {
    if (firstEmissionRef.current) {
      firstEmissionRef.current = false;
      return;
    }
    onTextChangeRef.current?.(
      serializeCanvas(extrasRef.current, nodes, edges),
    );
  }, [nodes, edges]);

  const onNodesChange = useCallback((changes: NodeChange<CanvasFlowNode>[]) => {
    setNodes((current) => applyNodeChanges(changes, current));
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange<CanvasFlowEdge>[]) => {
    setEdges((current) => applyEdgeChanges(changes, current));
  }, []);

  const onConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target) return;
    const edge: CanvasFlowEdge = {
      id: createId(),
      source: connection.source,
      target: connection.target,
      ...(connection.sourceHandle
        ? { sourceHandle: connection.sourceHandle }
        : {}),
      ...(connection.targetHandle
        ? { targetHandle: connection.targetHandle }
        : {}),
      markerEnd: { type: MarkerType.ArrowClosed },
      data: { original: {} },
    };
    setEdges((current) => [...current, edge]);
  }, []);

  function addNode(kind: CanvasNodeKind) {
    const bounds = boardRef.current?.getBoundingClientRect();
    const centerX = bounds
      ? (bounds.width / 2 - viewport.x) / viewport.zoom
      : 120;
    const centerY = bounds
      ? (bounds.height / 2 - viewport.y) / viewport.zoom
      : 120;
    const width = kind === "group" ? 360 : 280;
    const height = kind === "group" ? 240 : 150;
    const id = createId();
    const original: Record<string, unknown> = {};

    const data: CanvasNodeData = {
      canvasType: kind,
      original,
      initialWidth: width,
      initialHeight: height,
      onPatch: patchNode,
      ...(kind === "text"
        ? { text: "" }
        : kind === "file"
          ? { file: "" }
          : kind === "link"
            ? { url: "" }
            : { label: "Group" }),
    };

    setNodes((current) => [
      ...current.map((node) => ({ ...node, selected: false })),
      {
        id,
        type: "canvas",
        position: {
          x: Math.round(centerX - width / 2),
          y: Math.round(centerY - height / 2),
        },
        style: { width, height },
        selected: true,
        data,
      },
    ]);
  }

  function removeSelection() {
    const selected = new Set(
      nodes.filter((node) => node.selected).map((node) => node.id),
    );
    setNodes((current) => current.filter((node) => !node.selected));
    setEdges((current) =>
      current.filter(
        (edge) =>
          !edge.selected &&
          !selected.has(edge.source) &&
          !selected.has(edge.target),
      ),
    );
  }

  const hasSelection =
    nodes.some((node) => node.selected) || edges.some((edge) => edge.selected);

  return (
    <section className="canvas-plugin-view" aria-label={name}>
      <header className="canvas-plugin-header">
        <div className="canvas-plugin-title">
          <strong>{name}</strong>
          <span>{path}</span>
        </div>
        <div className="canvas-plugin-status">
          <span className={`canvas-plugin-sync canvas-plugin-sync-${syncState}`}>
            {t(`canvas.sync.${syncState}`)}
          </span>
        </div>
      </header>

      <div className="canvas-plugin-toolbar" role="toolbar" aria-label={t("canvas.tools")}>
        <button type="button" onClick={() => addNode("text")}>{t("canvas.text")}</button>
        <button type="button" onClick={() => addNode("file")}>{t("canvas.file")}</button>
        <button type="button" onClick={() => addNode("link")}>{t("canvas.link")}</button>
        <button type="button" onClick={() => addNode("group")}>{t("canvas.group")}</button>
        <span className="canvas-plugin-toolbar-spacer" />
        <button type="button" disabled={!hasSelection} onClick={removeSelection}>
          {t("canvas.delete")}
        </button>
      </div>

      <div ref={boardRef} className="canvas-plugin-board">
        <ReactFlow<CanvasFlowNode, CanvasFlowEdge>
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onMove={(_, nextViewport) => setViewport(nextViewport)}
          fitView
          fitViewOptions={{ padding: 0.18 }}
          minZoom={0.1}
          maxZoom={3}
          deleteKeyCode={["Backspace", "Delete"]}
          selectionOnDrag
          panOnScroll
          snapToGrid
          snapGrid={[10, 10]}
        >
          <Background gap={20} size={1} />
          <Controls />
        </ReactFlow>
      </div>
    </section>
  );
}

function CanvasNode({
  id,
  data,
  selected,
}: NodeProps<CanvasFlowNode>) {
  const kind = data.canvasType;
  return (
    <div className={`canvas-flow-node canvas-flow-node-${kind}`}>
      <NodeResizer
        isVisible={selected}
        minWidth={120}
        minHeight={70}
      />
      <CanvasHandles />

      {kind === "text" ? (
        <textarea
          className="nodrag nopan"
          value={data.text ?? ""}
          placeholder="Write Markdown…"
          onChange={(event) => data.onPatch(id, { text: event.target.value })}
        />
      ) : kind === "file" ? (
        <>
          <span className="canvas-flow-node-kind">File</span>
          <input
            className="nodrag nopan"
            value={data.file ?? ""}
            placeholder="path/to/file.md"
            onChange={(event) => data.onPatch(id, { file: event.target.value })}
          />
        </>
      ) : kind === "link" ? (
        <>
          <span className="canvas-flow-node-kind">Link</span>
          <input
            className="nodrag nopan"
            value={data.url ?? ""}
            placeholder="https://…"
            onChange={(event) => data.onPatch(id, { url: event.target.value })}
          />
        </>
      ) : (
        <input
          className="canvas-flow-group-label nodrag nopan"
          value={data.label ?? ""}
          placeholder="Group"
          onChange={(event) => data.onPatch(id, { label: event.target.value })}
        />
      )}
    </div>
  );
}

function CanvasHandles() {
  return (
    <>
      <Handle id="target-top" type="target" position={Position.Top} />
      <Handle id="source-top" type="source" position={Position.Top} />
      <Handle id="target-right" type="target" position={Position.Right} />
      <Handle id="source-right" type="source" position={Position.Right} />
      <Handle id="target-bottom" type="target" position={Position.Bottom} />
      <Handle id="source-bottom" type="source" position={Position.Bottom} />
      <Handle id="target-left" type="target" position={Position.Left} />
      <Handle id="source-left" type="source" position={Position.Left} />
    </>
  );
}

function parseCanvas(content: string): ParsedCanvas | undefined {
  try {
    const raw = JSON.parse(content) as Record<string, unknown>;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;

    const extras = { ...raw };
    delete extras.nodes;
    delete extras.edges;

    const rawNodes = Array.isArray(raw.nodes) ? raw.nodes : [];
    const nodes = rawNodes.flatMap((value): CanvasFlowNode[] => {
      if (!isRecord(value)) return [];
      const kind = value.type;
      if (
        kind !== "text" &&
        kind !== "file" &&
        kind !== "link" &&
        kind !== "group"
      ) {
        return [];
      }
      if (
        typeof value.id !== "string" ||
        !isNumber(value.x) ||
        !isNumber(value.y) ||
        !isNumber(value.width) ||
        !isNumber(value.height)
      ) {
        return [];
      }

      const width = value.width;
      const height = value.height;
      const data: CanvasNodeData = {
        canvasType: kind,
        original: { ...value },
        initialWidth: width,
        initialHeight: height,
        onPatch: () => undefined,
        ...(kind === "text" && typeof value.text === "string"
          ? { text: value.text }
          : {}),
        ...(kind === "file" && typeof value.file === "string"
          ? { file: value.file }
          : {}),
        ...(kind === "link" && typeof value.url === "string"
          ? { url: value.url }
          : {}),
        ...(kind === "group" && typeof value.label === "string"
          ? { label: value.label }
          : {}),
      };

      return [{
        id: value.id,
        type: "canvas",
        position: { x: value.x, y: value.y },
        style: { width, height },
        data,
      }];
    });

    const rawEdges = Array.isArray(raw.edges) ? raw.edges : [];
    const edges = rawEdges.flatMap((value): CanvasFlowEdge[] => {
      if (
        !isRecord(value) ||
        typeof value.id !== "string" ||
        typeof value.fromNode !== "string" ||
        typeof value.toNode !== "string"
      ) {
        return [];
      }
      const fromSide = isCanvasSide(value.fromSide) ? value.fromSide : undefined;
      const toSide = isCanvasSide(value.toSide) ? value.toSide : undefined;
      return [{
        id: value.id,
        source: value.fromNode,
        target: value.toNode,
        ...(fromSide ? { sourceHandle: `source-${fromSide}` } : {}),
        ...(toSide ? { targetHandle: `target-${toSide}` } : {}),
        ...(typeof value.label === "string" ? { label: value.label } : {}),
        ...(value.toEnd !== "none"
          ? { markerEnd: { type: MarkerType.ArrowClosed } }
          : {}),
        ...(value.fromEnd === "arrow"
          ? { markerStart: { type: MarkerType.ArrowClosed } }
          : {}),
        data: { original: { ...value } },
      }];
    });

    return { extras, nodes, edges };
  } catch {
    return undefined;
  }
}

function serializeCanvas(
  extras: Record<string, unknown>,
  nodes: readonly CanvasFlowNode[],
  edges: readonly CanvasFlowEdge[],
): string {
  const payload = {
    ...extras,
    nodes: nodes.map((node) => {
      const width = dimension(node.width, node.measured?.width, node.data.initialWidth);
      const height = dimension(node.height, node.measured?.height, node.data.initialHeight);
      const base = {
        ...node.data.original,
        id: node.id,
        type: node.data.canvasType,
        x: Math.round(node.position.x),
        y: Math.round(node.position.y),
        width: Math.round(width),
        height: Math.round(height),
      } as Record<string, unknown>;

      if (node.data.canvasType === "text") base.text = node.data.text ?? "";
      if (node.data.canvasType === "file") base.file = node.data.file ?? "";
      if (node.data.canvasType === "link") base.url = node.data.url ?? "";
      if (node.data.canvasType === "group") {
        if (node.data.label) base.label = node.data.label;
        else delete base.label;
      }

      return base;
    }),
    edges: edges.map((edge) => {
      const base = {
        ...edge.data?.original,
        id: edge.id,
        fromNode: edge.source,
        toNode: edge.target,
      } as Record<string, unknown>;

      const fromSide = handleSide(edge.sourceHandle, "source");
      const toSide = handleSide(edge.targetHandle, "target");
      if (fromSide) base.fromSide = fromSide;
      else delete base.fromSide;
      if (toSide) base.toSide = toSide;
      else delete base.toSide;

      base.fromEnd = edge.markerStart ? "arrow" : "none";
      base.toEnd = edge.markerEnd ? "arrow" : "none";

      if (typeof edge.label === "string" && edge.label) base.label = edge.label;
      else delete base.label;

      return base;
    }),
  };

  return `${JSON.stringify(payload, null, 2)}\n`;
}

function handleSide(
  handleId: string | null | undefined,
  type: "source" | "target",
): CanvasSide | undefined {
  if (!handleId?.startsWith(`${type}-`)) return undefined;
  const side = handleId.slice(type.length + 1);
  return isCanvasSide(side) ? side : undefined;
}

function dimension(
  primary: number | undefined,
  measured: number | undefined,
  fallback: number,
): number {
  return primary ?? measured ?? fallback;
}

function isCanvasSide(value: unknown): value is CanvasSide {
  return value === "top" || value === "right" || value === "bottom" || value === "left";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function createId(): string {
  return crypto.randomUUID().replaceAll("-", "").slice(0, 16);
}

function CanvasMessage({
  title,
  body,
}: {
  readonly title: string;
  readonly body: string;
}) {
  return (
    <section className="canvas-plugin-view canvas-plugin-message">
      <strong>{title}</strong>
      <p>{body}</p>
    </section>
  );
}
