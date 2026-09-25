# Fastest path to a daily-usable MVP

The goal is not feature parity with Obsidian. The goal is a portable Second Brain
that can become the user's real vault immediately and grow safely.

## MVP usability gate

| Capability | Status |
| --- | --- |
| Reopen the same Drive-backed workspace | Implemented |
| Browse nested folders and notes | Implemented |
| Create/edit/rename/move/delete Markdown safely | Implemented |
| Create folders | Implemented |
| Standard Markdown links + Obsidian-compatible wikilinks | Implemented |
| Outgoing links, backlinks and broken links | Implemented |
| Local full-text search | Implemented |
| Local Graph | Implemented |
| Revision conflict detection before overwrite | Implemented |
| Rebuild local derived state from Drive | Implemented |
| English/Spanish UI | Implemented |
| Blank/PARA onboarding | Implemented; dedicated hardening tests still required |
| Ordinary attachments | Pending |
| Autosave with conflict-safe UX | Pending |
| Installable PWA / offline shell | Pending |
| Explicit rebuild/clear controls for all derived caches | Partial |
| Comfortable daily mobile capture | Partial |
| Leave/export by opening the same files elsewhere | Architectural invariant; import/open UX remains limited by Drive scope |

## Intelligence already implemented

These were originally planned after the basic daily-use gate, but have already
been delivered:

- heading-aware retrieval chunks;
- local semantic embeddings;
- incremental embedding cache;
- hybrid lexical + semantic search;
- Local Graph.

They remain additive intelligence and must not weaken the ownership/privacy
requirements of the core vault.

## Immediate implementation order

### Slice 0 — Harden onboarding

Before expanding onboarding:

- test Blank creation;
- test English and Spanish PARA trees/guides;
- test empty-existing workspace suggestion and Keep blank persistence;
- test non-empty roots containing non-Markdown objects;
- test race protection before applying a starter;
- test partial provider failure behavior.

See [Current state and roadmap](current-state-and-roadmap.md).

### Slice 1 — Ask Second Brain / local RAG

- OpenAI-compatible local `LLMProvider`;
- browser-to-localhost CORS/PNA feasibility spike;
- context builder from hybrid retrieval;
- source/citation model;
- Ask UI;
- answer language follows the user's question;
- privacy tests proving private context goes only to the configured local
  endpoint.

### Slice 2 — Daily capture

- Daily Notes;
- Quick Capture;
- optional Inbox convention;
- shortcuts/commands;
- plain-Markdown templates only.

### Slice 3 — Daily-use resilience

- ordinary attachments;
- autosave policy with revision protection;
- reconnect/expired OAuth UX hardening;
- PWA manifest/service worker/offline shell;
- explicit local-index rebuild/clear controls;
- privacy/recovery regressions.

## Later

- Global Graph;
- arbitrary existing Drive-vault import/open;
- cloud LLM integrations with explicit consent;
- third-party plugin execution/marketplace;
- real-time collaboration/CRDT.

The exact continuation criteria are maintained in
[Current state and continuation roadmap](current-state-and-roadmap.md).
