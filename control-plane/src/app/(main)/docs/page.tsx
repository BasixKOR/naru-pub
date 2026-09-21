import type { Metadata } from "next";
import DocsNav from "./DocsNav";

export const metadata: Metadata = {
  title: "길잡이 | 나루",
  description: "나루의 데이터베이스와 미디어 라이브러리를 쓰는 방법",
};

const guides = [
  {
    href: "/docs/database",
    title: "데이터베이스",
    summary:
      "사이트별 JSON 문서 저장소입니다. 컬렉션과 공개 범위를 정하고, 웹 SDK로 글과 방명록을 읽고 씁니다.",
    topics: [
      "컬렉션과 문서",
      "공개 범위",
      "웹 SDK",
      "관리자 로그인",
      "예제 블로그",
    ],
  },
  {
    href: "/docs/sdk/1.0.0",
    title: "SDK 레퍼런스",
    summary:
      "웹 SDK가 내보내는 모든 함수와 타입입니다. 컬렉션 읽고 쓰기, 관리자 로그인, 파일 업로드까지 한자리에서 찾아보세요.",
    topics: ["createNaru", "collection", "Owner", "오류 코드"],
  },
  {
    href: "/docs/media",
    title: "미디어 라이브러리",
    summary:
      "사이트가 올린 이미지와 파일을 보관합니다. 관리자 세션으로 브라우저에서 바로 올리고, 문서에는 그 URL을 저장합니다.",
    topics: ["업로드", "메타데이터", "한도와 형식", "정리와 삭제"],
  },
];

export default function DocsIndex() {
  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-6xl px-5 py-12 md:px-8">
        <DocsNav current="home" />
        <header className="mb-12 max-w-3xl space-y-5">
          <p className="text-sm text-muted-foreground">NARU / DOCS</p>
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
            길잡이
          </h1>
          <p className="text-lg leading-8 text-muted-foreground">
            정적 웹사이트에 데이터와 파일을 더하는 방법을 안내합니다. 별도 서버
            없이 나루 제어판과 웹 SDK만으로 만들 수 있습니다.
          </p>
        </header>

        <section className="mb-10 rounded-xl border bg-muted/30 p-6 md:p-8">
          <p className="text-sm font-bold text-muted-foreground">처음이라면</p>
          <ol className="mt-4 grid gap-5 md:grid-cols-3">
            {[
              [
                "1",
                "컬렉션 만들기",
                "데이터베이스 제어판에서 문서를 담을 컬렉션과 공개 범위를 정합니다.",
              ],
              [
                "2",
                "SDK 연결하기",
                "버전이 고정된 모듈을 불러와 공개 읽기나 관리자 쓰기를 연결합니다.",
              ],
              [
                "3",
                "실제 권한으로 확인하기",
                "로그아웃 상태의 공개 화면과 로그인한 관리자 화면을 각각 시험합니다.",
              ],
            ].map(([number, title, body]) => (
              <li key={number} className="flex gap-4">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-foreground text-sm font-bold text-background">
                  {number}
                </span>
                <div>
                  <h2 className="font-bold">{title}</h2>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {body}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <div className="grid gap-6 md:grid-cols-2">
          {guides.map((guide) => (
            <a
              key={guide.href}
              href={guide.href}
              className="group block rounded-lg border p-6 transition-colors hover:border-primary hover:bg-primary/5"
            >
              <h2 className="text-xl font-bold group-hover:text-primary">
                {guide.title} →
              </h2>
              <p className="mt-3 leading-7 text-muted-foreground">
                {guide.summary}
              </p>
              <ul className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
                {guide.topics.map((topic) => (
                  <li key={topic} className="border px-2 py-1">
                    {topic}
                  </li>
                ))}
              </ul>
            </a>
          ))}
        </div>

        <div className="mt-10 flex flex-wrap gap-5 text-sm underline underline-offset-4">
          <a href="/database">데이터베이스 제어판 열기 →</a>
          <a href="/media">미디어 라이브러리 열기 →</a>
          <a href="/docs/database/blog.zip">예제 블로그 ZIP 내려받기 ↓</a>
        </div>
      </div>
    </div>
  );
}
