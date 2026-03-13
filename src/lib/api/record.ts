const API_URL = '/api/v1';

export type ActiveRecord = {
  filename: string;
  url?: string;
  [key: string]: unknown;
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
