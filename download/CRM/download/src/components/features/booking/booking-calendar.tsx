"use client";

import { Booking } from "@/stores/booking-store";

interface BookingCalendarProps {
  bookings: Booking[];
  viewMode: "week" | "month";
  currentDate: Date;
  filterStaffId: string | null;
  onBookingClick: (booking: Booking) => void;
}

export function BookingCalendar({
  bookings,
  viewMode,
  currentDate,
  filterStaffId,
  onBookingClick,
}: BookingCalendarProps) {
  const filteredBookings = filterStaffId
    ? bookings.filter((b) => b.services.some((s) => s.staffId === filterStaffId))
    : bookings;

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":
        return "bg-amber-100 text-amber-800 border-amber-200";
      case "confirmed":
        return "bg-sky-100 text-sky-800 border-sky-200";
      case "done":
        return "bg-emerald-100 text-emerald-800 border-emerald-200";
      case "cancelled":
        return "bg-red-100 text-red-800 border-red-200 line-through";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  const getWeekDates = (date: Date) => {
    const start = new Date(date);
    const day = start.getDay();
    const diff = start.getDate() - day + (day === 0 ? -6 : 1);
    start.setDate(diff);
    start.setHours(0, 0, 0, 0);

    const dates = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      dates.push(d);
    }
    return dates;
  };

  const getBookingsForSlot = (date: Date, timeSlot: string) => {
    return filteredBookings.filter((booking) => {
      const [day, month, year] = booking.date.split("/").map(Number);
      const bookingDate = new Date(year, month - 1, day);
      return (
        bookingDate.getDate() === date.getDate() &&
        bookingDate.getMonth() === date.getMonth() &&
        bookingDate.getFullYear() === date.getFullYear() &&
        booking.time === timeSlot
      );
    });
  };

  // Time slots (8:00 - 20:00, 30min intervals)
  const timeSlots: string[] = [];
  for (let hour = 8; hour <= 20; hour++) {
    timeSlots.push(`${hour.toString().padStart(2, "0")}:00`);
    if (hour < 20) {
      timeSlots.push(`${hour.toString().padStart(2, "0")}:30`);
    }
  }

  const weekDates = getWeekDates(currentDate);

  const weekDays = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

  if (viewMode === "month") {
    // Month view: simple grid showing bookings per day
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startDayOfWeek = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;

    const days: (number | null)[] = [];
    for (let i = 0; i < startDayOfWeek; i++) {
      days.push(null);
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(i);
    }

    return (
      <div className="flex-1 overflow-auto rounded-lg border bg-white">
        <div className="grid grid-cols-7 border-b bg-gray-50">
          {weekDays.map((day, i) => (
            <div key={i} className="border-r p-3 text-center text-sm font-medium text-gray-700">
              {day}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((day, i) => (
            <div
              key={i}
              className="min-h-[100px] border-r border-b p-2"
            >
              {day && (
                <>
                  <div className="text-sm font-medium text-gray-700 mb-1">{day}</div>
                  <div className="space-y-1">
                      {filteredBookings
                      .filter((b) => {
                        const [d, m, y] = b.date.split("/").map(Number);
                        const bDate = new Date(y, m - 1, d);
                        return (
                          bDate.getDate() === day &&
                          bDate.getMonth() === month &&
                          bDate.getFullYear() === year
                        );
                      })
                      .map((booking) => (
                        <div
                          key={booking.id}
                          onClick={() => onBookingClick(booking)}
                          className={`cursor-pointer rounded border p-1 text-xs ${getStatusColor(booking.status)}`}
                        >
                          <div className="font-medium truncate">{booking.customer.name}</div>
                          <div className="truncate text-gray-600">
                            {booking.services.map((s) => s.serviceId).join(", ")}
                          </div>
                        </div>
                      ))}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Week view
  return (
    <div className="flex-1 overflow-auto rounded-lg border bg-white">
      <div className="min-w-[800px]">
        {/* Header Row */}
        <div className="grid grid-cols-8 border-b bg-gray-50">
          <div className="border-r p-3 text-center text-sm font-medium text-gray-500">
            Giờ
          </div>
          {weekDates.map((date, i) => (
            <div
              key={i}
              className="border-r p-3 text-center text-sm font-medium text-gray-700"
            >
              <div className="text-xs text-gray-500">{weekDays[i]}</div>
              <div>{date.getDate()}</div>
            </div>
          ))}
        </div>

        {/* Time Slots */}
        {timeSlots.map((timeSlot) => (
          <div key={timeSlot} className="grid grid-cols-8 border-b">
            <div className="border-r p-2 text-center text-xs text-gray-500">
              {timeSlot}
            </div>
            {weekDates.map((date, dayIndex) => {
              const slotBookings = getBookingsForSlot(date, timeSlot);
              return (
                <div
                  key={dayIndex}
                  className="min-h-[60px] border-r p-1"
                >
                  {slotBookings.map((booking) => (
                    <div
                      key={booking.id}
                      onClick={() => onBookingClick(booking)}
                      className={`cursor-pointer mb-1 rounded border p-1.5 text-xs ${getStatusColor(
                        booking.status
                      )}`}
                    >
                      <div className="font-medium truncate">
                        {booking.customer.name}
                      </div>
                      <div className="truncate text-gray-600">
                        {booking.services.map((s) => s.serviceId).join(", ")}
                      </div>
                      <div className="truncate text-gray-500">
                        {booking.services.length > 0 ? "Đã xếp" : "Chưa xếp"}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}