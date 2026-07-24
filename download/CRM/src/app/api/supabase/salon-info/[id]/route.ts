import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * PUT /api/supabase/salon-info/[id]
 * Update salon info.
 * If `branch_name` is provided, also sync the name into the `branches` table
 * (for the branch linked via `branch_id`, or the first/default branch if not linked).
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const updateData: Record<string, unknown> = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.branch_name !== undefined) updateData.branch_name = body.branch_name || null;
    if (body.address !== undefined) updateData.address = body.address || null;
    if (body.phone !== undefined) updateData.phone = body.phone || null;
    if (body.email !== undefined) updateData.email = body.email || null;
    if (body.website !== undefined) updateData.website = body.website || null;
    if (body.fanpage !== undefined) updateData.fanpage = body.fanpage || null;
    if (body.open_time !== undefined) updateData.open_time = body.open_time || null;
    if (body.close_time !== undefined) updateData.close_time = body.close_time || null;
    if (body.logo !== undefined) updateData.logo = body.logo || null;
    if (body.branch_id !== undefined) updateData.branch_id = body.branch_id || null;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ ok: false, error: "No fields provided to update" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("salon_info")
      .update(updateData)
      .eq("id", id)
      .select("*, branch:branches(id, name)")
      .single();

    if (error) {
      console.error("PUT /api/supabase/salon-info error:", error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    // Sync branch_name into the branches table so that the BranchSelector
    // (and every module that lists branches) reflects the new name.
    const branchName = body.branch_name;
    if (typeof branchName === "string" && branchName.trim()) {
      const branchId = data?.branch_id || data?.branch?.id;

      if (branchId) {
        // Update the linked branch name
        await supabaseAdmin
          .from("branches")
          .update({ name: branchName.trim() })
          .eq("id", branchId);
      } else {
        // No branch linked yet — update the first/default branch (single-branch setup)
        const { data: branches } = await supabaseAdmin
          .from("branches")
          .select("id")
          .order("created_at", { ascending: true })
          .limit(1);

        if (branches && branches.length > 0) {
          const firstBranchId = branches[0].id;
          await supabaseAdmin
            .from("branches")
            .update({ name: branchName.trim() })
            .eq("id", firstBranchId);

          // Link this branch to salon_info for future syncs
          await supabaseAdmin
            .from("salon_info")
            .update({ branch_id: firstBranchId })
            .eq("id", id);
        }
      }
    }

    // Re-fetch to include the updated branch name
    const { data: refreshed } = await supabaseAdmin
      .from("salon_info")
      .select("*, branch:branches(id, name)")
      .eq("id", id)
      .single();

    return NextResponse.json({ ok: true, data: refreshed || data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update salon info";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
