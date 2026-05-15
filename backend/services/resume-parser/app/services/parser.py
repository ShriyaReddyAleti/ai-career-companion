import re
import io
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
        """Extract text from PDF bytes.

        Tries three libraries in order of robustness:
        1. pypdf  — best unicode/encoding support, handles LaTeX-compiled PDFs
        2. PyPDF2 — legacy fallback
        3. pdfminer.six — final fallback for encrypted/unusual PDFs
        """
        text = self._pdf_via_pypdf(content)
        if text.strip():
            return text

        text = self._pdf_via_pypdf2(content)
        if text.strip():
            return text

        return self._pdf_via_pdfminer(content)

    def _pdf_via_pypdf(self, content: bytes) -> str:
        try:
            import pypdf
            reader = pypdf.PdfReader(io.BytesIO(content))
            parts = []
            for page in reader.pages:
                t = page.extract_text()
                if t:
                    parts.append(t)
            return "\n".join(parts)
        except Exception:
            return ""

    def _pdf_via_pypdf2(self, content: bytes) -> str:
        try:
            from PyPDF2 import PdfReader
            reader = PdfReader(io.BytesIO(content))
            parts = []
            for page in reader.pages:
                t = page.extract_text()
                if t:
                    parts.append(t)
            return "\n".join(parts)
        except Exception:
            return ""

    def _pdf_via_pdfminer(self, content: bytes) -> str:
        try:
            from pdfminer.high_level import extract_text
            return extract_text(io.BytesIO(content))
        except Exception:
            return ""

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
