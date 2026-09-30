import { describe, expect, it } from "vitest";
import type { Extension } from "@mind-context/extension-api";
import {
  ExtensionHost,
  FileTypeRegistry,
  registerBuiltInFileTypes,
} from "./extensions";

describe("FileTypeRegistry", () => {
  it("resolves the most specific registered extension", () => {
    const registry = new FileTypeRegistry();
    registerBuiltInFileTypes(registry);
    registry.register("test", {
      id: "excalidraw-markdown",
      extensions: [".excalidraw.md"],
      contentKind: "text",
      viewType: "excalidraw",
      priority: 10,
    });

    expect(registry.resolve("drawing.excalidraw.md")?.id).toBe(
      "excalidraw-markdown",
    );
    expect(registry.resolve("note.md")?.id).toBe("markdown");
  });

  it("lets an extension register a file type through the host", async () => {
    const host = new ExtensionHost();
    const extension: Extension = {
      manifest: {
        id: "test.canvas",
        name: "Canvas",
        version: "1.0.0",
        capabilities: ["views.register"],
      },
      async activate(context) {
        context.views.registerFileType({
          id: "canvas",
          extensions: [".canvas"],
          contentKind: "text",
          viewType: "canvas",
        });
      },
      async deactivate() {},
    };

    await host.activate(extension);
    expect(host.fileTypes.resolve("board.canvas")?.extensionId).toBe(
      "test.canvas",
    );

    await host.deactivate("test.canvas");
    expect(host.fileTypes.resolve("board.canvas")).toBeUndefined();
  });

  it("rejects view registration without the capability", async () => {
    const host = new ExtensionHost();
    const extension: Extension = {
      manifest: {
        id: "test.invalid",
        name: "Invalid",
        version: "1.0.0",
        capabilities: [],
      },
      async activate(context) {
        context.views.registerFileType({
          id: "canvas",
          extensions: [".canvas"],
          contentKind: "text",
          viewType: "canvas",
        });
      },
      async deactivate() {},
    };

    await expect(host.activate(extension)).rejects.toThrow(
      "views.register",
    );
  });
});
