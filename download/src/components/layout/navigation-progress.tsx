"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * Top progress bar shown during route navigation.
 *
 * App Router has no router-events API, so we detect navigation start by
 * patching history.pushState/replaceState (used by <Link> and router.push)
 * and the popstate event (back/forward). Navigation completion is detected
 * via the pathname changing. This is a well-known, dependency-free pattern.
 *
 * The bar gives instant visual feedback the moment the user clicks a module
 * link — so the app feels responsive even while Next.js compiles the route
 * on-demand in dev mode.
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const doneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const clearTimers = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (doneTimerRef.current) {
        clearTimeout(doneTimerRef.current);
        doneTimerRef.current = null;
      }
    };

    const start = () => {
      // Defer state updates out of the current execution context: Next.js
      // router may call pushState during a React commit phase, and scheduling
      // a setState there triggers a "useInsertionEffect must not schedule
      // updates" warning. queueMicrotask runs it after the current task.
      queueMicrotask(() => {
        clearTimers();
        setIsLoading(true);
        setProgress(15);
        // Ease towards 85% but never complete until the route resolves.
        intervalRef.current = setInterval(() => {
          setProgress((p) => (p < 85 ? p + (90 - p) * 0.12 : p));
        }, 250);
      });
    };

    const originalPush = history.pushState;
    const originalReplace = history.replaceState;
    history.pushState = function (...args) {
      start();
      return originalPush.apply(this, args as unknown[]);
    } as typeof history.pushState;
    history.replaceState = function (...args) {
      start();
      return originalReplace.apply(this, args as unknown[]);
    } as typeof history.replaceState;

    const handlePop = () => start();
    window.addEventListener("popstate", handlePop);

    return () => {
      history.pushState = originalPush;
      history.replaceState = originalReplace;
      window.removeEventListener("popstate", handlePop);
      clearTimers();
    };
  }, []);

  // Route completed: pathname changed → fill to 100% then hide.
  useEffect(() => {
    if (!isLoading) return;
    // Defer state updates out of the effect body to avoid a cascading render
    // (the pathname change already triggered a render). Runs before paint.
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setProgress(100);
      doneTimerRef.current = setTimeout(() => setIsLoading(false), 220);
    });
    return () => {
      cancelled = true;
      if (doneTimerRef.current) {
        clearTimeout(doneTimerRef.current);
        doneTimerRef.current = null;
      }
    };
  }, [pathname, isLoading]);

  if (!isLoading) return null;

  return (
    <div
      className="fixed left-0 right-0 top-0 z-[100] h-0.5 pointer-events-none"
      role="progressbar"
      aria-valuenow={Math.round(progress)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)] transition-[width] duration-200 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}
