const fs = require('fs');
const path = require('path');

const db = require('../config/db');
const { CATEGORY_MODEL_TYPE, parseSummary } = require('./aiSummary');

// Records what a human decided after the model had already answered. Reads the
// ai_feedback_dataset view, which joins ai_predictions (what the model said) with
// complaints, feedback and ai_feedback (what actually happened).
//
// Nothing here changes how a complaint is classified. Retraining is done by
// ai/evaluate_model.py, and it only promotes a candidate measured to be better.

// Same lists the classifier is limited to, so a correction can never introduce a
// value the pipeline could not have produced.
const CORRECTABLE_VALUES = {
  category: ['Infrastructure', 'IT & Network', 'Sanitation', 'Electrical', 'General'],
  priority: ['low', 'medium', 'high', 'urgent'],
};

const EVALUATION_REPORT_PATH = path.join(__dirname, '..', '..', 'ai', 'model', 'evaluation_report.json');

function allowedValuesFor(field) {
  return CORRECTABLE_VALUES[field] || null;
}

// The text is built the way predict.py builds it, so a model trained on these rows
// sees the same input it will see in production.
async function readDataset(limit = 2000) {
  const result = await db.query(
    `SELECT complaint_id, title, description, location, status,
            actual_category, actual_priority,
            predicted_category, predicted_priority,
            category_label_source, priority_label_source,
            confidence, reopen_count, student_rating, created_at
     FROM ai_feedback_dataset
     ORDER BY complaint_id DESC
     LIMIT $1`,
    [limit]
  );
  return result.rows;
}

function toTrainingRows(rows) {
  return rows
    .filter((row) => row.actual_category)
    .map((row) => ({
      complaint_id: row.complaint_id,
      text: `${row.title}. ${row.description}`.trim(),
      label: row.actual_category,
      label_source: row.category_label_source,
      predicted_category: row.predicted_category,
      confidence: row.confidence === null ? null : Number(row.confidence),
    }));
}

async function datasetSummary() {
  const result = await db.query(
    `SELECT
       COUNT(*)::int                                                          AS complaints,
       COUNT(*) FILTER (WHERE predicted_category IS NOT NULL)::int            AS with_prediction,
       COUNT(*) FILTER (WHERE category_label_source = 'human_corrected')::int AS corrected_categories,
       COUNT(*) FILTER (WHERE priority_label_source = 'human_corrected')::int AS corrected_priorities,
       COUNT(*) FILTER (WHERE student_rating IS NOT NULL)::int                AS with_feedback,
       COUNT(*) FILTER (WHERE reopen_count > 0)::int                          AS reopened,
       COUNT(*) FILTER (WHERE status IN ('resolved', 'closed'))::int          AS completed,
       ROUND(AVG(student_rating)::numeric, 2)                                 AS average_rating,
       ROUND(AVG(confidence)::numeric, 4)                                     AS average_confidence
     FROM ai_feedback_dataset`
  );

  const corrections = await db.query(
    `SELECT field, predicted_value, corrected_value, COUNT(*)::int AS count
     FROM ai_feedback
     GROUP BY field, predicted_value, corrected_value
     ORDER BY count DESC, field
     LIMIT 10`
  );

  return {
    ...result.rows[0],
    corrections: corrections.rows,
  };
}

// Returns null when the workflow has never been run, which is not an error
function readEvaluationReport() {
  try {
    return JSON.parse(fs.readFileSync(EVALUATION_REPORT_PATH, 'utf8'));
  } catch {
    return null;
  }
}

// Only fields that actually changed get a row, so the table stays a record of
// disagreements rather than of every save. The stored prediction is left untouched:
// it is the evidence the corrected value is later compared against.
async function applyCorrections({ complaintId, changes, role, userId, note }) {
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    const complaintResult = await client.query(
      'SELECT id, category, priority FROM complaints WHERE id = $1 FOR UPDATE',
      [complaintId]
    );

    if (complaintResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return { error: 'not_found' };
    }

    const complaint = complaintResult.rows[0];

    const predictionResult = await client.query(
      `SELECT prediction, model_type, confidence
       FROM ai_predictions
       WHERE complaint_id = $1 AND model_type = $2
       ORDER BY id DESC
       LIMIT 1`,
      [complaintId, CATEGORY_MODEL_TYPE]
    );

    const predictionRow = predictionResult.rows[0] || null;
    const predicted = parseSummary(predictionRow?.prediction);

    const recorded = [];

    for (const field of Object.keys(CORRECTABLE_VALUES)) {
      const nextValue = changes[field];
      if (nextValue === undefined || nextValue === null || nextValue === '') {
        continue;
      }

      if (!CORRECTABLE_VALUES[field].includes(nextValue) || nextValue === complaint[field]) {
        continue;
      }

      await client.query(
        `INSERT INTO ai_feedback
           (complaint_id, field, predicted_value, corrected_value, model_type,
            confidence, corrected_by, corrected_by_role, note)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          complaintId,
          field,
          field === 'category' ? predicted.category : predicted.priority,
          nextValue,
          predictionRow?.model_type || null,
          predictionRow?.confidence === null || predictionRow?.confidence === undefined
            ? null
            : Number(predictionRow.confidence),
          userId,
          role,
          note || null,
        ]
      );

      recorded.push({
        field,
        from: complaint[field],
        to: nextValue,
        predicted: field === 'category' ? predicted.category : predicted.priority,
      });
    }

    if (recorded.length === 0) {
      await client.query('ROLLBACK');
      return { error: 'no_change' };
    }

    const updated = await client.query(
      `UPDATE complaints
       SET category = $1, priority = $2, updated_at = LOCALTIMESTAMP
       WHERE id = $3
       RETURNING id, category, priority`,
      [changes.category || complaint.category, changes.priority || complaint.priority, complaintId]
    );

    // The correction is not written to complaint_status_history: that table is the
    // status timeline, and adding an entry with the status unchanged would show up
    // in the UI as a step that never happened. ai_feedback already records who
    // corrected what, and when.

    await client.query('COMMIT');

    return { complaint: updated.rows[0], corrections: recorded };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  CORRECTABLE_VALUES,
  allowedValuesFor,
  readDataset,
  toTrainingRows,
  datasetSummary,
  readEvaluationReport,
  applyCorrections,
};
