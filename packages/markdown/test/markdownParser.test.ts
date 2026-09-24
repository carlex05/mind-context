import { describe, expect, it } from "vitest";

import { RemarkMarkdownParser } from "../src/index";

describe("RemarkMarkdownParser", () => {
  const parser = new RemarkMarkdownParser();

  it("extracts headings and section content from one canonical Markdown parse", () => {
    const result = parser.parse(
      "Intro\n\n# Architecture\n\nCore text.\n\n## Privacy\n\nPrivate by default.",
    );

    expect(result.sections).toEqual([
      { content: "Intro\n\n" },
      {
        heading: "Architecture",
        level: 1,
        content: "\n\nCore text.\n\n",
      },
      {
        heading: "Privacy",
        level: 2,
        content: "\n\nPrivate by default.",
      },
    ]);
  });

  it("extracts wikilink targets, headings and aliases", () => {
    const result = parser.parse(
      "See [[Kafka]], [[DDD#Aggregates]] and [[Architecture|system design]].",
    );

    expect(result.wikiLinks).toEqual([
      { target: "Kafka" },
      { target: "DDD", heading: "Aggregates" },
      { target: "Architecture", alias: "system design" },
    ]);
  });

  it("does not treat code as knowledge links", () => {
    const result = parser.parse(
      "Real [[Kafka]]. Inline `[[Ignored]]`.\n\n```text\n[[AlsoIgnored]]\n```",
    );

    expect(result.wikiLinks).toEqual([{ target: "Kafka" }]);
  });

  it("extracts distinct text tags", () => {
    const result = parser.parse(
      "A note about #architecture and #local-first. Again #architecture.",
    );

    expect(result.tags).toEqual(["architecture", "local-first"]);
  });
});
