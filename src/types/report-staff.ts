// ============================================
// Module 8 Part 2: Report — Staff Tab Types
// ============================================

export type StaffViewMode = "commission" | "productivity" | "rating" | "revenue";
export type RatingSubType = "score" | "feedback";

// ============================================
// View 1: Hoa hồng (Commission)
// ============================================
export interface StaffCommission {
  id: string;
  staffGroup: string;        // Nhóm nhân viên
  staffName: string;           // Tên nhân viên
  serviceCommission: number;   // Hoa hồng làm dịch vụ
  extraBonus: number;          // Thưởng thêm
  total: number;             // Tổng
}

// ============================================
// View 2: Năng suất làm việc (Productivity)
// ============================================
export interface StaffProductivity {
  id: string;
  staffName: string;           // Tên nhân viên
  staffGroup: string;          // Nhóm
  serviceCount: number;        // Số lượt làm dịch vụ
  customerRequestCount: number; // Số lượt khách yêu cầu
  serviceValue: number;          // Giá trị làm dịch vụ
  customerRequestValue: number; // Giá trị làm dịch vụ khách yêu cầu
}

// ============================================
// View 3: Đánh giá khách hàng (Rating)
// ============================================
export interface StaffRating {
  id: string;
  staffName: string;           // Nhân viên
  staffGroup: string;          // Nhóm nhân viên
  poorCount: number;           // SL Kém (2 điểm)
  averageCount: number;        // SL Trung bình (3 điểm)
  goodCount: number;           // SL Tốt (4 điểm)
  excellentCount: number;      // SL Rất tốt (5 điểm)
  totalReviews: number;        // Tổng lượt
  totalScore: number;          // Tổng điểm
  averageScore: number;        // Điểm trung bình
}

// ============================================
// View 4: Doanh thu (Revenue)
// ============================================
export interface StaffRevenue {
  id: string;
  staffName: string;           // Tên nhân viên
  staffGroup: string;          // Nhóm nhân viên
  serviceCount: number;        // Số lượng làm DV
  serviceRevenue: number;      // Làm dịch vụ
  tipTotal: number;            // Tiền thưởng (tip) — attributed to this staff
  // The following sale columns are retained for type/summary compatibility
  // but are NOT displayed in the revenue view (removed per spec). They stay 0.
  serviceSaleCount: number;
  productSaleCount: number;
  productRevenue: number;
  topupCount: number;
  topupRevenue: number;
  packageCount: number;
  packageRevenue: number;
  treatmentCount: number;
  treatmentRevenue: number;
  otherIncome: number;
  otherCount: number;
  total: number;                // Tổng = serviceRevenue + tipTotal
}
