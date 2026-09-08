import { type Kysely, sql } from "kysely";

// `any` is required here since migrations should be frozen in time. alternatively, keep a "snapshot" db interface.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("github_deploy_targets")
    .addColumn("deploy_generation", "integer", (col) =>
      col.notNull().defaultTo(0),
    )
    .addColumn("github_repository_id", "text")
    .execute();
  await db.schema
    .alterTable("github_deployments")
    .addColumn("uploaded_paths", "jsonb", (col) =>
      col.notNull().defaultTo(sql`'[]'::jsonb`),
    )
    .addColumn("deploy_generation", "integer", (col) =>
      col.notNull().defaultTo(0),
    )
    .addColumn("github_repository_id", "text")
    .execute();
}

// `any` is required here since migrations should be frozen in time. alternatively, keep a "snapshot" db interface.
export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("github_deployments")
    .dropColumn("github_repository_id")
    .dropColumn("deploy_generation")
    .dropColumn("uploaded_paths")
    .execute();
  await db.schema
    .alterTable("github_deploy_targets")
    .dropColumn("github_repository_id")
    .dropColumn("deploy_generation")
    .execute();
}
