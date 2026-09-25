import {
  buildKnowledgeIndex,
  getNote,
  type KnowledgeDocument,
  type KnowledgeIndexSnapshot,
} from "@mind-context/knowledge";
import {
  LexicalSearchIndex,
  type SearchDocument,
} from "@mind-context/search";
import type {
  StorageObjectMetadata,
  StorageProvider,
} from "@mind-context/storage";

export interface WorkspaceDerivedState {
  readonly knowledgeIndex: KnowledgeIndexSnapshot;
  readonly searchIndex: LexicalSearchIndex;
}

export async function buildWorkspaceDerivedState(
  provider: StorageProvider,
  workspaceId: string,
): Promise<WorkspaceDerivedState> {
  const documents = await collectMarkdownDocuments(
    provider,
    provider.rootId,
    "",
  );
  const knowledgeIndex = buildKnowledgeIndex(workspaceId, documents);
  const searchDocuments: SearchDocument[] = documents.map((document) => {
    const note = getNote(knowledgeIndex, document.id);
    if (!note) {
      throw new Error(`Knowledge index did not contain ${document.path}.`);
    }

    return {
      noteId: document.id,
      path: note.path,
      title: note.title,
      aliases: note.aliases,
      tags: note.tags,
      headings: note.headings.map((heading) => heading.text),
      content: document.content,
    };
  });

  return {
    knowledgeIndex,
    searchIndex: new LexicalSearchIndex(searchDocuments),
  };
}

/**
 * Compatibility wrapper for callers that only need graph/link metadata.
 */
export async function buildWorkspaceKnowledgeIndex(
  provider: StorageProvider,
  workspaceId: string,
): Promise<KnowledgeIndexSnapshot> {
  return (await buildWorkspaceDerivedState(provider, workspaceId))
    .knowledgeIndex;
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
