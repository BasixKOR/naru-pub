// A client-side navigation has begun. Kept apart from the LoadingBar
// component so instrumentation-client.ts, which runs before hydration, stays
// light.
export const NAVIGATION_START = "naru:navigation-start";

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
