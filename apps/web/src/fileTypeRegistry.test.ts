import { describe, expect, it } from "vitest";
import { FileTypeRegistry } from "./extensions/FileTypeRegistry";

describe("FileTypeRegistry", () => {
  it("resolves the most specific registered extension case-insensitively", () => {
    const registry = new FileTypeRegistry();
    registry.register({
      id: "markdown",
      extensions: [".md"],
      contentKind: "text",
      source: "core",
    });
    registry.register({
      id: "excalidraw-markdown",
      extensions: [".excalidraw.md"],
      contentKind: "text",
      source: "plugin:mindcontext.excalidraw",
    });

    expect(registry.resolve("Diagram.Excalidraw.MD")?.id).toBe(
      "excalidraw-markdown",
    );
  });

  it("resolves bundled canvas files through a plugin registration", () => {
    const registry = new FileTypeRegistry();
    registry.register({
      id: "json-canvas",
      extensions: [".canvas"],
      contentKind: "text",
      source: "plugin:mindcontext.canvas",
    });

    expect(registry.resolve("Architecture.canvas")).toMatchObject({
      id: "json-canvas",
      source: "plugin:mindcontext.canvas",
    });
  });

  it("returns undefined for an unregistered file type", () => {
    const registry = new FileTypeRegistry();
    expect(registry.resolve("archive.zip")).toBeUndefined();
  });
});
