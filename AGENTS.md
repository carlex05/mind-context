# AGENTS.md — MindContext continuation guide

This repository is the source of truth for continuing MindContext. Do not rely on
chat history when a repository document or accepted ADR answers the question.

## Product axiom

> **Markdown is the source of truth. Everything else is a disposable projection.**

MindContext is a privacy-first, browser-first Second Brain. Canonical user
knowledge lives in plain Markdown and ordinary files in user-owned storage.
MindContext-controlled infrastructure must not be required to store or process
note content for the core personal product.

## Read these before changing architecture

1. `docs/architecture/current-state-and-roadmap.md`
2. `docs/adr/README.md`
3. `docs/architecture/privacy.md`
4. `docs/architecture/compatibility.md`
5. `docs/architecture/i18n.md`
6. the ADR related to the vertical slice being changed.

Accepted ADRs are architectural constraints, not suggestions. If a change
conflicts with one, add a new ADR that explicitly supersedes the old decision
before changing code.

## Non-negotiable boundaries

- Canonical notes are plain Markdown; normal attachments remain normal files.
- Do not introduce a proprietary canonical vault database or required
  MindContext-only note syntax.
- Preserve Obsidian-compatible/open-vault interoperability.
- React is a delivery layer. Domain/storage/search/embedding/AI contracts remain
  framework-independent TypeScript.
- Storage provider APIs are accessed through `StorageProvider`.
- Google Drive uses `drive.file` and app-created/manageable workspaces for MVP.
- Derived browser state may contain sensitive data, but must be local,
  disposable and fully rebuildable from canonical storage.
- No note text, private search query, RAG context or embedding may be sent to
  MindContext-controlled telemetry/services.
- Local semantic search is opt-in; lexical search must continue to work if local
  AI is unavailable.
- Plugins/providers are separate concepts. Future plugins must never receive raw
  storage credentials.
- UI must remain usable on desktop and mobile without hover-only interactions.
- Interface locale, starter/template locale and note language are independent.
- PARA is a starter, not a domain model. Core features must not assume PARA
  folders exist.

## Current implementation shape

The repository already contains:

- responsive Obsidian-inspired workspace shell with icon rail/bottom navigation;
- Markdown tabs with per-tab in-memory unsaved buffers;
- CodeMirror 6 editing and Markdown reading view;
- nested Drive-backed file explorer and safe create/rename/move/delete;
- unified Markdown parser for headings, YAML properties, tags, aliases,
  standard internal links, wikilinks, embeds and block references;
- local knowledge graph, backlinks, broken links and Local Graph;
- local lexical full-text search;
- revision-aware persisted search snapshots and heading-aware retrieval chunks;
- opt-in multilingual semantic search using Transformers.js in a Web Worker,
  WebGPU with WASM fallback, IndexedDB embedding reuse and hybrid RRF ranking;
- English/Spanish UI with `system | en | es` browser-local preference;
- Blank/PARA Second Brain onboarding with English/Spanish Markdown guides;
- empty-existing-vault onboarding suggestion based on actual storage root
  emptiness;
- desktop/mobile Playwright coverage and GitHub Pages deployment.

See `docs/architecture/current-state-and-roadmap.md` for what is complete,
what needs hardening, and what should be implemented next.

## Development discipline

Prefer small vertical-slice commits. After a meaningful slice, verify:

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

CI and Pages are the final verification surface. Do not describe a slice as
finished while current HEAD is red.

For privacy-sensitive behavior, add a browser-level regression that proves the
network boundary, not only a unit test.

## Where new work should go

- Markdown semantics: `packages/markdown`
- graph/link projection: `packages/knowledge`
- lexical/semantic retrieval orchestration: `packages/search`
- embedding contracts/cache logic: `packages/embeddings`
- LLM contracts: `packages/ai`
- storage contracts: `packages/storage`
- Drive adapter: `packages/storage-google-drive`
- IndexedDB adapters: `packages/persistence-indexeddb`
- web adapters/UI only: `apps/web`

Do not put provider-specific behavior into domain packages.

## Immediate continuation order

1. Harden and regression-test onboarding/starter behavior.
2. Implement local Ask Second Brain / RAG with citations behind an
   OpenAI-compatible local `LLMProvider`.
3. Add daily-use capture flows (Daily Notes / Quick Capture) without proprietary
   canonical metadata.
4. Finish the remaining daily-use MVP resilience items: ordinary attachments,
   autosave/conflict UX, PWA/offline shell and explicit local-cache rebuild
   controls.
5. Treat Global Graph and broader plugin execution as later additive slices.

Detailed acceptance criteria are in
`docs/architecture/current-state-and-roadmap.md`.
