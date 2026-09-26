import type {
  StorageObjectMetadata,
  StorageProvider,
} from "@mind-context/storage";

export const RECOVERY_FOLDER_NAME = ".mindcontext-recovery";

export type RecoveryKind = "local-conflict" | "remote-before-overwrite";

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

async function ensureRecoveryFolder(
  provider: StorageProvider,
): Promise<StorageObjectMetadata> {
  const rootItems = await provider.list(provider.rootId);
  const existing = rootItems.find(isRecoveryDirectory);
  if (existing) return existing;
  return provider.createDirectory(provider.rootId, RECOVERY_FOLDER_NAME);
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
