import { useEffect, useId, useState } from "react";
import type { SecretPromptRequest } from "@mind-context/extension-api";

export function SecretPromptDialog({
  request,
  onResolve,
}: {
  readonly request: SecretPromptRequest | undefined;
  readonly onResolve: (value: string | undefined) => void;
}) {
  const titleId = useId();
  const [value, setValue] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [mismatch, setMismatch] = useState(false);

  useEffect(() => {
    setValue("");
    setConfirmation("");
    setMismatch(false);
  }, [request]);

  useEffect(() => {
    if (!request) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onResolve(undefined);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [request, onResolve]);

  if (!request) return null;

  const submit = () => {
    if (!value) return;
    if (request.confirm && value !== confirmation) {
      setMismatch(true);
      return;
    }
    onResolve(value);
  };

  return (
    <div
      className="secret-prompt-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onResolve(undefined);
      }}
    >
      <section
        className="secret-prompt-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header>
          <strong id={titleId}>{request.title}</strong>
        </header>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          {request.message ? <p>{request.message}</p> : null}

          <label>
            <span>{request.inputLabel ?? request.title}</span>
            <input
              autoFocus
              type="password"
              autoComplete="new-password"
              value={value}
              onChange={(event) => {
                setValue(event.target.value);
                setMismatch(false);
              }}
            />
          </label>

          {request.confirm ? (
            <label>
              <span>{request.confirmLabel ?? request.title}</span>
              <input
                type="password"
                autoComplete="new-password"
                value={confirmation}
                onChange={(event) => {
                  setConfirmation(event.target.value);
                  setMismatch(false);
                }}
              />
            </label>
          ) : null}

          {mismatch ? (
            <p className="secret-prompt-error" role="alert">
              {request.mismatchMessage ?? "The values do not match."}
            </p>
          ) : null}

          <div className="secret-prompt-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={() => onResolve(undefined)}
            >
              {request.cancelLabel ?? "Cancel"}
            </button>
            <button
              type="submit"
              className="primary-button"
              disabled={!value || (request.confirm === true && !confirmation)}
            >
              {request.title}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
