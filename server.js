// server.js
require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();

// Allow frontend to call our backend
app.use(cors());

// Serve static files in /public (schedule.html lives there)
app.use(express.static('public'));

// Axios client for Current RMS API
const current = axios.create({
  baseURL: 'https://api.current-rms.com/api/v1',
  headers: {
    'X-SUBDOMAIN': process.env.CURRENT_SUBDOMAIN,
    'X-AUTH-TOKEN': process.env.CURRENT_API_KEY,
    'Accept': 'application/json'
  }
});

// --- Test route to validate auth & basic connectivity ---
app.get('/api/test-current', async (req, res) => {
  try {
    const [membersResp, oppResp] = await Promise.all([
      current.get('/members', { params: { per_page: 200 } }),
      current.get('/opportunities', { params: { per_page: 50, view: 'all' } })
    ]);

    const members = membersResp.data?.members || membersResp.data?.data || [];
    const opps = oppResp.data?.opportunities || oppResp.data?.data || [];

    res.json({
      ok: true,
      membersCount: members.length,
      opportunitiesCount: opps.length
    });
  } catch (err) {
    console.error('Error in /api/test-current:', err?.response?.data || err.message);
    res.status(500).json({
      ok: false,
      error: 'Failed to talk to Current RMS',
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
 *   assignments: { [jobId]: staffId[] },
 *   source: 'current-rms' | 'mock' | 'mock-error'
 * }
 */
app.get('/api/schedule', async (req, res) => {
  const { start, end } = req.query;

  if (!start || !end) {
    return res
      .status(400)
      .json({ error: 'start and end query params are required (YYYY-MM-DD).' });
  }

  try {
    // 1) Fetch opportunities (jobs) and members (staff)
    const [oppResp, membersResp] = await Promise.all([
      current.get('/opportunities', {
        params: {
          per_page: 200,
          view: 'all',       // adjust to 'active' or your preferred view
          starts_at_from: start,
          starts_at_to: end
        }
      }),
      current.get('/members', { params: { per_page: 200 } })
    ]);

    const opportunities = oppResp.data?.opportunities || oppResp.data?.data || [];
    const members = membersResp.data?.members || membersResp.data?.data || [];

    // 2) Map opportunities -> jobs
    const jobs = opportunities.map(o => ({
      id: o.id,
      name: o.name || o.subject || `Opportunity #${o.id}`,
      starts_at:
        o.starts_at ||
        o.starts_at_date ||
        o.start_at ||
        o.starts_at_on ||
        null,
      ends_at:
        o.ends_at ||
        o.ends_at_date ||
        o.end_at ||
        o.ends_at_on ||
        null
    }));

    // 3) Map members -> staff
    const staff = members.map(m => ({
      id: m.id,
      name:
        [m.first_name, m.last_name].filter(Boolean).join(' ') ||
        m.name ||
        `Member #${m.id}`
    }));

    // 4) Assignments: at this stage we don’t know your exact staff booking model,
    // so we initialise empty assignments (no ✔ marks yet).
    const assignments = {};
    jobs.forEach(job => {
      assignments[job.id] = [];
    });

    // 5) If no jobs returned in the date range, fall back to a small mock schedule
    if (jobs.length === 0) {
      const mockJobs = [
        {
          id: 9001,
          name: 'Example Job 1 (mock)',
          starts_at: `${start} 09:00`,
          ends_at: `${start} 17:00`
        },
        {
          id: 9002,
          name: 'Example Job 2 (mock)',
          starts_at: `${end} 10:00`,
          ends_at: `${end} 18:00`
        }
      ];

      const mockAssignments = {};
      const someStaffIds = staff.slice(0, 3).map(s => s.id); // up to first 3 staff

      mockJobs.forEach(job => {
        mockAssignments[job.id] = someStaffIds;
      });

      return res.json({
        jobs: mockJobs,
        staff,
        assignments: mockAssignments,
        source: 'mock'
      });
    }

    // 6) Normal case: jobs found, but no real staff-job assignments yet
    return res.json({
      jobs,
      staff,
      assignments,
      source: 'current-rms'
    });
  } catch (err) {
    console.error('Error in /api/schedule:', err?.response?.data || err.message);

    // Fallback: return a fully mocked schedule so the UI still works
    const staff = [
      { id: 1, name: 'Alice Tech' },
      { id: 2, name: 'Bob LX' },
      { id: 3, name: 'Charlie Audio' }
    ];
    const jobs = [
      {
        id: 101,
        name: 'Mock Job One (error fallback)',
        starts_at: `${start} 09:00`,
        ends_at: `${start} 18:00`
      },
      {
        id: 102,
        name: 'Mock Job Two (error fallback)',
        starts_at: `${end} 10:00`,
        ends_at: `${end} 22:00`
      }
    ];
    const assignments = {
      101: [1, 2],
      102: [2, 3]
    };

    return res.json({
      jobs,
      staff,
      assignments,
      source: 'mock-error',
      error: err?.response?.data || err.message
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

