// Checks that each SDK file does what its hand-written declarations promise.
// Run `pnpm sdk:check`; `pnpm build` runs it first.
//
// naru.d.ts is the contract and naru.js the code, and nothing else ties them:
// TypeScript resolves an import of naru.js to the declarations beside it, so
// callers are checked against the promise, never against the code. Here the
// code is copied under another name, TypeScript infers its types from the
// JavaScript itself, and a small TypeScript file asks whether those fit.
import { copyFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const VERSIONS = ["1.0.0"];

// What it cannot see: the code's option parameters, which TypeScript infers
// from `{ signal } = {}` as an empty object, and server results, which are
// untyped JSON. So it catches a missing, renamed or extra method or export and
// a result missing a field; the unit tests cover how options are read.
//
// Everything the client exposes hangs off createNaru's return, so assigning
// the code's createNaru to the declared one compares the whole surface:
// collections, auth, the admin client, batch and upload. The exports must be
// the same set, so the code can neither drop a name nor grow an extra one.
const check = (declarations) => `
import * as code from "./naru.impl.js";
import type * as contract from ${JSON.stringify(declarations)};

export const createNaru: typeof contract.createNaru = code.createNaru;

type Declared = keyof typeof import(${JSON.stringify(declarations)});
type Implemented = keyof typeof code;
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
export const exportsMatch: Same<Declared, Implemented> = true;

export const error: Pick<contract.NaruError, "name" | "message" | "code"> =
  new code.NaruError("message", "CONFLICT");
`;

let failed = false;
for (const version of VERSIONS) {
  const directory = await mkdtemp(join(tmpdir(), "naru-sdk-check-"));
  try {
    const declarations = join(root, "public/sdk", version, "naru.d.ts");
    await copyFile(
      join(root, "public/sdk", version, "naru.js"),
      join(directory, "naru.impl.js"),
    );
    const checkFile = join(directory, "check.ts");
    await writeFile(checkFile, check(declarations.replace(/\.d\.ts$/, ".js")));
    const program = ts.createProgram([checkFile], {
      allowJs: true,
      // The code's own internals are not what is checked, only its surface.
      checkJs: false,
      strict: true,
      noEmit: true,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      lib: ["lib.es2022.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"],
    });
    const diagnostics = ts.getPreEmitDiagnostics(program);
    if (diagnostics.length) {
      failed = true;
      console.error(
        `naru.js ${version} does not match naru.d.ts:\n` +
          ts.formatDiagnosticsWithColorAndContext(diagnostics, {
            getCanonicalFileName: (name) => name,
            getCurrentDirectory: () => directory,
            getNewLine: () => "\n",
          }),
      );
    } else console.log(`sdk:check ${version}: naru.js matches naru.d.ts`);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
if (failed) process.exit(1);
