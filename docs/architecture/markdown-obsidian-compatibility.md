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

## Outside P0

The overall compatibility goal still has separate slices for:

- LaTeX/math rendering;
- Mermaid;
- richer fenced-code highlighting;
- note transclusion and embeds;
- images, PDFs, audio/video and other attachments.

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
