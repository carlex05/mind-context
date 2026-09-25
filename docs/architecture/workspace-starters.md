# Workspace starters and empty-vault onboarding

Decision record: [ADR-009](../adr/ADR-009-open-workspace-starters-and-empty-vault-onboarding.md).

MindContext may help a user start organizing a Second Brain, but starter
structures must never become proprietary workspace semantics.

## Supported starters

The initial onboarding supports:

- **Blank** — creates no note, folder or hidden application file.
- **PARA** — creates ordinary folders and Markdown guides.

PARA is a starter only. MindContext does not assume that a workspace contains
Projects, Areas, Resources or Archive after onboarding, and core features must
continue to work if the user renames or deletes any of those folders.

## Template language

Starter language is independent from interface locale and note language.

Current template locales:

- English
- Spanish

An English PARA starter uses:

```text
Start Here.md
Projects/
Areas/
Resources/
Archive/
```

A Spanish PARA starter uses:

```text
Empieza aquí.md
Proyectos/
Áreas/
Recursos/
Archivo/
```

Each PARA folder contains a normal `README.md` guide. Internal navigation uses
Obsidian-compatible wikilinks with explicit paths, which avoids ambiguity among
the repeated README basenames.

## Open-format rule

Starter generation may create only normal storage-provider directories and
plain Markdown files. It must not require a MindContext database, proprietary
frontmatter, hidden manifest or custom note syntax.

The generated workspace remains directly usable in Obsidian, VS Code, Git and
other Markdown tools.

## Existing empty workspaces

When opening an existing MindContext-managed workspace, the application checks
the actual storage-provider root children.

Onboarding is suggested only when:

```text
provider.list(provider.rootId).length === 0
```

This deliberately does not use the visible Markdown explorer as the emptiness
test. A workspace containing an attachment or another non-Markdown object is
not considered completely empty.

The suggestion offers:

- keep the workspace blank;
- build a PARA starter.

Choosing **keep blank** records only this browser-local preference:

```text
mindcontext.onboarding.handled.<workspace-id> = true
```

No dismissal marker is written into the user's storage. Clearing browser-local
state may therefore cause an empty workspace to be suggested again, which does
not affect canonical knowledge.

## Failure model

Starter creation uses ordinary storage operations and is not transactional
across multiple files. A provider/network failure can therefore leave a
partially-created starter. The application must surface that failure and must
not describe the operation as atomic.
