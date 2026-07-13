// Seed script: populate the CRM database with cash card data for the
// "THẺ TIỀN MẶT" report (usage history + top-up history).
//
// Run with:  DATABASE_URL="file:/home/z/CRM/prisma/dev.db" bun run prisma/seed-cashcard.ts
//
// Idempotent: clears cash-card tables first, then re-inserts. Does NOT touch
// branches / products / warehouse data seeded by seed-warehouse.ts.

import { PrismaClient } from "../src/generated/prisma/index.js";
import { PrismaLibSql } from "@prisma/adapter-libsql";

const adapter = new PrismaLibSql({
  url: process.env.DATABASE_URL || "file:/home/z/CRM/prisma/dev.db",
});
const db = new PrismaClient({ adapter });

function when(days: number, hours = 0, minutes = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

async function main() {
  console.log("🌱 Seeding cash card report data...");

  // ---- Clean cash-card tables (order matters for FK cascades) ----
  await db.cashCardTransaction.deleteMany({});
  await db.cashCardTopup.deleteMany({});
  await db.cashCard.deleteMany({});
  await db.customer.deleteMany({});
  await db.user.deleteMany({});
  console.log("  ✓ Cleared existing cash-card / customer / user data");

  // ---- Users (staff who record topups / transactions) ----
  const staff1 = await db.user.create({
    data: {
      email: "TN.LV1.VB@gmail.com",
      name: "Lễ Tân Văn Bảo",
      password: "hashed",
      role: "staff",
      active: true,
    },
  });
  const staff2 = await db.user.create({
    data: {
      email: "manager@easysalon.vn",
      name: "Quản Lý Salon",
      password: "hashed",
      role: "manager",
      active: true,
    },
  });
  console.log("  ✓ Created 2 staff users");

  // ---- Customers ----
  type CSeed = { code: string; name: string; phone: string; email?: string };
  const cseeds: CSeed[] = [
    { code: "KH00001", name: "Nguyễn Thế Vũ", phone: "0916822188", email: "vu.nguyen@example.com" },
    { code: "KH00002", name: "Trần Thị Lan", phone: "0987654321", email: "lan.tran@example.com" },
    { code: "KH00003", name: "Lê Minh Tuấn", phone: "0901234567" },
    { code: "KH00004", name: "Phạm Thu Hà", phone: "0912345678" },
    { code: "KH00005", name: "Hoàng Văn Nam", phone: "0923456789" },
    { code: "KH00006", name: "Đỗ Thị Mai", phone: "0934567890" },
    { code: "KH00007", name: "Vũ Quang Huy", phone: "0945678901" },
    { code: "KH00008", name: "Ngô Thị Bích", phone: "0956789012" },
  ];
  const customers = [];
  for (const c of cseeds) {
    customers.push(
      await db.customer.create({
        data: { code: c.code, name: c.name, phone: c.phone, email: c.email, active: true },
      })
    );
  }
  console.log(`  ✓ Created ${customers.length} customers`);

  // ---- Cash cards ----
  const cards = [];
  for (let i = 0; i < customers.length; i++) {
    const c = customers[i];
    const card = await db.cashCard.create({
      data: {
        code: `TTM${String(i + 1).padStart(6, "0")}`,
        balance: 500000 + i * 200000,
        status: "active",
        expiryDate: when(365),
        customerId: c.id,
      },
    });
    cards.push(card);
  }
  console.log(`  ✓ Created ${cards.length} cash cards`);

  // ---- Topups (Lịch sử nạp thẻ) ----
  // Create topups across the last 3 days, with a few today.
  const topupSeeds: Array<{
    cardIdx: number;
    method: string;
    amount: number;
    bonus: number;
    days: number;
    hours: number;
    code: string;
    recordedBy: number; // 0 or 1
    note: string;
  }> = [
    { cardIdx: 0, method: "cash", amount: 1000000, bonus: 50000, days: 0, hours: 9, code: "NT000101", recordedBy: 0, note: "Nạp tiền mặt" },
    { cardIdx: 1, method: "transfer", amount: 2000000, bonus: 100000, days: 0, hours: 10, code: "NT000102", recordedBy: 1, note: "Chuyển khoản ngân hàng" },
    { cardIdx: 2, method: "card", amount: 500000, bonus: 0, days: 0, hours: 11, code: "NT000103", recordedBy: 0, note: "" },
    { cardIdx: 3, method: "cash", amount: 1500000, bonus: 75000, days: 0, hours: 14, code: "NT000104", recordedBy: 0, note: "Khách nạp lần 2" },
    { cardIdx: 4, method: "transfer", amount: 3000000, bonus: 200000, days: -1, hours: 9, code: "NT000095", recordedBy: 1, note: "Nạp VIP" },
    { cardIdx: 5, method: "cash", amount: 800000, bonus: 40000, days: -1, hours: 15, code: "NT000096", recordedBy: 0, note: "" },
    { cardIdx: 6, method: "card", amount: 1200000, bonus: 60000, days: -2, hours: 10, code: "NT000090", recordedBy: 1, note: "Quẹt thẻ" },
    { cardIdx: 7, method: "cash", amount: 600000, bonus: 0, days: -2, hours: 16, code: "NT000091", recordedBy: 0, note: "" },
  ];

  for (const t of topupSeeds) {
    const card = cards[t.cardIdx];
    const customer = customers[t.cardIdx];
    const total = t.amount + t.bonus;
    await db.cashCardTopup.create({
      data: {
        cashCardId: card.id,
        method: t.method,
        amount: t.amount,
        bonus: t.bonus,
        total,
        topupDate: when(t.days, t.hours, 0),
        topupCode: t.code,
        recordedById: t.recordedBy === 0 ? staff1.id : staff2.id,
        note: t.note,
      },
    });
  }
  console.log(`  ✓ Created ${topupSeeds.length} topup records`);

  // ---- Usage transactions (Lịch sử sử dụng) ----
  // Cash card used to pay invoices or settle debts.
  const usageSeeds: Array<{
    cardIdx: number;
    type: "invoice" | "debt";
    amount: number;
    days: number;
    hours: number;
    invoiceCode: string;
    createdBy: number;
    note: string;
  }> = [
    { cardIdx: 0, type: "invoice", amount: 350000, days: 0, hours: 10, invoiceCode: "HD063871", createdBy: 0, note: "Thanh toán dịch vụ" },
    { cardIdx: 0, type: "invoice", amount: 520000, days: 0, hours: 15, invoiceCode: "HD063875", createdBy: 0, note: "" },
    { cardIdx: 0, type: "debt", amount: 200000, days: 0, hours: 16, invoiceCode: "", createdBy: 1, note: "Trả nợ hóa đơn cũ" },
    { cardIdx: 1, type: "invoice", amount: 880000, days: 0, hours: 11, invoiceCode: "HD063872", createdBy: 0, note: "" },
    { cardIdx: 1, type: "invoice", amount: 450000, days: -1, hours: 14, invoiceCode: "HD063860", createdBy: 1, note: "" },
    { cardIdx: 2, type: "invoice", amount: 320000, days: 0, hours: 12, invoiceCode: "HD063873", createdBy: 0, note: "" },
    { cardIdx: 3, type: "debt", amount: 500000, days: 0, hours: 13, invoiceCode: "", createdBy: 1, note: "Thanh toán nợ" },
    { cardIdx: 3, type: "invoice", amount: 750000, days: -1, hours: 10, invoiceCode: "HD063855", createdBy: 0, note: "" },
    { cardIdx: 4, type: "invoice", amount: 1200000, days: -1, hours: 16, invoiceCode: "HD063861", createdBy: 0, note: "Liệu trình" },
    { cardIdx: 5, type: "invoice", amount: 290000, days: -1, hours: 11, invoiceCode: "HD063857", createdBy: 1, note: "" },
    { cardIdx: 6, type: "debt", amount: 300000, days: -2, hours: 9, invoiceCode: "", createdBy: 0, note: "" },
    { cardIdx: 7, type: "invoice", amount: 410000, days: -2, hours: 14, invoiceCode: "HD063850", createdBy: 1, note: "" },
  ];

  for (const u of usageSeeds) {
    const card = cards[u.cardIdx];
    const customer = customers[u.cardIdx];
    await db.cashCardTransaction.create({
      data: {
        cashCardId: card.id,
        customerName: customer.name,
        customerPhone: customer.phone,
        type: u.type,
        paymentMethod: "cashcard",
        amount: u.amount,
        invoiceCode: u.invoiceCode || null,
        note: u.note,
        createdById: u.createdBy === 0 ? staff1.id : staff2.id,
        createdByName: u.createdBy === 0 ? staff1.email : staff2.email,
        createdAt: when(u.days, u.hours, 0),
      },
    });
  }
  console.log(`  ✓ Created ${usageSeeds.length} usage transactions`);

  console.log("\n✅ Seed completed successfully!");
  console.log("   Use today's date range to see the most data in both report views.");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
