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
