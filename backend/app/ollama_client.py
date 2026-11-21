import json
import os
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any

import httpx
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434").rstrip("/")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "gemma4:12b")


async def stream_chat(
    messages: list[dict[str, Any]],
    model: str | None = None,
) -> AsyncIterator[str]:
    """Stream assistant tokens from Ollama's /api/chat endpoint."""
    payload: dict[str, Any] = {
        "model": model or OLLAMA_MODEL,
        "messages": messages,
        "stream": True,
    }

    # Vision / large payloads can take longer than plain text.
    timeout = httpx.Timeout(300.0, connect=10.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        async with client.stream(
            "POST",
            f"{OLLAMA_BASE_URL}/api/chat",
            json=payload,
        ) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                if not line.strip():
                    continue
                data = json.loads(line)
                if data.get("error"):
                    raise RuntimeError(str(data["error"]))
                if data.get("done"):
                    break
                content = data.get("message", {}).get("content")
                if content:
                    yield content


async def check_ollama(model: str | None = None) -> tuple[str, str]:
    """Return (status, detail) for Ollama reachability and model presence."""
    target_model = model or OLLAMA_MODEL
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(f"{OLLAMA_BASE_URL}/api/tags")
            response.raise_for_status()
            models = response.json().get("models", [])
            names = {m.get("name", "") for m in models}
            target_aliases = {
                target_model,
                f"{target_model}:latest",
            }
            if ":latest" in target_model:
                target_aliases.add(target_model.removesuffix(":latest"))
            found = any(name in target_aliases for name in names if name)
            if found:
                return "ok", target_model
            return "model_missing", target_model
    except httpx.HTTPError as exc:
        return "unreachable", str(exc)
