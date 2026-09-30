"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { NAVIGATION_START } from "@/lib/navigation-start";

// Most pages render on the server, so after a click nothing on screen changes
// until the next page arrives. This bar, under the nav, runs from the start of
// a navigation until the new page's address is in place.
//
// Next reports the start through onRouterTransitionStart in
// instrumentation-client.ts, which calls announceNavigationStart
// (lib/navigation-start.ts). The pathname or query changing finishes it.

// Never sit at 100% while still waiting: creep towards this and stop.
const CEILING = 0.9;
// A navigation that never lands (an error, one that is cancelled) stops
// showing the bar after this long.
const GIVE_UP_MS = 15000;

// The bar is drawn by writing its element's style directly: it is a visual
// that runs on timers between renders, not state the page depends on.
class Bar {
  private progress = 0;
  private trickle: ReturnType<typeof setInterval> | null = null;
  private timers: ReturnType<typeof setTimeout>[] = [];

  constructor(private element: HTMLDivElement) {}

  get running() {
    return this.trickle !== null;
  }

  private draw(progress: number, visible: boolean) {
    this.progress = progress;
    this.element.style.width = `${progress * 100}%`;
    this.element.style.opacity = visible ? "1" : "0";
  }

  private clear() {
    if (this.trickle) clearInterval(this.trickle);
    this.trickle = null;
    for (const timer of this.timers) clearTimeout(timer);
    this.timers = [];
  }

  start() {
    this.clear();
    this.draw(0.08, true);
    this.trickle = setInterval(() => {
      // Each step covers part of what's left, so it slows as it nears the
      // ceiling and never reaches it.
      this.draw(this.progress + (CEILING - this.progress) * 0.1, true);
    }, 200);
    this.timers.push(setTimeout(() => this.finish(), GIVE_UP_MS));
  }

  finish() {
    this.clear();
    this.draw(1, true);
    this.timers.push(
      setTimeout(() => {
        this.draw(1, false);
        this.timers.push(setTimeout(() => this.draw(0, false), 200));
      }, 200),
    );
  }

  dispose() {
    this.clear();
  }
}

export function LoadingBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const element = useRef<HTMLDivElement>(null);
  const bar = useRef<Bar | null>(null);

  useEffect(() => {
    const current = new Bar(element.current!);
    bar.current = current;
    const start = () => current.start();
    window.addEventListener(NAVIGATION_START, start);
    return () => {
      window.removeEventListener(NAVIGATION_START, start);
      current.dispose();
      bar.current = null;
    };
  }, []);

  // The new page's address is in place: the navigation has landed.
  useEffect(() => {
    if (bar.current?.running) bar.current.finish();
  }, [pathname, searchParams]);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-full z-50 h-[3px]"
    >
      <div
        ref={element}
        className="h-full w-0 bg-primary opacity-0 transition-[width,opacity] duration-200 ease-out motion-reduce:transition-none"
      />
    </div>
  );
}
