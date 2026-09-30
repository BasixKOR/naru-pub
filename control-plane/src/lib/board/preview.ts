// Where templates live in storage, and their preview images. Apart from
// templates.ts so the screenshot CLI can use them without the web server's
// modules.

// A template's snapshots, in the site bucket.
export function templatePrefix(templateId: string): string {
  return `_templates/${templateId}/`;
}

export function templateFileKey(
  templateId: string,
  version: number,
  path: string,
): string {
  return `${templatePrefix(templateId)}v${version}/${path}`;
}

// Previews live beside the site screenshots, under a prefix no login name can
// take.
export function templatePreviewKey(templateId: string, version: number) {
  return `_templates/${templateId}/v${version}.png`;
}

export function getTemplatePreviewUrl(
  templateId: string,
  version: number,
  renderedAt: Date | string | null,
): string | null {
  if (!renderedAt) return null;
  const stamp = new Date(renderedAt).getTime();
  return `https://r2-screenshots.${process.env.NEXT_PUBLIC_DOMAIN}/${templatePreviewKey(templateId, version)}?v=${stamp}`;
}

// Publishing a template version notifies this Postgres channel, and cron,
// which runs where Chromium is, renders the preview straight away rather
// than at its next 15-minute screenshot run.
export const TEMPLATE_PUBLISHED_CHANNEL = "board_template_published";
