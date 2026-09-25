import { describe, expect, it } from "vitest";

import {
  buildKnowledgeIndex,
  getBacklinks,
  getBrokenLinks,
  getLocalGraph,
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
        syntax: "wikilink",
        target: "Privacy",
        heading: "Boundaries",
        resolution: "resolved",
        targetNoteId: "b",
      },
    ]);
    expect(getBacklinks(index, "b")).toHaveLength(1);
  });

  it("treats standard Markdown internal links as the same knowledge graph", () => {
    const index = buildKnowledgeIndex("workspace-1", [
      {
        id: "a",
        path: "Notes/Architecture.md",
        name: "Architecture.md",
        content:
          "[Privacy](Privacy.md) [Decision](../Decisions/ADR-001.md#Context)",
      },
      {
        id: "b",
        path: "Notes/Privacy.md",
        name: "Privacy.md",
        content: "# Privacy",
      },
      {
        id: "c",
        path: "Decisions/ADR-001.md",
        name: "ADR-001.md",
        content: "# Decision\n\n## Context\n\nPortable.",
      },
    ]);

    expect(getOutgoingLinks(index, "a")).toMatchObject([
      {
        syntax: "markdown",
        target: "Privacy.md",
        resolution: "resolved",
        targetNoteId: "b",
      },
      {
        syntax: "markdown",
        target: "../Decisions/ADR-001.md",
        heading: "Context",
        resolution: "resolved",
        targetNoteId: "c",
      },
    ]);
    expect(getBacklinks(index, "b")).toHaveLength(1);
    expect(getBacklinks(index, "c")).toHaveLength(1);
  });

  it("supports same-note, hierarchical heading and block references", () => {
    const index = buildKnowledgeIndex("workspace-1", [
      {
        id: "a",
        path: "Architecture.md",
        name: "Architecture.md",
        content:
          "# Architecture\n\n## Runtime\n\n### Browser\n\nText. ^browser-block\n\n[[#Architecture]] [[#Runtime#Browser]] [[#^browser-block]]",
      },
    ]);

    expect(getOutgoingLinks(index, "a").map((edge) => edge.resolution)).toEqual([
      "resolved",
      "resolved",
      "resolved",
    ]);
  });

  it("reports missing notes, headings and blocks instead of silently resolving them", () => {
    const index = buildKnowledgeIndex("workspace-1", [
      {
        id: "a",
        path: "Architecture.md",
        name: "Architecture.md",
        content:
          "[[Missing]] [[Privacy#Does not exist]] [[Privacy#^does-not-exist]]",
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
      "missing-block",
    ]);
  });

  it("does not classify attachment embeds as broken note links", () => {
    const index = buildKnowledgeIndex("workspace-1", [
      {
        id: "a",
        path: "Architecture.md",
        name: "Architecture.md",
        content: "![[attachments/diagram.png|640]] ![image](attachments/other.png)",
      },
    ]);

    expect(getOutgoingLinks(index, "a")).toHaveLength(0);
    expect(getBrokenLinks(index, "a")).toHaveLength(0);
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

  it("projects a one-hop local graph with link direction", () => {
    const index = buildKnowledgeIndex("workspace-1", [
      {
        id: "a",
        path: "A.md",
        name: "A.md",
        content: "[[B]] [[C]]",
      },
      {
        id: "b",
        path: "B.md",
        name: "B.md",
        content: "[[A]]",
      },
      {
        id: "c",
        path: "C.md",
        name: "C.md",
        content: "# C",
      },
      {
        id: "d",
        path: "D.md",
        name: "D.md",
        content: "[[A]]",
      },
    ]);

    const graph = getLocalGraph(index, "a");

    expect(graph?.nodes).toMatchObject([
      { noteId: "a", direction: "center" },
      { noteId: "b", direction: "both" },
      { noteId: "c", direction: "outgoing" },
      { noteId: "d", direction: "backlink" },
    ]);
    expect(graph?.edges).toHaveLength(4);
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
