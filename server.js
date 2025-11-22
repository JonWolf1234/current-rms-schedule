// server.js
require("dotenv").config();
const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();

// CORS + static files
app.use(cors());
app.use(express.static("public"));

// --- Current RMS client (correct auth headers) ---
const current = axios.create({
  baseURL: "https://api.current-rms.com/api/v1",
  headers: {
    "X-SUBDOMAIN": process.env.CURRENT_SUBDOMAIN,
    "X-AUTH-TOKEN": process.env.CURRENT_API_KEY,
    Accept: "application/json",
  },
});

// --- Helper: fetch ALL pages of a list endpoint ---
// path: "/members" or "/opportunities"
// collectionKey: "members" or "opportunities"
// baseParams: any params you always want to send
async function fetchAllPages(path, collectionKey, baseParams = {}) {
  const per_page = 100; // bump this up from defaults
  let page = 1;
  let items = [];

  // safety guard: max 50 pages => 5000 records
  while (page <= 50) {
    const resp = await current.get(path, {
      params: {
        ...baseParams,
        page,
        per_page,
      },
    });

    const pageItems = resp.data?.[collectionKey] || [];
    items = items.concat(pageItems);

    // If we got fewer than per_page, we've reached the end
    if (pageItems.length < per_page) break;

    page += 1;
  }

  return items;
}

// --- Simple test route to confirm auth works ---
// Visit /api/test-current in the browser to sanity-check API access.
app.get("/api/test-current", async (req, res) => {
  try {
    const members = await fetchAllPages("/members", "members", {
      // you can add filters in q if needed later
    });

    res.json({
      ok: true,
      members_count: members.length,
    });
  } catch (err) {
    console.error(err?.response?.data || err.message);
    res.status(500).json({
      ok: false,
      error: "Failed to talk to Current RMS",
      details: err?.response?.data || err.message,
    });
  }
});

// --- Main schedule endpoint ---
// GET /api/schedule?start=YYYY-MM-DD&end=YYYY-MM-DD
app.get("/api/schedule", async (req, res) => {
  const { start, end } = req.query;

  if (!start || !end) {
    return res
      .status(400)
      .json({ error: "start and end query params are required (YYYY-MM-DD)." });
  }

  // Build full-day range in UTC
  const startIso = new Date(`${start}T00:00:00Z`).toISOString();
  const endIso = new Date(`${end}T23:59:59Z`).toISOString();

  try {
    // 1) Fetch ALL members (staff) across all pages
    const members = await fetchAllPages("/members", "members", {
      // If you want to restrict to active only later, you can add:
      // q: { active_eq: true }
    });

    const staff = members.map((m) => ({
      id: m.id,
      // Try various common name fields, fall back to generic label
      name:
        m.name ||
        m.full_name ||
        m.display_name ||
        m.company_name ||
        `Member #${m.id}`,
    }));

    // 2) Fetch ALL opportunities in the date range across all pages
    // Using Ransack-style filters (see Current RMS docs / MCP repo)
    const opportunities = await fetchAllPages("/opportunities", "opportunities", {
      q: {
        // Only date filters: include any status for now so nothing is missed.
        // Adjust these if you want only confirmed jobs etc.
        starts_at_gteq: startIso,
        ends_at_lteq: endIso,
      },
    });

    const jobs = opportunities.map((o) => ({
      id: o.id,
      name: o.name || o.subject || `Opportunity #${o.id}`,
      starts_at: o.starts_at || o.starts_at_date || o.start_at,
      ends_at: o.ends_at || o.ends_at_date || o.end_at,
    }));

    // 3) For now, no assignment logic – just an empty list per job
    //    so we can first confirm staff + job counts are correct.
    const assignments = {};
    for (const job of jobs) {
      assignments[job.id] = []; // later we'll fill this with staff IDs
    }

    res.json({ jobs, staff, assignments });
  } catch (err) {
    console.error(err?.response?.data || err.message);
    res.status(500).json({
      error: "Failed to fetch schedule from Current RMS",
      details: err?.response?.data || err.message,
    });
  }
});

// Root route
app.get("/", (_req, res) => {
  res.send("Current RMS schedule API running.");
});

// Start server
const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

