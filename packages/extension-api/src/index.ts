export type Capability =
  | "notes.read.current"
  | "notes.read.selected"
  | "notes.read.all"
  | "notes.write.current"
  | "notes.write.all"
  | "files.read.current"
  | "files.read.all"
  | "files.write.current"
  | "files.write.all"
  | "attachments.read"
  | "network.connect"
  | "ai.use"
  | "ui.register"
  | "views.register"
  | "commands.register"
  | "events.subscribe";

export interface ExtensionManifest {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly capabilities: readonly Capability[];
  readonly networkDomains?: readonly string[];
}

export interface NotesApi {
  readCurrent(): Promise<string | undefined>;
}

export interface FilesApi {
  readCurrentText(): Promise<string | undefined>;
  readText(fileId: string): Promise<string>;
  readBinary(fileId: string): Promise<Uint8Array>;
}

export type FileContentKind = "text" | "binary";

export interface FileTypeCreation {
  readonly label: string;
  readonly defaultExtension: string;
  readonly initialText?: string;
}

export interface FileTypeRegistration {
  readonly id: string;
  readonly extensions: readonly string[];
  readonly contentKind: FileContentKind;
  readonly displayName?: string;
  readonly create?: FileTypeCreation;
  /**
   * Framework-neutral view identifier. The delivery layer owns the renderer
   * registered for this view type; extensions never receive React internals.
   */
  readonly viewType: string;
  readonly priority?: number;
}

export interface ViewsApi {
  registerFileType(registration: FileTypeRegistration): () => void;
}

export interface CommandsApi {
  register(id: string, title: string, handler: () => void | Promise<void>): () => void;
}

export interface EventsApi {
  subscribe(event: string, handler: (payload: unknown) => void): () => void;
}

export interface ExtensionContext {
  readonly notes: NotesApi;
  readonly files: FilesApi;
  readonly views: ViewsApi;
  readonly commands: CommandsApi;
  readonly events: EventsApi;
}

export interface Extension {
  readonly manifest: ExtensionManifest;
  activate(context: ExtensionContext): Promise<void>;
  deactivate(): Promise<void>;
}
