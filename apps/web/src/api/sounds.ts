import type { SoundMetadata } from "@bts-soundboard/shared";
import { SoundListResponseSchema, UploadResponseSchema } from "@bts-soundboard/shared";

import { API_BASE } from "../config";

export async function listSounds(): Promise<SoundMetadata[]> {
  const res = await fetch(`${API_BASE}/sounds`);
  if (!res.ok) throw new Error(`GET /sounds failed: ${res.status}`);
  const json: unknown = await res.json();
  const parsed = SoundListResponseSchema.parse(json);
  return parsed.sounds;
}

export function soundFileUrl(id: string): string {
  return `${API_BASE}/sounds/${id}/file`;
}

export async function uploadSound(file: File, name?: string, uploadedBy?: string): Promise<SoundMetadata> {
  const form = new FormData();
  form.append("file", file);
  if (name) form.append("name", name);
  if (uploadedBy) form.append("uploadedBy", uploadedBy);
  const res = await fetch(`${API_BASE}/sounds`, { method: "POST", body: form });
  if (!res.ok) throw new Error(`POST /sounds failed: ${res.status}`);
  const json: unknown = await res.json();
  const parsed = UploadResponseSchema.parse(json);
  return parsed.sound;
}

export async function deleteSound(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/sounds/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`DELETE /sounds/${id} failed: ${res.status}`);
}
