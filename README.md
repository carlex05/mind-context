# MindContext — Constellation

MindContext is a privacy-first, local-first, Markdown-first knowledge workspace. Its visual identity is **Constellation**, built around the **Linked Star** mark and the idea that scattered notes gain value when they become connected context.

> **Markdown is the source of truth. Everything else is a disposable projection.**

> **Core Free Promise:** reading, writing, organizing and continuing to work with
> your own Markdown notes in MindContext will remain free. Existing notes will
> never be put behind a paywall.

User knowledge stays between the user's browser/device and storage selected by
the user. MindContext can now open a local folder directly through the browser
File System Access API, or use Google Drive through the existing provider.
MindContext-controlled infrastructure must not require note contents, embeddings,
search queries or RAG context.

## Current state

The repository currently includes:

- React + Vite responsive web shell inspired by a minimal Obsidian workspace;
- CodeMirror 6 Markdown editor + reading view;
- note tabs with browser-local recovery drafts, content-aware canonical-storage synchronization, hidden Markdown safety copies and a Settings Recovery Center;
- direct local-folder vaults backed by the browser File System Access API;
- browser-persisted recent local vault handles with permission-aware reopening;
- stable local workspace/file identities for restoring tabs and reusable derived indexes across reloads;
- Google Drive workspaces behind the same storage-provider contract;
- nested vault explorer that includes Markdown and ordinary attachments;
- arbitrary file attachment upload with portable Markdown references and Reading View image rendering;
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
- separate Astro public product site plus the React application under `/app`;
- GitHub Pages deployment workflow and public beta.

The next implementation order and acceptance criteria live in
[Current state and continuation roadmap](docs/architecture/current-state-and-roadmap.md).

For coding-agent continuity, read [AGENTS.md](AGENTS.md) before making
architecture changes. Visual/product work should also follow the
[Brand Foundation](docs/brand/brand-foundation.md).

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
https://carlex05.github.io/mind-context/        # public site
https://carlex05.github.io/mind-context/app/    # application
```

The public site is a static Astro build. The React application is published
under `/app/`. Compatible browsers can open a local folder directly without
Google authentication. Google Drive remains an optional provider and depends on
OAuth configuration.

See [deployment instructions](docs/deployment.md) and
[Architecture](docs/architecture/README.md).
