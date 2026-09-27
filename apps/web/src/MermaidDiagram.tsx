import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

type DiagramState =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly svg: string }
  | { readonly kind: "error" };

export function MermaidDiagram({ source }: { readonly source: string }) {
  const { t } = useTranslation();
  const reactId = useId();
  const diagramId = useMemo(
    () => `mindcontext-mermaid-${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}`,
    [reactId],
  );
  const [theme, setTheme] = useState<"light" | "dark">(() =>
    document.documentElement.dataset.theme === "dark" ? "dark" : "light",
  );
  const [state, setState] = useState<DiagramState>({ kind: "loading" });
  const renderSequenceRef = useRef(0);

  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() => {
      setTheme(root.dataset.theme === "dark" ? "dark" : "light");
    });
    observer.observe(root, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    renderSequenceRef.current += 1;
    const sequence = renderSequenceRef.current;
    setState({ kind: "loading" });

    void import("mermaid")
      .then(async ({ default: mermaid }) => {
        if (cancelled || sequence !== renderSequenceRef.current) return;

        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          suppressErrorRendering: true,
          theme: theme === "dark" ? "dark" : "neutral",
          flowchart: {
            htmlLabels: false,
            useMaxWidth: true,
          },
        });

        const result = await mermaid.render(
          `${diagramId}-${sequence}`,
          source,
        );
        if (cancelled || sequence !== renderSequenceRef.current) return;
        setState({ kind: "ready", svg: result.svg });
      })
      .catch(() => {
        if (!cancelled && sequence === renderSequenceRef.current) {
          setState({ kind: "error" });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [diagramId, source, theme]);

  return (
    <figure
      className="mermaid-diagram"
      aria-label={t("markdown.mermaidDiagram")}
      data-mermaid-state={state.kind}
    >
      {state.kind === "ready" ? (
        <div
          className="mermaid-diagram-svg"
          // Mermaid renders locally with securityLevel=strict. The SVG is a
          // disposable Reading View projection and is never written to Drive.
          dangerouslySetInnerHTML={{ __html: state.svg }}
        />
      ) : state.kind === "error" ? (
        <>
          <figcaption>{t("markdown.mermaidError")}</figcaption>
          <pre className="mermaid-source-fallback">
            <code>{source}</code>
          </pre>
        </>
      ) : (
        <div className="mermaid-loading" aria-hidden="true">
          <span className="drive-loading-spinner" />
        </div>
      )}
    </figure>
  );
}
