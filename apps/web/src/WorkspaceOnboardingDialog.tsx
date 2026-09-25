import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import type {
  TemplateLocale,
  WorkspaceStarter,
} from "./workspaceTemplates";

export type WorkspaceOnboardingMode = "create" | "empty-existing";

export function WorkspaceOnboardingDialog({
  open,
  mode,
  workspaceName,
  initialLocale,
  submitting,
  onClose,
  onSubmit,
}: {
  readonly open: boolean;
  readonly mode: WorkspaceOnboardingMode;
  readonly workspaceName: string;
  readonly initialLocale: TemplateLocale;
  readonly submitting: boolean;
  readonly onClose: () => void;
  readonly onSubmit: (
    starter: WorkspaceStarter,
    locale: TemplateLocale,
  ) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [starter, setStarter] = useState<WorkspaceStarter>(
    mode === "create" ? "blank" : "para",
  );
  const [locale, setLocale] = useState<TemplateLocale>(initialLocale);

  useEffect(() => {
    if (!open) return;
    setStarter(mode === "create" ? "blank" : "para");
    setLocale(initialLocale);
  }, [open, mode, initialLocale]);

  if (!open) return null;

  const submitLabel =
    mode === "create"
      ? t("onboarding.create")
      : starter === "blank"
        ? t("onboarding.keepBlank")
        : t("onboarding.buildPara");

  return (
    <div
      className="dialog-backdrop onboarding-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (!submitting && event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="dialog-sheet onboarding-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="workspace-onboarding-title"
      >
        <div className="dialog-heading">
          <div>
            <span className="section-label">
              {mode === "create"
                ? t("onboarding.newBrain")
                : t("onboarding.emptyBrain")}
            </span>
            <h2 id="workspace-onboarding-title">
              {mode === "create"
                ? t("onboarding.title")
                : t("onboarding.emptyTitle")}
            </h2>
          </div>
          <button
            className="icon-button quiet"
            type="button"
            aria-label={t("common.close")}
            disabled={submitting}
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <p className="onboarding-intro">
          {mode === "create"
            ? t("onboarding.intro", { name: workspaceName })
            : t("onboarding.emptyIntro", { name: workspaceName })}
        </p>

        <fieldset className="starter-options">
          <legend>{t("onboarding.startWith")}</legend>

          <button
            type="button"
            className={starter === "blank" ? "starter-card selected" : "starter-card"}
            aria-pressed={starter === "blank"}
            disabled={submitting}
            onClick={() => setStarter("blank")}
          >
            <span className="starter-radio" aria-hidden="true">
              {starter === "blank" ? "●" : "○"}
            </span>
            <span>
              <strong>{t("onboarding.blankTitle")}</strong>
              <small>
                {mode === "create"
                  ? t("onboarding.blankDescription")
                  : t("onboarding.keepBlankDescription")}
              </small>
            </span>
          </button>

          <button
            type="button"
            className={starter === "para" ? "starter-card selected" : "starter-card"}
            aria-pressed={starter === "para"}
            disabled={submitting}
            onClick={() => setStarter("para")}
          >
            <span className="starter-radio" aria-hidden="true">
              {starter === "para" ? "●" : "○"}
            </span>
            <span>
              <strong>PARA</strong>
              <small>{t("onboarding.paraDescription")}</small>
            </span>
          </button>
        </fieldset>

        {starter === "para" ? (
          <label className="field onboarding-language">
            <span>{t("onboarding.templateLanguage")}</span>
            <select
              value={locale}
              disabled={submitting}
              onChange={(event) =>
                setLocale(event.target.value as TemplateLocale)
              }
            >
              <option value="en">{t("common.english")}</option>
              <option value="es">{t("common.spanish")}</option>
            </select>
            <small>{t("onboarding.languageHint")}</small>
          </label>
        ) : null}

        {starter === "para" ? (
          <div className="onboarding-preview">
            <span className="section-label">{t("onboarding.creates")}</span>
            <pre>
              {locale === "es"
                ? "Empieza aquí.md\nProyectos/\nÁreas/\nRecursos/\nArchivo/"
                : "Start Here.md\nProjects/\nAreas/\nResources/\nArchive/"}
            </pre>
            <small>{t("onboarding.openFormat")}</small>
          </div>
        ) : null}

        <div className="dialog-actions">
          <button
            className="secondary-button"
            type="button"
            disabled={submitting}
            onClick={onClose}
          >
            {t("common.cancel")}
          </button>
          <button
            className="primary-button"
            type="button"
            disabled={submitting}
            onClick={() => void onSubmit(starter, locale)}
          >
            {submitting ? t("onboarding.working") : submitLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
