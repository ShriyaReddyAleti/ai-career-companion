#!/bin/bash
# Start all services for AI Career Companion
# Run from the project root: ./scripts/start-all.sh

echo "🚀 Starting AI Career Companion services..."

# Check Docker containers
echo "📦 Checking Docker containers..."
docker compose up -d

echo ""
echo "⏳ Waiting for databases to be ready..."
sleep 5

# Seed the database with sample jobs
echo "🌱 Seeding sample job listings..."
PGPASSWORD=${POSTGRES_PASSWORD:-career_secure_2026} psql \
  -h localhost \
  -U ${POSTGRES_USER:-career_admin} \
  -d ${POSTGRES_DB:-career_companion} \
  -f database/seeds/seed_jobs.sql 2>/dev/null || echo "  (Jobs may already be seeded)"

echo ""
echo "============================================"
echo "Now start services in separate terminal tabs:"
echo "============================================"
echo ""
echo "Tab 1 - API Gateway:"
echo "  cd backend/api-gateway && npm run dev"
echo ""
echo "Tab 2 - Resume Parser:"
echo "  cd backend/services/resume-parser"
echo "  python3 -m venv venv && source venv/bin/activate"
echo "  pip install -r requirements.txt"
echo "  python -m app.main"
echo ""
echo "Tab 3 - ATS Scorer:"
echo "  cd backend/services/ats-scorer"
echo "  python3 -m venv venv && source venv/bin/activate"
echo "  pip install -r requirements.txt"
echo "  python -m app.main"
echo ""
echo "Tab 4 - Job Matcher:"
echo "  cd backend/services/job-matcher"
echo "  python3 -m venv venv && source venv/bin/activate"
echo "  pip install -r requirements.txt"
echo "  python -m app.main"
echo ""
echo "Tab 5 - Skill Gap Analyzer:"
echo "  cd backend/services/skill-gap"
echo "  python3 -m venv venv && source venv/bin/activate"
echo "  pip install -r requirements.txt"
echo "  python -m app.main"
echo ""
