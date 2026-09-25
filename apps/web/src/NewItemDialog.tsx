import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  workspaceFolders,
  type WorkspaceTreeNode,
} from "./workspaceTree";

export type CreateItemKind = "note" | "folder";

export function NewItemDialog({
  open,
  kind,
  tree,
  rootId,
  initialFolderId,
  initialName = "",
  onClose,
  onCreate,
}: {
  readonly open: boolean;
  readonly kind: CreateItemKind;
  readonly tree: readonly WorkspaceTreeNode[];
  readonly rootId: string;
  readonly initialFolderId: string;
  readonly initialName?: string;
  readonly onClose: () => void;
  readonly onCreate: (
    kind: CreateItemKind,
    name: string,
    parentId: string,
  ) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(initialName);
  const [parentId, setParentId] = useState(initialFolderId);
  const [submitting, setSubmitting] = useState(false);
  const folders = useMemo(() => workspaceFolders(tree), [tree]);

  useEffect(() => {
    if (!open) return;
    setName(initialName);
    setParentId(initialFolderId);
    setSubmitting(false);
  }, [open, initialFolderId, initialName, kind]);

  if (!open) return null;

  async function submit() {
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    try {
      await onCreate(kind, name.trim(), parentId);
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  const title =
    kind === "note" ? t("newItem.noteTitle") : t("newItem.folderTitle");

  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="dialog-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-item-title"
      >
        <div className="dialog-heading">
          <div>
            <span className="section-label">{t("common.create")}</span>
            <h2 id="new-item-title">{title}</h2>
          </div>
          <button
            className="icon-button quiet"
            type="button"
            aria-label={t("common.close")}
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <label className="field">
          <span>{t("newItem.name")}</span>
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void submit();
              if (event.key === "Escape") onClose();
            }}
            placeholder={
              kind === "note"
                ? t("newItem.notePlaceholder")
                : t("newItem.folderPlaceholder")
            }
          />
        </label>

        <label className="field">
          <span>{t("newItem.location")}</span>
          <select
            value={parentId}
            onChange={(event) => setParentId(event.target.value)}
          >
            <option value={rootId}>/</option>
            {folders.map((folder) => (
              <option key={folder.metadata.id} value={folder.metadata.id}>
                {folder.path}
              </option>
            ))}
          </select>
        </label>

        <div className="dialog-actions">
          <button className="secondary-button" type="button" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button
            className="primary-button"
            type="button"
            disabled={!name.trim() || submitting}
            onClick={() => void submit()}
          >
            {t("common.create")}
          </button>
        </div>
      </section>
    </div>
  );
}
