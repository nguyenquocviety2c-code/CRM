---
Task ID: 1
Agent: Main Agent
Task: Fix draggable hover popup in Booking module (both Staff View and Customer View > Khung giờ)

Work Log:
- Fixed `Pencil is not defined` runtime error by adding `import { Pencil, LogIn, Trash2 } from "lucide-react"` to booking-staff-view.tsx
- Rewrote `DraggableHoverPopup` component completely with `setPointerCapture` approach instead of document-level listeners (eliminates timing gap issue)
- Fixed `display: contents` zero-size rect issue: `getBoundingClientRect()` returns `{x:0, y:0, w:0, h:0}` on `display: contents` div, so added `getTriggerRect()` that falls back to first child's rect
- Added `keepOpen` prop to `DraggableHoverPopup` to prevent closing when status select dropdown is open (portal outside popup)
- Replaced inline `{hovered && <div>}` popup in `SegmentCard` (booking-time-grid.tsx) with `DraggableHoverPopup`
- Replaced inline `{hovered && <div>}` popup in `SegmentBlock` (booking-staff-view.tsx) with `DraggableHoverPopup`
- Added localStorage re-read on popup open so all instances share the same drag offset
- Verified drag functionality via browser automation: pointerdown → pointermove → pointerup worked correctly, popup moved 80px right and 40px down, offset persisted to localStorage, double-click reset cleared offset

Stage Summary:
- All booking hover popups now use `DraggableHoverPopup` with `setPointerCapture` drag mechanism
- Drag is smooth (direct DOM manipulation via CSS `translate` property during drag, no React re-render lag)
- Offset persists in localStorage and is shared across all popup instances
- Double-click resets position to default
- No runtime errors or compilation errors
