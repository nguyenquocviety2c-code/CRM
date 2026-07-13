// Seed script: populate the CRM database with service package data for the
// "GÓI DỊCH VỤ" report (purchased packages + usage history).
//
// Run with:  DATABASE_URL="file:/home/z/CRM/prisma/dev.db" bun run prisma/seed-service-package.ts
//
// Idempotent: clears package-report tables first, then re-inserts. Does NOT
// touch customers / cash cards / warehouse data seeded by other scripts.

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
  console.log("🌱 Seeding service package report data...");

  // ---- Clean package-report tables (order matters for FK cascades) ----
  await db.packageUsage.deleteMany({});
  await db.customerPackage.deleteMany({});
  await db.package.deleteMany({});
  await db.packageCategory.deleteMany({});
  console.log("  ✓ Cleared existing package data");

  // ---- Package categories ----
  const cat1 = await db.packageCategory.create({ data: { name: "Gói cắt gội", active: true } });
  const cat2 = await db.packageCategory.create({ data: { name: "Gói điều trị", active: true } });
  const cat3 = await db.packageCategory.create({ data: { name: "Gói chăm sóc", active: true } });
  console.log("  ✓ Created 3 package categories");

  // ---- Packages ----
  type PSeed = { code: string; name: string; cat: string; total: number; discount: number };
  const pseeds: PSeed[] = [
    { code: "GOI001", name: "Gói cắt gội 10 lần", cat: cat1.id, total: 2000000, discount: 1700000 },
    { code: "GOI002", name: "Gói uốn nhuộm 5 lần", cat: cat1.id, total: 5000000, discount: 4200000 },
    { code: "GOI003", name: "Gói điều trị tóc 8 lần", cat: cat2.id, total: 6400000, discount: 5500000 },
    { code: "GOI004", name: "Gói chăm sóc da mặt 12 lần", cat: cat3.id, total: 6000000, discount: 4800000 },
    { code: "GOI005", name: "Gói gội đầu dưỡng 15 lần", cat: cat3.id, total: 3000000, discount: 2500000 },
    { code: "GOI006", name: "Gói triệt lông 6 lần", cat: cat2.id, total: 9000000, discount: 7500000 },
  ];
  const packages = [];
  for (const p of pseeds) {
    packages.push(
      await db.package.create({
        data: {
          code: p.code,
          name: p.name,
          totalPrice: p.total,
          discountPrice: p.discount,
          categoryId: p.cat,
          active: true,
        },
      })
    );
  }
  console.log(`  ✓ Created ${packages.length} packages`);

  // ---- Customer packages (Gói đã mua) ----
  type CPSeed = {
    pkgIdx: number;
    customerName: string;
    customerPhone: string;
    status: string;
    purchaseDays: number;
    expiryDays: number; // offset from now (positive = future, negative = past)
    lastUsedDays: number;
    totalUses: number;
    usedCount: number;
    invoiceCode: string;
  };
  const cpSeeds: CPSeed[] = [
    { pkgIdx: 0, customerName: "Nguyễn Thế Vũ", customerPhone: "0916822188", status: "active", purchaseDays: -10, expiryDays: 80, lastUsedDays: -1, totalUses: 10, usedCount: 3, invoiceCode: "HD063850" },
    { pkgIdx: 3, customerName: "Nguyễn Thế Vũ", customerPhone: "0916822188", status: "active", purchaseDays: -5, expiryDays: 90, lastUsedDays: 0, totalUses: 12, usedCount: 2, invoiceCode: "HD063865" },
    { pkgIdx: 2, customerName: "Trần Thị Lan", customerPhone: "0987654321", status: "active", purchaseDays: -7, expiryDays: 85, lastUsedDays: -2, totalUses: 8, usedCount: 1, invoiceCode: "HD063855" },
    { pkgIdx: 4, customerName: "Trần Thị Lan", customerPhone: "0987654321", status: "used_up", purchaseDays: -30, expiryDays: -2, lastUsedDays: -3, totalUses: 15, usedCount: 15, invoiceCode: "HD063800" },
    { pkgIdx: 1, customerName: "Lê Minh Tuấn", customerPhone: "0901234567", status: "active", purchaseDays: -3, expiryDays: 87, lastUsedDays: 0, totalUses: 5, usedCount: 1, invoiceCode: "HD063870" },
    { pkgIdx: 5, customerName: "Phạm Thu Hà", customerPhone: "0912345678", status: "active", purchaseDays: -15, expiryDays: 75, lastUsedDays: -1, totalUses: 6, usedCount: 2, invoiceCode: "HD063840" },
    { pkgIdx: 0, customerName: "Hoàng Văn Nam", customerPhone: "0923456789", status: "expired", purchaseDays: -100, expiryDays: -10, lastUsedDays: -20, totalUses: 10, usedCount: 7, invoiceCode: "HD063700" },
    { pkgIdx: 3, customerName: "Đỗ Thị Mai", customerPhone: "0934567890", status: "active", purchaseDays: -8, expiryDays: 82, lastUsedDays: 0, totalUses: 12, usedCount: 4, invoiceCode: "HD063860" },
    { pkgIdx: 4, customerName: "Vũ Quang Huy", customerPhone: "0945678901", status: "used_up", purchaseDays: -45, expiryDays: 15, lastUsedDays: -1, totalUses: 15, usedCount: 15, invoiceCode: "HD063780" },
    { pkgIdx: 2, customerName: "Ngô Thị Bích", customerPhone: "0956789012", status: "active", purchaseDays: -6, expiryDays: 84, lastUsedDays: -2, totalUses: 8, usedCount: 0, invoiceCode: "HD063862" },
  ];

  const customerPackages = [];
  for (const cp of cpSeeds) {
    const pkg = packages[cp.pkgIdx];
    const rec = await db.customerPackage.create({
      data: {
        customerName: cp.customerName,
        customerPhone: cp.customerPhone,
        packageId: pkg.id,
        packageName: pkg.name,
        status: cp.status,
        purchaseDate: when(cp.purchaseDays, 10, 0),
        expiryDate: when(cp.expiryDays, 23, 59),
        lastUsedDate: cp.lastUsedDays === 0 ? undefined : when(cp.lastUsedDays, 14, 30),
        totalUses: cp.totalUses,
        usedCount: cp.usedCount,
        remaining: cp.totalUses - cp.usedCount,
        invoiceCode: cp.invoiceCode,
        createdByName: "TN.LV1.VB@gmail.com",
      },
    });
    customerPackages.push({ rec, seed: cp, pkgIdx: cp.pkgIdx });
  }
  console.log(`  ✓ Created ${customerPackages.length} customer packages`);

  // ---- Package usages (Lịch sử dùng gói) ----
  // Generate usage records for each customer package based on usedCount.
  const serviceNames = [
    "Cắt tóc nam", "Gội đầu dưỡng", "Uốn tóc", "Nhuộm tóc", "Điều trị tóc",
    "Chăm sóc da mặt", "Gội đầu thư giãn", "Triệt lông nách", "Triệt lông chân",
  ];
  const staffNames = ["Lê Văn An", "Trần Thị Bình", "Phạm Văn Cường", "Đỗ Thị Dung"];

  let usageCount = 0;
  for (const { rec, seed } of customerPackages) {
    if (rec.usedCount === 0) continue;
    // Generate usage records spread across the last few days
    for (let i = 0; i < rec.usedCount; i++) {
      const useDay = seed.lastUsedDays + i; // spread backwards from lastUsedDays
      const pkg = packages[seed.pkgIdx];
      await db.packageUsage.create({
        data: {
          customerPackageId: rec.id,
          packageName: rec.packageName,
          customerName: rec.customerName,
          customerPhone: rec.customerPhone || "",
          serviceName: serviceNames[(seed.pkgIdx + i) % serviceNames.length],
          useDate: when(useDay, 10 + i, (i * 17) % 60),
          quantity: 1,
          invoiceCode: i === 0 ? rec.invoiceCode : `HD0638${70 + i}`,
          staffName: staffNames[i % staffNames.length],
          note: "",
        },
      });
      usageCount++;
    }
  }
  console.log(`  ✓ Created ${usageCount} package usage records`);

  console.log("\n✅ Seed completed successfully!");
  console.log("   Use today's date range to see recent usage in the report views.");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
