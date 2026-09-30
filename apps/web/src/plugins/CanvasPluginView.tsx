import type { PluginFileViewProps } from "../extensions/ExtensionHost";

interface JsonCanvasNode {
  readonly id: string;
  readonly type: "text" | "file" | "link" | "group";
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly text?: string;
  readonly file?: string;
  readonly url?: string;
  readonly label?: string;
}

interface JsonCanvasEdge {
  readonly id: string;
  readonly fromNode: string;
  readonly toNode: string;
  readonly label?: string;
}

interface JsonCanvasDocument {
  readonly nodes?: readonly JsonCanvasNode[];
  readonly edges?: readonly JsonCanvasEdge[];
}

export function CanvasPluginView({
  name,
  path,
  content,
}: PluginFileViewProps) {
  if (typeof content !== "string") {
    return <CanvasMessage title={name} body="Canvas requires text content." />;
  }

  let document: JsonCanvasDocument;
  try {
    document = JSON.parse(content) as JsonCanvasDocument;
  } catch {
    return (
      <CanvasMessage
        title={name}
        body="This .canvas file does not contain valid JSON Canvas data."
      />
    );
  }

  const nodes = Array.isArray(document.nodes) ? document.nodes : [];
  const edges = Array.isArray(document.edges) ? document.edges : [];
  if (nodes.length === 0) {
    return (
      <CanvasMessage
        title={name}
        body="This Canvas is empty. Visual editing will be added in the next Canvas slice."
      />
    );
  }

  const margin = 80;
  const minX = Math.min(...nodes.map((node) => node.x));
  const minY = Math.min(...nodes.map((node) => node.y));
  const maxX = Math.max(...nodes.map((node) => node.x + node.width));
  const maxY = Math.max(...nodes.map((node) => node.y + node.height));
  const width = Math.max(900, maxX - minX + margin * 2);
  const height = Math.max(600, maxY - minY + margin * 2);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  const position = (node: JsonCanvasNode) => ({
    x: node.x - minX + margin,
    y: node.y - minY + margin,
  });

  return (
    <section className="canvas-plugin-view" aria-label={name}>
      <header className="canvas-plugin-header">
        <div>
          <strong>{name}</strong>
          <span>{path}</span>
        </div>
        <span className="canvas-plugin-badge">Canvas plugin · preview</span>
      </header>
      <div className="canvas-plugin-scroll">
        <div
          className="canvas-plugin-board"
          style={{ width: `${width}px`, height: `${height}px` }}
        >
          <svg
            className="canvas-plugin-edges"
            width={width}
            height={height}
            aria-hidden="true"
          >
            {edges.map((edge) => {
              const from = nodeById.get(edge.fromNode);
              const to = nodeById.get(edge.toNode);
              if (!from || !to) return null;
              const fromPosition = position(from);
              const toPosition = position(to);
              return (
                <line
                  key={edge.id}
                  x1={fromPosition.x + from.width / 2}
                  y1={fromPosition.y + from.height / 2}
                  x2={toPosition.x + to.width / 2}
                  y2={toPosition.y + to.height / 2}
                />
              );
            })}
          </svg>
          {nodes.map((node) => {
            const nodePosition = position(node);
            return (
              <article
                key={node.id}
                className={`canvas-plugin-node canvas-plugin-node-${node.type}`}
                style={{
                  left: nodePosition.x,
                  top: nodePosition.y,
                  width: node.width,
                  height: node.height,
                }}
              >
                {node.type === "text" ? (
                  <pre>{node.text ?? ""}</pre>
                ) : node.type === "file" ? (
                  <>
                    <span className="canvas-plugin-node-kind">File</span>
                    <strong>{node.file ?? "File"}</strong>
                  </>
                ) : node.type === "link" ? (
                  <>
                    <span className="canvas-plugin-node-kind">Link</span>
                    <a href={node.url} target="_blank" rel="noreferrer">
                      {node.label ?? node.url ?? "Link"}
                    </a>
                  </>
                ) : (
                  <strong>{node.label ?? "Group"}</strong>
                )}
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
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
