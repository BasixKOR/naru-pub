import "./load-env";

// Without this a missing DATABASE_URL does not fail: node-postgres quietly
// falls back to its own defaults (local socket, database named after the
// current user), so a migration aimed at a configured database can land in an
// unrelated one instead. Refuse to run without a URL.
if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set. Refusing to run against node-postgres defaults; " +
      "set it in control-plane/.env or in the environment.",
  );
}
