# ADR-012: Storage-agnostic workspaces and direct local-folder vaults

- Status: Accepted
- Date: 2026-09-29

## Context

MindContext originally shipped with Google Drive as its first canonical storage
provider. The existing architecture already isolates storage behind
`StorageProvider`, and ADR-006 requires an open vault model compatible with
ordinary Markdown folders and Obsidian-style conventions.

A user with an existing Markdown or Obsidian vault should not have to import,
convert or copy that knowledge into a MindContext-owned format merely to use the
application. The same product promise also implies that Google Drive must remain
a provider choice rather than part of MindContext's canonical data model.

Modern browsers expose user-selected local directories through the File System
Access API. This path can keep files directly on the user's filesystem while the
application continues to build search, graph and semantic projections locally.

## Decision

MindContext workspaces are storage-provider agnostic.

The application supports two canonical provider paths:

1. Google Drive, under the existing narrow `drive.file` integration.
2. A direct browser-local folder selected explicitly by the user through the
   File System Access API.

For a local vault:

- the selected directory itself is canonical;
- MindContext does not copy notes into OPFS, IndexedDB or a proprietary
  database;
- Markdown files and ordinary attachments are read and written in place;
- existing Obsidian vaults can be opened without conversion;
- unknown files and tool-specific metadata are preserved;
- derived indexes, tabs, recovery drafts and optional embeddings remain
  browser-local projections;
- the same `StorageProvider` contract powers explorer, editing, attachments,
  starters, search and graph behavior;
- local provider object IDs remain stable during MindContext-driven rename/move
  operations within the active session so open tabs and knowledge references do
  not become path-coupled.

The local provider may implement rename/move as copy-then-delete when the
browser API does not expose an atomic filesystem move. The implementation must
preflight target collisions and attempt to remove a partial target if source
deletion fails, but it must not claim transactionality that the underlying API
cannot guarantee.

## Permission model

Opening a local vault must be initiated by an explicit user action. The
application requests read/write directory access only for the directory chosen
by the user.

The first local-vault slice does not silently persist and reopen folder access
across a fully closed browser session. A future enhancement may store
structured-cloneable directory handles in IndexedDB, but must re-check browser
permissions and require user interaction when reauthorization is needed.

When direct local-folder access is unavailable, MindContext must not silently
substitute OPFS or IndexedDB as canonical note storage. A future compatibility
fallback may offer an explicit import/copy workflow instead.

## Consequences

### Positive

- Existing Markdown and Obsidian users can open their vault in place.
- Google Drive is no longer part of the product's canonical storage definition.
- Local folders, future cloud providers and existing Drive workspaces share the
  same domain and UI behavior.
- The privacy story becomes stronger: a fully local canonical path requires no
  Google account and no MindContext storage backend.

### Tradeoffs

- `showDirectoryPicker()` is not available in every browser.
- Browser permission state can require reauthorization after the browser
  session ends.
- Path-based filesystems do not naturally provide Drive-style stable object IDs,
  so the adapter must maintain session-local logical IDs.
- Filesystem rename/move operations may not be atomic through the browser API.

## Relation to earlier ADRs

This ADR **amends ADR-004**: Google Drive remains an accepted provider and keeps
its `drive.file` scope, but it is no longer the sole canonical storage path.

It reinforces:

- ADR-001: Markdown remains the source of truth.
- ADR-002: no MindContext server-side knowledge storage is required.
- ADR-006: an open vault remains compatible with ordinary Markdown/Obsidian
  folders.
- ADR-007: storage mutations must remain conservative and preserve links where
  possible.
