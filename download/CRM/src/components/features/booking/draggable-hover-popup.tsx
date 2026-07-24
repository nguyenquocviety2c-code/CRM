"use client";

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type ReactNode,
} from "react";
import { useDraggablePopup } from "@/hooks/use-draggable-popup";
import { GripVertical } from "lucide-react";

/**
 * A custom hover-triggered popup that is fully draggable.
 *
 * WHY NOT Radix HoverCard?
 * Radix HoverCard uses a Portal, DismissableLayer, FocusScope, and CSS
 * animations on `transform`. These fight against drag interactions:
 *   - DismissableLayer intercepts pointer events and may close the popup
 *   - FocusScope may detect "focus outside" and close the popup
 *   - CSS animation `transform: scale(1)` (fill-mode:forwards) overrides
 *     any `transform: translate()` we set for the offset
 *   - Portal rendering makes event propagation unpredictable
 *
 * This custom component avoids all those issues by using simple
 * `mouseenter/mouseleave` detection, `position: fixed` positioning,
 * and the CSS `translate` property (independent from `transform`).
 *
 * Props:
 * - side: "bottom" (popup below trigger) or "right" (popup to the right)
 * - align: "start" (flush with left/top edge) or "center"
 * - sideOffset: gap between trigger and popup (px)
 * - className: extra classes for the popup card
 * - renderPopup: function that returns the popup content JSX
 * - children: the trigger element (slot chip)
 */

const OPEN_DELAY = 200; // ms before showing popup on hover
const CLOSE_DELAY = 400; // ms grace period before hiding popup
const GRACE_AREA_MARGIN = 8; // px margin for the "grace area" between trigger and popup

interface DraggableHoverPopupProps {
  side?: "bottom" | "right";
  align?: "start" | "center";
  sideOffset?: number;
  className?: string;
  renderPopup: () => ReactNode;
  children: ReactNode;
}

export function DraggableHoverPopup({
  side = "bottom",
  align = "start",
  sideOffset = 0,
  className = "",
  renderPopup,
  children,
}: DraggableHoverPopupProps) {
  const [visible, setVisible] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  // Draggable popup hook
  const {
    isDragging,
    isDraggingRef,
    style: dragStyle,
    onContentPointerDown,
    resetPosition,
  } = useDraggablePopup();

  // Timers for open/close delays
  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Computed popup position (re-calculated on each render when visible)
  const [popupPos, setPopupPos] = useState({ left: 0, top: 0 });

  // --- Hover detection ---
  const cancelCloseTimer = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const cancelOpenTimer = useCallback(() => {
    if (openTimerRef.current) {
      clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
  }, []);

  const handleTriggerEnter = useCallback(() => {
    cancelCloseTimer();
    cancelOpenTimer();
    openTimerRef.current = setTimeout(() => {
      // Calculate popup position from trigger rect
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;

      let left = 0;
      let top = 0;

      if (side === "bottom") {
        top = rect.bottom + sideOffset;
        if (align === "start") {
          left = rect.left;
        } else {
          left = rect.left + rect.width / 2; // center-aligned (will be shifted by popup width/2 via CSS)
        }
      } else if (side === "right") {
        left = rect.right + sideOffset;
        if (align === "start") {
          top = rect.top;
        } else {
          top = rect.top + rect.height / 2;
        }
      }

      setPopupPos({ left, top });
      setVisible(true);
    }, OPEN_DELAY);
  }, [side, align, sideOffset, cancelCloseTimer, cancelOpenTimer]);

  const handleTriggerLeave = useCallback(() => {
    cancelOpenTimer();
    // Start close timer — popup stays visible during grace period
    closeTimerRef.current = setTimeout(() => {
      if (!isDraggingRef.current) {
        setVisible(false);
      }
    }, CLOSE_DELAY);
  }, [cancelOpenTimer]);

  const handlePopupEnter = useCallback(() => {
    cancelCloseTimer();
    // If not visible yet (race condition), show it
    if (!isDraggingRef.current) {
      // Re-calculate position in case trigger moved
      const rect = triggerRef.current?.getBoundingClientRect();
      if (rect) {
        let left = 0;
        let top = 0;
        if (side === "bottom") {
          top = rect.bottom + sideOffset;
          left = align === "start" ? rect.left : rect.left + rect.width / 2;
        } else if (side === "right") {
          left = rect.right + sideOffset;
          top = align === "start" ? rect.top : rect.top + rect.height / 2;
        }
        setPopupPos({ left, top });
      }
      setVisible(true);
    }
  }, [side, align, sideOffset, cancelCloseTimer]);

  const handlePopupLeave = useCallback(() => {
    if (!isDraggingRef.current) {
      // Start close timer
      closeTimerRef.current = setTimeout(() => {
        setVisible(false);
      }, CLOSE_DELAY);
    }
  }, []);

  // --- Grace area: keep popup open when pointer moves between trigger and popup ---
  useEffect(() => {
    if (!visible) return;

    const handlePointerMove = (e: PointerEvent) => {
      if (isDraggingRef.current) return; // During drag, ignore pointer move for close detection

      const triggerRect = triggerRef.current?.getBoundingClientRect();
      const popupRect = popupRef.current?.getBoundingClientRect();
      if (!triggerRect || !popupRect) return;

      // Expand popup rect by grace area margin
      const expandedPopup = {
        left: popupRect.left - GRACE_AREA_MARGIN,
        right: popupRect.right + GRACE_AREA_MARGIN,
        top: popupRect.top - GRACE_AREA_MARGIN,
        bottom: popupRect.bottom + GRACE_AREA_MARGIN,
      };

      // Check if pointer is over trigger OR expanded popup area
      const overTrigger =
        e.clientX >= triggerRect.left &&
        e.clientX <= triggerRect.right &&
        e.clientY >= triggerRect.top &&
        e.clientY <= triggerRect.bottom;

      const overPopup =
        e.clientX >= expandedPopup.left &&
        e.clientX <= expandedPopup.right &&
        e.clientY >= expandedPopup.top &&
        e.clientY <= expandedPopup.bottom;

      if (overTrigger || overPopup) {
        cancelCloseTimer();
      } else {
        // Pointer left both areas — start close timer
        if (!closeTimerRef.current) {
          closeTimerRef.current = setTimeout(() => {
            setVisible(false);
          }, CLOSE_DELAY);
        }
      }
    };

    document.addEventListener("pointermove", handlePointerMove);
    return () => {
      document.removeEventListener("pointermove", handlePointerMove);
    };
  }, [visible, cancelCloseTimer]);

  // --- Keep popup visible during drag ---
  useEffect(() => {
    if (isDragging) {
      setVisible(true); // Ensure popup stays visible during drag
    }
  }, [isDragging]);

  // --- Viewport boundary adjustment ---
  // After popup becomes visible, adjust position if it overflows viewport
  useEffect(() => {
    if (!visible) return;
    // Wait one frame for the popup to render and get its dimensions
    const raf = requestAnimationFrame(() => {
      const popupEl = popupRef.current;
      if (!popupEl) return;

      const popupRect = popupEl.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      let { left, top } = popupPos;

      // Adjust horizontal overflow
      if (popupRect.right > vw) {
        left = vw - popupRect.width - 8; // 8px margin from viewport edge
      }
      if (popupRect.left < 0) {
        left = 8;
      }

      // Adjust vertical overflow
      if (popupRect.bottom > vh) {
        top = vh - popupRect.height - 8;
      }
      if (popupRect.top < 0) {
        top = 8;
      }

      if (left !== popupPos.left || top !== popupPos.top) {
        setPopupPos({ left, top });
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [visible, popupPos.left, popupPos.top]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      cancelOpenTimer();
      cancelCloseTimer();
    };
  }, [cancelOpenTimer, cancelCloseTimer]);

  // Combine drag style with position style
  const popupStyle: React.CSSProperties = {
    position: "fixed",
    left: popupPos.left,
    top: popupPos.top,
    zIndex: 50,
    ...dragStyle, // CSS `translate` property for drag offset
  };

  // Alignment offset for center-aligned popups
  const alignTransform =
    align === "center" && side === "bottom"
      ? "translateX(-50%)"
      : align === "center" && side === "right"
        ? "translateY(-50%)"
        : undefined;

  // If we have a center alignment transform, we need to merge it with the drag style
  // The dragStyle uses the CSS `translate` property, and center alignment uses CSS `transform`
  // These are independent properties (Transforms Level 2 spec), so they work together
  const finalPopupStyle: React.CSSProperties = {
    ...popupStyle,
    ...(alignTransform ? { transform: alignTransform } : {}),
  };

  return (
    <>
      {/* Trigger element */}
      <div
        ref={triggerRef}
        onMouseEnter={handleTriggerEnter}
        onMouseLeave={handleTriggerLeave}
        className="contents" // "contents" makes the div invisible in layout, so children render as if unwrapped
      >
        {children}
      </div>

      {/* Popup — only rendered when visible */}
      {visible && (
        <div
          ref={popupRef}
          style={finalPopupStyle}
          onMouseEnter={handlePopupEnter}
          onMouseLeave={handlePopupLeave}
          className={`rounded-md border bg-popover text-popover-foreground shadow-xl outline-none ${className}`}
        >
          {/* Draggable wrapper — pointer down on drag handle starts drag */}
          <div
            onPointerDown={onContentPointerDown}
            onDoubleClick={resetPosition}
            className={`relative ${isDragging ? "select-none" : ""}`}
          >
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
