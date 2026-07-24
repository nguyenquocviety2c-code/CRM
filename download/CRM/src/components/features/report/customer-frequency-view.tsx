"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
// import { Button } from "@/components/ui/button";
import {
  useReportCustomerStore,
  useCustomerFrequencyData,
} from "@/stores/report-customer-store";
import { formatVND } from "@/lib/report-customer-utils";
// import { FrequencyUnit } from "@/types/report-customer";

export function CustomerFrequencyView() {
  const { frequencyUnit, setFrequencyUnit } = useReportCustomerStore();
  const { data, total, chartData } = useCustomerFrequencyData();

  return (
    <div className="space-y-6">
      {/* Toggle Giờ/Ngày */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-600">Tần suất</span>
        <div className="flex border rounded overflow-hidden">
          <button
            onClick={() => setFrequencyUnit("hour")}
            className={`px-3 py-1.5 text-sm font-medium transition-colors ${
              frequencyUnit === "hour"
                ? "bg-blue-600 text-white"
                : "bg-white text-gray-700 hover:bg-gray-50"
            }`}
          >
            Giờ
          </button>
          <button
            onClick={() => setFrequencyUnit("day")}
            className={`px-3 py-1.5 text-sm font-medium transition-colors ${
              frequencyUnit === "day"
                ? "bg-blue-600 text-white"
                : "bg-white text-gray-700 hover:bg-gray-50"
            }`}
          >
            Ngày
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border rounded-lg p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wide">
            THEO SỐ LƯỢNG
          </div>
          <div className="mt-1 text-2xl font-bold text-slate-900">
            {total.customerCount}
          </div>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wide">
            THEO DOANH THU
          </div>
          <div className="mt-1 text-2xl font-bold text-slate-900">
            {formatVND(total.revenue)}
          </div>
        </div>
      </div>

      {/* Bar Chart */}
      <div className="bg-white border rounded-lg p-4">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="day" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip
              formatter={(value) => [String(value), "Khách"]}
              labelStyle={{ fontSize: 12 }}
            />
            <Bar dataKey="customers" fill="#3b82f6" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-700">
                Ngày trong tuần
              </th>
              <th className="px-4 py-3 text-center font-medium text-gray-700">
                Lượng khách
              </th>
              <th className="px-4 py-3 text-right font-medium text-gray-700">
                Doanh thu
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {data.map((item) => (
              <tr key={item.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">{item.dayOfWeek}</td>
                <td className="px-4 py-3 text-center">{item.customerCount}</td>
                <td className="px-4 py-3 text-right">
                  {formatVND(item.revenue)}
                </td>
              </tr>
            ))}
            {/* Footer TỔNG CỘNG */}
            <tr className="bg-gray-50 font-medium">
              <td className="px-4 py-3">TỔNG CỘNG</td>
              <td className="px-4 py-3 text-center">{total.customerCount}</td>
              <td className="px-4 py-3 text-right">{formatVND(total.revenue)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
