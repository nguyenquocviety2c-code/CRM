export const queryKeys = {
  customers: {
    all: ["customers"] as const,
    list: (filters?: Record<string, unknown>) => ["customers", "list", filters] as const,
    detail: (id: string) => ["customers", "detail", id] as const,
    byPhone: (phone: string) => ["customers", "byPhone", phone] as const,
  },
  invoices: {
    all: ["invoices"] as const,
    list: (filters?: Record<string, unknown>) => ["invoices", "list", filters] as const,
    detail: (id: string) => ["invoices", "detail", id] as const,
  },
  bookings: {
    all: ["bookings"] as const,
    list: (filters?: Record<string, unknown>) => ["bookings", "list", filters] as const,
    detail: (id: string) => ["bookings", "detail", id] as const,
  },
  products: {
    all: ["products"] as const,
    list: (filters?: Record<string, unknown>) => ["products", "list", filters] as const,
    detail: (id: string) => ["products", "detail", id] as const,
  },
  productCategories: {
    all: ["productCategories"] as const,
    list: (filters?: Record<string, unknown>) => ["productCategories", "list", filters] as const,
    detail: (id: string) => ["productCategories", "detail", id] as const,
  },
  services: {
    all: ["services"] as const,
    list: (filters?: Record<string, unknown>) => ["services", "list", filters] as const,
    detail: (id: string) => ["services", "detail", id] as const,
  },
  packages: {
    all: ["packages"] as const,
    list: (filters?: Record<string, unknown>) => ["packages", "list", filters] as const,
    detail: (id: string) => ["packages", "detail", id] as const,
    report: {
      all: ["packages", "report"] as const,
      list: (filters?: Record<string, unknown>) => ["packages", "report", "list", filters] as const,
    },
  },
  cashcards: {
    all: ["cashcards"] as const,
    list: (filters?: Record<string, unknown>) => ["cashcards", "list", filters] as const,
    detail: (id: string) => ["cashcards", "detail", id] as const,
    report: {
      all: ["cashcards", "report"] as const,
      list: (filters?: Record<string, unknown>) => ["cashcards", "report", "list", filters] as const,
    },
  },
  transactions: {
    all: ["transactions"] as const,
    list: (filters?: Record<string, unknown>) => ["transactions", "list", filters] as const,
  },
  cashFund: {
    all: ["cashFund"] as const,
    settings: (branchId: string | null) => ["cashFund", "settings", branchId ?? "all"] as const,
    histories: (branchId: string | null) => ["cashFund", "histories", branchId ?? "all"] as const,
    transactions: (branchId: string | null) => ["cashFund", "transactions", branchId ?? "all"] as const,
    categories: ["cashFund", "categories"] as const,
  },
  revenueVoucher: {
    all: ["revenueVoucher"] as const,
    vouchers: (branchId: string | null) => ["revenueVoucher", "vouchers", branchId ?? "all"] as const,
    categories: ["revenueVoucher", "categories"] as const,
  },
  expenditureVoucher: {
    all: ["expenditureVoucher"] as const,
    vouchers: (branchId: string | null) => ["expenditureVoucher", "vouchers", branchId ?? "all"] as const,
    categories: ["expenditureVoucher", "categories"] as const,
  },
  debt: {
    all: ["debt"] as const,
    debts: (branchId: string | null) => ["debt", "debts", branchId ?? "all"] as const,
    invoices: (branchId: string | null) => ["debt", "invoices", branchId ?? "all"] as const,
  },
  reports: {
    all: ["reports"] as const,
    revenue: (filters?: Record<string, unknown>) => ["reports", "revenue", filters] as const,
  },
  attendance: {
    all: ["attendance"] as const,
    list: (filters?: Record<string, unknown>) => ["attendance", "list", filters] as const,
    report: {
      all: ["attendance", "report"] as const,
      list: (filters?: Record<string, unknown>) => ["attendance", "report", "list", filters] as const,
    },
  },
  settings: {
    all: ["settings"] as const,
    section: (section: string) => ["settings", section] as const,
  },
  cashcardSettings: {
    all: ["cashcardSettings"] as const,
    bonus: {
      all: ["cashcardSettings", "bonus"] as const,
      list: (filters?: Record<string, unknown>) => ["cashcardSettings", "bonus", "list", filters] as const,
    },
    expiry: {
      all: ["cashcardSettings", "expiry"] as const,
    },
  },
  customerCare: {
    all: ["customerCare"] as const,
    customerSets: {
      all: ["customerCare", "customerSets"] as const,
      list: (filters?: Record<string, unknown>) => ["customerCare", "customerSets", "list", filters] as const,
      detail: (id: string) => ["customerCare", "customerSets", "detail", id] as const,
    },
    feedback: {
      all: ["customerCare", "feedback"] as const,
      list: (filters?: Record<string, unknown>) => ["customerCare", "feedback", "list", filters] as const,
    },
    incentives: {
      all: ["customerCare", "incentives"] as const,
      list: (filters?: Record<string, unknown>) => ["customerCare", "incentives", "list", filters] as const,
      detail: (id: string) => ["customerCare", "incentives", "detail", id] as const,
    },
    vouchers: {
      all: ["customerCare", "vouchers"] as const,
      list: (filters?: Record<string, unknown>) => ["customerCare", "vouchers", "list", filters] as const,
    },
  },
  warehouse: {
    all: ["warehouse"] as const,
    list: (filters?: Record<string, unknown>) => ["warehouse", "list", filters] as const,
    transfer: {
      all: ["warehouse", "transfer"] as const,
      list: (filters?: Record<string, unknown>) => ["warehouse", "transfer", "list", filters] as const,
    },
    export: {
      all: ["warehouse", "export"] as const,
      list: (filters?: Record<string, unknown>) => ["warehouse", "export", "list", filters] as const,
    },
    import: {
      all: ["warehouse", "import"] as const,
      list: (filters?: Record<string, unknown>) => ["warehouse", "import", "list", filters] as const,
    },
    settings: {
      all: ["warehouse", "settings"] as const,
    },
    report: {
      all: ["warehouse", "report"] as const,
      list: (filters?: Record<string, unknown>) => ["warehouse", "report", "list", filters] as const,
    },
  },
};
