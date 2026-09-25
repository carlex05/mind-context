import type {
  Embedding,
  EmbeddingProvider,
} from "@mind-context/embeddings";

export const DEFAULT_BROWSER_EMBEDDING_MODEL =
  "Xenova/paraphrase-multilingual-MiniLM-L12-v2";

export type BrowserEmbeddingProgress = {
  readonly phase: "loading" | "ready";
  readonly message: string;
};

type ProgressListener = (progress: BrowserEmbeddingProgress) => void;

type FeatureExtractionPipeline = (
  inputs: string | readonly string[],
  options: {
    readonly pooling: "mean";
    readonly normalize: true;
  },
) => Promise<{
  tolist(): unknown;
}>;

export class BrowserEmbeddingProvider implements EmbeddingProvider {
  readonly id = "transformers-js-browser";
  readonly model: string;

  private pipelinePromise: Promise<FeatureExtractionPipeline> | undefined;
  private runtimeValue: "webgpu" | "wasm" | undefined;

  constructor(
    private readonly onProgress?: ProgressListener,
    model = DEFAULT_BROWSER_EMBEDDING_MODEL,
  ) {
    this.model = model;
  }

  get runtime(): "webgpu" | "wasm" | undefined {
    return this.runtimeValue;
  }

  async embed(texts: readonly string[]): Promise<readonly Embedding[]> {
    if (texts.length === 0) return [];

    const extractor = await this.pipeline();
    const output = await extractor([...texts], {
      pooling: "mean",
      normalize: true,
    });
    const rows = normalizeRows(output.tolist());

    if (rows.length !== texts.length) {
      throw new Error(
        `Local embedding model returned ${rows.length} vectors for ${texts.length} inputs.`,
      );
    }

    return rows.map((values) => ({
      dimensions: values.length,
      values,
    }));
  }

  private pipeline(): Promise<FeatureExtractionPipeline> {
    if (!this.pipelinePromise) {
      this.pipelinePromise = this.createPipeline();
    }
    return this.pipelinePromise;
  }

  private async createPipeline(): Promise<FeatureExtractionPipeline> {
    this.onProgress?.({
      phase: "loading",
      message: "Loading local multilingual embedding model…",
    });

    const { pipeline } = await import("@huggingface/transformers");
    const hasWebGpu = Boolean(
      (navigator as Navigator & { gpu?: unknown }).gpu,
    );

    if (hasWebGpu) {
      try {
        const extractor = await pipeline(
          "feature-extraction",
          this.model,
          {
            device: "webgpu",
            dtype: "q8",
            progress_callback: (event: unknown) =>
              this.reportDownloadProgress(event),
          },
        );
        this.runtimeValue = "webgpu";
        this.onProgress?.({
          phase: "ready",
          message: "Local embedding model ready on WebGPU.",
        });
        return extractor as unknown as FeatureExtractionPipeline;
      } catch {
        this.pipelinePromise = undefined;
      }
    }

    const extractor = await pipeline(
      "feature-extraction",
      this.model,
      {
        dtype: "q8",
        progress_callback: (event: unknown) =>
          this.reportDownloadProgress(event),
      },
    );
    this.runtimeValue = "wasm";
    this.onProgress?.({
      phase: "ready",
      message: "Local embedding model ready on WASM.",
    });
    return extractor as unknown as FeatureExtractionPipeline;
  }

  private reportDownloadProgress(event: unknown): void {
    if (!isProgressEvent(event)) return;
    const percent =
      typeof event.progress === "number"
        ? Math.max(0, Math.min(100, Math.round(event.progress)))
        : undefined;
    this.onProgress?.({
      phase: "loading",
      message:
        percent === undefined
          ? "Downloading local embedding model…"
          : `Downloading local embedding model… ${percent}%`,
    });
  }
}

function normalizeRows(value: unknown): number[][] {
  if (!Array.isArray(value)) {
    throw new Error("Local embedding model returned an unexpected tensor.");
  }

  if (value.length > 0 && typeof value[0] === "number") {
    return [value.filter((item): item is number => typeof item === "number")];
  }

  return value.map((row) => {
    if (!Array.isArray(row)) {
      throw new Error("Local embedding model returned an unexpected row.");
    }
    return row.map((item) => {
      if (typeof item !== "number") {
        throw new Error("Local embedding model returned a non-numeric value.");
      }
      return item;
    });
  });
}

function isProgressEvent(
  value: unknown,
): value is { readonly progress?: number } {
  return typeof value === "object" && value !== null;
}
