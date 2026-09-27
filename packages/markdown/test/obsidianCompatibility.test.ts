import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  RemarkMarkdownParser,
  findMarkdownNavigationOffset,
  prepareObsidianMarkdownForReading,
  updateFrontmatterStringList,
} from "../src/index";

const fixture = readFileSync(
  new URL("./fixtures/obsidian-compatibility.md", import.meta.url),
  "utf8",
);

describe("Obsidian-compatible Markdown", () => {
  const parsed = new RemarkMarkdownParser().parse(fixture);

  it("reads YAML properties without rewriting canonical Markdown", () => {
    expect(parsed.frontmatter).toMatchObject({
      aliases: ["AI", "Artificial Intelligence"],
      tags: ["architecture", "local-first"],
      status: "active",
    });
    expect(parsed.aliases).toEqual(["AI", "Artificial Intelligence"]);
    expect(parsed.tags).toEqual([
      "architecture",
      "local-first",
      "knowledge",
    ]);
  });

  it("parses wikilinks, same-note headings, block references and embeds", () => {
    expect(parsed.internalLinks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          syntax: "wikilink",
          target: "Architecture",
          embed: false,
        }),
        expect.objectContaining({
          syntax: "wikilink",
          target: "",
          heading: "Artificial Intelligence",
          embed: false,
        }),
        expect.objectContaining({
          syntax: "wikilink",
          target: "Blocks",
          blockId: "decision-42",
          embed: false,
        }),
        expect.objectContaining({
          syntax: "wikilink",
          target: "Architecture",
          heading: "Summary",
          embed: true,
        }),
        expect.objectContaining({
          syntax: "wikilink",
          target: "attachments/diagram.png",
          alias: "640",
          embed: true,
        }),
      ]),
    );
    expect(parsed.blockIds).toContain("decision-42");
  });

  it("parses standard Markdown internal links and URL-decoded destinations", () => {
    expect(parsed.internalLinks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          syntax: "markdown",
          target: "Privacy.md",
          alias: "Privacy",
          embed: false,
        }),
        expect.objectContaining({
          syntax: "markdown",
          target: "../Decisions/ADR-001.md",
          heading: "Context",
          alias: "Decision",
          embed: false,
        }),
      ]),
    );
  });

  it("understands P0 Obsidian syntax without leaking comments into semantics", () => {
    expect(parsed.highlights).toContain("Highlighted knowledge");
    expect(parsed.comments).toEqual(
      expect.arrayContaining([
        expect.stringContaining("this stays in editing only"),
        expect.stringContaining("Block comment"),
      ]),
    );
    expect(parsed.callouts).toContainEqual({
      type: "warning",
      title: "Deployment warning",
      fold: "open",
    });
    expect(parsed.footnotes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          identifier: "source",
          content: "Source material.",
          inline: false,
        }),
        expect.objectContaining({
          content: "Inline source material",
          inline: true,
        }),
      ]),
    );
    expect(parsed.tags).not.toContain("comment-tag");
    expect(parsed.tags).not.toContain("block-comment-tag");
    expect(
      parsed.internalLinks.some((link) => link.target === "Comment Target"),
    ).toBe(false);
    expect(
      parsed.internalLinks.some((link) => link.target === "Also Commented"),
    ).toBe(false);
  });

  it("treats quoted wikilinks in properties as knowledge links", () => {
    expect(parsed.internalLinks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          syntax: "wikilink",
          target: "Knowledge Graph",
          embed: false,
        }),
        expect.objectContaining({
          syntax: "wikilink",
          target: "Architecture",
          heading: "Boundaries",
          embed: false,
        }),
      ]),
    );
  });

  it("prepares comments and inline footnotes only for transient reading view", () => {
    const source = [
      "# Note",
      "",
      "Visible %%hidden%% text.",
      "",
      "Inline ^[Inline explanation].",
      "",
      "`%%code%% ^[not a footnote]`",
      "",
      "```md",
      "%%fenced%% ^[also code]",
      "```",
      "",
    ].join("\n");

    const prepared = prepareObsidianMarkdownForReading(source);

    expect(prepared).toMatch(/Visible\s+text\./);
    expect(prepared).not.toContain("hidden");
    expect(prepared).toContain("[^mindcontext-inline-1]");
    expect(prepared).toContain(
      "[^mindcontext-inline-1]: Inline explanation",
    );
    expect(prepared).toContain("`%%code%% ^[not a footnote]`");
    expect(prepared).toContain("%%fenced%% ^[also code]");
    expect(source).toContain("%%hidden%%");
  });

  it("locates headings and Obsidian block identifiers for deep navigation", () => {
    const source =
      "# Overview\n\n## Deployment Plan\n\nDecision text. ^decision-42\n";

    expect(
      findMarkdownNavigationOffset(source, {
        heading: "Deployment Plan",
      }),
    ).toBe(source.indexOf("## Deployment Plan"));
    expect(
      findMarkdownNavigationOffset(source, {
        blockId: "decision-42",
      }),
    ).toBeGreaterThan(source.indexOf("Decision text."));
  });

  it("updates tags and aliases through standard YAML frontmatter", () => {
    const withTags = updateFrontmatterStringList(
      "# Portable\n",
      "tags",
      ["architecture", "local-first"],
    );
    const withAliases = updateFrontmatterStringList(
      withTags,
      "aliases",
      ["Portable Note"],
    );
    const reparsed = new RemarkMarkdownParser().parse(withAliases);

    expect(reparsed.frontmatter).toMatchObject({
      tags: ["architecture", "local-first"],
      aliases: ["Portable Note"],
    });
    expect(withAliases).toContain("# Portable");
  });

  it("preserves unrelated YAML properties when editing string lists", () => {
    const updated = updateFrontmatterStringList(
      "---\nstatus: active\ntags:\n  - old\n---\n# Note\n",
      "tags",
      ["new"],
    );
    const reparsed = new RemarkMarkdownParser().parse(updated);

    expect(reparsed.frontmatter).toMatchObject({
      status: "active",
      tags: ["new"],
    });
  });

  it("ignores wikilinks and tags inside inline/fenced code", () => {
    expect(parsed.internalLinks.some((link) => link.target === "Ignored")).toBe(
      false,
    );
    expect(
      parsed.internalLinks.some((link) => link.target === "Also ignored"),
    ).toBe(false);
    expect(parsed.tags).not.toContain("not-a-tag");
  });
});
