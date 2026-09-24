export interface WikiLink {
  readonly target: string;
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
