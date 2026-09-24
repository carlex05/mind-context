# ADR-001 — Markdown as canonical source of truth

**Status:** Accepted

## Context

MindContext must preserve user ownership, portability and long-term survivability of knowledge.

## Decision

Plain Markdown files stored by the user's selected storage provider are the canonical representation of notes.

Indexes, backlinks, graph structures, chunks and embeddings are derived projections and MUST be rebuildable.

## Consequences

- No proprietary note database is required.
- Clearing local derived state cannot destroy knowledge.
- Features must tolerate rebuilding indexes from files.
- The supported Markdown dialect should remain deliberately small and documented.
