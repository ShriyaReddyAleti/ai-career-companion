from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
from app.models.schemas import ChatRequest, ChatResponse
from app.services.assistant import CareerAssistant
import uvicorn

app = FastAPI(title="Career Chatbot Service", version="4.0.0")

app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

assistant = CareerAssistant()


class CodeEvalRequest(BaseModel):
    question: str
    code: str
    language: str = "python"
    target_role: Optional[str] = ""


@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "chatbot", "version": "4.0.0", "ai_enabled": assistant.ai_enabled, "provider": assistant.provider or "none"}


@app.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    if not request.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    history = [{"role": m.role, "content": m.content} for m in request.conversation_history]

    response_text = assistant.chat(
        message=request.message,
        conversation_history=history,
        context=request.context,
        conversation_type=request.conversation_type or "general",
    )
    return ChatResponse(response=response_text)


@app.post("/evaluate-code")
async def evaluate_code(request: CodeEvalRequest):
    if not request.code.strip():
        raise HTTPException(status_code=400, detail="Code cannot be empty")

    result = assistant.evaluate_code(
        question=request.question,
        code=request.code,
        language=request.language,
        target_role=request.target_role or "",
    )
    return result


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8005)
