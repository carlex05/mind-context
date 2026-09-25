/**
 * Browser-local persistence contracts.
 *
 * Derived state is disposable and rebuildable from canonical storage.
 * Pending note drafts are recovery state: they may temporarily contain user
 * changes that have not reached canonical storage yet and therefore must not be
 * cleared together with derived indexes.
 */
export interface DerivedStateStore {
  clearWorkspace(workspaceId: string): Promise<void>;
  get<T>(namespace: string, key: string): Promise<T | undefined>;
  put<T>(namespace: string, key: string, value: T): Promise<void>;
  delete(namespace: string, key: string): Promise<void>;
}

export interface PendingNoteDraft {
  readonly workspaceId: string;
  readonly noteId: string;
  readonly content: string;
  /**
   * Canonical content the draft was based on. Retained locally so a future
   * multi-device sync layer can offer a three-way merge instead of overwriting
   * either side blindly.
   */
  readonly baseContent: string;
  readonly baseRevision?: string;
  readonly updatedAt: string;
}

export interface PendingNoteDraftStore {
  get(
    workspaceId: string,
    noteId: string,
  ): Promise<PendingNoteDraft | undefined>;
  list(workspaceId: string): Promise<readonly PendingNoteDraft[]>;
  put(draft: PendingNoteDraft): Promise<void>;
  delete(workspaceId: string, noteId: string): Promise<void>;
  clearWorkspace(workspaceId: string): Promise<void>;
}
