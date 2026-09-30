import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  BrandMark,
  WorkspaceIcon,
  WorkspaceRailView,
  WorkspaceSidebarFrame,
  WorkspaceTabBarView,
  WorkspaceViewHeader,
  type WorkspaceIconName,
} from "@mind-context/workspace-ui";

import type { NoteViewMode, WorkspacePanel, WorkspaceTab } from "./workspaceUi";

export type NoteSyncState =
  | "synced"
  | "local"
  | "syncing"
  | "conflict"
  | "error";

export type DriveStatusState =
  | "synced"
  | "pending"
  | "syncing"
  | "expiring"
  | "reconnect-required"
  | "reconnecting";

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
    readonly id: WorkspacePanel;
    readonly label: string;
    readonly icon: WorkspaceIconName;
  }[] = [
    { id: "files", label: t("nav.files"), icon: "folder" },
    { id: "search", label: t("nav.search"), icon: "search" },
    { id: "graph", label: t("nav.graph"), icon: "graph" },
    { id: "tags", label: t("nav.tags"), icon: "tag" },
    { id: "settings", label: t("nav.settings"), icon: "settings" },
  ];

  return (
    <WorkspaceRailView
      brand={<BrandMark size={28} />}
      items={items}
      activeId={activePanel}
      sidebarOpen={sidebarOpen}
      onItem={(panel) => onPanel(panel as WorkspacePanel)}
    />
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
  return <WorkspaceSidebarFrame title={title} actions={actions}>{children}</WorkspaceSidebarFrame>;
}

export function TabBar({
  tabs,
  activeNoteId,
  dirtyNoteIds,
  onActivate,
  onClose,
  onNew,
  onHome,
}: {
  readonly tabs: readonly WorkspaceTab[];
  readonly activeNoteId: string | undefined;
  readonly dirtyNoteIds: ReadonlySet<string>;
  readonly onActivate: (noteId: string) => void;
  readonly onClose: (noteId: string) => void;
  readonly onNew: () => void;
  readonly onHome: () => void;
}) {
  const { t } = useTranslation();
  return (
    <WorkspaceTabBarView
      tabs={tabs.map((tab) => ({
        id: tab.noteId,
        title: tab.title,
        path: tab.path,
        dirty: dirtyNoteIds.has(tab.noteId),
      }))}
      activeId={activeNoteId}
      homeLabel={t("home.open")}
      newLabel={t("actions.newNote")}
      closeLabel={(title) => t("actions.closeTab", { title })}
      onActivate={onActivate}
      onClose={onClose}
      onNew={onNew}
      onHome={onHome}
    />
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
  driveStatus,
  pendingDriveCount,
  storageKind,
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
  readonly driveStatus: DriveStatusState;
  readonly pendingDriveCount: number;
  readonly storageKind: "google-drive" | "local";
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
  const driveLabel =
    driveStatus === "reconnect-required"
      ? t("driveStatus.reconnect")
      : driveStatus === "reconnecting"
        ? t("driveStatus.reconnecting")
        : driveStatus === "expiring"
          ? t("driveStatus.expiring")
          : driveStatus === "syncing"
            ? t("driveStatus.syncing")
            : driveStatus === "pending"
              ? t("driveStatus.pending", { count: pendingDriveCount })
              : t("driveStatus.synced");
  const driveTitle =
    storageKind === "local"
      ? t("driveStatus.localTitle")
      : t("driveStatus.title");
  const storageLabel =
    storageKind === "local" ? t("driveStatus.localLabel") : "Drive";
  const syncLabel =
    syncState === "synced"
      ? t("actions.syncSynced")
      : syncState === "local"
        ? t("actions.syncLocal")
        : syncState === "syncing"
          ? t("actions.syncing")
          : syncState === "conflict"
            ? t("actions.syncConflict")
            : t("actions.syncError");

  return (
    <WorkspaceViewHeader
      canBack={canBack}
      canForward={canForward}
      breadcrumb={breadcrumb}
      backLabel={t("common.back")}
      forwardLabel={t("common.forward")}
      drive={{
        state: driveStatus,
        storageLabel,
        detail: driveLabel,
        title: driveTitle,
      }}
      note={hasNote ? {
        syncState,
        syncLabel,
        ...(syncState === "local"
          ? { syncTitle: t("actions.syncLocalDescription") }
          : {}),
        viewIcon: viewMode === "edit" ? "book" : "edit",
        viewLabel: modeLabel,
        contextLabel: t("actions.contextTitle"),
        saveLabel: t("common.save"),
        rightSidebarOpen,
        saveDisabled: !dirty || syncState === "syncing" || syncState === "conflict",
      } : undefined}
      onBack={onBack}
      onForward={onForward}
      onViewMode={() => onViewMode(viewMode === "edit" ? "read" : "edit")}
      onContext={onContext}
      onSave={onSave}
    />
  );
}

export function PlaceholderPanel({
  icon,
  title,
  description,
  shortcut,
}: {
  readonly icon: WorkspaceIconName;
  readonly title: string;
  readonly description: string;
  readonly shortcut?: string;
}) {
  return (
    <div className="sidebar-placeholder">
      <WorkspaceIcon name={icon} />
      <strong>{title}</strong>
      <p>{description}</p>
      {shortcut ? <kbd>{shortcut}</kbd> : null}
    </div>
  );
}

export { WorkspaceIcon as Icon };
export type { WorkspaceIconName as IconName };
