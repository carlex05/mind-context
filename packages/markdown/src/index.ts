import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { parse as parseYaml, parseDocument, stringify as stringifyYaml } from "yaml";

export type InternalLinkSyntax = "wikilink" | "markdown";

export interface InternalLink {
  readonly syntax: InternalLinkSyntax;
  readonly target: string;
  readonly heading?: string;
  readonly blockId?: string;
  readonly alias?: string;
  readonly embed: boolean;
}

export interface WikiLink {
  readonly target: string;
  readonly heading?: string;
  readonly blockId?: string;
  readonly alias?: string;
  readonly embed?: boolean;
}

export interface MarkdownSection {
  readonly heading?: string;
  readonly level?: number;
  readonly content: string;
}

export interface MarkdownCallout {
  readonly type: string;
  readonly title?: string;
  readonly fold?: "open" | "closed";
}

export interface MarkdownFootnote {
  readonly identifier: string;
  readonly content: string;
  readonly inline: boolean;
}

export interface MarkdownNavigationTarget {
  readonly heading?: string;
  readonly blockId?: string;
}

export interface ParsedMarkdown {
  readonly frontmatter: Readonly<Record<string, unknown>>;
  readonly aliases: readonly string[];
  readonly wikiLinks: readonly WikiLink[];
  readonly internalLinks: readonly InternalLink[];
  readonly tags: readonly string[];
  readonly blockIds: readonly string[];
  readonly sections: readonly MarkdownSection[];
  readonly comments: readonly string[];
  readonly highlights: readonly string[];
  readonly callouts: readonly MarkdownCallout[];
  readonly footnotes: readonly MarkdownFootnote[];
}

export interface MarkdownParser {
  parse(content: string): ParsedMarkdown;
}

interface MarkdownNodeData {
  hName?: string;
  hProperties?: Record<string, unknown>;
}

interface MarkdownNode {
  type: string;
  value?: string;
  depth?: number;
  url?: string;
  alt?: string;
  identifier?: string;
  label?: string;
  children?: MarkdownNode[];
  data?: MarkdownNodeData;
  position?: {
    readonly start: { readonly offset?: number };
    readonly end: { readonly offset?: number };
  };
}

interface HeadingPosition {
  readonly title: string;
  readonly level: number;
  readonly start: number;
  readonly end: number;
}

interface FrontmatterExtraction {
  readonly properties: Readonly<Record<string, unknown>>;
  readonly body: string;
}

interface CommentStripResult {
  readonly content: string;
  readonly comments: readonly string[];
}

const WIKILINK_PATTERN =
  /(!)?\[\[([^\]|#]*?)(?:#([^\]|]*?))?(?:\|([^\]]*?))?\]\]/g;
const TAG_PATTERN = /(?:^|\s)#([\p{L}\p{N}_/-]+)/gu;
const BLOCK_ID_PATTERN = /(?:^|\s)\^([A-Za-z0-9-]+)$/;
const HIGHLIGHT_PATTERN = /==([^=\n](?:.*?[^=\n])?)==/g;
const INLINE_FOOTNOTE_PATTERN = /\^\[([^\]\n]+)\]/g;
const CALLOUT_PATTERN =
  /^\[!([A-Za-z0-9_-]+)\]([+-])?(?:[ \t]+([^\n]*))?/;

export class RemarkMarkdownParser implements MarkdownParser {
  private readonly processor = unified().use(remarkParse).use(remarkGfm);

  parse(content: string): ParsedMarkdown {
    const { properties, body } = extractFrontmatter(content);
    const stripped = stripObsidianComments(body);
    const root = this.processor.parse(stripped.content) as MarkdownNode;
    const wikiLinks: WikiLink[] = [];
    const internalLinks: InternalLink[] = [];
    const tags = new CaseInsensitiveSet();
    const blockIds = new Set<string>();
    const headings: HeadingPosition[] = [];
    const highlights: string[] = [];
    const callouts: MarkdownCallout[] = [];
    const footnotes: MarkdownFootnote[] = [];

    for (const tag of propertyStringList(properties.tags)) {
      const normalized = tag.replace(/^#/, "").trim();
      if (isValidTag(normalized)) {
        tags.add(normalized);
      }
    }

    for (const propertyValue of propertyStrings(properties)) {
      scanWikilinks(propertyValue, wikiLinks, internalLinks);
    }

    walk(root, (node) => {
      if (
        node.type === "heading" &&
        node.depth !== undefined &&
        node.position?.start.offset !== undefined &&
        node.position.end.offset !== undefined
      ) {
        headings.push({
          title: plainText(node).trim(),
          level: node.depth,
          start: node.position.start.offset,
          end: node.position.end.offset,
        });
      }

      if ((node.type === "link" || node.type === "image") && node.url) {
        const parsed = parseMarkdownInternalLink(
          node.url,
          node.type === "image",
          node.type === "image" ? node.alt : plainText(node),
        );
        if (parsed) {
          internalLinks.push(parsed);
        }
      }

      if (node.type === "blockquote") {
        const callout = parseCallout(node);
        if (callout) callouts.push(callout);
      }

      if (node.type === "footnoteDefinition" && node.identifier) {
        footnotes.push({
          identifier: node.identifier,
          content: plainText(node).trim(),
          inline: false,
        });
      }

      if (node.type !== "text" || node.value === undefined) {
        return;
      }

      scanWikilinks(node.value, wikiLinks, internalLinks);

      for (const match of node.value.matchAll(TAG_PATTERN)) {
        const tag = match[1]?.trim();
        if (tag && isValidTag(tag)) {
          tags.add(tag);
        }
      }

      for (const match of node.value.matchAll(HIGHLIGHT_PATTERN)) {
        const highlighted = match[1]?.trim();
        if (highlighted) highlights.push(highlighted);
      }

      for (const match of node.value.matchAll(INLINE_FOOTNOTE_PATTERN)) {
        const footnote = match[1]?.trim();
        if (footnote) {
          footnotes.push({
            identifier: `inline-${footnotes.length + 1}`,
            content: footnote,
            inline: true,
          });
        }
      }

      const blockMatch = BLOCK_ID_PATTERN.exec(node.value.trim());
      if (blockMatch?.[1]) {
        blockIds.add(blockMatch[1]);
      }
    });

    return {
      frontmatter: properties,
      aliases: propertyStringList(properties.aliases),
      wikiLinks,
      internalLinks,
      tags: tags.values(),
      blockIds: [...blockIds],
      sections: buildSections(body, headings),
      comments: stripped.comments,
      highlights,
      callouts,
      footnotes,
    };
  }
}

export const markdownParser: MarkdownParser = new RemarkMarkdownParser();

/**
 * Reading-view source preparation for the built-in Obsidian dialect.
 *
 * This deliberately transforms only the transient render source. Canonical
 * Markdown stays byte-for-byte under the user's control.
 */
export function prepareObsidianMarkdownForReading(content: string): string {
  const { body } = extractFrontmatter(content);
  const withoutComments = stripObsidianComments(body).content;
  return expandInlineFootnotes(withoutComments);
}

/**
 * Built-in Obsidian AST transforms used by Reading View.
 *
 * Keeping this as one explicit dialect plugin gives a future plugin system a
 * clean extension seam instead of spreading syntax-specific rendering rules
 * across React components.
 */
export function remarkObsidianBase() {
  return (tree: MarkdownNode) => {
    decorateObsidianTree(tree);
  };
}

export function normalizeMarkdownHeading(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase();
}

export function findMarkdownNavigationOffset(
  content: string,
  target: MarkdownNavigationTarget,
): number | undefined {
  if (target.blockId) {
    const escaped = escapeRegExp(target.blockId);
    const pattern = new RegExp(
      `(?:^|\\s)\\^${escaped}(?=\\s*$)`,
      "gm",
    );
    const match = pattern.exec(content);
    return match?.index;
  }

  if (target.heading) {
    const requested = normalizeMarkdownHeading(
      target.heading.split("#").filter(Boolean).at(-1) ?? target.heading,
    );
    const pattern = /^ {0,3}(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$/gm;
    for (const match of content.matchAll(pattern)) {
      const raw = match[2]?.trim();
      if (!raw) continue;
      if (normalizeMarkdownHeading(stripInlineMarkdown(raw)) === requested) {
        return match.index;
      }
    }
  }

  return undefined;
}

export function updateFrontmatterStringList(
  content: string,
  key: string,
  values: readonly string[],
): string {
  const normalizedValues = [...new Set(values.map((value) => value.trim()).filter(Boolean))];
  const normalized = content.startsWith("\uFEFF") ? content.slice(1) : content;
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(normalized);

  if (!match) {
    if (normalizedValues.length === 0) return content;
    const yaml = stringifyYaml({ [key]: normalizedValues }).trimEnd();
    return `---\n${yaml}\n---\n${normalized}`;
  }

  const document = parseDocument(match[1] ?? "");
  if (document.errors.length > 0) {
    throw new Error("Cannot edit properties because the YAML frontmatter is invalid.");
  }

  if (normalizedValues.length > 0) {
    document.set(key, normalizedValues);
  } else {
    document.delete(key);
  }

  const yaml = document.toString().trimEnd();
  const body = normalized.slice(match[0].length);
  if (!yaml.trim()) return body;

  return `---\n${yaml}\n---\n${body}`;
}

function extractFrontmatter(content: string): FrontmatterExtraction {
  const normalized = content.startsWith("\uFEFF") ? content.slice(1) : content;
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(normalized);

  if (!match) {
    return { properties: {}, body: normalized };
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(match[1] ?? "");
  } catch {
    parsed = {};
  }

  return {
    properties:
      parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Readonly<Record<string, unknown>>)
        : {},
    body: normalized.slice(match[0].length),
  };
}

function parseMarkdownInternalLink(
  rawUrl: string,
  embed: boolean,
  displayText: string | undefined,
): InternalLink | undefined {
  const decoded = safeDecodeURIComponent(rawUrl.trim());

  if (
    !decoded ||
    decoded.startsWith("http://") ||
    decoded.startsWith("https://") ||
    decoded.startsWith("mailto:") ||
    decoded.startsWith("tel:") ||
    decoded.startsWith("data:")
  ) {
    return undefined;
  }

  const hashIndex = decoded.indexOf("#");
  const target = hashIndex >= 0 ? decoded.slice(0, hashIndex) : decoded;
  const fragment = hashIndex >= 0 ? decoded.slice(hashIndex + 1) : undefined;
  const { heading, blockId } = parseFragment(fragment);
  const alias = displayText?.trim();

  return {
    syntax: "markdown",
    target,
    embed,
    ...(heading ? { heading } : {}),
    ...(blockId ? { blockId } : {}),
    ...(alias ? { alias } : {}),
  };
}

function parseFragment(
  fragment: string | undefined,
): { readonly heading?: string; readonly blockId?: string } {
  if (!fragment) {
    return {};
  }

  if (fragment.startsWith("^")) {
    const blockId = fragment.slice(1).trim();
    return blockId ? { blockId } : {};
  }

  return { heading: fragment };
}

function scanWikilinks(
  value: string,
  wikiLinks: WikiLink[],
  internalLinks: InternalLink[],
): void {
  for (const match of value.matchAll(WIKILINK_PATTERN)) {
    const target = match[2]?.trim() ?? "";
    const fragment = match[3]?.trim();
    const display = match[4]?.trim();
    const embed = match[1] === "!";
    const { heading, blockId } = parseFragment(fragment);

    const link: InternalLink = {
      syntax: "wikilink",
      target,
      embed,
      ...(heading ? { heading } : {}),
      ...(blockId ? { blockId } : {}),
      ...(display ? { alias: display } : {}),
    };
    internalLinks.push(link);
    wikiLinks.push({
      target,
      ...(heading ? { heading } : {}),
      ...(blockId ? { blockId } : {}),
      ...(display ? { alias: display } : {}),
      ...(embed ? { embed: true } : {}),
    });
  }
}

function parseCallout(node: MarkdownNode): MarkdownCallout | undefined {
  const text = plainText(node).trimStart();
  const match = CALLOUT_PATTERN.exec(text);
  const type = match?.[1]?.trim().toLocaleLowerCase();
  if (!type) return undefined;

  const fold =
    match?.[2] === "+"
      ? "open"
      : match?.[2] === "-"
        ? "closed"
        : undefined;
  const title = match?.[3]?.trim();

  return {
    type,
    ...(title ? { title } : {}),
    ...(fold ? { fold } : {}),
  };
}

function propertyStringList(value: unknown): readonly string[] {
  if (typeof value === "string") {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }

  return [];
}

function propertyStrings(value: unknown): readonly string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(propertyStrings);
  if (value && typeof value === "object") {
    return Object.values(value).flatMap(propertyStrings);
  }
  return [];
}

function isValidTag(value: string): boolean {
  return value.length > 0 && !/^\d+$/u.test(value);
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function walk(
  node: MarkdownNode,
  visitor: (node: MarkdownNode) => void,
): void {
  visitor(node);
  for (const child of node.children ?? []) {
    walk(child, visitor);
  }
}

function plainText(node: MarkdownNode): string {
  if (
    (node.type === "text" || node.type === "inlineCode") &&
    node.value !== undefined
  ) {
    return node.value;
  }

  if (node.type === "image") {
    return node.alt ?? "";
  }

  return (node.children ?? []).map(plainText).join("");
}

function buildSections(
  content: string,
  headings: readonly HeadingPosition[],
): readonly MarkdownSection[] {
  if (headings.length === 0) {
    return content.length > 0 ? [{ content }] : [];
  }

  const sections: MarkdownSection[] = [];
  const firstHeading = headings[0];

  if (firstHeading && firstHeading.start > 0) {
    const preamble = content.slice(0, firstHeading.start);
    if (preamble.trim()) {
      sections.push({ content: preamble });
    }
  }

  for (let index = 0; index < headings.length; index += 1) {
    const heading = headings[index];
    if (!heading) continue;

    const nextHeading = headings[index + 1];
    const sectionEnd = nextHeading?.start ?? content.length;
    const sectionContent = content.slice(heading.end, sectionEnd);

    sections.push({
      heading: heading.title,
      level: heading.level,
      content: sectionContent,
    });
  }

  return sections;
}

function stripObsidianComments(content: string): CommentStripResult {
  const lines = content.split(/(?<=\n)/);
  const output: string[] = [];
  const comments: string[] = [];
  let commentBuffer = "";
  let inComment = false;
  let fence:
    | { readonly marker: "`" | "~"; readonly length: number }
    | undefined;

  for (const line of lines) {
    const lineWithoutNewline = line.replace(/\r?\n$/, "");
    const newline = line.slice(lineWithoutNewline.length);

    if (!inComment) {
      const fenceMatch = /^ {0,3}(`{3,}|~{3,})/.exec(lineWithoutNewline);
      if (fenceMatch?.[1]) {
        const marker = fenceMatch[1][0] as "`" | "~";
        const length = fenceMatch[1].length;
        if (!fence) {
          fence = { marker, length };
        } else if (fence.marker === marker && length >= fence.length) {
          fence = undefined;
        }
        output.push(line);
        continue;
      }
    }

    if (fence) {
      output.push(line);
      continue;
    }

    let cursor = 0;
    let next = "";

    while (cursor < lineWithoutNewline.length) {
      if (inComment) {
        const close = lineWithoutNewline.indexOf("%%", cursor);
        if (close < 0) {
          commentBuffer += lineWithoutNewline.slice(cursor) + newline;
          cursor = lineWithoutNewline.length;
          break;
        }

        commentBuffer += lineWithoutNewline.slice(cursor, close);
        comments.push(commentBuffer.trim());
        commentBuffer = "";
        inComment = false;
        cursor = close + 2;
        continue;
      }

      if (lineWithoutNewline.startsWith("%%", cursor)) {
        inComment = true;
        cursor += 2;
        continue;
      }

      if (lineWithoutNewline[cursor] === "`") {
        const tickStart = cursor;
        while (lineWithoutNewline[cursor] === "`") cursor += 1;
        const ticks = lineWithoutNewline.slice(tickStart, cursor);
        const close = lineWithoutNewline.indexOf(ticks, cursor);
        if (close >= 0) {
          next += lineWithoutNewline.slice(tickStart, close + ticks.length);
          cursor = close + ticks.length;
          continue;
        }

        next += ticks;
        continue;
      }

      next += lineWithoutNewline[cursor];
      cursor += 1;
    }

    output.push(next + newline);
    if (inComment) commentBuffer += newline;
  }

  if (commentBuffer.trim()) comments.push(commentBuffer.trim());

  return {
    content: output.join(""),
    comments,
  };
}

function expandInlineFootnotes(content: string): string {
  const lines = content.split(/(?<=\n)/);
  const output: string[] = [];
  const definitions: Array<{ readonly id: string; readonly text: string }> = [];
  let fence:
    | { readonly marker: "`" | "~"; readonly length: number }
    | undefined;

  for (const line of lines) {
    const lineWithoutNewline = line.replace(/\r?\n$/, "");
    const newline = line.slice(lineWithoutNewline.length);
    const fenceMatch = /^ {0,3}(`{3,}|~{3,})/.exec(lineWithoutNewline);

    if (fenceMatch?.[1]) {
      const marker = fenceMatch[1][0] as "`" | "~";
      const length = fenceMatch[1].length;
      if (!fence) {
        fence = { marker, length };
      } else if (fence.marker === marker && length >= fence.length) {
        fence = undefined;
      }
      output.push(line);
      continue;
    }

    if (fence) {
      output.push(line);
      continue;
    }

    let cursor = 0;
    let next = "";
    while (cursor < lineWithoutNewline.length) {
      if (lineWithoutNewline[cursor] === "`") {
        const tickStart = cursor;
        while (lineWithoutNewline[cursor] === "`") cursor += 1;
        const ticks = lineWithoutNewline.slice(tickStart, cursor);
        const close = lineWithoutNewline.indexOf(ticks, cursor);
        if (close >= 0) {
          next += lineWithoutNewline.slice(tickStart, close + ticks.length);
          cursor = close + ticks.length;
          continue;
        }
        next += ticks;
        continue;
      }

      const rest = lineWithoutNewline.slice(cursor);
      const match = INLINE_FOOTNOTE_PATTERN.exec(rest);
      INLINE_FOOTNOTE_PATTERN.lastIndex = 0;
      if (!match || match.index === undefined) {
        next += rest;
        break;
      }

      next += rest.slice(0, match.index);
      const text = match[1]?.trim();
      if (!text) {
        next += match[0];
      } else {
        const id = `mindcontext-inline-${definitions.length + 1}`;
        definitions.push({ id, text });
        next += `[^${id}]`;
      }
      cursor += match.index + match[0].length;
    }

    output.push(next + newline);
  }

  if (definitions.length === 0) return output.join("");

  return (
    output.join("").trimEnd() +
    "\n\n" +
    definitions.map(({ id, text }) => `[^${id}]: ${text}`).join("\n") +
    "\n"
  );
}

function decorateObsidianTree(node: MarkdownNode): void {
  if (node.type === "heading") {
    const key = normalizeMarkdownHeading(plainText(node));
    node.data = mergeNodeData(node.data, {
      "data-heading-key": key,
    });
  }

  if (node.type === "blockquote") {
    decorateCallout(node);
  }

  if (node.type === "paragraph") {
    decorateBlockId(node);
  }

  if (node.children) {
    const next: MarkdownNode[] = [];
    for (const child of node.children) {
      if (child.type === "text" && child.value) {
        next.push(...splitHighlights(child.value));
      } else {
        decorateObsidianTree(child);
        next.push(child);
      }
    }
    node.children = next;
  }
}

function decorateCallout(node: MarkdownNode): void {
  const first = node.children?.[0];
  if (!first || first.type !== "paragraph") return;

  const firstText = first.children?.find(
    (child) => child.type === "text" && child.value !== undefined,
  );
  if (!firstText?.value) return;

  const match = CALLOUT_PATTERN.exec(firstText.value);
  const type = match?.[1]?.trim().toLocaleLowerCase();
  if (!type) return;

  const markerLength = match?.[0]?.length ?? 0;
  const title = match?.[3]?.trim() || titleCase(type);
  const fold = match?.[2] === "+" ? "open" : match?.[2] === "-" ? "closed" : undefined;

  firstText.value = firstText.value.slice(markerLength).replace(/^\r?\n/, "");

  node.data = mergeNodeData(node.data, {
    className: [
      "obsidian-callout",
      `obsidian-callout-${safeCssToken(type)}`,
      ...(fold ? [`obsidian-callout-${fold}`] : []),
    ],
    "data-callout": type,
  });

  const titleNode: MarkdownNode = {
    type: "paragraph",
    data: {
      hName: "div",
      hProperties: {
        className: ["obsidian-callout-title"],
      },
    },
    children: [{ type: "text", value: title }],
  };

  node.children = [
    titleNode,
    ...(plainText(first).trim() ? [first] : []),
    ...(node.children?.slice(1) ?? []),
  ];
}

function decorateBlockId(node: MarkdownNode): void {
  if (!node.children || node.children.length === 0) return;

  const lastText = [...node.children]
    .reverse()
    .find((child) => child.type === "text" && child.value !== undefined);
  if (!lastText?.value) return;

  const match = /(?:^|\s)\^([A-Za-z0-9-]+)\s*$/.exec(lastText.value);
  const blockId = match?.[1];
  if (!blockId || match.index === undefined) return;

  lastText.value = lastText.value.slice(0, match.index).trimEnd();
  node.data = mergeNodeData(node.data, {
    "data-block-id": blockId,
  });
}

function splitHighlights(value: string): MarkdownNode[] {
  const nodes: MarkdownNode[] = [];
  let cursor = 0;

  for (const match of value.matchAll(HIGHLIGHT_PATTERN)) {
    const index = match.index ?? 0;
    if (index > cursor) {
      nodes.push({ type: "text", value: value.slice(cursor, index) });
    }

    const highlighted = match[1];
    if (highlighted) {
      nodes.push({
        type: "obsidianHighlight",
        data: {
          hName: "mark",
          hProperties: {
            className: ["obsidian-highlight"],
          },
        },
        children: [{ type: "text", value: highlighted }],
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

function mergeNodeData(
  current: MarkdownNodeData | undefined,
  properties: Record<string, unknown>,
): MarkdownNodeData {
  return {
    ...current,
    hProperties: {
      ...(current?.hProperties ?? {}),
      ...properties,
    },
  };
}

function stripInlineMarkdown(value: string): string {
  return value
    .replace(/!?(?:\[([^\]]+)\]\([^)]*\)|\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\])/g, (_match, markdownLabel, wikiTarget, wikiAlias) =>
      markdownLabel ?? wikiAlias ?? wikiTarget ?? "",
    )
    .replace(/[`*_~]/g, "")
    .replace(/==(.+?)==/g, "$1")
    .trim();
}

function titleCase(value: string): string {
  return value.length > 0
    ? value[0]!.toLocaleUpperCase() + value.slice(1)
    : value;
}

function safeCssToken(value: string): string {
  return value.replace(/[^a-z0-9_-]/gi, "-").toLocaleLowerCase();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

class CaseInsensitiveSet {
  private readonly keys = new Set<string>();
  private readonly originalValues: string[] = [];

  add(value: string): void {
    const key = value.toLocaleLowerCase();
    if (this.keys.has(key)) return;
    this.keys.add(key);
    this.originalValues.push(value);
  }

  values(): readonly string[] {
    return this.originalValues;
  }
}
