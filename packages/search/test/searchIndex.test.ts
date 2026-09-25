import { describe, expect, it } from "vitest";

import {
  LexicalSearchIndex,
  canReuseSearchDocument,
  chunkMarkdown,
  createSearchDocument,
  createSearchIndexSnapshot,
  upsertSearchDocument,
} from "../src/index";

function doc(input: {
  readonly noteId: string;
  readonly path: string;
  readonly title: string;
  readonly aliases?: readonly string[];
  readonly tags?: readonly string[];
  readonly headings?: readonly string[];
  readonly content: string;
  readonly revision?: string;
}) {
  return createSearchDocument({
    noteId: input.noteId,
    path: input.path,
    name: input.path.split("/").at(-1) ?? input.path,
    title: input.title,
    aliases: input.aliases ?? [],
    tags: input.tags ?? [],
    headings: input.headings ?? [],
    content: input.content,
    ...(input.revision ? { revision: input.revision } : {}),
  });
}

const architecture = doc({
  noteId: "architecture",
  path: "Projects/Architecture.md",
  title: "Architecture",
  aliases: ["System design"],
  tags: ["local-first", "software"],
  headings: ["Storage boundaries", "Privacy"],
  content:
    "# Architecture\n\nGoogle Drive is canonical storage. Search and embeddings are disposable local projections.",
});
const travel = doc({
  noteId: "travel",
  path: "Travel/Asturias.md",
  title: "Asturias",
  tags: ["travel"],
  headings: ["Gijón"],
  content:
    "# Asturias\n\nIdeas for walking around Gijón and visiting the coast.",
});
const privacy = doc({
  noteId: "privacy",
  path: "Principles/Privacy.md",
  title: "Privacy",
  aliases: ["Privacidad"],
  tags: ["architecture"],
  headings: ["Data egress"],
  content:
    "# Privacy\n\nPrivate note contents should not be sent to application servers.",
});

const index = new LexicalSearchIndex([architecture, travel, privacy]);

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
    const updated = index.withDocument(
      doc({
        noteId: "travel",
        path: "Travel/Asturias.md",
        title: "Asturias",
        tags: ["travel"],
        headings: ["Gijón"],
        content: "# Asturias\n\nCider houses in Gijón.",
      }),
    );

    expect(updated.searchSync({ text: "cider" })[0]?.noteId).toBe("travel");
    expect(index.searchSync({ text: "cider" })).toEqual([]);
  });
});

describe("derived search snapshot", () => {
  it("chunks Markdown by semantic heading context", () => {
    const chunks = chunkMarkdown(
      "note-1",
      "Architecture.md",
      "# Architecture\n\nIntro.\n\n## Runtime\n\nBrowser local.\n\n### Workers\n\nEmbeddings run here.",
    );

    expect(chunks.map((chunk) => chunk.headingPath)).toEqual([
      ["Architecture"],
      ["Architecture", "Runtime"],
      ["Architecture", "Runtime", "Workers"],
    ]);
    expect(chunks[2]?.text).toContain(
      "Architecture > Runtime > Workers",
    );
    expect(chunks[2]?.contentHash).toMatch(/^[a-f0-9]{8}$/);
  });

  it("splits large sections without losing heading context", () => {
    const body = Array.from({ length: 12 }, (_, index) =>
      `Paragraph ${index} ${"x".repeat(90)}`,
    ).join("\n\n");

    const chunks = chunkMarkdown(
      "note-1",
      "Long.md",
      `# Long\n\n${body}`,
      undefined,
      360,
    );

    expect(chunks.length).toBeGreaterThan(1);
    expect(
      chunks.every((chunk) => chunk.headingPath[0] === "Long"),
    ).toBe(true);
  });

  it("reuses documents only when a stable revision matches", () => {
    const previous = doc({
      noteId: "a",
      path: "A.md",
      title: "A",
      content: "# A",
      revision: "7",
    });

    expect(canReuseSearchDocument(previous, "7")).toBe(true);
    expect(canReuseSearchDocument(previous, "8")).toBe(false);
    expect(canReuseSearchDocument(previous, undefined)).toBe(false);
  });

  it("upserts search snapshots immutably", () => {
    const snapshot = createSearchIndexSnapshot("workspace", [architecture]);
    const updated = upsertSearchDocument(snapshot, privacy);

    expect(snapshot.documents.map((item) => item.noteId)).toEqual([
      "architecture",
    ]);
    expect(updated.documents.map((item) => item.noteId).sort()).toEqual([
      "architecture",
      "privacy",
    ]);
  });
});
