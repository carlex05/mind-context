import { describe, expect, it } from "vitest";
import {
  createMarkdownTransform,
  type MarkdownCommandId,
  type MarkdownTransform,
} from "./editorCommands";

function applyTransform(doc: string, transform: MarkdownTransform): string {
  return [...transform.changes]
    .sort((left, right) => right.from - left.from)
    .reduce(
      (current, change) =>
        current.slice(0, change.from) +
        change.insert +
        current.slice(change.to),
      doc,
    );
}

function apply(
  id: MarkdownCommandId,
  doc: string,
  from: number,
  to: number = from,
): string {
  return applyTransform(doc, createMarkdownTransform(id, doc, from, to));
}

describe("Markdown editor commands", () => {
  it("wraps selected inline text without changing the canonical format", () => {
    expect(apply("bold", "hello world", 0, 5)).toBe("**hello** world");
    expect(apply("inlineCode", "const value", 0, 5)).toBe("`const` value");
  });

  it("turns the selected lines into ordinary Markdown lists", () => {
    expect(apply("bulletList", "alpha\nbeta", 0, 10)).toBe(
      "- alpha\n- beta",
    );
    expect(apply("orderedList", "alpha\nbeta", 0, 10)).toBe(
      "1. alpha\n2. beta",
    );
    expect(apply("taskList", "alpha\nbeta", 0, 10)).toBe(
      "- [ ] alpha\n- [ ] beta",
    );
  });

  it("inserts an editable fenced code block", () => {
    const transform = createMarkdownTransform("codeBlock", "", 0, 0);
    expect(applyTransform("", transform)).toBe("```\n\n```");
    expect(transform.selection.anchor).toBe(4);
  });

  it("inserts a portable GFM table and selects its first header", () => {
    const transform = createMarkdownTransform("table", "", 0, 0);
    const result = applyTransform("", transform);

    expect(result).toContain("| Column 1 | Column 2 | Column 3 |");
    expect(result).toContain("| --- | --- | --- |");
    expect(
      result.slice(
        transform.selection.anchor,
        transform.selection.head,
      ),
    ).toBe("Column 1");
  });

  it("creates Obsidian-compatible blocks without proprietary metadata", () => {
    expect(apply("callout", "", 0)).toBe("> [!note]\n> ");
    expect(apply("mathBlock", "", 0)).toBe("$$\n\n$$");
    expect(apply("mermaid", "", 0)).toContain("```mermaid\nflowchart LR");
  });
});
