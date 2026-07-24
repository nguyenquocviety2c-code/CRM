import { redirect } from "next/navigation";

export default function Home() {
  // The root `/` route is the customer-facing entry point. It redirects to
  // the "Đặt lịch" (booking kiosk) page where customers book appointments
  // WITHOUT logging in. Staff members log in via the "Đăng nhập" button on
  // that page → /login → on success they land on /cashier (the admin
  // dashboard with the sidebar).
  redirect("/dat-lich");
}
