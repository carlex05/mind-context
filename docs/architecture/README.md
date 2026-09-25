# Architecture

MindContext is a browser-first application with no server-side knowledge plane.

## Runtime shape

```text
                         static web hosting
                                |
                                v
+--------------------------------------------------------------------+
| Browser                                                             |
|                                                                     |
| React workspace shell                                               |
|      |                                                              |
| application/domain contracts                                       |
|      |                                                              |
| +----+-----------+--------------+----------------+----------------+ |
| |                |              |                |                | |
| StorageProvider  Markdown       Search/Graph     Local AI         | |
| |                |              |                |                | |
| Google Drive     parser         IndexedDB        Web Worker       | |
| direct API       boundary       projections      embeddings      | |
|                                                  localhost LLM*    | |
+--------------------------------------------------------------------+
       |
       v
 user-owned Google Drive

* localhost LLM is the next planned RAG slice, not yet a completed capability.
```

## Dependency rule

React MUST remain inside delivery/UI packages. Core domain, storage, Markdown,
search, embeddings, AI and extension contracts are framework-independent
TypeScript.

Google Drive MUST be accessed through the `StorageProvider` boundary.

Future plugins MUST use public capability APIs and MUST NOT receive storage
credentials.

## Implemented technology map

- React 19 + Vite 8 SPA shell.
- TypeScript strict mode.
- CodeMirror 6 Markdown editor.
- unified / remark / mdast parser boundary.
- IndexedDB + Dexie for disposable knowledge/search/embedding projections.
- Web Workers for local embedding inference.
- Transformers.js with WebGPU + WASM fallback.
- multilingual E5 embeddings.
- local lexical + semantic hybrid retrieval.
- Cytoscape.js Local Graph.
- i18next/react-i18next for bundled English/Spanish UI.
- Vitest + Playwright desktop/mobile.
- static GitHub Pages deployment.

## Planned next integration

An OpenAI-compatible local LLM adapter for Ollama, LM Studio and compatible
servers is planned for Ask Second Brain / RAG. It must preserve the privacy
boundary described in ADR-002 and must not introduce a cloud relay for note
content.

## Navigation

- [Current state and roadmap](current-state-and-roadmap.md)
- [MVP daily-use gate](mvp-usable.md)
- [Privacy](privacy.md)
- [Open-vault compatibility](compatibility.md)
- [Markdown](markdown.md)
- [Knowledge index](knowledge-index.md)
- [Semantic search](semantic-search.md)
- [Workspace shell](workspace-shell.md)
- [Internationalization](i18n.md)
- [Workspace starters](workspace-starters.md)
- [Architecture Decision Records](../adr/README.md)

Dependencies are introduced only when their vertical slice is implemented.
