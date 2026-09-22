/** Browser SDK for data owned by one Naru site. @packageDocumentation */

// Only the names an application writes itself, including in helpers that pass
// options along, are exported: every exported name is one v1 can never rename.
// The rest are spelled out where they are used.

export type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [key: string]: Json };

/** @internal */
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

export interface Page<T = Json> {
  documents: Document<T>[];
  nextCursor: string | null;
  totalCount?: number;
}

/**
 * Why an operation failed. The list is closed for v1: a code a later server
 * adds reaches this version as the nearest code here.
 */
export type NaruErrorCode =
  | "CONFLICT"
  | "QUOTA_EXCEEDED"
  | "AUTH_REQUIRED"
  | "ACCESS_DENIED"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "INVALID_REQUEST"
  | "UNAVAILABLE";

/** A Naru operation that could not be completed. Check it with `instanceof`. */
export class NaruError extends Error {
  private constructor();
  readonly code: NaruErrorCode;
  /** True for `RATE_LIMITED` and `UNAVAILABLE`. */
  readonly retryable: boolean;
}

/** Top-level user fields, combined with AND. */
export type Filter = Record<
  string,
  | string
  | number
  | boolean
  | null
  | {
      gt?: string | number;
      gte?: string | number;
      lt?: string | number;
      lte?: string | number;
    }
>;

/** One or two keys: a user field by name, or document metadata. */
export type Sort =
  | readonly [
      readonly [
        string | { metadata: "id" | "createdAt" | "updatedAt" },
        "asc" | "desc",
      ],
    ]
  | readonly [
      readonly [
        string | { metadata: "id" | "createdAt" | "updatedAt" },
        "asc" | "desc",
      ],
      readonly [
        string | { metadata: "id" | "createdAt" | "updatedAt" },
        "asc" | "desc",
      ],
    ];

export interface ListOptions {
  filter?: Filter;
  sort?: Sort;
  /** Default 50; maximum 100. */
  size?: number;
  /** Opaque cursor returned by the preceding page. */
  after?: string | null;
  includeTotal?: boolean;
  signal?: AbortSignal;
}

/** Write only at this revision, or only if the document does not exist yet. */
export type WriteCondition = { revision: Revision } | { absent: true };

export interface PublicCollection<T = Json> {
  get(id: string, options?: { signal?: AbortSignal }): Promise<Document<T>>;
  list(options?: ListOptions): Promise<Page<T>>;
  add(
    data: T,
    options?: { signal?: AbortSignal },
  ): Promise<{
    id: string;
    revision: Revision;
    createdAt: string;
    updatedAt: string;
  }>;
}

export interface OwnerCollection<T = Json> extends PublicCollection<T> {
  /** Replaces the whole document or creates it. */
  set(
    id: string,
    data: T,
    options?: { condition?: WriteCondition; signal?: AbortSignal },
  ): Promise<{
    id: string;
    revision: Revision;
    createdAt: string;
    updatedAt: string;
  }>;
  /** Deleting a missing document succeeds unless a condition was supplied. */
  delete(
    id: string,
    options?: { condition?: { revision: Revision }; signal?: AbortSignal },
  ): Promise<void>;
}

export interface Owner {
  collection<T = Json>(name: string): OwnerCollection<T>;
  /** Commits every write or none. */
  transaction(
    writes: readonly (
      | {
          collection: string;
          set: { id: string; data: Json; condition?: WriteCondition };
        }
      | {
          collection: string;
          delete: { id: string; condition?: { revision: Revision } };
        }
    )[],
    options?: { signal?: AbortSignal },
  ): Promise<void>;
  media: {
    /** Stores a file publicly. Large photos may be shrunk first. */
    upload(
      file: File | Blob,
      options?: { signal?: AbortSignal },
    ): Promise<{
      url: string;
      name: string;
      contentType: string;
      size: number;
    }>;
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

export {};
