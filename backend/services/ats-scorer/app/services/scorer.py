import re
import os
import json
from collections import Counter

try:
    from openai import OpenAI
    _openai_available = True
except ImportError:
    _openai_available = False

try:
    from dotenv import load_dotenv
    load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "../../../../.env"))
    load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "../../../../../.env"))
    load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "../../../../../../.env"))
except Exception:
    pass


def _get_openai_client():
    key = os.environ.get("OPENAI_API_KEY", "")
    if not key or key.startswith("your_") or not _openai_available:
        return None
    return OpenAI(api_key=key)


_SCORE_PROMPT = """You are an expert ATS resume evaluator — like ResumeWorded or VMock. Score the resume across 5 categories.

Return ONLY valid JSON (no markdown) with exactly this shape:

{
  "composite": <0-100 float>,
  "impact": {
    "score": <0-100>,
    "grade": <"A+"|"A"|"B"|"C"|"D"|"F">,
    "issues": ["specific problem with this resume"],
    "wins": ["something done well"]
  },
  "skills": { "score": ..., "grade": ..., "issues": [...], "wins": [...] },
  "format": { "score": ..., "grade": ..., "issues": [...], "wins": [...] },
  "style": { "score": ..., "grade": ..., "issues": [...], "wins": [...] },
  "completeness": { "score": ..., "grade": ..., "issues": [...], "wins": [...] },
  "issues": ["top 6 most critical issues across all categories"],
  "suggestions": ["5 specific actionable improvements"]
}

SCORING RUBRIC:

IMPACT (30% of composite) — Did the candidate prove their value with results?
- Action verbs: 70%+ bullet points should start with strong verbs (Developed, Led, Built, Optimized, Reduced, Launched…)
- Quantification: At least 3 metrics (%, $, counts, time savings). "Increased throughput by 40%" beats "improved performance"
- No filler: Remove "responsible for", "helped with", "assisted in", "worked on", "tasked with"
- No clichés: "team player", "hard worker", "passionate", "detail-oriented", "results-driven", "synergy", "leverage", "innovative"
- Each experience bullet should communicate WHAT + HOW + IMPACT

SKILLS (20%) — Is the tech stack clearly visible to keyword matching?
- Dedicated Skills section with 8+ specific items
- Use real tool/language names (Python, React, AWS, PostgreSQL) — not vague ("databases", "web technologies")
- Avoid generic filler: Microsoft Office, Internet, Email, Windows
- Skills should be scannable comma- or bullet-separated, not buried in prose

FORMAT (25%) — Can ATS systems parse this resume?
- Email and phone in contact section (critical)
- Standard section headers: Experience/Work History, Education, Skills
- No table formatting (pipes |) — ATS cannot parse tables
- Ideal length: 400–700 words (1 page) or up to 900 words (2 pages)
- No creative section names ("My Journey", "What I've Done")

STYLE (15%) — Is formatting consistent throughout?
- All bullets end with period OR none do — no mixing
- Date format consistent (all "Jan 2023" or all "2023-01", never mixed)
- Single bullet symbol throughout (all •, all -, or all *, not mixed)
- No personal pronouns (I, me, my, we, our) — resume is always third-person implicit
- Past tense for past jobs, present for current role

COMPLETENESS (10%) — Are all sections filled and professional?
- Professional summary (2–3 lines at top) helps ATS categorize the profile
- LinkedIn URL in contact section
- GitHub URL (especially for tech roles)
- Each experience entry has at least 2 bullets describing accomplishments
- Education lists degree name, institution, graduation year

composite = impact*0.30 + skills*0.20 + format*0.25 + style*0.15 + completeness*0.10

Be specific and harsh — generic praise is worthless. Point to exact problems."""


CLICHÉS = {
    "team player", "hard worker", "hard-working", "hardworking", "self-starter",
    "self motivated", "self-motivated", "results-driven", "results driven",
    "detail-oriented", "detail oriented", "go-getter", "go getter", "synergy",
    "leverage", "leveraging", "passionate", "dynamic", "proactive", "innovative",
    "thought leader", "game changer", "guru", "ninja", "rockstar", "wizard",
    "best of breed", "outside the box", "value add", "value-add", "strategic thinker",
    "forward-thinking", "cutting-edge", "motivated",
}

FILLER_PHRASES = [
    r"responsible for",
    r"duties (include|included|including)",
    r"helped (with|to)",
    r"assisted (with|in)",
    r"worked (on|with|alongside)",
    r"involved in",
    r"tasked with",
    r"participated in",
    r"exposure to",
]

ACTION_VERBS = {
    "accelerated", "achieved", "administered", "analyzed", "architected", "assessed",
    "automated", "built", "championed", "collaborated", "conceptualized", "conducted",
    "consolidated", "constructed", "consulted", "converted", "coordinated", "created",
    "cultivated", "customized", "decreased", "defined", "delivered", "deployed",
    "designed", "developed", "diagnosed", "directed", "documented", "drove",
    "enabled", "engineered", "enhanced", "established", "evaluated", "executed",
    "expanded", "facilitated", "forecasted", "formulated", "founded", "generated",
    "grew", "guided", "handled", "hired", "identified", "implemented", "improved",
    "increased", "influenced", "initiated", "innovated", "inspected", "integrated",
    "introduced", "investigated", "launched", "led", "maintained", "managed",
    "mentored", "migrated", "modernized", "monitored", "motivated", "negotiated",
    "obtained", "operated", "optimized", "organized", "overhauled", "oversaw",
    "owned", "partnered", "planned", "presented", "prioritized", "produced",
    "proposed", "prototyped", "provided", "published", "recruited", "redesigned",
    "reduced", "refactored", "reinforced", "researched", "resolved", "restructured",
    "reviewed", "revised", "scaled", "secured", "shaped", "simplified", "solved",
    "spearheaded", "standardized", "streamlined", "strengthened", "structured",
    "supervised", "supported", "tested", "trained", "transformed", "translated",
    "troubleshot", "unified", "updated", "upgraded", "utilized", "validated", "wrote",
}


def _grade(score: float) -> str:
    if score >= 90: return "A+"
    if score >= 80: return "A"
    if score >= 70: return "B"
    if score >= 60: return "C"
    if score >= 50: return "D"
    return "F"


class ATSScorer:

    def score(self, resume_text: str) -> dict:
        client = _get_openai_client()
        if client:
            try:
                return self._score_with_openai(client, resume_text)
            except Exception as e:
                print(f"OpenAI scoring failed, falling back to regex: {e}")
        return self._score_with_regex(resume_text)

    # ── OpenAI path ───────────────────────────────────────────────────────────

    def _score_with_openai(self, client, resume_text: str) -> dict:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": _SCORE_PROMPT},
                {"role": "user", "content": f"RESUME:\n{resume_text[:6000]}"},
            ],
            temperature=0.2,
            max_tokens=1500,
        )
        raw = response.choices[0].message.content.strip()
        if raw.startswith("```"):
            raw = re.sub(r"^```[a-z]*\n?", "", raw)
            raw = re.sub(r"\n?```$", "", raw)

        result = json.loads(raw)

        def _cat(key):
            d = result.get(key, {})
            return {
                "score": float(d.get("score", 50)),
                "grade": d.get("grade", "C"),
                "issues": d.get("issues", []),
                "wins": d.get("wins", []),
            }

        impact = _cat("impact")
        skills = _cat("skills")
        fmt    = _cat("format")
        style  = _cat("style")
        compl  = _cat("completeness")

        return {
            "composite":        float(result.get("composite", 50)),
            "impact":           impact,
            "skills":           skills,
            "format":           fmt,
            "style":            style,
            "completeness":     compl,
            # backward compat
            "format_score":     fmt["score"],
            "content_score":    impact["score"],
            "consistency_score": style["score"],
            "issues":           result.get("issues", []),
            "suggestions":      result.get("suggestions", []),
        }

    # ── Regex fallback ────────────────────────────────────────────────────────

    def _score_with_regex(self, resume_text: str) -> dict:
        impact     = self._impact_score(resume_text)
        skills     = self._skills_score(resume_text)
        fmt        = self._format_score(resume_text)
        style      = self._style_score(resume_text)
        completeness = self._completeness_score(resume_text)

        composite = (
            impact["score"]       * 0.30 +
            skills["score"]       * 0.20 +
            fmt["score"]          * 0.25 +
            style["score"]        * 0.15 +
            completeness["score"] * 0.10
        )

        all_issues = (
            impact["issues"] + fmt["issues"] +
            skills["issues"] + style["issues"] + completeness["issues"]
        )

        return {
            "composite":     round(composite, 1),
            "impact":        {**impact,       "grade": _grade(impact["score"])},
            "skills":        {**skills,       "grade": _grade(skills["score"])},
            "format":        {**fmt,          "grade": _grade(fmt["score"])},
            "style":         {**style,        "grade": _grade(style["score"])},
            "completeness":  {**completeness, "grade": _grade(completeness["score"])},
            # backward compat
            "format_score":      round(fmt["score"], 1),
            "content_score":     round(impact["score"], 1),
            "consistency_score": round(style["score"], 1),
            "issues":       all_issues[:8],
            "suggestions":  self._top_suggestions(impact, skills, fmt, style, completeness),
        }

    # ── Category scorers ──────────────────────────────────────────────────────

    def _impact_score(self, text: str) -> dict:
        issues, wins = [], []
        score = 100.0

        lines = [l.strip() for l in text.split("\n") if l.strip()]
        bullet_lines = [
            l for l in lines
            if re.match(r"^[-–—•*▪▸]\s+\S", l) or re.match(r"^\d+\.\s+\S", l)
        ]

        # Action verbs
        if bullet_lines:
            verb_count = sum(
                1 for l in bullet_lines
                if re.sub(r"^[-•*▪▸\d.]+\s*", "", l).split()[:1] and
                   re.sub(r"^[-•*▪▸\d.]+\s*", "", l).split()[0].lower().rstrip(".,;:") in ACTION_VERBS
            )
            ratio = verb_count / len(bullet_lines)
            if ratio >= 0.70:
                wins.append(f"Strong action verbs on {int(ratio*100)}% of bullets")
            elif ratio >= 0.40:
                score -= 20
                issues.append(
                    f"Only {int(ratio*100)}% of bullets start with action verbs — aim for 70%+ "
                    "(Developed, Led, Built, Optimized, Reduced, Launched…)"
                )
            else:
                score -= 40
                issues.append(
                    f"Weak bullet openings — only {int(ratio*100)}% use action verbs. "
                    "Every bullet should start with a strong verb."
                )
        else:
            score -= 30
            issues.append("No bullet points found — structure experience as bullet points for ATS readability")

        # Quantified results
        metrics = re.findall(
            r"\b\d+\s*%|\$\s*[\d,]+|\b\d+\s*x\b"
            r"|\b\d+[,\d]*\s*(users|clients|customers|employees|projects|million|billion|thousand|k|ms|seconds|hrs|hours|repos|services)\b",
            text, re.I,
        )
        if len(metrics) >= 3:
            wins.append(f"{len(metrics)} quantified achievements — great use of metrics")
        elif len(metrics) >= 1:
            score -= 20
            issues.append(
                f"Only {len(metrics)} metric(s) found — add more numbers (%, $, counts, time saved) "
                "to prove impact. E.g. 'reduced load time by 40%'"
            )
        else:
            score -= 35
            issues.append(
                "No quantifiable results detected — add metrics to every bullet: "
                "'increased performance by 40%', 'managed 8 engineers', 'served 50k users'"
            )

        # Filler phrases
        found_fillers = [p for p in FILLER_PHRASES if re.search(p, text, re.I)]
        if found_fillers:
            score -= 15
            issues.append(
                f"Weak phrasing: '{found_fillers[0].replace(r'(include|included|including)', 'includes')}' "
                "— replace with an action verb that shows ownership"
            )
        else:
            wins.append("No filler phrases detected")

        # Clichés / buzzwords
        found_cliches = [c for c in CLICHÉS if re.search(r"\b" + re.escape(c) + r"\b", text, re.I)]
        if found_cliches:
            score -= 10
            issues.append(
                f"Overused buzzwords: '{found_cliches[0]}' — ATS filters these; "
                "show evidence instead of claiming traits"
            )

        return {"score": max(round(score, 1), 0), "issues": issues, "wins": wins}

    def _skills_score(self, text: str) -> dict:
        issues, wins = [], []
        score = 100.0

        # Skills section
        if not re.search(r"(?i)\b(skills|technical\s*skills|competencies|expertise|technologies)\b", text):
            score -= 40
            issues.append("No dedicated Skills section — add one so ATS can find your tech stack in seconds")

        # Count skills
        skills_match = re.search(
            r"(?i)(?:skills|technical skills|competencies|technologies)[:\n](.*?)(?:\n\n|\Z)", text, re.S
        )
        skills_count = 0
        if skills_match:
            skills_text = skills_match.group(1)
            skills_count = len([
                s for s in re.split(r"[,|•\n/]", skills_text)
                if s.strip() and len(s.strip()) > 1
            ])

        if skills_count >= 10:
            wins.append(f"{skills_count} skills listed — strong keyword coverage")
        elif skills_count >= 5:
            wins.append(f"{skills_count} skills listed")
            score -= 10
            issues.append(f"Only {skills_count} skills detected — list 10+ specific tools, languages, and frameworks")
        elif skills_count >= 1:
            score -= 25
            issues.append(f"Only {skills_count} skills found — expand skills section with your full tech stack")
        else:
            score -= 30
            issues.append("Skills section appears empty — list your languages, frameworks, tools, and platforms explicitly")

        # Generic/vague skills
        generic = [
            g for g in ("Microsoft Office", "MS Office", "Google Docs", "Internet", "Email", "Windows", "Mac OS")
            if g.lower() in text.lower()
        ]
        if generic:
            score -= 10
            issues.append(
                f"Generic skill '{generic[0]}' wastes space — replace with job-specific tools "
                "(e.g. Python, Docker, AWS, PostgreSQL)"
            )

        return {"score": max(round(score, 1), 0), "issues": issues, "wins": wins}

    def _format_score(self, text: str) -> dict:
        issues, wins = [], []
        score = 100.0

        # Email
        if re.search(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}", text):
            wins.append("Email address present")
        else:
            score -= 25
            issues.append("Missing email — ATS cannot process your application without contact info")

        # Phone
        if re.search(r"(?:\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}", text):
            wins.append("Phone number present")
        else:
            score -= 15
            issues.append("Missing phone number — add it to your contact section")

        # Experience header
        if re.search(r"(?i)\b(experience|work\s*history|employment)\b", text):
            wins.append("Experience section found")
        else:
            score -= 20
            issues.append("No 'Experience' section header — use this exact label for ATS compatibility")

        # Education
        if re.search(r"(?i)\b(education|degree|university|college|bachelor|master|ph\.?d)\b", text):
            wins.append("Education section found")
        else:
            score -= 15
            issues.append("Missing 'Education' section — required by most ATS systems")

        # No tables
        if re.search(r"(?:\|.*){2,}", text):
            score -= 20
            issues.append("Table formatting detected — ATS cannot parse tables; convert to bullet lists")

        # Word count
        word_count = len(text.split())
        if 350 <= word_count <= 900:
            wins.append(f"Good length ({word_count} words)")
        elif word_count < 200:
            score -= 20
            issues.append(f"Resume too short ({word_count} words) — expand descriptions to reach 400–700 words")
        elif word_count < 350:
            score -= 10
            issues.append(f"Resume is thin ({word_count} words) — add more detail to experience bullets")
        else:
            score -= 10
            issues.append(f"Resume is long ({word_count} words) — trim to 2 pages max to avoid ATS truncation")

        return {"score": max(round(score, 1), 0), "issues": issues, "wins": wins}

    def _style_score(self, text: str) -> dict:
        issues, wins = [], []
        score = 100.0

        # Personal pronouns
        pronouns = re.findall(r"\b(I|me|my|we|our|myself)\b", text)
        if pronouns:
            score -= 20
            issues.append(
                f"Personal pronouns found ({', '.join(sorted(set(pronouns)))}) — "
                "resumes are always written in third-person implicit (no 'I' or 'my')"
            )
        else:
            wins.append("No personal pronouns — professional tone")

        # Bullet punctuation
        bullet_lines = [l.rstrip() for l in text.split("\n") if re.match(r"\s*[-–—•*▪▸]\s+\S", l)]
        if len(bullet_lines) >= 4:
            ends_period = sum(1 for l in bullet_lines if l.endswith("."))
            ratio = ends_period / len(bullet_lines)
            if ratio >= 0.85 or ratio <= 0.15:
                wins.append("Consistent bullet punctuation")
            else:
                score -= 20
                issues.append(
                    f"Inconsistent bullet punctuation — {ends_period}/{len(bullet_lines)} bullets "
                    "end with a period. Pick one style and apply it throughout."
                )

        # Date format
        has_word_dates    = bool(re.search(r"\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}\b", text))
        has_numeric_dates = bool(re.search(r"\b(?:0?[1-9]|1[0-2])/\d{4}\b", text))
        if has_word_dates and has_numeric_dates:
            score -= 15
            issues.append("Mixed date formats — use either 'Jan 2023' or '01/2023' consistently")
        elif has_word_dates or has_numeric_dates:
            wins.append("Consistent date formatting")

        # Mixed bullet symbols
        bullet_symbols = re.findall(r"^[ \t]*([-–—•*▪▸])\s+\S", text, re.MULTILINE)
        if bullet_symbols:
            unique = set(bullet_symbols)
            if len(unique) > 1:
                score -= 15
                issues.append(f"Mixed bullet symbols ({', '.join(sorted(unique))}) — use a single type throughout")
            else:
                wins.append("Consistent bullet style")

        # Tense check (basic): past-tense verbs in experience
        past_verbs = re.findall(r"\b(managed|led|built|developed|created|designed|implemented|achieved)\b", text, re.I)
        if past_verbs:
            wins.append("Past-tense verbs used in experience bullets")

        return {"score": max(round(score, 1), 0), "issues": issues, "wins": wins}

    def _completeness_score(self, text: str) -> dict:
        issues, wins = [], []
        score = 100.0

        # Summary
        if re.search(r"(?i)\b(summary|objective|profile|about|overview)\b", text):
            wins.append("Professional summary included")
        else:
            score -= 30
            issues.append(
                "No summary section — a 2–3 line professional summary at the top "
                "helps ATS categorize your profile and grabs recruiter attention"
            )

        # LinkedIn — match full URL or profile username pattern
        if re.search(r"linkedin\.com/in/|linkedin\.com/pub/|\blinkedin\b", text, re.I):
            wins.append("LinkedIn profile linked")
        else:
            score -= 35
            issues.append("No LinkedIn URL — add linkedin.com/in/yourname to the contact section")

        # GitHub — match full URL or username pattern
        if re.search(r"github\.com/|\bgithub\b", text, re.I):
            wins.append("GitHub profile linked")
        else:
            score -= 35
            issues.append(
                "No GitHub URL — for tech roles, include github.com/yourusername "
                "to showcase projects and code quality"
            )

        return {"score": max(round(score, 1), 0), "issues": issues, "wins": wins}

    def _top_suggestions(self, *categories) -> list:
        ranked = sorted(
            [(cat, cat["score"]) for cat in categories],
            key=lambda x: x[1]
        )
        suggestions = []
        for cat, _ in ranked:
            for issue in cat["issues"]:
                suggestions.append(issue)
                if len(suggestions) >= 5:
                    return suggestions
        return suggestions or ["Your resume follows ATS best practices well — keep it up!"]
