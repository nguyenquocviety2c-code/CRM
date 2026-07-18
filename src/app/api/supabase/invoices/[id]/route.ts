import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getCurrentStaffId } from "@/lib/auth/current-staff";

const ITEMS_MARKER = '"__kind":"invoice_meta"';

/**
 * Decode the `note` column's `invoice_meta` JSON back into structured fields.
 * Shape: { "__kind": "invoice_meta", "items": [...], "note": "...", "tip": <number>, "promotion": <object|null>, "photos": string[] }
 */
function decodeInvoiceMeta(row: Record<string, unknown> | null) {
  if (!row) return row;
  const rawNote = row.note;
  if (typeof rawNote === "string" && rawNote.includes(ITEMS_MARKER)) {
    try {
      const parsed = JSON.parse(rawNote) as {
        items?: unknown[];
        note?: string;
        tip?: number;
        promotion?: unknown;
        photos?: unknown;
      };
      return {
        ...row,
        items: Array.isArray(parsed.items) ? parsed.items : [],
        note: parsed.note ?? null,
        tip: Number(parsed.tip) || 0,
        promotion: parsed.promotion ?? null,
        photos: Array.isArray(parsed.photos) ? (parsed.photos as string[]) : [],
      };
    } catch {
      return { ...row, items: [], tip: 0, promotion: null, photos: [] };
    }
  }
  return { ...row, items: [], tip: 0, promotion: null, photos: [] };
}

/**
 * Build a human-readable change description from the old vs new invoice state.
 * Used as the `detail` of an UPDATE_INVOICE activity (shown in the activity
 * history table's hover tooltip).
 */
function describeInvoiceChanges(
  before: {
    items?: unknown[];
    tip?: number;
    promotion?: { id?: string; name?: string } | null;
    photos?: string[];
    note?: string | null;
    final_amount?: number | string | null;
    discount?: number | string | null;
    total_amount?: number | string | null;
    status?: string | null;
    payment_method?: string | null;
  },
  after: Record<string, unknown>,
  existingItems: unknown[],
  existingTip: number,
  existingPromotion: { id?: string; name?: string } | null,
  existingPhotos: string[]
): string {
  const parts: string[] = [];

  // Items changed?
  const newItems = Array.isArray(after.items) ? after.items : existingItems;
  if (Array.isArray(after.items) && after.items.length !== existingItems.length) {
    parts.push(`số mặt hàng: ${existingItems.length} → ${after.items.length}`);
  } else if (Array.isArray(after.items) && after.items.length === existingItems.length) {
    // Same count but maybe content changed — compare by name/price.
    const oldNames = existingItems.map((it) => (it as { name?: string })?.name || "").join(", ");
    const newNames = newItems.map((it) => (it as { name?: string })?.name || "").join(", ");
    if (oldNames !== newNames) parts.push("thay đổi mặt hàng");
  }

  // Tip changed?
  const newTip = after.tip !== undefined ? Number(after.tip) || 0 : existingTip;
  if (newTip !== existingTip) {
    parts.push(`thưởng thợ: ${existingTip} → ${newTip}`);
  }

  // Promotion changed?
  if (after.promotion !== undefined) {
    const newPromo = after.promotion as { id?: string; name?: string } | null;
    const oldName = existingPromotion?.name || "(không)";
    const newName = newPromo?.name || "(không)";
    if (oldName !== newName) parts.push(`khuyến mãi: ${oldName} → ${newName}`);
  }

  // Photos changed?
  const newPhotos = after.photos !== undefined ? (after.photos as string[]) : existingPhotos;
  if (Array.isArray(after.photos) && newPhotos.length !== existingPhotos.length) {
    parts.push(`số ảnh: ${existingPhotos.length} → ${newPhotos.length}`);
  }

  // Note changed?
  if (after.note !== undefined && after.note !== before.note) {
    parts.push("ghi chú");
  }

  // Amount changed?
  if (after.final_amount !== undefined) {
    const oldAmt = Number(before.final_amount) || 0;
    const newAmt = Number(after.final_amount) || 0;
    if (oldAmt !== newAmt) parts.push(`thành tiền: ${oldAmt} → ${newAmt}`);
  }
  if (after.discount !== undefined) {
    const oldD = Number(before.discount) || 0;
    const newD = Number(after.discount) || 0;
    if (oldD !== newD) parts.push(`chiết khấu: ${oldD} → ${newD}`);
  }
  if (after.status !== undefined && after.status !== before.status) {
    parts.push(`trạng thái: ${before.status || "—"} → ${after.status}`);
  }
  if (after.payment_method !== undefined && after.payment_method !== before.payment_method) {
    parts.push(`thanhtoán: ${before.payment_method || "—"} → ${after.payment_method}`);
  }

  return parts.length > 0 ? `Chỉnh sửa: ${parts.join(", ")}` : "Chỉnh sửa hóa đơn";
}

/**
 * Log an invoice activity (best-effort, never throws). Each edit creates a NEW
 * row so the activity history table shows one "Chỉnh sửa" line per edit.
 */
async function logActivity(
  invoiceId: string,
  invoiceCode: string,
  branchId: string | null | undefined,
  action: string,
  detail: string,
  value: string | null,
  actorStaffId: string | null
): Promise<void> {
  try {
    await supabaseAdmin.from("invoice_activities").insert({
      invoice_id: invoiceId,
      invoice_code: invoiceCode,
      action,
      detail,
      value,
      branch_id: branchId || null,
      created_by: actorStaffId,
    });
  } catch {
    // best-effort
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { data, error } = await supabaseAdmin
      .from("invoices")
      .select("*, customer:customers(id, name, phone, code), branch:branches(id, name), staff:staff(id, name)")
      .eq("id", id)
      .maybeSingle();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ ok: false, error: "Invoice not found" }, { status: 404 });
    return NextResponse.json({ ok: true, data: decodeInvoiceMeta(data as Record<string, unknown>) });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    // When updating the note JSON (items / tip / promotion / photos / note),
    // re-serialize the invoice_meta payload so everything stays in sync.
    if (body.tip !== undefined || body.items !== undefined || body.promotion !== undefined || body.photos !== undefined) {
      // Fetch the current row to preserve existing items/note/promotion/photos when only one field changes.
      const { data: current } = await supabaseAdmin
        .from("invoices")
        .select("note, code, branch_id, status, final_amount, discount, total_amount, payment_method")
        .eq("id", id)
        .maybeSingle();

      let existingItems: unknown[] = [];
      let existingNote: string | null = null;
      let existingTip = 0;
      let existingPromotion: unknown = null;
      let existingPhotos: string[] = [];
      const currentNote = (current as { note?: string } | null)?.note;
      if (typeof currentNote === "string" && currentNote.includes(ITEMS_MARKER)) {
        try {
          const parsed = JSON.parse(currentNote) as {
            items?: unknown[];
            note?: string;
            tip?: number;
            promotion?: unknown;
            photos?: unknown;
          };
          existingItems = Array.isArray(parsed.items) ? parsed.items : [];
          existingNote = parsed.note ?? null;
          existingTip = Number(parsed.tip) || 0;
          existingPromotion = parsed.promotion ?? null;
          existingPhotos = Array.isArray(parsed.photos) ? (parsed.photos as string[]) : [];
        } catch {
          /* ignore parse errors */
        }
      }

      const notePayload = JSON.stringify({
        __kind: "invoice_meta",
        items: Array.isArray(body.items) ? body.items : existingItems,
        note: body.note !== undefined ? (body.note || null) : existingNote,
        tip: body.tip !== undefined ? Number(body.tip) || 0 : existingTip,
        promotion: body.promotion !== undefined ? (body.promotion || null) : existingPromotion,
        photos: body.photos !== undefined ? body.photos : existingPhotos,
      });

      const updateData: Record<string, unknown> = { note: notePayload };
      if (body.final_amount !== undefined) updateData.final_amount = body.final_amount;
      if (body.discount !== undefined) updateData.discount = body.discount;
      if (body.total_amount !== undefined) updateData.total_amount = body.total_amount;
      if (body.status !== undefined) updateData.status = body.status;
      if (body.payment_method !== undefined) updateData.payment_method = body.payment_method;

      const { data, error } = await supabaseAdmin
        .from("invoices")
        .update(updateData)
        .eq("id", id)
        .select("*, customer:customers(id, name, phone, code), branch:branches(id, name), staff:staff(id, name)")
        .single();
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

      // Keep the CSKH promotion used_count in sync when the promotion on this
      // invoice changes. Only adjust when the promotion id actually differs.
      //   - old promo removed/changed -> decrement old promo's used_count
      //   - new promo added/changed    -> increment new promo's used_count
      const oldPromoId =
        existingPromotion && typeof existingPromotion === "object"
          ? (existingPromotion as { id?: string }).id
          : undefined;
      const newPromoRaw = body.promotion !== undefined ? body.promotion : existingPromotion;
      const newPromoId =
        newPromoRaw && typeof newPromoRaw === "object"
          ? (newPromoRaw as { id?: string }).id
          : undefined;
      if (newPromoId !== oldPromoId) {
        try {
          if (oldPromoId) {
            const { data: cur } = await supabaseAdmin
              .from("incentives")
              .select("used_count")
              .eq("id", oldPromoId)
              .maybeSingle();
            const next = Math.max(0, (Number(cur?.used_count) || 0) - 1);
            await supabaseAdmin
              .from("incentives")
              .update({ used_count: next, updated_at: new Date().toISOString() })
              .eq("id", oldPromoId);
          }
          if (newPromoId) {
            const { data: cur } = await supabaseAdmin
              .from("incentives")
              .select("used_count")
              .eq("id", newPromoId)
              .maybeSingle();
            const next = (Number(cur?.used_count) || 0) + 1;
            await supabaseAdmin
              .from("incentives")
              .update({ used_count: next, updated_at: new Date().toISOString() })
              .eq("id", newPromoId);
          }
        } catch {
          // Best-effort; don't fail the invoice update.
        }
      }

      // Log an UPDATE_INVOICE activity (one row per edit) with a change
      // description shown in the activity history tooltip. If the status just
      // transitioned to "completed", also log a PAYMENT activity.
      const beforeState = {
        items: existingItems,
        tip: existingTip,
        promotion: existingPromotion as { id?: string; name?: string } | null,
        photos: existingPhotos,
        note: existingNote,
        final_amount: (current as { final_amount?: number | string | null } | null)?.final_amount ?? null,
        discount: (current as { discount?: number | string | null } | null)?.discount ?? null,
        total_amount: (current as { total_amount?: number | string | null } | null)?.total_amount ?? null,
        status: (current as { status?: string | null } | null)?.status ?? null,
        payment_method: (current as { payment_method?: string | null } | null)?.payment_method ?? null,
      };
      const actorStaffId = getCurrentStaffId(request) || (typeof body.created_by === "string" && body.created_by.trim() ? body.created_by.trim() : null);
      const invoiceCode = (current as { code?: string } | null)?.code || "";
      const branchIdForActivity = (current as { branch_id?: string | null } | null)?.branch_id || null;
      const changeDetail = describeInvoiceChanges(
        beforeState,
        body as Record<string, unknown>,
        existingItems,
        existingTip,
        existingPromotion as { id?: string; name?: string } | null,
        existingPhotos
      );
      await logActivity(
        id,
        invoiceCode,
        branchIdForActivity,
        "UPDATE_INVOICE",
        changeDetail,
        body.final_amount != null ? String(body.final_amount) : null,
        actorStaffId
      );
      // If this update completed payment, log a PAYMENT activity too.
      if (body.status === "completed" && beforeState.status !== "completed") {
        await logActivity(
          id,
          invoiceCode,
          branchIdForActivity,
          "PAYMENT",
          `Thanh toán hóa đơn ${invoiceCode}${body.final_amount != null ? ` - ${body.final_amount}đ` : ""}${body.payment_method ? ` (${body.payment_method})` : ""}`,
          body.final_amount != null ? String(body.final_amount) : null,
          actorStaffId
        );
        // Also log a CHECKOUT ("Hoàn tất") activity — the cashier pressed
        // "Hoàn tất" to finalize the payment.
        await logActivity(
          id,
          invoiceCode,
          branchIdForActivity,
          "CHECKOUT",
          `Hoàn tất thanh toán hóa đơn ${invoiceCode}`,
          body.final_amount != null ? String(body.final_amount) : null,
          actorStaffId
        );
      }

      // When the invoice transitions to "completed" (paid), mark the linked
      // booking as "checkout" so the orders list shows "Đã thanh toán".
      // This covers the pending-invoice → completed-payment flow (checkin then
      // pay) AND the direct-pay flow. Best-effort: don't fail the invoice.
      const bookingIdForStatus = (data as { booking_id?: string | null } | null)?.booking_id;
      if (bookingIdForStatus && body.status === "completed" && beforeState.status !== "completed") {
        try {
          await supabaseAdmin
            .from("bookings")
            .update({ status: "checkout" })
            .eq("id", bookingIdForStatus);
        } catch {
          // best-effort
        }
      }

      return NextResponse.json({ ok: true, data: decodeInvoiceMeta(data as Record<string, unknown>) });
    }

    // Standard field-by-field update (no tip/items change).
    const updateData: Record<string, unknown> = {};
    if (body.customer_id !== undefined) updateData.customer_id = body.customer_id;
    if (body.branch_id !== undefined) updateData.branch_id = body.branch_id;
    if (body.staff_id !== undefined) updateData.staff_id = body.staff_id || null;
    if (body.total_amount !== undefined) updateData.total_amount = body.total_amount;
    if (body.discount !== undefined) updateData.discount = body.discount;
    if (body.final_amount !== undefined) updateData.final_amount = body.final_amount;
    if (body.payment_method !== undefined) updateData.payment_method = body.payment_method;
    if (body.status !== undefined) updateData.status = body.status;
    if (body.note !== undefined) updateData.note = body.note;

    const { data, error } = await supabaseAdmin
      .from("invoices")
      .update(updateData)
      .eq("id", id)
      .select("*, customer:customers(id, name, phone, code), branch:branches(id, name), staff:staff(id, name)")
      .single();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    // Log an UPDATE_INVOICE activity (one row per edit) describing the changes.
    // Build a simple change description from the requested field updates.
    const actorStaffId = getCurrentStaffId(request) || (typeof body.created_by === "string" && body.created_by.trim() ? body.created_by.trim() : null);
    const updatedRow = data as { code?: string; branch_id?: string | null; status?: string | null; final_amount?: number | string | null; discount?: number | string | null; payment_method?: string | null } | null;
    const changeParts: string[] = [];
    if (body.customer_id !== undefined) changeParts.push("khách hàng");
    if (body.staff_id !== undefined) changeParts.push("nhân viên");
    if (body.total_amount !== undefined) changeParts.push("tổng tiền");
    if (body.discount !== undefined) changeParts.push(`chiết khấu: ${body.discount}`);
    if (body.final_amount !== undefined) changeParts.push(`thành tiền: ${body.final_amount}`);
    if (body.payment_method !== undefined) changeParts.push(`phương thức: ${body.payment_method}`);
    if (body.status !== undefined) changeParts.push(`trạng thái: ${body.status}`);
    if (body.note !== undefined) changeParts.push("ghi chú");
    const changeDetail = changeParts.length > 0 ? `Chỉnh sửa: ${changeParts.join(", ")}` : "Chỉnh sửa hóa đơn";
    await logActivity(
      id,
      updatedRow?.code || "",
      updatedRow?.branch_id || null,
      "UPDATE_INVOICE",
      changeDetail,
      body.final_amount != null ? String(body.final_amount) : null,
      actorStaffId
    );
    // If this update completed payment, log a PAYMENT activity too.
    if (body.status === "completed") {
      await logActivity(
        id,
        updatedRow?.code || "",
        updatedRow?.branch_id || null,
        "PAYMENT",
        `Thanh toán hóa đơn ${updatedRow?.code || ""}${body.final_amount != null ? ` - ${body.final_amount}đ` : ""}${body.payment_method ? ` (${body.payment_method})` : ""}`,
        body.final_amount != null ? String(body.final_amount) : null,
        actorStaffId
      );
    }

    return NextResponse.json({ ok: true, data: decodeInvoiceMeta(data as Record<string, unknown>) });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Before deleting, read the invoice's note to find any applied promotion
    // so its used_count can be decremented (keeps the CSKH counts accurate).
    const { data: existing } = await supabaseAdmin
      .from("invoices")
      .select("note")
      .eq("id", id)
      .maybeSingle();
    let promoId: string | undefined;
    const existingNote = (existing as { note?: string } | null)?.note;
    if (typeof existingNote === "string" && existingNote.includes(ITEMS_MARKER)) {
      try {
        const parsed = JSON.parse(existingNote) as { promotion?: unknown };
        const p = parsed.promotion as { id?: string } | null | undefined;
        if (p && typeof p === "object" && p.id) promoId = p.id;
      } catch {
        /* ignore */
      }
    }

    const { error } = await supabaseAdmin.from("invoices").delete().eq("id", id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    // Decrement the promotion's used_count (best-effort, never go below 0).
    if (promoId) {
      try {
        const { data: cur } = await supabaseAdmin
          .from("incentives")
          .select("used_count")
          .eq("id", promoId)
          .maybeSingle();
        const next = Math.max(0, (Number(cur?.used_count) || 0) - 1);
        await supabaseAdmin
          .from("incentives")
          .update({ used_count: next, updated_at: new Date().toISOString() })
          .eq("id", promoId);
      } catch {
        // Best-effort.
      }
    }

    return NextResponse.json({ ok: true, data: { id } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
