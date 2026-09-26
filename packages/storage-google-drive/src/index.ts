import {
  StorageConflictError,
  type StorageObjectMetadata,
  type StorageProvider,
  type WriteCondition,
} from "@mind-context/storage";

const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_BASE = "https://www.googleapis.com/upload/drive/v3";
const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";
const MARKDOWN_MIME_TYPE = "text/markdown";
const FILE_FIELDS =
  "id,name,mimeType,modifiedTime,version,headRevisionId,parents,size,appProperties";

export const GOOGLE_DRIVE_PROVIDER_ID = "google-drive";
export const GOOGLE_DRIVE_FILE_SCOPE =
  "https://www.googleapis.com/auth/drive.file";

const WORKSPACE_PROPERTY_KEY = "mindContextWorkspace";
const WORKSPACE_PROPERTY_VALUE = "true";
const WORKSPACE_SCHEMA_KEY = "mindContextSchema";
const WORKSPACE_SCHEMA_VERSION = "1";

export interface AccessTokenProvider {
  getAccessToken(): string | Promise<string>;
}

export interface GoogleDriveProviderConfiguration {
  readonly workspaceFolderId: string;
  readonly accessTokenProvider: AccessTokenProvider;
  readonly fetchImplementation?: typeof fetch;
}

export interface GoogleDriveWorkspace {
  readonly id: string;
  readonly name: string;
  readonly modifiedAt?: string;
}

interface DriveFile {
  readonly id: string;
  readonly name: string;
  readonly mimeType: string;
  readonly modifiedTime?: string;
  readonly version?: string | number;
  readonly headRevisionId?: string;
  readonly parents?: readonly string[];
  readonly size?: string | number;
  readonly appProperties?: Readonly<Record<string, string>>;
}

interface DriveFileList {
  readonly files?: readonly DriveFile[];
  readonly nextPageToken?: string;
}

interface DriveErrorBody {
  readonly error?: {
    readonly code?: number;
    readonly message?: string;
  };
}

export class GoogleDriveApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "GoogleDriveApiError";
  }
}

export class GoogleDriveWorkspaceService {
  private readonly fetchImplementation: typeof fetch;

  constructor(
    private readonly accessTokenProvider: AccessTokenProvider,
    fetchImplementation: typeof fetch = fetch,
  ) {
    this.fetchImplementation = fetchImplementation;
  }

  async listWorkspaces(): Promise<readonly GoogleDriveWorkspace[]> {
    const q = [
      `mimeType = '${FOLDER_MIME_TYPE}'`,
      "trashed = false",
      `appProperties has { key='${WORKSPACE_PROPERTY_KEY}' and value='${WORKSPACE_PROPERTY_VALUE}' }`,
    ].join(" and ");

    const files = await this.listFiles(q);

    return files.map((file) => ({
      id: file.id,
      name: file.name,
      ...(file.modifiedTime ? { modifiedAt: file.modifiedTime } : {}),
    }));
  }

  async createWorkspace(name: string): Promise<GoogleDriveWorkspace> {
    const normalizedName = name.trim();
    if (!normalizedName) {
      throw new Error("Workspace name cannot be empty.");
    }

    const file = await this.requestJson<DriveFile>(
      `${DRIVE_API_BASE}/files?fields=${encodeURIComponent(FILE_FIELDS)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=UTF-8",
        },
        body: JSON.stringify({
          name: normalizedName,
          mimeType: FOLDER_MIME_TYPE,
          appProperties: {
            [WORKSPACE_PROPERTY_KEY]: WORKSPACE_PROPERTY_VALUE,
            [WORKSPACE_SCHEMA_KEY]: WORKSPACE_SCHEMA_VERSION,
          },
        }),
      },
    );

    return {
      id: file.id,
      name: file.name,
      ...(file.modifiedTime ? { modifiedAt: file.modifiedTime } : {}),
    };
  }

  private async listFiles(q: string): Promise<readonly DriveFile[]> {
    const files: DriveFile[] = [];
    let pageToken: string | undefined;

    do {
      const params = new URLSearchParams({
        q,
        spaces: "drive",
        pageSize: "100",
        orderBy: "modifiedTime desc",
        fields: `nextPageToken,files(${FILE_FIELDS})`,
      });
      if (pageToken) {
        params.set("pageToken", pageToken);
      }

      const response = await this.requestJson<DriveFileList>(
        `${DRIVE_API_BASE}/files?${params.toString()}`,
      );
      files.push(...(response.files ?? []));
      pageToken = response.nextPageToken;
    } while (pageToken);

    return files;
  }

  private async requestJson<T>(
    url: string,
    init: RequestInit = {},
  ): Promise<T> {
    const response = await authorizedFetch(
      this.fetchImplementation,
      this.accessTokenProvider,
      url,
      init,
    );
    return readJson<T>(response);
  }
}

export class GoogleDriveStorageProvider implements StorageProvider {
  readonly id = GOOGLE_DRIVE_PROVIDER_ID;
  readonly rootId: string;

  private readonly fetchImplementation: typeof fetch;

  constructor(private readonly configuration: GoogleDriveProviderConfiguration) {
    this.rootId = configuration.workspaceFolderId;
    this.fetchImplementation = configuration.fetchImplementation ?? fetch;
  }

  async list(
    parentId: string = this.rootId,
  ): Promise<readonly StorageObjectMetadata[]> {
    const files: DriveFile[] = [];
    let pageToken: string | undefined;

    do {
      const params = new URLSearchParams({
        q: `'${escapeDriveQueryLiteral(parentId)}' in parents and trashed = false`,
        spaces: "drive",
        pageSize: "100",
        orderBy: "folder,name_natural",
        fields: `nextPageToken,files(${FILE_FIELDS})`,
      });
      if (pageToken) {
        params.set("pageToken", pageToken);
      }

      const response = await this.requestJson<DriveFileList>(
        `${DRIVE_API_BASE}/files?${params.toString()}`,
      );
      files.push(...(response.files ?? []));
      pageToken = response.nextPageToken;
    } while (pageToken);

    return files.map(toStorageMetadata);
  }

  async readText(id: string): Promise<string> {
    const response = await this.request(
      `${DRIVE_API_BASE}/files/${encodeURIComponent(id)}?alt=media`,
    );
    return response.text();
  }

  async writeText(
    id: string,
    content: string,
    condition?: WriteCondition,
  ): Promise<StorageObjectMetadata> {
    await this.assertRevision(id, condition);

    const params = new URLSearchParams({
      uploadType: "media",
      fields: FILE_FIELDS,
    });

    const response = await this.requestJson<DriveFile>(
      `${DRIVE_UPLOAD_BASE}/files/${encodeURIComponent(id)}?${params.toString()}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "text/markdown; charset=UTF-8",
        },
        body: content,
      },
    );

    return toStorageMetadata(response);
  }

  async createText(
    parentId: string,
    name: string,
    content: string,
  ): Promise<StorageObjectMetadata> {
    const normalizedName = normalizeFileName(name);
    const boundary = `mindcontext-${crypto.randomUUID()}`;
    const metadata = {
      name: normalizedName,
      mimeType: MARKDOWN_MIME_TYPE,
      parents: [parentId],
    };

    const body = [
      `--${boundary}\r\n`,
      "Content-Type: application/json; charset=UTF-8\r\n\r\n",
      JSON.stringify(metadata),
      "\r\n",
      `--${boundary}\r\n`,
      "Content-Type: text/markdown; charset=UTF-8\r\n\r\n",
      content,
      "\r\n",
      `--${boundary}--`,
    ].join("");

    const params = new URLSearchParams({
      uploadType: "multipart",
      fields: FILE_FIELDS,
    });

    const response = await this.requestJson<DriveFile>(
      `${DRIVE_UPLOAD_BASE}/files?${params.toString()}`,
      {
        method: "POST",
        headers: {
          "Content-Type": `multipart/related; boundary=${boundary}`,
        },
        body,
      },
    );

    return toStorageMetadata(response);
  }

  async createDirectory(
    parentId: string,
    name: string,
  ): Promise<StorageObjectMetadata> {
    const normalizedName = name.trim();
    if (!normalizedName) {
      throw new Error("Directory name cannot be empty.");
    }

    const response = await this.requestJson<DriveFile>(
      `${DRIVE_API_BASE}/files?fields=${encodeURIComponent(FILE_FIELDS)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=UTF-8",
        },
        body: JSON.stringify({
          name: normalizedName,
          mimeType: FOLDER_MIME_TYPE,
          parents: [parentId],
        }),
      },
    );

    return toStorageMetadata(response);
  }

  async delete(id: string, condition?: WriteCondition): Promise<void> {
    await this.assertRevision(id, condition);
    await this.request(
      `${DRIVE_API_BASE}/files/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    );
  }

  async move(
    id: string,
    destinationParentId: string,
    newName?: string,
    condition?: WriteCondition,
  ): Promise<StorageObjectMetadata> {
    await this.assertRevision(id, condition);
    const current = await this.metadata(id);
    const params = new URLSearchParams({
      fields: FILE_FIELDS,
    });

    if (!current.parentIds.includes(destinationParentId)) {
      params.set("addParents", destinationParentId);
      const oldParents = current.parentIds.filter(
        (parentId) => parentId !== destinationParentId,
      );
      if (oldParents.length > 0) {
        params.set("removeParents", oldParents.join(","));
      }
    }

    const response = await this.requestJson<DriveFile>(
      `${DRIVE_API_BASE}/files/${encodeURIComponent(id)}?${params.toString()}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json; charset=UTF-8",
        },
        body: JSON.stringify(newName ? { name: newName.trim() } : {}),
      },
    );

    return toStorageMetadata(response);
  }

  async metadata(id: string): Promise<StorageObjectMetadata> {
    const params = new URLSearchParams({ fields: FILE_FIELDS });
    const response = await this.requestJson<DriveFile>(
      `${DRIVE_API_BASE}/files/${encodeURIComponent(id)}?${params.toString()}`,
    );
    return toStorageMetadata(response);
  }

  private async assertRevision(
    id: string,
    condition?: WriteCondition,
  ): Promise<void> {
    if (
      !condition?.expectedRevision &&
      !condition?.expectedContentRevision
    ) {
      return;
    }

    const current = await this.metadata(id);
    if (
      condition.expectedContentRevision &&
      current.contentRevision !== condition.expectedContentRevision
    ) {
      throw new StorageConflictError(
        "The file content changed in Google Drive after it was opened.",
        id,
      );
    }
    if (
      !condition.expectedContentRevision &&
      condition.expectedRevision &&
      current.revision !== condition.expectedRevision
    ) {
      throw new StorageConflictError(
        "The file changed in Google Drive after it was opened.",
        id,
      );
    }
  }

  private request(url: string, init: RequestInit = {}): Promise<Response> {
    return authorizedFetch(
      this.fetchImplementation,
      this.configuration.accessTokenProvider,
      url,
      init,
    );
  }

  private async requestJson<T>(
    url: string,
    init: RequestInit = {},
  ): Promise<T> {
    return readJson<T>(await this.request(url, init));
  }
}

function normalizeFileName(name: string): string {
  const normalized = name.trim();
  if (!normalized) {
    throw new Error("File name cannot be empty.");
  }
  return normalized.toLowerCase().endsWith(".md")
    ? normalized
    : `${normalized}.md`;
}

function escapeDriveQueryLiteral(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("'", "\\'");
}

function toStorageMetadata(file: DriveFile): StorageObjectMetadata {
  const numericSize =
    file.size === undefined ? undefined : Number.parseInt(String(file.size), 10);

  return {
    id: file.id,
    name: file.name,
    kind: file.mimeType === FOLDER_MIME_TYPE ? "directory" : "file",
    parentIds: file.parents ?? [],
    ...(file.modifiedTime ? { modifiedAt: file.modifiedTime } : {}),
    ...(file.version !== undefined
      ? { revision: String(file.version) }
      : {}),
    ...(file.headRevisionId
      ? { contentRevision: file.headRevisionId }
      : {}),
    ...(file.mimeType ? { mediaType: file.mimeType } : {}),
    ...(numericSize !== undefined && Number.isFinite(numericSize)
      ? { size: numericSize }
      : {}),
  };
}

async function authorizedFetch(
  fetchImplementation: typeof fetch,
  accessTokenProvider: AccessTokenProvider,
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  const token = await accessTokenProvider.getAccessToken();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);

  const response = await fetchImplementation(url, {
    ...init,
    headers,
  });

  if (!response.ok) {
    let message = `Google Drive request failed with HTTP ${response.status}.`;
    try {
      const body = (await response.json()) as DriveErrorBody;
      if (body.error?.message) {
        message = body.error.message;
      }
    } catch {
      // Keep the generic message for non-JSON error bodies.
    }
    throw new GoogleDriveApiError(message, response.status);
  }

  return response;
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}
