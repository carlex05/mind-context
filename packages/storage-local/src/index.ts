import {
  StorageConflictError,
  type StorageObjectMetadata,
  type StorageProvider,
  type TextContentOptions,
  type WriteCondition,
} from "@mind-context/storage";

const ROOT_PATH = "";

type DirectoryPickerWindow = Window & {
  showDirectoryPicker?: (options?: {
    readonly id?: string;
    readonly mode?: "read" | "readwrite";
  }) => Promise<FileSystemDirectoryHandle>;
};

export type BrowserLocalVaultPermission =
  | PermissionState
  | "unsupported";

export interface BrowserLocalVault {
  readonly workspaceId: string;
  readonly name: string;
  readonly handle: FileSystemDirectoryHandle;
  readonly provider: BrowserLocalStorageProvider;
}

export class BrowserLocalStorageProvider implements StorageProvider {
  readonly id: string;
  readonly rootId: string;

  private readonly idByPath = new Map<string, string>();
  private readonly pathById = new Map<string, string>();

  constructor(
    private readonly rootHandle: FileSystemDirectoryHandle,
    id = createWorkspaceId(),
  ) {
    this.id = id;
    this.rootId = `${id}:root`;
    this.idByPath.set(ROOT_PATH, this.rootId);
    this.pathById.set(this.rootId, ROOT_PATH);
  }

  async list(
    parentId = this.rootId,
  ): Promise<readonly StorageObjectMetadata[]> {
    const parentPath = this.pathForId(parentId);
    const directory = await this.directoryAt(parentPath);
    const items: StorageObjectMetadata[] = [];

    for await (const [name, handle] of directory.entries()) {
      const path = joinPath(parentPath, name);
      items.push(await this.metadataFor(path, handle));
    }

    return items.sort((left, right) => {
      if (left.kind !== right.kind) return left.kind === "directory" ? -1 : 1;
      return left.name.localeCompare(right.name);
    });
  }

  async readText(id: string): Promise<string> {
    const handle = await this.fileHandleForId(id);
    return (await handle.getFile()).text();
  }

  async writeText(
    id: string,
    content: string,
    condition?: WriteCondition,
    _options?: TextContentOptions,
  ): Promise<StorageObjectMetadata> {
    await this.assertCondition(id, condition);
    const handle = await this.fileHandleForId(id);
    await writeToFile(handle, content);
    return this.metadata(id);
  }

  async createText(
    parentId: string,
    name: string,
    content: string,
    _options?: TextContentOptions,
  ): Promise<StorageObjectMetadata> {
    const normalizedName = normalizeTextFileName(name);
    const parentPath = this.pathForId(parentId);
    const directory = await this.directoryAt(parentPath);
    await assertNameAvailable(directory, normalizedName);
    const handle = await directory.getFileHandle(normalizedName, {
      create: true,
    });
    await writeToFile(handle, content);
    return this.metadataFor(
      joinPath(parentPath, normalizedName),
      handle,
    );
  }

  async readBinary(id: string): Promise<Uint8Array> {
    const handle = await this.fileHandleForId(id);
    return new Uint8Array(await (await handle.getFile()).arrayBuffer());
  }

  async writeBinary(
    id: string,
    content: Uint8Array,
    mediaType = "application/octet-stream",
    condition?: WriteCondition,
  ): Promise<StorageObjectMetadata> {
    await this.assertCondition(id, condition);
    const handle = await this.fileHandleForId(id);
    await writeToFile(
      handle,
      new Blob([Uint8Array.from(content)], { type: mediaType }),
    );
    return this.metadata(id);
  }

  async createBinary(
    parentId: string,
    name: string,
    content: Uint8Array,
    mediaType = "application/octet-stream",
  ): Promise<StorageObjectMetadata> {
    const normalizedName = normalizeName(name);
    const parentPath = this.pathForId(parentId);
    const directory = await this.directoryAt(parentPath);
    await assertNameAvailable(directory, normalizedName);
    const handle = await directory.getFileHandle(normalizedName, {
      create: true,
    });
    await writeToFile(
      handle,
      new Blob([Uint8Array.from(content)], { type: mediaType }),
    );
    return this.metadataFor(
      joinPath(parentPath, normalizedName),
      handle,
    );
  }

  async createDirectory(
    parentId: string,
    name: string,
  ): Promise<StorageObjectMetadata> {
    const normalizedName = normalizeName(name);
    const parentPath = this.pathForId(parentId);
    const directory = await this.directoryAt(parentPath);
    await assertNameAvailable(directory, normalizedName);
    const handle = await directory.getDirectoryHandle(normalizedName, {
      create: true,
    });
    return this.metadataFor(
      joinPath(parentPath, normalizedName),
      handle,
    );
  }

  async delete(
    id: string,
    condition?: WriteCondition,
  ): Promise<void> {
    if (id === this.rootId) {
      throw new Error("The local vault root cannot be deleted.");
    }

    await this.assertCondition(id, condition);
    const path = this.pathForId(id);
    const parent = await this.directoryAt(parentPath(path));
    await parent.removeEntry(baseName(path), { recursive: true });
    this.removeMappedPathPrefix(path);
  }

  async move(
    id: string,
    destinationParentId: string,
    newName?: string,
    condition?: WriteCondition,
  ): Promise<StorageObjectMetadata> {
    if (id === this.rootId) {
      throw new Error("The local vault root cannot be moved.");
    }

    await this.assertCondition(id, condition);
    const sourcePath = this.pathForId(id);
    const source = await this.handleAt(sourcePath);
    const destinationPath = this.pathForId(destinationParentId);
    const destination = await this.directoryAt(destinationPath);
    const targetName = normalizeName(newName ?? baseName(sourcePath));
    const targetPath = joinPath(destinationPath, targetName);

    if (targetPath === sourcePath) return this.metadata(id);
    if (
      source.kind === "directory" &&
      (destinationPath === sourcePath ||
        destinationPath.startsWith(`${sourcePath}/`))
    ) {
      throw new Error("A folder cannot be moved inside itself.");
    }

    await assertNameAvailable(destination, targetName);
    await copyHandle(source, destination, targetName);

    try {
      const sourceParent = await this.directoryAt(parentPath(sourcePath));
      await sourceParent.removeEntry(baseName(sourcePath), {
        recursive: true,
      });
    } catch (error) {
      await destination
        .removeEntry(targetName, { recursive: true })
        .catch(() => undefined);
      throw error;
    }

    this.remapPathPrefix(sourcePath, targetPath);
    return this.metadata(id);
  }

  async metadata(id: string): Promise<StorageObjectMetadata> {
    if (id === this.rootId) {
      return {
        id: this.rootId,
        name: this.rootHandle.name,
        kind: "directory",
        parentIds: [],
      };
    }

    const path = this.pathForId(id);
    return this.metadataFor(path, await this.handleAt(path));
  }

  private pathForId(id: string): string {
    const path = this.pathById.get(id);
    if (path === undefined) {
      throw new Error(`Unknown local vault object: ${id}`);
    }
    return path;
  }

  private ensureId(path: string): string {
    const existing = this.idByPath.get(path);
    if (existing) return existing;
    const id =
      path === ROOT_PATH
        ? this.rootId
        : `${this.id}:path:${encodeURIComponent(path)}`;
    this.idByPath.set(path, id);
    this.pathById.set(id, path);
    return id;
  }

  private async directoryAt(
    path: string,
  ): Promise<FileSystemDirectoryHandle> {
    let directory = this.rootHandle;
    for (const segment of pathSegments(path)) {
      directory = await directory.getDirectoryHandle(segment);
    }
    return directory;
  }

  private async handleAt(path: string): Promise<FileSystemHandle> {
    if (!path) return this.rootHandle;
    const parent = await this.directoryAt(parentPath(path));
    const name = baseName(path);

    for await (const [entryName, handle] of parent.entries()) {
      if (entryName === name) return handle;
    }

    throw new Error(`Local vault item not found: ${path}`);
  }

  private async fileHandleForId(
    id: string,
  ): Promise<FileSystemFileHandle> {
    const handle = await this.handleAt(this.pathForId(id));
    if (!isFileSystemFileHandle(handle)) {
      throw new Error("The requested local vault item is not a file.");
    }
    return handle;
  }

  private async metadataFor(
    path: string,
    handle: FileSystemHandle,
  ): Promise<StorageObjectMetadata> {
    const id = this.ensureId(path);
    const parent = parentPath(path);
    const parentIds = path ? [this.ensureId(parent)] : [];

    if (isFileSystemDirectoryHandle(handle)) {
      return {
        id,
        name: handle.name,
        kind: "directory",
        parentIds,
      };
    }
    if (!isFileSystemFileHandle(handle)) {
      throw new Error(`Unsupported local file-system handle: ${handle.name}`);
    }

    const file = await handle.getFile();
    const revision = fileRevision(file);
    return {
      id,
      name: handle.name,
      kind: "file",
      parentIds,
      modifiedAt: new Date(file.lastModified).toISOString(),
      revision,
      contentRevision: revision,
      mediaType: file.type || inferMediaType(handle.name),
      size: file.size,
    };
  }

  private async assertCondition(
    id: string,
    condition?: WriteCondition,
  ): Promise<void> {
    if (!condition?.expectedRevision && !condition?.expectedContentRevision) {
      return;
    }

    const current = await this.metadata(id);
    const expected =
      condition.expectedContentRevision ?? condition.expectedRevision;
    const actual =
      condition.expectedContentRevision !== undefined
        ? current.contentRevision
        : current.revision;

    if (expected !== actual) {
      throw new StorageConflictError(
        "The local file changed after it was opened.",
        id,
      );
    }
  }

  private removeMappedPathPrefix(path: string): void {
    for (const [id, mappedPath] of [...this.pathById.entries()]) {
      if (mappedPath === path || mappedPath.startsWith(`${path}/`)) {
        this.pathById.delete(id);
        this.idByPath.delete(mappedPath);
      }
    }
  }

  private remapPathPrefix(oldPath: string, newPath: string): void {
    const affected = [...this.pathById.entries()].filter(
      ([, mappedPath]) =>
        mappedPath === oldPath ||
        mappedPath.startsWith(`${oldPath}/`),
    );

    for (const [id, mappedPath] of affected) {
      this.idByPath.delete(mappedPath);
      const suffix = mappedPath.slice(oldPath.length);
      const nextPath = `${newPath}${suffix}`;
      this.pathById.set(id, nextPath);
      this.idByPath.set(nextPath, id);
    }
  }
}

export function isBrowserLocalStorageSupported(): boolean {
  if (typeof window === "undefined") return false;
  const picker = (window as DirectoryPickerWindow).showDirectoryPicker;
  return window.isSecureContext && typeof picker === "function";
}

export async function pickBrowserLocalVault(): Promise<BrowserLocalVault> {
  const picker = (window as DirectoryPickerWindow).showDirectoryPicker;
  if (!window.isSecureContext || typeof picker !== "function") {
    throw new Error(
      "This browser does not support direct read/write access to local folders.",
    );
  }

  const rootHandle = await picker({
    id: "mindcontext-local-vault",
    mode: "readwrite",
  });
  return createBrowserLocalVault(rootHandle);
}

export function createBrowserLocalVault(
  handle: FileSystemDirectoryHandle,
  workspaceId = createWorkspaceId(),
): BrowserLocalVault {
  return {
    workspaceId,
    name: handle.name,
    handle,
    provider: new BrowserLocalStorageProvider(handle, workspaceId),
  };
}

export async function browserLocalVaultPermission(
  handle: FileSystemDirectoryHandle,
): Promise<BrowserLocalVaultPermission> {
  const queryPermission = permissionMethod(handle, "queryPermission");
  if (!queryPermission) return "unsupported";

  try {
    return await queryPermission({ mode: "readwrite" });
  } catch {
    return "unsupported";
  }
}

export async function requestBrowserLocalVaultPermission(
  handle: FileSystemDirectoryHandle,
): Promise<BrowserLocalVaultPermission> {
  const requestPermission = permissionMethod(handle, "requestPermission");
  if (!requestPermission) return "unsupported";

  try {
    return await requestPermission({ mode: "readwrite" });
  } catch {
    return "denied";
  }
}

export async function isSameBrowserLocalVault(
  left: FileSystemDirectoryHandle,
  right: FileSystemDirectoryHandle,
): Promise<boolean> {
  const candidate = left as PermissionAwareDirectoryHandle;
  if (typeof candidate.isSameEntry !== "function") return false;

  try {
    return await candidate.isSameEntry(right);
  } catch {
    return false;
  }
}

async function assertNameAvailable(
  directory: FileSystemDirectoryHandle,
  name: string,
): Promise<void> {
  for await (const [entryName] of directory.entries()) {
    if (entryName === name) {
      throw new Error(`An item named “${name}” already exists in this folder.`);
    }
  }
}

async function writeToFile(
  handle: FileSystemFileHandle,
  content: string | Blob,
): Promise<void> {
  const writable = await handle.createWritable();
  try {
    await writable.write(content);
    await writable.close();
  } catch (error) {
    await writable.abort(error).catch(() => undefined);
    throw error;
  }
}

async function copyHandle(
  source: FileSystemHandle,
  destination: FileSystemDirectoryHandle,
  targetName: string,
): Promise<void> {
  if (isFileSystemFileHandle(source)) {
    const sourceFile = await source.getFile();
    const target = await destination.getFileHandle(targetName, {
      create: true,
    });
    await writeToFile(target, sourceFile);
    return;
  }

  if (!isFileSystemDirectoryHandle(source)) {
    throw new Error(`Unsupported local file-system handle: ${source.name}`);
  }

  const target = await destination.getDirectoryHandle(targetName, {
    create: true,
  });
  for await (const [name, child] of source.entries()) {
    await copyHandle(child, target, name);
  }
}

type PermissionAwareDirectoryHandle = FileSystemDirectoryHandle & {
  queryPermission?: (
    descriptor?: { readonly mode?: "read" | "write" | "readwrite" },
  ) => Promise<PermissionState>;
  requestPermission?: (
    descriptor?: { readonly mode?: "read" | "write" | "readwrite" },
  ) => Promise<PermissionState>;
  isSameEntry?: (other: FileSystemHandle) => Promise<boolean>;
};

function permissionMethod(
  handle: FileSystemDirectoryHandle,
  method: "queryPermission" | "requestPermission",
): PermissionAwareDirectoryHandle[typeof method] | undefined {
  const candidate = handle as PermissionAwareDirectoryHandle;
  const value = candidate[method];
  return typeof value === "function" ? value.bind(handle) : undefined;
}

function isFileSystemFileHandle(
  handle: FileSystemHandle,
): handle is FileSystemFileHandle {
  return handle.kind === "file";
}

function isFileSystemDirectoryHandle(
  handle: FileSystemHandle,
): handle is FileSystemDirectoryHandle {
  return handle.kind === "directory";
}

function createWorkspaceId(): string {
  const random =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `local:${random}`;
}

function fileRevision(file: File): string {
  return `${file.lastModified}:${file.size}`;
}

function normalizeTextFileName(name: string): string {
  const normalized = normalizeName(name);
  return hasFileExtension(normalized) ? normalized : `${normalized}.md`;
}

function hasFileExtension(name: string): boolean {
  const dot = name.lastIndexOf(".");
  return dot > 0 && dot < name.length - 1;
}

function normalizeName(name: string): string {
  const normalized = name.trim();
  if (!normalized) throw new Error("Name cannot be empty.");
  if (normalized.includes("/") || normalized.includes("\\")) {
    throw new Error("Name cannot contain path separators.");
  }
  return normalized;
}

function joinPath(parent: string, name: string): string {
  return parent ? `${parent}/${name}` : name;
}

function parentPath(path: string): string {
  const index = path.lastIndexOf("/");
  return index < 0 ? ROOT_PATH : path.slice(0, index);
}

function baseName(path: string): string {
  const index = path.lastIndexOf("/");
  return index < 0 ? path : path.slice(index + 1);
}

function pathSegments(path: string): readonly string[] {
  return path ? path.split("/").filter(Boolean) : [];
}

function inferMediaType(name: string): string {
  const lower = name.toLocaleLowerCase();
  if (lower.endsWith(".md")) return "text/markdown";
  if (lower.endsWith(".txt")) return "text/plain";
  if (
    lower.endsWith(".json") ||
    lower.endsWith(".canvas") ||
    lower.endsWith(".excalidraw")
  ) return "application/json";
  if (lower.endsWith(".yaml") || lower.endsWith(".yml")) {
    return "application/yaml";
  }
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".avif")) return "image/avif";
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".mp3")) return "audio/mpeg";
  if (lower.endsWith(".wav")) return "audio/wav";
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".webm")) return "video/webm";
  return "application/octet-stream";
}
