// server.js
require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();

// Allow frontend to call our backend
app.use(cors());

// Serve static files from /public (schedule.html etc.)
app.use(express.static('public'));

// Axios client for Current RMS
const current = axios.create({
  baseURL: 'https://api.current-rms.com/api/v1',
  headers: {
    'X-SUBDOMAIN': process.env.CURRENT_SUBDOMAIN,
    'X-AUTH-TOKEN': process.env.CURRENT_API_KEY,
    'Accept': 'application/json'
  }
});

/**
 * Helper: fetch opportunities (jobs) in a date range
 * NOTE: Adjust params if your Current RMS filters use different names.
 */
async function fetchJobs(start, end) {
  const resp = await current.get('/opportunities', {
    params: {
      // These param names may need tweaking depending on your system.
      // They are a reasonable guess for date range filtering:
      starts_at_from: start,
      starts_at_to: end,
      per_page: 200,
      view: 'all'
    }
  });

  const opportunities = resp.data?.opportunities || resp.data?.data || [];

  return opportunities.map(o => ({
    id: o.id,
    name: o.name || o.subject || `Opportunity #${o.id}`,
    starts_at: o.starts_at || o.starts_at_date || o.start_at || null,
    ends_at: o.ends_at || o.ends_at_date || o.end_at || null
  }));
}

/**
 * Helper: fetch ONLY bookable resources (not all people/organisations)
 *
 * This uses /members and then filters down. The exact fields depend on your
 * Current RMS data, so we include a few common patterns:
 *  - m.bookable or m.is_bookable === true
 *  - m.kind === 'resource'
 *  - m.member_type === 'resource'
 *
 * You can tweak the filter after inspecting a sample member object.
 */
async function fetchBookableResources() {
  const resp = await current.get('/members', {
    params: {
      per_page: 200
    }
  });

  const members = resp.data?.members || resp.data?.data || [];

  const resources = members.filter(m => {
    const kind = (m.kind || m.member_type || '').toString().toLowerCase();
    const bookableFlag = m.bookable || m.is_bookable || m.is_resource;

    // Keep if it's explicitly bookable OR looks like a resource-type record
    if (bookableFlag) return true;
    if (kind === 'resource' || kind === 'resources') return true;

    return false;
  });

  return resources.map(m => {
    const name =
      m.name ||
      [m.first_name, m.last_name].filter(Boolean).join(' ') ||
      `Resource ${m.id}`;

    return {
      id: m.id,
      name
    };
  });
}

/**
 * TEMP: test endpoint to check that auth to Current RMS is working
 * - http://localhost:4000/api/test-current
 */
app.get('/api/test-current', async (req, res) => {
  try {
    const resp = await current.get('/members', { params: { per_page: 5 } });
    const members = resp.data?.members || resp.data?.data || [];
    res.json({
      ok: true,
      sample_count: members.length,
      sample: members.slice(0, 3)
    });
  } catch (err) {
    console.error(err?.response?.data || err.message);
    res.status(500).json({
      ok: false,
      details: err?.response?.data || err.message
    });
  }
});

/**
 * MAIN ENDPOINT:
 * GET /api/schedule?start=YYYY-MM-DD&end=YYYY-MM-DD
 *
 * STEP 1:
 *  - Fetch jobs (opportunities) in date range
 *  - Fetch ONLY bookable resources
 *  - Return empty assignments (we'll wire real bookings in step 2)
 */
app.get('/api/schedule', async (req, res) => {
  const { start, end } = req.query;

  if (!start || !end) {
    return res.status(400).json({
      error: 'start and end query params are required (YYYY-MM-DD).'
    });
  }

  try {
    // 1. Fetch jobs in the date range
    const jobs = await fetchJobs(start, end);

    // 2. Fetch only bookable resources
    const staff = await fetchBookableResources();

    // 3. For now, no assignment logic (we'll add bookings later)
    const assignments = {};
    for (const job of jobs) {
      assignments[job.id] = [];
    }

    res.json({ jobs, staff, assignments });
  } catch (err) {
    console.error('Error in /api/schedule:', err?.response?.data || err.message);
    res.status(500).json({
      error: 'Failed to fetch schedule from Current RMS',
      details: err?.response?.data || err.message
    });
  }
});

// Simple root check
app.get('/', (_req, res) => {
  res.send('Current RMS schedule API running.');
});

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

