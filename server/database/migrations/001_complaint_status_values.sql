-- Step 3A: align the complaint status values with the complaint lifecycle.
--
-- Step 2A only allowed ('pending', 'in_progress', 'resolved', 'rejected'), but the
-- complaint workflow uses: open, assigned, in_progress, resolved, closed, rejected,
-- duplicate, reopened.
--
-- Apply with:
--   psql -U postgres -d campuspulse -f database/migrations/001_complaint_status_values.sql

BEGIN;

ALTER TABLE complaints DROP CONSTRAINT IF EXISTS complaints_status_check;
ALTER TABLE complaints ADD CONSTRAINT complaints_status_check
  CHECK (status IN ('open', 'assigned', 'in_progress', 'resolved',
                    'closed', 'rejected', 'duplicate', 'reopened'));

ALTER TABLE complaints ALTER COLUMN status SET DEFAULT 'open';

ALTER TABLE complaint_status_history DROP CONSTRAINT IF EXISTS complaint_status_history_status_check;
ALTER TABLE complaint_status_history ADD CONSTRAINT complaint_status_history_status_check
  CHECK (status IN ('open', 'assigned', 'in_progress', 'resolved',
                    'closed', 'rejected', 'duplicate', 'reopened'));

COMMIT;
