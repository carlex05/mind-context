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
import {
  IndexedDbKnowledgeIndexStore,
  IndexedDbSearchIndexStore,
} from "@mind-context/persistence-indexeddb";
import {
  LexicalSearchIndex,
  canReuseSearchDocument,
  createSearchDocument,
  createSearchIndexSnapshot,
  upsertSearchDocument,
  type SearchIndexSnapshot,
} from "@mind-context/search";
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
import { buildWorkspaceDerivedState } from "./knowledgeWorkspace";
import { MarkdownEditor } from "./MarkdownEditor";
import { MarkdownPreview } from "./MarkdownPreview";
import { LocalGraphPanel } from "./LocalGraphPanel";
import { NewItemDialog, type CreateItemKind } from "./NewItemDialog";
import { PropertiesEditor } from "./PropertiesEditor";
import { QuickSwitcher } from "./QuickSwitcher";
import { SearchPanel } from "./SearchPanel";
import {
  applyThemePreference,
  readThemePreference,
  type ThemePreference,
} from "./theme";
import { WorkspaceExplorer } from "./WorkspaceExplorer";
import {
  Icon,
  PlaceholderPanel,
  SidebarFrame,
  TabBar,
  WorkspaceHeader,
  WorkspaceRail,
} from "./WorkspaceShell";
import {
  readWorkspaceUi,
  writeWorkspaceUi,
  type NoteViewMode,
  type WorkspacePanel,
  type WorkspaceTab,
} from "./workspaceUi";
import {
  findWorkspaceNode,
  loadWorkspaceTree,
  type WorkspaceTreeNode,
} from "./workspaceTree";

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim();
const knowledgeStore = new IndexedDbKnowledgeIndexStore();
const searchStore = new IndexedDbSearchIndexStore();

type AppStatus =
  | { readonly kind: "idle" }
  | { readonly kind: "busy"; readonly message: string }
  | { readonly kind: "error"; readonly message: string }
  | { readonly kind: "success"; readonly message: string };

interface OpenNote {
  readonly metadata: StorageObjectMetadata;
  readonly originalContent: string;
}

interface NoteBuffer {
  readonly note: OpenNote;
  readonly draft: string;
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
  const [searchIndex, setSearchIndex] = useState<LexicalSearchIndex>();
  const [searchSnapshot, setSearchSnapshot] =
    useState<SearchIndexSnapshot>();
  const [tabs, setTabs] = useState<readonly WorkspaceTab[]>([]);
  const [tabBuffers, setTabBuffers] = useState<
    Readonly<Record<string, NoteBuffer>>
  >({});
  const [activeTabId, setActiveTabId] = useState<string>();
  const [activeLeftPanel, setActiveLeftPanel] =
    useState<WorkspacePanel>("files");
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true);
  const [rightSidebarOpen, setRightSidebarOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(true);
  const [workspaceUiReady, setWorkspaceUiReady] = useState(false);
  const [selectedTag, setSelectedTag] = useState<string>();
  const [viewMode, setViewMode] = useState<NoteViewMode>("edit");
  const [quickSwitcherOpen, setQuickSwitcherOpen] = useState(false);
  const [newItem, setNewItem] = useState<
    | {
        readonly kind: CreateItemKind;
        readonly folderId: string;
        readonly initialName?: string;
      }
    | undefined
  >();
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

  const dirtyNoteIds = useMemo(() => {
    const result = new Set<string>();
    for (const [noteId, buffer] of Object.entries(tabBuffers)) {
      if (buffer.draft !== buffer.note.originalContent) result.add(noteId);
    }
    if (activeTabId && dirty) result.add(activeTabId);
    return result;
  }, [tabBuffers, activeTabId, dirty, draft, openNote]);

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
    if (!activeWorkspace || !workspaceUiReady) return;
    writeWorkspaceUi(activeWorkspace.id, {
      tabs: tabs.map((tab) => ({
        noteId: tab.noteId,
        viewMode: tab.viewMode,
      })),
      ...(activeTabId ? { activeNoteId: activeTabId } : {}),
      leftPanel: activeLeftPanel,
      leftSidebarOpen,
      rightSidebarOpen,
    });
  }, [
    activeWorkspace,
    workspaceUiReady,
    tabs,
    activeTabId,
    activeLeftPanel,
    leftSidebarOpen,
    rightSidebarOpen,
  ]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const key = event.key.toLocaleLowerCase();
      const command = event.metaKey || event.ctrlKey;

      if (command && key === "o") {
        event.preventDefault();
        if (activeWorkspace) setQuickSwitcherOpen(true);
      }
      if (command && key === "n") {
        event.preventDefault();
        if (activeWorkspace) requestNewItem("note");
      }
      if (command && key === "b") {
        event.preventDefault();
        setLeftSidebarOpen((current) => !current);
      }
      if (command && key === "w" && activeTabId) {
        event.preventDefault();
        void closeTab(activeTabId);
      }
      if (event.altKey && event.key === "ArrowLeft") {
        event.preventDefault();
        void navigateHistory("back");
      }
      if (event.altKey && event.key === "ArrowRight") {
        event.preventDefault();
        void navigateHistory("forward");
      }
      if (event.key === "Escape") {
        setQuickSwitcherOpen(false);
        setMobileSidebarOpen(false);
        setRightSidebarOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [activeWorkspace, activeTabId, navigation, dirty, tabs, tabBuffers]);


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
    if (!confirmDiscardAllDirty()) return;

    const nextProvider = new GoogleDriveStorageProvider({
      workspaceFolderId: workspace.id,
      accessTokenProvider: {
        getAccessToken: () => authSession.accessToken,
      },
    });

    setStatus({ kind: "busy", message: "Opening workspace…" });
    try {
      const [cached, cachedSearch] = await Promise.all([
        knowledgeStore.get(workspace.id),
        searchStore.get(workspace.id),
      ]);
      setKnowledgeIndex(cached);
      setSearchSnapshot(cachedSearch);
      setSearchIndex(
        cachedSearch
          ? new LexicalSearchIndex(cachedSearch.documents)
          : undefined,
      );

      setWorkspaceUiReady(false);
      setProvider(nextProvider);
      setActiveWorkspace(workspace);
      setSelectedFolderId(nextProvider.rootId);
      setOpenNote(undefined);
      setDraft("");
      setTabs([]);
      setTabBuffers({});
      setActiveTabId(undefined);
      setNavigation({ entries: [], index: -1 });
      setRightSidebarOpen(false);
      setMobileSidebarOpen(true);

      setStatus({
        kind: "busy",
        message: "Loading vault tree and rebuilding local knowledge index…",
      });
      const [nextTree, derived] = await Promise.all([
        loadWorkspaceTree(nextProvider),
        buildWorkspaceDerivedState(
          nextProvider,
          workspace.id,
          cachedSearch,
        ),
      ]);
      const rebuilt = derived.knowledgeIndex;
      setTree(nextTree);
      await Promise.all([
        knowledgeStore.put(rebuilt),
        searchStore.put(derived.searchSnapshot),
      ]);
      setKnowledgeIndex(rebuilt);
      setSearchSnapshot(derived.searchSnapshot);
      setSearchIndex(derived.searchIndex);
      setRecentNoteIds(readRecentNotes(workspace.id));

      const persistedUi = readWorkspaceUi(workspace.id);
      const restoredTabs = persistedUi.tabs.flatMap((saved) => {
        const note = getNote(rebuilt, saved.noteId);
        return note
          ? [{
              noteId: note.id,
              title: note.name.replace(/\.md$/i, ""),
              path: note.path,
              viewMode: saved.viewMode,
            }]
          : [];
      });
      const restoredActiveId =
        restoredTabs.some((tab) => tab.noteId === persistedUi.activeNoteId)
          ? persistedUi.activeNoteId
          : restoredTabs[0]?.noteId;

      setTabs(restoredTabs);
      setActiveTabId(restoredActiveId);
      setActiveLeftPanel(persistedUi.leftPanel);
      setLeftSidebarOpen(persistedUi.leftSidebarOpen);
      setRightSidebarOpen(persistedUi.rightSidebarOpen);

      if (restoredActiveId) {
        const metadata = await nextProvider.metadata(restoredActiveId);
        const cachedDocument = derived.searchSnapshot.documents.find(
          (document) => document.noteId === restoredActiveId,
        );
        const content = canReuseSearchDocument(
          cachedDocument,
          metadata.revision,
        )
          ? cachedDocument.content
          : await nextProvider.readText(restoredActiveId);
        const restoredNote = { metadata, originalContent: content };
        setOpenNote(restoredNote);
        setDraft(content);
        setTabBuffers({
          [restoredActiveId]: { note: restoredNote, draft: content },
        });
        setViewMode(
          restoredTabs.find((tab) => tab.noteId === restoredActiveId)?.viewMode ??
            "edit",
        );
        setNavigation({ entries: [restoredActiveId], index: 0 });
        setMobileSidebarOpen(false);
      }

      setWorkspaceUiReady(true);
      setStatus({
        kind: "success",
        message:
          `Indexed ${derived.stats.totalNotes} Markdown note${derived.stats.totalNotes === 1 ? "" : "s"} locally · ` +
          `${derived.stats.reusedNotes} reused · ${derived.stats.downloadedNotes} downloaded · ` +
          `${derived.stats.chunks} chunks.`,
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
      const previousSearch =
        searchSnapshot ?? (await searchStore.get(activeWorkspace.id));
      const [nextTree, derived] = await Promise.all([
        loadWorkspaceTree(provider),
        buildWorkspaceDerivedState(
          provider,
          activeWorkspace.id,
          previousSearch,
        ),
      ]);
      const rebuilt = derived.knowledgeIndex;
      await Promise.all([
        knowledgeStore.put(rebuilt),
        searchStore.put(derived.searchSnapshot),
      ]);
      setTree(nextTree);
      setKnowledgeIndex(rebuilt);
      setSearchSnapshot(derived.searchSnapshot);
      setSearchIndex(derived.searchIndex);
      setTabs((current) =>
        current.flatMap((tab) => {
          const note = getNote(rebuilt, tab.noteId);
          return note
            ? [{
                ...tab,
                title: note.name.replace(/\.md$/i, ""),
                path: note.path,
              }]
            : [];
        }),
      );

      const sourceBuffers: Record<string, NoteBuffer> = { ...tabBuffers };
      if (activeTabId && openNote) {
        sourceBuffers[activeTabId] = { note: openNote, draft };
      }

      const refreshedBufferEntries = await Promise.all(
        Object.entries(sourceBuffers)
          .filter(([noteId]) =>
            rebuilt.notes.some((note) => note.id === noteId),
          )
          .map(async ([noteId, buffer]) => {
            if (buffer.draft !== buffer.note.originalContent) {
              return [noteId, buffer] as const;
            }

            try {
              const metadata = await provider.metadata(noteId);
              const cachedDocument = derived.searchSnapshot.documents.find(
                (document) => document.noteId === noteId,
              );
              const content = canReuseSearchDocument(
                cachedDocument,
                metadata.revision,
              )
                ? cachedDocument.content
                : await provider.readText(noteId);
              const note = { metadata, originalContent: content };
              return [
                noteId,
                { note, draft: content } satisfies NoteBuffer,
              ] as const;
            } catch {
              return undefined;
            }
          }),
      );

      const refreshedBuffers = Object.fromEntries(
        refreshedBufferEntries.filter(
          (entry): entry is readonly [string, NoteBuffer] =>
            entry !== undefined,
        ),
      );
      setTabBuffers(refreshedBuffers);

      if (activeTabId) {
        const activeBuffer = refreshedBuffers[activeTabId];
        if (activeBuffer) {
          setOpenNote(activeBuffer.note);
          setDraft(activeBuffer.draft);
        }
      }

      if (
        selectedFolderId !== provider.rootId &&
        !findWorkspaceNode(nextTree, selectedFolderId)
      ) {
        setSelectedFolderId(provider.rootId);
      }

      if (openNote) {
        try {
          const metadata = await provider.metadata(openNote.metadata.id);
          setOpenNote((current) => {
            if (!current) return current;
            const next = { ...current, metadata };
            if (activeTabId) {
              setTabBuffers((buffers) => ({
                ...buffers,
                [activeTabId]: {
                  note: next,
                  draft,
                },
              }));
            }
            return next;
          });
        } catch {
          setOpenNote(undefined);
          setDraft("");
          setActiveTabId(undefined);
          setTabBuffers((current) => {
            if (!openNote) return current;
            const next = { ...current };
            delete next[openNote.metadata.id];
            return next;
          });
          setRightSidebarOpen(false);
        }
      }

      setStatus({
        kind: "success",
        message:
          `Vault refreshed · ${derived.stats.reusedNotes} unchanged note${derived.stats.reusedNotes === 1 ? "" : "s"} reused · ` +
          `${derived.stats.downloadedNotes} downloaded.`,
      });
    } catch (error) {
      setStatus({ kind: "error", message: errorMessage(error) });
    }
  }

  async function openNoteById(
    id: string,
    historyMode: "push" | "back" | "forward" = "push",
    storeCurrent = true,
  ): Promise<boolean> {
    if (!provider) return false;

    if (activeTabId === id && openNote) {
      setMobileSidebarOpen(false);
      return true;
    }

    if (storeCurrent && activeTabId && openNote) {
      setTabBuffers((current) => ({
        ...current,
        [activeTabId]: {
          note: openNote,
          draft,
        },
      }));
    }

    const indexed = getNote(knowledgeIndex, id);
    const buffered = tabBuffers[id];
    setStatus({
      kind: "busy",
      message: `Opening ${indexed?.name ?? buffered?.note.metadata.name ?? "note"}…`,
    });

    try {
      let nextNote: OpenNote;
      let nextDraft: string;

      if (buffered) {
        nextNote = buffered.note;
        nextDraft = buffered.draft;
      } else {
        const metadata = await provider.metadata(id);
        const cachedDocument = searchSnapshot?.documents.find(
          (document) => document.noteId === id,
        );
        const content = canReuseSearchDocument(
          cachedDocument,
          metadata.revision,
        )
          ? cachedDocument.content
          : await provider.readText(id);
        nextNote = {
          metadata,
          originalContent: content,
        };
        nextDraft = content;
        setTabBuffers((current) => ({
          ...current,
          [id]: { note: nextNote, draft: nextDraft },
        }));
      }

      setOpenNote(nextNote);
      setDraft(nextDraft);

      const existingTab = tabs.find((tab) => tab.noteId === id);
      const note = getNote(knowledgeIndex, id);
      const nextTab: WorkspaceTab = {
        noteId: id,
        title: nextNote.metadata.name.replace(/\.md$/i, ""),
        path: note?.path ?? nextNote.metadata.name,
        viewMode: existingTab?.viewMode ?? "edit",
      };
      setTabs((current) =>
        current.some((tab) => tab.noteId === id)
          ? current.map((tab) =>
              tab.noteId === id
                ? { ...tab, title: nextTab.title, path: nextTab.path }
                : tab,
            )
          : [...current, nextTab],
      );
      setActiveTabId(id);
      setViewMode(nextTab.viewMode);
      setMobileSidebarOpen(false);
      if (window.matchMedia("(max-width: 760px)").matches) {
        setRightSidebarOpen(false);
      }

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
        const entries = [
          ...current.entries.slice(0, current.index + 1),
          id,
        ].slice(-50);
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

  function updateActiveDraft(value: string) {
    setDraft(value);
    if (!activeTabId || !openNote) return;
    setTabBuffers((current) => ({
      ...current,
      [activeTabId]: {
        note: openNote,
        draft: value,
      },
    }));
  }

  function transformActiveDraft(
    transform: (value: string) => string,
  ) {
    try {
      const next = transform(draft);
      updateActiveDraft(next);
    } catch (error) {
      setStatus({ kind: "error", message: errorMessage(error) });
    }
  }

  function updateTags(tags: readonly string[]) {
    transformActiveDraft((current) =>
      updateFrontmatterStringList(current, "tags", tags),
    );
  }

  function updateAliases(aliases: readonly string[]) {
    transformActiveDraft((current) =>
      updateFrontmatterStringList(current, "aliases", aliases),
    );
  }

  function selectLeftPanel(panel: WorkspacePanel) {
    setActiveLeftPanel(panel);
    setLeftSidebarOpen(true);
    setMobileSidebarOpen(true);
  }

  function setActiveViewMode(mode: NoteViewMode) {
    setViewMode(mode);
    if (!activeTabId) return;
    setTabs((current) =>
      current.map((tab) =>
        tab.noteId === activeTabId ? { ...tab, viewMode: mode } : tab,
      ),
    );
  }

  async function closeTab(noteId: string) {
    const index = tabs.findIndex((tab) => tab.noteId === noteId);
    if (index < 0) return;

    const closingActive = activeTabId === noteId;
    const buffer =
      closingActive && openNote
        ? { note: openNote, draft }
        : tabBuffers[noteId];
    const tabDirty =
      buffer !== undefined &&
      buffer.draft !== buffer.note.originalContent;

    if (
      tabDirty &&
      !window.confirm("Close this tab and discard unsaved changes?")
    ) {
      return;
    }

    const remaining = tabs.filter((tab) => tab.noteId !== noteId);
    setTabs(remaining);
    setTabBuffers((current) => {
      const next = { ...current };
      delete next[noteId];
      return next;
    });

    if (!closingActive) return;

    const next = remaining[Math.min(index, remaining.length - 1)];
    if (!next) {
      setActiveTabId(undefined);
      setOpenNote(undefined);
      setDraft("");
      setRightSidebarOpen(false);
      return;
    }

    await openNoteById(next.noteId, "push", false);
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
      const savedNote = { metadata, originalContent: draft };
      setOpenNote(savedNote);
      if (activeTabId) {
        setTabBuffers((current) => ({
          ...current,
          [activeTabId]: {
            note: savedNote,
            draft,
          },
        }));
      }
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

        const indexedNote = getNote(updated, metadata.id);
        if (indexedNote && activeWorkspace) {
          const searchDocument = createSearchDocument({
            noteId: indexedNote.id,
            path: indexedNote.path,
            name: indexedNote.name,
            title: indexedNote.title,
            aliases: indexedNote.aliases,
            tags: indexedNote.tags,
            headings: indexedNote.headings.map(
              (heading) => heading.text,
            ),
            content: draft,
            ...(metadata.revision
              ? { revision: metadata.revision }
              : {}),
            ...(metadata.modifiedAt
              ? { modifiedAt: metadata.modifiedAt }
              : {}),
          });
          const baseSearchSnapshot =
            searchSnapshot ??
            createSearchIndexSnapshot(activeWorkspace.id, []);
          const nextSearchSnapshot = upsertSearchDocument(
            baseSearchSnapshot,
            searchDocument,
          );
          await searchStore.put(nextSearchSnapshot);
          setSearchSnapshot(nextSearchSnapshot);
          setSearchIndex(
            new LexicalSearchIndex(nextSearchSnapshot.documents),
          );
        }
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

  function showFiles() {
    setActiveLeftPanel("files");
    setLeftSidebarOpen(true);
    setMobileSidebarOpen(true);
  }

  function leaveWorkspace() {
    if (!confirmDiscardAllDirty()) return;
    setActiveWorkspace(undefined);
    setProvider(undefined);
    setTree([]);
    setSelectedFolderId("");
    setOpenNote(undefined);
    setDraft("");
    setTabs([]);
    setTabBuffers({});
    setActiveTabId(undefined);
    setNavigation({ entries: [], index: -1 });
    setKnowledgeIndex(undefined);
    setSearchIndex(undefined);
    setSearchSnapshot(undefined);
    setWorkspaceUiReady(false);
    setRightSidebarOpen(false);
    setMobileSidebarOpen(true);
    setQuickSwitcherOpen(false);
    setNewItem(undefined);
  }

  function disconnect() {
    if (!confirmDiscardAllDirty()) return;
    setAuthSession(undefined);
    setWorkspaceService(undefined);
    setWorkspaces([]);
    setActiveWorkspace(undefined);
    setProvider(undefined);
    setTree([]);
    setSelectedFolderId("");
    setOpenNote(undefined);
    setDraft("");
    setTabs([]);
    setTabBuffers({});
    setActiveTabId(undefined);
    setNavigation({ entries: [], index: -1 });
    setKnowledgeIndex(undefined);
    setSearchIndex(undefined);
    setSearchSnapshot(undefined);
    setWorkspaceUiReady(false);
    setRightSidebarOpen(false);
    setMobileSidebarOpen(true);
    setQuickSwitcherOpen(false);
    setNewItem(undefined);
    setStatus({ kind: "idle" });
  }

  function confirmDiscardAllDirty(): boolean {
    const hasDirtyBuffer = Object.entries(tabBuffers).some(
      ([noteId, buffer]) =>
        noteId !== activeTabId &&
        buffer.draft !== buffer.note.originalContent,
    );
    if (!dirty && !hasDirtyBuffer) return true;
    return window.confirm("Discard unsaved changes in open tabs?");
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

  const leftSidebar =
    activeLeftPanel === "files" ? (
      <SidebarFrame
        title="Files"
        actions={
          <>
            <button
              type="button"
              aria-label="New note"
              title="New note"
              onClick={() =>
                requestNewItem("note", selectedFolderId || provider.rootId)
              }
            >
              <Icon name="file-plus" />
            </button>
            <button
              type="button"
              aria-label="New folder"
              title="New folder"
              onClick={() =>
                requestNewItem("folder", selectedFolderId || provider.rootId)
              }
            >
              <Icon name="folder-plus" />
            </button>
            <button
              type="button"
              aria-label="Refresh vault and local index"
              title="Refresh"
              onClick={() => void refreshWorkspaceState()}
            >
              <Icon name="refresh" />
            </button>
            <button
              type="button"
              className="sidebar-collapse"
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
              onClick={() => {
                setLeftSidebarOpen(false);
                setMobileSidebarOpen(false);
              }}
            >
              ‹
            </button>
          </>
        }
      >
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
      </SidebarFrame>
    ) : activeLeftPanel === "search" ? (
      <SidebarFrame
        title="Search"
        actions={
          <button
            type="button"
            className="sidebar-collapse"
            aria-label="Collapse sidebar"
            onClick={() => {
              setLeftSidebarOpen(false);
              setMobileSidebarOpen(false);
            }}
          >
            ‹
          </button>
        }
      >
        <SearchPanel
          index={searchIndex}
          onOpenNote={(noteId) => void openNoteById(noteId)}
        />
      </SidebarFrame>
    ) : activeLeftPanel === "graph" ? (
      <SidebarFrame
        title="Graph"
        actions={
          <button
            type="button"
            className="sidebar-collapse"
            aria-label="Collapse sidebar"
            onClick={() => {
              setLeftSidebarOpen(false);
              setMobileSidebarOpen(false);
            }}
          >
            ‹
          </button>
        }
      >
        <div className="graph-summary">
          <strong>{knowledgeIndex?.notes.length ?? 0}</strong>
          <span>notes in vault</span>
          <strong>
            {knowledgeIndex?.edges.filter(
              (edge) => edge.resolution === "resolved",
            ).length ?? 0}
          </strong>
          <span>resolved links</span>
        </div>
        <LocalGraphPanel
          index={knowledgeIndex}
          activeNoteId={openNote?.metadata.id}
          onOpenNote={(noteId) => void openNoteById(noteId)}
        />
      </SidebarFrame>
    ) : activeLeftPanel === "tags" ? (
      <SidebarFrame
        title="Tags"
        actions={
          <button
            type="button"
            className="sidebar-collapse"
            aria-label="Collapse sidebar"
            onClick={() => {
              setLeftSidebarOpen(false);
              setMobileSidebarOpen(false);
            }}
          >
            ‹
          </button>
        }
      >
        <TagsPanel
          index={knowledgeIndex}
          selectedTag={selectedTag}
          onSelectTag={setSelectedTag}
          onOpenNote={(noteId) => void openNoteById(noteId)}
        />
      </SidebarFrame>
    ) : (
      <SidebarFrame
        title="Settings"
        actions={
          <button
            type="button"
            className="sidebar-collapse"
            aria-label="Collapse sidebar"
            onClick={() => {
              setLeftSidebarOpen(false);
              setMobileSidebarOpen(false);
            }}
          >
            ‹
          </button>
        }
      >
        <section className="settings-panel-section">
          <span className="section-label">Appearance</span>
          <div className="settings-choice-list">
            {(["system", "light", "dark"] as const).map((theme) => (
              <button
                type="button"
                className={themePreference === theme ? "selected" : ""}
                key={theme}
                onClick={() => setThemePreference(theme)}
              >
                <span>{themePreference === theme ? "✓" : ""}</span>
                {theme[0]?.toUpperCase()}{theme.slice(1)}
              </button>
            ))}
          </div>
        </section>
        <section className="settings-panel-section">
          <span className="section-label">Workspace</span>
          <button className="sidebar-call-to-action" type="button" onClick={leaveWorkspace}>
            Switch workspace
          </button>
          <p className="sidebar-help">
            Tabs and panel layout are stored only in this browser. Your Markdown remains in Drive.
          </p>
        </section>
      </SidebarFrame>
    );

  return (
    <main
      className={[
        "app-shell-v2",
        leftSidebarOpen ? "left-sidebar-open" : "",
        rightSidebarOpen ? "right-sidebar-open" : "",
        mobileSidebarOpen ? "mobile-sidebar-open" : "",
      ].join(" ")}
    >
      <div className="workspace-shell-v2">
        <WorkspaceRail
          activePanel={activeLeftPanel}
          sidebarOpen={leftSidebarOpen}
          onPanel={selectLeftPanel}
        />

        {leftSidebarOpen ? leftSidebar : null}

        <section className="workspace-main">
          <TabBar
            tabs={tabs}
            activeNoteId={activeTabId}
            dirtyNoteIds={dirtyNoteIds}
            onActivate={(noteId) => void openNoteById(noteId)}
            onClose={(noteId) => void closeTab(noteId)}
            onNew={() =>
              requestNewItem("note", selectedFolderId || provider.rootId)
            }
          />

          <WorkspaceHeader
            canBack={canNavigateBack}
            canForward={canNavigateForward}
            breadcrumb={
              currentIndexedNote
                ? `${activeWorkspace.name} / ${currentIndexedNote.path.replace(/\.md$/i, "")}`
                : activeWorkspace.name
            }
            viewMode={viewMode}
            hasNote={openNote !== undefined}
            dirty={dirty}
            rightSidebarOpen={rightSidebarOpen}
            onBack={() => void navigateHistory("back")}
            onForward={() => void navigateHistory("forward")}
            onViewMode={setActiveViewMode}
            onContext={() => setRightSidebarOpen((current) => !current)}
            onSave={() => void saveNote()}
          />

          <section className="editor-panel-v2" aria-label="Markdown editor">
            {openNote ? (
              <>
                <button
                  className="mobile-files-button"
                  type="button"
                  onClick={showFiles}
                >
                  Files
                </button>
                {viewMode === "edit" ? (
                  <MarkdownEditor
                    key={openNote.metadata.id}
                    value={draft}
                    label={`Edit ${openNote.metadata.name}`}
                    linkTargets={editorLinkTargets}
                    tags={knownTags}
                    onChange={updateActiveDraft}
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
              <div className="workspace-empty-v2">
                <span className="section-label">MindContext</span>
                <h2>Open a note</h2>
                <p>
                  Pick a note from Files or use the Quick Switcher. Your
                  workspace is plain Markdown in Google Drive.
                </p>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setQuickSwitcherOpen(true)}
                >
                  Open note
                </button>
              </div>
            )}
          </section>
        </section>

        {rightSidebarOpen && openNote ? (
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
            onBackToNote={() => setRightSidebarOpen(false)}
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

function TagsPanel({
  index,
  selectedTag,
  onSelectTag,
  onOpenNote,
}: {
  readonly index: KnowledgeIndexSnapshot | undefined;
  readonly selectedTag: string | undefined;
  readonly onSelectTag: (tag: string | undefined) => void;
  readonly onOpenNote: (noteId: string) => void;
}) {
  const counts = new Map<string, number>();
  for (const note of index?.notes ?? []) {
    for (const tag of note.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }

  const tags = [...counts.entries()].sort((left, right) =>
    left[0].localeCompare(right[0]),
  );
  const matchingNotes = selectedTag
    ? (index?.notes ?? []).filter((note) => note.tags.includes(selectedTag))
    : [];

  return (
    <div className="tags-panel">
      {selectedTag ? (
        <>
          <button
            className="tags-back"
            type="button"
            onClick={() => onSelectTag(undefined)}
          >
            ← All tags
          </button>
          <h3>#{selectedTag}</h3>
          <div className="tag-note-list">
            {matchingNotes.map((note) => (
              <button
                type="button"
                key={note.id}
                onClick={() => onOpenNote(note.id)}
              >
                <span>{note.title}</span>
                <small>{note.path}</small>
              </button>
            ))}
          </div>
        </>
      ) : tags.length > 0 ? (
        <div className="tag-browser-list">
          {tags.map(([tag, count]) => (
            <button type="button" key={tag} onClick={() => onSelectTag(tag)}>
              <span>#{tag}</span>
              <small>{count}</small>
            </button>
          ))}
        </div>
      ) : (
        <p className="sidebar-help">No tags in this workspace yet.</p>
      )}
    </div>
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
      <button
        className="knowledge-back"
        type="button"
        aria-label="Close context"
        onClick={onBackToNote}
      >
        ×
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
