export interface Embedding {
  readonly dimensions: number;
  readonly values: readonly number[];
}

export type EmbeddingInputType = "query" | "document";

export interface EmbeddingRequestOptions {
  readonly inputType?: EmbeddingInputType;
}

export interface EmbeddingProvider {
  readonly id: string;
  readonly model: string;

  embed(
    texts: readonly string[],
    options?: EmbeddingRequestOptions,
  ): Promise<readonly Embedding[]>;
}

export interface ChunkEmbedding {
  readonly chunkId: string;
  readonly noteId: string;
  readonly contentHash: string;
  readonly providerId: string;
  readonly model: string;
  readonly dimensions: number;
  readonly values: readonly number[];
}

export interface EmbeddingIndexSnapshot {
  readonly schemaVersion: 1;
  readonly workspaceId: string;
  readonly providerId: string;
  readonly model: string;
  readonly builtAt: string;
  readonly embeddings: readonly ChunkEmbedding[];
}

export interface EmbeddingIndexSnapshotStore {
  get(
    workspaceId: string,
    providerId: string,
    model: string,
  ): Promise<EmbeddingIndexSnapshot | undefined>;
  put(snapshot: EmbeddingIndexSnapshot): Promise<void>;
  delete(
    workspaceId: string,
    providerId?: string,
    model?: string,
  ): Promise<void>;
}

export interface EmbeddingChunkInput {
  readonly chunkId: string;
  readonly noteId: string;
  readonly contentHash: string;
  readonly text: string;
}

export interface EmbeddingBuildStats {
  readonly totalChunks: number;
  readonly reusedChunks: number;
  readonly embeddedChunks: number;
}

export interface EmbeddingBuildResult {
  readonly snapshot: EmbeddingIndexSnapshot;
  readonly stats: EmbeddingBuildStats;
}

export async function buildEmbeddingSnapshot(
  workspaceId: string,
  provider: EmbeddingProvider,
  chunks: readonly EmbeddingChunkInput[],
  previous?: EmbeddingIndexSnapshot,
  batchSize = 8,
): Promise<EmbeddingBuildResult> {
  const reusable = new Map(
    previous &&
    previous.providerId === provider.id &&
    previous.model === provider.model
      ? previous.embeddings.map((item) => [item.chunkId, item])
      : [],
  );

  const reused: ChunkEmbedding[] = [];
  const missing: EmbeddingChunkInput[] = [];

  for (const chunk of chunks) {
    const cached = reusable.get(chunk.chunkId);
    if (
      cached &&
      cached.contentHash === chunk.contentHash &&
      cached.providerId === provider.id &&
      cached.model === provider.model
    ) {
      reused.push(cached);
    } else {
      missing.push(chunk);
    }
  }

  const created: ChunkEmbedding[] = [];
  for (let offset = 0; offset < missing.length; offset += batchSize) {
    const batch = missing.slice(offset, offset + batchSize);
    const vectors = await provider.embed(
      batch.map((chunk) => chunk.text),
      { inputType: "document" },
    );
    if (vectors.length !== batch.length) {
      throw new Error(
        `Embedding provider returned ${vectors.length} vectors for ${batch.length} inputs.`,
      );
    }

    for (let index = 0; index < batch.length; index += 1) {
      const chunk = batch[index];
      const vector = vectors[index];
      if (!chunk || !vector) continue;
      created.push({
        chunkId: chunk.chunkId,
        noteId: chunk.noteId,
        contentHash: chunk.contentHash,
        providerId: provider.id,
        model: provider.model,
        dimensions: vector.dimensions,
        values: [...vector.values],
      });
    }
  }

  const embeddings = [...reused, ...created].sort((left, right) =>
    left.chunkId.localeCompare(right.chunkId),
  );

  return {
    snapshot: {
      schemaVersion: 1,
      workspaceId,
      providerId: provider.id,
      model: provider.model,
      builtAt: new Date().toISOString(),
      embeddings,
    },
    stats: {
      totalChunks: chunks.length,
      reusedChunks: reused.length,
      embeddedChunks: created.length,
    },
  };
}

export function cosineSimilarity(
  left: readonly number[],
  right: readonly number[],
): number {
  if (left.length !== right.length || left.length === 0) return -1;

  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index] ?? 0;
    const b = right[index] ?? 0;
    dot += a * b;
    leftNorm += a * a;
    rightNorm += b * b;
  }

  if (leftNorm === 0 || rightNorm === 0) return -1;
  return dot / Math.sqrt(leftNorm * rightNorm);
}
