import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Background,
  BaseEdge,
  ConnectionMode,
  Controls,
  EdgeLabelRenderer,
  Handle,
  MarkerType,
  NodeResizer,
  Position,
  ReactFlow,
  applyEdgeChanges,
  applyNodeChanges,
  getBezierPath,
  type Connection,
  type Edge,
  type EdgeChange,
  type EdgeProps,
  type Node,
  type NodeChange,
  type NodeProps,
  type Viewport,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useTranslation } from "react-i18next";

import type {
  PluginFileViewProps,
  PluginWorkspaceFile,
} from "../extensions/ExtensionHost";

type CanvasNodeKind = "text" | "file" | "link" | "group";
type CanvasSide = "top" | "right" | "bottom" | "left";
type CanvasColorPreset = "1" | "2" | "3" | "4" | "5" | "6";

interface CanvasNodeData extends Record<string, unknown> {
  readonly canvasType: CanvasNodeKind;
  readonly text?: string;
  readonly file?: string;
  readonly url?: string;
  readonly label?: string;
  readonly color?: string;
  readonly original: Record<string, unknown>;
  readonly initialWidth: number;
  readonly initialHeight: number;
}

interface CanvasEdgeData extends Record<string, unknown> {
  readonly original: Record<string, unknown>;
  readonly label?: string;
  readonly color?: string;
}

type CanvasFlowNode = Node<CanvasNodeData>;
type CanvasFlowEdge = Edge<CanvasEdgeData>;

interface ParsedCanvas {
  readonly extras: Record<string, unknown>;
  readonly nodes: readonly CanvasFlowNode[];
  readonly edges: readonly CanvasFlowEdge[];
}

interface CanvasRuntime {
  readonly workspaceFiles: readonly PluginWorkspaceFile[];
  readonly patchNode: (
    id: string,
    patch: Partial<
      Pick<CanvasNodeData, "text" | "file" | "url" | "label" | "color">
    >,
  ) => void;
  readonly patchEdge: (
    id: string,
    patch: Partial<Pick<CanvasEdgeData, "label" | "color">>,
  ) => void;
  readonly openWorkspaceFile?: (path: string) => void;
}

const CanvasRuntimeContext = createContext<CanvasRuntime | undefined>(undefined);

const nodeTypes = {
  canvas: CanvasNode,
};

const edgeTypes = {
  canvas: CanvasEdge,
};

const COLOR_PRESETS: readonly CanvasColorPreset[] = [
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
];

export function CanvasPluginView({
  name,
  path,
  content,
  syncState = "synced",
  workspaceFiles = [],
  onOpenWorkspaceFile,
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
      workspaceFiles={workspaceFiles}
      {...(onOpenWorkspaceFile ? { onOpenWorkspaceFile } : {})}
      {...(onTextChange ? { onTextChange } : {})}
    />
  );
}

function CanvasEditor({
  name,
  path,
  initial,
  syncState,
  workspaceFiles,
  onOpenWorkspaceFile,
  onTextChange,
}: {
  readonly name: string;
  readonly path: string;
  readonly initial: ParsedCanvas;
  readonly syncState: NonNullable<PluginFileViewProps["syncState"]>;
  readonly workspaceFiles: readonly PluginWorkspaceFile[];
  readonly onOpenWorkspaceFile?: (path: string) => void;
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
        Pick<CanvasNodeData, "text" | "file" | "url" | "label" | "color">
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

  const patchEdge = useCallback(
    (
      id: string,
      patch: Partial<Pick<CanvasEdgeData, "label" | "color">>,
    ) => {
      setEdges((current) =>
        current.map((edge) => {
          if (edge.id !== id) return edge;
          const color = patch.color ?? edge.data?.color;
          return {
            ...edge,
            data: {
              original: edge.data?.original ?? {},
              ...edge.data,
              ...patch,
            },
            ...(edge.markerStart
              ? { markerStart: arrowMarker(color) }
              : {}),
            ...(edge.markerEnd ? { markerEnd: arrowMarker(color) } : {}),
          };
        }),
      );
    },
    [],
  );

  const runtime = useMemo<CanvasRuntime>(
    () => ({
      workspaceFiles,
      patchNode,
      patchEdge,
      ...(onOpenWorkspaceFile
        ? { openWorkspaceFile: onOpenWorkspaceFile }
        : {}),
    }),
    [workspaceFiles, patchNode, patchEdge, onOpenWorkspaceFile],
  );

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
    if (
      !connection.source ||
      !connection.target ||
      connection.source === connection.target
    ) {
      return;
    }

    const edge: CanvasFlowEdge = {
      id: createId(),
      type: "canvas",
      source: connection.source,
      target: connection.target,
      ...(connection.sourceHandle
        ? { sourceHandle: connection.sourceHandle }
        : {}),
      ...(connection.targetHandle
        ? { targetHandle: connection.targetHandle }
        : {}),
      markerEnd: arrowMarker(),
      selected: true,
      data: { original: {}, label: "" },
    };
    setEdges((current) => [
      ...current.map((candidate) => ({ ...candidate, selected: false })),
      edge,
    ]);
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
      ...(kind === "text"
        ? { text: "" }
        : kind === "file"
          ? { file: "" }
          : kind === "link"
            ? { url: "" }
            : { label: t("canvas.groupDefault") }),
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
    setEdges((current) =>
      current.map((edge) => ({ ...edge, selected: false })),
    );
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

  function applyColor(color: string | undefined) {
    setNodes((current) =>
      current.map((node) => {
        if (!node.selected) return node;
        const { color: _currentColor, ...rest } = node.data;
        const data: CanvasNodeData = color
          ? { ...rest, color }
          : rest;
        return { ...node, data };
      }),
    );
    setEdges((current) =>
      current.map((edge) => {
        if (!edge.selected) return edge;
        const {
          color: _currentColor,
          ...rest
        } = edge.data ?? { original: {} };
        const data: CanvasEdgeData = color
          ? { ...rest, original: rest.original ?? {}, color }
          : { ...rest, original: rest.original ?? {} };
        return {
          ...edge,
          data,
          ...(edge.markerStart
            ? { markerStart: arrowMarker(color) }
            : {}),
          ...(edge.markerEnd ? { markerEnd: arrowMarker(color) } : {}),
        };
      }),
    );
  }

  const hasSelection =
    nodes.some((node) => node.selected) || edges.some((edge) => edge.selected);

  return (
    <CanvasRuntimeContext.Provider value={runtime}>
      <section className="canvas-plugin-view" aria-label={name}>
        <header className="canvas-plugin-header">
          <div className="canvas-plugin-title">
            <strong>{name}</strong>
            <span>{path}</span>
          </div>
          <div className="canvas-plugin-status">
            <span
              className={`canvas-plugin-sync canvas-plugin-sync-${syncState}`}
            >
              {t(`canvas.sync.${syncState}`)}
            </span>
          </div>
        </header>

        <div
          className="canvas-plugin-toolbar"
          role="toolbar"
          aria-label={t("canvas.tools")}
        >
          <button type="button" onClick={() => addNode("text")}>
            {t("canvas.text")}
          </button>
          <button type="button" onClick={() => addNode("file")}>
            {t("canvas.file")}
          </button>
          <button type="button" onClick={() => addNode("link")}>
            {t("canvas.link")}
          </button>
          <button type="button" onClick={() => addNode("group")}>
            {t("canvas.group")}
          </button>

          <span className="canvas-plugin-toolbar-divider" />

          <div
            className="canvas-color-tools"
            aria-label={t("canvas.color")}
          >
            <button
              type="button"
              className="canvas-color-reset"
              disabled={!hasSelection}
              title={t("canvas.colorDefault")}
              aria-label={t("canvas.colorDefault")}
              onClick={() => applyColor(undefined)}
            >
              ×
            </button>
            {COLOR_PRESETS.map((color) => (
              <button
                key={color}
                type="button"
                className="canvas-color-swatch"
                data-canvas-color={color}
                disabled={!hasSelection}
                title={t(`canvas.colors.${color}`)}
                aria-label={t(`canvas.colors.${color}`)}
                onClick={() => applyColor(color)}
              />
            ))}
          </div>

          <span className="canvas-plugin-toolbar-spacer" />
          <span className="canvas-connect-hint">
            {t("canvas.connectHint")}
          </span>
          <button
            type="button"
            disabled={!hasSelection}
            onClick={removeSelection}
          >
            {t("canvas.delete")}
          </button>
        </div>

        <div ref={boardRef} className="canvas-plugin-board">
          <ReactFlow<CanvasFlowNode, CanvasFlowEdge>
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onMove={(_, nextViewport) => setViewport(nextViewport)}
            connectionMode={ConnectionMode.Loose}
            connectionRadius={28}
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
    </CanvasRuntimeContext.Provider>
  );
}

function CanvasNode({
  id,
  data,
  selected,
}: NodeProps<CanvasFlowNode>) {
  const { t } = useTranslation();
  const runtime = useCanvasRuntime();
  const [editingText, setEditingText] = useState(false);
  const kind = data.canvasType;
  const style = canvasNodeStyle(data.color, kind);

  useEffect(() => {
    if (!selected) setEditingText(false);
  }, [selected]);

  return (
    <div
      className={`canvas-flow-node canvas-flow-node-${kind}`}
      style={style}
    >
      <NodeResizer
        isVisible={selected}
        minWidth={120}
        minHeight={70}
      />
      <CanvasHandles />

      {kind === "text" ? (
        editingText ? (
          <textarea
            autoFocus
            className="canvas-text-editor nodrag nopan"
            value={data.text ?? ""}
            placeholder={t("canvas.markdownPlaceholder")}
            onBlur={() => setEditingText(false)}
            onChange={(event) =>
              runtime.patchNode(id, { text: event.target.value })
            }
          />
        ) : (
          <div
            className="canvas-text-preview nodrag nopan"
            onDoubleClick={() => setEditingText(true)}
          >
            {(data.text ?? "").trim() ? (
              <Markdown
                remarkPlugins={[remarkGfm]}
                components={{
                  a: ({ href, children, ...props }) => (
                    <a
                      {...props}
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {children}
                    </a>
                  ),
                }}
              >
                {data.text ?? ""}
              </Markdown>
            ) : (
              <span className="canvas-empty-text">
                {t("canvas.doubleClickText")}
              </span>
            )}
            {selected ? (
              <button
                type="button"
                className="canvas-inline-action nodrag nopan"
                onClick={() => setEditingText(true)}
              >
                {t("canvas.edit")}
              </button>
            ) : null}
          </div>
        )
      ) : kind === "file" ? (
        <CanvasFileNode
          id={id}
          file={data.file ?? ""}
        />
      ) : kind === "link" ? (
        <CanvasLinkNode
          id={id}
          url={data.url ?? ""}
        />
      ) : (
        <input
          className="canvas-flow-group-label nodrag nopan"
          value={data.label ?? ""}
          placeholder={t("canvas.group")}
          onChange={(event) =>
            runtime.patchNode(id, { label: event.target.value })
          }
        />
      )}
    </div>
  );
}

function CanvasFileNode({
  id,
  file,
}: {
  readonly id: string;
  readonly file: string;
}) {
  const { t } = useTranslation();
  const runtime = useCanvasRuntime();
  const known = runtime.workspaceFiles.some(
    (candidate) => candidate.path === file,
  );

  return (
    <div className="canvas-file-node">
      <span className="canvas-flow-node-kind">{t("canvas.file")}</span>
      <select
        className="nodrag nopan"
        value={file}
        aria-label={t("canvas.chooseFile")}
        onChange={(event) =>
          runtime.patchNode(id, { file: event.target.value })
        }
      >
        <option value="">{t("canvas.chooseFile")}</option>
        {file && !known ? <option value={file}>{file}</option> : null}
        {runtime.workspaceFiles.map((candidate) => (
          <option key={candidate.id} value={candidate.path}>
            {candidate.path}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="canvas-node-open nodrag nopan"
        disabled={!file || !runtime.openWorkspaceFile}
        onClick={() => runtime.openWorkspaceFile?.(file)}
      >
        {t("canvas.openFile")}
      </button>
    </div>
  );
}

function CanvasLinkNode({
  id,
  url,
}: {
  readonly id: string;
  readonly url: string;
}) {
  const { t } = useTranslation();
  const runtime = useCanvasRuntime();

  return (
    <div className="canvas-link-node">
      <span className="canvas-flow-node-kind">{t("canvas.link")}</span>
      <input
        className="nodrag nopan"
        value={url}
        placeholder="https://…"
        onChange={(event) =>
          runtime.patchNode(id, { url: event.target.value })
        }
      />
      <button
        type="button"
        className="canvas-node-open nodrag nopan"
        disabled={!isSafeExternalUrl(url)}
        onClick={() => openExternalUrl(url)}
      >
        {t("canvas.openLink")}
      </button>
    </div>
  );
}

function CanvasHandles() {
  return (
    <>
      <Handle id="top" type="source" position={Position.Top} />
      <Handle id="right" type="source" position={Position.Right} />
      <Handle id="bottom" type="source" position={Position.Bottom} />
      <Handle id="left" type="source" position={Position.Left} />
    </>
  );
}

function CanvasEdge({
  id,
  data,
  selected,
  markerStart,
  markerEnd,
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
}: EdgeProps<CanvasFlowEdge>) {
  const { t } = useTranslation();
  const runtime = useCanvasRuntime();
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });
  const color = resolveCanvasColor(data?.color);

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        interactionWidth={28}
        {...(markerStart ? { markerStart } : {})}
        {...(markerEnd ? { markerEnd } : {})}
        {...(color ? { style: { stroke: color } } : {})}
      />
      <EdgeLabelRenderer>
        <div
          className={`canvas-edge-label nodrag nopan${selected ? " is-selected" : ""}`}
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: "all",
          }}
        >
          {selected ? (
            <input
              value={data?.label ?? ""}
              aria-label={t("canvas.edgeLabel")}
              placeholder={t("canvas.edgeLabel")}
              onChange={(event) =>
                runtime.patchEdge(id, { label: event.target.value })
              }
            />
          ) : data?.label ? (
            <span>{data.label}</span>
          ) : null}
        </div>
      </EdgeLabelRenderer>
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
        ...(typeof value.color === "string" ? { color: value.color } : {}),
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
      const color = typeof value.color === "string" ? value.color : undefined;
      return [{
        id: value.id,
        type: "canvas",
        source: value.fromNode,
        target: value.toNode,
        ...(fromSide ? { sourceHandle: fromSide } : {}),
        ...(toSide ? { targetHandle: toSide } : {}),
        ...(value.toEnd !== "none"
          ? { markerEnd: arrowMarker(color) }
          : {}),
        ...(value.fromEnd === "arrow"
          ? { markerStart: arrowMarker(color) }
          : {}),
        data: {
          original: { ...value },
          ...(typeof value.label === "string" ? { label: value.label } : {}),
          ...(color ? { color } : {}),
        },
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
      const width = dimension(
        node.width,
        node.measured?.width,
        node.data.initialWidth,
      );
      const height = dimension(
        node.height,
        node.measured?.height,
        node.data.initialHeight,
      );
      const base = {
        ...node.data.original,
        id: node.id,
        type: node.data.canvasType,
        x: Math.round(node.position.x),
        y: Math.round(node.position.y),
        width: Math.round(width),
        height: Math.round(height),
      } as Record<string, unknown>;

      if (node.data.color) base.color = node.data.color;
      else delete base.color;

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

      const fromSide = handleSide(edge.sourceHandle);
      const toSide = handleSide(edge.targetHandle);
      if (fromSide) base.fromSide = fromSide;
      else delete base.fromSide;
      if (toSide) base.toSide = toSide;
      else delete base.toSide;

      base.fromEnd = edge.markerStart ? "arrow" : "none";
      base.toEnd = edge.markerEnd ? "arrow" : "none";

      if (edge.data?.label) base.label = edge.data.label;
      else delete base.label;
      if (edge.data?.color) base.color = edge.data.color;
      else delete base.color;

      return base;
    }),
  };

  return `${JSON.stringify(payload, null, 2)}\n`;
}

function useCanvasRuntime(): CanvasRuntime {
  const context = useContext(CanvasRuntimeContext);
  if (!context) {
    throw new Error("Canvas runtime is unavailable.");
  }
  return context;
}

function canvasNodeStyle(
  color: string | undefined,
  kind: CanvasNodeKind,
): CSSProperties | undefined {
  const resolved = resolveCanvasColor(color);
  if (!resolved) return undefined;

  return {
    borderColor: resolved,
    background:
      kind === "group"
        ? `color-mix(in srgb, ${resolved} 7%, transparent)`
        : `color-mix(in srgb, ${resolved} 10%, var(--surface))`,
  };
}

function resolveCanvasColor(color: string | undefined): string | undefined {
  if (!color) return undefined;
  if (/^#[0-9a-f]{6}$/i.test(color)) return color;

  const preset = color as CanvasColorPreset;
  return COLOR_PRESETS.includes(preset)
    ? `var(--canvas-color-${preset})`
    : undefined;
}

function arrowMarker(color?: string) {
  const resolved = resolveCanvasColor(color);
  return {
    type: MarkerType.ArrowClosed,
    ...(resolved ? { color: resolved } : {}),
  };
}

function handleSide(handleId: string | null | undefined): CanvasSide | undefined {
  return isCanvasSide(handleId) ? handleId : undefined;
}

function dimension(
  primary: number | undefined,
  measured: number | undefined,
  fallback: number,
): number {
  return primary ?? measured ?? fallback;
}

function isCanvasSide(value: unknown): value is CanvasSide {
  return (
    value === "top" ||
    value === "right" ||
    value === "bottom" ||
    value === "left"
  );
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

function isSafeExternalUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function openExternalUrl(value: string) {
  if (!isSafeExternalUrl(value)) return;
  window.open(value, "_blank", "noopener,noreferrer");
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
