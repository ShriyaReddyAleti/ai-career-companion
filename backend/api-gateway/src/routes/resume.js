const express = require("express");
const multer = require("multer");
const axios = require("axios");
const { authenticateToken } = require("../middleware/auth");
const pool = require("../config/db");

const router = express.Router();

const RESUME_PARSER_URL = process.env.RESUME_PARSER_URL || `http://localhost:${process.env.RESUME_PARSER_PORT || 8001}`;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedMime = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
      "application/octet-stream", // macOS sometimes reports PDFs this way
    ];
    const allowedExt = [".pdf", ".docx", ".txt"];
    const ext = "." + (file.originalname.split(".").pop() || "").toLowerCase();
    if (allowedMime.includes(file.mimetype) || allowedExt.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error("Only PDF, DOCX, and TXT files are allowed"));
    }
  },
});

// Use raw_text when available; fall back to reconstructing from parsed fields
function buildResumeText(resume) {
  if (resume.raw_text && resume.raw_text.trim().length > 50) {
    return resume.raw_text.trim();
  }

  // Fallback: reconstruct from parsed fields
  const parts = [];
  if (resume.parsed_summary || resume.summary) {
    parts.push("Summary\n" + (resume.parsed_summary || resume.summary));
  }
  const skills = resume.skills || [];
  if (skills.length > 0) {
    const names = skills.map((s) => (typeof s === "string" ? s : s.name || "")).filter(Boolean);
    if (names.length) parts.push("Skills\n" + names.join(", "));
  }
  const experience = resume.experience || [];
  if (experience.length > 0) {
    parts.push("Experience");
    experience.slice(0, 5).forEach((e) => {
      if (e.title) parts.push(e.title + (e.company ? ` at ${e.company}` : ""));
      if (e.description) parts.push(e.description);
    });
  }
  const education = resume.education || [];
  if (education.length > 0) {
    parts.push("Education");
    education.slice(0, 3).forEach((e) => {
      if (e.degree) parts.push(e.degree + (e.institution ? ` at ${e.institution}` : ""));
    });
  }
  return parts.join("\n").trim();
}

// Upload and parse resume
router.post("/upload", authenticateToken, upload.single("resume"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    // Save resume record
    const resumeResult = await pool.query(
      "INSERT INTO resumes (user_id, file_url, file_name, status) VALUES ($1, $2, $3, $4) RETURNING *",
      [req.user.id, `local://${req.file.originalname}`, req.file.originalname, "processing"]
    );
    const resume = resumeResult.rows[0];

    // Send to resume parser microservice
    try {
      const FormData = (await import("form-data")).default;
      const formData = new FormData();
      formData.append("file", req.file.buffer, {
        filename: req.file.originalname,
        contentType: req.file.mimetype,
      });

      const parseResponse = await axios.post(`${RESUME_PARSER_URL}/parse`, formData, {
        headers: formData.getHeaders(),
        timeout: 30000,
      });

      const parsed = parseResponse.data;

      await pool.query(
        `INSERT INTO parsed_data (resume_id, skills, experience, education, summary, raw_text)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (resume_id) DO UPDATE
           SET skills = EXCLUDED.skills,
               experience = EXCLUDED.experience,
               education = EXCLUDED.education,
               summary = EXCLUDED.summary,
               raw_text = EXCLUDED.raw_text`,
        [
          resume.id,
          JSON.stringify(parsed.skills || []),
          JSON.stringify(parsed.experience || []),
          JSON.stringify(parsed.education || []),
          parsed.summary || "",
          parsed.raw_text || "",
        ]
      );

      await pool.query("UPDATE resumes SET status = $1 WHERE id = $2", ["parsed", resume.id]);

      res.status(201).json({ resume: { ...resume, status: "parsed" }, parsed });
    } catch (parseErr) {
      console.error("Parser service error:", parseErr.message);
      await pool.query("UPDATE resumes SET status = $1 WHERE id = $2", ["upload_only", resume.id]);
      res.status(201).json({
        resume: { ...resume, status: "upload_only" },
        message: "Resume saved but parser service unavailable.",
      });
    }
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ error: "Failed to upload resume" });
  }
});

// Strip LaTeX markup down to plain text the parser can handle
function stripLatex(raw) {
  let text = raw;
  // Remove comments
  text = text.replace(/%.*$/gm, "");
  // Unwrap common formatting commands: \textbf{x} -> x, \textit{x} -> x, etc.
  // Repeat 3× to handle nested commands like \textbf{\textit{...}}
  for (let i = 0; i < 3; i++) {
    text = text.replace(/\\(?:textbf|textit|emph|underline|texttt|textrm|textsf|small|large|Large|huge|Huge|normalsize)\{([^{}]*)\}/g, "$1");
  }
  // Unwrap href: \href{url}{text} -> text
  text = text.replace(/\\href\{[^}]*\}\{([^}]*)\}/g, "$1");
  // Unwrap \item content and resume-specific commands
  text = text.replace(/\\resumeItem\{([^}]*)\}/g, "• $1\n");
  text = text.replace(/\\resumeSubheading\{([^}]*)\}\{([^}]*)\}\{([^}]*)\}\{([^}]*)\}/g, "$1 at $3 ($2, $4)\n");
  text = text.replace(/\\resumeProjectHeading\{([^}]*)\}\{([^}]*)\}/g, "$1 ($2)\n");
  // Remove LaTeX structural commands
  text = text.replace(/\\(?:begin|end)\{[^}]*\}/g, "\n");
  text = text.replace(/\\(?:resumeSubHeadingListStart|resumeSubHeadingListEnd|resumeItemListStart|resumeItemListEnd)/g, "\n");
  // Remove remaining backslash commands
  text = text.replace(/\\[a-zA-Z]+\*?\{([^}]*)\}/g, "$1");
  text = text.replace(/\\[a-zA-Z]+\*/g, "");
  text = text.replace(/\\[a-zA-Z]+/g, " ");
  // Clean up braces, special chars
  text = text.replace(/[{}]/g, " ");
  text = text.replace(/\\&/g, "&");
  text = text.replace(/\\%/g, "%");
  text = text.replace(/\\\$/g, "$");
  text = text.replace(/\\/g, " ");
  // Collapse whitespace
  text = text.replace(/[ \t]+/g, " ");
  text = text.replace(/\n{3,}/g, "\n\n");
  return text.trim();
}

// Re-parse a resume from pasted text (for upload_only resumes)
router.post("/:resumeId/reparse", authenticateToken, async (req, res) => {
  try {
    const { text } = req.body;
    const resumeId = req.params.resumeId;

    if (!text || !text.trim()) {
      return res.status(400).json({ error: "Provide resume text to parse" });
    }

    const resumeCheck = await pool.query(
      "SELECT id FROM resumes WHERE id = $1 AND user_id = $2",
      [resumeId, req.user.id]
    );
    if (resumeCheck.rows.length === 0) {
      return res.status(404).json({ error: "Resume not found" });
    }

    // Strip LaTeX if the text looks like a .tex source file
    const isLatex = /\\(?:documentclass|begin|resumeItem|textbf|usepackage)\b/.test(text);
    const cleanText = isLatex ? stripLatex(text) : text;

    const parseResponse = await axios.post(`${RESUME_PARSER_URL}/parse-text`, { text: cleanText }, { timeout: 30000 });
    const parsed = parseResponse.data;

    await pool.query(
      `INSERT INTO parsed_data (resume_id, skills, experience, education, summary, raw_text)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (resume_id) DO UPDATE
         SET skills = EXCLUDED.skills,
             experience = EXCLUDED.experience,
             education = EXCLUDED.education,
             summary = EXCLUDED.summary,
             raw_text = EXCLUDED.raw_text`,
      [
        resumeId,
        JSON.stringify(parsed.skills || []),
        JSON.stringify(parsed.experience || []),
        JSON.stringify(parsed.education || []),
        parsed.summary || "",
        parsed.raw_text || cleanText,
      ]
    );

    await pool.query("UPDATE resumes SET status = $1 WHERE id = $2", ["parsed", resumeId]);

    res.json({ parsed, status: "parsed" });
  } catch (err) {
    console.error("Reparse error:", err.response?.data || err.message);
    const detail = err.response?.data?.detail || err.response?.data?.error;
    res.status(500).json({
      error: detail
        ? `Parser error: ${detail}`
        : "Re-parse failed. Make sure the resume parser is running on port 8001.",
    });
  }
});

// Get user's resumes with parsed data
router.get("/", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT r.*, pd.skills, pd.experience, pd.education, pd.summary as parsed_summary, pd.raw_text
       FROM resumes r
       LEFT JOIN parsed_data pd ON pd.resume_id = r.id
       WHERE r.user_id = $1
       ORDER BY r.uploaded_at DESC`,
      [req.user.id]
    );
    res.json({ resumes: result.rows });
  } catch (err) {
    console.error("Fetch resumes error:", err);
    res.status(500).json({ error: "Failed to fetch resumes" });
  }
});

// Get ATS score for a resume based purely on ATS formatting rules
router.post("/:resumeId/score", authenticateToken, async (req, res) => {
  try {
    const resumeId = req.params.resumeId;

    const resumeResult = await pool.query(
      `SELECT r.*, pd.skills, pd.experience, pd.education, pd.summary as parsed_summary, pd.raw_text
       FROM resumes r
       LEFT JOIN parsed_data pd ON pd.resume_id = r.id
       WHERE r.id = $1 AND r.user_id = $2`,
      [resumeId, req.user.id]
    );

    if (resumeResult.rows.length === 0) {
      return res.status(404).json({ error: "Resume not found" });
    }

    const resume = resumeResult.rows[0];
    const resumeText = buildResumeText(resume);

    if (!resumeText) {
      return res.status(400).json({
        error: "No parseable content found for this resume. Please use the 'Re-parse' option to add your resume text.",
      });
    }

    const ATS_SCORER_URL = process.env.ATS_SCORER_URL || `http://localhost:${process.env.ATS_SCORER_PORT || 8002}`;

    const scoreResponse = await axios.post(`${ATS_SCORER_URL}/score`, {
      resume_text: resumeText,
    });

    const scores = scoreResponse.data;

    await pool.query(
      `INSERT INTO ats_scores (resume_id, job_id, keyword_score, semantic_score, format_score, composite, details)
       VALUES ($1, NULL, 0, 0, $2, $3, $4)`,
      [resumeId, scores.format_score, scores.composite, JSON.stringify(scores)]
    );

    res.json({ scores });
  } catch (err) {
    console.error("Scoring error:", err.response?.data || err.message);
    const msg = err.response?.data?.detail || err.response?.data?.error || err.message;
    res.status(500).json({ error: `Scoring failed: ${msg}` });
  }
});

module.exports = router;
