from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from app.models.schemas import RecommendRequest, RecommendResponse
from app.services.recommender import CourseRecommender
import uvicorn

app = FastAPI(title="Course Recommender Service", version="3.0.0")

app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

recommender = CourseRecommender()


@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "course-recommender", "version": "3.0.0"}


@app.post("/recommend", response_model=RecommendResponse)
async def recommend_courses(request: RecommendRequest):
    if not request.skills_to_learn and not request.target_role:
        raise HTTPException(status_code=400, detail="Provide skills_to_learn or target_role")

    result = recommender.recommend(
        skills_to_learn=request.skills_to_learn,
        current_skills=request.current_skills,
        target_role=request.target_role,
        level=request.level,
    )
    return result


@app.get("/skills")
async def list_supported_skills():
    from app.services.recommender import COURSE_DATABASE
    return {"skills": sorted(list(COURSE_DATABASE.keys()))}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8006)
