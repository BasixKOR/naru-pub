// Starting and stopping the loading bar under the nav (LoadingBar). Kept apart
// from that component so instrumentation-client.ts, which runs before
// hydration, stays light.

export const NAVIGATION_START = "naru:navigation-start";
export const WORK_START = "naru:work-start";
export const WORK_END = "naru:work-end";

// A client-side navigation has begun; the new page's address arriving ends it.
export function announceNavigationStart(url: string) {
  const target = new URL(url, window.location.href);
  // Only the fragment differs: nothing is fetched and the path won't change,
  // so nothing would ever finish the bar.
  if (
    target.pathname === window.location.pathname &&
    target.search === window.location.search
  ) {
    return;
  }
  window.dispatchEvent(new Event(NAVIGATION_START));
}

// Shows the bar while some work that isn't a navigation runs: a request made
// with fetch, for instance. Overlapping work keeps it running until the last
// piece finishes.
export async function withLoadingBar<T>(work: Promise<T>): Promise<T> {
  window.dispatchEvent(new Event(WORK_START));
  try {
    return await work;
  } finally {
    window.dispatchEvent(new Event(WORK_END));
  }
}

// fetch, with the loading bar running until the response arrives.
export function loadingFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  return withLoadingBar(fetch(input, init));
}
