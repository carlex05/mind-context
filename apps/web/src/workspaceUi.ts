export type WorkspacePanel = "files" | "search" | "graph" | "tags" | "settings";
export type NoteViewMode = "edit" | "read";
export type WorkspaceResourceKind = "markdown" | "plugin";

export interface WorkspaceTab {
  readonly resourceId: string;
  readonly resourceKind: WorkspaceResourceKind;
  readonly fileTypeId: string;
  readonly title: string;
  readonly path: string;
  readonly viewMode: NoteViewMode;
}

export interface PersistedWorkspaceUi {
  readonly tabs: readonly {
    readonly resourceId: string;
    readonly resourceKind: WorkspaceResourceKind;
    readonly fileTypeId: string;
    readonly viewMode: NoteViewMode;
  }[];
  readonly activeResourceId?: string;
  readonly homeActive?: boolean;
  readonly leftPanel: WorkspacePanel;
  readonly leftSidebarOpen: boolean;
  readonly rightSidebarOpen: boolean;
}

const PREFIX = "mindcontext.workspace-ui.";

export function readWorkspaceUi(workspaceId: string): PersistedWorkspaceUi {
  try {
    const raw = window.localStorage.getItem(`${PREFIX}${workspaceId}`);
    if (!raw) return defaultWorkspaceUi();
    const value = JSON.parse(raw) as Record<string, unknown>;
    const rawTabs = Array.isArray(value.tabs) ? value.tabs : [];
    const tabs = rawTabs.flatMap((rawTab) => {
      if (typeof rawTab !== "object" || rawTab === null) return [];
      const tab = rawTab as Record<string, unknown>;
      const viewMode = isViewMode(tab.viewMode) ? tab.viewMode : "edit";

      if (typeof tab.resourceId === "string") {
        const resourceKind = isResourceKind(tab.resourceKind)
          ? tab.resourceKind
          : "markdown";
        const fileTypeId =
          typeof tab.fileTypeId === "string"
            ? tab.fileTypeId
            : resourceKind === "markdown"
              ? "markdown"
              : "unknown";
        return [{
          resourceId: tab.resourceId,
          resourceKind,
          fileTypeId,
          viewMode,
        }];
      }

      // Backward-compatible migration from the note-only workspace UI.
      if (typeof tab.noteId === "string") {
        return [{
          resourceId: tab.noteId,
          resourceKind: "markdown" as const,
          fileTypeId: "markdown",
          viewMode,
        }];
      }

      return [];
    });

    const activeResourceId =
      typeof value.activeResourceId === "string"
        ? value.activeResourceId
        : typeof value.activeNoteId === "string"
          ? value.activeNoteId
          : undefined;

    return {
      tabs,
      ...(activeResourceId ? { activeResourceId } : {}),
      homeActive: value.homeActive === true,
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
    homeActive: true,
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

function isViewMode(value: unknown): value is NoteViewMode {
  return value === "edit" || value === "read";
}

function isResourceKind(value: unknown): value is WorkspaceResourceKind {
  return value === "markdown" || value === "plugin";
}
