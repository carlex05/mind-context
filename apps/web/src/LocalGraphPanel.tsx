import { useEffect, useMemo, useRef } from "react";
import {
  getLocalGraph,
  type KnowledgeIndexSnapshot,
  type LocalGraphDirection,
} from "@mind-context/knowledge";
import { useTranslation } from "react-i18next";

export function LocalGraphPanel({
  index,
  activeNoteId,
  onOpenNote,
}: {
  readonly index: KnowledgeIndexSnapshot | undefined;
  readonly activeNoteId: string | undefined;
  readonly onOpenNote: (noteId: string) => void;
}) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const graph = useMemo(
    () =>
      activeNoteId
        ? getLocalGraph(index, activeNoteId)
        : undefined,
    [index, activeNoteId],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !graph || graph.nodes.length === 0) return;

    let destroyed = false;
    let instance: { destroy(): void } | undefined;

    void import("cytoscape").then(({ default: cytoscape }) => {
      if (destroyed) return;

      const computed = getComputedStyle(document.documentElement);
      const ink = computed.getPropertyValue("--ink").trim() || "#222";
      const muted =
        computed.getPropertyValue("--ink-muted").trim() || "#777";
      const surface =
        computed.getPropertyValue("--surface").trim() || "#fff";
      const border =
        computed.getPropertyValue("--border").trim() || "#ccc";
      const subtle =
        computed.getPropertyValue("--subtle").trim() || "#eee";

      const cy = cytoscape({
        container,
        elements: [
          ...graph.nodes.map((node) => ({
            data: {
              id: node.noteId,
              label: node.title,
              direction: node.direction,
            },
            classes: node.direction,
          })),
          ...graph.edges.map((edge, indexNumber) => ({
            data: {
              id: `edge-${indexNumber}-${edge.sourceNoteId}-${edge.targetNoteId}`,
              source: edge.sourceNoteId,
              target: edge.targetNoteId,
            },
          })),
        ],
        style: [
          {
            selector: "node",
            style: {
              "background-color": surface,
              "border-color": border,
              "border-width": "1.5px",
              color: ink,
              label: "data(label)",
              "font-size": "10px",
              "text-wrap": "ellipsis",
              "text-max-width": "86px",
              "text-valign": "bottom",
              "text-margin-y": 6,
              width: "24px",
              height: "24px",
            },
          },
          {
            selector: "node.center",
            style: {
              "background-color": ink,
              "border-color": ink,
              color: ink,
              width: "34px",
              height: "34px",
              "font-weight": 700,
            },
          },
          {
            selector: "node.both",
            style: {
              "background-color": subtle,
              "border-width": "2px",
            },
          },
          {
            selector: "edge",
            style: {
              width: "1.2px",
              "line-color": muted,
              "target-arrow-color": muted,
              "target-arrow-shape": "triangle",
              "curve-style": "bezier",
              opacity: 0.65,
            },
          },
        ],
        layout: {
          name: graph.nodes.length <= 2 ? "grid" : "cose",
          animate: false,
          fit: true,
          padding: 24,
        },
        minZoom: 0.35,
        maxZoom: 2.5,
        wheelSensitivity: 0.25,
      });

      cy.on("tap", "node", (event) => {
        const noteId = event.target.id();
        if (noteId) onOpenNote(noteId);
      });

      instance = cy;
    });

    return () => {
      destroyed = true;
      instance?.destroy();
    };
  }, [graph, onOpenNote]);

  if (!activeNoteId) {
    return (
      <div className="graph-empty">
        <strong>{t("graph.local")}</strong>
        <p>{t("graph.openNoteHint")}</p>
      </div>
    );
  }

  if (!graph) {
    return (
      <div className="graph-empty">
        <strong>{t("graph.unavailable")}</strong>
        <p>{t("graph.missingActive")}</p>
      </div>
    );
  }

  const neighbors = graph.nodes.filter(
    (node) => node.direction !== "center",
  );

  return (
    <section className="local-graph-panel" aria-label={t("graph.local")}>
      <div
        ref={containerRef}
        className="local-graph-canvas"
        aria-hidden="true"
      />
      <div className="local-graph-meta">
        <span>{t("graph.connected", { count: neighbors.length })}</span>
      </div>

      {neighbors.length > 0 ? (
        <div className="local-graph-connections">
          {neighbors.map((node) => (
            <button
              type="button"
              key={node.noteId}
              onClick={() => onOpenNote(node.noteId)}
            >
              <span>{node.title}</span>
              <small>{directionLabel(node.direction, t)}</small>
            </button>
          ))}
        </div>
      ) : (
        <p className="sidebar-help">{t("graph.noConnections")}</p>
      )}
    </section>
  );
}

function directionLabel(
  direction: LocalGraphDirection,
  t: (key: string) => string,
): string {
  switch (direction) {
    case "outgoing":
      return t("graph.outgoing");
    case "backlink":
      return t("graph.backlink");
    case "both":
      return t("graph.both");
    case "center":
      return t("graph.current");
  }
}
