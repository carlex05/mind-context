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

export class ExtensionHost {
  readonly fileTypes = new FileTypeRegistry();
  private readonly disposables = new Map<string, (() => void)[]>();
  private readonly extensions = new Map<string, Extension>();

  constructor(private readonly adapters: ExtensionHostAdapters) {}

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
    this.disposables.delete(id);
    this.extensions.delete(id);
  }
}
