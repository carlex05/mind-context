export type WorkspacePanel = "files" | "search" | "graph" | "tags" | "settings";
export type NoteViewMode = "edit" | "read";

export interface WorkspaceTab {
  readonly resourceId: string;
  readonly fileTypeId: string;
  readonly title: string;
  readonly path: string;
  readonly viewMode: NoteViewMode;
}

export interface PersistedWorkspaceUi {
  readonly tabs: readonly {
    readonly resourceId: string;
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
    const value = JSON.parse(raw) as Partial<PersistedWorkspaceUi> & {
      readonly activeNoteId?: unknown;
      readonly tabs?: readonly unknown[];
    };
    const tabs = Array.isArray(value.tabs)
      ? value.tabs.flatMap((candidate) => {
          if (typeof candidate !== "object" || candidate === null) return [];
          const tab = candidate as {
            readonly resourceId?: unknown;
            readonly noteId?: unknown;
            readonly fileTypeId?: unknown;
            readonly viewMode?: unknown;
          };
          const resourceId =
            typeof tab.resourceId === "string"
              ? tab.resourceId
              : typeof tab.noteId === "string"
                ? tab.noteId
                : undefined;
          if (
            !resourceId ||
            (tab.viewMode !== "edit" && tab.viewMode !== "read")
          ) {
            return [];
          }
          return [{
            resourceId,
            fileTypeId:
              typeof tab.fileTypeId === "string" ? tab.fileTypeId : "markdown",
            viewMode: tab.viewMode as NoteViewMode,
          }];
        })
      : [];

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
