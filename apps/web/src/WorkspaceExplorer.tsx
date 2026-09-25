import { useMemo, useState } from "react";
import type { KnowledgeIndexSnapshot } from "@mind-context/knowledge";
import type { StorageProvider } from "@mind-context/storage";

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
  const [selectedItemId, setSelectedItemId] = useState<string>();
  const [menuItemId, setMenuItemId] = useState<string>();
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const folders = useMemo(() => workspaceFolders(tree), [tree]);
  const selectedItem = selectedItemId
    ? findWorkspaceNode(tree, selectedItemId)
    : undefined;

  async function renameNode(node: WorkspaceTreeNode) {
    const value = window.prompt("New name", node.metadata.name);
    if (value === null || value.trim() === node.metadata.name) return;

    const backlinks = backlinkCountForNode(index, node);
    if (
      !window.confirm(
        backlinks > 0
          ? `Rename “${node.metadata.name}”? ${backlinks} resolved incoming link${
              backlinks === 1 ? "" : "s"
            } can be updated safely.`
          : `Rename “${node.metadata.name}”?`,
      )
    ) {
      return;
    }

    onStatus("Renaming and updating resolved links…", "busy");
    try {
      const result = await renameVaultItem(provider, index, node, value);
      await onChanged();
      onStatus(
        `Renamed. Updated ${result.rewrittenNotes} linked note${
          result.rewrittenNotes === 1 ? "" : "s"
        }.`,
        "success",
      );
    } catch (error) {
      await onChanged();
      onStatus(errorMessage(error), "error");
    }
  }

  async function moveNode(node: WorkspaceTreeNode, destinationId: string) {
    const destination =
      destinationId === provider.rootId
        ? undefined
        : findWorkspaceNode(tree, destinationId);

    if (
      !window.confirm(
        `Move “${node.metadata.name}” to ${destination?.path ?? "/"}? Resolved links will be recalculated.`,
      )
    ) {
      return;
    }

    onStatus("Moving and updating resolved links…", "busy");
    try {
      const result = await moveVaultItem(provider, index, node, destination);
      await onChanged();
      onStatus(
        `Moved. Updated ${result.rewrittenNotes} linked note${
          result.rewrittenNotes === 1 ? "" : "s"
        }.`,
        "success",
      );
    } catch (error) {
      await onChanged();
      onStatus(errorMessage(error), "error");
    }
  }

  async function deleteNode(node: WorkspaceTreeNode) {
    const backlinks = backlinkCountForNode(index, node);
    const detail =
      backlinks > 0
        ? ` This leaves ${backlinks} incoming link${backlinks === 1 ? "" : "s"} unresolved.`
        : "";

    if (
      !window.confirm(
        `Delete “${node.metadata.name}” from Google Drive?${detail}`,
      )
    ) {
      return;
    }

    onStatus("Deleting from Google Drive…", "busy");
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
      onStatus("Deleted and local index rebuilt.", "success");
    } catch (error) {
      await onChanged();
      onStatus(errorMessage(error), "error");
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
    <>
      <nav className="file-tree" aria-label="Workspace files">
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
            onRename={(node) => void renameNode(node)}
            onMove={(node, destinationId) =>
              void moveNode(node, destinationId)
            }
            onDelete={(node) => void deleteNode(node)}
          />
        ))}
      </nav>
    </>
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
                ? `Collapse ${node.metadata.name}`
                : `Expand ${node.metadata.name}`
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
          aria-label={`Actions for ${node.metadata.name}`}
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
                New note here
              </button>
              <button type="button" onClick={() => onNewFolder(node.metadata.id)}>
                New folder here
              </button>
            </>
          ) : null}
          <button type="button" onClick={() => onRename(node)}>Rename</button>
          <label>
            Move to
            <select
              defaultValue=""
              onChange={(event) => {
                const destinationId = event.target.value;
                event.target.value = "";
                if (destinationId) onMove(node, destinationId);
              }}
            >
              <option value="">Choose…</option>
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
          <button className="danger-action" type="button" onClick={() => onDelete(node)}>
            Delete
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

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Something unexpected happened.";
}
