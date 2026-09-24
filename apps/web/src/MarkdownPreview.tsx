import type { ReactNode } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { KnowledgeEdge } from "@mind-context/knowledge";

export function MarkdownPreview({
  content,
  outgoingLinks,
  onOpenNote,
}: {
  readonly content: string;
  readonly outgoingLinks: readonly KnowledgeEdge[];
  readonly onOpenNote: (noteId: string) => void;
}) {
  const resolveWiki = (rawTarget: string) =>
    resolveEdge(rawTarget, "wikilink", outgoingLinks);

  return (
    <article className="markdown-preview" aria-label="Reading view">
      <Markdown
        remarkPlugins={[remarkGfm, [remarkWikilinks, { resolveWiki }]]}
        components={{
          a({ href, children }) {
            const noteId = resolveHref(href, outgoingLinks);
            if (noteId) {
              return (
                <button
                  type="button"
                  className="preview-internal-link"
                  onClick={() => onOpenNote(noteId)}
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
        {stripFrontmatter(content)}
      </Markdown>
    </article>
  );
}

function resolveHref(
  href: string | undefined,
  edges: readonly KnowledgeEdge[],
): string | undefined {
  if (!href) return undefined;

  if (href.startsWith("mindcontext-note:")) {
    return href.slice("mindcontext-note:".length);
  }

  if (/^[a-z]+:/i.test(href)) return undefined;
  return resolveEdge(decodeURIComponent(href), "markdown", edges);
}

function resolveEdge(
  rawTarget: string,
  syntax: KnowledgeEdge["syntax"],
  edges: readonly KnowledgeEdge[],
): string | undefined {
  const hashIndex = rawTarget.indexOf("#");
  const target = hashIndex >= 0 ? rawTarget.slice(0, hashIndex) : rawTarget;
  const fragment = hashIndex >= 0 ? rawTarget.slice(hashIndex + 1) : undefined;

  const edge = edges.find((candidate) => {
    if (
      candidate.syntax !== syntax ||
      candidate.resolution !== "resolved" ||
      !candidate.targetNoteId
    ) {
      return false;
    }
    if (candidate.target !== target) return false;
    if (!fragment) return !candidate.heading && !candidate.blockId;
    if (fragment.startsWith("^")) return candidate.blockId === fragment.slice(1);
    return candidate.heading === fragment;
  });

  return edge?.targetNoteId;
}

interface RemarkNode {
  type: string;
  value?: string;
  children?: RemarkNode[];
  url?: string;
  data?: Record<string, unknown>;
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
    const noteId = resolveWiki(rawTarget);

    if (noteId) {
      nodes.push({
        type: "link",
        url: `mindcontext-note:${noteId}`,
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

function stripFrontmatter(content: string): string {
  return content.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, "");
}
