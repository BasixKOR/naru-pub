// Compiles src/cli and src/migrations to dist/ for the jobs image, which runs
// them with plain node instead of tsx: tsx transpiles every module on every
// start, which costs each cron job and the long-running cron and worker
// processes about 60MB and 0.2s. Locally, `pnpm <script>` still uses tsx.
//
// Each CLI is one bundle of our own code. Runtime dependencies stay imports,
// resolved from the image's production node_modules; anything else a CLI
// imports, such as dotenv, is a devDependency and is bundled in, because the
// image does not install those.
//
// Output is ESM (.mjs) because several dependencies are ESM-only. The banner
// gives it what CommonJS code expects: require for the bundled CommonJS
// packages, and __dirname, through which migrate.ts finds the migrations,
// compiled beside it at the same relative path.
import { build } from "esbuild";
import { readFile, readdir, rm } from "node:fs/promises";

const root = new URL("..", import.meta.url).pathname;
process.chdir(root);

const { dependencies } = JSON.parse(await readFile("package.json", "utf8"));
const external = Object.keys(dependencies).flatMap((name) => [
  name,
  `${name}/*`,
]);

const sources = async (directory, pattern) =>
  (await readdir(directory))
    .filter((file) => pattern.test(file))
    .map((file) => `${directory}/${file}`);

const common = {
  platform: "node",
  format: "esm",
  target: "node24",
  outExtension: { ".js": ".mjs" },
  tsconfig: "tsconfig.json",
  logLevel: "warning",
  banner: {
    js: [
      'import { fileURLToPath as __naruFileURLToPath } from "node:url";',
      'import { dirname as __naruDirname } from "node:path";',
      'import { createRequire as __naruCreateRequire } from "node:module";',
      "const require = __naruCreateRequire(import.meta.url);",
      "const __filename = __naruFileURLToPath(import.meta.url);",
      "const __dirname = __naruDirname(__filename);",
    ].join("\n"),
  },
};

await rm("dist", { recursive: true, force: true });

await build({
  ...common,
  // env.ts is imported by the others, not run on its own.
  entryPoints: await sources("src/cli", /^(?!env\.)[^.]+\.tsx?$/),
  outdir: "dist/cli",
  bundle: true,
  external,
  sourcemap: true,
});

await build({
  ...common,
  entryPoints: await sources("src/migrations", /\.ts$/),
  outdir: "dist/migrations",
  bundle: true,
  external,
});
