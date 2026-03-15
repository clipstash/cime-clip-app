import { API_URL } from './config';

export type ActiveRecord = {
  id: string;
  filename: string;
  url: string;
  status: 'processing' | 'completed' | 'failed' | 'stopping';
  file_url?: string | null;
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

export async function fetchStreamTitle(url: string): Promise<string | null> {
  try {
    const res = await fetch(`${API_URL}/record/title?url=${encodeURIComponent(url)}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.filename ?? null;
  } catch {
    return null;
  }
}

export async function startRecord(url: string, file_name: string): Promise<ActiveRecord> {
  const res = await fetch(`${API_URL}/record/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, filename: file_name })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.detail ?? '녹화 시작 실패');
  }
  return res.json();
}

export async function stopRecord(filename: string): Promise<ActiveRecord> {
  const res = await fetch(`${API_URL}/record/stop/${encodeURIComponent(filename)}`, {
    method: 'POST'
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.detail ?? '녹화 중지 실패');
  }
  return res.json();
}

export async function getRecord(id: string): Promise<ActiveRecord | null> {
  const res = await fetch(`${API_URL}/record/${encodeURIComponent(id)}`);
  if (!res.ok) return null;
  return res.json();
}

export async function getActiveRecords(): Promise<{ active: ActiveRecord[]; paused: Set<string> }> {
  const res = await fetch(`${API_URL}/record/active`);
  if (!res.ok) return { active: [], paused: new Set() };
  const data = await res.json();
  const list: string[] = Array.isArray(data?.active_list) ? data.active_list : [];
  const pausedList: string[] = Array.isArray(data?.paused_list) ? data.paused_list : [];
  return {
    active: list.map((filename) => ({ id: '', filename, url: '', status: 'processing', error_message: null, started_at: null })),
    paused: new Set(pausedList),
  };
}

export async function pauseRecord(filename: string): Promise<ActiveRecord> {
  const res = await fetch(`${API_URL}/record/pause/${encodeURIComponent(filename)}`, { method: 'POST' });
  if (!res.ok) { const err = await res.json().catch(() => null); throw new Error(err?.detail ?? '일시멈춤 실패'); }
  return res.json();
}

export async function resumeRecord(filename: string): Promise<ActiveRecord> {
  const res = await fetch(`${API_URL}/record/resume/${encodeURIComponent(filename)}`, { method: 'POST' });
  if (!res.ok) { const err = await res.json().catch(() => null); throw new Error(err?.detail ?? '재개 실패'); }
  return res.json();
}

export async function cancelRecord(filename: string): Promise<ActiveRecord> {
  const res = await fetch(`${API_URL}/record/cancel/${encodeURIComponent(filename)}`, { method: 'POST' });
  if (!res.ok) { const err = await res.json().catch(() => null); throw new Error(err?.detail ?? '취소 실패'); }
  return res.json();
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
