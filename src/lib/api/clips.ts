const API_URL = '/api/v1';

export type Clip = {
  id: string;
  platform: string;
  status: string;
  title?: string;
  streamer?: string;
  start_time: number;
  end_time: number;
  file_size?: number;
  s3_url?: string;
  error_message?: string;
};

export async function getClips(): Promise<Clip[]> {
  const res = await fetch(`${API_URL}/clips`);
  return res.json();
}

export async function createClip(url: string, startTime: number, endTime: number): Promise<void> {
  const res = await fetch(`${API_URL}/clips`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, start_time: startTime, end_time: endTime })
  });
  if (!res.ok) throw new Error('요청 실패');
}

export async function deleteClip(id: string): Promise<void> {
  const res = await fetch(`${API_URL}/clips/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('삭제 실패');
}
