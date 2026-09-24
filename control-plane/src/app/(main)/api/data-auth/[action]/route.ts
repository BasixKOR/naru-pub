import { ownerAuthRequest } from "@/lib/site-data/auth-http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handle(
  request: Request,
  context: { params: Promise<{ action: string }> },
) {
  const { action } = await context.params;
  // The consent screen's approval and its setup fix. Website calls live under
  // v1/, and client registrations only on the same-origin account route.
  return ownerAuthRequest(
    request,
    action === "authorize" || action === "prepare" ? action : "missing",
  );
}
export { handle as GET, handle as POST };
