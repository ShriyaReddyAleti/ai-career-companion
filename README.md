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
