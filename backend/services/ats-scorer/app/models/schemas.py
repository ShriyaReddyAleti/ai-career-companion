from pydantic import BaseModel
from typing import Optional


class ScoreRequest(BaseModel):
    resume_text: str


class CategoryScore(BaseModel):
    score: float
    grade: str
    issues: list[str] = []
    wins: list[str] = []


class ScoreBreakdown(BaseModel):
    composite: float
    impact: Optional[CategoryScore] = None
    skills: Optional[CategoryScore] = None
    format: Optional[CategoryScore] = None
    style: Optional[CategoryScore] = None
    completeness: Optional[CategoryScore] = None
    # Backward compatibility
    format_score: float = 0.0
    content_score: float = 0.0
    consistency_score: float = 0.0
    issues: list[str] = []
    suggestions: list[str] = []
