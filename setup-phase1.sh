#!/bin/bash
# AI Career Companion - Phase 1 Setup Script
# Run this from inside your ai-career-companion folder

echo "🚀 Setting up AI Career Companion project structure..."

# Create directory structure
mkdir -p backend/api-gateway/src/{middleware,routes,config}
mkdir -p backend/services/resume-parser/app/{models,routers,services,utils}
mkdir -p backend/services/ats-scorer/app/{models,routers,services}
mkdir -p backend/services/job-matcher/app/{models,routers,services}
mkdir -p backend/services/skill-gap/app/{models,routers,services}
mkdir -p backend/services/chatbot/app/{models,routers,services}
mkdir -p backend/services/course-recommender/app/{models,routers,services}
mkdir -p frontend/src/{components,pages,hooks,utils,styles}
mkdir -p database/{migrations,seeds}
mkdir -p docker
mkdir -p scripts

echo "✅ Directory structure created"

###############################################
# Root files
###############################################

cat > .gitignore << 'EOF'
# Dependencies
node_modules/
__pycache__/
*.pyc
.venv/
venv/
env/

# Environment files
.env
.env.local
.env.production

# IDE
.vscode/
.idea/

# OS
.DS_Store
Thumbs.db

# Build
dist/
build/
.next/

# Logs
*.log
logs/

# Docker
docker/data/

# ML Models cache
models_cache/
EOF

cat > .env.example << 'EOF'
# Database
POSTGRES_USER=career_admin
POSTGRES_PASSWORD=your_secure_password_here
POSTGRES_DB=career_companion
POSTGRES_HOST=localhost
POSTGRES_PORT=5432

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password_here

# API Gateway
API_GATEWAY_PORT=3001
JWT_SECRET=your_jwt_secret_here

# FastAPI Services
RESUME_PARSER_PORT=8001
ATS_SCORER_PORT=8002
JOB_MATCHER_PORT=8003
SKILL_GAP_PORT=8004
CHATBOT_PORT=8005
COURSE_RECOMMENDER_PORT=8006

# External APIs (add your keys later)
OPENAI_API_KEY=your_openai_key_here

# Frontend
NEXT_PUBLIC_API_URL=http://localhost:3001/api
EOF

# Create actual .env from example
cp .env.example .env

###############################################
# Docker Compose
###############################################

cat > docker-compose.yml << 'EOF'
version: "3.8"

services:
  # PostgreSQL with pgvector
  postgres:
    image: pgvector/pgvector:pg16
    container_name: career_postgres
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-career_admin}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-your_secure_password_here}
      POSTGRES_DB: ${POSTGRES_DB:-career_companion}
    ports:
      - "${POSTGRES_PORT:-5432}:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./database/migrations/001_initial_schema.sql:/docker-entrypoint-initdb.d/001_initial_schema.sql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-career_admin}"]
      interval: 10s
      timeout: 5s
      retries: 5

  # Redis for caching
  redis:
    image: redis:7-alpine
    container_name: career_redis
    command: redis-server --requirepass ${REDIS_PASSWORD:-your_redis_password_here}
    ports:
      - "${REDIS_PORT:-6379}:6379"
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "${REDIS_PASSWORD:-your_redis_password_here}", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
  redis_data:
EOF

###############################################
# Database Migration
###############################################

cat > database/migrations/001_initial_schema.sql << 'EOF'
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Resumes table
CREATE TABLE resumes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    file_url TEXT NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'uploaded',
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Parsed resume data
CREATE TABLE parsed_data (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    resume_id UUID NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
    skills JSONB DEFAULT '[]',
    experience JSONB DEFAULT '[]',
    education JSONB DEFAULT '[]',
    summary TEXT,
    parsed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Embeddings table (for vector similarity search)
CREATE TABLE embeddings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_id UUID NOT NULL,
    source_type VARCHAR(50) NOT NULL,
    vector vector(768),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create HNSW index for fast similarity search
CREATE INDEX ON embeddings USING hnsw (vector vector_cosine_ops);

-- Job listings table
CREATE TABLE job_listings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    company VARCHAR(255) NOT NULL,
    location VARCHAR(255),
    description TEXT,
    required_skills JSONB DEFAULT '[]',
    seniority_level VARCHAR(50),
    salary_range VARCHAR(100),
    posted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    source_url TEXT
);

-- ATS scores table
CREATE TABLE ats_scores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    resume_id UUID NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
    job_id UUID NOT NULL REFERENCES job_listings(id) ON DELETE CASCADE,
    keyword_score FLOAT DEFAULT 0,
    semantic_score FLOAT DEFAULT 0,
    format_score FLOAT DEFAULT 0,
    composite FLOAT DEFAULT 0,
    details JSONB DEFAULT '{}',
    scored_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Job matches table
CREATE TABLE job_matches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    job_id UUID NOT NULL REFERENCES job_listings(id) ON DELETE CASCADE,
    match_score FLOAT DEFAULT 0,
    matched_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Skill gaps table
CREATE TABLE skill_gaps (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    job_id UUID REFERENCES job_listings(id),
    skill VARCHAR(255) NOT NULL,
    priority VARCHAR(50) DEFAULT 'medium',
    detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Course recommendations table
CREATE TABLE course_recs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    gap_id UUID NOT NULL REFERENCES skill_gaps(id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL,
    platform VARCHAR(100) NOT NULL,
    url TEXT,
    difficulty VARCHAR(50),
    recommended_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Chat conversations table
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    conversation_type VARCHAR(50) DEFAULT 'general',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Chat messages table
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_resumes_user_id ON resumes(user_id);
CREATE INDEX idx_parsed_data_resume_id ON parsed_data(resume_id);
CREATE INDEX idx_ats_scores_resume_id ON ats_scores(resume_id);
CREATE INDEX idx_job_matches_user_id ON job_matches(user_id);
CREATE INDEX idx_skill_gaps_user_id ON skill_gaps(user_id);
CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX idx_embeddings_source ON embeddings(source_id, source_type);

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();
EOF

###############################################
# API Gateway - package.json
###############################################

cat > backend/api-gateway/package.json << 'EOF'
{
  "name": "api-gateway",
  "version": "1.0.0",
  "description": "AI Career Companion API Gateway",
  "main": "src/index.js",
  "scripts": {
    "start": "node src/index.js",
    "dev": "nodemon src/index.js",
    "test": "jest"
  },
  "dependencies": {
    "express": "^4.21.0",
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "helmet": "^7.1.0",
    "morgan": "^1.10.0",
    "express-rate-limit": "^7.4.0",
    "jsonwebtoken": "^9.0.2",
    "bcryptjs": "^2.4.3",
    "axios": "^1.7.7",
    "ioredis": "^5.4.1",
    "multer": "^1.4.5-lts.1",
    "pg": "^8.13.0",
    "uuid": "^10.0.0"
  },
  "devDependencies": {
    "nodemon": "^3.1.4",
    "jest": "^29.7.0"
  }
}
EOF

###############################################
# API Gateway - Main Entry Point
###############################################

cat > backend/api-gateway/src/index.js << 'JSEOF'
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
require("dotenv").config({ path: "../../.env" });

const authRoutes = require("./routes/auth");
const resumeRoutes = require("./routes/resume");
const jobRoutes = require("./routes/jobs");
const chatRoutes = require("./routes/chat");
const dashboardRoutes = require("./routes/dashboard");

const app = express();
const PORT = process.env.API_GATEWAY_PORT || 3001;

// Middleware
app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL || "http://localhost:3000", credentials: true }));
app.use(morgan("dev"));
app.use(express.json({ limit: "10mb" }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: "Too many requests, please try again later." },
});
app.use("/api/", limiter);

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", service: "api-gateway", timestamp: new Date().toISOString() });
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/resumes", resumeRoutes);
app.use("/api/jobs", jobRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/dashboard", dashboardRoutes);

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ error: err.message || "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`🚀 API Gateway running on port ${PORT}`);
});

module.exports = app;
JSEOF

###############################################
# API Gateway - Config
###############################################

cat > backend/api-gateway/src/config/db.js << 'JSEOF'
const { Pool } = require("pg");

const pool = new Pool({
  user: process.env.POSTGRES_USER || "career_admin",
  password: process.env.POSTGRES_PASSWORD || "your_secure_password_here",
  host: process.env.POSTGRES_HOST || "localhost",
  port: parseInt(process.env.POSTGRES_PORT || "5432"),
  database: process.env.POSTGRES_DB || "career_companion",
  max: 20,
  idleTimeoutMillis: 30000,
});

pool.on("error", (err) => {
  console.error("Unexpected database error:", err);
});

module.exports = pool;
JSEOF

cat > backend/api-gateway/src/config/redis.js << 'JSEOF'
const Redis = require("ioredis");

const redis = new Redis({
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT || "6379"),
  password: process.env.REDIS_PASSWORD || "your_redis_password_here",
  retryStrategy: (times) => Math.min(times * 50, 2000),
});

redis.on("error", (err) => console.error("Redis error:", err));
redis.on("connect", () => console.log("✅ Connected to Redis"));

module.exports = redis;
JSEOF

###############################################
# API Gateway - Auth Middleware
###############################################

cat > backend/api-gateway/src/middleware/auth.js << 'JSEOF'
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "your_jwt_secret_here";

function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Access token required" });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: "Invalid or expired token" });
    req.user = user;
    next();
  });
}

module.exports = { authenticateToken };
JSEOF

###############################################
# API Gateway - Routes (stubs)
###############################################

cat > backend/api-gateway/src/routes/auth.js << 'JSEOF'
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../config/db");

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "your_jwt_secret_here";

// Register
router.post("/register", async (req, res) => {
  try {
    const { email, name, password } = req.body;
    if (!email || !name || !password) {
      return res.status(400).json({ error: "All fields are required" });
    }

    const existingUser = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
    if (existingUser.rows.length > 0) {
      return res.status(409).json({ error: "Email already registered" });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      "INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3) RETURNING id, email, name, created_at",
      [email, name, passwordHash]
    );

    const user = result.rows[0];
    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: "7d" });

    res.status(201).json({ user, token });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ error: "Registration failed" });
  }
});

// Login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password required" });
    }

    const result = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: "7d" });

    res.json({
      user: { id: user.id, email: user.email, name: user.name },
      token,
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Login failed" });
  }
});

module.exports = router;
JSEOF

cat > backend/api-gateway/src/routes/resume.js << 'JSEOF'
const express = require("express");
const multer = require("multer");
const { authenticateToken } = require("../middleware/auth");
const pool = require("../config/db");
const axios = require("axios");

const router = express.Router();

// Configure multer for file uploads (store in memory for now)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowed = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only PDF and DOCX files are allowed"));
    }
  },
});

// Upload resume
router.post("/upload", authenticateToken, upload.single("resume"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    // For now, store file reference in DB (later: upload to S3/GCS)
    const result = await pool.query(
      "INSERT INTO resumes (user_id, file_url, file_name, status) VALUES ($1, $2, $3, $4) RETURNING *",
      [req.user.id, `local://${req.file.originalname}`, req.file.originalname, "uploaded"]
    );

    // TODO: Send to resume parser microservice
    // await axios.post(`http://localhost:${process.env.RESUME_PARSER_PORT}/parse`, { ... });

    res.status(201).json({ resume: result.rows[0], message: "Resume uploaded successfully" });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ error: "Failed to upload resume" });
  }
});

// Get user's resumes
router.get("/", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM resumes WHERE user_id = $1 ORDER BY uploaded_at DESC",
      [req.user.id]
    );
    res.json({ resumes: result.rows });
  } catch (err) {
    console.error("Fetch resumes error:", err);
    res.status(500).json({ error: "Failed to fetch resumes" });
  }
});

module.exports = router;
JSEOF

cat > backend/api-gateway/src/routes/jobs.js << 'JSEOF'
const express = require("express");
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
      query += " WHERE title ILIKE $1 OR company ILIKE $1 OR description ILIKE $1";
      params.push(`%${search}%`);
    }

    query += ` ORDER BY posted_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);
    res.json({ jobs: result.rows, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    console.error("Fetch jobs error:", err);
    res.status(500).json({ error: "Failed to fetch jobs" });
  }
});

// Get job matches for user
router.get("/matches", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT jm.*, jl.title, jl.company, jl.location, jl.required_skills
       FROM job_matches jm
       JOIN job_listings jl ON jm.job_id = jl.id
       WHERE jm.user_id = $1
       ORDER BY jm.match_score DESC`,
      [req.user.id]
    );
    res.json({ matches: result.rows });
  } catch (err) {
    console.error("Fetch matches error:", err);
    res.status(500).json({ error: "Failed to fetch job matches" });
  }
});

module.exports = router;
JSEOF

cat > backend/api-gateway/src/routes/chat.js << 'JSEOF'
const express = require("express");
const { authenticateToken } = require("../middleware/auth");
const pool = require("../config/db");

const router = express.Router();

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

// Send message
router.post("/conversations/:id/messages", authenticateToken, async (req, res) => {
  try {
    const { content } = req.body;
    const conversationId = req.params.id;

    // Save user message
    await pool.query(
      "INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3)",
      [conversationId, "user", content]
    );

    // TODO: Send to chatbot microservice and get AI response
    const aiResponse = "I'm the AI Career Companion assistant. This is a placeholder response - the chatbot service will be connected in Phase 4.";

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

module.exports = router;
JSEOF

cat > backend/api-gateway/src/routes/dashboard.js << 'JSEOF'
const express = require("express");
const { authenticateToken } = require("../middleware/auth");
const pool = require("../config/db");

const router = express.Router();

// Get dashboard summary for user
router.get("/summary", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const [resumes, matches, gaps] = await Promise.all([
      pool.query("SELECT COUNT(*) as count FROM resumes WHERE user_id = $1", [userId]),
      pool.query("SELECT COUNT(*) as count FROM job_matches WHERE user_id = $1", [userId]),
      pool.query("SELECT COUNT(*) as count FROM skill_gaps WHERE user_id = $1", [userId]),
    ]);

    res.json({
      resumeCount: parseInt(resumes.rows[0].count),
      matchCount: parseInt(matches.rows[0].count),
      skillGapCount: parseInt(gaps.rows[0].count),
    });
  } catch (err) {
    console.error("Dashboard error:", err);
    res.status(500).json({ error: "Failed to fetch dashboard data" });
  }
});

module.exports = router;
JSEOF

###############################################
# Resume Parser Microservice (FastAPI)
###############################################

cat > backend/services/resume-parser/requirements.txt << 'EOF'
fastapi==0.115.0
uvicorn==0.30.6
python-multipart==0.0.9
pydantic==2.9.2
psycopg2-binary==2.9.9
python-dotenv==1.0.1
PyPDF2==3.0.1
python-docx==1.1.2
spacy==3.7.6
sentence-transformers==3.1.1
numpy==1.26.4
EOF

cat > backend/services/resume-parser/app/__init__.py << 'EOF'
EOF

cat > backend/services/resume-parser/app/main.py << 'PYEOF'
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

app = FastAPI(title="Resume Parser Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "resume-parser"}


@app.post("/parse")
async def parse_resume(file: UploadFile = File(...)):
    """Parse a resume file and extract structured data."""
    if file.content_type not in [
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ]:
        raise HTTPException(status_code=400, detail="Only PDF and DOCX files supported")

    content = await file.read()

    # TODO: Implement full parsing in Phase 3
    # 1. Extract text from PDF/DOCX
    # 2. Run spaCy NER pipeline
    # 3. Segment into sections
    # 4. Generate Sentence-BERT embeddings
    # 5. Store in PostgreSQL + pgvector

    return {
        "status": "parsed",
        "filename": file.filename,
        "size": len(content),
        "message": "Resume parser stub - full implementation in Phase 3",
    }


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8001)
PYEOF

###############################################
# ATS Scorer Microservice (FastAPI stub)
###############################################

cat > backend/services/ats-scorer/requirements.txt << 'EOF'
fastapi==0.115.0
uvicorn==0.30.6
pydantic==2.9.2
psycopg2-binary==2.9.9
python-dotenv==1.0.1
numpy==1.26.4
sentence-transformers==3.1.1
EOF

cat > backend/services/ats-scorer/app/__init__.py << 'EOF'
EOF

cat > backend/services/ats-scorer/app/main.py << 'PYEOF'
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

app = FastAPI(title="ATS Scoring Engine", version="1.0.0")

app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "ats-scorer"}


@app.post("/score")
async def score_resume(resume_id: str, job_id: str):
    """Score a resume against a job description."""
    # TODO: Implement in Phase 3
    return {
        "resume_id": resume_id,
        "job_id": job_id,
        "keyword_score": 0.0,
        "semantic_score": 0.0,
        "format_score": 0.0,
        "composite": 0.0,
        "message": "ATS scorer stub - full implementation in Phase 3",
    }


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8002)
PYEOF

###############################################
# Job Matcher Microservice (FastAPI stub)
###############################################

cat > backend/services/job-matcher/requirements.txt << 'EOF'
fastapi==0.115.0
uvicorn==0.30.6
pydantic==2.9.2
psycopg2-binary==2.9.9
python-dotenv==1.0.1
numpy==1.26.4
EOF

cat > backend/services/job-matcher/app/__init__.py << 'EOF'
EOF

cat > backend/services/job-matcher/app/main.py << 'PYEOF'
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

app = FastAPI(title="Job Matching Engine", version="1.0.0")

app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "job-matcher"}


@app.post("/match")
async def match_jobs(user_id: str):
    """Find matching jobs for a user's resume."""
    # TODO: Implement in Phase 3
    return {
        "user_id": user_id,
        "matches": [],
        "message": "Job matcher stub - full implementation in Phase 3",
    }


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8003)
PYEOF

###############################################
# Skill Gap Analyzer (FastAPI stub)
###############################################

cat > backend/services/skill-gap/requirements.txt << 'EOF'
fastapi==0.115.0
uvicorn==0.30.6
pydantic==2.9.2
psycopg2-binary==2.9.9
python-dotenv==1.0.1
EOF

cat > backend/services/skill-gap/app/__init__.py << 'EOF'
EOF

cat > backend/services/skill-gap/app/main.py << 'PYEOF'
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

app = FastAPI(title="Skill Gap Analyzer", version="1.0.0")

app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "skill-gap"}


@app.post("/analyze")
async def analyze_gaps(user_id: str, job_id: str):
    """Analyze skill gaps between a user's resume and a job."""
    # TODO: Implement in Phase 3
    return {
        "user_id": user_id,
        "job_id": job_id,
        "gaps": [],
        "message": "Skill gap analyzer stub - full implementation in Phase 3",
    }


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8004)
PYEOF

###############################################
# Chatbot Service (FastAPI stub)
###############################################

cat > backend/services/chatbot/requirements.txt << 'EOF'
fastapi==0.115.0
uvicorn==0.30.6
pydantic==2.9.2
python-dotenv==1.0.1
openai==1.51.0
EOF

cat > backend/services/chatbot/app/__init__.py << 'EOF'
EOF

cat > backend/services/chatbot/app/main.py << 'PYEOF'
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

app = FastAPI(title="Chatbot Service", version="1.0.0")

app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "chatbot"}


@app.post("/chat")
async def chat(message: str, conversation_id: str = None):
    """Send a message to the AI career assistant."""
    # TODO: Implement in Phase 4
    return {
        "response": "AI Career Assistant placeholder - full implementation in Phase 4",
        "conversation_id": conversation_id,
    }


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8005)
PYEOF

###############################################
# Course Recommender (FastAPI stub)
###############################################

cat > backend/services/course-recommender/requirements.txt << 'EOF'
fastapi==0.115.0
uvicorn==0.30.6
pydantic==2.9.2
python-dotenv==1.0.1
httpx==0.27.2
EOF

cat > backend/services/course-recommender/app/__init__.py << 'EOF'
EOF

cat > backend/services/course-recommender/app/main.py << 'PYEOF'
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

app = FastAPI(title="Course Recommender", version="1.0.0")

app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "course-recommender"}


@app.post("/recommend")
async def recommend_courses(skill: str):
    """Recommend courses for a given skill gap."""
    # TODO: Implement in Phase 4
    return {
        "skill": skill,
        "courses": [],
        "message": "Course recommender stub - full implementation in Phase 4",
    }


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8006)
PYEOF

###############################################
# README
###############################################

cat > README.md << 'EOF'
# AI Career Companion

Intelligent Resume Screening, Skill Development, and Job Matching Platform

## Quick Start

### Prerequisites
- Node.js v18+
- Python 3.10+
- Docker Desktop

### 1. Start databases
```bash
docker compose up -d
```

### 2. Start API Gateway
```bash
cd backend/api-gateway
npm install
npm run dev
```

### 3. Start a microservice (example: resume parser)
```bash
cd backend/services/resume-parser
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python -m app.main
```

### 4. Test the API
```bash
# Health check
curl http://localhost:3001/api/health

# Register a user
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","name":"Test User","password":"password123"}'
```

## Architecture
- **API Gateway**: Node.js/Express (port 3001)
- **Resume Parser**: FastAPI (port 8001)
- **ATS Scorer**: FastAPI (port 8002)
- **Job Matcher**: FastAPI (port 8003)
- **Skill Gap Analyzer**: FastAPI (port 8004)
- **Chatbot**: FastAPI (port 8005)
- **Course Recommender**: FastAPI (port 8006)
- **PostgreSQL + pgvector**: port 5432
- **Redis**: port 6379
EOF

echo ""
echo "============================================"
echo "✅ Phase 1 setup complete!"
echo "============================================"
echo ""
echo "Next steps:"
echo "  1. docker compose up -d"
echo "  2. cd backend/api-gateway && npm install && npm run dev"
echo "  3. Open a new terminal and test: curl http://localhost:3001/api/health"
echo ""
