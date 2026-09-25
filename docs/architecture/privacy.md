# Privacy architecture

## Non-negotiable boundary

During core product usage, MindContext-controlled services MUST NOT receive:

- note contents;
- attachment contents;
- search queries over private notes;
- embeddings;
- RAG chunks;
- prompts containing private note context.

Canonical knowledge flows directly between the browser and the user's selected storage provider.

## External integrations

A future network-capable extension must explicitly declare:

- the capability it needs;
- the data scope it can read;
- the network domains it may contact.

Permissions are deny-by-default.

Storage provider credentials are never extension capabilities.

## Verification direction

The project should eventually include automated browser tests that create unique secret content and assert that the secret never appears in requests to MindContext-controlled domains during editing, indexing, search or local RAG.


## Browser-local pending drafts

Pending local drafts MAY contain user changes that have not reached canonical
storage yet. They are sensitive recovery state, remain browser-local and MUST
NOT be cleared together with disposable search/embedding indexes. Once a draft
is confirmed in canonical storage and no newer local edit exists, its pending
record should be removed.

## Browser-local derived copies

For incremental full-text retrieval, IndexedDB MAY contain local copies of
Markdown text, provider revisions, chunks and future embeddings. These are
sensitive derived data.

They MUST:

- remain on the user's device during the core local path;
- never be included in telemetry;
- remain fully reconstructible from canonical storage;
- never be required to recover the user's knowledge;
- use stable chunk/content fingerprints only for local change detection and
  reuse, not as an external identifier.
