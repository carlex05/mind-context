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

export interface ParsedMarkdown {
  readonly frontmatter: Readonly<Record<string, unknown>>;
  readonly aliases: readonly string[];
  readonly wikiLinks: readonly WikiLink[];
  readonly internalLinks: readonly InternalLink[];
  readonly tags: readonly string[];
  readonly blockIds: readonly string[];
  readonly sections: readonly MarkdownSection[];
}

export interface MarkdownParser {
  parse(content: string): ParsedMarkdown;
}

interface MarkdownNode {
  readonly type: string;
  readonly value?: string;
  readonly depth?: number;
  readonly url?: string;
  readonly alt?: string;
  readonly children?: readonly MarkdownNode[];
  readonly position?: {
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

const WIKILINK_PATTERN =
  /(!)?\[\[([^\]|#]*?)(?:#([^\]|]*?))?(?:\|([^\]]*?))?\]\]/g;
const TAG_PATTERN = /(?:^|\s)#([\p{L}\p{N}_/-]+)/gu;
const BLOCK_ID_PATTERN = /(?:^|\s)\^([A-Za-z0-9-]+)$/;

export class RemarkMarkdownParser implements MarkdownParser {
  private readonly processor = unified().use(remarkParse);

  parse(content: string): ParsedMarkdown {
    const { properties, body } = extractFrontmatter(content);
    const root = this.processor.parse(body) as MarkdownNode;
    const wikiLinks: WikiLink[] = [];
    const internalLinks: InternalLink[] = [];
    const tags = new CaseInsensitiveSet();
    const blockIds = new Set<string>();
    const headings: HeadingPosition[] = [];

    for (const tag of propertyStringList(properties.tags)) {
      const normalized = tag.replace(/^#/, "").trim();
      if (isValidTag(normalized)) {
        tags.add(normalized);
      }
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

      if (node.type !== "text" || node.value === undefined) {
        return;
      }

      for (const match of node.value.matchAll(WIKILINK_PATTERN)) {
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

      for (const match of node.value.matchAll(TAG_PATTERN)) {
        const tag = match[1]?.trim();
        if (tag && isValidTag(tag)) {
          tags.add(tag);
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
    };
  }
}

export const markdownParser: MarkdownParser = new RemarkMarkdownParser();

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

function propertyStringList(value: unknown): readonly string[] {
  if (typeof value === "string") {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
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
