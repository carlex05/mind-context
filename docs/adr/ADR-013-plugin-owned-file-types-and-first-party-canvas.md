# ADR-013 — Plugin-owned file types and first-party Canvas

- Status: Accepted
- Date: 2026-09-30

## Context

MindContext currently treats Markdown notes as the only editable tab content and
opens all other files as attachments. Canvas and Excalidraw introduce editable
file types that should not become hard-coded branches in the workspace shell.

ADR-003 already establishes capability-based extension boundaries and forbids
plugins from receiving storage credentials directly. ADR-006 requires open-vault
interoperability and rejects proprietary canonical formats when an open
representation exists.

## Decision

File-type ownership is extensible.

The workspace resolves files through a registry rather than through a growing
set of extension-specific conditionals. A registration declares:

- a stable file-type identifier;
- one or more filename extensions;
- whether the canonical payload is text or binary;
- its owner (core or plugin).

Markdown remains a built-in core file type. JSON Canvas support is implemented
as a bundled first-party plugin that registers `.canvas`. Excalidraw will use
the same mechanism for `.excalidraw` and later compatibility variants.

Plugins MUST NOT receive a `StorageProvider` or provider credentials. The host
owns reading, writing, recovery, autosave, revision checks and conflict handling
and exposes intentional capability APIs to extensions.

Bundled first-party plugins may ship with the application before arbitrary
third-party code loading, sandboxing or a marketplace exists.

## Consequences

- adding a supported editable extension does not require extension checks in the
  explorer or storage adapters;
- Canvas becomes the first real consumer used to shape the extension API;
- future plugin views can reuse the host document lifecycle instead of
  implementing independent synchronization;
- third-party plugin loading remains out of scope until an enforceable isolation
  boundary exists;
- JSON Canvas remains ordinary user-owned `.canvas` text in the selected
  storage provider.
