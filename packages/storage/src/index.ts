export type StorageObjectKind = "file" | "directory";

export interface StorageObjectMetadata {
  readonly id: string;
  readonly name: string;
  readonly kind: StorageObjectKind;
  readonly parentIds: readonly string[];
  readonly modifiedAt?: string;
  readonly revision?: string;
  readonly mediaType?: string;
  readonly size?: number;
}

export interface WriteCondition {
  readonly expectedRevision?: string;
}

export class StorageConflictError extends Error {
  constructor(
    message: string,
    readonly objectId: string,
  ) {
    super(message);
    this.name = "StorageConflictError";
  }
}

export interface StorageProvider {
  readonly id: string;
  readonly rootId: string;

  list(parentId?: string): Promise<readonly StorageObjectMetadata[]>;
  readText(id: string): Promise<string>;
  writeText(
    id: string,
    content: string,
    condition?: WriteCondition,
  ): Promise<StorageObjectMetadata>;
  createText(
    parentId: string,
    name: string,
    content: string,
  ): Promise<StorageObjectMetadata>;
  createDirectory(
    parentId: string,
    name: string,
  ): Promise<StorageObjectMetadata>;
  delete(id: string, condition?: WriteCondition): Promise<void>;
  move(
    id: string,
    destinationParentId: string,
    newName?: string,
    condition?: WriteCondition,
  ): Promise<StorageObjectMetadata>;
  metadata(id: string): Promise<StorageObjectMetadata>;
}
