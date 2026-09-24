# ADR-006 — Open vault format and Obsidian compatibility

**Status:** Accepted

## Context

MindContext exists to preserve user ownership and avoid application lock-in.

A user should be able to stop using MindContext and continue with the same
knowledge files in Obsidian, VS Code, Git, another Markdown editor, or custom
tooling.

Obsidian has become a widely used Markdown vault convention. Most of its
canonical data is plain Markdown plus YAML properties, standard Markdown links,
wikilinks and normal attachment files. Some features, such as block references,
are Obsidian extensions rather than CommonMark standards.

## Decision

MindContext MUST NOT introduce proprietary canonical note syntax or a proprietary
vault database.

A MindContext workspace SHOULD be directly usable as an Obsidian vault without a
conversion step.

MindContext MUST preserve and understand, where relevant:

- plain Markdown/CommonMark text;
- YAML frontmatter/properties;
- standard Markdown internal links;
- Obsidian-style wikilinks;
- heading links;
- Obsidian block references;
- embeds;
- tags and nested tags;
- aliases;
- normal files and attachment paths.

Obsidian-specific syntax may be supported for interoperability, but MindContext
MUST NOT require it. When an open-standard equivalent exists, both forms should
remain usable.

MindContext metadata that is not knowledge content MUST stay outside canonical
notes whenever practical and MUST be disposable/rebuildable.

## Compatibility policy

"Obsidian-compatible" refers to vault/file interoperability, not binary,
plugin-API, theme, Canvas, or behavioral parity with the Obsidian application.

Compatibility fixtures and automated tests MUST protect supported syntax from
regression.

Any future MindContext-only feature that would require proprietary canonical
syntax requires a new ADR and should be presumed rejected unless there is no
open representation.

## Consequences

- Existing Obsidian vaults become a target import/open workflow.
- Search, backlinks, chunks and RAG must consume the same compatibility parser.
- File rename/move operations eventually need safe link rewriting compatible
  with standard Markdown and Obsidian link conventions.
- Attachments stay ordinary files.
- The local index remains a projection and never replaces Markdown/YAML.
