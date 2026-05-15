#!/bin/bash
# AI Career Companion - Phase 2 Setup Script
# Run this from inside your ai-career-companion folder
# Make sure Phase 1 is complete (docker running, api-gateway working)

echo "🚀 Setting up Phase 2: ML Microservices..."

###############################################
# Resume Parser - Full Implementation
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
numpy==1.26.4
httpx==0.27.2
EOF

cat > backend/services/resume-parser/app/__init__.py << 'EOF'
EOF

cat > backend/services/resume-parser/app/main.py << 'PYEOF'
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from app.services.parser import ResumeParser
from app.services.embeddings import EmbeddingService
from app.models.schemas import ParsedResume, ParseRequest
import uvicorn

app = FastAPI(title="Resume Parser Service", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

parser = ResumeParser()
embedding_service = EmbeddingService()


@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "resume-parser", "version": "2.0.0"}


@app.post("/parse", response_model=ParsedResume)
async def parse_resume(file: UploadFile = File(...)):
    """Parse a resume file and extract structured data."""
    if file.content_type not in [
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "text/plain",
    ]:
        raise HTTPException(status_code=400, detail="Only PDF, DOCX, and TXT files supported")

    content = await file.read()

    try:
        # Extract text based on file type
        if file.content_type == "application/pdf":
            text = parser.extract_text_from_pdf(content)
        elif file.content_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
            text = parser.extract_text_from_docx(content)
        else:
            text = content.decode("utf-8")

        if not text.strip():
            raise HTTPException(status_code=400, detail="Could not extract text from file")

        # Parse resume sections
        parsed = parser.parse(text)

        # Generate embedding
        embedding = embedding_service.generate_embedding(text)
        parsed["embedding"] = embedding

        return parsed

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse resume: {str(e)}")


@app.post("/parse-text", response_model=ParsedResume)
async def parse_resume_text(request: ParseRequest):
    """Parse resume from raw text."""
    if not request.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")

    parsed = parser.parse(request.text)
    embedding = embedding_service.generate_embedding(request.text)
    parsed["embedding"] = embedding

    return parsed


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8001)
PYEOF

cat > backend/services/resume-parser/app/models/__init__.py << 'EOF'
EOF

cat > backend/services/resume-parser/app/models/schemas.py << 'PYEOF'
from pydantic import BaseModel
from typing import Optional


class ParseRequest(BaseModel):
    text: str


class SkillItem(BaseModel):
    name: str
    category: str = "general"


class ExperienceItem(BaseModel):
    title: str = ""
    company: str = ""
    duration: str = ""
    description: str = ""


class EducationItem(BaseModel):
    degree: str = ""
    institution: str = ""
    year: str = ""
    field: str = ""


class ParsedResume(BaseModel):
    name: str = ""
    email: str = ""
    phone: str = ""
    summary: str = ""
    skills: list[SkillItem] = []
    experience: list[ExperienceItem] = []
    education: list[EducationItem] = []
    raw_text: str = ""
    embedding: list[float] = []
PYEOF

cat > backend/services/resume-parser/app/services/__init__.py << 'EOF'
EOF

cat > backend/services/resume-parser/app/services/parser.py << 'PYEOF'
import re
import io
from PyPDF2 import PdfReader
from docx import Document


class ResumeParser:
    """Extracts structured data from resume text."""

    # Common section headers
    SECTION_PATTERNS = {
        "summary": r"(?i)(summary|objective|profile|about\s*me)",
        "experience": r"(?i)(experience|work\s*history|employment|professional\s*experience)",
        "education": r"(?i)(education|academic|qualification|degree)",
        "skills": r"(?i)(skills|technical\s*skills|competencies|technologies|proficiencies)",
        "certifications": r"(?i)(certification|certificate|license)",
        "projects": r"(?i)(projects|personal\s*projects|academic\s*projects)",
    }

    # Common tech skills for matching
    TECH_SKILLS = {
        "languages": [
            "python", "java", "javascript", "typescript", "c++", "c#", "ruby", "go",
            "golang", "rust", "swift", "kotlin", "php", "scala", "r", "matlab",
            "perl", "bash", "shell", "sql", "html", "css",
        ],
        "frameworks": [
            "react", "angular", "vue", "next.js", "nextjs", "node.js", "nodejs",
            "express", "django", "flask", "fastapi", "spring", "spring boot",
            ".net", "rails", "laravel", "svelte", "nuxt",
        ],
        "databases": [
            "postgresql", "postgres", "mysql", "mongodb", "redis", "elasticsearch",
            "dynamodb", "cassandra", "sqlite", "oracle", "sql server", "neo4j",
            "firebase", "supabase",
        ],
        "cloud": [
            "aws", "azure", "gcp", "google cloud", "heroku", "vercel", "netlify",
            "digitalocean", "cloudflare",
        ],
        "devops": [
            "docker", "kubernetes", "k8s", "jenkins", "github actions", "gitlab ci",
            "terraform", "ansible", "ci/cd", "nginx", "linux",
        ],
        "ml_ai": [
            "machine learning", "deep learning", "tensorflow", "pytorch", "scikit-learn",
            "nlp", "natural language processing", "computer vision", "opencv",
            "transformers", "bert", "gpt", "llm", "pandas", "numpy", "keras",
        ],
        "tools": [
            "git", "github", "gitlab", "jira", "confluence", "figma", "postman",
            "swagger", "graphql", "rest api", "restful", "agile", "scrum",
        ],
    }

    # Email pattern
    EMAIL_PATTERN = r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}"

    # Phone pattern
    PHONE_PATTERN = r"(?:\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}"

    def extract_text_from_pdf(self, content: bytes) -> str:
        """Extract text from PDF bytes."""
        reader = PdfReader(io.BytesIO(content))
        text = ""
        for page in reader.pages:
            page_text = page.extract_text()
            if page_text:
                text += page_text + "\n"
        return text

    def extract_text_from_docx(self, content: bytes) -> str:
        """Extract text from DOCX bytes."""
        doc = Document(io.BytesIO(content))
        text = ""
        for para in doc.paragraphs:
            text += para.text + "\n"
        return text

    def parse(self, text: str) -> dict:
        """Parse resume text and return structured data."""
        result = {
            "name": self._extract_name(text),
            "email": self._extract_email(text),
            "phone": self._extract_phone(text),
            "summary": self._extract_section(text, "summary"),
            "skills": self._extract_skills(text),
            "experience": self._extract_experience(text),
            "education": self._extract_education(text),
            "raw_text": text[:5000],  # Limit raw text size
        }
        return result

    def _extract_name(self, text: str) -> str:
        """Extract name from the first few lines."""
        lines = text.strip().split("\n")
        for line in lines[:5]:
            line = line.strip()
            # Skip empty lines and lines that look like contact info
            if not line:
                continue
            if re.search(self.EMAIL_PATTERN, line):
                continue
            if re.search(self.PHONE_PATTERN, line):
                continue
            if re.search(r"(?i)(resume|curriculum|vitae|cv)", line):
                continue
            # Likely a name if it's short and mostly alpha
            if len(line) < 50 and re.match(r"^[A-Za-z\s\.\-']+$", line):
                return line.strip()
        return ""

    def _extract_email(self, text: str) -> str:
        """Extract email address."""
        match = re.search(self.EMAIL_PATTERN, text)
        return match.group(0) if match else ""

    def _extract_phone(self, text: str) -> str:
        """Extract phone number."""
        match = re.search(self.PHONE_PATTERN, text)
        return match.group(0) if match else ""

    def _extract_section(self, text: str, section_name: str) -> str:
        """Extract text under a specific section header."""
        pattern = self.SECTION_PATTERNS.get(section_name)
        if not pattern:
            return ""

        lines = text.split("\n")
        capturing = False
        section_text = []

        for line in lines:
            if re.search(pattern, line) and len(line.strip()) < 60:
                capturing = True
                continue

            if capturing:
                # Stop at next section header
                is_next_section = False
                for key, pat in self.SECTION_PATTERNS.items():
                    if key != section_name and re.search(pat, line) and len(line.strip()) < 60:
                        is_next_section = True
                        break
                if is_next_section:
                    break
                section_text.append(line)

        return "\n".join(section_text).strip()[:2000]

    def _extract_skills(self, text: str) -> list[dict]:
        """Extract skills from resume text."""
        text_lower = text.lower()
        found_skills = []
        seen = set()

        for category, skills in self.TECH_SKILLS.items():
            for skill in skills:
                # Check for skill as whole word
                pattern = r"\b" + re.escape(skill) + r"\b"
                if re.search(pattern, text_lower) and skill not in seen:
                    found_skills.append({"name": skill, "category": category})
                    seen.add(skill)

        return found_skills

    def _extract_experience(self, text: str) -> list[dict]:
        """Extract work experience entries."""
        section_text = self._extract_section(text, "experience")
        if not section_text:
            return []

        experiences = []
        lines = section_text.split("\n")
        current_exp = None

        for line in lines:
            line = line.strip()
            if not line:
                if current_exp and current_exp.get("title"):
                    experiences.append(current_exp)
                    current_exp = None
                continue

            # Detect date ranges like "Jan 2020 - Present" or "2019 - 2021"
            date_match = re.search(
                r"((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}|20\d{2}|19\d{2})\s*[-–—to]+\s*((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}|20\d{2}|19\d{2}|[Pp]resent|[Cc]urrent)",
                line,
            )

            if date_match or (current_exp is None and len(line) < 80):
                if current_exp and current_exp.get("title"):
                    experiences.append(current_exp)
                current_exp = {
                    "title": line if not date_match else line[: date_match.start()].strip().rstrip("|-–—,"),
                    "company": "",
                    "duration": date_match.group(0) if date_match else "",
                    "description": "",
                }
            elif current_exp is not None:
                if not current_exp["company"] and len(line) < 80:
                    current_exp["company"] = line
                else:
                    current_exp["description"] += line + " "

        if current_exp and current_exp.get("title"):
            experiences.append(current_exp)

        # Clean up descriptions
        for exp in experiences:
            exp["description"] = exp["description"].strip()[:1000]

        return experiences[:10]

    def _extract_education(self, text: str) -> list[dict]:
        """Extract education entries."""
        section_text = self._extract_section(text, "education")
        if not section_text:
            return []

        education = []
        lines = section_text.split("\n")
        current_edu = None

        degree_patterns = [
            r"(?i)(bachelor|master|ph\.?d|doctor|associate|b\.?s\.?|m\.?s\.?|b\.?a\.?|m\.?a\.?|b\.?e\.?|m\.?e\.?|mba|b\.?tech|m\.?tech)",
        ]

        for line in lines:
            line = line.strip()
            if not line:
                if current_edu and (current_edu.get("degree") or current_edu.get("institution")):
                    education.append(current_edu)
                    current_edu = None
                continue

            has_degree = any(re.search(p, line) for p in degree_patterns)
            year_match = re.search(r"(20\d{2}|19\d{2})", line)

            if has_degree or (current_edu is None and len(line) < 100):
                if current_edu and (current_edu.get("degree") or current_edu.get("institution")):
                    education.append(current_edu)
                current_edu = {
                    "degree": line if has_degree else "",
                    "institution": "" if has_degree else line,
                    "year": year_match.group(0) if year_match else "",
                    "field": "",
                }
            elif current_edu is not None:
                if not current_edu["institution"]:
                    current_edu["institution"] = line
                elif not current_edu["field"]:
                    current_edu["field"] = line
                if year_match and not current_edu["year"]:
                    current_edu["year"] = year_match.group(0)

        if current_edu and (current_edu.get("degree") or current_edu.get("institution")):
            education.append(current_edu)

        return education[:5]
PYEOF

cat > backend/services/resume-parser/app/services/embeddings.py << 'PYEOF'
import hashlib
import struct


class EmbeddingService:
    """
    Generates simple text embeddings using TF-IDF-like approach.
    This is a lightweight fallback - in production, use Sentence-BERT.
    Produces 768-dimensional vectors for pgvector compatibility.
    """

    EMBEDDING_DIM = 768

    def generate_embedding(self, text: str) -> list[float]:
        """Generate a 768-dim embedding vector from text."""
        # Tokenize and normalize
        words = text.lower().split()
        if not words:
            return [0.0] * self.EMBEDDING_DIM

        # Build word frequency map
        word_freq = {}
        for word in words:
            # Clean word
            clean = "".join(c for c in word if c.isalnum())
            if clean and len(clean) > 1:
                word_freq[clean] = word_freq.get(clean, 0) + 1

        # Generate deterministic embedding based on word hashes
        embedding = [0.0] * self.EMBEDDING_DIM
        total_words = len(words)

        for word, freq in word_freq.items():
            # Hash word to get deterministic position mapping
            word_hash = hashlib.sha256(word.encode()).digest()
            tf = freq / total_words

            # Map word to multiple dimensions using hash
            for i in range(0, min(len(word_hash), 32), 4):
                dim_idx = struct.unpack("I", word_hash[i : i + 4])[0] % self.EMBEDDING_DIM
                value = struct.unpack("f", word_hash[i : i + 4])[0]
                # Normalize to reasonable range
                norm_value = (value % 2.0 - 1.0) * tf
                embedding[dim_idx] += norm_value

        # L2 normalize the vector
        magnitude = sum(v * v for v in embedding) ** 0.5
        if magnitude > 0:
            embedding = [v / magnitude for v in embedding]

        return embedding
PYEOF

cat > backend/services/resume-parser/app/routers/__init__.py << 'EOF'
EOF

cat > backend/services/resume-parser/app/utils/__init__.py << 'EOF'
EOF

echo "✅ Resume Parser service created"

###############################################
# ATS Scorer - Full Implementation
###############################################

cat > backend/services/ats-scorer/requirements.txt << 'EOF'
fastapi==0.115.0
uvicorn==0.30.6
pydantic==2.9.2
psycopg2-binary==2.9.9
python-dotenv==1.0.1
numpy==1.26.4
httpx==0.27.2
EOF

cat > backend/services/ats-scorer/app/__init__.py << 'EOF'
EOF

cat > backend/services/ats-scorer/app/models/__init__.py << 'EOF'
EOF

cat > backend/services/ats-scorer/app/models/schemas.py << 'PYEOF'
from pydantic import BaseModel


class ScoreRequest(BaseModel):
    resume_text: str
    job_description: str
    job_title: str = ""


class ScoreBreakdown(BaseModel):
    keyword_score: float = 0.0
    semantic_score: float = 0.0
    format_score: float = 0.0
    composite: float = 0.0
    matched_keywords: list[str] = []
    missing_keywords: list[str] = []
    format_issues: list[str] = []
    suggestions: list[str] = []
PYEOF

cat > backend/services/ats-scorer/app/services/__init__.py << 'EOF'
EOF

cat > backend/services/ats-scorer/app/services/scorer.py << 'PYEOF'
import re
from collections import Counter


class ATSScorer:
    """Multi-dimensional ATS scoring engine."""

    # Common ATS-unfriendly elements
    FORMAT_CHECKS = {
        "has_email": (r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}", True, "Missing email address"),
        "has_phone": (r"(?:\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}", True, "Missing phone number"),
        "has_education": (r"(?i)(education|bachelor|master|ph\.?d|degree|university|college)", True, "Missing education section"),
        "has_experience": (r"(?i)(experience|work\s*history|employment)", True, "Missing experience section"),
        "has_skills": (r"(?i)(skills|technical\s*skills|competencies)", True, "Missing skills section"),
        "no_tables_detected": (r"(?:\|.*\|.*\|)", False, "Table formatting detected - may not parse correctly in ATS"),
        "reasonable_length": (None, None, "Resume too short - add more detail"),
    }

    # Stop words to ignore in keyword matching
    STOP_WORDS = {
        "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
        "have", "has", "had", "do", "does", "did", "will", "would", "could",
        "should", "may", "might", "can", "shall", "and", "or", "but", "if",
        "then", "else", "when", "at", "by", "for", "with", "about", "against",
        "between", "through", "during", "before", "after", "above", "below",
        "to", "from", "up", "down", "in", "out", "on", "off", "over", "under",
        "again", "further", "once", "here", "there", "all", "each", "every",
        "both", "few", "more", "most", "other", "some", "such", "no", "nor",
        "not", "only", "own", "same", "so", "than", "too", "very", "just",
        "because", "as", "until", "while", "of", "this", "that", "these",
        "those", "am", "it", "its", "we", "our", "you", "your", "they",
        "their", "he", "she", "him", "her", "his", "my", "me", "i",
    }

    def score(self, resume_text: str, job_description: str, job_title: str = "") -> dict:
        """Calculate multi-dimensional ATS score."""
        keyword_result = self._keyword_score(resume_text, job_description)
        semantic_result = self._semantic_score(resume_text, job_description)
        format_result = self._format_score(resume_text)

        # Weighted composite: keyword 40%, semantic 35%, format 25%
        composite = (
            keyword_result["score"] * 0.40
            + semantic_result["score"] * 0.35
            + format_result["score"] * 0.25
        )

        suggestions = self._generate_suggestions(
            keyword_result, semantic_result, format_result, job_title
        )

        return {
            "keyword_score": round(keyword_result["score"], 1),
            "semantic_score": round(semantic_result["score"], 1),
            "format_score": round(format_result["score"], 1),
            "composite": round(composite, 1),
            "matched_keywords": keyword_result["matched"],
            "missing_keywords": keyword_result["missing"],
            "format_issues": format_result["issues"],
            "suggestions": suggestions,
        }

    def _keyword_score(self, resume: str, job_desc: str) -> dict:
        """Score based on keyword overlap."""
        # Extract meaningful words from job description
        job_words = self._extract_keywords(job_desc)
        resume_words = self._extract_keywords(resume)

        resume_word_set = set(resume_words.keys())

        matched = []
        missing = []

        for word, count in job_words.most_common(50):
            if word in resume_word_set:
                matched.append(word)
            else:
                missing.append(word)

        if not job_words:
            return {"score": 50.0, "matched": [], "missing": []}

        match_ratio = len(matched) / min(len(job_words), 50) if job_words else 0
        score = min(match_ratio * 100, 100)

        return {
            "score": score,
            "matched": matched[:20],
            "missing": missing[:15],
        }

    def _semantic_score(self, resume: str, job_desc: str) -> dict:
        """Score based on semantic similarity using word overlap with context."""
        # Extract bigrams and trigrams for better semantic matching
        resume_ngrams = self._extract_ngrams(resume.lower(), 2) | self._extract_ngrams(resume.lower(), 3)
        job_ngrams = self._extract_ngrams(job_desc.lower(), 2) | self._extract_ngrams(job_desc.lower(), 3)

        # Also use single word overlap
        resume_words = set(self._extract_keywords(resume).keys())
        job_words = set(self._extract_keywords(job_desc).keys())

        # Word level overlap
        if job_words:
            word_overlap = len(resume_words & job_words) / len(job_words)
        else:
            word_overlap = 0

        # N-gram overlap
        if job_ngrams:
            ngram_overlap = len(resume_ngrams & job_ngrams) / len(job_ngrams)
        else:
            ngram_overlap = 0

        # Weighted combination
        score = (word_overlap * 0.5 + ngram_overlap * 0.5) * 100
        score = min(score, 100)

        return {"score": score}

    def _format_score(self, resume: str) -> dict:
        """Score based on resume formatting and structure."""
        issues = []
        checks_passed = 0
        total_checks = 0

        for check_name, (pattern, should_match, issue_msg) in self.FORMAT_CHECKS.items():
            if check_name == "reasonable_length":
                total_checks += 1
                if len(resume.split()) >= 100:
                    checks_passed += 1
                else:
                    issues.append(issue_msg)
                continue

            total_checks += 1
            if pattern:
                found = bool(re.search(pattern, resume))
                if found == should_match:
                    checks_passed += 1
                else:
                    issues.append(issue_msg)

        score = (checks_passed / total_checks * 100) if total_checks > 0 else 50
        return {"score": score, "issues": issues}

    def _extract_keywords(self, text: str) -> Counter:
        """Extract meaningful keywords from text."""
        words = re.findall(r"\b[a-zA-Z][a-zA-Z+#.]{1,30}\b", text.lower())
        filtered = [w for w in words if w not in self.STOP_WORDS and len(w) > 2]
        return Counter(filtered)

    def _extract_ngrams(self, text: str, n: int) -> set:
        """Extract n-grams from text."""
        words = re.findall(r"\b[a-zA-Z][a-zA-Z+#.]{1,30}\b", text)
        words = [w for w in words if w not in self.STOP_WORDS and len(w) > 2]
        ngrams = set()
        for i in range(len(words) - n + 1):
            ngrams.add(" ".join(words[i : i + n]))
        return ngrams

    def _generate_suggestions(self, keyword_result, semantic_result, format_result, job_title) -> list:
        """Generate actionable suggestions."""
        suggestions = []

        if keyword_result["score"] < 60:
            missing = keyword_result["missing"][:5]
            if missing:
                suggestions.append(
                    f"Add these missing keywords to your resume: {', '.join(missing)}"
                )

        if semantic_result["score"] < 50:
            suggestions.append(
                "Your resume doesn't closely match the job description. "
                "Try using similar language and terminology as the job posting."
            )

        if format_result["issues"]:
            for issue in format_result["issues"][:3]:
                suggestions.append(f"Format: {issue}")

        if keyword_result["score"] >= 70 and semantic_result["score"] >= 60:
            suggestions.append("Good match! Your resume aligns well with this position.")

        if job_title and job_title.lower() not in keyword_result.get("matched", []):
            suggestions.append(f"Consider adding '{job_title}' or related terms to your resume.")

        return suggestions[:6]
PYEOF

cat > backend/services/ats-scorer/app/main.py << 'PYEOF'
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from app.models.schemas import ScoreRequest, ScoreBreakdown
from app.services.scorer import ATSScorer
import uvicorn

app = FastAPI(title="ATS Scoring Engine", version="2.0.0")

app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

scorer = ATSScorer()


@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "ats-scorer", "version": "2.0.0"}


@app.post("/score", response_model=ScoreBreakdown)
async def score_resume(request: ScoreRequest):
    """Score a resume against a job description."""
    if not request.resume_text.strip():
        raise HTTPException(status_code=400, detail="Resume text cannot be empty")
    if not request.job_description.strip():
        raise HTTPException(status_code=400, detail="Job description cannot be empty")

    result = scorer.score(request.resume_text, request.job_description, request.job_title)
    return result


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8002)
PYEOF

echo "✅ ATS Scorer service created"

###############################################
# Job Matcher - Full Implementation
###############################################

cat > backend/services/job-matcher/requirements.txt << 'EOF'
fastapi==0.115.0
uvicorn==0.30.6
pydantic==2.9.2
psycopg2-binary==2.9.9
python-dotenv==1.0.1
numpy==1.26.4
httpx==0.27.2
EOF

cat > backend/services/job-matcher/app/__init__.py << 'EOF'
EOF

cat > backend/services/job-matcher/app/models/__init__.py << 'EOF'
EOF

cat > backend/services/job-matcher/app/models/schemas.py << 'PYEOF'
from pydantic import BaseModel


class MatchRequest(BaseModel):
    resume_skills: list[str] = []
    resume_text: str = ""
    preferred_location: str = ""
    preferred_seniority: str = ""
    limit: int = 10


class JobMatch(BaseModel):
    job_id: str = ""
    title: str = ""
    company: str = ""
    location: str = ""
    match_score: float = 0.0
    matched_skills: list[str] = []
    missing_skills: list[str] = []
    seniority_level: str = ""


class MatchResponse(BaseModel):
    matches: list[JobMatch] = []
    total_jobs_searched: int = 0
PYEOF

cat > backend/services/job-matcher/app/services/__init__.py << 'EOF'
EOF

cat > backend/services/job-matcher/app/services/matcher.py << 'PYEOF'
import re
import os
import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv("../../../.env")


class JobMatcher:
    """Matches resumes to job listings using skill overlap and rule-based filters."""

    def _get_db_connection(self):
        """Get database connection."""
        return psycopg2.connect(
            host=os.getenv("POSTGRES_HOST", "localhost"),
            port=os.getenv("POSTGRES_PORT", "5432"),
            database=os.getenv("POSTGRES_DB", "career_companion"),
            user=os.getenv("POSTGRES_USER", "career_admin"),
            password=os.getenv("POSTGRES_PASSWORD", "career_secure_2026"),
        )

    def match(
        self,
        resume_skills: list[str],
        resume_text: str = "",
        preferred_location: str = "",
        preferred_seniority: str = "",
        limit: int = 10,
    ) -> dict:
        """Find matching jobs for given resume skills."""
        try:
            conn = self._get_db_connection()
            cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

            # Fetch all job listings
            cur.execute("SELECT * FROM job_listings ORDER BY posted_at DESC LIMIT 200")
            jobs = cur.fetchall()

            cur.close()
            conn.close()

            if not jobs:
                return {"matches": [], "total_jobs_searched": 0}

            # Score each job
            resume_skill_set = set(s.lower().strip() for s in resume_skills)
            resume_words = set(re.findall(r"\b[a-z+#.]{2,}\b", resume_text.lower()))

            scored_jobs = []
            for job in jobs:
                score_info = self._score_job(
                    job, resume_skill_set, resume_words, preferred_location, preferred_seniority
                )
                scored_jobs.append(score_info)

            # Sort by match score descending
            scored_jobs.sort(key=lambda x: x["match_score"], reverse=True)

            return {
                "matches": scored_jobs[:limit],
                "total_jobs_searched": len(jobs),
            }

        except Exception as e:
            print(f"Job matching error: {e}")
            return {"matches": [], "total_jobs_searched": 0}

    def _score_job(
        self, job: dict, resume_skills: set, resume_words: set,
        preferred_location: str, preferred_seniority: str,
    ) -> dict:
        """Score a single job against resume."""
        required_skills_raw = job.get("required_skills", []) or []

        # Handle JSONB - could be list of strings or list of dicts
        required_skills = set()
        for skill in required_skills_raw:
            if isinstance(skill, str):
                required_skills.add(skill.lower().strip())
            elif isinstance(skill, dict) and "name" in skill:
                required_skills.add(skill["name"].lower().strip())

        # Skill match score (60% weight)
        if required_skills:
            matched = resume_skills & required_skills
            missing = required_skills - resume_skills
            skill_score = len(matched) / len(required_skills) * 100
        else:
            # Fall back to text matching against job description
            job_desc_words = set(re.findall(r"\b[a-z+#.]{2,}\b", (job.get("description", "") or "").lower()))
            overlap = resume_words & job_desc_words
            skill_score = min(len(overlap) / max(len(job_desc_words), 1) * 100, 100)
            matched = overlap
            missing = set()

        # Location match (20% weight)
        location_score = 50  # neutral
        if preferred_location and job.get("location"):
            job_loc = job["location"].lower()
            pref_loc = preferred_location.lower()
            if pref_loc in job_loc or job_loc in pref_loc or "remote" in job_loc:
                location_score = 100
            else:
                location_score = 20

        # Seniority match (20% weight)
        seniority_score = 50  # neutral
        if preferred_seniority and job.get("seniority_level"):
            if preferred_seniority.lower() == job["seniority_level"].lower():
                seniority_score = 100
            else:
                seniority_score = 30

        # Composite score
        composite = skill_score * 0.60 + location_score * 0.20 + seniority_score * 0.20

        return {
            "job_id": str(job.get("id", "")),
            "title": job.get("title", ""),
            "company": job.get("company", ""),
            "location": job.get("location", ""),
            "match_score": round(composite, 1),
            "matched_skills": sorted(list(matched))[:15],
            "missing_skills": sorted(list(missing))[:10],
            "seniority_level": job.get("seniority_level", ""),
        }
PYEOF

cat > backend/services/job-matcher/app/main.py << 'PYEOF'
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from app.models.schemas import MatchRequest, MatchResponse
from app.services.matcher import JobMatcher
import uvicorn

app = FastAPI(title="Job Matching Engine", version="2.0.0")

app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

matcher = JobMatcher()


@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "job-matcher", "version": "2.0.0"}


@app.post("/match", response_model=MatchResponse)
async def match_jobs(request: MatchRequest):
    """Find matching jobs for a resume."""
    if not request.resume_skills and not request.resume_text:
        raise HTTPException(status_code=400, detail="Provide resume_skills or resume_text")

    result = matcher.match(
        resume_skills=request.resume_skills,
        resume_text=request.resume_text,
        preferred_location=request.preferred_location,
        preferred_seniority=request.preferred_seniority,
        limit=request.limit,
    )
    return result


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8003)
PYEOF

echo "✅ Job Matcher service created"

###############################################
# Skill Gap Analyzer - Full Implementation
###############################################

cat > backend/services/skill-gap/requirements.txt << 'EOF'
fastapi==0.115.0
uvicorn==0.30.6
pydantic==2.9.2
psycopg2-binary==2.9.9
python-dotenv==1.0.1
httpx==0.27.2
EOF

cat > backend/services/skill-gap/app/__init__.py << 'EOF'
EOF

cat > backend/services/skill-gap/app/models/__init__.py << 'EOF'
EOF

cat > backend/services/skill-gap/app/models/schemas.py << 'PYEOF'
from pydantic import BaseModel


class GapRequest(BaseModel):
    user_skills: list[str] = []
    target_job_skills: list[str] = []
    target_job_title: str = ""
    target_job_description: str = ""


class SkillGap(BaseModel):
    skill: str
    priority: str = "medium"
    category: str = "general"
    frequency: int = 1


class GapResponse(BaseModel):
    gaps: list[SkillGap] = []
    strong_matches: list[str] = []
    match_percentage: float = 0.0
    summary: str = ""
PYEOF

cat > backend/services/skill-gap/app/services/__init__.py << 'EOF'
EOF

cat > backend/services/skill-gap/app/services/analyzer.py << 'PYEOF'
import re


class SkillGapAnalyzer:
    """Analyzes gaps between user skills and job requirements."""

    # Skill importance by category
    SKILL_CATEGORIES = {
        "languages": ["python", "java", "javascript", "typescript", "c++", "c#", "go", "rust", "ruby", "swift", "kotlin", "php", "sql", "r"],
        "frameworks": ["react", "angular", "vue", "next.js", "node.js", "express", "django", "flask", "fastapi", "spring", "spring boot", ".net"],
        "databases": ["postgresql", "mysql", "mongodb", "redis", "elasticsearch", "dynamodb", "cassandra", "sqlite"],
        "cloud": ["aws", "azure", "gcp", "google cloud", "heroku", "vercel", "docker", "kubernetes"],
        "tools": ["git", "github", "jira", "jenkins", "ci/cd", "terraform", "ansible", "linux", "agile", "scrum"],
        "ml_ai": ["machine learning", "deep learning", "tensorflow", "pytorch", "nlp", "computer vision", "pandas", "numpy"],
    }

    def analyze(
        self,
        user_skills: list[str],
        target_job_skills: list[str] = None,
        target_job_title: str = "",
        target_job_description: str = "",
    ) -> dict:
        """Analyze skill gaps between user and target job."""

        user_skill_set = set(s.lower().strip() for s in user_skills)

        # Get target skills from explicit list or extract from description
        if target_job_skills:
            target_skill_set = set(s.lower().strip() for s in target_job_skills)
        else:
            target_skill_set = self._extract_skills_from_text(target_job_description)

        # Find gaps and matches
        strong_matches = sorted(list(user_skill_set & target_skill_set))
        gap_skills = target_skill_set - user_skill_set

        # Score gaps by priority
        gaps = []
        for skill in gap_skills:
            category = self._get_category(skill)
            priority = self._get_priority(skill, target_job_description)
            gaps.append({
                "skill": skill,
                "priority": priority,
                "category": category,
                "frequency": 1,
            })

        # Sort: high priority first, then medium, then low
        priority_order = {"high": 0, "medium": 1, "low": 2}
        gaps.sort(key=lambda x: priority_order.get(x["priority"], 1))

        # Calculate match percentage
        total = len(target_skill_set) if target_skill_set else 1
        match_pct = len(strong_matches) / total * 100

        # Generate summary
        summary = self._generate_summary(match_pct, gaps, strong_matches, target_job_title)

        return {
            "gaps": gaps,
            "strong_matches": strong_matches,
            "match_percentage": round(match_pct, 1),
            "summary": summary,
        }

    def _extract_skills_from_text(self, text: str) -> set:
        """Extract skills from job description text."""
        if not text:
            return set()

        text_lower = text.lower()
        found = set()

        for category, skills in self.SKILL_CATEGORIES.items():
            for skill in skills:
                pattern = r"\b" + re.escape(skill) + r"\b"
                if re.search(pattern, text_lower):
                    found.add(skill)

        return found

    def _get_category(self, skill: str) -> str:
        """Get the category of a skill."""
        skill_lower = skill.lower()
        for category, skills in self.SKILL_CATEGORIES.items():
            if skill_lower in skills:
                return category
        return "general"

    def _get_priority(self, skill: str, job_desc: str) -> str:
        """Determine skill priority based on frequency in job description."""
        if not job_desc:
            return "medium"

        count = len(re.findall(re.escape(skill), job_desc.lower()))
        if count >= 3:
            return "high"
        elif count >= 1:
            return "medium"
        else:
            return "low"

    def _generate_summary(self, match_pct, gaps, matches, job_title) -> str:
        """Generate a human-readable summary."""
        title_str = f" for {job_title}" if job_title else ""

        if match_pct >= 80:
            summary = f"Excellent fit{title_str}! You match {match_pct:.0f}% of required skills."
        elif match_pct >= 60:
            summary = f"Good fit{title_str}. You match {match_pct:.0f}% of required skills."
        elif match_pct >= 40:
            summary = f"Moderate fit{title_str}. You match {match_pct:.0f}% of required skills."
        else:
            summary = f"Developing fit{title_str}. You match {match_pct:.0f}% of required skills."

        high_priority = [g for g in gaps if g["priority"] == "high"]
        if high_priority:
            top_skills = [g["skill"] for g in high_priority[:3]]
            summary += f" Focus on learning: {', '.join(top_skills)}."

        return summary
PYEOF

cat > backend/services/skill-gap/app/main.py << 'PYEOF'
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from app.models.schemas import GapRequest, GapResponse
from app.services.analyzer import SkillGapAnalyzer
import uvicorn

app = FastAPI(title="Skill Gap Analyzer", version="2.0.0")

app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

analyzer = SkillGapAnalyzer()


@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "skill-gap", "version": "2.0.0"}


@app.post("/analyze", response_model=GapResponse)
async def analyze_gaps(request: GapRequest):
    """Analyze skill gaps between user and target job."""
    if not request.user_skills:
        raise HTTPException(status_code=400, detail="user_skills cannot be empty")
    if not request.target_job_skills and not request.target_job_description:
        raise HTTPException(status_code=400, detail="Provide target_job_skills or target_job_description")

    result = analyzer.analyze(
        user_skills=request.user_skills,
        target_job_skills=request.target_job_skills,
        target_job_title=request.target_job_title,
        target_job_description=request.target_job_description,
    )
    return result


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8004)
PYEOF

echo "✅ Skill Gap Analyzer service created"

###############################################
# Seed data - Sample job listings
###############################################

cat > database/seeds/seed_jobs.sql << 'EOF'
-- Sample job listings for testing
INSERT INTO job_listings (title, company, location, description, required_skills, seniority_level, salary_range) VALUES
(
    'Senior Software Engineer',
    'TechCorp Inc.',
    'San Francisco, CA',
    'We are looking for a Senior Software Engineer to build scalable web applications. You will work with React, Node.js, and PostgreSQL to deliver high-quality features. Experience with Docker and AWS is required. Strong understanding of REST APIs and microservices architecture needed.',
    '["python", "javascript", "react", "node.js", "postgresql", "docker", "aws", "rest api", "microservices", "git"]',
    'senior',
    '$150,000 - $200,000'
),
(
    'Full Stack Developer',
    'StartupXYZ',
    'Remote',
    'Join our fast-growing startup as a Full Stack Developer. You will build features using React and Next.js on the frontend, and Python/FastAPI on the backend. We use PostgreSQL and Redis for data storage. Experience with CI/CD pipelines and agile development is a plus.',
    '["python", "javascript", "react", "next.js", "fastapi", "postgresql", "redis", "ci/cd", "agile", "git"]',
    'mid',
    '$120,000 - $160,000'
),
(
    'Machine Learning Engineer',
    'AI Solutions Ltd.',
    'New York, NY',
    'Looking for an ML Engineer to develop NLP models and recommendation systems. Must have experience with Python, PyTorch or TensorFlow, and large language models. Knowledge of Docker, Kubernetes, and cloud platforms (AWS/GCP) is essential.',
    '["python", "pytorch", "tensorflow", "machine learning", "deep learning", "nlp", "docker", "kubernetes", "aws", "gcp"]',
    'senior',
    '$170,000 - $220,000'
),
(
    'Frontend Developer',
    'DesignFirst Co.',
    'Austin, TX',
    'We need a talented Frontend Developer to create beautiful, responsive user interfaces. Proficiency in React, TypeScript, and Tailwind CSS required. Experience with Next.js, testing frameworks, and design systems is preferred.',
    '["javascript", "typescript", "react", "next.js", "html", "css", "git", "agile"]',
    'mid',
    '$100,000 - $140,000'
),
(
    'Backend Engineer',
    'DataFlow Systems',
    'Seattle, WA',
    'Backend Engineer needed to build robust APIs and data pipelines. Must be proficient in Python, Django or FastAPI, PostgreSQL, and Redis. Experience with message queues (RabbitMQ), Docker, and cloud infrastructure preferred.',
    '["python", "django", "fastapi", "postgresql", "redis", "docker", "linux", "git", "rest api"]',
    'mid',
    '$130,000 - $170,000'
),
(
    'DevOps Engineer',
    'CloudNative Corp.',
    'Remote',
    'DevOps Engineer to manage our cloud infrastructure and CI/CD pipelines. Strong experience with AWS, Docker, Kubernetes, Terraform, and GitHub Actions required. Scripting with Python or Bash essential.',
    '["aws", "docker", "kubernetes", "terraform", "jenkins", "github actions", "ci/cd", "python", "linux", "git"]',
    'senior',
    '$140,000 - $185,000'
),
(
    'Data Scientist',
    'Analytics Pro',
    'Chicago, IL',
    'Data Scientist to analyze large datasets and build predictive models. Requires Python, pandas, scikit-learn, and SQL. Experience with deep learning frameworks and data visualization tools preferred.',
    '["python", "pandas", "numpy", "scikit-learn", "sql", "machine learning", "tensorflow", "git"]',
    'mid',
    '$115,000 - $155,000'
),
(
    'Junior Software Developer',
    'GrowthTech',
    'Remote',
    'Entry-level developer position. Looking for someone with basics in JavaScript, HTML, CSS, and willingness to learn React and Node.js. Understanding of Git and agile methodology helpful.',
    '["javascript", "html", "css", "git", "agile"]',
    'junior',
    '$70,000 - $95,000'
);
EOF

echo "✅ Sample job listings seed file created"

###############################################
# Update API Gateway routes to connect to microservices
###############################################

cat > backend/api-gateway/src/routes/resume.js << 'JSEOF'
const express = require("express");
const multer = require("multer");
const axios = require("axios");
const { authenticateToken } = require("../middleware/auth");
const pool = require("../config/db");

const router = express.Router();

const RESUME_PARSER_URL = `http://localhost:${process.env.RESUME_PARSER_PORT || 8001}`;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only PDF, DOCX, and TXT files are allowed"));
    }
  },
});

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

      // Save parsed data
      await pool.query(
        "INSERT INTO parsed_data (resume_id, skills, experience, education, summary) VALUES ($1, $2, $3, $4, $5)",
        [
          resume.id,
          JSON.stringify(parsed.skills || []),
          JSON.stringify(parsed.experience || []),
          JSON.stringify(parsed.education || []),
          parsed.summary || "",
        ]
      );

      // Update resume status
      await pool.query("UPDATE resumes SET status = $1 WHERE id = $2", ["parsed", resume.id]);

      res.status(201).json({ resume: { ...resume, status: "parsed" }, parsed });
    } catch (parseErr) {
      console.error("Parser service error:", parseErr.message);
      await pool.query("UPDATE resumes SET status = $1 WHERE id = $2", ["upload_only", resume.id]);
      res.status(201).json({
        resume: { ...resume, status: "upload_only" },
        message: "Resume saved but parser service unavailable. Start it with: cd backend/services/resume-parser && python -m app.main",
      });
    }
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ error: "Failed to upload resume" });
  }
});

// Get user's resumes with parsed data
router.get("/", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT r.*, pd.skills, pd.experience, pd.education, pd.summary as parsed_summary
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

// Get ATS score for a resume against a job
router.post("/:resumeId/score", authenticateToken, async (req, res) => {
  try {
    const { job_id } = req.body;
    const resumeId = req.params.resumeId;

    // Get resume parsed data
    const resumeResult = await pool.query(
      `SELECT r.*, pd.skills, pd.summary
       FROM resumes r
       LEFT JOIN parsed_data pd ON pd.resume_id = r.id
       WHERE r.id = $1 AND r.user_id = $2`,
      [resumeId, req.user.id]
    );

    if (resumeResult.rows.length === 0) {
      return res.status(404).json({ error: "Resume not found" });
    }

    // Get job description
    const jobResult = await pool.query("SELECT * FROM job_listings WHERE id = $1", [job_id]);
    if (jobResult.rows.length === 0) {
      return res.status(404).json({ error: "Job not found" });
    }

    const resume = resumeResult.rows[0];
    const job = jobResult.rows[0];

    const ATS_SCORER_URL = `http://localhost:${process.env.ATS_SCORER_PORT || 8002}`;

    const scoreResponse = await axios.post(`${ATS_SCORER_URL}/score`, {
      resume_text: resume.summary || "",
      job_description: job.description || "",
      job_title: job.title || "",
    });

    const scores = scoreResponse.data;

    // Save scores
    await pool.query(
      `INSERT INTO ats_scores (resume_id, job_id, keyword_score, semantic_score, format_score, composite, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT DO NOTHING`,
      [resumeId, job_id, scores.keyword_score, scores.semantic_score, scores.format_score, scores.composite, JSON.stringify(scores)]
    );

    res.json({ scores });
  } catch (err) {
    console.error("Scoring error:", err.message);
    res.status(500).json({ error: "Failed to score resume. Make sure ATS scorer service is running." });
  }
});

module.exports = router;
JSEOF

# Update jobs route to include matching
cat > backend/api-gateway/src/routes/jobs.js << 'JSEOF'
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
      query += " WHERE title ILIKE $1 OR company ILIKE $1 OR description ILIKE $1";
      params.push(`%${search}%`);
    }

    query += ` ORDER BY posted_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    // Get total count
    let countQuery = "SELECT COUNT(*) as total FROM job_listings";
    let countParams = [];
    if (search) {
      countQuery += " WHERE title ILIKE $1 OR company ILIKE $1 OR description ILIKE $1";
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
    // Get user's latest parsed resume skills
    const resumeResult = await pool.query(
      `SELECT pd.skills FROM resumes r
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

    const JOB_MATCHER_URL = `http://localhost:${process.env.JOB_MATCHER_PORT || 8003}`;

    const matchResponse = await axios.post(`${JOB_MATCHER_URL}/match`, {
      resume_skills: skillNames,
      limit: 10,
    });

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

    const SKILL_GAP_URL = `http://localhost:${process.env.SKILL_GAP_PORT || 8004}`;

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

module.exports = router;
JSEOF

# Install form-data package for API gateway
cat > backend/api-gateway/install-extra.sh << 'EOF'
#!/bin/bash
cd "$(dirname "$0")"
npm install form-data
EOF
chmod +x backend/api-gateway/install-extra.sh

echo "✅ API Gateway routes updated"

###############################################
# Startup helper script
###############################################

cat > scripts/start-all.sh << 'EOF'
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
EOF
chmod +x scripts/start-all.sh

echo ""
echo "============================================"
echo "✅ Phase 2 setup complete!"
echo "============================================"
echo ""
echo "NEXT STEPS:"
echo ""
echo "1. Seed the database with sample jobs:"
echo "   PGPASSWORD=career_secure_2026 psql -h localhost -U career_admin -d career_companion -f database/seeds/seed_jobs.sql"
echo ""
echo "2. Install extra API gateway dependency:"
echo "   cd backend/api-gateway && npm install form-data && cd ../.."
echo ""
echo "3. Restart the API Gateway (in the tab where it's running, press Ctrl+C then):"
echo "   npm run dev"
echo ""
echo "4. Start Resume Parser (NEW terminal tab):"
echo "   cd backend/services/resume-parser"
echo "   python3 -m venv venv && source venv/bin/activate"
echo "   pip install -r requirements.txt"
echo "   python -m app.main"
echo ""
echo "5. Start ATS Scorer (NEW terminal tab):"
echo "   cd backend/services/ats-scorer"
echo "   python3 -m venv venv && source venv/bin/activate"
echo "   pip install -r requirements.txt"
echo "   python -m app.main"
echo ""
echo "6. Start Job Matcher (NEW terminal tab):"
echo "   cd backend/services/job-matcher"
echo "   python3 -m venv venv && source venv/bin/activate"
echo "   pip install -r requirements.txt"
echo "   python -m app.main"
echo ""
echo "7. Start Skill Gap Analyzer (NEW terminal tab):"
echo "   cd backend/services/skill-gap"
echo "   python3 -m venv venv && source venv/bin/activate"
echo "   pip install -r requirements.txt"
echo "   python -m app.main"
echo ""
