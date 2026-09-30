export interface JsonCanvas {
  readonly nodes?: readonly JsonCanvasNode[];
  readonly edges?: readonly JsonCanvasEdge[];
  readonly [key: string]: unknown;
}

export interface JsonCanvasNode {
  readonly id: string;
  readonly type: "text" | "file" | "link" | "group" | string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly color?: string;
  readonly text?: string;
  readonly file?: string;
  readonly subpath?: string;
  readonly url?: string;
  readonly label?: string;
  readonly background?: string;
  readonly backgroundStyle?: string;
  readonly [key: string]: unknown;
}

export interface JsonCanvasEdge {
  readonly id: string;
  readonly fromNode: string;
  readonly fromSide?: "top" | "right" | "bottom" | "left" | string;
  readonly fromEnd?: "none" | "arrow" | string;
  readonly toNode: string;
  readonly toSide?: "top" | "right" | "bottom" | "left" | string;
  readonly toEnd?: "none" | "arrow" | string;
  readonly color?: string;
  readonly label?: string;
  readonly [key: string]: unknown;
}

export type JsonCanvasParseResult =
  | { readonly ok: true; readonly canvas: JsonCanvas }
  | { readonly ok: false; readonly error: string };

export function parseJsonCanvas(value: string): JsonCanvasParseResult {
  try {
    const parsed = JSON.parse(value || "{}") as unknown;
    if (!isRecord(parsed)) {
      return { ok: false, error: "The top level must be a JSON object." };
    }
    if (parsed.nodes !== undefined && !Array.isArray(parsed.nodes)) {
      return { ok: false, error: "nodes must be an array." };
    }
    if (parsed.edges !== undefined && !Array.isArray(parsed.edges)) {
      return { ok: false, error: "edges must be an array." };
    }

    const nodes = (parsed.nodes ?? []) as readonly unknown[];
    for (const node of nodes) {
      if (!isRecord(node)) {
        return { ok: false, error: "Every canvas node must be an object." };
      }
      if (
        typeof node.id !== "string" ||
        typeof node.type !== "string" ||
        !isFiniteNumber(node.x) ||
        !isFiniteNumber(node.y) ||
        !isFiniteNumber(node.width) ||
        !isFiniteNumber(node.height)
      ) {
        return {
          ok: false,
          error:
            "Every canvas node requires id, type, x, y, width and height.",
        };
      }
    }

    const edges = (parsed.edges ?? []) as readonly unknown[];
    for (const edge of edges) {
      if (
        !isRecord(edge) ||
        typeof edge.id !== "string" ||
        typeof edge.fromNode !== "string" ||
        typeof edge.toNode !== "string"
      ) {
        return {
          ok: false,
          error: "Every canvas edge requires id, fromNode and toNode.",
        };
      }
    }

    return { ok: true, canvas: parsed as JsonCanvas };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unable to parse canvas.",
    };
  }
}

export function serializeJsonCanvas(canvas: JsonCanvas): string {
  return `${JSON.stringify(canvas, null, 2)}\n`;
}

export function updateJsonCanvasNode(
  canvas: JsonCanvas,
  nodeId: string,
  patch: Partial<JsonCanvasNode>,
): JsonCanvas {
  return {
    ...canvas,
    nodes: (canvas.nodes ?? []).map((node) =>
      node.id === nodeId ? { ...node, ...patch } : node,
    ),
  };
}

export function appendJsonCanvasTextNode(
  canvas: JsonCanvas,
  node: {
    readonly id: string;
    readonly x: number;
    readonly y: number;
    readonly width?: number;
    readonly height?: number;
    readonly text?: string;
  },
): JsonCanvas {
  const next: JsonCanvasNode = {
    id: node.id,
    type: "text",
    x: node.x,
    y: node.y,
    width: node.width ?? 280,
    height: node.height ?? 160,
    text: node.text ?? "",
  };
  return {
    ...canvas,
    nodes: [...(canvas.nodes ?? []), next],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
