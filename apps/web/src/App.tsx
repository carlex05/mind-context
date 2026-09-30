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
  IndexedDbLocalVaultStore,
  IndexedDbPendingNoteDraftStore,
  IndexedDbSearchIndexStore,
  type PersistedLocalVault,
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
  browserLocalVaultPermission,
  createBrowserLocalVault,
  isBrowserLocalStorageSupported,
  isSameBrowserLocalVault,
  pickBrowserLocalVault,
  requestBrowserLocalVaultPermission,
  type BrowserLocalVault,
  type BrowserLocalVaultPermission,
} from "@mind-context/storage-local";
import {
  StorageConflictError,
  type StorageObjectMetadata,
  type StorageProvider,
} from "@mind-context/storage";
import {
  KnowledgeLinkView,
  KnowledgePanelFrame,
  KnowledgeSectionView,
} from "@mind-context/workspace-ui";

import {
  requestGoogleDriveAccess,
  type GoogleDriveAuthSession,
} from "./googleIdentity";
import { MutableGoogleDriveAccessTokenProvider } from "./googleDriveSession";
import {
  BrowserEmbeddingProvider,
  DEFAULT_BROWSER_EMBEDDING_MODEL,
} from "./browserEmbeddings";
import { buildWorkspaceDerivedState } from "./knowledgeWorkspace";
import {
  createRecoveryCopy,
  markRecoveryCopiesResolvedForSource,
} from "./recovery";
import { RecoverySettings } from "./RecoverySettings";
import { MarkdownEditor } from "./MarkdownEditor";
import {
  MarkdownPreview,
  type InternalMarkdownNavigationTarget,
} from "./MarkdownPreview";
import { LocalGraphPanel } from "./LocalGraphPanel";
import { LanguageSelector } from "./LanguageSelector";
import { BrandLockup } from "./Brand";
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
import { WorkspaceHome } from "./WorkspaceHome";
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
  type DriveStatusState,
  type NoteSyncState,
} from "./WorkspaceShell";
import {
  readWorkspaceUi,
  writeWorkspaceUi,
  type NoteViewMode,
  type WorkspacePanel,
  type WorkspaceTab,
} from "./workspaceUi";
import { extensionHost, fileViewRenderers } from "./bundledExtensions";
import {
  childPath,
  findWorkspaceNode,
  inferMediaType,
  isImageFile,
  loadWorkspaceTree,
  relativeWorkspaceFilePath,
  type WorkspaceTreeNode,
} from "./workspaceTree";

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim();
const knowledgeStore = new IndexedDbKnowledgeIndexStore();
const searchStore = new IndexedDbSearchIndexStore();
const embeddingStore = new IndexedDbEmbeddingIndexStore();
const pendingDraftStore = new IndexedDbPendingNoteDraftStore();
const localVaultStore = new IndexedDbLocalVaultStore();
const SEMANTIC_SEARCH_KEY = "mindcontext.semantic-search.enabled";
const LOCAL_DRAFT_DEBOUNCE_MS = 120;
const DRIVE_SYNC_DEBOUNCE_MS = 1200;
const CONFLICT_RECOVERY_DEBOUNCE_MS = 2000;
const DRIVE_SESSION_WARNING_MS = 5 * 60 * 1000;

type DriveSessionState =
  | "connected"
  | "expiring"
  | "reconnect-required"
  | "reconnecting";

type AppStatus =
  | { readonly kind: "idle" }
  | { readonly kind: "busy"; readonly message: string }
  | { readonly kind: "error"; readonly message: string }
  | { readonly kind: "success"; readonly message: string };

interface ActiveWorkspace {
  readonly id: string;
  readonly name: string;
  readonly kind: "google-drive" | "local";
}

interface OpenTextFile {
  readonly metadata: StorageObjectMetadata;
  readonly originalContent: string;
}

interface TextFileBuffer {
  readonly note: OpenTextFile;
  readonly draft: string;
}

interface NoteConflict {
  readonly remoteMetadata: StorageObjectMetadata;
  readonly remoteContent: string;
  readonly recoveryFileName?: string;
}

interface RecentLocalVault extends PersistedLocalVault {
  readonly permission: BrowserLocalVaultPermission;
}

export function App() {
  const { t, i18n } = useTranslation();
  const [authSession, setAuthSession] =
    useState<GoogleDriveAuthSession>();
  const [driveSessionState, setDriveSessionState] =
    useState<DriveSessionState>("connected");
  const driveSessionStateRef = useRef<DriveSessionState>("connected");
  const [driveTokenProvider] = useState(
    () =>
      new MutableGoogleDriveAccessTokenProvider(() => {
        driveSessionStateRef.current = "reconnect-required";
        setDriveSessionState("reconnect-required");
      }),
  );
  const [workspaceService, setWorkspaceService] =
    useState<GoogleDriveWorkspaceService>();
  const [workspaces, setWorkspaces] = useState<
    readonly GoogleDriveWorkspace[]
  >([]);
  const [activeWorkspace, setActiveWorkspace] =
    useState<ActiveWorkspace>();
  const [provider, setProvider] =
    useState<StorageProvider>();
  const [tree, setTree] = useState<readonly WorkspaceTreeNode[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState("");
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const attachmentTargetFolderIdRef = useRef<string | undefined>(undefined);
  const [openFile, setOpenFile] = useState<OpenTextFile>();
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
    Readonly<Record<string, TextFileBuffer>>
  >({});
  const [noteSyncStates, setNoteSyncStates] = useState<
    Readonly<Record<string, NoteSyncState>>
  >({});
  const [noteConflicts, setNoteConflicts] = useState<
    Readonly<Record<string, NoteConflict>>
  >({});
  const tabBuffersRef = useRef<Readonly<Record<string, TextFileBuffer>>>({});
  const noteSyncStatesRef = useRef<Readonly<Record<string, NoteSyncState>>>({});
  const noteConflictsRef = useRef<Readonly<Record<string, NoteConflict>>>({});
  const activeTabIdRef = useRef<string | undefined>(undefined);
  const localDraftTimersRef = useRef<
    Map<string, ReturnType<typeof setTimeout>>
  >(new Map());
  const driveSyncTimersRef = useRef<
    Map<string, ReturnType<typeof setTimeout>>
  >(new Map());
  const conflictRecoveryTimersRef = useRef<
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
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [selectedTag, setSelectedTag] = useState<string>();
  const [viewMode, setViewMode] = useState<NoteViewMode>("edit");
  const [markdownNavigation, setMarkdownNavigation] = useState<
    (InternalMarkdownNavigationTarget & { readonly key: number }) | undefined
  >();
  const markdownNavigationSequenceRef = useRef(0);
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
  const [recentLocalVaults, setRecentLocalVaults] = useState<
    readonly RecentLocalVault[]
  >([]);
  const localVaultAutoOpenAttemptedRef = useRef(false);
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

  const activeFileType = openFile
    ? extensionHost.fileTypes.resolve(openFile.metadata.name)
    : undefined;
  const activeIsMarkdown = activeFileType?.id === "markdown";
  const ActivePluginTextView =
    activeFileType && activeFileType.viewType !== "markdown"
      ? fileViewRenderers.resolveText(activeFileType.viewType)
      : undefined;
  const activeFilePath = openFile
    ? findWorkspaceNode(tree, openFile.metadata.id)?.path ?? openFile.metadata.name
    : "";

  const activeBufferedNote = openFile
    ? tabBuffers[openFile.metadata.id]?.note ?? openFile
    : undefined;
  const dirty =
    activeBufferedNote !== undefined &&
    draft !== activeBufferedNote.originalContent;
  const activeSyncState: NoteSyncState = openFile
    ? noteSyncStates[openFile.metadata.id] ?? (dirty ? "local" : "synced")
    : "synced";
  const activeConflict =
    activeTabId === undefined ? undefined : noteConflicts[activeTabId];

  const pendingDriveCount = Object.values(noteSyncStates).filter(
    (state) =>
      state === "local" ||
      state === "syncing" ||
      state === "error" ||
      state === "conflict",
  ).length;
  const globalDriveStatus: DriveStatusState =
    activeWorkspace?.kind === "local"
      ? Object.values(noteSyncStates).some((state) => state === "syncing")
        ? "syncing"
        : pendingDriveCount > 0
          ? "pending"
          : "synced"
      : driveSessionState === "reconnect-required"
        ? "reconnect-required"
        : driveSessionState === "reconnecting"
          ? "reconnecting"
          : driveSessionState === "expiring"
            ? "expiring"
            : Object.values(noteSyncStates).some((state) => state === "syncing")
              ? "syncing"
              : pendingDriveCount > 0
                ? "pending"
                : "synced";

  const dirtyResourceIds = useMemo(() => {
    const result = new Set<string>();
    for (const [noteId, buffer] of Object.entries(tabBuffers)) {
      if (buffer.draft !== buffer.note.originalContent) result.add(noteId);
    }
    if (activeTabId && dirty) result.add(activeTabId);
    return result;
  }, [tabBuffers, activeTabId, dirty, draft, openFile]);

  const parsedDraft = useMemo(
    () => markdownParser.parse(activeIsMarkdown ? draft : ""),
    [activeIsMarkdown, draft],
  );

  const currentIndexedNote =
    activeIsMarkdown && openFile
      ? getNote(knowledgeIndex, openFile.metadata.id)
      : undefined;
  const activeMarkdownNavigation =
    activeIsMarkdown &&
    openFile &&
    markdownNavigation?.noteId === openFile.metadata.id
      ? markdownNavigation
      : undefined;
  const outgoingLinks =
    activeIsMarkdown && openFile
      ? getOutgoingLinks(knowledgeIndex, openFile.metadata.id)
      : [];
  const backlinks =
    activeIsMarkdown && openFile
      ? getBacklinks(knowledgeIndex, openFile.metadata.id)
      : [];
  const brokenLinks =
    activeIsMarkdown && openFile
      ? getBrokenLinks(knowledgeIndex, openFile.metadata.id)
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
    void initializeLocalVaults();
  }, []);

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
    if (!authSession) return;

    const evaluate = () => {
      if (
        driveSessionStateRef.current === "reconnecting" ||
        driveSessionStateRef.current === "reconnect-required"
      ) {
        return;
      }

      const remaining = authSession.expiresAt - Date.now();
      if (remaining <= 0) {
        updateDriveSessionState("reconnect-required");
      } else if (remaining <= DRIVE_SESSION_WARNING_MS) {
        updateDriveSessionState("expiring");
      } else {
        updateDriveSessionState("connected");
      }
    };

    evaluate();

    const warningDelay = Math.max(
      0,
      authSession.expiresAt - Date.now() - DRIVE_SESSION_WARNING_MS,
    );
    const expiryDelay = Math.max(0, authSession.expiresAt - Date.now());
    const warningTimer = window.setTimeout(evaluate, warningDelay);
    const expiryTimer = window.setTimeout(() => {
      if (driveSessionStateRef.current !== "reconnecting") {
        updateDriveSessionState("reconnect-required");
      }
    }, expiryDelay);

    const handleVisibility = () => {
      if (document.visibilityState === "visible") evaluate();
    };

    window.addEventListener("focus", evaluate);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.clearTimeout(warningTimer);
      window.clearTimeout(expiryTimer);
      window.removeEventListener("focus", evaluate);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [authSession?.expiresAt]);

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
    if (!activeWorkspace) return;

    const persistVisibleDrafts = () => {
      void persistAllDirtyDraftsLocally();
    };
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        persistVisibleDrafts();
      }
    };

    window.addEventListener("pagehide", persistVisibleDrafts);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("pagehide", persistVisibleDrafts);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [activeWorkspace?.id]);

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
        resourceId: tab.resourceId,
        fileTypeId: tab.fileTypeId,
        viewMode: tab.viewMode,
      })),
      ...(activeTabId ? { activeResourceId: activeTabId } : {}),
      homeActive: activeTabId === undefined,
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

      if (command && (key === "o" || key === "k")) {
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


  function updateDriveSessionState(next: DriveSessionState) {
    driveSessionStateRef.current = next;
    setDriveSessionState(next);
  }

  function driveSessionCanSync(): boolean {
    return (
      driveSessionStateRef.current === "connected" ||
      driveSessionStateRef.current === "expiring"
    );
  }

  function storageCanSync(): boolean {
    return activeWorkspace?.kind === "local" || driveSessionCanSync();
  }

  async function reconnectDrive() {
    if (!GOOGLE_CLIENT_ID || driveSessionStateRef.current === "reconnecting") {
      return;
    }

    updateDriveSessionState("reconnecting");
    setStatus({ kind: "busy", message: t("status.reconnectingDrive") });
    try {
      const session = await requestGoogleDriveAccess(GOOGLE_CLIENT_ID, {
        prompt: "",
      });
      driveTokenProvider.setSession(session);
      setAuthSession(session);
      updateDriveSessionState("connected");
      setStatus({ kind: "success", message: t("status.driveReconnected") });

      if (activeWorkspace) {
        for (const [noteId, buffer] of Object.entries(tabBuffersRef.current)) {
          if (buffer.draft === buffer.note.originalContent) continue;
          setNoteSyncState(noteId, "local");
          scheduleDriveSync(noteId, 0);
        }
      }
    } catch (error) {
      updateDriveSessionState("reconnect-required");
      setStatus({ kind: "error", message: errorMessage(error, t) });
    }
  }

  async function connectDrive() {
    if (!GOOGLE_CLIENT_ID) {
      setStatus({ kind: "error", message: t("errors.driveNotConfigured") });
      return;
    }
    setStatus({ kind: "busy", message: t("status.connectingDrive") });
    try {
      const session = await requestGoogleDriveAccess(GOOGLE_CLIENT_ID);
      driveTokenProvider.setSession(session);
      updateDriveSessionState("connected");
      const service = new GoogleDriveWorkspaceService(driveTokenProvider);
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
      const nextProvider = storageProviderFor(workspace, driveTokenProvider);
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
    const nextProvider = storageProviderFor(workspace, driveTokenProvider);
    await activateWorkspace(
      {
        id: workspace.id,
        name: workspace.name,
        kind: "google-drive",
      },
      nextProvider,
    );
  }

  async function initializeLocalVaults() {
    if (localVaultAutoOpenAttemptedRef.current) return;
    localVaultAutoOpenAttemptedRef.current = true;

    const vaults = await loadRememberedLocalVaults();
    setRecentLocalVaults(vaults);

    const mostRecentGranted = vaults.find(
      (vault) => vault.permission === "granted",
    );
    if (mostRecentGranted) {
      await openRememberedLocalVault(mostRecentGranted, {
        requestPermission: false,
        discardConfirmed: true,
      });
    }
  }

  async function loadRememberedLocalVaults(): Promise<
    readonly RecentLocalVault[]
  > {
    try {
      const remembered = await localVaultStore.list();
      return Promise.all(
        remembered.map(async (vault) => ({
          ...vault,
          permission: await browserLocalVaultPermission(vault.handle),
        })),
      );
    } catch {
      return [];
    }
  }

  async function refreshRememberedLocalVaults() {
    setRecentLocalVaults(await loadRememberedLocalVaults());
  }

  async function rememberLocalVault(local: BrowserLocalVault) {
    const record: PersistedLocalVault = {
      workspaceId: local.workspaceId,
      name: local.name,
      handle: local.handle,
      lastOpenedAt: new Date().toISOString(),
    };

    try {
      await localVaultStore.put(record);
      await refreshRememberedLocalVaults();
    } catch {
      const permission = await browserLocalVaultPermission(local.handle);
      setRecentLocalVaults((current) => [
        { ...record, permission },
        ...current.filter(
          (vault) => vault.workspaceId !== local.workspaceId,
        ),
      ]);
    }
  }

  async function rememberedLocalVaultFor(
    handle: FileSystemDirectoryHandle,
  ): Promise<PersistedLocalVault | undefined> {
    try {
      const remembered = await localVaultStore.list();
      for (const vault of remembered) {
        if (await isSameBrowserLocalVault(handle, vault.handle)) {
          return vault;
        }
      }
    } catch {
      // Persistence is an enhancement. A selected local vault must still open.
    }
    return undefined;
  }

  async function openRememberedLocalVault(
    vault: RecentLocalVault,
    options: {
      readonly requestPermission?: boolean;
      readonly discardConfirmed?: boolean;
    } = {},
  ) {
    if (!options.discardConfirmed && !confirmDiscardAllDirty()) return;

    let permission = vault.permission;
    if (permission !== "granted") {
      if (options.requestPermission === false) return;

      setStatus({
        kind: "busy",
        message: t("status.requestingLocalVaultPermission", {
          name: vault.name,
        }),
      });
      permission = await requestBrowserLocalVaultPermission(vault.handle);
      setRecentLocalVaults((current) =>
        current.map((candidate) =>
          candidate.workspaceId === vault.workspaceId
            ? { ...candidate, permission }
            : candidate,
        ),
      );

      if (permission !== "granted") {
        setStatus({
          kind: "error",
          message:
            permission === "unsupported"
              ? t("errors.localVaultReselect", { name: vault.name })
              : t("errors.localVaultPermissionDenied", {
                  name: vault.name,
                }),
        });
        return;
      }
    }

    const local = createBrowserLocalVault(
      vault.handle,
      vault.workspaceId,
    );
    await rememberLocalVault(local);
    await activateWorkspace(
      {
        id: local.workspaceId,
        name: local.name,
        kind: "local",
      },
      local.provider,
      true,
    );
  }

  async function forgetRememberedLocalVault(workspaceId: string) {
    try {
      await localVaultStore.delete(workspaceId);
    } finally {
      setRecentLocalVaults((current) =>
        current.filter((vault) => vault.workspaceId !== workspaceId),
      );
    }
  }

  async function openLocalVault() {
    if (!isBrowserLocalStorageSupported()) {
      setStatus({
        kind: "error",
        message: t("errors.localVaultUnsupported"),
      });
      return;
    }
    if (!confirmDiscardAllDirty()) return;

    setStatus({ kind: "busy", message: t("status.openingLocalVault") });
    try {
      const selected = await pickBrowserLocalVault();
      const remembered = await rememberedLocalVaultFor(selected.handle);
      const local = remembered
        ? createBrowserLocalVault(selected.handle, remembered.workspaceId)
        : selected;
      await rememberLocalVault(local);
      await activateWorkspace(
        {
          id: local.workspaceId,
          name: local.name,
          kind: "local",
        },
        local.provider,
        true,
      );
    } catch (error) {
      if (isPickerAbort(error)) {
        setStatus({ kind: "idle" });
        return;
      }
      setStatus({ kind: "error", message: errorMessage(error, t) });
    }
  }

  async function activateWorkspace(
    workspace: ActiveWorkspace,
    nextProvider: StorageProvider,
    discardConfirmed = false,
  ) {
    if (!discardConfirmed && !confirmDiscardAllDirty()) return;

    cancelAllScheduledSyncs();
    setOnboardingMode(undefined);

    setWorkspaceLoading(true);
    setTree([]);
    setActiveLeftPanel("files");
    setLeftSidebarOpen(true);
    setMobileSidebarOpen(true);
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
      setOpenFile(undefined);
      setDraft("");
      setTabs([]);
      replaceTabBuffers({});
      noteSyncStatesRef.current = {};
      setNoteSyncStates({});
      noteConflictsRef.current = {};
      setNoteConflicts({});
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
      const restoredTabCandidates = await Promise.all(
        persistedUi.tabs.map(async (saved): Promise<WorkspaceTab | undefined> => {
          try {
            const metadata = await nextProvider.metadata(saved.resourceId);
            const fileType = extensionHost.fileTypes.resolve(metadata.name);
            if (!fileType || fileType.contentKind !== "text") return undefined;
            const indexedNote =
              fileType.id === "markdown"
                ? getNote(rebuilt, saved.resourceId)
                : undefined;
            const node = findWorkspaceNode(nextTree, saved.resourceId);
            return {
              resourceId: saved.resourceId,
              fileTypeId: fileType.id,
              title: displayFileTitle(metadata.name),
              path: indexedNote?.path ?? node?.path ?? metadata.name,
              viewMode: fileType.id === "markdown" ? saved.viewMode : "edit",
            };
          } catch {
            return undefined;
          }
        }),
      );
      const restoredTabs = restoredTabCandidates.filter(
        (tab): tab is WorkspaceTab => tab !== undefined,
      );
      const restoredActiveId = persistedUi.homeActive
        ? undefined
        : restoredTabs.some(
              (tab) => tab.resourceId === persistedUi.activeResourceId,
            )
          ? persistedUi.activeResourceId
          : restoredTabs[0]?.resourceId;

      setTabs(restoredTabs);
      setActiveTabId(restoredActiveId);
      setActiveLeftPanel(persistedUi.leftPanel);
      setLeftSidebarOpen(persistedUi.leftSidebarOpen);
      setRightSidebarOpen(persistedUi.rightSidebarOpen);

      if (restoredActiveId) {
        const metadata = await nextProvider.metadata(restoredActiveId);
        const restoredFileType = extensionHost.fileTypes.resolve(metadata.name);
        const cachedDocument =
          restoredFileType?.id === "markdown"
            ? derived.searchSnapshot.documents.find(
                (document) => document.noteId === restoredActiveId,
              )
            : undefined;
        const content =
          cachedDocument &&
          canReuseSearchDocument(cachedDocument, metadata.revision)
            ? cachedDocument.content
            : await nextProvider.readText(restoredActiveId);
        const pendingDraft = await pendingDraftStore.get(
          workspace.id,
          restoredActiveId,
        );
        const {
          revision: _remoteRevision,
          contentRevision: _remoteContentRevision,
          ...stableMetadata
        } = metadata;
        const restoredNote: OpenTextFile = pendingDraft
          ? {
              metadata: {
                ...stableMetadata,
                ...(pendingDraft.baseRevision
                  ? { revision: pendingDraft.baseRevision }
                  : {}),
                ...(pendingDraft.baseContentRevision
                  ? { contentRevision: pendingDraft.baseContentRevision }
                  : {}),
              },
              originalContent: pendingDraft.baseContent,
            }
          : { metadata, originalContent: content };
        const restoredDraft = pendingDraft?.content ?? content;
        setOpenFile(restoredNote);
        setDraft(restoredDraft);
        putTabBuffer(restoredActiveId, {
          note: restoredNote,
          draft: restoredDraft,
        });
        setNoteSyncState(
          restoredActiveId,
          pendingDraft ? "local" : "synced",
        );
        setViewMode(
          restoredTabs.find((tab) => tab.resourceId === restoredActiveId)?.viewMode ??
            "edit",
        );
        setNavigation({ entries: [restoredActiveId], index: 0 });
      }

      // Home and restored notes are the primary mobile surfaces after the
      // workspace finishes loading. Files remains one tap away in bottom nav.
      setMobileSidebarOpen(false);

      setWorkspaceUiReady(true);
      setWorkspaceLoading(false);
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
      setWorkspaceLoading(false);
      setActiveWorkspace(undefined);
      setProvider(undefined);
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
          const note = getNote(rebuilt, tab.resourceId);
          return note
            ? [{
                ...tab,
                title: note.name.replace(/\.md$/i, ""),
                path: note.path,
              }]
            : [];
        }),
      );

      const sourceBuffers: Record<string, TextFileBuffer> = {
        ...tabBuffersRef.current,
      };
      if (activeTabId && openFile && !sourceBuffers[activeTabId]) {
        sourceBuffers[activeTabId] = { note: openFile, draft };
      }

      const refreshedBufferEntries = await Promise.all(
        Object.entries(sourceBuffers)
          .filter(([noteId]) =>
            rebuilt.notes.some((note) => note.id === noteId),
          )
          .map(async ([noteId, buffer]) => {
            if (buffer.draft !== buffer.note.originalContent) {
              // Preserve the local baseline. Deferred synchronization performs
              // content-aware reconciliation if Drive has changed.
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
                { note, draft: content } satisfies TextFileBuffer,
              ] as const;
            } catch {
              return undefined;
            }
          }),
      );

      const refreshedBuffers = Object.fromEntries(
        refreshedBufferEntries.filter(
          (entry): entry is readonly [string, TextFileBuffer] =>
            entry !== undefined,
        ),
      );
      replaceTabBuffers(refreshedBuffers);

      if (activeTabId) {
        const activeBuffer = refreshedBuffers[activeTabId];
        if (activeBuffer) {
          setOpenFile(activeBuffer.note);
          setDraft(activeBuffer.draft);
        }
      }

      if (
        selectedFolderId !== provider.rootId &&
        !findWorkspaceNode(nextTree, selectedFolderId)
      ) {
        setSelectedFolderId(provider.rootId);
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

  async function openFileById(
    id: string,
    historyMode: "push" | "back" | "forward" = "push",
    storeCurrent = true,
  ): Promise<boolean> {
    if (!provider) return false;

    if (activeTabId === id && openFile) {
      setMobileSidebarOpen(false);
      return true;
    }

    if (storeCurrent && activeTabId && openFile) {
      putTabBuffer(activeTabId, {
        note: openFile,
        draft,
      });
    }

    const indexed = getNote(knowledgeIndex, id);
    const buffered = tabBuffersRef.current[id];
    setStatus({
      kind: "busy",
      message: t("status.openingNote", {
        name: indexed?.name ?? buffered?.note.metadata.name ?? "note",
      }),
    });

    try {
      let nextNote: OpenTextFile;
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
        const pendingDraft = activeWorkspace
          ? await pendingDraftStore.get(activeWorkspace.id, id)
          : undefined;
        const {
          revision: _remoteRevision,
          contentRevision: _remoteContentRevision,
          ...stableMetadata
        } = metadata;
        nextNote = pendingDraft
          ? {
              metadata: {
                ...stableMetadata,
                ...(pendingDraft.baseRevision
                  ? { revision: pendingDraft.baseRevision }
                  : {}),
                ...(pendingDraft.baseContentRevision
                  ? { contentRevision: pendingDraft.baseContentRevision }
                  : {}),
              },
              originalContent: pendingDraft.baseContent,
            }
          : {
              metadata,
              originalContent: content,
            };
        nextDraft = pendingDraft?.content ?? content;
        putTabBuffer(id, { note: nextNote, draft: nextDraft });
        setNoteSyncState(id, pendingDraft ? "local" : "synced");
      }

      setOpenFile(nextNote);
      setDraft(nextDraft);

      const existingTab = tabs.find((tab) => tab.resourceId === id);
      const note = getNote(knowledgeIndex, id);
      const nextTab: WorkspaceTab = {
        noteId: id,
        title: nextNote.metadata.name.replace(/\.md$/i, ""),
        path: note?.path ?? nextNote.metadata.name,
        viewMode: existingTab?.viewMode ?? "edit",
      };
      setTabs((current) =>
        current.some((tab) => tab.resourceId === id)
          ? current.map((tab) =>
              tab.resourceId === id
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

  async function openMarkdownTarget(
    target: InternalMarkdownNavigationTarget,
  ) {
    const opened = await openFileById(target.noteId);
    if (!opened) return;

    markdownNavigationSequenceRef.current += 1;
    setMarkdownNavigation({
      ...target,
      key: markdownNavigationSequenceRef.current,
    });
    setMobileSidebarOpen(false);
  }

  function openHome() {
    if (activeTabId && openFile) {
      putTabBuffer(activeTabId, {
        note: openFile,
        draft,
      });
    }
    activeTabIdRef.current = undefined;
    setActiveTabId(undefined);
    setOpenFile(undefined);
    setDraft("");
    setRightSidebarOpen(false);
    setMobileSidebarOpen(false);
    setMarkdownNavigation(undefined);
    setStatus({ kind: "idle" });
  }

  async function navigateHistory(direction: "back" | "forward") {
    const nextIndex =
      direction === "back" ? navigation.index - 1 : navigation.index + 1;
    const target = navigation.entries[nextIndex];
    if (!target) return;
    await openFileById(target, direction);
  }

  function updateActiveDraft(value: string) {
    setDraft(value);
    if (!activeTabId || !openFile) return;

    const currentBuffer = tabBuffersRef.current[activeTabId];
    const currentNote = currentBuffer?.note ?? openFile;
    putTabBuffer(activeTabId, {
      note: currentNote,
      draft: value,
    });

    if (value === currentNote.originalContent) {
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
    } else {
      const conflict = noteConflictsRef.current[activeTabId];
      if (conflict) {
        scheduleConflictRecovery(
          activeTabId,
          value,
          currentNote,
          conflict,
        );
      }
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
        tab.resourceId === activeTabId ? { ...tab, viewMode: mode } : tab,
      ),
    );
  }

  async function closeTab(noteId: string) {
    const index = tabs.findIndex((tab) => tab.resourceId === noteId);
    if (index < 0) return;

    const closingActive = activeTabId === noteId;
    const buffer =
      tabBuffersRef.current[noteId] ??
      (closingActive && openFile ? { note: openFile, draft } : undefined);
    const tabDirty =
      buffer !== undefined &&
      buffer.draft !== buffer.note.originalContent;

    if (tabDirty) {
      await persistPendingDraft(noteId, false);
      const conflict = noteConflictsRef.current[noteId];
      if (conflict && provider && buffer) {
        try {
          await createRecoveryCopy(provider, {
            source: conflict.remoteMetadata,
            content: buffer.draft,
            kind: "local-conflict",
            ...(buffer.note.metadata.contentRevision
              ? { baseRevision: buffer.note.metadata.contentRevision }
              : buffer.note.metadata.revision
                ? { baseRevision: buffer.note.metadata.revision }
                : {}),
            ...(conflict.remoteMetadata.contentRevision
              ? { remoteRevision: conflict.remoteMetadata.contentRevision }
              : conflict.remoteMetadata.revision
                ? { remoteRevision: conflict.remoteMetadata.revision }
                : {}),
          });
        } catch {
          // The local IndexedDB draft remains available after the tab closes.
        }
      }
    }
    cancelLocalDraftTimer(noteId);
    cancelDriveSyncTimer(noteId);
    cancelConflictRecoveryTimer(noteId);

    const remaining = tabs.filter((tab) => tab.resourceId !== noteId);
    setTabs(remaining);
    removeTabBuffer(noteId);
    const nextSyncStates = { ...noteSyncStatesRef.current };
    delete nextSyncStates[noteId];
    noteSyncStatesRef.current = nextSyncStates;
    setNoteSyncStates(nextSyncStates);
    clearNoteConflict(noteId);

    if (!closingActive) return;

    const next = remaining[Math.min(index, remaining.length - 1)];
    if (!next) {
      setActiveTabId(undefined);
      setOpenFile(undefined);
      setDraft("");
      setRightSidebarOpen(false);
      return;
    }

    await openFileById(next.resourceId, "push", false);
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
      await openFileById(metadata.id);
      setStatus({
        kind: "success",
        message: t("status.noteCreated", { name: metadata.name }),
      });
    } catch (error) {
      setStatus({ kind: "error", message: errorMessage(error, t) });
      throw error;
    }
  }

  async function attachFiles(
    files: readonly File[],
    requestedParentId?: string,
    options: {
      readonly appendReferences?: boolean;
      readonly autoRename?: boolean;
      readonly source?: "drop" | "paste";
    } = {},
  ): Promise<readonly string[]> {
    if (!provider || files.length === 0) return [];

    const parentId =
      requestedParentId || selectedFolderId || provider.rootId;
    const parentNode =
      parentId === provider.rootId
        ? undefined
        : findWorkspaceNode(tree, parentId);
    const parentPath = parentNode?.path ?? "";
    setStatus({ kind: "busy", message: t("status.attachingFiles") });

    try {
      const existing = await provider.list(parentId);
      const seenNames = new Set(
        existing.map((item) => item.name.toLocaleLowerCase()),
      );
      const uploads = files.map((file) => {
        const requestedName = attachmentFileName(file, options.source);
        const name = options.autoRename
          ? nextAvailableAttachmentName(requestedName, seenNames)
          : requestedName;
        const key = name.toLocaleLowerCase();
        if (!key || seenNames.has(key)) {
          throw new Error(
            t("errors.attachmentExists", { name: requestedName || "file" }),
          );
        }
        seenNames.add(key);
        return { file, name };
      });

      const currentNotePath = openFile
        ? getNote(knowledgeIndex, openFile.metadata.id)?.path
        : undefined;
      const references: string[] = [];

      for (const { file, name } of uploads) {
        const mediaType = inferMediaType(
          name,
          file.type || undefined,
        );
        const metadata = await provider.createBinary(
          parentId,
          name,
          new Uint8Array(await file.arrayBuffer()),
          mediaType,
        );

        if (currentNotePath) {
          const targetPath = childPath(parentPath, metadata.name);
          const relativePath = encodeMarkdownPath(
            relativeWorkspaceFilePath(currentNotePath, targetPath),
          );
          const label = escapeMarkdownLabel(metadata.name);
          references.push(
            isImageFile(metadata)
              ? `![${label}](${relativePath})`
              : `[${label}](${relativePath})`,
          );
        }
      }

      if (
        options.appendReferences !== false &&
        references.length > 0 &&
        openFile
      ) {
        updateActiveDraft(appendMarkdownReferences(draft, references));
      }

      await refreshWorkspaceState();
      setStatus({
        kind: "success",
        message: t("status.attachmentsAdded", { count: files.length }),
      });
      return references;
    } catch (error) {
      await refreshWorkspaceState().catch(() => undefined);
      setStatus({ kind: "error", message: errorMessage(error, t) });
      return [];
    }
  }

  function requestAttachFiles(folderId: string) {
    attachmentTargetFolderIdRef.current = folderId;
    attachmentInputRef.current?.click();
  }

  async function openAttachment(node: WorkspaceTreeNode) {
    if (!provider) return;
    setStatus({
      kind: "busy",
      message: t("status.openingAttachment", {
        name: node.metadata.name,
      }),
    });
    try {
      const content = await provider.readBinary(node.metadata.id);
      openBinaryInBrowser(
        node.metadata.name,
        inferMediaType(node.metadata.name, node.metadata.mediaType),
        content,
      );
      setStatus({
        kind: "success",
        message: t("status.attachmentOpened", {
          name: node.metadata.name,
        }),
      });
    } catch (error) {
      setStatus({ kind: "error", message: errorMessage(error, t) });
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

  function replaceTabBuffers(next: Readonly<Record<string, TextFileBuffer>>) {
    tabBuffersRef.current = next;
    setTabBuffers(next);
  }

  function putTabBuffer(noteId: string, buffer: TextFileBuffer) {
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

  function cancelConflictRecoveryTimer(noteId: string) {
    const timer = conflictRecoveryTimersRef.current.get(noteId);
    if (timer !== undefined) {
      clearTimeout(timer);
      conflictRecoveryTimersRef.current.delete(noteId);
    }
  }

  function cancelAllScheduledSyncs() {
    for (const timer of localDraftTimersRef.current.values()) {
      clearTimeout(timer);
    }
    for (const timer of driveSyncTimersRef.current.values()) {
      clearTimeout(timer);
    }
    for (const timer of conflictRecoveryTimersRef.current.values()) {
      clearTimeout(timer);
    }
    localDraftTimersRef.current.clear();
    driveSyncTimersRef.current.clear();
    conflictRecoveryTimersRef.current.clear();
  }

  function scheduleConflictRecovery(
    noteId: string,
    content: string,
    note: OpenTextFile,
    conflict: NoteConflict,
  ) {
    if (!provider) return;
    cancelConflictRecoveryTimer(noteId);
    const timer = setTimeout(() => {
      conflictRecoveryTimersRef.current.delete(noteId);
      void createRecoveryCopy(provider, {
        source: conflict.remoteMetadata,
        content,
        kind: "local-conflict",
        ...(note.metadata.contentRevision
          ? { baseRevision: note.metadata.contentRevision }
          : note.metadata.revision
            ? { baseRevision: note.metadata.revision }
            : {}),
        ...(conflict.remoteMetadata.contentRevision
          ? { remoteRevision: conflict.remoteMetadata.contentRevision }
          : conflict.remoteMetadata.revision
            ? { remoteRevision: conflict.remoteMetadata.revision }
            : {}),
      }).catch(() => {
        // IndexedDB remains the first recovery line if Drive is unavailable.
      });
    }, CONFLICT_RECOVERY_DEBOUNCE_MS);
    conflictRecoveryTimersRef.current.set(noteId, timer);
  }

  function scheduleLocalDraftPersist(noteId: string) {
    cancelLocalDraftTimer(noteId);
    const timer = setTimeout(() => {
      localDraftTimersRef.current.delete(noteId);
      void persistPendingDraft(noteId).catch((error) => {
        setNoteSyncState(noteId, "error");
        setStatus({ kind: "error", message: errorMessage(error, t) });
      });
    }, LOCAL_DRAFT_DEBOUNCE_MS);
    localDraftTimersRef.current.set(noteId, timer);
  }

  function scheduleDriveSync(
    noteId: string,
    delay = DRIVE_SYNC_DEBOUNCE_MS,
  ) {
    if (noteSyncStatesRef.current[noteId] === "conflict") return;
    if (!storageCanSync()) return;
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
      ...(buffer.note.metadata.contentRevision
        ? { baseContentRevision: buffer.note.metadata.contentRevision }
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

  function setNoteConflict(noteId: string, conflict: NoteConflict) {
    const next = {
      ...noteConflictsRef.current,
      [noteId]: conflict,
    };
    noteConflictsRef.current = next;
    setNoteConflicts(next);
  }

  function clearNoteConflict(noteId: string) {
    cancelConflictRecoveryTimer(noteId);
    if (!noteConflictsRef.current[noteId]) return;
    const next = { ...noteConflictsRef.current };
    delete next[noteId];
    noteConflictsRef.current = next;
    setNoteConflicts(next);
  }

  async function applyRemoteCanonical(
    noteId: string,
    metadata: StorageObjectMetadata,
    content: string,
  ) {
    if (!activeWorkspace) return;
    const note: OpenTextFile = { metadata, originalContent: content };
    putTabBuffer(noteId, { note, draft: content });
    if (activeTabIdRef.current === noteId) {
      setOpenFile(note);
      setDraft(content);
    }
    await pendingDraftStore.delete(activeWorkspace.id, noteId);
    clearNoteConflict(noteId);
    setNoteSyncState(noteId, "synced");
    void updateDerivedIndexesAfterRemoteSave(metadata, content);
  }

  async function reconcileDriveConflict(
    noteId: string,
    noteAtStart: OpenTextFile,
  ) {
    if (!provider || !activeWorkspace) return;

    const [remoteMetadata, remoteContent] = await Promise.all([
      provider.metadata(noteId),
      provider.readText(noteId),
    ]);
    const latest = tabBuffersRef.current[noteId];
    const localContent = latest?.draft ?? noteAtStart.originalContent;
    const baseContent = noteAtStart.originalContent;

    if (remoteContent === localContent) {
      await applyRemoteCanonical(noteId, remoteMetadata, remoteContent);
      setStatus({ kind: "success", message: activeWorkspace?.kind === "local"
          ? t("status.savedLocalVault")
          : t("status.saved") });
      return;
    }

    if (localContent === baseContent) {
      await applyRemoteCanonical(noteId, remoteMetadata, remoteContent);
      setStatus({ kind: "success", message: t("status.remoteAccepted") });
      return;
    }

    if (remoteContent === baseContent) {
      const rebasedNote: OpenTextFile = {
        metadata: remoteMetadata,
        originalContent: baseContent,
      };
      putTabBuffer(noteId, { note: rebasedNote, draft: localContent });
      if (activeTabIdRef.current === noteId) {
        setOpenFile(rebasedNote);
        setDraft(localContent);
      }
      await pendingDraftStore.put({
        workspaceId: activeWorkspace.id,
        noteId,
        content: localContent,
        baseContent,
        ...(remoteMetadata.revision
          ? { baseRevision: remoteMetadata.revision }
          : {}),
        ...(remoteMetadata.contentRevision
          ? { baseContentRevision: remoteMetadata.contentRevision }
          : {}),
        updatedAt: new Date().toISOString(),
      });
      clearNoteConflict(noteId);
      setNoteSyncState(noteId, "local");
      scheduleDriveSync(noteId, 0);
      return;
    }

    await pendingDraftStore.put({
      workspaceId: activeWorkspace.id,
      noteId,
      content: localContent,
      baseContent,
      ...(noteAtStart.metadata.revision
        ? { baseRevision: noteAtStart.metadata.revision }
        : {}),
      ...(noteAtStart.metadata.contentRevision
        ? { baseContentRevision: noteAtStart.metadata.contentRevision }
        : {}),
      updatedAt: new Date().toISOString(),
    });

    let recoveryFileName: string | undefined;
    try {
      const recovery = await createRecoveryCopy(provider, {
        source: remoteMetadata,
        content: localContent,
        kind: "local-conflict",
        ...(noteAtStart.metadata.contentRevision
          ? { baseRevision: noteAtStart.metadata.contentRevision }
          : noteAtStart.metadata.revision
            ? { baseRevision: noteAtStart.metadata.revision }
            : {}),
        ...(remoteMetadata.contentRevision
          ? { remoteRevision: remoteMetadata.contentRevision }
          : remoteMetadata.revision
            ? { remoteRevision: remoteMetadata.revision }
            : {}),
      });
      recoveryFileName = recovery.metadata.name;
    } catch {
      // The IndexedDB draft remains authoritative recovery state if Drive
      // cannot create the secondary recovery copy.
    }

    setNoteConflict(noteId, {
      remoteMetadata,
      remoteContent,
      ...(recoveryFileName ? { recoveryFileName } : {}),
    });
    setNoteSyncState(noteId, "conflict");
    setStatus({
      kind: "error",
      message: recoveryFileName
        ? t("status.conflictRecoveryCreated", { name: recoveryFileName })
        : t("status.conflictRecoveryLocalOnly"),
    });
  }

  async function resolveConflictKeepLocal(noteId: string) {
    if (!provider || !activeWorkspace) return;
    const conflict = noteConflictsRef.current[noteId];
    const buffer = tabBuffersRef.current[noteId];
    if (!conflict || !buffer) return;

    const localToSave = buffer.draft;
    setStatus({ kind: "busy", message: t("status.resolvingConflict") });

    try {
      await createRecoveryCopy(provider, {
        source: conflict.remoteMetadata,
        content: localToSave,
        kind: "local-conflict",
        ...(buffer.note.metadata.contentRevision
          ? { baseRevision: buffer.note.metadata.contentRevision }
          : buffer.note.metadata.revision
            ? { baseRevision: buffer.note.metadata.revision }
            : {}),
        ...(conflict.remoteMetadata.contentRevision
          ? { remoteRevision: conflict.remoteMetadata.contentRevision }
          : conflict.remoteMetadata.revision
            ? { remoteRevision: conflict.remoteMetadata.revision }
            : {}),
      });
      await createRecoveryCopy(provider, {
        source: conflict.remoteMetadata,
        content: conflict.remoteContent,
        kind: "remote-before-overwrite",
        ...(conflict.remoteMetadata.contentRevision
          ? { remoteRevision: conflict.remoteMetadata.contentRevision }
          : conflict.remoteMetadata.revision
            ? { remoteRevision: conflict.remoteMetadata.revision }
            : {}),
      });

      const metadata = await provider.writeText(noteId, localToSave);
      const latest = tabBuffersRef.current[noteId] ?? buffer;
      const savedNote: OpenTextFile = {
        metadata,
        originalContent: localToSave,
      };
      putTabBuffer(noteId, { note: savedNote, draft: latest.draft });
      if (activeTabIdRef.current === noteId) {
        setOpenFile(savedNote);
        setDraft(latest.draft);
      }
      clearNoteConflict(noteId);
      void markRecoveryCopiesResolvedForSource(
        provider,
        conflict.remoteMetadata.name.replace(/\.md$/i, ""),
      ).catch(() => {
        // Unresolved recovery artifacts are safer than deleting too early.
      });

      if (latest.draft === localToSave) {
        await pendingDraftStore.delete(activeWorkspace.id, noteId);
        setNoteSyncState(noteId, "synced");
      } else {
        await pendingDraftStore.put({
          workspaceId: activeWorkspace.id,
          noteId,
          content: latest.draft,
          baseContent: localToSave,
          ...(metadata.revision ? { baseRevision: metadata.revision } : {}),
          ...(metadata.contentRevision
            ? { baseContentRevision: metadata.contentRevision }
            : {}),
          updatedAt: new Date().toISOString(),
        });
        setNoteSyncState(noteId, "local");
        scheduleDriveSync(noteId, 0);
      }

      setStatus({ kind: "success", message: t("status.conflictKeptLocal") });
      void updateDerivedIndexesAfterRemoteSave(metadata, localToSave);
    } catch (error) {
      setStatus({ kind: "error", message: errorMessage(error, t) });
    }
  }

  async function resolveConflictUseDrive(noteId: string) {
    if (!provider) return;
    const conflict = noteConflictsRef.current[noteId];
    const buffer = tabBuffersRef.current[noteId];
    if (!conflict || !buffer) return;

    setStatus({ kind: "busy", message: t("status.resolvingConflict") });
    try {
      await createRecoveryCopy(provider, {
        source: conflict.remoteMetadata,
        content: buffer.draft,
        kind: "local-conflict",
        ...(buffer.note.metadata.contentRevision
          ? { baseRevision: buffer.note.metadata.contentRevision }
          : buffer.note.metadata.revision
            ? { baseRevision: buffer.note.metadata.revision }
            : {}),
        ...(conflict.remoteMetadata.contentRevision
          ? { remoteRevision: conflict.remoteMetadata.contentRevision }
          : conflict.remoteMetadata.revision
            ? { remoteRevision: conflict.remoteMetadata.revision }
            : {}),
      });
      const [metadata, content] = await Promise.all([
        provider.metadata(noteId),
        provider.readText(noteId),
      ]);
      await applyRemoteCanonical(noteId, metadata, content);
      void markRecoveryCopiesResolvedForSource(
        provider,
        conflict.remoteMetadata.name.replace(/\.md$/i, ""),
      ).catch(() => {
        // Keep recovery artifacts unresolved if resolution bookkeeping fails.
      });
      setStatus({ kind: "success", message: t("status.conflictUsedDrive") });
    } catch (error) {
      setStatus({ kind: "error", message: errorMessage(error, t) });
    }
  }

  async function syncNoteToDrive(noteId: string) {
    if (!provider || !activeWorkspace) return;
    if (noteSyncStatesRef.current[noteId] === "conflict") return;

    cancelDriveSyncTimer(noteId);
    if (!storageCanSync()) {
      await persistPendingDraft(noteId, false);
      if (tabBuffersRef.current[noteId]) {
        setNoteSyncState(noteId, "local");
      }
      return;
    }
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
    setStatus({
      kind: "busy",
      message:
        activeWorkspace.kind === "local"
          ? t("status.savingLocalVault")
          : t("status.savingDrive"),
    });

    const contentToSave = buffer.draft;
    const noteAtStart = buffer.note;

    try {
      const metadata = await provider.writeText(
        noteId,
        contentToSave,
        noteAtStart.metadata.contentRevision
          ? { expectedContentRevision: noteAtStart.metadata.contentRevision }
          : noteAtStart.metadata.revision
            ? { expectedRevision: noteAtStart.metadata.revision }
            : undefined,
      );

      const latest = tabBuffersRef.current[noteId] ?? buffer;
      const savedNote: OpenTextFile = {
        metadata,
        originalContent: contentToSave,
      };
      const nextBuffer: TextFileBuffer = {
        note: savedNote,
        draft: latest.draft,
      };
      putTabBuffer(noteId, nextBuffer);

      if (activeTabIdRef.current === noteId) {
        setOpenFile(savedNote);
        setDraft(latest.draft);
      }

      if (latest.draft !== contentToSave) {
        await pendingDraftStore.put({
          workspaceId: activeWorkspace.id,
          noteId,
          content: latest.draft,
          baseContent: contentToSave,
          ...(metadata.revision ? { baseRevision: metadata.revision } : {}),
          ...(metadata.contentRevision
            ? { baseContentRevision: metadata.contentRevision }
            : {}),
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
        message: activeWorkspace?.kind === "local"
          ? t("status.savedLocalVault")
          : t("status.saved"),
      });

      void updateDerivedIndexesAfterRemoteSave(metadata, contentToSave).catch(
        () => {
          // Canonical Drive synchronization already succeeded. Derived indexes
          // remain rebuildable and must not turn a successful save into a
          // synchronization failure.
        },
      );
    } catch (error) {
      if (isDriveUnauthorized(error)) {
        await persistPendingDraft(noteId, false);
        setNoteSyncState(noteId, "local");
        setStatus({
          kind: "error",
          message: t("status.driveReconnectRequired"),
        });
        return;
      }
      if (error instanceof StorageConflictError) {
        try {
          await reconcileDriveConflict(noteId, noteAtStart);
        } catch (reconcileError) {
          setNoteSyncState(noteId, "error");
          setStatus({
            kind: "error",
            message: errorMessage(reconcileError, t),
          });
        }
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

  async function persistAllDirtyDraftsLocally() {
    const entries = Object.entries(tabBuffersRef.current).filter(
      ([, buffer]) => buffer.draft !== buffer.note.originalContent,
    );
    await Promise.all(
      entries.map(async ([noteId, buffer]) => {
        await persistPendingDraft(noteId, false);
        const conflict = noteConflictsRef.current[noteId];
        if (!conflict || !provider) return;
        try {
          await createRecoveryCopy(provider, {
            source: conflict.remoteMetadata,
            content: buffer.draft,
            kind: "local-conflict",
            ...(buffer.note.metadata.contentRevision
              ? { baseRevision: buffer.note.metadata.contentRevision }
              : buffer.note.metadata.revision
                ? { baseRevision: buffer.note.metadata.revision }
                : {}),
            ...(conflict.remoteMetadata.contentRevision
              ? { remoteRevision: conflict.remoteMetadata.contentRevision }
              : conflict.remoteMetadata.revision
                ? { remoteRevision: conflict.remoteMetadata.revision }
                : {}),
          });
        } catch {
          // Leaving the workspace must never discard the IndexedDB recovery.
        }
      }),
    );
  }

  async function leaveWorkspace() {
    if (!confirmDiscardAllDirty()) return;
    await persistAllDirtyDraftsLocally();
    cancelAllScheduledSyncs();
    setActiveWorkspace(undefined);
    setProvider(undefined);
    setTree([]);
    setSelectedFolderId("");
    setOpenFile(undefined);
    setDraft("");
    setTabs([]);
    replaceTabBuffers({});
    noteSyncStatesRef.current = {};
    setNoteSyncStates({});
    noteConflictsRef.current = {};
    setNoteConflicts({});
    activeTabIdRef.current = undefined;
    setActiveTabId(undefined);
    setNavigation({ entries: [], index: -1 });
    setKnowledgeIndex(undefined);
    setSearchIndex(undefined);
    setSearchSnapshot(undefined);
    setEmbeddingSnapshot(undefined);
    setWorkspaceUiReady(false);
    setWorkspaceLoading(false);
    setRightSidebarOpen(false);
    setMobileSidebarOpen(true);
    setQuickSwitcherOpen(false);
    setNewItem(undefined);
    setOnboardingMode(undefined);
  }

  async function disconnect() {
    if (!confirmDiscardAllDirty()) return;
    await persistAllDirtyDraftsLocally();
    cancelAllScheduledSyncs();
    driveTokenProvider.clearSession();
    updateDriveSessionState("connected");
    setAuthSession(undefined);
    setWorkspaceService(undefined);
    setWorkspaces([]);
    setActiveWorkspace(undefined);
    setProvider(undefined);
    setTree([]);
    setSelectedFolderId("");
    setOpenFile(undefined);
    setDraft("");
    setTabs([]);
    replaceTabBuffers({});
    noteSyncStatesRef.current = {};
    setNoteSyncStates({});
    noteConflictsRef.current = {};
    setNoteConflicts({});
    activeTabIdRef.current = undefined;
    setActiveTabId(undefined);
    setNavigation({ entries: [], index: -1 });
    setKnowledgeIndex(undefined);
    setSearchIndex(undefined);
    setSearchSnapshot(undefined);
    setEmbeddingSnapshot(undefined);
    setWorkspaceUiReady(false);
    setWorkspaceLoading(false);
    setRightSidebarOpen(false);
    setMobileSidebarOpen(true);
    setQuickSwitcherOpen(false);
    setNewItem(undefined);
    setOnboardingMode(undefined);
    setStatus({ kind: "idle" });
  }

  function confirmDiscardAllDirty(): boolean {
    const hasDirtyBuffer = Object.entries(tabBuffersRef.current).some(
      ([noteId, buffer]) =>
        noteId !== activeTabId &&
        buffer.draft !== buffer.note.originalContent,
    );
    if (!dirty && !hasDirtyBuffer) return true;
    return window.confirm(t("confirm.discardOpenTabs"));
  }

  if (!activeWorkspace || !provider) {
    if (!authSession || !workspaceService) {
      return (
        <Landing
          status={status}
          googleAvailable={Boolean(GOOGLE_CLIENT_ID)}
          localAvailable={isBrowserLocalStorageSupported()}
          recentLocalVaults={recentLocalVaults}
          onConnect={connectDrive}
          onOpenLocal={openLocalVault}
          onOpenRecentLocal={(vault) =>
            void openRememberedLocalVault(vault)
          }
          onForgetRecentLocal={(workspaceId) =>
            void forgetRememberedLocalVault(workspaceId)
          }
        />
      );
    }

    return (
      <>
        <DriveSessionBanner
          state={driveSessionState}
          onReconnect={() => void reconnectDrive()}
        />
        <WorkspaceChooser
          workspaces={workspaces}
          workspaceName={workspaceName}
          status={status}
          expiresAt={authSession.expiresAt}
          localAvailable={isBrowserLocalStorageSupported()}
          recentLocalVaults={recentLocalVaults}
          onWorkspaceNameChange={setWorkspaceName}
          onCreateWorkspace={() => setOnboardingMode("create")}
          onOpenWorkspace={openWorkspace}
          onOpenLocal={openLocalVault}
          onOpenRecentLocal={(vault) =>
            void openRememberedLocalVault(vault)
          }
          onForgetRecentLocal={(workspaceId) =>
            void forgetRememberedLocalVault(workspaceId)
          }
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
              disabled={workspaceLoading}
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
              disabled={workspaceLoading}
              onClick={() =>
                requestNewItem("folder", selectedFolderId || provider.rootId)
              }
            >
              <Icon name="folder-plus" />
            </button>
            <button
              type="button"
              aria-label={t("actions.attachFiles")}
              title={t("actions.attachFiles")}
              disabled={workspaceLoading}
              onClick={() =>
                requestAttachFiles(selectedFolderId || provider.rootId)
              }
            >
              <Icon name="attachment" />
            </button>
            <button
              type="button"
              aria-label={t("actions.refreshVault")}
              title={t("common.refresh")}
              disabled={workspaceLoading}
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
        <input
          ref={attachmentInputRef}
          data-testid="attachment-input"
          type="file"
          multiple
          hidden
          onChange={(event) => {
            const input = event.currentTarget;
            const files = Array.from(input.files ?? []);
            const targetFolderId = attachmentTargetFolderIdRef.current;
            attachmentTargetFolderIdRef.current = undefined;
            input.value = "";
            void attachFiles(files, targetFolderId);
          }}
        />
        <WorkspaceExplorer
          provider={provider}
          tree={tree}
          loading={workspaceLoading}
          index={knowledgeIndex}
          activeNoteId={openFile?.metadata.id}
          selectedFolderId={selectedFolderId || provider.rootId}
          onSelectedFolderIdChange={setSelectedFolderId}
          onOpenTextFile={(noteId) => void openFileById(noteId)}
          onOpenAttachment={(node) => void openAttachment(node)}
          onRequestNewNote={(folderId) => requestNewItem("note", folderId)}
          onRequestNewFolder={(folderId) => requestNewItem("folder", folderId)}
          onRequestAttachFiles={requestAttachFiles}
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
          onOpenTextFile={(noteId) => void openFileById(noteId)}
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
          activeNoteId={openFile?.metadata.id}
          onOpenTextFile={(noteId) => void openFileById(noteId)}
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
          onOpenTextFile={(noteId) => void openFileById(noteId)}
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
          <span className="section-label">{t("settings.recovery")}</span>
          <RecoverySettings
            provider={provider}
            workspaceId={activeWorkspace.id}
            onRestored={async (metadata) => {
              await refreshWorkspaceState();
              await openFileById(metadata.id);
            }}
          />
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
      {activeWorkspace.kind === "google-drive" ? (
        <DriveSessionBanner
          state={driveSessionState}
          onReconnect={() => void reconnectDrive()}
        />
      ) : null}
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
            dirtyResourceIds={dirtyResourceIds}
            onActivate={(noteId) => void openFileById(noteId)}
            onClose={(noteId) => void closeTab(noteId)}
            onNew={() =>
              requestNewItem("note", selectedFolderId || provider.rootId)
            }
            onHome={openHome}
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
            hasNote={openFile !== undefined}
            dirty={dirty}
            syncState={activeSyncState}
            driveStatus={globalDriveStatus}
            pendingDriveCount={pendingDriveCount}
            storageKind={activeWorkspace.kind}
            rightSidebarOpen={rightSidebarOpen}
            onBack={() => void navigateHistory("back")}
            onForward={() => void navigateHistory("forward")}
            onViewMode={setActiveViewMode}
            onContext={() => setRightSidebarOpen((current) => !current)}
            onSave={() => void saveNote()}
          />

          <section className="editor-panel-v2" aria-label={t("editor.aria")}>
            {openFile ? (
              <>
                {openFile && activeConflict ? (
                  <section className="conflict-banner" role="alert">
                    <div>
                      <strong>{t("conflict.title")}</strong>
                      <p>
                        {activeConflict.recoveryFileName
                          ? t("conflict.recoveryCreated", {
                              name: activeConflict.recoveryFileName,
                            })
                          : t("conflict.localOnly")}
                      </p>
                    </div>
                    <div className="conflict-actions">
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() =>
                          void resolveConflictUseDrive(openFile.metadata.id)
                        }
                      >
                        {t("conflict.useDrive")}
                      </button>
                      <button
                        type="button"
                        className="primary-button"
                        onClick={() =>
                          void resolveConflictKeepLocal(openFile.metadata.id)
                        }
                      >
                        {t("conflict.keepMine")}
                      </button>
                    </div>
                  </section>
                ) : null}
                <button
                  className="mobile-files-button"
                  type="button"
                  onClick={showFiles}
                >
                  {t("nav.files")}
                </button>
                {viewMode === "edit" ? (
                  <MarkdownEditor
                    key={openFile.metadata.id}
                    value={draft}
                    label={t("editor.editFile", { name: openFile.metadata.name })}
                    linkTargets={editorLinkTargets}
                    tags={knownTags}
                    navigationTarget={activeMarkdownNavigation}
                    navigationKey={activeMarkdownNavigation?.key}
                    onChange={updateActiveDraft}
                    onAttachFiles={(files, source) =>
                      attachFiles(
                        files,
                        openFile.metadata.parentIds[0] ?? provider.rootId,
                        {
                          appendReferences: false,
                          autoRename: true,
                          source,
                        },
                      )
                    }
                  />
                ) : (
                  <MarkdownPreview
                    content={draft}
                    provider={provider}
                    tree={tree}
                    currentNotePath={
                      currentIndexedNote?.path ?? openFile.metadata.name
                    }
                    outgoingLinks={outgoingLinks}
                    navigationTarget={activeMarkdownNavigation}
                    navigationKey={activeMarkdownNavigation?.key}
                    onOpenTextFile={(target) => void openMarkdownTarget(target)}
                  />
                )}
              </>
            ) : workspaceLoading ? (
              <div className="workspace-loading-v2">
                <span className="drive-loading-spinner" aria-hidden="true" />
                <h2>{t("workspaceLoading.title")}</h2>
                <p>{t("workspaceLoading.body")}</p>
              </div>
            ) : (
              <WorkspaceHome
                workspaceName={activeWorkspace.name}
                notes={knowledgeIndex?.notes ?? []}
                recentNoteIds={recentNoteIds}
                onOpenTextFile={(noteId) => void openFileById(noteId)}
                onOpenLauncher={() => setQuickSwitcherOpen(true)}
                onCreateNote={() =>
                  requestNewItem("note", selectedFolderId || provider.rootId)
                }
              />
            )}
          </section>
        </section>

        {rightSidebarOpen && openFile ? (
          <KnowledgePanel
            noteTitle={currentIndexedNote?.title ?? openFile.metadata.name}
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
            onOpenTextFile={(target) => void openMarkdownTarget(target)}
            onBackToNote={() => setRightSidebarOpen(false)}
          />
        ) : null}
      </div>

      <QuickSwitcher
        open={quickSwitcherOpen}
        notes={knowledgeIndex?.notes ?? []}
        recentNoteIds={recentNoteIds}
        onClose={() => setQuickSwitcherOpen(false)}
        onOpenTextFile={(noteId) => void openFileById(noteId)}
        onCreateNote={(name) =>
          requestNewItem(
            "note",
            selectedFolderId || provider.rootId,
            name || undefined,
          )
        }
        onCreateFolder={() =>
          requestNewItem("folder", selectedFolderId || provider.rootId)
        }
        onOpenPanel={selectLeftPanel}
        onHome={openHome}
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
  onOpenTextFile,
}: {
  readonly index: KnowledgeIndexSnapshot | undefined;
  readonly selectedTag: string | undefined;
  readonly onSelectTag: (tag: string | undefined) => void;
  readonly onOpenTextFile: (noteId: string) => void;
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
                onClick={() => onOpenTextFile(note.id)}
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
  onOpenTextFile,
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
  readonly onOpenTextFile: (target: InternalMarkdownNavigationTarget) => void;
  readonly onBackToNote: () => void;
}) {
  const { t } = useTranslation();

  return (
    <KnowledgePanelFrame
      label={t("context.label")}
      ariaLabel={t("context.aria")}
      title={noteTitle}
      closeLabel={t("context.close")}
      onClose={onBackToNote}
    >
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
            onOpenTextFile={onOpenTextFile}
          />
        ))}
      </KnowledgeSection>

      <KnowledgeSection title={t("context.backlinks")} empty={t("context.noBacklinks")}>
        {backlinks.map((edge, indexNumber) => {
          const source = index?.notes.find(
            (note) => note.id === edge.sourceNoteId,
          );
          return (
            <KnowledgeLinkView
              key={`${edge.sourceNoteId}-${indexNumber}`}
              title={source?.title ?? source?.name ?? edge.sourcePath}
              subtitle={edge.sourcePath}
              onClick={() => onOpenTextFile({ noteId: edge.sourceNoteId })}
            />
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
    </KnowledgePanelFrame>
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
  return (
    <KnowledgeSectionView title={title} empty={empty}>
      {children}
    </KnowledgeSectionView>
  );
}

function EdgeRow({
  edge,
  label,
  onOpenTextFile,
}: {
  readonly edge: KnowledgeEdge;
  readonly label: string;
  readonly onOpenTextFile: (target: InternalMarkdownNavigationTarget) => void;
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
    <KnowledgeLinkView
      title={label}
      {...(edge.targetPath ? { subtitle: edge.targetPath } : {})}
      onClick={() =>
        onOpenTextFile({
          noteId: edge.targetNoteId!,
          ...(edge.heading ? { heading: edge.heading } : {}),
          ...(edge.blockId ? { blockId: edge.blockId } : {}),
        })
      }
    />
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
  googleAvailable,
  localAvailable,
  recentLocalVaults,
  onConnect,
  onOpenLocal,
  onOpenRecentLocal,
  onForgetRecentLocal,
}: {
  readonly status: AppStatus;
  readonly googleAvailable: boolean;
  readonly localAvailable: boolean;
  readonly recentLocalVaults: readonly RecentLocalVault[];
  readonly onConnect: () => void;
  readonly onOpenLocal: () => void;
  readonly onOpenRecentLocal: (vault: RecentLocalVault) => void;
  readonly onForgetRecentLocal: (workspaceId: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const legalLocale = i18n.resolvedLanguage?.toLowerCase().startsWith("es")
    ? "es/"
    : "";
  const privacyUrl = `../${legalLocale}privacy/`;
  const termsUrl = `../${legalLocale}terms/`;
  const principles = t("landing.principles", {
    returnObjects: true,
  }) as string[];

  return (
    <main className="landing-shell">
      <div className="pre-auth-locale">
        <LanguageSelector compact />
      </div>
      <section className="hero">
        <BrandLockup className="pre-auth-brand" />
        <span className="eyebrow">{t("landing.eyebrow")}</span>
        <h1>{t("landing.title")}</h1>
        <p className="lede">{t("landing.body")}</p>
        <div className="hero-actions">
          <button
            className="primary-button large"
            type="button"
            onClick={onOpenLocal}
            disabled={!localAvailable || status.kind === "busy"}
          >
            {t("landing.openLocal")}
          </button>
          {googleAvailable ? (
            <button
              className="secondary-button large"
              type="button"
              onClick={onConnect}
              disabled={status.kind === "busy"}
            >
              {status.kind === "busy"
                ? t("landing.connecting")
                : t("landing.connect")}
            </button>
          ) : null}
        </div>
        {googleAvailable ? (
          <p className="storage-support-note">
            {t("landing.googleDisclosure")}{" "}
            <a href={privacyUrl} target="_blank" rel="noreferrer">
              {t("landing.privacy")}
            </a>
            {" · "}
            <a href={termsUrl} target="_blank" rel="noreferrer">
              {t("landing.terms")}
            </a>
          </p>
        ) : null}
        {!localAvailable ? (
          <p className="storage-support-note">
            {t("landing.localUnsupported")}
          </p>
        ) : null}
        <RecentLocalVaultList
          vaults={recentLocalVaults}
          disabled={status.kind === "busy"}
          onOpen={onOpenRecentLocal}
          onForget={onForgetRecentLocal}
        />
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
  localAvailable,
  recentLocalVaults,
  onWorkspaceNameChange,
  onCreateWorkspace,
  onOpenWorkspace,
  onOpenLocal,
  onOpenRecentLocal,
  onForgetRecentLocal,
  onRefresh,
  onDisconnect,
}: {
  readonly workspaces: readonly GoogleDriveWorkspace[];
  readonly workspaceName: string;
  readonly status: AppStatus;
  readonly expiresAt: number;
  readonly localAvailable: boolean;
  readonly recentLocalVaults: readonly RecentLocalVault[];
  readonly onWorkspaceNameChange: (name: string) => void;
  readonly onCreateWorkspace: () => void;
  readonly onOpenWorkspace: (workspace: GoogleDriveWorkspace) => void;
  readonly onOpenLocal: () => void;
  readonly onOpenRecentLocal: (vault: RecentLocalVault) => void;
  readonly onForgetRecentLocal: (workspaceId: string) => void;
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
          <p>{t("chooser.body")}</p>
        </div>
        <button
          className="secondary-button"
          type="button"
          onClick={onDisconnect}
        >
          {t("chooser.disconnect")}
        </button>
      </header>

      <section className="chooser-grid">
        <article className="local-vault-card">
          <div>
            <span className="section-label">{t("chooser.local")}</span>
            <h2>{t("chooser.localTitle")}</h2>
            <p>{t("chooser.localBody")}</p>
            <RecentLocalVaultList
              vaults={recentLocalVaults}
              disabled={status.kind === "busy"}
              onOpen={onOpenRecentLocal}
              onForget={onForgetRecentLocal}
            />
          </div>
          <div className="local-vault-actions">
            <button
              className="primary-button"
              type="button"
              disabled={!localAvailable || status.kind === "busy"}
              onClick={onOpenLocal}
            >
              {t("chooser.openLocal")}
            </button>
            {!localAvailable ? (
              <small>{t("chooser.localUnsupported")}</small>
            ) : null}
          </div>
        </article>

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

function RecentLocalVaultList({
  vaults,
  disabled,
  onOpen,
  onForget,
}: {
  readonly vaults: readonly RecentLocalVault[];
  readonly disabled: boolean;
  readonly onOpen: (vault: RecentLocalVault) => void;
  readonly onForget: (workspaceId: string) => void;
}) {
  const { t } = useTranslation();
  if (vaults.length === 0) return null;

  return (
    <section
      className="recent-local-vaults"
      aria-label={t("localVault.recent")}
    >
      <span className="section-label">{t("localVault.recent")}</span>
      <div className="recent-local-vault-list">
        {vaults.map((vault) => (
          <div className="recent-local-vault-row" key={vault.workspaceId}>
            <button
              className="recent-local-vault-open"
              type="button"
              disabled={disabled}
              onClick={() => onOpen(vault)}
            >
              <span>
                <strong>{vault.name}</strong>
                <small>{localVaultPermissionLabel(vault.permission, t)}</small>
              </span>
              <span aria-hidden="true">→</span>
            </button>
            <button
              className="text-button recent-local-vault-forget"
              type="button"
              disabled={disabled}
              aria-label={t("localVault.forgetAria", { name: vault.name })}
              title={t("localVault.forgetHint")}
              onClick={() => onForget(vault.workspaceId)}
            >
              {t("localVault.forget")}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

function localVaultPermissionLabel(
  permission: BrowserLocalVaultPermission,
  t: (key: string) => string,
): string {
  switch (permission) {
    case "granted":
      return t("localVault.ready");
    case "prompt":
      return t("localVault.permissionRequired");
    case "denied":
      return t("localVault.permissionDenied");
    case "unsupported":
      return t("localVault.selectAgain");
  }
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
          <BrandLockup className="pre-auth-brand" />
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

function DriveSessionBanner({
  state,
  onReconnect,
}: {
  readonly state: DriveSessionState;
  readonly onReconnect: () => void;
}) {
  const { t } = useTranslation();
  if (state === "connected") return null;

  const reconnecting = state === "reconnecting";
  const expiring = state === "expiring";
  const title = reconnecting
    ? t("driveSession.reconnectingTitle")
    : expiring
      ? t("driveSession.expiringTitle")
      : t("driveSession.reconnectTitle");
  const body = reconnecting
    ? t("driveSession.reconnectingBody")
    : expiring
      ? t("driveSession.expiringBody")
      : t("driveSession.reconnectBody");

  return (
    <aside
      className={`drive-session-banner ${state}`}
      role="alert"
      aria-live="assertive"
    >
      <div>
        <strong>{title}</strong>
        <p>{body}</p>
      </div>
      <button
        type="button"
        className="primary-button"
        disabled={reconnecting}
        onClick={onReconnect}
      >
        {reconnecting
          ? t("driveSession.reconnectingTitle")
          : t("driveSession.reconnect")}
      </button>
    </aside>
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

function isDriveUnauthorized(error: unknown): boolean {
  return error instanceof GoogleDriveApiError && error.status === 401;
}

function isPickerAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function attachmentFileName(
  file: File,
  source?: "drop" | "paste",
): string {
  if (source === "paste") {
    return `pasted-image${attachmentExtension(file.type, file.name)}`;
  }

  const name = file.name.trim();
  return name || `attachment${attachmentExtension(file.type, "")}`;
}

function attachmentExtension(mediaType: string, fileName: string): string {
  const fileMatch = /(\.[a-z0-9]{1,10})$/i.exec(fileName.trim());
  if (fileMatch) return fileMatch[1]!.toLocaleLowerCase();

  switch (mediaType.toLocaleLowerCase()) {
    case "image/png":
      return ".png";
    case "image/jpeg":
      return ".jpg";
    case "image/gif":
      return ".gif";
    case "image/webp":
      return ".webp";
    case "image/svg+xml":
      return ".svg";
    case "image/avif":
      return ".avif";
    default:
      return "";
  }
}

function nextAvailableAttachmentName(
  requestedName: string,
  occupied: ReadonlySet<string>,
): string {
  if (!occupied.has(requestedName.toLocaleLowerCase())) return requestedName;

  const extensionMatch = /(\.[^./]+)$/.exec(requestedName);
  const extension = extensionMatch?.[1] ?? "";
  const stem = extension
    ? requestedName.slice(0, -extension.length)
    : requestedName;

  for (let suffix = 2; suffix < 10_000; suffix += 1) {
    const candidate = `${stem}-${suffix}${extension}`;
    if (!occupied.has(candidate.toLocaleLowerCase())) return candidate;
  }

  throw new Error("Could not choose an available attachment name.");
}

function appendMarkdownReferences(
  content: string,
  references: readonly string[],
): string {
  if (references.length === 0) return content;
  const separator =
    content.length === 0
      ? ""
      : content.endsWith("\n\n")
        ? ""
        : content.endsWith("\n")
          ? "\n"
          : "\n\n";
  return `${content}${separator}${references.join("\n")}\n`;
}

function encodeMarkdownPath(path: string): string {
  return path
    .split("/")
    .map((part) =>
      part === "." || part === ".." ? part : encodeURIComponent(part),
    )
    .join("/");
}

function escapeMarkdownLabel(value: string): string {
  return value.replaceAll("[", "\\[").replaceAll("]", "\\]");
}

function openBinaryInBrowser(
  name: string,
  mediaType: string,
  content: Uint8Array,
) {
  const blob = new Blob([Uint8Array.from(content)], { type: mediaType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;

  if (
    mediaType.startsWith("image/") ||
    mediaType.startsWith("audio/") ||
    mediaType.startsWith("video/") ||
    mediaType === "application/pdf" ||
    mediaType.startsWith("text/")
  ) {
    anchor.target = "_blank";
    anchor.rel = "noreferrer";
  } else {
    anchor.download = name;
  }

  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
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
  accessTokenProvider: MutableGoogleDriveAccessTokenProvider,
): GoogleDriveStorageProvider {
  return new GoogleDriveStorageProvider({
    workspaceFolderId: workspace.id,
    accessTokenProvider,
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
