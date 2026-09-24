import {
  markdownParser,
  type MarkdownParser,
  type WikiLink,
} from "@mind-context/markdown";

export interface KnowledgeDocument {
  readonly id: string;
  readonly path: string;
  readonly name: string;
  readonly content: string;
  readonly modifiedAt?: string;
  readonly revision?: string;
}

export interface IndexedHeading {
  readonly text: string;
  readonly level: number;
}

export interface IndexedNote {
  readonly id: string;
  readonly path: string;
  readonly name: string;
  readonly title: string;
  readonly headings: readonly IndexedHeading[];
  readonly tags: readonly string[];
  readonly wikiLinks: readonly WikiLink[];
  readonly modifiedAt?: string;
  readonly revision?: string;
}

export type LinkResolution =
  | "resolved"
  | "missing-note"
  | "ambiguous-note"
  | "missing-heading";

export interface KnowledgeEdge {
  readonly sourceNoteId: string;
  readonly sourcePath: string;
  readonly target: string;
  readonly heading?: string;
  readonly alias?: string;
  readonly resolution: LinkResolution;
  readonly targetNoteId?: string;
  readonly targetPath?: string;
}

export interface KnowledgeIndexSnapshot {
  readonly schemaVersion: 1;
  readonly workspaceId: string;
  readonly builtAt: string;
  readonly notes: readonly IndexedNote[];
  readonly edges: readonly KnowledgeEdge[];
}

export interface KnowledgeIndexSnapshotStore {
  get(workspaceId: string): Promise<KnowledgeIndexSnapshot | undefined>;
  put(snapshot: KnowledgeIndexSnapshot): Promise<void>;
  delete(workspaceId: string): Promise<void>;
}

export function buildKnowledgeIndex(
  workspaceId: string,
  documents: readonly KnowledgeDocument[],
  parser: MarkdownParser = markdownParser,
): KnowledgeIndexSnapshot {
  const notes = documents.map((document) => indexDocument(document, parser));
  return createSnapshot(workspaceId, notes);
}

export function upsertKnowledgeDocument(
  snapshot: KnowledgeIndexSnapshot,
  document: KnowledgeDocument,
  parser: MarkdownParser = markdownParser,
): KnowledgeIndexSnapshot {
  const nextNote = indexDocument(document, parser);
  const notes = snapshot.notes.filter((note) => note.id !== nextNote.id);
  notes.push(nextNote);
  return createSnapshot(snapshot.workspaceId, notes);
}

export function getNote(
  snapshot: KnowledgeIndexSnapshot | undefined,
  noteId: string,
): IndexedNote | undefined {
  return snapshot?.notes.find((note) => note.id === noteId);
}

export function getOutgoingLinks(
  snapshot: KnowledgeIndexSnapshot | undefined,
  noteId: string,
): readonly KnowledgeEdge[] {
  return snapshot?.edges.filter((edge) => edge.sourceNoteId === noteId) ?? [];
}

export function getBacklinks(
  snapshot: KnowledgeIndexSnapshot | undefined,
  noteId: string,
): readonly KnowledgeEdge[] {
  return (
    snapshot?.edges.filter(
      (edge) =>
        edge.resolution === "resolved" && edge.targetNoteId === noteId,
    ) ?? []
  );
}

export function getBrokenLinks(
  snapshot: KnowledgeIndexSnapshot | undefined,
  noteId?: string,
): readonly KnowledgeEdge[] {
  return (
    snapshot?.edges.filter(
      (edge) =>
        edge.resolution !== "resolved" &&
        (noteId === undefined || edge.sourceNoteId === noteId),
    ) ?? []
  );
}

function indexDocument(
  document: KnowledgeDocument,
  parser: MarkdownParser,
): IndexedNote {
  const parsed = parser.parse(document.content);
  const headings = parsed.sections.flatMap((section) =>
    section.heading && section.level
      ? [{ text: section.heading, level: section.level }]
      : [],
  );
  const firstH1 = headings.find((heading) => heading.level === 1);

  return {
    id: document.id,
    path: normalizeDisplayPath(document.path),
    name: document.name,
    title: firstH1?.text ?? withoutMarkdownExtension(document.name),
    headings,
    tags: parsed.tags,
    wikiLinks: parsed.wikiLinks,
    ...(document.modifiedAt ? { modifiedAt: document.modifiedAt } : {}),
    ...(document.revision ? { revision: document.revision } : {}),
  };
}

function createSnapshot(
  workspaceId: string,
  notes: readonly IndexedNote[],
): KnowledgeIndexSnapshot {
  const sortedNotes = [...notes].sort((left, right) =>
    left.path.localeCompare(right.path),
  );

  const byPath = new Map<string, IndexedNote[]>();
  const byBasename = new Map<string, IndexedNote[]>();

  for (const note of sortedNotes) {
    addLookup(byPath, normalizeTarget(note.path), note);
    addLookup(byBasename, normalizeTarget(note.name), note);
  }

  const edges = sortedNotes.flatMap((note) =>
    note.wikiLinks.map((link) =>
      resolveLink(note, link, byPath, byBasename),
    ),
  );

  return {
    schemaVersion: 1,
    workspaceId,
    builtAt: new Date().toISOString(),
    notes: sortedNotes,
    edges,
  };
}

function resolveLink(
  source: IndexedNote,
  link: WikiLink,
  byPath: ReadonlyMap<string, readonly IndexedNote[]>,
  byBasename: ReadonlyMap<string, readonly IndexedNote[]>,
): KnowledgeEdge {
  const normalizedTarget = normalizeTarget(link.target);
  const pathMatches = byPath.get(normalizedTarget) ?? [];
  const basenameMatches = byBasename.get(normalizedTarget) ?? [];
  const matches =
    pathMatches.length > 0
      ? pathMatches
      : basenameMatches;

  const base = {
    sourceNoteId: source.id,
    sourcePath: source.path,
    target: link.target,
    ...(link.heading ? { heading: link.heading } : {}),
    ...(link.alias ? { alias: link.alias } : {}),
  };

  if (matches.length === 0) {
    return { ...base, resolution: "missing-note" };
  }

  if (matches.length > 1) {
    return { ...base, resolution: "ambiguous-note" };
  }

  const targetNote = matches[0]!;
  if (
    link.heading &&
    !targetNote.headings.some(
      (heading) => normalizeHeading(heading.text) === normalizeHeading(link.heading!),
    )
  ) {
    return {
      ...base,
      resolution: "missing-heading",
      targetNoteId: targetNote.id,
      targetPath: targetNote.path,
    };
  }

  return {
    ...base,
    resolution: "resolved",
    targetNoteId: targetNote.id,
    targetPath: targetNote.path,
  };
}

function addLookup(
  map: Map<string, IndexedNote[]>,
  key: string,
  note: IndexedNote,
): void {
  const existing = map.get(key);
  if (existing) {
    existing.push(note);
  } else {
    map.set(key, [note]);
  }
}

function normalizeTarget(value: string): string {
  return withoutMarkdownExtension(
    normalizeDisplayPath(value)
      .replace(/^\.\//, "")
      .replace(/^\//, ""),
  ).toLocaleLowerCase();
}

function normalizeHeading(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function normalizeDisplayPath(value: string): string {
  return value.replaceAll("\\", "/").replace(/\/+/g, "/");
}

function withoutMarkdownExtension(value: string): string {
  return value.toLocaleLowerCase().endsWith(".md")
    ? value.slice(0, -3)
    : value;
}
