import type { Metadata } from "next";
import type { ReactNode } from "react";
import Code from "../Code";
import DocsNav from "../DocsNav";

export const metadata: Metadata = {
  title: "데이터베이스 사용 안내 | 나루",
  description:
    "나루 제어판과 웹 SDK로 블로그, 방명록, 관리자 글쓰기를 만드는 방법",
};

const sections = [
  ["start", "01 · 빠른 시작"],
  ["collections", "02 · 컬렉션과 공개 범위"],
  ["owner", "03 · 관리자 로그인"],
  ["write", "04 · 글 수정과 충돌 처리"],
  ["read", "05 · 목록과 페이지 나누기"],
  ["recipes", "06 · 사용 예"],
  ["errors", "07 · 한도와 오류"],
];

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-8 space-y-5 border-t pt-8">
      <h2 className="text-xl font-bold">{title}</h2>
      {children}
    </section>
  );
}

function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b">
            {head.map((cell) => (
              <th key={cell} className="p-3">
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="border-b">
              {row.map((cell, column) => (
                <td key={column} className="p-3">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function DatabaseDocs() {
  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-6xl px-5 py-12 md:px-8">
        <DocsNav current="database" />
        <header className="mb-12 max-w-3xl space-y-5">
          <p className="text-sm text-muted-foreground">
            NARU / DOCS / DATABASE / SDK 1.0.0
          </p>
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
            정적 웹사이트에 데이터를 더하세요.
          </h1>
          <p className="text-lg leading-8 text-muted-foreground">
            별도 서버 없이 글을 공개하고, 방문자의 인사를 받고, 내 웹사이트에서
            글을 작성하세요.
          </p>
          <div className="flex flex-wrap gap-5 text-sm underline underline-offset-4">
            <a href="/database">데이터베이스 제어판 열기 →</a>
            <a href="/docs/database/blog.zip">예제 블로그 ZIP 내려받기 ↓</a>
            <a href="/docs/sdk/1.0.0">SDK 레퍼런스 →</a>
          </div>
        </header>
        <div className="grid gap-10 lg:grid-cols-[230px_minmax(0,1fr)]">
          <nav
            aria-label="문서 목차"
            className="self-start rounded-lg border p-5 lg:sticky lg:top-8"
          >
            <p className="mb-4 font-bold">이 페이지에서</p>
            <ul className="space-y-3 text-sm">
              {sections.map(([id, label]) => (
                <li key={id}>
                  <a
                    className="underline-offset-4 hover:underline"
                    href={`#${id}`}
                  >
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <article className="min-w-0 space-y-12 leading-8 [&_a]:underline [&_a]:underline-offset-4">
            <Section id="start" title="01 · 빠른 시작">
              <p>
                <a href="/database">제어판</a>에서 <code>posts</code> 컬렉션을
                만들고 읽기를 공개로 바꾸세요. 제목(title)이 있는 문서를 하나
                저장한 뒤 페이지에 아래 코드를 넣으세요. 빌드 도구도 API 키도
                필요 없습니다.
              </p>
              <Code language="html">{`<ul id="posts"></ul>
<script type="module">
  import { createNaru } from "https://naru.pub/sdk/1/naru.js";

  const naru = createNaru();
  const { documents } = await naru.collection("posts").list();
  for (const post of documents) {
    const item = document.createElement("li");
    item.textContent = post.data.title;
    document.querySelector("#posts").append(item);
  }
</script>`}</Code>
              <p>
                <code>내-로그인-이름.naru.pub</code>에서는 사이트를 주소로
                알아냅니다. 연결한 도메인에서는{" "}
                <code>createNaru({'{ site: "내-로그인-이름" }'})</code>처럼
                로그인 이름을 넘기세요. <code>/sdk/1/</code>은 호환되는 최신
                1.x를 가리키므로 수정 사항을 저절로 받습니다. 1.0.0은 아직
                고치는 중이라 고정할 만한 판이 없으니 <code>/sdk/1/</code>을
                쓰세요. <a href="/sdk/1/naru.d.ts">TypeScript 타입 정의</a>
                도 있습니다.
              </p>
              <h3 className="font-bold">방명록에 인사 남기기</h3>
              <p>
                제어판에서 <code>guestbook</code> 컬렉션을 만들고 읽기는
                ‘누구나’, 쓰기는 ‘누구나 생성만’으로 설정하세요. 버튼을 누를 때
                저장하도록 연결합니다.
              </p>
              <Code language="html">{`<button id="hello">인사 남기기</button>
<p id="result"></p>
<script type="module">
  import { createNaru } from "https://naru.pub/sdk/1/naru.js";
  const naru = createNaru();
  const button = document.querySelector("#hello");
  const result = document.querySelector("#result");
  button.onclick = async () => {
    button.disabled = true;
    try {
      const saved = await naru.collection("guestbook").add({
        name: "방문자", message: "안녕하세요!",
      });
      result.textContent = saved.data.message + " 저장됨";
    } catch (error) {
      result.textContent = "결과를 확인하지 못했습니다. 방명록을 확인하세요.";
      console.error(error);
    }
  };
</script>`}</Code>
              <p>
                <code>naru.collection()</code>은 언제나 방문자 권한입니다.
                관리자 로그인 뒤에도 바뀌지 않습니다. 글을 고칠 때는 다음 단계의{" "}
                <code>owner.collection()</code>을 씁니다.
              </p>
            </Section>

            <Section id="collections" title="02 · 컬렉션과 공개 범위">
              <p>
                <strong>컬렉션</strong>은 문서를 모으는 곳이고,{" "}
                <strong>문서</strong>는 ID 하나와 JSON 데이터 하나입니다.
                컬렉션을 만들고 지우거나 공개 범위를 바꾸는 일은 제어판에서
                합니다. 이름과 문서 ID는 영문·숫자·<code>_</code>·<code>-</code>{" "}
                1~64자이고, <code>_</code>로 시작하는 컬렉션 이름은 나루가
                쓰므로 만들 수 없습니다.
              </p>
              <p>
                읽기와 쓰기 범위는 따로 정합니다. 새 컬렉션은 둘 다
                ‘관리자만’입니다.
              </p>
              <Table
                head={["", "설정", "방문자가 할 수 있는 일"]}
                rows={[
                  ["읽기", "관리자만", "방문자는 읽을 수 없습니다."],
                  [
                    "읽기",
                    "누구나",
                    <>
                      <code>get</code>·<code>list</code>로 누구나 읽습니다.
                    </>,
                  ],
                  ["쓰기", "관리자만", "방문자는 쓸 수 없습니다."],
                  [
                    "쓰기",
                    "누구나 생성만",
                    <>
                      <code>add</code>로 새 문서만 만듭니다. 방명록에
                      알맞습니다.
                    </>,
                  ],
                  [
                    "쓰기",
                    "누구나 생성·덮어쓰기·삭제",
                    "누구나 모든 문서를 바꾸고 지울 수 있습니다. 대부분은 필요 없습니다.",
                  ],
                ]}
              />
              <p>
                관리자는 <a href="#owner">로그인</a>하면 등록한 컬렉션을 공개
                범위와 상관없이 읽고 쓸 수 있습니다. 공개 읽기 컬렉션의 문서는
                필드를 화면에서 숨겨도 누구나 읽을 수 있으니, 비공개로 둘
                데이터는 ‘관리자만’ 읽는 컬렉션에 따로 저장하세요.
              </p>
            </Section>

            <Section id="owner" title="03 · 관리자 로그인">
              <p>
                사이트에 비밀번호나 API 키를 넣지 않습니다. 방문자가 아닌
                소유자가 나루에서 로그인하고 승인하면 페이지가 관리자 권한을
                받습니다.
              </p>
              <ol className="list-decimal space-y-3 pl-6">
                <li>
                  제어판의 ‘웹사이트 관리자 로그인’에 관리자 페이지 주소(예:{" "}
                  <code>https://내사이트.naru.pub/admin.html</code>)와 쓸
                  컬렉션을 등록합니다.
                </li>
                <li>
                  그 페이지에서 <code>naru.auth.signIn()</code>으로 로그인하고{" "}
                  <code>naru.auth.session()</code>으로 관리자 클라이언트를
                  받습니다. 로그인 전이면 <code>null</code>입니다.
                </li>
              </ol>
              <Code language="html">{`<button id="login">관리자 로그인</button>
<p id="auth-status"></p>
<script type="module">
  import { createNaru } from "https://naru.pub/sdk/1/naru.js";
  const naru = createNaru();
  const owner = await naru.auth.session();
  const login = document.querySelector("#login");
  login.hidden = !!owner;
  document.querySelector("#auth-status").textContent =
    owner ? "로그인되었습니다." : "글을 고치려면 로그인하세요.";
  login.onclick = () => naru.auth.signIn({ collections: ["posts", "drafts"] });
  // 다음 예제의 owner는 이 스크립트 안에서 사용하세요.
</script>`}</Code>
              <p>
                사용 중인 권한은 자동으로 연장되며, 오래 사용하지 않거나 최대
                사용 기간에 이르면 만료됩니다. 제어판에서 페이지마다 사용 기간을
                줄이거나 취소할 수 있습니다. 만료되면 요청이{" "}
                <code>AUTH_REQUIRED</code>로 실패하니 다시 로그인하세요. 관리자
                페이지에는 신뢰하는 스크립트만 넣으세요. 로그인은 현재 페이지를
                떠났다가 돌아옵니다. 쓰던 내용은 로그인 전에 sessionStorage 등에
                보관하고 돌아온 뒤 복원하세요. 예제 블로그에 구현되어 있습니다.
              </p>
            </Section>

            <Section id="write" title="04 · 글 수정과 충돌 처리">
              <Table
                head={["호출", "동작"]}
                rows={[
                  [<code key="c">add(data)</code>, "새 ID로 문서를 만듭니다."],
                  [
                    <code key="c">set(id, data, {"{ condition }"})</code>,
                    "그 ID의 문서를 만들거나 통째로 바꿉니다. 필드를 합치지 않습니다.",
                  ],
                  [
                    <code key="c">delete(id, {"{ condition }"})</code>,
                    "문서를 지웁니다. 없는 문서를 지워도 성공합니다.",
                  ],
                ]}
              />
              <p>
                방문자는 <code>naru</code>으로 <code>add</code>만 할 수 있고,{" "}
                <code>set</code>과 <code>delete</code>는{" "}
                <a href="#owner">관리자 로그인</a> 후 <code>owner</code>로
                부릅니다. 쓰기는{" "}
                <code>{"{ id, data, revision, createdAt, updatedAt }"}</code>를
                돌려줍니다. 저장된 데이터까지 포함하므로 읽기와 같은 모양입니다.
              </p>
              <p>
                <code>condition</code>으로 덮어쓰기를 막을 수 있습니다.{" "}
                <code>{"{ revision }"}</code>은 읽은 뒤 바뀌지 않았을 때만,{" "}
                <code>{"{ absent: true }"}</code>는 아직 없는 문서일 때만
                저장하고, 아니면 <code>CONFLICT</code>로 실패합니다.
              </p>
              <Code>{`const post = await owner.collection("posts").get("hello");
try {
  await owner.collection("posts").set(
    "hello",
    { ...post.data, title: "새 제목" },
    { condition: { revision: post.revision } },
  );
} catch (error) {
  if (error.code !== "CONFLICT") throw error;
  alert("다른 곳에서 먼저 저장했습니다. 새로고침 후 다시 시도하세요.");
}`}</Code>
              <p>
                데이터에는 JSON 값만 넣으세요. undefined, 함수, Date, 순환 참조
                등은 TypeError로 거절합니다. 날짜는 문자열로 바꾸세요. 나루는
                필드의 의미나 앱의 양식까지 검사하지 않습니다.
              </p>
              <h3 className="font-bold">여러 변경을 함께 저장하기</h3>
              <p>
                <code>owner.batch()</code>은 여러 컬렉션의 <code>set</code>·
                <code>delete</code>를 최대 100개까지 묶어, 모두 반영하거나
                하나도 반영하지 않습니다. 각 변경의 condition도 함께 검사합니다.
                미리 읽은 값이 저절로 보호되는 것은 아니므로 고치는 문서의
                revision을 넘기세요.
              </p>
              <Code>{`await owner.batch([
  { collection: "posts", set: { id, data: post, condition: { absent: true } } },
  { collection: "drafts", delete: { id, condition: { revision: draft.revision } } },
]);`}</Code>
            </Section>

            <Section id="read" title="05 · 목록과 페이지 나누기">
              <Code>{`const posts = naru.collection("posts");

const post = await posts.get("hello");
// → { id, data, revision, createdAt, updatedAt }

const query = {
  filter: { category: "일상", date: { gte: "2026-09-01" } },
  sort: [["date", "desc"]],
};
const page = await posts.list({ ...query, size: 20 });
// → { documents, nextCursor }

if (page.nextCursor) {
  const next = await posts.list({ ...query, size: 20, after: page.nextCursor });
  console.log(next.documents);
}`}</Code>
              <ul className="list-disc space-y-3 pl-6">
                <li>
                  <strong>filter</strong>: 최상위 필드를 값으로 비교하거나{" "}
                  <code>{"{ gt, gte, lt, lte }"}</code>로 범위를 찾습니다.
                  조건은 모두 만족해야 하며(AND) 최대 5개입니다. 날짜는{" "}
                  <code>&quot;2026-09-01&quot;</code>처럼 자리를 채운 문자열로
                  저장하면 범위로 찾을 수 있습니다.
                </li>
                <li>
                  <strong>sort</strong>: <code>[필드, 방향]</code>을 한두 개
                  넘깁니다. 생성·수정 시각은{" "}
                  <code>{'{ metadata: "createdAt" }'}</code>처럼 씁니다. 기본은
                  ID 오름차순입니다. 같은 날짜에서 최신 글을 먼저 보려면
                  <code>
                    {'[["date", "desc"], [{ metadata: "createdAt" }, "desc"]]'}
                  </code>
                  처럼 두 키를 씁니다. 문자열은 언어별 정렬 없이 유니코드
                  순서로, 숫자는 크기로 비교합니다. 오름차순에서 없는
                  값·null·배열·객체, 문자열, 숫자, 불리언 순입니다.
                </li>
                <li>
                  <strong>size</strong>: 한 번에 기본 50개, 최대 100개입니다.
                  다음 페이지는 같은 filter·sort에 <code>nextCursor</code>를{" "}
                  <code>after</code>로 넘기고, <code>nextCursor</code>가{" "}
                  <code>null</code>이면 끝입니다.{" "}
                  <code>includeTotal: true</code>면 전체 개수도 받습니다.
                </li>
              </ul>
            </Section>

            <Section id="recipes" title="06 · 사용 예">
              <div className="grid gap-4 md:grid-cols-2">
                {[
                  {
                    title: "블로그 글 공개",
                    setup: "posts · 읽기 누구나 / 쓰기 관리자만",
                    code: `naru
  .collection("posts")
  .list({
    sort: [["date", "desc"]],
  });`,
                  },
                  {
                    title: "방명록",
                    setup: "guestbook · 읽기 누구나 / 쓰기 누구나 생성만",
                    code: `naru.collection("guestbook")
  .add({ name, message });`,
                  },
                  {
                    title: "비공개 문의 받기",
                    setup: "inquiries · 읽기 관리자만 / 쓰기 누구나 생성만",
                    code: `naru.collection("inquiries")
  .add({ email, message });`,
                  },
                  {
                    title: "초안 저장 후 공개",
                    setup: "drafts · 읽기 관리자만 / 쓰기 관리자만",
                    code: `owner.batch([
  { collection: "posts",
    set: { id, data, condition: { absent: true } } },
  { collection: "drafts",
    delete: { id, condition: { revision: draft.revision } } },
]);`,
                  },
                  {
                    title: "글에 이미지 붙이기",
                    setup: (
                      <>
                        <a href="/docs/media">미디어 라이브러리</a> · 관리자
                        업로드
                      </>
                    ),
                    code: `const image =
  await owner.media.upload(file);
const posts = owner.collection("posts");
const post = await posts.get(id);
await posts.set(id, { ...post.data, cover: image.url },
  { condition: { revision: post.revision } });`,
                  },
                  {
                    title: "특정 글의 댓글",
                    setup: "comments · 읽기 누구나 / 쓰기 누구나 생성만",
                    code: `naru
  .collection("comments")
  .list({
    filter: { postId: "hello" },
  });`,
                  },
                ].map((recipe) => (
                  <section
                    key={recipe.title}
                    className="min-w-0 space-y-3 rounded-lg border p-5"
                  >
                    <h3 className="font-bold">{recipe.title}</h3>
                    <p className="text-sm text-muted-foreground">
                      {recipe.setup}
                    </p>
                    <pre className="overflow-x-auto rounded bg-muted px-3 py-2 text-xs leading-5">
                      <code>{recipe.code}</code>
                    </pre>
                  </section>
                ))}
              </div>
              <h3 className="font-bold">예제 블로그 ‘작은 기록’</h3>
              <p>
                글 목록·상세·방명록·관리자 편집·비공개 초안을 갖춘 정적
                사이트입니다. <a href="/docs/database/blog.zip">ZIP 내려받기</a>{" "}
                ·{" "}
                <a href="https://example.naru.pub/blog/">실제 사이트 보기 ↗</a>
              </p>
              <ol className="list-decimal space-y-3 pl-6">
                <li>
                  제어판에서 <code>posts</code>, <code>guestbook</code>,{" "}
                  <code>drafts</code> 컬렉션을 위 설정대로 만듭니다.
                </li>
                <li>
                  ‘웹사이트 관리자 로그인’에 올릴 위치의 <code>admin/</code>{" "}
                  주소와 <code>posts</code>·<code>drafts</code>를 등록합니다.
                </li>
                <li>
                  연결한 도메인에 올린다면 <code>config.js</code>의{" "}
                  <code>site</code>에 로그인 이름을 적습니다.
                </li>
                <li>
                  파일을 새 폴더에 올리고 <code>index.html</code>을 열어 글을 써
                  봅니다.
                </li>
              </ol>
            </Section>

            <Section id="errors" title="07 · 한도와 오류">
              <ul className="list-disc space-y-3 pl-6">
                <li>
                  사이트당 컬렉션 100개, 문서 10,000개, 데이터 10 MiB. 요청
                  하나는 64 KiB까지입니다.
                </li>
                <li>
                  방문자의 <code>add</code>는 분당 횟수가 제한됩니다.
                </li>
                <li>관리자 로그인 페이지는 사이트당 20개까지 등록합니다.</li>
              </ul>
              <p>
                실패하면 <code>NaruError</code>를 던집니다. <code>code</code>로
                구분하세요.
              </p>
              <Table
                head={["code", "뜻"]}
                rows={[
                  ["NOT_FOUND", "문서, 컬렉션 또는 사이트가 없습니다."],
                  [
                    "ACCESS_DENIED",
                    "공개 범위나 등록된 컬렉션이 허용하지 않습니다.",
                  ],
                  [
                    "AUTH_REQUIRED",
                    "관리자 권한이 만료되었습니다. 다시 로그인하세요.",
                  ],
                  ["CONFLICT", "condition이 맞지 않습니다."],
                  [
                    "QUOTA_EXCEEDED",
                    "데이터나 미디어 저장 공간이 가득 찼습니다.",
                  ],
                  [
                    "RATE_LIMITED",
                    "요청이 너무 많습니다. 잠시 후 다시 시도하세요.",
                  ],
                  [
                    "INVALID_REQUEST",
                    "이름, 필터, 크기 등 요청 형식이 잘못되었습니다.",
                  ],
                  ["UNAVAILABLE", "일시적인 오류입니다."],
                ].map(([code, meaning]) => [
                  <code key="c">{code}</code>,
                  meaning,
                ])}
              />
              <Code>{`try {
  await naru.collection("guestbook").add({ message });
} catch (error) {
  status.textContent =
    error.code === "RATE_LIMITED" ? "잠시 후 다시 시도하세요." : error.message;
}`}</Code>
              <p>
                SDK는 자동으로 다시 시도하지 않습니다. 응답을 받지 못한 쓰기도
                저장되었을 수 있으니, <code>add</code>를 다시 부르기 전에
                확인하세요. 방문자가 넣은 문자열은 <code>textContent</code>로
                표시하세요.
              </p>
            </Section>
          </article>
        </div>
      </div>
    </div>
  );
}
