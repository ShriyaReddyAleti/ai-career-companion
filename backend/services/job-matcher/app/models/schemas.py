from pydantic import BaseModel
from typing import Optional


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
    posted_at: Optional[str] = None
    match_score: float = 0.0
    matched_skills: list[str] = []
    missing_skills: list[str] = []
    jd_keywords: list[str] = []
    resume_tips: list[str] = []
    seniority_level: str = ""
    apply_url: Optional[str] = None


class MatchResponse(BaseModel):
    matches: list[JobMatch] = []
    total_jobs_searched: int = 0
