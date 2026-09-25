import { describe, expect, it } from "vitest";

import {
  buildEmbeddingSnapshot,
  cosineSimilarity,
  type EmbeddingProvider,
} from "../src/index";

class FakeProvider implements EmbeddingProvider {
  readonly id = "fake";
  readonly model = "fake-v1";
  calls = 0;

  async embed(texts: readonly string[]) {
    this.calls += texts.length;
    return texts.map((text) => {
      const vector = text.includes("architecture")
        ? [1, 0, 0]
        : text.includes("travel")
          ? [0, 1, 0]
          : [0, 0, 1];
      return { dimensions: vector.length, values: vector };
    });
  }
}

describe("embedding snapshots", () => {
  it("reuses embeddings by stable chunk id and content hash", async () => {
    const provider = new FakeProvider();
    const chunks = [
      {
        chunkId: "a:0:hash-a",
        noteId: "a",
        contentHash: "hash-a",
        text: "architecture boundaries",
      },
      {
        chunkId: "b:0:hash-b",
        noteId: "b",
        contentHash: "hash-b",
        text: "travel coast",
      },
    ];

    const first = await buildEmbeddingSnapshot(
      "workspace",
      provider,
      chunks,
    );
    expect(first.stats).toEqual({
      totalChunks: 2,
      reusedChunks: 0,
      embeddedChunks: 2,
    });
    expect(provider.calls).toBe(2);

    const second = await buildEmbeddingSnapshot(
      "workspace",
      provider,
      chunks,
      first.snapshot,
    );
    expect(second.stats).toEqual({
      totalChunks: 2,
      reusedChunks: 2,
      embeddedChunks: 0,
    });
    expect(provider.calls).toBe(2);
  });

  it("drops deleted chunks and embeds only changed chunks", async () => {
    const provider = new FakeProvider();
    const first = await buildEmbeddingSnapshot("workspace", provider, [
      {
        chunkId: "a:0:hash-a",
        noteId: "a",
        contentHash: "hash-a",
        text: "architecture",
      },
      {
        chunkId: "b:0:hash-b",
        noteId: "b",
        contentHash: "hash-b",
        text: "travel",
      },
    ]);

    const next = await buildEmbeddingSnapshot(
      "workspace",
      provider,
      [
        {
          chunkId: "a:0:hash-new",
          noteId: "a",
          contentHash: "hash-new",
          text: "architecture changed",
        },
      ],
      first.snapshot,
    );

    expect(next.snapshot.embeddings).toHaveLength(1);
    expect(next.snapshot.embeddings[0]?.chunkId).toBe("a:0:hash-new");
    expect(next.stats.embeddedChunks).toBe(1);
  });
});

describe("cosineSimilarity", () => {
  it("compares normalized or unnormalized vectors", () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });
});
