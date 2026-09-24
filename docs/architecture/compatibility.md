# Vault compatibility

## Portability promise

A workspace is a directory tree of ordinary files.

```text
Vault/
├── Notes/
│   ├── Architecture.md
│   └── Privacy.md
├── Attachments/
│   └── diagram.png
└── Decisions/
    └── ADR-001.md
```

No MindContext database is required to understand the user's knowledge.

## Canonical formats

Preferred/open foundations:

- Markdown text;
- YAML properties/frontmatter;
- standard Markdown links and images;
- normal files for images, PDFs, audio and other attachments.

Compatibility syntax additionally understood:

- `[[Note]]`;
- `[[Note#Heading]]`;
- `[[Note|Alias]]`;
- `[[Note#^block-id]]`;
- `![[Note]]`;
- `![[image.png|640]]`.

Obsidian documents block references as an Obsidian-specific extension rather
than standard Markdown. MindContext understands them for vault
interoperability, but must never require them for core operation.

## Single parser rule

Editor, backlinks, full-text indexing, chunking and future RAG MUST derive
structure through `@mind-context/markdown`. Feature code must not invent a
second Markdown interpretation.

## Compatibility test fixtures

`packages/markdown/test/fixtures/` contains vault-format examples that exercise
supported Obsidian conventions. Adding support for a new syntax requires a
fixture and regression test.

## Still required for broad vault compatibility

- attachment inventory and preview;
- nested folder explorer;
- safe rename/move with link updates;
- file aliases in link suggestions;
- same-note and hierarchical heading navigation;
- block-reference navigation;
- imported/pre-existing vault selection;
- preservation tests against real-world Obsidian vault fixtures.
