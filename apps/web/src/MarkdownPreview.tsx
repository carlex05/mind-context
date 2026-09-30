import {
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import Markdown from "react-markdown";
import rehypeMathjax from "rehype-mathjax";
import rehypePrism from "rehype-prism-plus";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import type { KnowledgeEdge } from "@mind-context/knowledge";
import type { StorageProvider } from "@mind-context/storage";
import {
  normalizeMarkdownHeading,
  prepareObsidianMarkdownForReading,
  remarkObsidianBase,
  type MarkdownNavigationTarget,
} from "@mind-context/markdown";
import { useTranslation } from "react-i18next";
import { MermaidDiagram } from "./MermaidDiagram";
import type { PluginMarkdownEmbedProps } from "./extensions/ExtensionHost";
import {
  inferMediaType,
  isImageFile,
  isMarkdownFile,
  resolveWorkspaceFile,
  type WorkspaceTreeNode,
} from "./workspaceTree";

export interface InternalMarkdownNavigationTarget
  extends MarkdownNavigationTarget {
  readonly noteId: string;
}

export function MarkdownPreview({
  content,
  provider,
  tree,
  currentNotePath,
  outgoingLinks,
  navigationTarget,
  navigationKey = 0,
  resolvePluginEmbed,
  onOpenWorkspaceFile,
  onOpenNote,
}: {
  readonly content: string;
  readonly provider: StorageProvider;
  readonly tree: readonly WorkspaceTreeNode[];
  readonly currentNotePath: string;
  readonly outgoingLinks: readonly KnowledgeEdge[];
  readonly navigationTarget?: MarkdownNavigationTarget | undefined;
  readonly navigationKey?: number | undefined;
  readonly resolvePluginEmbed?: (
    fileName: string,
  ) => ComponentType<PluginMarkdownEmbedProps> | undefined;
  readonly onOpenWorkspaceFile?: (path: string) => void;
  readonly onOpenNote: (target: InternalMarkdownNavigationTarget) => void;
}) {
  const { t } = useTranslation();
  const articleRef = useRef<HTMLElement>(null);
  const resolveWiki = (rawTarget: string) => {
    const edge = resolveEdge(rawTarget, "wikilink", outgoingLinks);
    return edge?.targetNoteId ? navigationHref(edge) : undefined;
  };
  const resolveWikiAsset = (
    rawTarget: string,
  ): ResolvedWikiAsset | undefined => {
    const node = resolveWorkspaceFile(
      tree,
      currentNotePath,
      rawTarget,
      "wikilink",
    );
    if (!node || isMarkdownFile(node.metadata)) return undefined;
    return {
      href: wikiAssetHref(rawTarget),
      image: isImageFile(node.metadata),
      pluginEmbed: resolvePluginEmbed?.(node.metadata.name) !== undefined,
    };
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
          [remarkWikilinks, { resolveWiki, resolveWikiAsset }],
        ]}
        rehypePlugins={[
          rehypeMathjax,
          rehypeMermaidBlocks,
          [rehypePrism, { ignoreMissing: true }],
        ]}
        components={{
          div({ node: _node, className, children, ...props }) {
            const source = (
              props as Readonly<Record<string, unknown>>
            )["data-mermaid-source"];
            if (
              className?.split(/\s+/).includes("mindcontext-mermaid-source") &&
              typeof source === "string"
            ) {
              return <MermaidDiagram source={source} />;
            }

            return (
              <div className={className} {...props}>
                {children}
              </div>
            );
          },
          img({ node: _node, src, alt, ...props }) {
            const attachment = resolvePreviewAttachment(
              src,
              tree,
              currentNotePath,
            );
            if (attachment) {
              return (
                <VaultImage
                  provider={provider}
                  node={attachment}
                  alt={alt ?? attachment.metadata.name}
                />
              );
            }

            return <img src={src} alt={alt ?? ""} {...props} />;
          },
          a({ href, children }) {
            const pluginTarget = parsePluginEmbedHref(href);
            if (pluginTarget && resolvePluginEmbed) {
              const node = resolveWorkspaceFile(
                tree,
                currentNotePath,
                pluginTarget,
                "wikilink",
              );
              const Embed = node
                ? resolvePluginEmbed(node.metadata.name)
                : undefined;
              if (node && Embed) {
                return (
                  <VaultPluginEmbed
                    provider={provider}
                    node={node}
                    component={Embed}
                    {...(onOpenWorkspaceFile
                      ? { onOpenWorkspaceFile }
                      : {})}
                  />
                );
              }
            }

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

            const attachment = resolvePreviewAttachment(
              href,
              tree,
              currentNotePath,
            );
            if (attachment) {
              return (
                <VaultAttachmentLink provider={provider} node={attachment}>
                  {children}
                </VaultAttachmentLink>
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

const WIKI_ASSET_PREFIX = "#mindcontext-asset=";
const PLUGIN_EMBED_PREFIX = "#mindcontext-plugin-embed=";

interface ResolvedWikiAsset {
  readonly href: string;
  readonly image: boolean;
  readonly pluginEmbed: boolean;
}

function wikiAssetHref(target: string): string {
  return `${WIKI_ASSET_PREFIX}${encodeURIComponent(target)}`;
}

function parseWikiAssetHref(href: string): string | undefined {
  if (!href.startsWith(WIKI_ASSET_PREFIX)) return undefined;
  const encoded = href.slice(WIKI_ASSET_PREFIX.length);
  try {
    return decodeURIComponent(encoded);
  } catch {
    return encoded;
  }
}

function pluginEmbedHref(target: string): string {
  return `${PLUGIN_EMBED_PREFIX}${encodeURIComponent(target)}`;
}

function parsePluginEmbedHref(href: string | undefined): string | undefined {
  if (!href?.startsWith(PLUGIN_EMBED_PREFIX)) return undefined;
  const encoded = href.slice(PLUGIN_EMBED_PREFIX.length);
  try {
    return decodeURIComponent(encoded);
  } catch {
    return encoded;
  }
}

function resolvePreviewAttachment(
  href: string | undefined,
  tree: readonly WorkspaceTreeNode[],
  currentNotePath: string,
): WorkspaceTreeNode | undefined {
  if (!href) return undefined;
  const wikiTarget = parseWikiAssetHref(href);
  const node = resolveWorkspaceFile(
    tree,
    currentNotePath,
    wikiTarget ?? href,
    wikiTarget ? "wikilink" : "markdown",
  );
  return node && !isMarkdownFile(node.metadata) ? node : undefined;
}

function VaultPluginEmbed({
  provider,
  node,
  component: Embed,
  onOpenWorkspaceFile,
}: {
  readonly provider: StorageProvider;
  readonly node: WorkspaceTreeNode;
  readonly component: ComponentType<PluginMarkdownEmbedProps>;
  readonly onOpenWorkspaceFile?: (path: string) => void;
}) {
  const [content, setContent] = useState<string>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let disposed = false;
    setContent(undefined);
    setFailed(false);

    void provider
      .readText(node.metadata.id)
      .then((value) => {
        if (!disposed) setContent(value);
      })
      .catch(() => {
        if (!disposed) setFailed(true);
      });

    return () => {
      disposed = true;
    };
  }, [
    provider,
    node.metadata.id,
    node.metadata.revision,
    node.metadata.contentRevision,
  ]);

  if (failed) {
    return (
      <span className="attachment-load-error">
        {node.metadata.name}
      </span>
    );
  }
  if (content === undefined) {
    return (
      <span className="attachment-loading" aria-busy="true">
        {node.metadata.name}
      </span>
    );
  }

  return (
    <Embed
      name={node.metadata.name}
      path={node.path}
      content={content}
      {...(onOpenWorkspaceFile
        ? { onOpen: () => onOpenWorkspaceFile(node.path) }
        : {})}
    />
  );
}

function VaultImage({
  provider,
  node,
  alt,
}: {
  readonly provider: StorageProvider;
  readonly node: WorkspaceTreeNode;
  readonly alt: string;
}) {
  const [source, setSource] = useState<string>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let disposed = false;
    let objectUrl: string | undefined;
    setSource(undefined);
    setFailed(false);

    void provider
      .readBinary(node.metadata.id)
      .then((content) => {
        if (disposed) return;
        const blob = new Blob([Uint8Array.from(content)], {
          type: inferMediaType(node.metadata.name, node.metadata.mediaType),
        });
        objectUrl = URL.createObjectURL(blob);
        setSource(objectUrl);
      })
      .catch(() => {
        if (!disposed) setFailed(true);
      });

    return () => {
      disposed = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [
    provider,
    node.metadata.id,
    node.metadata.revision,
    node.metadata.contentRevision,
  ]);

  if (failed) {
    return <span className="attachment-load-error">{alt}</span>;
  }
  if (!source) {
    return (
      <span className="attachment-loading" aria-busy="true">
        {alt}
      </span>
    );
  }

  return <img className="vault-image" src={source} alt={alt} loading="lazy" />;
}

function VaultAttachmentLink({
  provider,
  node,
  children,
}: {
  readonly provider: StorageProvider;
  readonly node: WorkspaceTreeNode;
  readonly children: ReactNode;
}) {
  const [opening, setOpening] = useState(false);

  return (
    <button
      type="button"
      className="preview-internal-link preview-attachment-link"
      disabled={opening}
      onClick={() => {
        setOpening(true);
        void openVaultAttachment(provider, node).finally(() =>
          setOpening(false),
        );
      }}
    >
      {children}
    </button>
  );
}

async function openVaultAttachment(
  provider: StorageProvider,
  node: WorkspaceTreeNode,
) {
  const content = await provider.readBinary(node.metadata.id);
  const mediaType = inferMediaType(
    node.metadata.name,
    node.metadata.mediaType,
  );
  const blob = new Blob([Uint8Array.from(content)], { type: mediaType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;

  if (
    mediaType.startsWith("image/") ||
    mediaType.startsWith("audio/") ||
    mediaType.startsWith("video/") ||
    mediaType === "application/pdf" ||
    mediaType.startsWith("text/")
  ) {
    anchor.target = "_blank";
    anchor.rel = "noreferrer";
  } else {
    anchor.download = node.metadata.name;
  }

  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
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

interface HastNode {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
}

function rehypeMermaidBlocks() {
  return (tree: HastNode) => {
    transformMermaidBlocks(tree);
  };
}

function transformMermaidBlocks(parent: HastNode): void {
  if (!parent.children) return;

  parent.children = parent.children.map((child) => {
    if (child.type === "element" && child.tagName === "pre") {
      const code = child.children?.find(
        (candidate) =>
          candidate.type === "element" && candidate.tagName === "code",
      );
      const classNames = Array.isArray(code?.properties?.className)
        ? code.properties.className.filter(
            (value): value is string => typeof value === "string",
          )
        : typeof code?.properties?.className === "string"
          ? code.properties.className.split(/\s+/)
          : [];

      if (code && classNames.includes("language-mermaid")) {
        return {
          type: "element",
          tagName: "div",
          properties: {
            className: ["mindcontext-mermaid-source"],
            "data-mermaid-source": hastText(code).replace(/\n$/, ""),
          },
          children: [],
        };
      }
    }

    transformMermaidBlocks(child);
    return child;
  });
}

function hastText(node: HastNode): string {
  if (node.type === "text") return node.value ?? "";
  return (node.children ?? []).map(hastText).join("");
}

interface RemarkNode {
  type: string;
  value?: string;
  children?: RemarkNode[];
  url?: string;
  alt?: string;
}

function remarkWikilinks(options: {
  readonly resolveWiki: (target: string) => string | undefined;
  readonly resolveWikiAsset: (
    target: string,
  ) => ResolvedWikiAsset | undefined;
}) {
  return (tree: RemarkNode) => {
    transformChildren(
      tree,
      options.resolveWiki,
      options.resolveWikiAsset,
    );
  };
}

function transformChildren(
  parent: RemarkNode,
  resolveWiki: (target: string) => string | undefined,
  resolveWikiAsset: (
    target: string,
  ) => ResolvedWikiAsset | undefined,
): void {
  if (!parent.children) return;

  const next: RemarkNode[] = [];
  for (const child of parent.children) {
    if (child.type === "text" && child.value) {
      next.push(
        ...splitWikilinks(
          child.value,
          resolveWiki,
          resolveWikiAsset,
        ),
      );
    } else {
      transformChildren(child, resolveWiki, resolveWikiAsset);
      next.push(child);
    }
  }
  parent.children = next;
}

function splitWikilinks(
  value: string,
  resolveWiki: (target: string) => string | undefined,
  resolveWikiAsset: (
    target: string,
  ) => ResolvedWikiAsset | undefined,
): RemarkNode[] {
  const pattern = /(!)?\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
  const nodes: RemarkNode[] = [];
  let cursor = 0;

  for (const match of value.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > cursor) {
      nodes.push({ type: "text", value: value.slice(cursor, index) });
    }

    const embed = match[1] === "!";
    const rawTarget = match[2]?.trim() ?? "";
    const label = match[3]?.trim() || rawTarget;
    const asset = resolveWikiAsset(rawTarget);

    if (asset) {
      if (embed && asset.image) {
        nodes.push({
          type: "image",
          url: asset.href,
          alt: label,
        });
      } else if (embed && asset.pluginEmbed) {
        nodes.push({
          type: "link",
          url: pluginEmbedHref(rawTarget),
          children: [{ type: "text", value: label }],
        });
      } else {
        nodes.push({
          type: "link",
          url: asset.href,
          children: [{ type: "text", value: label }],
        });
      }
    } else {
      const href = resolveWiki(rawTarget);
      if (href) {
        if (embed) nodes.push({ type: "text", value: "!" });
        nodes.push({
          type: "link",
          url: href,
          children: [{ type: "text", value: label }],
        });
      } else {
        nodes.push({ type: "text", value: match[0] });
      }
    }
    cursor = index + match[0].length;
  }

  if (cursor < value.length) {
    nodes.push({ type: "text", value: value.slice(cursor) });
  }

  return nodes.length > 0 ? nodes : [{ type: "text", value }];
}
