import {
  getBacklinks,
  type KnowledgeIndexSnapshot,
} from "@mind-context/knowledge";
import type { StorageProvider } from "@mind-context/storage";

import {
  childPath,
  descendantMarkdownNotes,
  parentPath,
  replacePathPrefix,
  type WorkspaceTreeNode,
} from "./workspaceTree";

export interface VaultMutationResult {
  readonly rewrittenNotes: number;
}

export async function renameVaultItem(
  provider: StorageProvider,
  index: KnowledgeIndexSnapshot | undefined,
  node: WorkspaceTreeNode,
  newName: string,
): Promise<VaultMutationResult> {
  const normalizedName = normalizeName(node, newName);
  const parentId = node.metadata.parentIds[0] ?? provider.rootId;
  const newPath = childPath(parentPath(node.path), normalizedName);
  const changes = pathChangesForNode(node, newPath);

  await provider.move(
    node.metadata.id,
    parentId,
    normalizedName,
    node.metadata.revision
      ? { expectedRevision: node.metadata.revision }
      : undefined,
  );

  return rewriteAffectedLinks(provider, index, changes);
}

export async function moveVaultItem(
  provider: StorageProvider,
  index: KnowledgeIndexSnapshot | undefined,
  node: WorkspaceTreeNode,
  destination: WorkspaceTreeNode | undefined,
): Promise<VaultMutationResult> {
  const destinationId = destination?.metadata.id ?? provider.rootId;
  if (node.metadata.id === destinationId) {
    throw new Error("An item cannot be moved into itself.");
  }
  if (
    node.metadata.kind === "directory" &&
    destination?.path.startsWith(`${node.path}/`)
  ) {
    throw new Error("A folder cannot be moved inside one of its descendants.");
  }

  const newPath = childPath(destination?.path ?? "", node.metadata.name);
  if (newPath === node.path) {
    return { rewrittenNotes: 0 };
  }

  const changes = pathChangesForNode(node, newPath);

  await provider.move(
    node.metadata.id,
    destinationId,
    undefined,
    node.metadata.revision
      ? { expectedRevision: node.metadata.revision }
      : undefined,
  );

  return rewriteAffectedLinks(provider, index, changes);
}

export function backlinkCountForNode(
  index: KnowledgeIndexSnapshot | undefined,
  node: WorkspaceTreeNode,
): number {
  if (!index) return 0;
  return descendantMarkdownNotes(node).reduce(
    (count, note) => count + getBacklinks(index, note.metadata.id).length,
    0,
  );
}

interface PathChange {
  readonly noteId: string;
  readonly oldPath: string;
  readonly newPath: string;
}

function pathChangesForNode(
  node: WorkspaceTreeNode,
  newRootPath: string,
): readonly PathChange[] {
  return descendantMarkdownNotes(node).map((note) => ({
    noteId: note.metadata.id,
    oldPath: note.path,
    newPath: replacePathPrefix(note.path, node.path, newRootPath),
  }));
}

async function rewriteAffectedLinks(
  provider: StorageProvider,
  index: KnowledgeIndexSnapshot | undefined,
  changes: readonly PathChange[],
): Promise<VaultMutationResult> {
  if (!index || changes.length === 0) {
    return { rewrittenNotes: 0 };
  }

  const changedById = new Map(changes.map((change) => [change.noteId, change]));
  const affectedSourceIds = new Set<string>();

  for (const note of index.notes) {
    const sourceMoved = changedById.has(note.id);
    const linksMovedTarget = index.edges.some(
      (edge) =>
        edge.sourceNoteId === note.id &&
        edge.resolution === "resolved" &&
        edge.targetNoteId !== undefined &&
        changedById.has(edge.targetNoteId),
    );

    if (sourceMoved || linksMovedTarget) {
      affectedSourceIds.add(note.id);
    }
  }

  let rewrittenNotes = 0;

  for (const sourceId of affectedSourceIds) {
    const source = index.notes.find((note) => note.id === sourceId);
    if (!source) continue;

    const content = await provider.readText(sourceId);
    const rewritten = rewriteResolvedLinks(
      content,
      source,
      index,
      changedById,
    );
    if (rewritten === content) continue;

    const metadata = await provider.metadata(sourceId);
    await provider.writeText(
      sourceId,
      rewritten,
      metadata.revision
        ? { expectedRevision: metadata.revision }
        : undefined,
    );
    rewrittenNotes += 1;
  }

  return { rewrittenNotes };
}

function rewriteResolvedLinks(
  content: string,
  source: KnowledgeIndexSnapshot["notes"][number],
  index: KnowledgeIndexSnapshot,
  changedById: ReadonlyMap<string, PathChange>,
): string {
  const sourceFuturePath = changedById.get(source.id)?.newPath ?? source.path;
  let result = content;

  for (const edge of index.edges) {
    if (
      edge.sourceNoteId !== source.id ||
      edge.resolution !== "resolved" ||
      !edge.targetNoteId
    ) {
      continue;
    }

    const target = index.notes.find((note) => note.id === edge.targetNoteId);
    if (!target) continue;

    const targetFuturePath =
      changedById.get(target.id)?.newPath ?? target.path;
    const sourceChanged = sourceFuturePath !== source.path;
    const targetChanged = targetFuturePath !== target.path;

    if (!sourceChanged && !targetChanged) continue;
    if (!edge.target) continue;

    if (edge.syntax === "wikilink") {
      if (!targetChanged) continue;
      const oldBody = wikilinkBody(edge.target, edge.heading, edge.blockId, edge.alias);
      const newTarget = withoutMarkdownExtension(targetFuturePath);
      const newBody = wikilinkBody(newTarget, edge.heading, edge.blockId, edge.alias);
      const prefix = edge.embed ? "!" : "";
      result = replaceAllLiteral(
        result,
        `${prefix}[[${oldBody}]]`,
        `${prefix}[[${newBody}]]`,
      );
      continue;
    }

    const oldDestination = markdownDestination(
      edge.target,
      edge.heading,
      edge.blockId,
    );
    const relativeTarget = relativePath(
      parentPath(sourceFuturePath),
      targetFuturePath,
    );
    const newDestination = markdownDestination(
      encodePath(relativeTarget),
      edge.heading,
      edge.blockId,
    );

    result = replaceMarkdownDestination(
      result,
      oldDestination,
      newDestination,
    );
    const encodedOld = markdownDestination(
      encodePath(edge.target),
      edge.heading,
      edge.blockId,
    );
    if (encodedOld !== oldDestination) {
      result = replaceMarkdownDestination(
        result,
        encodedOld,
        newDestination,
      );
    }
  }

  return result;
}

function wikilinkBody(
  target: string,
  heading?: string,
  blockId?: string,
  alias?: string,
): string {
  const fragment = blockId
    ? `#^${blockId}`
    : heading
      ? `#${heading}`
      : "";
  return `${target}${fragment}${alias ? `|${alias}` : ""}`;
}

function markdownDestination(
  target: string,
  heading?: string,
  blockId?: string,
): string {
  const fragment = blockId
    ? `#^${blockId}`
    : heading
      ? `#${heading}`
      : "";
  return `${target}${fragment}`;
}

function replaceMarkdownDestination(
  content: string,
  oldDestination: string,
  newDestination: string,
): string {
  return replaceAllLiteral(
    content,
    `](${oldDestination})`,
    `](${newDestination})`,
  );
}

function replaceAllLiteral(
  content: string,
  search: string,
  replacement: string,
): string {
  return search ? content.split(search).join(replacement) : content;
}

function relativePath(fromDirectory: string, targetPath: string): string {
  const from = fromDirectory ? fromDirectory.split("/") : [];
  const target = targetPath.split("/");
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
  const path = [...up, ...down].join("/");
  return path.startsWith(".") ? path : `./${path}`;
}

function encodePath(path: string): string {
  return path
    .split("/")
    .map((part) => (part === "." || part === ".." ? part : encodeURIComponent(part)))
    .join("/");
}

function withoutMarkdownExtension(path: string): string {
  return path.toLocaleLowerCase().endsWith(".md")
    ? path.slice(0, -3)
    : path;
}

function normalizeName(node: WorkspaceTreeNode, value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("Name cannot be empty.");
  if (trimmed.includes("/") || trimmed.includes("\\")) {
    throw new Error("Name cannot contain path separators.");
  }
  if (
    node.metadata.kind === "file" &&
    node.metadata.name.toLocaleLowerCase().endsWith(".md") &&
    !trimmed.toLocaleLowerCase().endsWith(".md")
  ) {
    return `${trimmed}.md`;
  }
  return trimmed;
}
