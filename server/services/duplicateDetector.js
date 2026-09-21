

const STOPWORDS = new Set([
  'the', 'and', 'for', 'are', 'was', 'were', 'not', 'has', 'have', 'had', 'but',
  'with', 'from', 'this', 'that', 'these', 'those', 'its', 'there', 'here',
  'since', 'very', 'also', 'again', 'all', 'any', 'some', 'our', 'you', 'your',
  'they', 'them', 'she', 'his', 'her', 'does', 'did', 'can', 'could', 'will',
  'would', 'should', 'please', 'kindly', 'complaint', 'issue', 'problem',
]);

const MIN_TOKEN_LENGTH = 3;
const DEFAULT_THRESHOLD = 0.7;

function tokenize(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length >= MIN_TOKEN_LENGTH && !STOPWORDS.has(word));
}

function countTerms(tokens) {
  const counts = new Map();
  tokens.forEach((token) => counts.set(token, (counts.get(token) || 0) + 1));
  return counts;
}


function buildIdf(documents) {
  const documentCount = documents.length;
  const seenIn = new Map();

  documents.forEach((tokens) => {
    new Set(tokens).forEach((token) => seenIn.set(token, (seenIn.get(token) || 0) + 1));
  });

  const idf = new Map();
  seenIn.forEach((count, token) => {
    idf.set(token, Math.log((1 + documentCount) / (1 + count)) + 1);
  });

  return idf;
}

function tfidfVector(tokens, idf) {
  const counts = countTerms(tokens);
  const vector = new Map();

  counts.forEach((count, token) => {
    vector.set(token, (count / tokens.length) * (idf.get(token) || 1));
  });

  return vector;
}

function magnitude(vector) {
  let sum = 0;
  vector.forEach((value) => {
    sum += value * value;
  });
  return Math.sqrt(sum);
}

function cosineSimilarity(first, second) {
  const firstSize = magnitude(first);
  const secondSize = magnitude(second);

  if (firstSize === 0 || secondSize === 0) {
    return 0;
  }

  let dotProduct = 0;
  first.forEach((value, token) => {
    if (second.has(token)) {
      dotProduct += value * second.get(token);
    }
  });

  return dotProduct / (firstSize * secondSize);
}


function locationsConflict(complaintLocations, candidateLocations) {
  if (complaintLocations.length === 0 || candidateLocations.length === 0) {
    return false;
  }

  return !complaintLocations.some((location) => candidateLocations.includes(location));
}


function similarities(text, others) {
  const tokens = tokenize(text);
  const otherTokens = others.map((other) => tokenize(other));
  const idf = buildIdf(otherTokens);
  const vector = tfidfVector(tokens, idf);

  return otherTokens.map((candidate) => cosineSimilarity(vector, tfidfVector(candidate, idf)));
}

function findDuplicate(complaint, candidates, threshold = DEFAULT_THRESHOLD) {
  if (!candidates || candidates.length === 0) {
    return null;
  }

  const scores = similarities(
    `${complaint.title} ${complaint.description}`,
    candidates.map((candidate) => `${candidate.title} ${candidate.description}`)
  );

  let best = null;

  candidates.forEach((candidate, index) => {
    const similarity = scores[index];

    if (similarity < threshold) {
      return;
    }

    if (locationsConflict(complaint.locations || [], candidate.locations || [])) {
      return;
    }

    if (!best || similarity > best.similarity) {
      best = { complaint_id: candidate.id, similarity: Number(similarity.toFixed(4)) };
    }
  });

  return best;
}

module.exports = {
  findDuplicate,
  similarities,
  cosineSimilarity,
  tokenize,
  DEFAULT_THRESHOLD,
};
