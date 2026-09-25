import {
  buildKnowledgeIndex,
  getNote,
  type KnowledgeDocument,
  type KnowledgeIndexSnapshot,
} from "@mind-context/knowledge";
import {
  LexicalSearchIndex,
  canReuseSearchDocument,
  createSearchDocument,
  createSearchIndexSnapshot,
  type SearchDocument,
  type SearchIndexSnapshot,
} from "@mind-context/search";
import type {
  StorageObjectMetadata,
  StorageProvider,
} from "@mind-context/storage";

export interface WorkspaceIndexingStats {
  readonly totalNotes: number;
  readonly reusedNotes: number;
  readonly downloadedNotes: number;
  readonly chunks: number;
}

export interface WorkspaceDerivedState {
  readonly knowledgeIndex: KnowledgeIndexSnapshot;
  readonly searchIndex: LexicalSearchIndex;
  readonly searchSnapshot: SearchIndexSnapshot;
  readonly stats: WorkspaceIndexingStats;
}

interface CollectionStats {
  reusedNotes: number;
  downloadedNotes: number;
}

export async function buildWorkspaceDerivedState(
  provider: StorageProvider,
  workspaceId: string,
  previousSearchSnapshot?: SearchIndexSnapshot,
): Promise<WorkspaceDerivedState> {
  const previousById = new Map(
    previousSearchSnapshot?.documents.map((document) => [
      document.noteId,
      document,
    ]) ?? [],
  );
  const stats: CollectionStats = {
    reusedNotes: 0,
    downloadedNotes: 0,
  };
  const documents = await collectMarkdownDocuments(
    provider,
    provider.rootId,
    "",
    previousById,
    stats,
  );
  const knowledgeIndex = buildKnowledgeIndex(workspaceId, documents);

  const searchDocuments: SearchDocument[] = documents.map((document) => {
    const note = getNote(knowledgeIndex, document.id);
    if (!note) {
      throw new Error(`Knowledge index did not contain ${document.path}.`);
    }

    const previous = previousById.get(document.id);
    if (
      previous &&
      previous.content === document.content &&
      previous.contentHash &&
      previous.chunks.length > 0
    ) {
      return {
        noteId: previous.noteId,
        path: note.path,
        name: note.name,
        title: note.title,
        aliases: note.aliases,
        tags: note.tags,
        headings: note.headings.map((heading) => heading.text),
        content: previous.content,
        contentHash: previous.contentHash,
        chunks: previous.chunks.map((chunk) => ({
          ...chunk,
          path: note.path,
        })),
        ...(document.revision ? { revision: document.revision } : {}),
        ...(document.modifiedAt ? { modifiedAt: document.modifiedAt } : {}),
      } satisfies SearchDocument;
    }

    return createSearchDocument({
      noteId: document.id,
      path: note.path,
      name: note.name,
      title: note.title,
      aliases: note.aliases,
      tags: note.tags,
      headings: note.headings.map((heading) => heading.text),
      content: document.content,
      ...(document.revision ? { revision: document.revision } : {}),
      ...(document.modifiedAt ? { modifiedAt: document.modifiedAt } : {}),
    });
  });

  const searchSnapshot = createSearchIndexSnapshot(
    workspaceId,
    searchDocuments,
  );

  return {
    knowledgeIndex,
    searchIndex: new LexicalSearchIndex(searchDocuments),
    searchSnapshot,
    stats: {
      totalNotes: documents.length,
      reusedNotes: stats.reusedNotes,
      downloadedNotes: stats.downloadedNotes,
      chunks: searchDocuments.reduce(
        (total, document) => total + document.chunks.length,
        0,
      ),
    },
  };
}

async function collectMarkdownDocuments(
  provider: StorageProvider,
  parentId: string,
  parentPath: string,
  previousById: ReadonlyMap<string, SearchDocument>,
  stats: CollectionStats,
): Promise<readonly KnowledgeDocument[]> {
  const children = await provider.list(parentId);
  const documents: KnowledgeDocument[] = [];

  for (const child of children) {
    const path = joinPath(parentPath, child.name);

    if (child.kind === "directory") {
      documents.push(
        ...(await collectMarkdownDocuments(
          provider,
          child.id,
          path,
          previousById,
          stats,
        )),
      );
      continue;
    }

    if (!isMarkdown(child)) continue;

    const previous = previousById.get(child.id);
    const reuse = canReuseSearchDocument(previous, child.revision);
    const content = reuse
      ? previous.content
      : await provider.readText(child.id);

    if (reuse) stats.reusedNotes += 1;
    else stats.downloadedNotes += 1;

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
