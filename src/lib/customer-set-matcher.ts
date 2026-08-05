import { supabaseAdmin } from "@/lib/supabase";

/**
 * Customer-set condition matcher.
 *
 * Evaluates a customer set's conditions against all customers and returns the
 * ids of the customers that match ALL conditions (AND logic).
 *
 * Supported condition types:
 *  - lastVisitDays    : days since the customer's last completed invoice
 *  - totalSpent        : total amount spent (customers.total_spent)
 *  - serviceCount      : number of completed invoices
 *  - avgVisitDays      : average gap (days) between consecutive visits
 *  - avgSpendPerVisit  : totalSpent / serviceCount
 *  - birthdayMonth     : month of birthday (1-12) — equality, no operator
 *  - customerGroup     : group_id — equality, no operator
 *
 * Operators (for numeric conditions): "gt" (>), "lt" (<), "between" (range).
 * For "between", conditionValue = from, conditionValue2 = to.
 *
 * birthdayMonth and customerGroup use plain equality (conditionValue holds
 * the month number or group id; operator/value2 are ignored).
 */

export interface SetCondition {
  conditionType: string;
  conditionValue: string | null;
  conditionOperator?: string | null;
  conditionValue2?: string | null;
}

interface CustomerMetrics {
  id: string;
  totalSpent: number;
  serviceCount: number;
  lastVisitMs: number; // epoch ms of last invoice, 0 if none
  avgVisitDays: number; // 0 if < 2 visits
  avgSpendPerVisit: number; // 0 if no visits
  birthdayMonth: number | null; // 1-12 or null
  groupId: string | null;
}

/**
 * Compare a numeric value against the condition using the operator.
 *  - "gt"      → value > target
 *  - "lt"      → value < target
 *  - "between" → from ≤ value ≤ to
 *  - default   → value === target (equality, for non-operator conditions)
 */
function matchNumeric(
  value: number,
  operator: string | null | undefined,
  raw: string | null,
  raw2: string | null | undefined
): boolean {
  // Equality (no operator) — e.g. birthdayMonth "3".
  if (!operator || (operator !== "gt" && operator !== "lt" && operator !== "between")) {
    const target = Number(raw);
    if (isNaN(target)) return false;
    return value === target;
  }
  const target = Number(raw);
  if (operator === "gt") {
    if (isNaN(target)) return false;
    return value > target;
  }
  if (operator === "lt") {
    if (isNaN(target)) return false;
    return value < target;
  }
  // between
  const from = Number(raw);
  const to = Number(raw2);
  if (isNaN(from) || isNaN(to)) return false;
  return value >= from && value <= to;
}

/**
 * Evaluate a single condition against a customer's metrics.
 */
function matchesCondition(
  metrics: CustomerMetrics,
  cond: SetCondition
): boolean {
  const op = cond.conditionOperator || null;
  switch (cond.conditionType) {
    case "lastVisitDays": {
      if (!metrics.lastVisitMs) return false; // never visited → doesn't match
      const daysSince = Math.floor((Date.now() - metrics.lastVisitMs) / 86400000);
      return matchNumeric(daysSince, op, cond.conditionValue, cond.conditionValue2);
    }
    case "totalSpent":
      return matchNumeric(metrics.totalSpent, op, cond.conditionValue, cond.conditionValue2);
    case "serviceCount":
      return matchNumeric(metrics.serviceCount, op, cond.conditionValue, cond.conditionValue2);
    case "avgVisitDays":
      return matchNumeric(metrics.avgVisitDays, op, cond.conditionValue, cond.conditionValue2);
    case "avgSpendPerVisit":
      return matchNumeric(metrics.avgSpendPerVisit, op, cond.conditionValue, cond.conditionValue2);
    case "birthdayMonth": {
      if (metrics.birthdayMonth == null) return false;
      const target = Number(cond.conditionValue);
      if (isNaN(target)) return false;
      return metrics.birthdayMonth === target;
    }
    case "customerGroup": {
      if (!metrics.groupId) return false;
      return metrics.groupId === cond.conditionValue;
    }
    default:
      return false;
  }
}

/**
 * Fetch all customers with their computed metrics (totalSpent, serviceCount,
 * lastVisit, avgVisitDays, avgSpendPerVisit, birthdayMonth, groupId).
 *
 * serviceCount + lastVisit + avgVisitDays come from the invoices table
 * (status = 'completed'); totalSpent + birthday + groupId come from the
 * customers table.
 */
async function fetchCustomerMetrics(): Promise<CustomerMetrics[]> {
  // 1. Fetch customers (id, total_spent, birthday, group_id).
  const { data: customers, error: custErr } = await supabaseAdmin
    .from("customers")
    .select("id, total_spent, birthday, group_id")
    .limit(5000);
  if (custErr || !customers) return [];

  // 2. Fetch completed invoices per customer (created_at only — we need dates
  // to compute serviceCount, lastVisit, avgVisitDays, avgSpendPerVisit).
  // Use the invoices table; final_amount gives per-visit spend.
  const { data: invoices, error: invErr } = await supabaseAdmin
    .from("invoices")
    .select("customer_id, created_at, final_amount, status")
    .eq("status", "completed")
    .limit(20000);
  if (invErr || !invoices) return [];

  // 3. Group invoices by customer + compute metrics.
  const byCustomer = new Map<
    string,
    { dates: number[]; total: number }
  >();
  for (const inv of invoices) {
    const cid = inv.customer_id as string;
    if (!cid) continue;
    const created = inv.created_at ? new Date(inv.created_at as string).getTime() : NaN;
    const amount = Number(inv.final_amount) || 0;
    const entry = byCustomer.get(cid) || { dates: [], total: 0 };
    if (!isNaN(created)) entry.dates.push(created);
    entry.total += amount;
    byCustomer.set(cid, entry);
  }

  // 4. Build metrics per customer.
  const result: CustomerMetrics[] = [];
  for (const c of customers) {
    const id = c.id as string;
    const agg = byCustomer.get(id) || { dates: [], total: 0 };
    const dates = agg.dates.sort((a, b) => a - b);
    const serviceCount = dates.length;
    const lastVisitMs = serviceCount > 0 ? dates[dates.length - 1] : 0;
    // avgVisitDays: average gap between consecutive visits (days). 0 if < 2.
    let avgVisitDays = 0;
    if (dates.length >= 2) {
      let sumGaps = 0;
      for (let i = 1; i < dates.length; i++) {
        sumGaps += (dates[i] - dates[i - 1]) / 86400000;
      }
      avgVisitDays = sumGaps / (dates.length - 1);
    }
    const totalSpent = Number(c.total_spent) || 0;
    const avgSpendPerVisit = serviceCount > 0 ? totalSpent / serviceCount : 0;
    // birthdayMonth: parse "YYYY-MM-DD" or "DD/MM/YYYY" → month (1-12).
    let birthdayMonth: number | null = null;
    const bday = c.birthday as string | null;
    if (bday) {
      const parsed = new Date(bday);
      if (!isNaN(parsed.getTime())) {
        birthdayMonth = parsed.getMonth() + 1;
      } else {
        // Try DD/MM/YYYY.
        const m = bday.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
        if (m) birthdayMonth = parseInt(m[2], 10);
      }
    }
    result.push({
      id,
      totalSpent,
      serviceCount,
      lastVisitMs,
      avgVisitDays: Math.round(avgVisitDays),
      avgSpendPerVisit: Math.round(avgSpendPerVisit),
      birthdayMonth,
      groupId: (c.group_id as string) || null,
    });
  }
  return result;
}

/**
 * Evaluate a set of conditions against all customers and return the ids of
 * the matching customers (AND logic — a customer must match ALL conditions).
 * Empty conditions → no matches (a set with no conditions has no members
 * until conditions are added).
 */
export async function findMatchingCustomerIds(
  conditions: SetCondition[]
): Promise<string[]> {
  if (!conditions || conditions.length === 0) return [];
  const metrics = await fetchCustomerMetrics();
  return metrics
    .filter((m) => conditions.every((cond) => matchesCondition(m, cond)))
    .map((m) => m.id);
}

/**
 * Populate the customer_set_members table for a given set: delete existing
 * members, compute matching customer ids from the set's conditions, and
 * insert them. Returns the count of members added.
 */
export async function repopulateSetMembers(
  customerSetId: string,
  conditions: SetCondition[]
): Promise<number> {
  // Delete existing members (clean slate on every save).
  await supabaseAdmin
    .from("customer_set_members")
    .delete()
    .eq("customer_set_id", customerSetId);
  // Compute matching customer ids.
  const ids = await findMatchingCustomerIds(conditions);
  if (ids.length === 0) return 0;
  // Insert members (upsert so re-runs are idempotent).
  const rows = ids.map((customerId) => ({
    customer_set_id: customerSetId,
    customer_id: customerId,
  }));
  const { error } = await supabaseAdmin
    .from("customer_set_members")
    .upsert(rows, { onConflict: "customer_set_id,customer_id", ignoreDuplicates: true });
  if (error) {
    // Best-effort — log but don't fail the whole save.
    console.error("Failed to populate set members:", error.message);
  }
  return ids.length;
}
