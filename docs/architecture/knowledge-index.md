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

The snapshot intentionally does not copy full Markdown note bodies.

## Rebuild rule

Any IndexedDB knowledge-index database may be deleted and recreated solely by
reading the Markdown workspace through `StorageProvider`.

## Future evolution

Full-text search, chunks, embeddings and vector indexes remain separate derived
projections even if they share the same browser persistence technology.
