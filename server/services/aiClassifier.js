const { runWarmScript } = require('./pythonBridge');

// The only values the database accepts, so a strange answer never reaches it
const CATEGORIES = ['Infrastructure', 'IT & Network', 'Sanitation', 'Electrical', 'General'];
const PRIORITIES = ['low', 'medium', 'high', 'urgent'];

// At most 4 of each, since they end up in the VARCHAR(150) summary
function cleanEntities(entities) {
  const cleanList = (value) =>
    (Array.isArray(value) ? value : [])
      .filter((item) => typeof item === 'string' && item.trim())
      .map((item) => item.trim())
      .slice(0, 4);

  return {
    locations: cleanList(entities?.locations),
    facilities: cleanList(entities?.facilities),
  };
}

// Returns null when the AI layer is unavailable, so the caller uses its defaults
async function predictComplaint({ title, description }) {
  const result = await runWarmScript('predict.py', { title, description });

  if (!result) {
    return null;
  }

  if (!CATEGORIES.includes(result.category) || !PRIORITIES.includes(result.priority)) {
    console.warn('AI prediction ignored: unexpected category or priority');
    return null;
  }

  return {
    category: result.category,
    priority: result.priority,
    confidence: typeof result.confidence === 'number' ? result.confidence : null,
    priorityConfidence:
      typeof result.priority_confidence === 'number' ? result.priority_confidence : null,
    modelType: result.model_type || 'unknown',
    entities: cleanEntities(result.entities),
  };
}

module.exports = { predictComplaint };
