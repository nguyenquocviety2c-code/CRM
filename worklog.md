---
Task ID: 1
Agent: Main Agent
Task: Implement draggable popup feature for Booking module hover popups

Work Log:
- Read hover-card.tsx, booking-time-grid.tsx, and booking-staff-view.tsx to understand current implementation
- Created `useDraggablePopup` hook at `/home/z/my-project/download/CRM/src/hooks/use-draggable-popup.ts`
  - Manages drag state with refs for synchronous access
  - Stores position offset in localStorage (`booking-popup-offset` key)
  - Uses CSS `transform: translate(dx, dy)` for popup repositioning
  - Drag threshold of 3px to distinguish drag from click
  - Double-click on drag handle resets position to default
- Modified `CustomerGridChip` in `booking-time-grid.tsx`:
  - Added controlled HoverCard mode (`open` + `onOpenChange`)
  - Prevents closing during drag via `isDraggingRef.current` check
  - Added `GripVertical` drag handle bar at top of popup
  - Applied `dragStyle` CSS transform to HoverCardContent
  - Increased `closeDelay` from 300ms to 500ms for smoother transition
  - Changed `sideOffset` from previous values to 0 for flush positioning
- Modified `BookingChip` in `booking-staff-view.tsx`:
  - Same controlled HoverCard + draggable popup implementation
  - Added `GripVertical` drag handle bar at top of popup
  - Applied `dragStyle` CSS transform to HoverCardContent
  - Changed `sideOffset` from -2 to 0 for consistency
- Verified via PM2 logs: no compilation or runtime errors
- Verified via Agent Browser: page loads correctly, booking chips visible, no console errors
  - Note: Radix HoverCard popup cannot be triggered via automated browser hover (known limitation)

Stage Summary:
- Draggable popup feature implemented in both Customer View (Khung giờ) and Staff View
- Popup now has a drag handle (GripVertical icon) at the top for repositioning
- Position offset persisted in localStorage so all future popup appearances use same relative offset
- Double-click on drag handle resets position to default
- Controlled HoverCard mode prevents premature closing during drag operations
---
Task ID: 2
Agent: Main Agent
Task: Fix draggable popup - make entire popup draggable (not just drag handle), remove e.stopPropagation(), add cursor-pointer to buttons

Work Log:
- Redesigned `useDraggablePopup` hook:
  - Removed `e.stopPropagation()` to allow Radix HoverCard pointer tracking to work
  - Changed `onDragStart` → `onContentMouseDown` with interactive element check
  - Interactive elements (button, a, select, input, [data-slot=select-trigger]) are excluded from drag
  - Only non-interactive areas start a drag
- Modified both CustomerGridChip and BookingChip:
  - Removed separate drag handle div
  - Added wrapper div inside HoverCardContent with `onMouseDown={onContentMouseDown}`
  - Wrapper has `cursor-grab` (Tailwind class) / `cursor-grabbing` during drag
  - Kept visual drag indicator at top (GripVertical icon, subtle gray)
  - `onDoubleClick={resetPosition}` on wrapper
- Added `cursor-pointer` to ALL interactive elements in BookingHoverDetails:
  - "Đơn hàng"/"Xem hóa đơn" button
  - "Checkin" button
  - "Xếp nhân viên" button
  - Edit (Pencil) button
  - Delete (Trash) button
  - SelectTrigger
- Changed cursor approach: Tailwind classes instead of inline styles
  - This allows child elements to override parent cursor naturally
- Verified: Server compiles and runs without errors, browser test shows no JS errors

Stage Summary:
- Popup is now draggable from ANY non-interactive area (text, labels, blank space)
- Buttons show `cursor: pointer` while non-interactive areas show `cursor: grab`
- Drag persists position via localStorage - same offset applied to all future slots
- Double-click resets position to default
- No e.stopPropagation() - Radix HoverCard pointer tracking preserved
