from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from app.models.schemas import ScoreRequest, ScoreBreakdown
from app.services.scorer import ATSScorer
import uvicorn

app = FastAPI(title="ATS Scoring Engine", version="2.0.0")

app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

scorer = ATSScorer()


@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "ats-scorer", "version": "2.0.0"}


@app.post("/score", response_model=ScoreBreakdown)
async def score_resume(request: ScoreRequest):
    if not request.resume_text.strip():
        raise HTTPException(status_code=400, detail="Resume text cannot be empty")

    result = scorer.score(request.resume_text)
    return result


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8002)
