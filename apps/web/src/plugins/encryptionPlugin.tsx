import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { ExtensionContext } from "@mind-context/extension-api";

import i18n from "../i18n";
import type { WebExtensionBundle } from "../extensions/ExtensionHost";
import {
  decryptText,
  encryptText,
  parseEncryptedPayload,
  serializeEncryptedBlock,
} from "./encryptionCrypto";

const BLOCK_LANGUAGE = "mindcontext-encrypted";
const RENDERER_ID = "mindcontext-encrypted";

export const encryptionPlugin: WebExtensionBundle = {
  extension: {
    manifest: {
      id: "mindcontext.encryption",
      name: "Encryption",
      version: "0.1.0",
      capabilities: [
        "editor.read.selection",
        "editor.write.selection",
        "ui.prompt.secret",
        "commands.register",
        "markdown.register",
      ],
    },

    async activate(context: ExtensionContext) {
      context.markdown.registerBlockRenderer({
        id: RENDERER_ID,
        languages: [BLOCK_LANGUAGE],
      });

      context.commands.register({
        id: "mindcontext.encryption.encrypt-selection",
        title: String(i18n.t("encryption.encryptSelection")),
        icon: "🔒",
        keywords: ["encrypt", "encryption", "secure", "private", "cifrar", "privado"],
        toolbar: true,
        slash: true,
        handler: async () => {
          const selection = await context.editor.readSelection();
          if (!selection || selection.empty || selection.text.length === 0) {
            return;
          }

          const passphrase = await context.ui.promptSecret({
            title: String(i18n.t("encryption.encryptSelection")),
            message: String(i18n.t("encryption.passphraseHelp")),
            inputLabel: String(i18n.t("encryption.passphrase")),
            confirm: true,
            confirmLabel: String(i18n.t("encryption.confirmPassphrase")),
            cancelLabel: String(i18n.t("common.cancel")),
            mismatchMessage: String(i18n.t("encryption.mismatch")),
          });
          if (!passphrase) return;

          const encrypted = await encryptText(selection.text, passphrase);
          await context.editor.replaceSelection(
            serializeEncryptedBlock(encrypted),
          );
        },
      });
    },

    async deactivate() {
      // Registrations are disposed by the host.
    },
  },

  markdownBlocks: [
    {
      rendererId: RENDERER_ID,
      component: EncryptedMarkdownBlock,
    },
  ],
};

export function EncryptedMarkdownBlock({
  content,
}: {
  readonly content: string;
}) {
  const { t } = useTranslation();
  const payload = parseEncryptedPayload(content);
  const [open, setOpen] = useState(false);
  const [passphrase, setPassphrase] = useState("");
  const [plaintext, setPlaintext] = useState<string>();
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  function closeDialog() {
    setOpen(false);
    setPassphrase("");
    setPlaintext(undefined);
    setError(false);
    setBusy(false);
  }

  async function decrypt() {
    if (!payload || !passphrase || busy) return;
    setBusy(true);
    setError(false);
    try {
      const decrypted = await decryptText(payload, passphrase);
      setPlaintext(decrypted);
      setPassphrase("");
    } catch {
      setPlaintext(undefined);
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  if (!payload) {
    return (
      <div className="encrypted-block encrypted-block-invalid">
        <span aria-hidden="true">🔒</span>
        <span>{t("encryption.invalidBlock")}</span>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        className="encrypted-block"
        aria-label={t("encryption.unlock")}
        onClick={() => setOpen(true)}
      >
        <span className="encrypted-block-lock" aria-hidden="true">🔒</span>
        <span className="encrypted-block-copy">
          <strong>{t("encryption.encryptedContent")}</strong>
          <small>{t("encryption.unlockHint")}</small>
        </span>
      </button>

      {open ? (
        <div
          className="encrypted-dialog-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) closeDialog();
          }}
        >
          <section
            className="encrypted-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="encrypted-dialog-title"
          >
            <header>
              <div>
                <span className="encrypted-dialog-lock" aria-hidden="true">🔒</span>
                <div>
                  <strong id="encrypted-dialog-title">
                    {t("encryption.encryptedContent")}
                  </strong>
                  <span>{t("encryption.localOnly")}</span>
                </div>
              </div>
              <button
                type="button"
                className="encrypted-dialog-close"
                aria-label={t("common.close")}
                onClick={closeDialog}
              >
                ×
              </button>
            </header>

            {plaintext === undefined ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void decrypt();
                }}
              >
                <label>
                  <span>{t("encryption.passphrase")}</span>
                  <input
                    autoFocus
                    type="password"
                    autoComplete="off"
                    value={passphrase}
                    onChange={(event) => {
                      setPassphrase(event.target.value);
                      setError(false);
                    }}
                  />
                </label>
                {error ? (
                  <p className="encrypted-dialog-error" role="alert">
                    {t("encryption.wrongPassphrase")}
                  </p>
                ) : null}
                <div className="encrypted-dialog-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={closeDialog}
                  >
                    {t("common.cancel")}
                  </button>
                  <button
                    type="submit"
                    className="primary-button"
                    disabled={!passphrase || busy}
                  >
                    {busy
                      ? t("encryption.decrypting")
                      : t("encryption.decrypt")}
                  </button>
                </div>
              </form>
            ) : (
              <>
                <pre className="encrypted-dialog-plaintext">{plaintext}</pre>
                <div className="encrypted-dialog-actions">
                  <button
                    type="button"
                    className="primary-button"
                    onClick={closeDialog}
                  >
                    {t("common.close")}
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      ) : null}
    </>
  );
}
