import { expect, test, type Page, type Route } from "@playwright/test";

test("creates, edits and saves a private Markdown note through the Drive boundary", async ({
  page,
}, testInfo) => {
  const drive = new FakeDrive();
  const observedRequests: ObservedRequest[] = [];

  page.on("request", (request) => {
    observedRequests.push({
      url: request.url(),
      method: request.method(),
      body: request.postData(),
    });
  });

  await installGoogleIdentityMock(page);
  await page.route("https://www.googleapis.com/**", (route) =>
    drive.handle(route),
  );

  await page.goto("/");

  await page.getByRole("button", { name: "Connect Google Drive" }).click();
  await expect(page.getByText("Choose your brain.")).toBeVisible();

  await page.getByRole("button", { name: "Create in Drive" }).click();
  await expect(page.getByRole("heading", { name: "My Second Brain" })).toBeVisible();

  await page.getByLabel("New Markdown note").fill("Private");
  await page.getByRole("button", { name: "Add" }).click();

  const editor = page.getByRole("textbox", { name: "Edit Private.md" });
  await expect(editor).toBeVisible();

  const secret = `TOP_SECRET_${testInfo.project.name}_83929`;
  await editor.fill(`# Private\n\n${secret}`);
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.getByText("Saved directly to Google Drive.")).toBeVisible();

  expect(drive.noteContent("note-1")).toBe(`# Private\n\n${secret}`);

  const requestsContainingSecret = observedRequests.filter((request) =>
    request.body?.includes(secret),
  );

  expect(requestsContainingSecret.length).toBeGreaterThan(0);
  for (const request of requestsContainingSecret) {
    const url = new URL(request.url);
    expect(url.protocol).toBe("https:");
    expect(url.hostname).toBe("www.googleapis.com");
    expect(url.pathname.startsWith("/upload/drive/v3/files")).toBe(true);
  }

  const mobileBackButton = page.locator(".mobile-back");

  if (testInfo.project.name.startsWith("mobile")) {
    await expect(mobileBackButton).toBeVisible();
    await mobileBackButton.click();
    await expect(page.getByRole("navigation", { name: "Workspace files" })).toBeVisible();
    await expect(editor).not.toBeVisible();
  } else {
    await expect(page.getByRole("navigation", { name: "Workspace files" })).toBeVisible();
    await expect(mobileBackButton).toBeHidden();
  }
});

test("derives wikilinks, backlinks and broken links locally", async ({
  page,
}, testInfo) => {
  const drive = new FakeDrive();

  await installGoogleIdentityMock(page);
  await page.route("https://www.googleapis.com/**", (route) =>
    drive.handle(route),
  );

  await page.goto("/");
  await page.getByRole("button", { name: "Connect Google Drive" }).click();
  await page.getByRole("button", { name: "Create in Drive" }).click();

  await page.getByLabel("New Markdown note").fill("Alpha");
  await page.getByRole("button", { name: "Add" }).click();

  const alphaEditor = page.getByRole("textbox", { name: "Edit Alpha.md" });
  await alphaEditor.fill("# Alpha\n\nLinks to [[Beta]] and [[Missing]].");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(
    page.getByText("Saved to Drive and updated the local knowledge index."),
  ).toBeVisible();

  if (testInfo.project.name.startsWith("mobile")) {
    await page.locator(".mobile-back").click();
  }

  await page.getByLabel("New Markdown note").fill("Beta");
  await page.getByRole("button", { name: "Add" }).click();

  if (testInfo.project.name.startsWith("mobile")) {
    await page.getByRole("button", { name: "Context" }).click();
  }

  const context = page.getByRole("complementary", {
    name: "Knowledge context",
  });
  await expect(context).toBeVisible();
  await expect(
    context.getByRole("button", { name: /Alpha/ }),
  ).toBeVisible();

  await context.getByRole("button", { name: /Alpha/ }).click();
  await expect(
    page.getByRole("textbox", { name: "Edit Alpha.md" }),
  ).toBeVisible();

  if (testInfo.project.name.startsWith("mobile")) {
    await page.getByRole("button", { name: "Context" }).click();
  }

  const alphaContext = page.getByRole("complementary", {
    name: "Knowledge context",
  });
  await expect(
    alphaContext.getByRole("button", { name: /Beta/ }),
  ).toBeVisible();
  await expect(alphaContext.getByText("[[Missing]]")).toBeVisible();
  await expect(alphaContext.getByText("Note not found")).toBeVisible();
});

async function installGoogleIdentityMock(page: Page): Promise<void> {
  await page.route("https://accounts.google.com/gsi/client", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: `
        window.google = {
          accounts: {
            oauth2: {
              initTokenClient(config) {
                return {
                  requestAccessToken() {
                    config.callback({
                      access_token: "e2e-access-token",
                      expires_in: "3600"
                    });
                  }
                };
              }
            }
          }
        };
      `,
    });
  });
}

interface ObservedRequest {
  readonly url: string;
  readonly method: string;
  readonly body: string | null;
}

interface StoredFile {
  readonly id: string;
  readonly name: string;
  readonly mimeType: string;
  readonly parents: readonly string[];
  version: number;
  content: string;
}

class FakeDrive {
  private workspaceCreated = false;
  private nextNoteNumber = 1;
  private readonly notes = new Map<string, StoredFile>();

  async handle(route: Route): Promise<void> {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();

    if (
      method === "GET" &&
      url.pathname === "/drive/v3/files" &&
      (url.searchParams.get("q") ?? "").includes("mindContextWorkspace")
    ) {
      await this.json(route, {
        files: this.workspaceCreated
          ? [
              {
                id: "workspace-1",
                name: "My Second Brain",
                mimeType: "application/vnd.google-apps.folder",
                modifiedTime: "2026-09-24T17:00:00.000Z",
              },
            ]
          : [],
      });
      return;
    }

    if (method === "POST" && url.pathname === "/drive/v3/files") {
      const body = JSON.parse(request.postData() ?? "{}") as {
        name?: string;
        mimeType?: string;
        appProperties?: Record<string, string>;
      };

      if (body.mimeType === "application/vnd.google-apps.folder") {
        this.workspaceCreated = true;
        await this.json(route, {
          id: "workspace-1",
          name: body.name ?? "My Second Brain",
          mimeType: body.mimeType,
          modifiedTime: "2026-09-24T17:00:00.000Z",
          appProperties: body.appProperties,
        });
        return;
      }
    }

    if (
      method === "GET" &&
      url.pathname === "/drive/v3/files" &&
      (url.searchParams.get("q") ?? "").includes("'workspace-1' in parents")
    ) {
      await this.json(route, {
        files: Array.from(this.notes.values()).map((note) =>
          this.metadata(note),
        ),
      });
      return;
    }

    if (
      method === "POST" &&
      url.pathname === "/upload/drive/v3/files" &&
      url.searchParams.get("uploadType") === "multipart"
    ) {
      const multipart = request.postData() ?? "";
      const name =
        /\"name\":\"([^\"]+)\"/.exec(multipart)?.[1] ?? "Untitled.md";
      const content =
        /Content-Type: text\/markdown; charset=UTF-8\r\n\r\n([\s\S]*?)\r\n--mindcontext-/.exec(
          multipart,
        )?.[1] ?? "";

      const note: StoredFile = {
        id: `note-${this.nextNoteNumber}`,
        name,
        mimeType: "text/markdown",
        parents: ["workspace-1"],
        version: 1,
        content,
      };
      this.nextNoteNumber += 1;
      this.notes.set(note.id, note);
      await this.json(route, this.metadata(note));
      return;
    }

    const fileMatch = /^\/drive\/v3\/files\/([^/]+)$/.exec(url.pathname);
    if (method === "GET" && fileMatch) {
      const id = decodeURIComponent(fileMatch[1]!);
      const note = this.notes.get(id);
      if (!note) {
        await route.fulfill({ status: 404, body: "Not found" });
        return;
      }

      if (url.searchParams.get("alt") === "media") {
        await route.fulfill({
          status: 200,
          contentType: "text/markdown; charset=UTF-8",
          body: note.content,
        });
        return;
      }

      await this.json(route, this.metadata(note));
      return;
    }

    const uploadMatch = /^\/upload\/drive\/v3\/files\/([^/]+)$/.exec(
      url.pathname,
    );
    if (method === "PATCH" && uploadMatch) {
      const id = decodeURIComponent(uploadMatch[1]!);
      const note = this.notes.get(id);
      if (!note) {
        await route.fulfill({ status: 404, body: "Not found" });
        return;
      }

      note.content = request.postData() ?? "";
      note.version += 1;
      await this.json(route, this.metadata(note));
      return;
    }

    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({
        error: {
          message: `Unhandled fake Drive request: ${method} ${url.pathname}`,
        },
      }),
    });
  }

  noteContent(id: string): string | undefined {
    return this.notes.get(id)?.content;
  }

  private metadata(note: StoredFile) {
    return {
      id: note.id,
      name: note.name,
      mimeType: note.mimeType,
      parents: note.parents,
      version: String(note.version),
      modifiedTime: "2026-09-24T17:00:00.000Z",
      size: String(note.content.length),
    };
  }

  private async json(route: Route, value: unknown): Promise<void> {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(value),
    });
  }
}
