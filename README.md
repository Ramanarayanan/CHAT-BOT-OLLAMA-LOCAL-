# Ollama Chatbot

Local chat app with a React UI, FastAPI backend, and [Ollama](https://ollama.com) as the LLM.

## Prerequisites

- [Node.js](https://nodejs.org/) 18+
- Python 3.10+
- [Ollama](https://ollama.com/download) installed and running

Pull a model (default used by this app):

```bash
ollama pull gemma4:12b
```

## Backend

```bash
cd backend
python -m venv .venv

# Windows
.venv\Scripts\activate

# macOS / Linux
# source .venv/bin/activate

pip install -r requirements.txt
copy .env.example .env   # Windows
# cp .env.example .env   # macOS / Linux

uvicorn app.main:app --reload --port 8000
```

Optional env vars in `backend/.env`:

| Variable | Default | Description |
| --- | --- | --- |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama API base URL |
| `OLLAMA_MODEL` | `gemma4:12b` | Model name for chat |

Health check: [http://localhost:8000/api/health](http://localhost:8000/api/health)

## Frontend

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). Vite proxies `/api` to the FastAPI server on port 8000.

## How it works

1. The UI keeps conversation history in memory and POSTs the full message list to `/api/chat`.
2. FastAPI streams tokens from Ollama’s `/api/chat` endpoint as Server-Sent Events.
3. The React client appends each token to the assistant bubble as it arrives.
4. Images (composer attach or header **Profile** upload) are sent as base64 in Ollama’s `images` field for vision analysis. Use a multimodal model (e.g. `gemma4:12b`, `llava`).
5. PDF/CSV uploads go to `POST /api/extract`; extracted text is embedded in the chat prompt for the LLM (truncated at ~80k characters).

### UI tips

- Hover a message and click **Copy** to copy its text.
- Use the image button in the composer to attach up to 3 images.
- Use the document button to attach PDF or CSV files for analysis (up to 2).
- Use **Profile → Upload & analyze** to set an avatar and run image analysis.
