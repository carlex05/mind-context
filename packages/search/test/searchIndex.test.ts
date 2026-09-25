import { describe, expect, it } from "vitest";

import { LexicalSearchIndex } from "../src/index";

const index = new LexicalSearchIndex([
  {
    noteId: "architecture",
    path: "Projects/Architecture.md",
    title: "Architecture",
    aliases: ["System design"],
    tags: ["local-first", "software"],
    headings: ["Storage boundaries", "Privacy"],
    content:
      "# Architecture\n\nGoogle Drive is canonical storage. Search and embeddings are disposable local projections.",
  },
  {
    noteId: "travel",
    path: "Travel/Asturias.md",
    title: "Asturias",
    aliases: [],
    tags: ["travel"],
    headings: ["Gijón"],
    content:
      "# Asturias\n\nIdeas for walking around Gijón and visiting the coast.",
  },
  {
    noteId: "privacy",
    path: "Principles/Privacy.md",
    title: "Privacy",
    aliases: ["Privacidad"],
    tags: ["architecture"],
    headings: ["Data egress"],
    content:
      "# Privacy\n\nPrivate note contents should not be sent to application servers.",
  },
]);

describe("LexicalSearchIndex", () => {
  it("searches note contents locally", () => {
    const hits = index.searchSync({ text: "embeddings" });

    expect(hits).toHaveLength(1);
    expect(hits[0]?.noteId).toBe("architecture");
    expect(hits[0]?.excerpt).toContain("embeddings");
  });

  it("weights exact titles above body-only matches", () => {
    const hits = index.searchSync({ text: "privacy" });

    expect(hits.map((hit) => hit.noteId)).toEqual([
      "privacy",
      "architecture",
    ]);
  });

  it("searches aliases, tags, headings and paths", () => {
    expect(index.searchSync({ text: "privacidad" })[0]?.noteId).toBe(
      "privacy",
    );
    expect(index.searchSync({ text: "local-first" })[0]?.noteId).toBe(
      "architecture",
    );
    expect(index.searchSync({ text: "data egress" })[0]?.noteId).toBe(
      "privacy",
    );
    expect(index.searchSync({ text: "travel asturias" })[0]?.noteId).toBe(
      "travel",
    );
  });

  it("normalizes accents and requires all query terms", () => {
    expect(index.searchSync({ text: "gijon coast" })[0]?.noteId).toBe(
      "travel",
    );
    expect(index.searchSync({ text: "gijon embeddings" })).toEqual([]);
  });

  it("supports immutable document replacement", () => {
    const updated = index.withDocument({
      noteId: "travel",
      path: "Travel/Asturias.md",
      title: "Asturias",
      aliases: [],
      tags: ["travel"],
      headings: ["Gijón"],
      content: "# Asturias\n\nCider houses in Gijón.",
    });

    expect(updated.searchSync({ text: "cider" })[0]?.noteId).toBe("travel");
    expect(index.searchSync({ text: "cider" })).toEqual([]);
  });
});
