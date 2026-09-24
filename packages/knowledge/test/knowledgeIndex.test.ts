import { describe, expect, it } from "vitest";

import {
  buildKnowledgeIndex,
  getBacklinks,
  getBrokenLinks,
  getOutgoingLinks,
  upsertKnowledgeDocument,
} from "../src/index";

describe("knowledge index", () => {
  it("resolves wikilinks and derives backlinks", () => {
    const index = buildKnowledgeIndex("workspace-1", [
      {
        id: "a",
        path: "Architecture.md",
        name: "Architecture.md",
        content: "# Architecture\n\nSee [[Privacy#Boundaries]].",
      },
      {
        id: "b",
        path: "Privacy.md",
        name: "Privacy.md",
        content: "# Privacy\n\n## Boundaries\n\nLocal only.",
      },
    ]);

    expect(getOutgoingLinks(index, "a")).toMatchObject([
      {
        target: "Privacy",
        heading: "Boundaries",
        resolution: "resolved",
        targetNoteId: "b",
      },
    ]);
    expect(getBacklinks(index, "b")).toMatchObject([
      {
        sourceNoteId: "a",
        targetNoteId: "b",
        resolution: "resolved",
      },
    ]);
  });

  it("reports missing notes and headings instead of silently resolving them", () => {
    const index = buildKnowledgeIndex("workspace-1", [
      {
        id: "a",
        path: "Architecture.md",
        name: "Architecture.md",
        content: "[[Missing]] [[Privacy#Does not exist]]",
      },
      {
        id: "b",
        path: "Privacy.md",
        name: "Privacy.md",
        content: "# Privacy",
      },
    ]);

    expect(getBrokenLinks(index, "a").map((edge) => edge.resolution)).toEqual([
      "missing-note",
      "missing-heading",
    ]);
  });

  it("marks duplicate basename links as ambiguous but resolves explicit paths", () => {
    const index = buildKnowledgeIndex("workspace-1", [
      {
        id: "a",
        path: "Inbox/Kafka.md",
        name: "Kafka.md",
        content: "# Kafka",
      },
      {
        id: "b",
        path: "Architecture/Kafka.md",
        name: "Kafka.md",
        content: "# Kafka architecture",
      },
      {
        id: "source",
        path: "Home.md",
        name: "Home.md",
        content: "[[Kafka]] [[Inbox/Kafka]]",
      },
    ]);

    expect(getOutgoingLinks(index, "source").map((edge) => edge.resolution)).toEqual([
      "ambiguous-note",
      "resolved",
    ]);
  });

  it("recomputes graph projections when a document changes", () => {
    const initial = buildKnowledgeIndex("workspace-1", [
      {
        id: "a",
        path: "A.md",
        name: "A.md",
        content: "[[B]]",
      },
    ]);

    expect(getBrokenLinks(initial, "a")).toHaveLength(1);

    const updated = upsertKnowledgeDocument(initial, {
      id: "b",
      path: "B.md",
      name: "B.md",
      content: "# B",
    });

    expect(getBrokenLinks(updated, "a")).toHaveLength(0);
    expect(getBacklinks(updated, "b")).toHaveLength(1);
  });
});
