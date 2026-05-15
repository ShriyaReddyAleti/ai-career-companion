const express = require("express");
const axios = require("axios");
const { authenticateToken } = require("../middleware/auth");
const pool = require("../config/db");

const router = express.Router();

const CHATBOT_URL = process.env.CHATBOT_URL || `http://localhost:${process.env.CHATBOT_PORT || 8005}`;
const COURSE_RECOMMENDER_URL = process.env.COURSE_RECOMMENDER_URL || `http://localhost:${process.env.COURSE_RECOMMENDER_PORT || 8006}`;

// Start new conversation
router.post("/conversations", authenticateToken, async (req, res) => {
  try {
    const { type = "general" } = req.body;
    const result = await pool.query(
      "INSERT INTO conversations (user_id, conversation_type) VALUES ($1, $2) RETURNING *",
      [req.user.id, type]
    );
    res.status(201).json({ conversation: result.rows[0] });
  } catch (err) {
    console.error("Create conversation error:", err);
    res.status(500).json({ error: "Failed to create conversation" });
  }
});

// Send message — calls chatbot microservice
router.post("/conversations/:id/messages", authenticateToken, async (req, res) => {
  try {
    const { content } = req.body;
    const conversationId = req.params.id;

    if (!content || !content.trim()) {
      return res.status(400).json({ error: "Message content cannot be empty" });
    }

    // Save user message
    await pool.query(
      "INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3)",
      [conversationId, "user", content]
    );

    // Fetch conversation type + history
    const [convResult, historyResult] = await Promise.all([
      pool.query("SELECT conversation_type FROM conversations WHERE id = $1", [conversationId]),
      pool.query("SELECT role, content FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC LIMIT 20", [conversationId]),
    ]);
    const conversationType = convResult.rows[0]?.conversation_type || "general";
    const history = historyResult.rows.slice(0, -1); // exclude the message we just added

    // Fetch user context — include raw_text for RAG
    let userContext = null;
    try {
      const ctxResult = await pool.query(
        `SELECT pd.skills, pd.experience, pd.education, pd.raw_text
         FROM resumes r
         JOIN parsed_data pd ON pd.resume_id = r.id
         WHERE r.user_id = $1
         ORDER BY r.uploaded_at DESC LIMIT 1`,
        [req.user.id]
      );
      if (ctxResult.rows.length > 0) {
        userContext = ctxResult.rows[0];
      }
    } catch (_) {}
    // Merge any extra context from request body (e.g. target_role)
    if (req.body.context) {
      userContext = { ...(userContext || {}), ...req.body.context };
    }

    // Call chatbot microservice
    let aiResponse;
    try {
      const chatRes = await axios.post(`${CHATBOT_URL}/chat`, {
        message: content,
        conversation_history: history,
        context: userContext,
        conversation_type: conversationType,
      }, { timeout: 30000 });
      aiResponse = chatRes.data.response;
    } catch (chatErr) {
      console.error("Chatbot service error:", chatErr.message);
      aiResponse = "I'm having trouble connecting to the AI service right now. Please make sure the chatbot service is running on port 8005.";
    }

    // Save AI response
    await pool.query(
      "INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3)",
      [conversationId, "assistant", aiResponse]
    );

    res.json({ response: aiResponse });
  } catch (err) {
    console.error("Send message error:", err);
    res.status(500).json({ error: "Failed to send message" });
  }
});

// Get conversation messages
router.get("/conversations/:id/messages", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC",
      [req.params.id]
    );
    res.json({ messages: result.rows });
  } catch (err) {
    console.error("Fetch messages error:", err);
    res.status(500).json({ error: "Failed to fetch messages" });
  }
});

// Get all user conversations
router.get("/conversations", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.*, COUNT(m.id) as message_count
       FROM conversations c
       LEFT JOIN messages m ON m.conversation_id = c.id
       WHERE c.user_id = $1
       GROUP BY c.id
       ORDER BY c.created_at DESC`,
      [req.user.id]
    );
    res.json({ conversations: result.rows });
  } catch (err) {
    console.error("Fetch conversations error:", err);
    res.status(500).json({ error: "Failed to fetch conversations" });
  }
});

// Code evaluation — proxies to chatbot microservice
router.post("/evaluate-code", authenticateToken, async (req, res) => {
  try {
    const { question, code, language, target_role } = req.body;
    const evalRes = await axios.post(`${CHATBOT_URL}/evaluate-code`, {
      question, code, language: language || "python", target_role: target_role || "",
    }, { timeout: 30000 });
    res.json(evalRes.data);
  } catch (err) {
    console.error("Code eval error:", err.message);
    res.status(500).json({ error: "Code evaluation failed" });
  }
});

// Course recommendations — proxies to course-recommender microservice
router.post("/courses/recommend", authenticateToken, async (req, res) => {
  try {
    const { skills_to_learn, target_role, level } = req.body;

    // Get user's current skills if not provided
    let currentSkills = req.body.current_skills || [];
    if (!currentSkills.length) {
      try {
        const skillResult = await pool.query(
          `SELECT pd.skills FROM resumes r
           JOIN parsed_data pd ON pd.resume_id = r.id
           WHERE r.user_id = $1
           ORDER BY r.uploaded_at DESC LIMIT 1`,
          [req.user.id]
        );
        if (skillResult.rows.length > 0) {
          const skills = skillResult.rows[0].skills || [];
          currentSkills = skills.map((s) => (typeof s === "string" ? s : s.name || "")).filter(Boolean);
        }
      } catch (_) {}
    }

    const recRes = await axios.post(`${COURSE_RECOMMENDER_URL}/recommend`, {
      skills_to_learn: skills_to_learn || [],
      current_skills: currentSkills,
      target_role: target_role || "",
      level: level || "beginner",
    }, { timeout: 10000 });

    res.json(recRes.data);
  } catch (err) {
    console.error("Course recommend error:", err.message);
    res.status(500).json({ error: "Failed to get course recommendations. Make sure the course-recommender service is running on port 8006." });
  }
});

module.exports = router;
