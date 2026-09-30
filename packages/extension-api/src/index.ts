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
  | "ui.prompt.secret"
  | "editor.read.selection"
  | "editor.write.selection"
  | "views.register"
  | "markdown.register"
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
  writeCurrentText(content: string): Promise<void>;
}

export type RegisteredFileContentKind = "text" | "binary";

export interface FileTypeRegistration {
  readonly id: string;
  readonly extensions: readonly string[];
  readonly contentKind: RegisteredFileContentKind;
}

export interface ViewsApi {
  registerFileType(registration: FileTypeRegistration): () => void;
}

export interface MarkdownEmbedRegistration {
  readonly id: string;
  readonly extensions: readonly string[];
}

export interface MarkdownBlockRegistration {
  readonly id: string;
  readonly languages: readonly string[];
}

export interface MarkdownApi {
  registerEmbedRenderer(registration: MarkdownEmbedRegistration): () => void;
  registerBlockRenderer(registration: MarkdownBlockRegistration): () => void;
}

export interface EditorSelection {
  readonly text: string;
  readonly empty: boolean;
}

export interface EditorApi {
  readSelection(): Promise<EditorSelection | undefined>;
  replaceSelection(content: string): Promise<void>;
}

export interface CommandRegistration {
  readonly id: string;
  readonly title: string;
  readonly icon?: string;
  readonly keywords?: readonly string[];
  readonly toolbar?: boolean;
  readonly slash?: boolean;
  readonly handler: () => void | Promise<void>;
}

export interface CommandsApi {
  register(registration: CommandRegistration): () => void;
}

export interface SecretPromptRequest {
  readonly title: string;
  readonly message?: string;
  readonly confirm?: boolean;
  readonly confirmLabel?: string;
  readonly cancelLabel?: string;
  readonly mismatchMessage?: string;
}

export interface UiApi {
  promptSecret(request: SecretPromptRequest): Promise<string | undefined>;
}

export interface EventsApi {
  subscribe(event: string, handler: (payload: unknown) => void): () => void;
}

export interface ExtensionContext {
  readonly notes: NotesApi;
  readonly files: FilesApi;
  readonly views: ViewsApi;
  readonly markdown: MarkdownApi;
  readonly editor: EditorApi;
  readonly ui: UiApi;
  readonly commands: CommandsApi;
  readonly events: EventsApi;
}

export interface Extension {
  readonly manifest: ExtensionManifest;
  activate(context: ExtensionContext): Promise<void>;
  deactivate(): Promise<void>;
}
