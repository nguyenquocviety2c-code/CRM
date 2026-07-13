import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Customer } from "@/stores/customer-store";
import { useAuthStore } from "@/stores/auth-store";
import { maskPhone } from "@/lib/phone-mask";

export interface ColumnDef<T> {
  key: string;
  header: string;
  render: (item: T) => React.ReactNode;
  className?: string;
}

export function getCustomerColumns(actions: {
  onEdit: (customer: Customer) => void;
  onDelete?: (customer: Customer) => void;
  onViewHistory?: (customer: Customer) => void;
}): ColumnDef<Customer>[] {
  return [
    {
      key: "code",
      header: "Mã",
      render: (customer) => (
        <span className="font-medium text-emerald-600">{customer.code}</span>
      ),
    },
    {
      key: "name",
      header: "Họ tên & ghi chú",
      render: (customer) => (
        <div>
          <div className="font-medium">{customer.name}</div>
          {customer.note && (
            <div className="text-xs text-gray-500">{customer.note}</div>
          )}
        </div>
      ),
    },
    {
      key: "phone",
      header: "Điện thoại",
      render: (customer) => {
        const canView = useAuthStore.getState().hasPermission("view_customer_phone");
        return <span>{canView ? (customer.phone || "—") : maskPhone(customer.phone)}</span>;
      },
    },
    {
      key: "group",
      header: "Nhóm",
      render: (customer) => {
        // "Khách cũ" = has at least one COMPLETED invoice that contains a
        // SERVICE item (type === "service"). Invoices with only products do
        // NOT qualify — per the business rule: "khách cũ = đã làm dịch vụ
        // và thanh toán". Both `customer_type` and `has_completed_invoice`
        // are set by the customers API (which decodes invoice items to check
        // for service-type items); we check both for resilience.
        const isOld =
          customer.customer_type === "old" ||
          customer.has_completed_invoice === true;
        return (
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
              isOld
                ? "bg-emerald-100 text-emerald-700"
                : "bg-amber-100 text-amber-700"
            }`}
          >
            {isOld ? "Khách cũ" : "Khách mới"}
          </span>
        );
      },
    },
    {
      key: "source",
      header: "Nguồn KH",
      render: (customer) => (
        <span className="text-sm">{customer.source?.name || "—"}</span>
      ),
    },
    {
      key: "channel",
      header: "Kênh liên lạc",
      render: (customer) => (
        <span className="text-sm">{customer.channel?.name || "—"}</span>
      ),
    },
    {
      key: "careHistory",
      header: "Lịch sử chăm sóc",
      render: (customer) => (
        <button
          className="text-emerald-600 hover:text-emerald-700 hover:underline text-sm"
          onClick={() => actions.onViewHistory?.(customer)}
        >
          Xem lịch sử
        </button>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (customer) => (
        <div className="flex items-center justify-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => actions.onEdit(customer)}
            className="h-8 w-8 p-0 text-gray-500 hover:text-emerald-600"
          >
            <Pencil className="h-4 w-4" />
          </Button>
        </div>
      ),
      className: "text-center",
    },
  ];
}
