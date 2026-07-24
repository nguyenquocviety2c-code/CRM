---
Task ID: 1
Agent: main
Task: Fix "Xem lịch hẹn" not appearing in walk-in tab of Cashier module

Work Log:
- Investigated the CustomerTabs component structure in customer-tabs.tsx
- Found that the customer info bar has two branches: Walk-in Tab branch (lines 1084-1212) and Booking/Standalone Invoice Tab branch (lines 1213-1327)
- The "Xem lịch hẹn" link was only in the Booking branch, but walk-in tabs that create bookings stay as type "walkin" and render the Walk-in branch
- Added "Xem lịch hẹn" link to Walk-in Tab branch at lines 1221-1232 (shows when activeMeta?.bookingCode exists and booking status != checkout)
- Added "Hóa đơn" link for paid walk-in bookings at lines 1238-1255
- Added booking date/time display for walk-in tabs at lines 1259-1275
- Updated booking status badge to show for walk-in tabs with bookings (line 1402)
- Verified fix with Agent Browser: logged in as ductran/123456, created walk-in tab, added service, confirmed "Xem lịch hẹn: LH000091" appears
- Verified navigation: clicking "Xem lịch hẹn" navigates to Booking > View nhân viên

Stage Summary:
- Root cause: Walk-in tabs (type "walkin") always rendered the Walk-in Tab branch which lacked "Xem lịch hẹn" link, even after a booking was created via createBookingForTab
- Fix: Added "Xem lịch hẹn", "Hóa đơn", and date/time display to the Walk-in Tab branch, mirroring the Booking branch's logic
- All changes are in src/components/features/cashier/customer-tabs.tsx
- Supabase connection is working fine - login succeeds with ductran/123456, staff data loads correctly
