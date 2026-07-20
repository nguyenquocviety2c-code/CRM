import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import {
  decodeCustomerNote,
  encodeCustomerNote,
} from "@/lib/customer-meta";

const CUSTOMER_SELECT =
  "*, source:customer_sources(id, name), group:customer_groups(id, name), branch:branches(id, name)";

/**
 * Resolve the encoded `note` value to write to the customers table for a
 * PUT/PATCH request, applying the encoded-note preservation rules (Task 5-a):
 *
 *   - If BOTH `body.note` and `body.photos` are undefined → do NOT touch the
 *     note column (return `value: undefined`).
 *   - If `body.note` is provided but `body.photos` is undefined → preserve the
 *     existing photos, swap in the new human note text.
 *   - If `body.photos` is provided (incl. `null` to clear) → use body.photos
 *     (null → []), and use body.note if provided else preserve existing note.
 *
 * Always re-encodes with the `customer_meta` marker so subsequent reads decode
 * correctly.
 *
 * Returns `{ value: undefined }` if the note column should not be touched.
 * Returns `{ value: <encoded string> }` if it should be written.
 * Returns `{ value: undefined, error }` on a fetch error.
 */
async function resolveEncodedNote(
  id: string,
  body: Record<string, unknown>
): Promise<{ value: string | undefined; error?: string }> {
  const hasNote = body.note !== undefined;
  const hasPhotos = body.photos !== undefined;
  if (!hasNote && !hasPhotos) return { value: undefined };

  // Fetch existing note to preserve whichever field isn't being updated.
  const { data: existing, error } = await supabaseAdmin
    .from("customers")
    .select("note")
    .eq("id", id)
    .maybeSingle();
  if (error) return { value: undefined, error: error.message };

  const decoded = decodeCustomerNote(existing?.note);

  // Resolve the new human note text.
  let newNote: string | null;
  if (hasNote) {
    if (typeof body.note === "string" && body.note.trim()) {
      newNote = body.note.trim();
    } else {
      newNote = null;
    }
  } else {
    newNote = decoded.note;
  }

  // Resolve the new photos array.
  let newPhotos: string[];
  if (hasPhotos) {
    if (body.photos == null) {
      newPhotos = [];
    } else if (Array.isArray(body.photos)) {
      newPhotos = (body.photos as unknown[]).filter(
        (p): p is string => typeof p === "string"
      );
    } else {
      // Wrong type — preserve existing rather than destroy data.
      newPhotos = decoded.photos;
    }
  } else {
    newPhotos = decoded.photos;
  }

  return { value: encodeCustomerNote(newNote, newPhotos) };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { data, error } = await supabaseAdmin
      .from("customers")
      .select(CUSTOMER_SELECT)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }
    if (!data) {
      return NextResponse.json(
        { ok: false, error: "Customer not found" },
        { status: 404 }
      );
    }
    // Enrich with customer_type: "old" if has >=1 completed invoice, else "new".
    const { data: invRows } = await supabaseAdmin
      .from("invoices")
      .select("customer_id")
      .eq("customer_id", id)
      .eq("status", "completed")
      .limit(1);
    const hasCompletedInvoice = (invRows ?? []).length > 0;
    // Decode the encoded-note (customer_meta) so the response exposes the
    // human `note` text + `photos` array as SEPARATE top-level fields. If the
    // note is plain text (no marker), `note` is returned as-is and `photos`
    // defaults to [] — so existing callers reading `note` as plain text still
    // work unchanged.
    const decodedNote = decodeCustomerNote(data.note);
    return NextResponse.json({
      ok: true,
      data: {
        ...data,
        note: decodedNote.note,
        photos: decodedNote.photos,
        has_completed_invoice: hasCompletedInvoice,
        customer_type: hasCompletedInvoice ? "old" : "new",
      },
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { ok: false, error: "Invalid body" },
        { status: 400 }
      );
    }

    const updateData: Record<string, unknown> = {};
    if (body.code !== undefined) updateData.code = body.code || null;
    if (body.name !== undefined) updateData.name = body.name?.trim() || null;
    if (body.phone !== undefined) updateData.phone = body.phone || null;
    if (body.email !== undefined) updateData.email = body.email || null;
    if (body.gender !== undefined)
      updateData.gender = body.gender === null ? null : String(body.gender);
    if (body.birthday !== undefined)
      updateData.birthday = body.birthday || null;
    if (body.address !== undefined) updateData.address = body.address || null;
    // NOTE: `body.note` is handled below via resolveEncodedNote() so we can
    // preserve the existing photos array (encoded-note pattern, Task 5-a).
    if (body.total_spent !== undefined)
      updateData.total_spent = Number(body.total_spent);
    if (body.debt !== undefined)
      updateData.debt = body.debt === null ? null : Number(body.debt);
    if (body.active !== undefined) updateData.active = Boolean(body.active);
    if (body.source_id !== undefined)
      updateData.source_id = body.source_id || null;
    if (body.group_id !== undefined)
      updateData.group_id = body.group_id || null;
    if (body.branch_id !== undefined)
      updateData.branch_id = body.branch_id || null;

    // Resolve the encoded note (preserves existing photos when only body.note
    // is provided; preserves existing note text when only body.photos is
    // provided; skips entirely if neither is provided).
    const noteResolution = await resolveEncodedNote(id, body);
    if (noteResolution.error) {
      return NextResponse.json(
        { ok: false, error: noteResolution.error },
        { status: 500 }
      );
    }
    if (noteResolution.value !== undefined) {
      updateData.note = noteResolution.value;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { ok: false, error: "No fields provided to update" },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("customers")
      .update(updateData)
      .eq("id", id)
      .select(CUSTOMER_SELECT)
      .single();

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }
    // Decode the note so the response exposes `note` (human text) + `photos`
    // (array) as separate top-level fields (consistent with GET).
    const decodedNote = decodeCustomerNote(data.note);
    return NextResponse.json({
      ok: true,
      data: { ...data, note: decodedNote.note, photos: decodedNote.photos },
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { ok: false, error: "Invalid body" },
        { status: 400 }
      );
    }

    const updateData: Record<string, unknown> = {};
    // NOTE: "note" is intentionally ABSENT from this list — it is handled
    // separately below via resolveEncodedNote() so the existing photos array
    // (encoded in the note column) is preserved when only `body.note` is
    // provided (encoded-note pattern, Task 5-a).
    const allowedFields = [
      "code",
      "name",
      "phone",
      "email",
      "gender",
      "birthday",
      "address",
      "total_spent",
      "debt",
      "active",
      "source_id",
      "group_id",
      "branch_id",
    ];

    for (const field of allowedFields) {
      if (body[field] === undefined) continue;
      if (["total_spent", "debt"].includes(field)) {
        updateData[field] =
          body[field] === null ? null : Number(body[field]);
      } else if (field === "active") {
        updateData[field] = Boolean(body[field]);
      } else if (field === "gender") {
        updateData[field] =
          body[field] === null ? null : String(body[field]);
      } else if (field === "name") {
        updateData[field] = body[field]?.trim() || null;
      } else {
        updateData[field] = body[field] || null;
      }
    }

    // Resolve the encoded note (preserves existing photos when only body.note
    // is provided; preserves existing note text when only body.photos is
    // provided; skips entirely if neither is provided).
    const noteResolution = await resolveEncodedNote(id, body);
    if (noteResolution.error) {
      return NextResponse.json(
        { ok: false, error: noteResolution.error },
        { status: 500 }
      );
    }
    if (noteResolution.value !== undefined) {
      updateData.note = noteResolution.value;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { ok: false, error: "No fields provided to update" },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("customers")
      .update(updateData)
      .eq("id", id)
      .select(CUSTOMER_SELECT)
      .single();

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }
    // Decode the note so the response exposes `note` (human text) + `photos`
    // (array) as separate top-level fields (consistent with GET).
    const decodedNote = decodeCustomerNote(data.note);
    return NextResponse.json({
      ok: true,
      data: { ...data, note: decodedNote.note, photos: decodedNote.photos },
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Check bookings referencing this customer
    const { data: bookings, error: bookingErr } = await supabaseAdmin
      .from("bookings")
      .select("id")
      .eq("customer_id", id)
      .limit(1);

    if (!bookingErr && bookings && bookings.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Không thể xóa khách hàng vì đang có lịch hẹn liên quan đến khách hàng này",
        },
        { status: 409 }
      );
    }

    const { error } = await supabaseAdmin
      .from("customers")
      .delete()
      .eq("id", id);
    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }
    return NextResponse.json({ ok: true, data: { id } });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
