const express = require("express");
const axios = require("axios");
const { authenticateToken } = require("../middleware/auth");
const pool = require("../config/db");

const router = express.Router();

// Get job listings
router.get("/", authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 20, search } = req.query;
    const offset = (page - 1) * limit;

    let query = "SELECT * FROM job_listings";
    let params = [];

    if (search) {
      query += " WHERE title ILIKE $1 OR description ILIKE $1";
      params.push(`%${search}%`);
    }

    query += ` ORDER BY posted_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    // Get total count
    let countQuery = "SELECT COUNT(*) as total FROM job_listings";
    let countParams = [];
    if (search) {
      countQuery += " WHERE title ILIKE $1 OR description ILIKE $1";
      countParams.push(`%${search}%`);
    }
    const countResult = await pool.query(countQuery, countParams);

    res.json({
      jobs: result.rows,
      page: parseInt(page),
      limit: parseInt(limit),
      total: parseInt(countResult.rows[0].total),
    });
  } catch (err) {
    console.error("Fetch jobs error:", err);
    res.status(500).json({ error: "Failed to fetch jobs" });
  }
});

// Get job matches for user's latest resume
router.get("/matches", authenticateToken, async (req, res) => {
  try {
    // Get user's latest parsed resume skills + raw text for matching
    const resumeResult = await pool.query(
      `SELECT pd.skills, pd.raw_text FROM resumes r
       JOIN parsed_data pd ON pd.resume_id = r.id
       WHERE r.user_id = $1
       ORDER BY r.uploaded_at DESC LIMIT 1`,
      [req.user.id]
    );

    if (resumeResult.rows.length === 0) {
      return res.json({ matches: [], message: "Upload a resume first to get job matches" });
    }

    const skills = resumeResult.rows[0].skills || [];
    const skillNames = skills.map((s) => (typeof s === "string" ? s : s.name || "")).filter(Boolean);
    const resumeText = resumeResult.rows[0].raw_text || "";

    const JOB_MATCHER_URL = process.env.JOB_MATCHER_URL || `http://localhost:${process.env.JOB_MATCHER_PORT || 8003}`;

    const matchResponse = await axios.post(`${JOB_MATCHER_URL}/match`, {
      resume_skills: skillNames,
      resume_text: resumeText,
      limit: 100,
    }, { timeout: 45000 });

    res.json(matchResponse.data);
  } catch (err) {
    console.error("Match error:", err.message);
    // Fallback: return jobs from DB without matching
    try {
      const result = await pool.query("SELECT * FROM job_listings ORDER BY posted_at DESC LIMIT 10");
      res.json({ matches: result.rows.map(j => ({ ...j, match_score: 0 })), total_jobs_searched: result.rows.length });
    } catch (dbErr) {
      res.status(500).json({ error: "Failed to fetch job matches" });
    }
  }
});

// Analyze skill gaps for a specific job
router.post("/skill-gap", authenticateToken, async (req, res) => {
  try {
    const { job_id } = req.body;

    // Get user's skills
    const resumeResult = await pool.query(
      `SELECT pd.skills FROM resumes r
       JOIN parsed_data pd ON pd.resume_id = r.id
       WHERE r.user_id = $1
       ORDER BY r.uploaded_at DESC LIMIT 1`,
      [req.user.id]
    );

    if (resumeResult.rows.length === 0) {
      return res.status(400).json({ error: "Upload a resume first" });
    }

    const userSkills = (resumeResult.rows[0].skills || [])
      .map((s) => (typeof s === "string" ? s : s.name || ""))
      .filter(Boolean);

    // Get job details
    const jobResult = await pool.query("SELECT * FROM job_listings WHERE id = $1", [job_id]);
    if (jobResult.rows.length === 0) {
      return res.status(404).json({ error: "Job not found" });
    }

    const job = jobResult.rows[0];
    const jobSkills = (job.required_skills || [])
      .map((s) => (typeof s === "string" ? s : s.name || ""))
      .filter(Boolean);

    const SKILL_GAP_URL = process.env.SKILL_GAP_URL || `http://localhost:${process.env.SKILL_GAP_PORT || 8004}`;

    const gapResponse = await axios.post(`${SKILL_GAP_URL}/analyze`, {
      user_skills: userSkills,
      target_job_skills: jobSkills,
      target_job_title: job.title,
      target_job_description: job.description || "",
    });

    res.json(gapResponse.data);
  } catch (err) {
    console.error("Skill gap error:", err.message);
    res.status(500).json({ error: "Failed to analyze skill gaps. Make sure skill-gap service is running." });
  }
});

// Analyze skill gaps for a target role (no specific job needed)
router.post("/skill-gap-role", authenticateToken, async (req, res) => {
  try {
    const { target_role } = req.body;
    if (!target_role) return res.status(400).json({ error: "target_role is required" });

    const resumeResult = await pool.query(
      `SELECT pd.skills FROM resumes r
       JOIN parsed_data pd ON pd.resume_id = r.id
       WHERE r.user_id = $1
       ORDER BY r.uploaded_at DESC LIMIT 1`,
      [req.user.id]
    );

    if (resumeResult.rows.length === 0) {
      return res.status(400).json({ error: "Upload a resume first" });
    }

    const userSkills = (resumeResult.rows[0].skills || [])
      .map((s) => (typeof s === "string" ? s : s.name || ""))
      .filter(Boolean);

    const SKILL_GAP_URL = process.env.SKILL_GAP_URL || `http://localhost:${process.env.SKILL_GAP_PORT || 8004}`;
    const gapResponse = await axios.post(`${SKILL_GAP_URL}/analyze-role`, {
      user_skills: userSkills,
      target_role,
    });

    res.json(gapResponse.data);
  } catch (err) {
    console.error("Skill gap role error:", err.message);
    res.status(500).json({ error: "Failed to analyze skill gaps. Make sure skill-gap service is running." });
  }
});

module.exports = router;
