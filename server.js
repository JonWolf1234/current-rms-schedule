// server.js
require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();

// Allow frontend to call our backend
app.use(cors());

// Serve static files in /public
app.use(express.static('public'));

const current = axios.create({
  baseURL: 'https://api.current-rms.com/api/v1',
  headers: {
    'X-SUBDOMAIN': process.env.CURRENT_SUBDOMAIN,
    'Authorization': `Bearer ${process.env.CURRENT_API_KEY}`,
    'Accept': 'application/json'
  }
});

/**
 * GET /api/schedule?start=YYYY-MM-DD&end=YYYY-MM-DD
 */
app.get('/api/schedule', async (req, res) => {
  const { start, end } = req.query;

  if (!start || !end) {
    return res.status(400).json({ error: 'start and end query params are required (YYYY-MM-DD).' });
  }

  try {
    // TODO — adjust the query params to match your real Current RMS API filtering options.
    const oppResp = await current.get('/opportunities', {
      params: {
        // Example only — needs to be replaced with your real fields:
        // 'starts_at_from': start,
        // 'starts_at_to': end
      }
    });

    const opportunities = oppResp.data?.opportunities || oppResp.data?.data || [];

    const jobs = opportunities.map(o => ({
      id: o.id,
      name: o.name || o.subject || `Opportunity #${o.id}`,
      starts_at: o.starts_at || o.starts_at_date || o.start_at,
      ends_at: o.ends_at || o.ends_at_date || o.end_at
    }));

    const assignmentsByJob = {};
    const staffById = {};

    // TODO — replace with your real staff assignment endpoint.
    for (const job of jobs) {
      assignmentsByJob[job.id] = [];
      const participants = []; // placeholder
    }

    res.json({
      jobs,
      staff: Object.values(staffById),
      assignments: assignmentsByJob
    });

  } catch (err) {
    console.error(err?.response?.data || err.message);
    res.status(500).json({
      error: 'Failed to fetch schedule from Current RMS',
      details: err?.response?.data || err.message
    });
  }
});

app.get('/', (_req, res) => {
  res.send('Current RMS schedule API running.');
});

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
