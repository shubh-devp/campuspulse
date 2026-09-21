-- Migration: 004_ai_feedback
--
-- Adds the learning loop. Nothing here changes how a complaint is classified:
-- it only records what a human decided after the model had already answered, and
-- puts the stored predictions, the real outcomes, the student feedback and those
-- corrections into one readable dataset.
--
-- Apply with:
--   psql -U postgres -d campuspulse -f database/migrations/004_ai_feedback.sql

BEGIN;

-- ---------------------------------------------------------------------------
-- ai_feedback: a human correction of a stored prediction
--
-- Every row is one field of one complaint that a staff member or an admin
-- disagreed with. It is deliberately separate from ai_predictions, because that
-- table is the model's own output and must stay untouched by people: mixing the
-- two would make it impossible to say later what the model actually predicted.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_feedback (
  id                SERIAL PRIMARY KEY,
  complaint_id      INTEGER NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
  field             VARCHAR(20) NOT NULL CHECK (field IN ('category', 'priority')),
  predicted_value   VARCHAR(150),
  corrected_value   VARCHAR(100) NOT NULL,
  model_type        VARCHAR(50),
  confidence        NUMERIC(5, 4) CHECK (confidence >= 0 AND confidence <= 1),
  corrected_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  corrected_by_role VARCHAR(20) CHECK (corrected_by_role IN ('staff', 'admin')),
  note              TEXT,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ai_feedback_complaint_id ON ai_feedback(complaint_id);
CREATE INDEX IF NOT EXISTS idx_ai_feedback_field        ON ai_feedback(field);

-- ---------------------------------------------------------------------------
-- ai_feedback_dataset: the labels, one row per complaint
--
-- Joins the four signals the learning loop needs, so the training data is a
-- query rather than a pile of glue code:
--
--   what the model said   -> ai_predictions (the classifier row)
--   what actually happened -> complaints.status, resolved_at, reopens
--   what the reporter said -> feedback.rating / comment
--   what a human changed   -> ai_feedback
--
-- category_label_source is the important column. 'ai_uncorrected' means the
-- label is the model's own answer, which is circular to train on; only
-- 'human_corrected' rows are an independent opinion. The evaluator reports both.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW ai_feedback_dataset AS
SELECT
  c.id            AS complaint_id,
  c.title,
  c.description,
  c.location,
  c.status,
  c.category      AS actual_category,
  c.priority      AS actual_priority,
  c.created_at,
  c.resolved_at,
  ap.model_type,
  ap.confidence,
  substring(ap.prediction from 'category=([^;]+)') AS predicted_category,
  substring(ap.prediction from 'priority=([^;]+)') AS predicted_priority,
  CASE
    WHEN ap.prediction IS NULL THEN 'no_prediction'
    WHEN corr.category_corrected THEN 'human_corrected'
    ELSE 'ai_uncorrected'
  END AS category_label_source,
  CASE
    WHEN ap.prediction IS NULL THEN 'no_prediction'
    WHEN corr.priority_corrected THEN 'human_corrected'
    ELSE 'ai_uncorrected'
  END AS priority_label_source,
  COALESCE(corr.category_corrected, FALSE) AS category_corrected,
  COALESCE(corr.priority_corrected, FALSE) AS priority_corrected,
  COALESCE(corr.correction_count, 0)       AS correction_count,
  COALESCE(reopened.reopen_count, 0)       AS reopen_count,
  fb.rating  AS student_rating,
  fb.comment AS student_comment
FROM complaints c
LEFT JOIN LATERAL (
  SELECT prediction, model_type, confidence
  FROM ai_predictions
  WHERE complaint_id = c.id
    AND model_type = 'tfidf_logistic_regression+severity_keywords'
  ORDER BY id DESC
  LIMIT 1
) ap ON TRUE
LEFT JOIN LATERAL (
  SELECT
    bool_or(field = 'category') AS category_corrected,
    bool_or(field = 'priority') AS priority_corrected,
    COUNT(*)::int               AS correction_count
  FROM ai_feedback f
  WHERE f.complaint_id = c.id
) corr ON TRUE
LEFT JOIN LATERAL (
  SELECT COUNT(*)::int AS reopen_count
  FROM complaint_status_history h
  WHERE h.complaint_id = c.id AND h.status = 'reopened'
) reopened ON TRUE
LEFT JOIN LATERAL (
  SELECT rating, comment
  FROM feedback f
  WHERE f.complaint_id = c.id
  ORDER BY created_at DESC
  LIMIT 1
) fb ON TRUE;

COMMIT;
