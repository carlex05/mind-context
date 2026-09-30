import type { ComponentType } from "react";
import type {
  CommandRegistration,
  EditorSelection,
  Extension,
  ExtensionContext,
  FileTypeRegistration,
  MarkdownBlockRegistration,
  MarkdownEmbedRegistration,
  SecretPromptRequest,
} from "@mind-context/extension-api";
import { FileTypeRegistry } from "./FileTypeRegistry";

export interface ExtensionHostAdapters {
  readonly readCurrentText: () => Promise<string | undefined>;
  readonly writeCurrentText: (content: string) => Promise<void>;
  readonly readEditorSelection: () => Promise<EditorSelection | undefined>;
  readonly replaceEditorSelection: (content: string) => Promise<void>;
  readonly promptSecret: (
    request: SecretPromptRequest,
  ) => Promise<string | undefined>;
}

export interface PluginWorkspaceFile {
  readonly id: string;
  readonly name: string;
  readonly path: string;
}

export interface PluginFileViewProps {
  readonly name: string;
  readonly path: string;
  readonly content: string | Uint8Array;
  readonly syncState?: "synced" | "local" | "syncing" | "conflict" | "error";
  readonly workspaceFiles?: readonly PluginWorkspaceFile[];
  readonly onOpenWorkspaceFile?: (path: string) => void;
  readonly onTextChange?: (content: string) => void;
}

export interface WebFileViewRegistration {
  readonly fileTypeId: string;
  readonly component: ComponentType<PluginFileViewProps>;
}

export interface PluginMarkdownEmbedProps {
  readonly name: string;
  readonly path: string;
  readonly content: string;
  readonly onOpen?: () => void;
}

export interface WebMarkdownEmbedRegistration {
  readonly rendererId: string;
  readonly component: ComponentType<PluginMarkdownEmbedProps>;
}

export interface PluginMarkdownBlockProps {
  readonly content: string;
}

export interface WebMarkdownBlockRegistration {
  readonly rendererId: string;
  readonly component: ComponentType<PluginMarkdownBlockProps>;
}

export interface ResolvedMarkdownEmbed {
  readonly rendererId: string;
  readonly component: ComponentType<PluginMarkdownEmbedProps>;
}

export interface ResolvedMarkdownBlock {
  readonly rendererId: string;
  readonly component: ComponentType<PluginMarkdownBlockProps>;
}

export interface RegisteredExtensionCommand
  extends Omit<CommandRegistration, "handler"> {
  readonly source: `plugin:${string}`;
  readonly handler: () => void | Promise<void>;
}

export interface WebExtensionBundle {
  readonly extension: Extension;
  readonly fileViews?: readonly WebFileViewRegistration[];
  readonly markdownEmbeds?: readonly WebMarkdownEmbedRegistration[];
  readonly markdownBlocks?: readonly WebMarkdownBlockRegistration[];
}

export class ExtensionHost {
  readonly fileTypes = new FileTypeRegistry();
  readonly markdownEmbeds = new FileTypeRegistry();
  private readonly disposables = new Map<string, (() => void)[]>();
  private readonly extensions = new Map<string, Extension>();
  private readonly fileViews = new Map<
    string,
    ComponentType<PluginFileViewProps>
  >();
  private readonly fileViewsByExtension = new Map<string, readonly string[]>();
  private readonly markdownEmbedViews = new Map<
    string,
    ComponentType<PluginMarkdownEmbedProps>
  >();
  private readonly markdownEmbedViewsByExtension = new Map<
    string,
    readonly string[]
  >();
  private readonly markdownBlockLanguages = new Map<string, string>();
  private readonly markdownBlockViews = new Map<
    string,
    ComponentType<PluginMarkdownBlockProps>
  >();
  private readonly markdownBlockViewsByExtension = new Map<
    string,
    readonly string[]
  >();
  private readonly commands = new Map<string, RegisteredExtensionCommand>();
  private readonly commandsByExtension = new Map<string, readonly string[]>();

  constructor(private readonly adapters: ExtensionHostAdapters) {}

  async activateBundle(bundle: WebExtensionBundle): Promise<void> {
    const fileViewIds = (bundle.fileViews ?? []).map((view) => {
      this.fileViews.set(view.fileTypeId, view.component);
      return view.fileTypeId;
    });
    this.fileViewsByExtension.set(bundle.extension.manifest.id, fileViewIds);

    const markdownEmbedIds = (bundle.markdownEmbeds ?? []).map((view) => {
      this.markdownEmbedViews.set(view.rendererId, view.component);
      return view.rendererId;
    });
    this.markdownEmbedViewsByExtension.set(
      bundle.extension.manifest.id,
      markdownEmbedIds,
    );

    const markdownBlockIds = (bundle.markdownBlocks ?? []).map((view) => {
      this.markdownBlockViews.set(view.rendererId, view.component);
      return view.rendererId;
    });
    this.markdownBlockViewsByExtension.set(
      bundle.extension.manifest.id,
      markdownBlockIds,
    );

    try {
      await this.activate(bundle.extension);
    } catch (error) {
      for (const fileTypeId of fileViewIds) this.fileViews.delete(fileTypeId);
      for (const rendererId of markdownEmbedIds) {
        this.markdownEmbedViews.delete(rendererId);
      }
      for (const rendererId of markdownBlockIds) {
        this.markdownBlockViews.delete(rendererId);
      }
      this.fileViewsByExtension.delete(bundle.extension.manifest.id);
      this.markdownEmbedViewsByExtension.delete(bundle.extension.manifest.id);
      this.markdownBlockViewsByExtension.delete(bundle.extension.manifest.id);
      throw error;
    }
  }

  resolveFileView(
    fileTypeId: string,
  ): ComponentType<PluginFileViewProps> | undefined {
    return this.fileViews.get(fileTypeId);
  }

  resolveMarkdownEmbed(fileName: string): ResolvedMarkdownEmbed | undefined {
    const descriptor = this.markdownEmbeds.resolve(fileName);
    if (!descriptor) return undefined;
    const component = this.markdownEmbedViews.get(descriptor.id);
    return component
      ? { rendererId: descriptor.id, component }
      : undefined;
  }

  resolveMarkdownBlock(language: string): ResolvedMarkdownBlock | undefined {
    const rendererId = this.markdownBlockLanguages.get(
      language.toLocaleLowerCase(),
    );
    if (!rendererId) return undefined;
    const component = this.markdownBlockViews.get(rendererId);
    return component ? { rendererId, component } : undefined;
  }

  listCommands(): readonly RegisteredExtensionCommand[] {
    return [...this.commands.values()];
  }

  async writeCurrentText(content: string): Promise<void> {
    await this.adapters.writeCurrentText(content);
  }

  async activate(extension: Extension): Promise<void> {
    if (this.extensions.has(extension.manifest.id)) return;

    const disposables: (() => void)[] = [];
    const registeredCommandIds: string[] = [];
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
      markdown: {
        registerEmbedRenderer: (registration: MarkdownEmbedRegistration) => {
          const dispose = this.markdownEmbeds.register({
            id: registration.id,
            extensions: registration.extensions,
            contentKind: "text",
            source: `plugin:${extension.manifest.id}`,
          });
          disposables.push(dispose);
          return dispose;
        },
        registerBlockRenderer: (registration: MarkdownBlockRegistration) => {
          for (const language of registration.languages) {
            const normalized = language.trim().toLocaleLowerCase();
            if (!normalized) continue;
            const existing = this.markdownBlockLanguages.get(normalized);
            if (existing && existing !== registration.id) {
              throw new Error(
                `Markdown block language already registered: ${normalized}`,
              );
            }
            this.markdownBlockLanguages.set(normalized, registration.id);
          }
          const dispose = () => {
            for (const language of registration.languages) {
              const normalized = language.trim().toLocaleLowerCase();
              if (
                this.markdownBlockLanguages.get(normalized) === registration.id
              ) {
                this.markdownBlockLanguages.delete(normalized);
              }
            }
          };
          disposables.push(dispose);
          return dispose;
        },
      },
      editor: {
        readSelection: this.adapters.readEditorSelection,
        replaceSelection: this.adapters.replaceEditorSelection,
      },
      ui: {
        promptSecret: this.adapters.promptSecret,
      },
      commands: {
        register: (registration: CommandRegistration) => {
          if (this.commands.has(registration.id)) {
            throw new Error(
              `Extension command already registered: ${registration.id}`,
            );
          }
          const command: RegisteredExtensionCommand = {
            ...registration,
            source: `plugin:${extension.manifest.id}`,
          };
          this.commands.set(registration.id, command);
          registeredCommandIds.push(registration.id);
          const dispose = () => this.commands.delete(registration.id);
          disposables.push(dispose);
          return dispose;
        },
      },
      events: {
        subscribe: () => () => undefined,
      },
    };

    await extension.activate(context);
    this.extensions.set(extension.manifest.id, extension);
    this.disposables.set(extension.manifest.id, disposables);
    this.commandsByExtension.set(extension.manifest.id, registeredCommandIds);
  }

  async deactivate(id: string): Promise<void> {
    const extension = this.extensions.get(id);
    if (!extension) return;
    await extension.deactivate();
    for (const dispose of this.disposables.get(id) ?? []) dispose();
    for (const fileTypeId of this.fileViewsByExtension.get(id) ?? []) {
      this.fileViews.delete(fileTypeId);
    }
    for (const rendererId of this.markdownEmbedViewsByExtension.get(id) ?? []) {
      this.markdownEmbedViews.delete(rendererId);
    }
    for (const rendererId of this.markdownBlockViewsByExtension.get(id) ?? []) {
      this.markdownBlockViews.delete(rendererId);
    }
    for (const commandId of this.commandsByExtension.get(id) ?? []) {
      this.commands.delete(commandId);
    }
    this.fileViewsByExtension.delete(id);
    this.markdownEmbedViewsByExtension.delete(id);
    this.markdownBlockViewsByExtension.delete(id);
    this.commandsByExtension.delete(id);
    this.disposables.delete(id);
    this.extensions.delete(id);
  }
}
