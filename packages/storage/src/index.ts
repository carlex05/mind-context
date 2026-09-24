export interface StorageObjectMetadata {
  readonly id: string;
  readonly path: string;
  readonly name: string;
  readonly kind: "file" | "directory";
  readonly modifiedAt?: string;
  readonly revision?: string;
  readonly mediaType?: string;
}

export interface WriteCondition {
  readonly expectedRevision?: string;
}

export interface StorageProvider {
  readonly id: string;

  list(path: string): Promise<readonly StorageObjectMetadata[]>;
  readText(id: string): Promise<string>;
  writeText(id: string, content: string, condition?: WriteCondition): Promise<StorageObjectMetadata>;
  createText(path: string, content: string): Promise<StorageObjectMetadata>;
  delete(id: string, condition?: WriteCondition): Promise<void>;
  move(id: string, destinationPath: string, condition?: WriteCondition): Promise<StorageObjectMetadata>;
  metadata(id: string): Promise<StorageObjectMetadata>;
}
