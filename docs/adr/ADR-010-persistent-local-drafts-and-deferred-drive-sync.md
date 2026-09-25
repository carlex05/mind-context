# ADR-010 — Persistent local drafts and deferred Drive synchronization

**Status:** Accepted

## Context

MindContext previously kept unsaved note buffers only in browser memory and
treated a manual Drive write as one long operation that also refreshed local
projections.

That creates two user-facing risks:

- a tab/browser failure can lose edits that have not reached Drive yet;
- editing again while a previous save is still in flight can race against the
  revision used by that write.

MindContext also needs a path toward future multi-device synchronization without
making a proprietary local database the canonical note store.

## Decision

Canonical notes remain plain Markdown in the selected storage provider.

While a note has local edits that are not yet confirmed by the provider,
MindContext MAY persist a **pending local draft** in browser IndexedDB. A pending
draft contains:

- workspace and note identifiers;
- the latest local Markdown content;
- the canonical content the draft was based on;
- the provider revision the draft was based on, when available;
- the local update timestamp.

Pending drafts are recovery/synchronization state, not canonical knowledge and
not a derived search/index projection. They are therefore stored separately
from disposable derived indexes.

Drive synchronization is deferred and single-flight per note:

1. local edits are persisted locally first;
2. Drive writes are debounced;
3. at most one remote write per note is in flight;
4. edits made during an in-flight write remain in the local draft and are
   synchronized in a subsequent write;
5. a successful Drive response advances the canonical baseline/revision;
6. a revision mismatch becomes an explicit conflict and MUST NOT overwrite the
   newer remote revision silently.

Local knowledge/search projections are updated after provider confirmation and
must not delay the UI from reporting that Drive synchronization completed.

## Future multi-device synchronization

The pending-draft record deliberately retains both `baseContent` and
`baseRevision`. A future Drive change-feed synchronization layer can compare:

- base canonical content/revision;
- latest local draft;
- latest remote content/revision;

and offer deterministic conflict detection or three-way merge behavior.

Adding remote change detection does not change the canonical-storage decision
and does not require a MindContext server.

## Consequences

- Closing or reloading the browser no longer has to discard recent local edits.
- Clearing/rebuilding derived indexes MUST NOT delete pending drafts.
- IndexedDB can temporarily contain unique unsynchronized user work and must be
  treated as sensitive recovery state.
- "Saved locally" and "Synced to Drive" are distinct states in the UI.
- A future offline/outbox implementation can extend the same pending-write
  boundary instead of replacing the editor model.
