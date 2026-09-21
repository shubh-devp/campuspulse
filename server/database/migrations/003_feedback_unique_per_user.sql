-- Migration: 003_feedback_unique_per_user
-- Enforce one feedback row per user per complaint at the database level
-- Apply with:
--   psql -U postgres -d campuspulse -f database/migrations/003_feedback_unique_per_user.sql

BEGIN;

-- Drop older duplicate rows first, otherwise the constraint cannot be added.
-- The first (lowest id) row for each complaint/user pair is kept.
DELETE FROM feedback f
USING feedback older
WHERE f.complaint_id = older.complaint_id
  AND f.user_id = older.user_id
  AND f.id > older.id;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'feedback_complaint_user_unique'
  ) THEN
    ALTER TABLE feedback
      ADD CONSTRAINT feedback_complaint_user_unique UNIQUE (complaint_id, user_id);
  END IF;
END $$;

COMMIT;
