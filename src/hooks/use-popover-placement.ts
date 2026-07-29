import { useState, useLayoutEffect, useRef, useCallback } from "react";

/**
 * Popover placement options relative to the anchor (slot) element.
 * - "bottom": popover below the slot, left-aligned (with horizontal shift if needed).
 * - "top": popover above the slot, left-aligned (with horizontal shift if needed).
 * - "left": popover to the left of the slot, top-aligned.
 * - "right": popover to the right of the slot, top-aligned.
 */
export type PopoverPlacement = "bottom" | "top" | "left" | "right";

/**
 * Tailwind class strings for each placement. These set the `top`/`left`/
 * `right`/`bottom` offsets so the popover sits flush against the slot edge
 * (no margin / gap — per user request: "không còn khoảng cách này nữa").
 *
 * For bottom/top placements, a horizontal shift (via inline `transform`) may
 * be applied to keep the popover within the viewport when the slot is near
 * the right edge.
 */
const PLACEMENT_CLASSES: Record<PopoverPlacement, string> = {
  bottom: "left-0 top-full",
  top: "left-0 bottom-full",
  left: "right-full top-0",
  right: "left-full top-0",
};

/**
 * A hook that measures available viewport space around the anchor element
 * and picks the best side for a popover. Priority: bottom → right → top →
 * left (per user request: "hiển thị sang cạnh bên phải hoặc cạnh bên trên").
 *
 * The popover must be a child of the anchor (slot) element — the hook uses
 * `popoverRef.current.parentElement` as the anchor. The popover should be
 * `position: absolute` so it doesn't affect layout.
 *
 * CRITICAL: This hook re-measures whenever the popover's SIZE changes (via
 * ResizeObserver). This handles the common case where the popover's content
 * loads asynchronously (e.g., BookingHoverDetails fetches invoice data) —
 * the popover starts short (loading), gets placed at "bottom", then grows
 * tall when content arrives, potentially overflowing the viewport. The
 * ResizeObserver catches this growth and re-evaluates the placement.
 *
 * For bottom/top placements, a horizontal shift is applied via inline
 * `transform: translateX(...)` when the popover would overflow the viewport's
 * right edge (so the slot's left alignment is kept when possible, but the
 * popover shifts left just enough to stay on-screen).
 *
 * @param active Whether the popover is currently shown (hovered). The hook
 *   only measures when active, and resets to "bottom" when inactive.
 * @returns `{ popoverRef, placementClass, horizontalShift }` — attach
 *   `popoverRef` to the popover div, apply `placementClass` to its className,
 *   and apply `horizontalShift` as inline `transform: translateX(${shift}px)`.
 */
export function usePopoverPlacement(active: boolean) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<PopoverPlacement>("bottom");
  const [horizontalShift, setHorizontalShift] = useState(0);

  const measure = useCallback(() => {
    const popover = popoverRef.current;
    if (!popover) return;
    const parent = popover.parentElement;
    if (!parent) return;

    const popoverRect = popover.getBoundingClientRect();
    const slotRect = parent.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Minimal gap (2px) so the popover border is distinguishable from the
    // slot border, but visually flush (user said "không còn khoảng cách").
    const GAP = 2;

    const pw = popoverRect.width;
    const ph = popoverRect.height;
    const spaceBelow = vh - slotRect.bottom;
    const spaceAbove = slotRect.top;
    const spaceLeft = slotRect.left;
    const spaceRight = vw - slotRect.right;

    // Priority: bottom → right → top → left.
    // (Per user request: "hiển thị sang cạnh bên phải hoặc cạnh bên trên"
    //  when bottom doesn't fit. Right is preferred over left because left
    //  placement was causing "khuất ở bên trái" — the popover's left edge
    //  going off-screen when the slot is near the left viewport edge.)
    let chosen: PopoverPlacement;
    if (spaceBelow >= ph + GAP) {
      chosen = "bottom";
    } else if (spaceRight >= pw + GAP) {
      chosen = "right";
    } else if (spaceAbove >= ph + GAP) {
      chosen = "top";
    } else if (spaceLeft >= pw + GAP) {
      chosen = "left";
    } else {
      // No side fully fits — pick the one with the MOST space so the
      // popover is as visible as possible. Compare all four spaces and
      // choose the largest. This handles edge cases like a very tall
      // popover that doesn't fit anywhere — at least it shows on the
      // side with the most room (and scrolls internally via max-h).
      const spaces: Array<[PopoverPlacement, number]> = [
        ["bottom", spaceBelow],
        ["right", spaceRight],
        ["top", spaceAbove],
        ["left", spaceLeft],
      ];
      spaces.sort((a, b) => b[1] - a[1]);
      chosen = spaces[0][0];
    }
    setPlacement(chosen);

    // === Horizontal shift for bottom/top placements ===
    // When the popover is below/above the slot, it's left-aligned with the
    // slot (left-0). If the slot is near the right edge of the viewport,
    // the popover (255px wide) can extend beyond the right edge. Shift it
    // left by the overflow amount so its right edge stays within the viewport.
    // Also clamp so the popover's left edge doesn't go off-screen.
    if (chosen === "bottom" || chosen === "top") {
      const popoverLeftEdge = slotRect.left;
      const popoverRightEdge = slotRect.left + pw;
      let shift = 0;
      if (popoverRightEdge > vw - GAP) {
        // Shift left by the overflow amount.
        shift = popoverRightEdge - (vw - GAP);
      }
      // Don't shift so far that the left edge goes off-screen.
      if (popoverLeftEdge - shift < GAP) {
        shift = popoverLeftEdge - GAP;
      }
      setHorizontalShift(-shift); // negative = translate left
    } else {
      setHorizontalShift(0);
    }
  }, []);

  // Measure on mount / when `active` becomes true. useLayoutEffect runs
  // after DOM mutation but BEFORE paint — so the user never sees a flash
  // of the popover in the wrong position.
  useLayoutEffect(() => {
    if (!active) {
      setPlacement("bottom");
      setHorizontalShift(0);
      return;
    }
    measure();
  }, [active, measure]);

  // === ResizeObserver: re-measure when the popover's SIZE changes ===
  // This is critical because BookingHoverDetails fetches invoice data
  // asynchronously. The popover starts short (loading state) → gets placed
  // at "bottom" → content loads → popover grows tall → might overflow the
  // viewport. The ResizeObserver catches this growth and re-evaluates the
  // placement (e.g., flips to "top" if there's more space above).
  useLayoutEffect(() => {
    if (!active) return;
    const popover = popoverRef.current;
    if (!popover) return;
    const observer = new ResizeObserver(() => {
      measure();
    });
    observer.observe(popover);
    // Also observe the popover's content children (BookingHoverDetails
    // renders its content inside the popover — when the query resolves,
    // the children grow, triggering the observer).
    observer.observe(popover, { box: "border-box" });
    return () => observer.disconnect();
  }, [active, measure]);

  // Re-measure on viewport resize / scroll (the slot might move relative
  // to the viewport, changing which side has space).
  useLayoutEffect(() => {
    if (!active) return;
    const handler = () => measure();
    window.addEventListener("resize", handler);
    window.addEventListener("scroll", handler, true);
    return () => {
      window.removeEventListener("resize", handler);
      window.removeEventListener("scroll", handler, true);
    };
  }, [active, measure]);

  return {
    popoverRef,
    placementClass: PLACEMENT_CLASSES[placement],
    horizontalShift,
  };
}
