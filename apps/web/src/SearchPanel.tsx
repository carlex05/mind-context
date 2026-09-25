import { useEffect, useRef, useState } from "react";
import type {
  SearchHit,
  SearchService,
} from "@mind-context/search";
import { useTranslation } from "react-i18next";

export type SemanticUiState =
  | { readonly kind: "disabled" }
  | {
      readonly kind: "preparing";
      readonly stage:
        | "initialize"
        | "preparing"
        | "checking"
        | "loading-model"
        | "downloading-model"
        | "model-ready";
      readonly percent?: number;
      readonly runtime?: "webgpu" | "wasm";
    }
  | {
      readonly kind: "ready";
      readonly reused: number;
      readonly created: number;
      readonly runtime?: "webgpu" | "wasm";
    }
  | { readonly kind: "error"; readonly error: string };

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
  const { t } = useTranslation();
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
    <section className="search-panel" aria-label={t("search.aria")}>
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
          aria-label={t("search.aria")}
          placeholder={t("search.placeholder")}
          value={query}
          autoFocus
          onChange={(event) => setQuery(event.target.value)}
        />
        {query ? (
          <button
            type="button"
            aria-label={t("search.clear")}
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
          <strong>{t("search.introTitle")}</strong>
          <p>{t("search.intro")}</p>
          <small>
            {semantic.kind === "ready"
              ? t("search.hybridHint")
              : t("search.lexicalHint")}
          </small>
        </div>
      ) : searching ? (
        <div className="search-empty">
          <strong>{t("search.searching")}</strong>
        </div>
      ) : results.length === 0 ? (
        <div className="search-empty">
          <strong>{t("search.noMatches")}</strong>
          <p>{t("search.noMatchesHint")}</p>
        </div>
      ) : (
        <>
          <div className="search-results-meta">
            {t("search.results", { count: results.length })}
            {" · "}
            {semantic.kind === "ready"
              ? t("search.modeHybrid")
              : t("search.modeLexical")}
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
  const { t } = useTranslation();

  if (state.kind === "disabled") {
    return (
      <div className="semantic-search-card">
        <div>
          <strong>{t("semantic.title")}</strong>
          <span>{t("semantic.optionalLocal")}</span>
        </div>
        <p>{t("semantic.description")}</p>
        <button type="button" onClick={onEnable}>
          {t("semantic.enable")}
        </button>
      </div>
    );
  }

  return (
    <div className={`semantic-search-status ${state.kind}`} role="status">
      <span className="semantic-status-dot" aria-hidden="true" />
      <span>{semanticMessage(state, t)}</span>
    </div>
  );
}


function semanticMessage(
  state: Exclude<SemanticUiState, { readonly kind: "disabled" }>,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  if (state.kind === "error") {
    return t("semantic.unavailable", { error: state.error });
  }

  if (state.kind === "ready") {
    return state.runtime
      ? t("semantic.readyRuntime", {
          reused: state.reused,
          created: state.created,
          runtime: state.runtime.toUpperCase(),
        })
      : t("semantic.ready", {
          reused: state.reused,
          created: state.created,
        });
  }

  switch (state.stage) {
    case "initialize":
      return t("semantic.initializeWorkspace");
    case "preparing":
      return t("semantic.preparing");
    case "checking":
      return t("semantic.checking");
    case "loading-model":
      return t("semantic.loadingModel");
    case "downloading-model":
      return state.percent === undefined
        ? t("semantic.downloadingModel")
        : t("semantic.downloadingModelPercent", {
            percent: state.percent,
          });
    case "model-ready":
      return state.runtime === "webgpu"
        ? t("semantic.modelReadyWebgpu")
        : t("semantic.modelReadyWasm");
  }
}
