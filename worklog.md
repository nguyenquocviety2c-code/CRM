---
Task ID: 3
Agent: main
Task: Fix cancel race condition bug and extend existing booking confirmation dialog logic

Work Log:
- Found root cause of cancel bug: invoice-summary.tsx onSuccess callback reads activeTabId from CURRENT Zustand state, not from when the mutation was triggered. If user switches tabs while PATCH is in flight, cancelled=true gets set on wrong tab.
- Fixed by capturing tabId at mutationFn start (capturedTabId), returning it in mutation result, and using it in onSuccess instead of activeTabId.
- Also fixed the second activeTabId reference in onSuccess for product-only cancellations (updateTabMeta for invoiceId/bookingCode).
- Extended by-phone API to support customerId parameter ( alongside phone). Now accepts phone OR customerId OR both.
- Updated service-selector.tsx existing booking check: uses phone OR customerId (excluding walkin- synthetic IDs), passes excludeBookingId, uses URLSearchParams for cleaner URL construction.
- Updated booking-dialog.tsx existing booking check: uses phone OR customerId, passes excludeBookingId via URLSearchParams.
- Verified by-phone API: customerId lookup returns bookings correctly, excludeBookingId excludes specified booking.
- Lint passed with only pre-existing warnings.

Stage Summary:
- Cancel race condition fixed: capturedTabId ensures cancelled flag only set on the correct tab
- Existing booking confirmation dialog now works by customerId (when phone unavailable)
- excludeBookingId parameter properly passed to avoid showing current tab's own booking in the confirmation dialog
- Files modified: invoice-summary.tsx, service-selector.tsx, booking-dialog.tsx, by-phone/route.ts
