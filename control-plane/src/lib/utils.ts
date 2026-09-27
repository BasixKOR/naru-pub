import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type { NextRequest } from "next/server";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Validates that the request is a legitimate JSON API call, not a form submission.
 * Uses two layers of defense:
 *
 * 1. Content-Type check: Forms can only send application/x-www-form-urlencoded,
 *    multipart/form-data, or text/plain - not application/json.
 *    This blocks same-origin form attacks.
 *
 * 2. Sec-Fetch-Site header: Automatically set by browsers, cannot be forged.
 *    Only allows same-origin requests, blocking cross-subdomain attacks
 *    (e.g., attacker.naru.pub -> naru.pub/api).
 */
export function assertJsonContentType(request: NextRequest): void {
  // Check 1: Content-Type must be application/json
  const contentType = request.headers.get("content-type");
  if (!contentType?.includes("application/json")) {
    throw new Error("Content-Type must be application/json");
  }

  // Check 2: Sec-Fetch-Site must be same-origin (if header present)
  // Blocks: same-site (subdomain attacks), cross-site (external attacks)
  const secFetchSite = request.headers.get("sec-fetch-site");
  if (secFetchSite && secFetchSite !== "same-origin") {
    throw new Error("Invalid request: cross-origin requests not allowed");
  }
}
