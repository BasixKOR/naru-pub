// Where a user's site and its files live. Kept apart from utils.ts, which is
// for the UI and route handlers, so the CLIs can use these without Next.
export function getPublicAssetUrl(username: string, filename: string) {
  const pathname = filename.replaceAll("//", "/").replace(/^\//, "");

  return process.env.NODE_ENV === "production"
    ? `https://${username}.${process.env.NEXT_PUBLIC_DOMAIN}/${pathname}`
    : `http://${username}.${process.env.NEXT_PUBLIC_DOMAIN}/${pathname}`;
}

export function getHomepageUrl(username: string) {
  return process.env.NODE_ENV === "production"
    ? `https://${username}.${process.env.NEXT_PUBLIC_DOMAIN}`
    : `http://${username}.${process.env.NEXT_PUBLIC_DOMAIN}`;
}

export function getRenderedSiteUrl(
  username: string,
  version?: Date | string | null,
) {
  const base = `https://r2-screenshots.${process.env.NEXT_PUBLIC_DOMAIN}/${username}.png`;
  if (!version) return base;
  const stamp =
    version instanceof Date
      ? version.getTime()
      : Date.parse(version) || version;
  return `${base}?v=${stamp}`;
}

export function getUserHomeDirectory(loginName: string) {
  return `${loginName}`;
}
