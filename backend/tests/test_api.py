import unittest
from unittest.mock import AsyncMock, patch

import httpx
from fastapi.testclient import TestClient

from app.main import app


class ApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(app)

    def test_api_docs_and_openapi_include_model_capabilities(self) -> None:
        docs_response = self.client.get("/api/docs")
        openapi_response = self.client.get("/openapi.json")

        self.assertEqual(docs_response.status_code, 200)
        self.assertIn("swagger-ui", docs_response.text)
        self.assertEqual(openapi_response.status_code, 200)
        schema = openapi_response.json()
        self.assertIn("/api/models", schema["paths"])
        self.assertIn(
            "capabilities",
            schema["components"]["schemas"]["ModelInfo"]["properties"],
        )

    def test_health_reports_missing_model_as_degraded(self) -> None:
        with patch(
            "app.main.check_ollama",
            new_callable=AsyncMock,
            return_value=("model_missing", "gemma4:12b"),
        ):
            response = self.client.get("/api/health")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {
                "status": "degraded",
                "ollama": "reachable",
                "model": "gemma4:12b (not pulled)",
            },
        )

    def test_health_reports_unreachable_ollama_as_error(self) -> None:
        with patch(
            "app.main.check_ollama",
            new_callable=AsyncMock,
            return_value=("unreachable", "connection refused"),
        ):
            response = self.client.get("/api/health")

        self.assertEqual(response.json()["status"], "error")
        self.assertEqual(response.json()["ollama"], "unreachable")

    def test_models_returns_capabilities(self) -> None:
        models = [
            {
                "name": "gemma4:12b",
                "capabilities": ["audio", "completion", "vision"],
            }
        ]
        with patch(
            "app.main.list_local_models",
            new_callable=AsyncMock,
            return_value=models,
        ):
            response = self.client.get("/api/models")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"models": models})

    def test_models_reports_ollama_errors_as_bad_gateway(self) -> None:
        with patch(
            "app.main.list_local_models",
            new_callable=AsyncMock,
            side_effect=httpx.ConnectError("connection refused"),
        ):
            response = self.client.get("/api/models")

        self.assertEqual(response.status_code, 502)
        self.assertIn("Ollama unreachable", response.json()["detail"])

    def test_chat_streams_tokens_and_done_event(self) -> None:
        async def fake_stream_chat(messages: list[dict], model: str | None = None):
            yield "Hello"
            yield "!"

        request = {
            "messages": [{"role": "user", "content": "Hi"}],
            "model": "gemma4:12b",
        }
        with patch("app.main.stream_chat", side_effect=fake_stream_chat) as stream:
            response = self.client.post("/api/chat", json=request)

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.headers["content-type"].startswith("text/event-stream"))
        self.assertIn('data: {"content": "Hello"}', response.text)
        self.assertIn('data: {"content": "!"}', response.text)
        self.assertIn("data: [DONE]", response.text)
        stream.assert_called_once_with(request["messages"], model="gemma4:12b")

    def test_chat_rejects_empty_messages(self) -> None:
        response = self.client.post("/api/chat", json={"messages": []})

        self.assertEqual(response.status_code, 422)

    def test_extract_returns_csv_text(self) -> None:
        response = self.client.post(
            "/api/extract",
            files={"file": ("items.csv", b"name,count\napples,3\n", "text/csv")},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["filename"], "items.csv")
        self.assertEqual(response.json()["kind"], "csv")
        self.assertIn("apples, 3", response.json()["text"])

    def test_extract_rejects_unsupported_file_type(self) -> None:
        response = self.client.post(
            "/api/extract",
            files={"file": ("notes.txt", b"not supported", "text/plain")},
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("Unsupported file type", response.json()["detail"])


if __name__ == "__main__":
    unittest.main()
