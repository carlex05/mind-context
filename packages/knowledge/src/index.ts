import {
  markdownParser,
  type InternalLink,
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
  readonly path: readonly string[];
}

export interface IndexedNote {
  readonly id: string;
  readonly path: string;
  readonly name: string;
  readonly title: string;
  readonly aliases: readonly string[];
  readonly headings: readonly IndexedHeading[];
  readonly tags: readonly string[];
  readonly blockIds: readonly string[];
  readonly wikiLinks: readonly WikiLink[];
  readonly internalLinks: readonly InternalLink[];
  readonly modifiedAt?: string;
  readonly revision?: string;
}

export type LinkResolution =
  | "resolved"
  | "missing-note"
  | "ambiguous-note"
  | "missing-heading"
  | "missing-block";

export interface KnowledgeEdge {
  readonly sourceNoteId: string;
  readonly sourcePath: string;
  readonly syntax: InternalLink["syntax"];
  readonly embed: boolean;
  readonly target: string;
  readonly heading?: string;
  readonly blockId?: string;
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
  const headings = buildHeadingPaths(parsed.sections);
  const firstH1 = headings.find((heading) => heading.level === 1);

  return {
    id: document.id,
    path: normalizeDisplayPath(document.path),
    name: document.name,
    title: firstH1?.text ?? withoutMarkdownExtension(document.name),
    aliases: parsed.aliases,
    headings,
    tags: parsed.tags,
    blockIds: parsed.blockIds,
    wikiLinks: parsed.wikiLinks,
    internalLinks: parsed.internalLinks,
    ...(document.modifiedAt ? { modifiedAt: document.modifiedAt } : {}),
    ...(document.revision ? { revision: document.revision } : {}),
  };
}

function buildHeadingPaths(
  sections: ReturnType<MarkdownParser["parse"]>["sections"],
): readonly IndexedHeading[] {
  const result: IndexedHeading[] = [];
  const stack: string[] = [];

  for (const section of sections) {
    if (!section.heading || !section.level) continue;

    stack.length = section.level - 1;
    stack[section.level - 1] = section.heading;

    result.push({
      text: section.heading,
      level: section.level,
      path: stack.filter(Boolean),
    });
  }

  return result;
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
    note.internalLinks
      .filter(isNoteReference)
      .map((link) => resolveLink(note, link, byPath, byBasename)),
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
  link: InternalLink,
  byPath: ReadonlyMap<string, readonly IndexedNote[]>,
  byBasename: ReadonlyMap<string, readonly IndexedNote[]>,
): KnowledgeEdge {
  const base = {
    sourceNoteId: source.id,
    sourcePath: source.path,
    syntax: link.syntax,
    embed: link.embed,
    target: link.target,
    ...(link.heading ? { heading: link.heading } : {}),
    ...(link.blockId ? { blockId: link.blockId } : {}),
    ...(link.alias ? { alias: link.alias } : {}),
  };

  const matches = resolveTargetCandidates(source, link, byPath, byBasename);

  if (matches.length === 0) {
    return { ...base, resolution: "missing-note" };
  }

  if (matches.length > 1) {
    return { ...base, resolution: "ambiguous-note" };
  }

  const targetNote = matches[0]!;

  if (link.heading && !hasHeading(targetNote, link.heading)) {
    return {
      ...base,
      resolution: "missing-heading",
      targetNoteId: targetNote.id,
      targetPath: targetNote.path,
    };
  }

  if (link.blockId && !targetNote.blockIds.includes(link.blockId)) {
    return {
      ...base,
      resolution: "missing-block",
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

function resolveTargetCandidates(
  source: IndexedNote,
  link: InternalLink,
  byPath: ReadonlyMap<string, readonly IndexedNote[]>,
  byBasename: ReadonlyMap<string, readonly IndexedNote[]>,
): readonly IndexedNote[] {
  if (!link.target) {
    return [source];
  }

  const raw = normalizeDisplayPath(link.target);
  const rootKey = normalizeTarget(raw);
  const sourceDirectory = directoryName(source.path);
  const relativeKey = normalizeTarget(resolveRelativePath(sourceDirectory, raw));

  const orderedKeys =
    link.syntax === "markdown"
      ? raw.startsWith(".")
        ? [relativeKey, rootKey]
        : raw.includes("/")
          ? [rootKey, relativeKey]
          : [relativeKey, rootKey]
      : [rootKey];

  for (const key of unique(orderedKeys)) {
    const matches = byPath.get(key) ?? [];
    if (matches.length > 0) {
      return matches;
    }
  }

  return byBasename.get(normalizeTarget(baseName(raw))) ?? [];
}

function isNoteReference(link: InternalLink): boolean {
  if (!link.target) return true;

  const leaf = baseName(link.target);
  const lastDot = leaf.lastIndexOf(".");
  if (lastDot < 0) return true;

  return leaf.slice(lastDot).toLocaleLowerCase() === ".md";
}

function hasHeading(note: IndexedNote, rawHeading: string): boolean {
  const requested = rawHeading
    .split("#")
    .map(normalizeHeading)
    .filter(Boolean);

  if (requested.length === 0) return true;

  return note.headings.some((heading) => {
    const candidate = heading.path.map(normalizeHeading);
    if (requested.length === 1) {
      return candidate[candidate.length - 1] === requested[0];
    }

    if (candidate.length < requested.length) return false;
    const tail = candidate.slice(candidate.length - requested.length);
    return tail.every((part, index) => part === requested[index]);
  });
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

function resolveRelativePath(directory: string, target: string): string {
  const parts = directory ? directory.split("/") : [];
  for (const part of target.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      parts.pop();
    } else {
      parts.push(part);
    }
  }
  return parts.join("/");
}

function directoryName(path: string): string {
  const normalized = normalizeDisplayPath(path);
  const slash = normalized.lastIndexOf("/");
  return slash >= 0 ? normalized.slice(0, slash) : "";
}

function baseName(path: string): string {
  const normalized = normalizeDisplayPath(path);
  const slash = normalized.lastIndexOf("/");
  return slash >= 0 ? normalized.slice(slash + 1) : normalized;
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
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
