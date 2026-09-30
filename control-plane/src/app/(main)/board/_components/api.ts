// Client-side calls to /api/board. Every mutating route takes JSON (the
// routes refuse anything else), so even DELETE sends a body.
export async function boardRequest<T = Record<string, unknown>>(
  url: string,
  method: "POST" | "PATCH" | "PUT" | "DELETE",
  body: unknown = {},
): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  let data: any = null;
  try {
    data = await response.json();
  } catch {}
  if (!response.ok || !data?.success) {
    throw new Error(data?.message ?? "요청을 처리하지 못했습니다.");
  }
  return data as T;
}
