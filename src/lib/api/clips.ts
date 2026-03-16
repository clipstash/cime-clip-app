import { API_URL } from './config';

export type Clip = {
  id: string;
  platform: string;
  status: string;
  title?: string;
  streamer?: string;
  start_time: number;
  end_time: number;
  file_url?: string | null;
  file_size?: number;
  error_message?: string | null;
};

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
