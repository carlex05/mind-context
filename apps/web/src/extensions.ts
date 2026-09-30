import type {
  Extension,
  ExtensionContext,
  FileTypeRegistration,
} from "@mind-context/extension-api";

export interface RegisteredFileType extends FileTypeRegistration {
  readonly extensionId: string;
}

export class FileTypeRegistry {
  private readonly registrations = new Map<string, RegisteredFileType>();

  register(extensionId: string, registration: FileTypeRegistration): () => void {
    const normalizedExtensions = [...new Set(
      registration.extensions.map(normalizeExtension),
    )].filter(Boolean);
    if (normalizedExtensions.length === 0) {
      throw new Error(`File type ${registration.id} must register an extension.`);
    }

    const key = `${extensionId}:${registration.id}`;
    this.registrations.set(key, {
      ...registration,
      extensions: normalizedExtensions,
      extensionId,
    });

    return () => {
      this.registrations.delete(key);
    };
  }

  resolve(fileName: string): RegisteredFileType | undefined {
    const lower = fileName.toLocaleLowerCase();
    return [...this.registrations.values()]
      .filter((registration) =>
        registration.extensions.some((extension) => lower.endsWith(extension)),
      )
      .sort((left, right) => {
        const priority = (right.priority ?? 0) - (left.priority ?? 0);
        if (priority !== 0) return priority;
        const leftLength = Math.max(...left.extensions.map((value) => value.length));
        const rightLength = Math.max(...right.extensions.map((value) => value.length));
        return rightLength - leftLength;
      })[0];
  }

  list(): readonly RegisteredFileType[] {
    return [...this.registrations.values()];
  }
}

export interface ExtensionHostAdapters {
  readonly notes?: ExtensionContext["notes"];
  readonly files?: ExtensionContext["files"];
  readonly commands?: ExtensionContext["commands"];
  readonly events?: ExtensionContext["events"];
}

export class ExtensionHost {
  readonly fileTypes = new FileTypeRegistry();

  private readonly active = new Map<
    string,
    { readonly extension: Extension; readonly disposers: readonly (() => void)[] }
  >();

  constructor(private readonly adapters: ExtensionHostAdapters = {}) {}

  async activate(extension: Extension): Promise<void> {
    if (this.active.has(extension.manifest.id)) return;

    const disposers: (() => void)[] = [];
    const requireCapability = (capability: string) => {
      if (!extension.manifest.capabilities.includes(capability as never)) {
        throw new Error(
          `Extension ${extension.manifest.id} requires capability ${capability}.`,
        );
      }
    };

    const context: ExtensionContext = {
      notes:
        this.adapters.notes ??
        {
          async readCurrent() {
            return undefined;
          },
        },
      files:
        this.adapters.files ??
        {
          async readCurrentText() {
            return undefined;
          },
          async readText() {
            throw new Error("File read API is not connected to this host.");
          },
          async readBinary() {
            throw new Error("Binary file API is not connected to this host.");
          },
        },
      views: {
        registerFileType: (registration) => {
          requireCapability("views.register");
          const dispose = this.fileTypes.register(
            extension.manifest.id,
            registration,
          );
          disposers.push(dispose);
          return dispose;
        },
      },
      commands:
        this.adapters.commands ??
        {
          register() {
            return () => undefined;
          },
        },
      events:
        this.adapters.events ??
        {
          subscribe() {
            return () => undefined;
          },
        },
    };

    try {
      await extension.activate(context);
      this.active.set(extension.manifest.id, {
        extension,
        disposers,
      });
    } catch (error) {
      for (const dispose of disposers.reverse()) dispose();
      throw error;
    }
  }

  async deactivate(extensionId: string): Promise<void> {
    const entry = this.active.get(extensionId);
    if (!entry) return;
    this.active.delete(extensionId);
    for (const dispose of [...entry.disposers].reverse()) dispose();
    await entry.extension.deactivate();
  }
}

export function registerBuiltInFileTypes(registry: FileTypeRegistry): () => void {
  return registry.register("mindcontext.core", {
    id: "markdown",
    extensions: [".md"],
    contentKind: "text",
    viewType: "markdown",
    priority: -100,
  });
}

function normalizeExtension(value: string): string {
  const trimmed = value.trim().toLocaleLowerCase();
  if (!trimmed) return "";
  return trimmed.startsWith(".") ? trimmed : `.${trimmed}`;
}
