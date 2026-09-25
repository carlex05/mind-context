import { useEffect, useRef, useState } from "react";
import type {
  SearchHit,
  SearchService,
} from "@mind-context/search";

export type SemanticUiState =
  | { readonly kind: "disabled" }
  | { readonly kind: "preparing"; readonly message: string }
  | { readonly kind: "ready"; readonly message: string }
  | { readonly kind: "error"; readonly message: string };

export function SearchPanel({
  service,
  semantic,
  onEnableSemantic,
  onOpenNote,
}: {
  readonly service: SearchService | undefined;
  readonly semantic: SemanticUiState;
  readonly onEnableSemantic: () => void;
  readonly onOpenNote: (noteId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<readonly SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    const text = query.trim();

    if (!text || !service) {
      setResults([]);
      setSearching(false);
      return () => {
        cancelled = true;
      };
    }

    setSearching(true);
    const timer = window.setTimeout(() => {
      void service
        .search({ text, limit: 40 })
        .then((next) => {
          if (!cancelled) setResults(next);
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 80);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [service, query]);

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

      <SemanticSearchCard
        state={semantic}
        onEnable={onEnableSemantic}
      />

      {!query.trim() ? (
        <div className="search-empty">
          <strong>Search your brain</strong>
          <p>
            Titles, aliases, tags, headings, paths and Markdown contents are
            searched locally in this browser.
          </p>
          <small>
            {semantic.kind === "ready"
              ? "Hybrid ranking combines lexical and local semantic search."
              : "Lexical search works without loading an AI model."}
          </small>
        </div>
      ) : searching ? (
        <div className="search-empty">
          <strong>Searching locally…</strong>
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
            {semantic.kind === "ready" ? " · hybrid" : " · lexical"}
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
                <span className="search-result-path">
                  {result.path}
                  {result.heading ? ` · ${result.heading}` : ""}
                </span>
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

function SemanticSearchCard({
  state,
  onEnable,
}: {
  readonly state: SemanticUiState;
  readonly onEnable: () => void;
}) {
  if (state.kind === "disabled") {
    return (
      <div className="semantic-search-card">
        <div>
          <strong>Semantic search</strong>
          <span>Optional · runs on this device</span>
        </div>
        <p>
          Find related ideas even when they use different words. The first use
          downloads a multilingual embedding model to the browser cache.
        </p>
        <button type="button" onClick={onEnable}>
          Enable local semantic search
        </button>
      </div>
    );
  }

  return (
    <div className={`semantic-search-status ${state.kind}`} role="status">
      <span className="semantic-status-dot" aria-hidden="true" />
      <span>{state.message}</span>
    </div>
  );
}
