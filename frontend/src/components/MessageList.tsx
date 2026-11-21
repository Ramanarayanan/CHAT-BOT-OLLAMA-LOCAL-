import { useState } from "react";
import type { ChatMessage } from "../api/chat";

interface MessageListProps {
  messages: ChatMessage[];
  streaming: boolean;
}

export function MessageList({ messages, streaming }: MessageListProps) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  if (messages.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-orb" aria-hidden="true" />
        <p className="empty-title">Start a conversation</p>
        <p className="empty-subtitle">
          Chat with your local model. Attach images, PDFs, or CSV files to
          analyze — or set a profile photo in the header.
        </p>
      </div>
    );
  }

  async function copyMessage(content: string, index: number) {
    if (!content.trim()) return;
    try {
      await navigator.clipboard.writeText(content);
      setCopiedIndex(index);
      window.setTimeout(
        () => setCopiedIndex((prev) => (prev === index ? null : prev)),
        1600,
      );
    } catch {
      // clipboard may be blocked
    }
  }

  return (
    <div className="message-list" role="log" aria-live="polite">
      {messages.map((message, index) => {
        const isLastAssistant =
          streaming &&
          message.role === "assistant" &&
          index === messages.length - 1;
        const canCopy = Boolean(message.content.trim()) && !isLastAssistant;

        return (
          <div
            key={`${message.role}-${index}`}
            className={`message message-${message.role}`}
          >
            <div className="message-meta">
              <span className="message-role">
                {message.role === "user" ? "You" : "Assistant"}
              </span>
              {canCopy && (
                <button
                  type="button"
                  className="copy-btn"
                  onClick={() => copyMessage(message.content, index)}
                  aria-label="Copy message"
                >
                  {copiedIndex === index ? "Copied" : "Copy"}
                </button>
              )}
            </div>
            <div className="message-bubble">
              {message.images?.map((src, imgIndex) => (
                <img
                  key={`${index}-img-${imgIndex}`}
                  src={src}
                  alt="Attached"
                  className="message-image"
                />
              ))}
              {message.documents?.length ? (
                <div className="message-docs">
                  {message.documents.map((doc, docIndex) => (
                    <div
                      key={`${index}-doc-${docIndex}`}
                      className="message-doc-chip"
                    >
                      <span className="doc-kind">{doc.kind.toUpperCase()}</span>
                      <span className="doc-name">{doc.name}</span>
                      {doc.truncated && (
                        <span className="doc-flag">truncated</span>
                      )}
                    </div>
                  ))}
                </div>
              ) : null}
              {(message.content || isLastAssistant) && (
                <div className="message-text">
                  {message.content || (isLastAssistant ? "" : "…")}
                  {isLastAssistant && (
                    <span className="cursor" aria-hidden="true" />
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
