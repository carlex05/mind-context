import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  RemarkMarkdownParser,
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
