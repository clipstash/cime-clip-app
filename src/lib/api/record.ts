import { API_URL } from './config';

export type ActiveRecord = {
  id: string;
  filename: string;
  url: string;
  status: string;
  file_url: string | null;
  error_message: string | null;
  started_at: string | null;
};

export type RecordSchedule = {
  id: string;
  url: string;
  filename: string;
  scheduled_at: string;
  duration: number | null;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  recording_id: string | null;
  created_at: string;
};

export async function getSchedules(skip = 0, limit = 20): Promise<RecordSchedule[]> {
  const res = await fetch(`${API_URL}/record/schedule?skip=${skip}&limit=${limit}`);
  if (!res.ok) return [];
  return res.json();
}

export async function createSchedule(
  url: string,
  filename: string,
  scheduled_at: string,
  duration?: number | null
): Promise<RecordSchedule> {
  const res = await fetch(`${API_URL}/record/schedule`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, filename, scheduled_at, duration: duration ?? null })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.detail ?? '스케줄 생성 실패');
  }
  return res.json();
}

export async function cancelSchedule(schedule_id: string): Promise<void> {
  const res = await fetch(`${API_URL}/record/schedule/${encodeURIComponent(schedule_id)}`, {
    method: 'DELETE'
  });
  if (!res.ok) throw new Error('스케줄 취소 실패');
}
