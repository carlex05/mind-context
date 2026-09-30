import type { Extension } from "@mind-context/extension-api";

let disposeFileType: (() => void) | undefined;

export const canvasPlugin: Extension = {
  manifest: {
    id: "mindcontext.canvas",
    name: "JSON Canvas",
    version: "0.1.0",
    capabilities: ["views.register"],
  },

  async activate(context) {
    disposeFileType = context.views.registerFileType({
      id: "json-canvas",
      extensions: [".canvas"],
      contentKind: "text",
      viewType: "json-canvas",
      priority: 100,
    });
  },

  async deactivate() {
    disposeFileType?.();
    disposeFileType = undefined;
  },
};
