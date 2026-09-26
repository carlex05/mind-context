import type {
  StorageObjectMetadata,
  StorageProvider,
} from "@mind-context/storage";

export const RECOVERY_FOLDER_NAME = ".mindcontext-recovery";

export type RecoveryKind = "local-conflict" | "remote-before-overwrite";
export type RecoveryRetentionDays = 30 | 90 | "never";

export interface RecoveryCopyRequest {
  readonly source: StorageObjectMetadata;
  readonly content: string;
  readonly kind: RecoveryKind;
  readonly baseRevision?: string;
  readonly remoteRevision?: string;
}

export interface RecoveryCopyResult {
  readonly metadata: StorageObjectMetadata;
  readonly created: boolean;
}

export interface RecoveryEntry {
  readonly metadata: StorageObjectMetadata;
  readonly sourceName: string;
  readonly kind?: RecoveryKind;
  readonly resolvedAt?: number;
}

export function isRecoveryDirectory(
  item: Pick<StorageObjectMetadata, "kind" | "name">,
): boolean {
  return item.kind === "directory" && item.name === RECOVERY_FOLDER_NAME;
}

export async function createRecoveryCopy(
  provider: StorageProvider,
  request: RecoveryCopyRequest,
): Promise<RecoveryCopyResult> {
  const folder = await ensureRecoveryFolder(provider);
  const fingerprint = await contentFingerprint(request.content);
  const name = recoveryFileName(request, fingerprint);
  const existing = (await provider.list(folder.id)).find(
    (item) => item.kind === "file" && item.name === name,
  );

  if (existing) {
    return { metadata: existing, created: false };
  }

  const metadata = await provider.createText(folder.id, name, request.content);
  return { metadata, created: true };
}

export async function listRecoveryCopies(
  provider: StorageProvider,
): Promise<readonly RecoveryEntry[]> {
  const folder = await findRecoveryFolder(provider);
  if (!folder) return [];

  const entries = (await provider.list(folder.id))
    .filter((item) => item.kind === "file" && item.name.endsWith(".md"))
    .map(toRecoveryEntry)
    .sort((left, right) => {
      const leftTime = recoveryTimestamp(left);
      const rightTime = recoveryTimestamp(right);
      return rightTime - leftTime;
    });

  return entries;
}

export async function readRecoveryCopy(
  provider: StorageProvider,
  entry: RecoveryEntry,
): Promise<string> {
  return provider.readText(entry.metadata.id);
}

export async function deleteRecoveryCopy(
  provider: StorageProvider,
  entry: RecoveryEntry,
): Promise<void> {
  await provider.delete(entry.metadata.id);
}

export async function restoreRecoveryCopy(
  provider: StorageProvider,
  entry: RecoveryEntry,
): Promise<StorageObjectMetadata> {
  const content = await readRecoveryCopy(provider, entry);
  const suffix = new Date().toISOString().replace(/[:.]/g, "-");
  const name = `${entry.sourceName} (Recovered ${suffix})`;
  return provider.createText(provider.rootId, name, content);
}

export async function markRecoveryCopiesResolved(
  provider: StorageProvider,
  entries: readonly StorageObjectMetadata[],
): Promise<void> {
  const resolvedAt = Date.now();
  await Promise.all(
    entries.map(async (entry) => {
      if (entry.name.startsWith("resolved--")) return;
      const parentId = entry.parentIds[0];
      if (!parentId) return;
      await provider.move(
        entry.id,
        parentId,
        `resolved--${resolvedAt}--${entry.name}`,
      );
    }),
  );
}

export async function markRecoveryCopiesResolvedForSource(
  provider: StorageProvider,
  sourceName: string,
): Promise<void> {
  const entries = await listRecoveryCopies(provider);
  const matching = entries
    .filter(
      (entry) =>
        entry.resolvedAt === undefined && entry.sourceName === sourceName,
    )
    .map((entry) => entry.metadata);
  await markRecoveryCopiesResolved(provider, matching);
}

export async function cleanupResolvedRecoveryCopies(
  provider: StorageProvider,
  retention: RecoveryRetentionDays,
  now = Date.now(),
): Promise<number> {
  if (retention === "never") return 0;

  const threshold = now - retention * 24 * 60 * 60 * 1000;
  const entries = await listRecoveryCopies(provider);
  const expired = entries.filter(
    (entry) => entry.resolvedAt !== undefined && entry.resolvedAt < threshold,
  );
  await Promise.all(expired.map((entry) => provider.delete(entry.metadata.id)));
  return expired.length;
}

async function findRecoveryFolder(
  provider: StorageProvider,
): Promise<StorageObjectMetadata | undefined> {
  const rootItems = await provider.list(provider.rootId);
  return rootItems.find(isRecoveryDirectory);
}

async function ensureRecoveryFolder(
  provider: StorageProvider,
): Promise<StorageObjectMetadata> {
  const existing = await findRecoveryFolder(provider);
  if (existing) return existing;
  return provider.createDirectory(provider.rootId, RECOVERY_FOLDER_NAME);
}

function recoveryTimestamp(entry: RecoveryEntry): number {
  if (entry.resolvedAt !== undefined) return entry.resolvedAt;
  const parsed = Date.parse(entry.metadata.modifiedAt ?? "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function toRecoveryEntry(metadata: StorageObjectMetadata): RecoveryEntry {
  const resolvedMatch = /^resolved--(\d+)--(.+)$/.exec(metadata.name);
  const rawName = resolvedMatch?.[2] ?? metadata.name;
  const kindMatch =
    /^(.*)\.(local-conflict|remote-before-overwrite)\.base-/.exec(rawName);
  const sourceName = (kindMatch?.[1] ?? rawName.replace(/\.md$/i, "")).trim();

  return {
    metadata,
    sourceName,
    ...(kindMatch?.[2]
      ? { kind: kindMatch[2] as RecoveryKind }
      : {}),
    ...(resolvedMatch
      ? { resolvedAt: Number.parseInt(resolvedMatch[1]!, 10) }
      : {}),
  };
}

function recoveryFileName(
  request: RecoveryCopyRequest,
  fingerprint: string,
): string {
  const stem = sanitizeStem(request.source.name.replace(/\.md$/i, ""));
  const base = safeRevision(request.baseRevision);
  const remote = safeRevision(request.remoteRevision);
  return `${stem}.${request.kind}.base-${base}.remote-${remote}.${fingerprint.slice(0, 12)}.md`;
}

function sanitizeStem(value: string): string {
  const sanitized = value
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  return (sanitized || "note").slice(0, 96);
}

function safeRevision(value: string | undefined): string {
  return (value ?? "unknown").replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 48);
}

async function contentFingerprint(content: string): Promise<string> {
  const bytes = new TextEncoder().encode(content);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
