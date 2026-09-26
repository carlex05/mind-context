import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { StorageObjectMetadata, StorageProvider } from "@mind-context/storage";

import {
  cleanupResolvedRecoveryCopies,
  deleteRecoveryCopy,
  listRecoveryCopies,
  restoreRecoveryCopy,
  type RecoveryEntry,
  type RecoveryRetentionDays,
} from "./recovery";

const RETENTION_PREFIX = "mindcontext.recovery.retention.";

export function RecoverySettings({
  provider,
  workspaceId,
  onRestored,
}: {
  readonly provider: StorageProvider;
  readonly workspaceId: string;
  readonly onRestored: (metadata: StorageObjectMetadata) => Promise<void> | void;
}) {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<readonly RecoveryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string>();
  const [error, setError] = useState<string>();
  const [retention, setRetention] = useState<RecoveryRetentionDays>(() =>
    readRetention(workspaceId),
  );

  useEffect(() => {
    setRetention(readRetention(workspaceId));
    void refresh(true);
  }, [workspaceId, provider.id]);

  async function refresh(runCleanup = false) {
    setLoading(true);
    setError(undefined);
    try {
      if (runCleanup) {
        await cleanupResolvedRecoveryCopies(
          provider,
          readRetention(workspaceId),
        );
      }
      setEntries(await listRecoveryCopies(provider));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }

  async function changeRetention(value: RecoveryRetentionDays) {
    setRetention(value);
    window.localStorage.setItem(
      `${RETENTION_PREFIX}${workspaceId}`,
      String(value),
    );
    try {
      await cleanupResolvedRecoveryCopies(provider, value);
      setEntries(await listRecoveryCopies(provider));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  async function restore(entry: RecoveryEntry) {
    setBusyId(entry.metadata.id);
    setError(undefined);
    try {
      const metadata = await restoreRecoveryCopy(provider, entry);
      await onRestored(metadata);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusyId(undefined);
    }
  }

  async function remove(entry: RecoveryEntry) {
    if (!window.confirm(t("recovery.confirmDelete"))) return;
    setBusyId(entry.metadata.id);
    setError(undefined);
    try {
      await deleteRecoveryCopy(provider, entry);
      setEntries((current) =>
        current.filter((candidate) => candidate.metadata.id !== entry.metadata.id),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusyId(undefined);
    }
  }

  async function cleanResolvedNow() {
    setLoading(true);
    setError(undefined);
    try {
      const policy = readRetention(workspaceId);
      await cleanupResolvedRecoveryCopies(provider, policy);
      setEntries(await listRecoveryCopies(provider));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="recovery-settings">
      <p className="sidebar-help">{t("recovery.description")}</p>

      <div className="recovery-retention">
        <strong>{t("recovery.retention")}</strong>
        <select
          aria-label={t("recovery.retention")}
          value={String(retention)}
          onChange={(event) =>
            void changeRetention(parseRetention(event.target.value))
          }
        >
          <option value="30">{t("recovery.days30")}</option>
          <option value="90">{t("recovery.days90")}</option>
          <option value="never">{t("recovery.never")}</option>
        </select>
        <small className="sidebar-help">{t("recovery.retentionHelp")}</small>
      </div>

      <div className="recovery-toolbar">
        <button
          type="button"
          className="sidebar-text-action"
          onClick={() => void refresh()}
          disabled={loading}
        >
          {t("common.refresh")}
        </button>
        <button
          type="button"
          className="sidebar-text-action"
          onClick={() => void cleanResolvedNow()}
          disabled={loading || retention === "never"}
        >
          {t("recovery.cleanNow")}
        </button>
      </div>

      {error ? <p className="recovery-error">{error}</p> : null}
      {loading ? (
        <p className="sidebar-help">{t("recovery.loading")}</p>
      ) : entries.length === 0 ? (
        <p className="sidebar-help">{t("recovery.empty")}</p>
      ) : (
        <div className="recovery-list">
          {entries.map((entry) => (
            <article className="recovery-item" key={entry.metadata.id}>
              <div className="recovery-item-copy">
                <strong>{entry.sourceName}</strong>
                <small>
                  {entry.resolvedAt
                    ? t("recovery.resolved", {
                        date: formatRecoveryDate(entry.resolvedAt),
                      })
                    : t("recovery.unresolved")}
                </small>
                <small>
                  {entry.kind === "remote-before-overwrite"
                    ? t("recovery.remoteBackup")
                    : t("recovery.localBackup")}
                </small>
              </div>
              <div className="recovery-item-actions">
                <button
                  type="button"
                  className="sidebar-call-to-action"
                  onClick={() => void restore(entry)}
                  disabled={busyId === entry.metadata.id}
                >
                  {t("recovery.restore")}
                </button>
                <button
                  type="button"
                  className="sidebar-text-action danger"
                  onClick={() => void remove(entry)}
                  disabled={busyId === entry.metadata.id}
                >
                  {t("recovery.delete")}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function readRetention(workspaceId: string): RecoveryRetentionDays {
  return parseRetention(
    window.localStorage.getItem(`${RETENTION_PREFIX}${workspaceId}`) ?? "30",
  );
}

function parseRetention(value: string): RecoveryRetentionDays {
  if (value === "90") return 90;
  if (value === "never") return "never";
  return 30;
}

function formatRecoveryDate(value: number): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
