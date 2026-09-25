import { useMemo, useRef, useState } from "react";
import type { LexicalSearchIndex } from "@mind-context/search";

export function SearchPanel({
  index,
  onOpenNote,
}: {
  readonly index: LexicalSearchIndex | undefined;
  readonly onOpenNote: (noteId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(
    () => index?.searchSync({ text: query, limit: 40 }) ?? [],
    [index, query],
  );

  return (
    <section className="search-panel" aria-label="Search notes">
      <div className="search-input-wrap">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-4-4" />
        </svg>
        <input
          ref={inputRef}
          type="search"
          aria-label="Search notes"
          placeholder="Search notes…"
          value={query}
          autoFocus
          onChange={(event) => setQuery(event.target.value)}
        />
        {query ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
          >
            ×
          </button>
        ) : null}
      </div>

      {!query.trim() ? (
        <div className="search-empty">
          <strong>Search your brain</strong>
          <p>
            Titles, aliases, tags, headings, paths and Markdown contents are
            searched locally in this browser.
          </p>
          <small>No network request is made while you type.</small>
        </div>
      ) : results.length === 0 ? (
        <div className="search-empty">
          <strong>No matches</strong>
          <p>Try fewer words or a different spelling.</p>
        </div>
      ) : (
        <>
          <div className="search-results-meta">
            {results.length} result{results.length === 1 ? "" : "s"}
          </div>
          <div className="search-results">
            {results.map((result) => (
              <button
                type="button"
                className="search-result"
                key={result.noteId}
                onClick={() => onOpenNote(result.noteId)}
              >
                <span className="search-result-title">{result.title}</span>
                <span className="search-result-path">{result.path}</span>
                {result.excerpt ? (
                  <span className="search-result-excerpt">
                    {result.excerpt}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
