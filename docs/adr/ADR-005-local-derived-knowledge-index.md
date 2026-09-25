# ADR-005 — Local derived knowledge index

**Status:** Accepted

## Context

Wikilinks, backlinks, graph navigation and future retrieval require structure
derived from the user's Markdown files.

That derived structure is sensitive but is not canonical knowledge.

## Decision

MindContext builds the knowledge index in the browser from Markdown read through
the active `StorageProvider`.

The initial graph projection contains note identifiers and paths, headings,
tags, outgoing wikilinks, resolved edges, backlinks and broken-link state.

The projection is cached in browser IndexedDB through a dedicated adapter. It
does not become a source of truth and must be fully rebuildable from storage.

MindContext keeps separate local projections for graph metadata and full-text
retrieval. The retrieval snapshot may contain Markdown text and semantic chunks
in IndexedDB because it is local, sensitive, disposable derived state.

On workspace open or refresh, provider metadata is enumerated and the retrieval
snapshot is compared with the provider revision. When the revision is unchanged,
the local Markdown text and existing chunks are reused. Changed or newly created
notes are downloaded and re-indexed; deleted notes disappear from the rebuilt
snapshot.

A provider that cannot expose a stable revision MUST NOT claim this reuse
optimization merely from a filename or local cache entry.

## Link resolution

Resolution prefers an explicit relative workspace path. A basename may resolve
when it identifies exactly one note.

MindContext MUST NOT silently choose between duplicate basenames. Such links are
marked ambiguous.

A link to a missing note or missing heading is retained as a broken edge.

## Consequences

- Deleting IndexedDB cannot destroy user knowledge.
- Backlinks require no server-side database.
- Nested workspace folders can participate in the graph even before the file
  explorer supports full folder navigation.
- IndexedDB may contain sensitive derived copies of Markdown and therefore must
  remain browser-local and outside telemetry.
- Clearing IndexedDB cannot destroy knowledge; the next rebuild can recover all
  projections from canonical storage.
- Revision-based reuse reduces content downloads while still enumerating remote
  metadata to detect additions, deletions and changes.
- Chunk IDs are stable for unchanged chunk text so future local embeddings can
  be reused incrementally.
