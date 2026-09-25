# ADR-008 — Opt-in local semantic search

**Status:** Accepted

## Context

MindContext already provides local lexical search over disposable browser
projections. Semantic search should improve retrieval across different wording
without requiring note content to be processed by MindContext-controlled
servers.

Browser embedding models are comparatively large and may require a first-use
download. Enabling semantic search therefore has a meaningful bandwidth and
storage cost even though inference itself is local.

## Decision

Semantic search is an optional local capability.

- The user must explicitly enable it.
- The initial browser provider uses Transformers.js feature extraction.
- The initial multilingual model is
  `Xenova/paraphrase-multilingual-MiniLM-L12-v2`.
- Embeddings are generated from heading-aware search chunks.
- WebGPU is preferred when available, with a WASM fallback.
- Chunk vectors are persisted in IndexedDB as disposable derived state.
- An embedding is reusable only when provider ID, model, chunk ID and
  content hash still match.
- Query embeddings are ephemeral.
- Hybrid search combines lexical and semantic rankings with reciprocal rank
  fusion rather than directly comparing raw lexical and cosine scores.

The provider remains behind the framework-independent `EmbeddingProvider`
contract. Transformers.js is an adapter/runtime choice, not a domain
dependency.

## Privacy

Loading a model may download model assets from the configured model host.

Markdown text, chunks, query text and resulting embeddings MUST remain in the
browser for this local provider. They MUST NOT be sent to MindContext-controlled
services or telemetry.

## Failure and fallback

Lexical search remains available when semantic search is disabled, loading,
unsupported or fails. A semantic-search failure must not block editing,
canonical Drive persistence, backlinks or lexical search.

## Consequences

- First use can require a substantial model download.
- Subsequent embedding work is incremental at chunk level.
- Browser storage may contain sensitive embedding vectors.
- Clearing semantic embeddings cannot destroy canonical knowledge.
- A future Ollama or other local embedding provider can replace the browser
  provider without changing search-domain contracts.
