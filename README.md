# MindContext

MindContext is a privacy-first, local-first, Markdown-first knowledge workspace.

> **Markdown is the source of truth. Everything else is a disposable projection.**

User knowledge stays between the user's browser/device and the storage provider selected by the user. The first storage provider is Google Drive. MindContext-controlled infrastructure must not require note contents, embeddings, search queries, or RAG context.

## Current state

The repository now contains:

- React + Vite responsive web shell.
- CodeMirror 6 Markdown editor.
- a single remark/mdast-based Markdown parser boundary.
- headings, sections, tags and `[[wikilinks]]` extraction.
- Google Drive `drive.file` storage adapter.
- conflict detection before overwriting Drive content.
- desktop and mobile Playwright coverage.
- privacy tests that assert secret Markdown content only reaches the Drive upload endpoint.
- GitHub Pages deployment workflow with a credential-free editor preview.

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
- UI flows must work on desktop and mobile without hover-only interactions.

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

The project is prepared for GitHub Pages at:

```text
https://carlex05.github.io/mind-context/
```

GitHub Pages needs one-time repository enablement before the first deployment.
See [deployment instructions](docs/deployment.md).

Without a configured Google Client ID, the deployed site intentionally exposes a
non-persistent local editor demo so the responsive UI and Markdown parser can be
tested safely.

See [Architecture](docs/architecture/README.md).
