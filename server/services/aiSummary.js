// Predictions are stored as "key=value" pairs separated by "; ", one row per model:
//   tfidf_logistic_regression+severity_keywords -> "category=IT & Network; priority=high; confidence=0.8325"
//   nlp_entity_extraction                      -> "locations=boys hostel|block a; facilities=wifi"
//   tfidf_cosine_similarity                    -> "duplicate_of=12; similarity=0.7799"
//   cv_image_classification                    -> "image=31; image_category=Electrical; model=mobilenet_v2_transfer"
// The Gemini text further down is generated on demand and never stored.

const { generateText } = require('./geminiClient');

const CATEGORY_MODEL_TYPE = 'tfidf_logistic_regression+severity_keywords';
const ENTITY_MODEL_TYPE = 'nlp_entity_extraction';
const DUPLICATE_MODEL_TYPE = 'tfidf_cosine_similarity';
const CV_MODEL_TYPE = 'cv_image_classification';

// prediction is a VARCHAR(150)
const MAX_SUMMARY_LENGTH = 150;

function fit(summary) {
  return summary.length > MAX_SUMMARY_LENGTH ? summary.slice(0, MAX_SUMMARY_LENGTH) : summary;
}

function buildCategorySummary(prediction) {
  const category = `category=${prediction.category}`;
  const priority = `priority=${prediction.priority}`;
  const confidence = prediction.confidence === null ? '' : `; confidence=${prediction.confidence}`;

  return fit(`${category}; ${priority}${confidence}`);
}

function buildEntitySummary(entities) {
  const parts = [];

  if (entities.locations.length > 0) {
    parts.push(`locations=${entities.locations.join('|')}`);
  }
  if (entities.facilities.length > 0) {
    parts.push(`facilities=${entities.facilities.join('|')}`);
  }

  return fit(parts.join('; '));
}

function buildDuplicateSummary(duplicate) {
  return fit(`duplicate_of=${duplicate.complaint_id}; similarity=${duplicate.similarity}`);
}

// The model is kept so callers can tell whether MobileNetV2 or the fallback answered.
function buildImageSummary(imageId, imageCategory, modelType) {
  return fit(`image=${imageId}; image_category=${imageCategory}; model=${modelType}`);
}

// Unknown or missing keys fall back to empty, so a truncated summary never throws.
function parseSummary(summary) {
  const values = {};

  (summary || '').split('; ').forEach((part) => {
    const separator = part.indexOf('=');
    if (separator > 0) {
      values[part.slice(0, separator)] = part.slice(separator + 1);
    }
  });

  return {
    category: values.category || null,
    priority: values.priority || null,
    locations: values.locations ? values.locations.split('|') : [],
    facilities: values.facilities ? values.facilities.split('|') : [],
    duplicateOf: values.duplicate_of ? Number(values.duplicate_of) : null,
    similarity: values.similarity ? Number(values.similarity) : null,
    image: values.image ? Number(values.image) : null,
    imageCategory: values.image_category || null,
    model: values.model || null,
  };
}

const TEXT_ONLY_RULES = `Use only the facts in the complaint record you are given.
Never invent dates, locations, causes, numbers of affected people, or resolutions.
If a detail is missing, say it is not available instead of guessing.
Reply with the finished text and nothing else: no preamble, no plan, no notes or
working-out, no restating of these instructions, no summary or "Duplicate" labels, no
headings, no bullet points, no markdown. Start straight in with the first sentence.`;

const SUMMARY_SYSTEM_INSTRUCTION = `You write short operational summaries of campus complaints for the maintenance staff and admins who have to act on them.

${TEXT_ONLY_RULES}

Write 2 to 4 sentences. State what and where the problem is, how urgent it looks and from the record alone what is already known about it. Do not add advice or opinions.`;

const DRAFT_SYSTEM_INSTRUCTION = `You draft short replies that a staff member can review and send to the student who reported a complaint.

${TEXT_ONLY_RULES}

Never promise a date and never say the problem is fixed unless the record says it is resolved.
If the record shows it is assigned, you may say it has been passed to the team handling it. If it is not assigned, say it has been received and is being looked at.
Be polite and brief: 2 to 4 sentences, and no signature.`;

const SUMMARY_REQUEST = 'Write the operational summary of this complaint.';
const DRAFT_REQUEST = 'Write the draft reply to the student who reported this complaint.';

// A timestamp from pg arrives as a Date, from a plain object as a string
function formatTimestamp(value) {
  if (!value) {
    return 'not available';
  }

  const date = value instanceof Date ? value : new Date(value);

  return Number.isNaN(date.getTime())
    ? 'not available'
    : date.toISOString().replace('T', ' ').slice(0, 16);
}

// Missing fields are spelled out as missing rather than left out, so there is
// nothing for the model to fill in with a guess.
function buildComplaintBrief(complaint) {
  const locations = complaint.entities?.locations || [];
  const facilities = complaint.entities?.facilities || [];
  const cluster = complaint.cluster;

  const lines = [
    `Title: ${complaint.title}`,
    `Description: ${complaint.description}`,
    `Category: ${complaint.category || 'not available'}`,
    `Priority: ${complaint.priority || 'not available'}`,
    `Status: ${complaint.status}`,
    `Reported location: ${complaint.location}`,
    `Reported at: ${formatTimestamp(complaint.created_at)}`,
    `Assigned to: ${complaint.assignedStaffName || 'nobody yet'}`,
    `Places found in the text: ${locations.length > 0 ? locations.join(', ') : 'none detected'}`,
    `Facilities found in the text: ${facilities.length > 0 ? facilities.join(', ') : 'none detected'}`,
    `Photo classification: ${
      complaint.imageCategory || 'no photo, or the photo could not be classified'
    }`,
    `Issue cluster: ${
      cluster
        ? `#${cluster.id} "${cluster.title}" together with ${cluster.complaint_count - 1} other complaint(s)`
        : 'not grouped with any other complaint'
    }`,
    `Possible duplicate of: ${
      complaint.duplicateOf
        ? `complaint #${complaint.duplicateOf.complaint_id} (${Math.round(
            complaint.duplicateOf.similarity * 100
          )}% similar)`
        : 'no duplicate found'
    }`,
  ];

  return lines.join('\n');
}

// The task comes first and the record second. With the record first the model
// sometimes treated the brief as text to continue and echoed a line of it back.
function buildSummaryPrompt(complaint) {
  return `${SUMMARY_REQUEST}\n\nComplaint record:\n${buildComplaintBrief(complaint)}`;
}

function buildDraftPrompt(complaint) {
  return `${DRAFT_REQUEST}\n\nComplaint record:\n${buildComplaintBrief(complaint)}`;
}

async function generateComplaintSummary(complaint) {
  const { text, model } = await generateText({
    systemInstruction: SUMMARY_SYSTEM_INSTRUCTION,
    prompt: buildSummaryPrompt(complaint),
  });

  return { summary: text, model };
}

/**
 * A draft reply to the student. It is only text: nothing is sent, and no status,
 * assignment or resolution is changed.
 *
 * @param {object} complaint structured complaint data, see buildComplaintBrief
 * @returns {Promise<{draft: string, model: string}>}
 */
async function generateStaffResponseDraft(complaint) {
  const { text, model } = await generateText({
    systemInstruction: DRAFT_SYSTEM_INSTRUCTION,
    prompt: buildDraftPrompt(complaint),
  });

  return { draft: text, model };
}

module.exports = {
  CATEGORY_MODEL_TYPE,
  ENTITY_MODEL_TYPE,
  DUPLICATE_MODEL_TYPE,
  CV_MODEL_TYPE,
  MAX_SUMMARY_LENGTH,
  buildCategorySummary,
  buildEntitySummary,
  buildDuplicateSummary,
  buildImageSummary,
  parseSummary,
  generateComplaintSummary,
  generateStaffResponseDraft,
  buildComplaintBrief,
  buildSummaryPrompt,
  buildDraftPrompt,
};
