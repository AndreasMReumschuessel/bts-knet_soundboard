import { useState } from "react";
import type { FormEvent } from "react";

import { MAX_UPLOAD_BYTES, SUPPORTED_MIME } from "@bts-soundboard/shared";

import { uploadSound } from "../api/sounds";

interface UploadBarProps {
  onToast: (message: string, kind?: "info" | "error") => void;
}

export function UploadBar({ onToast }: UploadBarProps): JSX.Element {
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!file) {
      onToast("Choose a file first", "error");
      return;
    }
    if (file.type !== SUPPORTED_MIME) {
      const got = file.type || "unknown";
      onToast(`Unsupported file type: ${got}. Expected ${SUPPORTED_MIME}.`, "error");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      const maxMiB = (MAX_UPLOAD_BYTES / (1024 * 1024)).toFixed(0);
      onToast(`File too large (${(file.size / (1024 * 1024)).toFixed(1)} MiB). Maximum is ${maxMiB} MiB.`, "error");
      return;
    }
    setUploading(true);
    try {
      const sound = await uploadSound(file, name.trim() || undefined);
      onToast(`Uploaded: ${sound.name}`);
      setName("");
      setFile(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed";
      onToast(message, "error");
    } finally {
      setUploading(false);
    }
  }

  return (
    <form className="upload-bar" onSubmit={handleSubmit}>
      <input
        type="text"
        className="upload-name"
        placeholder="Name (optional)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        aria-label="Sound name (optional)"
      />
      <label className="upload-file-label">
        <input
          type="file"
          accept="audio/mpeg"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="upload-file"
          aria-label="Choose audio file"
        />
        <span className="upload-file-name">{file ? file.name : "No file chosen"}</span>
      </label>
      <button type="submit" className="btn btn-primary" disabled={uploading || !file}>
        {uploading ? "Uploading\u2026" : "Upload"}
      </button>
    </form>
  );
}
