import { describe, expect, it } from "vitest";
import { StorageConflictError } from "@mind-context/storage";

import {
  GOOGLE_DRIVE_FILE_SCOPE,
  GoogleDriveStorageProvider,
  GoogleDriveWorkspaceService,
  type AccessTokenProvider,
} from "../src/index";

const tokenProvider: AccessTokenProvider = {
  getAccessToken: () => "test-token",
};

describe("GoogleDriveWorkspaceService", () => {
  it("discovers only MindContext workspace folders and authenticates with bearer token", async () => {
    const requests: CapturedRequest[] = [];
    const fetchImplementation = createFetchMock(
      [
        jsonResponse({
          files: [
            {
              id: "workspace-1",
              name: "My Second Brain",
              mimeType: "application/vnd.google-apps.folder",
              modifiedTime: "2026-09-24T17:00:00.000Z",
            },
          ],
        }),
      ],
      requests,
    );

    const service = new GoogleDriveWorkspaceService(
      tokenProvider,
      fetchImplementation,
    );

    const workspaces = await service.listWorkspaces();

    expect(workspaces).toEqual([
      {
        id: "workspace-1",
        name: "My Second Brain",
        modifiedAt: "2026-09-24T17:00:00.000Z",
      },
    ]);

    expect(requests).toHaveLength(1);
    const request = requests[0]!;
    expect(new URL(request.url).hostname).toBe("www.googleapis.com");
    expect(request.headers.get("Authorization")).toBe("Bearer test-token");

    const query = new URL(request.url).searchParams.get("q") ?? "";
    expect(query).toContain("application/vnd.google-apps.folder");
    expect(query).toContain("mindContextWorkspace");
    expect(query).toContain("true");
  });

  it("creates a workspace marked with appProperties", async () => {
    const requests: CapturedRequest[] = [];
    const fetchImplementation = createFetchMock(
      [
        jsonResponse({
          id: "workspace-2",
          name: "Architecture",
          mimeType: "application/vnd.google-apps.folder",
        }),
      ],
      requests,
    );

    const service = new GoogleDriveWorkspaceService(
      tokenProvider,
      fetchImplementation,
    );

    const workspace = await service.createWorkspace("  Architecture  ");

    expect(workspace).toEqual({
      id: "workspace-2",
      name: "Architecture",
    });

    const request = requests[0]!;
    expect(request.method).toBe("POST");
    expect(JSON.parse(String(request.body))).toMatchObject({
      name: "Architecture",
      mimeType: "application/vnd.google-apps.folder",
      appProperties: {
        mindContextWorkspace: "true",
        mindContextSchema: "1",
      },
    });
  });
});

describe("GoogleDriveStorageProvider", () => {
  it("creates Markdown directly under the workspace and sends private content only to Google Drive", async () => {
    const privateSecret = "TOP_SECRET_TEST_83929";
    const requests: CapturedRequest[] = [];
    const fetchImplementation = createFetchMock(
      [
        jsonResponse({
          id: "note-1",
          name: "Private.md",
          mimeType: "text/markdown",
          version: "1",
          parents: ["workspace-1"],
        }),
      ],
      requests,
    );

    const provider = new GoogleDriveStorageProvider({
      workspaceFolderId: "workspace-1",
      accessTokenProvider: tokenProvider,
      fetchImplementation,
    });

    const metadata = await provider.createText(
      provider.rootId,
      "Private",
      `# Secret\n\n${privateSecret}`,
    );

    expect(metadata.name).toBe("Private.md");
    expect(metadata.parentIds).toEqual(["workspace-1"]);

    expect(requests).toHaveLength(1);
    const request = requests[0]!;
    const url = new URL(request.url);

    expect(url.hostname).toBe("www.googleapis.com");
    expect(url.pathname).toBe("/upload/drive/v3/files");
    expect(url.searchParams.get("uploadType")).toBe("multipart");
    expect(String(request.body)).toContain(privateSecret);
    expect(String(request.body)).toContain('"parents":["workspace-1"]');

    for (const captured of requests) {
      const destination = new URL(captured.url);
      const body = String(captured.body ?? "");
      if (body.includes(privateSecret)) {
        expect(destination.protocol).toBe("https:");
        expect(destination.hostname).toBe("www.googleapis.com");
      }
    }
  });

  it("reads note content directly from the Drive media endpoint", async () => {
    const requests: CapturedRequest[] = [];
    const fetchImplementation = createFetchMock(
      [textResponse("# Kafka\n\nIdempotency matters.")],
      requests,
    );

    const provider = new GoogleDriveStorageProvider({
      workspaceFolderId: "workspace-1",
      accessTokenProvider: tokenProvider,
      fetchImplementation,
    });

    await expect(provider.readText("note/with spaces")).resolves.toBe(
      "# Kafka\n\nIdempotency matters.",
    );

    const url = new URL(requests[0]!.url);
    expect(url.pathname).toBe("/drive/v3/files/note%2Fwith%20spaces");
    expect(url.searchParams.get("alt")).toBe("media");
  });

  it("checks the expected revision before writing and rejects stale edits", async () => {
    const requests: CapturedRequest[] = [];
    const fetchImplementation = createFetchMock(
      [
        jsonResponse({
          id: "note-1",
          name: "Retry.md",
          mimeType: "text/markdown",
          version: "8",
          parents: ["workspace-1"],
        }),
      ],
      requests,
    );

    const provider = new GoogleDriveStorageProvider({
      workspaceFolderId: "workspace-1",
      accessTokenProvider: tokenProvider,
      fetchImplementation,
    });

    await expect(
      provider.writeText("note-1", "stale content", {
        expectedRevision: "7",
      }),
    ).rejects.toBeInstanceOf(StorageConflictError);

    expect(requests).toHaveLength(1);
    expect(requests[0]!.method).toBe("GET");
    expect(String(requests[0]!.body ?? "")).not.toContain("stale content");
  });

  it("writes when the revision still matches", async () => {
    const requests: CapturedRequest[] = [];
    const fetchImplementation = createFetchMock(
      [
        jsonResponse({
          id: "note-1",
          name: "Retry.md",
          mimeType: "text/markdown",
          version: "7",
          parents: ["workspace-1"],
        }),
        jsonResponse({
          id: "note-1",
          name: "Retry.md",
          mimeType: "text/markdown",
          version: "8",
          parents: ["workspace-1"],
        }),
      ],
      requests,
    );

    const provider = new GoogleDriveStorageProvider({
      workspaceFolderId: "workspace-1",
      accessTokenProvider: tokenProvider,
      fetchImplementation,
    });

    const result = await provider.writeText("note-1", "# Updated", {
      expectedRevision: "7",
    });

    expect(result.revision).toBe("8");
    expect(requests).toHaveLength(2);
    expect(requests[0]!.method).toBe("GET");
    expect(requests[1]!.method).toBe("PATCH");

    const writeUrl = new URL(requests[1]!.url);
    expect(writeUrl.hostname).toBe("www.googleapis.com");
    expect(writeUrl.pathname).toBe("/upload/drive/v3/files/note-1");
    expect(requests[1]!.body).toBe("# Updated");
  });

  it("uses the narrow drive.file scope", () => {
    expect(GOOGLE_DRIVE_FILE_SCOPE).toBe(
      "https://www.googleapis.com/auth/drive.file",
    );
  });
});

interface CapturedRequest {
  readonly url: string;
  readonly method: string;
  readonly headers: Headers;
  readonly body: BodyInit | null | undefined;
}

function createFetchMock(
  responses: readonly Response[],
  captured: CapturedRequest[],
): typeof fetch {
  let index = 0;

  return (async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const url =
      input instanceof Request ? input.url : input.toString();
    const headers = new Headers(
      init?.headers ??
        (input instanceof Request ? input.headers : undefined),
    );

    captured.push({
      url,
      method:
        init?.method ??
        (input instanceof Request ? input.method : "GET"),
      headers,
      body: init?.body,
    });

    const response = responses[index];
    index += 1;

    if (!response) {
      throw new Error(`Unexpected request: ${url}`);
    }

    return response.clone();
  }) as typeof fetch;
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function textResponse(value: string, status = 200): Response {
  return new Response(value, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=UTF-8",
    },
  });
}
