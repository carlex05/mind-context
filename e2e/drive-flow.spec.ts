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

  await prepareDrive(page, drive);
  await openFreshWorkspace(page);

  await createNote(page, "Private");

  const editor = page.getByRole("textbox", { name: "Edit Private.md" });
  await expect(editor).toBeVisible();

  const secret = `TOP_SECRET_${testInfo.project.name}_83929`;
  await replaceEditorContent(page, editor, `# Private\n\n${secret}`);
  await page.getByRole("button", { name: "Save" }).click();

  await expect(
    page.getByText("Saved to Drive and updated the local knowledge index."),
  ).toBeVisible();

  expect(drive.noteContentByName("Private.md")).toBe(
    `# Private\n\n${secret}`,
  );

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
    await expect(
      page.getByRole("navigation", { name: "Workspace files" }),
    ).toBeVisible();
    await expect(editor).not.toBeVisible();
  } else {
    await expect(
      page.getByRole("navigation", { name: "Workspace files" }),
    ).toBeVisible();
    await expect(mobileBackButton).toBeHidden();
  }
});

test("derives wikilinks, backlinks and broken links locally", async ({
  page,
}, testInfo) => {
  const drive = new FakeDrive();
  await prepareDrive(page, drive);
  await openFreshWorkspace(page);

  await createNote(page, "Alpha");
  const alphaEditor = page.getByRole("textbox", { name: "Edit Alpha.md" });
  await replaceEditorContent(
    page,
    alphaEditor,
    "# Alpha\n\nLinks to [[Beta]] and [[Missing]].",
  );
  await page.getByRole("button", { name: "Save" }).click();

  await returnToExplorerOnMobile(page, testInfo.project.name);
  await createNote(page, "Beta");

  if (testInfo.project.name.startsWith("mobile")) {
    await page.getByRole("button", { name: "Context" }).click();
  }

  const context = page.getByRole("complementary", {
    name: "Knowledge context",
  });
  await expect(context).toBeVisible();
  await expect(context.getByRole("button", { name: /Alpha/ })).toBeVisible();

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
  await expect(alphaContext.getByRole("button", { name: /Beta/ })).toBeVisible();
  await expect(alphaContext.getByText("[[Missing]]")).toBeVisible();
  await expect(alphaContext.getByText("Note not found")).toBeVisible();
});

test("persists theme, offers quick switching, reading view and wikilink suggestions", async ({
  page,
}, testInfo) => {
  const drive = new FakeDrive();
  await prepareDrive(page, drive);
  await openFreshWorkspace(page);

  await createNote(page, "Beta");
  const betaEditor = page.getByRole("textbox", { name: "Edit Beta.md" });
  await replaceEditorContent(
    page,
    betaEditor,
    "---\ntags:\n  - architecture\naliases:\n  - B\n---\n\n# Beta\n\n## Boundaries",
  );
  await page.getByRole("button", { name: "Save" }).click();
  await returnToExplorerOnMobile(page, testInfo.project.name);

  await createNote(page, "Alpha");
  const alphaEditor = page.getByRole("textbox", { name: "Edit Alpha.md" });
  await replaceEditorContent(page, alphaEditor, "# Alpha\n\n[[");
  await expect(page.locator(".cm-tooltip-autocomplete")).toContainText("Beta");

  await page.getByRole("button", { name: "Read", exact: true }).click();
  await expect(page.getByLabel("Reading view")).toBeVisible();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await replaceEditorContent(page, alphaEditor, "# Alpha\n\nLinks to [[Beta]].");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(
    page.getByText("Saved to Drive and updated the local knowledge index."),
  ).toBeVisible();

  await page.getByRole("button", { name: "Read", exact: true }).click();
  const readingView = page.getByLabel("Reading view");
  await expect(readingView.getByRole("button", { name: "Beta" })).toBeVisible();
  await readingView.getByRole("button", { name: "Beta" }).click();
  await expect(
    page.getByRole("textbox", { name: "Edit Beta.md" }),
  ).toBeVisible();

  await expect(page.getByRole("button", { name: "Back" })).toBeEnabled();
  await page.getByRole("button", { name: "Back" }).click();
  await expect(
    page.getByRole("textbox", { name: "Edit Alpha.md" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Forward" })).toBeEnabled();
  await page.getByRole("button", { name: "Forward" }).click();
  await expect(
    page.getByRole("textbox", { name: "Edit Beta.md" }),
  ).toBeVisible();

  if (testInfo.project.name.startsWith("mobile")) {
    await page.getByRole("button", { name: "Context" }).click();
  }
  const properties = page.getByRole("region", { name: "Note properties" });
  await properties.getByLabel("Add tags").fill("knowledge");
  await properties.getByLabel("Add tags").press("Enter");
  await properties.getByLabel("Add aliases").fill("Second Beta");
  await properties.getByLabel("Add aliases").press("Enter");
  await expect(properties.getByText("#knowledge")).toBeVisible();
  await expect(properties.getByText("Second Beta")).toBeVisible();

  if (testInfo.project.name.startsWith("mobile")) {
    await page.getByRole("button", { name: "← Note" }).click();
  }
  await page.getByRole("button", { name: "Save" }).click();
  await expect(
    page.getByText("Saved to Drive and updated the local knowledge index."),
  ).toBeVisible();
  expect(drive.noteContentByName("Beta.md")).toContain("knowledge");
  expect(drive.noteContentByName("Beta.md")).toContain("Second Beta");

  await page.keyboard.press("Control+O");
  const switcher = page.getByRole("dialog", { name: "Quick switcher" });
  await expect(switcher).toBeVisible();
  await switcher.getByLabel("Open or create note").fill("Alpha");
  await switcher.getByRole("button", { name: /Alpha/ }).first().click();
  await expect(
    page.getByRole("textbox", { name: "Edit Alpha.md" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Interface settings" }).click();
  await page.getByRole("button", { name: /Dark/ }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("manages nested folders and safely rewrites resolved links on rename", async ({
  page,
}, testInfo) => {
  const drive = new FakeDrive();
  await prepareDrive(page, drive);
  await openFreshWorkspace(page);

  await createFolder(page, "Projects");
  await expect(page.getByText("Folder “Projects” created.")).toBeVisible();

  await createNote(page, "Alpha");
  const alphaEditor = page.getByRole("textbox", { name: "Edit Alpha.md" });
  await replaceEditorContent(
    page,
    alphaEditor,
    "# Alpha\n\nDepends on [[Beta]].",
  );
  await page.getByRole("button", { name: "Save" }).click();

  await returnToExplorerOnMobile(page, testInfo.project.name);

  await page.getByRole("button", { name: "/", exact: true }).click();
  await createNote(page, "Beta");
  await returnToExplorerOnMobile(page, testInfo.project.name);

  const betaRow = page.locator(".tree-row").filter({ hasText: "Beta.md" });
  await betaRow.getByRole("button", { name: "Beta.md", exact: true }).click();
  await returnToExplorerOnMobile(page, testInfo.project.name);
  await page.getByRole("button", { name: "Actions for Beta.md" }).click();

  page.on("dialog", async (dialog) => {
    if (dialog.type() === "prompt") {
      await dialog.accept("Gamma");
    } else {
      await dialog.accept();
    }
  });

  await page.getByRole("button", { name: "Rename", exact: true }).click();
  await expect(page.getByText(/Renamed\. Updated 1 linked note/)).toBeVisible();

  const projectsToggle = page.getByRole("button", {
    name: /Projects/,
  }).first();
  if (await projectsToggle.getAttribute("aria-label")) {
    const aria = await projectsToggle.getAttribute("aria-label");
    if (aria?.startsWith("Expand")) {
      await projectsToggle.click();
    }
  }

  await page.getByRole("button", { name: "Alpha.md", exact: true }).click();
  const reopenedAlpha = page.getByRole("textbox", { name: "Edit Alpha.md" });
  await expect(reopenedAlpha).toBeVisible();
  await expect(reopenedAlpha).toHaveText(/\[\[Gamma\]\]/);

  expect(drive.noteContentByName("Alpha.md")).toContain("[[Gamma]]");
  expect(drive.filePathByName("Alpha.md")).toBe("Projects/Alpha.md");
  expect(drive.filePathByName("Gamma.md")).toBe("Gamma.md");
});

async function prepareDrive(page: Page, drive: FakeDrive): Promise<void> {
  await installGoogleIdentityMock(page);
  await page.route("https://www.googleapis.com/**", (route) =>
    drive.handle(route),
  );
  await page.goto("/");
}

async function openFreshWorkspace(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Connect Google Drive" }).click();
  await expect(page.getByText("Choose your brain.")).toBeVisible();
  await page.getByRole("button", { name: "Create in Drive" }).click();
  await expect(
    page.getByRole("heading", { name: "My Second Brain" }),
  ).toBeVisible();
}

async function createNote(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: "+ New note", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "New note" });
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByRole("button", { name: "Create", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: `Edit ${name}.md` }),
  ).toBeVisible();
}

async function createFolder(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: "New folder", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "New folder" });
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByRole("button", { name: "Create", exact: true }).click();
}

async function replaceEditorContent(
  page: Page,
  editor: ReturnType<Page["getByRole"]>,
  content: string,
): Promise<void> {
  await editor.click();
  await page.keyboard.press("Control+A");
  await page.keyboard.insertText(content);
}

async function returnToExplorerOnMobile(
  page: Page,
  projectName: string,
): Promise<void> {
  if (projectName.startsWith("mobile")) {
    const back = page.locator(".mobile-back");
    if (await back.isVisible()) {
      await back.click();
    }
  }
}

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

interface StoredObject {
  readonly id: string;
  name: string;
  readonly mimeType: string;
  parents: string[];
  version: number;
  content: string;
  readonly appProperties?: Record<string, string>;
}

class FakeDrive {
  private workspaceCreated = false;
  private nextNoteNumber = 1;
  private nextFolderNumber = 1;
  private readonly objects = new Map<string, StoredObject>();

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
        parents?: string[];
        appProperties?: Record<string, string>;
      };

      if (body.mimeType === "application/vnd.google-apps.folder") {
        if (!body.parents?.length) {
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

        const folder: StoredObject = {
          id: `folder-${this.nextFolderNumber++}`,
          name: body.name ?? "Folder",
          mimeType: "application/vnd.google-apps.folder",
          parents: [...body.parents],
          version: 1,
          content: "",
        };
        this.objects.set(folder.id, folder);
        await this.json(route, this.metadata(folder));
        return;
      }
    }

    if (method === "GET" && url.pathname === "/drive/v3/files") {
      const query = url.searchParams.get("q") ?? "";
      const parentId = /'([^']+)' in parents/.exec(query)?.[1];
      if (parentId) {
        await this.json(route, {
          files: Array.from(this.objects.values())
            .filter((object) => object.parents.includes(parentId))
            .map((object) => this.metadata(object)),
        });
        return;
      }
    }

    if (
      method === "POST" &&
      url.pathname === "/upload/drive/v3/files" &&
      url.searchParams.get("uploadType") === "multipart"
    ) {
      const multipart = request.postData() ?? "";
      const name =
        /\"name\":\"([^\"]+)\"/.exec(multipart)?.[1] ?? "Untitled.md";
      const parent =
        /\"parents\":\[\"([^\"]+)\"\]/.exec(multipart)?.[1] ??
        "workspace-1";
      const noteContent =
        /Content-Type: text\/markdown; charset=UTF-8\r\n\r\n([\s\S]*?)\r\n--mindcontext-/.exec(
          multipart,
        )?.[1] ?? "";

      const note: StoredObject = {
        id: `note-${this.nextNoteNumber++}`,
        name,
        mimeType: "text/markdown",
        parents: [parent],
        version: 1,
        content: noteContent,
      };
      this.objects.set(note.id, note);
      await this.json(route, this.metadata(note));
      return;
    }

    const fileMatch = /^\/drive\/v3\/files\/([^/]+)$/.exec(url.pathname);
    if (fileMatch) {
      const id = decodeURIComponent(fileMatch[1]!);
      const object = this.objects.get(id);

      if (method === "GET") {
        if (!object) {
          await route.fulfill({ status: 404, body: "Not found" });
          return;
        }

        if (url.searchParams.get("alt") === "media") {
          await route.fulfill({
            status: 200,
            contentType: object.mimeType,
            body: object.content,
          });
          return;
        }

        await this.json(route, this.metadata(object));
        return;
      }

      if (method === "PATCH") {
        if (!object) {
          await route.fulfill({ status: 404, body: "Not found" });
          return;
        }

        const addParent = url.searchParams.get("addParents");
        const removeParents = url.searchParams
          .get("removeParents")
          ?.split(",")
          .filter(Boolean);

        if (addParent && !object.parents.includes(addParent)) {
          object.parents.push(addParent);
        }
        if (removeParents?.length) {
          object.parents = object.parents.filter(
            (parent) => !removeParents.includes(parent),
          );
        }

        const body = JSON.parse(request.postData() || "{}") as {
          name?: string;
        };
        if (body.name) object.name = body.name;
        object.version += 1;

        await this.json(route, this.metadata(object));
        return;
      }

      if (method === "DELETE") {
        if (!object) {
          await route.fulfill({ status: 404, body: "Not found" });
          return;
        }
        this.deleteRecursively(id);
        await route.fulfill({ status: 204, body: "" });
        return;
      }
    }

    const uploadMatch = /^\/upload\/drive\/v3\/files\/([^/]+)$/.exec(
      url.pathname,
    );
    if (method === "PATCH" && uploadMatch) {
      const id = decodeURIComponent(uploadMatch[1]!);
      const object = this.objects.get(id);
      if (!object) {
        await route.fulfill({ status: 404, body: "Not found" });
        return;
      }

      object.content = request.postData() ?? "";
      object.version += 1;
      await this.json(route, this.metadata(object));
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

  noteContentByName(name: string): string | undefined {
    return Array.from(this.objects.values()).find(
      (object) => object.name === name,
    )?.content;
  }

  filePathByName(name: string): string | undefined {
    const object = Array.from(this.objects.values()).find(
      (candidate) => candidate.name === name,
    );
    if (!object) return undefined;
    return this.pathFor(object);
  }

  private pathFor(object: StoredObject): string {
    const parentId = object.parents[0];
    if (!parentId || parentId === "workspace-1") {
      return object.name;
    }
    const parent = this.objects.get(parentId);
    return parent ? `${this.pathFor(parent)}/${object.name}` : object.name;
  }

  private deleteRecursively(id: string): void {
    for (const child of Array.from(this.objects.values()).filter((object) =>
      object.parents.includes(id),
    )) {
      this.deleteRecursively(child.id);
    }
    this.objects.delete(id);
  }

  private metadata(object: StoredObject) {
    return {
      id: object.id,
      name: object.name,
      mimeType: object.mimeType,
      parents: object.parents,
      version: String(object.version),
      modifiedTime: "2026-09-24T17:00:00.000Z",
      size: String(object.content.length),
      appProperties: object.appProperties,
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
