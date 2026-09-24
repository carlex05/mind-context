import { useEffect, useMemo, useState } from "react";
import { PRODUCT_PRINCIPLES } from "@mind-context/core";
import {
  getBacklinks,
  getBrokenLinks,
  getNote,
  getOutgoingLinks,
  upsertKnowledgeDocument,
  type KnowledgeEdge,
  type KnowledgeIndexSnapshot,
} from "@mind-context/knowledge";
import {
  markdownParser,
  updateFrontmatterStringList,
} from "@mind-context/markdown";
import { IndexedDbKnowledgeIndexStore } from "@mind-context/persistence-indexeddb";
import {
  GoogleDriveApiError,
  GoogleDriveStorageProvider,
  GoogleDriveWorkspaceService,
  type GoogleDriveWorkspace,
} from "@mind-context/storage-google-drive";
import {
  StorageConflictError,
  type StorageObjectMetadata,
} from "@mind-context/storage";

import {
  requestGoogleDriveAccess,
  type GoogleDriveAuthSession,
} from "./googleIdentity";
import { buildWorkspaceKnowledgeIndex } from "./knowledgeWorkspace";
import { MarkdownEditor } from "./MarkdownEditor";
import { MarkdownPreview } from "./MarkdownPreview";
import { NewItemDialog, type CreateItemKind } from "./NewItemDialog";
import { PropertiesEditor } from "./PropertiesEditor";
import { QuickSwitcher } from "./QuickSwitcher";
import {
  applyThemePreference,
  readThemePreference,
  type ThemePreference,
} from "./theme";
import { WorkspaceExplorer } from "./WorkspaceExplorer";
import {
  findWorkspaceNode,
  loadWorkspaceTree,
  type WorkspaceTreeNode,
} from "./workspaceTree";

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim();
const knowledgeStore = new IndexedDbKnowledgeIndexStore();

type AppStatus =
  | { readonly kind: "idle" }
  | { readonly kind: "busy"; readonly message: string }
  | { readonly kind: "error"; readonly message: string }
  | { readonly kind: "success"; readonly message: string };

interface OpenNote {
  readonly metadata: StorageObjectMetadata;
  readonly originalContent: string;
}

export function App() {
  const [authSession, setAuthSession] =
    useState<GoogleDriveAuthSession>();
  const [workspaceService, setWorkspaceService] =
    useState<GoogleDriveWorkspaceService>();
  const [workspaces, setWorkspaces] = useState<
    readonly GoogleDriveWorkspace[]
  >([]);
  const [activeWorkspace, setActiveWorkspace] =
    useState<GoogleDriveWorkspace>();
  const [provider, setProvider] =
    useState<GoogleDriveStorageProvider>();
  const [tree, setTree] = useState<readonly WorkspaceTreeNode[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState("");
  const [openNote, setOpenNote] = useState<OpenNote>();
  const [draft, setDraft] = useState("");
  const [workspaceName, setWorkspaceName] = useState("My Second Brain");
  const [knowledgeIndex, setKnowledgeIndex] =
    useState<KnowledgeIndexSnapshot>();
  const [mobileContextOpen, setMobileContextOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"edit" | "read">("edit");
  const [quickSwitcherOpen, setQuickSwitcherOpen] = useState(false);
  const [newItem, setNewItem] = useState<
    | {
        readonly kind: CreateItemKind;
        readonly folderId: string;
        readonly initialName?: string;
      }
    | undefined
  >();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [themePreference, setThemePreference] = useState<ThemePreference>(
    () => readThemePreference(),
  );
  const [recentNoteIds, setRecentNoteIds] = useState<readonly string[]>([]);
  const [navigation, setNavigation] = useState<{
    readonly entries: readonly string[];
    readonly index: number;
  }>({ entries: [], index: -1 });
  const [status, setStatus] = useState<AppStatus>({ kind: "idle" });

  const dirty =
    openNote !== undefined && draft !== openNote.originalContent;

  const parsedDraft = useMemo(() => markdownParser.parse(draft), [draft]);

  const currentIndexedNote = openNote
    ? getNote(knowledgeIndex, openNote.metadata.id)
    : undefined;
  const outgoingLinks = openNote
    ? getOutgoingLinks(knowledgeIndex, openNote.metadata.id)
    : [];
  const backlinks = openNote
    ? getBacklinks(knowledgeIndex, openNote.metadata.id)
    : [];
  const brokenLinks = openNote
    ? getBrokenLinks(knowledgeIndex, openNote.metadata.id)
    : [];
  const frontmatterTags = stringListProperty(parsedDraft.frontmatter.tags);
  const frontmatterAliases = stringListProperty(parsedDraft.frontmatter.aliases);
  const canNavigateBack = navigation.index > 0;
  const canNavigateForward =
    navigation.index >= 0 && navigation.index < navigation.entries.length - 1;

  const editorLinkTargets = useMemo(
    () =>
      (knowledgeIndex?.notes ?? []).map((note) => ({
        path: note.path,
        title: note.title,
        aliases: note.aliases,
        headings: note.headings.map((heading) => heading.text),
      })),
    [knowledgeIndex],
  );

  const knownTags = useMemo(
    () =>
      [...new Set((knowledgeIndex?.notes ?? []).flatMap((note) => note.tags))]
        .sort((left, right) => left.localeCompare(right)),
    [knowledgeIndex],
  );

  useEffect(() => {
    applyThemePreference(themePreference);
    if (themePreference !== "system") return;

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const listener = () => applyThemePreference("system");
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, [themePreference]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === "o") {
        event.preventDefault();
        if (activeWorkspace) setQuickSwitcherOpen(true);
      }
      if (event.key === "Escape") {
        setQuickSwitcherOpen(false);
        setSettingsOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [activeWorkspace]);

  if (!GOOGLE_CLIENT_ID) {
    return <ConfigurationRequired />;
  }

  async function connectDrive() {
    setStatus({ kind: "busy", message: "Connecting to Google Drive…" });
    try {
      const session = await requestGoogleDriveAccess(GOOGLE_CLIENT_ID);
      const tokenProvider = {
        getAccessToken: () => session.accessToken,
      };
      const service = new GoogleDriveWorkspaceService(tokenProvider);
      const discovered = await service.listWorkspaces();

      setAuthSession(session);
      setWorkspaceService(service);
      setWorkspaces(discovered);
      setStatus({
        kind: "success",
        message:
          discovered.length > 0
            ? "Google Drive connected."
            : "Connected. Create your first MindContext workspace.",
      });
    } catch (error) {
      setStatus({ kind: "error", message: errorMessage(error) });
    }
  }

  async function refreshWorkspaces(service = workspaceService) {
    if (!service) return;
    const discovered = await service.listWorkspaces();
    setWorkspaces(discovered);
  }

  async function createWorkspace() {
    if (!workspaceService) return;

    setStatus({ kind: "busy", message: "Creating workspace…" });
    try {
      const workspace = await workspaceService.createWorkspace(workspaceName);
      await refreshWorkspaces(workspaceService);
      await openWorkspace(workspace);
      setStatus({
        kind: "success",
        message: `Workspace “${workspace.name}” created and indexed locally.`,
      });
    } catch (error) {
      setStatus({ kind: "error", message: errorMessage(error) });
    }
  }

  async function openWorkspace(workspace: GoogleDriveWorkspace) {
    if (!authSession) return;
    if (!confirmDiscardIfDirty()) return;

    const nextProvider = new GoogleDriveStorageProvider({
      workspaceFolderId: workspace.id,
      accessTokenProvider: {
        getAccessToken: () => authSession.accessToken,
      },
    });

    setStatus({ kind: "busy", message: "Opening workspace…" });
    try {
      const cached = await knowledgeStore.get(workspace.id);
      if (cached) {
        setKnowledgeIndex(cached);
      }

      setProvider(nextProvider);
      setActiveWorkspace(workspace);
      setSelectedFolderId(nextProvider.rootId);
      setOpenNote(undefined);
      setDraft("");
      setNavigation({ entries: [], index: -1 });
      setMobileContextOpen(false);

      setStatus({
        kind: "busy",
        message: "Loading vault tree and rebuilding local knowledge index…",
      });
      const [nextTree, rebuilt] = await Promise.all([
        loadWorkspaceTree(nextProvider),
        buildWorkspaceKnowledgeIndex(nextProvider, workspace.id),
      ]);
      setTree(nextTree);
      await knowledgeStore.put(rebuilt);
      setKnowledgeIndex(rebuilt);
      setRecentNoteIds(readRecentNotes(workspace.id));
      setStatus({
        kind: "success",
        message: `Indexed ${rebuilt.notes.length} Markdown note${
          rebuilt.notes.length === 1 ? "" : "s"
        } locally.`,
      });
    } catch (error) {
      setStatus({ kind: "error", message: errorMessage(error) });
    }
  }

  async function refreshWorkspaceState() {
    if (!provider || !activeWorkspace) return;

    setStatus({
      kind: "busy",
      message: "Refreshing vault tree and rebuilding local index…",
    });
    try {
      const [nextTree, rebuilt] = await Promise.all([
        loadWorkspaceTree(provider),
        buildWorkspaceKnowledgeIndex(provider, activeWorkspace.id),
      ]);
      await knowledgeStore.put(rebuilt);
      setTree(nextTree);
      setKnowledgeIndex(rebuilt);

      if (
        selectedFolderId !== provider.rootId &&
        !findWorkspaceNode(nextTree, selectedFolderId)
      ) {
        setSelectedFolderId(provider.rootId);
      }

      if (openNote) {
        try {
          const metadata = await provider.metadata(openNote.metadata.id);
          setOpenNote((current) =>
            current ? { ...current, metadata } : current,
          );
        } catch {
          setOpenNote(undefined);
          setDraft("");
          setMobileContextOpen(false);
        }
      }

      setStatus({
        kind: "success",
        message: `Vault refreshed from ${rebuilt.notes.length} note${
          rebuilt.notes.length === 1 ? "" : "s"
        }.`,
      });
    } catch (error) {
      setStatus({ kind: "error", message: errorMessage(error) });
    }
  }

  async function openNoteById(
    id: string,
    historyMode: "push" | "back" | "forward" = "push",
  ): Promise<boolean> {
    if (!provider) return false;
    if (!confirmDiscardIfDirty()) return false;

    const indexed = getNote(knowledgeIndex, id);
    setStatus({
      kind: "busy",
      message: `Opening ${indexed?.name ?? "note"}…`,
    });

    try {
      const [content, metadata] = await Promise.all([
        provider.readText(id),
        provider.metadata(id),
      ]);
      setOpenNote({
        metadata,
        originalContent: content,
      });
      setDraft(content);
      setViewMode("edit");
      setMobileContextOpen(false);
      if (activeWorkspace) {
        setRecentNoteIds((current) =>
          rememberRecentNote(activeWorkspace.id, current, id),
        );
      }

      setNavigation((current) => {
        if (historyMode === "back") {
          return { ...current, index: Math.max(0, current.index - 1) };
        }
        if (historyMode === "forward") {
          return {
            ...current,
            index: Math.min(current.entries.length - 1, current.index + 1),
          };
        }

        if (current.entries[current.index] === id) return current;
        const entries = [...current.entries.slice(0, current.index + 1), id].slice(-50);
        return { entries, index: entries.length - 1 };
      });

      setStatus({ kind: "idle" });
      return true;
    } catch (error) {
      setStatus({ kind: "error", message: errorMessage(error) });
      return false;
    }
  }

  async function navigateHistory(direction: "back" | "forward") {
    const nextIndex =
      direction === "back" ? navigation.index - 1 : navigation.index + 1;
    const target = navigation.entries[nextIndex];
    if (!target) return;
    await openNoteById(target, direction);
  }

  function updateTags(tags: readonly string[]) {
    try {
      setDraft((current) =>
        updateFrontmatterStringList(current, "tags", tags),
      );
    } catch (error) {
      setStatus({ kind: "error", message: errorMessage(error) });
    }
  }

  function updateAliases(aliases: readonly string[]) {
    try {
      setDraft((current) =>
        updateFrontmatterStringList(current, "aliases", aliases),
      );
    } catch (error) {
      setStatus({ kind: "error", message: errorMessage(error) });
    }
  }

  async function createWorkspaceItem(
    kind: CreateItemKind,
    name: string,
    parentId: string,
  ) {
    if (!provider || !activeWorkspace) return;

    setStatus({
      kind: "busy",
      message: kind === "note" ? "Creating note…" : "Creating folder…",
    });

    try {
      if (kind === "folder") {
        const metadata = await provider.createDirectory(parentId, name);
        setSelectedFolderId(metadata.id);
        await refreshWorkspaceState();
        setStatus({
          kind: "success",
          message: `Folder “${metadata.name}” created.`,
        });
        return;
      }

      const metadata = await provider.createText(
        parentId,
        name,
        "# New note\n\n",
      );
      await refreshWorkspaceState();
      await openNoteById(metadata.id);
      setStatus({
        kind: "success",
        message: `${metadata.name} created.`,
      });
    } catch (error) {
      setStatus({ kind: "error", message: errorMessage(error) });
      throw error;
    }
  }

  function requestNewItem(
    kind: CreateItemKind,
    folderId = selectedFolderId || provider?.rootId || "",
    initialName?: string,
  ) {
    setNewItem({
      kind,
      folderId,
      ...(initialName ? { initialName } : {}),
    });
  }

  async function saveNote() {
    if (!provider || !openNote) return;

    setStatus({ kind: "busy", message: "Saving to Google Drive…" });
    try {
      const metadata = await provider.writeText(
        openNote.metadata.id,
        draft,
        openNote.metadata.revision
          ? { expectedRevision: openNote.metadata.revision }
          : undefined,
      );
      setOpenNote({ metadata, originalContent: draft });
      if (knowledgeIndex) {
        const existing = getNote(knowledgeIndex, metadata.id);
        const updated = upsertKnowledgeDocument(knowledgeIndex, {
          id: metadata.id,
          path: existing?.path ?? metadata.name,
          name: metadata.name,
          content: draft,
          ...(metadata.modifiedAt ? { modifiedAt: metadata.modifiedAt } : {}),
          ...(metadata.revision ? { revision: metadata.revision } : {}),
        });
        await knowledgeStore.put(updated);
        setKnowledgeIndex(updated);
      }

      setStatus({
        kind: "success",
        message: "Saved to Drive and updated the local knowledge index.",
      });
    } catch (error) {
      if (error instanceof StorageConflictError) {
        setStatus({
          kind: "error",
          message:
            "This note changed in Drive after you opened it. Reload it before saving to avoid overwriting newer work.",
        });
        return;
      }
      setStatus({ kind: "error", message: errorMessage(error) });
    }
  }

  function closeNote() {
    if (!confirmDiscardIfDirty()) return;
    setOpenNote(undefined);
    setDraft("");
    setMobileContextOpen(false);
  }

  function leaveWorkspace() {
    if (!confirmDiscardIfDirty()) return;
    setActiveWorkspace(undefined);
    setProvider(undefined);
    setTree([]);
    setSelectedFolderId("");
    setOpenNote(undefined);
    setDraft("");
    setNavigation({ entries: [], index: -1 });
    setKnowledgeIndex(undefined);
    setMobileContextOpen(false);
    setQuickSwitcherOpen(false);
    setNewItem(undefined);
  }

  function disconnect() {
    if (!confirmDiscardIfDirty()) return;
    setAuthSession(undefined);
    setWorkspaceService(undefined);
    setWorkspaces([]);
    setActiveWorkspace(undefined);
    setProvider(undefined);
    setTree([]);
    setSelectedFolderId("");
    setOpenNote(undefined);
    setDraft("");
    setNavigation({ entries: [], index: -1 });
    setKnowledgeIndex(undefined);
    setMobileContextOpen(false);
    setQuickSwitcherOpen(false);
    setNewItem(undefined);
    setStatus({ kind: "idle" });
  }

  function confirmDiscardIfDirty(): boolean {
    return !dirty || window.confirm("Discard your unsaved changes?");
  }

  if (!authSession || !workspaceService) {
    return <Landing status={status} onConnect={connectDrive} />;
  }

  if (!activeWorkspace || !provider) {
    return (
      <WorkspaceChooser
        workspaces={workspaces}
        workspaceName={workspaceName}
        status={status}
        expiresAt={authSession.expiresAt}
        onWorkspaceNameChange={setWorkspaceName}
        onCreateWorkspace={createWorkspace}
        onOpenWorkspace={openWorkspace}
        onRefresh={() => refreshWorkspaces()}
        onDisconnect={disconnect}
      />
    );
  }

  return (
    <main
      className={[
        "app-shell",
        openNote ? "has-open-note" : "",
        mobileContextOpen ? "context-open" : "",
      ].join(" ")}
    >
      <header className="topbar">
        <div className="topbar-copy">
          <div className="history-controls" aria-label="Note navigation">
            <button
              type="button"
              aria-label="Back"
              disabled={!canNavigateBack}
              onClick={() => void navigateHistory("back")}
            >
              ←
            </button>
            <button
              type="button"
              aria-label="Forward"
              disabled={!canNavigateForward}
              onClick={() => void navigateHistory("forward")}
            >
              →
            </button>
          </div>
          <button className="text-button" type="button" onClick={leaveWorkspace}>
            {activeWorkspace.name}
          </button>
          {currentIndexedNote ? (
            <>
              <span aria-hidden="true">/</span>
              <span className="breadcrumb-path">{currentIndexedNote.path.replace(/\.md$/i, "")}</span>
            </>
          ) : null}
        </div>
        <div className="topbar-actions">
          <span className="privacy-dot" title="Drive canonical · local derived index" aria-label="Private local index">●</span>
          <div className="settings-anchor">
            <button
              className="icon-button quiet"
              type="button"
              aria-label="Interface settings"
              onClick={() => setSettingsOpen((current) => !current)}
            >
              ⋯
            </button>
            {settingsOpen ? (
              <div className="settings-menu" role="menu">
                <span className="section-label">Appearance</span>
                {(["system", "light", "dark"] as const).map((theme) => (
                  <button
                    type="button"
                    className={themePreference === theme ? "selected" : ""}
                    key={theme}
                    onClick={() => {
                      setThemePreference(theme);
                      setSettingsOpen(false);
                    }}
                  >
                    <span>{themePreference === theme ? "✓" : ""}</span>
                    {theme[0]?.toUpperCase()}{theme.slice(1)}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <div className="workspace-layout">
        <aside className="note-sidebar" aria-label="Notes">
          <div className="panel-heading">
            <div>
              <span className="section-label">Workspace</span>
              <h1>{activeWorkspace.name}</h1>
            </div>
            <button
              className="icon-button"
              type="button"
              onClick={() => void refreshWorkspaceState()}
              aria-label="Refresh vault and local index"
            >
              ↻
            </button>
          </div>

          <div className="sidebar-utility-row">
            <button type="button" onClick={() => setQuickSwitcherOpen(true)}>
              ⌕ Open
            </button>
            <small>{knowledgeIndex?.notes.length ?? 0} notes</small>
          </div>

          <WorkspaceExplorer
            provider={provider}
            tree={tree}
            index={knowledgeIndex}
            activeNoteId={openNote?.metadata.id}
            selectedFolderId={selectedFolderId || provider.rootId}
            onSelectedFolderIdChange={setSelectedFolderId}
            onOpenNote={(noteId) => void openNoteById(noteId)}
            onRequestNewNote={(folderId) => requestNewItem("note", folderId)}
            onRequestNewFolder={(folderId) => requestNewItem("folder", folderId)}
            onChanged={refreshWorkspaceState}
            onStatus={(message, kind = "success") =>
              setStatus({ kind, message })
            }
          />
        </aside>

        <section className="editor-panel" aria-label="Markdown editor">
          {openNote ? (
            <>
              <div className="editor-toolbar">
                <button
                  className="mobile-back"
                  type="button"
                  onClick={closeNote}
                >
                  ← Notes
                </button>
                <div className="editor-title">
                  <strong>{currentIndexedNote?.title ?? openNote.metadata.name.replace(/\.md$/i, "")}</strong>
                  <span>{dirty ? "Unsaved" : "Saved"}</span>
                </div>
                <div className="view-toggle" aria-label="Note view">
                  <button
                    type="button"
                    className={viewMode === "edit" ? "selected" : ""}
                    onClick={() => setViewMode("edit")}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className={viewMode === "read" ? "selected" : ""}
                    onClick={() => setViewMode("read")}
                  >
                    Read
                  </button>
                </div>
                <button
                  className="context-button"
                  type="button"
                  onClick={() => setMobileContextOpen(true)}
                >
                  Context
                </button>
                <button
                  className="save-button"
                  type="button"
                  onClick={() => void saveNote()}
                  disabled={!dirty || status.kind === "busy"}
                >
                  Save
                </button>
              </div>
              {viewMode === "edit" ? (
                <MarkdownEditor
                  key={openNote.metadata.id}
                  value={draft}
                  label={`Edit ${openNote.metadata.name}`}
                  linkTargets={editorLinkTargets}
                  tags={knownTags}
                  onChange={setDraft}
                />
              ) : (
                <MarkdownPreview
                  content={draft}
                  outgoingLinks={outgoingLinks}
                  onOpenNote={(noteId) => void openNoteById(noteId)}
                />
              )}
            </>
          ) : (
            <div className="editor-empty">
              <span className="section-label">Knowledge workspace</span>
              <h2>Select a note</h2>
              <p>
                MindContext rebuilds links and backlinks locally from the
                Markdown files in your Drive. IndexedDB is only a disposable
                cache of that derived graph.
              </p>
            </div>
          )}
        </section>

        {openNote ? (
          <KnowledgePanel
            noteTitle={currentIndexedNote?.title ?? openNote.metadata.name}
            outgoing={outgoingLinks}
            backlinks={backlinks}
            broken={brokenLinks}
            index={knowledgeIndex}
            properties={parsedDraft.frontmatter}
            tags={frontmatterTags}
            aliases={frontmatterAliases}
            knownTags={knownTags}
            onTagsChange={updateTags}
            onAliasesChange={updateAliases}
            onOpenNote={(noteId) => void openNoteById(noteId)}
            onBackToNote={() => setMobileContextOpen(false)}
          />
        ) : null}
      </div>

      <QuickSwitcher
        open={quickSwitcherOpen}
        notes={knowledgeIndex?.notes ?? []}
        recentNoteIds={recentNoteIds}
        onClose={() => setQuickSwitcherOpen(false)}
        onOpenNote={(noteId) => void openNoteById(noteId)}
        onCreateNote={(name) =>
          requestNewItem(
            "note",
            selectedFolderId || provider.rootId,
            name,
          )
        }
      />
      <NewItemDialog
        open={newItem !== undefined}
        kind={newItem?.kind ?? "note"}
        tree={tree}
        rootId={provider.rootId}
        initialFolderId={newItem?.folderId ?? provider.rootId}
        initialName={newItem?.initialName ?? ""}
        onClose={() => setNewItem(undefined)}
        onCreate={createWorkspaceItem}
      />
      <StatusBar status={status} />
    </main>
  );
}

function KnowledgePanel({
  noteTitle,
  outgoing,
  backlinks,
  broken,
  index,
  properties,
  tags,
  aliases,
  knownTags,
  onTagsChange,
  onAliasesChange,
  onOpenNote,
  onBackToNote,
}: {
  readonly noteTitle: string;
  readonly outgoing: readonly KnowledgeEdge[];
  readonly backlinks: readonly KnowledgeEdge[];
  readonly broken: readonly KnowledgeEdge[];
  readonly index: KnowledgeIndexSnapshot | undefined;
  readonly properties: Readonly<Record<string, unknown>>;
  readonly tags: readonly string[];
  readonly aliases: readonly string[];
  readonly knownTags: readonly string[];
  readonly onTagsChange: (tags: readonly string[]) => void;
  readonly onAliasesChange: (aliases: readonly string[]) => void;
  readonly onOpenNote: (noteId: string) => void;
  readonly onBackToNote: () => void;
}) {
  return (
    <aside className="knowledge-panel" aria-label="Knowledge context">
      <button className="knowledge-back" type="button" onClick={onBackToNote}>
        ← Note
      </button>
      <span className="section-label">Context</span>
      <h2>{noteTitle}</h2>

      <PropertiesEditor
        tags={tags}
        aliases={aliases}
        knownTags={knownTags}
        onTagsChange={onTagsChange}
        onAliasesChange={onAliasesChange}
      />

      {Object.keys(properties).filter(
        (key) => key !== "tags" && key !== "aliases",
      ).length > 0 ? (
        <details className="other-properties">
          <summary>Other properties</summary>
          {Object.entries(properties)
            .filter(([key]) => key !== "tags" && key !== "aliases")
            .map(([key, value]) => (
              <div className="property-readonly-row" key={key}>
                <span>{key}</span>
                <code>{formatPropertyValue(value)}</code>
              </div>
            ))}
        </details>
      ) : null}

      <KnowledgeSection title="Links" empty="No outgoing links.">
        {outgoing
          .filter((edge) => edge.resolution === "resolved")
          .map((edge, indexNumber) => (
          <EdgeRow
            edge={edge}
            label={edge.alias ?? edge.target}
            key={`${edge.target}-${edge.heading ?? ""}-${indexNumber}`}
            onOpenNote={onOpenNote}
          />
        ))}
      </KnowledgeSection>

      <KnowledgeSection title="Backlinks" empty="No backlinks yet.">
        {backlinks.map((edge, indexNumber) => {
          const source = index?.notes.find(
            (note) => note.id === edge.sourceNoteId,
          );
          return (
            <button
              className="context-link"
              type="button"
              key={`${edge.sourceNoteId}-${indexNumber}`}
              onClick={() => onOpenNote(edge.sourceNoteId)}
            >
              <span>{source?.title ?? source?.name ?? edge.sourcePath}</span>
              <small>{edge.sourcePath}</small>
            </button>
          );
        })}
      </KnowledgeSection>

      {broken.length > 0 ? (
        <KnowledgeSection title="Broken" empty="">
          {broken.map((edge, indexNumber) => (
            <div
              className="broken-link"
              key={`${edge.target}-broken-${indexNumber}`}
            >
              <span>[[{edge.target}{edge.heading ? `#${edge.heading}` : ""}]]</span>
              <small>{brokenReason(edge.resolution)}</small>
            </div>
          ))}
        </KnowledgeSection>
      ) : null}
    </aside>
  );
}

function KnowledgeSection({
  title,
  empty,
  children,
}: {
  readonly title: string;
  readonly empty: string;
  readonly children: React.ReactNode;
}) {
  const childArray = Array.isArray(children) ? children : [children];
  return (
    <section className="knowledge-section">
      <h3>{title}</h3>
      {childArray.length === 0 ? (
        <p className="context-empty">{empty}</p>
      ) : (
        children
      )}
    </section>
  );
}

function EdgeRow({
  edge,
  label,
  onOpenNote,
}: {
  readonly edge: KnowledgeEdge;
  readonly label: string;
  readonly onOpenNote: (noteId: string) => void;
}) {
  if (edge.resolution !== "resolved" || !edge.targetNoteId) {
    return (
      <div className="broken-link">
        <span>{label}</span>
        <small>{brokenReason(edge.resolution)}</small>
      </div>
    );
  }

  return (
    <button
      className="context-link"
      type="button"
      onClick={() => onOpenNote(edge.targetNoteId!)}
    >
      <span>{label}</span>
      <small>{edge.targetPath}</small>
    </button>
  );
}

function brokenReason(resolution: KnowledgeEdge["resolution"]): string {
  switch (resolution) {
    case "missing-note":
      return "Note not found";
    case "ambiguous-note":
      return "Multiple notes match";
    case "missing-heading":
      return "Heading not found";
    case "missing-block":
      return "Block not found";
    case "resolved":
      return "Resolved";
  }
}

function Landing({
  status,
  onConnect,
}: {
  readonly status: AppStatus;
  readonly onConnect: () => void;
}) {
  return (
    <main className="landing-shell">
      <section className="hero">
        <span className="eyebrow">MindContext / knowledge slice</span>
        <h1>Your files. Your knowledge. Private by default.</h1>
        <p className="lede">
          Connect Google Drive to use Markdown as your canonical knowledge
          source while links, backlinks and indexes are derived locally.
        </p>
        <button
          className="primary-button large"
          type="button"
          onClick={onConnect}
          disabled={status.kind === "busy"}
        >
          {status.kind === "busy" ? "Connecting…" : "Connect Google Drive"}
        </button>
        <StatusBar status={status} />
      </section>

      <section className="principles-card" aria-label="Product principles">
        <span className="section-label">Architecture guardrails</span>
        <ul>
          {PRODUCT_PRINCIPLES.map((principle) => (
            <li key={principle}>{principle}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}

function WorkspaceChooser({
  workspaces,
  workspaceName,
  status,
  expiresAt,
  onWorkspaceNameChange,
  onCreateWorkspace,
  onOpenWorkspace,
  onRefresh,
  onDisconnect,
}: {
  readonly workspaces: readonly GoogleDriveWorkspace[];
  readonly workspaceName: string;
  readonly status: AppStatus;
  readonly expiresAt: number;
  readonly onWorkspaceNameChange: (name: string) => void;
  readonly onCreateWorkspace: () => void;
  readonly onOpenWorkspace: (workspace: GoogleDriveWorkspace) => void;
  readonly onRefresh: () => void;
  readonly onDisconnect: () => void;
}) {
  return (
    <main className="chooser-shell">
      <header className="chooser-header">
        <div>
          <span className="eyebrow">Google Drive connected</span>
          <h1>Choose your brain.</h1>
          <p>
            MindContext uses the narrow <code>drive.file</code> permission and
            keeps its knowledge graph as a rebuildable browser-local projection.
          </p>
        </div>
        <button className="secondary-button" type="button" onClick={onDisconnect}>
          Disconnect
        </button>
      </header>

      <section className="chooser-grid">
        <article className="create-card">
          <span className="section-label">New workspace</span>
          <label htmlFor="workspace-name">Folder name in Google Drive</label>
          <input
            id="workspace-name"
            value={workspaceName}
            onChange={(event) => onWorkspaceNameChange(event.target.value)}
            autoComplete="off"
          />
          <button
            className="primary-button"
            type="button"
            onClick={onCreateWorkspace}
            disabled={!workspaceName.trim() || status.kind === "busy"}
          >
            Create in Drive
          </button>
        </article>

        <article className="existing-card">
          <div className="panel-heading">
            <div>
              <span className="section-label">Existing</span>
              <h2>MindContext workspaces</h2>
            </div>
            <button className="icon-button" type="button" onClick={onRefresh}>
              ↻
            </button>
          </div>
          <div className="workspace-list">
            {workspaces.length === 0 ? (
              <p className="empty-state">No previous workspaces found.</p>
            ) : (
              workspaces.map((workspace) => (
                <button
                  className="workspace-row"
                  type="button"
                  key={workspace.id}
                  onClick={() => onOpenWorkspace(workspace)}
                >
                  <span>
                    <strong>{workspace.name}</strong>
                    <small>Google Drive folder</small>
                  </span>
                  <span aria-hidden="true">→</span>
                </button>
              ))
            )}
          </div>
        </article>
      </section>

      <p className="session-note">
        Drive access token is kept only in memory for this session and is
        expected to expire around {new Date(expiresAt).toLocaleTimeString()}.
      </p>
      <StatusBar status={status} />
    </main>
  );
}

const DEMO_MARKDOWN = `# MindContext demo

This is a local, non-persistent preview of the Markdown editor.

## Links

Try editing [[Architecture]], [[Privacy#Boundaries]] or [[Google Drive|storage]].

## Tags

#markdown #local-first
`;

function ConfigurationRequired() {
  const [demoContent, setDemoContent] = useState(DEMO_MARKDOWN);
  const parsed = useMemo(
    () => markdownParser.parse(demoContent),
    [demoContent],
  );

  return (
    <main className="preview-shell">
      <header className="preview-intro">
        <div>
          <span className="eyebrow">Public preview</span>
          <h1>MindContext editor preview.</h1>
          <p className="lede">
            Google Drive is not configured for this deployment yet, but you can
            already test the Markdown editing experience on desktop or mobile.
          </p>
        </div>
        <div className="preview-warning">
          Demo only · content stays in this page and is not persisted.
        </div>
      </header>

      <section className="demo-editor-card">
        <div className="editor-toolbar">
          <div className="editor-title">
            <strong>Demo.md</strong>
            <span>
              {parsed.sections.filter((section) => section.heading).length} headings ·{" "}
              {parsed.wikiLinks.length} wikilinks · {parsed.tags.length} tags
            </span>
          </div>
        </div>
        <MarkdownEditor
          value={demoContent}
          label="Edit Demo.md"
          onChange={setDemoContent}
        />
      </section>
    </main>
  );
}

function StatusBar({ status }: { readonly status: AppStatus }) {
  if (status.kind === "idle") return null;

  return (
    <div className={`status-bar ${status.kind}`} role="status" aria-live="polite">
      {status.message}
    </div>
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof GoogleDriveApiError && error.status === 401) {
    return "Google Drive authorization expired. Disconnect and connect again.";
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Something unexpected happened.";
}


function recentNotesKey(workspaceId: string): string {
  return `mindcontext.recent.${workspaceId}`;
}

function readRecentNotes(workspaceId: string): readonly string[] {
  try {
    const value = JSON.parse(
      window.localStorage.getItem(recentNotesKey(workspaceId)) ?? "[]",
    );
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string").slice(0, 12)
      : [];
  } catch {
    return [];
  }
}

function rememberRecentNote(
  workspaceId: string,
  current: readonly string[],
  noteId: string,
): readonly string[] {
  const next = [noteId, ...current.filter((id) => id !== noteId)].slice(0, 12);
  window.localStorage.setItem(recentNotesKey(workspaceId), JSON.stringify(next));
  return next;
}


function stringListProperty(value: unknown): readonly string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }
  return [];
}

function formatPropertyValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
