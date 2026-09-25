# Workspace Shell v2

MindContext's application chrome is intentionally separate from canonical vault
data.

## Desktop composition

```text
icon rail | contextual left sidebar | tab bar + active workspace view | optional right context
```

The note canvas is the primary surface. Sidebars are supporting tools and may be
collapsed without affecting the active note.

## Primary panels

- Files
- Search
- Graph
- Tags
- Settings

Only one left panel is visible at a time. Search and Graph are shell extension
points before their full engines are implemented.

## Tabs

The first tab implementation supports Markdown notes. Tabs are local UI state,
not vault metadata.

Per workspace, localStorage may persist:

- open note IDs;
- active note ID;
- per-tab edit/read mode;
- selected left panel;
- left sidebar visibility;
- right sidebar visibility.

This state is disposable. Losing it must not lose knowledge.

Future tab/view kinds may include graph, search and plugin views without changing
the canonical Markdown model.

## Mobile

The desktop icon rail becomes a bottom navigation rail. The selected left panel
uses the content area as a temporary full-screen surface. Selecting a note
returns focus to the note view.

The right context panel likewise becomes a temporary full-screen surface.

## Architecture rule

Workspace shell code MUST NOT own Drive credentials, parse Markdown, or become a
source of knowledge. It orchestrates existing domain/provider boundaries only.
