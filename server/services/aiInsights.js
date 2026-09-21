const db = require('../config/db');
const { ENTITY_MODEL_TYPE, parseSummary } = require('./aiSummary');



const OPEN_STATUSES = ['open', 'assigned', 'in_progress', 'reopened'];
const WINDOW_DAYS = 14;

function plural(count, word) {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

function daysAgo(value) {
  if (!value) {
    return null;
  }
  const days = Math.round((Date.now() - new Date(value).getTime()) / 86400000);
  return days <= 0 ? 'today' : `${plural(days, 'day')} ago`;
}


function buildRecurringItems(clusters, pairs) {
  const items = [];

  for (const cluster of clusters) {
    items.push({
      title: cluster.title,
      detail: `${plural(cluster.complaint_count, 'complaint')} grouped together, ${
        cluster.still_open > 0 ? `${cluster.still_open} still open` : 'all finished'
      }. Last reported ${daysAgo(cluster.last_reported)}.`,
      evidence: [
        { label: 'Complaints', value: cluster.complaint_count },
        { label: 'Still open', value: cluster.still_open },
        { label: 'Category', value: cluster.category || '—' },
      ],
      to: `/admin/clusters/${cluster.id}`,
    });
  }

  for (const pair of pairs) {
    items.push({
      title: `${pair.category} problems around ${pair.area}`,
      detail: `${plural(pair.complaint_count, 'complaint')} at the same place and of the same kind, ${
        pair.still_open > 0 ? `${pair.still_open} still open` : 'all finished'
      }. Last reported ${daysAgo(pair.last_reported)}.`,
      evidence: [
        { label: 'Complaints', value: pair.complaint_count },
        { label: 'Still open', value: pair.still_open },
        { label: 'Area', value: pair.area },
      ],
    });
  }

  return items.slice(0, 8);
}

async function recurringIssues() {
  const clusters = await db.query(
    `SELECT ic.id, ic.title, ic.category, ic.location,
            COUNT(c.id)::int AS complaint_count,
            COUNT(c.id) FILTER (WHERE c.status = ANY($1::text[]))::int AS still_open,
            MAX(c.created_at) AS last_reported
     FROM issue_clusters ic
     JOIN complaints c ON c.issue_cluster_id = ic.id
     GROUP BY ic.id
     HAVING COUNT(c.id) >= 2
     ORDER BY complaint_count DESC, last_reported DESC
     LIMIT 5`,
    [OPEN_STATUSES]
  );


  const pairs = await db.query(
    `SELECT split_part(c.location, ' - ', 1) AS area,
            c.category,
            COUNT(*)::int AS complaint_count,
            COUNT(*) FILTER (WHERE c.status = ANY($1::text[]))::int AS still_open,
            MAX(c.created_at) AS last_reported
     FROM complaints c
     WHERE c.location IS NOT NULL AND c.category IS NOT NULL
     GROUP BY area, c.category
     HAVING COUNT(*) >= 2
     ORDER BY complaint_count DESC, last_reported DESC
     LIMIT 6`,
    [OPEN_STATUSES]
  );

  return buildRecurringItems(clusters.rows, pairs.rows);
}

async function emergingPatterns() {
  const result = await db.query(
    `SELECT c.category,
            COUNT(*) FILTER (WHERE c.created_at >= now() - make_interval(days => $1::int))::int AS recent,
            COUNT(*) FILTER (WHERE c.created_at <  now() - make_interval(days => $1::int))::int AS previous
     FROM complaints c
     WHERE c.created_at >= now() - make_interval(days => $2::int)
       AND c.category IS NOT NULL
     GROUP BY c.category`,
    [WINDOW_DAYS, WINDOW_DAYS * 2]
  );

  return result.rows
    .map((row) => ({
      category: row.category,
      recent: row.recent,
      previous: row.previous,
      change: row.recent - row.previous,
    }))
    .filter((row) => row.change > 0)
    .sort((a, b) => b.change - a.change || b.recent - a.recent)
    .slice(0, 5)
    .map((row) => ({
      title: `${row.category} is being reported more often`,
      detail:
        row.previous === 0
          ? `${plural(row.recent, 'complaint')} in the last ${WINDOW_DAYS} days, where there were none in the ${WINDOW_DAYS} days before.`
          : `${plural(row.recent, 'complaint')} in the last ${WINDOW_DAYS} days, up from ${row.previous} in the ${WINDOW_DAYS} days before.`,
      evidence: [
        { label: `Last ${WINDOW_DAYS} days`, value: row.recent },
        { label: `Previous ${WINDOW_DAYS} days`, value: row.previous },
        { label: 'Change', value: row.change > 0 ? `+${row.change}` : row.change },
      ],
    }));
}

async function problemLocations() {
  const result = await db.query(
    `SELECT split_part(c.location, ' - ', 1) AS area,
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE c.status = ANY($1::text[]))::int AS still_open,
            COUNT(*) FILTER (WHERE c.priority IN ('high', 'urgent'))::int AS high_priority,
            mode() WITHIN GROUP (ORDER BY c.category) AS top_category,
            ROUND((AVG(EXTRACT(EPOCH FROM (c.resolved_at - c.created_at)) / 86400)
                   FILTER (WHERE c.resolved_at IS NOT NULL))::numeric, 1) AS avg_days
     FROM complaints c
     WHERE c.location IS NOT NULL
     GROUP BY area
     ORDER BY total DESC, still_open DESC
     LIMIT 6`,
    [OPEN_STATUSES]
  );

  return result.rows.map((row) => ({
    title: row.area,
    detail: `${plural(row.total, 'complaint')}, ${row.still_open} still open. Mostly ${
      row.top_category || 'uncategorised'
    }${row.avg_days !== null ? `, fixed in about ${row.avg_days} days on average` : ''}.`,
    evidence: [
      { label: 'Complaints', value: row.total },
      { label: 'Still open', value: row.still_open },
      { label: 'High or urgent', value: row.high_priority },
    ],
  }));
}

async function problemFacilities() {
  const result = await db.query(
    `SELECT c.id, c.category, c.status, p.prediction
     FROM ai_predictions p
     JOIN complaints c ON c.id = p.complaint_id
     WHERE p.model_type = $1
     ORDER BY c.created_at DESC
     LIMIT 800`,
    [ENTITY_MODEL_TYPE]
  );

  const tally = new Map();

  for (const row of result.rows) {
    const { facilities } = parseSummary(row.prediction);

    for (const facility of facilities) {
      const entry = tally.get(facility) || { facility, complaints: 0, open: 0, categories: {} };
      entry.complaints += 1;
      if (OPEN_STATUSES.includes(row.status)) {
        entry.open += 1;
      }
      if (row.category) {
        entry.categories[row.category] = (entry.categories[row.category] || 0) + 1;
      }
      tally.set(facility, entry);
    }
  }

  return [...tally.values()]
    .sort((a, b) => b.complaints - a.complaints || b.open - a.open)
    .slice(0, 6)
    .map((entry) => {
      const commonest = Object.entries(entry.categories).sort((a, b) => b[1] - a[1])[0];
      return {
        title: entry.facility,
        detail: `Mentioned in ${plural(entry.complaints, 'complaint')}, ${entry.open} still open.${
          commonest ? ` Most often reported as ${commonest[0]}.` : ''
        }`,
        evidence: [
          { label: 'Complaints', value: entry.complaints },
          { label: 'Still open', value: entry.open },
          { label: 'Commonest category', value: commonest ? commonest[0] : '—' },
        ],
      };
    });
}

async function resolutionTrends() {
  const overall = await db.query(
    `SELECT
       COUNT(*) FILTER (WHERE c.resolved_at IS NOT NULL)::int AS completed,
       COUNT(*) FILTER (WHERE c.status = 'reopened')::int AS reopened,
       ROUND((AVG(EXTRACT(EPOCH FROM (c.resolved_at - c.created_at)) / 86400)
              FILTER (WHERE c.resolved_at IS NOT NULL))::numeric, 1) AS avg_days,
       ROUND(AVG(f.rating)::numeric, 2) AS avg_rating
     FROM complaints c
     LEFT JOIN feedback f ON f.complaint_id = c.id`
  );

  const byCategory = await db.query(
    `SELECT c.category,
            COUNT(*) FILTER (WHERE c.resolved_at IS NOT NULL)::int AS completed,
            COUNT(*) FILTER (WHERE c.status = 'reopened')::int AS reopened,
            ROUND((AVG(EXTRACT(EPOCH FROM (c.resolved_at - c.created_at)) / 86400)
                   FILTER (WHERE c.resolved_at IS NOT NULL))::numeric, 1) AS avg_days,
            ROUND(AVG(f.rating)::numeric, 2) AS avg_rating
     FROM complaints c
     LEFT JOIN feedback f ON f.complaint_id = c.id
     WHERE c.category IS NOT NULL
     GROUP BY c.category
     ORDER BY avg_days DESC NULLS LAST`
  );

  const summary = overall.rows[0];

  const items = [
    {
      title: 'Across the campus',
      detail: `${plural(summary.completed, 'complaint')} resolved or closed, taking about ${
        summary.avg_days ?? '—'
      } days on average.${
        summary.avg_rating !== null ? ` Students rated the fixes ${summary.avg_rating} out of 5.` : ''
      }`,
      evidence: [
        { label: 'Completed', value: summary.completed },
        { label: 'Average days', value: summary.avg_days ?? '—' },
        { label: 'Average rating', value: summary.avg_rating ?? '—' },
        { label: 'Reopened', value: summary.reopened },
      ],
    },
  ];

  for (const row of byCategory.rows) {
    if (row.avg_days === null) {
      continue;
    }
    items.push({
      title: row.category,
      detail: `Takes about ${row.avg_days} days to fix on average, over ${plural(
        row.completed,
        'completed complaint'
      )}.${row.avg_rating !== null ? ` Rated ${row.avg_rating} out of 5.` : ''}${
        row.reopened > 0 ? ` Reopened ${row.reopened} times.` : ''
      }`,
      evidence: [
        { label: 'Completed', value: row.completed },
        { label: 'Average days', value: row.avg_days },
        { label: 'Rating', value: row.avg_rating ?? '—' },
      ],
    });
  }

  return items;
}


async function buildInsights() {
  const [recurring, emerging, locations, facilities, resolution] = await Promise.all([
    recurringIssues(),
    emergingPatterns(),
    problemLocations(),
    problemFacilities(),
    resolutionTrends(),
  ]);

  return {
    windowDays: WINDOW_DAYS,
    generatedAt: new Date().toISOString(),
    groups: [
      {
        key: 'recurring',
        title: 'Recurring issues',
        description: 'The same problem, in the same place, reported more than once.',
        items: recurring,
        empty: 'No area has had the same kind of problem reported twice yet.',
      },
      {
        key: 'emerging',
        title: 'Emerging patterns',
        description: `Categories being reported more often in the last ${WINDOW_DAYS} days than in the ${WINDOW_DAYS} days before.`,
        items: emerging,
        empty: `Nothing is being reported more often over the last ${WINDOW_DAYS} days.`,
      },
      {
        key: 'locations',
        title: 'Problematic locations',
        description: 'Areas with the most complaints, and how many are still open.',
        items: locations,
        empty: 'No location data yet.',
      },
  {
        key: 'facilities',
        title: 'Problematic facilities',
        description: 'The facilities named most often in the text of complaints.',
        items: facilities,
        empty: 'No facilities have been recognised in complaint text yet.',
    },
    {
        key: 'resolution',
        title: 'Resolution trends',
        description: 'How long fixes take, and what students rated them.',
        items: resolution,
        empty: 'No completed complaints yet.',
      },
    ],
  };
}

module.exports = { buildInsights, WINDOW_DAYS, OPEN_STATUSES };
