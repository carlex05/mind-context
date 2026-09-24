export interface Embedding {
  readonly dimensions: number;
  readonly values: readonly number[];
}

export interface EmbeddingProvider {
  readonly id: string;
  readonly model: string;

  embed(texts: readonly string[]): Promise<readonly Embedding[]>;
}
