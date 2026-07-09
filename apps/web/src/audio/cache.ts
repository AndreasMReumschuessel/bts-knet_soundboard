import { API_BASE } from "../config";

const CACHE_NAME = "bts-sounds";

function openCache(): Promise<Cache> {
  if (typeof caches === "undefined") {
    return Promise.reject(new Error("Cache API unavailable"));
  }
  return caches.open(CACHE_NAME);
}

export function key(id: string): string {
  return `${API_BASE}/sounds/${id}/file`;
}

export async function getBuffer(id: string): Promise<ArrayBuffer> {
  const url = key(id);
  const cache = await openCache();
  const cached = await cache.match(url);
  if (cached) {
    return await cached.arrayBuffer();
  }
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch sound ${id}: ${res.status}`);
  }
  await cache.put(url, res.clone());
  return await res.arrayBuffer();
}

export async function deleteSound(id: string): Promise<void> {
  try {
    const cache = await openCache();
    await cache.delete(key(id));
  } catch {
    // Cache unavailable; nothing to evict.
  }
}
