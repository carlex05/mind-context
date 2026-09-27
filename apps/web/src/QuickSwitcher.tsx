import { useEffect, useMemo, useRef, useState } from "react";
import type { IndexedNote } from "@mind-context/knowledge";
import { useTranslation } from "react-i18next";

import type { WorkspacePanel } from "./workspaceUi";

interface LauncherAction {
  readonly id: string;
  readonly label: string;
  readonly detail: string;
  readonly keywords: string;
  readonly run: () => void;
}

type LauncherEntry =
  | { readonly kind: "note"; readonly note: IndexedNote }
  | { readonly kind: "action"; readonly action: LauncherAction }
  | { readonly kind: "create"; readonly name: string };

export function QuickSwitcher({
  open,
  notes,
  recentNoteIds,
  onClose,
  onOpenNote,
  onCreateNote,
  onCreateFolder,
  onOpenPanel,
  onHome,
}: {
  readonly open: boolean;
  readonly notes: readonly IndexedNote[];
  readonly recentNoteIds: readonly string[];
  readonly onClose: () => void;
  readonly onOpenNote: (id: string) => void;
  readonly onCreateNote: (name: string) => void;
  readonly onCreateFolder: () => void;
  readonly onOpenPanel: (panel: WorkspacePanel) => void;
  readonly onHome: () => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const selectedRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSelectedIndex(0);
  }, [open]);

  const actions = useMemo<readonly LauncherAction[]>(
    () => [
      {
        id: "new-note",
        label: t("launcher.newNote"),
        detail: t("launcher.newNoteDetail"),
        keywords: "new create note file",
        run: () => onCreateNote(""),
      },
      {
        id: "new-folder",
        label: t("launcher.newFolder"),
        detail: t("launcher.newFolderDetail"),
        keywords: "new create folder directory",
        run: onCreateFolder,
      },
      {
        id: "home",
        label: t("launcher.home"),
        detail: t("launcher.homeDetail"),
        keywords: "home start recent",
        run: onHome,
      },
      {
        id: "search",
        label: t("launcher.search"),
        detail: t("launcher.searchDetail"),
        keywords: "search find semantic lexical",
        run: () => onOpenPanel("search"),
      },
      {
        id: "files",
        label: t("launcher.files"),
        detail: t("launcher.filesDetail"),
        keywords: "files explorer tree",
        run: () => onOpenPanel("files"),
      },
      {
        id: "graph",
        label: t("launcher.graph"),
        detail: t("launcher.graphDetail"),
        keywords: "graph links connections",
        run: () => onOpenPanel("graph"),
      },
      {
        id: "tags",
        label: t("launcher.tags"),
        detail: t("launcher.tagsDetail"),
        keywords: "tags labels",
        run: () => onOpenPanel("tags"),
      },
      {
        id: "settings",
        label: t("launcher.settings"),
        detail: t("launcher.settingsDetail"),
        keywords: "settings preferences theme recovery",
        run: () => onOpenPanel("settings"),
      },
    ],
    [t, onCreateNote, onCreateFolder, onHome, onOpenPanel],
  );

  const noteResults = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) {
      const recent = recentNoteIds
        .map((id) => notes.find((note) => note.id === id))
        .filter((note): note is IndexedNote => note !== undefined);
      const remaining = notes.filter(
        (note) => !recentNoteIds.includes(note.id),
      );
      return [...recent, ...remaining].slice(0, 8);
    }

    return notes
      .map((note) => ({
        note,
        score: scoreNote(note, normalized),
      }))
      .filter((entry) => entry.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, 8)
      .map((entry) => entry.note);
  }, [notes, query, recentNoteIds]);

  const actionResults = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return actions.slice(0, 5);

    return actions
      .map((action) => ({
        action,
        score: scoreAction(action, normalized),
      }))
      .filter((entry) => entry.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, 6)
      .map((entry) => entry.action);
  }, [actions, query]);

  const exact = notes.some((note) => {
    const candidate = withoutMarkdownExtension(note.path).toLocaleLowerCase();
    return candidate === query.trim().toLocaleLowerCase();
  });

  const entries = useMemo<readonly LauncherEntry[]>(() => {
    const next: LauncherEntry[] = [
      ...noteResults.map((note) => ({ kind: "note", note }) as const),
      ...actionResults.map((action) => ({ kind: "action", action }) as const),
    ];
    if (query.trim() && !exact) {
      next.push({ kind: "create", name: query.trim() });
    }
    return next;
  }, [noteResults, actionResults, query, exact]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  if (!open) return null;

  function runEntry(entry: LauncherEntry | undefined) {
    if (!entry) return;
    if (entry.kind === "note") {
      onOpenNote(entry.note.id);
    } else if (entry.kind === "action") {
      entry.action.run();
    } else {
      onCreateNote(entry.name);
    }
    onClose();
  }

  return (
    <div
      className="dialog-backdrop switcher-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="quick-switcher command-palette"
        role="dialog"
        aria-modal="true"
        aria-label={t("launcher.aria")}
      >
        <div className="launcher-input-row">
          <span aria-hidden="true">⌕</span>
          <input
            autoFocus
            className="switcher-input"
            aria-label={t("launcher.inputAria")}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                onClose();
                return;
              }
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setSelectedIndex((current) =>
                  Math.min(entries.length - 1, current + 1),
                );
                return;
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setSelectedIndex((current) => Math.max(0, current - 1));
                return;
              }
              if (event.key === "Enter") {
                event.preventDefault();
                runEntry(entries[selectedIndex]);
              }
            }}
            placeholder={t("launcher.placeholder")}
          />
          <kbd>Esc</kbd>
        </div>

        <div className="switcher-results launcher-results" role="listbox">
          {noteResults.length > 0 ? (
            <>
              <span className="switcher-section">
                {query.trim() ? t("launcher.notes") : t("launcher.recent")}
              </span>
              {noteResults.map((note) => {
                const index = entries.findIndex(
                  (entry) => entry.kind === "note" && entry.note.id === note.id,
                );
                return (
                  <LauncherButton
                    key={`note-${note.id}`}
                    selected={index === selectedIndex}
                    buttonRef={(node) => {
                      if (index === selectedIndex) selectedRef.current = node;
                    }}
                    onClick={() => runEntry({ kind: "note", note })}
                  >
                    <span className="launcher-result-icon" aria-hidden="true">◇</span>
                    <span>
                      <strong>{note.title}</strong>
                      <small>{note.path}</small>
                    </span>
                  </LauncherButton>
                );
              })}
            </>
          ) : null}

          {actionResults.length > 0 ? (
            <>
              <span className="switcher-section">{t("launcher.actions")}</span>
              {actionResults.map((action) => {
                const index = entries.findIndex(
                  (entry) =>
                    entry.kind === "action" && entry.action.id === action.id,
                );
                return (
                  <LauncherButton
                    key={`action-${action.id}`}
                    selected={index === selectedIndex}
                    buttonRef={(node) => {
                      if (index === selectedIndex) selectedRef.current = node;
                    }}
                    onClick={() => runEntry({ kind: "action", action })}
                  >
                    <span className="launcher-result-icon" aria-hidden="true">›</span>
                    <span>
                      <strong>{action.label}</strong>
                      <small>{action.detail}</small>
                    </span>
                  </LauncherButton>
                );
              })}
            </>
          ) : null}

          {query.trim() && !exact ? (
            <>
              <span className="switcher-section">{t("launcher.create")}</span>
              <LauncherButton
                selected={selectedIndex === entries.length - 1}
                buttonRef={(node) => {
                  if (selectedIndex === entries.length - 1) {
                    selectedRef.current = node;
                  }
                }}
                onClick={() =>
                  runEntry({ kind: "create", name: query.trim() })
                }
              >
                <span className="launcher-result-icon" aria-hidden="true">＋</span>
                <span>
                  <strong>{t("switcher.create", { name: query.trim() })}</strong>
                  <small>{t("switcher.currentFolder")}</small>
                </span>
              </LauncherButton>
            </>
          ) : null}

          {entries.length === 0 ? (
            <p className="launcher-empty">{t("launcher.empty")}</p>
          ) : null}
        </div>

        <footer className="switcher-help">
          <span>↑↓ {t("launcher.navigateHelp")}</span>
          <span>↵ {t("launcher.openHelp")}</span>
          <span>Ctrl/Cmd K</span>
        </footer>
      </section>
    </div>
  );
}

function LauncherButton({
  selected,
  buttonRef,
  onClick,
  children,
}: {
  readonly selected: boolean;
  readonly buttonRef: (node: HTMLButtonElement | null) => void;
  readonly onClick: () => void;
  readonly children: React.ReactNode;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      className={`switcher-result launcher-result ${selected ? "selected" : ""}`}
      role="option"
      aria-selected={selected}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function scoreAction(action: LauncherAction, query: string): number {
  const label = action.label.toLocaleLowerCase();
  const detail = action.detail.toLocaleLowerCase();
  const keywords = action.keywords.toLocaleLowerCase();

  if (label === query) return 100;
  if (label.startsWith(query)) return 85;
  if (label.includes(query)) return 65;
  if (keywords.includes(query)) return 50;
  if (detail.includes(query)) return 35;
  return query
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => `${label} ${keywords} ${detail}`.includes(term))
    ? 20
    : 0;
}

function scoreNote(note: IndexedNote, query: string): number {
  const title = note.title.toLocaleLowerCase();
  const path = note.path.toLocaleLowerCase();
  const aliases = note.aliases.map((alias) => alias.toLocaleLowerCase());

  if (title === query || aliases.includes(query)) return 100;
  if (title.startsWith(query)) return 80;
  if (aliases.some((alias) => alias.startsWith(query))) return 70;
  if (title.includes(query)) return 60;
  if (path.includes(query)) return 45;
  if (aliases.some((alias) => alias.includes(query))) return 40;

  const terms = query.split(/\s+/).filter(Boolean);
  return terms.every((term) => path.includes(term)) ? 20 : 0;
}

function withoutMarkdownExtension(path: string): string {
  return path.toLocaleLowerCase().endsWith(".md")
    ? path.slice(0, -3)
    : path;
}
