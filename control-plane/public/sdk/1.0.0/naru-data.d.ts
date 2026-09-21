/**
 * Naru 사이트 데이터용 브라우저 SDK입니다.
 *
 * ```html
 * <script type="module">
 *   import { createNaru } from "https://naru.pub/sdk/1.0.0/naru-data.js";
 *   const naru = createNaru();
 *   const page = await naru.collection("posts").list({ limit: 20 });
 * </script>
 * ```
 *
 * `이름.naru.pub`에서는 사이트를 주소에서 알아냅니다. 연결한 도메인이나 로컬
 * 개발에서는 `createNaru({ site: "이름" })`처럼 한 번만 지정하세요.
 *
 * @packageDocumentation
 */

export type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [key: string]: Json };

/** 저장된 값과 나루가 관리하는 메타데이터입니다. */
export interface Document<T = Json> {
  id: string;
  data: T;
  createdAt: string;
  updatedAt: string;
  /** 동시 수정을 막을 때 그대로 돌려주는 불투명한 값입니다. */
  revision: string;
}

/** 쓰기가 반영된 뒤의 서버 메타데이터입니다. */
export interface WriteResult {
  id: string;
  revision: string;
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

/** 프로그램은 HTTP 상태가 아니라 `code`로 실패를 구분하세요. */
export class NaruError extends Error {
  readonly code: NaruErrorCode;
  readonly retryable: boolean;
  /** 진단용 값입니다. 프로그램의 흐름을 이 값에 의존하지 마세요. */
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

export interface WriteOptions extends RequestOptions {
  /** 읽어 둔 문서의 `revision`과 같을 때만 씁니다. */
  ifRevision?: string;
  /** 문서가 아직 없을 때만 씁니다. */
  ifAbsent?: boolean;
}

export interface RangeFilter {
  gt?: string | number;
  gte?: string | number;
  lt?: string | number;
  lte?: string | number;
}

/** 최상위 사용자 필드 조건을 최대 5개까지 AND로 묶습니다. */
export type Filter = Record<
  string,
  string | number | boolean | null | RangeFilter
>;
export type Direction = "asc" | "desc";
/** 사용자 필드는 이름 그대로, 메타데이터는 `$id`, `$createdAt`, `$updatedAt`입니다. */
export type OrderBy =
  | [[string, Direction]]
  | [[string, Direction], [string, Direction]];

export interface ListOptions extends RequestOptions {
  where?: Filter;
  orderBy?: OrderBy;
  /** 기본 50, 최대 100입니다. */
  limit?: number;
  /** 앞 쪽의 `nextCursor`를 수정하지 않고 넘기세요. */
  cursor?: string | null;
  /** 참이면 조건에 맞는 전체 개수를 `totalCount`에 함께 받습니다. */
  count?: boolean;
}

export interface Page<T> {
  documents: Document<T>[];
  nextCursor: string | null;
  totalCount?: number;
}

export interface Collection<T = Json> {
  get(id: string, options?: RequestOptions): Promise<Document<T>>;
  list(options?: ListOptions): Promise<Page<T>>;
  add(data: T, options?: RequestOptions): Promise<WriteResult>;
  /** 문서 전체를 교체하거나 새로 만듭니다. */
  set(id: string, data: T, options?: WriteOptions): Promise<WriteResult>;
  /** 없는 문서를 지워도 성공합니다. */
  delete(id: string, options?: WriteOptions): Promise<void>;
}

export interface StoredFile {
  id: string;
  name: string;
  contentType: string;
  size: number;
  url: string;
  createdAt: string;
  updatedAt: string;
}

export type AtomicOperation =
  | { type: "add"; collection: string; data: Json }
  | ({ type: "set"; collection: string; id: string; data: Json } & Omit<
      WriteOptions,
      "signal"
    >)
  | ({ type: "delete"; collection: string; id: string } & Omit<
      WriteOptions,
      "signal"
    >);

/** 승인한 컬렉션만 다룰 수 있는 관리자 클라이언트입니다. */
export interface Owner {
  collection<T = Json>(name: string): Collection<T>;
  /** 모든 작업을 반영하거나 하나도 반영하지 않습니다. */
  atomic(
    operations: AtomicOperation[],
    options?: RequestOptions,
  ): Promise<(WriteResult | { success: true })[]>;
  files: {
    /** 파일을 안전한 공개 미디어로 저장합니다. 처리 방식은 나루가 정합니다. */ upload(
      file: File | Blob,
      options?: RequestOptions,
    ): Promise<StoredFile>;
  };
  signOut(): Promise<void>;
}

export interface NaruClient {
  collection<T = Json>(name: string): Collection<T>;
  auth: {
    /** 이 탭에서 복원하거나 막 완료한 관리자 세션, 또는 `null`입니다. */
    session(): Promise<Owner | null>;
    /** 승인을 위해 나루로 이동하므로 성공하면 돌아오지 않습니다. */
    signIn(options: { collections: string[] }): Promise<void>;
  };
}

/** 사이트 하나에 묶인 나루 클라이언트를 만듭니다. */
export function createNaru(options?: { site?: string }): NaruClient;
