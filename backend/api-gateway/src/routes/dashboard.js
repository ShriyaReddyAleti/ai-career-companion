const express = require("express");
const axios = require("axios");
const { authenticateToken } = require("../middleware/auth");
const pool = require("../config/db");

const router = express.Router();

// Get dashboard summary for user
router.get("/summary", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const [resumes, matches, gaps, allResumesResult] = await Promise.all([
      pool.query("SELECT COUNT(*) as count FROM resumes WHERE user_id = $1", [userId]),
      pool.query("SELECT COUNT(*) as count FROM job_matches WHERE user_id = $1", [userId]),
      pool.query("SELECT COUNT(*) as count FROM skill_gaps WHERE user_id = $1", [userId]),
      pool.query(
        `SELECT r.id, r.file_name, r.uploaded_at, a.composite, a.details, a.scored_at
         FROM resumes r
         LEFT JOIN ats_scores a ON a.resume_id = r.id
         WHERE r.user_id = $1
         ORDER BY r.uploaded_at DESC, a.scored_at DESC NULLS LAST`,
        [userId]
      ),
    ]);

    const allResumes = allResumesResult.rows.map(r => ({
      id: r.id,
      fileName: r.file_name,
      uploadedAt: r.uploaded_at,
      atsScore: r.composite != null ? parseFloat(r.composite) : null,
      atsDetails: r.details || null,
      scoredAt: r.scored_at,
    }));

    const lr = allResumes[0] || null;

    res.json({
      resumeCount: parseInt(resumes.rows[0].count),
      matchCount: parseInt(matches.rows[0].count),
      skillGapCount: parseInt(gaps.rows[0].count),
      latestResume: lr,
      allResumes,
    });
  } catch (err) {
    console.error("Dashboard error:", err);
    res.status(500).json({ error: "Failed to fetch dashboard data" });
  }
});

// Fetch Canvas LMS courses using user's personal access token
router.post("/canvas", authenticateToken, async (req, res) => {
  const { token, canvas_url = "https://sjsu.instructure.com" } = req.body;
  if (!token) return res.status(400).json({ error: "Canvas token required" });

  try {
    const [coursesRes, userRes] = await Promise.all([
      axios.get(`${canvas_url}/api/v1/courses`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { enrollment_type: "student", per_page: 100, include: ["term"] },
        timeout: 10000,
      }),
      axios.get(`${canvas_url}/api/v1/users/self`, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 10000,
      }),
    ]);

    const courses = (coursesRes.data || [])
      .filter(c => c.name && c.workflow_state !== "deleted")
      .map(c => ({
        id: c.id,
        name: c.name,
        code: c.course_code || "",
        term: c.term?.name || "",
        status: c.workflow_state,
      }));

    res.json({ courses, canvasUser: userRes.data?.name || "" });
  } catch (err) {
    if (err.response?.status === 401) {
      return res.status(401).json({ error: "Invalid Canvas token — generate a new one in Canvas → Account → Settings" });
    }
    console.error("Canvas error:", err.message);
    res.status(500).json({ error: "Failed to fetch Canvas courses" });
  }
});

module.exports = router;
