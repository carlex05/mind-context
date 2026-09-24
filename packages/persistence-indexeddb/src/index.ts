import Dexie, { type Table } from "dexie";
import type {
  KnowledgeIndexSnapshot,
  KnowledgeIndexSnapshotStore,
} from "@mind-context/knowledge";

interface KnowledgeIndexRecord {
  readonly workspaceId: string;
  readonly builtAt: string;
  readonly snapshot: KnowledgeIndexSnapshot;
}

export class IndexedDbKnowledgeIndexStore
  implements KnowledgeIndexSnapshotStore
{
  private readonly database: Dexie;
  private readonly snapshots: Table<KnowledgeIndexRecord, string>;

  constructor(databaseName = "mind-context-derived") {
    this.database = new Dexie(databaseName);
    this.database.version(1).stores({
      knowledgeIndexes: "&workspaceId,builtAt",
    });
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
