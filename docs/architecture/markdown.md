# Markdown model

MindContext has one canonical parser boundary.

## Rule

The editor edits text. The parser derives knowledge structure.

```text
Markdown text
     |
     v
remark / mdast
     |
     +--> headings / sections
     +--> [[wikilinks]]
     +--> tags
     +--> future chunks
     +--> future backlinks
     +--> future search documents
```

The UI, backlinks, search and future RAG pipeline should not implement
independent Markdown interpretations.

## Wikilink dialect

The initial supported forms are:

```text
[[Note]]
[[Note#Heading]]
[[Note|Alias]]
[[Note#Heading|Alias]]
```

Wikilinks inside inline code or fenced code blocks are not indexed.

This syntax is intentionally represented in plain Markdown text. No proprietary
database representation is canonical.
