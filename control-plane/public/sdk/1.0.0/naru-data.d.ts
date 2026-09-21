/** Browser SDK for data owned by one Naru site. @packageDocumentation */

export type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [key: string]: Json };

declare const revisionBrand: unique symbol;
/** An opaque concurrency token. Store and return it unchanged. */
export type Revision = string & { readonly [revisionBrand]: true };

export interface Document<T = Json> {
  id: string;
  data: T;
  createdAt: string;
  updatedAt: string;
  revision: Revision;
}

export interface WriteResult {
  id: string;
  revision: Revision;
  createdAt: string;
  updatedAt: string;
}

export type NaruErrorCode =
  | "CONFLICT"
  | "AUTH_REQUIRED"
  | "ACCESS_DENIED"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "INVALID_REQUEST"
  | "REDIRECT_NOT_REGISTERED"
  | "UNAVAILABLE";

export class NaruError extends Error {
  readonly code: NaruErrorCode;
  readonly retryable: boolean;
  /** Diagnostic only; application behavior should depend on `code`. */
  readonly status?: number;
  readonly cause?: unknown;
  constructor(
    message: string,
    code: NaruErrorCode,
    options?: { status?: number; retryable?: boolean; cause?: unknown },
  );
}

export interface RequestOptions {
  signal?: AbortSignal;
}
export type WriteCondition = { revision: Revision } | { absent: true };
export interface WriteOptions extends RequestOptions {
  condition?: WriteCondition;
}

export interface RangeFilter {
  gt?: string | number;
  gte?: string | number;
  lt?: string | number;
  lte?: string | number;
}

/** Top-level user fields, combined with AND. */
export type Filter = Record<
  string,
  string | number | boolean | null | RangeFilter
>;
export type Direction = "asc" | "desc";
export type MetadataField = "id" | "createdAt" | "updatedAt";
export type SortField = string | { metadata: MetadataField };
export type Sort =
  | readonly [readonly [SortField, Direction]]
  | readonly [readonly [SortField, Direction], readonly [SortField, Direction]];

export interface PageOptions {
  /** Opaque cursor returned by the preceding page. */
  after?: string | null;
  /** Default 50; maximum 100. */
  size?: number;
  includeTotal?: boolean;
}

export interface ListOptions extends RequestOptions {
  filter?: Filter;
  sort?: Sort;
  page?: PageOptions;
}

export interface Page<T> {
  documents: Document<T>[];
  nextCursor: string | null;
  totalCount?: number;
}

export interface PublicCollection<T = Json> {
  get(id: string, options?: RequestOptions): Promise<Document<T>>;
  list(options?: ListOptions): Promise<Page<T>>;
  add(data: T, options?: RequestOptions): Promise<WriteResult>;
}

export interface OwnerCollection<T = Json> extends PublicCollection<T> {
  /** Replaces the whole document or creates it. */
  set(id: string, data: T, options?: WriteOptions): Promise<WriteResult>;
  /** Deleting a missing document succeeds unless a condition was supplied. */
  delete(id: string, options?: WriteOptions): Promise<void>;
}

export interface Media {
  id: string;
  name: string;
  contentType: string;
  size: number;
  url: string;
  createdAt: string;
  updatedAt: string;
}

export type TransactionWrite =
  | {
      collection: string;
      set: { id: string; data: Json; condition?: WriteCondition };
    }
  | { collection: string; delete: { id: string; condition?: WriteCondition } };

export interface Owner {
  collection<T = Json>(name: string): OwnerCollection<T>;
  /** Commits every write or none. */
  transaction(
    writes: readonly TransactionWrite[],
    options?: RequestOptions,
  ): Promise<void>;
  media: {
    upload(file: File | Blob, options?: RequestOptions): Promise<Media>;
  };
  signOut(): Promise<void>;
}

export interface NaruClient {
  /** Operations that do not use owner credentials. */
  public: { collection<T = Json>(name: string): PublicCollection<T> };
  auth: {
    session(): Promise<Owner | null>;
    /** Redirects to Naru for approval. */
    signIn(options: { collections: readonly string[] }): Promise<void>;
  };
}

/** Creates a client bound to one site. */
export function createNaru(options?: { site?: string }): NaruClient;
