import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

import { Icon } from "./WorkspaceShell";

export function FilesCreateMenu({
  disabled,
  canvasEnabled,
  excalidrawEnabled,
  onNewNote,
  onNewCanvas,
  onNewExcalidraw,
  onNewFolder,
  onAttachFiles,
}: {
  readonly disabled: boolean;
  readonly canvasEnabled: boolean;
  readonly excalidrawEnabled: boolean;
  readonly onNewNote: () => void;
  readonly onNewCanvas: () => void;
  readonly onNewExcalidraw: () => void;
  readonly onNewFolder: () => void;
  readonly onAttachFiles: () => void;
}) {
  const { t } = useTranslation();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, right: 0 });

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setPosition({
      top: rect.bottom + 6,
      right: Math.max(8, window.innerWidth - rect.right),
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        !triggerRef.current?.contains(target) &&
        !menuRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", escape);
    };
  }, [open]);

  function run(action: () => void) {
    setOpen(false);
    action();
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="files-create-trigger"
        aria-label={t("actions.createNew")}
        title={t("actions.createNew")}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="files-create-plus" aria-hidden="true">+</span>
      </button>
      {open
        ? createPortal(
            <div
              ref={menuRef}
              className="files-create-menu"
              role="menu"
              aria-label={t("actions.createNew")}
              style={{ top: position.top, right: position.right }}
            >
              <button type="button" role="menuitem" onClick={() => run(onNewNote)}>
                <Icon name="file-plus" />
                <span>{t("actions.newNote")}</span>
              </button>
              {canvasEnabled ? (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => run(onNewCanvas)}
                >
                  <Icon name="canvas" />
                  <span>{t("actions.newCanvas")}</span>
                </button>
              ) : null}
              {excalidrawEnabled ? (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => run(onNewExcalidraw)}
                >
                  <Icon name="drawing" />
                  <span>{t("actions.newExcalidraw")}</span>
                </button>
              ) : null}
              <div className="files-create-menu-separator" role="separator" />
              <button type="button" role="menuitem" onClick={() => run(onNewFolder)}>
                <Icon name="folder-plus" />
                <span>{t("actions.newFolder")}</span>
              </button>
              <button type="button" role="menuitem" onClick={() => run(onAttachFiles)}>
                <Icon name="attachment" />
                <span>{t("actions.attachFiles")}</span>
              </button>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
