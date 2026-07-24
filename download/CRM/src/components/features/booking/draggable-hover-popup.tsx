"use client";

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type ReactNode,
} from "react";
import { GripVertical } from "lucide-react";

/* ─── WHY NOT Radix HoverCard? ───
 * Radix HoverCard uses Portal + DismissableLayer + FocusScope + CSS
 * animation transforms. Those fight against drag interactions:
 *   - DismissableLayer intercepts pointer events and closes the popup
 *   - FocusScope may detect "focus outside" and close the popup
 *   - CSS animation transform: scale(1) (fill-mode:forwards) overrides
 *     any transform: translate() we set for the offset
 *   - Portal rendering makes event propagation unpredictable
 *
 * This custom component uses simple mouseenter/mouseleave detection,
 * position:fixed, and setPointerCapture for reliable drag.
 *
 * ─── DRAG MECHANISM ───
 * Previous approach used document.addEventListener('pointermove/pointerup')
 * via a useEffect, which had a timing gap: setIsDragging(true) triggers
 * a React re-render, and the useEffect runs AFTER that render. During
 * the gap, pointermove events are missed → popup doesn't move.
 *
 * New approach: setPointerCapture. When pointerdown fires, we call
 * element.setPointerCapture(pointerId), which routes ALL future
 * pointermove/pointerup events to that element — no document listeners,
 * no timing gap, no React state updates during drag (only refs + direct
 * DOM manipulation for smooth movement).
 */

const OPEN_DELAY  = 200;   // ms before showing popup on hover
const CLOSE_DELAY = 400;   // ms grace period before hiding popup
const GRACE_MARGIN = 8;    // px margin around popup for "grace area"
const STORAGE_KEY = "booking-popup-offset";
const DRAG_THRESHOLD = 3;  // px before considering it a real drag vs click

/* ─── Offset helpers ─── */
interface Offset { dx: number; dy: number }

function loadOffset(): Offset {
  try {
    if (typeof window === "undefined") return { dx: 0, dy: 0 };
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const o = JSON.parse(raw);
      if (typeof o.dx === "number" && typeof o.dy === "number") return o;
    }
  } catch {}
  return { dx: 0, dy: 0 };
}

function saveOffset(o: Offset) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(o)); } catch {}
}

function clearOffset() {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}

/* ─── Component ─── */
interface DraggableHoverPopupProps {
  side?: "bottom" | "right";
  align?: "start" | "center";
  sideOffset?: number;
  className?: string;
  /** When true, the popup stays visible even if the pointer leaves
   *  both the trigger and the popup area. Useful when a child select
   *  dropdown (rendered in a portal) is open — the pointer moves to
   *  the portal but the popup must remain visible. */
  keepOpen?: boolean;
  renderPopup: () => ReactNode;
  children: ReactNode;
}

export function DraggableHoverPopup({
  side = "bottom",
  align = "start",
  sideOffset = 0,
  className = "",
  keepOpen = false,
  renderPopup,
  children,
}: DraggableHoverPopupProps) {
  /* ─── State ─── */
  const [visible, setVisible]             = useState(false);
  const [popupPos, setPopupPos]           = useState({ left: 0, top: 0 });
  const [storedOffset, setStoredOffset]   = useState<Offset>(loadOffset);

  /* ─── Re-read stored offset from localStorage when popup opens ───
   *  Each DraggableHoverPopup instance loads storedOffset on mount.
   *  When one instance's drag updates localStorage, other mounted
   *  instances won't know about it unless they re-read on open. */
  useEffect(() => {
    if (visible) {
      const fresh = loadOffset();
      if (fresh.dx !== storedOffset.dx || fresh.dy !== storedOffset.dy) {
        setStoredOffset(fresh);
      }
    }
  }, [visible]); // Intentionally NOT including storedOffset — we only
                  // want to re-read when popup opens, not when offset changes

  /* ─── Refs ─── */
  const triggerRef   = useRef<HTMLDivElement>(null);
  const popupRef     = useRef<HTMLDivElement>(null);
  const isDragging   = useRef(false);
  const dragStart    = useRef<{ mx: number; my: number; bx: number; by: number } | null>(null);
  const curDelta     = useRef<Offset>({ dx: 0, dy: 0 });
  const openTimer    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ─── Position calculation from trigger ─── */
  /* The trigger wrapper has `display: contents` (className="contents"),
   * so getBoundingClientRect() returns a zero-size rect. We need to
   * use the FIRST CHILD's rect instead — that's the actual slot element
   * that has a visual box. */
  const getTriggerRect = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return null;
    // If the wrapper has display:contents (no box), use first child's rect
    const r = trigger.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return r; // normal case
    const child = trigger.firstElementChild;
    if (child) return child.getBoundingClientRect();
    return null;
  }, []);

  const calcPos = useCallback(() => {
    const r = getTriggerRect();
    if (!r) return null;
    let left = 0, top = 0;
    if (side === "bottom") {
      top = r.bottom + sideOffset;
      left = align === "start" ? r.left : r.left + r.width / 2;
    } else {
      left = r.right + sideOffset;
      top = align === "start" ? r.top : r.top + r.height / 2;
    }
    return { left, top };
  }, [side, align, sideOffset, getTriggerRect]);

  /* ─── Timer helpers ─── */
  const cancelClose = useCallback(() => {
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
  }, []);
  const cancelOpen = useCallback(() => {
    if (openTimer.current) { clearTimeout(openTimer.current); openTimer.current = null; }
  }, []);

  /* ─── Hover handlers ─── */
  const onTriggerEnter = useCallback(() => {
    cancelClose();
    cancelOpen();
    openTimer.current = setTimeout(() => {
      const pos = calcPos();
      if (pos) {
        setPopupPos(pos);
        setVisible(true);
      }
    }, OPEN_DELAY);
  }, [calcPos, cancelClose, cancelOpen]);

  const onTriggerLeave = useCallback(() => {
    cancelOpen();
    if (keepOpen) return; // Don't close when keepOpen is true
    closeTimer.current = setTimeout(() => {
      if (!isDragging.current && !keepOpen) setVisible(false);
    }, CLOSE_DELAY);
  }, [cancelOpen, keepOpen]);

  const onPopupEnter = useCallback(() => {
    cancelClose();
    if (!isDragging.current) {
      const pos = calcPos();
      if (pos) {
        setPopupPos(pos);
        setVisible(true);
      }
    }
  }, [calcPos, cancelClose]);

  const onPopupLeave = useCallback(() => {
    if (!isDragging.current && !keepOpen) {
      closeTimer.current = setTimeout(() => setVisible(false), CLOSE_DELAY);
    }
  }, [keepOpen]);

  /* ─── Grace-area: keep popup open when pointer moves between trigger and popup ─── */
  useEffect(() => {
    if (!visible) return;
    const handler = (e: PointerEvent) => {
      if (isDragging.current) return;
      const tR = getTriggerRect();
      const pR = popupRef.current?.getBoundingClientRect();
      if (!tR || !pR) return;

      const exp = {
        left:   pR.left   - GRACE_MARGIN,
        right:  pR.right  + GRACE_MARGIN,
        top:    pR.top    - GRACE_MARGIN,
        bottom: pR.bottom + GRACE_MARGIN,
      };
      const overT = e.clientX >= tR.left && e.clientX <= tR.right && e.clientY >= tR.top && e.clientY <= tR.bottom;
      const overP = e.clientX >= exp.left && e.clientX <= exp.right && e.clientY >= exp.top && e.clientY <= exp.bottom;

      if (overT || overP) {
        cancelClose();
      } else if (!closeTimer.current && !keepOpen) {
        closeTimer.current = setTimeout(() => setVisible(false), CLOSE_DELAY);
      }
    };
    document.addEventListener("pointermove", handler);
    return () => document.removeEventListener("pointermove", handler);
  }, [visible, cancelClose, getTriggerRect]);

  /* ─── Viewport boundary adjustment ─── */
  useEffect(() => {
    if (!visible) return;
    const raf = requestAnimationFrame(() => {
      const el = popupRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const vw = window.innerWidth, vh = window.innerHeight;
      let { left, top } = popupPos;
      if (r.right  > vw) left = vw - r.width  - 8;
      if (r.left   < 0)  left = 8;
      if (r.bottom > vh) top  = vh - r.height - 8;
      if (r.top    < 0)  top  = 8;
      if (left !== popupPos.left || top !== popupPos.top) setPopupPos({ left, top });
    });
    return () => cancelAnimationFrame(raf);
  }, [visible, popupPos.left, popupPos.top]);

  /* ─── Cleanup timers on unmount ─── */
  useEffect(() => () => { cancelOpen(); cancelClose(); }, [cancelOpen, cancelClose]);

  /* ─── DRAG: setPointerCapture approach ───
   * On pointerdown:
   *   1. Call setPointerCapture(pointerId) — routes ALL future
   *      pointermove/pointerup to this element, no document listeners needed.
   *   2. Record drag start position.
   *   3. NO React state updates during drag (only refs + direct DOM).
   *
   * On pointermove (via pointer capture):
   *   1. Calculate delta from start position.
   *   2. Update popup position via direct DOM manipulation
   *      (style.translate) — SMOOTH, no React re-render lag.
   *
   * On pointerup (via pointer capture):
   *   1. Finalize offset, persist to localStorage.
   *   2. Update React state (storedOffset).
   *   3. Release pointer capture.
   */
  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;

    // Skip interactive elements (buttons, links, selects, etc.)
    const target = e.target as HTMLElement;
    if (target.closest(
      'button, a, select, input, [role="button"], [data-slot="select-trigger"], [data-slot="select-value"], textarea'
    )) return;

    e.preventDefault();

    // Capture pointer → ALL future pointermove/pointerup go to this element
    try {
      popupRef.current?.setPointerCapture(e.pointerId);
    } catch {}

    // Cancel any pending close timer
    cancelClose();

    // Record drag start
    isDragging.current = true;
    dragStart.current = {
      mx: e.clientX,
      my: e.clientY,
      bx: storedOffset.dx,
      by: storedOffset.dy,
    };
    curDelta.current = { dx: 0, dy: 0 };

    // Visual feedback via direct DOM (no React state → no re-render)
    if (popupRef.current) {
      popupRef.current.style.cursor = "grabbing";
      popupRef.current.style.userSelect = "none";
    }
  }, [storedOffset, cancelClose]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging.current || !dragStart.current) return;

    const dx = e.clientX - dragStart.current.mx;
    const dy = e.clientY - dragStart.current.my;
    curDelta.current = { dx, dy };

    // Total offset = stored + current drag delta
    const totalDx = dragStart.current.bx + dx;
    const totalDy = dragStart.current.by + dy;

    // Direct DOM manipulation for SMOOTH movement (no React re-render lag)
    if (popupRef.current) {
      popupRef.current.style.translate = `${totalDx}px ${totalDy}px`;
    }
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging.current) return;

    const hasMoved =
      Math.abs(curDelta.current.dx) > DRAG_THRESHOLD ||
      Math.abs(curDelta.current.dy) > DRAG_THRESHOLD;

    if (hasMoved && dragStart.current) {
      const newOffset: Offset = {
        dx: dragStart.current.bx + curDelta.current.dx,
        dy: dragStart.current.by + curDelta.current.dy,
      };
      setStoredOffset(newOffset);
      saveOffset(newOffset);
    }

    // Reset drag state
    isDragging.current = false;
    dragStart.current = null;
    curDelta.current = { dx: 0, dy: 0 };

    // Remove visual feedback
    if (popupRef.current) {
      popupRef.current.style.cursor = "";
      popupRef.current.style.userSelect = "";
    }

    // Release pointer capture
    try {
      popupRef.current?.releasePointerCapture(e.pointerId);
    } catch {}
  }, []);

  const handleLostPointerCapture = useCallback(() => {
    if (isDragging.current) {
      // Browser cancelled capture (e.g., user switched app) — cancel drag
      isDragging.current = false;
      dragStart.current = null;
      curDelta.current = { dx: 0, dy: 0 };

      // Remove visual feedback
      if (popupRef.current) {
        popupRef.current.style.cursor = "";
        popupRef.current.style.userSelect = "";
      }

      // Re-apply stored offset (cancel drag, go back to stored position)
      if (popupRef.current) {
        if (storedOffset.dx !== 0 || storedOffset.dy !== 0) {
          popupRef.current.style.translate = `${storedOffset.dx}px ${storedOffset.dy}px`;
        } else {
          popupRef.current.style.translate = "";
        }
      }
    }
  }, [storedOffset]);

  const handleDoubleClick = useCallback(() => {
    setStoredOffset({ dx: 0, dy: 0 });
    clearOffset();

    // Reset visual position
    if (popupRef.current) {
      popupRef.current.style.translate = "";
    }
  }, []);

  /* ─── Popup style ───
   * React controls: position:fixed, left, top, zIndex, alignment transform.
   * Drag controls (via direct DOM): CSS translate property.
   * These are INDEPENDENT (CSS Transforms Level 2 spec) —
   * translate does NOT conflict with transform.
   *
   * Important: React style only includes translate for the storedOffset
   * (so it's applied on initial render / re-renders).
   * During drag, translate is controlled by direct DOM manipulation
   * (see handlePointerMove), and NO React state updates happen,
   * so React won't override the direct DOM translate.
   */
  const popupStyle: React.CSSProperties = {
    position: "fixed",
    left: popupPos.left,
    top: popupPos.top,
    zIndex: 50,
    ...(storedOffset.dx !== 0 || storedOffset.dy !== 0
      ? { translate: `${storedOffset.dx}px ${storedOffset.dy}px` }
      : {}),
    ...(align === "center" && side === "bottom"
      ? { transform: "translateX(-50%)" }
      : {}),
    ...(align === "center" && side === "right"
      ? { transform: "translateY(-50%)" }
      : {}),
  };

  return (
    <>
      {/* Trigger element */}
      <div
        ref={triggerRef}
        onMouseEnter={onTriggerEnter}
        onMouseLeave={onTriggerLeave}
        className="contents"
      >
        {children}
      </div>

      {/* Popup — only rendered when visible */}
      {visible && (
        <div
          ref={popupRef}
          style={popupStyle}
          onMouseEnter={onPopupEnter}
          onMouseLeave={onPopupLeave}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onLostPointerCapture={handleLostPointerCapture}
          onDoubleClick={handleDoubleClick}
          className={`rounded-md border bg-popover text-popover-foreground shadow-xl outline-none touch-none ${className}`}
        >
          {/* Draggable content wrapper */}
          <div className="relative">
            {/* Visual drag handle at the top */}
            <div
              className="flex items-center justify-center h-7 cursor-grab active:cursor-grabbing bg-muted/50 border-b select-none rounded-t-md"
              title="Kéo để di chuyển · Nhấp đúp để trở về mặc định"
            >
              <GripVertical className="h-4 w-4 text-muted-foreground/50" />
            </div>
            {/* Popup content */}
            {renderPopup()}
          </div>
        </div>
      )}
    </>
  );
}
