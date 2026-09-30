// Template preview images. Apart from templates.ts so the screenshot CLI can
// use them without the web server's modules.

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
