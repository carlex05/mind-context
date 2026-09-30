# Current state and continuation roadmap

This document is the operational handoff for the next developer/agent. It
summarizes the implemented vertical slices, remaining risks and the recommended
order of work.

Verify current CI before assuming this snapshot is still valid.

## Product definition

MindContext is a browser-first, privacy-first Second Brain:

> **Markdown is the source of truth. Everything else is a disposable projection.**

The browser communicates directly with user-owned storage. The core personal
path does not require a MindContext server to process private knowledge.

Canonical storage is provider-neutral. The supported providers are now direct
local folders in compatible browsers and Google Drive. The supported canonical
note model is plain Markdown/YAML with open/Obsidian-compatible linking
conventions.

## Implemented vertical slices

### Storage and vault

- provider-neutral `StorageProvider` boundary;
- direct local-folder adapter using the browser File System Access API;
- local vaults open in place without import or format conversion;
- local files, attachments, folders, rename/move/delete and conflict revisions use the same workspace flows as Drive;
- unchanged local file IDs are deterministic across reloads from stable workspace identity + relative path;
- local object IDs remain stable within the active session when paths change through MindContext;
- selected local directory handles and stable workspace IDs are persisted in browser IndexedDB;
- the most recently opened local vault is restored automatically only while read/write permission is already granted;
- remembered vaults with expired permission remain visible and request reauthorization only after an explicit user action;
- local-folder access requires a compatible secure browser context and explicit initial selection;
- Google Drive adapter behind `StorageProvider`;
- `drive.file` least-privilege scope;
- MindContext-created/discoverable Drive workspace folders;
- nested directories;
- Markdown create/edit/delete;
- arbitrary binary attachment create/read behind the same provider boundary;
- vault explorer visibility for ordinary files and multi-file attachment upload;
- folder action popovers can attach directly into their target folder;
- file-tree action popovers overlay the tree instead of reflowing sibling nodes;
- workspace grid collapses absent sidebars without reserving ghost columns;
- file-tree Markdown selection follows the active tab as the single source of truth;
- portable Markdown references inserted for uploaded attachments;
- Reading View image resolution for standard Markdown images and Obsidian-style image embeds;
- linked non-image attachments open/download through the provider;
- folder create/delete;
- safe rename/move with conservative resolved-link rewriting;
- content-aware Drive conflict protection using blob content revisions when available;
- persistent browser-local pending drafts in a separate IndexedDB recovery store;
- debounced, single-flight Drive synchronization per note;
- BASE / LOCAL / REMOTE reconciliation before declaring a real conflict;
- hidden Markdown recovery copies under `.mindcontext-recovery/` for real conflicts;
- explicit local/syncing/synced/conflict/error note states and conflict resolution controls.

Important limitation: arbitrary pre-existing Google Drive folders are not a
general MVP workspace path under the current `drive.file` decision. Import/open
of arbitrary existing vaults remains a future explicit workflow.

### Markdown compatibility

The single parser boundary in `@mind-context/markdown` understands the
supported open-vault dialect, including:

- YAML frontmatter/properties;
- tags and nested tags;
- aliases;
- headings/sections;
- standard Markdown internal links/images;
- Obsidian wikilinks, including links stored in text properties;
- heading links with deep navigation;
- block references with deep navigation;
- highlights;
- comments with offset-preserving Reading View hiding;
- standard and inline footnotes;
- callouts, including foldable callouts;
- inline/display LaTeX math with MathJax Reading View rendering;
- Mermaid fenced diagrams rendered locally and lazily;
- Prism-compatible language-aware fenced-code highlighting;
- ordinary attachment links;
- standard Markdown image rendering from vault storage;
- Obsidian-style image embeds such as `![[image.png]]`;
- note transclusion remains a later slice.

Graph/search/RAG work should consume this shared interpretation rather than
inventing another parser. See
[Markdown and Obsidian compatibility](markdown-obsidian-compatibility.md) for
the Preserve / Parse / Render / Interact contract and future plugin seam.

### Public beta surface

- MindContext — Constellation / Linked Star brand foundation;
- shared design tokens for app and public site;
- Astro public product site with home, Privacy, Docs, Plugins, Roadmap,
  Changelog and Feedback pages;
- GitHub Issue Forms for bug reports and improvement requests;
- GitHub Pages composition with the React app published under `/app/`.

### Workspace UX

- minimal icon-rail shell on desktop;
- bottom navigation on mobile;
- Files/Search/Graph/Tags/Settings panels;
- note tabs;
- per-tab Edit/Read mode;
- Back/Forward navigation;
- Quick Switcher;
- shared Markdown authoring command registry powering a formatting toolbar,
  keyboard shortcuts and searchable `/` commands;
- toolbar helpers for headings, inline formatting, links, lists/tasks, quotes,
  fenced code and GFM tables;
- slash-only helpers for portable/Obsidian-compatible blocks such as dividers,
  wikilinks, callouts, display math and Mermaid;
- `[[` note autocomplete;
- Properties UI over canonical YAML;
- right-side Context panel for links/backlinks/properties;
- dark/light/system theme.

Pending edits are persisted browser-locally in a dedicated IndexedDB recovery
store before deferred canonical-storage synchronization. The selected provider
remains canonical. Pending drafts retain their base revision/content so
conflicts can be detected and future provider-specific reconciliation can build
on the same model.

### Plugin-driven file views and JSON Canvas

- workspace tabs are file-resource based rather than Markdown-ID based;
- `@mind-context/extension-api` exposes capability-gated file-type view registration;
- the web delivery layer owns an `ExtensionHost`, file-type registry and renderer registry;
- Markdown is the built-in text handler and remains the only automatic knowledge/search/embedding projection;
- Canvas ships as a bundled first-party plugin registered for `.canvas`;
- `@mind-context/json-canvas` owns framework-independent JSON Canvas parsing, serialization and mutations;
- Canvas text files reuse the same pending-draft, autosave, provider conflict and recovery pipeline as Markdown;
- recovery artifacts preserve plugin source file types;
- the current Canvas editor opens/creates canvases, pans/zooms, edits/adds text nodes, moves nodes, displays file/link/group nodes and edges, and opens referenced vault files;
- arbitrary third-party plugin loading, sandboxing and marketplace distribution remain future work.

### Internationalization

UI locales:

- English;
- Spanish;
- System preference.

Stored browser-locally under `mindcontext.locale`.

UI locale, starter locale and note language are independent. New blank notes are
created empty so the UI does not inject an English heading into user content.

### Search and graph

- local lexical search across title/path/aliases/tags/headings/body;
- incremental/revision-aware search snapshot in IndexedDB;
- heading-aware stable chunks;
- Local Graph from the knowledge projection;
- backlinks/broken links;
- semantic search opt-in only;
- `Xenova/multilingual-e5-small`;
- `query:` vs `passage:` E5 input semantics;
- Transformers.js inference in a Web Worker;
- WebGPU preferred, WASM fallback;
- chunk embeddings cached in IndexedDB by provider/model/chunk/content hash;
- hybrid lexical + semantic ranking via Reciprocal Rank Fusion;
- lexical fallback if semantic inference fails.

Model asset download is allowed only after explicit semantic-search opt-in.
Private note content is not sent to a MindContext server.

### Second Brain onboarding

The implementation includes:

- Blank starter;
- PARA starter;
- English and Spanish template languages;
- localized folder names/guides;
- `Start Here.md` / `Empieza aquí.md`;
- README guides inside each PARA folder;
- open-format wikilinks;
- reusable onboarding dialog;
- suggestion when an existing workspace's actual provider root is completely
  empty;
- browser-local "keep blank / handled" dismissal state.

See ADR-009 and `workspace-starters.md`.

## Immediate hardening — do this before RAG

The onboarding slice is integrated and current repository CI should be checked,
but it needs dedicated behavior tests before treating it as fully hardened.

### Required tests

1. **Create Blank**
   - creates workspace;
   - creates zero files/folders;
   - does not immediately re-prompt during that browser state.

2. **Create PARA / English**
   - exact expected tree;
   - expected five Markdown guides;
   - start note opens;
   - guide wikilinks resolve.

3. **Create PARA / Spanish**
   - localized tree;
   - accented folder names survive Drive adapter roundtrip;
   - guide wikilinks resolve.

4. **Existing completely empty workspace**
   - onboarding suggestion appears;
   - Keep blank dismisses and remains dismissed after reopen in same browser.

5. **Existing non-empty workspace**
   - no suggestion if root contains any file, directory or attachment, even if
     no Markdown note exists.

6. **Race protection**
   - if content appears after suggestion but before applying PARA, do not apply
     starter over the now-nonempty workspace.

7. **Partial provider failure**
   - surface an error;
   - never report atomic rollback;
   - refresh/rebuild local projections;
   - do not overwrite a pre-existing path silently.

### Recommended implementation improvement

Before adding more starter types, extract a small creation-plan/preflight layer
that can detect path collisions and return a useful partial-failure report.
Do not turn this into a proprietary manifest or transactional database.

## Local-vault follow-up

Direct local folders now have browser-persisted recent-vault handles, stable
workspace identities, deterministic unchanged-file IDs, automatic reopen when
permission remains granted, and explicit user-driven reauthorization when it
does not.

Remaining work:

- add compatibility guidance/fallback import for browsers without
  `showDirectoryPicker()`;
- decide whether tool metadata folders such as `.obsidian/` should be hidden
  from the default file explorer while always remaining untouched on disk;
- add UX for renaming browser shortcuts independently from the physical folder
  name if user feedback shows that it is useful.

Do not fall back to OPFS or IndexedDB as canonical note storage merely because
direct local-folder access is unavailable.

## Next major slice — Ask Second Brain / local RAG with citations

Once onboarding hardening is green, the next product milestone should be
question-answering over the user's Second Brain.

### 1. Local LLM provider boundary

Extend `@mind-context/ai` around a provider-neutral contract, for example:

```ts
interface LLMProvider {
  chat(request: ChatRequest): Promise<ChatResponse>;
}
```

First adapter: OpenAI-compatible localhost endpoints so Ollama, LM Studio and
llama.cpp-compatible servers can be supported without coupling domain code to a
vendor.

Settings should keep endpoint/model preferences browser-local. Do not store note
content or RAG prompts in persistent UI settings.

### 2. Browser-to-localhost feasibility spike

Before building the Ask UI, verify the deployed GitHub Pages origin can call a
local OpenAI-compatible endpoint under current browser behavior:

```text
https://carlex05.github.io
        -> http://localhost:<port>
```

Explicitly test:

- CORS;
- mixed-content / secure-context behavior;
- Private Network Access restrictions;
- Ollama and LM Studio compatibility.

If direct browser access is blocked, document the smallest local-only solution.
Do not introduce a cloud relay carrying private prompts merely to bypass browser
restrictions.

### 3. RetrievalContextBuilder

Build RAG context from the existing hybrid retrieval/chunks.

Requirements:

- deduplicate repeated chunks;
- prefer diversity across notes instead of returning many adjacent chunks from
  one note;
- enforce a configurable context/token budget;
- preserve note path, heading path and chunk ID;
- return structured source records suitable for citations;
- never mutate canonical Markdown.

Graph-aware reranking can be added later; it is not required for the first RAG
slice.

### 4. Ask Second Brain UI

Add a minimal shell surface, consistent with current Files/Search/Graph UX.

Expected flow:

```text
question
  -> hybrid retrieval
  -> context builder
  -> local LLM
  -> answer
  -> clickable sources
```

Citations should open the source note and, when practical, navigate to the
heading represented by the source chunk.

Answer language should default to the language used by the user's question, not
the interface locale or note language.

### 5. RAG privacy regressions

Browser tests must prove:

- only selected chunks are sent to the configured local LLM endpoint;
- no note text or question is sent to MindContext-controlled endpoints;
- citations refer to real retrieved sources;
- LLM failure leaves normal Search/editing functional;
- cloud AI is not silently selected as fallback.

## Following slice — daily capture

After local RAG, prioritize everyday knowledge creation:

- Daily Notes;
- Quick Capture;
- optional Inbox convention;
- commands/shortcuts that create/open today's note;
- templates expressed as ordinary Markdown.

Do not make Inbox or Daily Notes mandatory vault structure.

## Remaining daily-use MVP resilience

The original daily-use gate still has important work after RAG/capture:

### Ordinary attachments

Implemented baseline:

- multi-file upload for images, PDFs and arbitrary binary files;
- ordinary storage files remain canonical and provider-owned;
- portable relative Markdown references are inserted when a note is open;
- standard Markdown images resolve through the active storage provider;
- Obsidian-style image embeds resolve without rewriting canonical Markdown;
- non-image attachment links open/download through the provider;
- attachments appear in the normal vault tree;
- drag/drop attachment authoring inserts references at the editor position;
- clipboard image paste stores the image beside the active note and inserts a portable reference;
- authoring uploads resolve filename collisions without overwriting existing attachments.

Remaining hardening:

- richer inline PDF/audio/video previews;
- safe attachment-reference rewriting when attachments are renamed or moved;
- collision UX beyond the current explicit same-folder rejection.

### Autosave and conflict UX

Implemented baseline:

- local draft persistence with a short debounce and page-hide/visibility flush;
- deferred Drive autosync with per-note single-flight serialization;
- Google Drive content-revision protection via `headRevisionId` when available;
- BASE / LOCAL / REMOTE reconciliation that auto-resolves safe divergence cases;
- byte-for-byte local Markdown recovery copies in a reserved hidden Drive folder before a real conflict is exposed;
- preservation of the remote version before an explicit "keep mine" overwrite;
- visible local/syncing/synced/conflict/error state;
- explicit "keep mine" and "use Drive" conflict actions;
- Settings → Recovery history with restore/delete actions and resolved-copy retention policy;
- edits made during an in-flight Drive write are queued as a newer local draft;
- closing a tab does not delete a pending recovery draft.

Remaining hardening:

- richer side-by-side compare and automatic three-way text merge;
- offline retry/backoff and explicit connectivity state;
- future remote Drive change-feed detection for multi-device reconciliation.

### PWA/offline shell

- installable manifest;
- service worker for application shell/model/runtime assets where appropriate;
- clear distinction between offline app shell and unavailable remote Drive
  content;
- do not imply a local cache is canonical.

### Derived-state controls

Settings should expose:

- rebuild local indexes;
- clear lexical/search cache;
- clear embeddings;
- explain that these operations do not delete Drive knowledge.

## Later, not next

- Global Graph;
- arbitrary third-party plugin execution/marketplace;
- cloud LLM integrations;
- arbitrary existing Drive-vault import/open;
- additional storage providers such as OneDrive, Dropbox and WebDAV/Nextcloud;
- real-time collaboration/CRDT;
- multi-device synchronization beyond canonical storage behavior.

Each of these deserves its own vertical slice and, where it changes a trust or
canonical-data boundary, a new ADR.

## Definition of a safe handoff

Before handing a slice to another agent:

1. code is committed;
2. relevant ADR/architecture docs match behavior;
3. `pnpm typecheck`, unit tests, build and Playwright are green;
4. privacy-sensitive behavior has an E2E network-boundary assertion;
5. no documentation calls a future/placeholder capability implemented, or an
   implemented capability future;
6. the next unfinished acceptance criterion is written here rather than left
   only in chat.
