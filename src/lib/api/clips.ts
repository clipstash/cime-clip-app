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
  streamer: string | null;
  duration: number | null; // seconds, null for live streams
  thumbnail: string | null;
  m3u8_url: string | null;
  is_live: boolean; // 백엔드가 명시적으로 라이브 여부를 알려주는 필드
};

export async function fetchClipInfo(url: string): Promise<ClipInfo | null> {
  try {
    const res = await fetch(`/clips/info?url=${encodeURIComponent(url)}`);
    if (!res.ok) return null;
    const data = await res.json();
    const raw = data.duration;
    const duration = typeof raw === 'number' && isFinite(raw) && raw > 0 ? Math.floor(raw) : null;
    // 백엔드 is_live 필드 우선, 없으면 duration으로 추론
    const is_live = typeof data.is_live === 'boolean' ? data.is_live : duration === null;
    return { title: data.title ?? null, streamer: data.streamer ?? null, duration, thumbnail: data.thumbnail ?? null, m3u8_url: data.m3u8_url ?? null, is_live };
  } catch {
    return null;
  }
}
