export interface Service {
  id: string;
  code: string;
  name: string;
  price: number;
  cost: number;
  costType: string;
  subPrices: { label: string; price: number }[];
  duration: number;
  active: boolean;
  allowBooking: boolean;
  showOnApp: boolean;
  categoryId: string | null;
  category: { name: string } | null;
  branchId: string | null;
  branch: { name: string } | null;
  createdAt: string;
  updatedAt: string;
}

export type { ServiceCategory, Package } from "./product-service";