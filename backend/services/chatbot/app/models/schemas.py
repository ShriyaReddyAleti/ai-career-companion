from pydantic import BaseModel
from typing import Optional


class Message(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    conversation_history: list[Message] = []
    context: Optional[dict] = None
    conversation_type: Optional[str] = "general"


class ChatResponse(BaseModel):
    response: str
    conversation_id: Optional[str] = None
