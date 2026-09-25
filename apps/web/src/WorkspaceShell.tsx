import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import type { NoteViewMode, WorkspacePanel, WorkspaceTab } from "./workspaceUi";

export type NoteSyncState =
  | "synced"
  | "local"
  | "syncing"
  | "conflict"
  | "error";

export function WorkspaceRail({
  activePanel,
  sidebarOpen,
  onPanel,
}: {
  readonly activePanel: WorkspacePanel;
  readonly sidebarOpen: boolean;
  readonly onPanel: (panel: WorkspacePanel) => void;
}) {
  const { t } = useTranslation();
  const items: readonly {
    readonly panel: WorkspacePanel;
    readonly label: string;
    readonly icon: IconName;
  }[] = [
    { panel: "files", label: t("nav.files"), icon: "folder" },
    { panel: "search", label: t("nav.search"), icon: "search" },
    { panel: "graph", label: t("nav.graph"), icon: "graph" },
    { panel: "tags", label: t("nav.tags"), icon: "tag" },
    { panel: "settings", label: t("nav.settings"), icon: "settings" },
  ];

  return (
    <nav className="workspace-rail" aria-label={t("nav.workspaceViews")}>
      {items.map((item) => (
        <button
          type="button"
          className={
            sidebarOpen && activePanel === item.panel ? "active" : ""
          }
          aria-label={item.label}
          title={item.label}
          key={item.panel}
          onClick={() => onPanel(item.panel)}
        >
          <Icon name={item.icon} />
        </button>
      ))}
    </nav>
  );
}

export function SidebarFrame({
  title,
  actions,
  children,
}: {
  readonly title: string;
  readonly actions?: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <aside className="workspace-left-sidebar" aria-label={title}>
      <header className="sidebar-header">
        <strong>{title}</strong>
        {actions ? <div className="sidebar-header-actions">{actions}</div> : null}
      </header>
      <div className="sidebar-body">{children}</div>
    </aside>
  );
}

export function TabBar({
  tabs,
  activeNoteId,
  dirtyNoteIds,
  onActivate,
  onClose,
  onNew,
}: {
  readonly tabs: readonly WorkspaceTab[];
  readonly activeNoteId: string | undefined;
  readonly dirtyNoteIds: ReadonlySet<string>;
  readonly onActivate: (noteId: string) => void;
  readonly onClose: (noteId: string) => void;
  readonly onNew: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="workspace-tabbar" aria-label={t("nav.openTabs")}>
      <div className="workspace-tabs">
        {tabs.map((tab) => (
          <div
            className={`workspace-tab ${
              activeNoteId === tab.noteId ? "active" : ""
            }`}
            key={tab.noteId}
          >
            <button
              className="workspace-tab-main"
              type="button"
              title={tab.path}
              onClick={() => onActivate(tab.noteId)}
            >
              <span>{tab.title}</span>
              {dirtyNoteIds.has(tab.noteId) ? (
                <span className="workspace-tab-dirty" aria-hidden="true">●</span>
              ) : null}
            </button>
            <button
              className="workspace-tab-close"
              type="button"
              aria-label={t("actions.closeTab", { title: tab.title })}
              onClick={() => onClose(tab.noteId)}
            >
              ×
            </button>
          </div>
        ))}
        <button
          className="workspace-new-tab"
          type="button"
          aria-label={t("actions.newNote")}
          title={t("actions.newNote")}
          onClick={onNew}
        >
          +
        </button>
      </div>
    </div>
  );
}

export function WorkspaceHeader({
  canBack,
  canForward,
  breadcrumb,
  viewMode,
  hasNote,
  dirty,
  syncState,
  rightSidebarOpen,
  onBack,
  onForward,
  onViewMode,
  onContext,
  onSave,
}: {
  readonly canBack: boolean;
  readonly canForward: boolean;
  readonly breadcrumb?: string;
  readonly viewMode: NoteViewMode;
  readonly hasNote: boolean;
  readonly dirty: boolean;
  readonly syncState: NoteSyncState;
  readonly rightSidebarOpen: boolean;
  readonly onBack: () => void;
  readonly onForward: () => void;
  readonly onViewMode: (mode: NoteViewMode) => void;
  readonly onContext: () => void;
  readonly onSave: () => void;
}) {
  const { t } = useTranslation();
  const modeLabel =
    viewMode === "edit"
      ? t("actions.readingView")
      : t("actions.editingView");

  return (
    <header className="workspace-view-header">
      <div className="workspace-view-nav">
        <button
          type="button"
          aria-label={t("common.back")}
          disabled={!canBack}
          onClick={onBack}
        >
          <Icon name="arrow-left" />
        </button>
        <button
          type="button"
          aria-label={t("common.forward")}
          disabled={!canForward}
          onClick={onForward}
        >
          <Icon name="arrow-right" />
        </button>
      </div>
      <div className="workspace-breadcrumb" title={breadcrumb}>
        {breadcrumb ?? ""}
      </div>
      {hasNote ? (
        <div className="workspace-note-actions">
          <span
            className={`note-sync-state ${syncState}`}
            title={
              syncState === "local"
                ? t("actions.syncLocalDescription")
                : undefined
            }
          >
            {syncState === "synced"
              ? t("actions.syncSynced")
              : syncState === "local"
                ? t("actions.syncLocal")
                : syncState === "syncing"
                  ? t("actions.syncing")
                  : syncState === "conflict"
                    ? t("actions.syncConflict")
                    : t("actions.syncError")}
          </span>
          <button
            type="button"
            aria-label={modeLabel}
            title={modeLabel}
            onClick={() => onViewMode(viewMode === "edit" ? "read" : "edit")}
          >
            <Icon name={viewMode === "edit" ? "book" : "edit"} />
          </button>
          <button
            type="button"
            aria-label={t("actions.context")}
            title={t("actions.contextTitle")}
            className={rightSidebarOpen ? "active" : ""}
            onClick={onContext}
          >
            <Icon name="panel-right" />
          </button>
          <button
            type="button"
            aria-label={t("common.save")}
            title={t("common.save")}
            disabled={
              !dirty || syncState === "syncing" || syncState === "conflict"
            }
            onClick={onSave}
          >
            <Icon name="save" />
          </button>
        </div>
      ) : null}
    </header>
  );
}

export function PlaceholderPanel({
  icon,
  title,
  description,
  shortcut,
}: {
  readonly icon: IconName;
  readonly title: string;
  readonly description: string;
  readonly shortcut?: string;
}) {
  return (
    <div className="sidebar-placeholder">
      <Icon name={icon} />
      <strong>{title}</strong>
      <p>{description}</p>
      {shortcut ? <kbd>{shortcut}</kbd> : null}
    </div>
  );
}

export function Icon({
  name,
}: {
  readonly name: IconName;
}) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  switch (name) {
    case "folder":
      return <svg {...common}><path d="M3 6.5h6l2 2H21v9.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" /><path d="M3 9h18" /></svg>;
    case "search":
      return <svg {...common}><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>;
    case "graph":
      return <svg {...common}><circle cx="6" cy="6" r="2" /><circle cx="18" cy="7" r="2" /><circle cx="8" cy="18" r="2" /><circle cx="18" cy="17" r="2" /><path d="m8 7 8-0.2M7 8l1 8m2-1 6-6m-6 9h6" /></svg>;
    case "tag":
      return <svg {...common}><path d="M4 4h6l10 10-6 6L4 10Z" /><circle cx="8" cy="8" r="1" /></svg>;
    case "settings":
      return <svg {...common}><circle cx="12" cy="12" r="3" /><path d="M19 13.5v-3l-2-.6a7 7 0 0 0-.7-1.7l1-1.9-2.1-2.1-1.9 1a7 7 0 0 0-1.7-.7L11 2H8l-.6 2a7 7 0 0 0-1.7.7l-1.9-1-2.1 2.1 1 1.9A7 7 0 0 0 2 9.4l-2 .6v3l2 .6a7 7 0 0 0 .7 1.7l-1 1.9 2.1 2.1 1.9-1a7 7 0 0 0 1.7.7l.6 2h3l.6-2a7 7 0 0 0 1.7-.7l1.9 1 2.1-2.1-1-1.9a7 7 0 0 0 .7-1.8Z" transform="translate(2 1) scale(.83)" /></svg>;
    case "arrow-left":
      return <svg {...common}><path d="m15 18-6-6 6-6" /></svg>;
    case "arrow-right":
      return <svg {...common}><path d="m9 18 6-6-6-6" /></svg>;
    case "panel-right":
      return <svg {...common}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M15 4v16" /></svg>;
    case "book":
      return <svg {...common}><path d="M4 5.5A3.5 3.5 0 0 1 7.5 2H11v17H7.5A3.5 3.5 0 0 0 4 22Z" /><path d="M20 5.5A3.5 3.5 0 0 0 16.5 2H13v17h3.5A3.5 3.5 0 0 1 20 22Z" /></svg>;
    case "edit":
      return <svg {...common}><path d="M4 20h4l11-11-4-4L4 16Z" /><path d="m13.5 6.5 4 4" /></svg>;
    case "save":
      return <svg {...common}><path d="M5 3h12l3 3v15H4V3Z" /><path d="M8 3v6h8V3M8 21v-7h8v7" /></svg>;
    case "file-plus":
      return <svg {...common}><path d="M6 2h8l4 4v16H6Z" /><path d="M14 2v5h5M9 14h6m-3-3v6" /></svg>;
    case "folder-plus":
      return <svg {...common}><path d="M3 6.5h6l2 2H21v9.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" /><path d="M12 12v5m-2.5-2.5h5" /></svg>;
    case "refresh":
      return <svg {...common}><path d="M20 7v5h-5" /><path d="M19 12a7 7 0 1 0-2 5" /></svg>;
  }
}

export type IconName =
  | "folder"
  | "search"
  | "graph"
  | "tag"
  | "settings"
  | "arrow-left"
  | "arrow-right"
  | "panel-right"
  | "book"
  | "edit"
  | "save"
  | "file-plus"
  | "folder-plus"
  | "refresh";
