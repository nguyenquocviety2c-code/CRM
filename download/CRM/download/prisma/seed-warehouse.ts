// Seed script: populate the CRM database with realistic warehouse data
// matching the reference report screenshots.
//
// Run with:  bun run prisma/seed-warehouse.ts
//
// This script is IDEMPOTENT: it clears warehouse-related tables first, then
// re-inserts a fresh dataset. It does NOT touch users / customers / invoices.

import { PrismaClient } from "../src/generated/prisma/index.js";
import { PrismaLibSql } from "@prisma/adapter-libsql";

const adapter = new PrismaLibSql({
  url: process.env.DATABASE_URL || "file:/home/z/CRM/prisma/dev.db",
});
const db = new PrismaClient({ adapter });

// Helper: build a Date offset from "now" by given days/hours/minutes.
function when(days: number, hours = 0, minutes = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

async function main() {
  console.log("🌱 Seeding warehouse report data...");

  // ---- Clean warehouse tables (order matters for FK cascades) ----
  await db.slipItem.deleteMany({});
  await db.importSlip.deleteMany({});
  await db.exportSlip.deleteMany({});
  await db.transferSlip.deleteMany({});
  await db.product.deleteMany({});
  await db.productCategory.deleteMany({});
  await db.branch.deleteMany({});
  console.log("  ✓ Cleared existing warehouse data");

  // ---- Branches ----
  const branchMain = await db.branch.create({
    data: { name: "Level 1 Văn Bảo", address: "Số 1 Văn Bảo", phone: "0900000001", active: true },
  });
  const branch2 = await db.branch.create({
    data: { name: "Level 2 Cầu Giấy", address: "Cầu Giấy", phone: "0900000002", active: true },
  });
  const branch3 = await db.branch.create({
    data: { name: "Level 3 Hà Đông", address: "Hà Đông", phone: "0900000003", active: true },
  });
  console.log("  ✓ Created 3 branches");

  // ---- Product categories ----
  const catDau = await db.productCategory.create({ data: { name: "Dầu gội", active: true } });
  const catDuoc = await db.productCategory.create({ data: { name: "Dược mỹ phẩm", active: true } });
  const catTrang = await db.productCategory.create({ data: { name: "Trang điểm", active: true } });
  const catKhac = await db.productCategory.create({ data: { name: "Khác", active: true } });
  console.log("  ✓ Created 4 product categories");

  // ---- Products (codes match the A000xxx pattern from the screenshots) ----
  type Seed = { code: string; name: string; cat: string; stock: number; price: number };
  const seeds: Seed[] = [
    { code: "A000134", name: "DAS", cat: catDau.id, stock: 25, price: 352000 },
    { code: "A000095", name: "Blow Powder (Bột tảo phồng Blow)", cat: catKhac.id, stock: 18, price: 450000 },
    { code: "A000101", name: "Kem dưỡng trắng da", cat: catDuoc.id, stock: 40, price: 1200000 },
    { code: "A000102", name: "Serum vitamin C", cat: catDuoc.id, stock: 32, price: 890000 },
    { code: "A000110", name: "Dầu gội Tresemme", cat: catDau.id, stock: 56, price: 220000 },
    { code: "A000111", name: "Dầu xả Tresemme", cat: catDau.id, stock: 48, price: 200000 },
    { code: "A000120", name: "Son môi MAC", cat: catTrang.id, stock: 15, price: 750000 },
    { code: "A000121", name: "Phấn mắt Urban Decay", cat: catTrang.id, stock: 0, price: 980000 },
    { code: "A000130", name: "Sữa rửa mặt Cetaphil", cat: catDuoc.id, stock: 60, price: 320000 },
    { code: "A000131", name: "Kem chống nắng La Roche", cat: catDuoc.id, stock: 3, price: 560000 },
    { code: "A000140", name: "Gel vuốt tóc", cat: catKhac.id, stock: 28, price: 180000 },
    { code: "A000141", name: "Thuốc nhuộm L'Oréal", cat: catKhac.id, stock: 44, price: 290000 },
    { code: "A000150", name: "Mặt nạ dưỡng The Face Shop", cat: catDuoc.id, stock: 100, price: 95000 },
    { code: "A000151", name: "Tẩy da chết St. Ives", cat: catDuoc.id, stock: 36, price: 240000 },
    { code: "A000160", name: "Nước hoa hồng Thayer", cat: catDuoc.id, stock: 52, price: 310000 },
    { code: "A000161", name: "Kem dưỡng ẩm Neutrogena", cat: catDuoc.id, stock: 4, price: 270000 },
    { code: "A000170", name: "Bộ cọ trang điểm", cat: catTrang.id, stock: 22, price: 650000 },
    { code: "A000171", name: "Kẻ mắt nước", cat: catTrang.id, stock: 38, price: 190000 },
    { code: "A000180", name: "Dầu gội Head & Shoulders", cat: catDau.id, stock: 70, price: 165000 },
    { code: "A000181", name: "Dầu xả Sunsilk", cat: catDau.id, stock: 0, price: 150000 },
    { code: "A000190", name: "Sáp vuốt tóc Gatsby", cat: catKhac.id, stock: 33, price: 210000 },
    { code: "A000191", name: "Thuốc uốn lạnh", cat: catKhac.id, stock: 19, price: 380000 },
    { code: "A000200", name: "Kem lót Innisfree", cat: catTrang.id, stock: 27, price: 430000 },
    { code: "A000201", name: "BB Cushion Laneige", cat: catTrang.id, stock: 14, price: 870000 },
  ];

  const products = [];
  for (const s of seeds) {
    const p = await db.product.create({
      data: {
        code: s.code,
        name: s.name,
        categoryId: s.cat,
        price: s.price,
        cost: Math.round(s.price * 0.6),
        initialStock: s.stock,
        stock: s.stock,
        unit: "Gói",
        active: true,
      },
    });
    products.push(p);
  }
  console.log(`  ✓ Created ${products.length} products`);

  const findP = (code: string) => products.find((p) => p.code === code)!;

  // ---- Import slips (Nhập kho) ----
  // A couple of import slips within the last few days.
  const imp1 = await db.importSlip.create({
    data: {
      code: "NK00231",
      createdByEmail: "TN.LV1.VB@gmail.com",
      importDate: when(-1, 9, 30),
      note: "Nhập hàng tháng",
      isPaid: true,
      totalAmount: 15000000,
      status: "completed",
    },
  });
  await db.slipItem.createMany({
    data: [
      { importSlipId: imp1.id, productId: findP("A000110").id, quantity: 20, price: 165000 },
      { importSlipId: imp1.id, productId: findP("A000180").id, quantity: 30, price: 120000 },
    ],
  });

  const imp2 = await db.importSlip.create({
    data: {
      code: "NK00232",
      createdByEmail: "TN.LV1.VB@gmail.com",
      importDate: when(0, 8, 15),
      note: "Bổ sung hàng",
      isPaid: false,
      totalAmount: 8400000,
      status: "pending",
    },
  });
  await db.slipItem.createMany({
    data: [
      { importSlipId: imp2.id, productId: findP("A000101").id, quantity: 10, price: 900000 },
      { importSlipId: imp2.id, productId: findP("A000102").id, quantity: 8, price: 680000 },
    ],
  });
  console.log("  ✓ Created 2 import slips (4 items)");

  // ---- Export slips ----
  // "XS" = Xuất sử dụng (export-use), "XB" = Xuất bán (export-sell)
  const today = new Date();
  const todayStr = `${String(today.getDate()).padStart(2, "0")}/${String(today.getMonth() + 1).padStart(2, "0")}/${today.getFullYear()}`;

  const xs1 = await db.exportSlip.create({
    data: {
      code: "XS000001",
      createdByEmail: "TN.LV1.VB@gmail.com",
      exportDate: when(0, 10, 0),
      note: "Xuất sử dụng cho dịch vụ",
      exportType: "use",
      status: "completed",
    },
  });
  await db.slipItem.createMany({
    data: [
      { exportSlipId: xs1.id, productId: findP("A000134").id, quantity: 1, price: 352000 },
    ],
  });

  const xb1 = await db.exportSlip.create({
    data: {
      code: "XB000609",
      createdByEmail: "TN.LV1.VB@gmail.com",
      exportDate: when(0, 18, 37),
      note: "Xuất bán cho khách",
      exportType: "use",
      status: "completed",
    },
  });
  await db.slipItem.createMany({
    data: [
      { exportSlipId: xb1.id, productId: findP("A000134").id, quantity: 1, price: 352000 },
      { exportSlipId: xb1.id, productId: findP("A000095").id, quantity: 1, price: 450000 },
      { exportSlipId: xb1.id, productId: findP("A000120").id, quantity: 1, price: 750000 },
    ],
  });

  const xs2 = await db.exportSlip.create({
    data: {
      code: "XS000002",
      createdByEmail: "TN.LV1.VB@gmail.com",
      exportDate: when(0, 14, 20),
      note: "Xuất sử dụng",
      exportType: "use",
      status: "completed",
    },
  });
  await db.slipItem.createMany({
    data: [
      { exportSlipId: xs2.id, productId: findP("A000140").id, quantity: 2, price: 180000 },
    ],
  });

  const xb2 = await db.exportSlip.create({
    data: {
      code: "XB000610",
      createdByEmail: "TN.LV1.VB@gmail.com",
      exportDate: when(0, 16, 5),
      note: "Xuất bán",
      exportType: "use",
      status: "completed",
    },
  });
  await db.slipItem.createMany({
    data: [
      { exportSlipId: xb2.id, productId: findP("A000101").id, quantity: 1, price: 1200000 },
      { exportSlipId: xb2.id, productId: findP("A000130").id, quantity: 1, price: 320000 },
    ],
  });
  console.log("  ✓ Created 4 export slips (7 items: 2 XS + 2 XB)");

  // ---- Transfer slips ----
  // Completed transfers
  const tf1 = await db.transferSlip.create({
    data: {
      code: "TK-001",
      createdByEmail: "TN.LV1.VB@gmail.com",
      transferDate: when(-2, 11, 0),
      fromBranchId: branchMain.id,
      toBranchId: branch2.id,
      note: "Chuyển hàng sang chi nhánh Cầu Giấy",
      status: "completed",
    },
  });
  await db.slipItem.createMany({
    data: [
      { transferSlipId: tf1.id, productId: findP("A000110").id, quantity: 10, price: 165000 },
      { transferSlipId: tf1.id, productId: findP("A000180").id, quantity: 5, price: 120000 },
    ],
  });

  const tf2 = await db.transferSlip.create({
    data: {
      code: "TK-002",
      createdByEmail: "TN.LV1.VB@gmail.com",
      transferDate: when(-1, 15, 30),
      fromBranchId: branch2.id,
      toBranchId: branchMain.id,
      note: "Nhận lại hàng từ Cầu Giấy",
      status: "completed",
    },
  });
  await db.slipItem.createMany({
    data: [
      { transferSlipId: tf2.id, productId: findP("A000120").id, quantity: 3, price: 750000 },
    ],
  });

  // Pending (in-transit) transfers
  const tf3 = await db.transferSlip.create({
    data: {
      code: "TK-003",
      createdByEmail: "TN.LV1.VB@gmail.com",
      transferDate: when(0, 9, 0),
      fromBranchId: branchMain.id,
      toBranchId: branch3.id,
      note: "Đang chuyển sang Hà Đông",
      status: "pending",
    },
  });
  await db.slipItem.createMany({
    data: [
      { transferSlipId: tf3.id, productId: findP("A000101").id, quantity: 6, price: 900000 },
      { transferSlipId: tf3.id, productId: findP("A000150").id, quantity: 12, price: 70000 },
    ],
  });

  const tf4 = await db.transferSlip.create({
    data: {
      code: "TK-004",
      createdByEmail: "TN.LV1.VB@gmail.com",
      transferDate: when(0, 13, 45),
      fromBranchId: branch2.id,
      toBranchId: branchMain.id,
      note: "Đang chuyển về Văn Bảo",
      status: "pending",
    },
  });
  await db.slipItem.createMany({
    data: [
      { transferSlipId: tf4.id, productId: findP("A000160").id, quantity: 8, price: 230000 },
    ],
  });
  console.log("  ✓ Created 4 transfer slips (2 completed, 2 pending)");

  console.log("\n✅ Seed completed successfully!");
  console.log(`   Today is ${todayStr} — use this as the date range to see today's data.`);
  console.log("   Hint: the inventory/movement/transfer views are date-range aware.");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
