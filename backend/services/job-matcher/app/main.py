from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from app.models.schemas import MatchRequest, MatchResponse
from app.services.matcher import JobMatcher
import uvicorn

app = FastAPI(title="Job Matching Engine", version="2.0.0")

app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

matcher = JobMatcher()


@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "job-matcher", "version": "2.0.0"}


@app.post("/match", response_model=MatchResponse)
async def match_jobs(request: MatchRequest):
    """Find matching jobs for a resume."""
    if not request.resume_skills and not request.resume_text:
        raise HTTPException(status_code=400, detail="Provide resume_skills or resume_text")

    result = await matcher.match(
        resume_skills=request.resume_skills,
        resume_text=request.resume_text,
        preferred_location=request.preferred_location,
        preferred_seniority=request.preferred_seniority,
        limit=request.limit,
    )
    return result


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8003)
