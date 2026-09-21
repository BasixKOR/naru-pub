import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Code from "../../Code";
import DocsNav from "../../DocsNav";
import { highlight } from "../../highlight";
import styles from "../../Code.module.css";
import {
  type Block,
  type Entry,
  isVersion,
  type Member,
  REFERENCES,
  type Span,
  type Version,
} from "./reference";

const KIND_LABELS: Record<Entry["kind"], string> = {
  function: "함수",
  interface: "인터페이스",
  class: "클래스",
  type: "타입",
  variable: "상수",
};

export function generateStaticParams() {
  return Object.keys(REFERENCES).map((version) => ({ version }));
}

export async function generateMetadata(props: {
  params: Promise<{ version: string }>;
}): Promise<Metadata> {
  const { version } = await props.params;
  if (!isVersion(version)) return {};
  return {
    title: `SDK ${version} 레퍼런스 | 나루`,
    description: `나루 데이터 SDK ${version}가 내보내는 모든 타입과 함수`,
  };
}

/* --------------------------------------------------------------- prose --- */

function Spans({ spans }: { spans: Span[] }) {
  return (
    <>
      {spans.map((span, index) => {
        if (span.type === "code")
          return (
            <code key={index} className="text-[0.9em]">
              {span.value}
            </code>
          );
        if (span.type === "link")
          return (
            <a key={index} href={`#${span.target}`}>
              <code className="text-[0.9em]">{span.value}</code>
            </a>
          );
        return <span key={index}>{span.value}</span>;
      })}
    </>
  );
}

function Prose({ blocks }: { blocks: Block[] }) {
  return (
    <>
      {blocks.map((block, index) =>
        block.type === "code" ? (
          <Code key={index} language="javascript">
            {block.code}
          </Code>
        ) : (
          <p key={index}>
            <Spans spans={block.spans} />
          </p>
        ),
      )}
    </>
  );
}

/** A declaration, highlighted but without the framing a full example needs. */
function Signature({ children }: { children: string }) {
  return (
    <pre
      className={`${styles.block} min-w-0 overflow-x-auto rounded-lg border p-4 text-sm leading-7 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring`}
      tabIndex={0}
    >
      <code
        className="language-typescript"
        dangerouslySetInnerHTML={{ __html: highlight(children, "typescript") }}
      />
    </pre>
  );
}

function Throws({ throws }: { throws: Block[][] }) {
  if (!throws.length) return null;
  return (
    <div className="space-y-2 border-l-2 pl-4">
      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
        오류
      </p>
      {throws.map((blocks, index) => (
        <div key={index} className="text-sm">
          <Prose blocks={blocks} />
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------ sections --- */

function MemberRow({ member }: { member: Member }) {
  return (
    <li className="space-y-3 border-t pt-5 first:border-t-0 first:pt-0">
      <Signature>{member.signature}</Signature>
      {member.summary.length > 0 && (
        <div className="space-y-4">
          <Prose blocks={member.summary} />
        </div>
      )}
      <Throws throws={member.throws} />
    </li>
  );
}

function EntrySection({ entry }: { entry: Entry }) {
  return (
    <section id={entry.name} className="scroll-mt-8 space-y-5 border-t pt-8">
      <div className="flex flex-wrap items-baseline gap-3">
        <h2 className="text-xl font-bold">{entry.name}</h2>
        <span className="border px-2 py-1 text-xs text-muted-foreground">
          {KIND_LABELS[entry.kind]}
        </span>
      </div>
      <Signature>{entry.signature}</Signature>
      {entry.summary.length > 0 && (
        <div className="space-y-4">
          <Prose blocks={entry.summary} />
        </div>
      )}
      <Throws throws={entry.throws} />
      {entry.parameters?.some((parameter) => parameter.summary.length > 0) && (
        <ul className="space-y-4">
          {entry.parameters.map((parameter) => (
            <li key={parameter.name} className="space-y-2">
              <code className="text-[0.9em] font-bold">{parameter.name}</code>
              <Prose blocks={parameter.summary} />
            </li>
          ))}
        </ul>
      )}
      {entry.members && entry.members.length > 0 && (
        <ul className="space-y-5">
          {entry.members.map((member) => (
            <MemberRow key={member.name} member={member} />
          ))}
        </ul>
      )}
    </section>
  );
}

/* ----------------------------------------------------------------- page --- */

export default async function SdkReference(props: {
  params: Promise<{ version: string }>;
}) {
  const { version } = await props.params;
  if (!isVersion(version)) notFound();
  const entries = REFERENCES[version as Version].entries as Entry[];
  const groups = (
    ["function", "interface", "class", "type", "variable"] as const
  )
    .map((kind) => ({
      kind,
      entries: entries.filter((entry) => entry.kind === kind),
    }))
    .filter((group) => group.entries.length > 0);

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-6xl px-5 py-12 md:px-8">
        <DocsNav current="sdk" />
        <header className="mb-12 max-w-3xl space-y-5">
          <p className="text-sm text-muted-foreground">
            NARU / DOCS / SDK {version} / REFERENCE
          </p>
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
            SDK 레퍼런스
          </h1>
          <p className="text-lg leading-8 text-muted-foreground">
            <code>naru-data.js</code>가 내보내는 모든 함수와 타입입니다.
          </p>
          <div className="flex flex-wrap gap-5 text-sm underline underline-offset-4">
            <a href="/docs/database">데이터베이스 사용 안내 →</a>
            <a href={`/sdk/${version}/naru-data.js`}>naru-data.js 보기 ↗</a>
            <a href={`/sdk/${version}/naru-data.d.ts`}>naru-data.d.ts 보기 ↗</a>
          </div>
        </header>

        <section
          aria-labelledby="contract-title"
          className="mb-12 rounded-xl border bg-muted/30 p-6 md:p-8"
        >
          <div className="max-w-3xl">
            <p className="text-sm font-bold text-muted-foreground">SDK 계약</p>
            <h2 id="contract-title" className="mt-2 text-xl font-bold">
              앱은 의미에 의존하고, 전송 방식에는 의존하지 않습니다.
            </h2>
            <p className="mt-3 leading-7 text-muted-foreground">
              공개 작업과 소유자 작업은 별도 권한입니다. 커서와 revision은
              해석하지 않고 그대로 돌려주며, 오류 처리는 HTTP 상태 대신 안정적인
              <code className="mx-1">NaruError.code</code>를 사용하세요.
            </p>
          </div>
          <dl className="mt-6 grid gap-4 text-sm md:grid-cols-2 lg:grid-cols-4">
            {[
              ["공개", "get · list · add"],
              ["소유자", "set · delete · transaction"],
              ["미디어", "upload"],
              ["취소", "모든 네트워크 작업에 AbortSignal"],
            ].map(([term, description]) => (
              <div key={term} className="rounded-lg border bg-background p-4">
                <dt className="font-bold">{term}</dt>
                <dd className="mt-1 text-muted-foreground">{description}</dd>
              </div>
            ))}
          </dl>
        </section>

        <div className="grid gap-10 lg:grid-cols-[230px_minmax(0,1fr)]">
          <nav
            aria-label="문서 목차"
            className="self-start rounded-lg border p-5 lg:sticky lg:top-8 lg:max-h-[calc(100vh-4rem)] lg:overflow-y-auto"
          >
            <p className="mb-4 font-bold">이 페이지에서</p>
            <div className="space-y-4">
              {groups.map((group) => (
                <div key={group.kind}>
                  <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
                    {KIND_LABELS[group.kind]}
                  </p>
                  <ul className="space-y-2 text-sm">
                    {group.entries.map((entry) => (
                      <li key={entry.name}>
                        <a
                          className="underline-offset-4 hover:underline"
                          href={`#${entry.name}`}
                        >
                          <code>{entry.name}</code>
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </nav>

          <article className="min-w-0 space-y-12 leading-8 [&_a]:underline [&_a]:underline-offset-4">
            {entries.map((entry) => (
              <EntrySection key={entry.name} entry={entry} />
            ))}
          </article>
        </div>
      </div>
    </div>
  );
}
