import remarkParse from "remark-parse";
import { unified } from "unified";

export interface WikiLink {
  readonly target: string;
  readonly heading?: string;
  readonly alias?: string;
}

export interface MarkdownSection {
  readonly heading?: string;
  readonly level?: number;
  readonly content: string;
}

export interface ParsedMarkdown {
  readonly frontmatter: Readonly<Record<string, unknown>>;
  readonly wikiLinks: readonly WikiLink[];
  readonly tags: readonly string[];
  readonly sections: readonly MarkdownSection[];
}

export interface MarkdownParser {
  parse(content: string): ParsedMarkdown;
}

interface MarkdownNode {
  readonly type: string;
  readonly value?: string;
  readonly depth?: number;
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

const WIKILINK_PATTERN =
  /\[\[([^\]|#]+?)(?:#([^\]|]+?))?(?:\|([^\]]+?))?\]\]/g;
const TAG_PATTERN = /(?:^|\s)#([\p{L}\p{N}_/-]+)/gu;

export class RemarkMarkdownParser implements MarkdownParser {
  private readonly processor = unified().use(remarkParse);

  parse(content: string): ParsedMarkdown {
    const root = this.processor.parse(content) as MarkdownNode;
    const wikiLinks: WikiLink[] = [];
    const tags = new Set<string>();
    const headings: HeadingPosition[] = [];

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

      if (node.type !== "text" || node.value === undefined) {
        return;
      }

      for (const match of node.value.matchAll(WIKILINK_PATTERN)) {
        const target = match[1]?.trim();
        if (!target) continue;

        const heading = match[2]?.trim();
        const alias = match[3]?.trim();

        wikiLinks.push({
          target,
          ...(heading ? { heading } : {}),
          ...(alias ? { alias } : {}),
        });
      }

      for (const match of node.value.matchAll(TAG_PATTERN)) {
        const tag = match[1]?.trim();
        if (tag) {
          tags.add(tag);
        }
      }
    });

    return {
      frontmatter: {},
      wikiLinks,
      tags: [...tags],
      sections: buildSections(content, headings),
    };
  }
}

export const markdownParser: MarkdownParser = new RemarkMarkdownParser();

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
