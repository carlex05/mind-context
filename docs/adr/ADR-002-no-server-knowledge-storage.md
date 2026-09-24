# ADR-002 — No server-side knowledge storage

**Status:** Accepted

## Context

Privacy is a core product property, not only a policy statement.

## Decision

MindContext-controlled infrastructure will not be required to store or process user knowledge for the core personal product.

The browser communicates directly with the user's chosen storage provider.

## Consequences

- Hosting can remain predominantly static.
- Search, indexing and embeddings must be designed for client execution.
- Cloud integrations require a separate, explicit trust boundary.
- Operational telemetry must exclude private knowledge.
