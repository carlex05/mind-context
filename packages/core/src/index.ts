export type WorkspaceId = string & { readonly __brand: "WorkspaceId" };
export type NoteId = string & { readonly __brand: "NoteId" };

export interface Note {
  readonly id: NoteId;
  readonly workspaceId: WorkspaceId;
  readonly path: string;
  readonly title: string;
  readonly content: string;
  readonly modifiedAt: string;
}

export interface Attachment {
  readonly workspaceId: WorkspaceId;
  readonly path: string;
  readonly mediaType?: string;
}

export const PRODUCT_PRINCIPLES = [
  "Plain Markdown is canonical.",
  "User-owned storage; no proprietary knowledge database.",
  "Derived state is local, disposable and rebuildable.",
  "Local AI is a first-class path.",
  "Cloud integrations require an explicit privacy boundary.",
  "Extensions use capabilities, never storage credentials.",
] as const;
