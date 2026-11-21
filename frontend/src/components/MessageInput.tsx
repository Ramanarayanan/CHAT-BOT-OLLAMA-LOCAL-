import { useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import {
  extractDocument,
  readImageAsDataUrl,
  type AttachedDocument,
} from "../api/chat";

export interface SendPayload {
  text: string;
  images: string[];
  documents: AttachedDocument[];
}

interface MessageInputProps {
  disabled: boolean;
  onSend: (payload: SendPayload) => void;
}

export function MessageInput({ disabled, onSend }: MessageInputProps) {
  const [value, setValue] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [documents, setDocuments] = useState<AttachedDocument[]>([]);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const imageRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);

  function submit() {
    const trimmed = value.trim();
    if (disabled || extracting) return;
    if (!trimmed && images.length === 0 && documents.length === 0) return;

    let defaultText = "Ask anything…";
    if (!trimmed) {
      if (documents.length && images.length) {
        defaultText = "Analyze the attached image(s) and document(s).";
      } else if (documents.length) {
        defaultText =
          documents[0].kind === "csv"
            ? "Analyze this CSV. Summarize columns, notable patterns, outliers, and key insights."
            : "Analyze this PDF. Summarize the document and highlight key points.";
      } else {
        defaultText = "Analyze this image in detail.";
      }
    }

    onSend({
      text: trimmed || defaultText,
      images,
      documents,
    });
    setValue("");
    setImages([]);
    setDocuments([]);
    setAttachError(null);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    submit();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  async function handleImages(fileList: FileList | null) {
    if (!fileList?.length) return;
    setAttachError(null);
    try {
      const next: string[] = [];
      for (const file of Array.from(fileList).slice(0, 3)) {
        next.push(await readImageAsDataUrl(file));
      }
      setImages((prev) => [...prev, ...next].slice(0, 3));
    } catch (err) {
      setAttachError((err as Error).message);
    } finally {
      if (imageRef.current) imageRef.current.value = "";
    }
  }

  async function handleDocuments(fileList: FileList | null) {
    if (!fileList?.length) return;
    setAttachError(null);
    setExtracting(true);
    try {
      const next: AttachedDocument[] = [];
      for (const file of Array.from(fileList).slice(0, 2)) {
        next.push(await extractDocument(file));
      }
      setDocuments((prev) => [...prev, ...next].slice(0, 2));
    } catch (err) {
      setAttachError((err as Error).message);
    } finally {
      setExtracting(false);
      if (docRef.current) docRef.current.value = "";
    }
  }

  function removeImage(index: number) {
    setImages((prev) => prev.filter((_, i) => i !== index));
  }

  function removeDocument(index: number) {
    setDocuments((prev) => prev.filter((_, i) => i !== index));
  }

  const canSend =
    !disabled &&
    !extracting &&
    (Boolean(value.trim()) || images.length > 0 || documents.length > 0);

  return (
    <form className="composer" onSubmit={handleSubmit}>
      {(images.length > 0 || documents.length > 0) && (
        <div className="attach-preview-row">
          {images.map((src, index) => (
            <div key={`${src.slice(0, 32)}-${index}`} className="attach-chip">
              <img src={src} alt={`Attachment ${index + 1}`} />
              <button
                type="button"
                className="attach-remove"
                onClick={() => removeImage(index)}
                aria-label="Remove image"
                disabled={disabled}
              >
                ×
              </button>
            </div>
          ))}
          {documents.map((doc, index) => (
            <div key={`${doc.name}-${index}`} className="doc-chip">
              <span className="doc-kind">{doc.kind.toUpperCase()}</span>
              <span className="doc-name" title={doc.name}>
                {doc.name}
              </span>
              {doc.truncated && <span className="doc-flag">truncated</span>}
              <button
                type="button"
                className="attach-remove doc-remove"
                onClick={() => removeDocument(index)}
                aria-label={`Remove ${doc.name}`}
                disabled={disabled || extracting}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {attachError && <p className="attach-error">{attachError}</p>}
      {extracting && <p className="attach-hint">Extracting document…</p>}

      <div className="composer-row">
        <input
          ref={imageRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => handleImages(e.target.files)}
        />
        <input
          ref={docRef}
          type="file"
          accept=".pdf,.csv,application/pdf,text/csv"
          multiple
          hidden
          onChange={(e) => handleDocuments(e.target.files)}
        />

        <button
          type="button"
          className="icon-btn"
          onClick={() => imageRef.current?.click()}
          disabled={disabled || extracting || images.length >= 3}
          title="Upload image"
          aria-label="Upload image"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path
              fill="currentColor"
              d="M19 7v2.99s-1.99.01-2 0V7h-3s.01-1.99 0-2h3V2h2v3h3v2h-3zm-3 4V8h-3V5H5c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2v-8h-3zM5 19l3-4 2 3 3-4 4 5H5z"
            />
          </svg>
        </button>

        <button
          type="button"
          className="icon-btn"
          onClick={() => docRef.current?.click()}
          disabled={disabled || extracting || documents.length >= 2}
          title="Upload PDF or CSV to analyze"
          aria-label="Upload PDF or CSV to analyze"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path
              fill="currentColor"
              d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11zM8 15h8v2H8v-2zm0-4h8v2H8v-2z"
            />
          </svg>
        </button>

        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            documents.length
              ? "Ask about the PDF/CSV…"
              : images.length
                ? "Ask about the image…"
                : "Ask anything, or attach image / PDF / CSV…"
          }
          rows={1}
          disabled={disabled || extracting}
          aria-label="Message"
        />

        <button type="submit" className="send-btn" disabled={!canSend}>
          {disabled ? "Thinking…" : extracting ? "Reading…" : "Send"}
        </button>
      </div>
    </form>
  );
}
