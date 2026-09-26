# ADR-011 — Content-aware Drive conflicts and recovery copies

**Status:** Accepted

## Context

A provider metadata version can advance without a meaningful change to Markdown
content. Treating every metadata-version mismatch as a content conflict can
produce false positives and can leave a user unable to synchronize otherwise
valid edits.

A real conflict is also a data-safety event. Browser-local IndexedDB recovery is
valuable, but it should not be the only copy of unique local work when Drive
contains a divergent version.

## Decision

For Google Drive blob files, MindContext uses Drive's content revision
(`headRevisionId`) when available to protect Markdown writes. Generic provider
metadata revisions remain available for operations where a provider does not
expose a distinct content revision.

When a protected write reports a mismatch, MindContext reads the current remote
content and compares three values:

- BASE: canonical Markdown the local edit began from;
- LOCAL: the latest browser-local draft;
- REMOTE: current Markdown in Drive.

The following cases are resolved automatically:

1. REMOTE == LOCAL: the intended content is already canonical; mark synchronized.
2. LOCAL == BASE: there are no remaining local edits; accept REMOTE.
3. REMOTE == BASE: only metadata/baseline information changed; rebase LOCAL on
   the current remote revision and retry.
4. Otherwise both LOCAL and REMOTE diverged from BASE and the conflict is real.

Before presenting a real conflict, MindContext attempts to create a byte-for-byte
Markdown recovery copy of LOCAL under the reserved Drive directory:

`.mindcontext-recovery/`

Recovery copies are excluded from the normal workspace tree, knowledge graph,
search indexes, semantic embeddings and RAG projections.

Recovery copy names are deterministic for the source note, conflict revisions,
kind and local content hash so repeated retries of the same conflict do not
create unbounded duplicate files.

The user can explicitly resolve a real conflict by keeping the local version or
using the Drive version. Keeping the local version first preserves the remote
content as a second recovery copy before overwriting the canonical note.

Pending IndexedDB drafts are never deleted merely because a tab closes.

## Recovery lifecycle

Recovery files are temporary safety artifacts, not canonical knowledge. They
remain outside normal MindContext projections and are retained conservatively
until an explicit recovery-cleanup policy is implemented. Unresolved recovery
artifacts MUST NOT be automatically deleted.

A future cleanup UI may mark resolved recovery artifacts eligible for retention-
based deletion without changing the canonical Markdown model.

## Future multi-device synchronization

A future Drive change-feed layer can reuse the same BASE / LOCAL / REMOTE
reconciliation boundary. Remote change detection changes how conflicts are
noticed, not how they are safely resolved.
