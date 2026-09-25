import {
  cosineSimilarity,
  type EmbeddingIndexSnapshot,
  type EmbeddingProvider,
} from "@mind-context/embeddings";
import {
  markdownParser,
  type MarkdownParser,
  type MarkdownSection,
} from "@mind-context/markdown";

export interface SearchQuery {
  readonly text: string;
  readonly limit?: number;
}

export interface SearchHit {
  readonly noteId: string;
  readonly path: string;
  readonly title: string;
  readonly heading?: string;
  readonly excerpt: string;
  readonly score: number;
  readonly lexicalScore?: number;
  readonly semanticScore?: number;
  readonly graphScore?: number;
}

export interface SearchChunk {
  readonly id: string;
  readonly noteId: string;
  readonly path: string;
  readonly headingPath: readonly string[];
  readonly ordinal: number;
  readonly text: string;
  readonly contentHash: string;
}

export interface SearchDocument {
  readonly noteId: string;
  readonly path: string;
  readonly name: string;
  readonly title: string;
  readonly aliases: readonly string[];
  readonly tags: readonly string[];
  readonly headings: readonly string[];
  readonly content: string;
  readonly contentHash: string;
  readonly chunks: readonly SearchChunk[];
  readonly revision?: string;
  readonly modifiedAt?: string;
}

export interface SearchIndexSnapshot {
  readonly schemaVersion: 1;
  readonly workspaceId: string;
  readonly builtAt: string;
  readonly documents: readonly SearchDocument[];
}

export interface SearchIndexSnapshotStore {
  get(workspaceId: string): Promise<SearchIndexSnapshot | undefined>;
  put(snapshot: SearchIndexSnapshot): Promise<void>;
  delete(workspaceId: string): Promise<void>;
}

export interface SearchService {
  search(query: SearchQuery): Promise<readonly SearchHit[]>;
}

export interface SearchDocumentInput {
  readonly noteId: string;
  readonly path: string;
  readonly name: string;
  readonly title: string;
  readonly aliases: readonly string[];
  readonly tags: readonly string[];
  readonly headings: readonly string[];
  readonly content: string;
  readonly revision?: string;
  readonly modifiedAt?: string;
}

interface IndexedField {
  readonly value: string;
  readonly tokens: readonly string[];
  readonly weight: number;
}

interface IndexedDocument {
  readonly source: SearchDocument;
  readonly fields: readonly IndexedField[];
  readonly searchableText: string;
}

const FIELD_WEIGHTS = {
  title: 7,
  aliases: 6,
  tags: 5,
  headings: 4,
  path: 3,
  content: 1,
} as const;

const DEFAULT_MAX_CHUNK_CHARS = 1800;

/**
 * Disposable in-memory lexical index.
 *
 * It intentionally owns no persistence and performs no I/O. Callers may
 * restore its input documents from a local derived-state store or rebuild them
 * from canonical Markdown.
 */
export class LexicalSearchIndex implements SearchService {
  private readonly documents: readonly IndexedDocument[];

  constructor(documents: readonly SearchDocument[]) {
    this.documents = documents.map(indexDocument);
  }

  search(query: SearchQuery): Promise<readonly SearchHit[]> {
    return Promise.resolve(this.searchSync(query));
  }

  searchSync(query: SearchQuery): readonly SearchHit[] {
    const queryText = query.text.trim();
    if (!queryText) return [];

    const terms = tokenize(queryText);
    if (terms.length === 0) return [];

    const normalizedQuery = normalize(queryText);
    const documentFrequencies = new Map<string, number>();

    for (const term of terms) {
      let count = 0;
      for (const document of this.documents) {
        if (document.searchableText.includes(term)) count += 1;
      }
      documentFrequencies.set(term, count);
    }

    const hits: SearchHit[] = [];
    for (const document of this.documents) {
      if (!terms.every((term) => document.searchableText.includes(term))) {
        continue;
      }

      let lexicalScore = 0;
      for (const term of terms) {
        const frequency = documentFrequencies.get(term) ?? 0;
        const idf = Math.log(
          1 +
            (this.documents.length - frequency + 0.5) /
              (frequency + 0.5),
        );

        for (const field of document.fields) {
          const occurrences = tokenCount(field.tokens, term);
          if (occurrences === 0) continue;

          const tf =
            (occurrences * 2.2) /
            (occurrences + 1.2 + field.tokens.length * 0.015);
          lexicalScore += idf * field.weight * tf;
        }
      }

      const title = normalize(document.source.title);
      const aliases = normalize(document.source.aliases.join(" "));
      const headings = normalize(document.source.headings.join(" "));
      const tags = normalize(document.source.tags.join(" "));

      if (title === normalizedQuery) lexicalScore += 20;
      else if (title.startsWith(normalizedQuery)) lexicalScore += 12;
      else if (title.includes(normalizedQuery)) lexicalScore += 8;

      if (aliases.includes(normalizedQuery)) lexicalScore += 7;
      if (tags.includes(normalizedQuery)) lexicalScore += 5;
      if (headings.includes(normalizedQuery)) lexicalScore += 4;

      hits.push({
        noteId: document.source.noteId,
        path: document.source.path,
        title: document.source.title,
        excerpt: excerptAround(document.source.content, queryText),
        score: lexicalScore,
        lexicalScore,
      });
    }

    return hits
      .sort(
        (left, right) =>
          right.score - left.score ||
          left.path.localeCompare(right.path),
      )
      .slice(0, Math.max(1, query.limit ?? 30));
  }

  withDocument(document: SearchDocument): LexicalSearchIndex {
    const remaining = this.documents
      .map((indexed) => indexed.source)
      .filter((candidate) => candidate.noteId !== document.noteId);
    return new LexicalSearchIndex([...remaining, document]);
  }

  withoutDocument(noteId: string): LexicalSearchIndex {
    return new LexicalSearchIndex(
      this.documents
        .map((document) => document.source)
        .filter((document) => document.noteId !== noteId),
    );
  }
}

export function createLexicalSearchIndex(
  documents: readonly SearchDocument[],
): LexicalSearchIndex {
  return new LexicalSearchIndex(documents);
}

export function createSearchDocument(
  input: SearchDocumentInput,
  parser: MarkdownParser = markdownParser,
): SearchDocument {
  const contentHash = fingerprint(input.content);
  return {
    noteId: input.noteId,
    path: input.path,
    name: input.name,
    title: input.title,
    aliases: input.aliases,
    tags: input.tags,
    headings: input.headings,
    content: input.content,
    contentHash,
    chunks: chunkMarkdown(
      input.noteId,
      input.path,
      input.content,
      parser,
    ),
    ...(input.revision ? { revision: input.revision } : {}),
    ...(input.modifiedAt ? { modifiedAt: input.modifiedAt } : {}),
  };
}

export function createSearchIndexSnapshot(
  workspaceId: string,
  documents: readonly SearchDocument[],
): SearchIndexSnapshot {
  return {
    schemaVersion: 1,
    workspaceId,
    builtAt: new Date().toISOString(),
    documents: [...documents].sort((left, right) =>
      left.path.localeCompare(right.path),
    ),
  };
}

export function upsertSearchDocument(
  snapshot: SearchIndexSnapshot,
  document: SearchDocument,
): SearchIndexSnapshot {
  return createSearchIndexSnapshot(snapshot.workspaceId, [
    ...snapshot.documents.filter(
      (candidate) => candidate.noteId !== document.noteId,
    ),
    document,
  ]);
}

export function canReuseSearchDocument(
  previous: SearchDocument | undefined,
  revision: string | undefined,
): previous is SearchDocument {
  return Boolean(previous && revision && previous.revision === revision);
}

export function chunkMarkdown(
  noteId: string,
  path: string,
  content: string,
  parser: MarkdownParser = markdownParser,
  maxChars = DEFAULT_MAX_CHUNK_CHARS,
): readonly SearchChunk[] {
  const parsed = parser.parse(content);
  const headingStack: string[] = [];
  const chunks: SearchChunk[] = [];
  let ordinal = 0;

  for (const section of parsed.sections) {
    if (section.heading && section.level) {
      headingStack.length = section.level - 1;
      headingStack[section.level - 1] = section.heading;
    }

    const headingPath = headingStack.filter(Boolean);
    for (const part of splitSection(section, headingPath, maxChars)) {
      const text = part.trim();
      if (!text) continue;
      const contentHash = fingerprint(text);
      chunks.push({
        id: `${noteId}:${ordinal}:${contentHash}`,
        noteId,
        path,
        headingPath: [...headingPath],
        ordinal,
        text,
        contentHash,
      });
      ordinal += 1;
    }
  }

  if (chunks.length === 0 && content.trim()) {
    const text = content.trim();
    const contentHash = fingerprint(text);
    chunks.push({
      id: `${noteId}:0:${contentHash}`,
      noteId,
      path,
      headingPath: [],
      ordinal: 0,
      text,
      contentHash,
    });
  }

  return chunks;
}

function splitSection(
  section: MarkdownSection,
  headingPath: readonly string[],
  maxChars: number,
): readonly string[] {
  const headingContext =
    headingPath.length > 0 ? headingPath.join(" > ") : "";
  const body = section.content.trim();
  const prefix = headingContext ? `${headingContext}\n\n` : "";

  if ((prefix + body).length <= maxChars) {
    return body || prefix
      ? [`${prefix}${body}`.trim()]
      : [];
  }

  const paragraphs = body
    .split(/\n\s*\n/u)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  const result: string[] = [];
  let current = "";

  const flush = () => {
    if (!current.trim()) return;
    result.push(`${prefix}${current.trim()}`.trim());
    current = "";
  };

  for (const paragraph of paragraphs) {
    if (paragraph.length > maxChars) {
      flush();
      for (let offset = 0; offset < paragraph.length; offset += maxChars) {
        result.push(
          `${prefix}${paragraph.slice(offset, offset + maxChars)}`.trim(),
        );
      }
      continue;
    }

    const candidate = current
      ? `${current}\n\n${paragraph}`
      : paragraph;
    if ((prefix + candidate).length > maxChars && current) {
      flush();
      current = paragraph;
    } else {
      current = candidate;
    }
  }

  flush();
  return result;
}

function indexDocument(document: SearchDocument): IndexedDocument {
  const fields: IndexedField[] = [
    field(document.title, FIELD_WEIGHTS.title),
    field(document.aliases.join(" "), FIELD_WEIGHTS.aliases),
    field(document.tags.join(" "), FIELD_WEIGHTS.tags),
    field(document.headings.join(" "), FIELD_WEIGHTS.headings),
    field(document.path, FIELD_WEIGHTS.path),
    field(document.content, FIELD_WEIGHTS.content),
  ];

  return {
    source: document,
    fields,
    searchableText: fields.map((candidate) => candidate.value).join(" "),
  };
}

function field(value: string, weight: number): IndexedField {
  const normalized = normalize(value);
  return {
    value: normalized,
    tokens: tokenizeNormalized(normalized),
    weight,
  };
}

function tokenize(value: string): readonly string[] {
  return tokenizeNormalized(normalize(value));
}

function tokenizeNormalized(value: string): readonly string[] {
  return value.match(/[\p{L}\p{N}_-]+/gu) ?? [];
}

function tokenCount(tokens: readonly string[], term: string): number {
  let count = 0;
  for (const token of tokens) {
    if (token === term || token.startsWith(term)) count += 1;
  }
  return count;
}

function normalize(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLocaleLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function excerptAround(content: string, query: string): string {
  const plain = plainText(content);
  if (!plain) return "";

  const normalizedPlain = normalize(plain);
  const firstTerm = tokenize(query)[0] ?? normalize(query);
  const index = normalizedPlain.indexOf(firstTerm);
  const radius = 82;

  if (index < 0) {
    return plain.length > radius * 2
      ? `${plain.slice(0, radius * 2).trim()}…`
      : plain;
  }

  const start = Math.max(0, index - radius);
  const end = Math.min(plain.length, index + firstTerm.length + radius);
  return `${start > 0 ? "…" : ""}${plain
    .slice(start, end)
    .trim()}${end < plain.length ? "…" : ""}`;
}

function plainText(content: string): string {
  return content
    .replace(/^---\s*[\s\S]*?\n---\s*/u, "")
    .replace(/```[\s\S]*?```/gu, " ")
    .replace(/!\[\[([^\]]+)\]\]/gu, "$1")
    .replace(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/gu, "$2 $1")
    .replace(/\[([^\]]+)\]\([^)]+\)/gu, "$1")
    .replace(/[#>*_`~|-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function fingerprint(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}


export class SemanticSearchIndex implements SearchService {
  private readonly chunksById = new Map<
    string,
    { readonly document: SearchDocument; readonly chunk: SearchChunk }
  >();

  constructor(
    private readonly snapshot: SearchIndexSnapshot,
    private readonly embeddingSnapshot: EmbeddingIndexSnapshot,
    private readonly provider: EmbeddingProvider,
  ) {
    for (const document of snapshot.documents) {
      for (const chunk of document.chunks) {
        this.chunksById.set(chunk.id, { document, chunk });
      }
    }
  }

  async search(query: SearchQuery): Promise<readonly SearchHit[]> {
    const queryText = query.text.trim();
    if (!queryText) return [];

    const [queryEmbedding] = await this.provider.embed(
      [queryText],
      { inputType: "query" },
    );
    if (!queryEmbedding) return [];

    const bestByNote = new Map<string, SearchHit>();
    for (const item of this.embeddingSnapshot.embeddings) {
      const indexed = this.chunksById.get(item.chunkId);
      if (!indexed) continue;
      if (item.model !== this.provider.model) continue;
      if (item.providerId !== this.provider.id) continue;
      if (item.contentHash !== indexed.chunk.contentHash) continue;

      const semanticScore = cosineSimilarity(
        queryEmbedding.values,
        item.values,
      );
      if (!Number.isFinite(semanticScore)) continue;

      const hit: SearchHit = {
        noteId: indexed.document.noteId,
        path: indexed.document.path,
        title: indexed.document.title,
        ...(indexed.chunk.headingPath.length > 0
          ? {
              heading:
                indexed.chunk.headingPath[
                  indexed.chunk.headingPath.length - 1
                ],
            }
          : {}),
        excerpt: indexed.chunk.text,
        score: semanticScore,
        semanticScore,
      };
      const current = bestByNote.get(hit.noteId);
      if (!current || hit.score > current.score) {
        bestByNote.set(hit.noteId, hit);
      }
    }

    return [...bestByNote.values()]
      .sort(
        (left, right) =>
          right.score - left.score ||
          left.path.localeCompare(right.path),
      )
      .slice(0, Math.max(1, query.limit ?? 30));
  }
}

export class HybridSearchService implements SearchService {
  constructor(
    private readonly lexical: SearchService,
    private readonly semantic?: SearchService,
  ) {}

  async search(query: SearchQuery): Promise<readonly SearchHit[]> {
    if (!this.semantic) return this.lexical.search(query);

    const candidateLimit = Math.max(40, (query.limit ?? 30) * 3);
    const [lexical, semantic] = await Promise.all([
      this.lexical.search({ ...query, limit: candidateLimit }),
      this.semantic.search({ ...query, limit: candidateLimit }),
    ]);

    return fuseRankedHits(
      lexical,
      semantic,
      Math.max(1, query.limit ?? 30),
    );
  }
}

export function fuseRankedHits(
  lexical: readonly SearchHit[],
  semantic: readonly SearchHit[],
  limit = 30,
): readonly SearchHit[] {
  const scoreByNote = new Map<
    string,
    {
      hit: SearchHit;
      score: number;
      lexicalScore?: number;
      semanticScore?: number;
    }
  >();
  const k = 60;

  lexical.forEach((hit, index) => {
    scoreByNote.set(hit.noteId, {
      hit,
      score: 1 / (k + index + 1),
      ...(hit.lexicalScore !== undefined
        ? { lexicalScore: hit.lexicalScore }
        : {}),
    });
  });

  semantic.forEach((hit, index) => {
    const current = scoreByNote.get(hit.noteId);
    const semanticContribution = 1 / (k + index + 1);
    if (current) {
      scoreByNote.set(hit.noteId, {
        hit:
          hit.semanticScore !== undefined &&
          (current.hit.semanticScore ?? -Infinity) < hit.semanticScore
            ? {
                ...current.hit,
                excerpt: hit.excerpt,
                ...(hit.heading ? { heading: hit.heading } : {}),
              }
            : current.hit,
        score: current.score + semanticContribution,
        ...(current.lexicalScore !== undefined
          ? { lexicalScore: current.lexicalScore }
          : {}),
        ...(hit.semanticScore !== undefined
          ? { semanticScore: hit.semanticScore }
          : {}),
      });
    } else {
      scoreByNote.set(hit.noteId, {
        hit,
        score: semanticContribution,
        ...(hit.semanticScore !== undefined
          ? { semanticScore: hit.semanticScore }
          : {}),
      });
    }
  });

  return [...scoreByNote.values()]
    .map(({ hit, score, lexicalScore, semanticScore }) => ({
      ...hit,
      score,
      ...(lexicalScore !== undefined ? { lexicalScore } : {}),
      ...(semanticScore !== undefined ? { semanticScore } : {}),
    }))
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.path.localeCompare(right.path),
    )
    .slice(0, Math.max(1, limit));
}
