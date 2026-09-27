import { useMemo } from "react";
import type { IndexedNote } from "@mind-context/knowledge";
import { useTranslation } from "react-i18next";

export function WorkspaceHome({
  workspaceName,
  notes,
  recentNoteIds,
  onOpenNote,
  onOpenLauncher,
  onCreateNote,
}: {
  readonly workspaceName: string;
  readonly notes: readonly IndexedNote[];
  readonly recentNoteIds: readonly string[];
  readonly onOpenNote: (noteId: string) => void;
  readonly onOpenLauncher: () => void;
  readonly onCreateNote: () => void;
}) {
  const { t, i18n } = useTranslation();

  const recent = useMemo(
    () =>
      recentNoteIds
        .map((id) => notes.find((note) => note.id === id))
        .filter((note): note is IndexedNote => note !== undefined)
        .slice(0, 6),
    [notes, recentNoteIds],
  );

  const recentlyModified = useMemo(
    () =>
      [...notes]
        .filter((note) => note.modifiedAt)
        .sort(
          (left, right) =>
            Date.parse(right.modifiedAt ?? "") - Date.parse(left.modifiedAt ?? ""),
        )
        .filter((note) => !recent.some((item) => item.id === note.id))
        .slice(0, 6),
    [notes, recent],
  );

  return (
    <div className="workspace-home">
      <header className="workspace-home-hero">
        <span className="section-label">{workspaceName}</span>
        <h1>{t("home.title")}</h1>
        <p>{t("home.subtitle")}</p>
        <button
          type="button"
          className="home-search-trigger"
          onClick={onOpenLauncher}
        >
          <span aria-hidden="true">⌕</span>
          <span>{t("home.search")}</span>
          <kbd>Ctrl K</kbd>
        </button>
      </header>

      <div className="workspace-home-actions">
        <button type="button" className="home-action-card" onClick={onCreateNote}>
          <span className="home-action-icon" aria-hidden="true">＋</span>
          <span>
            <strong>{t("home.newNote")}</strong>
            <small>{t("home.newNoteHint")}</small>
          </span>
        </button>
        <button type="button" className="home-action-card" onClick={onOpenLauncher}>
          <span className="home-action-icon" aria-hidden="true">⌘</span>
          <span>
            <strong>{t("home.commands")}</strong>
            <small>{t("home.commandsHint")}</small>
          </span>
        </button>
      </div>

      {notes.length === 0 ? (
        <section className="workspace-home-empty">
          <h2>{t("home.emptyTitle")}</h2>
          <p>{t("home.emptyBody")}</p>
          <button type="button" className="primary-button" onClick={onCreateNote}>
            {t("home.createFirst")}
          </button>
        </section>
      ) : (
        <div className="workspace-home-sections">
          <HomeNoteSection
            title={t("home.recent")}
            notes={recent}
            empty={t("home.noRecent")}
            locale={i18n.resolvedLanguage ?? "en"}
            onOpenNote={onOpenNote}
          />
          <HomeNoteSection
            title={t("home.modified")}
            notes={recentlyModified}
            empty={t("home.noModified")}
            locale={i18n.resolvedLanguage ?? "en"}
            onOpenNote={onOpenNote}
          />
        </div>
      )}
    </div>
  );
}

function HomeNoteSection({
  title,
  notes,
  empty,
  locale,
  onOpenNote,
}: {
  readonly title: string;
  readonly notes: readonly IndexedNote[];
  readonly empty: string;
  readonly locale: string;
  readonly onOpenNote: (noteId: string) => void;
}) {
  return (
    <section className="home-note-section">
      <h2>{title}</h2>
      {notes.length === 0 ? (
        <p className="home-section-empty">{empty}</p>
      ) : (
        <div className="home-note-list">
          {notes.map((note) => (
            <button
              type="button"
              className="home-note-row"
              key={note.id}
              onClick={() => onOpenNote(note.id)}
            >
              <span>
                <strong>{note.title}</strong>
                <small>{note.path}</small>
              </span>
              <time dateTime={note.modifiedAt}>
                {formatModified(note.modifiedAt, locale)}
              </time>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function formatModified(value: string | undefined, locale: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const deltaMs = Date.now() - date.getTime();
  const minutes = Math.round(deltaMs / 60_000);
  const relative = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });

  if (Math.abs(minutes) < 60) {
    return relative.format(-minutes, "minute");
  }

  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) {
    return relative.format(-hours, "hour");
  }

  const days = Math.round(hours / 24);
  if (Math.abs(days) < 7) {
    return relative.format(-days, "day");
  }

  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
  }).format(date);
}
