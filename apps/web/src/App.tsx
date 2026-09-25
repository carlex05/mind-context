import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
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
  IndexedDbEmbeddingIndexStore,
  IndexedDbKnowledgeIndexStore,
  IndexedDbPendingNoteDraftStore,
  IndexedDbSearchIndexStore,
} from "@mind-context/persistence-indexeddb";
import {
  HybridSearchService,
  LexicalSearchIndex,
  SemanticSearchIndex,
  canReuseSearchDocument,
  createSearchDocument,
  createSearchIndexSnapshot,
  upsertSearchDocument,
  type SearchIndexSnapshot,
  type SearchService,
} from "@mind-context/search";
import {
  buildEmbeddingSnapshot,
  type EmbeddingIndexSnapshot,
} from "@mind-context/embeddings";
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
import {
  BrowserEmbeddingProvider,
  DEFAULT_BROWSER_EMBEDDING_MODEL,
} from "./browserEmbeddings";
import { buildWorkspaceDerivedState } from "./knowledgeWorkspace";
import { MarkdownEditor } from "./MarkdownEditor";
import { MarkdownPreview } from "./MarkdownPreview";
import { LocalGraphPanel } from "./LocalGraphPanel";
import { LanguageSelector } from "./LanguageSelector";
import { NewItemDialog, type CreateItemKind } from "./NewItemDialog";
import { PropertiesEditor } from "./PropertiesEditor";
import { QuickSwitcher } from "./QuickSwitcher";
import {
  SearchPanel,
  type SemanticUiState,
} from "./SearchPanel";
import {
  applyThemePreference,
  readThemePreference,
  type ThemePreference,
} from "./theme";
import { WorkspaceExplorer } from "./WorkspaceExplorer";
import {
  WorkspaceOnboardingDialog,
  type WorkspaceOnboardingMode,
} from "./WorkspaceOnboardingDialog";
import {
  applyWorkspaceTemplate,
  type TemplateLocale,
  type WorkspaceStarter,
} from "./workspaceTemplates";
import {
  Icon,
  PlaceholderPanel,
  SidebarFrame,
  TabBar,
  WorkspaceHeader,
  WorkspaceRail,
  type NoteSyncState,
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
const embeddingStore = new IndexedDbEmbeddingIndexStore();
const pendingDraftStore = new IndexedDbPendingNoteDraftStore();
const SEMANTIC_SEARCH_KEY = "mindcontext.semantic-search.enabled";
const LOCAL_DRAFT_DEBOUNCE_MS = 120;
const DRIVE_SYNC_DEBOUNCE_MS = 1200;

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
  const { t, i18n } = useTranslation();
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
  const [workspaceName, setWorkspaceName] = useState(
    () => t("chooser.defaultName"),
  );
  const [knowledgeIndex, setKnowledgeIndex] =
    useState<KnowledgeIndexSnapshot>();
  const [searchIndex, setSearchIndex] = useState<LexicalSearchIndex>();
  const [searchSnapshot, setSearchSnapshot] =
    useState<SearchIndexSnapshot>();
  const [embeddingSnapshot, setEmbeddingSnapshot] =
    useState<EmbeddingIndexSnapshot>();
  const [semanticEnabled, setSemanticEnabled] = useState(
    () => window.localStorage.getItem(SEMANTIC_SEARCH_KEY) === "true",
  );
  const [semanticUi, setSemanticUi] = useState<SemanticUiState>(() =>
    window.localStorage.getItem(SEMANTIC_SEARCH_KEY) === "true"
      ? {
          kind: "preparing",
          stage: "initialize",
        }
      : { kind: "disabled" },
  );
  const [tabs, setTabs] = useState<readonly WorkspaceTab[]>([]);
  const [tabBuffers, setTabBuffers] = useState<
    Readonly<Record<string, NoteBuffer>>
  >({});
  const [noteSyncStates, setNoteSyncStates] = useState<
    Readonly<Record<string, NoteSyncState>>
  >({});
  const tabBuffersRef = useRef<Readonly<Record<string, NoteBuffer>>>({});
  const noteSyncStatesRef = useRef<Readonly<Record<string, NoteSyncState>>>({});
  const activeTabIdRef = useRef<string>();
  const localDraftTimersRef = useRef<
    Map<string, ReturnType<typeof setTimeout>>
  >(new Map());
  const driveSyncTimersRef = useRef<
    Map<string, ReturnType<typeof setTimeout>>
  >(new Map());
  const syncInFlightRef = useRef<Set<string>>(new Set());
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
  const [onboardingMode, setOnboardingMode] =
    useState<WorkspaceOnboardingMode>();
  const [onboardingSubmitting, setOnboardingSubmitting] = useState(false);
  const [recentNoteIds, setRecentNoteIds] = useState<readonly string[]>([]);
  const [navigation, setNavigation] = useState<{
    readonly entries: readonly string[];
    readonly index: number;
  }>({ entries: [], index: -1 });
  const [status, setStatus] = useState<AppStatus>({ kind: "idle" });

  const embeddingProvider = useMemo(
    () =>
      new BrowserEmbeddingProvider((progress) => {
        if (progress.stage === "model-ready") {
          setSemanticUi({
            kind: "preparing",
            stage: "model-ready",
            runtime: progress.runtime,
          });
          return;
        }
        if (progress.stage === "downloading-model") {
          setSemanticUi({
            kind: "preparing",
            stage: "downloading-model",
            ...(progress.percent === undefined
              ? {}
              : { percent: progress.percent }),
          });
          return;
        }
        setSemanticUi({
          kind: "preparing",
          stage: "loading-model",
        });
      }),
    [],
  );

  const dirty =
    openNote !== undefined && draft !== openNote.originalContent;
  const activeSyncState: NoteSyncState = openNote
    ? noteSyncStates[openNote.metadata.id] ?? (dirty ? "local" : "synced")
    : "synced";

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

  const searchService = useMemo<SearchService | undefined>(() => {
    if (!searchIndex) return undefined;
    if (
      !semanticEnabled ||
      semanticUi.kind !== "ready" ||
      !searchSnapshot ||
      !embeddingSnapshot
    ) {
      return searchIndex;
    }

    return new HybridSearchService(
      searchIndex,
      new SemanticSearchIndex(
        searchSnapshot,
        embeddingSnapshot,
        embeddingProvider,
      ),
    );
  }, [
    searchIndex,
    semanticEnabled,
    semanticUi.kind,
    searchSnapshot,
    embeddingSnapshot,
    embeddingProvider,
  ]);

  useEffect(() => {
    if (!semanticEnabled || !activeWorkspace || !searchSnapshot) return;
    void prepareSemanticSearch(searchSnapshot);
  }, [
    semanticEnabled,
    activeWorkspace?.id,
    searchSnapshot?.builtAt,
  ]);

  useEffect(() => {
    tabBuffersRef.current = tabBuffers;
  }, [tabBuffers]);

  useEffect(() => {
    activeTabIdRef.current = activeTabId;
  }, [activeTabId]);

  useEffect(() => {
    if (!provider || !activeWorkspace) return;
    for (const [noteId, syncState] of Object.entries(noteSyncStates)) {
      if (syncState === "local" && tabBuffersRef.current[noteId]) {
        scheduleDriveSync(noteId);
      }
    }
  }, [provider, activeWorkspace?.id, noteSyncStates]);

  useEffect(
    () => () => {
      cancelAllScheduledSyncs();
    },
    [],
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
      if (command && key === "s" && activeTabId) {
        event.preventDefault();
        void saveNote();
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
    setStatus({ kind: "busy", message: t("status.connectingDrive") });
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
            ? t("status.driveConnected")
            : t("status.connectedCreateFirst"),
      });
    } catch (error) {
      setStatus({ kind: "error", message: errorMessage(error, t) });
    }
  }

  async function refreshWorkspaces(service = workspaceService) {
    if (!service) return;
    const discovered = await service.listWorkspaces();
    setWorkspaces(discovered);
  }

  async function createWorkspace(
    starter: WorkspaceStarter,
    locale: TemplateLocale,
  ) {
    if (!workspaceService || !authSession) return;

    setOnboardingSubmitting(true);
    setStatus({ kind: "busy", message: t("status.creatingWorkspace") });
    try {
      const workspace = await workspaceService.createWorkspace(workspaceName);
      const nextProvider = storageProviderFor(workspace, authSession);
      const applied = await applyWorkspaceTemplate(
        nextProvider,
        starter,
        locale,
      );
      markWorkspaceOnboardingHandled(workspace.id);
      await refreshWorkspaces(workspaceService);
      setOnboardingMode(undefined);
      await openWorkspace(workspace);
      setStatus({
        kind: "success",
        message:
          starter === "para"
            ? t("status.starterApplied", {
                directories: applied.createdDirectories,
                files: applied.createdMarkdownFiles,
              })
            : t("status.workspaceCreated", { name: workspace.name }),
      });
    } catch (error) {
      await refreshWorkspaces(workspaceService);
      setStatus({ kind: "error", message: errorMessage(error, t) });
    } finally {
      setOnboardingSubmitting(false);
    }
  }

  async function openWorkspace(workspace: GoogleDriveWorkspace) {
    if (!authSession) return;
    if (!confirmDiscardAllDirty()) return;

    cancelAllScheduledSyncs();
    const nextProvider = storageProviderFor(workspace, authSession);
    setOnboardingMode(undefined);

    setStatus({ kind: "busy", message: t("status.openingWorkspace") });
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
      replaceTabBuffers({});
      noteSyncStatesRef.current = {};
      setNoteSyncStates({});
      activeTabIdRef.current = undefined;
      setActiveTabId(undefined);
      setNavigation({ entries: [], index: -1 });
      setRightSidebarOpen(false);
      setMobileSidebarOpen(true);

      setStatus({
        kind: "busy",
        message: t("status.rebuildingIndex"),
      });
      const [nextTree, derived, rootItems] = await Promise.all([
        loadWorkspaceTree(nextProvider),
        buildWorkspaceDerivedState(
          nextProvider,
          workspace.id,
          cachedSearch,
        ),
        nextProvider.list(nextProvider.rootId),
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
        const pendingDraft = await pendingDraftStore.get(
          workspace.id,
          restoredActiveId,
        );
        const restoredDraft = pendingDraft?.content ?? content;
        setOpenNote(restoredNote);
        setDraft(restoredDraft);
        putTabBuffer(restoredActiveId, {
          note: restoredNote,
          draft: restoredDraft,
        });
        if (pendingDraft) {
          setNoteSyncState(
            restoredActiveId,
            pendingDraft.baseRevision === metadata.revision
              ? "local"
              : "conflict",
          );
        } else {
          setNoteSyncState(restoredActiveId, "synced");
        }
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
        message: t("status.indexed", {
          count: derived.stats.totalNotes,
          total: derived.stats.totalNotes,
          reused: derived.stats.reusedNotes,
          downloaded: derived.stats.downloadedNotes,
          chunks: derived.stats.chunks,
        }),
      });

      if (
        rootItems.length === 0 &&
        !workspaceOnboardingHandled(workspace.id)
      ) {
        setOnboardingMode("empty-existing");
      }
    } catch (error) {
      setStatus({ kind: "error", message: errorMessage(error, t) });
    }
  }

  async function refreshWorkspaceState() {
    if (!provider || !activeWorkspace) return;

    setStatus({
      kind: "busy",
      message: t("status.refreshingIndex"),
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
        message: t("status.refreshed", {
          count: derived.stats.reusedNotes,
          reused: derived.stats.reusedNotes,
          downloaded: derived.stats.downloadedNotes,
        }),
      });
    } catch (error) {
      setStatus({ kind: "error", message: errorMessage(error, t) });
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
      message: t("status.openingNote", {
        name: indexed?.name ?? buffered?.note.metadata.name ?? "note",
      }),
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
      setStatus({ kind: "error", message: errorMessage(error, t) });
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

    putTabBuffer(activeTabId, {
      note: openNote,
      draft: value,
    });

    if (value === openNote.originalContent) {
      cancelLocalDraftTimer(activeTabId);
      cancelDriveSyncTimer(activeTabId);
      if (activeWorkspace) {
        void pendingDraftStore.delete(activeWorkspace.id, activeTabId);
      }
      setNoteSyncState(activeTabId, "synced");
      return;
    }

    if (noteSyncStatesRef.current[activeTabId] !== "conflict") {
      setNoteSyncState(activeTabId, "local");
    }
    scheduleLocalDraftPersist(activeTabId);
  }

  function transformActiveDraft(
    transform: (value: string) => string,
  ) {
    try {
      const next = transform(draft);
      updateActiveDraft(next);
    } catch (error) {
      setStatus({ kind: "error", message: errorMessage(error, t) });
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
      !window.confirm(t("confirm.closeDirtyTab"))
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

  function enableSemanticSearch() {
    window.localStorage.setItem(SEMANTIC_SEARCH_KEY, "true");
    setSemanticEnabled(true);
    setSemanticUi({
      kind: "preparing",
      stage: "preparing",
    });
  }

  function disableSemanticSearch() {
    window.localStorage.setItem(SEMANTIC_SEARCH_KEY, "false");
    setSemanticEnabled(false);
    setEmbeddingSnapshot(undefined);
    setSemanticUi({ kind: "disabled" });
  }

  async function clearSemanticEmbeddings() {
    if (!activeWorkspace) return;
    await embeddingStore.delete(
      activeWorkspace.id,
      embeddingProvider.id,
      embeddingProvider.model,
    );
    window.localStorage.setItem(SEMANTIC_SEARCH_KEY, "false");
    setSemanticEnabled(false);
    setEmbeddingSnapshot(undefined);
    setSemanticUi({ kind: "disabled" });
    setStatus({
      kind: "success",
      message: t("status.semanticCleared"),
    });
  }

  async function prepareSemanticSearch(
    snapshot: SearchIndexSnapshot,
  ) {
    if (!activeWorkspace || !semanticEnabled) return;

    setSemanticUi({
      kind: "preparing",
      stage: "checking",
    });

    try {
      const previous = await embeddingStore.get(
        activeWorkspace.id,
        embeddingProvider.id,
        embeddingProvider.model,
      );
      const chunks = snapshot.documents.flatMap((document) =>
        document.chunks.map((chunk) => ({
          chunkId: chunk.id,
          noteId: chunk.noteId,
          contentHash: chunk.contentHash,
          text: chunk.text,
        })),
      );
      const result = await buildEmbeddingSnapshot(
        activeWorkspace.id,
        embeddingProvider,
        chunks,
        previous,
      );
      await embeddingStore.put(result.snapshot);
      setEmbeddingSnapshot(result.snapshot);
      setSemanticUi({
        kind: "ready",
        reused: result.stats.reusedChunks,
        created: result.stats.embeddedChunks,
        ...(embeddingProvider.runtime
          ? { runtime: embeddingProvider.runtime }
          : {}),
      });
    } catch (error) {
      setEmbeddingSnapshot(undefined);
      setSemanticUi({
        kind: "error",
        error: errorMessage(error, t),
      });
    }
  }

  async function completeExistingOnboarding(
    starter: WorkspaceStarter,
    locale: TemplateLocale,
  ) {
    if (!provider || !activeWorkspace) return;

    setOnboardingSubmitting(true);
    try {
      if (starter === "blank") {
        markWorkspaceOnboardingHandled(activeWorkspace.id);
        setOnboardingMode(undefined);
        setStatus({ kind: "success", message: t("status.emptyKept") });
        return;
      }

      const currentRootItems = await provider.list(provider.rootId);
      if (currentRootItems.length > 0) {
        setOnboardingMode(undefined);
        await refreshWorkspaceState();
        return;
      }

      setStatus({ kind: "busy", message: t("status.applyingStarter") });
      const applied = await applyWorkspaceTemplate(provider, starter, locale);
      markWorkspaceOnboardingHandled(activeWorkspace.id);
      setOnboardingMode(undefined);
      await refreshWorkspaceState();
      setStatus({
        kind: "success",
        message: t("status.starterApplied", {
          directories: applied.createdDirectories,
          files: applied.createdMarkdownFiles,
        }),
      });
    } catch (error) {
      setStatus({ kind: "error", message: errorMessage(error, t) });
    } finally {
      setOnboardingSubmitting(false);
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
      message:
        kind === "note"
          ? t("status.creatingNote")
          : t("status.creatingFolder"),
    });

    try {
      if (kind === "folder") {
        const metadata = await provider.createDirectory(parentId, name);
        setSelectedFolderId(metadata.id);
        await refreshWorkspaceState();
        setStatus({
          kind: "success",
          message: t("status.folderCreated", { name: metadata.name }),
        });
        return;
      }

      const metadata = await provider.createText(parentId, name, "");
      await refreshWorkspaceState();
      await openNoteById(metadata.id);
      setStatus({
        kind: "success",
        message: t("status.noteCreated", { name: metadata.name }),
      });
    } catch (error) {
      setStatus({ kind: "error", message: errorMessage(error, t) });
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

  function setNoteSyncState(noteId: string, state: NoteSyncState) {
    const current = noteSyncStatesRef.current;
    if (current[noteId] === state) return;
    const next = { ...current, [noteId]: state };
    noteSyncStatesRef.current = next;
    setNoteSyncStates(next);
  }

  function replaceTabBuffers(next: Readonly<Record<string, NoteBuffer>>) {
    tabBuffersRef.current = next;
    setTabBuffers(next);
  }

  function putTabBuffer(noteId: string, buffer: NoteBuffer) {
    replaceTabBuffers({
      ...tabBuffersRef.current,
      [noteId]: buffer,
    });
  }

  function removeTabBuffer(noteId: string) {
    const next = { ...tabBuffersRef.current };
    delete next[noteId];
    replaceTabBuffers(next);
  }

  function cancelLocalDraftTimer(noteId: string) {
    const timer = localDraftTimersRef.current.get(noteId);
    if (timer !== undefined) {
      clearTimeout(timer);
      localDraftTimersRef.current.delete(noteId);
    }
  }

  function cancelDriveSyncTimer(noteId: string) {
    const timer = driveSyncTimersRef.current.get(noteId);
    if (timer !== undefined) {
      clearTimeout(timer);
      driveSyncTimersRef.current.delete(noteId);
    }
  }

  function cancelAllScheduledSyncs() {
    for (const timer of localDraftTimersRef.current.values()) {
      clearTimeout(timer);
    }
    for (const timer of driveSyncTimersRef.current.values()) {
      clearTimeout(timer);
    }
    localDraftTimersRef.current.clear();
    driveSyncTimersRef.current.clear();
  }

  function scheduleLocalDraftPersist(noteId: string) {
    cancelLocalDraftTimer(noteId);
    const timer = setTimeout(() => {
      localDraftTimersRef.current.delete(noteId);
      void persistPendingDraft(noteId);
    }, LOCAL_DRAFT_DEBOUNCE_MS);
    localDraftTimersRef.current.set(noteId, timer);
  }

  function scheduleDriveSync(
    noteId: string,
    delay = DRIVE_SYNC_DEBOUNCE_MS,
  ) {
    if (noteSyncStatesRef.current[noteId] === "conflict") return;
    cancelDriveSyncTimer(noteId);
    const timer = setTimeout(() => {
      driveSyncTimersRef.current.delete(noteId);
      void syncNoteToDrive(noteId);
    }, delay);
    driveSyncTimersRef.current.set(noteId, timer);
  }

  async function persistPendingDraft(
    noteId: string,
    scheduleRemote = true,
  ): Promise<boolean> {
    if (!activeWorkspace) return false;
    cancelLocalDraftTimer(noteId);

    const buffer = tabBuffersRef.current[noteId];
    if (!buffer) return false;

    if (buffer.draft === buffer.note.originalContent) {
      await pendingDraftStore.delete(activeWorkspace.id, noteId);
      if (noteSyncStatesRef.current[noteId] !== "conflict") {
        setNoteSyncState(noteId, "synced");
      }
      return false;
    }

    await pendingDraftStore.put({
      workspaceId: activeWorkspace.id,
      noteId,
      content: buffer.draft,
      baseContent: buffer.note.originalContent,
      ...(buffer.note.metadata.revision
        ? { baseRevision: buffer.note.metadata.revision }
        : {}),
      updatedAt: new Date().toISOString(),
    });

    if (noteSyncStatesRef.current[noteId] !== "conflict") {
      setNoteSyncState(noteId, "local");
      if (scheduleRemote) scheduleDriveSync(noteId);
    }
    return true;
  }

  async function updateDerivedIndexesAfterRemoteSave(
    metadata: StorageObjectMetadata,
    content: string,
  ) {
    if (!knowledgeIndex) return;

    const existing = getNote(knowledgeIndex, metadata.id);
    const updated = upsertKnowledgeDocument(knowledgeIndex, {
      id: metadata.id,
      path: existing?.path ?? metadata.name,
      name: metadata.name,
      content,
      ...(metadata.modifiedAt ? { modifiedAt: metadata.modifiedAt } : {}),
      ...(metadata.revision ? { revision: metadata.revision } : {}),
    });
    setKnowledgeIndex(updated);

    const indexedNote = getNote(updated, metadata.id);
    if (!indexedNote || !activeWorkspace) {
      await knowledgeStore.put(updated);
      return;
    }

    const searchDocument = createSearchDocument({
      noteId: indexedNote.id,
      path: indexedNote.path,
      name: indexedNote.name,
      title: indexedNote.title,
      aliases: indexedNote.aliases,
      tags: indexedNote.tags,
      headings: indexedNote.headings.map((heading) => heading.text),
      content,
      ...(metadata.revision ? { revision: metadata.revision } : {}),
      ...(metadata.modifiedAt ? { modifiedAt: metadata.modifiedAt } : {}),
    });
    const baseSearchSnapshot =
      searchSnapshot ??
      createSearchIndexSnapshot(activeWorkspace.id, []);
    const nextSearchSnapshot = upsertSearchDocument(
      baseSearchSnapshot,
      searchDocument,
    );
    setSearchSnapshot(nextSearchSnapshot);
    setSearchIndex(new LexicalSearchIndex(nextSearchSnapshot.documents));

    await Promise.all([
      knowledgeStore.put(updated),
      searchStore.put(nextSearchSnapshot),
    ]);
  }

  async function syncNoteToDrive(noteId: string) {
    if (!provider || !activeWorkspace) return;
    if (noteSyncStatesRef.current[noteId] === "conflict") return;

    cancelDriveSyncTimer(noteId);
    if (syncInFlightRef.current.has(noteId)) return;

    try {
      await persistPendingDraft(noteId, false);
    } catch (error) {
      setNoteSyncState(noteId, "error");
      setStatus({ kind: "error", message: errorMessage(error, t) });
      return;
    }

    const buffer = tabBuffersRef.current[noteId];
    if (!buffer || buffer.draft === buffer.note.originalContent) return;

    syncInFlightRef.current.add(noteId);
    setNoteSyncState(noteId, "syncing");
    setStatus({ kind: "busy", message: t("status.savingDrive") });

    const contentToSave = buffer.draft;
    const noteAtStart = buffer.note;

    try {
      const metadata = await provider.writeText(
        noteId,
        contentToSave,
        noteAtStart.metadata.revision
          ? { expectedRevision: noteAtStart.metadata.revision }
          : undefined,
      );

      const latest = tabBuffersRef.current[noteId] ?? buffer;
      const savedNote: OpenNote = {
        metadata,
        originalContent: contentToSave,
      };
      const nextBuffer: NoteBuffer = {
        note: savedNote,
        draft: latest.draft,
      };
      putTabBuffer(noteId, nextBuffer);

      if (activeTabIdRef.current === noteId) {
        setOpenNote(savedNote);
        setDraft(latest.draft);
      }

      if (latest.draft !== contentToSave) {
        await pendingDraftStore.put({
          workspaceId: activeWorkspace.id,
          noteId,
          content: latest.draft,
          baseContent: contentToSave,
          ...(metadata.revision ? { baseRevision: metadata.revision } : {}),
          updatedAt: new Date().toISOString(),
        });
        setNoteSyncState(noteId, "local");
        scheduleDriveSync(noteId, 0);
      } else {
        await pendingDraftStore.delete(activeWorkspace.id, noteId);
        setNoteSyncState(noteId, "synced");
      }

      setStatus({
        kind: "success",
        message: t("status.saved"),
      });

      void updateDerivedIndexesAfterRemoteSave(metadata, contentToSave).catch(
        () => {
          // Canonical Drive synchronization already succeeded. Derived indexes
          // remain rebuildable and must not turn a successful save into a
          // synchronization failure.
        },
      );
    } catch (error) {
      if (error instanceof StorageConflictError) {
        setNoteSyncState(noteId, "conflict");
        setStatus({
          kind: "error",
          message: t("status.conflict"),
        });
        return;
      }
      setNoteSyncState(noteId, "error");
      setStatus({ kind: "error", message: errorMessage(error, t) });
    } finally {
      syncInFlightRef.current.delete(noteId);
    }
  }

  async function saveNote() {
    if (!activeTabId) return;
    await syncNoteToDrive(activeTabId);
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
    setEmbeddingSnapshot(undefined);
    setWorkspaceUiReady(false);
    setRightSidebarOpen(false);
    setMobileSidebarOpen(true);
    setQuickSwitcherOpen(false);
    setNewItem(undefined);
    setOnboardingMode(undefined);
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
    setEmbeddingSnapshot(undefined);
    setWorkspaceUiReady(false);
    setRightSidebarOpen(false);
    setMobileSidebarOpen(true);
    setQuickSwitcherOpen(false);
    setNewItem(undefined);
    setOnboardingMode(undefined);
    setStatus({ kind: "idle" });
  }

  function confirmDiscardAllDirty(): boolean {
    const hasDirtyBuffer = Object.entries(tabBuffers).some(
      ([noteId, buffer]) =>
        noteId !== activeTabId &&
        buffer.draft !== buffer.note.originalContent,
    );
    if (!dirty && !hasDirtyBuffer) return true;
    return window.confirm(t("confirm.discardOpenTabs"));
  }

  if (!authSession || !workspaceService) {
    return <Landing status={status} onConnect={connectDrive} />;
  }

  if (!activeWorkspace || !provider) {
    return (
      <>
      <WorkspaceChooser
        workspaces={workspaces}
        workspaceName={workspaceName}
        status={status}
        expiresAt={authSession.expiresAt}
        onWorkspaceNameChange={setWorkspaceName}
        onCreateWorkspace={() => setOnboardingMode("create")}
        onOpenWorkspace={openWorkspace}
        onRefresh={() => refreshWorkspaces()}
        onDisconnect={disconnect}
      />
      <WorkspaceOnboardingDialog
        open={onboardingMode === "create"}
        mode="create"
        workspaceName={workspaceName}
        initialLocale={resolvedTemplateLocale(i18n.resolvedLanguage)}
        submitting={onboardingSubmitting}
        onClose={() => {
          if (!onboardingSubmitting) setOnboardingMode(undefined);
        }}
        onSubmit={createWorkspace}
      />
    </>
    );
  }

  const leftSidebar =
    activeLeftPanel === "files" ? (
      <SidebarFrame
        title={t("nav.files")}
        actions={
          <>
            <button
              type="button"
              aria-label={t("actions.newNote")}
              title={t("actions.newNote")}
              onClick={() =>
                requestNewItem("note", selectedFolderId || provider.rootId)
              }
            >
              <Icon name="file-plus" />
            </button>
            <button
              type="button"
              aria-label={t("actions.newFolder")}
              title={t("actions.newFolder")}
              onClick={() =>
                requestNewItem("folder", selectedFolderId || provider.rootId)
              }
            >
              <Icon name="folder-plus" />
            </button>
            <button
              type="button"
              aria-label={t("actions.refreshVault")}
              title={t("common.refresh")}
              onClick={() => void refreshWorkspaceState()}
            >
              <Icon name="refresh" />
            </button>
            <button
              type="button"
              className="sidebar-collapse"
              aria-label={t("actions.collapseSidebar")}
              title={t("actions.collapseSidebar")}
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
        title={t("nav.search")}
        actions={
          <button
            type="button"
            className="sidebar-collapse"
            aria-label={t("actions.collapseSidebar")}
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
          service={searchService}
          semantic={semanticUi}
          onEnableSemantic={enableSemanticSearch}
          onOpenNote={(noteId) => void openNoteById(noteId)}
        />
      </SidebarFrame>
    ) : activeLeftPanel === "graph" ? (
      <SidebarFrame
        title={t("nav.graph")}
        actions={
          <button
            type="button"
            className="sidebar-collapse"
            aria-label={t("actions.collapseSidebar")}
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
          <span>{t("graph.notesInVault")}</span>
          <strong>
            {knowledgeIndex?.edges.filter(
              (edge) => edge.resolution === "resolved",
            ).length ?? 0}
          </strong>
          <span>{t("graph.resolvedLinks")}</span>
        </div>
        <LocalGraphPanel
          index={knowledgeIndex}
          activeNoteId={openNote?.metadata.id}
          onOpenNote={(noteId) => void openNoteById(noteId)}
        />
      </SidebarFrame>
    ) : activeLeftPanel === "tags" ? (
      <SidebarFrame
        title={t("nav.tags")}
        actions={
          <button
            type="button"
            className="sidebar-collapse"
            aria-label={t("actions.collapseSidebar")}
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
        title={t("nav.settings")}
        actions={
          <button
            type="button"
            className="sidebar-collapse"
            aria-label={t("actions.collapseSidebar")}
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
          <span className="section-label">{t("settings.appearance")}</span>
          <div className="settings-choice-list">
            {(["system", "light", "dark"] as const).map((theme) => (
              <button
                type="button"
                className={themePreference === theme ? "selected" : ""}
                key={theme}
                onClick={() => setThemePreference(theme)}
              >
                <span>{themePreference === theme ? "✓" : ""}</span>
                {theme === "system"
                  ? t("common.system")
                  : theme === "light"
                    ? t("common.light")
                    : t("common.dark")}
              </button>
            ))}
          </div>
        </section>
        <section className="settings-panel-section">
          <span className="section-label">{t("settings.language")}</span>
          <LanguageSelector />
        </section>
        <section className="settings-panel-section">
          <span className="section-label">{t("settings.localAi")}</span>
          <div className="semantic-settings">
            <strong>{t("semantic.title")}</strong>
            <p className="sidebar-help">
              {t("semantic.settingsDescription")}
            </p>
            <button
              className="sidebar-call-to-action"
              type="button"
              onClick={
                semanticEnabled
                  ? disableSemanticSearch
                  : enableSemanticSearch
              }
            >
              {semanticEnabled ? t("semantic.disable") : t("semantic.enable")}
            </button>
            {semanticEnabled ? (
              <button
                className="sidebar-text-action"
                type="button"
                onClick={() => void clearSemanticEmbeddings()}
              >
                {t("semantic.clear")}
              </button>
            ) : null}
            <small className="sidebar-help">
              {t("semantic.model", { model: DEFAULT_BROWSER_EMBEDDING_MODEL })}
            </small>
          </div>
        </section>
        <section className="settings-panel-section">
          <span className="section-label">{t("settings.workspace")}</span>
          <button className="sidebar-call-to-action" type="button" onClick={leaveWorkspace}>
            {t("settings.switchWorkspace")}
          </button>
          <p className="sidebar-help">
            {t("settings.workspaceState")}
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
            syncState={activeSyncState}
            rightSidebarOpen={rightSidebarOpen}
            onBack={() => void navigateHistory("back")}
            onForward={() => void navigateHistory("forward")}
            onViewMode={setActiveViewMode}
            onContext={() => setRightSidebarOpen((current) => !current)}
            onSave={() => void saveNote()}
          />

          <section className="editor-panel-v2" aria-label={t("editor.aria")}>
            {openNote ? (
              <>
                <button
                  className="mobile-files-button"
                  type="button"
                  onClick={showFiles}
                >
                  {t("nav.files")}
                </button>
                {viewMode === "edit" ? (
                  <MarkdownEditor
                    key={openNote.metadata.id}
                    value={draft}
                    label={t("editor.editFile", { name: openNote.metadata.name })}
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
                <h2>{t("editor.emptyTitle")}</h2>
                <p>
                  {t("editor.emptyBody")}
                </p>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setQuickSwitcherOpen(true)}
                >
                  {t("actions.openNote")}
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
      <WorkspaceOnboardingDialog
        open={onboardingMode === "empty-existing"}
        mode="empty-existing"
        workspaceName={activeWorkspace.name}
        initialLocale={resolvedTemplateLocale(i18n.resolvedLanguage)}
        submitting={onboardingSubmitting}
        onClose={() => {
          if (!onboardingSubmitting) setOnboardingMode(undefined);
        }}
        onSubmit={completeExistingOnboarding}
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
  const { t } = useTranslation();
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
            {t("tags.all")}
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
        <p className="sidebar-help">{t("tags.empty")}</p>
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
  const { t } = useTranslation();

  return (
    <aside className="knowledge-panel" aria-label={t("context.aria")}>
      <button
        className="knowledge-back"
        type="button"
        aria-label={t("context.close")}
        onClick={onBackToNote}
      >
        ×
      </button>
      <span className="section-label">{t("context.label")}</span>
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
          <summary>{t("properties.other")}</summary>
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

      <KnowledgeSection title={t("context.links")} empty={t("context.noOutgoing")}>
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

      <KnowledgeSection title={t("context.backlinks")} empty={t("context.noBacklinks")}>
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
        <KnowledgeSection title={t("context.broken")} empty="">
          {broken.map((edge, indexNumber) => (
            <div
              className="broken-link"
              key={`${edge.target}-broken-${indexNumber}`}
            >
              <span>[[{edge.target}{edge.heading ? `#${edge.heading}` : ""}]]</span>
              <small>{brokenReason(edge.resolution, t)}</small>
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
  const { t } = useTranslation();
  if (edge.resolution !== "resolved" || !edge.targetNoteId) {
    return (
      <div className="broken-link">
        <span>{label}</span>
        <small>{brokenReason(edge.resolution, t)}</small>
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

function brokenReason(
  resolution: KnowledgeEdge["resolution"],
  t: (key: string) => string,
): string {
  switch (resolution) {
    case "missing-note":
      return t("context.missingNote");
    case "ambiguous-note":
      return t("context.ambiguousNote");
    case "missing-heading":
      return t("context.missingHeading");
    case "missing-block":
      return t("context.missingBlock");
    case "resolved":
      return t("context.resolved");
  }
}

function Landing({
  status,
  onConnect,
}: {
  readonly status: AppStatus;
  readonly onConnect: () => void;
}) {
  const { t } = useTranslation();
  const principles = t("landing.principles", {
    returnObjects: true,
  }) as string[];

  return (
    <main className="landing-shell">
      <div className="pre-auth-locale">
        <LanguageSelector compact />
      </div>
      <section className="hero">
        <span className="eyebrow">{t("landing.eyebrow")}</span>
        <h1>{t("landing.title")}</h1>
        <p className="lede">{t("landing.body")}</p>
        <button
          className="primary-button large"
          type="button"
          onClick={onConnect}
          disabled={status.kind === "busy"}
        >
          {status.kind === "busy"
            ? t("landing.connecting")
            : t("landing.connect")}
        </button>
        <StatusBar status={status} />
      </section>

      <section
        className="principles-card"
        aria-label={t("landing.principlesAria")}
      >
        <span className="section-label">{t("landing.guardrails")}</span>
        <ul>
          {principles.map((principle) => (
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
  const { t, i18n } = useTranslation();

  return (
    <main className="chooser-shell">
      <div className="pre-auth-locale">
        <LanguageSelector compact />
      </div>
      <header className="chooser-header">
        <div>
          <span className="eyebrow">{t("chooser.connected")}</span>
          <h1>{t("chooser.title")}</h1>
          <p>
            {t("chooser.body")}
          </p>
        </div>
        <button className="secondary-button" type="button" onClick={onDisconnect}>
          {t("chooser.disconnect")}
        </button>
      </header>

      <section className="chooser-grid">
        <article className="create-card">
          <span className="section-label">{t("chooser.newWorkspace")}</span>
          <label htmlFor="workspace-name">{t("chooser.folderName")}</label>
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
            {t("chooser.createDrive")}
          </button>
        </article>

        <article className="existing-card">
          <div className="panel-heading">
            <div>
              <span className="section-label">{t("chooser.existing")}</span>
              <h2>{t("chooser.workspaces")}</h2>
            </div>
            <button
              className="icon-button"
              type="button"
              aria-label={t("common.refresh")}
              onClick={onRefresh}
            >
              ↻
            </button>
          </div>
          <div className="workspace-list">
            {workspaces.length === 0 ? (
              <p className="empty-state">{t("chooser.noWorkspaces")}</p>
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
                    <small>{t("chooser.driveFolder")}</small>
                  </span>
                  <span aria-hidden="true">→</span>
                </button>
              ))
            )}
          </div>
        </article>
      </section>

      <p className="session-note">
        {t("chooser.session", {
          time: new Date(expiresAt).toLocaleTimeString(
            i18n.resolvedLanguage ?? "en",
          ),
        })}
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
  const { t } = useTranslation();
  const [demoContent, setDemoContent] = useState(DEMO_MARKDOWN);
  const parsed = useMemo(
    () => markdownParser.parse(demoContent),
    [demoContent],
  );
  const headingCount = parsed.sections.filter(
    (section) => section.heading,
  ).length;

  return (
    <main className="preview-shell">
      <div className="pre-auth-locale">
        <LanguageSelector compact />
      </div>
      <header className="preview-intro">
        <div>
          <span className="eyebrow">{t("demo.eyebrow")}</span>
          <h1>{t("demo.title")}</h1>
          <p className="lede">{t("demo.body")}</p>
        </div>
        <div className="preview-warning">{t("demo.warning")}</div>
      </header>

      <section className="demo-editor-card">
        <div className="editor-toolbar">
          <div className="editor-title">
            <strong>Demo.md</strong>
            <span>
              {t("demo.headings", { count: headingCount })} ·{" "}
              {t("demo.wikilinks", { count: parsed.wikiLinks.length })} ·{" "}
              {t("demo.tags", { count: parsed.tags.length })}
            </span>
          </div>
        </div>
        <MarkdownEditor
          value={demoContent}
          label={t("editor.editFile", { name: "Demo.md" })}
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

function errorMessage(
  error: unknown,
  t: (key: string) => string,
): string {
  if (error instanceof GoogleDriveApiError && error.status === 401) {
    return t("errors.driveExpired");
  }
  if (error instanceof Error) {
    return error.message;
  }
  return t("errors.unexpected");
}

function storageProviderFor(
  workspace: GoogleDriveWorkspace,
  authSession: GoogleDriveAuthSession,
): GoogleDriveStorageProvider {
  return new GoogleDriveStorageProvider({
    workspaceFolderId: workspace.id,
    accessTokenProvider: {
      getAccessToken: () => authSession.accessToken,
    },
  });
}

function resolvedTemplateLocale(
  resolvedLanguage: string | undefined,
): TemplateLocale {
  return resolvedLanguage?.toLocaleLowerCase().startsWith("es")
    ? "es"
    : "en";
}

function onboardingHandledKey(workspaceId: string): string {
  return `mindcontext.onboarding.handled.${workspaceId}`;
}

function workspaceOnboardingHandled(workspaceId: string): boolean {
  return window.localStorage.getItem(onboardingHandledKey(workspaceId)) === "true";
}

function markWorkspaceOnboardingHandled(workspaceId: string): void {
  window.localStorage.setItem(onboardingHandledKey(workspaceId), "true");
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
