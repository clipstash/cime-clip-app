import { API_URL } from './config';

export type Video = {
  id: string;
  url: string;
  total_time?: string | null;
  status?: string;
  title?: string;
  file_size?: string | number;
  file_url?: string;
  error_message?: string;
  [key: string]: unknown;
};

export async function getVideos(skip = 0, limit = 20): Promise<Video[]> {
  const res = await fetch(`${API_URL}/videos?skip=${skip}&limit=${limit}`);
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function createVideo(url: string, total_time: string | null): Promise<void> {
  const res = await fetch(`${API_URL}/videos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, total_time })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.detail ?? '요청 실패');
  }
}

export async function deleteVideo(id: string): Promise<void> {
  const res = await fetch(`${API_URL}/videos/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.detail ?? '삭제 실패');
  }
}
