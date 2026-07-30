"use client"

import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { XIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { useAuthStore } from "@/stores/auth-store"

/**
 * Drag hook — press and hold on the dialog HEADER to move the dialog.
 * The drag offset is applied via `marginLeft`/`marginTop` so it never
 * conflicts with the open/close zoom animation (which uses `transform`).
 * When `minimized` is true, dragging is disabled and the offset resets.
 *
 * PERF: during the drag we (1) attach NATIVE pointermove/up listeners on the
 * `document` (bypassing React's synthetic event system, which adds latency),
 * and (2) write the offset DIRECTLY to the DOM (no React state / re-render).
 * This makes the dialog track the cursor with zero perceivable lag even on
 * heavy dialogs (activity tables, selects, photos). React state is only
 * updated ONCE on pointerup so the offset persists across later re-renders.
 * We also set `transition: none` while dragging so no CSS transition smooths
 * (slows) the margin changes.
 */
function useDraggable(minimized: boolean) {
  const [offset, setOffset] = React.useState({ x: 0, y: 0 })
  const contentRef = React.useRef<HTMLDivElement | null>(null)
  // Mutable drag session state — kept in a ref so the native listeners can
  // read/write it without being re-created.
  const dragRef = React.useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(null)

  // Reset the drag offset whenever the minimized state flips so the dialog
  // snaps back to its default (centered / bottom-docked) position. Uses the
  // "adjust state during render" pattern (React docs) instead of an effect.
  const [prevMinimized, setPrevMinimized] = React.useState(minimized)
  if (minimized !== prevMinimized) {
    setPrevMinimized(minimized)
    setOffset({ x: 0, y: 0 })
  }

  const onPointerDown = React.useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (minimized) return
    // Only start a drag when the pointer is on the header area.
    const target = e.target as HTMLElement
    const header = target.closest('[data-slot="dialog-header"]')
    if (!header) return
    // Don't start a drag when clicking interactive elements inside the header.
    if (target.closest('button, input, select, [role="combobox"], [role="button"], a')) return
    // Prevent text selection / native drag-and-drop image ghosting while dragging.
    e.preventDefault()
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      baseX: offset.x,
      baseY: offset.y,
    }
    const el = contentRef.current
    if (el) {
      // Disable transitions for the drag duration so margins apply INSTANTLY.
      el.style.transition = "none"
      el.style.willChange = "margin"
    }
    // Attach NATIVE listeners on document so move/up events fire even when the
    // cursor leaves the dialog (and bypass React's synthetic event latency).
    document.addEventListener("pointermove", onNativeMove, { passive: false })
    document.addEventListener("pointerup", onNativeUp, { passive: false })
    document.addEventListener("pointercancel", onNativeUp, { passive: false })
  }, [offset.x, offset.y, minimized])

  // Native (non-React) move handler — reads/writes the DOM directly.
  const onNativeMove = React.useCallback((e: PointerEvent) => {
    const d = dragRef.current
    if (!d) return
    e.preventDefault()
    const nextX = d.baseX + (e.clientX - d.startX)
    const nextY = d.baseY + (e.clientY - d.startY)
    const el = contentRef.current
    if (el) {
      el.style.marginLeft = `${nextX}px`
      el.style.marginTop = `${nextY}px`
    }
  }, [])

  const onNativeUp = React.useCallback((e: PointerEvent) => {
    const d = dragRef.current
    if (!d) return
    e.preventDefault()
    const nextX = d.baseX + (e.clientX - d.startX)
    const nextY = d.baseY + (e.clientY - d.startY)
    // Commit the final offset to React state so the `style` prop matches the
    // DOM and isn't clobbered by a later re-render (e.g. closing a nested dialog).
    setOffset({ x: nextX, y: nextY })
    dragRef.current = null
    // Restore transitions and clean up the native listeners.
    const el = contentRef.current
    if (el) {
      el.style.transition = ""
      el.style.willChange = ""
    }
    document.removeEventListener("pointermove", onNativeMove)
    document.removeEventListener("pointerup", onNativeUp)
    document.removeEventListener("pointercancel", onNativeUp)
  }, [onNativeMove])

  // Clean up native listeners on unmount (in case the dialog unmounts mid-drag).
  React.useEffect(() => {
    return () => {
      document.removeEventListener("pointermove", onNativeMove)
      document.removeEventListener("pointerup", onNativeUp)
      document.removeEventListener("pointercancel", onNativeUp)
    }
  }, [onNativeMove, onNativeUp])

  return { offset, contentRef, onPointerDown }
}

/**
 * Resize hook — gated by the `resize_table` permission. When the staff's group
 * has that permission, the dialog renders 8 resize handles (4 edges + 4
 * corners). Dragging an edge resizes one dimension; a corner resizes both.
 * The content scales proportionally via the CSS `zoom` property (factor =
 * currentWidth / baseWidth), so font sizes, line spacing, padding, etc. all
 * grow/shrink together — fulfilling "cỡ chữ và khoảng cách các dòng tăng giảm
 * theo tỷ lệ".
 *
 * Like the drag hook, resizing uses NATIVE document pointer listeners + direct
 * DOM writes (no React state per move) for zero-lag tracking. The final
 * width/height/zoom is committed to React state once on pointerup so it
 * persists across re-renders.
 *
 * IMPORTANT: getBoundingClientRect() returns the VISUAL size (after CSS zoom),
 * but el.style.width is the CSS size (before zoom). Using getBoundingClientRect
 * for baseW caused the dialog to shrink continuously on the 2nd drag because
 * the base captured the zoomed-in (larger) size, then nextW = baseW + dx would
 * overshoot, and zoom = nextW / base.w would recalculate to a different factor.
 * The fix: read the CSS width/height from el.style.width/height (or
 * getComputedStyle) — these are pre-zom and stable across drag sessions.
 *
 * `contentRef` is shared with the drag hook (both target the same content el).
 */
function useResizable(contentRef: React.RefObject<HTMLDivElement | null>, storageKey?: string, forceEnable?: boolean) {
  // `resize_table` permission gate. read once; permission changes are rare and
  // a re-mount (after refreshSession) picks up new values. `forceEnable` lets a
  // specific dialog (e.g. the Invoice dialog) be resizable regardless of the
  // staff's permissions — used when the business wants that dialog always
  // resizable + size-persistent.
  const hasPerm = useAuthStore((s) => s.hasPermission("resize_table"))
  const canResize = forceEnable || hasPerm
  // Base width captured on first resize (the dialog's natural CSS width, BEFORE
  // any zoom is applied — used as the denominator for zoom factor calculation).
  const baseSizeRef = React.useRef<{ w: number; h: number } | null>(null)
  // Initialize size from localStorage so the dialog opens at the last-saved
  // size. The key is per-dialog-type (passed via the `storageKey` prop on
  // DialogContent). When no saved size exists, defaults to null (natural CSS).
  const storageId = storageKey ? `crm-dialog-size-${storageKey}` : null
  const [size, setSize] = React.useState<{ width: number | null; height: number | null; zoom: number }>(() => {
    if (!storageId || typeof window === "undefined") return { width: null, height: null, zoom: 1 }
    try {
      const saved = localStorage.getItem(storageId)
      if (saved) {
        const parsed = JSON.parse(saved) as { width: number; height: number; zoom: number }
        if (parsed.width && parsed.height) return parsed
      }
    } catch { /* best-effort */ }
    return { width: null, height: null, zoom: 1 }
  })
  const resizeRef = React.useRef<{
    startX: number;
    startY: number;
    baseW: number;
    baseH: number;
    baseZoom: number;
    edge: string; // "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw"
  } | null>(null)

  /**
   * Read the CURRENT CSS width/height (pre-zoom) from the element's inline
   * style. Falls back to getComputedStyle when the inline style is empty
   * (first resize before any manual sizing). This is critical: using
   * getBoundingClientRect() here would return the VISUAL (post-zoom) size,
   * causing a runaway shrink/grow on the 2nd+ drag.
   */
  const getCurrentCssSize = React.useCallback((): { w: number; h: number } => {
    const el = contentRef.current
    if (!el) return { w: 0, h: 0 }
    const style = window.getComputedStyle(el)
    const w = parseFloat(style.width) || el.offsetWidth || 0
    const h = parseFloat(style.height) || el.offsetHeight || 0
    return { w, h }
  }, [contentRef])

  const onResizeMove = React.useCallback((e: PointerEvent) => {
    const r = resizeRef.current
    if (!r) return
    e.preventDefault()
    const el = contentRef.current
    if (!el) return
    const dx = e.clientX - r.startX
    const dy = e.clientY - r.startY
    let nextW = r.baseW
    let nextH = r.baseH
    // East edges change width; South edges change height. West/North also
    // change width/height but we keep the top-left anchored (simpler + the
    // dialog is centered, so anchoring top-left during a W/N drag is fine).
    if (r.edge.includes("e")) nextW = Math.max(200, r.baseW + dx)
    if (r.edge.includes("s")) nextH = Math.max(120, r.baseH + dy)
    if (r.edge.includes("w")) nextW = Math.max(200, r.baseW - dx)
    if (r.edge.includes("n")) nextH = Math.max(120, r.baseH - dy)
    // zoom = current CSS width / base CSS width → everything scales with width.
    const base = baseSizeRef.current
    const zoom = base && base.w > 0 ? nextW / base.w : 1
    el.style.width = `${nextW}px`
    el.style.height = `${nextH}px`
    // CSS `zoom` scales ALL content (px fonts, padding, line-height) by the
    // factor — exactly "tăng giảm theo tỷ lệ". Supported in Chromium/WebKit.
    el.style.zoom = String(zoom)
  }, [contentRef])

  const onResizeUp = React.useCallback((e: PointerEvent) => {
    const r = resizeRef.current
    if (!r) return
    e.preventDefault()
    const el = contentRef.current
    // Commit final size to React state so it persists across re-renders.
    // Read the CSS width/height (pre-zoom) from the inline style, NOT from
    // getBoundingClientRect (which returns the post-zoom visual size).
    if (el) {
      const base = baseSizeRef.current
      const w = parseFloat(el.style.width) || r.baseW
      const h = parseFloat(el.style.height) || r.baseH
      const zoom = base && base.w > 0 ? w / base.w : 1
      setSize({ width: w, height: h, zoom })
      // Persist to localStorage so the dialog reopens at this size.
      if (storageId) {
        try { localStorage.setItem(storageId, JSON.stringify({ width: w, height: h, zoom })); } catch { /* best-effort */ }
      }
    }
    resizeRef.current = null
    const el2 = contentRef.current
    if (el2) {
      // Restore transitions (disabled during the drag for zero-lag tracking).
      el2.style.transition = ""
    }
    document.body.style.cursor = ""
    document.body.style.userSelect = ""
    document.removeEventListener("pointermove", onResizeMove)
    document.removeEventListener("pointerup", onResizeUp)
    document.removeEventListener("pointercancel", onResizeUp)
  }, [contentRef, onResizeMove])

  const startResize = React.useCallback((edge: string) => (e: React.PointerEvent<HTMLDivElement>) => {
    if (!canResize) return
    e.preventDefault()
    e.stopPropagation()
    const el = contentRef.current
    if (!el) return
    // Capture the base CSS size on first resize; reuse for subsequent ones so
    // the zoom factor stays relative to the ORIGINAL CSS width (consistent
    // scaling). This is the PRE-ZOOM natural width.
    if (!baseSizeRef.current) {
      const cs = getCurrentCssSize()
      baseSizeRef.current = { w: cs.w, h: cs.h }
    }
    // Current CSS width/height (pre-zoom). Use getComputedStyle, NOT
    // getBoundingClientRect — the latter returns post-zoom visual size and
    // causes a runaway shrink on the 2nd+ drag.
    const cs = getCurrentCssSize()
    resizeRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      baseW: cs.w,
      baseH: cs.h,
      baseZoom: baseSizeRef.current.w > 0 ? cs.w / baseSizeRef.current.w : 1,
      edge,
    }
    // Disable transitions during the drag so margins/dimensions apply INSTANTLY
    // (no CSS animation smoothing that would make the resize feel laggy).
    el.style.transition = "none"
    // Cursor hint while dragging.
    const cursors: Record<string, string> = {
      n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize",
      ne: "nesw-resize", sw: "nesw-resize", nw: "nwse-resize", se: "nwse-resize",
    }
    document.body.style.cursor = cursors[edge] || "default"
    document.body.style.userSelect = "none"
    document.addEventListener("pointermove", onResizeMove, { passive: false })
    document.addEventListener("pointerup", onResizeUp, { passive: false })
    document.addEventListener("pointercancel", onResizeUp, { passive: false })
  }, [canResize, contentRef, onResizeMove, onResizeUp, getCurrentCssSize])

  // Clean up native listeners on unmount.
  React.useEffect(() => {
    return () => {
      document.removeEventListener("pointermove", onResizeMove)
      document.removeEventListener("pointerup", onResizeUp)
      document.removeEventListener("pointercancel", onResizeUp)
    }
  }, [onResizeMove, onResizeUp])

  return { canResize, size, startResize }
}

function Dialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-[100] bg-black/50",
        className
      )}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  minimized = false,
  storageKey,
  resizable,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean
  /** When true, the dialog docks to the bottom of the screen as a thin bar
   *  (used by the Booking dialog's minimize feature). Drag is disabled and
   *  the offset resets. */
  minimized?: boolean
  /** When set, the dialog's resized {width,height,zoom} is persisted to
   *  localStorage under this key so the dialog reopens at the same size next
   *  time. Use a unique string per dialog TYPE (e.g. "invoice", "booking"). */
  storageKey?: string
  /** When true, the resize handles are ALWAYS shown (bypassing the
   *  `resize_table` permission gate). Use this for dialogs the business wants
   *  every staff member to be able to resize + persist (e.g. the Invoice
   *  dialog). Size persistence (storageKey) still works independently of this. */
  resizable?: boolean
}) {
  const { offset, contentRef, onPointerDown } = useDraggable(minimized)
  // Resize is enabled for non-minimized dialogs when EITHER the `resizable`
  // prop is set OR the staff has the "resize_table" permission.
  const { canResize, size, startResize } = useResizable(contentRef, storageKey, resizable)
  const showResizeHandles = canResize && !minimized

  return (
    <DialogPortal data-slot="dialog-portal">
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={contentRef}
        data-slot="dialog-content"
        data-minimized={minimized ? "true" : undefined}
        className={cn(
          "bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed z-[100] flex flex-col w-full max-w-[calc(100%-2rem)] gap-4 rounded-lg border p-6 shadow-lg duration-200 sm:max-w-lg overflow-hidden",
          minimized
            ? "bottom-4 left-[50%] top-auto translate-x-[-50%] translate-y-0"
            : "top-[50%] left-[50%] translate-x-[-50%] translate-y-[-50%]",
          className
        )}
        style={{
          marginLeft: `${offset.x}px`,
          marginTop: `${offset.y}px`,
          // Apply committed width/height/zoom (set on pointerup). During an
          // active resize these are overridden directly on the DOM by the
          // native move handler; the committed values keep the size stable
          // across re-renders between drags.
          //
          // When a custom width/height is present we also set
          // maxWidth/maxHeight to "none" inline. This OVERRIDES any class-based
          // max-w-* (e.g. `max-w-[560px]` on the Invoice dialog) so the
          // restored/resized size is NOT capped back down to the default max.
          // Without this, a dialog resized to 700px would reopen at 560px
          // because `max-width: 560px` clamps the inline `width: 700px`.
          ...(size.width != null ? { width: `${size.width}px`, maxWidth: "none" } : {}),
          ...(size.height != null ? { height: `${size.height}px`, maxHeight: "none" } : {}),
          ...(size.zoom !== 1 ? { zoom: size.zoom } : {}),
        }}
        onPointerDown={onPointerDown}
        {...props}
      >
        {/* Content wrapper — flex-1 + overflow-y-auto so when the dialog is
            resized smaller (vertically), the content scrolls instead of being
            clipped. This is the key fix: previously `grid` layout with no
            overflow meant content below the fold was permanently hidden. */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {children}
        </div>
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            className={cn(
              "ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0",
              minimized
                ? "top-1 right-1 flex h-5 w-5 items-center justify-center [&_svg:not([class*='size-'])]:size-3"
                : "top-4 right-4 [&_svg:not([class*='size-'])]:size-4"
            )}
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
        {/* Resize handles — 4 edges + 4 corners. Each is an absolutely-
            positioned transparent strip on the dialog's border. Dragging
            resizes the dialog (edges = one dimension, corners = both) and
            scales all content via CSS `zoom` (see useResizable). */}
        {showResizeHandles && (
          <>
            <div onPointerDown={startResize("n")} style={{ position: "absolute", top: -3, left: 8, right: 8, height: 6, cursor: "ns-resize", zIndex: 60 }} />
            <div onPointerDown={startResize("s")} style={{ position: "absolute", bottom: -3, left: 8, right: 8, height: 6, cursor: "ns-resize", zIndex: 60 }} />
            <div onPointerDown={startResize("w")} style={{ position: "absolute", left: -3, top: 8, bottom: 8, width: 6, cursor: "ew-resize", zIndex: 60 }} />
            <div onPointerDown={startResize("e")} style={{ position: "absolute", right: -3, top: 8, bottom: 8, width: 6, cursor: "ew-resize", zIndex: 60 }} />
            <div onPointerDown={startResize("nw")} style={{ position: "absolute", top: -4, left: -4, width: 12, height: 12, cursor: "nwse-resize", zIndex: 61 }} />
            <div onPointerDown={startResize("ne")} style={{ position: "absolute", top: -4, right: -4, width: 12, height: 12, cursor: "nesw-resize", zIndex: 61 }} />
            <div onPointerDown={startResize("sw")} style={{ position: "absolute", bottom: -4, left: -4, width: 12, height: 12, cursor: "nesw-resize", zIndex: 61 }} />
            <div onPointerDown={startResize("se")} style={{ position: "absolute", bottom: -4, right: -4, width: 12, height: 12, cursor: "nwse-resize", zIndex: 61 }} />
          </>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn(
        "flex flex-col gap-2 text-center sm:text-left cursor-move select-none",
        className
      )}
      style={{ touchAction: "none" }}
      {...props}
    />
  )
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    />
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-lg leading-none font-semibold", className)}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
