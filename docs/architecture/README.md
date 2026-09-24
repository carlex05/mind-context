# Architecture

MindContext is designed as a browser-first application with no server-side knowledge plane.

## Runtime shape

```text
                       MindContext static hosting
                                |
                                | HTML / JS / CSS only
                                v
+----------------------------------------------------------------+
| Browser                                                         |
|                                                                 |
|  React UI                                                       |
|      |                                                          |
|  Application services                                          |
|      |                                                          |
|  +---+-----------+------------+-----------+----------------+    |
|  |               |                        |                |    |
| StorageProvider  Markdown/Search        Local AI       Extensions|
|  |               |                        |                |    |
| Google Drive   Derived local state    localhost LLM    Capability|
|                  (IndexedDB later)                       boundary |
+----------------------------------------------------------------+
       |
       v
 User-owned Google Drive
 Markdown + attachments
```

## Dependency rule

React MUST remain inside delivery/UI packages. Core domain, storage, Markdown, search, embeddings, AI and extension contracts are framework-independent TypeScript.

Google Drive MUST be accessed through the `StorageProvider` boundary.

Future plugins MUST use public capability APIs and MUST NOT receive storage credentials.

## Planned technology map

- React 19 + Vite 8 for the SPA/PWA shell.
- TypeScript with strict compiler settings.
- CodeMirror 6 for Markdown editing.
- unified / remark / mdast for Markdown parsing.
- IndexedDB + Dexie for disposable local indexes.
- Web Workers for indexing and embeddings.
- Transformers.js / ONNX Runtime Web with WebGPU and WASM fallback.
- OpenAI-compatible local LLM adapter for Ollama, LM Studio and compatible servers.
- Hybrid lexical + semantic retrieval.
- Cytoscape.js only when graph visualization reaches its vertical slice.
- Vitest + React Testing Library + Playwright.
- Static hosting; no application backend is required for the initial knowledge path.

Dependencies are intentionally introduced only when their vertical slice is implemented.
