import type {
  StorageObjectMetadata,
  StorageProvider,
} from "@mind-context/storage";
import { isRecoveryDirectory } from "./recovery";

export interface WorkspaceTreeNode {
  readonly metadata: StorageObjectMetadata;
  readonly path: string;
  readonly children: readonly WorkspaceTreeNode[];
}

export async function loadWorkspaceTree(
  provider: StorageProvider,
): Promise<readonly WorkspaceTreeNode[]> {
  return loadChildren(provider, provider.rootId, "");
}

export function findWorkspaceNode(
  nodes: readonly WorkspaceTreeNode[],
  id: string,
): WorkspaceTreeNode | undefined {
  for (const node of nodes) {
    if (node.metadata.id === id) return node;
    const nested = findWorkspaceNode(node.children, id);
    if (nested) return nested;
  }
  return undefined;
}

export function workspaceFolders(
  nodes: readonly WorkspaceTreeNode[],
): readonly WorkspaceTreeNode[] {
  return nodes.flatMap((node) =>
    node.metadata.kind === "directory"
      ? [node, ...workspaceFolders(node.children)]
      : [],
  );
}

export function descendantMarkdownNotes(
  node: WorkspaceTreeNode,
): readonly WorkspaceTreeNode[] {
  if (node.metadata.kind === "file") {
    return isMarkdown(node.metadata) ? [node] : [];
  }
  return node.children.flatMap(descendantMarkdownNotes);
}

export function childPath(parentPath: string, name: string): string {
  return parentPath ? `${parentPath}/${name}` : name;
}

export function parentPath(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash >= 0 ? path.slice(0, slash) : "";
}

export function replacePathPrefix(
  path: string,
  oldPrefix: string,
  newPrefix: string,
): string {
  if (path === oldPrefix) return newPrefix;
  if (!path.startsWith(`${oldPrefix}/`)) return path;
  return `${newPrefix}${path.slice(oldPrefix.length)}`;
}

async function loadChildren(
  provider: StorageProvider,
  parentId: string,
  parentPath: string,
): Promise<readonly WorkspaceTreeNode[]> {
  const children = await provider.list(parentId);
  const visible = children.filter(
    (item) =>
      !isRecoveryDirectory(item) &&
      (item.kind === "directory" || isMarkdown(item)),
  );

  return Promise.all(
    visible.map(async (metadata) => {
      const path = childPath(parentPath, metadata.name);
      return {
        metadata,
        path,
        children:
          metadata.kind === "directory"
            ? await loadChildren(provider, metadata.id, path)
            : [],
      };
    }),
  );
}

function isMarkdown(item: StorageObjectMetadata): boolean {
  return (
    item.mediaType === "text/markdown" ||
    item.name.toLocaleLowerCase().endsWith(".md")
  );
}
