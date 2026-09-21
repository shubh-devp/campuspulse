-- CampusPulse database schema
--
-- Apply with:
--   psql -U postgres -d campuspulse -f database/schema.sql

BEGIN;

-- ---------------------------------------------------------------------------
-- users: students, staff and admins
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(100) NOT NULL,
  email         VARCHAR(150) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role          VARCHAR(20)  NOT NULL DEFAULT 'student'
                CHECK (role IN ('student', 'staff', 'admin')),
  department    VARCHAR(100),
  phone         VARCHAR(20),
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------------
-- issue_clusters: group of complaints describing the same problem
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS issue_clusters (
  id          SERIAL PRIMARY KEY,
  title       VARCHAR(150) NOT NULL,
  description TEXT,
  category    VARCHAR(50),
  location    VARCHAR(150),
  status      VARCHAR(20) NOT NULL DEFAULT 'open'
              CHECK (status IN ('open', 'in_progress', 'resolved')),
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP
);

-- ---------------------------------------------------------------------------
-- complaints
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS complaints (
  id               SERIAL PRIMARY KEY,
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title            VARCHAR(150) NOT NULL,
  description      TEXT NOT NULL,
  category         VARCHAR(50),
  location         VARCHAR(150),
  priority         VARCHAR(20) DEFAULT 'medium'
                   CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status           VARCHAR(20) NOT NULL DEFAULT 'open'
                   CHECK (status IN ('open', 'assigned', 'in_progress', 'resolved',
                                     'closed', 'rejected', 'duplicate', 'reopened')),
  issue_cluster_id INTEGER REFERENCES issue_clusters(id) ON DELETE SET NULL,
  created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at      TIMESTAMP
);

-- ---------------------------------------------------------------------------
-- complaint_images: optional photos attached to a complaint
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS complaint_images (
  id           SERIAL PRIMARY KEY,
  complaint_id INTEGER NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
  file_url     VARCHAR(255) NOT NULL,
  file_name    VARCHAR(150) NOT NULL,
  uploaded_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------------
-- complaint_status_history: audit trail of status changes
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS complaint_status_history (
  id           SERIAL PRIMARY KEY,
  complaint_id INTEGER NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
  status       VARCHAR(20) NOT NULL
               CHECK (status IN ('open', 'assigned', 'in_progress', 'resolved',
                                 'closed', 'rejected', 'duplicate', 'reopened')),
  changed_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  note         TEXT,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------------
-- assignments: which staff member handles which complaint
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS assignments (
  id           SERIAL PRIMARY KEY,
  complaint_id INTEGER NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
  staff_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_by  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP
);

-- ---------------------------------------------------------------------------
-- ai_predictions: stored ML/NLP output for a complaint
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_predictions (
  id           SERIAL PRIMARY KEY,
  complaint_id INTEGER NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
  model_type   VARCHAR(50) NOT NULL,
  prediction   VARCHAR(150) NOT NULL,
  confidence   NUMERIC(5, 4) CHECK (confidence >= 0 AND confidence <= 1),
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------------
-- feedback: student rating after a complaint is resolved
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS feedback (
  id           SERIAL PRIMARY KEY,
  complaint_id INTEGER NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating       SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment      TEXT,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (complaint_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Indexes for the queries the app will actually run
-- (users.email already has an index from its UNIQUE constraint)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_complaints_user_id          ON complaints(user_id);
CREATE INDEX IF NOT EXISTS idx_complaints_status           ON complaints(status);
CREATE INDEX IF NOT EXISTS idx_complaints_category         ON complaints(category);
CREATE INDEX IF NOT EXISTS idx_complaints_issue_cluster_id ON complaints(issue_cluster_id);

CREATE INDEX IF NOT EXISTS idx_complaint_images_complaint_id    ON complaint_images(complaint_id);
CREATE INDEX IF NOT EXISTS idx_status_history_complaint_id      ON complaint_status_history(complaint_id);
CREATE INDEX IF NOT EXISTS idx_assignments_complaint_id         ON assignments(complaint_id);
CREATE INDEX IF NOT EXISTS idx_assignments_staff_id             ON assignments(staff_id);
CREATE INDEX IF NOT EXISTS idx_ai_predictions_complaint_id      ON ai_predictions(complaint_id);
CREATE INDEX IF NOT EXISTS idx_feedback_complaint_id           ON feedback(complaint_id);

-- ---------------------------------------------------------------------------
-- ai_feedback: a human correction of a stored prediction
--
-- Kept apart from ai_predictions, which is the model's own output: a correction
-- is an opinion about the model, not something the model produced. See
-- migrations/004_ai_feedback.sql.
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
-- ai_feedback_dataset: the training labels, one row per complaint
--
-- Joins what the model predicted, what actually happened, what the reporter
-- rated and what a human corrected, so the learning loop reads one view.
-- category_label_source tells the two kinds of label apart: 'ai_uncorrected'
-- rows are the model's own answer, 'human_corrected' rows are an independent
-- opinion and are the only ones worth trusting as a new label.
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
