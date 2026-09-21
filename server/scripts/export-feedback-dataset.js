// Writes the learning-loop dataset to ai/model/feedback_dataset.json: PostgreSQL holds
// the labels (the ai_feedback_dataset view), Node reads them out, and
// ai/evaluate_model.py trains a candidate from the file. Python never connects to the
// database, it stays a read-JSON-in, print-JSON-out script like predict.py.
//
//   node server/scripts/export-feedback-dataset.js

const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { readDataset, toTrainingRows, datasetSummary } = require('../services/aiFeedback');

const OUTPUT_PATH = path.join(__dirname, '..', '..', 'ai', 'model', 'feedback_dataset.json');

async function main() {
  const rows = await readDataset();
  const trainingRows = toTrainingRows(rows);
  const summary = await datasetSummary();

  const payload = {
    generated_at: new Date().toISOString(),
    source: 'ai_feedback_dataset',
    summary,
    rows: trainingRows,
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(payload, null, 2), 'utf8');

  console.log(`complaints in the dataset : ${summary.complaints}`);
  console.log(`labelled rows written     : ${trainingRows.length}`);
  console.log(`human corrected           : ${summary.corrected_categories} category, ${summary.corrected_priorities} priority`);
  console.log(`with student feedback     : ${summary.with_feedback}`);
  console.log(`file                      : ${OUTPUT_PATH}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Could not export the dataset:', error.message);
    process.exit(1);
  });
