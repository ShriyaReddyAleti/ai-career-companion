import re
import os
import json
import hashlib
import asyncio
import httpx
import redis
from dotenv import load_dotenv

load_dotenv("../../../.env")

RAPIDAPI_KEY = os.getenv("RAPIDAPI_KEY", "")
JSEARCH_URL = "https://jsearch.p.rapidapi.com/search"
JSEARCH_HEADERS = {
    "X-RapidAPI-Key": RAPIDAPI_KEY,
    "X-RapidAPI-Host": "jsearch.p.rapidapi.com",
}

CACHE_TTL = 3600  # 1 hour

def _redis_client():
    try:
        r = redis.Redis(
            host=os.getenv("REDIS_HOST", "localhost"),
            port=int(os.getenv("REDIS_PORT", 6379)),
            password=os.getenv("REDIS_PASSWORD") or None,
            decode_responses=True,
        )
        r.ping()
        return r
    except Exception:
        return None


class JobMatcher:
    """Matches resumes to live job listings via JSearch (LinkedIn / Indeed / Glassdoor)."""

    async def match(
        self,
        resume_skills: list[str],
        resume_text: str = "",
        preferred_location: str = "",
        preferred_seniority: str = "",
        limit: int = 10,
    ) -> dict:
        try:
            jobs = await self._fetch_live_jobs(resume_skills, preferred_location)
            if not jobs:
                return {"matches": [], "total_jobs_searched": 0}

            resume_skill_set = set(s.lower().strip() for s in resume_skills)
            resume_words = set(re.findall(r"\b[a-z+#.]{2,}\b", resume_text.lower()))

            scored = [
                self._score_job(job, resume_skill_set, resume_words, preferred_location, preferred_seniority)
                for job in jobs
            ]
            scored.sort(key=lambda x: x["match_score"], reverse=True)
            return {"matches": scored[:limit], "total_jobs_searched": len(jobs)}

        except Exception as e:
            print(f"Job matching error: {e}")
            return {"matches": [], "total_jobs_searched": 0}

    # ------------------------------------------------------------------
    # JSearch — parallel page fetch
    # ------------------------------------------------------------------

    async def _fetch_live_jobs(self, resume_skills: list[str], preferred_location: str = "") -> list[dict]:
        query = self._build_query(resume_skills, preferred_location)
        cache_key = "jmatch:" + hashlib.md5(query.encode()).hexdigest()

        # Try cache first
        rc = _redis_client()
        if rc:
            cached = rc.get(cache_key)
            if cached:
                print(f"Cache hit for query: {query}")
                return json.loads(cached)

        # Fetch 2 pages in parallel from JSearch
        async with httpx.AsyncClient(timeout=12) as client:
            tasks = [self._fetch_page(client, query, page) for page in range(1, 3)]
            pages = await asyncio.gather(*tasks, return_exceptions=True)

        raw_jobs = []
        for page in pages:
            if isinstance(page, list):
                raw_jobs.extend(page)

        mapped = [self._map_jsearch_job(j) for j in raw_jobs]

        # Store in cache
        if rc and mapped:
            rc.setex(cache_key, CACHE_TTL, json.dumps(mapped))

        return mapped

    async def _fetch_page(self, client: httpx.AsyncClient, query: str, page: int) -> list:
        try:
            resp = await client.get(
                JSEARCH_URL,
                headers=JSEARCH_HEADERS,
                params={
                    "query": query,
                    "page": str(page),
                    "num_pages": "1",
                    "date_posted": "month",
                    "country": "us",
                },
            )
            return resp.json().get("data") or []
        except Exception as e:
            print(f"JSearch page {page} error: {e}")
            return []

    def _build_query(self, resume_skills: list[str], preferred_location: str) -> str:
        if resume_skills:
            query = " ".join(resume_skills[:2]) + " engineer"
        else:
            query = "software engineer"
        if preferred_location:
            query += f" in {preferred_location}"
        return query

    def _map_jsearch_job(self, j: dict) -> dict:
        city = j.get("job_city") or ""
        state = j.get("job_state") or ""
        location = ", ".join(filter(None, [city, state])) or j.get("job_country") or ""

        skills_raw = j.get("job_required_skills") or []
        required_skills = [s for s in skills_raw if isinstance(s, str) and s.strip()]

        return {
            "id": j.get("job_id", ""),
            "title": j.get("job_title", ""),
            "company": j.get("employer_name", ""),
            "location": location,
            "description": j.get("job_description", ""),
            "required_skills": required_skills,
            "seniority_level": self._infer_seniority(
                j.get("job_title", ""),
                j.get("job_seniority_level") or "",
            ),
            "posted_at_str": j.get("job_posted_at_datetime_utc"),
            "source_url": j.get("job_apply_link", ""),
        }

    def _infer_seniority(self, title: str, jsearch_level: str) -> str:
        level_map = {
            "senior_level": "senior",
            "entry_level": "entry",
            "mid_level": "mid",
            "no_experience": "entry",
            "internship": "entry",
        }
        if jsearch_level in level_map:
            return level_map[jsearch_level]
        t = title.lower()
        if any(k in t for k in ("principal", "distinguished", "fellow", "vp ", "vice president")):
            return "principal"
        if any(k in t for k in ("staff ", "lead ", "head of", "director")):
            return "lead"
        if any(k in t for k in ("senior", "sr.", " sr ")):
            return "senior"
        if any(k in t for k in ("junior", "jr.", " jr ", "associate", "entry", "intern")):
            return "entry"
        if any(k in t for k in ("mid", "intermediate", " ii ", " iii ")):
            return "mid"
        return "mid"

    # ------------------------------------------------------------------
    # Scoring
    # ------------------------------------------------------------------

    def _score_job(
        self,
        job: dict,
        resume_skills: set,
        resume_words: set,
        preferred_location: str,
        preferred_seniority: str,
    ) -> dict:
        required_skills_raw = job.get("required_skills", []) or []
        required_skills = {s.lower().strip() for s in required_skills_raw if isinstance(s, str)}

        if required_skills:
            matched = resume_skills & required_skills
            missing = required_skills - resume_skills
            skill_score = len(matched) / len(required_skills) * 100
        else:
            # No structured skills from API — check which resume skills appear in the description text
            desc_lower = (job.get("description", "") or "").lower()
            matched = {s for s in resume_skills if s and s in desc_lower}
            # Also try word-level match for multi-word skills (e.g. "machine learning")
            resume_words_list = [s for s in resume_skills if s]
            matched |= {s for s in resume_words_list if re.search(r"\b" + re.escape(s) + r"\b", desc_lower)}
            missing = set()
            # Normalize against 10: matching 10 resume skills in the JD = 100%, 5 = 50%, etc.
            # Avoids penalising large skill sets (e.g. 5 matched / 50 total = 10% is misleading).
            skill_score = min(len(matched) / 10 * 100, 100) if resume_skills else 0

        location_score = 50
        if preferred_location and job.get("location"):
            job_loc = job["location"].lower()
            pref_loc = preferred_location.lower()
            if pref_loc in job_loc or job_loc in pref_loc or "remote" in job_loc:
                location_score = 100
            else:
                location_score = 20

        seniority_score = 50
        if preferred_seniority and job.get("seniority_level"):
            if preferred_seniority.lower() == job["seniority_level"].lower():
                seniority_score = 100
            else:
                seniority_score = 30

        composite = skill_score * 0.60 + location_score * 0.20 + seniority_score * 0.20

        all_jd_keywords = sorted(list(required_skills))
        matched_list = sorted(list(matched))[:15]
        missing_list = sorted(list(missing))[:10]

        return {
            "job_id": str(job.get("id", "")),
            "title": job.get("title", ""),
            "company": job.get("company", "") or "",
            "location": job.get("location", ""),
            "posted_at": job.get("posted_at_str"),
            "match_score": round(composite, 1),
            "matched_skills": matched_list,
            "missing_skills": missing_list,
            "jd_keywords": all_jd_keywords,
            "seniority_level": job.get("seniority_level", ""),
            "resume_tips": self._resume_tips(missing_list, job.get("seniority_level", ""), job.get("title", "")),
            "apply_url": job.get("source_url") or None,
        }

    def _resume_tips(self, missing: list, seniority: str, title: str) -> list:
        tips = []
        if len(missing) >= 2:
            tips.append(f"Add {', '.join(missing[:3])} to your skills section to improve this match")
        elif len(missing) == 1:
            tips.append(f"Add '{missing[0]}' to your skills section to improve this match")
        if seniority in ("senior", "lead", "principal"):
            tips.append("Emphasise team leadership, mentoring, or cross-team impact in your experience bullets")
        tl = title.lower()
        if any(k in tl for k in ("data", "ml", "machine learning", "ai")):
            tips.append("Quantify model results — include accuracy, latency, or business impact metrics")
        elif any(k in tl for k in ("frontend", "front-end", "ui", "react", "angular")):
            tips.append("Mention specific UI frameworks, performance improvements, or accessibility work")
        elif any(k in tl for k in ("devops", "platform", "infrastructure", "cloud", "sre")):
            tips.append("Highlight uptime/reliability numbers and infrastructure scale (e.g. '99.9% SLA for 5M users')")
        if not tips:
            tips.append("Tailor your resume summary to mention this role's title and core responsibilities")
        return tips[:3]
