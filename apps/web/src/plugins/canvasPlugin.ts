import type { ExtensionContext } from "@mind-context/extension-api";
import type { WebExtensionBundle } from "../extensions/ExtensionHost";
import { CanvasPluginView } from "./CanvasPluginView";

export const canvasPlugin: WebExtensionBundle = {
  extension: {
    manifest: {
      id: "mindcontext.canvas",
      name: "Canvas",
      version: "0.1.0",
      capabilities: ["files.read.current", "views.register"],
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
  },
  fileViews: [
    {
      fileTypeId: "json-canvas",
      component: CanvasPluginView,
    },
  ],
};
