import Dexie, { type Table } from "dexie";
import type {
  KnowledgeIndexSnapshot,
  KnowledgeIndexSnapshotStore,
} from "@mind-context/knowledge";
import type {
  EmbeddingIndexSnapshot,
  EmbeddingIndexSnapshotStore,
} from "@mind-context/embeddings";
import type {
  SearchIndexSnapshot,
  SearchIndexSnapshotStore,
} from "@mind-context/search";
import type {
  PendingNoteDraft,
  PendingNoteDraftStore,
} from "@mind-context/persistence";

interface KnowledgeIndexRecord {
  readonly workspaceId: string;
  readonly builtAt: string;
  readonly snapshot: KnowledgeIndexSnapshot;
}

interface SearchIndexRecord {
  readonly workspaceId: string;
  readonly builtAt: string;
  readonly snapshot: SearchIndexSnapshot;
}

interface EmbeddingIndexRecord {
  readonly key: string;
  readonly workspaceId: string;
  readonly providerId: string;
  readonly model: string;
  readonly builtAt: string;
  readonly snapshot: EmbeddingIndexSnapshot;
}

interface PendingNoteDraftRecord extends PendingNoteDraft {
  readonly key: string;
}

function createDatabase(databaseName: string): Dexie {
  const database = new Dexie(databaseName);
  database.version(1).stores({
    knowledgeIndexes: "&workspaceId,builtAt",
  });
  database.version(2).stores({
    knowledgeIndexes: "&workspaceId,builtAt",
    searchIndexes: "&workspaceId,builtAt",
  });
  database.version(3).stores({
    knowledgeIndexes: "&workspaceId,builtAt",
    searchIndexes: "&workspaceId,builtAt",
    embeddingIndexes:
      "&key,workspaceId,providerId,model,builtAt,[workspaceId+providerId+model]",
  });
  return database;
}

function createRecoveryDatabase(databaseName: string): Dexie {
  const database = new Dexie(databaseName);
  database.version(1).stores({
    pendingDrafts: "&key,workspaceId,noteId,updatedAt,[workspaceId+noteId]",
  });
  return database;
}

export class IndexedDbKnowledgeIndexStore
  implements KnowledgeIndexSnapshotStore
{
  private readonly database: Dexie;
  private readonly snapshots: Table<KnowledgeIndexRecord, string>;

  constructor(databaseName = "mind-context-derived") {
    this.database = createDatabase(databaseName);
    this.snapshots = this.database.table<KnowledgeIndexRecord, string>(
      "knowledgeIndexes",
    );
  }

  async get(
    workspaceId: string,
  ): Promise<KnowledgeIndexSnapshot | undefined> {
    return (await this.snapshots.get(workspaceId))?.snapshot;
  }

  async put(snapshot: KnowledgeIndexSnapshot): Promise<void> {
    await this.snapshots.put({
      workspaceId: snapshot.workspaceId,
      builtAt: snapshot.builtAt,
      snapshot,
    });
  }

  async delete(workspaceId: string): Promise<void> {
    await this.snapshots.delete(workspaceId);
  }

  close(): void {
    this.database.close();
  }
}

export class IndexedDbSearchIndexStore
  implements SearchIndexSnapshotStore
{
  private readonly database: Dexie;
  private readonly snapshots: Table<SearchIndexRecord, string>;

  constructor(databaseName = "mind-context-derived") {
    this.database = createDatabase(databaseName);
    this.snapshots = this.database.table<SearchIndexRecord, string>(
      "searchIndexes",
    );
  }

  async get(
    workspaceId: string,
  ): Promise<SearchIndexSnapshot | undefined> {
    return (await this.snapshots.get(workspaceId))?.snapshot;
  }

  async put(snapshot: SearchIndexSnapshot): Promise<void> {
    await this.snapshots.put({
      workspaceId: snapshot.workspaceId,
      builtAt: snapshot.builtAt,
      snapshot,
    });
  }

  async delete(workspaceId: string): Promise<void> {
    await this.snapshots.delete(workspaceId);
  }

  close(): void {
    this.database.close();
  }
}


export class IndexedDbPendingNoteDraftStore
  implements PendingNoteDraftStore
{
  private readonly database: Dexie;
  private readonly drafts: Table<PendingNoteDraftRecord, string>;

  constructor(databaseName = "mind-context-local") {
    this.database = createRecoveryDatabase(databaseName);
    this.drafts = this.database.table<PendingNoteDraftRecord, string>(
      "pendingDrafts",
    );
  }

  async get(
    workspaceId: string,
    noteId: string,
  ): Promise<PendingNoteDraft | undefined> {
    const record = await this.drafts.get(draftKey(workspaceId, noteId));
    if (!record) return undefined;
    const { key: _key, ...draft } = record;
    return draft;
  }

  async list(workspaceId: string): Promise<readonly PendingNoteDraft[]> {
    const records = await this.drafts
      .where("workspaceId")
      .equals(workspaceId)
      .toArray();
    return records.map(({ key: _key, ...draft }) => draft);
  }

  async put(draft: PendingNoteDraft): Promise<void> {
    await this.drafts.put({
      ...draft,
      key: draftKey(draft.workspaceId, draft.noteId),
    });
  }

  async delete(workspaceId: string, noteId: string): Promise<void> {
    await this.drafts.delete(draftKey(workspaceId, noteId));
  }

  async clearWorkspace(workspaceId: string): Promise<void> {
    const records = await this.drafts
      .where("workspaceId")
      .equals(workspaceId)
      .toArray();
    if (records.length > 0) {
      await this.drafts.bulkDelete(records.map((record) => record.key));
    }
  }

  close(): void {
    this.database.close();
  }
}

export class IndexedDbEmbeddingIndexStore
  implements EmbeddingIndexSnapshotStore
{
  private readonly database: Dexie;
  private readonly snapshots: Table<EmbeddingIndexRecord, string>;

  constructor(databaseName = "mind-context-derived") {
    this.database = createDatabase(databaseName);
    this.snapshots = this.database.table<EmbeddingIndexRecord, string>(
      "embeddingIndexes",
    );
  }

  async get(
    workspaceId: string,
    providerId: string,
    model: string,
  ): Promise<EmbeddingIndexSnapshot | undefined> {
    return (
      await this.snapshots.get(
        embeddingKey(workspaceId, providerId, model),
      )
    )?.snapshot;
  }

  async put(snapshot: EmbeddingIndexSnapshot): Promise<void> {
    await this.snapshots.put({
      key: embeddingKey(
        snapshot.workspaceId,
        snapshot.providerId,
        snapshot.model,
      ),
      workspaceId: snapshot.workspaceId,
      providerId: snapshot.providerId,
      model: snapshot.model,
      builtAt: snapshot.builtAt,
      snapshot,
    });
  }

  async delete(
    workspaceId: string,
    providerId?: string,
    model?: string,
  ): Promise<void> {
    if (providerId && model) {
      await this.snapshots.delete(
        embeddingKey(workspaceId, providerId, model),
      );
      return;
    }

    const records = await this.snapshots
      .where("workspaceId")
      .equals(workspaceId)
      .toArray();

    const keys = records
      .filter(
        (record) =>
          (!providerId || record.providerId === providerId) &&
          (!model || record.model === model),
      )
      .map((record) => record.key);

    if (keys.length > 0) {
      await this.snapshots.bulkDelete(keys);
    }
  }

  close(): void {
    this.database.close();
  }
}

function embeddingKey(
  workspaceId: string,
  providerId: string,
  model: string,
): string {
  return `${workspaceId}::${providerId}::${model}`;
}

function draftKey(workspaceId: string, noteId: string): string {
  return `${workspaceId}::${noteId}`;
}
