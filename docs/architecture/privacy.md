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
