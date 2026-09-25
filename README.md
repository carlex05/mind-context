# MindContext

MindContext is a privacy-first, local-first, Markdown-first knowledge workspace.

> **Markdown is the source of truth. Everything else is a disposable projection.**

User knowledge stays between the user's browser/device and the storage provider
selected by the user. The first storage provider is Google Drive.
MindContext-controlled infrastructure must not require note contents, embeddings,
search queries or RAG context.

## Current state

The repository currently includes:

- React + Vite responsive web shell inspired by a minimal Obsidian workspace;
- CodeMirror 6 Markdown editor + reading view;
- note tabs with per-tab in-memory unsaved buffers;
- nested Drive-backed file explorer;
- safe note/folder create, rename, move and delete;
- conservative link rewriting on rename/move;
- one remark/mdast-based Markdown compatibility parser;
- YAML properties, tags, aliases, headings, standard links, wikilinks, embeds
  and block references;
- backlinks, broken-link projection and Local Graph;
- local lexical full-text search;
- revision-aware IndexedDB retrieval snapshots and heading-aware chunks;
- opt-in local multilingual semantic search in a Web Worker;
- WebGPU/WASM embedding inference and incremental embedding reuse;
- hybrid lexical + semantic ranking;
- English/Spanish/System UI locale support;
- Blank and PARA Second Brain onboarding in English/Spanish;
- empty-existing-vault onboarding suggestion;
- desktop/mobile Playwright coverage;
- GitHub Pages deployment workflow and public preview.

The next implementation order and acceptance criteria live in
[Current state and continuation roadmap](docs/architecture/current-state-and-roadmap.md).

For coding-agent continuity, read [AGENTS.md](AGENTS.md) before making
architecture changes.

## Architecture principles

- Plain Markdown is canonical.
- User-owned storage; no proprietary knowledge database.
- React is a delivery mechanism, not the application architecture.
- Domain and provider contracts remain framework-independent TypeScript.
- Derived indexes are browser-local, sensitive, disposable and rebuildable.
- Local AI is a first-class path.
- Cloud AI is optional and must cross an explicit permission boundary.
- The architecture is plugin-ready, but the MVP is not a plugin marketplace.
- Plugins must use capability APIs and must never receive storage credentials.
- UI flows must work on desktop and mobile without hover-only interactions.
- Interface locale, starter/template locale and note language are separate.
- PARA is a starter only; it is not a required vault structure.

See the [ADR index](docs/adr/README.md).

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

To exercise real Google Drive, configure a Google OAuth Web Client ID in
`.env.local`. See [Google Drive development setup](docs/google-drive-setup.md).

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

## Public preview

The project deploys to:

```text
https://carlex05.github.io/mind-context/
```

Google Drive availability in the deployed build depends on repository/environment
OAuth configuration. Without a configured Google Client ID, the site
intentionally exposes a non-persistent local editor preview.

See [deployment instructions](docs/deployment.md) and
[Architecture](docs/architecture/README.md).
