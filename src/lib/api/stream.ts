import { API_URL } from './config';

export async function parseM3u8(m3u8Url: string): Promise<string[]> {
  const proxyUrl = `${API_URL}/proxy?url=${encodeURIComponent(m3u8Url)}`;
  const res = await fetch(proxyUrl);
  if (!res.ok) return [];
  const text = await res.text();
  const base = m3u8Url.substring(0, m3u8Url.lastIndexOf('/') + 1);
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => (line.startsWith('http') ? line : base + line));
}
