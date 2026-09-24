import { useMemo, useState } from "react";
import { PRODUCT_PRINCIPLES } from "@mind-context/core";
import { markdownParser } from "@mind-context/markdown";
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
import { MarkdownEditor } from "./MarkdownEditor";

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim();

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
  const [items, setItems] = useState<
    readonly StorageObjectMetadata[]
  >([]);
  const [openNote, setOpenNote] = useState<OpenNote>();
  const [draft, setDraft] = useState("");
  const [workspaceName, setWorkspaceName] = useState("My Second Brain");
  const [newNoteName, setNewNoteName] = useState("");
  const [status, setStatus] = useState<AppStatus>({ kind: "idle" });

  const dirty =
    openNote !== undefined && draft !== openNote.originalContent;

  const parsedDraft = useMemo(() => markdownParser.parse(draft), [draft]);

  const visibleItems = useMemo(
    () =>
      items.filter(
        (item) =>
          item.kind === "directory" ||
          item.mediaType === "text/markdown" ||
          item.name.toLowerCase().endsWith(".md"),
      ),
    [items],
  );

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
        message: `Workspace “${workspace.name}” created in your Drive.`,
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
      const nextItems = await nextProvider.list();
      setProvider(nextProvider);
      setActiveWorkspace(workspace);
      setItems(nextItems);
      setOpenNote(undefined);
      setDraft("");
      setStatus({ kind: "idle" });
    } catch (error) {
      setStatus({ kind: "error", message: errorMessage(error) });
    }
  }

  async function refreshItems() {
    if (!provider) return;
    setItems(await provider.list());
  }

  async function selectNote(item: StorageObjectMetadata) {
    if (!provider || item.kind !== "file") return;
    if (!confirmDiscardIfDirty()) return;

    setStatus({ kind: "busy", message: `Opening ${item.name}…` });
    try {
      const content = await provider.readText(item.id);
      const latestMetadata = await provider.metadata(item.id);
      setOpenNote({
        metadata: latestMetadata,
        originalContent: content,
      });
      setDraft(content);
      setStatus({ kind: "idle" });
    } catch (error) {
      setStatus({ kind: "error", message: errorMessage(error) });
    }
  }

  async function createNote() {
    if (!provider || !newNoteName.trim()) return;

    setStatus({ kind: "busy", message: "Creating note…" });
    try {
      const metadata = await provider.createText(
        provider.rootId,
        newNoteName,
        "# New note\n\n",
      );
      const content = await provider.readText(metadata.id);
      setNewNoteName("");
      await refreshItems();
      setOpenNote({ metadata, originalContent: content });
      setDraft(content);
      setStatus({ kind: "success", message: `${metadata.name} created.` });
    } catch (error) {
      setStatus({ kind: "error", message: errorMessage(error) });
    }
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
      await refreshItems();
      setStatus({ kind: "success", message: "Saved directly to Google Drive." });
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
  }

  function leaveWorkspace() {
    if (!confirmDiscardIfDirty()) return;
    setActiveWorkspace(undefined);
    setProvider(undefined);
    setItems([]);
    setOpenNote(undefined);
    setDraft("");
  }

  function disconnect() {
    if (!confirmDiscardIfDirty()) return;
    setAuthSession(undefined);
    setWorkspaceService(undefined);
    setWorkspaces([]);
    setActiveWorkspace(undefined);
    setProvider(undefined);
    setItems([]);
    setOpenNote(undefined);
    setDraft("");
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
    <main className={`app-shell ${openNote ? "has-open-note" : ""}`}>
      <header className="topbar">
        <div className="topbar-copy">
          <button className="text-button" type="button" onClick={leaveWorkspace}>
            Workspaces
          </button>
          <span aria-hidden="true">/</span>
          <strong>{activeWorkspace.name}</strong>
        </div>
        <div className="privacy-pill" title="Core note traffic goes directly to Google Drive">
          Private path · Drive
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
              onClick={() => void refreshItems()}
              aria-label="Refresh notes"
            >
              ↻
            </button>
          </div>

          <form
            className="new-note-form"
            onSubmit={(event) => {
              event.preventDefault();
              void createNote();
            }}
          >
            <label htmlFor="note-name">New Markdown note</label>
            <div className="inline-form">
              <input
                id="note-name"
                value={newNoteName}
                onChange={(event) => setNewNoteName(event.target.value)}
                placeholder="Idea or project"
                autoComplete="off"
              />
              <button
                type="submit"
                disabled={!newNoteName.trim()}
              >
                Add
              </button>
            </div>
          </form>

          <nav className="note-list" aria-label="Workspace files">
            {visibleItems.length === 0 ? (
              <p className="empty-state">
                No Markdown notes yet. Create one above.
              </p>
            ) : (
              visibleItems.map((item) => (
                <button
                  className={`note-row ${
                    openNote?.metadata.id === item.id ? "active" : ""
                  }`}
                  type="button"
                  key={item.id}
                  onClick={() => void selectNote(item)}
                  disabled={item.kind === "directory"}
                >
                  <span aria-hidden="true">
                    {item.kind === "directory" ? "▸" : "◇"}
                  </span>
                  <span>{item.name}</span>
                </button>
              ))
            )}
          </nav>
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
                  <strong>{openNote.metadata.name}</strong>
                  <span>
                    {dirty ? "Unsaved changes" : "Saved"} ·{" "}
                    {parsedDraft.sections.filter((section) => section.heading).length} headings ·{" "}
                    {parsedDraft.wikiLinks.length} links
                  </span>
                </div>
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => void saveNote()}
                  disabled={!dirty || status.kind === "busy"}
                >
                  Save
                </button>
              </div>
              <MarkdownEditor
                key={openNote.metadata.id}
                value={draft}
                label={`Edit ${openNote.metadata.name}`}
                onChange={setDraft}
              />
            </>
          ) : (
            <div className="editor-empty">
              <span className="section-label">Markdown-first</span>
              <h2>Select a note</h2>
              <p>
                Notes are read from and saved directly to your Google Drive.
                CodeMirror provides the editing surface while the Markdown
                parser independently derives headings, tags and wikilinks.
              </p>
            </div>
          )}
        </section>
      </div>

      <StatusBar status={status} />
    </main>
  );
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
        <span className="eyebrow">MindContext / Drive slice</span>
        <h1>Your files. Your knowledge. Private by default.</h1>
        <p className="lede">
          Connect Google Drive to create a Markdown workspace owned by you.
          MindContext does not need a knowledge backend for this flow.
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
            For the MVP, MindContext uses the narrow <code>drive.file</code>{" "}
            permission and therefore manages workspaces it creates itself.
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

      <section className="setup-card">
        <span className="section-label">Enable real Google Drive</span>
        <p>
          Set the repository variable <code>GOOGLE_CLIENT_ID</code> for the
          Pages build, or use <code>VITE_GOOGLE_CLIENT_ID</code> locally.
        </p>
        <p>
          The OAuth client ID is public application configuration; note content
          and access tokens are still never routed through MindContext servers.
        </p>
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
