import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  ADDONS,
  type AddonId,
  type AddonPreferences,
} from "./addons";
import {
  ENCRYPTION_CODEC_OPTIONS,
  readEncryptionPreferences,
  writeEncryptionPreferences,
  type EncryptionCodecId,
} from "./plugins/encryptionPreferences";

export function AddonSettings({
  preferences,
  loadingIds,
  onToggle,
}: {
  readonly preferences: AddonPreferences;
  readonly loadingIds: ReadonlySet<AddonId>;
  readonly onToggle: (id: AddonId, enabled: boolean) => void;
}) {
  const { t } = useTranslation();
  const [encryptionPreferences, setEncryptionPreferences] = useState(
    () => readEncryptionPreferences(),
  );

  function setEncryptionCodec(defaultCodec: EncryptionCodecId) {
    const next = { defaultCodec };
    writeEncryptionPreferences(next);
    setEncryptionPreferences(next);
  }

  return (
    <div className="addon-settings">
      <p className="sidebar-help">{t("addons.description")}</p>
      <div className="addon-settings-list">
        {ADDONS.map((addon) => {
          const enabled = preferences[addon.id];
          const loading = loadingIds.has(addon.id);
          return (
            <div className="addon-setting" key={addon.id}>
              <div className="addon-setting-copy">
                <strong>{t(addon.titleKey)}</strong>
                <small>{t(addon.descriptionKey)}</small>
              </div>
              <button
                type="button"
                className={`addon-toggle ${enabled ? "enabled" : ""}`}
                role="switch"
                aria-checked={enabled}
                aria-label={t("addons.toggle", {
                  name: t(addon.titleKey),
                })}
                disabled={loading}
                onClick={() => onToggle(addon.id, !enabled)}
              >
                <span className="addon-toggle-track" aria-hidden="true">
                  <span />
                </span>
                <span className="addon-toggle-state">
                  {loading
                    ? t("addons.loading")
                    : enabled
                      ? t("addons.enabled")
                      : t("addons.disabled")}
                </span>
              </button>
              {addon.id === "mindcontext.encryption" && enabled ? (
                <div className="addon-encryption-options">
                  <label>
                    <span>{t("encryption.defaultFormat")}</span>
                    <select
                      value={encryptionPreferences.defaultCodec}
                      onChange={(event) =>
                        setEncryptionCodec(
                          event.target.value as EncryptionCodecId,
                        )
                      }
                    >
                      {ENCRYPTION_CODEC_OPTIONS.map((option) => (
                        <option key={option.id} value={option.id}>
                          {t(option.labelKey)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <small>{t("encryption.compatibilityHint")}</small>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
