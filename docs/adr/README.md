# Architecture Decision Records

Accepted decisions:

| ADR | Decision | Status |
| --- | --- | --- |
| [ADR-001](ADR-001-markdown-source-of-truth.md) | Markdown is canonical source of truth | Accepted |
| [ADR-002](ADR-002-no-server-knowledge-storage.md) | No server-side knowledge storage for core personal path | Accepted |
| [ADR-003](ADR-003-plugin-ready-boundaries.md) | Plugin-ready boundaries without an MVP plugin ecosystem | Accepted |
| [ADR-004](ADR-004-google-drive-file-scope-workspaces.md) | Google Drive `drive.file` + app-created workspaces | Accepted for MVP |
| [ADR-005](ADR-005-local-derived-knowledge-index.md) | Local, rebuildable derived knowledge/retrieval indexes | Accepted |
| [ADR-006](ADR-006-open-vault-obsidian-compatibility.md) | Open vault format + Obsidian interoperability | Accepted |
| [ADR-007](ADR-007-safe-vault-file-mutations.md) | Safe file mutations + conservative link rewriting | Accepted for MVP |
| [ADR-008](ADR-008-local-semantic-search.md) | Opt-in local semantic search | Accepted |
| [ADR-009](ADR-009-open-workspace-starters-and-empty-vault-onboarding.md) | Open-format workspace starters + empty-vault onboarding | Accepted |
| [ADR-010](ADR-010-persistent-local-drafts-and-deferred-drive-sync.md) | Persistent local drafts + deferred Drive synchronization | Accepted |

## ADR rule

If a proposed implementation conflicts with an accepted ADR, do not silently
change the implementation and documentation independently. Add a new ADR that
records the new context, decision and consequences, and explicitly state which
earlier decision is superseded or amended.
