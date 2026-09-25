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

interface EmbedRequest {
  readonly type: "embed";
  readonly requestId: number;
  readonly model: string;
  readonly texts: readonly string[];
}

type WorkerMessage =
  | {
      readonly type: "progress";
      readonly phase: "loading" | "ready";
      readonly message: string;
      readonly runtime?: "webgpu" | "wasm";
    }
  | {
      readonly type: "result";
      readonly requestId: number;
      readonly vectors: readonly (readonly number[])[];
      readonly runtime: "webgpu" | "wasm";
    }
  | {
      readonly type: "error";
      readonly requestId: number;
      readonly message: string;
    };

interface PendingRequest {
  readonly resolve: (embeddings: readonly Embedding[]) => void;
  readonly reject: (error: Error) => void;
}

export class BrowserEmbeddingProvider implements EmbeddingProvider {
  readonly id = "transformers-js-browser";
  readonly model: string;

  private workerValue: Worker | undefined;
  private requestId = 0;
  private readonly pending = new Map<number, PendingRequest>();
  private runtimeValue: "webgpu" | "wasm" | undefined;

  constructor(
    private readonly onProgress?: ProgressListener,
    model = DEFAULT_BROWSER_EMEDDING_MODEL_FALLBACK,
  ) {
    this.model = model;
  }

  get runtime(): "webgpu" | "wasm" | undefined {
    return this.runtimeValue;
  }

  embed(texts: readonly string[]): Promise<readonly Embedding[]> {
    if (texts.length === 0) return Promise.resolve([]);

    const requestId = ++this.requestId;
    return new Promise((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
      const request: EmbedRequest = {
        type: "embed",
        requestId,
        model: this.model,
        texts: [...texts],
      };
      this.worker().postMessage(request);
    });
  }

  private worker(): Worker {
    if (this.workerValue) return this.workerValue;

    const worker = new Worker(
      new URL("./embedding.worker.ts", import.meta.url),
      { type: "module", name: "mindcontext-embeddings" },
    );
    worker.addEventListener("message", (event: MessageEvent<WorkerMessage>) => {
      const message = event.data;

      if (message.type === "progress") {
        if (message.runtime) this.runtimeValue = message.runtime;
        this.onProgress?.({
          phase: message.phase,
          message: message.message,
        });
        return;
      }

      const pending = this.pending.get(message.requestId);
      if (!pending) return;
      this.pending.delete(message.requestId);

      if (message.type === "error") {
        pending.reject(new Error(message.message));
        return;
      }

      this.runtimeValue = message.runtime;
      pending.resolve(
        message.vectors.map((values) => ({
          dimensions: values.length,
          values: [...values],
        })),
      );
    });
    worker.addEventListener("error", (event) => {
      const error = new Error(
        event.message || "Local embedding worker failed.",
      );
      for (const request of this.pending.values()) {
        request.reject(error);
      }
      this.pending.clear();
      worker.terminate();
      this.workerValue = undefined;
    });

    this.workerValue = worker;
    return worker;
  }
}

// Kept separate so constructor defaults remain statically evaluable in workers
// and Vite does not accidentally pull the model runtime into the main bundle.
const DEFAULT_BROWSER_EMEDDING_MODEL_FALLBACK =
  DEFAULT_BROWSER_EMBEDDING_MODEL;
