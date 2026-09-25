# ADR-009 — Open workspace starters and empty-vault onboarding

**Status:** Accepted

## Context

A new user can understand MindContext's storage model yet still not know how to
structure a useful Second Brain. PARA is a useful starter, but making PARA part
of the domain would create unnecessary lock-in and assumptions about folder
names.

The same problem occurs when a MindContext-managed workspace already exists but
contains no files or folders.

MindContext also supports multiple interface languages, while a user's notes may
contain any language. Starter language therefore cannot be inferred as a
permanent workspace language.

## Decision

MindContext supports reusable **workspace starters** that create only ordinary
storage-provider directories and plain Markdown files.

The initial starters are:

- **Blank** — create no canonical content.
- **PARA** — create Projects/Areas/Resources/Archive (or localized Spanish
  equivalents) plus Markdown guide notes and a start note.

The initial starter locales are English and Spanish.

### Language separation

These remain separate:

1. interface locale;
2. starter/template locale;
3. language(s) used in notes.

Choosing a Spanish starter does not assign a Spanish workspace language.
Changing UI locale does not rename or rewrite generated folders or notes.

### Open-format requirement

Starter output MUST NOT require:

- proprietary frontmatter;
- hidden MindContext manifests;
- a proprietary database;
- MindContext-only canonical syntax.

Generated files must remain directly usable by Obsidian and ordinary Markdown
tools.

PARA is only a bootstrap structure. No core feature may assume those directories
continue to exist or retain their original names.

### Existing empty workspaces

When an existing MindContext-managed workspace is opened, onboarding may be
suggested only when the actual storage root is completely empty:

```text
provider.list(provider.rootId).length === 0
```

Do not infer emptiness only from the Markdown explorer. A workspace containing
an attachment, unsupported file or directory is not empty.

The user may:

- keep the workspace blank; or
- apply the PARA starter.

Dismissing/keeping blank is browser-local UI state. The implementation may
record a key such as:

```text
mindcontext.onboarding.handled.<workspace-id> = true
```

No dismissal marker is written to canonical storage.

### Failure model

Applying a starter spans several normal storage operations and is not atomic.
A network/provider failure can therefore leave partial starter output.

The UI MUST surface partial failure and MUST NOT claim rollback or atomicity.
Retry/recovery behavior may be improved later, but must never overwrite existing
user files silently.

## Consequences

- Starter creation remains compatible with future storage providers.
- Templates can expand later without changing the canonical vault model.
- Clearing browser-local preferences can cause an empty workspace suggestion to
  reappear, which is harmless.
- Localized folder names are user content, not reserved paths.
- Tests must protect English and Spanish starter trees, guide wikilinks and
  empty-vault detection.
