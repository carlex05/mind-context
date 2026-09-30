import type { Extension, ExtensionContext } from "@mind-context/extension-api";

export const canvasPlugin: Extension = {
  manifest: {
    id: "mindcontext.canvas",
    name: "Canvas",
    version: "0.1.0",
    capabilities: ["files.read.current", "files.write.current", "views.register"],
  },

  async activate(context: ExtensionContext) {
    context.views.registerFileType({
      id: "json-canvas",
      extensions: [".canvas"],
      contentKind: "text",
    });
  },

  async deactivate() {
    // Registrations are disposed by the host.
  },
};
