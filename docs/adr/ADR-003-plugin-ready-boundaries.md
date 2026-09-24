# ADR-003 — Plugin-ready boundaries without an MVP plugin ecosystem

**Status:** Accepted

## Context

Future integrations and extensions are important, but building a marketplace and arbitrary third-party execution would overcomplicate the MVP.

## Decision

The MVP establishes stable provider and extension contracts and a capability vocabulary.

The MVP does not need a public plugin marketplace or arbitrary third-party plugin loading.

Extensions MUST NOT receive storage-provider credentials and MUST eventually execute across an enforceable isolation boundary.

## Consequences

- Core features should expose intentional APIs rather than internal state.
- Providers and plugins remain conceptually separate.
- Plugin sandboxing remains a technical spike before third-party execution is enabled.
