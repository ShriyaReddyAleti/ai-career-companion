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
