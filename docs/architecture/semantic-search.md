# Semantic search

Semantic retrieval is a local, disposable projection layered on top of the
heading-aware chunks produced by the lexical retrieval pipeline.

```text
Google Drive Markdown
        |
        v
 SearchDocument / chunks
        |
        +--------------------+
        |                    |
        v                    v
 lexical index        EmbeddingProvider
                             |
                             v
                     chunk embeddings
                             |
                             v
                         IndexedDB
        |                    |
        +---------+----------+
                  |
                  v
        Reciprocal Rank Fusion
                  |
                  v
             search results
```

## Incremental embedding rule

Each chunk has a stable content fingerprint. An embedding may be reused only
when all of these still match:

- chunk ID;
- chunk content hash;
- embedding provider ID;
- model ID.

Changed chunks are embedded again. Unchanged chunks are reused. Embeddings for
deleted chunks disappear from the next snapshot.

## Browser provider

The web adapter lazily imports Transformers.js. No model is loaded for users who
keep semantic search disabled.

The initial provider:

- uses `Xenova/multilingual-e5-small`;
- uses `query:` inputs for search queries and `passage:` inputs for chunks;
- uses feature extraction with mean pooling and normalization;
- runs inference in a Web Worker;
- prefers WebGPU;
- falls back to WASM;
- uses an 8-bit model variant where available;
- keeps inference local to the browser.

## Hybrid ranking

Lexical and semantic scores have unrelated numerical scales. MindContext does
not add those raw scores directly. Instead it applies reciprocal rank fusion to
the two ranked result lists.

## Canonical-state rule

Neither embeddings nor semantic ranking are canonical. Deleting the embedding
database must leave every Markdown note intact and allow the semantic index to
be rebuilt later.
