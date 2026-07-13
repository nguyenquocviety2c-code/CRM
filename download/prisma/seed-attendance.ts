// Seed script: populate the CRM database with staff, shifts, and attendance
// data for the Worker Manager > Chấm công (Attendance) module.
//
// Run with:  DATABASE_URL="file:/home/z/CRM/prisma/dev.db" bun run prisma/seed-attendance.ts
//
// Idempotent: clears attendance + shifts, keeps existing users (from cashcard
// seed) and adds more staff.

import { PrismaClient } from "../src/generated/prisma/index.js";
import { PrismaLibSql } from "@prisma/adapter-libsql";

const adapter = new PrismaLibSql({
  url: process.env.DATABASE_URL || "file:/home/z/CRM/prisma/dev.db",
});
const db = new PrismaClient({ adapter });

function atDate(days: number, hours = 9, minutes = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

async function main() {
  console.log("🌱 Seeding attendance data...");

  await db.attendance.deleteMany({});
  await db.shift.deleteMany({});
  console.log("  ✓ Cleared attendance + shifts");

  // ---- Shifts ----
  const shiftDay = await db.shift.create({
    data: { name: "Ca ngày", startTime: "09:00", endTime: "17:00", active: true },
  });
  const shiftEvening = await db.shift.create({
    data: { name: "Ca chiều", startTime: "14:00", endTime: "22:00", active: true },
  });
  const shiftMorning = await db.shift.create({
    data: { name: "Ca sáng", startTime: "06:00", endTime: "14:00", active: true },
  });
  console.log("  ✓ Created 3 shifts");

  // ---- Staff users (add more beyond the 2 from cashcard seed) ----
  const existingUsers = await db.user.findMany();
  const staffSeeds = [
    { name: "Phạm Thành", email: "pham.thanh@easysalon.vn", phone: "0901112233" },
    { name: "Tuan Anh Nguyen", email: "tuananh.nguyen@easysalon.vn", phone: "0902223344" },
    { name: "Khương Phú Phương", email: "phuong.khuong@easysalon.vn", phone: "0903334455" },
    { name: "Nguyễn Thế Hải", email: "hai.nguyen@easysalon.vn", phone: "0904445566" },
    { name: "Doan Anh Tuan", email: "tuan.doan@easysalon.vn", phone: "0905556677" },
    { name: "Nguyen Trung Duc", email: "duc.nguyen@easysalon.vn", phone: "0906667788" },
    { name: "Nguyen Yen Ngoc", email: "ngoc.nguyen@easysalon.vn", phone: "0907778899" },
    { name: "Nguyen Tram Anh", email: "tramanh.nguyen@easysalon.vn", phone: "0908889900" },
    { name: "TEST tho", email: "test.tho@easysalon.vn", phone: "0909990011" },
  ];

  const staff = [...existingUsers];
  for (const s of staffSeeds) {
    // Skip if email already exists
    const existing = staff.find((u) => u.email === s.email);
    if (existing) continue;
    const u = await db.user.create({
      data: { name: s.name, email: s.email, phone: s.phone, password: "hashed", role: "staff", active: true },
    });
    staff.push(u);
  }
  console.log(`  ✓ ${staff.length} staff users available`);

  // ---- Attendance: generate for the current week (Mon-Sun) ----
  // Reference image shows week 23/06-29/06 with some employees having
  // "Ca ngày" + "Chưa chấm công" on past days.
  const today = new Date();
  // Find Monday of current week (week starts Monday)
  const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon...
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(today);
  monday.setDate(today.getDate() + mondayOffset);
  monday.setHours(0, 0, 0, 0);

  const weekDays: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    weekDays.push(d);
  }

  let attCount = 0;
  // Assign attendance for each staff across the week.
  // Pattern from reference image: some staff have "Ca ngày" + "Chưa chấm công"
  // (missing) on past days; future/weekend days are empty.
  const staffPatterns = [
    // staff index -> array of 7 statuses (Mon-Sun); null = no attendance record
    ["missing", "missing", "missing", null, null, null, null], // Phạm Thành
    ["missing", "missing", "missing", null, null, null, null], // Tuan Anh Nguyen
    [null, null, null, null, null, null, null], // Khương Phú Phương (all empty)
    ["missing", "missing", "missing", null, null, null, null], // Nguyễn Thế Hải
    [null, null, null, null, null, null, null], // Doan Anh Tuan
    [null, null, null, null, null, null, null], // Nguyen Trung Duc
    ["onTime", "late", "onTime", null, null, null, null], // Nguyen Yen Ngoc
    ["onTime", "onTime", "missing", null, null, null, null], // Nguyen Tram Anh
    ["late", "missing", "onTime", null, null, null, null], // TEST tho
  ];

  for (let sIdx = 0; sIdx < staffPatterns.length && sIdx < staff.length; sIdx++) {
    const user = staff[sIdx];
    const pattern = staffPatterns[sIdx];
    for (let dIdx = 0; dIdx < 7; dIdx++) {
      const status = pattern[dIdx];
      if (!status) continue; // no record for this day
      const dayDate = weekDays[dIdx];
      const isPast = dayDate < today;
      const isToday = dayDate.toDateString() === today.toDateString();

      // Only create attendance for past days (reference shows past days have
      // records; today/future are empty unless we want to show "missing" today).
      if (!isPast && !isToday) continue;

      let checkIn: Date | null = null;
      let checkOut: Date | null = null;
      let finalStatus = status;

      if (status === "onTime") {
        checkIn = atDate(dIdx - (7 - weekDays.length), 9, 0); // 9:00 that day
        // Adjust to actual day
        checkIn = new Date(dayDate);
        checkIn.setHours(9, 0, 0, 0);
        checkOut = new Date(dayDate);
        checkOut.setHours(17, 5, 0, 0);
      } else if (status === "late") {
        checkIn = new Date(dayDate);
        checkIn.setHours(9, 25, 0, 0);
        checkOut = new Date(dayDate);
        checkOut.setHours(17, 10, 0, 0);
        finalStatus = "late";
      } else if (status === "missing") {
        // Chưa chấm công: shift assigned but no check-in/out
        checkIn = null;
        checkOut = null;
        finalStatus = "missing";
      }

      try {
        await db.attendance.create({
          data: {
            userId: user.id,
            shiftId: shiftDay.id,
            date: dayDate,
            checkIn,
            checkOut,
            status: finalStatus,
          },
        });
        attCount++;
      } catch (e) {
        // Skip duplicate (unique constraint on userId+date)
      }
    }
  }
  console.log(`  ✓ Created ${attCount} attendance records for the current week`);

  // Also add a few attendance records earlier in the current month for the
  // overview (monthly summary) view to have data.
  let monthAttCount = 0;
  for (let weekBack = 1; weekBack <= 3; weekBack++) {
    for (let sIdx = 0; sIdx < staff.length; sIdx++) {
      const user = staff[sIdx];
      // 3 random days in that past week
      for (let d = 0; d < 3; d++) {
        const pastDate = new Date(monday);
        pastDate.setDate(monday.getDate() - weekBack * 7 + d * 2);
        if (pastDate >= today) continue;
        if (pastDate.getDay() === 0) continue; // skip Sunday

        const statuses = ["onTime", "onTime", "late", "onTime"];
        const st = statuses[(sIdx + d) % statuses.length];
        const checkIn = new Date(pastDate);
        checkIn.setHours(st === "late" ? 9 : 8, st === "late" ? 30 : 55, 0, 0);
        const checkOut = new Date(pastDate);
        checkOut.setHours(17, st === "late" ? 15 : 5, 0, 0);

        try {
          await db.attendance.create({
            data: {
              userId: user.id,
              shiftId: sIdx % 2 === 0 ? shiftDay.id : shiftMorning.id,
              date: pastDate,
              checkIn,
              checkOut,
              status: st,
            },
          });
          monthAttCount++;
        } catch (e) {
          // skip duplicates
        }
      }
    }
  }
  console.log(`  ✓ Created ${monthAttCount} additional attendance records for earlier weeks`);

  console.log("\n✅ Seed completed successfully!");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
