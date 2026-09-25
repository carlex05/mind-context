import Dexie, { type Table } from "dexie";
import type {
  KnowledgeIndexSnapshot,
  KnowledgeIndexSnapshotStore,
} from "@mind-context/knowledge";
import type {
  SearchIndexSnapshot,
  SearchIndexSnapshotStore,
} from "@mind-context/search";

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

function createDatabase(databaseName: string): Dexie {
  const database = new Dexie(databaseName);
  database.version(1).stores({
    knowledgeIndexes: "&workspaceId,builtAt",
  });
  database.version(2).stores({
    knowledgeIndexes: "&workspaceId,builtAt",
    searchIndexes: "&workspaceId,builtAt",
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
