import { useSyncExternalStore, useCallback } from "react";

/**
 * Toast type — a single toast notification.
 */
export interface Toast {
  id: string;
  title: string;
  description?: string;
  variant?: "default" | "destructive";
}

/**
 * Module-level toast store — a simple external store shared by ALL
 * components. This fixes the original bug where `useToast` used local
 * `useState`, so each component had its OWN toast list and the <Toaster />
 * component (which renders the toasts) never saw toasts created by other
 * components. With this module-level store, `toast()` adds to the global
 * list and the <Toaster /> reads from the same global list.
 */
type Listener = () => void;
let toasts: Toast[] = [];
const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) l();
}

function addToast(t: Omit<Toast, "id">) {
  const id = Math.random().toString(36).substring(7);
  const newToast: Toast = { id, ...t };
  toasts = [...toasts, newToast];
  emit();
  setTimeout(() => {
    toasts = toasts.filter((x) => x.id !== id);
    emit();
  }, 3000);
}

function removeToast(id: string) {
  toasts = toasts.filter((x) => x.id !== id);
  emit();
}

/**
 * Shared toast hook. Returns `{ toast, toasts, dismiss }`.
 *
 * - `toast(...)` queues a toast (visible for 3s then auto-removed).
 * - `toasts` is the current list (read via useSyncExternalStore so all
 *   components see the same list).
 * - `dismiss(id)` manually removes a toast (used by ToastClose).
 */
export function useToast() {
  const toastsSnapshot = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => toasts,
    () => toasts
  );

  const toast = useCallback(
    ({ title, description, variant = "default" }: Omit<Toast, "id">) => {
      addToast({ title, description, variant });
    },
    []
  );

  const dismiss = useCallback((id: string) => {
    removeToast(id);
  }, []);

  return { toast, toasts: toastsSnapshot, dismiss };
}
