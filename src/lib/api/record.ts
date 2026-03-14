const API_URL = '/api/v1';

export type ActiveRecord = {
  filename: string;
  url?: string;
  [key: string]: unknown;
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

export async function startRecord(url: string, file_name: string): Promise<void> {
  const res = await fetch(`${API_URL}/record/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, filename: file_name })
  });
  if (!res.ok) throw new Error('녹화 시작 실패');
}

export async function stopRecord(filename: string): Promise<void> {
  const res = await fetch(`${API_URL}/record/stop/${encodeURIComponent(filename)}`, {
    method: 'POST'
  });
  if (!res.ok) throw new Error('녹화 중지 실패');
}

export async function getActiveRecords(): Promise<ActiveRecord[]> {
  const res = await fetch(`${API_URL}/record/active`);
  if (!res.ok) return [];
  const data = await res.json();
  const list: string[] = Array.isArray(data?.active_list) ? data.active_list : [];
  return list.map((filename) => ({ filename }));
}

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
  if (!res.ok) throw new Error('스케줄 생성 실패');
  return res.json();
}

export async function cancelSchedule(schedule_id: string): Promise<void> {
  const res = await fetch(`${API_URL}/record/schedule/${encodeURIComponent(schedule_id)}`, {
    method: 'DELETE'
  });
  if (!res.ok) throw new Error('스케줄 취소 실패');
}
