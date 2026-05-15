"""OpenAI-powered resume parser — used when OPENAI_API_KEY is configured."""
import os
import re
import json

try:
    from openai import OpenAI
    _openai_available = True
except ImportError:
    _openai_available = False

try:
    from dotenv import load_dotenv
    for _p in ["../../../../.env", "../../../../../.env", "../../../../../../.env"]:
        load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), _p))
except Exception:
    pass


def _client():
    key = os.environ.get("OPENAI_API_KEY", "")
    if not key or key.startswith("your_") or not _openai_available:
        return None
    return OpenAI(api_key=key)


_PARSE_PROMPT = """You are an expert resume parser. Extract structured information from the resume text and return ONLY valid JSON (no markdown, no explanation) with exactly these keys:

{
  "name": "Full Name or empty string",
  "email": "email@example.com or empty string",
  "phone": "phone number or empty string",
  "summary": "professional summary paragraph or empty string",
  "skills": [
    {"name": "skill name", "category": "languages|frameworks|databases|cloud|devops|ml_ai|tools|other"}
  ],
  "experience": [
    {
      "title": "Job Title",
      "company": "Company Name",
      "duration": "Jan 2022 – Present",
      "description": "key responsibilities and achievements"
    }
  ],
  "education": [
    {
      "degree": "Bachelor of Science in Computer Science",
      "institution": "University Name",
      "year": "2020",
      "field": "Computer Science"
    }
  ]
}

Rules:
- Extract ALL skills mentioned anywhere in the resume (skills section, experience bullets, projects)
- Categorize skills accurately: languages (Python, Java, JS...), frameworks (React, Django...), databases (PostgreSQL, MongoDB...), cloud (AWS, GCP...), devops (Docker, K8s...), ml_ai (PyTorch, TensorFlow...), tools (Git, Jira...)
- For experience, capture the role title, employer, date range, and a concise description
- Keep descriptions under 300 characters each
- Return empty arrays [] if a section has no data, never null"""


def parse_with_openai(text: str) -> dict | None:
    """
    Parse resume text using GPT-4o-mini.
    Returns structured dict or None if OpenAI is unavailable/fails.
    """
    c = _client()
    if not c:
        return None

    try:
        resp = c.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": _PARSE_PROMPT},
                {"role": "user", "content": f"Parse this resume:\n\n{text[:6000]}"},
            ],
            temperature=0.1,
            max_tokens=2000,
        )
        raw = resp.choices[0].message.content.strip()

        # Strip markdown fences if model wrapped the JSON
        if raw.startswith("```"):
            raw = re.sub(r"^```[a-z]*\n?", "", raw)
            raw = re.sub(r"\n?```$", "", raw)

        result = json.loads(raw)

        return {
            "name":       result.get("name", ""),
            "email":      result.get("email", ""),
            "phone":      result.get("phone", ""),
            "summary":    result.get("summary", ""),
            "skills":     result.get("skills", []),
            "experience": result.get("experience", []),
            "education":  result.get("education", []),
            "raw_text":   text[:5000],
        }

    except Exception as e:
        print(f"[ai_parser] OpenAI parse failed: {e}")
        return None
