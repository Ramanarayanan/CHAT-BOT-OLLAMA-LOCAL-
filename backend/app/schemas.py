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


class ModelInfo(BaseModel):
    name: str
    capabilities: list[str] = Field(default_factory=list)


class ModelsResponse(BaseModel):
    models: list[ModelInfo]


class ExtractResponse(BaseModel):
    filename: str
    kind: Literal["pdf", "csv"]
    text: str
    truncated: bool
    char_count: int
