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

test("opens and edits an existing local Markdown vault without Google Drive", async ({
  page,
}, testInfo) => {
  const googleRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("googleapis.com")) {
      googleRequests.push(request.url());
    }
  });

  await prepareLocalVault(page);
  await page.getByRole("button", { name: "Open local vault" }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();

  await returnToExplorerOnMobile(page, testInfo.project.name);
  const files = page.getByRole("navigation", { name: "Workspace files" });
  await expect(
    files.getByRole("button", { name: "Existing.md", exact: true }),
  ).toBeVisible();

  await files
    .getByRole("button", { name: "Existing.md", exact: true })
    .click();
  const editor = page.getByRole("textbox", { name: "Edit Existing.md" });
  await expect(editor).toContainText("Existing local note");
  await replaceEditorContent(
    page,
    editor,
    "# Existing\n\nUpdated directly in the local vault.",
  );
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved to local vault.")).toBeVisible();

  const saved = await page.evaluate(() =>
    (window as any).__mindContextReadLocal("Existing.md"),
  );
  expect(saved).toContain("Updated directly in the local vault.");

  await returnToExplorerOnMobile(page, testInfo.project.name);
  await createNote(page, "Created Locally");
  const paths = await page.evaluate(() =>
    (window as any).__mindContextLocalPaths(),
  );
  expect(paths).toContain("Created Locally.md");
  expect(paths).toContain(".obsidian/app.json");
  expect(googleRequests).toHaveLength(0);
});

test("creates and edits a JSON Canvas through the plugin boundary", async ({
  page,
}, testInfo) => {
  await prepareLocalVault(page);
  await page.getByRole("button", { name: "Open local vault" }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();

  await returnToExplorerOnMobile(page, testInfo.project.name);
  await createCanvas(page, "Ideas");

  const canvas = page.getByRole("region", { name: "Ideas.canvas" });
  await expect(canvas).toBeVisible();

  await canvas.getByRole("button", { name: "Text", exact: true }).click();
  await canvas.getByRole("button", { name: "Edit", exact: true }).click();
  const textNode = canvas.getByPlaceholder("Write Markdown…");
  await expect(textNode).toBeVisible();
  await textNode.fill("# Canvas idea\n\n**Connected context**");
  await textNode.blur();

  await expect(
    canvas.getByRole("heading", { name: "Canvas idea" }),
  ).toBeVisible();
  await canvas.getByRole("button", { name: "Green", exact: true }).click();

  await canvas.getByRole("button", { name: "File", exact: true }).click();
  const fileSelector = canvas.getByLabel("Choose a vault file");
  await expect(fileSelector).toBeVisible();
  await fileSelector.selectOption("Existing.md");

  await expect(page.getByText("Saved to local vault.")).toBeVisible({
    timeout: 10_000,
  });

  const raw = await page.evaluate(() =>
    (window as any).__mindContextReadLocal("Ideas.canvas"),
  );
  const saved = JSON.parse(raw) as {
    nodes?: Array<{
      type?: string;
      text?: string;
      file?: string;
      color?: string;
    }>;
  };
  expect(saved.nodes).toHaveLength(2);
  expect(saved.nodes?.find((node) => node.type === "text")).toMatchObject({
    type: "text",
    text: "# Canvas idea\n\n**Connected context**",
    color: "4",
  });
  expect(saved.nodes?.find((node) => node.type === "file")).toMatchObject({
    type: "file",
    file: "Existing.md",
  });

  await canvas.getByRole("button", { name: "Open file", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Edit Existing.md" }),
  ).toBeVisible();
});

test("creates edits and embeds an Excalidraw plugin document", async ({
  page,
}, testInfo) => {
  const externalAssetRequests: string[] = [];
  page.on("request", (request) => {
    const hostname = new URL(request.url()).hostname;
    if (
      hostname === "esm.sh" ||
      hostname === "esm.run" ||
      hostname === "unpkg.com" ||
      hostname === "cdn.jsdelivr.net"
    ) {
      externalAssetRequests.push(request.url());
    }
  });

  await prepareLocalVault(page);
  await page.getByRole("button", { name: "Open local vault" }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();

  await returnToExplorerOnMobile(page, testInfo.project.name);
  await createExcalidraw(page, "Sketch");

  const drawing = page.getByRole("region", { name: "Sketch.excalidraw" });
  await expect(drawing).toBeVisible();

  const excalidrawCanvas = drawing.locator(
    "canvas.excalidraw__canvas.interactive",
  );
  await expect(excalidrawCanvas).toBeVisible();
  const box = await excalidrawCanvas.boundingBox();
  expect(box).not.toBeNull();
  if (!box) throw new Error("Excalidraw canvas has no bounding box.");

  await excalidrawCanvas.click({
    position: {
      x: Math.max(20, Math.min(box.width - 20, box.width / 2)),
      y: Math.max(20, Math.min(box.height - 20, box.height / 2)),
    },
  });
  await page.keyboard.press("2");
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.35);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.65, box.y + box.height * 0.62, {
    steps: 8,
  });
  await page.mouse.up();

  await expect(page.getByText("Saved to local vault.")).toBeVisible({
    timeout: 12_000,
  });

  const rawDrawing = await page.evaluate(() =>
    (window as any).__mindContextReadLocal("Sketch.excalidraw"),
  );
  const savedDrawing = JSON.parse(rawDrawing) as {
    type?: string;
    elements?: Array<{ type?: string; isDeleted?: boolean }>;
  };
  expect(savedDrawing.type).toBe("excalidraw");
  expect(
    savedDrawing.elements?.some(
      (element) => element.type === "rectangle" && element.isDeleted !== true,
    ),
  ).toBe(true);

  await returnToExplorerOnMobile(page, testInfo.project.name);
  await createNote(page, "Drawing Embed");
  const noteEditor = page.getByRole("textbox", {
    name: "Edit Drawing Embed.md",
  });
  await replaceEditorContent(
    page,
    noteEditor,
    "# Drawing Embed\n\n![[Sketch.excalidraw]]",
  );
  await page.getByRole("button", { name: "Save", exact: true }).click();

  const readingViewButton = page.getByRole("button", {
    name: "Reading view",
    exact: true,
  });
  if (!(await readingViewButton.isVisible())) {
    const collapse = page.getByRole("button", {
      name: "Collapse sidebar",
      exact: true,
    });
    if (await collapse.isVisible()) await collapse.click();
  }
  await readingViewButton.click();

  const reading = page.getByLabel("Reading view");
  const embed = reading.locator(".excalidraw-markdown-embed");
  await expect(embed).toBeVisible({ timeout: 10_000 });
  await expect(
    embed.getByRole("img", { name: "Sketch.excalidraw" }),
  ).toBeVisible();
  await embed
    .getByRole("button", { name: "Open Sketch.excalidraw", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Sketch.excalidraw" }),
  ).toBeVisible();

  expect(externalAssetRequests).toEqual([]);
});

test("encrypts selected Markdown and unlocks it through the Reading View popup", async ({
  page,
}, testInfo) => {
  await prepareLocalVault(page);
  await page.getByRole("button", { name: "Open local vault" }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();

  await returnToExplorerOnMobile(page, testInfo.project.name);
  await createNote(page, "Private");

  const editor = page.getByRole("textbox", { name: "Edit Private.md" });
  const secretText = "My private thought\nsecond line.";
  await replaceEditorContent(page, editor, secretText);
  await editor.click();
  await page.keyboard.press("Control+A");

  await page
    .getByRole("button", { name: "Encrypt selection", exact: true })
    .click();

  const encryptDialog = page.getByRole("dialog", {
    name: "Encrypt selection",
  });
  await expect(encryptDialog).toBeVisible();
  await encryptDialog
    .getByLabel("Passphrase", { exact: true })
    .fill("correct horse battery staple");
  await encryptDialog
    .getByLabel("Confirm passphrase", { exact: true })
    .fill("correct horse battery staple");
  await encryptDialog
    .getByRole("button", { name: "Encrypt selection", exact: true })
    .click();
  await expect(encryptDialog).toBeHidden();

  await expect(page.getByText("Saved to local vault.")).toBeVisible({
    timeout: 10_000,
  });

  const raw = await page.evaluate(() =>
    (window as any).__mindContextReadLocal("Private.md"),
  );
  expect(raw).toContain("```mindcontext-encrypted");
  expect(raw).not.toContain("My private thought");
  expect(raw).not.toContain("second line.");

  const readingViewButton = page.getByRole("button", {
    name: "Reading view",
    exact: true,
  });
  if (!(await readingViewButton.isVisible())) {
    const collapse = page.getByRole("button", {
      name: "Collapse sidebar",
      exact: true,
    });
    if (await collapse.isVisible()) await collapse.click();
  }
  await readingViewButton.click();

  const reading = page.getByLabel("Reading view");
  const unlock = reading.getByRole("button", {
    name: "Unlock encrypted content",
    exact: true,
  });
  await expect(unlock).toBeVisible();
  await expect(reading).not.toContainText("My private thought");
  await unlock.click();

  const decryptDialog = page.getByRole("dialog", {
    name: "Encrypted content",
  });
  await expect(decryptDialog).toBeVisible();
  const passphrase = decryptDialog.getByLabel("Passphrase", { exact: true });
  await passphrase.fill("wrong passphrase");
  await decryptDialog
    .getByRole("button", { name: "Decrypt", exact: true })
    .click();
  await expect(
    decryptDialog.getByText("Could not decrypt. Check the passphrase."),
  ).toBeVisible();

  await passphrase.fill("correct horse battery staple");
  await decryptDialog
    .getByRole("button", { name: "Decrypt", exact: true })
    .click();
  await expect(decryptDialog).toContainText("My private thought");
  await expect(decryptDialog).toContainText("second line.");

  await decryptDialog
    .getByRole("button", { name: "Close", exact: true })
    .click();
  await expect(decryptDialog).toBeHidden();
  await expect(reading).not.toContainText("My private thought");
});
test("remembers a local vault identity across reload and folder reselection", async ({
  page,
}, testInfo) => {
  await prepareLocalVault(page);

  await page.getByRole("button", { name: "Open local vault" }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();

  await returnToExplorerOnMobile(page, testInfo.project.name);
  const files = page.getByRole("navigation", { name: "Workspace files" });
  await files
    .getByRole("button", { name: "Existing.md", exact: true })
    .click();

  await expect(
    page.getByRole("textbox", { name: "Edit Existing.md" }),
  ).toBeVisible();

  const workspaceKeyBefore = await waitForPersistedWorkspaceUi(page);
  expect(
    await page.evaluate(() =>
      (window as any).__mindContextLocalPickerCalls(),
    ),
  ).toBe(1);

  await page.reload();

  await expect(page.getByText("Recent local vaults", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Choose the folder again", { exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Open local vault", exact: true }).click();

  await expect(
    page.getByRole("textbox", { name: "Edit Existing.md" }),
  ).toBeVisible({ timeout: 10_000 });

  const workspaceKeyAfter = await waitForPersistedWorkspaceUi(page);
  expect(workspaceKeyAfter).toBe(workspaceKeyBefore);
  expect(
    await page.evaluate(() =>
      (window as any).__mindContextLocalPickerCalls(),
    ),
  ).toBe(2);
});

test("drops files and pastes clipboard images into the active note folder", async ({
  page,
}) => {
  const drive = new FakeDrive();
  await prepareDrive(page, drive);
  await openFreshWorkspace(page);
  await createFolder(page, "Journal");
  await createNote(page, "Capture");

  const editor = page.getByRole("textbox", { name: "Edit Capture.md" });
  await replaceEditorContent(page, editor, "# Capture\n\n");

  await editor.evaluate((element) => {
    const transfer = new DataTransfer();
    transfer.items.add(
      new File(
        [
          '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12"></svg>',
        ],
        "dropped-diagram.svg",
        { type: "image/svg+xml" },
      ),
    );
    const rect = element.getBoundingClientRect();
    element.dispatchEvent(
      new DragEvent("dragenter", {
        bubbles: true,
        cancelable: true,
        dataTransfer: transfer,
        clientX: rect.left + 20,
        clientY: rect.top + 20,
      }),
    );
    element.dispatchEvent(
      new DragEvent("drop", {
        bubbles: true,
        cancelable: true,
        dataTransfer: transfer,
        clientX: rect.left + 20,
        clientY: rect.top + 20,
      }),
    );
  });

  await expect(
    page.getByText("1 attachment added to the vault."),
  ).toBeVisible();
  await expect(editor).toContainText("dropped-diagram.svg");
  expect(drive.filePathByName("dropped-diagram.svg")).toBe(
    "Journal/dropped-diagram.svg",
  );

  await editor.click();
  await editor.evaluate((element) => {
    const transfer = new DataTransfer();
    transfer.items.add(
      new File(["clipboard image"], "image.png", {
        type: "image/png",
      }),
    );
    element.dispatchEvent(
      new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: transfer,
      }),
    );
  });

  await expect(
    page.getByText("1 attachment added to the vault."),
  ).toBeVisible();
  await expect(editor).toContainText("pasted-image.png");
  expect(drive.filePathByName("pasted-image.png")).toBe(
    "Journal/pasted-image.png",
  );

  await editor.evaluate((element) => {
    const transfer = new DataTransfer();
    transfer.items.add(
      new File(["second clipboard image"], "image.png", {
        type: "image/png",
      }),
    );
    element.dispatchEvent(
      new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: transfer,
      }),
    );
  });

  await expect(editor).toContainText("pasted-image-2.png");
  expect(drive.filePathByName("pasted-image-2.png")).toBe(
    "Journal/pasted-image-2.png",
  );
});

test("adds ordinary vault attachments and renders referenced images", async ({
  page,
}) => {
  const drive = new FakeDrive();
  await prepareDrive(page, drive);
  await openFreshWorkspace(page);
  await createNote(page, "Media");

  const editor = page.getByRole("textbox", { name: "Edit Media.md" });
  await replaceEditorContent(page, editor, "# Media\n");

  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><rect width="24" height="24"/></svg>';
  await page.getByTestId("attachment-input").setInputFiles([
    {
      name: "diagram.svg",
      mimeType: "image/svg+xml",
      buffer: Buffer.from(svg),
    },
    {
      name: "reference.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4\nMindContext attachment fixture"),
    },
  ]);

  await expect(
    page.getByText("2 attachments added to the vault."),
  ).toBeVisible();

  await expect(editor).toContainText("![diagram.svg](./diagram.svg)");
  await expect(editor).toContainText("[reference.pdf](./reference.pdf)");

  const files = page.getByRole("navigation", { name: "Workspace files" });
  if (!(await files.isVisible())) {
    await page.getByRole("button", { name: "Files", exact: true }).click();
    await expect(files).toBeVisible();
  }
  await expect(
    files.getByRole("button", { name: "diagram.svg", exact: true }),
  ).toBeVisible();
  await expect(
    files.getByRole("button", { name: "reference.pdf", exact: true }),
  ).toBeVisible();

  const readingView = page.getByRole("button", {
    name: "Reading view",
    exact: true,
  });
  if (!(await readingView.isVisible())) {
    const collapse = page.getByRole("button", {
      name: "Collapse sidebar",
      exact: true,
    });
    if (await collapse.isVisible()) await collapse.click();
  }
  await readingView.click();
  const reading = page.getByLabel("Reading view");
  const image = reading.getByRole("img", { name: "diagram.svg" });
  await expect(image).toBeVisible();
  await expect(image).toHaveAttribute("src", /^blob:/);
  await expect(
    reading.getByRole("button", { name: "reference.pdf" }),
  ).toBeVisible();

  expect(drive.filePathByName("diagram.svg")).toBe("diagram.svg");
  expect(drive.filePathByName("reference.pdf")).toBe("reference.pdf");
});

test("uses Home as the workspace start surface and persists it", async ({
  page,
}) => {
  const drive = new FakeDrive();
  await prepareDrive(page, drive);
  await openFreshWorkspace(page);

  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await expect(
    page.getByLabel("Google Drive status: Synced"),
  ).toBeVisible();

  await createNote(page, "HomeNote");
  const editor = page.getByRole("textbox", { name: "Edit HomeNote.md" });
  await replaceEditorContent(page, editor, "# HomeNote\n\nHome content");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Synced", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Home", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await expect(
    page
      .locator(".workspace-home")
      .getByRole("button", { name: /HomeNote/ })
      .first(),
  ).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: "Connect Google Drive" }).click();
  await expect(page.getByText("Choose your brain.")).toBeVisible();
  await page.getByRole("button", { name: /My Second Brain/ }).click();

  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Edit HomeNote.md" })).toHaveCount(0);
});

test("opens and executes commands from the universal launcher", async ({
  page,
}) => {
  const drive = new FakeDrive();
  await prepareDrive(page, drive);
  await openFreshWorkspace(page);

  await page.keyboard.press("Control+K");
  const launcher = page.getByRole("dialog", { name: "Command palette" });
  await expect(launcher).toBeVisible();

  const input = launcher.getByLabel("Search notes or run a command");
  await input.fill("settings");
  await page.keyboard.press("Enter");

  await expect(
    page.getByRole("complementary", { name: "Settings" }),
  ).toBeVisible();

  await page.keyboard.press("Control+K");
  await expect(page.getByRole("dialog", { name: "Command palette" })).toBeVisible();
  await page.getByLabel("Search notes or run a command").fill("new note");
  await page.keyboard.press("Enter");

  await expect(page.getByRole("dialog", { name: "New note" })).toBeVisible();
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

test("keeps editor focus and cursor position across autosync completion", async ({
  page,
}) => {
  const drive = new FakeDrive();
  drive.setUploadDelay(900);
  await prepareDrive(page, drive);
  await openFreshWorkspace(page);
  await createNote(page, "Focus");

  const editor = page.getByRole("textbox", { name: "Edit Focus.md" });
  await replaceEditorContent(page, editor, "# Focus\n\nTyping");
  await expect(editor).toBeFocused();

  await expect(page.getByText("Syncing…", { exact: true })).toBeVisible();
  await page.keyboard.insertText(" during sync");
  await expect(editor).toBeFocused();

  await expect(page.getByText("Synced", { exact: true })).toBeVisible({
    timeout: 7000,
  });
  await expect(editor).toBeFocused();

  await page.keyboard.insertText(" after sync");
  await expect(editor).toContainText("Typing during sync after sync");

  await expect(page.getByText("Synced", { exact: true })).toBeVisible({
    timeout: 7000,
  });
  expect(drive.noteContentByName("Focus.md")).toBe(
    "# Focus\n\nTyping during sync after sync",
  );
});

test("keeps edits local after Drive authorization expires and resumes after reconnect", async ({
  page,
}) => {
  const drive = new FakeDrive();
  await prepareDrive(page, drive);
  await openFreshWorkspace(page);
  await createNote(page, "Session");

  const editor = page.getByRole("textbox", { name: "Edit Session.md" });
  await replaceEditorContent(page, editor, "# Session\n\nbefore expiry");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Synced", { exact: true })).toBeVisible();
  expect(drive.noteContentByName("Session.md")).toBe(
    "# Session\n\nbefore expiry",
  );

  drive.expireInitialToken();
  const localAfterExpiry = "# Session\n\nwritten while Drive is expired";
  await replaceEditorContent(page, editor, localAfterExpiry);

  await expect(
    page.getByText("Reconnect Google Drive", { exact: true }).first(),
  ).toBeVisible({ timeout: 5000 });
  await expect(page.getByText("Saved locally", { exact: true })).toBeVisible();
  await expect(
    page.getByLabel("Google Drive status: Reconnect"),
  ).toBeVisible();
  await expect(editor).toContainText("written while Drive is expired");
  expect(drive.noteContentByName("Session.md")).toBe(
    "# Session\n\nbefore expiry",
  );

  await page
    .getByRole("button", { name: "Reconnect Drive", exact: true })
    .click();

  await expect(page.locator(".drive-session-banner")).toHaveCount(0);

  await expect
    .poll(() => drive.noteContentByName("Session.md"), { timeout: 7000 })
    .toBe(localAfterExpiry);
  await expect(page.getByText("Synced", { exact: true })).toBeVisible();
  await expect(
    page.getByLabel("Google Drive status: Synced"),
  ).toBeVisible();
});

test("keeps a create-note intent open across Drive reconnect", async ({
  page,
}, testInfo) => {
  const drive = new FakeDrive();
  await prepareDrive(page, drive);
  await openFreshWorkspace(page);

  drive.expireInitialToken();
  if (testInfo.project.name.startsWith("mobile")) {
    await page.getByRole("button", { name: "Files", exact: true }).click();
  }

  const files = page.getByRole("complementary", { name: "Files" });
  await files.getByRole("button", { name: "New note", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "New note" });
  await dialog.getByLabel("Name").fill("AfterReconnect");
  await dialog.getByRole("button", { name: "Create", exact: true }).click();

  await expect(dialog).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Reconnect Drive", exact: true }),
  ).toBeVisible();

  await page
    .getByRole("button", { name: "Reconnect Drive", exact: true })
    .click();
  await expect(page.locator(".drive-session-banner")).toHaveCount(0);

  await dialog.getByRole("button", { name: "Create", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Edit AfterReconnect.md" }),
  ).toBeVisible();
  expect(drive.noteContentByName("AfterReconnect.md")).toBe("");
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

  await expect
    .poll(() =>
      drive.paths().find(
        (path) =>
          path.includes(".mindcontext-recovery/resolved--") &&
          path.includes("Conflict.remote-before-overwrite.") &&
          path.endsWith(".md"),
      ),
    )
    .toBeTruthy();
  const remoteRecoveryPath = drive.paths().find(
    (path) =>
      path.includes(".mindcontext-recovery/resolved--") &&
      path.includes("Conflict.remote-before-overwrite.") &&
      path.endsWith(".md"),
  )!;
  expect(drive.contentByPath(remoteRecoveryPath)).toBe(
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

test("shows Drive loading feedback before deciding a vault is empty", async ({
  page,
}) => {
  const drive = new FakeDrive();
  drive.seedExistingWorkspace();
  drive.setListDelay(700);
  await prepareDrive(page, drive);

  await page.getByRole("button", { name: "Connect Google Drive" }).click();
  await expect(page.getByText("Choose your brain.")).toBeVisible();
  await page.getByRole("button", { name: /My Second Brain/ }).click();

  await expect(
    page.getByText("Loading vault files…", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".drive-tree-skeleton")).toBeVisible();
  await expect(page.getByText("Open a note", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("dialog", {
      name: "This Second Brain is completely empty",
    }),
  ).not.toBeVisible();

  await expect(
    page.getByRole("dialog", {
      name: "This Second Brain is completely empty",
    }),
  ).toBeVisible({ timeout: 6000 });
  await expect(
    page.getByText("Loading vault files…", { exact: true }),
  ).toHaveCount(0);
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

test("renders Obsidian P0 syntax and navigates headings and block refs", async ({
  page,
}, testInfo) => {
  const drive = new FakeDrive();
  await prepareDrive(page, drive);
  await openFreshWorkspace(page);

  await createNote(page, "Target");
  const targetEditor = page.getByRole("textbox", { name: "Edit Target.md" });
  await replaceEditorContent(
    page,
    targetEditor,
    [
      "# Target",
      "",
      "Intro.",
      "",
      "## Deep Section",
      "",
      "Deep section content.",
      "",
      "Decision paragraph. ^decision-42",
      "",
    ].join("\n"),
  );
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Synced", { exact: true })).toBeVisible();

  await returnToExplorerOnMobile(page, testInfo.project.name);
  await createNote(page, "Source");
  const sourceEditor = page.getByRole("textbox", { name: "Edit Source.md" });
  await replaceEditorContent(
    page,
    sourceEditor,
    [
      "---",
      'related: "[[Target#Deep Section]]"',
      "---",
      "",
      "# Source",
      "",
      "==Highlighted knowledge==",
      "",
      "Visible %%editing-only comment%% text.",
      "",
      "> [!warning]+ Deployment warning",
      "> Check the release plan.",
      "",
      "A standard footnote.[^source]",
      "",
      "[^source]: Standard footnote detail.",
      "",
      "An inline footnote ^[Inline footnote detail].",
      "",
      "[[Target#Deep Section|Open section]]",
      "",
      "[[Target#^decision-42|Open decision]]",
      "",
    ].join("\n"),
  );
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Synced", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Reading view", exact: true }).click();
  const reading = page.getByLabel("Reading view");

  await expect(reading.locator("mark.obsidian-highlight")).toHaveText(
    "Highlighted knowledge",
  );
  await expect(reading.getByText("editing-only comment")).toHaveCount(0);
  const callout = reading.locator(".obsidian-callout");
  await expect(callout).toBeVisible();
  await expect(callout.locator(".obsidian-callout-title")).toHaveText(
    "Deployment warning",
  );
  await expect(reading.getByText("Standard footnote detail.")).toBeVisible();
  await expect(reading.getByText("Inline footnote detail")).toBeVisible();

  await reading.getByRole("button", { name: "Open section" }).click();
  const targetAfterHeading = page.getByRole("textbox", {
    name: "Edit Target.md",
  });
  await expect(targetAfterHeading).toBeVisible();
  await expect(page.locator(".cm-activeLine")).toContainText("## Deep Section");

  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByLabel("Reading view")).toBeVisible();
  await page
    .getByLabel("Reading view")
    .getByRole("button", { name: "Open decision" })
    .click();

  await expect(
    page.getByRole("textbox", { name: "Edit Target.md" }),
  ).toBeVisible();
  await expect(page.locator(".cm-activeLine")).toContainText(
    "Decision paragraph.",
  );
});

test("pre-auth screen avoids repeating the product name", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("img", { name: "MindContext — Constellation" })).toBeVisible();
  await expect(page.getByText("Privacy-first · Markdown-first · Your own files", { exact: true })).toBeVisible();
  await expect(page.getByText("MindContext — Constellation", { exact: true })).toHaveCount(0);
});

test("applies the Constellation brand foundation in the workspace", async ({
  page,
}) => {
  const drive = new FakeDrive();
  await prepareDrive(page, drive);
  await openFreshWorkspace(page);

  await expect(page.locator(".workspace-brand-mark")).toHaveCount(1);

  const tokens = await page.evaluate(() => {
    const styles = getComputedStyle(document.documentElement);
    return {
      contextBlue: styles.getPropertyValue("--mc-context-blue").trim(),
      deepBlue: styles.getPropertyValue("--mc-deep-blue").trim(),
      focusAmber: styles.getPropertyValue("--mc-focus-amber").trim(),
    };
  });

  expect(tokens).toEqual({
    contextBlue: "#7a8dff",
    deepBlue: "#536fd8",
    focusAmber: "#ffb257",
  });
});

test("renders Markdown task lists as compact checkboxes", async ({
  page,
}) => {
  const drive = new FakeDrive();
  await prepareDrive(page, drive);
  await openFreshWorkspace(page);

  await createNote(page, "Tasks");
  const editor = page.getByRole("textbox", { name: "Edit Tasks.md" });
  await replaceEditorContent(
    page,
    editor,
    [
      "# Tasks",
      "",
      "- [ ] Open task",
      "- [x] Finished task",
      "  - [ ] Nested task",
    ].join("\n"),
  );
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Synced", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Reading view", exact: true }).click();
  const reading = page.getByLabel("Reading view");
  const checkboxes = reading.locator('input[type="checkbox"]');

  await expect(checkboxes).toHaveCount(3);
  await expect(checkboxes.nth(0)).not.toBeChecked();
  await expect(checkboxes.nth(1)).toBeChecked();
  await expect(checkboxes.nth(2)).not.toBeChecked();

  const box = await checkboxes.nth(0).evaluate((element) => {
    const styles = window.getComputedStyle(element);
    return {
      width: element.getBoundingClientRect().width,
      height: element.getBoundingClientRect().height,
      minHeight: styles.minHeight,
    };
  });

  expect(box.width).toBeLessThan(24);
  expect(box.height).toBeLessThan(24);
  expect(box.minHeight).not.toBe("44px");
  await expect(reading.locator(".contains-task-list").first()).toBeVisible();
  await expect(reading.getByText("Nested task")).toBeVisible();
});

test("authors portable Markdown with toolbar and slash commands", async ({
  page,
}) => {
  const drive = new FakeDrive();
  await prepareDrive(page, drive);
  await openFreshWorkspace(page);

  await createNote(page, "Authoring");
  const editor = page.getByRole("textbox", {
    name: "Edit Authoring.md",
  });

  await replaceEditorContent(page, editor, "");
  await page.getByRole("button", { name: "Bullet list", exact: true }).click();
  await page.keyboard.insertText("First item");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Synced", { exact: true })).toBeVisible();
  expect(drive.noteContentByName("Authoring.md")).toBe("- First item");

  await replaceEditorContent(page, editor, "");
  await page.getByRole("button", { name: "Code block", exact: true }).click();
  await page.keyboard.insertText("const answer = 42;");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Synced", { exact: true })).toBeVisible();
  expect(drive.noteContentByName("Authoring.md")).toBe(
    "```\nconst answer = 42;\n```",
  );

  await replaceEditorContent(page, editor, "/tab");
  const tableCompletion = page
    .locator('.cm-tooltip-autocomplete [role="option"]')
    .filter({ hasText: "Table" });
  await expect(tableCompletion).toBeVisible();
  await tableCompletion.click();
  await page.keyboard.insertText("Topic");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Synced", { exact: true })).toBeVisible();

  expect(drive.noteContentByName("Authoring.md")).toContain(
    "| Topic | Column 2 | Column 3 |",
  );
  expect(drive.noteContentByName("Authoring.md")).toContain(
    "| --- | --- | --- |",
  );
});

test("renders Obsidian P1 math Mermaid and highlighted code locally", async ({
  page,
}) => {
  const drive = new FakeDrive();
  await prepareDrive(page, drive);
  await openFreshWorkspace(page);

  await createNote(page, "RichMarkdown");
  const editor = page.getByRole("textbox", {
    name: "Edit RichMarkdown.md",
  });
  await replaceEditorContent(
    page,
    editor,
    [
      "# Rich Markdown",
      "",
      "Inline math $E = mc^2$.",
      "",
      "$$",
      "\\int_0^1 x^2 \\, dx = \\frac{1}{3}",
      "$$",
      "",
      "```javascript",
      "const answer = 42;",
      "console.log(answer);",
      "```",
      "",
      "```mermaid",
      "flowchart LR",
      "  Markdown --> Parser",
      "  Parser --> ReadingView",
      "```",
      "",
    ].join("\n"),
  );
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Synced", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Reading view", exact: true }).click();
  const reading = page.getByLabel("Reading view");

  await expect(
    reading.locator('mjx-container.MathJax[jax="SVG"]').first(),
  ).toBeVisible();
  await expect(
    reading.locator('mjx-container.MathJax[display="true"]'),
  ).toBeVisible();

  const highlightedCode = reading.locator(
    "pre code.language-javascript",
  );
  await expect(highlightedCode).toBeVisible();
  await expect(highlightedCode.locator(".token.keyword")).toContainText("const");

  const diagram = reading.locator(
    '.mermaid-diagram[data-mermaid-state="ready"]',
  );
  await expect(diagram).toBeVisible({ timeout: 15000 });
  await expect(diagram.locator("svg")).toBeVisible();

  expect(drive.noteContentByName("RichMarkdown.md")).toContain(
    "```mermaid",
  );
  expect(drive.noteContentByName("RichMarkdown.md")).toContain(
    "$E = mc^2$",
  );
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
  const switcher = page.getByRole("dialog", { name: "Command palette" });
  await expect(switcher).toBeVisible();
  await switcher.getByLabel("Search notes or run a command").fill("Alpha");
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
  if (!(await files.isVisible())) {
    await page.getByRole("button", { name: "Files", exact: true }).click();
    await expect(files).toBeVisible();
  }
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

test("collapsed left sidebar gives the workspace all remaining desktop width", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name.startsWith("mobile"));

  const drive = new FakeDrive();
  await prepareDrive(page, drive);
  await openFreshWorkspace(page);
  await createNote(page, "Wide");

  const workspaceMain = page.locator(".workspace-main");
  const rail = page.locator(".workspace-rail");
  const before = await workspaceMain.boundingBox();
  const railBox = await rail.boundingBox();
  const viewport = page.viewportSize();
  expect(before).not.toBeNull();
  expect(railBox).not.toBeNull();
  expect(viewport).not.toBeNull();

  await page
    .getByRole("button", { name: "Collapse sidebar", exact: true })
    .click();

  const after = await workspaceMain.boundingBox();
  expect(after).not.toBeNull();
  expect(after!.x).toBeCloseTo(railBox!.x + railBox!.width, 0);
  expect(after!.width).toBeCloseTo(
    viewport!.width - railBox!.width,
    0,
  );
  expect(after!.width).toBeGreaterThan(before!.width);
});

test("tree active note always follows the currently selected tab", async ({
  page,
}, testInfo) => {
  const drive = new FakeDrive();
  await prepareDrive(page, drive);
  await openFreshWorkspace(page);

  await createNote(page, "Alpha");
  await returnToExplorerOnMobile(page, testInfo.project.name);
  await createNote(page, "Beta");
  await returnToExplorerOnMobile(page, testInfo.project.name);

  const files = page.getByRole("navigation", { name: "Workspace files" });
  const alphaTree = files.getByRole("button", {
    name: "Alpha.md",
    exact: true,
  });
  const betaTree = files.getByRole("button", {
    name: "Beta.md",
    exact: true,
  });

  await alphaTree.click();
  await expect(
    page.getByRole("textbox", { name: "Edit Alpha.md" }),
  ).toBeVisible();

  const tabs = page.getByLabel("Open tabs");
  await tabs.getByRole("button", { name: "Beta", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Edit Beta.md" }),
  ).toBeVisible();

  if (!(await files.isVisible())) {
    await page.getByRole("button", { name: "Files", exact: true }).click();
    await expect(files).toBeVisible();
  }

  await expect(alphaTree).not.toHaveAttribute("aria-current", "page");
  await expect(betaTree).toHaveAttribute("aria-current", "page");
  await expect(
    files.locator('.tree-main[aria-current="page"]'),
  ).toHaveCount(1);
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

test("folder action popover overlays the tree and attaches into that folder", async ({
  page,
}, testInfo) => {
  const drive = new FakeDrive();
  await prepareDrive(page, drive);
  await openFreshWorkspace(page);
  await createFolder(page, "Assets");
  await page.getByRole("button", { name: "/", exact: true }).click();
  await createFolder(page, "Following");

  await returnToExplorerOnMobile(page, testInfo.project.name);
  const files = page.getByRole("navigation", { name: "Workspace files" });
  const following = files.getByRole("button", {
    name: "Following",
    exact: true,
  });
  const before = await following.boundingBox();

  await files.getByRole("button", { name: "Actions for Assets" }).click();
  const popover = page.getByRole("dialog", { name: "Actions for Assets" });
  await expect(popover).toBeVisible();
  await expect(
    popover.getByRole("button", { name: "Attach file here", exact: true }),
  ).toBeVisible();

  const after = await following.boundingBox();
  expect(before?.y).toBe(after?.y);

  await popover
    .getByRole("button", { name: "Attach file here", exact: true })
    .click();
  await page.getByTestId("attachment-input").setInputFiles({
    name: "inside-assets.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("folder attachment"),
  });

  await expect(
    page.getByText("1 attachment added to the vault."),
  ).toBeVisible();
  expect(drive.filePathByName("inside-assets.txt")).toBe(
    "Assets/inside-assets.txt",
  );
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

async function prepareLocalVault(page: Page): Promise<void> {
  await page.addInitScript(() => {
    type LocalFileNode = {
      kind: "file";
      name: string;
      content: string;
      mimeType: string;
      modifiedAt: number;
    };
    type LocalDirectoryNode = {
      kind: "directory";
      id: string;
      name: string;
      children: Map<string, LocalNode>;
    };
    type LocalNode = LocalFileNode | LocalDirectoryNode;

    const textFromChunk = async (chunk: unknown): Promise<string> => {
      if (typeof chunk === "string") return chunk;
      if (chunk instanceof Blob) return chunk.text();
      if (chunk instanceof ArrayBuffer) {
        return new TextDecoder().decode(new Uint8Array(chunk));
      }
      if (ArrayBuffer.isView(chunk)) {
        return new TextDecoder().decode(
          new Uint8Array(
            chunk.buffer,
            chunk.byteOffset,
            chunk.byteLength,
          ),
        );
      }
      return String(chunk ?? "");
    };

    class FakeLocalFileHandle {
      readonly kind = "file" as const;

      constructor(readonly node: LocalFileNode) {}

      get name(): string {
        return this.node.name;
      }

      async getFile(): Promise<File> {
        return new File([this.node.content], this.node.name, {
          type: this.node.mimeType,
          lastModified: this.node.modifiedAt,
        });
      }

      async createWritable() {
        const node = this.node;
        return {
          async write(chunk: unknown) {
            node.content = await textFromChunk(chunk);
            node.modifiedAt += 1;
          },
          async close() {},
          async abort() {},
        };
      }
    }

    class FakeLocalDirectoryHandle {
      readonly kind = "directory" as const;

      constructor(readonly node: LocalDirectoryNode) {}

      get name(): string {
        return this.node.name;
      }

      async *entries(): AsyncGenerator<
        [string, FakeLocalFileHandle | FakeLocalDirectoryHandle]
      > {
        for (const [name, child] of this.node.children.entries()) {
          yield [
            name,
            child.kind === "file"
              ? new FakeLocalFileHandle(child)
              : new FakeLocalDirectoryHandle(child),
          ];
        }
      }

      async getFileHandle(
        name: string,
        options?: { create?: boolean },
      ): Promise<FakeLocalFileHandle> {
        const current = this.node.children.get(name);
        if (current?.kind === "file") {
          return new FakeLocalFileHandle(current);
        }
        if (current) {
          throw new DOMException("Wrong kind", "TypeMismatchError");
        }
        if (!options?.create) {
          throw new DOMException("Not found", "NotFoundError");
        }
        const created: LocalFileNode = {
          kind: "file",
          name,
          content: "",
          mimeType: name.toLowerCase().endsWith(".md")
            ? "text/markdown"
            : "application/octet-stream",
          modifiedAt: Date.now(),
        };
        this.node.children.set(name, created);
        return new FakeLocalFileHandle(created);
      }

      async getDirectoryHandle(
        name: string,
        options?: { create?: boolean },
      ): Promise<FakeLocalDirectoryHandle> {
        const current = this.node.children.get(name);
        if (current?.kind === "directory") {
          return new FakeLocalDirectoryHandle(current);
        }
        if (current) {
          throw new DOMException("Wrong kind", "TypeMismatchError");
        }
        if (!options?.create) {
          throw new DOMException("Not found", "NotFoundError");
        }
        const created: LocalDirectoryNode = {
          kind: "directory",
          id: `${this.node.id}/${name}`,
          name,
          children: new Map(),
        };
        this.node.children.set(name, created);
        return new FakeLocalDirectoryHandle(created);
      }

      async removeEntry(name: string): Promise<void> {
        if (!this.node.children.delete(name)) {
          throw new DOMException("Not found", "NotFoundError");
        }
      }

      async isSameEntry(other: unknown): Promise<boolean> {
        return (
          typeof other === "object" &&
          other !== null &&
          "node" in other &&
          typeof (other as { node?: unknown }).node === "object" &&
          (other as { node?: { id?: unknown } }).node?.id === this.node.id
        );
      }
    }

    const obsidian: LocalDirectoryNode = {
      kind: "directory",
      id: "local-test-root/.obsidian",
      name: ".obsidian",
      children: new Map([
        [
          "app.json",
          {
            kind: "file",
            name: "app.json",
            content: "{}",
            mimeType: "application/json",
            modifiedAt: Date.now(),
          },
        ],
      ]),
    };
    const root: LocalDirectoryNode = {
      kind: "directory",
      id: "local-test-root",
      name: "Obsidian Vault",
      children: new Map([
        [
          "Existing.md",
          {
            kind: "file",
            name: "Existing.md",
            content: "# Existing\n\nExisting local note.",
            mimeType: "text/markdown",
            modifiedAt: Date.now(),
          },
        ],
        [".obsidian", obsidian],
      ]),
    };

    const readNode = (path: string): LocalNode | undefined => {
      let current: LocalNode = root;
      for (const segment of path.split("/").filter(Boolean)) {
        if (current.kind !== "directory") return undefined;
        const next = current.children.get(segment);
        if (!next) return undefined;
        current = next;
      }
      return current;
    };

    const collectPaths = (
      directory: LocalDirectoryNode,
      prefix = "",
    ): string[] => {
      const paths: string[] = [];
      for (const child of directory.children.values()) {
        const path = prefix ? `${prefix}/${child.name}` : child.name;
        if (child.kind === "file") {
          paths.push(path);
        } else {
          paths.push(...collectPaths(child, path));
        }
      }
      return paths.sort();
    };

    Object.defineProperty(window, "showDirectoryPicker", {
      configurable: true,
      value: async () => {
        const key = "__mindcontextLocalPickerCalls";
        const next = Number(window.localStorage.getItem(key) ?? "0") + 1;
        window.localStorage.setItem(key, String(next));
        return new FakeLocalDirectoryHandle(root);
      },
    });
    (window as any).__mindContextLocalPickerCalls = () =>
      Number(window.localStorage.getItem("__mindcontextLocalPickerCalls") ?? "0");
    (window as any).__mindContextReadLocal = (path: string) => {
      const node = readNode(path);
      return node?.kind === "file" ? node.content : undefined;
    };
    (window as any).__mindContextLocalPaths = () => collectPaths(root);
  });

  await page.goto("/");
}

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
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();
}

async function waitForPersistedWorkspaceUi(page: Page): Promise<string> {
  let persistedKey = "";
  await expect
    .poll(async () => {
      persistedKey = await page.evaluate(() => {
        for (const [key, value] of Object.entries(window.localStorage)) {
          if (!key.startsWith("mindcontext.workspace-ui.")) continue;
          try {
            const parsed = JSON.parse(value) as { tabs?: unknown[] };
            if (Array.isArray(parsed.tabs) && parsed.tabs.length > 0) {
              return key;
            }
          } catch {
            // Ignore malformed unrelated localStorage values.
          }
        }
        return "";
      });
      return persistedKey.length > 0;
    })
    .toBe(true);
  return persistedKey;
}

async function createNote(page: Page, name: string): Promise<void> {
  const files = page.getByRole("complementary", { name: "Files" });
  if (!(await files.isVisible())) {
    await page.getByRole("button", { name: "Files", exact: true }).click();
    await expect(files).toBeVisible();
  }
  await files.getByRole("button", { name: "New note", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "New note" });
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByRole("button", { name: "Create", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: `Edit ${name}.md` }),
  ).toBeVisible();
}

async function createCanvas(page: Page, name: string): Promise<void> {
  const files = page.getByRole("complementary", { name: "Files" });
  if (!(await files.isVisible())) {
    await page.getByRole("button", { name: "Files", exact: true }).click();
    await expect(files).toBeVisible();
  }
  await files.getByRole("button", { name: "New canvas", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "New canvas" });
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByRole("button", { name: "Create", exact: true }).click();
  await expect(
    page.getByRole("region", { name: `${name}.canvas` }),
  ).toBeVisible();
}

async function createExcalidraw(
  page: Page,
  name: string,
): Promise<void> {
  const files = page.getByRole("complementary", { name: "Files" });
  if (!(await files.isVisible())) {
    await page.getByRole("button", { name: "Files", exact: true }).click();
    await expect(files).toBeVisible();
  }
  await files
    .getByRole("button", { name: "New Excalidraw", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "New Excalidraw" });
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByRole("button", { name: "Create", exact: true }).click();
  await expect(
    page.getByRole("region", { name: `${name}.excalidraw` }),
  ).toBeVisible({ timeout: 10_000 });
}

async function createFolder(page: Page, name: string): Promise<void> {
  const files = page.getByRole("complementary", { name: "Files" });
  if (!(await files.isVisible())) {
    await page.getByRole("button", { name: "Files", exact: true }).click();
    await expect(files).toBeVisible();
  }
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
                    window.__mindContextTokenCounter =
                      (window.__mindContextTokenCounter || 0) + 1;
                    config.callback({
                      access_token:
                        "e2e-access-token-" + window.__mindContextTokenCounter,
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
  private listDelayMs = 0;
  private rejectInitialToken = false;

  setUploadDelay(delayMs: number): void {
    this.uploadDelayMs = delayMs;
  }

  setListDelay(delayMs: number): void {
    this.listDelayMs = delayMs;
  }

  expireInitialToken(): void {
    this.rejectInitialToken = true;
  }

  seedExistingWorkspace(): void {
    this.workspaceCreated = true;
  }
  private nextNoteNumber = 1;
  private nextFolderNumber = 1;
  private nextFileNumber = 1;
  private mediaReads = 0;
  private readonly objects = new Map<string, StoredObject>();

  async handle(route: Route): Promise<void> {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const authorization = request.headers()["authorization"];

    if (
      this.rejectInitialToken &&
      authorization === "Bearer e2e-access-token-1"
    ) {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({
          error: {
            code: 401,
            message: "Invalid Credentials",
          },
        }),
      });
      return;
    }

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

      if (body.parents?.length) {
        const file: StoredObject = {
          id: `file-${this.nextFileNumber++}`,
          name: body.name ?? "Attachment",
          mimeType: body.mimeType ?? "application/octet-stream",
          parents: [...body.parents],
          version: 1,
          content: "",
        };
        this.objects.set(file.id, file);
        await this.json(route, this.metadata(file));
        return;
      }
    }

    if (method === "GET" && url.pathname === "/drive/v3/files") {
      const query = url.searchParams.get("q") ?? "";
      const parentId = /'([^']+)' in parents/.exec(query)?.[1];
      if (parentId) {
        if (this.listDelayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, this.listDelayMs));
        }
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
