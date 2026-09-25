import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  applyLocalePreference,
  readLocalePreference,
  type LocalePreference,
} from "./i18n";

export function LanguageSelector({
  compact = false,
}: {
  readonly compact?: boolean;
}) {
  const { t } = useTranslation();
  const [preference, setPreference] = useState<LocalePreference>(
    () => readLocalePreference(),
  );

  const options: readonly {
    readonly value: LocalePreference;
    readonly label: string;
  }[] = [
    { value: "system", label: t("common.system") },
    { value: "en", label: t("common.english") },
    { value: "es", label: t("common.spanish") },
  ];

  return (
    <div
      className={compact ? "language-selector compact" : "language-selector"}
      aria-label={t("settings.language")}
    >
      {options.map((option) => (
        <button
          type="button"
          className={preference === option.value ? "selected" : ""}
          aria-pressed={preference === option.value}
          key={option.value}
          onClick={() => {
            setPreference(option.value);
            void applyLocalePreference(option.value);
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
