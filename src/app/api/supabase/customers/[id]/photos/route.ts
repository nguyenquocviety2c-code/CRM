import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import {
  decodeCustomerNote,
  encodeCustomerNote,
} from "@/lib/customer-meta";

/**
 * Customer photos backend (encoded-note pattern)
 * ----------------------------------------------
 * The Supabase `customers` table has no dedicated photos column and we cannot
 * run DDL from the app. So customer photos (an array of image URLs — typically
 * R2/S3 URLs returned by the upload API) are serialized as JSON into the
 * existing `note` TEXT column, using the SAME encoded-note pattern the
 * `invoices` table uses for its `items`/`tip`/`photos` fields.
 *
 * Encoding shape (see `src/lib/customer-meta.ts`):
 *   { "__kind": "customer_meta", "note": "<human note text>", "photos": ["https://...url1", "https://...url2"] }
 *
 * CRITICAL: the human `note` text is ALWAYS preserved when managing photos.
 *
 * Routes:
 *   GET    /api/supabase/customers/[id]/photos  -> { ok: true, data: { photos: [...] } }
 *   POST   /api/supabase/customers/[id]/photos  body: { url } -> append (dedup) -> { ok: true, data: { photos: [...] } }
 *   DELETE /api/supabase/customers/[id]/photos  body: { url } -> remove matching URL -> { ok: true, data: { photos: [...] } }
 */

/**
 * Fetch a customer's raw `note` field by id.
 * Returns `found: false` if the customer doesn't exist (caller decides whether
 * to 404).
 */
async function fetchRawNote(
  id: string
): Promise<{ note: unknown; found: boolean; error?: string }> {
  const { data, error } = await supabaseAdmin
    .from("customers")
    .select("note")
    .eq("id", id)
    .maybeSingle();
  if (error) return { note: null, found: false, error: error.message };
  if (!data) return { note: null, found: false };
  return { note: data.note, found: true };
}

/**
 * GET /api/supabase/customers/[id]/photos
 * Returns the customer's photos array (decoded from the `note` column).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const fetched = await fetchRawNote(id);
    if (fetched.error) {
      return NextResponse.json(
        { ok: false, error: fetched.error },
        { status: 500 }
      );
    }
    if (!fetched.found) {
      return NextResponse.json(
        { ok: false, error: "Customer not found" },
        { status: 404 }
      );
    }

    const { photos } = decodeCustomerNote(fetched.note);
    return NextResponse.json({ ok: true, data: { photos } });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed",
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/supabase/customers/[id]/photos
 * Body: { url: "https://..." } — append a single image URL to the photos array.
 * Avoids duplicate URLs. Preserves the existing human note text.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const url = typeof body?.url === "string" ? body.url.trim() : "";
    if (!url) {
      return NextResponse.json(
        { ok: false, error: "url is required" },
        { status: 400 }
      );
    }

    const fetched = await fetchRawNote(id);
    if (fetched.error) {
      return NextResponse.json(
        { ok: false, error: fetched.error },
        { status: 500 }
      );
    }
    if (!fetched.found) {
      return NextResponse.json(
        { ok: false, error: "Customer not found" },
        { status: 404 }
      );
    }

    const decoded = decodeCustomerNote(fetched.note);
    // Append the new URL (avoid exact duplicates).
    if (!decoded.photos.includes(url)) {
      decoded.photos = [...decoded.photos, url];
    }

    // Re-encode and persist (preserves the human note text).
    const encoded = encodeCustomerNote(decoded.note, decoded.photos);
    const { error: updateErr } = await supabaseAdmin
      .from("customers")
      .update({ note: encoded })
      .eq("id", id);
    if (updateErr) {
      return NextResponse.json(
        { ok: false, error: updateErr.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, data: { photos: decoded.photos } });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed",
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/supabase/customers/[id]/photos
 * Body: { url: "https://..." } — remove the matching URL from the photos array.
 * Preserves the existing human note text.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const url = typeof body?.url === "string" ? body.url.trim() : "";
    if (!url) {
      return NextResponse.json(
        { ok: false, error: "url is required" },
        { status: 400 }
      );
    }

    const fetched = await fetchRawNote(id);
    if (fetched.error) {
      return NextResponse.json(
        { ok: false, error: fetched.error },
        { status: 500 }
      );
    }
    if (!fetched.found) {
      return NextResponse.json(
        { ok: false, error: "Customer not found" },
        { status: 404 }
      );
    }

    const decoded = decodeCustomerNote(fetched.note);
    // Remove the matching URL.
    decoded.photos = decoded.photos.filter((p) => p !== url);

    // Re-encode and persist. We always re-encode with the marker once a photo
    // operation has happened, so subsequent reads decode consistently.
    const encoded = encodeCustomerNote(decoded.note, decoded.photos);
    const { error: updateErr } = await supabaseAdmin
      .from("customers")
      .update({ note: encoded })
      .eq("id", id);
    if (updateErr) {
      return NextResponse.json(
        { ok: false, error: updateErr.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, data: { photos: decoded.photos } });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed",
      },
      { status: 500 }
    );
  }
}
