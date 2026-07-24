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
---
Task ID: 4
Agent: main
Task: Add date range selector to Cashier module + Fix booking bugs

Work Log:
- Replaced single <input type="date"> in cashier/page.tsx with DateNav buttons (Hôm nay, Ngày mai, 7 ngày) + DateRangePicker component (same as Booking module)
- Updated cashier/page.tsx to manage dateNav + dateRange state instead of selectedDate
- Modified customer-tabs.tsx: changed prop from selectedDate: string to dateRange: { from: Date; to: Date }, updated booking/invoice query keys and API params to use dateRange ISO strings
- Modified invoice-summary.tsx: same prop change and query updates as customer-tabs
- Removed localDayToUtcRange import from customer-tabs.tsx and invoice-summary.tsx (no longer needed)
- Fixed Bug #1: by-phone API route now excludes checkin status (b.status !== "checkin") so the dialog only triggers for truly un-checked-in bookings (new/confirmed)
- Fixed Bug #2: service-selector.tsx now resets skipExistingBookingsCheck=false in the finally block of handleDialogConfirm, preventing future tabs from bypassing the existing-booking check
- Fixed Bug #3: service-selector.tsx now uses BookingStatusLabel[b.status] instead of raw status string in the existing-booking dialog
- Fixed wording: dialog title/message changed from "chưa thanh toán" to "chưa checkin"
- Fixed secondary cancel bug: invoice-summary.tsx Path 0 (walk-in tab with invoiceId) now also cancels the linked booking when bookingId exists, preventing orphaned active bookings
- Investigated primary cancellation bug: code is correct (cancels by booking ID), likely a Supabase database trigger issue
- Verified all changes with Agent Browser: DateNav buttons work correctly (Hôm nay → today range, Ngày mai → tomorrow range, 7 ngày → 7-day range), DateRangePicker displays correct range, bookings fetch and display correctly

Stage Summary:
- Cashier module now has full date range selector (Hôm nay/Ngày mai/7 ngày + DateRangePicker) like Booking module
- Pre-existing booking detection dialog now correctly filters checkin status, resets skip flag, uses Vietnamese status labels
- Secondary cancel bug fixed (walk-in tab with both invoiceId and bookingId)
- Primary cancellation bug (one cancel → both cancelled) is likely a Supabase trigger, not a code bug
- Files modified: cashier/page.tsx, customer-tabs.tsx, invoice-summary.tsx, by-phone/route.ts, service-selector.tsx
---
Task ID: 5
Agent: main
Task: Remove date nav buttons from Cashier + verify Booking module button styling

Work Log:
- Removed the 3 DateNav buttons (Hôm nay, Ngày mai, 7 ngày) and the Button import from cashier/page.tsx
- Simplified date state management in Cashier: removed dateNav state, handleDateNavChange, and DateNav type — now only dateRange + setDateRange remain
- Simplified default dateRange initialization using inline function instead of getDateRangeFromNav helper
- Verified Booking module date nav buttons: active button (Hôm nay) already shows green/emerald-600 bg with white text, inactive buttons (Ngày mai, 7 ngày) already show white bg with border
- Verified with Agent Browser + VLM analysis: Cashier page shows only DateRangePicker without nav buttons, Booking page has correctly styled buttons

Stage Summary:
- Cashier module: removed 3 quick nav buttons, only DateRangePicker remains
- Booking module: button styling already correct (active=green, inactive=white), no changes needed
- Files modified: cashier/page.tsx only
