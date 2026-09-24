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

The first implementation performs a complete workspace rebuild when a workspace
is opened or explicitly refreshed, and incremental graph recomputation after a
note is created or saved.

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
- Full rebuild cost must be benchmarked before large-workspace optimization.
- Future incremental synchronization may use provider revision/change metadata.
