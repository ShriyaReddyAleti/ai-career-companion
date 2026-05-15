from pydantic import BaseModel
from typing import Optional


class RecommendRequest(BaseModel):
    skills_to_learn: list[str] = []
    current_skills: list[str] = []
    target_role: str = ""
    level: str = "beginner"


class Course(BaseModel):
    title: str
    platform: str
    url: str
    skill: str
    level: str = "beginner"
    duration: str = ""
    description: str = ""
    free: bool = False


class RecommendResponse(BaseModel):
    courses: list[Course] = []
    learning_path: list[str] = []
    total_estimated_hours: int = 0
