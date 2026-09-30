# ADR-013 — Plugin-driven file types and JSON Canvas

**Status:** Accepted

## Context

MindContext originally opened Markdown notes as tabs and treated every other
vault file as an attachment. That model does not scale to editable open formats
such as JSON Canvas or Excalidraw, and adding extension checks directly to the
workspace shell would couple the core application to every future file type.

ADR-003 already establishes plugin-ready boundaries and requires extensions to
use intentional capability APIs without receiving storage credentials. ADR-006
requires open vault interoperability and rejects proprietary canonical formats
when an open representation exists.

## Decision

Workspace tabs represent **file resources**, not only Markdown notes.

MindContext resolves editable file behavior through a capability-gated
`FileTypeRegistry`. A plugin registers:

- one or more filename extensions;
- whether the canonical content is text or binary;
- a framework-neutral `viewType` resolved by the delivery layer.

The extension host owns registration and capability checks. Plugins do not
receive `StorageProvider`, Google Drive credentials or local directory handles.

Markdown remains a built-in file handler because it is the core knowledge model.
Markdown-only projections such as backlinks, lexical search, embeddings and RAG
must not automatically index arbitrary plugin files.

Textual plugin files reuse the existing browser-local draft, deferred provider
sync, revision conflict and recovery pipeline. Recovery copies preserve the
source file type instead of coercing plugin content into Markdown.

### JSON Canvas

Canvas is implemented as a bundled first-party plugin rather than a special
workspace feature.

The canonical format is JSON Canvas 1.0 using ordinary `.canvas` files. The
framework-independent `@mind-context/json-canvas` package owns parsing,
serialization and format-safe mutations. React rendering stays in the web
delivery layer.

Unknown top-level and node/edge properties are preserved during supported edits
so MindContext does not destroy forward-compatible or tool-specific data merely
because it does not understand it yet.

The first Canvas editor slice supports:

- opening `.canvas` from the normal vault explorer;
- persistent tabs;
- pan/zoom viewport;
- text, file, link and group node presentation;
- moving nodes;
- editing text nodes;
- adding text nodes;
- displaying edges and labels;
- opening referenced vault files where resolvable;
- the same autosave/conflict/recovery path as other textual resources.

Creation UX, node resize/connect tooling and richer file previews are additive
Canvas slices and must use the same plugin/file-type boundary.

## Consequences

- New editable file types no longer require extension-specific branches in
  `App.tsx`.
- Excalidraw can register `.excalidraw` and later
  `.excalidraw.md` through the same seam.
- A future plugin SDK can expose the same framework-neutral registration
  contract while placing third-party execution behind an enforceable isolation
  boundary.
- The workspace shell is more general, while the knowledge model remains
  intentionally Markdown-centric.
