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
        <button
          type="button"
          onClick={() => actions.onViewHistory?.(customer)}
          className="font-medium text-emerald-600 hover:text-emerald-700 hover:underline cursor-pointer"
          title="Xem lịch sử khách hàng"
        >
          {customer.code}
        </button>
      ),
    },
    {
      key: "name",
      header: "Họ tên",
      render: (customer) => (
        <div>
          <button
            type="button"
            onClick={() => actions.onViewHistory?.(customer)}
            className="font-medium text-emerald-600 hover:text-emerald-700 hover:underline cursor-pointer text-left"
            title="Xem lịch sử khách hàng"
          >
            {customer.name}
          </button>
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
    {
      key: "history",
      header: "Lịch sử",
      render: (customer) => (
        <button
          type="button"
          onClick={() => actions.onViewHistory?.(customer)}
          className="text-sm font-medium text-emerald-600 hover:text-emerald-700 hover:underline cursor-pointer"
          title="Xem lịch sử khách hàng"
        >
          Xem lịch sử
        </button>
      ),
      className: "text-center",
    },
  ];
}
