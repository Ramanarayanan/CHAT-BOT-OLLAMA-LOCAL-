export type Role = "system" | "user" | "assistant";

export type DocumentKind = "pdf" | "csv";

export interface AttachedDocument {
  name: string;
  kind: DocumentKind;
  text: string;
  truncated: boolean;
}

export interface ChatMessage {
  role: Role;
  content: string;
  /** Data-URL previews for UI (and source for Ollama base64). */
  images?: string[];
  /** Extracted document text sent to the model; UI shows chips only. */
  documents?: AttachedDocument[];
}

export interface StreamChatOptions {
  messages: ChatMessage[];
  model?: string;
  signal?: AbortSignal;
  onToken: (token: string) => void;
  onError?: (message: string) => void;
}

function toBase64Payload(dataUrl: string): string {
  const comma = dataUrl.indexOf(",");
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
}

function buildContent(message: ChatMessage): string {
  if (!message.documents?.length) return message.content;

  const blocks = message.documents.map((doc) => {
    const note = doc.truncated ? " [truncated]" : "";
    return `---\nFile: ${doc.name} (${doc.kind.toUpperCase()})${note}\n---\n${doc.text}`;
  });

  return `${message.content}\n\n${blocks.join("\n\n")}`;
}

function toApiMessages(messages: ChatMessage[]) {
  return messages.map((message) => {
    const payload: {
      role: Role;
      content: string;
      images?: string[];
    } = {
      role: message.role,
      content: buildContent(message),
    };
    if (message.images?.length) {
      payload.images = message.images.map(toBase64Payload);
    }
    return payload;
  });
}

export async function streamChat({
  messages,
  model,
  signal,
  onToken,
  onError,
}: StreamChatOptions): Promise<void> {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: toApiMessages(messages), model }),
    signal,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Chat request failed (${response.status})`);
  }

  if (!response.body) {
    throw new Error("No response body from server");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";

    for (const part of parts) {
      const lines = part.split("\n");
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]") return;

        try {
          const parsed = JSON.parse(data) as {
            content?: string;
            error?: string;
          };
          if (parsed.error) {
            onError?.(parsed.error);
            return;
          }
          if (parsed.content) {
            onToken(parsed.content);
          }
        } catch {
          // ignore malformed chunks
        }
      }
    }
  }
}

export function readImageAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("Please choose an image file"));
      return;
    }
    const maxBytes = 8 * 1024 * 1024;
    if (file.size > maxBytes) {
      reject(new Error("Image must be under 8MB"));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Failed to read image"));
    reader.readAsDataURL(file);
  });
}

export async function extractDocument(file: File): Promise<AttachedDocument> {
  const maxBytes = 10 * 1024 * 1024;
  if (file.size > maxBytes) {
    throw new Error("File must be under 10MB");
  }

  const form = new FormData();
  form.append("file", file);

  const response = await fetch("/api/extract", {
    method: "POST",
    body: form,
  });

  if (!response.ok) {
    let detail = `Extract failed (${response.status})`;
    try {
      const body = (await response.json()) as { detail?: string };
      if (body.detail) detail = body.detail;
    } catch {
      // keep default
    }
    throw new Error(detail);
  }

  const data = (await response.json()) as {
    filename: string;
    kind: DocumentKind;
    text: string;
    truncated: boolean;
  };

  return {
    name: data.filename,
    kind: data.kind,
    text: data.text,
    truncated: data.truncated,
  };
}
