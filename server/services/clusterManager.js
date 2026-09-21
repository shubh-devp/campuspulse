

const { similarities } = require('./duplicateDetector');


const MATCH_THRESHOLD = 0.5;

function normalizeLocation(location) {
  return (location || '').trim().toLowerCase();
}

function samePlace(complaint, cluster) {
  const clusterLocation = normalizeLocation(cluster.location);

  if (!clusterLocation) {
    return false;
  }

  if (normalizeLocation(complaint.location) === clusterLocation) {
    return true;
  }

  return (complaint.locations || []).some((place) => clusterLocation.includes(place));
}

function sameFacility(complaint, cluster) {
  const mine = complaint.facilities || [];
  const theirs = cluster.facilities || [];

  if (mine.length === 0 || theirs.length === 0) {
    return true;
  }

  return mine.some((facility) => theirs.includes(facility));
}

function findCluster(complaint, clusters, threshold = MATCH_THRESHOLD) {
  const candidates = (clusters || []).filter(
    (cluster) => samePlace(complaint, cluster) && sameFacility(complaint, cluster)
  );

  if (candidates.length === 0) {
    return null;
  }

  const scores = similarities(
    `${complaint.title} ${complaint.description}`,
    candidates.map((cluster) => `${cluster.title} ${cluster.description}`)
  );

  let best = null;

  candidates.forEach((cluster, index) => {
    if (scores[index] < threshold) {
      return;
    }

    if (!best || scores[index] > best.similarity) {
      best = { cluster_id: cluster.id, similarity: Number(scores[index].toFixed(4)) };
    }
  });

  return best;
}

module.exports = { findCluster, samePlace, sameFacility, MATCH_THRESHOLD };
