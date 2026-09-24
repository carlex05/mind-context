# MindContext

MindContext is a privacy-first, local-first, Markdown-first knowledge workspace.

The long-term product thesis is simple:

> **Markdown is the source of truth. Everything else is a disposable projection.**

User knowledge stays between the user's browser/device and the storage provider selected by the user. The first storage provider is Google Drive. MindContext-controlled infrastructure must not require note contents, embeddings, search queries, or RAG context.

## Architecture principles

- Plain Markdown is canonical.
- User-owned storage; no proprietary knowledge database.
- React is a delivery mechanism, not the application architecture.
- Domain and provider contracts remain framework-independent TypeScript.
- Derived indexes are local and rebuildable.
- Local AI is a first-class path.
- Cloud AI is optional and must cross an explicit permission boundary.
- The architecture is plugin-ready, but the MVP is not a plugin marketplace.
- Plugins must use capability APIs and must never receive storage credentials.

## Repository layout

```text
apps/
  web/                       React + Vite browser application

packages/
  core/                      Domain primitives and product principles
  storage/                   StorageProvider contract
  storage-google-drive/      Google Drive adapter + workspace discovery
  markdown/                  Markdown parsing/domain contract
  persistence/               Disposable local-derived-state contract
  search/                    Search and retrieval contracts
  embeddings/                Embedding provider contract
  ai/                        LLM provider contract
  extension-api/             Future capability-based extension API

docs/
  architecture/              Architecture rules and stack
  adr/                       Accepted architecture decisions
```

## Development

Requirements:

- Node.js 22+
- pnpm 10.34.5

```bash
corepack enable
pnpm install
cp .env.example .env.local
pnpm dev
```

To exercise the Google Drive slice, configure a Google OAuth Web Client ID in
`.env.local`. See [Google Drive development setup](docs/google-drive-setup.md).

Build the complete workspace:

```bash
pnpm build
```

Type-check all packages:

```bash
pnpm typecheck
```

## Current vertical slice

The browser can now be wired to:

```text
Browser <-> Google Drive <-> MindContext-created workspace <-> Markdown files
```

The UI is responsive from the start: desktop uses a split note/editor layout,
while narrow screens switch between the note list and editor with touch-sized
controls and no hover-only interactions.

The next storage milestone is to exercise this path against a configured Google
Cloud project, then add automated Drive-adapter and privacy/network tests.

See [Architecture](docs/architecture/README.md).
