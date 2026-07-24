import { StaffCommission, StaffProductivity, StaffRating, StaffRevenue } from "@/types/report-staff";

// ============================================
// Re-export from cash-fund-utils.ts (reuse, do NOT copy)
// ============================================
export { formatVND, paginationRange, paginate } from "@/lib/cash-fund-utils";

// ============================================
// New utility functions for staff report module
// ============================================

/**
 * Compute summary for commission view
 */
export function computeCommissionSummary(commissions: StaffCommission[]): {
  totalServiceCommission: number;
  totalExtraBonus: number;
  total: number;
} {
  const totalServiceCommission = commissions.reduce((sum, c) => sum + c.serviceCommission, 0);
  const totalExtraBonus = commissions.reduce((sum, c) => sum + c.extraBonus, 0);
  const total = commissions.reduce((sum, c) => sum + c.total, 0);
  return { totalServiceCommission, totalExtraBonus, total };
}

/**
 * Compute summary for productivity view
 */
export function computeProductivitySummary(productivity: StaffProductivity[]): {
  totalServiceCount: number;
  totalCustomerRequestCount: number;
  totalServiceValue: number;
  totalCustomerRequestValue: number;
} {
  const totalServiceCount = productivity.reduce((sum, p) => sum + p.serviceCount, 0);
  const totalCustomerRequestCount = productivity.reduce((sum, p) => sum + p.customerRequestCount, 0);
  const totalServiceValue = productivity.reduce((sum, p) => sum + p.serviceValue, 0);
  const totalCustomerRequestValue = productivity.reduce((sum, p) => sum + p.customerRequestValue, 0);
  return { totalServiceCount, totalCustomerRequestCount, totalServiceValue, totalCustomerRequestValue };
}

/**
 * Compute summary for rating view
 */
export function computeRatingSummary(ratings: StaffRating[]): {
  totalPoor: number;
  totalAverage: number;
  totalGood: number;
  totalExcellent: number;
  totalReviews: number;
  totalScore: number;
  averageScore: number;
} {
  const totalPoor = ratings.reduce((sum, r) => sum + r.poorCount, 0);
  const totalAverage = ratings.reduce((sum, r) => sum + r.averageCount, 0);
  const totalGood = ratings.reduce((sum, r) => sum + r.goodCount, 0);
  const totalExcellent = ratings.reduce((sum, r) => sum + r.excellentCount, 0);
  const totalReviews = ratings.reduce((sum, r) => sum + r.totalReviews, 0);
  const totalScore = ratings.reduce((sum, r) => sum + r.totalScore, 0);
  const averageScore = totalReviews > 0 ? totalScore / totalReviews : 0;
  return { totalPoor, totalAverage, totalGood, totalExcellent, totalReviews, totalScore, averageScore };
}

/**
 * Compute summary for revenue view
 */
export function computeRevenueSummary(revenues: StaffRevenue[]): {
  totalServiceCount: number;
  totalServiceRevenue: number;
  totalTip: number;
  totalProductRevenue: number;
  totalTopupRevenue: number;
  totalPackageRevenue: number;
  totalTreatmentRevenue: number;
  totalOtherIncome: number;
  total: number;
} {
  const totalServiceCount = revenues.reduce((sum, r) => sum + r.serviceCount, 0);
  const totalServiceRevenue = revenues.reduce((sum, r) => sum + r.serviceRevenue, 0);
  const totalTip = revenues.reduce((sum, r) => sum + r.tipTotal, 0);
  const totalProductRevenue = revenues.reduce((sum, r) => sum + r.productRevenue, 0);
  const totalTopupRevenue = revenues.reduce((sum, r) => sum + r.topupRevenue, 0);
  const totalPackageRevenue = revenues.reduce((sum, r) => sum + r.packageRevenue, 0);
  const totalTreatmentRevenue = revenues.reduce((sum, r) => sum + r.treatmentRevenue, 0);
  const totalOtherIncome = revenues.reduce((sum, r) => sum + r.otherIncome, 0);
  const total = revenues.reduce((sum, r) => sum + r.total, 0);
  return {
    totalServiceCount,
    totalServiceRevenue,
    totalTip,
    totalProductRevenue,
    totalTopupRevenue,
    totalPackageRevenue,
    totalTreatmentRevenue,
    totalOtherIncome,
    total,
  };
}

/**
 * Filter staff commission by group
 */
export function filterCommissionByGroup(commissions: StaffCommission[], group: string): StaffCommission[] {
  if (group === "Tất cả nhóm nhân viên" || group === "all") return commissions;
  return commissions.filter((c) => c.staffGroup === group);
}

/**
 * Filter staff productivity by group
 */
export function filterProductivityByGroup(productivity: StaffProductivity[], group: string): StaffProductivity[] {
  if (group === "Tất cả nhóm nhân viên" || group === "all") return productivity;
  return productivity.filter((p) => p.staffGroup === group);
}

/**
 * Filter staff rating by group
 */
export function filterRatingByGroup(ratings: StaffRating[], group: string): StaffRating[] {
  if (group === "Tất cả nhóm nhân viên" || group === "all") return ratings;
  return ratings.filter((r) => r.staffGroup === group);
}

/**
 * Filter staff revenue by group
 */
export function filterRevenueByGroup(revenues: StaffRevenue[], group: string): StaffRevenue[] {
  if (group === "Tất cả nhóm nhân viên" || group === "all") return revenues;
  return revenues.filter((r) => r.staffGroup === group);
}
