import {
  buildKnowledgeIndex,
  type KnowledgeDocument,
  type KnowledgeIndexSnapshot,
} from "@mind-context/knowledge";
import type {
  StorageObjectMetadata,
  StorageProvider,
} from "@mind-context/storage";

export async function buildWorkspaceKnowledgeIndex(
  provider: StorageProvider,
  workspaceId: string,
): Promise<KnowledgeIndexSnapshot> {
  const documents = await collectMarkdownDocuments(
    provider,
    provider.rootId,
    "",
  );
  return buildKnowledgeIndex(workspaceId, documents);
}

async function collectMarkdownDocuments(
  provider: StorageProvider,
  parentId: string,
  parentPath: string,
): Promise<readonly KnowledgeDocument[]> {
  const children = await provider.list(parentId);
  const documents: KnowledgeDocument[] = [];

  for (const child of children) {
    const path = joinPath(parentPath, child.name);

    if (child.kind === "directory") {
      documents.push(
        ...(await collectMarkdownDocuments(provider, child.id, path)),
      );
      continue;
    }

    if (!isMarkdown(child)) {
      continue;
    }

    const content = await provider.readText(child.id);
    documents.push({
      id: child.id,
      path,
      name: child.name,
      content,
      ...(child.modifiedAt ? { modifiedAt: child.modifiedAt } : {}),
      ...(child.revision ? { revision: child.revision } : {}),
    });
  }

  return documents;
}

function isMarkdown(item: StorageObjectMetadata): boolean {
  return (
    item.mediaType === "text/markdown" ||
    item.name.toLocaleLowerCase().endsWith(".md")
  );
}

function joinPath(parent: string, name: string): string {
  return parent ? `${parent}/${name}` : name;
}
