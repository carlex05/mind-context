import type { ComponentType } from "react";
import type { WorkspaceTreeNode } from "./workspaceTree";

export interface FileViewFile {
  readonly id: string;
  readonly name: string;
  readonly path: string;
}

export interface TextFileViewProps {
  readonly file: FileViewFile;
  readonly value: string;
  readonly tree: readonly WorkspaceTreeNode[];
  readonly onChange: (value: string) => void;
  readonly onOpenFile: (fileId: string) => void;
}

export type TextFileViewRenderer = ComponentType<TextFileViewProps>;

export class FileViewRendererRegistry {
  private readonly textRenderers = new Map<string, TextFileViewRenderer>();

  registerText(viewType: string, renderer: TextFileViewRenderer): () => void {
    if (this.textRenderers.has(viewType)) {
      throw new Error(`A renderer is already registered for ${viewType}.`);
    }
    this.textRenderers.set(viewType, renderer);
    return () => this.textRenderers.delete(viewType);
  }

  resolveText(viewType: string): TextFileViewRenderer | undefined {
    return this.textRenderers.get(viewType);
  }
}
