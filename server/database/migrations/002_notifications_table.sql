-- Migration: 002_notifications_table
-- Add notifications table for tracking meaningful events
-- Apply with:
--   psql -U postgres -d campuspulse -f database/migrations/002_notifications_table.sql

BEGIN;

-- ---------------------------------------------------------------------------
-- notifications: simple notification system for meaningful events
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type         VARCHAR(50) NOT NULL,
  title        VARCHAR(150) NOT NULL,
  message      TEXT NOT NULL,
  related_complaint_id INTEGER REFERENCES complaints(id) ON DELETE SET NULL,
  is_read      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for notification queries
CREATE INDEX IF NOT EXISTS idx_notifications_user_id      ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read      ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at    ON notifications(created_at);

COMMIT;