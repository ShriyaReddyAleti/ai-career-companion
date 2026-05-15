from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
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


class RoleGapRequest(BaseModel):
    user_skills: list[str]
    target_role: str


@app.post("/analyze-role", response_model=GapResponse)
async def analyze_role_gaps(request: RoleGapRequest):
    if not request.user_skills:
        raise HTTPException(status_code=400, detail="user_skills cannot be empty")
    if not request.target_role:
        raise HTTPException(status_code=400, detail="target_role cannot be empty")
    result = analyzer.analyze_for_role(
        user_skills=request.user_skills,
        target_role=request.target_role,
    )
    return result


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8004)
