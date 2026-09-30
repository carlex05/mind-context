import type { ComponentType } from "react";
import type {
  Extension,
  ExtensionContext,
  FileTypeRegistration,
} from "@mind-context/extension-api";
import { FileTypeRegistry } from "./FileTypeRegistry";

export interface ExtensionHostAdapters {
  readonly readCurrentText: () => Promise<string | undefined>;
  readonly writeCurrentText: (content: string) => Promise<void>;
}

export interface PluginFileViewProps {
  readonly name: string;
  readonly path: string;
  readonly content: string | Uint8Array;
}

export interface WebFileViewRegistration {
  readonly fileTypeId: string;
  readonly component: ComponentType<PluginFileViewProps>;
}

export interface WebExtensionBundle {
  readonly extension: Extension;
  readonly fileViews?: readonly WebFileViewRegistration[];
}

export class ExtensionHost {
  readonly fileTypes = new FileTypeRegistry();
  private readonly disposables = new Map<string, (() => void)[]>();
  private readonly extensions = new Map<string, Extension>();
  private readonly fileViews = new Map<
    string,
    ComponentType<PluginFileViewProps>
  >();
  private readonly fileViewsByExtension = new Map<string, readonly string[]>();

  constructor(private readonly adapters: ExtensionHostAdapters) {}

  async activateBundle(bundle: WebExtensionBundle): Promise<void> {
    const fileViewIds = (bundle.fileViews ?? []).map((view) => {
      this.fileViews.set(view.fileTypeId, view.component);
      return view.fileTypeId;
    });
    this.fileViewsByExtension.set(bundle.extension.manifest.id, fileViewIds);

    try {
      await this.activate(bundle.extension);
    } catch (error) {
      for (const fileTypeId of fileViewIds) this.fileViews.delete(fileTypeId);
      this.fileViewsByExtension.delete(bundle.extension.manifest.id);
      throw error;
    }
  }

  resolveFileView(
    fileTypeId: string,
  ): ComponentType<PluginFileViewProps> | undefined {
    return this.fileViews.get(fileTypeId);
  }

  async activate(extension: Extension): Promise<void> {
    if (this.extensions.has(extension.manifest.id)) return;

    const disposables: (() => void)[] = [];
    const context: ExtensionContext = {
      notes: {
        readCurrent: this.adapters.readCurrentText,
      },
      files: {
        readCurrentText: this.adapters.readCurrentText,
        writeCurrentText: this.adapters.writeCurrentText,
      },
      views: {
        registerFileType: (registration: FileTypeRegistration) => {
          const dispose = this.fileTypes.register({
            ...registration,
            source: `plugin:${extension.manifest.id}`,
          });
          disposables.push(dispose);
          return dispose;
        },
      },
      commands: {
        register: () => () => undefined,
      },
      events: {
        subscribe: () => () => undefined,
      },
    };

    await extension.activate(context);
    this.extensions.set(extension.manifest.id, extension);
    this.disposables.set(extension.manifest.id, disposables);
  }

  async deactivate(id: string): Promise<void> {
    const extension = this.extensions.get(id);
    if (!extension) return;
    await extension.deactivate();
    for (const dispose of this.disposables.get(id) ?? []) dispose();
    for (const fileTypeId of this.fileViewsByExtension.get(id) ?? []) {
      this.fileViews.delete(fileTypeId);
    }
    this.fileViewsByExtension.delete(id);
    this.disposables.delete(id);
    this.extensions.delete(id);
  }
}
