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
