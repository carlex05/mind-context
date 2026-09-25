import { useMemo, useState } from "react";
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
  workspaceFolders,
  type WorkspaceTreeNode,
} from "./workspaceTree";

export function WorkspaceExplorer({
  provider,
  tree,
  index,
  activeNoteId,
  selectedFolderId,
  onSelectedFolderIdChange,
  onOpenNote,
  onRequestNewNote,
  onRequestNewFolder,
  onChanged,
  onStatus,
}: {
  readonly provider: StorageProvider;
  readonly tree: readonly WorkspaceTreeNode[];
  readonly index: KnowledgeIndexSnapshot | undefined;
  readonly activeNoteId: string | undefined;
  readonly selectedFolderId: string;
  readonly onSelectedFolderIdChange: (id: string) => void;
  readonly onOpenNote: (id: string) => void;
  readonly onRequestNewNote: (folderId: string) => void;
  readonly onRequestNewFolder: (folderId: string) => void;
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
          activeNoteId={activeNoteId}
          selectedItemId={selectedItemId}
          selectedFolderId={selectedFolderId}
          menuItemId={menuItemId}
          folders={folders}
          rootId={provider.rootId}
          expanded={expanded}
          onToggleFolder={toggleFolder}
          onSelectItem={setSelectedItemId}
          onSelectFolder={onSelectedFolderIdChange}
          onOpenNote={onOpenNote}
          onMenuItem={setMenuItemId}
          onNewNote={onRequestNewNote}
          onNewFolder={onRequestNewFolder}
          onRename={(target) => void renameNode(target)}
          onMove={(target, destinationId) =>
            void moveNode(target, destinationId)
          }
          onDelete={(target) => void deleteNode(target)}
        />
      ))}
    </nav>
  );
}

function TreeNode({
  node,
  depth,
  activeNoteId,
  selectedItemId,
  selectedFolderId,
  menuItemId,
  folders,
  rootId,
  expanded,
  onToggleFolder,
  onSelectItem,
  onSelectFolder,
  onOpenNote,
  onMenuItem,
  onNewNote,
  onNewFolder,
  onRename,
  onMove,
  onDelete,
}: {
  readonly node: WorkspaceTreeNode;
  readonly depth: number;
  readonly activeNoteId: string | undefined;
  readonly selectedItemId: string | undefined;
  readonly selectedFolderId: string;
  readonly menuItemId: string | undefined;
  readonly folders: readonly WorkspaceTreeNode[];
  readonly rootId: string;
  readonly expanded: ReadonlySet<string>;
  readonly onToggleFolder: (id: string) => void;
  readonly onSelectItem: (id: string) => void;
  readonly onSelectFolder: (id: string) => void;
  readonly onOpenNote: (id: string) => void;
  readonly onMenuItem: (id: string | undefined) => void;
  readonly onNewNote: (folderId: string) => void;
  readonly onNewFolder: (folderId: string) => void;
  readonly onRename: (node: WorkspaceTreeNode) => void;
  readonly onMove: (node: WorkspaceTreeNode, destinationId: string) => void;
  readonly onDelete: (node: WorkspaceTreeNode) => void;
}) {
  const { t } = useTranslation();
  const isFolder = node.metadata.kind === "directory";
  const isExpanded = expanded.has(node.metadata.id);
  const menuOpen = menuItemId === node.metadata.id;

  return (
    <div className="tree-node">
      <div
        className={`tree-row ${
          activeNoteId === node.metadata.id ? "active" : ""
        } ${selectedItemId === node.metadata.id ? "selected" : ""} ${
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
          <span className="tree-spacer" aria-hidden="true">◇</span>
        )}
        <button
          className="tree-main"
          type="button"
          onClick={() => {
            onSelectItem(node.metadata.id);
            onMenuItem(undefined);
            if (isFolder) {
              onSelectFolder(node.metadata.id);
              if (!isExpanded) onToggleFolder(node.metadata.id);
            } else {
              onOpenNote(node.metadata.id);
            }
          }}
        >
          {node.metadata.name}
        </button>
        <button
          className="tree-menu-trigger"
          type="button"
          aria-label={t("explorer.actionsFor", { name: node.metadata.name })}
          onClick={() => onMenuItem(menuOpen ? undefined : node.metadata.id)}
        >
          ⋯
        </button>
      </div>

      {menuOpen ? (
        <div
          className="tree-menu"
          style={{ marginInlineStart: `${38 + depth * 14}px` }}
        >
          {isFolder ? (
            <>
              <button type="button" onClick={() => onNewNote(node.metadata.id)}>
                {t("explorer.newNoteHere")}
              </button>
              <button type="button" onClick={() => onNewFolder(node.metadata.id)}>
                {t("explorer.newFolderHere")}
              </button>
            </>
          ) : null}
          <button type="button" onClick={() => onRename(node)}>
            {t("explorer.rename")}
          </button>
          <label>
            {t("explorer.moveTo")}
            <select
              defaultValue=""
              onChange={(event) => {
                const destinationId = event.target.value;
                event.target.value = "";
                if (destinationId) onMove(node, destinationId);
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
            onClick={() => onDelete(node)}
          >
            {t("explorer.delete")}
          </button>
        </div>
      ) : null}

      {isFolder && isExpanded
        ? node.children.map((child) => (
            <TreeNode
              key={child.metadata.id}
              node={child}
              depth={depth + 1}
              activeNoteId={activeNoteId}
              selectedItemId={selectedItemId}
              selectedFolderId={selectedFolderId}
              menuItemId={menuItemId}
              folders={folders}
              rootId={rootId}
              expanded={expanded}
              onToggleFolder={onToggleFolder}
              onSelectItem={onSelectItem}
              onSelectFolder={onSelectFolder}
              onOpenNote={onOpenNote}
              onMenuItem={onMenuItem}
              onNewNote={onNewNote}
              onNewFolder={onNewFolder}
              onRename={onRename}
              onMove={onMove}
              onDelete={onDelete}
            />
          ))
        : null}
    </div>
  );
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
