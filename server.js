// server.js
require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();

/**
 * CONFIG
 * Toggle this to true if you want to ignore Current RMS
 * and use mock data for the schedule while testing.
 */
const USE_MOCK_SCHEDULE = false;

// --- Middleware ---
app.use(cors());
app.use(express.static('public'));

// --- Current RMS axios client ---
const current = axios.create({
  baseURL: 'https://api.current-rms.com/api/v1',
  headers: {
    'X-SUBDOMAIN': process.env.CURRENT_SUBDOMAIN,
    'X-AUTH-TOKEN': process.env.CURRENT_API_KEY,
    'Accept': 'application/json'
  }
});

/**
 * Simple test route to confirm auth to Current RMS is working.
 * Visit: /api/test-current
 */
app.get('/api/test-current', async (req, res) => {
  try {
    const resp = await current.get('/members', {
      params: { per_page: 10 }
    });

    const members =
      resp.data?.members ||
      resp.data?.data ||
      [];

    res.json({
      ok: true,
      count: members.length
    });
  } catch (err) {
    console.error('TEST CURRENT ERROR:', err?.response?.data || err.message);
    res.status(500).json({
      ok: false,
      details: err?.response?.data || err.message
    });
  }
});

/**
 * GET /api/schedule?start=YYYY-MM-DD&end=YYYY-MM-DD
 *
 * Returns:
 * {
 *   jobs: [{ id, name, starts_at, ends_at }],
 *   staff: [{ id, name }],
 *   assignments: { [jobId]: staffId[] }
 * }
 */
app.get('/api/schedule', async (req, res) => {
  const { start, end } = req.query;

  if (!start || !end) {
    return res.status(400).json({
      error: 'start and end query params are required (YYYY-MM-DD).'
    });
  }

  if (USE_MOCK_SCHEDULE) {
    // --- MOCK DATA MODE ---
    const staff = [
      { id: 1, name: 'Alice Tech' },
      { id: 2, name: 'Bob LX' },
      { id: 3, name: 'Charlie Audio' }
    ];

    const jobs = [
      { id: 101, name: 'Job One',   starts_at: `${start} 09:00`, ends_at: `${start} 18:00` },
      { id: 102, name: 'Job Two',   starts_at: `${end} 10:00`,   ends_at: `${end} 22:00` },
      { id: 103, name: 'Job Three', starts_at: `${end} 08:00`,   ends_at: `${end} 17:00` }
    ];

    const assignments = {
      101: [1, 2],
      102: [2],
      103: [1, 3]
    };

    return res.json({ jobs, staff, assignments });
  }

  // --- REAL CURRENT RMS MODE ---
  try {
    // 1. Fetch a bunch of opportunities from Current RMS
    // We keep the query simple and filter by date in Node to avoid guessing API filters.
    const oppResp = await current.get('/opportunities', {
      params: {
        per_page: 200,   // adjust if needed
        view: 'all'      // adjust if you use a specific view
      }
    });

    const opportunities =
      oppResp.data?.opportunities ||
      oppResp.data?.data ||
      [];

    // Helper: parse a date-like field robustly
    const toDate = (val) => {
      if (!val) return null;
      const d = new Date(val);
      return Number.isNaN(d.getTime()) ? null : d;
    };

    const startDate = new Date(start);
    const endDate = new Date(end);

    // 2. Filter opportunities into the requested date range
    const filteredOpps = opportunities.filter((o) => {
      const s =
        toDate(o.starts_at) ||
        toDate(o.starts_at_date) ||
        toDate(o.start_at) ||
        toDate(o.start_date);

      if (!s) return false;
      return s >= startDate && s <= endDate;
    });

    // 3. Map them into "jobs" for the UI
    const jobs = filteredOpps.map((o) => ({
      id: o.id,
      name: o.name || o.subject || `Opportunity #${o.id}`,
      starts_at:
        o.starts_at ||
        o.starts_at_date ||
        o.start_at ||
        '',
      ends_at:
        o.ends_at ||
        o.ends_at_date ||
        o.end_at ||
        ''
    }));

    // 4. STAFF + ASSIGNMENTS PLACEHOLDER
    //
    // Here we would normally call whatever endpoint in your Current RMS setup
    // returns "staff booked on this job" – e.g. participants, resources, etc.
    // Because that varies per account, we leave a stub and give everyone
    // a fake staff list for now so your grid renders.
    //
    // Once we know your staff model, we replace this block.
    const staff = [
      { id: 1, name: 'Example Staff A' },
      { id: 2, name: 'Example Staff B' },
      { id: 3, name: 'Example Staff C' }
    ];

    // For now, assign random staff to each job so you can see ticks.
    const assignments = {};
    for (const job of jobs) {
      const assigned = [];
      if (staff[0] && Math.random() > 0.3) assigned.push(staff[0].id);
      if (staff[1] && Math.random() > 0.5) assigned.push(staff[1].id);
      if (staff[2] && Math.random() > 0.7) assigned.push(staff[2].id);
      assignments[job.id] = assigned;
    }

    return res.json({
      jobs,
      staff,
      assignments
    });
  } catch (err) {
    console.error('SCHEDULE ERROR:', err?.response?.data || err.message);
    res.status(500).json({
      error: 'Failed to fetch schedule from Current RMS',
      details: err?.response?.data || err.message
    });
  }
});

// Simple root route
app.get('/', (_req, res) => {
  res.send('Current RMS schedule API running.');
});

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

