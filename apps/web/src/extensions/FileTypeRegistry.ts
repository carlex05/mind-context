export interface FileTypeDescriptor {
  readonly id: string;
  readonly extensions: readonly string[];
  readonly contentKind: "text" | "binary";
  readonly source: "core" | `plugin:${string}`;
}

export class FileTypeRegistry {
  private readonly descriptors = new Map<string, FileTypeDescriptor>();

  register(descriptor: FileTypeDescriptor): () => void {
    if (this.descriptors.has(descriptor.id)) {
      throw new Error(`File type already registered: ${descriptor.id}`);
    }
    this.descriptors.set(descriptor.id, {
      ...descriptor,
      extensions: descriptor.extensions.map(normalizeExtension),
    });
    return () => {
      this.descriptors.delete(descriptor.id);
    };
  }

  resolve(fileName: string): FileTypeDescriptor | undefined {
    const lower = fileName.toLocaleLowerCase();
    return [...this.descriptors.values()]
      .sort((left, right) =>
        longestExtension(right.extensions) - longestExtension(left.extensions),
      )
      .find((descriptor) =>
        descriptor.extensions.some((extension) => lower.endsWith(extension)),
      );
  }

  list(): readonly FileTypeDescriptor[] {
    return [...this.descriptors.values()];
  }
}

function normalizeExtension(value: string): string {
  const extension = value.trim().toLocaleLowerCase();
  if (!extension) throw new Error("File extension cannot be empty.");
  return extension.startsWith(".") ? extension : `.${extension}`;
}

function longestExtension(extensions: readonly string[]): number {
  return Math.max(0, ...extensions.map((extension) => extension.length));
}
