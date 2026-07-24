import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type ItemType = "service" | "product" | "package";

export interface InvoiceItem {
  id: string;
  itemId: string;
  name: string;
  type: ItemType;
  price: number;
  quantity: number;
  discount: number;
  // Discount unit: "VND" (đ — fixed amount subtracted directly) or
  // "PERCENT" (% — percentage of price*quantity). Defaults to "VND" for
  // backward compatibility (existing items / persisted tabs have no field).
  discountType?: "VND" | "PERCENT";
  total: number;
  staffName?: string;
  date?: string; // "DD/MM/YYYY" — when the service is scheduled
  time?: string; // "HH:MM" — when the service is scheduled
}

/**
 * Compute the effective discount AMOUNT (in VND) for an invoice item,
 * resolving its discount type. "VND" → the discount value IS the amount;
 * "PERCENT" → discount% of (price * quantity). Kept here so both the store
 * (when updating totals) and the UI (when displaying) share one source of
 * truth — avoiding rounding mismatches.
 */
export function resolveDiscountAmount(item: {
  price: number;
  quantity: number;
  discount: number;
  discountType?: "VND" | "PERCENT";
}): number {
  const base = item.price * item.quantity;
  if (item.discountType === "PERCENT") {
    const pct = Math.max(0, Math.min(100, Number(item.discount) || 0));
    return Math.round((base * pct) / 100);
  }
  // "VND" (default) — direct amount, clamped to [0, base].
  return Math.max(0, Math.min(base, Number(item.discount) || 0));
}

// Metadata for a customer tab opened from the "Thêm khách hàng" dropdown.
// Tracks whether the tab is a walk-in / new / old draft (booking not yet
// created in Supabase) or an existing booking tab. The booking is created
// lazily — only when the cashier adds a service (with staff + date + time)
// to a draft tab.
export interface TabMeta {
  type: "walkin" | "new" | "old" | "booking";
  // Real "Khách cũ" status for this tab's customer, fetched from the API
  // ("old" = has a completed invoice OR belongs to a customer group whose
  // name contains "khách cũ"). Drives service-category filtering in the
  // ServiceSelector so "Dành cho khách hàng mới - DV Cắt" is hidden for
  // Khách cũ and "Dịch Vụ Cắt" is hidden for everyone else. Undefined until
  // the fetch resolves; the filter falls back to the `type` heuristic.
  customerType?: "old" | "new";
  // For "new": the customer info entered in the dialog (created on first add).
  // For "old": best-effort source/channel pre-fill from the existing customer.
  customerInfo?: {
    name?: string;
    phone?: string;
    sourceId?: string;
    channelId?: string;
    numberOfCustomers?: number;
    note?: string;
  };
  // Real customer id (for "old", or after creating one for "new"/"walkin").
  customerId?: string;
  // Set to true once a booking has been created for this tab so subsequent
  // service adds don't create another booking.
  bookingCreated?: boolean;
  // The booking code (e.g. "LH000012") once the booking is created — shown in
  // the tab bar / customer info so the cashier can confirm the Lịch hẹn entry.
  bookingCode?: string;
  // The booking ID on Supabase — used to PUT (add services) when the gap
  // between services is ≤ 15 minutes (same booking).
  bookingId?: string;
  // The invoice ID on Supabase — set when a tab is opened from a standalone
  // (product-only) invoice so the InvoiceSummary can load its saved items /
  // status. Also set after a product-only checkout so the tab stays linked to
  // the created invoice.
  invoiceId?: string;
  // End time (epoch ms) of the last service added to the current booking.
  // Used to calculate the gap when adding a new service: if the new service's
  // start time is within 15 min of this, it joins the same booking.
  lastServiceEndMs?: number;
  // Start time (epoch ms) of the last service added to the current booking.
  // PARALLEL model: all services in a booking start at the SAME time (each
  // runs on a different staff, simultaneously). When adding a 2nd service,
  // the cashier dialog defaults the time to THIS (the 1st service's start),
  // NOT the 1st service's end — so the 2nd service runs in parallel. The
  // gap check also uses this as the reference (|newStart - bookingStart| ≤
  // 15 min → same booking). Matches the booking module's parallel model.
  lastServiceStartMs?: number;
  // The services array for the current booking (mirrors what's on Supabase).
  // Appended to when a service joins the same booking; reset when a new
  // booking is created. Sent as-is in the PUT to keep the booking in sync.
  bookingServices?: Array<{
    service_id: string;
    staff_id: string;
    service_category_id?: string | null;
  }>;
  // Set to true after the tab's invoice is paid (Hoàn tất) or cancelled
  // (Hủy thanh toán). Persisted in the store so the status survives page
  // navigation (switching to Lịch hẹn and back). Without this, the component
  // remounts and loses its local state, causing the buttons to reappear.
  paid?: boolean;
  cancelled?: boolean;
}

export interface CustomerTab {
  customerId: string;
  customerName: string;
  phone: string;
  invoiceCode?: string;
}

export interface InvoiceData {
  items: InvoiceItem[];
  voucherCode: string;
  discountAmount: number;
  tipAmount: number; // tiền khách thưởng cho thợ
}

interface CashierState {
  activeCustomers: CustomerTab[];
  activeTabId: string | null;
  invoices: Record<string, InvoiceData>;
  // Per-tab draft metadata (walk-in / new / old / booking). Keyed by tabId
  // (which equals the customerId passed to openCustomerTab).
  tabMeta: Record<string, TabMeta>;

  openCustomerTab: (customer: CustomerTab) => void;
  closeCustomerTab: (customerId: string) => void;
  // Update an existing tab's customer info (name/phone/code) in-place, keyed
  // by the tab id. Used when a walk-in tab selects an existing customer via
  // search or creates a new one via the "Thêm khách mới" dialog — the tab id
  // (e.g. "walkin-xxx") stays the same, but the displayed name/phone update.
  updateCustomerTab: (
    tabId: string,
    patch: Partial<Omit<CustomerTab, "customerId">>
  ) => void;
  setActiveTab: (customerId: string) => void;
  addInvoiceItem: (customerId: string, item: InvoiceItem) => void;
  updateInvoiceItemQuantity: (customerId: string, itemId: string, quantity: number) => void;
  /**
   * Update a line item's discount value AND unit ("VND" | "PERCENT"). Recomputes
   * the item's `total` so subtotal/total stay correct. Used by the cashier's
   * per-item discount input (number + đ/% selector).
   */
  updateInvoiceItemDiscount: (
    customerId: string,
    itemId: string,
    discount: number,
    discountType: "VND" | "PERCENT"
  ) => void;
  removeInvoiceItem: (customerId: string, itemId: string) => void;
  /**
   * Replace ALL service-type line items with the given list (keeps product
   * items, discount, tip, voucher). Used when opening a booking tab so the
   * invoice's services always mirror the booking's current services — even if
   * the persisted state was corrupted by an older code version (e.g. 2
   * same-id services with different staff merged into 1 line with quantity 2).
   * Each entry in `serviceItems` becomes its own line (NO quantity-merge).
   */
  replaceServiceItems: (
    customerId: string,
    serviceItems: InvoiceItem[]
  ) => void;
  /**
   * Set/clear the advisory staff name on a line item. Used by the cashier's
   * "Xếp nhân viên" button to record which staff advised/sold a PRODUCT item
   * (services get their staff assigned via the booking dialog). Pass "" to
   * clear. Only updates staffName — does NOT recompute total (staff doesn't
   * affect pricing).
   */
  setInvoiceItemStaff: (
    customerId: string,
    itemId: string,
    staffName: string
  ) => void;
  setVoucherCode: (customerId: string, code: string) => void;
  setDiscountAmount: (customerId: string, amount: number) => void;
  setTipAmount: (customerId: string, amount: number) => void;
  getInvoiceTotal: (customerId: string) => number;
  getSubtotal: (customerId: string) => number;
  getTipAmount: (customerId: string) => number;
  setTabMeta: (tabId: string, meta: TabMeta) => void;
  updateTabMeta: (tabId: string, patch: Partial<TabMeta>) => void;
}

export const useCashierStore = create<CashierState>()(
  persist(
    (set, get) => ({
  activeCustomers: [],
  activeTabId: null,
  invoices: {},
  tabMeta: {},

  openCustomerTab: (customer) => {
    set((state) => {
      const exists = state.activeCustomers.find(
        (c) => c.customerId === customer.customerId
      );
      if (exists) {
        return { activeTabId: customer.customerId };
      }
      return {
        activeCustomers: [...state.activeCustomers, customer],
        activeTabId: customer.customerId,
        invoices: {
          ...state.invoices,
          [customer.customerId]: {
            items: [],
            voucherCode: "",
            discountAmount: 0,
            tipAmount: 0,
          },
        },
      };
    });
  },

  closeCustomerTab: (customerId) => {
    set((state) => {
      const newCustomers = state.activeCustomers.filter(
        (c) => c.customerId !== customerId
      );
      const newInvoices = { ...state.invoices };
      delete newInvoices[customerId];
      const newTabMeta = { ...state.tabMeta };
      delete newTabMeta[customerId];
      return {
        activeCustomers: newCustomers,
        activeTabId:
          state.activeTabId === customerId
            ? newCustomers[0]?.customerId || null
            : state.activeTabId,
        invoices: newInvoices,
        tabMeta: newTabMeta,
      };
    });
  },

  updateCustomerTab: (tabId, patch) => {
    set((state) => ({
      activeCustomers: state.activeCustomers.map((c) =>
        c.customerId === tabId ? { ...c, ...patch } : c
      ),
    }));
  },

  setActiveTab: (customerId) => {
    set({ activeTabId: customerId });
  },

  addInvoiceItem: (customerId, item) => {
    set((state) => {
      const invoice = state.invoices[customerId] || {
        items: [],
        voucherCode: "",
        discountAmount: 0,
        tipAmount: 0,
      };
      // Identity = (itemId, staffName). Two services with the same id but
      // DIFFERENT advisory staff (e.g. "Master Cut" by Nguyễn Trường Đan AND
      // by Nguyễn Thế Mạnh in one booking) are DISTINCT line items, NOT a
      // quantity-merge. Two identical (itemId + staffName) merge → quantity+1.
      const existingIndex = invoice.items.findIndex(
        (i) => i.itemId === item.itemId && (i.staffName || "") === (item.staffName || "")
      );
      let newItems: InvoiceItem[];
      if (existingIndex >= 0) {
        newItems = [...invoice.items];
        const updated = {
          ...newItems[existingIndex],
          quantity: newItems[existingIndex].quantity + 1,
        };
        // Recompute total using the (possibly percent) discount.
        updated.total =
          updated.price * updated.quantity -
          resolveDiscountAmount(updated);
        newItems[existingIndex] = updated;
      } else {
        // New item: ensure its total reflects its discount type (the caller
        // may have set discount + discountType). Default total calc if the
        // caller didn't precompute it correctly.
        const newItem: InvoiceItem = { ...item };
        newItem.total =
          newItem.price * newItem.quantity - resolveDiscountAmount(newItem);
        newItems = [...invoice.items, newItem];
      }
      return {
        invoices: {
          ...state.invoices,
          [customerId]: {
            ...invoice,
            items: newItems,
          },
        },
      };
    });
  },

  updateInvoiceItemQuantity: (customerId, itemId, quantity) => {
    set((state) => {
      const invoice = state.invoices[customerId];
      if (!invoice) return state;
      const newItems = invoice.items
        .map((item) => {
          if (item.id === itemId) {
            if (quantity <= 0) return null;
            const updated = { ...item, quantity };
            // Recompute total using the (possibly percent) discount.
            updated.total =
              updated.price * updated.quantity -
              resolveDiscountAmount(updated);
            return updated;
          }
          return item;
        })
        .filter((item): item is InvoiceItem => item !== null);
      return {
        invoices: {
          ...state.invoices,
          [customerId]: {
            ...invoice,
            items: newItems,
          },
        },
      };
    });
  },

  updateInvoiceItemDiscount: (customerId, itemId, discount, discountType) => {
    set((state) => {
      const invoice = state.invoices[customerId];
      if (!invoice) return state;
      const newItems = invoice.items.map((item) => {
        if (item.id !== itemId) return item;
        const updated: InvoiceItem = {
          ...item,
          discount: Math.max(0, Number(discount) || 0),
          discountType,
        };
        // Recompute total: VND → subtract directly; PERCENT → subtract
        // discount% of (price * quantity).
        updated.total =
          updated.price * updated.quantity -
          resolveDiscountAmount(updated);
        return updated;
      });
      return {
        invoices: {
          ...state.invoices,
          [customerId]: {
            ...invoice,
            items: newItems,
          },
        },
      };
    });
  },

  removeInvoiceItem: (customerId, itemId) => {
    set((state) => {
      const invoice = state.invoices[customerId];
      if (!invoice) return state;
      return {
        invoices: {
          ...state.invoices,
          [customerId]: {
            ...invoice,
            items: invoice.items.filter((item) => item.id !== itemId),
          },
        },
      };
    });
  },

  replaceServiceItems: (customerId, serviceItems) => {
    set((state) => {
      const invoice = state.invoices[customerId] || {
        items: [],
        voucherCode: "",
        discountAmount: 0,
        tipAmount: 0,
      };
      // Keep only PRODUCT items (cashier-added products); drop all service
      // items and append the fresh service list from the booking. Each service
      // gets its own line — NO quantity-merge (so 2 same-id services with
      // different staff = 2 lines).
      const productItems = invoice.items.filter((it) => it.type !== "service");
      return {
        invoices: {
          ...state.invoices,
          [customerId]: {
            ...invoice,
            items: [...productItems, ...serviceItems],
          },
        },
      };
    });
  },

  setInvoiceItemStaff: (customerId, itemId, staffName) => {
    set((state) => {
      const invoice = state.invoices[customerId];
      if (!invoice) return state;
      return {
        invoices: {
          ...state.invoices,
          [customerId]: {
            ...invoice,
            // Update staffName on the matching item only; leave price/qty/
            // discount/total untouched (staff doesn't affect pricing).
            items: invoice.items.map((item) =>
              item.id === itemId
                ? { ...item, staffName: staffName || undefined }
                : item
            ),
          },
        },
      };
    });
  },

  setVoucherCode: (customerId, code) => {
    set((state) => {
      const invoice = state.invoices[customerId];
      if (!invoice) return state;
      return {
        invoices: {
          ...state.invoices,
          [customerId]: {
            ...invoice,
            voucherCode: code,
          },
        },
      };
    });
  },

  setDiscountAmount: (customerId, amount) => {
    set((state) => {
      const invoice = state.invoices[customerId];
      if (!invoice) return state;
      return {
        invoices: {
          ...state.invoices,
          [customerId]: {
            ...invoice,
            discountAmount: amount,
          },
        },
      };
    });
  },

  setTipAmount: (customerId, amount) => {
    set((state) => {
      const invoice = state.invoices[customerId];
      if (!invoice) return state;
      return {
        invoices: {
          ...state.invoices,
          [customerId]: {
            ...invoice,
            tipAmount: Math.max(0, amount),
          },
        },
      };
    });
  },

  getTipAmount: (customerId: string) => {
    const invoice = get().invoices[customerId];
    if (!invoice) return 0;
    return invoice.tipAmount || 0;
  },

  getSubtotal: (customerId: string) => {
    const invoice = get().invoices[customerId];
    if (!invoice) return 0;
    // Sum each line's `total` (price*qty − per-line discount, already
    // recomputed in updateInvoiceItemDiscount / addInvoiceItem) so the
    // footer "Thành tiền" row equals the sum of the "Thành tiền" column
    // and reflects per-item discounts LIVE as the cashier types them.
    return invoice.items.reduce((sum, item) => sum + item.total, 0);
  },

  getInvoiceTotal: (customerId: string) => {
    const invoice = get().invoices[customerId];
    if (!invoice) return 0;
    // Net items = sum of per-line totals (already net of per-item discounts).
    const netItems = invoice.items.reduce(
      (sum, item) => sum + item.total,
      0
    );
    // Total = (net items − invoice-level discount) + tip. Both per-item
    // discounts (via item.total) and the invoice-level discount are applied.
    // The tip is a customer-paid bonus for the staff, ADDED on top.
    return Math.max(0, netItems - invoice.discountAmount) + (invoice.tipAmount || 0);
  },

  setTabMeta: (tabId, meta) => {
    set((state) => ({
      tabMeta: { ...state.tabMeta, [tabId]: meta },
    }));
  },

  updateTabMeta: (tabId, patch) => {
    set((state) => {
      const existing = state.tabMeta[tabId];
      if (!existing) return state;
      return {
        tabMeta: { ...state.tabMeta, [tabId]: { ...existing, ...patch } },
      };
    });
  },
    }),
    {
      name: "cashier-store",
      storage: createJSONStorage(() => localStorage),
    }
  )
);