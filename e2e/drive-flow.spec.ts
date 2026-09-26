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
    page.getByText("Synced to Google Drive."),
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

  if (testInfo.project.name.startsWith("mobile")) {
    await page.getByRole("button", { name: "Files", exact: true }).click();
    await expect(
      page.getByRole("navigation", { name: "Workspace files" }),
    ).toBeVisible();
    await expect(editor).not.toBeVisible();
  } else {
    await expect(
      page.getByRole("navigation", { name: "Workspace files" }),
    ).toBeVisible();
  }
});

test("syncs repeated edits to the same note with the latest Drive revision", async ({
  page,
}) => {
  const drive = new FakeDrive();
  await prepareDrive(page, drive);
  await openFreshWorkspace(page);
  await createNote(page, "Repeat");

  const editor = page.getByRole("textbox", { name: "Edit Repeat.md" });
  await replaceEditorContent(page, editor, "# Repeat\n\nversion one");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Synced to Google Drive.")).toBeVisible();
  expect(drive.noteContentByName("Repeat.md")).toBe(
    "# Repeat\n\nversion one",
  );

  await replaceEditorContent(page, editor, "# Repeat\n\nversion two");
  await expect(page.getByText("Saved locally", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Save" }).click();

  await expect
    .poll(() => drive.noteContentByName("Repeat.md"))
    .toBe("# Repeat\n\nversion two");
  await expect(page.getByText("Synced", { exact: true })).toBeVisible();
});

test("keeps newer local edits while an earlier Drive sync is in flight", async ({
  page,
}) => {
  const drive = new FakeDrive();
  drive.setUploadDelay(400);
  await prepareDrive(page, drive);
  await openFreshWorkspace(page);
  await createNote(page, "Queued");

  const editor = page.getByRole("textbox", { name: "Edit Queued.md" });
  await replaceEditorContent(page, editor, "# Queued\n\nfirst");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Syncing…", { exact: true })).toBeVisible();

  await replaceEditorContent(page, editor, "# Queued\n\nsecond");
  await expect(page.getByText("Saved locally", { exact: true })).toBeVisible();

  await expect
    .poll(() => drive.noteContentByName("Queued.md"), { timeout: 5000 })
    .toBe("# Queued\n\nsecond");
  await expect(page.getByText("Synced", { exact: true })).toBeVisible();
});

test("does not treat Drive metadata-only changes as content conflicts", async ({
  page,
}) => {
  const drive = new FakeDrive();
  await prepareDrive(page, drive);
  await openFreshWorkspace(page);
  await createNote(page, "Metadata");

  const editor = page.getByRole("textbox", { name: "Edit Metadata.md" });
  await replaceEditorContent(page, editor, "# Metadata\n\ninitial");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Synced to Google Drive.")).toBeVisible();

  drive.externalMetadataUpdate("Metadata.md");
  await replaceEditorContent(page, editor, "# Metadata\n\nlocal after metadata");
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.getByText("Synced", { exact: true })).toBeVisible();
  await expect(page.locator(".note-sync-state.conflict")).toHaveCount(0);
  expect(drive.noteContentByName("Metadata.md")).toBe(
    "# Metadata\n\nlocal after metadata",
  );
});

test("restores a locally persisted draft after a browser reload", async ({
  page,
}) => {
  const drive = new FakeDrive();
  await prepareDrive(page, drive);
  await openFreshWorkspace(page);
  await createNote(page, "Recovery");

  const editor = page.getByRole("textbox", { name: "Edit Recovery.md" });
  const localDraft = "# Recovery\n\nOnly local so far";
  await replaceEditorContent(page, editor, localDraft);

  // Local recovery persistence is intentionally much faster than deferred
  // Drive synchronization. Give IndexedDB time to receive the draft, then
  // reload before the remote debounce fires.
  await page.waitForTimeout(250);
  expect(drive.noteContentByName("Recovery.md")).toBe("");

  await page.reload();
  await page.getByRole("button", { name: "Connect Google Drive" }).click();
  await expect(page.getByText("Choose your brain.")).toBeVisible();
  await page.getByRole("button", { name: /My Second Brain/ }).click();

  const restoredEditor = page.getByRole("textbox", {
    name: "Edit Recovery.md",
  });
  await expect(restoredEditor).toBeVisible();
  await expect(restoredEditor).toContainText("Only local so far");
  await expect(page.getByText("Saved locally", { exact: true })).toBeVisible();

  await expect
    .poll(() => drive.noteContentByName("Recovery.md"), { timeout: 5000 })
    .toBe(localDraft);
  await expect(page.getByText("Synced", { exact: true })).toBeVisible();
});

test("preserves a local draft and surfaces conflict after a remote Drive change", async ({
  page,
}) => {
  const drive = new FakeDrive();
  await prepareDrive(page, drive);
  await openFreshWorkspace(page);
  await createNote(page, "Conflict");

  const editor = page.getByRole("textbox", { name: "Edit Conflict.md" });
  const localDraft = "# Conflict\n\nlocal version";
  await replaceEditorContent(page, editor, localDraft);
  await page.waitForTimeout(250);

  expect(drive.noteContentByName("Conflict.md")).toBe("");
  drive.externalUpdate("Conflict.md", "# Conflict\n\nremote version");

  await page.reload();
  await page.getByRole("button", { name: "Connect Google Drive" }).click();
  await expect(page.getByText("Choose your brain.")).toBeVisible();
  await page.getByRole("button", { name: /My Second Brain/ }).click();

  const restoredEditor = page.getByRole("textbox", {
    name: "Edit Conflict.md",
  });
  await expect(restoredEditor).toBeVisible();
  await expect(restoredEditor).toContainText("local version");
  await expect(page.locator(".note-sync-state.conflict")).toHaveText("Conflict");

  // The local draft is never allowed to overwrite a newer remote revision.
  await page.waitForTimeout(1500);
  expect(drive.noteContentByName("Conflict.md")).toBe(
    "# Conflict\n\nremote version",
  );

  const localRecoveryPath = drive.paths().find(
    (path) =>
      path.startsWith(".mindcontext-recovery/Conflict.local-conflict.") &&
      path.endsWith(".md"),
  );
  expect(localRecoveryPath).toBeTruthy();
  expect(drive.contentByPath(localRecoveryPath!)).toBe(localDraft);
  await expect(page.getByText(".mindcontext-recovery", { exact: true })).toHaveCount(0);

  const updatedLocalDraft = "# Conflict\n\nlocal version after conflict";
  await replaceEditorContent(page, restoredEditor, updatedLocalDraft);
  await page.waitForTimeout(2300);
  const latestRecoveryPath = drive.paths().find(
    (path) =>
      path.startsWith(".mindcontext-recovery/Conflict.local-conflict.") &&
      drive.contentByPath(path) === updatedLocalDraft,
  );
  expect(latestRecoveryPath).toBeTruthy();

  await page.getByRole("button", { name: "Keep my version" }).click();
  await expect(page.getByText("Synced", { exact: true })).toBeVisible();
  expect(drive.noteContentByName("Conflict.md")).toBe(updatedLocalDraft);

  await expect
    .poll(() =>
      drive.paths().some(
        (path) =>
          path.includes(".mindcontext-recovery/resolved--") &&
          path.includes("Conflict.local-conflict"),
      ),
    )
    .toBe(true);

  const remoteRecoveryPath = drive.paths().find(
    (path) =>
      path.includes(
        ".mindcontext-recovery/resolved--",
      ) &&
      path.includes("Conflict.remote-before-overwrite.") &&
      path.endsWith(".md"),
  );
  expect(remoteRecoveryPath).toBeTruthy();
  expect(drive.contentByPath(remoteRecoveryPath!)).toBe(
    "# Conflict\n\nremote version",
  );

  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const settings = page.getByRole("complementary", { name: "Settings" });
  await expect(settings.getByText("Recovery", { exact: true })).toBeVisible();
  await expect(
    settings.getByLabel("Resolved recovery retention"),
  ).toHaveValue("30");
  await expect(settings.getByText(/Resolved ·/).first()).toBeVisible();

  const localRecovery = settings
    .locator(".recovery-item")
    .filter({ hasText: "Local draft backup" })
    .first();
  await expect(localRecovery).toBeVisible();
  await localRecovery.getByRole("button", { name: "Restore as note" }).click();

  const recoveredEditor = page.getByRole("textbox", {
    name: /Edit Conflict \(Recovered .*\)\.md/,
  });
  await expect(recoveredEditor).toBeVisible();
  await expect(recoveredEditor).toContainText("local version");
});

test("closing a dirty tab preserves its local recovery draft", async ({
  page,
}, testInfo) => {
  const drive = new FakeDrive();
  await prepareDrive(page, drive);
  await openFreshWorkspace(page);
  await createNote(page, "CloseRecovery");

  const editor = page.getByRole("textbox", {
    name: "Edit CloseRecovery.md",
  });
  const draft = "# CloseRecovery\n\nkeep this draft";
  await replaceEditorContent(page, editor, draft);
  await page.waitForTimeout(250);

  const tabs = page.getByLabel("Open tabs");
  await tabs.getByRole("button", { name: "Close CloseRecovery" }).click();

  if (testInfo.project.name.startsWith("mobile")) {
    await page.getByRole("button", { name: "Files", exact: true }).click();
  }
  await page.getByRole("button", { name: "CloseRecovery.md", exact: true }).click();

  const restored = page.getByRole("textbox", {
    name: "Edit CloseRecovery.md",
  });
  await expect(restored).toContainText("keep this draft");
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

  await page.getByRole("button", { name: "Context" }).click();

  const context = page.getByRole("complementary", {
    name: "Knowledge context",
  });
  await expect(context).toBeVisible();
  await expect(context.getByRole("button", { name: /Alpha/ })).toBeVisible();

  await context.getByRole("button", { name: /Alpha/ }).click();
  await expect(
    page.getByRole("textbox", { name: "Edit Alpha.md" }),
  ).toBeVisible();

  if (!(await page.getByRole("complementary", { name: "Knowledge context" }).isVisible())) {
    await page.getByRole("button", { name: "Context" }).click();
  }

  const alphaContext = page.getByRole("complementary", {
    name: "Knowledge context",
  });
  await expect(alphaContext.getByRole("button", { name: /Beta/ })).toBeVisible();
  await expect(alphaContext.getByText("[[Missing]]")).toBeVisible();
  await expect(alphaContext.getByText("Note not found")).toBeVisible();
});

test("switches UI language and persists the locale preference", async ({
  page,
}) => {
  const drive = new FakeDrive();
  await prepareDrive(page, drive);
  await openFreshWorkspace(page);

  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const settings = page.getByRole("complementary", { name: "Settings" });
  await settings.getByRole("button", { name: "Español", exact: true }).click();

  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  await expect(
    page.getByRole("button", { name: "Archivos", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Buscar", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Grafo", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Etiquetas", exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Archivos", exact: true }).click();
  const files = page.getByRole("complementary", { name: "Archivos" });
  await files.getByRole("button", { name: "Nueva nota", exact: true }).click();

  const dialog = page.getByRole("dialog", { name: "Nueva nota" });
  await expect(dialog.getByText("Ubicación")).toBeVisible();
  await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();

  await page.reload();

  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  await expect(
    page.getByRole("button", { name: "Conectar Google Drive", exact: true }),
  ).toBeVisible();
});

test("creates a Spanish PARA starter independently of the UI language", async ({
  page,
}) => {
  const drive = new FakeDrive();
  await prepareDrive(page, drive);

  await page.getByRole("button", { name: "Connect Google Drive" }).click();
  await expect(page.getByText("Choose your brain.")).toBeVisible();
  await page.getByRole("button", { name: "Create in Drive" }).click();

  const onboarding = page.getByRole("dialog", {
    name: "How do you want to start?",
  });
  await expect(onboarding).toBeVisible();
  await onboarding.getByRole("button", { name: /PARA/ }).click();
  await onboarding.getByLabel("Template language").selectOption("es");
  await onboarding
    .getByRole("button", { name: "Create Second Brain", exact: true })
    .click();

  await expect(
    page.getByRole("complementary", { name: "Files" }),
  ).toBeVisible();

  expect(drive.paths()).toEqual(
    expect.arrayContaining([
      "Empieza aquí.md",
      "Proyectos",
      "Proyectos/README.md",
      "Áreas",
      "Áreas/README.md",
      "Recursos",
      "Recursos/README.md",
      "Archivo",
      "Archivo/README.md",
    ]),
  );
  expect(drive.contentByPath("Proyectos/README.md")).toContain("# Proyectos");
  expect(drive.contentByPath("Empieza aquí.md")).toContain(
    "[[Proyectos/README|Cómo usar Proyectos]]",
  );
  expect(drive.paths().some((path) => path.startsWith(".mindcontext"))).toBe(
    false,
  );
});

test("suggests onboarding for an existing completely empty Second Brain and remembers keep blank", async ({
  page,
}) => {
  const drive = new FakeDrive();
  drive.seedExistingWorkspace();
  await prepareDrive(page, drive);

  await page.getByRole("button", { name: "Connect Google Drive" }).click();
  await expect(page.getByText("Choose your brain.")).toBeVisible();
  await page
    .getByRole("button", { name: /My Second Brain/ })
    .click();

  const onboarding = page.getByRole("dialog", {
    name: "This Second Brain is completely empty",
  });
  await expect(onboarding).toBeVisible();

  await onboarding.getByRole("button", { name: /Blank/ }).click();
  await onboarding
    .getByRole("button", { name: "Keep blank", exact: true })
    .click();
  await expect(onboarding).not.toBeVisible();
  expect(drive.paths()).toEqual([]);

  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const settings = page.getByRole("complementary", { name: "Settings" });
  await settings
    .getByRole("button", { name: "Switch workspace", exact: true })
    .click();

  await expect(page.getByText("Choose your brain.")).toBeVisible();
  await page
    .getByRole("button", { name: /My Second Brain/ })
    .click();

  await expect(
    page.getByRole("dialog", {
      name: "This Second Brain is completely empty",
    }),
  ).not.toBeVisible();

  await page.getByRole("button", { name: "Files", exact: true }).click();
  await expect(
    page.getByRole("complementary", { name: "Files" }),
  ).toBeVisible();
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

  await page.getByRole("button", { name: "Reading view", exact: true }).click();
  await expect(page.getByLabel("Reading view")).toBeVisible();
  await page.getByRole("button", { name: "Editing view", exact: true }).click();
  await replaceEditorContent(page, alphaEditor, "# Alpha\n\nLinks to [[Beta]].");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(
    page.getByText("Synced to Google Drive."),
  ).toBeVisible();

  await page.getByRole("button", { name: "Reading view", exact: true }).click();
  const readingView = page.getByLabel("Reading view");
  await expect(readingView.getByRole("button", { name: "Beta" })).toBeVisible();
  await readingView.getByRole("button", { name: "Beta" }).click();
  await expect(
    page.getByRole("textbox", { name: "Edit Beta.md" }),
  ).toBeVisible();

  await expect(page.getByRole("button", { name: "Back" })).toBeEnabled();
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByLabel("Reading view")).toBeVisible();
  await expect(page.getByRole("button", { name: "Forward" })).toBeEnabled();
  await page.getByRole("button", { name: "Forward" }).click();
  await expect(
    page.getByRole("textbox", { name: "Edit Beta.md" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Context" }).click();
  const properties = page.getByRole("region", { name: "Note properties" });
  await properties.getByLabel("Add tags").fill("knowledge");
  await properties.getByLabel("Add tags").press("Enter");
  await properties.getByLabel("Add aliases").fill("Second Beta");
  await properties.getByLabel("Add aliases").press("Enter");
  await expect(properties.getByText("#knowledge")).toBeVisible();
  await expect(properties.getByText("Second Beta")).toBeVisible();

  await page.getByRole("button", { name: "Close context" }).click();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(
    page.getByText("Synced to Google Drive."),
  ).toBeVisible();
  expect(drive.noteContentByName("Beta.md")).toContain("knowledge");
  expect(drive.noteContentByName("Beta.md")).toContain("Second Beta");

  await page.keyboard.press("Control+O");
  const switcher = page.getByRole("dialog", { name: "Quick switcher" });
  await expect(switcher).toBeVisible();
  await switcher.getByLabel("Open or create note").fill("Alpha");
  await switcher.getByRole("button", { name: /Alpha/ }).first().click();
  await expect(page.getByLabel("Reading view")).toBeVisible();

  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const settings = page.getByRole("complementary", { name: "Settings" });
  await settings.getByRole("button", { name: /Dark/ }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await settings
    .getByRole("button", { name: "Collapse sidebar" })
    .click();

  await page.getByRole("button", { name: "Editing view", exact: true }).click();
  const darkEditor = page.getByRole("textbox", { name: "Edit Alpha.md" });
  await darkEditor.click();
  const caretColor = await page
    .locator(".cm-cursor")
    .first()
    .evaluate((element) => getComputedStyle(element).borderLeftColor);
  expect(caretColor).not.toBe("rgb(0, 0, 0)");
  expect(caretColor).not.toBe("rgba(0, 0, 0, 0)");

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("searches note contents, metadata and opens results locally", async ({
  page,
}, testInfo) => {
  const drive = new FakeDrive();
  await prepareDrive(page, drive);
  await openFreshWorkspace(page);

  await createNote(page, "Architecture");
  const architecture = page.getByRole("textbox", {
    name: "Edit Architecture.md",
  });
  await replaceEditorContent(
    page,
    architecture,
    "---\ntags:\n  - local-first\naliases:\n  - System design\n---\n\n# Architecture\n\n## Privacy\n\nEmbeddings are disposable local projections.",
  );
  await page.getByRole("button", { name: "Save" }).click();

  await returnToExplorerOnMobile(page, testInfo.project.name);
  await createNote(page, "Travel");
  const travel = page.getByRole("textbox", { name: "Edit Travel.md" });
  await replaceEditorContent(
    page,
    travel,
    "# Travel\n\nWalking around the coast.",
  );
  await page.getByRole("button", { name: "Save" }).click();

  await page.getByRole("button", { name: "Search", exact: true }).click();
  const search = page.getByRole("region", { name: "Search notes" });
  const input = search.getByRole("searchbox", { name: "Search notes" });

  await input.fill("embeddings");
  await expect(
    search.getByRole("button", { name: /Architecture/ }),
  ).toBeVisible();
  await expect(search.getByText(/disposable local projections/)).toBeVisible();

  await input.fill("system design");
  await expect(
    search.getByRole("button", { name: /Architecture/ }),
  ).toBeVisible();

  await input.fill("local-first privacy");
  await search.getByRole("button", { name: /Architecture/ }).click();

  await expect(
    page.getByRole("textbox", { name: "Edit Architecture.md" }),
  ).toBeVisible();
});

test("keeps semantic model traffic opt-in", async ({ page }) => {
  const drive = new FakeDrive();
  let modelRequests = 0;

  page.on("request", (request) => {
    const host = new URL(request.url()).hostname;
    if (
      host === "huggingface.co" ||
      host.endsWith(".huggingface.co") ||
      host === "hf.co" ||
      host.endsWith(".hf.co")
    ) {
      modelRequests += 1;
    }
  });

  await prepareDrive(page, drive);
  await openFreshWorkspace(page);
  await createNote(page, "Private");
  const editor = page.getByRole("textbox", { name: "Edit Private.md" });
  await replaceEditorContent(
    page,
    editor,
    "# Private\n\nLocal semantic search must remain opt-in.",
  );
  await page.getByRole("button", { name: "Save" }).click();

  await page.getByRole("button", { name: "Search", exact: true }).click();
  const search = page.getByRole("region", { name: "Search notes" });
  await search
    .getByRole("searchbox", { name: "Search notes" })
    .fill("semantic");
  await expect(
    search.getByRole("button", { name: /Private/ }),
  ).toBeVisible();

  expect(modelRequests).toBe(0);
  await expect(
    search.getByRole("button", {
      name: "Enable local semantic search",
    }),
  ).toBeVisible();
});

test("renders the local graph and opens connected notes", async ({
  page,
}, testInfo) => {
  const drive = new FakeDrive();
  await prepareDrive(page, drive);
  await openFreshWorkspace(page);

  await createNote(page, "Alpha");
  const alpha = page.getByRole("textbox", { name: "Edit Alpha.md" });
  await replaceEditorContent(page, alpha, "# Alpha\n\nLinked to [[Beta]].");
  await page.getByRole("button", { name: "Save" }).click();

  await returnToExplorerOnMobile(page, testInfo.project.name);
  await createNote(page, "Beta");
  const beta = page.getByRole("textbox", { name: "Edit Beta.md" });
  await replaceEditorContent(page, beta, "# Beta\n\nBack to [[Alpha]].");
  await page.getByRole("button", { name: "Save" }).click();

  const tabs = page.getByLabel("Open tabs");
  await tabs.getByRole("button", { name: "Alpha", exact: true }).click();

  await page.getByRole("button", { name: "Graph", exact: true }).click();
  const graph = page.getByRole("region", { name: "Local graph" });

  await expect(graph).toBeVisible();
  await expect(
    graph.getByRole("button", { name: /Beta/ }),
  ).toBeVisible();
  await expect(graph.getByText("Both directions")).toBeVisible();

  await graph.getByRole("button", { name: /Beta/ }).click();
  await expect(
    page.getByRole("textbox", { name: "Edit Beta.md" }),
  ).toBeVisible();
});

test("reuses persisted search snapshots and only downloads changed notes", async ({
  page,
}, testInfo) => {
  const drive = new FakeDrive();
  await prepareDrive(page, drive);
  await openFreshWorkspace(page);

  await createNote(page, "Alpha");
  const alpha = page.getByRole("textbox", { name: "Edit Alpha.md" });
  await replaceEditorContent(page, alpha, "# Alpha\n\nStable local content.");
  await page.getByRole("button", { name: "Save" }).click();

  await returnToExplorerOnMobile(page, testInfo.project.name);
  await createNote(page, "Beta");
  const beta = page.getByRole("textbox", { name: "Edit Beta.md" });
  await replaceEditorContent(page, beta, "# Beta\n\nAlso stable.");
  await page.getByRole("button", { name: "Save" }).click();

  const tabs = page.getByLabel("Open tabs");
  await tabs.getByRole("button", { name: "Close Alpha" }).click();
  await tabs.getByRole("button", { name: "Close Beta" }).click();

  const beforeReload = drive.mediaReadCount();

  await page.reload();
  await page.getByRole("button", { name: "Connect Google Drive" }).click();
  await page
    .getByRole("button", { name: "My Second Brain", exact: false })
    .click();

  await expect(page.getByRole("status")).toContainText("2 reused");
  expect(drive.mediaReadCount()).toBe(beforeReload);

  drive.externalUpdate("Beta.md", "# Beta\n\nChanged outside MindContext.");
  const beforeRefresh = drive.mediaReadCount();

  const files = page.getByRole("complementary", { name: "Files" });
  await files
    .getByRole("button", { name: "Refresh vault and local index" })
    .click();

  await expect(page.getByRole("status")).toContainText("1 downloaded");
  expect(drive.mediaReadCount()).toBe(beforeRefresh + 1);

  await page.getByRole("button", { name: "Search", exact: true }).click();
  const search = page.getByRole("region", { name: "Search notes" });
  await search
    .getByRole("searchbox", { name: "Search notes" })
    .fill("outside MindContext");
  await expect(
    search.getByRole("button", { name: /Beta/ }),
  ).toBeVisible();
});

test("keeps multiple note tabs and restores them from local workspace state", async ({
  page,
}, testInfo) => {
  const drive = new FakeDrive();
  await prepareDrive(page, drive);
  await openFreshWorkspace(page);

  await createNote(page, "Alpha");
  await returnToExplorerOnMobile(page, testInfo.project.name);
  await createNote(page, "Beta");

  const tabs = page.getByLabel("Open tabs");
  await expect(tabs.getByRole("button", { name: "Alpha", exact: true })).toBeVisible();
  await expect(tabs.getByRole("button", { name: "Beta", exact: true })).toBeVisible();

  await tabs.getByRole("button", { name: "Alpha", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Edit Alpha.md" }),
  ).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: "Connect Google Drive" }).click();
  await page.getByRole("button", { name: "My Second Brain", exact: false }).click();

  const restoredTabs = page.getByLabel("Open tabs");
  await expect(
    restoredTabs.getByRole("button", { name: "Alpha", exact: true }),
  ).toBeVisible();
  await expect(
    restoredTabs.getByRole("button", { name: "Beta", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Edit Alpha.md" }),
  ).toBeVisible();

  await restoredTabs.getByRole("button", { name: "Close Beta" }).click();
  await expect(
    restoredTabs.getByRole("button", { name: "Beta", exact: true }),
  ).toHaveCount(0);
});

test("preserves unsaved drafts in memory while switching note tabs", async ({
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
    "# Alpha\n\nUnsaved tab draft",
  );

  await returnToExplorerOnMobile(page, testInfo.project.name);
  await createNote(page, "Beta");

  const tabs = page.getByLabel("Open tabs");
  await expect(tabs.locator(".workspace-tab-dirty")).toHaveCount(1);

  await tabs.getByRole("button", { name: "Alpha", exact: true }).click();
  const restoredAlpha = page.getByRole("textbox", { name: "Edit Alpha.md" });
  await expect(restoredAlpha).toContainText("Unsaved tab draft");

  expect(drive.noteContentByName("Alpha.md")).not.toContain(
    "Unsaved tab draft",
  );

  await page.getByRole("button", { name: "Save" }).click();
  await expect(
    page.getByText("Synced to Google Drive."),
  ).toBeVisible();
  expect(drive.noteContentByName("Alpha.md")).toContain("Unsaved tab draft");
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

  const onboarding = page.getByRole("dialog", {
    name: "How do you want to start?",
  });
  await expect(onboarding).toBeVisible();
  await onboarding
    .getByRole("button", { name: "Create Second Brain", exact: true })
    .click();

  await expect(
    page.getByRole("complementary", { name: "Files" }),
  ).toBeVisible();
}

async function createNote(page: Page, name: string): Promise<void> {
  const files = page.getByRole("complementary", { name: "Files" });
  await files.getByRole("button", { name: "New note", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "New note" });
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByRole("button", { name: "Create", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: `Edit ${name}.md` }),
  ).toBeVisible();
}

async function createFolder(page: Page, name: string): Promise<void> {
  const files = page.getByRole("complementary", { name: "Files" });
  await files.getByRole("button", { name: "New folder", exact: true }).click();
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
    await page.getByRole("button", { name: "Files", exact: true }).click();
    await expect(
      page.getByRole("navigation", { name: "Workspace files" }),
    ).toBeVisible();
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
  contentRevision?: number;
  content: string;
  readonly appProperties?: Record<string, string>;
}

class FakeDrive {
  private workspaceCreated = false;
  private uploadDelayMs = 0;

  setUploadDelay(delayMs: number): void {
    this.uploadDelayMs = delayMs;
  }

  seedExistingWorkspace(): void {
    this.workspaceCreated = true;
  }
  private nextNoteNumber = 1;
  private nextFolderNumber = 1;
  private mediaReads = 0;
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
        contentRevision: 1,
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
          this.mediaReads += 1;
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

      if (this.uploadDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, this.uploadDelayMs));
      }

      object.content = request.postData() ?? "";
      object.version += 1;
      object.contentRevision = (object.contentRevision ?? 0) + 1;
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

  mediaReadCount(): number {
    return this.mediaReads;
  }

  externalUpdate(name: string, content: string): void {
    const object = Array.from(this.objects.values()).find(
      (candidate) => candidate.name === name,
    );
    if (!object) throw new Error(`Missing fake Drive file ${name}`);
    object.content = content;
    object.version += 1;
    object.contentRevision = (object.contentRevision ?? 0) + 1;
  }

  externalMetadataUpdate(name: string): void {
    const object = Array.from(this.objects.values()).find(
      (candidate) => candidate.name === name,
    );
    if (!object) throw new Error(`Missing fake Drive file ${name}`);
    object.version += 1;
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

  paths(): readonly string[] {
    return Array.from(this.objects.values())
      .map((object) => this.pathFor(object))
      .sort((left, right) => left.localeCompare(right));
  }

  contentByPath(path: string): string | undefined {
    const object = Array.from(this.objects.values()).find(
      (candidate) => this.pathFor(candidate) === path,
    );
    return object?.content;
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
      ...(object.contentRevision === undefined
        ? {}
        : { headRevisionId: `content-${object.contentRevision}` }),
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
