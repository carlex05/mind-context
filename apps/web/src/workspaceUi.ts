export type WorkspacePanel = "files" | "search" | "graph" | "tags" | "settings";
export type NoteViewMode = "edit" | "read";

export interface WorkspaceTab {
  readonly noteId: string;
  readonly title: string;
  readonly path: string;
  readonly viewMode: NoteViewMode;
}

export interface PersistedWorkspaceUi {
  readonly tabs: readonly {
    readonly noteId: string;
    readonly viewMode: NoteViewMode;
  }[];
  readonly activeNoteId?: string;
  readonly leftPanel: WorkspacePanel;
  readonly leftSidebarOpen: boolean;
  readonly rightSidebarOpen: boolean;
}

const PREFIX = "mindcontext.workspace-ui.";

export function readWorkspaceUi(workspaceId: string): PersistedWorkspaceUi {
  try {
    const raw = window.localStorage.getItem(`${PREFIX}${workspaceId}`);
    if (!raw) return defaultWorkspaceUi();
    const value = JSON.parse(raw) as Partial<PersistedWorkspaceUi>;
    const tabs = Array.isArray(value.tabs)
      ? value.tabs.filter(
          (
            tab,
          ): tab is {
            readonly noteId: string;
            readonly viewMode: NoteViewMode;
          } =>
            typeof tab === "object" &&
            tab !== null &&
            typeof (tab as { noteId?: unknown }).noteId === "string" &&
            ((tab as { viewMode?: unknown }).viewMode === "edit" ||
              (tab as { viewMode?: unknown }).viewMode === "read"),
        )
      : [];

    return {
      tabs,
      ...(typeof value.activeNoteId === "string"
        ? { activeNoteId: value.activeNoteId }
        : {}),
      leftPanel: isPanel(value.leftPanel) ? value.leftPanel : "files",
      leftSidebarOpen:
        typeof value.leftSidebarOpen === "boolean"
          ? value.leftSidebarOpen
          : true,
      rightSidebarOpen:
        typeof value.rightSidebarOpen === "boolean"
          ? value.rightSidebarOpen
          : false,
    };
  } catch {
    return defaultWorkspaceUi();
  }
}

export function writeWorkspaceUi(
  workspaceId: string,
  state: PersistedWorkspaceUi,
): void {
  window.localStorage.setItem(
    `${PREFIX}${workspaceId}`,
    JSON.stringify(state),
  );
}

function defaultWorkspaceUi(): PersistedWorkspaceUi {
  return {
    tabs: [],
    leftPanel: "files",
    leftSidebarOpen: true,
    rightSidebarOpen: false,
  };
}

function isPanel(value: unknown): value is WorkspacePanel {
  return (
    value === "files" ||
    value === "search" ||
    value === "graph" ||
    value === "tags" ||
    value === "settings"
  );
}
