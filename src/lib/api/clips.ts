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

export async function deleteClip(id: string): Promise<void> {
  const res = await fetch(`${API_URL}/clips/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.detail ?? '삭제 실패');
  }
}
