"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  LICENSES,
  MAX_POST_BODY_LENGTH,
  MAX_TITLE_LENGTH,
  POST_KINDS,
  POST_KIND_LABELS,
  type License,
  type PostKind,
} from "@/lib/board/constants";
import { boardRequest } from "../_components/api";
import { FolderPicker, commonFolder } from "../_components/FolderPicker";

function slugFrom(folder: string): string {
  const last = folder.split("/").filter(Boolean).pop() ?? "";
  return last
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export function NewPostForm({
  initialKind,
  collections,
}: {
  initialKind: PostKind;
  collections: string[];
}) {
  const router = useRouter();
  const [kind, setKind] = useState<PostKind>(initialKind);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [selection, setSelection] = useState<string[]>([]);
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [license, setLicense] = useState<License>("cc-by-4.0");
  const [chosenCollections, setChosenCollections] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  // Filled in from the checked files' top folder until the person edits it.
  const effectiveSlug = slugEdited
    ? slug
    : slugFrom(commonFolder(selection)) || slug;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const payload =
        kind === "template"
          ? {
              kind,
              title,
              body,
              slug: effectiveSlug,
              license,
              files: selection,
              collections: chosenCollections,
            }
          : { kind, title, body };
      const { postId } = await boardRequest<{ postId: string }>(
        "/api/board/posts",
        "POST",
        payload,
      );
      router.push(`/board/${postId}`);
      router.refresh();
    } catch (error: any) {
      toast.error(error.message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <fieldset>
        <legend className="mb-2 text-sm font-bold">종류</legend>
        <div className="grid grid-cols-2 border-2 border-border sm:grid-cols-4">
          {POST_KINDS.map((value) => (
            <label
              key={value}
              className={`flex h-12 cursor-pointer items-center justify-center gap-2 text-sm ${kind === value ? "bg-primary font-bold text-primary-foreground" : "text-muted-foreground hover:bg-accent"}`}
            >
              <input
                type="radio"
                name="kind"
                value={value}
                checked={kind === value}
                onChange={() => setKind(value)}
                className="sr-only"
              />
              {POST_KIND_LABELS[value]}
            </label>
          ))}
        </div>
        {kind === "site" && (
          <p className="mt-2 text-xs text-muted-foreground">
            내 사이트의 최신 스크린샷이 글에 붙어요.
          </p>
        )}
      </fieldset>

      <div className="space-y-2">
        <label htmlFor="post-title" className="text-sm font-bold">
          제목
        </label>
        <input
          id="post-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={MAX_TITLE_LENGTH}
          required
          className="h-12 w-full border border-border bg-background px-3 text-base"
        />
      </div>

      {kind === "template" && (
        <div className="space-y-6 border-2 border-border p-4">
          <FolderPicker value={selection} onChange={setSelection} />
          <p className="text-xs text-muted-foreground">
            게시하는 순간의 파일이 공유돼요. 나중에 원본을 고쳐도 게시한
            템플릿은 바뀌지 않고, 「새 버전 올리기」로 갱신할 수 있어요.
          </p>

          <div className="space-y-2">
            <label htmlFor="template-slug" className="text-sm font-bold">
              템플릿 이름
            </label>
            <input
              id="template-slug"
              value={effectiveSlug}
              onChange={(event) => {
                setSlug(event.target.value);
                setSlugEdited(true);
              }}
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              maxLength={64}
              required
              placeholder="retro-home"
              className="h-11 w-full border border-border bg-background px-3 text-sm"
            />
            <p className="text-xs text-muted-foreground">
              고른 파일의 최상위 폴더 이름으로 채워져요. 다른 사람이 새 폴더에
              적용할 때 기본 폴더 이름이 되고, 「내 아이디/이름」으로 표시돼요.
              영문 소문자, 숫자, 하이픈(-)만 쓸 수 있어요.
            </p>
          </div>

          <div>
            <div className="space-y-2">
              <label htmlFor="template-license" className="text-sm font-bold">
                라이선스
              </label>
              <select
                id="template-license"
                value={license}
                onChange={(event) => setLicense(event.target.value as License)}
                className="h-11 w-full border border-border bg-background px-3 text-sm"
              >
                {Object.entries(LICENSES).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {collections.length > 0 && (
            <fieldset className="space-y-2">
              <legend className="text-sm font-bold">
                함께 쓸 데이터베이스 컬렉션
              </legend>
              <p className="text-xs text-muted-foreground">
                고른 컬렉션은 적용하는 사람에게 같은 권한의 빈 컬렉션으로
                만들어져요. 내 데이터는 공유되지 않아요.
              </p>
              <div className="flex flex-wrap gap-2">
                {collections.map((name) => (
                  <label
                    key={name}
                    className="flex h-10 items-center gap-2 border border-border px-3 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={chosenCollections.includes(name)}
                      onChange={(event) =>
                        setChosenCollections((current) =>
                          event.target.checked
                            ? [...current, name]
                            : current.filter((c) => c !== name),
                        )
                      }
                      className="h-4 w-4 accent-primary"
                    />
                    <code>{name}</code>
                  </label>
                ))}
              </div>
            </fieldset>
          )}
        </div>
      )}

      <div className="space-y-2">
        <label htmlFor="post-body" className="text-sm font-bold">
          {kind === "template" ? "설명" : "본문"}
        </label>
        <textarea
          id="post-body"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          maxLength={MAX_POST_BODY_LENGTH}
          required={kind === "question" || kind === "chat"}
          rows={8}
          className="w-full resize-y border border-border bg-background px-3 py-2 text-sm leading-relaxed"
        />
        <p className="text-xs text-muted-foreground">
          빈 줄로 문단을 나눠요. 웹 주소는 링크가 돼요.
          {kind === "template" &&
            " 새 템플릿은 연합우주 팔로워에게도 알려져요."}
        </p>
      </div>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => router.back()}
          className="h-12 border border-border px-5 text-sm"
        >
          취소
        </button>
        <button
          type="submit"
          disabled={busy}
          className="h-12 bg-primary px-6 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {busy
            ? kind === "template"
              ? "파일을 복사하는 중…"
              : "올리는 중…"
            : "게시하기"}
        </button>
      </div>
    </form>
  );
}
