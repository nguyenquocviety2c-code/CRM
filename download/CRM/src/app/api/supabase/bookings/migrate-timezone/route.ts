import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * POST /api/supabase/bookings/migrate-timezone?dry_run=true|false&force=true
 *
 * ONE-OFF migration: fix the timezone inconsistency in the `bookings.date_time`
 * column. There are two data formats in that column:
 *
 *   1. LEGACY (seeded) bookings: `HH:MM+00:00` where HH:MM is the VIETNAM
 *      wall-clock time the user entered. The offset "+00:00" is LYING — the
 *      time is VN time, not UTC. These bookings were created before the app
 *      adopted the `+07:00` insert convention.
 *   2. NEW (UI-created) bookings: `HH:MM+00:00` where HH:MM is the UTC time
 *      (= VN − 7h). PostgREST normalizes `+07:00` to `+00:00` on insert, so
 *      the stored offset is correct and the HH:MM is the UTC time.
 *
 * The conflict check uses `new Date(date_time).getTime()` (epoch), which
 * parses the offset correctly. So a LEGACY booking "2026-07-08T10:30:00+00:00"
 * (where 10:30 is meant to be VN time) is interpreted as 10:30 UTC = 17:30 VN,
 * while a NEW booking "2026-07-08T03:30:00+00:00" (where 03:30 is the UTC
 * equivalent of 10:30 VN) is interpreted as 03:30 UTC = 10:30 VN. The 7-hour
 * gap means the conflict check fails to detect overlaps between LEGACY and NEW
 * bookings on the same staff at the same VN wall-clock time.
 *
 * This migration STANDARDIZES ALL bookings to the NEW format (raw HH:MM = UTC)
 * by subtracting 7 hours from the epoch of every LEGACY booking. After
 * migration, `new Date(date_time).getTime()` returns the correct UTC epoch for
 * ALL bookings, and `toVietnamTime(epoch)` (= epoch + 7h) gives the correct
 * VN wall-clock time for display + conflict checks.
 *
 * DETECTION HEURISTIC:
 *   - The new `+07:00` insert convention was first observed on the booking
 *     with `created_at = 2026-07-12T19:43:13Z` (LH000047, raw HH:MM "09:00",
 *     plausibly 16:00 VN as UTC; LH000048 created shortly after has raw "07:00"
 *     which only makes sense as 14:00 VN — LEGACY interpretation 07:00 VN is
 *     outside business hours). All bookings with `created_at` BEFORE that
 *     cutoff use the LEGACY format; all AT/AFTER use the NEW format.
 *   - We use a conservative cutoff of "2026-07-12T19:00:00Z" (about 45
 *     minutes before the first clearly-NEW booking) to leave a safety margin.
 *   - LH000047 (created at 19:43:13, exactly the boundary) is treated as NEW
 *     by this cutoff. It is a checkout (terminal status) so even if it's
 *     actually LEGACY, the impact is limited to display in reports (a 7-hour
 *     shift) — no impact on conflict detection.
 *
 * IDEMPOTENCY:
 *   - The route is NON-IDEMPOTENT: running it twice would subtract 7h again
 *     from already-migrated bookings, breaking them.
 *   - To prevent accidental double-runs, the route checks for an existing
 *     `migration-backup-*.json` file in the BACKUP_DIR. If one exists, the
 *     route refuses to run (returns 409 Conflict) unless `?force=true` is
 *     passed. Use `?force=true` ONLY if you've manually rolled back via the
 *     backup file and want to re-run from scratch.
 *
 * BACKUP:
 *   - Before mutating, the route writes a JSON backup of every booking's
 *     (id, code, original date_time, created_at) to
 *     `/home/z/my-project/migration-backup-{timestamp}.json`. Use this to
 *     roll back if needed (re-add 7h to every listed booking's date_time).
 *
 * USAGE:
 *   - curl -X POST http://localhost:3000/api/supabase/bookings/migrate-timezone?dry_run=true
 *     → returns a preview: list of bookings to migrate + count (no DB writes).
 *   - curl -X POST http://localhost:3000/api/supabase/bookings/migrate-timezone?dry_run=false
 *     → performs the actual UPDATEs (writes backup file first).
 */
const CUTOFF_ISO = "2026-07-12T19:00:00Z"; // created_at < this → LEGACY
const VN_OFFSET_MS = 7 * 60 * 60 * 1000; // 7 hours in ms
const BACKUP_DIR = "/home/z/my-project"; // writes migration-backup-{ts}.json here

/** Format an epoch ms as an ISO string in the same shape Supabase stores
 *  ("YYYY-MM-DDTHH:MM:SS+00:00"). Used for the UPDATE payload. */
function epochToIsoUtc(epoch: number): string {
  const d = new Date(epoch);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  const ss = String(d.getUTCSeconds()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}+00:00`;
}

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const dryRun = searchParams.get("dry_run") !== "false"; // default true (preview)
    const force = searchParams.get("force") === "true";
    const cutoffEpoch = new Date(CUTOFF_ISO).getTime();

    // Idempotency guard: refuse to run if a backup file already exists (the
    // migration has already been performed). Use ?force=true to override.
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    if (!dryRun && !force) {
      try {
        const files = await fs.readdir(BACKUP_DIR);
        const backupExists = files.some((f) =>
          /^migration-backup-\d+\.json$/.test(f)
        );
        if (backupExists) {
          return NextResponse.json(
            {
              ok: false,
              error:
                "A migration backup file already exists in " +
                BACKUP_DIR +
                " — the migration has already been run. Re-running would " +
                "double-subtract 7h from already-migrated bookings, breaking " +
                "them. To force (e.g. after a manual rollback), pass ?force=true.",
            },
            { status: 409 }
          );
        }
      } catch {
        // If readdir fails (e.g. directory doesn't exist), proceed.
      }
    }

    // 1. Fetch ALL bookings (id, code, date_time, created_at, status).
    const { data: allBookings, error: fetchErr } = await supabaseAdmin
      .from("bookings")
      .select("id, code, date_time, created_at, status")
      .order("created_at", { ascending: true });
    if (fetchErr) {
      return NextResponse.json(
        { ok: false, error: `Failed to fetch bookings: ${fetchErr.message}` },
        { status: 500 }
      );
    }
    const rows = (allBookings || []) as Array<{
      id: string;
      code: string | null;
      date_time: string;
      created_at: string;
      status: string;
    }>;

    // 2. Identify LEGACY bookings (need migration):
    //    created_at < cutoff. (The +07:00 convention was adopted at/after the
    //    cutoff; everything before uses the lying +00:00 / VN-time format.)
    const toMigrate: Array<{
      id: string;
      code: string | null;
      created_at: string;
      status: string;
      original_date_time: string;
      migrated_date_time: string;
      original_raw_hhmm: string;
      migrated_raw_hhmm: string;
    }> = [];
    const skipped: Array<{
      id: string;
      code: string | null;
      date_time: string;
      created_at: string;
      reason: string;
    }> = [];

    for (const b of rows) {
      if (!b.date_time || !b.created_at) {
        skipped.push({
          id: b.id,
          code: b.code,
          date_time: b.date_time,
          created_at: b.created_at,
          reason: "missing date_time or created_at",
        });
        continue;
      }
      const createdAtEpoch = new Date(b.created_at).getTime();
      if (isNaN(createdAtEpoch)) {
        skipped.push({
          id: b.id,
          code: b.code,
          date_time: b.date_time,
          created_at: b.created_at,
          reason: "invalid created_at",
        });
        continue;
      }
      const isLegacy = createdAtEpoch < cutoffEpoch;
      if (!isLegacy) {
        skipped.push({
          id: b.id,
          code: b.code,
          date_time: b.date_time,
          created_at: b.created_at,
          reason: `created_at ${b.created_at} >= cutoff ${CUTOFF_ISO} (NEW format, no migration needed)`,
        });
        continue;
      }
      // LEGACY → migrate (subtract 7h from the epoch).
      const originalEpoch = new Date(b.date_time).getTime();
      if (isNaN(originalEpoch)) {
        skipped.push({
          id: b.id,
          code: b.code,
          date_time: b.date_time,
          created_at: b.created_at,
          reason: "invalid date_time epoch",
        });
        continue;
      }
      const migratedEpoch = originalEpoch - VN_OFFSET_MS;
      const migratedIso = epochToIsoUtc(migratedEpoch);
      const originalRaw = b.date_time.slice(11, 16);
      const migratedRaw = migratedIso.slice(11, 16);
      toMigrate.push({
        id: b.id,
        code: b.code,
        created_at: b.created_at,
        status: b.status,
        original_date_time: b.date_time,
        migrated_date_time: migratedIso,
        original_raw_hhmm: originalRaw,
        migrated_raw_hhmm: migratedRaw,
      });
    }

    // 3. Dry-run: return preview without writing.
    if (dryRun) {
      return NextResponse.json({
        ok: true,
        dry_run: true,
        cutoff: CUTOFF_ISO,
        total_bookings: rows.length,
        to_migrate_count: toMigrate.length,
        skipped_count: skipped.length,
        to_migrate: toMigrate.map((m) => ({
          id: m.id,
          code: m.code,
          status: m.status,
          created_at: m.created_at,
          original_date_time: m.original_date_time,
          migrated_date_time: m.migrated_date_time,
          original_raw_hhmm: m.original_raw_hhmm,
          migrated_raw_hhmm: m.migrated_raw_hhmm,
        })),
        skipped,
      });
    }

    // 4. Real run: write a backup file, then UPDATE each booking.
    const backupPayload = {
      migrated_at: new Date().toISOString(),
      cutoff: CUTOFF_ISO,
      total_bookings: rows.length,
      migrated_count: toMigrate.length,
      bookings: toMigrate.map((m) => ({
        id: m.id,
        code: m.code,
        created_at: m.created_at,
        original_date_time: m.original_date_time,
        migrated_date_time: m.migrated_date_time,
      })),
    };
    const backupPath = path.join(
      BACKUP_DIR,
      `migration-backup-${Date.now()}.json`
    );
    try {
      await fs.writeFile(
        backupPath,
        JSON.stringify(backupPayload, null, 2),
        "utf8"
      );
    } catch (e) {
      console.warn("migration backup write failed:", e);
    }

    // 5. Perform the UPDATEs sequentially (Supabase's batch update via .in()
    //    would set the SAME date_time on every row, which is wrong — each
    //    row needs its own -7h-shifted value). Use a single update per row.
    let successCount = 0;
    let errorCount = 0;
    const errors: Array<{ id: string; code: string | null; error: string }> = [];
    for (const m of toMigrate) {
      const { error: updErr } = await supabaseAdmin
        .from("bookings")
        .update({ date_time: m.migrated_date_time })
        .eq("id", m.id);
      if (updErr) {
        errorCount++;
        errors.push({ id: m.id, code: m.code, error: updErr.message });
      } else {
        successCount++;
      }
    }

    return NextResponse.json({
      ok: true,
      dry_run: false,
      cutoff: CUTOFF_ISO,
      total_bookings: rows.length,
      to_migrate_count: toMigrate.length,
      migrated_count: successCount,
      error_count: errorCount,
      backup_path: backupPath,
      errors: errors.slice(0, 20),
      migrated_sample: toMigrate.slice(0, 15).map((m) => ({
        id: m.id,
        code: m.code,
        status: m.status,
        original_date_time: m.original_date_time,
        migrated_date_time: m.migrated_date_time,
        original_raw_hhmm: m.original_raw_hhmm,
        migrated_raw_hhmm: m.migrated_raw_hhmm,
      })),
      skipped_count: skipped.length,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Migration failed",
      },
      { status: 500 }
    );
  }
}
