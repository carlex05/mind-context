# Local knowledge index

The knowledge graph is a disposable browser projection.

```text
Google Drive Markdown
        |
        v
  Markdown parser
        |
        v
 Knowledge index
  |     |      |
links backlinks broken links
        |
        v
 IndexedDB cache
```

## Indexed data

The current snapshot contains:

- note provider ID and workspace-relative path;
- derived display title;
- headings;
- tags;
- raw wikilinks;
- resolved graph edges and broken-link state;
- provider revision/modified metadata when available.

The graph snapshot intentionally does not copy full Markdown note bodies.

Full-text retrieval is a separate projection. Its IndexedDB snapshot contains
the Markdown text required for lexical search plus heading-aware chunks and
provider revision metadata. That local text cache is sensitive but disposable;
it is never canonical and is not sent to MindContext-controlled services.

## Rebuild rule

Any IndexedDB derived-state database may be deleted and recreated solely by
reading the Markdown workspace through `StorageProvider`.

When a stable provider revision matches the persisted retrieval document,
MindContext may reuse that document and its chunks instead of downloading the
same Markdown again. A changed revision forces a fresh content read.

## Future evolution

Lexical search and heading-aware chunks are now implemented as a separate
derived projection. Embeddings and vector indexes should consume those chunks
without changing Markdown or turning the retrieval cache into canonical state.
