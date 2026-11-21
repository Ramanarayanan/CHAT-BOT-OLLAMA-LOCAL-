import json

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from httpx import HTTPError

from .file_extract import extract_document
from .ollama_client import (
    OLLAMA_MODEL,
    check_ollama,
    list_local_models,
    stream_chat,
)
from .schemas import (
    ChatRequest,
    ExtractResponse,
    HealthResponse,
    ModelsResponse,
)

app = FastAPI(title="Ollama Chatbot API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    status, detail = await check_ollama()
    if status == "ok":
        return HealthResponse(status="ok", ollama="reachable", model=detail)
    if status == "model_missing":
        return HealthResponse(
            status="degraded",
            ollama="reachable",
            model=f"{detail} (not pulled)",
        )
    return HealthResponse(status="error", ollama="unreachable", model=detail)


@app.get("/api/models", response_model=ModelsResponse)
async def models() -> ModelsResponse:
    try:
        names = await list_local_models()
        return ModelsResponse(models=names)
    except HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Ollama unreachable: {exc}") from exc


@app.post("/api/extract", response_model=ExtractResponse)
async def extract(file: UploadFile = File(...)) -> ExtractResponse:
    data = await file.read()
    try:
        result = extract_document(
            filename=file.filename or "upload",
            data=data,
            content_type=file.content_type,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=400,
            detail=f"Failed to extract file: {exc}",
        ) from exc
    return ExtractResponse(**result)


@app.post("/api/chat")
async def chat(request: ChatRequest) -> StreamingResponse:
    messages = [m.model_dump(exclude_none=True) for m in request.messages]
    model = request.model or OLLAMA_MODEL

    async def event_stream():
        try:
            async for token in stream_chat(messages, model=model):
                payload = json.dumps({"content": token})
                yield f"data: {payload}\n\n"
            yield "data: [DONE]\n\n"
        except HTTPError as exc:
            error = json.dumps({"error": str(exc)})
            yield f"data: {error}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as exc:  # noqa: BLE001
            error = json.dumps({"error": str(exc)})
            yield f"data: {error}\n\n"
            yield "data: [DONE]\n\n"

    if not messages:
        raise HTTPException(status_code=400, detail="messages required")

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
