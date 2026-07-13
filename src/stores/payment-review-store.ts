import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

/**
 * Shared payment-review state — tracks which bookings are currently in the
 * "payment review" phase (staff pressed Thanh toán, awaiting Hoàn tất or Hủy).
 *
 * This state is SHARED across the Booking and Cashier modules so that pressing
 * Thanh toán in one module immediately reflects in the other:
 *   - Booking > invoice dialog > "Thanh toán" → sets reviewMode for that bookingId.
 *   - Cashier > invoice summary > "Thanh toán" → sets reviewMode for that tabId
 *     (which IS the bookingId for booking-type tabs).
 *   - "Hủy" in either module → clears reviewMode → both modules revert to
 *     unpaid-editable.
 *   - "Hoàn tất" in either module → clears reviewMode + the invoice becomes
 *     "paid" (status checkout) → both modules show the paid state.
 *
 * Persisted to sessionStorage so the review state survives page navigations
 * (e.g. switching from /cashier to /booking). sessionStorage is cleared when
 * the browser tab closes — no stale review state across sessions.
 */
interface PaymentReviewState {
  /** Array of bookingIds in payment-review mode (stored as array for JSON
   *  serialization; converted to Set in the getter). */
  reviewList: string[];

  /** Enter payment-review mode for a booking. */
  enterReview: (bookingId: string) => void;
  /** Exit payment-review mode for a booking (Hủy or Hoàn tất). */
  exitReview: (bookingId: string) => void;
}

export const usePaymentReviewStore = create<PaymentReviewState>()(
  persist(
    (set) => ({
      reviewList: [],

      enterReview: (bookingId: string) => {
        set((state) => {
          if (state.reviewList.includes(bookingId)) return state;
          return { reviewList: [...state.reviewList, bookingId] };
        });
      },

      exitReview: (bookingId: string) => {
        set((state) => ({
          reviewList: state.reviewList.filter((id) => id !== bookingId),
        }));
      },
    }),
    {
      name: "payment-review",
      storage: createJSONStorage(() => sessionStorage),
    }
  )
);

/** Convenience hook: check if a booking is in review mode. */
export function useIsReviewing(bookingId: string): boolean {
  return usePaymentReviewStore((s) => s.reviewList.includes(bookingId));
}
