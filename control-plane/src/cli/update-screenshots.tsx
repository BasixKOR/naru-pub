import { parseArgs } from "node:util";
import { sql } from "kysely";
import { db } from "@/lib/database";
import { dispatchActorUpdate } from "@/lib/federation";
import { s3Client } from "@/lib/s3";
import { templatePreviewKey } from "@/lib/board/preview";
import {
  getHomepageUrl,
  getPublicAssetUrl,
  getRenderedSiteUrl,
} from "@/lib/site-urls";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { Browser, chromium } from "playwright";

// Usage:
//   pnpm exec tsx src/cli/update-screenshots.tsx
//     → render all discoverable users whose site was updated after the last
//       render (the cron path)
//   pnpm exec tsx src/cli/update-screenshots.tsx --user <login_name>
//     → render a single user, still gated by the same predicate
//   pnpm exec tsx src/cli/update-screenshots.tsx --force
//     → render every discoverable user, ignoring the predicate
//   pnpm exec tsx src/cli/update-screenshots.tsx --user <login_name> --force
//     → render that user, ignoring the predicate
//   pnpm exec tsx src/cli/update-screenshots.tsx --concurrency 8
//     → override the default parallel-render worker count (default: 2)

// Each render holds an arbitrary user site open for ten seconds at 2x scale in
// its own renderer, and this runs on the host every other service shares. Six
// at once took the cron container from 64MB to 1.85GB. A run is normally a
// handful of sites; anything the timeout cuts off is picked up next time.
const DEFAULT_CONCURRENCY = 2;

type TargetUser = { id: number; login_name: string };

// Board templates waiting for a preview. The preview is the author's folder as
// published, rendered from their live site: at publish time it is the same
// content. A render that keeps failing stops being retried after a day.
const TEMPLATE_PREVIEW_WINDOW = sql<Date>`now() - interval '1 day'`;
const TEMPLATE_PREVIEWS_PER_RUN = 10;

type TargetTemplate = {
  version_id: string;
  template_id: string;
  version: number;
  source_path: string;
  login_name: string;
};

async function selectTemplateTargets(): Promise<TargetTemplate[]> {
  return await db
    .selectFrom("board_template_versions as v")
    .innerJoin("board_templates as t", "t.id", "v.template_id")
    .innerJoin("board_posts as p", "p.id", "t.post_id")
    .innerJoin("users as u", "u.id", "t.user_id")
    .select([
      "v.id as version_id",
      "v.template_id",
      "v.version",
      "v.source_path",
      "u.login_name",
    ])
    .where("v.preview_rendered_at", "is", null)
    .where("v.created_at", ">", TEMPLATE_PREVIEW_WINDOW)
    .where("p.deleted_at", "is", null)
    .orderBy("v.created_at", "asc")
    .limit(TEMPLATE_PREVIEWS_PER_RUN)
    .execute();
}

async function selectTargets(
  loginName: string | undefined,
  force: boolean,
): Promise<TargetUser[]> {
  let query = db
    .selectFrom("users")
    .select(["id", "login_name"])
    .where("discoverable", "=", true)
    .orderBy("site_updated_at", "desc");

  if (loginName) {
    query = query.where("login_name", "=", loginName);
  }

  if (!force) {
    query = query.where((eb) =>
      eb.or([
        eb("site_rendered_at", "is", null),
        eb("site_rendered_at", "<", eb.ref("site_updated_at")),
      ]),
    );
  }

  return await query.execute();
}

async function purgeCloudflareCache(url: string): Promise<void> {
  const zoneId = process.env.CLOUDFLARE_ZONE_ID;
  const apiToken = process.env.CLOUDFLARE_USER_API_TOKEN;
  if (!zoneId || !apiToken) return;

  try {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ files: [url] }),
      },
    );
    if (!res.ok) {
      console.error(
        `Cloudflare purge failed for ${url}: ${res.status} ${await res.text()}`,
      );
      return;
    }
    console.log(`Purged Cloudflare cache for ${url}`);
  } catch (err) {
    console.error(`Cloudflare purge error for ${url}: ${err}`);
  }
}

async function takeScreenshot(browser: Browser, url: string): Promise<Buffer> {
  // A context per site, closed whatever happens. One shared context kept every
  // site's cache and storage for the whole run, and a page whose goto timed out
  // was never closed, so its renderer stayed up until the browser did.
  const context = await browser.newContext({ deviceScaleFactor: 2 });
  try {
    const page = await context.newPage();
    await page.setViewportSize({ width: 640, height: 480 });
    await page.goto(url, { timeout: 10 * 1000 });
    await page.waitForTimeout(10 * 1000);
    return await page.screenshot();
  } finally {
    await context.close();
  }
}

async function renderUser(browser: Browser, user: TargetUser): Promise<void> {
  const homepageUrl = getHomepageUrl(user.login_name);

  const screenshot = await takeScreenshot(browser, homepageUrl);

  if (screenshot.length === 0) {
    console.log(`Skipping ${user.login_name}: screenshot is 0 bytes`);
    return;
  }

  await s3Client.send(
    new PutObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME_SCREENSHOTS!,
      Key: `${user.login_name}.png`,
      Body: screenshot,
      ContentType: "image/png",
    }),
  );
  console.log(`Uploaded screenshot for ${user.login_name}`);

  await db
    .updateTable("users")
    .set({ site_rendered_at: new Date() })
    .where("id", "=", user.id)
    .executeTakeFirst();

  await purgeCloudflareCache(getRenderedSiteUrl(user.login_name));
  await dispatchActorUpdate(user.id);
}

async function renderTemplate(
  browser: Browser,
  target: TargetTemplate,
): Promise<void> {
  const url = getPublicAssetUrl(target.login_name, target.source_path);
  const screenshot = await takeScreenshot(browser, url);
  if (screenshot.length === 0) {
    console.log(
      `Skipping template ${target.template_id}: screenshot is 0 bytes`,
    );
    return;
  }
  await s3Client.send(
    new PutObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME_SCREENSHOTS!,
      Key: templatePreviewKey(target.template_id, target.version),
      Body: screenshot,
      ContentType: "image/png",
    }),
  );
  await db
    .updateTable("board_template_versions")
    .set({ preview_rendered_at: new Date() })
    .where("id", "=", target.version_id)
    .execute();
  console.log(
    `Uploaded preview for template ${target.template_id} v${target.version}`,
  );
}

async function main() {
  const { values } = parseArgs({
    options: {
      user: { type: "string" },
      force: { type: "boolean", default: false },
      concurrency: { type: "string" },
    },
  });

  const concurrency = values.concurrency
    ? Math.max(1, Number.parseInt(values.concurrency, 10))
    : DEFAULT_CONCURRENCY;

  const targets = await selectTargets(values.user, values.force ?? false);
  // A run for one user renders only that user.
  const templateTargets = values.user ? [] : await selectTemplateTargets();

  if (values.user && targets.length === 0) {
    console.error(
      `[update-screenshots] no such discoverable user: ${values.user}`,
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    `[update-screenshots] ${targets.length} target(s), ${templateTargets.length} template(s), concurrency=${concurrency}`,
  );

  let browser: Browser | null = null;
  try {
    browser = await chromium.launch({
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    });
    const launched = browser;

    let cursor = 0;
    const worker = async () => {
      while (true) {
        const index = cursor++;
        if (index >= targets.length) return;
        const user = targets[index];
        try {
          await renderUser(launched, user);
        } catch (error) {
          console.error(`Failed to render ${user.login_name}: ${error}`);
        }
      }
    };

    const workerCount = Math.min(concurrency, targets.length);
    await Promise.all(Array.from({ length: workerCount }, () => worker()));

    for (const target of templateTargets) {
      try {
        await renderTemplate(launched, target);
      } catch (error) {
        console.error(
          `Failed to render template ${target.template_id}: ${error}`,
        );
      }
    }
  } finally {
    if (browser) await browser.close();
  }
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
