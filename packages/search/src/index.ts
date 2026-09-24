export interface SearchQuery {
  readonly text: string;
  readonly limit?: number;
}

export interface SearchHit {
  readonly noteId: string;
  readonly path: string;
  readonly heading?: string;
  readonly excerpt: string;
  readonly score: number;
  readonly lexicalScore?: number;
  readonly semanticScore?: number;
  readonly graphScore?: number;
}

export interface SearchService {
  search(query: SearchQuery): Promise<readonly SearchHit[]>;
}
