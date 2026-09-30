import type { ReactNode } from "react";

export function BrandMark({
  size = 32,
  className,
}: {
  readonly size?: number;
  readonly className?: string;
}) {
  return (
    <svg
      className={className}
      width={size}
      height={Math.round(size * 0.76)}
      viewBox="0 0 64 48"
      fill="none"
      aria-hidden="true"
    >
      <path d="M7 37 18 11l14 20L46 9l11 28-25-6" stroke="var(--mc-deep-blue)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m18 11 14 20L46 9" stroke="var(--mc-context-blue)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="7" cy="37" r="5" fill="#AEB9FF" />
      <circle cx="18" cy="11" r="5.5" fill="var(--mc-context-blue)" />
      <circle cx="32" cy="31" r="6" fill="var(--mc-deep-blue)" />
      <circle cx="46" cy="9" r="5.5" fill="var(--mc-focus-amber)" />
      <circle cx="57" cy="37" r="5" fill="#AEB9FF" />
    </svg>
  );
}

export type WorkspaceIconName =
  | "home"
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
  | "refresh"
  | "attachment";

export function WorkspaceIcon({ name }: { readonly name: WorkspaceIconName }) {
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
    case "home":
      return <svg {...common}><path d="m3 11 9-8 9 8" /><path d="M5 10v10h14V10M9 20v-6h6v6" /></svg>;
    case "folder":
      return <svg {...common}><path d="M3 6.5h6l2 2H21v9.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" /><path d="M3 9h18" /></svg>;
    case "search":
      return <svg {...common}><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>;
    case "graph":
      return <svg {...common}><circle cx="6" cy="6" r="2" /><circle cx="18" cy="7" r="2" /><circle cx="8" cy="18" r="2" /><circle cx="18" cy="17" r="2" /><path d="m8 7 8-.2M7 8l1 8m2-1 6-6m-6 9h6" /></svg>;
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
    case "attachment":
      return <svg {...common}><path d="m20.5 11.5-8.9 8.9a6 6 0 0 1-8.5-8.5l9.6-9.6a4 4 0 0 1 5.7 5.7l-9.7 9.7a2 2 0 1 1-2.8-2.8l8.9-8.9" /></svg>;
  }
}

export interface WorkspaceRailItem {
  readonly id: string;
  readonly label: string;
  readonly icon: WorkspaceIconName;
}

export function WorkspaceRailView({
  brand,
  items,
  activeId,
  sidebarOpen = true,
  onItem,
}: {
  readonly brand?: ReactNode;
  readonly items: readonly WorkspaceRailItem[];
  readonly activeId?: string;
  readonly sidebarOpen?: boolean;
  readonly onItem?: (id: string) => void;
}) {
  return (
    <nav className="workspace-rail">
      <div className="workspace-brand-mark">
        {brand ?? <BrandMark size={28} />}
      </div>
      {items.map((item) => (
        <button
          type="button"
          className={sidebarOpen && activeId === item.id ? "active" : ""}
          aria-label={item.label}
          title={item.label}
          key={item.id}
          onClick={() => onItem?.(item.id)}
        >
          <WorkspaceIcon name={item.icon} />
        </button>
      ))}
    </nav>
  );
}

export function WorkspaceSidebarFrame({
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

export interface WorkspaceTabViewModel {
  readonly id: string;
  readonly title: string;
  readonly path?: string;
  readonly dirty?: boolean;
}

export function WorkspaceTabBarView({
  tabs,
  activeId,
  homeLabel,
  newLabel,
  closeLabel,
  onActivate,
  onClose,
  onNew,
  onHome,
}: {
  readonly tabs: readonly WorkspaceTabViewModel[];
  readonly activeId?: string;
  readonly homeLabel: string;
  readonly newLabel: string;
  readonly closeLabel: (title: string) => string;
  readonly onActivate?: (id: string) => void;
  readonly onClose?: (id: string) => void;
  readonly onNew?: () => void;
  readonly onHome?: () => void;
}) {
  return (
    <div className="workspace-tabbar" aria-label="Open tabs">
      <div className="workspace-tabs">
        <button
          className={`workspace-home-tab ${activeId ? "" : "active"}`}
          type="button"
          aria-label={homeLabel}
          title={homeLabel}
          onClick={onHome}
        >
          <WorkspaceIcon name="home" />
        </button>
        {tabs.map((tab) => (
          <div className={`workspace-tab ${activeId === tab.id ? "active" : ""}`} key={tab.id}>
            <button
              className="workspace-tab-main"
              type="button"
              title={tab.path ?? tab.title}
              onClick={() => onActivate?.(tab.id)}
            >
              <span>{tab.title}</span>
              {tab.dirty ? <span className="workspace-tab-dirty" aria-hidden="true">●</span> : null}
            </button>
            <button
              className="workspace-tab-close"
              type="button"
              aria-label={closeLabel(tab.title)}
              onClick={() => onClose?.(tab.id)}
            >
              ×
            </button>
          </div>
        ))}
        <button
          className="workspace-new-tab"
          type="button"
          aria-label={newLabel}
          title={newLabel}
          onClick={onNew}
        >
          +
        </button>
      </div>
    </div>
  );
}

export interface WorkspaceDriveViewModel {
  readonly state: string;
  readonly storageLabel: string;
  readonly detail: string;
  readonly title: string;
}

export interface WorkspaceNoteActionsViewModel {
  readonly syncState: string;
  readonly syncLabel: string;
  readonly syncTitle?: string;
  readonly viewIcon: WorkspaceIconName;
  readonly viewLabel: string;
  readonly contextLabel: string;
  readonly saveLabel: string;
  readonly rightSidebarOpen: boolean;
  readonly saveDisabled: boolean;
}

export function WorkspaceViewHeader({
  canBack,
  canForward,
  breadcrumb,
  backLabel,
  forwardLabel,
  drive,
  note,
  onBack,
  onForward,
  onViewMode,
  onContext,
  onSave,
}: {
  readonly canBack: boolean;
  readonly canForward: boolean;
  readonly breadcrumb?: string;
  readonly backLabel: string;
  readonly forwardLabel: string;
  readonly drive: WorkspaceDriveViewModel;
  readonly note?: WorkspaceNoteActionsViewModel;
  readonly onBack?: () => void;
  readonly onForward?: () => void;
  readonly onViewMode?: () => void;
  readonly onContext?: () => void;
  readonly onSave?: () => void;
}) {
  return (
    <header className="workspace-view-header">
      <div className="workspace-view-nav">
        <button type="button" aria-label={backLabel} disabled={!canBack} onClick={onBack}>
          <WorkspaceIcon name="arrow-left" />
        </button>
        <button type="button" aria-label={forwardLabel} disabled={!canForward} onClick={onForward}>
          <WorkspaceIcon name="arrow-right" />
        </button>
      </div>
      <div className="workspace-breadcrumb" title={breadcrumb}>{breadcrumb ?? ""}</div>
      <span className={`global-drive-status ${drive.state}`} title={drive.title} aria-label={`${drive.title}: ${drive.detail}`}>
        <span className="global-drive-dot" aria-hidden="true" />
        <span className="global-drive-label">{drive.storageLabel}</span>
        <span className="global-drive-detail">· {drive.detail}</span>
      </span>
      {note ? (
        <div className="workspace-note-actions">
          <span className={`note-sync-state ${note.syncState}`} title={note.syncTitle}>{note.syncLabel}</span>
          <button type="button" aria-label={note.viewLabel} title={note.viewLabel} onClick={onViewMode}>
            <WorkspaceIcon name={note.viewIcon} />
          </button>
          <button type="button" aria-label={note.contextLabel} title={note.contextLabel} className={note.rightSidebarOpen ? "active" : ""} onClick={onContext}>
            <WorkspaceIcon name="panel-right" />
          </button>
          <button type="button" aria-label={note.saveLabel} title={note.saveLabel} disabled={note.saveDisabled} onClick={onSave}>
            <WorkspaceIcon name="save" />
          </button>
        </div>
      ) : null}
    </header>
  );
}

export function KnowledgePanelFrame({
  label,
  title,
  closeLabel,
  children,
  onClose,
}: {
  readonly label: string;
  readonly title: string;
  readonly closeLabel: string;
  readonly children: ReactNode;
  readonly onClose?: () => void;
}) {
  return (
    <aside className="knowledge-panel" aria-label={label}>
      <button className="knowledge-back" type="button" aria-label={closeLabel} onClick={onClose}>×</button>
      <span className="section-label">{label}</span>
      <h2>{title}</h2>
      {children}
    </aside>
  );
}
