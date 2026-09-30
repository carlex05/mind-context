import { CanvasEditor } from "./CanvasEditor";
import { canvasPlugin } from "./canvasPlugin";
import { ExtensionHost, registerBuiltInFileTypes } from "./extensions";
import { FileViewRendererRegistry } from "./fileViewRenderers";

export const extensionHost = new ExtensionHost();
export const fileViewRenderers = new FileViewRendererRegistry();

registerBuiltInFileTypes(extensionHost.fileTypes);
fileViewRenderers.registerText("json-canvas", CanvasEditor);

// Bundled first-party extensions use the same registration path intended for
// future installed plugins. They do not receive StorageProvider or credentials.
void extensionHost.activate(canvasPlugin);
