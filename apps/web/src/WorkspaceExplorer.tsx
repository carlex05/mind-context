import { useMemo, useState } from "react";
import type { KnowledgeIndexSnapshot } from "@mind-context/knowledge";

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
import type { StorageProvider } from "@mind-context/storage";

export function WorkspaceExplorer({
  provider,
  tree,
  index,
  activeNoteId,
  selectedFolderId,
  onSelectedFolderIdChange,
  onOpenNote,
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
  readonly onChanged: () => Promise<void>;
  readonly onStatus: (message: string, kind?: "busy" | "success" | "error") => void;
}) {
  const [selectedItemId, setSelectedItemId] = useState<string>();
  const [newNoteName, setNewNoteName] = useState("");
  const [newFolderName, setNewFolderName] = useState("");
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const folders = useMemo(() => workspaceFolders(tree), [tree]);
  const selectedItem = selectedItemId
    ? findWorkspaceNode(tree, selectedItemId)
    : undefined;
  const selectedFolder =
    selectedFolderId === provider.rootId
      ? undefined
      : findWorkspaceNode(tree, selectedFolderId);

  async function createNote() {
    const name = newNoteName.trim();
    if (!name) return;
    onStatus("Creating note…", "busy");
    try {
      const metadata = await provider.createText(
        selectedFolderId,
        name,
        "# New note\n\n",
      );
      setNewNoteName("");
      await onChanged();
      onOpenNote(metadata.id);
      onStatus(`${metadata.name} created.`, "success");
    } catch (error) {
      onStatus(errorMessage(error), "error");
    }
  }

  async function createFolder() {
    const name = newFolderName.trim();
    if (!name) return;
    onStatus("Creating folder…", "busy");
    try {
      const metadata = await provider.createDirectory(selectedFolderId, name);
      setNewFolderName("");
      setExpanded((current) => new Set(current).add(selectedFolderId));
      await onChanged();
      onSelectedFolderIdChange(metadata.id);
      onStatus(`Folder “${metadata.name}” created.`, "success");
    } catch (error) {
      onStatus(errorMessage(error), "error");
    }
  }

  async function renameSelected() {
    if (!selectedItem) return;
    const value = window.prompt("New name", selectedItem.metadata.name);
    if (value === null || value.trim() === selectedItem.metadata.name) return;

    const backlinks = backlinkCountForNode(index, selectedItem);
    const confirmed = window.confirm(
      backlinks > 0
        ? `Rename “${selectedItem.metadata.name}”? MindContext will update ${backlinks} resolved incoming link${
            backlinks === 1 ? "" : "s"
          } where it can do so safely.`
        : `Rename “${selectedItem.metadata.name}”?`,
    );
    if (!confirmed) return;

    onStatus("Renaming and updating resolved links…", "busy");
    try {
      const result = await renameVaultItem(
        provider,
        index,
        selectedItem,
        value,
      );
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

  async function moveSelected(destinationId: string) {
    if (!selectedItem) return;
    const destination =
      destinationId === provider.rootId
        ? undefined
        : findWorkspaceNode(tree, destinationId);
    const confirmed = window.confirm(
      `Move “${selectedItem.metadata.name}” to ${
        destination?.path ?? "/"
      }? Resolved links will be recalculated.`,
    );
    if (!confirmed) return;

    onStatus("Moving and updating resolved links…", "busy");
    try {
      const result = await moveVaultItem(
        provider,
        index,
        selectedItem,
        destination,
      );
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

  async function deleteSelected() {
    if (!selectedItem) return;
    const backlinks = backlinkCountForNode(index, selectedItem);
    const detail =
      backlinks > 0
        ? ` This will leave ${backlinks} incoming link${
            backlinks === 1 ? "" : "s"
          } unresolved.`
        : "";
    if (
      !window.confirm(
        `Delete “${selectedItem.metadata.name}” from Google Drive?${detail}`,
      )
    ) {
      return;
    }

    onStatus("Deleting from Google Drive…", "busy");
    try {
      await provider.delete(
        selectedItem.metadata.id,
        selectedItem.metadata.revision
          ? { expectedRevision: selectedItem.metadata.revision }
          : undefined,
      );
      setSelectedItemId(undefined);
      if (selectedFolderId === selectedItem.metadata.id) {
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
      <div className="explorer-create">
        <div className="explorer-location">
          <span className="section-label">Create in</span>
          <strong>{selectedFolder?.path ?? "/"}</strong>
        </div>
        <form
          className="inline-form"
          onSubmit={(event) => {
            event.preventDefault();
            void createNote();
          }}
        >
          <input
            aria-label="New Markdown note"
            value={newNoteName}
            onChange={(event) => setNewNoteName(event.target.value)}
            placeholder="New note"
          />
          <button type="submit" disabled={!newNoteName.trim()}>
            + Note
          </button>
        </form>
        <form
          className="inline-form"
          onSubmit={(event) => {
            event.preventDefault();
            void createFolder();
          }}
        >
          <input
            aria-label="New folder"
            value={newFolderName}
            onChange={(event) => setNewFolderName(event.target.value)}
            placeholder="New folder"
          />
          <button type="submit" disabled={!newFolderName.trim()}>
            + Folder
          </button>
        </form>
      </div>

      <nav className="file-tree" aria-label="Workspace files">
        <button
          className={`tree-row root-row ${
            selectedFolderId === provider.rootId ? "selected" : ""
          }`}
          type="button"
          onClick={() => {
            onSelectedFolderIdChange(provider.rootId);
            setSelectedItemId(undefined);
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
            expanded={expanded}
            onToggleFolder={toggleFolder}
            onSelectItem={setSelectedItemId}
            onSelectFolder={onSelectedFolderIdChange}
            onOpenNote={onOpenNote}
          />
        ))}
      </nav>

      {selectedItem ? (
        <section className="file-actions" aria-label="Selected file actions">
          <span className="section-label">Selected</span>
          <strong>{selectedItem.path}</strong>
          <div className="file-action-buttons">
            <button type="button" onClick={() => void renameSelected()}>
              Rename
            </button>
            <button type="button" onClick={() => void deleteSelected()}>
              Delete
            </button>
          </div>
          <label>
            Move to
            <select
              defaultValue=""
              onChange={(event) => {
                const value = event.target.value;
                if (!value) return;
                event.target.value = "";
                void moveSelected(value);
              }}
            >
              <option value="">Choose destination…</option>
              <option value={provider.rootId}>/</option>
              {folders
                .filter(
                  (folder) =>
                    folder.metadata.id !== selectedItem.metadata.id &&
                    !folder.path.startsWith(`${selectedItem.path}/`),
                )
                .map((folder) => (
                  <option key={folder.metadata.id} value={folder.metadata.id}>
                    {folder.path}
                  </option>
                ))}
            </select>
          </label>
        </section>
      ) : null}
    </>
  );
}

function TreeNode({
  node,
  depth,
  activeNoteId,
  selectedItemId,
  selectedFolderId,
  expanded,
  onToggleFolder,
  onSelectItem,
  onSelectFolder,
  onOpenNote,
}: {
  readonly node: WorkspaceTreeNode;
  readonly depth: number;
  readonly activeNoteId?: string;
  readonly selectedItemId: string | undefined;
  readonly selectedFolderId: string;
  readonly expanded: ReadonlySet<string>;
  readonly onToggleFolder: (id: string) => void;
  readonly onSelectItem: (id: string) => void;
  readonly onSelectFolder: (id: string) => void;
  readonly onOpenNote: (id: string) => void;
}) {
  const isFolder = node.metadata.kind === "directory";
  const isExpanded = expanded.has(node.metadata.id);

  return (
    <div className="tree-node">
      <div
        className={`tree-row ${
          activeNoteId === node.metadata.id ? "active" : ""
        } ${selectedItemId === node.metadata.id ? "selected" : ""} ${
          selectedFolderId === node.metadata.id ? "folder-selected" : ""
        }`}
        style={{ paddingInlineStart: `${10 + depth * 16}px` }}
      >
        {isFolder ? (
          <button
            className="tree-toggle"
            type="button"
            aria-label={isExpanded ? `Collapse ${node.metadata.name}` : `Expand ${node.metadata.name}`}
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
      </div>
      {isFolder && isExpanded
        ? node.children.map((child) => (
            <TreeNode
              key={child.metadata.id}
              node={child}
              depth={depth + 1}
              activeNoteId={activeNoteId}
              selectedItemId={selectedItemId}
              selectedFolderId={selectedFolderId}
              expanded={expanded}
              onToggleFolder={onToggleFolder}
              onSelectItem={onSelectItem}
              onSelectFolder={onSelectFolder}
              onOpenNote={onOpenNote}
            />
          ))
        : null}
    </div>
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something unexpected happened.";
}
