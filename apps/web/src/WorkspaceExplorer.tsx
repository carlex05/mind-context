import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import type { KnowledgeIndexSnapshot } from "@mind-context/knowledge";
import type { StorageProvider } from "@mind-context/storage";
import { useTranslation } from "react-i18next";

import {
  backlinkCountForNode,
  moveVaultItem,
  renameVaultItem,
} from "./vaultMutations";
import {
  findWorkspaceNode,
  isImageFile,
  workspaceFolders,
  type WorkspaceTreeNode,
} from "./workspaceTree";

export function WorkspaceExplorer({
  provider,
  tree,
  index,
  loading,
  activeResourceId,
  selectedFolderId,
  onSelectedFolderIdChange,
  onOpenFile,
  onRequestNewNote,
  onRequestNewCanvas,
  onRequestNewExcalidraw,
  onRequestNewFolder,
  onRequestAttachFiles,
  onChanged,
  onStatus,
}: {
  readonly provider: StorageProvider;
  readonly tree: readonly WorkspaceTreeNode[];
  readonly index: KnowledgeIndexSnapshot | undefined;
  readonly loading: boolean;
  readonly activeResourceId: string | undefined;
  readonly selectedFolderId: string;
  readonly onSelectedFolderIdChange: (id: string) => void;
  readonly onOpenFile: (node: WorkspaceTreeNode) => void;
  readonly onRequestNewNote: (folderId: string) => void;
  readonly onRequestNewCanvas: (folderId: string) => void;
  readonly onRequestNewExcalidraw: (folderId: string) => void;
  readonly onRequestNewFolder: (folderId: string) => void;
  readonly onRequestAttachFiles: (folderId: string) => void;
  readonly onChanged: () => Promise<void>;
  readonly onStatus: (
    message: string,
    kind?: "busy" | "success" | "error",
  ) => void;
}) {
  const { t } = useTranslation();
  const [selectedItemId, setSelectedItemId] = useState<string>();
  const [menuItemId, setMenuItemId] = useState<string>();
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const folders = useMemo(() => workspaceFolders(tree), [tree]);

  async function renameNode(node: WorkspaceTreeNode) {
    const value = window.prompt(t("explorer.newName"), node.metadata.name);
    if (value === null || value.trim() === node.metadata.name) return;

    const backlinks = backlinkCountForNode(index, node);
    const confirmation =
      backlinks > 0
        ? t("explorer.renameIncomingConfirm", {
            name: node.metadata.name,
            count: backlinks,
          })
        : t("explorer.renameConfirm", { name: node.metadata.name });

    if (!window.confirm(confirmation)) return;

    onStatus(t("explorer.renaming"), "busy");
    try {
      const result = await renameVaultItem(provider, index, node, value);
      await onChanged();
      onStatus(
        t("explorer.linksUpdated", { count: result.rewrittenNotes }),
        "success",
      );
    } catch (error) {
      await onChanged();
      onStatus(errorMessage(error, t("errors.unexpected")), "error");
    }
  }

  async function moveNode(node: WorkspaceTreeNode, destinationId: string) {
    const destination =
      destinationId === provider.rootId
        ? undefined
        : findWorkspaceNode(tree, destinationId);

    if (
      !window.confirm(
        t("explorer.moveConfirm", {
          name: node.metadata.name,
          destination: destination?.path ?? "/",
        }),
      )
    ) {
      return;
    }

    onStatus(t("explorer.moving"), "busy");
    try {
      const result = await moveVaultItem(provider, index, node, destination);
      await onChanged();
      onStatus(
        t("explorer.movedUpdated", { count: result.rewrittenNotes }),
        "success",
      );
    } catch (error) {
      await onChanged();
      onStatus(errorMessage(error, t("errors.unexpected")), "error");
    }
  }

  async function deleteNode(node: WorkspaceTreeNode) {
    const backlinks = backlinkCountForNode(index, node);
    const detail =
      backlinks > 0
        ? t("explorer.incomingLinks", { count: backlinks })
        : "";

    if (
      !window.confirm(
        t("explorer.deleteConfirm", {
          name: node.metadata.name,
          detail,
        }),
      )
    ) {
      return;
    }

    onStatus(t("explorer.deleting"), "busy");
    try {
      await provider.delete(
        node.metadata.id,
        node.metadata.revision
          ? { expectedRevision: node.metadata.revision }
          : undefined,
      );
      setSelectedItemId(undefined);
      setMenuItemId(undefined);
      if (selectedFolderId === node.metadata.id) {
        onSelectedFolderIdChange(provider.rootId);
      }
      await onChanged();
      onStatus(t("explorer.deleted"), "success");
    } catch (error) {
      await onChanged();
      onStatus(errorMessage(error, t("errors.unexpected")), "error");
    }
  }

  function toggleFolder(id: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <nav className="file-tree" aria-label={t("explorer.workspaceFiles")}>
      {loading ? (
        <div className="drive-tree-loading">
          <div className="drive-tree-loading-title">
            <span className="drive-loading-spinner" aria-hidden="true" />
            <span>{t("workspaceLoading.files")}</span>
          </div>
          <div className="drive-tree-skeleton" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </div>
        </div>
      ) : (
        <>
      <button
        className={`tree-row root-row ${
          selectedFolderId === provider.rootId ? "selected" : ""
        }`}
        type="button"
        onClick={() => {
          onSelectedFolderIdChange(provider.rootId);
          setSelectedItemId(undefined);
          setMenuItemId(undefined);
        }}
      >
        <span aria-hidden="true">⌂</span>
        <span>/</span>
      </button>
      {tree.map((node) => (
        <TreeNode
          key={node.metadata.id}
          node={node}
          depth={0}
          activeResourceId={activeResourceId}
          selectedItemId={selectedItemId}
          selectedFolderId={selectedFolderId}
          menuItemId={menuItemId}
          folders={folders}
          rootId={provider.rootId}
          expanded={expanded}
          onToggleFolder={toggleFolder}
          onSelectItem={setSelectedItemId}
          onSelectFolder={onSelectedFolderIdChange}
          onOpenFile={onOpenFile}
          onMenuItem={setMenuItemId}
          onNewNote={onRequestNewNote}
          onNewCanvas={onRequestNewCanvas}
          onNewExcalidraw={onRequestNewExcalidraw}
          onNewFolder={onRequestNewFolder}
          onAttachFiles={onRequestAttachFiles}
          onRename={(target) => void renameNode(target)}
          onMove={(target, destinationId) =>
            void moveNode(target, destinationId)
          }
          onDelete={(target) => void deleteNode(target)}
        />
      ))}
        </>
      )}
    </nav>
  );
}

function TreeNode({
  node,
  depth,
  activeResourceId,
  selectedItemId,
  selectedFolderId,
  menuItemId,
  folders,
  rootId,
  expanded,
  onToggleFolder,
  onSelectItem,
  onSelectFolder,
  onOpenFile,
  onMenuItem,
  onNewNote,
  onNewCanvas,
  onNewExcalidraw,
  onNewFolder,
  onAttachFiles,
  onRename,
  onMove,
  onDelete,
}: {
  readonly node: WorkspaceTreeNode;
  readonly depth: number;
  readonly activeResourceId: string | undefined;
  readonly selectedItemId: string | undefined;
  readonly selectedFolderId: string;
  readonly menuItemId: string | undefined;
  readonly folders: readonly WorkspaceTreeNode[];
  readonly rootId: string;
  readonly expanded: ReadonlySet<string>;
  readonly onToggleFolder: (id: string) => void;
  readonly onSelectItem: (id: string | undefined) => void;
  readonly onSelectFolder: (id: string) => void;
  readonly onOpenFile: (node: WorkspaceTreeNode) => void;
  readonly onMenuItem: (id: string | undefined) => void;
  readonly onNewNote: (folderId: string) => void;
  readonly onNewCanvas: (folderId: string) => void;
  readonly onNewExcalidraw: (folderId: string) => void;
  readonly onNewFolder: (folderId: string) => void;
  readonly onAttachFiles: (folderId: string) => void;
  readonly onRename: (node: WorkspaceTreeNode) => void;
  readonly onMove: (node: WorkspaceTreeNode, destinationId: string) => void;
  readonly onDelete: (node: WorkspaceTreeNode) => void;
}) {
  const { t } = useTranslation();
  const isFolder = node.metadata.kind === "directory";
  const isExpanded = expanded.has(node.metadata.id);
  const menuOpen = menuItemId === node.metadata.id;
  const menuTriggerRef = useRef<HTMLButtonElement>(null);

  function runMenuAction(action: () => void) {
    onMenuItem(undefined);
    action();
  }

  return (
    <div className="tree-node">
      <div
        className={`tree-row ${
          activeResourceId === node.metadata.id ? "active" : ""
        } ${
          selectedItemId === node.metadata.id && isFolder ? "selected" : ""
        } ${
          selectedFolderId === node.metadata.id ? "folder-selected" : ""
        }`}
        style={{ paddingInlineStart: `${8 + depth * 14}px` }}
      >
        {isFolder ? (
          <button
            className="tree-toggle"
            type="button"
            aria-label={
              isExpanded
                ? t("explorer.collapse", { name: node.metadata.name })
                : t("explorer.expand", { name: node.metadata.name })
            }
            onClick={() => onToggleFolder(node.metadata.id)}
          >
            {isExpanded ? "▾" : "▸"}
          </button>
        ) : (
          <span className="tree-spacer" aria-hidden="true">
            {isImageFile(node.metadata) ? "▧" : "◇"}
          </span>
        )}
        <button
          className="tree-main"
          type="button"
          aria-current={
            !isFolder && activeResourceId === node.metadata.id
              ? "page"
              : undefined
          }
          onClick={() => {
            onMenuItem(undefined);
            if (isFolder) {
              onSelectItem(node.metadata.id);
              onSelectFolder(node.metadata.id);
              if (!isExpanded) onToggleFolder(node.metadata.id);
            } else {
              onSelectItem(undefined);
              onOpenFile(node);
            }
          }}
        >
          {node.metadata.name}
        </button>
        <button
          ref={menuTriggerRef}
          className="tree-menu-trigger"
          type="button"
          aria-label={t("explorer.actionsFor", { name: node.metadata.name })}
          aria-haspopup="dialog"
          aria-expanded={menuOpen}
          onClick={() => onMenuItem(menuOpen ? undefined : node.metadata.id)}
        >
          ⋯
        </button>
      </div>

      {menuOpen ? (
        <TreeActionPopover
          triggerRef={menuTriggerRef}
          label={t("explorer.actionsFor", { name: node.metadata.name })}
          onClose={() => onMenuItem(undefined)}
        >
          {isFolder ? (
            <>
              <button
                type="button"
                onClick={() =>
                  runMenuAction(() => onNewNote(node.metadata.id))
                }
              >
                {t("explorer.newNoteHere")}
              </button>
              <button
                type="button"
                onClick={() =>
                  runMenuAction(() => onNewCanvas(node.metadata.id))
                }
              >
                {t("explorer.newCanvasHere")}
              </button>
              <button
                type="button"
                onClick={() =>
                  runMenuAction(() => onNewExcalidraw(node.metadata.id))
                }
              >
                {t("explorer.newExcalidrawHere")}
              </button>
              <button
                type="button"
                onClick={() =>
                  runMenuAction(() => onNewFolder(node.metadata.id))
                }
              >
                {t("explorer.newFolderHere")}
              </button>
              <button
                type="button"
                onClick={() =>
                  runMenuAction(() => onAttachFiles(node.metadata.id))
                }
              >
                {t("explorer.attachFileHere")}
              </button>
            </>
          ) : null}
          <button
            type="button"
            onClick={() => runMenuAction(() => onRename(node))}
          >
            {t("explorer.rename")}
          </button>
          <label>
            {t("explorer.moveTo")}
            <select
              defaultValue=""
              onChange={(event) => {
                const destinationId = event.target.value;
                event.target.value = "";
                if (destinationId) {
                  runMenuAction(() => onMove(node, destinationId));
                }
              }}
            >
              <option value="">{t("explorer.choose")}</option>
              <option value={rootId}>/</option>
              {folders
                .filter(
                  (folder) =>
                    folder.metadata.id !== node.metadata.id &&
                    !folder.path.startsWith(`${node.path}/`),
                )
                .map((folder) => (
                  <option key={folder.metadata.id} value={folder.metadata.id}>
                    {folder.path}
                  </option>
                ))}
            </select>
          </label>
          <button
            className="danger-action"
            type="button"
            onClick={() => runMenuAction(() => onDelete(node))}
          >
            {t("explorer.delete")}
          </button>
        </TreeActionPopover>
      ) : null}

      {isFolder && isExpanded
        ? node.children.map((child) => (
            <TreeNode
              key={child.metadata.id}
              node={child}
              depth={depth + 1}
              activeResourceId={activeResourceId}
              selectedItemId={selectedItemId}
              selectedFolderId={selectedFolderId}
              menuItemId={menuItemId}
              folders={folders}
              rootId={rootId}
              expanded={expanded}
              onToggleFolder={onToggleFolder}
              onSelectItem={onSelectItem}
              onSelectFolder={onSelectFolder}
              onOpenFile={onOpenFile}
                  onMenuItem={onMenuItem}
              onNewNote={onNewNote}
              onNewCanvas={onNewCanvas}
              onNewExcalidraw={onNewExcalidraw}
              onNewFolder={onNewFolder}
              onAttachFiles={onAttachFiles}
              onRename={onRename}
              onMove={onMove}
              onDelete={onDelete}
            />
          ))
        : null}
    </div>
  );
}

function TreeActionPopover({
  triggerRef,
  label,
  onClose,
  children,
}: {
  readonly triggerRef: RefObject<HTMLButtonElement | null>;
  readonly label: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
}) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{
    readonly top: number;
    readonly left: number;
  }>();

  useLayoutEffect(() => {
    const trigger = triggerRef.current;
    const popover = popoverRef.current;
    if (!trigger || !popover) return;

    const triggerRect = trigger.getBoundingClientRect();
    const popoverRect = popover.getBoundingClientRect();
    const gap = 4;
    const edge = 8;
    const left = Math.min(
      window.innerWidth - popoverRect.width - edge,
      Math.max(edge, triggerRect.right - popoverRect.width),
    );
    const roomBelow = window.innerHeight - triggerRect.bottom - edge;
    const top =
      roomBelow >= popoverRect.height + gap
        ? triggerRect.bottom + gap
        : Math.max(edge, triggerRect.top - popoverRect.height - gap);

    setPosition({ top, left });
    popover
      .querySelector<HTMLElement>("button:not(:disabled), select")
      ?.focus();
  }, [triggerRef]);

  useEffect(() => {
    function closeFromOutside(event: PointerEvent) {
      const target = event.target as Node;
      if (
        popoverRef.current?.contains(target) ||
        triggerRef.current?.contains(target)
      ) {
        return;
      }
      onClose();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
      triggerRef.current?.focus();
    }

    function closeOnViewportChange() {
      onClose();
    }

    document.addEventListener("pointerdown", closeFromOutside);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", closeOnViewportChange);
    window.addEventListener("scroll", closeOnViewportChange, true);
    return () => {
      document.removeEventListener("pointerdown", closeFromOutside);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", closeOnViewportChange);
      window.removeEventListener("scroll", closeOnViewportChange, true);
    };
  }, [onClose, triggerRef]);

  return createPortal(
    <div
      ref={popoverRef}
      className="tree-menu tree-menu-popover"
      role="dialog"
      aria-label={label}
      style={{
        top: position?.top ?? 0,
        left: position?.left ?? 0,
        visibility: position ? "visible" : "hidden",
      }}
    >
      {children}
    </div>,
    document.body,
  );
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
