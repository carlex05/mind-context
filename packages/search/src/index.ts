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

export interface SearchDocument {
  readonly noteId: string;
  readonly path: string;
  readonly title: string;
  readonly aliases: readonly string[];
  readonly tags: readonly string[];
  readonly headings: readonly string[];
  readonly content: string;
}

export interface SearchService {
  search(query: SearchQuery): Promise<readonly SearchHit[]>;
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

/**
 * Disposable in-memory lexical index.
 *
 * It intentionally owns no persistence and performs no I/O. Callers rebuild it
 * from canonical Markdown whenever local derived state is lost.
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
    .replace(/![[([^\]]+)\]\]/gu, "$1")
    .replace(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/gu, "$2 $1")
    .replace(/\[([^\]]+)\]\([^)]+\)/gu, "$1")
    .replace(/[#>*_`~|-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
