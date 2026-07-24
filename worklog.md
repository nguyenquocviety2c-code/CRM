---
Task ID: 2
Agent: main
Task: Update "Xem lịch hẹn" display and add "Tạo vào lúc" creation timestamp

Work Log:
- Removed booking code from "Xem lịch hẹn" text in both walk-in branch and booking branch (was "Xem lịch hẹn: LHxxx", now just "Xem lịch hẹn")
- Removed booking code from "Hóa đơn" text in both branches (was "Hóa đơn: HDxxx", now just "Hóa đơn")
- Added "Tạo vào lúc" + creation timestamp after appointment date/time in both walk-in branch and booking branch
- Format: "24/07/2026 08:30 • Tạo vào lúc 24/07/2026 07:48"
- Added `created_at: string | null` to TodayBooking interface since Supabase already returns this field
- Used toVietnamDay/toVietnamTime for timezone-safe conversion of created_at (UTC → VN wall-clock)
- Verified with Agent Browser: both walk-in and booking tabs show updated format correctly

Stage Summary:
- "Xem lịch hẹn" now displays without booking code suffix
- "Hóa đơn" now displays without invoice code suffix
- Appointment date/time now includes "Tạo vào lúc" with exact creation timestamp
- All changes are in src/components/features/cashier/customer-tabs.tsx
