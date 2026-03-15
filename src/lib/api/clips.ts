import { API_URL } from './config';

export type Clip = {
  id: string;
  platform: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  title?: string;
  streamer?: string;
  start_time: number;
  end_time: number;
  file_size?: number;
  file_url?: string;
  error_message?: string;
};

export async function getClips(): Promise<Clip[]> {
  const res = await fetch(`${API_URL}/clips`);
  if (!res.ok) return [];
  return res.json();
}

export async function createClip(url: string, startTime: number, endTime: number): Promise<void> {
  const res = await fetch(`${API_URL}/clips`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, start_time: startTime, end_time: endTime })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.detail ?? '요청 실패');
  }
}

export type ClipInfo = {
  title: string | null;
  duration: number | null; // seconds, null for live streams
  thumbnail: string | null;
};

export async function fetchClipInfo(url: string): Promise<ClipInfo> {
  try {
    const res = await fetch(`${API_URL}/clips/info?url=${encodeURIComponent(url)}`);
    if (!res.ok) return { title: null, duration: null, thumbnail: null };
    const data = await res.json();
    const raw = data.duration;
    const duration = typeof raw === 'number' && isFinite(raw) && raw > 0 ? Math.floor(raw) : null;
    return { title: data.title ?? null, duration, thumbnail: data.thumbnail ?? null };
  } catch {
    return { title: null, duration: null, thumbnail: null };
  }
}

export async function deleteClip(id: string): Promise<void> {
  const res = await fetch(`${API_URL}/clips/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.detail ?? '삭제 실패');
  }
}
