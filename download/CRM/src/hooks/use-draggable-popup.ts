"use client";

import { useState, useEffect, useRef, useCallback } from "react";

const STORAGE_KEY = "booking-popup-offset";
const DRAG_THRESHOLD = 3; // px before considering it a real drag vs click

// Interactive elements that should NOT trigger a drag
const INTERACTIVE_SELECTOR = 'button, a, select, input, [role="button"], [data-slot="select-trigger"], [data-slot="select-value"]';

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
 * Hook that makes a HoverCard popup draggable from ANY non-interactive area.
 * - Click-hold on any non-button/non-link area → drag to reposition
 * - Double-click on non-interactive area → reset to default position
 * - Position offset is persisted in localStorage so all future
 *   popup appearances (on any slot) use the same relative offset
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
   * MouseDown handler for the popup content wrapper.
   * Checks if the click target is an interactive element (button, link, etc.)
   * — if so, lets the normal click happen (no drag).
   * — if NOT interactive, starts a drag operation.
   *
   * IMPORTANT: We do NOT call e.stopPropagation() because Radix HoverCard
   * needs to receive pointer events to keep the popup open. We DO call
   * e.preventDefault() to prevent text selection during drag.
   */
  const onContentMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Skip if clicking on interactive elements (buttons, links, selects, etc.)
      const target = e.target as HTMLElement;
      if (target.closest(INTERACTIVE_SELECTOR)) {
        return; // Let the normal click happen — no drag
      }

      e.preventDefault(); // Prevent text selection during drag

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

    const onMouseMove = (e: MouseEvent) => {
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

    const onMouseUp = () => {
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

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, [isDragging]);

  const resetPosition = useCallback(() => {
    setStoredOffset(null);
    clearStoredOffset();
    setDragDelta({ dx: 0, dy: 0 });
  }, []);

  // CSS transform style to apply on HoverCardContent
  const style: React.CSSProperties =
    totalOffset.dx !== 0 || totalOffset.dy !== 0
      ? { transform: `translate(${totalOffset.dx}px, ${totalOffset.dy}px)` }
      : {};

  return {
    isDragging,
    isDraggingRef,
    style,
    onContentMouseDown,
    resetPosition,
    hasStoredPosition: !!storedOffset,
    totalOffset,
  };
}
