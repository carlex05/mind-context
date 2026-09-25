type FeatureExtractionPipeline = (
  inputs: string | readonly string[],
  options: {
    readonly pooling: "mean";
    readonly normalize: true;
  },
) => Promise<{
  tolist(): unknown;
}>;

interface EmbedRequest {
  readonly type: "embed";
  readonly requestId: number;
  readonly model: string;
  readonly texts: readonly string[];
  readonly inputType: "query" | "document";
}

let pipelinePromise:
  | Promise<{
      readonly extractor: FeatureExtractionPipeline;
      readonly runtime: "webgpu" | "wasm";
    }>
  | undefined;
let loadedModel: string | undefined;

self.addEventListener("message", (event: MessageEvent<EmbedRequest>) => {
  if (event.data.type !== "embed") return;
  void handleEmbed(event.data);
});

async function handleEmbed(request: EmbedRequest): Promise<void> {
  try {
    const { extractor, runtime } = await getPipeline(request.model);
    const modelInputs = prepareInputs(
      request.model,
      request.texts,
      request.inputType,
    );
    const output = await extractor(modelInputs, {
      pooling: "mean",
      normalize: true,
    });
    const vectors = normalizeRows(output.tolist());

    if (vectors.length !== request.texts.length) {
      throw new Error(
        `Local embedding model returned ${vectors.length} vectors for ${request.texts.length} inputs.`,
      );
    }

    self.postMessage({
      type: "result",
      requestId: request.requestId,
      vectors,
      runtime,
    });
  } catch (error) {
    self.postMessage({
      type: "error",
      requestId: request.requestId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

function getPipeline(
  model: string,
): Promise<{
  readonly extractor: FeatureExtractionPipeline;
  readonly runtime: "webgpu" | "wasm";
}> {
  if (!pipelinePromise || loadedModel !== model) {
    loadedModel = model;
    pipelinePromise = createPipeline(model).catch((error) => {
      pipelinePromise = undefined;
      loadedModel = undefined;
      throw error;
    });
  }
  return pipelinePromise;
}

async function createPipeline(model: string) {
  self.postMessage({
    type: "progress",
    phase: "loading",
    message: "Loading local multilingual embedding model…",
  });

  const { pipeline } = await import("@huggingface/transformers");
  const hasWebGpu = Boolean(
    (globalThis.navigator as Navigator & { gpu?: unknown }).gpu,
  );

  if (hasWebGpu) {
    try {
      const extractor = await pipeline(
        "feature-extraction",
        model,
        {
          device: "webgpu",
          dtype: "q8",
          progress_callback: reportProgress,
        },
      );
      self.postMessage({
        type: "progress",
        phase: "ready",
        runtime: "webgpu",
        message: "Local embedding model ready on WebGPU.",
      });
      return {
        extractor: extractor as unknown as FeatureExtractionPipeline,
        runtime: "webgpu" as const,
      };
    } catch {
      // WebGPU support can fail for a specific browser/model even when the API
      // exists. Fall through to the portable WASM backend.
    }
  }

  const extractor = await pipeline(
    "feature-extraction",
    model,
    {
      dtype: "q8",
      progress_callback: reportProgress,
    },
  );
  self.postMessage({
    type: "progress",
    phase: "ready",
    runtime: "wasm",
    message: "Local embedding model ready on WASM.",
  });
  return {
    extractor: extractor as unknown as FeatureExtractionPipeline,
    runtime: "wasm" as const,
  };
}

function reportProgress(event: unknown): void {
  if (!isProgressEvent(event)) return;
  const percent =
    typeof event.progress === "number"
      ? Math.max(0, Math.min(100, Math.round(event.progress)))
      : undefined;
  self.postMessage({
    type: "progress",
    phase: "loading",
    message:
      percent === undefined
        ? "Downloading local embedding model…"
        : `Downloading local embedding model… ${percent}%`,
  });
}

function normalizeRows(value: unknown): number[][] {
  if (!Array.isArray(value)) {
    throw new Error("Local embedding model returned an unexpected tensor.");
  }

  if (value.length > 0 && typeof value[0] === "number") {
    return [
      value.map((item) => {
        if (typeof item !== "number") {
          throw new Error(
            "Local embedding model returned a non-numeric value.",
          );
        }
        return item;
      }),
    ];
  }

  return value.map((row) => {
    if (!Array.isArray(row)) {
      throw new Error("Local embedding model returned an unexpected row.");
    }
    return row.map((item) => {
      if (typeof item !== "number") {
        throw new Error(
          "Local embedding model returned a non-numeric value.",
        );
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


function prepareInputs(
  model: string,
  texts: readonly string[],
  inputType: "query" | "document",
): readonly string[] {
  if (!model.toLocaleLowerCase().includes("e5")) {
    return [...texts];
  }

  const prefix = inputType === "query" ? "query: " : "passage: ";
  return texts.map((text) => `${prefix}${text}`);
}
