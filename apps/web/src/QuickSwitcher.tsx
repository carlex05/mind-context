import { useEffect, useMemo, useState } from "react";
import type { IndexedNote } from "@mind-context/knowledge";

export function QuickSwitcher({
  open,
  notes,
  recentNoteIds,
  onClose,
  onOpenNote,
  onCreateNote,
}: {
  readonly open: boolean;
  readonly notes: readonly IndexedNote[];
  readonly recentNoteIds: readonly string[];
  readonly onClose: () => void;
  readonly onOpenNote: (id: string) => void;
  readonly onCreateNote: (name: string) => void;
}) {
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (open) setQuery("");
  }, [open]);

  const results = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) {
      const recent = recentNoteIds
        .map((id) => notes.find((note) => note.id === id))
        .filter((note): note is IndexedNote => note !== undefined);
      const remaining = notes.filter(
        (note) => !recentNoteIds.includes(note.id),
      );
      return [...recent, ...remaining].slice(0, 12);
    }

    return notes
      .map((note) => ({
        note,
        score: scoreNote(note, normalized),
      }))
      .filter((entry) => entry.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, 12)
      .map((entry) => entry.note);
  }, [notes, query, recentNoteIds]);

  if (!open) return null;

  const exact = notes.some((note) => {
    const candidate = withoutMarkdownExtension(note.path).toLocaleLowerCase();
    return candidate === query.trim().toLocaleLowerCase();
  });

  function chooseFirst() {
    const first = results[0];
    if (first) {
      onOpenNote(first.id);
      onClose();
      return;
    }
    if (query.trim()) {
      onCreateNote(query.trim());
      onClose();
    }
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
        className="quick-switcher"
        role="dialog"
        aria-modal="true"
        aria-label="Quick switcher"
      >
        <input
          autoFocus
          className="switcher-input"
          aria-label="Open or create note"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") onClose();
            if (event.key === "Enter") chooseFirst();
          }}
          placeholder="Open or create a note…"
        />
        <div className="switcher-results" role="listbox">
          {!query.trim() ? (
            <span className="switcher-section">Recent notes</span>
          ) : null}
          {results.map((note) => (
            <button
              type="button"
              className="switcher-result"
              key={note.id}
              onClick={() => {
                onOpenNote(note.id);
                onClose();
              }}
            >
              <span>{note.title}</span>
              <small>{note.path}</small>
            </button>
          ))}
          {query.trim() && !exact ? (
            <button
              type="button"
              className="switcher-result create-result"
              onClick={() => {
                onCreateNote(query.trim());
                onClose();
              }}
            >
              <span>+ Create “{query.trim()}”</span>
              <small>in the current folder</small>
            </button>
          ) : null}
        </div>
        <footer className="switcher-help">
          <span>↵ open</span>
          <span>Esc close</span>
          <span>Ctrl/Cmd O</span>
        </footer>
      </section>
    </div>
  );
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
