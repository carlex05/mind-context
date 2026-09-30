import { useEffect, useMemo, useRef, useState } from "react";
import {
  Excalidraw,
  exportToSvg,
  serializeAsJSON,
} from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import type { ExcalidrawInitialDataState } from "@excalidraw/excalidraw/types";
import { useTranslation } from "react-i18next";

import type {
  PluginFileViewProps,
  PluginMarkdownEmbedProps,
} from "../extensions/ExtensionHost";

interface ExcalidrawDocument {
  readonly type: "excalidraw";
  readonly version: number;
  readonly source?: string;
  readonly elements: readonly unknown[];
  readonly appState: Record<string, unknown>;
  readonly files?: Record<string, unknown>;
}

export function ExcalidrawPluginView({
  name,
  path,
  content,
  syncState = "synced",
  onTextChange,
}: PluginFileViewProps) {
  const { t } = useTranslation();
  const readyRef = useRef(false);
  const lastSerializedRef = useRef(
    typeof content === "string" ? content.trimEnd() : "",
  );
  const document = useMemo(
    () => (typeof content === "string" ? parseExcalidraw(content) : undefined),
    [content],
  );

  if (typeof content !== "string") {
    return (
      <ExcalidrawMessage
        title={name}
        body={t("excalidraw.requiresText")}
      />
    );
  }

  if (!document) {
    return (
      <ExcalidrawMessage
        title={name}
        body={t("excalidraw.invalid")}
      />
    );
  }

  const initialData = toInitialData(document);

  return (
    <section className="excalidraw-plugin-view" aria-label={name}>
      <header className="excalidraw-plugin-header">
        <div>
          <strong>{name}</strong>
          <span>{path}</span>
        </div>
        <span
          className={`excalidraw-plugin-sync excalidraw-plugin-sync-${syncState}`}
        >
          {t(`canvas.sync.${syncState}`)}
        </span>
      </header>
      <div className="excalidraw-plugin-editor">
        <Excalidraw
          initialData={initialData}
          onInitialize={() => {
            readyRef.current = true;
          }}
          onChange={(elements, appState, files) => {
            if (!readyRef.current || !onTextChange) return;
            const serialized = serializeAsJSON(
              elements,
              appState,
              files,
              "local",
            ).trimEnd();
            if (serialized === lastSerializedRef.current) return;
            lastSerializedRef.current = serialized;
            onTextChange(`${serialized}\n`);
          }}
        />
      </div>
    </section>
  );
}

export function ExcalidrawMarkdownEmbed({
  name,
  path,
  content,
  onOpen,
}: PluginMarkdownEmbedProps) {
  const { t } = useTranslation();
  const document = useMemo(() => parseExcalidraw(content), [content]);
  const containerRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let disposed = false;
    const container = containerRef.current;
    if (!container || !document) return;

    setFailed(false);
    container.replaceChildren();

    void exportToSvg({
      elements: document.elements,
      appState: {
        ...document.appState,
        exportBackground: true,
        exportWithDarkMode: false,
        viewBackgroundColor:
          typeof document.appState.viewBackgroundColor === "string"
            ? document.appState.viewBackgroundColor
            : "#ffffff",
      },
      files: document.files ?? {},
    } as unknown as Parameters<typeof exportToSvg>[0])
      .then((svg) => {
        if (disposed) return;
        svg.setAttribute("role", "img");
        svg.setAttribute("aria-label", name);
        svg.classList.add("excalidraw-embed-svg");
        container.replaceChildren(svg);
      })
      .catch(() => {
        if (!disposed) setFailed(true);
      });

    return () => {
      disposed = true;
      container.replaceChildren();
    };
  }, [content, document, name]);

  if (!document || failed) {
    return (
      <button
        type="button"
        className="excalidraw-embed-fallback"
        onClick={onOpen}
      >
        {t("excalidraw.openDrawing", { name })}
      </button>
    );
  }

  return (
    <figure className="excalidraw-markdown-embed">
      <div ref={containerRef} className="excalidraw-embed-surface" />
      <figcaption>
        <button type="button" onClick={onOpen}>
          {t("excalidraw.openDrawing", { name })}
        </button>
        <span>{path}</span>
      </figcaption>
    </figure>
  );
}

function parseExcalidraw(content: string): ExcalidrawDocument | undefined {
  try {
    const value = JSON.parse(content) as Record<string, unknown>;
    if (
      value.type !== "excalidraw" ||
      typeof value.version !== "number" ||
      !Array.isArray(value.elements) ||
      !isRecord(value.appState)
    ) {
      return undefined;
    }

    return {
      type: "excalidraw",
      version: value.version,
      ...(typeof value.source === "string" ? { source: value.source } : {}),
      elements: value.elements,
      appState: value.appState,
      ...(isRecord(value.files) ? { files: value.files } : {}),
    };
  } catch {
    return undefined;
  }
}

function toInitialData(
  document: ExcalidrawDocument,
): ExcalidrawInitialDataState {
  return {
    elements: document.elements,
    appState: document.appState,
    files: document.files ?? {},
    scrollToContent: true,
  } as unknown as ExcalidrawInitialDataState;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function ExcalidrawMessage({
  title,
  body,
}: {
  readonly title: string;
  readonly body: string;
}) {
  return (
    <section className="excalidraw-plugin-message">
      <strong>{title}</strong>
      <p>{body}</p>
    </section>
  );
}
