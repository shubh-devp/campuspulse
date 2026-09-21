const { runWarmScript } = require('./pythonBridge');

const IMAGE_CATEGORIES = ['Electrical', 'Plumbing', 'Structural', 'General'];

async function classifyImage(filePath) {
  if (!filePath) {
    return null;
  }

  const result = await runWarmScript('cv_classify.py', { image_path: filePath });

  if (!result) {
    return null;
  }

  if (!IMAGE_CATEGORIES.includes(result.image_category)) {
    console.warn('CV prediction ignored: unexpected image category');
    return null;
  }

  return {
    category: result.image_category,
    confidence: typeof result.confidence === 'number' ? result.confidence : null,
    modelType: result.model_type || 'unknown',
  };
}

module.exports = { classifyImage, IMAGE_CATEGORIES };
