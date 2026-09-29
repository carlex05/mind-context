# Markdown and Obsidian compatibility

MindContext treats plain Markdown as canonical user-owned data.

The compatibility target is CommonMark + GitHub Flavored Markdown + the documented Obsidian base syntax that MindContext explicitly tracks.

## Compatibility levels

Support is tested at four independent levels:

1. Preserve — opening/saving never destroys the syntax.
2. Parse — local knowledge projections understand its semantics.
3. Render — Reading View presents it correctly.
4. Interact — navigation or interactive behavior works where applicable.

## Built-in Obsidian dialect

`@mind-context/markdown` owns the built-in Obsidian dialect boundary. P0 includes:

- YAML properties and wikilinks contained in text properties;
- tags and aliases;
- wikilinks plus Markdown internal links;
- same-note and cross-note heading links;
- Obsidian block references;
- highlights (`==text==`);
- comments (`%%text%%`), visible in editing and hidden in Reading View;
- standard and inline footnotes;
- callouts and foldable callouts;
- exact heading/block navigation in Edit and Reading views.

Comment hiding preserves source offsets by replacing hidden content with whitespace. This keeps heading/section positions stable for search, chunks and future RAG projections.

## P1 Rich Markdown

The built-in dialect now also includes:

- inline math with single-dollar delimiters;
- display math with double-dollar delimiters;
- MathJax rendering in Reading View, matching Obsidian's documented math engine;
- fenced `mermaid` diagrams rendered locally in the browser;
- Prism-compatible syntax highlighting for fenced code blocks with explicit languages, matching Obsidian's documented highlighter.

Math and fenced-code semantics are parsed by `@mind-context/markdown`. Mermaid is loaded lazily only when Reading View encounters a Mermaid fence, and its rendered SVG is a disposable projection. Mermaid uses its strict security level so note content cannot enable diagram click handlers or raw HTML behavior.

## Attachment compatibility

The vault now treats non-Markdown files as ordinary first-class storage objects.

Implemented behavior:

- arbitrary files can be uploaded into any selected vault folder;
- uploaded files appear in the normal file tree;
- when a note is open, upload inserts a portable relative Markdown reference;
- standard Markdown image references render from the active storage provider;
- Obsidian-style image embeds such as `![[image.png]]` render without rewriting the source;
- linked PDFs and other non-image files remain ordinary files and open/download on demand.

The renderer creates browser-local object URLs only after reading bytes directly from
the selected storage provider. Attachment contents are not sent to
MindContext-controlled infrastructure.

## Remaining compatibility slices

The overall compatibility goal still has separate work for:

- note transclusion embeds;
- richer inline PDF/audio/video rendering;
- attachment-reference rewriting across rename/move operations;
- remaining documented Obsidian base edge cases that surface from the full compatibility matrix, including HTML behavior and attachment-specific syntax.

Parser recognition alone does not mean Render/Interact compatibility is complete.

## Future plugin boundary

The MVP is not a plugin marketplace, but the built-in Obsidian implementation establishes the extension seam. A future installed syntax plugin may contribute parser/semantic extraction, transient Reading View transforms, editor completions/decorations, optional index projections and commands.

Plugins must not silently rewrite canonical Markdown as an installation side effect. Render transforms and indexes remain disposable projections.

Conceptually:

    canonical Markdown
           |
           v
    CommonMark / GFM parser
           |
           +-- built-in Obsidian dialect
           |
           +-- future installed syntax extensions
           |
           v
    semantic projections + Reading View

## Regression contract

Compatibility changes extend the shared Obsidian fixture and test the relevant Preserve / Parse / Render / Interact levels. Navigation syntax must be proven with browser interaction tests, not parser assertions alone.
