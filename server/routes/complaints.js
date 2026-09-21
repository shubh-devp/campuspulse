const express = require('express');

const db = require('../config/db');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');
const {
  uploadImages,
  persistImages,
  finalizeUploads,
  deleteUploadedFiles,
} = require('../middleware/upload');
const { predictComplaint } = require('../services/aiClassifier');
const { classifyImage } = require('../services/cvClassifier');
const { findDuplicate } = require('../services/duplicateDetector');
const { findCluster } = require('../services/clusterManager');
const { GeminiError } = require('../services/geminiClient');
const {
  ENTITY_MODEL_TYPE,
  DUPLICATE_MODEL_TYPE,
  CV_MODEL_TYPE,
  buildCategorySummary,
  buildEntitySummary,
  buildDuplicateSummary,
  buildImageSummary,
  parseSummary,
  generateComplaintSummary,
  generateStaffResponseDraft,
} = require('../services/aiSummary');
const {
  applyCorrections,
  allowedValuesFor,
  datasetSummary,
  readEvaluationReport,
} = require('../services/aiFeedback');
const { buildInsights } = require('../services/aiInsights');

const router = express.Router();

// Every complaint route needs a logged-in user
router.use(authMiddleware);

const ALLOWED_STATUSES = [
  'open',
  'assigned',
  'in_progress',
  'resolved',
  'closed',
  'rejected',
  'duplicate',
  'reopened',
];

// Which status may follow which. Kept as a plain object so it is easy to read and change.
const ALLOWED_TRANSITIONS = {
  open: ['assigned', 'rejected', 'duplicate'],
  assigned: ['in_progress', 'rejected', 'duplicate'],
  in_progress: ['resolved', 'reopened'],
  resolved: ['closed'],
  closed: ['reopened'],
  reopened: ['assigned', 'in_progress'],
  rejected: [],
  duplicate: [],
};

// Columns we are happy to send back to the client
const COMPLAINT_COLUMNS = `id, title, description, category, location, priority, status,
                           issue_cluster_id, created_at, updated_at, resolved_at`;

function parseComplaintId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function isStaffOrAdmin(role) {
  return role === 'staff' || role === 'admin';
}

// Create a notification for a specific user about a complaint event
async function createNotification(dbClient, userId, type, title, message, complaintId) {
  try {
    await dbClient.query(
      `INSERT INTO notifications (user_id, type, title, message, related_complaint_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, type, title, message, complaintId || null]
    );
  } catch (err) {
    console.error('Failed to create notification:', err.message);
  }
}

// Send lifecycle notifications
async function sendComplaintNotifications(dbClient, complaintId, title, status, reporterId, event, extra = {}) {
  const relatedComplaintId = complaintId;

  switch (event) {
    case 'submitted':
      await createNotification(dbClient, reporterId, 'complaint_submitted',
        'Complaint Submitted',
        `Your complaint "${title}" has been submitted successfully.`,
        relatedComplaintId);
      break;
    case 'assigned':
      await createNotification(dbClient, reporterId, 'complaint_assigned',
        'Complaint Assigned',
        `Your complaint "${title}" has been assigned to a staff member.`,
        relatedComplaintId);
      if (extra.assigneeId) {
        await createNotification(dbClient, extra.assigneeId, 'complaint_assigned_to_you',
          'New Complaint Assigned',
          `You have been assigned complaint "${title}".`,
          relatedComplaintId);
      }
      break;
    case 'status_changed':
      await createNotification(dbClient, reporterId, 'complaint_status_changed',
        'Status Updated',
        `Your complaint "${title}" is now "${status}".`,
        relatedComplaintId);
      break;
    case 'resolved':
      await createNotification(dbClient, reporterId, 'complaint_resolved',
        'Complaint Resolved',
        `Your complaint "${title}" has been marked as resolved. You can now submit feedback.`,
        relatedComplaintId);
      break;
    case 'closed':
      await createNotification(dbClient, reporterId, 'complaint_closed',
        'Complaint Closed',
        `Your complaint "${title}" has been closed.`,
        relatedComplaintId);
      break;
    case 'reopened':
      await createNotification(dbClient, reporterId, 'complaint_reopened',
        'Complaint Reopened',
        `Your complaint "${title}" has been reopened.`,
        relatedComplaintId);
      break;
    default:
      break;
  }
}

// A complaint may be given to a staff member while it is still being worked on
const ASSIGNABLE_STATUSES = ['open', 'reopened', 'assigned', 'in_progress'];

// Duplicate checking only compares against complaints that are still being worked on
const ACTIVE_STATUSES = ['open', 'assigned', 'in_progress'];
const ACTIVE_COMPLAINTS_LIMIT = 100;

// Clusters also only grow while they are open, and only 100 are considered at a time
const OPEN_CLUSTER_LIMIT = 100;

// One row per analysis, always inside the caller's transaction
function insertPrediction(client, complaintId, modelType, summary, confidence) {
  return client.query(
    `INSERT INTO ai_predictions (complaint_id, model_type, prediction, confidence)
     VALUES ($1, $2, $3, $4)`,
    [complaintId, modelType, summary, confidence]
  );
}

// Recent active complaints with the places extracted from them, which the duplicate
// check uses to tell "the same problem" apart from "the same problem elsewhere"
async function loadActiveComplaints() {
  const result = await db.query(
    `SELECT c.id, c.title, c.description,
            (SELECT p.prediction FROM ai_predictions p
             WHERE p.complaint_id = c.id AND p.model_type = $2
             ORDER BY p.id DESC LIMIT 1) AS entity_summary
     FROM complaints c
     WHERE c.status = ANY($1)
     ORDER BY c.created_at DESC
     LIMIT $3`,
    [ACTIVE_STATUSES, ENTITY_MODEL_TYPE, ACTIVE_COMPLAINTS_LIMIT]
  );

  return result.rows.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    locations: parseSummary(row.entity_summary).locations,
  }));
}

// Open issue clusters, represented by the complaint that started them. The places
// and facilities of that first complaint are what the clustering rule compares with.
async function loadOpenClusters() {
  const result = await db.query(
    `SELECT ic.id, ic.title, ic.description, ic.location, ic.category,
            (SELECT COUNT(*)::int FROM complaints c
             WHERE c.issue_cluster_id = ic.id) AS complaint_count,
            (SELECT p.prediction FROM ai_predictions p
             JOIN complaints c ON c.id = p.complaint_id
             WHERE c.issue_cluster_id = ic.id AND p.model_type = $2
             ORDER BY p.id ASC LIMIT 1) AS entity_summary
     FROM issue_clusters ic
     WHERE ic.status = 'open'
     ORDER BY ic.updated_at DESC
     LIMIT $1`,
    [OPEN_CLUSTER_LIMIT, ENTITY_MODEL_TYPE]
  );

  return result.rows.map((row) => {
    const entities = parseSummary(row.entity_summary);

    return {
      id: row.id,
      title: row.title,
      description: row.description,
      location: row.location,
      locations: entities.locations,
      facilities: entities.facilities,
    };
  });
}

// Returns null when there is no such complaint. Permission is the caller's concern,
// so this stays a plain read.
async function loadComplaintDetail(complaintId) {
  const complaintResult = await db.query(
    `SELECT ${COMPLAINT_COLUMNS}, user_id FROM complaints WHERE id = $1`,
    [complaintId]
  );

  if (complaintResult.rows.length === 0) {
    return null;
  }

  const complaint = complaintResult.rows[0];
  const ownerId = complaint.user_id;
  delete complaint.user_id;

  const historyResult = await db.query(
    `SELECT id, status, note, changed_by, created_at
     FROM complaint_status_history
     WHERE complaint_id = $1
     ORDER BY created_at ASC, id ASC`,
    [complaintId]
  );

  const imagesResult = await db.query(
    `SELECT id, file_url, file_name, uploaded_at
     FROM complaint_images
     WHERE complaint_id = $1
     ORDER BY id ASC`,
    [complaintId]
  );

  // Every analysis for this complaint: the classifier, the extracted entities, the
  // images and, when one was found, the duplicate warning
  const predictionResult = await db.query(
    `SELECT id, model_type, prediction, confidence, created_at
     FROM ai_predictions
     WHERE complaint_id = $1
     ORDER BY id ASC`,
    [complaintId]
  );

  const predictions = predictionResult.rows;
  const entityRow = predictions.find((row) => row.model_type === ENTITY_MODEL_TYPE);
  const duplicateRow = predictions.find((row) => row.model_type === DUPLICATE_MODEL_TYPE);
  const entityValues = parseSummary(entityRow?.prediction);
  const duplicateValues = duplicateRow ? parseSummary(duplicateRow.prediction) : null;

  // One CV row per analysed image, so each photo can show its own tag
  const analysisByImage = new Map();
  predictions
    .filter((row) => row.model_type === CV_MODEL_TYPE)
    .forEach((row) => {
      const values = parseSummary(row.prediction);
      if (values.image) {
        analysisByImage.set(values.image, {
          category: values.imageCategory,
          confidence: row.confidence === null ? null : Number(row.confidence),
          // The row says which kind of analysis this is, the summary says which model ran
          model_type: values.model || row.model_type,
        });
      }
    });

  const images = imagesResult.rows.map((image) => ({
    ...image,
    image_analysis: analysisByImage.get(image.id) || null,
  }));

  // The cluster this complaint was grouped into, with how many complaints it holds
  let cluster = null;

  if (complaint.issue_cluster_id) {
    const clusterResult = await db.query(
      `SELECT ic.id, ic.title, ic.category, ic.location, ic.status,
              (SELECT COUNT(*)::int FROM complaints c
               WHERE c.issue_cluster_id = ic.id) AS complaint_count
       FROM issue_clusters ic
       WHERE ic.id = $1`,
      [complaint.issue_cluster_id]
    );
    cluster = clusterResult.rows[0] || null;
  }

  const assigneeResult = await db.query(
    `SELECT s.name FROM assignments a
     JOIN users s ON s.id = a.staff_id
     WHERE a.complaint_id = $1
     ORDER BY a.assigned_at DESC, a.id DESC LIMIT 1`,
    [complaintId]
  );

const feedbackResult = await db.query(
      `SELECT f.id, f.rating, f.comment, f.created_at, u.name AS reviewer_name
       FROM feedback f
       JOIN users u ON u.id = f.user_id
       WHERE f.complaint_id = $1
       ORDER BY f.created_at DESC`,
      [complaintId]
    );

    return {
      complaint,
      owner_id: ownerId,
      status_history: historyResult.rows,
      images,
      ai_prediction:
        predictions.find(
          (row) =>
            row.model_type !== ENTITY_MODEL_TYPE &&
            row.model_type !== DUPLICATE_MODEL_TYPE &&
            row.model_type !== CV_MODEL_TYPE
        ) || null,
      entities: {
        locations: entityValues.locations,
        facilities: entityValues.facilities,
      },
      duplicate_warning:
        duplicateValues && duplicateValues.duplicateOf
          ? { complaint_id: duplicateValues.duplicateOf, similarity: duplicateValues.similarity }
          : null,
      cluster,
      assigned_staff_name: assigneeResult.rows[0]?.name || null,
      feedback: feedbackResult.rows,
    };
}

// The same fields the detail view shows, so nothing extra leaves the app
function buildAiContext(detail) {
  const imageTag = detail.images.find((image) => image.image_analysis)?.image_analysis;

  return {
    title: detail.complaint.title,
    description: detail.complaint.description,
    category: detail.complaint.category,
    priority: detail.complaint.priority,
    status: detail.complaint.status,
    location: detail.complaint.location,
    created_at: detail.complaint.created_at,
    assignedStaffName: detail.assigned_staff_name,
    entities: detail.entities,
    cluster: detail.cluster,
    duplicateOf: detail.duplicate_warning,
    imageCategory: imageTag ? imageTag.category : null,
  };
}

// Shared by the two text generation endpoints. Never writes anything: the complaint,
// its status, its assignment and its resolution are left exactly as they were.
async function handleAiRequest(req, res, generate) {
  const complaintId = parseComplaintId(req.params.id);

  if (!complaintId) {
    return res.status(400).json({ message: 'Invalid complaint id' });
  }

  try {
    const detail = await loadComplaintDetail(complaintId);

    if (!detail) {
      return res.status(404).json({ message: 'Complaint not found' });
    }

    res.json(await generate(buildAiContext(detail)));
  } catch (error) {
    // Gemini being missing, slow or unhappy is a 503, and says nothing about the
    // complaint itself. The rest of the app keeps working either way.
    if (error instanceof GeminiError) {
      return res.status(503).json({ message: error.message });
    }

    console.error('Generate text error:', error.message);
    res.status(500).json({ message: 'Could not generate the text, please try again' });
  }
}

// POST /api/complaints
// Accepts JSON or multipart/form-data (with an optional "images" file field)
router.post('/', roleMiddleware('student'), uploadImages, async (req, res) => {
  const { title, description, location } = req.body;

  const cleanTitle = typeof title === 'string' ? title.trim() : '';
  const cleanDescription = typeof description === 'string' ? description.trim() : '';
  const cleanLocation = typeof location === 'string' ? location.trim() : '';

  if (!cleanTitle || !cleanDescription || !cleanLocation) {
    await deleteUploadedFiles(req.files);
    return res.status(400).json({ message: 'Title, description and location are required' });
  }

  // Everything the AI layer looks at happens before the transaction is opened, so no
  // database connection is held while Python runs or while the images are being
  // stored. The two scripts, the two candidate queries and the image upload do not
  // depend on each other, so they run together.
  const primaryImage = (req.files || [])[0] || null;

  let prediction;
  let imageAnalysis;
  let activeComplaints;
  let openClusters;
  let storedImages;

  try {
    [prediction, imageAnalysis, activeComplaints, openClusters, storedImages] = await Promise.all([
      predictComplaint({ title: cleanTitle, description: cleanDescription }),
      primaryImage ? classifyImage(primaryImage.path) : Promise.resolve(null),
      loadActiveComplaints(),
      loadOpenClusters(),
      persistImages(req.files),
    ]);
  } catch (error) {
    // Nothing was written yet, so the images are removed again
    await deleteUploadedFiles(req.files);
    console.error('Complaint analysis error:', error.message);
    return res.status(500).json({ message: 'Could not submit the complaint, please try again' });
  }

  const category = prediction ? prediction.category : null;
  const priority = prediction ? prediction.priority : 'medium';
  const entities = prediction ? prediction.entities : { locations: [], facilities: [] };

  // Compared against the complaints that are still open or being worked on
  const duplicate = findDuplicate(
    { title: cleanTitle, description: cleanDescription, locations: entities.locations },
    activeComplaints
  );

  // Compared against the open clusters about the same place and facility
  const clusterMatch = findCluster(
    {
      title: cleanTitle,
      description: cleanDescription,
      location: cleanLocation,
      locations: entities.locations,
      facilities: entities.facilities,
    },
    openClusters
  );

  const client = await db.connect();

  try {
    await client.query('BEGIN');

    // The complaint joins the matching cluster or starts one of its own, so every
    // complaint belongs to exactly one cluster
    let issueClusterId;

    if (clusterMatch) {
      await client.query('UPDATE issue_clusters SET updated_at = LOCALTIMESTAMP WHERE id = $1', [
        clusterMatch.cluster_id,
      ]);
      issueClusterId = clusterMatch.cluster_id;
    } else {
      const clusterResult = await client.query(
        `INSERT INTO issue_clusters (title, description, category, location, status)
         VALUES ($1, $2, $3, $4, 'open')
         RETURNING id`,
        [cleanTitle, cleanDescription, category, cleanLocation]
      );
      issueClusterId = clusterResult.rows[0].id;
    }

    // category and priority come from the model, with NULL / 'medium' as the fallback.
    // status and the cluster stay out of the request body, so the client cannot set
    // them. user_id always comes from the verified token.
    const complaintResult = await client.query(
      `INSERT INTO complaints (user_id, title, description, category, location, priority, status, issue_cluster_id)
       VALUES ($1, $2, $3, $4, $5, $6, 'open', $7)
       RETURNING ${COMPLAINT_COLUMNS}`,
      [
        req.user.id,
        cleanTitle,
        cleanDescription,
        category,
        cleanLocation,
        priority,
        issueClusterId,
      ]
    );

    const complaint = complaintResult.rows[0];

    // One row per analysis, kept in the same transaction as the complaint
    if (prediction) {
      await insertPrediction(
        client,
        complaint.id,
        prediction.modelType,
        buildCategorySummary(prediction),
        prediction.confidence
      );

      const entitySummary = buildEntitySummary(entities);
      if (entitySummary) {
        await insertPrediction(client, complaint.id, ENTITY_MODEL_TYPE, entitySummary, null);
      }
    }

    if (duplicate) {
      await insertPrediction(
        client,
        complaint.id,
        DUPLICATE_MODEL_TYPE,
        buildDuplicateSummary(duplicate),
        duplicate.similarity
      );
    }

    await client.query(
      `INSERT INTO complaint_status_history (complaint_id, status, changed_by, note)
       VALUES ($1, 'open', $2, 'Complaint submitted')`,
      [complaint.id, req.user.id]
    );

    // The images are already stored at this point, so their URLs are written in the
    // same transaction as the complaint and removed again if anything fails
    const files = req.files || [];
    const images = [];

    for (let index = 0; index < files.length; index += 1) {
      const imageResult = await client.query(
        `INSERT INTO complaint_images (complaint_id, file_url, file_name)
         VALUES ($1, $2, $3)
         RETURNING id, file_url, file_name`,
        [complaint.id, storedImages[index].url, files[index].originalname]
      );
      images.push(imageResult.rows[0]);
    }

    // Stored here because the image row only gets its id above. The photo itself was
    // already classified, on the primary (first) image, before the transaction.
    if (imageAnalysis && images.length > 0) {
      await insertPrediction(
        client,
        complaint.id,
        CV_MODEL_TYPE,
        buildImageSummary(images[0].id, imageAnalysis.category, imageAnalysis.modelType),
        imageAnalysis.confidence
      );
    }

await client.query('COMMIT');

     await sendComplaintNotifications(client, complaint.id, complaint.title, complaint.status, req.user.id, 'submitted');

     // The complaint is saved, so the local copies of the cloud-hosted images can go
     await finalizeUploads(req.files);

     res.status(201).json({
       message: 'Complaint submitted successfully',
       complaint,
      images: images.map((image) => ({
        ...image,
        image_analysis:
          imageAnalysis && image.id === images[0].id
            ? {
                category: imageAnalysis.category,
                confidence: imageAnalysis.confidence,
                model_type: imageAnalysis.modelType,
              }
            : null,
      })),
      entities,
      duplicate_warning: duplicate
        ? { complaint_id: duplicate.complaint_id, similarity: duplicate.similarity }
        : null,
      // joined says whether an existing cluster was found or a new one was started
      cluster: clusterMatch
        ? { id: clusterMatch.cluster_id, joined: true, similarity: clusterMatch.similarity }
        : { id: issueClusterId, joined: false, similarity: null },
    });
  } catch (error) {
    await client.query('ROLLBACK');
    await deleteUploadedFiles(req.files);
    console.error('Create complaint error:', error.message);
    res.status(500).json({ message: 'Could not submit the complaint, please try again' });
  } finally {
    client.release();
  }
});

// GET /api/complaints  (admin only)
// Every complaint in the system, with search, filters and pagination
router.get('/', roleMiddleware('admin'), async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1
    const limit = parseInt(req.query.limit) || 20
    const offset = (page - 1) * limit
    const search = req.query.search || ''
    const statusFilter = req.query.status || ''
    const priorityFilter = req.query.priority || ''
    const categoryFilter = req.query.category || ''
    const locationFilter = req.query.location || ''

    let whereClause = '1=1'
    const params = []
    let paramIndex = 1

    if (search) {
      whereClause += ` AND (c.title ILIKE $${paramIndex} OR c.description ILIKE $${paramIndex} OR c.location ILIKE $${paramIndex})`
      params.push(`%${search}%`)
      paramIndex++
    }
    if (statusFilter && statusFilter !== 'all') {
      whereClause += ` AND c.status = $${paramIndex}`
      params.push(statusFilter)
      paramIndex++
    }
    if (priorityFilter && priorityFilter !== 'all') {
      whereClause += ` AND c.priority = $${paramIndex}`
      params.push(priorityFilter)
      paramIndex++
    }
    if (categoryFilter && categoryFilter !== 'all') {
      whereClause += ` AND c.category = $${paramIndex}`
      params.push(categoryFilter)
      paramIndex++
    }
    if (locationFilter && locationFilter !== 'all') {
      whereClause += ` AND c.location ILIKE $${paramIndex}`
      params.push(`%${locationFilter}%`)
      paramIndex++
    }

    const countResult = await db.query(
      `SELECT COUNT(*) AS total FROM complaints c WHERE ${whereClause}`,
      params
    )
    const totalComplaints = parseInt(countResult.rows[0].total)
    const totalPages = Math.ceil(totalComplaints / limit)

    const result = await db.query(
      `SELECT c.id, c.title, c.description, c.category, c.location, c.priority, c.status,
              c.created_at, c.updated_at, c.resolved_at, c.issue_cluster_id,
              u.name AS reporter_name, u.email AS reporter_email,
              (SELECT ic.title FROM issue_clusters ic WHERE ic.id = c.issue_cluster_id) AS cluster_title,
              (SELECT COUNT(*)::int FROM complaints m WHERE m.issue_cluster_id = c.issue_cluster_id) AS cluster_count,
              (SELECT a.staff_id FROM assignments a WHERE a.complaint_id = c.id ORDER BY a.assigned_at DESC, a.id DESC LIMIT 1) AS assigned_staff_id,
              (SELECT s.name FROM assignments a JOIN users s ON s.id = a.staff_id WHERE a.complaint_id = c.id ORDER BY a.assigned_at DESC, a.id DESC LIMIT 1) AS assigned_staff_name,
              (SELECT p.prediction FROM ai_predictions p WHERE p.complaint_id = c.id AND p.model_type = $${paramIndex + 2} ORDER BY p.id DESC LIMIT 1) AS duplicate_summary
       FROM complaints c JOIN users u ON u.id = c.user_id
       WHERE ${whereClause}
       ORDER BY c.created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      // The model type is paged in after the filters, so it has to sit after
      // limit and offset to match the placeholders above
      [...params, limit, offset, DUPLICATE_MODEL_TYPE]
    );

    res.json({
      complaints: result.rows.map((row) => ({
        ...row,
        duplicate_of: parseSummary(row.duplicate_summary).duplicateOf,
      })),
      totalComplaints,
      totalPages,
      currentPage: page,
    });
  } catch (error) {
    console.error('List all complaints error:', error.message);
    res.status(500).json({ message: 'Could not load the complaints, please try again' });
  }
});

// GET /api/complaints/my
// Declared before '/:id' so that "my" is not treated as an id
router.get('/my', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT ${COMPLAINT_COLUMNS}
       FROM complaints
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [req.user.id]
    );

    res.json({ complaints: result.rows });
  } catch (error) {
    console.error('List complaints error:', error.message);
    res.status(500).json({ message: 'Could not load your complaints, please try again' });
  }
});

// GET /api/complaints/assigned
// Declared before '/:id' so that "assigned" is not treated as an id
router.get('/assigned', roleMiddleware('staff', 'admin'), async (req, res) => {
  try {
    // DISTINCT ON keeps only the newest assignment row for each complaint, so a
    // reassigned complaint is listed once and only for the staff member who has it now
    const result = await db.query(
      `SELECT id, title, description, category, location, priority, status,
              created_at, updated_at, resolved_at, assigned_at, completed_at
       FROM (
         SELECT DISTINCT ON (c.id)
           c.id, c.title, c.description, c.category, c.location, c.priority, c.status,
           c.created_at, c.updated_at, c.resolved_at, a.staff_id, a.assigned_at, a.completed_at
         FROM assignments a
         JOIN complaints c ON c.id = a.complaint_id
         ORDER BY c.id, a.assigned_at DESC, a.id DESC
       ) AS latest_assignment
       WHERE staff_id = $1
       ORDER BY created_at DESC`,
      [req.user.id]
    );

    res.json({ complaints: result.rows });
  } catch (error) {
    console.error('List assigned complaints error:', error.message);
    res.status(500).json({ message: 'Could not load your assigned complaints, please try again' });
  }
});

// GET /api/complaints/clusters  (admin only)
router.get('/clusters', roleMiddleware('admin'), async (req, res) => {
  try {
    const result = await db.query(
      `SELECT ic.id, ic.title, ic.description, ic.location, ic.category,
              ic.status,
              (SELECT COUNT(*)::int FROM complaints c
               WHERE c.issue_cluster_id = ic.id) AS complaint_count
       FROM issue_clusters ic
       WHERE ic.status = 'open'
       ORDER BY ic.updated_at DESC`
    )
    res.json({ clusters: result.rows })
  } catch (error) {
    console.error('Get clusters error:', error.message)
    res.status(500).json({ message: 'Could not load clusters' })
  }
})

// GET /api/complaints/clusters/:id  (admin only)
router.get('/clusters/:id', roleMiddleware('admin'), async (req, res) => {
  const clusterId = parseInt(req.params.id)
  if (!clusterId) {
    return res.status(400).json({ message: 'Invalid cluster id' })
  }
  try {
    const clusterResult = await db.query(
      `SELECT ic.id, ic.title, ic.description, ic.location, ic.category,
               ic.status,
               (SELECT COUNT(*)::int FROM complaints c
                WHERE c.issue_cluster_id = ic.id) AS complaint_count
        FROM issue_clusters ic
        WHERE ic.id = $1`,
      [clusterId]
    )
    if (clusterResult.rows.length === 0) {
      return res.status(404).json({ message: 'Cluster not found' })
    }
    const cluster = clusterResult.rows[0]
    const complaintsResult = await db.query(
      `SELECT c.id, c.title, c.description, c.category, c.priority, c.status,
              c.created_at, u.name AS reporter_name
       FROM complaints c
       JOIN users u ON u.id = c.user_id
       WHERE c.issue_cluster_id = $1
       ORDER BY c.created_at DESC`,
      [clusterId]
    )
    res.json({ cluster, complaints: complaintsResult.rows })
  } catch (error) {
    console.error('Get cluster detail error:', error.message)
    res.status(500).json({ message: 'Could not load cluster detail' })
  }
})

// GET /api/complaints/notifications  (all roles)
router.get('/notifications', authMiddleware, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, user_id, type, title, message, related_complaint_id, is_read, created_at
       FROM notifications
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [req.user.id]
    )
    res.json({ notifications: result.rows })
  } catch (error) {
    console.error('Get notifications error:', error.message)
    res.status(500).json({ message: 'Could not load notifications' })
  }
})

// PATCH /api/complaints/notifications/:id/read
router.patch('/notifications/:id/read', authMiddleware, async (req, res) => {
  const notificationId = parseInt(req.params.id)
  if (!notificationId) {
    return res.status(400).json({ message: 'Invalid notification id' })
  }
  try {
    await db.query(`UPDATE notifications SET is_read = TRUE WHERE id = $1`, [notificationId])
    res.json({ message: 'Notification marked as read' })
  } catch (error) {
    console.error('Mark notification read error:', error.message)
    res.status(500).json({ message: 'Could not mark notification as read' })
  }
})

// PATCH /api/complaints/notifications/read-all
router.patch('/notifications/read-all', authMiddleware, async (req, res) => {
  try {
    await db.query(
      `UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND is_read = FALSE`,
      [req.user.id]
    )
    res.json({ message: 'All notifications marked as read' })
  } catch (error) {
    console.error('Mark all notifications read error:', error.message)
    res.status(500).json({ message: 'Could not mark all notifications as read' })
  }
})

// GET /api/admin/dashboard  (admin only)
router.get('/admin/dashboard', roleMiddleware('admin'), async (req, res) => {
  try {
    const statusResult = await db.query(
      `SELECT status, COUNT(*) AS count FROM complaints GROUP BY status`
    )
    const totalResult = await db.query(`SELECT COUNT(*) AS total FROM complaints`)
    const urgentResult = await db.query(
      `SELECT COUNT(*) AS count FROM complaints WHERE priority = 'urgent'`
    )
    const highResult = await db.query(
      `SELECT COUNT(*) AS count FROM complaints WHERE priority = 'high'`
    )
    const resolvedResult = await db.query(
      `SELECT COUNT(*) AS count FROM complaints WHERE status IN ('resolved', 'closed')`
    )
    const openResult = await db.query(
      `SELECT COUNT(*) AS count FROM complaints WHERE status = 'open'`
    )
    const inProgressResult = await db.query(
      `SELECT COUNT(*) AS count FROM complaints WHERE status = 'in_progress'`
    )
    const assignedResult = await db.query(
      `SELECT COUNT(*) AS count FROM complaints WHERE status = 'assigned'`
    )
    const clusterResult = await db.query(
      `SELECT COUNT(*) AS count FROM issue_clusters WHERE status = 'open'`
    )
    const resolutionResult = await db.query(
      `SELECT AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 86400) AS avg_days
       FROM complaints WHERE status IN ('resolved', 'closed') AND resolved_at IS NOT NULL`
    )
    const categoryResult = await db.query(
      `SELECT category, COUNT(*) AS count FROM complaints WHERE category IS NOT NULL GROUP BY category ORDER BY count DESC LIMIT 10`
    )
    const recentResult = await db.query(
      `SELECT c.id, c.title, c.category, c.priority, c.status, c.location, c.created_at,
              u.name AS reporter_name,
              (SELECT s.name FROM assignments a JOIN users s ON s.id = a.staff_id WHERE a.complaint_id = c.id ORDER BY a.assigned_at DESC LIMIT 1) AS assigned_staff_name
       FROM complaints c JOIN users u ON u.id = c.user_id
       ORDER BY c.created_at DESC LIMIT 10`
    )
    const stats = {
      total: parseInt(totalResult.rows[0].total),
      open: parseInt(openResult.rows[0].count),
      assigned: parseInt(assignedResult.rows[0].count),
      in_progress: parseInt(inProgressResult.rows[0].count),
      resolved: parseInt(resolvedResult.rows[0].count),
      urgent: parseInt(urgentResult.rows[0].count),
      high: parseInt(highResult.rows[0].count),
      active_clusters: parseInt(clusterResult.rows[0].count),
      avg_resolution_days: resolutionResult.rows[0].avg_days
        ? Math.round(parseFloat(resolutionResult.rows[0].avg_days) * 10) / 10
        : null,
      category_breakdown: categoryResult.rows,
      recent_complaints: recentResult.rows,
      status_breakdown: statusResult.rows.map((row) => ({
        status: row.status,
        count: parseInt(row.count),
      })),
    }
    res.json({ stats })
  } catch (error) {
    console.error('Get admin dashboard error:', error.message)
    res.status(500).json({ message: 'Could not load dashboard stats' })
  }
})

// GET /api/admin/analytics  (admin only)
router.get('/admin/analytics', roleMiddleware('admin'), async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1
    const limit = parseInt(req.query.limit) || 20
    const offset = (page - 1) * limit

    const search = req.query.search || ''
    const statusFilter = req.query.status || ''
    const priorityFilter = req.query.priority || ''
    const categoryFilter = req.query.category || ''
    const locationFilter = req.query.location || ''

    let whereClause = '1=1'
    const params = []
    let paramIndex = 1

    if (search) {
      whereClause += ` AND (c.title ILIKE $${paramIndex} OR c.description ILIKE $${paramIndex} OR c.location ILIKE $${paramIndex})`
      params.push(`%${search}%`)
      paramIndex++
    }
    if (statusFilter && statusFilter !== 'all') {
      whereClause += ` AND c.status = $${paramIndex}`
      params.push(statusFilter)
      paramIndex++
    }
    if (priorityFilter && priorityFilter !== 'all') {
      whereClause += ` AND c.priority = $${paramIndex}`
      params.push(priorityFilter)
      paramIndex++
    }
    if (categoryFilter && categoryFilter !== 'all') {
      whereClause += ` AND c.category = $${paramIndex}`
      params.push(categoryFilter)
      paramIndex++
    }
    if (locationFilter && locationFilter !== 'all') {
      whereClause += ` AND c.location ILIKE $${paramIndex}`
      params.push(`%${locationFilter}%`)
      paramIndex++
    }

    // Total count for pagination
    const countResult = await db.query(
      `SELECT COUNT(*) AS total FROM complaints c WHERE ${whereClause}`,
      params
    )
    const totalComplaints = parseInt(countResult.rows[0].total)
    const totalPages = Math.ceil(totalComplaints / limit)

    // Complaints with filters
    const complaintsResult = await db.query(
      `SELECT c.id, c.title, c.category, c.priority, c.status, c.location, c.created_at, c.resolved_at,
              u.name AS reporter_name,
              (SELECT s.name FROM assignments a JOIN users s ON s.id = a.staff_id WHERE a.complaint_id = c.id ORDER BY a.assigned_at DESC LIMIT 1) AS assigned_staff_name
       FROM complaints c JOIN users u ON u.id = c.user_id
       WHERE ${whereClause}
       ORDER BY c.created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset]
    )

    const volumeResult = await db.query(
      `SELECT DATE(created_at) AS day, COUNT(*) AS count FROM complaints WHERE created_at >= CURRENT_DATE - INTERVAL '30 days' GROUP BY DATE(created_at) ORDER BY day`
    )
    const categoryResult = await db.query(
      `SELECT category, COUNT(*) AS count FROM complaints WHERE category IS NOT NULL GROUP BY category ORDER BY count DESC`
    )
    const priorityResult = await db.query(
      `SELECT priority, COUNT(*) AS count FROM complaints GROUP BY priority ORDER BY priority`
    )
    // Same filters as the total count, so the status cards match the table below
    const statusResult = await db.query(
      `SELECT c.status, COUNT(*) AS count FROM complaints c WHERE ${whereClause} GROUP BY c.status ORDER BY c.status`,
      params
    )
    const locationResult = await db.query(
      `SELECT location, COUNT(*) AS count FROM complaints WHERE location IS NOT NULL GROUP BY location ORDER BY count DESC LIMIT 10`
    )
    const resolutionResult = await db.query(
      `SELECT AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 86400) AS avg_days
       FROM complaints WHERE status IN ('resolved', 'closed') AND resolved_at IS NOT NULL`
    )
    const clusterResult = await db.query(
      `SELECT ic.id, ic.title, ic.category, ic.location, ic.status,
              (SELECT COUNT(*)::int FROM complaints c WHERE c.issue_cluster_id = ic.id) AS complaint_count
       FROM issue_clusters ic WHERE ic.status = 'open' ORDER BY ic.updated_at DESC`
    )
    const staffWorkloadResult = await db.query(
      `SELECT u.id, u.name, u.email, u.department,
              COUNT(DISTINCT a.complaint_id) AS total_assigned,
              COUNT(DISTINCT CASE WHEN c.status IN ('assigned', 'in_progress') THEN a.complaint_id END) AS active,
              COUNT(DISTINCT CASE WHEN c.status IN ('resolved', 'closed') THEN a.complaint_id END) AS resolved
       FROM users u
       LEFT JOIN assignments a ON u.id = a.staff_id
       LEFT JOIN complaints c ON c.id = a.complaint_id
       WHERE u.role IN ('staff', 'admin')
       GROUP BY u.id, u.name, u.email, u.department
       ORDER BY u.name ASC`
    )

    const avgResolution = resolutionResult.rows[0].avg_days
      ? Math.round(parseFloat(resolutionResult.rows[0].avg_days))
      : null

    // Patterns derived from the same data, explained with the figures behind them.
    // Deliberately campus-wide: these describe the whole operation, so the filters
    // above do not apply to them.
    const insights = await buildInsights()

    res.json({
      volumeOverTime: volumeResult.rows,
      categoryDistribution: categoryResult.rows,
      priorityDistribution: priorityResult.rows,
      statusBreakdown: statusResult.rows,
      mostAffectedLocations: locationResult.rows,
      averageResolutionTime: avgResolution,
      issueClusters: clusterResult.rows,
      staffWorkload: staffWorkloadResult.rows,
      complaints: complaintsResult.rows,
      insights,
      totalComplaints,
      totalPages,
      currentPage: page,
      filters: { search, status: statusFilter, priority: priorityFilter, category: categoryFilter, location: locationFilter },
    })
  } catch (error) {
    console.error('Get admin analytics error:', error.message)
    res.status(500).json({ message: 'Could not load analytics' })
  }
})

// GET /api/complaints/admin/ai-feedback  (admin only)
//
// The state of the learning loop: how many labelled rows exist, what has been
// corrected by hand, and what the last candidate model scored when it was
// measured against the model currently in use.
router.get('/admin/ai-feedback', roleMiddleware('admin'), async (req, res) => {
  try {
    const summary = await datasetSummary()

    res.json({
      dataset: summary,
      lastEvaluation: readEvaluationReport(),
      correctable: {
        category: allowedValuesFor('category'),
        priority: allowedValuesFor('priority'),
      },
    })
  } catch (error) {
    console.error('Get AI feedback summary error:', error.message)
    res.status(500).json({ message: 'Could not load the AI feedback summary' })
  }
})

// PATCH /api/complaints/:id/classification  (staff and admin)
//
// Lets a person overrule the classifier. The stored prediction is left alone on
// purpose: it is the evidence of what the model said, and the learning loop
// exists to compare that with what a human decided. The disagreement is written
// to ai_feedback, never back into ai_predictions.
router.patch('/:id/classification', roleMiddleware('staff', 'admin'), async (req, res) => {
  const complaintId = parseComplaintId(req.params.id)

  if (!complaintId) {
    return res.status(400).json({ message: 'Invalid complaint id' })
  }

  const { category, priority, note } = req.body || {}

  for (const [field, value] of Object.entries({ category, priority })) {
    if (value === undefined || value === null || value === '') {
      continue
    }
    const allowed = allowedValuesFor(field)
    if (!allowed || !allowed.includes(value)) {
      return res.status(400).json({
        message: `${field} must be one of: ${(allowed || []).join(', ')}`,
      })
    }
  }

  try {
    const result = await applyCorrections({
      complaintId,
      changes: { category, priority },
      role: req.user.role,
      userId: req.user.id,
      note: typeof note === 'string' && note.trim() ? note.trim() : null,
    })

    if (result.error === 'not_found') {
      return res.status(404).json({ message: 'Complaint not found' })
    }

    if (result.error === 'no_change') {
      return res.status(400).json({ message: 'That is already the current category and priority' })
    }

    res.json({
      message: 'Classification corrected',
      complaint: result.complaint,
      corrections: result.corrections,
    })
  } catch (error) {
    console.error('Correct classification error:', error.message)
    res.status(500).json({ message: 'Could not save the correction, please try again' })
  }
})

// POST /api/complaints/:id/summary  (staff and admin)
//
// A short factual summary of the complaint, written by Gemini from the facts the
// detail view already shows. Nothing is stored and nothing is changed.
router.post('/:id/summary', roleMiddleware('staff', 'admin'), (req, res) =>
  handleAiRequest(req, res, generateComplaintSummary)
)

// POST /api/complaints/:id/response-draft  (staff and admin)
//
// A draft reply to the student. It is only text on screen: no message is sent and
// no status, assignment or resolution is touched.
router.post('/:id/response-draft', roleMiddleware('staff', 'admin'), (req, res) =>
  handleAiRequest(req, res, generateStaffResponseDraft)
)

// GET /api/complaints/:id
router.get('/:id', async (req, res) => {
  const complaintId = parseComplaintId(req.params.id);

  if (!complaintId) {
    return res.status(400).json({ message: 'Invalid complaint id' });
  }

  try {
    const detail = await loadComplaintDetail(complaintId);

    if (!detail) {
      return res.status(404).json({ message: 'Complaint not found' });
    }

    // A student may only open their own complaint, staff and admin may open any
    if (detail.owner_id !== req.user.id && !isStaffOrAdmin(req.user.role)) {
      return res.status(403).json({ message: 'You are not authorized to view this complaint' });
    }

    // owner_id was only needed for the check above, so it is not sent back
    const { owner_id: _ownerId, ...response } = detail;

    res.json(response);
  } catch (error) {
    console.error('Get complaint error:', error.message);
    res.status(500).json({ message: 'Could not load the complaint, please try again' });
  }
});

// PATCH /api/complaints/:id/status
router.patch('/:id/status', roleMiddleware('staff', 'admin'), async (req, res) => {
  const complaintId = parseComplaintId(req.params.id);

  if (!complaintId) {
    return res.status(400).json({ message: 'Invalid complaint id' });
  }

  const { status, note } = req.body;

  if (!ALLOWED_STATUSES.includes(status)) {
    return res.status(400).json({
      message: `Status must be one of: ${ALLOWED_STATUSES.join(', ')}`,
    });
  }

  const cleanNote = typeof note === 'string' && note.trim() ? note.trim() : null;

  const client = await db.connect();

  try {
    await client.query('BEGIN');

    // Lock the row so two staff members cannot change the status at the same time
    const complaintResult = await client.query(
      'SELECT id, status, user_id, title FROM complaints WHERE id = $1 FOR UPDATE',
      [complaintId]
    );

    if (complaintResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Complaint not found' });
    }

    const currentStatus = complaintResult.rows[0].status;
    const allowedNextStatuses = ALLOWED_TRANSITIONS[currentStatus] || [];

    if (!allowedNextStatuses.includes(status)) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        message: `Invalid status transition from ${currentStatus} to ${status}`,
      });
    }

    const updatedResult = await client.query(
      `UPDATE complaints
       SET status = $1,
           updated_at = LOCALTIMESTAMP,
           resolved_at = CASE
             WHEN $3 = 'resolved' THEN LOCALTIMESTAMP
             WHEN $3 = 'reopened' THEN NULL
             ELSE resolved_at
           END
       WHERE id = $2
       RETURNING ${COMPLAINT_COLUMNS}`,
      [status, complaintId, status]
    );

    await client.query(
      `INSERT INTO complaint_status_history (complaint_id, status, changed_by, note)
       VALUES ($1, $2, $3, $4)`,
      [complaintId, status, req.user.id, cleanNote]
    );

await client.query('COMMIT');

    const newStatus = status;
    let event = 'status_changed';
    if (newStatus === 'resolved') event = 'resolved';
    else if (newStatus === 'closed') event = 'closed';
    else if (newStatus === 'reopened') event = 'reopened';

    const updatedComplaint = updatedResult.rows[0];
    await sendComplaintNotifications(
      client,
      complaintId,
      complaintResult.rows[0].title,
      newStatus,
      complaintResult.rows[0].user_id,
      event
    );

    res.json({
       message: 'Complaint status updated successfully',
       complaint: updatedResult.rows[0],
     });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Update complaint status error:', error.message);
    res.status(500).json({ message: 'Could not update the status, please try again' });
  } finally {
    client.release();
  }
});

// POST /api/complaints/:id/assign  (admin only)
router.post('/:id/assign', roleMiddleware('admin'), async (req, res) => {
  const complaintId = parseComplaintId(req.params.id);

  if (!complaintId) {
    return res.status(400).json({ message: 'Invalid complaint id' });
  }

  const staffId = Number(req.body.staff_id);

  if (!Number.isInteger(staffId) || staffId <= 0) {
    return res.status(400).json({ message: 'A valid staff_id is required' });
  }

  const client = await db.connect();

  try {
    await client.query('BEGIN');

    const staffResult = await client.query('SELECT id, name, role FROM users WHERE id = $1', [staffId]);

    if (staffResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Staff member not found' });
    }

    const staff = staffResult.rows[0];

    if (!isStaffOrAdmin(staff.role)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'A complaint can only be assigned to a staff member' });
    }

    const complaintResult = await client.query(
      'SELECT id, status, user_id, title FROM complaints WHERE id = $1 FOR UPDATE',
      [complaintId]
    );

    if (complaintResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Complaint not found' });
    }

    const currentStatus = complaintResult.rows[0].status;

    if (!ASSIGNABLE_STATUSES.includes(currentStatus)) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        message: `Complaint cannot be assigned while its status is ${currentStatus}`,
      });
    }

    await client.query(
      `INSERT INTO assignments (complaint_id, staff_id, assigned_by)
       VALUES ($1, $2, $3)`,
      [complaintId, staffId, req.user.id]
    );

    // An open or reopened complaint moves to 'assigned'. A complaint that is already
    // assigned or in progress keeps its status, because this is a reassignment.
    const updatedResult = await client.query(
      `UPDATE complaints
       SET status = CASE WHEN status IN ('open', 'reopened') THEN 'assigned' ELSE status END,
           updated_at = LOCALTIMESTAMP
       WHERE id = $1
       RETURNING ${COMPLAINT_COLUMNS}`,
      [complaintId]
    );

    const complaint = updatedResult.rows[0];

    await client.query(
      `INSERT INTO complaint_status_history (complaint_id, status, changed_by, note)
       VALUES ($1, $2, $3, 'Complaint assigned to staff member')`,
      [complaintId, complaint.status, req.user.id]
    );

await client.query('COMMIT');

    const reporterId = complaintResult.rows[0].user_id;
    const title = complaintResult.rows[0].title;
    const newAssignedStatus = updatedResult.rows[0].status;

    await sendComplaintNotifications(
      client,
      complaintId,
      title,
      newAssignedStatus,
      reporterId,
      'assigned',
      { assigneeId: staffId }
    );

    res.json({
      message: 'Complaint assigned successfully',
      complaint,
      assigned_to: { id: staff.id, name: staff.name },
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Assign complaint error:', error.message);
    res.status(500).json({ message: 'Could not assign the complaint, please try again' });
  } finally {
    client.release();
  }
});

// POST /api/complaints/:id/feedback  (student only, after resolved/closed)
router.post('/:id/feedback', roleMiddleware('student'), async (req, res) => {
  const complaintId = parseInt(req.params.id)
  if (!complaintId) {
    return res.status(400).json({ message: 'Invalid complaint id' })
  }

  const { rating, comment } = req.body

  if (rating === undefined || rating < 1 || rating > 5) {
    return res.status(400).json({ message: 'Rating must be between 1 and 5' })
  }

  // Check complaint exists and is resolved or closed
  const complaintResult = await db.query(
    `SELECT status, user_id FROM complaints WHERE id = $1`,
    [complaintId]
  )

  if (complaintResult.rows.length === 0) {
    return res.status(404).json({ message: 'Complaint not found' })
  }

  const complaintStatus = complaintResult.rows[0].status
  if (complaintStatus !== 'resolved' && complaintStatus !== 'closed') {
    return res.status(400).json({
      message: 'Feedback can only be submitted for resolved or closed complaints',
    })
  }

  // Check if user is the owner
  const ownerResult = await db.query(
    `SELECT id FROM complaints WHERE id = $1 AND user_id = $2`,
    [complaintId, req.user.id]
  )

  if (ownerResult.rows.length === 0) {
    return res.status(403).json({ message: 'Only the complaint owner can submit feedback' })
  }

  try {
    const result = await db.query(
      `INSERT INTO feedback (complaint_id, user_id, rating, comment, created_at)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
       RETURNING id, rating, comment, created_at`,
      [complaintId, req.user.id, rating, comment || null]
    )

    res.status(201).json({ feedback: result.rows[0] })
  } catch (error) {
    // 23505 = unique_violation: the DB rejected a second feedback row for this user
    if (error.code === '23505') {
      return res.status(400).json({ message: 'Feedback already submitted for this complaint' })
    }
    console.error('Submit feedback error:', error.message)
    res.status(500).json({ message: 'Could not submit feedback' })
  }
})

// GET /api/complaints/:id/feedback  (all authorized roles who can view the complaint)
router.get('/:id/feedback', authMiddleware, async (req, res) => {
  const complaintId = parseInt(req.params.id)
  if (!complaintId) {
    return res.status(400).json({ message: 'Invalid complaint id' })
  }

  try {
    // Verify the complaint exists and the user can view it
    const complaintResult = await db.query(
      `SELECT user_id FROM complaints WHERE id = $1`,
      [complaintId]
    )
    if (complaintResult.rows.length === 0) {
      return res.status(404).json({ message: 'Complaint not found' })
    }
    const ownerId = complaintResult.rows[0].user_id
    if (ownerId !== req.user.id && !isStaffOrAdmin(req.user.role)) {
      return res.status(403).json({ message: 'Not authorized to view feedback' })
    }

    const result = await db.query(
      `SELECT f.id, f.rating, f.comment, f.created_at, u.name AS reviewer_name
       FROM feedback f
       JOIN users u ON u.id = f.user_id
       WHERE f.complaint_id = $1
       ORDER BY f.created_at DESC`,
      [complaintId]
    )
    res.json({ feedback: result.rows })
  } catch (error) {
    console.error('Get feedback error:', error.message)
    res.status(500).json({ message: 'Could not load feedback' })
  }
})

module.exports = router
