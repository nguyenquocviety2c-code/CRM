import { useState, useLayoutEffect, useRef, useCallback } from "react";

/**
 * Popover placement options relative to the anchor (slot) element.
 * - "bottom": popover below the slot, left-aligned.
 * - "top": popover above the slot, left-aligned.
 * - "left": popover to the left of the slot, top-aligned.
 * - "right": popover to the right of the slot, top-aligned.
 */
export type PopoverPlacement = "bottom" | "top" | "left" | "right";

/**
 * Tailwind class strings for each placement. These set the `top`/`left`/
 * `right`/`bottom` offsets so the popover sits flush against the slot edge
 * (no margin / gap — per user request: "không còn khoảng cách này nữa").
 */
const PLACEMENT_CLASSES: Record<PopoverPlacement, string> = {
  bottom: "left-0 top-full",
  top: "left-0 bottom-full",
  left: "right-full top-0",
  right: "left-full top-0",
};

/**
 * A hook that measures available viewport space around the anchor element
 * and picks the best side for a popover. Priority: bottom → left → right →
 * top (per user request: "nếu hiển thị liền cạnh dưới của slot mà không đủ
 * thì hãy hiển thị ở cạnh khác như trái, nếu trái không đủ thì phải hoặc ở
 * cạnh trên").
 *
 * The popover must be a child of the anchor (slot) element — the hook uses
 * `popoverRef.current.parentElement` as the anchor. The popover should be
 * `position: absolute` so it doesn't affect layout.
 *
 * @param active Whether the popover is currently shown (hovered). The hook
 *   only measures when active, and resets to "bottom" when inactive.
 * @returns `{ popoverRef, placementClass }` — attach `popoverRef` to the
 *   popover div and apply `placementClass` to its className.
 */
export function usePopoverPlacement(active: boolean) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<PopoverPlacement>("bottom");

  const measure = useCallback(() => {
    const popover = popoverRef.current;
    if (!popover) return;
    const parent = popover.parentElement;
    if (!parent) return;

    const popoverRect = popover.getBoundingClientRect();
    const slotRect = parent.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Small gap (2px) so the popover doesn't visually touch the slot —
    // just enough to distinguish the border, but the user said "không còn
    // khoảng cách" so we keep this minimal.
    const GAP = 2;

    const spaceBelow = vh - slotRect.bottom;
    const spaceAbove = slotRect.top;
    const spaceLeft = slotRect.left;
    const spaceRight = vw - slotRect.right;

    const pw = popoverRect.width;
    const ph = popoverRect.height;

    // Priority: bottom → left → right → top.
    // If NO side fits, fall back to bottom (popover extends below viewport —
    // at least the top is visible and the user can scroll).
    if (spaceBelow >= ph + GAP) {
      setPlacement("bottom");
    } else if (spaceLeft >= pw + GAP) {
      setPlacement("left");
    } else if (spaceRight >= pw + GAP) {
      setPlacement("right");
    } else if (spaceAbove >= ph + GAP) {
      setPlacement("top");
    } else {
      setPlacement("bottom");
    }
  }, []);

  // Measure on mount / when `active` becomes true. useLayoutEffect runs
  // after DOM mutation but BEFORE paint — so the user never sees a flash
  // of the popover in the wrong position.
  useLayoutEffect(() => {
    if (!active) {
      setPlacement("bottom");
      return;
    }
    measure();
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
  };
}
