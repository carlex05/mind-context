import type { ExtensionContext } from "@mind-context/extension-api";
import type { WebExtensionBundle } from "../extensions/ExtensionHost";
import {
  ExcalidrawMarkdownEmbed,
  ExcalidrawPluginView,
} from "./ExcalidrawPluginView";

export const excalidrawPlugin: WebExtensionBundle = {
  extension: {
    manifest: {
      id: "mindcontext.excalidraw",
      name: "Excalidraw",
      version: "0.1.0",
      capabilities: [
        "files.read.current",
        "files.write.current",
        "views.register",
        "markdown.register",
      ],
    },

    async activate(context: ExtensionContext) {
      context.views.registerFileType({
        id: "excalidraw",
        extensions: [".excalidraw"],
        contentKind: "text",
      });
      context.markdown.registerEmbedRenderer({
        id: "excalidraw-embed",
        extensions: [".excalidraw"],
      });
    },

    async deactivate() {
      // Registrations are disposed by the host.
    },
  },
  fileViews: [
    {
      fileTypeId: "excalidraw",
      component: ExcalidrawPluginView,
    },
  ],
  markdownEmbeds: [
    {
      rendererId: "excalidraw-embed",
      component: ExcalidrawMarkdownEmbed,
    },
  ],
};
