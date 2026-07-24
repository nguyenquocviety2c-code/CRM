"use client";

import { useState, useEffect, useRef, useCallback } from "react";

const STORAGE_KEY = "booking-popup-offset";
const DRAG_THRESHOLD = 3; // px before considering it a real drag vs click

interface PopupOffset {
  dx: number;
  dy: number;
}

function loadStoredOffset(): PopupOffset | null {
  try {
    if (typeof window === "undefined") return null;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (typeof parsed.dx === "number" && typeof parsed.dy === "number") {
        return parsed;
      }
    }
  } catch {}
  return null;
}

function saveStoredOffset(offset: PopupOffset) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(offset));
  } catch {}
}

function clearStoredOffset() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

/**
 * Hook that makes a popup draggable via pointer events.
 * - Click-hold on the drag handle (or any non-interactive area) → drag to reposition
 * - Double-click → reset to default position
 * - Offset is persisted in localStorage and applied to ALL future popup appearances
 *
 * KEY DESIGN: The offset transform MUST be applied to an INNER div (not the
 * Radix HoverCardContent) because Radix uses CSS transform for open/close
 * animations which would override our translate().
 */
export function useDraggablePopup() {
  const [storedOffset, setStoredOffset] = useState<PopupOffset | null>(loadStoredOffset);
  const [isDragging, setIsDragging] = useState(false);
  const [dragDelta, setDragDelta] = useState<PopupOffset>({ dx: 0, dy: 0 });

  // Refs for synchronous access (avoid stale-state issues in event handlers)
  const dragStartRef = useRef<{
    mouseX: number;
    mouseY: number;
    baseDx: number;
    baseDy: number;
  } | null>(null);
  const lastDeltaRef = useRef<PopupOffset>({ dx: 0, dy: 0 });
  const hasMovedRef = useRef(false);
  const isDraggingRef = useRef(false);

  // The total visual offset applied to the popup right now
  const totalOffset: PopupOffset = isDragging
    ? {
        dx: (storedOffset?.dx || 0) + dragDelta.dx,
        dy: (storedOffset?.dy || 0) + dragDelta.dy,
      }
    : storedOffset || { dx: 0, dy: 0 };

  /**
   * PointerDown handler for the popup content wrapper.
   * Uses pointer events (not mouse events) for compatibility with Radix UI,
   * which uses pointer events internally for its DismissableLayer.
   *
   * IMPORTANT: We call e.stopPropagation() to prevent Radix from processing
   * this pointerDown as a "pointerDownOutside" event that could close the popup.
   * We also call e.preventDefault() to prevent text selection during drag.
   */
  const onContentPointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Only handle primary button (left click)
      if (e.button !== 0) return;

      // Skip if clicking on interactive elements (buttons, links, selects, etc.)
      const target = e.target as HTMLElement;
      if (
        target.closest(
          'button, a, select, input, [role="button"], [data-slot="select-trigger"], [data-slot="select-value"], textarea'
        )
      ) {
        return; // Let the normal click happen — no drag
      }

      // Stop Radix from handling this pointer event (prevent dismiss on outside click)
      e.stopPropagation();
      // Prevent text selection during drag
      e.preventDefault();

      const baseDx = storedOffset?.dx || 0;
      const baseDy = storedOffset?.dy || 0;
      dragStartRef.current = {
        mouseX: e.clientX,
        mouseY: e.clientY,
        baseDx,
        baseDy,
      };
      lastDeltaRef.current = { dx: 0, dy: 0 };
      setIsDragging(true);
      isDraggingRef.current = true;
      setDragDelta({ dx: 0, dy: 0 });
      hasMovedRef.current = false;
    },
    [storedOffset],
  );

  useEffect(() => {
    if (!isDragging) return;

    const onPointerMove = (e: PointerEvent) => {
      if (!dragStartRef.current) return;
      e.preventDefault(); // Prevent text selection during drag
      const dx = e.clientX - dragStartRef.current.mouseX;
      const dy = e.clientY - dragStartRef.current.mouseY;
      if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
        hasMovedRef.current = true;
      }
      // Update both ref (synchronous) and state (for render)
      lastDeltaRef.current = { dx, dy };
      setDragDelta({ dx, dy });
    };

    const onPointerUp = () => {
      if (!dragStartRef.current) return;

      if (hasMovedRef.current) {
        // It was a real drag — compute final offset and persist
        const newOffset: PopupOffset = {
          dx: dragStartRef.current.baseDx + lastDeltaRef.current.dx,
          dy: dragStartRef.current.baseDy + lastDeltaRef.current.dy,
        };
        setStoredOffset(newOffset);
        saveStoredOffset(newOffset);
      }
      // If it wasn't a real drag (just a click), don't change offset

      setIsDragging(false);
      isDraggingRef.current = false;
      setDragDelta({ dx: 0, dy: 0 });
      lastDeltaRef.current = { dx: 0, dy: 0 };
      dragStartRef.current = null;
      hasMovedRef.current = false;
    };

    // Use pointer events for consistency with onContentPointerDown
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
    return () => {
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
    };
  }, [isDragging]);

  const resetPosition = useCallback(() => {
    setStoredOffset(null);
    clearStoredOffset();
    setDragDelta({ dx: 0, dy: 0 });
  }, []);

  // Use the CSS `translate` property (Transforms Level 2) which works
  // INDEPENDENTLY from `transform`. Radix HoverCard uses `transform` for
  // open/close animations (zoom-in-95, slide-in-from-*), and those animations
  // with fill-mode:forwards would override our `transform: translate()`.
  // The separate `translate` property is NOT affected by those animations.
  const style: React.CSSProperties =
    totalOffset.dx !== 0 || totalOffset.dy !== 0
      ? { translate: `${totalOffset.dx}px ${totalOffset.dy}px` }
      : {};

  return {
    isDragging,
    isDraggingRef,
    style,
    onContentPointerDown,
    resetPosition,
    hasStoredPosition: !!storedOffset,
    totalOffset,
  };
}
