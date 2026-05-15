from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from app.services.parser import ResumeParser
from app.services.embeddings import EmbeddingService
from app.services.ai_parser import parse_with_openai
from app.models.schemas import ParsedResume, ParseRequest
import uvicorn

app = FastAPI(title="Resume Parser Service", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

parser = ResumeParser()
embedding_service = EmbeddingService()

# Accepted MIME types — octet-stream is macOS's fallback for PDFs dragged from Finder
_ALLOWED_MIME = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
    "application/octet-stream",
}


def _extract_text(content: bytes, content_type: str, filename: str) -> str:
    ext = (filename.rsplit(".", 1)[-1] if "." in filename else "").lower()
    if content_type == "application/pdf" or ext == "pdf":
        return parser.extract_text_from_pdf(content)
    if (content_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            or ext == "docx"):
        return parser.extract_text_from_docx(content)
    return content.decode("utf-8", errors="replace")


def _do_parse(text: str) -> dict:
    """Try AI parser first, fall back to regex parser."""
    result = parse_with_openai(text)
    if result is None:
        result = parser.parse(text)
    result["raw_text"] = text
    result["embedding"] = embedding_service.generate_embedding(text)
    return result


@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "resume-parser", "version": "2.0.0"}


@app.post("/parse", response_model=ParsedResume)
async def parse_resume(file: UploadFile = File(...)):
    if file.content_type not in _ALLOWED_MIME:
        raise HTTPException(status_code=400, detail="Only PDF, DOCX, and TXT files supported")

    content = await file.read()

    try:
        text = _extract_text(content, file.content_type, file.filename or "")
        if not text.strip():
            raise HTTPException(status_code=400, detail="Could not extract text from file")

        return _do_parse(text)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse resume: {str(e)}")


@app.post("/parse-text", response_model=ParsedResume)
async def parse_resume_text(request: ParseRequest):
    if not request.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")

    return _do_parse(request.text)


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8001)
