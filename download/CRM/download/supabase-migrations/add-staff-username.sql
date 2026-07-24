-- ============================================================================
-- Migration: Add username column + unique constraint to staff table
-- ----------------------------------------------------------------------------
-- Run this in the Supabase dashboard SQL Editor (or via psql) to enable the
-- staff account feature (Tài khoản tab in Cài đặt > Cài đặt nhân viên).
--
-- The staff table already has `email` and `password` columns (accepted by the
-- API but previously unused). This migration adds the `username` column and a
-- unique constraint so duplicate usernames are rejected (23505) at the DB
-- level, mirroring the existing unique constraints on `code` and `email`.
-- ============================================================================

-- 1. Add the username column (text, nullable — existing rows get NULL).
alter table staff add column if not exists username text;

-- 2. Add a unique constraint so two staff can't share the same username.
--    NULLs are allowed (multiple rows can have NULL username = no account).
--    Use `if not exists` so re-running the migration is safe.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'staff_username_unique'
      and conrelid = 'staff'::regclass
  ) then
    alter table staff add constraint staff_username_unique unique (username);
  end if;
end$$;

-- ----------------------------------------------------------------------------
-- Notes:
--  * `password` column already exists on staff (the API read/wrote it as
--    plaintext before). The new code hashes with scrypt before insert/update,
--    so going forward all new passwords are stored as `scrypt$<salt>$<hash>`.
--    Old plaintext values (if any) simply fail verification — there was no
--    login flow before, so no real users are affected.
--  * The unique constraint on `email` may or may not already exist. If you
--    want email uniqueness too, run:
--      alter table staff add constraint staff_email_unique unique (email);
--    (The API already returns 409 on duplicate email via the code path added
--    in this feature, but only if the DB enforces uniqueness.)
-- ----------------------------------------------------------------------------
