# AI Career Companion

An AI-powered career preparation platform that analyzes your resume, matches you to live job listings, identifies skill gaps for your target role, recommends courses, and lets you practice mock interviews — all in one place.

**Built with:** Next.js · Node.js/Express · FastAPI (Python) · PostgreSQL · Redis · Anthropic Claude API · Docker

---

## Features

- **Resume Upload & Parsing** — Upload PDF, DOCX, or TXT; AI extracts skills, experience, and education
- **ATS Scorer** — Scores your resume across 5 categories (Impact, Skills, Format, Style, Completeness) like ResumeWorded
- **Job Matching** — Live job listings matched to your resume skills with a percentage match score
- **Skill Gap Analysis** — Select a target role and see exactly which skills you're missing, prioritized by importance
- **Course Recommendations** — Inline course suggestions to fill your skill gaps
- **AI Chat Assistant** — Three modes: Career Coach, Resume Coach, Interview Prep — all personalized to your resume
- **Mock Interview** — 10-question AI interview (4 behavioral + 6 technical) with a built-in code editor and per-question ratings
- **Canvas LMS Integration** — Connect your SJSU Canvas account to see your enrolled courses alongside recommendations
- **Mobile Responsive** — Full mobile layout with bottom navigation bar

---

## Architecture Overview

```
Browser (Next.js :3000)
        │
        ▼
Node.js API Gateway (:3001)
        │
        ├── resume-parser     (:8001) — FastAPI/Python
        ├── ats-scorer        (:8002) — FastAPI/Python
        ├── job-matcher       (:8003) — FastAPI/Python
        ├── skill-gap         (:8004) — FastAPI/Python
        ├── chatbot           (:8005) — FastAPI/Python → Anthropic Claude API
        └── course-recommender(:8006) — FastAPI/Python
              │
        ┌─────┴──────┐
   PostgreSQL      Redis
    (:5432)       (:6379)
    [Docker]      [Docker]
```

---

## Prerequisites

Make sure the following are installed on your machine before starting:

| Tool | Version | Download |
|------|---------|----------|
| **Node.js** | 18 or higher | https://nodejs.org |
| **Python** | 3.10 or higher | https://python.org |
| **Docker Desktop** | Latest | https://www.docker.com/products/docker-desktop |
| **Git** | Any | https://git-scm.com |

Verify installations:
```bash
node --version    # v18+
python3 --version # 3.10+
docker --version  # 20+
```

---

## API Keys Required

You need one mandatory API key:

| Key | Where to Get It | Required? |
|-----|----------------|-----------|
| **ANTHROPIC_API_KEY** | https://console.anthropic.com → API Keys (add $5 credit) | **Yes** — powers AI chat and mock interview |
| OPENAI_API_KEY | https://platform.openai.com/api-keys | No — optional fallback |
| RAPIDAPI_KEY | https://rapidapi.com | No — for live job scraping (app works without it) |

---

## Setup Instructions

### Step 1 — Clone the Repository

```bash
git clone https://github.com/ShriyaReddyAleti/ai-career-companion.git
cd ai-career-companion
```

---

### Step 2 — Configure Environment Variables

Copy the example env file and fill in your values:

```bash
cp .env.example .env
```

Open `.env` in any text editor and set:

```
POSTGRES_PASSWORD=any_password_you_choose     # e.g. mypassword123
REDIS_PASSWORD=any_redis_password              # e.g. redispass123
JWT_SECRET=any_long_random_string              # e.g. mysupersecretkey12345678
ANTHROPIC_API_KEY=sk-ant-api03-...            # Your Anthropic key
```

> **Important:** The password you set for `POSTGRES_PASSWORD` here must match what the API gateway uses. The docker-compose.yml reads from this same `.env` file automatically.

Also create the frontend env file:

```bash
echo "NEXT_PUBLIC_API_URL=/api" > frontend/.env.local
```

---

### Step 3 — Start the Database and Redis (Docker)

Make sure Docker Desktop is running, then:

```bash
docker-compose up -d
```

This starts:
- PostgreSQL on port 5432 (auto-creates the database and schema)
- Redis on port 6379

Verify they are running:
```bash
docker ps
# You should see: career_postgres and career_redis
```

Wait about 10 seconds for PostgreSQL to initialize on the first run.

---

### Step 4 — Seed the Database with Job Listings

```bash
cd database
node seeds/seed_jobs.js
cd ..
```

This populates the `job_listings` table with sample job postings so the matching feature has data to work with.

---

### Step 5 — Install and Start the API Gateway

```bash
cd backend/api-gateway
npm install
node src/index.js
```

Leave this terminal running. The gateway starts on **port 3001**.

Open a new terminal for each of the following steps.

---

### Step 6 — Start the Python Microservices

Each service needs its own terminal window. Run all 6:

**Terminal A — Resume Parser (port 8001)**
```bash
cd backend/services/resume-parser
python3 -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --port 8001
```

**Terminal B — ATS Scorer (port 8002)**
```bash
cd backend/services/ats-scorer
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --port 8002
```

**Terminal C — Job Matcher (port 8003)**
```bash
cd backend/services/job-matcher
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --port 8003
```

**Terminal D — Skill Gap Analyzer (port 8004)**
```bash
cd backend/services/skill-gap
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --port 8004
```

**Terminal E — Chatbot / AI Service (port 8005)**
```bash
cd backend/services/chatbot
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --port 8005
```

> **Note:** This service requires `ANTHROPIC_API_KEY` to be set in `.env`. It reads the `.env` file automatically via `python-dotenv`.

**Terminal F — Course Recommender (port 8006)**
```bash
cd backend/services/course-recommender
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --port 8006
```

---

### Step 7 — Start the Frontend

Open one more terminal:

```bash
cd frontend
npm install
npm run dev
```

The frontend starts on **port 3000**.

---

### Step 8 — Open the App

Navigate to: **http://localhost:3000**

1. Click **Sign Up** to create an account
2. Upload your resume (PDF, DOCX, or TXT)
3. Click **Score My Resume** to get your ATS score
4. Go to **Jobs** to see live matches
5. Go to **Skills** to pick a target role and see your skill gaps
6. Go to **AI Chat** to talk with the career coach
7. Click **Mock Interview** to start a 10-question AI interview

---

## Project Structure

```
ai-career-companion/
├── frontend/                        # Next.js 14 app (React, Tailwind CSS)
│   ├── src/
│   │   ├── app/
│   │   │   ├── dashboard/page.js    # Main dashboard
│   │   │   ├── resume/page.js       # Resume upload + ATS scoring
│   │   │   ├── jobs/page.js         # Job matches
│   │   │   ├── skills/page.js       # Skill gap analysis
│   │   │   ├── chat/page.js         # AI chat assistant
│   │   │   ├── interview/page.js    # Mock interview with code editor
│   │   │   ├── login/page.js
│   │   │   └── register/page.js
│   │   ├── components/
│   │   │   ├── Sidebar.js           # Nav sidebar (desktop + mobile)
│   │   │   └── ProtectedLayout.js   # Auth guard wrapper
│   │   └── lib/
│   │       ├── api.js               # All API call functions
│   │       └── auth.js              # Auth context (JWT management)
│   ├── next.config.mjs              # API proxy rewrite rules
│   └── package.json
│
├── backend/
│   ├── api-gateway/                 # Node.js/Express REST API (port 3001)
│   │   └── src/
│   │       ├── index.js             # Server entry point
│   │       ├── routes/
│   │       │   ├── auth.js          # /api/auth/register, /login
│   │       │   ├── resume.js        # /api/resume/upload, /score
│   │       │   ├── jobs.js          # /api/jobs/matches, /skill-gap-role
│   │       │   ├── chat.js          # /api/chat/conversations
│   │       │   └── dashboard.js     # /api/dashboard/summary
│   │       ├── middleware/
│   │       │   └── auth.js          # JWT verification middleware
│   │       └── config/
│   │           └── db.js            # PostgreSQL connection pool
│   │
│   └── services/                    # Python FastAPI microservices
│       ├── resume-parser/           # Extracts skills/experience from resumes
│       ├── ats-scorer/              # Scores resumes across 5 ATS categories
│       ├── job-matcher/             # Matches resume to job listings
│       ├── skill-gap/               # Skill gap analysis by role
│       ├── chatbot/                 # Claude AI chat + interview + code eval
│       └── course-recommender/      # Returns curated course recommendations
│
├── database/
│   ├── migrations/
│   │   └── 001_initial_schema.sql   # Full database schema
│   └── seeds/
│       └── seed_jobs.js             # Populates job_listings table
│
├── docker-compose.yml               # PostgreSQL + Redis containers
├── .env.example                     # Environment variable template
└── README.md
```

---

## Tech Stack Summary

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14, React 18, Tailwind CSS, Monaco Editor |
| API Gateway | Node.js, Express, JWT, bcrypt, multer, PostgreSQL (pg) |
| AI Services | FastAPI (Python), Anthropic Claude API (`claude-haiku-4-5-20251001`) |
| Database | PostgreSQL 16 with pgvector extension |
| Cache | Redis 7 |
| Infrastructure | Docker, Docker Compose |
| Auth | JSON Web Tokens (JWT) with bcrypt password hashing |

---

## Troubleshooting

**"Cannot connect to database"**
- Make sure Docker Desktop is running
- Run `docker ps` — you should see `career_postgres`
- Wait 10–15 seconds after `docker-compose up -d` for first-time initialization

**"Parser service unavailable" after uploading resume**
- Make sure Terminal A (resume-parser on port 8001) is running
- Check the terminal for Python errors
- If pip install failed, try: `pip install --upgrade pip` then re-run

**"AI service not responding" in chat**
- Make sure Terminal E (chatbot on port 8005) is running
- Verify `ANTHROPIC_API_KEY` is correctly set in your `.env` file
- Make sure that your Anthropic account has credit balance at https://console.anthropic.com

**Frontend shows blank screen**
- Delete the Next.js cache: `rm -rf frontend/.next`
- Restart: `cd frontend && npm run dev`

**Port already in use**
- Find and kill the process: `lsof -ti:PORT | xargs kill -9`
- Replace PORT with the conflicting port number (3000, 3001, 8001–8006)

---

## Environment Variables Reference

| Variable | Description |
|----------|-------------|
| `POSTGRES_USER` | PostgreSQL username |
| `POSTGRES_PASSWORD` | PostgreSQL password |
| `POSTGRES_DB` | Database name |
| `POSTGRES_HOST` | Database host (localhost) |
| `POSTGRES_PORT` | Database port (5432) |
| `REDIS_HOST` | Redis host (localhost) |
| `REDIS_PORT` | Redis port (6379) |
| `REDIS_PASSWORD` | Redis password |
| `JWT_SECRET` | Secret key for signing JWT tokens |
| `API_GATEWAY_PORT` | Port for Node.js gateway (3001) |
| `ANTHROPIC_API_KEY` | Anthropic Claude API key (**required**) |
| `OPENAI_API_KEY` | OpenAI API key (optional fallback) |
| `RAPIDAPI_KEY` | RapidAPI key for live job data (optional) |
| `NEXT_PUBLIC_API_URL` | API base URL seen by the browser (`/api`) |

---

## Team

**G36 · Spring 2026**

Built by: 
- Shriya Reddy Aleti
- Ajay Kumar Golla
- Paavani Karuturi 
- Sravani Linga

---

*AI Career Companion uses the Anthropic Claude API (claude-haiku-4-5-20251001) for all AI-powered features.*
