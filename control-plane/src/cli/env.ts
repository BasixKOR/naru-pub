// Next loads .env on its own, but a plain node or tsx script does not. Load
// the same file Next would. Variables already in the environment win, which in
// the containers is all of them: compose passes .env as env_file and there is
// no file to read, so a missing one is not an error.
try {
  process.loadEnvFile();
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

// Without a DATABASE_URL node-postgres does not fail: it quietly falls back to
// its own defaults (local socket, database named after the current user), so
// a migration aimed at a configured database can land in an unrelated one
// instead. Refuse to run without a URL.
if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set. Refusing to run against node-postgres defaults; " +
      "set it in control-plane/.env or in the environment.",
  );
}
