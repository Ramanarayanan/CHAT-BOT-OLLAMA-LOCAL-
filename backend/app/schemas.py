from typing import Literal

from pydantic import BaseModel, Field


class ChatMessage(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str
    images: list[str] | None = None


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(..., min_length=1)
    model: str | None = None


class HealthResponse(BaseModel):
    status: str
    ollama: str
    model: str


class ExtractResponse(BaseModel):
    filename: str
    kind: Literal["pdf", "csv"]
    text: str
    truncated: bool
    char_count: int
