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
    return isMarkdownFile(node.metadata) ? [node] : [];
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
  const visible = children.filter((item) => !isRecoveryDirectory(item));

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

export function isMarkdownFile(item: StorageObjectMetadata): boolean {
  return (
    item.mediaType === "text/markdown" ||
    item.name.toLocaleLowerCase().endsWith(".md")
  );
}

export function isImageFile(item: StorageObjectMetadata): boolean {
  return inferMediaType(item.name, item.mediaType).startsWith("image/");
}

export function flattenWorkspaceTree(
  nodes: readonly WorkspaceTreeNode[],
): readonly WorkspaceTreeNode[] {
  return nodes.flatMap((node) => [node, ...flattenWorkspaceTree(node.children)]);
}

export function resolveWorkspaceFile(
  nodes: readonly WorkspaceTreeNode[],
  sourceFilePath: string,
  rawTarget: string,
  syntax: "markdown" | "wikilink" = "markdown",
): WorkspaceTreeNode | undefined {
  const rawWithoutFragment = rawTarget.split("#", 1)[0]?.split("?", 1)[0] ?? "";
  const decoded = safeDecodeURIComponent(rawWithoutFragment.trim());
  if (
    !decoded ||
    /^[a-z][a-z0-9+.-]*:/i.test(decoded) ||
    decoded.startsWith("//")
  ) {
    return undefined;
  }

  const files = flattenWorkspaceTree(nodes).filter(
    (node) => node.metadata.kind === "file",
  );
  const normalized = normalizeWorkspacePath(decoded);
  const sourceDirectory = parentPath(sourceFilePath);
  const relative = resolveRelativeWorkspacePath(sourceDirectory, normalized);
  const root = normalized.replace(/^\.\//, "").replace(/^\//, "");

  const candidates =
    syntax === "wikilink"
      ? normalized.includes("/")
        ? [root, relative]
        : [root]
      : normalized.startsWith("/")
        ? [root]
        : [relative, root];

  for (const candidate of [...new Set(candidates)]) {
    const match = files.find((node) => node.path === candidate);
    if (match) return match;
  }

  if (syntax === "wikilink" && !normalized.includes("/")) {
    const basenameMatches = files.filter(
      (node) => node.metadata.name === normalized,
    );
    return basenameMatches.length === 1 ? basenameMatches[0] : undefined;
  }

  return undefined;
}

export function relativeWorkspaceFilePath(
  sourceFilePath: string,
  targetPath: string,
): string {
  const from = parentPath(sourceFilePath).split("/").filter(Boolean);
  const target = normalizeWorkspacePath(targetPath).split("/").filter(Boolean);
  let common = 0;

  while (
    common < from.length &&
    common < target.length &&
    from[common] === target[common]
  ) {
    common += 1;
  }

  const up = Array.from({ length: from.length - common }, () => "..");
  const down = target.slice(common);
  const result = [...up, ...down].join("/");
  return result.startsWith(".") ? result : `./${result}`;
}

export function inferMediaType(name: string, provided?: string): string {
  if (provided?.trim() && provided !== "application/octet-stream") {
    return provided;
  }
  const lower = name.toLocaleLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".avif")) return "image/avif";
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".mp3")) return "audio/mpeg";
  if (lower.endsWith(".wav")) return "audio/wav";
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".webm")) return "video/webm";
  if (lower.endsWith(".txt")) return "text/plain";
  return provided?.trim() || "application/octet-stream";
}

function resolveRelativeWorkspacePath(directory: string, target: string): string {
  const parts = directory ? directory.split("/") : [];
  for (const part of target.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return parts.join("/");
}

function normalizeWorkspacePath(value: string): string {
  return value.replaceAll("\\", "/").replace(/\/+/g, "/");
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
