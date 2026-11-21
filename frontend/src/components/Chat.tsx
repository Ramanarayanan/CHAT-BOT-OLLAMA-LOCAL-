import { useEffect, useRef, useState } from "react";
import { streamChat, type ChatMessage } from "../api/chat";
import { MessageInput, type SendPayload } from "./MessageInput";
import { MessageList } from "./MessageList";
import { ProfileUpload } from "./ProfileUpload";

export function Chat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [health, setHealth] = useState<string>("checking…");
  const [modelName, setModelName] = useState<string>("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/health")
      .then(async (res) => {
        const data = (await res.json()) as {
          status: string;
          ollama: string;
          model: string;
        };
        if (!cancelled) {
          setModelName(data.model);
          if (data.status === "ok") {
            setHealth("Online");
          } else if (data.status === "degraded") {
            setHealth("Model missing");
          } else {
            setHealth("Ollama offline");
          }
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHealth("Backend offline");
          setModelName("");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  async function runChat(nextMessages: ChatMessage[]) {
    setMessages([...nextMessages, { role: "assistant", content: "" }]);
    setStreaming(true);
    setError(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await streamChat({
        messages: nextMessages,
        signal: controller.signal,
        onToken: (token) => {
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last?.role === "assistant") {
              updated[updated.length - 1] = {
                ...last,
                content: last.content + token,
              };
            }
            return updated;
          });
        },
        onError: (message) => setError(message),
      });
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError((err as Error).message || "Something went wrong");
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.role === "assistant" && !last.content) {
            updated.pop();
          }
          return updated;
        });
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }

  async function handleSend({ text, images, documents }: SendPayload) {
    const userMessage: ChatMessage = {
      role: "user",
      content: text,
      ...(images.length ? { images } : {}),
      ...(documents.length ? { documents } : {}),
    };
    await runChat([...messages, userMessage]);
  }

  async function handleProfileAnalyze(imageDataUrl: string) {
    if (streaming) return;
    const userMessage: ChatMessage = {
      role: "user",
      content:
        "Analyze this profile image. Describe the person or subject, clothing, mood, setting, and any notable details.",
      images: [imageDataUrl],
    };
    await runChat([...messages, userMessage]);
  }

  function handleClear() {
    abortRef.current?.abort();
    setMessages([]);
    setError(null);
    setStreaming(false);
  }

  return (
    <div className="chat-shell">
      <div className="shell-glow" aria-hidden="true" />

      <header className="chat-header">
        <div className="brand-block">
          <p className="eyebrow">Local chat · vision & docs</p>
          <h1 className="brand">Ollama Chat</h1>
          <div className="status-row">
            <span
              className={`status-dot ${health === "Online" ? "is-live" : ""}`}
            />
            <span className="health">{health}</span>
            {modelName && <span className="model-pill">{modelName}</span>}
          </div>
        </div>

        <div className="header-actions">
          <ProfileUpload disabled={streaming} onAnalyze={handleProfileAnalyze} />
          <button
            type="button"
            className="ghost-btn"
            onClick={handleClear}
            disabled={messages.length === 0 && !streaming}
          >
            Clear
          </button>
        </div>
      </header>

      <main className="chat-main">
        <MessageList messages={messages} streaming={streaming} />
        <div ref={bottomRef} />
      </main>

      {error && <p className="error-banner">{error}</p>}

      <MessageInput disabled={streaming} onSend={handleSend} />
    </div>
  );
}
