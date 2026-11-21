import { useRef, useState } from "react";
import { readImageAsDataUrl } from "../api/chat";

const PROFILE_KEY = "ollama-chat-profile";

interface ProfileUploadProps {
  disabled?: boolean;
  onAnalyze: (imageDataUrl: string) => void;
}

function loadStoredProfile(): string | null {
  try {
    return localStorage.getItem(PROFILE_KEY);
  } catch {
    return null;
  }
}

export function ProfileUpload({ disabled, onAnalyze }: ProfileUploadProps) {
  const [avatar, setAvatar] = useState<string | null>(() => loadStoredProfile());
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) return;
    setError(null);
    try {
      const dataUrl = await readImageAsDataUrl(file);
      setAvatar(dataUrl);
      try {
        localStorage.setItem(PROFILE_KEY, dataUrl);
      } catch {
        // The in-memory avatar should still work if browser storage is unavailable.
      }
      onAnalyze(dataUrl);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="profile-upload">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => handleFile(e.target.files)}
      />
      <button
        type="button"
        className="profile-btn"
        onClick={() => fileRef.current?.click()}
        disabled={disabled}
        title="Upload profile image to analyze"
        aria-label="Upload profile image to analyze"
      >
        {avatar ? (
          <img src={avatar} alt="" className="profile-avatar" />
        ) : (
          <span className="profile-placeholder" aria-hidden="true">
            +
          </span>
        )}
        <span className="profile-label">
          <strong>Profile</strong>
          <small>Upload & analyze</small>
        </span>
      </button>
      {error && <span className="profile-error">{error}</span>}
    </div>
  );
}
