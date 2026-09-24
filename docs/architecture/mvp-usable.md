# Fastest path to a daily-usable MVP

The goal is not feature parity with Obsidian. The goal is a portable Second Brain
that can become the user's real vault immediately and grow safely.

## MVP usability gate

MindContext is considered ready for daily personal use when these flows are
reliable on desktop and mobile:

1. Open the same Drive-backed workspace repeatedly.
2. Browse nested folders and notes.
3. Create, edit, rename, move and delete Markdown notes safely.
4. Create folders.
5. Use standard Markdown links and Obsidian-compatible wikilinks.
6. See outgoing links, backlinks and broken links.
7. Search all note text locally and instantly.
8. Add/open ordinary attachments without proprietary storage.
9. Detect remote edit conflicts before overwrite.
10. Recover by rebuilding all local derived state from Drive.
11. Install/use the web app comfortably as a PWA on mobile.
12. Export/leave simply by opening the same files elsewhere.

## Implementation order

### Slice A — Vault compatibility and file management

- compatibility parser and regression fixtures;
- nested folder explorer;
- note/folder create, rename, move and delete;
- attachment inventory;
- link rewriting on rename/move;
- mobile file actions.

### Slice B — Local full-text search

- local search index from canonical Markdown;
- title/path/body/tag/property ranking;
- keyboard shortcut on desktop and accessible search action on mobile;
- no network calls for search.

### Slice C — Daily-use resilience

- autosave policy with conflict protection;
- reconnect/expired OAuth UX;
- PWA manifest/service worker/offline shell;
- clear local-index rebuild controls and status;
- end-to-end privacy and recovery tests.

After A–C, the vault can reasonably become the user's real Second Brain.

Semantic embeddings, local LLMs, RAG and graph visualization come after this
daily-use gate because they are additive intelligence, not prerequisites for
knowledge ownership.
