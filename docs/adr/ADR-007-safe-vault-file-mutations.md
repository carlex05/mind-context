# ADR-007 — Safe vault file mutations and link maintenance

**Status:** Accepted for MVP

## Decision

MindContext exposes normal directory/file operations over StorageProvider:
create, rename, move and delete.

After every structural mutation, the local knowledge projection is rebuilt from
the canonical Drive files.

For rename/move, MindContext updates only links that were previously resolved
unambiguously by the knowledge index.

- Obsidian wikilinks are rewritten to a vault-relative target without the
  `.md` suffix.
- Standard Markdown note links are rewritten as paths relative to the source
  note.
- headings, block references, embeds and aliases are preserved.
- ambiguous and unresolved links are never guessed or rewritten.

Folder rename/move applies the same rule to descendant Markdown notes.

Google Drive does not provide an atomic transaction spanning an item move and
all backlink content rewrites. A partial failure must therefore be surfaced to
the user and followed by a full index rebuild; it must never be hidden.

Delete never edits incoming links automatically. The UI reports the number of
resolved incoming links that will become unresolved and requires confirmation.

## Rationale

This preserves portability and user intent. A broken visible link is safer than
silently rewriting an ambiguous link to the wrong note.
