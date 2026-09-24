/**
 * Persistence in this package is only for derived/rebuildable local state.
 * Canonical note contents must never depend on this store.
 */
export interface DerivedStateStore {
  clearWorkspace(workspaceId: string): Promise<void>;
  get<T>(namespace: string, key: string): Promise<T | undefined>;
  put<T>(namespace: string, key: string, value: T): Promise<void>;
  delete(namespace: string, key: string): Promise<void>;
}
