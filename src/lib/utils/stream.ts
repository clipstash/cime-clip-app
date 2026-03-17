import { API_URL } from '$lib/api/config';

export type M3u8Info = {
  initUrl: string | null;
  segments: string[];
  durations: number[];
};

export async function parseM3u8(m3u8Url: string): Promise<M3u8Info> {
  const proxyUrl = `${API_URL}/stream/proxy?url=${encodeURIComponent(m3u8Url)}`;
  const res = await fetch(proxyUrl);
  if (!res.ok) return { initUrl: null, segments: [], durations: [] };
  const text = await res.text();
  const base = m3u8Url.substring(0, m3u8Url.lastIndexOf('/') + 1);

  // Master playlist: contains #EXT-X-STREAM-INF → follow the first sub-playlist
  if (text.includes('#EXT-X-STREAM-INF')) {
    const lines = text.split('\n').map((l) => l.trim());
    for (const line of lines) {
      if (line && !line.startsWith('#')) {
        const subUrl = line.startsWith('http') ? line : base + line;
        return parseM3u8(subUrl);
      }
    }
    return { initUrl: null, segments: [], durations: [] };
  }

  // Extract fMP4 init section (#EXT-X-MAP:URI="...")
  let initUrl: string | null = null;
  const mapMatch = text.match(/#EXT-X-MAP:URI="([^"]+)"/);
  if (mapMatch) {
    const raw = mapMatch[1];
    initUrl = raw.startsWith('http') ? raw : base + raw;
  }

  const lines = text.split('\n').map((line) => line.trim());
  const segments: string[] = [];
  const durations: number[] = [];
  let nextDuration = 0;

  for (const line of lines) {
    if (line.startsWith('#EXTINF:')) {
      nextDuration = parseFloat(line.slice(8).split(',')[0]) || 0;
    } else if (line && !line.startsWith('#')) {
      segments.push(line.startsWith('http') ? line : base + line);
      durations.push(nextDuration);
      nextDuration = 0;
    }
  }

  return { initUrl, segments, durations };
}
