import { isValidElement, useEffect, useRef } from "react";
import Markdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import "katex/dist/katex.min.css";
import type { KnowledgeEdge } from "@mind-context/knowledge";
import {
  normalizeMarkdownHeading,
  prepareObsidianMarkdownForReading,
  remarkObsidianBase,
  type MarkdownNavigationTarget,
} from "@mind-context/markdown";
import { useTranslation } from "react-i18next";
import { MermaidDiagram } from "./MermaidDiagram";

export interface InternalMarkdownNavigationTarget
  extends MarkdownNavigationTarget {
  readonly noteId: string;
}

export function MarkdownPreview({
  content,
  outgoingLinks,
  navigationTarget,
  navigationKey = 0,
  onOpenNote,
}: {
  readonly content: string;
  readonly outgoingLinks: readonly KnowledgeEdge[];
  readonly navigationTarget?: MarkdownNavigationTarget | undefined;
  readonly navigationKey?: number | undefined;
  readonly onOpenNote: (target: InternalMarkdownNavigationTarget) => void;
}) {
  const { t } = useTranslation();
  const articleRef = useRef<HTMLElement>(null);
  const resolveWiki = (rawTarget: string) => {
    const edge = resolveEdge(rawTarget, "wikilink", outgoingLinks);
    return edge?.targetNoteId ? navigationHref(edge) : undefined;
  };

  useEffect(() => {
    if (!navigationTarget || !articleRef.current) return;

    const root = articleRef.current;
    const target = navigationTarget.blockId
      ? [...root.querySelectorAll<HTMLElement>("[data-block-id]")].find(
          (element) =>
            element.dataset.blockId === navigationTarget.blockId,
        )
      : navigationTarget.heading
        ? [...root.querySelectorAll<HTMLElement>("[data-heading-key]")].find(
            (element) =>
              element.dataset.headingKey ===
              normalizeMarkdownHeading(
                navigationTarget.heading!
                  .split("#")
                  .filter(Boolean)
                  .at(-1) ?? navigationTarget.heading!,
              ),
          )
        : undefined;

    if (!target) return;

    target.scrollIntoView({ block: "center", behavior: "smooth" });
    target.classList.add("markdown-navigation-target");
    const timer = window.setTimeout(() => {
      target.classList.remove("markdown-navigation-target");
    }, 1800);
    return () => window.clearTimeout(timer);
  }, [
    navigationKey,
    navigationTarget?.heading,
    navigationTarget?.blockId,
  ]);

  return (
    <article
      ref={articleRef}
      className="markdown-preview"
      aria-label={t("editor.readingAria")}
    >
      <Markdown
        remarkPlugins={[
          remarkGfm,
          remarkMath,
          remarkObsidianBase,
          [remarkWikilinks, { resolveWiki }],
        ]}
        rehypePlugins={[
          rehypeKatex,
          [
            rehypeHighlight,
            {
              detect: false,
              plainText: ["math", "mermaid"],
            },
          ],
        ]}
        components={{
          pre({ node: _node, children, ...props }) {
            if (isValidElement(children)) {
              const childProps = children.props as {
                readonly className?: string;
                readonly children?: unknown;
              };
              if (childProps.className?.split(/\s+/).includes("language-mermaid")) {
                const source = String(childProps.children ?? "").replace(/\n$/, "");
                return <MermaidDiagram source={source} />;
              }
            }

            return <pre {...props}>{children}</pre>;
          },
          a({ href, children }) {
            const target = resolveHref(href, outgoingLinks);
            if (target) {
              return (
                <button
                  type="button"
                  className="preview-internal-link"
                  onClick={() => onOpenNote(target)}
                >
                  {children}
                </button>
              );
            }

            return (
              <a href={href} target="_blank" rel="noreferrer">
                {children}
              </a>
            );
          },
        }}
      >
        {prepareObsidianMarkdownForReading(content)}
      </Markdown>
    </article>
  );
}

function resolveHref(
  href: string | undefined,
  edges: readonly KnowledgeEdge[],
): InternalMarkdownNavigationTarget | undefined {
  if (!href) return undefined;

  if (href.startsWith("#mindcontext-note=")) {
    return parseNavigationHref(href);
  }

  if (/^[a-z]+:/i.test(href)) return undefined;
  const edge = resolveEdge(decodeURIComponent(href), "markdown", edges);
  return edge?.targetNoteId ? navigationTarget(edge) : undefined;
}

function resolveEdge(
  rawTarget: string,
  syntax: KnowledgeEdge["syntax"],
  edges: readonly KnowledgeEdge[],
): KnowledgeEdge | undefined {
  const hashIndex = rawTarget.indexOf("#");
  const target = hashIndex >= 0 ? rawTarget.slice(0, hashIndex) : rawTarget;
  const fragment = hashIndex >= 0 ? rawTarget.slice(hashIndex + 1) : undefined;

  return edges.find((candidate) => {
    if (
      candidate.syntax !== syntax ||
      candidate.resolution !== "resolved" ||
      !candidate.targetNoteId
    ) {
      return false;
    }
    if (candidate.target !== target) return false;
    if (!fragment) return !candidate.heading && !candidate.blockId;
    if (fragment.startsWith("^")) {
      return candidate.blockId === fragment.slice(1);
    }
    return candidate.heading === fragment;
  });
}

function navigationTarget(
  edge: KnowledgeEdge,
): InternalMarkdownNavigationTarget {
  return {
    noteId: edge.targetNoteId!,
    ...(edge.heading ? { heading: edge.heading } : {}),
    ...(edge.blockId ? { blockId: edge.blockId } : {}),
  };
}

function navigationHref(edge: KnowledgeEdge): string {
  const params = new URLSearchParams({
    note: edge.targetNoteId!,
  });
  if (edge.heading) params.set("heading", edge.heading);
  if (edge.blockId) params.set("block", edge.blockId);
  return `#mindcontext-note=${params.toString()}`;
}

function parseNavigationHref(
  href: string,
): InternalMarkdownNavigationTarget | undefined {
  const raw = href.slice("#mindcontext-note=".length);
  const params = new URLSearchParams(raw);
  const noteId = params.get("note");
  if (!noteId) return undefined;

  const heading = params.get("heading")?.trim();
  const blockId = params.get("block")?.trim();

  return {
    noteId,
    ...(heading ? { heading } : {}),
    ...(blockId ? { blockId } : {}),
  };
}

interface RemarkNode {
  type: string;
  value?: string;
  children?: RemarkNode[];
  url?: string;
}

function remarkWikilinks(options: {
  readonly resolveWiki: (target: string) => string | undefined;
}) {
  return (tree: RemarkNode) => {
    transformChildren(tree, options.resolveWiki);
  };
}

function transformChildren(
  parent: RemarkNode,
  resolveWiki: (target: string) => string | undefined,
): void {
  if (!parent.children) return;

  const next: RemarkNode[] = [];
  for (const child of parent.children) {
    if (child.type === "text" && child.value) {
      next.push(...splitWikilinks(child.value, resolveWiki));
    } else {
      transformChildren(child, resolveWiki);
      next.push(child);
    }
  }
  parent.children = next;
}

function splitWikilinks(
  value: string,
  resolveWiki: (target: string) => string | undefined,
): RemarkNode[] {
  const pattern = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
  const nodes: RemarkNode[] = [];
  let cursor = 0;

  for (const match of value.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > cursor) {
      nodes.push({ type: "text", value: value.slice(cursor, index) });
    }

    const rawTarget = match[1]?.trim() ?? "";
    const label = match[2]?.trim() || rawTarget;
    const href = resolveWiki(rawTarget);

    if (href) {
      nodes.push({
        type: "link",
        url: href,
        children: [{ type: "text", value: label }],
      });
    } else {
      nodes.push({ type: "text", value: match[0] });
    }
    cursor = index + match[0].length;
  }

  if (cursor < value.length) {
    nodes.push({ type: "text", value: value.slice(cursor) });
  }

  return nodes.length > 0 ? nodes : [{ type: "text", value }];
}
