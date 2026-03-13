const API_URL = '/api/v1';

export type Video = {
  id: string;
  url: string;
  total_time?: string | null;
  status?: string;
  title?: string;
  file_size?: number;
  s3_url?: string;
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
  if (!res.ok) throw new Error('요청 실패');
}

export async function deleteVideo(id: string): Promise<void> {
  const res = await fetch(`${API_URL}/videos/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('삭제 실패');
}
